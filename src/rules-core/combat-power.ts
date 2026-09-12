import type { GameState, PlayerState } from "../domain/state/types.ts";
import { getCardAttributes } from "./content-types.ts";
import type { CardDefinition } from "./content-types.ts";
import { getAttachedCards } from "./card-attachments.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getStructuredCardBasePower, getStructuredCardPower, getStructuredCombatPower, getStructuredDeploymentAdvantage, getStructuredSituationPowerMultiplier, isStructuredSituationBenefitForbidden } from "./rule-modifiers.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import { getUnoccupiedLocationAdvantageBonus } from "./location-rules.ts";
import { countEngagedOpponentUnusedCommandSeals } from "./command-seals.ts";
import { isPlayerUnaffectedBySituation } from "./situation-immunity.ts";
import { getStackedStatusTotalPowerModifier } from "./stacked-statuses.ts";
import { cardPreventsOpponentPowerReduction, cardPreventsPowerReduction, getCardRuleAttachmentPowerBonusMultiplier, getCardRuleCombatAttributeGrants, getCardRulePowerAdd, getCardRulePowerCeiling, getCardRuleUniqueTypePowerRate } from "./card-rule-modifiers.ts";
import { getBoardPowerModifierMultiplier } from "./board-power-auras.ts";
import { getTopAttachmentInheritedPower } from "./card-inherited-traits.ts";
import { getSituationNoblePhantasmReplacementPowerBonus } from "./situation-replacements.ts";
import { replaceAttributeMapForColor } from "./hokusai.ts";
import { getCustomResource } from "./resources.ts";
import { getServantAttackPowerAlterationApplications } from "./servant-attack-partitions.ts";
import { getLostbeltPresencePowerBonus } from "./lostbelt.ts";
import { getAttackPrintedBaseCeiling } from "./attack-power-ceilings.ts";
import { getIndiaFadingTownTerrainBonus, getIndiaJudgementPowerBonus, getIndiaObjectiveCardPowerAdd } from "./india-lostbelt.ts";
import { filterDuelIsolationCombatCardIds, ignoresNeutralBoardCombatEffects } from "./duel-isolation.ts";
import { applyEventObjectiveNumericEffectMultiplier } from "./event-effect-modifiers.ts";
import { getChineseObjectiveTotalPowerBonus, getChinesePositiveBoardPowerMultiplier } from "./china-lostbelt.ts";
import { getCombinedPresenceTerrainAdvantage, getExtraPresenceTerrainAdvantageAtLocation } from "./player-presences.ts";

const MUSASHI_NITEN_ICHIRYU_ID = "servant.musashi.skill.sc-musashi-2";

