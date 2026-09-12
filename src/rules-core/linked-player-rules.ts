import type { GameState, PlayerState } from "../domain/state/types.ts";
import { isBattlefieldLocation } from "./battlefield-rules.ts";

export interface LinkedManaContributionRule {
  id: string;
  sourceId: string;
  beneficiaryPlayerId: string;
  contributorPlayerId: string;
  maxPerRound: number;
  beneficiaryRequiredStatus?: string;
  contributorRequiredStatus?: string;
  requireDifferentBattlefields?: boolean;
  requireSameBattlefield?: boolean;
  minimumContributorMana?: number;
}

export interface LinkedEntrySealRule {
  id: string;
  sourceId: string;
  entrantPlayerId: string;
  anchorPlayerId: string;
  entrantRequiredStatus?: string;
  anchorRequiredStatus?: string;
  commandSealCost: number;
  onlyBeforeClimax?: boolean;
}

interface CommandManaContributionChoice {
  contributorPlayerId: string;
  amount: number;
  paymentOrdinal: number;
  sourceInstanceId?: string;
  consumed: boolean;
}

interface CommandManaContributionContext {
  beneficiaryPlayerId: string;
  choices: CommandManaContributionChoice[];
  nextPaymentOrdinal: number;
}

const MANA_RULES_KEY = "linkedManaContributionRules";
const ENTRY_RULES_KEY = "linkedEntrySealRules";
const COMMAND_CONTEXT_KEY = "commandManaContributionContext";
const MANA_USAGE_KEY = "linkedManaContributionUsage";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function battlefield(state: GameState, locationId: string | null | undefined): boolean {
  return typeof locationId === "string" && isBattlefieldLocation(state, locationId);
}

function manaRules(state: GameState): LinkedManaContributionRule[] {
  const raw = state.modeState[MANA_RULES_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is LinkedManaContributionRule => isRecord(value)
    && typeof value.id === "string"
    && typeof value.sourceId === "string"
    && typeof value.beneficiaryPlayerId === "string"
    && typeof value.contributorPlayerId === "string"
    && Number.isInteger(value.maxPerRound));
}

function entryRules(state: GameState): LinkedEntrySealRule[] {
  const raw = state.modeState[ENTRY_RULES_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is LinkedEntrySealRule => isRecord(value)
    && typeof value.id === "string"
    && typeof value.sourceId === "string"
    && typeof value.entrantPlayerId === "string"
    && typeof value.anchorPlayerId === "string"
    && Number.isInteger(value.commandSealCost));
}

export function installLinkedManaContributionRule(state: GameState, rule: LinkedManaContributionRule): void {
  if (!rule.id || !rule.sourceId || !state.players[rule.beneficiaryPlayerId] || !state.players[rule.contributorPlayerId]
    || rule.beneficiaryPlayerId === rule.contributorPlayerId || !Number.isInteger(rule.maxPerRound) || rule.maxPerRound <= 0) {
    throw new Error("LINKED_MANA_RULE_INVALID");
  }
  state.modeState[MANA_RULES_KEY] = [...manaRules(state).filter((existing) => existing.id !== rule.id), structuredClone(rule)];
}

export function installLinkedEntrySealRule(state: GameState, rule: LinkedEntrySealRule): void {
  if (!rule.id || !rule.sourceId || !state.players[rule.entrantPlayerId] || !state.players[rule.anchorPlayerId]
    || rule.entrantPlayerId === rule.anchorPlayerId || !Number.isInteger(rule.commandSealCost) || rule.commandSealCost <= 0) {
    throw new Error("LINKED_ENTRY_RULE_INVALID");
  }
  state.modeState[ENTRY_RULES_KEY] = [...entryRules(state).filter((existing) => existing.id !== rule.id), structuredClone(rule)];
}

