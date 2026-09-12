import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillAbilityDefinition, SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { closePlayerCard, createDerivedCardInstance, movePlayerCard, removePhysicalCardFromGame } from "./decks.ts";
import { getCardPlayCost, payManaCost } from "./costs.ts";
import { adjustVictoryPoints, gainVictoryPoints } from "./resources.ts";

export const AKASHA_HANDLER = "core.akasha-reincarnation";
export const AKASHA_RESOLVE = "core.akasha-reincarnation-resolve";
export const AKASHA_REINCARNATOR_ID = "master.akasha.skill.s1a";
export const AKASHA_REINCARNATION_ID = "master.akasha.skill.s2";
export const AKASHA_ROA_ID = "master.akasha.skill.s3";
export const AKASHA_ELESIA_ID = "master.akasha.skill.s4";
export const AKASHA_SHIKI_ID = "master.akasha.skill.s5";
export const AKASHA_OVERLOAD_ID = "master.akasha.skill.s6";
export const AKASHA_ASCENSION_ID = "master.akasha.skill.ascension";
export const AKASHA_SQUARE_ABILITY = "square";

const STATE_KEY = "akashaReincarnation";
const HIGH_POWER_MODIFIER = "akasha-high-power-circuits";
const SNAP_MODIFIER = "akasha-snap-eight-mana";
type Vessel = "roa" | "elesia" | "shiki";
const ALL_VESSELS: readonly Vessel[] = ["roa", "elesia", "shiki"];

interface AkashaState {
  ownerPlayerId: string;
  currentVessel: Vessel;
  incarnationVictoryPoints: number;
  pendingReincarnationRound?: number;
  incarnatedVessels: Vessel[];
  ultimate: boolean;
  serial: number;
  climaxOverloadRound?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function privateRulesState(state: GameState): Record<string, unknown> {
  const mode = state.modeState as Record<string, unknown>;
  if (!isRecord(mode.privateRulesState)) mode.privateRulesState = {};
  return mode.privateRulesState as Record<string, unknown>;
}

function getState(state: GameState, player: PlayerState): AkashaState {
  const rules = privateRulesState(state);
  const current = rules[STATE_KEY];
  if (isRecord(current) && current.ownerPlayerId === player.id && typeof current.currentVessel === "string") {
    return current as unknown as AkashaState;
  }
  const created: AkashaState = {
    ownerPlayerId: player.id,
    currentVessel: "roa",
    incarnationVictoryPoints: 0,
    incarnatedVessels: ["roa"],
    ultimate: false,
    serial: 0,
  };
  rules[STATE_KEY] = created as unknown as Record<string, unknown>;
  syncPublicState(state, created);
  return created;
}

function syncPublicState(state: GameState, data: AkashaState): void {
  const mode = state.modeState as Record<string, unknown>;
  if (!isRecord(mode.publicRulesState)) mode.publicRulesState = {};
  (mode.publicRulesState as Record<string, unknown>)[STATE_KEY] = {
    currentVessel: data.currentVessel,
    incarnatedVessels: [...data.incarnatedVessels],
    ultimate: data.ultimate,
    pendingReincarnationRound: data.pendingReincarnationRound ?? null,
  };
}

function isOverload(cardDefinition: CardDefinition | undefined): boolean {
  return cardDefinition?.id === AKASHA_OVERLOAD_ID || cardDefinition?.linkedSkillId === AKASHA_OVERLOAD_ID;
}

function controlledOverloads(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).filter((card) => card.controllerPlayerId === player.id
    && card.zone !== "removed" && card.zone !== "discard" && isOverload(definitions[card.definitionId]));
}

function activeOverloads(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).filter((card) => Boolean(card
    && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
    && isOverload(definitions[card.definitionId])));
}

function activeVessels(data: AkashaState): readonly Vessel[] {
  return data.ultimate ? ALL_VESSELS : [data.currentVessel];
}

