import type { PlayerState } from "../domain/state/types.ts";

/** Apply positive mana gains through one rule boundary so caps are respected. */
function isWorkshopResourceGainBlocked(player: PlayerState): boolean {
  return player.flags.workshopResourceGainBlocked === true && player.locationId === "workshop";
}

export function blockManaGainThroughRound(player: PlayerState, throughRound: number): void {
  if (!Number.isInteger(throughRound) || throughRound < 0) throw new Error("MANA_GAIN_BLOCK_ROUND_INVALID");
  const current = Number(player.flags.manaGainBlockedThroughRound ?? Number.NEGATIVE_INFINITY);
  player.flags.manaGainBlockedThroughRound = Math.max(current, throughRound);
  player.flags.manaGainBlocked = true;
}

export function expireTimedManaGainBlock(player: PlayerState, currentRound: number): void {
  if (!Number.isInteger(currentRound) || currentRound < 0) throw new Error("RESOURCE_ROUND_INVALID");
  const throughRound = Number(player.flags.manaGainBlockedThroughRound ?? Number.NEGATIVE_INFINITY);
  if (throughRound >= currentRound) return;
  delete player.flags.manaGainBlockedThroughRound;
  delete player.flags.manaGainBlocked;
}

export function setManaGainBlockSource(player: PlayerState, sourceId: string, blocked: boolean): void {
  if (typeof sourceId !== "string" || !sourceId) throw new Error("MANA_GAIN_BLOCK_SOURCE_INVALID");
  const current = Array.isArray(player.flags.manaGainBlockSourceIds)
    ? player.flags.manaGainBlockSourceIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const next = blocked ? [...new Set([...current, sourceId])] : current.filter((id) => id !== sourceId);
  if (next.length > 0) player.flags.manaGainBlockSourceIds = next;
  else delete player.flags.manaGainBlockSourceIds;
}

export function gainMana(player: PlayerState, amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_MANA_INVALID");
  const sourceBlocked = Array.isArray(player.flags.manaGainBlockSourceIds) && player.flags.manaGainBlockSourceIds.length > 0;
  if (player.flags.manaGainBlocked === true || sourceBlocked || isWorkshopResourceGainBlocked(player)) return 0;
  if (player.flags.infiniteMana === true) return 0;
  const gainMultiplier = Number(player.flags.manaGainMultiplier ?? 1);
  if (!Number.isInteger(gainMultiplier) || gainMultiplier < 1) throw new Error("RESOURCE_MANA_MULTIPLIER_INVALID");
  const scaledAmount = amount * gainMultiplier;
  // Continuous replacement rules may replace a positive mana gain before
  // ordinary caps are consulted.  The source instance and accumulated value
  // are stable structured state, so callers never need to inspect card text.
  const replacementSourceInstanceId = player.flags.manaGainReplacementSourceInstanceId;
  if (typeof replacementSourceInstanceId === "string" && replacementSourceInstanceId.length > 0) {
    const accumulated = Number(player.flags.manaGainReplacementPower ?? 0);
    if (!Number.isInteger(accumulated) || accumulated < 0) throw new Error("RESOURCE_MANA_REPLACEMENT_STATE_INVALID");
    player.flags.manaGainReplacementPower = accumulated + scaledAmount;
    return 0;
  }
  const roundCap = Number(player.flags.roundManaGainCap);
  const alreadyGained = Number(player.flags.roundManaGained ?? 0);
  const allowed = Number.isInteger(roundCap) && roundCap >= 0
    ? Math.max(0, roundCap - (Number.isInteger(alreadyGained) && alreadyGained >= 0 ? alreadyGained : 0))
    : scaledAmount;
  const requested = Math.min(scaledAmount, allowed);
  const cap = Number(player.flags.manaCap);
  const before = player.mana;
  player.mana = Number.isInteger(cap) && cap >= 0
    ? Math.min(cap, before + requested)
    : before + requested;
  const applied = player.mana - before;
  const overflow = Number.isInteger(cap) && cap >= 0 ? Math.max(0, before + requested - cap) : 0;
  if (overflow > 0) {
    const sequence = Number(player.flags.manaGainOverflowSequence ?? 0) + 1;
    if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new Error("RESOURCE_MANA_OVERFLOW_SEQUENCE_INVALID");
    const ledger = Array.isArray(player.flags.manaGainOverflowLedger) ? player.flags.manaGainOverflowLedger : [];
    player.flags.manaGainOverflowSequence = sequence;
    player.flags.manaGainOverflowLedger = [...ledger, { sequence, requested, applied, overflow, cap, before }];
  }
  if (Number.isInteger(roundCap) && roundCap >= 0) {
    player.flags.roundManaGained = (Number.isInteger(alreadyGained) && alreadyGained >= 0 ? alreadyGained : 0) + applied;
  }
  return applied;
}

/** Apply mana loss through the same resource boundary; values never go below zero. */
/** Transfers mana without creating or destroying finite mana. The source loses only what the target can actually receive. */
export function transferMana(source: PlayerState, target: PlayerState, amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_MANA_INVALID");
  if (amount === 0) return 0;
  const available = source.flags.infiniteMana === true ? amount : Math.min(amount, Math.max(0, source.mana));
  if (available <= 0) return 0;
  const applied = gainMana(target, available);
  if (source.flags.infiniteMana !== true) source.mana -= applied;
  return applied;
}

export function loseMana(player: PlayerState, amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_MANA_INVALID");
  if (player.flags.infiniteMana === true) return 0;
  const before = player.mana;
  player.mana = Math.max(0, before - amount);
  return before - player.mana;
}

