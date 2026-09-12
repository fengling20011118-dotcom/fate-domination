import type { CardInstance, GameState } from "../domain/state/types.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { getClosedCardZone, isSkillCard } from "./card-semantics.ts";
import { getStructuredStandardAttackCardCountRule, isStructuredCardCloseForbidden, isStructuredCardDrawForbidden } from "./rule-modifiers.ts";
import { cardPreventsOpponentClose, getCardCloseDeferralSourceIds } from "./card-rule-modifiers.ts";
import { returnNamedSideDeckCardToDiscard } from "./named-side-decks.ts";
import { consumeAutomaticDeckRecycleKeepChoice } from "./deck-recycle-choice.ts";
import { automaticDeckRecycleIsBlocked, resolvePlayerCardDestination } from "./deck-entry-rules.ts";
import { resetActivatedAbilityUsageAfterLeavingPlay } from "./usage-limits.ts";

export interface OwnedCardCreateOptions {
  instanceId: string;
  definitionId: string;
  originMasterId?: string;
  originServantId?: string;
  zone: "hand" | "deck" | "discard" | "attack" | "removed" | "master-skills" | "servant-skills" | "board" | "side-deck" | "side-hand" | "side-discard";
  /** Stable named side-deck provenance; required for side-* zones. */
  namedSideDeckId?: string;
  boardLocationId?: string;
  face?: "up" | "down";
  active?: boolean;
  residual?: boolean;
  temporary?: boolean;
  temporaryCleanup?: "round-end" | "explicit";
  createdByEffectId?: string;
  createdByPlayerId?: string;
  derivedFromInstanceId?: string;
}

export interface DerivedCardCreateOptions extends Omit<OwnedCardCreateOptions, "createdByEffectId"> {
  /** The serialized effect that created this physical card instance. */
  sourceEffectId: string;
}

/** Creates one physical card instance and attaches it to the owner's zone list. */
export function createOwnedCardInstance(state: GameState, playerId: string, options: OwnedCardCreateOptions): CardInstance {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  if (!options.instanceId || !options.definitionId) throw new Error("CARD_INSTANCE_INPUT_INVALID");
  if (options.createdByEffectId !== undefined && (typeof options.createdByEffectId !== "string" || options.createdByEffectId.length === 0)) {
    throw new Error("CARD_SOURCE_EFFECT_INVALID");
  }
  if (state.cards[options.instanceId]) throw new Error("CARD_INSTANCE_ID_DUPLICATE");
  if (options.zone === "board") {
    if (typeof options.boardLocationId !== "string" || !state.board.locations[options.boardLocationId]) throw new Error("CARD_BOARD_LOCATION_INVALID");
  } else if (options.boardLocationId !== undefined) {
    throw new Error("CARD_BOARD_LOCATION_INVALID");
  }
  if ((options.zone === "side-deck" || options.zone === "side-hand" || options.zone === "side-discard")
    && (typeof options.namedSideDeckId !== "string" || options.namedSideDeckId.length === 0)) {
    throw new Error("NAMED_SIDE_DECK_ID_REQUIRED");
  }
  const instance: CardInstance = {
    instanceId: options.instanceId,
    definitionId: options.definitionId,
    ownerPlayerId: playerId,
    controllerPlayerId: playerId,
    ...(options.originMasterId ? { originMasterId: options.originMasterId } : {}),
    ...(options.originServantId ? { originServantId: options.originServantId } : {}),
    ...(options.namedSideDeckId ? { namedSideDeckId: options.namedSideDeckId } : {}),
    zone: options.zone,
    face: options.face ?? (options.zone === "master-skills" || options.zone === "servant-skills" ? "up" : "down"),
    active: options.active ?? false,
    residual: options.residual ?? false,
    temporary: options.temporary ?? false,
    ...(options.boardLocationId ? { boardLocationId: options.boardLocationId } : {}),
    ...(options.temporaryCleanup ? { temporaryCleanup: options.temporaryCleanup } : {}),
    modifiers: [],
    ...(options.createdByEffectId ? { createdByEffectId: options.createdByEffectId } : {}),
    ...(options.createdByPlayerId ? { createdByPlayerId: options.createdByPlayerId } : {}),
    ...(options.derivedFromInstanceId ? { derivedFromInstanceId: options.derivedFromInstanceId } : {}),
  };
  state.cards[instance.instanceId] = instance;
  if (options.zone === "hand") player.hand.push(instance.instanceId);
  else if (options.zone === "deck") player.deck.push(instance.instanceId);
  else if (options.zone === "discard") player.discard.push(instance.instanceId);
  else if (options.zone === "attack") player.attack.push(instance.instanceId);
  else if (options.zone === "master-skills") player.masterSkills.push(instance.instanceId);
  else if (options.zone === "servant-skills") player.servantSkills.push(instance.instanceId);
  return instance;
}

/** Creates a generated/derived card with mandatory provenance metadata. */
export function createDerivedCardInstance(state: GameState, playerId: string, options: DerivedCardCreateOptions): CardInstance {
  if (typeof options.sourceEffectId !== "string" || options.sourceEffectId.length === 0) throw new Error("CARD_SOURCE_EFFECT_INVALID");
  return createOwnedCardInstance(state, playerId, { ...options, createdByEffectId: options.sourceEffectId });
}

/**
 * Creates a derived-card batch atomically: every instance ID, source effect and
 * owner is validated before the first card is attached to a player zone.
 */
export function createDerivedCardInstances(state: GameState, playerId: string, options: DerivedCardCreateOptions[]): CardInstance[] {
  if (!Array.isArray(options) || options.length === 0) throw new Error("CARD_BATCH_EMPTY");
  if (!state.players[playerId]) throw new Error("PLAYER_NOT_FOUND");
  const instanceIds = new Set<string>();
  for (const option of options) {
    if (!option || typeof option !== "object" || !option.instanceId || !option.definitionId) throw new Error("CARD_INSTANCE_INPUT_INVALID");
    if (instanceIds.has(option.instanceId) || state.cards[option.instanceId]) throw new Error("CARD_INSTANCE_ID_DUPLICATE");
    instanceIds.add(option.instanceId);
    if (typeof option.sourceEffectId !== "string" || option.sourceEffectId.length === 0) throw new Error("CARD_SOURCE_EFFECT_INVALID");
  }
  return options.map((option) => createDerivedCardInstance(state, playerId, option));
}

function removeFrom(list: string[], value: string): void {
  const index = list.indexOf(value);
  if (index >= 0) list.splice(index, 1);
}

function randomShuffle(values: string[], randomInt: (maxExclusive: number) => number): string[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function recordDeckShuffle(state: GameState, playerId: string, reason: "effect" | "automatic-recycle"): void {
  const sequence = Number(state.modeState.deckShuffleSequence ?? 0) + 1;
  if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new Error("DECK_SHUFFLE_SEQUENCE_INVALID");
  state.modeState.deckShuffleSequence = sequence;
  const ledger = Array.isArray(state.modeState.deckShuffleLedger)
    ? state.modeState.deckShuffleLedger.filter((entry) => entry && typeof entry === "object")
    : [];
  state.modeState.deckShuffleLedger = [...ledger, { sequence, playerId, round: state.round, reason }].slice(-128);
}

/** Shuffle one player's current attack deck without changing card zones. */
export function shufflePlayerDeck(state: GameState, playerId: string, randomInt: (maxExclusive: number) => number): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  player.deck = randomShuffle(player.deck, randomInt);
  recordDeckShuffle(state, playerId, "effect");
  return [...player.deck];
}

