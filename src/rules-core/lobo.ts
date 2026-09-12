import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { addCardToAttack, joinOwnedCardToAttack } from "./card-play.ts";
import { closePlayerCard, movePlayerCard } from "./decks.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { movePlayerByEffect, movePlayerOneSpaceByEffect } from "./board.ts";
import { adjustVictoryPoints } from "./resources.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";

export const LOBO_FROSTES_ID = "servant.lobo.skill.sc-lobo-1";
export const LOBO_FROSTES_HANDLER = "core.lobo-frostes-henker";
export const LOBO_HOWL_ID = "servant.lobo.skill.sc-lobo-2";
export const LOBO_HOWL_HANDLER = "core.lobo-ghastly-howl";
export const LOBO_HOWL_RESOLVE = "core.lobo-ghastly-howl-resolve";
export const LOBO_OBLIVION_ID = "servant.lobo.skill.sc-lobo-3";
export const LOBO_OBLIVION_HANDLER = "core.lobo-oblivion-correction";
export const LOBO_OBLIVION_RESOLVE = "core.lobo-oblivion-correction-resolve";

const LOCATION_ORDER = ["workshop", "mountain", "city", "scouting"] as const;
const AVENGER_ID = "card.card-avenger";
const LUCK_ID = "card.cardluck";
const QUICK_MARCH_ID = "card.cardsurveil";
const QUICK_MARCH_ABILITY = "basic.quick-march";

type LoboHaunt = { controllerPlayerId: string; targetPlayerId: string; sourceSkillId: string; round: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function linkedTo(definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(definition && (definition.id === skillId || definition.linkedSkillId === skillId));
}

function ownedSkillCard(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return [...player.servantSkills, ...player.attack]
    .map((instanceId) => state.cards[instanceId])
    .find((card) => card?.ownerPlayerId === player.id && linkedTo(card ? definitions[card.definitionId] : undefined, skillId));
}

function activeSkillAttack(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card?.ownerPlayerId === player.id && card.active && card.face === "up" && linkedTo(definition, skillId));
  });
}

function readHaunts(state: GameState): LoboHaunt[] {
  const raw = state.modeState.loboHaunts;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is LoboHaunt => Boolean(item) && typeof item === "object"
    && typeof (item as LoboHaunt).controllerPlayerId === "string"
    && typeof (item as LoboHaunt).targetPlayerId === "string"
    && typeof (item as LoboHaunt).sourceSkillId === "string"
    && Number.isInteger((item as LoboHaunt).round));
}

function writeHaunts(state: GameState, haunts: LoboHaunt[]): void {
  state.modeState = { ...state.modeState, loboHaunts: haunts.map((haunt) => ({ ...haunt })) };
}

function hauntPlayer(state: GameState, controllerPlayerId: string, targetPlayerId: string): void {
  const rest = readHaunts(state).filter((item) => !(item.controllerPlayerId === controllerPlayerId
    && item.targetPlayerId === targetPlayerId && item.round === state.round));
  writeHaunts(state, [...rest, { controllerPlayerId, targetPlayerId, sourceSkillId: LOBO_HOWL_ID, round: state.round }]);
}

function participantsAtControllerLocation(state: GameState, player: PlayerState): string[] {
  return player.locationId ? (state.board.locations[player.locationId] ?? []).filter((id) => !state.players[id]?.eliminated) : [];
}

function frostesAvengers(state: GameState, player: PlayerState): string[] {
  return [...player.hand, ...player.attack].filter((instanceId) => {
    const card = state.cards[instanceId];
    return card?.ownerPlayerId === player.id && card.definitionId === AVENGER_ID;
  });
}

function frostesEffectOptions(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  const participantIds = new Set(participantsAtControllerLocation(state, player));
  const lucks = Object.values(state.cards).filter((card) => {
    const controllerId = card.controllerPlayerId ?? card.ownerPlayerId;
    return card.definitionId === LUCK_ID && card.zone === "attack" && card.active && card.face === "up"
      && Boolean(controllerId && participantIds.has(controllerId));
  });
  const players = [...participantIds].filter((id) => !state.players[id]?.eliminated);
  return [
    ...lucks.map((card) => ({ id: `close:${card.instanceId}`, label: definitions[card.definitionId]?.name ?? "Luck" })),
    ...players.map((id) => ({ id: `defeat:${id}`, label: state.players[id]?.name ?? id })),
  ];
}

