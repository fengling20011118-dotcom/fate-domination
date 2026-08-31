import type { GameState } from "../domain/state/types.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { SkillRegistry } from "./skill-registry.ts";
import { PassiveRuntime } from "./passives.ts";
import { EffectRuntime } from "../match-engine/effect-runtime.ts";
import { createEffectFrame, GAIN_RESOURCES_EFFECT } from "./standard-effects.ts";
import type { CombatPowerSnapshot } from "./combat.ts";
import { isUsageAvailable } from "./usage-limits.ts";
import { addCardToAttack, addCardsToAttack } from "./card-play.ts";
import { drawCards } from "./decks.ts";
import { getCardAttributes } from "./content-types.ts";
import { getCardPlayCost } from "./costs.ts";
import type { SkillAbilityDefinition } from "./skill-types.ts";
import { movePlayerCard } from "./decks.ts";
import { isMisfortuneResponseAvailable, MISFORTUNE_ABILITY_ID } from "./misfortune.ts";

const nonWorkshopLocations = new Set(["mountain", "city", "scouting"]);
const capacities: Record<string, number | null> = { mountain: null, city: null, scouting: 1 };

/** Registers concrete handlers shared by skills with identical confirmed rules. */
export function registerCoreSkillHandlers(registry: SkillRegistry): void {
  for (const skill of registry.list()) {
    const registration = skill.handlerId ? coreHandlers[skill.handlerId] : undefined;
    if (!registration) continue;
    try {
      registry.registerHandler(skill.id, registration.handler, registration.legal);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "SKILL_HANDLER_DUPLICATE") throw error;
    }
  }
}

/** Registers confirmed mandatory residual triggers against domain events. */
export function registerCorePassiveHandlers(registry: SkillRegistry, passives: PassiveRuntime, effects: EffectRuntime): void {
  const skillEightManaWaiverSkills = registry.list().filter((skill) => skill.handlerId === "core.skill-eight-mana-waiver" && skill.supportLevel === "FULL");
  if (skillEightManaWaiverSkills.length && !effects.has("core.skill-eight-mana-waiver")) effects.register("core.skill-eight-mana-waiver", useSkillEightManaWaiver);
  for (const skill of skillEightManaWaiverSkills) {
    passives.register({
      skill,
      eventType: "game.started",
      mandatory: true,
      handler: useSkillEightManaWaiver,
    });
  }
  const locationGainSkills = registry.list().filter((skill) => skill.handlerId === "core.enter-location-gain-mana" && skill.supportLevel === "FULL");
  if (locationGainSkills.length && !effects.has("core.enter-location-gain-mana")) effects.register("core.enter-location-gain-mana", useEnterLocationGainMana);
  for (const skill of locationGainSkills) {
    for (const eventType of ["player.deployed", "player.moved"]) {
      passives.register({
        skill,
        eventType,
        mandatory: true,
        condition: (state, event, playerId) => {
          const payload = event.payload as { playerId?: string; locationId?: string };
          return payload.playerId === playerId && payload.locationId === skill.locationId;
        },
        payload: () => ({ locationId: skill.locationId, manaGain: skill.manaGain }),
        handler: useEnterLocationGainMana,
      });
    }
  }
  const humanEvilSkills = registry.list().filter((skill) => skill.handlerId === "core.tiamat-human-evil" && skill.supportLevel === "FULL");
  if (humanEvilSkills.length && !effects.has("core.tiamat-human-evil")) effects.register("core.tiamat-human-evil", useTiamatHumanEvil);
  for (const skill of humanEvilSkills) {
    passives.register({
      skill,
      eventType: "combat.resolved",
      mandatory: true,
      condition: (state, event, playerId) => {
        const result = event.payload as { winnerIds?: unknown; powers?: unknown };
        const winnerIds = Array.isArray(result.winnerIds) ? result.winnerIds : [];
        const powers = result.powers && typeof result.powers === "object" ? result.powers as Record<string, unknown> : {};
        return Object.prototype.hasOwnProperty.call(powers, playerId) && !winnerIds.includes(playerId);
      },
      handler: useTiamatHumanEvil,
    });
  }
  const territorySkills = registry.list().filter((skill) => skill.handlerId === "core.territory-creation" && skill.supportLevel === "FULL");
  if (territorySkills.length && !effects.has("core.territory-creation")) effects.register("core.territory-creation", useTerritoryCreation);
  for (const skill of territorySkills) {
    passives.register({
      skill,
      eventType: "player.deployed",
      mandatory: true,
      condition: (state, event, playerId) => {
        const payload = event.payload as { playerId?: string; locationId?: string };
        return payload.playerId === playerId
          && payload.locationId === "workshop"
          && state.players[playerId].attack.some((instanceId) => {
            const card = state.cards[instanceId];
            return card?.definitionId === skill.id && card.active && card.face === "up" && card.residual;
          });
      },
      handler: useTerritoryCreation,
    });
  }
  const twelveLaborsSkills = registry.list().filter((skill) => skill.handlerId === "core.twelve-labors"
    && skill.supportLevel === "FULL"
    && skill.passiveEventTypes?.includes("combat.resolved"));
  if (twelveLaborsSkills.length && !effects.has("core.twelve-labors")) effects.register("core.twelve-labors", useTwelveLabors);
  for (const skill of twelveLaborsSkills) {
    passives.register({
      skill,
      eventType: "combat.resolved",
      mandatory: true,
      condition: (state, event, playerId) => {
        const result = event.payload as { winnerIds?: unknown; powers?: unknown };
        const winnerIds = Array.isArray(result.winnerIds) ? result.winnerIds : [];
        const powers = result.powers && typeof result.powers === "object" ? result.powers as Record<string, unknown> : {};
        return Object.prototype.hasOwnProperty.call(powers, playerId)
          && !winnerIds.includes(playerId)
          && state.players[playerId].attack.some((instanceId) => {
            const card = state.cards[instanceId];
            return card?.definitionId === skill.id && card.active && card.face === "up";
          });
      },
      handler: useTwelveLabors,
    });
  }
}

