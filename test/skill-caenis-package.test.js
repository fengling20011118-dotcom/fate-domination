import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { movePlayer } from "../src/rules-core/board.ts";
import { calculateCombatCardPower, calculateCombatPower, calculateTerrainAdvantage } from "../src/rules-core/combat-power.ts";
import { cardPlayForbiddenByModifier } from "../src/rules-core/card-rule-modifiers.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { useCaenisPoseidonFavor } from "../src/rules-core/caenis.ts";

const FAVOR = "servant.caenis.skill.sc-caenis-1";
const WINGS = "servant.caenis.skill.sc-caenis-2";
const MAELSTROM = "servant.caenis.skill.sc-caenis-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "caenis") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "c", name: "Caenis" }, { id: "o", name: "Opponent" }, { id: "x", name: "Other" }],
    seed: 2610,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "c";
  state.turnOrder = ["c", "o", "x"];
  state.players.c.servantId = "servant.caenis";
  for (const player of Object.values(state.players)) {
    player.mana = 20;
    player.commandSeals = 3;
  }
  state.players.c.locationId = "mountain";
  state.players.o.locationId = "city";
  state.players.x.locationId = "workshop";
  state.board.locations.mountain = ["c"];
  state.board.locations.city = ["o"];
  state.board.locations.workshop = ["x"];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function addSkill(state, instanceId, definitionId, zone = "attack") {
  createOwnedCardInstance(state, "c", {
    instanceId,
    definitionId,
    zone,
    face: zone === "attack" ? "up" : "down",
    active: zone === "attack",
  });
}

function resolve(engine, state, id, actorId, selections) {
  return engine.execute(state, command(state, id, CommandType.ResolveDecision, actorId, {
    decisionId: state.pendingDecision.decisionId,
    selections,
  }));
}

test("Caenis package is 3/3 FULL with Permanent Favor and authored movement-immunity tag", () => {
  const { built } = setup("caenis-full");
  const skills = [FAVOR, WINGS, MAELSTROM].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(skills[0].cardResidual, true);
  assert.equal(skills[0].tags.includes("skill-zone-movement-restriction-immunity"), true);
});

test("Poseidon's Favor in the skill zone ignores card-effect movement restrictions, but active Favor does not", () => {
  const { definitions, state } = setup("caenis-move-immunity");
  addSkill(state, "favor", FAVOR, "servant-skills");
  state.step = "move-decision";
  state.players.c.flags.movementBlockedPermanent = true;
  const cost = movePlayer(state, "c", "city", false, definitions);
  assert.ok(cost >= 0);
  assert.equal(state.players.c.locationId, "city");

  state.players.c.servantSkills = state.players.c.servantSkills.filter((id) => id !== "favor");
  state.players.c.attack.push("favor");
  state.cards.favor.zone = "attack";
  state.cards.favor.face = "up";
  state.cards.favor.active = true;
  state.step = "move-decision";
  assert.throws(() => movePlayer(state, "c", "mountain", false, definitions), /PLAYER_MOVEMENT_BLOCKED/);
});

test("Poseidon's Favor Outpost ability deactivates the Permanent card, gains 3 mana, and forbids replay this round", () => {
  const { engine, state } = setup("caenis-favor-close");
  addSkill(state, "favor", FAVOR);
  state.phase = "outpost";
  state.step = "player-window";
  state.players.c.mana = 5;
  const result = engine.execute(state, command(state, "favor-close", CommandType.UseSkill, "c", {
    skillId: FAVOR,
    data: { abilityId: "deactivate-favor" },
  }));
  assert.equal(result.state.players.c.mana, 8);
  assert.equal(result.state.cards.favor.zone, "servant-skills");
  assert.equal(result.state.cards.favor.active, false);
  assert.equal(cardPlayForbiddenByModifier(result.state, result.state.players.c, result.state.cards.favor), true);
  assert.equal(result.state.players.c.flags.servantGenderRule, undefined);
});

