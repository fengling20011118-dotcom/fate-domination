import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";
import { getStructuredOpponentDefeatManaCost, isStructuredDefeatIgnored } from "./rule-modifiers.ts";
import { isOtherPlayerAbilityEffectIgnored } from "./ability-immunity.ts";

export type DomainEventSink = (type: string, payload: unknown) => void;

/** Generic defeat-immunity boundary. Character packages express immunity through flags,
 * structured modifiers, or an active card condition; generic runtime knows no owner IDs. */
export function playerIgnoresDefeat(
  state: GameState,
  player: GameState["players"][string],
  definitions?: Record<string, CardDefinition>,
): boolean {
  if (player.flags.ignoreDefeat === true || player.flags.ignoreDefeatRound === state.round) return true;
  if (!definitions) return false;
  if (isStructuredDefeatIgnored(state, player.id, definitions)) return true;
  const linkedOwnerDefeatIgnore = Object.values(state.cards).some((instance) => {
    if (!instance.active || instance.face !== "up" || instance.zone !== "attack" || !instance.ownerPlayerId || !instance.controllerPlayerId) return false;
    const definition = definitions[instance.definitionId];
    if (definition?.linkedOwnerDefeatIgnore !== true || (player.id !== instance.ownerPlayerId && player.id !== instance.controllerPlayerId)) return false;
    if (instance.ownerPlayerId === instance.controllerPlayerId) return player.id === instance.ownerPlayerId;
    const owner = state.players[instance.ownerPlayerId];
    const controller = state.players[instance.controllerPlayerId];
    return Boolean(owner && controller && owner.locationId && owner.locationId === controller.locationId);
  });
  if (linkedOwnerDefeatIgnore) return true;
  return player.attack.some((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!instance?.active || instance.face !== "up" || !definition?.playerDefeatIgnoreCondition) return false;
    const condition = definition.playerDefeatIgnoreCondition.playerFlagEquals;
    return Boolean(condition && player.flags[condition.key] === condition.value);
  });
}

/**
 * Single rules-core boundary for entering the defeated state. Repeated defeat is
 * idempotent and does not emit duplicate facts. Ignore-defeat rules are checked
 * by the caller at the rule checkpoint where they apply.
 */
export function defeatPlayer(
  state: GameState,
  playerId: string,
  emitEvent?: DomainEventSink,
  details: Record<string, unknown> = {},
): boolean {
  const player = state.players[playerId];
  if (!player || player.eliminated) return false;
  if (player.defeated) return false;
  player.defeated = true;
  emitEvent?.("player.defeated", { playerId, ...details });
  return true;
}

function payDefeatEffectCost(
  state: GameState,
  targetPlayerId: string,
  controllerPlayerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  const controller = state.players[controllerPlayerId];
  if (!controller || controller.eliminated) return false;
  if (controllerPlayerId === targetPlayerId) return true;
  const extraMana = getStructuredOpponentDefeatManaCost(state, targetPlayerId, definitions);
  if (extraMana <= 0) return true;
  if (controller.flags.infiniteMana !== true && controller.mana < extraMana) return false;
  try {
    payManaCost(state, controller, extraMana, definitions, "DEFEAT_EFFECT_MANA_COST_UNAFFORDABLE");
  } catch (error) {
    if (error instanceof Error && ["DEFEAT_EFFECT_MANA_COST_UNAFFORDABLE", "MANA_SPENDING_FORBIDDEN_BY_RULE"].includes(error.message)) return false;
    throw error;
  }
  controller.flags.roundManaSpent = Number(controller.flags.roundManaSpent ?? 0) + extraMana;
  return true;
}

/**
 * Shared boundary for a defeat caused by another player's card effect. Any
 * continuous structured `defeat_cost` on the target is paid by the effect
 * controller before the defeated state is entered. Ordinary combat loss and
 * self-defeat continue to use defeatPlayer directly.
 */
export function defeatPlayerByEffect(
  state: GameState,
  targetPlayerId: string,
  controllerPlayerId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent?: DomainEventSink,
  details: Record<string, unknown> = {},
): boolean {
  const target = state.players[targetPlayerId];
  const controller = state.players[controllerPlayerId];
  if (!target || target.eliminated || target.defeated || !controller || controller.eliminated) return false;
  if (!payDefeatEffectCost(state, targetPlayerId, controllerPlayerId, definitions)) return false;
  return defeatPlayer(state, targetPlayerId, emitEvent, { ...details, controllerPlayerId });
}

export interface AppliedDefeatEffectResult {
  applied: boolean;
  defeated: boolean;
  ignored: boolean;
  alreadyDefeated: boolean;
}

/**
 * Authoritative boundary for the *application* of a [defeat] effect. Unlike
 * `player.defeated`, the `player.defeat-applied` fact is emitted even when the
 * target ignores [defeat] or was already defeated. This distinction is needed
 * by confirmed rules that trigger on applying [defeat] rather than on the state
 * transition itself.
 */
export function applyDefeatEffect(
  state: GameState,
  targetPlayerId: string,
  controllerPlayerId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent?: DomainEventSink,
  details: Record<string, unknown> = {},
): AppliedDefeatEffectResult {
  const target = state.players[targetPlayerId];
  const controller = state.players[controllerPlayerId];
  if (!target || target.eliminated || !controller || controller.eliminated) {
    return { applied: false, defeated: false, ignored: false, alreadyDefeated: false };
  }
  if (controllerPlayerId !== targetPlayerId && isOtherPlayerAbilityEffectIgnored(state, controllerPlayerId, targetPlayerId)) {
    return { applied: false, defeated: false, ignored: true, alreadyDefeated: target.defeated };
  }
  if (!payDefeatEffectCost(state, targetPlayerId, controllerPlayerId, definitions)) {
    return { applied: false, defeated: false, ignored: false, alreadyDefeated: target.defeated };
  }

  const alreadyDefeated = target.defeated;
  emitEvent?.("player.defeat-applied", { playerId: targetPlayerId, controllerPlayerId, ...details });
  if (playerIgnoresDefeat(state, target, definitions)) {
    return { applied: true, defeated: false, ignored: true, alreadyDefeated };
  }
  if (alreadyDefeated) return { applied: true, defeated: false, ignored: false, alreadyDefeated: true };
  const defeated = defeatPlayer(state, targetPlayerId, emitEvent, { ...details, controllerPlayerId });
  return { applied: true, defeated, ignored: false, alreadyDefeated: false };
}