/** 肯尼斯【双重御主】：本局内该玩家的技能牌打出门槛降为可无视8魔力。 */
export const useSkillEightManaWaiver: SkillHandler = ({ player }) => {
  player.flags.skillEightManaWaiver = true;
};

/** 韦伯【战略部署】及同类能力：先由 SkillRegistry 支付费用，再抽取固定数量牌。 */
export const usePayManaDraw: SkillHandler = ({ state, player, skill, randomInt }) => {
  const count = skill.drawCount;
  if (!Number.isInteger(count) || count < 0) throw new Error("DRAW_COUNT_INVALID");
  drawCards(state, player.id, count, randomInt ?? (() => 0));
};

/** 阿拉什【准备阶段】能力：当前没有存活玩家的战果高于自己时获得战果。 */
export const useArashPreparation: SkillHandler = ({ state, player }) => {
  const hasHigherScore = Object.values(state.players).some((other) => !other.eliminated
    && other.id !== player.id
    && other.victoryPoints > player.victoryPoints);
  if (hasHigherScore) throw new Error("ARASH_SCORE_REQUIREMENT_NOT_MET");
  player.victoryPoints += state.round >= 9 ? 3 : 1;
};

/** 间桐慎二【吸魔命令】：进入指定地点时强制获得固定魔力。 */
export const useEnterLocationGainMana: SkillHandler = ({ player, skill, payload }) => {
  const trigger = payload as { event?: { locationId?: string }; locationId?: string; manaGain?: number } | undefined;
  const locationId = trigger?.locationId ?? skill.locationId;
  if (trigger?.event?.locationId !== locationId) throw new Error("LOCATION_TRIGGER_INVALID");
  const amount = trigger?.manaGain ?? skill.manaGain;
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RESOURCE_MANA_INVALID");
  player.mana += amount;
};

/** 提亚马特【人类恶】：战胜她的每名玩家额外获得1点战果。 */
export const useTiamatHumanEvil: SkillHandler = ({ state, payload }) => {
  const trigger = payload as { event?: { winnerIds?: unknown } } | undefined;
  const winnerIds = trigger?.event?.winnerIds;
  if (!Array.isArray(winnerIds) || winnerIds.some((id) => typeof id !== "string")) throw new Error("HUMAN_EVIL_TRIGGER_INVALID");
  for (const winnerId of winnerIds) {
    const winner = state.players[winnerId];
    if (winner && !winner.eliminated) winner.victoryPoints += 1;
  }
};

