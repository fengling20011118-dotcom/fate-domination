import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { calculateCombatCardPower } from "./combat-power.ts";
import { playCardFaceDownByEffect } from "./card-play.ts";
import { assertCardCanEnterAttack } from "./card-rules.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import type { CardDefinition } from "./content-types.ts";
import { clearCardStateBoundToClose, closePlayerCard, movePlayerCard } from "./decks.ts";
import { transferVictoryPoints } from "./resources.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const KOTAROU_CHAOS_BRIGADE_ID = "servant.kotarou.skill.sc-kotarou-2";
export const KOTAROU_SHINOBI_SABOTAGE_ID = "servant.kotarou.skill.sc-kotarou-3";
export const KOTAROU_CHAOS_BRIGADE_HANDLER = "core.kotarou-chaos-brigade";
export const KOTAROU_SHINOBI_SABOTAGE_HANDLER = "core.kotarou-shinobi-sabotage";
export const KOTAROU_DECISION_RESOLVE = "core.kotarou-decision-resolve";

const CHAOS_ACTIVATE_ABILITY = "chaos-brigade-activate";
const SHINOBI_PLANT_ABILITY = "shinobi-plant-ploys";
const SHINOBI_RESOLVE_ABILITY = "shinobi-resolve-ploys";
const PLOY_MARKER_PREFIX = "ploy:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.zone === "attack" && card.face === "up" && card.active
      && (card.ownerPlayerId === player.id || card.controllerPlayerId === player.id)
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function faceDownAttackCandidates(state: GameState, player: PlayerState): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.zone === "attack" && card.face === "down" && !card.active
      && (card.ownerPlayerId === player.id || card.controllerPlayerId === player.id));
  });
}

function activateChaosTarget(
  state: GameState,
  player: PlayerState,
  sourceInstanceId: string,
  targetInstanceId: string,
  definitions: Record<string, CardDefinition>,
): { targetInstanceId: string } {
  if (!faceDownAttackCandidates(state, player).includes(targetInstanceId)) throw new Error("KOTAROU_CHAOS_TARGET_INVALID");
  const card = state.cards[targetInstanceId];
  const definition = definitions[card.definitionId];
  if (!definition) throw new Error("KOTAROU_CHAOS_DEFINITION_MISSING");
  card.face = "up";
  card.active = true;
  card.residual = definition.residual === true;
  const modifierId = `${KOTAROU_CHAOS_BRIGADE_ID}:action-in-combat:${state.round}:${targetInstanceId}`;
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== modifierId);
  addCardRuleModifier(player, {
    id: modifierId,
    sourceId: KOTAROU_CHAOS_BRIGADE_ID,
    sourceInstanceId,
    targetDefinitionIds: [card.definitionId],
    targetInstanceIds: [targetInstanceId],
    allowActionAbilityInCombat: true,
    actionAbilityCombatLimit: "twice-per-round",
    duration: "round",
  });
  return { targetInstanceId };
}

function ployMarker(skillId: string, round: number): string {
  return `${PLOY_MARKER_PREFIX}${skillId}:${round}`;
}

function isPloy(card: GameState["cards"][string] | undefined, skillId: string, round: number): boolean {
  return Boolean(card?.modifiers?.includes(ployMarker(skillId, round)));
}

function canPlantPloy(state: GameState, player: PlayerState, instanceId: string, definitions: Record<string, CardDefinition>): boolean {
  try {
    assertCardCanEnterAttack({
      state,
      playerId: player.id,
      instanceId,
      definitions,
      faceDown: true,
      allowedSourceZones: ["hand"],
      bypassTiming: true,
      bypassSkillEightMana: true,
      bypassSkillFaceDown: true,
    });
    return true;
  } catch {
    return false;
  }
}

function openPloyDecision(
  state: GameState,
  controller: PlayerState,
  playerIds: string[],
  index: number,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  let nextIndex = index;
  while (nextIndex < playerIds.length) {
    const chooser = state.players[playerIds[nextIndex]];
    if (!chooser || chooser.eliminated) { nextIndex += 1; continue; }
    const candidates = chooser.hand.filter((instanceId) => canPlantPloy(state, chooser, instanceId, definitions));
    if (candidates.length === 0) { nextIndex += 1; continue; }
    const effectId = `${state.gameInstanceId}:${state.revision}:${controller.id}:${KOTAROU_SHINOBI_SABOTAGE_ID}:ploy:${nextIndex}`;
    state.effectQueue.unshift({
      effectId,
      handlerId: KOTAROU_DECISION_RESOLVE,
      sourceId: KOTAROU_SHINOBI_SABOTAGE_ID,
      controllerPlayerId: controller.id,
      payload: { stage: "plant-ploy", playerIds, index: nextIndex, chooserPlayerId: chooser.id, candidates },
      createdAtRevision: state.revision,
    });
    openDecision({
      decisionId: `${effectId}:decision`,
      ownerPlayerId: controller.id,
      chooserPlayerIds: [chooser.id],
      kind: "kotarou-shinobi-ploy",
      options: candidates.map((instanceId) => ({ id: instanceId, label: instanceId })),
      min: 0,
      max: 1,
      allowCancel: true,
      continuationEffectId: effectId,
      submissions: {},
    });
    return;
  }
}

