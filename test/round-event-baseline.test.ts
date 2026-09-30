import test from "node:test";
import assert from "node:assert/strict";
import raw from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { startStandardRound } from "../src/rules-core/rounds.ts";

const content = buildStandardContent(raw);
const events = content.events.filter(event => event.id.startsWith("event.fuyuki."));
const counts: Record<string, [number, number, number]> = {
  sit1: [2, 2, 1], sit2: [1, 2, 1], sit3: [2, 1, 0],
  sit11: [2, 2, 1], sit12: [2, 1, 0], sit13: [3, 1, 0],
};

for (const situation of content.situations) {
  test(`${situation.name}: baseline events plus public situation extras`, () => {
    const state = createGameState({ gameInstanceId: situation.id, players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 1 });
    state.status = "playing";
    state.board.situationDeck = [situation.id];
    state.board.eventDeck = events.map(event => event.id);
    startStandardRound(state, content.situations, events, () => 0);
    const [mountain, city, publicCity] = counts[situation.id.split('.').at(-1)!] ?? [1, 1, 0];
    assert.equal(state.board.currentEvents.mountain.length, mountain);
    assert.equal(state.board.currentEvents.city.length, city);
    assert.equal(state.board.currentEvents.city.filter(id => state.board.eventVisibility[id] === "up").length, publicCity);
    assert.equal(state.board.currentEvents.city.filter(id => state.board.eventVisibility[id] === "down").length, 1);
    assert.ok(state.board.currentEvents.mountain.every(id => state.board.eventVisibility[id] === "up"));
    const placed = [...state.board.currentEvents.mountain, ...state.board.currentEvents.city];
    assert.equal(new Set(placed).size, placed.length);
    assert.equal(state.board.eventDeck.length, events.length - placed.length);
  });
}
