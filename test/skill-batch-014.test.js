import test from "node:test";
import assert from "node:assert/strict";

import content from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower, calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { movePlayer } from "../src/rules-core/board.ts";

function makeCommand(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

test("skills-014 希翁升华技展示时批量加入六张公共技能牌", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine({
    ...built,
    cards: {
      ...built.cards,
      "test.basic.strength": { id: "test.basic.strength", name: "测试力量", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true },
    },
  });
  const state = createGameState({ gameInstanceId: "sion-ascension-add-skills", players: [{ id: "sion", name: "希翁" }], seed: 1401 });
  state.status = "playing";
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "sion";
  state.players.sion.masterId = "master.sion";
  state.players.sion.mana = 8;
  createOwnedCardInstance(state, "sion", { instanceId: "ascension", definitionId: "master.sion.skill.ascension", zone: "hand" });
  createOwnedCardInstance(state, "sion", { instanceId: "basic", definitionId: "test.basic.strength", zone: "hand" });

  const result = engine.execute(state, makeCommand(state, "play-sion-ascension", CommandType.CommitAttack, "sion", {
    faceUpInstanceIds: ["ascension", "basic"],
    faceDownInstanceIds: [],
  }));

  const addedDefinitionIds = result.state.players.sion.masterSkills.map((instanceId) => result.state.cards[instanceId].definitionId);
  assert.deepEqual(addedDefinitionIds, [
    "master.sion.skill.s5",
    "master.sion.skill.s6",
    "master.sion.skill.s7",
    "master.sion.skill.s8",
    "master.sion.skill.s10",
    "master.sion.skill.s11",
  ]);
  assert.ok(result.events.some((event) => event.type === "card.played" && event.payload.definitionId === "master.sion.skill.ascension"));
});

test("skills-014 希翁升华技重复展示不会重复加入公共技能牌", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine({
    ...built,
    cards: {
      ...built.cards,
      "test.basic.strength": { id: "test.basic.strength", name: "测试力量", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true },
    },
  });
  const state = createGameState({ gameInstanceId: "sion-ascension-no-duplicate", players: [{ id: "sion", name: "希翁" }], seed: 1402 });
  state.status = "playing";
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "sion";
  state.players.sion.masterId = "master.sion";
  state.players.sion.mana = 8;
  createOwnedCardInstance(state, "sion", { instanceId: "existing-s5", definitionId: "master.sion.skill.s5", zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(state, "sion", { instanceId: "ascension", definitionId: "master.sion.skill.ascension", zone: "hand" });
  createOwnedCardInstance(state, "sion", { instanceId: "basic", definitionId: "test.basic.strength", zone: "hand" });

  const result = engine.execute(state, makeCommand(state, "play-sion-ascension-once", CommandType.CommitAttack, "sion", {
    faceUpInstanceIds: ["ascension", "basic"],
    faceDownInstanceIds: [],
  }));

  const addedDefinitionIds = result.state.players.sion.masterSkills.map((instanceId) => result.state.cards[instanceId].definitionId);
  assert.equal(addedDefinitionIds.filter((definitionId) => definitionId === "master.sion.skill.s5").length, 1);
  assert.equal(addedDefinitionIds.length, 6);
});

test("skills-014 结构化技能执行器支持监督者花费魔力无视交战移动至侦查", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-kirei-overseer", players: [{ id: "kirei", name: "绮礼" }, { id: "opponent", name: "对手" }], seed: 1403 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "kirei";
  state.players.kirei.masterId = "master.kirei";
  state.players.kirei.servantId = "servant.saber";
  state.players.kirei.trueNameRevealed = false;
  state.players.kirei.flags.kireiRole = "overseer";
  state.players.kirei.locationId = "mountain";
  state.players.kirei.mana = 2;
  state.players.opponent.locationId = "mountain";
  state.board.locations.mountain = ["kirei", "opponent"];

  const result = engine.execute(state, makeCommand(state, "kirei-neutral-move", CommandType.UseSkill, "kirei", {
    skillId: "master.kirei.skill.s2",
    data: { abilityId: "neutral-move" },
  }));

  assert.equal(result.state.players.kirei.locationId, "scouting");
  assert.deepEqual(result.state.board.locations.mountain, ["opponent"]);
  assert.deepEqual(result.state.board.locations.scouting, ["kirei"]);
  assert.equal(result.state.players.kirei.mana, 0);
});

