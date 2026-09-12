import type { CardDefinition } from "./content-types.ts";
import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { calculateTerrainAdvantage } from "./combat-power.ts";
import { movePlayerCard } from "./decks.ts";
import { gainCustomResource, gainMana, getCustomResource, spendCustomResource } from "./resources.ts";

export const SHIROU_MEAL_PROCUREMENT_ID = "master.shirou-meal.skill.s1";
export const SHIROU_MEAL_MENU_ID = "master.shirou-meal.skill.s2";
export const SHIROU_MEAL_ASCENSION_ID = "master.shirou-meal.skill.ascension";

export const SHIROU_MEAL_PROCUREMENT_HANDLER = "core.shirou-meal-procurement";
export const SHIROU_MEAL_MENU_HANDLER = "core.shirou-meal-menu";
export const SHIROU_MEAL_ASCENSION_HANDLER = "core.shirou-meal-ascension";

export const SHIROU_MEAL_FOOD = Object.freeze({
  meat: "food:meat",
  vegetable: "food:vegetable",
  fish: "food:fish",
} as const);

const FOOD_IDS = Object.freeze(Object.values(SHIROU_MEAL_FOOD));
const FOOD_BY_ATTRIBUTE = Object.freeze({
  力量: SHIROU_MEAL_FOOD.meat,
  迅捷: SHIROU_MEAL_FOOD.vegetable,
  魔术: SHIROU_MEAL_FOOD.fish,
} as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function eventPayload(payload: unknown): { eventType?: string; event: Record<string, unknown> } {
  const data = isRecord(payload) ? payload : {};
  return {
    eventType: typeof data.eventType === "string" ? data.eventType : undefined,
    event: isRecord(data.event) ? data.event : {},
  };
}

function installFoodPowerRules(player: PlayerState): void {
  const rules = player.resourcePowerRules ??= [];
  const desired = [
    { sourceId: SHIROU_MEAL_ASCENSION_ID, resourceId: SHIROU_MEAL_FOOD.meat, perUnit: 1, basicOnly: true, attributesAny: ["力量" as const] },
    { sourceId: SHIROU_MEAL_ASCENSION_ID, resourceId: SHIROU_MEAL_FOOD.vegetable, perUnit: 1, basicOnly: true, attributesAny: ["迅捷" as const] },
    { sourceId: SHIROU_MEAL_ASCENSION_ID, resourceId: SHIROU_MEAL_FOOD.fish, perUnit: 1, basicOnly: true, attributesAny: ["魔术" as const] },
  ];
  for (const rule of desired) {
    if (!rules.some((candidate) => candidate.sourceId === rule.sourceId && candidate.resourceId === rule.resourceId)) rules.push(rule);
  }
}

function mentionedAttributes(definitions: Record<string, CardDefinition>, definitionId: string): string[] {
  const definition = definitions[definitionId] as (CardDefinition & { mentionedAttributes?: string[] }) | undefined;
  return Array.isArray(definition?.mentionedAttributes)
    ? [...new Set(definition.mentionedAttributes.filter((attribute) => attribute === "力量" || attribute === "迅捷" || attribute === "魔术"))]
    : [];
}

function procurementFoodIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  const definitionIds = [...(state.board.currentEvents[locationId] ?? []), ...(state.board.activeSituations ?? [])];
  const attributes = new Set<string>();
  for (const definitionId of definitionIds) for (const attribute of mentionedAttributes(definitions, definitionId)) attributes.add(attribute);
  return Object.entries(FOOD_BY_ATTRIBUTE)
    .filter(([attribute]) => attributes.has(attribute))
    .map(([, foodId]) => foodId);
}

function foodRoundFlag(resourceId: string): string {
  return `shirouMealFoodGrantedRound:${resourceId}`;
}

