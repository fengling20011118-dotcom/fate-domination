import { createGameState, cloneState, type PlayerSeed } from "../domain/state/createGameState.ts";
import type { GameCommand, } from "../match-engine/commands.ts";
import type { GameEvent, GameState } from "../domain/state/types.ts";
import { StandardMatchEngine, type StandardContent } from "../match-engine/standard-match-engine.ts";
import { projectPublicState, type PublicGameState } from "../projection/project-state.ts";
import { restoreSnapshot, serializeSnapshot } from "../save/snapshots.ts";
import { assertStateInvariants } from "../domain/state/invariants.ts";
import type { CardDefinition } from "../rules-core/content-types.ts";
import type { AvailableAction, CalculationDetail, CommandResult } from "./integration-contract.ts";

export interface DispatchResult {
  state: GameState;
  events: GameEvent[];
  duplicate: boolean;
}

/** Application boundary shared by local UI, save files and future transports. */
export class GameApplication {
  #state: GameState;
  readonly #engine: StandardMatchEngine;
  readonly #content: StandardContent;

  constructor(input: { state: GameState; content: StandardContent }) {
    this.#state = cloneState(input.state);
    this.#content = input.content;
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

  availableActionsFor(playerId: string): AvailableAction[] {
    return this.#engine.getLegalActions(this.#state, playerId).map((action, index) => ({
      id: `${this.#state.revision}:${playerId}:${action.type}:${index}`,
      commandType: action.type,
      label: action.label ?? action.type,
      payload: structuredClone(action.payload),
      input: toActionInput(action.type, action.payload),
    }));
  }

  /** Static definitions are safe catalog data; card instances and zones remain in MatchView. */
  cardDefinitions(): Record<string, CardDefinition> {
    return structuredClone(this.#content.cards);
  }

  /** Front-end transport boundary: never returns the authoritative GameState. */
  dispatchFor(playerId: string, command: GameCommand): CommandResult {
    try {
      const result = this.dispatch(command);
      return {
        ok: true,
        commandId: command.commandId,
        duplicate: result.duplicate,
        revision: result.state.revision,
        view: this.viewFor(playerId),
        availableActions: this.availableActionsFor(playerId),
        events: structuredClone(result.events),
        calculations: extractCalculations(result.events),
      };
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":", 1)[0] : "COMMAND_REJECTED";
      return {
        ok: false,
        commandId: command.commandId,
        revision: this.#state.revision,
        view: this.viewFor(playerId),
        availableActions: this.availableActionsFor(playerId),
        rejection: { code, retryable: code === "REVISION_MISMATCH" },
      };
    }
  }

  save(savedAt?: string): string { return serializeSnapshot(this.#state, savedAt); }

  restore(serialized: string): void { this.#state = restoreSnapshot(serialized, this.#state.gameInstanceId); }
}

function toActionInput(type: string, payload: unknown): AvailableAction["input"] {
  if (type === "decision.resolve" && payload && typeof payload === "object") {
    const value = payload as { options?: Array<{ id: string; label: string; disabled?: boolean }>; min?: number; max?: number };
    return { kind: "multi-choice", options: value.options, min: value.min, max: value.max };
  }
  return { kind: payload && typeof payload === "object" && Object.keys(payload).length > 0 ? "structured" : "none" };
}

function extractCalculations(events: GameEvent[]): CalculationDetail[] {
  return events.flatMap((event) => {
    if (!event.payload || typeof event.payload !== "object") return [];
    const payload = event.payload as Record<string, unknown>;
    const raw = payload.calculation ?? payload.calculations ?? payload.breakdown;
    if (!raw) return [];
    return Array.isArray(raw) ? structuredClone(raw) as CalculationDetail[] : [structuredClone(raw) as CalculationDetail];
  });
}
