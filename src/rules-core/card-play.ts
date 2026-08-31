import type { GameState } from "../domain/state/types.ts";
import { movePlayerCard } from "./decks.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { assertCardCanEnterAttack, getStandardAttackRequirements } from "./card-rules.ts";
import { getCardPlayCost, payMana, sumCardCosts } from "./costs.ts";
import { markCardUsage } from "./usage-limits.ts";
import { ignoresDefeat, isJekyllBeastCard } from "./jekyll-hyde.ts";

export function commitStandardAttack(
  state: GameState,
  playerId: string,
  faceUpInstanceIds: string[],
  faceDownInstanceIds: string[],
  definitions: Record<string, CardDefinition>,
): { paidMana: number; committed: string[]; cards: Array<{ instanceId: string; definitionId: string; face: "up" | "down"; paidMana: number; attributes: string[]; revealsTrueName: boolean }>; drawRequests: Array<{ sourceInstanceId: string; count: number }> } {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  if (state.phase !== "action" || state.activePlayerId !== playerId || state.step !== "play-batch-draft") throw new Error("PLAY_WINDOW_FORBIDDEN");
  if (player.defeated && !ignoresDefeat(player)) throw new Error("PLAYER_DEFEATED");
  const { requiredCards, primitiveDragonActive } = getStandardAttackRequirements(player, state, definitions);
  const all = [...faceUpInstanceIds, ...faceDownInstanceIds];
  const selectedDefinitions = all.map((instanceId) => definitions[state.cards[instanceId]?.definitionId ?? ""]);
  const hasSingleCardRule = selectedDefinitions.some((definition) => definition?.singleCardPlay === true);
  const expectedCards = hasSingleCardRule ? 1 : requiredCards;
  if (all.length !== expectedCards) throw new Error(expectedCards === 1 ? "EXACTLY_ONE_CARD_REQUIRED" : "EXACTLY_TWO_CARDS_REQUIRED");
  if (new Set(all).size !== expectedCards) throw new Error("DUPLICATE_CARD_INSTANCE");
  if ((player.locationId === "mountain" || player.locationId === "city") && faceUpInstanceIds.length === 0) throw new Error("BATTLEFIELD_REQUIRES_FACE_UP_CARD");

  for (const instanceId of all) {
    assertCardCanEnterAttack({ state, playerId, instanceId, definitions, faceDown: faceDownInstanceIds.includes(instanceId), primitiveDragonActive });
  }

  const paidMana = sumCardCosts(state, faceUpInstanceIds, definitions, player);
  payMana(player, paidMana);

  for (const instanceId of faceUpInstanceIds) {
    const instance = state.cards[instanceId];
    const definition = definitions[instance.definitionId];
    instance.face = "up";
    instance.active = true;
    instance.residual = definition.residual === true;
    markCardUsage(instance, definition.limit, state.round, state.phase);
    instance.paidCost = getCardPlayCost(state, definitions[instance.definitionId], player);
    if (isJekyllBeastCard(player, definition)) player.flags.jekyllZeroPowerRound = state.round + 1;
    instance.playedRound = state.round;
    movePlayerCard(state, playerId, instanceId, "attack");
  }
  const activeDefinitions = [...player.attack, ...faceUpInstanceIds]
    .map((instanceId) => definitions[state.cards[instanceId]?.definitionId ?? ""])
    .filter(Boolean);
  if (activeDefinitions.some((definition) => definition.tags?.includes("primitive-dragon"))
    && faceUpInstanceIds.some((instanceId) => getCardPlayCost(state, definitions[state.cards[instanceId].definitionId]) >= 3)) {
    player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 2;
  }
  for (const instanceId of faceDownInstanceIds) {
    const instance = state.cards[instanceId];
    instance.face = "down";
    instance.active = false;
    instance.paidCost = 0;
    movePlayerCard(state, playerId, instanceId, "attack");
  }
  state.step = "settlement";
  const hasBasicAttack = faceUpInstanceIds.some((instanceId) => definitions[state.cards[instanceId].definitionId]?.basic === true);
  const drawRequests = [
    ...all
      .map((instanceId) => ({ instanceId, definition: definitions[state.cards[instanceId].definitionId] }))
      .filter(({ definition }) => Number(definition?.drawOnPlay ?? 0) > 0)
      .map(({ instanceId, definition }) => ({ sourceInstanceId: instanceId, count: Number(definition.drawOnPlay) })),
    ...(hasBasicAttack ? faceUpInstanceIds
      .map((instanceId) => ({ instanceId, definition: definitions[state.cards[instanceId].definitionId] }))
      .filter(({ definition }) => Number(definition?.playDrawIfWithBasicAttack ?? 0) > 0)
      .map(({ instanceId, definition }) => ({ sourceInstanceId: instanceId, count: Number(definition.playDrawIfWithBasicAttack) }))
      : []),
  ];
  return {
    paidMana,
    committed: all,
    cards: all.map((instanceId) => {
      const instance = state.cards[instanceId];
      const definition = definitions[instance.definitionId];
      return {
        instanceId,
        definitionId: instance.definitionId,
        face: instance.face,
        paidMana: instance.paidCost ?? 0,
        attributes: getCardAttributes(definition),
        revealsTrueName: instance.face === "up"
          && definition.isSkill === true
          && definition.skillOwnerType === "servant"
          && definition.revealsTrueNameOnPlay === true,
      };
    }),
    drawRequests,
  };
}

