import type { GameState, CardZone } from "../domain/state/types.ts";
import type { SkillEffectSpec } from "./skill-effects.ts";
import { applyTemporaryCardDefinitionById, closePlayerCard, createDerivedCardInstance, movePlayerCard, restoreTemporaryCardDefinitionCopy, shufflePlayerDeck, transferPhysicalCardToPlayerZone } from "./decks.ts";
import { StateRandom } from "../match-engine/random.ts";
import { getCardAttributes, normalizeCardAttributes, type CardDefinition } from "./content-types.ts";
import { assertCardCanEnterAttack, getStandardAttackRequirements } from "./card-rules.ts";
import { getCardPlayCost, payManaCost } from "./costs.ts";
import { createUsageRecord, getEffectiveCardUsageLimit, isUsageAvailable, markCardUsage } from "./usage-limits.ts";
import { playerIgnoresDefeat } from "./defeat.ts";
import { assertFaceUpCardPlayAllowed, assertStructuredCardBatchAllowed, getStructuredCardPlayUpgrade, getStructuredStandardAppendRule, getStructuredStandardAttackCardCountRule, isStructuredCardCloseForbidden, recordFaceUpCardPlay } from "./rule-modifiers.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { isFaceDownStandardAttackRequiredBySameLocationRule } from "./location-rules.ts";
import { markSkillRevealedThisRound, revealPlayerTrueName } from "./skill-visibility.ts";
import { cardHasResidualGrant, cardHasStandardAppendGrant, cardIgnoresUsageLimit, getApplicableCardRuleModifiers, getCardResidualUntilRound, getCardRuleUsageLimitOverride, getEffectiveVictoryPointPlayCost } from "./card-rule-modifiers.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import { isCardTextSuppressed } from "./card-text.ts";
import { assertCommandSealCostPayable, payCommandSealCost } from "./command-seals.ts";
import { spendCustomResource } from "./resources.ts";
import { isBattlefieldLocation } from "./battlefield-rules.ts";
import { listRulerSealsControlledBy } from "./ruler-seals.ts";
import { assertServantAttackRegularPairAllowed } from "./servant-attack-partitions.ts";

export interface StandardAttackPlayData {
  cardDataByInstanceId?: Record<string, unknown>;
  cardDataByDefinitionId?: Record<string, unknown>;
  /** Optional external payer selected for an active source-card fractional attack-cost sharing rule. */
  sharedManaPayerPlayerId?: string;
  /** Optional round rule may make one of the additional face-up attacks free. */
  freeOptionalExtraAttackInstanceId?: string;
  /** Explicitly opt into an authored all-face-down alternate attack rule. */
  useFaceDownAttackFollowup?: boolean;
}

function wantsSetAsideInstead(playData: StandardAttackPlayData, instanceId: string, definitionId: string): boolean {
  const data = playData.cardDataByInstanceId?.[instanceId] ?? playData.cardDataByDefinitionId?.[definitionId];
  return isRecord(data) && data.setAsideInstead === true;
}

interface ResolvedVariablePlayAttributeChoice {
  attributes: string[];
  extraMana: number;
}

interface ResolvedPlayAttributeDeclaration {
  attribute: string;
  uniquePerGame: boolean;
}

