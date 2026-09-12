import type { CardInstance, CardRuleModifier, GameState, PlayerState } from "../domain/state/types.ts";
import { getCardAttributes, normalizeCardAttributes, type CardDefinition } from "./content-types.ts";
import { isCardTextSuppressed } from "./card-text.ts";
import type { UsageLimit } from "./usage-limits.ts";

function isSourceActive(state: GameState, player: PlayerState, modifier: CardRuleModifier): boolean {
  if (modifier.duration !== "while-source-active" && modifier.duration !== "while-source-present") return true;
  if (!modifier.sourceInstanceId) return false;
  const source = state.cards[modifier.sourceInstanceId];
  if (isCardTextSuppressed(state, source)) return false;
  const controlledHere = Boolean(source && (source.ownerPlayerId === player.id || source.controllerPlayerId === player.id));
  if (modifier.duration === "while-source-present") return Boolean(controlledHere && source?.zone !== "removed" && source?.zone !== "discard");
  return Boolean(controlledHere && source?.active && source.zone === "attack");
}

export function getApplicableCardRuleModifiers(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
): CardRuleModifier[] {
  return (player.cardRuleModifiers ?? []).filter((modifier) => {
    if (!modifier.targetDefinitionIds.includes(instance.definitionId)
      || (modifier.targetInstanceIds && !modifier.targetInstanceIds.includes(instance.instanceId))
      || !isSourceActive(state, player, modifier)) return false;
    const status = modifier.condition?.allOtherBattlefieldPlayersHaveStatus;
    if (status) {
      const locationId = player.locationId;
      if (locationId !== "mountain" && locationId !== "city") return false;
      if ((state.board.locations[locationId] ?? []).some((playerId) => playerId !== player.id
        && !state.players[playerId]?.eliminated && !state.players[playerId]?.statuses.includes(status))) return false;
    }
    if (modifier.condition?.sourceControllerSameBattlefield === true) {
      const source = modifier.sourceInstanceId ? state.cards[modifier.sourceInstanceId] : undefined;
      const sourcePlayer = source?.controllerPlayerId ? state.players[source.controllerPlayerId] : undefined;
      const locationId = player.locationId;
      if (!sourcePlayer || (locationId !== "mountain" && locationId !== "city") || sourcePlayer.locationId !== locationId) return false;
    }
    if (modifier.condition?.targetZoneAttack === true && instance.zone !== "attack") return false;
    if (modifier.condition?.targetZoneHand === true && instance.zone !== "hand") return false;
    if (modifier.condition?.targetActiveFaceUp === true && (!instance.active || instance.face !== "up")) return false;
    if (modifier.condition?.sourceActive === true) {
      const source = modifier.sourceInstanceId ? state.cards[modifier.sourceInstanceId] : undefined;
      if (!source || source.zone !== "attack" || source.active !== true || source.face !== "up" || isCardTextSuppressed(state, source)) return false;
    }
    const opponentControl = modifier.condition?.anyOpponentAtLocationControlsDefinitionId;
    if (opponentControl) {
      const found = Object.values(state.players).some((candidate) => candidate.id !== player.id && !candidate.eliminated
        && candidate.locationId === opponentControl.locationId
        && candidate.attack.some((candidateId) => {
          const card = state.cards[candidateId];
          return Boolean(card && card.controllerPlayerId === candidate.id && card.zone === "attack" && card.active && card.face === "up"
            && card.definitionId === opponentControl.definitionId);
        }));
      if (!found) return false;
    }
    return true;
  });
}

export function cardHasEightManaWaiver(state: GameState, player: PlayerState, instance: CardInstance): boolean {
  return getApplicableCardRuleModifiers(state, player, instance).some((modifier) => modifier.waiveEightMana === true);
}

export function cardIgnoresUsageLimit(state: GameState, player: PlayerState, instance: CardInstance): boolean {
  return getApplicableCardRuleModifiers(state, player, instance).some((modifier) => modifier.ignoreUsageLimit === true);
}

