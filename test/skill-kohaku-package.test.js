import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatPower, calculateTerrainAdvantage } from "../src/rules-core/combat-power.ts";
import { getFaceUpCardsPerRoundLimit, getStructuredDeploymentDestinations, getStructuredSituationManaGain } from "../src/rules-core/rule-modifiers.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { findBurnedWorkshopInstance, grantBurnedWorkshop } from "../src/rules-core/kohaku.ts";

const BURNED = "master.kohaku.skill.s3";
const MECH = "master.kohaku.skill.ascension";
const ONSLAUGHT = "card.card-kohaku-blast";

function setup(id = "kohaku") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "k", name: "Kohaku" }, { id: "o", name: "Opponent" }, { id: "w", name: "Workshop" }],
    seed: 9901,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "k";
  state.turnOrder = ["k", "o", "w"];
  state.players.k.masterId = "master.kohaku";
  state.players.k.mana = 10;
  state.players.o.mana = 10;
  state.players.w.mana = 10;
  state.players.k.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.w.locationId = "workshop";
  state.board.locations.mountain = ["k", "o"];
  state.board.locations.city = [];
  state.board.locations.workshop = ["w"];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state, passives, effects };
}

function command(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
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

test("Kohaku package: all four skills are FULL and Magical Onslaught has executable Arson", () => {
  const { built, definitions } = setup("kohaku-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.kohaku");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(BURNED).handlerId, "core.kohaku-burned-workshop");
  assert.equal(built.skills.get(MECH).handlerId, "core.kohaku-mech-hisui");
  assert.ok(definitions[ONSLAUGHT].cardAbilityIds.includes("kohaku.magical-onslaught-arson"));
});

test("Burned Workshop forbids Workshop deployment, halves situation mana, and caps ordinary face-up play at one", () => {
  const ctx = setup("kohaku-burned-continuous");
  grantBurnedWorkshop(ctx.state, "o", ctx.definitions);
  assert.deepEqual(getStructuredDeploymentDestinations(ctx.state, "o", ctx.definitions, ["workshop", "mountain", "city"]), ["mountain", "city"]);
  assert.equal(getStructuredSituationManaGain(ctx.state, "o", ctx.definitions, 6), 3);
  assert.equal(getFaceUpCardsPerRoundLimit(ctx.state, "o", ctx.definitions), 1);
});

test("Burned Workshop removes itself at round end when its controller was in Miyama after combat", () => {
  const ctx = setup("kohaku-burned-expire");
  const burnedId = grantBurnedWorkshop(ctx.state, "o", ctx.definitions);
  ctx.state.players.o.locationId = "mountain";
  emitPassive(ctx, "round.ending", { round: 4, previousLocations: { k: "city", o: "mountain", w: "workshop" } });
  assert.equal(ctx.state.cards[burnedId].zone, "removed");
  assert.equal(findBurnedWorkshopInstance(ctx.state, "o"), undefined);
});

