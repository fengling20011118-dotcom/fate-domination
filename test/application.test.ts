import test from "node:test";
import assert from "node:assert/strict";
import { GameApplication } from "../src/application/game-application.ts";
import { CommandType } from "../src/match-engine/commands.ts";

const content = {
  cards: {}, situations: [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, mana: 1 })),
    { id: "c1", mana: 2, climax: true }, { id: "c2", mana: 2, climax: true }, { id: "c3", mana: 2, climax: true },
  ],
  events: Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, victoryPoints: 1 })),
  playerDecks: { p1: [], p2: [] },
};

test("应用门面只通过命令改变状态，保存恢复不改变房间身份", () => {
  const app = GameApplication.create({ gameInstanceId: "app-room", players: [{ id: "p1", name: "一" }], seed: 1, content });
  const before = app.state;
  const result = app.dispatch({ commandId: "start", gameInstanceId: "app-room", actorId: "host", expectedRevision: 0, type: CommandType.StartStandardGame, payload: {} });
  assert.equal(result.state.revision, 1);
  assert.equal(before.revision, 0);
  const saved = app.save("2026-08-30T00:00:00.000Z");
  app.dispatch({ commandId: "window", gameInstanceId: "app-room", actorId: "p1", expectedRevision: 1, type: CommandType.CompletePlayerWindow, payload: {} });
  app.restore(saved);
  assert.equal(app.state.revision, 1);
  assert.equal(app.state.gameInstanceId, "app-room");
});

test("前端联调结果只返回玩家投影、动作、事件和结构化拒绝", () => {
  const app = GameApplication.create({ gameInstanceId: "contract-room", players: [{ id: "p1", name: "一" }], seed: 1, content });
  const accepted = app.dispatchFor("p1", {
    commandId: "start-contract",
    gameInstanceId: "contract-room",
    actorId: "host",
    expectedRevision: 0,
    type: CommandType.StartStandardGame,
    payload: {},
  });
  assert.equal(accepted.ok, true);
  assert.equal("state" in accepted, false);
  if (!accepted.ok) return;
  assert.equal(accepted.view.revision, 1);
  assert.ok(accepted.availableActions.some((action) => action.commandType === CommandType.CompletePlayerWindow));

  const rejected = app.dispatchFor("p1", {
    commandId: "stale-contract",
    gameInstanceId: "contract-room",
    actorId: "p1",
    expectedRevision: 0,
    type: CommandType.CompletePlayerWindow,
    payload: {},
  });
  assert.equal(rejected.ok, false);
  assert.equal("state" in rejected, false);
  if (rejected.ok) return;
  assert.equal(rejected.rejection.code, "REVISION_MISMATCH");
  assert.equal(rejected.rejection.retryable, true);
  assert.equal(rejected.view.revision, 1);
});

test("待决策时 AvailableAction 由后端提供选项和数量边界", () => {
  const app = GameApplication.create({ gameInstanceId: "decision-contract", players: [{ id: "p1", name: "一" }], seed: 1, content });
  const state = app.state;
  state.pendingDecision = {
    decisionId: "choose-card",
    ownerPlayerId: "p1",
    chooserPlayerIds: ["p1"],
    kind: "choose-card",
    options: [{ id: "card-a", label: "牌A" }, { id: "card-b", label: "牌B" }],
    min: 1,
    max: 2,
    allowCancel: true,
    submissions: {},
  };
  const restored = new GameApplication({ state, content });
  const [action] = restored.availableActionsFor("p1");
  assert.equal(action.commandType, CommandType.ResolveDecision);
  assert.equal(action.label, "确认选择");
  assert.equal(action.input?.kind, "multi-choice");
  assert.equal(action.input?.min, 1);
  assert.equal(action.input?.max, 2);
  assert.deepEqual(action.input?.options?.map((option) => option.id), ["card-a", "card-b"]);
});

test("前端投影将内部英文地点与操作标签中文化但保留选项ID", () => {
  const app = GameApplication.create({ gameInstanceId: "zh-contract", players: [{ id: "p1", name: "一" }], seed: 1, content });
  const state = app.state;
  state.pendingDecision = {
    decisionId: "zh-choice",
    ownerPlayerId: "p1",
    chooserPlayerIds: ["p1"],
    kind: "internal-location-choice",
    options: [
      { id: "mountain", label: "Mountain" },
      { id: "decline", label: "Decline" },
      { id: "mana", label: "Gain 3 mana" },
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    submissions: {},
  };
  const restored = new GameApplication({ state, content });
  const view = restored.viewFor("p1");
  assert.deepEqual(view.pendingDecision?.options.map((option) => option.id), ["mountain", "decline", "mana"]);
  assert.deepEqual(view.pendingDecision?.options.map((option) => option.label), ["深山町", "不发动", "获得3点魔力"]);
  const [action] = restored.availableActionsFor("p1");
  assert.equal(action.label, "确认选择");
  assert.deepEqual(action.input?.options?.map((option) => option.label), ["深山町", "不发动", "获得3点魔力"]);
});

test("前端卡牌定义使用中文展示名且不修改权威内容定义", () => {
  const rawContent = {
    ...content,
    cards: {
      "card.queenside": {
        id: "card.queenside",
        version: 1,
        name: "Queenside Castle",
        text: "Saber必须死！职阶为Saber。将NPC加入游戏。（Deck变体）",
        cardType: "skill",
        ownerType: "master",
        cost: 5,
        basePower: 1,
        typeLabel: "魔术",
      },
    },
  };
  const app = GameApplication.create({ gameInstanceId: "card-display-zh", players: [{ id: "p1", name: "一" }], seed: 1, content: rawContent });
  assert.equal(app.cardDefinitions()["card.queenside"].name, "王城奇袭");
  assert.equal(app.cardDefinitions()["card.queenside"].text, "剑士必须死！职阶为剑士。将非玩家角色加入游戏。（牌库变体）");
  assert.equal(rawContent.cards["card.queenside"].name, "Queenside Castle");
  assert.equal(rawContent.cards["card.queenside"].text, "Saber必须死！职阶为Saber。将NPC加入游戏。（Deck变体）");
});