/** Resolve a source-bound play-usage limit override for one physical card. */
export function getCardRuleUsageLimitOverride(state: GameState, player: PlayerState, instance: CardInstance): UsageLimit | undefined {
  const limits = [...new Set(getApplicableCardRuleModifiers(state, player, instance)
    .map((modifier) => modifier.usageLimitOverride)
    .filter((limit): limit is UsageLimit => typeof limit === "string"))];
  if (limits.length > 1) throw new Error("CARD_USAGE_LIMIT_OVERRIDE_CONFLICT");
  return limits[0];
}

export function cardHasResidualGrant(state: GameState, player: PlayerState, instance: CardInstance): boolean {
  return getApplicableCardRuleModifiers(state, player, instance).some((modifier) => modifier.grantResidual === true);
}

export function cardHasStandardAppendGrant(state: GameState, player: PlayerState, instance: CardInstance): boolean {
  return getApplicableCardRuleModifiers(state, player, instance).some((modifier) => modifier.grantStandardAppend === true);
}

export function cardPlayForbiddenByModifier(state: GameState, player: PlayerState, instance: CardInstance): boolean {
  return getApplicableCardRuleModifiers(state, player, instance).some((modifier) => modifier.forbidPlay === true);
}

export function getCardResidualUntilRound(state: GameState, player: PlayerState, instance: CardInstance): number | undefined {
  const offsets = getApplicableCardRuleModifiers(state, player, instance)
    .filter((modifier) => modifier.grantResidual === true && Number.isInteger(modifier.residualUntilRoundOffset))
    .map((modifier) => Number(modifier.residualUntilRoundOffset))
    .filter((offset) => offset >= 0);
  return offsets.length > 0 ? state.round + Math.max(...offsets) : undefined;
}

export function cardAllowsFaceDownPlay(state: GameState, player: PlayerState, instance: CardInstance): boolean {
  return getApplicableCardRuleModifiers(state, player, instance).some((modifier) => modifier.allowFaceDownPlay === true);
}

function protectionScopeMatches(modifier: CardRuleModifier, attributes: readonly string[]): boolean {
  const scope = modifier.protectionAttributes ?? [];
  return scope.length === 0 || scope.some((attribute) => attributes.includes(attribute));
}

function resolveProtectionAttributes(
  instance: CardInstance,
  definition: CardDefinition | undefined,
  modifiers: CardRuleModifier[],
): string[] {
  if (!definition) return [];
  const base = instance.attributeOverrides !== undefined
    ? normalizeCardAttributes(instance.attributeOverrides)
    : getCardAttributes(definition);
  const replacements = modifiers
    .map((modifier) => modifier.replaceAttributes)
    .filter((attributes): attributes is string[] => Array.isArray(attributes));
  const resolved = new Set(replacements.length > 0 ? normalizeCardAttributes(replacements[replacements.length - 1]) : base);
  for (const modifier of modifiers) for (const attribute of modifier.grantAttributes ?? []) resolved.add(attribute);
  for (const modifier of modifiers) {
    if (!modifier.retainAttributes) continue;
    const retained = new Set(normalizeCardAttributes(modifier.retainAttributes));
    for (const attribute of [...resolved]) if (!retained.has(attribute as never)) resolved.delete(attribute);
  }
  return normalizeCardAttributes([...resolved]);
}

export function cardPreventsPowerReduction(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
  attributes: readonly string[] = [],
): boolean {
  return getApplicableCardRuleModifiers(state, player, instance)
    .some((modifier) => modifier.preventPowerReduction === true && protectionScopeMatches(modifier, attributes));
}

export function cardPreventsOpponentPowerReduction(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
  attributes: readonly string[],
): boolean {
  return getApplicableCardRuleModifiers(state, player, instance)
    .some((modifier) => modifier.preventOpponentPowerReduction === true && protectionScopeMatches(modifier, attributes));
}

export function cardPreventsOpponentClose(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
  definition?: CardDefinition,
): boolean {
  const modifiers = getApplicableCardRuleModifiers(state, player, instance);
  const attributes = resolveProtectionAttributes(instance, definition, modifiers);
  return modifiers.some((modifier) => modifier.preventOpponentClose === true && protectionScopeMatches(modifier, attributes));
}

/** Source ids whose live modifiers postpone this card's close until combat end. */
export function getCardCloseDeferralSourceIds(state: GameState, player: PlayerState, instance: CardInstance): string[] {
  return [...new Set(getApplicableCardRuleModifiers(state, player, instance)
    .filter((modifier) => modifier.deferCloseUntilCombatEnd === true)
    .map((modifier) => modifier.sourceId)
    .filter((sourceId) => typeof sourceId === "string" && sourceId.length > 0))];
}

