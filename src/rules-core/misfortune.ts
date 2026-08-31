import type { CardDefinition } from "./content-types.ts";
import type { GameState } from "../domain/state/types.ts";
import type { CardAbilityRegistry } from "./card-abilities.ts";

export const MISFORTUNE_CARD_ID = "card.x-misfortune";
export const MISFORTUNE_ABILITY_ID = "misfortune-battle-loss";

/**
 * Registers the optional hand response printed on Lakshmi Bai's Misfortune.
 * The ability is available only during the serialized post-power response
 * window; the combat engine decides who receives that window.
 */
export function registerMisfortuneCardAbility(registry: CardAbilityRegistry): void {
  if (registry.has(MISFORTUNE_ABILITY_ID)) return;
  registry.register(MISFORTUNE_ABILITY_ID, ({ state, playerId, instanceId }) => {
    const pending = state.modeState.pendingCombatResolution as { snapshot?: { locationId?: string; participantIds?: string[]; powers?: Record<string, number> } } | undefined;
    const snapshot = pending?.snapshot;
    if (!snapshot || snapshot.locationId !== "mountain" && snapshot.locationId !== "city") throw new Error("MISFORTUNE_RESPONSE_WINDOW_REQUIRED");
    const participants = Array.isArray(snapshot.participantIds) ? snapshot.participantIds : [];
    const powers = snapshot.powers ?? {};
    if (!participants.includes(playerId)) throw new Error("MISFORTUNE_NOT_IN_COMBAT");
    const highest = Math.max(...participants.map((id) => powers[id] ?? Number.NEGATIVE_INFINITY));
    if ((powers[playerId] ?? Number.POSITIVE_INFINITY) >= highest) throw new Error("MISFORTUNE_REQUIRES_COMBAT_LOSS");
    const card = state.cards[instanceId];
    if (!card || card.definitionId !== MISFORTUNE_CARD_ID || card.zone !== "hand") throw new Error("MISFORTUNE_CARD_REQUIRED_IN_HAND");
    const player = state.players[playerId];
    if (!player || player.defeated || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
    const handIndex = player.hand.indexOf(instanceId);
    if (handIndex < 0) throw new Error("MISFORTUNE_CARD_REQUIRED_IN_HAND");
    player.hand.splice(handIndex, 1);
    player.discard.push(instanceId);
    card.zone = "discard";
    card.face = "down";
    card.active = false;
    player.victoryPoints += 3;
    for (const opponentId of state.board.locations[snapshot.locationId] ?? []) {
      if (opponentId !== playerId && state.players[opponentId] && !state.players[opponentId].eliminated) {
        state.players[opponentId].defeated = true;
      }
    }
  }, { allowedZones: ["hand"], allowInactive: true });
}

export function isMisfortuneResponseAvailable(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  snapshot: { locationId: string; participantIds: string[]; powers: Record<string, number> },
): boolean {
  const player = state.players[playerId];
  if (!player || player.eliminated || player.defeated || !snapshot.participantIds.includes(playerId)) return false;
  const highest = Math.max(...snapshot.participantIds.map((id) => snapshot.powers[id]));
  if (snapshot.powers[playerId] >= highest) return false;
  return player.hand.some((instanceId) => {
    const card = state.cards[instanceId];
    return card?.zone === "hand" && card.definitionId === MISFORTUNE_CARD_ID && Boolean(definitions[MISFORTUNE_CARD_ID]);
  });
}
