import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";

export const EVENT_OBJECTIVE_EFFECTS_X2_NO_RESOURCE_TAG = "event-objective-effects-x2-no-resource";

function sourceIsLive(zone: string, active: boolean): boolean {
  if (zone === "master-skills" || zone === "servant-skills") return true;
  return (zone === "attack" || zone === "board") && active;
}

/** Multiplier for numeric event/objective effects on one player, excluding printed mana and VP rewards. */
export function getEventObjectiveEffectMultiplier(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): number {
  let multiplier = 1;
  for (const card of Object.values(state.cards)) {
    if (card.controllerPlayerId !== playerId || card.zone === "removed" || !sourceIsLive(card.zone, card.active)) continue;
    const definition = definitions[card.definitionId];
    if (definition?.tags?.includes(EVENT_OBJECTIVE_EFFECTS_X2_NO_RESOURCE_TAG)) multiplier *= 2;
  }
  return multiplier;
}

export function applyEventObjectiveNumericEffectMultiplier(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  kind: "power" | "mana" | "victory-points" | "other",
  amount: number,
): number {
  if (!Number.isFinite(amount)) throw new Error("EVENT_OBJECTIVE_EFFECT_AMOUNT_INVALID");
  if (kind === "mana" || kind === "victory-points") return amount;
  return amount * getEventObjectiveEffectMultiplier(state, playerId, definitions);
}
