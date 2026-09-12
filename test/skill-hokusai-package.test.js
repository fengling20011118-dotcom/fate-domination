import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  HOKUSAI_BEYOND_ID,
  HOKUSAI_WORLD_ID,
  HOKUSAI_WAVE_ID,
  getNamedCardAttributeOverride,
  useHokusaiColorsBeyond,
  useHokusaiColorsWorld,
  useHokusaiGreatWave,
} from "../src/rules-core/hokusai.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const normalAttack = { id: "card.test.hokusai-normal", name: "普通攻击", cardType: "attack", cost: 3, basePower: 5, typeLabel: "力量", attributes: ["力量"], basic: true };
const opgAttack = { id: "card.test.hokusai-opg", name: "每局一次攻击", cardType: "attack", cost: 1, basePower: 8, typeLabel: "迅捷", attributes: ["迅捷"], basic: false, limit: "once-per-game" };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [normalAttack.id]: normalAttack, [opgAttack.id]: opgAttack };

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function makeState(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "h", name: "Hokusai" }, { id: "o", name: "Opponent" }], seed: 131 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "h";
  state.players.h.servantId = "servant.hokusai";
  state.players.h.mana = 20;
  state.players.o.mana = 20;
  putAt(state, "h", "mountain");
  putAt(state, "o", "mountain");
  return state;
}

function addCard(state, playerId, instanceId, definitionId, zone, face = "down", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}

function ctx(state, skillId, payload) {
  return { state, player: state.players.h, skill: built.skills.get(skillId), payload, definitions, openDecision: () => {}, randomInt: () => 0, emitEvent: () => {} };
}

test("葛饰北斋技能包 4/4 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.hokusai");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("色彩的彼界令所有玩家的激活Foreigner Class拥有全部五种属性，包括莫莱版本", () => {
  const state = makeState("hokusai-global-types");
  addCard(state, "h", "beyond", HOKUSAI_BEYOND_ID, "servant-skills", "down", false);
  addCard(state, "o", "molay-life", "servant.molay.skill.sc-molay-4", "attack", "up", true);
  const card = state.cards["molay-life"];
  const attrs = getCardInstanceAttributes(card, definitions[card.definitionId], state, definitions);
  assert.deepEqual(new Set(attrs), new Set(["力量", "迅捷", "魔术", "特殊", "宝具"]));
});

test("Paint Over可替换对手的非OPG激活攻击，北斋支付其费用，原牌在Combat结束返还原控制者", () => {
  const state = makeState("hokusai-paint-over");
  addCard(state, "h", "beyond", HOKUSAI_BEYOND_ID, "servant-skills", "down", false);
  addCard(state, "h", "life", "servant.hokusai.skill.sc-hokusai-4", "hand", "down", false);
  addCard(state, "o", "target", normalAttack.id, "attack", "up", true);
  const result = useHokusaiColorsBeyond(ctx(state, HOKUSAI_BEYOND_ID, { abilityId: "paint-over", targetInstanceId: "target", replacementInstanceId: "life" }));
  assert.equal(result.paidMana, 3);
  assert.equal(state.players.h.mana, 17);
  assert.equal(state.cards.target.zone, "removed");
  assert.equal(state.cards.life.controllerPlayerId, "o");
  assert.ok(state.players.o.attack.includes("life"));
  state.phase = "combat";
  useHokusaiColorsBeyond(ctx(state, HOKUSAI_BEYOND_ID, { eventType: "combat.ending" }));
  assert.equal(state.cards.target.zone, "attack");
  assert.equal(state.cards.target.controllerPlayerId, "o");
  assert.ok(state.players.o.attack.includes("target"));
});

test("Paint Over不能选择每局一次攻击", () => {
  const state = makeState("hokusai-opg-filter");
  addCard(state, "h", "beyond", HOKUSAI_BEYOND_ID, "servant-skills", "down", false);
  addCard(state, "h", "life", "servant.hokusai.skill.sc-hokusai-4", "hand", "down", false);
  addCard(state, "o", "opg", opgAttack.id, "attack", "up", true);
  assert.throws(() => useHokusaiColorsBeyond(ctx(state, HOKUSAI_BEYOND_ID, { abilityId: "paint-over", targetInstanceId: "opg", replacementInstanceId: "life" })), /NO_VALID_PAIR|TARGET_INVALID/);
});

test("森罗万象至多放3种互不重复颜色在不同明置牌上，并支持事件牌运行时属性覆盖", () => {
  const state = makeState("hokusai-colors-world");
  addCard(state, "h", "world", HOKUSAI_WORLD_ID, "attack", "up", true);
  addCard(state, "h", "a", normalAttack.id, "attack", "up", true);
  addCard(state, "o", "b", opgAttack.id, "attack", "up", true);
  state.board.currentEvents.mountain = ["event.fuyuki.4"];
  state.board.eventVisibility["event.fuyuki.4"] = "up";
  useHokusaiColorsWorld(ctx(state, HOKUSAI_WORLD_ID, { abilityId: "color-world", placements: [
    { targetId: "a", attribute: "宝具" },
    { targetId: "b", attribute: "特殊" },
    { targetId: "event.fuyuki.4", attribute: "迅捷" },
  ] }));
  assert.deepEqual(state.cards.a.attributeOverrides, ["宝具"]);
  assert.deepEqual(state.cards.b.attributeOverrides, ["特殊"]);
  assert.equal(getNamedCardAttributeOverride(state, "event.fuyuki.4"), "迅捷");
  assert.throws(() => useHokusaiColorsWorld(ctx(state, HOKUSAI_WORLD_ID, { abilityId: "color-world", placements: [
    { targetId: "a", attribute: "力量" }, { targetId: "b", attribute: "力量" },
  ] })), /UNIQUENESS/);
});

test("富岳三十六景打出回合算第一回合，下回合-3且残留至下回合结束", () => {
  const state = makeState("hokusai-wave-two-rounds");
  addCard(state, "h", "wave", HOKUSAI_WAVE_ID, "attack", "up", true);
  useHokusaiGreatWave(ctx(state, HOKUSAI_WAVE_ID, { eventType: "card.played", event: { playerId: "h", instanceId: "wave", definitionId: HOKUSAI_WAVE_ID, face: "up" } }));
  assert.equal(state.cards.wave.residualUntilRound, 5);
  state.round = 5;
  state.phase = "preparation";
  useHokusaiGreatWave(ctx(state, HOKUSAI_WAVE_ID, { eventType: "round.started", event: { round: 5 } }));
  assert.ok(state.cards.wave.powerModifiers.some((modifier) => modifier.value === -3 && modifier.duration === "round"));
});

test("富岳三十六景Combat能力建立同战场对手非魔术攻击-2的持续规则", () => {
  const state = makeState("hokusai-wave-combat");
  state.phase = "combat";
  addCard(state, "h", "wave", HOKUSAI_WAVE_ID, "attack", "up", true);
  useHokusaiGreatWave(ctx(state, HOKUSAI_WAVE_ID, { abilityId: "great-wave-combat" }));
  const modifier = state.activeRuleModifiers.find((item) => item.sourceId === HOKUSAI_WAVE_ID && item.rule === "card_power");
  assert.ok(modifier);
  assert.equal(modifier.operation, "subtract");
  assert.equal(modifier.value, 2);
  assert.deepEqual(modifier.scope.cards.attributesNone, ["魔术"]);
});
