import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  CAREN_ASCENSION_HANDLER,
  CAREN_ASCENSION_ID,
  CAREN_EXECUTOR_ID,
  CAREN_GAIN_SHROUD_HANDLER,
  CAREN_MASOCHISM_HANDLER,
  CAREN_MASOCHISM_ID,
  CAREN_SHROUD_HANDLER,
  CAREN_SHROUD_ID,
  CAREN_SPIRIT_MEDIUM_HANDLER,
  CAREN_SPIRIT_MEDIUM_ID,
  useCarenGainShroud,
  useCarenShroud,
  useCarenSpiritMedium,
  useCarenSpiritualMasochism,
  useCarenValentinus,
} from "../src/rules-core/caren.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function skill(id) {
  return built.skills.get(id);
}

function setup(id = "caren") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "c", name: "Caren" }, { id: "o", name: "Opponent" }, { id: "x", name: "Remote" }],
    seed: 940,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "c";
  state.turnOrder = ["c", "o", "x"];
  state.players.c.masterId = "master.caren";
  state.players.c.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.x.locationId = "city";
  state.players.c.mana = 10;
  state.players.o.mana = 10;
  state.players.x.mana = 10;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["c", "o"];
  state.board.locations.city = ["x"];
  state.board.locations.scouting = [];
  return state;
}

function addSkill(state, definitionId, instanceId = `c:${definitionId}`) {
  return createOwnedCardInstance(state, "c", {
    instanceId,
    definitionId,
    zone: "master-skills",
    face: "up",
    active: false,
  });
}

test("Caren package is 5/5 FULL with dedicated structured handlers", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.caren");
  assert.equal(skills.length, 5);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.equal(skill(CAREN_SPIRIT_MEDIUM_ID).handlerId, CAREN_SPIRIT_MEDIUM_HANDLER);
  assert.equal(skill(CAREN_EXECUTOR_ID).handlerId, CAREN_GAIN_SHROUD_HANDLER);
  assert.equal(skill(CAREN_MASOCHISM_ID).handlerId, CAREN_MASOCHISM_HANDLER);
  assert.equal(skill(CAREN_SHROUD_ID).handlerId, CAREN_SHROUD_HANDLER);
  assert.equal(skill(CAREN_ASCENSION_ID).handlerId, CAREN_ASCENSION_HANDLER);
  assert.equal(skill(CAREN_MASOCHISM_ID).initiallyOwned, false);
  assert.equal(skill(CAREN_SHROUD_ID).initiallyOwned, false);
  assert.equal(skill(CAREN_ASCENSION_ID).initiallyOwned, false);
  for (const candidate of skills) {
    assert.deepEqual(candidate.rules?.ambiguities ?? [], []);
    assert.deepEqual(candidate.rules?.unmodeledClauses ?? [], []);
  }
});

test("Spirit Medium grants Spiritual Masochism at game start and permanently removes it on first fall to 1 mana", () => {
  const state = setup("caren-medium");
  useCarenSpiritMedium({
    state, player: state.players.c, skill: skill(CAREN_SPIRIT_MEDIUM_ID), definitions,
    payload: { eventType: "game.started", event: {} }, openDecision() {},
  });
  const instanceId = state.players.c.masterSkills.find((id) => state.cards[id]?.definitionId === CAREN_MASOCHISM_ID);
  assert.ok(instanceId);
  state.players.c.mana = 1;
  useCarenSpiritMedium({
    state, player: state.players.c, skill: skill(CAREN_SPIRIT_MEDIUM_ID), definitions,
    payload: { eventType: "player.mana.changed", event: { playerId: "c", before: 2, after: 1, delta: -1 } }, openDecision() {},
  });
  assert.equal(state.cards[instanceId].zone, "removed");
  assert.equal(state.players.c.flags.carenSpiritMediumLost, true);
});

