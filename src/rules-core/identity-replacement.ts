import type { GameState, PlayerState } from "../domain/state/types.ts";
import { createOwnedCardInstance, movePlayerCard, removePhysicalCardFromGame, shufflePlayerDeck } from "./decks.ts";
import type { SkillRuntimeCatalog } from "./skill-types.ts";

export const REPLACEMENT_ONLY_SERVANT_TAG = "replacement-only-servant";

function sourceSkillIds(catalog: SkillRuntimeCatalog, ownerType: "master" | "servant", ownerId: string): Set<string> {
  return new Set(catalog.skillDefinitions.filter((skill) => skill.ownerType === ownerType && skill.ownerId === ownerId).map((skill) => skill.id));
}

function clearLingeringRulesFromSources(state: GameState, sourceIds: Set<string>): void {
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => !sourceIds.has(modifier.sourceId));
  state.scheduledEffects = (state.scheduledEffects ?? []).filter((effect) => !sourceIds.has(effect.sourceId));
  state.effectQueue = (state.effectQueue ?? []).filter((effect) => !sourceIds.has(effect.sourceId));
  for (const candidate of Object.values(state.players)) {
    candidate.cardRuleModifiers = (candidate.cardRuleModifiers ?? []).filter((modifier) => !sourceIds.has(modifier.sourceId));
    candidate.skillUseBlocks = (candidate.skillUseBlocks ?? []).filter((block) => !sourceIds.has(block.sourceId));
    candidate.skillUsageLimitOverrides = (candidate.skillUsageLimitOverrides ?? []).filter((override) => !sourceIds.has(override.sourceId));
    candidate.abilityReuseGrants = (candidate.abilityReuseGrants ?? []).filter((grant) => !sourceIds.has(grant.sourceId));
  }
}

function removeOwnedPackage(
  state: GameState,
  ownerPlayerId: string,
  originKey: "originMasterId" | "originServantId",
  originId: string,
  sourceIds: Set<string>,
): string[] {
  const removed: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (card.zone === "removed") continue;
    const belongsByOrigin = card[originKey] === originId;
    const belongsByDefinition = card.ownerPlayerId === ownerPlayerId && sourceIds.has(card.definitionId);
    if (!belongsByOrigin && !belongsByDefinition) continue;
    removePhysicalCardFromGame(state, card.instanceId);
    removed.push(card.instanceId);
  }
  clearLingeringRulesFromSources(state, sourceIds);
  return removed;
}

/** Immediately remove every component belonging to the player's current Servant.
 * The identity value is intentionally retained so a later rule can draw/replace
 * the Servant at a different timing point. Master cards and effects are untouched. */
export function killPlayerServantPackage(
  state: GameState,
  playerId: string,
  catalog: SkillRuntimeCatalog,
  emitEvent?: (type: string, payload: unknown) => void,
): { servantId: string; removedInstanceIds: string[] } {
  const player = state.players[playerId];
  if (!player || player.eliminated || !player.servantId) throw new Error("SERVANT_KILL_PLAYER_INVALID");
  const servantId = player.servantId;
  const removedInstanceIds = removeOwnedPackage(state, playerId, "originServantId", servantId, sourceSkillIds(catalog, "servant", servantId));
  player.flags.servantKilled = true;
  emitEvent?.("servant.killed", { playerId, servantId, removedInstanceIds: [...removedInstanceIds] });
  return { servantId, removedInstanceIds };
}

function uniqueInstanceId(state: GameState, prefix: string): string {
  let index = 1;
  while (state.cards[`${prefix}:${index}`]) index += 1;
  return `${prefix}:${index}`;
}

function shuffle<T>(items: T[], randomInt: (maxExclusive: number) => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const chosen = randomInt(index + 1);
    if (!Number.isInteger(chosen) || chosen < 0 || chosen > index) throw new Error("IDENTITY_REPLACEMENT_RANDOM_INVALID");
    [result[index], result[chosen]] = [result[chosen], result[index]];
  }
  return result;
}

function createInitialSkills(
  state: GameState,
  player: PlayerState,
  ownerType: "master" | "servant",
  ownerId: string,
  catalog: SkillRuntimeCatalog,
): string[] {
  const definitions = catalog.skillDefinitions.filter((skill) => skill.ownerType === ownerType && skill.ownerId === ownerId && skill.initiallyOwned !== false);
  const zone = ownerType === "master" ? "master-skills" : "servant-skills";
  return definitions.map((skill) => createOwnedCardInstance(state, player.id, {
    instanceId: uniqueInstanceId(state, `${player.id}:replacement:${state.round}:${state.revision}:${ownerType}:${skill.id}`),
    definitionId: skill.id,
    ...(ownerType === "master" ? { originMasterId: ownerId } : { originServantId: ownerId }),
    zone,
    face: ownerType === "master" ? "up" : "down",
    active: false,
  }).instanceId);
}

