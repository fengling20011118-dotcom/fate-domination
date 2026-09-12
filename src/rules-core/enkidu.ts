import type { GameState, PlayerState } from "../domain/state/types.ts";
import { attachCard, detachCard, getAttachedCards, getTopAttachedCard } from "./card-attachments.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { applyChainedThroughRound } from "./player-statuses.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ENKIDU_TRANSFIGURATION_ID = "servant.enkidu.skill.sc-enkidu-1";
export const ENKIDU_ENUMA_ID = "servant.enkidu.skill.sc-enkidu-2";
export const ENKIDU_TRANSFIGURATION_HANDLER = "core.enkidu-transfiguration";
export const ENKIDU_ENUMA_HANDLER = "core.enkidu-enuma-elish";

const STACK_ABILITY = "enkidu-transfiguration-stack";
const DISCARD_ABILITY = "enkidu-transfiguration-discard";
const CHAINS_ABILITY = "enkidu-chains-of-heaven";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.zone === "attack" && card.face === "up" && card.active
      && (card.ownerPlayerId === player.id || card.controllerPlayerId === player.id)
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function basicAttackInHand(state: GameState, player: PlayerState, instanceId: string, definitions: Record<string, CardDefinition>): boolean {
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  return Boolean(card && player.hand.includes(instanceId) && definition?.cardType === "attack" && definition.basic === true);
}

function activeControlledAttacks(state: GameState, player: PlayerState): string[] {
  return player.attack.filter((id) => {
    const card = state.cards[id];
    return Boolean(card && card.controllerPlayerId === player.id && card.zone === "attack" && card.face === "up" && card.active);
  });
}

export const useEnkiduTransfiguration: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("ENKIDU_DEFINITIONS_REQUIRED");
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("ENKIDU_TRANSFIGURATION_WINDOW_INVALID");
  const source = activeSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("ENKIDU_TRANSFIGURATION_SOURCE_INACTIVE");
  const data = isRecord(payload) ? payload : {};
  source.copyTopAttachmentTraits = { sourceId: skill.id };

  if (data.abilityId === STACK_ABILITY) {
    const instanceId = typeof data.instanceId === "string" ? data.instanceId : "";
    if (!basicAttackInHand(state, player, instanceId, definitions)) throw new Error("ENKIDU_STACK_CARD_INVALID");
    attachCard(state, instanceId, source.instanceId, "up");
    return { stackedInstanceId: instanceId, stackSize: getAttachedCards(state, source.instanceId).length };
  }

  if (data.abilityId !== DISCARD_ABILITY) throw new Error("ENKIDU_TRANSFIGURATION_ABILITY_INVALID");
  const count = Number(data.count ?? 0);
  const stack = getAttachedCards(state, source.instanceId);
  if (!Number.isInteger(count) || count < 0 || count > stack.length) throw new Error("ENKIDU_DISCARD_COUNT_INVALID");
  const attributes = new Set<string>();
  const discarded: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const top = getTopAttachedCard(state, source.instanceId);
    if (!top) throw new Error("ENKIDU_STACK_EMPTY");
    const definition = definitions[top.definitionId];
    if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");
    for (const attribute of getCardInstanceAttributes(top, definition, state, definitions)) attributes.add(attribute);
    discarded.push(top.instanceId);
    detachCard(state, top.instanceId, "discard");
  }
  const targetInstanceIds = activeControlledAttacks(state, player);
  if (attributes.size > 0 && targetInstanceIds.length > 0) {
    addCardRuleModifier(player, {
      id: `${skill.id}:discarded-types:${state.round}:${Number(player.flags.enkiduTransfigurationSequence ?? 0) + 1}`,
      sourceId: skill.id,
      targetDefinitionIds: [...new Set(targetInstanceIds.map((id) => state.cards[id]?.definitionId).filter((id): id is string => Boolean(id)))],
      targetInstanceIds,
      grantAttributes: [...attributes],
      duration: "round",
    });
    player.flags.enkiduTransfigurationSequence = Number(player.flags.enkiduTransfigurationSequence ?? 0) + 1;
  }
  return { discardedInstanceIds: discarded, grantedAttributes: [...attributes], targetInstanceIds };
};

export const isEnkiduTransfigurationLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.phase !== "action" || state.activePlayerId !== playerId || !activeSkill(state, player, skill.id, definitions)) return false;
  if (ability?.id === STACK_ABILITY) return player.hand.some((id) => basicAttackInHand(state, player, id, definitions));
  if (ability?.id === DISCARD_ABILITY) return true;
  return false;
};

export const useEnkiduEnumaElish: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("ENKIDU_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== CHAINS_ABILITY || state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("ENKIDU_CHAINS_WINDOW_INVALID");
  if (!activeSkill(state, player, skill.id, definitions)) throw new Error("ENKIDU_CHAINS_SOURCE_INACTIVE");
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("ENKIDU_CHAINS_REQUIRES_BATTLEFIELD");
  const targetPlayerIds = (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated);
  for (const targetPlayerId of targetPlayerIds) applyChainedThroughRound(state.players[targetPlayerId], state.round + 1);
  return { targetPlayerIds, throughRound: state.round + 1 };
};

export const isEnkiduEnumaElishLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== CHAINS_ABILITY || state.phase !== "combat" || state.activePlayerId !== playerId) return false;
  const locationId = player.locationId;
  return Boolean(activeSkill(state, player, skill.id, definitions)
    && (locationId === "mountain" || locationId === "city")
    && (state.board.locations[locationId] ?? []).some((id) => id !== playerId && !state.players[id]?.eliminated));
};
