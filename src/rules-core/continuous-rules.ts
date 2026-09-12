import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { closePlayerCard } from "./decks.ts";
import { getStructuredStandardAttackCardCountRule } from "./rule-modifiers.ts";

/**
 * Apply mandatory continuous-rule cleanup at an atomic command boundary.
 * The routine is deliberately generic and only reads structured rule metadata.
 */
export function applyStructuredContinuousStateCleanup(
  state: GameState,
  definitions: Record<string, CardDefinition>,
): string[] {
  const closed: string[] = [];
  for (const player of Object.values(state.players)) {
    if (player.eliminated || player.hand.length !== 0) continue;
    const rule = getStructuredStandardAttackCardCountRule(state, player.id, definitions);
    if (!rule?.closeSourceWhenHandEmpty) continue;
    for (const instanceId of rule.sourceInstanceIds) {
      const instance = state.cards[instanceId];
      if (!instance || instance.ownerPlayerId !== player.id || instance.zone !== "attack" || !instance.active) continue;
      closePlayerCard(state, player.id, instanceId, definitions);
      closed.push(instanceId);
    }
  }
  return closed;
}
