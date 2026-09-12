import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { createDerivedCardInstance, movePlayerCard } from "./decks.ts";
import { movePlayerOneSpaceByEffect } from "./board.ts";
import { gainMana, transferVictoryPoints } from "./resources.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import { wouldPlayerBeEliminatedAtNextClimax } from "./rounds.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const REINES_ALCHEMIST_ID = "master.reines.skill.s1";
export const REINES_LITTLE_DEVIL_ID = "master.reines.skill.s1a";
export const REINES_POWER_ID = "master.reines.skill.s2";
export const REINES_MOVEMENT_ID = "master.reines.skill.s3";
export const REINES_MANA_ID = "master.reines.skill.s4";
export const REINES_ASCENSION_ID = "master.reines.skill.ascension";
export const REINES_HANDLER = "core.reines-trimmau";
export const REINES_RESOLVE = "core.reines-trimmau-resolve";

export const REINES_ALCHEMIST_ABILITY = "alchemist-fetch";
export const REINES_SCALP_ABILITY = "scalp-play";
export const REINES_POWER_HAND_ABILITY = "trimmau-power-hand";
export const REINES_WING_ACTION_ABILITY = "ex-medullis-alis";
export const REINES_WING_HAND_ABILITY = "trimmau-wing-hand";
export const REINES_CONFESSION_ABILITY = "ire-confessio";
export const REINES_MANA_HAND_ABILITY = "trimmau-mana-hand";

const TRIMMAU_SKILL_IDS = [REINES_POWER_ID, REINES_MOVEMENT_ID, REINES_MANA_ID] as const;
const ASCENSION_MODIFIER_ID = `${REINES_ASCENSION_ID}:trimmau-upgrade`;

type TrimmauSkillId = typeof TRIMMAU_SKILL_IDS[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesSkill(card: GameState["cards"][string] | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || card.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId));
}

function physicalSkillInZone(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
  zone: "hand" | "attack" | "master-skills",
) {
  const ids = zone === "hand" ? player.hand : zone === "attack" ? player.attack : player.masterSkills;
  return ids.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === zone
      && (zone !== "attack" || (card.active && card.face === "up")) && matchesSkill(card, definition, skillId));
  });
}

function physicalTrimmauExists(state: GameState, playerId: string, skillId: TrimmauSkillId, definitions: Record<string, CardDefinition>): boolean {
  return Object.values(state.cards).some((card) => {
    if (card.ownerPlayerId !== playerId || card.zone === "removed") return false;
    return matchesSkill(card, definitions[card.definitionId], skillId);
  });
}

function availableOutsideTrimmau(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): TrimmauSkillId[] {
  return TRIMMAU_SKILL_IDS.filter((skillId) => !physicalTrimmauExists(state, player.id, skillId, definitions));
}

function uniqueInstanceId(state: GameState, prefix: string): string {
  let index = 1;
  while (state.cards[`${prefix}:${index}`]) index += 1;
  return `${prefix}:${index}`;
}

function createTrimmauInHand(state: GameState, player: PlayerState, skillId: TrimmauSkillId, definitions: Record<string, CardDefinition>) {
  if (!availableOutsideTrimmau(state, player, definitions).includes(skillId)) throw new Error("REINES_TRIMMAU_NOT_OUTSIDE_GAME");
  const definitionId = `card.skill.${skillId}`;
  if (!definitions[definitionId]) throw new Error("REINES_TRIMMAU_DEFINITION_MISSING");
  const instance = createDerivedCardInstance(state, player.id, {
    instanceId: uniqueInstanceId(state, `${player.id}:reines-trimmau:${skillId}`),
    definitionId,
    originMasterId: "master.reines",
    zone: "hand",
    face: "down",
    active: false,
    residual: false,
    temporary: false,
    sourceEffectId: REINES_ALCHEMIST_ID,
  });
  return { instanceId: instance.instanceId, definitionId };
}

function openDecision(
  context: Parameters<SkillHandler>[0],
  stage: string,
  options: PendingDecision["options"],
  payload: Record<string, unknown> = {},
): { pending: true } {
  const { state, player, skill, openDecision: open } = context;
  if (options.length === 0) throw new Error("REINES_DECISION_NO_OPTIONS");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: REINES_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  open({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `reines-${stage}`,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true };
}

function isAttackDefinition(definition: CardDefinition | undefined): boolean {
  return Boolean(definition && (definition.cardType === "attack" || definition.basic === true || definition.basePower !== 0 || (definition.attributes?.length ?? 0) > 0));
}

function playableHandAttackIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || !isAttackDefinition(definition)) return false;
    try {
      const draft = structuredClone(state) as GameState;
      addCardToAttack(draft, player.id, instanceId, definitions, {
        payCost: true,
        allowedSourceZones: ["hand"],
        bypassFaceUpPlayLimit: true,
        bypassTiming: true,
      });
      return true;
    } catch {
      return false;
    }
  });
}

