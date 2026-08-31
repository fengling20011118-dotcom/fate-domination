import test from "node:test";
import assert from "node:assert/strict";

import { createGameState } from "../src/domain/state/createGameState.ts";
import { drawCards, initializePlayerDeck } from "../src/rules-core/decks.ts";
import { deployPlayer, movePlayer } from "../src/rules-core/board.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import { endStandardRound, initializeEventDeck, startStandardRound } from "../src/rules-core/rounds.ts";
import { getCardAttributes, hasCardAttribute, normalizeCardAttributes } from "../src/rules-core/content-types.ts";
import { isCardUsageAvailable, markCardUsage, resetReusableCardUsage } from "../src/rules-core/usage-limits.ts";
import { createOwnedCardInstance, createDerivedCardInstance, createDerivedCardInstances } from "../src/rules-core/decks.ts";
import { getStandardAttackRequirements } from "../src/rules-core/card-rules.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { getCardPlayCost, payMana, sumCardCosts } from "../src/rules-core/costs.ts";
import { calculateCombatPower, collectCombatAttributes } from "../src/rules-core/combat-power.ts";
import { getClosedCardZone } from "../src/rules-core/card-semantics.ts";
import { drawEventToLocation, removeEventFromLocation, replaceEventAtLocation, revealEvent } from "../src/rules-core/event-lifecycle.ts";

const situations = [
  ...Array.from({ length: 10 }, (_, index) => ({ id: `situation.regular-${index + 1}`, mana: 2 })),
  ...Array.from({ length: 3 }, (_, index) => ({ id: `situation.climax-${index + 1}`, mana: 4, climax: true })),
];

const events = Array.from({ length: 20 }, (_, index) => ({
  id: `event.fuyuki.${index + 1}`,
  victoryPoints: index % 3 + 1,
}));

function makeState() {
  const state = createGameState({
    gameInstanceId: "base-rules",
    players: [
      { id: "p1", name: "玩家一" },
      { id: "p2", name: "玩家二" },
    ],
    seed: 17,
  });
  state.status = "playing";
  initializeEventDeck(state, events, (max) => max - 1);
  initializePlayerDeck(state, "p1", ["card.low-1", "card.low-2", "card.high-1", "card.high-2"], (max) => max - 1);
  initializePlayerDeck(state, "p2", ["card.low-1", "card.low-2", "card.high-1", "card.high-2"], (max) => max - 1);
  return state;
}

test("事件生命周期支持揭示、移除、替换和弃牌重洗", () => {
  const state = makeState();
  state.board.currentEvents = { mountain: ["event.fuyuki.1"], city: [] };
  state.board.eventVisibility = { "event.fuyuki.1": "down" };
  state.board.eventDeck = ["event.fuyuki.2"];
  state.board.eventDiscard = [];
  revealEvent(state, "mountain", "event.fuyuki.1");
  assert.equal(state.board.eventVisibility["event.fuyuki.1"], "up");
  const replacement = replaceEventAtLocation(state, "mountain", "event.fuyuki.1", () => 0, "up");
  assert.equal(replacement, "event.fuyuki.2");
  assert.deepEqual(state.board.currentEvents.mountain, ["event.fuyuki.2"]);
  assert.deepEqual(state.board.eventDiscard, ["event.fuyuki.1"]);
  removeEventFromLocation(state, "mountain", "event.fuyuki.2");
  assert.deepEqual(state.board.currentEvents.mountain, []);
  state.board.eventDeck = [];
  const drawn = drawEventToLocation(state, "city", () => 0, "down");
  assert.ok(["event.fuyuki.1", "event.fuyuki.2"].includes(drawn));
  assert.equal(state.board.currentEvents.city[0], drawn);
  assert.equal(state.board.eventVisibility[drawn], "down");
});

test("事件生命周期拒绝非法地点和不在场事件", () => {
  const state = makeState();
  assert.throws(() => revealEvent(state, "workshop" as never, "event.fuyuki.1"), /EVENT_LOCATION_INVALID/);
  assert.throws(() => removeEventFromLocation(state, "mountain", "missing"), /EVENT_NOT_IN_LOCATION/);
});