interface ResolvedActiveSourcePlayAdjustment {
  sourceInstanceId: string;
  choiceId: string;
  costAdd: number;
  powerAdd: number;
  closeSourceAfterPlay: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

interface ResolvedAttackManaShare {
  payerPlayerId: string;
  amount: number;
}

function resolveActiveAttackManaShare(
  state: GameState,
  playerId: string,
  payerPlayerId: string | undefined,
  totalCost: number,
  definitions: Record<string, CardDefinition>,
): ResolvedAttackManaShare | undefined {
  if (!payerPlayerId) return undefined;
  const player = state.players[playerId];
  const payer = state.players[payerPlayerId];
  if (!player || !payer || payer.eliminated || payer.id === player.id) throw new Error("ATTACK_MANA_SHARE_PAYER_INVALID");
  const source = player.attack.map((instanceId) => state.cards[instanceId]).find((instance) => {
    const definition = instance ? definitions[instance.definitionId] : undefined;
    return Boolean(instance && definition?.attackManaShare && instance.active && instance.face === "up"
      && !isCardTextSuppressed(state, instance, definitions));
  });
  const rule = source ? definitions[source.definitionId]?.attackManaShare : undefined;
  if (!rule) throw new Error("ATTACK_MANA_SHARE_NOT_AVAILABLE");
  if (!Number.isInteger(rule.numerator) || rule.numerator <= 0 || !Number.isInteger(rule.denominator) || rule.denominator <= 0 || rule.rounding !== "ceil") {
    throw new Error("ATTACK_MANA_SHARE_RULE_INVALID");
  }
  const minimumMana = Number(rule.minimumPayerMana ?? 0);
  if (!Number.isInteger(minimumMana) || minimumMana < 0 || payer.mana < minimumMana) throw new Error("ATTACK_MANA_SHARE_PAYER_MANA_INSUFFICIENT");
  if (rule.requiredRulerSealSourceId && !listRulerSealsControlledBy(state, payer.id)
    .some((seal) => seal.boundPlayerId === player.id && seal.sourceId === rule.requiredRulerSealSourceId)) {
    throw new Error("ATTACK_MANA_SHARE_RULER_SEAL_REQUIRED");
  }
  return { payerPlayerId, amount: Math.min(totalCost, Math.ceil(totalCost * rule.numerator / rule.denominator)) };
}

function resolveAlternateManaPayer(
  state: GameState,
  playerId: string,
  instanceId: string,
  definition: CardDefinition,
  playData: StandardAttackPlayData,
  definitions: Record<string, CardDefinition>,
): string | undefined {
  const rule = definition.alternateManaPayer;
  const data = playData.cardDataByInstanceId?.[instanceId] ?? playData.cardDataByDefinitionId?.[definition.id];
  const payerPlayerId = isRecord(data) && typeof data.manaPayerPlayerId === "string" ? data.manaPayerPlayerId : undefined;
  if (!payerPlayerId) return undefined;
  if (!rule) throw new Error("ALTERNATE_MANA_PAYER_NOT_AVAILABLE");
  const payer = state.players[payerPlayerId];
  const player = state.players[playerId];
  if (!payer || !player || payer.eliminated || payer.id === player.id) throw new Error("ALTERNATE_MANA_PAYER_INVALID");
  if (rule.requireSameBattlefield === true) {
    if (!player.locationId || !isBattlefieldLocation(state, player.locationId) || payer.locationId !== player.locationId) {
      throw new Error("ALTERNATE_MANA_PAYER_LOCATION_INVALID");
    }
  }
  if (rule.requiredControlledDefinitionId) {
    const requiredId = rule.requiredControlledDefinitionId;
    const controls = payer.attack.some((candidateId) => {
      const candidate = state.cards[candidateId];
      const candidateDefinition = candidate ? definitions[candidate.definitionId] : undefined;
      return Boolean(candidate && candidate.controllerPlayerId === payer.id && candidate.zone === "attack" && candidate.active && candidate.face === "up"
        && (candidate.definitionId === requiredId || candidateDefinition?.linkedSkillId === requiredId));
    });
    if (!controls) throw new Error("ALTERNATE_MANA_PAYER_REQUIRED_CARD_MISSING");
  }
  return payerPlayerId;
}

function resolveActiveSourcePlayAdjustment(
  state: GameState,
  playerId: string,
  instanceId: string,
  definition: CardDefinition,
  playData: StandardAttackPlayData,
  definitions: Record<string, CardDefinition>,
): ResolvedActiveSourcePlayAdjustment | undefined {
  const data = playData.cardDataByInstanceId?.[instanceId] ?? playData.cardDataByDefinitionId?.[definition.id];
  const requestedChoiceId = isRecord(data) && typeof data.sourceAdjustmentChoice === "string" ? data.sourceAdjustmentChoice : undefined;
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
  let rule = definition.playAdjustmentFromActiveSource;
  let source = rule ? player.attack.map((candidateId) => state.cards[candidateId]).find((candidate) => {
    const candidateDefinition = candidate ? definitions[candidate.definitionId] : undefined;
    return Boolean(candidate && candidate.controllerPlayerId === player.id && candidate.zone === "attack" && candidate.active && candidate.face === "up"
      && (candidate.definitionId === rule!.sourceDefinitionId || candidateDefinition?.linkedSkillId === rule!.sourceDefinitionId));
  }) : undefined;
  if (!rule && definition.basic !== true) {
    const auraSources = player.attack.map((candidateId) => state.cards[candidateId]).filter((candidate) => {
      const candidateDefinition = candidate ? definitions[candidate.definitionId] : undefined;
      return Boolean(candidate && candidate.instanceId !== instanceId && candidate.controllerPlayerId === player.id
        && candidate.zone === "attack" && candidate.active && candidate.face === "up"
        && candidateDefinition?.activeSourcePlayAdjustmentForNonBasic);
    });
    if (auraSources.length > 1) throw new Error("ACTIVE_SOURCE_PLAY_ADJUSTMENT_AMBIGUOUS");
    source = auraSources[0];
    const aura = source ? definitions[source.definitionId]?.activeSourcePlayAdjustmentForNonBasic : undefined;
    if (source && aura) rule = { sourceDefinitionId: source.definitionId, choices: aura.choices, closeSourceAfterPlay: aura.closeSourceAfterPlay };
  }
  if (!rule) {
    if (requestedChoiceId) throw new Error("ACTIVE_SOURCE_PLAY_ADJUSTMENT_NOT_AVAILABLE");
    return undefined;
  }
  if (!source) {
    if (requestedChoiceId) throw new Error("ACTIVE_SOURCE_PLAY_ADJUSTMENT_SOURCE_MISSING");
    return undefined;
  }
  if (!requestedChoiceId) throw new Error("ACTIVE_SOURCE_PLAY_ADJUSTMENT_CHOICE_REQUIRED");
  const choice = rule.choices.find((candidate) => candidate.id === requestedChoiceId);
  if (!choice) throw new Error("ACTIVE_SOURCE_PLAY_ADJUSTMENT_CHOICE_INVALID");
  const costAdd = Number(choice.costAdd ?? 0);
  const powerAdd = Number(choice.powerAdd ?? 0);
  if (!Number.isInteger(costAdd) || !Number.isInteger(powerAdd)) throw new Error("ACTIVE_SOURCE_PLAY_ADJUSTMENT_INVALID");
  return {
    sourceInstanceId: source.instanceId,
    choiceId: choice.id,
    costAdd,
    powerAdd,
    closeSourceAfterPlay: rule.closeSourceAfterPlay === true,
  };
}

interface RoundPlayRestrictionSubstitution {
  discardInstanceId: string;
  costReduction: number;
}

function resolveRoundPlayRestrictionSubstitutions(
  state: GameState,
  playerId: string,
  selectedInstanceIds: string[],
  definitions: Record<string, CardDefinition>,
  playData: StandardAttackPlayData,
): Map<string, RoundPlayRestrictionSubstitution> {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
  const restriction = player.roundPlayRestriction?.round === state.round ? player.roundPlayRestriction : undefined;
  if (!restriction) return new Map();
  const allowed = new Set(restriction.allowedInstanceIds);
  const substitute = restriction.substitution;
  const reservedDiscards = new Set<string>();
  const resolved = new Map<string, RoundPlayRestrictionSubstitution>();
  for (const instanceId of selectedInstanceIds) {
    if (allowed.has(instanceId)) continue;
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    const data = instance ? playData.cardDataByInstanceId?.[instanceId] ?? playData.cardDataByDefinitionId?.[instance.definitionId] : undefined;
    const discardInstanceId = isRecord(data) && typeof data.roundPlayRestrictionDiscardInstanceId === "string"
      ? data.roundPlayRestrictionDiscardInstanceId
      : undefined;
    if (!instance || !definition || !substitute || substitute.targetKind !== "skill" || definition.isSkill !== true || !discardInstanceId) {
      throw new Error("CARD_PLAY_RESTRICTED_THIS_ROUND");
    }
    if (reservedDiscards.has(discardInstanceId) || selectedInstanceIds.includes(discardInstanceId)
      || !substitute.eligibleDiscardInstanceIds.includes(discardInstanceId)) throw new Error("ROUND_PLAY_SUBSTITUTION_DISCARD_INVALID");
    const discard = state.cards[discardInstanceId];
    const discardDefinition = discard ? definitions[discard.definitionId] : undefined;
    if (!discard || !discardDefinition || discard.ownerPlayerId !== playerId || discard.zone !== "hand" || !player.hand.includes(discardInstanceId)
      || !getCardInstanceAttributes(discard, discardDefinition, state, definitions).includes("特殊")) {
      throw new Error("ROUND_PLAY_SUBSTITUTION_DISCARD_INVALID");
    }
    if (!Number.isInteger(substitute.costReduction) || substitute.costReduction < 0) throw new Error("ROUND_PLAY_SUBSTITUTION_COST_INVALID");
    reservedDiscards.add(discardInstanceId);
    resolved.set(instanceId, { discardInstanceId, costReduction: substitute.costReduction });
  }
  return resolved;
}

function getOwnedFaceDownAttackFollowup(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): { sourceInstanceId: string; sourceDefinitionId: string; exactCount: number; definitionId: string } | undefined {
  const player = state.players[playerId];
  if (!player) return undefined;
  const sourceIds = [...new Set([...player.masterSkills, ...player.servantSkills, ...player.hand, ...player.attack])];
  for (const sourceInstanceId of sourceIds) {
    const source = state.cards[sourceInstanceId];
    if (!source || source.ownerPlayerId !== playerId || source.zone === "removed") continue;
    const definition = definitions[source.definitionId];
    const rule = definition?.faceDownAttackFollowup;
    if (!rule) continue;
    if (!Number.isInteger(rule.exactCount) || rule.exactCount <= 0 || !definitions[rule.definitionId]) throw new Error("FACE_DOWN_ATTACK_FOLLOWUP_RULE_INVALID");
    return { sourceInstanceId, sourceDefinitionId: definition.id, exactCount: rule.exactCount, definitionId: rule.definitionId };
  }
  return undefined;
}

function resolvePlayPrerequisiteClosures(
  state: GameState,
  playerId: string,
  definitionsToPlay: CardDefinition[],
  definitions: Record<string, CardDefinition>,
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
  const reserved = new Set<string>();
  const closures: string[] = [];
  for (const definition of definitionsToPlay) {
    const prerequisite = definition.playPrerequisite;
    if (!prerequisite?.activeOwnedDefinitionId || prerequisite.closeOnPlay !== true) continue;
    const candidateId = player.attack.find((instanceId) => {
      if (reserved.has(instanceId)) return false;
      const instance = state.cards[instanceId];
      const candidateDefinition = instance ? definitions[instance.definitionId] : undefined;
      return Boolean(instance && instance.ownerPlayerId === playerId && instance.active && instance.face === "up"
        && (instance.definitionId === prerequisite.activeOwnedDefinitionId || candidateDefinition?.linkedSkillId === prerequisite.activeOwnedDefinitionId)
        && candidateDefinition && !isStructuredCardCloseForbidden(state, playerId, instance, candidateDefinition, definitions));
    });
    if (!candidateId) throw new Error("CARD_PLAY_PREREQUISITE_CANNOT_CLOSE");
    reserved.add(candidateId);
    closures.push(candidateId);
  }
  return closures;
}

function consumePlayPrerequisiteClosures(
  state: GameState,
  playerId: string,
  instanceIds: string[],
  definitions: Record<string, CardDefinition>,
): void {
  for (const instanceId of instanceIds) closePlayerCard(state, playerId, instanceId, definitions);
}

function resolvePlayPrerequisiteDiscards(
  state: GameState,
  playerId: string,
  plays: Array<{ instanceId: string; definition: CardDefinition; data?: unknown }>,
  definitions: Record<string, CardDefinition>,
  excludedInstanceIds: ReadonlySet<string> = new Set(),
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
  const reserved = new Set<string>();
  const resolved: string[] = [];
  for (const { instanceId, definition, data } of plays) {
    const rule = definition.playPrerequisite?.discardFromHand;
    if (!rule) continue;
    if (!Number.isInteger(rule.count) || rule.count < 0) throw new Error("CARD_PLAY_PREREQUISITE_DISCARD_RULE_INVALID");
    if (rule.count === 0) continue;
    const wrapped = isRecord(data) ? data : {};
    const supplied = Array.isArray(wrapped.playPrerequisiteDiscardInstanceIds)
      ? wrapped.playPrerequisiteDiscardInstanceIds.filter((id): id is string => typeof id === "string")
      : [];
    if (supplied.length !== rule.count || new Set(supplied).size !== supplied.length) {
      throw new Error("CARD_PLAY_PREREQUISITE_DISCARD_SELECTION_REQUIRED");
    }
    for (const discardInstanceId of supplied) {
      if (discardInstanceId === instanceId || excludedInstanceIds.has(discardInstanceId) || reserved.has(discardInstanceId)) {
        throw new Error("CARD_PLAY_PREREQUISITE_DISCARD_INVALID");
      }
      const card = state.cards[discardInstanceId];
      const candidateDefinition = card ? definitions[card.definitionId] : undefined;
      if (!card || !candidateDefinition || card.ownerPlayerId !== playerId || card.zone !== "hand" || !player.hand.includes(discardInstanceId)) {
        throw new Error("CARD_PLAY_PREREQUISITE_DISCARD_INVALID");
      }
      if (rule.basic === true && candidateDefinition.basic !== true) throw new Error("CARD_PLAY_PREREQUISITE_DISCARD_INVALID");
      const attributes = getCardInstanceAttributes(card, candidateDefinition, state, definitions);
      if ((rule.attributesAll ?? []).some((attribute) => !attributes.includes(attribute))) throw new Error("CARD_PLAY_PREREQUISITE_DISCARD_INVALID");
      reserved.add(discardInstanceId);
      resolved.push(discardInstanceId);
    }
  }
  return resolved;
}

function consumePlayPrerequisiteDiscards(state: GameState, playerId: string, instanceIds: string[]): void {
  for (const instanceId of instanceIds) {
    movePlayerCard(state, playerId, instanceId, "discard");
    const card = state.cards[instanceId];
    card.face = "down";
    card.active = false;
    card.residual = false;
  }
}

interface ResolvedPlayPrerequisiteDeckTransfer {
  sourceInstanceId: string;
  targetPlayerId: string;
  transferInstanceIds: string[];
  definitionIds: string[];
}

function resolvePlayPrerequisiteDeckTransfers(
  state: GameState,
  playerId: string,
  plays: Array<{ instanceId: string; definition: CardDefinition; data?: unknown }>,
  definitions: Record<string, CardDefinition>,
  excludedInstanceIds: ReadonlySet<string> = new Set(),
): ResolvedPlayPrerequisiteDeckTransfer[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
  const reserved = new Set<string>();
  const resolved: ResolvedPlayPrerequisiteDeckTransfer[] = [];
  for (const { instanceId, definition, data } of plays) {
    const rule = definition.playPrerequisite?.shuffleIntoOpponentDeck;
    if (!rule) continue;
    if (!Number.isInteger(rule.count) || rule.count < 1) throw new Error("CARD_PLAY_PREREQUISITE_DECK_TRANSFER_RULE_INVALID");
    const wrapped = isRecord(data) ? data : {};
    const supplied = Array.isArray(wrapped.playPrerequisiteShuffleInstanceIds)
      ? wrapped.playPrerequisiteShuffleInstanceIds.filter((id): id is string => typeof id === "string") : [];
    const targetPlayerId = typeof wrapped.playPrerequisiteTargetPlayerId === "string" ? wrapped.playPrerequisiteTargetPlayerId : undefined;
    const target = targetPlayerId ? state.players[targetPlayerId] : undefined;
    if (supplied.length !== rule.count || new Set(supplied).size !== supplied.length || !target || target.eliminated || targetPlayerId === playerId) {
      throw new Error("CARD_PLAY_PREREQUISITE_DECK_TRANSFER_SELECTION_REQUIRED");
    }
    if (rule.requireSameLocation !== false && (!player.locationId || target.locationId !== player.locationId)) {
      throw new Error("CARD_PLAY_PREREQUISITE_DECK_TRANSFER_TARGET_INVALID");
    }
    const definitionIds: string[] = [];
    for (const transferInstanceId of supplied) {
      if (transferInstanceId === instanceId || excludedInstanceIds.has(transferInstanceId) || reserved.has(transferInstanceId)) {
        throw new Error("CARD_PLAY_PREREQUISITE_DECK_TRANSFER_INVALID");
      }
      const card = state.cards[transferInstanceId];
      const candidateDefinition = card ? definitions[card.definitionId] : undefined;
      if (!card || !candidateDefinition || card.ownerPlayerId !== playerId || card.zone !== "hand" || !player.hand.includes(transferInstanceId)
        || (rule.basic === true && candidateDefinition.basic !== true)) throw new Error("CARD_PLAY_PREREQUISITE_DECK_TRANSFER_INVALID");
      reserved.add(transferInstanceId);
      definitionIds.push(candidateDefinition.id);
    }
    resolved.push({ sourceInstanceId: instanceId, targetPlayerId, transferInstanceIds: supplied, definitionIds });
  }
  return resolved;
}

function consumePlayPrerequisiteDeckTransfers(state: GameState, transfers: ResolvedPlayPrerequisiteDeckTransfer[]): void {
  const random = new StateRandom();
  for (const transfer of transfers) {
    for (const instanceId of transfer.transferInstanceIds) transferPhysicalCardToPlayerZone(state, transfer.targetPlayerId, instanceId, "deck");
    shufflePlayerDeck(state, transfer.targetPlayerId, (maxExclusive) => random.integer(state, maxExclusive));
    const source = state.cards[transfer.sourceInstanceId];
    if (source) source.playPrerequisiteTransferredDefinitionIds = [...transfer.definitionIds];
  }
}

interface ResolvedPlayPrerequisiteResource {
  resourceId: string;
  amount: number;
}

function resolvePlayPrerequisiteResources(
  state: GameState,
  playerId: string,
  plays: Array<{ definition: CardDefinition; data?: unknown }>,
): ResolvedPlayPrerequisiteResource[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
  const reserved: Record<string, number> = {};
  const resolved: ResolvedPlayPrerequisiteResource[] = [];
  for (const { definition, data } of plays) {
    const rule = definition.playPrerequisite?.customResource;
    if (!rule) continue;
    if (!Number.isInteger(rule.amount) || rule.amount < 0 || !Array.isArray(rule.resourceIds) || rule.resourceIds.length === 0
      || rule.resourceIds.some((resourceId) => typeof resourceId !== "string" || resourceId.length === 0)) {
      throw new Error("CARD_PLAY_PREREQUISITE_RESOURCE_RULE_INVALID");
    }
    if (rule.amount === 0) continue;
    const wrapped = isRecord(data) ? data : {};
    const supplied = Array.isArray(wrapped.playPrerequisiteResourceIds)
      ? wrapped.playPrerequisiteResourceIds.filter((resourceId): resourceId is string => typeof resourceId === "string")
      : [];
    if (supplied.length !== rule.amount) throw new Error("CARD_PLAY_PREREQUISITE_RESOURCE_SELECTION_REQUIRED");
    const local: Record<string, number> = {};
    for (const resourceId of supplied) {
      if (!rule.resourceIds.includes(resourceId)) throw new Error("CARD_PLAY_PREREQUISITE_RESOURCE_INVALID");
      local[resourceId] = (local[resourceId] ?? 0) + 1;
      const needed = (reserved[resourceId] ?? 0) + local[resourceId];
      const available = Number(player.customResources?.[resourceId] ?? 0);
      if (!Number.isInteger(available) || available < needed) throw new Error("CARD_PLAY_PREREQUISITE_RESOURCE_MISSING");
    }
    for (const [resourceId, amount] of Object.entries(local)) {
      reserved[resourceId] = (reserved[resourceId] ?? 0) + amount;
      resolved.push({ resourceId, amount });
    }
  }
  return resolved;
}

function consumePlayPrerequisiteResources(state: GameState, playerId: string, resources: readonly ResolvedPlayPrerequisiteResource[]): void {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
  for (const { resourceId, amount } of resources) {
    if (spendCustomResource(player, resourceId, amount) !== amount) throw new Error("CARD_PLAY_PREREQUISITE_RESOURCE_MISSING");
  }
}

function recordPlayedCardsThisRound(state: GameState, playerId: string, playedDefinitions: CardDefinition[]): void {
  if (playedDefinitions.length === 0) return;
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
  player.flags.cardsPlayedThisRound = Number(player.flags.cardsPlayedThisRound ?? 0) + playedDefinitions.length;
  if (playedDefinitions.some((definition) => definition.roundExclusivePlay === true)) player.flags.roundExclusiveCardPlayedRound = state.round;
  const raw = state.modeState.cardPlayDefinitionHistory;
  const history = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, Record<string, string[]>>
    : {};
  const byRound = history[playerId] ?? {};
  const roundKey = String(state.round);
  byRound[roundKey] = [...(byRound[roundKey] ?? []), ...playedDefinitions.map((definition) => definition.id)];
  history[playerId] = byRound;
  state.modeState.cardPlayDefinitionHistory = history;
}

/** Stable play-history query for rules that reference cards actually played in an earlier round. */
export function getPlayedDefinitionIdsForRound(state: GameState, playerId: string, round: number): string[] {
  if (!Number.isInteger(round) || round < 0) throw new Error("CARD_PLAY_HISTORY_ROUND_INVALID");
  const raw = state.modeState.cardPlayDefinitionHistory;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const byPlayer = (raw as Record<string, Record<string, unknown>>)[playerId];
  const values = byPlayer?.[String(round)];
  return Array.isArray(values) ? values.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
}

function applyCardResidualState(
  state: GameState,
  player: GameState["players"][string],
  instance: GameState["cards"][string],
  definition: CardDefinition,
): void {
  const granted = cardHasResidualGrant(state, player, instance);
  instance.residual = definition.residual === true || granted;
  if (definition.residual === true) {
    delete instance.residualUntilRound;
    return;
  }
  const untilRound = granted ? getCardResidualUntilRound(state, player, instance) : undefined;
  if (untilRound !== undefined) instance.residualUntilRound = untilRound;
  else delete instance.residualUntilRound;
}

function resolveVariablePlayAttributeChoice(
  definition: CardDefinition,
  instanceId: string,
  playData: StandardAttackPlayData,
): ResolvedVariablePlayAttributeChoice | undefined {
  const config = definition.variablePlayAttributeChoice;
  if (!config) return undefined;
  const data = playData.cardDataByInstanceId?.[instanceId] ?? playData.cardDataByDefinitionId?.[definition.id];
  if (!isRecord(data)) throw new Error("VARIABLE_PLAY_ATTRIBUTE_CHOICE_REQUIRED");
  if (!Number.isInteger(data.x) || Number(data.x) < 0) throw new Error("VARIABLE_PLAY_ATTRIBUTE_X_INVALID");
  if (!Array.isArray(data.attributes) || data.attributes.some((attribute) => typeof attribute !== "string")) {
    throw new Error("VARIABLE_PLAY_ATTRIBUTES_INVALID");
  }
  const selected = normalizeCardAttributes(data.attributes as string[]);
  if (selected.length !== data.attributes.length) throw new Error("VARIABLE_PLAY_ATTRIBUTES_DUPLICATE");
  if (selected.length !== Number(data.x)) throw new Error("VARIABLE_PLAY_ATTRIBUTE_X_MISMATCH");
  const allowed = normalizeCardAttributes(config.allowedAttributes);
  if (selected.some((attribute) => !allowed.includes(attribute))) throw new Error("VARIABLE_PLAY_ATTRIBUTE_FORBIDDEN");
  const manaPerAttribute = Number(config.manaPerAttribute);
  if (!Number.isInteger(manaPerAttribute) || manaPerAttribute < 0) throw new Error("VARIABLE_PLAY_ATTRIBUTE_COST_INVALID");
  return { attributes: selected, extraMana: selected.length * manaPerAttribute };
}

function resolvePlayAttributeDeclaration(
  state: GameState,
  playerId: string,
  definition: CardDefinition,
  instanceId: string,
  playData: StandardAttackPlayData,
  definitions: Record<string, CardDefinition>,
): ResolvedPlayAttributeDeclaration | undefined {
  const config = definition.playAttributeDeclaration;
  if (!config) return undefined;
  const data = playData.cardDataByInstanceId?.[instanceId] ?? playData.cardDataByDefinitionId?.[definition.id];
  if (!isRecord(data) || typeof data.declaredAttribute !== "string") throw new Error("PLAY_ATTRIBUTE_DECLARATION_REQUIRED");
  const normalized = normalizeCardAttributes([data.declaredAttribute]);
  if (normalized.length !== 1) throw new Error("PLAY_ATTRIBUTE_DECLARATION_INVALID");
  const attribute = normalized[0];
  const allowed = normalizeCardAttributes(config.allowedAttributes);
  if (!allowed.includes(attribute)) throw new Error("PLAY_ATTRIBUTE_DECLARATION_FORBIDDEN");
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
  const repeatWaiver = config.repeatAllowedWithOwnedSkillId;
  const mayRepeat = Boolean(repeatWaiver && Object.values(state.cards).some((card) => {
    if (card.ownerPlayerId !== playerId || card.zone === "removed") return false;
    const cardDefinition = definitions[card.definitionId];
    return card.definitionId === repeatWaiver || cardDefinition?.linkedSkillId === repeatWaiver;
  }));
  const uniquePerGame = config.uniquePerGame === true && !mayRepeat;
  if (uniquePerGame && (player.playAttributeDeclarations?.[definition.id] ?? []).includes(attribute)) {
    throw new Error("PLAY_ATTRIBUTE_ALREADY_DECLARED");
  }
  return { attribute, uniquePerGame };
}

function resolveSameBatchOtherAttackCostReductions(
  state: GameState,
  player: PlayerState,
  faceUpInstanceIds: string[],
  definitions: Record<string, CardDefinition>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const sourceInstanceId of faceUpInstanceIds) {
    const source = state.cards[sourceInstanceId];
    const definition = source ? definitions[source.definitionId] : undefined;
    if (!source || !definition) continue;
    const rules = [
      ...(definition.sameBatchOtherAttackCostReduction ? [definition.sameBatchOtherAttackCostReduction] : []),
      ...getApplicableCardRuleModifiers(state, player, source)
        .map((modifier) => modifier.sameBatchOtherAttackCostReduction)
        .filter((rule): rule is { excludeTag?: string } => Boolean(rule)),
    ];
    if (rules.length === 0) continue;
    const signatures = [...new Set(rules.map((rule) => JSON.stringify(rule)))];
    if (signatures.length > 1) throw new Error("SAME_BATCH_COST_REDUCTION_RULE_CONFLICT");
    const rule = rules[0];
    if (rule.excludeTag !== undefined && (typeof rule.excludeTag !== "string" || !rule.excludeTag)) throw new Error("SAME_BATCH_COST_REDUCTION_RULE_INVALID");
    let reduction = 0;
    for (const candidateId of faceUpInstanceIds) {
      if (candidateId === sourceInstanceId) continue;
      const candidate = state.cards[candidateId];
      const candidateDefinition = candidate ? definitions[candidate.definitionId] : undefined;
      if (!candidate || !candidateDefinition || candidateDefinition.cardType !== "attack") continue;
      if (rule.excludeTag && candidateDefinition.tags?.includes(rule.excludeTag)) continue;
      reduction += getCardPlayCost(state, candidateDefinition, player, candidate, definitions);
    }
    if (!Number.isInteger(reduction) || reduction < 0) throw new Error("SAME_BATCH_COST_REDUCTION_INVALID");
    if (reduction > 0) result.set(sourceInstanceId, reduction);
  }
  return result;
}

