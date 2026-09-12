import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillAbilityDefinition, SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import type { CombatPowerSnapshot } from "./combat.ts";
import { armCombatObjectiveRewardReplacement } from "./combat.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { getReservedEventIds, releaseReservedEventToLocation } from "./event-lifecycle.ts";
import { gainVictoryPoints } from "./resources.ts";

export const NITOCRIS_HANDLER = "core.nitocris-entomb";
export const NITOCRIS_RESOLVE = "core.nitocris-entomb-resolve";
export const NITOCRIS_OFFERING_ID = "servant.nitocris.skill.sc-nitocris-1";
export const NITOCRIS_MIRROR_ID = "servant.nitocris.skill.sc-nitocris-2";
export const NITOCRIS_HORUS_ID = "servant.nitocris.skill.sc-nitocris-3";
export const NITOCRIS_OFFERING_ACTION = "underworld-tribute";
export const NITOCRIS_OFFERING_RESPONSE = "underworld-tribute-entomb";
export const NITOCRIS_MIRROR_ACTION = "nether-mirror-release";
export const NITOCRIS_MIRROR_COMBAT = "nether-mirror-defeat";
export const NITOCRIS_HORUS_ACTION = "holy-service";
export const NITOCRIS_HORUS_COMBAT = "child-of-horus-ignore-defeat";

const ENTOMB_BLOCK_ROUND = "nitocrisEntombBlockedRound";
const OFFERING_ARMED_ROUND = "nitocrisOfferingArmedRound";
const CANNOT_ENTOMB_TAG = "cannot-entomb-objective";