test("标准回合开始会抽局势、放置两处事件并补足手牌", () => {
  const state = makeState();
  startStandardRound(state, situations, events, (max) => max - 1);
  assert.equal(state.round, 1);
  assert.equal(state.phase, "preparation");
  assert.equal(state.board.activeSituations.length, 1);
  assert.equal(state.board.currentEvents.mountain.length, 1);
  assert.equal(state.board.currentEvents.city.length, 1);
  assert.equal(state.players.p1.hand.length, 3);
  assert.equal(state.players.p1.mana, 2);
});

test("局势牌按结构化事件区配置放置，而不是固定每区一张", () => {
  const state = createGameState({ gameInstanceId: "situation-placement", players: [{ id: "p1", name: "一" }], seed: 2 });
  state.status = "playing";
  state.board.situationDeck = ["sit2"];
  state.board.eventDeck = ["city-event"];
  startStandardRound(state, [{ id: "sit2", mana: 2, eventPlacement: { mountain: 0, city: 1 } }], [{ id: "city-event", victoryPoints: 1 }], () => 0);
  assert.deepEqual(state.board.currentEvents, { mountain: [], city: ["city-event"] });
});

test("高潮局势限制新都、侦察和工房人数", () => {
  const state = makeState();
  state.status = "playing"; state.phase = "outpost"; state.activePlayerId = "p1";
  state.board.situationDeck = ["sit12"];
  state.board.eventDeck = ["event-1"];
  startStandardRound(state, [{ id: "sit12", mana: 4, climax: true, eventPlacement: { mountain: 1, city: 0 } }], [{ id: "event-1", victoryPoints: 1 }], () => 0);
  state.phase = "outpost";
  assert.throws(() => deployPlayer(state, "p1", "city"), /LOCATION_FORBIDDEN_BY_SITUATION/);
  deployPlayer(state, "p1", "workshop");
  assert.equal(state.players.p1.mana, 6);
});

test("部署、单向移动和常规两张攻击在规则模块中原子完成", () => {
  const state = makeState();
  state.round = 1;
  state.phase = "outpost";
  state.activePlayerId = "p1";
  state.players.p1.mana = 6;
  deployPlayer(state, "p1", "workshop");
  state.phase = "action";
  state.step = "move-decision";
  movePlayer(state, "p1", "city");
  assert.equal(state.players.p1.locationId, "city");
  assert.equal(state.players.p1.mana, 4);

  const definitions = {
    "card.low-1": { id: "card.low-1", name: "低位一", cost: 1, basePower: 2, typeLabel: "魔术" },
    "card.low-2": { id: "card.low-2", name: "低位二", cost: 1, basePower: 3, typeLabel: "力量" },
    "card.high-1": { id: "card.high-1", name: "高位一", cost: 2, basePower: 4, typeLabel: "迅捷" },
    "card.high-2": { id: "card.high-2", name: "高位二", cost: 2, basePower: 5, typeLabel: "魔术" },
  };
  drawCards(state, "p1", 2, (max) => max - 1);
  const selected = state.players.p1.hand.slice(0, 2);
  const result = commitStandardAttack(state, "p1", selected, [], definitions);
  assert.equal(result.paidMana, 2);
  assert.equal(state.players.p1.attack.length, 2);
  assert.equal(state.players.p1.mana, 2);
});

test("战场战果与侦察2战果在同一回合只结算一次", () => {
  const state = makeState();
  state.round = 1;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.players.p1.locationId = "mountain";
  state.players.p2.locationId = "scouting";
  state.board.locations.mountain = ["p1"];
  state.board.locations.scouting = ["p2"];
  state.board.currentEvents = { mountain: [events[0].id], city: [events[1].id] };
  const definitions = {
    "card.low-1": { id: "card.low-1", name: "低位一", cost: 0, basePower: 4, typeLabel: "魔术" },
  };
  const instanceId = "p1:combat-card";
  state.cards[instanceId] = {
    instanceId,
    definitionId: "card.low-1",
    ownerPlayerId: "p1",
    controllerPlayerId: "p1",
    zone: "attack",
    face: "up",
    active: true,
    residual: false,
    temporary: false,
    modifiers: [],
  };
  state.players.p1.attack = [instanceId];

  const first = resolveCombat(state, "mountain", definitions, Object.fromEntries(events.map((event) => [event.id, event])));
  const second = resolveCombat(state, "city", definitions, Object.fromEntries(events.map((event) => [event.id, event])));
  assert.equal(first.scoutingPlayerId, "p2");
  assert.equal(second.scoutingPlayerId, "p2");
  assert.equal(state.players.p2.victoryPoints, 2);
  assert.equal(state.board.scoutingAwardedRound, 1);
});