function resolvePairedPlayOtherCostReductions(
  state: GameState,
  faceUpInstanceIds: string[],
  definitions: Record<string, CardDefinition>,
  playData: StandardAttackPlayData,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const sourceInstanceId of faceUpInstanceIds) {
    const source = state.cards[sourceInstanceId];
    const definition = source ? definitions[source.definitionId] : undefined;
    const reduction = Number(definition?.pairedPlayOtherCostReduction ?? 0);
    if (!Number.isInteger(reduction) || reduction < 0) throw new Error("PAIRED_PLAY_COST_REDUCTION_INVALID");
    if (reduction === 0) continue;
    const candidates = faceUpInstanceIds.filter((instanceId) => instanceId !== sourceInstanceId);
    if (candidates.length === 0) continue;
    let targetInstanceId: string | undefined;
    if (candidates.length === 1) targetInstanceId = candidates[0];
    else {
      const data = playData.cardDataByInstanceId?.[sourceInstanceId] ?? playData.cardDataByDefinitionId?.[definition!.id];
      targetInstanceId = isRecord(data) && typeof data.pairedCostReductionTargetInstanceId === "string"
        ? data.pairedCostReductionTargetInstanceId
        : undefined;
      if (!targetInstanceId) throw new Error("PAIRED_PLAY_COST_REDUCTION_TARGET_REQUIRED");
    }
    if (!candidates.includes(targetInstanceId)) throw new Error("PAIRED_PLAY_COST_REDUCTION_TARGET_INVALID");
    result.set(targetInstanceId, Number(result.get(targetInstanceId) ?? 0) + reduction);
  }
  return result;
}

function resolvePairedPlayOtherIncreases(
  state: GameState,
  faceUpInstanceIds: string[],
  definitions: Record<string, CardDefinition>,
): { costByInstanceId: Map<string, number>; powerByInstanceId: Map<string, number> } {
  const costByInstanceId = new Map<string, number>();
  const powerByInstanceId = new Map<string, number>();
  for (const sourceInstanceId of faceUpInstanceIds) {
    const source = state.cards[sourceInstanceId];
    const definition = source ? definitions[source.definitionId] : undefined;
    const costIncrease = Number(definition?.pairedPlayOtherCostIncrease ?? 0);
    const powerBonus = Number(definition?.pairedPlayOtherPowerBonus ?? 0);
    if (!Number.isInteger(costIncrease) || costIncrease < 0 || !Number.isInteger(powerBonus) || powerBonus < 0) {
      throw new Error("PAIRED_PLAY_OTHER_MODIFIER_INVALID");
    }
    if (costIncrease === 0 && powerBonus === 0) continue;
    for (const targetInstanceId of faceUpInstanceIds) {
      if (targetInstanceId === sourceInstanceId) continue;
      if (costIncrease > 0) costByInstanceId.set(targetInstanceId, Number(costByInstanceId.get(targetInstanceId) ?? 0) + costIncrease);
      if (powerBonus > 0) powerByInstanceId.set(targetInstanceId, Number(powerByInstanceId.get(targetInstanceId) ?? 0) + powerBonus);
    }
  }
  return { costByInstanceId, powerByInstanceId };
}

