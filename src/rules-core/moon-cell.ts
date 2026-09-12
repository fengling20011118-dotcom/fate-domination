import type { GameState } from "../domain/state/types.ts";
import { detachEventFromZones, moveEvent, type EventLocation } from "./event-lifecycle.ts";

export interface MoonCellState {
  playerIds: string[];
  objectiveEventIds: string[];
  sourceIds: string[];
  retainedTerrainByPlayer: Record<string, number>;
}

export interface MoonCellLocationMerge {
  round: number;
  sourceId: string;
  locationId: "mountain" | "city";
  joinedPlayerIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readMoonCell(state: GameState): MoonCellState {
  const raw = state.modeState.moonCell;
  if (!isRecord(raw)) return { playerIds: [], objectiveEventIds: [], sourceIds: [], retainedTerrainByPlayer: {} };
  const retainedTerrainByPlayer: Record<string, number> = {};
  if (isRecord(raw.retainedTerrainByPlayer)) {
    for (const [playerId, value] of Object.entries(raw.retainedTerrainByPlayer)) {
      const amount = Number(value);
      if (state.players[playerId] && Number.isInteger(amount) && amount >= 0) retainedTerrainByPlayer[playerId] = amount;
    }
  }
  return {
    playerIds: Array.isArray(raw.playerIds) ? raw.playerIds.filter((id): id is string => typeof id === "string" && Boolean(state.players[id])) : [],
    objectiveEventIds: Array.isArray(raw.objectiveEventIds) ? raw.objectiveEventIds.filter((id): id is string => typeof id === "string") : [],
    sourceIds: Array.isArray(raw.sourceIds) ? raw.sourceIds.filter((id): id is string => typeof id === "string") : [],
    retainedTerrainByPlayer,
  };
}

function writeMoonCell(state: GameState, value: MoonCellState): void {
  state.modeState.moonCell = {
    playerIds: [...new Set(value.playerIds)],
    objectiveEventIds: [...new Set(value.objectiveEventIds)],
    sourceIds: [...new Set(value.sourceIds)],
    retainedTerrainByPlayer: { ...value.retainedTerrainByPlayer },
  };
}

/** Shared Moon Cell state used by Moon Cancer/SERAPH packages. */
export function getMoonCellState(state: GameState): MoonCellState {
  return structuredClone(readMoonCell(state));
}

export function setMoonCellState(state: GameState, value: Partial<MoonCellState>): void {
  const current = readMoonCell(state);
  writeMoonCell(state, {
    playerIds: value.playerIds ?? current.playerIds,
    objectiveEventIds: value.objectiveEventIds ?? current.objectiveEventIds,
    sourceIds: value.sourceIds ?? current.sourceIds,
    retainedTerrainByPlayer: value.retainedTerrainByPlayer ?? current.retainedTerrainByPlayer,
  });
}

export function addPlayerToMoonCell(state: GameState, playerId: string, sourceId?: string): void {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("MOON_CELL_PLAYER_INVALID");
  const current = readMoonCell(state);
  current.playerIds = [...new Set([...current.playerIds, playerId])];
  if (sourceId) current.sourceIds = [...new Set([...current.sourceIds, sourceId])];
  writeMoonCell(state, current);
}

export function addMoonCellObjective(state: GameState, eventId: string, sourceId?: string): void {
  if (!eventId) throw new Error("MOON_CELL_OBJECTIVE_INVALID");
  const current = readMoonCell(state);
  current.objectiveEventIds = [...new Set([...current.objectiveEventIds, eventId])];
  if (sourceId) current.sourceIds = [...new Set([...current.sourceIds, sourceId])];
  writeMoonCell(state, current);
}

export function getMoonCellObjectiveIds(state: GameState): string[] {
  return [...readMoonCell(state).objectiveEventIds];
}

export function isPlayerInMoonCell(state: GameState, playerId: string): boolean {
  return readMoonCell(state).playerIds.includes(playerId);
}

export function getMoonCellRetainedTerrain(state: GameState, playerId: string): number {
  return Math.max(0, Number(readMoonCell(state).retainedTerrainByPlayer[playerId] ?? 0));
}

function removePlayerFromBoardLocations(state: GameState, playerId: string): void {
  for (const occupants of Object.values(state.board.locations)) {
    let index = occupants.indexOf(playerId);
    while (index >= 0) {
      occupants.splice(index, 1);
      index = occupants.indexOf(playerId);
    }
  }
}

function readMoonCellMerge(state: GameState): MoonCellLocationMerge | undefined {
  const raw = state.modeState.moonCellLocationMerge;
  if (!isRecord(raw) || raw.round !== state.round || typeof raw.sourceId !== "string"
    || (raw.locationId !== "mountain" && raw.locationId !== "city") || !Array.isArray(raw.joinedPlayerIds)) return undefined;
  return {
    round: Number(raw.round),
    sourceId: raw.sourceId,
    locationId: raw.locationId,
    joinedPlayerIds: raw.joinedPlayerIds.filter((id): id is string => typeof id === "string" && Boolean(state.players[id])),
  };
}

export function getMoonCellLocationMerge(state: GameState): MoonCellLocationMerge | undefined {
  const merge = readMoonCellMerge(state);
  return merge ? structuredClone(merge) : undefined;
}

/** Move a living player into Moon Cell while retaining their current printed terrain value for a later return. */
export function movePlayerIntoMoonCell(state: GameState, playerId: string, sourceId?: string): { retainedTerrain: number; mergedLocationId?: string } {
  const player = state.players[playerId];
  if (!player || player.eliminated || isPlayerInMoonCell(state, playerId)) throw new Error("MOON_CELL_PLAYER_ENTER_INVALID");
  const current = readMoonCell(state);
  const retainedTerrain = player.flags.deploymentBonusActive === true ? Math.max(0, Number(player.flags.deploymentBonus ?? 0)) : 0;
  current.playerIds = [...new Set([...current.playerIds, playerId])];
  current.retainedTerrainByPlayer[playerId] = retainedTerrain;
  if (sourceId) current.sourceIds = [...new Set([...current.sourceIds, sourceId])];
  writeMoonCell(state, current);
  removePlayerFromBoardLocations(state, playerId);
  player.locationId = null;
  player.flags.deploymentBonusActive = false;
  player.flags.deploymentBonus = 0;

  const merge = readMoonCellMerge(state);
  if (merge) {
    state.board.locations[merge.locationId].push(playerId);
    player.locationId = merge.locationId;
    merge.joinedPlayerIds = [...new Set([...merge.joinedPlayerIds, playerId])];
    state.modeState.moonCellLocationMerge = merge;
    return { retainedTerrain, mergedLocationId: merge.locationId };
  }
  return { retainedTerrain };
}

/** Leave Moon Cell for a battlefield, restoring the terrain value retained on entry. */
export function movePlayerOutOfMoonCell(state: GameState, playerId: string, locationId: "mountain" | "city"): { restoredTerrain: number } {
  const player = state.players[playerId];
  const current = readMoonCell(state);
  if (!player || player.eliminated || !current.playerIds.includes(playerId)) throw new Error("MOON_CELL_PLAYER_EXIT_INVALID");
  const restoredTerrain = Math.max(0, Number(current.retainedTerrainByPlayer[playerId] ?? 0));
  current.playerIds = current.playerIds.filter((id) => id !== playerId);
  delete current.retainedTerrainByPlayer[playerId];
  writeMoonCell(state, current);
  removePlayerFromBoardLocations(state, playerId);
  state.board.locations[locationId].push(playerId);
  player.locationId = locationId;
  player.flags.deploymentLocationId = locationId;
  player.flags.deploymentBonus = restoredTerrain;
  player.flags.deploymentBonusActive = restoredTerrain > 0;
  player.flags.movedOrRedeployedRound = state.round;
  const merge = readMoonCellMerge(state);
  if (merge?.joinedPlayerIds.includes(playerId)) {
    merge.joinedPlayerIds = merge.joinedPlayerIds.filter((id) => id !== playerId);
    state.modeState.moonCellLocationMerge = merge;
  }
  return { restoredTerrain };
}

/** Temporarily treat Moon Cell and one battlefield as one physical location by joining Moon Cell players to that battlefield. */
export function mergeMoonCellWithBattlefield(state: GameState, locationId: "mountain" | "city", sourceId: string): MoonCellLocationMerge {
  if (!sourceId) throw new Error("MOON_CELL_MERGE_SOURCE_INVALID");
  const existing = readMoonCellMerge(state);
  if (existing && existing.sourceId !== sourceId) throw new Error("MOON_CELL_MERGE_ALREADY_ACTIVE");
  const joinedPlayerIds: string[] = [];
  for (const playerId of readMoonCell(state).playerIds) {
    const player = state.players[playerId];
    if (!player || player.eliminated || player.locationId !== null) continue;
    removePlayerFromBoardLocations(state, playerId);
    state.board.locations[locationId].push(playerId);
    player.locationId = locationId;
    joinedPlayerIds.push(playerId);
  }
  const merge: MoonCellLocationMerge = { round: state.round, sourceId, locationId, joinedPlayerIds };
  state.modeState.moonCellLocationMerge = merge;
  return structuredClone(merge);
}

/** End a temporary Moon Cell merge without ejecting players from Moon Cell itself. */
export function clearMoonCellLocationMerge(state: GameState, sourceId?: string): string[] {
  const merge = readMoonCellMerge(state);
  if (!merge || (sourceId && merge.sourceId !== sourceId)) return [];
  const moonPlayers = new Set(readMoonCell(state).playerIds);
  const restored: string[] = [];
  for (const playerId of merge.joinedPlayerIds) {
    const player = state.players[playerId];
    if (!player || player.eliminated || !moonPlayers.has(playerId) || player.locationId !== merge.locationId) continue;
    removePlayerFromBoardLocations(state, playerId);
    player.locationId = null;
    player.flags.deploymentBonusActive = false;
    player.flags.deploymentBonus = 0;
    restored.push(playerId);
  }
  delete state.modeState.moonCellLocationMerge;
  return restored;
}

export interface MoonCellEventEffectRestriction {
  round: number;
  sourceId: string;
  controllerPlayerId: string;
  locationId: string;
}

/** Restrict Moon Cell event effects to one battlefield without parsing event text. */
export function setMoonCellEventEffectRestriction(state: GameState, restriction: MoonCellEventEffectRestriction): void {
  if (!Number.isInteger(restriction.round) || !restriction.sourceId || !state.players[restriction.controllerPlayerId]
    || !state.board.locations[restriction.locationId]) throw new Error("MOON_CELL_EVENT_RESTRICTION_INVALID");
  state.modeState.moonCellEventEffectRestriction = { ...restriction };
}

export function getMoonCellEventEffectRestriction(state: GameState): MoonCellEventEffectRestriction | undefined {
  const raw = state.modeState.moonCellEventEffectRestriction;
  if (!isRecord(raw) || raw.round !== state.round || typeof raw.sourceId !== "string"
    || typeof raw.controllerPlayerId !== "string" || typeof raw.locationId !== "string") return undefined;
  return {
    round: Number(raw.round),
    sourceId: raw.sourceId,
    controllerPlayerId: raw.controllerPlayerId,
    locationId: raw.locationId,
  };
}

export function moonCellEventEffectAffectsLocation(state: GameState, locationId: string): boolean {
  const restriction = getMoonCellEventEffectRestriction(state);
  return !restriction || restriction.locationId === locationId;
}

export function clearMoonCellEventEffectRestriction(state: GameState, sourceId?: string): void {
  const current = getMoonCellEventEffectRestriction(state);
  if (!current || (sourceId && current.sourceId !== sourceId)) return;
  delete state.modeState.moonCellEventEffectRestriction;
}

function removeMoonCellObjectiveReference(state: GameState, eventId: string): void {
  const current = readMoonCell(state);
  if (!current.objectiveEventIds.includes(eventId)) throw new Error("MOON_CELL_OBJECTIVE_NOT_FOUND");
  current.objectiveEventIds = current.objectiveEventIds.filter((id) => id !== eventId);
  writeMoonCell(state, current);
}

/** Move a battlefield event into Moon Cell as a detached objective. */
export function moveBattlefieldEventToMoonCell(state: GameState, locationId: EventLocation, eventId: string, sourceId?: string): void {
  if (!state.board.currentEvents[locationId]?.includes(eventId)) throw new Error("MOON_CELL_OBJECTIVE_SOURCE_INVALID");
  detachEventFromZones(state, eventId);
  addMoonCellObjective(state, eventId, sourceId);
}

/** Move a Moon Cell objective onto a battlefield, supporting both detached and legacy referenced states. */
export function moveMoonCellObjectiveToLocation(state: GameState, eventId: string, locationId: EventLocation, visibility: "up" | "down" = "up"): void {
  if (!readMoonCell(state).objectiveEventIds.includes(eventId)) throw new Error("MOON_CELL_OBJECTIVE_NOT_FOUND");
  if (eventExistsInAuthoritativeZone(state, eventId)) moveEvent(state, eventId, { zone: "current", locationId, visibility });
  else {
    state.board.currentEvents[locationId].push(eventId);
    state.board.eventVisibility[eventId] = visibility;
  }
  removeMoonCellObjectiveReference(state, eventId);
}

/** Discard one Moon Cell objective, including detached objectives created by Moon Cell effects. */
export function discardMoonCellObjective(state: GameState, eventId: string): void {
  if (!readMoonCell(state).objectiveEventIds.includes(eventId)) throw new Error("MOON_CELL_OBJECTIVE_NOT_FOUND");
  if (eventExistsInAuthoritativeZone(state, eventId)) moveEvent(state, eventId, { zone: "discard" });
  else {
    const namedPool = Object.values(state.board.namedEventPools ?? {}).find((pool) => pool.allIds.includes(eventId));
    if (namedPool) namedPool.discard.push(eventId);
    else state.board.eventDiscard.push(eventId);
  }
  removeMoonCellObjectiveReference(state, eventId);
}

/** Exchange one battlefield event with one Moon Cell objective as one validated transaction. */
export function swapBattlefieldEventWithMoonCellObjective(state: GameState, locationId: EventLocation, battlefieldEventId: string, moonCellEventId: string, sourceId?: string): void {
  const draft = structuredClone(state) as GameState;
  moveBattlefieldEventToMoonCell(draft, locationId, battlefieldEventId, sourceId);
  moveMoonCellObjectiveToLocation(draft, moonCellEventId, locationId, "up");
  state.board = draft.board;
  state.modeState = draft.modeState;
}

export function getMoonCellPlayerIdsInTurnOrder(state: GameState): string[] {
  const ids = new Set(readMoonCell(state).playerIds.filter((id) => !state.players[id]?.eliminated));
  return [...state.turnOrder.filter((id) => ids.has(id)), ...[...ids].filter((id) => !state.turnOrder.includes(id))];
}

function eventExistsInAuthoritativeZone(state: GameState, eventId: string): boolean {
  if (state.board.eventDeck.includes(eventId) || state.board.eventDiscard.includes(eventId) || (state.board.eventRemoved ?? []).includes(eventId)) return true;
  if (state.board.currentEvents.mountain.includes(eventId) || state.board.currentEvents.city.includes(eventId)) return true;
  return Object.values(state.board.namedEventPools ?? {}).some((pool) => pool.deck.includes(eventId) || pool.discard.includes(eventId));
}

/** Finish a Moon Cell lifecycle after all trapped players have redeployed. */
export function clearMoonCell(state: GameState): { playerIds: string[]; discardedObjectiveEventIds: string[] } {
  const current = readMoonCell(state);
  const discardedObjectiveEventIds: string[] = [];
  for (const eventId of [...current.objectiveEventIds]) {
    discardMoonCellObjective(state, eventId);
    discardedObjectiveEventIds.push(eventId);
  }
  delete state.modeState.moonCell;
  return { playerIds: current.playerIds, discardedObjectiveEventIds };
}
