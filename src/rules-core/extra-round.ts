import type { GameState } from "../domain/state/types.ts";

export interface ForcedExtraRound {
  sourceId: string;
  situationId: string;
  queuedRound: number;
}

function queued(state: GameState): ForcedExtraRound | undefined {
  const raw = state.modeState.forcedExtraRound;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Partial<ForcedExtraRound>;
  return typeof record.sourceId === "string" && record.sourceId.length > 0
    && typeof record.situationId === "string" && record.situationId.length > 0
    && Number.isInteger(record.queuedRound)
    ? record as ForcedExtraRound
    : undefined;
}

/** Queue one generic extra round with a fixed next situation. Only one source may own the transition. */
export function queueForcedExtraRound(state: GameState, sourceId: string, situationId: string): ForcedExtraRound {
  if (!sourceId || !situationId) throw new Error("FORCED_EXTRA_ROUND_INVALID");
  const existing = queued(state);
  if (existing) {
    if (existing.sourceId === sourceId && existing.situationId === situationId && existing.queuedRound === state.round) return existing;
    throw new Error("FORCED_EXTRA_ROUND_CONFLICT");
  }
  const record: ForcedExtraRound = { sourceId, situationId, queuedRound: state.round };
  state.modeState.forcedExtraRound = record;
  return record;
}

export function peekForcedExtraRound(state: GameState): ForcedExtraRound | undefined {
  const record = queued(state);
  return record?.queuedRound === state.round ? record : undefined;
}

/** Consume after ending the current round but before starting the forced round. */
export function consumeForcedExtraRound(state: GameState): ForcedExtraRound | undefined {
  const record = peekForcedExtraRound(state);
  delete state.modeState.forcedExtraRound;
  if (!record) return undefined;
  state.modeState.activeForcedExtraRound = { ...record, round: state.round + 1 };
  return record;
}

export function isForcedExtraRoundActive(state: GameState, sourceId?: string): boolean {
  const raw = state.modeState.activeForcedExtraRound;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const record = raw as { sourceId?: unknown; round?: unknown };
  return Number(record.round) === state.round && (sourceId === undefined || record.sourceId === sourceId);
}
