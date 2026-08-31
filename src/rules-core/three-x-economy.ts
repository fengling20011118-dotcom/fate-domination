export type ThreeXPurchase = "servant-draw" | "climax-tiebreak" | "starting-mana" | "command-seal";

const THREE_X_PURCHASES = new Set<ThreeXPurchase>(["servant-draw", "climax-tiebreak", "starting-mana", "command-seal"]);

export function isThreeXPurchase(value: unknown): value is ThreeXPurchase {
  return typeof value === "string" && THREE_X_PURCHASES.has(value as ThreeXPurchase);
}

export interface ThreeXBudget {
  stones: number;
  purchases: Record<ThreeXPurchase, number>;
  extraStartingMana: number;
  climaxTiebreakBonus: number;
  extraCommandSeals: number;
}

export function getThreeXMasterRating(masterId: string, ratings: Record<string, number>, defaultRating = 4): number {
  const rating = ratings[masterId] ?? defaultRating;
  if (!Number.isInteger(rating) || rating < 0) throw new Error("THREE_X_MASTER_RATING_INVALID");
  return rating;
}

export function createThreeXBudgetForMaster(masterId: string, ratings: Record<string, number>, defaultRating = 4): ThreeXBudget {
  return createThreeXBudget(getThreeXMasterRating(masterId, ratings, defaultRating));
}

export function createThreeXBudget(stones: number): ThreeXBudget {
  if (!Number.isInteger(stones) || stones < 0) throw new Error("THREE_X_STONES_INVALID");
  return {
    stones,
    purchases: { "servant-draw": 0, "climax-tiebreak": 0, "starting-mana": 0, "command-seal": 0 },
    extraStartingMana: 0,
    climaxTiebreakBonus: 0,
    extraCommandSeals: 0,
  };
}

export function getThreeXPurchaseCost(purchase: ThreeXPurchase, previousCount: number): number {
  if (!Number.isInteger(previousCount) || previousCount < 0) throw new Error("THREE_X_PURCHASE_COUNT_INVALID");
  if (purchase === "command-seal") return 7;
  const cost = previousCount + 1;
  if (cost > 5) throw new Error("THREE_X_PURCHASE_LIMIT_REACHED");
  return cost;
}

export function applyThreeXPurchase(budget: ThreeXBudget, purchase: ThreeXPurchase): number {
  const previousCount = budget.purchases[purchase];
  const cost = getThreeXPurchaseCost(purchase, previousCount);
  if (budget.stones < cost) throw new Error("THREE_X_STONES_INSUFFICIENT");
  budget.stones -= cost;
  budget.purchases[purchase] += 1;
  if (purchase === "starting-mana") budget.extraStartingMana += 1;
  if (purchase === "climax-tiebreak") budget.climaxTiebreakBonus += 1;
  if (purchase === "command-seal") budget.extraCommandSeals += 1;
  return cost;
}

/** Applies a submitted purchase list atomically; failed submissions leave the budget unchanged. */
export function applyThreeXPurchases(budget: ThreeXBudget, purchases: ThreeXPurchase[]): number[] {
  if (!Array.isArray(purchases)) throw new Error("THREE_X_PURCHASE_LIST_INVALID");
  if (purchases.some((purchase) => !isThreeXPurchase(purchase))) throw new Error("THREE_X_PURCHASE_INVALID");
  const draft = structuredClone(budget);
  const costs = purchases.map((purchase) => applyThreeXPurchase(draft, purchase));
  Object.assign(budget, draft);
  return costs;
}

/** Unspent stones never carry into the match. */
export function finalizeThreeXPurchases(budget: ThreeXBudget): void {
  budget.stones = 0;
}

/** Finalizes all player budgets together; no unspent stones carry into the match. */
export function finalizeThreeXPurchasesForPlayers(budgets: Record<string, ThreeXBudget>, playerIds: string[]): void {
  const missing = playerIds.find((playerId) => !budgets[playerId]);
  if (missing) throw new Error("THREE_X_BUDGET_MISSING");
  for (const playerId of playerIds) finalizeThreeXPurchases(budgets[playerId]);
}
