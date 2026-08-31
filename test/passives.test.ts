import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";

test("强制被动由规则事件进入效果队列", () => {
  const state = createGameState({ gameInstanceId: "passive", players: [{ id: "p1", name: "一" }], seed: 1 });
  state.players.p1.masterId = "m";
  const runtime = new PassiveRuntime();
  runtime.register({ skill: { id: "m.passive", name: "被动", ownerType: "master", ownerId: "m", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" }, eventType: "card.played", mandatory: true, handler: () => undefined });
  const frames = enqueuePassiveEffects(state, runtime, { eventId: "e1", type: "card.played", revision: 1, sourceCommandId: "c1", payload: { cardId: "x" } });
  assert.equal(frames.length, 1);
  assert.equal(state.effectQueue[0].sourceId, "m.passive");
});

test("被动/阶段型选择能力不会被强制被动触发器自动加入队列", () => {
  const state = createGameState({ gameInstanceId: "optional-passive", players: [{ id: "p1", name: "一" }], seed: 1 });
  state.players.p1.masterId = "m";
  const runtime = new PassiveRuntime();
  runtime.register({ skill: { id: "m.optional", name: "可选", ownerType: "master", ownerId: "m", activation: "passive", windows: ["action"], cost: 0, text: "", supportLevel: "FULL" }, eventType: "card.played", mandatory: false, handler: () => undefined });
  assert.deepEqual(enqueuePassiveEffects(state, runtime, { eventId: "e1", type: "card.played", revision: 1, sourceCommandId: "c1", payload: {} }), []);
});

test("被动触发器注册时拒绝无效处理器和可选性标记", () => {
  const runtime = new PassiveRuntime();
  const skill = { id: "m.passive.invalid", name: "被动", ownerType: "master" as const, ownerId: "m", activation: "passive" as const, windows: [], cost: 0, text: "", supportLevel: "MANUAL" as const };
  assert.throws(() => runtime.register({ skill, eventType: "card.played", mandatory: true, handler: undefined as never }), /PASSIVE_HANDLER_INVALID/);
  assert.throws(() => runtime.register({ skill, eventType: "card.played", mandatory: undefined as never, handler: () => undefined }), /PASSIVE_OPTIONALITY_INVALID/);
});

test("残留能力可以监听领域事件但阶段能力不能冒充强制触发器", () => {
  const runtime = new PassiveRuntime();
  const residual = { id: "s.residual", name: "残留", ownerType: "servant" as const, ownerId: "s", activation: "residual" as const, windows: [], cost: 0, text: "", supportLevel: "FULL" as const, handlerId: "test.residual" };
  runtime.register({ skill: residual, eventType: "player.deployed", mandatory: true, handler: () => undefined });
  const phase = { ...residual, id: "s.phase", activation: "phase" as const, windows: ["outpost" as const] };
  assert.throws(() => runtime.register({ skill: phase, eventType: "player.deployed", mandatory: true, handler: () => undefined }), /PASSIVE_TRIGGER_KIND_INVALID/);
});

test("唯一组被动在同一事件中只生成一个效果帧", () => {
  const runtime = new PassiveRuntime();
  const skill = (id: string) => ({ id, name: id, ownerType: "master" as const, ownerId: "m", activation: "passive" as const, windows: [], cost: 0, uniqueGroup: "same-passive", text: "", supportLevel: "FULL" as const });
  runtime.register({ skill: skill("a"), eventType: "combat.resolved", mandatory: true, handler: () => undefined });
  runtime.register({ skill: skill("b"), eventType: "combat.resolved", mandatory: true, handler: () => undefined });
  const state = createGameState({ gameInstanceId: "passive-unique", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.players.p.masterId = "m";
  const frames = runtime.collect(state, { eventId: "e1", type: "combat.resolved", revision: 0, sourceCommandId: "c1", payload: {} });
  assert.equal(frames.length, 1);
});
