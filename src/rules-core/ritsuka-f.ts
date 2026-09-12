import type { GameState, PlayerState } from "../domain/state/types.ts";
import { getPlayedDefinitionIdsForRound } from "./card-play.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { drawCards, movePlayerCard } from "./decks.ts";
import { listUnusedRandomServantIds, mergeAdditionalServantDeck, switchActiveServantKeepingDecks } from "./identity-replacement.ts";
import { gainMana } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const RITSUKA_F_GACHA_ID = "master.ritsuka-f.skill.s1";
export const RITSUKA_F_TAG_ID = "master.ritsuka-f.skill.s1a";
export const RITSUKA_F_CHAIN_ID = "master.ritsuka-f.skill.ascension";
export const RITSUKA_F_HANDLER = "core.ritsuka-f-dual-servant";

export const RITSUKA_F_TAG_ABILITY = "tag";
export const RITSUKA_F_CHAIN_STRENGTH = "command-chain-strength";
export const RITSUKA_F_CHAIN_AGILITY = "command-chain-agility";
export const RITSUKA_F_CHAIN_MAGIC = "command-chain-magic";
export const RITSUKA_F_CHAIN_UNIQUE_GROUP = "ritsuka-f-command-chain";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function fighterId(player: PlayerState): string | undefined {
  return typeof player.flags.ritsukaFFighterServantId === "string" ? player.flags.ritsukaFFighterServantId : undefined;
}

function supportId(player: PlayerState): string | undefined {
  return typeof player.flags.ritsukaFSupportServantId === "string" ? player.flags.ritsukaFSupportServantId : undefined;
}

function initializeDualServants(context: Parameters<SkillHandler>[0]) {
  const { state, player, runtimeCatalog, definitions, randomInt } = context;
  if (player.flags.ritsukaFDualServantInitialized === true) return { initialized: false };
  if (!runtimeCatalog || !definitions || !randomInt || !player.servantId) throw new Error("RITSUKA_F_GACHA_CONTEXT_REQUIRED");
  const candidates = listUnusedRandomServantIds(state, runtimeCatalog);
  if (candidates.length === 0) throw new Error("RITSUKA_F_SUPPORT_SERVANT_UNAVAILABLE");
  const selectedIndex = randomInt(candidates.length);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= candidates.length) throw new Error("RITSUKA_F_SUPPORT_RANDOM_INVALID");
  const fighterServantId = player.servantId;
  const supportServantId = candidates[selectedIndex];

  // Standard setup has already dealt the first preparation hand before the
  // game.started event. Return it before merging so the initial hand is drawn
  // from the authoritative combined two-Servant deck.
  const openingHandSize = player.hand.length;
  for (const instanceId of [...player.hand]) {
    movePlayerCard(state, player.id, instanceId, "deck");
    const card = state.cards[instanceId];
    card.face = "down";
    card.active = false;
    card.residual = false;
  }
  const addedDeckInstanceIds = mergeAdditionalServantDeck(state, player.id, supportServantId, runtimeCatalog, randomInt);
  player.flags.startingDeckSize = player.deck.length;
  const redrawnInstanceIds = openingHandSize > 0
    ? drawCards(state, player.id, openingHandSize, randomInt, definitions)
    : [];

  player.flags.ritsukaFFighterServantId = fighterServantId;
  player.flags.ritsukaFSupportServantId = supportServantId;
  player.flags.ritsukaFDualServantInitialized = true;
  return { initialized: true, fighterServantId, supportServantId, addedDeckInstanceIds, redrawnInstanceIds };
}

