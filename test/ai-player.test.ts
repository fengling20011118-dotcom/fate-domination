import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { planAiCommand, projectAiState } from "../src/ai/ai-player.ts";
import { runAiUntilBlocked } from "../src/ai/ai-runner.ts";
import { CommandType } from "../src/match-engine/commands.ts";

test("AI 投影只增加自己的私有区域，不泄露对手手牌和 RNG", () => {
  const state = createGameState({ gameInstanceId: "ai-view", players: [{ id: "ai", name: "AI" }, { id: "p2", name: "对手" }], seed: 77 });
  state.players.ai.hand = ["ai-card"];
  state.players.p2.hand = ["secret-card"];
  state.cards["ai-card"] = { instanceId: "ai-card", definitionId: "card.own", ownerPlayerId: "ai", controllerPlayerId: "ai", zone: "hand", face: "up", active: false, residual: false, temporary: false, modifiers: [] };
  const view = projectAiState(state, "ai");
  assert.deepEqual(view.self.hand, ["ai-card"]);
  assert.equal(view.publicState.players.p2.handCount, 1);
  assert.equal((view.publicState as Record<string, unknown>).rng, undefined);
  assert.equal((view.publicState.players.p2 as Record<string, unknown>).hand, undefined);
});

test("保守 AI 优先选择明确合法的技能动作，并使用标准命令信封", () => {
  const state = createGameState({ gameInstanceId: "ai-command", players: [{ id: "ai", name: "AI" }], seed: 3 });
  state.status = "playing";
  const command = planAiCommand(state, "ai", [{ type: "skill.use", payload: { skillId: "skill.known" } }], { commandId: "ai-1", expectedRevision: state.revision });
  assert.equal(command?.type, CommandType.UseSkill);
  assert.equal(command?.actorId, "ai");
  assert.equal(command?.gameInstanceId, state.gameInstanceId);
  assert.equal(command?.expectedRevision, state.revision);
});

test("没有明确合法动作时 AI 只结束当前窗口，不猜测牌或隐藏规则", () => {
  const state = createGameState({ gameInstanceId: "ai-safe-fallback", players: [{ id: "ai", name: "AI" }], seed: 5 });
  state.status = "playing";
  const command = planAiCommand(state, "ai", [], { commandId: "ai-2", expectedRevision: state.revision });
  assert.equal(command?.type, CommandType.CompletePlayerWindow);
  assert.deepEqual(command?.payload, {});
});

test("AI 可以在自己的可取消决策中提交首个启用选项", () => {
  const state = createGameState({ gameInstanceId: "ai-decision", players: [{ id: "ai", name: "AI" }], seed: 9 });
  state.status = "playing";
  state.pendingDecision = { decisionId: "decision.ai", ownerPlayerId: "ai", chooserPlayerIds: ["ai"], kind: "choose", options: [{ id: "first", label: "首选" }, { id: "blocked", label: "禁用", disabled: true }], min: 1, max: 1, allowCancel: true, submissions: {} };
  const command = planAiCommand(state, "ai", [], { commandId: "ai-3", expectedRevision: state.revision });
  assert.equal(command?.type, CommandType.ResolveDecision);
  assert.deepEqual(command?.payload, { decisionId: "decision.ai", selections: ["first"] });
});

test("AI 不会在他人决策窗口越权，也不会伪造无法满足的选择", () => {
  const state = createGameState({ gameInstanceId: "ai-blocked-decision", players: [{ id: "ai", name: "AI" }, { id: "p2", name: "玩家" }], seed: 10 });
  state.status = "playing";
  state.pendingDecision = { decisionId: "decision.other", ownerPlayerId: "p2", chooserPlayerIds: ["p2"], kind: "choose", options: [{ id: "a", label: "A" }], min: 1, max: 1, allowCancel: false, submissions: {} };
  assert.equal(planAiCommand(state, "ai", [], { commandId: "ai-other", expectedRevision: state.revision }), null);
  state.pendingDecision = { decisionId: "decision.two", ownerPlayerId: "ai", chooserPlayerIds: ["ai"], kind: "choose", options: [{ id: "a", label: "A" }], min: 2, max: 2, allowCancel: false, submissions: {} };
  assert.equal(planAiCommand(state, "ai", [], { commandId: "ai-two", expectedRevision: state.revision }), null);
});

test("AI 运行器只串行提交自己的合法命令，并在轮次交接后停止", () => {
  const initial = createGameState({ gameInstanceId: "ai-runner", players: [{ id: "ai", name: "AI" }, { id: "p2", name: "玩家" }], seed: 11 });
  initial.status = "playing";
  initial.activePlayerId = "ai";
  let authority = structuredClone(initial);
  const result = runAiUntilBlocked(initial, "ai", {
    getLegalActions: () => [],
    dispatch: (command) => {
      const next = structuredClone(authority);
      next.revision += 1;
      next.activePlayerId = "p2";
      authority = next;
      return { state: next, events: [], duplicate: false };
    },
  });
  assert.equal(result.commands.length, 1);
  assert.equal(result.commands[0].type, CommandType.CompletePlayerWindow);
  assert.equal(result.stopReason, "not-ai-turn");
  assert.equal(result.state.activePlayerId, "p2");
});

test("AI 运行器遇到其他玩家决策时不会越权", () => {
  const state = createGameState({ gameInstanceId: "ai-runner-blocked", players: [{ id: "ai", name: "AI" }, { id: "p2", name: "玩家" }], seed: 12 });
  state.status = "playing";
  state.pendingDecision = {
    decisionId: "decision.p2",
    ownerPlayerId: "p2",
    chooserPlayerIds: ["p2"],
    kind: "choose",
    options: [{ id: "a", label: "A" }],
    min: 1,
    max: 1,
    allowCancel: false,
    submissions: {},
  };
  const result = runAiUntilBlocked(state, "ai", { getLegalActions: () => [], dispatch: () => { throw new Error("DISPATCH_SHOULD_NOT_RUN"); } });
  assert.equal(result.commands.length, 0);
  assert.equal(result.stopReason, "blocked-by-other-decision");
});

test("AI 运行器有明确的命令上限，防止策略无进展循环", () => {
  const initial = createGameState({ gameInstanceId: "ai-runner-limit", players: [{ id: "ai", name: "AI" }], seed: 13 });
  initial.status = "playing";
  initial.activePlayerId = "ai";
  let authority = structuredClone(initial);
  const result = runAiUntilBlocked(initial, "ai", {
    maxCommands: 2,
    getLegalActions: () => [],
    dispatch: (command) => {
      const next = structuredClone(authority);
      next.revision += 1;
      authority = next;
      return { state: next, events: [], duplicate: false };
    },
  });
  assert.equal(result.commands.length, 2);
  assert.equal(result.stopReason, "max-commands");
});
