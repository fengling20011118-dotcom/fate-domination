import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import {
  drawEventToLocation,
  getNamedEventPoolAvailableIds,
  moveEvent,
  releaseNamedEventToLocation,
  removeNamedEventFromGame,
  type EventLocation,
} from "./event-lifecycle.ts";
import { gainMana } from "./resources.ts";
import { payManaCost } from "./costs.ts";
import { defeatPlayer, playerIgnoresDefeat } from "./defeat.ts";
import { isPlayerImmuneToLostbeltObjective, setLostbeltObjectiveImmunity } from "./lostbelt.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const INDIA_POOL_ID = "lostbelt:india";
export const INDIA_EXPANSION_HANDLER = "core.india-expansion";
export const INDIA_YUGA_HANDLER = "core.india-yuga-cycle";
export const INDIA_OBJECTIVE_HANDLER = "core.india-objectives";
export const INDIA_NIRVANA_HANDLER = "core.india-nirvana";
export const INDIA_BOULDER_RESOLVE = "core.india-boulder-resolve";
export const INDIA_CYCLE_REMOVE_RESOLVE = "core.india-cycle-remove-resolve";
export const INDIA_NIRVANA_REMOVE_RESOLVE = "core.india-nirvana-remove-resolve";
export const INDIA_JUDGEMENT_ADD_RESOLVE = "core.india-judgement-add-resolve";
export const INDIA_BOULDER_RESTORE_RESOLVE = "core.india-boulder-restore-resolve";

interface IndiaExpansionRecord {
  round: number;
  playerId: string;
  locationId: EventLocation;
}

