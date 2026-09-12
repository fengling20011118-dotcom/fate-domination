import type { GameState } from "../domain/state/types.ts";
import type { BattlefieldLocationId } from "./battlefield-rules.ts";

export const COMBAT_WINNER_CHALLENGE_RULE = "combat_winner_challenge";

export interface CombatWinnerChallenge {
  modifierId: string;
  sourceId: string;
  sourceInstanceId?: string;
  playerId: string;
  locationId: BattlefieldLocationId;
  power?: number;
  powerMode?: "controller-current-combat-power";
  strictHigher: boolean;
  rewardMode: "competition-only";
}

export function installCombatWinnerChallenge(
  state: GameState,
  input: Omit<CombatWinnerChallenge, "modifierId"> & { modifierId?: string },
): CombatWinnerChallenge {
  const player = state.players[input.playerId];
  if (!player || player.eliminated) throw new Error("COMBAT_WINNER_CHALLENGER_INVALID");
  const fixedPower = input.power;
  const dynamicPower = input.powerMode === "controller-current-combat-power";
  if (dynamicPower === (fixedPower !== undefined)) throw new Error("COMBAT_WINNER_CHALLENGE_POWER_SOURCE_INVALID");
  if (fixedPower !== undefined && (!Number.isInteger(fixedPower) || fixedPower < 0)) throw new Error("COMBAT_WINNER_CHALLENGE_POWER_INVALID");
  const modifierId = input.modifierId ?? `${input.sourceId}:winner-challenge:${state.round}:${input.locationId}:${input.playerId}`;
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => modifier.id !== modifierId);
  state.activeRuleModifiers.push({
    id: modifierId,
    sourceId: input.sourceId,
    controllerPlayerId: input.playerId,
    sourceInstanceId: input.sourceInstanceId,
    operation: "replace",
    rule: COMBAT_WINNER_CHALLENGE_RULE,
    scope: {
      locationId: input.locationId,
      strictHigher: input.strictHigher,
      rewardMode: input.rewardMode,
      ...(input.powerMode ? { powerMode: input.powerMode } : {}),
    },
    ...(fixedPower !== undefined ? { value: fixedPower } : {}),
    duration: "round",
    createdRound: state.round,
  });
  return { ...input, modifierId };
}

export function getCombatWinnerChallenges(
  state: GameState,
  locationId: BattlefieldLocationId,
): CombatWinnerChallenge[] {
  return (state.activeRuleModifiers ?? []).flatMap((modifier) => {
    if (modifier.rule !== COMBAT_WINNER_CHALLENGE_RULE || modifier.operation !== "replace" || modifier.createdRound !== state.round) return [];
    const scope = modifier.scope ?? {};
    if (scope.locationId !== locationId) return [];
    const player = state.players[modifier.controllerPlayerId];
    const powerMode = scope.powerMode === "controller-current-combat-power" ? "controller-current-combat-power" : undefined;
    const power = modifier.value === undefined ? undefined : Number(modifier.value);
    if (!player || player.eliminated) return [];
    if (!powerMode && (power === undefined || !Number.isInteger(power) || power < 0)) return [];
    if (powerMode && power !== undefined) throw new Error("COMBAT_WINNER_CHALLENGE_POWER_SOURCE_CONFLICT");
    const strictHigher = scope.strictHigher !== false;
    const rewardMode = scope.rewardMode === "competition-only" ? "competition-only" : undefined;
    if (!rewardMode) throw new Error("COMBAT_WINNER_CHALLENGE_REWARD_MODE_INVALID");
    return [{
      modifierId: modifier.id,
      sourceId: modifier.sourceId,
      sourceInstanceId: modifier.sourceInstanceId,
      playerId: modifier.controllerPlayerId,
      locationId,
      ...(power !== undefined ? { power } : {}),
      ...(powerMode ? { powerMode } : {}),
      strictHigher,
      rewardMode,
    }];
  });
}

export function consumeCombatWinnerChallenges(state: GameState, locationId: BattlefieldLocationId): void {
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => !(modifier.rule === COMBAT_WINNER_CHALLENGE_RULE
    && modifier.createdRound === state.round && modifier.scope?.locationId === locationId));
}
