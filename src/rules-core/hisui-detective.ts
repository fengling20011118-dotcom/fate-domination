import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { createDerivedCardInstance, returnOwnedBoardCardToSkillZone } from "./decks.ts";
import { eliminatePlayerByEffect } from "./elimination.ts";
import { moveEvent } from "./event-lifecycle.ts";
import { transferVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const HISUI_LOCKED_ROOM_ID = "master.hisui-detective.skill.s1";
export const HISUI_RUMOR_ID = "master.hisui-detective.skill.s1a";
export const HISUI_CLUE_ID = "master.hisui-detective.skill.s2";
export const HISUI_CONFRONTATION_ID = "master.hisui-detective.skill.s3";
export const HISUI_ASCENSION_ID = "master.hisui-detective.skill.ascension";
export const HISUI_HANDLER = "core.hisui-detective";
export const HISUI_RESOLVE = "core.hisui-detective-resolve";
export const HISUI_CONFRONT_ABILITY = "perfect-deduction";

const BREAK_BOUNDED_FIELD_IDS = new Set(["event.fuyuki.17", "event.fuyuki.18"]);
const CLUE_DEFINITION_ID = `card.skill.${HISUI_CLUE_ID}`;
const CONFRONTATION_DEFINITION_ID = `card.skill.${HISUI_CONFRONTATION_ID}`;

type BattlefieldId = "mountain" | "city";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function selectedIds(payload: Record<string, unknown>): string[] {
  const decision = isRecord(payload.decision) ? payload.decision : {};
  return Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
}

function openContinuation(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  stage: string,
  payload: Record<string, unknown>,
  options: Array<{ id: string; label: string }>,
  min: number,
  max: number,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
  allowCancel = false,
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: HISUI_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `hisui-detective-${stage}`,
    options,
    min,
    max,
    allowCancel,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function clueCards(state: GameState, player: PlayerState, zone?: "board" | "master-skills") {
  return Object.values(state.cards).filter((card) => card.ownerPlayerId === player.id
    && card.definitionId === CLUE_DEFINITION_ID
    && (!zone || card.zone === zone));
}

function confrontationCards(state: GameState, player: PlayerState) {
  return Object.values(state.cards).filter((card) => card.ownerPlayerId === player.id
    && card.definitionId === CONFRONTATION_DEFINITION_ID
    && card.zone === "master-skills"
    && Number(card.usedGameCount ?? 0) < 1);
}

function transformClue(state: GameState, player: PlayerState, instanceId: string): string {
  const clue = state.cards[instanceId];
  if (!clue || clue.ownerPlayerId !== player.id || clue.definitionId !== CLUE_DEFINITION_ID || clue.zone !== "master-skills") {
    throw new Error("HISUI_CLUE_TRANSFORM_INVALID");
  }
  clue.definitionId = CONFRONTATION_DEFINITION_ID;
  clue.face = "up";
  clue.active = false;
  clue.residual = false;
  clue.usedGameCount = 0;
  return clue.instanceId;
}

function createClue(state: GameState, player: PlayerState, culpritPlayerId: string, locationId: BattlefieldId): string {
  const culprit = state.players[culpritPlayerId];
  if (!culprit || culprit.eliminated || culprit.id === player.id) throw new Error("HISUI_CULPRIT_INVALID");
  const serial = Number(player.flags.hisuiClueSerial ?? 0) + 1;
  player.flags.hisuiClueSerial = serial;
  const instanceId = `${player.id}:hisui-clue:${serial}`;
  createDerivedCardInstance(state, player.id, {
    instanceId,
    definitionId: CLUE_DEFINITION_ID,
    originMasterId: "master.hisui-detective",
    zone: "board",
    boardLocationId: locationId,
    face: "up",
    active: true,
    residual: false,
    sourceEffectId: HISUI_RUMOR_ID,
    createdByPlayerId: culpritPlayerId,
  });
  return instanceId;
}

function availableRemovedBoundedFields(state: GameState): string[] {
  return (state.board.eventRemoved ?? []).filter((eventId) => BREAK_BOUNDED_FIELD_IDS.has(eventId));
}

function availableDeckBoundedFields(state: GameState): string[] {
  return state.board.eventDeck.filter((eventId) => BREAK_BOUNDED_FIELD_IDS.has(eventId));
}

function availableDiscardBoundedFields(state: GameState): string[] {
  return state.board.eventDiscard.filter((eventId) => BREAK_BOUNDED_FIELD_IDS.has(eventId));
}

function lockedRoomUsesRemaining(player: PlayerState): number {
  const value = Number(player.flags.hisuiLockedRoomUsesRemaining ?? 1);
  if (!Number.isInteger(value) || value < 0) throw new Error("HISUI_LOCKED_ROOM_USE_STATE_INVALID");
  return value;
}

function placementLocations(state: GameState, player: PlayerState): BattlefieldId[] {
  return (["mountain", "city"] as const).filter((locationId) =>
    (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated).length >= 2);
}

function setupLockedRoom(
  state: GameState,
  player: PlayerState,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  player.flags.hisuiLockedRoomUsesRemaining = lockedRoomUsesRemaining(player);
  const candidates = availableDeckBoundedFields(state);
  if (candidates.length === 0) return { removedEventId: null };
  if (candidates.length === 1) {
    moveEvent(state, candidates[0], { zone: "removed" });
    return { removedEventId: candidates[0] };
  }
  openContinuation(state, player, HISUI_LOCKED_ROOM_ID, "setup-bounded-field", { candidates },
    candidates.map((id) => ({ id, label: "Break Bounded Field" })), 1, 1, openDecision);
  return { pending: true, candidates };
}

function beginLockedRoomPlacement(
  state: GameState,
  player: PlayerState,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  if (lockedRoomUsesRemaining(player) <= 0) return;
  const eventIds = availableRemovedBoundedFields(state);
  const locations = placementLocations(state, player);
  if (eventIds.length === 0 || locations.length === 0) return;
  const choices = eventIds.flatMap((eventId) => locations.map((locationId) => ({ eventId, locationId })));
  openContinuation(state, player, HISUI_RUMOR_ID, "place-bounded-field", { choices }, [
    ...choices.map((choice, index) => ({ id: `place-${index}`, label: `Place Break Bounded Field at ${choice.locationId}` })),
    { id: "skip", label: "Skip" },
  ], 1, 1, openDecision, false);
  return { pending: true, choices };
}

function placeLockedRoomEvent(state: GameState, player: PlayerState, eventId: string, locationId: BattlefieldId) {
  if (lockedRoomUsesRemaining(player) <= 0 || !availableRemovedBoundedFields(state).includes(eventId)
    || !placementLocations(state, player).includes(locationId)) throw new Error("HISUI_LOCKED_ROOM_PLACEMENT_INVALID");
  moveEvent(state, eventId, { zone: "current", locationId, visibility: "up" });
  player.flags.hisuiLockedRoomUsesRemaining = lockedRoomUsesRemaining(player) - 1;
  player.flags.hisuiMysteryEventId = eventId;
  player.flags.hisuiMysteryLocationId = locationId;
  player.flags.hisuiMysteryRound = state.round;
  return { eventId, locationId };
}

function resolveMysteryCombat(state: GameState, player: PlayerState, event: Record<string, unknown>) {
  if (Number(player.flags.hisuiMysteryRound ?? -1) !== state.round) return;
  const locationId = player.flags.hisuiMysteryLocationId;
  const eventId = player.flags.hisuiMysteryEventId;
  if ((locationId !== "mountain" && locationId !== "city") || event.locationId !== locationId
    || typeof eventId !== "string") return;
  const eventIds = Array.isArray(event.eventIds) ? event.eventIds.filter((id): id is string => typeof id === "string") : [];
  if (!eventIds.includes(eventId)) return;
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  const clueInstanceIds = winnerIds.filter((id) => id !== player.id && state.players[id] && !state.players[id].eliminated)
    .map((culpritPlayerId) => createClue(state, player, culpritPlayerId, locationId));
  delete player.flags.hisuiMysteryEventId;
  delete player.flags.hisuiMysteryLocationId;
  delete player.flags.hisuiMysteryRound;
  return { clueInstanceIds };
}

function boardCluesAt(state: GameState, player: PlayerState, locationId: string) {
  return clueCards(state, player, "board").filter((card) => card.boardLocationId === locationId);
}

function acquireClue(state: GameState, player: PlayerState, instanceId: string): string {
  const clue = state.cards[instanceId];
  if (!clue || clue.ownerPlayerId !== player.id || clue.definitionId !== CLUE_DEFINITION_ID || clue.zone !== "board") {
    throw new Error("HISUI_CLUE_ACQUIRE_INVALID");
  }
  returnOwnedBoardCardToSkillZone(state, player.id, instanceId, "master-skills");
  return instanceId;
}

function beginClueAcquisition(
  state: GameState,
  player: PlayerState,
  locationId: string,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  if (player.flags.deploymentBonusActive !== true || Number(player.flags.deploymentBonus ?? 0) <= 0
    || player.flags.deploymentLocationId !== locationId) return;
  const candidates = boardCluesAt(state, player, locationId);
  if (candidates.length === 0) return;
  if (candidates.length === 1) return { acquiredInstanceId: acquireClue(state, player, candidates[0].instanceId) };
  openContinuation(state, player, HISUI_CLUE_ID, "acquire-clue", { candidates: candidates.map((card) => card.instanceId) },
    candidates.map((card) => ({ id: card.instanceId, label: `Clue: ${state.players[card.createdByPlayerId ?? ""]?.name ?? "Culprit"}` })),
    1, 1, openDecision);
  return { pending: true };
}

function investigateClues(state: GameState, player: PlayerState): string[] {
  return clueCards(state, player, "master-skills").map((card) => transformClue(state, player, card.instanceId));
}

function eligibleConfrontations(state: GameState, player: PlayerState) {
  return confrontationCards(state, player).filter((card) => {
    const culprit = card.createdByPlayerId ? state.players[card.createdByPlayerId] : undefined;
    if (!culprit || culprit.eliminated || culprit.id === player.id) return false;
    if (state.round === 11) return true;
    return (player.locationId === "mountain" || player.locationId === "city") && culprit.locationId === player.locationId;
  });
}

function resolveConfrontation(state: GameState, player: PlayerState, instanceId: string) {
  const card = eligibleConfrontations(state, player).find((candidate) => candidate.instanceId === instanceId);
  if (!card || !card.createdByPlayerId) throw new Error("HISUI_CONFRONTATION_INVALID");
  const culprit = state.players[card.createdByPlayerId];
  card.usedGameCount = 1;
  if (state.round === 11) {
    return { instanceId, culpritPlayerId: culprit.id, ...eliminatePlayerByEffect(state, culprit.id) };
  }
  const stolenVictoryPoints = transferVictoryPoints(culprit, player, 4);
  player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 5;
  return { instanceId, culpritPlayerId: culprit.id, stolenVictoryPoints, totalPowerBonus: 5 };
}

function beginConfrontation(
  state: GameState,
  player: PlayerState,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  const candidates = eligibleConfrontations(state, player);
  if (candidates.length === 0) throw new Error("HISUI_CONFRONTATION_NO_TARGET");
  if (candidates.length === 1) return resolveConfrontation(state, player, candidates[0].instanceId);
  openContinuation(state, player, HISUI_CONFRONTATION_ID, "choose-confrontation", { candidates: candidates.map((card) => card.instanceId) },
    candidates.map((card) => ({ id: card.instanceId, label: state.players[card.createdByPlayerId ?? ""]?.name ?? "Culprit" })),
    1, 1, openDecision);
  return { pending: true };
}

function beginAscension(
  state: GameState,
  player: PlayerState,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  const clues = clueCards(state, player, "master-skills");
  if (clues.length > 1) {
    openContinuation(state, player, HISUI_ASCENSION_ID, "ascension-transform", { candidates: clues.map((card) => card.instanceId) },
      clues.map((card) => ({ id: card.instanceId, label: state.players[card.createdByPlayerId ?? ""]?.name ?? "Clue" })),
      1, 1, openDecision);
    return { pending: true, stage: "transform" };
  }
  const transformedInstanceId = clues.length === 1 ? transformClue(state, player, clues[0].instanceId) : null;
  return beginAscensionBoundedField(state, player, openDecision, transformedInstanceId);
}

function beginAscensionBoundedField(
  state: GameState,
  player: PlayerState,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
  transformedInstanceId: string | null,
) {
  const candidates = availableDiscardBoundedFields(state);
  if (candidates.length === 0) return { transformedInstanceId, removedEventId: null, regainedUse: false };
  if (candidates.length === 1) {
    moveEvent(state, candidates[0], { zone: "removed" });
    player.flags.hisuiLockedRoomUsesRemaining = 1;
    return { transformedInstanceId, removedEventId: candidates[0], regainedUse: true };
  }
  openContinuation(state, player, HISUI_ASCENSION_ID, "ascension-bounded-field", { candidates, transformedInstanceId },
    candidates.map((id) => ({ id, label: "Break Bounded Field" })), 1, 1, openDecision);
  return { pending: true, stage: "bounded-field", transformedInstanceId };
}

export const useHisuiDetective: SkillHandler = (context) => {
  const { state, player, skill, payload, openDecision } = context;
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === HISUI_LOCKED_ROOM_ID) {
    if (eventType !== "game.started") return;
    return setupLockedRoom(state, player, openDecision);
  }
  if (skill.id === HISUI_RUMOR_ID) {
    if (eventType === "phase.transitioned") {
      if (event.previousPhase !== "outpost" || event.transition !== "next-phase") return;
      return beginLockedRoomPlacement(state, player, openDecision);
    }
    if (eventType === "combat.resolved") return resolveMysteryCombat(state, player, event);
    if (eventType === "player.deployed" && event.playerId === player.id && typeof event.locationId === "string") {
      return beginClueAcquisition(state, player, event.locationId, openDecision);
    }
    if (eventType === "player.entered-location" && event.playerId === player.id && event.locationId === "scouting") {
      return { transformedInstanceIds: investigateClues(state, player) };
    }
    return;
  }
  if (skill.id === HISUI_CONFRONTATION_ID) {
    if (data.abilityId !== HISUI_CONFRONT_ABILITY) throw new Error("HISUI_CONFRONTATION_ABILITY_INVALID");
    return beginConfrontation(state, player, openDecision);
  }
  if (skill.id === HISUI_ASCENSION_ID) {
    if (eventType !== "skill.unlocked" || event.playerId !== player.id || event.skillId !== skill.id) return;
    return beginAscension(state, player, openDecision);
  }
};

export const isHisuiDetectiveLegal: SkillLegalityPredicate = (state, playerId, skill, ability) => {
  const player = state.players[playerId];
  if (!player || player.eliminated) return false;
  if (skill.id === HISUI_CONFRONTATION_ID && ability?.id === HISUI_CONFRONT_ABILITY) {
    return state.phase === "action" && state.activePlayerId === player.id && eligibleConfrontations(state, player).length > 0;
  }
  return false;
};

export const resolveHisuiDetectiveDecision: SkillHandler = ({ state, player, payload, openDecision }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("HISUI_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  if (decision.status !== "resolved") throw new Error("HISUI_DECISION_INVALID");
  const selections = selectedIds(payload);
  const stage = previous.stage;

  if (stage === "setup-bounded-field") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !candidates.includes(selections[0]) || !availableDeckBoundedFields(state).includes(selections[0])) throw new Error("HISUI_SETUP_DECISION_INVALID");
    moveEvent(state, selections[0], { zone: "removed" });
    return { removedEventId: selections[0] };
  }
  if (stage === "place-bounded-field") {
    if (selections.length !== 1) throw new Error("HISUI_PLACEMENT_DECISION_INVALID");
    if (selections[0] === "skip") return { skipped: true };
    const choices = Array.isArray(previous.choices) ? previous.choices.filter(isRecord) : [];
    if (!/^place-\d+$/.test(selections[0])) throw new Error("HISUI_PLACEMENT_DECISION_INVALID");
    const index = Number(selections[0].slice(6));
    const choice = choices[index];
    const eventId = typeof choice?.eventId === "string" ? choice.eventId : undefined;
    const locationId = choice?.locationId;
    if (!eventId || (locationId !== "mountain" && locationId !== "city")) throw new Error("HISUI_PLACEMENT_DECISION_INVALID");
    return placeLockedRoomEvent(state, player, eventId, locationId);
  }
  if (stage === "acquire-clue") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("HISUI_CLUE_DECISION_INVALID");
    return { acquiredInstanceId: acquireClue(state, player, selections[0]) };
  }
  if (stage === "choose-confrontation") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("HISUI_CONFRONTATION_DECISION_INVALID");
    return resolveConfrontation(state, player, selections[0]);
  }
  if (stage === "ascension-transform") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("HISUI_ASCENSION_CLUE_INVALID");
    const transformedInstanceId = transformClue(state, player, selections[0]);
    return beginAscensionBoundedField(state, player, openDecision, transformedInstanceId);
  }
  if (stage === "ascension-bounded-field") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !candidates.includes(selections[0]) || !availableDiscardBoundedFields(state).includes(selections[0])) throw new Error("HISUI_ASCENSION_EVENT_INVALID");
    moveEvent(state, selections[0], { zone: "removed" });
    player.flags.hisuiLockedRoomUsesRemaining = 1;
    return { transformedInstanceId: typeof previous.transformedInstanceId === "string" ? previous.transformedInstanceId : null, removedEventId: selections[0], regainedUse: true };
  }
  throw new Error("HISUI_DECISION_STAGE_INVALID");
};
