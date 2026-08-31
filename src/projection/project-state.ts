import type { GameState, PlayerState } from "../domain/state/types.ts";
import { canRevealCardDefinition, maskDeckIds, maskEventId } from "./visibility.ts";

export interface PublicPlayerState extends Omit<PlayerState, "hand" | "deck" | "discard" | "attack" | "masterSkills" | "servantSkills" | "flags" | "usage"> {
  handCount: number;
  deckCount: number;
  discardCount: number;
  attackCount: number;
  publicFlags: Record<string, boolean | number | string>;
}

export interface PublicGameState extends Omit<GameState, "players" | "cards" | "rng" | "pendingDecision" | "eventLog"> {
  players: Record<string, PublicPlayerState>;
  cards: Record<string, { instanceId: string; definitionId: string | null; ownerPlayerId: string | null; controllerPlayerId: string | null; zone: string; face: "up" | "down"; active: boolean }>;
  pendingDecision: GameState["pendingDecision"] | null;
}

function projectModeState(state: GameState, viewerId: string): Record<string, unknown> {
  const modeState = structuredClone(state.modeState);
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
  const players: Record<string, PublicPlayerState> = {};
  for (const player of Object.values(state.players)) {
    const isViewer = player.id === viewerId;
    const { hand: _hand, deck: _deck, discard: _discard, attack: _attack, masterSkills: _masterSkills, servantSkills: _servantSkills, flags: _flags, usage: _usage, ...publicFields } = player;
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
      publicFlags: Object.fromEntries(Object.entries(player.flags).filter(([key]) => key.startsWith("public:"))),
    };
  }
  const cards = Object.fromEntries(Object.values(state.cards).map((card) => [card.instanceId, {
    instanceId: card.instanceId,
    definitionId: canRevealCardDefinition(
      card,
      viewerId,
      card.ownerPlayerId ? state.players[card.ownerPlayerId]?.trueNameRevealed === true : false,
    ) ? card.definitionId : null,
    ownerPlayerId: card.ownerPlayerId,
    controllerPlayerId: card.controllerPlayerId,
    zone: card.zone,
    face: card.face,
    active: card.active,
  }]));
  const { rng: _rng, eventLog: _eventLog, ...rest } = state;
  const board = structuredClone(state.board);
  board.eventDeck = maskDeckIds(board.eventDeck, "event:hidden");
  board.situationDeck = maskDeckIds(board.situationDeck, "situation:hidden");
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
    ? structuredClone(state.pendingDecision)
    : state.pendingDecision
      ? { ...state.pendingDecision, options: [], submissions: {} }
      : null;
  return { ...rest, modeState: projectModeState(state, viewerId), board, players, cards, pendingDecision: decision };
}
