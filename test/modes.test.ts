import test from "node:test";
import assert from "node:assert/strict";

import { createGameState } from "../src/domain/state/createGameState.ts";
import { ModeRegistry } from "../src/match-engine/modes.ts";
import { createDefaultModeRegistry } from "../src/match-engine/default-modes.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { assertCommandAuthority, assertFreshSnapshotMessage, assertMessageForGame, assertReconnectMessage, assertSnapshotMessage, createCommandMessage, createReconnectHello, createSnapshotMessage, createSnapshotRequest } from "../src/network/transport.ts";
import { applyThreeXPurchases, applyThreeXPurchase, createThreeXBudget, createThreeXBudgetForMaster, finalizeThreeXPurchases, getThreeXMasterRating, getThreeXPurchaseCost } from "../src/rules-core/three-x-economy.ts";
import { projectPublicState } from "../src/projection/project-state.ts";
import { applyThreeXStartModifiers, assertThreeXContentPools, assertThreeXReadyForStart, assertThreeXSelectionsInPools, assertThreeXSetupPhase, assertThreeXStateInvariants, autoBanThreeXMasters, banThreeXMaster, completeThreeXSetupPhase, createThreeXModeState, dealThreeXMasterOffer, dealThreeXServantOffer, finalizeThreeXBan, finalizeThreeXMasterDraft, finalizeThreeXServantSelection, lockThreeXTurnOrder, selectThreeXMaster, selectThreeXServant } from "../src/rules-core/three-x-state.ts";

test("新增模式通过注册接口接入，不需要修改通用状态机", () => {
  const registry = new ModeRegistry();
  registry.register({
    id: "standard",
    version: "1",
    playerLimits: { min: 3, max: 7 },
    setup: (state) => { state.modeState = { eventGroup: "fuyuki" }; },
    getPhasePlan: () => ({ phases: ["preparation", "outpost", "action", "combat"], steps: {} }),
    getLegalActions: () => [],
    onEvent: () => [],
    getVictoryStatus: () => ({ finished: false, winnerIds: [], reason: null }),
    projectPublicState: (state) => ({ modeId: state.mode, values: { eventGroup: state.modeState.eventGroup } }),
  });
  const state = createGameState({ gameInstanceId: "mode-test", players: [{ id: "p1", name: "一" }], seed: 1 });
  registry.get("standard").setup(state, { randomInt: () => 0, emit: () => {} });
  assert.equal(state.modeState.eventGroup, "fuyuki");
  assert.equal(registry.get("standard").projectPublicState(state).values.eventGroup, "fuyuki");
  assert.equal(registry.has("standard"), true);
  assert.equal(registry.list().length, 1);
  assert.throws(() => registry.register({ id: "", version: "1", playerLimits: { min: 1, max: 1 }, setup: () => undefined, getPhasePlan: () => ({ phases: [], steps: {} }), getLegalActions: () => [], onEvent: () => [], getVictoryStatus: () => ({ finished: false, winnerIds: [], reason: null }), projectPublicState: () => ({ modeId: "standard", values: {} }) }), /MODE_ID_VERSION_REQUIRED/);
});

test("默认模式注册入口同时提供标准和3X规则包", () => {
  const registry = createDefaultModeRegistry();
  assert.deepEqual(registry.list().map((mode) => mode.id), ["standard", "three-x"]);
  assert.equal(registry.get("standard").version, "1");
  assert.equal(registry.get("three-x").version, "1");
});

test("默认模式注册入口向各模式传递独立配置且每次创建互不污染", () => {
  const first = createDefaultModeRegistry({
    standard: { version: "standard-test", getActions: () => [{ type: "standard.test", payload: {} }] },
    threeX: { version: "three-x-test", masterPool: ["m1", "m2"], servantPool: ["s1"] },
  });
  const standardState = createGameState({ gameInstanceId: "default-standard", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 1 });
  const threeXState = createGameState({ gameInstanceId: "default-three-x", mode: "three-x", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 1 });
  assert.equal(first.get("standard").getLegalActions(standardState, "p1")[0]?.type, "standard.test");
  assert.equal(first.get("three-x").getLegalActions(threeXState, "p1").length, 3);
  assert.equal(first.get("standard").version, "standard-test");
  assert.equal(first.get("three-x").version, "three-x-test");

  const second = createDefaultModeRegistry();
  assert.notEqual(first, second);
  assert.equal(second.get("standard").version, "1");
  assert.equal(second.get("three-x").version, "1");
});

