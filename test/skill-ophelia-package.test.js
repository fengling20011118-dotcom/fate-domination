import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import {
  getNamedEventPoolAvailableIds,
  initializeNamedEventPool,
  releaseNamedEventToLocation,
} from "../src/rules-core/event-lifecycle.ts";
import { applyLostbeltObjectiveRuntimeEvent } from "../src/rules-core/lostbelt.ts";
import {
  OPHELIA_PROLONGATION_HANDLER,
  OPHELIA_SCANDINAVIAN_POOL_ID,
  useOpheliaProlongation,
  useOpheliaWorldEater,
} from "../src/rules-core/ophelia.ts";
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

function setup(id = "ophelia-package") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "f", name: "Ophelia" }, { id: "o", name: "Opponent" }, { id: "r", name: "Remote" }],
    seed: 211,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "f";
  state.turnOrder = ["f", "o", "r"];
  state.players.f.masterId = "master.ophelia";
  state.players.f.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.r.locationId = "city";
  state.players.f.mana = 10;
  state.players.o.mana = 10;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["f", "o"];
  state.board.locations.city = ["r"];
  state.board.locations.scouting = [];
  const scandinavia = built.specialEventPools[OPHELIA_SCANDINAVIAN_POOL_ID];
  initializeNamedEventPool(state, OPHELIA_SCANDINAVIAN_POOL_ID, scandinavia.map((event) => event.id), () => 0);
  return state;
}

function addAttack(state, playerId, instanceId, definitionId, extra = {}) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone: "attack",
    face: "up",
    active: true,
    ...extra,
  });
}

test("Ophelia package is 10/10 FULL and all formerly partial skills are executable", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.ophelia");
  assert.equal(skills.length, 10);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.equal(skill("master.ophelia.skill.s2").handlerId, OPHELIA_PROLONGATION_HANDLER);
  assert.equal(skill("master.ophelia.skill.s3").handlerId, "core.lostbelt-expansion");
  assert.equal(skill("master.ophelia.skill.ascension").handlerId, "core.ophelia-world-eater");
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.unmodeledClauses ?? []), []);
});

test("Prolongation never reduces existing power but blocks later increases above that snapshot", () => {
  const state = setup("ophelia-prolongation");
  const testDefinitions = {
    ...definitions,
    "test.ophelia.attack": { id: "test.ophelia.attack", name: "Test Attack", cardType: "attack", cost: 0, basePower: 3, typeLabel: "力量", attributes: ["力量"] },
  };
  const attack = addAttack(state, "o", "o-existing", "test.ophelia.attack");
  attack.powerModifiers = [{ id: "existing", sourceId: "test", kind: "add", value: 5, duration: "round" }];
  assert.equal(calculateCombatCardPower(state, state.players.o, attack.instanceId, testDefinitions, "mountain"), 8);

  useOpheliaProlongation({ state, player: state.players.f, skill: skill("master.ophelia.skill.s2"), definitions: testDefinitions, openDecision: () => undefined });
  assert.equal(state.players.f.mana, 8);
  assert.equal(calculateCombatCardPower(state, state.players.o, attack.instanceId, testDefinitions, "mountain"), 8);
  attack.powerModifiers.push({ id: "later", sourceId: "test", kind: "add", value: 4, duration: "round" });
  assert.equal(calculateCombatCardPower(state, state.players.o, attack.instanceId, testDefinitions, "mountain"), 8);

  const later = addAttack(state, "o", "o-later", "test.ophelia.attack");
  later.powerModifiers = [{ id: "later-only", sourceId: "test", kind: "add", value: 5, duration: "round" }];
  assert.equal(calculateCombatCardPower(state, state.players.o, later.instanceId, testDefinitions, "mountain"), 3);
});

test("Prolongation has a real twice-per-game usage limit", () => {
  const state = setup("ophelia-prolongation-limit");
  const id = "master.ophelia.skill.s2";
  const data = { abilityId: "prolongation" };
  built.skills.execute(state, "f", id, data, () => undefined, () => 0, definitions);
  built.skills.execute(state, "f", id, data, () => undefined, () => 0, definitions);
  assert.equal(state.players.f.mana, 6);
  assert.throws(() => built.skills.execute(state, "f", id, data, () => undefined, () => 0, definitions), /SKILL_USE_FORBIDDEN/);
});