export function setMana(player: PlayerState, amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_MANA_INVALID");
  if (player.flags.infiniteMana === true) return;
  const cap = Number(player.flags.manaCap);
  player.mana = Number.isInteger(cap) && cap >= 0 ? Math.min(cap, amount) : amount;
}

/** Restore mana through an explicit unpreventable recovery effect.
 * Unlike a normal gain this bypasses gain blockers/replacements/round gain caps,
 * while the player's ordinary storage cap still applies.
 */
export function restoreManaUnpreventable(player: PlayerState, amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_MANA_INVALID");
  if (player.flags.infiniteMana === true || amount === 0) return 0;
  const before = player.mana;
  const cap = Number(player.flags.manaCap);
  player.mana = Number.isInteger(cap) && cap >= 0 ? Math.min(cap, before + amount) : before + amount;
  return player.mana - before;
}

/** Apply positive victory-point gains through one boundary so gain-blocking rules are complete. */
export function gainVictoryPoints(player: PlayerState, amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_VICTORY_POINTS_INVALID");
  if (player.flags.victoryPointGainBlocked === true || isWorkshopResourceGainBlocked(player)) return 0;
  const multiplier = Number(player.flags.victoryPointGainMultiplier ?? 1);
  if (!Number.isInteger(multiplier) || multiplier < 1) throw new Error("RESOURCE_VICTORY_POINTS_MULTIPLIER_INVALID");
  const numerator = Number(player.flags.victoryPointGainFractionNumerator ?? 1);
  const denominator = Number(player.flags.victoryPointGainFractionDenominator ?? 1);
  if (!Number.isInteger(numerator) || numerator < 0 || !Number.isInteger(denominator) || denominator <= 0) {
    throw new Error("RESOURCE_VICTORY_POINTS_FRACTION_INVALID");
  }
  const applied = Math.floor(amount * numerator / denominator) * multiplier;
  player.victoryPoints += applied;
  return applied;
}

/** Preserve signed adjustments while routing positive deltas through the gain boundary. */
export function adjustVictoryPoints(player: PlayerState, delta: number): number {
  if (!Number.isInteger(delta)) throw new Error("RESOURCE_VICTORY_POINTS_INVALID");
  if (delta >= 0) return gainVictoryPoints(player, delta);
  player.victoryPoints += delta;
  return delta;
}

/** Transfer existing victory points without treating the received amount as a new gain. */
export function transferVictoryPoints(source: PlayerState, target: PlayerState, amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_VICTORY_POINTS_INVALID");
  if (amount === 0) return 0;
  const transferred = Math.min(amount, Math.max(0, source.victoryPoints));
  source.victoryPoints -= transferred;
  target.victoryPoints += transferred;
  return transferred;
}

/**
 * Generic authored resource pool boundary.
 * Character mechanics expose named counters through structured state rather
 * than role-name branches or runtime text parsing.
 */
export function getCustomResource(player: PlayerState, resourceId: string): number {
  if (!resourceId || resourceId.trim().length === 0) throw new Error("RESOURCE_ID_INVALID");
  const value = Number(player.customResources?.[resourceId] ?? 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function setCustomResource(player: PlayerState, resourceId: string, amount: number): void {
  if (!resourceId || resourceId.trim().length === 0) throw new Error("RESOURCE_ID_INVALID");
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_AMOUNT_INVALID");
  player.customResources = { ...(player.customResources ?? {}), [resourceId]: amount };
}

export function gainCustomResource(player: PlayerState, resourceId: string, amount: number, limit?: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_AMOUNT_INVALID");
  const current = getCustomResource(player, resourceId);
  const cap = Number.isInteger(limit) && (limit as number) >= 0 ? limit as number : Number.MAX_SAFE_INTEGER;
  const gained = Math.min(cap, current + amount) - current;
  setCustomResource(player, resourceId, current + gained);
  return gained;
}

export function spendCustomResource(player: PlayerState, resourceId: string, amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_AMOUNT_INVALID");
  const current = getCustomResource(player, resourceId);
  const spent = Math.min(current, amount);
  setCustomResource(player, resourceId, current - spent);
  return spent;
}

/** Check availability without mutating the authored resource pool. */
export function hasCustomResource(player: PlayerState, resourceId: string, amount: number): boolean {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_AMOUNT_INVALID");
  return getCustomResource(player, resourceId) >= amount;
}

/** Consume a custom resource atomically after validating availability. */
export function consumeCustomResource(player: PlayerState, resourceId: string, amount: number): boolean {
  if (!hasCustomResource(player, resourceId, amount)) return false;
  return spendCustomResource(player, resourceId, amount) === amount;
}

/** Transfer a named resource between players without creating additional copies. */
export function transferCustomResource(source: PlayerState, target: PlayerState, resourceId: string, amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_AMOUNT_INVALID");
  const transferred = Math.min(getCustomResource(source, resourceId), amount);
  if (transferred === 0) return 0;
  setCustomResource(source, resourceId, getCustomResource(source, resourceId) - transferred);
  setCustomResource(target, resourceId, getCustomResource(target, resourceId) + transferred);
  return transferred;
}

/** Apply a resource cap without requiring individual skills to own counter logic. */
export function normalizeCustomResource(player: PlayerState, resourceId: string, limit: number): number {
  if (!Number.isInteger(limit) || limit < 0) throw new Error("RESOURCE_LIMIT_INVALID");
  const current = getCustomResource(player, resourceId);
  const normalized = Math.min(current, limit);
  if (normalized !== current) setCustomResource(player, resourceId, normalized);
  return normalized;
}