function emitEffectPlay(context: Parameters<SkillHandler>[0], instanceId: string, paidMana: number): void {
  const { state, player, definitions, emitEvent } = context;
  if (!definitions) throw new Error("REINES_DEFINITIONS_REQUIRED");
  const card = state.cards[instanceId];
  const definition = definitions[card.definitionId];
  if (definition.revealsTrueNameOnPlay === true && !player.trueNameRevealed) {
    revealPlayerTrueName(state, player.id);
    emitEvent?.("servant.true-name-revealed", { playerId: player.id, servantId: player.servantId, sourceDefinitionId: definition.id, method: "reines-scalp" });
  }
  const attributes = getCardInstanceAttributes(card, definition, state, definitions);
  emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana, attributes, method: "reines-scalp" });
  emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, attributes, method: "reines-scalp" });
}

function playScalpAttack(context: Parameters<SkillHandler>[0], instanceId: string) {
  const { state, player, definitions } = context;
  if (!definitions || !playableHandAttackIds(state, player, definitions).includes(instanceId)) throw new Error("REINES_SCALP_TARGET_INVALID");
  const result = addCardToAttack(state, player.id, instanceId, definitions, {
    payCost: true,
    allowedSourceZones: ["hand"],
    bypassFaceUpPlayLimit: true,
    bypassTiming: true,
  });
  emitEffectPlay(context, instanceId, result.paidMana);
  return { instanceId, paidMana: result.paidMana };
}

function ascensionOwned(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  return [...player.masterSkills, ...player.attack].some((id) => {
    const card = state.cards[id];
    return Boolean(card && card.ownerPlayerId === player.id && card.zone !== "removed" && matchesSkill(card, definitions[card.definitionId], REINES_ASCENSION_ID));
  });
}

function trimmauPlayedCount(player: PlayerState): number {
  const count = Number(player.flags.reinesTrimmauPlayedCount ?? 0);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

function syncAscensionModifier(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== ASCENSION_MODIFIER_ID);
  if (!ascensionOwned(state, player, definitions)) return;
  player.cardRuleModifiers.push({
    id: ASCENSION_MODIFIER_ID,
    sourceId: REINES_ASCENSION_ID,
    targetDefinitionIds: TRIMMAU_SKILL_IDS.flatMap((id) => [id, `card.skill.${id}`]),
    grantAttributes: ["力量"],
    powerAdd: trimmauPlayedCount(player),
    duration: "game",
  });
}

function recordTrimmauPlay(state: GameState, player: PlayerState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>) {
  if (event.playerId !== player.id || typeof event.definitionId !== "string") return;
  const definition = definitions[event.definitionId];
  const linked = definition?.linkedSkillId ?? event.definitionId;
  if (!TRIMMAU_SKILL_IDS.includes(linked as TrimmauSkillId)) return;
  player.flags.reinesTrimmauPlayedCount = trimmauPlayedCount(player) + 1;
  syncAscensionModifier(state, player, definitions);
  return { count: trimmauPlayedCount(player) };
}

function combatParticipantIds(event: Record<string, unknown>): string[] {
  if (Array.isArray(event.participantIds)) return event.participantIds.filter((id): id is string => typeof id === "string");
  return isRecord(event.powers) ? Object.keys(event.powers) : [];
}

function sadisticCandidates(state: GameState, player: PlayerState, event: Record<string, unknown>): string[] {
  const participants = combatParticipantIds(event);
  const winners = new Set(Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : []);
  if (!participants.includes(player.id) || !winners.has(player.id)) return [];
  return participants.filter((id) => id !== player.id && !winners.has(id) && state.players[id] && !state.players[id].eliminated
    && wouldPlayerBeEliminatedAtNextClimax(state, id));
}

function discardAllHand(state: GameState, player: PlayerState): string[] {
  const discarded = [...player.hand];
  for (const instanceId of discarded) {
    movePlayerCard(state, player.id, instanceId, "discard");
    const card = state.cards[instanceId];
    card.face = "up";
    card.active = false;
    card.residual = false;
  }
  return discarded;
}

function resolveLittleDevil(context: Parameters<SkillHandler>[0], event: Record<string, unknown>) {
  const { state, player, definitions } = context;
  if (!definitions) throw new Error("REINES_DEFINITIONS_REQUIRED");
  const participants = combatParticipantIds(event);
  const winners = new Set(Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : []);
  if (!participants.includes(player.id)) return;
  if (!winners.has(player.id)) return { discardedInstanceIds: discardAllHand(state, player) };
  const candidates = sadisticCandidates(state, player, event);
  if (candidates.length === 0) return { stolenVictoryPoints: 0 };
  if (candidates.length === 1) {
    const amount = transferVictoryPoints(state.players[candidates[0]], player, 1);
    return { targetPlayerId: candidates[0], stolenVictoryPoints: amount };
  }
  return openDecision(context, "sadistic-target", candidates.map((id) => ({ id, label: id })), { candidates });
}

