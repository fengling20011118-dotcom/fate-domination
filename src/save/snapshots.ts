import type { GameEvent, GameState } from "../domain/state/types.ts";
import { assertStateInvariants } from "../domain/state/invariants.ts";

export interface GameSnapshot {
  kind: "fd.game.snapshot";
  schemaVersion: number;
  gameInstanceId: string;
  savedAt: string;
  state: GameState;
}

export interface GameReplay {
  kind: "fd.game.replay";
  schemaVersion: number;
  gameInstanceId: string;
  rulesPackageId: string;
  initialState: GameState;
  events: GameEvent[];
}

export function createSnapshot(state: GameState, savedAt = new Date().toISOString()): GameSnapshot {
  return {
    kind: "fd.game.snapshot",
    schemaVersion: state.schemaVersion,
    gameInstanceId: state.gameInstanceId,
    savedAt,
    state: structuredClone(state),
  };
}

export function serializeSnapshot(state: GameState, savedAt?: string): string {
  return JSON.stringify(createSnapshot(state, savedAt));
}

export function restoreSnapshot(serialized: string, expectedGameInstanceId?: string): GameState {
  let snapshot: unknown;
  try { snapshot = JSON.parse(serialized); } catch { throw new Error("SNAPSHOT_INVALID_JSON"); }
  if (!snapshot || typeof snapshot !== "object") throw new Error("SNAPSHOT_INVALID");
  const value = snapshot as Partial<GameSnapshot>;
  if (value.kind !== "fd.game.snapshot" || typeof value.gameInstanceId !== "string" || !value.state) throw new Error("SNAPSHOT_INVALID");
  if (expectedGameInstanceId && value.gameInstanceId !== expectedGameInstanceId) throw new Error("SNAPSHOT_GAME_INSTANCE_MISMATCH");
  if (value.state.gameInstanceId !== value.gameInstanceId) throw new Error("SNAPSHOT_STATE_ID_MISMATCH");
  if (typeof value.state.revision !== "number" || !value.state.players || !value.state.board) throw new Error("SNAPSHOT_STATE_INVALID");
  const migrated = migrateSnapshotState(value.state);
  try { assertStateInvariants(migrated); } catch { throw new Error("SNAPSHOT_STATE_INVALID"); }
  return structuredClone(migrated);
}

/** Adds fields introduced by the V2 setup flow while preserving old room saves. */
function migrateSnapshotState(state: GameState): GameState {
  const migrated = structuredClone(state);
  // `form` was added after the first V2 snapshots. Missing values represent
  // the neutral state; never leave an undefined form in the authoritative save.
  for (const player of Object.values(migrated.players ?? {})) {
    if (player.form === undefined) player.form = null;
  }
  if (migrated.mode !== "three-x") return migrated;
  const mode = migrated.modeState.threeX as Record<string, unknown> | undefined;
  if (!mode || !Array.isArray(mode.playerIds)) return migrated;
  if (!mode.masterOffers || typeof mode.masterOffers !== "object") {
    mode.masterOffers = Object.fromEntries((mode.playerIds as string[]).map((id) => [id, []]));
  }
  if (!mode.servantOffers || typeof mode.servantOffers !== "object") {
    mode.servantOffers = Object.fromEntries((mode.playerIds as string[]).map((id) => [id, []]));
  }
  return migrated;
}

export function createReplay(initialState: GameState, events: GameEvent[]): GameReplay {
  return {
    kind: "fd.game.replay",
    schemaVersion: initialState.schemaVersion,
    gameInstanceId: initialState.gameInstanceId,
    rulesPackageId: initialState.rulesPackageId,
    initialState: structuredClone(initialState),
    events: structuredClone(events),
  };
}

export function validateReplay(replay: GameReplay): void {
  if (replay.kind !== "fd.game.replay" || replay.gameInstanceId !== replay.initialState.gameInstanceId) throw new Error("REPLAY_INVALID");
  if (replay.rulesPackageId !== replay.initialState.rulesPackageId) throw new Error("REPLAY_RULES_MISMATCH");
  let lastRevision = replay.initialState.revision;
  const eventIds = new Set<string>();
  for (const event of replay.events) {
    if (event.revision < lastRevision || event.sourceCommandId.length === 0 || !event.eventId || eventIds.has(event.eventId)) throw new Error("REPLAY_EVENT_INVALID");
    eventIds.add(event.eventId);
    lastRevision = event.revision;
  }
}
