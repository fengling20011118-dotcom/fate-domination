import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { forbidCardAttributeAbilityActivationAtLocation } from "./ability-activation-restrictions.ts";
import { payManaCost } from "./costs.ts";
import type { CardDefinition } from "./content-types.ts";
import { createDerivedCardInstance } from "./decks.ts";
import { gainMana } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const CAULES_FORVEDGE_BIOELECTROMANCER_ID = "master.caules.skill.s1";
export const CAULES_FORVEDGE_BATTERY_ID = "master.caules.skill.s2";
export const CAULES_FORVEDGE_CRAFTED_TREE_ID = "master.caules.skill.s3";
export const CAULES_FORVEDGE_ASCENSION_ID = "master.caules.skill.ascension";

export const CAULES_FORVEDGE_BIOELECTROMANCER_HANDLER = "core.caules-forvedge-bioelectromancer";
export const CAULES_FORVEDGE_BATTERY_HANDLER = "core.caules-forvedge-primeval-battery";
export const CAULES_FORVEDGE_CRAFTED_TREE_HANDLER = "core.caules-forvedge-crafted-tree";
export const CAULES_FORVEDGE_ASCENSION_HANDLER = "core.caules-forvedge-enhanced-circuits";

export const CAULES_FORVEDGE_RECHARGE_ABILITY = "recharge";
export const CAULES_FORVEDGE_OVERHEAL_ABILITY = "overheal";
export const CAULES_FORVEDGE_OVERLOAD_ABILITY = "overload";

export type CraftedTreeVariant = "strength" | "agility" | "magic" | "special" | "typeless";

