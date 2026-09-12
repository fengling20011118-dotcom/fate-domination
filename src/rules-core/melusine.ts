import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { clearCardStateBoundToClose, createOwnedCardInstance, drawCards } from "./decks.ts";
import { markSkillRevealedThisRound } from "./skill-visibility.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const MELUSINE_SERVANT_ID = "servant.melusine";
export const ALBION_SERVANT_ID = "servant.albion";
export const MELUSINE_RAY_HORIZON_ID = "servant.melusine.skill.sc-melusine-1";
export const MELUSINE_PERL_DANCER_ID = "servant.melusine.skill.sc-melusine-2";
export const MELUSINE_RAY_HORIZON_HANDLER = "core.melusine-ray-horizon";
export const MELUSINE_PERL_DANCER_HANDLER = "core.melusine-perl-dancer";
export const MELUSINE_PERL_DANCER_RESOLVE = "core.melusine-perl-dancer-resolve";

const PERL_DANCER_ABILITY = "perl-dancer-play";
const MELUSINE_SKILL_IDS = [
  "servant.melusine.skill.sc-melusine-1",
  "servant.melusine.skill.sc-melusine-2",
  "servant.melusine.skill.sc-melusine-3",
] as const;
const ALBION_SKILL_IDS = [
  "servant.albion.skill.sc-albion-1",
  "servant.albion.skill.sc-albion-2",
  "servant.albion.skill.sc-albion-3",
] as const;
const ALBION_DECK_DEFINITION_IDS = [
  "card.cardb4", "card.cardb4", "card.cardb4",
  "card.cardq4", "card.cardq4", "card.cardq4", "card.cardq4",
  "card.carda4", "card.carda4",
  "card.cardluck", "card.cardsurveil", "card.cardsurveil",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rayHorizonInstance(state: GameState, player: PlayerState): GameState["cards"][string] | undefined {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === player.id
    && card.originServantId === MELUSINE_SERVANT_ID
    && card.definitionId === MELUSINE_RAY_HORIZON_ID
    && card.zone !== "removed");
}

function activePerlDancer(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.active && card.face === "up"
      && (card.definitionId === MELUSINE_PERL_DANCER_ID || definition?.linkedSkillId === MELUSINE_PERL_DANCER_ID));
  });
}

function removeInstanceFromEveryPlayerZone(state: GameState, instanceId: string): void {
  for (const candidate of Object.values(state.players)) {
    candidate.hand = candidate.hand.filter((id) => id !== instanceId);
    candidate.deck = candidate.deck.filter((id) => id !== instanceId);
    candidate.discard = candidate.discard.filter((id) => id !== instanceId);
    candidate.attack = candidate.attack.filter((id) => id !== instanceId);
    candidate.masterSkills = candidate.masterSkills.filter((id) => id !== instanceId);
    candidate.servantSkills = candidate.servantSkills.filter((id) => id !== instanceId);
  }
}

function removeOriginalServantPackage(state: GameState, originServantId: string): string[] {
  const removed: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (card.originServantId !== originServantId || card.zone === "removed") continue;
    removeInstanceFromEveryPlayerZone(state, card.instanceId);
    clearCardStateBoundToClose(card);
    card.zone = "removed";
    card.face = "down";
    card.active = false;
    card.residual = false;
    card.controllerPlayerId = card.ownerPlayerId;
    delete card.attachedToInstanceId;
    delete card.attachmentOrder;
    delete card.copyTopAttachmentTraits;
    delete card.boardLocationId;
    delete card.boardPlacedRound;
    removed.push(card.instanceId);
  }
  return removed;
}

function clearOldServantLingeringRules(state: GameState): void {
  const oldSkillIds = new Set<string>(MELUSINE_SKILL_IDS);
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => !oldSkillIds.has(modifier.sourceId));
  state.scheduledEffects = (state.scheduledEffects ?? []).filter((effect) => !oldSkillIds.has(effect.sourceId));
  state.effectQueue = (state.effectQueue ?? []).filter((effect) => !oldSkillIds.has(effect.sourceId));
  for (const player of Object.values(state.players)) {
    player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => !oldSkillIds.has(modifier.sourceId));
  }
}

