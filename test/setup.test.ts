import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { assignIdentity, assertSetupReady, setPlayerReady } from "../src/rules-core/setup.ts";

test("身份选择唯一占用，准备前必须完成御主和从者选择", () => {
  const state = createGameState({ gameInstanceId: "setup", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 1 });
  assignIdentity(state, "p1", "m1", "s1");
  assert.throws(() => assignIdentity(state, "p2", "m1", "s2"), /IDENTITY_ALREADY_TAKEN/);
  setPlayerReady(state, "p1", true);
  assert.throws(() => assertSetupReady(state), /PLAYERS_NOT_READY/);
  assignIdentity(state, "p2", "m2", "s2");
  setPlayerReady(state, "p1", true); setPlayerReady(state, "p2", true);
  assert.doesNotThrow(() => assertSetupReady(state));
});
