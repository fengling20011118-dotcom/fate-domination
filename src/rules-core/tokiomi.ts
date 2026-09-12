import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { EffectRuntime } from "../match-engine/effect-runtime.ts";
import type { CardAbilityRegistry } from "./card-abilities.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillHandler } from "./skill-types.ts";
import { createOwnedCardInstance, movePlayerCard } from "./decks.ts";
import { redeployToFreeBattlefieldAdvantage } from "./board.ts";
import { gainVictoryPoints, loseMana } from "./resources.ts";
import { payManaCost } from "./costs.ts";
import {
  addStackedStatus,
  getEffectiveStackedStatusRemovalManaCost,
  getStackedStatus,
  removeStackedStatus,
} from "./stacked-statuses.ts";

export const TOKIOMI_MASTER_ID = "master.tokiomi";
export const TOKIOMI_ELEMENTALIST_ID = "master.tokiomi.skill.s1";
export const TOKIOMI_ASCENSION_ID = "master.tokiomi.skill.ascension";
export const TOKIOMI_FIREBALL_ID = "card.derived.master.tokiomi.fireball";
export const TOKIOMI_FIREBALL_ABILITY = "tokiomi.fireball.burn";
export const TOKIOMI_ITEM_AZOTH = "card.derived.master.tokiomi.item.azoth-blade";
export const TOKIOMI_ITEM_GRIMOIR = "card.derived.master.tokiomi.item.grimoir";
export const TOKIOMI_ITEM_MAGIC_METER = "card.derived.master.tokiomi.item.magic-meter";
export const TOKIOMI_ITEM_MANA_RESERVE = "card.derived.master.tokiomi.item.mana-reserve";

const TOKIOMI_ITEM_USAGE_FLAG = "tokiomiItemUsedRound";
const TOKIOMI_BURN_REMOVE_RESOLVE = "core.tokiomi-burn-remove-resolve";
const TOKIOMI_GRIMOIR_RESOLVE = "core.tokiomi-grimoir-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function burnStatusId(tokiomiPlayerId: string): string {
  return `status.burn:${tokiomiPlayerId}`;
}

function findTokiomiByItem(state: GameState, instanceId: string): PlayerState {
  const instance = state.cards[instanceId];
  const owner = instance?.ownerPlayerId ? state.players[instance.ownerPlayerId] : undefined;
  if (!instance || !owner || owner.masterId !== TOKIOMI_MASTER_ID) throw new Error("TOKIOMI_ITEM_OWNER_INVALID");
  return owner;
}

function activeTurnOrder(state: GameState): string[] {
  return state.turnOrder.filter((playerId) => Boolean(state.players[playerId] && !state.players[playerId].eliminated));
}

function assertItemUseWindow(state: GameState, user: PlayerState, tokiomi: PlayerState): void {
  if (state.phase !== "action" || state.activePlayerId !== user.id) throw new Error("TOKIOMI_ITEM_WINDOW_INVALID");
  const order = activeTurnOrder(state);
  if (!order.slice(Math.max(0, order.length - 2)).includes(user.id)) throw new Error("TOKIOMI_ITEM_TURN_ORDER_FORBIDDEN");
  if (Number(user.flags[TOKIOMI_ITEM_USAGE_FLAG] ?? -1) === state.round) throw new Error("TOKIOMI_ITEM_PLAYER_LIMIT_REACHED");
  if (!state.players[tokiomi.id]) throw new Error("TOKIOMI_ITEM_OWNER_INVALID");
}

function commitItemUse(state: GameState, user: PlayerState, tokiomi: PlayerState): void {
  user.flags[TOKIOMI_ITEM_USAGE_FLAG] = state.round;
  if (user.id !== tokiomi.id) gainVictoryPoints(tokiomi, 1);
}

function itemData(target: unknown): Record<string, unknown> {
  if (!isRecord(target)) throw new Error("TOKIOMI_ITEM_DATA_REQUIRED");
  return target;
}

