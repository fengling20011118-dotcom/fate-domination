import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { assertStateInvariants } from "../src/domain/state/invariants.ts";
import type { GameEvent } from "../src/domain/state/types.ts";
import { cancelScheduledEffect, enqueueScheduledEffects, scheduleEffect } from "../src/rules-core/scheduled-effects.ts";
import { restoreSnapshot, serializeSnapshot } from "../src/save/snapshots.ts";

function makeState() {
  const state = createGameState({
    gameInstanceId: "scheduled",
    players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }],
    seed: 1,
  });
  state.round = 2;
  return state;
}

function event(type: string): GameEvent {
  return { eventId: `event:${type}`, type, revision: 1, sourceCommandId: "command", payload: { value: 3 } };
}

test("计划效果只在指定领域事件和回合进入统一效果队列", () => {
  const state = makeState();
  scheduleEffect(state, {
    scheduleId: "next-combat", sourceId: "skill", controllerPlayerId: "p1", handlerId: "test.handler",
    payload: { bonus: 4 }, triggerEventType: "combat.resolved", triggerRound: 3, once: true,
  });
  assert.deepEqual(enqueueScheduledEffects(state, event("combat.resolved")), []);
  state.round = 3;
  const frames = enqueueScheduledEffects(state, event("combat.resolved"));
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0].payload, { scheduled: { bonus: 4 }, event: { value: 3 }, eventType: "combat.resolved" });
  assert.equal(state.scheduledEffects.length, 0);
  assert.equal(state.effectQueue.length, 1);
});

test("持续计划可重复触发、取消并清理过期规则", () => {
  const state = makeState();
  scheduleEffect(state, {
    scheduleId: "persistent", sourceId: "skill", controllerPlayerId: "p1", handlerId: "test.handler",
    payload: null, triggerEventType: "card.played", expiresAfterRound: 2, once: false,
  });
  assert.equal(enqueueScheduledEffects(state, event("card.played")).length, 1);
  assert.equal(state.scheduledEffects.length, 1);
  assert.equal(cancelScheduledEffect(state, "persistent"), true);
  assert.equal(cancelScheduledEffect(state, "persistent"), false);
  scheduleEffect(state, {
    scheduleId: "expired", sourceId: "skill", controllerPlayerId: "p1", handlerId: "test.handler",
    payload: null, triggerEventType: "card.played", expiresAfterRound: 2, once: true,
  });
  state.round = 3;
  assert.deepEqual(enqueueScheduledEffects(state, event("card.played")), []);
  assert.equal(state.scheduledEffects.length, 0);
});

test("计划效果拒绝重复与非法范围并可经过快照恢复", () => {
  const state = makeState();
  const schedule = {
    scheduleId: "saved", sourceId: "skill", controllerPlayerId: "p1", handlerId: "test.handler",
    payload: { target: "p2" }, triggerEventType: "round.started", triggerRound: 4, expiresAfterRound: 4, once: true,
  } as const;
  scheduleEffect(state, schedule);
  assert.throws(() => scheduleEffect(state, schedule), /SCHEDULE_ID_DUPLICATE/);
  assert.throws(() => scheduleEffect(state, { ...schedule, scheduleId: "bad", triggerRound: 5 }), /SCHEDULE_RANGE_INVALID/);
  const restored = restoreSnapshot(serializeSnapshot(state), state.gameInstanceId);
  assert.deepEqual(restored.scheduledEffects, [schedule]);
  assert.doesNotThrow(() => assertStateInvariants(restored));
});
