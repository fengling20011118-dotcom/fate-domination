import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { findStateInvariantViolations } from "../src/domain/state/invariants.ts";
import { assertStateInvariants } from "../src/domain/state/invariants.ts";
import { createReplay, restoreSnapshot, serializeSnapshot, validateReplay } from "../src/save/snapshots.ts";

test("快照可序列化恢复，并隔离不同房间实例", () => {
  const state = createGameState({ gameInstanceId: "room-new", players: [{ id: "p1", name: "一" }], seed: 10 });
  state.revision = 7;
  const restored = restoreSnapshot(serializeSnapshot(state, "2026-08-30T00:00:00.000Z"), "room-new");
  assert.equal(restored.gameInstanceId, "room-new");
  assert.equal(restored.revision, 7);
  assert.throws(() => restoreSnapshot(serializeSnapshot(state), "room-old"), /SNAPSHOT_GAME_INSTANCE_MISMATCH/);
});

test("损坏快照在进入规则引擎前被拒绝", () => {
  assert.throws(() => restoreSnapshot("{}"), /SNAPSHOT_INVALID/);
  assert.throws(() => restoreSnapshot("not-json"), /SNAPSHOT_INVALID_JSON/);
});

test("旧版 3X 快照自动补齐候选池字段后可恢复", () => {
  const state = createGameState({ gameInstanceId: "legacy-3x", mode: "three-x", players: [{ id: "p1", name: "一" }], seed: 1 });
  const snapshot = JSON.parse(serializeSnapshot(state));
  delete snapshot.state.modeState.threeX.masterOffers;
  delete snapshot.state.modeState.threeX.servantOffers;
  const restored = restoreSnapshot(JSON.stringify(snapshot));
  assert.deepEqual(restored.modeState.threeX.masterOffers, { p1: [] });
  assert.deepEqual(restored.modeState.threeX.servantOffers, { p1: [] });
});

test("旧版快照缺少杰基尔形态字段时迁移为中性状态", () => {
  const state = createGameState({ gameInstanceId: "legacy-form", players: [{ id: "p1", name: "一" }], seed: 2 });
  const snapshot = JSON.parse(serializeSnapshot(state));
  delete snapshot.state.players.p1.form;
  const restored = restoreSnapshot(JSON.stringify(snapshot));
  assert.equal(restored.players.p1.form, null);
});

test("快照拒绝非法或错误归属的形态状态", () => {
  const state = createGameState({ gameInstanceId: "invalid-form", players: [{ id: "p1", name: "一" }] });
  state.players.p1.form = "hyde";
  assert.throws(() => restoreSnapshot(serializeSnapshot(state)), /SNAPSHOT_STATE_INVALID/);
  state.players.p1.form = "invalid" as never;
  assert.throws(() => assertStateInvariants(state), /PLAYER_FORM_INVALID/);
});

