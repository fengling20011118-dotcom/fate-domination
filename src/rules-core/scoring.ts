import type { GameState, VictoryStatus } from "../domain/state/types.ts";
import { getDynamicBattlefieldCompetitionReward, type BattlefieldLocationId } from "./battlefield-rules.ts";
import { expandSharedVictoryWinnerIds } from "./elimination-prevention.ts";

export type FinalVictoryReason = "final-score" | "deep-mountain-tiebreak" | "grail-overflow";

const baseCompetitionReward: Record<"mountain" | "city", number> = { mountain: 2, city: 3 };

function competitionRewardAdjustments(state: GameState): Partial<Record<BattlefieldLocationId, number>> {
  const value = state.modeState.battlefieldCompetitionRewardAdjustments;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Partial<Record<BattlefieldLocationId, number>>;
}

/** Authoritative current contested/competition VP printed by one battlefield. */
export function getBattlefieldCompetitionReward(state: GameState, locationId: BattlefieldLocationId): number {
  const dynamic = getDynamicBattlefieldCompetitionReward(state, locationId);
  const base = dynamic ?? (locationId === "mountain" || locationId === "city" ? baseCompetitionReward[locationId] : undefined);
  if (base === undefined) throw new Error("BATTLEFIELD_COMPETITION_REWARD_UNDEFINED");
  const adjustment = Number(competitionRewardAdjustments(state)[locationId] ?? 0);
  if (!Number.isInteger(adjustment)) throw new Error("BATTLEFIELD_COMPETITION_REWARD_ADJUSTMENT_INVALID");
  return Math.max(0, base + adjustment);
}

/** Persistently adjust one battlefield's contested/competition VP, clamped at zero. */
export function adjustBattlefieldCompetitionReward(state: GameState, locationId: BattlefieldLocationId, delta: number): number {
  if (!Number.isInteger(delta)) throw new Error("BATTLEFIELD_COMPETITION_REWARD_DELTA_INVALID");
  const before = getBattlefieldCompetitionReward(state, locationId);
  const after = Math.max(0, before + delta);
  const base = locationId === "mountain" || locationId === "city"
    ? baseCompetitionReward[locationId]
    : (getDynamicBattlefieldCompetitionReward(state, locationId) ?? 0);
  const next = { ...competitionRewardAdjustments(state), [locationId]: after - base };
  state.modeState.battlefieldCompetitionRewardAdjustments = next;
  return after;
}

/** Resolves the standard final score, including the 11th-round mountain tiebreak. */
export function determineStandardFinalVictory(state: GameState): VictoryStatus {
  const eligible = Object.values(state.players).filter((player) => !player.eliminated);
  if (eligible.length === 0) return { finished: true, winnerIds: [], reason: "grail-overflow" };

  const highest = Math.max(...eligible.map((player) => player.victoryPoints));
  const tied = eligible.filter((player) => player.victoryPoints === highest);
  if (tied.length <= 1) {
    return { finished: true, winnerIds: expandSharedVictoryWinnerIds(state, tied.map((player) => player.id)), reason: "final-score" };
  }

  const winnersByLocation = state.modeState.combatWinnerIdsByLocation;
  const mountainWinnerIds = winnersByLocation && typeof winnersByLocation === "object"
    ? (winnersByLocation as Record<string, unknown>).mountain
    : undefined;
  const mountainTiebreakWinners = Array.isArray(mountainWinnerIds)
    ? tied.filter((player) => mountainWinnerIds.includes(player.id))
    : [];
  if (mountainTiebreakWinners.length === 1) {
    return { finished: true, winnerIds: expandSharedVictoryWinnerIds(state, [mountainTiebreakWinners[0].id]), reason: "deep-mountain-tiebreak" };
  }

  // A tied mountain result (or no eligible mountain winner) overflows the Grail.
  return { finished: true, winnerIds: [], reason: "grail-overflow" };
}
