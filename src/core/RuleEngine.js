import { ChoiceManager } from "./ChoiceManager.js";
import { COMMANDS } from "./constants.js";
import { EffectQueue } from "./EffectQueue.js";
import { EffectRuntime } from "./EffectRuntime.js";
import { EventBus } from "./EventBus.js";
import { PhaseEngine } from "./PhaseEngine.js";
import { RandomService } from "./RandomService.js";
import { cloneGameState } from "./createGameState.js";
import { invariant } from "./errors.js";

export class RuleEngine {
  constructor({ eventBus, phaseEngine, effectQueue, effectRuntime, choiceManager, random } = {}) {
    this.events = eventBus ?? new EventBus();
    this.phases = phaseEngine ?? new PhaseEngine();
    this.effects = effectQueue ?? new EffectQueue();
    this.effectRuntime = effectRuntime ?? new EffectRuntime();
    this.choices = choiceManager ?? new ChoiceManager();
    this.random = random ?? new RandomService();
  }

  execute(currentState, command) {
    this.#validateCommandIdentity(currentState, command);
    if (currentState.processedCommandIds.includes(command.id)) {
      return { state: currentState, events: [], duplicate: true };
    }
    this.#validateExpectedRevision(currentState, command);

    const state = cloneGameState(currentState);
    const emitted = [];
    const emit = (type, payload = {}) => {
      const event = {
        id: `${command.id}:${emitted.length}`,
        type,
        gameInstanceId: state.gameInstanceId,
        revision: state.revision + 1,
        payload: structuredClone(payload),
      };
      emitted.push(event);
      const triggeredEffects = this.events.emit(event, { state, command, engine: this });
      for (const effect of triggeredEffects) this.effects.enqueue(state, effect);
      return event;
    };

    switch (command.type) {
      case COMMANDS.START_GAME: {
        const window = this.phases.start(state);
        emit("game.started", { window });
        emit("phase.player-window.opened", window);
        break;
      }
      case COMMANDS.ADVANCE_PHASE_PLAYER: {
        const previous = this.phases.currentWindow(state);
        const result = this.phases.completePlayerWindow(state, command.playerId);
        emit("phase.player-window.closed", previous);
        emit("phase.player-window.opened", result.window);
        if (result.transition === "next-phase") {
          emit("phase.started", result.window);
        } else if (result.transition === "next-round") {
          emit("round.started", result.window);
        }
        break;
      }
      case COMMANDS.MAKE_CHOICE: {
        const result = this.choices.resolve(state, command.payload);
        emit("choice.resolved", result);
        break;
      }
      case COMMANDS.CANCEL_CHOICE: {
        const result = this.choices.cancel(state, command.payload);
        emit("choice.cancelled", result);
        break;
      }
      default:
        invariant(false, "COMMAND_UNKNOWN", "未知游戏命令。", { type: command.type });
    }

    this.effectRuntime.drain(state, {
      command,
      emit,
      engine: this,
      effectQueue: this.effects,
      choices: this.choices,
      random: this.random,
    });

    state.revision += 1;
    state.processedCommandIds.push(command.id);
    state.eventLog.push(...emitted);
    return { state, events: emitted, duplicate: false };
  }

  getLegalActions(state, playerId) {
    if (state.pendingChoice) {
      if (state.pendingChoice.playerId !== playerId) return [];
      return [
        { type: COMMANDS.MAKE_CHOICE, choiceId: state.pendingChoice.id },
        ...(state.pendingChoice.allowCancel
          ? [{ type: COMMANDS.CANCEL_CHOICE, choiceId: state.pendingChoice.id }]
          : []),
      ];
    }

    const current = this.phases.currentWindow(state);
    return current.playerId === playerId
      ? [{ type: COMMANDS.ADVANCE_PHASE_PLAYER }]
      : [];
  }

  #validateCommandIdentity(state, command) {
    invariant(command?.id, "COMMAND_ID_REQUIRED", "命令必须拥有唯一 ID。");
    invariant(command?.type, "COMMAND_TYPE_REQUIRED", "命令必须声明类型。");
    invariant(
      command.gameInstanceId === state.gameInstanceId,
      "GAME_INSTANCE_MISMATCH",
      "命令属于另一局游戏。",
      { expected: state.gameInstanceId, received: command.gameInstanceId },
    );
  }

  #validateExpectedRevision(state, command) {
    invariant(
      command.expectedRevision === state.revision,
      "REVISION_MISMATCH",
      "客户端状态版本已经过期。",
      { expected: state.revision, received: command.expectedRevision },
    );
  }
}
