import type { GameState } from "../domain/state/types.ts";
import { consumeRulerSeal, listRulerSealsControlledBy, recordRulerSealUse, type RulerSealRecord } from "./ruler-seals.ts";
import { gainMana, loseMana } from "./resources.ts";
import { payMana } from "./costs.ts";
import { isAbilityActivationBlocked } from "./ability-activation-restrictions.ts";

function sourcedManaSubstitutionRate(
  state: GameState,
  playerId: string,
  rateFlag: string,
  sourceFlag: string,
): number {
  const player = state.players[playerId];
  if (!player) throw new Error("COMMAND_SEAL_PLAYER_INVALID");
  const rate = Number(player.flags[rateFlag] ?? 0);
  if (!Number.isInteger(rate) || rate < 0) throw new Error("COMMAND_SEAL_MANA_SUBSTITUTION_INVALID");
  const sourceInstanceId = player.flags[sourceFlag];
  if (sourceInstanceId === undefined) return rate;
  if (typeof sourceInstanceId !== "string") throw new Error("COMMAND_SEAL_MANA_SUBSTITUTION_SOURCE_INVALID");
  const source = state.cards[sourceInstanceId];
  return source?.controllerPlayerId === playerId && source.zone === "attack" && source.active && source.face === "up" ? rate : 0;
}

function incrementRoundUsageFlag(state: GameState, playerId: string, kind: "normal" | "ruler"): void {
  const player = state.players[playerId];
  if (!player) throw new Error("COMMAND_SEAL_PLAYER_INVALID");
  if (kind === "normal") {
    player.flags.commandSealUsedRound = state.round;
    player.flags.commandSealUsesThisRound = Number(player.flags.commandSealUsesRound === state.round ? player.flags.commandSealUsesThisRound ?? 0 : 0) + 1;
    player.flags.commandSealUsesRound = state.round;
    return;
  }
  player.flags.rulerCommandSealUsedRound = state.round;
  player.flags.rulerCommandSealUsesThisRound = Number(player.flags.rulerCommandSealUsesRound === state.round ? player.flags.rulerCommandSealUsesThisRound ?? 0 : 0) + 1;
  player.flags.rulerCommandSealUsesRound = state.round;
}

/** Command-seal use bans do not prohibit paying a seal as a card/skill cost. */
export function assertCommandSealUseAllowed(state: GameState, playerId: string, purpose: "ability" | "movement" = "ability"): void {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("COMMAND_SEAL_PLAYER_INVALID");
  const movementOnlySourceInstanceId = typeof player.flags.commandSealUseMovementOnlySourceInstanceId === "string"
    ? player.flags.commandSealUseMovementOnlySourceInstanceId
    : undefined;
  const movementOnlySource = movementOnlySourceInstanceId ? state.cards[movementOnlySourceInstanceId] : undefined;
  if (purpose !== "movement" && movementOnlySource && movementOnlySource.zone !== "removed") {
    throw new Error("COMMAND_SEAL_USE_PURPOSE_FORBIDDEN");
  }
  if (Number(player.flags.commandSealUseBlockedThroughRound ?? Number.NEGATIVE_INFINITY) >= state.round) {
    throw new Error("COMMAND_SEAL_USE_BLOCKED");
  }
  if (isAbilityActivationBlocked(state, playerId, "action")) throw new Error("COMMAND_SEAL_USE_BLOCKED");
}

/** Consume one of the player's ordinary Command Seals and record an authoritative use fact. */
export function spendNormalCommandSeal(state: GameState, playerId: string, purpose: "ability" | "movement" = "ability"): void {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("COMMAND_SEAL_PLAYER_INVALID");
  assertCommandSealUseAllowed(state, playerId, purpose);
  if (!Number.isInteger(player.commandSeals) || player.commandSeals <= 0) throw new Error("COMMAND_SEAL_NOT_AVAILABLE");
  player.commandSeals -= 1;
  player.flags.commandSealSpentRound = state.round;
  incrementRoundUsageFlag(state, playerId, "normal");
}

export interface CommandSealCostPlan {
  paidSeals: number;
  substitutionCredits: number;
  availableCredits: number;
  manaSubstitutionCost: number;
}

/** Validate a Command Seal cost without mutating player resources. */
export function assertCommandSealCostPayable(state: GameState, playerId: string, amount = 1): CommandSealCostPlan {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("COMMAND_SEAL_PLAYER_INVALID");
  if (!Number.isInteger(amount) || amount < 0) throw new Error("COMMAND_SEAL_COST_INVALID");
  const creditRound = Number(player.flags.commandSealPaymentCreditRound ?? Number.NEGATIVE_INFINITY);
  const availableCredits = creditRound === state.round ? Math.max(0, Number(player.flags.commandSealPaymentCredits ?? 0)) : 0;
  if (!Number.isInteger(availableCredits)) throw new Error("COMMAND_SEAL_PAYMENT_CREDIT_INVALID");
  const substitutionCredits = Math.min(amount, availableCredits);
  const remaining = amount - substitutionCredits;
  const manaRate = sourcedManaSubstitutionRate(state, playerId, "commandSealCostManaSubstitution", "commandSealCostManaSubstitutionSourceInstanceId");
  const manaSubstitutionCost = manaRate > 0 ? remaining * manaRate : 0;
  const paidSeals = manaRate > 0 ? 0 : remaining;
  if (!Number.isInteger(player.commandSeals) || player.commandSeals < paidSeals) throw new Error("COMMAND_SEAL_NOT_AVAILABLE");
  if (manaSubstitutionCost > 0 && player.flags.infiniteMana !== true && player.mana < manaSubstitutionCost) throw new Error("COMMAND_SEAL_NOT_AVAILABLE");
  return { paidSeals, substitutionCredits, availableCredits, manaSubstitutionCost };
}

