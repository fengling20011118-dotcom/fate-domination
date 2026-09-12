import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { createDerivedCardInstances, movePlayerCard, shufflePlayerDeck } from "./decks.ts";

export interface PendingDeckRebuild {
  playerId: string;
  sourceId: string;
  targetRound: number;
  definitionIds: string[];
}

function readPending(state: GameState): PendingDeckRebuild[] {
  const raw = state.modeState.pendingDeckRebuilds;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("PENDING_DECK_REBUILDS_INVALID");
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("PENDING_DECK_REBUILD_INVALID");
    const item = entry as Record<string, unknown>;
    if (typeof item.playerId !== "string" || !item.playerId
      || typeof item.sourceId !== "string" || !item.sourceId
      || !Number.isInteger(item.targetRound) || Number(item.targetRound) < 1
      || !Array.isArray(item.definitionIds)
      || item.definitionIds.length === 0
      || item.definitionIds.some((id) => typeof id !== "string" || !id)) {
      throw new Error("PENDING_DECK_REBUILD_INVALID");
    }
    return {
      playerId: item.playerId,
      sourceId: item.sourceId,
      targetRound: Number(item.targetRound),
      definitionIds: [...item.definitionIds] as string[],
    };
  });
}

export function scheduleDeckRebuild(state: GameState, rebuild: PendingDeckRebuild): void {
  if (!state.players[rebuild.playerId]
    || !rebuild.sourceId
    || !Number.isInteger(rebuild.targetRound)
    || rebuild.targetRound <= state.round
    || !Array.isArray(rebuild.definitionIds)
    || rebuild.definitionIds.length === 0
    || rebuild.definitionIds.some((id) => typeof id !== "string" || !id)) {
    throw new Error("DECK_REBUILD_SCHEDULE_INVALID");
  }
  const pending = readPending(state);
  if (pending.some((entry) => entry.playerId === rebuild.playerId && entry.targetRound === rebuild.targetRound)) {
    throw new Error("DECK_REBUILD_SCHEDULE_CONFLICT");
  }
  state.modeState.pendingDeckRebuilds = [...pending, {
    playerId: rebuild.playerId,
    sourceId: rebuild.sourceId,
    targetRound: rebuild.targetRound,
    definitionIds: [...rebuild.definitionIds],
  }];
}

/**
 * Resolve deck replacement after prior-round cleanup and before the new round's
 * ordinary draw. This ordering lets "after this round ends, build a new deck"
 * include cards that closed from attack during cleanup without consuming cards
 * drawn for the new round.
 */
export function applyDueDeckRebuilds(
  state: GameState,
  round: number,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
): Array<{ playerId: string; removedInstanceIds: string[]; createdInstanceIds: string[] }> {
  const pending = readPending(state);
  const due = pending.filter((entry) => entry.targetRound === round);
  const future = pending.filter((entry) => entry.targetRound > round);
  if (pending.some((entry) => entry.targetRound < round)) throw new Error("DECK_REBUILD_SCHEDULE_EXPIRED");
  const duplicatePlayers = due.map((entry) => entry.playerId).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicatePlayers.length) throw new Error("DECK_REBUILD_SCHEDULE_CONFLICT");
  if (future.length) state.modeState.pendingDeckRebuilds = future;
  else delete state.modeState.pendingDeckRebuilds;

  const results: Array<{ playerId: string; removedInstanceIds: string[]; createdInstanceIds: string[] }> = [];
  for (const entry of due) {
    const player = state.players[entry.playerId];
    if (!player || player.eliminated) continue;
    for (const definitionId of entry.definitionIds) {
      if (!definitions[definitionId]) throw new Error(`DECK_REBUILD_DEFINITION_NOT_FOUND:${definitionId}`);
    }
    const removedInstanceIds = [...new Set([...player.hand, ...player.deck, ...player.discard])];
    for (const instanceId of removedInstanceIds) movePlayerCard(state, player.id, instanceId, "removed");
    const sourceEffectId = `${entry.sourceId}:deck-rebuild:${entry.targetRound}`;
    const created = createDerivedCardInstances(state, player.id, entry.definitionIds.map((definitionId, index) => ({
      instanceId: `${state.gameInstanceId}:${player.id}:deck-rebuild:${entry.targetRound}:${index + 1}`,
      definitionId,
      zone: "deck" as const,
      face: "down" as const,
      active: false,
      residual: false,
      temporary: false,
      sourceEffectId,
      createdByPlayerId: player.id,
    })));
    shufflePlayerDeck(state, player.id, randomInt);
    results.push({ playerId: player.id, removedInstanceIds, createdInstanceIds: created.map((card) => card.instanceId) });
  }
  return results;
}