test("快照中的卡牌区域不一致时被拒绝", () => {
  const state = createGameState({ gameInstanceId: "invalid-card-zone", players: [{ id: "p1", name: "一" }], seed: 12 });
  const cardId = "p1:card:1";
  state.cards[cardId] = { instanceId: cardId, definitionId: "card.test", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "discard", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.hand = [cardId];
  assert.throws(() => restoreSnapshot(serializeSnapshot(state)), /SNAPSHOT_STATE_INVALID/);
});

test("快照拒绝无效的卡牌使用限制标记", () => {
  const state = createGameState({ gameInstanceId: "invalid-card-usage", players: [{ id: "p1", name: "一" }], seed: 13 });
  const cardId = "p1:card:usage";
  state.cards[cardId] = { instanceId: cardId, definitionId: "card.test", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "discard", face: "down", active: false, residual: false, temporary: false, modifiers: [], usedPhase: "action" };
  state.players.p1.discard = [cardId];
  assert.throws(() => restoreSnapshot(serializeSnapshot(state)), /SNAPSHOT_STATE_INVALID/);
});

test("快照拒绝无效的卡牌打出回合标记", () => {
  const state = createGameState({ gameInstanceId: "snapshot-played-round", players: [{ id: "p1", name: "一" }] });
  state.cards.card = { instanceId: "card", definitionId: "card.test", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [], playedRound: -1 };
  state.players.p1.hand = ["card"];
  assert.throws(() => assertStateInvariants(state), /CARD_PLAYED_ROUND_INVALID/);
});

test("快照拒绝空的衍生卡来源 effectId", () => {
  const state = createGameState({ gameInstanceId: "invalid-card-source", players: [{ id: "p1", name: "一" }], seed: 15 });
  const cardId = "p1:card:source";
  state.cards[cardId] = { instanceId: cardId, definitionId: "card.test", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "discard", face: "down", active: false, residual: false, temporary: false, modifiers: [], createdByEffectId: "" };
  state.players.p1.discard = [cardId];
  assert.throws(() => restoreSnapshot(serializeSnapshot(state)), /SNAPSHOT_STATE_INVALID/);
});

test("状态不变量拒绝重复场上事件和孤立可见性记录", () => {
  const state = createGameState({ gameInstanceId: "event-invariant", players: [{ id: "p1", name: "P1" }], seed: 1 });
  state.board.currentEvents = { mountain: ["event.same"], city: ["event.same"] };
  state.board.eventVisibility = { "event.same": "up", "event.orphan": "down" };
  const violations = findStateInvariantViolations(state);
  assert.ok(violations.includes("EVENT_DUPLICATE:event.same"));
  assert.ok(violations.includes("EVENT_VISIBILITY_ORPHAN:event.orphan"));
});

test("待决策状态不变量拒绝无效参与者与越界选择范围", () => {
  const state = createGameState({ gameInstanceId: "decision-invariant", players: [{ id: "p1", name: "一" }], seed: 1 });
  state.pendingDecision = { decisionId: "d1", ownerPlayerId: "p1", chooserPlayerIds: ["missing"], kind: "choose", options: [{ id: "x", label: "X" }], min: 0, max: 2, allowCancel: true, submissions: { p1: [] } };
  assert.throws(() => assertStateInvariants(state), /DECISION_CHOOSER_INVALID/);
});

test("战力结算后响应快照必须绑定回合、参与者和当前响应者", () => {
  const state = createGameState({ gameInstanceId: "combat-response-invariant", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 1 });
  state.status = "playing";
  state.phase = "combat";
  state.step = "post-power-response";
  state.activePlayerId = "p2";
  state.modeState.pendingCombatResolution = {
    snapshot: { locationId: "mountain", participantIds: ["p1", "p2", "p3"], powers: { p1: 2, p2: 5, p3: 9 }, attributes: {}, round: state.round },
    responderIds: ["p2"],
    nextResponderIndex: 0,
  };
  assert.doesNotThrow(() => assertStateInvariants(state));
  state.modeState.pendingCombatResolution.snapshot.round = state.round - 1;
  assert.throws(() => assertStateInvariants(state), /COMBAT_SNAPSHOT_INVALID/);
});

test("回放元数据和事件修订号保持一致", () => {
  const state = createGameState({ gameInstanceId: "replay", players: [{ id: "p1", name: "一" }], seed: 14 });
  const replay = createReplay(state, [{ eventId: "e1", type: "game.started", revision: 1, sourceCommandId: "c1", payload: {} }]);
  assert.doesNotThrow(() => validateReplay(replay));
  const invalid = { ...replay, gameInstanceId: "other" };
  assert.throws(() => validateReplay(invalid), /REPLAY_INVALID/);
  const duplicate = createReplay(state, [
    { eventId: "e1", type: "game.started", revision: 1, sourceCommandId: "c1", payload: {} },
    { eventId: "e1", type: "game.started", revision: 1, sourceCommandId: "c1", payload: {} },
  ]);
  assert.throws(() => validateReplay(duplicate), /REPLAY_EVENT_INVALID/);
});