test("Scandinavian domains apply their +4/-2 attribute modifiers through event combat rules", () => {
  const state = setup("ophelia-domains");
  const ids = getNamedEventPoolAvailableIds(state, OPHELIA_SCANDINAVIAN_POOL_ID);
  const surtr = ids.find((id) => definitions[id]?.tags?.includes("lostbelt-effect:surtrs-domain"));
  assert.ok(surtr);
  releaseNamedEventToLocation(state, OPHELIA_SCANDINAVIAN_POOL_ID, surtr, "mountain", "up");

  const testDefinitions = {
    ...definitions,
    "test.strength": { id: "test.strength", name: "Strength", cardType: "attack", cost: 0, basePower: 3, typeLabel: "力量", attributes: ["力量"] },
    "test.agility": { id: "test.agility", name: "Agility", cardType: "attack", cost: 0, basePower: 3, typeLabel: "迅捷", attributes: ["迅捷"] },
  };
  const strength = addAttack(state, "o", "strength", "test.strength");
  const agility = addAttack(state, "o", "agility", "test.agility");
  const withoutEvent = structuredClone(state);
  withoutEvent.board.currentEvents.mountain = [];
  const baseStrength = calculateCombatCardPower(withoutEvent, withoutEvent.players.o, strength.instanceId, testDefinitions, "mountain");
  const baseAgility = calculateCombatCardPower(withoutEvent, withoutEvent.players.o, agility.instanceId, testDefinitions, "mountain");
  assert.equal(calculateCombatCardPower(state, state.players.o, strength.instanceId, testDefinitions, "mountain"), baseStrength + 4);
  assert.equal(calculateCombatCardPower(state, state.players.o, agility.instanceId, testDefinitions, "mountain"), baseAgility - 2);
});

test("A Day of Peace self-removes after combat and cannot return to the outside pool", () => {
  const state = setup("ophelia-peace");
  const day = getNamedEventPoolAvailableIds(state, OPHELIA_SCANDINAVIAN_POOL_ID)
    .find((id) => definitions[id]?.tags?.includes("lostbelt-effect:day-of-peace"));
  assert.ok(day);
  releaseNamedEventToLocation(state, OPHELIA_SCANDINAVIAN_POOL_ID, day, "mountain", "up");
  applyLostbeltObjectiveRuntimeEvent(state, "combat.resolved", {
    locationId: "mountain", participantIds: ["f", "o"], winnerIds: ["f"], eventIds: [day],
  }, definitions);
  assert.ok(state.board.eventRemoved.includes(day));
  assert.ok(!getNamedEventPoolAvailableIds(state, OPHELIA_SCANDINAVIAN_POOL_ID).includes(day));
});

test("World Eater counts simultaneous Day of Peace removal and gives its physical card +3 per objective", () => {
  const state = setup("ophelia-world-eater");
  const day = getNamedEventPoolAvailableIds(state, OPHELIA_SCANDINAVIAN_POOL_ID)
    .find((id) => definitions[id]?.tags?.includes("lostbelt-effect:day-of-peace"));
  const domain = getNamedEventPoolAvailableIds(state, OPHELIA_SCANDINAVIAN_POOL_ID)
    .find((id) => definitions[id]?.tags?.includes("lostbelt-effect:surtrs-domain"));
  assert.ok(day && domain);
  releaseNamedEventToLocation(state, OPHELIA_SCANDINAVIAN_POOL_ID, day, "mountain", "up");
  releaseNamedEventToLocation(state, OPHELIA_SCANDINAVIAN_POOL_ID, domain, "mountain", "up");
  const worldEater = addAttack(state, "f", "world-eater", "master.ophelia.skill.ascension");

  const combatEvent = { locationId: "mountain", participantIds: ["f", "o"], winnerIds: ["f"], eventIds: [day, domain] };
  applyLostbeltObjectiveRuntimeEvent(state, "combat.resolved", combatEvent, definitions);
  const result = useOpheliaWorldEater({
    state, player: state.players.f, skill: skill("master.ophelia.skill.ascension"), definitions,
    payload: { eventType: "combat.resolved", event: combatEvent }, openDecision: () => undefined,
  });
  assert.equal(result.removed, 2);
  assert.equal(result.totalRemoved, 2);
  assert.ok(state.board.eventRemoved.includes(day));
  assert.ok(state.board.eventRemoved.includes(domain));
  assert.equal(calculateCombatCardPower(state, state.players.f, worldEater.instanceId, definitions, "mountain"), 10);
});
