import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatSnapshot, finalizeCombatFromSnapshot } from "../src/rules-core/combat.ts";
import { getReservedEventIds, reserveEventUnderSource } from "../src/rules-core/event-lifecycle.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  NITOCRIS_HANDLER,
  NITOCRIS_HORUS_ACTION,
  NITOCRIS_HORUS_COMBAT,
  NITOCRIS_HORUS_ID,
  NITOCRIS_MIRROR_ACTION,
  NITOCRIS_MIRROR_COMBAT,
  NITOCRIS_MIRROR_ID,
  NITOCRIS_OFFERING_ACTION,
  NITOCRIS_OFFERING_ID,
  NITOCRIS_OFFERING_RESPONSE,
  isNitocrisOfferingResponseAvailable,
  resolveNitocrisDecision,
  useNitocris,
} from "../src/rules-core/nitocris.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const eventDefinitions = Object.fromEntries([
  ...built.events,
  ...Object.values(built.specialEventPools ?? {}).flat(),
].map((event) => [event.id, event]));
const definitions = {
  ...built.cards,
  ...Object.fromEntries(Object.entries(eventDefinitions).map(([id, event]) => [id, event])),
  ...built.skills.asCardDefinitions(),
};
const ordinaryEvents = built.events.filter((event) => Number(event.victoryPoints ?? 0) > 0);
const EVENT_A = ordinaryEvents[0];
const EVENT_B = ordinaryEvents[1];
assert.ok(EVENT_A && EVENT_B);

function setup(id = "nitocris") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "n", name: "Nitocris" }, { id: "o", name: "Opponent" }],
    seed: 41,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "n";
  state.turnOrder = ["n", "o"];
  state.players.n.servantId = "servant.nitocris";
  state.players.n.mana = 10;
  state.players.o.mana = 10;
  state.players.n.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["n", "o"];
  return state;
}

function addSkill(state, skillId, instanceId = `${skillId}:instance`) {
  return createOwnedCardInstance(state, "n", { instanceId, definitionId: skillId, zone: "attack", face: "up", active: true });
}

function ctx(state, skillId, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.n,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extra,
  };
}

function resolve(state, previous, selections) {
  return resolveNitocrisDecision(ctx(state, NITOCRIS_OFFERING_ID, {
    previous,
    decision: { status: "resolved", selections },
  }));
}

function placeEvent(state, event) {
  state.board.currentEvents.mountain = [...(state.board.currentEvents.mountain ?? []), event.id];
  state.board.eventVisibility[event.id] = "up";
}

test("Nitocris package is 3/3 FULL with the dedicated handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.nitocris");
  assert.equal(skills.length, 3);
  assert.equal(skills.filter((skill) => skill.supportLevel === "FULL").length, 3);
  assert.deepEqual(skills.filter((skill) => skill.supportLevel === "PARTIAL"), []);
  for (const skill of skills) {
    assert.equal(skill.handlerId, NITOCRIS_HANDLER);
    assert.equal(built.skills.hasHandler(skill.id), true);
  }
  assert.equal(built.skills.get(NITOCRIS_OFFERING_ID).requiresEightMana, false);
});

test("Underworld Tribute triples terrain and replaces only Nitocris's selected objective reward in a tie", () => {
  const state = setup("nitocris-offering-tie");
  addSkill(state, NITOCRIS_OFFERING_ID, "n:offering");
  placeEvent(state, EVENT_A);

  const action = useNitocris(ctx(state, NITOCRIS_OFFERING_ID, { abilityId: NITOCRIS_OFFERING_ACTION }));
  assert.equal(action.terrainMultiplier, 3);
  assert.equal(state.players.n.flags.terrainAdvantageContributionMultiplier, 3);

  state.phase = "combat";
  state.step = "post-power-response";
  const snapshot = {
    round: state.round,
    locationId: "mountain",
    participantIds: ["n", "o"],
    powers: { n: 5, o: 5 },
    attributes: { n: [], o: [] },
    participantVictoryPointsBeforeCombat: { n: 0, o: 0 },
    cardPowers: { n: {}, o: {} },
    cardAttributes: { n: {}, o: {} },
  };
  state.modeState.pendingCombatResolution = { snapshot, responderIds: ["n"], nextResponderIndex: 0 };
  assert.equal(isNitocrisOfferingResponseAvailable(state, "n", definitions, snapshot), true);
  let opened;
  const response = useNitocris(ctx(state, NITOCRIS_OFFERING_ID, { abilityId: NITOCRIS_OFFERING_RESPONSE }, { openDecision(value) { opened = value; } }));
  assert.equal(response.pending, true);
  assert.ok(opened.options.some((option) => option.id === EVENT_A.id));
  const frame = state.effectQueue.shift();
  resolve(state, frame.payload, [EVENT_A.id]);

  const control = setup("nitocris-offering-control");
  placeEvent(control, EVENT_A);
  control.phase = "combat";
  const ordinary = finalizeCombatFromSnapshot(control, snapshot, definitions, eventDefinitions);
  const manaBefore = state.players.n.mana;
  const result = finalizeCombatFromSnapshot(state, snapshot, definitions, eventDefinitions);
  assert.equal(result.winnerIds.includes("n"), true);
  assert.equal(result.winnerIds.includes("o"), true);
  assert.equal(state.players.o.victoryPoints, control.players.o.victoryPoints);
  assert.ok(state.players.n.victoryPoints < control.players.n.victoryPoints);
  assert.equal(state.players.n.mana - manaBefore, Number(EVENT_A.victoryPoints));
  assert.deepEqual(getReservedEventIds(state, "nitocris-entombed:n"), [EVENT_A.id]);
  assert.equal(state.board.currentEvents.mountain.includes(EVENT_A.id), false);
  assert.deepEqual(result.eventIds, ordinary.eventIds);
});

