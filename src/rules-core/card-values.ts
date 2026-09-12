import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { FDAuthoringFormula } from "../content/authoring/types.ts";
import type { CardDefinition } from "./content-types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Evaluate a printed card-face numeric formula from structured state only.
 * Display text is never inspected. Card-face formulas deliberately expose a
 * narrow metric set; selection/event dependent values belong to ability ASTs.
 */
export function resolveCardFaceFormula(
  value: FDAuthoringFormula,
  state: GameState,
  controller: PlayerState,
): number {
  if (Number.isInteger(value)) return Number(value);
  if (!isRecord(value)) throw new Error("CARD_FACE_FORMULA_INVALID");
  if (value.type === "constant" && Number.isInteger(value.value)) return Number(value.value);
  if (value.type === "metric") {
    switch (value.metric) {
      case "victory_points": return controller.victoryPoints;
      case "mana": return controller.mana;
      case "round_number": return state.round;
      case "movement_distance_this_round": return Number(controller.flags.movementDistanceThisRound ?? 0);
      case "hand_size": return controller.hand.length;
      case "deck_size": return controller.deck.length;
      case "discard_size": return controller.discard.length;
      case "controlled_attack_count": return controller.attack.length;
      case "player_flag_number": {
        if (typeof value.key !== "string" || !value.key) throw new Error("CARD_FACE_FORMULA_FLAG_KEY_REQUIRED");
        const result = Number(controller.flags[value.key] ?? 0);
        if (!Number.isFinite(result) || !Number.isInteger(result)) throw new Error("CARD_FACE_FORMULA_FLAG_VALUE_INVALID");
        return result;
      }
      default: throw new Error(`CARD_FACE_FORMULA_METRIC_UNSUPPORTED:${String(value.metric)}`);
    }
  }
  if (value.type === "formula" && typeof value.op === "string" && Array.isArray(value.args)) {
    const args = value.args.map((arg) => resolveCardFaceFormula(arg as FDAuthoringFormula, state, controller));
    let result: number;
    switch (value.op) {
      case "add": result = args.reduce((sum, arg) => sum + arg, 0); break;
      case "subtract":
        if (args.length !== 2) throw new Error("CARD_FACE_FORMULA_ARITY_INVALID");
        result = args[0] - args[1];
        break;
      case "multiply": result = args.reduce((product, arg) => product * arg, 1); break;
      case "floor_divide":
        if (args.length !== 2 || args[1] === 0) throw new Error("CARD_FACE_FORMULA_DIVISOR_INVALID");
        result = Math.floor(args[0] / args[1]);
        break;
      case "ceil_divide":
        if (args.length !== 2 || args[1] === 0) throw new Error("CARD_FACE_FORMULA_DIVISOR_INVALID");
        result = Math.ceil(args[0] / args[1]);
        break;
      case "min":
        if (args.length === 0) throw new Error("CARD_FACE_FORMULA_ARITY_INVALID");
        result = Math.min(...args);
        break;
      case "max":
        if (args.length === 0) throw new Error("CARD_FACE_FORMULA_ARITY_INVALID");
        result = Math.max(...args);
        break;
      case "abs":
        if (args.length !== 1) throw new Error("CARD_FACE_FORMULA_ARITY_INVALID");
        result = Math.abs(args[0]);
        break;
      default: throw new Error(`CARD_FACE_FORMULA_OPERATION_UNSUPPORTED:${value.op}`);
    }
    if (!Number.isFinite(result) || !Number.isInteger(result)) throw new Error("CARD_FACE_FORMULA_RESULT_INVALID");
    return result;
  }
  throw new Error("CARD_FACE_FORMULA_INVALID");
}

/** Printed base power before external rule modifiers. */
export function getPrintedCardBasePower(state: GameState, controller: PlayerState, definition: CardDefinition): number {
  return definition.basePowerFormula
    ? resolveCardFaceFormula(definition.basePowerFormula, state, controller)
    : Number(definition.basePower ?? 0);
}
