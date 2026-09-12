import type { GameState, PlayerState } from "../domain/state/types.ts";
import { joinOwnedCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { blockNormalCardDrawThroughRound } from "./decks.ts";
import { blockManaGainThroughRound, gainVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const SITONAI_COMBINATION_ID = "servant.sitonai.skill.sc-sitonai-1";
export const SITONAI_FIMBUL_ID = "servant.sitonai.skill.sc-sitonai-2";
export const SITONAI_COMBINATION_HANDLER = "core.sitonai-combination-attack";
export const SITONAI_FIMBUL_HANDLER = "core.sitonai-pohjola-fimbul";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkillDefinition(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definition?.linkedSkillId === skillId;
}

function ownedSkillInZone(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
  zone: "servant-skills" | "attack",
) {
  const ids = zone === "attack" ? player.attack : player.servantSkills;
  return ids.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === zone
      && matchesSkillDefinition(definition, card.definitionId, skillId));
  });
}

function activeOwnedSkillAttack(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  const card = ownedSkillInZone(state, player, skillId, definitions, "attack");
  return card?.face === "up" && card.active ? card : undefined;
}

/**
 * English original: "If you control exactly one Strength and one Magic attack".
 * The named Strength and Magic attacks must be distinct. Other active attacks
 * with neither attribute do not change those exact attribute counts.
 */
export function hasSitonaiCombinationPair(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  const active = player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.zone === "attack" && card.face === "up" && card.active);
  });
  const strengthIds = active.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && getCardInstanceAttributes(card, definition, state, definitions).includes("力量"));
  });
  const magicIds = active.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && getCardInstanceAttributes(card, definition, state, definitions).includes("魔术"));
  });
  return strengthIds.length === 1 && magicIds.length === 1 && strengthIds[0] !== magicIds[0];
}

export const useSitonaiCombinationAttack: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("SITONAI_COMBINATION_DEFINITIONS_REQUIRED");
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : undefined;
  if (eventType === "combat.resolved") {
    const source = activeOwnedSkillAttack(state, player, skill.id, definitions);
    if (!source?.reversed || !event) return;
    const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
    if (winnerIds.includes(player.id)) gainVictoryPoints(player, 4);
    return;
  }

  const abilityId = isRecord(payload) && typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  if (abilityId !== "combination-join") throw new Error("SITONAI_COMBINATION_ABILITY_INVALID");
  if (state.phase !== "action" || state.activePlayerId !== player.id || !hasSitonaiCombinationPair(state, player.id, definitions)) {
    throw new Error("SITONAI_COMBINATION_CONDITION_NOT_MET");
  }
  const source = ownedSkillInZone(state, player, skill.id, definitions, "servant-skills");
  if (!source) throw new Error("SITONAI_COMBINATION_SOURCE_UNAVAILABLE");
  const result = joinOwnedCardToAttack(state, player.id, source.instanceId, definitions, {
    manaCost: 3,
    allowedSourceZones: ["servant-skills"],
  });
  return { joinedInstanceId: source.instanceId, paidMana: result.paidMana };
};

export const isSitonaiCombinationLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== "combination-join") return false;
  return state.phase === "action" && state.activePlayerId === playerId
    && Boolean(ownedSkillInZone(state, player, skill.id, definitions, "servant-skills"))
    && hasSitonaiCombinationPair(state, playerId, definitions);
};

export const useSitonaiPohjolaFimbul: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("SITONAI_FIMBUL_DEFINITIONS_REQUIRED");
  const abilityId = isRecord(payload) && typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  if (abilityId !== "freeze-forces") throw new Error("SITONAI_FIMBUL_ABILITY_INVALID");
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("SITONAI_FIMBUL_WINDOW_INVALID");
  const source = activeOwnedSkillAttack(state, player, skill.id, definitions);
  if (!source) throw new Error("SITONAI_FIMBUL_SOURCE_INACTIVE");

  const throughRound = state.round + 1;
  if (source.reversed === true) {
    for (const target of Object.values(state.players)) {
      if (!target.eliminated) blockManaGainThroughRound(target, throughRound);
    }
    return { mode: "mana-gain", throughRound };
  }
  for (const target of Object.values(state.players)) {
    if (!target.eliminated) blockNormalCardDrawThroughRound(state, target.id, throughRound);
  }
  return { mode: "normal-card-draw", throughRound };
};

export const isSitonaiPohjolaFimbulLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "freeze-forces" && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkillAttack(state, player, skill.id, definitions));
};
