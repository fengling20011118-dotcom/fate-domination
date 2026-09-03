import type { PlayerSeed } from "../domain/state/createGameState.ts";
import { CommandType, type GameCommand } from "../match-engine/commands.ts";

export interface PlayableRolePick {
  playerId: string;
  playerName: string;
  masterId: string;
  masterName: string;
  servantId: string;
  servantName: string;
  notes: string[];
}

export interface PlayableFrontendPreset {
  id: string;
  name: string;
  gameInstanceId: string;
  seed: number;
  players: PlayerSeed[];
  picks: PlayableRolePick[];
}

export const FRONTEND_SMOKE_PLAYABLE_PRESET: PlayableFrontendPreset = {
  id: "frontend-smoke-2p-v1",
  name: "Frontend Smoke 2P",
  gameInstanceId: "frontend-smoke-room",
  seed: 20260903,
  players: [
    { id: "p1", name: "Player 1" },
    { id: "p2", name: "Player 2" },
  ],
  picks: [
    {
      playerId: "p1",
      playerName: "Player 1",
      masterId: "master.shirou-emiya",
      masterName: "卫宫士郎",
      servantId: "servant.saber",
      servantName: "阿尔托莉雅·潘德拉贡",
      notes: ["master has verified initial mana and FULL skill support", "servant has a validated 12-card deck and FULL skill support"],
    },
    {
      playerId: "p2",
      playerName: "Player 2",
      masterId: "master.rin",
      masterName: "远坂凛",
      servantId: "servant.emiya",
      servantName: "卫宫",
      notes: ["master has verified initial mana and FULL skill support", "servant has a validated 12-card deck and FULL skill support"],
    },
  ],
};

export function buildPlayableSetupCommands(preset = FRONTEND_SMOKE_PLAYABLE_PRESET): GameCommand[] {
  let revision = 0;
  const next = <TPayload>(actorId: string, type: string, payload: TPayload): GameCommand<TPayload> => ({
    commandId: `${preset.id}:${revision}:${actorId}:${type}`,
    gameInstanceId: preset.gameInstanceId,
    actorId,
    expectedRevision: revision++,
    type,
    payload,
  });

  return [
    ...preset.picks.map((pick) => next(pick.playerId, CommandType.AssignIdentity, { masterId: pick.masterId, servantId: pick.servantId })),
    next("host", CommandType.StartStandardGame, {}),
  ];
}
