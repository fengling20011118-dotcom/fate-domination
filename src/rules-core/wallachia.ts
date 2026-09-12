import type { CardDefinition, CardInstance, GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { SkillAbilityDefinition, SkillDefinition, SkillHandler, SkillLegalityPredicate, SkillRuntimeCatalog } from "./skill-types.ts";
import { getCardAttributes } from "./content-types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { createOwnedCardInstance, removePhysicalCardFromGame } from "./decks.ts";
import { payMana } from "./costs.ts";
import { adjustVictoryPoints } from "./resources.ts";
import { clearLocationAccessRulesBySource, setLocationAccessRule } from "./location-access-rules.ts";

export const WALLACHIA_HANDLER = "core.wallachia-tatari";
export const WALLACHIA_RESOLVE = "core.wallachia-tatari-resolve";
export const WALLACHIA_TERROR_ID = "master.wallachia.skill.s1";
export const WALLACHIA_FEAR_ID = "master.wallachia.skill.s2";
export const WALLACHIA_TATARI_ID = "master.wallachia.skill.s3";
export const WALLACHIA_MADNESS_ID = "master.wallachia.skill.s4";
export const WALLACHIA_DARKNESS_ID = "master.wallachia.skill.s5";
export const WALLACHIA_MALICE_ID = "master.wallachia.skill.s6";
export const WALLACHIA_PHOBIA_ID = "master.wallachia.skill.s7";
export const WALLACHIA_DRAMA_ID = "master.wallachia.skill.s8";
export const WALLACHIA_ASCENSION_ID = "master.wallachia.skill.ascension";
export const WALLACHIA_TERROR_ACTION = "terror-incarnate-fear";

const WALLACHIA_STATE_KEY = "wallachiaTatari";
const TATARI_ACCESS_SOURCE = "wallachia-tatari-access";
const TERROR_ATTRIBUTE_MODIFIER_ID = "wallachia-terror-fear-attribute";
const PHOBIA_MODIFIER_ID = "wallachia-phobia-cost";
const MADNESS_POWER_ID = "wallachia-madness-power";
const FEAR_ATTRIBUTES = ["魔术", "力量", "迅捷"] as const;
type FearAttribute = typeof FEAR_ATTRIBUTES[number];
type EscalationId = typeof WALLACHIA_MADNESS_ID | typeof WALLACHIA_DARKNESS_ID | typeof WALLACHIA_MALICE_ID | typeof WALLACHIA_PHOBIA_ID | typeof WALLACHIA_DRAMA_ID;
const ESCALATION_IDS: readonly EscalationId[] = [WALLACHIA_MADNESS_ID, WALLACHIA_DARKNESS_ID, WALLACHIA_MALICE_ID, WALLACHIA_PHOBIA_ID, WALLACHIA_DRAMA_ID];

interface WallachiaState {
  ownerPlayerId: string;
  fears: Record<string, FearAttribute>;
  escalations: EscalationId[];
  tatariLocationId?: "mountain" | "city";
  tatariPlacedRound?: number;
  terrorTargetPlayerId?: string;
  terrorTargetRound?: number;
  ascensionCopySerial?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function privateRulesState(state: GameState): Record<string, unknown> {
  const mode = state.modeState as Record<string, unknown>;
  if (!isRecord(mode.privateRulesState)) mode.privateRulesState = {};
  return mode.privateRulesState as Record<string, unknown>;
}

function packageState(state: GameState, player: PlayerState): WallachiaState {
  const rules = privateRulesState(state);
  const current = rules[WALLACHIA_STATE_KEY];
  if (isRecord(current) && current.ownerPlayerId === player.id && isRecord(current.fears) && Array.isArray(current.escalations)) {
    return current as unknown as WallachiaState;
  }
  const created: WallachiaState = { ownerPlayerId: player.id, fears: {}, escalations: [] };
  rules[WALLACHIA_STATE_KEY] = created as unknown as Record<string, unknown>;
  return created;
}

function syncKnowledge(state: GameState, player: PlayerState, data: WallachiaState): void {
  const mode = state.modeState as Record<string, unknown>;
  if (!isRecord(mode.privatePlayerKnowledge)) mode.privatePlayerKnowledge = {};
  const allPrivate = mode.privatePlayerKnowledge as Record<string, unknown>;
  const ownerKnowledge = isRecord(allPrivate[player.id]) ? allPrivate[player.id] as Record<string, unknown> : {};
  ownerKnowledge[WALLACHIA_STATE_KEY] = { fears: { ...data.fears } };
  allPrivate[player.id] = ownerKnowledge;
  if (!isRecord(mode.publicRulesState)) mode.publicRulesState = {};
  const publicRules = mode.publicRulesState as Record<string, unknown>;
  publicRules[WALLACHIA_STATE_KEY] = {
    locationId: data.tatariLocationId ?? null,
    x: tatariX(data),
    escalations: [...data.escalations],
  };
}

function fearForDeck(deck: readonly string[], definitions: Record<string, CardDefinition>): FearAttribute {
  const scores = FEAR_ATTRIBUTES.map((attribute) => {
    let count = 0;
    let power = 0;
    for (const definitionId of deck) {
      const definition = definitions[definitionId];
      if (!definition || !getCardAttributes(definition).includes(attribute)) continue;
      count += 1;
      power += Number(definition.basePower ?? 0);
    }
    return { attribute, count, power };
  });
  scores.sort((left, right) => left.count - right.count || left.power - right.power
    || FEAR_ATTRIBUTES.indexOf(left.attribute) - FEAR_ATTRIBUTES.indexOf(right.attribute));
  return scores[0].attribute;
}

function initializeFears(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  runtimeCatalog: SkillRuntimeCatalog | undefined,
): WallachiaState {
  if (!runtimeCatalog) throw new Error("WALLACHIA_RUNTIME_CATALOG_REQUIRED");
  const data = packageState(state, player);
  data.fears = {};
  for (const target of Object.values(state.players)) {
    if (target.id === player.id || target.eliminated || !target.servantId) continue;
    const deck = runtimeCatalog.servantDecks[target.servantId];
    if (!deck) throw new Error(`WALLACHIA_SERVANT_DECK_MISSING:${target.servantId}`);
    data.fears[target.id] = fearForDeck(deck, definitions);
  }
  syncKnowledge(state, player, data);
  return data;
}

function tatariX(data: WallachiaState): number {
  const base = Math.ceil(data.escalations.length / 2);
  return base + (data.escalations.includes(WALLACHIA_DRAMA_ID) ? 1 : 0);
}

function removeTatariFromBoard(state: GameState, player: PlayerState, data: WallachiaState): void {
  for (const locationId of ["mountain", "city"] as const) {
    state.board.currentEvents[locationId] = (state.board.currentEvents[locationId] ?? []).filter((id) => id !== WALLACHIA_TATARI_ID);
  }
  delete state.board.eventVisibility[WALLACHIA_TATARI_ID];
  if (state.board.eventVictoryPointBonuses) delete state.board.eventVictoryPointBonuses[WALLACHIA_TATARI_ID];
  delete data.tatariLocationId;
  clearLocationAccessRulesBySource(state, TATARI_ACCESS_SOURCE);
  clearTatariRuntimeModifiers(state);
  syncKnowledge(state, player, data);
}

function placeTatari(state: GameState, player: PlayerState, data: WallachiaState, locationId: "mountain" | "city"): void {
  removeTatariFromBoard(state, player, data);
  state.board.currentEvents[locationId] ??= [];
  if (!state.board.currentEvents[locationId].includes(WALLACHIA_TATARI_ID)) state.board.currentEvents[locationId].push(WALLACHIA_TATARI_ID);
  state.board.eventVisibility[WALLACHIA_TATARI_ID] = "up";
  data.tatariLocationId = locationId;
  data.tatariPlacedRound = state.round;
  syncTatariRuntime(state, player, data, undefined);
}

function clearTatariRuntimeModifiers(state: GameState): void {
  for (const target of Object.values(state.players)) {
    target.cardRuleModifiers = (target.cardRuleModifiers ?? []).filter((modifier) => ![PHOBIA_MODIFIER_ID, TERROR_ATTRIBUTE_MODIFIER_ID].includes(modifier.id));
    if (target.cardRuleModifiers.length === 0) delete target.cardRuleModifiers;
  }
  for (const card of Object.values(state.cards)) {
    if (!card.powerModifiers) continue;
    card.powerModifiers = card.powerModifiers.filter((modifier) => modifier.id !== MADNESS_POWER_ID);
    if (card.powerModifiers.length === 0) delete card.powerModifiers;
  }
}

function definitionIdsWithAttribute(definitions: Record<string, CardDefinition>, attribute: FearAttribute): string[] {
  return Object.values(definitions).filter((definition) => getCardAttributes(definition).includes(attribute)).map((definition) => definition.id);
}

function activeTatariPlayers(state: GameState, data: WallachiaState): PlayerState[] {
  const locationId = data.tatariLocationId;
  if (!locationId) return [];
  return (state.board.locations[locationId] ?? [])
    .map((id) => state.players[id])
    .filter((candidate): candidate is PlayerState => Boolean(candidate && !candidate.eliminated));
}

function installAccessRule(state: GameState, player: PlayerState, data: WallachiaState): void {
  clearLocationAccessRulesBySource(state, TATARI_ACCESS_SOURCE);
  if (!data.tatariLocationId) return;
  const x = tatariX(data);
  const discardAttributesByPlayer: Record<string, string[]> = {};
  for (const [playerId, fear] of Object.entries(data.fears)) discardAttributesByPlayer[playerId] = [fear];
  setLocationAccessRule(state, {
    id: `${TATARI_ACCESS_SOURCE}:${player.id}`,
    sourceId: TATARI_ACCESS_SOURCE,
    controllerPlayerId: player.id,
    locationId: data.tatariLocationId,
    leaveManaCost: x,
    ...(data.escalations.includes(WALLACHIA_DARKNESS_ID) ? {
      enter: { manaCost: x, discardAttributesByPlayer, onlyOnActivePlayerTurn: true },
    } : {}),
    duration: "round",
    createdRound: state.round,
  });
}

function installPhobia(state: GameState, data: WallachiaState, definitions: Record<string, CardDefinition>): void {
  for (const target of Object.values(state.players)) {
    target.cardRuleModifiers = (target.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== PHOBIA_MODIFIER_ID);
    if (target.cardRuleModifiers.length === 0) delete target.cardRuleModifiers;
  }
  if (!data.tatariLocationId || !data.escalations.includes(WALLACHIA_PHOBIA_ID)) return;
  const x = tatariX(data);
  if (x <= 0) return;
  for (const target of activeTatariPlayers(state, data)) {
    const fear = data.fears[target.id];
    if (!fear) continue;
    target.cardRuleModifiers ??= [];
    target.cardRuleModifiers.push({
      id: PHOBIA_MODIFIER_ID,
      sourceId: WALLACHIA_PHOBIA_ID,
      targetDefinitionIds: definitionIdsWithAttribute(definitions, fear),
      costAdd: x,
      duration: "round",
    });
  }
}

function installTerrorGrant(state: GameState, player: PlayerState, data: WallachiaState): void {
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== TERROR_ATTRIBUTE_MODIFIER_ID);
  if (player.cardRuleModifiers.length === 0) delete player.cardRuleModifiers;
  if (data.terrorTargetRound !== state.round || !data.terrorTargetPlayerId || !data.tatariLocationId) return;
  const target = state.players[data.terrorTargetPlayerId];
  const fear = data.fears[data.terrorTargetPlayerId];
  if (!target || target.eliminated || target.locationId !== data.tatariLocationId || !fear) return;
  const targetInstanceIds = player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.controllerPlayerId === player.id && card.playedRound === state.round);
  });
  if (targetInstanceIds.length === 0) return;
  player.cardRuleModifiers ??= [];
  player.cardRuleModifiers.push({
    id: TERROR_ATTRIBUTE_MODIFIER_ID,
    sourceId: WALLACHIA_TERROR_ID,
    targetDefinitionIds: [...new Set(targetInstanceIds.map((instanceId) => state.cards[instanceId].definitionId))],
    targetInstanceIds,
    grantAttributes: [fear],
    duration: "round",
  });
}