function openFrostesDiscard(state: GameState, player: PlayerState, candidates: string[], openDecision: SkillContext["openDecision"]): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${LOBO_FROSTES_ID}:discard`;
  state.effectQueue.unshift({ effectId, handlerId: LOBO_HOWL_RESOLVE, sourceId: LOBO_FROSTES_ID, controllerPlayerId: player.id,
    payload: { stage: "frostes-discard", candidates }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "lobo-frostes-discard-avengers",
    options: candidates.map((id) => ({ id, label: "复仇者" })), min: 0, max: Math.min(2, candidates.length), allowCancel: true,
    continuationEffectId: effectId, submissions: {} });
}

export const useLoboFrostesHenker: SkillHandler = ({ state, player, definitions, openDecision }) => {
  if (!definitions || state.phase !== "combat" || state.activePlayerId !== player.id
    || !activeSkillAttack(state, player, LOBO_FROSTES_ID, definitions)
    || !activeSkillAttack(state, player, LOBO_HOWL_ID, definitions)) throw new Error("LOBO_FROSTES_WINDOW_INVALID");
  const candidates = frostesAvengers(state, player);
  if (candidates.length === 0) return { discardedAvengers: 0, resolvedEffects: [] };
  openFrostesDiscard(state, player, candidates, openDecision);
  return { pending: true };
};

function adjacentLocations(locationId: string): string[] {
  const index = LOCATION_ORDER.indexOf(locationId as typeof LOCATION_ORDER[number]);
  if (index < 0) return [];
  return [index - 1, index + 1].filter((i) => i >= 0 && i < LOCATION_ORDER.length).map((i) => LOCATION_ORDER[i]);
}

function legalHowlDestinations(state: GameState, targetPlayerId: string, definitions: Record<string, CardDefinition>): string[] {
  const player = state.players[targetPlayerId];
  if (!player?.locationId) return [];
  return adjacentLocations(player.locationId).filter((locationId) => {
    try {
      const draft = structuredClone(state);
      movePlayerByEffect(draft, targetPlayerId, locationId, definitions);
      return true;
    } catch { return false; }
  });
}

function continueHowlTargets(
  state: GameState,
  player: PlayerState,
  targetIds: string[],
  index: number,
  battlefieldId: string,
  movedAny: boolean,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): { complete: boolean; movedAny: boolean } {
  let cursor = index;
  while (cursor < targetIds.length) {
    const targetId = targetIds[cursor];
    const target = state.players[targetId];
    if (!target || target.eliminated || target.locationId !== battlefieldId) { cursor += 1; continue; }
    const destinations = legalHowlDestinations(state, targetId, definitions);
    const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${LOBO_HOWL_ID}:target:${cursor}`;
    state.effectQueue.unshift({ effectId, handlerId: LOBO_HOWL_RESOLVE, sourceId: LOBO_HOWL_ID, controllerPlayerId: player.id,
      payload: { stage: "howl-target", targetIds, index: cursor, battlefieldId, movedAny, targetPlayerId: targetId, destinations }, createdAtRevision: state.revision });
    openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: targetId, chooserPlayerIds: [targetId], kind: "lobo-ghastly-howl-choice",
      options: [{ id: "haunt", label: "被死缠" }, ...destinations.map((id) => ({ id: `move:${id}`, label: id }))], min: 1, max: 1, allowCancel: false,
      continuationEffectId: effectId, submissions: {} });
    return { complete: false, movedAny };
  }
  if (movedAny) {
    const source = ownedSkillCard(state, player, LOBO_HOWL_ID, definitions);
    if (source && source.zone === "servant-skills") joinOwnedCardToAttack(state, player.id, source.instanceId, definitions, { allowedSourceZones: ["servant-skills"] });
  }
  return { complete: true, movedAny };
}

