import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import {
  getReservedEventIds,
  releaseReservedEventToLocation,
  releaseReservedEventsToDiscard,
  reserveEventUnderSource,
} from "../src/rules-core/event-lifecycle.ts";

function stateFor(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing";
  state.round = 2;
  return state;
}

test("event reservation detaches an event and can restore it to a battlefield", () => {
  const state = stateFor("event-reservation-location");
  state.board.currentEvents.mountain = ["event.fuyuki.1"];
  state.board.eventVisibility["event.fuyuki.1"] = "up";
  reserveEventUnderSource(state, "test:under-card", "event.fuyuki.1", "test.source", "p");
  assert.deepEqual(state.board.currentEvents.mountain, []);
  assert.deepEqual(getReservedEventIds(state, "test:under-card"), ["event.fuyuki.1"]);
  assert.equal(state.board.eventVisibility["event.fuyuki.1"], undefined);

  releaseReservedEventToLocation(state, "test:under-card", "event.fuyuki.1", "city", "up");
  assert.deepEqual(getReservedEventIds(state, "test:under-card"), []);
  assert.deepEqual(state.board.currentEvents.city, ["event.fuyuki.1"]);
  assert.equal(state.board.eventVisibility["event.fuyuki.1"], "up");
});

test("event reservation keeps multiple ids and can release the whole group to discard", () => {
  const state = stateFor("event-reservation-discard");
  state.board.currentEvents.mountain = ["event.fuyuki.1"];
  state.board.currentEvents.city = ["event.fuyuki.2"];
  state.board.eventVisibility = { "event.fuyuki.1": "up", "event.fuyuki.2": "down" };
  reserveEventUnderSource(state, "test:group", "event.fuyuki.1", "test.source", "p");
  reserveEventUnderSource(state, "test:group", "event.fuyuki.2", "test.source", "p");
  assert.deepEqual(getReservedEventIds(state, "test:group"), ["event.fuyuki.1", "event.fuyuki.2"]);

  const released = releaseReservedEventsToDiscard(state, "test:group");
  assert.deepEqual(released, ["event.fuyuki.1", "event.fuyuki.2"]);
  assert.deepEqual(getReservedEventIds(state, "test:group"), []);
  assert.deepEqual(state.board.eventDiscard, ["event.fuyuki.1", "event.fuyuki.2"]);
  assert.equal(state.board.eventVisibility["event.fuyuki.1"], "down");
  assert.equal(state.board.eventVisibility["event.fuyuki.2"], "down");
});