const twelveLaborsIds = new Set([
  "servant.herc.skill.sc-herc-1",
  "servant.herc.skill.sc-herc-2",
  "servant.herc.skill.sc-herc-3",
]);

/** 十二试炼：战败后获得战果、削减胜者，并将本牌移除且强化其余试炼。 */
export const useTwelveLabors: SkillHandler = ({ state, player, skill, payload }) => {
  const result = (payload as { event?: { winnerIds?: unknown } } | undefined)?.event;
  const winnerIds = result?.winnerIds;
  if (!Array.isArray(winnerIds) || winnerIds.some((id) => typeof id !== "string")) throw new Error("TWELVE_LABORS_TRIGGER_INVALID");
  player.victoryPoints += 3;
  for (const winnerId of winnerIds) {
    const winner = state.players[winnerId];
    if (winner && !winner.eliminated) winner.victoryPoints -= 3;
  }
  const played = player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    return card?.definitionId === skill.id && card.active && card.face === "up";
  });
  if (played.length === 0) throw new Error("TWELVE_LABORS_CARD_MISSING");
  for (const instanceId of played) {
    const card = state.cards[instanceId];
    movePlayerCard(state, player.id, instanceId, "removed");
    card.face = "down";
    card.active = false;
    card.residual = false;
  }
  for (const card of Object.values(state.cards)) {
    if (card.ownerPlayerId !== player.id || !twelveLaborsIds.has(card.definitionId) || played.includes(card.instanceId)) continue;
    const modifiers = card.powerModifiers ?? [];
    const modifierId = `${skill.id}:twelve-labors:${card.instanceId}`;
    if (!modifiers.some((modifier) => modifier.id === modifierId)) {
      card.powerModifiers = [...modifiers, { id: modifierId, sourceId: skill.id, kind: "add", value: 3, duration: "game" }];
    }
  }
};

/** Combat-stage suppression shared by cards that set one opponent attribute to zero. */
export const useZeroOpponentAttribute: SkillHandler = ({ state, player, skill, definitions }) => {
  if (!definitions || !skill.combatPowerZeroAttribute) throw new Error("ZERO_ATTRIBUTE_CONTEXT_REQUIRED");
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("ZERO_ATTRIBUTE_NOT_IN_BATTLE");
  const opponentIds = (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated);
  let targetCount = 0;
  for (const opponentId of opponentIds) {
    for (const instanceId of state.players[opponentId].attack) {
      const instance = state.cards[instanceId];
      const definition = definitions[instance?.definitionId ?? ""];
      if (!instance?.active || instance.face !== "up" || !definition || !getCardAttributes(definition).includes(skill.combatPowerZeroAttribute)) continue;
      const modifiers = instance.powerModifiers ?? [];
      const modifierId = `${skill.id}:zero-attribute:${instance.instanceId}`;
      const withoutPrevious = modifiers.filter((modifier) => modifier.id !== modifierId);
      instance.powerModifiers = [...withoutPrevious, { id: modifierId, sourceId: skill.id, kind: "set", value: 0, duration: "round" }];
      targetCount += 1;
    }
  }
  if (targetCount === 0) throw new Error("ZERO_ATTRIBUTE_NO_TARGET");
};

export const isZeroOpponentAttributeLegal: SkillLegalityPredicate = (state, playerId, skill, _ability, definitions) => {
  if (!skill.combatPowerZeroAttribute) return false;
  if (!definitions) return false;
  const locationId = state.players[playerId]?.locationId;
  if (locationId !== "mountain" && locationId !== "city") return false;
  return (state.board.locations[locationId] ?? []).some((opponentId) => opponentId !== playerId && !state.players[opponentId]?.eliminated
    && state.players[opponentId].attack.some((instanceId) => {
      const instance = state.cards[instanceId];
      const definition = definitions[instance?.definitionId ?? ""];
      return Boolean(instance?.active && instance.face === "up" && definition
        && getCardAttributes(definition).includes(skill.combatPowerZeroAttribute!));
    }));
};