export function replacePlayerMasterPackage(
  state: GameState,
  playerId: string,
  nextMasterId: string,
  catalog: SkillRuntimeCatalog,
  emitEvent?: (type: string, payload: unknown) => void,
): { previousMasterId: string; removedInstanceIds: string[]; newSkillInstanceIds: string[] } {
  const player = state.players[playerId];
  if (!player || player.eliminated || !player.masterId) throw new Error("MASTER_REPLACEMENT_PLAYER_INVALID");
  if (Object.values(state.players).some((candidate) => candidate.id !== playerId && !candidate.eliminated && candidate.masterId === nextMasterId)) {
    throw new Error("MASTER_REPLACEMENT_IDENTITY_TAKEN");
  }
  const hasDefinition = catalog.skillDefinitions.some((skill) => skill.ownerType === "master" && skill.ownerId === nextMasterId);
  if (!hasDefinition) throw new Error("MASTER_REPLACEMENT_DEFINITION_MISSING");
  const previousMasterId = player.masterId;
  if (typeof player.flags.firstMasterId !== "string") player.flags.firstMasterId = previousMasterId;
  const removedInstanceIds = removeOwnedPackage(state, playerId, "originMasterId", previousMasterId, sourceSkillIds(catalog, "master", previousMasterId));
  player.masterId = nextMasterId;
  const newSkillInstanceIds = createInitialSkills(state, player, "master", nextMasterId, catalog);
  player.flags.masterReplacementCount = Number(player.flags.masterReplacementCount ?? 0) + 1;
  emitEvent?.("master.replaced", { playerId, previousMasterId, masterId: nextMasterId, removedInstanceIds: [...removedInstanceIds] });
  return { previousMasterId, removedInstanceIds, newSkillInstanceIds };
}

export function listUnusedRandomServantIds(state: GameState, catalog: SkillRuntimeCatalog): string[] {
  const used = new Set<string>();
  for (const candidate of Object.values(state.players)) if (candidate.servantId) used.add(candidate.servantId);
  for (const card of Object.values(state.cards)) if (card.originServantId) used.add(card.originServantId);
  const recorded = Array.isArray(state.modeState.usedServantIds) ? state.modeState.usedServantIds : [];
  for (const id of recorded) if (typeof id === "string") used.add(id);
  const replacementOnly = new Set(catalog.skillDefinitions
    .filter((skill) => skill.tags?.includes(REPLACEMENT_ONLY_SERVANT_TAG))
    .map((skill) => skill.ownerId));
  return Object.keys(catalog.servantDecks).filter((id) => !used.has(id) && !replacementOnly.has(id)).sort();
}

/** Add another Servant's ordinary deck to this player's current deck without changing the active identity or skill package. */
export function mergeAdditionalServantDeck(
  state: GameState,
  playerId: string,
  servantId: string,
  catalog: SkillRuntimeCatalog,
  randomInt: (maxExclusive: number) => number,
): string[] {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("SERVANT_DECK_MERGE_PLAYER_INVALID");
  if (Object.values(state.players).some((candidate) => candidate.id !== playerId && !candidate.eliminated && candidate.servantId === servantId)) {
    throw new Error("SERVANT_DECK_MERGE_IDENTITY_TAKEN");
  }
  if (Object.values(state.cards).some((card) => card.ownerPlayerId !== playerId && card.originServantId === servantId && card.zone !== "removed")) {
    throw new Error("SERVANT_DECK_MERGE_IDENTITY_TAKEN");
  }
  const deckDefinitions = catalog.servantDecks[servantId];
  if (!deckDefinitions?.length) throw new Error("SERVANT_DECK_MERGE_DECK_MISSING");
  const created = deckDefinitions.map((definitionId) => createOwnedCardInstance(state, player.id, {
    instanceId: uniqueInstanceId(state, `${player.id}:merged-servant:${servantId}`),
    definitionId,
    originServantId: servantId,
    zone: "deck",
    face: "down",
    active: false,
  }).instanceId);
  shufflePlayerDeck(state, player.id, randomInt);
  state.modeState.usedServantIds = [...new Set([
    ...(Array.isArray(state.modeState.usedServantIds) ? state.modeState.usedServantIds.filter((id): id is string => typeof id === "string") : []),
    servantId,
  ])];
  return created;
}

/**
 * Switch only the active Servant identity and its physical skill package while
 * preserving all ordinary cards from every already-owned Servant deck.
 */
