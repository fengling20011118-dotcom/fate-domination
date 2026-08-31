import { GAME_STATUS, PHASES } from "./constants.js";

function clone(value) {
  return structuredClone(value);
}

export function createPlayerState(player, seat) {
  return {
    id: player.id,
    name: player.name,
    seat,
    connected: true,
    ready: false,
    eliminated: false,
    masterId: null,
    servantId: null,
    identityRevealed: false,
    locationId: null,
    mana: 0,
    victoryPoints: 0,
    commandSeals: 3,
    hand: [],
    deck: [],
    discard: [],
    playArea: [],
    statuses: [],
    counters: {},
    usage: {},
  };
}

export function createGameState({
  gameInstanceId,
  players,
  seed,
  mode = "standard",
  eventGroupId = "fuyuki",
}) {
  const state = {
    schemaVersion: 1,
    gameInstanceId,
    revision: 0,
    status: GAME_STATUS.LOBBY,
    mode,
    eventGroupId,
    round: 0,
    phase: PHASES[0],
    activeSeat: 0,
    turnOrder: players.map((player) => player.id),
    players: Object.fromEntries(
      players.map((player, seat) => [player.id, createPlayerState(player, seat)]),
    ),
    board: {
      locations: {},
      situation: null,
      eventDeck: [],
      eventDiscard: [],
    },
    pendingChoice: null,
    effectQueue: [],
    eventLog: [],
    processedCommandIds: [],
    rng: {
      seed: seed >>> 0,
      state: seed >>> 0,
      draws: 0,
    },
    winnerIds: [],
  };

  return clone(state);
}

export function cloneGameState(state) {
  return clone(state);
}
