import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { SkillRegistry } from "../src/rules-core/skill-registry.ts";
import { moveToNonWorkshop, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import { createUsageRecord, isUsageAvailable } from "../src/rules-core/usage-limits.ts";

test("技能支持等级边界不会把未实现能力伪装成 FULL", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const skills = buildSkillDefinitions({ masters: [{ id: "master.support", skills: [
    { id: "skill.full", name: "已实现", implementation: "implemented", activation: { kind: "phase", windows: ["action"] } },
    { id: "skill.partial", name: "待迁移", implementation: "pending", activation: { kind: "phase", windows: ["action"] } },
    { id: "skill.manual", name: "人工", implementation: "manual", activation: { kind: "phase", windows: ["action"] } },
    { id: "skill.disabled", name: "禁用", implementation: "disabled", activation: { kind: "phase", windows: ["action"] } },
  ] }] });
  assert.deepEqual(skills.map((skill) => skill.supportLevel), ["FULL", "PARTIAL", "MANUAL", "DISABLED"]);
});

test("DISABLED 技能在运行时明确拒绝执行", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "disabled", name: "禁用技能", ownerType: "master", ownerId: "m", activation: "phase", windows: ["action"], cost: 0, text: "", supportLevel: "DISABLED" }, () => undefined);
  const state = createGameState({ gameInstanceId: "skills-disabled", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.players.p.masterId = "m";
  assert.deepEqual(registry.getLegalActions(state, "p"), []);
  assert.throws(() => registry.execute(state, "p", "disabled", undefined, () => undefined), /SKILL_DISABLED/);
});

test("技能处理器失败时费用和使用记录保持原子回滚", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "atomic", name: "原子技能", ownerType: "master", ownerId: "m", activation: "phase", windows: ["action"], cost: 2, text: "", supportLevel: "FULL" }, () => { throw new Error("SKILL_HANDLER_FAILED"); });
  const state = createGameState({ gameInstanceId: "skills-atomic", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.round = 1; state.players.p.masterId = "m"; state.players.p.mana = 5;
  assert.throws(() => registry.execute(state, "p", "atomic", undefined, () => undefined), /SKILL_HANDLER_FAILED/);
  assert.equal(state.players.p.mana, 5);
  assert.equal(state.players.p.usage.atomic, undefined);
});

test("技能注册拒绝未知支持等级", () => {
  const registry = new SkillRegistry();
  assert.throws(() => registry.register({ id: "bad-support", name: "错误", ownerType: "master", ownerId: "m", activation: "phase", windows: ["action"], cost: 0, text: "", supportLevel: "UNKNOWN" as never }), /SKILL_SUPPORT_LEVEL_INVALID/);
});

test("待迁移技能可进入审计但FULL主动技能必须声明阶段窗口", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "partial-without-window", name: "待核对", ownerType: "master", ownerId: "m", activation: "phase", windows: [], cost: 0, text: "", supportLevel: "PARTIAL" });
  assert.equal(registry.get("partial-without-window").supportLevel, "PARTIAL");
  assert.throws(() => registry.register({ id: "full-without-window", name: "错误完整能力", ownerType: "master", ownerId: "m", activation: "phase", windows: [], cost: 0, text: "", supportLevel: "FULL" }, () => undefined), /SKILL_WINDOW_REQUIRED/);
});

test("使用限制组件区分每局、每回合和每阶段", () => {
  const game = createUsageRecord("once-per-game", 1, "action");
  const round = createUsageRecord("once-per-round", 1, "action");
  const turn = createUsageRecord("once-per-turn", 1, "action");
  assert.equal(isUsageAvailable(game, "once-per-game", 2, "action"), false);
  assert.equal(isUsageAvailable(round, "once-per-round", 2, "action"), true);
  assert.equal(isUsageAvailable(turn, "once-per-turn", 1, "combat"), true);
  assert.equal(isUsageAvailable(turn, "once-per-turn", 1, "action"), false);
});

test("被动技能只作为规则触发器存在，不出现在玩家可点击操作", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "passive", name: "被动", ownerType: "master", ownerId: "m", activation: "passive", windows: [], cost: 0, text: "", supportLevel: "MANUAL" });
  const state = createGameState({ gameInstanceId: "skills", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.players.p.masterId = "m";
  assert.deepEqual(registry.getLegalActions(state, "p"), []);
});

