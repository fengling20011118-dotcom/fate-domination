import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { isBlondServant, isSaberServant } from "../src/rules-core/servant-traits.ts";

const ANTI_SABER = "servant.mhx.skill.sc-mhx-1";

function setup(targetServantId, targetVictoryPoints = 10, id = "mhx") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "mhx", name: "MHX" }, { id: "target", name: "Target" }],
    seed: 9501,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "mhx";
  state.turnOrder = ["mhx", "target"];
  state.players.mhx.servantId = "servant.mhx";
  state.players.mhx.mana = 10;
  state.players.mhx.locationId = "city";
  state.players.target.servantId = targetServantId;
  state.players.target.victoryPoints = targetVictoryPoints;
  state.players.target.locationId = "city";
  state.board.locations.city = ["mhx", "target"];
  state.board.locations.mountain = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  createOwnedCardInstance(state, "mhx", {
    instanceId: "anti-saber",
    definitionId: ANTI_SABER,
    zone: "attack",
    face: "up",
    active: true,
  });
  return { built, engine, state };
}

function useAntiSaber(engine, state, id = "use-anti-saber") {
  return engine.execute(state, {
    commandId: id,
    gameInstanceId: state.gameInstanceId,
    actorId: "mhx",
    expectedRevision: state.revision,
    type: CommandType.UseSkill,
    payload: {
      skillId: ANTI_SABER,
      data: { abilityId: "saber-must-die", targetPlayerId: "target" },
    },
  }).state;
}

test("MHX package: all three official skills are FULL", () => {
  const { built } = setup("servant.emiya", 10, "mhx-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.mhx");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  const anti = built.skills.get(ANTI_SABER);
  assert.equal(anti.handlerId, "core.mhx-anti-saber-weapon");
  assert.equal(anti.limit, "once-per-game");
  assert.deepEqual(anti.abilities?.map((ability) => ability.id), ["saber-must-die"]);
});

test("MHX anti-Saber weapon steals 2 VP from a non-blond non-Saber servant after defeating them", () => {
  const { engine, state } = setup("servant.emiya", 10, "mhx-base");
  assert.equal(isBlondServant("servant.emiya"), false);
  assert.equal(isSaberServant("servant.emiya"), false);
  const resolved = useAntiSaber(engine, state);
  assert.equal(resolved.players.target.defeated, true);
  assert.equal(resolved.players.target.victoryPoints, 8);
  assert.equal(resolved.players.mhx.victoryPoints, 2);
});

test("MHX anti-Saber weapon steals 4 VP when exactly one of blond or Saber matches", () => {
  const blondOnly = setup("servant.jeanne", 10, "mhx-blond-only");
  assert.equal(isBlondServant("servant.jeanne"), true);
  assert.equal(isSaberServant("servant.jeanne"), false);
  const blondResolved = useAntiSaber(blondOnly.engine, blondOnly.state, "use-blond-only");
  assert.equal(blondResolved.players.target.victoryPoints, 6);
  assert.equal(blondResolved.players.mhx.victoryPoints, 4);

  const saberOnly = setup("servant.siegfried", 10, "mhx-saber-only");
  assert.equal(isBlondServant("servant.siegfried"), false);
  assert.equal(isSaberServant("servant.siegfried"), true);
  const saberResolved = useAntiSaber(saberOnly.engine, saberOnly.state, "use-saber-only");
  assert.equal(saberResolved.players.target.victoryPoints, 6);
  assert.equal(saberResolved.players.mhx.victoryPoints, 4);
});

test("MHX anti-Saber weapon steals 6 VP when target is both blond and Saber, capped by target VP", () => {
  const { engine, state } = setup("servant.saber", 5, "mhx-both");
  assert.equal(isBlondServant("servant.saber"), true);
  assert.equal(isSaberServant("servant.saber"), true);
  const resolved = useAntiSaber(engine, state);
  assert.equal(resolved.players.target.defeated, true);
  assert.equal(resolved.players.target.victoryPoints, 0);
  assert.equal(resolved.players.mhx.victoryPoints, 5);
});

test("Alter Ego variants are not treated as Saber by class metadata", () => {
  assert.equal(isSaberServant("servant.okita-alt"), false);
  assert.equal(isSaberServant("servant.muramasa"), false);
});
