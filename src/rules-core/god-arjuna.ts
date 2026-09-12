import type { GameState } from "../domain/state/types.ts";
import { getStructuredCardName } from "./card-transforms.ts";
import type { CardDefinition } from "./content-types.ts";
import { defeatPlayerByEffect } from "./defeat.ts";
import { isStructuredDefeatIgnored } from "./rule-modifiers.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const GOD_ARJUNA_SUPREME_ID = "servant.arjuna.skill.sc-arjuna-1";
export const GOD_ARJUNA_RESET_ID = "servant.arjuna.skill.sc-arjuna-2";
export const GOD_ARJUNA_JUDGMENT_ID = "servant.arjuna.skill.sc-arjuna-3";
export const GOD_ARJUNA_RESET_HANDLER = "core.god-arjuna-world-reset";
export const GOD_ARJUNA_RESET_RESOLVE = "core.god-arjuna-world-reset-resolve";
export const GOD_ARJUNA_JUDGMENT_HANDLER = "core.god-arjuna-imperfection-is-sin";
export const GOD_ARJUNA_JUDGMENT_ARMED_FLAG = "godArjunaJudgmentArmedRound";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findActiveSource(state: GameState, playerId: string, definitionId: string) {
  return state.players[playerId]?.attack.map((id) => state.cards[id]).find((card) => card?.definitionId === definitionId
    && card.ownerPlayerId === playerId && card.controllerPlayerId === playerId && card.zone === "attack" && card.face === "up" && card.active);
}

function currentRoundEventIds(state: GameState): string[] {
  return [...new Set([...(state.board.currentEvents.mountain ?? []), ...(state.board.currentEvents.city ?? [])])];
}

