import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { wouldPlayerBeEliminatedAtNextClimax } from "../src/rules-core/rounds.ts";
import {
  PARVATI_ASHES_ID,
  PARVATI_IMAGINARY_ID,
  resolveParvatiImaginaryAround,
  useParvatiAshesOfKama,
  useParvatiImaginaryAround,
} from "../src/rules-core/parvati.ts";

const built = buildStandardContent(legacyContent);
new StandardMatchEngine(built);
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  "card.test.str": { id: "card.test.str", name: "Strength", cardType: "attack", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.agi": { id: "card.test.agi", name: "Agility", cardType: "attack", cost: 0, basePower: 2, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
  "card.test.mag": { id: "card.test.mag", name: "Magic", cardType: "attack", cost: 0, basePower: 2, typeLabel: "魔术", attributes: ["魔术"], basic: true },
  "card.test.drawn": { id: "card.test.drawn", name: "Drawn", cardType: "attack", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"] },
};

function makeState(id, count = 5) {
  const players = Array.from({ length: count }, (_, index) => ({ id: index === 0 ? "p" : `o${index}`, name: `P${index}` }));
  const state = createGameState({ gameInstanceId: id, players, seed: 2034 });
  state.status = "playing";
  state.round = 8;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "p";
  state.players.p.servantId = "servant.parvati";
  state.players.p.victoryPoints = 0;
  for (let index = 1; index < count; index += 1) state.players[`o${index}`].victoryPoints = index;
  state.players.p.locationId = "mountain";
  state.board.locations.mountain.push("p");
  return state;
}

function addSkill(state, skillId, instanceId, zone = "servant-skills", active = false) {
  createOwnedCardInstance(state, "p", { instanceId, definitionId: skillId, zone, face: "up", active });
}

function addCard(state, instanceId, definitionId, zone, active = false) {
  createOwnedCardInstance(state, "p", { instanceId, definitionId, zone, face: zone === "attack" ? "up" : "down", active });
}

test("Parvati package is 3/3 FULL and Imaginary Around keeps the explicit 8-mana waiver", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.parvati");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(PARVATI_IMAGINARY_ID).requiresEightMana, false);
  assert.ok(built.skills.get(PARVATI_ASHES_ID).tags.includes("revealed-hand-size-plus-one"));
});

test("Ashes of Kama uses the next-elimination cutoff, buffs current/future attacks and rewards a win", () => {
  const state = makeState("parvati-ashes");
  addSkill(state, PARVATI_ASHES_ID, "ashes");
  addCard(state, "atk", "card.test.mag", "attack", true);
  assert.equal(wouldPlayerBeEliminatedAtNextClimax(state, "p"), true);
  useParvatiAshesOfKama({ state, player: state.players.p, skill: built.skills.get(PARVATI_ASHES_ID), definitions, payload: { abilityId: "ashes-survival" } });
  assert.equal(calculateCombatCardPower(state, state.players.p, "atk", definitions, "mountain"), 3);
  state.phase = "combat";
  useParvatiAshesOfKama({ state, player: state.players.p, skill: built.skills.get(PARVATI_ASHES_ID), definitions, payload: { eventType: "combat.resolved", event: { winnerIds: ["p"] } } });
  assert.equal(state.players.p.victoryPoints, 1);

  const tied = makeState("parvati-tied");
  tied.players.p.victoryPoints = tied.players.o1.victoryPoints;
  assert.equal(wouldPlayerBeEliminatedAtNextClimax(tied, "p"), false);
});

test("Ashes of Kama draws three when Parvati's true name is revealed", () => {
  const state = makeState("parvati-reveal", 2);
  addSkill(state, PARVATI_ASHES_ID, "ashes");
  for (let i = 0; i < 3; i += 1) addCard(state, `deck${i}`, "card.test.drawn", "deck");
  useParvatiAshesOfKama({ state, player: state.players.p, skill: built.skills.get(PARVATI_ASHES_ID), definitions, randomInt: () => 0, payload: { eventType: "servant.true-name-revealed", event: { playerId: "p" } } });
  assert.equal(state.players.p.hand.length, 3);
});

test("Imaginary Around may discard its just-drawn card and its Action resolves different/same-type branches", () => {
  const state = makeState("parvati-imaginary", 2);
  addSkill(state, PARVATI_IMAGINARY_ID, "imaginary", "attack", true);
  addCard(state, "drawn", "card.test.drawn", "deck");
  let decision;
  useParvatiImaginaryAround({
    state,
    player: state.players.p,
    skill: built.skills.get(PARVATI_IMAGINARY_ID),
    definitions,
    randomInt: () => 0,
    openDecision: (value) => { decision = value; },
    payload: { eventType: "card.played", event: { playerId: "p", definitionId: PARVATI_IMAGINARY_ID, face: "up" } },
  });
  assert.equal(state.players.p.hand.includes("drawn"), true);
  resolveParvatiImaginaryAround({ state, player: state.players.p, skill: built.skills.get(PARVATI_IMAGINARY_ID), payload: { previous: { drawnInstanceId: "drawn" }, decision: { selections: ["discard"] } } });
  assert.equal(state.cards.drawn.zone, "discard");
  assert.equal(decision.kind, "parvati-imaginary-drawn-card");

  addCard(state, "s", "card.test.str", "discard");
  addCard(state, "a", "card.test.agi", "discard");
  addCard(state, "m", "card.test.mag", "discard");
  useParvatiImaginaryAround({ state, player: state.players.p, skill: built.skills.get(PARVATI_IMAGINARY_ID), definitions, randomInt: () => 0, payload: { abilityId: "imaginary-cycle", instanceIds: ["s", "a", "m"] } });
  assert.equal(state.players.p.flags.roundPowerBonus, 4);
  assert.ok(["s", "a", "m"].every((id) => state.cards[id].zone === "deck"));

  const moveState = makeState("parvati-imaginary-move", 2);
  addSkill(moveState, PARVATI_IMAGINARY_ID, "imaginary", "attack", true);
  addCard(moveState, "m1", "card.test.mag", "discard");
  addCard(moveState, "m2", "card.test.mag", "discard");
  addCard(moveState, "m3", "card.test.mag", "discard");
  useParvatiImaginaryAround({ state: moveState, player: moveState.players.p, skill: built.skills.get(PARVATI_IMAGINARY_ID), definitions, randomInt: () => 0, payload: { abilityId: "imaginary-cycle", instanceIds: ["m1", "m2", "m3"], targetLocationId: "city" } });
  assert.equal(moveState.players.p.locationId, "city");
});