/**
 * Ensure a peek can observe up to `count` sequential deck cards without moving
 * them to hand. If the current deck would run out mid-peek, the discard pile is
 * shuffled underneath the existing deck, matching ordinary sequential draw
 * semantics while keeping the peeked physical cards in the deck zone.
 */
export function ensurePlayerDeckTopCards(
  state: GameState,
  playerId: string,
  count: number,
  randomInt: (maxExclusive: number) => number,
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  if (!Number.isInteger(count) || count < 0) throw new Error("DECK_PEEK_COUNT_INVALID");
  if (player.deck.length < count && player.discard.length > 0 && !automaticDeckRecycleIsBlocked(player)) {
    const shuffled = randomShuffle(player.discard, randomInt);
    player.deck = [...player.deck, ...shuffled];
    player.discard = [];
    for (const instanceId of shuffled) state.cards[instanceId].zone = "deck";
    recordDeckShuffle(state, playerId, "effect");
  }
  return player.deck.slice(0, count);
}

/** Move marked attack cards back to the owner's deck when that player loses. */
export function returnCardsToDeckOnDefeat(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  const returned = player.attack.filter((instanceId) => definitions[state.cards[instanceId]?.definitionId ?? ""]?.returnToDeckOnDefeat === true);
  const returnedToDeck: string[] = [];
  for (const instanceId of returned) {
    movePlayerCard(state, playerId, instanceId, "deck");
    const card = state.cards[instanceId];
    card.face = card.zone === "deck" ? "down" : "up";
    card.active = false;
    card.residual = false;
    if (card.zone === "deck") returnedToDeck.push(instanceId);
  }
  if (returnedToDeck.length > 0) player.deck = randomShuffle(player.deck, randomInt);
  return returned;
}

export function initializePlayerDeck(
  state: GameState,
  playerId: string,
  definitionIds: string[],
  randomInt: (maxExclusive: number) => number,
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  player.hand = [];
  player.deck = [];
  player.discard = [];
  player.attack = [];
  player.masterSkills = [];
  player.servantSkills = [];

  const instances: string[] = [];
  definitionIds.forEach((definitionId, index) => {
    const instanceId = `${playerId}:card:${index + 1}`;
    const instance: CardInstance = {
      instanceId,
      definitionId,
      ownerPlayerId: playerId,
      controllerPlayerId: playerId,
      ...(player.servantId ? { originServantId: player.servantId } : {}),
      zone: "deck",
      face: "down",
      active: false,
      residual: false,
      temporary: false,
      modifiers: [],
    };
    state.cards[instanceId] = instance;
    instances.push(instanceId);
  });
  player.deck = randomShuffle(instances, randomInt);
  // Stable rule fact used by effects whose X depends on the number of cards a
  // player actually started this game with. Record it before opening-hand draw.
  player.flags.startingDeckSize = instances.length;
  return instances;
}

export function initializePlayerSkillCards(
  state: GameState,
  playerId: string,
  skillIds: Array<{ id: string; ownerType: "master" | "servant" }>,
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  const instances: string[] = [];
  skillIds.forEach((skill, index) => {
    const instanceId = `${playerId}:skill:${index + 1}`;
    state.cards[instanceId] = {
      instanceId,
      definitionId: skill.id,
      ownerPlayerId: playerId,
      controllerPlayerId: playerId,
      ...(skill.ownerType === "master" ? { originMasterId: skill.id.split(".skill.")[0] } : {}),
      ...(skill.ownerType === "servant" ? { originServantId: skill.id.split(".skill.")[0] } : {}),
      zone: skill.ownerType === "master" ? "master-skills" : "servant-skills",
      face: skill.ownerType === "servant" ? "down" : "up",
      active: false,
      residual: false,
      temporary: false,
      modifiers: [],
    };
    (skill.ownerType === "master" ? player.masterSkills : player.servantSkills).push(instanceId);
    instances.push(instanceId);
  });
  return instances;
}

export function blockNormalCardDrawThroughRound(state: GameState, playerId: string, throughRound: number): void {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  if (!Number.isInteger(throughRound) || throughRound < state.round) throw new Error("CARD_DRAW_BLOCK_ROUND_INVALID");
  const current = Number(player.flags.normalCardDrawBlockedThroughRound ?? Number.NEGATIVE_INFINITY);
  player.flags.normalCardDrawBlockedThroughRound = Math.max(current, throughRound);
}

export function drawCards(
  state: GameState,
  playerId: string,
  count: number,
  randomInt: (maxExclusive: number) => number,
  definitions: Record<string, CardDefinition> = {},
  options: { ignoreDrawRestrictions?: boolean } = {},
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  if (!Number.isInteger(count) || count < 0) throw new Error("DRAW_COUNT_INVALID");
  if (options.ignoreDrawRestrictions !== true
    && Number(player.flags.normalCardDrawBlockedThroughRound ?? Number.NEGATIVE_INFINITY) >= state.round) return [];

  // State-based text such as Unlimited Blade Works closes as soon as the hand is
  // empty. Resolve that mandatory closure before evaluating a subsequent draw in
  // the same atomic effect, then re-check the continuous draw prohibition.
  if (player.hand.length === 0) {
    const countRule = getStructuredStandardAttackCardCountRule(state, playerId, definitions);
    if (countRule?.closeSourceWhenHandEmpty) {
      for (const instanceId of countRule.sourceInstanceIds) {
        const source = state.cards[instanceId];
        if (!source || source.ownerPlayerId !== playerId || source.zone !== "attack" || !source.active) continue;
        closePlayerCard(state, playerId, instanceId, definitions);
      }
    }
  }
  if (options.ignoreDrawRestrictions !== true && isStructuredCardDrawForbidden(state, playerId, definitions)) return [];
  const drawn: string[] = [];

  for (let draw = 0; draw < count; draw += 1) {
    if (player.deck.length === 0 && player.discard.length > 0 && !automaticDeckRecycleIsBlocked(player)) {
      const keptInDiscard = new Set(consumeAutomaticDeckRecycleKeepChoice(state, playerId, definitions) ?? []);
      const recycled = player.discard.filter((instanceId) => !keptInDiscard.has(instanceId));
      player.deck = randomShuffle(recycled, randomInt);
      player.discard = player.discard.filter((instanceId) => keptInDiscard.has(instanceId));
      for (const instanceId of player.deck) state.cards[instanceId].zone = "deck";
      recordDeckShuffle(state, playerId, "automatic-recycle");
    }
    const instanceId = player.deck[0];
    if (!instanceId) break;
    movePlayerCard(state, playerId, instanceId, "hand");
    const moved = state.cards[instanceId];
    // A charged card replaces its deck departure with a free face-up join to attack.
    // Ordinary draws still enter hand face-down/inactive.
    if (moved.zone === "hand") {
      moved.face = "down";
      moved.active = false;
    }
    drawn.push(instanceId);
  }
  return drawn;
}

export function placeOwnedCardOnBoard(
  state: GameState,
  playerId: string,
  instanceId: string,
  boardLocationId: string,
  options: {
    allowedSourceZones?: Array<"hand" | "master-skills" | "servant-skills" | "attack" | "board">;
    face?: "up" | "down";
    active?: boolean;
  } = {},
): void {
  const player = state.players[playerId];
  const card = state.cards[instanceId];
  if (!player || !card || card.ownerPlayerId !== playerId) throw new Error("CARD_INSTANCE_NOT_OWNED");
  if (!state.board.locations[boardLocationId]) throw new Error("CARD_BOARD_LOCATION_INVALID");
  const allowedSourceZones = options.allowedSourceZones ?? ["master-skills", "servant-skills", "attack", "board"];
  if (!allowedSourceZones.includes(card.zone as typeof allowedSourceZones[number])) throw new Error("CARD_BOARD_SOURCE_ZONE_INVALID");
  removeFrom(player.hand, instanceId);
  removeFrom(player.masterSkills, instanceId);
  removeFrom(player.servantSkills, instanceId);
  removeFrom(player.attack, instanceId);
  card.zone = "board";
  card.boardLocationId = boardLocationId;
  card.boardPlacedRound = state.round;
  card.face = options.face ?? "up";
  card.active = options.active ?? true;
}

