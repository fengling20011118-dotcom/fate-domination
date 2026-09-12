import type { GameState } from "../domain/state/types.ts";

export type BattlefieldLocationId = "workshop" | "mountain" | "city";

export interface DynamicBattlefieldRule {
  sourceId: string;
  controllerPlayerId: string;
  locationId: BattlefieldLocationId;
  objectives: "none";
  competitionReward: "current-situation-mana";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sourceStillOwned(state: GameState, rule: DynamicBattlefieldRule): boolean {
  const controller = state.players[rule.controllerPlayerId];
  if (!controller || controller.eliminated) return false;
  return Object.values(state.cards).some((card) => card.ownerPlayerId === controller.id
    && card.zone !== "removed" && card.zone !== "discard"
    && (card.definitionId === rule.sourceId || card.definitionId === `card.skill.${rule.sourceId}`));
}

export function getDynamicBattlefieldRules(state: GameState): DynamicBattlefieldRule[] {
  const raw = state.modeState.dynamicBattlefieldRules;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is DynamicBattlefieldRule => {
    if (!isRecord(item)) return false;
    return typeof item.sourceId === "string"
      && typeof item.controllerPlayerId === "string"
      && (item.locationId === "workshop" || item.locationId === "mountain" || item.locationId === "city")
      && item.objectives === "none"
      && item.competitionReward === "current-situation-mana";
  }).filter((rule) => sourceStillOwned(state, rule));
}

export function installDynamicBattlefieldRule(state: GameState, rule: DynamicBattlefieldRule): void {
  if (!state.players[rule.controllerPlayerId] || !rule.sourceId) throw new Error("DYNAMIC_BATTLEFIELD_RULE_INVALID");
  const existing = Array.isArray(state.modeState.dynamicBattlefieldRules)
    ? (state.modeState.dynamicBattlefieldRules as unknown[]).filter((item) => !(isRecord(item)
      && item.sourceId === rule.sourceId && item.controllerPlayerId === rule.controllerPlayerId && item.locationId === rule.locationId))
    : [];
  state.modeState = { ...state.modeState, dynamicBattlefieldRules: [...existing, structuredClone(rule)] };
}

export function isBattlefieldLocation(state: GameState, locationId: string): locationId is BattlefieldLocationId {
  if (locationId === "mountain" || locationId === "city") return true;
  return getDynamicBattlefieldRules(state).some((rule) => rule.locationId === locationId);
}

export function getBattlefieldLocationIds(state: GameState): BattlefieldLocationId[] {
  const result: BattlefieldLocationId[] = ["mountain", "city"];
  for (const rule of getDynamicBattlefieldRules(state)) if (!result.includes(rule.locationId)) result.push(rule.locationId);
  return result;
}

export function getDynamicBattlefieldCompetitionReward(state: GameState, locationId: BattlefieldLocationId): number | undefined {
  const rules = getDynamicBattlefieldRules(state).filter((rule) => rule.locationId === locationId);
  if (rules.length === 0) return undefined;
  if (rules.some((rule) => rule.competitionReward !== rules[0].competitionReward)) throw new Error("DYNAMIC_BATTLEFIELD_REWARD_CONFLICT");
  if (rules[0].competitionReward === "current-situation-mana") {
    const mana = Number(state.modeState.currentSituationMana ?? 0);
    if (!Number.isInteger(mana) || mana < 0) throw new Error("CURRENT_SITUATION_MANA_INVALID");
    return mana;
  }
  return undefined;
}
