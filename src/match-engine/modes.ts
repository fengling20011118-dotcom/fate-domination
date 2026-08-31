import type {
  EffectFrame,
  GameAction,
  GameEvent,
  GameState,
  PhasePlan,
  PublicModeState,
  VictoryStatus,
} from "../domain/state/types.ts";

export interface ModeContext {
  randomInt(maxExclusive: number): number;
  emit(type: string, payload: unknown): void;
}

export interface GameModeDefinition {
  id: GameState["mode"];
  version: string;
  playerLimits: { min: number; max: number };
  setup(state: GameState, context: ModeContext): void;
  getPhasePlan(state: GameState): PhasePlan;
  getLegalActions(state: GameState, playerId: string): GameAction[];
  onEvent(event: GameEvent, state: GameState, context: ModeContext): EffectFrame[];
  getVictoryStatus(state: GameState): VictoryStatus;
  projectPublicState(state: GameState): PublicModeState;
}

export class ModeRegistry {
  #modes = new Map<string, GameModeDefinition>();

  register(mode: GameModeDefinition): void {
    if (!mode.id || !mode.version) throw new Error("MODE_ID_VERSION_REQUIRED");
    if (this.#modes.has(mode.id)) throw new Error("MODE_ID_DUPLICATE");
    if (mode.playerLimits.min < 1 || mode.playerLimits.max < mode.playerLimits.min) {
      throw new Error("MODE_PLAYER_LIMIT_INVALID");
    }
    this.#modes.set(mode.id, mode);
  }

  has(modeId: string): boolean {
    return this.#modes.has(modeId);
  }

  list(): GameModeDefinition[] {
    return [...this.#modes.values()];
  }

  get(modeId: string): GameModeDefinition {
    const mode = this.#modes.get(modeId);
    if (!mode) throw new Error("MODE_NOT_FOUND");
    return mode;
  }
}