function getMusashiMastery(player: PlayerState): number {
  const value = Number(player.flags.musashiBoundaryMarkers ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function hasMusashiNitenIchiryu(state: GameState, player: PlayerState): boolean {
  return [...player.masterSkills, ...player.servantSkills].some((instanceId) => {
    const instance = state.cards[instanceId];
    if (!instance || instance.zone === "removed") return false;
    return instance.definitionId === MUSASHI_NITEN_ICHIRYU_ID
      || instance.definitionId === `card.skill.${MUSASHI_NITEN_ICHIRYU_ID}`;
  });
}

function applyMusashiBasePowerRule(player: PlayerState, definition: CardDefinition, printedBasePower: number, mastery: number): number {
  if (mastery >= 7 && definition.basic === true) return printedBasePower * 2;
  if (mastery >= 12 && definition.isSkill === true && definition.ownerDefinitionId === "servant.musashi") return printedBasePower * 2;
  return printedBasePower;
}

function applyPhysicalBasePowerMultiplier(
  state: GameState,
  instance: GameState["cards"][string],
  definition: CardDefinition,
  basePower: number,
  applications = 1,
): number {
  let multiplier = Number(instance.basePowerMultiplier ?? 1);
  if (!Number.isInteger(multiplier) || multiplier < 1) throw new Error("CARD_BASE_POWER_MULTIPLIER_INVALID");
  const conditional = definition.ownerConditionalBasePowerMultiplier;
  const owner = instance.ownerPlayerId ? state.players[instance.ownerPlayerId] : undefined;
  if (conditional && owner && owner.flags[conditional.playerFlagEquals.key] === conditional.playerFlagEquals.value
    && (conditional.commandSealsAtMost === undefined || owner.commandSeals <= conditional.commandSealsAtMost)) {
    if (!Number.isInteger(conditional.multiplier) || conditional.multiplier < 1) throw new Error("CARD_OWNER_BASE_POWER_MULTIPLIER_INVALID");
    multiplier *= conditional.multiplier;
  }
  return basePower * Math.pow(multiplier, applications);
}

export function calculateCombatCardBasePower(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  cards: Record<string, CardDefinition>,
  mastery = getMusashiMastery(player),
): number {
  const instance = state.cards[instanceId];
  const definition = cards[instance?.definitionId ?? ""];
  if (!instance || !definition) return 0;
  const powerAlterationApplications = getServantAttackPowerAlterationApplications(state, player, definition.id, cards);
  let printedBasePower = getPrintedCardBasePower(state, player, definition);
  if (definition.basePowerPerSameLocationOpponent !== undefined) {
    const perOpponent = Number(definition.basePowerPerSameLocationOpponent);
    if (!Number.isInteger(perOpponent) || perOpponent < 0) throw new Error("SAME_LOCATION_OPPONENT_BASE_POWER_INVALID");
    const locationId = player.locationId;
    const opponents = locationId && state.board.locations[locationId]
      ? state.board.locations[locationId].filter((id) => id !== player.id && !state.players[id]?.eliminated).length
      : 0;
    printedBasePower = perOpponent * opponents;
  }
  if (player.locationId && definition.basePowerZeroIfBoardDefinitionAtControllerLocation?.some((sourceId) => Object.values(state.cards).some((source) => {
    const sourceDefinition = cards[source.definitionId];
    return source.zone === "board" && source.active === true && source.boardLocationId === player.locationId
      && (source.definitionId === sourceId || sourceDefinition?.linkedSkillId === sourceId);
  }))) printedBasePower = 0;
  const inheritedPower = getTopAttachmentInheritedPower(state, player, instance, cards);
  const printed = applyPhysicalBasePowerMultiplier(state, instance, definition, printedBasePower
    + inheritedPower * powerAlterationApplications, powerAlterationApplications);
  const masteryAdjusted = hasMusashiNitenIchiryu(state, player)
    ? applyMusashiBasePowerRule(player, definition, printed, mastery)
    : printed;
  const attributes = getCombatCardAttributes(state, player, instanceId, cards);
  const magicReductionProtected = attributes.includes("魔术")
    && (Number(player.flags.magicPowerReductionProtectedRound ?? -1) === state.round
      || Number(player.flags.opponentAbilityMagicPowerReductionProtectedRound ?? -1) === state.round);
  return getStructuredCardBasePower(state, player.id, instance, definition, cards, masteryAdjusted, false, magicReductionProtected, powerAlterationApplications);
}

function getMusashiNitenTotalPowerBonus(state: GameState, player: PlayerState, cards: Record<string, CardDefinition>): number {
  const mastery = getMusashiMastery(player);
  if (mastery < 2 || !hasMusashiNitenIchiryu(state, player)) return 0;
  const active = getActiveCombatCardIds(state, player);
  if (active.length < 2) return 0;
  const seen = new Set<number>();
  for (const instanceId of active) {
    const basePower = calculateCombatCardBasePower(state, player, instanceId, cards, mastery);
    if (seen.has(basePower)) return 5;
    seen.add(basePower);
  }
  return 0;
}

export function getActiveCombatCardIds(state: GameState, player: PlayerState): string[] {
  const attackIds = player.attack.filter((instanceId) => {
    const instance = state.cards[instanceId];
    return Boolean(instance?.active && instance.face === "up");
  });
  const boardAttackIds = Object.values(state.cards).filter((instance) => instance.ownerPlayerId === player.id
    && instance.controllerPlayerId === player.id
    && instance.zone === "board"
    && instance.active
    && instance.face === "up"
    && instance.boardAttackWhileOwnerPresent === true
    && (instance.boardLocationId === "mountain" || instance.boardLocationId === "city")
    && player.locationId === instance.boardLocationId)
    .map((instance) => instance.instanceId);
  return filterDuelIsolationCombatCardIds(state, player.id, [...new Set([...attackIds, ...boardAttackIds])]);
}

/** Current terrain-advantage value before it is added to aggregate combat power. */
export function calculateTerrainAdvantage(
  state: GameState,
  player: PlayerState,
  cards: Record<string, CardDefinition>,
  locationId: string | null | undefined = player.locationId,
): number {
  const deploymentBonusBase = player.flags.sharePresenceTerrainAdvantage === true
    ? getCombinedPresenceTerrainAdvantage(state, player.id)
    : player.flags.deploymentBonusActive && (!locationId || player.flags.deploymentLocationId === locationId)
      ? Number(player.flags.deploymentBonus ?? 0)
      : getExtraPresenceTerrainAdvantageAtLocation(state, player.id, locationId);
  const unoccupiedTerrainBonus = getUnoccupiedLocationAdvantageBonus(state, player.id, locationId ?? null);
  const roundLocationBonus = player.flags.roundTerrainAdvantageBonusRound === state.round
    && player.flags.roundTerrainAdvantageBonusLocationId === locationId
    ? Number(player.flags.roundTerrainAdvantageBonus ?? 0)
    : 0;
  if (!Number.isFinite(roundLocationBonus)) throw new Error("ROUND_TERRAIN_ADVANTAGE_BONUS_INVALID");
  const indiaTerrainBonus = getIndiaFadingTownTerrainBonus(state, player, locationId, cards);
  const calculated = getStructuredDeploymentAdvantage(state, player.id, cards, deploymentBonusBase + unoccupiedTerrainBonus + roundLocationBonus + indiaTerrainBonus, locationId);
  const zeroSourceInstanceId = typeof player.flags.terrainAdvantageZeroSourceInstanceId === "string"
    ? player.flags.terrainAdvantageZeroSourceInstanceId
    : undefined;
  const zeroSource = zeroSourceInstanceId ? state.cards[zeroSourceInstanceId] : undefined;
  if (zeroSource?.zone === "attack" && zeroSource.active === true && zeroSource.face === "up") return 0;
  const terrainOverrideLocationId = typeof player.flags.terrainAdvantageOverrideLocationId === "string"
    ? player.flags.terrainAdvantageOverrideLocationId
    : undefined;
  if (player.flags.terrainAdvantageOverrideRound === state.round
    && (!terrainOverrideLocationId || terrainOverrideLocationId === locationId)) {
    const override = Number(player.flags.terrainAdvantageOverrideValue);
    if (!Number.isFinite(override)) throw new Error("TERRAIN_ADVANTAGE_OVERRIDE_INVALID");
    return override;
  }
  return calculated;
}

function calculateCombatPowerRaw(state: GameState, player: PlayerState, cards: Record<string, CardDefinition>, locationId?: string): number {
  const permanentFixed = player.flags.combatPowerFixedPermanent;
  if (permanentFixed !== undefined) {
    const value = Number(permanentFixed);
    if (!Number.isInteger(value)) throw new Error("COMBAT_POWER_FIXED_PERMANENT_INVALID");
    return value;
  }
  const stackedStatusPower = getStackedStatusTotalPowerModifier(state, player);
  const overrideRound = Number(player.flags.combatPowerOverrideRound ?? Number.NEGATIVE_INFINITY);
  const overrideValue = Number(player.flags.combatPowerOverrideValue ?? 0);
  const overrideSourceId = typeof player.flags.combatPowerOverrideSourceInstanceId === "string" ? player.flags.combatPowerOverrideSourceInstanceId : undefined;
  const overrideSource = overrideSourceId ? state.cards[overrideSourceId] : undefined;
  const overrideActive = overrideRound === state.round && Number.isInteger(overrideValue)
    && (!overrideSourceId || Boolean(overrideSource && overrideSource.zone !== "removed"));
  if (overrideActive) return overrideValue + stackedStatusPower;
  const base = getActiveCombatCardIds(state, player)
    .reduce((sum, instanceId) => sum + calculateCombatCardPower(state, player, instanceId, cards, locationId), 0);
  const situation = ignoresNeutralBoardCombatEffects(state, player.id) || isPlayerUnaffectedBySituation(state, player.id, cards)
    || isStructuredSituationBenefitForbidden(state, player.id, cards, "power") ? undefined : getSituationCombatPower(state, locationId);
  const roundBonus = Number(player.flags.roundPowerBonus ?? 0);
  const commandSealBonus = Number(player.flags.commandSealRoundPowerBonus ?? 0);
  const leonardoStreak = player.flags.leonardoLastWinRound === state.round - 1
    ? Number(player.flags.leonardoWinStreak ?? 0)
    : 0;
  const leonardoBonus = leonardoStreak >= 2 ? 5 : leonardoStreak === 1 ? 3 : 0;
  const nanayaPenalty = player.flags.nanayaContestedRound === state.round - 1 ? -2 : 0;
  const firstDayPenalty = Number(player.flags.bazettDay ?? (state.round === 1 ? 1 : 0)) === 1
    ? Number(player.flags.firstDayPowerPenalty ?? 0)
    : 0;
  const hunterBonus = player.flags.chaosHunterRound === state.round
    && (locationId === "mountain" || locationId === "city")
    ? (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated).length
    : 0;
  const terrainLocationId = locationId ?? player.locationId;
  const deploymentBonus = calculateTerrainAdvantage(state, player, cards, terrainLocationId);
  const terrainContributionMultiplier = player.flags.terrainAdvantageContributionMultiplierRound === state.round
    ? Number(player.flags.terrainAdvantageContributionMultiplier ?? 1)
    : 1;
  if (!Number.isFinite(terrainContributionMultiplier)) throw new Error("TERRAIN_CONTRIBUTION_MULTIPLIER_INVALID");
  const terrainContribution = deploymentBonus * terrainContributionMultiplier;
  const danSniperBonus = player.flags.danSniperRound === state.round && locationId
    ? Number(locationId === "mountain" ? player.flags.danSniperMountainBonus : player.flags.danSniperCityBonus)
    : 0;
  const situationPowerMultiplier = getStructuredSituationPowerMultiplier(state, player.id, cards, getBoardPowerModifierMultiplier(state, locationId ?? player.locationId, player.id, "situation"));
  const aggregateSituationAdd = situation?.aggregateAddBySharedAttribute && hasSharedActiveAttribute(state, player, cards)
    ? situation.aggregateAddBySharedAttribute * situationPowerMultiplier
    : 0;
  const climaxNoblePhantasmBonus = state.modeState.currentSituationClimax === true
    && getActiveCombatCardIds(state, player).some((instanceId) => cards[state.cards[instanceId]?.definitionId ?? ""]?.tags?.includes("climax-total-power-plus-4"))
    ? 4
    : 0;
  const fiorePenalty = player.flags.fioreGentle && locationId
    ? (state.board.locations[locationId] ?? []).some((id) => id !== player.id
      && !state.players[id]?.eliminated
      && state.players[id].victoryPoints < player.victoryPoints) ? -2 : 0
    : 0;
  const kariya = Object.values(state.players).find((candidate) => candidate.masterId === "master.kariya");
  const kariyaNemesis = kariya && typeof kariya.flags.kariyaNemesisPlayerId === "string"
    ? state.players[kariya.flags.kariyaNemesisPlayerId]
    : undefined;
  const kariyaNemesisPenalty = player.masterId === "master.kariya" && Boolean(locationId)
    && kariyaNemesis?.locationId === locationId && !kariyaNemesis.eliminated ? -2 : 0;
  const unusedSealAuraBonus = player.flags.engagedOpponentUnusedSealPowerRound === state.round
    ? countEngagedOpponentUnusedCommandSeals(state, player.id, terrainLocationId)
      * Number(player.flags.engagedOpponentUnusedSealPowerPerSeal ?? 0)
    : 0;
  if (!Number.isFinite(unusedSealAuraBonus)) throw new Error("UNUSED_SEAL_POWER_AURA_INVALID");
  const musashiNitenBonus = getMusashiNitenTotalPowerBonus(state, player, cards);
  const lostbeltPresenceBonus = getLostbeltPresencePowerBonus(state, player, locationId ?? player.locationId, cards);
  const indiaJudgementBonus = getIndiaJudgementPowerBonus(state, player);
  const chinaObjectiveBonus = getChineseObjectiveTotalPowerBonus(state, player, locationId ?? player.locationId, cards);
  const aggregate = base + roundBonus + commandSealBonus + leonardoBonus + nanayaPenalty + firstDayPenalty + hunterBonus + terrainContribution + danSniperBonus + aggregateSituationAdd + fiorePenalty + climaxNoblePhantasmBonus + kariyaNemesisPenalty + unusedSealAuraBonus + musashiNitenBonus + lostbeltPresenceBonus + indiaJudgementBonus + chinaObjectiveBonus + stackedStatusPower;
  const structured = getStructuredCombatPower(
    state,
    player.id,
    cards,
    aggregate,
    Number(player.flags.opponentAbilityTotalPowerReductionProtectedRound ?? -1) === state.round,
  );
  const handForcesZero = player.hand.some((instanceId) => {
    const instance = state.cards[instanceId];
    return Boolean(instance?.combatHandRule?.setControllerCombatPowerToZero);
  });
  return handForcesZero ? 0 : structured;
}

/** Final aggregate combat power after symmetric linked-owner maximum rules. */
export function calculateCombatPower(state: GameState, player: PlayerState, cards: Record<string, CardDefinition>, locationId?: string): number {
  const permanentFixed = player.flags.combatPowerFixedPermanent;
  if (permanentFixed !== undefined) {
    const value = Number(permanentFixed);
    if (!Number.isInteger(value)) throw new Error("COMBAT_POWER_FIXED_PERMANENT_INVALID");
    return Math.max(0, value);
  }
  const own = calculateCombatPowerRaw(state, player, cards, locationId);
  const battleLocation = locationId ?? player.locationId;
  if (battleLocation !== "mountain" && battleLocation !== "city") return Math.max(0, own);
  const linkedPlayerIds = new Set<string>();
  for (const instance of Object.values(state.cards)) {
    if (!instance.active || instance.face !== "up" || instance.zone !== "attack" || !instance.ownerPlayerId || !instance.controllerPlayerId
      || instance.ownerPlayerId === instance.controllerPlayerId) continue;
    const definition = cards[instance.definitionId];
    if (definition?.linkedOwnerCombatPowerMaximum !== true) continue;
    const owner = state.players[instance.ownerPlayerId];
    const controller = state.players[instance.controllerPlayerId];
    if (!owner || !controller || owner.eliminated || controller.eliminated
      || owner.locationId !== battleLocation || controller.locationId !== battleLocation) continue;
    if (player.id === owner.id) linkedPlayerIds.add(controller.id);
    else if (player.id === controller.id) linkedPlayerIds.add(owner.id);
  }
  let resolved = own;
  for (const linkedPlayerId of linkedPlayerIds) {
    const linked = state.players[linkedPlayerId];
    if (linked) resolved = Math.max(resolved, calculateCombatPowerRaw(state, linked, cards, battleLocation));
  }
  return Math.max(0, resolved);
}

/**
 * Calculates one active attack's contribution using the same rules as the
 * aggregate combat-power calculation.  The per-card value is included in
 * combat snapshots so post-power abilities can compare individual attacks
 * without reparsing card text or relying on the UI.
 */
export function calculateCombatCardPower(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  cards: Record<string, CardDefinition>,
  locationId?: string,
): number {
  const instance = state.cards[instanceId];
  if (!instance || !instance.active || instance.face !== "up") return 0;
  const definition = cards[instance.definitionId];
  const powerAlterationApplications = definition
    ? getServantAttackPowerAlterationApplications(state, player, definition.id, cards)
    : 1;
  const attributes = definition ? getCombatCardAttributes(state, player, instanceId, cards) : [];
  const reductionProtectedByCard = cardPreventsPowerReduction(state, player, instance, attributes);
  const magicReductionProtected = attributes.includes("魔术")
    && Number(player.flags.magicPowerReductionProtectedRound ?? -1) === state.round;
  const opponentReductionProtected = (attributes.includes("魔术")
    && Number(player.flags.opponentAbilityMagicPowerReductionProtectedRound ?? -1) === state.round)
    || cardPreventsOpponentPowerReduction(state, player, instance, attributes);
  const reductionProtected = reductionProtectedByCard || magicReductionProtected;
  const forbiddenAttributes = (state.modeState.situationRestrictions as { forbiddenAttributes?: string[] } | undefined)?.forbiddenAttributes ?? [];
  // Fiore's confirmed passive suppresses the printed power of her skill cards
  // when the active situation forbids Noble Phantasms; no modifier can raise it.
  if (!isPlayerUnaffectedBySituation(state, player.id, cards)
    && player.flags.fioreGentle && definition?.isSkill && forbiddenAttributes.includes("宝具")) return 0;
  const printedBasePower = definition && instance
    ? applyPhysicalBasePowerMultiplier(
      state,
      instance,
      definition,
      getPrintedCardBasePower(state, player, definition) + getTopAttachmentInheritedPower(state, player, instance, cards) * powerAlterationApplications,
      powerAlterationApplications,
    )
    : 0;
  if (definition?.powerImmutable === true) return getPrintedCardBasePower(state, player, definition);
  const ignoreNeutralBoard = ignoresNeutralBoardCombatEffects(state, player.id);
  const situation = ignoreNeutralBoard || isPlayerUnaffectedBySituation(state, player.id, cards)
    || isStructuredSituationBenefitForbidden(state, player.id, cards, "power") ? undefined : getSituationCombatPower(state, locationId);
  const situationPowerMultiplier = getStructuredSituationPowerMultiplier(state, player.id, cards, getBoardPowerModifierMultiplier(state, locationId ?? player.locationId, player.id, "situation"));
  const situationAdd = situation?.cardAddByAttribute
    ? attributes.reduce((total, attribute) => total + Number(situation.cardAddByAttribute?.[attribute as keyof typeof situation.cardAddByAttribute] ?? 0), 0) * situationPowerMultiplier
    : 0;
  const eventLocations = ignoreNeutralBoard ? [] : playerUsesVisitedLocationEvents(state, player, cards)
    ? [...new Set([locationId ?? player.locationId, ...(player.locationsPassedThisRound ?? [])])]
      .filter((candidate): candidate is "mountain" | "city" => candidate === "mountain" || candidate === "city")
    : [locationId ?? player.locationId].filter((candidate): candidate is "mountain" | "city" => candidate === "mountain" || candidate === "city");
  const rawEventAdd = eventLocations.reduce((total, eventLocationId) => total
    + getCurrentEventCardPowerAdd(state, player, instanceId, eventLocationId, attributes, printedBasePower, cards)
      * getBoardPowerModifierMultiplier(state, eventLocationId, player.id, "event"), 0);
  const eventAdd = applyEventObjectiveNumericEffectMultiplier(state, player.id, cards, "power", rawEventAdd);
  const positiveBoardPowerMultiplier = getPositiveSituationEventPowerMultiplier(state, player, cards);
  const multipliedSituationAdd = situationAdd > 0 ? situationAdd * positiveBoardPowerMultiplier : situationAdd;
  const multipliedEventAdd = eventAdd > 0 ? eventAdd * positiveBoardPowerMultiplier : eventAdd;
  const boardPowerIncreaseBlocked = opponentSharedBasicTypeBlocksBoardPowerIncrease(state, player, attributes, cards, locationId ?? player.locationId);
  const effectiveSituationAdd = boardPowerIncreaseBlocked ? Math.min(0, multipliedSituationAdd) : multipliedSituationAdd;
  const effectiveEventAdd = boardPowerIncreaseBlocked ? Math.min(0, multipliedEventAdd) : multipliedEventAdd;
  const chaosPhantomBonus = player.flags.chaosPhantomRound === state.round && attributes.includes("宝具") ? 2 : 0;
  const attachmentPowerBonusMultiplier = getCardRuleAttachmentPowerBonusMultiplier(state, player, instance);
  const attachedPower = getAttachedCards(state, instanceId).reduce((total, attached) => {
    const attachedDefinition = cards[attached.definitionId];
    return total + (attachedDefinition?.tags?.includes("attached-power-plus-1") ? attachmentPowerBonusMultiplier : 0);
  }, 0);
  const dreamBerserkerBonus = player.attack.some((candidateId) => candidateId !== instanceId
    && state.cards[candidateId]?.active && state.cards[candidateId]?.face === "up"
    && cards[state.cards[candidateId].definitionId]?.tags?.includes("dream-summon-berserker")) ? 1 : 0;
  const basicCardAuraBonus = definition?.basic === true
    ? getBasicCardPowerAuraBonus(state, player, instanceId, cards)
    : 0;
  const otherAttackPowerAuraBonus = getOtherAttackPowerAuraBonus(state, player, instanceId, cards);
  const basicSpecialPowerBonus = definition?.basic === true && attributes.includes("特殊")
    ? Number(player.flags.basicSpecialAttackPowerBonus ?? 0)
    : 0;
  if (!Number.isInteger(basicSpecialPowerBonus)) throw new Error("BASIC_SPECIAL_POWER_BONUS_INVALID");
  const rinJewelSwordBonus = getRinJewelSwordPowerBonus(state, player, definition);
  const situationNoblePhantasmReplacementBonus = definition
    ? getSituationNoblePhantasmReplacementPowerBonus(state, player, instance, definition, cards)
    : 0;
  const masteryAdjustedBasePower = definition && hasMusashiNitenIchiryu(state, player)
    ? applyMusashiBasePowerRule(player, definition, printedBasePower, getMusashiMastery(player))
    : printedBasePower;
  const structuredBasePower = definition ? getStructuredCardBasePower(
    state,
    player.id,
    instance,
    definition,
    cards,
    masteryAdjustedBasePower,
    reductionProtected,
    opponentReductionProtected,
    powerAlterationApplications,
  ) : 0;
  const resourcePowerBonus = (player.resourcePowerRules ?? []).reduce((total, rule) => {
    if (!Number.isInteger(rule.perUnit)) throw new Error("RESOURCE_POWER_RULE_INVALID");
    if (rule.basicOnly === true && definition?.basic !== true) return total;
    if ((rule.attributesAny ?? []).length > 0 && !rule.attributesAny!.some((attribute) => attributes.includes(attribute))) return total;
    const sourceLive = Object.values(state.cards).some((candidate) => {
      if (candidate.ownerPlayerId !== player.id || candidate.zone === "removed") return false;
      const sourceDefinition = cards[candidate.definitionId];
      return candidate.definitionId === rule.sourceId || sourceDefinition?.linkedSkillId === rule.sourceId;
    });
    if (!sourceLive) return total;
    return total + getCustomResource(player, rule.resourceId) * rule.perUnit;
  }, 0);
  const cardRulePowerAdd = getCardRulePowerAdd(state, player, instance);
  const untilClosePowerBonus = Number(instance.untilClosePowerBonus ?? 0);
  if (!Number.isFinite(untilClosePowerBonus) || untilClosePowerBonus < 0) throw new Error("UNTIL_CLOSE_POWER_BONUS_INVALID");
  const uniqueTypeRate = getCardRuleUniqueTypePowerRate(state, player, instance);
  const uniqueTypePower = uniqueTypeRate === 0 ? 0 : countUniqueControlledAttackTypeSets(state, player, cards) * uniqueTypeRate;
  const repeatedAdd = (value: number): number => value * powerAlterationApplications;
  const printed = structuredBasePower
    + repeatedAdd(resourcePowerBonus)
    + repeatedAdd(cardRulePowerAdd)
    + repeatedAdd(untilClosePowerBonus)
    + repeatedAdd(uniqueTypePower)
    + repeatedAdd(attachedPower)
    + repeatedAdd(dreamBerserkerBonus)
    + repeatedAdd(reductionProtected ? Math.max(0, effectiveSituationAdd) : effectiveSituationAdd)
    + repeatedAdd(reductionProtected ? Math.max(0, effectiveEventAdd) : effectiveEventAdd)
    + repeatedAdd(chaosPhantomBonus)
    + repeatedAdd(basicCardAuraBonus)
    + repeatedAdd(otherAttackPowerAuraBonus)
    + repeatedAdd(basicSpecialPowerBonus)
    + repeatedAdd(rinJewelSwordBonus)
    + repeatedAdd(situationNoblePhantasmReplacementBonus);
  if (player.flags.davinciZeroStrengthRound === state.round && attributes.includes("力量")) return 0;
  const structuredPower = getStructuredCardPower(
    state,
    player.id,
    instance,
    definition,
    cards,
    printed,
    reductionProtected,
    opponentReductionProtected,
    powerAlterationApplications,
  );
  const manaGainReplacementPower = player.flags.manaGainReplacementSourceInstanceId === instanceId
    ? Number(player.flags.manaGainReplacementPower ?? 0)
    : 0;
  if (!Number.isInteger(manaGainReplacementPower) || manaGainReplacementPower < 0) throw new Error("MANA_GAIN_REPLACEMENT_POWER_INVALID");
  const modifiers = (instance.powerModifiers ?? []).filter((modifier) => {
    if (!opponentReductionProtected) return true;
    if (modifier.kind === "add" && modifier.value >= 0) return true;
    if (modifier.kind === "set" && modifier.value >= structuredPower) return true;
    if (modifier.kind === "multiply" && modifier.value >= 1) return true;
    const source = cards[modifier.sourceId] ?? cards[`card.skill.${modifier.sourceId}`];
    if (!source) return true;
    if (source.ownerDefinitionId === player.masterId || source.ownerDefinitionId === player.servantId) return true;
    return source.ownerType !== "master" && source.ownerType !== "servant" && source.isSkill !== true;
  });
  const added = modifiers.filter((modifier) => modifier.kind === "add")
    .reduce((total, modifier) => total + repeatedAdd(reductionProtected ? Math.max(0, modifier.value) : modifier.value), structuredPower + repeatedAdd(manaGainReplacementPower));
  const setters = modifiers.filter((modifier) => modifier.kind === "set");
  const setValue = setters.length === 0 ? added : setters[setters.length - 1].value;
  const afterSet = setters.length === 0 ? added : reductionProtected ? Math.max(added, setValue) : setValue;
  const finalPower = modifiers.filter((modifier) => modifier.kind === "multiply").reduce((value, modifier) => {
    if (!Number.isFinite(modifier.value) || modifier.value < 0) throw new Error("CARD_POWER_MULTIPLIER_INVALID");
    const multiplied = value * Math.pow(modifier.value, powerAlterationApplications);
    if (modifier.rounding === "floor") return Math.floor(multiplied);
    if (modifier.rounding === "ceil") return Math.ceil(multiplied);
    if (modifier.rounding === "round") return Math.round(multiplied);
    return multiplied;
  }, afterSet);
  const printedCeilingBase = definition ? getPrintedCardBasePower(state, player, definition) : 0;
  const ceiling = getAttackPrintedBaseCeiling(state, player.id, instanceId, locationId ?? player.locationId, printedCeilingBase);
  const ruleCeiling = getCardRulePowerCeiling(state, player, instance);
  const ceilings = [ceiling, ruleCeiling].filter((value): value is number => value !== undefined);
  const resolved = ceilings.length === 0 ? finalPower : Math.min(finalPower, ...ceilings);
  return Math.max(0, resolved);
}

/**
 * Evaluate one owned hand card exactly as if it were a face-up active attack
 * in the controller's current fight, without mutating authoritative state.
 * This is used by effects that reference the power a discarded card "would
 * have" in combat; all structured/card modifiers continue to apply normally.
 */
export function calculateHypotheticalCombatCardPower(
  state: GameState,
  playerId: string,
  instanceId: string,
  cards: Record<string, CardDefinition>,
  locationId?: string,
): number {
  const draft = structuredClone(state) as GameState;
  const player = draft.players[playerId];
  const instance = draft.cards[instanceId];
  if (!player || player.eliminated || !instance || instance.ownerPlayerId !== playerId || !player.hand.includes(instanceId)) {
    throw new Error("HYPOTHETICAL_COMBAT_CARD_INVALID");
  }
  if (!cards[instance.definitionId]) throw new Error("CARD_DEFINITION_NOT_FOUND");
  player.hand = player.hand.filter((id) => id !== instanceId);
  if (!player.attack.includes(instanceId)) player.attack.push(instanceId);
  instance.zone = "attack";
  instance.controllerPlayerId = playerId;
  instance.face = "up";
  instance.active = true;
  return calculateCombatCardPower(draft, player, instanceId, cards, locationId ?? player.locationId ?? undefined);
}

const SHARED_BASIC_TYPE_BOARD_POWER_BLOCK_TAG = "opponent-shared-basic-type-no-situation-event-increase";

function passiveCardSourceIsLive(instance: GameState["cards"][string]): boolean {
  if (instance.zone === "hand" || instance.zone === "master-skills" || instance.zone === "servant-skills") return true;
  return instance.zone === "attack" && instance.active && instance.face === "up";
}

/** Generic passive source: event-card power can be read from every battlefield visited this round. */
function playerUsesVisitedLocationEvents(state: GameState, player: PlayerState, cards: Record<string, CardDefinition>): boolean {
  return [...new Set([...player.masterSkills, ...player.servantSkills, ...player.hand, ...player.attack])].some((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? cards[instance.definitionId] : undefined;
    return Boolean(instance && instance.ownerPlayerId === player.id && passiveCardSourceIsLive(instance)
      && definition?.tags?.includes("event-power-from-visited-locations"));
  });
}

/**
 * Generic Passive/Combat rule: if an opponent owns a live passive source with
 * this tag, attacks sharing a current type with one of that opponent's active
 * basic attacks cannot receive positive Situation/Event power. Negative board
 * modifiers are preserved because the card only forbids increases.
 */
function opponentSharedBasicTypeBlocksBoardPowerIncrease(
  state: GameState,
  targetPlayer: PlayerState,
  targetAttributes: string[],
  cards: Record<string, CardDefinition>,
  locationId: string | null | undefined,
): boolean {
  if (locationId !== "mountain" && locationId !== "city") return false;
  for (const sourcePlayer of Object.values(state.players)) {
    if (sourcePlayer.id === targetPlayer.id || sourcePlayer.eliminated || sourcePlayer.locationId !== locationId) continue;
    const passiveIds = [...new Set([...sourcePlayer.masterSkills, ...sourcePlayer.servantSkills, ...sourcePlayer.hand, ...sourcePlayer.attack])];
    const hasSource = passiveIds.some((instanceId) => {
      const instance = state.cards[instanceId];
      const definition = instance ? cards[instance.definitionId] : undefined;
      return Boolean(instance && definition?.tags?.includes(SHARED_BASIC_TYPE_BOARD_POWER_BLOCK_TAG) && passiveCardSourceIsLive(instance));
    });
    if (!hasSource) continue;
    for (const instanceId of sourcePlayer.attack) {
      const instance = state.cards[instanceId];
      const definition = instance ? cards[instance.definitionId] : undefined;
      if (!instance?.active || instance.face !== "up" || definition?.basic !== true) continue;
      const basicAttributes = getCombatCardAttributes(state, sourcePlayer, instanceId, cards);
      if (basicAttributes.some((attribute) => targetAttributes.includes(attribute))) return true;
    }
  }
  return false;
}

function getPositiveSituationEventPowerMultiplier(
  state: GameState,
  player: PlayerState,
  cards: Record<string, CardDefinition>,
): number {
  const active = player.attack.some((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? cards[instance.definitionId] : undefined;
    return Boolean(instance?.active && instance.face === "up" && instance.zone === "attack"
      && definition?.tags?.includes("positive-situation-event-power-x2-climax-x3"));
  });
  if (!active) return 1;
  return state.modeState.currentSituationClimax === true ? 3 : 2;
}

function getCurrentEventCardPowerAdd(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  locationId: string | null | undefined,
  attributes: string[],
  printedBasePower: number,
  cards: Record<string, CardDefinition>,
): number {
  if (locationId !== "mountain" && locationId !== "city") return 0;
  return (state.board.currentEvents[locationId] ?? []).reduce((total, eventId) => {
    const event = cards[eventId] as (CardDefinition & { combatPower?: {
      cardAddByAttribute?: Partial<Record<string, number>>;
      cardAddByAttributeWhenPrintedBasePowerAtLeast?: { min: number; addByAttribute: Partial<Record<string, number>> };
    } }) | undefined;
    const add = replaceAttributeMapForColor(state, eventId, event?.combatPower?.cardAddByAttribute);
    let value = add ? attributes.reduce((sum, attribute) => sum + Number(add[attribute] ?? 0), 0) : 0;
    const gated = event?.combatPower?.cardAddByAttributeWhenPrintedBasePowerAtLeast;
    if (gated) {
      if (!Number.isFinite(gated.min)) throw new Error("EVENT_POWER_THRESHOLD_INVALID");
      const gatedMap = replaceAttributeMapForColor(state, eventId, gated.addByAttribute);
      if (printedBasePower >= gated.min) value += attributes.reduce((sum, attribute) => sum + Number(gatedMap?.[attribute] ?? 0), 0);
    }
    value += getIndiaObjectiveCardPowerAdd(state, player, instanceId, eventId, attributes, cards);
    const chinaMultiplier = getChinesePositiveBoardPowerMultiplier(state, locationId, cards);
    return total + (value > 0 ? value * chinaMultiplier : value);
  }, 0);
}

function countUniqueControlledAttackTypeSets(
  state: GameState,
  player: PlayerState,
  cards: Record<string, CardDefinition>,
): number {
  const signatures = getActiveCombatCardIds(state, player).map((instanceId) =>
    [...getCombatCardAttributes(state, player, instanceId, cards)].sort().join("|"));
  const counts = new Map<string, number>();
  for (const signature of signatures) counts.set(signature, Number(counts.get(signature) ?? 0) + 1);
  return signatures.filter((signature) => counts.get(signature) === 1).length;
}

function getBasicCardPowerAuraBonus(
  state: GameState,
  player: PlayerState,
  sourceInstanceId: string,
  cards: Record<string, CardDefinition>,
): number {
  return getActiveCombatCardIds(state, player).reduce((total, candidateId) => {
    if (candidateId === sourceInstanceId) return total;
    const candidate = state.cards[candidateId];
    const candidateDefinition = cards[candidate?.definitionId ?? ""];
    const filter = candidateDefinition?.basicCardPowerBonusAttributes ?? [];
    if (filter.length > 0) {
      const sourceAttributes = getCombatCardAttributes(state, player, sourceInstanceId, cards);
      if (!sourceAttributes.some((attribute) => filter.includes(attribute as never))) return total;
    }
    const flagCondition = candidateDefinition?.basicCardPowerBonusCondition?.playerFlagEquals;
    if (flagCondition && player.flags[flagCondition.key] !== flagCondition.value) return total;
    return total + Number(candidateDefinition?.basicCardPowerBonus ?? 0);
  }, 0);
}

function getOtherAttackPowerAuraBonus(
  state: GameState,
  player: PlayerState,
  sourceInstanceId: string,
  cards: Record<string, CardDefinition>,
): number {
  return getActiveCombatCardIds(state, player).reduce((total, candidateId) => {
    if (candidateId === sourceInstanceId) return total;
    const candidate = state.cards[candidateId];
    const candidateDefinition = cards[candidate?.definitionId ?? ""];
    const bonus = Number(candidateDefinition?.activeOtherAttackPowerBonus ?? 0);
    if (!Number.isInteger(bonus)) throw new Error("OTHER_ATTACK_POWER_AURA_INVALID");
    return total + bonus;
  }, 0);
}

function getRinJewelSwordPowerBonus(state: GameState, player: PlayerState, definition: CardDefinition | undefined): number {
  if (!definition || player.masterId !== "master.rin") return 0;
  const hasJewelSword = [...player.masterSkills, ...player.attack].some((instanceId) => {
    const instance = state.cards[instanceId];
    if (!instance || instance.ownerPlayerId !== player.id || instance.zone === "removed") return false;
    return instance.definitionId === "master.rin.skill.ascension" || instance.definitionId === "card.skill.master.rin.skill.ascension";
  });
  if (!hasJewelSword) return 0;
  const attributes = getCardAttributes(definition);
  if (definition.basic === true && attributes.includes("魔术")) return 2;
  return definition.id === "card.card-yinqi" ? 2 : 0;
}

function getSituationCombatPower(state: GameState, locationId?: string): {
  cardAddByAttribute?: Partial<Record<string, number>>;
  aggregateAddBySharedAttribute?: number;
  locations?: string[];
} | undefined {
  const restrictions = state.modeState.situationRestrictions as { combatPower?: { cardAddByAttribute?: Partial<Record<string, number>>; aggregateAddBySharedAttribute?: number; locations?: string[] } } | undefined;
  const combatPower = restrictions?.combatPower;
  if (!combatPower || (locationId && combatPower.locations?.length && !combatPower.locations.includes(locationId))) return undefined;
  const situationId = state.board.activeSituations[0];
  return situationId
    ? { ...combatPower, cardAddByAttribute: replaceAttributeMapForColor(state, situationId, combatPower.cardAddByAttribute) }
    : combatPower;
}

function hasSharedActiveAttribute(state: GameState, player: PlayerState, cards: Record<string, CardDefinition>): boolean {
  const active = getActiveCombatCardIds(state, player);
  if (active.length < 2) return false;
  let shared: Set<string> | null = null;
  for (const instanceId of active) {
    const instance = state.cards[instanceId];
    const definition = cards[instance?.definitionId ?? ""];
    const attributes = new Set(definition && instance ? getCardInstanceAttributes(instance, definition, state, cards) : []);
    shared = shared === null ? attributes : new Set([...shared].filter((attribute) => attributes.has(attribute)));
  }
  return Boolean(shared && shared.size > 0);
}

export function collectCombatAttributes(state: GameState, player: PlayerState, cards: Record<string, CardDefinition>): string[] {
  return [...new Set(getActiveCombatCardIds(state, player)
    .flatMap((instanceId) => getCombatCardAttributes(state, player, instanceId, cards)))];
}

/** Runtime combat attributes after instance transformations and aura replacements. */
export function getCombatCardAttributes(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  cards: Record<string, CardDefinition>,
): string[] {
  const instance = state.cards[instanceId];
  const definition = cards[instance?.definitionId ?? ""];
  if (!instance || !definition) return [];
  const berserkerSource = player.attack.some((candidateId) => candidateId !== instanceId
    && state.cards[candidateId]?.active && state.cards[candidateId]?.face === "up"
    && cards[state.cards[candidateId].definitionId]?.tags?.includes("dream-summon-berserker"));
  const base = berserkerSource ? ["力量"] : getCardInstanceAttributes(instance, definition, state, cards);
  return [...new Set([...base, ...getCardRuleCombatAttributeGrants(state, player, instance)])];
}
