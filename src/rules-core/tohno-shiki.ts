import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillAbilityDefinition, SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { createOwnedCardInstance, movePlayerCard, transferPhysicalCardToPlayerZone } from "./decks.ts";
import { gainCustomResource, getCustomResource, gainVictoryPoints, transferVictoryPoints } from "./resources.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";

export const TOHNO_SHIKI_HANDLER = "core.tohno-shiki-possession";
export const TOHNO_SHIKI_RESOLVE = "core.tohno-shiki-possession-resolve";
export const TOHNO_POSSESSED_ID = "master.shiki-tohno.skill.s1a";
export const TOHNO_ERODING_ID = "master.shiki-tohno.skill.s2";
export const TOHNO_SERPENT_ID = "master.shiki-tohno.skill.s3";
export const TOHNO_DEMON_ID = "master.shiki-tohno.skill.s4";
export const TOHNO_ASCENSION_ID = "master.shiki-tohno.skill.ascension";
export const TOHNO_FUSION_ABILITY = "fusion";
export const TOHNO_CONTROL_RESOURCE = "tohno-control";

const FORM_FLAG = "tohnoPossessionForm";
const THRESHOLD_FLAG = "tohnoPossessionThresholdResolved";
const ASCENSION_ROUND_FLAG = "tohnoSoberingLucidityRound";

type TohnoForm = "serpent" | "demon";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formOf(player: PlayerState): TohnoForm | undefined {
  return player.flags[FORM_FLAG] === "serpent" || player.flags[FORM_FLAG] === "demon" ? player.flags[FORM_FLAG] as TohnoForm : undefined;
}

function openTohnoDecision(
  state: GameState,
  player: PlayerState,
  stage: string,
  payload: Record<string, unknown>,
  options: PendingDecision["options"],
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${TOHNO_ERODING_ID}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: TOHNO_SHIKI_RESOLVE,
    sourceId: TOHNO_ERODING_ID,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `tohno-${stage}`,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function ownedSkillInstance(state: GameState, player: PlayerState, definitionId: string): string | undefined {
  return [...player.masterSkills, ...player.attack, ...player.hand, ...player.discard]
    .find((instanceId) => state.cards[instanceId]?.ownerPlayerId === player.id && state.cards[instanceId]?.definitionId === definitionId && state.cards[instanceId]?.zone !== "removed");
}

function grantForm(state: GameState, player: PlayerState, nextForm: TohnoForm): string {
  const definitionId = nextForm === "demon" ? TOHNO_DEMON_ID : TOHNO_SERPENT_ID;
  let instanceId = ownedSkillInstance(state, player, definitionId);
  if (!instanceId) {
    instanceId = `${player.id}:tohno-form:${definitionId}`;
    createOwnedCardInstance(state, player.id, { instanceId, definitionId, originMasterId: "master.shiki-tohno", zone: "master-skills", face: "up" });
  } else if (state.cards[instanceId].zone !== "master-skills") {
    movePlayerCard(state, player.id, instanceId, "master-skills");
    state.cards[instanceId].face = "up";
    state.cards[instanceId].active = false;
  }
  player.flags[FORM_FLAG] = nextForm;
  const modifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.sourceId !== TOHNO_SERPENT_ID && modifier.sourceId !== TOHNO_DEMON_ID);
  if (nextForm === "serpent") {
    modifiers.push({
      id: `${TOHNO_SERPENT_ID}:eroding`, sourceId: TOHNO_SERPENT_ID, targetDefinitionIds: [TOHNO_ERODING_ID],
      waiveEightMana: true, grantAttributes: ["魔术"], duration: "game",
    });
  } else {
    modifiers.push({
      id: `${TOHNO_DEMON_ID}:eroding`, sourceId: TOHNO_DEMON_ID, targetDefinitionIds: [TOHNO_ERODING_ID],
      victoryPointPlayCostOverride: 0, duration: "game",
    });
  }
  player.cardRuleModifiers = modifiers;
  return instanceId;
}

function resolvePossessedEvent(state: GameState, player: PlayerState, event: Record<string, unknown>): unknown {
  if (event.playerId !== player.id) return;
  const delta = Number(event.delta);
  if (!Number.isInteger(delta) || delta <= 0) return;
  const sourceId = typeof event.sourceId === "string" ? event.sourceId : undefined;
  let controlGained = 0;
  if (!formOf(player) && sourceId === "combat.resolve") controlGained = gainCustomResource(player, TOHNO_CONTROL_RESOURCE, delta);
  if (player.flags[THRESHOLD_FLAG] !== true && player.victoryPoints >= 13) {
    player.flags[THRESHOLD_FLAG] = true;
    const nextForm: TohnoForm = getCustomResource(player, TOHNO_CONTROL_RESOURCE) >= 13 ? "demon" : "serpent";
    return { controlGained, transformed: nextForm, instanceId: grantForm(state, player, nextForm) };
  }
  return { controlGained, control: getCustomResource(player, TOHNO_CONTROL_RESOURCE) };
}

