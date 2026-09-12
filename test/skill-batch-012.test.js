import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { SkillRegistry } from "../src/rules-core/skill-registry.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { enqueueScheduledEffects } from "../src/rules-core/scheduled-effects.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers, useRaikouMysteryKiller } from "../src/rules-core/skill-handlers.ts";
import { buildStandardContent } from "../src/content/content-package.ts";

const emptyContent = { cards: {}, situations: [], events: [], playerDecks: {} };

function registerPretenderSkill(id = "servant.hephaistion.skill.sc-hephaistion-2") {
  const registry = new SkillRegistry();
  registry.register({
    id,
    name: "伪装者",
    ownerType: "servant",
    ownerId: "servant.hephaistion",
    activation: "passive",
    windows: [],
    cost: 3,
    requirement: 3,
    basePower: 0,
    typeLabel: "力量/迅捷/魔术",
    text: "被动：当你的从者真名公开时，将此牌加入攻击并获得X点战果。",
    supportLevel: "FULL",
    handlerId: "core.pretender-class",
    passiveEventTypes: ["servant.true-name-revealed"],
  });
  registerCoreSkillHandlers(registry);
  return registry;
}

function skillCommand(state, id, actorId, skillId, data) {
  return {
    commandId: id,
    gameInstanceId: state.gameInstanceId,
    actorId,
    expectedRevision: state.revision,
    type: CommandType.UseSkill,
    payload: { skillId, data },
  };
}

test("skills-012 伪装者在首次真名公开时锁定X、加入攻击并获得X点战果", () => {
  const registry = registerPretenderSkill();
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(registry, passives, effects);
  const state = createGameState({ gameInstanceId: "pretender-class", players: [{ id: "p", name: "伪装者" }], seed: 12 });
  state.status = "playing";
  state.round = 5;
  state.players.p.servantId = "servant.hephaistion";
  createOwnedCardInstance(state, "p", {
    instanceId: "pretender",
    definitionId: "servant.hephaistion.skill.sc-hephaistion-2",
    zone: "servant-skills",
  });

  enqueuePassiveEffects(state, passives, {
    eventId: "reveal-1",
    type: "servant.true-name-revealed",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { playerId: "p", servantId: "servant.hephaistion" },
  });
  effects.drain(state);

  assert.equal(state.players.p.victoryPoints, 5);
  assert.equal(state.players.p.flags["pretenderClassX:servant.hephaistion.skill.sc-hephaistion-2"], 5);
  assert.equal(state.players.p.flags["pretenderClassTriggered:servant.hephaistion.skill.sc-hephaistion-2"], true);
  assert.deepEqual(state.players.p.servantSkills, []);
  assert.deepEqual(state.players.p.attack, ["pretender"]);
  assert.equal(state.cards.pretender.active, true);
  assert.equal(state.cards.pretender.face, "up");
  assert.equal(calculateCombatPower(state, state.players.p, registry.asCardDefinitions(), "mountain"), 5);

  enqueuePassiveEffects(state, passives, {
    eventId: "reveal-duplicate",
    type: "servant.true-name-revealed",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { playerId: "p", servantId: "servant.hephaistion" },
  });
  effects.drain(state);
  assert.equal(state.players.p.victoryPoints, 5);
  assert.deepEqual(state.players.p.attack, ["pretender"]);
});

test("skills-012 三张伪装者同规则技能达到FULL并规范化动态基础威力", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  for (const id of [
    "servant.hephaistion.skill.sc-hephaistion-2",
    "servant.ladyavalon.skill.sc-ladyavalon-2",
    "servant.oberon.skill.sc-oberon-2",
  ]) {
    const definition = built.skills.get(id);
    assert.equal(definition.supportLevel, "FULL", id);
    assert.equal(definition.activation, "passive", id);
    assert.equal(definition.handlerId, "core.pretender-class", id);
    assert.deepEqual(definition.passiveEventTypes, ["servant.true-name-revealed"], id);
    assert.equal(definition.basePower, 0, id);
    assert.equal(built.skills.hasHandler(id), true, id);
  }
});

test("skills-012 空想具现化击败战果更高对手，未交战时额外获得3战果", () => {
  const skillId = "servant.arcueid.skill.sc-arcueid-3";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "空想具现化",
    ownerType: "servant",
    ownerId: "servant.arcueid",
    activation: "phase",
    windows: ["combat"],
    cost: 6,
    requirement: 8,
    text: "",
    supportLevel: "FULL",
    handlerId: "core.arcueid-marble-phantasm",
    requiresActiveCard: true,
  });
  const engine = new StandardMatchEngine({ ...emptyContent, skills: registry });
  const state = createGameState({
    gameInstanceId: "arcueid-marble",
    players: [
      { id: "arc", name: "爱尔奎特" },
      { id: "near", name: "同战场" },
      { id: "far", name: "异战场" },
    ],
    seed: 12,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "arc";
  state.players.arc.servantId = "servant.arcueid";
  state.players.arc.victoryPoints = 2;
  state.players.near.victoryPoints = 5;
  state.players.far.victoryPoints = 6;
  state.players.arc.locationId = "mountain";
  state.players.near.locationId = "mountain";
  state.players.far.locationId = "city";
  state.board.locations.mountain = ["arc", "near"];
  state.board.locations.city = ["far"];
  createOwnedCardInstance(state, "arc", {
    instanceId: "marble",
    definitionId: skillId,
    zone: "attack",
    face: "up",
    active: true,
  });

  const sameBattlefield = engine.execute(state, skillCommand(state, "marble-near", "arc", skillId, { targetPlayerId: "near" }));
  assert.equal(sameBattlefield.state.players.near.defeated, true);
  assert.equal(sameBattlefield.state.players.arc.victoryPoints, 2);

  sameBattlefield.state.players.near.victoryPoints = 1;
  sameBattlefield.state.players.arc.usage[skillId] = undefined;
  const remoteTarget = engine.execute(sameBattlefield.state, skillCommand(sameBattlefield.state, "marble-far", "arc", skillId, { targetPlayerId: "far" }));
  assert.equal(remoteTarget.state.players.far.defeated, true);
  assert.equal(remoteTarget.state.players.arc.victoryPoints, 5);
});

