import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { StateRandom } from "../match-engine/random.ts";
import { addCardToAttack, playCardFaceDownByEffect } from "./card-play.ts";
import { assertCardCanEnterAttack } from "./card-rules.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getCardAttributes, normalizeCardAttributes, type CardDefinition } from "./content-types.ts";
import { getCardPlayCost } from "./costs.ts";
import { drawCards, removePhysicalCardFromGame } from "./decks.ts";
import { adjustVictoryPoints } from "./resources.ts";
import { adjustBattlefieldCompetitionReward, type BattlefieldLocationId } from "./scoring.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const GARETH_IRA_ID = "servant.gareth.skill.sc-gareth-2";
export const GARETH_GUN_LANCE_ID = "servant.gareth.skill.sc-gareth-3";
export const GARETH_IRA_HANDLER = "core.gareth-ira-lupus";
export const GARETH_IRA_RESOLVE = "core.gareth-ira-lupus-resolve";
export const GARETH_GUN_LANCE_HANDLER = "core.gareth-gun-lance";
export const GARETH_GUN_LANCE_RESOLVE = "core.gareth-gun-lance-resolve";

const IRA_ABILITY = "cornered-wolf";
const GUN_LANCE_ABILITY = "battery-overload";
const IRA_EXTRA_DRAWS_FLAG = "garethIraExtraDraws";
const GUN_REMOVE_MARKER_PREFIX = "gareth-gun-lance-remove-after-combat:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
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
      && card.zone === "attack" && card.face === "up" && card.active && matchesSkill(definition, card.definitionId, skillId));
  });
}

function battlefieldOf(player: PlayerState): BattlefieldLocationId | undefined {
  return player.locationId === "mountain" || player.locationId === "city" ? player.locationId : undefined;
}

function opponentCountInFight(state: GameState, player: PlayerState, locationId: BattlefieldLocationId): number {
  return (state.board.locations[locationId] ?? []).filter((playerId) => playerId !== player.id && !state.players[playerId]?.eliminated).length;
}

function readIraCarry(player: PlayerState): number {
  const value = Number(player.flags[IRA_EXTRA_DRAWS_FLAG] ?? 0);
  if (!Number.isInteger(value) || value < 0) throw new Error("GARETH_IRA_CARRY_INVALID");
  return value;
}

function canIraPlayFaceUp(state: GameState, player: PlayerState, instanceId: string, definitions: Record<string, CardDefinition>): boolean {
  try {
    const definition = assertCardCanEnterAttack({ state, playerId: player.id, instanceId, definitions, faceDown: false, allowedSourceZones: ["hand"], bypassTiming: true });
    if (definition.playPrerequisite?.discardFromHand) return false;
    const cost = getCardPlayCost(state, definition, player, state.cards[instanceId], definitions);
    return player.flags.infiniteMana === true || player.mana >= cost;
  } catch {
    return false;
  }
}

function canIraPlayFaceDown(state: GameState, player: PlayerState, instanceId: string, definitions: Record<string, CardDefinition>): boolean {
  try {
    assertCardCanEnterAttack({ state, playerId: player.id, instanceId, definitions, faceDown: true, allowedSourceZones: ["hand"], bypassTiming: true });
    return true;
  } catch {
    return false;
  }
}

function emitIraFaceUpPlay(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
): void {
  const card = state.cards[instanceId];
  const definition = definitions[card.definitionId];
  const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, {
    payCost: true,
    allowedSourceZones: ["hand"],
    bypassTiming: true,
    bypassFaceUpPlayLimit: true,
  });
  if (definition.revealsTrueNameOnPlay === true && !player.trueNameRevealed) {
    revealPlayerTrueName(state, player.id);
    emitEvent?.("servant.true-name-revealed", { playerId: player.id, servantId: player.servantId, sourceDefinitionId: definition.id, method: "ira-lupus" });
  }
  const attributes = getCardInstanceAttributes(card, definition, state, definitions);
  emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana, attributes, method: "ira-lupus", sourceId: GARETH_IRA_ID });
  emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, attributes, method: "ira-lupus", sourceId: GARETH_IRA_ID });
}

