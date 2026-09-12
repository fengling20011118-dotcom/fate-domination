import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { createOwnedCardInstance } from "./decks.ts";
import { gainVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler } from "./skill-types.ts";

export const RANI_STARGAZER_ID = "master.rani.skill.s1";
export const RANI_TRIUMPH_ID = "master.rani.skill.s2";
export const RANI_DOOM_ID = "master.rani.skill.s3";
export const RANI_ASCENSION_ID = "master.rani.skill.ascension";
export const RANI_HANDLER = "core.rani-prophecies";
export const RANI_RESOLVE = "core.rani-prophecies-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function opponentIds(state: GameState, player: PlayerState): string[] {
  return state.turnOrder.filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated);
}

function openChoice(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  stage: string,
  kind: string,
  optionIds: string[],
  labels: Record<string, string>,
  payload: Record<string, unknown>,
  openDecision: SkillContext["openDecision"],
  allowCancel = false,
): void {
  if (optionIds.length === 0) throw new Error("RANI_DECISION_NO_OPTIONS");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: RANI_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { stage, optionIds: [...optionIds], ...payload },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind,
    options: optionIds.map((id) => ({ id, label: labels[id] ?? id })),
    min: allowCancel ? 0 : 1,
    max: 1,
    allowCancel,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function ensureProphecyCard(state: GameState, player: PlayerState, definitionId: string): string {
  const existing = Object.values(state.cards).find((card) => card.ownerPlayerId === player.id
    && card.definitionId === definitionId && card.zone !== "removed");
  if (existing) return existing.instanceId;
  const instanceId = `${player.id}:rani-prophecy:${definitionId}`;
  createOwnedCardInstance(state, player.id, {
    instanceId,
    definitionId,
    ...(player.masterId ? { originMasterId: player.masterId } : {}),
    zone: "master-skills",
    face: "up",
    active: false,
  });
  return instanceId;
}

function openProphecyTarget(
  state: GameState,
  player: PlayerState,
  prophecy: "triumph" | "doom",
  flow: "initial" | "reassign",
  openDecision: SkillContext["openDecision"],
): void {
  const candidates = opponentIds(state, player);
  const labels = Object.fromEntries(candidates.map((id) => [id, state.players[id].name]));
  openChoice(
    state,
    player,
    prophecy === "triumph" ? RANI_TRIUMPH_ID : RANI_DOOM_ID,
    "prophecy-target",
    `rani-${prophecy}-target`,
    candidates,
    labels,
    { prophecy, flow },
    openDecision,
    flow === "reassign",
  );
}

function beginInitialProphecies(state: GameState, player: PlayerState, openDecision: SkillContext["openDecision"]): unknown {
  if (player.flags.raniPropheciesGranted === true) return;
  ensureProphecyCard(state, player, RANI_TRIUMPH_ID);
  ensureProphecyCard(state, player, RANI_DOOM_ID);
  player.flags.raniPropheciesGranted = true;
  openProphecyTarget(state, player, "triumph", "initial", openDecision);
  return { granted: [RANI_TRIUMPH_ID, RANI_DOOM_ID], pending: true };
}

function beginStargazerReplacement(
  state: GameState,
  player: PlayerState,
  event: Record<string, unknown>,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): unknown {
  if (event.climax === true) return;
  const targetRound = Number(event.round);
  const situationId = typeof event.situationId === "string" ? event.situationId : undefined;
  if (!Number.isInteger(targetRound) || targetRound !== state.round + 1 || !situationId) return;
  if (state.board.situationDeck[0] !== situationId) return;
  state.board.situationDeck.shift();
  state.board.situationDiscard.push(situationId);
  const candidates = [...new Set(state.board.situationDiscard)];
  const labels = Object.fromEntries(candidates.map((id) => [id, definitions[id]?.name ?? id]));
  openChoice(state, player, RANI_STARGAZER_ID, "stargazer-event", "rani-stargazer-event", candidates, labels,
    { targetRound, burnedSituationId: situationId }, openDecision, false);
  return { burnedSituationId: situationId, pending: true };
}

function scheduleAtlasObjectiveChoices(
  state: GameState,
  player: PlayerState,
  event: Record<string, unknown>,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): unknown {
  if (event.climax !== true) return;
  const targetRound = Number(event.round);
  if (!Number.isInteger(targetRound) || targetRound !== state.round + 1) return;
  const placement = isRecord(event.eventPlacement) ? event.eventPlacement : {};
  const mountain = Number(placement.mountain ?? 1);
  const city = Number(placement.city ?? 1);
  if (!Number.isInteger(mountain) || !Number.isInteger(city) || mountain < 0 || city < 0) throw new Error("RANI_ATLAS_PLACEMENT_INVALID");
  const slots = [...Array.from({ length: mountain }, () => "mountain"), ...Array.from({ length: city }, () => "city")];
  if (slots.length === 0) return { pending: false };
  const candidates = [...state.board.eventDeck];
  if (candidates.length < slots.length) throw new Error("RANI_ATLAS_EVENT_POOL_TOO_SMALL");
  const labels = Object.fromEntries(candidates.map((id) => [id, definitions[id]?.name ?? id]));
  openChoice(state, player, RANI_ASCENSION_ID, "atlas-objective", "rani-atlas-objective", candidates, labels,
    { targetRound, slots, slotIndex: 0, selectedEventIds: [] }, openDecision, false);
  return { pending: true, slots };
}

function handleEliminationReward(state: GameState, player: PlayerState, skillId: string, event: Record<string, unknown>): unknown {
  if (skillId === RANI_TRIUMPH_ID) {
    const targetId = typeof player.flags.raniTriumphTargetId === "string" ? player.flags.raniTriumphTargetId : undefined;
    const target = targetId ? state.players[targetId] : undefined;
    if (!target || target.eliminated) return;
    const round = Number(event.round);
    if (![8, 9, 10].includes(round)) return;
    return { targetPlayerId: targetId, gainedVictoryPoints: gainVictoryPoints(player, 2) };
  }
  if (skillId === RANI_DOOM_ID) {
    if (player.flags.raniDoomResolved === true) return;
    const eliminatedIds = Array.isArray(event.eliminatedPlayerIds)
      ? event.eliminatedPlayerIds.filter((id): id is string => typeof id === "string")
      : [];
    if (eliminatedIds.length === 0) return;
    player.flags.raniDoomResolved = true;
    const targetId = typeof player.flags.raniDoomTargetId === "string" ? player.flags.raniDoomTargetId : undefined;
    if (!targetId || !eliminatedIds.includes(targetId)) return { targetPlayerId: targetId ?? null, gainedVictoryPoints: 0 };
    const leastVictoryPoints = Math.min(...Object.values(state.players).map((candidate) => candidate.victoryPoints));
    const target = state.players[targetId];
    if (!target || target.victoryPoints !== leastVictoryPoints) return { targetPlayerId: targetId, gainedVictoryPoints: 0 };
    return { targetPlayerId: targetId, gainedVictoryPoints: gainVictoryPoints(player, 6) };
  }
}

export const useRani: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("RANI_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === RANI_STARGAZER_ID) {
    if (eventType === "game.started") {
      player.flags.viewBurnedSituationsSourceId = skill.id;
      return { mayInspectBurnedSituations: true };
    }
    if (eventType === "situation.will-activate") return beginStargazerReplacement(state, player, event, definitions, openDecision);
    if (eventType === "round.ending" && Number(event.round) === 4) return beginInitialProphecies(state, player, openDecision);
    return;
  }

  if ((skill.id === RANI_TRIUMPH_ID || skill.id === RANI_DOOM_ID) && eventType === "elimination.resolved") {
    return handleEliminationReward(state, player, skill.id, event);
  }

  if (skill.id === RANI_ASCENSION_ID) {
    if (eventType === "skill.unlocked") {
      if (event.playerId !== player.id || event.skillId !== skill.id) return;
      const aliveCount = Object.values(state.players).filter((candidate) => !candidate.eliminated).length;
      const gainedVictoryPoints = gainVictoryPoints(player, Math.max(0, state.round * 2 - aliveCount));
      if (player.flags.raniPropheciesGranted === true && opponentIds(state, player).length > 0) {
        openProphecyTarget(state, player, "triumph", "reassign", openDecision);
        return { gainedVictoryPoints, reassignPending: true };
      }
      return { gainedVictoryPoints, reassignPending: false };
    }
    if (eventType === "situation.will-activate") return scheduleAtlasObjectiveChoices(state, player, event, definitions, openDecision);
  }
};