test("传输消息只携带命令或快照，并拒绝跨房间消息", () => {
  const state = createGameState({ gameInstanceId: "transport-room", players: [{ id: "p1", name: "一" }], seed: 3 });
  const command = createCommandMessage({ commandId: "c1", gameInstanceId: "transport-room", actorId: "p1", expectedRevision: 0, type: "noop", payload: {} });
  const snapshot = createSnapshotMessage(state);
  assert.equal(command.type, "command");
  assert.equal(snapshot.type, "snapshot");
  assert.doesNotThrow(() => assertMessageForGame(command, "transport-room"));
  assert.throws(() => assertMessageForGame(snapshot, "other-room"), /GAME_INSTANCE_MISMATCH/);
  assert.doesNotThrow(() => assertSnapshotMessage(snapshot, "transport-room"));
  const invalid = { ...snapshot, revision: 3 };
  assert.throws(() => assertSnapshotMessage(invalid, "transport-room"), /SNAPSHOT_STATE_MISMATCH/);
  assert.doesNotThrow(() => assertCommandAuthority(command.command, "host", ["game.start"]));
  assert.throws(() => assertCommandAuthority(command.command, "peer", ["noop"]), /HOST_ONLY_COMMAND/);
});

test("3X 圣晶石购买按同一项目递增，并独立记录开局修正", () => {
  const budget = createThreeXBudget(10);
  assert.equal(getThreeXPurchaseCost("starting-mana", 0), 1);
  assert.equal(applyThreeXPurchase(budget, "starting-mana"), 1);
  assert.equal(applyThreeXPurchase(budget, "starting-mana"), 2);
  assert.equal(applyThreeXPurchase(budget, "command-seal"), 7);
  assert.equal(budget.stones, 0);
  assert.equal(budget.extraStartingMana, 2);
  assert.equal(budget.extraCommandSeals, 1);
  assert.throws(() => applyThreeXPurchase(budget, "servant-draw"), /THREE_X_STONES_INSUFFICIENT/);
});

test("3X 购点拒绝未知项目且不改变预算", () => {
  const budget = createThreeXBudget(5);
  const before = structuredClone(budget);
  assert.throws(() => applyThreeXPurchases(budget, ["unknown" as never]), /THREE_X_PURCHASE_INVALID/);
  assert.deepEqual(budget, before);
});

test("3X 御主评级缺省为4，且购点结束后不保留圣晶石", () => {
  assert.equal(getThreeXMasterRating("master.unknown", {}), 4);
  assert.equal(getThreeXMasterRating("master.zero", { "master.zero": 0 }), 0);
  assert.equal(createThreeXBudgetForMaster("master.two", { "master.two": 2 }).stones, 2);
  const budget = createThreeXBudget(3);
  applyThreeXPurchase(budget, "starting-mana");
  finalizeThreeXPurchases(budget);
  assert.equal(budget.stones, 0);
  assert.throws(() => getThreeXMasterRating("master.bad", { "master.bad": -1 }), /THREE_X_MASTER_RATING_INVALID/);
});

test("3X 状态按 Ban、抽取、购点和顺位阶段推进", () => {
  const state = createThreeXModeState(["p1", "p2"]);
  assertThreeXSetupPhase(state, "ban");
  completeThreeXSetupPhase(state, "ban", "master-draft");
  completeThreeXSetupPhase(state, "master-draft", "purchase");
  assert.throws(() => completeThreeXSetupPhase(state, "ban", "purchase"), /THREE_X_SETUP_PHASE_FORBIDDEN/);
  completeThreeXSetupPhase(state, "purchase", "servant-select");
  completeThreeXSetupPhase(state, "servant-select", "turn-order");
  completeThreeXSetupPhase(state, "turn-order", "complete");
  assert.equal(state.setupPhase, "complete");
});

test("3X 禁用和御主选择保证唯一占用", () => {
  const state = createThreeXModeState(["p1", "p2"]);
  banThreeXMaster(state, "master.banned");
  assert.throws(() => banThreeXMaster(state, "master.banned"), /THREE_X_BAN_INVALID/);
  completeThreeXSetupPhase(state, "ban", "master-draft");
  assert.throws(() => selectThreeXMaster(state, "p1", "master.banned"), /THREE_X_MASTER_SELECTION_INVALID/);
  selectThreeXMaster(state, "p1", "master.one");
  assert.throws(() => selectThreeXMaster(state, "p2", "master.one"), /THREE_X_MASTER_ALREADY_SELECTED/);
});