/** Shared handler for the two independent effects printed on Saber-class【对魔力】. */
export const useSaberMagicResistance: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  const abilityId = (payload as { abilityId?: unknown } | undefined)?.abilityId;
  if (abilityId === "noble-bloom") {
    if (!definitions) throw new Error("CARD_DEFINITIONS_CONTEXT_REQUIRED");
    const nobleCosts = player.attack
      .map((instanceId) => ({ instance: state.cards[instanceId], definition: definitions[state.cards[instanceId]?.definitionId ?? ""] }))
      .filter(({ instance, definition }) => Boolean(instance?.active && instance.face === "up" && instance.playedRound === state.round && definition && getCardAttributes(definition).includes("宝具")))
      .map(({ instance, definition }) => instance?.paidCost ?? getCardPlayCost(state, definition!));
    if (nobleCosts.length === 0) throw new Error("NOBLE_BLOOM_NO_NOBLE_PHANTASM");
    const highestCost = Math.max(...nobleCosts);
    player.victoryPoints += highestCost >= 4 ? 2 : 1;
    return;
  }
  if (abilityId === "magic-resistance") {
    if (!definitions) throw new Error("CARD_DEFINITIONS_CONTEXT_REQUIRED");
    const locationId = player.locationId;
    if (locationId !== "mountain" && locationId !== "city") throw new Error("MAGIC_RESISTANCE_NOT_IN_BATTLE");
    const opponentIds = (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated);
    const targets = opponentIds.flatMap((opponentId) => state.players[opponentId].attack)
      .map((instanceId) => ({ instance: state.cards[instanceId], definition: definitions[state.cards[instanceId]?.definitionId ?? ""] }))
      .filter(({ instance, definition }) => Boolean(instance?.active && instance.face === "up" && definition && getCardAttributes(definition).includes("魔术")));
    if (targets.length === 0) throw new Error("MAGIC_RESISTANCE_NO_TARGET");
    for (const { instance } of targets) {
      const modifiers = instance!.powerModifiers ?? [];
      const modifierId = `${skill.id}:magic-resistance:${instance!.instanceId}`;
      const withoutPrevious = modifiers.filter((modifier) => modifier.id !== modifierId);
      instance!.powerModifiers = [...withoutPrevious, { id: modifierId, sourceId: skill.id, kind: "set", value: 0, duration: "round" }];
    }
    return;
  }
  throw new Error("SABER_ABILITY_INVALID");
};

export const isSaberMagicResistanceLegal: SkillLegalityPredicate = (_state, _playerId, _skill, ability?: SkillAbilityDefinition) => {
  return ability?.id === "noble-bloom" || ability?.id === "magic-resistance";
};

/** 战斗续行：行动阶段移动到除魔术工房外的任意地点，不走普通箭头移动。 */
export const moveToNonWorkshop: SkillHandler = function moveToNonWorkshopHandler({ state, player, payload }) {
  const target = (payload as { locationId?: string } | undefined)?.locationId;
  if (!target || !nonWorkshopLocations.has(target)) throw new Error("SKILL_TARGET_LOCATION_INVALID");
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("SKILL_WINDOW_FORBIDDEN");
  if (state.board.locations[target].length >= (capacities[target] ?? Number.MAX_SAFE_INTEGER)) {
    throw new Error("LOCATION_FULL");
  }

  removeFromAllLocations(state, player.id);
  state.board.locations[target].push(player.id);
  player.locationId = target;
  player.flags.deploymentBonusActive = false;
  state.step = "play-batch-draft";
};

export const isIndependentActionLegal: SkillLegalityPredicate = (state, playerId) => {
  return isIndependentActionOrderAllowed(state, playerId);
};

function isIndependentActionOrderAllowed(state: GameState, playerId: string): boolean {
  const eligibleOrder = state.turnOrder.filter((id) => !state.players[id]?.eliminated);
  const firstHalfCount = Math.floor(eligibleOrder.length / 2);
  const index = eligibleOrder.indexOf(playerId);
  return index >= 0 && index < firstHalfCount;
}

export const useIndependentAction: SkillHandler = ({ state, player }) => {
  if (!isIndependentActionOrderAllowed(state, player.id)) throw new Error("SKILL_TURN_ORDER_FORBIDDEN");
  player.victoryPoints += 3;
  player.flags.independentActionPenaltyRound = state.round;
};

