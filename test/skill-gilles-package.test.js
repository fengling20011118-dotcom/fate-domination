import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import {
  GILLES_CALL_ANCIENTS_ID,
  GILLES_MASS_SUMMONING_ID,
  useGillesCallAncients,
  useGillesMassSummoning,
} from "../src/rules-core/gilles.ts";

const built = buildStandardContent(legacyContent);
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  "card.test.mag2": { id: "card.test.mag2", name: "Magic 2", cardType: "attack", cost: 2, basePower: 2, typeLabel: "魔术", attributes: ["魔术"], basic: true },
  "card.test.mag3": { id: "card.test.mag3", name: "Magic 3", cardType: "attack", cost: 3, basePower: 3, typeLabel: "魔术", attributes: ["魔术"], basic: true },
  "card.test.str": { id: "card.test.str", name: "Strength", cardType: "attack", cost: 1, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true },
};

function makeState(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "g", name: "Gilles" }, { id: "o", name: "Opponent" }], seed: 1802 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "g";
  state.players.g.servantId = "servant.gilles";
  state.players.g.mana = 20;
  putAt(state, "g", "mountain");
  putAt(state, "o", "mountain");
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

function add(state, playerId, instanceId, definitionId, zone, active = false, face = zone === "attack" ? "up" : "down") {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, active, face });
}

test("吉尔·德·雷技能包 3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.gilles");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
});

test("大规模召唤可打出至多3张魔术攻击、支付费用并将属性改为力量或迅捷", () => {
  const state = makeState("gilles-mass");
  add(state, "g", "spellbook", GILLES_MASS_SUMMONING_ID, "attack", true, "up");
  add(state, "g", "m2", "card.test.mag2", "hand");
  add(state, "g", "m3", "card.test.mag3", "hand");
  const beforeMana = state.players.g.mana;
  useGillesMassSummoning({
    state,
    player: state.players.g,
    skill: built.skills.get(GILLES_MASS_SUMMONING_ID),
    definitions,
    payload: { abilityId: "mass-summoning", instanceIds: ["m2", "m3"], typeByInstanceId: { m2: "力量", m3: "迅捷" } },
  });
  assert.equal(state.players.g.mana, beforeMana - 5);
  assert.equal(state.cards.m2.zone, "attack");
  assert.equal(state.cards.m3.zone, "attack");
  assert.deepEqual(getCardInstanceAttributes(state.cards.m2, definitions["card.test.mag2"], state, definitions), ["力量"]);
  assert.deepEqual(getCardInstanceAttributes(state.cards.m3, definitions["card.test.mag3"], state, definitions), ["迅捷"]);
});

test("螺湮城教本与另一张明置魔术攻击同批打出时才抽1张牌", () => {
  const state = makeState("gilles-paired");
  add(state, "g", "spellbook", GILLES_MASS_SUMMONING_ID, "attack", true, "up");
  add(state, "g", "magic", "card.test.mag2", "attack", true, "up");
  add(state, "g", "drawn", "card.test.str", "deck");
  useGillesMassSummoning({
    state,
    player: state.players.g,
    skill: built.skills.get(GILLES_MASS_SUMMONING_ID),
    definitions,
    randomInt: () => 0,
    payload: { eventType: "attack.committed", event: { playerId: "g", faceUpInstanceIds: ["spellbook", "magic"] } },
  });
  assert.equal(state.cards.drawn.zone, "hand");
});

test("古神的呼唤实体放置于战场、失去宝具，仅主人在场时计入攻击并在战败后关闭", () => {
  const state = makeState("gilles-ancients");
  add(state, "g", "ancients", GILLES_CALL_ANCIENTS_ID, "attack", true, "up");
  useGillesCallAncients({
    state,
    player: state.players.g,
    skill: built.skills.get(GILLES_CALL_ANCIENTS_ID),
    definitions,
    payload: { eventType: "card.played", event: { playerId: "g", instanceId: "ancients", face: "up" } },
  });
  assert.equal(state.cards.ancients.zone, "board");
  assert.equal(state.cards.ancients.boardLocationId, "mountain");
  assert.equal(state.cards.ancients.boardAttackWhileOwnerPresent, true);
  assert.deepEqual(getCardInstanceAttributes(state.cards.ancients, definitions[GILLES_CALL_ANCIENTS_ID], state, definitions), ["力量"]);
  assert.equal(calculateCombatPower(state, state.players.g, definitions, "mountain"), 8);

  putAt(state, "g", "city");
  assert.equal(calculateCombatPower(state, state.players.g, definitions, "city"), 0);
  putAt(state, "g", "mountain");
  state.phase = "combat";
  useGillesCallAncients({
    state,
    player: state.players.g,
    skill: built.skills.get(GILLES_CALL_ANCIENTS_ID),
    definitions,
    payload: { eventType: "combat.resolved", event: { locationId: "mountain", powers: { g: 8, o: 9 }, winnerIds: ["o"] } },
  });
  assert.equal(state.cards.ancients.zone, "servant-skills");
  assert.equal(state.cards.ancients.boardAttackWhileOwnerPresent, undefined);
  assert.equal(state.cards.ancients.attributeOverrides, undefined);
});

test("古神的呼唤在所附战场不再可用时关闭", () => {
  const state = makeState("gilles-unavailable");
  add(state, "g", "ancients", GILLES_CALL_ANCIENTS_ID, "attack", true, "up");
  useGillesCallAncients({ state, player: state.players.g, skill: built.skills.get(GILLES_CALL_ANCIENTS_ID), definitions, payload: { eventType: "card.played", event: { playerId: "g", instanceId: "ancients", face: "up" } } });
  state.modeState.situationRestrictions = { forbiddenLocations: ["mountain"] };
  useGillesCallAncients({ state, player: state.players.g, skill: built.skills.get(GILLES_CALL_ANCIENTS_ID), definitions, payload: { eventType: "round.started", event: {} } });
  assert.equal(state.cards.ancients.zone, "servant-skills");
});