export const resolveRani: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("RANI_DECISION_CONTEXT_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const stage = typeof previous.stage === "string" ? previous.stage : undefined;
  const status = decision.status;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  const allowed = Array.isArray(previous.optionIds) ? previous.optionIds.filter((id): id is string => typeof id === "string") : [];
  if (status !== "resolved" && status !== "cancelled") throw new Error("RANI_DECISION_STATUS_INVALID");
  if (status === "resolved" && (selections.length !== 1 || !allowed.includes(selections[0]))) throw new Error("RANI_DECISION_SELECTION_INVALID");

  if (stage === "stargazer-event") {
    if (status !== "resolved") throw new Error("RANI_STARGAZER_CANCEL_FORBIDDEN");
    const selected = selections[0];
    if (!state.board.situationDiscard.includes(selected)) throw new Error("RANI_STARGAZER_SITUATION_MISSING");
    state.board.situationDiscard = state.board.situationDiscard.filter((id) => id !== selected);
    state.board.situationDeck.unshift(selected);
    return { selectedSituationId: selected };
  }

  if (stage === "prophecy-target") {
    const prophecy = previous.prophecy;
    const flow = previous.flow;
    if ((prophecy !== "triumph" && prophecy !== "doom") || (flow !== "initial" && flow !== "reassign")) throw new Error("RANI_PROPHECY_FLOW_INVALID");
    if (status === "resolved") {
      const targetId = selections[0];
      if (!state.players[targetId] || targetId === player.id || state.players[targetId].eliminated) throw new Error("RANI_PROPHECY_TARGET_INVALID");
      if (prophecy === "triumph") player.flags.raniTriumphTargetId = targetId;
      else player.flags.raniDoomTargetId = targetId;
    } else if (flow !== "reassign") {
      throw new Error("RANI_PROPHECY_INITIAL_CANCEL_FORBIDDEN");
    }
    if (prophecy === "triumph") {
      openProphecyTarget(state, player, "doom", flow, openDecision);
      return { prophecy, targetPlayerId: status === "resolved" ? selections[0] : null, next: "doom" };
    }
    return { prophecy, targetPlayerId: status === "resolved" ? selections[0] : null, complete: true };
  }

  if (stage === "atlas-objective") {
    if (status !== "resolved") throw new Error("RANI_ATLAS_CANCEL_FORBIDDEN");
    const slots = Array.isArray(previous.slots) ? previous.slots.filter((value): value is "mountain" | "city" => value === "mountain" || value === "city") : [];
    const slotIndex = Number(previous.slotIndex);
    const targetRound = Number(previous.targetRound);
    const selectedEventIds = Array.isArray(previous.selectedEventIds)
      ? previous.selectedEventIds.filter((id): id is string => typeof id === "string")
      : [];
    const selected = selections[0];
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slots.length || !Number.isInteger(targetRound)) throw new Error("RANI_ATLAS_STAGE_INVALID");
    if (!state.board.eventDeck.includes(selected) || selectedEventIds.includes(selected)) throw new Error("RANI_ATLAS_EVENT_INVALID");
    const nextSelected = [...selectedEventIds, selected];
    const nextIndex = slotIndex + 1;
    if (nextIndex < slots.length) {
      const candidates = state.board.eventDeck.filter((id) => !nextSelected.includes(id));
      const labels = Object.fromEntries(candidates.map((id) => [id, definitions[id]?.name ?? id]));
      openChoice(state, player, RANI_ASCENSION_ID, "atlas-objective", "rani-atlas-objective", candidates, labels,
        { targetRound, slots, slotIndex: nextIndex, selectedEventIds: nextSelected }, openDecision, false);
      return { selectedEventId: selected, pending: true };
    }
    const placements = Array.isArray(state.modeState.pendingRoundEventPlacements) ? state.modeState.pendingRoundEventPlacements : [];
    for (let index = 0; index < slots.length; index += 1) {
      placements.push({
        targetRound,
        eventId: nextSelected[index],
        locationId: slots[index],
        sourceId: RANI_ASCENSION_ID,
        controllerPlayerId: player.id,
        replaceOrdinarySlot: true,
      });
    }
    state.modeState.pendingRoundEventPlacements = placements;
    return { selectedEventIds: nextSelected, placements: slots.length };
  }

  throw new Error("RANI_DECISION_STAGE_INVALID");
};
