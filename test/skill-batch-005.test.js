import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { SkillRegistry } from "../src/rules-core/skill-registry.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

function makeState(phase = "action") {
  const state = createGameState({
    gameInstanceId: `skills-005-${phase}`,
    players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }],
    seed: 7,
  });
  state.status = "playing";
  state.phase = phase;
  state.step = "player-window";
  state.activePlayerId = "p1";
  state.players.p1.servantId = "s1";
  state.players.p2.servantId = "s2";
  state.players.p3.servantId = "s3";
  return state;
}

function register(state, definition) {
  const registry = new SkillRegistry();
  registry.register(definition);
  registerCoreSkillHandlers(registry);
  return registry;
}

function addActiveSkill(state, definitionId) {
  state.cards.skill = {
    instanceId: "skill",
    definitionId,
    ownerPlayerId: "p1",
    controllerPlayerId: "p1",
    zone: "attack",
    face: "up",
    active: true,
    residual: false,
    temporary: false,
    modifiers: [],
  };
  state.players.p1.attack.push("skill");
}

test("skills-005 迦尔纳可按选择把战果转成魔力和本回合威力", () => {
  const state = makeState();
  state.players.p1.mana = 2;
  state.players.p1.victoryPoints = 4;
  addActiveSkill(state, "karna");
  const registry = register(state, {
    id: "karna", name: "梵天呀，诅咒我身", ownerType: "servant", ownerId: "s1",
    activation: "phase", windows: ["action"], cost: 5, requiresActiveCard: true,
    text: "", supportLevel: "FULL", handlerId: "core.karna-victory-for-power",
  });
  registry.execute(state, "p1", "karna", { amount: 3 }, () => undefined);
  assert.equal(state.players.p1.victoryPoints, 1);
  assert.equal(state.players.p1.mana, 5);
  assert.equal(state.players.p1.flags.roundPowerBonus, 9);
});

test("skills-005 阿周那审判关闭幸运并击败无激活宝具的交战对手", () => {
  const state = makeState("combat");
  state.players.p1.locationId = "mountain";
  state.players.p2.locationId = "mountain";
  state.players.p3.locationId = "mountain";
  state.board.locations.mountain = ["p1", "p2", "p3"];
  addActiveSkill(state, "arjuna");
  state.cards.luck = { instanceId: "luck", definitionId: "luck", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack.push("luck");
  state.cards.np = { instanceId: "np", definitionId: "np", ownerPlayerId: "p3", controllerPlayerId: "p3", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p3.attack.push("np");
  const registry = register(state, {
    id: "arjuna", name: "破坏神之手影", ownerType: "servant", ownerId: "s1",
    activation: "phase", windows: ["combat"], cost: 9, requiresActiveCard: true,
    text: "", supportLevel: "FULL", handlerId: "core.arjuna-judgment",
  });
  const definitions = {
    arjuna: { id: "arjuna", name: "破坏神之手影", basePower: 0, cost: 9, attributes: ["宝具"], isSkill: true },
    luck: { id: "luck", name: "幸运", basePower: 2, cost: 0, typeLabel: "幸运", basic: true },
    np: { id: "np", name: "宝具", basePower: 4, cost: 8, attributes: ["宝具"], isSkill: true },
  };
  registry.execute(state, "p1", "arjuna", undefined, () => undefined, undefined, definitions);
  assert.equal(state.players.p2.defeated, true);
  assert.equal(state.players.p3.defeated, false);
  assert.equal(state.cards.luck.active, false);
  assert.equal(state.cards.luck.face, "down");
  assert.equal(state.cards.luck.zone, "attack");
});

test("skills-005 比利激活暗置幸运并增加其印刷威力", () => {
  const state = makeState("combat");
  state.players.p1.locationId = "mountain";
  state.board.locations.mountain = ["p1"];
  addActiveSkill(state, "billy");
  state.cards.hiddenLuck = { instanceId: "hiddenLuck", definitionId: "luck", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack.push("hiddenLuck");
  const registry = register(state, {
    id: "billy", name: "坏音霹雳", ownerType: "servant", ownerId: "s1",
    activation: "phase", windows: ["combat"], cost: 4, requiresActiveCard: true,
    text: "", supportLevel: "FULL", handlerId: "core.billy-luck-double",
  });
  const definitions = {
    billy: { id: "billy", name: "坏音霹雳", basePower: 0, cost: 4, attributes: ["宝具"], isSkill: true },
    luck: { id: "luck", name: "幸运", basePower: 3, cost: 0, typeLabel: "幸运", basic: true },
  };
  registry.execute(state, "p1", "billy", { instanceId: "hiddenLuck" }, () => undefined, undefined, definitions);
  assert.equal(state.cards.hiddenLuck.face, "up");
  assert.equal(state.cards.hiddenLuck.active, true);
  assert.equal(calculateCombatCardPower(state, state.players.p1, "hiddenLuck", definitions, "mountain"), 6);
});

test("skills-005 俄里翁移除至多两张幸运并按数量增加本回合威力", () => {
  const state = makeState();
  state.players.p1.hand = ["h1"];
  state.players.p1.discard = ["d1"];
  state.cards.h1 = { instanceId: "h1", definitionId: "luck", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.cards.d1 = { instanceId: "d1", definitionId: "luck", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "discard", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  addActiveSkill(state, "orion");
  const registry = register(state, {
    id: "orion", name: "吾之箭矢无兽弗届", ownerType: "servant", ownerId: "s1",
    activation: "phase", windows: ["action"], cost: 7, requiresActiveCard: true,
    text: "", supportLevel: "FULL", handlerId: "core.orion-luck-exile",
  });
  const definitions = { orion: { id: "orion", name: "吾之箭矢无兽弗届", basePower: 0, cost: 7, attributes: ["宝具"], isSkill: true }, luck: { id: "luck", name: "幸运", basePower: 2, cost: 0, typeLabel: "幸运", basic: true } };
  registry.execute(state, "p1", "orion", { instanceIds: ["h1", "d1"] }, () => undefined, undefined, definitions);
  assert.deepEqual(state.players.p1.hand, []);
  assert.deepEqual(state.players.p1.discard, []);
  assert.equal(state.cards.h1.zone, "removed");
  assert.equal(state.cards.d1.zone, "removed");
  assert.equal(state.players.p1.flags.roundPowerBonus, 12);
});

test("skills-005 斯卡哈将同场对手魔力归零并按损失不足八点判定败北", () => {
  const state = makeState("combat");
  state.players.p1.locationId = "city";
  state.players.p2.locationId = "city";
  state.players.p3.locationId = "city";
  state.players.p2.mana = 7;
  state.players.p3.mana = 10;
  state.board.locations.city = ["p1", "p2", "p3"];
  addActiveSkill(state, "scathach");
  const registry = register(state, {
    id: "scathach", name: "死亡满溢的魔境之门", ownerType: "servant", ownerId: "s1",
    activation: "phase", windows: ["combat"], cost: 8, requiresActiveCard: true,
    text: "", supportLevel: "FULL", handlerId: "core.scathach-mana-gate",
  });
  registry.execute(state, "p1", "scathach", undefined, () => undefined, undefined, registry.asCardDefinitions());
  assert.equal(state.players.p2.mana, 0);
  assert.equal(state.players.p3.mana, 0);
  assert.equal(state.players.p2.defeated, true);
  assert.equal(state.players.p3.defeated, false);
});
