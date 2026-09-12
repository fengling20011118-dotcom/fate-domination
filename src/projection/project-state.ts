import type { GameState, PlayerState } from "../domain/state/types.ts";
import { canRevealCardDefinition, maskDeckIds, maskEventId } from "./visibility.ts";
import { localizePendingDecision } from "./presentation-localization.ts";

export interface PublicPlayerState extends Omit<PlayerState, "hand" | "deck" | "discard" | "attack" | "masterSkills" | "servantSkills" | "flags" | "usage" | "playAttributeDeclarations"> {
  handCount: number;
  deckCount: number;
  discardCount: number;
  attackCount: number;
  /** Private knowledge explicitly granted to this viewer by a structured rule. */
  deckBottomCardId: string | null;
  publicFlags: Record<string, boolean | number | string>;
}

export interface PublicGameState extends Omit<GameState, "players" | "cards" | "rng" | "pendingDecision" | "eventLog"> {
  players: Record<string, PublicPlayerState>;
  cards: Record<string, { instanceId: string; definitionId: string | null; ownerPlayerId: string | null; controllerPlayerId: string | null; zone: string; face: "up" | "down"; active: boolean; declaredAttribute: string | null }>;
  pendingDecision: GameState["pendingDecision"] | null;
}

function projectModeState(state: GameState, viewerId: string): Record<string, unknown> {
  const modeState = structuredClone(state.modeState);
  // Rules packages may keep authoritative hidden state here. It is never a
  // client-facing knowledge channel; packages expose recipient-safe knowledge
  // through privatePlayerKnowledge instead.
  delete modeState.privateRulesState;
  const privatePlayerKnowledge = modeState.privatePlayerKnowledge;
  if (privatePlayerKnowledge && typeof privatePlayerKnowledge === "object" && !Array.isArray(privatePlayerKnowledge)) {
    const viewerKnowledge = (privatePlayerKnowledge as Record<string, unknown>)[viewerId];
    modeState.privatePlayerKnowledge = viewerKnowledge && typeof viewerKnowledge === "object"
      ? { [viewerId]: viewerKnowledge }
      : {};
  }
  const privateEventKnowledge = modeState.privateEventKnowledge;
  if (privateEventKnowledge && typeof privateEventKnowledge === "object" && !Array.isArray(privateEventKnowledge)) {
    const viewerKnowledge = (privateEventKnowledge as Record<string, unknown>)[viewerId];
    modeState.privateEventKnowledge = viewerKnowledge && typeof viewerKnowledge === "object"
      ? { [viewerId]: viewerKnowledge }
      : {};
  }
  if (state.mode !== "three-x") return modeState;
  const threeX = modeState.threeX as Record<string, unknown> | undefined;
  if (!threeX || typeof threeX !== "object") return modeState;
  const playerIds = Array.isArray(threeX.playerIds) ? threeX.playerIds.filter((id): id is string => typeof id === "string") : [];
  const budgets = threeX.budgets as Record<string, unknown> | undefined;
  if (budgets && typeof budgets === "object") {
    threeX.budgets = Object.fromEntries(playerIds.map((playerId) => {
      const budget = budgets[playerId] as Record<string, unknown> | undefined;
      if (playerId === viewerId && budget) return [playerId, budget];
      return [playerId, { stones: null, purchases: null, extraStartingMana: null, climaxTiebreakBonus: null, extraCommandSeals: null }];
    }));
  }
  const masterOffers = threeX.masterOffers as Record<string, unknown> | undefined;
  if (masterOffers && typeof masterOffers === "object") {
    threeX.masterOffers = Object.fromEntries(playerIds.map((playerId) => [playerId, playerId === viewerId ? masterOffers[playerId] ?? [] : []]));
  }
  const servantOffers = threeX.servantOffers as Record<string, unknown> | undefined;
  if (servantOffers && typeof servantOffers === "object") {
    threeX.servantOffers = Object.fromEntries(playerIds.map((playerId) => [playerId, playerId === viewerId ? servantOffers[playerId] ?? [] : []]));
  }
  return modeState;
}

