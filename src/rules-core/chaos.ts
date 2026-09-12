import type { CardDefinition, GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { SkillAbilityDefinition, SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { addCardToAttack } from "./card-play.ts";
import { areLocationsAdjacentByMovementArrows, movePlayerByEffect } from "./board.ts";
import { assertCommandSealUseAllowed, spendNormalCommandSeal } from "./command-seals.ts";
import { payMana } from "./costs.ts";
import { closePlayerCard } from "./decks.ts";
import {
  commitNamedSideDeckPlay,
  discardNamedSideDeckHandCards,
  drawNamedSideDeck,
  getNamedSideDeck,
  initializeNamedSideDeck,
  namedSideDeckHand,
} from "./named-side-decks.ts";
import { gainMana, gainVictoryPoints } from "./resources.ts";

export const CHAOS_HANDLER = "core.chaos-beast-engine";
export const CHAOS_RESOLVE = "core.chaos-beast-engine-resolve";
export const CHAOS_666_ID = "master.chaos.skill.s1";
export const CHAOS_DEVOURER_ID = "master.chaos.skill.s3";
export const CHAOS_WATCHER_ID = "master.chaos.skill.s4";
export const CHAOS_COLOSSUS_ID = "master.chaos.skill.s6";
export const CHAOS_EMPEROR_ID = "master.chaos.skill.s11";
export const CHAOS_999_ID = "master.chaos.skill.s16";
export const CHAOS_SCRAMBLED_SEAL_ID = "master.chaos.skill.s17";
export const CHAOS_ASCENSION_ID = "master.chaos.skill.ascension";
export const CHAOS_BEAST_PLAY_ABILITY = "chaos-beast-play";
export const CHAOS_DEVOURER_ABILITY = "chaos-devourer-offer";
export const CHAOS_ASCENSION_DRAW_ABILITY = "chaos-army-draw";
export const CHAOS_SCRAMBLED_ABILITY = "chaos-scrambled-seal";
export const CHAOS_BEAST_DECK_ID = "chaos-beasts";

export const CHAOS_BEAST_IDS = Object.freeze(Array.from({ length: 15 }, (_, index) => `master.chaos.skill.s${index + 2}`));

function beastDeck(state: GameState, player: PlayerState) {
  return getNamedSideDeck(state, player.id, CHAOS_BEAST_DECK_ID);
}

function setupBeasts(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
) {
  for (const definitionId of CHAOS_BEAST_IDS) {
    if (!definitions[definitionId]) throw new Error(`CHAOS_BEAST_DEFINITION_MISSING:${definitionId}`);
  }
  const deck = initializeNamedSideDeck(state, player.id, CHAOS_BEAST_DECK_ID, CHAOS_BEAST_IDS, randomInt, {
    originMasterId: "master.chaos",
    recycleDiscard: true,
  });
  // Nrvnqsr starts with Scrambled Seals instead of ordinary Command Seals.
  // Their Command-Seal conversion remains isolated to The Emperor rather than
  // leaking them into the shared ordinary-seal pool here.
  player.commandSeals = 0;
  delete player.flags.chaosScrambledSealUsed;
  delete player.flags.chaosScrambledSealExposed;
  delete player.flags.chaosScrambledSealEmperorInstanceId;
  return deck;
}

function emperorSource(state: GameState, player: PlayerState) {
  return player.attack
    .map((instanceId) => state.cards[instanceId])
    .find((card) => card?.definitionId === CHAOS_EMPEROR_ID && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up");
}

function exposeScrambledSeal(state: GameState, player: PlayerState) {
  if (player.flags.chaosScrambledSealUsed === true || player.flags.chaosScrambledSealExposed === true) return { exposed: false };
  const source = emperorSource(state, player);
  if (!source) return { exposed: false };
  player.commandSeals += 1;
  player.flags.chaosScrambledSealExposed = true;
  player.flags.chaosScrambledSealEmperorInstanceId = source.instanceId;
  return { exposed: true, instanceId: source.instanceId };
}

function retractScrambledSeal(player: PlayerState, consumed: boolean) {
  if (player.flags.chaosScrambledSealExposed !== true) return { retracted: false };
  if (!consumed) player.commandSeals = Math.max(0, player.commandSeals - 1);
  if (consumed) player.flags.chaosScrambledSealUsed = true;
  delete player.flags.chaosScrambledSealExposed;
  delete player.flags.chaosScrambledSealEmperorInstanceId;
  return { retracted: true, consumed };
}

function consumeScrambledSeal(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
) {
  if (player.flags.chaosScrambledSealUsed === true) throw new Error("CHAOS_SCRAMBLED_SEAL_ALREADY_USED");
  if (player.flags.chaosScrambledSealExposed === true) {
    assertCommandSealUseAllowed(state, player.id);
    spendNormalCommandSeal(state, player.id);
    const sourceId = typeof player.flags.chaosScrambledSealEmperorInstanceId === "string"
      ? player.flags.chaosScrambledSealEmperorInstanceId
      : undefined;
    if (sourceId && state.cards[sourceId]?.active) closePlayerCard(state, player.id, sourceId, definitions);
    retractScrambledSeal(player, true);
  } else player.flags.chaosScrambledSealUsed = true;
}

function handleEmperorEvent(
  state: GameState,
  player: PlayerState,
  eventType: string | undefined,
  event: Record<string, unknown>,
  definitions: Record<string, CardDefinition>,
) {
  if (eventType === "card.played" && event.playerId === player.id && event.definitionId === CHAOS_EMPEROR_ID) {
    return exposeScrambledSeal(state, player);
  }
  if (eventType === "player.command-seal-used" && event.playerId === player.id && player.flags.chaosScrambledSealExposed === true) {
    const sourceId = typeof player.flags.chaosScrambledSealEmperorInstanceId === "string"
      ? player.flags.chaosScrambledSealEmperorInstanceId
      : emperorSource(state, player)?.instanceId;
    if (sourceId && state.cards[sourceId]?.active) closePlayerCard(state, player.id, sourceId, definitions);
    return retractScrambledSeal(player, true);
  }
  if (eventType === "card.closed" && event.definitionId === CHAOS_EMPEROR_ID && event.ownerPlayerId === player.id) {
    return retractScrambledSeal(player, false);
  }
}

function resolveScrambledVictory(state: GameState, player: PlayerState, event: Record<string, unknown>) {
  if (Number(player.flags.chaosScrambledVictoryRound ?? -1) !== state.round) return;
  const participants = Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : [];
  if (!participants.includes(player.id)) return;
  delete player.flags.chaosScrambledVictoryRound;
  const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  return { victoryPointsGained: winners.includes(player.id) ? gainVictoryPoints(player, 2) : 0 };
}

function useScrambledSeal(
  state: GameState,
  player: PlayerState,
  payload: Record<string, unknown>,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("CHAOS_SCRAMBLED_SEAL_WINDOW_INVALID");
  if (player.flags.chaosScrambledSealUsed === true) throw new Error("CHAOS_SCRAMBLED_SEAL_ALREADY_USED");
  if (player.flags.chaosScrambledSealExposed === true) assertCommandSealUseAllowed(state, player.id);
  const mode = String(payload.mode ?? "");
  let result: unknown;
  if (mode === "beast-play") {
    result = beginBeastPlay(state, player, definitions, decisionOpen);
  } else if (mode === "mana") {
    result = { manaGained: gainMana(player, 2), drawnInstanceIds: drawNamedSideDeck(state, player.id, CHAOS_BEAST_DECK_ID, 1, randomInt) };
  } else if (mode === "victory") {
    player.flags.chaosScrambledVictoryRound = state.round;
    result = { armedRound: state.round };
  } else if (mode === "move") {
    const targetLocationId = typeof payload.locationId === "string" ? payload.locationId : "";
    if (!player.locationId || !targetLocationId || !areLocationsAdjacentByMovementArrows(state, player.locationId, targetLocationId)) {
      throw new Error("CHAOS_SCRAMBLED_SEAL_LOCATION_INVALID");
    }
    result = movePlayerByEffect(state, player.id, targetLocationId, definitions);
  } else throw new Error("CHAOS_SCRAMBLED_SEAL_MODE_INVALID");
  consumeScrambledSeal(state, player, definitions);
  return { mode, result };
}

function ensureBeasts(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
) {
  return beastDeck(state, player) ?? setupBeasts(state, player, definitions, randomInt);
}

function physicalSkillSource(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
  zones: Array<"master-skills" | "attack" | "hand"> = ["master-skills", "attack", "hand"],
) {
  return [...player.masterSkills, ...player.attack, ...player.hand]
    .map((instanceId) => state.cards[instanceId])
    .find((card) => {
      if (!card || card.ownerPlayerId !== player.id || !zones.includes(card.zone as "master-skills" | "attack" | "hand")) return false;
      const definition = definitions[card.definitionId];
      return card.definitionId === skillId || definition?.linkedSkillId === skillId;
    });
}

function armyOfOneUnlocked(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return Boolean(physicalSkillSource(state, player, CHAOS_ASCENSION_ID, definitions, ["master-skills", "attack"]));
}

function playCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  const hand = namedSideDeckHand(state, player.id, CHAOS_BEAST_DECK_ID);
  return hand.filter((instanceId) => {
    const definition = definitions[state.cards[instanceId]?.definitionId ?? ""];
    const cost = Number(definition?.cost ?? 0);
    return Number.isInteger(cost) && cost >= 0 && hand.length - 1 >= cost;
  });
}

function openDecision(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  stage: string,
  payload: Record<string, unknown>,
  options: PendingDecision["options"],
  min: number,
  max: number,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: CHAOS_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  decisionOpen({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `chaos-${stage}`,
    options,
    min,
    max,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function performBeastPlay(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  paymentIds: readonly string[],
  definitions: Record<string, CardDefinition>,
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
) {
  const hand = namedSideDeckHand(state, player.id, CHAOS_BEAST_DECK_ID);
  if (!hand.includes(instanceId)) throw new Error("CHAOS_BEAST_NOT_IN_HAND");
  const card = state.cards[instanceId];
  const definition = definitions[card?.definitionId ?? ""];
  if (!card || !definition || !CHAOS_BEAST_IDS.includes(card.definitionId)) throw new Error("CHAOS_BEAST_INVALID");
  const beastCost = Number(definition.cost ?? 0);
  if (!Number.isInteger(beastCost) || beastCost < 0) throw new Error("CHAOS_BEAST_COST_INVALID");
  if (paymentIds.length !== beastCost || new Set(paymentIds).size !== paymentIds.length
    || paymentIds.includes(instanceId) || paymentIds.some((id) => !hand.includes(id))) {
    throw new Error("CHAOS_BEAST_PAYMENT_INVALID");
  }
  if (paymentIds.length > 0) discardNamedSideDeckHandCards(state, player.id, CHAOS_BEAST_DECK_ID, paymentIds);
  addCardToAttack(state, player.id, instanceId, definitions, {
    payCost: false,
    bypassSkillEightMana: true,
    allowedSourceZones: ["side-hand"],
    bypassFaceUpPlayLimit: true,
    bypassTiming: true,
    recordFaceUpPlay: false,
  });
  commitNamedSideDeckPlay(state, player.id, CHAOS_BEAST_DECK_ID, instanceId);
  player.flags.chaos666OutpostUseRound = state.round;
  player.flags.chaos666OutpostUsesThisRound = Number(player.flags.chaos666OutpostUsesRound === state.round
    ? player.flags.chaos666OutpostUsesThisRound ?? 0 : 0) + 1;
  player.flags.chaos666OutpostUsesRound = state.round;
  emitEvent?.("card.played", {
    playerId: player.id,
    instanceId,
    definitionId: definition.id,
    face: "up",
    paidMana: 0,
    attributes: definition.attributes ?? [],
    method: "chaos-666",
  });
  return { playedInstanceId: instanceId, discardedInstanceIds: [...paymentIds], beastCost };
}

function beginBeastPlay(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const candidates = playCandidates(state, player, definitions);
  if (candidates.length === 0) throw new Error("CHAOS_BEAST_NO_PLAYABLE_CARD");
  openDecision(state, player, CHAOS_666_ID, "beast-select", { candidates }, candidates.map((instanceId) => ({
    id: instanceId,
    label: definitions[state.cards[instanceId].definitionId]?.name ?? state.cards[instanceId].definitionId,
  })), 1, 1, decisionOpen);
  return { pending: true };
}

function beginDevourer(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const source = physicalSkillSource(state, player, CHAOS_DEVOURER_ID, definitions, ["attack"]);
  if (!source?.active || source.face !== "up") throw new Error("CHAOS_DEVOURER_INACTIVE");
  const candidates = namedSideDeckHand(state, player.id, CHAOS_BEAST_DECK_ID);
  if (candidates.length === 0) throw new Error("CHAOS_DEVOURER_NO_BEAST");
  openDecision(state, player, CHAOS_DEVOURER_ID, "devourer-discard", { candidates }, candidates.map((instanceId) => ({
    id: instanceId,
    label: definitions[state.cards[instanceId].definitionId]?.name ?? state.cards[instanceId].definitionId,
  })), 1, Math.min(3, candidates.length), decisionOpen);
  return { pending: true };
}

function handleWatcherPlay(state: GameState, player: PlayerState, event: Record<string, unknown>) {
  if (event.playerId !== player.id || typeof event.instanceId !== "string") return;
  const card = state.cards[event.instanceId];
  if (!card || card.definitionId !== CHAOS_WATCHER_ID || card.zone !== "attack" || !card.active) return;
  player.flags.chaosWatcherPrepRound = state.round + 1;
  return { scheduledRound: state.round + 1 };
}

function handleWatcherPrep(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  if (state.phase !== "preparation" || state.activePlayerId !== player.id || Number(player.flags.chaosWatcherPrepRound ?? -1) !== state.round) return;
  delete player.flags.chaosWatcherPrepRound;
  const drawn = drawNamedSideDeck(state, player.id, CHAOS_BEAST_DECK_ID, 3, randomInt);
  const hand = namedSideDeckHand(state, player.id, CHAOS_BEAST_DECK_ID);
  const count = Math.min(2, hand.length);
  if (count === 0) return { drawnInstanceIds: drawn, discardedInstanceIds: [] };
  if (hand.length === count) {
    const discarded = discardNamedSideDeckHandCards(state, player.id, CHAOS_BEAST_DECK_ID, hand);
    return { drawnInstanceIds: drawn, discardedInstanceIds: discarded };
  }
  openDecision(state, player, CHAOS_WATCHER_ID, "watcher-discard", { candidates: hand, drawn }, hand.map((instanceId) => ({
    id: instanceId,
    label: definitions[state.cards[instanceId].definitionId]?.name ?? state.cards[instanceId].definitionId,
  })), count, count, decisionOpen);
  return { pending: true, drawnInstanceIds: drawn };
}

function handleColossus(
  state: GameState,
  player: PlayerState,
  event: Record<string, unknown>,
  randomInt: (maxExclusive: number) => number,
) {
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  const powers = event.powers && typeof event.powers === "object" && !Array.isArray(event.powers) ? event.powers as Record<string, unknown> : {};
  if (!Object.prototype.hasOwnProperty.call(powers, player.id) || winnerIds.includes(player.id)) return;
  return { drawnInstanceIds: drawNamedSideDeck(state, player.id, CHAOS_BEAST_DECK_ID, 2, randomInt) };
}

function handle999(
  state: GameState,
  player: PlayerState,
  event: Record<string, unknown>,
) {
  if (event.playerId !== player.id || typeof event.instanceId !== "string") return;
  const card = state.cards[event.instanceId];
  if (!card || card.definitionId !== CHAOS_999_ID || card.zone !== "attack" || !card.active) return;
  const hand = namedSideDeckHand(state, player.id, CHAOS_BEAST_DECK_ID);
  const discarded = discardNamedSideDeckHandCards(state, player.id, CHAOS_BEAST_DECK_ID, hand);
  const power = Math.min(10, discarded.length * 2);
  const id = `${CHAOS_999_ID}:despair`;
  card.powerModifiers = [...(card.powerModifiers ?? []).filter((modifier) => modifier.id !== id), {
    id,
    sourceId: CHAOS_999_ID,
    kind: "set",
    value: power,
    duration: "game",
  }];
  return { discardedInstanceIds: discarded, power };
}

function handleManaGain(
  state: GameState,
  player: PlayerState,
  event: Record<string, unknown>,
  randomInt: (maxExclusive: number) => number,
) {
  if (event.playerId !== player.id || event.sourceId === CHAOS_DEVOURER_ID || event.sourceId === CHAOS_SCRAMBLED_SEAL_ID) return;
  const delta = Number(event.delta ?? 0);
  if (!Number.isInteger(delta) || delta <= 0) return;
  const count = Math.floor(delta / 2);
  if (count <= 0) return { drawnInstanceIds: [] };
  return { drawnInstanceIds: drawNamedSideDeck(state, player.id, CHAOS_BEAST_DECK_ID, count, randomInt) };
}

export const useChaosBeastEngine: SkillHandler = ({ state, player, skill, payload, definitions, openDecision: decisionOpen, randomInt, emitEvent }) => {
  if (!definitions) throw new Error("CHAOS_DEFINITIONS_REQUIRED");
  const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = data.event && typeof data.event === "object" && !Array.isArray(data.event) ? data.event as Record<string, unknown> : {};
  ensureBeasts(state, player, definitions, randomInt);

  if (skill.id === CHAOS_666_ID) {
    if (eventType === "game.started") return beastDeck(state, player);
    if (eventType === "player.mana.changed") return handleManaGain(state, player, event, randomInt);
    if (eventType === "round.started" || eventType === "phase.transitioned") return handleWatcherPrep(state, player, definitions, randomInt, decisionOpen);
    if (eventType === "card.closed" && event.definitionId === CHAOS_EMPEROR_ID) return handleEmperorEvent(state, player, eventType, event, definitions);
    if (data.abilityId === CHAOS_BEAST_PLAY_ABILITY) return beginBeastPlay(state, player, definitions, decisionOpen);
  }
  if (skill.id === CHAOS_DEVOURER_ID && data.abilityId === CHAOS_DEVOURER_ABILITY) return beginDevourer(state, player, definitions, decisionOpen);
  if (skill.id === CHAOS_WATCHER_ID && eventType === "card.played") return handleWatcherPlay(state, player, event);
  if (skill.id === CHAOS_COLOSSUS_ID && eventType === "combat.resolved") return handleColossus(state, player, event, randomInt);
  if (skill.id === CHAOS_EMPEROR_ID && (eventType === "card.played" || eventType === "player.command-seal-used")) {
    return handleEmperorEvent(state, player, eventType, event, definitions);
  }
  if (skill.id === CHAOS_999_ID && eventType === "card.played") return handle999(state, player, event);
  if (skill.id === CHAOS_SCRAMBLED_SEAL_ID) {
    if (data.abilityId === CHAOS_SCRAMBLED_ABILITY) return useScrambledSeal(state, player, data, definitions, randomInt, decisionOpen);
    if (eventType === "combat.resolved") return resolveScrambledVictory(state, player, event);
  }
  if (skill.id === CHAOS_ASCENSION_ID && data.abilityId === CHAOS_ASCENSION_DRAW_ABILITY) {
    payMana(player, 4, "CHAOS_ASCENSION_MANA_REQUIRED");
    return { manaPaid: 4, drawnInstanceIds: drawNamedSideDeck(state, player.id, CHAOS_BEAST_DECK_ID, 1, randomInt) };
  }
};

export const resolveChaosBeastDecision: SkillHandler = ({ state, player, payload, definitions, openDecision: decisionOpen, randomInt, emitEvent }) => {
  if (!definitions) throw new Error("CHAOS_DEFINITIONS_REQUIRED");
  const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const previous = data.previous && typeof data.previous === "object" && !Array.isArray(data.previous) ? data.previous as Record<string, unknown> : data;
  const decision = data.decision && typeof data.decision === "object" && !Array.isArray(data.decision) ? data.decision as { status?: unknown; selections?: unknown } : undefined;
  const selections = Array.isArray(decision?.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision?.status !== "resolved") throw new Error("CHAOS_DECISION_INVALID");
  const stage = String(previous.stage ?? "");

  if (stage === "beast-select") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("CHAOS_BEAST_SELECTION_INVALID");
    const instanceId = selections[0];
    const definition = definitions[state.cards[instanceId]?.definitionId ?? ""];
    const cost = Number(definition?.cost ?? 0);
    if (!Number.isInteger(cost) || cost < 0) throw new Error("CHAOS_BEAST_COST_INVALID");
    if (cost === 0) return performBeastPlay(state, player, instanceId, [], definitions, emitEvent);
    const payments = namedSideDeckHand(state, player.id, CHAOS_BEAST_DECK_ID).filter((id) => id !== instanceId);
    if (payments.length < cost) throw new Error("CHAOS_BEAST_PAYMENT_UNAVAILABLE");
    openDecision(state, player, CHAOS_666_ID, "beast-pay", { instanceId, cost, candidates: payments }, payments.map((id) => ({
      id,
      label: definitions[state.cards[id].definitionId]?.name ?? state.cards[id].definitionId,
    })), cost, cost, decisionOpen);
    return { pending: true };
  }
  if (stage === "beast-pay") {
    const instanceId = typeof previous.instanceId === "string" ? previous.instanceId : "";
    const cost = Number(previous.cost ?? -1);
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!instanceId || !Number.isInteger(cost) || selections.length !== cost || selections.some((id) => !candidates.includes(id))) {
      throw new Error("CHAOS_BEAST_PAYMENT_INVALID");
    }
    return performBeastPlay(state, player, instanceId, selections, definitions, emitEvent);
  }
  if (stage === "devourer-discard") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length < 1 || selections.length > 3 || new Set(selections).size !== selections.length || selections.some((id) => !candidates.includes(id))) {
      throw new Error("CHAOS_DEVOURER_SELECTION_INVALID");
    }
    const discarded = discardNamedSideDeckHandCards(state, player.id, CHAOS_BEAST_DECK_ID, selections);
    return { discardedInstanceIds: discarded, manaGained: gainMana(player, discarded.length * 2) };
  }
  if (stage === "watcher-discard") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 2 || new Set(selections).size !== selections.length || selections.some((id) => !candidates.includes(id))) {
      throw new Error("CHAOS_WATCHER_SELECTION_INVALID");
    }
    return { drawnInstanceIds: Array.isArray(previous.drawn) ? previous.drawn : [], discardedInstanceIds: discardNamedSideDeckHandCards(state, player.id, CHAOS_BEAST_DECK_ID, selections) };
  }
  throw new Error("CHAOS_DECISION_STAGE_INVALID");
};

