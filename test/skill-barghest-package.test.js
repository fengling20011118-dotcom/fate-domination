import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { movePlayer, movePlayerByEffect } from "../src/rules-core/board.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  BARGHEST_CHAINS_ID,
  BARGHEST_GALATINE_ID,
  BARGHEST_SUN_ID,
  useBarghestBlackDogGalatine,
  useBarghestDemonChains,
  useBarghestSunDevourer,
} from "../src/rules-core/barghest.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const p2 = { id: "card.test.barghest-p2", name: "P2", cardType: "attack", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true };
const p3a = { id: "card.test.barghest-p3a", name: "P3A", cardType: "attack", cost: 0, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true };
const p3b = { id: "card.test.barghest-p3b", name: "P3B", cardType: "attack", cost: 0, basePower: 3, typeLabel: "迅捷", attributes: ["迅捷"], basic: true };
const p3c = { id: "card.test.barghest-p3c", name: "P3C", cardType: "attack", cost: 0, basePower: 3, typeLabel: "魔术", attributes: ["魔术"], basic: true };
const p4 = { id: "card.test.barghest-p4", name: "P4", cardType: "attack", cost: 0, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [p2.id]: p2, [p3a.id]: p3a, [p3b.id]: p3b, [p3c.id]: p3c, [p4.id]: p4 };

function state(id, phase = "action") {
  const result = createGameState({ gameInstanceId: id, players: [{ id: "b", name: "Barghest" }, { id: "o", name: "Opponent" }], seed: 227 });
  result.status = "playing";
  result.round = 5;
  result.phase = phase;
  result.step = phase === "action" ? "play-batch-draft" : "player-window";
  result.activePlayerId = "b";
  result.players.b.servantId = "servant.barghest";
  result.players.b.mana = 12;
  result.players.b.locationId = "mountain";
  result.players.o.locationId = "mountain";
  result.board.locations.workshop = [];
  result.board.locations.mountain = ["b", "o"];
  result.board.locations.city = [];
  result.board.locations.scouting = [];
  return result;
}

function add(s, playerId, id, definitionId, zone = "hand", face, active = false) {
  return createOwnedCardInstance(s, playerId, {
    instanceId: id,
    definitionId,
    zone,
    face: face ?? (zone === "servant-skills" || zone === "master-skills" ? "up" : "down"),
    active,
  });
}

function ctx(s, skillId, payload, emitEvent = () => {}, openDecision = () => {}) {
  return { state: s, player: s.players.b, skill: built.skills.get(skillId), payload, definitions, emitEvent, openDecision, randomInt: () => 0 };
}

test("Barghest技能包3/3 FULL并全部接入真实handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.barghest");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("Demon Chains/Landbound禁止跨越Workshop+Miyama与Shinto+Recon边界，区内移动仍允许", () => {
  const s = state("barghest-landbound");
  add(s, "b", "chains", BARGHEST_CHAINS_ID, "servant-skills", "up", false);
  s.players.b.locationId = "workshop";
  s.board.locations.mountain = ["o"];
  s.board.locations.workshop = ["b"];
  s.step = "move-decision";
  assert.doesNotThrow(() => movePlayer(s, "b", "mountain", false, definitions));
  assert.equal(s.players.b.locationId, "mountain");
  s.step = "move-decision";
  assert.throws(() => movePlayer(s, "b", "city", false, definitions), /MOVEMENT_DESTINATION_FORBIDDEN_BY_RULE/);

  const effectState = state("barghest-landbound-effect");
  add(effectState, "b", "chains", BARGHEST_CHAINS_ID, "servant-skills", "up", false);
  effectState.players.b.locationId = "city";
  effectState.board.locations.mountain = ["o"];
  effectState.board.locations.city = ["b"];
  assert.throws(() => movePlayerByEffect(effectState, "b", "mountain", definitions), /MOVEMENT_DESTINATION_FORBIDDEN_BY_RULE/);
  assert.doesNotThrow(() => movePlayerByEffect(effectState, "b", "scouting", definitions));
});

test("Wild Rule只将同场对手本回合真实使用过行动/战斗能力的攻击威力设为0", () => {
  const s = state("barghest-wild", "combat");
  add(s, "b", "chains", BARGHEST_CHAINS_ID, "attack", "up", true);
  const used = add(s, "o", "used", "card.cardsurveil", "attack", "up", true);
  used.abilityUsage = { "basic.quick-march": { round: 5, phase: "action", used: true } };
  add(s, "o", "unused", p4.id, "attack", "up", true);
  const result = useBarghestDemonChains(ctx(s, BARGHEST_CHAINS_ID, { abilityId: "wild-rule" }));
  assert.deepEqual(result.affectedInstanceIds, ["used"]);
  assert.equal(calculateCombatCardPower(s, s.players.o, "used", definitions, "mountain"), 0);
  assert.equal(calculateCombatCardPower(s, s.players.o, "unused", definitions, "mountain"), 4);
});

