import type { CardInstance, GameState } from "../domain/state/types.ts";
import { removePhysicalCardFromGame, restoreSequesteredCardsOnPlayerElimination, restoreTemporaryCardDefinitionCopy } from "./decks.ts";

export interface PlayerEliminationResult {
  eliminated: boolean;
  restoredInstanceIds: string[];
  removedControlledInstanceIds: string[];
}

function isInAnotherPlayersOrdinaryZone(state: GameState, targetPlayerId: string, instanceId: string): boolean {
  return Object.values(state.players).some((player) => player.id !== targetPlayerId
    && (player.hand.includes(instanceId) || player.deck.includes(instanceId) || player.discard.includes(instanceId)));
}

function belongsToEliminatedCharacter(card: CardInstance, target: GameState["players"][string]): boolean {
  if (target.masterId && card.originMasterId === target.masterId) return true;
  if (target.servantId && card.originServantId === target.servantId) return true;
  if (card.ownerPlayerId !== target.id) return false;
  // Preserve a clearly foreign-origin card that this player acquired later.
  if (card.originMasterId && card.originMasterId !== target.masterId) return false;
  if (card.originServantId && card.originServantId !== target.servantId) return false;
  return true;
}

/**
 * Apply the base elimination lifecycle after all prevention/replacement checks.
 * Character components leave the game, except the eliminated character's cards
 * already sitting in another player's hand/deck/discard. Source-bound ongoing
 * and lingering rules stop immediately.
 */
export function finalizePlayerElimination(state: GameState, targetPlayerId: string): PlayerEliminationResult {
  const target = state.players[targetPlayerId];
  if (!target || target.eliminated) return { eliminated: false, restoredInstanceIds: [], removedControlledInstanceIds: [] };
  target.eliminated = true;
  target.locationId = null;
  for (const locationId of Object.keys(state.board.locations)) {
    state.board.locations[locationId] = state.board.locations[locationId].filter((id) => id !== target.id);
  }

  const restoredInstanceIds = restoreSequesteredCardsOnPlayerElimination(state, target.id);
  const removedControlledInstanceIds: string[] = [];
  const removeIds = new Set<string>();

  for (const card of Object.values(state.cards)) {
    if (card.controllerPlayerId === target.id && card.ownerPlayerId !== target.id && card.removeWithControllerOnElimination === true) {
      removedControlledInstanceIds.push(card.instanceId);
      removeIds.add(card.instanceId);
      continue;
    }
    if (belongsToEliminatedCharacter(card, target) && !isInAnotherPlayersOrdinaryZone(state, target.id, card.instanceId)) {
      removeIds.add(card.instanceId);
      continue;
    }
    // Temporary cards/copies created by this player's effects cease with them,
    // even when another player currently controls the generated object.
    if (card.createdByPlayerId === target.id && (card.temporary || card.derivedFromInstanceId !== undefined)) {
      removeIds.add(card.instanceId);
    }
  }

  const removedDefinitionIds = new Set<string>();
  for (const instanceId of removeIds) {
    const card = state.cards[instanceId];
    if (!card || card.zone === "removed") continue;
    removedDefinitionIds.add(card.definitionId);
    removePhysicalCardFromGame(state, instanceId);
  }

  // A temporary printed-face copy on somebody else's physical card is an
  // ongoing source-bound transformation, not a new component: restore it.
  for (const card of Object.values(state.cards)) {
    if (!card.temporaryDefinitionCopy) continue;
    const sourceInstanceId = card.temporaryDefinitionCopy.sourceId;
    if (removeIds.has(sourceInstanceId) || removedDefinitionIds.has(sourceInstanceId)) restoreTemporaryCardDefinitionCopy(card);
  }

  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) =>
    modifier.controllerPlayerId !== target.id && (!modifier.sourceInstanceId || !removeIds.has(modifier.sourceInstanceId)));
  state.scheduledEffects = (state.scheduledEffects ?? []).filter((effect) =>
    effect.controllerPlayerId !== target.id && !removedDefinitionIds.has(effect.sourceId));

  for (const player of Object.values(state.players)) {
    player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) =>
      !removedDefinitionIds.has(modifier.sourceId) && (!modifier.sourceInstanceId || !removeIds.has(modifier.sourceInstanceId)));
    if (player.cardRuleModifiers.length === 0) delete player.cardRuleModifiers;
    player.stackedStatusModifiers = (player.stackedStatusModifiers ?? []).filter((status) => status.sourcePlayerId !== target.id);
    if (player.stackedStatusModifiers.length === 0) delete player.stackedStatusModifiers;
    player.skillUseBlocks = (player.skillUseBlocks ?? []).filter((block) => block.sourcePlayerId !== target.id && !removedDefinitionIds.has(block.sourceId));
    if (player.skillUseBlocks.length === 0) delete player.skillUseBlocks;
    player.abilityReuseGrants = (player.abilityReuseGrants ?? []).filter((grant) => !removedDefinitionIds.has(grant.sourceId));
    if (player.abilityReuseGrants.length === 0) delete player.abilityReuseGrants;
    player.resourcePowerRules = (player.resourcePowerRules ?? []).filter((rule) => !removedDefinitionIds.has(rule.sourceId));
    if (player.resourcePowerRules.length === 0) delete player.resourcePowerRules;
    player.servantAttackPartitionRules = (player.servantAttackPartitionRules ?? []).filter((rule) =>
      rule.servantId !== target.servantId && !removedDefinitionIds.has(rule.sourceId));
    if (player.servantAttackPartitionRules.length === 0) delete player.servantAttackPartitionRules;
    if (player.roundPlayRestriction && removedDefinitionIds.has(player.roundPlayRestriction.sourceId)) delete player.roundPlayRestriction;
  }

  return { eliminated: true, restoredInstanceIds, removedControlledInstanceIds };
}

/**
 * Apply an explicit card/effect elimination immediately.
 * This is separate from Climax elimination so Climax-only prevention/replacement
 * rules are not accidentally consumed by a direct "eliminate that player" effect.
 */
export function eliminatePlayerByEffect(
  state: GameState,
  targetPlayerId: string,
): PlayerEliminationResult {
  return finalizePlayerElimination(state, targetPlayerId);
}
