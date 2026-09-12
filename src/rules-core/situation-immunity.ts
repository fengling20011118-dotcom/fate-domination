import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";

/**
 * Whether one player currently ignores player-specific effects of the active situation.
 * The source is data-driven: any active card may grant immunity to every other player.
 */
export function isPlayerUnaffectedBySituation(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  const player = state.players[playerId];
  if (!player || player.eliminated) return false;
  return Object.values(state.cards).some((instance) => {
    if (!instance.active || instance.face !== "up" || instance.zone !== "attack") return false;
    if (!instance.controllerPlayerId || instance.controllerPlayerId === playerId) return false;
    return definitions[instance.definitionId]?.otherPlayersIgnoreSituationEffects === true;
  });
}