/** Move an owned physical board card into a player's active attack without changing ownership. */
export function lendOwnedBoardCardToPlayerAttack(
  state: GameState,
  ownerPlayerId: string,
  controllerPlayerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): void {
  const owner = state.players[ownerPlayerId];
  const controller = state.players[controllerPlayerId];
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!owner || !controller || owner.eliminated || controller.eliminated) throw new Error("BOARD_CARD_LEND_PLAYER_INVALID");
  if (!card || !definition || card.ownerPlayerId !== ownerPlayerId || card.controllerPlayerId !== ownerPlayerId
    || card.zone !== "board" || !card.boardLocationId) throw new Error("BOARD_CARD_LEND_INVALID");
  for (const player of Object.values(state.players)) player.attack = player.attack.filter((id) => id !== instanceId);
  controller.attack.push(instanceId);
  card.zone = "attack";
  card.controllerPlayerId = controllerPlayerId;
  card.face = "up";
  card.active = true;
  card.residual = definition.residual === true;
  card.joinedAttackRound = state.round;
  delete card.boardLocationId;
  delete card.boardPlacedRound;
  if (ownerPlayerId !== controllerPlayerId) card.returnToOwnerDiscardOnClose = true;
  else delete card.returnToOwnerDiscardOnClose;
  delete card.returnToOwnerSkillZoneOnClose;
}

export function returnOwnedBoardCardToSkillZone(
  state: GameState,
  playerId: string,
  instanceId: string,
  destination: "master-skills" | "servant-skills",
): void {
  const player = state.players[playerId];
  const card = state.cards[instanceId];
  if (!player || !card || card.ownerPlayerId !== playerId) throw new Error("CARD_INSTANCE_NOT_OWNED");
  if (card.zone !== "board") throw new Error("CARD_NOT_ON_BOARD");
  if (destination === "master-skills") player.masterSkills.push(instanceId);
  else player.servantSkills.push(instanceId);
  clearCardStateBoundToClose(card);
  card.zone = destination;
  delete card.boardLocationId;
  delete card.boardPlacedRound;
  delete card.boardAttackWhileOwnerPresent;
  delete card.boardOpponentCardCostAura;
  delete card.boardOpponentMovementLockWhileOwnerPresent;
  delete card.boardSituationPowerModifierMultiplier;
  delete card.boardEventPowerModifierMultiplier;
  delete card.boardPowerModifierExemptPlayerIds;
  card.active = false;
  card.residual = false;
  card.face = "up";
}

export function movePlayerCard(
  state: GameState,
  playerId: string,
  instanceId: string,
  zone: "hand" | "deck" | "attack" | "discard" | "removed" | "master-skills" | "servant-skills",
  options: { ignoreDeckEntryRestriction?: boolean } = {},
): void {
  const player = state.players[playerId];
  const card = state.cards[instanceId];
  const borrowedSkillPlay = Boolean(card && card.ownerPlayerId !== playerId && card.controllerPlayerId === playerId && zone === "attack"
    && (card.returnToOwnerSkillZoneOnClose === "master-skills" || card.returnToOwnerSkillZoneOnClose === "servant-skills")
    && (card.zone === "master-skills" || card.zone === "servant-skills"));
  if (!player || !card || (card.ownerPlayerId !== playerId && !borrowedSkillPlay)) throw new Error("CARD_INSTANCE_NOT_OWNED");
  const previousZone = card.zone;
  const leavingChargedDeck = card.zone === "deck" && zone !== "deck" ? card.chargedAttackOnDeckLeave : undefined;
  const replacementDestination = card.zoneMoveReplacement?.requestedDestination === zone
    ? card.zoneMoveReplacement.replacementDestination
    : undefined;
  const requestedDestination = leavingChargedDeck ? "attack" : (replacementDestination ?? zone);
  const destination = resolvePlayerCardDestination(player, previousZone, requestedDestination, options);
  removeFrom(player.hand, instanceId);
  removeFrom(player.deck, instanceId);
  removeFrom(player.discard, instanceId);
  removeFrom(player.attack, instanceId);
  removeFrom(player.masterSkills, instanceId);
  removeFrom(player.servantSkills, instanceId);
  if (destination === "hand") player.hand.push(instanceId);
  if (destination === "deck") player.deck.push(instanceId);
  if (destination === "attack") player.attack.push(instanceId);
  if (destination === "discard") player.discard.push(instanceId);
  if (destination === "master-skills") player.masterSkills.push(instanceId);
  if (destination === "servant-skills") player.servantSkills.push(instanceId);
  if (previousZone === "attack" && (destination === "hand" || destination === "deck" || destination === "discard")) {
    resetActivatedAbilityUsageAfterLeavingPlay(card);
  }
  card.zone = destination;
  if (requestedDestination === "deck" && destination === "discard") {
    card.face = "up";
    card.active = false;
    card.residual = false;
  }
  if ((destination === "master-skills" || destination === "servant-skills") && previousZone !== destination) {
    card.returnedToSkillZoneRound = state.round;
  }
  delete card.attachedToInstanceId;
  delete card.attachmentOrder;
  delete card.attachmentPlacedRound;
  delete card.playAsHandWhileAttached;
  if (leavingChargedDeck) {
    card.face = "up";
    card.active = true;
    card.residual = leavingChargedDeck.residual;
    card.paidCost = 0;
    card.chargedAttackEnteredRound = state.round;
    delete card.chargedAttackOnDeckLeave;
  }
  if (destination !== "attack" && player.flags.manaGainReplacementSourceInstanceId === instanceId) {
    delete player.flags.manaGainReplacementSourceInstanceId;
    delete player.flags.manaGainReplacementPower;
  }
}

/** Temporarily remove any controlled attack while preserving its owner and combat state. */
export function removeCardUntilCombatEnd(state: GameState, instanceId: string, sourceId: string): void {
  const card = state.cards[instanceId];
  if (!card || card.zone !== "attack" || !card.controllerPlayerId) throw new Error("COMBAT_RETURN_CARD_INVALID");
  if (card.returnAfterCombat) throw new Error("COMBAT_RETURN_ALREADY_ARMED");
  const controllerPlayerId = card.controllerPlayerId;
  for (const player of Object.values(state.players)) {
    removeFrom(player.hand, instanceId);
    removeFrom(player.deck, instanceId);
    removeFrom(player.discard, instanceId);
    removeFrom(player.attack, instanceId);
    removeFrom(player.masterSkills, instanceId);
    removeFrom(player.servantSkills, instanceId);
  }
  card.returnAfterCombat = { sourceId, controllerPlayerId, face: card.face, active: card.active, residual: card.residual };
  card.zone = "removed";
  card.active = false;
}

/** Restore cards removed by an until-end-of-Combat effect, optionally scoped to one source. */
export function restoreCardsAfterCombat(state: GameState, sourceId?: string): string[] {
  const restored: string[] = [];
  for (const card of Object.values(state.cards)) {
    const lifecycle = card.returnAfterCombat;
    if (!lifecycle || (sourceId && lifecycle.sourceId !== sourceId)) continue;
    const controller = state.players[lifecycle.controllerPlayerId];
    if (!controller || controller.eliminated) continue;
    for (const player of Object.values(state.players)) {
      removeFrom(player.hand, card.instanceId);
      removeFrom(player.deck, card.instanceId);
      removeFrom(player.discard, card.instanceId);
      removeFrom(player.attack, card.instanceId);
      removeFrom(player.masterSkills, card.instanceId);
      removeFrom(player.servantSkills, card.instanceId);
    }
    controller.attack.push(card.instanceId);
    card.controllerPlayerId = controller.id;
    card.zone = "attack";
    card.face = lifecycle.face;
    card.active = lifecycle.active;
    card.residual = lifecycle.residual;
    delete card.returnAfterCombat;
    restored.push(card.instanceId);
  }
  return restored;
}