export const useLoboGhastlyHowl: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("LOBO_HOWL_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "player.defeated") {
    const targetId = typeof event.playerId === "string" ? event.playerId : undefined;
    if (!targetId) return;
    const matching = readHaunts(state).filter((item) => item.controllerPlayerId === player.id && item.targetPlayerId === targetId && item.round === state.round);
    if (matching.length > 0) adjustVictoryPoints(state.players[targetId], -3);
    return { targetPlayerId: targetId, lostVictoryPoints: matching.length > 0 ? 3 : 0 };
  }
  if (eventType === "round.ending") {
    writeHaunts(state, readHaunts(state).filter((item) => item.round > state.round));
    return { cleaned: true };
  }
  if (data.abilityId !== "ghastly-howl" || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("LOBO_HOWL_WINDOW_INVALID");
  const battlefieldIds = ["mountain", "city"] as const;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${LOBO_HOWL_ID}:battlefield`;
  state.effectQueue.unshift({ effectId, handlerId: LOBO_HOWL_RESOLVE, sourceId: LOBO_HOWL_ID, controllerPlayerId: player.id,
    payload: { stage: "howl-battlefield", battlefieldIds }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "lobo-ghastly-howl-battlefield",
    options: battlefieldIds.map((id) => ({ id, label: id })), min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
  return { pending: true };
};

function movementDirection(previousLocationId: string, locationId: string): "forward" | "backward" | undefined {
  const previous = LOCATION_ORDER.indexOf(previousLocationId as typeof LOCATION_ORDER[number]);
  const current = LOCATION_ORDER.indexOf(locationId as typeof LOCATION_ORDER[number]);
  if (previous < 0 || current < 0 || previous === current) return undefined;
  return current > previous ? "forward" : "backward";
}

function canFollowMovement(state: GameState, player: PlayerState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>) {
  const moverId = typeof event.playerId === "string" ? event.playerId : undefined;
  const previousLocationId = typeof event.previousLocationId === "string" ? event.previousLocationId : undefined;
  const locationId = typeof event.locationId === "string" ? event.locationId : undefined;
  if (!moverId || moverId === player.id || !previousLocationId || !locationId || !player.locationId || state.players[moverId]?.eliminated) return undefined;
  // Wiki ruling: no trigger if the opponent moved onto Lobo.
  if (locationId === player.locationId) return undefined;
  const direction = movementDirection(previousLocationId, locationId);
  if (!direction) return undefined;
  try {
    const draft = structuredClone(state);
    const movement = movePlayerOneSpaceByEffect(draft, player.id, direction, definitions, { ignoreDestinationCapacity: true });
    return { moverId, direction, targetLocationId: movement.locationId };
  } catch { return undefined; }
}

function eligibleOblivionAttacks(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.cardType === "attack" && getPrintedCardBasePower(state, player, definition) <= 3);
  });
}

export const useLoboOblivionCorrection: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("LOBO_OBLIVION_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType !== "player.moved" || !isRecord(data.event)) return;
  const follow = canFollowMovement(state, player, data.event, definitions);
  if (!follow) return;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${LOBO_OBLIVION_ID}:follow`;
  state.effectQueue.unshift({ effectId, handlerId: LOBO_OBLIVION_RESOLVE, sourceId: LOBO_OBLIVION_ID, controllerPlayerId: player.id,
    payload: { stage: "follow", ...follow }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "lobo-oblivion-follow",
    options: [{ id: "follow", label: "移动一步" }], min: 0, max: 1, allowCancel: true, continuationEffectId: effectId, submissions: {} });
};

function resolvedDecision(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("LOBO_DECISION_INVALID");
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved") throw new Error("LOBO_DECISION_INVALID");
  return { previous: payload.previous, selections };
}

