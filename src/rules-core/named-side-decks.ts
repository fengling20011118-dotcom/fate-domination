import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";

/** Serializable isolated physical-card pile that does not count as the player's normal hand/deck/discard. */
export interface NamedSideDeckState {
  id: string;
  ownerPlayerId: string;
  deck: string[];
  hand: string[];
  discard: string[];
  /** Whether an empty deck recycles its own discard. Defaults to true. */
  recycleDiscard?: boolean;
}

interface NamedSideDeckModeState {
  [key: string]: NamedSideDeckState;
}

function storage(state: GameState): NamedSideDeckModeState {
  const existing = state.modeState.namedSideDecks;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) return existing as NamedSideDeckModeState;
  const created: NamedSideDeckModeState = {};
  state.modeState.namedSideDecks = created;
  return created;
}

function storageKey(playerId: string, deckId: string): string {
  return `${playerId}:${deckId}`;
}

function assertDeckId(deckId: string): void {
  if (typeof deckId !== "string" || deckId.length === 0) throw new Error("NAMED_SIDE_DECK_ID_INVALID");
}

function removeOne(list: string[], instanceId: string): void {
  const index = list.indexOf(instanceId);
  if (index >= 0) list.splice(index, 1);
}

function randomShuffle(values: readonly string[], randomInt: (maxExclusive: number) => number): string[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error("RANDOM_INDEX_INVALID");
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function uniqueInstanceId(state: GameState, playerId: string, deckId: string, index: number): string {
  const base = `${playerId}:side:${deckId}:${index + 1}`;
  if (!state.cards[base]) return base;
  let suffix = 2;
  while (state.cards[`${base}:${suffix}`]) suffix += 1;
  return `${base}:${suffix}`;
}

/**
 * Initializes one named side deck with independent CardInstances. Idempotent for
 * the same player/deck pair so setup events may safely be replayed after resume.
 */
export function initializeNamedSideDeck(
  state: GameState,
  playerId: string,
  deckId: string,
  definitionIds: readonly string[],
  randomInt: (maxExclusive: number) => number,
  options: { originMasterId?: string; originServantId?: string; shuffle?: boolean; recycleDiscard?: boolean } = {},
): NamedSideDeckState {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  assertDeckId(deckId);
  if (definitionIds.length === 0 || new Set(definitionIds).size !== definitionIds.length || definitionIds.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new Error("NAMED_SIDE_DECK_DEFINITIONS_INVALID");
  }
  const key = storageKey(playerId, deckId);
  const existing = storage(state)[key];
  if (existing) return existing;

  const instanceIds = definitionIds.map((definitionId, index) => {
    const instanceId = uniqueInstanceId(state, playerId, deckId, index);
    const instance: CardInstance = {
      instanceId,
      definitionId,
      ownerPlayerId: playerId,
      controllerPlayerId: playerId,
      ...(options.originMasterId ? { originMasterId: options.originMasterId } : {}),
      ...(options.originServantId ? { originServantId: options.originServantId } : {}),
      namedSideDeckId: deckId,
      zone: "side-deck",
      face: "down",
      active: false,
      residual: false,
      temporary: false,
      modifiers: [],
    };
    state.cards[instanceId] = instance;
    return instanceId;
  });
  const sideDeck: NamedSideDeckState = {
    id: deckId,
    ownerPlayerId: playerId,
    deck: options.shuffle === false ? instanceIds : randomShuffle(instanceIds, randomInt),
    hand: [],
    discard: [],
    recycleDiscard: options.recycleDiscard !== false,
  };
  storage(state)[key] = sideDeck;
  return sideDeck;
}

export function getNamedSideDeck(state: GameState, playerId: string, deckId: string): NamedSideDeckState | undefined {
  assertDeckId(deckId);
  const existing = state.modeState.namedSideDecks;
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) return undefined;
  const sideDeck = (existing as NamedSideDeckModeState)[storageKey(playerId, deckId)];
  return sideDeck?.ownerPlayerId === playerId && sideDeck.id === deckId ? sideDeck : undefined;
}

export function requireNamedSideDeck(state: GameState, playerId: string, deckId: string): NamedSideDeckState {
  const sideDeck = getNamedSideDeck(state, playerId, deckId);
  if (!sideDeck) throw new Error("NAMED_SIDE_DECK_NOT_INITIALIZED");
  return sideDeck;
}

/** Draws from the isolated deck; empty deck automatically recycles only its own discard. */
export function drawNamedSideDeck(
  state: GameState,
  playerId: string,
  deckId: string,
  count: number,
  randomInt: (maxExclusive: number) => number,
): string[] {
  if (!Number.isInteger(count) || count < 0) throw new Error("NAMED_SIDE_DECK_DRAW_COUNT_INVALID");
  const sideDeck = requireNamedSideDeck(state, playerId, deckId);
  const drawn: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (sideDeck.deck.length === 0 && sideDeck.discard.length > 0 && sideDeck.recycleDiscard !== false) {
      sideDeck.deck = randomShuffle(sideDeck.discard, randomInt);
      sideDeck.discard = [];
      for (const instanceId of sideDeck.deck) {
        const card = state.cards[instanceId];
        if (!card || card.ownerPlayerId !== playerId || card.namedSideDeckId !== deckId) throw new Error("NAMED_SIDE_DECK_CARD_INVALID");
        card.zone = "side-deck";
        card.face = "down";
        card.active = false;
      }
    }
    const instanceId = sideDeck.deck.shift();
    if (!instanceId) break;
    const card = state.cards[instanceId];
    if (!card || card.ownerPlayerId !== playerId || card.namedSideDeckId !== deckId || card.zone !== "side-deck") {
      throw new Error("NAMED_SIDE_DECK_CARD_INVALID");
    }
    card.zone = "side-hand";
    card.face = "down";
    card.active = false;
    sideDeck.hand.push(instanceId);
    drawn.push(instanceId);
  }
  return drawn;
}