test("skills-012 空想具现化内容达到FULL并绑定战斗阶段处理器", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const definition = built.skills.get("servant.arcueid.skill.sc-arcueid-3");
  assert.equal(definition.supportLevel, "FULL");
  assert.equal(definition.activation, "phase");
  assert.deepEqual(definition.windows, ["combat"]);
  assert.equal(definition.requiresActiveCard, true);
  assert.equal(definition.handlerId, "core.arcueid-marble-phantasm");
  assert.equal(built.skills.hasHandler(definition.id), true);
});

test("skills-012 神秘杀手在获胜后扣除因此战败者中战果最高者", () => {
  const state = createGameState({
    gameInstanceId: "raikou-mystery-killer",
    players: [
      { id: "raikou", name: "源赖光" },
      { id: "high", name: "高战果" },
      { id: "low", name: "低战果" },
    ],
    seed: 12,
  });
  state.round = 6;
  state.players.raikou.servantId = "servant.raikou";
  state.players.high.victoryPoints = 7;
  state.players.low.victoryPoints = 4;
  state.players.high.defeated = true;
  state.players.low.defeated = true;
  const skill = {
    id: "servant.raikou.skill.sc-raikou-3",
    name: "神秘杀手",
    ownerType: "servant",
    ownerId: "servant.raikou",
    activation: "phase",
    windows: ["combat"],
    cost: 3,
    text: "",
    supportLevel: "FULL",
    handlerId: "core.raikou-mystery-killer",
  };

  useRaikouMysteryKiller({ state, player: state.players.raikou, skill, payload: undefined, openDecision: () => undefined });
  assert.equal(state.players.raikou.flags.raikouMysteryKillerRound, 6);
  useRaikouMysteryKiller({
    state,
    player: state.players.raikou,
    skill,
    payload: { event: { winnerIds: ["raikou"], powers: { raikou: 12, high: 5, low: 3 } } },
    openDecision: () => undefined,
  });
  assert.equal(state.players.high.victoryPoints, 4);
  assert.equal(state.players.low.victoryPoints, 4);
  assert.equal(state.players.raikou.flags.raikouMysteryKillerRound, undefined);
});

test("skills-012 神秘杀手内容达到FULL并监听战斗结算", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const definition = built.skills.get("servant.raikou.skill.sc-raikou-3");
  assert.equal(definition.supportLevel, "FULL");
  assert.equal(definition.activation, "phase");
  assert.deepEqual(definition.windows, ["combat"]);
  assert.equal(definition.requiresActiveCard, true);
  assert.deepEqual(definition.passiveEventTypes, ["combat.resolved"]);
  assert.equal(definition.handlerId, "core.raikou-mystery-killer");
  assert.equal(built.skills.hasHandler(definition.id), true);
});

test("skills-012 巴泽特第三天拆分为加入攻击与胜利奖励两个小技能", () => {
  const skillId = "master.bazett.skill.s5";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "第三天",
    ownerType: "master",
    ownerId: "master.bazett",
    activation: "phase",
    windows: ["action", "combat"],
    cost: 0,
    basePower: 5,
    typeLabel: "力量",
    text: "",
    supportLevel: "FULL",
    handlerId: "core.bazett-third-day",
    passiveEventTypes: ["combat.resolved"],
    abilities: [
      { id: "third-day-attack", name: "加入攻击", activation: "phase", windows: ["action"], requiresActiveCard: false },
      { id: "third-day-victory", name: "胜利奖励", activation: "phase", windows: ["combat"], requiresActiveCard: true },
    ],
  });
  const engine = new StandardMatchEngine({ ...emptyContent, skills: registry });
  const state = createGameState({ gameInstanceId: "bazett-third-day", players: [{ id: "bazett", name: "巴泽特" }, { id: "opponent", name: "对手" }], seed: 12 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "bazett";
  state.players.bazett.masterId = "master.bazett";
  state.players.bazett.flags.bazettDay = 2;
  createOwnedCardInstance(state, "bazett", { instanceId: "third-day", definitionId: skillId, zone: "master-skills" });

  assert.equal(engine.getLegalActions(state, "bazett").some((action) => action.payload?.skillId === skillId), false);
  state.players.bazett.flags.bazettDay = 3;
  const added = engine.execute(state, skillCommand(state, "third-day-attack", "bazett", skillId, { abilityId: "third-day-attack" }));
  assert.deepEqual(added.state.players.bazett.attack, ["third-day"]);
  assert.equal(added.state.cards["third-day"].active, true);
  assert.equal(added.events.some((event) => event.type === "card.played" && event.payload.definitionId === skillId), true);

  added.state.phase = "combat";
  added.state.step = "player-window";
  added.state.activePlayerId = "bazett";
  const armed = engine.execute(added.state, skillCommand(added.state, "third-day-victory", "bazett", skillId, { abilityId: "third-day-victory" }));
  assert.equal(armed.state.players.bazett.flags.bazettThirdDayVictoryRound, 3);
  enqueuePassiveEffects(armed.state, engine.passives, {
    eventId: "combat",
    type: "combat.resolved",
    revision: armed.state.revision,
    sourceCommandId: "test",
    payload: { powers: { bazett: 5, opponent: 1 }, winnerIds: ["bazett"] },
  });
  engine.effects.drain(armed.state);
  assert.equal(armed.state.players.bazett.victoryPoints, 3);
  assert.equal(armed.state.players.bazett.flags.bazettThirdDayVictoryRound, undefined);
});

