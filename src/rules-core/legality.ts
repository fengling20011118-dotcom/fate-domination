import type { GameState } from "../domain/state/types.ts";

export function canPlayCard(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player || player.eliminated) return false;
  if (player.defeated) return false;
  if (state.status !== "playing" || state.pendingDecision) return false;
  return state.activePlayerId === playerId && state.phase === "action";
}

export function assertCanPlayCard(state: GameState, playerId: string): void {
  if (!canPlayCard(state, playerId)) throw new Error("CARD_PLAY_FORBIDDEN");
}