/**
 * Add an already-owned card to the current attack as an effect.
 * This is deliberately separate from commitStandardAttack: effect-added cards
 * do not consume the normal two-card quota and are free unless the effect says otherwise.
 */
export function addCardToAttack(
  state: GameState,
  playerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  options: { payCost?: boolean; bypassSkillEightMana?: boolean } = {},
): { paidMana: number } {
  const definition = assertCardCanEnterAttack({ state, playerId, instanceId, definitions, faceDown: false, bypassSkillEightMana: options.bypassSkillEightMana });
  const player = state.players[playerId];
  const instance = state.cards[instanceId];
  const paidMana = options.payCost ? getCardPlayCost(state, definition, player) : 0;
  payMana(player, paidMana);
  instance.face = "up";
  instance.active = true;
  instance.residual = definition.residual === true;
  markCardUsage(instance, definition.limit, state.round, state.phase);
  instance.paidCost = paidMana;
  if (isJekyllBeastCard(player, definition)) player.flags.jekyllZeroPowerRound = state.round + 1;
  instance.playedRound = state.round;
  movePlayerCard(state, playerId, instanceId, "attack");
  return { paidMana };
}

/** Atomically plays a bounded set of cards from hand as an effect-added attack. */
export function addCardsToAttack(
  state: GameState,
  playerId: string,
  instanceIds: string[],
  definitions: Record<string, CardDefinition>,
  rule: { maxCount: number; maxBasePower: number },
): { paidMana: number; committed: string[]; cards: Array<{ instanceId: string; definitionId: string; paidMana: number; revealsTrueName: boolean }> } {
  if (!Array.isArray(instanceIds) || instanceIds.length > rule.maxCount) throw new Error("APPEND_CARD_COUNT_INVALID");
  if (new Set(instanceIds).size !== instanceIds.length) throw new Error("DUPLICATE_CARD_INSTANCE");
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  if (state.phase !== "action" || state.activePlayerId !== playerId) throw new Error("PLAY_WINDOW_FORBIDDEN");
  const validated = instanceIds.map((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!definition || definition.basePower > rule.maxBasePower) throw new Error("APPEND_CARD_POWER_FORBIDDEN");
    if (!instance || instance.zone !== "hand") throw new Error("APPEND_CARD_FROM_HAND_REQUIRED");
    assertCardCanEnterAttack({ state, playerId, instanceId, definitions, faceDown: false });
    return { instanceId, definition };
  });
  const paidMana = validated.reduce((sum, { definition }) => sum + getCardPlayCost(state, definition, player), 0);
  payMana(player, paidMana);
  for (const { instanceId, definition } of validated) {
    const instance = state.cards[instanceId];
    instance.face = "up";
    instance.active = true;
    instance.residual = definition.residual === true;
    markCardUsage(instance, definition.limit, state.round, state.phase);
    instance.paidCost = getCardPlayCost(state, definition, player);
    if (isJekyllBeastCard(player, definition)) player.flags.jekyllZeroPowerRound = state.round + 1;
    instance.playedRound = state.round;
    movePlayerCard(state, playerId, instanceId, "attack");
  }
  return {
    paidMana,
    committed: [...instanceIds],
    cards: validated.map(({ instanceId, definition }) => ({
      instanceId,
      definitionId: definition.id,
      paidMana: state.cards[instanceId].paidCost ?? 0,
      revealsTrueName: definition.isSkill === true
        && definition.skillOwnerType === "servant"
        && definition.revealsTrueNameOnPlay === true,
    })),
  };
}