function sameLocationOpponentIds(state: GameState, player: PlayerState): string[] {
  if (!player.locationId) return [];
  return Object.values(state.players).filter((candidate) => candidate.id !== player.id && !candidate.eliminated && candidate.locationId === player.locationId).map((candidate) => candidate.id);
}

function inspectSkillZone(state: GameState, targetPlayerId: string) {
  const target = state.players[targetPlayerId];
  if (!target) throw new Error("REINES_CONFESSION_TARGET_INVALID");
  return [...target.masterSkills, ...target.servantSkills].map((instanceId) => ({ instanceId, definitionId: state.cards[instanceId]?.definitionId }))
    .filter((entry): entry is { instanceId: string; definitionId: string } => typeof entry.definitionId === "string");
}

function resolveConfessionTarget(context: Parameters<SkillHandler>[0], targetPlayerId: string) {
  const { state, player } = context;
  const target = state.players[targetPlayerId];
  if (!target || target.id === player.id || target.eliminated || target.locationId !== player.locationId) throw new Error("REINES_CONFESSION_TARGET_INVALID");
  if (target.trueNameRevealed) {
    player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 4;
    return { targetPlayerId, powerBonus: 4, inspectedSkillZone: false };
  }
  return { targetPlayerId, powerBonus: 0, inspectedSkillZone: true, skillZone: inspectSkillZone(state, targetPlayerId) };
}

export const resolveReinesDecision: SkillHandler = (context) => {
  const { state, player, payload, definitions } = context;
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("REINES_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1 || typeof previous.stage !== "string") throw new Error("REINES_DECISION_INVALID");
  const selected = selections[0];
  if (previous.stage === "alchemist") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selected) || !TRIMMAU_SKILL_IDS.includes(selected as TrimmauSkillId)) throw new Error("REINES_ALCHEMIST_SELECTION_INVALID");
    return createTrimmauInHand(state, player, selected as TrimmauSkillId, definitions);
  }
  if (previous.stage === "scalp-attack") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selected)) throw new Error("REINES_SCALP_SELECTION_INVALID");
    return playScalpAttack(context, selected);
  }
  if (previous.stage === "sadistic-target") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selected)) throw new Error("REINES_SADISTIC_TARGET_INVALID");
    const target = state.players[selected];
    if (!target || target.eliminated || !wouldPlayerBeEliminatedAtNextClimax(state, selected)) throw new Error("REINES_SADISTIC_TARGET_INVALID");
    return { targetPlayerId: selected, stolenVictoryPoints: transferVictoryPoints(target, player, 1) };
  }
  if (previous.stage === "confession-target") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selected)) throw new Error("REINES_CONFESSION_TARGET_INVALID");
    return resolveConfessionTarget(context, selected);
  }
  throw new Error("REINES_DECISION_STAGE_INVALID");
};