function opponentsInFight(state: GameState, player: PlayerState): PlayerState[] {
  if (player.locationId !== "mountain" && player.locationId !== "city") return [];
  return (state.board.locations[player.locationId] ?? [])
    .filter((id) => id !== player.id)
    .map((id) => state.players[id])
    .filter((candidate): candidate is PlayerState => Boolean(candidate && !candidate.eliminated));
}

function randomReveal(discard: readonly string[], randomInt: (maxExclusive: number) => number): string[] {
  const pool = [...discard];
  const revealed: string[] = [];
  while (pool.length > 0 && revealed.length < 3) {
    const index = randomInt(pool.length);
    if (!Number.isInteger(index) || index < 0 || index >= pool.length) throw new Error("TOHNO_FUSION_RANDOM_INVALID");
    revealed.push(pool.splice(index, 1)[0]);
  }
  return revealed;
}

function basicCardIds(ids: readonly string[], state: GameState, definitions: Record<string, CardDefinition>): string[] {
  return ids.filter((instanceId) => definitions[state.cards[instanceId]?.definitionId ?? ""]?.basic === true);
}

function ownFusionCards(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return basicCardIds([
    ...player.hand,
    ...player.attack.filter((instanceId) => state.cards[instanceId]?.controllerPlayerId === player.id),
  ], state, definitions);
}

function revealFusionCards(
  state: GameState,
  player: PlayerState,
  opponentId: string,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): unknown {
  const opponent = state.players[opponentId];
  if (!opponent || opponent.eliminated || !opponentsInFight(state, player).some((candidate) => candidate.id === opponentId)) throw new Error("TOHNO_FUSION_OPPONENT_INVALID");
  const revealedInstanceIds = randomReveal(opponent.discard, randomInt);
  for (const instanceId of revealedInstanceIds) state.cards[instanceId].publiclyRevealed = true;
  const targetBasics = basicCardIds(revealedInstanceIds, state, definitions);
  const ownBasics = ownFusionCards(state, player, definitions);
  if (targetBasics.length === 0 || ownBasics.length === 0) return { opponentId, revealedInstanceIds, swapped: false };
  openTohnoDecision(state, player, "fusion-target-card", { opponentId, revealedInstanceIds, targetBasics }, [
    ...targetBasics.map((id) => ({ id, label: definitions[state.cards[id].definitionId]?.name ?? id })),
    { id: "decline", label: "Decline" },
  ], openDecision);
  return { pending: true, opponentId, revealedInstanceIds };
}

function startFusion(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): unknown {
  if (formOf(player) === "serpent") throw new Error("TOHNO_FUSION_FORBIDDEN");
  const opponents = opponentsInFight(state, player).filter((candidate) => candidate.discard.length > 0);
  if (opponents.length === 0) throw new Error("TOHNO_FUSION_NO_OPPONENT_DISCARD");
  if (opponents.length === 1) return revealFusionCards(state, player, opponents[0].id, definitions, randomInt, openDecision);
  openTohnoDecision(state, player, "fusion-opponent", { opponentIds: opponents.map((candidate) => candidate.id) }, opponents.map((candidate) => ({ id: candidate.id, label: candidate.name })), openDecision);
  return { pending: true };
}

function swapFusionCards(
  state: GameState,
  player: PlayerState,
  opponentId: string,
  targetInstanceId: string,
  ownInstanceId: string,
  definitions: Record<string, CardDefinition>,
): unknown {
  const opponent = state.players[opponentId];
  const target = state.cards[targetInstanceId];
  const own = state.cards[ownInstanceId];
  if (!opponent || opponent.eliminated || !target || !own || !opponent.discard.includes(targetInstanceId)
    || definitions[target.definitionId]?.basic !== true || !ownFusionCards(state, player, definitions).includes(ownInstanceId)) {
    throw new Error("TOHNO_FUSION_SWAP_INVALID");
  }
  const ownWasInPlay = own.zone === "attack" && own.controllerPlayerId === player.id;
  const ownFace = own.face;
  const ownActive = own.active;
  const ownResidual = own.residual;
  const ownPaidCost = own.paidCost;
  transferPhysicalCardToPlayerZone(state, player.id, targetInstanceId, "hand");
  transferPhysicalCardToPlayerZone(state, opponentId, ownInstanceId, "discard");
  if (ownWasInPlay) {
    movePlayerCard(state, player.id, targetInstanceId, "attack");
    target.face = ownFace;
    target.active = ownActive;
    target.residual = ownResidual;
    target.paidCost = ownPaidCost;
  }
  const vpBefore = { player: player.victoryPoints, opponent: opponent.victoryPoints };
  const stolenVictoryPoints = formOf(player) === "demon" && opponent.victoryPoints > player.victoryPoints
    ? transferVictoryPoints(opponent, player, 2)
    : 0;
  return { opponentId, targetInstanceId, ownInstanceId, ownWasInPlay, stolenVictoryPoints, vpBefore };
}