function clearVesselModifiers(player: PlayerState): void {
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => ![HIGH_POWER_MODIFIER, SNAP_MODIFIER].includes(modifier.id));
  if (player.cardRuleModifiers.length === 0) delete player.cardRuleModifiers;
}

function syncVesselModifiers(state: GameState, player: PlayerState, data: AkashaState, definitions: Record<string, CardDefinition>): void {
  clearVesselModifiers(player);
  const vessels = activeVessels(data);
  if (vessels.includes("elesia") && controlledOverloads(state, player, definitions).length > 0) {
    player.cardRuleModifiers ??= [];
    player.cardRuleModifiers.push({
      id: HIGH_POWER_MODIFIER,
      sourceId: AKASHA_ELESIA_ID,
      targetDefinitionIds: Object.values(definitions).filter((definition) => definition.isSkill === true).map((definition) => definition.id),
      costAdd: -1,
      powerAdd: 1,
      duration: "game",
    });
  }
  if (vessels.includes("shiki")) {
    player.cardRuleModifiers ??= [];
    player.cardRuleModifiers.push({
      id: SNAP_MODIFIER,
      sourceId: AKASHA_SHIKI_ID,
      targetDefinitionIds: Object.values(definitions).filter(isOverload).map((definition) => definition.id),
      waiveEightMana: true,
      duration: "game",
    });
  }
}

function adjustedReincarnationPoints(data: AkashaState): number {
  if (data.currentVessel === "roa") return data.incarnationVictoryPoints * 2;
  if (data.currentVessel === "elesia") return Math.ceil(data.incarnationVictoryPoints / 2);
  return data.incarnationVictoryPoints;
}

function vesselForPoints(points: number): Vessel {
  if (points <= 5) return "roa";
  if (points <= 10) return "elesia";
  return "shiki";
}

function scheduleReincarnation(state: GameState, player: PlayerState, data: AkashaState): void {
  if (data.ultimate) return;
  const target = state.round + 1;
  if (data.pendingReincarnationRound === undefined || target < data.pendingReincarnationRound) data.pendingReincarnationRound = target;
  syncPublicState(state, data);
}

function removeTemporaryOverloads(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  const removed: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (card.ownerPlayerId !== player.id || card.temporary !== true || !isOverload(definitions[card.definitionId]) || card.zone === "removed") continue;
    removePhysicalCardFromGame(state, card.instanceId);
    removed.push(card.instanceId);
  }
  return removed;
}

function ownsAscension(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  return [...player.masterSkills, ...player.attack].some((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && (card.definitionId === AKASHA_ASCENSION_ID || definition?.linkedSkillId === AKASHA_ASCENSION_ID));
  });
}

function maybeActivateUltimate(state: GameState, player: PlayerState, data: AkashaState, definitions: Record<string, CardDefinition>): boolean {
  if (data.ultimate || !ownsAscension(state, player, definitions) || !ALL_VESSELS.every((vessel) => data.incarnatedVessels.includes(vessel))) return false;
  data.ultimate = true;
  delete data.pendingReincarnationRound;
  syncVesselModifiers(state, player, data, definitions);
  syncPublicState(state, data);
  return true;
}

function resolveReincarnation(state: GameState, player: PlayerState, data: AkashaState, definitions: Record<string, CardDefinition>) {
  if (data.ultimate || data.pendingReincarnationRound === undefined || data.pendingReincarnationRound > state.round) return;
  const countedVictoryPoints = adjustedReincarnationPoints(data);
  const previousVessel = data.currentVessel;
  const nextVessel = vesselForPoints(countedVictoryPoints);
  const sameVessel = nextVessel === previousVessel;
  data.currentVessel = nextVessel;
  data.incarnatedVessels = [...new Set([...data.incarnatedVessels, nextVessel])];
  data.incarnationVictoryPoints = 0;
  delete data.pendingReincarnationRound;
  const removedTemporaryOverloadIds = removeTemporaryOverloads(state, player, definitions);
  const victoryPointsLost = sameVessel ? -adjustVictoryPoints(player, -3) : 0;
  syncVesselModifiers(state, player, data, definitions);
  const ultimateActivated = maybeActivateUltimate(state, player, data, definitions);
  syncPublicState(state, data);
  return { previousVessel, nextVessel, countedVictoryPoints, sameVessel, victoryPointsLost, removedTemporaryOverloadIds, ultimateActivated };
}