test("skills-012 巴泽特第三天内容达到FULL并暴露两个独立能力", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const definition = built.skills.get("master.bazett.skill.s5");
  assert.equal(definition.supportLevel, "FULL");
  assert.equal(definition.handlerId, "core.bazett-third-day");
  assert.deepEqual(definition.passiveEventTypes, ["combat.resolved"]);
  assert.deepEqual(definition.abilities?.map((ability) => ability.id), ["third-day-attack", "third-day-victory"]);
  assert.equal(built.skills.hasHandler(definition.id), true);
});

test("skills-012 希翁气息遮断EX击败交战对手并在战败后移除自身", () => {
  const skillId = "master.sion.skill.s10";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "气息遮断 EX",
    ownerType: "master",
    ownerId: "master.sion",
    activation: "phase",
    windows: ["combat"],
    cost: 4,
    basePower: 2,
    typeLabel: "迅捷",
    text: "",
    supportLevel: "FULL",
    handlerId: "core.sion-presence-concealment-ex",
    requiresActiveCard: true,
    passiveEventTypes: ["combat.resolved"],
  });
  const engine = new StandardMatchEngine({ ...emptyContent, skills: registry });
  const state = createGameState({ gameInstanceId: "sion-presence-ex", players: [{ id: "sion", name: "希翁" }, { id: "opponent", name: "对手" }], seed: 12 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "sion";
  state.players.sion.masterId = "master.sion";
  state.players.sion.locationId = "mountain";
  state.players.opponent.locationId = "mountain";
  state.board.locations.mountain = ["sion", "opponent"];
  createOwnedCardInstance(state, "sion", { instanceId: "presence-ex", definitionId: skillId, zone: "attack", face: "up", active: true });

  const used = engine.execute(state, skillCommand(state, "execute", "sion", skillId, { targetPlayerId: "opponent" }));
  assert.equal(used.state.players.opponent.defeated, true);
  enqueuePassiveEffects(used.state, engine.passives, {
    eventId: "combat",
    type: "combat.resolved",
    revision: used.state.revision,
    sourceCommandId: "test",
    payload: { powers: { sion: 2, opponent: 3 }, winnerIds: ["opponent"] },
  });
  engine.effects.drain(used.state);
  assert.equal(used.state.cards["presence-ex"].zone, "removed");
  assert.equal(used.state.cards["presence-ex"].active, false);
});

test("skills-012 希翁气息遮断EX内容达到FULL", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const definition = built.skills.get("master.sion.skill.s10");
  assert.equal(definition.supportLevel, "FULL");
  assert.equal(definition.handlerId, "core.sion-presence-concealment-ex");
  assert.deepEqual(definition.passiveEventTypes, ["combat.resolved"]);
  assert.equal(definition.requiresActiveCard, true);
  assert.equal(built.skills.hasHandler(definition.id), true);
});

test("skills-012 莱昂纳多最终审判支付费用并在战斗结束后扣低威力对手战果", () => {
  const skillId = "master.leonardo.skill.ascension";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "最终审判",
    ownerType: "master",
    ownerId: "master.leonardo",
    activation: "phase",
    windows: ["combat"],
    cost: 6,
    abilityCost: 6,
    text: "",
    supportLevel: "FULL",
    handlerId: "core.leonardo-final-judgment",
    passiveEventTypes: ["combat.resolved"],
    requiresActiveCard: false,
  });
  const engine = new StandardMatchEngine({ ...emptyContent, skills: registry });
  const state = createGameState({
    gameInstanceId: "leonardo-final-judgment",
    players: [
      { id: "leo", name: "莱昂纳多" },
      { id: "low", name: "低威力" },
      { id: "tie", name: "同威力" },
    ],
    seed: 12,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "leo";
  state.players.leo.masterId = "master.leonardo";
  state.players.leo.mana = 8;
  state.players.low.victoryPoints = 5;
  state.players.tie.victoryPoints = 5;

  const armed = engine.execute(state, skillCommand(state, "final-judgment", "leo", skillId, {}));
  assert.equal(armed.state.players.leo.mana, 2);
  assert.equal(armed.state.players.leo.flags.leonardoFinalJudgmentRound, 4);
  enqueuePassiveEffects(armed.state, engine.passives, {
    eventId: "combat",
    type: "combat.resolved",
    revision: armed.state.revision,
    sourceCommandId: "test",
    payload: { powers: { leo: 20, low: 19, tie: 20 }, winnerIds: ["leo", "tie"] },
  });
  engine.effects.drain(armed.state);
  assert.equal(armed.state.players.low.victoryPoints, 2);
  assert.equal(armed.state.players.tie.victoryPoints, 5);
  assert.equal(armed.state.players.leo.flags.leonardoFinalJudgmentRound, undefined);
});