function emitIraFaceDownPlay(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  locationId: BattlefieldLocationId,
  definitions: Record<string, CardDefinition>,
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
): void {
  playCardFaceDownByEffect(state, player.id, instanceId, definitions, { allowedSourceZones: ["hand"] });
  emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: null, face: "down", paidMana: 0, attributes: [], method: "ira-lupus", sourceId: GARETH_IRA_ID });
  adjustBattlefieldCompetitionReward(state, locationId, -1);
  player.flags[IRA_EXTRA_DRAWS_FLAG] = readIraCarry(player) + 1;
}

function openIraChoice(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  locationId: BattlefieldLocationId,
  remaining: number,
  canFaceUp: boolean,
  canFaceDown: boolean,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${GARETH_IRA_ID}:play:${instanceId}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: GARETH_IRA_RESOLVE,
    sourceId: GARETH_IRA_ID,
    controllerPlayerId: player.id,
    payload: { stage: "play-drawn", instanceId, locationId, remaining },
    createdAtRevision: state.revision,
  });
  const options: PendingDecision["options"] = [];
  if (canFaceUp) options.push({ id: "face-up", label: "明置打出" });
  if (canFaceDown) options.push({ id: "face-down", label: "暗置打出" });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "gareth-ira-play-drawn",
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function continueIra(
  state: GameState,
  player: PlayerState,
  skill: SkillDefinition,
  remaining: number,
  locationId: BattlefieldLocationId,
  definitions: Record<string, CardDefinition>,
  randomInt: Parameters<SkillHandler>[0]["randomInt"],
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
): void {
  if (remaining <= 0) return;
  const random = new StateRandom();
  const drawn = drawCards(state, player.id, 1, randomInt ?? ((max) => random.integer(state, max)), definitions);
  const instanceId = drawn[0];
  if (!instanceId) return;
  const faceUp = canIraPlayFaceUp(state, player, instanceId, definitions);
  const faceDown = canIraPlayFaceDown(state, player, instanceId, definitions);
  if (!faceUp && !faceDown) throw new Error("GARETH_IRA_DRAWN_CARD_UNPLAYABLE");
  if (faceUp && faceDown) {
    openIraChoice(state, player, instanceId, locationId, remaining - 1, true, true, openDecision);
    return;
  }
  if (faceUp) emitIraFaceUpPlay(state, player, instanceId, definitions, emitEvent);
  else emitIraFaceDownPlay(state, player, instanceId, locationId, definitions, emitEvent);
  continueIra(state, player, skill, remaining - 1, locationId, definitions, randomInt, openDecision, emitEvent);
}

/** Ira Lupus / Cornered Wolf. */
export const useGarethIraLupus: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== IRA_ABILITY || state.phase !== "combat") throw new Error("GARETH_IRA_ABILITY_INVALID");
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("GARETH_IRA_SOURCE_INACTIVE");
  const locationId = battlefieldOf(player);
  if (!locationId) throw new Error("GARETH_IRA_BATTLEFIELD_REQUIRED");
  const baseCount = Math.max(0, opponentCountInFight(state, player, locationId) - 1);
  const carry = readIraCarry(player);
  player.flags[IRA_EXTRA_DRAWS_FLAG] = 0;
  continueIra(state, player, skill, baseCount + carry, locationId, definitions, randomInt, openDecision, emitEvent);
  return { drawPlayCount: baseCount + carry, carriedDraws: carry };
};

export const resolveGarethIraLupus: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("GARETH_IRA_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const instanceId = typeof previous.instanceId === "string" ? previous.instanceId : undefined;
  const locationId = previous.locationId === "mountain" || previous.locationId === "city" ? previous.locationId : undefined;
  const remaining = Number(previous.remaining);
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (previous.stage !== "play-drawn" || !instanceId || !locationId || !Number.isInteger(remaining) || remaining < 0
    || decision.status !== "resolved" || selections.length !== 1 || !["face-up", "face-down"].includes(selections[0])
    || !player.hand.includes(instanceId)) throw new Error("GARETH_IRA_DECISION_INVALID");
  if (selections[0] === "face-up") {
    if (!canIraPlayFaceUp(state, player, instanceId, definitions)) throw new Error("GARETH_IRA_FACE_UP_INVALID");
    emitIraFaceUpPlay(state, player, instanceId, definitions, emitEvent);
  } else {
    if (!canIraPlayFaceDown(state, player, instanceId, definitions)) throw new Error("GARETH_IRA_FACE_DOWN_INVALID");
    emitIraFaceDownPlay(state, player, instanceId, locationId, definitions, emitEvent);
  }
  continueIra(state, player, skill, remaining, locationId, definitions, randomInt, openDecision, emitEvent);
};