function useTag(context: Parameters<SkillHandler>[0]) {
  const { state, player, runtimeCatalog, definitions, randomInt, emitEvent } = context;
  if (!runtimeCatalog || !definitions || !randomInt) throw new Error("RITSUKA_F_TAG_CONTEXT_REQUIRED");
  if (state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("RITSUKA_F_TAG_WINDOW_INVALID");
  const currentFighter = fighterId(player);
  const currentSupport = supportId(player);
  if (!currentFighter || !currentSupport || player.servantId !== currentFighter) throw new Error("RITSUKA_F_TAG_STATE_INVALID");

  const discardedInstanceIds = [...player.hand];
  for (const instanceId of discardedInstanceIds) {
    movePlayerCard(state, player.id, instanceId, "discard");
    const card = state.cards[instanceId];
    card.face = "up";
    card.active = false;
    card.residual = false;
    emitEvent?.("card.discarded", { playerId: player.id, instanceId, definitionId: card.definitionId, sourceId: RITSUKA_F_TAG_ID, method: "tag" });
  }
  const drawnInstanceIds = drawCards(state, player.id, 3, randomInt, definitions);
  const switched = switchActiveServantKeepingDecks(state, player.id, currentSupport, runtimeCatalog, emitEvent);
  player.flags.ritsukaFFighterServantId = currentSupport;
  player.flags.ritsukaFSupportServantId = currentFighter;
  return { discardedInstanceIds, drawnInstanceIds, fighterServantId: currentSupport, supportServantId: currentFighter, ...switched };
}

function sharedChainAttributes(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): Set<string> {
  const ids = getPlayedDefinitionIdsForRound(state, player.id, state.round);
  const attributes = ids.map((id) => definitions[id] ? new Set(getCardAttributes(definitions[id])) : new Set<string>());
  const supported = ["力量", "迅捷", "魔术"];
  return new Set(supported.filter((attribute) => attributes.filter((set) => set.has(attribute as never)).length >= 2));
}

function chainAttributeForAbility(abilityId: string | undefined): string | undefined {
  if (abilityId === RITSUKA_F_CHAIN_STRENGTH) return "力量";
  if (abilityId === RITSUKA_F_CHAIN_AGILITY) return "迅捷";
  if (abilityId === RITSUKA_F_CHAIN_MAGIC) return "魔术";
  return undefined;
}

function useCommandChain(state: GameState, player: PlayerState, abilityId: string | undefined, definitions: Record<string, CardDefinition>) {
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("RITSUKA_F_CHAIN_WINDOW_INVALID");
  const attribute = chainAttributeForAbility(abilityId);
  if (!attribute || !sharedChainAttributes(state, player, definitions).has(attribute)) throw new Error("RITSUKA_F_CHAIN_SHARED_ATTRIBUTE_REQUIRED");
  if (attribute === "力量") {
    player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 3;
    return { attribute, powerBonus: 3 };
  }
  if (attribute === "迅捷") {
    player.flags.nextRoundTotalPowerBonus = Number(player.flags.nextRoundTotalPowerBonus ?? 0) + 5;
    return { attribute, nextRoundPowerBonus: 5 };
  }
  return { attribute, manaGained: gainMana(player, 2) };
}

export const useRitsukaFDualServant: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions } = context;
  const data = isRecord(payload) ? payload : {};
  if (skill.id === RITSUKA_F_GACHA_ID) {
    if (data.eventType !== "game.started") return;
    return initializeDualServants(context);
  }
  if (skill.id === RITSUKA_F_TAG_ID) {
    if (data.abilityId !== RITSUKA_F_TAG_ABILITY) throw new Error("RITSUKA_F_TAG_ABILITY_INVALID");
    return useTag(context);
  }
  if (skill.id === RITSUKA_F_CHAIN_ID) {
    if (!definitions) throw new Error("RITSUKA_F_CHAIN_DEFINITIONS_REQUIRED");
    return useCommandChain(state, player, typeof data.abilityId === "string" ? data.abilityId : undefined, definitions);
  }
};

export const isRitsukaFDualServantLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId) return false;
  if (skill.id === RITSUKA_F_TAG_ID && ability?.id === RITSUKA_F_TAG_ABILITY) {
    return state.phase === "outpost" && Boolean(fighterId(player) && supportId(player) && player.servantId === fighterId(player));
  }
  if (skill.id === RITSUKA_F_CHAIN_ID) {
    const attribute = chainAttributeForAbility(ability?.id);
    return state.phase === "action" && Boolean(attribute && sharedChainAttributes(state, player, definitions).has(attribute));
  }
  return false;
};