test("skills-012 莱昂纳多最终审判内容达到FULL并绑定战斗结算", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const definition = built.skills.get("master.leonardo.skill.ascension");
  assert.equal(definition.supportLevel, "FULL");
  assert.equal(definition.activation, "phase");
  assert.deepEqual(definition.windows, ["combat"]);
  assert.equal(definition.abilityCost, 6);
  assert.equal(definition.handlerId, "core.leonardo-final-judgment");
  assert.deepEqual(definition.passiveEventTypes, ["combat.resolved"]);
  assert.equal(built.skills.hasHandler(definition.id), true);
});

test("skills-012 罗榭巨测指导获得资源、抽牌并将变节洗入牌库", () => {
  const skillId = "master.roche.skill.s1a";
  const betrayalId = "master.roche.skill.s2";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "巨测指导",
    ownerType: "master",
    ownerId: "master.roche",
    activation: "phase",
    windows: ["action"],
    cost: 0,
    text: "",
    supportLevel: "FULL",
    handlerId: "core.roche-giant-guidance",
    requiresActiveCard: false,
  });
  registry.register({
    id: betrayalId,
    name: "变节",
    ownerType: "master",
    ownerId: "master.roche",
    activation: "passive",
    windows: [],
    cost: 0,
    text: "",
    supportLevel: "PARTIAL",
  });
  const engine = new StandardMatchEngine({
    ...emptyContent,
    cards: {
      filler: { id: "filler", name: "填充牌", cost: 0, basePower: 1, typeLabel: "力量" },
    },
    skills: registry,
    playerDecks: { roche: ["filler"] },
  });
  const state = createGameState({ gameInstanceId: "roche-guidance", players: [{ id: "roche", name: "罗榭" }], seed: 12 });
  state.status = "playing";
  state.round = 2;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "roche";
  state.players.roche.masterId = "master.roche";
  state.players.roche.mana = 0;
  createOwnedCardInstance(state, "roche", { instanceId: "deck-card", definitionId: "filler", zone: "deck" });

  const result = engine.execute(state, skillCommand(state, "giant-guidance", "roche", skillId, {}));
  assert.equal(result.state.players.roche.victoryPoints, 1);
  assert.equal(result.state.players.roche.mana, 1);
  assert.equal(result.state.players.roche.flags.roundPowerBonus, 2);
  assert.deepEqual(result.state.players.roche.hand, ["deck-card"]);
  const betrayalInstanceId = result.state.players.roche.deck.find((instanceId) => result.state.cards[instanceId].definitionId === betrayalId);
  assert.ok(betrayalInstanceId);
  assert.equal(result.state.cards[betrayalInstanceId].createdByEffectId, `${skillId}:round-2`);
});

test("skills-012 罗榭巨测指导内容达到FULL", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const definition = built.skills.get("master.roche.skill.s1a");
  assert.equal(definition.supportLevel, "FULL");
  assert.equal(definition.activation, "phase");
  assert.deepEqual(definition.windows, ["action"]);
  assert.equal(definition.requiresActiveCard, false);
  assert.equal(definition.handlerId, "core.roche-giant-guidance");
  assert.equal(built.skills.hasHandler(definition.id), true);
});

test("skills-012 虞美人死之愿望开局加入咒血尸解叹歌，战败后从游戏外补回", () => {
  const skillId = "master.hinako.skill.s1a";
  const targetSkillId = "master.hinako.skill.s2";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "死之愿望",
    ownerType: "master",
    ownerId: "master.hinako",
    activation: "passive",
    windows: [],
    cost: 0,
    text: "",
    supportLevel: "FULL",
    handlerId: "core.hinako-death-wish",
    addSkillDefinitionId: targetSkillId,
    passiveEventTypes: ["game.started", "combat.resolved"],
  });
  registry.register({
    id: targetSkillId,
    name: "咒血尸解叹歌",
    ownerType: "master",
    ownerId: "master.hinako",
    activation: "phase",
    windows: ["combat"],
    cost: 4,
    requirement: 8,
    basePower: 3,
    typeLabel: "魔术/宝具",
    text: "",
    supportLevel: "PARTIAL",
  });
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(registry, passives, effects);
  const state = createGameState({ gameInstanceId: "hinako-death-wish", players: [{ id: "hinako", name: "虞美人" }, { id: "winner", name: "胜者" }], seed: 12 });
  state.status = "playing";
  state.round = 2;
  state.players.hinako.masterId = "master.hinako";

  enqueuePassiveEffects(state, passives, {
    eventId: "start",
    type: "game.started",
    revision: state.revision,
    sourceCommandId: "test",
    payload: {},
  });
  effects.drain(state);
  const firstCopy = state.players.hinako.masterSkills.find((instanceId) => state.cards[instanceId]?.definitionId === targetSkillId);
  assert.ok(firstCopy);

  state.players.hinako.masterSkills = state.players.hinako.masterSkills.filter((instanceId) => instanceId !== firstCopy);
  state.cards[firstCopy].zone = "removed";
  enqueuePassiveEffects(state, passives, {
    eventId: "combat-loss",
    type: "combat.resolved",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { powers: { hinako: 3, winner: 8 }, winnerIds: ["winner"] },
  });
  effects.drain(state);
  const copiesInSkillZone = state.players.hinako.masterSkills.filter((instanceId) => state.cards[instanceId]?.definitionId === targetSkillId);
  assert.equal(copiesInSkillZone.length, 1);
  assert.notEqual(copiesInSkillZone[0], firstCopy);
  assert.equal(state.cards[copiesInSkillZone[0]].zone, "master-skills");

  enqueuePassiveEffects(state, passives, {
    eventId: "combat-loss-duplicate",
    type: "combat.resolved",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { powers: { hinako: 3, winner: 8 }, winnerIds: ["winner"] },
  });
  effects.drain(state);
  assert.equal(state.players.hinako.masterSkills.filter((instanceId) => state.cards[instanceId]?.definitionId === targetSkillId).length, 1);
});

