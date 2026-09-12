import type { PlayerState } from "../domain/state/types.ts";

export interface ActivatedAbilityReplacement {
  totalPowerGain: number;
}

/** Read a generic round-scoped replacement for effects of activated card/skill abilities. */
export function getActivatedAbilityReplacement(player: PlayerState, round: number): ActivatedAbilityReplacement | undefined {
  if (Number(player.flags.activatedAbilityReplacementRound ?? -1) !== round) return undefined;
  const totalPowerGain = Number(player.flags.activatedAbilityReplacementTotalPowerGain ?? 0);
  if (!Number.isInteger(totalPowerGain) || totalPowerGain < 0) throw new Error("ACTIVATED_ABILITY_REPLACEMENT_INVALID");
  return { totalPowerGain };
}

export function setActivatedAbilityReplacement(player: PlayerState, round: number, replacement: ActivatedAbilityReplacement): void {
  if (!Number.isInteger(round) || round < 0 || !Number.isInteger(replacement.totalPowerGain) || replacement.totalPowerGain < 0) {
    throw new Error("ACTIVATED_ABILITY_REPLACEMENT_INVALID");
  }
  player.flags.activatedAbilityReplacementRound = round;
  player.flags.activatedAbilityReplacementTotalPowerGain = replacement.totalPowerGain;
}

export function applyActivatedAbilityReplacement(player: PlayerState, replacement: ActivatedAbilityReplacement): { totalPowerGain: number } {
  player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + replacement.totalPowerGain;
  return { totalPowerGain: replacement.totalPowerGain };
}
