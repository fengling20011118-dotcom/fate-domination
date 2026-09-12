import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";

const JUDGMENT = "servant.sanson.skill.sc-sanson-1";
const HOPE = "servant.sanson.skill.sc-sanson-2";
const REGICIDE = "servant.sanson.skill.sc-sanson-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "sanson-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "s", name: "Sanson" }, { id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
    seed: 8101,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "a", "b", "c"];
  state.players.s.servantId = "servant.sanson";
  for (const player of Object.values(state.players)) player.mana = 20;
  return { built, definitions, engine, state };
}

function resolve(engine, state, actorId, selections, id) {
  return engine.execute(state, command(state, id, CommandType.ResolveDecision, actorId, {
    decisionId: state.pendingDecision.decisionId,
    selections,
  }));
}

function vote(engine, state, ballots, prefix) {
  let result = engine.execute(state, command(state, `${prefix}-use`, CommandType.UseSkill, "s", {
    skillId: JUDGMENT,
    data: { abilityId: "judgment-day" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "sanson-judgment-day-vote");
  for (const voterId of ["s", "a", "b", "c"]) {
    result = resolve(engine, result.state, voterId, [ballots[voterId]], `${prefix}-${voterId}`);
  }
  assert.equal(result.state.pendingDecision, null);
  return result;
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload) {
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${++passiveCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Sanson package is 3/3 FULL with dedicated handlers for Judgment Day and Hope", () => {
  const { built } = setup("sanson-full");
  const skills = [JUDGMENT, HOPE, REGICIDE].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[0].handlerId, "core.sanson-judgment-day");
  assert.equal(skills[1].handlerId, "core.sanson-death-hope");
  assert.equal(skills[2].handlerId, "core.high-victory-combat-power");
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("Judgment Day unique highest vote creates a persistent source-specific Accused status until the next use", () => {
  const { engine, state } = setup("sanson-unique");
  let result = vote(engine, state, { s: "a", a: "a", b: "abstain", c: "b" }, "unique");
  assert.equal(result.state.players.a.flags["sansonAccusedBy:s"], "persistent");
  assert.ok(result.state.players.a.statuses.includes("控诉"));
  assert.equal(result.state.players.b.flags["sansonAccusedBy:s"], undefined);

  result.state.round = 5;
  result.state.phase = "outpost";
  result.state.step = "player-window";
  result.state.activePlayerId = "s";
  result = engine.execute(result.state, command(result.state, "second-use", CommandType.UseSkill, "s", {
    skillId: JUDGMENT,
    data: { abilityId: "judgment-day" },
  }));
  assert.equal(result.state.players.a.flags["sansonAccusedBy:s"], undefined);
  assert.equal(result.state.players.a.statuses.includes("控诉"), false);
});

test("Judgment Day tied vote accuses every non-abstaining opponent only through round end", () => {
  const { definitions, engine, state } = setup("sanson-tie");
  const result = vote(engine, state, { s: "a", a: "b", b: "a", c: "b" }, "tie");
  for (const id of ["a", "b", "c"]) {
    assert.equal(result.state.players[id].flags["sansonAccusedBy:s"], "round:4");
    assert.ok(result.state.players[id].statuses.includes("控诉"));
  }
  assert.equal(result.state.players.s.flags["sansonAccusedBy:s"], undefined);

  emitPassive(engine, result.state, definitions, "round.ending", { round: 4 });
  for (const id of ["a", "b", "c"]) {
    assert.equal(result.state.players[id].flags["sansonAccusedBy:s"], undefined);
    assert.equal(result.state.players[id].statuses.includes("控诉"), false);
  }
});

function prepareHope(state) {
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.players.s.locationId = "mountain";
  state.players.a.locationId = "mountain";
  state.players.b.locationId = "city";
  state.players.c.locationId = "city";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["s", "a"];
  state.board.locations.city = ["b", "c"];
  state.board.locations.scouting = [];
  state.players.a.flags["sansonAccusedBy:s"] = "persistent";
  state.players.a.statuses.push("控诉");
  createOwnedCardInstance(state, "s", { instanceId: "hope", definitionId: HOPE, zone: "attack", face: "up", active: true });
}

test("Hope defeats an accused combat opponent, removes only Sanson's accusation, and awards 4 VP", () => {
  const { engine, state } = setup("sanson-hope");
  prepareHope(state);
  state.players.a.flags["sansonAccusedBy:other"] = "persistent";
  state.players.s.victoryPoints = 2;

  let result = engine.execute(state, command(state, "hope-use", CommandType.UseSkill, "s", {
    skillId: HOPE,
    data: { abilityId: "execute-accused" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "sanson-death-hope-target");
  result = resolve(engine, result.state, "s", ["a"], "hope-target");
  assert.equal(result.state.players.a.defeated, true);
  assert.equal(result.state.players.a.flags["sansonAccusedBy:s"], undefined);
  assert.equal(result.state.players.a.flags["sansonAccusedBy:other"], "persistent");
  assert.ok(result.state.players.a.statuses.includes("控诉"));
  assert.equal(result.state.players.s.victoryPoints, 6);
});

test("Hope still awards 4 VP when its own defeat fails but the chosen target is defeated later in the same combat phase", () => {
  const { definitions, engine, state } = setup("sanson-hope-later");
  prepareHope(state);
  state.players.s.mana = 0;
  state.players.s.victoryPoints = 1;
  state.activeRuleModifiers.push({
    id: "test-defeat-tax", sourceId: "test", controllerPlayerId: "a", operation: "add", rule: "defeat_cost",
    scope: { subject: "controller" }, value: 3, duration: "round", createdRound: state.round,
  });

  let result = engine.execute(state, command(state, "hope-later-use", CommandType.UseSkill, "s", {
    skillId: HOPE,
    data: { abilityId: "execute-accused" },
  }));
  result = resolve(engine, result.state, "s", ["a"], "hope-later-target");
  assert.equal(result.state.players.a.defeated, false);
  assert.equal(result.state.players.s.victoryPoints, 1);
  assert.equal(result.state.players.s.flags.sansonHopeTargetPlayerId, "a");

  result.state.players.a.defeated = true;
  emitPassive(engine, result.state, definitions, "player.defeated", { playerId: "a", reason: "combat" });
  assert.equal(result.state.players.s.victoryPoints, 5);
  assert.equal(result.state.players.s.flags.sansonHopeTargetPlayerId, undefined);
});