function openDecision(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  stage: string,
  payload: Record<string, unknown>,
  options: PendingDecision["options"],
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({ effectId, handlerId: AKASHA_RESOLVE, sourceId, controllerPlayerId: player.id, payload: { stage, ...payload }, createdAtRevision: state.revision });
  decisionOpen({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: `akasha-${stage}`,
    options, min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
}

function beginBoiling(state: GameState, player: PlayerState, locationId: string, definitions: Record<string, CardDefinition>, decisionOpen: Parameters<SkillHandler>[0]["openDecision"]) {
  if (locationId !== "mountain" && locationId !== "city") return;
  const candidates = Object.values(state.cards).filter((card) => card.ownerPlayerId === player.id && card.zone === "board"
    && card.boardLocationId === locationId && isOverload(definitions[card.definitionId])).map((card) => card.instanceId);
  if (candidates.length === 0) return;
  openDecision(state, player, AKASHA_OVERLOAD_ID, "boiling", { candidates, locationId }, [
    { id: "join", label: "Add all Overloads" }, { id: "decline", label: "Leave them attached" },
  ], decisionOpen);
  return { pending: true, candidates };
}

function createTemporaryOverloadAt(state: GameState, player: PlayerState, data: AkashaState, definitionId: string, locationId: "mountain" | "city") {
  data.serial += 1;
  const instanceId = `${player.id}:akasha-overload:${data.serial}`;
  const card = createDerivedCardInstance(state, player.id, {
    instanceId, definitionId, originMasterId: "master.akasha", zone: "board", boardLocationId: locationId,
    face: "up", active: false, residual: false, temporary: true, temporaryCleanup: "explicit",
    sourceEffectId: AKASHA_OVERLOAD_ID, createdByPlayerId: player.id,
  });
  return card.instanceId;
}

function handleOverloadPlayed(state: GameState, player: PlayerState, data: AkashaState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>) {
  if (event.playerId !== player.id || typeof event.instanceId !== "string") return;
  const card = state.cards[event.instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !definition || !isOverload(definition) || card.zone !== "attack" || !card.active) return;
  const lowManaSnap = activeVessels(data).includes("shiki") && Number(player.flags.lastAttackCommitManaBefore ?? 8) < 8;
  if (lowManaSnap) {
    card.powerModifiers = [...(card.powerModifiers ?? []), { id: `akasha-snap:${state.round}:${card.instanceId}`, sourceId: AKASHA_SHIKI_ID, kind: "add", value: 3, duration: "round" }];
    return { snapped: true, instanceId: card.instanceId };
  }
  const locationId = player.locationId;
  closePlayerCard(state, player.id, card.instanceId, definitions);
  if (locationId !== "mountain" && locationId !== "city") return { snapped: false, closed: true };
  const createdInstanceId = createTemporaryOverloadAt(state, player, data, card.definitionId, locationId);
  syncVesselModifiers(state, player, data, definitions);
  return { snapped: false, closed: true, createdInstanceId, locationId };
}

function useSquare(state: GameState, player: PlayerState, data: AkashaState, definitions: Record<string, CardDefinition>) {
  if (!activeVessels(data).includes("shiki")) throw new Error("AKASHA_SHIKI_VESSEL_REQUIRED");
  const overloads = activeOverloads(state, player, definitions);
  if (overloads.length === 0) throw new Error("AKASHA_SQUARE_NO_OVERLOAD");
  const manaCost = overloads.reduce((sum, card) => sum + getCardPlayCost(state, definitions[card.definitionId], player, card, definitions), 0);
  payManaCost(state, player, manaCost, definitions);
  for (const card of overloads) {
    card.powerModifiers = [...(card.powerModifiers ?? []), { id: `akasha-square:${state.round}:${state.revision}:${card.instanceId}`, sourceId: AKASHA_SHIKI_ID, kind: "multiply", value: 2, duration: "round" }];
  }
  return { manaPaid: manaCost, doubledInstanceIds: overloads.map((card) => card.instanceId) };
}

export const useAkashaReincarnation: SkillHandler = ({ state, player, skill, payload, definitions, openDecision: decisionOpen }) => {
  if (!definitions) throw new Error("AKASHA_DEFINITIONS_REQUIRED");
  const body = isRecord(payload) ? payload : {};
  const eventType = typeof body.eventType === "string" ? body.eventType : undefined;
  const event = isRecord(body.event) ? body.event : {};
  const data = getState(state, player);

  if (skill.id === AKASHA_REINCARNATOR_ID) {
    if (eventType === "game.started") {
      syncVesselModifiers(state, player, data, definitions);
      syncPublicState(state, data);
      return { currentVessel: data.currentVessel };
    }
    if (eventType === "player.victory-points.changed" && event.playerId === player.id && Number(event.delta) > 0) {
      data.incarnationVictoryPoints += Number(event.delta);
      return { incarnationVictoryPoints: data.incarnationVictoryPoints };
    }
    if (eventType === "player.defeated" && event.playerId === player.id) {
      scheduleReincarnation(state, player, data);
      return { scheduledRound: data.pendingReincarnationRound };
    }
    if (eventType === "combat.resolved" && isRecord(event.powers) && Array.isArray(event.winnerIds)
      && Object.prototype.hasOwnProperty.call(event.powers, player.id) && !event.winnerIds.includes(player.id)) {
      const ownPower = Number(event.powers[player.id]);
      const winningPower = Math.max(...event.winnerIds.map((id) => Number((event.powers as Record<string, unknown>)[id])).filter(Number.isFinite));
      if (Number.isFinite(ownPower) && Number.isFinite(winningPower) && winningPower - ownPower >= 5) scheduleReincarnation(state, player, data);
      return { scheduledRound: data.pendingReincarnationRound };
    }
    return;
  }

  if (skill.id === AKASHA_REINCARNATION_ID && eventType === "round.started") return resolveReincarnation(state, player, data, definitions);

  if (skill.id === AKASHA_ROA_ID && eventType === "combat.resolved" && activeVessels(data).includes("roa") && event.scoutingPlayerId === player.id) {
    return { scoutingBonus: gainVictoryPoints(player, 1) };
  }

  if (skill.id === AKASHA_SHIKI_ID) {
    if (body.abilityId === AKASHA_SQUARE_ABILITY) return useSquare(state, player, data, definitions);
    if (eventType === "card.played") return handleOverloadPlayed(state, player, data, event, definitions);
  }

  if (skill.id === AKASHA_OVERLOAD_ID) {
    if (eventType === "player.deployed" && event.playerId === player.id && typeof event.locationId === "string") {
      return beginBoiling(state, player, event.locationId, definitions, decisionOpen);
    }
    if (eventType === "card.played") return handleOverloadPlayed(state, player, data, event, definitions);
  }

  if (skill.id === AKASHA_ASCENSION_ID) {
    if (eventType === "skill.unlocked" && event.playerId === player.id && event.skillId === AKASHA_ASCENSION_ID) {
      return { ultimateActivated: maybeActivateUltimate(state, player, data, definitions) };
    }
    if (eventType === "round.started") {
      maybeActivateUltimate(state, player, data, definitions);
      if (state.modeState.currentSituationClimax !== true || data.climaxOverloadRound === state.round) return;
      data.climaxOverloadRound = state.round;
      openDecision(state, player, AKASHA_ASCENSION_ID, "climax-overload", {}, [
        { id: "mountain", label: "Miyama" }, { id: "city", label: "Shinto" },
      ], decisionOpen);
      return { pending: true };
    }
  }
};

export const resolveAkashaDecision: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("AKASHA_DECISION_CONTEXT_INVALID");
  const previous = isRecord(payload.previous) ? payload.previous : payload;
  const decision = isRecord(payload.decision) ? payload.decision : undefined;
  const selections = Array.isArray(decision?.selections) ? decision.selections.filter((value): value is string => typeof value === "string") : [];
  if (decision?.status !== "resolved" || selections.length !== 1) throw new Error("AKASHA_DECISION_INVALID");
  const data = getState(state, player);
  const stage = String(previous.stage ?? "");
  if (stage === "boiling") {
    if (selections[0] === "decline") return { joinedInstanceIds: [] };
    if (selections[0] !== "join") throw new Error("AKASHA_BOILING_DECISION_INVALID");
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    const locationId = String(previous.locationId ?? "");
    const joined: string[] = [];
    for (const instanceId of candidates) {
      const card = state.cards[instanceId];
      if (!card || card.ownerPlayerId !== player.id || card.zone !== "board" || card.boardLocationId !== locationId || !isOverload(definitions[card.definitionId])) continue;
      delete card.boardLocationId;
      delete card.boardPlacedRound;
      movePlayerCard(state, player.id, card.instanceId, "attack");
      card.face = "up";
      card.active = true;
      card.residual = false;
      card.paidCost = 0;
      card.powerModifiers = [...(card.powerModifiers ?? []), { id: `akasha-boiling:${state.round}:${card.instanceId}`, sourceId: AKASHA_OVERLOAD_ID, kind: "add", value: 2, duration: "round" }];
      joined.push(card.instanceId);
    }
    syncVesselModifiers(state, player, data, definitions);
    return { joinedInstanceIds: joined };
  }
  if (stage === "climax-overload") {
    const locationId = selections[0];
    if (locationId !== "mountain" && locationId !== "city") throw new Error("AKASHA_CLIMAX_LOCATION_INVALID");
    const original = Object.values(state.cards).find((card) => card.ownerPlayerId === player.id && isOverload(definitions[card.definitionId]) && card.temporary !== true && card.zone !== "removed");
    if (!original) throw new Error("AKASHA_OVERLOAD_SOURCE_MISSING");
    const instanceId = createTemporaryOverloadAt(state, player, data, original.definitionId, locationId);
    syncVesselModifiers(state, player, data, definitions);
    return { createdInstanceId: instanceId, locationId };
  }
  throw new Error("AKASHA_DECISION_STAGE_INVALID");
};

export const isAkashaReincarnationLegal: SkillLegalityPredicate = (
  state: GameState,
  playerId: string,
  skill?: SkillDefinition,
  ability?: SkillAbilityDefinition,
  definitions?: Record<string, CardDefinition>,
) => {
  if (!skill || !ability || skill.id !== AKASHA_SHIKI_ID || ability.id !== AKASHA_SQUARE_ABILITY || !definitions) return false;
  const player = state.players[playerId];
  if (!player || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  const data = getState(state, player);
  if (!activeVessels(data).includes("shiki")) return false;
  const overloads = activeOverloads(state, player, definitions);
  if (overloads.length === 0) return false;
  const cost = overloads.reduce((sum, card) => sum + getCardPlayCost(state, definitions[card.definitionId], player, card, definitions), 0);
  return player.flags.infiniteMana === true || player.mana >= cost;
};

export function getAkashaRuntimeState(state: GameState, ownerPlayerId: string): AkashaState | undefined {
  const current = privateRulesState(state)[STATE_KEY];
  if (!isRecord(current) || current.ownerPlayerId !== ownerPlayerId) return undefined;
  return structuredClone(current) as unknown as AkashaState;
}
