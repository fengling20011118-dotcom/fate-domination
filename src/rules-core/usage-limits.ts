import type { CardInstance, PhaseId, PlayerState } from "../domain/state/types.ts";

export type UsageLimit = "once-per-game" | "once-per-round" | "once-per-turn";
export type UsageRecord = PlayerState["usage"][string];

/**
 * Shared usage-limit semantics for skills and future rule components.
 * A missing limit is intentionally not treated as unlimited: content must
 * explicitly opt into repeatable behavior instead of silently bypassing a
 * printed restriction.
 */
export function isUsageAvailable(
  usage: UsageRecord | undefined,
  limit: UsageLimit | undefined,
  round: number,
  phase: PhaseId,
): boolean {
  if (!usage?.used) return true;
  if (usage.usedGame || limit === "once-per-game") return false;
  if (limit === "once-per-round") return usage.round !== round;
  if (limit === "once-per-turn") return usage.round !== round || usage.phase !== phase;
  return false;
}

export function createUsageRecord(
  limit: UsageLimit | undefined,
  round: number,
  phase: PhaseId,
): UsageRecord {
  return {
    round,
    phase,
    used: true,
    usedGame: limit === "once-per-game",
  };
}

/** Card-instance counterpart of skill usage limits. The marker is attached to
 * the physical instance so generated/残留 cards cannot bypass a printed limit. */
export function isCardUsageAvailable(
  instance: Pick<CardInstance, "used" | "usedRound" | "usedPhase">,
  limit: UsageLimit | undefined,
  round: number,
  phase: PhaseId,
): boolean {
  if (!limit) return true;
  if (limit === "once-per-game") return instance.used !== true;
  if (limit === "once-per-round") return instance.usedRound !== round;
  return instance.usedRound !== round || instance.usedPhase !== phase;
}

export function markCardUsage(instance: CardInstance, limit: UsageLimit | undefined, round: number, phase: PhaseId): void {
  if (!limit) return;
  if (limit === "once-per-game") { instance.used = true; return; }
  instance.usedRound = round;
  instance.usedPhase = phase;
}

export function resetReusableCardUsage(instance: CardInstance): void {
  instance.usedRound = undefined;
  instance.usedPhase = undefined;
}