test("TATARI is never an Underworld Tribute entomb candidate", () => {
  const state = setup("nitocris-tatari");
  addSkill(state, NITOCRIS_OFFERING_ID, "n:offering");
  useNitocris(ctx(state, NITOCRIS_OFFERING_ID, { abilityId: NITOCRIS_OFFERING_ACTION }));
  state.board.currentEvents.mountain = ["master.wallachia.skill.s3", EVENT_A.id];
  state.phase = "combat";
  state.step = "post-power-response";
  const snapshot = { round: state.round, locationId: "mountain", participantIds: ["n", "o"], powers: { n: 5, o: 4 }, attributes: { n: [], o: [] } };
  state.modeState.pendingCombatResolution = { snapshot, responderIds: ["n"], nextResponderIndex: 0 };
  let opened;
  useNitocris(ctx(state, NITOCRIS_OFFERING_ID, { abilityId: NITOCRIS_OFFERING_RESPONSE }, { openDecision(value) { opened = value; } }));
  assert.deepEqual(opened.options.map((option) => option.id), [EVENT_A.id]);
});

test("Nether Mirror blocks entombing for its play round, releases any chosen entombed objectives, and defeats all opponents", () => {
  const blocked = setup("nitocris-mirror-block");
  addSkill(blocked, NITOCRIS_OFFERING_ID, "n:offering");
  addSkill(blocked, NITOCRIS_MIRROR_ID, "n:mirror");
  placeEvent(blocked, EVENT_A);
  useNitocris(ctx(blocked, NITOCRIS_MIRROR_ID, { eventType: "card.played", event: { playerId: "n", definitionId: NITOCRIS_MIRROR_ID, instanceId: "n:mirror" } }));
  useNitocris(ctx(blocked, NITOCRIS_OFFERING_ID, { abilityId: NITOCRIS_OFFERING_ACTION }));
  blocked.phase = "combat";
  blocked.step = "post-power-response";
  const blockedSnapshot = { round: blocked.round, locationId: "mountain", participantIds: ["n", "o"], powers: { n: 5, o: 4 }, attributes: { n: [], o: [] } };
  assert.equal(isNitocrisOfferingResponseAvailable(blocked, "n", definitions, blockedSnapshot), false);

  const state = setup("nitocris-mirror-release");
  addSkill(state, NITOCRIS_MIRROR_ID, "n:mirror");
  state.board.eventDeck = [EVENT_A.id, EVENT_B.id];
  reserveEventUnderSource(state, "nitocris-entombed:n", EVENT_A.id, NITOCRIS_OFFERING_ID, "n");
  reserveEventUnderSource(state, "nitocris-entombed:n", EVENT_B.id, NITOCRIS_OFFERING_ID, "n");
  let opened;
  const started = useNitocris(ctx(state, NITOCRIS_MIRROR_ID, { abilityId: NITOCRIS_MIRROR_ACTION }, { openDecision(value) { opened = value; } }));
  assert.equal(started.pending, true);
  assert.equal(opened.max, 2);
  const frame = state.effectQueue.shift();
  const released = resolve(state, frame.payload, [EVENT_A.id, EVENT_B.id]);
  const expectedPower = Number(EVENT_A.victoryPoints) + Number(EVENT_B.victoryPoints);
  assert.equal(released.totalPowerGained, expectedPower);
  assert.equal(state.players.n.flags.roundPowerBonus, expectedPower);
  assert.deepEqual(getReservedEventIds(state, "nitocris-entombed:n"), []);
  assert.ok(state.board.currentEvents.mountain.includes(EVENT_A.id));
  assert.ok(state.board.currentEvents.mountain.includes(EVENT_B.id));

  state.phase = "combat";
  const combat = useNitocris(ctx(state, NITOCRIS_MIRROR_ID, { abilityId: NITOCRIS_MIRROR_COMBAT }));
  assert.deepEqual(combat.targetIds, ["o"]);
  assert.equal(state.players.o.defeated, true);
});

test("Child of Horus gains VP per entombed objective and grants defeat immunity for the combat", () => {
  const state = setup("nitocris-horus");
  addSkill(state, NITOCRIS_HORUS_ID, "n:horus");
  state.board.eventDeck = [EVENT_A.id, EVENT_B.id];
  reserveEventUnderSource(state, "nitocris-entombed:n", EVENT_A.id, NITOCRIS_OFFERING_ID, "n");
  reserveEventUnderSource(state, "nitocris-entombed:n", EVENT_B.id, NITOCRIS_OFFERING_ID, "n");
  const before = state.players.n.victoryPoints;
  const service = useNitocris(ctx(state, NITOCRIS_HORUS_ID, { abilityId: NITOCRIS_HORUS_ACTION }));
  assert.equal(service.entombed, 2);
  assert.equal(service.victoryPointsGained, 2);
  assert.equal(state.players.n.victoryPoints, before + 2);
  state.phase = "combat";
  const horus = useNitocris(ctx(state, NITOCRIS_HORUS_ID, { abilityId: NITOCRIS_HORUS_COMBAT }));
  assert.equal(horus.ignoreDefeatRound, state.round);
  assert.equal(state.players.n.flags.ignoreDefeatRound, state.round);
});
