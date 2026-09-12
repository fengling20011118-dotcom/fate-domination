import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";

interface ProtectedPlayerSnapshot {
  playerId: string;
  player: PlayerState;
  cards: Record<string, CardInstance>;
  locationIndexes: Record<string, number>;
  protectedEventLocationId?: string;
  eventOrigins?: Record<string, { zone: "location" | "deck" | "discard" | "named-deck" | "named-discard"; locationId?: string; poolId?: string; index: number; visibility?: "up" | "down" }>;
}

function matchingAbilityImmunityModifier(state: GameState, sourcePlayerId: string, targetPlayerId: string, sourceId?: string) {
  if (sourcePlayerId === targetPlayerId) return undefined;
  const source = state.players[sourcePlayerId];
  const target = state.players[targetPlayerId];
  if (!source || !target || source.eliminated || target.eliminated) return undefined;
  return (state.activeRuleModifiers ?? []).find((modifier) => {
    if (modifier.controllerPlayerId !== targetPlayerId
      || modifier.rule !== "other_player_ability_effect"
      || modifier.operation !== "ignore") return false;
    if (modifier.duration === "round" && modifier.createdRound !== state.round) return false;
    if (modifier.duration === "while-source-active") {
      const sourceInstance = modifier.sourceInstanceId ? state.cards[modifier.sourceInstanceId] : undefined;
      if (!sourceInstance || sourceInstance.zone !== "attack" || !sourceInstance.active || sourceInstance.face !== "up") return false;
    }
    const sourceIds = modifier.scope?.sourceIds;
    if (Array.isArray(sourceIds) && (!sourceId || !sourceIds.includes(sourceId))) return false;
    const sourcePlayers = modifier.scope?.sourcePlayers;
    const sourcePlayerIds = modifier.scope?.sourcePlayerIds;
    if (Array.isArray(sourcePlayerIds) && sourcePlayerIds.includes(sourcePlayerId)) return true;
    if (sourcePlayers === "all_opponents") return true;
    return sourcePlayers === "same_location_opponents" && Boolean(source.locationId && source.locationId === target.locationId);
  });
}

/**
 * Narrow generic rule boundary for effects that say a player ignores abilities
 * used by other players at the same location. The source card installs a
 * serializable round rule modifier; this function never knows character IDs.
 */
export function isOtherPlayerAbilityEffectIgnored(
  state: GameState,
  sourcePlayerId: string,
  targetPlayerId: string,
  sourceId?: string,
): boolean {
  const modifier = matchingAbilityImmunityModifier(state, sourcePlayerId, targetPlayerId, sourceId);
  return Boolean(modifier?.scope?.subject === "controller");
}

export function getAbilityEffectIgnoredPlayerIds(state: GameState, sourcePlayerId: string, sourceId?: string): string[] {
  return Object.keys(state.players).filter((targetPlayerId) => isOtherPlayerAbilityEffectIgnored(state, sourcePlayerId, targetPlayerId, sourceId));
}

function captureEventOrigins(state: GameState): ProtectedPlayerSnapshot["eventOrigins"] {
  const origins: NonNullable<ProtectedPlayerSnapshot["eventOrigins"]> = {};
  for (const [locationId, eventIds] of Object.entries(state.board.currentEvents)) {
    eventIds.forEach((eventId, index) => { origins[eventId] = { zone: "location", locationId, index, visibility: state.board.eventVisibility[eventId] }; });
  }
  state.board.eventDeck.forEach((eventId, index) => { origins[eventId] = { zone: "deck", index, visibility: state.board.eventVisibility[eventId] }; });
  state.board.eventDiscard.forEach((eventId, index) => { origins[eventId] = { zone: "discard", index, visibility: state.board.eventVisibility[eventId] }; });
  for (const [poolId, pool] of Object.entries(state.board.namedEventPools ?? {})) {
    pool.deck.forEach((eventId, index) => { origins[eventId] = { zone: "named-deck", poolId, index }; });
    pool.discard.forEach((eventId, index) => { origins[eventId] = { zone: "named-discard", poolId, index }; });
  }
  return origins;
}

function captureProtectedPlayer(state: GameState, playerId: string, protectLocationEvents: boolean): ProtectedPlayerSnapshot {
  const cards: Record<string, CardInstance> = {};
  for (const [instanceId, card] of Object.entries(state.cards)) {
    if (card.ownerPlayerId === playerId || card.controllerPlayerId === playerId) cards[instanceId] = structuredClone(card);
  }
  const locationIndexes = Object.fromEntries(Object.entries(state.board.locations)
    .map(([locationId, occupants]) => [locationId, occupants.indexOf(playerId)])
    .filter(([, index]) => Number(index) >= 0)) as Record<string, number>;
  const locationId = state.players[playerId].locationId;
  const protectedEventLocationId = protectLocationEvents && (locationId === "mountain" || locationId === "city") ? locationId : undefined;
  return {
    playerId,
    player: structuredClone(state.players[playerId]),
    cards,
    locationIndexes,
    ...(protectedEventLocationId ? { protectedEventLocationId, eventOrigins: captureEventOrigins(state) } : {}),
  };
}

