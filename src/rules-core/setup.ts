import type { GameState } from "../domain/state/types.ts";

export function assignIdentity(state: GameState, playerId: string, masterId: string, servantId: string): void {
  if (state.status !== "lobby" && state.status !== "setup") throw new Error("SETUP_CLOSED");
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  for (const other of Object.values(state.players)) {
    if (other.id !== playerId && (other.masterId === masterId || other.servantId === servantId)) throw new Error("IDENTITY_ALREADY_TAKEN");
  }
  player.masterId = masterId;
  player.servantId = servantId;
  player.ready = false;
}

export function setPlayerReady(state: GameState, playerId: string, ready: boolean): void {
  if (state.status !== "lobby" && state.status !== "setup") throw new Error("SETUP_CLOSED");
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  if (ready && (!player.masterId || !player.servantId)) throw new Error("IDENTITY_REQUIRED");
  player.ready = ready;
  state.status = "setup";
}

export function assertSetupReady(state: GameState): void {
  const players = Object.values(state.players).filter((player) => !player.eliminated);
  if (players.length === 0 || players.some((player) => !player.ready || !player.masterId || !player.servantId)) throw new Error("PLAYERS_NOT_READY");
}
