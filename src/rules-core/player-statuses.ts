import type { PlayerState } from "../domain/state/types.ts";

export const STATUS_ROMAN = "status.roman";
export const STATUS_DISARMED = "status.disarmed";
export const STATUS_CHAINED = "status.chained";
export const STATUS_DRAGON_PREFIX = "status.dragon:";

export function hasPlayerStatus(player: PlayerState | undefined, status: string): boolean {
  return Boolean(player?.statuses.includes(status));
}

export function addPlayerStatus(player: PlayerState, status: string): void {
  if (!player.statuses.includes(status)) player.statuses.push(status);
}

export function playerIsDisarmed(player: PlayerState | undefined): boolean {
  return hasPlayerStatus(player, STATUS_DISARMED);
}

/** Apply the reusable Chained keyword through an inclusive round boundary. */
export function applyChainedThroughRound(player: PlayerState, throughRound: number): void {
  if (!Number.isInteger(throughRound) || throughRound < 0) throw new Error("CHAINED_ROUND_INVALID");
  addPlayerStatus(player, STATUS_CHAINED);
  player.flags.chainedThroughRound = Math.max(Number(player.flags.chainedThroughRound ?? -1), throughRound);
  player.flags.noblePhantasmUseBlockedThroughRound = Math.max(Number(player.flags.noblePhantasmUseBlockedThroughRound ?? -1), throughRound);
}

export function playerIsChained(player: PlayerState | undefined, round: number): boolean {
  return Boolean(player && hasPlayerStatus(player, STATUS_CHAINED) && Number(player.flags.chainedThroughRound ?? -1) >= round);
}

export function playerNoblePhantasmUseBlocked(player: PlayerState | undefined, round: number): boolean {
  return Boolean(player && Number(player.flags.noblePhantasmUseBlockedThroughRound ?? -1) >= round);
}

/** Source-scoped Dragon marker. Multiple independent effects may mark the same player without overwriting one another. */
export function addDragonStatus(player: PlayerState, sourceId: string): void {
  if (!sourceId) throw new Error("DRAGON_STATUS_SOURCE_REQUIRED");
  addPlayerStatus(player, `${STATUS_DRAGON_PREFIX}${sourceId}`);
}

export function removeDragonStatusFromSource(player: PlayerState, sourceId: string): void {
  player.statuses = player.statuses.filter((status) => status !== `${STATUS_DRAGON_PREFIX}${sourceId}`);
}

export function playerIsDragon(player: PlayerState | undefined): boolean {
  return Boolean(player?.statuses.some((status) => status.startsWith(STATUS_DRAGON_PREFIX)));
}