/** 阵地建造：残留牌的拥有者部署于魔术工房后强制结算。 */
export const useTerritoryCreation: SkillHandler = ({ state, player, skill, payload }) => {
  const trigger = payload as { eventId?: string; eventType?: string; event?: { playerId?: string; locationId?: string } };
  if (trigger.eventType !== "player.deployed" || trigger.event?.playerId !== player.id || trigger.event.locationId !== "workshop") {
    throw new Error("TERRITORY_CREATION_TRIGGER_INVALID");
  }
  if (!trigger.eventId) throw new Error("TERRITORY_CREATION_EVENT_ID_REQUIRED");
  state.effectQueue.push(createEffectFrame({
    effectId: `${trigger.eventId}:resources:${skill.id}:${player.id}`,
    handlerId: GAIN_RESOURCES_EFFECT,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { mana: 1, victoryPoints: 2 },
    state,
  }));
};

interface PendingCombatResolution {
  snapshot: CombatPowerSnapshot;
  responderIds: string[];
  nextResponderIndex: number;
}

function pendingCombat(state: GameState): PendingCombatResolution | null {
  const pending = state.modeState.pendingCombatResolution as PendingCombatResolution | undefined;
  return pending?.snapshot && Array.isArray(pending.responderIds) ? pending : null;
}

/** 气息遮断：战力结算后，严格第二名可令所有并列最高的交战对手败北。 */
export const isPresenceConcealmentLegal: SkillLegalityPredicate = (state, playerId, skill) => {
  if (!isPresenceConcealmentBaseLegal(state, playerId, skill)) return false;
  return isUsageAvailable(state.players[playerId].usage[skill.id], skill.limit, state.round, state.phase);
};

function isPresenceConcealmentBaseLegal(state: GameState, playerId: string, skill: import("./skill-types.ts").SkillDefinition): boolean {
  const pending = pendingCombat(state);
  if (!pending || state.phase !== "combat" || state.step !== "post-power-response") return false;
  if (state.activePlayerId !== playerId || pending.responderIds[pending.nextResponderIndex] !== playerId) return false;
  const snapshot = pending.snapshot;
  if (!snapshot.participantIds.includes(playerId) || snapshot.participantIds.length < 3) return false;
  const opponents = snapshot.participantIds.filter((id) => id !== playerId);
  const highest = Math.max(...opponents.map((id) => snapshot.powers[id]));
  const ownPower = snapshot.powers[playerId];
  if (!(ownPower < highest)) return false;
  if (opponents.some((id) => snapshot.powers[id] !== highest && snapshot.powers[id] > ownPower)) return false;
  return state.players[playerId].attack.some((instanceId) => {
    const card = state.cards[instanceId];
    return card?.definitionId === skill.id && card.active && card.face === "up";
  });
};

function presenceConcealmentCondition(
  state: GameState,
  playerId: string,
  skill: import("./skill-types.ts").SkillDefinition,
  snapshot: CombatPowerSnapshot,
): boolean {
  if (!snapshot.participantIds.includes(playerId) || snapshot.participantIds.length < 3) return false;
  if (state.players[playerId]?.servantId !== skill.ownerId) return false;
  if (!state.players[playerId].attack.some((instanceId) => {
    const card = state.cards[instanceId];
    return card?.definitionId === skill.id && card.active && card.face === "up";
  })) return false;
  if (!isUsageAvailable(state.players[playerId].usage[skill.id], skill.limit, state.round, state.phase)) return false;
  const opponents = snapshot.participantIds.filter((id) => id !== playerId);
  const highest = Math.max(...opponents.map((id) => snapshot.powers[id]));
  const ownPower = snapshot.powers[playerId];
  return ownPower < highest
    && !opponents.some((id) => snapshot.powers[id] !== highest && snapshot.powers[id] > ownPower);
}

export const usePresenceConcealment: SkillHandler = ({ state, player, skill }) => {
  if (!isPresenceConcealmentBaseLegal(state, player.id, skill)) throw new Error("PRESENCE_CONCEALMENT_CONDITION_NOT_MET");
  const snapshot = pendingCombat(state)!.snapshot;
  const opponents = snapshot.participantIds.filter((id) => id !== player.id);
  const highest = Math.max(...opponents.map((id) => snapshot.powers[id]));
  for (const opponentId of opponents) {
    if (snapshot.powers[opponentId] === highest) state.players[opponentId].defeated = true;
  }
  player.flags[`presenceConcealmentUsedRound`] = state.round;
};