function applyPairedPlayOtherPersistentModifiers(
  state: GameState,
  faceUpInstanceIds: string[],
  definitions: Record<string, CardDefinition>,
): void {
  for (const sourceInstanceId of faceUpInstanceIds) {
    const source = state.cards[sourceInstanceId];
    const definition = source ? definitions[source.definitionId] : undefined;
    const costIncrease = Number(definition?.pairedPlayOtherCostIncrease ?? 0);
    const powerBonus = Number(definition?.pairedPlayOtherPowerBonus ?? 0);
    if (costIncrease === 0 && powerBonus === 0) continue;
    for (const targetInstanceId of faceUpInstanceIds) {
      if (targetInstanceId === sourceInstanceId) continue;
      const target = state.cards[targetInstanceId];
      if (!target) continue;
      if (costIncrease > 0) {
        target.costModifiers = [
          ...(target.costModifiers ?? []),
          { id: `paired-play-cost:${state.round}:${sourceInstanceId}:${targetInstanceId}`, sourceId: definition!.id, kind: "add", value: costIncrease, duration: "round" },
        ];
      }
      if (powerBonus > 0) {
        target.powerModifiers = [
          ...(target.powerModifiers ?? []),
          { id: `paired-play-power:${state.round}:${sourceInstanceId}:${targetInstanceId}`, sourceId: definition!.id, kind: "add", value: powerBonus, duration: "round" },
        ];
      }
    }
  }
}
/** Apply structured effects intrinsic to a card's successful face-up play. */
export function triggerStructuredCardPlayEffects(
  state: GameState,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): { powerBonus: number } {
  const instance = state.cards[instanceId];
  const definition = instance ? definitions[instance.definitionId] : undefined;
  if (!instance || !definition || instance.face !== "up" || !instance.active) throw new Error("CARD_PLAY_EFFECT_SOURCE_INVALID");
  if (isCardTextSuppressed(state, instance, definitions)) return { powerBonus: 0 };
  const powerBonus = Number(definition.playPowerBonus ?? 0);
  if (!Number.isInteger(powerBonus) || powerBonus < 0) throw new Error("CARD_PLAY_POWER_BONUS_INVALID");
  if (powerBonus > 0) {
    const priorCount = (instance.powerModifiers ?? []).filter((modifier) => modifier.sourceId === definition.id && modifier.id.startsWith("structured-play-power:")).length;
    instance.powerModifiers = [
      ...(instance.powerModifiers ?? []),
      { id: `structured-play-power:${state.round}:${priorCount + 1}`, sourceId: definition.id, kind: "add", value: powerBonus, duration: "round" },
    ];
  }
  return { powerBonus };
}