test("3X 御主候选按每人三名发放，并限制只能从本人候选中选择", () => {
  const state = createThreeXModeState(["p1", "p2"]);
  state.setupPhase = "master-draft";
  assert.deepEqual(dealThreeXMasterOffer(state, "p1", ["m1", "m2", "m3", "m4", "m5", "m6"]), ["m1", "m2", "m3"]);
  assert.deepEqual(dealThreeXMasterOffer(state, "p2", ["m1", "m2", "m3", "m4", "m5", "m6"]), ["m4", "m5", "m6"]);
  assert.throws(() => selectThreeXMaster(state, "p1", "m4"), /THREE_X_MASTER_NOT_OFFERED/);
  selectThreeXMaster(state, "p1", "m2");
  assert.throws(() => dealThreeXMasterOffer(state, "p1", ["m1", "m2"], 1), /THREE_X_MASTER_POOL_INSUFFICIENT/);
});

test("3X 候选池拒绝空值、重复 ID 和非字符串条目", () => {
  assert.doesNotThrow(() => assertThreeXContentPools(["m1", "m2"], ["s1"]));
  assert.throws(() => assertThreeXContentPools([], ["s1"]), /THREE_X_MASTER_POOL_INVALID/);
  assert.throws(() => assertThreeXContentPools(["m1", "m1"]), /THREE_X_MASTER_POOL_INVALID/);
  assert.throws(() => assertThreeXContentPools(["m1"], ["s1", 2 as unknown as string]), /THREE_X_SERVANT_POOL_INVALID/);
});

test("3X 正式候选池拒绝绕过候选界面的非法身份", () => {
  const state = createThreeXModeState(["p1"]);
  state.setupPhase = "complete"; state.turnOrderLocked = true;
  state.selectedMasterIds = { p1: "m-hacked" }; state.selectedServantIds = { p1: "s-hacked" };
  state.budgets.p1 = { stones: 0, purchases: { "servant-draw": 0, "climax-tiebreak": 0, "starting-mana": 0, "command-seal": 0 }, extraStartingMana: 0, climaxTiebreakBonus: 0, extraCommandSeals: 0 };
  assert.throws(() => assertThreeXSelectionsInPools(state, ["m1"], ["s1"]), /THREE_X_MASTER_NOT_IN_POOL/);
  state.selectedMasterIds.p1 = "m1";
  assert.throws(() => assertThreeXSelectionsInPools(state, ["m1"], ["s1"]), /THREE_X_SERVANT_NOT_IN_POOL/);
  state.selectedServantIds.p1 = "s1";
  assert.doesNotThrow(() => assertThreeXSelectionsInPools(state, ["m1"], ["s1"]));
});

test("3X 候选发放禁止跨玩家重复占用", () => {
  const state = createThreeXModeState(["p1", "p2"]);
  state.setupPhase = "master-draft";
  state.masterOffers.p1 = ["m1", "m2", "m3"];
  state.masterOffers.p2 = ["m3", "m4", "m5"];
  assert.throws(() => assertThreeXStateInvariants(state), /THREE_X_MASTER_OFFER_DUPLICATE/);
  state.masterOffers.p2 = ["m4", "m5", "m6"];
  state.servantOffers.p1 = ["s1"]; state.servantOffers.p2 = ["s1"];
  assert.throws(() => assertThreeXStateInvariants(state), /THREE_X_SERVANT_OFFER_DUPLICATE/);
});

test("3X 从者选择保证唯一占用并锁定顺位", () => {
  const state = createThreeXModeState(["p1", "p2"]);
  state.setupPhase = "servant-select";
  selectThreeXServant(state, "p1", "servant.one");
  assert.throws(() => selectThreeXServant(state, "p2", "servant.one"), /THREE_X_SERVANT_ALREADY_SELECTED/);
  completeThreeXSetupPhase(state, "servant-select", "turn-order");
  lockThreeXTurnOrder(state, ["p1", "p2"]);
  assert.equal(state.setupPhase, "complete");
  assert.equal(state.turnOrderLocked, true);
  assert.throws(() => lockThreeXTurnOrder(state, ["p1", "p2"]), /THREE_X_SETUP_PHASE_FORBIDDEN/);
});