function reservationId(playerId: string): string {
  return `nitocris-entombed:${playerId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesSkill(card: GameState["cards"][string] | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
}

function activeSource(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && matchesSkill(card, definition, skillId));
  });
}

function pendingSnapshot(state: GameState): CombatPowerSnapshot | undefined {
  const raw = state.modeState.pendingCombatResolution;
  if (!isRecord(raw) || !isRecord(raw.snapshot)) return undefined;
  const snapshot = raw.snapshot as unknown as CombatPowerSnapshot;
  return snapshot.round === state.round ? snapshot : undefined;
}

function objectiveVictoryPoints(definitions: Record<string, CardDefinition>, eventId: string): number {
  const value = Number((definitions[eventId] as (CardDefinition & { victoryPoints?: number }) | undefined)?.victoryPoints ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function entombCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, locationId: string): string[] {
  if (Number(player.flags[ENTOMB_BLOCK_ROUND] ?? -1) === state.round) return [];
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.currentEvents[locationId] ?? []).filter((eventId) => !definitions[eventId]?.tags?.includes(CANNOT_ENTOMB_TAG));
}

function openChoice(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  stage: string,
  previous: Record<string, unknown>,
  options: PendingDecision["options"],
  min: number,
  max: number,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: NITOCRIS_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { stage, ...previous },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `nitocris-${stage}`,
    options,
    min,
    max,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function useOfferingAction(state: GameState, player: PlayerState): { terrainMultiplier: number; armedRound: number } {
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("NITOCRIS_OFFERING_WINDOW_INVALID");
  const current = Number(player.flags.terrainAdvantageContributionMultiplierRound === state.round
    ? player.flags.terrainAdvantageContributionMultiplier ?? 1 : 1);
  player.flags.terrainAdvantageContributionMultiplierRound = state.round;
  player.flags.terrainAdvantageContributionMultiplier = current * 3;
  player.flags[OFFERING_ARMED_ROUND] = state.round;
  return { terrainMultiplier: current * 3, armedRound: state.round };
}

function beginOfferingEntomb(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  const snapshot = pendingSnapshot(state);
  if (!snapshot || state.phase !== "combat" || state.step !== "post-power-response" || !snapshot.participantIds.includes(player.id)) {
    throw new Error("NITOCRIS_OFFERING_RESPONSE_WINDOW_INVALID");
  }
  if (Number(player.flags[OFFERING_ARMED_ROUND] ?? -1) !== state.round) throw new Error("NITOCRIS_OFFERING_NOT_ARMED");
  const candidates = entombCandidates(state, player, definitions, snapshot.locationId);
  if (candidates.length === 0) throw new Error("NITOCRIS_NO_ENTOMB_OBJECTIVE");
  openChoice(state, player, NITOCRIS_OFFERING_ID, "offering-entomb", { candidates, locationId: snapshot.locationId },
    candidates.map((id) => ({ id, label: definitions[id]?.name ?? id })), 1, 1, openDecision);
  return { pending: true };
}

function beginMirrorRelease(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  if (state.phase !== "action" || state.activePlayerId !== player.id || (player.locationId !== "mountain" && player.locationId !== "city")) {
    throw new Error("NITOCRIS_MIRROR_WINDOW_INVALID");
  }
  const candidates = getReservedEventIds(state, reservationId(player.id));
  if (candidates.length === 0) throw new Error("NITOCRIS_NO_ENTOMBED_OBJECTIVE");
  openChoice(state, player, NITOCRIS_MIRROR_ID, "mirror-release", { candidates, locationId: player.locationId },
    candidates.map((id) => ({ id, label: definitions[id]?.name ?? id })), 1, candidates.length, openDecision);
  return { pending: true };
}

function useMirrorCombat(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
) {
  if (state.phase !== "combat" || state.activePlayerId !== player.id || (player.locationId !== "mountain" && player.locationId !== "city")) {
    throw new Error("NITOCRIS_MIRROR_COMBAT_WINDOW_INVALID");
  }
  const targetIds = (state.board.locations[player.locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated);
  const results = targetIds.map((targetPlayerId) => ({
    targetPlayerId,
    ...applyDefeatEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: NITOCRIS_MIRROR_ID, method: "nether-mirror" }),
  }));
  return { targetIds, results };
}

function useHorusAction(state: GameState, player: PlayerState): { entombed: number; victoryPointsGained: number } {
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("NITOCRIS_HORUS_ACTION_WINDOW_INVALID");
  const entombed = getReservedEventIds(state, reservationId(player.id)).length;
  return { entombed, victoryPointsGained: gainVictoryPoints(player, entombed) };
}

function useHorusCombat(state: GameState, player: PlayerState): { ignoreDefeatRound: number } {
  if (state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("NITOCRIS_HORUS_COMBAT_WINDOW_INVALID");
  player.flags.ignoreDefeatRound = state.round;
  return { ignoreDefeatRound: state.round };
}

export function isNitocrisOfferingResponseAvailable(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  snapshot: CombatPowerSnapshot,
): boolean {
  const player = state.players[playerId];
  return Boolean(player && Number(player.flags[OFFERING_ARMED_ROUND] ?? -1) === state.round
    && Number(player.flags[ENTOMB_BLOCK_ROUND] ?? -1) !== state.round && snapshot.participantIds.includes(playerId)
    && activeSource(state, player, NITOCRIS_OFFERING_ID, definitions)
    && entombCandidates(state, player, definitions, snapshot.locationId).length > 0);
}

export const useNitocris: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions) throw new Error("NITOCRIS_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;

  if (skill.id === NITOCRIS_OFFERING_ID) {
    if (!activeSource(state, player, skill.id, definitions)) throw new Error("NITOCRIS_OFFERING_SOURCE_INACTIVE");
    if (abilityId === NITOCRIS_OFFERING_ACTION) return useOfferingAction(state, player);
    if (abilityId === NITOCRIS_OFFERING_RESPONSE) return beginOfferingEntomb(state, player, definitions, openDecision);
  }
  if (skill.id === NITOCRIS_MIRROR_ID) {
    if (eventType === "card.played" && event.playerId === player.id && event.definitionId === NITOCRIS_MIRROR_ID) {
      player.flags[ENTOMB_BLOCK_ROUND] = state.round;
      return { entombBlockedRound: state.round };
    }
    if (!activeSource(state, player, skill.id, definitions)) throw new Error("NITOCRIS_MIRROR_SOURCE_INACTIVE");
    if (abilityId === NITOCRIS_MIRROR_ACTION) return beginMirrorRelease(state, player, definitions, openDecision);
    if (abilityId === NITOCRIS_MIRROR_COMBAT) return useMirrorCombat(state, player, definitions, emitEvent);
  }
  if (skill.id === NITOCRIS_HORUS_ID) {
    if (!activeSource(state, player, skill.id, definitions)) throw new Error("NITOCRIS_HORUS_SOURCE_INACTIVE");
    if (abilityId === NITOCRIS_HORUS_ACTION) return useHorusAction(state, player);
    if (abilityId === NITOCRIS_HORUS_COMBAT) return useHorusCombat(state, player);
  }
  return undefined;
};

export const resolveNitocrisDecision: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("NITOCRIS_DECISION_CONTEXT_INVALID");
  const previous = isRecord(payload.previous) ? payload.previous : payload;
  const decision = isRecord(payload.decision) ? payload.decision : undefined;
  const selections = Array.isArray(decision?.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision?.status !== "resolved") throw new Error("NITOCRIS_DECISION_INVALID");
  const stage = String(previous.stage ?? "");
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  if (selections.length === 0 || new Set(selections).size !== selections.length || selections.some((id) => !candidates.includes(id))) {
    throw new Error("NITOCRIS_DECISION_SELECTION_INVALID");
  }

  if (stage === "offering-entomb") {
    if (selections.length !== 1 || Number(player.flags[ENTOMB_BLOCK_ROUND] ?? -1) === state.round) throw new Error("NITOCRIS_ENTOMB_SELECTION_INVALID");
    const locationId = previous.locationId;
    if (locationId !== "mountain" && locationId !== "city" || !entombCandidates(state, player, definitions, locationId).includes(selections[0])) {
      throw new Error("NITOCRIS_ENTOMB_SELECTION_INVALID");
    }
    armCombatObjectiveRewardReplacement(state, {
      round: state.round,
      locationId,
      playerId: player.id,
      eventId: selections[0],
      sourceId: NITOCRIS_OFFERING_ID,
      reservationId: reservationId(player.id),
    });
    return { eventId: selections[0], locationId };
  }

  if (stage === "mirror-release") {
    const locationId = previous.locationId;
    if (locationId !== "mountain" && locationId !== "city") throw new Error("NITOCRIS_MIRROR_LOCATION_INVALID");
    const currentlyEntombed = new Set(getReservedEventIds(state, reservationId(player.id)));
    if (selections.some((id) => !currentlyEntombed.has(id))) throw new Error("NITOCRIS_MIRROR_SELECTION_INVALID");
    let totalVictoryPoints = 0;
    for (const eventId of selections) {
      totalVictoryPoints += objectiveVictoryPoints(definitions, eventId);
      releaseReservedEventToLocation(state, reservationId(player.id), eventId, locationId, "up");
    }
    player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + totalVictoryPoints;
    return { eventIds: selections, totalPowerGained: totalVictoryPoints };
  }
  throw new Error("NITOCRIS_DECISION_STAGE_INVALID");
};

export const isNitocrisLegal: SkillLegalityPredicate = (
  state: GameState,
  playerId: string,
  skill?: SkillDefinition,
  ability?: SkillAbilityDefinition,
  definitions?: Record<string, CardDefinition>,
) => {
  const player = state.players[playerId];
  if (!player || !skill || !ability || !definitions || state.activePlayerId !== playerId) return false;
  const active = Boolean(activeSource(state, player, skill.id, definitions));
  if (skill.id === NITOCRIS_OFFERING_ID && ability.id === NITOCRIS_OFFERING_ACTION) return state.phase === "action" && active;
  if (skill.id === NITOCRIS_OFFERING_ID && ability.id === NITOCRIS_OFFERING_RESPONSE) {
    const snapshot = pendingSnapshot(state);
    return Boolean(active && snapshot && state.phase === "combat" && state.step === "post-power-response"
      && isNitocrisOfferingResponseAvailable(state, playerId, definitions, snapshot));
  }
  if (skill.id === NITOCRIS_MIRROR_ID && ability.id === NITOCRIS_MIRROR_ACTION) {
    return state.phase === "action" && active && (player.locationId === "mountain" || player.locationId === "city")
      && getReservedEventIds(state, reservationId(player.id)).length > 0;
  }
  if (skill.id === NITOCRIS_MIRROR_ID && ability.id === NITOCRIS_MIRROR_COMBAT) return state.phase === "combat" && active;
  if (skill.id === NITOCRIS_HORUS_ID && ability.id === NITOCRIS_HORUS_ACTION) return state.phase === "action" && active;
  if (skill.id === NITOCRIS_HORUS_ID && ability.id === NITOCRIS_HORUS_COMBAT) return state.phase === "combat" && active;
  return false;
};
