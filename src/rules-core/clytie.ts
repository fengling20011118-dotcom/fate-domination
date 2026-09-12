import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardAttribute, CardDefinition } from "./content-types.ts";
import { createDerivedCardInstance, drawCards } from "./decks.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const CLYTIE_STARRY_NIGHT_ID = "servant.clytie.skill.sc-clytie-1";
export const CLYTIE_WATER_NYMPH_ID = "servant.clytie.skill.sc-clytie-2";
export const CLYTIE_STARRY_NIGHT_HANDLER = "core.clytie-starry-night";
export const CLYTIE_WATER_NYMPH_HANDLER = "core.clytie-water-nymph";
export const CLYTIE_FOREIGNER_CLASS_ID = "servant.clytie.skill.sc-clytie-4";

export const OUTER_GOD_LIFE_DEFINITION_IDS = [
  "card.x-foreign-life",
  "card.x-foreigner",
  "servant.molay.skill.sc-molay-4",
  "servant.abigail.skill.sc-abigail-4",
  "servant.hokusai.skill.sc-hokusai-4",
  "servant.voyager.skill.sc-voyager-4",
  "servant.clytie.skill.sc-clytie-4",
  "card.skill.servant.molay.skill.sc-molay-4",
  "card.skill.servant.abigail.skill.sc-abigail-4",
  "card.skill.servant.hokusai.skill.sc-hokusai-4",
  "card.skill.servant.voyager.skill.sc-voyager-4",
  "card.skill.servant.clytie.skill.sc-clytie-4",
] as const;

const OUTER_GOD_LIFE_DEFINITION_ID_SET = new Set<string>(OUTER_GOD_LIFE_DEFINITION_IDS);

/** Stable semantic predicate shared by every Foreigner Class / Outer God Life effect. */
export function isOuterGodLifeDefinitionId(definitionId: string | undefined): boolean {
  return typeof definitionId === "string" && OUTER_GOD_LIFE_DEFINITION_ID_SET.has(definitionId);
}

const STARRY_NIGHT_ABILITY = "starry-night";
const WATER_NYMPH_ABILITY = "water-nymph";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.zone === "attack" && card.face === "up" && card.active
      && (card.ownerPlayerId === player.id || card.controllerPlayerId === player.id)
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function battlefieldAndScoutingPlayers(state: GameState): PlayerState[] {
  const ids = [...state.board.locations.mountain, ...state.board.locations.city, ...state.board.locations.scouting];
  return [...new Set(ids)].map((id) => state.players[id]).filter((player): player is PlayerState => Boolean(player && !player.eliminated));
}

function nextOutsideLifeInstanceId(state: GameState, playerId: string, sourceSkillId: string): string {
  const prefix = `${playerId}:outside-life:${sourceSkillId}:`;
  const next = Object.keys(state.cards).filter((id) => id.startsWith(prefix)).length + 1;
  return `${prefix}${next}`;
}

function createOutsideLifeInHand(
  state: GameState,
  sourcePlayerId: string,
  target: PlayerState,
  sourceSkillId: string,
  definitions: Record<string, CardDefinition>,
): string {
  if (!definitions[CLYTIE_FOREIGNER_CLASS_ID]) throw new Error("CLYTIE_OUTER_GOD_LIFE_DEFINITION_MISSING");
  const instanceId = nextOutsideLifeInstanceId(state, target.id, sourceSkillId);
  createDerivedCardInstance(state, target.id, {
    instanceId,
    definitionId: CLYTIE_FOREIGNER_CLASS_ID,
    zone: "hand",
    face: "down",
    active: false,
    residual: false,
    sourceEffectId: `${sourceSkillId}:outside-game-life`,
    createdByPlayerId: sourcePlayerId,
  });
  return instanceId;
}

function installGlobalOuterLifePowerBonus(state: GameState, player: PlayerState, sourceInstanceId: string, sourceSkillId: string): void {
  const id = `${sourceSkillId}:outer-life-plus-three:${state.round}:${sourceInstanceId}`;
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
  state.activeRuleModifiers.push({
    id,
    sourceId: sourceSkillId,
    sourceInstanceId,
    controllerPlayerId: player.id,
    operation: "add",
    rule: "card_power",
    scope: { subject: "all_players", cards: { definitionIds: [...OUTER_GOD_LIFE_DEFINITION_IDS] } },
    value: 3,
    duration: "round",
    createdRound: state.round,
  });
}