test("创建 3X 对局时自动建立独立模式状态", () => {
  const state = createGameState({ gameInstanceId: "three-x-state", mode: "three-x", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 5 });
  const threeX = state.modeState.threeX as { setupPhase: string; budgets: Record<string, unknown> };
  assert.equal(threeX.setupPhase, "ban");
  assert.deepEqual(Object.keys(threeX.budgets), ["p1", "p2"]);
});

test("3X 购点提交是原子的，非法列表不会扣除圣晶石", () => {
  const budget = createThreeXBudget(3);
  assert.deepEqual(applyThreeXPurchases(budget, ["starting-mana", "climax-tiebreak"]), [1, 1]);
  assert.equal(budget.stones, 1);
  const before = structuredClone(budget);
  assert.throws(() => applyThreeXPurchases(budget, ["starting-mana", "command-seal"]), /THREE_X_STONES_INSUFFICIENT/);
  assert.deepEqual(budget, before);
});

test("3X 开局前要求每位玩家完成御主、从者和顺位", () => {
  const state = createThreeXModeState(["p1", "p2"]);
  assert.throws(() => assertThreeXReadyForStart(state), /THREE_X_SETUP_INCOMPLETE/);
  state.setupPhase = "complete"; state.turnOrderLocked = true;
  assert.throws(() => assertThreeXReadyForStart(state), /THREE_X_PLAYER_SELECTION_INCOMPLETE/);
  state.selectedMasterIds = { p1: "m1", p2: "m2" };
  state.selectedServantIds = { p1: "s1", p2: "s2" };
  assert.doesNotThrow(() => assertThreeXReadyForStart(state));
  assert.doesNotThrow(() => assertThreeXStateInvariants(state));
});

test("联机重连握手和快照请求严格绑定房间与修订号", () => {
  const hello = createReconnectHello("room-a", "peer-1", 4);
  const request = createSnapshotRequest("room-a", "peer-1", 4);
  assert.doesNotThrow(() => assertReconnectMessage(hello, "room-a"));
  assert.doesNotThrow(() => assertReconnectMessage(request, "room-a"));
  assert.throws(() => assertReconnectMessage(hello, "room-b"), /GAME_INSTANCE_MISMATCH/);
  assert.throws(() => createReconnectHello("", "peer-1"), /TRANSPORT_IDENTITY_INVALID/);
});

test("断线恢复拒绝不比本地更新的旧快照", () => {
  const state = createGameState({ gameInstanceId: "fresh-room", players: [{ id: "p1", name: "一" }], seed: 2 });
  state.revision = 5;
  const snapshot = createSnapshotMessage(state);
  assert.doesNotThrow(() => assertFreshSnapshotMessage(snapshot, "fresh-room", 4));
  assert.throws(() => assertFreshSnapshotMessage(snapshot, "fresh-room", 5), /SNAPSHOT_REVISION_INVALID/);
});

test("3X 御主选定后按评级发放圣晶石并进入购点阶段", () => {
  const state = createThreeXModeState(["p1", "p2"]);
  state.setupPhase = "master-draft";
  selectThreeXMaster(state, "p1", "m1");
  selectThreeXMaster(state, "p2", "m2");
  finalizeThreeXMasterDraft(state, { m1: 2, m2: 5 });
  assert.equal(state.setupPhase, "purchase");
  assert.equal(state.budgets.p1.stones, 2);
  assert.equal(state.budgets.p2.stones, 5);
});

test("3X 从者选择必须全员完成，并将购点修正交接到玩家状态", () => {
  const mode = createThreeXModeState(["p1", "p2"]);
  mode.setupPhase = "servant-select";
  mode.selectedMasterIds = { p1: "m1", p2: "m2" };
  mode.selectedServantIds = { p1: "s1" };
  assert.throws(() => finalizeThreeXServantSelection(mode), /THREE_X_SERVANT_SELECTION_INCOMPLETE/);
  mode.selectedServantIds.p2 = "s2";
  finalizeThreeXServantSelection(mode);
  mode.turnOrderLocked = true; mode.setupPhase = "complete";
  mode.budgets.p1.extraStartingMana = 2; mode.budgets.p1.extraCommandSeals = 1;
  const state = createGameState({ gameInstanceId: "three-x-start", mode: "three-x", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 9 });
  state.modeState.threeX = mode;
  applyThreeXStartModifiers(state);
  assert.equal(state.players.p1.mana, 6);
  assert.equal(state.players.p1.commandSeals, 4);
  assert.equal(state.players.p1.masterId, "m1");
});

