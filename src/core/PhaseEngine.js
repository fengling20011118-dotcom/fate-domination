import { GAME_STATUS, PHASES } from "./constants.js";
import { invariant } from "./errors.js";

export class PhaseEngine {
  start(state) {
    invariant(state.status === GAME_STATUS.LOBBY, "GAME_ALREADY_STARTED", "游戏已经开始。");
    state.status = GAME_STATUS.PLAYING;
    state.round = 1;
    state.phase = PHASES[0];
    state.activeSeat = 0;
    return this.currentWindow(state);
  }

  currentWindow(state) {
    return {
      round: state.round,
      phase: state.phase,
      seat: state.activeSeat,
      playerId: state.turnOrder[state.activeSeat],
    };
  }

  completePlayerWindow(state, playerId) {
    invariant(state.status === GAME_STATUS.PLAYING, "GAME_NOT_PLAYING", "游戏尚未进行。");
    invariant(!state.pendingChoice, "PHASE_BLOCKED_BY_CHOICE", "必须先完成当前选择。");

    const current = this.currentWindow(state);
    invariant(current.playerId === playerId, "NOT_ACTIVE_PLAYER", "当前不是该玩家的阶段窗口。", {
      expected: current.playerId,
      received: playerId,
    });

    if (state.activeSeat < state.turnOrder.length - 1) {
      state.activeSeat += 1;
      return { transition: "next-player", window: this.currentWindow(state) };
    }

    const phaseIndex = PHASES.indexOf(state.phase);
    state.activeSeat = 0;
    if (phaseIndex < PHASES.length - 1) {
      state.phase = PHASES[phaseIndex + 1];
      return { transition: "next-phase", window: this.currentWindow(state) };
    }

    state.round += 1;
    state.phase = PHASES[0];
    return { transition: "next-round", window: this.currentWindow(state) };
  }
}
