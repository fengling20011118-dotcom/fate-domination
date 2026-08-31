import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createThreeXModeDefinition } from "../src/match-engine/three-x-mode.ts";
import { createThreeXBudget } from "../src/rules-core/three-x-economy.ts";

test("3X 模式包提供固定阶段计划和安全公开设置投影", () => {
  const state = createGameState({ gameInstanceId: "three-x-package", mode: "three-x", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 1 });
  const mode = createThreeXModeDefinition({ masterPool: ["m1", "m2"], servantPool: ["s1"] });
  assert.doesNotThrow(() => mode.setup(state));
  assert.deepEqual(mode.getPhasePlan(state).phases, ["preparation", "outpost", "action", "combat"]);
  const projected = mode.projectPublicState(state);
  assert.equal(projected.values.setupPhase, "ban");
  assert.equal((projected.values as Record<string, unknown>).budgets, undefined);
  assert.equal((projected.values as Record<string, unknown>).masterOffers, undefined);
});

test("3X 模式包只为当前设置阶段产生标准命令动作", () => {
  const state = createGameState({ gameInstanceId: "three-x-actions", mode: "three-x", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 2 });
  const mode = createThreeXModeDefinition({ masterPool: ["m1", "m2"], servantPool: ["s1"] });
  const actions = mode.getLegalActions(state, "p1");
  assert.deepEqual(actions.map((action) => action.type), ["three-x.ban-master", "three-x.ban-master", "three-x.commit-ban"]);
  assert.equal(mode.getLegalActions(state, "p2").length, 3);
  assert.equal(mode.getLegalActions(state, "outsider").length, 0);
});

test("3X 模式包的胜利判定使用高潮购点修正而不读取隐藏候选", () => {
  const state = createGameState({ gameInstanceId: "three-x-victory", mode: "three-x", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 3 });
  state.status = "finished";
  const threeX = state.modeState.threeX as import("../src/rules-core/three-x-state.ts").ThreeXModeState;
  for (const id of threeX.playerIds) threeX.budgets[id] = createThreeXBudget(0);
  threeX.budgets.p2.climaxTiebreakBonus = 1;
  state.players.p1.victoryPoints = 4; state.players.p2.victoryPoints = 4; state.players.p3.victoryPoints = 1;
  assert.deepEqual(createThreeXModeDefinition().getVictoryStatus(state).winnerIds, ["p2"]);
});
