import { createThreeXBudgetForMaster, type ThreeXBudget } from "./three-x-economy.ts";
import type { GameState } from "../domain/state/types.ts";

export type ThreeXSetupPhase = "ban" | "master-draft" | "purchase" | "servant-select" | "turn-order" | "complete";

export interface ThreeXModeState {
  /** Stable roster captured when the room is created; prevents stale-room players entering setup. */
  playerIds: string[];
  setupPhase: ThreeXSetupPhase;
  bannedMasterIds: string[];
  banSelections: Record<string, string[]>;
  banCommittedPlayerIds: string[];
  selectedMasterIds: Record<string, string>;
  /** Three masters dealt to each player before the one-master selection. */
  masterOffers: Record<string, string[]>;
  selectedServantIds: Record<string, string>;
  servantOffers: Record<string, string[]>;
  budgets: Record<string, ThreeXBudget>;
  purchaseCommittedPlayerIds: string[];
  turnOrderLocked: boolean;
}

export function createThreeXModeState(playerIds: string[]): ThreeXModeState {
  if (playerIds.length === 0 || new Set(playerIds).size !== playerIds.length || playerIds.some((id) => !id)) {
    throw new Error("THREE_X_PLAYER_ROSTER_INVALID");
  }
  return {
    playerIds: [...playerIds],
    setupPhase: "ban",
    bannedMasterIds: [],
    banSelections: Object.fromEntries(playerIds.map((id) => [id, []])),
    banCommittedPlayerIds: [],
    selectedMasterIds: {},
    masterOffers: Object.fromEntries(playerIds.map((id) => [id, []])),
    selectedServantIds: {},
    servantOffers: Object.fromEntries(playerIds.map((id) => [id, []])),
    budgets: Object.fromEntries(playerIds.map((id) => [id, { stones: 0, purchases: { "servant-draw": 0, "climax-tiebreak": 0, "starting-mana": 0, "command-seal": 0 }, extraStartingMana: 0, climaxTiebreakBonus: 0, extraCommandSeals: 0 }])),
    purchaseCommittedPlayerIds: [],
    turnOrderLocked: false,
  };
}

/** Validates optional authored 3X pools before a room can expose them. */
export function assertThreeXContentPools(masterPool?: string[], servantPool?: string[]): void {
  for (const [kind, pool] of [["master", masterPool], ["servant", servantPool]] as const) {
    if (pool === undefined) continue;
    if (!Array.isArray(pool) || pool.length === 0 || pool.some((id) => typeof id !== "string" || id.length === 0) || new Set(pool).size !== pool.length) {
      throw new Error(`THREE_X_${kind.toUpperCase()}_POOL_INVALID`);
    }
  }
}

export function assertThreeXSetupPhase(state: ThreeXModeState, expected: ThreeXSetupPhase): void {
  if (state.setupPhase !== expected) throw new Error("THREE_X_SETUP_PHASE_FORBIDDEN");
}

export function completeThreeXSetupPhase(state: ThreeXModeState, expected: ThreeXSetupPhase, next: ThreeXSetupPhase): void {
  assertThreeXSetupPhase(state, expected);
  const allowed: Record<ThreeXSetupPhase, ThreeXSetupPhase | null> = {
    ban: "master-draft",
    "master-draft": "purchase",
    purchase: "servant-select",
    "servant-select": "turn-order",
    "turn-order": "complete",
    complete: null,
  };
  if (allowed[expected] !== next) throw new Error("THREE_X_SETUP_TRANSITION_INVALID");
  state.setupPhase = next;
}

export function banThreeXMaster(state: ThreeXModeState, masterId: string): void {
  assertThreeXSetupPhase(state, "ban");
  if (!masterId || state.bannedMasterIds.includes(masterId)) throw new Error("THREE_X_BAN_INVALID");
  state.bannedMasterIds.push(masterId);
}

