import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, removePhysicalCardFromGame } from "../src/rules-core/decks.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { getCardRulePowerAdd } from "../src/rules-core/card-rule-modifiers.ts";
import { grantRulerSeal, listRulerSealsControlledBy } from "../src/rules-core/ruler-seals.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  MORGAN_END_WORLD_ID,
  MORGAN_INFINITY_ID,
  useMorganEndOfWorld,
  useMorganInfinityMirror,
} from "../src/rules-core/morgan.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const magic = { id: "card.test.morgan-magic", name: "Magic Test", cardType: "attack", cost: 2, basePower: 3, typeLabel: "魔术", attributes: ["魔术"], basic: true };
const strength = { id: "card.test.morgan-strength", name: "Strength Test", cardType: "attack", cost: 2, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true };
const noble = { id: "card.test.morgan-np", name: "NP Test", cardType: "attack", cost: 1, basePower: 1, typeLabel: "宝具", attributes: ["宝具"], basic: false };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [magic.id]: magic, [strength.id]: strength, [noble.id]: noble };

function state(id) {
  const result = createGameState({ gameInstanceId: id, players: [{ id: "m", name: "Morgan" }, { id: "o", name: "Opponent" }, { id: "x", name: "Other" }], seed: 217 });
  result.status = "playing";
  result.round = 6;
  result.phase = "outpost";
  result.step = "player-window";
  result.activePlayerId = "m";
  result.players.m.servantId = "servant.morgan";
  result.players.m.commandSeals = 3;
  result.players.m.mana = 20;
  result.players.m.locationId = "mountain";
  result.players.o.locationId = "mountain";
  result.players.x.locationId = "city";
  result.board.locations.mountain = ["m", "o"];
  result.board.locations.city = ["x"];
  return result;
}

function add(s, id, definitionId, zone = "attack", face = "up", active = true) {
  createOwnedCardInstance(s, "m", { instanceId: id, definitionId, zone, face, active });
}

function ctx(s, skillId, payload, emitEvent = () => {}, openDecision = () => {}) {
  return { state: s, player: s.players.m, skill: built.skills.get(skillId), payload, definitions, emitEvent, openDecision };
}

test("摩根技能包3/3 FULL且裁决者复用通用Ruler handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.morgan");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get("servant.morgan.skill.sc-morgan-3").handlerId, "core.ruler-class");
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("来自止境支付普通令咒后，本回合成为狂战士；魔术与Preparation获得宝具属性和+3威力", () => {
  const s = state("morgan-infinity-command");
  add(s, "magic", magic.id);
  add(s, "strength", strength.id);
  add(s, "prep", "card.cardpreparation");
  const beforeSeals = s.players.m.commandSeals;
  const result = useMorganInfinityMirror(ctx(s, MORGAN_INFINITY_ID, { abilityId: "infinity-mirror", paymentId: "command" }));
  assert.equal(s.players.m.commandSeals, beforeSeals - 1);
  assert.equal(s.players.m.flags.servantClassRule, "berserker");
  assert.equal(s.players.m.flags.servantClassRuleRound, 6);
  assert.equal(result.class, "berserker");
  assert.ok(getCardInstanceAttributes(s.cards.magic, magic, s, definitions).includes("宝具"));
  assert.ok(getCardInstanceAttributes(s.cards.prep, definitions["card.cardpreparation"], s, definitions).includes("宝具"));
  assert.equal(getCardRulePowerAdd(s, s.players.m, s.cards.magic), 3);
  assert.equal(getCardRulePowerAdd(s, s.players.m, s.cards.prep), 3);
  assert.equal(getCardRulePowerAdd(s, s.players.m, s.cards.strength), 0);
  assert.ok(!getCardInstanceAttributes(s.cards.strength, strength, s, definitions).includes("宝具"));
});

