import type { GameState, PlayerState } from "../domain/state/types.ts";
import { deployPlayer } from "./board.ts";
import type { CardDefinition } from "./content-types.ts";
import { movePlayerCard } from "./decks.ts";
import { payManaCost } from "./costs.ts";
import { transferMana, transferVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const CARMILLA_FRESH_BLOOD_ID = "servant.carmilla.skill.sc-carmilla-1";
export const CARMILLA_IMMORAL_ID = "servant.carmilla.skill.sc-carmilla-2";
export const CARMILLA_PHANTOM_ID = "servant.carmilla.skill.sc-carmilla-3";

export const CARMILLA_FRESH_BLOOD_HANDLER = "core.carmilla-fresh-blood";
export const CARMILLA_FRESH_BLOOD_RESOLVE = "core.carmilla-fresh-blood-resolve";
export const CARMILLA_IMMORAL_HANDLER = "core.carmilla-immoral-suggestion";
export const CARMILLA_IMMORAL_RESOLVE = "core.carmilla-immoral-suggestion-resolve";
export const CARMILLA_PHANTOM_HANDLER = "core.carmilla-phantom-maiden";
export const CARMILLA_PHANTOM_RESOLVE = "core.carmilla-phantom-maiden-resolve";

const STOLEN_ROUND_PREFIX = "carmillaFreshBloodStolenRound:";
const SUGGESTION_HANDLED_PREFIX = "carmillaSuggestionHandledRound:";
const IMMORAL_COMBAT_PREFIX = "carmillaImmoralCombatRound:";

type DeploymentLocation = "workshop" | "mountain" | "city";
interface DeploymentChoice { id: string; locationId: DeploymentLocation; slot: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

/** Pure passives remain valid in hand/skill zone as well as while their physical card is active. */
function ownedLiveSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  const ids = [...new Set([...player.hand, ...player.masterSkills, ...player.servantSkills, ...player.attack])];
  return ids.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone !== "removed" && card.zone !== "discard"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function activeOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function combatEvent(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload) || payload.eventType !== "combat.resolved" || !isRecord(payload.event)) return undefined;
  return payload.event;
}

function freshBloodWinnerIds(state: GameState, player: PlayerState, event: Record<string, unknown>): string[] {
  const powers = isRecord(event.powers) ? event.powers : {};
  if (!Object.prototype.hasOwnProperty.call(powers, player.id)) return [];
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  return winnerIds.filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated);
}

function openFreshDecision(
  state: GameState,
  player: PlayerState,
  stage: "rejuvenation" | "steal-mana",
  candidates: string[],
  sourceInstanceId: string,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${CARMILLA_FRESH_BLOOD_ID}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: CARMILLA_FRESH_BLOOD_RESOLVE,
    sourceId: CARMILLA_FRESH_BLOOD_ID,
    controllerPlayerId: player.id,
    payload: { stage, candidates, sourceInstanceId },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `carmilla-fresh-blood-${stage}`,
    options: stage === "rejuvenation"
      ? [{ id: "use", label: "支付3点战果并移除【吸血】" }, { id: "decline", label: "不发动" }]
      : candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function stealFreshBloodMana(state: GameState, player: PlayerState, targetPlayerId: string): { targetPlayerId: string; transferred: number } {
  const target = state.players[targetPlayerId];
  if (!target || target.eliminated || target.id === player.id) throw new Error("CARMILLA_FRESH_BLOOD_TARGET_INVALID");
  const transferred = transferMana(target, player, 2);
  if (transferred > 0) player.flags[`${STOLEN_ROUND_PREFIX}${target.id}`] = state.round;
  return { targetPlayerId: target.id, transferred };
}

/** Fresh Blood: optional defeat recovery and mandatory post-fight mana theft. */
export const useCarmillaFreshBlood: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("CARMILLA_FRESH_BLOOD_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType === "player.defeated") {
    if (event.playerId !== player.id || !player.defeated || player.flags.ignoreDefeatRound === state.round || player.victoryPoints < 3) return;
    const source = ownedLiveSkill(state, player, skill.id, definitions);
    if (!source) return;
    openFreshDecision(state, player, "rejuvenation", [], source.instanceId, openDecision);
    return { pending: true, stage: "rejuvenation" };
  }
  if (eventType === "combat.resolved") {
    const source = activeOwnedSkill(state, player, skill.id, definitions);
    if (!source) return;
    const candidates = freshBloodWinnerIds(state, player, event);
    if (candidates.length === 0) return;
    if (candidates.length === 1) return stealFreshBloodMana(state, player, candidates[0]);
    openFreshDecision(state, player, "steal-mana", candidates, source.instanceId, openDecision);
    return { pending: true, stage: "steal-mana", candidates };
  }
};

