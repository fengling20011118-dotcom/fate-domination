import type { GameState, PhaseId, PhaseStepId } from "../domain/state/types.ts";

export interface EmbeddedActionReturnState {
  playerId: string;
  returnPhase: PhaseId;
  returnStep: PhaseStepId;
  returnActivePlayerId?: string | null;
  returnPhaseStartPlayerId?: string | null;
}

/**
 * Start one player's Action phase immediately, then return to the interrupted
 * phase/window. The normal phase engine consumes `embeddedPhaseSequence` and
 * marks that player's regular Action phase as already taken for this round.
 */
export function beginEmbeddedActionPhase(state: GameState, playerId: string): void {
  const player = state.players[playerId];
  if (!player || player.eliminated || player.defeated) throw new Error("EMBEDDED_ACTION_PLAYER_INVALID");
  if (state.modeState.embeddedPhaseSequence) throw new Error("EMBEDDED_ACTION_ALREADY_ACTIVE");
  if (state.phase === "action" && state.activePlayerId === playerId) throw new Error("EMBEDDED_ACTION_ALREADY_CURRENT");
  const returnPhase: PhaseId = state.phase;
  const returnStep: PhaseStepId = state.step;
  const returnActivePlayerId = state.activePlayerId;
  const phaseStart = state.modeState.phaseStartPlayerId;
  const returnPhaseStartPlayerId = typeof phaseStart === "string" ? phaseStart : null;
  state.modeState.embeddedPhaseSequence = {
    playerId,
    stage: "action",
    actionOnly: true,
    returnPhase,
    returnStep,
    returnActivePlayerId,
    returnPhaseStartPlayerId,
  };
  state.phase = "action";
  state.step = player.flags.actionPlayBeforeMove === true ? "play-batch-draft" : "move-decision";
  state.activePlayerId = playerId;
}

/** Finish an action-only embedded phase and restore the interrupted window. */
export function finishEmbeddedActionPhase(state: GameState, embedded: EmbeddedActionReturnState): void {
  const player = state.players[embedded.playerId];
  if (player) player.flags.actionTakenEarlyRound = state.round;
  delete state.modeState.embeddedPhaseSequence;
  state.phase = embedded.returnPhase;
  state.step = embedded.returnStep;
  state.activePlayerId = embedded.returnActivePlayerId ?? null;
  state.modeState.phaseStartPlayerId = embedded.returnPhaseStartPlayerId ?? state.activePlayerId;
}
