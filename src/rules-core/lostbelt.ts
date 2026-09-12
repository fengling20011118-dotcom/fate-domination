import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import {
  drawMainEventIds,
  getNamedEventPoolAvailableIds,
  moveEvent,
  releaseNamedEventToLocation,
  releaseNamedEventToMainDeck,
  removeDetachedEventFromGame,
  returnDetachedEventToMainDeck,
  shuffleMainEventDeck,
  type EventLocation,
} from "./event-lifecycle.ts";
import { adjustVictoryPoints, gainVictoryPoints, loseMana } from "./resources.ts";
import type { SkillHandler } from "./skill-types.ts";

export const LOSTBELT_EXPANSION_HANDLER = "core.lostbelt-expansion";
export const LOSTBELT_EXPANSION_RESOLVE = "core.lostbelt-expansion-resolve";
export const LOSTBELT_OBJECTIVE_HANDLER = "core.lostbelt-objective";

const GROUP_TAG = "lostbelt-group:";
const POOL_TAG = "lostbelt-pool:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tags(definition: CardDefinition | undefined): string[] {
  return definition?.tags?.filter((tag): tag is string => typeof tag === "string") ?? [];
}

export function lostbeltGroup(definition: CardDefinition | undefined): string | undefined {
  return tags(definition).find((tag) => tag.startsWith(GROUP_TAG))?.slice(GROUP_TAG.length);
}

export function lostbeltPoolId(definition: { tags?: string[] } | undefined): string | undefined {
  return definition?.tags?.find((tag) => tag.startsWith(POOL_TAG))?.slice(POOL_TAG.length);
}

function hasTag(definition: CardDefinition | undefined, tag: string): boolean {
  return tags(definition).includes(tag);
}

export function setLostbeltObjectiveImmunity(player: PlayerState, group: string, immune = true): void {
  if (!group) throw new Error("LOSTBELT_GROUP_REQUIRED");
  const key = `lostbeltObjectiveImmunity:${group}`;
  if (immune) player.flags[key] = true;
  else delete player.flags[key];
}

export function isPlayerImmuneToLostbeltObjective(player: PlayerState | undefined, definition: CardDefinition | undefined): boolean {
  const group = lostbeltGroup(definition);
  return Boolean(player && group && player.flags[`lostbeltObjectiveImmunity:${group}`] === true);
}

function currentObjectiveDefinitions(
  state: GameState,
  locationId: EventLocation,
  definitions: Record<string, CardDefinition>,
): Array<{ eventId: string; definition: CardDefinition }> {
  return (state.board.currentEvents[locationId] ?? []).flatMap((eventId) => {
    const definition = definitions[eventId];
    return definition && hasTag(definition, "lostbelt-objective") ? [{ eventId, definition }] : [];
  });
}

export function getLostbeltPresencePowerBonus(
  state: GameState,
  player: PlayerState,
  locationId: string | undefined,
  definitions: Record<string, CardDefinition>,
): number {
  if (locationId !== "mountain" && locationId !== "city") return 0;
  const groups = new Set(currentObjectiveDefinitions(state, locationId, definitions)
    .map(({ definition }) => lostbeltGroup(definition))
    .filter((group): group is string => Boolean(group)));
  let total = 0;
  for (const group of groups) {
    const amount = Number(player.flags[`lostbeltPresencePowerBonus:${group}`] ?? 0);
    if (!Number.isFinite(amount)) throw new Error("LOSTBELT_PRESENCE_POWER_INVALID");
    total += amount;
  }
  return total;
}

export function isPlayerExitBlockedByLostbeltObjective(
  state: GameState,
  playerId: string,
  targetLocationId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  const player = state.players[playerId];
  if (!player?.locationId || player.locationId === targetLocationId) return false;
  if (player.locationId !== "mountain" && player.locationId !== "city") return false;
  return currentObjectiveDefinitions(state, player.locationId, definitions)
    .some(({ definition }) => hasTag(definition, "lostbelt:block-exit") && !isPlayerImmuneToLostbeltObjective(player, definition));
}