/**
 * Remove one physical card currently controlled by a player from the game.
 * This supports temporarily borrowed cards without changing physical ownership.
 */
export function removeControlledCardFromGame(state: GameState, controllerPlayerId: string, instanceId: string): void {
  const card = state.cards[instanceId];
  if (!card || card.controllerPlayerId !== controllerPlayerId) throw new Error("CARD_INSTANCE_NOT_CONTROLLED");
  removePhysicalCardFromGame(state, instanceId);
}

/** Remove one known physical card from every play zone, preserving ownership. */
export function removePhysicalCardFromGame(state: GameState, instanceId: string): void {
  const card = state.cards[instanceId];
  if (!card) throw new Error("CARD_INSTANCE_NOT_FOUND");
  for (const player of Object.values(state.players)) {
    removeFrom(player.hand, instanceId);
    removeFrom(player.deck, instanceId);
    removeFrom(player.discard, instanceId);
    removeFrom(player.attack, instanceId);
    removeFrom(player.masterSkills, instanceId);
    removeFrom(player.servantSkills, instanceId);
  }
  clearCardStateBoundToClose(card);
  card.zone = "removed";
  card.face = "down";
  card.active = false;
  card.residual = false;
  if (card.ownerPlayerId) card.controllerPlayerId = card.ownerPlayerId;
  delete card.returnToOwnerDiscardOnClose;
  delete card.returnToOwnerSkillZoneOnClose;
  delete card.removeWithControllerOnElimination;
  delete card.removeAfterCombatRound;
}

/** Resolve generic physical-card removals scheduled for the end of Combat. */
export function removeCardsScheduledAfterCombat(state: GameState): string[] {
  const removed: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (!Number.isInteger(card.removeAfterCombatRound) || Number(card.removeAfterCombatRound) > state.round) continue;
    if (card.zone === "removed") { delete card.removeAfterCombatRound; continue; }
    removed.push(card.instanceId);
    removePhysicalCardFromGame(state, card.instanceId);
  }
  return removed;
}

/**
 * Put one owned face-up skill attack into the Xth slot from the top of its
 * owner's deck and arm the generic "leave deck => free join to attack" replacement.
 * The deck must already contain at least X cards; otherwise the printed slot does
 * not exist and the charge attempt is illegal.
 */
export function chargeOwnedSkillAttack(
  state: GameState,
  playerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  sourceId: string,
): { position: number } {
  const player = state.players[playerId];
  const card = state.cards[instanceId];
  if (!player || !card || card.ownerPlayerId !== playerId) throw new Error("CHARGE_CARD_NOT_OWNED");
  if ((card.zone !== "servant-skills" && card.zone !== "master-skills") || card.face !== "up" || card.active) {
    throw new Error("CHARGE_CARD_ZONE_INVALID");
  }
  const definition = definitions[card.definitionId];
  if (!definition?.isSkill || getCardAttributes(definition).length === 0) throw new Error("CHARGE_CARD_NOT_SKILL_ATTACK");
  const position = Number(definition.cost) + 1;
  if (!Number.isInteger(position) || position <= 0 || player.deck.length < position) throw new Error("CHARGE_DECK_TOO_SHORT");
  movePlayerCard(state, playerId, instanceId, "deck");
  const appendedIndex = player.deck.indexOf(instanceId);
  if (appendedIndex >= 0) player.deck.splice(appendedIndex, 1);
  player.deck.splice(position - 1, 0, instanceId);
  card.face = "down";
  card.active = false;
  card.residual = false;
  card.chargedAttackOnDeckLeave = { sourceId, residual: definition.residual === true };
  return { position };
}

/**
 * Randomly remove one currently inactive servant skill and bind its return to a
 * future player-elimination event. The selection pool is the servant's own
 * skill zone, matching the base-rule definition of that servant's skill cards.
 */
export function sequesterRandomInactiveServantSkill(
  state: GameState,
  targetPlayerId: string,
  returnOnPlayerEliminationId: string,
  sourceId: string,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
): string | null {
  const target = state.players[targetPlayerId];
  if (!target) throw new Error("PLAYER_NOT_FOUND");
  if (!state.players[returnOnPlayerEliminationId]) throw new Error("SEQUESTRATION_RETURN_PLAYER_NOT_FOUND");
  if (!sourceId) throw new Error("SEQUESTRATION_SOURCE_REQUIRED");
  const candidates = target.servantSkills.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.ownerPlayerId === targetPlayerId && card.zone === "servant-skills" && !card.active);
  });
  if (candidates.length === 0) return null;
  const selected = candidates[randomInt(candidates.length)];
  if (!selected) throw new Error("SEQUESTRATION_RANDOM_SELECTION_INVALID");
  const selectedCard = state.cards[selected];
  const selectedDefinition = definitions[selectedCard.definitionId];
  const returnFace = selectedCard.face;
  movePlayerCard(state, targetPlayerId, selected, "removed");
  // English ruling: a once-per-game servant skill removed by Gae Buidhe can
  // never be returned. Other skills preserve whether they were hidden.
  if (selectedDefinition?.limit !== "once-per-game") {
    selectedCard.sequestration = {
      sourceId,
      returnOnPlayerEliminationId,
      returnZone: "servant-skills",
      returnFace,
    };
  }
  return selected;
}

/**
 * Temporarily make one physical card use another card's printed definition.
 * The target instance itself is never cloned: tokens, stacks, local modifiers and
 * other runtime state therefore do not leak into the copy.
 */
function applyTemporaryCardDefinitionTarget(
  state: GameState,
  sourceInstanceId: string,
  targetDefinitionId: string,
  definitions: Record<string, CardDefinition>,
  options: { sourceId: string; expiresRound: number; copiedManaCost?: number; extraPower?: number; rebindNamedOwnerToController?: boolean; copiedFromInstanceId?: string },
): CardInstance {
  const source = state.cards[sourceInstanceId];
  if (!source) throw new Error("TEMPORARY_DEFINITION_COPY_CARD_MISSING");
  const targetDefinition = definitions[targetDefinitionId];
  if (!targetDefinition) throw new Error("TEMPORARY_DEFINITION_COPY_TARGET_MISSING");
  if (!Number.isInteger(options.expiresRound) || options.expiresRound < state.round) throw new Error("TEMPORARY_DEFINITION_COPY_EXPIRY_INVALID");
  if (options.copiedManaCost !== undefined && (!Number.isInteger(options.copiedManaCost) || options.copiedManaCost < 0)) {
    throw new Error("TEMPORARY_DEFINITION_COPY_COST_INVALID");
  }
  if (source.temporaryDefinitionCopy) restoreTemporaryCardDefinitionCopy(source);

  const restoreFullSkillCopy = source.fullSkillCopy ? structuredClone(source.fullSkillCopy) : undefined;
  const restoreCopyTopAttachmentTraits = source.copyTopAttachmentTraits ? structuredClone(source.copyTopAttachmentTraits) : undefined;
  const restoreUsageState = {
    abilityUsage: source.abilityUsage ? structuredClone(source.abilityUsage) : undefined,
    used: source.used,
    usedRound: source.usedRound,
    usedPhase: source.usedPhase,
    usedCount: source.usedCount,
    usedGameCount: source.usedGameCount,
    residual: source.residual,
  };
  const copyPowerModifierId = options.extraPower
    ? `temporary-definition-copy:${options.sourceId}:${state.round}:${source.instanceId}`
    : undefined;
  source.temporaryDefinitionCopy = {
    sourceId: options.sourceId,
    originalDefinitionId: source.definitionId,
    ...(options.copiedFromInstanceId ? { copiedFromInstanceId: options.copiedFromInstanceId } : { copiedFromDefinitionId: targetDefinitionId }),
    expiresRound: options.expiresRound,
    copiedManaCost: options.copiedManaCost,
    restoreFullSkillCopy,
    restoreCopyTopAttachmentTraits,
    restoreUsageState,
    copyPowerModifierId,
  };
  source.definitionId = targetDefinitionId;
  const copiedSkillId = targetDefinition.linkedSkillId ?? (targetDefinition.isSkill || targetDefinition.cardType === "skill" ? targetDefinition.id : undefined);
  if (copiedSkillId) {
    source.fullSkillCopy = {
      sourceId: options.sourceId,
      sourceSkillId: copiedSkillId,
      rebindNamedOwnerToController: options.rebindNamedOwnerToController === true,
    };
  } else {
    delete source.fullSkillCopy;
  }
  if (copyPowerModifierId && Number.isInteger(options.extraPower)) {
    source.powerModifiers = [
      ...(source.powerModifiers ?? []).filter((modifier) => modifier.id !== copyPowerModifierId),
      { id: copyPowerModifierId, sourceId: options.sourceId, kind: "add", value: Number(options.extraPower), duration: "round" },
    ];
  }
  return source;
}

