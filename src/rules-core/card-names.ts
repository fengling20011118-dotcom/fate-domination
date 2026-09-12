import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardRuleNameOverride } from "./card-rule-modifiers.ts";

/** Runtime semantic card name after structured, source-bound name replacements. */
export function getEffectiveCardName(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
  definition: CardDefinition,
): string {
  return getCardRuleNameOverride(state, player, instance) ?? definition.name;
}

export function cardIsNamed(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
  definition: CardDefinition,
  name: string,
): boolean {
  return getEffectiveCardName(state, player, instance, definition) === name;
}