test("来自止境也可支付自己控制的裁决者令咒，且支付不计为裁决者令咒行动使用", () => {
  const s = state("morgan-infinity-ruler-seal");
  s.players.m.commandSeals = 0;
  grantRulerSeal(s, "m", "o", "servant.morgan.skill.sc-morgan-3");
  const seal = listRulerSealsControlledBy(s, "m")[0];
  assert.ok(seal);
  const result = useMorganInfinityMirror(ctx(s, MORGAN_INFINITY_ID, { abilityId: "infinity-mirror", paymentId: `ruler:${seal.sealId}` }));
  assert.equal(result.payment, "ruler");
  assert.equal(listRulerSealsControlledBy(s, "m").length, 0);
  assert.notEqual(s.players.m.flags.rulerCommandSealUsesRound, 6);
  assert.equal(s.players.m.flags.servantClassRule, "berserker");
});

test("来自止境在回合结束清除狂战士职阶覆盖", () => {
  const s = state("morgan-infinity-cleanup");
  useMorganInfinityMirror(ctx(s, MORGAN_INFINITY_ID, { abilityId: "infinity-mirror", paymentId: "command" }));
  const result = useMorganInfinityMirror(ctx(s, MORGAN_INFINITY_ID, { eventType: "round.ending", event: { round: 6 } }));
  assert.equal(result.clearedClass, true);
  assert.equal(s.players.m.flags.servantClassRule, undefined);
  assert.equal(s.players.m.flags.servantClassRuleSource, undefined);
  assert.equal(s.players.m.flags.servantClassRuleRound, undefined);
});

test("止境在获胜后移除所有当前有效宝具，包括来自止境临时赋予宝具属性的魔术牌", () => {
  const s = state("morgan-end-world-effective-np");
  add(s, "magic", magic.id);
  add(s, "np", noble.id);
  add(s, "strength", strength.id);
  useMorganInfinityMirror(ctx(s, MORGAN_INFINITY_ID, { abilityId: "infinity-mirror", paymentId: "command" }));
  s.phase = "combat";
  const result = useMorganEndOfWorld(ctx(s, MORGAN_END_WORLD_ID, { eventType: "combat.resolved", event: { round: 6, winnerIds: ["m"], powers: { m: 10, o: 5 } } }));
  assert.deepEqual(new Set(result.removedInstanceIds), new Set(["magic", "np"]));
  assert.equal(s.cards.magic.zone, "removed");
  assert.equal(s.cards.np.zone, "removed");
  assert.equal(s.cards.strength.zone, "attack");
  assert.equal(s.players.m.flags.morganEndWorldRemovedCount, 2);
});

test("止境物理技能牌即使已移除仍按摩根身份触发；第7张以此法移除时立即获胜", () => {
  const s = state("morgan-end-world-persistent");
  add(s, "source", MORGAN_END_WORLD_ID, "servant-skills", "down", false);
  removePhysicalCardFromGame(s, "source");
  add(s, "np1", noble.id);
  add(s, "np2", noble.id);
  s.players.m.flags.morganEndWorldRemovedCount = 5;
  s.phase = "combat";
  const events = [];
  const result = useMorganEndOfWorld(ctx(s, MORGAN_END_WORLD_ID, { eventType: "combat.resolved", event: { round: 6, winnerIds: ["m"], powers: { m: 10, o: 4 } } }, (type, payload) => events.push({ type, payload })));
  assert.equal(result.totalRemoved, 7);
  assert.equal(result.wonGame, true);
  assert.equal(s.status, "finished");
  assert.deepEqual(s.modeState.instantVictoryIds, ["m"]);
  assert.equal(s.modeState.instantVictoryReason, MORGAN_END_WORLD_ID);
  assert.equal(events.at(-1).type, "game.finished");
});

test("止境仅在摩根赢得的战斗触发，败北时不移除宝具", () => {
  const s = state("morgan-end-world-loss");
  add(s, "np", noble.id);
  s.phase = "combat";
  const result = useMorganEndOfWorld(ctx(s, MORGAN_END_WORLD_ID, { eventType: "combat.resolved", event: { round: 6, winnerIds: ["o"], powers: { m: 4, o: 10 } } }));
  assert.equal(result, undefined);
  assert.equal(s.cards.np.zone, "attack");
});
