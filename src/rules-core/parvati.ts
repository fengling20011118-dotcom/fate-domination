import type { GameState, PlayerState } from "../domain/state/types.ts";
import { movePlayerByEffect } from "./board.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { drawCards, movePlayerCard, shufflePlayerDeck } from "./decks.ts";
import { gainVictoryPoints } from "./resources.ts";
import { wouldPlayerBeEliminatedAtNextClimax } from "./rounds.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const PARVATI_ASHES_ID = "servant.parvati.skill.sc-parvati-1";
export const PARVATI_IMAGINARY_ID = "servant.parvati.skill.sc-parvati-2";
export const PARVATI_ASHES_HANDLER = "core.parvati-ashes-of-kama";
export const PARVATI_IMAGINARY_HANDLER = "core.parvati-imaginary-around";
export const PARVATI_IMAGINARY_RESOLVE = "core.parvati-imaginary-around-resolve";

const ASHES_ACTION = "ashes-survival";
const IMAGINARY_ACTION = "imaginary-cycle";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function ownedSkillInstance(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  const ids = [...new Set([...player.masterSkills, ...player.servantSkills, ...player.hand, ...player.attack])];
  return ids.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.zone !== "removed" && card.zone !== "discard"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function activeSkillInstance(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.active && card.face === "up"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

/** Ashes of Kama: reveal draw, survival-only Action buff, and win reward. */
export const useParvatiAshesOfKama: SkillHandler = ({ state, player, skill, payload, definitions, randomInt }) => {
  if (!definitions) throw new Error("PARVATI_ASHES_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "servant.true-name-revealed") {
    if (event.playerId !== player.id) return;
    drawCards(state, player.id, 3, randomInt ?? (() => 0), definitions);
    return;
  }
  if (eventType === "combat.resolved") {
    if (Number(player.flags.parvatiAshesArmedRound ?? -1) !== state.round) return;
    const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
    if (winnerIds.includes(player.id)) gainVictoryPoints(player, 1);
    return;
  }
  if (data.abilityId !== ASHES_ACTION || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("PARVATI_ASHES_ABILITY_INVALID");
  if (!wouldPlayerBeEliminatedAtNextClimax(state, player.id)) throw new Error("PARVATI_ASHES_ELIMINATION_CONDITION_NOT_MET");
  const source = ownedSkillInstance(state, player, skill.id, definitions);
  if (!source) throw new Error("PARVATI_ASHES_SOURCE_MISSING");
  const modifierId = `${skill.id}:attack-plus-one:${state.round}:${source.instanceId}`;
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => modifier.id !== modifierId);
  state.activeRuleModifiers.push({
    id: modifierId,
    sourceId: skill.id,
    sourceInstanceId: source.instanceId,
    controllerPlayerId: player.id,
    operation: "add",
    rule: "card_power",
    scope: { subject: "controller", cards: { zones: ["attack"] } },
    value: 1,
    duration: "round",
    createdRound: state.round,
  });
  player.flags.parvatiAshesArmedRound = state.round;
};

export const isParvatiAshesOfKamaLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === ASHES_ACTION && state.phase === "action" && state.activePlayerId === playerId
    && ownedSkillInstance(state, player, skill.id, definitions) && wouldPlayerBeEliminatedAtNextClimax(state, playerId));
};

