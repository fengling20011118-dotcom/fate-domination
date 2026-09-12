import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { movePlayerByEffect } from "../src/rules-core/board.ts";
import {
  getNamedEventPoolAvailableIds,
  initializeNamedEventPool,
  releaseNamedEventToLocation,
} from "../src/rules-core/event-lifecycle.ts";
import {
  applyLostbeltObjectiveRuntimeEvent,
  beginLostbeltExpansion,
  resolveLostbeltExpansion,
} from "../src/rules-core/lostbelt.ts";
import {
  KADOC_CRYPTER_HANDLER,
  KADOC_FAST_EXPANSION_HANDLER,
  KADOC_RUSSIAN_POOL_ID,
  useKadocFastExpansion,
} from "../src/rules-core/kadoc.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const specialEvents = Object.values(built.specialEventPools ?? {}).flat();
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  ...Object.fromEntries([...built.events, ...specialEvents].map((event) => [event.id, event])),
};

function skill(id) {
  return built.skills.get(id);
}

function setup(id = "kadoc-package") {
  const state = createGameState({
    gameInstanceId: id,
    players: [
      { id: "k", name: "Kadoc" },
      { id: "o", name: "Opponent" },
      { id: "r", name: "Remote" },
      { id: "x", name: "Offboard" },
    ],
    seed: 210,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "k";
  state.turnOrder = ["k", "o", "r", "x"];
  state.players.k.masterId = "master.kadoc";
  state.players.k.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.r.locationId = "city";
  state.players.x.locationId = null;
  state.players.k.mana = 10;
  state.players.o.mana = 10;
  state.players.r.mana = 10;
  state.players.x.mana = 10;
  state.players.k.victoryPoints = 10;
  state.players.o.victoryPoints = 10;
  state.players.r.victoryPoints = 10;
  state.players.x.victoryPoints = 10;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["k", "o"];
  state.board.locations.city = ["r"];
  state.board.locations.scouting = [];
  const russian = built.specialEventPools[KADOC_RUSSIAN_POOL_ID];
  initializeNamedEventPool(state, KADOC_RUSSIAN_POOL_ID, russian.map((event) => event.id), () => 0);
  return state;
}

test("Kadoc package is 7/7 FULL with executable handlers", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.kadoc");
  assert.equal(skills.length, 7);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.equal(skill("master.kadoc.skill.s1").handlerId, KADOC_CRYPTER_HANDLER);
  assert.equal(skill("master.kadoc.skill.ascension").handlerId, KADOC_FAST_EXPANSION_HANDLER);
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.unmodeledClauses ?? []), []);
});

test("Russian expansion replaces one of two revealed objectives and preserves zone uniqueness", () => {
  const state = setup("kadoc-expand");
  const ordinary = built.events.slice(0, 4).map((event) => event.id);
  assert.ok(ordinary.length >= 4);
  state.board.eventDeck = [...ordinary];
  state.board.eventDiscard = [];
  state.board.eventRemoved = [];
  let decision;
  const started = beginLostbeltExpansion(
    state,
    state.players.k,
    "master.kadoc.skill.s2",
    KADOC_RUSSIAN_POOL_ID,
    1,
    definitions,
    () => 0,
    (pending) => { decision = pending; state.pendingDecision = pending; },
  );
  assert.deepEqual(started.drawnEventIds, ordinary.slice(0, 2));
  assert.deepEqual(state.board.eventDeck, ordinary.slice(2));
  const frame = state.effectQueue.shift();
  assert.ok(frame);
  const russianId = getNamedEventPoolAvailableIds(state, KADOC_RUSSIAN_POOL_ID)[0];
  const selection = `replace:${ordinary[0]}:${russianId}`;
  assert.ok(decision.options.some((option) => option.id === selection));
  state.pendingDecision = null;
  resolveLostbeltExpansion({
    state,
    player: state.players.k,
    skill: skill("master.kadoc.skill.s2"),
    definitions,
    randomInt: () => 0,
    openDecision: () => undefined,
    payload: {
      previous: frame.payload,
      decision: { status: "resolved", selections: [selection] },
    },
  });
  assert.ok(state.board.eventRemoved.includes(ordinary[0]));
  assert.ok(state.board.eventDeck.includes(ordinary[1]));
  assert.ok(state.board.eventDeck.includes(russianId));
  assert.ok(!getNamedEventPoolAvailableIds(state, KADOC_RUSSIAN_POOL_ID).includes(russianId));
});

