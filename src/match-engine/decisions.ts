import type { GameState, PendingDecision } from "../domain/state/types.ts";

export class DecisionManager {
  open(state: GameState, decision: PendingDecision): void {
    if (state.pendingDecision) throw new Error("DECISION_ALREADY_OPEN");
    if (!decision || typeof decision.decisionId !== "string" || !decision.decisionId || typeof decision.kind !== "string" || !decision.kind) throw new Error("DECISION_INVALID");
    if (!Array.isArray(decision.chooserPlayerIds) || decision.chooserPlayerIds.length === 0 || new Set(decision.chooserPlayerIds).size !== decision.chooserPlayerIds.length || decision.chooserPlayerIds.some((id) => typeof id !== "string" || !state.players[id])) throw new Error("DECISION_CHOOSER_INVALID");
    if (typeof decision.ownerPlayerId !== "string" || !state.players[decision.ownerPlayerId]) throw new Error("DECISION_OWNER_INVALID");
    if (!Array.isArray(decision.options) || decision.options.some((option) => !option || typeof option.id !== "string" || !option.id || typeof option.label !== "string")) throw new Error("DECISION_OPTIONS_INVALID");
    if (!Number.isInteger(decision.min) || !Number.isInteger(decision.max) || decision.min < 0 || decision.max < decision.min) throw new Error("DECISION_SELECTION_RANGE_INVALID");
    if (decision.max > decision.options.length) throw new Error("DECISION_SELECTION_RANGE_INVALID");
    if (typeof decision.allowCancel !== "boolean" || !decision.submissions || typeof decision.submissions !== "object" || Array.isArray(decision.submissions)) throw new Error("DECISION_STATE_INVALID");
    if (new Set(decision.options.map((option) => option.id)).size !== decision.options.length) throw new Error("DECISION_OPTION_DUPLICATE");
    const chooserSet = new Set(decision.chooserPlayerIds);
    const optionSet = new Set(decision.options.filter((option) => !option.disabled).map((option) => option.id));
    for (const [playerId, selections] of Object.entries(decision.submissions)) {
      if (!chooserSet.has(playerId) || !Array.isArray(selections)) throw new Error("DECISION_SUBMISSIONS_INVALID");
      if (new Set(selections).size !== selections.length || selections.length < decision.min || selections.length > decision.max || selections.some((selection) => !optionSet.has(selection))) {
        throw new Error("DECISION_SUBMISSIONS_INVALID");
      }
    }
    state.pendingDecision = structuredClone(decision);
  }

  resolve(
    state: GameState,
    input: { decisionId: string; actorId: string; selections: string[] },
  ): PendingDecision {
    const decision = state.pendingDecision;
    if (!decision || decision.decisionId !== input.decisionId) throw new Error("DECISION_NOT_FOUND");
    if (!input || !Array.isArray(input.selections)) throw new Error("DECISION_SELECTION_INVALID");
    if (!decision.chooserPlayerIds.includes(input.actorId)) throw new Error("DECISION_WRONG_PLAYER");
    if (Object.prototype.hasOwnProperty.call(decision.submissions, input.actorId)) throw new Error("DECISION_ALREADY_SUBMITTED");
    if (new Set(input.selections).size !== input.selections.length) throw new Error("DECISION_SELECTION_DUPLICATE");
    if (
      input.selections.length < decision.min ||
      input.selections.length > decision.max
    ) throw new Error("DECISION_SELECTION_COUNT");
    const allowed = new Set(decision.options.filter((option) => !option.disabled).map((option) => option.id));
    if (input.selections.some((selection) => !allowed.has(selection))) throw new Error("DECISION_OPTION_INVALID");
    decision.submissions[input.actorId] = [...input.selections];
    const allSubmitted = decision.chooserPlayerIds.every((playerId) => Object.prototype.hasOwnProperty.call(decision.submissions, playerId));
    if (allSubmitted) state.pendingDecision = null;
    return structuredClone(decision);
  }

  cancel(state: GameState, input: { decisionId: string; actorId: string }): PendingDecision {
    const decision = state.pendingDecision;
    if (!decision || decision.decisionId !== input.decisionId) throw new Error("DECISION_NOT_FOUND");
    if (!decision.chooserPlayerIds.includes(input.actorId)) throw new Error("DECISION_WRONG_PLAYER");
    if (!decision.allowCancel) throw new Error("DECISION_CANCEL_FORBIDDEN");
    state.pendingDecision = null;
    return structuredClone(decision);
  }
}
