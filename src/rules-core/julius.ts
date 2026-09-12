import type { GameState, PlayerState } from "../domain/state/types.ts";
import { StateRandom } from "../match-engine/random.ts";
import { deployPlayer, deployScheduledFollowers } from "./board.ts";
import type { CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";
import { drawCards, movePlayerCard } from "./decks.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const JULIUS_SKULK_ID = "master.julius.skill.s1";
export const JULIUS_AGING_ID = "master.julius.skill.s1a";
export const JULIUS_ASCENSION_ID = "master.julius.skill.ascension";

export const JULIUS_SKULK_HANDLER = "core.julius-skulk";
export const JULIUS_SKULK_TIMING_RESOLVE = "core.julius-skulk-timing-resolve";
export const JULIUS_SKULK_DEPLOY_RESOLVE = "core.julius-skulk-deploy-resolve";
export const JULIUS_AGING_HANDLER = "core.julius-rapid-aging";
export const JULIUS_AGING_MODE_RESOLVE = "core.julius-rapid-aging-mode-resolve";
export const JULIUS_AGING_REMOVE_RESOLVE = "core.julius-rapid-aging-remove-resolve";
export const JULIUS_ASCENSION_HANDLER = "core.julius-black-scorpion";

const SKULK_ROUND_FLAG = "juliusSkulkRound";
const SKULK_PHASE_FLAG = "juliusSkulkDeploymentPhase";
const BLACK_SCORPION_FLAG = "juliusBlackScorpionActive";

type DelayedDeploymentPhase = "action" | "combat";
type DeploymentLocation = "workshop" | "mountain" | "city";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function scheduleSkulk(state: GameState, player: PlayerState, phase: DelayedDeploymentPhase): void {
  player.flags.skipDeploymentRound = state.round;
  player.flags[SKULK_ROUND_FLAG] = state.round;
  player.flags[SKULK_PHASE_FLAG] = phase;
}

function skulkDueNow(state: GameState, player: PlayerState): boolean {
  return Number(player.flags[SKULK_ROUND_FLAG] ?? Number.NEGATIVE_INFINITY) === state.round
    && player.flags[SKULK_PHASE_FLAG] === state.phase
    && state.activePlayerId === player.id;
}

function candidateDeploymentLocations(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): DeploymentLocation[] {
  const base: DeploymentLocation[] = player.flags[BLACK_SCORPION_FLAG] === true
    ? ["workshop", "mountain", "city"]
    : ["mountain", "city"];
  return base.filter((locationId) => {
    const draft = structuredClone(state) as GameState;
    try {
      deployPlayer(draft, player.id, locationId, definitions, { bypassPhase: true, bypassActivePlayer: true });
      return true;
    } catch {
      return false;
    }
  });
}

function openSkulkDeploymentDecision(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const candidates = candidateDeploymentLocations(state, player, definitions);
  if (candidates.length === 0) throw new Error("JULIUS_SKULK_NO_DEPLOYMENT_DESTINATION");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skillId}:deploy`;
  state.effectQueue.unshift({
    effectId,
    handlerId: JULIUS_SKULK_DEPLOY_RESOLVE,
    sourceId: skillId,
    controllerPlayerId: player.id,
    payload: { candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "julius-skulk-deployment",
    options: candidates.map((id) => ({ id, label: id === "workshop" ? "魔术工房" : id === "mountain" ? "深山町" : "新都" })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

/** cc_skulk(): replace this round's ordinary Outpost deployment with a delayed personal-turn deployment. */
export const useJuliusSkulk: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("JULIUS_SKULK_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "phase.transitioned") {
    if (event.transition !== "next-phase" && event.transition !== "next-player") return;
    if (!skulkDueNow(state, player)) return;
    openSkulkDeploymentDecision(state, player, skill.id, definitions, openDecision);
    return;
  }

  if (state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("JULIUS_SKULK_WINDOW_INVALID");
  if (Number(player.flags.skipDeploymentRound ?? Number.NEGATIVE_INFINITY) === state.round) throw new Error("JULIUS_SKULK_ALREADY_USED");
  player.flags.skipDeploymentRound = state.round;
  if (player.flags[BLACK_SCORPION_FLAG] !== true) {
    scheduleSkulk(state, player, "action");
    return { deploymentPhase: "action" };
  }

  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:timing`;
  state.effectQueue.unshift({
    effectId,
    handlerId: JULIUS_SKULK_TIMING_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: {},
    createdAtRevision: state.revision,
  });
  const options = [{ id: "action", label: "行动阶段部署" }];
  if (player.mana >= 2 || player.flags.infiniteMana === true) options.push({ id: "combat", label: "支付2魔力，战斗阶段部署" });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "julius-skulk-timing",
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
};

export const resolveJuliusSkulkTiming: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.decision)) throw new Error("JULIUS_SKULK_TIMING_DECISION_INVALID");
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1 || (selections[0] !== "action" && selections[0] !== "combat")) {
    throw new Error("JULIUS_SKULK_TIMING_DECISION_INVALID");
  }
  const phase = selections[0] as DelayedDeploymentPhase;
  if (phase === "combat") payManaCost(state, player, 2, definitions, "JULIUS_SKULK_INSUFFICIENT_MANA");
  scheduleSkulk(state, player, phase);
  return { deploymentPhase: phase, paidMana: phase === "combat" ? 2 : 0 };
};