function plantPloy(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
): void {
  if (!canPlantPloy(state, player, instanceId, definitions)) throw new Error("KOTAROU_PLOY_CARD_INVALID");
  playCardFaceDownByEffect(state, player.id, instanceId, definitions, { allowedSourceZones: ["hand"], allowSkillCard: true });
  const card = state.cards[instanceId];
  const marker = ployMarker(KOTAROU_SHINOBI_SABOTAGE_ID, state.round);
  card.modifiers = [...(card.modifiers ?? []).filter((value) => !value.startsWith(PLOY_MARKER_PREFIX)), marker];
  emitEvent?.("card.played", {
    playerId: player.id,
    instanceId,
    definitionId: null,
    face: "down",
    paidMana: 0,
    attributes: [],
    method: "shinobi-sabotage",
    sourceId: KOTAROU_SHINOBI_SABOTAGE_ID,
  });
}

function combatParticipantIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((playerId) => !state.players[playerId]?.eliminated);
}

function resolvePloys(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): { ownPower: number; stolen: Record<string, number> } {
  const participantIds = combatParticipantIds(state, player);
  if (participantIds.length < 2) throw new Error("KOTAROU_SHINOBI_COMBAT_REQUIRED");
  const ploysByPlayer = new Map<string, string[]>();
  for (const playerId of participantIds) {
    const participant = state.players[playerId];
    const ploys = participant.attack.filter((instanceId) => isPloy(state.cards[instanceId], KOTAROU_SHINOBI_SABOTAGE_ID, state.round));
    ploysByPlayer.set(playerId, ploys);
    for (const instanceId of ploys) {
      const card = state.cards[instanceId];
      const definition = definitions[card.definitionId];
      if (!definition) throw new Error("KOTAROU_PLOY_DEFINITION_MISSING");
      card.face = "up";
      card.active = true;
      card.residual = definition.residual === true;
    }
  }
  const locationId = player.locationId as "mountain" | "city";
  const powerOf = (playerId: string) => (ploysByPlayer.get(playerId) ?? []).reduce((sum, instanceId) =>
    sum + calculateCombatCardPower(state, state.players[playerId], instanceId, definitions, locationId), 0);
  const ownPower = powerOf(player.id);
  const stolen: Record<string, number> = {};
  for (const targetPlayerId of participantIds) {
    if (targetPlayerId === player.id) continue;
    if (powerOf(targetPlayerId) >= ownPower) continue;
    stolen[targetPlayerId] = transferVictoryPoints(state.players[targetPlayerId], player, 2);
  }
  for (const participant of Object.values(state.players)) {
    for (const instanceId of [...participant.attack]) {
      const card = state.cards[instanceId];
      if (!isPloy(card, KOTAROU_SHINOBI_SABOTAGE_ID, state.round)) continue;
      clearCardStateBoundToClose(card);
      card.modifiers = (card.modifiers ?? []).filter((value) => !value.startsWith(PLOY_MARKER_PREFIX));
      movePlayerCard(state, participant.id, instanceId, "discard");
      card.face = "down";
      card.active = false;
      card.residual = false;
    }
  }
  return { ownPower, stolen };
}

