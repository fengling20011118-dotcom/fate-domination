import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const HOME_TURF = "master.darnic.skill.s1";
const SOUL_EATER = "master.darnic.skill.s1a";
const OLD_ACQUAINTANCES = "master.darnic.skill.ascension";

function setup(id = "darnic") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "d", name: "Darnic" }, { id: "o", name: "Opponent" }, { id: "x", name: "Other" }],
    seed: 9801,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "d";
  state.turnOrder = ["d", "o", "x"];
  state.players.d.masterId = "master.darnic";
  state.players.d.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.x.locationId = "city";
  state.board.locations.mountain = ["d", "o"];
  state.board.locations.city = ["x"];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  state.players.d.victoryPoints = 6;
  state.players.o.victoryPoints = 6;
  createOwnedCardInstance(state, "d", { instanceId: "home-turf", definitionId: HOME_TURF, zone: "master-skills", face: "down", active: false });
  createOwnedCardInstance(state, "d", { instanceId: "old-acquaintances", definitionId: OLD_ACQUAINTANCES, zone: "master-skills", face: "up", active: false });
  return { built, definitions, state, passives, effects };
}

let eventCounter = 0;
function emitPassive(ctx, type, payload = {}) {
  eventCounter += 1;
  enqueuePassiveEffects(ctx.state, ctx.passives, {
    eventId: `${ctx.state.gameInstanceId}:${type}:${eventCounter}`,
    sourceCommandId: "test",
    revision: ctx.state.revision,
    type,
    payload,
  });
  ctx.effects.drain(ctx.state, 1000, ctx.definitions);
}

function installHomeTurf(ctx) {
  emitPassive(ctx, "game.started", { round: ctx.state.round, phase: ctx.state.phase, activePlayerId: ctx.state.activePlayerId });
}

test("Darnic package: all three skills are FULL", () => {
  const { built } = setup("darnic-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.darnic");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(HOME_TURF).handlerId, "core.unoccupied-terrain-advantage");
  assert.equal(built.skills.get(SOUL_EATER).handlerId, "core.structured-skill");
  assert.equal(built.skills.get(OLD_ACQUAINTANCES).handlerId, "core.darnic-old-acquaintances");
});

test("Home Turf dynamically grants every unclaimed printed terrain space on Darnic's current battlefield", () => {
  const ctx = setup("darnic-home-turf");
  installHomeTurf(ctx);
  ctx.state.phase = "combat";
  ctx.state.step = "player-window";
  ctx.state.board.outpostRecords.mountain = [null, null];
  ctx.state.players.d.flags.deploymentBonusActive = false;
  assert.equal(calculateCombatPower(ctx.state, ctx.state.players.d, ctx.definitions, "mountain"), 4);

  ctx.state.board.outpostRecords.mountain = ["o", null];
  assert.equal(calculateCombatPower(ctx.state, ctx.state.players.d, ctx.definitions, "mountain"), 1);

  ctx.state.board.outpostRecords.mountain = ["o", "d"];
  ctx.state.players.d.flags.deploymentLocationId = "mountain";
  ctx.state.players.d.flags.deploymentBonusActive = true;
  ctx.state.players.d.flags.deploymentBonus = 1;
  assert.equal(calculateCombatPower(ctx.state, ctx.state.players.d, ctx.definitions, "mountain"), 1);
});

test("Scorched Earth automatically charges 2 VP at the start of an opponent's action turn to keep a terrain space", () => {
  const ctx = setup("darnic-scorched-pay");
  installHomeTurf(ctx);
  ctx.state.phase = "action";
  ctx.state.step = "move-decision";
  ctx.state.activePlayerId = "o";
  ctx.state.board.outpostRecords.mountain = ["o", null];
  ctx.state.players.o.flags.deploymentLocationId = "mountain";
  ctx.state.players.o.flags.deploymentBonusActive = true;
  ctx.state.players.o.flags.deploymentBonus = 3;
  ctx.state.players.o.victoryPoints = 5;

  emitPassive(ctx, "phase.transitioned", { transition: "next-player", previousPhase: "action" });
  assert.equal(ctx.state.players.o.victoryPoints, 3);
  assert.equal(ctx.state.board.outpostRecords.mountain[0], "o");
  assert.equal(ctx.state.players.o.flags.deploymentBonusActive, true);
});

test("Scorched Earth releases the terrain space when the opponent cannot pay, immediately exposing it to Home Turf", () => {
  const ctx = setup("darnic-scorched-release");
  installHomeTurf(ctx);
  ctx.state.phase = "action";
  ctx.state.step = "move-decision";
  ctx.state.activePlayerId = "o";
  ctx.state.board.outpostRecords.mountain = ["o", null];
  ctx.state.players.o.flags.deploymentLocationId = "mountain";
  ctx.state.players.o.flags.deploymentBonusActive = true;
  ctx.state.players.o.flags.deploymentBonus = 3;
  ctx.state.players.o.victoryPoints = 1;

  emitPassive(ctx, "phase.transitioned", { transition: "next-player", previousPhase: "action" });
  assert.equal(ctx.state.players.o.victoryPoints, 1);
  assert.deepEqual(ctx.state.board.outpostRecords.mountain, [null, null]);
  assert.equal(ctx.state.players.o.flags.deploymentBonusActive, false);
  ctx.state.phase = "combat";
  assert.equal(calculateCombatPower(ctx.state, ctx.state.players.d, ctx.definitions, "mountain"), 4);
});

test("Air Support doubles Darnic's full terrain advantage including Home Turf and expires with the round", () => {
  const ctx = setup("darnic-air-support");
  installHomeTurf(ctx);
  ctx.state.board.outpostRecords.mountain = ["d", null];
  ctx.state.players.d.flags.deploymentLocationId = "mountain";
  ctx.state.players.d.flags.deploymentBonusActive = true;
  ctx.state.players.d.flags.deploymentBonus = 3;
  ctx.state.phase = "action";
  ctx.state.step = "player-window";
  ctx.state.activePlayerId = "d";

  ctx.built.skills.execute(
    ctx.state,
    "d",
    OLD_ACQUAINTANCES,
    { abilityId: "air-support" },
    () => { throw new Error("UNEXPECTED_DECISION"); },
    () => 0,
    ctx.definitions,
  );
  ctx.state.phase = "combat";
  assert.equal(calculateCombatPower(ctx.state, ctx.state.players.d, ctx.definitions, "mountain"), 8);
  ctx.state.round += 1;
  assert.equal(calculateCombatPower(ctx.state, ctx.state.players.d, ctx.definitions, "mountain"), 4);
});