export function applyTemporaryCardDefinitionCopy(
  state: GameState,
  sourceInstanceId: string,
  targetInstanceId: string,
  definitions: Record<string, CardDefinition>,
  options: { sourceId: string; expiresRound: number; copiedManaCost?: number; extraPower?: number; rebindNamedOwnerToController?: boolean },
): CardInstance {
  const target = state.cards[targetInstanceId];
  if (!target) throw new Error("TEMPORARY_DEFINITION_COPY_CARD_MISSING");
  return applyTemporaryCardDefinitionTarget(state, sourceInstanceId, target.definitionId, definitions, { ...options, copiedFromInstanceId: targetInstanceId });
}

/** Apply a temporary full printed definition without requiring a physical template instance. */
export function applyTemporaryCardDefinitionById(
  state: GameState,
  sourceInstanceId: string,
  targetDefinitionId: string,
  definitions: Record<string, CardDefinition>,
  options: { sourceId: string; expiresRound: number; copiedManaCost?: number; extraPower?: number; rebindNamedOwnerToController?: boolean },
): CardInstance {
  return applyTemporaryCardDefinitionTarget(state, sourceInstanceId, targetDefinitionId, definitions, options);
}

/** Restore a physical card after a temporary definition-copy effect ends. */
export function restoreTemporaryCardDefinitionCopy(card: CardInstance): boolean {
  const copy = card.temporaryDefinitionCopy;
  if (!copy) return false;
  card.definitionId = copy.originalDefinitionId;
  if (copy.restoreFullSkillCopy) card.fullSkillCopy = structuredClone(copy.restoreFullSkillCopy);
  else delete card.fullSkillCopy;
  if (copy.restoreCopyTopAttachmentTraits) card.copyTopAttachmentTraits = structuredClone(copy.restoreCopyTopAttachmentTraits);
  else delete card.copyTopAttachmentTraits;
  const usage = copy.restoreUsageState;
  if (usage.abilityUsage) card.abilityUsage = structuredClone(usage.abilityUsage); else delete card.abilityUsage;
  if (usage.used !== undefined) card.used = usage.used; else delete card.used;
  if (usage.usedRound !== undefined) card.usedRound = usage.usedRound; else delete card.usedRound;
  if (usage.usedPhase !== undefined) card.usedPhase = usage.usedPhase; else delete card.usedPhase;
  if (usage.usedCount !== undefined) card.usedCount = usage.usedCount; else delete card.usedCount;
  if (usage.usedGameCount !== undefined) card.usedGameCount = usage.usedGameCount; else delete card.usedGameCount;
  card.residual = usage.residual;
  if (copy.copyPowerModifierId && card.powerModifiers) {
    card.powerModifiers = card.powerModifiers.filter((modifier) => modifier.id !== copy.copyPowerModifierId);
    if (card.powerModifiers.length === 0) delete card.powerModifiers;
  }
  delete card.temporaryDefinitionCopy;
  return true;
}

/** Restore every card whose structured lifecycle expires when this player is eliminated. */
export function restoreSequesteredCardsOnPlayerElimination(state: GameState, eliminatedPlayerId: string): string[] {
  const restored: string[] = [];
  for (const card of Object.values(state.cards)) {
    const lifecycle = card.sequestration;
    if (!lifecycle || lifecycle.returnOnPlayerEliminationId !== eliminatedPlayerId || card.zone !== "removed") continue;
    const ownerPlayerId = card.ownerPlayerId;
    if (!ownerPlayerId || !state.players[ownerPlayerId]) throw new Error("SEQUESTRATION_OWNER_NOT_FOUND");
    movePlayerCard(state, ownerPlayerId, card.instanceId, lifecycle.returnZone);
    delete card.sequestration;
    card.face = lifecycle.returnFace;
    card.active = false;
    card.residual = false;
    restored.push(card.instanceId);
  }
  return restored;
}

export function clearCardStateBoundToClose(card: CardInstance): void {
  const attributePrefix = "attribute-overrides-until-close:";
  const reversedPrefix = "reversed-until-close:";
  const effectPrefix = "effect-until-close:";
  const markers = card.modifiers ?? [];
  if (markers.some((marker) => marker.startsWith(attributePrefix))) delete card.attributeOverrides;
  if (markers.some((marker) => marker.startsWith(reversedPrefix))) delete card.reversed;
  delete card.declaredAttribute;
  delete card.declaredAttributeRevealed;
  delete card.setAsideForCombat;
  delete card.untilClosePowerBonus;
  delete card.grantedCardAbilities;
  card.modifiers = markers.filter((marker) => !marker.startsWith(attributePrefix) && !marker.startsWith(reversedPrefix) && !marker.startsWith(effectPrefix));
}

/** Return a physical card temporarily controlled by another player to its original owner's discard. */
export function returnBorrowedCardToOwnerDiscard(state: GameState, controllerPlayerId: string, instanceId: string): void {
  const controller = state.players[controllerPlayerId];
  const card = state.cards[instanceId];
  const ownerId = card?.ownerPlayerId;
  const owner = ownerId ? state.players[ownerId] : undefined;
  if (!controller || !card || !owner || card.controllerPlayerId !== controllerPlayerId || card.returnToOwnerDiscardOnClose !== true) {
    throw new Error("BORROWED_CARD_RETURN_INVALID");
  }
  controller.attack = controller.attack.filter((id) => id !== instanceId);
  owner.hand = owner.hand.filter((id) => id !== instanceId);
  owner.deck = owner.deck.filter((id) => id !== instanceId);
  owner.discard = owner.discard.filter((id) => id !== instanceId);
  owner.attack = owner.attack.filter((id) => id !== instanceId);
  owner.masterSkills = owner.masterSkills.filter((id) => id !== instanceId);
  owner.servantSkills = owner.servantSkills.filter((id) => id !== instanceId);
  owner.discard.push(instanceId);
  clearCardStateBoundToClose(card);
  resetActivatedAbilityUsageAfterLeavingPlay(card);
  card.zone = "discard";
  card.face = "down";
  card.active = false;
  card.residual = false;
  card.controllerPlayerId = ownerId;
  delete card.returnToOwnerDiscardOnClose;
}

