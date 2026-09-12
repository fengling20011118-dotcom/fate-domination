import { cloneState } from "../domain/state/createGameState.ts";
import type { GameAction, GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { movePlayerByEffect, type MovementResult } from "./board.ts";
import { playerAllowsActionAbilitiesInCombat } from "./card-rule-modifiers.ts";
import { spendNormalCommandSeal } from "./command-seals.ts";
import { gainMana } from "./resources.ts";

export type NormalCommandSealMode = "mana" | "power" | "move";

export interface NormalCommandSealPayload {
  mode: NormalCommandSealMode;
  targetLocationId?: string;
}

export interface NormalCommandSealResult {
  mode: NormalCommandSealMode;
  remainingCommandSeals: number;
  manaGained?: number;
  powerGained?: number;
  victoryPointBonusOnWin?: number;
  movement?: MovementResult;
}

function assertNormalCommandSealWindow(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): void {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("COMMAND_SEAL_PLAYER_INVALID");
  if (state.status !== "playing" || state.activePlayerId !== playerId || state.step !== "player-window") {
    throw new Error("COMMAND_SEAL_WINDOW_INVALID");
  }
  const configuredWindow = typeof player.flags.commandSealWindow === "string" ? player.flags.commandSealWindow : "action";
  if (configuredWindow === state.phase) return;
  // A rule that explicitly changes the Command Seal window (for example Irisviel)
  // replaces the normal Action timing. Only an ordinary Action seal can inherit a
  // controller-wide permission to use Action abilities during Combat.
  if (configuredWindow === "action" && state.phase === "combat" && playerAllowsActionAbilitiesInCombat(state, player, definitions)) return;
  throw new Error("COMMAND_SEAL_WINDOW_INVALID");
}

export function useNormalCommandSeal(
  state: GameState,
  playerId: string,
  payload: NormalCommandSealPayload,
  definitions: Record<string, CardDefinition>,
): NormalCommandSealResult {
  assertNormalCommandSealWindow(state, playerId, definitions);
  const player = state.players[playerId];
  if (payload.mode === "mana") {
    spendNormalCommandSeal(state, playerId, "ability");
    const manaGained = gainMana(player, 4);
    player.flags.commandSealManaGainRound = state.round;
    return { mode: "mana", remainingCommandSeals: player.commandSeals, manaGained };
  }
  if (payload.mode === "power") {
    spendNormalCommandSeal(state, playerId, "ability");
    player.flags.commandSealRoundPowerBonus = Number(player.flags.commandSealRoundPowerBonus ?? 0) + 2;
    player.flags.commandSealVictoryPointBonusRound = state.round;
    player.flags.commandSealVictoryPointBonus = Number(player.flags.commandSealVictoryPointBonus ?? 0) + 2;
    return {
      mode: "power",
      remainingCommandSeals: player.commandSeals,
      powerGained: 2,
      victoryPointBonusOnWin: 2,
    };
  }
  if (payload.mode === "move") {
    const targetLocationId = payload.targetLocationId;
    if (typeof targetLocationId !== "string" || !targetLocationId || targetLocationId === player.locationId) {
      throw new Error("COMMAND_SEAL_MOVE_DESTINATION_INVALID");
    }
    spendNormalCommandSeal(state, playerId, "movement");
    const movement = movePlayerByEffect(state, playerId, targetLocationId, definitions);
    return { mode: "move", remainingCommandSeals: player.commandSeals, movement };
  }
  throw new Error("COMMAND_SEAL_MODE_INVALID");
}

export function getNormalCommandSealLegalActions(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): GameAction[] {
  const player = state.players[playerId];
  if (!player || player.eliminated || player.commandSeals <= 0) return [];
  const candidates: Array<{ label: string; payload: NormalCommandSealPayload }> = [
    { label: "令咒：获得4点魔力", payload: { mode: "mana" } },
    { label: "令咒：本回合+2合计威力，获胜后+2战果", payload: { mode: "power" } },
    ...Object.keys(state.board.locations)
      .filter((locationId) => locationId !== player.locationId)
      .map((targetLocationId) => ({ label: `令咒：移动至${targetLocationId}`, payload: { mode: "move" as const, targetLocationId } })),
  ];
  return candidates.flatMap((candidate) => {
    try {
      useNormalCommandSeal(cloneState(state), playerId, candidate.payload, definitions);
      return [{ type: "command-seal.use", label: candidate.label, payload: candidate.payload }];
    } catch {
      return [];
    }
  });
}
