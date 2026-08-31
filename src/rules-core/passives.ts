import type { GameEvent, GameState, EffectFrame } from "../domain/state/types.ts";
import type { SkillDefinition, SkillHandler } from "./skill-types.ts";

export interface PassiveTriggerDefinition {
  skill: SkillDefinition;
  eventType: string;
  mandatory: boolean;
  condition?: (state: GameState, event: GameEvent, playerId: string) => boolean;
  /** Extra serializable arguments captured when the trigger becomes an effect frame. */
  payload?: (state: GameState, event: GameEvent, playerId: string) => Record<string, unknown>;
  handler: SkillHandler;
}

/** Converts rule events into serializable effect frames; it never calls UI callbacks. */
export class PassiveRuntime {
  readonly #triggers = new Map<string, PassiveTriggerDefinition[]>();

  register(trigger: PassiveTriggerDefinition): void {
    const supportsEventTrigger = ["passive", "residual"].includes(trigger.skill.activation)
      || trigger.skill.passiveEventTypes?.includes(trigger.eventType);
    if (!supportsEventTrigger) throw new Error("PASSIVE_TRIGGER_KIND_INVALID");
    if (!trigger.eventType) throw new Error("PASSIVE_EVENT_REQUIRED");
    if (typeof trigger.handler !== "function") throw new Error("PASSIVE_HANDLER_INVALID");
    if (typeof trigger.mandatory !== "boolean") throw new Error("PASSIVE_OPTIONALITY_INVALID");
    const bucket = this.#triggers.get(trigger.eventType) ?? [];
    bucket.push(trigger);
    this.#triggers.set(trigger.eventType, bucket);
  }

  collect(state: GameState, event: GameEvent): EffectFrame[] {
    const frames: EffectFrame[] = [];
    const uniqueGroups = new Set<string>();
    for (const trigger of this.#triggers.get(event.type) ?? []) {
      if (!trigger.mandatory) continue;
      for (const player of Object.values(state.players)) {
        if (player.eliminated) continue;
        const owns = trigger.skill.ownerType === "master" ? player.masterId === trigger.skill.ownerId : player.servantId === trigger.skill.ownerId;
        if (!owns || trigger.condition && !trigger.condition(state, event, player.id)) continue;
        const uniqueGroup = trigger.skill.uniqueGroup;
        const uniqueKey = uniqueGroup ? `${player.id}:${uniqueGroup}` : undefined;
        if (uniqueKey && uniqueGroups.has(uniqueKey)) continue;
        if (uniqueKey) uniqueGroups.add(uniqueKey);
        frames.push({
          effectId: `${event.eventId}:passive:${trigger.skill.id}:${player.id}`,
          handlerId: trigger.skill.handlerId ?? trigger.skill.id,
          sourceId: trigger.skill.id,
          controllerPlayerId: player.id,
          payload: {
            eventId: event.eventId,
            event: event.payload,
            eventType: event.type,
            ...(trigger.payload?.(state, event, player.id) ?? {}),
          },
          createdAtRevision: state.revision,
        });
      }
    }
    return frames;
  }
}

export function enqueuePassiveEffects(state: GameState, runtime: PassiveRuntime, event: GameEvent): EffectFrame[] {
  const frames = runtime.collect(state, event);
  state.effectQueue.push(...frames.map((frame) => structuredClone(frame)));
  return frames;
}