test("Great Golden Wings Take Flight moves anywhere as Caenis and gives Poseidon's Maelstrom +9 for the round", () => {
  const { engine, definitions, state } = setup("caenis-flight");
  addSkill(state, "favor", FAVOR, "servant-skills");
  addSkill(state, "wings", WINGS);
  addSkill(state, "maelstrom", MAELSTROM);
  state.players.c.flags.movementBlockedRound = state.round;
  const before = calculateCombatCardPower(state, state.players.c, "maelstrom", definitions, "mountain");

  let result = engine.execute(state, command(state, "flight", CommandType.UseSkill, "c", {
    skillId: WINGS,
    data: { abilityId: "take-flight" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "caenis-take-flight");
  assert.equal(result.state.pendingDecision.options.some((option) => option.id === "city"), true);
  result = resolve(engine, result.state, "flight-city", "c", ["city"]);
  assert.equal(result.state.players.c.locationId, "city");
  assert.equal(calculateCombatCardPower(result.state, result.state.players.c, "maelstrom", definitions, "city"), before + 9);
});

test("Great Golden Wings Crash Dive triggers on play while Favor is active: +5 total power and zero terrain advantage", () => {
  const { engine, definitions, state } = setup("caenis-crash-dive");
  addSkill(state, "favor", FAVOR);
  useCaenisPoseidonFavor({
    state,
    player: state.players.c,
    skill: engine.content.skills.get(FAVOR),
    payload: { eventType: "card.played", event: { playerId: "c", instanceId: "favor", definitionId: FAVOR, face: "up" } },
    openDecision() {},
    definitions,
  });
  addSkill(state, "wings", WINGS, "servant-skills");
  createOwnedCardInstance(state, "c", { instanceId: "basic", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  state.step = "play-batch-draft";
  state.players.c.flags.deploymentBonusActive = true;
  state.players.c.flags.deploymentLocationId = "mountain";
  state.players.c.flags.deploymentBonus = 3;
  const beforeTotal = calculateCombatPower(state, state.players.c, definitions, "mountain");

  const result = engine.execute(state, command(state, "crash-play", CommandType.CommitAttack, "c", {
    faceUpInstanceIds: ["wings", "basic"],
    faceDownInstanceIds: [],
  }));
  assert.equal(result.state.players.c.flags.roundPowerBonus, 5);
  assert.equal(calculateTerrainAdvantage(result.state, result.state.players.c, definitions, "mountain"), 0);
  assert.ok(calculateCombatPower(result.state, result.state.players.c, definitions, "mountain") >= beforeTotal + 5);
  assert.equal(result.state.players.c.flags.servantGenderRule, "male");
});

test("Poseidon's Maelstrom Undertow atomically swaps with the scouting player and respects one-seat scouting", () => {
  const { engine, state } = setup("caenis-undertow");
  addSkill(state, "favor", FAVOR, "servant-skills");
  addSkill(state, "maelstrom", MAELSTROM);
  state.players.o.locationId = "scouting";
  state.board.locations.city = [];
  state.board.locations.scouting = ["o"];

  let result = engine.execute(state, command(state, "undertow", CommandType.UseSkill, "c", {
    skillId: MAELSTROM,
    data: { abilityId: "undertow" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "caenis-undertow");
  result = resolve(engine, result.state, "undertow-o", "c", ["o"]);
  assert.equal(result.state.players.c.locationId, "scouting");
  assert.equal(result.state.players.o.locationId, "mountain");
  assert.deepEqual(result.state.board.locations.scouting, ["c"]);
  assert.ok(result.state.players.c.flags.movedOrRedeployedRound === state.round);
  assert.ok(result.state.players.o.flags.movedOrRedeployedRound === state.round);
});

test("Poseidon's Maelstrom Tidal Wave uses 3 minus each owner's terrain advantage and leaves Magic attacks unchanged", () => {
  const { engine, definitions, state } = setup("caenis-tidal-wave");
  addSkill(state, "favor", FAVOR);
  addSkill(state, "maelstrom", MAELSTROM);
  state.phase = "combat";
  state.step = "player-window";
  state.players.o.locationId = "mountain";
  state.board.locations.city = [];
  state.board.locations.mountain = ["c", "o"];
  state.players.o.flags.deploymentBonusActive = true;
  state.players.o.flags.deploymentLocationId = "mountain";
  state.players.o.flags.deploymentBonus = 1;
  createOwnedCardInstance(state, "o", { instanceId: "strength", definitionId: "card.cardb1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "magic", definitionId: "card.carda1", zone: "attack", face: "up", active: true });
  const strengthBefore = calculateCombatCardPower(state, state.players.o, "strength", definitions, "mountain");
  const magicBefore = calculateCombatCardPower(state, state.players.o, "magic", definitions, "mountain");

  const result = engine.execute(state, command(state, "tidal", CommandType.UseSkill, "c", {
    skillId: MAELSTROM,
    data: { abilityId: "tidal-wave" },
  }));
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "strength", definitions, "mountain"), strengthBefore - 2);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "magic", definitions, "mountain"), magicBefore);
});
