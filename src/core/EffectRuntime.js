import { invariant } from "./errors.js";

export class EffectRuntime {
  #handlers = new Map();

  register(effectType, handler) {
    invariant(effectType, "EFFECT_HANDLER_ID_REQUIRED", "效果处理器必须拥有类型 ID。");
    invariant(typeof handler === "function", "EFFECT_HANDLER_INVALID", "效果处理器必须是函数。");
    invariant(!this.#handlers.has(effectType), "EFFECT_HANDLER_DUPLICATE", "效果处理器重复注册。", {
      effectType,
    });
    this.#handlers.set(effectType, handler);
  }

  drain(state, context) {
    let resolvedCount = 0;
    while (state.effectQueue.length && !state.pendingChoice) {
      invariant(resolvedCount < 1000, "EFFECT_LOOP_LIMIT", "单次命令产生了过多连续效果。");
      const effect = context.effectQueue.take(state);
      const handler = this.#handlers.get(effect.type);
      invariant(handler, "EFFECT_HANDLER_NOT_FOUND", "未找到效果处理器。", {
        effectId: effect.id,
        effectType: effect.type,
      });
      handler({ ...context, state, effect });
      resolvedCount += 1;
    }
    return resolvedCount;
  }
}
