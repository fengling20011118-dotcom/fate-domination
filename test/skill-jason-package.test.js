import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  JASON_ATALANTE_ACTION_ABILITY,
  JASON_ATALANTE_COMBAT_ABILITY,
  JASON_ATALANTE_ID,
  JASON_HERACLES_ID,
  JASON_MEDEA_GRACE_ABILITY,
  JASON_MEDEA_ID,
  JASON_QUEST_HANDLER,
  sendJasonSkillOnQuest,
  useJasonArgonautQuest,
} from "../src/rules-core/jason.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const eventDefinitions = Object.fromEntries(built.events.map((event) => [event.id, {
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
  "card.test.attack1": { id: "card.test.attack1", name: "Test Attack 1", cardType: "attack", cost: 1, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.attack2": { id: "card.test.attack2", name: "Test Attack 2", cardType: "attack", cost: 2, basePower: 3, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
};

function skill(id) {
  return built.skills.get(id);
}

function setup(id = "jason") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "j", name: "Jason" }, { id: "o", name: "Opponent" }],
    seed: 1307,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "j";
  state.turnOrder = ["j", "o"];
  state.players.j.servantId = "servant.jason";
  state.players.j.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.j.mana = 10;
  state.players.o.mana = 10;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["j", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return state;
}

function addSkill(state, definitionId, instanceId) {
  return createOwnedCardInstance(state, "j", {
    instanceId,
    definitionId,
    zone: "attack",
    face: "up",
    active: true,
  });
}

function context(state, skillDefinition, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.j,
    skill: skillDefinition,
    definitions,
    payload,
    randomInt: (maxExclusive) => Math.max(0, maxExclusive - 1),
    openDecision() {},
    ...extra,
  };
}

test("Jason package is 3/3 FULL with the dedicated Quest handler", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "servant.jason");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => candidate.handlerId === JASON_QUEST_HANDLER));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  for (const candidate of skills) {
    assert.deepEqual(candidate.rules?.ambiguities ?? [], []);
    assert.deepEqual(candidate.rules?.unmodeledClauses ?? [], []);
  }
});

test("Quest shuffles only into the top ten remaining objectives and a revealed Quest returns free with a replacement objective", () => {
  const state = setup("jason-quest");
  addSkill(state, JASON_HERACLES_ID, "j:heracles");
  const eventIds = built.events.slice(0, 12).map((event) => event.id);
  assert.equal(eventIds.length, 12);
  state.board.eventDeck = [...eventIds];

  sendJasonSkillOnQuest(state, state.players.j, JASON_HERACLES_ID, (maxExclusive) => Math.max(0, maxExclusive - 1));
  assert.equal(state.cards["j:heracles"].zone, "removed");
  assert.ok(state.board.eventDeck.slice(0, 11).includes(JASON_HERACLES_ID));
  assert.deepEqual(state.board.eventDeck.slice(11), eventIds.slice(10));

  const questIndex = state.board.eventDeck.indexOf(JASON_HERACLES_ID);
  state.board.eventDeck.splice(questIndex, 1);
  state.board.currentEvents.mountain = [JASON_HERACLES_ID];
  state.board.eventVisibility = { [JASON_HERACLES_ID]: "up" };
  const result = useJasonArgonautQuest(context(state, skill(JASON_HERACLES_ID), {
    eventType: "event.revealed",
    event: { eventId: JASON_HERACLES_ID, locationId: "mountain" },
  }));
  assert.equal(result.returnedInstanceId, "j:heracles");
  assert.equal(state.cards["j:heracles"].zone, "attack");
  assert.equal(state.cards["j:heracles"].active, true);
  assert.equal(state.cards["j:heracles"].playedRound, undefined);
  assert.ok(!state.board.currentEvents.mountain.includes(JASON_HERACLES_ID));
  assert.ok(result.replacementEventId);
  assert.ok(state.board.currentEvents.mountain.includes(result.replacementEventId));
});

test("Heracles God Hand arms only from an actual play, then quests and gains 2 VP after a lost fight", () => {
  const state = setup("jason-heracles");
  addSkill(state, JASON_HERACLES_ID, "j:heracles");
  state.board.eventDeck = built.events.slice(0, 12).map((event) => event.id);
  state.players.j.victoryPoints = 1;
  useJasonArgonautQuest(context(state, skill(JASON_HERACLES_ID), {
    eventType: "card.played",
    event: { playerId: "j", definitionId: JASON_HERACLES_ID, instanceId: "j:heracles" },
  }));
  const result = useJasonArgonautQuest(context(state, skill(JASON_HERACLES_ID), {
    eventType: "combat.resolved",
    event: { locationId: "mountain", participantIds: ["j", "o"], winnerIds: ["o"], powers: { j: 8, o: 9 } },
  }));
  assert.equal(result.victoryPoints, 2);
  assert.equal(state.players.j.victoryPoints, 3);
  assert.equal(state.cards["j:heracles"].zone, "removed");
  assert.ok(state.board.eventDeck.includes(JASON_HERACLES_ID));
});

test("Atalante grants one extra paid attack in Action and Combat, then quests after the Combat use", () => {
  const state = setup("jason-atalante");
  addSkill(state, JASON_ATALANTE_ID, "j:atalante");
  createOwnedCardInstance(state, "j", { instanceId: "j:a1", definitionId: "card.test.attack1", zone: "hand", face: "up", active: false });
  createOwnedCardInstance(state, "j", { instanceId: "j:a2", definitionId: "card.test.attack2", zone: "hand", face: "up", active: false });
  state.board.eventDeck = built.events.slice(0, 12).map((event) => event.id);

  useJasonArgonautQuest(context(state, skill(JASON_ATALANTE_ID), { abilityId: JASON_ATALANTE_ACTION_ABILITY, instanceId: "j:a1" }));
  assert.equal(state.cards["j:a1"].zone, "attack");
  assert.equal(state.players.j.mana, 9);
  assert.equal(state.cards["j:atalante"].zone, "attack");

  state.phase = "combat";
  useJasonArgonautQuest(context(state, skill(JASON_ATALANTE_ID), { abilityId: JASON_ATALANTE_COMBAT_ABILITY, instanceId: "j:a2" }));
  assert.equal(state.players.j.mana, 7);
  assert.equal(state.players.j.flags.jasonAtalanteQuestRound, state.round);
  useJasonArgonautQuest(context(state, skill(JASON_ATALANTE_ID), { eventType: "combat.ending", event: { round: state.round } }));
  assert.equal(state.cards["j:atalante"].zone, "removed");
  assert.ok(state.board.eventDeck.includes(JASON_ATALANTE_ID));
});

test("Medea gains 2 mana, schedules +4 next-round total power, and quests immediately", () => {
  const state = setup("jason-medea");
  addSkill(state, JASON_MEDEA_ID, "j:medea");
  state.players.j.mana = 3;
  state.phase = "combat";
  state.board.eventDeck = built.events.slice(0, 12).map((event) => event.id);
  const result = useJasonArgonautQuest(context(state, skill(JASON_MEDEA_ID), { abilityId: JASON_MEDEA_GRACE_ABILITY }));
  assert.equal(result.mana, 2);
  assert.equal(state.players.j.mana, 5);
  assert.equal(state.players.j.flags.nextRoundTotalPowerBonus, 4);
  assert.equal(state.cards["j:medea"].zone, "removed");
  assert.ok(state.board.eventDeck.includes(JASON_MEDEA_ID));
});
