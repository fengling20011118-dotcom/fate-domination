import { invariant } from "./errors.js";

export class ChoiceManager {
  open(state, choice) {
    invariant(!state.pendingChoice, "CHOICE_ALREADY_OPEN", "已有等待中的选择。", {
      pendingChoiceId: state.pendingChoice?.id,
    });
    invariant(choice?.id, "CHOICE_ID_REQUIRED", "选择必须拥有稳定 ID。");
    invariant(choice?.playerId, "CHOICE_PLAYER_REQUIRED", "选择必须指定玩家。");
    invariant(Array.isArray(choice.options), "CHOICE_OPTIONS_REQUIRED", "选择项必须是数组。");

    state.pendingChoice = {
      allowCancel: false,
      min: 1,
      max: 1,
      ...structuredClone(choice),
    };
  }

  resolve(state, { choiceId, playerId, selections }) {
    const choice = this.#requirePendingChoice(state, choiceId, playerId);
    const selected = Array.isArray(selections) ? selections : [selections];

    invariant(
      selected.length >= choice.min && selected.length <= choice.max,
      "CHOICE_SELECTION_COUNT_INVALID",
      "选择数量不符合要求。",
      { min: choice.min, max: choice.max, count: selected.length },
    );

    const optionIds = new Set(choice.options.map((option) => option.id));
    invariant(
      selected.every((id) => optionIds.has(id)),
      "CHOICE_OPTION_INVALID",
      "包含不合法的选择项。",
      { selected },
    );

    state.pendingChoice = null;
    return { choice, status: "resolved", selections: selected };
  }

  cancel(state, { choiceId, playerId }) {
    const choice = this.#requirePendingChoice(state, choiceId, playerId);
    invariant(choice.allowCancel, "CHOICE_CANCEL_FORBIDDEN", "该选择不能取消。");
    state.pendingChoice = null;
    return { choice, status: "cancelled", selections: [] };
  }

  #requirePendingChoice(state, choiceId, playerId) {
    const choice = state.pendingChoice;
    invariant(choice, "CHOICE_NOT_FOUND", "当前没有等待中的选择。");
    invariant(choice.id === choiceId, "CHOICE_ID_MISMATCH", "选择已过期。", {
      expected: choice.id,
      received: choiceId,
    });
    invariant(choice.playerId === playerId, "CHOICE_WRONG_PLAYER", "当前不由该玩家选择。");
    return choice;
  }
}