test("skills-012 虞美人死之愿望内容达到FULL并监听开局与战败", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const definition = built.skills.get("master.hinako.skill.s1a");
  assert.equal(definition.supportLevel, "FULL");
  assert.equal(definition.activation, "passive");
  assert.deepEqual(definition.passiveEventTypes, ["game.started", "combat.resolved"]);
  assert.equal(definition.addSkillDefinitionId, "master.hinako.skill.s2");
  assert.equal(definition.handlerId, "core.hinako-package");
  assert.equal(built.skills.hasHandler(definition.id), true);
});

test("skills-012 咒血尸解叹歌令同战场对手每张攻击威力-2", () => {
  const skillId = "master.hinako.skill.s2";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "咒血尸解叹歌",
    ownerType: "master",
    ownerId: "master.hinako",
    activation: "phase",
    windows: ["combat"],
    cost: 4,
    requirement: 8,
    basePower: 3,
    typeLabel: "魔术/宝具",
    text: "",
    supportLevel: "FULL",
    handlerId: "core.hinako-blood-song",
    requiresActiveCard: true,
    standardAppend: true,
    limit: "once-per-game",
  });
  const cards = {
    strength: { id: "strength", name: "力量攻击", cost: 0, basePower: 5, typeLabel: "力量" },
    magic: { id: "magic", name: "魔术攻击", cost: 0, basePower: 4, typeLabel: "魔术" },
    remote: { id: "remote", name: "异战场攻击", cost: 0, basePower: 6, typeLabel: "迅捷" },
  };
  const engine = new StandardMatchEngine({ ...emptyContent, cards, skills: registry });
  const state = createGameState({
    gameInstanceId: "hinako-blood-song",
    players: [
      { id: "hinako", name: "虞美人" },
      { id: "opponent", name: "同战场对手" },
      { id: "remote", name: "异战场对手" },
    ],
    seed: 12,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "hinako";
  state.players.hinako.masterId = "master.hinako";
  state.players.hinako.locationId = "mountain";
  state.players.opponent.locationId = "mountain";
  state.players.remote.locationId = "city";
  state.board.locations.mountain = ["hinako", "opponent"];
  state.board.locations.city = ["remote"];
  createOwnedCardInstance(state, "hinako", { instanceId: "blood-song", definitionId: skillId, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "opponent", { instanceId: "opponent-a", definitionId: "strength", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "opponent", { instanceId: "opponent-b", definitionId: "magic", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "remote", { instanceId: "remote-a", definitionId: "remote", zone: "attack", face: "up", active: true });

  const definitions = { ...cards, ...registry.asCardDefinitions() };
  assert.equal(calculateCombatPower(state, state.players.opponent, definitions, "mountain"), 9);
  const result = engine.execute(state, skillCommand(state, "blood-song", "hinako", skillId, {}));
  assert.equal(calculateCombatPower(result.state, result.state.players.opponent, definitions, "mountain"), 5);
  assert.equal(calculateCombatPower(result.state, result.state.players.remote, definitions, "city"), 6);
});

test("skills-012 咒血尸解叹歌内容达到FULL并保留每局一次与追加打出", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const definition = built.skills.get("master.hinako.skill.s2");
  assert.equal(definition.supportLevel, "FULL");
  assert.equal(definition.activation, "phase");
  assert.deepEqual(definition.windows, ["action", "combat"]);
  assert.equal(definition.requiresActiveCard, true);
  assert.equal(definition.limit, "once-per-game");
  assert.equal(definition.standardAppend, true);
  assert.equal(definition.handlerId, "core.hinako-package");
  assert.equal(built.skills.hasHandler(definition.id), true);
});

test("skills-012 领域外生命给予本回合威力并在战斗后进入对应从者弃牌堆", () => {
  const skillId = "servant.abigail.skill.sc-abigail-4";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "领域外生命",
    ownerType: "servant",
    ownerId: "servant.abigail",
    activation: "phase",
    windows: ["combat"],
    cost: 1,
    requirement: 1,
    basePower: 0,
    typeLabel: "特殊",
    text: "",
    supportLevel: "FULL",
    handlerId: "core.outer-god-life",
    requiresActiveCard: true,
    passiveEventTypes: ["combat.resolved"],
  });
  const engine = new StandardMatchEngine({ ...emptyContent, skills: registry });
  const state = createGameState({ gameInstanceId: "outer-god-life", players: [{ id: "abby", name: "阿比盖尔" }, { id: "opponent", name: "对手" }], seed: 12 });
  state.status = "playing";
  state.round = 5;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "abby";
  state.players.abby.servantId = "servant.abigail";
  createOwnedCardInstance(state, "abby", { instanceId: "outer-life", definitionId: skillId, zone: "attack", face: "up", active: true });

  const used = engine.execute(state, skillCommand(state, "outer-life", "abby", skillId, {}));
  assert.equal(used.state.players.abby.flags.roundPowerBonus, 6);
  assert.equal(used.state.players.abby.flags["outerGodLifeReturn:outer-life"], "5|abby");
  enqueuePassiveEffects(used.state, engine.passives, {
    eventId: "combat",
    type: "combat.resolved",
    revision: used.state.revision,
    sourceCommandId: "test",
    payload: { powers: { abby: 6, opponent: 1 }, winnerIds: ["abby"] },
  });
  engine.effects.drain(used.state);
  assert.deepEqual(used.state.players.abby.attack, []);
  assert.deepEqual(used.state.players.abby.discard, ["outer-life"]);
  assert.equal(used.state.cards["outer-life"].zone, "discard");
  assert.equal(used.state.cards["outer-life"].active, false);
  assert.equal(used.state.players.abby.flags["outerGodLifeReturn:outer-life"], undefined);
});

