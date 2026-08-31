import type { GameCommand } from "./commands.ts";
import { assertCommandEnvelope, CommandType } from "./commands.ts";
import { createEvent } from "./events.ts";
import { cloneState } from "../domain/state/createGameState.ts";
import type { GameEvent, GameState } from "../domain/state/types.ts";
import { DecisionManager } from "./decisions.ts";
import { PhaseEngine } from "./phases.ts";
import { assertCanPlayCard } from "../rules-core/legality.ts";

export class MatchEngine {
  readonly phases = new PhaseEngine();
  readonly decisions = new DecisionManager();

  execute(current: GameState, command: GameCommand): { state: GameState; events: GameEvent[]; duplicate: boolean } {
    assertCommandEnvelope(command, current);
    if (current.processedCommandIds.includes(command.commandId)) return { state: current, events: [], duplicate: true };
    if (command.expectedRevision !== current.revision) throw new Error("REVISION_MISMATCH");

    const state = cloneState(current);
    const events: GameEvent[] = [];
    const emit = (type: string, payload: unknown): void => {
      events.push(createEvent(state, command.commandId, events.length, type, payload));
    };

    switch (command.type) {
      case CommandType.StartGame:
        this.phases.start(state);
        emit("game.started", { round: state.round, phase: state.phase, activePlayerId: state.activePlayerId });
        break;
      case CommandType.CompletePlayerWindow:
        {
          const result = this.phases.completePlayerWindow(state, command.actorId);
          emit("phase.player-window.closed", { playerId: command.actorId });
          emit("phase.transitioned", result);
        }
        break;
      case CommandType.ResolveDecision:
        {
          const payload = command.payload as { decisionId: string; selections: string[] };
          const decision = this.decisions.resolve(state, { decisionId: payload.decisionId, actorId: command.actorId, selections: payload.selections });
          emit("decision.resolved", decision);
        }
        break;
      case CommandType.CancelDecision:
        {
          const payload = command.payload as { decisionId: string };
          const decision = this.decisions.cancel(state, { decisionId: payload.decisionId, actorId: command.actorId });
          emit("decision.cancelled", decision);
        }
        break;
      case CommandType.SetDefeated:
        {
          const payload = command.payload as { playerId: string; value: boolean };
          if (command.actorId !== "host") throw new Error("HOST_ONLY_COMMAND");
          if (!state.players[payload.playerId]) throw new Error("PLAYER_NOT_FOUND");
          state.players[payload.playerId].defeated = payload.value;
          emit("player.defeat-status.changed", payload);
        }
        break;
      case CommandType.PlayCard:
        assertCanPlayCard(state, command.actorId);
        emit("card.played", { playerId: command.actorId, payload: command.payload });
        break;
      default:
        throw new Error("COMMAND_UNKNOWN");
    }

    state.revision += 1;
    state.processedCommandIds.push(command.commandId);
    state.eventLog.push(...events);
    return { state, events, duplicate: false };
  }
}