test("skills-014 结构化技能执行器会按 DSL 条件阻止非监督者使用监督者移动", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-kirei-executor-blocked", players: [{ id: "kirei", name: "绮礼" }], seed: 1404 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "kirei";
  state.players.kirei.masterId = "master.kirei";
  state.players.kirei.flags.kireiRole = "executor";
  state.players.kirei.locationId = "city";
  state.board.locations.city = ["kirei"];
  state.players.kirei.mana = 2;

  assert.throws(() => engine.execute(state, makeCommand(state, "kirei-neutral-move-blocked", CommandType.UseSkill, "kirei", {
    skillId: "master.kirei.skill.s2",
    data: { abilityId: "neutral-move" },
  })), /SKILL_USE_FORBIDDEN/);
});

test("skills-014 言峰绮礼升华技监督者段真名解放并令同战场玩家败北", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "kirei-ascension-overseer", players: [{ id: "kirei", name: "绮礼" }, { id: "target", name: "目标" }], seed: 1407 });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "kirei";
  state.players.kirei.masterId = "master.kirei";
  state.players.kirei.servantId = "servant.saber";
  state.players.kirei.trueNameRevealed = false;
  state.players.kirei.flags.kireiRole = "overseer";
  state.players.kirei.locationId = "mountain";
  state.players.target.locationId = "mountain";
  state.board.locations.mountain = ["kirei", "target"];

  assert.throws(() => engine.execute(state, makeCommand(state, "kirei-ascension-before-unlock", CommandType.UseSkill, "kirei", {
    skillId: "master.kirei.skill.ascension",
    data: { abilityId: "overseer-execution", targetPlayerId: "target" },
  })), /SKILL_NOT_OWNED/);

  createOwnedCardInstance(state, "kirei", {
    instanceId: "ascension",
    definitionId: "card.skill.master.kirei.skill.ascension",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "kirei-ascension-execute", CommandType.UseSkill, "kirei", {
    skillId: "master.kirei.skill.ascension",
    data: { abilityId: "overseer-execution", targetPlayerId: "target" },
  }));

  assert.equal(result.state.players.target.defeated, true);
  assert.equal(result.state.players.kirei.trueNameRevealed, true);
  assert.equal(result.state.players.kirei.flags.kireiRole, "executor");
});

