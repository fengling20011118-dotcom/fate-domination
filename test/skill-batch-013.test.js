import test from "node:test";
import assert from "node:assert/strict";

import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { SkillRegistry } from "../src/rules-core/skill-registry.ts";
import { calculateCombatCardPower, calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const cardDefinitions = {
  "card.magic": { id: "card.magic", name: "魔术攻击", cost: 0, basePower: 5, typeLabel: "魔术", attributes: ["魔术"], basic: true },
  "card.strength": { id: "card.strength", name: "力量攻击", cost: 0, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.noble": { id: "card.noble", name: "宝具攻击", cost: 0, basePower: 9, typeLabel: "宝具", attributes: ["宝具"], basic: false },
  "card.costly": { id: "card.costly", name: "有魔力消耗的攻击", cost: 2, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: false },
  "card.skill.basic-aura": { id: "card.skill.basic-aura", name: "基础光环", cardType: "skill", cost: 0, basePower: 0, typeLabel: "特殊", attributes: ["特殊"], isSkill: true, basicCardPowerBonus: 1 },
  "card.filler": { id: "card.filler", name: "测试手牌", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.x-guard": { id: "card.x-guard", name: "守护", cost: 0, basePower: 0, typeLabel: "特殊", attributes: ["特殊"], linkedOwnerCombatPowerMaximum: true },
  "servant.diarmuid.skill.sc-diarmuid-1": {
    id: "servant.diarmuid.skill.sc-diarmuid-1",
    name: "必灭的黄蔷薇",
    cardType: "skill",
    ownerType: "servant",
    ownerDefinitionId: "servant.diarmuid",
    cost: 8,
    basePower: 9,
    typeLabel: "迅捷/宝具",
    attributes: ["迅捷", "宝具"],
    isSkill: true,
    skillOwnerType: "servant",
  },
  "servant.diarmuid.skill.sc-diarmuid-2": {
    id: "servant.diarmuid.skill.sc-diarmuid-2",
    name: "破魔的红蔷薇",
    cardType: "skill",
    ownerType: "servant",
    ownerDefinitionId: "servant.diarmuid",
    cost: 4,
    basePower: 4,
    typeLabel: "迅捷/宝具",
    attributes: ["迅捷", "宝具"],
    isSkill: true,
    skillOwnerType: "servant",
  },
};

test("skills-013 基础卡威力光环只增强同控制者的已激活基础攻击", () => {
  const state = createGameState({
    gameInstanceId: "basic-card-aura",
    players: [{ id: "p1", name: "玩家1" }, { id: "p2", name: "玩家2" }],
    seed: 13,
  });
  state.status = "playing";
  createOwnedCardInstance(state, "p1", { instanceId: "basic", definitionId: "card.strength", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "p1", { instanceId: "noble", definitionId: "card.noble", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "p1", { instanceId: "aura", definitionId: "card.skill.basic-aura", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "p2", { instanceId: "enemy-basic", definitionId: "card.strength", zone: "attack", face: "up", active: true });

  assert.equal(calculateCombatCardPower(state, state.players.p1, "basic", cardDefinitions), 5);
  assert.equal(calculateCombatCardPower(state, state.players.p1, "noble", cardDefinitions), 9);
  assert.equal(calculateCombatCardPower(state, state.players.p2, "enemy-basic", cardDefinitions), 4);
});

test("skills-013 基础卡威力光环未激活时不会增强基础攻击", () => {
  const state = createGameState({
    gameInstanceId: "inactive-basic-card-aura",
    players: [{ id: "p1", name: "玩家1" }],
    seed: 13,
  });
  state.status = "playing";
  createOwnedCardInstance(state, "p1", { instanceId: "basic", definitionId: "card.strength", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "p1", { instanceId: "aura", definitionId: "card.skill.basic-aura", zone: "attack", face: "up", active: false });

  assert.equal(calculateCombatCardPower(state, state.players.p1, "basic", cardDefinitions), 4);
});

function makeCommand(state, id, actorId, skillId, data = {}) {
  return {
    commandId: id,
    gameInstanceId: state.gameInstanceId,
    actorId,
    expectedRevision: state.revision,
    type: CommandType.UseSkill,
    payload: { skillId, data },
  };
}

function setupSionMagicImmunityState({ withTargets = true } = {}) {
  const skillId = "master.sion.skill.s5";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "对魔力 EX",
    ownerType: "master",
    ownerId: "master.sion",
    activation: "phase",
    windows: ["combat"],
    cost: 3,
    requirement: 3,
    typeLabel: "力量",
    attributes: ["力量"],
    text: "魔术免疫-战斗阶段：将同一战场所有对手的魔术属性攻击威力以及通过令咒获得的威力变为0。",
    supportLevel: "FULL",
    handlerId: "core.sion-magic-immunity-ex",
    combatPowerZeroAttribute: "魔术",
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: withTargets ? "sion-magic-immunity" : "sion-magic-immunity-empty",
    players: [{ id: "sion", name: "希翁" }, { id: "opp", name: "对手" }, { id: "other", name: "旁观" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "sion";
  state.players.sion.masterId = "master.sion";
  state.players.sion.locationId = "mountain";
  state.players.opp.locationId = "mountain";
  state.players.other.locationId = "city";
  state.board.locations.mountain = ["sion", "opp"];
  state.board.locations.city = ["other"];
  createOwnedCardInstance(state, "opp", {
    instanceId: "opp-magic",
    definitionId: withTargets ? "card.magic" : "card.strength",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "other", {
    instanceId: "other-magic",
    definitionId: "card.magic",
    zone: "attack",
    face: "up",
    active: true,
  });
  if (withTargets) {
    state.players.opp.flags.roundPowerBonus = 7;
    state.players.opp.flags.commandSealRoundPowerBonus = 4;
    state.players.other.flags.commandSealRoundPowerBonus = 6;
  }
  return { engine, registry, state, skillId };
}

test("skills-013 希翁对魔力EX归零同战场对手魔术攻击与令咒来源威力", () => {
  const { engine, state, skillId } = setupSionMagicImmunityState();
  assert.equal(calculateCombatPower(state, state.players.opp, cardDefinitions, "mountain"), 16);
  assert.equal(calculateCombatPower(state, state.players.other, cardDefinitions, "city"), 11);

  const result = engine.execute(state, makeCommand(state, "use-sion-magic-immunity", "sion", skillId));

  assert.equal(result.state.cards["opp-magic"].powerModifiers?.at(-1)?.kind, "set");
  assert.equal(result.state.cards["opp-magic"].powerModifiers?.at(-1)?.value, 0);
  assert.equal(result.state.players.opp.flags.commandSealRoundPowerBonus, undefined);
  assert.equal(result.state.players.opp.flags.roundPowerBonus, 7);
  assert.equal(calculateCombatPower(result.state, result.state.players.opp, cardDefinitions, "mountain"), 7);
  assert.equal(result.state.players.other.flags.commandSealRoundPowerBonus, 6);
  assert.equal(calculateCombatPower(result.state, result.state.players.other, cardDefinitions, "city"), 11);
});

test("skills-013 希翁对魔力EX没有魔术攻击或令咒威力目标时不可用", () => {
  const { engine, registry, state, skillId } = setupSionMagicImmunityState({ withTargets: false });
  assert.equal(registry.getLegalActions(state, "sion", cardDefinitions).some((action) => action.payload?.skillId === skillId), false);
  assert.throws(() => engine.execute(state, makeCommand(state, "blocked-sion-magic-immunity", "sion", skillId)), /SKILL_USE_FORBIDDEN/);
});

test("skills-013 希翁对魔力EX内容达到FULL并绑定战斗阶段处理器", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.masters.find((master) => master.id === "master.sion");
  const [skill] = buildSkillDefinitions({ masters: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "master.sion.skill.s5")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.sion-magic-immunity-ex");
  assert.deepEqual(skill.windows, ["combat"]);
  assert.equal(skill.combatPowerZeroAttribute, "魔术");
});

test("skills-013 混沌原始只降低本回合未用令咒的同战场对手合计威力", () => {
  const skillId = "master.chaos.skill.s15";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "原始",
    ownerType: "master",
    ownerId: "master.chaos",
    activation: "phase",
    windows: ["combat"],
    cost: 3,
    requirement: 3,
    typeLabel: "特殊",
    attributes: ["特殊"],
    text: "野性-战斗阶段：与你位于同一战场且于本回合未花费或使用令咒的交战对手-3合计威力。",
    supportLevel: "FULL",
    handlerId: "core.same-battlefield-opponent-power",
    opponentCombatPowerBonus: -3,
    opponentRequiresNoCommandSealThisRound: true,
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: {},
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "chaos-primal",
    players: [{ id: "chaos", name: "混沌" }, { id: "plain", name: "未用令咒" }, { id: "sealed", name: "已用令咒" }, { id: "away", name: "场外" }],
    seed: 13,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "chaos";
  state.players.chaos.masterId = "master.chaos";
  state.board.locations.city = ["chaos", "plain", "sealed"];
  state.board.locations.mountain = ["away"];
  for (const id of state.board.locations.city) state.players[id].locationId = "city";
  state.players.away.locationId = "mountain";
  state.players.sealed.flags.commandSealUsedRound = 4;

  const result = engine.execute(state, makeCommand(state, "use-chaos-primal", "chaos", skillId));

  assert.equal(result.state.players.plain.flags.roundPowerBonus, -3);
  assert.equal(result.state.players.sealed.flags.roundPowerBonus, undefined);
  assert.equal(result.state.players.away.flags.roundPowerBonus, undefined);
});

test("skills-013 混沌原始内容达到FULL并复用同战场对手威力处理器", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.masters.find((master) => master.id === "master.chaos");
  const [skill] = buildSkillDefinitions({ masters: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "master.chaos.skill.s15")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.same-battlefield-opponent-power");
  assert.equal(skill.opponentCombatPowerBonus, -3);
  assert.equal(skill.opponentRequiresNoCommandSealThisRound, true);
});

test("skills-013 身体论支付魔力后获得合计威力并沿箭头移动一步", () => {
  const skillId = "master.peperoncino.skill.s1b";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "身体论",
    ownerType: "master",
    ownerId: "master.peperoncino",
    activation: "phase",
    windows: ["action"],
    cost: 0,
    abilityCost: 2,
    text: "行动阶段：花费2点魔力，合计威力+3，若可能则沿着箭头移动一步。",
    supportLevel: "FULL",
    handlerId: "core.power-bonus-and-forward-move",
    combatPowerBonus: 3,
    moveForwardSteps: 1,
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: {},
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "pepe-body-theory",
    players: [{ id: "pepe", name: "佩佩隆奇诺" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "pepe";
  state.players.pepe.masterId = "master.peperoncino";
  state.players.pepe.mana = 5;
  state.players.pepe.locationId = "mountain";
  state.board.locations.mountain = ["pepe"];

  const result = engine.execute(state, makeCommand(state, "use-pepe-body-theory", "pepe", skillId));

  assert.equal(result.state.players.pepe.mana, 3);
  assert.equal(result.state.players.pepe.flags.roundPowerBonus, 3);
  assert.equal(result.state.players.pepe.locationId, "city");
  assert.deepEqual(result.state.board.locations.mountain, []);
  assert.deepEqual(result.state.board.locations.city, ["pepe"]);
});

test("skills-013 身体论移动不可能时仍保留支付和合计威力", () => {
  const skillId = "master.peperoncino.skill.s1b";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "身体论",
    ownerType: "master",
    ownerId: "master.peperoncino",
    activation: "phase",
    windows: ["action"],
    cost: 0,
    abilityCost: 2,
    text: "行动阶段：花费2点魔力，合计威力+3，若可能则沿着箭头移动一步。",
    supportLevel: "FULL",
    handlerId: "core.power-bonus-and-forward-move",
    combatPowerBonus: 3,
    moveForwardSteps: 1,
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: {},
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "pepe-body-theory-blocked",
    players: [{ id: "pepe", name: "佩佩隆奇诺" }, { id: "blocker", name: "侦查占位" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "pepe";
  state.players.pepe.masterId = "master.peperoncino";
  state.players.pepe.mana = 5;
  state.players.pepe.locationId = "city";
  state.players.blocker.locationId = "scouting";
  state.board.locations.city = ["pepe"];
  state.board.locations.scouting = ["blocker"];

  const result = engine.execute(state, makeCommand(state, "use-pepe-body-theory-blocked", "pepe", skillId));

  assert.equal(result.state.players.pepe.mana, 3);
  assert.equal(result.state.players.pepe.flags.roundPowerBonus, 3);
  assert.equal(result.state.players.pepe.locationId, "city");
  assert.deepEqual(result.state.board.locations.city, ["pepe"]);
  assert.deepEqual(result.state.board.locations.scouting, ["blocker"]);
});

test("skills-013 身体论内容达到FULL并登记前进移动结构字段", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.masters.find((master) => master.id === "master.peperoncino");
  const [skill] = buildSkillDefinitions({ masters: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "master.peperoncino.skill.s1b")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.power-bonus-and-forward-move");
  assert.equal(skill.abilityCost, 2);
  assert.equal(skill.combatPowerBonus, 3);
  assert.equal(skill.moveForwardSteps, 1);
});

test("skills-013 持翼之神可沿路径移动两个位置且不获得失败补偿", () => {
  const skillId = "servant.quetzalcoatl.skill.sc-quetzalcoatl-3";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "持翼之神",
    ownerType: "servant",
    ownerId: "servant.quetzalcoatl",
    activation: "phase",
    windows: ["action"],
    cost: 2,
    text: "【真名解放】\n行动阶段：（如可能）沿着路径移动两个位置。如果无法执行，则获得3点合计威力。",
    supportLevel: "FULL",
    handlerId: "core.power-bonus-and-forward-move",
    requiresActiveCard: true,
    moveForwardSteps: 2,
    combatPowerBonusIfMoveImpossible: 3,
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: {},
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "quetz-winged-serpent",
    players: [{ id: "quetz", name: "羽蛇神" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "quetz";
  state.players.quetz.servantId = "servant.quetzalcoatl";
  state.players.quetz.locationId = "workshop";
  state.board.locations.workshop = ["quetz"];
  createOwnedCardInstance(state, "quetz", {
    instanceId: "winged-serpent-card",
    definitionId: skillId,
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "use-quetz-winged-serpent", "quetz", skillId));

  assert.equal(result.state.players.quetz.locationId, "city");
  assert.equal(result.state.players.quetz.flags.roundPowerBonus, undefined);
  assert.deepEqual(result.state.board.locations.workshop, []);
  assert.deepEqual(result.state.board.locations.city, ["quetz"]);
});

test("skills-013 持翼之神无法移动时获得3点合计威力", () => {
  const skillId = "servant.quetzalcoatl.skill.sc-quetzalcoatl-3";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "持翼之神",
    ownerType: "servant",
    ownerId: "servant.quetzalcoatl",
    activation: "phase",
    windows: ["action"],
    cost: 2,
    text: "【真名解放】\n行动阶段：（如可能）沿着路径移动两个位置。如果无法执行，则获得3点合计威力。",
    supportLevel: "FULL",
    handlerId: "core.power-bonus-and-forward-move",
    requiresActiveCard: true,
    moveForwardSteps: 2,
    combatPowerBonusIfMoveImpossible: 3,
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: {},
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "quetz-winged-serpent-blocked",
    players: [{ id: "quetz", name: "羽蛇神" }, { id: "blocker", name: "侦查占位" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "quetz";
  state.players.quetz.servantId = "servant.quetzalcoatl";
  state.players.quetz.locationId = "mountain";
  state.players.blocker.locationId = "scouting";
  state.board.locations.mountain = ["quetz"];
  state.board.locations.scouting = ["blocker"];
  createOwnedCardInstance(state, "quetz", {
    instanceId: "winged-serpent-card",
    definitionId: skillId,
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "use-quetz-winged-serpent-blocked", "quetz", skillId));

  assert.equal(result.state.players.quetz.locationId, "mountain");
  assert.equal(result.state.players.quetz.flags.roundPowerBonus, 3);
  assert.deepEqual(result.state.board.locations.mountain, ["quetz"]);
  assert.deepEqual(result.state.board.locations.scouting, ["blocker"]);
});

test("skills-013 持翼之神内容达到FULL并登记移动失败补偿", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.quetzalcoatl");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.quetzalcoatl.skill.sc-quetzalcoatl-3")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.power-bonus-and-forward-move");
  assert.equal(skill.moveForwardSteps, 2);
  assert.equal(skill.combatPowerBonusIfMoveImpossible, 3);
  assert.equal(skill.requiresActiveCard, true);
});

test("skills-013 破魔的红蔷薇可支付6魔力关闭自身并加入黄蔷薇", () => {
  const redRoseId = "servant.diarmuid.skill.sc-diarmuid-2";
  const yellowRoseId = "servant.diarmuid.skill.sc-diarmuid-1";
  const registry = new SkillRegistry();
  registry.register({
    id: redRoseId,
    name: "破魔的红蔷薇",
    ownerType: "servant",
    ownerId: "servant.diarmuid",
    activation: "phase",
    windows: ["combat"],
    cost: 4,
    text: "【真名解放】\n战斗阶段：花费6点魔力，关闭此牌并将【必灭的黄蔷薇】加入攻击。\n战斗阶段：将此战场所有对手的宝具威力变为0。",
    supportLevel: "FULL",
    handlerId: "core.diarmuid-red-rose",
    requiresActiveCard: true,
    combatPowerZeroAttribute: "宝具",
    abilities: [
      { id: "add-yellow-rose", name: "黄蔷薇追击", activation: "phase", windows: ["combat"], abilityCost: 6, requiresActiveCard: true },
      { id: "zero-noble-phantasm", name: "破魔", activation: "phase", windows: ["combat"], abilityCost: 0, requiresActiveCard: true },
    ],
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "diarmuid-red-rose-add",
    players: [{ id: "diarmuid", name: "迪尔姆德" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "diarmuid";
  state.players.diarmuid.servantId = "servant.diarmuid";
  state.players.diarmuid.mana = 10;
  createOwnedCardInstance(state, "diarmuid", {
    instanceId: "red-rose-card",
    definitionId: redRoseId,
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "diarmuid", {
    instanceId: "yellow-rose-card",
    definitionId: yellowRoseId,
    zone: "servant-skills",
    face: "up",
    active: false,
  });

  const result = engine.execute(state, makeCommand(state, "use-red-rose-add", "diarmuid", redRoseId, { abilityId: "add-yellow-rose" }));

  assert.equal(result.state.players.diarmuid.mana, 4);
  assert.deepEqual(result.state.players.diarmuid.attack, ["yellow-rose-card"]);
  assert.deepEqual(result.state.players.diarmuid.servantSkills, ["red-rose-card"]);
  assert.equal(result.state.cards["red-rose-card"].active, false);
  assert.equal(result.state.cards["red-rose-card"].zone, "servant-skills");
  assert.equal(result.state.cards["yellow-rose-card"].active, true);
  assert.equal(result.state.cards["yellow-rose-card"].zone, "attack");
  assert.equal(result.state.cards["yellow-rose-card"].playedRound, result.state.round);
});

test("skills-013 破魔的红蔷薇可将同战场对手宝具威力归零", () => {
  const redRoseId = "servant.diarmuid.skill.sc-diarmuid-2";
  const registry = new SkillRegistry();
  registry.register({
    id: redRoseId,
    name: "破魔的红蔷薇",
    ownerType: "servant",
    ownerId: "servant.diarmuid",
    activation: "phase",
    windows: ["combat"],
    cost: 4,
    text: "【真名解放】\n战斗阶段：花费6点魔力，关闭此牌并将【必灭的黄蔷薇】加入攻击。\n战斗阶段：将此战场所有对手的宝具威力变为0。",
    supportLevel: "FULL",
    handlerId: "core.diarmuid-red-rose",
    requiresActiveCard: true,
    combatPowerZeroAttribute: "宝具",
    abilities: [
      { id: "add-yellow-rose", name: "黄蔷薇追击", activation: "phase", windows: ["combat"], abilityCost: 6, requiresActiveCard: true },
      { id: "zero-noble-phantasm", name: "破魔", activation: "phase", windows: ["combat"], abilityCost: 0, requiresActiveCard: true },
    ],
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "diarmuid-red-rose-zero",
    players: [{ id: "diarmuid", name: "迪尔姆德" }, { id: "opp", name: "对手" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "diarmuid";
  state.players.diarmuid.servantId = "servant.diarmuid";
  state.players.diarmuid.locationId = "city";
  state.players.opp.locationId = "city";
  state.board.locations.city = ["diarmuid", "opp"];
  createOwnedCardInstance(state, "diarmuid", {
    instanceId: "red-rose-card",
    definitionId: redRoseId,
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "opp", {
    instanceId: "opp-noble",
    definitionId: "card.noble",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "opp", {
    instanceId: "opp-strength",
    definitionId: "card.strength",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "use-red-rose-zero", "diarmuid", redRoseId, { abilityId: "zero-noble-phantasm" }));

  assert.equal(result.state.cards["opp-noble"].powerModifiers?.at(-1)?.kind, "set");
  assert.equal(result.state.cards["opp-noble"].powerModifiers?.at(-1)?.value, 0);
  assert.equal(result.state.cards["opp-strength"].powerModifiers, undefined);
});

test("skills-013 破魔的红蔷薇内容拆分两个战斗小能力并达到FULL", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.diarmuid");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.diarmuid.skill.sc-diarmuid-2")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.diarmuid-red-rose");
  assert.equal(skill.combatPowerZeroAttribute, "宝具");
  assert.equal(skill.abilities.length, 2);
  assert.equal(skill.abilities[0].id, "add-yellow-rose");
  assert.equal(skill.abilities[0].abilityCost, 6);
  assert.equal(skill.abilities[1].id, "zero-noble-phantasm");
});

test("skills-013 左齿啮咬右齿啮咬在同战场有对手时抽2张牌", () => {
  const skillId = "servant.angra.skill.sc-angra-3";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "左齿啮咬&右齿啮咬",
    ownerType: "servant",
    ownerId: "servant.angra",
    activation: "phase",
    windows: ["action"],
    cost: 3,
    text: "你拥有的魔力少于8点也可使用此牌。\n行动阶段：若你位于的战场存在对手，抽2张牌。若你独自位于一处战场，获得4点魔力。",
    supportLevel: "FULL",
    handlerId: "core.angra-bites",
    requiresActiveCard: true,
    requiresEightMana: false,
    drawCount: 2,
    manaGain: 4,
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "angra-bites-draw",
    players: [{ id: "angra", name: "安哥拉" }, { id: "opp", name: "对手" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "angra";
  state.players.angra.servantId = "servant.angra";
  state.players.angra.mana = 4;
  state.players.angra.locationId = "mountain";
  state.players.opp.locationId = "mountain";
  state.board.locations.mountain = ["angra", "opp"];
  createOwnedCardInstance(state, "angra", {
    instanceId: "angra-bites-card",
    definitionId: skillId,
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "angra", { instanceId: "draw-1", definitionId: "card.filler", zone: "deck" });
  createOwnedCardInstance(state, "angra", { instanceId: "draw-2", definitionId: "card.filler", zone: "deck" });

  const result = engine.execute(state, makeCommand(state, "use-angra-bites-draw", "angra", skillId));

  assert.deepEqual(result.state.players.angra.hand, ["draw-1", "draw-2"]);
  assert.deepEqual(result.state.players.angra.deck, []);
  assert.equal(result.state.players.angra.mana, 4);
});

test("skills-013 左齿啮咬右齿啮咬独处战场时获得4点魔力", () => {
  const skillId = "servant.angra.skill.sc-angra-3";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "左齿啮咬&右齿啮咬",
    ownerType: "servant",
    ownerId: "servant.angra",
    activation: "phase",
    windows: ["action"],
    cost: 3,
    text: "你拥有的魔力少于8点也可使用此牌。\n行动阶段：若你位于的战场存在对手，抽2张牌。若你独自位于一处战场，获得4点魔力。",
    supportLevel: "FULL",
    handlerId: "core.angra-bites",
    requiresActiveCard: true,
    requiresEightMana: false,
    drawCount: 2,
    manaGain: 4,
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "angra-bites-mana",
    players: [{ id: "angra", name: "安哥拉" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "angra";
  state.players.angra.servantId = "servant.angra";
  state.players.angra.mana = 2;
  state.players.angra.locationId = "city";
  state.board.locations.city = ["angra"];
  createOwnedCardInstance(state, "angra", {
    instanceId: "angra-bites-card",
    definitionId: skillId,
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "use-angra-bites-mana", "angra", skillId));

  assert.equal(result.state.players.angra.mana, 6);
  assert.deepEqual(result.state.players.angra.hand, []);
});

test("skills-013 左齿啮咬右齿啮咬内容达到FULL并保留低魔力使用例外", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.angra");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.angra.skill.sc-angra-3")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.angra-bites");
  assert.equal(skill.requiresEightMana, false);
  assert.equal(skill.drawCount, 2);
  assert.equal(skill.manaGain, 4);
});

test("skills-013 少女贞洁按同战场本回合打出攻击的魔力消耗合计增加威力", () => {
  const skillId = "servant.frank.skill.sc-frank-2";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "少女贞洁",
    ownerType: "servant",
    ownerId: "servant.frank",
    activation: "phase",
    windows: ["combat"],
    cost: 5,
    text: "【真名解放】战斗阶段：你的合计威力+X。X为你所处战场上所有玩家本回合打出的所有攻击的魔力消耗之和。",
    supportLevel: "FULL",
    handlerId: "core.combat-power-from-battlefield-played-costs",
    requiresActiveCard: true,
    combatPowerBonusFromBattlefieldPlayedCosts: true,
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "frank-maiden",
    players: [{ id: "frank", name: "弗兰" }, { id: "opp", name: "对手" }, { id: "away", name: "旁观" }],
    seed: 13,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "frank";
  state.players.frank.servantId = "servant.frank";
  state.players.frank.locationId = "mountain";
  state.players.opp.locationId = "mountain";
  state.players.away.locationId = "city";
  state.board.locations.mountain = ["frank", "opp"];
  state.board.locations.city = ["away"];
  createOwnedCardInstance(state, "frank", {
    instanceId: "maiden-card",
    definitionId: skillId,
    zone: "attack",
    face: "up",
    active: true,
  });
  state.cards["maiden-card"].playedRound = 5;
  state.cards["maiden-card"].paidCost = 5;
  createOwnedCardInstance(state, "frank", { instanceId: "own-current", definitionId: "card.strength", zone: "attack", face: "up", active: true });
  state.cards["own-current"].playedRound = 5;
  state.cards["own-current"].paidCost = 2;
  createOwnedCardInstance(state, "opp", { instanceId: "opp-current", definitionId: "card.noble", zone: "attack", face: "up", active: true });
  state.cards["opp-current"].playedRound = 5;
  state.cards["opp-current"].paidCost = 3;
  createOwnedCardInstance(state, "opp", { instanceId: "opp-old", definitionId: "card.noble", zone: "attack", face: "up", active: true });
  state.cards["opp-old"].playedRound = 4;
  state.cards["opp-old"].paidCost = 10;
  createOwnedCardInstance(state, "away", { instanceId: "away-current", definitionId: "card.noble", zone: "attack", face: "up", active: true });
  state.cards["away-current"].playedRound = 5;
  state.cards["away-current"].paidCost = 7;

  const result = engine.execute(state, makeCommand(state, "use-frank-maiden", "frank", skillId));

  assert.equal(result.state.players.frank.flags.roundPowerBonus, 10);
});

test("skills-013 少女贞洁内容达到FULL并绑定本战场费用求和处理器", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.frank");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.frank.skill.sc-frank-2")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.combat-power-from-battlefield-played-costs");
  assert.equal(skill.combatPowerBonusFromBattlefieldPlayedCosts, true);
  assert.equal(skill.requiresActiveCard, true);
});

test("skills-013 反叛按本回合使用令咒或裁决者令咒的交战对手数获得公式威力", () => {
  const skillId = "servant.spartacus.skill.sc-spartacus-1";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "反叛",
    ownerType: "servant",
    ownerId: "servant.spartacus",
    activation: "phase",
    windows: ["combat"],
    cost: 4,
    text: "【真名解放】发起叛逆-战斗阶段：每有一名于本回合使用了令咒或【裁决者令咒】的交战对手，你获得（6-2X）合计威力。X为你拥有的令咒数量。",
    supportLevel: "FULL",
    handlerId: "core.combat-power-from-command-seal-users",
    requiresActiveCard: true,
    combatPowerBonusPerCommandSealUser: { base: 6, ownCommandSealMultiplier: -2, includeRulerCommandSeals: true },
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "spartacus-rebellion",
    players: [
      { id: "spartacus", name: "斯巴达克斯" },
      { id: "seal", name: "令咒对手" },
      { id: "ruler", name: "裁决者令咒对手" },
      { id: "old", name: "旧回合" },
      { id: "away", name: "异地" },
    ],
    seed: 13,
  });
  state.status = "playing";
  state.round = 6;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "spartacus";
  state.players.spartacus.servantId = "servant.spartacus";
  state.players.spartacus.commandSeals = 1;
  state.players.spartacus.locationId = "city";
  for (const id of ["seal", "ruler", "old"]) state.players[id].locationId = "city";
  state.players.away.locationId = "mountain";
  state.board.locations.city = ["spartacus", "seal", "ruler", "old"];
  state.board.locations.mountain = ["away"];
  state.players.seal.flags.commandSealUsedRound = 6;
  state.players.ruler.flags.rulerCommandSealUsedRound = 6;
  state.players.old.flags.commandSealUsedRound = 5;
  state.players.away.flags.commandSealUsedRound = 6;
  createOwnedCardInstance(state, "spartacus", {
    instanceId: "rebellion-card",
    definitionId: skillId,
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "use-spartacus-rebellion", "spartacus", skillId));

  assert.equal(result.state.players.spartacus.flags.roundPowerBonus, 8);
});

test("skills-013 反叛在没有本回合使用令咒的交战对手时不可用", () => {
  const skillId = "servant.spartacus.skill.sc-spartacus-1";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "反叛",
    ownerType: "servant",
    ownerId: "servant.spartacus",
    activation: "phase",
    windows: ["combat"],
    cost: 4,
    text: "【真名解放】发起叛逆-战斗阶段：每有一名于本回合使用了令咒或【裁决者令咒】的交战对手，你获得（6-2X）合计威力。X为你拥有的令咒数量。",
    supportLevel: "FULL",
    handlerId: "core.combat-power-from-command-seal-users",
    requiresActiveCard: true,
    combatPowerBonusPerCommandSealUser: { base: 6, ownCommandSealMultiplier: -2, includeRulerCommandSeals: true },
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "spartacus-rebellion-empty",
    players: [{ id: "spartacus", name: "斯巴达克斯" }, { id: "opp", name: "对手" }],
    seed: 13,
  });
  state.status = "playing";
  state.round = 6;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "spartacus";
  state.players.spartacus.servantId = "servant.spartacus";
  state.players.spartacus.locationId = "city";
  state.players.opp.locationId = "city";
  state.board.locations.city = ["spartacus", "opp"];
  createOwnedCardInstance(state, "spartacus", {
    instanceId: "rebellion-card",
    definitionId: skillId,
    zone: "attack",
    face: "up",
    active: true,
  });

  assert.equal(registry.getLegalActions(state, "spartacus", cardDefinitions).some((action) => action.payload?.skillId === skillId), false);
  assert.throws(() => engine.execute(state, makeCommand(state, "blocked-spartacus-rebellion", "spartacus", skillId)), /SKILL_USE_FORBIDDEN/);
});

test("skills-013 反叛内容达到FULL并登记令咒使用者公式", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.spartacus");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.spartacus.skill.sc-spartacus-1")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.combat-power-from-command-seal-users");
  assert.deepEqual(skill.combatPowerBonusPerCommandSealUser, { base: 6, ownCommandSealMultiplier: -2, includeRulerCommandSeals: true });
  assert.equal(skill.requiresActiveCard, true);
});

test("skills-013 弑君者惩罚高战果战斗参与者并在第一名对手交战时奖励自己", () => {
  const skillId = "servant.sanson.skill.sc-sanson-3";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "弑君者",
    ownerType: "servant",
    ownerId: "servant.sanson",
    activation: "phase",
    windows: ["combat"],
    cost: 3,
    text: "战斗阶段：在你进行的战斗中所有拥有战果超过当前剩余玩家数一半（向上取整）的玩家合计威力-3。若战果排名第一的玩家与你进行战斗，你的合计威力+3。",
    supportLevel: "FULL",
    handlerId: "core.high-victory-combat-power",
    requiresActiveCard: true,
    highVictoryCombatPowerRule: { penalty: -3, selfBonusIfTopOpponentEngaged: 3 },
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "sanson-regicide",
    players: [
      { id: "sanson", name: "桑松" },
      { id: "top", name: "第一名" },
      { id: "high", name: "高战果" },
      { id: "low", name: "低战果" },
      { id: "away", name: "异地" },
    ],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "sanson";
  state.players.sanson.servantId = "servant.sanson";
  state.players.sanson.victoryPoints = 1;
  state.players.top.victoryPoints = 5;
  state.players.high.victoryPoints = 4;
  state.players.low.victoryPoints = 3;
  state.players.away.victoryPoints = 2;
  for (const id of ["sanson", "top", "high", "low"]) state.players[id].locationId = "mountain";
  state.players.away.locationId = "city";
  state.board.locations.mountain = ["sanson", "top", "high", "low"];
  state.board.locations.city = ["away"];
  createOwnedCardInstance(state, "sanson", {
    instanceId: "regicide-card",
    definitionId: skillId,
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "use-sanson-regicide", "sanson", skillId));

  assert.equal(result.state.players.sanson.flags.roundPowerBonus, 3);
  assert.equal(result.state.players.top.flags.roundPowerBonus, -3);
  assert.equal(result.state.players.high.flags.roundPowerBonus, -3);
  assert.equal(result.state.players.low.flags.roundPowerBonus, undefined);
  assert.equal(result.state.players.away.flags.roundPowerBonus, undefined);
});

test("skills-013 弑君者内容达到FULL并登记高战果阈值规则", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.sanson");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.sanson.skill.sc-sanson-3")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.high-victory-combat-power");
  assert.deepEqual(skill.highVictoryCombatPowerRule, { penalty: -3, selfBonusIfTopOpponentEngaged: 3 });
  assert.equal(skill.requiresActiveCard, true);
});

test("skills-013 伽伐尼电池按交战对手1费以上激活攻击给予魔力和合计威力", () => {
  const skillId = "servant.edison.skill.sc-edison-1";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "伽伐尼电池",
    ownerType: "servant",
    ownerId: "servant.edison",
    activation: "phase",
    windows: ["combat"],
    cost: 2,
    text: "你拥有的魔力少于8点也可使用此牌。\n战斗阶段：与你进行交战的对手每有一张1或更高的魔力消耗的攻击，便获得1点魔力且合计威力+2。",
    supportLevel: "FULL",
    handlerId: "core.opponent-bonus-per-costly-attack",
    requiresActiveCard: true,
    requiresEightMana: false,
    opponentBonusPerCostlyAttack: { minPaidCost: 1, mana: 1, combatPower: 2 },
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "edison-galvani",
    players: [{ id: "edison", name: "爱迪生" }, { id: "opp", name: "对手" }, { id: "away", name: "旁观" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "edison";
  state.players.edison.servantId = "servant.edison";
  state.players.edison.locationId = "city";
  state.players.opp.locationId = "city";
  state.players.away.locationId = "mountain";
  state.players.opp.mana = 2;
  state.players.away.mana = 2;
  state.board.locations.city = ["edison", "opp"];
  state.board.locations.mountain = ["away"];
  createOwnedCardInstance(state, "edison", { instanceId: "galvani-card", definitionId: skillId, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "opp", { instanceId: "opp-costly", definitionId: "card.costly", zone: "attack", face: "up", active: true });
  // Official wording checks the attack's mana cost, not how much was actually paid to put it into play.
  state.cards["opp-costly"].paidCost = 0;
  createOwnedCardInstance(state, "opp", { instanceId: "opp-free", definitionId: "card.strength", zone: "attack", face: "up", active: true });
  state.cards["opp-free"].paidCost = 0;
  createOwnedCardInstance(state, "opp", { instanceId: "opp-hidden", definitionId: "card.noble", zone: "attack", face: "down", active: false });
  state.cards["opp-hidden"].paidCost = 3;
  createOwnedCardInstance(state, "away", { instanceId: "away-costly", definitionId: "card.costly", zone: "attack", face: "up", active: true });
  state.cards["away-costly"].paidCost = 0;

  const result = engine.execute(state, makeCommand(state, "use-edison-galvani", "edison", skillId));

  assert.equal(result.state.players.opp.mana, 3);
  assert.equal(result.state.players.opp.flags.roundPowerBonus, 2);
  assert.equal(result.state.players.away.mana, 2);
  assert.equal(result.state.players.away.flags.roundPowerBonus, undefined);
  assert.equal(result.state.players.edison.flags.roundPowerBonus, undefined);
});

test("skills-013 伽伐尼电池没有1费以上交战对手攻击时不可用", () => {
  const skillId = "servant.edison.skill.sc-edison-1";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "伽伐尼电池",
    ownerType: "servant",
    ownerId: "servant.edison",
    activation: "phase",
    windows: ["combat"],
    cost: 2,
    text: "你拥有的魔力少于8点也可使用此牌。\n战斗阶段：与你进行交战的对手每有一张1或更高的魔力消耗的攻击，便获得1点魔力且合计威力+2。",
    supportLevel: "FULL",
    handlerId: "core.opponent-bonus-per-costly-attack",
    requiresActiveCard: true,
    requiresEightMana: false,
    opponentBonusPerCostlyAttack: { minPaidCost: 1, mana: 1, combatPower: 2 },
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "edison-galvani-empty",
    players: [{ id: "edison", name: "爱迪生" }, { id: "opp", name: "对手" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "edison";
  state.players.edison.servantId = "servant.edison";
  state.players.edison.locationId = "city";
  state.players.opp.locationId = "city";
  state.board.locations.city = ["edison", "opp"];
  createOwnedCardInstance(state, "edison", { instanceId: "galvani-card", definitionId: skillId, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "opp", { instanceId: "opp-free", definitionId: "card.strength", zone: "attack", face: "up", active: true });
  state.cards["opp-free"].paidCost = 0;

  assert.equal(registry.getLegalActions(state, "edison", cardDefinitions).some((action) => action.payload?.skillId === skillId), false);
  assert.throws(() => engine.execute(state, makeCommand(state, "blocked-edison-galvani", "edison", skillId)), /SKILL_USE_FORBIDDEN/);
});

test("skills-013 伽伐尼电池内容达到FULL并保留低魔力使用例外", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.edison");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.edison.skill.sc-edison-1")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.opponent-bonus-per-costly-attack");
  assert.equal(skill.requiresEightMana, false);
  assert.deepEqual(skill.opponentBonusPerCostlyAttack, { minPaidCost: 1, mana: 1, combatPower: 2 });
  assert.equal(skill.requiresActiveCard, true);
});

test("skills-013 雪花之壁降低未被守护同战场对手每张攻击威力", () => {
  const skillId = "servant.mash.skill.sc-mash-2";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "雪花之壁",
    ownerType: "servant",
    ownerId: "servant.mash",
    activation: "phase",
    windows: ["combat"],
    cost: 7,
    text: "战斗阶段：将与你战斗的除了你给予【守护】的对手，每张攻击威力-3。如果你已经【真名解放】则改为-4。",
    supportLevel: "FULL",
    handlerId: "core.opponent-attack-power-modifier",
    requiresActiveCard: true,
    opponentAttackPowerModifier: { hiddenTrueNameAmount: -3, revealedTrueNameAmount: -4, excludeGuardedByOwner: true },
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "mash-snowflake",
    players: [{ id: "mash", name: "玛修" }, { id: "opp", name: "对手" }, { id: "guarded", name: "守护对象" }, { id: "away", name: "旁观" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "mash";
  state.players.mash.servantId = "servant.mash";
  state.players.mash.locationId = "city";
  state.players.opp.locationId = "city";
  state.players.guarded.locationId = "city";
  state.players.away.locationId = "mountain";
  state.board.locations.city = ["mash", "opp", "guarded"];
  state.board.locations.mountain = ["away"];
  createOwnedCardInstance(state, "mash", { instanceId: "snowflake-card", definitionId: skillId, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "mash", { instanceId: "guard-link", definitionId: "card.x-guard", zone: "attack", face: "up", active: true });
  state.players.mash.attack = state.players.mash.attack.filter((id) => id !== "guard-link");
  state.players.guarded.attack.push("guard-link");
  state.cards["guard-link"].controllerPlayerId = "guarded";
  createOwnedCardInstance(state, "opp", { instanceId: "opp-attack-a", definitionId: "card.noble", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "opp", { instanceId: "opp-attack-b", definitionId: "card.strength", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "guarded", { instanceId: "guarded-attack", definitionId: "card.noble", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "away", { instanceId: "away-attack", definitionId: "card.noble", zone: "attack", face: "up", active: true });

  const result = engine.execute(state, makeCommand(state, "use-mash-snowflake", "mash", skillId));

  assert.equal(result.state.cards["opp-attack-a"].powerModifiers?.at(-1)?.value, -3);
  assert.equal(result.state.cards["opp-attack-b"].powerModifiers?.at(-1)?.value, -3);
  assert.equal(result.state.cards["guarded-attack"].powerModifiers, undefined);
  assert.equal(result.state.cards["away-attack"].powerModifiers, undefined);
});

test("skills-013 雪花之壁真名公开后改为每张攻击威力-4", () => {
  const skillId = "servant.mash.skill.sc-mash-2";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "雪花之壁",
    ownerType: "servant",
    ownerId: "servant.mash",
    activation: "phase",
    windows: ["combat"],
    cost: 7,
    text: "战斗阶段：将与你战斗的除了你给予【守护】的对手，每张攻击威力-3。如果你已经【真名解放】则改为-4。",
    supportLevel: "FULL",
    handlerId: "core.opponent-attack-power-modifier",
    requiresActiveCard: true,
    opponentAttackPowerModifier: { hiddenTrueNameAmount: -3, revealedTrueNameAmount: -4, excludeGuardedByOwner: true },
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "mash-snowflake-revealed",
    players: [{ id: "mash", name: "玛修" }, { id: "opp", name: "对手" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "mash";
  state.players.mash.servantId = "servant.mash";
  state.players.mash.trueNameRevealed = true;
  state.players.mash.locationId = "city";
  state.players.opp.locationId = "city";
  state.board.locations.city = ["mash", "opp"];
  createOwnedCardInstance(state, "mash", { instanceId: "snowflake-card", definitionId: skillId, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "opp", { instanceId: "opp-attack", definitionId: "card.noble", zone: "attack", face: "up", active: true });

  const result = engine.execute(state, makeCommand(state, "use-mash-snowflake-revealed", "mash", skillId));

  assert.equal(result.state.cards["opp-attack"].powerModifiers?.at(-1)?.value, -4);
});

test("skills-013 雪花之壁没有可修正对手攻击时不可用", () => {
  const skillId = "servant.mash.skill.sc-mash-2";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "雪花之壁",
    ownerType: "servant",
    ownerId: "servant.mash",
    activation: "phase",
    windows: ["combat"],
    cost: 7,
    text: "战斗阶段：将与你战斗的除了你给予【守护】的对手，每张攻击威力-3。如果你已经【真名解放】则改为-4。",
    supportLevel: "FULL",
    handlerId: "core.opponent-attack-power-modifier",
    requiresActiveCard: true,
    opponentAttackPowerModifier: { hiddenTrueNameAmount: -3, revealedTrueNameAmount: -4, excludeGuardedByOwner: true },
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  const state = createGameState({
    gameInstanceId: "mash-snowflake-empty",
    players: [{ id: "mash", name: "玛修" }, { id: "guarded", name: "守护对象" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "mash";
  state.players.mash.servantId = "servant.mash";
  state.players.mash.locationId = "city";
  state.players.guarded.locationId = "city";
  state.board.locations.city = ["mash", "guarded"];
  createOwnedCardInstance(state, "mash", { instanceId: "snowflake-card", definitionId: skillId, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "mash", { instanceId: "guard-link", definitionId: "card.x-guard", zone: "attack", face: "up", active: true });
  state.players.mash.attack = state.players.mash.attack.filter((id) => id !== "guard-link");
  state.players.guarded.attack.push("guard-link");
  state.cards["guard-link"].controllerPlayerId = "guarded";
  createOwnedCardInstance(state, "guarded", { instanceId: "guarded-attack", definitionId: "card.noble", zone: "attack", face: "up", active: true });

  assert.equal(registry.getLegalActions(state, "mash", cardDefinitions).some((action) => action.payload?.skillId === skillId), false);
  assert.throws(() => engine.execute(state, makeCommand(state, "blocked-mash-snowflake", "mash", skillId)), /SKILL_USE_FORBIDDEN/);
});

test("skills-013 雪花之壁内容达到FULL并登记真名公开修正差异", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.mash");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.mash.skill.sc-mash-2")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.opponent-attack-power-modifier");
  assert.deepEqual(skill.opponentAttackPowerModifier, { hiddenTrueNameAmount: -3, revealedTrueNameAmount: -4, excludeGuardedByOwner: true });
  assert.equal(skill.requiresActiveCard, true);
});

function registerIvanBlackDog() {
  const skillId = "servant.ivan.skill.sc-ivan-1";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "于吾梦路 潜行而出之黑犬",
    ownerType: "servant",
    ownerId: "servant.ivan",
    activation: "phase",
    windows: ["action"],
    cost: 1,
    text: "【真名解放】\n行动阶段：选择下列一项：\n沙皇之眼-获得2点战果。\n沙皇之律-从一名玩家处偷取1点魔力。\n沙皇之怒-你的攻击获得+1威力。",
    supportLevel: "FULL",
    handlerId: "core.ivan-black-dog",
    requiresActiveCard: true,
    abilities: [
      { id: "tsar-eye", name: "沙皇之眼", activation: "phase", windows: ["action"], requiresActiveCard: true },
      { id: "tsar-law", name: "沙皇之律", activation: "phase", windows: ["action"], requiresActiveCard: true },
      { id: "tsar-wrath", name: "沙皇之怒", activation: "phase", windows: ["action"], requiresActiveCard: true },
    ],
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  return { engine, registry, skillId };
}

function setupIvanState(gameInstanceId) {
  const state = createGameState({
    gameInstanceId,
    players: [{ id: "ivan", name: "伊凡" }, { id: "target", name: "目标" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "ivan";
  state.players.ivan.servantId = "servant.ivan";
  createOwnedCardInstance(state, "ivan", {
    instanceId: "black-dog-card",
    definitionId: "servant.ivan.skill.sc-ivan-1",
    zone: "attack",
    face: "up",
    active: true,
  });
  return state;
}

test("skills-013 黑犬沙皇之眼获得2点战果", () => {
  const { engine, skillId } = registerIvanBlackDog();
  const state = setupIvanState("ivan-black-dog-eye");

  const result = engine.execute(state, makeCommand(state, "use-ivan-eye", "ivan", skillId, { abilityId: "tsar-eye" }));

  assert.equal(result.state.players.ivan.victoryPoints, 2);
});

test("skills-013 黑犬沙皇之律从其他玩家偷取1点魔力", () => {
  const { engine, skillId } = registerIvanBlackDog();
  const state = setupIvanState("ivan-black-dog-law");
  state.players.ivan.mana = 1;
  state.players.target.mana = 3;

  const result = engine.execute(state, makeCommand(state, "use-ivan-law", "ivan", skillId, { abilityId: "tsar-law", targetPlayerId: "target" }));

  assert.equal(result.state.players.ivan.mana, 2);
  assert.equal(result.state.players.target.mana, 2);
});

test("skills-013 黑犬沙皇之怒令自己的激活攻击获得1威力", () => {
  const { engine, skillId } = registerIvanBlackDog();
  const state = setupIvanState("ivan-black-dog-wrath");
  createOwnedCardInstance(state, "ivan", {
    instanceId: "other-attack",
    definitionId: "card.strength",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "use-ivan-wrath", "ivan", skillId, { abilityId: "tsar-wrath" }));

  assert.equal(result.state.cards["black-dog-card"].powerModifiers?.at(-1)?.value, 1);
  assert.equal(result.state.cards["other-attack"].powerModifiers?.at(-1)?.value, 1);
});

test("skills-013 黑犬沙皇之律没有可偷取魔力目标时不可用", () => {
  const { engine, registry, skillId } = registerIvanBlackDog();
  const state = setupIvanState("ivan-black-dog-law-empty");
  state.players.target.mana = 0;

  const lawAction = registry.getLegalActions(state, "ivan", cardDefinitions).find((action) => action.payload?.data?.abilityId === "tsar-law");
  assert.equal(lawAction, undefined);
  assert.throws(() => engine.execute(state, makeCommand(state, "blocked-ivan-law", "ivan", skillId, { abilityId: "tsar-law", targetPlayerId: "target" })), /SKILL_USE_FORBIDDEN/);
});

test("skills-013 黑犬内容拆分三项行动能力并达到FULL", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.ivan");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.ivan.skill.sc-ivan-1")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.ivan-black-dog");
  assert.deepEqual(skill.abilities.map((ability) => ability.id), ["tsar-eye", "tsar-law", "tsar-wrath"]);
  assert.equal(skill.requiresActiveCard, true);
});

function registerMhxNamelessVictorySword() {
  const skillId = "servant.mhx.skill.sc-mhx-2";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "无铭胜利剑",
    ownerType: "servant",
    ownerId: "servant.mhx",
    activation: "phase",
    windows: ["action", "combat"],
    cost: 3,
    basePower: 6,
    typeLabel: "力量/宝具",
    attributes: ["力量", "宝具"],
    text: "【真名解放】\n银河流星剑-行动阶段：花费4点魔力，此牌+4威力。\n宇宙反应器-战斗阶段：每有一张因局势牌入场的事件牌，此牌+3威力。",
    supportLevel: "FULL",
    handlerId: "core.mhx-nameless-victory-sword",
    requiresActiveCard: true,
    eventCardPowerBonus: { perEvent: 3 },
    abilities: [
      { id: "galaxy-meteor-sword", name: "银河流星剑", activation: "phase", windows: ["action"], abilityCost: 4, requiresActiveCard: true },
      { id: "cosmic-reactor", name: "宇宙反应器", activation: "phase", windows: ["combat"], requiresActiveCard: true },
    ],
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  return { engine, registry, skillId };
}

function setupMhxState(gameInstanceId, phase = "action") {
  const state = createGameState({
    gameInstanceId,
    players: [{ id: "mhx", name: "谜之女主角X" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = phase;
  state.step = "player-window";
  state.activePlayerId = "mhx";
  state.players.mhx.servantId = "servant.mhx";
  state.players.mhx.mana = 8;
  createOwnedCardInstance(state, "mhx", {
    instanceId: "nameless-victory-sword",
    definitionId: "servant.mhx.skill.sc-mhx-2",
    zone: "attack",
    face: "up",
    active: true,
  });
  return state;
}

test("skills-013 无铭胜利剑银河流星剑支付4魔力并永久强化此牌4威力", () => {
  const { engine, skillId } = registerMhxNamelessVictorySword();
  const state = setupMhxState("mhx-galaxy-meteor", "action");

  const result = engine.execute(state, makeCommand(state, "use-mhx-galaxy", "mhx", skillId, { abilityId: "galaxy-meteor-sword" }));

  assert.equal(result.state.players.mhx.mana, 4);
  assert.equal(result.state.cards["nameless-victory-sword"].powerModifiers?.at(-1)?.value, 4);
  assert.equal(result.state.cards["nameless-victory-sword"].powerModifiers?.at(-1)?.duration, "game");
});

test("skills-013 无铭胜利剑宇宙反应器按当前事件牌数量强化此牌", () => {
  const { engine, skillId } = registerMhxNamelessVictorySword();
  const state = setupMhxState("mhx-cosmic-reactor", "combat");
  state.board.currentEvents = { mountain: ["event.mountain-a", "event.mountain-b"], city: ["event.city"] };
  state.board.eventVisibility = { "event.mountain-a": "up", "event.mountain-b": "down", "event.city": "up" };

  const result = engine.execute(state, makeCommand(state, "use-mhx-cosmic", "mhx", skillId, { abilityId: "cosmic-reactor" }));

  assert.equal(result.state.cards["nameless-victory-sword"].powerModifiers?.at(-1)?.value, 9);
  assert.equal(result.state.cards["nameless-victory-sword"].powerModifiers?.at(-1)?.duration, "round");
});

test("skills-013 无铭胜利剑宇宙反应器没有当前事件牌时不可用", () => {
  const { engine, registry, skillId } = registerMhxNamelessVictorySword();
  const state = setupMhxState("mhx-cosmic-empty", "combat");
  state.board.currentEvents = { mountain: [], city: [] };

  const action = registry.getLegalActions(state, "mhx", cardDefinitions).find((item) => item.payload?.data?.abilityId === "cosmic-reactor");
  assert.equal(action, undefined);
  assert.throws(() => engine.execute(state, makeCommand(state, "blocked-mhx-cosmic", "mhx", skillId, { abilityId: "cosmic-reactor" })), /SKILL_USE_FORBIDDEN/);
});

test("skills-013 无铭胜利剑内容拆分两个阶段小能力并达到FULL", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.mhx");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.mhx.skill.sc-mhx-2")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.mhx-nameless-victory-sword");
  assert.deepEqual(skill.abilities.map((ability) => ability.id), ["galaxy-meteor-sword", "cosmic-reactor"]);
  assert.deepEqual(skill.eventCardPowerBonus, { perEvent: 3 });
  assert.equal(skill.requiresActiveCard, true);
});

function registerAndersenInnocentMonster() {
  const skillId = "servant.andersen.skill.sc-andersen-3";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "无辜的怪物",
    ownerType: "servant",
    ownerId: "servant.andersen",
    activation: "phase",
    windows: ["outpost", "action"],
    cost: 0,
    basePower: 2,
    typeLabel: "魔术",
    attributes: ["魔术"],
    text: "【真名解放】\n被动/前哨阶段：花费1点魔力，选择一名对手。若其本回合战败，你获得2点战果。\n行动阶段：花费至多12点魔力。选择一名玩家获得同等数量的合计威力。",
    supportLevel: "FULL",
    handlerId: "core.andersen-innocent-monster",
    passiveEventTypes: ["combat.resolved", "round.ended"],
    requiresActiveCard: true,
    markedDefeatVictoryPointReward: 2,
    variableManaPowerBonusMax: 12,
    abilities: [
      { id: "innocent-mark", name: "无辜标记", activation: "phase", windows: ["outpost"], abilityCost: 1, requiresActiveCard: true },
      { id: "monster-power", name: "怪物强化", activation: "phase", windows: ["action"], requiresActiveCard: true },
    ],
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  return { engine, registry, skillId };
}

function setupAndersenState(gameInstanceId, phase = "outpost") {
  const state = createGameState({
    gameInstanceId,
    players: [{ id: "andersen", name: "安徒生" }, { id: "target", name: "目标" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = phase;
  state.step = "player-window";
  state.activePlayerId = "andersen";
  state.players.andersen.servantId = "servant.andersen";
  state.players.andersen.mana = 6;
  createOwnedCardInstance(state, "andersen", {
    instanceId: "innocent-monster-card",
    definitionId: "servant.andersen.skill.sc-andersen-3",
    zone: "attack",
    face: "up",
    active: true,
  });
  return state;
}

test("skills-013 无辜的怪物前哨标记对手并在其战败时获得2战果", () => {
  const { engine, skillId } = registerAndersenInnocentMonster();
  let state = setupAndersenState("andersen-mark", "outpost");

  state = engine.execute(state, makeCommand(state, "use-andersen-mark", "andersen", skillId, { abilityId: "innocent-mark", targetPlayerId: "target" })).state;

  assert.equal(state.players.andersen.mana, 5);
  assert.equal(state.players.andersen.flags.andersenInnocentMonsterTargetPlayerId, "target");
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = "andersen";
  const result = engine.execute(state, {
    commandId: "andersen-combat-resolved",
    gameInstanceId: state.gameInstanceId,
    actorId: "andersen",
    expectedRevision: state.revision,
    type: CommandType.ResolveCombat,
    payload: { locationId: "mountain" },
  });
  result.state.effectQueue.push({
    effectId: "manual-andersen-passive",
    handlerId: "core.andersen-innocent-monster",
    sourceId: skillId,
    controllerPlayerId: "andersen",
    payload: { eventType: "combat.resolved", event: { powers: { andersen: 7, target: 3 }, winnerIds: ["andersen"] } },
    createdAtRevision: result.state.revision,
  });
  engine.effects.drain(result.state);

  assert.equal(result.state.players.andersen.victoryPoints, 2);
  assert.equal(result.state.players.andersen.flags.andersenInnocentMonsterTargetPlayerId, undefined);
});

test("skills-013 无辜的怪物行动阶段支付至多12魔力给一名玩家同等合计威力", () => {
  const { engine, skillId } = registerAndersenInnocentMonster();
  const state = setupAndersenState("andersen-power", "action");

  const result = engine.execute(state, makeCommand(state, "use-andersen-power", "andersen", skillId, { abilityId: "monster-power", targetPlayerId: "target", amount: 5 }));

  assert.equal(result.state.players.andersen.mana, 1);
  assert.equal(result.state.players.target.flags.roundPowerBonus, 5);
});

test("skills-013 无辜的怪物行动阶段不能支付超过12魔力或现有魔力", () => {
  const { engine, skillId } = registerAndersenInnocentMonster();
  const state = setupAndersenState("andersen-power-invalid", "action");

  assert.throws(() => engine.execute(state, makeCommand(state, "andersen-power-too-high", "andersen", skillId, { abilityId: "monster-power", targetPlayerId: "target", amount: 13 })), /ANDERSEN_POWER_AMOUNT_INVALID/);
  assert.throws(() => engine.execute(state, makeCommand(state, "andersen-power-insufficient", "andersen", skillId, { abilityId: "monster-power", targetPlayerId: "target", amount: 7 })), /INSUFFICIENT_MANA/);
});

test("skills-013 无辜的怪物内容拆分前哨延迟奖励与行动可变支付并达到FULL", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.andersen");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.andersen.skill.sc-andersen-3")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.andersen-innocent-monster");
  assert.deepEqual(skill.abilities.map((ability) => ability.id), ["innocent-mark", "monster-power"]);
  assert.deepEqual(skill.passiveEventTypes, ["combat.resolved", "round.ended"]);
  assert.equal(skill.markedDefeatVictoryPointReward, 2);
  assert.equal(skill.variableManaPowerBonusMax, 12);
});

function registerOkitaHaori() {
  const skillId = "servant.okita.skill.sc-okita-3";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "誓言的羽织",
    ownerType: "servant",
    ownerId: "servant.okita",
    activation: "phase",
    windows: ["outpost"],
    cost: 0,
    text: "被动/前哨阶段：公开手牌直至本回合结束，你的合计威力+3且在战斗阶段开始时抽1张牌。",
    supportLevel: "FULL",
    handlerId: "core.okita-haori",
    passiveEventTypes: ["phase.transitioned", "round.ended"],
    requiresActiveCard: false,
    combatPowerBonus: 3,
    revealHandUntilRoundEnd: true,
    combatStartDrawCount: 1,
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  return { engine, registry, skillId };
}

function setupOkitaState(gameInstanceId) {
  const state = createGameState({
    gameInstanceId,
    players: [{ id: "okita", name: "冲田" }],
    seed: 13,
  });
  state.status = "playing";
  state.round = 2;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "okita";
  state.players.okita.servantId = "servant.okita";
  createOwnedCardInstance(state, "okita", { instanceId: "draw-card", definitionId: "card.filler", zone: "deck", face: "down", active: false });
  return state;
}

test("skills-013 誓言的羽织公开手牌到回合结束并获得3合计威力", () => {
  const { engine, skillId } = registerOkitaHaori();
  const state = setupOkitaState("okita-haori-use");

  const result = engine.execute(state, makeCommand(state, "use-okita-haori", "okita", skillId));

  assert.equal(result.state.players.okita.flags.roundPowerBonus, 3);
  assert.equal(result.state.players.okita.flags.handRevealedUntilRound, 2);
  assert.equal(result.state.players.okita.flags.okitaHaoriRound, 2);
});

test("skills-013 誓言的羽织进入战斗阶段时抽1张并清理回合公开标记", () => {
  const { engine, skillId } = registerOkitaHaori();
  const state = setupOkitaState("okita-haori-draw");
  let result = engine.execute(state, makeCommand(state, "use-okita-haori-draw", "okita", skillId));
  result.state.phase = "combat";
  result.state.effectQueue.push({
    effectId: "okita-combat-start",
    handlerId: "core.okita-haori",
    sourceId: skillId,
    controllerPlayerId: "okita",
    payload: { eventType: "phase.transitioned", event: { previousPhase: "action", transition: "next-phase" } },
    createdAtRevision: result.state.revision,
  });
  engine.effects.drain(result.state);

  assert.deepEqual(result.state.players.okita.hand, ["draw-card"]);
  assert.equal(result.state.players.okita.flags.okitaHaoriCombatDrawPending, undefined);

  result.state.effectQueue.push({
    effectId: "okita-round-end",
    handlerId: "core.okita-haori",
    sourceId: skillId,
    controllerPlayerId: "okita",
    payload: { eventType: "round.ended", event: { round: 2 } },
    createdAtRevision: result.state.revision,
  });
  engine.effects.drain(result.state);
  assert.equal(result.state.players.okita.flags.handRevealedUntilRound, undefined);
  assert.equal(result.state.players.okita.flags.okitaHaoriRound, undefined);
});

test("skills-013 誓言的羽织内容达到FULL并登记公开手牌和战斗开始抽牌", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.okita");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.okita.skill.sc-okita-3")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.okita-haori");
  assert.deepEqual(skill.passiveEventTypes, ["phase.transitioned", "round.ended"]);
  assert.equal(skill.requiresActiveCard, false);
  assert.equal(skill.combatPowerBonus, 3);
  assert.equal(skill.revealHandUntilRoundEnd, true);
  assert.equal(skill.combatStartDrawCount, 1);
});

function registerSiegfriedBalmung() {
  const skillId = "servant.siegfried.skill.sc-siegfried-3";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "幻想大剑·天魔失坠",
    ownerType: "servant",
    ownerId: "servant.siegfried",
    activation: "phase",
    windows: ["action"],
    cost: 7,
    basePower: 7,
    typeLabel: "力量/宝具",
    attributes: ["力量", "宝具"],
    text: "【真名解放】\n行动阶段：展示你的手牌。其中每有一张威力不低于4的牌，合计威力+2（最大为6）",
    supportLevel: "FULL",
    handlerId: "core.reveal-hand-power-bonus",
    requiresActiveCard: true,
    revealHandPowerBonus: { minBasePower: 4, perCard: 2, max: 6 },
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  return { engine, registry, skillId };
}

test("skills-013 幻想大剑展示手牌并按威力不低于4的手牌获得至多6合计威力", () => {
  const { engine, skillId } = registerSiegfriedBalmung();
  const state = createGameState({
    gameInstanceId: "siegfried-balmung",
    players: [{ id: "siegfried", name: "齐格飞" }],
    seed: 13,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "siegfried";
  state.players.siegfried.servantId = "servant.siegfried";
  createOwnedCardInstance(state, "siegfried", { instanceId: "balmung-card", definitionId: skillId, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "siegfried", { instanceId: "hand-a", definitionId: "card.strength", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "siegfried", { instanceId: "hand-b", definitionId: "card.noble", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "siegfried", { instanceId: "hand-c", definitionId: "card.magic", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "siegfried", { instanceId: "hand-low", definitionId: "card.filler", zone: "hand", face: "down", active: false });

  const result = engine.execute(state, makeCommand(state, "use-siegfried-balmung", "siegfried", skillId));

  assert.equal(result.state.players.siegfried.flags.roundPowerBonus, 6);
  assert.equal(result.state.players.siegfried.flags.handRevealedRevision, 0);
});

test("skills-013 幻想大剑内容达到FULL并登记展示手牌威力统计规则", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.siegfried");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.siegfried.skill.sc-siegfried-3")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.reveal-hand-power-bonus");
  assert.deepEqual(skill.revealHandPowerBonus, { minBasePower: 4, perCard: 2, max: 6 });
  assert.equal(skill.requiresActiveCard, true);
});

function registerGawainGalatine() {
  const skillId = "servant.gawain.skill.sc-gawain-1";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "轮转胜利之剑",
    ownerType: "servant",
    ownerId: "servant.gawain",
    activation: "phase",
    windows: ["outpost"],
    cost: 9,
    basePower: 9,
    typeLabel: "力量/宝具",
    attributes: ["力量", "宝具"],
    text: "【真名解放】\n被动/前哨阶段：如果你位于战场上，获得3点魔力且总威力+3。若你在本回合结束前没有打出【轮转胜利之剑】，失去所有魔力。",
    supportLevel: "FULL",
    handlerId: "core.gawain-galatine",
    passiveEventTypes: ["card.played", "round.ended"],
    requiresActiveCard: false,
    requiresBattlefieldLocation: true,
    manaGain: 3,
    combatPowerBonus: 3,
    roundEndLoseAllManaUnlessPlayedSelf: true,
  });
  registerCoreSkillHandlers(registry);
  const engine = new StandardMatchEngine({
    cards: cardDefinitions,
    situations: [],
    events: [],
    playerDecks: {},
    skills: registry,
  });
  return { engine, registry, skillId };
}

function setupGawainState(gameInstanceId, locationId = "mountain") {
  const state = createGameState({
    gameInstanceId,
    players: [{ id: "gawain", name: "高文" }],
    seed: 13,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "gawain";
  state.players.gawain.servantId = "servant.gawain";
  state.players.gawain.mana = 4;
  state.players.gawain.locationId = locationId;
  if (locationId === "mountain" || locationId === "city") state.board.locations[locationId] = ["gawain"];
  return state;
}

test("skills-013 轮转胜利之剑前哨在战场获得3魔力和3合计威力", () => {
  const { engine, skillId } = registerGawainGalatine();
  const state = setupGawainState("gawain-galatine-use", "mountain");

  const result = engine.execute(state, makeCommand(state, "use-gawain-galatine", "gawain", skillId));

  assert.equal(result.state.players.gawain.mana, 7);
  assert.equal(result.state.players.gawain.flags.roundPowerBonus, 3);
  assert.equal(result.state.players.gawain.flags.gawainGalatineRound, 3);
});

test("skills-013 轮转胜利之剑未在回合结束前打出本牌则失去所有魔力", () => {
  const { engine, skillId } = registerGawainGalatine();
  const state = setupGawainState("gawain-galatine-penalty", "city");
  const result = engine.execute(state, makeCommand(state, "use-gawain-galatine-penalty", "gawain", skillId));
  result.state.effectQueue.push({
    effectId: "gawain-round-end",
    handlerId: "core.gawain-galatine",
    sourceId: skillId,
    controllerPlayerId: "gawain",
    payload: { eventType: "round.ended", event: { round: 3 } },
    createdAtRevision: result.state.revision,
  });
  engine.effects.drain(result.state);

  assert.equal(result.state.players.gawain.mana, 0);
  assert.equal(result.state.players.gawain.flags.gawainGalatineRound, undefined);
});

test("skills-013 轮转胜利之剑本回合已打出本牌则不会清空魔力", () => {
  const { engine, skillId } = registerGawainGalatine();
  const state = setupGawainState("gawain-galatine-played", "mountain");
  const result = engine.execute(state, makeCommand(state, "use-gawain-galatine-played", "gawain", skillId));
  result.state.effectQueue.push({
    effectId: "gawain-card-played",
    handlerId: "core.gawain-galatine",
    sourceId: skillId,
    controllerPlayerId: "gawain",
    payload: { eventType: "card.played", event: { playerId: "gawain", definitionId: skillId } },
    createdAtRevision: result.state.revision,
  });
  result.state.effectQueue.push({
    effectId: "gawain-played-round-end",
    handlerId: "core.gawain-galatine",
    sourceId: skillId,
    controllerPlayerId: "gawain",
    payload: { eventType: "round.ended", event: { round: 3 } },
    createdAtRevision: result.state.revision,
  });
  engine.effects.drain(result.state);

  assert.equal(result.state.players.gawain.mana, 7);
});

test("skills-013 轮转胜利之剑不在战场时不可用", () => {
  const { engine, registry, skillId } = registerGawainGalatine();
  const state = setupGawainState("gawain-galatine-workshop", "workshop");

  assert.equal(registry.getLegalActions(state, "gawain", cardDefinitions).some((action) => action.payload?.skillId === skillId), false);
  assert.throws(() => engine.execute(state, makeCommand(state, "blocked-gawain-galatine", "gawain", skillId)), /SKILL_USE_FORBIDDEN/);
});

test("skills-013 轮转胜利之剑内容达到FULL并登记战场前哨奖励与回合末惩罚", async () => {
  const content = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.gawain");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.gawain.skill.sc-gawain-1")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.gawain-galatine");
  assert.deepEqual(skill.passiveEventTypes, ["card.played", "round.ended"]);
  assert.equal(skill.requiresActiveCard, false);
  assert.equal(skill.requiresBattlefieldLocation, true);
  assert.equal(skill.manaGain, 3);
  assert.equal(skill.combatPowerBonus, 3);
  assert.equal(skill.roundEndLoseAllManaUnlessPlayedSelf, true);
});
