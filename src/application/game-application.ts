import { createGameState, cloneState, type PlayerSeed } from "../domain/state/createGameState.ts";
import type { GameCommand, } from "../match-engine/commands.ts";
import type { GameEvent, GameState } from "../domain/state/types.ts";
import { StandardMatchEngine, type StandardContent } from "../match-engine/standard-match-engine.ts";
import { projectPublicState, type PublicGameState } from "../projection/project-state.ts";
import { restoreSnapshot, serializeSnapshot } from "../save/snapshots.ts";
import { assertStateInvariants } from "../domain/state/invariants.ts";

export interface DispatchResult {
  state: GameState;
  events: GameEvent[];
  duplicate: boolean;
}

/** Application boundary shared by local UI, save files and future transports. */
export class GameApplication {
  #state: GameState;
  readonly #engine: StandardMatchEngine;

  constructor(input: { state: GameState; content: StandardContent }) {
    this.#state = cloneState(input.state);
    this.#engine = new StandardMatchEngine(input.content);
  }

  static create(input: { gameInstanceId: string; players: PlayerSeed[]; seed: number; content: StandardContent }): GameApplication {
    return new GameApplication({ state: createGameState({ gameInstanceId: input.gameInstanceId, players: input.players, seed: input.seed }), content: input.content });
  }

  get state(): GameState { return cloneState(this.#state); }

  dispatch(command: GameCommand): DispatchResult {
    const result = this.#engine.execute(this.#state, command);
    assertStateInvariants(result.state);
    this.#state = result.state;
    return { state: cloneState(result.state), events: structuredClone(result.events), duplicate: result.duplicate };
  }

  viewFor(playerId: string): PublicGameState { return projectPublicState(this.#state, playerId); }

  save(savedAt?: string): string { return serializeSnapshot(this.#state, savedAt); }

  restore(serialized: string): void { this.#state = restoreSnapshot(serialized, this.#state.gameInstanceId); }
}
