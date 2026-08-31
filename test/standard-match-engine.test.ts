import test from "node:test";
import assert from "node:assert/strict";

import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { SkillRegistry } from "../src/rules-core/skill-registry.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { sanzangGoldenCicada } from "../src/rules-core/sanzang-skill.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { addCardToAttack } from "../src/rules-core/card-play.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import { CardAbilityRegistry } from "../src/rules-core/card-abilities.ts";
import { DecisionManager } from "../src/match-engine/decisions.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";

const cards = {
  "card.low-1": { id: "card.low-1", name: "低位一", cost: 0, basePower: 2, typeLabel: "魔术" },
  "card.low-2": { id: "card.low-2", name: "低位二", cost: 0, basePower: 3, typeLabel: "力量" },
  "card.high-1": { id: "card.high-1", name: "高位一", cost: 1, basePower: 4, typeLabel: "迅捷" },
  "card.high-2": { id: "card.high-2", name: "高位二", cost: 1, basePower: 5, typeLabel: "魔术" },
};
const situations = [
  ...Array.from({ length: 10 }, (_, index) => ({ id: `situation.regular-${index + 1}`, mana: 2 })),
  ...Array.from({ length: 3 }, (_, index) => ({ id: `situation.climax-${index + 1}`, mana: 4, climax: true })),
];
const events = Array.from({ length: 20 }, (_, index) => ({ id: `event.fuyuki.${index + 1}`, victoryPoints: 1 }));