export function namedSideDeckHand(state: GameState, playerId: string, deckId: string): string[] {
  return [...requireNamedSideDeck(state, playerId, deckId).hand];
}

/** Discards explicit cards from the isolated hand without touching the normal player discard. */
export function discardNamedSideDeckHandCards(
  state: GameState,
  playerId: string,
  deckId: string,
  instanceIds: readonly string[],
): string[] {
  const sideDeck = requireNamedSideDeck(state, playerId, deckId);
  if (new Set(instanceIds).size !== instanceIds.length || instanceIds.some((instanceId) => !sideDeck.hand.includes(instanceId))) {
    throw new Error("NAMED_SIDE_DECK_HAND_SELECTION_INVALID");
  }
  for (const instanceId of instanceIds) {
    const card = state.cards[instanceId];
    if (!card || card.ownerPlayerId !== playerId || card.namedSideDeckId !== deckId || card.zone !== "side-hand") {
      throw new Error("NAMED_SIDE_DECK_CARD_INVALID");
    }
  }
  for (const instanceId of instanceIds) {
    removeOne(sideDeck.hand, instanceId);
    const card = state.cards[instanceId];
    card.zone = "side-discard";
    card.face = "down";
    card.active = false;
    sideDeck.discard.push(instanceId);
  }
  return [...instanceIds];
}

/** Transfer one revealed side-hand card into another player's skill zone. */
export function acquireNamedSideDeckCard(
  state: GameState,
  sideDeckOwnerPlayerId: string,
  deckId: string,
  instanceId: string,
  targetPlayerId: string,
  destination: "master-skills" | "servant-skills" = "master-skills",
): string {
  const sideDeck = requireNamedSideDeck(state, sideDeckOwnerPlayerId, deckId);
  const target = state.players[targetPlayerId];
  const card = state.cards[instanceId];
  if (!target || target.eliminated || !sideDeck.hand.includes(instanceId) || !card
    || card.ownerPlayerId !== sideDeckOwnerPlayerId || card.namedSideDeckId !== deckId || card.zone !== "side-hand") {
    throw new Error("NAMED_SIDE_DECK_ACQUIRE_INVALID");
  }
  removeOne(sideDeck.hand, instanceId);
  delete card.namedSideDeckId;
  delete card.originMasterId;
  delete card.originServantId;
  card.ownerPlayerId = targetPlayerId;
  card.controllerPlayerId = targetPlayerId;
  card.zone = destination;
  card.face = "up";
  card.active = false;
  card.residual = false;
  if (destination === "master-skills") target.masterSkills.push(instanceId);
  else target.servantSkills.push(instanceId);
  return instanceId;
}

/** Called immediately after a side-hand card successfully enters the normal attack zone. */
export function commitNamedSideDeckPlay(state: GameState, playerId: string, deckId: string, instanceId: string): void {
  const sideDeck = requireNamedSideDeck(state, playerId, deckId);
  const card = state.cards[instanceId];
  if (!sideDeck.hand.includes(instanceId) || !card || card.ownerPlayerId !== playerId || card.namedSideDeckId !== deckId || card.zone !== "attack") {
    throw new Error("NAMED_SIDE_DECK_PLAY_STATE_INVALID");
  }
  removeOne(sideDeck.hand, instanceId);
}

/** Generic close destination for a physical card that originated from a named side deck. */
export function returnNamedSideDeckCardToDiscard(state: GameState, player: PlayerState, card: CardInstance): void {
  const deckId = card.namedSideDeckId;
  if (!deckId) throw new Error("NAMED_SIDE_DECK_ID_REQUIRED");
  const sideDeck = requireNamedSideDeck(state, player.id, deckId);
  removeOne(sideDeck.deck, card.instanceId);
  removeOne(sideDeck.hand, card.instanceId);
  removeOne(sideDeck.discard, card.instanceId);
  removeOne(player.hand, card.instanceId);
  removeOne(player.deck, card.instanceId);
  removeOne(player.discard, card.instanceId);
  removeOne(player.attack, card.instanceId);
  removeOne(player.masterSkills, card.instanceId);
  removeOne(player.servantSkills, card.instanceId);
  card.zone = "side-discard";
  card.face = "down";
  card.active = false;
  card.residual = false;
  card.controllerPlayerId = player.id;
  sideDeck.discard.push(card.instanceId);
}

/** Returns whether a physical card belongs to an isolated named side deck. */
export function isNamedSideDeckCard(card: CardInstance | undefined, deckId?: string): boolean {
  if (!card || typeof card.namedSideDeckId !== "string") return false;
  return typeof deckId === "string" ? card.namedSideDeckId === deckId : true;
}
