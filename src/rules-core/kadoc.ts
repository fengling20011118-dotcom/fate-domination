import type { SkillHandler } from "./skill-types.ts";
import {
  beginLostbeltExpansion,
  gainLostbeltFallbackVictoryPoints,
  placeLostbeltObjectiveFromOutsideGame,
  setLostbeltObjectiveImmunity,
} from "./lostbelt.ts";
import { getNamedEventPoolAvailableIds } from "./event-lifecycle.ts";

export const KADOC_CRYPTER_HANDLER = "core.kadoc-crypter";
export const KADOC_FAST_EXPANSION_HANDLER = "core.kadoc-fast-expansion";
export const KADOC_FAST_EXPANSION_RESOLVE = "core.kadoc-fast-expansion-resolve";
export const KADOC_RUSSIAN_POOL_ID = "lostbelt:russia";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function availableRussianObjectives(state: Parameters<SkillHandler>[0]["state"]): string[] {
  return getNamedEventPoolAvailableIds(state, KADOC_RUSSIAN_POOL_ID);
}

export const useKadocCrypter: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision }) => {
  if (!definitions || !randomInt) throw new Error("KADOC_CRYPTER_CONTEXT_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "game.started") {
    setLostbeltObjectiveImmunity(player, "russia", true);
    return beginLostbeltExpansion(state, player, skill.id, KADOC_RUSSIAN_POOL_ID, 2, definitions, randomInt, openDecision);
  }
  if (eventType === "combat.resolved") {
    const winners = Array.isArray(event.winnerIds) ? event.winnerIds : [];
    if (!winners.includes(player.id)) return;
    return beginLostbeltExpansion(state, player, skill.id, KADOC_RUSSIAN_POOL_ID, 1, definitions, randomInt, openDecision);
  }
};

function placeSelectedObjective(
  context: Parameters<SkillHandler>[0],
  eventId: string,
): { eventId: string; locationId: "mountain" | "city" } {
  if (!context.definitions) throw new Error("KADOC_FAST_EXPANSION_DEFINITIONS_REQUIRED");
  const placed = placeLostbeltObjectiveFromOutsideGame(
    context.state,
    context.player,
    KADOC_RUSSIAN_POOL_ID,
    eventId,
    context.definitions,
  );
  context.emitEvent?.("event.revealed", { eventId: placed.eventId, locationId: placed.locationId, sourceId: context.skill.id });
  context.emitEvent?.("lostbelt.expanded", { playerId: context.player.id, poolId: KADOC_RUSSIAN_POOL_ID, sourceId: context.skill.id, expandedEventId: eventId, directPlacement: true });
  return placed;
}

export const useKadocFastExpansion: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions, openDecision } = context;
  if (!definitions) throw new Error("KADOC_FAST_EXPANSION_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "skill.unlocked") {
    if (event.playerId === player.id && event.skillId === skill.id) {
      player.flags["lostbeltPresencePowerBonus:russia"] = 5;
    }
    return;
  }
  const candidates = availableRussianObjectives(state);
  if ((player.locationId !== "mountain" && player.locationId !== "city") || candidates.length === 0) {
    return { placed: false, victoryPoints: gainLostbeltFallbackVictoryPoints(player, 5) };
  }
  const requested = typeof data.eventId === "string" ? data.eventId : undefined;
  if (requested) {
    if (!candidates.includes(requested)) throw new Error("KADOC_FAST_EXPANSION_OBJECTIVE_INVALID");
    return { placed: true, ...placeSelectedObjective(context, requested) };
  }
  if (candidates.length === 1) return { placed: true, ...placeSelectedObjective(context, candidates[0]) };
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:fast-expansion`;
  state.effectQueue.unshift({
    effectId,
    handlerId: KADOC_FAST_EXPANSION_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { candidateIds: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "kadoc-fast-expansion",
    options: candidates.map((eventId) => ({ id: eventId, label: eventId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, candidateIds: candidates };
};

export const resolveKadocFastExpansion: SkillHandler = (context) => {
  const { payload } = context;
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("KADOC_FAST_EXPANSION_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateIds)
    ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string")
    : [];
  const selections = Array.isArray(payload.decision.selections)
    ? payload.decision.selections.filter((id): id is string => typeof id === "string")
    : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) {
    throw new Error("KADOC_FAST_EXPANSION_DECISION_INVALID");
  }
  if (!availableRussianObjectives(context.state).includes(selections[0])) throw new Error("KADOC_FAST_EXPANSION_OBJECTIVE_INVALID");
  return { placed: true, ...placeSelectedObjective(context, selections[0]) };
};
