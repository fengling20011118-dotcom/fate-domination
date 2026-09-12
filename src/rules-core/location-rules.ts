import type { GameState } from "../domain/state/types.ts";
import { isOtherPlayerAbilityEffectIgnored } from "./ability-immunity.ts";

export type RuleLocationId = "workshop" | "mountain" | "city" | "scouting";

export interface PersistentLocationAdvantageRule {
  sourceId: string;
  playerId: string;
  locationId: "mountain" | "city";
  value: number;
  mode: "replace" | "add";
}

export interface UnoccupiedLocationAdvantageRule {
  sourceId: string;
  playerId: string;
  locationIds: Array<"mountain" | "city">;
}

export interface EffectiveLocationRule {
  sourceId: string;
  playerId: string;
  treatedAs: RuleLocationId;
  actualLocationIds?: RuleLocationId[];
  persistentAdvantageSourceId?: string;
  persistentAdvantageAtLeast?: number;
}

export interface SameLocationRestrictionRule {
  sourceId: string;
  controllerPlayerId: string;
  activeWhenControllerAtEffectiveLocation?: RuleLocationId;
  blockOpponentExit?: boolean;
  requireOpponentFaceDownStandardAttack?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sourceStillOwned(state: GameState, playerId: string, sourceId: string): boolean {
  const player = state.players[playerId];
  if (!player || player.eliminated) return false;
  return [...player.masterSkills, ...player.servantSkills, ...player.hand, ...player.attack]
    .some((instanceId) => {
      const card = state.cards[instanceId];
      return Boolean(card && card.ownerPlayerId === playerId && card.zone !== "removed"
        && (card.definitionId === sourceId || card.definitionId === `card.skill.${sourceId}`));
    });
}

function persistentRules(state: GameState): PersistentLocationAdvantageRule[] {
  const raw = state.modeState.persistentLocationAdvantages;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is PersistentLocationAdvantageRule => {
    if (!isRecord(item)) return false;
    return typeof item.sourceId === "string"
      && typeof item.playerId === "string"
      && (item.locationId === "mountain" || item.locationId === "city")
      && Number.isInteger(item.value) && Number(item.value) >= 0
      && (item.mode === "replace" || item.mode === "add");
  }).map((item) => ({ ...item }));
}

function unoccupiedRules(state: GameState): UnoccupiedLocationAdvantageRule[] {
  const raw = state.modeState.unoccupiedLocationAdvantages;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is UnoccupiedLocationAdvantageRule => {
    if (!isRecord(item) || typeof item.sourceId !== "string" || typeof item.playerId !== "string") return false;
    return Array.isArray(item.locationIds) && item.locationIds.length > 0
      && item.locationIds.every((id) => id === "mountain" || id === "city");
  }).map((item) => ({ ...item, locationIds: [...item.locationIds] }));
}

export function addUnoccupiedLocationAdvantageRule(state: GameState, rule: UnoccupiedLocationAdvantageRule): void {
  if (!state.players[rule.playerId] || !rule.sourceId || rule.locationIds.length === 0) throw new Error("UNOCCUPIED_LOCATION_ADVANTAGE_INVALID");
  const rules = unoccupiedRules(state).filter((item) => !(item.sourceId === rule.sourceId && item.playerId === rule.playerId));
  state.modeState = {
    ...state.modeState,
    unoccupiedLocationAdvantages: [...rules, { ...rule, locationIds: [...new Set(rule.locationIds)] }],
  };
}

/** Dynamic bonus from currently unclaimed battlefield terrain slots (+3 / +1). */
export function getUnoccupiedLocationAdvantageBonus(state: GameState, playerId: string, locationId: string | null): number {
  if (locationId !== "mountain" && locationId !== "city") return 0;
  const applies = unoccupiedRules(state).some((rule) => rule.playerId === playerId
    && rule.locationIds.includes(locationId)
    && sourceStillOwned(state, playerId, rule.sourceId));
  if (!applies) return 0;
  const records = state.board.outpostRecords[locationId] ?? [];
  return (records[0] == null ? 3 : 0) + (records[1] == null ? 1 : 0);
}

