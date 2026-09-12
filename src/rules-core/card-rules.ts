import type { GameState, PlayerState, CardInstance, CardZone } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { getEffectiveCardUsageLimit, isCardUsageAvailable } from "./usage-limits.ts";
import { playerIgnoresDefeat } from "./defeat.ts";
import { cardAllowsFaceDownPlay, cardHasEightManaWaiver, cardIgnoresSituationRestrictions, cardIgnoresUsageLimit, cardPlayForbiddenByModifier, getCardRuleUsageLimitOverride, getEffectiveCardCost } from "./card-rule-modifiers.ts";
import { getStructuredCardCost, ignoresCardEffectPlayRestrictions, isStructuredCardPlayForbidden, structuredCardIgnoresSituationRestrictions } from "./rule-modifiers.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { isPlayerUnaffectedBySituation } from "./situation-immunity.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import { playerIsDisarmed, playerNoblePhantasmUseBlocked } from "./player-statuses.ts";
import { situationForbiddenAttributeReplacedForCard } from "./situation-replacements.ts";
import { getChineseForbiddenAttributes } from "./china-lostbelt.ts";

export interface AttackCardValidationContext {
  state: GameState;
  playerId: string;
  instanceId: string;
  definitions: Record<string, CardDefinition>;
  faceDown: boolean;
  primitiveDragonActive?: boolean;
  /** Explicit effect exception for cards added to an attack without being played. */
  bypassSkillEightMana?: boolean;
  /** Effect-only source zones; normal play keeps the default hand/skill-zone sources. */
  allowedSourceZones?: CardZone[];
  /** Explicit card-text play effect may override the card's printed normal play timing. */
  bypassTiming?: boolean;
  /** Explicit effect permission to place a skill card face-down despite the normal skill-card visibility rule. */
  bypassSkillFaceDown?: boolean;
  /** Effect-only exception allowing the acting player to play another owner's physical card. */
  allowBorrowedCard?: boolean;
  /** A validated round-play substitution may admit a card outside the ordinary allowed-instance set. */
  roundPlayRestrictionSubstitution?: boolean;
}

/**
 * Shared card-entry rules. Callers still own batch-size and phase checks;
 * this component owns card identity, visibility, cost gates and restrictions.
 */
