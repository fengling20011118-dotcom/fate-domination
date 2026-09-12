import type { GameState, PlayerState } from "../domain/state/types.ts";
import { StateRandom } from "../match-engine/random.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { isOuterGodLifeDefinitionId } from "./clytie.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { clearCardStateBoundToClose, createDerivedCardInstance, movePlayerCard, shufflePlayerDeck } from "./decks.ts";
import { gainMana } from "./resources.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ABIGAIL_WITCHING_HOUR_ID = "servant.abigail.skill.sc-abigail-1";
export const ABIGAIL_WITCH_TRIAL_ID = "servant.abigail.skill.sc-abigail-2";
export const ABIGAIL_GATE_ID = "servant.abigail.skill.sc-abigail-3";
export const ABIGAIL_FOREIGNER_CLASS_ID = "servant.abigail.skill.sc-abigail-4";

export const ABIGAIL_WITCHING_HOUR_HANDLER = "core.abigail-witching-hour";
export const ABIGAIL_WITCH_TRIAL_HANDLER = "core.abigail-witch-trial";
export const ABIGAIL_GATE_HANDLER = "core.abigail-gate-to-nowhere";
export const ABIGAIL_GATE_RESOLVE = "core.abigail-gate-to-nowhere-resolve";

const WITCHING_DEALT_FLAG = "abigailWitchingHourDealtCount";
const OUTER_LIFE_DECK_CLEANUP_FLAG = "outerGodLifeDeckCleanupRound";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function ownedPhysicalSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return Boolean(card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone !== "removed" && card.zone !== "discard"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function activeOwnedSkill(
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

function sameLocationOpponentIds(state: GameState, player: PlayerState): string[] {
  if (!player.locationId || !state.board.locations[player.locationId]) return [];
  return state.board.locations[player.locationId]
    .filter((playerId) => playerId !== player.id && Boolean(state.players[playerId]) && !state.players[playerId].eliminated);
}

function sameFightOpponentIds(state: GameState, player: PlayerState): string[] {
  if (player.locationId !== "mountain" && player.locationId !== "city") return [];
  return (state.board.locations[player.locationId] ?? [])
    .filter((playerId) => playerId !== player.id && Boolean(state.players[playerId]) && !state.players[playerId].eliminated);
}

function nextOutsideLifeInstanceId(state: GameState, targetPlayerId: string): string {
  const prefix = `${targetPlayerId}:outside-life:${ABIGAIL_WITCHING_HOUR_ID}:`;
  const next = Object.keys(state.cards).filter((instanceId) => instanceId.startsWith(prefix)).length + 1;
  return `${prefix}${next}`;
}

function dealForeignerClassFromOutsideGame(
  state: GameState,
  sourcePlayerId: string,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
): string {
  if (!definitions[ABIGAIL_FOREIGNER_CLASS_ID]) throw new Error("ABIGAIL_FOREIGNER_CLASS_DEFINITION_MISSING");
  const instanceId = nextOutsideLifeInstanceId(state, targetPlayerId);
  createDerivedCardInstance(state, targetPlayerId, {
    instanceId,
    definitionId: ABIGAIL_FOREIGNER_CLASS_ID,
    zone: "hand",
    face: "down",
    active: false,
    residual: false,
    sourceEffectId: `${ABIGAIL_WITCHING_HOUR_ID}:creeping-dread`,
    createdByPlayerId: sourcePlayerId,
  });
  return instanceId;
}

function transferPhysicalCardToPlayerZone(
  state: GameState,
  targetPlayerId: string,
  instanceId: string,
  zone: "hand" | "deck" | "discard",
): void {
  const target = state.players[targetPlayerId];
  const card = state.cards[instanceId];
  if (!target || !card) throw new Error("ABIGAIL_CARD_TRANSFER_INVALID");
  for (const candidate of Object.values(state.players)) {
    candidate.hand = candidate.hand.filter((id) => id !== instanceId);
    candidate.deck = candidate.deck.filter((id) => id !== instanceId);
    candidate.discard = candidate.discard.filter((id) => id !== instanceId);
    candidate.attack = candidate.attack.filter((id) => id !== instanceId);
    candidate.masterSkills = candidate.masterSkills.filter((id) => id !== instanceId);
    candidate.servantSkills = candidate.servantSkills.filter((id) => id !== instanceId);
  }
  clearCardStateBoundToClose(card);
  card.ownerPlayerId = targetPlayerId;
  card.controllerPlayerId = targetPlayerId;
  card.zone = zone;
  card.face = zone === "discard" ? "up" : "down";
  card.active = false;
  card.residual = false;
  if (zone === "hand") target.hand.push(instanceId);
  else if (zone === "deck") target.deck.push(instanceId);
  else target.discard.push(instanceId);
}

function finishForWitchingHour(state: GameState, player: PlayerState, emitEvent?: SkillContext["emitEvent"]): void {
  state.modeState.instantVictoryIds = [player.id];
  state.modeState.instantVictoryReason = ABIGAIL_WITCHING_HOUR_ID;
  state.status = "finished";
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  emitEvent?.("game.finished", {
    round: state.round,
    winnerIds: [player.id],
    reason: ABIGAIL_WITCHING_HOUR_ID,
    sourceSkillId: ABIGAIL_WITCHING_HOUR_ID,
  });
}

/** Witching Hour: distribute physical Foreigner Class cards and win only when X is exactly 12 on play. */
export const useAbigailWitchingHour: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("ABIGAIL_WITCHING_HOUR_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "card.played") {
    const definitionId = typeof event.definitionId === "string" ? event.definitionId : undefined;
    if (event.playerId !== player.id || !definitionId || !matchesSkill(definitions[definitionId], definitionId, ABIGAIL_WITCHING_HOUR_ID)) return;
    const dealt = Number(player.flags[WITCHING_DEALT_FLAG] ?? 0);
    if (!Number.isInteger(dealt) || dealt < 0) throw new Error("ABIGAIL_WITCHING_HOUR_COUNT_INVALID");
    if (dealt === 12) finishForWitchingHour(state, player, emitEvent);
    return { dealt, won: dealt === 12 };
  }

  if (data.abilityId !== "creeping-dread" || state.phase !== "action" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, ABIGAIL_WITCHING_HOUR_ID, definitions)) {
    throw new Error("ABIGAIL_WITCHING_HOUR_WINDOW_INVALID");
  }
  const created = sameLocationOpponentIds(state, player)
    .map((targetPlayerId) => dealForeignerClassFromOutsideGame(state, player.id, targetPlayerId, definitions));
  const previous = Number(player.flags[WITCHING_DEALT_FLAG] ?? 0);
  if (!Number.isInteger(previous) || previous < 0) throw new Error("ABIGAIL_WITCHING_HOUR_COUNT_INVALID");
  player.flags[WITCHING_DEALT_FLAG] = previous + created.length;
  return { createdInstanceIds: created, dealt: previous + created.length };
};

