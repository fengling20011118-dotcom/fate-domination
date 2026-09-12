import type { GameState, PlayerState } from "../domain/state/types.ts";
import { applyDefeatEffect } from "./defeat.ts";
import type { CardDefinition } from "./content-types.ts";
import { loseMana } from "./resources.ts";
import {
  getExtraPlayerPresence,
  getPlayerIdsPresentAtLocation,
  getPlayerPresenceLocationIds,
  isExtraPlayerPresenceEngaged,
  movePresenceSameDirectionAndDistance,
  removeExtraPlayerPresence,
  upsertExtraPlayerPresence,
  type PlayerPresenceLocationId,
} from "./player-presences.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ALICE_HANDLER = "core.alice-phantom-player";
export const ALICE_RESOLVE = "core.alice-phantom-player-resolve";
export const ALICE_CYBER_GHOST_ID = "master.alice.skill.s1";
export const ALICE_PHANTOM_ID = "master.alice.skill.s2";
export const ALICE_QUEENSIDE_ID = "master.alice.skill.ascension";
export const ALICE_DEPLOY_ABILITY = "cyber-ghost-deploy";
export const ALICE_QUEENSIDE_DEFEAT_ABILITY = "queenside-sacrifice";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function alicePhantomPresenceId(playerId: string): string {
  return `${playerId}:phantom-alice`;
}

function claimPresenceTerrain(state: GameState, presenceId: string, locationId: "mountain" | "city"): number {
  for (const records of Object.values(state.board.outpostRecords)) {
    for (let index = 0; index < records.length; index += 1) if (records[index] === presenceId) records[index] = null;
  }
  const records = state.board.outpostRecords[locationId] ?? [];
  const slot = records.findIndex((id) => id === null);
  if (slot < 0) return 0;
  records[slot] = presenceId;
  return slot === 0 ? 3 : slot === 1 ? 1 : 0;
}

function deployPhantom(state: GameState, player: PlayerState, locationId: string) {
  if (locationId !== "mountain" && locationId !== "city") throw new Error("ALICE_PHANTOM_DEPLOY_LOCATION_INVALID");
  const presenceId = alicePhantomPresenceId(player.id);
  const terrainAdvantage = claimPresenceTerrain(state, presenceId, locationId);
  const presence = upsertExtraPlayerPresence(state, {
    id: presenceId,
    playerId: player.id,
    sourceId: ALICE_CYBER_GHOST_ID,
    locationId,
    terrainAdvantage,
  });
  return { presenceId, locationId, terrainAdvantage, presence };
}

function openSingleChoice(
  context: SkillContext,
  stage: string,
  options: Array<{ id: string; label: string }>,
  previous: Record<string, unknown> = {},
) {
  const { state, player, openDecision } = context;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${ALICE_HANDLER}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: ALICE_RESOLVE,
    sourceId: ALICE_CYBER_GHOST_ID,
    controllerPlayerId: player.id,
    payload: { stage, ...previous },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `alice-${stage}`,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true };
}

