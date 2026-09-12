import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { addCardToAttack } from "../src/rules-core/card-play.ts";
import { closePlayerCard } from "../src/rules-core/decks.ts";
import {
  commitNamedSideDeckPlay,
  discardNamedSideDeckHandCards,
  drawNamedSideDeck,
  isNamedSideDeckCard,
  initializeNamedSideDeck,
  requireNamedSideDeck,
} from "../src/rules-core/named-side-decks.ts";

function stateFor(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "p", name: "p" }], seed: 7 });
  state.status = "playing";
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "p";
  return state;
}

const definitions = {
  "side.a": { id: "side.a", name: "A", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"], cardType: "attack", basic: true },
  "side.b": { id: "side.b", name: "B", cost: 0, basePower: 1, typeLabel: "迅捷", attributes: ["迅捷"], cardType: "attack", basic: true },
  "side.c": { id: "side.c", name: "C", cost: 0, basePower: 1, typeLabel: "魔术", attributes: ["魔术"], cardType: "attack", basic: true },
};

test("named side deck stays isolated from normal player zones and recycles only its own discard", () => {
  const state = stateFor("named-side-isolation");
  const side = initializeNamedSideDeck(state, "p", "test-pool", Object.keys(definitions), () => 0, { shuffle: false });
  assert.equal(side.deck.length, 3);
  assert.deepEqual(state.players.p.hand, []);
  assert.deepEqual(state.players.p.deck, []);
  assert.deepEqual(state.players.p.discard, []);
  assert.ok(side.deck.every((id) => state.cards[id].zone === "side-deck" && state.cards[id].namedSideDeckId === "test-pool"));
  assert.equal(isNamedSideDeckCard(state.cards[side.deck[0]], "test-pool"), true);
  assert.equal(isNamedSideDeckCard(state.cards[side.deck[0]], "other-pool"), false);

  const drawn = drawNamedSideDeck(state, "p", "test-pool", 2, () => 0);
  assert.equal(drawn.length, 2);
  assert.deepEqual(side.hand, drawn);
  assert.deepEqual(state.players.p.hand, []);
  discardNamedSideDeckHandCards(state, "p", "test-pool", drawn);
  assert.deepEqual(side.hand, []);
  assert.equal(side.discard.length, 2);
  assert.deepEqual(state.players.p.discard, []);

  const recycled = drawNamedSideDeck(state, "p", "test-pool", 3, () => 0);
  assert.equal(recycled.length, 3);
  assert.equal(side.hand.length, 3);
  assert.equal(side.deck.length, 0);
  assert.equal(side.discard.length, 0);
});

test("a side-hand card can be effect-played and closes back to its named side discard", () => {
  const state = stateFor("named-side-close");
  initializeNamedSideDeck(state, "p", "test-pool", Object.keys(definitions), () => 0, { shuffle: false });
  const [instanceId] = drawNamedSideDeck(state, "p", "test-pool", 1, () => 0);
  addCardToAttack(state, "p", instanceId, definitions, {
    payCost: false,
    allowedSourceZones: ["side-hand"],
    bypassSkillEightMana: true,
    bypassFaceUpPlayLimit: true,
    bypassTiming: true,
  });
  commitNamedSideDeckPlay(state, "p", "test-pool", instanceId);
  assert.ok(state.players.p.attack.includes(instanceId));
  assert.equal(state.cards[instanceId].zone, "attack");
  assert.equal(requireNamedSideDeck(state, "p", "test-pool").hand.includes(instanceId), false);

  closePlayerCard(state, "p", instanceId, definitions);
  assert.equal(state.cards[instanceId].zone, "side-discard");
  assert.equal(state.players.p.attack.includes(instanceId), false);
  assert.equal(state.players.p.discard.includes(instanceId), false);
  assert.ok(requireNamedSideDeck(state, "p", "test-pool").discard.includes(instanceId));
});