export const isAbigailWitchingHourLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "creeping-dread"
    && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, ABIGAIL_WITCHING_HOUR_ID, definitions));
};

/** Witch Trial: opponents in Abigail's fight randomly discard, ties for the most revealed Foreigner Classes are all defeated. */
export const useAbigailWitchTrial: SkillHandler = ({ state, player, payload, definitions, randomInt, emitEvent }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== "silver-key"
    || state.phase !== "combat" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, ABIGAIL_WITCH_TRIAL_ID, definitions)) {
    throw new Error("ABIGAIL_WITCH_TRIAL_WINDOW_INVALID");
  }
  player.trueNameRevealed = false;
  const opponentIds = sameFightOpponentIds(state, player);
  const random = new StateRandom();
  const discardedInstanceIds: string[] = [];
  for (const opponentId of opponentIds) {
    const opponent = state.players[opponentId];
    if (opponent.hand.length === 0) continue;
    const index = (randomInt ?? ((maxExclusive: number) => random.integer(state, maxExclusive)))(opponent.hand.length);
    if (!Number.isInteger(index) || index < 0 || index >= opponent.hand.length) throw new Error("ABIGAIL_WITCH_TRIAL_RANDOM_INVALID");
    const instanceId = opponent.hand[index];
    movePlayerCard(state, opponent.id, instanceId, "discard");
    discardedInstanceIds.push(instanceId);
    emitEvent?.("card.discarded", { playerId: opponent.id, instanceId, definitionId: state.cards[instanceId].definitionId, sourceId: ABIGAIL_WITCH_TRIAL_ID, random: true });
  }

  const counts = Object.fromEntries(opponentIds.map((opponentId) => [
    opponentId,
    state.players[opponentId].discard.filter((instanceId) => isOuterGodLifeDefinitionId(state.cards[instanceId]?.definitionId)).length,
  ]));
  const highest = Math.max(0, ...Object.values(counts));
  const defeatedPlayerIds: string[] = [];
  if (highest >= 1) {
    for (const opponentId of opponentIds) {
      if (counts[opponentId] !== highest) continue;
      const result = applyDefeatEffect(state, opponentId, player.id, definitions, emitEvent, {
        sourceId: ABIGAIL_WITCH_TRIAL_ID,
        method: "silver-key",
      });
      if (result.defeated) defeatedPlayerIds.push(opponentId);
    }
  }

  const transferredInstanceIds: string[] = [];
  for (const opponentId of opponentIds) {
    const matching = [...state.players[opponentId].discard]
      .filter((instanceId) => isOuterGodLifeDefinitionId(state.cards[instanceId]?.definitionId));
    for (const instanceId of matching) {
      transferPhysicalCardToPlayerZone(state, player.id, instanceId, "discard");
      transferredInstanceIds.push(instanceId);
    }
  }
  return { opponentIds, discardedInstanceIds, counts, highest, defeatedPlayerIds, transferredInstanceIds };
};