function applyFrozenWastes(
  state: GameState,
  locationId: EventLocation,
  eventId: string,
  definitions: Record<string, CardDefinition>,
  targetPlayerIds: readonly string[],
): number {
  const definition = definitions[eventId];
  if (!definition || !hasTag(definition, "lostbelt-effect:frozen-wastes")) return 0;
  let totalLost = 0;
  for (const playerId of targetPlayerIds) {
    const target = state.players[playerId];
    if (!target || target.eliminated || target.locationId !== locationId || isPlayerImmuneToLostbeltObjective(target, definition)) continue;
    totalLost += loseMana(target, 2);
  }
  return totalLost;
}

/** Mandatory event/objective rules driven only by structured event tags. */
export function applyLostbeltObjectiveRuntimeEvent(
  state: GameState,
  eventType: string,
  payload: unknown,
  definitions: Record<string, CardDefinition>,
): void {
  const event = isRecord(payload) ? payload : {};
  if (eventType === "event.revealed") {
    const locationId = event.locationId === "mountain" || event.locationId === "city" ? event.locationId : undefined;
    const eventId = typeof event.eventId === "string" ? event.eventId : undefined;
    if (!locationId || !eventId) return;
    applyFrozenWastes(state, locationId, eventId, definitions, state.board.locations[locationId] ?? []);
    return;
  }
  if (eventType === "player.entered-location") {
    const locationId = event.locationId === "mountain" || event.locationId === "city" ? event.locationId : undefined;
    const playerId = typeof event.playerId === "string" ? event.playerId : undefined;
    if (!locationId || !playerId) return;
    for (const { eventId } of currentObjectiveDefinitions(state, locationId, definitions)) {
      applyFrozenWastes(state, locationId, eventId, definitions, [playerId]);
    }
    return;
  }
  if (eventType !== "combat.resolved") return;
  const locationId = event.locationId === "mountain" || event.locationId === "city" ? event.locationId : undefined;
  if (!locationId) return;
  const participantIds = Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : [];
  const winnerIds = new Set(Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : []);
  const objectiveIds = Array.isArray(event.eventIds)
    ? event.eventIds.filter((id): id is string => typeof id === "string")
    : [...(state.board.currentEvents[locationId] ?? [])];

  for (const eventId of objectiveIds) {
    const definition = definitions[eventId];
    if (!definition || !hasTag(definition, "lostbelt-objective")) continue;
    if (hasTag(definition, "lostbelt-effect:survival-of-fittest")) {
      for (const playerId of participantIds) {
        const target = state.players[playerId];
        if (!target || winnerIds.has(playerId) || isPlayerImmuneToLostbeltObjective(target, definition)) continue;
        adjustVictoryPoints(target, -3);
      }
    }
    if (hasTag(definition, "lostbelt-effect:royal-decree")) {
      for (const target of Object.values(state.players)) {
        if (target.eliminated || target.locationId === locationId || isPlayerImmuneToLostbeltObjective(target, definition)) continue;
        adjustVictoryPoints(target, -2);
        if (!target.locationId) {
          const gained = Number(target.flags.roundVictoryPointsGained ?? 0);
          if (!Number.isInteger(gained) || gained < 0) throw new Error("LOSTBELT_ROUND_VICTORY_POINTS_INVALID");
          if (gained > 0) adjustVictoryPoints(target, -gained);
        }
      }
    }
    if (hasTag(definition, "lostbelt:remove-after-combat")
      && (state.board.currentEvents[locationId] ?? []).includes(eventId)) {
      moveEvent(state, eventId, { zone: "removed" });
    }
  }
}

function expansionOptions(
  drawnEventIds: readonly string[],
  outsideEventIds: readonly string[],
  definitions: Record<string, CardDefinition>,
): Array<{ id: string; label: string }> {
  return [
    { id: "skip", label: "Do not replace an objective" },
    ...drawnEventIds.flatMap((drawnId) => outsideEventIds.map((outsideId) => ({
      id: `replace:${drawnId}:${outsideId}`,
      label: `Replace ${definitions[drawnId]?.name ?? drawnId} with ${definitions[outsideId]?.name ?? outsideId}`,
    }))),
  ];
}

export function beginLostbeltExpansion(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  poolId: string,
  remaining: number,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): { pending: true; drawnEventIds: string[] } {
  if (!Number.isInteger(remaining) || remaining < 1) throw new Error("LOSTBELT_EXPANSION_COUNT_INVALID");
  const drawnEventIds = drawMainEventIds(state, 2, randomInt);
  const outsideEventIds = getNamedEventPoolAvailableIds(state, poolId).filter((eventId) => !hasTag(definitions[eventId], "lostbelt:no-return"));
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:lostbelt-expand:${remaining}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: LOSTBELT_EXPANSION_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { poolId, remaining, drawnEventIds, outsideEventIds },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "lostbelt-expansion",
    options: expansionOptions(drawnEventIds, outsideEventIds, definitions),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, drawnEventIds };
}