/** Return a temporarily controlled physical attack directly to its owner's hand. */
export function returnBorrowedCardToOwnerHand(state: GameState, controllerPlayerId: string, instanceId: string): void {
  const controller = state.players[controllerPlayerId];
  const card = state.cards[instanceId];
  const ownerId = card?.ownerPlayerId;
  const owner = ownerId ? state.players[ownerId] : undefined;
  if (!controller || !card || !owner || card.controllerPlayerId !== controllerPlayerId || ownerId === controllerPlayerId) {
    throw new Error("BORROWED_CARD_RETURN_HAND_INVALID");
  }
  for (const player of Object.values(state.players)) {
    player.hand = player.hand.filter((id) => id !== instanceId);
    player.deck = player.deck.filter((id) => id !== instanceId);
    player.discard = player.discard.filter((id) => id !== instanceId);
    player.attack = player.attack.filter((id) => id !== instanceId);
    player.masterSkills = player.masterSkills.filter((id) => id !== instanceId);
    player.servantSkills = player.servantSkills.filter((id) => id !== instanceId);
  }
  clearCardStateBoundToClose(card);
  resetActivatedAbilityUsageAfterLeavingPlay(card);
  owner.hand.push(instanceId);
  card.controllerPlayerId = ownerId;
  card.zone = "hand";
  card.face = "down";
  card.active = false;
  card.residual = false;
  delete card.returnToOwnerDiscardOnClose;
  delete card.returnToOwnerSkillZoneOnClose;
}

/** Lend one active owned physical attack to another player's attack until it closes. */
export function lendActiveOwnedCardToPlayer(
  state: GameState,
  ownerPlayerId: string,
  controllerPlayerId: string,
  instanceId: string,
): void {
  const owner = state.players[ownerPlayerId];
  const controller = state.players[controllerPlayerId];
  const card = state.cards[instanceId];
  if (!owner || !controller || owner.eliminated || controller.eliminated || ownerPlayerId === controllerPlayerId) throw new Error("LENT_CARD_PLAYER_INVALID");
  if (!card || card.ownerPlayerId !== ownerPlayerId || card.controllerPlayerId !== ownerPlayerId
    || card.zone !== "attack" || !card.active || card.face !== "up" || !owner.attack.includes(instanceId)) throw new Error("LENT_CARD_INVALID");
  owner.attack = owner.attack.filter((id) => id !== instanceId);
  controller.attack = controller.attack.filter((id) => id !== instanceId);
  controller.attack.push(instanceId);
  card.controllerPlayerId = controllerPlayerId;
  card.returnToOwnerDiscardOnClose = true;
  delete card.returnToOwnerSkillZoneOnClose;
}

/** Lend one resting owned physical Skill directly from its skill zone into another player's active attack. */
export function lendSkillFromOwnerSkillZoneToPlayer(
  state: GameState,
  ownerPlayerId: string,
  controllerPlayerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): void {
  const owner = state.players[ownerPlayerId];
  const controller = state.players[controllerPlayerId];
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!owner || owner.eliminated || !controller || controller.eliminated || ownerPlayerId === controllerPlayerId) throw new Error("LENT_SKILL_PLAYER_INVALID");
  const sourceZone = definition?.skillOwnerType === "master" ? "master-skills" : "servant-skills";
  const source = sourceZone === "master-skills" ? owner.masterSkills : owner.servantSkills;
  if (!card || !definition || !isSkillCard(definition, card) || card.ownerPlayerId !== ownerPlayerId || card.controllerPlayerId !== ownerPlayerId
    || card.zone !== sourceZone || card.active || !source.includes(instanceId)) throw new Error("LENT_SKILL_CARD_INVALID");
  if (sourceZone === "master-skills") owner.masterSkills = owner.masterSkills.filter((id) => id !== instanceId);
  else owner.servantSkills = owner.servantSkills.filter((id) => id !== instanceId);
  controller.attack = controller.attack.filter((id) => id !== instanceId);
  controller.attack.push(instanceId);
  card.zone = "attack";
  card.face = "up";
  card.active = true;
  card.residual = definition.residual === true;
  card.controllerPlayerId = controllerPlayerId;
  card.returnToOwnerSkillZoneOnClose = sourceZone;
  delete card.returnToOwnerDiscardOnClose;
}

/** Move one already-lent active physical Skill from its current controller to another controller without changing ownership. */
export function transferLentSkillController(
  state: GameState,
  currentControllerPlayerId: string,
  nextControllerPlayerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): void {
  const current = state.players[currentControllerPlayerId];
  const next = state.players[nextControllerPlayerId];
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!current || !next || current.eliminated || next.eliminated || current.id === next.id) throw new Error("LENT_SKILL_PLAYER_INVALID");
  if (!card || !definition || !isSkillCard(definition, card) || card.controllerPlayerId !== current.id || card.zone !== "attack"
    || !card.active || card.face !== "up" || !current.attack.includes(instanceId)) throw new Error("LENT_SKILL_CARD_INVALID");
  current.attack = current.attack.filter((id) => id !== instanceId);
  next.attack = next.attack.filter((id) => id !== instanceId);
  next.attack.push(instanceId);
  card.controllerPlayerId = next.id;
  if (card.ownerPlayerId === next.id) {
    delete card.returnToOwnerSkillZoneOnClose;
    delete card.returnToOwnerDiscardOnClose;
    delete card.removeWithControllerOnElimination;
  } else if (!card.returnToOwnerSkillZoneOnClose) {
    card.returnToOwnerSkillZoneOnClose = definition.skillOwnerType === "master" ? "master-skills" : "servant-skills";
  }
}

/**
 * Lend one physical Skill to another player's matching skill zone without
 * changing ownership. The borrower may play the Skill normally; closing it
 * later returns the same physical card to the original owner's skill zone.
 */
export function lendSkillToPlayerSkillZone(
  state: GameState,
  ownerPlayerId: string,
  controllerPlayerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): void {
  const owner = state.players[ownerPlayerId];
  const controller = state.players[controllerPlayerId];
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!owner || owner.eliminated || !controller || controller.eliminated || ownerPlayerId === controllerPlayerId) throw new Error("LENT_SKILL_PLAYER_INVALID");
  if (!card || !definition || !isSkillCard(definition, card) || card.ownerPlayerId !== ownerPlayerId) throw new Error("LENT_SKILL_CARD_INVALID");
  for (const player of Object.values(state.players)) {
    removeFrom(player.hand, instanceId);
    removeFrom(player.deck, instanceId);
    removeFrom(player.discard, instanceId);
    removeFrom(player.attack, instanceId);
    removeFrom(player.masterSkills, instanceId);
    removeFrom(player.servantSkills, instanceId);
  }
  clearCardStateBoundToClose(card);
  const destination = definition.skillOwnerType === "master" ? "master-skills" : "servant-skills";
  if (destination === "master-skills") controller.masterSkills.push(instanceId);
  else controller.servantSkills.push(instanceId);
  card.controllerPlayerId = controllerPlayerId;
  card.zone = destination;
  card.face = "up";
  card.active = false;
  card.residual = false;
  card.returnedToSkillZoneRound = state.round;
  card.returnToOwnerSkillZoneOnClose = destination;
  delete card.returnToOwnerDiscardOnClose;
  delete card.removeWithControllerOnElimination;
}