export function switchActiveServantKeepingDecks(
  state: GameState,
  playerId: string,
  nextServantId: string,
  catalog: SkillRuntimeCatalog,
  emitEvent?: (type: string, payload: unknown) => void,
): { previousServantId: string; removedSkillInstanceIds: string[]; newSkillInstanceIds: string[] } {
  const player = state.players[playerId];
  if (!player || player.eliminated || !player.servantId) throw new Error("SERVANT_TAG_PLAYER_INVALID");
  if (player.servantId === nextServantId) return { previousServantId: player.servantId, removedSkillInstanceIds: [], newSkillInstanceIds: [] };
  if (Object.values(state.players).some((candidate) => candidate.id !== playerId && !candidate.eliminated && candidate.servantId === nextServantId)) {
    throw new Error("SERVANT_TAG_IDENTITY_TAKEN");
  }
  if (!Object.values(state.cards).some((card) => card.ownerPlayerId === playerId && card.originServantId === nextServantId)) {
    throw new Error("SERVANT_TAG_DECK_NOT_OWNED");
  }
  const nextSkills = catalog.skillDefinitions.filter((skill) => skill.ownerType === "servant" && skill.ownerId === nextServantId && skill.initiallyOwned !== false);
  if (nextSkills.length === 0) throw new Error("SERVANT_TAG_SKILLS_MISSING");

  const previousServantId = player.servantId;
  const previousSkillIds = sourceSkillIds(catalog, "servant", previousServantId);
  const removedSkillInstanceIds: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (card.ownerPlayerId !== playerId || card.zone === "removed" || !previousSkillIds.has(card.definitionId)) continue;
    removePhysicalCardFromGame(state, card.instanceId);
    removedSkillInstanceIds.push(card.instanceId);
  }
  clearLingeringRulesFromSources(state, previousSkillIds);

  player.servantId = nextServantId;
  player.form = null;
  player.trueNameRevealed = false;
  const newSkillInstanceIds = nextSkills.map((skill) => {
    const reusable = Object.values(state.cards).find((card) => card.ownerPlayerId === playerId
      && card.originServantId === nextServantId && card.definitionId === skill.id && card.zone === "removed");
    if (reusable) {
      movePlayerCard(state, playerId, reusable.instanceId, "servant-skills");
      reusable.face = "down";
      reusable.active = false;
      reusable.residual = false;
      return reusable.instanceId;
    }
    return createOwnedCardInstance(state, player.id, {
      instanceId: uniqueInstanceId(state, `${player.id}:tag-servant:${nextServantId}:${skill.id}`),
      definitionId: skill.id,
      originServantId: nextServantId,
      zone: "servant-skills",
      face: "down",
      active: false,
    }).instanceId;
  });
  emitEvent?.("servant.tagged", { playerId, previousServantId, servantId: nextServantId, removedSkillInstanceIds: [...removedSkillInstanceIds], newSkillInstanceIds: [...newSkillInstanceIds] });
  return { previousServantId, removedSkillInstanceIds, newSkillInstanceIds };
}

export function replacePlayerServantPackage(
  state: GameState,
  playerId: string,
  nextServantId: string,
  catalog: SkillRuntimeCatalog,
  randomInt: (maxExclusive: number) => number,
  emitEvent?: (type: string, payload: unknown) => void,
): { previousServantId: string; removedInstanceIds: string[]; newDeckInstanceIds: string[]; newSkillInstanceIds: string[] } {
  const player = state.players[playerId];
  if (!player || player.eliminated || !player.servantId) throw new Error("SERVANT_REPLACEMENT_PLAYER_INVALID");
  if (Object.values(state.players).some((candidate) => candidate.id !== playerId && !candidate.eliminated && candidate.servantId === nextServantId)) {
    throw new Error("SERVANT_REPLACEMENT_IDENTITY_TAKEN");
  }
  const deckDefinitions = catalog.servantDecks[nextServantId];
  if (!deckDefinitions?.length) throw new Error("SERVANT_REPLACEMENT_DECK_MISSING");
  const nextSkillDefinitions = catalog.skillDefinitions.filter((skill) => skill.ownerType === "servant" && skill.ownerId === nextServantId);
  if (nextSkillDefinitions.length === 0) throw new Error("SERVANT_REPLACEMENT_SKILLS_MISSING");
  const previousServantId = player.servantId;
  if (typeof player.flags.firstServantId !== "string") player.flags.firstServantId = previousServantId;
  const oldSkillIds = sourceSkillIds(catalog, "servant", previousServantId);
  const removedInstanceIds = removeOwnedPackage(state, playerId, "originServantId", previousServantId, oldSkillIds);
  player.servantId = nextServantId;
  delete player.flags.servantKilled;
  player.form = null;
  player.trueNameRevealed = false;
  const prefix = `${player.id}:replacement:${state.round}:${state.revision}:servant:${nextServantId}`;
  const createdDeck = deckDefinitions.map((definitionId) => createOwnedCardInstance(state, player.id, {
    instanceId: uniqueInstanceId(state, `${prefix}:deck`), definitionId, originServantId: nextServantId, zone: "deck", face: "down", active: false,
  }).instanceId);
  const shuffledNewDeck = shuffle(createdDeck, randomInt);
  const survivingDeck = player.deck.filter((instanceId) => !createdDeck.includes(instanceId));
  player.deck = [...survivingDeck, ...shuffledNewDeck];
  const newSkillInstanceIds = createInitialSkills(state, player, "servant", nextServantId, catalog);
  player.flags.servantReplacementCount = Number(player.flags.servantReplacementCount ?? 0) + 1;
  state.modeState.usedServantIds = [...new Set([...(Array.isArray(state.modeState.usedServantIds) ? state.modeState.usedServantIds.filter((id): id is string => typeof id === "string") : []), previousServantId, nextServantId])];
  emitEvent?.("servant.replaced", { playerId, previousServantId, servantId: nextServantId, removedInstanceIds: [...removedInstanceIds] });
  return { previousServantId, removedInstanceIds, newDeckInstanceIds: [...shuffledNewDeck], newSkillInstanceIds };
}