/** Starry Night: hidden-name branch distributes outside-game Life; revealed-name branch grants the global +3 aura. */
export const useClytieStarryNight: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("CLYTIE_STARRY_NIGHT_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== STARRY_NIGHT_ABILITY || state.phase !== "combat" || state.activePlayerId !== player.id) {
    throw new Error("CLYTIE_STARRY_NIGHT_WINDOW_INVALID");
  }
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("CLYTIE_STARRY_NIGHT_SOURCE_INACTIVE");
  if (player.trueNameRevealed) {
    installGlobalOuterLifePowerBonus(state, player, source.instanceId, skill.id);
    return { mode: "power", amount: 3, definitionIds: [...OUTER_GOD_LIFE_DEFINITION_IDS] };
  }
  const created = battlefieldAndScoutingPlayers(state).map((target) => {
    const instanceId = createOutsideLifeInHand(state, player.id, target, skill.id, definitions);
    emitEvent?.("card.created", { playerId: target.id, instanceId, definitionId: CLYTIE_FOREIGNER_CLASS_ID, zone: "hand", sourceSkillId: skill.id, source: "outside-game" });
    return { playerId: target.id, instanceId };
  });
  return { mode: "distribute", created };
};

export const isClytieStarryNightLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === STARRY_NIGHT_ABILITY && state.phase === "combat"
    && state.activePlayerId === playerId && activeOwnedSkill(state, player, skill.id, definitions));
};

function outerLifeInstanceIdsInPlay(state: GameState): string[] {
  return state.turnOrder.flatMap((playerId) => state.players[playerId]?.attack ?? []).filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.zone === "attack" && card.active && card.face === "up"
      && OUTER_GOD_LIFE_DEFINITION_IDS.includes(card.definitionId as typeof OUTER_GOD_LIFE_DEFINITION_IDS[number]));
  });
}

function addAttributes(targetAttributes: CardAttribute[] | undefined, gained: CardAttribute[]): CardAttribute[] {
  return [...new Set([...(targetAttributes ?? []), ...gained])] as CardAttribute[];
}

/** Water Nymph: draw/reveal one card per Foreigner Class card in play and add the paired card's structured attributes. */
export const useClytieWaterNymph: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, emitEvent }) => {
  if (!definitions) throw new Error("CLYTIE_WATER_NYMPH_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== WATER_NYMPH_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("CLYTIE_WATER_NYMPH_WINDOW_INVALID");
  }
  if (!player.trueNameRevealed) throw new Error("CLYTIE_WATER_NYMPH_TRUE_NAME_REQUIRED");
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("CLYTIE_WATER_NYMPH_SOURCE_INACTIVE");
  const lifeIds = outerLifeInstanceIdsInPlay(state);
  const choose = randomInt ?? (() => 0);
  const drawnIds = drawCards(state, player.id, lifeIds.length, choose, definitions);
  const pairs: Array<{ lifeInstanceId: string; revealedInstanceId: string; attributes: CardAttribute[] }> = [];
  for (let index = 0; index < drawnIds.length; index += 1) {
    const life = state.cards[lifeIds[index]];
    const revealed = state.cards[drawnIds[index]];
    const lifeDefinition = life ? definitions[life.definitionId] : undefined;
    const revealedDefinition = revealed ? definitions[revealed.definitionId] : undefined;
    if (!life || !lifeDefinition || !revealed || !revealedDefinition) throw new Error("CLYTIE_WATER_NYMPH_CARD_MISSING");
    const gained = getCardInstanceAttributes(revealed, revealedDefinition, state, definitions);
    const current = getCardInstanceAttributes(life, lifeDefinition, state, definitions);
    life.attributeOverrides = addAttributes(current, gained);
    const marker = `attribute-overrides-until-close:${skill.id}`;
    life.modifiers = [...(life.modifiers ?? []).filter((value) => value !== marker), marker];
    emitEvent?.("card.revealed", { playerId: player.id, instanceId: revealed.instanceId, definitionId: revealed.definitionId, sourceSkillId: skill.id });
    pairs.push({ lifeInstanceId: life.instanceId, revealedInstanceId: revealed.instanceId, attributes: [...gained] });
  }
  return { lifeInstanceIds: lifeIds, drawnInstanceIds: drawnIds, pairs };
};

export const isClytieWaterNymphLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && player.trueNameRevealed && ability?.id === WATER_NYMPH_ABILITY
    && state.phase === "action" && state.activePlayerId === playerId && activeOwnedSkill(state, player, skill.id, definitions));
};