function makeCommand(state: ReturnType<typeof createGameState>, id: string, type: string, actorId: string, payload: unknown = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

test("标准对局引擎可从开局走到战斗和侦察结算", () => {
  const state = createGameState({ gameInstanceId: "standard-engine", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 77 });
  const engine = new StandardMatchEngine({
    cards,
    situations,
    events,
    playerDecks: {
      p1: ["card.low-1", "card.low-2", "card.high-1", "card.high-2"],
      p2: ["card.low-1", "card.low-2", "card.high-1", "card.high-2"],
    },
  });

  let result = engine.execute(state, makeCommand(state, "start", CommandType.StartStandardGame, "host"));
  assert.equal(result.state.round, 1);
  assert.equal(result.state.players.p1.hand.length, 3);
  result.state.phase = "outpost";
  result.state.activePlayerId = "p1";
  result = engine.execute(result.state, makeCommand(result.state, "deploy", CommandType.DeployPlayer, "p1", { locationId: "mountain" }));
  result.state.phase = "action";
  result.state.step = "play-batch-draft";
  result.state.activePlayerId = "p1";
  const selected = result.state.players.p1.hand.slice(0, 2);
  result = engine.execute(result.state, makeCommand(result.state, "attack", CommandType.CommitAttack, "p1", { faceUpInstanceIds: selected, faceDownInstanceIds: [] }));
  result.state.phase = "combat";
  result.state.board.locations.scouting = ["p2"];
  result.state.players.p2.locationId = "scouting";
  result = engine.execute(result.state, makeCommand(result.state, "combat", CommandType.ResolveCombat, "p1", { locationId: "mountain" }));
  assert.equal(result.state.players.p2.victoryPoints, 2);
  assert.equal(result.state.board.scoutingAwardedRound, 1);
});

test("电子版标准对局不会自动创建实体规则 NPC", () => {
  const state = createGameState({ gameInstanceId: "no-standard-npc", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 79 });
  const engine = new StandardMatchEngine({ cards, situations, events, playerDecks: { p1: [], p2: [] } });
  const result = engine.execute(state, makeCommand(state, "start-no-npc", CommandType.StartStandardGame, "host"));
  assert.deepEqual(Object.keys(result.state.players), ["p1", "p2"]);
  assert.equal(result.state.turnOrder.includes("npc.standard"), false);
  assert.equal(Object.values(result.state.players).some((player) => "isNpc" in player), false);
});

test("阵地建造仅在残留牌已激活且本人部署于魔术工房时触发", () => {
  const skillId = "servant.medea.skill.sc-medea-2";
  const skills = new SkillRegistry();
  skills.register({ id: skillId, name: "阵地建造", ownerType: "servant", ownerId: "servant.medea", activation: "residual", windows: [], cost: 0, costRule: { kind: "round-linear", base: 16, perRound: -2, min: 0 }, basePower: 2, typeLabel: "魔术", text: "", supportLevel: "FULL", handlerId: "core.territory-creation", requiresActiveCard: true });
  const engine = new StandardMatchEngine({ cards, situations, events, skills, playerDecks: { p1: [] } });

  const inactive = createGameState({ gameInstanceId: "territory-inactive", players: [{ id: "p1", name: "一" }], seed: 1 });
  inactive.status = "playing"; inactive.phase = "outpost"; inactive.activePlayerId = "p1"; inactive.players.p1.servantId = "servant.medea"; inactive.players.p1.mana = 0;
  let result = engine.execute(inactive, makeCommand(inactive, "deploy-inactive", CommandType.DeployPlayer, "p1", { locationId: "workshop" }));
  assert.equal(result.state.players.p1.mana, 2);
  assert.equal(result.state.players.p1.victoryPoints, 0);

  const active = createGameState({ gameInstanceId: "territory-active", players: [{ id: "p1", name: "一" }], seed: 1 });
  active.status = "playing"; active.phase = "outpost"; active.activePlayerId = "p1"; active.players.p1.servantId = "servant.medea"; active.players.p1.mana = 0;
  active.cards["p1:territory"] = { instanceId: "p1:territory", definitionId: skillId, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: true, temporary: false, modifiers: [] };
  active.players.p1.attack = ["p1:territory"];
  result = engine.execute(active, makeCommand(active, "deploy-active", CommandType.DeployPlayer, "p1", { locationId: "workshop" }));
  assert.equal(result.state.players.p1.mana, 3);
  assert.equal(result.state.players.p1.victoryPoints, 2);
  assert.equal(result.state.effectQueue.length, 0);
});

test("局势牌堆耗尽后结束对局，不会继续抽空牌堆", () => {
  const state = createGameState({ gameInstanceId: "finish", players: [{ id: "p1", name: "一" }], seed: 77 });
  const engine = new StandardMatchEngine({ cards, situations, events, playerDecks: { p1: ["card.low-1", "card.low-2"] } });
  let result = engine.execute(state, makeCommand(state, "start", CommandType.StartStandardGame, "host"));
  result.state.board.situationDeck = [];
  result.state.phase = "combat";
  result.state.step = "settlement";
  result.state.modeState = { resolvedCombats: ["mountain", "city"] };
  result = engine.execute(result.state, makeCommand(result.state, "end", CommandType.EndRound, "p1"));
  assert.equal(result.state.status, "finished");
});

test("技能卡作为卡牌实例加入技能区，并可在满足8魔力门槛后加入攻击", () => {
  const skills = new SkillRegistry();
  skills.register({ id: "servant.s.skill", name: "技能卡", ownerType: "servant", ownerId: "s", activation: "phase", windows: ["action"], cost: 2, requirement: 8, basePower: 4, typeLabel: "特殊", text: "", supportLevel: "FULL" }, () => undefined);
  const state = createGameState({ gameInstanceId: "skill-card", players: [{ id: "p1", name: "一" }], seed: 77 });
  state.players.p1.servantId = "s";
  const engine = new StandardMatchEngine({ cards, situations, events, skills, playerDecks: { p1: ["card.low-1", "card.low-2"] } });
  let result = engine.execute(state, makeCommand(state, "start", CommandType.StartStandardGame, "host"));
  result.state.phase = "action"; result.state.step = "play-batch-draft"; result.state.activePlayerId = "p1"; result.state.players.p1.mana = 8;
  const skillInstance = result.state.players.p1.servantSkills[0];
  const normalInstance = result.state.players.p1.hand[0];
  result = engine.execute(result.state, makeCommand(result.state, "attack", CommandType.CommitAttack, "p1", { faceUpInstanceIds: [skillInstance, normalInstance], faceDownInstanceIds: [] }));
  assert.equal(result.state.players.p1.attack.length, 2);
  assert.equal(result.state.cards[skillInstance].zone, "attack");
  const lowManaState = createGameState({ gameInstanceId: "skill-card-low", players: [{ id: "p1", name: "一" }], seed: 77 });
  lowManaState.players.p1.servantId = "s";
  let lowMana = engine.execute(lowManaState, makeCommand(lowManaState, "start-low", CommandType.StartStandardGame, "host")).state;
  lowMana.phase = "action"; lowMana.step = "play-batch-draft"; lowMana.activePlayerId = "p1"; lowMana.players.p1.mana = 7;
  assert.throws(() => engine.execute(lowMana, makeCommand(lowMana, "attack-low-mana", CommandType.CommitAttack, "p1", { faceUpInstanceIds: [lowMana.players.p1.servantSkills[0], lowMana.players.p1.hand[0]], faceDownInstanceIds: [] })), /SKILL_REQUIRES_EIGHT_MANA/);
});

function makeRidingFixture(gameInstanceId: string, extraCards: Record<string, typeof cards["card.low-1"]> = {}) {
  const skillId = "servant.rider.skill.sc-riding";
  const skills = new SkillRegistry();
  skills.register({
    id: skillId,
    name: "骑乘",
    ownerType: "servant",
    ownerId: "servant.rider",
    activation: "phase",
    windows: ["action"],
    cost: 1,
    requirement: 0,
    basePower: 2,
    typeLabel: "迅捷",
    text: "",
    supportLevel: "FULL",
    handlerId: "core.riding",
    limit: "once-per-round",
    playDrawIfWithBasicAttack: 1,
    appendFromHand: { maxCount: 3, maxBasePower: 3 },
    requiresActiveCard: true,
  });
  const engine = new StandardMatchEngine({ cards: { ...cards, ...extraCards }, situations, events, skills, playerDecks: { p1: [] } });
  const state = createGameState({ gameInstanceId, players: [{ id: "p1", name: "一" }], seed: 101 });
  state.status = "playing";
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "p1";
  state.round = 1;
  state.players.p1.servantId = "servant.rider";
  state.cards["p1:riding"] = { instanceId: "p1:riding", definitionId: skillId, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = ["p1:riding"];
  return { state, engine, skillId };
}

test("骑乘与基础攻击同时打出时抽一张牌，并产生逐卡打出事件", () => {
  const fixture = makeRidingFixture("riding-draw", {
    "card.basic-attack": { id: "card.basic-attack", name: "基础攻击", cost: 0, basePower: 2, typeLabel: "力量", basic: true },
    "card.draw-target": { id: "card.draw-target", name: "抽牌目标", cost: 0, basePower: 1, typeLabel: "魔术" },
  });
  const { state, engine, skillId } = fixture;
  state.players.p1.mana = 1;
  state.cards["p1:riding"].zone = "servant-skills";
  state.cards["p1:riding"].active = false;
  state.players.p1.attack = [];
  state.players.p1.servantSkills = ["p1:riding"];
  state.cards["p1:basic"] = { instanceId: "p1:basic", definitionId: "card.basic-attack", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.hand = ["p1:basic"];
  state.cards["p1:draw"] = { instanceId: "p1:draw", definitionId: "card.draw-target", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "deck", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.deck = ["p1:draw"];
  const result = engine.execute(state, makeCommand(state, "riding-commit", CommandType.CommitAttack, "p1", { faceUpInstanceIds: ["p1:riding", "p1:basic"], faceDownInstanceIds: [] }));
  assert.equal(result.state.players.p1.hand.includes("p1:draw"), true);
  assert.equal(result.events.filter((event) => event.type === "card.played").length, 2);
  assert.equal(result.events.some((event) => event.type === "card.play-effect.queued"), true);
  assert.equal(result.state.players.p1.mana, 0);
  assert.equal(result.state.step, "settlement");
  assert.equal(result.state.cards["p1:basic"].zone, "attack");
  assert.equal(result.state.cards["p1:riding"].definitionId, skillId);
});

test("骑乘单独发动时可从手牌追加至多三张低威力牌并支付费用", () => {
  const fixture = makeRidingFixture("riding-append", {
    "card.append-a": { id: "card.append-a", name: "追加甲", cost: 1, basePower: 2, typeLabel: "力量" },
    "card.append-b": { id: "card.append-b", name: "追加乙", cost: 2, basePower: 3, typeLabel: "魔术" },
    "card.append-c": { id: "card.append-c", name: "追加丙", cost: 1, basePower: 1, typeLabel: "特殊" },
  });
  const { state, engine, skillId } = fixture;
  state.players.p1.mana = 4;
  for (const [instanceId, definitionId] of [["p1:a", "card.append-a"], ["p1:b", "card.append-b"], ["p1:c", "card.append-c"]]) {
    state.cards[instanceId] = { instanceId, definitionId, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  }
  state.players.p1.hand = ["p1:a", "p1:b", "p1:c"];
  const result = engine.execute(state, makeCommand(state, "riding-append", CommandType.UseSkill, "p1", { skillId, data: { instanceIds: ["p1:a", "p1:b", "p1:c"] } }));
  assert.equal(result.state.players.p1.mana, 0);
  assert.deepEqual(result.state.players.p1.attack.slice(1), ["p1:a", "p1:b", "p1:c"]);
  assert.ok(["p1:a", "p1:b", "p1:c"].every((id) => result.state.cards[id].zone === "attack" && result.state.cards[id].face === "up"));
  assert.equal(result.events.filter((event) => event.type === "card.played").length, 3);
  assert.equal(result.state.players.p1.usage[skillId].used, true);
  assert.throws(() => engine.execute(result.state, makeCommand(result.state, "riding-append-again", CommandType.UseSkill, "p1", { skillId, data: { instanceIds: [] } })), /SKILL_USE_FORBIDDEN/);
});

test("骑乘拒绝超过三张或基本威力超过3的牌", () => {
  const fixture = makeRidingFixture("riding-bounds", {
    "card.append-high": { id: "card.append-high", name: "高威力", cost: 0, basePower: 4, typeLabel: "力量" },
    "card.append-1": { id: "card.append-1", name: "追加一", cost: 0, basePower: 1, typeLabel: "力量" },
    "card.append-2": { id: "card.append-2", name: "追加二", cost: 0, basePower: 1, typeLabel: "力量" },
    "card.append-3": { id: "card.append-3", name: "追加三", cost: 0, basePower: 1, typeLabel: "力量" },
    "card.append-4": { id: "card.append-4", name: "追加四", cost: 0, basePower: 1, typeLabel: "力量" },
  });
  const { state, engine, skillId } = fixture;
  state.players.p1.mana = 4;
  const hand = ["p1:high", "p1:1", "p1:2", "p1:3", "p1:4"];
  const definitions = ["card.append-high", "card.append-1", "card.append-2", "card.append-3", "card.append-4"];
  hand.forEach((instanceId, index) => {
    state.cards[instanceId] = { instanceId, definitionId: definitions[index], ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  });
  state.players.p1.hand = hand;
  assert.throws(() => engine.execute(state, makeCommand(state, "riding-high", CommandType.UseSkill, "p1", { skillId, data: { instanceIds: ["p1:high"] } })), /APPEND_CARD_POWER_FORBIDDEN/);
  assert.throws(() => engine.execute(state, makeCommand(state, "riding-too-many", CommandType.UseSkill, "p1", { skillId, data: { instanceIds: ["p1:1", "p1:2", "p1:3", "p1:4"] } })), /APPEND_CARD_COUNT_INVALID/);
  assert.equal(state.players.p1.mana, 4);
  assert.deepEqual(state.players.p1.hand, hand);
  assert.deepEqual(state.players.p1.attack, ["p1:riding"]);
});

test("骑乘追加出牌魔力不足时整批原子失败", () => {
  const fixture = makeRidingFixture("riding-atomic", {
    "card.append-a": { id: "card.append-a", name: "追加甲", cost: 1, basePower: 2, typeLabel: "力量" },
    "card.append-b": { id: "card.append-b", name: "追加乙", cost: 2, basePower: 3, typeLabel: "魔术" },
  });
  const { state, engine, skillId } = fixture;
  state.players.p1.mana = 2;
  for (const [instanceId, definitionId] of [["p1:a", "card.append-a"], ["p1:b", "card.append-b"]]) {
    state.cards[instanceId] = { instanceId, definitionId, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  }
  state.players.p1.hand = ["p1:a", "p1:b"];
  assert.throws(() => engine.execute(state, makeCommand(state, "riding-insufficient", CommandType.UseSkill, "p1", { skillId, data: { instanceIds: ["p1:a", "p1:b"] } })), /INSUFFICIENT_MANA/);
  assert.equal(state.players.p1.mana, 2);
  assert.deepEqual(state.players.p1.hand, ["p1:a", "p1:b"]);
  assert.deepEqual(state.players.p1.attack, ["p1:riding"]);
  assert.equal(state.players.p1.usage[skillId], undefined);
});

test("骑乘追加技能牌仍遵循8魔力门槛，并在真名解放牌成功打出后公开真名", () => {
  const gatedId = "servant.other.skill.gated";
  const revealId = "servant.other.skill.reveal";
  const skills = new SkillRegistry();
  skills.register({ id: "servant.rider.skill.sc-riding", name: "骑乘", ownerType: "servant", ownerId: "servant.rider", activation: "phase", windows: ["action"], cost: 1, requirement: 0, basePower: 2, typeLabel: "迅捷", text: "", supportLevel: "FULL", handlerId: "core.riding", limit: "once-per-round", appendFromHand: { maxCount: 3, maxBasePower: 3 }, requiresActiveCard: true, playDrawIfWithBasicAttack: 1 });
  skills.register({ id: gatedId, name: "八魔力技能", ownerType: "servant", ownerId: "servant.other", activation: "phase", windows: ["action"], cost: 1, requirement: 8, basePower: 2, typeLabel: "特殊", text: "", supportLevel: "PARTIAL" });
  skills.register({ id: revealId, name: "真名解放技能", ownerType: "servant", ownerId: "servant.other", activation: "play", windows: ["action"], cost: 0, requirement: 0, basePower: 2, typeLabel: "特殊", text: "", supportLevel: "PARTIAL", revealsTrueNameOnPlay: true });
  const engine = new StandardMatchEngine({ cards: { ...cards }, situations, events, skills, playerDecks: { p1: [] } });
  const state = createGameState({ gameInstanceId: "riding-gates", players: [{ id: "p1", name: "一" }], seed: 103 });
  state.status = "playing"; state.phase = "action"; state.step = "settlement"; state.activePlayerId = "p1"; state.round = 1; state.players.p1.servantId = "servant.rider"; state.players.p1.mana = 7;
  state.cards.riding = { instanceId: "riding", definitionId: "servant.rider.skill.sc-riding", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards.gated = { instanceId: "gated", definitionId: gatedId, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = ["riding"]; state.players.p1.hand = ["gated"];
  assert.throws(() => engine.execute(state, makeCommand(state, "riding-eight", CommandType.UseSkill, "p1", { skillId: "servant.rider.skill.sc-riding", data: { instanceIds: ["gated"] } })), /SKILL_REQUIRES_EIGHT_MANA/);
  state.players.p1.mana = 0;
  state.cards.gated.definitionId = revealId;
  const result = engine.execute(state, makeCommand(state, "riding-reveal", CommandType.UseSkill, "p1", { skillId: "servant.rider.skill.sc-riding", data: { instanceIds: ["gated"] } }));
  assert.equal(result.state.players.p1.trueNameRevealed, true);
});

test("骑乘不能在行动阶段之外发动", () => {
  const fixture = makeRidingFixture("riding-window");
  fixture.state.phase = "outpost";
  assert.throws(() => fixture.engine.execute(fixture.state, makeCommand(fixture.state, "riding-outpost", CommandType.UseSkill, "p1", { skillId: fixture.skillId, data: { instanceIds: [] } })), /SKILL_USE_FORBIDDEN/);
});

test("黄金冲击可在魔力不足8且局势禁止宝具时明置打出，并按每局一次移除", () => {
  const skillId = "servant.kintoki.skill.sc-kintoki-1";
  const skills = new SkillRegistry();
  skills.register({ id: skillId, name: "黄金冲击", ownerType: "servant", ownerId: "servant.kintoki", activation: "play", windows: [], cost: 0, requirement: 8, basePower: 11, typeLabel: "宝具/力量", text: "【真名解放】<每局游戏限一次>你拥有的魔力少于8点也可打出此牌。局势牌无法禁止你打出此牌。", supportLevel: "FULL", handlerId: "core.card-play", limit: "once-per-game", requiresEightMana: false, ignoresSituationRestrictions: true, revealsTrueNameOnPlay: true });
  const engine = new StandardMatchEngine({ cards, situations, events, skills, playerDecks: { p1: ["card.low-1"] } });
  const state = createGameState({ gameInstanceId: "kintoki-exception", players: [{ id: "p1", name: "一" }], seed: 107 });
  state.status = "playing"; state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "p1"; state.round = 1; state.players.p1.servantId = "servant.kintoki"; state.players.p1.mana = 0;
  state.modeState.situationRestrictions = { forbiddenAttributes: ["宝具"] };
  state.cards.skill = { instanceId: "skill", definitionId: skillId, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "servant-skills", face: "up", active: false, residual: false, temporary: false, modifiers: [] };
  state.cards.attack = { instanceId: "attack", definitionId: "card.low-1", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.servantSkills = ["skill"]; state.players.p1.hand = ["attack"];
  const result = engine.execute(state, makeCommand(state, "kintoki-play", CommandType.CommitAttack, "p1", { faceUpInstanceIds: ["skill", "attack"], faceDownInstanceIds: [] }));
  assert.equal(result.state.players.p1.trueNameRevealed, true);
  assert.equal(result.state.players.p1.mana, 0);
  assert.equal(result.state.cards.skill.zone, "attack");
  assert.equal(result.events.some((event) => event.type === "servant.true-name-revealed"), true);
  endStandardRound(result.state, engine.content.skills!.asCardDefinitions());
  assert.equal(result.state.cards.skill.zone, "removed");
  assert.equal(result.state.cards.skill.active, false);
});

test("肯尼斯双重御主在开局被动生效，其他御主仍受8魔力技能门槛限制", () => {
  const waiverId = "master.kayneth.skill.s1";
  const gatedId = "servant.gated.skill.sc-gated";
  const skills = new SkillRegistry();
  skills.register({ id: waiverId, name: "双重御主", ownerType: "master", ownerId: "master.kayneth", activation: "passive", windows: [], cost: 0, text: "你拥有的魔力少于8点也可以使用技能牌。", supportLevel: "FULL", handlerId: "core.skill-eight-mana-waiver" });
  skills.register({ id: gatedId, name: "门槛技能", ownerType: "servant", ownerId: "servant.gated", activation: "play", windows: [], cost: 0, requirement: 8, basePower: 2, typeLabel: "特殊", text: "", supportLevel: "PARTIAL" });
  const engine = new StandardMatchEngine({ cards, situations, events, skills, playerDecks: { p1: ["card.low-1"], p2: ["card.low-1"] } });

  const state = createGameState({ gameInstanceId: "kayneth-waiver", players: [{ id: "p1", name: "一" }], seed: 109 });
  state.players.p1.masterId = "master.kayneth";
  state.players.p1.servantId = "servant.gated";
  let result = engine.execute(state, makeCommand(state, "kayneth-start", CommandType.StartStandardGame, "host"));
  assert.equal(result.state.players.p1.flags.skillEightManaWaiver, true);
  result.state.phase = "action"; result.state.step = "play-batch-draft"; result.state.activePlayerId = "p1"; result.state.players.p1.mana = 0;
  const gatedInstance = result.state.players.p1.servantSkills.find((id) => result.state.cards[id].definitionId === gatedId)!;
  const basicInstance = result.state.players.p1.hand[0];
  result = engine.execute(result.state, makeCommand(result.state, "kayneth-play", CommandType.CommitAttack, "p1", { faceUpInstanceIds: [gatedInstance, basicInstance], faceDownInstanceIds: [] }));
  assert.equal(result.state.cards[gatedInstance].zone, "attack");

  const ordinary = createGameState({ gameInstanceId: "ordinary-gated", players: [{ id: "p1", name: "一" }], seed: 109 });
  ordinary.status = "playing"; ordinary.phase = "action"; ordinary.step = "play-batch-draft"; ordinary.activePlayerId = "p1"; ordinary.players.p1.servantId = "servant.gated"; ordinary.players.p1.mana = 0;
  ordinary.cards.gated = { instanceId: "gated", definitionId: gatedId, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "servant-skills", face: "up", active: false, residual: false, temporary: false, modifiers: [] };
  ordinary.cards.basic = { instanceId: "basic", definitionId: "card.low-1", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  ordinary.players.p1.servantSkills = ["gated"]; ordinary.players.p1.hand = ["basic"];
  assert.throws(() => engine.execute(ordinary, makeCommand(ordinary, "ordinary-reject", CommandType.CommitAttack, "p1", { faceUpInstanceIds: ["gated", "basic"], faceDownInstanceIds: [] })), /SKILL_REQUIRES_EIGHT_MANA/);
});

test("韦伯战略部署支付1点魔力抽2张牌，并在非前哨阶段或费用不足时拒绝", () => {
  const skillId = "master.waver.skill.s2";
  const skills = new SkillRegistry();
  skills.register({ id: skillId, name: "战略部署", ownerType: "master", ownerId: "master.waver", activation: "phase", windows: ["outpost"], cost: 1, abilityCost: 1, drawCount: 2, text: "你能支付1魔力来抽2张牌。", supportLevel: "FULL", handlerId: "core.pay-mana-draw" });
  const engine = new StandardMatchEngine({ cards: { ...cards, "card.draw-a": { id: "card.draw-a", name: "抽甲", cost: 0, basePower: 1, typeLabel: "力量" }, "card.draw-b": { id: "card.draw-b", name: "抽乙", cost: 0, basePower: 1, typeLabel: "魔术" } }, situations, events, skills, playerDecks: { p1: [] } });
  const state = createGameState({ gameInstanceId: "waver-draw", players: [{ id: "p1", name: "一" }], seed: 113 });
  state.status = "playing"; state.phase = "outpost"; state.step = "player-window"; state.activePlayerId = "p1"; state.round = 1; state.players.p1.masterId = "master.waver"; state.players.p1.mana = 3;
  state.cards.a = { instanceId: "a", definitionId: "card.draw-a", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "deck", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.cards.b = { instanceId: "b", definitionId: "card.draw-b", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "deck", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.deck = ["a", "b"];
  let result = engine.execute(state, makeCommand(state, "waver-draw", CommandType.UseSkill, "p1", { skillId }));
  assert.equal(result.state.players.p1.mana, 2);
  assert.deepEqual(result.state.players.p1.hand, ["a", "b"]);
  assert.equal(result.state.players.p1.usage[skillId].used, true);

  const wrongPhase = createGameState({ gameInstanceId: "waver-wrong-phase", players: [{ id: "p1", name: "一" }], seed: 113 });
  wrongPhase.status = "playing"; wrongPhase.phase = "action"; wrongPhase.step = "move-decision"; wrongPhase.activePlayerId = "p1"; wrongPhase.players.p1.masterId = "master.waver"; wrongPhase.players.p1.mana = 3;
  assert.throws(() => engine.execute(wrongPhase, makeCommand(wrongPhase, "waver-wrong", CommandType.UseSkill, "p1", { skillId })), /SKILL_USE_FORBIDDEN/);
  wrongPhase.phase = "outpost"; wrongPhase.step = "player-window"; wrongPhase.players.p1.mana = 0;
  assert.throws(() => engine.execute(wrongPhase, makeCommand(wrongPhase, "waver-no-mana", CommandType.UseSkill, "p1", { skillId })), /INSUFFICIENT_MANA/);
  assert.equal(wrongPhase.players.p1.mana, 0);
});

test("标准开局读取御主初始魔力，未知御主保持4点且不影响3X开局修正", () => {
  const engine = new StandardMatchEngine({
    cards,
    situations,
    events,
    playerDecks: { p1: [], p2: [], p3: [] },
    masterInitialMana: { "master.shirou-emiya": 2, "master.iliya": 6 },
  });
  const state = createGameState({ gameInstanceId: "master-initial-mana", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 127 });
  state.players.p1.masterId = "master.shirou-emiya";
  state.players.p2.masterId = "master.iliya";
  state.players.p3.masterId = "master.unknown";
  let result = engine.execute(state, makeCommand(state, "initial-mana-start", CommandType.StartStandardGame, "host"));
  assert.equal(result.state.players.p1.mana, 2 + 2);
  assert.equal(result.state.players.p2.mana, 6 + 2);
  assert.equal(result.state.players.p3.mana, 4 + 2);
});

test("标准内容包按已选从者 ID 读取牌库，并兼容按玩家 ID 提供的测试牌库", () => {
  const engine = new StandardMatchEngine({
    cards,
    situations,
    events,
    playerDecks: { "servant.s1": ["card.low-1", "card.low-2", "card.high-1"] },
  });
  const state = createGameState({ gameInstanceId: "servant-deck-key", players: [{ id: "p1", name: "一" }], seed: 131 });
  state.players.p1.masterId = "master.test";
  state.players.p1.servantId = "servant.s1";
  const result = engine.execute(state, makeCommand(state, "servant-deck-start", CommandType.StartStandardGame, "host"));
  const player = result.state.players.p1;
  assert.equal(player.hand.length + player.deck.length, 3);
  assert.deepEqual(new Set([...player.hand, ...player.deck]), new Set(["p1:card:1", "p1:card:2", "p1:card:3"]));
  assert.equal(Object.values(result.state.cards).filter((card) => card.ownerPlayerId === "p1").length, 3);
});

test("提亚马特人类恶在战斗结算后令战胜她的每名玩家额外获得1点战果", () => {
  const skillId = "master.tiamat.skill.s1a";
  const skills = new SkillRegistry();
  skills.register({ id: skillId, name: "人类恶", ownerType: "master", ownerId: "master.tiamat", activation: "passive", windows: [], cost: 0, text: "战胜你的玩家获得1点战果。", supportLevel: "FULL", handlerId: "core.tiamat-human-evil" });
  const engine = new StandardMatchEngine({
    cards: {
      "card.tiamat-low": { id: "card.tiamat-low", name: "低威力", cost: 0, basePower: 1, typeLabel: "力量" },
      "card.winner-high": { id: "card.winner-high", name: "高威力", cost: 0, basePower: 4, typeLabel: "力量" },
    },
    situations,
    events: [{ id: "event.human-evil", victoryPoints: 1 }],
    skills,
    playerDecks: { p1: [], p2: [] },
  });
  const state = createGameState({ gameInstanceId: "human-evil", players: [{ id: "p1", name: "提亚马特" }, { id: "p2", name: "胜者" }], seed: 3 });
  state.status = "playing";
  state.phase = "combat";
  state.step = "settlement";
  state.round = 1;
  state.activePlayerId = "p1";
  state.players.p1.masterId = "master.tiamat";
  state.players.p2.masterId = "master.other";
  state.players.p1.locationId = "mountain";
  state.players.p2.locationId = "mountain";
  state.board.locations.mountain = ["p1", "p2"];
  state.board.currentEvents.mountain = ["event.human-evil"];
  state.board.eventVisibility["event.human-evil"] = "up";
  state.cards["p1:attack"] = { instanceId: "p1:attack", definitionId: "card.tiamat-low", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards["p2:attack"] = { instanceId: "p2:attack", definitionId: "card.winner-high", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = ["p1:attack"];
  state.players.p2.attack = ["p2:attack"];
  const result = engine.execute(state, makeCommand(state, "human-evil-combat", CommandType.ResolveCombat, "p1", { locationId: "mountain" }));
  assert.deepEqual(result.events.find((event) => event.type === "combat.resolved")?.payload && (result.events.find((event) => event.type === "combat.resolved")!.payload as { winnerIds: string[] }).winnerIds, ["p2"]);
  assert.equal(result.state.players.p2.victoryPoints, 4);
  assert.equal(result.state.players.p1.defeated, true);
});

test("十二试炼在战败结算后获得战果、削减胜者并强化其余牌", () => {
  const labors = ["servant.herc.skill.sc-herc-1", "servant.herc.skill.sc-herc-2", "servant.herc.skill.sc-herc-3"];
  const skills = new SkillRegistry();
  for (const id of labors) {
    skills.register({
      id,
      name: "十二试炼",
      ownerType: "servant",
      ownerId: "servant.herc",
      activation: "play",
      windows: [],
      cost: 1,
      requirement: 1,
      basePower: 5,
      typeLabel: "力量/宝具",
      text: "【真名解放】若你战败，获得3点战果并令此战斗的所有胜者分别失去3点战果，然后将此牌移除游戏并令你的其他【十二试炼】获得+3威力直至游戏结束。",
      supportLevel: "FULL",
      handlerId: "core.twelve-labors",
      passiveEventTypes: ["combat.resolved"],
    });
  }
  const engine = new StandardMatchEngine({
    cards: { "card.winner": { id: "card.winner", name: "胜者攻击", cost: 0, basePower: 6, typeLabel: "力量" } },
    situations,
    events: [{ id: "event.labors", victoryPoints: 1 }],
    skills,
    playerDecks: { p1: [], p2: [] },
  });
  const state = createGameState({ gameInstanceId: "twelve-labors", players: [{ id: "p1", name: "赫拉克勒斯" }, { id: "p2", name: "胜者" }], seed: 23 });
  state.status = "playing"; state.phase = "combat"; state.step = "settlement"; state.round = 1; state.activePlayerId = "p1";
  state.players.p1.servantId = "servant.herc"; state.players.p2.servantId = "servant.other";
  state.players.p1.locationId = "mountain"; state.players.p2.locationId = "mountain"; state.board.locations.mountain = ["p1", "p2"];
  state.board.currentEvents.mountain = ["event.labors"]; state.board.eventVisibility["event.labors"] = "up";
  state.cards.labors = { instanceId: "labors", definitionId: labors[0], ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [], paidCost: 1, playedRound: 1 };
  state.cards.otherLabors = { instanceId: "otherLabors", definitionId: labors[1], ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "servant-skills", face: "up", active: false, residual: false, temporary: false, modifiers: [] };
  state.cards.winner = { instanceId: "winner", definitionId: "card.winner", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = ["labors"]; state.players.p1.servantSkills = ["otherLabors"]; state.players.p2.attack = ["winner"];

  const result = engine.execute(state, makeCommand(state, "resolve-labors", CommandType.ResolveCombat, "p1", { locationId: "mountain" }));
  assert.equal(result.state.players.p1.defeated, true);
  assert.equal(result.state.players.p1.victoryPoints, 3);
  assert.equal(result.state.players.p2.victoryPoints, 0);
  assert.equal(result.state.cards.labors.zone, "removed");
  assert.equal(result.state.cards.otherLabors.powerModifiers?.[0].value, 3);
});

test("卫宫炽天覆七重圆环将同战场对手的迅捷攻击威力设为0", () => {
  const skillId = "servant.emiya.skill.sc-emiya-1";
  const skills = new SkillRegistry();
  skills.register({ id: skillId, name: "炽天覆七重圆环", ownerType: "servant", ownerId: "servant.emiya", activation: "phase", windows: ["combat"], cost: 2, basePower: 4, typeLabel: "特殊", text: "战斗阶段：将同一战场所有对手的迅捷属性威力变为0。", supportLevel: "FULL", handlerId: "core.zero-opponent-attribute", combatPowerZeroAttribute: "迅捷" });
  const engine = new StandardMatchEngine({
    cards: {
      "card.agility": { id: "card.agility", name: "迅捷攻击", cost: 0, basePower: 5, typeLabel: "迅捷" },
      "card.power": { id: "card.power", name: "力量攻击", cost: 0, basePower: 4, typeLabel: "力量" },
    },
    situations,
    events,
    skills,
    playerDecks: { p1: [], p2: [] },
  });
  const state = createGameState({ gameInstanceId: "emiya-rho-aias", players: [{ id: "p1", name: "卫宫" }, { id: "p2", name: "对手" }], seed: 29 });
  state.status = "playing"; state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "p1";
  state.players.p1.servantId = "servant.emiya"; state.players.p2.servantId = "servant.other";
  state.players.p1.locationId = "mountain"; state.players.p2.locationId = "mountain"; state.board.locations.mountain = ["p1", "p2"];
  state.cards.skill = { instanceId: "skill", definitionId: skillId, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards.agility = { instanceId: "agility", definitionId: "card.agility", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards.power = { instanceId: "power", definitionId: "card.power", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = ["skill"]; state.players.p2.attack = ["agility", "power"];
  const result = engine.execute(state, makeCommand(state, "rho-aias", CommandType.UseSkill, "p1", { skillId }));
  assert.equal(result.state.cards.agility.powerModifiers?.[0].value, 0);
  assert.equal(result.state.cards.power.powerModifiers, undefined);
});

test("卫宫归零属性技能只在同战场存在对应属性目标时开放", () => {
  const skillId = "servant.emiya.skill.sc-emiya-1";
  const skills = new SkillRegistry();
  skills.register({ id: skillId, name: "炽天覆七重圆环", ownerType: "servant", ownerId: "servant.emiya", activation: "phase", windows: ["combat"], cost: 2, basePower: 4, typeLabel: "特殊", text: "", supportLevel: "FULL", handlerId: "core.zero-opponent-attribute", combatPowerZeroAttribute: "迅捷" });
  const cardDefinitions = { "card.power": { id: "card.power", name: "力量攻击", cost: 0, basePower: 4, typeLabel: "力量" } };
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations,
    events,
    skills,
    playerDecks: { p1: [], p2: [] },
  });
  const state = createGameState({ gameInstanceId: "emiya-no-target", players: [{ id: "p1", name: "卫宫" }, { id: "p2", name: "对手" }], seed: 31 });
  state.status = "playing"; state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "p1";
  state.players.p1.servantId = "servant.emiya"; state.players.p2.servantId = "servant.other";
  state.players.p1.locationId = "mountain"; state.players.p2.locationId = "mountain"; state.board.locations.mountain = ["p1", "p2"];
  state.cards.skill = { instanceId: "skill", definitionId: skillId, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards.power = { instanceId: "power", definitionId: "card.power", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = ["skill"]; state.players.p2.attack = ["power"];
  assert.deepEqual(skills.getLegalActions(state, "p1", cardDefinitions).map((action) => action.payload?.skillId), []);
});

test("明确单卡出牌的技能牌替代常规两张出牌并拒绝混打", () => {
  const single = "servant.muramasa.skill.sc-muramasa-1";
  const definitions = {
    [single]: { id: single, name: "无元剑制", cost: 0, basePower: 5, typeLabel: "特殊", isSkill: true, skillOwnerType: "servant" as const, singleCardPlay: true },
    "card.other": { id: "card.other", name: "普通攻击", cost: 0, basePower: 2, typeLabel: "力量" },
  };
  const state = createGameState({ gameInstanceId: "single-card-play", players: [{ id: "p1", name: "一" }], seed: 37 });
  state.status = "playing"; state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "p1";
  state.players.p1.servantId = "servant.muramasa"; state.players.p1.mana = 8;
  state.cards.single = { instanceId: "single", definitionId: single, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.cards.other = { instanceId: "other", definitionId: "card.other", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.hand = ["single", "other"];
  const played = commitStandardAttack(state, "p1", ["single"], [], definitions);
  assert.deepEqual(played.committed, ["single"]);

  const mixed = createGameState({ gameInstanceId: "single-card-mixed", players: [{ id: "p1", name: "一" }], seed: 38 });
  mixed.status = "playing"; mixed.phase = "action"; mixed.step = "play-batch-draft"; mixed.activePlayerId = "p1"; mixed.players.p1.servantId = "servant.muramasa"; mixed.players.p1.mana = 8;
  mixed.cards.single = { instanceId: "single", definitionId: single, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  mixed.cards.other = { instanceId: "other", definitionId: "card.other", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  mixed.players.p1.hand = ["single", "other"];
  assert.throws(() => commitStandardAttack(mixed, "p1", ["single", "other"], [], definitions), /EXACTLY_ONE_CARD_REQUIRED/);
});

test("阿拉什准备阶段能力按战果领先条件和高潮回合奖励结算", () => {
  const skillId = "servant.arash.skill.sc-arash-1";
  const skills = new SkillRegistry();
  skills.register({ id: skillId, name: "阿拉什准备技", ownerType: "servant", ownerId: "servant.arash", activation: "optional-trigger", windows: ["preparation"], cost: 0, text: "", supportLevel: "FULL", handlerId: "core.arash-preparation", requiresActiveCard: false, revealsTrueNameOnSkillUse: true });
  const engine = new StandardMatchEngine({ cards: {}, situations, events, skills, playerDecks: { p1: [], p2: [] } });
  const state = createGameState({ gameInstanceId: "arash-preparation", players: [{ id: "p1", name: "阿拉什" }, { id: "p2", name: "对手" }], seed: 41 });
  state.status = "playing"; state.phase = "preparation"; state.step = "player-window"; state.activePlayerId = "p1"; state.round = 1;
  state.players.p1.servantId = "servant.arash"; state.players.p1.victoryPoints = 2; state.players.p2.victoryPoints = 2;
  let result = engine.execute(state, makeCommand(state, "arash-use", CommandType.UseSkill, "p1", { skillId }));
  assert.equal(result.state.players.p1.victoryPoints, 3);
  result.state.round = 9;
  result.state.players.p1.usage = {};
  result.state.players.p1.victoryPoints = 3; result.state.players.p2.victoryPoints = 3;
  result = engine.execute(result.state, makeCommand(result.state, "arash-climax", CommandType.UseSkill, "p1", { skillId }));
  assert.equal(result.state.players.p1.victoryPoints, 6);
  result.state.players.p1.usage = {};
  result.state.players.p2.victoryPoints = 7;
  assert.throws(() => engine.execute(result.state, makeCommand(result.state, "arash-blocked", CommandType.UseSkill, "p1", { skillId })), /ARASH_SCORE_REQUIREMENT_NOT_MET/);
});

test("喀戎战斗阶段支付自身费用后将技能牌加入攻击", () => {
  const skillId = "servant.chiron.skill.sc-chiron-3";
  const definitions = { [skillId]: { id: skillId, name: "天蝎一射", cost: 3, basePower: 3, typeLabel: "迅捷", isSkill: true, skillOwnerType: "servant" as const } };
  const skills = new SkillRegistry();
  skills.register({ id: skillId, name: "自费加入", ownerType: "servant", ownerId: "servant.chiron", activation: "optional-trigger", windows: ["combat"], cost: 3, text: "", supportLevel: "FULL", handlerId: "core.self-play-card", requiresActiveCard: false });
  const engine = new StandardMatchEngine({ cards: definitions, situations, events, skills, playerDecks: { p1: [] } });
  const state = createGameState({ gameInstanceId: "chiron-self-play", players: [{ id: "p1", name: "喀戎" }], seed: 43 });
  state.status = "playing"; state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "p1"; state.round = 1;
  state.players.p1.servantId = "servant.chiron"; state.players.p1.mana = 4;
  state.cards.skill = { instanceId: "skill", definitionId: skillId, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "servant-skills", face: "up", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.servantSkills = ["skill"];
  const result = engine.execute(state, makeCommand(state, "chiron-use", CommandType.UseSkill, "p1", { skillId }));
  assert.equal(result.state.players.p1.mana, 1);
  assert.equal(result.state.cards.skill.zone, "attack");
  assert.deepEqual(result.state.players.p1.attack, ["skill"]);
  assert.equal(result.events.filter((event) => event.type === "card.played").length, 1);
  assert.throws(() => engine.execute(result.state, makeCommand(result.state, "chiron-again", CommandType.UseSkill, "p1", { skillId })), /SKILL_USE_FORBIDDEN/);

  const insufficient = createGameState({ gameInstanceId: "chiron-no-mana", players: [{ id: "p1", name: "喀戎" }], seed: 44 });
  insufficient.status = "playing"; insufficient.phase = "combat"; insufficient.step = "player-window"; insufficient.activePlayerId = "p1"; insufficient.players.p1.servantId = "servant.chiron"; insufficient.players.p1.mana = 2;
  insufficient.cards.skill = { instanceId: "skill", definitionId: skillId, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "servant-skills", face: "up", active: false, residual: false, temporary: false, modifiers: [] };
  insufficient.players.p1.servantSkills = ["skill"];
  assert.throws(() => engine.execute(insufficient, makeCommand(insufficient, "chiron-no-mana-use", CommandType.UseSkill, "p1", { skillId })), /INSUFFICIENT_MANA/);
  assert.equal(insufficient.cards.skill.zone, "servant-skills");
});

test("对魔力的宝具绽放与魔术抗性可以在同一战斗中分别发动且各限一次", () => {
  const skillId = "servant.saber.skill.sc-saber-1";
  const skills = new SkillRegistry();
  skills.register({
    id: skillId,
    name: "对魔力",
    ownerType: "servant",
    ownerId: "servant.saber",
    activation: "optional-trigger",
    windows: ["combat"],
    cost: 3,
    requirement: 3,
    basePower: 3,
    typeLabel: "特殊",
    text: "宝具绽放与魔术抗性",
    supportLevel: "FULL",
    handlerId: "core.saber-magic-resistance",
    requiresActiveCard: true,
    abilities: [
      { id: "noble-bloom", name: "宝具绽放", activation: "optional-trigger", windows: ["combat"], limit: "once-per-round", requiresActiveCard: false },
      { id: "magic-resistance", name: "魔术抗性", activation: "phase", windows: ["combat"], limit: "once-per-round", requiresActiveCard: true },
    ],
  });
  const engine = new StandardMatchEngine({
    cards: {
      "card.noble": { id: "card.noble", name: "宝具", cost: 4, basePower: 5, typeLabel: "宝具" },
      "card.magic": { id: "card.magic", name: "魔术攻击", cost: 1, basePower: 5, typeLabel: "魔术" },
    },
    situations,
    events,
    skills,
    playerDecks: { p1: [], p2: [] },
  });
  const state = createGameState({ gameInstanceId: "saber-multi-ability", players: [{ id: "p1", name: "Saber" }, { id: "p2", name: "对手" }], seed: 17 });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "p1";
  state.round = 1;
  state.players.p1.servantId = "servant.saber";
  state.players.p2.servantId = "servant.other";
  state.players.p1.locationId = "mountain";
  state.players.p2.locationId = "mountain";
  state.board.locations.mountain = ["p1", "p2"];
  state.cards["p1:saber"] = { instanceId: "p1:saber", definitionId: skillId, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards["p1:noble"] = { instanceId: "p1:noble", definitionId: "card.noble", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [], paidCost: 4, playedRound: 1 };
  state.cards["p2:magic"] = { instanceId: "p2:magic", definitionId: "card.magic", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = ["p1:saber", "p1:noble"];
  state.players.p2.attack = ["p2:magic"];

  let result = engine.execute(state, makeCommand(state, "saber-bloom", CommandType.UseSkill, "p1", { skillId, data: { abilityId: "noble-bloom" } }));
  assert.equal(result.state.players.p1.victoryPoints, 2);
  assert.equal(result.state.players.p1.usage[`${skillId}:noble-bloom`].used, true);
  result = engine.execute(result.state, makeCommand(result.state, "saber-resistance", CommandType.UseSkill, "p1", { skillId, data: { abilityId: "magic-resistance" } }));
  assert.equal(result.state.cards["p2:magic"].powerModifiers?.find((modifier) => modifier.id === `${skillId}:magic-resistance:p2:magic`)?.value, 0);
  assert.equal(result.state.players.p1.usage[`${skillId}:magic-resistance`].used, true);
  assert.throws(() => engine.execute(result.state, makeCommand(result.state, "saber-bloom-again", CommandType.UseSkill, "p1", { skillId, data: { abilityId: "noble-bloom" } })), /SKILL_USE_FORBIDDEN/);
});

test("对魔力宝具绽放不统计上一回合残留的宝具", () => {
  const skillId = "servant.saber.skill.sc-saber-1";
  const skills = new SkillRegistry();
  skills.register({
    id: skillId,
    name: "对魔力",
    ownerType: "servant",
    ownerId: "servant.saber",
    activation: "optional-trigger",
    windows: ["combat"],
    cost: 0,
    text: "",
    supportLevel: "FULL",
    handlerId: "core.saber-magic-resistance",
    abilities: [{ id: "noble-bloom", name: "宝具绽放", activation: "optional-trigger", windows: ["combat"], limit: "once-per-round", requiresActiveCard: false }],
  });
  const engine = new StandardMatchEngine({
    cards: { "card.noble": { id: "card.noble", name: "宝具", cost: 4, basePower: 5, typeLabel: "宝具" } },
    situations,
    events,
    skills,
    playerDecks: { p1: [] },
  });
  const state = createGameState({ gameInstanceId: "saber-round-mark", players: [{ id: "p1", name: "Saber" }], seed: 19 });
  state.status = "playing"; state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "p1"; state.round = 2;
  state.players.p1.servantId = "servant.saber"; state.players.p1.locationId = "mountain"; state.board.locations.mountain = ["p1"];
  state.cards.old = { instanceId: "old", definitionId: "card.noble", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: true, temporary: false, modifiers: [], paidCost: 4, playedRound: 1 };
  state.players.p1.attack = ["old"];
  assert.throws(() => engine.execute(state, makeCommand(state, "old-bloom", CommandType.UseSkill, "p1", { skillId, data: { abilityId: "noble-bloom" } })), /NOBLE_BLOOM_NO_NOBLE_PHANTASM/);
});

test("标准对局开局选定的事件组会贯穿后续回合", () => {
  const groupA = Array.from({ length: 20 }, (_, index) => ({ id: `event.a.${index + 1}`, victoryPoints: 1 }));
  const groupB = Array.from({ length: 20 }, (_, index) => ({ id: `event.b.${index + 1}`, victoryPoints: 1 }));
  const engine = new StandardMatchEngine({
    cards,
    situations,
    events: [...groupA, ...groupB],
    eventGroups: [
      { id: "group-a", name: "A", eventIds: groupA.map((event) => event.id) },
      { id: "group-b", name: "B", eventIds: groupB.map((event) => event.id) },
    ],
    playerDecks: { p1: [], p2: [] },
  });
  const state = createGameState({ gameInstanceId: "event-group-persistence", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 5 });
  let result = engine.execute(state, makeCommand(state, "start-group", CommandType.StartStandardGame, "host"));
  const selectedIds = new Set((result.state.modeState.eventPoolEventIds as string[]));
  assert.equal(selectedIds.size, 20);
  result.state.phase = "combat"; result.state.step = "settlement"; result.state.modeState = { ...result.state.modeState, resolvedCombats: ["mountain", "city"] };
  result.state.board.situationDeck = ["situation.regular-2"];
  result = engine.execute(result.state, makeCommand(result.state, "end-group-round", CommandType.EndRound, "host"));
  const nextEvents = [...result.state.board.currentEvents.mountain, ...result.state.board.currentEvents.city];
  assert.ok(nextEvents.every((eventId) => selectedIds.has(eventId)));
});

test("慎二进入深山町时无论部署还是普通移动都会获得1点魔力", () => {
  const skillId = "master.shinji.skill.s1";
  const skills = new SkillRegistry();
  skills.register({ id: skillId, name: "吸魔命令", ownerType: "master", ownerId: "master.shinji", activation: "passive", windows: [], cost: 0, text: "进入深山町时，获得1点魔力。", supportLevel: "FULL", handlerId: "core.enter-location-gain-mana", locationId: "mountain", manaGain: 1 });
  const engine = new StandardMatchEngine({ cards, situations, events, skills, playerDecks: { p1: [] } });

  const deploy = createGameState({ gameInstanceId: "shinji-deploy-mountain", players: [{ id: "p1", name: "一" }], seed: 131 });
  deploy.status = "playing"; deploy.phase = "outpost"; deploy.step = "player-window"; deploy.activePlayerId = "p1"; deploy.players.p1.masterId = "master.shinji"; deploy.players.p1.mana = 0;
  let result = engine.execute(deploy, makeCommand(deploy, "shinji-deploy", CommandType.DeployPlayer, "p1", { locationId: "mountain" }));
  assert.equal(result.state.players.p1.mana, 1);

  const move = createGameState({ gameInstanceId: "shinji-move-mountain", players: [{ id: "p1", name: "一" }], seed: 131 });
  move.status = "playing"; move.phase = "outpost"; move.step = "player-window"; move.activePlayerId = "p1"; move.players.p1.masterId = "master.shinji"; move.players.p1.mana = 3;
  result = engine.execute(move, makeCommand(move, "shinji-deploy-workshop", CommandType.DeployPlayer, "p1", { locationId: "workshop" }));
  result.state.phase = "action"; result.state.step = "move-decision"; result.state.activePlayerId = "p1"; result.state.players.p1.mana = 3;
  result = engine.execute(result.state, makeCommand(result.state, "shinji-move", CommandType.MovePlayer, "p1", { locationId: "mountain" }));
  assert.equal(result.state.players.p1.mana, 2);

  const other = createGameState({ gameInstanceId: "other-deploy-mountain", players: [{ id: "p1", name: "一" }], seed: 131 });
  other.status = "playing"; other.phase = "outpost"; other.step = "player-window"; other.activePlayerId = "p1"; other.players.p1.masterId = "master.other"; other.players.p1.mana = 0;
  result = engine.execute(other, makeCommand(other, "other-deploy", CommandType.DeployPlayer, "p1", { locationId: "mountain" }));
  assert.equal(result.state.players.p1.mana, 0);
});

test("真名解放词条只在技能牌成功明置打出后生效并生成逐卡事件", () => {
  const skills = new SkillRegistry();
  skills.register({ id: "servant.s.reveal", name: "真名牌", ownerType: "servant", ownerId: "s", activation: "play", windows: ["action"], cost: 2, requirement: 0, basePower: 3, typeLabel: "特殊", text: "【真名解放】", supportLevel: "PARTIAL", revealsTrueNameOnPlay: true });
  const engine = new StandardMatchEngine({ cards, situations, events, skills, playerDecks: { p1: ["card.low-1"] } });
  const initial = createGameState({ gameInstanceId: "true-name-play", players: [{ id: "p1", name: "一" }], seed: 31 });
  initial.players.p1.servantId = "s";
  let state = engine.execute(initial, makeCommand(initial, "start-reveal", CommandType.StartStandardGame, "host")).state;
  state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "p1"; state.players.p1.mana = 2;
  const skill = state.players.p1.servantSkills[0];
  const normal = state.players.p1.hand[0];
  const result = engine.execute(state, makeCommand(state, "play-reveal", CommandType.CommitAttack, "p1", { faceUpInstanceIds: [skill, normal], faceDownInstanceIds: [] }));
  assert.equal(result.state.players.p1.trueNameRevealed, true);
  const played = result.events.filter((event) => event.type === "card.played").map((event) => event.payload);
  assert.deepEqual(played, [
    { playerId: "p1", instanceId: skill, definitionId: "servant.s.reveal", face: "up", paidMana: 2, attributes: ["特殊"] },
    { playerId: "p1", instanceId: normal, definitionId: "card.low-1", face: "up", paidMana: 0, attributes: ["魔术"] },
  ]);
  assert.equal(result.events.filter((event) => event.type === "servant.true-name-revealed").length, 1);
});

test("暗置牌逐卡事件不泄露定义，非法暗置技能及失败事务不改变真名状态", () => {
  const definitions = {
    reveal: { id: "reveal", name: "真名牌", cost: 3, basePower: 3, typeLabel: "特殊", isSkill: true, skillOwnerType: "servant" as const, requiresEightMana: false, revealsTrueNameOnPlay: true },
    normal: { id: "normal", name: "普通牌", cost: 0, basePower: 1, typeLabel: "力量" },
    hidden: { id: "hidden", name: "暗置牌", cost: 0, basePower: 1, typeLabel: "迅捷" },
  };
  const engine = new StandardMatchEngine({ cards: definitions, situations, events, playerDecks: { p1: ["reveal", "normal", "hidden"] } });
  const initial = createGameState({ gameInstanceId: "true-name-hidden", players: [{ id: "p1", name: "一" }], seed: 37 });
  let state = engine.execute(initial, makeCommand(initial, "start-hidden", CommandType.StartStandardGame, "host")).state;
  state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "p1"; state.players.p1.mana = 0;
  const reveal = state.players.p1.hand.find((id) => state.cards[id].definitionId === "reveal")!;
  const normal = state.players.p1.hand.find((id) => state.cards[id].definitionId === "normal")!;
  const hiddenCard = state.players.p1.hand.find((id) => state.cards[id].definitionId === "hidden")!;
  assert.throws(() => engine.execute(state, makeCommand(state, "play-illegal-hidden-skill", CommandType.CommitAttack, "p1", { faceUpInstanceIds: [normal], faceDownInstanceIds: [reveal] })), /SKILL_CANNOT_BE_FACE_DOWN/);
  assert.equal(state.players.p1.trueNameRevealed, false);
  const hidden = engine.execute(state, makeCommand(state, "play-hidden", CommandType.CommitAttack, "p1", { faceUpInstanceIds: [normal], faceDownInstanceIds: [hiddenCard] }));
  assert.equal(hidden.state.players.p1.trueNameRevealed, false);
  const hiddenEvent = hidden.events.find((event) => event.type === "card.played" && (event.payload as { instanceId: string }).instanceId === hiddenCard)!;
  assert.deepEqual(hiddenEvent.payload, { playerId: "p1", instanceId: hiddenCard, definitionId: null, face: "down", paidMana: 0, attributes: [] });

  const failedInitial = createGameState({ gameInstanceId: "true-name-failed", players: [{ id: "p1", name: "一" }], seed: 41 });
  let failed = engine.execute(failedInitial, makeCommand(failedInitial, "start-failed", CommandType.StartStandardGame, "host")).state;
  failed.phase = "action"; failed.step = "play-batch-draft"; failed.activePlayerId = "p1"; failed.players.p1.mana = 2;
  const failedReveal = failed.players.p1.hand.find((id) => failed.cards[id].definitionId === "reveal")!;
  const failedNormal = failed.players.p1.hand.find((id) => failed.cards[id].definitionId === "normal")!;
  assert.throws(() => engine.execute(failed, makeCommand(failed, "play-failed", CommandType.CommitAttack, "p1", { faceUpInstanceIds: [failedReveal, failedNormal], faceDownInstanceIds: [] })), /INSUFFICIENT_MANA/);
  assert.equal(failed.players.p1.trueNameRevealed, false);
  assert.equal(failed.cards[failedReveal].zone, "hand");
});

test("标准引擎决策完成后恢复 continuation 效果队列", () => {
  const effects = new EffectRuntime();
  effects.register("test.decision.continue", ({ state, player, payload }) => {
    const decision = (payload as { decision?: { selections: string[] } }).decision;
    if (decision?.selections.includes("mana")) player.mana += 2;
    state.modeState = { ...state.modeState, decisionResumed: true };
  });
  const state = createGameState({ gameInstanceId: "decision-standard", players: [{ id: "p1", name: "一" }], seed: 7 });
  state.status = "playing";
  state.players.p1.mana = 1;
  state.pendingDecision = { decisionId: "d1", ownerPlayerId: "p1", chooserPlayerIds: ["p1"], kind: "choose", options: [{ id: "mana", label: "获得魔力" }], min: 1, max: 1, allowCancel: true, continuationEffectId: "effect.continue", fallbackEffectId: "effect.fallback", submissions: {} };
  state.effectQueue.push({ effectId: "effect.continue", handlerId: "test.decision.continue", sourceId: "test", controllerPlayerId: "p1", payload: {}, createdAtRevision: 0 });
  const engine = new StandardMatchEngine({ cards, situations, events, effectRuntime: effects, playerDecks: { p1: [] } });
  const result = engine.execute(state, makeCommand(state, "resolve-d1", CommandType.ResolveDecision, "p1", { decisionId: "d1", selections: ["mana"] }));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.players.p1.mana, 3);
  assert.equal(result.state.modeState.decisionResumed, true);
});

test("阶段能力首次解放真名时生成权威事件且不会重复生成", () => {
  const skills = new SkillRegistry();
  skills.register({ id: "servant.s.phase-reveal", name: "阶段真名", ownerType: "servant", ownerId: "s", activation: "phase", windows: ["action"], cost: 0, text: "【真名解放】", supportLevel: "FULL", revealsTrueNameOnSkillUse: true }, () => undefined);
  skills.register({ id: "servant.s.phase-reveal-2", name: "另一阶段真名", ownerType: "servant", ownerId: "s", activation: "phase", windows: ["action"], cost: 0, text: "【真名解放】", supportLevel: "FULL", revealsTrueNameOnSkillUse: true }, () => undefined);
  const state = createGameState({ gameInstanceId: "phase-true-name-event", players: [{ id: "p1", name: "一" }], seed: 17 });
  state.status = "playing"; state.phase = "action"; state.activePlayerId = "p1"; state.players.p1.servantId = "s";
  const engine = new StandardMatchEngine({ cards, situations, events, skills, playerDecks: { p1: [] } });
  const first = engine.execute(state, makeCommand(state, "phase-reveal-1", CommandType.UseSkill, "p1", { skillId: "servant.s.phase-reveal" }));
  assert.equal(first.state.players.p1.trueNameRevealed, true);
  assert.equal(first.events.filter((event) => event.type === "servant.true-name-revealed").length, 1);
  const second = engine.execute(first.state, makeCommand(first.state, "phase-reveal-2", CommandType.UseSkill, "p1", { skillId: "servant.s.phase-reveal-2" }));
  assert.equal(second.events.filter((event) => event.type === "servant.true-name-revealed").length, 0);
});

test("决策和效果处理器注册拒绝重复或无效输入", () => {
  const state = createGameState({ gameInstanceId: "decision-validation", players: [{ id: "p1", name: "一" }], seed: 63 });
  const manager = new DecisionManager();
  assert.throws(() => manager.open(state, { decisionId: "d", ownerPlayerId: "p1", chooserPlayerIds: ["p1"], kind: "choose", options: [{ id: "x", label: "x" }, { id: "x", label: "重复" }], min: 1, max: 1, allowCancel: false, submissions: {} }), /DECISION_OPTION_DUPLICATE/);
  const effects = new EffectRuntime();
  assert.throws(() => effects.register("", () => undefined), /EFFECT_HANDLER_ID_REQUIRED/);
  assert.throws(() => effects.register("bad", undefined as never), /EFFECT_HANDLER_INVALID/);
});

test("多人决策逐人提交，最后一人提交后才关闭窗口", async () => {
  const state = createGameState({ gameInstanceId: "decision-multi", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 1 });
  const manager = new DecisionManager();
  manager.open(state, { decisionId: "multi", ownerPlayerId: "p1", chooserPlayerIds: ["p1", "p2"], kind: "vote", options: [{ id: "yes", label: "同意" }, { id: "no", label: "拒绝" }], min: 1, max: 1, allowCancel: true, submissions: {} });
  const first = manager.resolve(state, { decisionId: "multi", actorId: "p1", selections: ["yes"] });
  assert.deepEqual(first.submissions, { p1: ["yes"] });
  assert.ok(state.pendingDecision);
  assert.throws(() => manager.resolve(state, { decisionId: "multi", actorId: "p1", selections: ["no"] }), /DECISION_ALREADY_SUBMITTED/);
  const second = manager.resolve(state, { decisionId: "multi", actorId: "p2", selections: ["no"] });
  assert.deepEqual(second.submissions, { p1: ["yes"], p2: ["no"] });
  assert.equal(state.pendingDecision, null);
});

test("决策恢复点拒绝越权预提交和非法选项", () => {
  const state = createGameState({ gameInstanceId: "decision-submissions", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 1 });
  const manager = new DecisionManager();
  assert.throws(() => manager.open(state, { decisionId: "bad-player", ownerPlayerId: "p1", chooserPlayerIds: ["p1", "p2"], kind: "vote", options: [{ id: "yes", label: "同意" }], min: 1, max: 1, allowCancel: true, submissions: { p3: ["yes"] } }), /DECISION_SUBMISSIONS_INVALID/);
  assert.throws(() => manager.open(state, { decisionId: "bad-option", ownerPlayerId: "p1", chooserPlayerIds: ["p1", "p2"], kind: "vote", options: [{ id: "yes", label: "同意" }], min: 1, max: 1, allowCancel: true, submissions: { p1: ["no"] } }), /DECISION_SUBMISSIONS_INVALID/);
});

test("标准引擎取消可取消决策后恢复 fallback 效果", () => {
  const effects = new EffectRuntime();
  effects.register("test.decision.fallback", ({ state, player }) => {
    player.victoryPoints += 1;
    state.modeState = { ...state.modeState, cancelled: true };
  });
  const state = createGameState({ gameInstanceId: "decision-cancel", players: [{ id: "p1", name: "一" }], seed: 7 });
  state.status = "playing";
  state.pendingDecision = { decisionId: "d2", ownerPlayerId: "p1", chooserPlayerIds: ["p1"], kind: "choose", options: [{ id: "x", label: "选项" }], min: 1, max: 1, allowCancel: true, fallbackEffectId: "effect.fallback", submissions: {} };
  state.effectQueue.push({ effectId: "effect.fallback", handlerId: "test.decision.fallback", sourceId: "test", controllerPlayerId: "p1", payload: {}, createdAtRevision: 0 });
  const engine = new StandardMatchEngine({ cards, situations, events, effectRuntime: effects, playerDecks: { p1: [] } });
  const result = engine.execute(state, makeCommand(state, "cancel-d2", CommandType.CancelDecision, "p1", { decisionId: "d2" }));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.players.p1.victoryPoints, 1);
  assert.equal(result.state.modeState.cancelled, true);
});

test("效果运行时提供处理器查询并阻止无限效果循环", () => {
  const effects = new EffectRuntime();
  effects.register("loop", ({ state, player }) => {
    state.effectQueue.push({ effectId: `loop-${state.effectQueue.length}`, handlerId: "loop", sourceId: "loop", controllerPlayerId: player.id, payload: {}, createdAtRevision: state.revision });
  });
  assert.equal(effects.has("loop"), true);
  assert.deepEqual(effects.list(), ["loop"]);
  const state = createGameState({ gameInstanceId: "effect-loop", players: [{ id: "p1", name: "一" }], seed: 61 });
  state.status = "playing";
  state.effectQueue.push({ effectId: "loop-0", handlerId: "loop", sourceId: "loop", controllerPlayerId: "p1", payload: {}, createdAtRevision: 0 });
  assert.throws(() => effects.drain(state, 2), /EFFECT_LOOP_LIMIT/);
  assert.equal(state.effectQueue.length, 1);
});

test("效果队列拒绝重复 effectId 和无效帧", async () => {
  const { EffectQueue } = await import("../src/match-engine/effect-queue.ts");
  const state = createGameState({ gameInstanceId: "effect-queue-validation", players: [{ id: "p1", name: "一" }], seed: 1 });
  const queue = new EffectQueue();
  const frame = { effectId: "effect.one", handlerId: "handler.one", sourceId: "source", controllerPlayerId: "p1", payload: {}, createdAtRevision: 0 };
  queue.enqueue(state, frame);
  assert.throws(() => queue.enqueue(state, frame), /EFFECT_ID_DUPLICATE/);
  assert.throws(() => queue.enqueue(state, { ...frame, effectId: "", handlerId: "" }), /EFFECT_FRAME_INVALID/);
});

test("三藏法师金蝉子：弃置幸运、抽牌后完成三选一", () => {
  const skills = new SkillRegistry();
  skills.register({ id: "servant.sanzang.skill.sc-sanzang-1", name: "神性〔金蝉子〕", ownerType: "servant", ownerId: "servant.sanzang", activation: "optional-trigger", windows: ["action"], cost: 0, requirement: 0, text: "", supportLevel: "FULL" }, sanzangGoldenCicada);
  const state = createGameState({ gameInstanceId: "sanzang-choice", players: [{ id: "p1", name: "一" }], seed: 11 });
  state.status = "playing"; state.round = 1; state.phase = "action"; state.step = "move-decision"; state.activePlayerId = "p1";
  state.players.p1.servantId = "servant.sanzang"; state.players.p1.locationId = "city"; state.board.locations.city = ["p1"];
  state.players.p1.hand = ["p1:lucky", "p1:hand"];
  state.players.p1.deck = ["p1:deck"];
  state.cards["p1:lucky"] = { instanceId: "p1:lucky", definitionId: "card.cardluck", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.cards["p1:hand"] = { instanceId: "p1:hand", definitionId: "card.other", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.cards["p1:deck"] = { instanceId: "p1:deck", definitionId: "card.other", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "deck", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  const engine = new StandardMatchEngine({ cards, situations, events, skills, playerDecks: { p1: [] } });
  let result = engine.execute(state, makeCommand(state, "sanzang-use", CommandType.UseSkill, "p1", { skillId: "servant.sanzang.skill.sc-sanzang-1" }));
  assert.equal(result.state.players.p1.discard.includes("p1:lucky"), true);
  assert.equal(result.state.players.p1.hand.includes("p1:deck"), true);
  assert.equal(result.state.pendingDecision?.options.length, 3);
  result = engine.execute(result.state, makeCommand(result.state, "sanzang-mana", CommandType.ResolveDecision, "p1", { decisionId: result.state.pendingDecision!.decisionId, selections: ["mana"] }));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.players.p1.mana, 3);
});

test("提亚马特生命之海生成真实魔兽，并可在当前行动阶段加入攻击", () => {
  const skills = new SkillRegistry();
  const state = createGameState({ gameInstanceId: "tiamat-beasts", players: [{ id: "p1", name: "提亚马特玩家" }], seed: 19 });
  state.players.p1.masterId = "master.tiamat";
  const engine = new StandardMatchEngine({
    cards,
    situations,
    events,
    skills,
    playerDecks: { p1: ["card.low-1", "card.low-2", "card.high-1", "card.high-2"] },
  });

  let result = engine.execute(state, makeCommand(state, "tiamat-start", CommandType.StartStandardGame, "p1"));
  assert.equal(result.state.players.p1.mana >= 8, true);
  assert.equal(result.state.players.p1.masterSkills.some((id) => result.state.cards[id].definitionId === "master.tiamat.card.life-sea"), true);

  result.state.phase = "action";
  result.state.step = "move-decision";
  result.state.activePlayerId = "p1";
  result = engine.execute(result.state, makeCommand(result.state, "tiamat-life-sea", CommandType.UseSkill, "p1", { skillId: "master.tiamat.card.life-sea" }));
  assert.equal(result.state.pendingDecision?.kind, "tiamat-beast");
  const choice = result.state.pendingDecision!.options[0].id;
  result = engine.execute(result.state, makeCommand(result.state, "tiamat-choice", CommandType.ResolveDecision, "p1", { decisionId: result.state.pendingDecision!.decisionId, selections: [choice] }));
  const beast = result.state.players.p1.masterSkills.find((id) => result.state.cards[id].definitionId === choice);
  assert.ok(beast);

  result.state.step = "play-batch-draft";
  result.state.players.p1.mana = 8;
  result = engine.execute(result.state, makeCommand(result.state, "tiamat-attack", CommandType.CommitAttack, "p1", { faceUpInstanceIds: [beast, result.state.players.p1.hand[0]], faceDownInstanceIds: [] }));
  assert.equal(result.state.cards[beast].zone, "attack");
  assert.equal(result.state.cards[beast].active, true);
});

test("拉克什米·芭伊厄运可在战力结算后弃置并令同场对手败北", () => {
  const definitions = {
    ...cards,
    "card.x-misfortune": { id: "card.x-misfortune", name: "厄运", cost: 0, basePower: 6, typeLabel: "特殊" },
  };
  const state = createGameState({
    gameInstanceId: "misfortune-response",
    players: [{ id: "p1", name: "拉克什米" }, { id: "p2", name: "对手甲" }, { id: "p3", name: "对手乙" }],
    seed: 41,
  });
  state.status = "playing"; state.round = 1; state.phase = "combat"; state.step = "settlement";
  state.players.p1.locationId = "mountain"; state.players.p2.locationId = "mountain"; state.players.p3.locationId = "mountain";
  state.board.locations.mountain = ["p1", "p2", "p3"];
  const low = "p1:low";
  const highA = "p2:high";
  const highB = "p3:high";
  const misfortune = "p1:misfortune";
  state.cards[low] = { instanceId: low, definitionId: "card.low-1", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards[highA] = { instanceId: highA, definitionId: "card.high-2", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards[highB] = { instanceId: highB, definitionId: "card.high-2", ownerPlayerId: "p3", controllerPlayerId: "p3", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards[misfortune] = { instanceId: misfortune, definitionId: "card.x-misfortune", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = [low]; state.players.p2.attack = [highA]; state.players.p3.attack = [highB]; state.players.p1.hand = [misfortune];
  const engine = new StandardMatchEngine({ cards: definitions, situations, events, playerDecks: { p1: [], p2: [], p3: [] } });

  let result = engine.execute(state, makeCommand(state, "misfortune-resolve", CommandType.ResolveCombat, "host", { locationId: "mountain" }));
  assert.equal(result.state.step, "post-power-response");
  assert.equal(result.state.activePlayerId, "p1");
  result = engine.execute(result.state, makeCommand(result.state, "misfortune-use", CommandType.UseCardAbility, "p1", { instanceId: misfortune, ability: "misfortune-battle-loss" }));
  assert.equal(result.state.players.p1.victoryPoints, 3);
  assert.equal(result.state.players.p1.hand.includes(misfortune), false);
  assert.equal(result.state.players.p1.discard.includes(misfortune), true);
  assert.equal(result.state.cards[misfortune].zone, "discard");
  assert.equal(result.state.players.p2.defeated, true);
  assert.equal(result.state.players.p3.defeated, true);
  result = engine.execute(result.state, makeCommand(result.state, "misfortune-complete", CommandType.CompleteCombatResponse, "p1"));
  assert.equal(result.state.step, "settlement");
  assert.equal(result.state.modeState.pendingCombatResolution, undefined);
});

test("厄运只向战力低于最高者开放，且手牌缺失时不生成响应窗口", () => {
  const definitions = { ...cards, "card.x-misfortune": { id: "card.x-misfortune", name: "厄运", cost: 0, basePower: 6, typeLabel: "特殊" } };
  const state = createGameState({ gameInstanceId: "misfortune-eligibility", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 43 });
  state.status = "playing"; state.round = 1; state.phase = "combat"; state.step = "settlement";
  state.board.locations.mountain = ["p1", "p2"];
  state.players.p1.locationId = "mountain"; state.players.p2.locationId = "mountain";
  const high = "p1:high"; const low = "p2:low";
  state.cards[high] = { instanceId: high, definitionId: "card.high-2", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards[low] = { instanceId: low, definitionId: "card.low-1", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = [high]; state.players.p2.attack = [low];
  const engine = new StandardMatchEngine({ cards: definitions, situations, events, playerDecks: { p1: [], p2: [] } });
  let result = engine.execute(state, makeCommand(state, "misfortune-no-card", CommandType.ResolveCombat, "host", { locationId: "mountain" }));
  assert.equal(result.state.step, "settlement");
  assert.equal(result.state.modeState.pendingCombatResolution, undefined);
});

test("厄运打出时抽一张牌，败北后洗回牌库", () => {
  const misfortune = { id: "card.x-misfortune", name: "厄运", cost: 0, basePower: 6, typeLabel: "特殊", drawOnPlay: 1, returnToDeckOnDefeat: true };
  const definitions = { ...cards, "card.x-misfortune": misfortune, "card.lifecycle-high": { id: "card.lifecycle-high", name: "高位", cost: 0, basePower: 10, typeLabel: "力量" } };
  const state = createGameState({ gameInstanceId: "misfortune-lifecycle", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 47 });
  state.status = "playing"; state.round = 1; state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "p1";
  state.players.p1.locationId = "mountain"; state.players.p2.locationId = "mountain"; state.board.locations.mountain = ["p1", "p2"];
  const cardId = "p1:misfortune-lifecycle";
  state.cards[cardId] = { instanceId: cardId, definitionId: misfortune.id, ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  const fillerId = "p1:filler-lifecycle";
  state.cards[fillerId] = { instanceId: fillerId, definitionId: "card.low-1", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.hand = [cardId, fillerId];
  const result = commitStandardAttack(state, "p1", [cardId, fillerId], [], definitions);
  assert.deepEqual(result.drawRequests, [{ sourceInstanceId: cardId, count: 1 }]);

  state.phase = "combat"; state.step = "settlement";
  const opponentId = "p2:high";
  state.cards[opponentId] = { instanceId: opponentId, definitionId: "card.lifecycle-high", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p2.attack = [opponentId];
  resolveCombat(state, "mountain", definitions, Object.fromEntries(events.map((event) => [event.id, event])));
  assert.equal(state.players.p1.defeated, true);
  assert.equal(state.cards[cardId].zone, "deck");
  assert.equal(state.players.p1.deck.includes(cardId), true);
  assert.equal(state.players.p1.discard.includes(cardId), false);
});

test("波涛之兽的残留效果让下一次常规出牌只需一张牌", () => {
  const definitions = {
    ...cards,
    "master.tiamat.beast.wave-beast": { id: "master.tiamat.beast.wave-beast", name: "波涛之兽", cost: 0, basePower: 6, typeLabel: "魔术", isSkill: true, requiresEightMana: false, residual: true, tags: ["tiamat-beast", "wave-beast", "reduces-standard-attack-by-one"] },
  };
  const state = createGameState({ gameInstanceId: "wave-reduction", players: [{ id: "p1", name: "一" }], seed: 21 });
  state.status = "playing"; state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "p1"; state.players.p1.mana = 4;
  state.cards["p1:wave"] = { instanceId: "p1:wave", definitionId: "master.tiamat.beast.wave-beast", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: true, temporary: false, modifiers: [] };
  state.players.p1.attack = ["p1:wave"];
  state.cards["p1:card"] = { instanceId: "p1:card", definitionId: "card.low-1", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.hand = ["p1:card"];
  const result = commitStandardAttack(state, "p1", ["p1:card"], [], definitions);
  assert.deepEqual(result.committed, ["p1:card"]);
  assert.equal(state.players.p1.attack.length, 2);
});

test("魔性之猪胜利后让战败者失去1点战果", () => {
  const state = createGameState({ gameInstanceId: "pig-combat", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 23 });
  state.status = "playing"; state.round = 1; state.phase = "combat"; state.step = "settlement";
  state.players.p1.locationId = "mountain"; state.players.p2.locationId = "mountain";
  state.board.locations.mountain = ["p1", "p2"];
  state.players.p2.victoryPoints = 3;
  const pig = "p1:pig";
  state.cards[pig] = { instanceId: pig, definitionId: "master.tiamat.beast.magic-pig", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: true, temporary: false, modifiers: [] };
  const loserCard = "p2:card";
  state.cards[loserCard] = { instanceId: loserCard, definitionId: "card.low-1", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = [pig]; state.players.p2.attack = [loserCard];
  const definitions = {
    "master.tiamat.beast.magic-pig": { id: "master.tiamat.beast.magic-pig", name: "魔性之猪", cost: 1, basePower: 4, typeLabel: "迅捷", tags: ["tiamat-beast", "magic-pig"], residual: true },
    "card.low-1": { id: "card.low-1", name: "低位一", cost: 0, basePower: 2, typeLabel: "魔术" },
  };
  const result = resolveCombat(state, "mountain", definitions, {});
  assert.deepEqual(result.winnerIds, ["p1"]);
  assert.equal(state.players.p2.defeated, true);
  assert.equal(state.players.p2.victoryPoints, 2);
});

test("战败时原始之龙和魔性之猪会从攻击区关闭回技能区", () => {
  const state = createGameState({ gameInstanceId: "beast-close", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 29 });
  state.status = "playing"; state.round = 1; state.phase = "combat"; state.step = "settlement";
  state.players.p1.locationId = "mountain"; state.players.p2.locationId = "mountain";
  state.board.locations.mountain = ["p1", "p2"];
  const dragon = "p2:dragon";
  state.cards[dragon] = { instanceId: dragon, definitionId: "master.tiamat.beast.primitive-dragon", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "attack", face: "up", active: true, residual: true, temporary: false, modifiers: [] };
  state.players.p2.attack = [dragon];
  const high = "p1:high";
  state.cards[high] = { instanceId: high, definitionId: "card.high-1", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = [high];
  const definitions = {
    "master.tiamat.beast.primitive-dragon": { id: "master.tiamat.beast.primitive-dragon", name: "原始之龙", cost: 2, basePower: 1, typeLabel: "力量", tags: ["tiamat-beast", "primitive-dragon"], residual: true },
    "card.high-1": { id: "card.high-1", name: "高位一", cost: 0, basePower: 4, typeLabel: "迅捷" },
  };
  resolveCombat(state, "mountain", definitions, {});
  assert.equal(state.cards[dragon].zone, "master-skills");
  assert.equal(state.cards[dragon].active, false);
  assert.equal(state.cards[dragon].residual, false);
});

test("波涛之兽行动能力关闭卡牌并免费移动到目标地点", () => {
  const state = createGameState({ gameInstanceId: "wave-move", players: [{ id: "p1", name: "一" }], seed: 31 });
  state.status = "playing"; state.round = 1; state.phase = "action"; state.step = "move-decision"; state.activePlayerId = "p1";
  state.players.p1.locationId = "city"; state.board.locations.city = ["p1"];
  const wave = "p1:wave";
  state.cards[wave] = { instanceId: wave, definitionId: "master.tiamat.beast.wave-beast", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: true, temporary: false, modifiers: [] };
  state.players.p1.attack = [wave];
  const engine = new StandardMatchEngine({ cards, situations, events, playerDecks: { p1: [] } });
  const result = engine.execute(state, makeCommand(state, "wave-move", CommandType.UseCardAbility, "p1", { instanceId: wave, ability: "wave-beast-move", targetLocationId: "workshop" }));
  assert.equal(result.state.players.p1.locationId, "workshop");
  assert.equal(result.state.cards[wave].zone, "master-skills");
  assert.equal(result.state.cards[wave].residual, false);
});

test("波涛之兽不能从魔术工房或侦察发动移动", () => {
  const state = createGameState({ gameInstanceId: "wave-source-lock", players: [{ id: "p1", name: "一" }], seed: 53 });
  state.status = "playing"; state.round = 1; state.phase = "action"; state.step = "move-decision"; state.activePlayerId = "p1";
  state.players.p1.locationId = "workshop"; state.board.locations.workshop = ["p1"];
  const wave = "p1:wave";
  state.cards[wave] = { instanceId: wave, definitionId: "master.tiamat.beast.wave-beast", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: true, temporary: false, modifiers: [] };
  state.players.p1.attack = [wave];
  const engine = new StandardMatchEngine({ cards, situations, events, playerDecks: { p1: [] } });
  assert.throws(() => engine.execute(state, makeCommand(state, "wave-source-lock", CommandType.UseCardAbility, "p1", { instanceId: wave, ability: "wave-beast-move", targetLocationId: "city" })), /WAVE_BEAST_SOURCE_FORBIDDEN/);
  assert.equal(state.cards[wave].zone, "attack");
});

test("通用卡牌能力入口允许败北玩家使用能力，但拦截非持有者和已关闭卡牌", () => {
  const abilities = new CardAbilityRegistry();
  abilities.register("test-ability", () => undefined);
  const state = createGameState({ gameInstanceId: "ability-guard", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 1 });
  state.status = "playing";
  state.cards.c = { instanceId: "c", definitionId: "c", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  const context = { state, playerId: "p1", instanceId: "c", definitions: cards };
  assert.doesNotThrow(() => abilities.execute("test-ability", context));
  state.players.p1.defeated = true;
  assert.doesNotThrow(() => abilities.execute("test-ability", context));
  state.players.p1.defeated = false;
  assert.throws(() => abilities.execute("test-ability", { ...context, playerId: "p2" }), /CARD_ABILITY_NOT_OWNED/);
  state.cards.c.active = false;
  assert.throws(() => abilities.execute("test-ability", context), /CARD_ABILITY_INACTIVE/);
});

test("卡牌能力使用限制按实例生效，并在回合清理后允许回合限制重用", () => {
  const state = createGameState({ gameInstanceId: "card-ability-limit", players: [{ id: "p1", name: "一" }], seed: 1 });
  state.status = "playing"; state.phase = "action"; state.round = 1; state.activePlayerId = "p1";
  const card = "p1:limited-ability";
  state.cards[card] = { instanceId: card, definitionId: "card.limited", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = [card];
  const definitions = { "card.limited": { id: "card.limited", name: "限次能力", cost: 0, basePower: 1, typeLabel: "特殊", limit: "once-per-round" as const, phases: ["action"] as const } };
  let calls = 0;
  const abilities = new CardAbilityRegistry();
  abilities.register("limited", () => { calls += 1; });
  abilities.execute("limited", { state, playerId: "p1", instanceId: card, definitions });
  assert.equal(calls, 1);
  assert.throws(() => abilities.execute("limited", { state, playerId: "p1", instanceId: card, definitions }), /CARD_ABILITY_LIMIT_REACHED/);
  endStandardRound(state, definitions);
  state.status = "playing"; state.phase = "action"; state.activePlayerId = "p1"; state.round = 2;
  state.cards[card].zone = "attack"; state.cards[card].active = true; state.players.p1.attack = [card];
  abilities.execute("limited", { state, playerId: "p1", instanceId: card, definitions });
  assert.equal(calls, 2);
});

test("卡牌能力处理器失败时不会提前写入使用限制", () => {
  const state = createGameState({ gameInstanceId: "card-ability-atomic", players: [{ id: "p1", name: "一" }], seed: 2 });
  state.status = "playing"; state.phase = "action"; state.round = 1; state.activePlayerId = "p1";
  const card = "p1:atomic-ability";
  state.cards[card] = { instanceId: card, definitionId: "card.atomic", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = [card];
  const definitions = { "card.atomic": { id: "card.atomic", name: "原子能力", cost: 0, basePower: 1, typeLabel: "特殊", limit: "once-per-game" as const } };
  const abilities = new CardAbilityRegistry();
  abilities.register("atomic", () => { throw new Error("HANDLER_FAILED"); });
  assert.throws(() => abilities.execute("atomic", { state, playerId: "p1", instanceId: card, definitions }), /HANDLER_FAILED/);
  assert.equal(state.cards[card].used, undefined);
});

test("标准引擎可以接收内容包提供的卡牌能力注册表", () => {
  const abilities = new CardAbilityRegistry();
  let calls = 0;
  abilities.register("test-card-ability", () => { calls += 1; });
  const engine = new StandardMatchEngine({ cards, situations, events, cardAbilities: abilities, playerDecks: { p1: [] } });
  const state = createGameState({ gameInstanceId: "custom-card-ability", players: [{ id: "p1", name: "一" }], seed: 59 });
  state.status = "playing"; state.phase = "action"; state.activePlayerId = "p1";
  state.cards.custom = { instanceId: "custom", definitionId: "card.low-1", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "master-skills", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.masterSkills.push("custom");
  engine.cardAbilities.execute("test-card-ability", { state, playerId: "p1", instanceId: "custom", definitions: cards });
  assert.equal(calls, 1);
  assert.equal(engine.cardAbilities.has("wave-beast-move"), true);
  assert.equal(engine.cardAbilities.list().includes("test-card-ability"), true);
  assert.throws(() => abilities.register("", () => undefined), /CARD_ABILITY_ID_REQUIRED/);
});

test("同一战场不能通过新命令重复结算", () => {
  const state = createGameState({ gameInstanceId: "combat-once", players: [{ id: "p1", name: "一" }], seed: 37 });
  const engine = new StandardMatchEngine({ cards, situations, events, playerDecks: { p1: [] } });
  state.status = "playing"; state.phase = "combat"; state.step = "settlement"; state.round = 1; state.modeState = { resolvedCombats: ["mountain"] };
  assert.throws(() => engine.execute(state, makeCommand(state, "duplicate-combat", CommandType.ResolveCombat, "p1", { locationId: "mountain" })), /COMBAT_ALREADY_RESOLVED/);
});

function makeCombatResponseState(gameInstanceId: string, powers: [number, number, number]) {
  const skillId = "servant.hassan.skill.sc-hassan-1";
  const responseSkills = new SkillRegistry();
  responseSkills.register({ id: skillId, name: "气息遮断", ownerType: "servant", ownerId: "servant.hassan", activation: "phase", windows: ["combat"], steps: ["post-power-response"], cost: 3, abilityCost: 0, basePower: powers[0], typeLabel: "迅捷", text: "刺杀-战斗阶段：战力结算后", supportLevel: "FULL", handlerId: "core.presence-concealment", limit: "once-per-round" });
  const state = createGameState({ gameInstanceId, players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 7 });
  state.status = "playing"; state.phase = "combat"; state.step = "settlement"; state.round = 1;
  state.board.locations.mountain = ["p1", "p2", "p3"];
  for (const [index, playerId] of ["p1", "p2", "p3"].entries()) {
    const player = state.players[playerId];
    player.locationId = "mountain";
    player.servantId = index === 0 ? "servant.hassan" : `servant.other-${index}`;
    const cardId = `${playerId}:attack`;
    const definitionId = index === 0 ? skillId : `card.power-${index}`;
    state.cards[cardId] = { instanceId: cardId, definitionId, ownerPlayerId: playerId, controllerPlayerId: playerId, zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
    player.attack = [cardId];
  }
  return { state, responseSkills, cards: {
    "card.power-1": { id: "card.power-1", name: "强力一", cost: 0, basePower: powers[1], typeLabel: "力量" },
    "card.power-2": { id: "card.power-2", name: "强力二", cost: 0, basePower: powers[2], typeLabel: "力量" },
  } };
}

test("气息遮断只在三人战斗的严格第二名响应，并可令并列最高者全部败北", () => {
  const setup = makeCombatResponseState("presence-response", [5, 10, 10]);
  const engine = new StandardMatchEngine({ cards: setup.cards, situations, events, skills: setup.responseSkills, playerDecks: { p1: [], p2: [], p3: [] } });
  const start = engine.execute(setup.state, makeCommand(setup.state, "resolve-presence", CommandType.ResolveCombat, "p1", { locationId: "mountain" }));
  assert.equal(start.state.step, "post-power-response");
  assert.equal(start.state.activePlayerId, "p1");
  assert.equal(start.events.some((event) => event.type === "combat.power-calculated"), true);
  const used = engine.execute(start.state, makeCommand(start.state, "use-presence", CommandType.UseSkill, "p1", { skillId: "servant.hassan.skill.sc-hassan-1" }));
  assert.equal(used.state.players.p2.defeated, true);
  assert.equal(used.state.players.p3.defeated, true);
  const completed = engine.execute(used.state, makeCommand(used.state, "skip-presence-next", CommandType.CompleteCombatResponse, "p1", {}));
  assert.equal(completed.state.step, "settlement");
  assert.equal(completed.events.some((event) => event.type === "combat.resolved"), true);
  assert.deepEqual((completed.events.find((event) => event.type === "combat.resolved")?.payload as { winnerIds: string[] }).winnerIds, ["p1"]);
});

test("两人战斗或存在中间战力时不开放气息遮断响应", () => {
  const two = makeCombatResponseState("presence-two", [5, 10, 1]);
  two.state.board.locations.mountain = ["p1", "p2"];
  two.state.players.p3.locationId = null;
  two.state.players.p3.attack = [];
  const engineTwo = new StandardMatchEngine({ cards: two.cards, situations, events, skills: two.responseSkills, playerDecks: { p1: [], p2: [], p3: [] } });
  const direct = engineTwo.execute(two.state, makeCommand(two.state, "resolve-two", CommandType.ResolveCombat, "p1", { locationId: "mountain" }));
  assert.equal(direct.state.step, "settlement");
  assert.equal(direct.events.some((event) => event.type === "combat.power-calculated"), false);

  const middle = makeCombatResponseState("presence-middle", [5, 10, 7]);
  const engineMiddle = new StandardMatchEngine({ cards: middle.cards, situations, events, skills: middle.responseSkills, playerDecks: { p1: [], p2: [], p3: [] } });
  const noResponse = engineMiddle.execute(middle.state, makeCommand(middle.state, "resolve-middle", CommandType.ResolveCombat, "p1", { locationId: "mountain" }));
  assert.equal(noResponse.state.step, "settlement");
  assert.equal(noResponse.events.some((event) => event.type === "combat.power-calculated"), false);
});

test("第11回合结束时按最高战果确定圣杯胜者", () => {
  const state = createGameState({ gameInstanceId: "final-winner", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }], seed: 47 });
  const engine = new StandardMatchEngine({ cards, situations, events, playerDecks: { p1: [], p2: [], p3: [] } });
  state.status = "playing"; state.round = 11; state.phase = "combat"; state.step = "settlement"; state.modeState = { resolvedCombats: ["mountain", "city"] };
  state.board.situationDeck = [];
  state.players.p1.victoryPoints = 8;
  state.players.p2.victoryPoints = 10;
  state.players.p3.victoryPoints = 10;
  const result = engine.execute(state, makeCommand(state, "finish-11", CommandType.EndRound, "p1"));
  assert.equal(result.state.status, "finished");
  const finished = result.events.find((event) => event.type === "game.finished");
  assert.deepEqual((finished?.payload as { winnerIds: string[] }).winnerIds.sort(), ["p2", "p3"]);
});

test("原始之龙残留期间不能常规打出基础攻击", () => {
  const state = createGameState({ gameInstanceId: "dragon-basic-lock", players: [{ id: "p1", name: "一" }], seed: 41 });
  state.status = "playing"; state.round = 1; state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "p1"; state.players.p1.mana = 4;
  const dragon = "p1:dragon"; const basic = "p1:basic"; const nonBasic = "p1:skill";
  state.cards[dragon] = { instanceId: dragon, definitionId: "master.tiamat.beast.primitive-dragon", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: true, temporary: false, modifiers: [] };
  state.players.p1.attack = [dragon];
  state.cards[basic] = { instanceId: basic, definitionId: "card.basic", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.cards[nonBasic] = { instanceId: nonBasic, definitionId: "card.skill", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.hand = [basic, nonBasic];
  const definitions = {
    "master.tiamat.beast.primitive-dragon": { id: "master.tiamat.beast.primitive-dragon", name: "原始之龙", cost: 2, basePower: 6, typeLabel: "力量", tags: ["primitive-dragon"], residual: true },
    "card.basic": { id: "card.basic", name: "基础攻击", cost: 0, basePower: 2, typeLabel: "力量", basic: true },
    "card.skill": { id: "card.skill", name: "非基础", cost: 0, basePower: 2, typeLabel: "特殊", isSkill: true, requiresEightMana: false },
  };
  assert.throws(() => commitStandardAttack(state, "p1", [basic, nonBasic], [], definitions), /BASIC_ATTACK_FORBIDDEN_BY_PRIMITIVE_DRAGON/);
});

test("效果加入攻击不占常规两张牌额度且默认不重复支付费用", () => {
  const state = createGameState({ gameInstanceId: "effect-add", players: [{ id: "p1", name: "一" }], seed: 43 });
  state.status = "playing"; state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "p1"; state.players.p1.mana = 3;
  const card = "p1:generated";
  state.cards[card] = { instanceId: card, definitionId: "card.generated", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: true, modifiers: [] };
  state.players.p1.hand = [card];
  const generatedDefinition = { id: "card.generated", name: "创造攻击", cost: 5, basePower: 2, typeLabel: "力量", limit: "once-per-game" as const };
  const result = addCardToAttack(state, "p1", card, { "card.generated": generatedDefinition });
  assert.equal(result.paidMana, 0);
  assert.equal(state.players.p1.mana, 3);
  assert.equal(state.cards[card].zone, "attack");
  assert.equal(state.cards[card].active, true);
  state.players.p1.attack = [];
  state.players.p1.hand = [card];
  state.cards[card].zone = "hand";
  assert.throws(() => addCardToAttack(state, "p1", card, { "card.generated": generatedDefinition }), /CARD_LIMIT_REACHED/);
});

test("效果队列拒绝重复 effectId 和无效帧", async () => {
  const { EffectQueue } = await import("../src/match-engine/effect-queue.ts");
  const state = createGameState({ gameInstanceId: "effect-queue-validation", players: [{ id: "p1", name: "一" }], seed: 1 });
  const queue = new EffectQueue();
  const frame = { effectId: "effect.one", handlerId: "handler.one", sourceId: "source", controllerPlayerId: "p1", payload: {}, createdAtRevision: 0 };
  queue.enqueue(state, frame);
  assert.throws(() => queue.enqueue(state, frame), /EFFECT_ID_DUPLICATE/);
  assert.throws(() => queue.enqueue(state, { ...frame, effectId: "", handlerId: "" }), /EFFECT_FRAME_INVALID/);
});