test("3X 准备命令可从 Ban 连续推进到标准对局开局", () => {
  const state = createGameState({ gameInstanceId: "three-x-command-flow", mode: "three-x", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 12 });
  const engine = new StandardMatchEngine({
    cards: {}, situations: Array.from({ length: 13 }, (_, i) => ({ id: `sit-${i}`, mana: 1, climax: i >= 10 })),
    events: Array.from({ length: 20 }, (_, i) => ({ id: `event-${i}`, victoryPoints: 1 })),
    playerDecks: { p1: [], p2: [] },
    threeXMasterRatings: { m1: 2, m2: 7 },
  });
  let current = state;
  const run = (id: string, actorId: string, type: string, payload: unknown) => {
    const result = engine.execute(current, { commandId: id, gameInstanceId: current.gameInstanceId, actorId, expectedRevision: current.revision, type, payload });
    current = result.state;
    return result;
  };
  run("ban", "p1", CommandType.ThreeXBanMaster, { masterId: "banned" });
  run("ban-commit-1", "p1", CommandType.ThreeXCommitBan, {});
  run("ban-commit-2", "p2", CommandType.ThreeXCommitBan, {});
  run("ban-end", "host", CommandType.ThreeXFinalizeBan, {});
  run("draft-1", "p1", CommandType.ThreeXSelectMaster, { masterId: "m1" });
  run("draft-2", "p2", CommandType.ThreeXSelectMaster, { masterId: "m2" });
  run("draft-end", "host", CommandType.ThreeXFinalizeMasters, {});
  run("buy-1", "p1", CommandType.ThreeXPurchase, { purchases: ["starting-mana"] });
  run("buy-2", "p2", CommandType.ThreeXPurchase, { purchases: ["command-seal"] });
  run("buy-end-1", "p1", CommandType.ThreeXFinalizePurchase, {});
  run("buy-end-2", "p2", CommandType.ThreeXFinalizePurchase, {});
  run("servant-1", "p1", CommandType.ThreeXSelectServant, { servantId: "s1" });
  run("servant-2", "p2", CommandType.ThreeXSelectServant, { servantId: "s2" });
  run("servant-end", "host", CommandType.ThreeXFinalizeServants, {});
  run("order", "host", CommandType.ThreeXLockTurnOrder, { playerIds: ["p1", "p2"] });
  run("start", "host", CommandType.StartStandardGame, {});
  assert.equal(current.status, "playing");
  assert.equal(current.players.p1.mana, 6);
  assert.equal(current.players.p2.commandSeals, 4);
});

test("3X 公开投影只向本人展示圣晶石购点明细", () => {
  const state = createGameState({ gameInstanceId: "three-x-projection", mode: "three-x", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 1 });
  const mode = state.modeState.threeX as { budgets: Record<string, unknown> };
  mode.budgets.p1 = { stones: 3, purchases: { "starting-mana": 1 }, extraStartingMana: 1, climaxTiebreakBonus: 0, extraCommandSeals: 0 };
  mode.budgets.p2 = { stones: 2, purchases: { "servant-draw": 1 }, extraStartingMana: 0, climaxTiebreakBonus: 0, extraCommandSeals: 0 };
  const own = projectPublicState(state, "p1");
  const other = projectPublicState(state, "p2");
  assert.equal((own.modeState.threeX as { budgets: Record<string, { stones: number }> }).budgets.p1.stones, 3);
  assert.equal((other.modeState.threeX as { budgets: Record<string, { stones: null }> }).budgets.p1.stones, null);
});

test("3X 公开投影只向本人展示御主和从者候选", () => {
  const state = createGameState({ gameInstanceId: "three-x-offer-projection", mode: "three-x", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 1 });
  const mode = state.modeState.threeX as import("../src/rules-core/three-x-state.ts").ThreeXModeState;
  mode.masterOffers.p1 = ["m1", "m2", "m3"]; mode.masterOffers.p2 = ["m4", "m5", "m6"];
  mode.servantOffers.p1 = ["s1"]; mode.servantOffers.p2 = ["s2"];
  const own = projectPublicState(state, "p1");
  const offers = own.modeState.threeX as { masterOffers: Record<string, string[]>; servantOffers: Record<string, string[]> };
  assert.deepEqual(offers.masterOffers.p1, ["m1", "m2", "m3"]); assert.deepEqual(offers.masterOffers.p2, []);
  assert.deepEqual(offers.servantOffers.p1, ["s1"]); assert.deepEqual(offers.servantOffers.p2, []);
});

