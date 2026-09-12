import type { GameState, PlayerState } from "../domain/state/types.ts";
import { movePlayerByEffect } from "./board.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { type CardAttribute, type CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";
import { movePlayerCard } from "./decks.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const SHISHIGOU_CRAFTER_ID = "master.shishigou.skill.s1";
export const SHISHIGOU_RITES_I_ID = "master.shishigou.skill.s2";
export const SHISHIGOU_RITES_II_ID = "master.shishigou.skill.s3";
export const SHISHIGOU_MASTERY_ID = "master.shishigou.skill.ascension";
export const SHISHIGOU_HANDLER = "core.shishigou-necromancy";

export const SHISHIGOU_STORE_ABILITY = "corpse-crafter-store";
export const SHISHIGOU_USE_ABILITY = "corpse-crafter-use";
export const SHISHIGOU_MASTERY_ABILITY = "macabre-mastery";

const CRAFTED_MARKER = "shishigou-corpse-crafted";
const CONSUMED_MARKER = "shishigou-corpse-consumed";
const MASTERY_MARKER_PREFIX = "shishigou-macabre-used:";
const RITE_ATTRIBUTES: readonly CardAttribute[] = ["力量", "迅捷", "魔术", "特殊"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasMarker(card: GameState["cards"][string], marker: string): boolean {
  return card.modifiers?.includes(marker) === true;
}

function addMarker(card: GameState["cards"][string], marker: string): void {
  if (!hasMarker(card, marker)) card.modifiers = [...(card.modifiers ?? []), marker];
}

function craftedCorpseIds(state: GameState, player: PlayerState, unusedOnly = true): string[] {
  return Object.values(state.cards)
    .filter((card) => card.ownerPlayerId === player.id && card.zone === "removed" && hasMarker(card, CRAFTED_MARKER)
      && (!unusedOnly || !hasMarker(card, CONSUMED_MARKER)))
    .map((card) => card.instanceId);
}

function faceDownAttackIds(state: GameState, player: PlayerState): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.controllerPlayerId === player.id && card.zone === "attack" && card.face === "down");
  });
}

function riteAttributesForCard(state: GameState, player: PlayerState, instanceId: string, definitions: Record<string, CardDefinition>): CardAttribute[] {
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !definition) return [];
  const attrs = getCardInstanceAttributes(card, definition, state, definitions);
  return RITE_ATTRIBUTES.filter((attribute) => attrs.includes(attribute));
}

function activeBasicAttackIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.basic === true && card.controllerPlayerId === player.id && card.active && card.face === "up");
  });
}

function hydraPoisonTargets(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || card.controllerPlayerId !== player.id || !card.active || card.face !== "up") return false;
    const attrs = getCardInstanceAttributes(card, definition, state, definitions);
    return attrs.includes("力量") || attrs.includes("迅捷");
  });
}

function emitPlayedCard(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  paidMana: number,
  definitions: Record<string, CardDefinition>,
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
): void {
  const card = state.cards[instanceId];
  const definition = definitions[card.definitionId];
  const attributes = getCardInstanceAttributes(card, definition, state, definitions);
  emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana, attributes, method: "shishigou-necromancy" });
  emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, attributes, method: "shishigou-necromancy" });
}

