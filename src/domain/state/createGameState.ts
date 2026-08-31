import type { GameState, PlayerState } from "./types.ts";
import { createThreeXModeState } from "../../rules-core/three-x-state.ts";

export interface PlayerSeed {
  id: string;
  name: string;
}

export function createGameState(input: {
  gameInstanceId: string;
  rulesPackageId?: string;
  players: PlayerSeed[];
  seed: number;
  mode?: GameState["mode"];
}): GameState {
  const players: Record<string, PlayerState> = {};
  input.players.forEach((player, seat) => {
    players[player.id] = {
      id: player.id,
      name: player.name,
      seat,
      connected: true,
      ready: false,
      eliminated: false,
      defeated: false,
      masterId: null,
      servantId: null,
      identityRevealed: false,
      trueNameRevealed: false,
      form: null,
      locationId: null,
      mana: 0,
      victoryPoints: 0,
      commandSeals: 3,
      hand: [],
      deck: [],
      discard: [],
      attack: [],
      masterSkills: [],
      servantSkills: [],
      statuses: [],
      usage: {},
      flags: {},
    };
  });

  const normalizedSeed = input.seed >>> 0;
  return {
    schemaVersion: 1,
    rulesPackageId: input.rulesPackageId ?? "fd.rules.dev",
    gameInstanceId: input.gameInstanceId,
    revision: 0,
    status: "lobby",
    mode: input.mode ?? "standard",
    modeState: input.mode === "three-x" ? { threeX: createThreeXModeState(input.players.map((player) => player.id)) } : {},
    round: 0,
    phase: "preparation",
    step: "player-window",
    activePlayerId: null,
    turnOrder: input.players.map((player) => player.id),
    players,
    cards: {},
    board: {
      locations: {
        workshop: [],
        mountain: [],
        city: [],
        scouting: [],
      },
      situationDeck: [],
      situationDiscard: [],
      activeSituations: [],
      eventDeck: [],
      eventDiscard: [],
      currentEvents: { mountain: [], city: [] },
      eventVisibility: {},
      outpostRecords: { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] },
      scoutingAwardedRound: null,
    },
    effectQueue: [],
    pendingDecision: null,
    processedCommandIds: [],
    eventLog: [],
    rng: { seed: normalizedSeed, state: normalizedSeed, draws: 0 },
  };
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}