export function submitThreeXBan(state: ThreeXModeState, playerId: string, masterId: string, masterPool?: string[]): void {
  assertThreeXSetupPhase(state, "ban");
  if (!state.playerIds.includes(playerId) || !masterId || (masterPool && !masterPool.includes(masterId))) throw new Error("THREE_X_BAN_INVALID");
  if (state.banCommittedPlayerIds.includes(playerId)) throw new Error("THREE_X_BAN_ALREADY_COMMITTED");
  const selections = state.banSelections[playerId] ?? [];
  if (selections.includes(masterId) || state.bannedMasterIds.includes(masterId)) throw new Error("THREE_X_BAN_INVALID");
  selections.push(masterId);
  state.banSelections[playerId] = selections;
  state.bannedMasterIds = [...new Set([...state.bannedMasterIds, masterId])];
}

export function commitThreeXBan(state: ThreeXModeState, playerId: string): void {
  assertThreeXSetupPhase(state, "ban");
  if (!state.playerIds.includes(playerId)) throw new Error("THREE_X_PLAYER_INVALID");
  if (state.banCommittedPlayerIds.includes(playerId)) throw new Error("THREE_X_BAN_ALREADY_COMMITTED");
  state.banCommittedPlayerIds.push(playerId);
}

/** Explicitly commits the Ban stage; this prevents a single click from skipping confirmation. */
export function finalizeThreeXBan(state: ThreeXModeState): void {
  assertThreeXSetupPhase(state, "ban");
  if (state.banCommittedPlayerIds.length > 0 && state.playerIds.some((id) => !state.banCommittedPlayerIds.includes(id))) throw new Error("THREE_X_BAN_INCOMPLETE");
  state.setupPhase = "master-draft";
}

/** Strict authoritative confirmation: every player must explicitly commit Ban. */
export function finalizeThreeXBanStrict(state: ThreeXModeState): void {
  assertThreeXSetupPhase(state, "ban");
  if (state.playerIds.some((id) => !state.banCommittedPlayerIds.includes(id))) throw new Error("THREE_X_BAN_INCOMPLETE");
  state.setupPhase = "master-draft";
}

/** Deterministic AI Ban used before human master selection. */
export function autoBanThreeXMasters(state: ThreeXModeState, availableMasterIds: string[], count = 1): string[] {
  assertThreeXSetupPhase(state, "ban");
  if (!Array.isArray(availableMasterIds) || new Set(availableMasterIds).size !== availableMasterIds.length || !Number.isInteger(count) || count < 0) throw new Error("THREE_X_AI_BAN_INVALID");
  const candidates = availableMasterIds.filter((id) => id && !state.bannedMasterIds.includes(id));
  if (candidates.length < count) throw new Error("THREE_X_AI_BAN_POOL_INSUFFICIENT");
  const chosen = candidates.slice(0, count);
  state.bannedMasterIds.push(...chosen);
  state.banSelections.ai = [...(state.banSelections.ai ?? []), ...chosen];
  return chosen;
}

export function selectThreeXMaster(state: ThreeXModeState, playerId: string, masterId: string): void {
  assertThreeXSetupPhase(state, "master-draft");
  if (!state.playerIds.includes(playerId) || !playerId || !masterId || state.bannedMasterIds.includes(masterId)) throw new Error("THREE_X_MASTER_SELECTION_INVALID");
  const offer = state.masterOffers[playerId] ?? [];
  if (offer.length > 0 && !offer.includes(masterId)) throw new Error("THREE_X_MASTER_NOT_OFFERED");
  const taken = Object.entries(state.selectedMasterIds).some(([id, selected]) => id !== playerId && selected === masterId);
  if (taken) throw new Error("THREE_X_MASTER_ALREADY_SELECTED");
  state.selectedMasterIds[playerId] = masterId;
}

