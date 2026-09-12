import { createGameState, cloneState, type PlayerSeed } from "../domain/state/createGameState.ts";
import type { GameCommand, } from "../match-engine/commands.ts";
import type { GameEvent, GameState } from "../domain/state/types.ts";
import { StandardMatchEngine, type StandardContent } from "../match-engine/standard-match-engine.ts";
import { projectPublicState, type PublicGameState } from "../projection/project-state.ts";
import { restoreSnapshot, serializeSnapshot } from "../save/snapshots.ts";
import { assertStateInvariants } from "../domain/state/invariants.ts";
import type { CardDefinition } from "../rules-core/content-types.ts";
import type { AvailableAction, CalculationDetail, CommandResult } from "./integration-contract.ts";
import { localizeActionLabel, localizePlayerFacingLabel, localizePlayerFacingText, localizeSkillActionLabel } from "../projection/presentation-localization.ts";

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
      label: localizeAvailableActionLabel(action.label, action.type, action.payload, this.#content, this.#state.phase),
      payload: structuredClone(action.payload),
      input: toActionInput(action.type, action.payload),
    }));
  }

  /** Static definitions are safe catalog data; card instances and zones remain in MatchView. */
  cardDefinitions(): Record<string, CardDefinition> {
    const definitions = structuredClone(this.#content.cards);
    for (const definition of Object.values(definitions)) {
      definition.name = localizePlayerFacingLabel(definition.name);
      if (definition.text) definition.text = localizePlayerFacingText(definition.text);
    }
    return definitions;
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

function localizeAvailableActionLabel(
  rawLabel: string | undefined,
  type: string,
  payload: unknown,
  content: StandardContent,
  phase: string,
): string {
  if (type === "skill.use" && payload && typeof payload === "object") {
    const value = payload as { skillId?: unknown; data?: { abilityId?: unknown } };
    if (typeof value.skillId === "string") {
      try {
        const skill = content.skills.get(value.skillId);
        const abilityId = typeof value.data?.abilityId === "string" ? value.data.abilityId : undefined;
        const ability = abilityId ? skill.abilities?.find((candidate) => candidate.id === abilityId) : undefined;
        if (ability) {
          const sameWindowAbilities = (skill.abilities ?? []).filter((candidate) => candidate.windows.some((window) => window === phase));
          const ordinal = sameWindowAbilities.findIndex((candidate) => candidate.id === ability.id);
          return localizeSkillActionLabel({
            skillName: skill.name,
            abilityName: ability.name,
            abilityWindows: ability.windows,
            currentPhase: phase,
            ordinal: ordinal >= 0 ? ordinal : undefined,
            sameWindowCount: sameWindowAbilities.length,
          });
        }
        return localizeSkillActionLabel({ skillName: skill.name });
      } catch {
        // Non-catalog or malformed actions still use the generic presentation mapping below.
      }
    }
  }
  return localizeActionLabel(rawLabel, type);
}

function toActionInput(type: string, payload: unknown): AvailableAction["input"] {
  if (type === "decision.resolve" && payload && typeof payload === "object") {
    const value = payload as { options?: Array<{ id: string; label: string; disabled?: boolean }>; min?: number; max?: number };
    return {
      kind: "multi-choice",
      options: value.options?.map((option) => ({
        ...structuredClone(option),
        label: localizePlayerFacingLabel(option.label, option.id),
      })),
      min: value.min,
      max: value.max,
    };
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
