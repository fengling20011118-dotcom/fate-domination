import type { GameState, PlayerState } from "../domain/state/types.ts";
import { movePlayerByEffect } from "./board.ts";
import type { CardDefinition } from "./content-types.ts";
import { closePlayerCard } from "./decks.ts";
import { applyDefeatEffect } from "./defeat.ts";
import {
  clearPrivateEventKnowledge,
  getPrivateEventKnowledge,
  grantPrivateEventKnowledge,
} from "./event-lifecycle.ts";
import { gainMana, loseMana } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const JACK_DISSOCIATION_ID = "servant.jack.skill.sc-jack-1";
export const JACK_MIST_ID = "servant.jack.skill.sc-jack-2";
export const JACK_MARIA_ID = "servant.jack.skill.sc-jack-3";
export const JACK_DISSOCIATION_HANDLER = "core.jack-dissociation";
export const JACK_MIST_HANDLER = "core.jack-mist";
export const JACK_MARIA_HANDLER = "core.jack-maria";
export const JACK_MARIA_RESOLVE = "core.jack-maria-resolve";

const JACK_MOTHER_FLAG = "jackMotherPlayerId";
const JACK_MARIA_HIDDEN_MARKER = "effect-until-close:jack-maria-hidden-on-play";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cardMatchesSkill(card: GameState["cards"][string] | undefined, skillId: string, definitions: Record<string, CardDefinition>): boolean {
  if (!card) return false;
  const definition = definitions[card.definitionId];
  return card.definitionId === skillId || definition?.linkedSkillId === skillId;
}

function ownedSkillCard(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === player.id && cardMatchesSkill(card, skillId, definitions));
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === player.id
    && card.controllerPlayerId === player.id
    && card.zone === "attack"
    && card.face === "up"
    && card.active
    && cardMatchesSkill(card, skillId, definitions));
}

function combatParticipantIds(event: Record<string, unknown>): string[] {
  if (Array.isArray(event.participantIds)) return event.participantIds.filter((id): id is string => typeof id === "string");
  if (isRecord(event.powers)) return Object.keys(event.powers);
  return [];
}

function motherId(player: PlayerState): string | undefined {
  const value = player.flags[JACK_MOTHER_FLAG];
  return typeof value === "string" ? value : undefined;
}

function revealDissociationCard(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  const source = ownedSkillCard(state, player, JACK_DISSOCIATION_ID, definitions);
  if (source) source.face = "up";
}

export const useJackDissociation: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("JACK_DISSOCIATION_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (eventType === "servant.true-name-revealed") {
    const targetPlayerId = typeof event.playerId === "string" ? event.playerId : undefined;
    if (!targetPlayerId || targetPlayerId === player.id || state.players[targetPlayerId]?.eliminated) return;
    revealDissociationCard(state, player, definitions);
    player.flags[JACK_MOTHER_FLAG] = targetPlayerId;
    return { motherPlayerId: targetPlayerId };
  }

  if (eventType === "combat.resolved") {
    const currentMotherId = motherId(player);
    if (!currentMotherId) return;
    const participants = combatParticipantIds(event);
    const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
    if (participants.includes(player.id) && participants.includes(currentMotherId)
      && winners.includes(player.id) && !winners.includes(currentMotherId)) {
      delete player.flags[JACK_MOTHER_FLAG];
      return { clearedMotherPlayerId: currentMotherId };
    }
    return;
  }

  if (data.abilityId !== "mother-action" || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("JACK_DISSOCIATION_ABILITY_INVALID");
  }
  const currentMotherId = motherId(player);
  const mother = currentMotherId ? state.players[currentMotherId] : undefined;
  if (!mother || mother.eliminated || !mother.locationId) throw new Error("JACK_MOTHER_UNAVAILABLE");
  if (mother.locationId === player.locationId) return { manaGained: gainMana(player, 2), motherPlayerId: mother.id };
  const movement = movePlayerByEffect(state, player.id, mother.locationId, definitions);
  emitEvent?.("player.moved", { playerId: player.id, ...movement, method: "effect", sourceId: JACK_DISSOCIATION_ID });
  emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect", sourceId: JACK_DISSOCIATION_ID });
  return { motherPlayerId: mother.id, ...movement };
};

export const isJackDissociationLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  if (!player || !ability || ability.id !== "mother-action" || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  const currentMotherId = motherId(player);
  const mother = currentMotherId ? state.players[currentMotherId] : undefined;
  return Boolean(mother && !mother.eliminated && mother.locationId);
};

function forceMistObjectivesDown(state: GameState, player: PlayerState): string[] {
  const affected: string[] = [];
  for (const eventId of state.board.currentEvents.mountain ?? []) {
    if (state.board.eventVisibility[eventId] !== "up") continue;
    state.board.eventVisibility[eventId] = "down";
    affected.push(eventId);
  }
  if (affected.length > 0) grantPrivateEventKnowledge(state, player.id, "mountain", affected);
  return affected;
}

function releaseMistObjectives(state: GameState, player: PlayerState): string[] {
  const known = getPrivateEventKnowledge(state, player.id, "mountain");
  const current = new Set(state.board.currentEvents.mountain ?? []);
  const revealed: string[] = [];
  for (const eventId of known) {
    if (!current.has(eventId) || state.board.eventVisibility[eventId] !== "down") continue;
    state.board.eventVisibility[eventId] = "up";
    revealed.push(eventId);
  }
  clearPrivateEventKnowledge(state, player.id, "mountain");
  return revealed;
}