function handleAscension(state: GameState, player: PlayerState, eventType: string | undefined, event: Record<string, unknown>): unknown {
  if (eventType === "skill.unlocked") {
    if (event.playerId !== player.id || event.skillId !== TOHNO_ASCENSION_ID) return;
    player.flags[ASCENSION_ROUND_FLAG] = state.round + 1;
    return { resolvesRound: state.round + 1 };
  }
  if (eventType !== "round.started" || Number(player.flags[ASCENSION_ROUND_FLAG] ?? -1) !== state.round) return;
  delete player.flags[ASCENSION_ROUND_FLAG];
  const gainedVictoryPoints = gainVictoryPoints(player, getCustomResource(player, TOHNO_CONTROL_RESOURCE));
  player.flags.combatPowerFixedPermanent = 0;
  return { gainedVictoryPoints, combatPowerFixedPermanent: 0 };
}

export const useTohnoShiki: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision }) => {
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (skill.id === TOHNO_POSSESSED_ID && eventType === "player.victory-points.changed") return resolvePossessedEvent(state, player, event);
  if (skill.id === TOHNO_ERODING_ID && data.abilityId === TOHNO_FUSION_ABILITY) {
    if (!definitions || state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("TOHNO_FUSION_WINDOW_INVALID");
    return startFusion(state, player, definitions, randomInt ?? (() => 0), openDecision);
  }
  if (skill.id === TOHNO_ASCENSION_ID) return handleAscension(state, player, eventType, event);
};

export const resolveTohnoShikiDecision: SkillHandler = ({ state, player, payload, definitions, randomInt, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("TOHNO_DECISION_INVALID");
  const previous = isRecord(payload.previous) ? payload.previous : payload;
  const decision = isRecord(payload.decision) ? payload.decision : undefined;
  const selections = Array.isArray(decision?.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision?.status !== "resolved" || selections.length !== 1) throw new Error("TOHNO_DECISION_INVALID");
  const stage = String(previous.stage ?? "");
  if (stage === "fusion-opponent") {
    const opponentIds = Array.isArray(previous.opponentIds) ? previous.opponentIds.filter((id): id is string => typeof id === "string") : [];
    if (!opponentIds.includes(selections[0])) throw new Error("TOHNO_FUSION_OPPONENT_INVALID");
    return revealFusionCards(state, player, selections[0], definitions, randomInt ?? (() => 0), openDecision);
  }
  if (stage === "fusion-target-card") {
    if (selections[0] === "decline") return { swapped: false };
    const targetBasics = Array.isArray(previous.targetBasics) ? previous.targetBasics.filter((id): id is string => typeof id === "string") : [];
    const opponentId = typeof previous.opponentId === "string" ? previous.opponentId : undefined;
    if (!opponentId || !targetBasics.includes(selections[0])) throw new Error("TOHNO_FUSION_TARGET_CARD_INVALID");
    const ownBasics = ownFusionCards(state, player, definitions);
    if (ownBasics.length === 0) return { swapped: false };
    openTohnoDecision(state, player, "fusion-own-card", { opponentId, targetInstanceId: selections[0], ownBasics }, ownBasics.map((id) => ({ id, label: definitions[state.cards[id].definitionId]?.name ?? id })), openDecision);
    return { pending: true };
  }
  if (stage === "fusion-own-card") {
    const ownBasics = Array.isArray(previous.ownBasics) ? previous.ownBasics.filter((id): id is string => typeof id === "string") : [];
    const opponentId = typeof previous.opponentId === "string" ? previous.opponentId : undefined;
    const targetInstanceId = typeof previous.targetInstanceId === "string" ? previous.targetInstanceId : undefined;
    if (!opponentId || !targetInstanceId || !ownBasics.includes(selections[0])) throw new Error("TOHNO_FUSION_OWN_CARD_INVALID");
    return swapFusionCards(state, player, opponentId, targetInstanceId, selections[0], definitions);
  }
  throw new Error("TOHNO_DECISION_STAGE_INVALID");
};

export const isTohnoShikiLegal: SkillLegalityPredicate = (state: GameState, playerId: string, skill?: SkillDefinition, ability?: SkillAbilityDefinition, definitions?: Record<string, CardDefinition>) => {
  const player = state.players[playerId];
  if (!player || !skill || !ability || !definitions || state.activePlayerId !== playerId) return false;
  if (skill.id === TOHNO_ERODING_ID && ability.id === TOHNO_FUSION_ABILITY) {
    return state.phase === "combat" && formOf(player) !== "serpent"
      && opponentsInFight(state, player).some((candidate) => candidate.discard.length > 0)
      && ownFusionCards(state, player, definitions).length > 0;
  }
  return false;
};

export function getTohnoForm(player: PlayerState): TohnoForm | undefined { return formOf(player); }
