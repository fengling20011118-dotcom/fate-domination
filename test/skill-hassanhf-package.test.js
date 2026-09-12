import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";

const FACES = "servant.hassanhf.skill.sc-hassanhf-1";
const ILLUSION = "servant.hassanhf.skill.sc-hassanhf-2";
const CONCEAL = "servant.hassanhf.skill.sc-hassanhf-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "hassanhf-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "h", name: "Hundred Faces" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    seed: 8201,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "h";
  state.turnOrder = ["h", "a", "b"];
  state.players.h.servantId = "servant.hassanhf";
  for (const player of Object.values(state.players)) player.mana = 20;
  state.players.h.locationId = "mountain";
  state.players.a.locationId = "mountain";
  state.players.b.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["h", "a", "b"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function addActive(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "h", { instanceId, definitionId, zone: "attack", face: "up", active: true });
}

function resolve(engine, state, actorId, selections, id) {
  return engine.execute(state, command(state, id, CommandType.ResolveDecision, actorId, {
    decisionId: state.pendingDecision.decisionId,
    selections,
  }));
}

let eventCounter = 0;
function emitPassive(engine, state, definitions, type, payload) {
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${++eventCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Hundred-Faced Hassan package is 3/3 FULL", () => {
  const { built } = setup("hassanhf-full");
  const skills = [FACES, ILLUSION, CONCEAL].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[0].handlerId, "core.hundred-faced-hassan-tracking");
  assert.equal(skills[1].handlerId, "core.hundred-faced-hassan-illusion");
  assert.equal(skills[2].handlerId, "core.presence-concealment");
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("Hundred Faces tracks all co-located opponents and charges round-end VP for skill cards used while tracked", () => {
  const { definitions, engine, state } = setup("hassanhf-track-upkeep");
  addActive(state, "faces", FACES);
  state.players.a.victoryPoints = 8;
  state.players.b.victoryPoints = 8;

  let result = engine.execute(state, command(state, "track", CommandType.UseSkill, "h", {
    skillId: FACES,
    data: { abilityId: "track-location" },
  }));
  for (const id of ["a", "b"]) {
    assert.equal(result.state.players[id].flags["hundredFacesTrackedBy:h"], true);
    assert.ok(result.state.players[id].statuses.includes("跟踪"));
  }

  emitPassive(engine, result.state, definitions, "card.played", {
    playerId: "a", instanceId: "dummy-skill-1", definitionId: "servant.jeanne.skill.sc-jeanne-1", face: "up",
  });
  emitPassive(engine, result.state, definitions, "card.played", {
    playerId: "a", instanceId: "dummy-skill-2", definitionId: "servant.jeanne.skill.sc-jeanne-2", face: "up",
  });
  emitPassive(engine, result.state, definitions, "card.played", {
    playerId: "a", instanceId: "dummy-basic", definitionId: "card.cardq2", face: "up",
  });
  emitPassive(engine, result.state, definitions, "round.ending", { round: 4 });
  assert.equal(result.state.players.a.victoryPoints, 5); // base 1 + two skill cards
  assert.equal(result.state.players.b.victoryPoints, 7); // base 1 only
  assert.equal(result.state.players.a.flags["hundredFacesSkillPlays:h:4"], undefined);
});

test("Hundred Faces wins +2 once when beating tracked opponents, then combat end clears only this Hassan's tracking at that battlefield", () => {
  const { definitions, engine, state } = setup("hassanhf-combat-reward");
  addActive(state, "faces", FACES);
  state.players.a.flags["hundredFacesTrackedBy:h"] = true;
  state.players.a.flags["hundredFacesTrackedBy:other"] = true;
  state.players.a.statuses.push("跟踪");
  state.players.b.flags["hundredFacesTrackedBy:h"] = true;
  state.players.b.statuses.push("跟踪");
  state.players.h.victoryPoints = 1;

  emitPassive(engine, state, definitions, "combat.resolved", {
    locationId: "mountain", powers: { h: 10, a: 5, b: 4 }, winnerIds: ["h"], defeatedPlayerIds: ["a", "b"],
  });
  assert.equal(state.players.h.victoryPoints, 3);

  emitPassive(engine, state, definitions, "combat.ending", {
    round: 4,
    previousLocations: { h: "mountain", a: "mountain", b: "mountain" },
    combatWinnerIdsByLocation: { mountain: ["h"], city: [] },
  });
  assert.equal(state.players.a.flags["hundredFacesTrackedBy:h"], undefined);
  assert.equal(state.players.a.flags["hundredFacesTrackedBy:other"], true);
  assert.ok(state.players.a.statuses.includes("跟踪"));
  assert.equal(state.players.b.flags["hundredFacesTrackedBy:h"], undefined);
  assert.equal(state.players.b.statuses.includes("跟踪"), false);
});

test("Delusional Illusion draws up to two physical cards and joins them face-down without card.played", () => {
  const { engine, state } = setup("hassanhf-illusion-draw");
  addActive(state, "illusion", ILLUSION);
  createOwnedCardInstance(state, "h", { instanceId: "deck-a", definitionId: "card.cardq2", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "h", { instanceId: "deck-b", definitionId: "card.cardb1", zone: "deck", face: "down", active: false });

  const result = engine.execute(state, command(state, "illusion-draw", CommandType.UseSkill, "h", {
    skillId: ILLUSION,
    data: { abilityId: "illusion-draw-hidden" },
  }));
  for (const id of ["deck-a", "deck-b"]) {
    assert.equal(result.state.cards[id].zone, "attack");
    assert.equal(result.state.cards[id].face, "down");
    assert.equal(result.state.cards[id].active, false);
    assert.equal(result.state.cards[id].paidCost, 0);
  }
  assert.equal(result.events.some((event) => event.type === "card.played" && ["deck-a", "deck-b"].includes(event.payload?.instanceId)), false);
});

test("Delusional Illusion activates exactly two hidden attacks, atomically pays their costs, and their action ability really works in combat", () => {
  const { engine, state } = setup("hassanhf-illusion-activate");
  addActive(state, "illusion", ILLUSION);
  createOwnedCardInstance(state, "h", { instanceId: "surveil", definitionId: "card.cardsurveil", zone: "attack", face: "down", active: false });
  createOwnedCardInstance(state, "h", { instanceId: "basic", definitionId: "card.cardb1", zone: "attack", face: "down", active: false });
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "h";
  state.players.h.mana = 3;
  state.board.locations.city = [];

  let result = engine.execute(state, command(state, "illusion-combat", CommandType.UseSkill, "h", {
    skillId: ILLUSION,
    data: { abilityId: "illusion-combat" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "hundred-faced-hassan-illusion-mode");
  result = resolve(engine, result.state, "h", ["activate-two"], "illusion-mode-activate");
  assert.equal(result.state.pendingDecision?.kind, "hundred-faced-hassan-hidden-attacks");
  result = resolve(engine, result.state, "h", ["surveil", "basic"], "illusion-hidden-two");
  assert.equal(result.state.players.h.mana, 2);
  assert.equal(result.state.cards.surveil.active, true);
  assert.equal(result.state.cards.basic.active, true);
  assert.ok(result.state.players.h.cardRuleModifiers?.some((modifier) => modifier.targetInstanceIds?.includes("surveil") && modifier.allowActionAbilityInCombat === true));

  result = engine.execute(result.state, command(result.state, "surveil-combat-action", CommandType.UseCardAbility, "h", {
    instanceId: "surveil",
    ability: "basic.quick-march",
    targetLocationId: "city",
  }));
  assert.equal(result.state.players.h.locationId, "city");
});

test("Delusional Illusion scouting branch performs a legal effect move and gains 2 mana", () => {
  const { engine, state } = setup("hassanhf-illusion-scout");
  addActive(state, "illusion", ILLUSION);
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "h";
  state.players.h.mana = 4;

  let result = engine.execute(state, command(state, "illusion-scout", CommandType.UseSkill, "h", {
    skillId: ILLUSION,
    data: { abilityId: "illusion-combat" },
  }));
  assert.ok(result.state.pendingDecision?.options.some((option) => option.id === "scouting"));
  result = resolve(engine, result.state, "h", ["scouting"], "illusion-scout-choice");
  assert.equal(result.state.players.h.locationId, "scouting");
  assert.equal(result.state.players.h.mana, 6);
  assert.ok(result.events.some((event) => event.type === "player.moved" && event.payload?.sourceId === ILLUSION));
});
