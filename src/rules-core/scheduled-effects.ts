import type { EffectFrame, GameEvent, GameState, ScheduledEffect } from "../domain/state/types.ts";

export function scheduleEffect(state: GameState, schedule: ScheduledEffect): void {
  if (!schedule.scheduleId || !schedule.sourceId || !schedule.handlerId || !schedule.triggerEventType) throw new Error("SCHEDULE_INPUT_INVALID");
  if (!state.players[schedule.controllerPlayerId]) throw new Error("SCHEDULE_CONTROLLER_NOT_FOUND");
  if ((state.scheduledEffects ?? []).some((item) => item.scheduleId === schedule.scheduleId)) throw new Error("SCHEDULE_ID_DUPLICATE");
  if (schedule.triggerRound !== undefined && (!Number.isInteger(schedule.triggerRound) || schedule.triggerRound < 0)) throw new Error("SCHEDULE_TRIGGER_ROUND_INVALID");
  if (schedule.expiresAfterRound !== undefined && (!Number.isInteger(schedule.expiresAfterRound) || schedule.expiresAfterRound < 0)) throw new Error("SCHEDULE_EXPIRY_INVALID");
  if (schedule.triggerRound !== undefined && schedule.expiresAfterRound !== undefined && schedule.expiresAfterRound < schedule.triggerRound) throw new Error("SCHEDULE_RANGE_INVALID");
  state.scheduledEffects ??= [];
  state.scheduledEffects.push(structuredClone(schedule));
}

export function cancelScheduledEffect(state: GameState, scheduleId: string): boolean {
  const index = (state.scheduledEffects ?? []).findIndex((item) => item.scheduleId === scheduleId);
  if (index < 0) return false;
  state.scheduledEffects.splice(index, 1);
  return true;
}

/** Materialize due schedules as normal effect frames after a domain event. */
export function enqueueScheduledEffects(state: GameState, event: GameEvent): EffectFrame[] {
  state.scheduledEffects ??= [];
  state.scheduledEffects = state.scheduledEffects.filter((schedule) => schedule.expiresAfterRound === undefined || state.round <= schedule.expiresAfterRound);
  const due = state.scheduledEffects.filter((schedule) => schedule.triggerEventType === event.type
    && (schedule.triggerRound === undefined || schedule.triggerRound === state.round));
  const frames = due.map((schedule) => ({
    effectId: `${event.eventId}:scheduled:${schedule.scheduleId}`,
    handlerId: schedule.handlerId,
    sourceId: schedule.sourceId,
    controllerPlayerId: schedule.controllerPlayerId,
    payload: { scheduled: structuredClone(schedule.payload), event: structuredClone(event.payload), eventType: event.type },
    createdAtRevision: state.revision,
  }));
  if (due.some((schedule) => schedule.once)) {
    const consumed = new Set(due.filter((schedule) => schedule.once).map((schedule) => schedule.scheduleId));
    state.scheduledEffects = state.scheduledEffects.filter((schedule) => !consumed.has(schedule.scheduleId));
  }
  state.effectQueue.push(...frames.map((frame) => structuredClone(frame)));
  return frames;
}