/** Reclaim an owned Skill from another controller/zone directly into the owner's active attack. */
export function reclaimOwnedSkillToAttack(
  state: GameState,
  ownerPlayerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): void {
  const owner = state.players[ownerPlayerId];
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!owner || owner.eliminated || !card || !definition || !isSkillCard(definition, card) || card.ownerPlayerId !== ownerPlayerId) throw new Error("SKILL_RECLAIM_INVALID");
  for (const player of Object.values(state.players)) {
    removeFrom(player.hand, instanceId);
    removeFrom(player.deck, instanceId);
    removeFrom(player.discard, instanceId);
    removeFrom(player.attack, instanceId);
    removeFrom(player.masterSkills, instanceId);
    removeFrom(player.servantSkills, instanceId);
  }
  clearCardStateBoundToClose(card);
  owner.attack.push(instanceId);
  card.controllerPlayerId = ownerPlayerId;
  card.zone = "attack";
  card.face = "up";
  card.active = true;
  card.residual = definition.residual === true;
  card.joinedAttackRound = state.round;
  card.paidCost = 0;
  delete card.returnToOwnerSkillZoneOnClose;
  delete card.returnToOwnerDiscardOnClose;
  delete card.removeWithControllerOnElimination;
}

/**
 * Lend one already-active physical Skill to another player's attack without
 * changing ownership. The card keeps its active/residual state; when it later
 * closes, the shared close boundary returns it to the owner's skill zone.
 */
export function lendActiveSkillToPlayer(
  state: GameState,
  ownerPlayerId: string,
  controllerPlayerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  options: { removeWithControllerOnElimination?: boolean } = {},
): void {
  const owner = state.players[ownerPlayerId];
  const controller = state.players[controllerPlayerId];
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!owner || owner.eliminated || !controller || controller.eliminated || ownerPlayerId === controllerPlayerId) {
    throw new Error("LENT_SKILL_PLAYER_INVALID");
  }
  if (!card || !definition || card.ownerPlayerId !== ownerPlayerId || card.controllerPlayerId !== ownerPlayerId
    || !owner.attack.includes(instanceId) || card.zone !== "attack" || !card.active || card.face !== "up"
    || !isSkillCard(definition, card)) {
    throw new Error("LENT_SKILL_CARD_INVALID");
  }
  owner.attack = owner.attack.filter((id) => id !== instanceId);
  controller.attack = controller.attack.filter((id) => id !== instanceId);
  controller.attack.push(instanceId);
  card.controllerPlayerId = controllerPlayerId;
  card.returnToOwnerSkillZoneOnClose = definition.skillOwnerType === "master" ? "master-skills" : "servant-skills";
  if (options.removeWithControllerOnElimination === true) card.removeWithControllerOnElimination = true;
  else delete card.removeWithControllerOnElimination;
  delete card.returnToOwnerDiscardOnClose;
}

/** Move one physical card to its original owner's ordinary zone without changing ownership. */
export function returnPhysicalCardToOwnerZone(
  state: GameState,
  instanceId: string,
  zone: "hand" | "deck" | "discard",
): void {
  const card = state.cards[instanceId];
  const ownerId = card?.ownerPlayerId;
  const owner = ownerId ? state.players[ownerId] : undefined;
  if (!card || !owner) throw new Error("CARD_RETURN_OWNER_INVALID");
  const previousZone = card.zone;
  for (const player of Object.values(state.players)) {
    removeFrom(player.hand, instanceId);
    removeFrom(player.deck, instanceId);
    removeFrom(player.discard, instanceId);
    removeFrom(player.attack, instanceId);
    removeFrom(player.masterSkills, instanceId);
    removeFrom(player.servantSkills, instanceId);
  }
  clearCardStateBoundToClose(card);
  if (previousZone === "attack") resetActivatedAbilityUsageAfterLeavingPlay(card);
  if (zone === "hand") owner.hand.push(instanceId);
  if (zone === "deck") owner.deck.push(instanceId);
  if (zone === "discard") owner.discard.push(instanceId);
  card.controllerPlayerId = ownerId;
  card.zone = zone;
  card.face = zone === "discard" ? "up" : "down";
  card.active = false;
  card.residual = false;
  delete card.returnToOwnerDiscardOnClose;
  delete card.returnToOwnerSkillZoneOnClose;
  delete card.removeWithControllerOnElimination;
  delete card.removeAfterCombatRound;
}

/**
 * Transfer ownership and control of one ordinary physical card to another
 * player's ordinary zone. This is the shared boundary for effects that say a
 * borrowed/stored card becomes part of the recipient's hand, deck or discard.
 */
export function transferPhysicalCardToPlayerZone(
  state: GameState,
  targetPlayerId: string,
  instanceId: string,
  zone: "hand" | "deck" | "discard",
): void {
  const target = state.players[targetPlayerId];
  const card = state.cards[instanceId];
  if (!target || target.eliminated) throw new Error("CARD_TRANSFER_PLAYER_INVALID");
  if (!card) throw new Error("CARD_TRANSFER_CARD_INVALID");
  const previousZone = card.zone;
  for (const player of Object.values(state.players)) {
    removeFrom(player.hand, instanceId);
    removeFrom(player.deck, instanceId);
    removeFrom(player.discard, instanceId);
    removeFrom(player.attack, instanceId);
    removeFrom(player.masterSkills, instanceId);
    removeFrom(player.servantSkills, instanceId);
  }
  clearCardStateBoundToClose(card);
  if (previousZone === "attack") resetActivatedAbilityUsageAfterLeavingPlay(card);
  if (zone === "hand") target.hand.push(instanceId);
  if (zone === "deck") target.deck.push(instanceId);
  if (zone === "discard") target.discard.push(instanceId);
  card.ownerPlayerId = targetPlayerId;
  card.controllerPlayerId = targetPlayerId;
  card.zone = zone;
  card.face = zone === "discard" ? "up" : "down";
  card.active = false;
  card.residual = false;
  delete card.attachedToInstanceId;
  delete card.attachmentOrder;
  delete card.attachmentPlacedRound;
  delete card.returnToOwnerDiscardOnClose;
  delete card.returnToOwnerSkillZoneOnClose;
  delete card.removeWithControllerOnElimination;
  delete card.removeAfterCombatRound;
}

/**
 * Transfer one physical Skill to another player's matching skill zone.
 * Ownership and control both move with the card so the recipient can use the
 * physical Skill normally. This is intentionally generic for effects that say
 * to put a Skill into another player's Skill Zone rather than merely lend it.
 */
export function transferSkillToPlayerSkillZone(
  state: GameState,
  targetPlayerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): void {
  const target = state.players[targetPlayerId];
  const card = state.cards[instanceId];
  if (!target || target.eliminated) throw new Error("SKILL_ZONE_TRANSFER_PLAYER_INVALID");
  if (!card) throw new Error("SKILL_ZONE_TRANSFER_CARD_INVALID");
  // A physical Skill may temporarily be using another card definition. Effects
  // that move the physical card to a Skill Zone end that temporary face first,
  // matching the ordinary close/return lifecycle and preventing copied card
  // identity from leaking across ownership transfers.
  restoreTemporaryCardDefinitionCopy(card);
  const definition = definitions[card.definitionId];
  if (!definition || !isSkillCard(definition, card)) throw new Error("SKILL_ZONE_TRANSFER_CARD_INVALID");

  for (const player of Object.values(state.players)) {
    removeFrom(player.hand, instanceId);
    removeFrom(player.deck, instanceId);
    removeFrom(player.discard, instanceId);
    removeFrom(player.attack, instanceId);
    removeFrom(player.masterSkills, instanceId);
    removeFrom(player.servantSkills, instanceId);
  }
  clearCardStateBoundToClose(card);
  const destination = definition.skillOwnerType === "master" ? "master-skills" : "servant-skills";
  if (destination === "master-skills") target.masterSkills.push(instanceId);
  else target.servantSkills.push(instanceId);
  card.ownerPlayerId = targetPlayerId;
  card.controllerPlayerId = targetPlayerId;
  card.zone = destination;
  card.face = "up";
  card.active = false;
  card.residual = false;
  card.returnedToSkillZoneRound = state.round;
  delete card.boardLocationId;
  delete card.boardPlacedRound;
  delete card.boardAttackWhileOwnerPresent;
  delete card.boardOpponentCardCostAura;
  delete card.boardOpponentMovementLockWhileOwnerPresent;
  delete card.boardSituationPowerModifierMultiplier;
  delete card.boardEventPowerModifierMultiplier;
  delete card.boardPowerModifierExemptPlayerIds;
  delete card.returnToOwnerSkillZoneOnClose;
  delete card.returnToOwnerDiscardOnClose;
  delete card.removeWithControllerOnElimination;
}