test("卡牌属性从结构化字段读取，并兼容旧 typeLabel", () => {
  assert.deepEqual(getCardAttributes({ attributes: ["力量", "宝具"], typeLabel: "显示文本" }), ["力量", "宝具"]);
  assert.deepEqual(getCardAttributes({ typeLabel: "力量/宝具" }), ["力量", "宝具"]);
  assert.deepEqual(getCardAttributes({ typeLabel: "敏捷/魔法/特殊" }), ["迅捷", "魔术", "特殊"]);
  assert.deepEqual(getCardAttributes({ attributes: ["敏捷", "迅捷", "魔法"], typeLabel: "显示文本" }), ["迅捷", "魔术"]);
  assert.deepEqual(getCardAttributes({ typeLabel: "被动/行动阶段" }), []);
  assert.equal(hasCardAttribute({ attributes: ["宝具"], typeLabel: "显示文本" }, "宝具"), true);
  assert.deepEqual(getCardAttributes({ attributes: [], typeLabel: "宝具" }), []);
});

test("结构化卡牌属性只接受规则确认值并统一同义词", () => {
  assert.deepEqual(normalizeCardAttributes(["敏捷", "迅捷", "魔法", "魔术", "宝具"]), ["迅捷", "魔术", "宝具"]);
  assert.throws(() => normalizeCardAttributes(["防御"]), /CARD_ATTRIBUTE_INVALID/);
  assert.deepEqual(normalizeCardAttributes([]), []);
});

