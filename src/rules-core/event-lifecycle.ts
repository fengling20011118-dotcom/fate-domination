import type { GameState } from "../domain/state/types.ts";

export type EventLocation = "mountain" | "city";
export type EventZone = "deck" | "discard" | "removed" | "current";

export interface EventMoveDestination {
  zone: EventZone;
  locationId?: EventLocation;
  visibility?: "up" | "down";
  position?: "top" | "bottom";
}

interface ReservedEventGroup {
  sourceId: string;
  controllerPlayerId?: string;
  eventIds: string[];
}

type ReservedEventGroups = Record<string, ReservedEventGroup>;
const RESERVED_EVENT_GROUPS_KEY = "reservedEventGroups";

function reservedEventGroups(state: GameState): ReservedEventGroups {
  const raw = state.modeState[RESERVED_EVENT_GROUPS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ReservedEventGroups;
}

function writeReservedEventGroups(state: GameState, groups: ReservedEventGroups): void {
  state.modeState[RESERVED_EVENT_GROUPS_KEY] = groups;
}

function reservationContaining(state: GameState, eventId: string): string | undefined {
  const matches = Object.entries(reservedEventGroups(state)).filter(([, group]) => group.eventIds.includes(eventId));
  if (matches.length > 1) throw new Error("EVENT_RESERVATION_DUPLICATE");
  return matches[0]?.[0];
}

function shuffle(values: string[], randomInt: (maxExclusive: number) => number): string[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function assertLocation(locationId: string): asserts locationId is EventLocation {
  if (locationId !== "mountain" && locationId !== "city") throw new Error("EVENT_LOCATION_INVALID");
}

function assertCurrentEvent(state: GameState, locationId: EventLocation, eventId: string): void {
  if (!state.board.currentEvents[locationId]?.includes(eventId)) throw new Error("EVENT_NOT_IN_LOCATION");
}

function namedPoolIdForEvent(state: GameState, eventId: string): string | undefined {
  const matches = Object.entries(state.board.namedEventPools ?? {})
    .filter(([, pool]) => pool.allIds.includes(eventId))
    .map(([poolId]) => poolId);
  if (matches.length > 1) throw new Error(`EVENT_NAMED_POOL_DUPLICATE:${eventId}`);
  return matches[0];
}

function activeLocationPoolId(state: GameState, locationId: EventLocation): string | undefined {
  const override = state.board.eventPoolOverrides?.[locationId];
  if (!override) return undefined;
  if (!state.board.namedEventPools?.[override.poolId]) throw new Error("EVENT_POOL_OVERRIDE_MISSING");
  if (override.controllerPlayerId && state.players[override.controllerPlayerId]?.eliminated) {
    delete state.board.eventPoolOverrides?.[locationId];
    return undefined;
  }
  return override.poolId;
}

/** Initialize an independent event/objective pool without exposing its order. */
export function initializeNamedEventPool(
  state: GameState,
  poolId: string,
  eventIds: string[],
  randomInt: (maxExclusive: number) => number,
): void {
  if (!poolId || !Array.isArray(eventIds) || eventIds.some((id) => typeof id !== "string" || !id)) throw new Error("NAMED_EVENT_POOL_INVALID");
  if (new Set(eventIds).size !== eventIds.length) throw new Error("NAMED_EVENT_POOL_DUPLICATE");
  const pools = state.board.namedEventPools ??= {};
  pools[poolId] = { allIds: [...eventIds], deck: shuffle(eventIds, randomInt), discard: [] };
}

function removeNamedPoolEvent(state: GameState, poolId: string, eventId: string): void {
  const pool = state.board.namedEventPools?.[poolId];
  if (!pool || !pool.allIds.includes(eventId)) throw new Error("NAMED_EVENT_POOL_EVENT_NOT_FOUND");
  const copies = pool.deck.filter((id) => id === eventId).length + pool.discard.filter((id) => id === eventId).length;
  if (copies !== 1) throw new Error(copies === 0 ? "NAMED_EVENT_POOL_EVENT_NOT_AVAILABLE" : "EVENT_ZONE_DUPLICATE");
  pool.deck = pool.deck.filter((id) => id !== eventId);
  pool.discard = pool.discard.filter((id) => id !== eventId);
  pool.allIds = pool.allIds.filter((id) => id !== eventId);
}

/** Event ids still outside the ordinary game in one named pool. */
export function getNamedEventPoolAvailableIds(state: GameState, poolId: string): string[] {
  const pool = state.board.namedEventPools?.[poolId];
  if (!pool) throw new Error("NAMED_EVENT_POOL_NOT_FOUND");
  return [...pool.deck, ...pool.discard];
}

/** Permanently remove one event directly from a named outside-game pool. */
export function removeNamedEventFromGame(state: GameState, poolId: string, eventId: string): void {
  removeNamedPoolEvent(state, poolId, eventId);
  state.board.eventRemoved.push(eventId);
  delete state.board.eventVisibility[eventId];
}

/** Release one outside-game event into the ordinary event deck. */
export function releaseNamedEventToMainDeck(state: GameState, poolId: string, eventId: string, position: "top" | "bottom" = "bottom"): void {
  removeNamedPoolEvent(state, poolId, eventId);
  if (position === "top") state.board.eventDeck.unshift(eventId);
  else state.board.eventDeck.push(eventId);
  delete state.board.eventVisibility[eventId];
}

/** Release one outside-game event directly onto a battlefield. */
export function releaseNamedEventToLocation(
  state: GameState,
  poolId: string,
  eventId: string,
  locationId: EventLocation,
  visibility: "up" | "down" = "up",
): void {
  assertLocation(locationId);
  removeNamedPoolEvent(state, poolId, eventId);
  state.board.currentEvents[locationId].push(eventId);
  state.board.eventVisibility[eventId] = visibility;
}

/** Draw/reveal ordinary events for a pending rule decision without placing them on a battlefield. */
export function drawMainEventIds(
  state: GameState,
  count: number,
  randomInt: (maxExclusive: number) => number,
): string[] {
  if (!Number.isInteger(count) || count < 0) throw new Error("EVENT_DRAW_COUNT_INVALID");
  const result: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (state.board.eventDeck.length === 0 && state.board.eventDiscard.length > 0) {
      state.board.eventDeck = shuffle(state.board.eventDiscard, randomInt);
      state.board.eventDiscard = [];
    }
    const eventId = state.board.eventDeck.shift();
    if (!eventId) throw new Error("EVENT_DECK_EMPTY");
    result.push(eventId);
    delete state.board.eventVisibility[eventId];
  }
  return result;
}

function detachedEventPresent(state: GameState, eventId: string): boolean {
  return state.board.eventDeck.includes(eventId)
    || state.board.eventDiscard.includes(eventId)
    || state.board.eventRemoved.includes(eventId)
    || state.board.currentEvents.mountain.includes(eventId)
    || state.board.currentEvents.city.includes(eventId)
    || Object.values(state.board.namedEventPools ?? {}).some((pool) => pool.deck.includes(eventId) || pool.discard.includes(eventId));
}

/**
 * Insert one currently-detached event/card id into a shuffled window at the top
 * of the ordinary event deck without reshuffling the discard pile.
 */
export function shuffleDetachedEventIntoTopWindow(
  state: GameState,
  eventId: string,
  windowSize: number,
  randomInt: (maxExclusive: number) => number,
): void {
  if (!eventId || !Number.isInteger(windowSize) || windowSize < 0) throw new Error("EVENT_TOP_WINDOW_INVALID");
  if (detachedEventPresent(state, eventId)) throw new Error("EVENT_NOT_DETACHED");
  const count = Math.min(windowSize, state.board.eventDeck.length);
  const window = state.board.eventDeck.splice(0, count);
  state.board.eventDeck = [...shuffle([...window, eventId], randomInt), ...state.board.eventDeck];
}

/** Return an event currently reserved outside the authoritative zones to the ordinary deck. */
export function returnDetachedEventToMainDeck(state: GameState, eventId: string): void {
  if (detachedEventPresent(state, eventId)) throw new Error("EVENT_NOT_DETACHED");
  state.board.eventDeck.push(eventId);
}

/** Permanently remove an event currently reserved outside the authoritative zones. */
export function removeDetachedEventFromGame(state: GameState, eventId: string): void {
  if (detachedEventPresent(state, eventId)) throw new Error("EVENT_NOT_DETACHED");
  state.board.eventRemoved.push(eventId);
}

/** Shuffle only the ordinary event deck. */
export function shuffleMainEventDeck(state: GameState, randomInt: (maxExclusive: number) => number): void {
  state.board.eventDeck = shuffle(state.board.eventDeck, randomInt);
}

/** Permanently redirect one battlefield's ordinary event draws to a named pool until the source controller is eliminated or the rule clears it. */
export function setLocationEventPoolOverride(
  state: GameState,
  locationId: EventLocation,
  poolId: string,
  sourceId: string,
  controllerPlayerId?: string,
): void {
  assertLocation(locationId);
  if (!state.board.namedEventPools?.[poolId]) throw new Error("NAMED_EVENT_POOL_NOT_FOUND");
  if (!sourceId) throw new Error("EVENT_POOL_OVERRIDE_SOURCE_REQUIRED");
  if (controllerPlayerId && !state.players[controllerPlayerId]) throw new Error("EVENT_POOL_OVERRIDE_CONTROLLER_INVALID");
  const overrides = state.board.eventPoolOverrides ??= {};
  overrides[locationId] = { poolId, sourceId, ...(controllerPlayerId ? { controllerPlayerId } : {}) };
}

/** Shuffle the deck that owns this event id (ordinary or named) after an effect returns the event to that deck. */
export function shuffleEventDeckContaining(state: GameState, eventId: string, randomInt: (maxExclusive: number) => number): void {
  const poolId = namedPoolIdForEvent(state, eventId);
  if (poolId) state.board.namedEventPools![poolId].deck = shuffle(state.board.namedEventPools![poolId].deck, randomInt);
  else state.board.eventDeck = shuffle(state.board.eventDeck, randomInt);
}

/** Returns event ids from one authoritative board zone without exposing display text. */
export function getEventZoneIds(state: GameState, zone: EventZone, locationId?: EventLocation): string[] {
  if (zone === "deck") return [...state.board.eventDeck];
  if (zone === "discard") return [...state.board.eventDiscard];
  if (zone === "removed") return [...(state.board.eventRemoved ?? [])];
  if (!locationId) return [...state.board.currentEvents.mountain, ...state.board.currentEvents.city];
  assertLocation(locationId);
  return [...state.board.currentEvents[locationId]];
}

type PrivateEventKnowledge = Record<string, Partial<Record<EventLocation, string[]>>>;

function privateEventKnowledge(state: GameState): PrivateEventKnowledge {
  const raw = state.modeState.privateEventKnowledge;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as PrivateEventKnowledge;
}

/** Grant one player private knowledge of currently placed events without revealing them globally. */
export function grantPrivateEventKnowledge(state: GameState, playerId: string, locationId: EventLocation, eventIds: readonly string[]): void {
  if (!state.players[playerId]) throw new Error("EVENT_KNOWLEDGE_PLAYER_INVALID");
  assertLocation(locationId);
  const current = new Set(state.board.currentEvents[locationId] ?? []);
  const valid = eventIds.filter((eventId) => current.has(eventId));
  const store = privateEventKnowledge(state);
  const byLocation = store[playerId] ?? {};
  byLocation[locationId] = [...new Set([...(byLocation[locationId] ?? []), ...valid])];
  store[playerId] = byLocation;
  state.modeState.privateEventKnowledge = store;
}

export function getPrivateEventKnowledge(state: GameState, playerId: string, locationId: EventLocation): string[] {
  assertLocation(locationId);
  return [...(privateEventKnowledge(state)[playerId]?.[locationId] ?? [])];
}

/** Clear private event knowledge for a player, optionally restricted to one location. */
export function clearPrivateEventKnowledge(state: GameState, playerId: string, locationId?: EventLocation): void {
  const store = privateEventKnowledge(state);
  if (!store[playerId]) return;
  if (locationId === undefined) delete store[playerId];
  else {
    assertLocation(locationId);
    delete store[playerId]![locationId];
    if (Object.keys(store[playerId]!).length === 0) delete store[playerId];
  }
  state.modeState.privateEventKnowledge = store;
}

function forgetPrivateEventKnowledgeForEvent(state: GameState, eventId: string): void {
  const store = privateEventKnowledge(state);
  for (const [playerId, locations] of Object.entries(store)) {
    for (const locationId of ["mountain", "city"] as const) {
      const ids = locations[locationId];
      if (!ids) continue;
      locations[locationId] = ids.filter((id) => id !== eventId);
      if (locations[locationId]!.length === 0) delete locations[locationId];
    }
    if (Object.keys(locations).length === 0) delete store[playerId];
  }
  state.modeState.privateEventKnowledge = store;
}

function detachEvent(state: GameState, eventId: string): void {
  let found = 0;
  const remove = (ids: string[]): string[] => {
    const matches = ids.filter((id) => id === eventId).length;
    found += matches;
    return ids.filter((id) => id !== eventId);
  };
  state.board.eventDeck = remove(state.board.eventDeck);
  state.board.eventDiscard = remove(state.board.eventDiscard);
  state.board.eventRemoved = remove(state.board.eventRemoved ?? []);
  for (const pool of Object.values(state.board.namedEventPools ?? {})) {
    pool.deck = remove(pool.deck);
    pool.discard = remove(pool.discard);
  }
  state.board.currentEvents.mountain = remove(state.board.currentEvents.mountain);
  state.board.currentEvents.city = remove(state.board.currentEvents.city);
  delete state.board.eventVisibility[eventId];
  if (state.board.eventVictoryPointBonuses) delete state.board.eventVictoryPointBonuses[eventId];
  if (state.board.eventVictoryPointOverrides) delete state.board.eventVictoryPointOverrides[eventId];
  forgetPrivateEventKnowledgeForEvent(state, eventId);
  if (found !== 1) throw new Error(found === 0 ? "EVENT_NOT_FOUND" : "EVENT_ZONE_DUPLICATE");
}

/** Reserve one event outside all authoritative event zones without discarding it. */
export function detachEventFromZones(state: GameState, eventId: string): void {
  const draft = structuredClone(state) as GameState;
  detachEvent(draft, eventId);
  state.board = draft.board;
}

/** Generic serializable reservation for effects that place an event/objective under a source card. */
export function reserveEventUnderSource(
  state: GameState,
  reservationId: string,
  eventId: string,
  sourceId: string,
  controllerPlayerId?: string,
): void {
  if (!reservationId || !sourceId) throw new Error("EVENT_RESERVATION_INVALID");
  if (controllerPlayerId && !state.players[controllerPlayerId]) throw new Error("EVENT_RESERVATION_CONTROLLER_INVALID");
  if (reservationContaining(state, eventId)) throw new Error("EVENT_ALREADY_RESERVED");
  const draft = structuredClone(state) as GameState;
  detachEvent(draft, eventId);
  const groups = reservedEventGroups(draft);
  const existing = groups[reservationId];
  if (existing && (existing.sourceId !== sourceId || existing.controllerPlayerId !== controllerPlayerId)) throw new Error("EVENT_RESERVATION_SOURCE_MISMATCH");
  groups[reservationId] = {
    sourceId,
    ...(controllerPlayerId ? { controllerPlayerId } : {}),
    eventIds: [...(existing?.eventIds ?? []), eventId],
  };
  writeReservedEventGroups(draft, groups);
  state.board = draft.board;
  state.modeState = draft.modeState;
}

export function getReservedEventIds(state: GameState, reservationId: string): string[] {
  return [...(reservedEventGroups(state)[reservationId]?.eventIds ?? [])];
}

function takeReservedEvent(state: GameState, reservationId: string, eventId: string): void {
  const groups = reservedEventGroups(state);
  const group = groups[reservationId];
  if (!group || !group.eventIds.includes(eventId)) throw new Error("EVENT_NOT_RESERVED");
  group.eventIds = group.eventIds.filter((id) => id !== eventId);
  if (group.eventIds.length === 0) delete groups[reservationId];
  writeReservedEventGroups(state, groups);
}

export function releaseReservedEventToLocation(
  state: GameState,
  reservationId: string,
  eventId: string,
  locationId: EventLocation,
  visibility: "up" | "down" = "up",
): void {
  assertLocation(locationId);
  if (detachedEventPresent(state, eventId)) throw new Error("EVENT_RESERVED_TARGET_NOT_DETACHED");
  takeReservedEvent(state, reservationId, eventId);
  state.board.currentEvents[locationId].push(eventId);
  state.board.eventVisibility[eventId] = visibility;
}

export function releaseReservedEventsToDiscard(state: GameState, reservationId: string): string[] {
  const ids = getReservedEventIds(state, reservationId);
  for (const eventId of ids) {
    if (detachedEventPresent(state, eventId)) throw new Error("EVENT_RESERVED_TARGET_NOT_DETACHED");
    takeReservedEvent(state, reservationId, eventId);
    state.board.eventDiscard.push(eventId);
    state.board.eventVisibility[eventId] = "down";
  }
  return ids;
}

/** Move one event between authoritative event zones while preserving zone uniqueness. */
export function moveEvent(state: GameState, eventId: string, destination: EventMoveDestination): void {
  if (typeof eventId !== "string" || !eventId) throw new Error("EVENT_ID_INVALID");
  if (!destination || !["deck", "discard", "removed", "current"].includes(destination.zone)) throw new Error("EVENT_DESTINATION_INVALID");
  if (destination.zone === "current") {
    if (!destination.locationId) throw new Error("EVENT_LOCATION_INVALID");
    assertLocation(destination.locationId);
  } else if (destination.locationId !== undefined) throw new Error("EVENT_LOCATION_INVALID");
  const draft = structuredClone(state) as GameState;
  detachEvent(draft, eventId);
  const namedPoolId = namedPoolIdForEvent(draft, eventId);
  if (destination.zone === "deck") {
    const deck = namedPoolId ? draft.board.namedEventPools![namedPoolId].deck : draft.board.eventDeck;
    if (destination.position === "top") deck.unshift(eventId);
    else deck.push(eventId);
  } else if (destination.zone === "discard") {
    if (namedPoolId) draft.board.namedEventPools![namedPoolId].discard.push(eventId);
    else draft.board.eventDiscard.push(eventId);
  }
  else if (destination.zone === "removed") draft.board.eventRemoved.push(eventId);
  else {
    draft.board.currentEvents[destination.locationId!].push(eventId);
    draft.board.eventVisibility[eventId] = destination.visibility ?? "down";
  }
  state.board = draft.board;
}

/** Add an authoritative reward bonus to one currently placed event. */
export function addEventVictoryPointBonus(state: GameState, eventId: string, amount: number): void {
  if (!Number.isInteger(amount)) throw new Error("EVENT_VICTORY_POINT_BONUS_INVALID");
  const isCurrent = state.board.currentEvents.mountain.includes(eventId) || state.board.currentEvents.city.includes(eventId);
  if (!isCurrent) throw new Error("EVENT_NOT_CURRENT");
  const bonuses = state.board.eventVictoryPointBonuses ??= {};
  const current = Number(bonuses[eventId] ?? 0);
  if (!Number.isInteger(current)) throw new Error("EVENT_VICTORY_POINT_BONUS_INVALID");
  bonuses[eventId] = current + amount;
}

export function getEventVictoryPointBonus(state: GameState, eventId: string): number {
  const value = Number(state.board.eventVictoryPointBonuses?.[eventId] ?? 0);
  if (!Number.isInteger(value)) throw new Error("EVENT_VICTORY_POINT_BONUS_INVALID");
  return value;
}

/** Override one current event's printed VP value through structured state. */
export function setEventVictoryPointOverride(
  state: GameState,
  eventId: string,
  value: number,
  sourceId: string,
  options: { maxValue?: number; round?: number } = {},
): void {
  const isCurrent = state.board.currentEvents.mountain.includes(eventId) || state.board.currentEvents.city.includes(eventId);
  if (!isCurrent) throw new Error("EVENT_NOT_CURRENT");
  if (!Number.isInteger(value) || value < 0 || !sourceId) throw new Error("EVENT_VICTORY_POINT_OVERRIDE_INVALID");
  if (options.maxValue !== undefined && (!Number.isInteger(options.maxValue) || options.maxValue < 0)) throw new Error("EVENT_VICTORY_POINT_OVERRIDE_INVALID");
  if (options.round !== undefined && (!Number.isInteger(options.round) || options.round < 0)) throw new Error("EVENT_VICTORY_POINT_OVERRIDE_INVALID");
  state.board.eventVictoryPointOverrides ??= {};
  state.board.eventVictoryPointOverrides[eventId] = {
    value,
    sourceId,
    ...(options.maxValue === undefined ? {} : { maxValue: options.maxValue }),
    ...(options.round === undefined ? {} : { round: options.round }),
  };
}

/** Resolve an event's effective VP reward after absolute override, additive bonus, and optional increase cap. */
export function getEffectiveEventVictoryPoints(state: GameState, eventId: string, printedValue: number): number {
  if (!Number.isInteger(printedValue) || printedValue < 0) throw new Error("EVENT_VICTORY_POINTS_INVALID");
  const override = state.board.eventVictoryPointOverrides?.[eventId];
  const overrideActive = Boolean(override && (override.round === undefined || override.round === state.round));
  const base = overrideActive ? Number(override!.value) : printedValue;
  const bonus = getEventVictoryPointBonus(state, eventId);
  if (!Number.isInteger(base) || base < 0) throw new Error("EVENT_VICTORY_POINT_OVERRIDE_INVALID");
  let result = Math.max(0, base + bonus);
  if (overrideActive && override!.maxValue !== undefined) result = Math.min(result, Number(override!.maxValue));
  return result;
}

/** Reveal an event already placed at a location without changing its identity. */
export function revealEvent(state: GameState, locationId: EventLocation, eventId: string): void {
  assertLocation(locationId);
  assertCurrentEvent(state, locationId, eventId);
  state.board.eventVisibility[eventId] = "up";
}

/** Move an event from a location to the event discard pile. */
export function removeEventFromLocation(state: GameState, locationId: EventLocation, eventId: string): void {
  assertLocation(locationId);
  assertCurrentEvent(state, locationId, eventId);
  moveEvent(state, eventId, { zone: "discard" });
}

/**
 * Draw one event from the authoritative deck and place it at a location.
 * When the deck is exhausted, the discard pile is shuffled back in first.
 */
export function drawEventToLocation(
  state: GameState,
  locationId: EventLocation,
  randomInt: (maxExclusive: number) => number,
  visibility: "up" | "down" = "down",
): string {
  const eventId = tryDrawEventToLocation(state, locationId, randomInt, visibility);
  if (!eventId) throw new Error("EVENT_DECK_EMPTY");
  return eventId;
}

/** Draw for one location, respecting a location-specific named pool. Empty named pools legitimately produce no event. */
export function tryDrawEventToLocation(
  state: GameState,
  locationId: EventLocation,
  randomInt: (maxExclusive: number) => number,
  visibility: "up" | "down" = "down",
): string | undefined {
  assertLocation(locationId);
  const poolId = activeLocationPoolId(state, locationId);
  let deck = poolId ? state.board.namedEventPools![poolId].deck : state.board.eventDeck;
  let discard = poolId ? state.board.namedEventPools![poolId].discard : state.board.eventDiscard;
  if (deck.length === 0 && discard.length > 0) {
    deck = shuffle(discard, randomInt);
    discard = [];
    if (poolId) {
      state.board.namedEventPools![poolId].deck = deck;
      state.board.namedEventPools![poolId].discard = discard;
    } else {
      state.board.eventDeck = deck;
      state.board.eventDiscard = discard;
    }
  }
  const eventId = deck.shift();
  if (!eventId) return undefined;
  state.board.currentEvents[locationId].push(eventId);
  state.board.eventVisibility[eventId] = visibility;
  return eventId;
}

/** Remove the specified event and immediately draw its replacement. */
export function replaceEventAtLocation(
  state: GameState,
  locationId: EventLocation,
  eventId: string,
  randomInt: (maxExclusive: number) => number,
  visibility: "up" | "down" = "down",
): string {
  // Replacement is a single rules transaction: if no replacement can be
  // drawn, the original event remains in play and the discard pile is intact.
  const draft = structuredClone(state) as GameState;
  removeEventFromLocation(draft, locationId, eventId);
  const replacement = drawEventToLocation(draft, locationId, randomInt, visibility);
  state.board = draft.board;
  return replacement;
}
