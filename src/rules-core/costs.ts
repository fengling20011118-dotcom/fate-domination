import type { PlayerState, GameState, CardInstance } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { getEffectiveCardCost } from "./card-rule-modifiers.ts";
import { getStructuredCardCost, isStructuredManaSpendingForbidden } from "./rule-modifiers.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getTopAttachmentInheritedCost } from "./card-inherited-traits.ts";
import { commitCommandManaContribution, resolveCommandManaContribution } from "./linked-player-rules.ts";
import { calculateTerrainAdvantage } from "./combat-power.ts";

export function sumCardCosts(
  state: GameState,
  instanceIds: string[],
  definitions: Record<string, CardDefinition>,
  player?: PlayerState,
): number {
  return instanceIds.reduce((sum, instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");
    return sum + getCardPlayCost(state, definition, player, instance, definitions);
  }, 0);
}

export function getCardPlayCost(state: GameState, definition: CardDefinition, player?: PlayerState, instance?: CardInstance, definitions?: Record<string, CardDefinition>): number {
  const uncappedBaseCost = player && instance
    ? getEffectiveCardCost(state, player, instance, definition)
      + (definitions ? getTopAttachmentInheritedCost(state, instance, definitions) : 0)
    : definition.cost;
  const attachmentCostCap = instance?.copyTopAttachmentTraits?.maxTotalCost;
  if (attachmentCostCap !== undefined && (!Number.isInteger(attachmentCostCap) || attachmentCostCap < 0)) throw new Error("TOP_ATTACHMENT_COST_CAP_INVALID");
  const baseCost = attachmentCostCap === undefined ? uncappedBaseCost : Math.min(attachmentCostCap, uncappedBaseCost);
  const hiddenNameCost = player && !player.trueNameRevealed && definition.hiddenTrueNameCostReduction
    ? Math.max(0, baseCost - definition.hiddenTrueNameCostReduction)
    : baseCost;
  const situationReduction = definition.situationForbiddenAttributeCostReduction;
  const forbiddenAttributes = (state.modeState.situationRestrictions as { forbiddenAttributes?: string[] } | undefined)?.forbiddenAttributes ?? [];
  const situationAdjustedCost = situationReduction && forbiddenAttributes.includes(situationReduction.attribute)
    ? Math.max(0, hiddenNameCost - situationReduction.amount)
    : hiddenNameCost;
  let resolved = situationAdjustedCost;
  if (instance?.temporaryDefinitionCopy?.copiedManaCost === undefined && hiddenNameCost === definition.cost && definition.costRule) {
    if (definition.costRule.kind === "round-linear") {
      const value = definition.costRule.base + definition.costRule.perRound * state.round;
      resolved = Math.max(definition.costRule.min, value);
    } else if (definition.costRule.kind === "player-count-minus-round") {
      const playerCount = Object.keys(state.players).length;
      const offset = Number(definition.costRule.offset ?? 0);
      if (!Number.isInteger(offset)) throw new Error("CARD_COST_RULE_INVALID");
      resolved = Math.max(definition.costRule.min, playerCount + offset - state.round);
    } else {
      throw new Error("CARD_COST_RULE_INVALID");
    }
  }
  if (player && definitions && definition.isSkill && (player.locationId === "mountain" || player.locationId === "city")) {
    const hasEventSkillDiscountSource = player.attack.some((sourceId) => {
      const source = state.cards[sourceId];
      const sourceDefinition = source ? definitions[source.definitionId] : undefined;
      return Boolean(source?.active && source.face === "up" && source.zone === "attack"
        && sourceDefinition?.tags?.includes("owner-skill-cost-minus-highest-visible-event-vp")
        && sourceDefinition.ownerDefinitionId === definition.ownerDefinitionId);
    });
    if (hasEventSkillDiscountSource) {
      const highest = (state.board.currentEvents[player.locationId] ?? []).reduce((value, eventId) => {
        if (state.board.eventVisibility[eventId] !== "up") return value;
        const event = definitions[eventId] as (CardDefinition & { victoryPoints?: number }) | undefined;
        const points = Number(event?.victoryPoints ?? 0);
        return Number.isInteger(points) && points > value ? points : value;
      }, 0);
      resolved = Math.max(0, resolved - highest);
    }
  }
  if (player?.flags.illyaSmallGrailAttackCostReduction === 1) resolved = Math.max(0, resolved - 1);
  if (player && instance && definitions) resolved = getStructuredCardCost(state, player.id, instance, definition, definitions, resolved);
  if (player?.locationId && instance && definitions) {
    const attributes = getCardInstanceAttributes(instance, definition, state, definitions);
    for (const source of Object.values(state.cards)) {
      if (source.zone !== "board" || source.boardLocationId !== player.locationId || source.active !== true || source.ownerPlayerId === player.id) continue;
      const sourceOwner = source.ownerPlayerId ? state.players[source.ownerPlayerId] : undefined;
      if (!sourceOwner || sourceOwner.eliminated) continue;
      const aura = source.boardOpponentCardCostAura;
      if (!aura) continue;
      const zones = aura.sourceZones;
      if (zones && (!Array.isArray(zones) || !zones.includes(instance.zone))) continue;
      if (aura.attackOnly === true && definition.cardType !== "attack" && definition.isSkill !== true) continue;
      if (aura.attributesAny !== undefined) {
        if (!Array.isArray(aura.attributesAny) || !aura.attributesAny.some((attribute) => attributes.includes(attribute))) continue;
      }
      if (!Number.isInteger(aura.amount) || aura.amount < 0 || (aura.max !== undefined && (!Number.isInteger(aura.max) || aura.max < 0))) throw new Error("BOARD_CARD_COST_AURA_INVALID");
      const increased = resolved + aura.amount;
      resolved = aura.max === undefined ? increased : Math.min(aura.max, increased);
    }
  }
  if (instance?.costModifiers?.length) {
    const modifiers = instance.costModifiers.filter((modifier) => modifier.duration === "game" || modifier.duration === "round");
    for (const modifier of modifiers) {
      if (modifier.kind !== "add" || !Number.isInteger(modifier.value)) throw new Error("CARD_COST_MODIFIER_INVALID");
      if (modifier.minPrintedFraction !== undefined
        && (!Number.isFinite(modifier.minPrintedFraction) || modifier.minPrintedFraction < 0 || modifier.minPrintedFraction > 1)) {
        throw new Error("CARD_COST_MODIFIER_FLOOR_INVALID");
      }
    }
    const beforePhysicalModifiers = resolved;
    resolved += modifiers.reduce((total, modifier) => total + modifier.value, 0);
    const floorFraction = Math.max(0, ...modifiers.map((modifier) => modifier.minPrintedFraction ?? 0));
    if (floorFraction > 0) {
      // Fixed printed costs use the literal card value. Variable/X-like costs
      // use their already-resolved printed calculation, then physical reductions.
      const printedReference = definition.costRule ? beforePhysicalModifiers : Math.max(0, Number(definition.cost));
      resolved = Math.max(resolved, Math.ceil(printedReference * floorFraction));
    }
    resolved = Math.max(0, resolved);
  }
  if (definition.terrainAdvantageCostReduction === true && player && instance && definitions) {
    resolved = Math.max(0, resolved - calculateTerrainAdvantage(state, player, definitions, player.locationId));
  }
  const lowManaSurcharge = definition.lowManaSkillPlaySurcharge;
  if (player && lowManaSurcharge) {
    if (!Number.isInteger(lowManaSurcharge.thresholdExclusive) || lowManaSurcharge.thresholdExclusive < 0
      || !Number.isInteger(lowManaSurcharge.amount) || lowManaSurcharge.amount < 0) throw new Error("LOW_MANA_SKILL_SURCHARGE_INVALID");
    if (player.mana < lowManaSurcharge.thresholdExclusive) resolved += lowManaSurcharge.amount;
  }
  return resolved;
}

