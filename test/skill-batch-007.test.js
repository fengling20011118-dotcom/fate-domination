import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { SkillRegistry } from "../src/rules-core/skill-registry.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { cardHasEightManaWaiver, getEffectiveCardCost } from "../src/rules-core/card-rule-modifiers.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";
import { buildStandardContent } from "../src/content/content-package.ts";
import { useDavinciFocus } from "../src/rules-core/skill-handlers.ts";

const emptyContent = { cards: {}, situations: [], events: [], playerDecks: {} };

function actionState(id) {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "p1", name: "达·芬奇" }, { id: "p2", name: "目标" }],
    seed: 7,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "p1";
  state.players.p1.servantId = "servant.davinci";
  return state;
}

function command(state, id, skillId, data) {
  return {
    commandId: id,
    gameInstanceId: state.gameInstanceId,
    actorId: "p1",
    expectedRevision: state.revision,
    type: CommandType.UseSkill,
    payload: { skillId, data },
  };
}

function engineFor(skillId, handlerId, cards = {}, tags, extra = {}) {
  const skills = new SkillRegistry();
  skills.register({
    id: skillId,
    name: skillId,
    ownerType: "servant",
    ownerId: "servant.davinci",
    activation: "phase",
    windows: ["action"],
    cost: 0,
    text: "",
    supportLevel: "FULL",
    handlerId,
    requiresActiveCard: false,
    ...(tags ? { tags } : {}),
    ...extra,
  });
  return new StandardMatchEngine({ ...emptyContent, cards, skills });
}

function completeCommand(state, id) {
  return {
    commandId: id,
    gameInstanceId: state.gameInstanceId,
    actorId: "p1",
    expectedRevision: state.revision,
    type: CommandType.CompletePlayerWindow,
    payload: {},
  };
}

test("skills-007 黑键支付4魔力后在战斗阶段开始时击败仍交战的目标并移除自身", () => {
  const skillId = "servant.davinci.skill.sc-davinci-6";
  const engine = engineFor(skillId, "core.davinci-black-key", {}, undefined, { abilityCost: 4, passiveEventTypes: ["phase.transitioned"] });
  const state = actionState("davinci-black-key");
  state.players.p1.mana = 4;
  state.players.p1.locationId = "mountain";
  state.players.p2.locationId = "mountain";
  state.board.locations.mountain = ["p1", "p2"];
  state.turnOrder = ["p1"];
  createOwnedCardInstance(state, "p1", { instanceId: "black-key", definitionId: skillId, zone: "servant-skills" });

  const armed = engine.execute(state, command(state, "use-black-key", skillId, { targetPlayerId: "p2" }));
  assert.equal(armed.state.players.p1.mana, 0);
  assert.equal(armed.state.cards["black-key"].zone, "removed");
  assert.equal(armed.state.players.p2.defeated, false);
  const resolved = engine.execute(armed.state, completeCommand(armed.state, "advance-combat"));
  assert.equal(resolved.state.phase, "combat");
  assert.equal(resolved.state.players.p2.defeated, true);
  assert.equal(resolved.state.players.p1.flags.davinciBlackKeyRound, undefined);
});

test("skills-007 可爱的纪念品只将同地点目标的力量攻击置零并移除自身", () => {
  const skillId = "servant.davinci.skill.sc-davinci-10";
  const cards = {
    strength: { id: "strength", name: "力量牌", cost: 0, basePower: 5, typeLabel: "力量", attributes: ["力量"] },
    magic: { id: "magic", name: "魔术牌", cost: 0, basePower: 4, typeLabel: "魔术", attributes: ["魔术"] },
  };
  const engine = engineFor(skillId, "core.zero-target-strength-and-exile", cards);
  const state = actionState("davinci-souvenir");
  state.players.p1.locationId = "mountain";
  state.players.p2.locationId = "mountain";
  state.board.locations.mountain = ["p1", "p2"];
  createOwnedCardInstance(state, "p1", { instanceId: "item", definitionId: skillId, zone: "servant-skills" });
  createOwnedCardInstance(state, "p2", { instanceId: "s", definitionId: "strength", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "p2", { instanceId: "m", definitionId: "magic", zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "use-souvenir", skillId, { targetPlayerId: "p2" }));
  assert.equal(calculateCombatCardPower(result.state, result.state.players.p2, "s", cards, "mountain"), 0);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.p2, "m", cards, "mountain"), 4);
  assert.equal(result.state.cards.item.zone, "removed");
});

test("skills-007 虚数潜航艇记录固有结界无效并允许一次任意地点移动", () => {
  const skillId = "servant.davinci.skill.sc-davinci-11";
  const engine = engineFor(skillId, "core.imaginary-submarine-and-exile");
  const state = actionState("davinci-submarine");
  state.players.p1.locationId = "workshop";
  state.board.locations.workshop = ["p1"];
  createOwnedCardInstance(state, "p1", { instanceId: "item", definitionId: skillId, zone: "servant-skills" });

  const result = engine.execute(state, command(state, "use-submarine", skillId, { locationId: "city" }));
  assert.equal(result.state.modeState.intrinsicFieldsNullifiedRound, 3);
  assert.equal(result.state.players.p1.locationId, "city");
  assert.equal(result.state.cards.item.zone, "removed");
});