export const useShirouMealProcurement: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("SHIROU_MEAL_DEFINITIONS_REQUIRED");
  const { eventType } = eventPayload(payload);
  if (eventType === "game.started") {
    installFoodPowerRules(player);
    return { installedResourcePowerRules: true };
  }
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== "food-procurement" || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("SHIROU_MEAL_PROCUREMENT_WINDOW_INVALID");
  }
  if (calculateTerrainAdvantage(state, player, definitions) <= 0) throw new Error("SHIROU_MEAL_TERRAIN_REQUIRED");
  installFoodPowerRules(player);
  const gained: string[] = [];
  for (const resourceId of procurementFoodIds(state, player, definitions)) {
    const flag = foodRoundFlag(resourceId);
    if (Number(player.flags[flag] ?? -1) === state.round) continue;
    gainCustomResource(player, resourceId, 1);
    player.flags[flag] = state.round;
    gained.push(resourceId);
  }
  return { gained };
};

export const isShirouMealProcurementLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== "food-procurement" || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  return calculateTerrainAdvantage(state, player, definitions) > 0
    && procurementFoodIds(state, player, definitions).some((resourceId) => Number(player.flags[foodRoundFlag(resourceId)] ?? -1) !== state.round);
};

function selectedFoodIds(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.foodResourceIds)) return [];
  return payload.foodResourceIds.filter((resourceId): resourceId is string => typeof resourceId === "string");
}

function validateFoodPayment(player: PlayerState, resourceIds: readonly string[]): void {
  if (resourceIds.length !== 3 || resourceIds.some((resourceId) => !FOOD_IDS.includes(resourceId as typeof FOOD_IDS[number]))) {
    throw new Error("SHIROU_MEAL_FOOD_SELECTION_INVALID");
  }
  const needed = new Map<string, number>();
  for (const resourceId of resourceIds) needed.set(resourceId, (needed.get(resourceId) ?? 0) + 1);
  for (const [resourceId, count] of needed) if (getCustomResource(player, resourceId) < count) throw new Error("SHIROU_MEAL_FOOD_REQUIRED");
}

export const useShirouMealMenu: SkillHandler = ({ state, player, payload }) => {
  const { eventType, event } = eventPayload(payload);
  if (eventType === "player.deck-shuffled") {
    if (event.playerId !== player.id || event.reason !== "automatic-recycle") return;
    const protectedCount = Number(player.flags.shirouMealGluttonProtection ?? 0);
    if (!Number.isInteger(protectedCount) || protectedCount < 0) throw new Error("SHIROU_MEAL_PROTECTION_INVALID");
    if (protectedCount > 0) {
      player.flags.shirouMealGluttonProtection = protectedCount - 1;
      return { protected: true };
    }
    player.victoryPoints -= 3;
    return { protected: false, victoryPointLoss: 3 };
  }
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== "prepare-meal" || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("SHIROU_MEAL_MENU_WINDOW_INVALID");
  }
  const resourceIds = selectedFoodIds(payload);
  validateFoodPayment(player, resourceIds);
  const counts = new Map<string, number>();
  for (const resourceId of resourceIds) counts.set(resourceId, (counts.get(resourceId) ?? 0) + 1);
  for (const [resourceId, count] of counts) spendCustomResource(player, resourceId, count);
  const protectedCount = Number(player.flags.shirouMealGluttonProtection ?? 0);
  if (!Number.isInteger(protectedCount) || protectedCount < 0) throw new Error("SHIROU_MEAL_PROTECTION_INVALID");
  player.flags.shirouMealGluttonProtection = protectedCount + 1;
  const same = counts.size === 1;
  const different = counts.size === 3;
  if (same) player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 6;
  if (different) gainMana(player, 4);
  return { resourceIds, protectedShuffleCount: protectedCount + 1, powerBonus: same ? 6 : 0, manaGain: different ? 4 : 0 };
};

export const isShirouMealMenuLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  if (!player || ability?.id !== "prepare-meal" || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  return FOOD_IDS.reduce((sum, resourceId) => sum + getCustomResource(player, resourceId), 0) >= 3;
};

export const useShirouMealAscension: SkillHandler = ({ state, player, payload }) => {
  const { eventType, event } = eventPayload(payload);
  if (eventType !== "round.ending") throw new Error("SHIROU_MEAL_ASCENSION_TRIGGER_INVALID");
  if (event.round !== undefined && Number(event.round) !== state.round) return;
  installFoodPowerRules(player);
  const instanceId = player.deck[0];
  if (!instanceId) return { discardedInstanceId: null };
  movePlayerCard(state, player.id, instanceId, "discard");
  return { discardedInstanceId: instanceId };
};