export function assertMana(player: PlayerState, amount: number, error = "INSUFFICIENT_MANA"): void {
  if (player.flags.infiniteMana === true) return;
  if (amount < 0 || player.mana < amount) throw new Error(error);
}

export function payMana(player: PlayerState, amount: number, error = "INSUFFICIENT_MANA"): void {
  assertMana(player, amount, error);
  if (player.flags.infiniteMana === true) return;
  player.mana -= amount;
}

/** Pay a voluntary mana cost through the structured mana-spending rule boundary. */
export function payManaCost(
  state: GameState,
  player: PlayerState,
  amount: number,
  definitions?: Record<string, CardDefinition>,
  error = "INSUFFICIENT_MANA",
): ReturnType<typeof resolveCommandManaContribution> {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("MANA_COST_INVALID");
  if (amount > 0 && definitions && isStructuredManaSpendingForbidden(state, player.id, definitions)) {
    throw new Error("MANA_SPENDING_FORBIDDEN_BY_RULE");
  }
  const split = resolveCommandManaContribution(state, player.id, amount);
  for (const contribution of split.contributions) {
    const contributor = state.players[contribution.contributorPlayerId];
    if (definitions && contributor && isStructuredManaSpendingForbidden(state, contributor.id, definitions)) {
      throw new Error("MANA_SPENDING_FORBIDDEN_BY_RULE");
    }
  }
  // Validate every pool before mutating any so a split payment stays atomic.
  assertMana(player, split.payerAmount, error);
  for (const contribution of split.contributions) {
    const contributor = state.players[contribution.contributorPlayerId];
    if (!contributor) throw new Error("MANA_CONTRIBUTOR_NOT_FOUND");
    assertMana(contributor, contribution.amount, "MANA_CONTRIBUTOR_INSUFFICIENT_MANA");
  }
  payMana(player, split.payerAmount, error);
  for (const contribution of split.contributions) {
    payMana(state.players[contribution.contributorPlayerId], contribution.amount, "MANA_CONTRIBUTOR_INSUFFICIENT_MANA");
  }
  commitCommandManaContribution(state, split);

  // Keep an authoritative transaction ledger separate from the legacy
  // roundManaSpent aggregate. Reactions such as Sieg's Galvanism care about
  // each actual player's individual payment, including a linked contributor.
  const recordSpend = (payerPlayerId: string, paidAmount: number): void => {
    if (paidAmount <= 0) return;
    const sequence = Number(state.modeState.manaSpendSequence ?? 0) + 1;
    if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new Error("MANA_SPEND_SEQUENCE_INVALID");
    state.modeState.manaSpendSequence = sequence;
    const existing = Array.isArray(state.modeState.manaSpendLedger)
      ? state.modeState.manaSpendLedger.filter((entry) => entry && typeof entry === "object")
      : [];
    state.modeState.manaSpendLedger = [
      ...existing,
      { sequence, playerId: payerPlayerId, amount: paidAmount, round: state.round },
    ].slice(-128);
  };
  recordSpend(player.id, split.payerAmount);
  for (const contribution of split.contributions) recordSpend(contribution.contributorPlayerId, contribution.amount);
  return split;
}