export function getCardRuleCombatAttributeGrants(state: GameState, player: PlayerState, instance: CardInstance): string[] {
  return [...new Set(getApplicableCardRuleModifiers(state, player, instance)
    .flatMap((modifier) => modifier.grantCombatAttributes ?? []))];
}

export function getCardRuleAttachmentPowerBonusMultiplier(state: GameState, player: PlayerState, instance: CardInstance): number {
  return getApplicableCardRuleModifiers(state, player, instance).reduce((multiplier, modifier) => {
    const value = Number(modifier.attachmentPowerBonusMultiplier ?? 1);
    if (!Number.isFinite(value) || value < 0) throw new Error("CARD_RULE_ATTACHMENT_POWER_MULTIPLIER_INVALID");
    return multiplier * value;
  }, 1);
}

export function getCardRulePowerAdd(state: GameState, player: PlayerState, instance: CardInstance): number {
  return getApplicableCardRuleModifiers(state, player, instance).reduce((sum, modifier) => {
    const value = Number(modifier.powerAdd ?? 0);
    if (!Number.isFinite(value)) throw new Error("CARD_RULE_POWER_ADD_INVALID");
    const rate = Number(modifier.powerAddPerDefeatedOrEliminatedOpponent ?? 0);
    if (!Number.isFinite(rate)) throw new Error("CARD_RULE_DEFEATED_OPPONENT_POWER_INVALID");
    const defeatedOrEliminated = rate === 0 ? 0 : Object.values(state.players)
      .filter((candidate) => candidate.id !== player.id && (candidate.defeated || candidate.eliminated)).length;
    return sum + value + rate * defeatedOrEliminated;
  }, 0);
}

/** Strictest active final-power ceiling for this physical card, if any. */
export function getCardRulePowerCeiling(state: GameState, player: PlayerState, instance: CardInstance): number | undefined {
  const values = getApplicableCardRuleModifiers(state, player, instance)
    .map((modifier) => modifier.powerCeiling)
    .filter((value): value is number => value !== undefined);
  if (values.some((value) => !Number.isFinite(value))) throw new Error("CARD_RULE_POWER_CEILING_INVALID");
  return values.length > 0 ? Math.min(...values) : undefined;
}

export function getCardRuleUniqueTypePowerRate(state: GameState, player: PlayerState, instance: CardInstance): number {
  return getApplicableCardRuleModifiers(state, player, instance).reduce((sum, modifier) => {
    const value = Number(modifier.powerAddPerUniqueControlledAttackTypeSet ?? 0);
    if (!Number.isFinite(value)) throw new Error("CARD_RULE_UNIQUE_TYPE_POWER_INVALID");
    return sum + value;
  }, 0);
}

export function cardAllowsActionAbilityInCombat(state: GameState, player: PlayerState, instance: CardInstance): boolean {
  return getApplicableCardRuleModifiers(state, player, instance).some((modifier) => modifier.allowActionAbilityInCombat === true);
}

export function getActionAbilityCombatLimit(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
): "once-per-round" | "twice-per-round" | undefined {
  const limits = getApplicableCardRuleModifiers(state, player, instance)
    .map((modifier) => modifier.actionAbilityCombatLimit)
    .filter((limit): limit is "once-per-round" | "twice-per-round" => Boolean(limit));
  if (limits.includes("twice-per-round")) return "twice-per-round";
  return limits.includes("once-per-round") ? "once-per-round" : undefined;
}

/** Continuous controller-wide permission supplied by an active face-up attack card. */
export function playerAllowsActionAbilitiesInCombat(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): boolean {
  return player.attack.some((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    return Boolean(instance?.active && instance.face === "up" && instance.zone === "attack"
      && (instance.ownerPlayerId === player.id || instance.controllerPlayerId === player.id)
      && definition?.tags?.includes("controller-action-abilities-in-combat"));
  });
}

