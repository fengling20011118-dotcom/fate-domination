import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { calculateCombatCardPower, calculateTerrainAdvantage } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { movePlayerByEffect } from "../src/rules-core/board.ts";
import { getNamedEventPoolAvailableIds, initializeNamedEventPool, releaseNamedEventToLocation } from "../src/rules-core/event-lifecycle.ts";
import {
  INDIA_EXPANSION_HANDLER,
  INDIA_NIRVANA_HANDLER,
  INDIA_OBJECTIVE_HANDLER,
  INDIA_POOL_ID,
  INDIA_YUGA_HANDLER,
  applyIndiaObjectiveRuntimeEvent,
  expandIndiaLostbelt,
  getIndiaJudgementPowerBonus,
  getIndiaLostbeltSize,
  getIndiaYugaCycleEventIds,
  getIndiaYugaX,
  syncIndiaYugaCycle,
  useIndiaExpansionLifecycle,
  useIndiaNirvana,
} from "../src/rules-core/india-lostbelt.ts";
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

function setup(id = "pepe-india") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "p", name: "Pepe" }, { id: "o", name: "Opponent" }, { id: "r", name: "Remote" }],
    seed: 313,
  });
  state.status = "playing";
  state.round = 1;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "p";
  state.turnOrder = ["p", "o", "r"];
  state.players.p.masterId = "master.peperoncino";
  state.players.p.flags.lostbeltResponsibility = "india";
  state.players.p.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.r.locationId = "city";
  state.players.p.mana = 10;
  state.players.o.mana = 10;
  state.players.r.mana = 10;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["p", "o"];
  state.board.locations.city = ["r"];
  state.board.locations.scouting = [];
  const india = built.specialEventPools[INDIA_POOL_ID];
  initializeNamedEventPool(state, INDIA_POOL_ID, india.map((event) => event.id), () => 0);
  return state;
}

function addAttack(state, playerId, instanceId, definitionId) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone: "attack",
    face: "up",
    active: true,
  });
}

test("Peperoncino package is 7/7 FULL and all four Indian Lostbelt skills are executable", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.peperoncino");
  assert.equal(skills.length, 7);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.equal(skill("master.peperoncino.skill.s2").handlerId, INDIA_EXPANSION_HANDLER);
  assert.equal(skill("master.peperoncino.skill.s3").handlerId, INDIA_YUGA_HANDLER);
  assert.equal(skill("master.peperoncino.skill.s4").handlerId, INDIA_OBJECTIVE_HANDLER);
  assert.equal(skill("master.peperoncino.skill.ascension").handlerId, INDIA_NIRVANA_HANDLER);
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.unmodeledClauses ?? []), []);
});

test("Yuga Cycle selects the confirmed objective families and X values by round", () => {
  const state = setup("pepe-yuga");
  syncIndiaYugaCycle(state, definitions);
  assert.equal(getIndiaYugaX(state), 4);
  assert.equal(getIndiaYugaCycleEventIds(state).length, 4);

  state.round = 5;
  syncIndiaYugaCycle(state, definitions);
  assert.equal(getIndiaYugaX(state), 3);
  assert.equal(getIndiaYugaCycleEventIds(state).length, 3);

  state.round = 8;
  syncIndiaYugaCycle(state, definitions);
  assert.equal(getIndiaYugaX(state), 2);
  assert.deepEqual(getIndiaYugaCycleEventIds(state).map((id) => definitions[id].tags).map((tags) => tags.some((tag) => tag === "india-fading-town" || tag === "india-withering-plains")), [true, true]);

  state.round = 10;
  syncIndiaYugaCycle(state, definitions);
  assert.equal(getIndiaYugaX(state), 1);
  assert.equal(getIndiaYugaCycleEventIds(state).length, 1);
  assert.ok(definitions[getIndiaYugaCycleEventIds(state)[0]].tags.includes("india-ocean-of-milk"));

  state.round = 11;
  state.modeState.indiaLostbeltSize = 1;
  syncIndiaYugaCycle(state, definitions);
  assert.equal(getIndiaYugaX(state), 1);
  assert.equal(getIndiaJudgementPowerBonus(state, state.players.p), -10);
  state.modeState.indiaLostbeltSize = 5;
  syncIndiaYugaCycle(state, definitions);
  assert.equal(getIndiaYugaX(state), 5);
  assert.equal(getIndiaJudgementPowerBonus(state, state.players.p), 5);
});