export const resolveLostbeltExpansion: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision, emitEvent }) => {
  if (!definitions || !randomInt || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("LOSTBELT_EXPANSION_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error("LOSTBELT_EXPANSION_DECISION_INVALID");
  const poolId = typeof previous.poolId === "string" ? previous.poolId : undefined;
  const remaining = Number(previous.remaining);
  const drawnEventIds = Array.isArray(previous.drawnEventIds) ? previous.drawnEventIds.filter((id): id is string => typeof id === "string") : [];
  const outsideEventIds = Array.isArray(previous.outsideEventIds) ? previous.outsideEventIds.filter((id): id is string => typeof id === "string") : [];
  if (!poolId || !Number.isInteger(remaining) || remaining < 1 || drawnEventIds.length !== 2) throw new Error("LOSTBELT_EXPANSION_STATE_INVALID");

  const selection = selections[0];
  let expandedEventId: string | undefined;
  if (selection === "skip") {
    for (const eventId of drawnEventIds) returnDetachedEventToMainDeck(state, eventId);
  } else {
    const prefix = "replace:";
    if (!selection.startsWith(prefix)) throw new Error("LOSTBELT_EXPANSION_SELECTION_INVALID");
    const rest = selection.slice(prefix.length);
    const drawnEventId = drawnEventIds.find((id) => rest.startsWith(`${id}:`));
    if (!drawnEventId) throw new Error("LOSTBELT_EXPANSION_SELECTION_INVALID");
    const outsideEventId = rest.slice(drawnEventId.length + 1);
    if (!outsideEventIds.includes(outsideEventId) || !getNamedEventPoolAvailableIds(state, poolId).includes(outsideEventId)) {
      throw new Error("LOSTBELT_EXPANSION_SELECTION_INVALID");
    }
    for (const eventId of drawnEventIds) {
      if (eventId === drawnEventId) removeDetachedEventFromGame(state, eventId);
      else returnDetachedEventToMainDeck(state, eventId);
    }
    releaseNamedEventToMainDeck(state, poolId, outsideEventId);
    expandedEventId = outsideEventId;
  }
  shuffleMainEventDeck(state, randomInt);
  emitEvent?.("lostbelt.expanded", { playerId: player.id, poolId, sourceId: skill.id, expandedEventId: expandedEventId ?? null });
  if (remaining > 1) return beginLostbeltExpansion(state, player, skill.id, poolId, remaining - 1, definitions, randomInt, openDecision);
  return { expandedEventId };
};

export const useLostbeltExpansionRule: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision }) => {
  if (!definitions || !randomInt) throw new Error("LOSTBELT_EXPANSION_CONTEXT_REQUIRED");
  const poolId = lostbeltPoolId(skill);
  if (!poolId) throw new Error("LOSTBELT_EXPANSION_POOL_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const count = Number(data.count ?? 1);
  return beginLostbeltExpansion(state, player, skill.id, poolId, count, definitions, randomInt, openDecision);
};

/** Objective skill cards are catalogue anchors; their board effects are executed by objective definitions. */
export const useLostbeltObjectiveAnchor: SkillHandler = () => ({ active: true });

export function placeLostbeltObjectiveFromOutsideGame(
  state: GameState,
  player: PlayerState,
  poolId: string,
  eventId: string,
  definitions: Record<string, CardDefinition>,
): { eventId: string; locationId: EventLocation } {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("LOSTBELT_BATTLEFIELD_REQUIRED");
  if (!getNamedEventPoolAvailableIds(state, poolId).includes(eventId)) throw new Error("LOSTBELT_OBJECTIVE_NOT_AVAILABLE");
  releaseNamedEventToLocation(state, poolId, eventId, locationId, "up");
  const definition = definitions[eventId];
  if (!definition || !hasTag(definition, "lostbelt-objective")) throw new Error("LOSTBELT_OBJECTIVE_DEFINITION_INVALID");
  return { eventId, locationId };
}

export function gainLostbeltFallbackVictoryPoints(player: PlayerState, amount: number): number {
  return gainVictoryPoints(player, amount);
}