function commitStandardAttackInternal(
  state: GameState,
  playerId: string,
  faceUpInstanceIds: string[],
  faceDownInstanceIds: string[],
  definitions: Record<string, CardDefinition>,
  playData: StandardAttackPlayData = {},
): { paidMana: number; committed: string[]; setAsideInstanceIds: string[]; cards: Array<{ instanceId: string; definitionId: string; face: "up" | "down"; paidMana: number; attributes: string[]; revealsTrueName: boolean }>; drawRequests: Array<{ sourceInstanceId: string; count: number }>; playEffectRequests: Array<{ sourceInstanceId: string; effect: SkillEffectSpec }> } {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  if (state.phase !== "action" || state.activePlayerId !== playerId || state.step !== "play-batch-draft") throw new Error("PLAY_WINDOW_FORBIDDEN");
  if (player.defeated && !playerIgnoresDefeat(state, player, definitions)) throw new Error("PLAYER_DEFEATED");
  const { requiredCards: baseRequiredCards, primitiveDragonActive } = getStandardAttackRequirements(player, state, definitions);
  const all = [...faceUpInstanceIds, ...faceDownInstanceIds];
  const setAsideSourceId = typeof player.flags.actionCardSetAsideSourceId === "string" ? player.flags.actionCardSetAsideSourceId : undefined;
  const setAsideInstanceIds = all.filter((instanceId) => {
    const instance = state.cards[instanceId];
    return Boolean(instance && wantsSetAsideInstead(playData, instanceId, instance.definitionId));
  });
  if (setAsideInstanceIds.length > 0 && !setAsideSourceId) throw new Error("CARD_SET_ASIDE_REPLACEMENT_NOT_AVAILABLE");
  const setAsideSet = new Set(setAsideInstanceIds);
  const playedFaceUpInstanceIds = faceUpInstanceIds.filter((instanceId) => !setAsideSet.has(instanceId));
  const playedFaceDownInstanceIds = faceDownInstanceIds.filter((instanceId) => !setAsideSet.has(instanceId));
  const playedInstanceIds = [...playedFaceUpInstanceIds, ...playedFaceDownInstanceIds];
  const faceDownFollowup = playData.useFaceDownAttackFollowup === true
    ? getOwnedFaceDownAttackFollowup(state, playerId, definitions)
    : undefined;
  if (playData.useFaceDownAttackFollowup === true && !faceDownFollowup) throw new Error("FACE_DOWN_ATTACK_FOLLOWUP_NOT_AVAILABLE");
  if (faceDownFollowup && (faceUpInstanceIds.length !== 0 || faceDownInstanceIds.length !== faceDownFollowup.exactCount)) {
    throw new Error("FACE_DOWN_ATTACK_FOLLOWUP_SELECTION_INVALID");
  }
  const forcedStandardInstanceId = player.flags.forcedStandardAttackRound === state.round && typeof player.flags.forcedStandardAttackInstanceId === "string"
    ? player.flags.forcedStandardAttackInstanceId
    : undefined;
  if (forcedStandardInstanceId && !all.includes(forcedStandardInstanceId)) throw new Error("FORCED_STANDARD_ATTACK_REQUIRED");
  assertStructuredCardBatchAllowed(state, playerId, all, definitions);
  const selectedCards = all.map((instanceId) => ({ instanceId, instance: state.cards[instanceId], definition: definitions[state.cards[instanceId]?.definitionId ?? ""] }));
  const selectedDefinitions = selectedCards.map(({ definition }) => definition);
  const controlledStandardAttackReduction = player.attack.some((instanceId) => definitions[state.cards[instanceId]?.definitionId ?? ""]?.tags?.includes("reduces-standard-attack-by-one"));
  const selectedStandardAttackReduction = !controlledStandardAttackReduction
    && selectedDefinitions.some((definition) => definition?.tags?.includes("reduces-standard-attack-by-one"));
  const requiredCards = Math.max(1, baseRequiredCards - (selectedStandardAttackReduction ? 1 : 0));
  const roundPlayRestrictionSubstitutions = resolveRoundPlayRestrictionSubstitutions(state, playerId, all, definitions, playData);
  const roundPlayRestrictionDiscardIds = [...roundPlayRestrictionSubstitutions.values()].map((item) => item.discardInstanceId);
  const hasSingleCardRule = selectedDefinitions.some((definition) => definition?.singleCardPlay === true);
  const staticAppended = selectedCards.filter(({ instance, definition }) => Boolean(instance && definition && (
      definition.standardAppend === true
      || cardHasStandardAppendGrant(state, player, instance)
      || (player.locationId && definition.standardAppendIfBoardDefinitionAtControllerLocation?.some((sourceId) => Object.values(state.cards).some((source) => {
        const sourceDefinition = definitions[source.definitionId];
        return source.zone === "board" && source.active === true && source.boardLocationId === player.locationId
          && (source.definitionId === sourceId || sourceDefinition?.linkedSkillId === sourceId);
      })))
    ))
    && (!definition.standardAppendRequiresOwnedSkillId
      || Object.values(state.cards).some((card) => card.ownerPlayerId === playerId
        && card.zone !== "removed"
        && (card.definitionId === definition.standardAppendRequiresOwnedSkillId
          || definitions[card.definitionId]?.linkedSkillId === definition.standardAppendRequiresOwnedSkillId))));
  for (const appended of staticAppended) {
    const requirement = appended.definition.standardAppendRequiresBatchCards;
    if (!requirement) continue;
    if (!Number.isInteger(requirement.minCount) || requirement.minCount < 0) throw new Error("STANDARD_APPEND_BATCH_REQUIREMENT_INVALID");
    const matching = selectedCards.filter((candidate) => {
      if (candidate.instanceId === appended.instanceId || !candidate.instance || !candidate.definition) return false;
      if (!requirement.attributesAny?.length) return true;
      const attributes = getCardInstanceAttributes(candidate.instance, candidate.definition, state, definitions);
      return requirement.attributesAny.some((attribute) => attributes.includes(attribute));
    }).length;
    if (matching < requirement.minCount) throw new Error("STANDARD_APPEND_BATCH_REQUIREMENT_NOT_MET");
  }
  if (staticAppended.length > 1) {
    const groups = new Set(staticAppended.map(({ definition }) => definition.standardAppendStackGroup).filter((group): group is string => typeof group === "string" && group.length > 0));
    if (groups.size !== 1 || staticAppended.some(({ definition }) => !definition.standardAppendStackGroup)) throw new Error("STANDARD_APPEND_LIMIT_EXCEEDED");
  }
  const standardAttackCountRule = getStructuredStandardAttackCardCountRule(state, playerId, definitions);
  const optionalExtraStandardCards = Math.max(0, Number(player.flags.optionalExtraStandardAttackCards ?? 0));
  if (!Number.isInteger(optionalExtraStandardCards)) throw new Error("OPTIONAL_EXTRA_STANDARD_ATTACK_INVALID");
  const structuredAppendExtraCostByInstanceId = new Map<string, number>();
  if (!hasSingleCardRule && !standardAttackCountRule && staticAppended.length === 0 && all.length === requiredCards + optionalExtraStandardCards + 1) {
    const candidates = selectedCards.flatMap(({ instanceId, instance, definition }) => {
      if (!instance || !definition) return [];
      const rule = getStructuredStandardAppendRule(state, playerId, instance, definition, definitions);
      return rule ? [{ instanceId, rule }] : [];
    });
    if (candidates.length > 1) throw new Error("STANDARD_APPEND_SELECTION_AMBIGUOUS");
    if (candidates.length === 1) structuredAppendExtraCostByInstanceId.set(candidates[0].instanceId, candidates[0].rule.extraCost);
  }
  const appendedCount = staticAppended.length + structuredAppendExtraCostByInstanceId.size;
  if (hasSingleCardRule) {
    if (all.length !== 1) throw new Error("EXACTLY_ONE_CARD_REQUIRED");
  } else if (standardAttackCountRule) {
    if (all.length < standardAttackCountRule.minCount || all.length > standardAttackCountRule.maxCount) {
      throw new Error("STANDARD_ATTACK_CARD_COUNT_INVALID");
    }
  } else {
    const minimumCards = requiredCards + appendedCount;
    const maximumCards = minimumCards + optionalExtraStandardCards;
    if (all.length < minimumCards || all.length > maximumCards) {
      if (minimumCards === maximumCards) throw new Error(minimumCards === 1 ? "EXACTLY_ONE_CARD_REQUIRED" : "EXACTLY_TWO_CARDS_REQUIRED");
      throw new Error("STANDARD_ATTACK_CARD_COUNT_INVALID");
    }
  }
  const appendedInstanceIds = new Set<string>([
    ...staticAppended.map(({ instanceId }) => instanceId),
    ...structuredAppendExtraCostByInstanceId.keys(),
  ]);
  assertServantAttackRegularPairAllowed(
    state,
    player,
    playedFaceUpInstanceIds.filter((instanceId) => !appendedInstanceIds.has(instanceId)),
    definitions,
  );
  if (new Set(all).size !== all.length) throw new Error("DUPLICATE_CARD_INSTANCE");
  const explicitZeroCardAttack = Boolean(standardAttackCountRule && standardAttackCountRule.minCount === 0 && all.length === 0);
  if (!explicitZeroCardAttack && playedInstanceIds.length > 0 && (player.locationId === "mountain" || player.locationId === "city") && playedFaceUpInstanceIds.length === 0 && !faceDownFollowup) throw new Error("BATTLEFIELD_REQUIRES_FACE_UP_CARD");
  if (isFaceDownStandardAttackRequiredBySameLocationRule(state, playerId) && playedInstanceIds.length > 0 && playedFaceDownInstanceIds.length === 0) {
    throw new Error("STANDARD_ATTACK_REQUIRES_FACE_DOWN_CARD");
  }
  assertFaceUpCardPlayAllowed(state, playerId, playedFaceUpInstanceIds.length, definitions);

  const optionalFreePlayIds = new Set<string>();
  const alternativeVictoryPointPayments = new Map<string, number>();
  for (const instanceId of all) {
    const instance = state.cards[instanceId];
    const definition = definitions[instance?.definitionId ?? ""];
    const data = playData.cardDataByInstanceId?.[instanceId] ?? (definition ? playData.cardDataByDefinitionId?.[definition.id] : undefined);
    const freePlay = isRecord(data) && data.freePlay === true;
    const alternativePayment = isRecord(data) && data.alternativePayment === "victory-points";
    if (freePlay && alternativePayment) throw new Error("CARD_PLAY_PAYMENT_CHOICE_CONFLICT");
    if (alternativePayment) {
      const alternative = definition?.alternativePlayCost;
      if (playedFaceDownInstanceIds.includes(instanceId) || setAsideSet.has(instanceId) || alternative?.resource !== "victory-points" || !Number.isInteger(alternative.amount) || alternative.amount < 0) {
        throw new Error("ALTERNATIVE_PLAY_COST_NOT_AVAILABLE");
      }
      alternativeVictoryPointPayments.set(instanceId, alternative.amount);
    }
    if (freePlay) {
      if (playedFaceDownInstanceIds.includes(instanceId) || setAsideSet.has(instanceId) || !definition?.optionalFreePlay) throw new Error("OPTIONAL_FREE_PLAY_NOT_AVAILABLE");
      optionalFreePlayIds.add(instanceId);
    }
    assertCardCanEnterAttack({
      state,
      playerId,
      instanceId,
      definitions,
      faceDown: playedFaceDownInstanceIds.includes(instanceId),
      primitiveDragonActive,
      bypassSkillFaceDown: Boolean(faceDownFollowup && playedFaceDownInstanceIds.includes(instanceId)),
      bypassSkillEightMana: freePlay && definition?.optionalFreePlay?.waiveEightMana === true,
      roundPlayRestrictionSubstitution: roundPlayRestrictionSubstitutions.has(instanceId),
    });
  }
  const prerequisiteClosures = resolvePlayPrerequisiteClosures(
    state,
    playerId,
    playedFaceUpInstanceIds.map((instanceId) => definitions[state.cards[instanceId].definitionId]),
    definitions,
  );
  const prerequisitePlays = playedFaceUpInstanceIds.map((instanceId) => {
    const definition = definitions[state.cards[instanceId].definitionId];
    return {
      instanceId,
      definition,
      data: playData.cardDataByInstanceId?.[instanceId] ?? playData.cardDataByDefinitionId?.[definition.id],
    };
  });
  const prerequisiteDiscards = resolvePlayPrerequisiteDiscards(
    state,
    playerId,
    prerequisitePlays,
    definitions,
    new Set([...all, ...roundPlayRestrictionDiscardIds]),
  );
  const prerequisiteDeckTransfers = resolvePlayPrerequisiteDeckTransfers(
    state,
    playerId,
    prerequisitePlays,
    definitions,
    new Set([...all, ...roundPlayRestrictionDiscardIds, ...prerequisiteDiscards]),
  );
  const prerequisiteResources = resolvePlayPrerequisiteResources(state, playerId, prerequisitePlays);
  const uniqueGroups = [...new Set(playedInstanceIds.map((instanceId) => definitions[state.cards[instanceId].definitionId]?.uniqueGroup).filter((group): group is string => Boolean(group)))];
  if (uniqueGroups.some((group) => !isUsageAvailable(player.usage[`__unique:${group}`], "once-per-round", state.round, state.phase))) {
    throw new Error("SKILL_UNIQUE_GROUP_USED");
  }

  const variablePlayChoices = new Map<string, ResolvedVariablePlayAttributeChoice>();
  const playAttributeDeclarations = new Map<string, ResolvedPlayAttributeDeclaration>();
  const declarationsInBatch = new Set<string>();
  const structuredPlayUpgrades = new Map<string, NonNullable<ReturnType<typeof getStructuredCardPlayUpgrade>>>();
  const activeSourcePlayAdjustments = new Map<string, ResolvedActiveSourcePlayAdjustment>();
  const consumedAdjustmentSources = new Set<string>();
  for (const instanceId of playedFaceUpInstanceIds) {
    const instance = state.cards[instanceId];
    const definition = definitions[instance.definitionId];
    const choice = resolveVariablePlayAttributeChoice(definition, instanceId, playData);
    if (choice) variablePlayChoices.set(instanceId, choice);
    const declaration = resolvePlayAttributeDeclaration(state, playerId, definition, instanceId, playData, definitions);
    if (declaration) {
      const key = `${definition.id}\u0000${declaration.attribute}`;
      if (declaration.uniquePerGame && declarationsInBatch.has(key)) throw new Error("PLAY_ATTRIBUTE_ALREADY_DECLARED");
      declarationsInBatch.add(key);
      playAttributeDeclarations.set(instanceId, declaration);
    }
    const data = playData.cardDataByInstanceId?.[instanceId] ?? playData.cardDataByDefinitionId?.[definition.id];
    const wantsUpgrade = isRecord(data) && data.applyPlayUpgrade === true;
    if (wantsUpgrade) {
      const upgrade = getStructuredCardPlayUpgrade(state, playerId, instance, definition, definitions);
      if (!upgrade) throw new Error("CARD_PLAY_UPGRADE_NOT_AVAILABLE");
      structuredPlayUpgrades.set(instanceId, upgrade);
    }
    const sourceAdjustment = resolveActiveSourcePlayAdjustment(state, playerId, instanceId, definition, playData, definitions);
    if (sourceAdjustment) {
      if (consumedAdjustmentSources.has(sourceAdjustment.sourceInstanceId)) throw new Error("ACTIVE_SOURCE_PLAY_ADJUSTMENT_ALREADY_CONSUMED_IN_BATCH");
      consumedAdjustmentSources.add(sourceAdjustment.sourceInstanceId);
      activeSourcePlayAdjustments.set(instanceId, sourceAdjustment);
    }
  }
  const pairedCostReductions = resolvePairedPlayOtherCostReductions(state, playedFaceUpInstanceIds, definitions, playData);
  const sameBatchOtherAttackCostReductions = resolveSameBatchOtherAttackCostReductions(state, player, playedFaceUpInstanceIds, definitions);
  const pairedIncreases = resolvePairedPlayOtherIncreases(state, playedFaceUpInstanceIds, definitions);
  const commandSealPlayCost = playedFaceUpInstanceIds.reduce((sum, instanceId) => {
    const value = Number(definitions[state.cards[instanceId].definitionId]?.commandSealPlayCost ?? 0);
    if (!Number.isInteger(value) || value < 0) throw new Error("COMMAND_SEAL_PLAY_COST_INVALID");
    return sum + value;
  }, 0);
  if (commandSealPlayCost > 0) assertCommandSealCostPayable(state, playerId, commandSealPlayCost);
  const additionalVictoryPointPlayCost = playedFaceUpInstanceIds.reduce((sum, instanceId) => {
    const instance = state.cards[instanceId];
    const definition = definitions[instance.definitionId];
    return sum + getEffectiveVictoryPointPlayCost(state, player, instance, definition);
  }, 0);
  const freeOptionalExtraAttackInstanceId = playData.freeOptionalExtraAttackInstanceId;
  if (freeOptionalExtraAttackInstanceId !== undefined) {
    const freeRuleArmed = Number(player.flags.optionalFreeExtraStandardAttackCards ?? 0) > 0
      && player.flags.optionalFreeExtraStandardAttackUsedRound !== state.round;
    const hasOptionalExtra = !hasSingleCardRule && !standardAttackCountRule && all.length > requiredCards + appendedCount;
    if (!freeRuleArmed || !hasOptionalExtra || !playedFaceUpInstanceIds.includes(freeOptionalExtraAttackInstanceId)) {
      throw new Error("FREE_OPTIONAL_EXTRA_ATTACK_INVALID");
    }
  }
  const manaBeforePayment = player.mana;
  const cardManaCosts = new Map<string, number>();
  const alternateManaPayers = new Map<string, string>();
  for (const instanceId of playedFaceUpInstanceIds) {
    const instance = state.cards[instanceId];
    const definition = definitions[instance.definitionId];
    const pairedWithRule = definition.pairedWithDefinitionCostIncrease;
    let pairedWithCostIncrease = 0;
    if (pairedWithRule) {
      if (typeof pairedWithRule.definitionId !== "string" || !pairedWithRule.definitionId || !Number.isInteger(pairedWithRule.amount) || pairedWithRule.amount < 0) {
        throw new Error("PAIRED_WITH_DEFINITION_COST_INCREASE_INVALID");
      }
      if (playedFaceUpInstanceIds.some((candidateId) => candidateId !== instanceId && state.cards[candidateId]?.definitionId === pairedWithRule.definitionId)) {
        pairedWithCostIncrease = pairedWithRule.amount;
      }
    }
    const normalCost = Math.max(0, getCardPlayCost(state, definition, player, instance, definitions)
      + pairedWithCostIncrease
      + Number(pairedIncreases.costByInstanceId.get(instanceId) ?? 0)
      - Number(pairedCostReductions.get(instanceId) ?? 0)
      - Number(sameBatchOtherAttackCostReductions.get(instanceId) ?? 0)
      - Number(roundPlayRestrictionSubstitutions.get(instanceId)?.costReduction ?? 0)
      + Number(activeSourcePlayAdjustments.get(instanceId)?.costAdd ?? 0));
    const waived = instanceId === freeOptionalExtraAttackInstanceId || optionalFreePlayIds.has(instanceId) || alternativeVictoryPointPayments.has(instanceId);
    const totalCost = (waived ? 0 : normalCost)
      + Number(structuredAppendExtraCostByInstanceId.get(instanceId) ?? 0)
      + Number(variablePlayChoices.get(instanceId)?.extraMana ?? 0)
      + Number(structuredPlayUpgrades.get(instanceId)?.extraMana ?? 0);
    cardManaCosts.set(instanceId, totalCost);
    const payerId = resolveAlternateManaPayer(state, playerId, instanceId, definition, playData, definitions);
    if (payerId) alternateManaPayers.set(instanceId, payerId);
  }
  const paidMana = [...cardManaCosts.values()].reduce((sum, amount) => sum + amount, 0);
  const sharedMana = resolveActiveAttackManaShare(state, playerId, playData.sharedManaPayerPlayerId, paidMana, definitions);
  if (sharedMana && alternateManaPayers.size > 0) throw new Error("CARD_PLAY_PAYMENT_CHOICE_CONFLICT");
  const actorPaidMana = sharedMana
    ? paidMana - sharedMana.amount
    : [...cardManaCosts.entries()].reduce((sum, [instanceId, amount]) => sum + (alternateManaPayers.has(instanceId) ? 0 : amount), 0);
  const alternatePayerTotals = new Map<string, number>();
  for (const [instanceId, payerId] of alternateManaPayers) {
    alternatePayerTotals.set(payerId, Number(alternatePayerTotals.get(payerId) ?? 0) + Number(cardManaCosts.get(instanceId) ?? 0));
  }
  if (sharedMana) alternatePayerTotals.set(sharedMana.payerPlayerId, sharedMana.amount);
  const paidVictoryPoints = [...alternativeVictoryPointPayments.values()].reduce((sum, amount) => sum + amount, 0) + additionalVictoryPointPlayCost;
  if (player.victoryPoints < paidVictoryPoints) throw new Error("INSUFFICIENT_VICTORY_POINTS");
  const actorPayment = payManaCost(state, player, actorPaidMana, definitions);
  for (const [payerId, amount] of alternatePayerTotals) payManaCost(state, state.players[payerId], amount, definitions);
  if (commandSealPlayCost > 0) payCommandSealCost(state, playerId, commandSealPlayCost);
  player.victoryPoints -= paidVictoryPoints;
  if (freeOptionalExtraAttackInstanceId !== undefined) player.flags.optionalFreeExtraStandardAttackUsedRound = state.round;
  consumePlayPrerequisiteClosures(state, playerId, prerequisiteClosures, definitions);
  consumePlayPrerequisiteDiscards(state, playerId, prerequisiteDiscards);
  consumePlayPrerequisiteDeckTransfers(state, prerequisiteDeckTransfers);
  consumePlayPrerequisiteResources(state, playerId, prerequisiteResources);
  consumePlayPrerequisiteDiscards(state, playerId, roundPlayRestrictionDiscardIds);
  recordPlayedCardsThisRound(state, playerId, playedInstanceIds.map((instanceId) => definitions[state.cards[instanceId].definitionId]));
  if (forcedStandardInstanceId) {
    delete player.flags.forcedStandardAttackInstanceId;
    delete player.flags.forcedStandardAttackRound;
    delete player.flags.forcedStandardAttackSourceId;
  }
  player.flags.lastAttackCommitManaBefore = manaBeforePayment;
  player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + actorPaidMana;
  for (const [payerId, amount] of alternatePayerTotals) {
    const payer = state.players[payerId];
    payer.flags.roundManaSpent = Number(payer.flags.roundManaSpent ?? 0) + amount;
  }
  if (all.length > 0) player.flags.illyaRoundAttackCommitted = true;
  if (playedFaceUpInstanceIds.length > 0) player.flags.illyaRoundFaceUpAttack = true;
  recordFaceUpCardPlay(state, playerId, playedFaceUpInstanceIds.length);
  for (const group of uniqueGroups) player.usage[`__unique:${group}`] = createUsageRecord("once-per-round", state.round, state.phase);

  for (const instanceId of playedFaceUpInstanceIds) {
    const instance = state.cards[instanceId];
    const definition = definitions[instance.definitionId];
    instance.face = "up";
    instance.active = true;
    applyCardResidualState(state, player, instance, definition);
    if (!cardIgnoresUsageLimit(state, player, instance)) markCardUsage(instance, getCardRuleUsageLimitOverride(state, player, instance) ?? getEffectiveCardUsageLimit(instance, definition.limit), state.round, state.phase);
    instance.paidCost = Number(cardManaCosts.get(instanceId) ?? 0);
    instance.playManaPayerPlayerId = alternateManaPayers.get(instanceId) ?? player.id;
    const linkedContributions = actorPayment.contributions.filter((entry) => !entry.sourceInstanceId || entry.sourceInstanceId === instanceId);
    instance.playManaContributions = linkedContributions.map((entry) => ({ playerId: entry.contributorPlayerId, amount: entry.amount }));
    const variableChoice = variablePlayChoices.get(instanceId);
    if (variableChoice) {
      instance.attributeOverrides = normalizeCardAttributes([...getCardAttributes(definition), ...variableChoice.attributes]);
      const prefix = "attribute-overrides-until-round-end:";
      instance.modifiers = [
        ...(instance.modifiers ?? []).filter((marker) => !marker.startsWith(prefix)),
        `${prefix}${state.round}:${definition.id}:variable-play-choice`,
      ];
    }
    const declaration = playAttributeDeclarations.get(instanceId);
    if (declaration) {
      instance.declaredAttribute = declaration.attribute;
      instance.declaredAttributeRevealed = true;
      if (declaration.uniquePerGame) {
        const history = player.playAttributeDeclarations ??= {};
        history[definition.id] = [...new Set([...(history[definition.id] ?? []), declaration.attribute])];
      }
    }
    const structuredUpgrade = structuredPlayUpgrades.get(instanceId);
    if (structuredUpgrade) {
      instance.attributeOverrides = normalizeCardAttributes([
        ...(instance.attributeOverrides ?? getCardAttributes(definition)),
        ...structuredUpgrade.addAttributes,
      ]);
      const prefix = "attribute-overrides-until-round-end:";
      instance.modifiers = [
        ...(instance.modifiers ?? []).filter((marker) => !marker.startsWith(prefix)),
        `${prefix}${state.round}:${structuredUpgrade.sourceId}:card-play-upgrade`,
      ];
      if (structuredUpgrade.powerBonus !== 0) {
        instance.powerModifiers = [
          ...(instance.powerModifiers ?? []),
          {
            id: `structured-play-upgrade:${state.round}:${structuredUpgrade.sourceId}:${instanceId}`,
            sourceId: structuredUpgrade.sourceId,
            kind: "add",
            value: structuredUpgrade.powerBonus,
            duration: "round",
          },
        ];
      }
    }
    if (optionalFreePlayIds.has(instanceId) && definition.optionalFreePlay) {
      const override = definition.optionalFreePlay.nextRoundCombatPowerOverride;
      if (override !== undefined) {
        if (!Number.isInteger(override)) throw new Error("OPTIONAL_FREE_PLAY_POWER_OVERRIDE_INVALID");
        player.flags.combatPowerOverrideRound = state.round + 1;
        player.flags.combatPowerOverrideValue = override;
        if (definition.optionalFreePlay.requireSourcePresent === true) player.flags.combatPowerOverrideSourceInstanceId = instanceId;
        else delete player.flags.combatPowerOverrideSourceInstanceId;
      }
    }
    instance.playedRound = state.round;
    instance.playedLocationId = player.locationId;
    instance.trueNameRevealedWhenPlayed = player.trueNameRevealed;
    instance.playCount = Number(instance.playCount ?? 0) + 1;
    movePlayerCard(state, playerId, instanceId, "attack");
    const sourceAdjustment = activeSourcePlayAdjustments.get(instanceId);
    if (sourceAdjustment?.powerAdd) {
      instance.powerModifiers = [
        ...(instance.powerModifiers ?? []),
        {
          id: `active-source-play-adjustment:${state.round}:${sourceAdjustment.sourceInstanceId}:${instanceId}`,
          sourceId: sourceAdjustment.sourceInstanceId,
          kind: "add",
          value: sourceAdjustment.powerAdd,
          duration: "round",
        },
      ];
    }
    if (sourceAdjustment?.closeSourceAfterPlay) closePlayerCard(state, playerId, sourceAdjustment.sourceInstanceId, definitions);
    if (definition.isSkill === true) markSkillRevealedThisRound(state, playerId);
    triggerStructuredCardPlayEffects(state, instanceId, definitions);
  }
  applyPairedPlayOtherPersistentModifiers(state, playedFaceUpInstanceIds, definitions);
  const activeDefinitions = [...player.attack, ...playedFaceUpInstanceIds]
    .map((instanceId) => definitions[state.cards[instanceId]?.definitionId ?? ""])
    .filter(Boolean);
  if (activeDefinitions.some((definition) => definition.tags?.includes("primitive-dragon"))) {
    for (const instanceId of playedFaceUpInstanceIds) {
      const instance = state.cards[instanceId];
      const definition = definitions[instance.definitionId];
      if (getCardPlayCost(state, definition, player, instance, definitions) < 3) continue;
      instance.powerModifiers = [
        ...(instance.powerModifiers ?? []),
        {
          id: `primitive-dragon:${state.round}:${instanceId}`,
          sourceId: "master.tiamat.beast.primitive-dragon",
          kind: "add",
          value: 2,
          duration: "round",
        },
      ];
    }
  }
  for (const instanceId of playedFaceDownInstanceIds) {
    const instance = state.cards[instanceId];
    instance.face = "down";
    instance.active = false;
    instance.paidCost = 0;
    movePlayerCard(state, playerId, instanceId, "attack");
  }
  for (const instanceId of setAsideInstanceIds) {
    const instance = state.cards[instanceId];
    movePlayerCard(state, playerId, instanceId, "removed");
    instance.face = "down";
    instance.active = false;
    instance.residual = false;
    instance.paidCost = 0;
    instance.setAsideForCombat = { sourceId: setAsideSourceId, round: state.round };
  }
  let followupInstanceId: string | undefined;
  if (faceDownFollowup) {
    const followupDefinition = definitions[faceDownFollowup.definitionId];
    const baseId = `${playerId}:face-down-followup:${faceDownFollowup.sourceDefinitionId}:round-${state.round}`;
    followupInstanceId = state.cards[baseId] ? `${baseId}:${state.revision}` : baseId;
    const followup = createDerivedCardInstance(state, playerId, {
      instanceId: followupInstanceId,
      definitionId: faceDownFollowup.definitionId,
      zone: "attack",
      face: "up",
      active: true,
      residual: followupDefinition.residual === true,
      sourceEffectId: `${faceDownFollowup.sourceDefinitionId}:face-down-attack-followup`,
      createdByPlayerId: playerId,
    });
    followup.paidCost = 0;
    // The authored alternate attack says to *add* the follow-up card, not play it.
    // Preserve effect-join semantics: no play count, on-play trigger or true-name reveal.
    followup.joinedAttackRound = state.round;
  }
  state.step = player.flags.actionPlayBeforeMove === true ? "move-decision" : "settlement";
  const hasBasicAttack = playedFaceUpInstanceIds.some((instanceId) => definitions[state.cards[instanceId].definitionId]?.basic === true);
  const drawRequests = [
    ...playedInstanceIds
      .map((instanceId) => ({ instanceId, definition: definitions[state.cards[instanceId].definitionId] }))
      .filter(({ definition }) => Number(definition?.drawOnPlay ?? 0) > 0)
      .map(({ instanceId, definition }) => ({ sourceInstanceId: instanceId, count: Number(definition.drawOnPlay) })),
    ...(hasBasicAttack ? playedFaceUpInstanceIds
      .map((instanceId) => ({ instanceId, definition: definitions[state.cards[instanceId].definitionId] }))
      .filter(({ definition }) => Number(definition?.playDrawIfWithBasicAttack ?? 0) > 0)
      .map(({ instanceId, definition }) => ({ sourceInstanceId: instanceId, count: Number(definition.playDrawIfWithBasicAttack) }))
      : []),
  ];
  const playEffectRequests = playedFaceUpInstanceIds.flatMap((instanceId) => {
    const definition = definitions[state.cards[instanceId].definitionId];
    if (!definition?.effects?.length || definition.unparsedEffects?.length) return [];
    return definition.effects
      .filter((effect) => ["draw-cards", "gain-mana", "gain-victory-points", "restore-command-seal"].includes(effect.kind))
      .map((effect) => ({ sourceInstanceId: instanceId, effect }));
  });
  return {
    paidMana,
    committed: followupInstanceId ? [...all, followupInstanceId] : all,
    setAsideInstanceIds: [...setAsideInstanceIds],
    cards: [...playedInstanceIds, ...(followupInstanceId ? [followupInstanceId] : [])].map((instanceId) => {
      const instance = state.cards[instanceId];
      const definition = definitions[instance.definitionId];
      return {
        instanceId,
        definitionId: instance.definitionId,
        face: instance.face,
        paidMana: instance.paidCost ?? 0,
        attributes: getCardInstanceAttributes(instance, definition, state, definitions),
        revealsTrueName: instance.face === "up"
          && definition.isSkill === true
          && definition.skillOwnerType === "servant"
          && (definition.revealsTrueNameOnPlay === true
            || (optionalFreePlayIds.has(instanceId) && definition.optionalFreePlay?.revealTrueName === true)),
      };
    }),
    drawRequests,
    playEffectRequests,
  };
}

