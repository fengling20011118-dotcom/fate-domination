import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { projectPublicState } from "../src/projection/project-state.ts";
import { assertCommandEnvelope } from "../src/match-engine/commands.ts";

const content = {
  cards: {
    a: { id: "a", name: "A", cost: 0, basePower: 1, typeLabel: "力量" },
    b: { id: "b", name: "B", cost: 0, basePower: 2, typeLabel: "魔法" },
  },
  situations: [{ id: "s1", mana: 1 }, ...Array.from({ length: 9 }, (_, i) => ({ id: `s${i + 2}`, mana: 1 })), { id: "c1", mana: 2, climax: true }, { id: "c2", mana: 2, climax: true }, { id: "c3", mana: 2, climax: true }],
  events: Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, victoryPoints: 1 })),
  eventGroups: [{ id: "fuyuki", name: "冬木", eventIds: Array.from({ length: 20 }, (_, i) => `e${i}`) }],
  playerDecks: { p1: ["a", "b"], p2: ["a", "b"] },
};

function command(state: ReturnType<typeof createGameState>, id: string, type: string, actorId: string, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

test("标准引擎可连续推进准备、前哨、行动并进入战斗", () => {
  const engine = new StandardMatchEngine(content);
  let result = engine.execute(createGameState({ gameInstanceId: "flow", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 3 }), command(createGameState({ gameInstanceId: "flow", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 3 }), "x", CommandType.StartStandardGame, "host"));
  let state = result.state;
  for (const phase of ["preparation", "outpost", "action"] as const) {
    for (const actor of ["p1", "p2"]) {
      assert.equal(state.phase, phase);
      result = engine.execute(state, command(state, `${phase}-${actor}`, CommandType.CompletePlayerWindow, actor));
      state = result.state;
      if (phase === "action") {
        assert.equal(state.activePlayerId, actor);
        assert.equal(state.step, "play-batch-draft");
        result = engine.execute(state, command(state, `${phase}-${actor}-play`, CommandType.CompletePlayerWindow, actor));
        state = result.state;
      }
    }
  }
  assert.equal(state.phase, "combat");
  assert.equal(state.step, "player-window");
  assert.equal(state.activePlayerId, "p1");
});

test("命令信封统一拒绝空身份和非法修订号", () => {
  const state = createGameState({ gameInstanceId: "command-envelope", players: [{ id: "p1", name: "一" }], seed: 15 });
  assert.throws(() => assertCommandEnvelope({ commandId: "", gameInstanceId: state.gameInstanceId, actorId: "p1", expectedRevision: 0, type: "x", payload: {} }, state), /COMMAND_ENVELOPE_INVALID/);
  assert.throws(() => assertCommandEnvelope({ commandId: "c", gameInstanceId: state.gameInstanceId, actorId: "p1", expectedRevision: -1, type: "x", payload: {} }, state), /COMMAND_REVISION_INVALID/);
});

test("公开投影不会泄露他人手牌、身份或RNG", () => {
  const state = createGameState({ gameInstanceId: "projection", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 9 });
  state.players.p1.hand = ["hidden-card"];
  state.players.p2.masterId = "master.secret";
  state.players.p2.servantId = "servant.secret";
  const view = projectPublicState(state, "p1");
  assert.equal(view.players.p1.handCount, 1);
  assert.equal(view.players.p2.handCount, 0);
  assert.equal(view.players.p2.masterId, null);
  state.cards.hidden = { instanceId: "hidden", definitionId: "secret", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "hand", face: "up", active: false, residual: false, temporary: false, modifiers: [] };
  assert.equal(projectPublicState(state, "p1").cards.hidden.definitionId, null);
  assert.equal("rng" in view, false);
  state.board.currentEvents = { mountain: ["event.mountain"], city: ["event.city"] };
  state.board.eventVisibility = { "event.mountain": "up", "event.city": "down" };
  state.board.eventDeck = ["event.next"];
  state.board.situationDeck = ["situation.next"];
  const hiddenEvents = projectPublicState(state, "p1");
  assert.deepEqual(hiddenEvents.board.currentEvents, { mountain: ["event.mountain"], city: ["event:hidden"] });
  assert.deepEqual(hiddenEvents.board.eventDeck, ["event:hidden"]);
  assert.deepEqual(hiddenEvents.board.situationDeck, ["situation:hidden"]);
  assert.equal("event.city" in hiddenEvents.board.eventVisibility, false);
});

test("真名解放只公开从者身份及其技能牌，不连带公开御主", () => {
  const state = createGameState({ gameInstanceId: "true-name-projection", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 19 });
  state.players.p2.masterId = "master.secret";
  state.players.p2.servantId = "servant.secret";
  state.players.p2.servantSkills = ["p2:skill"];
  state.cards["p2:skill"] = { instanceId: "p2:skill", definitionId: "servant.secret.skill.one", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "servant-skills", face: "down", active: false, residual: false, temporary: false, modifiers: [] };

  const hidden = projectPublicState(state, "p1");
  assert.equal(projectPublicState(state, "p2").players.p2.trueNameRevealed, false);
  assert.equal(hidden.players.p2.masterId, null);
  assert.equal(hidden.players.p2.servantId, null);
  assert.equal(hidden.cards["p2:skill"].definitionId, null);

  state.players.p2.trueNameRevealed = true;
  const revealed = projectPublicState(state, "p1");
  assert.equal(revealed.players.p2.masterId, null);
  assert.equal(revealed.players.p2.servantId, "servant.secret");
  assert.equal(revealed.cards["p2:skill"].definitionId, "servant.secret.skill.one");
});

test("公开投影只向决策参与者展示选项", () => {
  const state = createGameState({ gameInstanceId: "decision-visibility", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 13 });
  state.pendingDecision = { decisionId: "d1", ownerPlayerId: "p1", chooserPlayerIds: ["p1"], kind: "choose", options: [{ id: "secret", label: "隐藏选项" }], min: 1, max: 1, allowCancel: true, submissions: {} };
  assert.equal(projectPublicState(state, "p1").pendingDecision?.options.length, 1);
  assert.equal(projectPublicState(state, "p2").pendingDecision?.options.length, 0);
  assert.deepEqual(projectPublicState(state, "p2").pendingDecision?.submissions, {});
});

test("决策窗口拒绝不可序列化的参与者、选项和选择范围", async () => {
  const { DecisionManager } = await import("../src/match-engine/decisions.ts");
  const state = createGameState({ gameInstanceId: "decision-validation", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 2 });
  const manager = new DecisionManager();
  assert.throws(() => manager.open(state, { decisionId: "bad", ownerPlayerId: "p1", chooserPlayerIds: ["missing"], kind: "choose", options: [{ id: "x", label: "X" }], min: 1, max: 1, allowCancel: true, submissions: {} }), /DECISION_CHOOSER_INVALID/);
  assert.throws(() => manager.open(state, { decisionId: "bad", ownerPlayerId: "p1", chooserPlayerIds: ["p1"], kind: "choose", options: [{ id: "x", label: "X" }], min: 0, max: 2, allowCancel: true, submissions: {} }), /DECISION_SELECTION_RANGE_INVALID/);
  manager.open(state, { decisionId: "ok", ownerPlayerId: "p1", chooserPlayerIds: ["p1"], kind: "choose", options: [{ id: "x", label: "X" }], min: 0, max: 1, allowCancel: true, submissions: {} });
  assert.throws(() => manager.resolve(state, { decisionId: "ok", actorId: "p1", selections: undefined as never }), /DECISION_SELECTION_INVALID/);
});