function installMadness(state: GameState, data: WallachiaState, definitions: Record<string, CardDefinition>): void {
  for (const card of Object.values(state.cards)) {
    if (!card.powerModifiers) continue;
    card.powerModifiers = card.powerModifiers.filter((modifier) => modifier.id !== MADNESS_POWER_ID);
    if (card.powerModifiers.length === 0) delete card.powerModifiers;
  }
  if (!data.tatariLocationId || !data.escalations.includes(WALLACHIA_MADNESS_ID)) return;
  const participants = activeTatariPlayers(state, data);
  for (const controller of participants) {
    for (const instanceId of controller.attack) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || !definition || !card.active || card.face !== "up" || card.controllerPlayerId !== controller.id) continue;
      const attributes = getCardInstanceAttributes(card, definition, state, definitions);
      const bonus = participants.filter((opponent) => opponent.id !== controller.id
        && data.fears[opponent.id] !== undefined && attributes.includes(data.fears[opponent.id])).length;
      if (bonus <= 0) continue;
      card.powerModifiers ??= [];
      card.powerModifiers.push({ id: MADNESS_POWER_ID, sourceId: WALLACHIA_MADNESS_ID, kind: "add", value: bonus, duration: "round" });
    }
  }
}

function syncTatariRuntime(
  state: GameState,
  player: PlayerState,
  data: WallachiaState,
  definitions: Record<string, CardDefinition> | undefined,
): void {
  if (data.tatariLocationId) {
    state.board.eventVictoryPointBonuses ??= {};
    state.board.eventVictoryPointBonuses[WALLACHIA_TATARI_ID] = tatariX(data);
  }
  installAccessRule(state, player, data);
  installTerrorGrant(state, player, data);
  if (definitions) {
    installPhobia(state, data, definitions);
    installMadness(state, data, definitions);
  }
  syncKnowledge(state, player, data);
}

