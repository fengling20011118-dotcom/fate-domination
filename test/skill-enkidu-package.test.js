import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { cardInstanceGrantsAbility } from "../src/rules-core/card-inherited-traits.ts";
import { attachCard } from "../src/rules-core/card-attachments.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { ENKIDU_ENUMA_ID, ENKIDU_TRANSFIGURATION_ID } from "../src/rules-core/enkidu.ts";
import { playerIsChained, playerNoblePhantasmUseBlocked } from "../src/rules-core/player-statuses.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  "card.test.preparation": { id: "card.test.preparation", name: "Preparation", cardType: "attack", cost: 1, basePower: 2, typeLabel: "魔术", attributes: ["魔术"], basic: true, cardAbilityIds: ["test.preparation"] },
  "card.test.agility": { id: "card.test.agility", name: "Agility", cardType: "attack", cost: 0, basePower: 3, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
  "card.test.strength": { id: "card.test.strength", name: "Strength", cardType: "attack", cost: 0, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.np": { id: "card.test.np", name: "NP", cardType: "attack", cost: 0, basePower: 5, typeLabel: "宝具", attributes: ["宝具"], basic: false },
};

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function stateOf(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "e", name: "恩奇都" }, { id: "a", name: "甲" }, { id: "b", name: "乙" }], seed: 77 });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "e";
  state.players.e.servantId = "servant.enkidu";
  for (const player of Object.values(state.players)) player.mana = 20;
  putAt(state, "e", "mountain");
  putAt(state, "a", "mountain");
  putAt(state, "b", "city");
  return state;
}

function activeSkill(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "e", { instanceId, definitionId, zone: "attack", face: "up", active: true });
  return state.cards[instanceId];
}

test("恩奇都技能包 3/3 FULL，变容恢复八魔力技能门槛", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.enkidu");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(definitions[ENKIDU_TRANSFIGURATION_ID].requiresEightMana, true);
  assert.notEqual(definitions[ENKIDU_TRANSFIGURATION_ID].basic, true);
});

test("变容叠放基础攻击后叠加顶部牌威力、费用、属性与能力但不获得基础身份", () => {
  const state = stateOf("enkidu-top-traits");
  const source = activeSkill(state, "transfiguration", ENKIDU_TRANSFIGURATION_ID);
  createOwnedCardInstance(state, "e", { instanceId: "prep", definitionId: "card.test.preparation", zone: "hand" });
  built.skills.execute(state, "e", ENKIDU_TRANSFIGURATION_ID, { abilityId: "enkidu-transfiguration-stack", instanceId: "prep" }, () => {}, () => 0, definitions);

  assert.equal(state.cards.prep.zone, "attached");
  assert.equal(getCardPlayCost(state, definitions[ENKIDU_TRANSFIGURATION_ID], state.players.e, source, definitions), 2);
  assert.equal(calculateCombatCardPower(state, state.players.e, source.instanceId, definitions, "mountain"), 4);
  assert.deepEqual(getCardInstanceAttributes(source, definitions[ENKIDU_TRANSFIGURATION_ID], state, definitions), ["魔术"]);
  assert.equal(cardInstanceGrantsAbility(state, source, definitions[ENKIDU_TRANSFIGURATION_ID], definitions, "test.preparation"), true);
  assert.notEqual(definitions[ENKIDU_TRANSFIGURATION_ID].basic, true);
});

test("变容从牌堆顶部弃置任意张牌，并把被弃牌属性授予当前激活攻击", () => {
  const state = stateOf("enkidu-discard-types");
  activeSkill(state, "transfiguration", ENKIDU_TRANSFIGURATION_ID);
  createOwnedCardInstance(state, "e", { instanceId: "strength", definitionId: "card.test.strength", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "e", { instanceId: "prep", definitionId: "card.test.preparation", zone: "hand" });
  createOwnedCardInstance(state, "e", { instanceId: "agility", definitionId: "card.test.agility", zone: "hand" });
  built.skills.execute(state, "e", ENKIDU_TRANSFIGURATION_ID, { abilityId: "enkidu-transfiguration-stack", instanceId: "prep" }, () => {}, () => 0, definitions);
  attachCard(state, "agility", "transfiguration", "up"); // accumulated on a prior action/round
  const result = built.skills.execute(state, "e", ENKIDU_TRANSFIGURATION_ID, { abilityId: "enkidu-transfiguration-discard", count: 2 }, () => {}, () => 0, definitions);

  assert.deepEqual(result.discardedInstanceIds, ["agility", "prep"]);
  assert.equal(state.cards.agility.zone, "discard");
  assert.equal(state.cards.prep.zone, "discard");
  assert.deepEqual(new Set(getCardInstanceAttributes(state.cards.strength, definitions["card.test.strength"], state, definitions)), new Set(["力量", "迅捷", "魔术"]));
});

test("天之锁束缚全部交战对手至下回合结束并阻止宝具使用", () => {
  const state = stateOf("enkidu-chains");
  state.phase = "combat";
  activeSkill(state, "enuma", ENKIDU_ENUMA_ID);
  createOwnedCardInstance(state, "a", { instanceId: "np", definitionId: "card.test.np", zone: "hand" });
  const result = built.skills.execute(state, "e", ENKIDU_ENUMA_ID, { abilityId: "enkidu-chains-of-heaven" }, () => {}, () => 0, definitions);

  assert.deepEqual(result.targetPlayerIds, ["a"]);
  assert.equal(result.throughRound, 6);
  assert.equal(playerIsChained(state.players.a, 5), true);
  assert.equal(playerIsChained(state.players.a, 6), true);
  assert.equal(playerNoblePhantasmUseBlocked(state.players.a, 6), true);
  assert.equal(playerIsChained(state.players.b, 5), false);
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "a", instanceId: "np", definitions }), /NOBLE_PHANTASM_USE_BLOCKED/);
});