/** Chaos Brigade: close after a Conceal Presence use, or activate one hidden attack for up to two Action uses. */
export const useKotarouChaosBrigade: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions) throw new Error("KOTAROU_CHAOS_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "combat.ending") {
    if (Number(player.flags.presenceConcealmentUsedRound ?? -1) !== state.round) return;
    const source = activeOwnedSkill(state, player, skill.id, definitions);
    if (!source) return;
    const wasHidden = !player.trueNameRevealed;
    revealPlayerTrueName(state, player.id);
    if (wasHidden) emitEvent?.("servant.true-name-revealed", { playerId: player.id, servantId: player.servantId, sourceDefinitionId: skill.id, method: "chaos-brigade" });
    closePlayerCard(state, player.id, source.instanceId, definitions);
    return { closed: source.instanceId };
  }
  if (data.abilityId !== CHAOS_ACTIVATE_ABILITY || state.phase !== "combat" || state.activePlayerId !== player.id) {
    throw new Error("KOTAROU_CHAOS_ABILITY_INVALID");
  }
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("KOTAROU_CHAOS_SOURCE_INACTIVE");
  const candidates = faceDownAttackCandidates(state, player);
  if (candidates.length === 0) throw new Error("KOTAROU_CHAOS_NO_TARGET");
  const targetInstanceId = typeof data.targetInstanceId === "string" ? data.targetInstanceId : undefined;
  if (targetInstanceId) return activateChaosTarget(state, player, source.instanceId, targetInstanceId, definitions);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:activate`;
  state.effectQueue.unshift({
    effectId,
    handlerId: KOTAROU_DECISION_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { stage: "chaos-target", sourceInstanceId: source.instanceId, candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "kotarou-chaos-target",
    options: candidates.map((id) => ({ id, label: id })), min: 1, max: 1, allowCancel: false,
    continuationEffectId: effectId, submissions: {},
  });
  return { pending: true };
};

export const isKotarouChaosBrigadeLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === CHAOS_ACTIVATE_ABILITY && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions) && faceDownAttackCandidates(state, player).length > 0);
};

/** Shinobi Sabotage: sequentially plant hidden ploys, then compare and discard them during combat. */
export const useKotarouShinobiSabotage: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("KOTAROU_SHINOBI_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("KOTAROU_SHINOBI_SOURCE_INACTIVE");
  if (data.abilityId === SHINOBI_PLANT_ABILITY) {
    if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("KOTAROU_SHINOBI_ACTION_WINDOW_INVALID");
    const playerIds = state.turnOrder.filter((playerId) => !state.players[playerId]?.eliminated);
    openPloyDecision(state, player, playerIds, 0, definitions, openDecision);
    return { playerIds };
  }
  if (data.abilityId === SHINOBI_RESOLVE_ABILITY) {
    if (state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("KOTAROU_SHINOBI_COMBAT_WINDOW_INVALID");
    return resolvePloys(state, player, definitions);
  }
  throw new Error("KOTAROU_SHINOBI_ABILITY_INVALID");
};

export const isKotarouShinobiSabotageLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !activeOwnedSkill(state, player, skill.id, definitions) || state.activePlayerId !== playerId) return false;
  if (ability?.id === SHINOBI_PLANT_ABILITY) return state.phase === "action";
  if (ability?.id === SHINOBI_RESOLVE_ABILITY) return state.phase === "combat" && combatParticipantIds(state, player).length >= 2;
  return false;
};

export const resolveKotarouDecision: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("KOTAROU_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" && decision.status !== "cancelled") throw new Error("KOTAROU_DECISION_INVALID");
  if (previous.stage === "chaos-target") {
    const sourceInstanceId = typeof previous.sourceInstanceId === "string" ? previous.sourceInstanceId : undefined;
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!sourceInstanceId || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("KOTAROU_CHAOS_DECISION_INVALID");
    return activateChaosTarget(state, player, sourceInstanceId, selections[0], definitions);
  }
  if (previous.stage === "plant-ploy") {
    const playerIds = Array.isArray(previous.playerIds) ? previous.playerIds.filter((id): id is string => typeof id === "string") : [];
    const index = Number(previous.index);
    const chooserPlayerId = typeof previous.chooserPlayerId === "string" ? previous.chooserPlayerId : undefined;
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!Number.isInteger(index) || index < 0 || !chooserPlayerId || playerIds[index] !== chooserPlayerId || selections.length > 1) {
      throw new Error("KOTAROU_PLOY_DECISION_INVALID");
    }
    const chooser = state.players[chooserPlayerId];
    if (!chooser || chooser.eliminated) throw new Error("KOTAROU_PLOY_CHOOSER_INVALID");
    if (selections.length === 1) {
      if (!candidates.includes(selections[0])) throw new Error("KOTAROU_PLOY_CARD_INVALID");
      plantPloy(state, chooser, selections[0], definitions, emitEvent);
    }
    openPloyDecision(state, player, playerIds, index + 1, definitions, openDecision);
    return { nextIndex: index + 1 };
  }
  throw new Error("KOTAROU_DECISION_STAGE_INVALID");
};
