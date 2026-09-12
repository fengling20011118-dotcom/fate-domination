import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { calculateCombatPower } from "./combat-power.ts";
import { applyDefeatEffect } from "./defeat.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const BAOBHAN_PART_COLLECTOR_ID = "servant.baobhan.skill.sc-baobhan-1";
export const BAOBHAN_FETCH_FAILNAUGHT_ID = "servant.baobhan.skill.sc-baobhan-2";
export const BAOBHAN_PART_COLLECTOR_HANDLER = "core.baobhan-part-collector";
export const BAOBHAN_FETCH_FAILNAUGHT_HANDLER = "core.baobhan-fetch-failnaught";
export const BAOBHAN_PART_COLLECTOR_RESOLVE = "core.baobhan-part-collector-resolve";
export const BAOBHAN_FETCH_FAILNAUGHT_RESOLVE = "core.baobhan-fetch-failnaught-resolve";

const PART_COLLECTOR_ABILITY = "part-collector";
const FETCH_FAILNAUGHT_ABILITY = "fetch-failnaught";
const FETCHES_KEY = "baobhanFetches";
const PART_TARGETS_KEY = "baobhanPartCollectorTargets";
const FAILNAUGHT_KEY = "baobhanFailnaughtTargets";
const BATTLEFIELDS = new Set(["mountain", "city"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export interface BaobhanFetch {
  id: string;
  controllerPlayerId: string;
  targetPlayerId: string;
  power: number;
  createdRound: number;
  createdLocationId: string;
  /** Fetch Failnaught publicly shows the chosen Fetch. */
  revealedRound?: number;
  /** The Fetch selected by Fetch Failnaught is removed at this round end. */
  removeAtRoundEndRound?: number;
}

interface PartCollectorTarget {
  controllerPlayerId: string;
  targetPlayerId: string;
  locationId: string;
  round: number;
}

interface FailnaughtTarget {
  controllerPlayerId: string;
  fetchId: string;
  round: number;
}

function readFetches(state: GameState): BaobhanFetch[] {
  const raw = state.modeState[FETCHES_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is BaobhanFetch => isRecord(value)
    && typeof value.id === "string"
    && typeof value.controllerPlayerId === "string"
    && typeof value.targetPlayerId === "string"
    && Number.isFinite(value.power)
    && Number.isInteger(value.createdRound)
    && typeof value.createdLocationId === "string")
    .map((value) => ({ ...value }));
}

function writeFetches(state: GameState, fetches: BaobhanFetch[]): void {
  state.modeState = { ...state.modeState, [FETCHES_KEY]: fetches.map((fetch) => ({ ...fetch })) };
}

function readPartTargets(state: GameState): PartCollectorTarget[] {
  const raw = state.modeState[PART_TARGETS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is PartCollectorTarget => isRecord(value)
    && typeof value.controllerPlayerId === "string"
    && typeof value.targetPlayerId === "string"
    && typeof value.locationId === "string"
    && Number.isInteger(value.round))
    .map((value) => ({ ...value }));
}

function writePartTargets(state: GameState, targets: PartCollectorTarget[]): void {
  state.modeState = { ...state.modeState, [PART_TARGETS_KEY]: targets.map((target) => ({ ...target })) };
}

function readFailnaughtTargets(state: GameState): FailnaughtTarget[] {
  const raw = state.modeState[FAILNAUGHT_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is FailnaughtTarget => isRecord(value)
    && typeof value.controllerPlayerId === "string"
    && typeof value.fetchId === "string"
    && Number.isInteger(value.round))
    .map((value) => ({ ...value }));
}

function writeFailnaughtTargets(state: GameState, targets: FailnaughtTarget[]): void {
  state.modeState = { ...state.modeState, [FAILNAUGHT_KEY]: targets.map((target) => ({ ...target })) };
}

export function getBaobhanFetches(state: GameState, controllerPlayerId?: string): BaobhanFetch[] {
  return readFetches(state).filter((fetch) => !controllerPlayerId || fetch.controllerPlayerId === controllerPlayerId);
}

function fetchId(controllerPlayerId: string, targetPlayerId: string): string {
  return `fetch:${controllerPlayerId}:${targetPlayerId}`;
}

function hasFetchOf(state: GameState, controllerPlayerId: string, targetPlayerId: string): boolean {
  return readFetches(state).some((fetch) => fetch.controllerPlayerId === controllerPlayerId && fetch.targetPlayerId === targetPlayerId);
}

function createFetch(
  state: GameState,
  controllerPlayerId: string,
  targetPlayerId: string,
  power: number,
  locationId: string,
): BaobhanFetch | undefined {
  if (hasFetchOf(state, controllerPlayerId, targetPlayerId)) return undefined;
  if (!Number.isFinite(power)) throw new Error("BAOBHAN_FETCH_POWER_INVALID");
  const created: BaobhanFetch = {
    id: fetchId(controllerPlayerId, targetPlayerId),
    controllerPlayerId,
    targetPlayerId,
    power,
    createdRound: state.round,
    createdLocationId: locationId,
  };
  writeFetches(state, [...readFetches(state), created]);
  return created;
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function findActiveOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

export function getBaobhanPartCollectorCandidates(state: GameState, playerId: string): string[] {
  const player = state.players[playerId];
  const locationId = player?.locationId;
  if (!player || player.eliminated || !locationId) return [];
  return (state.board.locations[locationId] ?? []).filter((targetId) => {
    const target = state.players[targetId];
    return targetId !== playerId && Boolean(target) && !target.eliminated && !hasFetchOf(state, playerId, targetId);
  });
}

function openPartCollectorDecision(
  state: GameState,
  player: PlayerState,
  candidates: string[],
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${BAOBHAN_PART_COLLECTOR_ID}:targets`;
  state.effectQueue.unshift({
    effectId,
    handlerId: BAOBHAN_PART_COLLECTOR_RESOLVE,
    sourceId: BAOBHAN_PART_COLLECTOR_ID,
    controllerPlayerId: player.id,
    payload: { stage: "targets", locationId: player.locationId, candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "baobhan-part-collector-targets",
    options: candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })),
    min: 0,
    max: candidates.length,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function settlePartCollectorCombat(
  state: GameState,
  player: PlayerState,
  event: Record<string, unknown>,
): BaobhanFetch[] {
  const locationId = typeof event.locationId === "string" ? event.locationId : undefined;
  const powers = isRecord(event.powers) ? event.powers : {};
  const targets = readPartTargets(state);
  if (!locationId) return [];
  const created: BaobhanFetch[] = [];
  const kept: PartCollectorTarget[] = [];
  for (const armed of targets) {
    if (armed.controllerPlayerId !== player.id) {
      kept.push(armed);
      continue;
    }
    if (armed.round < state.round) continue;
    if (armed.round !== state.round || armed.locationId !== locationId) {
      kept.push(armed);
      continue;
    }
    if (player.defeated) continue;
    const target = state.players[armed.targetPlayerId];
    const rawPower = powers[armed.targetPlayerId];
    if (!target || target.eliminated || target.locationId !== armed.locationId || !Number.isFinite(rawPower)) continue;
    const fetch = createFetch(state, player.id, armed.targetPlayerId, Number(rawPower), armed.locationId);
    if (fetch) created.push(fetch);
  }
  writePartTargets(state, kept);
  return created;
}

function settlePartCollectorEnding(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): BaobhanFetch[] {
  const targets = readPartTargets(state);
  const created: BaobhanFetch[] = [];
  const kept: PartCollectorTarget[] = [];
  for (const armed of targets) {
    if (armed.controllerPlayerId !== player.id) {
      kept.push(armed);
      continue;
    }
    if (armed.round < state.round) continue;
    if (armed.round !== state.round) {
      kept.push(armed);
      continue;
    }
    if (player.defeated || BATTLEFIELDS.has(armed.locationId)) continue;
    const target = state.players[armed.targetPlayerId];
    if (!target || target.eliminated || target.locationId !== armed.locationId) continue;
    const power = calculateCombatPower(state, target, definitions, armed.locationId);
    const fetch = createFetch(state, player.id, target.id, power, armed.locationId);
    if (fetch) created.push(fetch);
  }
  writePartTargets(state, kept);
  return created;
}

/** Part Collector arms any number of same-location opponents and materializes each Fetch at that location's power settlement. */
export const useBaobhanPartCollector: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("BAOBHAN_PART_COLLECTOR_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "combat.resolved") return settlePartCollectorCombat(state, player, event);
  if (eventType === "combat.ending") return settlePartCollectorEnding(state, player, definitions);

  if (data.abilityId !== PART_COLLECTOR_ABILITY || state.phase !== "combat" || state.activePlayerId !== player.id
    || !findActiveOwnedSkill(state, player, BAOBHAN_PART_COLLECTOR_ID, definitions)) {
    throw new Error("BAOBHAN_PART_COLLECTOR_WINDOW_INVALID");
  }
  const candidates = getBaobhanPartCollectorCandidates(state, player.id);
  if (candidates.length === 0) throw new Error("BAOBHAN_PART_COLLECTOR_NO_TARGET");
  openPartCollectorDecision(state, player, candidates, openDecision);
  return { pending: true, candidatePlayerIds: candidates };
};

export const resolveBaobhanPartCollector: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("BAOBHAN_PART_COLLECTOR_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((value): value is string => typeof value === "string") : [];
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((value): value is string => typeof value === "string") : [];
  const locationId = typeof previous.locationId === "string" ? previous.locationId : undefined;
  if (previous.stage !== "targets" || decision.status !== "resolved" || !locationId
    || new Set(selections).size !== selections.length || selections.some((id) => !candidates.includes(id))) {
    throw new Error("BAOBHAN_PART_COLLECTOR_DECISION_INVALID");
  }
  if (player.locationId !== locationId) throw new Error("BAOBHAN_PART_COLLECTOR_LOCATION_CHANGED");
  const legalNow = new Set(getBaobhanPartCollectorCandidates(state, player.id));
  if (selections.some((id) => !legalNow.has(id))) throw new Error("BAOBHAN_PART_COLLECTOR_TARGET_INVALID");
  const existing = readPartTargets(state).filter((target) => !(target.controllerPlayerId === player.id && target.round === state.round));
  const armed = selections.map((targetPlayerId) => ({ controllerPlayerId: player.id, targetPlayerId, locationId, round: state.round }));
  writePartTargets(state, [...existing, ...armed]);
  return { armedTargetPlayerIds: selections };
};

export const isBaobhanPartCollectorLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && !player.eliminated && definitions && ability?.id === PART_COLLECTOR_ABILITY
    && state.phase === "combat" && state.activePlayerId === playerId
    && findActiveOwnedSkill(state, player, BAOBHAN_PART_COLLECTOR_ID, definitions)
    && getBaobhanPartCollectorCandidates(state, playerId).length > 0);
};

function availableFailnaughtFetches(state: GameState, playerId: string): BaobhanFetch[] {
  return readFetches(state).filter((fetch) => fetch.controllerPlayerId === playerId && fetch.removeAtRoundEndRound !== state.round);
}

function openFailnaughtDecision(
  state: GameState,
  player: PlayerState,
  candidates: BaobhanFetch[],
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${BAOBHAN_FETCH_FAILNAUGHT_ID}:fetch`;
  state.effectQueue.unshift({
    effectId,
    handlerId: BAOBHAN_FETCH_FAILNAUGHT_RESOLVE,
    sourceId: BAOBHAN_FETCH_FAILNAUGHT_ID,
    controllerPlayerId: player.id,
    payload: { stage: "fetch", candidateFetchIds: candidates.map((fetch) => fetch.id) },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "baobhan-fetch-failnaught-target",
    options: candidates.map((fetch) => ({ id: fetch.id, label: state.players[fetch.targetPlayerId]?.name ?? fetch.targetPlayerId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function settleFailnaughtCombat(
  state: GameState,
  player: PlayerState,
  event: Record<string, unknown>,
  definitions: Record<string, CardDefinition>,
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
) {
  const powers = isRecord(event.powers) ? event.powers : {};
  const ownerPower = powers[player.id];
  if (!Number.isFinite(ownerPower)) return undefined;
  const armed = readFailnaughtTargets(state).find((target) => target.controllerPlayerId === player.id && target.round === state.round);
  if (!armed) return undefined;
  const fetch = readFetches(state).find((candidate) => candidate.id === armed.fetchId && candidate.controllerPlayerId === player.id);
  writeFailnaughtTargets(state, readFailnaughtTargets(state)
    .filter((target) => !(target.controllerPlayerId === player.id && target.round === state.round)));
  if (!fetch) return undefined;
  const exceeded = Number(ownerPower) > fetch.power;
  const result = exceeded
    ? applyDefeatEffect(state, fetch.targetPlayerId, player.id, definitions, emitEvent, { sourceId: BAOBHAN_FETCH_FAILNAUGHT_ID, reason: "fetch-failnaught", fetchId: fetch.id })
    : undefined;
  return { fetchId: fetch.id, targetPlayerId: fetch.targetPlayerId, ownerPower: Number(ownerPower), fetchPower: fetch.power, exceeded, defeat: result };
}

function cleanupFailnaughtFetches(state: GameState, player: PlayerState): string[] {
  const fetches = readFetches(state);
  const removed = fetches.filter((fetch) => fetch.controllerPlayerId === player.id
    && Number(fetch.removeAtRoundEndRound ?? Number.POSITIVE_INFINITY) <= state.round).map((fetch) => fetch.id);
  writeFetches(state, fetches.filter((fetch) => !removed.includes(fetch.id)));
  writeFailnaughtTargets(state, readFailnaughtTargets(state).filter((target) => !(target.controllerPlayerId === player.id && target.round <= state.round)));
  return removed;
}

/** Fetch Failnaught selects exactly one stored Fetch, compares it to Baobhan Sith's own resolved combat power, then removes that Fetch at round end. */
export const useBaobhanFetchFailnaught: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions) throw new Error("BAOBHAN_FETCH_FAILNAUGHT_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "combat.resolved") return settleFailnaughtCombat(state, player, event, definitions, emitEvent);
  if (eventType === "round.ending") return { removedFetchIds: cleanupFailnaughtFetches(state, player) };

  if (data.abilityId !== FETCH_FAILNAUGHT_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id
    || !findActiveOwnedSkill(state, player, BAOBHAN_FETCH_FAILNAUGHT_ID, definitions)) {
    throw new Error("BAOBHAN_FETCH_FAILNAUGHT_WINDOW_INVALID");
  }
  const candidates = availableFailnaughtFetches(state, player.id);
  if (candidates.length === 0) throw new Error("BAOBHAN_FETCH_FAILNAUGHT_NO_FETCH");
  openFailnaughtDecision(state, player, candidates, openDecision);
  return { pending: true, candidateFetchIds: candidates.map((fetch) => fetch.id) };
};

export const resolveBaobhanFetchFailnaught: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("BAOBHAN_FETCH_FAILNAUGHT_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((value): value is string => typeof value === "string") : [];
  const candidates = Array.isArray(previous.candidateFetchIds) ? previous.candidateFetchIds.filter((value): value is string => typeof value === "string") : [];
  if (previous.stage !== "fetch" || decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) {
    throw new Error("BAOBHAN_FETCH_FAILNAUGHT_DECISION_INVALID");
  }
  const selectedId = selections[0];
  const fetches = readFetches(state);
  const selected = fetches.find((fetch) => fetch.id === selectedId && fetch.controllerPlayerId === player.id);
  if (!selected || selected.removeAtRoundEndRound === state.round) throw new Error("BAOBHAN_FETCH_FAILNAUGHT_FETCH_INVALID");
  selected.revealedRound = state.round;
  selected.removeAtRoundEndRound = state.round;
  writeFetches(state, fetches);
  const existing = readFailnaughtTargets(state).filter((target) => !(target.controllerPlayerId === player.id && target.round === state.round));
  writeFailnaughtTargets(state, [...existing, { controllerPlayerId: player.id, fetchId: selected.id, round: state.round }]);
  return { fetchId: selected.id, targetPlayerId: selected.targetPlayerId, fetchPower: selected.power };
};

export const isBaobhanFetchFailnaughtLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && !player.eliminated && definitions && ability?.id === FETCH_FAILNAUGHT_ABILITY
    && state.phase === "action" && state.activePlayerId === playerId
    && findActiveOwnedSkill(state, player, BAOBHAN_FETCH_FAILNAUGHT_ID, definitions)
    && availableFailnaughtFetches(state, playerId).length > 0);
};