const BASIC_SPECIAL_CONVERSION_TARGETS: Readonly<Record<number, string>> = Object.freeze({
  2: "card.cardpreparation",
  3: "card.cardsurveil",
  4: "card.cardluck",
});

function wantsBasicSpecialConversion(playData: StandardAttackPlayData, instanceId: string, definitionId: string): boolean {
  const data = playData.cardDataByInstanceId?.[instanceId] ?? playData.cardDataByDefinitionId?.[definitionId];
  return isRecord(data) && data.basicSpecialConversion === true;
}

function applyBasicSpecialConversions(
  state: GameState,
  playerId: string,
  faceUpInstanceIds: string[],
  faceDownInstanceIds: string[],
  definitions: Record<string, CardDefinition>,
  playData: StandardAttackPlayData,
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
  const selected = [...faceUpInstanceIds, ...faceDownInstanceIds];
  const requested = selected.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && wantsBasicSpecialConversion(playData, instanceId, card.definitionId));
  });
  if (requested.length === 0) return [];
  if (Number(player.flags.basicSpecialConversionRound ?? -1) !== state.round) throw new Error("BASIC_SPECIAL_CONVERSION_NOT_AVAILABLE");
  const sourceId = typeof player.flags.basicSpecialConversionSourceId === "string" ? player.flags.basicSpecialConversionSourceId : undefined;
  if (!sourceId) throw new Error("BASIC_SPECIAL_CONVERSION_SOURCE_MISSING");

  const transformed: string[] = [];
  for (const instanceId of requested) {
    if (faceDownInstanceIds.includes(instanceId)) throw new Error("BASIC_SPECIAL_CONVERSION_FACE_UP_REQUIRED");
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || definition.basic !== true || card.temporaryDefinitionCopy
      || getCardAttributes(definition).includes("特殊")) throw new Error("BASIC_SPECIAL_CONVERSION_CARD_INVALID");
    const printedPower = Number(definition.basePower);
    const targetDefinitionId = BASIC_SPECIAL_CONVERSION_TARGETS[printedPower];
    const target = targetDefinitionId ? definitions[targetDefinitionId] : undefined;
    if (!target || target.basic !== true || !getCardAttributes(target).includes("特殊") || Number(target.basePower) !== printedPower) {
      throw new Error("BASIC_SPECIAL_CONVERSION_TARGET_MISSING");
    }
    applyTemporaryCardDefinitionById(state, instanceId, targetDefinitionId, definitions, { sourceId, expiresRound: state.round });
    transformed.push(instanceId);
  }
  return transformed;
}

