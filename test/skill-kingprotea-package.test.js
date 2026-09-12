import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import { isSkillUseBlocked } from "../src/rules-core/skill-use-blocks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  KINGPROTEA_GROWTH_ID,
  KINGPROTEA_HIBERNATION_ID,
  KINGPROTEA_LIMIT_BREAK_ID,
  useKingproteaHibernation,
  useKingproteaInfiniteGrowth,
  useKingproteaLimitBreak,
} from "../src/rules-core/kingprotea.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const str8 = { id: "card.test.kingprotea-str8", name: "力量8", cardType: "attack", cost: 2, basePower: 8, typeLabel: "力量", attributes: ["力量"], basic: true };
const agi8 = { id: "card.test.kingprotea-agi8", name: "迅捷8", cardType: "attack", cost: 2, basePower: 8, typeLabel: "迅捷", attributes: ["迅捷"], basic: true };
const magic8 = { id: "card.test.kingprotea-magic8", name: "魔术8", cardType: "attack", cost: 2, basePower: 8, typeLabel: "魔术", attributes: ["魔术"], basic: true };
const special8 = { id: "card.test.kingprotea-special8", name: "特殊8", cardType: "attack", cost: 2, basePower: 8, typeLabel: "特殊", attributes: ["特殊"], basic: true };
const weak = { id: "card.test.kingprotea-weak", name: "弱攻击", cardType: "attack", cost: 1, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [str8.id]: str8, [agi8.id]: agi8, [magic8.id]: magic8, [special8.id]: special8, [weak.id]: weak };

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function makeState(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "k", name: "Kingprotea" }, { id: "o", name: "Opponent" }], seed: 149 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "k";
  state.players.k.servantId = "servant.kingprotea";
  state.players.k.mana = 30;
  state.players.o.mana = 30;
  putAt(state, "k", "mountain");
  putAt(state, "o", "mountain");
  return state;
}

function addCard(state, playerId, instanceId, definitionId, zone, face = "down", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}

function ctx(state, skillId, payload) {
  return { state, player: state.players.k, skill: built.skills.get(skillId), payload, definitions, openDecision: () => {}, randomInt: () => 0, emitEvent: () => {} };
}

test("Kingprotea技能包3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.kingprotea");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("巨影按1+激活攻击数支付2X魔力，本回合封锁渴爱之眠并以通用规则豁免幼儿退行", () => {
  const state = makeState("kingprotea-limit-break");
  state.phase = "outpost";
  addCard(state, "k", "active", str8.id, "attack", "up", true);
  const result = useKingproteaLimitBreak(ctx(state, KINGPROTEA_LIMIT_BREAK_ID, { abilityId: "limit-break" }));
  assert.equal(result.x, 2);
  assert.equal(result.paidMana, 4);
  assert.equal(state.players.k.mana, 26);
  assert.equal(isSkillUseBlocked(state.players.k, state.round, KINGPROTEA_HIBERNATION_ID), true);
  assert.ok(state.activeRuleModifiers.some((modifier) => modifier.rule === "combat_post_power_close_all_attacks_above" && modifier.operation === "ignore"));
});

test("渴爱之眠只让至多2张非特殊基础攻击跨到下回合，并在基础攻击关闭时获得1魔力", () => {
  const state = makeState("kingprotea-hibernation");
  addCard(state, "k", "hib", KINGPROTEA_HIBERNATION_ID, "attack", "up", true);
  addCard(state, "k", "a", str8.id, "attack", "up", true);
  addCard(state, "k", "b", agi8.id, "attack", "up", true);
  addCard(state, "k", "s", special8.id, "attack", "up", true);
  const result = useKingproteaHibernation(ctx(state, KINGPROTEA_HIBERNATION_ID, { abilityId: "hibernate", instanceIds: ["a", "b"] }));
  assert.deepEqual(result.selectedInstanceIds, ["a", "b"]);
  assert.equal(state.cards.a.residualUntilRound, 5);
  assert.equal(state.cards.b.residualUntilRound, 5);
  assert.throws(() => useKingproteaHibernation(ctx(state, KINGPROTEA_HIBERNATION_ID, { abilityId: "hibernate", instanceIds: ["s"] })), /TARGET_INVALID/);
  const before = state.players.k.mana;
  state.cards.a.active = false;
  const gain = useKingproteaHibernation(ctx(state, KINGPROTEA_HIBERNATION_ID, { eventType: "card.closed", event: { ownerPlayerId: "k", instanceId: "a" } }));
  assert.equal(gain.gainedMana, 1);
  assert.equal(state.players.k.mana, before + 1);
});

test("无限增值打出基础攻击时不立即公开，回合清理点才公开并保留基础攻击", () => {
  const state = makeState("kingprotea-growth-reveal");
  addCard(state, "k", "growth", KINGPROTEA_GROWTH_ID, "servant-skills", "down", false);
  addCard(state, "k", "basic", str8.id, "attack", "up", true);
  useKingproteaInfiniteGrowth(ctx(state, KINGPROTEA_GROWTH_ID, { eventType: "card.played", event: { playerId: "k", instanceId: "basic", definitionId: str8.id, face: "up" } }));
  assert.equal(state.cards.growth.face, "down");
  const result = useKingproteaInfiniteGrowth(ctx(state, KINGPROTEA_GROWTH_ID, { eventType: "round.ending", event: { round: 4 } }));
  assert.equal(state.cards.growth.face, "up");
  assert.deepEqual(result.preservedInstanceIds, ["basic"]);
  assert.equal(state.cards.basic.residual, true);
  assert.equal(state.cards.basic.residualUntilRound, 5);
});

test("幼儿退行在Kingprotea自己的战斗中总威力>21时于判胜前关闭全部攻击", () => {
  const state = makeState("kingprotea-regression");
  state.phase = "combat";
  addCard(state, "k", "growth", KINGPROTEA_GROWTH_ID, "servant-skills", "down", false);
  addCard(state, "k", "a", str8.id, "attack", "up", true);
  addCard(state, "k", "b", agi8.id, "attack", "up", true);
  addCard(state, "k", "c", magic8.id, "attack", "up", true);
  addCard(state, "o", "weak", weak.id, "attack", "up", true);
  const combat = resolveCombat(state, "mountain", definitions, {});
  assert.deepEqual(new Set(state.players.k.attack), new Set(["a", "b", "c"]));
  for (const id of ["a", "b", "c"]) {
    assert.equal(state.cards[id].active, false);
    assert.equal(state.cards[id].face, "down");
  }
  assert.ok(combat.winnerIds.includes("o"));
});

test("巨影的通用ignore会让同回合>21战力不触发幼儿退行", () => {
  const state = makeState("kingprotea-regression-ignore");
  addCard(state, "k", "growth", KINGPROTEA_GROWTH_ID, "servant-skills", "down", false);
  state.phase = "outpost";
  useKingproteaLimitBreak(ctx(state, KINGPROTEA_LIMIT_BREAK_ID, { abilityId: "limit-break" }));
  state.phase = "combat";
  addCard(state, "k", "a", str8.id, "attack", "up", true);
  addCard(state, "k", "b", agi8.id, "attack", "up", true);
  addCard(state, "k", "c", magic8.id, "attack", "up", true);
  addCard(state, "o", "weak", weak.id, "attack", "up", true);
  const combat = resolveCombat(state, "mountain", definitions, {});
  assert.equal(state.players.k.attack.length, 3);
  assert.ok(combat.winnerIds.includes("k"));
});
