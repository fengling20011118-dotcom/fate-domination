import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { assertCardCanEnterAttack } from "./card-rules.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getCardAttributes, normalizeCardAttributes, type CardDefinition } from "./content-types.ts";
import { getCardPlayCost } from "./costs.ts";
import { closePlayerCard, drawCards, placeOwnedCardOnBoard, returnOwnedBoardCardToSkillZone } from "./decks.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const GILLES_MASS_SUMMONING_ID = "servant.gilles.skill.sc-gilles-1";
export const GILLES_CALL_ANCIENTS_ID = "servant.gilles.skill.sc-gilles-np";
export const GILLES_MASS_SUMMONING_HANDLER = "core.gilles-mass-summoning";
export const GILLES_CALL_ANCIENTS_HANDLER = "core.gilles-call-ancients";

const MASS_SUMMONING_ABILITY = "mass-summoning";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === "attack"
      && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function massSummoningCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && getCardInstanceAttributes(card, definition, state, definitions).includes("魔术"));
  });
}

/** Mass Summoning: paired-play draw plus the Action-phase multi-play/type replacement. */
export const useGillesMassSummoning: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, emitEvent }) => {
  if (!definitions) throw new Error("GILLES_MASS_SUMMONING_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "attack.committed") {
    if (event.playerId !== player.id) return;
    const faceUpInstanceIds = Array.isArray(event.faceUpInstanceIds) ? event.faceUpInstanceIds.filter((id): id is string => typeof id === "string") : [];
    const sourceInstanceId = faceUpInstanceIds.find((instanceId) => {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      return Boolean(card && matchesSkill(definition, card.definitionId, skill.id));
    });
    if (!sourceInstanceId) return;
    const hasOtherMagic = faceUpInstanceIds.some((instanceId) => {
      if (instanceId === sourceInstanceId) return false;
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      return Boolean(card && definition && getCardInstanceAttributes(card, definition, state, definitions).includes("魔术"));
    });
    if (hasOtherMagic) drawCards(state, player.id, 1, randomInt ?? (() => 0), definitions);
    return;
  }
  if (data.abilityId !== MASS_SUMMONING_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("GILLES_MASS_SUMMONING_ABILITY_INVALID");
  }
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("GILLES_MASS_SUMMONING_SOURCE_INACTIVE");
  const instanceIds = Array.isArray(data.instanceIds) ? data.instanceIds.filter((id): id is string => typeof id === "string") : [];
  if (instanceIds.length < 1 || instanceIds.length > 3 || new Set(instanceIds).size !== instanceIds.length) throw new Error("GILLES_MASS_SUMMONING_CARD_COUNT_INVALID");
  const typeByInstanceId = isRecord(data.typeByInstanceId) ? data.typeByInstanceId : {};
  let totalCost = 0;
  for (const instanceId of instanceIds) {
    if (!player.hand.includes(instanceId)) throw new Error("GILLES_MASS_SUMMONING_HAND_CARD_REQUIRED");
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || !getCardInstanceAttributes(card, definition, state, definitions).includes("魔术")) throw new Error("GILLES_MASS_SUMMONING_MAGIC_REQUIRED");
    const targetType = typeByInstanceId[instanceId];
    if (targetType !== "力量" && targetType !== "迅捷") throw new Error("GILLES_MASS_SUMMONING_TARGET_TYPE_INVALID");
    assertCardCanEnterAttack({ state, playerId: player.id, instanceId, definitions, faceDown: false, allowedSourceZones: ["hand"], bypassTiming: true });
    if (definition.playPrerequisite?.discardFromHand) throw new Error("GILLES_MASS_SUMMONING_COMPLEX_PLAY_PREREQUISITE_UNSUPPORTED");
    totalCost += getCardPlayCost(state, definition, player, card, definitions);
  }
  if (player.flags.infiniteMana !== true && player.mana < totalCost) throw new Error("INSUFFICIENT_MANA");
  const played: Array<{ instanceId: string; definitionId: string; paidMana: number }> = [];
  for (const instanceId of instanceIds) {
    const card = state.cards[instanceId];
    const definition = definitions[card.definitionId];
    const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, {
      payCost: true,
      allowedSourceZones: ["hand"],
      bypassTiming: true,
      bypassFaceUpPlayLimit: true,
    });
    const targetType = typeByInstanceId[instanceId] as "力量" | "迅捷";
    card.attributeOverrides = [targetType];
    const marker = `attribute-overrides-until-round-end:${state.round}:${skill.id}:mass-summoning`;
    card.modifiers = [...card.modifiers.filter((item) => item !== marker), marker];
    emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana, attributes: [targetType], method: "mass-summoning", sourceId: skill.id });
    emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, attributes: [targetType], method: "mass-summoning", sourceId: skill.id });
    played.push({ instanceId, definitionId: definition.id, paidMana });
  }
  return { cards: played };
};

export const isGillesMassSummoningLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === MASS_SUMMONING_ABILITY && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions) && massSummoningCandidates(state, player, definitions).length > 0);
};

function attachedAncients(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return card.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === "board"
      && matchesSkill(definition, card.definitionId, GILLES_CALL_ANCIENTS_ID);
  });
}

function closeAttachedAncients(state: GameState, player: PlayerState, card: NonNullable<ReturnType<typeof attachedAncients>>): void {
  returnOwnedBoardCardToSkillZone(state, player.id, card.instanceId, "servant-skills");
}

/** Call the Ancients: physical battlefield attachment and its loss/unavailable lifecycle. */
export const useGillesCallAncients: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("GILLES_CALL_ANCIENTS_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "card.played") {
    const instanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
    const card = instanceId ? state.cards[instanceId] : undefined;
    const definition = card ? definitions[card.definitionId] : undefined;
    if (event.playerId !== player.id || event.face !== "up" || !card || !definition || !matchesSkill(definition, card.definitionId, skill.id)) return;
    if (player.locationId !== "mountain" && player.locationId !== "city") {
      closePlayerCard(state, player.id, card.instanceId, definitions);
      return { attached: false, closed: true };
    }
    placeOwnedCardOnBoard(state, player.id, card.instanceId, player.locationId);
    card.boardAttackWhileOwnerPresent = true;
    card.attributeOverrides = normalizeCardAttributes(getCardAttributes(definition).filter((attribute) => attribute !== "宝具"));
    const marker = `attribute-overrides-until-close:${skill.id}:lose-noble-phantasm`;
    if (!card.modifiers.includes(marker)) card.modifiers.push(marker);
    return { attached: true, locationId: player.locationId };
  }
  const attached = attachedAncients(state, player, definitions);
  if (!attached) return;
  if (eventType === "combat.resolved") {
    const locationId = event.locationId;
    const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
    const powers = isRecord(event.powers) ? event.powers : {};
    if (locationId === attached.boardLocationId && Object.prototype.hasOwnProperty.call(powers, player.id) && !winnerIds.includes(player.id)) {
      closeAttachedAncients(state, player, attached);
      return { closed: true, reason: "lost-fight" };
    }
    return;
  }
  if (eventType === "round.started") {
    const restrictions = isRecord(state.modeState.situationRestrictions) ? state.modeState.situationRestrictions : {};
    const forbiddenLocations = Array.isArray(restrictions.forbiddenLocations) ? restrictions.forbiddenLocations : [];
    if ((attached.boardLocationId !== "mountain" && attached.boardLocationId !== "city") || forbiddenLocations.includes(attached.boardLocationId)) {
      closeAttachedAncients(state, player, attached);
      return { closed: true, reason: "location-unavailable" };
    }
  }
};