/**
 * Pay a Command Seal as a card/skill cost. This is deliberately distinct from
 * using a Command Seal ability: paying a cost does not set the authoritative
 * commandSealUsedRound fact (English Wiki ruling), and an armed replacement
 * credit may satisfy the cost without creating or consuming a real seal.
 */
export function payCommandSealCost(state: GameState, playerId: string, amount = 1): { paidSeals: number; substitutionCredits: number } {
  const player = state.players[playerId];
  const plan = assertCommandSealCostPayable(state, playerId, amount);
  if (!player) throw new Error("COMMAND_SEAL_PLAYER_INVALID");
  if (plan.manaSubstitutionCost > 0) payMana(player, plan.manaSubstitutionCost, "COMMAND_SEAL_NOT_AVAILABLE");
  player.commandSeals -= plan.paidSeals;
  if (plan.paidSeals > 0) player.flags.commandSealSpentRound = state.round;
  if (plan.substitutionCredits > 0) {
    const remaining = plan.availableCredits - plan.substitutionCredits;
    if (remaining > 0) player.flags.commandSealPaymentCredits = remaining;
    else {
      delete player.flags.commandSealPaymentCredits;
      delete player.flags.commandSealPaymentCreditRound;
    }
  }
  return { paidSeals: plan.paidSeals, substitutionCredits: plan.substitutionCredits };
}

/** Lose ordinary Command Seals without counting the loss as use or payment. */
export function loseCommandSeals(state: GameState, playerId: string, amount = 1): number {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("COMMAND_SEAL_PLAYER_INVALID");
  if (!Number.isInteger(amount) || amount < 0) throw new Error("COMMAND_SEAL_AMOUNT_INVALID");
  const manaRate = sourcedManaSubstitutionRate(state, playerId, "commandSealLossManaSubstitution", "commandSealLossManaSubstitutionSourceInstanceId");
  if (manaRate > 0) {
    loseMana(player, amount * manaRate);
    return 0;
  }
  const lost = Math.min(amount, Math.max(0, player.commandSeals));
  player.commandSeals -= lost;
  return lost;
}

/** Grant ordinary Command Seals through the shared replacement boundary. */
export function gainCommandSeals(state: GameState, playerId: string, amount = 1): { gainedSeals: number; gainedMana: number } {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("COMMAND_SEAL_PLAYER_INVALID");
  if (!Number.isInteger(amount) || amount < 0) throw new Error("COMMAND_SEAL_AMOUNT_INVALID");
  const manaRate = sourcedManaSubstitutionRate(state, playerId, "commandSealGainManaSubstitution", "commandSealGainManaSubstitutionSourceInstanceId");
  if (manaRate > 0) {
    const gainedMana = gainMana(player, amount * manaRate);
    return { gainedSeals: 0, gainedMana };
  }
  const maximum = player.flags.commandSealMaximum === undefined ? undefined : Number(player.flags.commandSealMaximum);
  if (maximum !== undefined && (!Number.isInteger(maximum) || maximum < 0)) throw new Error("COMMAND_SEAL_MAXIMUM_INVALID");
  const gainedSeals = maximum === undefined ? amount : Math.max(0, Math.min(amount, maximum - player.commandSeals));
  player.commandSeals += gainedSeals;
  return { gainedSeals, gainedMana: 0 };
}

/** Consume a Ruler Seal owned/distributed by its controller and record that controller as the user. */
export function spendRulerCommandSeal(state: GameState, controllerPlayerId: string, sealId: string): RulerSealRecord {
  const player = state.players[controllerPlayerId];
  if (!player || player.eliminated) throw new Error("RULER_SEAL_CONTROLLER_INVALID");
  assertCommandSealUseAllowed(state, controllerPlayerId);
  const seal = consumeRulerSeal(state, sealId, controllerPlayerId);
  recordRulerSealUse(state, seal);
  incrementRoundUsageFlag(state, controllerPlayerId, "ruler");
  return seal;
}

/**
 * Pay a Ruler Seal as a printed card/skill cost. Like ordinary Command Seal
 * costs, this consumes the physical resource without counting as use of the
 * Ruler Seal's Action ability.
 */
export function payRulerSealCost(state: GameState, controllerPlayerId: string, sealId: string): RulerSealRecord {
  const player = state.players[controllerPlayerId];
  if (!player || player.eliminated) throw new Error("RULER_SEAL_CONTROLLER_INVALID");
  return consumeRulerSeal(state, sealId, controllerPlayerId);
}

/** Unused seals owned by this player; Ruler Seals belong to their distributor/controller. */
export function countUnusedOwnedCommandSeals(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  if (!player || player.eliminated) return 0;
  return Math.max(0, Number(player.commandSeals ?? 0)) + listRulerSealsControlledBy(state, playerId).length;
}

/** Current, dynamic total of unused seals held by living opponents in the same fight. */
export function countEngagedOpponentUnusedCommandSeals(
  state: GameState,
  playerId: string,
  locationId: string | null | undefined = state.players[playerId]?.locationId,
): number {
  if (locationId !== "mountain" && locationId !== "city") return 0;
  return (state.board.locations[locationId] ?? []).reduce((sum, candidateId) => {
    if (candidateId === playerId) return sum;
    const candidate = state.players[candidateId];
    if (!candidate || candidate.eliminated) return sum;
    return sum + countUnusedOwnedCommandSeals(state, candidateId);
  }, 0);
}
