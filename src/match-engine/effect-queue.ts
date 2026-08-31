import type { EffectFrame, GameState } from "../domain/state/types.ts";

export class EffectQueue {
  enqueue(state: GameState, effect: EffectFrame): void {
    if (!effect || typeof effect.effectId !== "string" || !effect.effectId || typeof effect.handlerId !== "string" || !effect.handlerId) {
      throw new Error("EFFECT_FRAME_INVALID");
    }
    if (state.effectQueue.some((queued) => queued.effectId === effect.effectId)) {
      throw new Error("EFFECT_ID_DUPLICATE");
    }
    state.effectQueue.push(structuredClone(effect));
  }

  take(state: GameState): EffectFrame | null {
    return state.effectQueue.shift() ?? null;
  }

  peek(state: GameState): EffectFrame | null {
    return state.effectQueue[0] ?? null;
  }
}