test("skills-007 灵子转让只令所选宝具副本免费且豁免8魔力门槛", () => {
  const skillId = "servant.davinci.skill.sc-davinci-12";
  const np = { id: "np", name: "宝具", cost: 5, basePower: 8, typeLabel: "宝具", attributes: ["宝具"], isSkill: true, requiresEightMana: true };
  const engine = engineFor(skillId, "core.spiritron-transfer-and-exile", { np });
  const state = actionState("davinci-transfer");
  state.players.p1.mana = 1;
  createOwnedCardInstance(state, "p1", { instanceId: "item", definitionId: skillId, zone: "servant-skills" });
  createOwnedCardInstance(state, "p1", { instanceId: "chosen", definitionId: "np", zone: "hand" });
  createOwnedCardInstance(state, "p1", { instanceId: "other", definitionId: "np", zone: "hand" });

  const result = engine.execute(state, command(state, "use-transfer", skillId, { instanceId: "chosen" }));
  assert.equal(cardHasEightManaWaiver(result.state, result.state.players.p1, result.state.cards.chosen), true);
  assert.equal(getEffectiveCardCost(result.state, result.state.players.p1, result.state.cards.chosen, np), 0);
  assert.equal(cardHasEightManaWaiver(result.state, result.state.players.p1, result.state.cards.other), false);
  assert.equal(getEffectiveCardCost(result.state, result.state.players.p1, result.state.cards.other, np), 5);
});

test("skills-007 瞬间强化翻倍印刷威力并在回合末同时移除来源和目标", () => {
  const skillId = "servant.davinci.skill.sc-davinci-13";
  const cards = { attack: { id: "attack", name: "攻击", cost: 2, basePower: 4, typeLabel: "迅捷", attributes: ["迅捷"] } };
  const engine = engineFor(skillId, "core.instant-enhancement", cards);
  const state = actionState("davinci-enhance");
  createOwnedCardInstance(state, "p1", { instanceId: "item", definitionId: skillId, zone: "servant-skills" });
  createOwnedCardInstance(state, "p1", { instanceId: "target", definitionId: "attack", zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "use-enhance", skillId, { instanceId: "target" }));
  assert.equal(calculateCombatCardPower(result.state, result.state.players.p1, "target", cards), 8);
  endStandardRound(result.state, cards);
  assert.equal(result.state.cards.item.zone, "removed");
  assert.equal(result.state.cards.target.zone, "removed");
});

test("skills-007 应急处置按一次事务抽牌、弃牌并移除自身", () => {
  const skillId = "servant.davinci.skill.sc-davinci-14";
  const engine = engineFor(skillId, "core.emergency-treatment-and-exile");
  const state = actionState("davinci-treatment");
  createOwnedCardInstance(state, "p1", { instanceId: "item", definitionId: skillId, zone: "servant-skills" });
  createOwnedCardInstance(state, "p1", { instanceId: "d1", definitionId: "d1", zone: "deck" });
  createOwnedCardInstance(state, "p1", { instanceId: "d2", definitionId: "d2", zone: "deck" });

  const result = engine.execute(state, command(state, "use-treatment", skillId, { drawCount: 2, discardInstanceIds: ["d1"] }));
  assert.deepEqual(result.state.players.p1.hand, ["d2"]);
  assert.deepEqual(result.state.players.p1.discard, ["d1"]);
  assert.equal(result.state.cards.item.zone, "removed");
});

test("skills-007 指令集中每回合结束累加计数并在使用时转成本回合威力", () => {
  const skillId = "servant.davinci.skill.sc-davinci-15";
  const state = actionState("davinci-focus");
  createOwnedCardInstance(state, "p1", { instanceId: "focus", definitionId: skillId, zone: "servant-skills" });
  const skill = {
    id: skillId,
    name: "指令：集中",
    ownerType: "servant",
    ownerId: "servant.davinci",
    activation: "phase",
    windows: ["action"],
    cost: 0,
    text: "",
    supportLevel: "FULL",
    handlerId: "core.davinci-focus",
  };
  useDavinciFocus({ state, player: state.players.p1, skill, payload: { eventType: "round.ended" }, openDecision: () => undefined });
  useDavinciFocus({ state, player: state.players.p1, skill, payload: { eventType: "round.ended" }, openDecision: () => undefined });
  assert.equal(state.players.p1.flags.davinciFocusCount, 2);
  useDavinciFocus({ state, player: state.players.p1, skill, payload: undefined, openDecision: () => undefined });
  assert.equal(state.players.p1.flags.roundPowerBonus, 2);
  assert.equal(state.cards.focus.zone, "removed");
});

test("skills-007 提升等级附着后为宿主提供1点实际战力", () => {
  const skillId = "servant.davinci.skill.sc-davinci-17";
  const host = { id: "host", name: "宿主技能", cost: 1, basePower: 4, typeLabel: "魔术", attributes: ["魔术"], isSkill: true };
  const engine = engineFor(skillId, "core.attach-power-upgrade", { host }, ["attached-power-plus-1"]);
  const state = actionState("davinci-upgrade");
  createOwnedCardInstance(state, "p1", { instanceId: "upgrade", definitionId: skillId, zone: "servant-skills" });
  createOwnedCardInstance(state, "p1", { instanceId: "host-card", definitionId: "host", zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "use-upgrade", skillId, { hostInstanceId: "host-card" }));
  const definitions = {
    host,
    [skillId]: { id: skillId, name: skillId, cost: 0, basePower: 0, typeLabel: "特殊", tags: ["attached-power-plus-1"] },
  };
  assert.equal(result.state.cards.upgrade.zone, "attached");
  assert.equal(result.state.cards.upgrade.attachedToInstanceId, "host-card");
  assert.equal(calculateCombatCardPower(result.state, result.state.players.p1, "host-card", definitions), 5);
});

test("skills-007 黑键与指令集中在标准内容包中达到FULL", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  for (const id of ["servant.davinci.skill.sc-davinci-6", "servant.davinci.skill.sc-davinci-15"]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL", id);
    assert.equal(skill.handlerId?.startsWith("core.davinci-"), true, id);
  }
});