export const isGarethIraLupusLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === IRA_ABILITY && state.phase === "combat"
    && battlefieldOf(player) && activeOwnedSkill(state, player, skill.id, definitions));
};

function gunLanceTargets(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.controllerPlayerId === player.id && card.zone === "attack" && card.face === "up" && card.active
      && definition.basic === true && getCardInstanceAttributes(card, definition, state, definitions).includes("魔术"));
  });
}

function applyGunLanceOverload(
  state: GameState,
  player: PlayerState,
  skill: SkillDefinition,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): { targetInstanceId: string } {
  if (player.victoryPoints < 2) throw new Error("GARETH_GUN_LANCE_VP_REQUIRED");
  if (!gunLanceTargets(state, player, definitions).includes(instanceId)) throw new Error("GARETH_GUN_LANCE_TARGET_INVALID");
  adjustVictoryPoints(player, -2);
  const card = state.cards[instanceId];
  const definition = definitions[card.definitionId];
  card.attributeOverrides = normalizeCardAttributes([...getCardInstanceAttributes(card, definition, state, definitions), "力量"]);
  const attributeMarker = `attribute-overrides-until-close:${skill.id}:battery-overload`;
  if (!card.modifiers.includes(attributeMarker)) card.modifiers.push(attributeMarker);
  const powerModifierId = `${skill.id}:battery-overload:${state.round}:${instanceId}`;
  card.powerModifiers = [
    ...(card.powerModifiers ?? []).filter((modifier) => modifier.id !== powerModifierId),
    { id: powerModifierId, sourceId: skill.id, kind: "add", value: 2, duration: "round" },
  ];
  const removeMarker = `${GUN_REMOVE_MARKER_PREFIX}${player.id}:${state.round}:${skill.id}`;
  if (!card.modifiers.includes(removeMarker)) card.modifiers.push(removeMarker);
  return { targetInstanceId: instanceId };
}

/** Gun Lance Battery Overload plus its mandatory after-combat exile lifecycle. */
export const useGarethGunLance: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("GARETH_GUN_LANCE_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "combat.ending") {
    const marker = `${GUN_REMOVE_MARKER_PREFIX}${player.id}:${state.round}:${skill.id}`;
    const targets = Object.values(state.cards).filter((card) => card.modifiers.includes(marker)).map((card) => card.instanceId);
    for (const instanceId of targets) removePhysicalCardFromGame(state, instanceId);
    return { removedInstanceIds: targets };
  }
  if (data.abilityId !== GUN_LANCE_ABILITY || state.phase !== "combat") throw new Error("GARETH_GUN_LANCE_ABILITY_INVALID");
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("GARETH_GUN_LANCE_SOURCE_INACTIVE");
  const targets = gunLanceTargets(state, player, definitions);
  if (targets.length === 0) throw new Error("GARETH_GUN_LANCE_NO_TARGET");
  if (player.victoryPoints < 2) throw new Error("GARETH_GUN_LANCE_VP_REQUIRED");
  const targetInstanceId = typeof data.targetInstanceId === "string" ? data.targetInstanceId : undefined;
  if (targetInstanceId) return applyGunLanceOverload(state, player, skill, targetInstanceId, definitions);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:battery-overload`;
  state.effectQueue.unshift({ effectId, handlerId: GARETH_GUN_LANCE_RESOLVE, sourceId: skill.id, controllerPlayerId: player.id, payload: { targets }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "gareth-gun-lance-target",
    options: targets.map((instanceId) => ({ id: instanceId, label: instanceId })), min: 1, max: 1, allowCancel: false,
    continuationEffectId: effectId, submissions: {},
  });
};

export const resolveGarethGunLance: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("GARETH_GUN_LANCE_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.targets) ? payload.previous.targets.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("GARETH_GUN_LANCE_DECISION_INVALID");
  return applyGunLanceOverload(state, player, skill, selections[0], definitions);
};

export const isGarethGunLanceLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === GUN_LANCE_ABILITY && state.phase === "combat" && player.victoryPoints >= 2
    && activeOwnedSkill(state, player, skill.id, definitions) && gunLanceTargets(state, player, definitions).length > 0);
};
