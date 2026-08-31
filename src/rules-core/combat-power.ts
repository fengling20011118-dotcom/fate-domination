import type { GameState, PlayerState } from "../domain/state/types.ts";
import { getCardAttributes } from "./content-types.ts";
import type { CardDefinition } from "./content-types.ts";
import { getJekyllCombatPowerOverride, isJekyllBeastActive } from "./jekyll-hyde.ts";

export function getActiveCombatCardIds(state: GameState, player: PlayerState): string[] {
  return player.attack.filter((instanceId) => {
    const instance = state.cards[instanceId];
    return Boolean(instance?.active && instance.face === "up");
  });
}

export function calculateCombatPower(state: GameState, player: PlayerState, cards: Record<string, CardDefinition>, locationId?: string): number {
  const override = getJekyllCombatPowerOverride(player, state.round);
  if (override !== null) return override;
  const beastActive = isJekyllBeastActive(state, player, cards);
  const base = getActiveCombatCardIds(state, player).reduce((sum, instanceId) => {
    const instance = state.cards[instanceId];
    const definition = cards[instance.definitionId];
    const printed = (definition?.basePower ?? 0) + (beastActive && definition?.basic !== true ? 3 : 0);
    const modifiers = instance.powerModifiers ?? [];
    const added = modifiers.filter((modifier) => modifier.kind === "add").reduce((total, modifier) => total + modifier.value, printed);
    const setters = modifiers.filter((modifier) => modifier.kind === "set");
    const value = setters.length > 0 ? setters[setters.length - 1].value : added;
    return sum + value;
  }, 0);
  const roundBonus = Number(player.flags.roundPowerBonus ?? 0);
  const deploymentBonus = player.flags.deploymentBonusActive && (!locationId || player.flags.deploymentLocationId === locationId)
    ? Number(player.flags.deploymentBonus ?? 0)
    : 0;
  return base + roundBonus + deploymentBonus;
}

export function collectCombatAttributes(state: GameState, player: PlayerState, cards: Record<string, CardDefinition>): string[] {
  return [...new Set(getActiveCombatCardIds(state, player)
    .flatMap((instanceId) => getCardAttributes(cards[state.cards[instanceId].definitionId] ?? { typeLabel: "" })) )];
}