test("Black Dog Galatine展示三张印刷3威力牌时获得+15而非+9，并公开展示事件", () => {
  const s = state("barghest-galatine-15");
  add(s, "b", "galatine", BARGHEST_GALATINE_ID, "attack", "up", true);
  add(s, "b", "a", p3a.id);
  add(s, "b", "c", p3b.id);
  add(s, "b", "d", p3c.id);
  const events = [];
  const result = useBarghestBlackDogGalatine(ctx(s, BARGHEST_GALATINE_ID, { abilityId: "devour", selectedInstanceIds: ["a", "c", "d"] }, (type, payload) => events.push({ type, payload })));
  assert.equal(result.powerBonus, 15);
  assert.deepEqual(result.printedPowers, [3, 3, 3]);
  assert.equal(events.filter((event) => event.type === "card.revealed").length, 3);
  assert.equal(calculateCombatCardPower(s, s.players.b, "galatine", definitions, "mountain"), 18);
});

test("Black Dog Galatine非三张3威力时按所展示牌印刷威力求和", () => {
  const s = state("barghest-galatine-sum");
  add(s, "b", "galatine", BARGHEST_GALATINE_ID, "attack", "up", true);
  add(s, "b", "a", p2.id);
  add(s, "b", "c", p4.id);
  const result = useBarghestBlackDogGalatine(ctx(s, BARGHEST_GALATINE_ID, { abilityId: "devour", selectedInstanceIds: ["a", "c"] }));
  assert.equal(result.powerBonus, 6);
  assert.equal(calculateCombatCardPower(s, s.players.b, "galatine", definitions, "mountain"), 9);
});

test("Sun Devourer在自己的行动回合开始抽2张，并将本回合可打牌精确限制为这两张", () => {
  const s = state("barghest-sun-draw");
  add(s, "b", "sun", BARGHEST_SUN_ID, "attack", "up", true);
  add(s, "b", "old", p4.id, "hand");
  add(s, "b", "special", "card.cardpreparation", "deck");
  add(s, "b", "drawn", p3a.id, "deck");
  add(s, "b", "later", p2.id, "deck");
  const result = useBarghestSunDevourer(ctx(s, BARGHEST_SUN_ID, { eventType: "phase.transitioned", event: { previousPhase: "outpost", transition: "next-phase" } }));
  assert.deepEqual(result.drawnInstanceIds, ["special", "drawn"]);
  assert.deepEqual(result.specialDrawnInstanceIds, ["special"]);
  assert.deepEqual(s.players.b.roundPlayRestriction.allowedInstanceIds, ["special", "drawn"]);
  assert.throws(() => commitStandardAttack(s, "b", ["old", "drawn"], [], definitions), /CARD_PLAY_RESTRICTED_THIS_ROUND/);
  assert.equal(s.cards.old.zone, "hand");
});

test("Sun Devourer可弃置其抽到的Special换打一张技能牌，且该技能费用-2", () => {
  const s = state("barghest-sun-substitute");
  add(s, "b", "sun", BARGHEST_SUN_ID, "attack", "up", true);
  add(s, "b", "special", "card.cardpreparation", "deck");
  add(s, "b", "drawn", p3a.id, "deck");
  add(s, "b", "chains", BARGHEST_CHAINS_ID, "servant-skills", "up", false);
  useBarghestSunDevourer(ctx(s, BARGHEST_SUN_ID, { eventType: "phase.transitioned", event: { previousPhase: "outpost", transition: "next-phase" } }));
  const beforeMana = s.players.b.mana;
  const result = commitStandardAttack(s, "b", ["chains", "drawn"], [], definitions, {
    cardDataByInstanceId: { chains: { roundPlayRestrictionDiscardInstanceId: "special" } },
  });
  assert.equal(result.paidMana, 1);
  assert.equal(s.players.b.mana, beforeMana - 1);
  assert.equal(s.cards.special.zone, "discard");
  assert.equal(s.cards.chains.zone, "attack");
  assert.equal(s.cards.chains.paidCost, 1);
});

test("Sun Devourer进入Workshop立即关闭，并撤销由自身建立的本回合出牌限制", () => {
  const s = state("barghest-sun-workshop");
  add(s, "b", "sun", BARGHEST_SUN_ID, "attack", "up", true);
  s.players.b.roundPlayRestriction = {
    round: 5,
    sourceId: BARGHEST_SUN_ID,
    allowedInstanceIds: ["x"],
    substitution: { eligibleDiscardInstanceIds: [], targetKind: "skill", costReduction: 2 },
  };
  const result = useBarghestSunDevourer(ctx(s, BARGHEST_SUN_ID, { eventType: "player.entered-location", event: { playerId: "b", previousLocationId: "mountain", locationId: "workshop" } }));
  assert.equal(result.closedInstanceId, "sun");
  assert.equal(s.cards.sun.zone, "servant-skills");
  assert.equal(s.cards.sun.active, false);
  assert.equal(s.players.b.roundPlayRestriction, undefined);
});