test("first Expansion places one current-cycle objective; winning discards it and permanently grows India", () => {
  const state = setup("pepe-expand-win");
  syncIndiaYugaCycle(state, definitions);
  const result = expandIndiaLostbelt({
    state,
    player: state.players.p,
    skill: skill("master.peperoncino.skill.s3"),
    definitions,
    randomInt: () => 0,
    openDecision: () => undefined,
  }, "master.peperoncino.skill.s3");
  assert.ok(result.expandedEventId);
  assert.ok(state.board.currentEvents.mountain.includes(result.expandedEventId));
  assert.equal(state.players.p.flags.indiaExpandedRound, 1);
  useIndiaExpansionLifecycle({
    state,
    player: state.players.p,
    skill: skill("master.peperoncino.skill.s2"),
    definitions,
    openDecision: () => undefined,
    payload: { eventType: "combat.ending", event: { combatWinnerIdsByLocation: { mountain: ["p"], city: ["r"] } } },
  });
  assert.ok(state.board.eventDiscard.includes(result.expandedEventId));
  assert.equal(getIndiaLostbeltSize(state), 1);
});

test("losing the battlefield exiles an expanded objective and does not grow India", () => {
  const state = setup("pepe-expand-loss");
  syncIndiaYugaCycle(state, definitions);
  const result = expandIndiaLostbelt({
    state, player: state.players.p, skill: skill("master.peperoncino.skill.s3"), definitions,
    randomInt: () => 0, openDecision: () => undefined,
  }, "master.peperoncino.skill.s3");
  useIndiaExpansionLifecycle({
    state, player: state.players.p, skill: skill("master.peperoncino.skill.s2"), definitions, openDecision: () => undefined,
    payload: { eventType: "combat.ending", event: { combatWinnerIdsByLocation: { mountain: ["o"], city: ["r"] } } },
  });
  assert.ok(state.board.eventRemoved.includes(result.expandedEventId));
  assert.equal(getIndiaLostbeltSize(state), 0);
});

test("Lotus/Research/Hunting +X applies only to matching attacks normally played this round", () => {
  const state = setup("pepe-type-bonus");
  syncIndiaYugaCycle(state, definitions);
  const lotus = getIndiaYugaCycleEventIds(state).find((id) => definitions[id].tags.includes("india-type-bonus:力量"));
  assert.ok(lotus);
  releaseNamedEventToLocation(state, INDIA_POOL_ID, lotus, "mountain", "up");
  const testDefinitions = {
    ...definitions,
    "test.strength": { id: "test.strength", name: "Strength", cardType: "attack", cost: 0, basePower: 3, typeLabel: "力量", attributes: ["力量"] },
  };
  const card = addAttack(state, "o", "strength", "test.strength");
  card.playedRound = state.round;
  assert.equal(calculateCombatCardPower(state, state.players.o, card.instanceId, testDefinitions, "mountain"), 7);
  card.playedByEffectRound = state.round;
  assert.equal(calculateCombatCardPower(state, state.players.o, card.instanceId, testDefinitions, "mountain"), 3);
  delete card.playedByEffectRound;
  card.playedRound = state.round - 1;
  assert.equal(calculateCombatCardPower(state, state.players.o, card.instanceId, testDefinitions, "mountain"), 3);
});

test("Fading Town gives Peperoncino +X terrain and prevents him leaving", () => {
  const state = setup("pepe-fading-town");
  state.round = 8;
  syncIndiaYugaCycle(state, definitions);
  const fading = getIndiaYugaCycleEventIds(state).find((id) => definitions[id].tags.includes("india-fading-town"));
  assert.ok(fading);
  releaseNamedEventToLocation(state, INDIA_POOL_ID, fading, "mountain", "up");
  assert.equal(calculateTerrainAdvantage(state, state.players.p, definitions, "mountain"), 2);
  assert.throws(() => movePlayerByEffect(state, "p", "city", definitions), /MOVEMENT_BLOCKED_BY_EVENT/);
});