export function getMandatoryActionAbilityInCombatIds(state: GameState, player: PlayerState, instance: CardInstance): string[] {
  return [...new Set(getApplicableCardRuleModifiers(state, player, instance)
    .flatMap((modifier) => modifier.mandatoryActionAbilityInCombatIds ?? []))];
}

export function getCardRuleNameOverride(state: GameState, player: PlayerState, instance: CardInstance): string | undefined {
  const names = getApplicableCardRuleModifiers(state, player, instance)
    .map((modifier) => modifier.nameOverride)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
  if (new Set(names).size > 1) throw new Error("CARD_RULE_NAME_OVERRIDE_CONFLICT");
  return names[0];
}

export function getCardRuleGrantedAbility(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
  abilityId: string,
): { id: string; phases: import("../domain/state/types.ts").PhaseId[] } | undefined {
  const grants = getApplicableCardRuleModifiers(state, player, instance)
    .flatMap((modifier) => modifier.grantAbilities ?? [])
    .filter((grant) => grant.id === abilityId);
  if (grants.length === 0) return undefined;
  const phases = [...new Set(grants.flatMap((grant) => grant.phases))];
  return { id: abilityId, phases };
}

export function hasPendingMandatoryActionAbilityInCombat(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): boolean {
  return player.attack.some((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!instance || !definition || instance.zone !== "attack" || instance.face !== "up" || !instance.active) return false;
    const pending = getMandatoryActionAbilityInCombatIds(state, player, instance);
    return pending.some((abilityId) => (definition.cardAbilityIds?.includes(abilityId) && definition.phases?.includes("action"))
      || getCardRuleGrantedAbility(state, player, instance, abilityId)?.phases.includes("action"));
  });
}

export function markMandatoryActionAbilityInCombatUsed(player: PlayerState, instanceId: string, abilityId: string): void {
  for (const modifier of player.cardRuleModifiers ?? []) {
    if (!modifier.targetInstanceIds?.includes(instanceId) || !modifier.mandatoryActionAbilityInCombatIds?.includes(abilityId)) continue;
    modifier.mandatoryActionAbilityInCombatIds = modifier.mandatoryActionAbilityInCombatIds.filter((id) => id !== abilityId);
  }
}

export function cardIgnoresSituationRestrictions(state: GameState, player: PlayerState, instance: CardInstance): boolean {
  return getApplicableCardRuleModifiers(state, player, instance).some((modifier) => modifier.ignoreSituationRestrictions === true);
}

export function getEffectiveCardCost(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
  definition: CardDefinition,
): number {
  const modifiers = getApplicableCardRuleModifiers(state, player, instance);
  const overrides = modifiers.map((modifier) => modifier.costOverride).filter((value): value is number => value !== undefined);
  const copiedPrintedCost = instance.temporaryDefinitionCopy?.copiedManaCost;
  const printedBase = Number.isInteger(copiedPrintedCost) && Number(copiedPrintedCost) >= 0 ? Number(copiedPrintedCost) : definition.cost;
  const base = overrides.length ? Math.min(...overrides) : printedBase;
  const added = modifiers.reduce((sum, modifier) => sum + (modifier.costAdd ?? 0), 0);
  return Math.max(0, base + added);
}

/** Additional victory-point cost paid on top of mana when this physical card is played. */
export function getEffectiveVictoryPointPlayCost(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
  definition: CardDefinition,
): number {
  const printed = Number(definition.victoryPointPlayCost ?? 0);
  if (!Number.isInteger(printed) || printed < 0) throw new Error("VICTORY_POINT_PLAY_COST_INVALID");
  const overrides = getApplicableCardRuleModifiers(state, player, instance)
    .map((modifier) => modifier.victoryPointPlayCostOverride)
    .filter((value): value is number => value !== undefined);
  for (const value of overrides) if (!Number.isInteger(value) || value < 0) throw new Error("VICTORY_POINT_PLAY_COST_INVALID");
  return overrides.length > 0 ? Math.min(...overrides) : printed;
}

export function addCardRuleModifier(player: PlayerState, modifier: CardRuleModifier): void {
  if ((player.cardRuleModifiers ?? []).some((existing) => existing.id === modifier.id)) throw new Error("CARD_RULE_MODIFIER_DUPLICATE");
  player.cardRuleModifiers = [...(player.cardRuleModifiers ?? []), structuredClone(modifier)];
}
