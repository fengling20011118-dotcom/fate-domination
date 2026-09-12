import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { getBattlefieldCompetitionReward } from "../src/rules-core/scoring.ts";
import {
  GARETH_GUN_LANCE_ID,
  GARETH_IRA_ID,
  resolveGarethIraLupus,
  useGarethGunLance,
  useGarethIraLupus,
} from "../src/rules-core/gareth.ts";

const built = buildStandardContent(legacyContent);
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  "card.test.str": { id: "card.test.str", name: "Strength", cardType: "attack", cost: 1, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.mag": { id: "card.test.mag", name: "Magic", cardType: "attack", cost: 1, basePower: 2, typeLabel: "魔术", attributes: ["魔术"], basic: true },
  "card.test.mag-nonbasic": { id: "card.test.mag-nonbasic", name: "Magic Special", cardType: "attack", cost: 1, basePower: 2, typeLabel: "魔术", attributes: ["魔术"] },
  "card.test.power5": { id: "card.test.power5", name: "Power 5", cardType: "attack", cost: 0, basePower: 5, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.power1": { id: "card.test.power1", name: "Power 1", cardType: "attack", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true },
};

function makeState(id, playerCount = 3) {
  const players = Array.from({ length: playerCount }, (_, index) => ({ id: index === 0 ? "g" : `o${index}`, name: `P${index}` }));
  const state = createGameState({ gameInstanceId: id, players, seed: 1648 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "g";
  state.players.g.servantId = "servant.gareth";
  for (const playerId of Object.keys(state.players)) putAt(state, playerId, "mountain");
  return state;
}

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function addOwned(state, playerId, instanceId, definitionId, zone, active = false, face = zone === "attack" ? "up" : "down") {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}

function activateSkill(state, skillId, instanceId) {
  addOwned(state, "g", instanceId, skillId, "attack", true, "up");
}

test("加雷斯技能包 3/3 FULL，Gun Lance 使用结构化以太充能前置条件", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.gareth");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.deepEqual(built.skills.get(GARETH_GUN_LANCE_ID).playPrerequisite, {
    discardFromHand: { count: 1, basic: true, attributesAll: ["魔术"] },
  });
});

test("以太充能是原子性的实体牌打出前置，不能拿同批正在打出的牌支付", () => {
  const make = (id) => {
    const state = makeState(id, 2);
    state.phase = "action";
    state.step = "play-batch-draft";
    state.players.g.mana = 20;
    addOwned(state, "g", "gun", GARETH_GUN_LANCE_ID, "hand");
    addOwned(state, "g", "str", "card.test.str", "hand");
    addOwned(state, "g", "mag", "card.test.mag", "hand");
    return state;
  };

  const missing = make("gareth-ether-missing");
  assert.throws(() => commitStandardAttack(missing, "g", ["gun", "str"], [], definitions), /CARD_PLAY_PREREQUISITE_DISCARD_SELECTION_REQUIRED/);
  assert.equal(missing.cards.mag.zone, "hand");
  assert.equal(missing.cards.gun.zone, "hand");

  const samePlay = make("gareth-ether-same-play");
  assert.throws(() => commitStandardAttack(samePlay, "g", ["gun", "mag"], [], definitions, {
    cardDataByInstanceId: { gun: { playPrerequisiteDiscardInstanceIds: ["mag"] } },
  }), /CARD_PLAY_PREREQUISITE_DISCARD_INVALID/);
  assert.equal(samePlay.cards.mag.zone, "hand");

  const valid = make("gareth-ether-valid");
  const result = commitStandardAttack(valid, "g", ["gun", "str"], [], definitions, {
    cardDataByInstanceId: { gun: { playPrerequisiteDiscardInstanceIds: ["mag"] } },
  });
  assert.equal(result.committed.includes("gun"), true);
  assert.equal(valid.cards.mag.zone, "discard");
  assert.equal(valid.cards.gun.zone, "attack");
  assert.equal(valid.cards.str.zone, "attack");
});

