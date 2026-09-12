import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  ASHVA_AVATAR_ID, ASHVA_MAHAKALA_ID, ASHVA_CHAKRA_ID,
  useAshvaAvatarRage, resolveAshvaAvatarRage,
  useAshvaMahakala, resolveAshvaMahakala,
  useAshvaSudarshanChakra, resolveAshvaSudarshanChakra,
} from "../src/rules-core/ashvatthaman.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function state(id) {
  const s = createGameState({ gameInstanceId: id, players: [{ id: "a", name: "Ashva" }, { id: "o", name: "Opponent" }], seed: 7 });
  s.status = "playing";
  s.round = 4;
  s.phase = "action";
  s.step = "player-window";
  s.activePlayerId = "a";
  s.turnOrder = ["a", "o"];
  s.players.a.servantId = "servant.ashva";
  s.players.a.mana = 20;
  s.players.a.victoryPoints = 5;
  s.players.a.locationId = "mountain";
  s.players.o.locationId = "mountain";
  s.board.locations.mountain = ["a", "o"];
  s.board.locations.city = [];
  return s;
}
function add(s, playerId, instanceId, definitionId, zone = "servant-skills", face = "up", active = false) {
  createOwnedCardInstance(s, playerId, { instanceId, definitionId, zone, face, active });
}
function ctx(s, skillId, payload, openDecision = () => {}) {
  return { state: s, player: s.players.a, skill: built.skills.get(skillId), payload, definitions, openDecision };
}

test("马嘶技能包3/3 FULL并注册专用handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.ashva");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.unmodeledClauses ?? []), []);
});

test("转轮按当前地利减免费用；尘归尘最多移除3张局势弃牌并每张+2威力", () => {
  const s = state("ashva-chakra");
  add(s, "a", "chakra", ASHVA_CHAKRA_ID, "attack", "up", true);
  s.players.a.flags.deploymentBonusActive = true;
  s.players.a.flags.deploymentLocationId = "mountain";
  s.players.a.flags.deploymentBonus = 2;
  const chakraDef = definitions[ASHVA_CHAKRA_ID];
  assert.equal(getCardPlayCost(s, chakraDef, s.players.a, s.cards.chakra, definitions), 5);
  s.board.situationDiscard = ["situation.sit1", "situation.sit2", "situation.sit3", "situation.sit4"];
  let decision;
  useAshvaSudarshanChakra(ctx(s, ASHVA_CHAKRA_ID, { abilityId: "ashes-to-ashes" }, (value) => { decision = value; }));
  assert.equal(decision.max, 3);
  const frame = s.effectQueue[0];
  const result = resolveAshvaSudarshanChakra(ctx(s, ASHVA_CHAKRA_ID, {
    previous: frame.payload, decision: { status: "resolved", selections: ["situation.sit1", "situation.sit2", "situation.sit3"] },
  }));
  assert.equal(result.powerBonus, 6);
  assert.deepEqual(s.board.situationDiscard, ["situation.sit4"]);
  assert.equal(s.cards.chakra.powerModifiers.at(-1).value, 6);
});

test("愤怒化身仅将局势威力增益翻倍，并在回合结束将激活局势移除游戏", () => {
  const s = state("ashva-avatar-ruin");
  add(s, "a", "avatar", ASHVA_AVATAR_ID, "attack", "up", true);
  add(s, "a", "basic", "card.cardb1", "attack", "up", true);
  s.board.activeSituations = ["situation.sit4"];
  s.modeState.situationRestrictions = { combatPower: { cardAddByAttribute: { 力量: 1 } } };
  const before = calculateCombatCardPower(s, s.players.a, "basic", definitions);
  useAshvaAvatarRage(ctx(s, ASHVA_AVATAR_ID, { abilityId: "avatar-ruin" }));
  const after = calculateCombatCardPower(s, s.players.a, "basic", definitions);
  assert.equal(after, before + 1);
  const ending = useAshvaAvatarRage(ctx(s, ASHVA_AVATAR_ID, { eventType: "round.ending", event: { round: s.round } }));
  assert.deepEqual(ending.removedSituationIds, ["situation.sit4"]);
  assert.deepEqual(s.board.activeSituations, []);
});

test("奎师那诅咒胜利后可支付1战果保留残留牌，也可选择关闭", () => {
  const pay = state("ashva-curse-pay");
  add(pay, "a", "avatar", ASHVA_AVATAR_ID, "attack", "up", true);
  let decision;
  useAshvaAvatarRage(ctx(pay, ASHVA_AVATAR_ID, { eventType: "combat.resolved", event: { winnerIds: ["a"], participantIds: ["a", "o"] } }, (value) => { decision = value; }));
  assert.ok(decision.options.some((option) => option.id === "pay-vp"));
  const frame = pay.effectQueue[0];
  const before = pay.players.a.victoryPoints;
  resolveAshvaAvatarRage(ctx(pay, ASHVA_AVATAR_ID, { previous: frame.payload, decision: { status: "resolved", selections: ["pay-vp"] } }));
  assert.equal(pay.players.a.victoryPoints, before - 1);
  assert.equal(pay.cards.avatar.zone, "attack");

  const close = state("ashva-curse-close");
  add(close, "a", "avatar", ASHVA_AVATAR_ID, "attack", "up", true);
  let closeDecision;
  useAshvaAvatarRage(ctx(close, ASHVA_AVATAR_ID, { eventType: "combat.resolved", event: { winnerIds: ["a"] } }, (value) => { closeDecision = value; }));
  const closeFrame = close.effectQueue[0];
  resolveAshvaAvatarRage(ctx(close, ASHVA_AVATAR_ID, { previous: closeFrame.payload, decision: { status: "resolved", selections: ["close"] } }));
  assert.equal(close.cards.avatar.zone, "servant-skills");
});

test("伟大的时间下回合从局势弃牌额外激活一张，并于该回合结束移除", () => {
  const s = state("ashva-mahakala");
  add(s, "a", "mahakala", ASHVA_MAHAKALA_ID, "attack", "up", true);
  useAshvaMahakala(ctx(s, ASHVA_MAHAKALA_ID, { abilityId: "mahakala-past" }));
  assert.equal(s.players.a.flags.ashvaMahakalaPendingRound, 5);
  s.round = 5;
  s.phase = "preparation";
  s.board.activeSituations = ["situation.sit5"];
  s.board.situationDiscard = ["situation.sit1", "situation.sit2"];
  let decision;
  useAshvaMahakala(ctx(s, ASHVA_MAHAKALA_ID, { eventType: "round.started", event: { round: 5 } }, (value) => { decision = value; }));
  const frame = s.effectQueue[0];
  resolveAshvaMahakala(ctx(s, ASHVA_MAHAKALA_ID, { previous: frame.payload, decision: { status: "resolved", selections: ["situation.sit2"] } }));
  assert.deepEqual(s.board.activeSituations, ["situation.sit5", "situation.sit2"]);
  assert.deepEqual(s.board.situationDiscard, ["situation.sit1"]);
  const ending = useAshvaMahakala(ctx(s, ASHVA_MAHAKALA_ID, { eventType: "round.ending", event: { round: 5 } }));
  assert.equal(ending.removedSituationId, "situation.sit2");
  assert.deepEqual(s.board.activeSituations, ["situation.sit5"]);
});