test("Frozen Wastes drains entrants while Russian immunity protects Kadoc", () => {
  const state = setup("kadoc-frozen");
  state.players.k.flags["lostbeltObjectiveImmunity:russia"] = true;
  const frozen = getNamedEventPoolAvailableIds(state, KADOC_RUSSIAN_POOL_ID)
    .find((eventId) => definitions[eventId]?.tags?.includes("lostbelt-effect:frozen-wastes"));
  assert.ok(frozen);
  releaseNamedEventToLocation(state, KADOC_RUSSIAN_POOL_ID, frozen, "mountain", "up");
  applyLostbeltObjectiveRuntimeEvent(state, "event.revealed", { eventId: frozen, locationId: "mountain" }, definitions);
  assert.equal(state.players.k.mana, 10);
  assert.equal(state.players.o.mana, 8);

  state.players.r.locationId = "mountain";
  state.board.locations.city = [];
  state.board.locations.mountain.push("r");
  applyLostbeltObjectiveRuntimeEvent(state, "player.entered-location", { playerId: "r", locationId: "mountain" }, definitions);
  assert.equal(state.players.r.mana, 8);
});

test("Survival of the Fittest blocks exit and penalizes combat losers", () => {
  const state = setup("kadoc-survival");
  const eventId = getNamedEventPoolAvailableIds(state, KADOC_RUSSIAN_POOL_ID)
    .find((id) => definitions[id]?.tags?.includes("lostbelt-effect:survival-of-fittest"));
  assert.ok(eventId);
  releaseNamedEventToLocation(state, KADOC_RUSSIAN_POOL_ID, eventId, "mountain", "up");
  assert.throws(() => movePlayerByEffect(state, "o", "city", definitions), /MOVEMENT_BLOCKED_BY_EVENT/);
  applyLostbeltObjectiveRuntimeEvent(state, "combat.resolved", {
    locationId: "mountain",
    participantIds: ["k", "o"],
    winnerIds: ["k"],
    eventIds: [eventId],
  }, definitions);
  assert.equal(state.players.k.victoryPoints, 10);
  assert.equal(state.players.o.victoryPoints, 7);
});

test("Royal Decree penalizes players away from its battlefield and clears offboard round gains", () => {
  const state = setup("kadoc-decree");
  const eventId = getNamedEventPoolAvailableIds(state, KADOC_RUSSIAN_POOL_ID)
    .find((id) => definitions[id]?.tags?.includes("lostbelt-effect:royal-decree"));
  assert.ok(eventId);
  releaseNamedEventToLocation(state, KADOC_RUSSIAN_POOL_ID, eventId, "mountain", "up");
  state.players.x.flags.roundVictoryPointsGained = 4;
  applyLostbeltObjectiveRuntimeEvent(state, "combat.resolved", {
    locationId: "mountain",
    participantIds: ["k", "o"],
    winnerIds: ["k"],
    eventIds: [eventId],
  }, definitions);
  assert.equal(state.players.k.victoryPoints, 10);
  assert.equal(state.players.o.victoryPoints, 10);
  assert.equal(state.players.r.victoryPoints, 8);
  assert.equal(state.players.x.victoryPoints, 4);
});

test("Fast Expansion grants Russian presence +5 and can place an outside objective directly", () => {
  const state = setup("kadoc-fast");
  const ascension = skill("master.kadoc.skill.ascension");
  useKadocFastExpansion({
    state,
    player: state.players.k,
    skill: ascension,
    definitions,
    openDecision: () => undefined,
    payload: { eventType: "skill.unlocked", event: { playerId: "k", skillId: ascension.id } },
  });
  const candidate = getNamedEventPoolAvailableIds(state, KADOC_RUSSIAN_POOL_ID)[0];
  const events = [];
  const result = useKadocFastExpansion({
    state,
    player: state.players.k,
    skill: ascension,
    definitions,
    openDecision: () => undefined,
    emitEvent: (type, payload) => events.push({ type, payload }),
    payload: { eventId: candidate },
  });
  assert.equal(result.placed, true);
  assert.ok(state.board.currentEvents.mountain.includes(candidate));
  assert.ok(events.some((event) => event.type === "event.revealed"));
  assert.equal(calculateCombatPower(state, state.players.k, definitions, "mountain"), 5);
});