export const resolveLoboDecision: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent, executeCardAbility }) => {
  if (!definitions) throw new Error("LOBO_DEFINITIONS_REQUIRED");
  const { previous, selections } = resolvedDecision(payload);
  if (previous.stage === "frostes-discard") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length > 2 || new Set(selections).size !== selections.length || selections.some((id) => !candidates.includes(id) || !frostesAvengers(state, player).includes(id))) throw new Error("LOBO_FROSTES_DISCARD_INVALID");
    if (selections.length === 0) return { discardedAvengers: 0, resolvedEffects: [] };
    for (const instanceId of selections) movePlayerCard(state, player.id, instanceId, "discard");
    const options = frostesEffectOptions(state, player, definitions);
    if (options.length < selections.length) throw new Error("LOBO_FROSTES_TARGETS_UNAVAILABLE");
    const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${LOBO_FROSTES_ID}:effects`;
    state.effectQueue.unshift({ effectId, handlerId: LOBO_HOWL_RESOLVE, sourceId: LOBO_FROSTES_ID, controllerPlayerId: player.id,
      payload: { stage: "frostes-effects", count: selections.length }, createdAtRevision: state.revision });
    openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "lobo-frostes-effects",
      options, min: selections.length, max: selections.length, allowCancel: false, continuationEffectId: effectId, submissions: {} });
    return;
  }
  if (previous.stage === "frostes-effects") {
    const count = Number(previous.count);
    if (!Number.isInteger(count) || selections.length !== count || new Set(selections).size !== selections.length) throw new Error("LOBO_FROSTES_EFFECTS_INVALID");
    for (const selection of selections) {
      const [kind, id] = selection.split(":", 2);
      if (kind === "close") {
        const card = state.cards[id];
        const controllerId = card?.controllerPlayerId ?? card?.ownerPlayerId;
        if (!card || card.definitionId !== LUCK_ID || card.zone !== "attack" || !card.active || !controllerId
          || !participantsAtControllerLocation(state, player).includes(controllerId)) throw new Error("LOBO_FROSTES_LUCK_INVALID");
        closePlayerCard(state, controllerId, id, definitions, { closedByPlayerId: player.id });
      } else if (kind === "defeat") {
        if (!participantsAtControllerLocation(state, player).includes(id)) throw new Error("LOBO_FROSTES_PLAYER_INVALID");
        applyDefeatEffect(state, id, player.id, definitions, emitEvent, { sourceId: LOBO_FROSTES_ID });
      } else throw new Error("LOBO_FROSTES_EFFECT_INVALID");
    }
    return { resolvedEffects: selections };
  }
  if (previous.stage === "howl-battlefield") {
    const battlefieldIds = Array.isArray(previous.battlefieldIds) ? previous.battlefieldIds.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !battlefieldIds.includes(selections[0])) throw new Error("LOBO_HOWL_BATTLEFIELD_INVALID");
    const battlefieldId = selections[0];
    const targetIds = state.turnOrder.filter((id) => id !== player.id && !state.players[id]?.eliminated && state.players[id]?.locationId === battlefieldId);
    return continueHowlTargets(state, player, targetIds, 0, battlefieldId, false, definitions, openDecision);
  }
  if (previous.stage === "howl-target") {
    const targetIds = Array.isArray(previous.targetIds) ? previous.targetIds.filter((id): id is string => typeof id === "string") : [];
    const index = Number(previous.index);
    const battlefieldId = typeof previous.battlefieldId === "string" ? previous.battlefieldId : undefined;
    const targetId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
    const destinations = Array.isArray(previous.destinations) ? previous.destinations.filter((id): id is string => typeof id === "string") : [];
    if (!battlefieldId || !targetId || !Number.isInteger(index) || selections.length !== 1) throw new Error("LOBO_HOWL_CHOICE_INVALID");
    let movedAny = previous.movedAny === true;
    if (selections[0] === "haunt") hauntPlayer(state, player.id, targetId);
    else if (selections[0].startsWith("move:")) {
      const destination = selections[0].slice(5);
      if (!destinations.includes(destination)) throw new Error("LOBO_HOWL_DESTINATION_INVALID");
      const movement = movePlayerByEffect(state, targetId, destination, definitions);
      emitEvent?.("player.moved", { playerId: targetId, ...movement, sourceId: LOBO_HOWL_ID });
      emitEvent?.("player.entered-location", { playerId: targetId, ...movement, method: "effect", sourceId: LOBO_HOWL_ID });
      movedAny = true;
    } else throw new Error("LOBO_HOWL_CHOICE_INVALID");
    return continueHowlTargets(state, player, targetIds, index + 1, battlefieldId, movedAny, definitions, openDecision);
  }
  if (previous.stage === "follow") {
    if (selections.length === 0) return { followed: false };
    if (selections.length !== 1 || selections[0] !== "follow") throw new Error("LOBO_OBLIVION_FOLLOW_INVALID");
    const direction = previous.direction === "forward" || previous.direction === "backward" ? previous.direction : undefined;
    if (!direction) throw new Error("LOBO_OBLIVION_DIRECTION_INVALID");
    const movement = movePlayerOneSpaceByEffect(state, player.id, direction, definitions, { ignoreDestinationCapacity: true });
    emitEvent?.("player.moved", { playerId: player.id, ...movement, sourceId: LOBO_OBLIVION_ID });
    emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect", sourceId: LOBO_OBLIVION_ID });
    const candidates = eligibleOblivionAttacks(state, player, definitions);
    if (candidates.length === 0) return { followed: true, playedInstanceId: null };
    const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${LOBO_OBLIVION_ID}:attack`;
    state.effectQueue.unshift({ effectId, handlerId: LOBO_OBLIVION_RESOLVE, sourceId: LOBO_OBLIVION_ID, controllerPlayerId: player.id,
      payload: { stage: "attack", candidates }, createdAtRevision: state.revision });
    openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "lobo-oblivion-attack",
      options: candidates.map((id) => ({ id, label: definitions[state.cards[id]?.definitionId ?? ""]?.name ?? id })), min: 0, max: 1, allowCancel: true,
      continuationEffectId: effectId, submissions: {} });
    return;
  }
  if (previous.stage === "attack") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length === 0) return { playedInstanceId: null };
    if (selections.length !== 1 || !candidates.includes(selections[0]) || !eligibleOblivionAttacks(state, player, definitions).includes(selections[0])) throw new Error("LOBO_OBLIVION_ATTACK_INVALID");
    const instanceId = selections[0];
    const definition = definitions[state.cards[instanceId].definitionId];
    const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, { payCost: true, allowedSourceZones: ["hand"], bypassTiming: true, bypassFaceUpPlayLimit: true });
    emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana,
      attributes: getCardInstanceAttributes(state.cards[instanceId], definition, state, definitions), method: "lobo-oblivion" });
    if (definition.id !== QUICK_MARCH_ID) return { playedInstanceId: instanceId, paidMana };
    const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${LOBO_OBLIVION_ID}:quick-march`;
    state.effectQueue.unshift({ effectId, handlerId: LOBO_OBLIVION_RESOLVE, sourceId: LOBO_OBLIVION_ID, controllerPlayerId: player.id,
      payload: { stage: "quick-march", instanceId }, createdAtRevision: state.revision });
    openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "lobo-oblivion-use-quick-march",
      options: [{ id: "use", label: "使用疾行" }], min: 0, max: 1, allowCancel: true, continuationEffectId: effectId, submissions: {} });
    return;
  }
  if (previous.stage === "quick-march") {
    const instanceId = typeof previous.instanceId === "string" ? previous.instanceId : undefined;
    if (!instanceId || state.cards[instanceId]?.definitionId !== QUICK_MARCH_ID || state.cards[instanceId]?.zone !== "attack") throw new Error("LOBO_OBLIVION_QUICK_MARCH_INVALID");
    if (selections.length === 0) return { usedQuickMarch: false };
    if (selections.length !== 1 || selections[0] !== "use") throw new Error("LOBO_OBLIVION_QUICK_MARCH_INVALID");
    if (!player.locationId) throw new Error("LOBO_OBLIVION_LOCATION_INVALID");
    const currentIndex = LOCATION_ORDER.indexOf(player.locationId as typeof LOCATION_ORDER[number]);
    const destinations = [currentIndex - 1, currentIndex + 1].filter((i) => i >= 0 && i < LOCATION_ORDER.length).map((i) => LOCATION_ORDER[i]);
    const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${LOBO_OBLIVION_ID}:quick-destination`;
    state.effectQueue.unshift({ effectId, handlerId: LOBO_OBLIVION_RESOLVE, sourceId: LOBO_OBLIVION_ID, controllerPlayerId: player.id,
      payload: { stage: "quick-destination", instanceId, destinations }, createdAtRevision: state.revision });
    openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "lobo-oblivion-quick-march-destination",
      options: destinations.map((id) => ({ id, label: id })), min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
    return;
  }
  if (previous.stage === "quick-destination") {
    const instanceId = typeof previous.instanceId === "string" ? previous.instanceId : undefined;
    const destinations = Array.isArray(previous.destinations) ? previous.destinations.filter((id): id is string => typeof id === "string") : [];
    if (!instanceId || selections.length !== 1 || !destinations.includes(selections[0]) || !executeCardAbility) throw new Error("LOBO_OBLIVION_QUICK_MARCH_INVALID");
    executeCardAbility(instanceId, QUICK_MARCH_ABILITY, selections[0], { timingOverride: true });
    return { usedQuickMarch: true, destination: selections[0] };
  }
  throw new Error("LOBO_DECISION_STAGE_INVALID");
};

export const isLoboFrostesLegal: SkillLegalityPredicate = (state, playerId, _skill, _ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && state.phase === "combat" && state.activePlayerId === playerId
    && activeSkillAttack(state, player, LOBO_FROSTES_ID, definitions) && activeSkillAttack(state, player, LOBO_HOWL_ID, definitions));
};

export const isLoboHowlLegal: SkillLegalityPredicate = (state, playerId) => {
  const player = state.players[playerId];
  return Boolean(player && state.phase === "action" && state.activePlayerId === playerId);
};