test("以太充能拒绝非基础魔术攻击", () => {
  const state = makeState("gareth-ether-invalid", 2);
  state.phase = "action";
  state.step = "play-batch-draft";
  state.players.g.mana = 20;
  addOwned(state, "g", "gun", GARETH_GUN_LANCE_ID, "hand");
  addOwned(state, "g", "str", "card.test.str", "hand");
  addOwned(state, "g", "fake", "card.test.mag-nonbasic", "hand");
  assert.throws(() => commitStandardAttack(state, "g", ["gun", "str"], [], definitions, {
    cardDataByInstanceId: { gun: { playPrerequisiteDiscardInstanceIds: ["fake"] } },
  }), /CARD_PLAY_PREREQUISITE_DISCARD_(?:MISSING|INVALID)/);
});

test("电池过载支付2战果，使基础魔术攻击获得力量/+2并在战后移出游戏", () => {
  const state = makeState("gareth-gun-lance", 2);
  state.players.g.victoryPoints = 5;
  activateSkill(state, GARETH_GUN_LANCE_ID, "gun");
  addOwned(state, "g", "magic", "card.test.mag", "attack", true, "up");

  useGarethGunLance({
    state,
    player: state.players.g,
    skill: built.skills.get(GARETH_GUN_LANCE_ID),
    definitions,
    payload: { abilityId: "battery-overload", targetInstanceId: "magic" },
  });
  assert.equal(state.players.g.victoryPoints, 3);
  assert.ok(getCardInstanceAttributes(state.cards.magic, definitions["card.test.mag"], state, definitions).includes("力量"));
  assert.equal(calculateCombatCardPower(state, state.players.g, "magic", definitions, "mountain"), 4);

  useGarethGunLance({
    state,
    player: state.players.g,
    skill: built.skills.get(GARETH_GUN_LANCE_ID),
    definitions,
    payload: { eventType: "combat.ending" },
  });
  assert.equal(state.cards.magic.zone, "removed");
  assert.equal(state.cards.gun.zone, "attack");
});

test("困兽之狼暗置打出会降低争夺战战果，并累积为下次额外抽打一张", () => {
  const state = makeState("gareth-ira", 3);
  state.players.g.mana = 10;
  activateSkill(state, GARETH_IRA_ID, "ira");
  addOwned(state, "g", "d1", "card.test.str", "deck");
  addOwned(state, "g", "d2", "card.test.str", "deck");
  addOwned(state, "g", "d3", "card.test.str", "deck");
  let decision;
  useGarethIraLupus({
    state,
    player: state.players.g,
    skill: built.skills.get(GARETH_IRA_ID),
    definitions,
    randomInt: () => 0,
    openDecision: (value) => { decision = value; },
    payload: { abilityId: "cornered-wolf" },
  });
  assert.equal(decision.kind, "gareth-ira-play-drawn");
  const previous = state.effectQueue[0].payload;
  resolveGarethIraLupus({
    state,
    player: state.players.g,
    skill: built.skills.get(GARETH_IRA_ID),
    definitions,
    randomInt: () => 0,
    openDecision: () => {},
    payload: { previous, decision: { status: "resolved", selections: ["face-down"] } },
  });
  assert.equal(state.cards.d1.zone, "attack");
  assert.equal(state.cards.d1.face, "down");
  assert.equal(getBattlefieldCompetitionReward(state, "mountain"), 1);
  assert.equal(state.players.g.flags.garethIraExtraDraws, 1);

  // With only one opponent after the first base term is zero; the stored hidden
  // card still creates exactly one draw-and-play on the next use.
  putAt(state, "o2", "city");
  let secondDecision;
  useGarethIraLupus({
    state,
    player: state.players.g,
    skill: built.skills.get(GARETH_IRA_ID),
    definitions,
    randomInt: () => 0,
    openDecision: (value) => { secondDecision = value; },
    payload: { abilityId: "cornered-wolf" },
  });
  assert.equal(secondDecision.kind, "gareth-ira-play-drawn");
  assert.equal(state.players.g.flags.garethIraExtraDraws, 0);
});

test("战场争夺战战果调整会进入正式战斗计分", () => {
  const state = makeState("gareth-score", 2);
  state.cards = {};
  state.players.g.attack = [];
  state.players.o1.attack = [];
  addOwned(state, "g", "win", "card.test.power5", "attack", true, "up");
  addOwned(state, "o1", "lose", "card.test.power1", "attack", true, "up");
  state.modeState.battlefieldCompetitionRewardAdjustments = { mountain: -1 };
  const result = resolveCombat(state, "mountain", definitions, {});
  assert.deepEqual(result.winnerIds, ["g"]);
  assert.equal(result.victoryPoints.g, 1);
});