test("卡牌实例使用限制按实体记录每局、每回合和每阶段状态", () => {
  const instance = { instanceId: "p1:limited", definitionId: "card.limited", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand" as const, face: "down" as const, active: false, residual: false, temporary: false, modifiers: [] };
  assert.equal(isCardUsageAvailable(instance, "once-per-game", 1, "action"), true);
  markCardUsage(instance, "once-per-game", 1, "action");
  assert.equal(isCardUsageAvailable(instance, "once-per-game", 2, "combat"), false);

  const round = { ...instance, used: undefined };
  markCardUsage(round, "once-per-round", 2, "action");
  assert.equal(isCardUsageAvailable(round, "once-per-round", 2, "combat"), false);
  assert.equal(isCardUsageAvailable(round, "once-per-round", 3, "action"), true);
  resetReusableCardUsage(round);
  assert.equal(round.usedRound, undefined);

  const phase = { ...instance, used: undefined };
  markCardUsage(phase, "once-per-turn", 4, "action");
  assert.equal(isCardUsageAvailable(phase, "once-per-turn", 4, "action"), false);
  assert.equal(isCardUsageAvailable(phase, "once-per-turn", 4, "combat"), true);
});

test("衍生卡通过统一实例工厂进入指定区域并记录来源", () => {
  const state = makeState();
  const instance = createOwnedCardInstance(state, "p1", {
    instanceId: "p1:derived:1", definitionId: "card.derived", zone: "master-skills",
    residual: true, createdByEffectId: "effect.life-sea.1",
  });
  assert.equal(instance.createdByEffectId, "effect.life-sea.1");
  assert.deepEqual(state.players.p1.masterSkills, ["p1:derived:1"]);
  assert.throws(() => createOwnedCardInstance(state, "p1", { instanceId: "p1:derived:1", definitionId: "card.derived", zone: "master-skills" }), /CARD_INSTANCE_ID_DUPLICATE/);
});

test("衍生卡工厂要求非空来源效果，普通工厂也拒绝空来源", () => {
  const state = makeState();
  const instance = createDerivedCardInstance(state, "p1", {
    instanceId: "p1:derived:factory",
    definitionId: "card.derived",
    zone: "master-skills",
    residual: true,
    sourceEffectId: "effect.life-sea.factory",
  });
  assert.equal(instance.createdByEffectId, "effect.life-sea.factory");
  assert.throws(() => createDerivedCardInstance(state, "p1", {
    instanceId: "p1:derived:empty",
    definitionId: "card.derived",
    zone: "master-skills",
    sourceEffectId: "",
  }), /CARD_SOURCE_EFFECT_INVALID/);
  assert.throws(() => createOwnedCardInstance(state, "p1", {
    instanceId: "p1:derived:empty-2",
    definitionId: "card.derived",
    zone: "master-skills",
    createdByEffectId: "",
  }), /CARD_SOURCE_EFFECT_INVALID/);
});

test("衍生卡批量工厂在全部校验通过后一次性创建，失败不会留下半批实例", () => {
  const state = makeState();
  const created = createDerivedCardInstances(state, "p1", [
    { instanceId: "p1:batch:1", definitionId: "card.beast-1", zone: "master-skills", sourceEffectId: "effect.batch" },
    { instanceId: "p1:batch:2", definitionId: "card.beast-2", zone: "master-skills", sourceEffectId: "effect.batch" },
  ]);
  assert.equal(created.length, 2);
  assert.deepEqual(state.players.p1.masterSkills.slice(-2), ["p1:batch:1", "p1:batch:2"]);
  assert.throws(() => createDerivedCardInstances(state, "p1", [
    { instanceId: "p1:batch:3", definitionId: "card.beast-3", zone: "master-skills", sourceEffectId: "effect.batch" },
    { instanceId: "p1:batch:3", definitionId: "card.beast-4", zone: "master-skills", sourceEffectId: "effect.batch" },
  ]), /CARD_INSTANCE_ID_DUPLICATE/);
  assert.equal(state.cards["p1:batch:3"], undefined);
  assert.equal(state.players.p1.masterSkills.includes("p1:batch:3"), false);
  assert.throws(() => createDerivedCardInstances(state, "p1", [
    { instanceId: "p1:batch:4", definitionId: "card.beast-4", zone: "master-skills", sourceEffectId: "effect.batch" },
    { instanceId: "p1:batch:5", definitionId: "card.beast-5", zone: "master-skills", sourceEffectId: "" },
  ]), /CARD_SOURCE_EFFECT_INVALID/);
  assert.equal(state.cards["p1:batch:4"], undefined);
});

test("常规出牌门槛由共享卡牌规则组件计算", () => {
  const state = makeState();
  const residual = "p1:residual";
  state.cards[residual] = {
    instanceId: residual,
    definitionId: "card.residual",
    ownerPlayerId: "p1",
    controllerPlayerId: "p1",
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
    temporary: false,
    modifiers: [],
  };
  state.players.p1.attack = [residual];
  const requirements = getStandardAttackRequirements(state.players.p1, state, {
    "card.residual": { id: "card.residual", name: "残留", cost: 0, basePower: 1, typeLabel: "特殊", tags: ["reduces-standard-attack-by-one", "primitive-dragon"] },
  });
  assert.deepEqual(requirements, { requiredCards: 1, primitiveDragonActive: true });
});

test("费用组件统一计算卡牌费用并保持支付原子性", () => {
  const state = makeState();
  const definitions = {
    "card.low-1": { id: "card.low-1", name: "一", cost: 2, basePower: 1, typeLabel: "力量" },
    "card.low-2": { id: "card.low-2", name: "二", cost: 3, basePower: 1, typeLabel: "力量" },
  };
  const ids = state.players.p1.deck.slice(0, 2);
  assert.equal(sumCardCosts(state, ids, definitions), 5);
  state.players.p1.mana = 4;
  assert.throws(() => payMana(state.players.p1, 5), /INSUFFICIENT_MANA/);
  assert.equal(state.players.p1.mana, 4);
  payMana(state.players.p1, 3);
  assert.equal(state.players.p1.mana, 1);
});

test("结构化回合线性费用不会依赖技能描述文本", () => {
  const state = makeState();
  const definition = { id: "skill.dynamic", name: "动态费用", cost: 0, costRule: { kind: "round-linear" as const, base: 16, perRound: -2, min: 0 }, basePower: 2, typeLabel: "魔术" };
  state.round = 1;
  assert.equal(getCardPlayCost(state, definition), 14);
  state.round = 7;
  assert.equal(getCardPlayCost(state, definition), 2);
  state.round = 9;
  assert.equal(getCardPlayCost(state, definition), 0);
});

test("战斗威力组件只计算明置激活牌并按地点应用部署修正", () => {
  const state = makeState();
  const up = "p1:up"; const down = "p1:down";
  state.cards[up] = { instanceId: up, definitionId: "card.up", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards[down] = { instanceId: down, definitionId: "card.down", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = [up, down];
  state.players.p1.flags = { roundPowerBonus: 1, deploymentBonusActive: true, deploymentLocationId: "mountain", deploymentBonus: 2 };
  const definitions = {
    "card.up": { id: "card.up", name: "明置", cost: 0, basePower: 4, typeLabel: "力量" },
    "card.down": { id: "card.down", name: "暗置", cost: 0, basePower: 9, typeLabel: "宝具" },
  };
  assert.equal(calculateCombatPower(state, state.players.p1, definitions, "mountain"), 7);
  assert.equal(calculateCombatPower(state, state.players.p1, definitions, "city"), 5);
  assert.deepEqual(collectCombatAttributes(state, state.players.p1, definitions), ["力量"]);
});

test("卡牌生命周期组件统一决定关闭后的归属区域", () => {
  const instance = { instanceId: "p1:skill", definitionId: "servant.skill", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack" as const, face: "up" as const, active: true, residual: false, temporary: false, modifiers: [] };
  assert.equal(getClosedCardZone({ id: "servant.skill", name: "技能", cost: 0, basePower: 0, typeLabel: "特殊", isSkill: true }, instance), "servant-skills");
  assert.equal(getClosedCardZone({ id: "card.normal", name: "普通", cost: 0, basePower: 0, typeLabel: "力量" }, { ...instance, definitionId: "card.normal" }), "discard");
  assert.equal(getClosedCardZone({ id: "card.normal", name: "普通", cost: 0, basePower: 0, typeLabel: "力量" }, instance, true), "removed");
});

test("局势牌禁止属性时拦截对应攻击，已激活残留牌不受影响", () => {
  const state = makeState();
  state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "p1"; state.players.p1.mana = 8;
  state.modeState = { situationRestrictions: { forbiddenAttributes: ["宝具"] } };
  const definitions = {
    "card.noble": { id: "card.noble", name: "宝具", cost: 0, basePower: 5, typeLabel: "宝具", attributes: ["宝具"], isSkill: true, requiresEightMana: false },
    "card.normal": { id: "card.normal", name: "普通", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"] },
  };
  const noble = "p1:noble"; const normal = "p1:normal";
  state.cards[noble] = { instanceId: noble, definitionId: "card.noble", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "master-skills", face: "up", active: false, residual: false, temporary: false, modifiers: [] };
  state.cards[normal] = { instanceId: normal, definitionId: "card.normal", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.masterSkills = [noble]; state.players.p1.hand = [normal];
  assert.throws(() => commitStandardAttack(state, "p1", [noble, normal], [], definitions), /CARD_ATTRIBUTE_FORBIDDEN_BY_SITUATION/);
});

test("结构化阶段步骤窗口限制卡牌出牌", () => {
  const state = makeState();
  state.phase = "action"; state.step = "move-decision"; state.activePlayerId = "p1";
  const id = "p1:step-card";
  state.cards[id] = { instanceId: id, definitionId: "card.step", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.hand = [id];
  const definitions = { "card.step": { id: "card.step", name: "步骤牌", cost: 0, basePower: 1, typeLabel: "特殊", phases: ["action" as const], steps: ["play-batch-draft" as const] } };
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "p1", instanceId: id, definitions, faceDown: false }), /CARD_PLAY_STEP_FORBIDDEN/);
});

test("临时攻击回合结束时移除，不会因残留标记继续保留", () => {
  const state = makeState();
  const temporary = "p1:temporary";
  state.cards[temporary] = {
    instanceId: temporary,
    definitionId: "card.temp",
    ownerPlayerId: "p1",
    controllerPlayerId: "p1",
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
    temporary: true,
    modifiers: [],
  };
  state.players.p1.attack = [temporary];
  endStandardRound(state, { "card.temp": { isSkill: true } });
  assert.equal(state.cards[temporary].zone, "removed");
  assert.equal(state.cards[temporary].active, false);
  assert.deepEqual(state.players.p1.attack, []);
});
