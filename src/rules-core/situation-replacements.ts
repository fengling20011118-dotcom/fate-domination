import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";

/**
 * Shared replacement for effects that turn the current situation's "Noble Phantasms
 * are forbidden" rule into a positive power rule.  Character handlers only arm
 * these generic round flags; card legality and combat power consume them here.
 */
export function hasSituationNoblePhantasmBanReplacement(state: GameState, player: PlayerState): boolean {
  const forbidden = (state.modeState.situationRestrictions as { forbiddenAttributes?: string[] } | undefined)?.forbiddenAttributes ?? [];
  return player.flags.situationNoblePhantasmBanReplacementRound === state.round && forbidden.includes("宝具");
}

/** Round-scoped permission that ignores only a Situation's Noble-Phantasm prohibition. */
export function ignoresSituationNoblePhantasmBan(state: GameState, player: PlayerState): boolean {
  const forbidden = (state.modeState.situationRestrictions as { forbiddenAttributes?: string[] } | undefined)?.forbiddenAttributes ?? [];
  return player.flags.situationNoblePhantasmBanIgnoreRound === state.round && forbidden.includes("宝具");
}

export function cardMatchesSituationNoblePhantasmReplacement(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
): boolean {
  if (!hasSituationNoblePhantasmBanReplacement(state, player)) return false;
  const attributes = getCardInstanceAttributes(instance, definition, state, definitions);
  return attributes.includes("宝具") || definition.id === "card.cardluck";
}

export function situationForbiddenAttributeReplacedForCard(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
  attribute: string,
): boolean {
  return attribute === "宝具" && (ignoresSituationNoblePhantasmBan(state, player)
    || cardMatchesSituationNoblePhantasmReplacement(state, player, instance, definition, definitions));
}

export function getSituationNoblePhantasmReplacementPowerBonus(
  state: GameState,
  player: PlayerState,
  instance: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
): number {
  if (!cardMatchesSituationNoblePhantasmReplacement(state, player, instance, definition, definitions)) return 0;
  const value = Number(player.flags.situationNoblePhantasmBanReplacementPower ?? 0);
  if (!Number.isFinite(value)) throw new Error("SITUATION_NOBLE_PHANTASM_REPLACEMENT_POWER_INVALID");
  return value;
}
