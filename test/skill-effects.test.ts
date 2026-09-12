import test from "node:test";
import assert from "node:assert/strict";
import { parseSkillEffects } from "../src/rules-core/skill-effects.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { SkillRegistry } from "../src/rules-core/skill-registry.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { calculateCombatCardPower, calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { useArthurWindbreaker, useBazettTimeLoop, useChaosGiantShark, useChaosHunter, useChaosPhantom, useChaosSacrifice, useCuGaeBolg, useCuGungnirReward, useDanHonor, useGameStartReplaceDeckCard, useHassanNoblePhantasm, useKariyaInsects, useKariyaNemesis, useRoundStartPowerBonus, useCombatHistory, useIllyaHeavenlyGarment, useIllyaSmallGrail, useRyuunosukeChainKiller, useZeroOpponentAttribute, useRobinPrayerBow, useSakuraCorruptedGrailTrigger, useRoundEndVictoryPointLoss, useRoundEndResourceAdjustment, useAddCardToHand, useKohakuSmile, registerCorePassiveHandlers, useCreateTemporaryAttacks, useSameBattlefieldOpponentPower, useDefeatCombatParticipants, useKiritsuguFourfoldSpeed, useDoubleDeploymentBonus, useDefeatEngagedIfMoreAttacks, useManaThresholdVictoryPointLoss } from "../src/rules-core/skill-handlers.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { gainMana } from "../src/rules-core/resources.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { movePlayer } from "../src/rules-core/board.ts";

test("行动阶段从游戏外取牌会创建带来源的手牌实例", () => {
  const state = createGameState({ gameInstanceId: "reines-alchemist", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing";
  state.phase = "action";
  state.activePlayerId = "p";
  state.round = 1;
  const skill = {
    id: "master.reines.skill.s1",
    name: "炼金术师",
    ownerType: "master" as const,
    ownerId: "master.reines",
    activation: "phase" as const,
    windows: ["action"] as const,
    cost: 0,
    addCardToHandDefinitionId: "card.trim",
    text: "",
    supportLevel: "FULL" as const,
  };
  useAddCardToHand({
    state,
    player: state.players.p,
    skill,
    payload: undefined,
    definitions: { "card.trim": { id: "card.trim", name: "特里姆玛乌", cost: 1, basePower: 3, typeLabel: "迅捷" } },
    openDecision: () => undefined,
  });
  const instanceId = state.players.p.hand[0];
  assert.equal(state.cards[instanceId].definitionId, "card.trim");
  assert.equal(state.cards[instanceId].createdByEffectId, "master.reines.skill.s1:round:1");
});

test("四倍速关闭激活攻击并激活暗置起源弹", () => {
  const state = createGameState({ gameInstanceId: "fourfold-speed", players: [{ id: "p", name: "P" }], seed: 1 });
  state.phase = "combat";
  state.players.p.attack = ["active", "origin"];
  state.cards.active = { instanceId: "active", definitionId: "basic", ownerPlayerId: "p", controllerPlayerId: "p", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards.origin = { instanceId: "origin", definitionId: "master.kiritsugu.skill.s4", ownerPlayerId: "p", controllerPlayerId: "p", zone: "attack", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  useKiritsuguFourfoldSpeed({ state, player: state.players.p, skill: { id: "master.kiritsugu.skill.s3", name: "四倍速", ownerType: "master", ownerId: "master.kiritsugu", activation: "phase", windows: ["combat"], cost: 0, closeActiveAndActivateHiddenDefinitionId: "master.kiritsugu.skill.s4", text: "", supportLevel: "FULL" }, payload: { closeInstanceId: "active" }, definitions: { basic: { id: "basic", name: "基础", cost: 0, basePower: 1, typeLabel: "力量" }, "master.kiritsugu.skill.s4": { id: "master.kiritsugu.skill.s4", name: "起源弹", cost: 0, basePower: 2, typeLabel: "迅捷" } }, openDecision: () => undefined });
  assert.equal(state.cards.active.active, false);
  assert.equal(state.cards.origin.active, true);
  assert.equal(state.cards.origin.face, "up");
});

test("哨兵将当前部署地利翻倍", () => {
  const state = createGameState({ gameInstanceId: "sentinel", players: [{ id: "p", name: "P" }], seed: 1 });
  state.phase = "action";
  state.players.p.flags.deploymentBonusActive = true;
  state.players.p.flags.deploymentBonus = 2;
  useDoubleDeploymentBonus({ state, player: state.players.p, skill: { id: "master.chaos.skill.s10", name: "哨兵", ownerType: "master", ownerId: "master.chaos", activation: "phase", windows: ["action"], cost: 1, doubleDeploymentBonus: true, text: "", supportLevel: "FULL" }, payload: undefined, openDecision: () => undefined });
  assert.equal(state.players.p.flags.deploymentBonus, 4);
});

test("咆哮吧吾之风怒在己方激活攻击更多时击败交战对手", () => {
  const state = createGameState({ gameInstanceId: "roar", players: [{ id: "p", name: "P" }, { id: "o", name: "O" }], seed: 1 });
  state.phase = "combat";
  state.players.p.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["p", "o"];
  state.players.p.attack = ["p1", "p2"];
  state.players.o.attack = ["o1"];
  for (const id of ["p1", "p2", "o1"]) state.cards[id] = { instanceId: id, definitionId: "a", ownerPlayerId: id.startsWith("p") ? "p" : "o", controllerPlayerId: id.startsWith("p") ? "p" : "o", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  useDefeatEngagedIfMoreAttacks({ state, player: state.players.p, skill: { id: "servant.jeanne-alter.skill.sc-jeanne-alter-1", name: "咆哮", ownerType: "servant", ownerId: "servant.jeanne-alter", activation: "phase", windows: ["combat"], cost: 9, defeatEngagedOpponentsIfMoreActiveAttacks: true, text: "", supportLevel: "FULL" }, payload: undefined, openDecision: () => undefined });
  assert.equal(state.players.o.defeated, true);
});

test("沸腾之血按魔力门槛扣除所有高魔力玩家战果且交战对手额外扣除", () => {
  const state = createGameState({ gameInstanceId: "boiling-blood", players: [{ id: "p", name: "P" }, { id: "o", name: "O" }, { id: "x", name: "X" }], seed: 1 });
  state.phase = "combat";
  state.players.p.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.x.locationId = "city";
  state.board.locations.mountain = ["p", "o"];
  state.board.locations.city = ["x"];
  state.players.p.mana = 4;
  state.players.o.mana = 8; state.players.o.victoryPoints = 5;
  state.players.x.mana = 9; state.players.x.victoryPoints = 5;
  useManaThresholdVictoryPointLoss({ state, player: state.players.p, skill: { id: "servant.ibaraki.skill.sc-ibaraki-2", name: "沸腾之血", ownerType: "servant", ownerId: "servant.ibaraki", activation: "phase", windows: ["combat"], cost: 2, manaThresholdVictoryPointLoss: { threshold: 8, amount: 1, opponentExtra: 2 }, text: "", supportLevel: "FULL" }, payload: undefined, openDecision: () => undefined });
  assert.equal(state.players.o.victoryPoints, 2);
  assert.equal(state.players.x.victoryPoints, 4);
});

test("沸腾之血只能在玩家魔力少于8点时打出", () => {
  const state = createGameState({ gameInstanceId: "boiling-blood-gate", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing";
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "p";
  state.cards.blood = { instanceId: "blood", definitionId: "blood", ownerPlayerId: "p", controllerPlayerId: "p", zone: "servant-skills", face: "up", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p.servantSkills = ["blood"];
  const definitions = { blood: { id: "blood", name: "沸腾之血", cost: 2, basePower: 6, typeLabel: "特殊", isSkill: true, skillOwnerType: "servant" as const, requiresEightMana: false, maxManaExclusive: 8 } };
  state.players.p.mana = 7;
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "p", instanceId: "blood", definitions, faceDown: false }));
  state.players.p.mana = 8;
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "p", instanceId: "blood", definitions, faceDown: false }), /CARD_REQUIRES_MANA_BELOW_LIMIT/);
});

test("琥珀笑面琥在开局加入两张魔力猛攻并将准备阶段手牌补至4张", () => {
  const state = createGameState({ gameInstanceId: "kohaku-smile", players: [{ id: "p", name: "琥珀" }], seed: 1 });
  const player = state.players.p;
  for (let index = 0; index < 3; index += 1) {
    const instanceId = `hand-${index}`;
    state.cards[instanceId] = { instanceId, definitionId: "card.hand", ownerPlayerId: "p", controllerPlayerId: "p", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
    player.hand.push(instanceId);
  }
  const deckId = "deck-1";
  state.cards[deckId] = { instanceId: deckId, definitionId: "card.deck", ownerPlayerId: "p", controllerPlayerId: "p", zone: "deck", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  player.deck.push(deckId);
  const skill = { id: "master.kohaku.skill.s1", name: "笑面琥", ownerType: "master" as const, ownerId: "master.kohaku", activation: "passive" as const, windows: ["preparation"] as const, cost: 0, text: "", supportLevel: "FULL" as const, addCardDefinitionId: "card.card-kohaku-blast", addCardCount: 2, preparationHandSize: 4 };
  useKohakuSmile({ state, player, skill, payload: { eventType: "game.started" }, openDecision: () => undefined });
  assert.equal(player.deck.filter((id) => state.cards[id]?.definitionId === "card.card-kohaku-blast").length, 2);
  useKohakuSmile({ state, player, skill, payload: { eventType: "round.started" }, randomInt: () => 0, openDecision: () => undefined });
  assert.equal(player.hand.length, 4);
});

test("回合结束扣战果使用清理前的位置快照，并且不会低于零", () => {
  const state = createGameState({ gameInstanceId: "round-end-loss", players: [{ id: "p1", name: "一" }], seed: 1 });
  const player = state.players.p1;
  player.victoryPoints = 0;
  useRoundEndVictoryPointLoss({
    state,
    player,
    skill: { id: "master.kadoc.skill.s1a", name: "缺乏自信", ownerType: "master", ownerId: "master.kadoc", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" },
    payload: { amount: 1 },
    openDecision: () => undefined,
  });
  assert.equal(player.victoryPoints, 0);
  player.victoryPoints = 3;
  useRoundEndVictoryPointLoss({
    state,
    player,
    skill: { id: "master.kadoc.skill.s1a", name: "缺乏自信", ownerType: "master", ownerId: "master.kadoc", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" },
    payload: { amount: 1 },
    openDecision: () => undefined,
  });
  assert.equal(player.victoryPoints, 2);
});

test("纵欲在魔术工房回合结束获得魔力并扣除战果", () => {
  const state = createGameState({ gameInstanceId: "celenike-round-end", players: [{ id: "p1", name: "塞莱妮可" }], seed: 1 });
  const player = state.players.p1;
  player.mana = 1;
  player.victoryPoints = 3;
  useRoundEndResourceAdjustment({
    state,
    player,
    skill: { id: "master.celenike.skill.s1a", name: "纵欲", ownerType: "master", ownerId: "master.celenike", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" },
    payload: { mana: 2, victoryPointsLoss: 1 },
    openDecision: () => undefined,
  });
  assert.equal(player.mana, 3);
  assert.equal(player.victoryPoints, 2);
});

test("技能效果解析器只提取无条件确定性效果", () => {
  const parsed = parseSkillEffects("行动阶段：抽2张牌。获得3点魔力。若你获胜，获得1点战果。");
  assert.deepEqual(parsed.effects, [
    { kind: "draw-cards", count: 2 },
    { kind: "gain-mana", amount: 3 },
  ]);
  assert.deepEqual(parsed.unparsed, ["若你获胜，获得1点战果"]);
  assert.deepEqual(parsed.clauses.map((clause) => [clause.text, clause.phase, clause.trigger]), [
    ["行动阶段：抽2张牌", "action", "phase"],
    ["获得3点魔力", undefined, "other"],
    ["若你获胜，获得1点战果", undefined, "other"],
  ]);
});

test("技能效果解析器保留令咒和合计威力字段", () => {
  const parsed = parseSkillEffects("立刻恢复一枚令咒。战斗阶段：你的合计威力+2。");
  assert.deepEqual(parsed.effects, [
    { kind: "restore-command-seal", amount: 1 },
    { kind: "combat-power-bonus", amount: 2, scope: "self" },
  ]);
  assert.deepEqual(parsed.unparsed, []);
  assert.equal(parsed.clauses[1].hasCombat, true);
});

test("分段记录牌面明确的子技能标题", () => {
  const parsed = parseSkillEffects("审判-战斗阶段：关闭所有幸运。炽烈燃烧-被动/行动阶段：弃置一张牌。普通说明不应被识别为标题-文本。");
  assert.equal(parsed.clauses[0].sectionName, "审判");
  assert.equal(parsed.clauses[1].sectionName, "炽烈燃烧");
  assert.equal(parsed.clauses[2].sectionName, undefined);
});

test("临时攻击批次按结构化定义原子创建并进入攻击区", () => {
  const state = createGameState({ gameInstanceId: "derived-attack-batch", players: [{ id: "p", name: "伊斯坎达尔" }], seed: 1 });
  state.round = 3;
  const definitions = {
    strength: { id: "strength", name: "力量军势", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true },
    agility: { id: "agility", name: "迅捷军势", cost: 0, basePower: 2, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
  };
  const skill = {
    id: "servant.iskandar.skill.sc-iskandar-np", name: "王之军势", ownerType: "servant" as const, ownerId: "servant.iskandar",
    activation: "phase" as const, windows: ["action"] as const, cost: 8, text: "", supportLevel: "FULL" as const,
    derivedAttackBatch: { count: 5, definitionIds: ["strength", "agility"] },
  };
  const result = useCreateTemporaryAttacks({ state, player: state.players.p, skill, payload: { attributes: ["力量", "迅捷", "力量", "迅捷", "力量"] }, definitions, openDecision: () => undefined }) as { cards: Array<{ instanceId: string }> };
  assert.equal(result.cards.length, 5);
  assert.deepEqual(state.players.p.attack.map((id) => state.cards[id].definitionId), ["strength", "agility", "strength", "agility", "strength"]);
  assert.ok(state.players.p.attack.every((id) => state.cards[id].temporary && state.cards[id].active && state.cards[id].face === "up"));
});

test("固定临时攻击批次无需玩家重复选择属性", () => {
  const state = createGameState({ gameInstanceId: "fixed-derived-attack", players: [{ id: "p", name: "冲田" }], seed: 1 });
  const definitions = { agility4: { id: "agility4", name: "三段突", cost: 0, basePower: 4, typeLabel: "迅捷", attributes: ["迅捷"] } };
  const skill = {
    id: "servant.okita.skill.sc-okita-2", name: "无明三段突", ownerType: "servant" as const, ownerId: "servant.okita",
    activation: "phase" as const, windows: ["action"] as const, cost: 8, text: "", supportLevel: "FULL" as const,
    derivedAttackBatch: { count: 2, definitionIds: ["agility4"] },
  };
  useCreateTemporaryAttacks({ state, player: state.players.p, skill, payload: undefined, definitions, openDecision: () => undefined });
  assert.equal(state.players.p.attack.length, 2);
  assert.ok(state.players.p.attack.every((id) => state.cards[id].definitionId === "agility4"));
});

test("同战场群体威力修正只影响没有地利的对手", () => {
  const state = createGameState({ gameInstanceId: "tomoe-rain", players: [{ id: "tomoe", name: "巴御前" }, { id: "plain", name: "无地利" }, { id: "fortified", name: "有地利" }], seed: 1 });
  state.board.locations.mountain = ["tomoe", "plain", "fortified"];
  for (const id of state.board.locations.mountain) state.players[id].locationId = "mountain";
  state.players.fortified.flags.deploymentBonusActive = true;
  const skill = { id: "servant.tomoe.skill.sc-tomoe-3", name: "真言", ownerType: "servant" as const, ownerId: "servant.tomoe", activation: "phase" as const, windows: ["combat"] as const, cost: 4, text: "", supportLevel: "FULL" as const, opponentCombatPowerBonus: -5, opponentRequiresNoDeploymentBonus: true };
  useSameBattlefieldOpponentPower({ state, player: state.players.tomoe, skill, payload: undefined, openDecision: () => undefined });
  assert.equal(state.players.plain.flags.roundPowerBonus, -5);
  assert.equal(state.players.fortified.flags.roundPowerBonus, undefined);
});

test("全体战斗参与者败北包含技能使用者本人", () => {
  const state = createGameState({ gameInstanceId: "jeanne-red-lotus", players: [{ id: "jeanne", name: "贞德" }, { id: "enemy", name: "对手" }, { id: "away", name: "场外" }], seed: 1 });
  state.board.locations.city = ["jeanne", "enemy"];
  state.players.jeanne.locationId = "city";
  state.players.enemy.locationId = "city";
  state.players.away.locationId = "workshop";
  const skill = { id: "servant.jeanne.skill.sc-jeanne-3", name: "红莲圣女", ownerType: "servant" as const, ownerId: "servant.jeanne", activation: "phase" as const, windows: ["combat"] as const, cost: 6, text: "", supportLevel: "FULL" as const, defeatScope: "all-combat-participants" as const };
  useDefeatCombatParticipants({ state, player: state.players.jeanne, skill, payload: undefined, openDecision: () => undefined });
  assert.equal(state.players.jeanne.defeated, true);
  assert.equal(state.players.enemy.defeated, true);
  assert.equal(state.players.away.defeated, false);
});

test("天之衣只在上一回合共同战斗者于高潮被淘汰后下一回合获得2战果", () => {
  const state = createGameState({ gameInstanceId: "illya-heavenly-garment", players: [{ id: "illya", name: "伊莉雅" }, { id: "victim", name: "被淘汰者" }, { id: "other", name: "其他" }], seed: 1 });
  const player = state.players.illya;
  player.masterId = "master.iliya";
  const context = { state, player, skill: { id: "master.iliya.skill.s4", name: "天之衣", ownerType: "master" as const, ownerId: "master.iliya", activation: "passive" as const, windows: [] as const, cost: 0, text: "", supportLevel: "FULL" as const }, openDecision: () => undefined };
  useIllyaHeavenlyGarment({ ...context, payload: { eventType: "combat.resolved", event: { powers: { illya: 2, victim: 1 } } } });
  useIllyaHeavenlyGarment({ ...context, payload: { eventType: "round.ended", event: { eliminatedThisRound: ["victim"] } } });
  useIllyaHeavenlyGarment({ ...context, payload: { eventType: "round.started", event: {} } });
  assert.equal(player.victoryPoints, 2);
  assert.equal(player.flags.illyaHeavenlyGarmentPending, undefined);
  assert.equal(player.flags.illyaCombatParticipants, undefined);
});

test("间桐樱此世全部之恶只在第八回合结束且未列第一时激活被污染的圣杯", () => {
  const state = createGameState({ gameInstanceId: "sakura-grail-trigger", players: [
    { id: "sakura", name: "樱" },
    { id: "leader", name: "第一名" },
  ], seed: 1 });
  const player = state.players.sakura;
  player.masterId = "master.sakura";
  player.masterSkills.push("grail-card");
  state.cards["grail-card"] = {
    instanceId: "grail-card",
    definitionId: "master.sakura.skill.s4",
    ownerPlayerId: "sakura",
    controllerPlayerId: "sakura",
    zone: "master-skills",
    face: "down",
    active: false,
    residual: false,
    temporary: false,
    modifiers: [],
  };
  state.players.leader.victoryPoints = 5;
  player.victoryPoints = 4;
  state.round = 8;
  useSakuraCorruptedGrailTrigger({
    state,
    player,
    skill: {
      id: "master.sakura.skill.s2",
      name: "此世全部之恶",
      ownerType: "master",
      ownerId: "master.sakura",
      activation: "passive",
      windows: [],
      cost: 0,
      activateSkillDefinitionId: "master.sakura.skill.s4",
      text: "",
      supportLevel: "FULL",
    },
    payload: { eventType: "round.ended", event: { round: 8 } },
    openDecision: () => undefined,
  });
  assert.equal(state.cards["grail-card"].active, true);
  assert.equal(player.flags.infiniteMana, true);
  assert.equal(player.flags.extraStandardAttackCards, 1);
  player.victoryPoints = 5;
  state.cards["grail-card"].active = false;
  useSakuraCorruptedGrailTrigger({
    state,
    player,
    skill: {
      id: "master.sakura.skill.s2",
      name: "此世全部之恶",
      ownerType: "master",
      ownerId: "master.sakura",
      activation: "passive",
      windows: [],
      cost: 0,
      activateSkillDefinitionId: "master.sakura.skill.s4",
      text: "",
      supportLevel: "FULL",
    },
    payload: { eventType: "round.ended", event: { round: 8 } },
    openDecision: () => undefined,
  });
  assert.equal(state.cards["grail-card"].active, false);
});

test("间桐樱欠损容器只在战果低于所有其他玩家且第一名御主非慎二时激活黑泥", () => {
  const state = createGameState({ gameInstanceId: "sakura-black-mud-trigger", players: [
    { id: "sakura", name: "樱" },
    { id: "leader", name: "第一名" },
    { id: "middle", name: "第二名" },
  ], seed: 1 });
  const player = state.players.sakura;
  player.masterId = "master.sakura";
  player.masterSkills.push("black-mud-card");
  state.cards["black-mud-card"] = {
    instanceId: "black-mud-card",
    definitionId: "master.sakura.skill.s3",
    ownerPlayerId: "sakura",
    controllerPlayerId: "sakura",
    zone: "master-skills",
    face: "down",
    active: false,
    residual: false,
    temporary: false,
    modifiers: [],
  };
  const skill = {
    id: "master.sakura.skill.s1",
    name: "欠损容器",
    ownerType: "master" as const,
    ownerId: "master.sakura",
    activation: "passive" as const,
    windows: [] as const,
    cost: 0,
    activateSkillDefinitionId: "master.sakura.skill.s3",
    text: "",
    supportLevel: "FULL" as const,
  };
  state.players.leader.victoryPoints = 5;
  state.players.middle.victoryPoints = 3;
  player.victoryPoints = 2;
  useSakuraCorruptedGrailTrigger({
    state,
    player,
    skill,
    payload: { eventType: "round.ended", event: { round: 3 } },
    openDecision: () => undefined,
  });
  assert.equal(state.cards["black-mud-card"].active, true);
  assert.equal(state.cards["black-mud-card"].face, "up");
  assert.equal(player.flags.infiniteMana, undefined);
  assert.equal(player.flags.extraStandardAttackCards, undefined);

  state.cards["black-mud-card"].active = false;
  player.victoryPoints = 3;
  useSakuraCorruptedGrailTrigger({
    state,
    player,
    skill,
    payload: { eventType: "round.ended", event: { round: 4 } },
    openDecision: () => undefined,
  });
  assert.equal(state.cards["black-mud-card"].active, false);

  player.victoryPoints = 1;
  player.flags.firstMasterId = "master.shinji";
  useSakuraCorruptedGrailTrigger({
    state,
    player,
    skill,
    payload: { eventType: "round.ended", event: { round: 5 } },
    openDecision: () => undefined,
  });
  assert.equal(state.cards["black-mud-card"].active, false);
});

test("天之衣没有共同战斗淘汰者时不会进入奖励状态", () => {
  const state = createGameState({ gameInstanceId: "illya-heavenly-garment-no-reward", players: [{ id: "illya", name: "伊莉雅" }, { id: "victim", name: "被淘汰者" }], seed: 1 });
  const player = state.players.illya;
  player.masterId = "master.iliya";
  const context = { state, player, skill: { id: "master.iliya.skill.s4", name: "天之衣", ownerType: "master" as const, ownerId: "master.iliya", activation: "passive" as const, windows: [] as const, cost: 0, text: "", supportLevel: "FULL" as const }, openDecision: () => undefined };
  useIllyaHeavenlyGarment({ ...context, payload: { eventType: "combat.resolved", event: { powers: { illya: 2 } } } });
  useIllyaHeavenlyGarment({ ...context, payload: { eventType: "round.ended", event: { eliminatedThisRound: ["victim"] } } });
  assert.equal(player.flags.illyaHeavenlyGarmentPending, undefined);
  useIllyaHeavenlyGarment({ ...context, payload: { eventType: "round.started", event: {} } });
  assert.equal(player.victoryPoints, 0);
});

test("小圣杯让攻击费用减1，并在全暗置攻击回合结束获得1魔力", () => {
  const state = createGameState({ gameInstanceId: "illya-small-grail", players: [{ id: "illya", name: "伊莉雅" }], seed: 1 });
  const player = state.players.illya;
  player.masterId = "master.iliya";
  player.mana = 3;
  const skill = { id: "master.iliya.skill.s3", name: "小圣杯", ownerType: "master" as const, ownerId: "master.iliya", activation: "passive" as const, windows: [] as const, cost: 0, text: "", supportLevel: "FULL" as const };
  useIllyaSmallGrail({ state, player, skill, payload: { eventType: "game.started" }, openDecision: () => undefined });
  const card = { id: "attack", name: "攻击", cost: 2, basePower: 2, typeLabel: "力量" };
  const instance = { instanceId: "attack-instance", definitionId: "attack", ownerPlayerId: "illya", controllerPlayerId: "illya", zone: "hand" as const, face: "down" as const, active: false, residual: false, temporary: false, modifiers: [] };
  state.cards[instance.instanceId] = instance;
  assert.equal(getCardPlayCost(state, card, player, instance), 1);
  player.flags.illyaRoundAttackCommitted = true;
  player.flags.illyaRoundFaceUpAttack = false;
  useIllyaSmallGrail({ state, player, skill, payload: { eventType: "round.ended" }, openDecision: () => undefined });
  assert.equal(player.mana, 4);
  assert.equal(player.flags.illyaRoundAttackCommitted, undefined);
});

test("菲奥蕾温顺在低战果对手存在时降低合计威力，并在禁宝具局势压低技能牌", () => {
  const state = createGameState({ gameInstanceId: "fiore-gentle", players: [{ id: "fiore", name: "菲奥蕾" }, { id: "other", name: "其他" }], seed: 1 });
  state.status = "playing";
  state.players.fiore.flags.fioreGentle = true;
  state.players.fiore.victoryPoints = 4;
  state.players.other.victoryPoints = 2;
  state.players.fiore.locationId = "mountain";
  state.players.other.locationId = "mountain";
  state.board.locations.mountain = ["fiore", "other"];
  state.modeState.situationRestrictions = { forbiddenAttributes: ["宝具"] };
  state.cards.skill = { instanceId: "skill", definitionId: "skill", ownerPlayerId: "fiore", controllerPlayerId: "fiore", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.fiore.attack = ["skill"];
  const definitions = { skill: { id: "skill", name: "技能", cost: 0, basePower: 5, typeLabel: "特殊", isSkill: true } };
  assert.equal(calculateCombatPower(state, state.players.fiore, definitions, "mountain"), 0);
});

test("莱昂纳多帝王之气与唐吉诃德事件战果修正接入战斗结算", async () => {
  const { finalizeCombatFromSnapshot } = await import("../src/rules-core/combat.ts");
  const state = createGameState({ gameInstanceId: "event-bonuses", players: [{ id: "leo", name: "莱昂纳多" }, { id: "don", name: "唐吉诃德" }], seed: 1 });
  state.round = 1;
  state.players.leo.flags.leonardoEventRewardBonus = 1;
  state.players.don.flags.donquixoteEventLowBonus = 2;
  state.players.don.flags.donquixoteEventHighPenalty = 2;
  state.board.locations.mountain = ["leo", "don"];
  state.players.leo.locationId = "mountain";
  state.players.don.locationId = "mountain";
  state.players.leo.victoryPoints = 5;
  state.players.don.victoryPoints = 1;
  state.players.leo.attack = [];
  state.players.don.attack = [];
  state.board.currentEvents.mountain = ["low", "high"];
  const snapshot = { locationId: "mountain", participantIds: ["leo", "don"], powers: { leo: 5, don: 1 }, attributes: { leo: [], don: [] }, round: 1 };
  const result = finalizeCombatFromSnapshot(state, snapshot, {}, { low: { id: "low", victoryPoints: 1 }, high: { id: "high", victoryPoints: 4 } });
  assert.deepEqual(result.winnerIds, ["leo"]);
  assert.equal(state.players.leo.victoryPoints, 13);
  assert.equal(state.players.don.victoryPoints, 1);
});

test("誓约胜利之剑在高潮回合获得4点合计威力，并在第11回合记录即时胜利", async () => {
  const { calculateCombatSnapshot, finalizeCombatFromSnapshot } = await import("../src/rules-core/combat.ts");
  const state = createGameState({ gameInstanceId: "saber-np-climax", players: [{ id: "saber", name: "Saber" }], seed: 1 });
  state.status = "playing";
  state.round = 11;
  state.modeState.currentSituationClimax = true;
  state.board.locations.mountain = ["saber"];
  state.players.saber.locationId = "mountain";
  state.cards.np = { instanceId: "np", definitionId: "servant.saber.skill.sc-saber-np", ownerPlayerId: "saber", controllerPlayerId: "saber", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.saber.attack = ["np"];
  const definitions = { "servant.saber.skill.sc-saber-np": { id: "servant.saber.skill.sc-saber-np", name: "誓约胜利之剑", cost: 8, basePower: 12, typeLabel: "力量/宝具", attributes: ["力量", "宝具"], tags: ["climax-total-power-plus-4", "round-eleven-victory"], isSkill: true } };
  const snapshot = calculateCombatSnapshot(state, "mountain", definitions);
  assert.equal(snapshot.powers.saber, 16);
  const result = finalizeCombatFromSnapshot(state, snapshot, definitions, {});
  assert.deepEqual(result.winnerIds, ["saber"]);
  assert.deepEqual(state.modeState.instantVictoryIds, ["saber"]);
});

test("可敬的狙击手只在部署魔术工房时给两处战场本回合固定地利", async () => {
  const { useDanSniper } = await import("../src/rules-core/skill-handlers.ts");
  const state = createGameState({ gameInstanceId: "dan-sniper", players: [{ id: "dan", name: "丹" }], seed: 1 });
  state.round = 2;
  state.players.dan.locationId = "workshop";
  useDanSniper({ state, player: state.players.dan, skill: { id: "master.dan.skill.s1", name: "可敬的狙击手", ownerType: "master", ownerId: "master.dan", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" }, payload: { event: { playerId: "dan", locationId: "workshop" } }, openDecision: () => undefined });
  state.players.dan.locationId = "mountain";
  state.board.locations.mountain = ["dan"];
  assert.equal(calculateCombatPower(state, state.players.dan, {}, "mountain"), 3);
  assert.equal(calculateCombatPower(state, state.players.dan, {}, "city"), 5);
});

test("希耶尔首次真名解放后通过被动事件获得抹大拉的圣骸布", () => {
  const registry = new SkillRegistry();
  registry.register({
    id: "master.caren.skill.s1a",
    name: "执行者",
    ownerType: "master",
    ownerId: "master.caren",
    activation: "passive",
    windows: [],
    cost: 0,
    text: "当你第一次真名解放时，获得【抹大拉的圣骸布】。",
    supportLevel: "FULL",
    handlerId: "core.true-name-add-skill",
    passiveEventTypes: ["servant.true-name-revealed"],
    addSkillDefinitionId: "master.caren.skill.s3",
  });
  registerCoreSkillHandlers(registry);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(registry, passives, effects);
  const state = createGameState({ gameInstanceId: "caren-true-name", players: [{ id: "p", name: "卡莲" }], seed: 1 });
  state.status = "playing";
  state.players.p.masterId = "master.caren";
  enqueuePassiveEffects(state, passives, {
    eventId: "reveal-1",
    type: "servant.true-name-revealed",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { playerId: "p", servantId: "servant.saber" },
  });
  effects.drain(state);
  assert.equal(state.players.p.masterSkills.length, 1);
  assert.equal(state.cards[state.players.p.masterSkills[0]].definitionId, "master.caren.skill.s3");
});

test("言峰绮礼两幅面孔随真名状态记录监督者或执行者", () => {
  const registry = new SkillRegistry();
  registry.register({
    id: "master.kirei.skill.s1",
    name: "两幅面孔",
    ownerType: "master",
    ownerId: "master.kirei",
    activation: "passive",
    windows: [],
    cost: 0,
    text: "当从者真名隐藏时，你是监督者；其他情况下，你是执行者。",
    supportLevel: "FULL",
    handlerId: "core.kirei-role",
    passiveEventTypes: ["game.started", "servant.true-name-revealed"],
  });
  registerCoreSkillHandlers(registry);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(registry, passives, effects);
  const state = createGameState({ gameInstanceId: "kirei-role", players: [{ id: "p", name: "绮礼" }], seed: 3 });
  state.status = "playing";
  state.players.p.masterId = "master.kirei";
  state.players.p.servantId = "servant.saber";
  enqueuePassiveEffects(state, passives, {
    eventId: "start",
    type: "game.started",
    revision: state.revision,
    sourceCommandId: "test",
    payload: {},
  });
  effects.drain(state);
  assert.equal(state.players.p.flags.kireiRole, "overseer");
  state.players.p.trueNameRevealed = true;
  enqueuePassiveEffects(state, passives, {
    eventId: "reveal",
    type: "servant.true-name-revealed",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { playerId: "p", servantId: "servant.saber" },
  });
  effects.drain(state);
  assert.equal(state.players.p.flags.kireiRole, "executor");
});

test("希耶尔的交战豁免允许其他玩家从同战场正常移动", () => {
  const state = createGameState({ gameInstanceId: "ciel-move", players: [{ id: "ciel", name: "希耶尔" }, { id: "mover", name: "移动者" }], seed: 1 });
  state.status = "playing";
  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "mover";
  state.players.ciel.locationId = "mountain";
  state.players.mover.locationId = "mountain";
  state.players.mover.mana = 4;
  state.players.ciel.flags.ignoreOthersEngagement = true;
  state.board.locations.mountain = ["ciel", "mover"];
  assert.doesNotThrow(() => movePlayer(state, "mover", "city"));
  assert.equal(state.players.mover.locationId, "city");
});

test("兰斯洛特不为一己之荣光允许低于8魔力打出从者技能，但令咒归零时禁止真名解放", () => {
  const state = createGameState({ gameInstanceId: "lance-glory", players: [{ id: "p", name: "兰斯洛特" }], seed: 1 });
  state.status = "playing";
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "p";
  state.players.p.servantId = "servant.lance";
  state.players.p.mana = 1;
  state.players.p.flags.servantSkillEightManaWaiver = true;
  state.players.p.flags.preventTrueNameRevealWhenNoSeals = true;
  const instanceId = "lance-skill";
  state.cards[instanceId] = { instanceId, definitionId: "servant.lance.skill.sc-lance-2", ownerPlayerId: "p", controllerPlayerId: "p", zone: "servant-skills", face: "up", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p.servantSkills = [instanceId];
  const definitions = {
    "servant.lance.skill.sc-lance-2": { id: "servant.lance.skill.sc-lance-2", name: "不为一己之荣光", cost: 0, basePower: 0, typeLabel: "特殊", attributes: ["特殊"], isSkill: true, skillOwnerType: "servant" as const, requiresEightMana: true },
  };
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "p", instanceId, definitions, faceDown: false }));
  state.players.p.commandSeals = 0;
  state.players.p.trueNameRevealed = false;
  const revealCard = { ...definitions[instanceId], revealsTrueNameOnPlay: true };
  assert.equal(state.players.p.flags.preventTrueNameRevealWhenNoSeals, true);
  assert.equal(revealCard.revealsTrueNameOnPlay, true);
});

test("混沌恐惧只将同战场对手的幸运攻击威力归零", () => {
  const registry = new SkillRegistry();
  registry.register({
    id: "master.chaos.skill.s9",
    name: "恐惧",
    ownerType: "master",
    ownerId: "master.chaos",
    activation: "phase",
    windows: ["combat"],
    cost: 0,
    text: "支配-战斗阶段：将与你位于同一战场的所有【幸运】的威力变为0",
    supportLevel: "FULL",
    handlerId: "core.chaos-fear",
  });
  registerCoreSkillHandlers(registry);
  const state = createGameState({
    gameInstanceId: "chaos-fear",
    players: [{ id: "chaos", name: "Chaos" }, { id: "opponent", name: "Opponent" }, { id: "other", name: "Other" }],
    seed: 7,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "chaos";
  state.players.chaos.masterId = "master.chaos";
  state.players.chaos.locationId = "mountain";
  state.players.opponent.locationId = "mountain";
  state.players.other.locationId = "city";
  state.board.locations.mountain = ["chaos", "opponent"];
  state.board.locations.city = ["other"];
  state.cards.lucky = {
    instanceId: "lucky",
    definitionId: "lucky",
    ownerPlayerId: "opponent",
    controllerPlayerId: "opponent",
    zone: "attack",
    face: "up",
    active: true,
    residual: false,
    temporary: false,
    modifiers: [],
  };
  state.players.opponent.attack = ["lucky"];
  const definitions = {
    "lucky": { id: "lucky", name: "幸运", cost: 0, basePower: 4, typeLabel: "特殊", basic: true },
  };
  registry.execute(state, "chaos", "master.chaos.skill.s9", undefined, () => undefined, () => 0, definitions);
  assert.equal(calculateCombatCardPower(state, state.players.opponent, "lucky", definitions, "mountain"), 0);
});

test("天地乖离开辟之星只令同战场控制特殊属性宝具的交战对手败北", () => {
  const registry = new SkillRegistry();
  registry.register({
    id: "servant.gil.skill.sc-gil-np",
    name: "天地乖离开辟之星",
    ownerType: "servant",
    ownerId: "servant.gil",
    activation: "phase",
    windows: ["combat"],
    cost: 0,
    text: "战斗阶段：令所有控制特殊属性宝具的交战对手败北",
    supportLevel: "FULL",
    handlerId: "core.gilgamesh-enuma-elish",
    requiresActiveCard: true,
  });
  registerCoreSkillHandlers(registry);
  const state = createGameState({
    gameInstanceId: "gil-enuma",
    players: [{ id: "gil", name: "吉尔" }, { id: "special", name: "特殊宝具" }, { id: "other", name: "其他" }],
    seed: 1,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "gil";
  state.players.gil.servantId = "servant.gil";
  state.players.gil.locationId = "mountain";
  state.players.special.locationId = "mountain";
  state.players.other.locationId = "city";
  state.board.locations.mountain = ["gil", "special"];
  state.board.locations.city = ["other"];
  state.cards.np = {
    instanceId: "np",
    definitionId: "np",
    ownerPlayerId: "special",
    controllerPlayerId: "special",
    zone: "attack",
    face: "up",
    active: true,
    residual: false,
    temporary: false,
    modifiers: [],
  };
  state.players.special.attack = ["np"];
  const definitions = {
    "servant.gil.skill.sc-gil-np": { id: "servant.gil.skill.sc-gil-np", name: "天地乖离开辟之星", cost: 0, basePower: 10, typeLabel: "宝具", attributes: ["宝具"], isSkill: true, skillOwnerType: "servant" as const },
    np: { id: "np", name: "特殊宝具", cost: 0, basePower: 5, typeLabel: "特殊/宝具", attributes: ["特殊", "宝具"] },
  };
  assert.equal(registry.getLegalActions(state, "gil", definitions).length, 0);
  state.cards.gilSkill = {
    instanceId: "gilSkill",
    definitionId: "servant.gil.skill.sc-gil-np",
    ownerPlayerId: "gil",
    controllerPlayerId: "gil",
    zone: "attack",
    face: "up",
    active: true,
    residual: false,
    temporary: false,
    modifiers: [],
  };
  state.players.gil.attack = ["gilSkill"];
  assert.equal(registry.getLegalActions(state, "gil", definitions).length, 1);
  registry.execute(state, "gil", "servant.gil.skill.sc-gil-np", undefined, () => undefined, () => 0, definitions);
  assert.equal(state.players.special.defeated, true);
  assert.equal(state.players.other.defeated, false);
});

test("起源弹按规则向上取整损失三分之一魔力并获得两倍威力", () => {
  const registry = new SkillRegistry();
  registry.register({
    id: "master.kiritsugu.skill.s4",
    name: "起源弹",
    ownerType: "master",
    ownerId: "master.kiritsugu",
    activation: "phase",
    windows: ["combat"],
    cost: 0,
    text: "战斗阶段：令一名你的交战对手失去三分之一的魔力（向上取整），然后此牌获得等同于其失去魔力值二倍的威力",
    supportLevel: "FULL",
    handlerId: "core.kiritsugu-origin-bullet",
  });
  registerCoreSkillHandlers(registry);
  const state = createGameState({
    gameInstanceId: "origin-bullet",
    players: [{ id: "kiritsugu", name: "切嗣" }, { id: "target", name: "目标" }],
    seed: 1,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "kiritsugu";
  state.players.kiritsugu.masterId = "master.kiritsugu";
  state.players.kiritsugu.locationId = "mountain";
  state.players.target.locationId = "mountain";
  state.players.target.mana = 10;
  state.board.locations.mountain = ["kiritsugu", "target"];
  state.cards.origin = {
    instanceId: "origin",
    definitionId: "master.kiritsugu.skill.s4",
    ownerPlayerId: "kiritsugu",
    controllerPlayerId: "kiritsugu",
    zone: "attack",
    face: "up",
    active: true,
    residual: false,
    temporary: false,
    modifiers: [],
  };
  state.players.kiritsugu.attack = ["origin"];
  const definitions = {
    "master.kiritsugu.skill.s4": { id: "master.kiritsugu.skill.s4", name: "起源弹", cost: 0, basePower: 2, typeLabel: "迅捷", attributes: ["迅捷"], isSkill: true },
  };
  assert.equal(registry.getLegalActions(state, "kiritsugu", definitions).length, 1);
  registry.execute(state, "kiritsugu", "master.kiritsugu.skill.s4", { targetPlayerId: "target" }, () => undefined, () => 0, definitions);
  assert.equal(state.players.target.mana, 6);
  assert.equal(calculateCombatCardPower(state, state.players.kiritsugu, "origin", definitions, "mountain"), 10);
});

test("魔术师杀手开局把牌库一张牌替换为起源弹且重复触发幂等", () => {
  const state = createGameState({ gameInstanceId: "kiritsugu-start", players: [{ id: "p", name: "P" }], seed: 1 });
  state.cards.deckCard = {
    instanceId: "deckCard",
    definitionId: "card.normal",
    ownerPlayerId: "p",
    controllerPlayerId: "p",
    zone: "deck",
    face: "down",
    active: false,
    residual: false,
    temporary: false,
    modifiers: [],
  };
  state.players.p.deck = ["deckCard"];
  useGameStartReplaceDeckCard({
    state,
    player: state.players.p,
    skill: { id: "master.kiritsugu.skill.s1", name: "魔术师杀手", ownerType: "master", ownerId: "master.kiritsugu", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" },
    payload: undefined,
    openDecision: () => undefined,
  });
  assert.equal(state.cards.deckCard.definitionId, "card.card-origin");
  useGameStartReplaceDeckCard({
    state,
    player: state.players.p,
    skill: { id: "master.kiritsugu.skill.s1", name: "魔术师杀手", ownerType: "master", ownerId: "master.kiritsugu", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" },
    payload: undefined,
    openDecision: () => undefined,
  });
  assert.deepEqual(state.players.p.deck, ["deckCard"]);
});

test("混沌亵渎在发动者获胜时结算战果并惩罚本场败者", () => {
  const state = createGameState({ gameInstanceId: "chaos-sacrifice", players: [{ id: "chaos", name: "Chaos" }, { id: "loser", name: "Loser" }], seed: 1 });
  state.round = 3;
  state.players.chaos.victoryPoints = 1;
  state.players.loser.victoryPoints = 5;
  const base = {
    state,
    player: state.players.chaos,
    skill: { id: "master.chaos.skill.s7", name: "亵渎", ownerType: "master" as const, ownerId: "master.chaos", activation: "phase" as const, windows: ["combat" as const], cost: 1, text: "", supportLevel: "FULL" as const },
    openDecision: () => undefined,
    payload: undefined,
  };
  useChaosSacrifice(base);
  useChaosSacrifice({ ...base, payload: { event: { winnerIds: ["chaos"], powers: { chaos: 5, loser: 2 } } } });
  assert.equal(state.players.chaos.victoryPoints, 3);
  assert.equal(state.players.loser.victoryPoints, 3);
  assert.equal(state.players.chaos.flags.chaosSacrificeRound, undefined);
});

test("混沌幻影只增强本回合自己的宝具攻击", () => {
  const state = createGameState({ gameInstanceId: "chaos-phantom", players: [{ id: "chaos", name: "Chaos" }], seed: 1 });
  state.round = 2;
  useChaosPhantom({
    state,
    player: state.players.chaos,
    skill: { id: "master.chaos.skill.s14", name: "幻影", ownerType: "master", ownerId: "master.chaos", activation: "phase" as const, windows: ["combat" as const], cost: 1, text: "", supportLevel: "FULL" as const },
    payload: undefined,
    openDecision: () => undefined,
  });
  state.cards.noble = { instanceId: "noble", definitionId: "noble", ownerPlayerId: "chaos", controllerPlayerId: "chaos", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards.strength = { instanceId: "strength", definitionId: "strength", ownerPlayerId: "chaos", controllerPlayerId: "chaos", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  const definitions = {
    noble: { id: "noble", name: "宝具", cost: 0, basePower: 4, typeLabel: "宝具", attributes: ["宝具"] },
    strength: { id: "strength", name: "力量", cost: 0, basePower: 4, typeLabel: "力量", attributes: ["力量"] },
  };
  assert.equal(calculateCombatCardPower(state, state.players.chaos, "noble", definitions, "mountain"), 6);
  assert.equal(calculateCombatCardPower(state, state.players.chaos, "strength", definitions, "mountain"), 4);
});

test("阿尔托莉雅风王结界在真名隐藏时费用减少2并归零力量攻击", () => {
  const state = createGameState({ gameInstanceId: "saber-windbreaker", players: [{ id: "saber", name: "Saber" }, { id: "enemy", name: "Enemy" }], seed: 1 });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "saber";
  state.players.saber.servantId = "servant.saber";
  state.players.saber.locationId = "mountain";
  state.players.enemy.locationId = "mountain";
  state.board.locations.mountain = ["saber", "enemy"];
  state.cards.wind = { instanceId: "wind", definitionId: "servant.saber.skill.sc-saber-2", ownerPlayerId: "saber", controllerPlayerId: "saber", zone: "servant-skills", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards.strength = { instanceId: "strength", definitionId: "strength", ownerPlayerId: "enemy", controllerPlayerId: "enemy", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.saber.attack = ["wind"];
  state.players.enemy.attack = ["strength"];
  const definitions = {
    "servant.saber.skill.sc-saber-2": { id: "servant.saber.skill.sc-saber-2", name: "风王结界", cost: 4, basePower: 4, typeLabel: "魔术/宝具", attributes: ["魔术", "宝具"], isSkill: true, hiddenTrueNameCostReduction: 2 },
    strength: { id: "strength", name: "力量", cost: 0, basePower: 5, typeLabel: "力量", attributes: ["力量"], basic: true },
  };
  assert.equal(getCardPlayCost(state, definitions["servant.saber.skill.sc-saber-2"], state.players.saber, state.cards.wind), 2);
  useZeroOpponentAttribute({
    state,
    player: state.players.saber,
    skill: { id: "servant.saber.skill.sc-saber-2", name: "风王结界", ownerType: "servant", ownerId: "servant.saber", activation: "phase", windows: ["combat"], cost: 4, text: "", supportLevel: "FULL", combatPowerZeroAttribute: "力量" },
    payload: undefined,
    openDecision: () => undefined,
    definitions,
  });
  assert.equal(calculateCombatCardPower(state, state.players.enemy, "strength", definitions, "mountain"), 0);
});

test("亚瑟风王结界的开局被动锁定真名，仍可在战斗阶段归零力量攻击", () => {
  const state = createGameState({ gameInstanceId: "arthur-windbreaker", players: [{ id: "arthur", name: "Arthur" }, { id: "enemy", name: "Enemy" }], seed: 1 });
  state.players.arthur.servantId = "servant.arthur";
  useArthurWindbreaker({
    state,
    player: state.players.arthur,
    skill: { id: "servant.arthur.skill.sc-arthur-2", name: "风王结界", ownerType: "servant", ownerId: "servant.arthur", activation: "passive", windows: [], cost: 2, text: "", supportLevel: "FULL" },
    payload: { eventType: "game.started" },
    openDecision: () => undefined,
  });
  assert.equal(state.players.arthur.flags.preventTrueNameReveal, true);
});

test("混沌猎手按同战场对手人数增加合计威力并在回合结束清理", () => {
  const state = createGameState({ gameInstanceId: "chaos-hunter", players: [{ id: "chaos", name: "Chaos" }, { id: "one", name: "One" }, { id: "two", name: "Two" }], seed: 1 });
  state.round = 4;
  state.players.chaos.locationId = "mountain";
  state.players.one.locationId = "mountain";
  state.players.two.locationId = "mountain";
  state.board.locations.mountain = ["chaos", "one", "two"];
  useChaosHunter({
    state,
    player: state.players.chaos,
    skill: { id: "master.chaos.skill.s2", name: "猎手", ownerType: "master", ownerId: "master.chaos", activation: "phase", windows: ["combat"], cost: 1, text: "", supportLevel: "FULL" },
    payload: undefined,
    openDecision: () => undefined,
  });
  state.cards.attack = { instanceId: "attack", definitionId: "attack", ownerPlayerId: "chaos", controllerPlayerId: "chaos", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.chaos.attack = ["attack"];
  const definitions = { attack: { id: "attack", name: "基础攻击", cost: 0, basePower: 3, typeLabel: "力量", attributes: ["力量"] } };
  assert.equal(calculateCombatCardPower(state, state.players.chaos, "attack", definitions, "mountain"), 3);
  assert.equal(calculateCombatPower(state, state.players.chaos, definitions, "mountain"), 5);
});

test("穿刺死棘之枪只有一个交战对手时令其败北", () => {
  const state = createGameState({ gameInstanceId: "cu-gae-bolg", players: [{ id: "cu", name: "Cu" }, { id: "enemy", name: "Enemy" }, { id: "other", name: "Other" }], seed: 1 });
  state.players.cu.locationId = "mountain";
  state.players.enemy.locationId = "mountain";
  state.players.other.locationId = "city";
  state.board.locations.mountain = ["cu", "enemy"];
  state.board.locations.city = ["other"];
  useCuGaeBolg({
    state,
    player: state.players.cu,
    skill: { id: "servant.cu.skill.sc-cu-1", name: "穿刺死棘之枪", ownerType: "servant", ownerId: "servant.cu", activation: "phase", windows: ["combat"], cost: 2, text: "", supportLevel: "FULL" },
    payload: undefined,
    openDecision: () => undefined,
  });
  assert.equal(state.players.enemy.defeated, true);
});

test("明确魔力上限通过统一资源入口生效", () => {
  const state = createGameState({ gameInstanceId: "mana-cap", players: [{ id: "p", name: "P" }], seed: 1 });
  const player = state.players.p;
  player.flags.manaCap = 16;
  player.mana = 15;
  assert.equal(gainMana(player, 4), 1);
  assert.equal(player.mana, 16);
});

test("连环杀手开局获得死之艺术，工房不获得魔力，部署后激活目标牌", () => {
  const state = createGameState({ gameInstanceId: "chain-killer", players: [{ id: "p", name: "P" }], seed: 1 });
  state.players.p.masterId = "master.ryuunosuke";
  useRyuunosukeChainKiller({
    state,
    player: state.players.p,
    skill: { id: "master.ryuunosuke.skill.s1", name: "连环杀手", ownerType: "master", ownerId: "master.ryuunosuke", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL", addSkillDefinitionId: "master.ryuunosuke.skill.s2", activationTargetDefinitionId: "master.ryuunosuke.skill.s2", playerFlags: { noWorkshopManaGain: true } },
    payload: { eventType: "game.started" },
    openDecision: () => undefined,
  });
  const instanceId = state.players.p.masterSkills[0];
  assert.equal(state.cards[instanceId].definitionId, "master.ryuunosuke.skill.s2");
  assert.equal(state.players.p.flags.noWorkshopManaGain, true);
  useRyuunosukeChainKiller({
    state,
    player: state.players.p,
    skill: { id: "master.ryuunosuke.skill.s1", name: "连环杀手", ownerType: "master", ownerId: "master.ryuunosuke", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL", addSkillDefinitionId: "master.ryuunosuke.skill.s2", activationTargetDefinitionId: "master.ryuunosuke.skill.s2", playerFlags: { noWorkshopManaGain: true } },
    payload: { eventType: "player.deployed", event: { playerId: "p", locationId: "workshop" } },
    openDecision: () => undefined,
  });
  assert.equal(state.cards[instanceId].active, true);
});

test("刻印虫安装工房额外魔力和逐步移动费用修正", () => {
  const state = createGameState({ gameInstanceId: "kariya-insects", players: [{ id: "p", name: "P" }], seed: 1 });
  useKariyaInsects({
    state,
    player: state.players.p,
    skill: { id: "master.kariya.skill.s1", name: "刻印虫", ownerType: "master", ownerId: "master.kariya", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" },
    payload: { eventType: "game.started" },
    openDecision: () => undefined,
  });
  assert.equal(state.players.p.flags.kariyaWorkshopManaBonus, 2);
  assert.equal(state.players.p.flags.kariyaMoveSurcharge, 1);
});

test("第七回合明确的总威力负修正在回合开始生效", () => {
  const state = createGameState({ gameInstanceId: "round-power-penalty", players: [{ id: "p", name: "P" }], seed: 1 });
  state.round = 7;
  useRoundStartPowerBonus({
    state,
    player: state.players.p,
    skill: { id: "master.ophelia.skill.s1b", name: "童年创伤", ownerType: "master", ownerId: "master.ophelia", activation: "passive", windows: [], cost: 0, combatPowerBonus: -10, text: "", supportLevel: "FULL" },
    payload: { round: 7 },
    openDecision: () => undefined,
  });
  assert.equal(state.players.p.flags.roundPowerBonus, -10);
});

test("莱昂纳多生而为王按连续战斗胜利获得下一回合威力", () => {
  const state = createGameState({ gameInstanceId: "leonardo-history", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing";
  state.round = 1;
  const skill = { id: "master.leonardo.skill.s1", name: "生而为王", ownerType: "master", ownerId: "master.leonardo", activation: "passive", windows: [], cost: 0, combatHistory: "leonardo-victory-streak", text: "", supportLevel: "FULL" } as never;
  useCombatHistory({ state, player: state.players.p, skill, payload: { event: { powers: { p: 5 }, winnerIds: ["p"] } }, openDecision: () => undefined });
  state.round = 2;
  assert.equal(calculateCombatPower(state, state.players.p, {}), 3);
  useCombatHistory({ state, player: state.players.p, skill, payload: { event: { powers: { p: 5 }, winnerIds: ["p"] } }, openDecision: () => undefined });
  state.round = 3;
  assert.equal(calculateCombatPower(state, state.players.p, {}), 5);
});

test("远野志贵贫血症在上回合争夺战后下一回合减少2点合计威力", () => {
  const state = createGameState({ gameInstanceId: "nanaya-history", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing";
  state.round = 1;
  const skill = { id: "master.shiki-nanaya.skill.s1a", name: "贫血症", ownerType: "master", ownerId: "master.shiki-nanaya", activation: "passive", windows: [], cost: 0, combatHistory: "nanaya-contested-combat", text: "", supportLevel: "FULL" } as never;
  useCombatHistory({ state, player: state.players.p, skill, payload: { event: { powers: { p: 5, opponent: 6 }, winnerIds: ["opponent"] } }, openDecision: () => undefined });
  state.round = 2;
  assert.equal(calculateCombatPower(state, state.players.p, {}), 0);
});

test("巴泽特第一天只在首回合施加彷徨的2点合计威力惩罚", () => {
  const state = createGameState({ gameInstanceId: "bazett-first-day", players: [{ id: "bazett", name: "巴泽特" }], seed: 1 });
  state.status = "playing";
  state.round = 1;
  state.players.bazett.flags.firstDayPowerPenalty = -2;
  state.players.bazett.flags.bazettDay = 1;
  assert.equal(calculateCombatPower(state, state.players.bazett, {}), 0);
  state.round = 2;
  state.players.bazett.flags.bazettDay = 2;
  assert.equal(calculateCombatPower(state, state.players.bazett, {}), 0);
});

test("巴泽特时间迷失在战败后下回合再启动，并在第四日战斗胜利时觉醒", () => {
  const state = createGameState({ gameInstanceId: "bazett-time-loop", players: [{ id: "bazett", name: "巴泽特" }], seed: 1 });
  state.status = "playing";
  state.round = 1;
  const base = (id: string) => ({ id, ownerType: "master" as const, ownerId: "master.bazett", activation: "passive" as const, windows: [] as never[], cost: 0, text: "", supportLevel: "FULL" as const });
  useBazettTimeLoop({ state, player: state.players.bazett, skill: { id: "master.bazett.skill.s1a", ...base("master.bazett.skill.s1a") } as never, payload: { eventType: "game.started" }, openDecision: () => undefined });
  state.players.bazett.defeated = true;
  useBazettTimeLoop({ state, player: state.players.bazett, skill: { id: "master.bazett.skill.s1a", ...base("master.bazett.skill.s1a") } as never, payload: { eventType: "combat.resolved", event: { winnerIds: [] } }, openDecision: () => undefined });
  state.round = 2;
  const before = state.players.bazett.victoryPoints;
  useBazettTimeLoop({ state, player: state.players.bazett, skill: { id: "master.bazett.skill.s1a", ...base("master.bazett.skill.s1a") } as never, payload: { eventType: "round.started" }, openDecision: () => undefined });
  assert.equal(state.players.bazett.flags.bazettDay, 1);
  assert.equal(state.players.bazett.victoryPoints, before + 1);
  state.players.bazett.flags.bazettDay = 4;
  state.players.bazett.commandSeals = 0;
  state.cards.fragarach = { instanceId: "fragarach", definitionId: "master.bazett.skill.s2", ownerPlayerId: "bazett", controllerPlayerId: "bazett", zone: "discard", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.bazett.discard.push("fragarach");
  useBazettTimeLoop({ state, player: state.players.bazett, skill: { id: "master.bazett.skill.s4", ...base("master.bazett.skill.s4") } as never, payload: { eventType: "combat.resolved", event: { winnerIds: ["bazett"] } }, openDecision: () => undefined });
  assert.equal(state.players.bazett.flags.bazettAwakened, true);
  assert.equal(state.players.bazett.commandSeals, 3);
  assert.equal(state.cards.fragarach.zone, "master-skills");
});

test("间桐雁夜虚妄梦境绑定右侧宿敌，并结算宿敌限制与奖励", async () => {
  const state = createGameState({ gameInstanceId: "kariya-nemesis", players: [
    { id: "kariya", name: "雁夜" }, { id: "nemesis", name: "宿敌" }, { id: "other", name: "其他" },
  ], seed: 1 });
  state.status = "playing";
  state.players.kariya.masterId = "master.kariya";
  state.players.nemesis.locationId = "mountain";
  state.players.kariya.locationId = "mountain";
  state.board.locations.mountain = ["kariya", "nemesis"];
  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "nemesis";
  const base = (id: string) => ({ id, name: id, ownerType: "master" as const, ownerId: "master.kariya", activation: "passive" as const, windows: [] as never[], cost: 0, text: "", supportLevel: "FULL" as const });
  useKariyaNemesis({ state, player: state.players.kariya, skill: base("master.kariya.skill.s2") as never, payload: { eventType: "game.started" }, openDecision: () => undefined });
  assert.equal(state.players.kariya.flags.kariyaNemesisPlayerId, "nemesis");
  assert.equal(state.players.nemesis.flags.nemesisMasterId, "master.kariya");
  assert.throws(() => movePlayer(state, "nemesis", "city"), /KARIYA_NEMESIS_CANNOT_LEAVE/);
  assert.equal(calculateCombatPower(state, state.players.kariya, {}, "mountain"), 0);
  useKariyaNemesis({ state, player: state.players.kariya, skill: base("master.kariya.skill.s3") as never, payload: { eventType: "combat.resolved", event: { locationId: "mountain", winnerIds: ["kariya"], powers: { kariya: 0, nemesis: -1 } } }, openDecision: () => undefined });
  assert.equal(state.players.kariya.victoryPoints, 3);
  useKariyaNemesis({ state, player: state.players.kariya, skill: base("master.kariya.skill.s3") as never, payload: { eventType: "round.ended", event: { eliminatedThisRound: ["nemesis"] } }, openDecision: () => undefined });
  assert.equal(state.players.kariya.victoryPoints, 7);
  assert.equal(state.players.kariya.flags.kariyaCollapse, true);
});

test("回路不良通过统一资源入口限制每回合总魔力获得", () => {
  const state = createGameState({ gameInstanceId: "fiore-mana-cap", players: [{ id: "p", name: "P" }], seed: 1 });
  const player = state.players.p;
  player.mana = 0;
  player.flags.roundManaGainCap = 2;
  assert.equal(gainMana(player, 5), 2);
  assert.equal(player.flags.roundManaGained, 2);
  assert.equal(gainMana(player, 1), 0);
  assert.equal(player.mana, 2);
});

test("混沌巨鲨只能令同战场控制远隔操作的对手败北", () => {
  const state = createGameState({ gameInstanceId: "chaos-giant-shark", players: [{ id: "chaos", name: "混沌" }, { id: "target", name: "目标" }, { id: "other", name: "其他" }], seed: 1 });
  state.status = "playing"; state.phase = "combat"; state.step = "player-window";
  state.players.chaos.locationId = "mountain"; state.players.target.locationId = "mountain"; state.players.other.locationId = "city";
  state.board.locations = { workshop: [], mountain: ["chaos", "target"], city: ["other"], scouting: [] };
  const remote = "remote-instance";
  state.cards[remote] = { instanceId: remote, definitionId: "card.cardpreparation", ownerPlayerId: "target", controllerPlayerId: "target", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.target.attack = [remote];
  useChaosGiantShark({ state, player: state.players.chaos, skill: { id: "master.chaos.skill.s8" } as never, payload: { targetPlayerId: "target" }, definitions: { "card.cardpreparation": { id: "card.cardpreparation", name: "远隔操作", cost: 0, basePower: 2, typeLabel: "特殊" } }, openDecision: () => undefined });
  assert.equal(state.players.target.defeated, true);
  assert.equal(state.players.other.defeated, false);
});

test("突穿死翔之枪按交战人数结算战果，胜利时扣除对手同额战果", () => {
  const state = createGameState({ gameInstanceId: "cu-gungnir", players: [{ id: "cu", name: "Cu" }, { id: "a", name: "A" }, { id: "b", name: "B" }], seed: 1 });
  state.players.cu.victoryPoints = 1;
  state.players.a.victoryPoints = 8;
  state.players.b.victoryPoints = 5;
  useCuGungnirReward({
    state,
    player: state.players.cu,
    skill: { id: "servant.cu.skill.sc-cu-np", name: "突穿死翔之枪", ownerType: "servant", ownerId: "servant.cu", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" },
    payload: { event: { powers: { cu: 10, a: 4, b: 2 }, winnerIds: ["cu"] } },
    openDecision: () => undefined,
  });
  assert.equal(state.players.cu.victoryPoints, 3);
  assert.equal(state.players.a.victoryPoints, 6);
  assert.equal(state.players.b.victoryPoints, 3);
});

test("铁腕绅士开局替换牌库中威力最高的两张基础攻击", async () => {
  const { useGoredolfIronFist } = await import("../src/rules-core/skill-handlers.ts");
  const state = createGameState({ gameInstanceId: "goredolf-fist", players: [{ id: "goredolf", name: "戈尔德鲁夫" }], seed: 1 });
  const definitions = {
    "card.low": { id: "card.low", name: "低", cost: 1, basePower: 2, typeLabel: "力量", basic: true },
    "card.high": { id: "card.high", name: "高", cost: 2, basePower: 8, typeLabel: "力量", basic: true },
    "card.mid": { id: "card.mid", name: "中", cost: 2, basePower: 5, typeLabel: "迅捷", basic: true },
    "card.card-gof-fist": { id: "card.card-gof-fist", name: "戈夫铁拳", cost: 2, basePower: 2, typeLabel: "力量", basic: false },
  };
  for (const [instanceId, definitionId] of [["a", "card.low"], ["b", "card.high"], ["c", "card.mid"]]) {
    state.cards[instanceId] = { instanceId, definitionId, ownerPlayerId: "goredolf", controllerPlayerId: "goredolf", zone: "deck", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
    state.players.goredolf.deck.push(instanceId);
  }
  useGoredolfIronFist({
    state,
    player: state.players.goredolf,
    skill: { id: "master.goredolf.skill.s1", name: "铁腕绅士", ownerType: "master", ownerId: "master.goredolf", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" } as never,
    payload: undefined,
    openDecision: () => undefined,
    definitions,
  });
  assert.equal(state.cards.b.definitionId, "card.card-gof-fist");
  assert.equal(state.cards.c.definitionId, "card.card-gof-fist");
  assert.equal(state.cards.a.definitionId, "card.low");
  useGoredolfIronFist({
    state,
    player: state.players.goredolf,
    skill: { id: "master.goredolf.skill.s1", name: "铁腕绅士", ownerType: "master", ownerId: "master.goredolf", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" } as never,
    payload: undefined,
    openDecision: () => undefined,
    definitions,
  });
  assert.equal(state.players.goredolf.deck.filter((instanceId) => state.cards[instanceId].definitionId === "card.card-gof-fist").length, 2);
});

test("荣誉在恰有两名对手的战场胜利时移除竞争战果", () => {
  const state = createGameState({ gameInstanceId: "dan-honor", players: [{ id: "dan", name: "丹" }, { id: "a", name: "甲" }, { id: "b", name: "乙" }], seed: 1 });
  state.round = 1;
  state.players.dan.victoryPoints = 5;
  state.players.dan.masterId = "master.dan";
  state.board.locations.mountain = ["dan", "a", "b"];
  state.players.dan.locationId = "mountain";
  useDanHonor({
    state,
    player: state.players.dan,
    skill: { id: "master.dan.skill.s1a", name: "荣誉", ownerType: "master", ownerId: "master.dan", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" } as never,
    payload: { eventType: "player.moved", event: { playerId: "dan", locationId: "mountain" } },
    openDecision: () => undefined,
  });
  useDanHonor({
    state,
    player: state.players.dan,
    skill: { id: "master.dan.skill.s1a", name: "荣誉", ownerType: "master", ownerId: "master.dan", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "FULL" } as never,
    payload: { eventType: "combat.resolved", event: { locationId: "mountain", winnerIds: ["dan"] } },
    openDecision: () => undefined,
  });
  assert.equal(state.players.dan.victoryPoints, 3);
  assert.equal(state.players.dan.flags.danHonorRound, undefined);
});

test("妄想心音在隐藏真名战斗胜利时追加本回合战果并处理终局对手", () => {
  const state = createGameState({ gameInstanceId: "hassan-np", players: [{ id: "hassan", name: "哈桑" }, { id: "other", name: "对手" }], seed: 1 });
  state.round = 2;
  state.players.hassan.locationId = "mountain";
  state.players.hassan.trueNameRevealed = false;
  state.players.hassan.attack = ["np"];
  state.cards.np = { instanceId: "np", definitionId: "servant.hassan.skill.sc-hassan-np", ownerPlayerId: "hassan", controllerPlayerId: "hassan", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  useHassanNoblePhantasm({
    state,
    player: state.players.hassan,
    skill: { id: "servant.hassan.skill.sc-hassan-np", name: "妄想心音", ownerType: "servant", ownerId: "servant.hassan", activation: "phase", windows: ["combat"], cost: 0, text: "", supportLevel: "FULL" } as never,
    payload: { eventType: "phase" },
    openDecision: () => undefined,
  });
  state.players.hassan.victoryPoints = 4;
  useHassanNoblePhantasm({
    state,
    player: state.players.hassan,
    skill: { id: "servant.hassan.skill.sc-hassan-np", name: "妄想心音", ownerType: "servant", ownerId: "servant.hassan", activation: "phase", windows: ["combat"], cost: 0, text: "", supportLevel: "FULL" } as never,
    payload: { eventType: "combat.resolved", event: { winnerIds: ["hassan"], victoryPoints: { hassan: 3 } } },
    openDecision: () => undefined,
  });
  assert.equal(state.players.hassan.victoryPoints, 7);
  assert.equal(state.players.other.defeated, true);
  assert.equal(state.players.hassan.flags.hassanNoblePhantasmRound, undefined);
});

test("祈祷之弓先击败已有中毒对手并将同战场对手中毒至下一回合结束", () => {
  const state = createGameState({ gameInstanceId: "robin-prayer-bow", players: [
    { id: "robin", name: "罗宾" },
    { id: "poisoned", name: "中毒者" },
    { id: "fresh", name: "新目标" },
    { id: "elsewhere", name: "远处玩家" },
  ], seed: 1 });
  state.status = "playing";
  state.phase = "combat";
  state.round = 4;
  state.players.robin.locationId = "mountain";
  state.players.poisoned.locationId = "mountain";
  state.players.fresh.locationId = "mountain";
  state.players.elsewhere.locationId = "city";
  state.board.locations = { workshop: [], mountain: ["robin", "poisoned", "fresh"], city: ["elsewhere"], scouting: [] };
  state.players.poisoned.statuses = ["poison-until:4"];
  state.players.robin.attack = ["robin-bow"];
  state.cards["robin-bow"] = {
    instanceId: "robin-bow",
    definitionId: "servant.robin.skill.sc-robin-3",
    ownerPlayerId: "robin",
    controllerPlayerId: "robin",
    zone: "attack",
    face: "up",
    active: true,
    residual: false,
    temporary: false,
    modifiers: [],
  };

  useRobinPrayerBow({
    state,
    player: state.players.robin,
    skill: { id: "servant.robin.skill.sc-robin-3", name: "祈祷之弓", ownerType: "servant", ownerId: "servant.robin", activation: "phase", windows: ["combat"], cost: 6, text: "", supportLevel: "FULL" } as never,
    payload: undefined,
    openDecision: () => undefined,
  });

  assert.equal(state.players.poisoned.defeated, true);
  assert.equal(state.players.fresh.defeated, false);
  assert.deepEqual(state.players.poisoned.statuses, ["poison-until:5"]);
  assert.deepEqual(state.players.fresh.statuses, ["poison-until:5"]);
  assert.deepEqual(state.players.elsewhere.statuses, []);
});

test("远离尘世的理想乡第一次高潮淘汰清空魔力并保留继续游戏", async () => {
  const { applyClimaxElimination } = await import("../src/rules-core/rounds.ts");
  const state = createGameState({
    gameInstanceId: "shirou-ideal-land",
    players: [
      { id: "shirou", name: "士郎" },
      { id: "leader", name: "领先者" },
      { id: "other", name: "其他" },
      { id: "middle", name: "中间名次" },
      { id: "fourth", name: "第四名" },
      { id: "fifth", name: "第五名" },
    ],
    seed: 1,
  });
  state.round = 8;
  state.players.shirou.victoryPoints = 0;
  state.players.leader.victoryPoints = 10;
  state.players.other.victoryPoints = 5;
  state.players.middle.victoryPoints = 4;
  state.players.fourth.victoryPoints = 3;
  state.players.fifth.victoryPoints = 1;
  state.players.shirou.mana = 7;
  state.players.shirou.flags.shirouIdealLandReady = true;
  const first = applyClimaxElimination(state);
  assert.deepEqual(first, ["fifth"]);
  assert.equal(state.players.shirou.eliminated, false);
  assert.equal(state.players.shirou.mana, 0);
  assert.equal(state.players.shirou.flags.shirouIdealLandReady, false);
  state.round = 9;
  state.players.shirou.victoryPoints = 0;
  state.players.leader.victoryPoints = 10;
  state.players.other.eliminated = true;
  const second = applyClimaxElimination(state);
  assert.equal(second.includes("shirou"), true);
  assert.equal(state.players.shirou.eliminated, true);
});
