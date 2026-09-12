import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { assertStateInvariants } from "../src/domain/state/invariants.ts";
import { addCardRuleModifier } from "../src/rules-core/card-rule-modifiers.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";

function makeState() {
  const state = createGameState({ gameInstanceId: "modifiers", players: [{ id: "p1", name: "一" }], seed: 1 });
  state.status = "playing"; state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "p1";
  state.players.p1.locationId = "workshop"; state.board.locations.workshop = ["p1"]; state.players.p1.mana = 3;
  state.cards.target = { instanceId: "target", definitionId: "card.target", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "servant-skills", face: "up", active: false, residual: false, temporary: false, modifiers: [] };
  state.cards.normal = { instanceId: "normal", definitionId: "card.normal", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.servantSkills = ["target"]; state.players.p1.hand = ["normal"];
  return state;
}

const definitions = {
  "card.target": { id: "card.target", name: "目标技能", cost: 2, basePower: 5, typeLabel: "宝具", attributes: ["宝具"], isSkill: true },
  "card.normal": { id: "card.normal", name: "普通攻击", cost: 0, basePower: 1, typeLabel: "力量" },
};

test("目标卡临时修正可同时豁免8魔力、局势禁止并覆盖费用", () => {
  const state = makeState();
  state.modeState.situationRestrictions = { forbiddenAttributes: ["宝具"] };
  addCardRuleModifier(state.players.p1, { id: "status:target", sourceId: "status.source", targetDefinitionIds: ["card.target"], waiveEightMana: true, ignoreSituationRestrictions: true, costOverride: 0, duration: "round" });
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "p1", instanceId: "target", definitions, faceDown: false }));
  const result = commitStandardAttack(state, "p1", ["target"], [], { ...definitions, "card.target": { ...definitions["card.target"], singleCardPlay: true } });
  assert.equal(result.paidMana, 0);
  assert.equal(state.players.p1.mana, 3);
});

test("卡牌修正只作用于稳定 definitionId 指定的目标", () => {
  const state = makeState();
  addCardRuleModifier(state.players.p1, { id: "status:other", sourceId: "status.source", targetDefinitionIds: ["card.other"], waiveEightMana: true, duration: "game" });
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "p1", instanceId: "target", definitions, faceDown: false }), /SKILL_REQUIRES_EIGHT_MANA/);
});

test("依赖来源激活的修正会随来源关闭而失效", () => {
  const state = makeState();
  state.cards.source = { instanceId: "source", definitionId: "card.source", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: true, temporary: false, modifiers: [] };
  state.players.p1.attack = ["source"];
  addCardRuleModifier(state.players.p1, { id: "status:active", sourceId: "card.source", sourceInstanceId: "source", targetDefinitionIds: ["card.target"], waiveEightMana: true, duration: "while-source-active" });
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "p1", instanceId: "target", definitions, faceDown: false }));
  state.cards.source.active = false;
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "p1", instanceId: "target", definitions, faceDown: false }), /SKILL_REQUIRES_EIGHT_MANA/);
});

test("回合修正在回合结束清除且损坏修正被状态不变量拒绝", () => {
  const state = makeState();
  addCardRuleModifier(state.players.p1, { id: "status:round", sourceId: "status.source", targetDefinitionIds: ["card.target"], waiveEightMana: true, duration: "round" });
  endStandardRound(state);
  assert.deepEqual(state.players.p1.cardRuleModifiers, []);
  state.players.p1.cardRuleModifiers = [{ id: "", sourceId: "", targetDefinitionIds: [], duration: "round" }];
  assert.throws(() => assertStateInvariants(state), /CARD_RULE_MODIFIER/);
});

test("来源关闭后回合结算会移除来源绑定修正", () => {
  const state = makeState();
  state.cards.source = { instanceId: "source", definitionId: "card.source", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = ["source"];
  addCardRuleModifier(state.players.p1, { id: "status:source", sourceId: "card.source", sourceInstanceId: "source", targetDefinitionIds: ["card.target"], waiveEightMana: true, duration: "while-source-active" });
  endStandardRound(state);
  assert.deepEqual(state.players.p1.cardRuleModifiers, []);
});
