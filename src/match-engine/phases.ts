import type { GameState, PhaseId } from "../domain/state/types.ts";

const phaseOrder: PhaseId[] = ["preparation", "outpost", "action", "combat"];

function nextLivePlayer(state: GameState, fromIndex: number): { index: number; id: string } | null {
  for (let offset = 1; offset <= state.turnOrder.length; offset += 1) {
    const index = (fromIndex + offset) % state.turnOrder.length;
    const playerId = state.turnOrder[index];
    if (!state.players[playerId]?.eliminated) return { index, id: playerId };
  }
  return null;
}

export class PhaseEngine {
  start(state: GameState): void {
    if (state.status !== "lobby") throw new Error("GAME_ALREADY_STARTED");
    state.status = "playing";
    state.round = 1;
    state.phase = "preparation";
    state.step = "player-window";
    const first = state.turnOrder.find((playerId) => !state.players[playerId].eliminated) ?? null;
    state.activePlayerId = first;
  }

  completePlayerWindow(state: GameState, playerId: string): { transition: string } {
    if (state.status !== "playing") throw new Error("GAME_NOT_PLAYING");
    if (state.pendingDecision) throw new Error("PHASE_BLOCKED_BY_DECISION");
    if (state.activePlayerId !== playerId) throw new Error("NOT_ACTIVE_PLAYER");

    const seat = state.turnOrder.indexOf(playerId);
    const next = nextLivePlayer(state, seat);
    if (next && next.index !== seat) {
      state.activePlayerId = next.id;
      return { transition: "next-player" };
    }

    const phaseIndex = phaseOrder.indexOf(state.phase);
    if (phaseIndex < phaseOrder.length - 1) {
      state.phase = phaseOrder[phaseIndex + 1];
      state.step = "player-window";
      state.activePlayerId = state.turnOrder.find((id) => !state.players[id].eliminated) ?? null;
      return { transition: "next-phase" };
    }

    state.round += 1;
    state.phase = "preparation";
    state.step = "player-window";
    state.activePlayerId = state.turnOrder.find((id) => !state.players[id].eliminated) ?? null;
    for (const player of Object.values(state.players)) player.defeated = false;
    return { transition: "next-round" };
  }
}