test("Withering Plains goes to discard and grows India when Peperoncino wins another battlefield", () => {
  const state = setup("pepe-withering");
  state.round = 8;
  syncIndiaYugaCycle(state, definitions);
  const cycle = getIndiaYugaCycleEventIds(state);
  const witheringIndex = cycle.findIndex((id) => definitions[id].tags.includes("india-withering-plains"));
  assert.ok(witheringIndex >= 0);
  const result = expandIndiaLostbelt({
    state, player: state.players.p, skill: skill("master.peperoncino.skill.s3"), definitions,
    randomInt: () => witheringIndex, openDecision: () => undefined,
  }, "master.peperoncino.skill.s3");
  assert.ok(definitions[result.expandedEventId].tags.includes("india-withering-plains"));
  useIndiaExpansionLifecycle({
    state, player: state.players.p, skill: skill("master.peperoncino.skill.s2"), definitions, openDecision: () => undefined,
    payload: { eventType: "combat.ending", event: { combatWinnerIdsByLocation: { mountain: ["o"], city: ["p"] } } },
  });
  assert.ok(state.board.eventDiscard.includes(result.expandedEventId));
  assert.equal(getIndiaLostbeltSize(state), 1);
});

test("Ocean of Milk defeats non-NP users, respects defeat immunity, and Nirvana grants India immunity to opponents", () => {
  const state = setup("pepe-ocean");
  state.round = 10;
  syncIndiaYugaCycle(state, definitions);
  const ocean = getIndiaYugaCycleEventIds(state)[0];
  releaseNamedEventToLocation(state, INDIA_POOL_ID, ocean, "mountain", "up");
  state.players.p.flags.noblePhantasmUsedRound = 10;
  state.players.o.flags.ignoreDefeatRound = 10;
  applyIndiaObjectiveRuntimeEvent(state, "phase.transitioned", { previousPhase: "action", transition: "next-phase" }, definitions, () => 0);
  assert.equal(state.players.p.defeated, false);
  assert.equal(state.players.o.defeated, false);

  delete state.players.o.flags.ignoreDefeatRound;
  applyIndiaObjectiveRuntimeEvent(state, "phase.transitioned", { previousPhase: "action", transition: "next-phase" }, definitions, () => 0);
  assert.equal(state.players.o.defeated, true);

  const immune = setup("pepe-ocean-immune");
  useIndiaNirvana({
    state: immune, player: immune.players.p, skill: skill("master.peperoncino.skill.ascension"), definitions, openDecision: () => undefined,
    payload: { eventType: "skill.unlocked", event: { playerId: "p", skillId: "master.peperoncino.skill.ascension" } },
  });
  immune.round = 10;
  syncIndiaYugaCycle(immune, definitions);
  const immuneOcean = getIndiaYugaCycleEventIds(immune)[0];
  releaseNamedEventToLocation(immune, INDIA_POOL_ID, immuneOcean, "mountain", "up");
  applyIndiaObjectiveRuntimeEvent(immune, "phase.transitioned", { previousPhase: "action", transition: "next-phase" }, definitions, () => 0);
  assert.equal(immune.players.o.defeated, false);
});

test("Nirvana Shunyata removes a Cycle objective for +2 mana/+3 power; Forced Expansion pays 7 for +1 Size", () => {
  const state = setup("pepe-nirvana");
  const ascension = skill("master.peperoncino.skill.ascension");
  syncIndiaYugaCycle(state, definitions);
  const chosen = getIndiaYugaCycleEventIds(state)[0];
  state.phase = "outpost";
  state.players.p.mana = 5;
  const shunyata = useIndiaNirvana({
    state, player: state.players.p, skill: ascension, definitions, openDecision: () => undefined,
    payload: { abilityId: "shunyata", eventId: chosen },
  });
  assert.equal(shunyata.removedEventId, chosen);
  assert.equal(state.players.p.mana, 7);
  assert.equal(state.players.p.flags.roundPowerBonus, 3);
  assert.ok(state.board.eventRemoved.includes(chosen));

  state.phase = "action";
  state.players.p.mana = 10;
  const forced = useIndiaNirvana({
    state, player: state.players.p, skill: ascension, definitions, openDecision: () => undefined,
    payload: { abilityId: "forced-expansion" },
  });
  assert.equal(forced.paidMana, 7);
  assert.equal(state.players.p.mana, 3);
  assert.equal(getIndiaLostbeltSize(state), 1);
});