test("skills-012 四张领域外生命共享FULL处理器", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const ids = [
    "servant.abigail.skill.sc-abigail-4",
    "servant.hokusai.skill.sc-hokusai-4",
    "servant.voyager.skill.sc-voyager-4",
    "servant.clytie.skill.sc-clytie-4",
  ];
  for (const id of ids) {
    const definition = built.skills.get(id);
    assert.equal(definition.supportLevel, "FULL", id);
    assert.equal(definition.activation, "phase", id);
    assert.deepEqual(definition.windows, ["combat"], id);
    assert.equal(definition.requiresActiveCard, true, id);
    assert.deepEqual(definition.passiveEventTypes, ["combat.resolved"], id);
    assert.equal(definition.handlerId, "core.outer-god-life", id);
    assert.equal(built.skills.hasHandler(id), true, id);
  }
});

test("skills-012 腕穿麈杀之枪扣除交战对手战果并按扣后领先结算奖励", () => {
  const skillId = "servant.cu-alter.skill.sc-cu-alter-3";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "腕穿麈杀之枪",
    ownerType: "servant",
    ownerId: "servant.cu-alter",
    activation: "phase",
    windows: ["combat"],
    cost: 7,
    requirement: 8,
    basePower: 10,
    typeLabel: "迅捷/宝具",
    text: "",
    supportLevel: "FULL",
    handlerId: "core.cu-alter-gae-bolg",
    requiresActiveCard: true,
  });
  const engine = new StandardMatchEngine({ ...emptyContent, skills: registry });
  const state = createGameState({ gameInstanceId: "cu-alter-gae-bolg", players: [{ id: "cu", name: "库Alter" }, { id: "ahead", name: "领先者" }, { id: "near", name: "刚好者" }], seed: 12 });
  state.status = "playing";
  state.round = 6;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "cu";
  state.players.cu.servantId = "servant.cu-alter";
  state.players.cu.victoryPoints = 5;
  state.players.ahead.victoryPoints = 9;
  state.players.near.victoryPoints = 8;
  state.players.cu.locationId = "mountain";
  state.players.ahead.locationId = "mountain";
  state.players.near.locationId = "mountain";
  state.board.locations.mountain = ["cu", "ahead", "near"];
  createOwnedCardInstance(state, "cu", { instanceId: "gae-bolg", definitionId: skillId, zone: "attack", face: "up", active: true });

  const rewarded = engine.execute(state, skillCommand(state, "hit-ahead", "cu", skillId, { targetPlayerId: "ahead" }));
  assert.equal(rewarded.state.players.ahead.victoryPoints, 6);
  assert.equal(rewarded.state.players.cu.victoryPoints, 7);
  assert.equal(rewarded.state.players.cu.flags.roundPowerBonus, 3);

  rewarded.state.players.cu.usage[skillId] = undefined;
  const noReward = engine.execute(rewarded.state, skillCommand(rewarded.state, "hit-near", "cu", skillId, { targetPlayerId: "near" }));
  assert.equal(noReward.state.players.near.victoryPoints, 5);
  assert.equal(noReward.state.players.cu.victoryPoints, 7);
  assert.equal(noReward.state.players.cu.flags.roundPowerBonus, 3);
});

test("skills-012 腕穿麈杀之枪内容达到FULL并绑定战斗阶段目标处理器", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const definition = built.skills.get("servant.cu-alter.skill.sc-cu-alter-3");
  assert.equal(definition.supportLevel, "FULL");
  assert.equal(definition.activation, "phase");
  assert.deepEqual(definition.windows, ["combat"]);
  assert.equal(definition.requiresActiveCard, true);
  assert.equal(definition.handlerId, "core.cu-alter-gae-bolg");
  assert.equal(built.skills.hasHandler(definition.id), true);
});

