import type { GameState } from "../domain/state/types.ts";

export type PlayerPresenceLocationId = "workshop" | "mountain" | "city" | "scouting";

export interface ExtraPlayerPresence {
  id: string;
  playerId: string;
  sourceId: string;
  locationId: PlayerPresenceLocationId | null;
  terrainAdvantage: number;
}

const KEY = "extraPlayerPresences";
const LOCATION_ORDER: readonly PlayerPresenceLocationId[] = ["workshop", "mountain", "city", "scouting"];

function validLocation(value: unknown): value is PlayerPresenceLocationId {
  return value === "workshop" || value === "mountain" || value === "city" || value === "scouting";
}

function validPresence(value: unknown): value is ExtraPlayerPresence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<ExtraPlayerPresence>;
  return typeof item.id === "string" && item.id.length > 0
    && typeof item.playerId === "string" && typeof item.sourceId === "string"
    && (item.locationId === null || validLocation(item.locationId))
    && Number.isInteger(item.terrainAdvantage) && Number(item.terrainAdvantage) >= 0;
}

export function listExtraPlayerPresences(state: GameState): ExtraPlayerPresence[] {
  const raw = state.modeState[KEY];
  return Array.isArray(raw) ? raw.filter(validPresence).map((item) => ({ ...item })) : [];
}

function write(state: GameState, presences: readonly ExtraPlayerPresence[]): void {
  if (presences.length === 0) delete state.modeState[KEY];
  else state.modeState[KEY] = presences.map((item) => ({ ...item }));
}

export function getExtraPlayerPresence(state: GameState, presenceId: string): ExtraPlayerPresence | undefined {
  return listExtraPlayerPresences(state).find((item) => item.id === presenceId);
}

export function getPlayerExtraPresences(state: GameState, playerId: string): ExtraPlayerPresence[] {
  return listExtraPlayerPresences(state).filter((item) => item.playerId === playerId);
}

export function upsertExtraPlayerPresence(state: GameState, presence: ExtraPlayerPresence): ExtraPlayerPresence {
  if (!state.players[presence.playerId] || !presence.id || !presence.sourceId || (presence.locationId !== null && !validLocation(presence.locationId))
    || !Number.isInteger(presence.terrainAdvantage) || presence.terrainAdvantage < 0) throw new Error("PLAYER_PRESENCE_INVALID");
  const current = listExtraPlayerPresences(state).filter((item) => item.id !== presence.id);
  current.push({ ...presence });
  write(state, current);
  return { ...presence };
}

export function removeExtraPlayerPresence(state: GameState, presenceId: string): ExtraPlayerPresence | undefined {
  const current = listExtraPlayerPresences(state);
  const found = current.find((item) => item.id === presenceId);
  if (!found) return undefined;
  for (const records of Object.values(state.board.outpostRecords)) {
    for (let index = 0; index < records.length; index += 1) if (records[index] === presenceId) records[index] = null;
  }
  write(state, current.filter((item) => item.id !== presenceId));
  return found;
}

export function moveExtraPlayerPresence(state: GameState, presenceId: string, locationId: PlayerPresenceLocationId | null): ExtraPlayerPresence {
  const current = listExtraPlayerPresences(state);
  const index = current.findIndex((item) => item.id === presenceId);
  if (index < 0) throw new Error("PLAYER_PRESENCE_NOT_FOUND");
  if (locationId !== null && !validLocation(locationId)) throw new Error("PLAYER_PRESENCE_LOCATION_INVALID");
  current[index] = { ...current[index], locationId };
  write(state, current);
  return { ...current[index] };
}

export function getPlayerPresenceLocationIds(state: GameState, playerId: string): PlayerPresenceLocationId[] {
  const player = state.players[playerId];
  if (!player || player.eliminated) return [];
  const locations = new Set<PlayerPresenceLocationId>();
  if (validLocation(player.locationId)) locations.add(player.locationId);
  for (const presence of getPlayerExtraPresences(state, playerId)) if (presence.locationId) locations.add(presence.locationId);
  return [...locations];
}

export function getPlayerIdsPresentAtLocation(state: GameState, locationId: PlayerPresenceLocationId): string[] {
  const ids = new Set<string>((state.board.locations[locationId] ?? []).filter((id) => Boolean(state.players[id] && !state.players[id].eliminated)));
  for (const presence of listExtraPlayerPresences(state)) {
    if (presence.locationId === locationId && state.players[presence.playerId] && !state.players[presence.playerId].eliminated) ids.add(presence.playerId);
  }
  return [...ids];
}

export function isExtraPlayerPresenceEngaged(state: GameState, presenceId: string): boolean {
  const presence = getExtraPlayerPresence(state, presenceId);
  if (!presence?.locationId || (presence.locationId !== "mountain" && presence.locationId !== "city")) return false;
  return getPlayerIdsPresentAtLocation(state, presence.locationId).some((id) => id !== presence.playerId);
}

export function isPlayerPresenceAtLocationEngaged(state: GameState, playerId: string, locationId: PlayerPresenceLocationId): boolean {
  if (locationId !== "mountain" && locationId !== "city") return false;
  if (!getPlayerPresenceLocationIds(state, playerId).includes(locationId)) return false;
  return getPlayerIdsPresentAtLocation(state, locationId).some((id) => id !== playerId);
}

export function movePresenceSameDirectionAndDistance(
  state: GameState,
  presenceId: string,
  fromLocationId: string,
  toLocationId: string,
): ExtraPlayerPresence | undefined {
  const presence = getExtraPlayerPresence(state, presenceId);
  if (!presence?.locationId || isExtraPlayerPresenceEngaged(state, presenceId)) return undefined;
  const from = LOCATION_ORDER.indexOf(fromLocationId as PlayerPresenceLocationId);
  const to = LOCATION_ORDER.indexOf(toLocationId as PlayerPresenceLocationId);
  const current = LOCATION_ORDER.indexOf(presence.locationId);
  if (from < 0 || to < 0 || current < 0) return undefined;
  const delta = to - from;
  const targetIndex = current + delta;
  if (targetIndex < 0 || targetIndex >= LOCATION_ORDER.length) return undefined;
  const target = LOCATION_ORDER[targetIndex];
  if (target === "workshop" && state.board.locations.workshop.length >= 4) return undefined;
  if (target === "scouting" && getPlayerIdsPresentAtLocation(state, "scouting").length >= 1) return undefined;
  return moveExtraPlayerPresence(state, presenceId, target);
}

export function getCombinedPresenceTerrainAdvantage(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  if (!player || player.eliminated) return 0;
  const primary = player.flags.deploymentBonusActive === true ? Number(player.flags.deploymentBonus ?? 0) : 0;
  const extra = getPlayerExtraPresences(state, playerId).reduce((sum, item) => sum + Number(item.terrainAdvantage ?? 0), 0);
  return Math.max(0, primary) + Math.max(0, extra);
}

export function getExtraPresenceTerrainAdvantageAtLocation(state: GameState, playerId: string, locationId: string | null | undefined): number {
  if (!locationId) return 0;
  return getPlayerExtraPresences(state, playerId)
    .filter((item) => item.locationId === locationId)
    .reduce((sum, item) => sum + Math.max(0, Number(item.terrainAdvantage ?? 0)), 0);
}