export const isChaosBeastEngineLegal: SkillLegalityPredicate = (
  state: GameState,
  playerId: string,
  skill?: SkillDefinition,
  ability?: SkillAbilityDefinition,
  definitions?: Record<string, CardDefinition>,
) => {
  const player = state.players[playerId];
  if (!player || !skill || !ability || !definitions || state.activePlayerId !== playerId) return false;
  if (skill.id === CHAOS_666_ID && ability.id === CHAOS_BEAST_PLAY_ABILITY) {
    if (state.phase !== "outpost" || !beastDeck(state, player)) return false;
    const alreadyUsed = Number(player.flags.chaos666OutpostUseRound ?? -1) === state.round;
    if (alreadyUsed && !armyOfOneUnlocked(state, player, definitions)) return false;
    return playCandidates(state, player, definitions).length > 0;
  }
  if (skill.id === CHAOS_DEVOURER_ID && ability.id === CHAOS_DEVOURER_ABILITY) {
    if (state.phase !== "action" || !beastDeck(state, player)) return false;
    const source = physicalSkillSource(state, player, CHAOS_DEVOURER_ID, definitions, ["attack"]);
    return Boolean(source?.active && source.face === "up" && namedSideDeckHand(state, player.id, CHAOS_BEAST_DECK_ID).length > 0);
  }
  if (skill.id === CHAOS_ASCENSION_ID && ability.id === CHAOS_ASCENSION_DRAW_ABILITY) {
    return state.phase === "action" && Boolean(beastDeck(state, player)) && (player.flags.infiniteMana === true || player.mana >= 4);
  }
  if (skill.id === CHAOS_SCRAMBLED_SEAL_ID && ability.id === CHAOS_SCRAMBLED_ABILITY) {
    return state.phase === "action" && Boolean(beastDeck(state, player)) && player.flags.chaosScrambledSealUsed !== true;
  }
  return false;
};