interface IndiaYugaState {
  round: number;
  name: "sutra" | "tetra" | "dvapara" | "kali" | "judgement";
  x: number;
  cycleEventIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tags(definition: CardDefinition | undefined): string[] {
  return definition?.tags?.filter((tag): tag is string => typeof tag === "string") ?? [];
}

function hasTag(definition: CardDefinition | undefined, tag: string): boolean {
  return tags(definition).includes(tag);
}

function expansionRecords(state: GameState): Record<string, IndiaExpansionRecord> {
  const raw = state.modeState.indiaExpansionRecords;
  return isRecord(raw) ? raw as unknown as Record<string, IndiaExpansionRecord> : {};
}

function setExpansionRecords(state: GameState, records: Record<string, IndiaExpansionRecord>): void {
  state.modeState.indiaExpansionRecords = records;
}

export function getIndiaLostbeltSize(state: GameState): number {
  const value = Number(state.modeState.indiaLostbeltSize ?? 0);
  if (!Number.isInteger(value) || value < 0) throw new Error("INDIA_LOSTBELT_SIZE_INVALID");
  return value;
}

export function adjustIndiaLostbeltSize(state: GameState, amount: number): number {
  if (!Number.isInteger(amount)) throw new Error("INDIA_LOSTBELT_SIZE_DELTA_INVALID");
  const next = getIndiaLostbeltSize(state) + amount;
  if (next < 0) throw new Error("INDIA_LOSTBELT_SIZE_INVALID");
  state.modeState.indiaLostbeltSize = next;
  return next;
}

function yugaForRound(round: number, size: number): Omit<IndiaYugaState, "cycleEventIds"> {
  if (round <= 4) return { round, name: "sutra", x: 4 };
  if (round <= 7) return { round, name: "tetra", x: 3 };
  if (round <= 9) return { round, name: "dvapara", x: 2 };
  if (round === 10) return { round, name: "kali", x: 1 };
  return { round, name: "judgement", x: size };
}

function yugaState(state: GameState): IndiaYugaState {
  const raw = state.modeState.indiaYuga;
  if (!isRecord(raw) || !Array.isArray(raw.cycleEventIds)) {
    return { ...yugaForRound(state.round, getIndiaLostbeltSize(state)), cycleEventIds: [] };
  }
  return {
    round: Number(raw.round),
    name: String(raw.name) as IndiaYugaState["name"],
    x: Number(raw.x),
    cycleEventIds: raw.cycleEventIds.filter((id): id is string => typeof id === "string"),
  };
}

export function getIndiaYugaX(state: GameState): number {
  const current = yugaState(state);
  if (current.round === state.round && Number.isInteger(current.x)) return current.x;
  return yugaForRound(state.round, getIndiaLostbeltSize(state)).x;
}

export function getIndiaYugaCycleEventIds(state: GameState): string[] {
  return [...yugaState(state).cycleEventIds];
}

function firstAvailableByTag(available: string[], definitions: Record<string, CardDefinition>, tag: string): string | undefined {
  return available.find((id) => hasTag(definitions[id], tag));
}

export function syncIndiaYugaCycle(state: GameState, definitions: Record<string, CardDefinition>): IndiaYugaState {
  const base = yugaForRound(state.round, getIndiaLostbeltSize(state));
  const available = getNamedEventPoolAvailableIds(state, INDIA_POOL_ID);
  const wanted: string[] = [];
  const add = (tag: string) => {
    const id = firstAvailableByTag(available.filter((candidate) => !wanted.includes(candidate)), definitions, tag);
    if (id) wanted.push(id);
  };
  if (base.name === "sutra" || base.name === "tetra") {
    add("india-type-bonus:力量"); add("india-type-bonus:迅捷"); add("india-type-bonus:魔术");
    if (base.name === "sutra") add("india-great-sky-boulder");
  } else if (base.name === "dvapara") {
    add("india-fading-town"); add("india-withering-plains");
  } else if (base.name === "kali") add("india-ocean-of-milk");
  const next: IndiaYugaState = { ...base, cycleEventIds: wanted };
  state.modeState.indiaYuga = next;
  return next;
}

function removeCycleId(state: GameState, eventId: string): void {
  const current = yugaState(state);
  current.cycleEventIds = current.cycleEventIds.filter((id) => id !== eventId);
  state.modeState.indiaYuga = current;
}

function removeCycleEventFromGame(state: GameState, eventId: string): void {
  removeCycleId(state, eventId);
  if (getNamedEventPoolAvailableIds(state, INDIA_POOL_ID).includes(eventId)) {
    removeNamedEventFromGame(state, INDIA_POOL_ID, eventId);
  } else if (!state.board.eventRemoved.includes(eventId)) {
    moveEvent(state, eventId, { zone: "removed" });
  }
}

function releaseCycleEventToLocation(state: GameState, eventId: string, locationId: EventLocation): void {
  const outside = getNamedEventPoolAvailableIds(state, INDIA_POOL_ID);
  if (outside.includes(eventId)) releaseNamedEventToLocation(state, INDIA_POOL_ID, eventId, locationId, "up");
  else if (state.board.eventRemoved.includes(eventId)) moveEvent(state, eventId, { zone: "current", locationId, visibility: "up" });
  else throw new Error("INDIA_YUGA_EVENT_NOT_AVAILABLE");
  removeCycleId(state, eventId);
}

function effectiveIndiaObjectiveVp(state: GameState, eventId: string, definitions: Record<string, CardDefinition>): number {
  const definition = definitions[eventId];
  if (!definition) throw new Error("INDIA_OBJECTIVE_DEFINITION_MISSING");
  const dynamic = hasTag(definition, "india-fading-town") || hasTag(definition, "india-withering-plains") ? getIndiaYugaX(state) : 0;
  return Number(definition.victoryPoints ?? 0) + dynamic;
}

function applyDynamicObjectiveVp(state: GameState, eventId: string, definitions: Record<string, CardDefinition>): void {
  const definition = definitions[eventId];
  if (!definition) return;
  if (hasTag(definition, "india-fading-town") || hasTag(definition, "india-withering-plains")) {
    state.board.eventVictoryPointBonuses ??= {};
    state.board.eventVictoryPointBonuses[eventId] = getIndiaYugaX(state);
  }
  if (state.modeState.indiaBoulderDoubledEventId === eventId) {
    state.board.eventVictoryPointBonuses ??= {};
    const currentBonus = Number(state.board.eventVictoryPointBonuses[eventId] ?? 0);
    state.board.eventVictoryPointBonuses[eventId] = currentBonus + effectiveIndiaObjectiveVp(state, eventId, definitions);
    delete state.modeState.indiaBoulderDoubledEventId;
  }
}

function markExpanded(state: GameState, player: PlayerState, eventId: string, locationId: EventLocation): void {
  const records = expansionRecords(state);
  records[eventId] = { round: state.round, playerId: player.id, locationId };
  setExpansionRecords(state, records);
  player.flags.indiaExpandedRound = state.round;
}

function openBoulderTargetDecision(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  boulderId: string,
  locationId: EventLocation,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): { pending: true; boulderId: string } {
  const targets = (state.board.currentEvents[locationId] ?? []).filter((id) => id !== boulderId);
  if (targets.length === 0) {
    moveEvent(state, boulderId, { zone: "removed" });
    return { pending: true, boulderId };
  }
  if (targets.length === 1) {
    moveEvent(state, targets[0], { zone: "removed" });
    state.modeState.indiaBoulderStoredEventId = targets[0];
    moveEvent(state, boulderId, { zone: "removed" });
    return { pending: true, boulderId };
  }
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:india-boulder`;
  state.effectQueue.unshift({ effectId, handlerId: INDIA_BOULDER_RESOLVE, sourceId, controllerPlayerId: player.id,
    payload: { boulderId, locationId, targetIds: targets }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "india-great-sky-boulder",
    options: targets.map((id) => ({ id, label: id })), min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
  return { pending: true, boulderId };
}

export function expandIndiaLostbelt(
  context: Parameters<SkillHandler>[0],
  sourceId: string,
): { expandedEventId?: string; pending?: boolean } {
  const { state, player, definitions, randomInt, openDecision, emitEvent } = context;
  if (!definitions || !randomInt) throw new Error("INDIA_EXPANSION_CONTEXT_REQUIRED");
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("INDIA_EXPANSION_BATTLEFIELD_REQUIRED");
  const current = yugaState(state);
  if (current.round !== state.round) syncIndiaYugaCycle(state, definitions);
  const candidates = getIndiaYugaCycleEventIds(state);
  if (candidates.length === 0) return {};
  const eventId = candidates[randomInt(candidates.length)];
  releaseCycleEventToLocation(state, eventId, locationId);
  applyDynamicObjectiveVp(state, eventId, definitions);
  markExpanded(state, player, eventId, locationId);
  emitEvent?.("event.revealed", { eventId, locationId, sourceId, method: "india-expand" });
  emitEvent?.("lostbelt.expanded", { playerId: player.id, poolId: INDIA_POOL_ID, sourceId, expandedEventId: eventId, locationId });
  if (hasTag(definitions[eventId], "india-great-sky-boulder")) {
    openBoulderTargetDecision(state, player, sourceId, eventId, locationId, openDecision);
    return { expandedEventId: eventId, pending: Boolean(state.pendingDecision) };
  }
  return { expandedEventId: eventId };
}

export const resolveIndiaBoulder: SkillHandler = ({ state, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("INDIA_BOULDER_DECISION_INVALID");
  const previous = payload.previous;
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  const targets = Array.isArray(previous.targetIds) ? previous.targetIds.filter((id): id is string => typeof id === "string") : [];
  const boulderId = typeof previous.boulderId === "string" ? previous.boulderId : undefined;
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !targets.includes(selections[0]) || !boulderId) throw new Error("INDIA_BOULDER_DECISION_INVALID");
  moveEvent(state, selections[0], { zone: "removed" });
  state.modeState.indiaBoulderStoredEventId = selections[0];
  if (!state.board.eventRemoved.includes(boulderId)) moveEvent(state, boulderId, { zone: "removed" });
  return { removedEventId: selections[0], boulderId };
};

function settleExpandedObjectives(state: GameState, player: PlayerState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>): void {
  const winnersByLocation = isRecord(event.combatWinnerIdsByLocation) ? event.combatWinnerIdsByLocation : {};
  const records = expansionRecords(state);
  for (const [eventId, record] of Object.entries(records)) {
    if (record.playerId !== player.id || record.round !== state.round) continue;
    if (!(state.board.currentEvents[record.locationId] ?? []).includes(eventId)) { delete records[eventId]; continue; }
    const winners = Array.isArray(winnersByLocation[record.locationId]) ? winnersByLocation[record.locationId] as unknown[] : [];
    const wonAnother = Object.entries(winnersByLocation).some(([locationId, ids]) => locationId !== record.locationId
      && Array.isArray(ids) && ids.includes(player.id));
    const definition = definitions[eventId];
    const discard = winners.includes(player.id)
      || (hasTag(definition, "india-withering-plains") && (wonAnother || player.locationId === "scouting"));
    moveEvent(state, eventId, { zone: discard ? "discard" : "removed" });
    if (discard) adjustIndiaLostbeltSize(state, 1);
    delete records[eventId];
  }
  setExpansionRecords(state, records);
}

export const useIndiaExpansionLifecycle: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || payload.eventType !== "combat.ending" || !isRecord(payload.event)) return;
  settleExpandedObjectives(state, player, payload.event, definitions);
};

function openCycleRemovalDecision(
  state: GameState,
  player: PlayerState,
  skillId: string,
  handlerId: string,
  kind: string,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): { pending: true; candidateIds: string[] } | { removedEventId?: string } {
  const candidates = getIndiaYugaCycleEventIds(state);
  if (candidates.length === 0) return {};
  if (candidates.length === 1) { removeCycleEventFromGame(state, candidates[0]); return { removedEventId: candidates[0] }; }
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skillId}:${kind}`;
  state.effectQueue.unshift({ effectId, handlerId, sourceId: skillId, controllerPlayerId: player.id,
    payload: { candidateIds: candidates }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind,
    options: candidates.map((id) => ({ id, label: id })), min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
  return { pending: true, candidateIds: candidates };
}

export const resolveIndiaCycleRemoval: SkillHandler = ({ state, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("INDIA_CYCLE_REMOVE_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("INDIA_CYCLE_REMOVE_DECISION_INVALID");
  removeCycleEventFromGame(state, selections[0]);
  return { removedEventId: selections[0] };
};

function openBoulderRestoreDecision(state: GameState, player: PlayerState, skillId: string, openDecision: Parameters<SkillHandler>[0]["openDecision"]): boolean {
  const stored = typeof state.modeState.indiaBoulderStoredEventId === "string" ? state.modeState.indiaBoulderStoredEventId : undefined;
  const cycle = getIndiaYugaCycleEventIds(state);
  if (!stored || !state.board.eventRemoved.includes(stored) || cycle.length === 0) return false;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skillId}:india-boulder-restore`;
  state.effectQueue.unshift({ effectId, handlerId: INDIA_BOULDER_RESTORE_RESOLVE, sourceId: skillId, controllerPlayerId: player.id,
    payload: { storedEventId: stored, cycleIds: cycle }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "india-boulder-restore",
    options: [{ id: "skip", label: "Do not restore the stored objective" }, ...cycle.map((id) => ({ id: `replace:${id}`, label: `Replace ${id}` }))],
    min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
  return true;
}

export const resolveIndiaBoulderRestore: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("INDIA_BOULDER_RESTORE_DECISION_INVALID");
  const stored = typeof payload.previous.storedEventId === "string" ? payload.previous.storedEventId : undefined;
  const cycleIds = Array.isArray(payload.previous.cycleIds) ? payload.previous.cycleIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (!stored || payload.decision.status !== "resolved" || selections.length !== 1) throw new Error("INDIA_BOULDER_RESTORE_DECISION_INVALID");
  let result: { restored: boolean; storedEventId?: string; replacedEventId?: string } = { restored: false };
  if (selections[0] !== "skip") {
    if (!selections[0].startsWith("replace:")) throw new Error("INDIA_BOULDER_RESTORE_DECISION_INVALID");
    const replaced = selections[0].slice("replace:".length);
    if (!cycleIds.includes(replaced)) throw new Error("INDIA_BOULDER_RESTORE_DECISION_INVALID");
    const current = yugaState(state);
    current.cycleEventIds = current.cycleEventIds.map((id) => id === replaced ? stored : id);
    state.modeState.indiaYuga = current;
    state.modeState.indiaBoulderDoubledEventId = stored;
    delete state.modeState.indiaBoulderStoredEventId;
    result = { restored: true, storedEventId: stored, replacedEventId: replaced };
  }
  if (definitions) openJudgementAddDecision(state, player, skill.id, definitions, openDecision);
  return result;
};

function openJudgementAddDecision(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>, openDecision: Parameters<SkillHandler>[0]["openDecision"]): void {
  if (state.round !== 11 || getIndiaLostbeltSize(state) < 3 || state.board.eventDeck.length === 0) return;
  const candidates = [...state.board.eventDeck];
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skillId}:india-judgement-add`;
  state.effectQueue.unshift({ effectId, handlerId: INDIA_JUDGEMENT_ADD_RESOLVE, sourceId: skillId, controllerPlayerId: player.id,
    payload: { candidateIds: candidates }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "india-judgement-add-objective",
    options: candidates.map((id) => ({ id, label: definitions[id]?.name ?? id })), min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
}

export const resolveIndiaJudgementAdd: SkillHandler = ({ state, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("INDIA_JUDGEMENT_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("INDIA_JUDGEMENT_DECISION_INVALID");
  moveEvent(state, selections[0], { zone: "current", locationId: "mountain", visibility: "up" });
  return { eventId: selections[0], locationId: "mountain" };
};

export const useIndiaYugaCycle: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions, openDecision } = context;
  if (!definitions || !isRecord(payload)) return;
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType === "round.started") {
    syncIndiaYugaCycle(state, definitions);
    if (!openBoulderRestoreDecision(state, player, skill.id, openDecision)) openJudgementAddDecision(state, player, skill.id, definitions, openDecision);
    return;
  }
  if (eventType === "player.entered-location") {
    const locationId = event.locationId;
    if (event.playerId !== player.id || (locationId !== "mountain" && locationId !== "city") || Number(player.flags.indiaExpandedRound ?? -1) === state.round) return;
    return expandIndiaLostbelt(context, skill.id);
  }
  if (eventType === "round.ending" && Number(player.flags.indiaExpandedRound ?? -1) !== state.round) {
    return openCycleRemovalDecision(state, player, skill.id, INDIA_CYCLE_REMOVE_RESOLVE, "india-cycle-remove", openDecision);
  }
};

export const useIndiaObjectiveAnchor: SkillHandler = () => ({ active: true });

export function isIndiaFadingTownExitBlocked(state: GameState, player: PlayerState, targetLocationId: string, definitions: Record<string, CardDefinition>): boolean {
  if (player.flags.lostbeltResponsibility !== "india" || player.locationId === targetLocationId) return false;
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return false;
  return (state.board.currentEvents[locationId] ?? []).some((id) => hasTag(definitions[id], "india-fading-town"));
}

export function getIndiaFadingTownTerrainBonus(state: GameState, player: PlayerState, locationId: string | null | undefined, definitions: Record<string, CardDefinition>): number {
  if (player.flags.lostbeltResponsibility !== "india" || (locationId !== "mountain" && locationId !== "city")) return 0;
  return (state.board.currentEvents[locationId] ?? []).some((id) => hasTag(definitions[id], "india-fading-town")) ? getIndiaYugaX(state) : 0;
}

export function getIndiaJudgementPowerBonus(state: GameState, player: PlayerState): number {
  if (player.flags.lostbeltResponsibility !== "india" || state.round !== 11) return 0;
  const size = getIndiaLostbeltSize(state);
  return size <= 1 ? -10 : size >= 5 ? 5 : 0;
}

export function getIndiaObjectiveCardPowerAdd(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  eventId: string,
  attributes: string[],
  definitions: Record<string, CardDefinition>,
): number {
  const definition = definitions[eventId];
  if (!definition || isPlayerImmuneToLostbeltObjective(player, definition)) return 0;
  const typeTag = tags(definition).find((tag) => tag.startsWith("india-type-bonus:"));
  const required = typeTag?.slice("india-type-bonus:".length);
  if (!required || !attributes.includes(required)) return 0;
  const instance = state.cards[instanceId];
  if (!instance || instance.playedRound !== state.round || instance.playedByEffectRound === state.round) return 0;
  return getIndiaYugaX(state);
}

export function applyIndiaObjectiveRuntimeEvent(
  state: GameState,
  eventType: string,
  payload: unknown,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
  emitEvent?: (type: string, payload: unknown) => unknown,
): void {
  const event = isRecord(payload) ? payload : {};
  if (eventType === "card.played" || eventType === "card.used") {
    const playerId = typeof event.playerId === "string" ? event.playerId : undefined;
    const attributes = Array.isArray(event.attributes) ? event.attributes : [];
    if (playerId && attributes.includes("宝具")) state.players[playerId].flags.noblePhantasmUsedRound = state.round;
    return;
  }
  if (eventType === "event.revealed") {
    const eventId = typeof event.eventId === "string" ? event.eventId : undefined;
    const locationId = event.locationId === "mountain" || event.locationId === "city" ? event.locationId : undefined;
    if (!eventId || !locationId) return;
    const definition = definitions[eventId];
    if (!definition || !hasTag(definition, "lostbelt-group:india")) return;
    applyDynamicObjectiveVp(state, eventId, definitions);
    const expanded = expansionRecords(state)[eventId];
    if (hasTag(definition, "india-extra-draw-if-not-expanded") && expanded?.round !== state.round) {
      const drawn = drawEventToLocation(state, locationId, randomInt, "up");
      emitEvent?.("event.revealed", { eventId: drawn, locationId, sourceId: eventId, method: "india-extra-objective" });
    }
    return;
  }
  if (eventType === "phase.transitioned") {
    if (event.previousPhase !== "action" || event.transition !== "next-phase") return;
    for (const locationId of ["mountain", "city"] as const) {
      const oceanIds = (state.board.currentEvents[locationId] ?? []).filter((id) => hasTag(definitions[id], "india-ocean-of-milk"));
      if (oceanIds.length === 0) continue;
      for (const playerId of [...(state.board.locations[locationId] ?? [])]) {
        const target = state.players[playerId];
        if (!target || target.eliminated || target.defeated || Number(target.flags.noblePhantasmUsedRound ?? -1) === state.round) continue;
        if (oceanIds.every((id) => isPlayerImmuneToLostbeltObjective(target, definitions[id]))) continue;
        if (playerIgnoresDefeat(state, target, definitions)) continue;
        defeatPlayer(state, playerId, emitEvent as never, { reason: "effect", sourceEventId: oceanIds[0] });
      }
    }
  }
}

export const isIndiaNirvanaLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId) return false;
  if (ability?.id === "shunyata") return state.phase === "outpost" && getIndiaYugaCycleEventIds(state).length > 0;
  if (ability?.id === "forced-expansion") return state.phase === "action" && player.mana >= 7;
  return false;
};

function applyNirvanaRemoval(state: GameState, player: PlayerState, eventId: string): { removedEventId: string; mana: number; power: number } {
  if (!getIndiaYugaCycleEventIds(state).includes(eventId)) throw new Error("INDIA_NIRVANA_EVENT_INVALID");
  removeCycleEventFromGame(state, eventId);
  gainMana(player, 2);
  player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 3;
  return { removedEventId: eventId, mana: 2, power: 3 };
}

export const resolveIndiaNirvanaRemoval: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("INDIA_NIRVANA_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("INDIA_NIRVANA_DECISION_INVALID");
  return applyNirvanaRemoval(state, player, selections[0]);
};

export const useIndiaNirvana: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("INDIA_NIRVANA_CONTEXT_REQUIRED");
  if (payload.eventType === "skill.unlocked") {
    const event = isRecord(payload.event) ? payload.event : {};
    if (event.playerId !== player.id || event.skillId !== skill.id) return;
    for (const target of Object.values(state.players)) if (target.id !== player.id && !target.eliminated) setLostbeltObjectiveImmunity(target, "india", true);
    return { immunePlayerIds: Object.values(state.players).filter((target) => target.id !== player.id && !target.eliminated).map((target) => target.id) };
  }
  const abilityId = typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  if (abilityId === "forced-expansion") {
    if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("INDIA_FORCED_EXPANSION_WINDOW_INVALID");
    payManaCost(state, player, 7, definitions, "INDIA_FORCED_EXPANSION_MANA_REQUIRED");
    return { size: adjustIndiaLostbeltSize(state, 1), paidMana: 7 };
  }
  if (abilityId !== "shunyata" || state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("INDIA_SHUNYATA_WINDOW_INVALID");
  const candidates = getIndiaYugaCycleEventIds(state);
  if (candidates.length === 0) throw new Error("INDIA_SHUNYATA_NO_OBJECTIVE");
  const requested = typeof payload.eventId === "string" ? payload.eventId : undefined;
  if (requested) return applyNirvanaRemoval(state, player, requested);
  if (candidates.length === 1) return applyNirvanaRemoval(state, player, candidates[0]);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:india-nirvana-remove`;
  state.effectQueue.unshift({ effectId, handlerId: INDIA_NIRVANA_REMOVE_RESOLVE, sourceId: skill.id, controllerPlayerId: player.id,
    payload: { candidateIds: candidates }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "india-nirvana-remove",
    options: candidates.map((id) => ({ id, label: definitions[id]?.name ?? id })), min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
  return { pending: true, candidateIds: candidates };
};
