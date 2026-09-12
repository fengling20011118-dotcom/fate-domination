import type { GameState } from "../domain/state/types.ts";

export type BoardPowerModifierSource = "situation" | "event";

/** Resolve physical board-card multipliers without coupling combat math to a character id. */
export function getBoardPowerModifierMultiplier(
  state: GameState,
  locationId: string | null | undefined,
  playerId: string,
  source: BoardPowerModifierSource,
): number {
  if (locationId !== "mountain" && locationId !== "city") return 1;
  let result = 1;
  for (const card of Object.values(state.cards)) {
    if (card.zone !== "board" || !card.active || card.boardLocationId !== locationId) continue;
    if (card.boardPowerModifierExemptPlayerIds?.includes(playerId)) continue;
    const value = source === "situation" ? card.boardSituationPowerModifierMultiplier : card.boardEventPowerModifierMultiplier;
    if (value === undefined) continue;
    if (!Number.isFinite(value)) throw new Error("BOARD_POWER_MODIFIER_MULTIPLIER_INVALID");
    result *= value;
  }
  return result;
}