function effectiveLocationRules(state: GameState): EffectiveLocationRule[] {
  const raw = state.modeState.effectiveLocationRules;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is EffectiveLocationRule => {
    if (!isRecord(item)) return false;
    if (typeof item.sourceId !== "string" || typeof item.playerId !== "string") return false;
    if (!["workshop", "mountain", "city", "scouting"].includes(String(item.treatedAs))) return false;
    if (item.actualLocationIds !== undefined && (!Array.isArray(item.actualLocationIds)
      || item.actualLocationIds.some((id) => !["workshop", "mountain", "city", "scouting"].includes(String(id))))) return false;
    if (item.persistentAdvantageAtLeast !== undefined
      && (!Number.isInteger(item.persistentAdvantageAtLeast) || Number(item.persistentAdvantageAtLeast) < 0)) return false;
    return item.persistentAdvantageSourceId === undefined || typeof item.persistentAdvantageSourceId === "string";
  }).map((item) => ({ ...item, ...(item.actualLocationIds ? { actualLocationIds: [...item.actualLocationIds] } : {}) }));
}

function sameLocationRestrictions(state: GameState): SameLocationRestrictionRule[] {
  const raw = state.modeState.sameLocationRestrictions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is SameLocationRestrictionRule => {
    if (!isRecord(item)) return false;
    if (typeof item.sourceId !== "string" || typeof item.controllerPlayerId !== "string") return false;
    if (item.activeWhenControllerAtEffectiveLocation !== undefined
      && !["workshop", "mountain", "city", "scouting"].includes(String(item.activeWhenControllerAtEffectiveLocation))) return false;
    return true;
  }).map((item) => ({ ...item }));
}

export function getPersistentLocationAdvantage(
  state: GameState,
  playerId: string,
  locationId: string | null,
  sourceId?: string,
): number {
  if (locationId !== "mountain" && locationId !== "city") return 0;
  const rules = persistentRules(state).filter((rule) => rule.playerId === playerId
    && rule.locationId === locationId
    && (sourceId === undefined || rule.sourceId === sourceId));
  if (rules.length === 0) return 0;
  const replacements = rules.filter((rule) => rule.mode === "replace").map((rule) => rule.value);
  const replacement = replacements.length > 0 ? Math.max(...replacements) : 0;
  return replacement + rules.filter((rule) => rule.mode === "add").reduce((sum, rule) => sum + rule.value, 0);
}

export function resolveLocationAdvantage(
  state: GameState,
  playerId: string,
  locationId: string | null,
  base: number,
): number {
  if (!Number.isFinite(base)) throw new Error("LOCATION_ADVANTAGE_BASE_INVALID");
  if (locationId !== "mountain" && locationId !== "city") return base;
  const rules = persistentRules(state).filter((rule) => rule.playerId === playerId && rule.locationId === locationId);
  if (rules.length === 0) return base;
  const replacements = rules.filter((rule) => rule.mode === "replace").map((rule) => rule.value);
  let value = replacements.length > 0 ? Math.max(...replacements) : base;
  value += rules.filter((rule) => rule.mode === "add").reduce((sum, rule) => sum + rule.value, 0);
  return value;
}

/** Persist one location-specific terrain rule and immediately sync it if the player is there. */
export function setPersistentLocationAdvantage(
  state: GameState,
  rule: PersistentLocationAdvantageRule,
): number {
  if (!state.players[rule.playerId] || !Number.isInteger(rule.value) || rule.value < 0) throw new Error("PERSISTENT_LOCATION_ADVANTAGE_INVALID");
  const existing = persistentRules(state).filter((item) => !(item.sourceId === rule.sourceId
    && item.playerId === rule.playerId && item.locationId === rule.locationId));
  state.modeState = { ...state.modeState, persistentLocationAdvantages: [...existing, { ...rule }] };
  syncPersistentLocationAdvantage(state, rule.playerId);
  return rule.value;
}

export function incrementPersistentLocationAdvantage(
  state: GameState,
  options: {
    sourceId: string;
    playerId: string;
    locationId: "mountain" | "city";
    amount?: number;
    max?: number;
    mode?: "replace" | "add";
  },
): number {
  const amount = options.amount ?? 1;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(amount) || amount < 0 || !Number.isInteger(max) || max < 0) throw new Error("PERSISTENT_LOCATION_ADVANTAGE_INCREMENT_INVALID");
  const existing = persistentRules(state).find((rule) => rule.sourceId === options.sourceId
    && rule.playerId === options.playerId && rule.locationId === options.locationId);
  const next = Math.min(max, Number(existing?.value ?? 0) + amount);
  setPersistentLocationAdvantage(state, {
    sourceId: options.sourceId,
    playerId: options.playerId,
    locationId: options.locationId,
    value: next,
    mode: options.mode ?? existing?.mode ?? "replace",
  });
  return next;
}

