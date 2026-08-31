import type { EffectFrame, GameAction, GameEvent, GameState, PhasePlan, PublicModeState, VictoryStatus } from "../domain/state/types.ts";
import type { GameModeDefinition, ModeContext } from "./modes.ts";

export interface StandardModeOptions {
  version?: string;
  /** Optional rules-owned action provider; omitted actions are supplied by shared core components. */
  getActions?: (state: GameState, playerId: string) => GameAction[];
}

/** Standard mode package. It owns only standard-mode boundaries; card, board and combat rules stay shared. */
export function createStandardModeDefinition(options: StandardModeOptions = {}): GameModeDefinition {
  return Object.freeze({
    id: "standard" as const,
    version: options.version ?? "1",
    playerLimits: { min: 3, max: 7 },
    setup(state: GameState): void {
      const count = Object.keys(state.players).length;
      if (state.mode !== "standard") throw new Error("STANDARD_MODE_MISMATCH");
      if (count < 3 || count > 7) throw new Error("STANDARD_PLAYER_LIMIT_INVALID");
    },
    getPhasePlan(): PhasePlan {
      return {
        phases: ["preparation", "outpost", "action", "combat"],
        steps: {
          preparation: ["player-window"],
          outpost: ["player-window"],
          action: ["player-window", "move-decision", "play-batch-draft", "play-batch-commit", "settlement"],
          combat: ["player-window", "post-power-response", "settlement"],
        },
      };
    },
    getLegalActions(state: GameState, playerId: string): GameAction[] {
      if (state.mode !== "standard" || state.status === "finished" || !state.players[playerId] || state.players[playerId].eliminated) return [];
      return options.getActions ? structuredClone(options.getActions(structuredClone(state), playerId)) : [];
    },
    onEvent(_event: GameEvent, _state: GameState, _context: ModeContext): EffectFrame[] {
      return [];
    },
    getVictoryStatus(state: GameState): VictoryStatus {
      if (state.status !== "finished") return { finished: false, winnerIds: [], reason: null };
      const eligible = Object.values(state.players).filter((player) => !player.eliminated);
      const highest = Math.max(0, ...eligible.map((player) => player.victoryPoints));
      return { finished: true, winnerIds: eligible.filter((player) => player.victoryPoints === highest).map((player) => player.id), reason: "final-score" };
    },
    projectPublicState(state: GameState): PublicModeState {
      return {
        modeId: "standard",
        values: {
          round: state.round,
          phase: state.phase,
          step: state.step,
          activePlayerId: state.activePlayerId,
          currentSituationId: state.modeState.currentSituationId ?? null,
          eventGroupId: state.modeState.eventGroupId ?? null,
        },
      };
    },
  });
}
