import type { GameState, PlayerState, StackedStatusModifier } from "../domain/state/types.ts";

function assertStatus(status: StackedStatusModifier): void {
  if (!status.id || !status.sourceId) throw new Error("STACKED_STATUS_ID_INVALID");
  if (!Number.isInteger(status.count) || status.count < 0) throw new Error("STACKED_STATUS_COUNT_INVALID");
  if (!Number.isFinite(status.totalPowerPerStack)) throw new Error("STACKED_STATUS_POWER_INVALID");
  if (status.maxPowerStacks !== undefined && (!Number.isInteger(status.maxPowerStacks) || status.maxPowerStacks < 0)) {
    throw new Error("STACKED_STATUS_POWER_STACK_CAP_INVALID");
  }
  if (status.removalManaCost !== undefined && (!Number.isInteger(status.removalManaCost) || status.removalManaCost < 0)) {
    throw new Error("STACKED_STATUS_REMOVAL_COST_INVALID");
  }
  if (status.upgradedTotalPowerPerStack !== undefined && !Number.isFinite(status.upgradedTotalPowerPerStack)) {
    throw new Error("STACKED_STATUS_UPGRADED_POWER_INVALID");
  }
  if (status.upgradedRemovalManaCost !== undefined && (!Number.isInteger(status.upgradedRemovalManaCost) || status.upgradedRemovalManaCost < 0)) {
    throw new Error("STACKED_STATUS_UPGRADED_REMOVAL_COST_INVALID");
  }
}

export function getStackedStatus(player: PlayerState, statusId: string): StackedStatusModifier | undefined {
  return (player.stackedStatusModifiers ?? []).find((status) => status.id === statusId);
}

function isStatusUpgradeOwned(state: GameState, status: StackedStatusModifier): boolean {
  if (!status.upgradeSourceDefinitionId || !status.sourcePlayerId) return false;
  return Object.values(state.cards).some((card) => card.ownerPlayerId === status.sourcePlayerId
    && card.zone !== "removed" && card.zone !== "discard"
    && card.definitionId === status.upgradeSourceDefinitionId);
}

export function getEffectiveStackedStatusTotalPowerPerStack(state: GameState, status: StackedStatusModifier): number {
  assertStatus(status);
  return isStatusUpgradeOwned(state, status) && status.upgradedTotalPowerPerStack !== undefined
    ? status.upgradedTotalPowerPerStack
    : status.totalPowerPerStack;
}

export function getEffectiveStackedStatusRemovalManaCost(state: GameState, status: StackedStatusModifier): number {
  assertStatus(status);
  return isStatusUpgradeOwned(state, status) && status.upgradedRemovalManaCost !== undefined
    ? status.upgradedRemovalManaCost
    : (status.removalManaCost ?? 0);
}

export function addStackedStatus(
  player: PlayerState,
  input: Omit<StackedStatusModifier, "count"> & { count?: number },
): StackedStatusModifier {
  const amount = input.count ?? 1;
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("STACKED_STATUS_ADD_COUNT_INVALID");
  const existing = getStackedStatus(player, input.id);
  if (existing) {
    if (existing.sourceId !== input.sourceId || existing.sourcePlayerId !== input.sourcePlayerId) throw new Error("STACKED_STATUS_SOURCE_CONFLICT");
    existing.count += amount;
    existing.totalPowerPerStack = input.totalPowerPerStack;
    existing.maxPowerStacks = input.maxPowerStacks;
    existing.removalManaCost = input.removalManaCost;
    existing.upgradeSourceDefinitionId = input.upgradeSourceDefinitionId;
    existing.upgradedTotalPowerPerStack = input.upgradedTotalPowerPerStack;
    existing.upgradedRemovalManaCost = input.upgradedRemovalManaCost;
    assertStatus(existing);
    return existing;
  }
  const created: StackedStatusModifier = {
    id: input.id,
    sourceId: input.sourceId,
    ...(input.sourcePlayerId ? { sourcePlayerId: input.sourcePlayerId } : {}),
    count: amount,
    totalPowerPerStack: input.totalPowerPerStack,
    ...(input.maxPowerStacks === undefined ? {} : { maxPowerStacks: input.maxPowerStacks }),
    ...(input.removalManaCost === undefined ? {} : { removalManaCost: input.removalManaCost }),
    ...(input.upgradeSourceDefinitionId ? { upgradeSourceDefinitionId: input.upgradeSourceDefinitionId } : {}),
    ...(input.upgradedTotalPowerPerStack === undefined ? {} : { upgradedTotalPowerPerStack: input.upgradedTotalPowerPerStack }),
    ...(input.upgradedRemovalManaCost === undefined ? {} : { upgradedRemovalManaCost: input.upgradedRemovalManaCost }),
  };
  assertStatus(created);
  player.stackedStatusModifiers = [...(player.stackedStatusModifiers ?? []), created];
  return created;
}

export function updateStackedStatusRule(
  player: PlayerState,
  statusId: string,
  rule: Pick<StackedStatusModifier, "totalPowerPerStack" | "removalManaCost">,
): StackedStatusModifier | undefined {
  const status = getStackedStatus(player, statusId);
  if (!status) return undefined;
  status.totalPowerPerStack = rule.totalPowerPerStack;
  status.removalManaCost = rule.removalManaCost;
  assertStatus(status);
  return status;
}

export function removeStackedStatus(player: PlayerState, statusId: string, count = 1): number {
  if (!Number.isInteger(count) || count <= 0) throw new Error("STACKED_STATUS_REMOVE_COUNT_INVALID");
  const status = getStackedStatus(player, statusId);
  if (!status) return 0;
  const removed = Math.min(count, status.count);
  status.count -= removed;
  if (status.count <= 0) {
    player.stackedStatusModifiers = (player.stackedStatusModifiers ?? []).filter((candidate) => candidate.id !== statusId);
  }
  return removed;
}

/** Sum all structured stackable aggregate power modifiers; no display text is interpreted at runtime. */
export function getStackedStatusTotalPowerModifier(state: GameState, player: PlayerState): number {
  return (player.stackedStatusModifiers ?? []).reduce((total, status) => {
    assertStatus(status);
    const contributingStacks = status.maxPowerStacks === undefined ? status.count : Math.min(status.count, status.maxPowerStacks);
    return total + contributingStacks * getEffectiveStackedStatusTotalPowerPerStack(state, status);
  }, 0);
}