function openDecision(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  stage: string,
  payload: Record<string, unknown>,
  options: PendingDecision["options"],
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: WALLACHIA_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  decisionOpen({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `wallachia-${stage}`,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function beginTerrorAction(
  state: GameState,
  player: PlayerState,
  data: WallachiaState,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  if (!data.tatariLocationId) throw new Error("WALLACHIA_TATARI_NOT_ACTIVE");
  payMana(player, 3, "WALLACHIA_TERROR_MANA_REQUIRED");
  const candidates = state.turnOrder.filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated && data.fears[id]);
  if (candidates.length === 0) throw new Error("WALLACHIA_TERROR_NO_TARGET");
  openDecision(state, player, WALLACHIA_TERROR_ID, "terror-target", { candidates }, candidates.map((id) => ({ id, label: state.players[id].name })), decisionOpen);
  return { pending: true, manaPaid: 3 };
}

function beginEscalationChoice(
  state: GameState,
  player: PlayerState,
  data: WallachiaState,
  definitions: Record<string, CardDefinition>,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const candidates = ESCALATION_IDS.filter((id) => !data.escalations.includes(id));
  if (candidates.length === 0) return { escalationAdded: null };
  openDecision(state, player, WALLACHIA_TATARI_ID, "escalation", { candidates }, candidates.map((id) => ({ id, label: definitions[id]?.name ?? id })), decisionOpen);
  return { pending: true };
}

function resolveMalice(
  state: GameState,
  data: WallachiaState,
  event: Record<string, unknown>,
  definitions: Record<string, CardDefinition>,
) {
  if (!data.tatariLocationId || !data.escalations.includes(WALLACHIA_MALICE_ID) || event.locationId !== data.tatariLocationId) return;
  const x = tatariX(data);
  if (x <= 0) return { losses: {} };
  const participants = Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : [];
  const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  const losses: Record<string, number> = {};
  for (const loserId of participants.filter((id) => !winners.includes(id))) {
    const fear = data.fears[loserId];
    if (!fear) continue;
    const qualifyingWinner = winners.some((winnerId) => {
      const winner = state.players[winnerId];
      return Boolean(winner && winner.attack.some((instanceId) => {
        const card = state.cards[instanceId];
        const definition = card ? definitions[card.definitionId] : undefined;
        return Boolean(card && definition && card.active && card.face === "up" && card.controllerPlayerId === winnerId
          && getCardInstanceAttributes(card, definition, state, definitions).includes(fear));
      }));
    });
    if (!qualifyingWinner) continue;
    const delta = adjustVictoryPoints(state.players[loserId], -x);
    losses[loserId] = -delta;
  }
  return { losses };
}

function handleAscensionPlay(state: GameState, player: PlayerState, event: Record<string, unknown>): unknown {
  if (event.playerId !== player.id || event.definitionId !== WALLACHIA_ASCENSION_ID || typeof event.instanceId !== "string") return;
  const playedInstanceId = event.instanceId;
  const removedInstanceIds: string[] = [];
  for (const instanceId of [...player.masterSkills, ...player.servantSkills]) {
    const card = state.cards[instanceId];
    if (!card || card.definitionId !== WALLACHIA_ASCENSION_ID || card.instanceId === playedInstanceId) continue;
    removePhysicalCardFromGame(state, card.instanceId);
    removedInstanceIds.push(card.instanceId);
  }
  const data = packageState(state, player);
  const serial = Number(data.ascensionCopySerial ?? 0) + 1;
  data.ascensionCopySerial = serial;
  const instanceId = `${player.id}:wallachia-malignant-replicator:${serial}`;
  createOwnedCardInstance(state, player.id, {
    instanceId,
    definitionId: WALLACHIA_ASCENSION_ID,
    originMasterId: "master.wallachia",
    zone: "master-skills",
    face: "up",
  });
  return { removedInstanceIds, createdInstanceId: instanceId };
}

export const useWallachiaTatari: SkillHandler = ({ state, player, skill, payload, definitions, runtimeCatalog, openDecision: decisionOpen }) => {
  if (!definitions) throw new Error("WALLACHIA_DEFINITIONS_REQUIRED");
  const data = packageState(state, player);
  const body = isRecord(payload) ? payload : {};
  const eventType = typeof body.eventType === "string" ? body.eventType : undefined;
  const event = isRecord(body.event) ? body.event : {};

  if (skill.id === WALLACHIA_TERROR_ID) {
    if (eventType === "game.started") return initializeFears(state, player, definitions, runtimeCatalog);
    if (body.abilityId === WALLACHIA_TERROR_ACTION) return beginTerrorAction(state, player, data, decisionOpen);
    if (eventType === "player.entered-location" && event.playerId === player.id
      && (event.locationId === "mountain" || event.locationId === "city") && data.tatariPlacedRound !== state.round) {
      placeTatari(state, player, data, event.locationId);
      syncTatariRuntime(state, player, data, definitions);
      return { tatariLocationId: event.locationId, x: tatariX(data) };
    }
    if (eventType === "round.ending") {
      removeTatariFromBoard(state, player, data);
      return { removed: true };
    }
    if ((eventType === "player.moved" || eventType === "player.entered-location") && data.tatariLocationId) {
      if (data.escalations.includes(WALLACHIA_DRAMA_ID) && event.playerId === player.id
        && event.previousLocationId === data.tatariLocationId && event.locationId !== data.tatariLocationId) {
        removeTatariFromBoard(state, player, data);
        return { dramaDiscardedTatari: true };
      }
      syncTatariRuntime(state, player, data, definitions);
      return;
    }
    if (["card.played", "attack.committed", "phase.transitioned", "phase.embedded-transitioned"].includes(eventType ?? "")) {
      syncTatariRuntime(state, player, data, definitions);
      return;
    }
    if (eventType === "combat.resolved") {
      const malice = resolveMalice(state, data, event, definitions);
      syncTatariRuntime(state, player, data, definitions);
      if (event.locationId === data.tatariLocationId && Array.isArray(event.winnerIds) && event.winnerIds.includes(player.id)) {
        const escalation = beginEscalationChoice(state, player, data, definitions, decisionOpen);
        return { malice, escalation };
      }
      return { malice };
    }
  }

  if (skill.id === WALLACHIA_ASCENSION_ID && eventType === "card.played") return handleAscensionPlay(state, player, event);
};

export const resolveWallachiaDecision: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("WALLACHIA_DECISION_CONTEXT_INVALID");
  const previous = isRecord(payload.previous) ? payload.previous : payload;
  const decision = isRecord(payload.decision) ? payload.decision : undefined;
  if (decision?.status !== "resolved" || !Array.isArray(decision.selections)) throw new Error("WALLACHIA_DECISION_INVALID");
  const selections = decision.selections.filter((item): item is string => typeof item === "string");
  if (selections.length !== 1) throw new Error("WALLACHIA_DECISION_SELECTION_INVALID");
  const selected = selections[0];
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  if (!candidates.includes(selected)) throw new Error("WALLACHIA_DECISION_SELECTION_INVALID");
  const data = packageState(state, player);
  const stage = String(previous.stage ?? "");
  if (stage === "terror-target") {
    data.terrorTargetPlayerId = selected;
    data.terrorTargetRound = state.round;
    syncTatariRuntime(state, player, data, definitions);
    return { targetPlayerId: selected, fear: data.fears[selected] };
  }
  if (stage === "escalation") {
    if (!ESCALATION_IDS.includes(selected as EscalationId) || data.escalations.includes(selected as EscalationId)) throw new Error("WALLACHIA_ESCALATION_INVALID");
    data.escalations.push(selected as EscalationId);
    syncTatariRuntime(state, player, data, definitions);
    return { escalationId: selected, x: tatariX(data) };
  }
  throw new Error("WALLACHIA_DECISION_STAGE_INVALID");
};

export const isWallachiaTatariLegal: SkillLegalityPredicate = (
  state: GameState,
  playerId: string,
  skill?: SkillDefinition,
  ability?: SkillAbilityDefinition,
) => {
  const player = state.players[playerId];
  if (!player || !skill || !ability || state.activePlayerId !== playerId || state.phase !== "action") return false;
  if (skill.id !== WALLACHIA_TERROR_ID || ability.id !== WALLACHIA_TERROR_ACTION) return false;
  const data = packageState(state, player);
  return Boolean(data.tatariLocationId && (player.flags.infiniteMana === true || player.mana >= 3));
};

export function getWallachiaRuntimeState(state: GameState, ownerPlayerId: string): WallachiaState | undefined {
  const rules = privateRulesState(state);
  const current = rules[WALLACHIA_STATE_KEY];
  if (!isRecord(current) || current.ownerPlayerId !== ownerPlayerId || !isRecord(current.fears) || !Array.isArray(current.escalations)) return undefined;
  return structuredClone(current) as unknown as WallachiaState;
}