export const isAbigailWitchTrialLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "silver-key"
    && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, ABIGAIL_WITCH_TRIAL_ID, definitions));
};

function handOuterLifeIds(state: GameState, player: PlayerState): string[] {
  return player.hand.filter((instanceId) => isOuterGodLifeDefinitionId(state.cards[instanceId]?.definitionId));
}

function discardOuterLifeIds(state: GameState, player: PlayerState): string[] {
  return player.discard.filter((instanceId) => isOuterGodLifeDefinitionId(state.cards[instanceId]?.definitionId));
}

function openGateDecision(
  state: GameState,
  player: PlayerState,
  stage: "banish-hand" | "play-discard",
  candidates: string[],
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${ABIGAIL_GATE_ID}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: ABIGAIL_GATE_RESOLVE,
    sourceId: ABIGAIL_GATE_ID,
    controllerPlayerId: player.id,
    payload: { stage, candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `abigail-gate-${stage}`,
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: stage === "banish-hand" ? 1 : 0,
    max: stage === "banish-hand" ? 1 : candidates.length,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function banishHandOuterLife(state: GameState, player: PlayerState, instanceId: string): { instanceId: string; mana: number } {
  if (!handOuterLifeIds(state, player).includes(instanceId)) throw new Error("ABIGAIL_GATE_HAND_CARD_INVALID");
  movePlayerCard(state, player.id, instanceId, "removed");
  state.cards[instanceId].face = "down";
  state.cards[instanceId].active = false;
  state.cards[instanceId].residual = false;
  gainMana(player, 2);
  return { instanceId, mana: player.mana };
}

function playOuterLifeFromDiscard(
  state: GameState,
  player: PlayerState,
  instanceIds: string[],
  definitions: Record<string, CardDefinition>,
  emitEvent?: SkillContext["emitEvent"],
): Array<{ instanceId: string; paidMana: number }> {
  const unique = [...new Set(instanceIds)];
  if (unique.length !== instanceIds.length || unique.some((instanceId) => !discardOuterLifeIds(state, player).includes(instanceId))) {
    throw new Error("ABIGAIL_GATE_DISCARD_SELECTION_INVALID");
  }
  const draft = structuredClone(state);
  for (const instanceId of unique) {
    addCardToAttack(draft, player.id, instanceId, definitions, {
      payCost: true,
      allowedSourceZones: ["discard"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
    });
  }

  const played: Array<{ instanceId: string; paidMana: number }> = [];
  for (const instanceId of unique) {
    const definition = definitions[state.cards[instanceId]?.definitionId ?? ""];
    if (!definition) throw new Error("ABIGAIL_GATE_CARD_DEFINITION_MISSING");
    const result = addCardToAttack(state, player.id, instanceId, definitions, {
      payCost: true,
      allowedSourceZones: ["discard"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
    });
    if (definition.revealsTrueNameOnPlay === true && !player.trueNameRevealed) revealPlayerTrueName(state, player.id);
    emitEvent?.("card.played", {
      playerId: player.id,
      instanceId,
      definitionId: definition.id,
      face: "up",
      paidMana: result.paidMana,
      attributes: getCardAttributes(definition),
      method: "abigail-gate-to-nowhere",
    });
    emitEvent?.("card.used", {
      playerId: player.id,
      instanceId,
      definitionId: definition.id,
      locationId: player.locationId,
      attributes: getCardAttributes(definition),
      method: "abigail-gate-to-nowhere",
    });
    played.push({ instanceId, paidMana: result.paidMana });
  }
  return played;
}

function cleanupOuterLifeToDeck(
  state: GameState,
  player: PlayerState,
  randomInt?: SkillContext["randomInt"],
): string[] {
  const matching = player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && isOuterGodLifeDefinitionId(card.definitionId));
  });
  for (const instanceId of matching) {
    transferPhysicalCardToPlayerZone(state, player.id, instanceId, "deck");
    delete player.flags[`outerGodLifeReturn:${instanceId}`];
  }
  if (matching.length > 0) {
    const random = new StateRandom();
    shufflePlayerDeck(state, player.id, randomInt ?? ((maxExclusive: number) => random.integer(state, maxExclusive)));
  }
  delete player.flags[OUTER_LIFE_DECK_CLEANUP_FLAG];
  return matching;
}

/** Gate to Nowhere: passive hand conversion, paid discard plays, then end-of-combat deck cleanup. */
export const useAbigailGateToNowhere: SkillHandler = ({ state, player, payload, definitions, openDecision, randomInt, emitEvent }) => {
  if (!definitions) throw new Error("ABIGAIL_GATE_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "combat.ending") {
    if (Number(player.flags[OUTER_LIFE_DECK_CLEANUP_FLAG] ?? -1) !== state.round) return;
    return { shuffledInstanceIds: cleanupOuterLifeToDeck(state, player, randomInt) };
  }

  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("ABIGAIL_GATE_WINDOW_INVALID");
  if (data.abilityId === "banish-life") {
    if (!ownedPhysicalSkill(state, player, ABIGAIL_GATE_ID, definitions)) throw new Error("ABIGAIL_GATE_SOURCE_MISSING");
    const candidates = handOuterLifeIds(state, player);
    if (candidates.length === 0) throw new Error("ABIGAIL_GATE_HAND_CARD_MISSING");
    if (candidates.length === 1) return banishHandOuterLife(state, player, candidates[0]);
    openGateDecision(state, player, "banish-hand", candidates, definitions, openDecision);
    return { pending: true, candidates };
  }
  if (data.abilityId === "open-gate") {
    if (!activeOwnedSkill(state, player, ABIGAIL_GATE_ID, definitions)) throw new Error("ABIGAIL_GATE_SOURCE_NOT_ACTIVE");
    player.flags[OUTER_LIFE_DECK_CLEANUP_FLAG] = state.round;
    const candidates = discardOuterLifeIds(state, player);
    if (candidates.length === 0) return { played: [], cleanupArmed: true };
    openGateDecision(state, player, "play-discard", candidates, definitions, openDecision);
    return { pending: true, candidates, cleanupArmed: true };
  }
  throw new Error("ABIGAIL_GATE_ABILITY_INVALID");
};

export const resolveAbigailGateToNowhere: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("ABIGAIL_GATE_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const stage = previous.stage;
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || new Set(selections).size !== selections.length || selections.some((id) => !candidates.includes(id))) {
    throw new Error("ABIGAIL_GATE_DECISION_INVALID");
  }
  if (stage === "banish-hand") {
    if (selections.length !== 1) throw new Error("ABIGAIL_GATE_DECISION_INVALID");
    return banishHandOuterLife(state, player, selections[0]);
  }
  if (stage === "play-discard") {
    if (Number(player.flags[OUTER_LIFE_DECK_CLEANUP_FLAG] ?? -1) !== state.round) throw new Error("ABIGAIL_GATE_CLEANUP_NOT_ARMED");
    return { played: playOuterLifeFromDiscard(state, player, selections, definitions, emitEvent), cleanupArmed: true };
  }
  throw new Error("ABIGAIL_GATE_DECISION_INVALID");
};

export const isAbigailGateToNowhereLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !ability || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  if (ability.id === "banish-life") {
    return Boolean(ownedPhysicalSkill(state, player, ABIGAIL_GATE_ID, definitions) && handOuterLifeIds(state, player).length > 0);
  }
  if (ability.id === "open-gate") return Boolean(activeOwnedSkill(state, player, ABIGAIL_GATE_ID, definitions));
  return false;
};