test("阶段技能统一校验阶段、持有者和重复使用，败北不阻止能力", () => {
  let calls = 0;
  const registry = new SkillRegistry();
  registry.register({ id: "phase", name: "阶段技", ownerType: "master", ownerId: "m", activation: "phase", windows: ["action"], cost: 1, abilityCost: 1, text: "", supportLevel: "FULL" }, () => { calls += 1; });
  const state = createGameState({ gameInstanceId: "skills-2", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.players.p.masterId = "m"; state.players.p.mana = 2;
  state.players.p.defeated = true;
  registry.execute(state, "p", "phase", undefined, () => undefined);
  assert.equal(calls, 1); assert.equal(state.players.p.mana, 1);
  assert.throws(() => registry.execute(state, "p", "phase", undefined, () => undefined), /SKILL_USE_FORBIDDEN/);
});

test("被动/阶段技能作为可选窗口，不会被误当成强制被动", () => {
  let calls = 0;
  const registry = new SkillRegistry();
  registry.register({ id: "optional", name: "阶段被动", ownerType: "master", ownerId: "m", activation: "optional-trigger", windows: ["outpost"], cost: 0, text: "", supportLevel: "FULL" }, () => { calls += 1; });
  const state = createGameState({ gameInstanceId: "skills-optional", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.players.p.masterId = "m";
  assert.deepEqual(registry.getLegalActions(state, "p"), []);
  state.phase = "outpost";
  assert.equal(registry.getLegalActions(state, "p").length, 1);
  registry.execute(state, "p", "optional", undefined, () => undefined);
  assert.equal(calls, 1);
});

test("技能卡8点门槛属于打出规则，play技能不会成为独立阶段按钮", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "eight", name: "八点门槛", ownerType: "servant", ownerId: "s", activation: "play", windows: ["action"], cost: 2, requirement: 8, text: "", supportLevel: "FULL" }, () => undefined);
  const state = createGameState({ gameInstanceId: "skills-eight", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.players.p.servantId = "s"; state.players.p.mana = 7;
  assert.deepEqual(registry.getLegalActions(state, "p"), []);
  assert.throws(() => registry.execute(state, "p", "eight", undefined, () => undefined), /SKILL_USE_FORBIDDEN/);
  state.players.p.mana = 8;
  assert.deepEqual(registry.getLegalActions(state, "p"), []);
});

test("技能的每局/每回合限制按规则记录，不会被普通重复点击绕过", () => {
  let calls = 0;
  const registry = new SkillRegistry();
  registry.register({ id: "once-game", name: "每局一次", ownerType: "master", ownerId: "m", activation: "phase", windows: ["action"], cost: 0, limit: "once-per-game", text: "", supportLevel: "FULL" }, () => { calls += 1; });
  registry.register({ id: "once-round", name: "每回合一次", ownerType: "master", ownerId: "m", activation: "phase", windows: ["action"], cost: 0, limit: "once-per-round", text: "", supportLevel: "FULL" }, () => { calls += 1; });
  const state = createGameState({ gameInstanceId: "skills-limit", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.round = 1; state.players.p.masterId = "m";
  registry.execute(state, "p", "once-game", undefined, () => undefined);
  assert.throws(() => registry.execute(state, "p", "once-game", undefined, () => undefined), /SKILL_USE_FORBIDDEN/);
  registry.execute(state, "p", "once-round", undefined, () => undefined);
  assert.throws(() => registry.execute(state, "p", "once-round", undefined, () => undefined), /SKILL_USE_FORBIDDEN/);
  state.round = 2;
  registry.execute(state, "p", "once-round", undefined, () => undefined);
  assert.equal(calls, 3);
});

test("每局一次技能跨回合保持已使用，每回合一次技能会重置", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "once-game-persist", name: "每局一次", ownerType: "master", ownerId: "m", activation: "phase", windows: ["action"], cost: 0, limit: "once-per-game", text: "", supportLevel: "FULL" }, () => undefined);
  registry.register({ id: "once-round-reset", name: "每回合一次", ownerType: "master", ownerId: "m", activation: "phase", windows: ["action"], cost: 0, limit: "once-per-round", text: "", supportLevel: "FULL" }, () => undefined);
  const state = createGameState({ gameInstanceId: "skills-persist", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.round = 1; state.players.p.masterId = "m";
  registry.execute(state, "p", "once-game-persist", undefined, () => undefined);
  registry.execute(state, "p", "once-round-reset", undefined, () => undefined);
  // Round cleanup keeps the game limit marker and drops ordinary round markers.
  state.players.p.usage = Object.fromEntries(Object.entries(state.players.p.usage).filter(([, usage]) => usage.usedGame));
  state.round = 2;
  assert.throws(() => registry.execute(state, "p", "once-game-persist", undefined, () => undefined), /SKILL_USE_FORBIDDEN/);
  registry.execute(state, "p", "once-round-reset", undefined, () => undefined);
});

test("未写明特殊次数的阶段能力默认每回合可使用一次", () => {
  let calls = 0;
  const registry = new SkillRegistry();
  registry.register({ id: "default-round", name: "默认每回合", ownerType: "master", ownerId: "m", activation: "phase", windows: ["action"], cost: 0, text: "", supportLevel: "FULL" }, () => { calls += 1; });
  const state = createGameState({ gameInstanceId: "skills-default-round", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.round = 1; state.players.p.masterId = "m";
  registry.execute(state, "p", "default-round", undefined, () => undefined);
  assert.throws(() => registry.execute(state, "p", "default-round", undefined, () => undefined), /SKILL_USE_FORBIDDEN/);
  state.round = 2;
  registry.execute(state, "p", "default-round", undefined, () => undefined);
  assert.equal(calls, 2);
});

test("唯一组阻止同一回合重复发动等价阶段能力，并在新回合恢复", () => {
  let calls = 0;
  const registry = new SkillRegistry();
  registry.register({ id: "unique-a", name: "唯一甲", ownerType: "master", ownerId: "m", activation: "phase", windows: ["action"], cost: 0, uniqueGroup: "same-rule", text: "", supportLevel: "FULL" }, () => { calls += 1; });
  registry.register({ id: "unique-b", name: "唯一乙", ownerType: "master", ownerId: "m", activation: "phase", windows: ["action"], cost: 0, uniqueGroup: "same-rule", text: "", supportLevel: "FULL" }, () => { calls += 1; });
  const state = createGameState({ gameInstanceId: "skills-unique", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.round = 1; state.players.p.masterId = "m";
  registry.execute(state, "p", "unique-a", undefined, () => undefined);
  assert.deepEqual(registry.getLegalActions(state, "p").map((action) => action.payload?.skillId), []);
  assert.throws(() => registry.execute(state, "p", "unique-b", undefined, () => undefined), /SKILL_USE_FORBIDDEN/);
  state.round = 2;
  registry.execute(state, "p", "unique-b", undefined, () => undefined);
  assert.equal(calls, 2);
});

test("真名状态是结构化使用条件，不依赖界面文字判断", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "revealed-only", name: "真名解放后", ownerType: "servant", ownerId: "s", activation: "phase", windows: ["combat"], cost: 0, requiresTrueName: true, text: "", supportLevel: "FULL" }, () => undefined);
  registry.register({ id: "hidden-only", name: "真名隐藏时", ownerType: "servant", ownerId: "s", activation: "phase", windows: ["combat"], cost: 0, requiresHiddenTrueName: true, text: "", supportLevel: "FULL" }, () => undefined);
  const state = createGameState({ gameInstanceId: "skills-name", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "combat"; state.players.p.servantId = "s";
  assert.equal(registry.getLegalActions(state, "p").length, 1);
  assert.equal(registry.getLegalActions(state, "p")[0].payload?.skillId, "hidden-only");
  state.players.p.trueNameRevealed = true;
  assert.equal(registry.getLegalActions(state, "p").length, 1);
  assert.equal(registry.getLegalActions(state, "p")[0].payload?.skillId, "revealed-only");
});

test("带真名词条的可选阶段能力仅在成功发动后解放真名", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "reveal-on-use", name: "真名阶段技", ownerType: "servant", ownerId: "s", activation: "phase", windows: ["action"], cost: 0, abilityCost: 1, text: "【真名解放】", supportLevel: "FULL", revealsTrueNameOnSkillUse: true }, () => undefined);
  registry.register({ id: "failed-reveal", name: "失败阶段技", ownerType: "servant", ownerId: "s", activation: "phase", windows: ["action"], cost: 0, text: "【真名解放】", supportLevel: "FULL", revealsTrueNameOnSkillUse: true }, () => { throw new Error("EFFECT_FAILED"); });
  const state = createGameState({ gameInstanceId: "skill-reveal-use", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.players.p.servantId = "s"; state.players.p.mana = 2;

  assert.throws(() => registry.execute(state, "p", "failed-reveal", undefined, () => undefined), /EFFECT_FAILED/);
  assert.equal(state.players.p.trueNameRevealed, false);
  registry.execute(state, "p", "reveal-on-use", undefined, () => undefined);
  assert.equal(state.players.p.trueNameRevealed, true);
  assert.equal(state.players.p.mana, 1);
});

test("局势禁止属性时不能发动该属性技能的阶段能力", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "noble-stage", name: "宝具阶段技", ownerType: "servant", ownerId: "s", activation: "phase", windows: ["combat"], cost: 0, typeLabel: "宝具", text: "", supportLevel: "FULL" }, () => undefined);
  const state = createGameState({ gameInstanceId: "skill-situation-lock", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "combat"; state.players.p.servantId = "s";
  state.modeState = { situationRestrictions: { forbiddenAttributes: ["宝具"] } };
  assert.deepEqual(registry.getLegalActions(state, "p"), []);
  assert.throws(() => registry.execute(state, "p", "noble-stage", undefined, () => undefined), /SKILL_USE_FORBIDDEN/);
});

test("技能局势禁用优先读取结构化属性而不是展示标签", () => {
  const registry = new SkillRegistry();
  registry.register({
    id: "skill.structured-attribute", name: "结构化属性技能", ownerType: "master", ownerId: "m1",
    activation: "phase", windows: ["action"], cost: 0, typeLabel: "力量", attributes: ["宝具"],
    text: "", supportLevel: "FULL",
  }, () => undefined);
  const state = createGameState({ gameInstanceId: "skills-structured-attribute", players: [{ id: "p1", name: "P1" }], seed: 1 });
  state.phase = "action"; state.activePlayerId = "p1";
  state.modeState = { situationRestrictions: { forbiddenAttributes: ["宝具"] } };
  state.players.p1.masterId = "m1";
  assert.deepEqual(registry.getLegalActions(state, "p1"), []);
});

test("技能可选步骤窗口只在明确步骤开放", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "skill.step-window", name: "步骤技能", ownerType: "master", ownerId: "m1", activation: "phase", windows: ["action"], steps: ["play-batch-draft"], cost: 0, text: "", supportLevel: "FULL" }, () => undefined);
  const state = createGameState({ gameInstanceId: "skills-step-window", players: [{ id: "p1", name: "P1" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p1"; state.phase = "action"; state.step = "move-decision"; state.players.p1.masterId = "m1";
  assert.deepEqual(registry.getLegalActions(state, "p1"), []);
  state.step = "play-batch-draft";
  assert.equal(registry.getLegalActions(state, "p1").length, 1);
});

test("战斗续行处理器可在行动阶段移动到任意非工房地点", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "servant.cu.skill.sc-cu-2", name: "战斗续行", ownerType: "servant", ownerId: "s", activation: "phase", windows: ["action"], cost: 3, requirement: 3, text: "", supportLevel: "FULL" }, moveToNonWorkshop);
  const state = createGameState({ gameInstanceId: "skill-cu", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.step = "move-decision"; state.players.p.servantId = "s"; state.players.p.mana = 6;
  state.board.locations.workshop = ["p"];
  state.players.p.locationId = "workshop";
  registry.execute(state, "p", "servant.cu.skill.sc-cu-2", { locationId: "scouting" }, () => undefined);
  assert.equal(state.players.p.locationId, "scouting");
  assert.deepEqual(state.board.locations.workshop, []);
  assert.deepEqual(state.board.locations.scouting, ["p"]);
  assert.equal(state.players.p.mana, 6);
  assert.equal(state.step, "play-batch-draft");
  assert.throws(() => registry.execute(state, "p", "servant.cu.skill.sc-cu-2", { locationId: "workshop" }, () => undefined), /SKILL_USE_FORBIDDEN/);
});

test("按handlerId批量绑定处理器，未绑定的FULL技能不会暴露为操作", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "skill.shared-move", name: "战斗续行", ownerType: "servant", ownerId: "s", activation: "phase", windows: ["action"], cost: 3, requirement: 3, text: "", supportLevel: "FULL", handlerId: "core.move-to-non-workshop" });
  registry.register({ id: "skill.missing-handler", name: "尚未绑定", ownerType: "servant", ownerId: "s", activation: "phase", windows: ["action"], cost: 0, text: "", supportLevel: "FULL", handlerId: "missing" });
  const state = createGameState({ gameInstanceId: "skill-shared-handler", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.activePlayerId = "p"; state.phase = "action"; state.players.p.servantId = "s"; state.players.p.mana = 6;
  registerCoreSkillHandlers(registry);
  assert.deepEqual(registry.getLegalActions(state, "p").map((action) => action.payload?.skillId), ["skill.shared-move"]);
  registry.execute(state, "p", "skill.shared-move", { locationId: "city" }, () => undefined);
  assert.equal(state.players.p.locationId, "city");
  assert.throws(() => registry.execute(state, "p", "skill.missing-handler", undefined, () => undefined), /SKILL_NOT_IMPLEMENTED/);
});

test("普通从者阶段能力必须先激活对应技能牌且不会重复支付卡牌费用", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "skill.active-card", name: "卡牌能力", ownerType: "servant", ownerId: "s", activation: "phase", windows: ["action"], cost: 3, abilityCost: 0, requiresActiveCard: true, text: "", supportLevel: "FULL" }, () => undefined);
  const state = createGameState({ gameInstanceId: "active-card-skill", players: [{ id: "p", name: "P" }], seed: 1 });
  state.status = "playing"; state.phase = "action"; state.activePlayerId = "p"; state.players.p.servantId = "s"; state.players.p.mana = 5;
  assert.deepEqual(registry.getLegalActions(state, "p"), []);
  state.cards.active = { instanceId: "active", definitionId: "skill.active-card", ownerPlayerId: "p", controllerPlayerId: "p", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p.attack = ["active"];
  assert.equal(registry.getLegalActions(state, "p").length, 1);
  registry.execute(state, "p", "skill.active-card", undefined, () => undefined);
  assert.equal(state.players.p.mana, 5);
});

test("单独行动仅限回合顺位前半，失败时结算不可阻止的5战果惩罚", () => {
  const registry = new SkillRegistry();
  registry.register({ id: "skill.independent-a", name: "单独行动", ownerType: "servant", ownerId: "s-a", activation: "phase", windows: ["action"], cost: 0, requiresActiveCard: true, text: "", supportLevel: "FULL", handlerId: "core.independent-action" });
  registry.register({ id: "skill.independent-c", name: "单独行动", ownerType: "servant", ownerId: "s-c", activation: "phase", windows: ["action"], cost: 0, requiresActiveCard: true, text: "", supportLevel: "FULL", handlerId: "core.independent-action" });
  registerCoreSkillHandlers(registry);
  const state = createGameState({ gameInstanceId: "independent-action", players: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }, { id: "d", name: "D" }], seed: 1 });
  state.status = "playing"; state.round = 2; state.phase = "action"; state.activePlayerId = "a"; state.players.a.servantId = "s-a"; state.players.c.servantId = "s-c"; state.players.a.victoryPoints = 10;
  for (const [playerId, skillId] of [["a", "skill.independent-a"], ["c", "skill.independent-c"]] as const) {
    const instanceId = `${playerId}:skill`;
    state.cards[instanceId] = { instanceId, definitionId: skillId, ownerPlayerId: playerId, controllerPlayerId: playerId, zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
    state.players[playerId].attack = [instanceId];
  }
  assert.equal(registry.getLegalActions(state, "a").length, 1);
  registry.execute(state, "a", "skill.independent-a", undefined, () => undefined);
  assert.equal(state.players.a.victoryPoints, 13);
  state.activePlayerId = "c";
  assert.deepEqual(registry.getLegalActions(state, "c"), []);
  state.phase = "combat"; state.step = "settlement"; state.players.a.locationId = "mountain"; state.players.b.locationId = "mountain"; state.board.locations.mountain = ["a", "b"];
  state.cards["b:attack"] = { instanceId: "b:attack", definitionId: "card.high", ownerPlayerId: "b", controllerPlayerId: "b", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.b.attack = ["b:attack"];
  resolveCombat(state, "mountain", { "skill.independent-a": { id: "skill.independent-a", name: "单独行动", cost: 0, basePower: 0, typeLabel: "特殊" }, "card.high": { id: "card.high", name: "高威力", cost: 0, basePower: 9, typeLabel: "力量" } }, {});
  assert.equal(state.players.a.victoryPoints, 8);
  assert.equal(state.players.a.flags.independentActionPenaltyRound, undefined);
});