/** Deals a deterministic master offer; the caller supplies an already shuffled pool. */
export function dealThreeXMasterOffer(state: ThreeXModeState, playerId: string, masterPool: string[], count = 3, randomInt?: (maxExclusive: number) => number): string[] {
  assertThreeXSetupPhase(state, "master-draft");
  if (!state.playerIds.includes(playerId) || !Array.isArray(masterPool) || new Set(masterPool).size !== masterPool.length || !Number.isInteger(count) || count < 1) {
    throw new Error("THREE_X_MASTER_OFFER_INVALID");
  }
  if (masterPool.length < count) throw new Error("THREE_X_MASTER_POOL_INSUFFICIENT");
  const taken = new Set(Object.values(state.masterOffers).flat());
  const available = masterPool.filter((id) => id && !state.bannedMasterIds.includes(id) && !taken.has(id));
  if (available.length < count) throw new Error("THREE_X_MASTER_POOL_INSUFFICIENT");
  const shuffled = shuffleOffer(available, randomInt);
  const offer = shuffled.slice(0, count);
  state.masterOffers[playerId] = [...(state.masterOffers[playerId] ?? []), ...offer];
  return [...offer];
}

export function selectThreeXServant(state: ThreeXModeState, playerId: string, servantId: string): void {
  assertThreeXSetupPhase(state, "servant-select");
  if (!state.playerIds.includes(playerId) || !playerId || !servantId) throw new Error("THREE_X_SERVANT_SELECTION_INVALID");
  const offer = state.servantOffers[playerId] ?? [];
  if (offer.length > 0 && !offer.includes(servantId)) throw new Error("THREE_X_SERVANT_NOT_OFFERED");
  const taken = Object.entries(state.selectedServantIds).some(([id, selected]) => id !== playerId && selected === servantId);
  if (taken) throw new Error("THREE_X_SERVANT_ALREADY_SELECTED");
  state.selectedServantIds[playerId] = servantId;
}

/** Deals a deterministic servant offer; the caller supplies an already shuffled pool. */
export function dealThreeXServantOffer(state: ThreeXModeState, playerId: string, servantPool: string[], count = 1, randomInt?: (maxExclusive: number) => number): string[] {
  assertThreeXSetupPhase(state, "servant-select");
  if (!state.playerIds.includes(playerId) || !Array.isArray(servantPool) || new Set(servantPool).size !== servantPool.length || !Number.isInteger(count) || count < 1) throw new Error("THREE_X_SERVANT_OFFER_INVALID");
  if (servantPool.length < count) throw new Error("THREE_X_SERVANT_POOL_INSUFFICIENT");
  const taken = new Set(Object.values(state.servantOffers).flat());
  const available = servantPool.filter((id) => id && !taken.has(id));
  if (available.length < count) throw new Error("THREE_X_SERVANT_POOL_INSUFFICIENT");
  const shuffled = shuffleOffer(available, randomInt);
  const offer = shuffled.slice(0, count);
  state.servantOffers[playerId] = [...(state.servantOffers[playerId] ?? []), ...offer];
  return [...offer];
}