function shuffleNewPackage<T>(items: T[], randomInt: (maxExclusive: number) => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const chosen = randomInt(index + 1);
    if (!Number.isInteger(chosen) || chosen < 0 || chosen > index) throw new Error("MELUSINE_RANDOM_INVALID");
    [result[index], result[chosen]] = [result[chosen], result[index]];
  }
  return result;
}

/**
 * Replace only the original Servant package. Any card that entered this player's
 * zones later and therefore does not carry the old originServantId remains in
 * exactly the same zone/order. New Albion deck cards are shuffled among
 * themselves and appended without reordering those surviving cards.
 */
export function replaceMelusineWithAlbion(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
  emitEvent?: (type: string, payload: unknown) => void,
): { removedInstanceIds: string[]; newDeckInstanceIds: string[]; newSkillInstanceIds: string[] } {
  if (player.servantId !== MELUSINE_SERVANT_ID) throw new Error("MELUSINE_REPLACEMENT_IDENTITY_INVALID");
  for (const definitionId of [...ALBION_DECK_DEFINITION_IDS, ...ALBION_SKILL_IDS]) {
    if (!definitions[definitionId]) throw new Error(`MELUSINE_REPLACEMENT_DEFINITION_MISSING:${definitionId}`);
  }

  const removedInstanceIds = removeOriginalServantPackage(state, MELUSINE_SERVANT_ID);
  clearOldServantLingeringRules(state);
  player.servantId = ALBION_SERVANT_ID;
  player.form = null;
  player.trueNameRevealed = true;

  const creationPrefix = `${player.id}:albion:${state.round}:${state.revision}`;
  const createdDeck = ALBION_DECK_DEFINITION_IDS.map((definitionId, index) => createOwnedCardInstance(state, player.id, {
    instanceId: `${creationPrefix}:deck:${index + 1}`,
    definitionId,
    originServantId: ALBION_SERVANT_ID,
    zone: "deck",
    face: "down",
  }).instanceId);
  const shuffledDeck = shuffleNewPackage(createdDeck, randomInt);
  const survivingDeck = player.deck.filter((instanceId) => !createdDeck.includes(instanceId));
  player.deck = [...survivingDeck, ...shuffledDeck];

  const newSkillInstanceIds = ALBION_SKILL_IDS.map((definitionId, index) => createOwnedCardInstance(state, player.id, {
    instanceId: `${creationPrefix}:skill:${index + 1}`,
    definitionId,
    originServantId: ALBION_SERVANT_ID,
    zone: "servant-skills",
    face: "up",
  }).instanceId);
  markSkillRevealedThisRound(state, player.id);
  emitEvent?.("servant.replaced", {
    playerId: player.id,
    previousServantId: MELUSINE_SERVANT_ID,
    servantId: ALBION_SERVANT_ID,
    removedInstanceIds: [...removedInstanceIds],
  });
  emitEvent?.("servant.true-name-revealed", {
    playerId: player.id,
    servantId: ALBION_SERVANT_ID,
    sourceDefinitionId: MELUSINE_RAY_HORIZON_ID,
    method: "servant-replacement",
  });
  return { removedInstanceIds, newDeckInstanceIds: [...shuffledDeck], newSkillInstanceIds };
}

/** Ray Horizon: first defeat reveals only this card; a later defeat transforms the entire Servant package. */
export const useMelusineRayHorizon: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, emitEvent }) => {
  if (!definitions) throw new Error("MELUSINE_RAY_HORIZON_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const event = isRecord(data.event) ? data.event : {};
  if (data.eventType !== "player.defeated" || event.playerId !== player.id || player.servantId !== MELUSINE_SERVANT_ID) return;
  const source = rayHorizonInstance(state, player);
  if (!source) throw new Error("MELUSINE_RAY_HORIZON_SOURCE_MISSING");
  if (source.face !== "up") {
    source.face = "up";
    markSkillRevealedThisRound(state, player.id);
    return { revealedInstanceId: source.instanceId, transformed: false };
  }
  return {
    ...replaceMelusineWithAlbion(state, player, definitions, randomInt ?? (() => 0), emitEvent),
    transformed: true,
  };
};

function basicHandCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.basic === true && card.ownerPlayerId === player.id && card.zone === "hand");
  });
}

