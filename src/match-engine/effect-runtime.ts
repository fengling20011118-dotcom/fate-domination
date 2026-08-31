import type { EffectFrame, GameState, PendingDecision } from "../domain/state/types.ts";
import type { SkillHandler } from "../rules-core/skill-types.ts";

export class EffectRuntime {
  readonly #handlers = new Map<string, SkillHandler>();

  register(handlerId: string, handler: SkillHandler): void {
    if (!handlerId) throw new Error("EFFECT_HANDLER_ID_REQUIRED");
    if (typeof handler !== "function") throw new Error("EFFECT_HANDLER_INVALID");
    if (this.#handlers.has(handlerId)) throw new Error("EFFECT_HANDLER_DUPLICATE");
    this.#handlers.set(handlerId, handler);
  }

  has(handlerId: string): boolean {
    return this.#handlers.has(handlerId);
  }

  list(): string[] {
    return [...this.#handlers.keys()];
  }

  drain(state: GameState, maxEffects = 1000): number {
    let resolved = 0;
    while (state.effectQueue.length > 0 && !state.pendingDecision) {
      if (resolved >= maxEffects) throw new Error("EFFECT_LOOP_LIMIT");
      this.resolveNext(state);
      resolved += 1;
    }
    return resolved;
  }

  resolveNext(state: GameState): EffectFrame | null {
    if (state.pendingDecision) throw new Error("DECISION_BLOCKS_EFFECT_QUEUE");
    const frame = state.effectQueue.shift();
    if (!frame) return null;
    const handler = this.#handlers.get(frame.handlerId);
    if (!handler) throw new Error("EFFECT_HANDLER_NOT_FOUND");
    const player = frame.controllerPlayerId ? state.players[frame.controllerPlayerId] : undefined;
    if (!player) throw new Error("EFFECT_CONTROLLER_NOT_FOUND");
    handler({
      state,
      player,
      skill: { id: frame.sourceId, name: frame.sourceId, ownerType: "master", ownerId: player.masterId ?? "", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" },
      payload: frame.payload,
      openDecision: (decision: PendingDecision) => {
        if (state.pendingDecision) throw new Error("DECISION_ALREADY_OPEN");
        state.pendingDecision = structuredClone(decision);
      },
    });
    return frame;
  }
}