/** Re-apply permanent location terrain after a deploy/move transition. */
export function syncPersistentLocationAdvantage(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  if (!player) return 0;
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return 0;
  const base = player.flags.deploymentBonusActive === true && player.flags.deploymentLocationId === locationId
    ? Number(player.flags.deploymentBonus ?? 0)
    : 0;
  const resolved = resolveLocationAdvantage(state, playerId, locationId, base);
  if (resolved > 0) {
    player.flags.deploymentLocationId = locationId;
    player.flags.deploymentBonus = resolved;
    player.flags.deploymentBonusActive = true;
  }
  return resolved;
}

export function addEffectiveLocationRule(state: GameState, rule: EffectiveLocationRule): void {
  if (!state.players[rule.playerId] || !rule.sourceId) throw new Error("EFFECTIVE_LOCATION_RULE_INVALID");
  const rules = effectiveLocationRules(state).filter((item) => !(item.sourceId === rule.sourceId
    && item.playerId === rule.playerId && item.treatedAs === rule.treatedAs));
  state.modeState = {
    ...state.modeState,
    effectiveLocationRules: [...rules, { ...rule, ...(rule.actualLocationIds ? { actualLocationIds: [...rule.actualLocationIds] } : {}) }],
  };
}

export function isPlayerAtEffectiveLocation(
  state: GameState,
  playerId: string,
  locationId: RuleLocationId,
): boolean {
  const player = state.players[playerId];
  if (!player || player.eliminated || !player.locationId) return false;
  if (player.locationId === locationId) return true;
  return effectiveLocationRules(state).some((rule) => {
    if (rule.playerId !== playerId || rule.treatedAs !== locationId || !sourceStillOwned(state, playerId, rule.sourceId)) return false;
    if (rule.actualLocationIds?.length && !rule.actualLocationIds.includes(player.locationId as RuleLocationId)) return false;
    if (rule.persistentAdvantageAtLeast !== undefined) {
      const advantage = getPersistentLocationAdvantage(state, playerId, player.locationId, rule.persistentAdvantageSourceId);
      if (advantage < rule.persistentAdvantageAtLeast) return false;
    }
    return true;
  });
}

export function addSameLocationRestrictionRule(state: GameState, rule: SameLocationRestrictionRule): void {
  if (!state.players[rule.controllerPlayerId] || !rule.sourceId) throw new Error("SAME_LOCATION_RESTRICTION_INVALID");
  const rules = sameLocationRestrictions(state).filter((item) => !(item.sourceId === rule.sourceId
    && item.controllerPlayerId === rule.controllerPlayerId));
  state.modeState = { ...state.modeState, sameLocationRestrictions: [...rules, { ...rule }] };
}

function restrictionAppliesToTarget(state: GameState, rule: SameLocationRestrictionRule, targetPlayerId: string): boolean {
  const controller = state.players[rule.controllerPlayerId];
  const target = state.players[targetPlayerId];
  if (!controller || !target || controller.eliminated || target.eliminated || controller.id === target.id) return false;
  if (!controller.locationId || controller.locationId !== target.locationId) return false;
  if (!sourceStillOwned(state, controller.id, rule.sourceId)) return false;
  if (isOtherPlayerAbilityEffectIgnored(state, controller.id, target.id)) return false;
  if (rule.activeWhenControllerAtEffectiveLocation
    && !isPlayerAtEffectiveLocation(state, controller.id, rule.activeWhenControllerAtEffectiveLocation)) return false;
  return true;
}

export function isPlayerExitBlockedBySameLocationRule(state: GameState, playerId: string, targetLocationId: string): boolean {
  const player = state.players[playerId];
  if (!player?.locationId || player.locationId === targetLocationId) return false;
  return sameLocationRestrictions(state).some((rule) => rule.blockOpponentExit === true && restrictionAppliesToTarget(state, rule, playerId));
}

export function isFaceDownStandardAttackRequiredBySameLocationRule(state: GameState, playerId: string): boolean {
  return sameLocationRestrictions(state).some((rule) => rule.requireOpponentFaceDownStandardAttack === true
    && restrictionAppliesToTarget(state, rule, playerId));
}