export const resolveCarmillaFreshBlood: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("CARMILLA_FRESH_BLOOD_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error("CARMILLA_FRESH_BLOOD_DECISION_INVALID");
  if (previous.stage === "rejuvenation") {
    if (selections[0] === "decline") return { used: false };
    if (selections[0] !== "use" || !player.defeated || player.victoryPoints < 3) throw new Error("CARMILLA_REJUVENATION_INVALID");
    const sourceInstanceId = typeof previous.sourceInstanceId === "string" ? previous.sourceInstanceId : undefined;
    const source = sourceInstanceId ? state.cards[sourceInstanceId] : undefined;
    const definition = source ? definitions[source.definitionId] : undefined;
    if (!source || source.ownerPlayerId !== player.id || source.controllerPlayerId !== player.id
      || source.zone === "removed" || source.zone === "discard" || !matchesSkill(definition, source.definitionId, CARMILLA_FRESH_BLOOD_ID)) {
      throw new Error("CARMILLA_REJUVENATION_SOURCE_MISSING");
    }
    player.victoryPoints -= 3;
    movePlayerCard(state, player.id, source.instanceId, "removed");
    source.face = "down";
    source.active = false;
    source.residual = false;
    player.defeated = false;
    player.flags.ignoreDefeatRound = state.round;
    return { used: true, sourceInstanceId: source.instanceId, victoryPointsPaid: 3 };
  }
  if (previous.stage === "steal-mana") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selections[0])) throw new Error("CARMILLA_FRESH_BLOOD_TARGET_INVALID");
    return stealFreshBloodMana(state, player, selections[0]);
  }
  throw new Error("CARMILLA_FRESH_BLOOD_DECISION_INVALID");
};

function availableDeploymentChoices(
  state: GameState,
  target: PlayerState,
  definitions: Record<string, CardDefinition>,
): DeploymentChoice[] {
  if (state.phase !== "outpost" || state.activePlayerId !== target.id) return [];
  const existingForcedLocation = Number(target.flags.forcedDeploymentRound ?? -1) === state.round
    && typeof target.flags.forcedDeploymentLocationId === "string"
    ? target.flags.forcedDeploymentLocationId
    : undefined;
  const existingForcedSlot = Number(target.flags.forcedDeploymentSlotRound ?? -1) === state.round
    ? Number(target.flags.forcedDeploymentSlotIndex)
    : undefined;
  const locations = (["workshop", "mountain", "city"] as const)
    .filter((locationId) => !existingForcedLocation || locationId === existingForcedLocation);
  const choices: DeploymentChoice[] = [];
  for (const locationId of locations) {
    const records = state.board.outpostRecords[locationId] ?? [];
    const slots = existingForcedSlot !== undefined && Number.isInteger(existingForcedSlot)
      ? [existingForcedSlot]
      : [-1, ...records.map((occupant, index) => occupant === null ? index : -2).filter((index) => index >= 0)];
    for (const slot of slots) {
      const draft = structuredClone(state) as GameState;
      const draftTarget = draft.players[target.id];
      draftTarget.flags.forcedDeploymentRound = draft.round;
      draftTarget.flags.forcedDeploymentLocationId = locationId;
      draftTarget.flags.forcedDeploymentSlotRound = draft.round;
      draftTarget.flags.forcedDeploymentSlotIndex = slot;
      try {
        deployPlayer(draft, target.id, locationId, definitions);
        choices.push({ id: `${locationId}|${slot}`, locationId, slot });
      } catch {
        // "if possible": impossible exact placements are simply not offered.
      }
    }
  }
  return choices;
}

