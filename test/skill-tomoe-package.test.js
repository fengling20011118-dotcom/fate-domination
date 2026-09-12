import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { deployPlayer } from "../src/rules-core/board.ts";

const DEMONIC_NATURE = "servant.tomoe.skill.sc-tomoe-2";

function setup(id = "tomoe") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "t", name: "Tomoe" }, { id: "o", name: "Opponent" }, { id: "x", name: "Third" }],
    seed: 9201,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "t";
  state.turnOrder = ["t", "o", "x"];
  state.players.t.servantId = "servant.tomoe";
  state.players.t.locationId = "city";
  state.players.o.locationId = "workshop";
  state.players.x.locationId = "mountain";
  state.board.locations.city = ["t"];
  state.board.locations.workshop = ["o"];
  state.board.locations.mountain = ["x"];
  state.players.t.victoryPoints = 4;
  state.players.o.victoryPoints = 6;
  return { built, definitions, engine, state };
}

function command(state, id, actorId, type, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function armInfernalFire() {
  const ctx = setup("tomoe-fire");
  const result = ctx.engine.execute(ctx.state, command(ctx.state, "use-fire", "t", CommandType.UseSkill, {
    skillId: DEMONIC_NATURE,
    data: { abilityId: "infernal-fire" },
  }));
  return { ...ctx, state: result.state };
}

test("Tomoe package: all three skills are FULL", () => {
  const { built } = setup("tomoe-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.tomoe");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  const demonic = built.skills.get(DEMONIC_NATURE);
  assert.equal(demonic.handlerId, "core.tomoe-demonic-nature");
  assert.deepEqual(demonic.abilities?.map((ability) => ability.id), ["infernal-fire", "double-advantage"]);
  assert.deepEqual(demonic.rules?.ambiguities ?? [], []);
  assert.deepEqual(demonic.rules?.unmodeledClauses ?? [], []);
});

test("Infernal Fire makes next-round opponents with zero payment skip both positive battlefield advantages", () => {
  const { state, definitions } = armInfernalFire();
  const rules = state.modeState.deploymentAdvantageBidRules;
  assert.ok(Array.isArray(rules));
  assert.deepEqual(rules[0], {
    sourceId: DEMONIC_NATURE,
    controllerPlayerId: "t",
    locationId: "city",
    round: 4,
    maxPayment: 5,
  });

  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "o";
  deployPlayer(state, "o", "city", definitions, { victoryPointsPayment: 0 });
  assert.equal(state.players.o.locationId, "city");
  assert.equal(state.players.o.flags.deploymentBonus, 0);
  assert.deepEqual(state.board.outpostRecords.city, [null, null]);
  assert.equal(state.players.o.victoryPoints, 6);
});

test("Infernal Fire payment unlocks only base advantages not higher than the paid victory points", () => {
  const one = armInfernalFire();
  one.state.round = 4;
  one.state.phase = "outpost";
  one.state.step = "player-window";
  one.state.activePlayerId = "o";
  deployPlayer(one.state, "o", "city", one.definitions, { victoryPointsPayment: 1 });
  assert.equal(one.state.players.o.flags.deploymentBonus, 1);
  assert.deepEqual(one.state.board.outpostRecords.city, [null, "o"]);
  assert.equal(one.state.players.o.victoryPoints, 5);

  const three = armInfernalFire();
  three.state.round = 4;
  three.state.phase = "outpost";
  three.state.step = "player-window";
  three.state.activePlayerId = "o";
  deployPlayer(three.state, "o", "city", three.definitions, { victoryPointsPayment: 3 });
  assert.equal(three.state.players.o.flags.deploymentBonus, 3);
  assert.deepEqual(three.state.board.outpostRecords.city, ["o", null]);
  assert.equal(three.state.players.o.victoryPoints, 3);
});

test("Infernal Fire rejects illegal payment without mutating deployment state", () => {
  const { state, definitions } = armInfernalFire();
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "o";
  const before = structuredClone(state);
  assert.throws(() => deployPlayer(state, "o", "city", definitions, { victoryPointsPayment: 6 }), /DEPLOYMENT_VICTORY_POINT_PAYMENT_INVALID/);
  assert.deepEqual(state, before);
});

test("Demonic Nature doubles Tomoe's current deployment advantage during combat", () => {
  const { engine, state } = setup("tomoe-double");
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "t";
  state.players.t.flags.deploymentBonusActive = true;
  state.players.t.flags.deploymentBonus = 3;
  const result = engine.execute(state, command(state, "double-advantage", "t", CommandType.UseSkill, {
    skillId: DEMONIC_NATURE,
    data: { abilityId: "double-advantage" },
  }));
  assert.equal(result.state.players.t.flags.deploymentBonus, 6);
});