test("skills-012 日轮啊顺从死亡在胜利后安排败者下一回合开始败北", () => {
  const skillId = "servant.karna.skill.sc-karna-3";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "日轮啊，顺从死亡",
    ownerType: "servant",
    ownerId: "servant.karna",
    activation: "phase",
    windows: ["combat"],
    cost: 8,
    requirement: 8,
    basePower: 10,
    typeLabel: "宝具",
    text: "",
    supportLevel: "FULL",
    handlerId: "core.karna-next-round-defeat",
    requiresActiveCard: true,
    passiveEventTypes: ["combat.resolved"],
    limit: "once-per-game",
  });
  const engine = new StandardMatchEngine({ ...emptyContent, skills: registry });
  const state = createGameState({ gameInstanceId: "karna-next-round", players: [{ id: "karna", name: "迦尔纳" }, { id: "loser", name: "败者" }, { id: "tie", name: "共同胜者" }], seed: 12 });
  state.status = "playing";
  state.round = 6;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "karna";
  state.players.karna.servantId = "servant.karna";
  createOwnedCardInstance(state, "karna", { instanceId: "vasavi", definitionId: skillId, zone: "attack", face: "up", active: true });

  const armed = engine.execute(state, skillCommand(state, "vasavi", "karna", skillId, {}));
  assert.equal(armed.state.players.karna.flags.karnaNextRoundDefeatRound, 6);
  enqueuePassiveEffects(armed.state, engine.passives, {
    eventId: "combat",
    type: "combat.resolved",
    revision: armed.state.revision,
    sourceCommandId: "test",
    payload: { powers: { karna: 12, loser: 7, tie: 12 }, winnerIds: ["karna", "tie"] },
  });
  engine.effects.drain(armed.state);
  assert.equal(armed.state.scheduledEffects.length, 1);
  assert.deepEqual(armed.state.scheduledEffects[0].payload, { targetPlayerIds: ["loser"] });
  assert.equal(armed.state.players.karna.flags.karnaNextRoundDefeatRound, undefined);
  // English ruling: once scheduled, the next-round defeat remains even if
  // Vasavi Shakti is no longer available before the trigger resolves.
  armed.state.players.karna.attack = [];
  armed.state.cards.vasavi.zone = "removed";
  armed.state.cards.vasavi.active = false;

  armed.state.round = 7;
  enqueueScheduledEffects(armed.state, {
    eventId: "round-7",
    type: "round.started",
    revision: armed.state.revision,
    sourceCommandId: "test",
    payload: { round: 7 },
  });
  engine.effects.drain(armed.state);
  assert.equal(armed.state.players.loser.defeated, true);
  assert.equal(armed.state.players.tie.defeated, false);
  assert.equal(armed.state.scheduledEffects.length, 0);
});

test("skills-012 日轮啊顺从死亡内容达到FULL并绑定战斗胜利延迟败北", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const definition = built.skills.get("servant.karna.skill.sc-karna-3");
  assert.equal(definition.supportLevel, "FULL");
  assert.equal(definition.activation, "phase");
  assert.deepEqual(definition.windows, ["combat"]);
  assert.equal(definition.requiresActiveCard, true);
  assert.deepEqual(definition.passiveEventTypes, ["combat.resolved"]);
  assert.equal(definition.limit, "once-per-game");
  assert.equal(definition.handlerId, "core.karna-next-round-defeat");
  assert.equal(built.skills.hasHandler(definition.id), true);
});

test("skills-012 伪螺旋剑两个小能力共享每局一次并按阶段结算", () => {
  const skillId = "servant.emiya.skill.sc-emiya-2";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "伪·螺旋剑",
    ownerType: "servant",
    ownerId: "servant.emiya",
    activation: "phase",
    windows: ["action", "combat"],
    cost: 2,
    requirement: 2,
    basePower: 4,
    typeLabel: "迅捷/宝具",
    text: "",
    supportLevel: "FULL",
    handlerId: "core.emiya-fake-spiral-sword",
    passiveEventTypes: ["combat.resolved"],
    limit: "once-per-game",
    abilities: [
      { id: "fake-spiral-triple-advantage", name: "三倍地利", activation: "phase", windows: ["action"], requiresActiveCard: false },
      { id: "fake-spiral-victory-reward", name: "胜利奖励", activation: "phase", windows: ["combat"], requiresActiveCard: true },
    ],
  });
  const engine = new StandardMatchEngine({ ...emptyContent, skills: registry });
  const state = createGameState({ gameInstanceId: "emiya-fake-spiral", players: [{ id: "emiya", name: "卫宫" }, { id: "opponent", name: "对手" }], seed: 12 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "emiya";
  state.players.emiya.servantId = "servant.emiya";
  state.players.emiya.flags.deploymentBonusActive = true;
  state.players.emiya.flags.deploymentBonus = 2;

  const tripled = engine.execute(state, skillCommand(state, "triple", "emiya", skillId, { abilityId: "fake-spiral-triple-advantage" }));
  assert.equal(tripled.state.players.emiya.flags.deploymentBonus, 6);
  assert.equal(tripled.state.players.emiya.flags.emiyaFakeSpiralSwordUsed, true);
  assert.equal(engine.getLegalActions(tripled.state, "emiya").some((action) => action.payload?.skillId === skillId), false);

  const combatState = createGameState({ gameInstanceId: "emiya-fake-spiral-combat", players: [{ id: "emiya", name: "卫宫" }, { id: "opponent", name: "对手" }], seed: 12 });
  combatState.status = "playing";
  combatState.round = 4;
  combatState.phase = "combat";
  combatState.step = "player-window";
  combatState.activePlayerId = "emiya";
  combatState.players.emiya.servantId = "servant.emiya";
  createOwnedCardInstance(combatState, "emiya", { instanceId: "fake-spiral", definitionId: skillId, zone: "attack", face: "up", active: true });
  const armed = engine.execute(combatState, skillCommand(combatState, "reward", "emiya", skillId, { abilityId: "fake-spiral-victory-reward" }));
  enqueuePassiveEffects(armed.state, engine.passives, {
    eventId: "combat",
    type: "combat.resolved",
    revision: armed.state.revision,
    sourceCommandId: "test",
    payload: { powers: { emiya: 10, opponent: 4 }, winnerIds: ["emiya"] },
  });
  engine.effects.drain(armed.state);
  assert.equal(armed.state.players.emiya.victoryPoints, 4);
  assert.equal(armed.state.players.emiya.flags.emiyaFakeSpiralRewardRound, undefined);
});