/** Return a lent physical Skill to its original owner's matching skill zone. */
export function returnBorrowedSkillToOwnerSkillZone(state: GameState, controllerPlayerId: string, instanceId: string): void {
  const controller = state.players[controllerPlayerId];
  const card = state.cards[instanceId];
  const ownerId = card?.ownerPlayerId;
  const owner = ownerId ? state.players[ownerId] : undefined;
  const destination = card?.returnToOwnerSkillZoneOnClose;
  if (!controller || !card || !owner || card.controllerPlayerId !== controllerPlayerId
    || (destination !== "master-skills" && destination !== "servant-skills")) {
    throw new Error("BORROWED_SKILL_RETURN_INVALID");
  }
  for (const player of Object.values(state.players)) {
    removeFrom(player.hand, instanceId);
    removeFrom(player.deck, instanceId);
    removeFrom(player.discard, instanceId);
    removeFrom(player.attack, instanceId);
    removeFrom(player.masterSkills, instanceId);
    removeFrom(player.servantSkills, instanceId);
  }
  if (destination === "master-skills") owner.masterSkills.push(instanceId);
  else owner.servantSkills.push(instanceId);
  clearCardStateBoundToClose(card);
  card.zone = destination;
  card.face = "up";
  card.active = false;
  card.residual = false;
  card.controllerPlayerId = ownerId;
  card.returnedToSkillZoneRound = state.round;
  delete card.returnToOwnerSkillZoneOnClose;
  delete card.returnToOwnerDiscardOnClose;
  delete card.removeWithControllerOnElimination;
}

/** Close an activated card and return it to its rules-defined resting zone. */
export function closePlayerCard(
  state: GameState,
  playerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  options: { removeFromGame?: boolean; closedByPlayerId?: string; ignoreCloseDeferral?: boolean } = {},
): void {
  const player = state.players[playerId];
  const card = state.cards[instanceId];
  if (!player || !card) throw new Error("CARD_INSTANCE_NOT_OWNED");
  if (card.ownerPlayerId !== playerId) {
    const borrowedDiscard = card.returnToOwnerDiscardOnClose === true;
    const borrowedSkill = card.returnToOwnerSkillZoneOnClose === "master-skills" || card.returnToOwnerSkillZoneOnClose === "servant-skills";
    if (card.controllerPlayerId !== playerId || (!borrowedDiscard && !borrowedSkill)) throw new Error("CARD_INSTANCE_NOT_OWNED");
    const definition = definitions[card.definitionId];
    if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");
    if (isStructuredCardCloseForbidden(state, playerId, card, definition, definitions)) throw new Error("CARD_CLOSE_FORBIDDEN_BY_RULE");
    if (options.closedByPlayerId && options.closedByPlayerId !== playerId && definition.tags?.includes("opponent-close-immune")) throw new Error("CARD_CLOSE_PROTECTED");
    restoreTemporaryCardDefinitionCopy(card);
    if (borrowedSkill) returnBorrowedSkillToOwnerSkillZone(state, playerId, instanceId);
    else returnBorrowedCardToOwnerDiscard(state, playerId, instanceId);
    return;
  }
  const definition = definitions[card.definitionId];
  if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");
  if (definition.cannotDeactivate === true) throw new Error("CARD_CANNOT_DEACTIVATE");
  if (isStructuredCardCloseForbidden(state, playerId, card, definition, definitions)) throw new Error("CARD_CLOSE_FORBIDDEN_BY_RULE");
  if (options.closedByPlayerId && options.closedByPlayerId !== playerId && cardPreventsOpponentClose(state, player, card, definition)) throw new Error("CARD_CLOSE_PROTECTED");
  if (options.closedByPlayerId && options.closedByPlayerId !== playerId && definition.tags?.includes("opponent-close-immune")) throw new Error("CARD_CLOSE_PROTECTED");
  if (options.closedByPlayerId && options.closedByPlayerId !== playerId && hasActiveOpponentCloseProtection(state, playerId, definitions)) throw new Error("CARD_CLOSE_PROTECTED");
  if (options.ignoreCloseDeferral !== true && card.zone === "attack" && card.active) {
    const deferralSourceIds = getCardCloseDeferralSourceIds(state, player, card);
    if (deferralSourceIds.length > 0) {
      card.deferredCloseAfterCombatSourceIds = [...new Set([...(card.deferredCloseAfterCombatSourceIds ?? []), ...deferralSourceIds])];
      return;
    }
  }
  restoreTemporaryCardDefinitionCopy(card);
  const restingDefinition = definitions[card.definitionId];
  if (!restingDefinition) throw new Error("CARD_DEFINITION_NOT_FOUND");
  const restingZone = getClosedCardZone(restingDefinition, card, options.removeFromGame);
  // A physical card originating from a named side deck always returns to that
  // side deck's discard when closed. Its content definition may also be a Skill,
  // but that must not leak the side-deck card into a normal Master/Servant skill zone.
  if (card.namedSideDeckId && options.removeFromGame !== true) {
    returnNamedSideDeckCardToDiscard(state, player, card);
  } else if (restingZone === "master-skills" || restingZone === "servant-skills") {
    movePlayerCard(state, playerId, instanceId, restingZone); card.face = "up";
  } else if (restingZone === "discard" && card.zone === "attack" && !isSkillCard(restingDefinition, card)) {
    // Base deactivation rule: an ordinary non-Skill attack stays in play but
    // becomes face-down. Round-end cleanup later moves that closed card to discard.
    card.face = "down";
  } else {
    movePlayerCard(state, playerId, instanceId, restingZone); card.face = "down";
  }
  card.active = false;
  card.residual = false;
  delete card.deferredCloseAfterCombatSourceIds;
  clearCardStateBoundToClose(card);
  const resetPrefix = `structuredChoiceResetOnClose:${instanceId}:`;
  for (const flagKey of Object.keys(player.flags)) {
    if (!flagKey.startsWith(resetPrefix)) continue;
    const choiceKey = flagKey.slice(resetPrefix.length);
    delete player.flags[choiceKey];
    delete player.flags[flagKey];
  }
}

/** Settle close attempts that were intercepted by a close-after-combat rule. */
export function settleDeferredCardClosesAfterCombat(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  sourceId?: string,
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  const closed: string[] = [];
  for (const instanceId of [...player.attack]) {
    const card = state.cards[instanceId];
    const sources = card?.deferredCloseAfterCombatSourceIds ?? [];
    if (!card || sources.length === 0 || (sourceId && !sources.includes(sourceId))) continue;
    closePlayerCard(state, playerId, instanceId, definitions, { ignoreCloseDeferral: true });
    closed.push(instanceId);
  }
  return closed;
}

function hasActiveOpponentCloseProtection(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  return player.attack.some((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card?.active && card.face === "up" && definition?.protectsControllerCardsFromOpponents === true);
  });
}