/**
 * Standard attack entrypoint with an atomic, data-driven basic-to-Special
 * conversion hook. Callers explicitly opt individual cards in through
 * cardData.basicSpecialConversion; no display text is parsed.
 */
export function commitStandardAttack(
  state: GameState,
  playerId: string,
  faceUpInstanceIds: string[],
  faceDownInstanceIds: string[],
  definitions: Record<string, CardDefinition>,
  playData: StandardAttackPlayData = {},
): ReturnType<typeof commitStandardAttackInternal> {
  const selected = [...faceUpInstanceIds, ...faceDownInstanceIds];
  const hasRequestedConversion = selected.some((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && wantsBasicSpecialConversion(playData, instanceId, card.definitionId));
  });
  if (!hasRequestedConversion) return commitStandardAttackInternal(state, playerId, faceUpInstanceIds, faceDownInstanceIds, definitions, playData);

  const trial = structuredClone(state) as GameState;
  applyBasicSpecialConversions(trial, playerId, faceUpInstanceIds, faceDownInstanceIds, definitions, playData);
  commitStandardAttackInternal(trial, playerId, faceUpInstanceIds, faceDownInstanceIds, definitions, playData);

  const transformed = applyBasicSpecialConversions(state, playerId, faceUpInstanceIds, faceDownInstanceIds, definitions, playData);
  try {
    return commitStandardAttackInternal(state, playerId, faceUpInstanceIds, faceDownInstanceIds, definitions, playData);
  } catch (error) {
    for (const instanceId of transformed.reverse()) restoreTemporaryCardDefinitionCopy(state.cards[instanceId]);
    throw error;
  }
}

/**
 * Add an already-owned card to the current attack as an effect.
 * This is deliberately separate from commitStandardAttack: effect-added cards
 * do not consume the normal two-card quota and are free unless the effect says otherwise.
 */