test("skills-014 言峰绮礼升华技执行者段只在执行者身份下增强基础攻击并无视败北", () => {
  const built = buildStandardContent(content);
  const definitions = {
    ...built.cards,
    "test.basic.strength": { id: "test.basic.strength", name: "测试力量", cost: 0, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true },
    "test.basic.magic": { id: "test.basic.magic", name: "测试魔术", cost: 0, basePower: 2, typeLabel: "魔术", attributes: ["魔术"], basic: true },
  };
  const state = createGameState({ gameInstanceId: "kirei-ascension-executor", players: [{ id: "kirei", name: "绮礼" }, { id: "blocker", name: "拦路者" }], seed: 1408 });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "kirei";
  state.players.kirei.masterId = "master.kirei";
  state.players.kirei.servantId = "servant.saber";
  state.players.kirei.trueNameRevealed = true;
  state.players.kirei.flags.kireiRole = "executor";
  state.players.kirei.locationId = "mountain";
  state.players.blocker.locationId = "mountain";
  state.board.locations.mountain = ["kirei", "blocker"];
  createOwnedCardInstance(state, "kirei", {
    instanceId: "ascension",
    definitionId: "card.skill.master.kirei.skill.ascension",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "kirei", {
    instanceId: "strength",
    definitionId: "test.basic.strength",
    zone: "attack",
    face: "up",
    active: true,
  });
  assert.equal(calculateCombatCardPower(state, state.players.kirei, "strength", definitions), 5);

  state.players.kirei.flags.kireiRole = "overseer";
  assert.equal(calculateCombatCardPower(state, state.players.kirei, "strength", definitions), 3);

  state.players.kirei.flags.kireiRole = "executor";
  state.players.kirei.defeated = true;
  state.players.kirei.mana = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  createOwnedCardInstance(state, "kirei", { instanceId: "hand-strength", definitionId: "test.basic.strength", zone: "hand" });
  createOwnedCardInstance(state, "kirei", { instanceId: "hand-magic", definitionId: "test.basic.magic", zone: "hand" });
  assert.doesNotThrow(() => new StandardMatchEngine({ ...built, cards: definitions }).execute(state, makeCommand(state, "kirei-defeated-play", CommandType.CommitAttack, "kirei", {
    faceUpInstanceIds: ["hand-strength"],
    faceDownInstanceIds: ["hand-magic"],
  })));

  state.step = "move-decision";
  state.activePlayerId = "kirei";
  assert.doesNotThrow(() => movePlayer(state, "kirei", "city", true, definitions));
});

test("skills-014 属性筛选基础攻击光环只增强指定属性并保留高潮战力加成", () => {
  const built = buildStandardContent(content);
  const definitions = {
    ...built.cards,
    ...built.skills.asCardDefinitions(),
    "test.basic.strength": { id: "test.basic.strength", name: "测试力量", cost: 0, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true },
    "test.basic.agility": { id: "test.basic.agility", name: "测试迅捷", cost: 0, basePower: 2, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
    "test.basic.magic": { id: "test.basic.magic", name: "测试魔术", cost: 0, basePower: 4, typeLabel: "魔术", attributes: ["魔术"], basic: true },
  };
  const state = createGameState({ gameInstanceId: "shirou-basic-aura-filter", players: [{ id: "shirou", name: "士郎" }], seed: 1405 });
  state.status = "playing";
  createOwnedCardInstance(state, "shirou", { instanceId: "ascension", definitionId: "master.shirou-emiya.skill.ascension", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "shirou", { instanceId: "strength", definitionId: "test.basic.strength", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "shirou", { instanceId: "agility", definitionId: "test.basic.agility", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "shirou", { instanceId: "magic", definitionId: "test.basic.magic", zone: "attack", face: "up", active: true });

  assert.equal(calculateCombatCardPower(state, state.players.shirou, "strength", definitions), 5);
  assert.equal(calculateCombatCardPower(state, state.players.shirou, "agility", definitions), 4);
  assert.equal(calculateCombatCardPower(state, state.players.shirou, "magic", definitions), 4);
  assert.equal(calculateCombatPower(state, state.players.shirou, definitions), 21);
  state.modeState.currentSituationClimax = true;
  assert.equal(calculateCombatPower(state, state.players.shirou, definitions), 25);
});

test("skills-014 结构化 play_trigger 支持打出时令同地点对手获得魔力", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine({
    ...built,
    cards: {
      ...built.cards,
      "test.basic.strength": { id: "test.basic.strength", name: "测试力量", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true },
    },
  });
  const state = createGameState({
    gameInstanceId: "structured-tesla-play-trigger",
    players: [{ id: "tesla", name: "特斯拉" }, { id: "same", name: "同地点对手" }, { id: "away", name: "远处对手" }],
    seed: 1406,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "tesla";
  state.players.tesla.servantId = "servant.tesla";
  state.players.tesla.trueNameRevealed = false;
  state.players.tesla.locationId = "mountain";
  state.players.tesla.mana = 13;
  state.players.same.locationId = "mountain";
  state.players.away.locationId = "city";
  state.board.locations.mountain = ["tesla", "same"];
  state.board.locations.city = ["away"];
  createOwnedCardInstance(state, "tesla", { instanceId: "np", definitionId: "servant.tesla.skill.sc-tesla-3", zone: "hand" });
  createOwnedCardInstance(state, "tesla", { instanceId: "basic", definitionId: "test.basic.strength", zone: "hand" });

  const result = engine.execute(state, makeCommand(state, "play-tesla-np", CommandType.CommitAttack, "tesla", {
    faceUpInstanceIds: ["np", "basic"],
    faceDownInstanceIds: [],
  }));

  assert.equal(result.state.players.tesla.mana, 8);
  assert.equal(result.state.players.tesla.trueNameRevealed, true);
  assert.equal(result.state.players.same.mana, 2);
  assert.equal(result.state.players.away.mana, 0);
});

test("skills-014 结构化多目标效果支持战斗阶段同地点对手获得魔力", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "structured-tesla-combat-shock",
    players: [{ id: "tesla", name: "特斯拉" }, { id: "same", name: "同地点对手" }, { id: "away", name: "远处对手" }],
    seed: 1407,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "tesla";
  state.players.tesla.servantId = "servant.tesla";
  state.players.tesla.locationId = "city";
  state.players.same.locationId = "city";
  state.players.away.locationId = "mountain";
  state.board.locations.city = ["tesla", "same"];
  state.board.locations.mountain = ["away"];
  createOwnedCardInstance(state, "tesla", {
    instanceId: "np",
    definitionId: "servant.tesla.skill.sc-tesla-3",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "tesla-combat-shock", CommandType.UseSkill, "tesla", {
    skillId: "servant.tesla.skill.sc-tesla-3",
    data: { abilityId: "combat-shock" },
  }));

  assert.equal(result.state.players.same.mana, 2);
  assert.equal(result.state.players.away.mana, 0);
  assert.equal(result.state.players.tesla.mana, 0);
});
