import type { EffectFrame, GameState, PendingDecision } from "../domain/state/types.ts";
import type { SkillHandler, SkillRuntimeCatalog } from "../rules-core/skill-types.ts";
import type { CardDefinition } from "../rules-core/content-types.ts";
import { captureStateFacts, emitStateFactDiff } from "../rules-core/state-facts.ts";
import { runWithOtherPlayerAbilityImmunity } from "../rules-core/ability-immunity.ts";

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

  drain(state: GameState, maxEffects = 1000, definitions?: Record<string, CardDefinition>, emitEvent?: (type: string, payload: unknown) => void, executeCardAbility?: (playerId: string, instanceId: string, abilityId: string, target?: unknown, options?: { timingOverride?: boolean }) => void, runtimeCatalog?: SkillRuntimeCatalog, randomInt?: (maxExclusive: number) => number): number {
    let resolved = 0;
    while (state.effectQueue.length > 0 && !state.pendingDecision) {
      if (resolved >= maxEffects) throw new Error("EFFECT_LOOP_LIMIT");
      this.resolveNext(state, definitions, emitEvent, executeCardAbility, runtimeCatalog, randomInt);
      resolved += 1;
    }
    return resolved;
  }

  resolveNext(state: GameState, definitions?: Record<string, CardDefinition>, emitEvent?: (type: string, payload: unknown) => void, executeCardAbility?: (playerId: string, instanceId: string, abilityId: string, target?: unknown, options?: { timingOverride?: boolean }) => void, runtimeCatalog?: SkillRuntimeCatalog, randomInt?: (maxExclusive: number) => number): EffectFrame | null {
    if (state.pendingDecision) throw new Error("DECISION_BLOCKS_EFFECT_QUEUE");
    const frame = state.effectQueue.shift();
    if (!frame) return null;
    const handler = this.#handlers.get(frame.handlerId);
    if (!handler) throw new Error(`EFFECT_HANDLER_NOT_FOUND:${frame.handlerId}`);
    const player = frame.controllerPlayerId ? state.players[frame.controllerPlayerId] : undefined;
    if (!player) throw new Error("EFFECT_CONTROLLER_NOT_FOUND");
    const factSnapshot = captureStateFacts(state);
    runWithOtherPlayerAbilityImmunity(state, player.id, () => handler({
      state,
      player,
      skill: { id: frame.sourceId, name: frame.sourceId, ownerType: "master", ownerId: player.masterId ?? "", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" },
      payload: frame.payload,
      openDecision: (decision: PendingDecision) => {
        if (state.pendingDecision) throw new Error("DECISION_ALREADY_OPEN");
        state.pendingDecision = structuredClone(decision);
      },
      emitEvent,
      executeCardAbility: executeCardAbility ? ((instanceId, abilityId, target, options) => executeCardAbility(player.id, instanceId, abilityId, target, options)) : undefined,
      randomInt,
      definitions,
      runtimeCatalog,
    }), frame.sourceId);
    emitStateFactDiff(factSnapshot, state, emitEvent, { sourceId: frame.sourceId });
    return frame;
  }
}