export const useJackMist: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("JACK_MIST_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  const source = activeOwnedSkill(state, player, JACK_MIST_ID, definitions);

  if (eventType === "phase.transitioned") {
    if (event.previousPhase === "action" && state.phase === "combat") {
      const eventIds = releaseMistObjectives(state, player);
      for (const eventId of eventIds) emitEvent?.("event.revealed", { eventId, locationId: "mountain", sourceId: JACK_MIST_ID });
      return { revealedEventIds: eventIds };
    }
    return;
  }

  if (eventType === "player.deployed") {
    if (!source || event.playerId !== player.id || event.locationId !== "workshop") return;
    closePlayerCard(state, player.id, source.instanceId, definitions);
    const manaLost = loseMana(player, 3);
    player.trueNameRevealed = false;
    const eventIds = releaseMistObjectives(state, player);
    for (const eventId of eventIds) emitEvent?.("event.revealed", { eventId, locationId: "mountain", sourceId: JACK_MIST_ID });
    return { closedInstanceId: source.instanceId, manaLost, trueNameHidden: true, revealedEventIds: eventIds };
  }

  if (!source) return;
  if (eventType === "round.started") {
    const manaLost = state.phase === "preparation" ? loseMana(player, 1) : 0;
    const affectedEventIds = forceMistObjectivesDown(state, player);
    return { manaLost, affectedEventIds };
  }
  if (eventType === "card.played" || eventType === "event.revealed") {
    const affectedEventIds = forceMistObjectivesDown(state, player);
    return affectedEventIds.length > 0 ? { affectedEventIds } : undefined;
  }
};

function mariaSource(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return activeOwnedSkill(state, player, JACK_MARIA_ID, definitions);
}

function mariaHiddenWhenPlayed(source: GameState["cards"][string]): boolean {
  return source.modifiers?.includes(JACK_MARIA_HIDDEN_MARKER) === true;
}

function engagedOpponentIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated);
}

function applyMariaDefeat(
  state: GameState,
  player: PlayerState,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent: SkillContext["emitEvent"],
): unknown {
  if (!engagedOpponentIds(state, player).includes(targetPlayerId)) throw new Error("JACK_MARIA_TARGET_INVALID");
  return applyDefeatEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: JACK_MARIA_ID, method: "maria-the-ripper" });
}

export const useJackMaria: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions) throw new Error("JACK_MARIA_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "card.played") {
    const event = isRecord(data.event) ? data.event : {};
    const instanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
    if (!instanceId || event.playerId !== player.id || event.face !== "up") return;
    const source = state.cards[instanceId];
    if (!cardMatchesSkill(source, JACK_MARIA_ID, definitions)) return;
    const hiddenWhenPlayed = source.trueNameRevealedWhenPlayed === false;
    if (hiddenWhenPlayed) {
      source.modifiers = [...(source.modifiers ?? []).filter((marker) => marker !== JACK_MARIA_HIDDEN_MARKER), JACK_MARIA_HIDDEN_MARKER];
    }
    return { hiddenWhenPlayed };
  }

  if (data.abilityId !== "maria-combat" || state.phase !== "combat" || state.activePlayerId !== player.id) {
    throw new Error("JACK_MARIA_ABILITY_INVALID");
  }
  const source = mariaSource(state, player, definitions);
  if (!source) throw new Error("JACK_MARIA_SOURCE_INACTIVE");
  const mistActive = Boolean(activeOwnedSkill(state, player, JACK_MIST_ID, definitions));
  const hiddenOnPlay = mariaHiddenWhenPlayed(source);
  if (!mistActive && !hiddenOnPlay) throw new Error("JACK_MARIA_CONDITION_UNMET");
  const modifierId = `${JACK_MARIA_ID}:combat-bonus:${source.instanceId}:${state.round}`;
  source.powerModifiers = [
    ...(source.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
    { id: modifierId, sourceId: JACK_MARIA_ID, kind: "add", value: 3, duration: "round" },
  ];
  if (!(mistActive && hiddenOnPlay)) return { powerBonus: 3, defeatAvailable: false };
  const candidates = engagedOpponentIds(state, player);
  if (candidates.length === 0) return { powerBonus: 3, defeatAvailable: false };
  if (candidates.length === 1) {
    return { powerBonus: 3, defeatAvailable: true, targetPlayerId: candidates[0], result: applyMariaDefeat(state, player, candidates[0], definitions, emitEvent) };
  }
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${JACK_MARIA_ID}:target`;
  state.effectQueue.unshift({
    effectId,
    handlerId: JACK_MARIA_RESOLVE,
    sourceId: JACK_MARIA_ID,
    controllerPlayerId: player.id,
    payload: { candidatePlayerIds: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "jack-maria-target",
    options: candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { powerBonus: 3, defeatAvailable: true, pending: true };
};

export const resolveJackMaria: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("JACK_MARIA_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidatePlayerIds)
    ? payload.previous.candidatePlayerIds.filter((id): id is string => typeof id === "string")
    : [];
  const selections = Array.isArray(payload.decision.selections)
    ? payload.decision.selections.filter((id): id is string => typeof id === "string")
    : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("JACK_MARIA_DECISION_INVALID");
  return applyMariaDefeat(state, player, selections[0], definitions, emitEvent);
};

export const isJackMariaLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== "maria-combat" || state.phase !== "combat" || state.activePlayerId !== playerId) return false;
  const source = mariaSource(state, player, definitions);
  if (!source) return false;
  return Boolean(activeOwnedSkill(state, player, JACK_MIST_ID, definitions) || mariaHiddenWhenPlayed(source));
};
