import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { movePlayerCard } from "./decks.ts";
import { detachEventFromZones, shuffleDetachedEventIntoTopWindow, tryDrawEventToLocation, type EventLocation } from "./event-lifecycle.ts";
import { gainMana, gainVictoryPoints } from "./resources.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const JASON_HERACLES_ID = "servant.jason.skill.sc-jason-1";
export const JASON_ATALANTE_ID = "servant.jason.skill.sc-jason-2";
export const JASON_MEDEA_ID = "servant.jason.skill.sc-jason-3";
export const JASON_QUEST_HANDLER = "core.jason-argonaut-quest";
export const JASON_EXTRA_ATTACK_RESOLVE = "core.jason-extra-attack-resolve";

export const JASON_ATALANTE_ACTION_ABILITY = "atalante-action-play";
export const JASON_ATALANTE_COMBAT_ABILITY = "atalante-combat-play";
export const JASON_MEDEA_GRACE_ABILITY = "medea-gods-grace";

const QUEST_MARKER = "jason-questing";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function physicalSkill(state: GameState, player: PlayerState, definitionId: string) {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === player.id && card.definitionId === definitionId);
}

function activePhysicalSkill(state: GameState, player: PlayerState, definitionId: string) {
  const card = physicalSkill(state, player, definitionId);
  return card?.zone === "attack" && card.active && card.face === "up" ? card : undefined;
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

function markQuesting(card: GameState["cards"][string]): void {
  card.modifiers = [...(card.modifiers ?? []).filter((marker) => marker !== QUEST_MARKER), QUEST_MARKER];
}

function clearQuesting(card: GameState["cards"][string]): void {
  card.modifiers = (card.modifiers ?? []).filter((marker) => marker !== QUEST_MARKER);
}

function isQuesting(card: GameState["cards"][string] | undefined): boolean {
  return Boolean(card?.modifiers?.includes(QUEST_MARKER));
}

/** Jason's shared Quest procedure: the physical skill leaves combat and its stable definition id enters the top-10 objective window. */
export function sendJasonSkillOnQuest(
  state: GameState,
  player: PlayerState,
  skillId: string,
  randomInt: (maxExclusive: number) => number,
): { instanceId: string; skillId: string } {
  const card = physicalSkill(state, player, skillId);
  if (!card || card.zone !== "attack" || isQuesting(card)) throw new Error("JASON_QUEST_SOURCE_INVALID");
  movePlayerCard(state, player.id, card.instanceId, "removed");
  card.active = false;
  card.residual = false;
  card.face = "up";
  delete card.paidCost;
  delete card.playedRound;
  delete card.playedLocationId;
  markQuesting(card);
  shuffleDetachedEventIntoTopWindow(state, skillId, 10, randomInt);
  return { instanceId: card.instanceId, skillId };
}

function resolveQuestArrival(
  context: Parameters<SkillHandler>[0],
  locationId: EventLocation,
): { returnedInstanceId: string; replacementEventId?: string } | undefined {
  const { state, player, skill, randomInt, emitEvent } = context;
  if (!state.board.currentEvents[locationId]?.includes(skill.id)) return;
  const card = physicalSkill(state, player, skill.id);
  if (!card || card.zone !== "removed" || !isQuesting(card)) return;
  detachEventFromZones(state, skill.id);
  movePlayerCard(state, player.id, card.instanceId, "attack");
  card.controllerPlayerId = player.id;
  card.face = "up";
  card.active = true;
  card.residual = Boolean(skill.residual);
  card.joinedAttackRound = state.round;
  delete card.playedRound;
  delete card.playedLocationId;
  delete card.paidCost;
  clearQuesting(card);
  const replacementEventId = tryDrawEventToLocation(state, locationId, randomInt ?? (() => 0), "up");
  if (replacementEventId) emitEvent?.("event.revealed", { eventId: replacementEventId, locationId, sourceId: skill.id, method: "jason-quest-replacement" });
  return { returnedInstanceId: card.instanceId, ...(replacementEventId ? { replacementEventId } : {}) };
}

function emitEffectPlay(
  context: Parameters<SkillHandler>[0],
  instanceId: string,
  paidMana: number,
): void {
  const { state, player, definitions, emitEvent } = context;
  if (!definitions) throw new Error("JASON_DEFINITIONS_REQUIRED");
  const card = state.cards[instanceId];
  const definition = definitions[card.definitionId];
  if (definition.revealsTrueNameOnPlay === true && !player.trueNameRevealed) {
    revealPlayerTrueName(state, player.id);
    emitEvent?.("servant.true-name-revealed", { playerId: player.id, servantId: player.servantId, sourceDefinitionId: definition.id, method: "jason-extra-attack" });
  }
  const attributes = getCardInstanceAttributes(card, definition, state, definitions);
  emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana, attributes, method: "jason-extra-attack" });
  emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, attributes, method: "jason-extra-attack" });
}

function playExtraAttack(context: Parameters<SkillHandler>[0], instanceId: string): { instanceId: string; paidMana: number } {
  const { state, player, definitions } = context;
  if (!definitions || !playableHandAttackIds(state, player, definitions).includes(instanceId)) throw new Error("JASON_EXTRA_ATTACK_INVALID");
  const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, {
    payCost: true,
    allowedSourceZones: ["hand"],
    bypassFaceUpPlayLimit: true,
    bypassTiming: true,
  });
  emitEffectPlay(context, instanceId, paidMana);
  return { instanceId, paidMana };
}