export function removeLinkedPlayerRulesBySource(state: GameState, sourceId: string): void {
  state.modeState[MANA_RULES_KEY] = manaRules(state).filter((rule) => rule.sourceId !== sourceId);
  state.modeState[ENTRY_RULES_KEY] = entryRules(state).filter((rule) => rule.sourceId !== sourceId);
}

function playerHasRequiredStatus(player: PlayerState | undefined, status: string | undefined): boolean {
  return Boolean(player && (!status || player.statuses.includes(status)));
}

function manaRuleLive(state: GameState, rule: LinkedManaContributionRule): boolean {
  const beneficiary = state.players[rule.beneficiaryPlayerId];
  const contributor = state.players[rule.contributorPlayerId];
  if (!beneficiary || !contributor || beneficiary.eliminated || contributor.eliminated
    || !playerHasRequiredStatus(beneficiary, rule.beneficiaryRequiredStatus)
    || !playerHasRequiredStatus(contributor, rule.contributorRequiredStatus)) return false;
  if (rule.requireDifferentBattlefields === true) {
    if (!battlefield(state, beneficiary.locationId) || !battlefield(state, contributor.locationId) || beneficiary.locationId === contributor.locationId) return false;
  }
  if (rule.requireSameBattlefield === true) {
    if (!battlefield(state, beneficiary.locationId) || beneficiary.locationId !== contributor.locationId) return false;
  }
  if (rule.minimumContributorMana !== undefined) {
    if (!Number.isInteger(rule.minimumContributorMana) || rule.minimumContributorMana < 0) throw new Error("LINKED_MANA_RULE_INVALID");
    if (contributor.flags.infiniteMana !== true && contributor.mana < rule.minimumContributorMana) return false;
  }
  return true;
}

function manaUsage(state: GameState): Record<string, { round: number; amount: number }> {
  const raw = state.modeState[MANA_USAGE_KEY];
  if (!isRecord(raw)) return {};
  const result: Record<string, { round: number; amount: number }> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value) || !Number.isInteger(value.round) || !Number.isInteger(value.amount)) continue;
    result[key] = { round: Number(value.round), amount: Number(value.amount) };
  }
  return result;
}

/**
 * Bind one explicit contribution choice to the current command transaction.
 * `paymentOrdinal` is zero-based among positive mana payments made by the actor.
 */
export function prepareCommandManaContribution(state: GameState, actorPlayerId: string, payload: unknown): void {
  delete state.modeState[COMMAND_CONTEXT_KEY];
  if (!isRecord(payload)) return;
  const rawChoices = Array.isArray(payload.manaContributions)
    ? payload.manaContributions
    : isRecord(payload.manaContribution) ? [payload.manaContribution] : [];
  if (rawChoices.length === 0) return;
  if (!state.players[actorPlayerId]) throw new Error("COMMAND_MANA_CONTRIBUTION_INVALID");
  const choices: CommandManaContributionChoice[] = rawChoices.map((raw) => {
    if (!isRecord(raw)) throw new Error("COMMAND_MANA_CONTRIBUTION_INVALID");
    const contributorPlayerId = typeof raw.contributorPlayerId === "string" ? raw.contributorPlayerId : "";
    const amount = Number(raw.amount);
    const paymentOrdinal = raw.paymentOrdinal === undefined ? 0 : Number(raw.paymentOrdinal);
    const sourceInstanceId = typeof raw.sourceInstanceId === "string" ? raw.sourceInstanceId : undefined;
    if (!state.players[contributorPlayerId] || actorPlayerId === contributorPlayerId
      || !Number.isInteger(amount) || amount <= 0 || !Number.isInteger(paymentOrdinal) || paymentOrdinal < 0) {
      throw new Error("COMMAND_MANA_CONTRIBUTION_INVALID");
    }
    return { contributorPlayerId, amount, paymentOrdinal, ...(sourceInstanceId ? { sourceInstanceId } : {}), consumed: false };
  });
  const keys = choices.map((choice) => `${choice.paymentOrdinal}:${choice.contributorPlayerId}`);
  if (new Set(keys).size !== keys.length) throw new Error("COMMAND_MANA_CONTRIBUTION_DUPLICATE");
  state.modeState[COMMAND_CONTEXT_KEY] = {
    beneficiaryPlayerId: actorPlayerId,
    choices,
    nextPaymentOrdinal: 0,
  } satisfies CommandManaContributionContext;
}