function applyRite(
  context: Parameters<SkillHandler>[0],
  attribute: CardAttribute,
  data: Record<string, unknown>,
): unknown {
  const { state, player, skill, definitions, emitEvent } = context;
  if (!definitions) throw new Error("SHISHIGOU_DEFINITIONS_REQUIRED");
  if (attribute === "力量") {
    const targetLocationId = typeof data.targetLocationId === "string" ? data.targetLocationId : undefined;
    let movement;
    if (targetLocationId && targetLocationId !== player.locationId) {
      if (targetLocationId !== "mountain" && targetLocationId !== "city") throw new Error("SHISHIGOU_GRENADE_LOCATION_INVALID");
      movement = movePlayerByEffect(state, player.id, targetLocationId, definitions);
      emitEvent?.("player.moved", { playerId: player.id, ...movement, method: "effect", sourceId: skill.id });
    }
    const locationId = player.locationId;
    if (locationId !== "mountain" && locationId !== "city") throw new Error("SHISHIGOU_GRENADE_BATTLEFIELD_REQUIRED");
    player.flags.roundTerrainAdvantageBonusRound = state.round;
    player.flags.roundTerrainAdvantageBonusLocationId = locationId;
    player.flags.roundTerrainAdvantageBonus = Number(player.flags.roundTerrainAdvantageBonus ?? 0) + 2;
    return { rite: "strength", movement, terrainGain: 2, locationId };
  }
  if (attribute === "迅捷") {
    const instanceId = player.deck[0];
    if (!instanceId) throw new Error("SHISHIGOU_BULLETS_DECK_EMPTY");
    const result = addCardToAttack(state, player.id, instanceId, definitions, {
      payCost: true,
      allowedSourceZones: ["deck"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
    });
    emitPlayedCard(state, player, instanceId, result.paidMana, definitions, emitEvent);
    return { rite: "agility", instanceId, paidMana: result.paidMana };
  }
  if (attribute === "魔术") {
    const existing = player.flags.deploymentAdvantageMultiplierRound === state.round
      ? Number(player.flags.deploymentAdvantageMultiplier ?? 1)
      : 1;
    if (!Number.isFinite(existing) || existing < 0) throw new Error("SHISHIGOU_CAMERA_MULTIPLIER_INVALID");
    player.flags.deploymentAdvantageMultiplierRound = state.round;
    player.flags.deploymentAdvantageMultiplier = existing * 2;
    return { rite: "magic", multiplier: player.flags.deploymentAdvantageMultiplier };
  }
  if (attribute === "特殊") {
    const targetInstanceId = typeof data.targetInstanceId === "string" ? data.targetInstanceId : undefined;
    if (!targetInstanceId || !hydraPoisonTargets(state, player, definitions).includes(targetInstanceId)) throw new Error("SHISHIGOU_HYDRA_TARGET_INVALID");
    state.activeRuleModifiers.push({
      id: `${skill.id}:hydra:${state.round}:${targetInstanceId}:${state.activeRuleModifiers.length}`,
      sourceId: skill.id,
      controllerPlayerId: player.id,
      operation: "multiply",
      rule: "card_base_power",
      scope: { subject: "controller", cards: { instanceIds: [targetInstanceId] } },
      value: 2,
      duration: "round",
      createdRound: state.round,
    });
    return { rite: "special", targetInstanceId, basePowerMultiplier: 2 };
  }
  throw new Error("SHISHIGOU_RITE_ATTRIBUTE_INVALID");
}

export const useShishigouNecromancy: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions } = context;
  if (!definitions) throw new Error("SHISHIGOU_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;

  if (skill.id === SHISHIGOU_CRAFTER_ID && abilityId === SHISHIGOU_STORE_ABILITY) {
    if (state.phase !== "combat" || state.activePlayerId !== player.id || player.locationId !== "workshop") throw new Error("SHISHIGOU_STORE_WINDOW_INVALID");
    const targetInstanceId = typeof data.targetInstanceId === "string" ? data.targetInstanceId : undefined;
    if (!targetInstanceId || !faceDownAttackIds(state, player).includes(targetInstanceId)) throw new Error("SHISHIGOU_STORE_TARGET_INVALID");
    const card = state.cards[targetInstanceId];
    movePlayerCard(state, player.id, targetInstanceId, "removed");
    card.face = "down";
    card.active = false;
    addMarker(card, CRAFTED_MARKER);
    return { storedInstanceId: targetInstanceId };
  }

  if (skill.id === SHISHIGOU_CRAFTER_ID && abilityId === SHISHIGOU_USE_ABILITY) {
    if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("SHISHIGOU_USE_WINDOW_INVALID");
    const corpseInstanceId = typeof data.corpseInstanceId === "string" ? data.corpseInstanceId : undefined;
    if (!corpseInstanceId || !craftedCorpseIds(state, player).includes(corpseInstanceId)) throw new Error("SHISHIGOU_CORPSE_TARGET_INVALID");
    const card = state.cards[corpseInstanceId];
    const available = riteAttributesForCard(state, player, corpseInstanceId, definitions);
    const requested = typeof data.riteAttribute === "string" ? data.riteAttribute as CardAttribute : undefined;
    const attribute = requested ?? (available.length === 1 ? available[0] : undefined);
    if (!attribute || !available.includes(attribute)) throw new Error("SHISHIGOU_RITE_ATTRIBUTE_REQUIRED");
    card.face = "up";
    addMarker(card, CONSUMED_MARKER);
    return { corpseInstanceId, attribute, result: applyRite(context, attribute, data) };
  }

  if (skill.id === SHISHIGOU_MASTERY_ID && abilityId === SHISHIGOU_MASTERY_ABILITY) {
    if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("SHISHIGOU_MASTERY_WINDOW_INVALID");
    const sourceInstanceId = typeof data.sourceInstanceId === "string" ? data.sourceInstanceId : undefined;
    if (!sourceInstanceId || !activeBasicAttackIds(state, player, definitions).includes(sourceInstanceId)) throw new Error("SHISHIGOU_MASTERY_SOURCE_INVALID");
    const source = state.cards[sourceInstanceId];
    const marker = `${MASTERY_MARKER_PREFIX}${state.round}`;
    if (hasMarker(source, marker)) throw new Error("SHISHIGOU_MASTERY_SOURCE_ALREADY_USED");
    const available = riteAttributesForCard(state, player, sourceInstanceId, definitions);
    const requested = typeof data.riteAttribute === "string" ? data.riteAttribute as CardAttribute : undefined;
    const attribute = requested ?? (available.length === 1 ? available[0] : undefined);
    if (!attribute || !available.includes(attribute)) throw new Error("SHISHIGOU_RITE_ATTRIBUTE_REQUIRED");
    payManaCost(state, player, 3, definitions, "SHISHIGOU_MASTERY_MANA_REQUIRED");
    player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + 3;
    addMarker(source, marker);
    return { sourceInstanceId, attribute, result: applyRite(context, attribute, data) };
  }

  throw new Error("SHISHIGOU_ABILITY_INVALID");
};

export const isShishigouNecromancyLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId) return false;
  if (skill.id === SHISHIGOU_CRAFTER_ID && ability?.id === SHISHIGOU_STORE_ABILITY) {
    return state.phase === "combat" && player.locationId === "workshop" && faceDownAttackIds(state, player).length > 0;
  }
  if (skill.id === SHISHIGOU_CRAFTER_ID && ability?.id === SHISHIGOU_USE_ABILITY) {
    return state.phase === "action" && craftedCorpseIds(state, player).length > 0;
  }
  if (skill.id === SHISHIGOU_MASTERY_ID && ability?.id === SHISHIGOU_MASTERY_ABILITY) {
    return state.phase === "action" && player.mana >= 3 && activeBasicAttackIds(state, player, definitions)
      .some((instanceId) => !hasMarker(state.cards[instanceId], `${MASTERY_MARKER_PREFIX}${state.round}`));
  }
  return false;
};
