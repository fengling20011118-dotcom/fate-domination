import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { assertStateInvariants } from "../src/domain/state/invariants.ts";
import { attachCard, detachCard, getAttachedCards } from "../src/rules-core/card-attachments.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { restoreSnapshot, serializeSnapshot } from "../src/save/snapshots.ts";

function stateWithCards() {
  const state = createGameState({
    gameInstanceId: "attachments",
    players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }],
    seed: 1,
  });
  createOwnedCardInstance(state, "p1", { instanceId: "host", definitionId: "skill.host", zone: "servant-skills" });
  createOwnedCardInstance(state, "p1", { instanceId: "own", definitionId: "card.own", zone: "hand" });
  createOwnedCardInstance(state, "p2", { instanceId: "other", definitionId: "card.other", zone: "discard" });
  return state;
}

test("卡牌可附着于另一张实体牌并从原区域原子移除", () => {
  const state = stateWithCards();
  attachCard(state, "own", "host", "up");
  assert.deepEqual(state.players.p1.hand, []);
  assert.equal(state.cards.own.zone, "attached");
  assert.equal(state.cards.own.attachedToInstanceId, "host");
  assert.deepEqual(getAttachedCards(state, "host").map((card) => card.instanceId), ["own"]);
  assert.doesNotThrow(() => assertStateInvariants(state));
});

test("封印类效果可把其他玩家的牌附着于来源牌且不改变所有权", () => {
  const state = stateWithCards();
  attachCard(state, "other", "host", "down");
  assert.deepEqual(state.players.p2.discard, []);
  assert.equal(state.cards.other.ownerPlayerId, "p2");
  assert.equal(state.cards.other.attachedToInstanceId, "host");
  detachCard(state, "other", "discard");
  assert.deepEqual(state.players.p2.discard, ["other"]);
  assert.equal(state.cards.other.attachedToInstanceId, undefined);
  assert.doesNotThrow(() => assertStateInvariants(state));
});

test("附着关系拒绝自引用与环，并可经过快照恢复", () => {
  const state = stateWithCards();
  assert.throws(() => attachCard(state, "host", "host"), /CARD_ATTACHMENT_HOST_INVALID/);
  attachCard(state, "own", "host");
  assert.throws(() => attachCard(state, "host", "own"), /CARD_ATTACHMENT_CYCLE/);
  const restored = restoreSnapshot(serializeSnapshot(state), state.gameInstanceId);
  assert.equal(restored.cards.own.attachedToInstanceId, "host");
  assert.doesNotThrow(() => assertStateInvariants(restored));
});