function commandContext(state: GameState): CommandManaContributionContext | undefined {
  const raw = state.modeState[COMMAND_CONTEXT_KEY];
  if (!isRecord(raw)) return undefined;
  const choices = Array.isArray(raw.choices) ? raw.choices.filter((choice): choice is CommandManaContributionChoice => isRecord(choice)
    && typeof choice.contributorPlayerId === "string" && Number.isInteger(choice.amount) && Number.isInteger(choice.paymentOrdinal)
    && typeof choice.consumed === "boolean") : [];
  return typeof raw.beneficiaryPlayerId === "string" && Number.isInteger(raw.nextPaymentOrdinal)
    ? { beneficiaryPlayerId: raw.beneficiaryPlayerId, choices, nextPaymentOrdinal: Number(raw.nextPaymentOrdinal) }
    : undefined;
}

export interface ManaContributionPart {
  contributorPlayerId: string;
  amount: number;
  ruleId: string;
  usageAmount: number;
  sourceInstanceId?: string;
  choiceIndex: number;
}

export interface ResolvedManaContribution {
  payerAmount: number;
  contributions: ManaContributionPart[];
  /** Backwards-compatible convenience fields for existing single-contributor callers. */
  contributorPlayerId?: string;
  contributorAmount: number;
  /** Transaction state is committed only after both mana pools were successfully charged. */
  commit?: {
    nextPaymentOrdinal: number;
    consumedChoiceIndexes: number[];
    usages: Array<{ ruleId: string; amount: number }>;
  };
}

/** Resolve one explicit split without mutating transaction/usage state. */
export function resolveCommandManaContribution(state: GameState, payerPlayerId: string, totalAmount: number): ResolvedManaContribution {
  if (!Number.isInteger(totalAmount) || totalAmount < 0) throw new Error("MANA_COST_INVALID");
  const context = commandContext(state);
  if (!context || context.beneficiaryPlayerId !== payerPlayerId || totalAmount === 0) {
    return { payerAmount: totalAmount, contributions: [], contributorAmount: 0 };
  }
  const ordinal = context.nextPaymentOrdinal;
  const selected = context.choices.map((choice, index) => ({ choice, index }))
    .filter(({ choice }) => !choice.consumed && choice.paymentOrdinal === ordinal);
  if (selected.length === 0) {
    return { payerAmount: totalAmount, contributions: [], contributorAmount: 0, commit: { nextPaymentOrdinal: ordinal + 1, consumedChoiceIndexes: [], usages: [] } };
  }
  const requestedTotal = selected.reduce((sum, entry) => sum + entry.choice.amount, 0);
  if (requestedTotal > totalAmount) throw new Error("COMMAND_MANA_CONTRIBUTION_INVALID");
  const usage = manaUsage(state);
  const nextUsage = new Map<string, number>();
  const contributions: ManaContributionPart[] = [];
  for (const { choice, index } of selected) {
    const candidates = manaRules(state).filter((rule) => rule.beneficiaryPlayerId === payerPlayerId
      && rule.contributorPlayerId === choice.contributorPlayerId && manaRuleLive(state, rule));
    if (candidates.length !== 1) throw new Error(candidates.length === 0 ? "MANA_CONTRIBUTION_NOT_ALLOWED" : "MANA_CONTRIBUTION_CONFLICT");
    const rule = candidates[0];
    const prior = nextUsage.has(rule.id) ? Number(nextUsage.get(rule.id)) : usage[rule.id]?.round === state.round ? usage[rule.id].amount : 0;
    const appliedUsage = prior + choice.amount;
    if (appliedUsage > rule.maxPerRound) throw new Error("MANA_CONTRIBUTION_ROUND_LIMIT_REACHED");
    const contributor = state.players[choice.contributorPlayerId];
    if (!contributor || (contributor.flags.infiniteMana !== true && contributor.mana < choice.amount)) throw new Error("MANA_CONTRIBUTOR_INSUFFICIENT_MANA");
    nextUsage.set(rule.id, appliedUsage);
    contributions.push({ contributorPlayerId: choice.contributorPlayerId, amount: choice.amount, ruleId: rule.id, usageAmount: appliedUsage, ...(choice.sourceInstanceId ? { sourceInstanceId: choice.sourceInstanceId } : {}), choiceIndex: index });
  }
  return {
    payerAmount: totalAmount - requestedTotal,
    contributions,
    ...(contributions.length === 1 ? { contributorPlayerId: contributions[0].contributorPlayerId } : {}),
    contributorAmount: requestedTotal,
    commit: {
      nextPaymentOrdinal: ordinal + 1,
      consumedChoiceIndexes: contributions.map((entry) => entry.choiceIndex),
      usages: [...nextUsage].map(([ruleId, amount]) => ({ ruleId, amount })),
    },
  };
}