function openResetDecision(state: GameState, playerId: string, sourceId: string, stage: string, previous: Record<string, unknown>, options: Array<{ id: string; label: string }>, openDecision: Parameters<SkillHandler>[0]["openDecision"]): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${playerId}:${sourceId}:world-reset:${stage}`;
  state.effectQueue.unshift({ effectId, handlerId: GOD_ARJUNA_RESET_RESOLVE, sourceId, controllerPlayerId: playerId, payload: { stage, ...previous }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: playerId, chooserPlayerIds: [playerId], kind: `god-arjuna-world-reset-${stage}`, options, min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
}

/** World Reset schedules one current-round event and an optional skill return for next Prep. */
export const useGodArjunaWorldReset: SkillHandler = ({ state, player, skill, openDecision, definitions }) => {
  if (!definitions) throw new Error("GOD_ARJUNA_RESET_DEFINITIONS_REQUIRED");
  if (state.phase !== "action" || state.activePlayerId !== player.id || !findActiveSource(state, player.id, skill.id)) throw new Error("GOD_ARJUNA_RESET_WINDOW_INVALID");
  const events = currentRoundEventIds(state);
  if (events.length === 0) throw new Error("GOD_ARJUNA_RESET_EVENT_REQUIRED");
  openResetDecision(state, player.id, skill.id, "event", { eventIds: events }, events.map((eventId) => ({ id: eventId, label: definitions[eventId]?.name ?? eventId })), openDecision);
};

export const resolveGodArjunaWorldReset: SkillHandler = ({ state, player, skill, payload, openDecision, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("GOD_ARJUNA_RESET_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error("GOD_ARJUNA_RESET_DECISION_INVALID");
  const stage = previous.stage;
  if (stage === "event") {
    const candidates = Array.isArray(previous.eventIds) ? previous.eventIds.filter((id): id is string => typeof id === "string") : [];
    const eventId = selections[0];
    if (!candidates.includes(eventId) || !currentRoundEventIds(state).includes(eventId)) throw new Error("GOD_ARJUNA_RESET_EVENT_INVALID");
    openResetDecision(state, player.id, skill.id, "location", { eventId }, [{ id: "mountain", label: "深山町" }, { id: "city", label: "新都" }], openDecision);
    return;
  }
  if (stage === "location") {
    const eventId = typeof previous.eventId === "string" ? previous.eventId : undefined;
    const locationId = selections[0];
    if (!eventId || (locationId !== "mountain" && locationId !== "city")) throw new Error("GOD_ARJUNA_RESET_LOCATION_INVALID");
    const options = [{ id: "none", label: "不返回技能" }];
    for (const definitionId of [GOD_ARJUNA_SUPREME_ID, GOD_ARJUNA_RESET_ID, GOD_ARJUNA_JUDGMENT_ID]) {
      if (Object.values(state.cards).some((card) => card.ownerPlayerId === player.id && card.definitionId === definitionId)) {
        options.push({ id: definitionId, label: definitions[definitionId]?.name ?? definitionId });
      }
    }
    openResetDecision(state, player.id, skill.id, "return", { eventId, locationId }, options, openDecision);
    return;
  }
  if (stage !== "return") throw new Error("GOD_ARJUNA_RESET_STAGE_INVALID");
  const eventId = typeof previous.eventId === "string" ? previous.eventId : undefined;
  const locationId = previous.locationId;
  const returnDefinitionId = selections[0];
  if (!eventId || (locationId !== "mountain" && locationId !== "city")) throw new Error("GOD_ARJUNA_RESET_FINAL_INVALID");
  if (returnDefinitionId !== "none" && ![GOD_ARJUNA_SUPREME_ID, GOD_ARJUNA_RESET_ID, GOD_ARJUNA_JUDGMENT_ID].includes(returnDefinitionId)) throw new Error("GOD_ARJUNA_RESET_RETURN_INVALID");
  const placements = Array.isArray(state.modeState.pendingRoundEventPlacements) ? state.modeState.pendingRoundEventPlacements : [];
  placements.push({ targetRound: state.round + 1, eventId, locationId, sourceId: skill.id, controllerPlayerId: player.id });
  state.modeState.pendingRoundEventPlacements = placements;
  if (returnDefinitionId !== "none") {
    const returns = Array.isArray(state.modeState.pendingRoundCardReturns) ? state.modeState.pendingRoundCardReturns : [];
    returns.push({ targetRound: state.round + 1, playerId: player.id, definitionId: returnDefinitionId, destination: "servant-skills", sourceId: skill.id });
    state.modeState.pendingRoundCardReturns = returns;
  }
  return { eventId, locationId, returnDefinitionId: returnDefinitionId === "none" ? null : returnDefinitionId };
};

export const isGodArjunaWorldResetLegal: SkillLegalityPredicate = (state, playerId, skill) => Boolean(state.phase === "action" && state.activePlayerId === playerId
  && findActiveSource(state, playerId, skill.id) && currentRoundEventIds(state).length > 0);

function isFlawedByGodArjuna(player: GameState["players"][string]): boolean {
  return player.statuses.some((status) => status.startsWith("flawed:"));
}

function controlsActiveLuck(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): boolean {
  const player = state.players[playerId];
  return Boolean(player && player.attack.some((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.active && card.face === "up" && card.controllerPlayerId === playerId
      && getStructuredCardName(state, playerId, definition, definitions) === "幸运");
  }));
}

/** Imperfection is Sin is armed in Action and resolves once when Combat begins. */
export const useGodArjunaImperfectionIsSin: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("GOD_ARJUNA_JUDGMENT_DEFINITIONS_REQUIRED");
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "phase.transitioned") {
    const event = isRecord(payload) && isRecord(payload.event) ? payload.event : {};
    if (event.previousPhase !== "action" || state.phase !== "combat" || Number(player.flags[GOD_ARJUNA_JUDGMENT_ARMED_FLAG] ?? -1) !== state.round) return;
    const source = findActiveSource(state, player.id, skill.id);
    if (!source) return;
    const locationId = player.locationId;
    if (locationId !== "mountain" && locationId !== "city") return;
    const targets = (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated && isFlawedByGodArjuna(state.players[id]));
    const luckControllers = targets.filter((id) => controlsActiveLuck(state, id, definitions));
    const modifierId = `${skill.id}:flawed-luck:${state.round}:${source.instanceId}`;
    source.powerModifiers = (source.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId);
    if (luckControllers.length > 0) source.powerModifiers.push({ id: modifierId, sourceId: skill.id, kind: "add", value: -5 * luckControllers.length, duration: "round" });
    for (const targetPlayerId of targets) {
      if (!isStructuredDefeatIgnored(state, targetPlayerId, definitions)) defeatPlayerByEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: skill.id, method: "imperfection-is-sin" });
    }
    return { targetPlayerIds: targets, luckControllerIds: luckControllers };
  }
  if (state.phase !== "action" || state.activePlayerId !== player.id || !findActiveSource(state, player.id, skill.id)) throw new Error("GOD_ARJUNA_JUDGMENT_WINDOW_INVALID");
  player.flags[GOD_ARJUNA_JUDGMENT_ARMED_FLAG] = state.round;
};

export const isGodArjunaImperfectionIsSinLegal: SkillLegalityPredicate = (state, playerId, skill) => Boolean(state.phase === "action" && state.activePlayerId === playerId
  && findActiveSource(state, playerId, skill.id));
