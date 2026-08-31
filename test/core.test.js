import test from "node:test";
import assert from "node:assert/strict";

import { ChoiceManager } from "../src/core/ChoiceManager.js";
import { COMMANDS, PHASES } from "../src/core/constants.js";
import { createGameState } from "../src/core/createGameState.js";
import { EffectRuntime } from "../src/core/EffectRuntime.js";
import { RandomService } from "../src/core/RandomService.js";
import { RuleEngine } from "../src/core/RuleEngine.js";
import { acceptSnapshot, createSnapshotMessage } from "../src/network/protocol.js";

function makeState() {
  return createGameState({
    gameInstanceId: "game-test-1",
    players: [
      { id: "p1", name: "玩家一" },
      { id: "p2", name: "玩家二" },
    ],
    seed: 123456,
  });
}

function command(state, id, type, extra = {}) {
  return {
    id,
    type,
    gameInstanceId: state.gameInstanceId,
    expectedRevision: state.revision,
    ...extra,
  };
}

test("游戏从准备阶段开始，并按玩家和阶段推进", () => {
  const engine = new RuleEngine();
  let state = makeState();

  state = engine.execute(state, command(state, "c1", COMMANDS.START_GAME)).state;
  assert.equal(state.round, 1);
  assert.equal(state.phase, "preparation");
  assert.equal(state.activeSeat, 0);

  state = engine.execute(
    state,
    command(state, "c2", COMMANDS.ADVANCE_PHASE_PLAYER, { playerId: "p1" }),
  ).state;
  assert.equal(state.activeSeat, 1);

  state = engine.execute(
    state,
    command(state, "c3", COMMANDS.ADVANCE_PHASE_PLAYER, { playerId: "p2" }),
  ).state;
  assert.equal(state.phase, "outpost");
  assert.equal(state.activeSeat, 0);

  assert.deepEqual(PHASES, ["preparation", "outpost", "action", "combat"]);
});

test("另一局游戏的命令会被拒绝", () => {
  const engine = new RuleEngine();
  const state = makeState();
  assert.throws(
    () =>
      engine.execute(state, {
        id: "wrong-game",
        type: COMMANDS.START_GAME,
        gameInstanceId: "old-game",
        expectedRevision: 0,
      }),
    (error) => error.code === "GAME_INSTANCE_MISMATCH",
  );
});

test("重复命令不会重复结算", () => {
  const engine = new RuleEngine();
  const initial = makeState();
  const start = command(initial, "same-command", COMMANDS.START_GAME);
  const first = engine.execute(initial, start);
  const duplicate = engine.execute(first.state, {
    ...start,
  });

  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state.revision, first.state.revision);
});

test("取消选择后继续结算队列中的后续效果", () => {
  const effectRuntime = new EffectRuntime();
  effectRuntime.register("test.add-mana", ({ state, effect, emit }) => {
    state.players[effect.playerId].mana += effect.amount;
    emit("player.mana.changed", {
      playerId: effect.playerId,
      amount: effect.amount,
    });
  });
  const engine = new RuleEngine({ effectRuntime });
  const state = makeState();
  state.pendingChoice = {
    id: "choice.cancel-me",
    playerId: "p1",
    allowCancel: true,
    min: 1,
    max: 1,
    options: [{ id: "p2", label: "玩家二" }],
  };
  state.effectQueue.push({
    id: "effect.after-choice",
    type: "test.add-mana",
    playerId: "p1",
    amount: 2,
  });

  const result = engine.execute(
    state,
    command(state, "cancel-choice", COMMANDS.CANCEL_CHOICE, {
      payload: { choiceId: "choice.cancel-me", playerId: "p1" },
    }),
  );

  assert.equal(result.state.pendingChoice, null);
  assert.equal(result.state.players.p1.mana, 2);
  assert.equal(result.state.effectQueue.length, 0);
});

test("可取消选择在取消后不会留下死档状态", () => {
  const choices = new ChoiceManager();
  const state = makeState();
  choices.open(state, {
    id: "choice.exorcist.target",
    playerId: "p1",
    allowCancel: true,
    min: 1,
    max: 1,
    options: [{ id: "p2", label: "玩家二" }],
    resumeEffectId: "effect.after-exorcist-choice",
  });

  const result = choices.cancel(state, {
    choiceId: "choice.exorcist.target",
    playerId: "p1",
  });

  assert.equal(result.status, "cancelled");
  assert.equal(state.pendingChoice, null);
  assert.equal(result.choice.resumeEffectId, "effect.after-exorcist-choice");
});

test("随机数在相同种子和相同调用顺序下可重放", () => {
  const random = new RandomService();
  const left = makeState();
  const right = makeState();

  const leftResult = random.shuffle(left, [1, 2, 3, 4, 5]);
  const rightResult = random.shuffle(right, [1, 2, 3, 4, 5]);

  assert.deepEqual(leftResult, rightResult);
  assert.equal(left.rng.state, right.rng.state);
  assert.equal(left.rng.draws, right.rng.draws);
});

test("新房间拒绝旧房间快照", () => {
  const oldGame = makeState();
  const newGame = createGameState({
    gameInstanceId: "game-test-2",
    players: [{ id: "p1", name: "玩家一" }],
    seed: 9,
  });
  const snapshot = createSnapshotMessage(oldGame);

  assert.throws(
    () => acceptSnapshot(newGame, snapshot),
    (error) => error.code === "GAME_INSTANCE_MISMATCH",
  );
});