export function getPresenceConcealmentResponderIds(
  state: GameState,
  registry: SkillRegistry,
  snapshot: CombatPowerSnapshot,
): string[] {
  const skills = registry.list().filter((skill) => skill.handlerId === "core.presence-concealment" && skill.supportLevel === "FULL");
  return state.turnOrder.filter((playerId) => skills.some((skill) => presenceConcealmentCondition(state, playerId, skill, snapshot)));
}

/** All currently supported post-power responders, ordered by turn order. */
export function getCombatResponseResponderIds(
  state: GameState,
  registry: SkillRegistry,
  snapshot: CombatPowerSnapshot,
  definitions: Record<string, CardDefinition>,
): string[] {
  const presence = new Set(getPresenceConcealmentResponderIds(state, registry, snapshot));
  return state.turnOrder.filter((playerId) => presence.has(playerId) || isMisfortuneResponseAvailable(state, playerId, definitions, snapshot));
}

export const isRidingLegal: SkillLegalityPredicate = (state, playerId, skill) => {
  if (state.phase !== "action" || state.activePlayerId !== playerId) return false;
  if (!skill.appendFromHand) return false;
  return state.players[playerId].attack.some((instanceId) => {
    const card = state.cards[instanceId];
    return card?.definitionId === skill.id && card.active && card.face === "up";
  });
};

/** 骑乘：由玩家一次性提交至多三张手牌，统一校验并支付其打出费用。 */
export const useRiding: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!isRidingLegal(state, player.id, skill)) throw new Error("RIDING_CONDITION_NOT_MET");
  const instanceIds = (payload as { instanceIds?: unknown } | undefined)?.instanceIds;
  if (!Array.isArray(instanceIds) || instanceIds.some((id) => typeof id !== "string")) throw new Error("APPEND_CARD_LIST_INVALID");
  if (!definitions) throw new Error("CARD_DEFINITIONS_CONTEXT_REQUIRED");
  return addCardsToAttack(state, player.id, instanceIds, definitions, skill.appendFromHand!);
};

/** 喀戎【战斗阶段】能力：支付此技能牌自身费用并将其加入攻击。 */
export const useSelfPlayCard: SkillHandler = ({ state, player, skill, definitions }) => {
  if (!definitions) throw new Error("CARD_DEFINITIONS_CONTEXT_REQUIRED");
  const instanceId = player.servantSkills.find((candidate) => state.cards[candidate]?.definitionId === skill.id);
  if (!instanceId) throw new Error("SELF_PLAY_CARD_NOT_AVAILABLE");
  const result = addCardToAttack(state, player.id, instanceId, definitions, { payCost: true, bypassSkillEightMana: true });
  return {
    cards: [{
      instanceId,
      definitionId: skill.id,
      paidMana: result.paidMana,
      revealsTrueName: false,
    }],
  };
};

const coreHandlers: Readonly<Record<string, { handler: SkillHandler; legal?: SkillLegalityPredicate }>> = Object.freeze({
  // Play-only skills are resolved by the shared card-play transaction. The
  // marker keeps their FULL coverage auditable without exposing a phase action.
  "core.card-play": { handler: () => undefined },
  "core.skill-eight-mana-waiver": { handler: useSkillEightManaWaiver },
  "core.pay-mana-draw": { handler: usePayManaDraw },
  "core.arash-preparation": { handler: useArashPreparation },
  "core.enter-location-gain-mana": { handler: useEnterLocationGainMana },
  "core.tiamat-human-evil": { handler: useTiamatHumanEvil },
  "core.twelve-labors": { handler: useTwelveLabors },
  "core.zero-opponent-attribute": { handler: useZeroOpponentAttribute, legal: isZeroOpponentAttributeLegal },
  "core.saber-magic-resistance": { handler: useSaberMagicResistance, legal: isSaberMagicResistanceLegal },
  "core.move-to-non-workshop": { handler: moveToNonWorkshop },
  "core.independent-action": { handler: useIndependentAction, legal: isIndependentActionLegal },
  "core.territory-creation": { handler: useTerritoryCreation },
  "core.presence-concealment": { handler: usePresenceConcealment, legal: isPresenceConcealmentLegal },
  "core.riding": { handler: useRiding, legal: isRidingLegal },
  "core.self-play-card": { handler: useSelfPlayCard },
});

function removeFromAllLocations(state: GameState, playerId: string): void {
  for (const players of Object.values(state.board.locations)) {
    const index = players.indexOf(playerId);
    if (index >= 0) players.splice(index, 1);
  }
}