function openSuggestionDecision(
  state: GameState,
  player: PlayerState,
  target: PlayerState,
  sourceInstanceId: string,
  choices: DeploymentChoice[],
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${CARMILLA_IMMORAL_ID}:deploy:${target.id}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: CARMILLA_IMMORAL_RESOLVE,
    sourceId: CARMILLA_IMMORAL_ID,
    controllerPlayerId: player.id,
    payload: { stage: "deployment", targetPlayerId: target.id, sourceInstanceId, choices },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "carmilla-immoral-deployment",
    options: [
      { id: "decline", label: "不发动" },
      ...choices.map((choice) => ({ id: choice.id, label: `${choice.locationId} / ${choice.slot < 0 ? "无地利" : `地利格${choice.slot + 1}`}` })),
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function hiddenFightAttackIds(state: GameState, player: PlayerState): string[] {
  if (player.locationId !== "mountain" && player.locationId !== "city") return [];
  return (state.board.locations[player.locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated)
    .flatMap((opponentId) => state.players[opponentId].attack)
    .filter((instanceId) => {
      const card = state.cards[instanceId];
      return Boolean(card && card.zone === "attack" && card.face === "down" && !card.active);
    });
}

function resolveImmoralCombatCard(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent?: SkillContext["emitEvent"],
) {
  if (!hiddenFightAttackIds(state, player).includes(instanceId)) throw new Error("CARMILLA_IMMORAL_CARD_INVALID");
  const card = state.cards[instanceId];
  const definition = definitions[card.definitionId];
  const ownerId = card.ownerPlayerId;
  const owner = ownerId ? state.players[ownerId] : undefined;
  if (!definition || !owner || owner.id === player.id) throw new Error("CARMILLA_IMMORAL_CARD_INVALID");
  card.face = "up";
  card.active = true;
  player.flags[`${IMMORAL_COMBAT_PREFIX}${owner.id}`] = state.round;
  if (definition.basic === true) {
    owner.attack = owner.attack.filter((id) => id !== instanceId);
    player.attack = player.attack.filter((id) => id !== instanceId);
    player.attack.push(instanceId);
    card.controllerPlayerId = player.id;
    card.returnToOwnerDiscardOnClose = true;
  }
  emitEvent?.("card.activated", {
    playerId: card.controllerPlayerId ?? owner.id,
    ownerPlayerId: owner.id,
    instanceId,
    definitionId: definition.id,
    sourceId: CARMILLA_IMMORAL_ID,
    method: "immoral-suggestion",
  });
  return { instanceId, ownerPlayerId: owner.id, basic: definition.basic === true, controllerPlayerId: card.controllerPlayerId };
}

/** Immoral Suggestion: next-round deployment control plus one hidden-attack activation. */
export const useCarmillaImmoralSuggestion: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload)) throw new Error("CARMILLA_IMMORAL_CONTEXT_REQUIRED");
  if (payload.eventType === "phase.player-window.closed") {
    if (state.phase !== "outpost" || typeof state.activePlayerId !== "string" || state.activePlayerId === player.id) return;
    const target = state.players[state.activePlayerId];
    if (!target || target.eliminated
      || Number(player.flags[`${STOLEN_ROUND_PREFIX}${target.id}`] ?? -1) !== state.round - 1
      || Number(player.flags[`${SUGGESTION_HANDLED_PREFIX}${target.id}`] ?? -1) === state.round
      || player.mana < 2) return;
    const source = ownedLiveSkill(state, player, skill.id, definitions);
    if (!source) return;
    const choices = availableDeploymentChoices(state, target, definitions);
    if (choices.length === 0) {
      player.flags[`${SUGGESTION_HANDLED_PREFIX}${target.id}`] = state.round;
      return;
    }
    openSuggestionDecision(state, player, target, source.instanceId, choices, openDecision);
    return { pending: true, targetPlayerId: target.id, choices };
  }
  if (payload.abilityId !== "activate-hidden" || state.phase !== "combat" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("CARMILLA_IMMORAL_WINDOW_INVALID");
  const candidates = hiddenFightAttackIds(state, player);
  if (candidates.length === 0) throw new Error("CARMILLA_IMMORAL_NO_TARGET");
  if (candidates.length === 1) return resolveImmoralCombatCard(state, player, candidates[0], definitions, emitEvent);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:combat`;
  state.effectQueue.unshift({ effectId, handlerId: CARMILLA_IMMORAL_RESOLVE, sourceId: skill.id, controllerPlayerId: player.id, payload: { stage: "combat", candidates }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "carmilla-immoral-combat",
    options: candidates.map((id) => ({ id, label: definitions[state.cards[id]?.definitionId ?? ""]?.name ?? id })), min: 1, max: 1,
    allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
  return { pending: true, candidates };
};

export const resolveCarmillaImmoralSuggestion: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("CARMILLA_IMMORAL_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error("CARMILLA_IMMORAL_DECISION_INVALID");
  if (previous.stage === "combat") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selections[0])) throw new Error("CARMILLA_IMMORAL_CARD_INVALID");
    return resolveImmoralCombatCard(state, player, selections[0], definitions, emitEvent);
  }
  if (previous.stage === "deployment") {
    const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
    const target = targetPlayerId ? state.players[targetPlayerId] : undefined;
    if (!target || state.phase !== "outpost" || state.activePlayerId !== target.id
      || Number(player.flags[`${STOLEN_ROUND_PREFIX}${target.id}`] ?? -1) !== state.round - 1) throw new Error("CARMILLA_IMMORAL_DEPLOYMENT_INVALID");
    player.flags[`${SUGGESTION_HANDLED_PREFIX}${target.id}`] = state.round;
    if (selections[0] === "decline") return { used: false, targetPlayerId: target.id };
    const choices = availableDeploymentChoices(state, target, definitions);
    const choice = choices.find((item) => item.id === selections[0]);
    if (!choice) throw new Error("CARMILLA_IMMORAL_DEPLOYMENT_CHOICE_INVALID");
    payManaCost(state, player, 2, definitions);
    player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + 2;
    target.flags.forcedDeploymentRound = state.round;
    target.flags.forcedDeploymentLocationId = choice.locationId;
    target.flags.forcedDeploymentSlotRound = state.round;
    target.flags.forcedDeploymentSlotIndex = choice.slot;
    return { used: true, targetPlayerId: target.id, locationId: choice.locationId, slot: choice.slot, manaPaid: 2 };
  }
  throw new Error("CARMILLA_IMMORAL_DECISION_INVALID");
};

export const isCarmillaImmoralSuggestionLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "activate-hidden" && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, CARMILLA_IMMORAL_ID, definitions) && hiddenFightAttackIds(state, player).length > 0);
};

function phantomTargets(state: GameState, player: PlayerState, event: Record<string, unknown>): string[] {
  const powers = isRecord(event.powers) ? event.powers : {};
  const ownPower = Number(powers[player.id]);
  if (!Number.isFinite(ownPower)) return [];
  const winners = new Set(Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : []);
  return Object.entries(powers).filter(([targetPlayerId, power]) => targetPlayerId !== player.id
    && Boolean(state.players[targetPlayerId]) && !state.players[targetPlayerId].eliminated
    && !winners.has(targetPlayerId) && Number.isFinite(Number(power)) && Number(power) < ownPower
    && Number(player.flags[`${IMMORAL_COMBAT_PREFIX}${targetPlayerId}`] ?? -1) !== state.round)
    .map(([targetPlayerId]) => targetPlayerId);
}

function stealPhantomVictoryPoints(state: GameState, player: PlayerState, targetPlayerId: string) {
  const target = state.players[targetPlayerId];
  if (!target || target.id === player.id) throw new Error("CARMILLA_PHANTOM_TARGET_INVALID");
  const transferred = transferVictoryPoints(target, player, 3);
  return { targetPlayerId, transferred };
}

/** Phantom Maiden resolves strictly after combat and excludes players touched by Immoral Suggestion's Combat effect. */
export const useCarmillaPhantomMaiden: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("CARMILLA_PHANTOM_DEFINITIONS_REQUIRED");
  const event = combatEvent(payload);
  if (!event || !activeOwnedSkill(state, player, skill.id, definitions)) return;
  const candidates = phantomTargets(state, player, event);
  if (candidates.length === 0) return;
  if (candidates.length === 1) return stealPhantomVictoryPoints(state, player, candidates[0]);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:steal-vp`;
  state.effectQueue.unshift({ effectId, handlerId: CARMILLA_PHANTOM_RESOLVE, sourceId: skill.id, controllerPlayerId: player.id, payload: { candidates }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "carmilla-phantom-maiden",
    options: candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })), min: 1, max: 1,
    allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
  return { pending: true, candidates };
};

export const resolveCarmillaPhantomMaiden: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("CARMILLA_PHANTOM_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidates) ? payload.previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("CARMILLA_PHANTOM_DECISION_INVALID");
  return stealPhantomVictoryPoints(state, player, selections[0]);
};