function labelCard(definitions: Record<string, CardDefinition>, state: GameState, instanceId: string): string {
  return definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId;
}

function addFireballAtGameStart(state: GameState, player: PlayerState): void {
  if (player.masterSkills.some((instanceId) => state.cards[instanceId]?.definitionId === TOKIOMI_FIREBALL_ID)) return;
  createOwnedCardInstance(state, player.id, {
    instanceId: `${player.id}:game-start:${TOKIOMI_ELEMENTALIST_ID}:${TOKIOMI_FIREBALL_ID}`,
    definitionId: TOKIOMI_FIREBALL_ID,
    zone: "master-skills",
    face: "up",
    active: false,
  });
}

function openBurnRemovalDecision(
  state: GameState,
  affected: PlayerState,
  tokiomi: PlayerState,
  openDecision: (decision: PendingDecision) => void,
): void {
  const statusId = burnStatusId(tokiomi.id);
  const status = getStackedStatus(affected, statusId);
  if (!status || status.count <= 0) return;
  const removalCost = getEffectiveStackedStatusRemovalManaCost(state, status);
  const canPay = affected.flags.infiniteMana === true || affected.mana >= removalCost;
  const effectId = `${state.gameInstanceId}:${state.revision}:${affected.id}:${statusId}:remove`;
  state.effectQueue.push({
    effectId,
    handlerId: TOKIOMI_BURN_REMOVE_RESOLVE,
    sourceId: TOKIOMI_FIREBALL_ID,
    controllerPlayerId: affected.id,
    payload: { statusId, tokiomiPlayerId: tokiomi.id },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: affected.id,
    chooserPlayerIds: [affected.id],
    kind: "tokiomi-burn-remove",
    options: [
      { id: "remove", label: removalCost > 0 ? `支付${removalCost}点魔力并移除1枚燃烧` : "移除1枚燃烧", disabled: !canPay },
      { id: "keep", label: "保留燃烧" },
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

/** Elementalist owns Einäscherung and also resolves the optional burn-removal trigger. */
export const useTokiomiElementalist: SkillHandler = ({ state, player, payload, openDecision }) => {
  if (player.masterId !== TOKIOMI_MASTER_ID) return;
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : {};
  if (eventType === "game.started") {
    addFireballAtGameStart(state, player);
    return;
  }
  if (eventType !== "attack.committed") return;
  const affectedId = typeof event.playerId === "string" ? event.playerId : undefined;
  const faceDownIds = Array.isArray(event.faceDownInstanceIds) ? event.faceDownInstanceIds.filter((id): id is string => typeof id === "string") : [];
  const affected = affectedId ? state.players[affectedId] : undefined;
  if (!affected || faceDownIds.length < 2 || !getStackedStatus(affected, burnStatusId(player.id))) return;
  openBurnRemovalDecision(state, affected, player, openDecision);
};

const resolveBurnRemoval: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("TOKIOMI_BURN_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  if (decision.status !== "resolved" || !Array.isArray(decision.selections) || decision.selections.length !== 1) throw new Error("TOKIOMI_BURN_DECISION_INVALID");
  if (decision.selections[0] === "keep") return;
  if (decision.selections[0] !== "remove") throw new Error("TOKIOMI_BURN_DECISION_INVALID");
  const statusId = typeof previous.statusId === "string" ? previous.statusId : undefined;
  const status = statusId ? getStackedStatus(player, statusId) : undefined;
  if (!status) return;
  const cost = getEffectiveStackedStatusRemovalManaCost(state, status);
  if (cost > 0) payManaCost(state, player, cost, definitions ?? {});
  removeStackedStatus(player, status.id, 1);
};

function applyFireballBurns(state: GameState, user: PlayerState): void {
  if (user.locationId !== "mountain" && user.locationId !== "city") throw new Error("TOKIOMI_FIREBALL_BATTLEFIELD_REQUIRED");
  const opponentIds = (state.board.locations[user.locationId] ?? []).filter((id) => id !== user.id && !state.players[id]?.eliminated);
  if (opponentIds.length === 0) throw new Error("TOKIOMI_FIREBALL_NO_OPPONENT");
  for (const opponentId of opponentIds) {
    addStackedStatus(state.players[opponentId], {
      id: burnStatusId(user.id),
      sourceId: TOKIOMI_FIREBALL_ID,
      sourcePlayerId: user.id,
      totalPowerPerStack: -2,
      removalManaCost: 0,
      upgradeSourceDefinitionId: TOKIOMI_ASCENSION_ID,
      upgradedTotalPowerPerStack: -3,
      upgradedRemovalManaCost: 2,
    });
  }
}

function addRoundCardPower(instance: GameState["cards"][string], sourceId: string, round: number, value: number): void {
  const id = `${sourceId}:round-power:${round}:${instance.instanceId}`;
  instance.powerModifiers = (instance.powerModifiers ?? []).filter((modifier) => modifier.id !== id);
  instance.powerModifiers.push({ id, sourceId, kind: "add", value, duration: "round" });
}

function grimoirStageDecision(
  state: GameState,
  user: PlayerState,
  tokiomi: PlayerState,
  definitions: Record<string, CardDefinition>,
  openDecision: (decision: PendingDecision) => void,
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${user.id}:${TOKIOMI_ITEM_GRIMOIR}:discard-two`;
  state.effectQueue.push({
    effectId,
    handlerId: TOKIOMI_GRIMOIR_RESOLVE,
    sourceId: TOKIOMI_ITEM_GRIMOIR,
    controllerPlayerId: user.id,
    payload: { stage: "discard-two", tokiomiPlayerId: tokiomi.id },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: user.id,
    chooserPlayerIds: [user.id],
    kind: "tokiomi-grimoir-discard-two",
    options: user.hand.map((id) => ({ id, label: labelCard(definitions, state, id) })),
    min: 2,
    max: 2,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function openGrimoirSearch(
  state: GameState,
  user: PlayerState,
  tokiomiPlayerId: string,
  definitions: Record<string, CardDefinition>,
  openDecision: (decision: PendingDecision) => void,
): void {
  if (user.deck.length === 0) throw new Error("TOKIOMI_GRIMOIR_DECK_EMPTY");
  const effectId = `${state.gameInstanceId}:${state.revision}:${user.id}:${TOKIOMI_ITEM_GRIMOIR}:search`;
  const candidates = [...user.deck];
  state.effectQueue.push({
    effectId,
    handlerId: TOKIOMI_GRIMOIR_RESOLVE,
    sourceId: TOKIOMI_ITEM_GRIMOIR,
    controllerPlayerId: user.id,
    payload: { stage: "search", tokiomiPlayerId, candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: user.id,
    chooserPlayerIds: [user.id],
    kind: "tokiomi-grimoir-search",
    options: candidates.map((id) => ({ id, label: labelCard(definitions, state, id) })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function openTokiomiDiscard(
  state: GameState,
  controller: PlayerState,
  tokiomi: PlayerState,
  definitions: Record<string, CardDefinition>,
  openDecision: (decision: PendingDecision) => void,
): void {
  if (tokiomi.hand.length === 0) return;
  const effectId = `${state.gameInstanceId}:${state.revision}:${controller.id}:${TOKIOMI_ITEM_GRIMOIR}:tokiomi-discard`;
  const candidates = [...tokiomi.hand];
  state.effectQueue.push({
    effectId,
    handlerId: TOKIOMI_GRIMOIR_RESOLVE,
    sourceId: TOKIOMI_ITEM_GRIMOIR,
    controllerPlayerId: controller.id,
    payload: { stage: "tokiomi-discard", tokiomiPlayerId: tokiomi.id, candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: tokiomi.id,
    chooserPlayerIds: [tokiomi.id],
    kind: "tokiomi-grimoir-tokiomi-discard",
    options: candidates.map((id) => ({ id, label: labelCard(definitions, state, id) })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

const resolveGrimoir: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("TOKIOMI_GRIMOIR_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved") throw new Error("TOKIOMI_GRIMOIR_DECISION_INVALID");
  const tokiomiId = typeof previous.tokiomiPlayerId === "string" ? previous.tokiomiPlayerId : undefined;
  const tokiomi = tokiomiId ? state.players[tokiomiId] : undefined;
  if (!tokiomi || tokiomi.masterId !== TOKIOMI_MASTER_ID) throw new Error("TOKIOMI_GRIMOIR_OWNER_INVALID");
  if (previous.stage === "discard-two") {
    if (selections.length !== 2 || new Set(selections).size !== 2 || selections.some((id) => !player.hand.includes(id))) throw new Error("TOKIOMI_GRIMOIR_DISCARD_INVALID");
    for (const instanceId of selections) movePlayerCard(state, player.id, instanceId, "discard");
    openGrimoirSearch(state, player, tokiomi.id, definitions, openDecision);
    return;
  }
  if (previous.stage === "search") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !candidates.includes(selections[0]) || !player.deck.includes(selections[0])) throw new Error("TOKIOMI_GRIMOIR_SEARCH_INVALID");
    movePlayerCard(state, player.id, selections[0], "hand");
    openTokiomiDiscard(state, player, tokiomi, definitions, openDecision);
    return;
  }
  if (previous.stage === "tokiomi-discard") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !candidates.includes(selections[0]) || !tokiomi.hand.includes(selections[0])) throw new Error("TOKIOMI_GRIMOIR_TOKIOMI_DISCARD_INVALID");
    movePlayerCard(state, tokiomi.id, selections[0], "discard");
    return;
  }
  throw new Error("TOKIOMI_GRIMOIR_STAGE_INVALID");
};

export function registerTokiomiCardAbilities(registry: CardAbilityRegistry, effects: EffectRuntime): void {
  if (!effects.has(TOKIOMI_BURN_REMOVE_RESOLVE)) effects.register(TOKIOMI_BURN_REMOVE_RESOLVE, resolveBurnRemoval);
  if (!effects.has(TOKIOMI_GRIMOIR_RESOLVE)) effects.register(TOKIOMI_GRIMOIR_RESOLVE, resolveGrimoir);

  if (!registry.has(TOKIOMI_FIREBALL_ABILITY)) {
    registry.register(TOKIOMI_FIREBALL_ABILITY, ({ state, playerId }) => {
      const user = state.players[playerId];
      if (!user || user.masterId !== TOKIOMI_MASTER_ID) throw new Error("TOKIOMI_FIREBALL_OWNER_INVALID");
      applyFireballBurns(state, user);
    }, { abilityLimit: "once-per-round" });
  }

  if (!registry.has("tokiomi.item.azoth-blade")) {
    registry.register("tokiomi.item.azoth-blade", ({ state, playerId, instanceId, target, definitions }) => {
      const user = state.players[playerId];
      const tokiomi = findTokiomiByItem(state, instanceId);
      if (!user) throw new Error("PLAYER_NOT_AVAILABLE");
      assertItemUseWindow(state, user, tokiomi);
      const data = itemData(target);
      const targetInstanceId = typeof data.targetInstanceId === "string" ? data.targetInstanceId : undefined;
      const targetCard = targetInstanceId ? state.cards[targetInstanceId] : undefined;
      const targetDefinition = targetCard ? definitions[targetCard.definitionId] : undefined;
      const userControlsTarget = Boolean(targetCard && (targetCard.ownerPlayerId === user.id || targetCard.controllerPlayerId === user.id));
      const targetZoneAllowed = targetCard?.zone === "hand" || (targetCard?.zone === "attack" && targetCard.active && targetCard.face === "up");
      if (!targetCard || !targetDefinition || !userControlsTarget || !targetZoneAllowed || targetDefinition.basic !== true) {
        throw new Error("TOKIOMI_AZOTH_BASIC_ATTACK_REQUIRED");
      }
      commitItemUse(state, user, tokiomi);
      addRoundCardPower(targetCard, TOKIOMI_ITEM_AZOTH, state.round, 2);
      if (user.id !== tokiomi.id && (user.locationId === "mountain" || user.locationId === "city") && user.locationId === tokiomi.locationId) {
        tokiomi.flags.roundPowerBonus = Number(tokiomi.flags.roundPowerBonus ?? 0) - 2;
      }
    }, { allowedZones: ["master-skills"], allowInactive: true, allowPublicUse: true });
  }

  if (!registry.has("tokiomi.item.grimoir")) {
    registry.register("tokiomi.item.grimoir", ({ state, playerId, instanceId, definitions, openDecision }) => {
      const user = state.players[playerId];
      const tokiomi = findTokiomiByItem(state, instanceId);
      if (!user) throw new Error("PLAYER_NOT_AVAILABLE");
      assertItemUseWindow(state, user, tokiomi);
      if (user.hand.length < 2) throw new Error("TOKIOMI_GRIMOIR_HAND_TOO_SMALL");
      if (user.deck.length === 0) throw new Error("TOKIOMI_GRIMOIR_DECK_EMPTY");
      if (!openDecision) throw new Error("TOKIOMI_GRIMOIR_DECISION_RUNTIME_REQUIRED");
      commitItemUse(state, user, tokiomi);
      grimoirStageDecision(state, user, tokiomi, definitions, openDecision);
    }, { allowedZones: ["master-skills"], allowInactive: true, allowPublicUse: true });
  }

  if (!registry.has("tokiomi.item.magic-meter")) {
    registry.register("tokiomi.item.magic-meter", ({ state, playerId, instanceId, target }) => {
      const user = state.players[playerId];
      const tokiomi = findTokiomiByItem(state, instanceId);
      if (!user) throw new Error("PLAYER_NOT_AVAILABLE");
      assertItemUseWindow(state, user, tokiomi);
      if (user.locationId !== "mountain" && user.locationId !== "city") throw new Error("TOKIOMI_MAGIC_METER_BATTLEFIELD_REQUIRED");
      const data = itemData(target);
      const terrainAdvantage = data.terrainAdvantage;
      if (terrainAdvantage !== 1 && terrainAdvantage !== 3) throw new Error("TOKIOMI_MAGIC_METER_TERRAIN_REQUIRED");
      const records = state.board.outpostRecords[user.locationId];
      const slot = terrainAdvantage === 3 ? 0 : 1;
      if (records[slot] !== null) throw new Error("REDEPLOY_TERRAIN_NOT_FREE");
      commitItemUse(state, user, tokiomi);
      redeployToFreeBattlefieldAdvantage(state, user.id, user.locationId, terrainAdvantage);
    }, { allowedZones: ["master-skills"], allowInactive: true, allowPublicUse: true });
  }

  if (!registry.has("tokiomi.item.mana-reserve")) {
    registry.register("tokiomi.item.mana-reserve", ({ state, playerId, instanceId }) => {
      const user = state.players[playerId];
      const tokiomi = findTokiomiByItem(state, instanceId);
      if (!user) throw new Error("PLAYER_NOT_AVAILABLE");
      assertItemUseWindow(state, user, tokiomi);
      commitItemUse(state, user, tokiomi);
      state.activeRuleModifiers = state.activeRuleModifiers ?? [];
      state.activeRuleModifiers.push({
        id: `${TOKIOMI_ITEM_MANA_RESERVE}:${user.id}:${state.round}`,
        sourceId: TOKIOMI_ITEM_MANA_RESERVE,
        controllerPlayerId: user.id,
        operation: "subtract",
        rule: "card_cost",
        scope: { subject: "controller", cards: { attack: true } },
        value: 1,
        duration: "round",
        createdRound: state.round,
      });
      loseMana(tokiomi, 1);
    }, { allowedZones: ["master-skills"], allowInactive: true, allowPublicUse: true });
  }
}
