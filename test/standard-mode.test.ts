import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createStandardModeDefinition } from "../src/match-engine/standard-mode.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";

test("标准模式包固定基础阶段并拒绝超出3至7人边界", () => {
  const state = createGameState({ gameInstanceId: "standard-package", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 1 });
  const mode = createStandardModeDefinition();
  assert.doesNotThrow(() => mode.setup(state));
  assert.deepEqual(mode.getPhasePlan(state).phases, ["preparation", "outpost", "action", "combat"]);
  assert.equal(mode.getLegalActions(state, "p1").length, 0);
  const tooFew = createGameState({ gameInstanceId: "standard-too-few", players: [{ id: "p1", name: "一" }], seed: 1 });
  assert.throws(() => mode.setup(tooFew), /STANDARD_PLAYER_LIMIT_INVALID/);
});

test("标准模式包的公开投影只包含模式公共边界", () => {
  const state = createGameState({ gameInstanceId: "standard-projection", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 2 });
  state.modeState = { currentSituationId: "situation.public", eventGroupId: "event-group.fuyuki", hiddenSecret: "must-not-project" };
  const values = createStandardModeDefinition().projectPublicState(state).values;
  assert.equal(values.currentSituationId, "situation.public");
  assert.equal(values.eventGroupId, "event-group.fuyuki");
  assert.equal(values.hiddenSecret, undefined);
});

test("标准模式包按普通战果判定最终胜者，不读取隐藏牌区", () => {
  const state = createGameState({ gameInstanceId: "standard-victory", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 3 });
  state.status = "finished";
  state.players.p1.victoryPoints = 4;
  state.players.p2.victoryPoints = 7;
  state.players.p3.victoryPoints = 7;
  state.players.p1.deck = ["private-card"];
  assert.deepEqual(createStandardModeDefinition().getVictoryStatus(state).winnerIds.sort(), ["p2", "p3"]);
});

test("标准引擎默认绑定完整模式注册表，并可查询当前模式规则包", () => {
  const engine = new StandardMatchEngine({ cards: {}, situations: [], events: [], playerDecks: {} });
  assert.deepEqual(engine.modes.list().map((mode) => mode.id), ["standard", "three-x"]);
  assert.equal(engine.getModeDefinition("standard").id, "standard");
  assert.equal(engine.getModeDefinition("three-x").id, "three-x");
});
