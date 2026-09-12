import type { CardAbilityRegistry } from "./card-abilities.ts";
import type { GameState } from "../domain/state/types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import { closePlayerCard } from "./decks.ts";
import { defeatPlayerByEffect, playerIgnoresDefeat } from "./defeat.ts";

export const SIEG_BALMUNG_ID = "master.sieg.skill.s2";
export const SIEG_GALVANISM_ID = "master.sieg.skill.ascension";
export const SIEG_LINDEN_LEAF_ABILITY_ID = "sieg.linden-leaf-defeat";
export const SIEG_TRANSFORMED_ROUND_FLAG = "transformedRound";

const LINDEN_GRANT_PREFIX = "siegLindenLeafGrant:";

export function siegLindenLeafGrantKey(sourceInstanceId: string): string {
  return `${LINDEN_GRANT_PREFIX}${sourceInstanceId}`;
}

export function getSiegLindenLeafGrantSources(state: GameState, playerId: string): string[] {
  const player = state.players[playerId];
  if (!player) return [];
  return Object.entries(player.flags).flatMap(([key, value]) => {
    if (!key.startsWith(LINDEN_GRANT_PREFIX) || Number(value) !== state.round) return [];
    const sourceInstanceId = key.slice(LINDEN_GRANT_PREFIX.length);
    const source = state.cards[sourceInstanceId];
    const sourceOwner = source ? state.players[source.ownerPlayerId] : undefined;
    if (!source || source.definitionId !== SIEG_BALMUNG_ID || source.zone !== "attack" || !source.active || source.face !== "up"
      || !sourceOwner || sourceOwner.eliminated || sourceOwner.id === playerId) return [];
    return [sourceInstanceId];
  });
}

/**
 * Linden Leaf grants an Action to the opponents who were on Sieg's battlefield
 * when Balmung was played for free.  The chosen Agility attack itself is the
 * cost/target, so the existing card-ability command needs no extra card picker.
 */
export function registerSiegLindenLeafCardAbility(registry: CardAbilityRegistry): void {
  if (registry.has(SIEG_LINDEN_LEAF_ABILITY_ID)) return;
  registry.register(SIEG_LINDEN_LEAF_ABILITY_ID, ({ state, playerId, instanceId, target, definitions, emitEvent }) => {
    const player = state.players[playerId];
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
    if (state.phase !== "action" || state.activePlayerId !== playerId || state.step !== "player-window") {
      throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
    }
    if (!instance || instance.ownerPlayerId !== playerId || instance.zone !== "attack" || !instance.active || instance.face !== "up" || !definition) {
      throw new Error("SIEG_LINDEN_LEAF_AGILITY_REQUIRED");
    }
    if (!getCardInstanceAttributes(instance, definition, state, definitions).includes("迅捷") || getPrintedCardBasePower(state, player, definition) < 5) {
      throw new Error("SIEG_LINDEN_LEAF_AGILITY_REQUIRED");
    }
    const sources = getSiegLindenLeafGrantSources(state, playerId);
    if (sources.length === 0) throw new Error("SIEG_LINDEN_LEAF_NOT_GRANTED");
    const requestedSiegId = typeof target === "string" ? target : undefined;
    const matching = requestedSiegId
      ? sources.filter((sourceId) => state.cards[sourceId]?.ownerPlayerId === requestedSiegId)
      : sources;
    const distinctSiegIds = [...new Set(matching.map((sourceId) => state.cards[sourceId]?.ownerPlayerId).filter((id): id is string => typeof id === "string"))];
    if (distinctSiegIds.length !== 1) throw new Error("SIEG_LINDEN_LEAF_TARGET_AMBIGUOUS");
    const sieg = state.players[distinctSiegIds[0]];
    if (!sieg || sieg.eliminated || sieg.defeated) throw new Error("SIEG_LINDEN_LEAF_TARGET_INVALID");

    closePlayerCard(state, playerId, instanceId, definitions);
    if (!playerIgnoresDefeat(state, sieg, definitions)) {
      defeatPlayerByEffect(state, sieg.id, playerId, definitions, emitEvent, { sourceId: SIEG_BALMUNG_ID, method: "linden-leaf" });
    }
  });
}