export const useReinesTrimmau: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions } = context;
  if (!definitions) throw new Error("REINES_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === REINES_ALCHEMIST_ID) {
    if (eventType === "card.played") return recordTrimmauPlay(state, player, event, definitions);
    const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
    if (abilityId !== REINES_ALCHEMIST_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("REINES_ALCHEMIST_WINDOW_INVALID");
    const candidates = availableOutsideTrimmau(state, player, definitions);
    if (candidates.length === 0) throw new Error("REINES_ALCHEMIST_EMPTY");
    const direct = typeof data.trimmauSkillId === "string" ? data.trimmauSkillId : undefined;
    if (direct) {
      if (!candidates.includes(direct as TrimmauSkillId)) throw new Error("REINES_ALCHEMIST_SELECTION_INVALID");
      return createTrimmauInHand(state, player, direct as TrimmauSkillId, definitions);
    }
    return openDecision(context, "alchemist", candidates.map((id) => ({ id, label: definitions[`card.skill.${id}`]?.name ?? id })), { candidates });
  }

  if (skill.id === REINES_LITTLE_DEVIL_ID) {
    if (eventType !== "combat.resolved") return;
    return resolveLittleDevil(context, event);
  }

  if (skill.id === REINES_ASCENSION_ID) {
    if (eventType !== "skill.unlocked" || event.playerId !== player.id || event.skillId !== skill.id) return;
    syncAscensionModifier(state, player, definitions);
    return { trimmauPlayedCount: trimmauPlayedCount(player) };
  }

  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
  if (skill.id === REINES_POWER_ID) {
    if (abilityId === REINES_SCALP_ABILITY) {
      if (state.phase !== "action" || state.activePlayerId !== player.id || !physicalSkillInZone(state, player, skill.id, definitions, "attack")) throw new Error("REINES_SCALP_WINDOW_INVALID");
      const candidates = playableHandAttackIds(state, player, definitions);
      if (candidates.length === 0) throw new Error("REINES_SCALP_NO_ATTACK");
      const direct = typeof data.instanceId === "string" ? data.instanceId : undefined;
      if (direct) return playScalpAttack(context, direct);
      return openDecision(context, "scalp-attack", candidates.map((id) => ({ id, label: definitions[state.cards[id].definitionId]?.name ?? id })), { candidates });
    }
    if (abilityId === REINES_POWER_HAND_ABILITY) {
      if (state.phase !== "combat" || state.activePlayerId !== player.id || !physicalSkillInZone(state, player, skill.id, definitions, "hand")) throw new Error("REINES_POWER_HAND_WINDOW_INVALID");
      player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 2;
      return { powerBonus: 2 };
    }
  }

  if (skill.id === REINES_MOVEMENT_ID) {
    if (abilityId === REINES_WING_ACTION_ABILITY) {
      if (state.phase !== "action" || state.activePlayerId !== player.id || !physicalSkillInZone(state, player, skill.id, definitions, "attack")) throw new Error("REINES_WING_ACTION_WINDOW_INVALID");
      return movePlayerOneSpaceByEffect(state, player.id, "backward", definitions);
    }
    if (abilityId === REINES_WING_HAND_ABILITY) {
      if (state.phase !== "combat" || state.activePlayerId !== player.id || !physicalSkillInZone(state, player, skill.id, definitions, "hand")) throw new Error("REINES_WING_HAND_WINDOW_INVALID");
      return movePlayerOneSpaceByEffect(state, player.id, "forward", definitions);
    }
  }

  if (skill.id === REINES_MANA_ID) {
    if (abilityId === REINES_MANA_HAND_ABILITY) {
      if (state.phase !== "combat" || state.activePlayerId !== player.id || !physicalSkillInZone(state, player, skill.id, definitions, "hand")) throw new Error("REINES_MANA_HAND_WINDOW_INVALID");
      return { manaGained: gainMana(player, 1) };
    }
    if (abilityId === REINES_CONFESSION_ABILITY) {
      if (state.phase !== "action" || state.activePlayerId !== player.id || !physicalSkillInZone(state, player, skill.id, definitions, "attack")) throw new Error("REINES_CONFESSION_WINDOW_INVALID");
      const candidates = sameLocationOpponentIds(state, player);
      if (candidates.length === 0) throw new Error("REINES_CONFESSION_NO_TARGET");
      const direct = typeof data.targetPlayerId === "string" ? data.targetPlayerId : undefined;
      if (direct) return resolveConfessionTarget(context, direct);
      return openDecision(context, "confession-target", candidates.map((id) => ({ id, label: state.players[id].name })), { candidates });
    }
  }

  throw new Error("REINES_ABILITY_INVALID");
};

export const isReinesTrimmauLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId) return false;
  if (skill.id === REINES_ALCHEMIST_ID) return ability?.id === REINES_ALCHEMIST_ABILITY && state.phase === "action" && availableOutsideTrimmau(state, player, definitions).length > 0;
  if (skill.id === REINES_POWER_ID) {
    if (ability?.id === REINES_SCALP_ABILITY) return state.phase === "action" && Boolean(physicalSkillInZone(state, player, skill.id, definitions, "attack")) && playableHandAttackIds(state, player, definitions).length > 0;
    return ability?.id === REINES_POWER_HAND_ABILITY && state.phase === "combat" && Boolean(physicalSkillInZone(state, player, skill.id, definitions, "hand"));
  }
  if (skill.id === REINES_MOVEMENT_ID) {
    if (ability?.id === REINES_WING_ACTION_ABILITY) return state.phase === "action" && Boolean(physicalSkillInZone(state, player, skill.id, definitions, "attack"));
    return ability?.id === REINES_WING_HAND_ABILITY && state.phase === "combat" && Boolean(physicalSkillInZone(state, player, skill.id, definitions, "hand"));
  }
  if (skill.id === REINES_MANA_ID) {
    if (ability?.id === REINES_MANA_HAND_ABILITY) return state.phase === "combat" && Boolean(physicalSkillInZone(state, player, skill.id, definitions, "hand"));
    return ability?.id === REINES_CONFESSION_ABILITY && state.phase === "action" && Boolean(physicalSkillInZone(state, player, skill.id, definitions, "attack")) && sameLocationOpponentIds(state, player).length > 0;
  }
  return false;
};
