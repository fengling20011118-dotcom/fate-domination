import type { GameAction, GameEvent, GameState } from "../domain/state/types.ts";
import type { GameCommand } from "../match-engine/commands.ts";
import { planAiCommand, conservativeAiPolicy, type AiPolicy } from "./ai-player.ts";

export interface AiDispatchResult {
  state: GameState;
  events: GameEvent[];
  duplicate: boolean;
}

export interface AiRunnerOptions {
  /** Rules-owned action discovery. The runner never invents actions. */
  getLegalActions: (state: GameState, playerId: string) => GameAction[];
  /** The normal application/authoritative dispatch boundary. */
  dispatch: (command: GameCommand) => AiDispatchResult;
  policy?: AiPolicy;
  maxCommands?: number;
  commandIdPrefix?: string;
}

export type AiRunStopReason =
  | "not-playing"
  | "not-ai-turn"
  | "blocked-by-other-decision"
  | "waiting-for-other-choosers"
  | "policy-yielded"
  | "max-commands";

export interface AiRunResult {
  state: GameState;
  commands: GameCommand[];
  stopReason: AiRunStopReason;
}

/**
 * Runs only the AI's currently legal command sequence. This is orchestration,
 * not a rules engine: action discovery and legality remain owned by callers.
 * A bounded loop prevents a malformed policy or transport from spinning.
 */
export function runAiUntilBlocked(initialState: GameState, playerId: string, options: AiRunnerOptions): AiRunResult {
  if (!initialState.players[playerId] || initialState.players[playerId].eliminated) throw new Error("AI_PLAYER_NOT_AVAILABLE");
  const maxCommands = options.maxCommands ?? 32;
  if (!Number.isInteger(maxCommands) || maxCommands <= 0) throw new Error("AI_MAX_COMMANDS_INVALID");

  let state = structuredClone(initialState);
  const commands: GameCommand[] = [];
  const policy = options.policy ?? conservativeAiPolicy;
  const prefix = options.commandIdPrefix ?? `ai:${playerId}`;

  for (let step = 0; step < maxCommands; step += 1) {
    if (state.status !== "playing") return { state, commands, stopReason: "not-playing" };
    const pending = state.pendingDecision;
    if (pending) {
      if (!pending.chooserPlayerIds.includes(playerId)) return { state, commands, stopReason: "blocked-by-other-decision" };
      if (pending.submissions[playerId] !== undefined) return { state, commands, stopReason: "waiting-for-other-choosers" };
    } else if (state.activePlayerId !== playerId) {
      return { state, commands, stopReason: "not-ai-turn" };
    }

    const legalActions = options.getLegalActions(structuredClone(state), playerId);
    const command = planAiCommand(state, playerId, legalActions, {
      commandId: `${prefix}:${state.revision}:${step}`,
      expectedRevision: state.revision,
    }, policy);
    if (!command) return { state, commands, stopReason: "policy-yielded" };

    const result = options.dispatch(command);
    if (!result || !result.state || result.state.revision <= state.revision) throw new Error("AI_DISPATCH_NO_PROGRESS");
    if (result.duplicate) throw new Error("AI_DISPATCH_DUPLICATE");
    commands.push(structuredClone(command));
    state = structuredClone(result.state);
  }

  return { state, commands, stopReason: "max-commands" };
}