test("3X 玩家确认购点后不能再次修改预算", () => {
  const state = createGameState({ gameInstanceId: "three-x-purchase-lock", mode: "three-x", players: [{ id: "p1", name: "一" }], seed: 1 });
  const mode = state.modeState.threeX as import("../src/rules-core/three-x-state.ts").ThreeXModeState;
  mode.setupPhase = "purchase";
  mode.budgets.p1.stones = 1;
  const engine = new StandardMatchEngine({ cards: {}, situations: [], events: [], playerDecks: { p1: [] } });
  let result = engine.execute(state, { commandId: "buy", gameInstanceId: state.gameInstanceId, actorId: "p1", expectedRevision: 0, type: CommandType.ThreeXPurchase, payload: { purchases: [] } });
  result = engine.execute(result.state, { commandId: "commit", gameInstanceId: state.gameInstanceId, actorId: "p1", expectedRevision: 1, type: CommandType.ThreeXFinalizePurchase, payload: {} });
  assert.throws(() => engine.execute(result.state, { commandId: "late-buy", gameInstanceId: state.gameInstanceId, actorId: "p1", expectedRevision: 2, type: CommandType.ThreeXPurchase, payload: { purchases: [] } }), /THREE_X_PURCHASE_ALREADY_COMMITTED/);
});

test("3X AI 先 Ban 按稳定顺序选择且不会重复禁用", () => {
  const state = createThreeXModeState(["p1", "p2"]);
  assert.deepEqual(autoBanThreeXMasters(state, ["m1", "m2", "m3"], 1), ["m1"]);
  assert.deepEqual(autoBanThreeXMasters(state, ["m1", "m2", "m3"], 1), ["m2"]);
  assert.throws(() => autoBanThreeXMasters(state, ["m1"], 1), /THREE_X_AI_BAN_POOL_INSUFFICIENT/);
});

test("3X AI Ban 通过权威命令写入状态并公开显示禁用结果", () => {
  const state = createGameState({ gameInstanceId: "three-x-ai-command", mode: "three-x", players: [{ id: "p1", name: "一" }], seed: 1 });
  const engine = new StandardMatchEngine({ cards: {}, situations: [], events: [], playerDecks: { p1: [] }, threeXMasterPool: ["m1", "m2", "m3"] });
  const result = engine.execute(state, { commandId: "ai-ban", gameInstanceId: state.gameInstanceId, actorId: "host", expectedRevision: 0, type: CommandType.ThreeXAutoBan, payload: { count: 1 } });
  assert.deepEqual((result.state.modeState.threeX as { bannedMasterIds: string[] }).bannedMasterIds, ["m1"]);
  assert.equal(projectPublicState(result.state, "p1").modeState.threeX.bannedMasterIds[0], "m1");
  assert.throws(() => engine.execute(result.state, { commandId: "bad-ai-ban", gameInstanceId: state.gameInstanceId, actorId: "p1", expectedRevision: 1, type: CommandType.ThreeXAutoBan, payload: {} }), /HOST_ONLY_COMMAND/);
});

test("3X 阶段结算和顺位锁定仅允许房主执行", () => {
  const state = createGameState({ gameInstanceId: "three-x-host-setup", mode: "three-x", players: [{ id: "p1", name: "一" }], seed: 1 });
  const engine = new StandardMatchEngine({ cards: {}, situations: [], events: [], playerDecks: { p1: [] }, threeXMasterPool: ["m1", "m2", "m3"] });
  const commands = [CommandType.ThreeXFinalizeBan, CommandType.ThreeXFinalizeMasters, CommandType.ThreeXFinalizeServants, CommandType.ThreeXLockTurnOrder];
  for (const type of commands) {
    assert.throws(() => engine.execute(state, { commandId: "peer-setup" + type, gameInstanceId: state.gameInstanceId, actorId: "p1", expectedRevision: 0, type, payload: type === CommandType.ThreeXLockTurnOrder ? { playerIds: ["p1"] } : {} }), /HOST_ONLY_COMMAND/);
  }
});

