import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { closePlayerCard, createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  LANCELOT_GLORY_NP_ID,
  LANCELOT_MASTERY_ID,
  getLancelotGloryCandidates,
} from "../src/rules-core/lancelot.ts";

function setup(id, phase = "combat") {
  const built = buildStandardContent(legacyContent);
  registerCoreSkillHandlers(built.skills);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "l", name: "Lancelot" }, { id: "o", name: "Opponent" }],
    seed: 4242,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = phase;
  state.step = "player-window";
  state.activePlayerId = "l";
  state.players.l.servantId = "servant.lance";
  state.players.l.commandSeals = 3;
  state.players.l.mana = 30;
  state.players.o.mana = 30;
  state.players.l.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations = { workshop: [], mountain: ["l", "o"], city: [], scouting: [] };
  return { built, definitions, state };
}

function add(state, playerId, instanceId, definitionId, zone, options = {}) {
  return createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, ...options });
}

function useSkill(built, state, skillId, payload, definitions) {
  return built.skills.execute(state, "l", skillId, payload, () => { throw new Error("UNEXPECTED_DECISION"); }, () => 0, definitions);
}

test("兰斯洛特整包为 3/3 FULL，两个复制技能使用专用 handler", () => {
  const { built } = setup("lancelot-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.lance");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(built.skills.get(LANCELOT_MASTERY_ID).handlerId, "core.lancelot-eternal-arms-mastery");
  assert.equal(built.skills.get(LANCELOT_GLORY_NP_ID).handlerId, "core.lancelot-for-someones-glory");
  assert.equal(built.skills.get("servant.lance.skill.sc-lance-2").playerFlags?.servantSkillEightManaWaiver, true);
});

test("无穷的武练按英文条件：败北且未控制幸运时不能复制；控制幸运则可复制", () => {
  const { built, definitions, state } = setup("lancelot-mastery-condition");
  add(state, "l", "l:mastery", LANCELOT_MASTERY_ID, "attack", { face: "up", active: true });
  add(state, "o", "o:strength", "card.cardb5", "attack", { face: "up", active: true });
  state.players.l.defeated = true;
  assert.throws(() => built.skills.assertCanExecute(state, "l", LANCELOT_MASTERY_ID, { abilityId: "copy-attack", targetInstanceId: "o:strength" }, definitions), /SKILL_USE_FORBIDDEN/);

  add(state, "l", "l:luck", "card.cardluck", "attack", { face: "up", active: true });
  built.skills.assertCanExecute(state, "l", LANCELOT_MASTERY_ID, { abilityId: "copy-attack", targetInstanceId: "o:strength" }, definitions);
});

test("无穷的武练只复制印刷定义，不继承目标实例累积威力；复制己方攻击额外+3", () => {
  const { built, definitions, state } = setup("lancelot-mastery-instance-state");
  const source = add(state, "l", "l:mastery", LANCELOT_MASTERY_ID, "attack", { face: "up", active: true });
  const target = add(state, "l", "l:strength", "card.cardb5", "attack", { face: "up", active: true });
  target.powerModifiers = [{ id: "target-training", sourceId: "test", kind: "add", value: 99, duration: "game" }];
  target.modifiers.push("token-like-stack:9");

  const result = useSkill(built, state, LANCELOT_MASTERY_ID, { abilityId: "copy-attack", targetInstanceId: target.instanceId }, definitions);
  assert.equal(result.powerBonus, 3);
  assert.equal(source.definitionId, "card.cardb5");
  assert.equal(source.temporaryDefinitionCopy?.originalDefinitionId, LANCELOT_MASTERY_ID);
  assert.equal(source.temporaryDefinitionCopy?.copiedFromInstanceId, target.instanceId);
  assert.ok(!source.modifiers.includes("token-like-stack:9"));
  assert.equal(source.powerModifiers?.some((modifier) => modifier.value === 99), false);
  assert.equal(calculateCombatCardPower(state, state.players.l, source.instanceId, definitions), 10);
});

