import type { CardInstance, PhaseId, PlayerState } from "../domain/state/types.ts";

export type UsageLimit = "once-per-game" | "twice-per-game" | "once-per-round" | "twice-per-round" | "three-per-round" | "once-per-turn" | "unlimited";
export type UsageRecord = PlayerState["usage"][string];

/** Printed card limit plus any keyword later granted to this physical card. */
export function getEffectiveCardUsageLimit(instance: CardInstance, printedLimit: UsageLimit | undefined): UsageLimit | undefined {
  return instance.usageLimitOverride ?? printedLimit;
}

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
  if (limit === "unlimited") return true;
  if (!usage?.used) return true;
  if (limit === "once-per-game") return usage.usedGame !== true;
  if (limit === "twice-per-game") return Number(usage.count ?? 0) < 2;
  if (usage.usedGame) return false;
  if (limit === "twice-per-round") return usage.round !== round || Number(usage.count ?? 1) < 2;
  if (limit === "three-per-round") return usage.round !== round || Number(usage.count ?? 1) < 3;
  if (limit === "once-per-round") return usage.round !== round;
  if (limit === "once-per-turn") return usage.round !== round || usage.phase !== phase;
  return false;
}

export function createUsageRecord(
  limit: UsageLimit | undefined,
  round: number,
  phase: PhaseId,
  previous?: UsageRecord,
): UsageRecord {
  const count = limit === "twice-per-game"
    ? Number(previous?.count ?? 0) + 1
    : limit === "twice-per-round" || limit === "three-per-round"
      ? (previous?.round === round ? Number(previous.count ?? 1) + 1 : 1)
      : undefined;
  return {
    round,
    phase,
    used: true,
    usedGame: limit === "once-per-game" || limit === "twice-per-game",
    ...(count !== undefined ? { count } : {}),
  };
}

/** Card-instance counterpart of skill usage limits. The marker is attached to
 * the physical instance so generated/残留 cards cannot bypass a printed limit. */
export function isCardUsageAvailable(
  instance: Pick<CardInstance, "used" | "usedRound" | "usedPhase" | "usedCount" | "usedGameCount">,
  limit: UsageLimit | undefined,
  round: number,
  phase: PhaseId,
): boolean {
  if (!limit || limit === "unlimited") return true;
  if (limit === "once-per-game") return instance.used !== true;
  if (limit === "twice-per-game") return Number(instance.usedGameCount ?? 0) < 2;
  if (limit === "twice-per-round") return instance.usedRound !== round || Number(instance.usedCount ?? 0) < 2;
  if (limit === "three-per-round") return instance.usedRound !== round || Number(instance.usedCount ?? 0) < 3;
  if (limit === "once-per-round") return instance.usedRound !== round;
  return instance.usedRound !== round || instance.usedPhase !== phase;
}

export function markCardUsage(instance: CardInstance, limit: UsageLimit | undefined, round: number, phase: PhaseId): void {
  if (!limit || limit === "unlimited") return;
  if (limit === "once-per-game") { instance.used = true; return; }
  if (limit === "twice-per-game") { instance.usedGameCount = Number(instance.usedGameCount ?? 0) + 1; return; }
  if (limit === "twice-per-round" || limit === "three-per-round") {
    instance.usedCount = instance.usedRound === round ? Number(instance.usedCount ?? 0) + 1 : 1;
  }
  instance.usedRound = round;
  instance.usedPhase = phase;
}

export function resetReusableCardUsage(instance: CardInstance): void {
  instance.usedRound = undefined;
  instance.usedPhase = undefined;
  instance.usedCount = undefined;
}

/**
 * Base rule: an activated ability may be used again after its card returns from
 * play to hand, deck, or discard. Game-wide limits remain spent; returning a
 * Skill to its Skill Zone deliberately does not call this reset.
 */
export function resetActivatedAbilityUsageAfterLeavingPlay(instance: CardInstance): void {
  if (!instance.abilityUsage) return;
  const persistent = Object.fromEntries(
    Object.entries(instance.abilityUsage).filter(([, usage]) => usage.usedGame === true),
  );
  if (Object.keys(persistent).length > 0) instance.abilityUsage = persistent;
  else delete instance.abilityUsage;
}