export function joinOwnedCardToAttack(
  state: GameState,
  playerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  options: { manaCost?: number; allowedSourceZones?: CardZone[] } = {},
): { paidMana: number } {
  const player = state.players[playerId];
  const instance = state.cards[instanceId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  if (!instance || instance.ownerPlayerId !== playerId) throw new Error("CARD_INSTANCE_NOT_OWNED");
  const allowedSourceZones = options.allowedSourceZones ?? ["hand"];
  if (!allowedSourceZones.includes(instance.zone)) throw new Error("CARD_JOIN_SOURCE_ZONE_FORBIDDEN");
  const definition = definitions[instance.definitionId];
  if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");
  const paidMana = Number(options.manaCost ?? 0);
  if (!Number.isInteger(paidMana) || paidMana < 0) throw new Error("CARD_JOIN_MANA_COST_INVALID");
  payManaCost(state, player, paidMana, definitions);
  if (paidMana > 0) player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + paidMana;
  movePlayerCard(state, playerId, instanceId, "attack");
  instance.face = "up";
  instance.active = true;
  instance.joinedAttackRound = state.round;
  applyCardResidualState(state, player, instance, definition);
  // FQA distinguishes "join the attack" from "play a card": the explicit
  // ability payment is not the card's paid play cost and no play trigger fires.
  instance.paidCost = 0;
  player.flags.illyaRoundAttackCommitted = true;
  player.flags.illyaRoundFaceUpAttack = true;
  return { paidMana };
}

export function addCardToAttack(
  state: GameState,
  playerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  options: { payCost?: boolean; exactManaCost?: number; bypassSkillEightMana?: boolean; allowedSourceZones?: CardZone[]; bypassFaceUpPlayLimit?: boolean; bypassTiming?: boolean; recordFaceUpPlay?: boolean; playPrerequisiteDiscardInstanceIds?: string[]; sharedManaPayerPlayerId?: string } = {},
): { paidMana: number } {
  const definition = assertCardCanEnterAttack({ state, playerId, instanceId, definitions, faceDown: false, bypassSkillEightMana: options.bypassSkillEightMana, allowedSourceZones: options.allowedSourceZones, bypassTiming: options.bypassTiming });
  const player = state.players[playerId];
  const instance = state.cards[instanceId];
  if (options.bypassFaceUpPlayLimit !== true) assertFaceUpCardPlayAllowed(state, playerId, 1, definitions);
  player.flags.illyaRoundAttackCommitted = true;
  player.flags.illyaRoundFaceUpAttack = true;
  const prerequisiteClosures = resolvePlayPrerequisiteClosures(state, playerId, [definition], definitions);
  const prerequisiteDiscards = resolvePlayPrerequisiteDiscards(state, playerId, [{
    instanceId,
    definition,
    data: { playPrerequisiteDiscardInstanceIds: options.playPrerequisiteDiscardInstanceIds },
  }], definitions, new Set([instanceId]));
  const paidMana = options.exactManaCost !== undefined
    ? Number(options.exactManaCost)
    : (options.payCost ? getCardPlayCost(state, definition, player, instance, definitions) : 0);
  if (!Number.isInteger(paidMana) || paidMana < 0) throw new Error("CARD_PLAY_EXACT_MANA_COST_INVALID");
  const sharedMana = resolveActiveAttackManaShare(state, playerId, options.sharedManaPayerPlayerId, paidMana, definitions);
  const actorPaidMana = paidMana - Number(sharedMana?.amount ?? 0);
  const commandSealPlayCost = Number(definition.commandSealPlayCost ?? 0);
  if (!Number.isInteger(commandSealPlayCost) || commandSealPlayCost < 0) throw new Error("COMMAND_SEAL_PLAY_COST_INVALID");
  if (commandSealPlayCost > 0) assertCommandSealCostPayable(state, playerId, commandSealPlayCost);
  const victoryPointPlayCost = getEffectiveVictoryPointPlayCost(state, player, instance, definition);
  if (player.victoryPoints < victoryPointPlayCost) throw new Error("INSUFFICIENT_VICTORY_POINTS");
  const actorPayment = payManaCost(state, player, actorPaidMana, definitions);
  if (sharedMana) payManaCost(state, state.players[sharedMana.payerPlayerId], sharedMana.amount, definitions);
  if (commandSealPlayCost > 0) payCommandSealCost(state, playerId, commandSealPlayCost);
  player.victoryPoints -= victoryPointPlayCost;
  consumePlayPrerequisiteClosures(state, playerId, prerequisiteClosures, definitions);
  consumePlayPrerequisiteDiscards(state, playerId, prerequisiteDiscards);
  recordPlayedCardsThisRound(state, playerId, [definition]);
  if (actorPaidMana > 0) player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + actorPaidMana;
  if (sharedMana) {
    const payer = state.players[sharedMana.payerPlayerId];
    payer.flags.roundManaSpent = Number(payer.flags.roundManaSpent ?? 0) + sharedMana.amount;
  }
  if (options.recordFaceUpPlay !== false) recordFaceUpCardPlay(state, playerId, 1);
  instance.face = "up";
  instance.active = true;
  applyCardResidualState(state, player, instance, definition);
  if (!cardIgnoresUsageLimit(state, player, instance)) markCardUsage(instance, getCardRuleUsageLimitOverride(state, player, instance) ?? getEffectiveCardUsageLimit(instance, definition.limit), state.round, state.phase);
  instance.paidCost = paidMana;
  instance.playManaPayerPlayerId = player.id;
  instance.playManaContributions = actorPayment.contributions
    .filter((entry) => !entry.sourceInstanceId || entry.sourceInstanceId === instanceId)
    .map((entry) => ({ playerId: entry.contributorPlayerId, amount: entry.amount }));
  instance.playedRound = state.round;
    instance.playedLocationId = player.locationId;
  instance.playCount = Number(instance.playCount ?? 0) + 1;
  movePlayerCard(state, playerId, instanceId, "attack");
  if (definition.isSkill === true) markSkillRevealedThisRound(state, playerId);
  triggerStructuredCardPlayEffects(state, instanceId, definitions);
  return { paidMana };
}

/**
 * Play one owned physical card face-down as an explicit card effect. This is a
 * real play (round play accounting and physical attack placement apply) but it
 * pays no mana and exposes no card identity/attributes to public events. The
 * caller owns the public `card.played` event so hidden information stays hidden.
 */
export function playCardFaceDownByEffect(
  state: GameState,
  playerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  options: { allowedSourceZones?: CardZone[]; allowSkillCard?: boolean } = {},
): { definitionId: string } {
  const definition = assertCardCanEnterAttack({
    state,
    playerId,
    instanceId,
    definitions,
    faceDown: true,
    allowedSourceZones: options.allowedSourceZones ?? ["hand"],
    bypassTiming: true,
    bypassSkillEightMana: options.allowSkillCard === true,
    bypassSkillFaceDown: options.allowSkillCard === true,
  });
  const player = state.players[playerId];
  const instance = state.cards[instanceId];
  recordPlayedCardsThisRound(state, playerId, [definition]);
  movePlayerCard(state, playerId, instanceId, "attack");
  instance.face = "down";
  instance.active = false;
  instance.residual = false;
  instance.paidCost = 0;
  instance.playedRound = state.round;
  instance.playedLocationId = player.locationId;
  instance.playCount = Number(instance.playCount ?? 0) + 1;
  player.flags.illyaRoundAttackCommitted = true;
  return { definitionId: definition.id };
}

/**
 * Play another player's physical hand card under the acting player's control.
 * Ownership never changes; when the borrowed card closes it returns to the
 * original owner's discard through the generic borrowed-card lifecycle.
 */
export function playBorrowedCardToAttack(
  state: GameState,
  playerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  options: { allowedSourceZones?: CardZone[]; minimumManaCost?: number; exactManaCost?: number; bypassFaceUpPlayLimit?: boolean; bypassSkillEightMana?: boolean; playPrerequisiteDiscardInstanceIds?: string[] } = {},
): { paidMana: number; ownerPlayerId: string } {
  const player = state.players[playerId];
  const instance = state.cards[instanceId];
  const ownerPlayerId = instance?.ownerPlayerId ?? undefined;
  const owner = ownerPlayerId ? state.players[ownerPlayerId] : undefined;
  const allowedSourceZones = options.allowedSourceZones ?? ["hand"];
  if (!player || player.eliminated || !instance || !owner || ownerPlayerId === playerId || !allowedSourceZones.includes(instance.zone)) {
    throw new Error("BORROWED_CARD_NOT_AVAILABLE");
  }
  const definition = assertCardCanEnterAttack({
    state,
    playerId,
    instanceId,
    definitions,
    faceDown: false,
    allowedSourceZones,
    allowBorrowedCard: true,
    bypassSkillEightMana: options.bypassSkillEightMana === true,
  });
  if (options.bypassFaceUpPlayLimit !== true) assertFaceUpCardPlayAllowed(state, playerId, 1, definitions);
  const prerequisiteClosures = resolvePlayPrerequisiteClosures(state, playerId, [definition], definitions);
  const prerequisiteDiscards = resolvePlayPrerequisiteDiscards(state, playerId, [{
    instanceId,
    definition,
    data: { playPrerequisiteDiscardInstanceIds: options.playPrerequisiteDiscardInstanceIds },
  }], definitions, new Set([instanceId]));
  const normalCost = getCardPlayCost(state, definition, player, instance, definitions);
  const minimumManaCost = Number(options.minimumManaCost ?? 0);
  if (!Number.isInteger(minimumManaCost) || minimumManaCost < 0) throw new Error("BORROWED_CARD_MINIMUM_MANA_COST_INVALID");
  const exactManaCost = options.exactManaCost === undefined ? undefined : Number(options.exactManaCost);
  if (exactManaCost !== undefined && (!Number.isInteger(exactManaCost) || exactManaCost < 0)) throw new Error("BORROWED_CARD_EXACT_MANA_COST_INVALID");
  const paidMana = exactManaCost ?? Math.max(normalCost, minimumManaCost);
  payManaCost(state, player, paidMana, definitions);
  consumePlayPrerequisiteClosures(state, playerId, prerequisiteClosures, definitions);
  consumePlayPrerequisiteDiscards(state, playerId, prerequisiteDiscards);
  recordPlayedCardsThisRound(state, playerId, [definition]);
  if (paidMana > 0) player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + paidMana;
  recordFaceUpCardPlay(state, playerId, 1);
  for (const zoneKey of ["hand", "deck", "discard", "attack", "masterSkills", "servantSkills"] as const) owner[zoneKey] = owner[zoneKey].filter((id) => id !== instanceId);
  player.attack.push(instanceId);
  instance.zone = "attack";
  instance.controllerPlayerId = playerId;
  delete instance.attachedToInstanceId;
  delete instance.attachmentOrder;
  delete instance.attachmentPlacedRound;
  instance.face = "up";
  instance.active = true;
  applyCardResidualState(state, player, instance, definition);
  if (!cardIgnoresUsageLimit(state, player, instance)) markCardUsage(instance, getCardRuleUsageLimitOverride(state, player, instance) ?? getEffectiveCardUsageLimit(instance, definition.limit), state.round, state.phase);
  instance.paidCost = paidMana;
  instance.playedRound = state.round;
    instance.playedLocationId = player.locationId;
  instance.playCount = Number(instance.playCount ?? 0) + 1;
  instance.returnToOwnerDiscardOnClose = true;
  player.flags.illyaRoundAttackCommitted = true;
  player.flags.illyaRoundFaceUpAttack = true;
  triggerStructuredCardPlayEffects(state, instanceId, definitions);
  return { paidMana, ownerPlayerId };
}

export function playBorrowedHandCardToAttack(
  state: GameState,
  playerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): { paidMana: number; ownerPlayerId: string } {
  return playBorrowedCardToAttack(state, playerId, instanceId, definitions, { allowedSourceZones: ["hand"] });
}

/**
 * Borrow the physical top card of another player's deck into the controller's
 * attack without treating it as a normal card play. Ownership never changes;
 * the caller may later close the card to return it to the original owner's
 * discard through the shared borrowed-card lifecycle.
 */
export function borrowTopDeckCardToAttack(
  state: GameState,
  controllerPlayerId: string,
  ownerPlayerId: string,
  definitions: Record<string, CardDefinition>,
): { instanceId: string; definitionId: string } {
  const controller = state.players[controllerPlayerId];
  const owner = state.players[ownerPlayerId];
  if (!controller || controller.eliminated || !owner || owner.eliminated || ownerPlayerId === controllerPlayerId) {
    throw new Error("BORROWED_DECK_PLAYER_INVALID");
  }
  const instanceId = owner.deck[0];
  const instance = instanceId ? state.cards[instanceId] : undefined;
  const definition = instance ? definitions[instance.definitionId] : undefined;
  if (!instanceId || !instance || !definition || instance.ownerPlayerId !== ownerPlayerId || instance.zone !== "deck") {
    throw new Error("BORROWED_DECK_CARD_NOT_AVAILABLE");
  }
  owner.deck = owner.deck.filter((id) => id !== instanceId);
  controller.attack.push(instanceId);
  instance.zone = "attack";
  instance.controllerPlayerId = controllerPlayerId;
  instance.face = "up";
  instance.active = true;
  instance.residual = definition.residual === true;
  instance.paidCost = 0;
  instance.returnToOwnerDiscardOnClose = true;
  return { instanceId, definitionId: definition.id };
}

/** Atomically plays a bounded set of cards from hand as an effect-added attack. */
export function addCardsToAttack(
  state: GameState,
  playerId: string,
  instanceIds: string[],
  definitions: Record<string, CardDefinition>,
  rule: { maxCount: number; maxBasePower: number },
): { paidMana: number; committed: string[]; cards: Array<{ instanceId: string; definitionId: string; paidMana: number; revealsTrueName: boolean }> } {
  if (!Array.isArray(instanceIds) || instanceIds.length > rule.maxCount) throw new Error("APPEND_CARD_COUNT_INVALID");
  if (new Set(instanceIds).size !== instanceIds.length) throw new Error("DUPLICATE_CARD_INSTANCE");
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  if (state.phase !== "action" || state.activePlayerId !== playerId) throw new Error("PLAY_WINDOW_FORBIDDEN");
  const validated = instanceIds.map((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!definition || getPrintedCardBasePower(state, player, definition) > rule.maxBasePower) throw new Error("APPEND_CARD_POWER_FORBIDDEN");
    if (!instance || instance.zone !== "hand") throw new Error("APPEND_CARD_FROM_HAND_REQUIRED");
    assertCardCanEnterAttack({ state, playerId, instanceId, definitions, faceDown: false });
    return { instanceId, definition };
  });
  assertFaceUpCardPlayAllowed(state, playerId, validated.length, definitions);
  const prerequisiteClosures = resolvePlayPrerequisiteClosures(state, playerId, validated.map(({ definition }) => definition), definitions);
  const paidMana = validated.reduce((sum, { instanceId, definition }) => sum + getCardPlayCost(state, definition, player, state.cards[instanceId], definitions), 0);
  payManaCost(state, player, paidMana, definitions);
  consumePlayPrerequisiteClosures(state, playerId, prerequisiteClosures, definitions);
  recordPlayedCardsThisRound(state, playerId, validated.map(({ definition }) => definition));
  recordFaceUpCardPlay(state, playerId, validated.length);
  if (validated.length > 0) {
    player.flags.illyaRoundAttackCommitted = true;
    player.flags.illyaRoundFaceUpAttack = true;
  }
  for (const { instanceId, definition } of validated) {
    const instance = state.cards[instanceId];
    instance.face = "up";
    instance.active = true;
    applyCardResidualState(state, player, instance, definition);
    if (!cardIgnoresUsageLimit(state, player, instance)) markCardUsage(instance, getCardRuleUsageLimitOverride(state, player, instance) ?? getEffectiveCardUsageLimit(instance, definition.limit), state.round, state.phase);
    instance.paidCost = getCardPlayCost(state, definition, player, instance, definitions);
    instance.playedRound = state.round;
    instance.playedLocationId = player.locationId;
    instance.trueNameRevealedWhenPlayed = player.trueNameRevealed;
    instance.playCount = Number(instance.playCount ?? 0) + 1;
    movePlayerCard(state, playerId, instanceId, "attack");
    if (definition.isSkill === true) markSkillRevealedThisRound(state, playerId);
    triggerStructuredCardPlayEffects(state, instanceId, definitions);
  }
  return {
    paidMana,
    committed: [...instanceIds],
    cards: validated.map(({ instanceId, definition }) => ({
      instanceId,
      definitionId: definition.id,
      paidMana: state.cards[instanceId].paidCost ?? 0,
      revealsTrueName: definition.isSkill === true
        && definition.skillOwnerType === "servant"
        && definition.revealsTrueNameOnPlay === true,
    })),
  };
}