function removeEventFromEveryZone(state: GameState, eventId: string): void {
  for (const eventIds of Object.values(state.board.currentEvents)) {
    let index = eventIds.indexOf(eventId);
    while (index >= 0) { eventIds.splice(index, 1); index = eventIds.indexOf(eventId); }
  }
  state.board.eventDeck = state.board.eventDeck.filter((id) => id !== eventId);
  state.board.eventDiscard = state.board.eventDiscard.filter((id) => id !== eventId);
  for (const pool of Object.values(state.board.namedEventPools ?? {})) {
    pool.deck = pool.deck.filter((id) => id !== eventId);
    pool.discard = pool.discard.filter((id) => id !== eventId);
  }
}

function restoreProtectedLocationEvents(state: GameState, snapshot: ProtectedPlayerSnapshot): void {
  const locationId = snapshot.protectedEventLocationId;
  const origins = snapshot.eventOrigins;
  if (!locationId || !origins) return;
  const originallyProtected = Object.entries(origins).filter(([, origin]) => origin.zone === "location" && origin.locationId === locationId).map(([id]) => id);
  const currentlyProtected = [...(state.board.currentEvents[locationId] ?? [])];
  const affected = [...new Set([...originallyProtected, ...currentlyProtected])];
  for (const eventId of affected) removeEventFromEveryZone(state, eventId);
  for (const eventId of affected) {
    const origin = origins[eventId];
    if (!origin) { delete state.board.eventVisibility[eventId]; continue; }
    if (origin.zone === "location" && origin.locationId) {
      const list = state.board.currentEvents[origin.locationId] ?? (state.board.currentEvents[origin.locationId] = []);
      list.splice(Math.min(origin.index, list.length), 0, eventId);
    } else if (origin.zone === "deck") {
      state.board.eventDeck.splice(Math.min(origin.index, state.board.eventDeck.length), 0, eventId);
    } else if (origin.zone === "discard") {
      state.board.eventDiscard.splice(Math.min(origin.index, state.board.eventDiscard.length), 0, eventId);
    } else if (origin.poolId && state.board.namedEventPools?.[origin.poolId]) {
      const list = origin.zone === "named-deck" ? state.board.namedEventPools[origin.poolId].deck : state.board.namedEventPools[origin.poolId].discard;
      list.splice(Math.min(origin.index, list.length), 0, eventId);
    }
    if (origin.visibility) state.board.eventVisibility[eventId] = origin.visibility;
    else delete state.board.eventVisibility[eventId];
  }
}

function restoreProtectedPlayer(state: GameState, snapshot: ProtectedPlayerSnapshot): void {
  const { playerId } = snapshot;
  state.players[playerId] = structuredClone(snapshot.player);

  for (const [instanceId, card] of Object.entries(state.cards)) {
    if ((card.ownerPlayerId === playerId || card.controllerPlayerId === playerId) && !snapshot.cards[instanceId]) delete state.cards[instanceId];
  }
  for (const [instanceId, card] of Object.entries(snapshot.cards)) state.cards[instanceId] = structuredClone(card);

  for (const occupants of Object.values(state.board.locations)) {
    let index = occupants.indexOf(playerId);
    while (index >= 0) {
      occupants.splice(index, 1);
      index = occupants.indexOf(playerId);
    }
  }
  for (const [locationId, originalIndex] of Object.entries(snapshot.locationIndexes)) {
    const occupants = state.board.locations[locationId];
    if (!occupants) continue;
    occupants.splice(Math.min(Math.max(0, originalIndex), occupants.length), 0, playerId);
  }
  restoreProtectedLocationEvents(state, snapshot);
}

/**
 * Execute one ability transaction while restoring the direct player/card/board
 * footprint of players whose rules say this source player's ability is ignored.
 * Rule modifiers are also filtered at read time, so continuous opponent ability
 * rules cannot leak through this boundary.
 */
export function runWithOtherPlayerAbilityImmunity<T>(
  state: GameState,
  sourcePlayerId: string,
  execute: () => T,
  sourceId?: string,
): T {
  const snapshots = getAbilityEffectIgnoredPlayerIds(state, sourcePlayerId, sourceId).map((playerId) => {
    const modifier = matchingAbilityImmunityModifier(state, sourcePlayerId, playerId, sourceId);
    return captureProtectedPlayer(state, playerId, modifier?.scope?.includeLocationEvents === true);
  });
  const powerFloors = Object.values(state.players)
    .filter((target) => target.id !== sourcePlayerId && !target.eliminated
      && Number(target.flags.opponentAbilityTotalPowerReductionProtectedRound ?? -1) === state.round)
    .map((target) => ({
      playerId: target.id,
      roundPowerBonus: target.flags.roundPowerBonus,
      commandSealRoundPowerBonus: target.flags.commandSealRoundPowerBonus,
    }));
  try {
    return execute();
  } finally {
    for (const snapshot of snapshots) restoreProtectedPlayer(state, snapshot);
    for (const floor of powerFloors) {
      const target = state.players[floor.playerId];
      if (!target) continue;
      const restoreNumericFloor = (key: "roundPowerBonus" | "commandSealRoundPowerBonus", before: unknown) => {
        const beforeValue = Number(before ?? 0);
        const afterValue = Number(target.flags[key] ?? 0);
        if (!Number.isFinite(beforeValue) || !Number.isFinite(afterValue) || afterValue >= beforeValue) return;
        if (before === undefined) delete target.flags[key];
        else target.flags[key] = beforeValue;
      };
      restoreNumericFloor("roundPowerBonus", floor.roundPowerBonus);
      restoreNumericFloor("commandSealRoundPowerBonus", floor.commandSealRoundPowerBonus);
    }
  }
}