test("配置正式御主池后 Ban 命令拒绝池外角色", () => {
  const state = createGameState({ gameInstanceId: "three-x-ban-pool", mode: "three-x", players: [{ id: "p1", name: "一" }], seed: 1 });
  const engine = new StandardMatchEngine({ cards: {}, situations: [], events: [], playerDecks: { p1: [] }, threeXMasterPool: ["m1", "m2", "m3"] });
  assert.throws(() => engine.execute(state, { commandId: "ban-out", gameInstanceId: state.gameInstanceId, actorId: "p1", expectedRevision: 0, type: CommandType.ThreeXBanMaster, payload: { masterId: "outside" } }), /THREE_X_BAN_INVALID/);
  const result = engine.execute(state, { commandId: "ban-in", gameInstanceId: state.gameInstanceId, actorId: "p1", expectedRevision: 0, type: CommandType.ThreeXBanMaster, payload: { masterId: "m1" } });
  assert.deepEqual((result.state.modeState.threeX as { bannedMasterIds: string[] }).bannedMasterIds, ["m1"]);
});

test("3X 御主阶段确认时要求每位玩家拥有完整三人候选", () => {
  const state = createThreeXModeState(["p1", "p2"]);
  state.setupPhase = "master-draft";
  state.masterOffers.p1 = ["m1", "m2", "m3"];
  state.masterOffers.p2 = ["m4", "m5"];
  state.selectedMasterIds = { p1: "m1", p2: "m4" };
  assert.throws(() => finalizeThreeXMasterDraft(state, {}), /THREE_X_MASTER_OFFER_INCOMPLETE/);
  state.masterOffers.p2.push("m6");
  assert.doesNotThrow(() => finalizeThreeXMasterDraft(state, {}));
});

test("3X 内容池配置后结束 Ban 会自动给每位玩家发三名御主候选", () => {
  const state = createGameState({ gameInstanceId: "three-x-master-offers", mode: "three-x", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 2 });
  const engine = new StandardMatchEngine({ cards: {}, situations: [], events: [], playerDecks: { p1: [], p2: [] }, threeXMasterPool: ["m1", "m2", "m3", "m4", "m5", "m6"] });
  let current = state;
  const run = (id: string, actorId: string, type: string, payload: unknown) => { current = engine.execute(current, { commandId: id, gameInstanceId: current.gameInstanceId, actorId, expectedRevision: current.revision, type, payload }).state; };
  run("c1", "p1", CommandType.ThreeXCommitBan, {}); run("c2", "p2", CommandType.ThreeXCommitBan, {}); run("end", "host", CommandType.ThreeXFinalizeBan, {});
  const offers = (current.modeState.threeX as { masterOffers: Record<string, string[]> }).masterOffers;
  assert.equal(offers.p1.length, 3); assert.equal(offers.p2.length, 3);
  assert.equal(new Set(offers.p1).size, 3); assert.equal(new Set(offers.p2).size, 3);
  assert.equal(offers.p1.some((id) => offers.p2.includes(id)), false);
});

test("3X 相同房主 RNG 会稳定重放候选顺序", () => {
  const deal = () => {
    const state = createThreeXModeState(["p1"]);
    state.setupPhase = "master-draft";
    dealThreeXMasterOffer(state, "p1", ["m1", "m2", "m3", "m4"], 3, (max) => max - 1);
    return state.masterOffers.p1;
  };
  assert.deepEqual(deal(), deal());
});

test("3X 每位玩家抽取三名从者并只能从自己的候选中选择", () => {
  const state = createThreeXModeState(["p1", "p2"]);
  state.setupPhase = "servant-select";
  assert.deepEqual(dealThreeXServantOffer(state, "p1", ["s1", "s2", "s3", "s4"]), ["s1"]);
  assert.deepEqual(dealThreeXServantOffer(state, "p1", ["s1", "s2", "s3", "s4"]), ["s2"]);
  assert.deepEqual(dealThreeXServantOffer(state, "p2", ["s1", "s2", "s3", "s4", "s5", "s6"]), ["s3"]);
  assert.throws(() => selectThreeXServant(state, "p1", "s4"), /THREE_X_SERVANT_NOT_OFFERED/);
  selectThreeXServant(state, "p1", "s2");
  assert.throws(() => dealThreeXServantOffer(state, "p2", ["s1", "s2"], 1), /THREE_X_SERVANT_POOL_INSUFFICIENT/);
});