/** Creates a recipient-safe snapshot. The authority never sends RNG state or private card contents. */
export function projectPublicState(state: GameState, viewerId: string): PublicGameState {
  const viewer = state.players[viewerId];
  const mayViewDeckBottoms = typeof viewer?.flags.viewAllDeckBottomCardsSourceId === "string";
  const mayViewBurnedSituations = typeof viewer?.flags.viewBurnedSituationsSourceId === "string";
  const visibleDeckBottomIds = new Set(mayViewDeckBottoms
    ? Object.values(state.players).flatMap((player) => player.deck.length > 0 ? [player.deck[player.deck.length - 1]] : [])
    : []);
  const players: Record<string, PublicPlayerState> = {};
  for (const player of Object.values(state.players)) {
    const isViewer = player.id === viewerId;
    const { hand: _hand, deck: _deck, discard: _discard, attack: _attack, masterSkills: _masterSkills, servantSkills: _servantSkills, flags: _flags, usage: _usage, playAttributeDeclarations: _playAttributeDeclarations, ...publicFields } = player;
    players[player.id] = {
      ...publicFields,
      trueNameRevealed: player.trueNameRevealed,
      form: isViewer || player.trueNameRevealed ? player.form : null,
      masterId: isViewer || player.identityRevealed ? player.masterId : null,
      servantId: isViewer || player.trueNameRevealed ? player.servantId : null,
      handCount: player.hand.length,
      deckCount: player.deck.length,
      discardCount: player.discard.length,
      attackCount: player.attack.length,
      deckBottomCardId: mayViewDeckBottoms && player.deck.length > 0 ? player.deck[player.deck.length - 1] : null,
      publicFlags: Object.fromEntries(Object.entries(player.flags).filter(([key]) => key.startsWith("public:"))),
    };
  }
  const cards = Object.fromEntries(Object.values(state.cards).map((card) => [card.instanceId, {
    instanceId: card.instanceId,
    definitionId: visibleDeckBottomIds.has(card.instanceId) || canRevealCardDefinition(
      card,
      viewerId,
      card.ownerPlayerId ? state.players[card.ownerPlayerId]?.trueNameRevealed === true : false,
      card.ownerPlayerId ? state.players[card.ownerPlayerId]?.flags["public:handRevealed"] === true : false,
      card.ownerPlayerId ? state.players[card.ownerPlayerId]?.flags.skillZoneHidden === true : false,
    ) ? card.definitionId : null,
    ownerPlayerId: card.ownerPlayerId,
    controllerPlayerId: card.controllerPlayerId,
    zone: card.zone,
    face: card.face,
    active: card.active,
    declaredAttribute: card.declaredAttribute !== undefined
      && (card.ownerPlayerId === viewerId || card.declaredAttributeRevealed !== false)
      ? card.declaredAttribute
      : null,
  }]));
  const { rng: _rng, eventLog: _eventLog, ...rest } = state;
  const board = structuredClone(state.board);
  board.eventDeck = maskDeckIds(board.eventDeck, "event:hidden");
  if (board.namedEventPools) {
    board.namedEventPools = Object.fromEntries(Object.entries(board.namedEventPools).map(([poolId, pool]) => [poolId, {
      allIds: pool.allIds.map(() => "event:hidden"),
      deck: maskDeckIds(pool.deck, "event:hidden"),
      discard: pool.discard.map(() => "event:hidden"),
    }]));
  }
  board.situationDeck = maskDeckIds(board.situationDeck, "situation:hidden");
  if (!mayViewBurnedSituations) board.situationDiscard = maskDeckIds(board.situationDiscard, "situation:hidden");
  board.currentEvents = Object.fromEntries(Object.entries(board.currentEvents).map(([locationId, eventIds]) => [
    locationId,
    eventIds.map((eventId) => maskEventId(board, eventId)),
  ]));
  board.eventVisibility = Object.fromEntries(
    Object.entries(board.eventVisibility)
      .filter(([eventId]) => state.board.currentEvents.mountain.includes(eventId) || state.board.currentEvents.city.includes(eventId))
      .map(([eventId, visibility]) => [visibility === "down" ? "event:hidden" : eventId, visibility]),
  );
  const decision = state.pendingDecision && state.pendingDecision.chooserPlayerIds.includes(viewerId)
    ? localizePendingDecision(state.pendingDecision)
    : state.pendingDecision
      ? { ...state.pendingDecision, options: [], submissions: {} }
      : null;
  return { ...rest, modeState: projectModeState(state, viewerId), board, players, cards, pendingDecision: decision };
}