test("Mech-Hisui explicitly plays two Magical Onslaughts even through Burned Workshop's one-face-up cap", () => {
  const ctx = setup("kohaku-mech-onslaught");
  createOwnedCardInstance(ctx.state, "k", { instanceId: "mech", definitionId: MECH, zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(ctx.state, "k", { instanceId: "burned", definitionId: BURNED, zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(ctx.state, "k", { instanceId: "onslaught-1", definitionId: ONSLAUGHT, zone: "hand", face: "down", active: false });
  createOwnedCardInstance(ctx.state, "k", { instanceId: "onslaught-2", definitionId: ONSLAUGHT, zone: "hand", face: "down", active: false });
  assert.equal(getFaceUpCardsPerRoundLimit(ctx.state, "k", ctx.definitions), 1);

  let result = ctx.engine.execute(ctx.state, command(ctx.state, "mech-open", CommandType.UseSkill, "k", { skillId: MECH, data: { abilityId: "mech-hisui-onslaught" } }));
  assert.equal(result.state.pendingDecision?.kind, "kohaku-mech-hisui-onslaught");
  assert.equal(result.state.pendingDecision?.max, 2);
  result = ctx.engine.execute(result.state, command(result.state, "mech-pick", CommandType.ResolveDecision, "k", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["onslaught-1", "onslaught-2"],
  }));
  for (const id of ["onslaught-1", "onslaught-2"]) {
    assert.equal(result.state.cards[id].zone, "attack");
    assert.equal(result.state.cards[id].active, true);
    assert.equal(result.state.cards[id].face, "up");
  }
  assert.equal(result.state.players.k.flags.faceUpCardsPlayedThisRound, 2);
});

test("Mech-Hisui combat penalizes only lower-terrain opponents and a win burns every player in Workshop", () => {
  const ctx = setup("kohaku-mech-combat");
  createOwnedCardInstance(ctx.state, "k", { instanceId: "mech", definitionId: MECH, zone: "master-skills", face: "up", active: false });
  ctx.state.players.k.flags.deploymentLocationId = "mountain";
  ctx.state.players.k.flags.deploymentBonusActive = true;
  ctx.state.players.k.flags.deploymentBonus = 3;
  ctx.state.players.o.flags.deploymentLocationId = "mountain";
  ctx.state.players.o.flags.deploymentBonusActive = true;
  ctx.state.players.o.flags.deploymentBonus = 1;
  ctx.state.board.outpostRecords.mountain = ["k", "o"];
  ctx.state.phase = "combat";
  ctx.state.step = "player-window";
  ctx.state.activePlayerId = "k";

  ctx.built.skills.execute(ctx.state, "k", MECH, { abilityId: "mech-hisui-combat" }, () => { throw new Error("UNEXPECTED_DECISION"); }, () => 0, ctx.definitions);
  assert.equal(calculateTerrainAdvantage(ctx.state, ctx.state.players.k, ctx.definitions, "mountain"), 3);
  assert.equal(ctx.state.players.o.flags.roundPowerBonus, -4);

  emitPassive(ctx, "combat.resolved", { locationId: "mountain", winnerIds: ["k"], defeatedPlayerIds: ["o"], powers: { k: 8, o: 1 } });
  assert.ok(findBurnedWorkshopInstance(ctx.state, "w"));
});

test("Magical Onslaught subtracts opponents' terrain on a battlefield and burns a non-Workshop opponent from scouting", () => {
  const ctx = setup("kohaku-onslaught-arson");
  createOwnedCardInstance(ctx.state, "k", { instanceId: "blast", definitionId: ONSLAUGHT, zone: "attack", face: "up", active: true });
  ctx.state.players.o.flags.deploymentLocationId = "mountain";
  ctx.state.players.o.flags.deploymentBonusActive = true;
  ctx.state.players.o.flags.deploymentBonus = 3;
  const before = calculateCombatPower(ctx.state, ctx.state.players.o, ctx.definitions, "mountain");
  assert.equal(before, 3);
  ctx.state.phase = "combat";
  ctx.state.step = "player-window";
  ctx.state.activePlayerId = "k";
  let result = ctx.engine.execute(ctx.state, command(ctx.state, "arson-battlefield", CommandType.UseCardAbility, "k", {
    instanceId: "blast",
    ability: "kohaku.magical-onslaught-arson",
  }));
  assert.equal(calculateCombatPower(result.state, result.state.players.o, ctx.definitions, "mountain"), 0);

  result.state.players.k.locationId = "scouting";
  result.state.players.o.locationId = "city";
  result.state.board.locations.mountain = [];
  result.state.board.locations.scouting = ["k"];
  result.state.board.locations.city = ["o"];
  result.state.activePlayerId = "k";
  result.state.round = 5;
  result = ctx.engine.execute(result.state, command(result.state, "arson-scouting", CommandType.UseCardAbility, "k", {
    instanceId: "blast",
    ability: "kohaku.magical-onslaught-arson",
    targetLocationId: "o",
  }));
  assert.ok(findBurnedWorkshopInstance(result.state, "o"));
});