export const resolveJuliusSkulkDeployment: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("JULIUS_SKULK_DEPLOYMENT_DECISION_INVALID");
  }
  if (!skulkDueNow(state, player)) throw new Error("JULIUS_SKULK_DEPLOYMENT_NOT_DUE");
  const previous = payload.previous;
  const decision = payload.decision;
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is DeploymentLocation => id === "workshop" || id === "mountain" || id === "city") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0] as DeploymentLocation)) {
    throw new Error("JULIUS_SKULK_DEPLOYMENT_DECISION_INVALID");
  }
  const locationId = selections[0] as DeploymentLocation;
  if (!candidateDeploymentLocations(state, player, definitions).includes(locationId)) throw new Error("JULIUS_SKULK_DEPLOYMENT_DESTINATION_INVALID");
  const previousLocationId = player.locationId;
  deployPlayer(state, player.id, locationId, definitions, { bypassPhase: true, bypassActivePlayer: true });
  emitEvent?.("player.deployed", { playerId: player.id, locationId, sourceSkillId: skill.id, delayed: true });
  emitEvent?.("player.entered-location", { playerId: player.id, previousLocationId, locationId, method: "deploy", distance: 0, sourceSkillId: skill.id, delayed: true });
  for (const follower of deployScheduledFollowers(state, player.id, locationId, definitions, { bypassPhase: true })) {
    emitEvent?.("player.deployed", { playerId: follower.playerId, locationId: follower.locationId, forcedFollowPlayerId: player.id });
    emitEvent?.("player.entered-location", {
      playerId: follower.playerId,
      previousLocationId: follower.previousLocationId,
      locationId: follower.locationId,
      method: "deploy",
      distance: 0,
      forcedFollowPlayerId: player.id,
    });
  }
  delete player.flags.skipDeploymentRound;
  delete player.flags[SKULK_ROUND_FLAG];
  delete player.flags[SKULK_PHASE_FLAG];
  return { locationId };
};

export const isJuliusSkulkLegal: SkillLegalityPredicate = (state, playerId) => {
  const player = state.players[playerId];
  return Boolean(player && state.phase === "outpost" && state.activePlayerId === playerId
    && Number(player.flags.skipDeploymentRound ?? Number.NEGATIVE_INFINITY) !== state.round);
};

function randomDiscardAfterDrawIfNeeded(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  randomInt?: (maxExclusive: number) => number,
): { discardedInstanceId: string | null; drewFirst: boolean } {
  const random = new StateRandom();
  const choose = randomInt ?? ((maxExclusive: number) => random.integer(state, maxExclusive));
  let drewFirst = false;
  if (player.hand.length === 0) {
    drewFirst = true;
    drawCards(state, player.id, 1, choose, definitions);
  }
  if (player.hand.length === 0) return { discardedInstanceId: null, drewFirst };
  const index = choose(player.hand.length);
  if (!Number.isInteger(index) || index < 0 || index >= player.hand.length) throw new Error("JULIUS_AGING_RANDOM_INVALID");
  const instanceId = player.hand[index];
  movePlayerCard(state, player.id, instanceId, "discard");
  state.cards[instanceId].face = "down";
  state.cards[instanceId].active = false;
  return { discardedInstanceId: instanceId, drewFirst };
}

/** Rapid Aging: remove two chosen discard cards or randomly discard one; if the latter is impossible, draw first. */
export const useJuliusRapidAging: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision }) => {
  if (!definitions) throw new Error("JULIUS_AGING_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType !== "round.ending") return;
  if (player.discard.length < 2) return randomDiscardAfterDrawIfNeeded(state, player, definitions, randomInt);

  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:mode`;
  state.effectQueue.unshift({
    effectId,
    handlerId: JULIUS_AGING_MODE_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: {},
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "julius-rapid-aging-mode",
    options: [
      { id: "remove-two", label: "移除弃牌堆中的2张牌" },
      { id: "random-discard", label: "随机弃置1张手牌" },
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
};

export const resolveJuliusRapidAgingMode: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.decision)) throw new Error("JULIUS_AGING_MODE_DECISION_INVALID");
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1 || (selections[0] !== "remove-two" && selections[0] !== "random-discard")) {
    throw new Error("JULIUS_AGING_MODE_DECISION_INVALID");
  }
  if (selections[0] === "random-discard") return randomDiscardAfterDrawIfNeeded(state, player, definitions, randomInt);
  if (player.discard.length < 2) throw new Error("JULIUS_AGING_REMOVE_UNAVAILABLE");

  const candidates = [...player.discard];
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:remove-two`;
  state.effectQueue.unshift({
    effectId,
    handlerId: JULIUS_AGING_REMOVE_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "julius-rapid-aging-remove-two",
    options: candidates.map((id) => ({ id, label: definitions[state.cards[id]?.definitionId ?? ""]?.name ?? id })),
    min: 2,
    max: 2,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
};

export const resolveJuliusRapidAgingRemove: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("JULIUS_AGING_REMOVE_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidates) ? payload.previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 2 || new Set(selections).size !== 2
    || selections.some((id) => !candidates.includes(id) || !player.discard.includes(id))) {
    throw new Error("JULIUS_AGING_REMOVE_DECISION_INVALID");
  }
  for (const instanceId of selections) {
    movePlayerCard(state, player.id, instanceId, "removed");
    state.cards[instanceId].face = "down";
    state.cards[instanceId].active = false;
  }
  return { removedInstanceIds: selections };
};

/** Black Scorpion is a permanent upgrade to subsequent skulk resolutions. */
export const useJuliusBlackScorpion: SkillHandler = ({ player, skill, payload }) => {
  const data = isRecord(payload) ? payload : {};
  const event = isRecord(data.event) ? data.event : {};
  if (data.eventType !== "skill.unlocked" || event.playerId !== player.id || event.skillId !== skill.id) return;
  player.flags[BLACK_SCORPION_FLAG] = true;
  return { active: true };
};