function openPerlCardDecision(
  state: GameState,
  player: PlayerState,
  maxCount: number,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const candidates = basicHandCandidates(state, player, definitions);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${MELUSINE_PERL_DANCER_ID}:cards:${maxCount}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: MELUSINE_PERL_DANCER_RESOLVE,
    sourceId: MELUSINE_PERL_DANCER_ID,
    controllerPlayerId: player.id,
    payload: { stage: "cards", maxCount, candidateInstanceIds: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "melusine-perl-dancer-cards",
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId })),
    min: 0,
    max: Math.min(maxCount, candidates.length),
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function openPerlModeDecision(
  state: GameState,
  player: PlayerState,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${MELUSINE_PERL_DANCER_ID}:mode`;
  state.effectQueue.unshift({
    effectId,
    handlerId: MELUSINE_PERL_DANCER_RESOLVE,
    sourceId: MELUSINE_PERL_DANCER_ID,
    controllerPlayerId: player.id,
    payload: { stage: "mode" },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "melusine-perl-dancer-mode",
    options: [
      { id: "base", label: "打出至多2张基础攻击" },
      { id: "moved", label: "抽1张，然后打出至多3张基础攻击" },
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

/** Perl Dancer serializes the optional replacement effect before any draw/card choices occur. */
export const useMelusinePerlDancer: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("MELUSINE_PERL_DANCER_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== PERL_DANCER_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("MELUSINE_PERL_DANCER_ABILITY_INVALID");
  }
  if (!activePerlDancer(state, player, definitions)) throw new Error("MELUSINE_PERL_DANCER_SOURCE_INACTIVE");
  if (Number(player.flags.movedOrRedeployedRound ?? Number.NEGATIVE_INFINITY) === state.round) {
    openPerlModeDecision(state, player, openDecision);
  } else {
    openPerlCardDecision(state, player, 2, definitions, openDecision);
  }
};

export const resolveMelusinePerlDancer: SkillHandler = ({ state, player, payload, definitions, randomInt, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("MELUSINE_PERL_DANCER_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((value): value is string => typeof value === "string") : [];
  if (decision.status !== "resolved") throw new Error("MELUSINE_PERL_DANCER_DECISION_INVALID");

  if (previous.stage === "mode") {
    if (selections.length !== 1 || (selections[0] !== "base" && selections[0] !== "moved")) throw new Error("MELUSINE_PERL_DANCER_MODE_INVALID");
    if (selections[0] === "moved") {
      if (Number(player.flags.movedOrRedeployedRound ?? Number.NEGATIVE_INFINITY) !== state.round) throw new Error("MELUSINE_PERL_DANCER_MOVE_REQUIRED");
      drawCards(state, player.id, 1, randomInt ?? (() => 0), definitions);
      openPerlCardDecision(state, player, 3, definitions, openDecision);
      return { mode: "moved", drew: 1 };
    }
    openPerlCardDecision(state, player, 2, definitions, openDecision);
    return { mode: "base", drew: 0 };
  }

  if (previous.stage !== "cards") throw new Error("MELUSINE_PERL_DANCER_STAGE_INVALID");
  const maxCount = Number(previous.maxCount);
  const candidates = Array.isArray(previous.candidateInstanceIds)
    ? previous.candidateInstanceIds.filter((value): value is string => typeof value === "string")
    : [];
  if (!Number.isInteger(maxCount) || maxCount < 0 || selections.length > maxCount || new Set(selections).size !== selections.length
    || selections.some((instanceId) => !candidates.includes(instanceId))) {
    throw new Error("MELUSINE_PERL_DANCER_CARDS_INVALID");
  }

  const cards: Array<{ instanceId: string; definitionId: string; paidMana: number }> = [];
  for (const instanceId of selections) {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || definition.basic !== true || card.ownerPlayerId !== player.id || card.zone !== "hand") {
      throw new Error("MELUSINE_PERL_DANCER_BASIC_REQUIRED");
    }
    const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, {
      payCost: true,
      allowedSourceZones: ["hand"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
    });
    const attributes = getCardInstanceAttributes(card, definition, state, definitions);
    emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana, attributes, method: "perl-dancer" });
    emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, attributes, method: "play", sourceId: MELUSINE_PERL_DANCER_ID });
    cards.push({ instanceId, definitionId: definition.id, paidMana });
  }
  return { cards };
};

export const isMelusinePerlDancerLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === PERL_DANCER_ABILITY
    && state.phase === "action" && state.activePlayerId === playerId
    && activePerlDancer(state, player, definitions));
};
