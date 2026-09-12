import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { movePlayerCard } from "./decks.ts";

export interface LocationAccessPayment {
  ruleId: string;
  kind: "mana" | "discard";
  instanceId?: string;
}

export interface LocationAccessRule {
  id: string;
  sourceId: string;
  controllerPlayerId: string;
  locationId: string;
  /** Additional mana required whenever a voluntary route leaves this location. */
  leaveManaCost?: number;
  /** Optional entry toll. If discardAttributesByPlayer contains the entrant, one matching hand card may replace the mana payment. */
  enter?: {
    manaCost: number;
    discardAttributesByPlayer?: Record<string, string[]>;
    /** Text such as "on their turn" does not tax effect movement outside that player's own active window. */
    onlyOnActivePlayerTurn?: boolean;
  };
  duration: "round" | "game";
  createdRound?: number;
}

function isRule(value: unknown): value is LocationAccessRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as LocationAccessRule;
  return typeof item.id === "string" && typeof item.sourceId === "string"
    && typeof item.controllerPlayerId === "string" && typeof item.locationId === "string"
    && (item.duration === "round" || item.duration === "game");
}

export function getLocationAccessRules(state: GameState): LocationAccessRule[] {
  const raw = state.modeState.locationAccessRules;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRule).filter((rule) => rule.duration !== "round" || rule.createdRound === state.round);
}

export function setLocationAccessRule(state: GameState, rule: LocationAccessRule): void {
  if (!(rule.locationId in state.board.locations)) throw new Error("LOCATION_ACCESS_LOCATION_INVALID");
  if (!state.players[rule.controllerPlayerId]) throw new Error("LOCATION_ACCESS_CONTROLLER_INVALID");
  if (rule.duration === "round" && rule.createdRound !== state.round) throw new Error("LOCATION_ACCESS_ROUND_INVALID");
  const leave = Number(rule.leaveManaCost ?? 0);
  if (!Number.isInteger(leave) || leave < 0) throw new Error("LOCATION_ACCESS_LEAVE_COST_INVALID");
  if (rule.enter) {
    if (!Number.isInteger(rule.enter.manaCost) || rule.enter.manaCost < 0) throw new Error("LOCATION_ACCESS_ENTRY_COST_INVALID");
    for (const attributes of Object.values(rule.enter.discardAttributesByPlayer ?? {})) {
      if (!Array.isArray(attributes) || attributes.some((attribute) => typeof attribute !== "string" || attribute.length === 0)) {
        throw new Error("LOCATION_ACCESS_DISCARD_ATTRIBUTES_INVALID");
      }
    }
  }
  const current = getLocationAccessRules(state).filter((item) => item.id !== rule.id);
  state.modeState.locationAccessRules = [...current, structuredClone(rule)];
}

export function clearLocationAccessRule(state: GameState, ruleId: string): void {
  const current = getLocationAccessRules(state).filter((rule) => rule.id !== ruleId);
  if (current.length > 0) state.modeState.locationAccessRules = current;
  else delete state.modeState.locationAccessRules;
}

export function clearLocationAccessRulesBySource(state: GameState, sourceId: string): void {
  const current = getLocationAccessRules(state).filter((rule) => rule.sourceId !== sourceId);
  if (current.length > 0) state.modeState.locationAccessRules = current;
  else delete state.modeState.locationAccessRules;
}

function appliesOnEntry(state: GameState, playerId: string, rule: LocationAccessRule): boolean {
  if (!rule.enter) return false;
  if (rule.enter.onlyOnActivePlayerTurn === true && state.activePlayerId !== playerId) return false;
  return true;
}

export function getLocationRouteLeaveManaCost(state: GameState, routeSources: readonly string[]): number {
  let total = 0;
  const sourceSet = new Set(routeSources);
  for (const rule of getLocationAccessRules(state)) {
    if (!sourceSet.has(rule.locationId)) continue;
    const cost = Number(rule.leaveManaCost ?? 0);
    if (!Number.isInteger(cost) || cost < 0) throw new Error("LOCATION_ACCESS_LEAVE_COST_INVALID");
    total += cost;
  }
  return total;
}

export interface LocationEntryPaymentResolution {
  manaCost: number;
  discardInstanceIds: string[];
}

/**
 * Validate all location-entry tolls before mutating state. The calling movement/deployment
 * transaction can then pay the returned aggregate mana and discard the returned cards.
 */
export function resolveLocationEntryPayments(
  state: GameState,
  player: PlayerState,
  enteredLocationIds: readonly string[],
  definitions: Record<string, CardDefinition> | undefined,
  payments: readonly LocationAccessPayment[] = [],
): LocationEntryPaymentResolution {
  const entered = new Set(enteredLocationIds);
  const relevant = getLocationAccessRules(state).filter((rule) => entered.has(rule.locationId) && appliesOnEntry(state, player.id, rule));
  if (relevant.length === 0) return { manaCost: 0, discardInstanceIds: [] };
  const byRule = new Map(payments.map((payment) => [payment.ruleId, payment]));
  let manaCost = 0;
  const discardInstanceIds: string[] = [];
  for (const rule of relevant) {
    const enter = rule.enter!;
    if (enter.manaCost === 0) continue;
    const payment = byRule.get(rule.id);
    if (!payment) throw new Error("LOCATION_ACCESS_PAYMENT_REQUIRED");
    if (payment.kind === "mana") {
      manaCost += enter.manaCost;
      continue;
    }
    const instanceId = payment.instanceId;
    const card = instanceId ? state.cards[instanceId] : undefined;
    if (!definitions || !card || card.ownerPlayerId !== player.id || card.controllerPlayerId !== player.id
      || card.zone !== "hand" || !player.hand.includes(card.instanceId)) throw new Error("LOCATION_ACCESS_DISCARD_INVALID");
    const allowed = enter.discardAttributesByPlayer?.[player.id] ?? [];
    const definition = definitions[card.definitionId];
    if (!definition || allowed.length === 0
      || !getCardInstanceAttributes(card, definition, state, definitions).some((attribute) => allowed.includes(attribute))) {
      throw new Error("LOCATION_ACCESS_DISCARD_INVALID");
    }
    if (discardInstanceIds.includes(card.instanceId)) throw new Error("LOCATION_ACCESS_DISCARD_DUPLICATE");
    discardInstanceIds.push(card.instanceId);
  }
  return { manaCost, discardInstanceIds };
}

export function applyLocationEntryDiscards(state: GameState, playerId: string, instanceIds: readonly string[]): void {
  for (const instanceId of instanceIds) movePlayerCard(state, playerId, instanceId, "discard");
}
