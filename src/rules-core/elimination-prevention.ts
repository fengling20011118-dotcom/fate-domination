import type { GameState } from "../domain/state/types.ts";

export interface ClimaxEliminationPrevention {
  sourceId: string;
  controllerPlayerId: string;
  targetPlayerId: string;
  round: number;
}

function records(state: GameState): ClimaxEliminationPrevention[] {
  const raw = state.modeState.climaxEliminationPreventions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is ClimaxEliminationPrevention => Boolean(item)
    && typeof item === "object"
    && typeof (item as ClimaxEliminationPrevention).sourceId === "string"
    && typeof (item as ClimaxEliminationPrevention).controllerPlayerId === "string"
    && typeof (item as ClimaxEliminationPrevention).targetPlayerId === "string"
    && Number.isInteger((item as ClimaxEliminationPrevention).round));
}

export function hasClimaxEliminationPrevention(state: GameState, targetPlayerId: string, round = state.round): boolean {
  return records(state).some((record) => record.targetPlayerId === targetPlayerId && record.round === round);
}

export function installClimaxEliminationPrevention(state: GameState, record: ClimaxEliminationPrevention): void {
  if (!state.players[record.controllerPlayerId] || !state.players[record.targetPlayerId] || !record.sourceId || record.round !== state.round) {
    throw new Error("CLIMAX_ELIMINATION_PREVENTION_INVALID");
  }
  if (hasClimaxEliminationPrevention(state, record.targetPlayerId, record.round)) throw new Error("CLIMAX_ELIMINATION_PREVENTION_CONFLICT");
  state.modeState = { ...state.modeState, climaxEliminationPreventions: [...records(state), { ...record }] };
}

export function consumeClimaxEliminationPrevention(state: GameState, targetPlayerId: string): ClimaxEliminationPrevention | undefined {
  const current = records(state);
  const index = current.findIndex((record) => record.targetPlayerId === targetPlayerId && record.round === state.round);
  if (index < 0) return undefined;
  const [consumed] = current.splice(index, 1);
  state.modeState = { ...state.modeState, climaxEliminationPreventions: current };
  return consumed;
}

export interface SharedVictoryLink {
  sourceId: string;
  playerIds: [string, string];
}

function victoryLinks(state: GameState): SharedVictoryLink[] {
  const raw = state.modeState.sharedVictoryLinks;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is SharedVictoryLink => Boolean(item)
    && typeof item === "object"
    && typeof (item as SharedVictoryLink).sourceId === "string"
    && Array.isArray((item as SharedVictoryLink).playerIds)
    && (item as SharedVictoryLink).playerIds.length === 2
    && (item as SharedVictoryLink).playerIds.every((id) => typeof id === "string"));
}

export function installSharedVictoryLink(state: GameState, sourceId: string, leftPlayerId: string, rightPlayerId: string): void {
  if (!sourceId || !state.players[leftPlayerId] || !state.players[rightPlayerId]) throw new Error("SHARED_VICTORY_LINK_INVALID");
  if (leftPlayerId === rightPlayerId) return;
  const pair = [leftPlayerId, rightPlayerId].sort() as [string, string];
  const existing = victoryLinks(state).filter((link) => !(link.sourceId === sourceId && [...link.playerIds].sort().join("|") === pair.join("|")));
  state.modeState = { ...state.modeState, sharedVictoryLinks: [...existing, { sourceId, playerIds: pair }] };
}

/** Expand winners transitively; linked players win even when already eliminated. */
export function expandSharedVictoryWinnerIds(state: GameState, winnerIds: string[]): string[] {
  const winners = new Set(winnerIds.filter((id) => Boolean(state.players[id])));
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of victoryLinks(state)) {
      if (!link.playerIds.some((id) => winners.has(id))) continue;
      for (const id of link.playerIds) if (!winners.has(id)) { winners.add(id); changed = true; }
    }
  }
  return [...winners];
}