const VARIANTS: ReadonlyArray<{ id: CraftedTreeVariant; attribute: string }> = Object.freeze([
  { id: "strength", attribute: "力量" },
  { id: "agility", attribute: "迅捷" },
  { id: "magic", attribute: "魔术" },
  { id: "special", attribute: "特殊" },
  { id: "typeless", attribute: "无属性" },
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cardMatchesSkill(instance: CardInstance | undefined, skillId: string, definitions: Record<string, CardDefinition>): boolean {
  if (!instance) return false;
  const definition = definitions[instance.definitionId];
  return instance.definitionId === skillId || definition?.linkedSkillId === skillId;
}

function variantForId(id: unknown): { id: CraftedTreeVariant; attribute: string } | undefined {
  return VARIANTS.find((candidate) => candidate.id === id);
}

function variantForInstance(instance: CardInstance | undefined): { id: CraftedTreeVariant; attribute: string } | undefined {
  return VARIANTS.find((candidate) => candidate.attribute === instance?.declaredAttribute);
}

function ownedCraftedTrees(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): CardInstance[] {
  return Object.values(state.cards).filter((instance) => instance.ownerPlayerId === player.id
    && cardMatchesSkill(instance, CAULES_FORVEDGE_CRAFTED_TREE_ID, definitions));
}

function existingVariant(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  variant: CraftedTreeVariant,
): CardInstance | undefined {
  return ownedCraftedTrees(state, player, definitions).find((instance) => variantForInstance(instance)?.id === variant);
}

function createCraftedTree(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  variant: CraftedTreeVariant,
  sourceId: string,
  hidden: boolean,
): CardInstance {
  if (!definitions[CAULES_FORVEDGE_CRAFTED_TREE_ID] && !definitions[`card.skill.${CAULES_FORVEDGE_CRAFTED_TREE_ID}`]) {
    throw new Error("CAULES_CRAFTED_TREE_DEFINITION_MISSING");
  }
  if (existingVariant(state, player, definitions, variant)) throw new Error("CAULES_CRAFTED_TREE_VARIANT_ALREADY_CREATED");
  const profile = variantForId(variant);
  if (!profile) throw new Error("CAULES_CRAFTED_TREE_VARIANT_INVALID");
  const instance = createDerivedCardInstance(state, player.id, {
    instanceId: `${player.id}:caules-crafted-tree:${variant}`,
    definitionId: CAULES_FORVEDGE_CRAFTED_TREE_ID,
    originMasterId: "master.caules",
    zone: "master-skills",
    face: hidden ? "down" : "up",
    active: false,
    sourceEffectId: sourceId,
    createdByPlayerId: player.id,
  });
  instance.declaredAttribute = profile.attribute;
  instance.declaredAttributeRevealed = !hidden;
  return instance;
}

function hasEnhancedCircuits(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  if (player.flags.caulesForvedgeEnhancedCircuits === true) return true;
  return [...player.masterSkills, ...player.attack].some((instanceId) => {
    const instance = state.cards[instanceId];
    return Boolean(instance && instance.zone !== "removed" && cardMatchesSkill(instance, CAULES_FORVEDGE_ASCENSION_ID, definitions));
  });
}

function installEnhancedCircuitMagicBonus(state: GameState, player: PlayerState): void {
  const id = `${CAULES_FORVEDGE_ASCENSION_ID}:battery-magic:${player.id}:${state.round}`;
  state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => modifier.id !== id);
  state.activeRuleModifiers.push({
    id,
    sourceId: CAULES_FORVEDGE_ASCENSION_ID,
    controllerPlayerId: player.id,
    operation: "add",
    rule: "card_power",
    scope: { subject: "controller", cards: { zones: ["attack"], attributesAny: ["魔术"] } },
    value: 2,
    duration: "round",
    createdRound: state.round,
  });
}

/** Bio-Electromancer is enforced by Primeval Battery legality; this handler is the source-owned rule anchor. */
export const useCaulesForvedgeBioElectromancer: SkillHandler = () => ({ active: true });

export const useCaulesForvedgePrimevalBattery: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("CAULES_BATTERY_CONTEXT_REQUIRED");
  const abilityId = typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  if (state.activePlayerId !== player.id || player.locationId !== "workshop") throw new Error("CAULES_BATTERY_WORKSHOP_REQUIRED");

  let result: Record<string, unknown>;
  if (abilityId === CAULES_FORVEDGE_RECHARGE_ABILITY) {
    if (state.phase !== "outpost") throw new Error("CAULES_BATTERY_WINDOW_INVALID");
    const x = Number(payload.x ?? payload.victoryPoints ?? 0);
    if (!Number.isInteger(x) || x < 0 || x > player.victoryPoints) throw new Error("CAULES_BATTERY_VICTORY_POINT_COST_INVALID");
    player.victoryPoints -= x;
    const gainedMana = gainMana(player, 2 * x + 1);
    result = { abilityId, victoryPointsSpent: x, gainedMana };
  } else if (abilityId === CAULES_FORVEDGE_OVERHEAL_ABILITY) {
    if (state.phase !== "outpost") throw new Error("CAULES_BATTERY_WINDOW_INVALID");
    payManaCost(state, player, 2, definitions, "CAULES_BATTERY_MANA_REQUIRED");
    player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + 2;
    player.flags.ignoreDefeatRound = state.round;
    result = { abilityId, paidMana: 2, ignoreDefeatRound: state.round };
  } else if (abilityId === CAULES_FORVEDGE_OVERLOAD_ABILITY) {
    if (state.phase !== "combat") throw new Error("CAULES_BATTERY_WINDOW_INVALID");
    if (hasEnhancedCircuits(state, player, definitions)) throw new Error("CAULES_BATTERY_OVERLOAD_DISABLED");
    const variant = variantForId(payload.variantId);
    if (!variant) throw new Error("CAULES_CRAFTED_TREE_VARIANT_REQUIRED");
    const instance = createCraftedTree(state, player, definitions, variant.id, CAULES_FORVEDGE_BATTERY_ID, true);
    result = { abilityId, instanceId: instance.instanceId, variantId: variant.id };
  } else {
    throw new Error("CAULES_BATTERY_ABILITY_INVALID");
  }

  if (hasEnhancedCircuits(state, player, definitions)) installEnhancedCircuitMagicBonus(state, player);
  return result;
};

export const isCaulesForvedgePrimevalBatteryLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId || player.locationId !== "workshop" || !ability) return false;
  if (ability.id === CAULES_FORVEDGE_RECHARGE_ABILITY) return state.phase === "outpost";
  if (ability.id === CAULES_FORVEDGE_OVERHEAL_ABILITY) return state.phase === "outpost" && player.mana >= 2;
  if (ability.id === CAULES_FORVEDGE_OVERLOAD_ABILITY) {
    return state.phase === "combat" && !hasEnhancedCircuits(state, player, definitions)
      && VARIANTS.some((variant) => !existingVariant(state, player, definitions, variant.id));
  }
  return false;
};

/** A played Crafted Tree installs a generic source-bound attribute activation lock. */
export const useCaulesForvedgeCraftedTree: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("CAULES_CRAFTED_TREE_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType !== "card.played" && eventType !== "card.entered-attack") return;
  const event = isRecord(payload.event) ? payload.event : {};
  if (event.playerId !== player.id && event.ownerPlayerId !== player.id) return;
  const instanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
  const instance = instanceId ? state.cards[instanceId] : undefined;
  if (!instance || !cardMatchesSkill(instance, CAULES_FORVEDGE_CRAFTED_TREE_ID, definitions)
    || instance.controllerPlayerId !== player.id || instance.zone !== "attack" || !instance.active || instance.face !== "up") return;
  const variant = variantForInstance(instance);
  if (!variant) throw new Error("CAULES_CRAFTED_TREE_VARIANT_MISSING");
  const excludeDefinitionIds = variant.id === "special" ? ["card.cardluck"] : [];
  const excludeTags = variant.id === "typeless" ? ["command-seal", "ruler-seal"] : [];
  const modifierId = forbidCardAttributeAbilityActivationAtLocation(
    state, player.id, CAULES_FORVEDGE_CRAFTED_TREE_ID, instance.instanceId, variant.attribute,
    { excludeDefinitionIds, excludeTags },
  );
  return { instanceId: instance.instanceId, variantId: variant.id, modifierId };
};

/** Enhanced Circuits materializes every still-uncreated Crafted Tree and permanently disables Overload. */
export const useCaulesForvedgeEnhancedCircuits: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("CAULES_ASCENSION_CONTEXT_REQUIRED");
  const event = isRecord(payload.event) ? payload.event : {};
  if (payload.eventType !== "skill.unlocked" || event.playerId !== player.id || event.skillId !== skill.id) return;
  player.flags.caulesForvedgeEnhancedCircuits = true;
  const instanceIds: string[] = [];
  for (const variant of VARIANTS) {
    const existing = existingVariant(state, player, definitions, variant.id);
    if (existing) {
      if (existing.zone === "master-skills") {
        existing.face = "up";
        existing.declaredAttributeRevealed = true;
      }
      continue;
    }
    instanceIds.push(createCraftedTree(state, player, definitions, variant.id, skill.id, false).instanceId);
  }
  return { instanceIds, overloadDisabled: true };
};

export function isCaulesForvedgeCraftedTreeEvent(
  state: GameState,
  playerId: string,
  event: { type: string; payload: unknown },
  definitions: Record<string, CardDefinition>,
): boolean {
  if (event.type !== "card.played" && event.type !== "card.entered-attack") return false;
  const payload = isRecord(event.payload) ? event.payload : {};
  if (payload.playerId !== playerId && payload.ownerPlayerId !== playerId) return false;
  const instanceId = typeof payload.instanceId === "string" ? payload.instanceId : undefined;
  return Boolean(instanceId && cardMatchesSkill(state.cards[instanceId], CAULES_FORVEDGE_CRAFTED_TREE_ID, definitions));
}
