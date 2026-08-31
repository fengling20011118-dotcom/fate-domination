import type { PlayerState, GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";

export function sumCardCosts(
  state: GameState,
  instanceIds: string[],
  definitions: Record<string, CardDefinition>,
  player?: PlayerState,
): number {
  return instanceIds.reduce((sum, instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");
    return sum + getCardPlayCost(state, definition, player);
  }, 0);
}

export function getCardPlayCost(state: GameState, definition: CardDefinition, player?: PlayerState): number {
  if (player?.servantId === "servant.jekyll" && definition.id === "servant.jekyll.skill.sc-jekyll-2") return 0;
  if (!definition.costRule) return definition.cost;
  if (definition.costRule.kind !== "round-linear") throw new Error("CARD_COST_RULE_INVALID");
  const value = definition.costRule.base + definition.costRule.perRound * state.round;
  return Math.max(definition.costRule.min, value);
}

export function assertMana(player: PlayerState, amount: number, error = "INSUFFICIENT_MANA"): void {
  if (amount < 0 || player.mana < amount) throw new Error(error);
}

export function payMana(player: PlayerState, amount: number, error = "INSUFFICIENT_MANA"): void {
  assertMana(player, amount, error);
  player.mana -= amount;
}
