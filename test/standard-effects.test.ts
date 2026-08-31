import test from "node:test";
import assert from "node:assert/strict";

import { createGameState } from "../src/domain/state/createGameState.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { createEffectFrame, DRAW_CARDS_EFFECT, GAIN_RESOURCES_EFFECT, registerStandardEffectHandlers } from "../src/rules-core/standard-effects.ts";

test("标准资源效果从结构化载荷增加魔力和战果", () => {
  const state = createGameState({ gameInstanceId: "effect-resources", players: [{ id: "p1", name: "一" }], seed: 7 });
  const runtime = new EffectRuntime();
  registerStandardEffectHandlers(runtime);
  state.effectQueue.push(createEffectFrame({
    effectId: "effect.resources.1", handlerId: GAIN_RESOURCES_EFFECT, sourceId: "skill.source", controllerPlayerId: "p1",
    payload: { mana: 2, victoryPoints: 3 }, state,
  }));
  runtime.drain(state);
  assert.equal(state.players.p1.mana, 2);
  assert.equal(state.players.p1.victoryPoints, 3);
  assert.equal(state.effectQueue.length, 0);
});

test("标准资源效果拒绝负数和非整数，不会静默修正非法规则载荷", () => {
  const state = createGameState({ gameInstanceId: "effect-resources-invalid", players: [{ id: "p1", name: "一" }], seed: 7 });
  const runtime = new EffectRuntime();
  registerStandardEffectHandlers(runtime);
  state.effectQueue.push(createEffectFrame({
    effectId: "effect.resources.invalid", handlerId: GAIN_RESOURCES_EFFECT, sourceId: "skill.source", controllerPlayerId: "p1",
    payload: { mana: -1, victoryPoints: 0 }, state,
  }));
  assert.throws(() => runtime.drain(state), /RESOURCE_MANA_INVALID/);
  assert.equal(state.players.p1.mana, 0);
  assert.equal(state.players.p1.victoryPoints, 0);
});

test("标准抽牌效果使用权威 RNG 并在牌堆耗尽时重洗弃牌堆", () => {
  const make = () => {
    const state = createGameState({ gameInstanceId: "effect-draw", players: [{ id: "p1", name: "一" }], seed: 19 });
    for (const index of [1, 2, 3]) createOwnedCardInstance(state, "p1", { instanceId: `p1:discard:${index}`, definitionId: `card.${index}`, zone: "discard" });
    state.effectQueue.push(createEffectFrame({
      effectId: "effect.draw.1", handlerId: DRAW_CARDS_EFFECT, sourceId: "skill.source", controllerPlayerId: "p1", payload: { count: 2 }, state,
    }));
    const runtime = new EffectRuntime();
    registerStandardEffectHandlers(runtime);
    runtime.drain(state);
    return state;
  };
  const first = make();
  const replay = make();
  assert.equal(first.players.p1.hand.length, 2);
  assert.equal(first.players.p1.discard.length, 0);
  assert.equal(first.players.p1.deck.length, 1);
  assert.equal(first.rng.draws, 2);
  assert.deepEqual(first.players.p1.hand, replay.players.p1.hand);
  assert.deepEqual(first.players.p1.deck, replay.players.p1.deck);
});

test("标准效果帧拒绝不存在的控制者和空处理器标识", () => {
  const state = createGameState({ gameInstanceId: "effect-frame-invalid", players: [{ id: "p1", name: "一" }], seed: 1 });
  assert.throws(() => createEffectFrame({ effectId: "", handlerId: GAIN_RESOURCES_EFFECT, sourceId: "s", controllerPlayerId: "p1", payload: {}, state }), /STANDARD_EFFECT_FRAME_INVALID/);
  assert.throws(() => createEffectFrame({ effectId: "e", handlerId: GAIN_RESOURCES_EFFECT, sourceId: "s", controllerPlayerId: "missing", payload: {}, state }), /EFFECT_CONTROLLER_NOT_FOUND/);
});
