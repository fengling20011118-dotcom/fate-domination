import type { GameState, PlayerState } from "../domain/state/types.ts";
import { closePlayerCard } from "./decks.ts";
import type { CardDefinition } from "./content-types.ts";
import { installCombatLossRoundRestart } from "./combat-loss-restart.ts";
import { gainMana, gainVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const NURSERY_QUEEN_ID = "servant.nursery.skill.sc-nursery-1";
export const NURSERY_JABBERWOCK_ID = "servant.nursery.skill.sc-nursery-3";
export const NURSERY_HANDLER = "core.nursery-package";
export const NURSERY_ENGINE_ABILITY = "perpetual-engine";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function linkedSkillMatches(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return Boolean(definition && (definitionId === skillId || definition.linkedSkillId === skillId));
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === "attack"
      && card.active && card.face === "up" && linkedSkillMatches(definition, card.definitionId, skillId));
  });
}

function installQueenRestart(state: GameState, player: PlayerState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>) {
  if (event.playerId !== player.id || typeof event.instanceId !== "string" || typeof event.definitionId !== "string") return;
  const definition = definitions[event.definitionId];
  if (!linkedSkillMatches(definition, event.definitionId, NURSERY_QUEEN_ID)) return;
  const source = state.cards[event.instanceId];
  if (!source || source.controllerPlayerId !== player.id || source.zone !== "attack" || !source.active || source.face !== "up") return;
  installCombatLossRoundRestart(state, { sourceId: NURSERY_QUEEN_ID, sourceInstanceId: source.instanceId, controllerPlayerId: player.id });
  return { sourceInstanceId: source.instanceId };
}

function usePerpetualEngine(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  if (state.phase !== "outpost" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, NURSERY_QUEEN_ID, definitions)) {
    throw new Error("NURSERY_PERPETUAL_ENGINE_WINDOW_INVALID");
  }
  return { manaGained: gainMana(player, 1), victoryPointsGained: gainVictoryPoints(player, 1) };
}

function settleJabberwock(state: GameState, player: PlayerState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>) {
  const source = activeOwnedSkill(state, player, NURSERY_JABBERWOCK_ID, definitions);
  if (!source) return;
  const participantIds = Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : [];
  if (!participantIds.includes(player.id)) return;
  const revealedDefinitionId = source.playPrerequisiteTransferredDefinitionIds?.[0];
  if (!revealedDefinitionId) throw new Error("NURSERY_JABBERWOCK_REVEALED_CARD_MISSING");
  const matchingOpponentIds = participantIds.filter((id) => id !== player.id).filter((id) => {
    const opponent = state.players[id];
    return Boolean(opponent && opponent.attack.some((instanceId) => {
      const card = state.cards[instanceId];
      return Boolean(card && card.controllerPlayerId === opponent.id && card.zone === "attack" && card.active && card.face === "up"
        && card.definitionId === revealedDefinitionId);
    }));
  });
  if (matchingOpponentIds.length === 0) return { closed: false, revealedDefinitionId };
  closePlayerCard(state, player.id, source.instanceId, definitions, { ignoreCloseDeferral: true });
  return { closed: true, revealedDefinitionId, matchingOpponentIds };
}

export const useNurseryPackage: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("NURSERY_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const event = isRecord(data.event) ? data.event : {};
  if (skill.id === NURSERY_QUEEN_ID) {
    if (data.eventType === "card.played") return installQueenRestart(state, player, event, definitions);
    if (data.abilityId === NURSERY_ENGINE_ABILITY) return usePerpetualEngine(state, player, definitions);
  }
  if (skill.id === NURSERY_JABBERWOCK_ID && data.eventType === "combat.resolved") return settleJabberwock(state, player, event, definitions);
  throw new Error("NURSERY_ABILITY_INVALID");
};

export const isNurseryPackageLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || skill.id !== NURSERY_QUEEN_ID || ability?.id !== NURSERY_ENGINE_ABILITY) return false;
  return Boolean(state.phase === "outpost" && state.activePlayerId === playerId && activeOwnedSkill(state, player, NURSERY_QUEEN_ID, definitions));
};