export function assertCardCanEnterAttack(context: AttackCardValidationContext): CardDefinition {
  const { state, playerId, instanceId, definitions, faceDown, primitiveDragonActive = false, bypassSkillEightMana = false } = context;
  const allowedSourceZones: CardZone[] = context.allowedSourceZones ?? ["hand", "master-skills", "servant-skills"];
  const player = state.players[playerId];
  const instance = state.cards[instanceId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  if (playerIsDisarmed(player)) throw new Error("PLAYER_DISARMED");
  if (player.defeated && !playerIgnoresDefeat(state, player, definitions)) throw new Error("PLAYER_DEFEATED");
  const borrowedSkillInControllerZone = Boolean(instance && instance.ownerPlayerId !== playerId && instance.controllerPlayerId === playerId
    && (instance.returnToOwnerSkillZoneOnClose === "master-skills" || instance.returnToOwnerSkillZoneOnClose === "servant-skills")
    && (instance.zone === "master-skills" || instance.zone === "servant-skills"));
  const ownedOrBorrowed = Boolean(instance && (instance.ownerPlayerId === playerId || context.allowBorrowedCard === true || borrowedSkillInControllerZone));
  const attachedAsHand = Boolean(instance && instance.zone === "attached" && allowedSourceZones.includes("hand")
    && instance.attachedToInstanceId && instance.playAsHandWhileAttached?.sourceInstanceId === instance.attachedToInstanceId
    && state.cards[instance.attachedToInstanceId]?.ownerPlayerId === playerId);
  if (!instance || !ownedOrBorrowed || (!allowedSourceZones.includes(instance.zone) && !attachedAsHand)) {
    throw new Error("CARD_NOT_AVAILABLE");
  }
  const roundRestriction = player.roundPlayRestriction?.round === state.round ? player.roundPlayRestriction : undefined;
  if (roundRestriction && !roundRestriction.allowedInstanceIds.includes(instanceId)
    && context.roundPlayRestrictionSubstitution !== true) throw new Error("CARD_PLAY_RESTRICTED_THIS_ROUND");
  if (player.attack.includes(instanceId)) throw new Error("CARD_ALREADY_IN_ATTACK");
  if (instance.playBlockedUntilOwnerCombatWin) throw new Error("CARD_PLAY_BLOCKED_UNTIL_COMBAT_WIN");
  const definition = definitions[instance.definitionId];
  if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");
  if (definition.requiresActiveInSkillZoneToPlay === true
    && (!(instance.zone === "master-skills" || instance.zone === "servant-skills") || instance.active !== true)) {
    throw new Error("CARD_REQUIRES_ACTIVE_SKILL_ZONE_SOURCE");
  }
  if (playerNoblePhantasmUseBlocked(player, state.round)
    && getCardInstanceAttributes(instance, definition, state, definitions).includes("宝具")) {
    throw new Error("NOBLE_PHANTASM_USE_BLOCKED");
  }
  if (definition.tags?.includes("cannot-play")) throw new Error("CARD_CANNOT_BE_PLAYED");
  if (definition.playRequiresPlayerFlag && player.flags[definition.playRequiresPlayerFlag.key] !== definition.playRequiresPlayerFlag.value) {
    throw new Error("CARD_PLAY_PLAYER_FLAG_REQUIRED");
  }
  if (definition.tags?.includes("requires-other-player-same-location-to-play")) {
    const locationId = player.locationId;
    const hasOtherPlayer = typeof locationId === "string" && (state.board.locations[locationId] ?? [])
      .some((candidateId) => candidateId !== playerId && Boolean(state.players[candidateId]) && !state.players[candidateId].eliminated);
    if (!hasOtherPlayer) throw new Error("CARD_REQUIRES_OTHER_PLAYER_SAME_LOCATION");
  }

  const forbiddenTag = typeof player.flags.cardPlayForbiddenTag === "string" ? player.flags.cardPlayForbiddenTag : undefined;
  if (forbiddenTag && definition.tags?.includes(forbiddenTag)) throw new Error("CARD_PLAY_FORBIDDEN_BY_PLAYER_STATE");
  if (Number(player.flags.roundExclusiveCardPlayedRound ?? Number.NEGATIVE_INFINITY) === state.round) throw new Error("ROUND_EXCLUSIVE_CARD_ALREADY_PLAYED");
  if (definition.roundExclusivePlay === true && Number(player.flags.cardsPlayedThisRound ?? 0) > 0) throw new Error("ROUND_EXCLUSIVE_CARD_REQUIRES_NO_PRIOR_PLAYS");
  if (isStructuredCardPlayForbidden(state, playerId, instance, definition, definitions)) throw new Error("CARD_PLAY_FORBIDDEN_BY_RULE");

  if (definition.requiresTrueName && !player.trueNameRevealed) throw new Error("CARD_REQUIRES_TRUE_NAME");
  if (definition.requiresHiddenTrueName && player.trueNameRevealed) throw new Error("CARD_REQUIRES_HIDDEN_TRUE_NAME");
  if (definition.requiresSkillUsedThisRound) {
    const requiredSkillId = definition.requiresSkillUsedThisRound;
    const usedThisRound = Object.entries(player.usage).some(([key, usage]) =>
      (key === requiredSkillId || key.startsWith(`${requiredSkillId}:`)) && usage.used === true && usage.round === state.round);
    if (!usedThisRound) throw new Error("CARD_REQUIRES_SKILL_USED_THIS_ROUND");
  }
  if (definition.playPrerequisite?.activeOwnedDefinitionId) {
    const requiredDefinitionId = definition.playPrerequisite.activeOwnedDefinitionId;
    const hasActivePrerequisite = player.attack.some((candidateId) => {
      const candidate = state.cards[candidateId];
      const candidateDefinition = candidate ? definitions[candidate.definitionId] : undefined;
      return Boolean(candidate && candidate.ownerPlayerId === playerId && candidate.active && candidate.face === "up"
        && (candidate.definitionId === requiredDefinitionId || candidateDefinition?.linkedSkillId === requiredDefinitionId));
    });
    if (!hasActivePrerequisite) throw new Error("CARD_PLAY_PREREQUISITE_MISSING");
  }
  if (definition.playPrerequisite?.discardFromHand) {
    const rule = definition.playPrerequisite.discardFromHand;
    if (!Number.isInteger(rule.count) || rule.count < 0) throw new Error("CARD_PLAY_PREREQUISITE_DISCARD_RULE_INVALID");
    const requiredAttributes = rule.attributesAll ?? [];
    const candidates = player.hand.filter((candidateId) => {
      if (candidateId === instanceId) return false;
      const candidate = state.cards[candidateId];
      const candidateDefinition = candidate ? definitions[candidate.definitionId] : undefined;
      if (!candidate || !candidateDefinition || candidate.ownerPlayerId !== playerId || candidate.zone !== "hand") return false;
      if (rule.basic === true && candidateDefinition.basic !== true) return false;
      const attributes = getCardInstanceAttributes(candidate, candidateDefinition, state, definitions);
      return requiredAttributes.every((attribute) => attributes.includes(attribute));
    });
    if (candidates.length < rule.count) throw new Error("CARD_PLAY_PREREQUISITE_DISCARD_MISSING");
  }
  if (definition.playPrerequisite?.customResource) {
    const rule = definition.playPrerequisite.customResource;
    if (!Number.isInteger(rule.amount) || rule.amount < 0 || !Array.isArray(rule.resourceIds) || rule.resourceIds.length === 0
      || rule.resourceIds.some((resourceId) => typeof resourceId !== "string" || resourceId.length === 0)) {
      throw new Error("CARD_PLAY_PREREQUISITE_RESOURCE_RULE_INVALID");
    }
    const available = rule.resourceIds.reduce((sum, resourceId) => sum + Number(player.customResources?.[resourceId] ?? 0), 0);
    if (available < rule.amount) throw new Error("CARD_PLAY_PREREQUISITE_RESOURCE_MISSING");
  }
  if (Number.isInteger(definition.maxManaExclusive) && player.mana >= Number(definition.maxManaExclusive)) {
    throw new Error("CARD_REQUIRES_MANA_BELOW_LIMIT");
  }
  // For basic cards and generated Skill cards, `phases` describes printed
  // ability windows (for example Luck in Combat or a Skill's Combat clause),
  // not when the attack card itself may be committed. Standard attack timing is
  // enforced by commitStandardAttack.
  if (context.bypassTiming !== true && definition.basic !== true && definition.isSkill !== true && definition.phases?.length && !definition.phases.includes(state.phase)) throw new Error("CARD_PLAY_PHASE_FORBIDDEN");
  if (context.bypassTiming !== true && definition.basic !== true && definition.isSkill !== true && definition.steps?.length && !definition.steps.includes(state.step)) throw new Error("CARD_PLAY_STEP_FORBIDDEN");
  if (cardPlayForbiddenByModifier(state, player, instance)) throw new Error("CARD_PLAY_FORBIDDEN_BY_MODIFIER");
  const forbiddenAttributes = (state.modeState.situationRestrictions as { forbiddenAttributes?: string[] } | undefined)?.forbiddenAttributes ?? [];
  const instanceAttributes = getCardInstanceAttributes(instance, definition, state, definitions);
  if (!isPlayerUnaffectedBySituation(state, playerId, definitions)
    && !definition.ignoresSituationRestrictions
    && !cardIgnoresSituationRestrictions(state, player, instance)
    && !structuredCardIgnoresSituationRestrictions(state, playerId, instance, definition, definitions)
    && forbiddenAttributes.some((attribute) => instanceAttributes.includes(attribute)
      && !situationForbiddenAttributeReplacedForCard(state, player, instance, definition, definitions, attribute))) {
    throw new Error("CARD_ATTRIBUTE_FORBIDDEN_BY_SITUATION");
  }
  const objectiveForbiddenAttributes = getChineseForbiddenAttributes(state, player.locationId, definitions);
  if (objectiveForbiddenAttributes.some((attribute) => instanceAttributes.includes(attribute))) {
    throw new Error("CARD_ATTRIBUTE_FORBIDDEN_BY_OBJECTIVE");
  }
  const servantSkillWaived = definition.skillOwnerType === "servant" && player.flags.servantSkillEightManaWaiver === true;
  const sourcedSkillWaiver = Array.isArray(player.flags.skillEightManaWaiverSourceIds) && player.flags.skillEightManaWaiverSourceIds.length > 0;
  const printedPowerWaiver = Number.isInteger(definition.eightManaWaiverMaxPrintedBasePower)
    && getPrintedCardBasePower(state, player, definition) <= Number(definition.eightManaWaiverMaxPrintedBasePower);
  const lowManaSurchargeWaiver = Boolean(definition.lowManaSkillPlaySurcharge);
  if (definition.isSkill && !bypassSkillEightMana && definition.requiresEightMana !== false && player.mana < 8
    && player.flags.skillEightManaWaiver !== true && !sourcedSkillWaiver && !servantSkillWaived && !printedPowerWaiver && !lowManaSurchargeWaiver && !cardHasEightManaWaiver(state, player, instance)) {
    throw new Error("SKILL_REQUIRES_EIGHT_MANA");
  }
  if (definition.isSkill && faceDown && context.bypassSkillFaceDown !== true && !cardAllowsFaceDownPlay(state, player, instance)) throw new Error("SKILL_CANNOT_BE_FACE_DOWN");
  const effectiveUsageLimit = getCardRuleUsageLimitOverride(state, player, instance)
    ?? getEffectiveCardUsageLimit(instance, definition.limit);
  if (!cardIgnoresUsageLimit(state, player, instance) && !isCardUsageAvailable(instance, effectiveUsageLimit, state.round, state.phase)) throw new Error("CARD_LIMIT_REACHED");
  if (primitiveDragonActive && definition.basic) throw new Error("BASIC_ATTACK_FORBIDDEN_BY_PRIMITIVE_DRAGON");
  return definition;
}

export function getStandardAttackRequirements(player: PlayerState, state: GameState, definitions: Record<string, CardDefinition>): {
  requiredCards: number;
  primitiveDragonActive: boolean;
} {
  const residualDefinitions = player.attack
    .map((instanceId) => definitions[state.cards[instanceId]?.definitionId ?? ""])
    .filter(Boolean);
  const threshold = Number(player.flags.extraStandardAttackManaThreshold);
  const thresholdBonus = Number.isInteger(threshold) && player.mana >= threshold ? 1 : 0;
  const fixedBonus = Math.max(0, Number(player.flags.extraStandardAttackCards ?? 0));
  const reduction = residualDefinitions.some((definition) => definition.tags?.includes("reduces-standard-attack-by-one")) ? 1 : 0;
  const ignorePlayPrevention = ignoresCardEffectPlayRestrictions(state, player.id, definitions);
  return {
    requiredCards: Math.max(1, 2 + thresholdBonus + fixedBonus - reduction),
    primitiveDragonActive: !ignorePlayPrevention && residualDefinitions.some((definition) => definition.tags?.includes("primitive-dragon")),
  };
}

export function getCardCost(instance: CardInstance, definitions: Record<string, CardDefinition>): number {
  const definition = definitions[instance.definitionId];
  if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");
  return definition.cost;
}

export function getCardCostForPlayer(state: GameState, playerId: string, instance: CardInstance, definitions: Record<string, CardDefinition>): number {
  const definition = definitions[instance.definitionId];
  const player = state.players[playerId];
  if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  return getStructuredCardCost(state, player.id, instance, definition, definitions, getEffectiveCardCost(state, player, instance, definition));
}
