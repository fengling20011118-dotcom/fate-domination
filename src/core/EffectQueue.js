import { invariant } from "./errors.js";

export class EffectQueue {
  enqueue(state, effect) {
    invariant(effect?.id, "EFFECT_ID_REQUIRED", "效果必须拥有稳定 ID。", {
      effect,
    });
    invariant(effect?.type, "EFFECT_TYPE_REQUIRED", "效果必须声明类型。", {
      effect,
    });
    state.effectQueue.push(structuredClone(effect));
  }

  prepend(state, effects) {
    state.effectQueue.unshift(...structuredClone(effects));
  }

  peek(state) {
    return state.effectQueue[0] ?? null;
  }

  take(state) {
    return state.effectQueue.shift() ?? null;
  }

  isBlocked(state) {
    return Boolean(state.pendingChoice);
  }
}