test("skills-012 伪螺旋剑内容达到FULL并拆分行动与战斗小能力", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const definition = built.skills.get("servant.emiya.skill.sc-emiya-2");
  assert.equal(definition.supportLevel, "FULL");
  assert.equal(definition.handlerId, "core.emiya-fake-spiral-sword");
  assert.equal(definition.limit, "once-per-game");
  assert.deepEqual(definition.passiveEventTypes, ["combat.resolved"]);
  assert.deepEqual(definition.abilities?.map((ability) => ability.id), ["fake-spiral-triple-advantage", "fake-spiral-victory-reward"]);
  assert.equal(definition.abilities?.[1].requiresActiveCard, true);
  assert.equal(built.skills.hasHandler(definition.id), true);
});

test("skills-012 单独行动EX行动翻倍地利，战斗按胜败结算战果", () => {
  const skillId = "master.sion.skill.s7";
  const registry = new SkillRegistry();
  registry.register({
    id: skillId,
    name: "单独行动 EX",
    ownerType: "master",
    ownerId: "master.sion",
    activation: "phase",
    windows: ["action", "combat"],
    cost: 0,
    requirement: 0,
    basePower: 6,
    typeLabel: "特殊",
    text: "",
    supportLevel: "FULL",
    handlerId: "core.sion-independent-action-ex",
    passiveEventTypes: ["combat.resolved"],
    abilities: [
      { id: "sion-ex-remote-control", name: "远隔操作", activation: "phase", windows: ["action"], requiresActiveCard: false },
      { id: "sion-ex-combat-result", name: "胜败结算", activation: "phase", windows: ["combat"], requiresActiveCard: true },
    ],
  });
  const engine = new StandardMatchEngine({ ...emptyContent, skills: registry });
  const actionState = createGameState({ gameInstanceId: "sion-ex-action", players: [{ id: "sion", name: "希翁" }], seed: 12 });
  actionState.status = "playing";
  actionState.round = 4;
  actionState.phase = "action";
  actionState.step = "player-window";
  actionState.activePlayerId = "sion";
  actionState.players.sion.masterId = "master.sion";
  actionState.players.sion.flags.deploymentBonusActive = true;
  actionState.players.sion.flags.deploymentBonus = 3;
  const doubled = engine.execute(actionState, skillCommand(actionState, "remote", "sion", skillId, { abilityId: "sion-ex-remote-control" }));
  assert.equal(doubled.state.players.sion.flags.deploymentBonus, 6);

  const combatState = createGameState({ gameInstanceId: "sion-ex-combat", players: [{ id: "sion", name: "希翁" }, { id: "opponent", name: "对手" }], seed: 12 });
  combatState.status = "playing";
  combatState.round = 4;
  combatState.phase = "combat";
  combatState.step = "player-window";
  combatState.activePlayerId = "sion";
  combatState.players.sion.masterId = "master.sion";
  combatState.players.sion.victoryPoints = 5;
  createOwnedCardInstance(combatState, "sion", { instanceId: "sion-ex", definitionId: skillId, zone: "attack", face: "up", active: true });
  const armed = engine.execute(combatState, skillCommand(combatState, "combat-result", "sion", skillId, { abilityId: "sion-ex-combat-result" }));
  enqueuePassiveEffects(armed.state, engine.passives, {
    eventId: "win",
    type: "combat.resolved",
    revision: armed.state.revision,
    sourceCommandId: "test",
    payload: { powers: { sion: 9, opponent: 4 }, winnerIds: ["sion"] },
  });
  engine.effects.drain(armed.state);
  assert.equal(armed.state.players.sion.victoryPoints, 7);

  armed.state.players.sion.usage[`${skillId}:sion-ex-combat-result`] = undefined;
  armed.state.players.sion.flags.sionIndependentActionExRound = 4;
  enqueuePassiveEffects(armed.state, engine.passives, {
    eventId: "loss",
    type: "combat.resolved",
    revision: armed.state.revision,
    sourceCommandId: "test",
    payload: { powers: { sion: 4, opponent: 9 }, winnerIds: ["opponent"] },
  });
  engine.effects.drain(armed.state);
  assert.equal(armed.state.players.sion.victoryPoints, 4);
});

test("skills-012 单独行动EX内容达到FULL并拆分远隔操作与胜败结算", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  registerCoreSkillHandlers(built.skills);
  const definition = built.skills.get("master.sion.skill.s7");
  assert.equal(definition.supportLevel, "FULL");
  assert.equal(definition.handlerId, "core.sion-independent-action-ex");
  assert.deepEqual(definition.passiveEventTypes, ["combat.resolved"]);
  assert.deepEqual(definition.abilities?.map((ability) => ability.id), ["sion-ex-remote-control", "sion-ex-combat-result"]);
  assert.equal(definition.abilities?.[1].requiresActiveCard, true);
  assert.equal(built.skills.hasHandler(definition.id), true);
});