function openImaginaryDiscardDecision(
  state: GameState,
  player: PlayerState,
  drawnInstanceId: string,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${PARVATI_IMAGINARY_ID}:draw-discard`;
  state.effectQueue.unshift({
    effectId,
    handlerId: PARVATI_IMAGINARY_RESOLVE,
    sourceId: PARVATI_IMAGINARY_ID,
    controllerPlayerId: player.id,
    payload: { drawnInstanceId },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "parvati-imaginary-drawn-card",
    options: [{ id: "keep", label: "保留" }, { id: "discard", label: "弃置" }],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

/** Imaginary Around: its On Play choice plus the three-basic Action. */
export const useParvatiImaginaryAround: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision, emitEvent }) => {
  if (!definitions) throw new Error("PARVATI_IMAGINARY_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "card.played") {
    const definitionId = typeof event.definitionId === "string" ? event.definitionId : undefined;
    const played = definitionId ? definitions[definitionId] : undefined;
    if (event.playerId !== player.id || event.face !== "up" || !definitionId || !matchesSkill(played, definitionId, skill.id)) return;
    const drawn = drawCards(state, player.id, 1, randomInt ?? (() => 0), definitions);
    const drawnInstanceId = drawn[0];
    if (drawnInstanceId) openImaginaryDiscardDecision(state, player, drawnInstanceId, openDecision);
    return;
  }
  if (data.abilityId !== IMAGINARY_ACTION || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("PARVATI_IMAGINARY_ABILITY_INVALID");
  if (!activeSkillInstance(state, player, skill.id, definitions)) throw new Error("PARVATI_IMAGINARY_SOURCE_INACTIVE");
  const instanceIds = Array.isArray(data.instanceIds) ? data.instanceIds.filter((id): id is string => typeof id === "string") : [];
  if (instanceIds.length !== 3 || new Set(instanceIds).size !== 3) throw new Error("PARVATI_IMAGINARY_THREE_BASICS_REQUIRED");
  const attributeSets = instanceIds.map((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || card.ownerPlayerId !== player.id || card.zone !== "discard" || definition.basic !== true) {
      throw new Error("PARVATI_IMAGINARY_BASIC_DISCARD_REQUIRED");
    }
    return new Set(getCardInstanceAttributes(card, definition, state, definitions));
  });
  const allShareType = [...attributeSets[0]].some((attribute) => attributeSets.slice(1).every((set) => set.has(attribute)));
  const allDifferentTypes = attributeSets.every((set, index) => attributeSets.slice(index + 1).every((other) => ![...set].some((attribute) => other.has(attribute))));
  for (const instanceId of instanceIds) movePlayerCard(state, player.id, instanceId, "deck");
  shufflePlayerDeck(state, player.id, randomInt ?? (() => 0));
  if (allDifferentTypes) player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 4;
  if (allShareType) {
    const targetLocationId = typeof data.targetLocationId === "string" ? data.targetLocationId : undefined;
    if (!targetLocationId) throw new Error("PARVATI_IMAGINARY_MOVE_TARGET_REQUIRED");
    const movement = movePlayerByEffect(state, player.id, targetLocationId, definitions);
    emitEvent?.("player.moved", { playerId: player.id, ...movement, method: "effect", sourceId: skill.id });
    emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect", sourceId: skill.id });
  }
  return { instanceIds, allDifferentTypes, allShareType };
};

export const resolveParvatiImaginaryAround: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("PARVATI_IMAGINARY_DECISION_INVALID");
  const drawnInstanceId = typeof payload.previous.drawnInstanceId === "string" ? payload.previous.drawnInstanceId : undefined;
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (!drawnInstanceId || selections.length !== 1 || !["keep", "discard"].includes(selections[0])) throw new Error("PARVATI_IMAGINARY_DECISION_INVALID");
  if (selections[0] === "discard") {
    if (!player.hand.includes(drawnInstanceId) || state.cards[drawnInstanceId]?.ownerPlayerId !== player.id) throw new Error("PARVATI_IMAGINARY_DRAWN_CARD_MOVED");
    movePlayerCard(state, player.id, drawnInstanceId, "discard");
  }
};

export const isParvatiImaginaryAroundLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== IMAGINARY_ACTION || state.phase !== "action" || state.activePlayerId !== playerId
    || !activeSkillInstance(state, player, skill.id, definitions)) return false;
  return player.discard.filter((instanceId) => definitions[state.cards[instanceId]?.definitionId ?? ""]?.basic === true).length >= 3;
};