function shuffleOffer(values: string[], randomInt?: (maxExclusive: number) => number): string[] {
  const result = [...values];
  if (!randomInt) return result;
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    if (!Number.isInteger(target) || target < 0 || target > index) throw new Error("THREE_X_OFFER_RNG_INVALID");
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function lockThreeXTurnOrder(state: ThreeXModeState, playerIds: string[]): void {
  assertThreeXSetupPhase(state, "turn-order");
  if (state.turnOrderLocked) throw new Error("THREE_X_TURN_ORDER_LOCKED");
  if (new Set(playerIds).size !== playerIds.length || playerIds.length === 0 || playerIds.length !== state.playerIds.length || playerIds.some((id) => !state.playerIds.includes(id))) throw new Error("THREE_X_TURN_ORDER_INVALID");
  state.turnOrderLocked = true;
  state.setupPhase = "complete";
}

/** Guards the hand-off from 3X setup to the ordinary match engine. */
export function assertThreeXReadyForStart(state: ThreeXModeState): void {
  if (state.setupPhase !== "complete" || !state.turnOrderLocked) throw new Error("THREE_X_SETUP_INCOMPLETE");
  for (const playerId of state.playerIds) {
    if (!state.selectedMasterIds[playerId] || !state.selectedServantIds[playerId]) throw new Error("THREE_X_PLAYER_SELECTION_INCOMPLETE");
    if (!state.budgets[playerId]) throw new Error("THREE_X_BUDGET_MISSING");
  }
  if (new Set(state.purchaseCommittedPlayerIds).size !== state.purchaseCommittedPlayerIds.length || state.purchaseCommittedPlayerIds.some((id) => !state.playerIds.includes(id))) throw new Error("THREE_X_PURCHASE_COMMIT_INVALID");
}

/** Validates final identities against the authored pools when a formal 3X pool is configured. */
export function assertThreeXSelectionsInPools(state: ThreeXModeState, masterPool?: string[], servantPool?: string[]): void {
  for (const playerId of state.playerIds) {
    const masterId = state.selectedMasterIds[playerId];
    const servantId = state.selectedServantIds[playerId];
    if (masterPool && (!masterId || !masterPool.includes(masterId))) throw new Error("THREE_X_MASTER_NOT_IN_POOL");
    if (servantPool && (!servantId || !servantPool.includes(servantId))) throw new Error("THREE_X_SERVANT_NOT_IN_POOL");
  }
}

/** Validates a deserialized 3X state before applying a command or starting a match. */
export function assertThreeXStateInvariants(state: ThreeXModeState): void {
  if (!state || !Array.isArray(state.playerIds) || state.playerIds.length === 0 || new Set(state.playerIds).size !== state.playerIds.length) {
    throw new Error("THREE_X_STATE_INVALID");
  }
  if (!state.playerIds.every((id) => typeof id === "string" && id.length > 0)) throw new Error("THREE_X_STATE_INVALID");
  for (const playerId of state.playerIds) {
    const budget = state.budgets?.[playerId];
    if (!budget || !Number.isInteger(budget.stones) || budget.stones < 0) throw new Error("THREE_X_BUDGET_INVALID");
    if (![budget.extraStartingMana, budget.climaxTiebreakBonus, budget.extraCommandSeals].every((value) => Number.isInteger(value) && value >= 0)) throw new Error("THREE_X_BUDGET_INVALID");
    for (const purchase of ["servant-draw", "climax-tiebreak", "starting-mana", "command-seal"] as const) {
      if (!Number.isInteger(budget.purchases?.[purchase]) || budget.purchases[purchase] < 0) throw new Error("THREE_X_PURCHASES_INVALID");
    }
  }
  if (new Set(state.bannedMasterIds).size !== state.bannedMasterIds.length) throw new Error("THREE_X_BAN_INVALID");
  if (!state.banSelections || !state.banCommittedPlayerIds || new Set(state.banCommittedPlayerIds).size !== state.banCommittedPlayerIds.length || state.banCommittedPlayerIds.some((id) => !state.playerIds.includes(id))) throw new Error("THREE_X_BAN_STATE_INVALID");
  if (!state.masterOffers || Object.entries(state.masterOffers).some(([playerId, offer]) => !state.playerIds.includes(playerId) || !Array.isArray(offer) || new Set(offer).size !== offer.length)) throw new Error("THREE_X_MASTER_OFFER_INVALID");
  if (Object.values(state.masterOffers).flat().some((masterId) => !masterId || state.bannedMasterIds.includes(masterId))) throw new Error("THREE_X_MASTER_OFFER_INVALID");
  const masterOfferIds = Object.values(state.masterOffers).flat();
  if (new Set(masterOfferIds).size !== masterOfferIds.length) throw new Error("THREE_X_MASTER_OFFER_DUPLICATE");
  const masters = Object.entries(state.selectedMasterIds);
  if (masters.some(([playerId, masterId]) => !state.playerIds.includes(playerId) || !masterId || state.bannedMasterIds.includes(masterId))) throw new Error("THREE_X_MASTER_SELECTION_INVALID");
  if (new Set(masters.map(([, masterId]) => masterId)).size !== masters.length) throw new Error("THREE_X_MASTER_ALREADY_SELECTED");
  for (const [playerId, masterId] of masters) {
    const offer = state.masterOffers[playerId] ?? [];
    if (offer.length > 0 && !offer.includes(masterId)) throw new Error("THREE_X_MASTER_SELECTION_INVALID");
  }
  const servants = Object.entries(state.selectedServantIds);
  if (servants.some(([playerId, servantId]) => !state.playerIds.includes(playerId) || !servantId)) throw new Error("THREE_X_SERVANT_SELECTION_INVALID");
  if (new Set(servants.map(([, servantId]) => servantId)).size !== servants.length) throw new Error("THREE_X_SERVANT_ALREADY_SELECTED");
  if (!state.servantOffers || Object.entries(state.servantOffers).some(([playerId, offer]) => !state.playerIds.includes(playerId) || !Array.isArray(offer) || new Set(offer).size !== offer.length)) throw new Error("THREE_X_SERVANT_OFFER_INVALID");
  if (Object.values(state.servantOffers).flat().some((servantId) => !servantId)) throw new Error("THREE_X_SERVANT_OFFER_INVALID");
  const servantOfferIds = Object.values(state.servantOffers).flat();
  if (new Set(servantOfferIds).size !== servantOfferIds.length) throw new Error("THREE_X_SERVANT_OFFER_DUPLICATE");
  for (const [playerId, servantId] of servants) {
    const offer = state.servantOffers[playerId] ?? [];
    if (offer.length > 0 && !offer.includes(servantId)) throw new Error("THREE_X_SERVANT_SELECTION_INVALID");
  }
}

/** Commits the master draft and grants each player stones from the selected master's rating. */
export function finalizeThreeXMasterDraft(state: ThreeXModeState, ratings: Record<string, number>, defaultRating = 4): void {
  assertThreeXSetupPhase(state, "master-draft");
  for (const playerId of state.playerIds) {
    const masterId = state.selectedMasterIds[playerId];
    if (!masterId) throw new Error("THREE_X_MASTER_SELECTION_INCOMPLETE");
    const offer = state.masterOffers[playerId] ?? [];
    if (Object.values(state.masterOffers).some((items) => items.length > 0) && offer.length !== 3) {
      throw new Error("THREE_X_MASTER_OFFER_INCOMPLETE");
    }
    state.budgets[playerId] = createThreeXBudgetForMaster(masterId, ratings, defaultRating);
  }
  state.setupPhase = "purchase";
}

/** Commits servant choices only after every player has selected one. */
export function finalizeThreeXServantSelection(state: ThreeXModeState): void {
  assertThreeXSetupPhase(state, "servant-select");
  if (state.playerIds.some((playerId) => !state.selectedServantIds[playerId])) {
    throw new Error("THREE_X_SERVANT_SELECTION_INCOMPLETE");
  }
  state.setupPhase = "turn-order";
}

/** Marks one player's purchase submission; the phase advances only after all players commit. */
export function commitThreeXPurchases(state: ThreeXModeState, playerId: string): void {
  assertThreeXSetupPhase(state, "purchase");
  if (!state.playerIds.includes(playerId)) throw new Error("THREE_X_PLAYER_INVALID");
  if (state.purchaseCommittedPlayerIds.includes(playerId)) throw new Error("THREE_X_PURCHASE_ALREADY_COMMITTED");
  state.purchaseCommittedPlayerIds.push(playerId);
  if (state.playerIds.every((id) => state.purchaseCommittedPlayerIds.includes(id))) state.setupPhase = "servant-select";
}

/** Applies the completed 3X setup to player state at the standard-engine hand-off. */
export function applyThreeXStartModifiers(state: GameState): void {
  const mode = state.modeState.threeX as ThreeXModeState | undefined;
  if (!mode) throw new Error("THREE_X_STATE_MISSING");
  assertThreeXReadyForStart(mode);
  for (const playerId of mode.playerIds) {
    const player = state.players[playerId];
    if (!player) throw new Error("THREE_X_PLAYER_MISSING");
    player.masterId = mode.selectedMasterIds[playerId];
    player.servantId = mode.selectedServantIds[playerId];
    player.mana = 4 + mode.budgets[playerId].extraStartingMana;
    player.commandSeals = 3 + mode.budgets[playerId].extraCommandSeals;
    player.ready = true;
  }
}