function useCyberGhost(context: SkillContext) {
  const { state, player, payload } = context;
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;

  if (eventType === "player.moved") {
    if (event.playerId !== player.id || typeof event.previousLocationId !== "string" || typeof event.locationId !== "string") return;
    const followed = movePresenceSameDirectionAndDistance(state, alicePhantomPresenceId(player.id), event.previousLocationId, event.locationId);
    return followed ? { followed: true, locationId: followed.locationId } : { followed: false };
  }
  if (eventType === "attack.committed") {
    if (event.playerId !== player.id) return;
    const paidMana = Number(event.paidMana ?? 0);
    if (!Number.isFinite(paidMana) || paidMana < 0) throw new Error("ALICE_ATTACK_COST_INVALID");
    const manaLost = loseMana(player, Math.ceil(paidMana / 2));
    return { manaLost };
  }
  if (abilityId !== ALICE_DEPLOY_ABILITY) return;
  if (state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("ALICE_PHANTOM_DEPLOY_WINDOW_INVALID");
  if (Number(player.flags.combatLossRound ?? Number.NEGATIVE_INFINITY) === state.round - 1) throw new Error("ALICE_PHANTOM_DEPLOY_PREVIOUS_LOSS");
  const supplied = typeof data.locationId === "string" ? data.locationId : undefined;
  if (supplied) return deployPhantom(state, player, supplied);
  return openSingleChoice(context, "deploy-phantom", [
    { id: "mountain", label: "Mountain" },
    { id: "city", label: "City" },
  ]);
}

function usePhantomRule(state: GameState, player: PlayerState) {
  player.flags.multiPresenceSamePlayer = true;
  return {
    presenceId: alicePhantomPresenceId(player.id),
    locationIds: getPlayerPresenceLocationIds(state, player.id),
  };
}

function activateQueenside(state: GameState, player: PlayerState) {
  player.flags.sharePresenceTerrainAdvantage = true;
  return { sharedTerrainAdvantage: true };
}

function sacrificePhantom(context: SkillContext) {
  const { state, player, definitions, emitEvent } = context;
  if (!definitions) throw new Error("ALICE_QUEENSIDE_DEFINITIONS_REQUIRED");
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("ALICE_QUEENSIDE_WINDOW_INVALID");
  const presenceId = alicePhantomPresenceId(player.id);
  const presence = getExtraPlayerPresence(state, presenceId);
  if (!presence?.locationId || (presence.locationId !== "mountain" && presence.locationId !== "city")) throw new Error("ALICE_PHANTOM_NOT_ON_BATTLEFIELD");
  const locationId = presence.locationId;
  removeExtraPlayerPresence(state, presenceId);
  // Resolve after the phantom has left: Alice is only among the targets if her primary body is still at this battlefield.
  const targetPlayerIds = getPlayerIdsPresentAtLocation(state, locationId).filter((targetId) => Boolean(state.players[targetId] && !state.players[targetId].eliminated));
  const defeatedPlayerIds: string[] = [];
  for (const targetId of targetPlayerIds) {
    const result = applyDefeatEffect(state, targetId, player.id, definitions, emitEvent, { sourceId: ALICE_QUEENSIDE_ID, locationId });
    if (result.defeated) defeatedPlayerIds.push(targetId);
  }
  return { removedPresenceId: presenceId, locationId, targetPlayerIds, defeatedPlayerIds };
}

export const useAlicePackage: SkillHandler = (context) => {
  const { state, player, skill, payload } = context;
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;

  if (skill.id === ALICE_CYBER_GHOST_ID) return useCyberGhost(context);
  if (skill.id === ALICE_PHANTOM_ID) return usePhantomRule(state, player);
  if (skill.id === ALICE_QUEENSIDE_ID) {
    if (eventType === "skill.unlocked") {
      if (event.playerId !== player.id || event.skillId !== skill.id) return;
      return activateQueenside(state, player);
    }
    if (abilityId === ALICE_QUEENSIDE_DEFEAT_ABILITY) return sacrificePhantom(context);
    return;
  }
  throw new Error("ALICE_SKILL_INVALID");
};

export const resolveAliceDecision: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("ALICE_DECISION_INVALID");
  const { previous, decision } = payload;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error("ALICE_DECISION_INVALID");
  if (previous.stage === "deploy-phantom") return deployPhantom(state, player, selections[0]);
  throw new Error("ALICE_DECISION_STAGE_INVALID");
};

export const isAlicePackageLegal: SkillLegalityPredicate = (state, playerId, skill, ability) => {
  const player = state.players[playerId];
  if (!player || player.eliminated) return false;
  if (skill.id === ALICE_CYBER_GHOST_ID && ability?.id === ALICE_DEPLOY_ABILITY) {
    return state.phase === "outpost" && state.activePlayerId === playerId
      && Number(player.flags.combatLossRound ?? Number.NEGATIVE_INFINITY) !== state.round - 1;
  }
  if (skill.id === ALICE_QUEENSIDE_ID && ability?.id === ALICE_QUEENSIDE_DEFEAT_ABILITY) {
    const presence = getExtraPlayerPresence(state, alicePhantomPresenceId(playerId));
    return state.phase === "action" && state.activePlayerId === playerId
      && Boolean(presence?.locationId === "mountain" || presence?.locationId === "city");
  }
  return false;
};

/** Public helper for effects that need to ask which Alice location a location/fight effect resolves at. */
export function getAliceEffectLocationOptions(state: GameState, playerId: string): PlayerPresenceLocationId[] {
  return getPlayerPresenceLocationIds(state, playerId);
}

/** Public helper for external movement systems targeting the phantom presence. */
export function canMoveAlicePhantom(state: GameState, playerId: string): boolean {
  const presence = getExtraPlayerPresence(state, alicePhantomPresenceId(playerId));
  return Boolean(presence?.locationId && !isExtraPlayerPresenceEngaged(state, presence.id));
}
