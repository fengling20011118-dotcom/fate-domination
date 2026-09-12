import type { GameState } from "../domain/state/types.ts";

export interface AttackPrintedBaseCeilingRule {
  sourceId: string;
  controllerPlayerId: string;
  locationId: "mountain" | "city";
  round: number;
  targetPlayerIds: string[];
  /** Existing attacks keep their current higher value; the rule never reduces power when applied. */
  grandfatheredCeilings: Record<string, number>;
}

const KEY = "attackPrintedBaseCeilingRules";

function rules(state: GameState): AttackPrintedBaseCeilingRule[] {
  const value = state.modeState[KEY];
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is AttackPrintedBaseCeilingRule => Boolean(candidate)
    && typeof candidate === "object"
    && typeof (candidate as AttackPrintedBaseCeilingRule).sourceId === "string");
}

export function addAttackPrintedBaseCeilingRule(state: GameState, rule: AttackPrintedBaseCeilingRule): void {
  if (!rule.sourceId || !rule.controllerPlayerId || !Number.isInteger(rule.round)) throw new Error("ATTACK_POWER_CEILING_RULE_INVALID");
  if (rule.locationId !== "mountain" && rule.locationId !== "city") throw new Error("ATTACK_POWER_CEILING_LOCATION_INVALID");
  state.modeState[KEY] = [...rules(state).filter((candidate) => candidate.sourceId !== rule.sourceId), structuredClone(rule)];
}

/** Return the tightest active ceiling for one attack, if any. */
export function getAttackPrintedBaseCeiling(
  state: GameState,
  playerId: string,
  instanceId: string,
  locationId: string | null | undefined,
  printedBasePower: number,
): number | undefined {
  if (locationId !== "mountain" && locationId !== "city") return undefined;
  const active = rules(state).filter((rule) => rule.round === state.round
    && rule.locationId === locationId
    && rule.targetPlayerIds.includes(playerId)
    && !state.players[rule.controllerPlayerId]?.eliminated
    && state.players[rule.controllerPlayerId]?.locationId === locationId);
  if (active.length === 0) return undefined;
  return Math.min(...active.map((rule) => Math.max(
    printedBasePower,
    Number(rule.grandfatheredCeilings[instanceId] ?? printedBasePower),
  )));
}
