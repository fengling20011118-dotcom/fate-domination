import type { GameState } from "../domain/state/types.ts";

export type RoundTurnOrderPosition = "first" | "last";

interface RoundTurnOrderOverrideState {
  round: number;
  playerId: string;
  position: RoundTurnOrderPosition;
  baseOrder: string[];
  applied: boolean;
}

const MODE_KEY = "roundTurnOrderOverride";

function readOverride(state: GameState): RoundTurnOrderOverrideState | undefined {
  const raw = state.modeState[MODE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  if (!Number.isInteger(value.round)
    || typeof value.playerId !== "string"
    || (value.position !== "first" && value.position !== "last")
    || !Array.isArray(value.baseOrder)
    || value.baseOrder.some((id) => typeof id !== "string")
    || typeof value.applied !== "boolean") {
    throw new Error("ROUND_TURN_ORDER_OVERRIDE_INVALID");
  }
  return {
    round: Number(value.round),
    playerId: value.playerId,
    position: value.position,
    baseOrder: [...value.baseOrder] as string[],
    applied: value.applied,
  };
}

/**
 * Schedule a one-round position override without mutating the currently-running
 * preparation traversal. The effective order is installed when preparation ends.
 */
export function scheduleRoundTurnOrderPosition(
  state: GameState,
  playerId: string,
  position: RoundTurnOrderPosition,
): void {
  if (!state.players[playerId] || !state.turnOrder.includes(playerId)) throw new Error("ROUND_TURN_ORDER_PLAYER_INVALID");
  if (position !== "first" && position !== "last") throw new Error("ROUND_TURN_ORDER_POSITION_INVALID");
  const existing = readOverride(state);
  if (existing && existing.round === state.round) throw new Error("ROUND_TURN_ORDER_OVERRIDE_CONFLICT");
  state.modeState[MODE_KEY] = {
    round: state.round,
    playerId,
    position,
    baseOrder: [...state.turnOrder],
    applied: false,
  } satisfies RoundTurnOrderOverrideState;
}

/** Apply a scheduled current-round override after preparation has fully closed. */
export function applyScheduledRoundTurnOrderPosition(state: GameState): boolean {
  const override = readOverride(state);
  if (!override || override.round !== state.round || override.applied) return false;
  if (!override.baseOrder.includes(override.playerId)) throw new Error("ROUND_TURN_ORDER_PLAYER_INVALID");
  const others = override.baseOrder.filter((id) => id !== override.playerId);
  state.turnOrder = override.position === "first"
    ? [override.playerId, ...others]
    : [...others, override.playerId];
  state.modeState[MODE_KEY] = { ...override, applied: true } satisfies RoundTurnOrderOverrideState;
  return true;
}

/**
 * Restore the round's unmodified order before the ordinary round-to-round seat
 * rotation is applied. This keeps the override scoped to exactly one round.
 */
export function restoreRoundTurnOrderBeforeRotation(state: GameState): boolean {
  const override = readOverride(state);
  if (!override || override.round !== state.round) return false;
  state.turnOrder = [...override.baseOrder];
  delete state.modeState[MODE_KEY];
  return true;
}

export function hasScheduledRoundTurnOrderPosition(state: GameState): boolean {
  const override = readOverride(state);
  return Boolean(override && override.round === state.round);
}
