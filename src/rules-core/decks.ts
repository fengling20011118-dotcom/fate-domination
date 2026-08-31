import type { CardInstance, GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { getClosedCardZone } from "./card-semantics.ts";

export interface OwnedCardCreateOptions {
  instanceId: string;
  definitionId: string;
  zone: "hand" | "deck" | "discard" | "attack" | "removed" | "master-skills" | "servant-skills";
  face?: "up" | "down";
  active?: boolean;
  residual?: boolean;
  temporary?: boolean;
  createdByEffectId?: string;
}

export interface DerivedCardCreateOptions extends Omit<OwnedCardCreateOptions, "createdByEffectId"> {
  /** The serialized effect that created this physical card instance. */
  sourceEffectId: string;
}

/** Creates one physical card instance and attaches it to the owner's zone list. */
export function createOwnedCardInstance(state: GameState, playerId: string, options: OwnedCardCreateOptions): CardInstance {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  if (!options.instanceId || !options.definitionId) throw new Error("CARD_INSTANCE_INPUT_INVALID");
  if (options.createdByEffectId !== undefined && (typeof options.createdByEffectId !== "string" || options.createdByEffectId.length === 0)) {
    throw new Error("CARD_SOURCE_EFFECT_INVALID");
  }
  if (state.cards[options.instanceId]) throw new Error("CARD_INSTANCE_ID_DUPLICATE");
  const instance: CardInstance = {
    instanceId: options.instanceId,
    definitionId: options.definitionId,
    ownerPlayerId: playerId,
    controllerPlayerId: playerId,
    zone: options.zone,
    face: options.face ?? (options.zone === "master-skills" || options.zone === "servant-skills" ? "up" : "down"),
    active: options.active ?? false,
    residual: options.residual ?? false,
    temporary: options.temporary ?? false,
    modifiers: [],
    ...(options.createdByEffectId ? { createdByEffectId: options.createdByEffectId } : {}),
  };
  state.cards[instance.instanceId] = instance;
  if (options.zone === "hand") player.hand.push(instance.instanceId);
  else if (options.zone === "deck") player.deck.push(instance.instanceId);
  else if (options.zone === "discard") player.discard.push(instance.instanceId);
  else if (options.zone === "attack") player.attack.push(instance.instanceId);
  else if (options.zone === "master-skills") player.masterSkills.push(instance.instanceId);
  else if (options.zone === "servant-skills") player.servantSkills.push(instance.instanceId);
  return instance;
}

/** Creates a generated/derived card with mandatory provenance metadata. */
export function createDerivedCardInstance(state: GameState, playerId: string, options: DerivedCardCreateOptions): CardInstance {
  if (typeof options.sourceEffectId !== "string" || options.sourceEffectId.length === 0) throw new Error("CARD_SOURCE_EFFECT_INVALID");
  return createOwnedCardInstance(state, playerId, { ...options, createdByEffectId: options.sourceEffectId });
}

/**
 * Creates a derived-card batch atomically: every instance ID, source effect and
 * owner is validated before the first card is attached to a player zone.
 */
export function createDerivedCardInstances(state: GameState, playerId: string, options: DerivedCardCreateOptions[]): CardInstance[] {
  if (!Array.isArray(options) || options.length === 0) throw new Error("CARD_BATCH_EMPTY");
  if (!state.players[playerId]) throw new Error("PLAYER_NOT_FOUND");
  const instanceIds = new Set<string>();
  for (const option of options) {
    if (!option || typeof option !== "object" || !option.instanceId || !option.definitionId) throw new Error("CARD_INSTANCE_INPUT_INVALID");
    if (instanceIds.has(option.instanceId) || state.cards[option.instanceId]) throw new Error("CARD_INSTANCE_ID_DUPLICATE");
    instanceIds.add(option.instanceId);
    if (typeof option.sourceEffectId !== "string" || option.sourceEffectId.length === 0) throw new Error("CARD_SOURCE_EFFECT_INVALID");
  }
  return options.map((option) => createDerivedCardInstance(state, playerId, option));
}

function removeFrom(list: string[], value: string): void {
  const index = list.indexOf(value);
  if (index >= 0) list.splice(index, 1);
}

function randomShuffle(values: string[], randomInt: (maxExclusive: number) => number): string[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/** Move marked attack cards back to the owner's deck when that player loses. */
export function returnCardsToDeckOnDefeat(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  const returned = player.attack.filter((instanceId) => definitions[state.cards[instanceId]?.definitionId ?? ""]?.returnToDeckOnDefeat === true);
  for (const instanceId of returned) {
    movePlayerCard(state, playerId, instanceId, "deck");
    const card = state.cards[instanceId];
    card.face = "down";
    card.active = false;
    card.residual = false;
  }
  if (returned.length > 0) player.deck = randomShuffle(player.deck, randomInt);
  return returned;
}

export function initializePlayerDeck(
  state: GameState,
  playerId: string,
  definitionIds: string[],
  randomInt: (maxExclusive: number) => number,
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  player.hand = [];
  player.deck = [];
  player.discard = [];
  player.attack = [];
  player.masterSkills = [];
  player.servantSkills = [];

  const instances: string[] = [];
  definitionIds.forEach((definitionId, index) => {
    const instanceId = `${playerId}:card:${index + 1}`;
    const instance: CardInstance = {
      instanceId,
      definitionId,
      ownerPlayerId: playerId,
      controllerPlayerId: playerId,
      zone: "deck",
      face: "down",
      active: false,
      residual: false,
      temporary: false,
      modifiers: [],
    };
    state.cards[instanceId] = instance;
    instances.push(instanceId);
  });
  player.deck = randomShuffle(instances, randomInt);
  return instances;
}

export function initializePlayerSkillCards(
  state: GameState,
  playerId: string,
  skillIds: Array<{ id: string; ownerType: "master" | "servant" }>,
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  const instances: string[] = [];
  skillIds.forEach((skill, index) => {
    const instanceId = `${playerId}:skill:${index + 1}`;
    state.cards[instanceId] = {
      instanceId,
      definitionId: skill.id,
      ownerPlayerId: playerId,
      controllerPlayerId: playerId,
      zone: skill.ownerType === "master" ? "master-skills" : "servant-skills",
      face: "up",
      active: false,
      residual: false,
      temporary: false,
      modifiers: [],
    };
    (skill.ownerType === "master" ? player.masterSkills : player.servantSkills).push(instanceId);
    instances.push(instanceId);
  });
  return instances;
}

export function drawCards(
  state: GameState,
  playerId: string,
  count: number,
  randomInt: (maxExclusive: number) => number,
): string[] {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  const drawn: string[] = [];

  for (let draw = 0; draw < count; draw += 1) {
    if (player.deck.length === 0 && player.discard.length > 0) {
      player.deck = randomShuffle(player.discard, randomInt);
      player.discard = [];
      for (const instanceId of player.deck) state.cards[instanceId].zone = "deck";
    }
    const instanceId = player.deck.shift();
    if (!instanceId) break;
    player.hand.push(instanceId);
    state.cards[instanceId].zone = "hand";
    state.cards[instanceId].face = "down";
    state.cards[instanceId].active = false;
    drawn.push(instanceId);
  }
  return drawn;
}

export function movePlayerCard(state: GameState, playerId: string, instanceId: string, zone: "hand" | "deck" | "attack" | "discard" | "removed" | "master-skills" | "servant-skills"): void {
  const player = state.players[playerId];
  const card = state.cards[instanceId];
  if (!player || !card || card.ownerPlayerId !== playerId) throw new Error("CARD_INSTANCE_NOT_OWNED");
  removeFrom(player.hand, instanceId);
  removeFrom(player.deck, instanceId);
  removeFrom(player.discard, instanceId);
  removeFrom(player.attack, instanceId);
  removeFrom(player.masterSkills, instanceId);
  removeFrom(player.servantSkills, instanceId);
  if (zone === "hand") player.hand.push(instanceId);
  if (zone === "deck") player.deck.push(instanceId);
  if (zone === "attack") player.attack.push(instanceId);
  if (zone === "discard") player.discard.push(instanceId);
  if (zone === "master-skills") player.masterSkills.push(instanceId);
  if (zone === "servant-skills") player.servantSkills.push(instanceId);
  card.zone = zone;
}

/** Close an activated card and return it to its rules-defined resting zone. */
export function closePlayerCard(
  state: GameState,
  playerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  options: { removeFromGame?: boolean } = {},
): void {
  const player = state.players[playerId];
  const card = state.cards[instanceId];
  if (!player || !card || card.ownerPlayerId !== playerId) throw new Error("CARD_INSTANCE_NOT_OWNED");
  const definition = definitions[card.definitionId];
  if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");
  const restingZone = getClosedCardZone(definition, card, options.removeFromGame);
  if (restingZone === "master-skills" || restingZone === "servant-skills") {
    movePlayerCard(state, playerId, instanceId, restingZone);
    card.face = "up";
  } else {
    movePlayerCard(state, playerId, instanceId, restingZone);
    card.face = "down";
  }
  card.active = false;
  card.residual = false;
}
