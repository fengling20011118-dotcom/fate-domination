import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { addCardToAttack } from "./card-play.ts";
import { closePlayerCard } from "./decks.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import { gainVictoryPoints } from "./resources.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const CHLOE_PROJECTION_ID = "servant.chloe.skill.sc-chloe-2";
export const CHLOE_KANSHOU_ID = "servant.chloe.skill.sc-chloe-3";
export const CHLOE_PROJECTION_HANDLER = "core.chloe-projection-magic";
export const CHLOE_KANSHOU_HANDLER = "core.chloe-kanshou-bakuya";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function activeSkillCard(state: GameState, playerId: string, skillId: string, definitions: Record<string, CardDefinition>) {
  return state.players[playerId]?.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card?.active && card.face === "up" && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
  });
}

/** Projection Magic grants a round-scoped rule to basic attacks and rewards a win while the source is active. */
export const useChloeProjectionMagic: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("CHLOE_PROJECTION_DEFINITIONS_REQUIRED");
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : undefined;
  if (eventType === "combat.resolved") {
    if (!event || !activeSkillCard(state, player.id, skill.id, definitions)) return;
    const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds : [];
    const powers = isRecord(event.powers) ? event.powers : {};
    if (Object.prototype.hasOwnProperty.call(powers, player.id) && winnerIds.includes(player.id)) gainVictoryPoints(player, 2);
    return;
  }
  const abilityId = isRecord(payload) && typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  if (abilityId !== "ferromantic-coalescence") throw new Error("CHLOE_PROJECTION_ABILITY_INVALID");
  const basicDefinitionIds = Object.values(definitions).filter((definition) => definition.basic === true).map((definition) => definition.id);
  if (basicDefinitionIds.length === 0) throw new Error("CHLOE_PROJECTION_BASIC_DEFINITIONS_MISSING");
  const id = `${skill.id}:ferromantic:${state.round}`;
  if (!(player.cardRuleModifiers ?? []).some((modifier) => modifier.id === id)) {
    addCardRuleModifier(player, {
      id,
      sourceId: skill.id,
      targetDefinitionIds: basicDefinitionIds,
      powerAddPerUniqueControlledAttackTypeSet: 1,
      duration: "round",
    });
  }
};

export const isChloeProjectionMagicLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) =>
  ability?.id === "ferromantic-coalescence" && state.phase === "action" && state.activePlayerId === playerId;

function printedActiveAttackPowerSum(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): number {
  const player = state.players[playerId];
  return player.attack.reduce((sum, instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card?.active || card.face !== "up" || !definition) return sum;
    return sum + getPrintedCardBasePower(state, player, definition);
  }, 0);
}

/** Kanshou & Bakuya's two abilities share the same physical card and preserve it across the round boundary. */
export const useChloeKanshouBakuya: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("CHLOE_KANSHOU_CONTEXT_REQUIRED");
  const abilityId = typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  if (abilityId === "kanshou-play") {
    if (printedActiveAttackPowerSum(state, player.id, definitions) !== 5) throw new Error("CHLOE_KANSHOU_PRINTED_POWER_SUM_INVALID");
    const instanceId = typeof payload.instanceId === "string" ? payload.instanceId : undefined;
    if (!instanceId) throw new Error("CHLOE_KANSHOU_PLAY_TARGET_REQUIRED");
    const definition = definitions[state.cards[instanceId]?.definitionId ?? ""];
    if (!definition || (definition.cardType !== "attack" && definition.isSkill !== true)) throw new Error("CHLOE_KANSHOU_PLAY_TARGET_INVALID");
    const result = addCardToAttack(state, player.id, instanceId, definitions, { payCost: true, bypassFaceUpPlayLimit: true, bypassTiming: true });
    return { cards: [{ instanceId, definitionId: definition.id, paidMana: result.paidMana, revealsTrueName: definition.revealsTrueNameOnPlay === true }] };
  }
  if (abilityId === "triple-linked-crane-wings") {
    const source = activeSkillCard(state, player.id, skill.id, definitions);
    if (!source || source.playedRound !== state.round || (source.playedLocationId !== "mountain" && source.playedLocationId !== "city")) {
      throw new Error("CHLOE_KANSHOU_CRANE_WINGS_CONDITION_INVALID");
    }
    closePlayerCard(state, player.id, source.instanceId, definitions);
    const pending = Array.isArray(state.modeState.pendingRoundAttackJoins) ? state.modeState.pendingRoundAttackJoins : [];
    state.modeState.pendingRoundAttackJoins = [...pending, {
      targetRound: state.round + 1,
      playerId: player.id,
      instanceId: source.instanceId,
      sourceId: skill.id,
    }];
    return { scheduledInstanceId: source.instanceId, targetRound: state.round + 1 };
  }
  throw new Error("CHLOE_KANSHOU_ABILITY_INVALID");
};

export const isChloeKanshouBakuyaLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  if (!definitions || state.activePlayerId !== playerId) return false;
  if (ability?.id === "kanshou-play") return state.phase === "action" && printedActiveAttackPowerSum(state, playerId, definitions) === 5;
  if (ability?.id === "triple-linked-crane-wings") {
    const source = activeSkillCard(state, playerId, skill.id, definitions);
    return state.phase === "combat" && Boolean(source?.playedRound === state.round
      && (source.playedLocationId === "mountain" || source.playedLocationId === "city"));
  }
  return false;
};
