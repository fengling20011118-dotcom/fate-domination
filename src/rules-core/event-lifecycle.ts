import type { GameState } from "../domain/state/types.ts";

export type EventLocation = "mountain" | "city";

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
  state.board.currentEvents[locationId] = state.board.currentEvents[locationId].filter((id) => id !== eventId);
  delete state.board.eventVisibility[eventId];
  if (!state.board.eventDiscard.includes(eventId)) state.board.eventDiscard.push(eventId);
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
  assertLocation(locationId);
  if (state.board.eventDeck.length === 0 && state.board.eventDiscard.length > 0) {
    state.board.eventDeck = shuffle(state.board.eventDiscard, randomInt);
    state.board.eventDiscard = [];
  }
  const eventId = state.board.eventDeck.shift();
  if (!eventId) throw new Error("EVENT_DECK_EMPTY");
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
  removeEventFromLocation(state, locationId, eventId);
  return drawEventToLocation(state, locationId, randomInt, visibility);
}