test("不为一己之荣光支付1枚令咒并采用减半/减4中的更大折扣", () => {
  const { built, definitions, state } = setup("lancelot-glory-cost", "action");
  definitions["card.test-cost9"] = {
    id: "card.test-cost9", name: "Cost Nine", cardType: "attack", typeLabel: "力量", attributes: ["力量"], cost: 9, basePower: 6,
  };
  const source = add(state, "l", "l:glory", LANCELOT_GLORY_NP_ID, "servant-skills", { face: "up" });
  add(state, "o", "o:cost9", "card.test-cost9", "attack", { face: "up", active: true });
  const sealsBefore = state.players.l.commandSeals;

  const result = useSkill(built, state, LANCELOT_GLORY_NP_ID, { abilityId: "shapeshift", targetInstanceId: "o:cost9" }, definitions);
  assert.equal(result.copiedManaCost, 4); // floor(9/2)=4 beats 9-4=5.
  assert.equal(state.players.l.commandSeals, sealsBefore - 1);
  assert.equal(source.definitionId, "card.test-cost9");
  assert.equal(getCardPlayCost(state, definitions[source.definitionId], state.players.l, source, definitions), 4);
});

test("不为一己之荣光不能复制一局游戏限一次的牌，且失败不会消耗令咒", () => {
  const { built, definitions, state } = setup("lancelot-glory-once-game", "action");
  definitions["card.test-once"] = {
    id: "card.test-once", name: "Once", cardType: "attack", typeLabel: "力量", attributes: ["力量"], cost: 4, basePower: 4, limit: "once-per-game",
  };
  add(state, "l", "l:glory", LANCELOT_GLORY_NP_ID, "servant-skills", { face: "up" });
  add(state, "o", "o:once", "card.test-once", "attack", { face: "up", active: true });
  const sealsBefore = state.players.l.commandSeals;
  assert.equal(getLancelotGloryCandidates(state, state.players.l, definitions).includes("o:once"), false);
  assert.throws(() => useSkill(built, state, LANCELOT_GLORY_NP_ID, { abilityId: "shapeshift", targetInstanceId: "o:once" }, definitions), /SKILL_USE_FORBIDDEN|LANCELOT_GLORY_TARGET_INVALID/);
  assert.equal(state.players.l.commandSeals, sealsBefore);
});

test("临时定义复制在关闭或回合结束时恢复原兰斯洛特技能牌身份", () => {
  const first = setup("lancelot-glory-close", "action");
  first.definitions["card.test-cost6"] = {
    id: "card.test-cost6", name: "Cost Six", cardType: "attack", typeLabel: "迅捷", attributes: ["迅捷"], cost: 6, basePower: 5,
  };
  const source = add(first.state, "l", "l:glory", LANCELOT_GLORY_NP_ID, "servant-skills", { face: "up" });
  add(first.state, "o", "o:cost6", "card.test-cost6", "attack", { face: "up", active: true });
  useSkill(first.built, first.state, LANCELOT_GLORY_NP_ID, { abilityId: "shapeshift", targetInstanceId: "o:cost6" }, first.definitions);
  movePlayerCard(first.state, "l", source.instanceId, "attack");
  source.face = "up";
  source.active = true;
  closePlayerCard(first.state, "l", source.instanceId, first.definitions);
  assert.equal(source.definitionId, LANCELOT_GLORY_NP_ID);
  assert.equal(source.temporaryDefinitionCopy, undefined);
  assert.ok(first.state.players.l.servantSkills.includes(source.instanceId));
  assert.ok(!first.state.players.l.discard.includes(source.instanceId));

  const second = setup("lancelot-glory-round-end", "action");
  second.definitions["card.test-cost6"] = first.definitions["card.test-cost6"];
  const idleCopy = add(second.state, "l", "l:glory", LANCELOT_GLORY_NP_ID, "servant-skills", { face: "up" });
  add(second.state, "o", "o:cost6", "card.test-cost6", "attack", { face: "up", active: true });
  useSkill(second.built, second.state, LANCELOT_GLORY_NP_ID, { abilityId: "shapeshift", targetInstanceId: "o:cost6" }, second.definitions);
  assert.equal(idleCopy.definitionId, "card.test-cost6");
  endStandardRound(second.state, second.definitions);
  assert.equal(idleCopy.definitionId, LANCELOT_GLORY_NP_ID);
  assert.equal(idleCopy.temporaryDefinitionCopy, undefined);
  assert.ok(second.state.players.l.servantSkills.includes(idleCopy.instanceId));
});