function openExtraAttackDecision(context: Parameters<SkillHandler>[0], abilityId: string): { pending: true } {
  const { state, player, skill, definitions, openDecision } = context;
  if (!definitions) throw new Error("JASON_DEFINITIONS_REQUIRED");
  const candidates = playableHandAttackIds(state, player, definitions);
  if (candidates.length === 0) throw new Error("JASON_EXTRA_ATTACK_UNAVAILABLE");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:${abilityId}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: JASON_EXTRA_ATTACK_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { abilityId, candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "jason-extra-attack",
    options: candidates.map((id) => ({ id, label: definitions[state.cards[id].definitionId]?.name ?? id })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true };
}

export const resolveJasonExtraAttack: SkillHandler = (context) => {
  const { state, player, payload } = context;
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("JASON_EXTRA_ATTACK_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const abilityId = typeof previous.abilityId === "string" ? previous.abilityId : undefined;
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("JASON_EXTRA_ATTACK_DECISION_INVALID");
  const result = playExtraAttack(context, selections[0]);
  if (abilityId === JASON_ATALANTE_COMBAT_ABILITY) player.flags.jasonAtalanteQuestRound = state.round;
  return result;
};

export const useJasonArgonautQuest: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions, randomInt } = context;
  if (!definitions) throw new Error("JASON_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (eventType === "event.revealed") {
    const eventId = typeof event.eventId === "string" ? event.eventId : undefined;
    const locationId = event.locationId === "mountain" || event.locationId === "city" ? event.locationId : undefined;
    if (eventId !== skill.id || !locationId) return;
    return resolveQuestArrival(context, locationId);
  }

  if (skill.id === JASON_HERACLES_ID) {
    if (eventType === "card.played") {
      if (event.playerId === player.id && event.definitionId === skill.id) player.flags.jasonHeraclesArmedRound = state.round;
      return;
    }
    if (eventType === "combat.resolved") {
      if (Number(player.flags.jasonHeraclesArmedRound ?? -1) !== state.round) return;
      const participants = new Set(Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : (isRecord(event.powers) ? Object.keys(event.powers) : []));
      const winners = new Set(Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : []);
      if (!participants.has(player.id) || winners.has(player.id)) return;
      delete player.flags.jasonHeraclesArmedRound;
      const quest = sendJasonSkillOnQuest(state, player, skill.id, randomInt ?? (() => 0));
      return { ...quest, victoryPoints: gainVictoryPoints(player, 2) };
    }
    return;
  }

  if (skill.id === JASON_ATALANTE_ID) {
    if (eventType === "combat.ending") {
      if (Number(player.flags.jasonAtalanteQuestRound ?? -1) !== state.round) return;
      delete player.flags.jasonAtalanteQuestRound;
      return sendJasonSkillOnQuest(state, player, skill.id, randomInt ?? (() => 0));
    }
    const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
    if (abilityId !== JASON_ATALANTE_ACTION_ABILITY && abilityId !== JASON_ATALANTE_COMBAT_ABILITY) return;
    const expectedPhase = abilityId === JASON_ATALANTE_ACTION_ABILITY ? "action" : "combat";
    if (state.phase !== expectedPhase || state.activePlayerId !== player.id || !activePhysicalSkill(state, player, skill.id)) throw new Error("JASON_ATALANTE_WINDOW_INVALID");
    const instanceId = typeof data.instanceId === "string" ? data.instanceId : undefined;
    if (!instanceId) return openExtraAttackDecision(context, abilityId);
    const result = playExtraAttack(context, instanceId);
    if (abilityId === JASON_ATALANTE_COMBAT_ABILITY) player.flags.jasonAtalanteQuestRound = state.round;
    return result;
  }

  if (skill.id === JASON_MEDEA_ID) {
    const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
    if (abilityId !== JASON_MEDEA_GRACE_ABILITY) return;
    if (state.phase !== "combat" || state.activePlayerId !== player.id || !activePhysicalSkill(state, player, skill.id)) throw new Error("JASON_MEDEA_WINDOW_INVALID");
    const mana = gainMana(player, 2);
    player.flags.nextRoundTotalPowerBonus = Number(player.flags.nextRoundTotalPowerBonus ?? 0) + 4;
    const quest = sendJasonSkillOnQuest(state, player, skill.id, randomInt ?? (() => 0));
    return { ...quest, mana, nextRoundPowerBonus: 4 };
  }
};

export const isJasonArgonautLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId || !activePhysicalSkill(state, player, skill.id)) return false;
  if (skill.id === JASON_ATALANTE_ID) {
    if (ability?.id === JASON_ATALANTE_ACTION_ABILITY && state.phase !== "action") return false;
    if (ability?.id === JASON_ATALANTE_COMBAT_ABILITY && state.phase !== "combat") return false;
    return playableHandAttackIds(state, player, definitions).length > 0;
  }
  if (skill.id === JASON_MEDEA_ID) return ability?.id === JASON_MEDEA_GRACE_ABILITY && state.phase === "combat";
  return false;
};