test("Spiritual Masochism halves eligible same-location VP gain and converts only actual mana loss to VP", () => {
  const state = setup("caren-masochism");
  state.players.o.victoryPoints = 10;
  state.players.c.mana = 2;
  state.players.c.victoryPoints = 0;
  useCarenSpiritualMasochism({
    state, player: state.players.c, skill: skill(CAREN_MASOCHISM_ID), definitions,
    payload: {
      eventType: "player.victory-points.changed",
      event: { playerId: "o", before: 5, after: 10, delta: 5, sourceId: "servant.kiyohime.skill.sc-kiyohime-2" },
    }, openDecision() {},
  });
  assert.equal(state.players.o.victoryPoints, 7);
  assert.equal(state.players.c.mana, 0);
  assert.equal(state.players.c.victoryPoints, 2);

  state.players.o.victoryPoints = 9;
  state.players.c.mana = 4;
  useCarenSpiritualMasochism({
    state, player: state.players.c, skill: skill(CAREN_MASOCHISM_ID), definitions,
    payload: {
      eventType: "player.victory-points.changed",
      event: { playerId: "o", before: 7, after: 9, delta: 2, sourceId: CAREN_SPIRIT_MEDIUM_ID },
    }, openDecision() {},
  });
  assert.equal(state.players.o.victoryPoints, 9);
  assert.equal(state.players.c.mana, 4);
});

test("Shroud of Magdalene applies chosen movement/power bind and removes itself when that opponent loses", () => {
  const state = setup("caren-shroud");
  const shroud = addSkill(state, CAREN_SHROUD_ID, "c:shroud");
  useCarenShroud({
    state, player: state.players.c, skill: skill(CAREN_SHROUD_ID), definitions,
    payload: { abilityId: "bind-opponent", targetPlayerId: "o", penalty: 4 }, openDecision() {},
  });
  assert.equal(state.players.o.flags.regularMovementBlockedRound, state.round);
  const modifier = state.activeRuleModifiers.find((candidate) => candidate.sourceId === CAREN_SHROUD_ID && candidate.rule === "combat_power");
  assert.ok(modifier);
  assert.equal(modifier.value, -4);
  assert.deepEqual(modifier.scope?.playerIds, ["o"]);

  state.phase = "combat";
  useCarenShroud({
    state, player: state.players.c, skill: skill(CAREN_SHROUD_ID), definitions,
    payload: { eventType: "combat.resolved", event: { locationId: "mountain", winnerIds: ["c"], powers: { c: 12, o: 8 } } }, openDecision() {},
  });
  assert.equal(state.cards[shroud.instanceId].zone, "removed");
});

test("Executor and Valentinus return a removed Magdalene, and Mark of Eros rewards opposing fight winners", () => {
  const state = setup("caren-valentinus");
  const shroud = addSkill(state, CAREN_SHROUD_ID, "c:shroud-return");
  movePlayerCard(state, "c", shroud.instanceId, "removed");

  useCarenGainShroud({
    state, player: state.players.c, skill: skill(CAREN_EXECUTOR_ID), definitions,
    payload: { eventType: "servant.true-name-revealed", event: { playerId: "c" } }, openDecision() {},
  });
  assert.equal(state.cards[shroud.instanceId].zone, "master-skills");
  movePlayerCard(state, "c", shroud.instanceId, "removed");

  useCarenValentinus({
    state, player: state.players.c, skill: skill(CAREN_ASCENSION_ID), definitions,
    payload: { eventType: "skill.unlocked", event: { playerId: "c", skillId: CAREN_ASCENSION_ID } }, openDecision() {},
  });
  assert.equal(state.cards[shroud.instanceId].zone, "master-skills");

  state.players.o.victoryPoints = 1;
  state.players.x.victoryPoints = 2;
  useCarenValentinus({
    state, player: state.players.c, skill: skill(CAREN_ASCENSION_ID), definitions,
    payload: { eventType: "combat.resolved", event: { winnerIds: ["o", "x"], powers: { o: 10, x: 10 } } }, openDecision() {},
  });
  assert.equal(state.players.o.victoryPoints, 4);
  assert.equal(state.players.x.victoryPoints, 5);
});