/** Commit a previously resolved split after resource payment succeeds atomically. */
export function commitCommandManaContribution(state: GameState, resolved: ResolvedManaContribution): void {
  const commit = resolved.commit;
  if (!commit) return;
  const context = commandContext(state);
  if (!context || context.nextPaymentOrdinal + 1 !== commit.nextPaymentOrdinal) throw new Error("COMMAND_MANA_CONTRIBUTION_STATE_MISMATCH");
  context.nextPaymentOrdinal = commit.nextPaymentOrdinal;
  for (const index of commit.consumedChoiceIndexes) {
    if (!context.choices[index] || context.choices[index].consumed) throw new Error("COMMAND_MANA_CONTRIBUTION_STATE_MISMATCH");
    context.choices[index].consumed = true;
  }
  const usage = manaUsage(state);
  for (const entry of commit.usages) usage[entry.ruleId] = { round: state.round, amount: entry.amount };
  state.modeState[MANA_USAGE_KEY] = usage;
  state.modeState[COMMAND_CONTEXT_KEY] = context;
}

/** Reject stale/irrelevant contribution choices and remove transaction-only state. */
export function finishCommandManaContribution(state: GameState): void {
  const context = commandContext(state);
  delete state.modeState[COMMAND_CONTEXT_KEY];
  if (context && context.choices.some((choice) => !choice.consumed)) throw new Error("COMMAND_MANA_CONTRIBUTION_UNUSED");
}

export function clearCommandManaContribution(state: GameState): void {
  delete state.modeState[COMMAND_CONTEXT_KEY];
}

/** Return the seal cost for a voluntary deploy/move entering a linked anchor's current battlefield. */
export function getLinkedEntryCommandSealCost(state: GameState, entrantPlayerId: string, targetLocationId: string): number {
  const applicable = entryRules(state).filter((rule) => {
    if (rule.entrantPlayerId !== entrantPlayerId) return false;
    const entrant = state.players[rule.entrantPlayerId];
    const anchor = state.players[rule.anchorPlayerId];
    if (!entrant || !anchor || entrant.eliminated || anchor.eliminated
      || !playerHasRequiredStatus(entrant, rule.entrantRequiredStatus)
      || !playerHasRequiredStatus(anchor, rule.anchorRequiredStatus)) return false;
    if (rule.onlyBeforeClimax === true && state.modeState.currentSituationClimax === true) return false;
    return battlefield(state, targetLocationId) && anchor.locationId === targetLocationId && entrant.locationId !== targetLocationId;
  });
  if (applicable.length === 0) return 0;
  if (applicable.length > 1) throw new Error("LINKED_ENTRY_RULE_CONFLICT");
  return applicable[0].commandSealCost;
}
