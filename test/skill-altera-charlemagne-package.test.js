import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, closePlayerCard } from "../src/rules-core/decks.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { initializeNamedEventPool, tryDrawEventToLocation } from "../src/rules-core/event-lifecycle.ts";
import {
  ALTERA_DESTROYED_CIVILIZATION_POOL,
  ALTERA_PHOTON_RAY_ID,
  ALTERA_TEARDROP_ID,
  useAlteraPhotonRay,
  useAlteraTeardropPhotonRay,
} from "../src/rules-core/altera.ts";
import {
  CHARLEMAGNE_JOYEUSE_ID,
  CHARLEMAGNE_PATRICIUS_ID,
  resolveCharlemagneJoyeuseOrdre,
  useCharlemagneJoyeuseOrdre,
} from "../src/rules-core/charlemagne.ts";

const built = buildStandardContent(legacyContent);
const allEvents = [...built.events, ...Object.values(built.specialEventPools ?? {}).flat()];
const eventDefinitions = Object.fromEntries(allEvents.map((event) => [event.id, {
  ...event,
  name: event.id,
  cardType: "event",
  cost: 0,
  basePower: 0,
  typeLabel: "特殊",
}]));
const definitions = {
  ...built.cards,
  ...eventDefinitions,
  ...built.skills.asCardDefinitions(),
  "card.test.str2": { id: "card.test.str2", name: "Str2", cardType: "attack", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.agi5": { id: "card.test.agi5", name: "Agi5", cardType: "attack", cost: 0, basePower: 5, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
};

function stateFor(id, playerIds) {
  const state = createGameState({ gameInstanceId: id, players: playerIds.map((playerId) => ({ id: playerId, name: playerId })), seed: 1801 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = playerIds[0];
  return state;
}

function putAt(state, playerId, locationId) {
  for (const occupants of Object.values(state.board.locations)) {
    const index = occupants.indexOf(playerId);
    if (index >= 0) occupants.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function initRuins(state) {
  const ids = built.specialEventPools[ALTERA_DESTROYED_CIVILIZATION_POOL].map((event) => event.id);
  initializeNamedEventPool(state, ALTERA_DESTROYED_CIVILIZATION_POOL, ids, () => 0);
}

test("Altera and Charlemagne targeted skills are 4/4 FULL", () => {
  for (const id of [ALTERA_TEARDROP_ID, ALTERA_PHOTON_RAY_ID, CHARLEMAGNE_JOYEUSE_ID, CHARLEMAGNE_PATRICIUS_ID]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL", id);
    assert.ok(skill.handlerId, id);
  }
});

test("Altera Photon Ray reduces owned skill costs by highest face-up event VP and Teardrop itself cannot be played", async () => {
  const state = stateFor("altera-cost", ["a"]);
  state.players.a.servantId = "servant.altera";
  putAt(state, "a", "mountain");
  createOwnedCardInstance(state, "a", { instanceId: "photon", definitionId: ALTERA_PHOTON_RAY_ID, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "tear", definitionId: ALTERA_TEARDROP_ID, zone: "servant-skills", face: "up", active: false });
  state.board.currentEvents.mountain = ["event.fuyuki.4", "event.fuyuki.1"];
  state.board.eventVisibility = { "event.fuyuki.4": "up", "event.fuyuki.1": "down" };
  assert.equal(getCardPlayCost(state, definitions[ALTERA_TEARDROP_ID], state.players.a, state.cards.tear, definitions), 9);
  const { assertCardCanEnterAttack } = await import("../src/rules-core/card-rules.ts");
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "a", instanceId: "tear", definitions, faceDown: false }), /CARD_CANNOT_BE_PLAYED/);
});

test("Altera Sword of Mars prevents opponent closure and power reduction without blocking ordinary cleanup semantics", () => {
  const state = stateFor("altera-mars", ["a", "o"]);
  state.players.a.servantId = "servant.altera";
  putAt(state, "a", "mountain");
  putAt(state, "o", "mountain");
  createOwnedCardInstance(state, "a", { instanceId: "photon", definitionId: ALTERA_PHOTON_RAY_ID, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "basic", definitionId: "card.test.str2", zone: "attack", face: "up", active: true });
  const skill = built.skills.get(ALTERA_PHOTON_RAY_ID);
  useAlteraPhotonRay({ state, player: state.players.a, skill, definitions, payload: { abilityId: "sword-of-mars" } });
  state.cards.basic.powerModifiers = [{ id: "opp-penalty", sourceId: "test", kind: "add", value: -9, duration: "round" }];
  assert.equal(calculateCombatCardPower(state, state.players.a, "basic", definitions, "mountain"), 2);
  assert.throws(() => closePlayerCard(state, "a", "basic", definitions, { closedByPlayerId: "o" }), /CARD_CLOSE_PROTECTED/);
  assert.doesNotThrow(() => closePlayerCard(state, "a", "basic", definitions));
});

test("Altera Teardrop waits a round, joins at its attached battlefield, reveals, then replaces future objectives with Destroyed Civilization", () => {
  const state = stateFor("altera-teardrop", ["a"]);
  state.players.a.servantId = "servant.altera";
  putAt(state, "a", "mountain");
  initRuins(state);
  createOwnedCardInstance(state, "a", { instanceId: "photon", definitionId: ALTERA_PHOTON_RAY_ID, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "tear", definitionId: ALTERA_TEARDROP_ID, zone: "servant-skills", face: "up", active: false });
  const photon = built.skills.get(ALTERA_PHOTON_RAY_ID);
  const teardrop = built.skills.get(ALTERA_TEARDROP_ID);
  state.phase = "combat";
  useAlteraPhotonRay({ state, player: state.players.a, skill: photon, definitions, payload: { abilityId: "attach-teardrop" } });
  assert.equal(state.cards.tear.zone, "board");
  assert.equal(state.cards.tear.boardPlacedRound, 4);
  useAlteraTeardropPhotonRay({ state, player: state.players.a, skill: teardrop, payload: { eventType: "phase.transitioned", event: { previousPhase: "action" } } });
  assert.equal(state.cards.tear.zone, "board");

  state.round = 5;
  state.phase = "combat";
  useAlteraTeardropPhotonRay({ state, player: state.players.a, skill: teardrop, payload: { eventType: "phase.transitioned", event: { previousPhase: "action" } } });
  assert.equal(state.cards.tear.zone, "attack");
  assert.equal(state.players.a.trueNameRevealed, true);
  useAlteraTeardropPhotonRay({ state, player: state.players.a, skill: teardrop, payload: { eventType: "combat.ending", event: { round: 5 } } });
  assert.equal(state.cards.tear.zone, "removed");
  assert.equal(state.board.eventPoolOverrides.mountain.poolId, ALTERA_DESTROYED_CIVILIZATION_POOL);

  state.board.currentEvents.mountain = [];
  state.board.eventVisibility = {};
  const eventId = tryDrawEventToLocation(state, "mountain", () => 0, "up");
  assert.ok(eventId.startsWith("event.civilization-ruins."));
});

test("Destroyed Civilization uses structured printed-base threshold power and never parses its display text", () => {
  const state = stateFor("altera-ruin-power", ["a"]);
  putAt(state, "a", "mountain");
  createOwnedCardInstance(state, "a", { instanceId: "agi5", definitionId: "card.test.agi5", zone: "attack", face: "up", active: true });
  state.board.currentEvents.mountain = ["event.civilization-ruins.1"];
  state.board.eventVisibility = { "event.civilization-ruins.1": "up" };
  assert.equal(calculateCombatCardPower(state, state.players.a, "agi5", definitions, "mountain"), 9);
});

test("Charles Patricius has round-linear cost and multiplies only positive Situation/Event power", () => {
  const state = stateFor("charles-multiplier", ["c"]);
  state.players.c.servantId = "servant.charlemagne";
  putAt(state, "c", "mountain");
  createOwnedCardInstance(state, "c", { instanceId: "patricius", definitionId: CHARLEMAGNE_PATRICIUS_ID, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "c", { instanceId: "basic", definitionId: "card.test.str2", zone: "attack", face: "up", active: true });
  assert.equal(getCardPlayCost(state, definitions[CHARLEMAGNE_PATRICIUS_ID], state.players.c, state.cards.patricius, definitions), 6);
  state.modeState.situationRestrictions = { combatPower: { cardAddByAttribute: { 力量: 2 }, locations: ["mountain"] } };
  state.board.currentEvents.mountain = ["event.fuyuki.6"];
  state.board.eventVisibility = { "event.fuyuki.6": "up" };
  assert.equal(calculateCombatCardPower(state, state.players.c, "basic", definitions, "mountain"), 12);
  state.modeState.currentSituationClimax = true;
  assert.equal(calculateCombatCardPower(state, state.players.c, "basic", definitions, "mountain"), 17);

  const negativeDefinitions = { ...definitions, "event.test.negative": { id: "event.test.negative", victoryPoints: 1, combatPower: { cardAddByAttribute: { 力量: -3 } } } };
  state.modeState.situationRestrictions = {};
  state.modeState.currentSituationClimax = false;
  state.board.currentEvents.mountain = ["event.test.negative"];
  state.board.eventVisibility = { "event.test.negative": "up" };
  assert.equal(calculateCombatCardPower(state, state.players.c, "basic", negativeDefinitions, "mountain"), 0);
});

test("Joyeuse draws an objective into the fight, grants its printed types to Charlemagne skills, and can return a won objective to its deck", () => {
  const state = stateFor("charlemagne-joyeuse", ["c"]);
  state.players.c.servantId = "servant.charlemagne";
  putAt(state, "c", "mountain");
  createOwnedCardInstance(state, "c", { instanceId: "joy", definitionId: CHARLEMAGNE_JOYEUSE_ID, zone: "attack", face: "up", active: true });
  state.board.eventDeck = ["event.fuyuki.4"];
  const skill = built.skills.get(CHARLEMAGNE_JOYEUSE_ID);
  state.phase = "combat";
  const used = useCharlemagneJoyeuseOrdre({ state, player: state.players.c, skill, definitions, randomInt: () => 0, payload: { abilityId: "joyeuse-draw-objective" } });
  assert.equal(used.eventId, "event.fuyuki.4");
  assert.ok(state.board.currentEvents.mountain.includes("event.fuyuki.4"));
  assert.ok(getCardInstanceAttributes(state.cards.joy, definitions[CHARLEMAGNE_JOYEUSE_ID], state, definitions).includes("魔术"));

  let decision;
  useCharlemagneJoyeuseOrdre({
    state,
    player: state.players.c,
    skill,
    definitions,
    payload: { eventType: "combat.resolved", event: { locationId: "mountain", winnerIds: ["c"], powers: { c: 20 } } },
    openDecision: (value) => { decision = value; },
  });
  assert.ok(decision);
  resolveCharlemagneJoyeuseOrdre({
    state,
    player: state.players.c,
    skill,
    randomInt: () => 0,
    payload: {
      previous: { locationId: "mountain", candidateEventIds: ["event.fuyuki.4"] },
      decision: { selections: ["event.fuyuki.4"] },
    },
  });
  assert.ok(!state.board.currentEvents.mountain.includes("event.fuyuki.4"));
  assert.ok(state.board.eventDeck.includes("event.fuyuki.4"));
});
