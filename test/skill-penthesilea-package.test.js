import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { calculateCombatCardPower, calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { PENTHESILEA_BEAUTY_ID, PENTHESILEA_EVICERATE_ID, PENTHESILEA_ROAR_ID } from "../src/rules-core/penthesilea.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "penthesilea-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions(),
    "card.test.nonbasic": { id: "card.test.nonbasic", name: "Nonbasic", cardType: "attack", cost: 0, basePower: 6, typeLabel: "力量", attributes: ["力量"], basic: false },
  };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "p", name: "Penthesilea" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    seed: 7741,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "p";
  state.turnOrder = ["p", "a", "b"];
  state.players.p.servantId = "servant.penthesilea";
  for (const id of state.turnOrder) {
    state.players[id].locationId = "mountain";
    state.players[id].mana = 20;
    state.players[id].victoryPoints = 5;
  }
  state.board.locations.mountain = ["p", "a", "b"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function add(state, playerId, instanceId, definitionId, zone = "attack", face = "up", active = true) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}

function resolve(engine, state, id, actorId, selections) {
  return engine.execute(state, command(state, id, CommandType.ResolveDecision, actorId, {
    decisionId: state.pendingDecision.decisionId,
    selections,
  }));
}

test("Penthesilea package is 3/3 FULL and executable", () => {
  const { built } = setup("penthesilea-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.penthesilea");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.unmodeledClauses ?? []), []);
});

test("Roar joins from the skill zone, zeroes basic base power, and defeats lower-power opponents after calculation", () => {
  const { built, definitions, engine, state } = setup("penthesilea-roar");
  add(state, "p", "roar", PENTHESILEA_ROAR_ID, "servant-skills", "down", false);
  add(state, "p", "p-basic", "card.cardq4");
  add(state, "p", "p-nonbasic", "card.test.nonbasic");
  add(state, "a", "a-basic", "card.carda1");

  const used = engine.execute(state, command(state, "roar-use", CommandType.UseSkill, "p", {
    skillId: PENTHESILEA_ROAR_ID,
    data: { abilityId: "roar-outpost" },
  }));
  assert.equal(used.state.cards.roar.zone, "attack");
  assert.equal(used.state.cards.roar.active, true);
  assert.equal(used.state.players.p.trueNameRevealed, true);
  assert.equal(calculateCombatCardPower(used.state, used.state.players.p, "p-basic", definitions, "mountain"), 0);
  assert.equal(calculateCombatCardPower(used.state, used.state.players.p, "p-nonbasic", definitions, "mountain"), 6);

  used.state.phase = "combat";
  const result = resolveCombat(used.state, "mountain", definitions, built.events);
  assert.ok(result.defeatedPlayerIds.includes("a"));
  assert.equal(used.state.players.a.defeated, true);
});

test("Divine Beauty reveals only gender choices, penalizes male declarations, and removes Penthesilea basics from all printed zones", () => {
  const { definitions, engine, state } = setup("penthesilea-beauty");
  state.phase = "combat";
  add(state, "p", "beauty", PENTHESILEA_BEAUTY_ID);
  add(state, "p", "hand-basic", "card.carda1", "hand", "down", false);
  add(state, "p", "deck-basic", "card.cardb1", "deck", "down", false);
  add(state, "p", "discard-basic", "card.cardq1", "discard", "up", false);
  add(state, "p", "play-basic", "card.cardq4");

  let result = engine.execute(state, command(state, "beauty-use", CommandType.UseSkill, "p", {
    skillId: PENTHESILEA_BEAUTY_ID,
    data: { abilityId: "eternal-humiliation" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "penthesilea-reveal-servant-gender");
  assert.deepEqual(result.state.pendingDecision?.chooserPlayerIds, ["a"]);
  result = resolve(engine, result.state, "gender-a", "a", ["male"]);
  assert.deepEqual(result.state.pendingDecision?.chooserPlayerIds, ["b"]);
  result = resolve(engine, result.state, "gender-b", "b", ["not-male"]);

  for (const id of ["hand-basic", "deck-basic", "discard-basic", "play-basic"]) assert.equal(result.state.cards[id].zone, "removed");
  assert.equal(calculateCombatPower(result.state, result.state.players.a, definitions, "mountain"), 0);
  assert.equal(calculateCombatPower(result.state, result.state.players.b, definitions, "mountain"), 0);
});

test("Evicerate pays the discarded attack cost and uses hypothetical combat power with Roar base-zero plus later modifiers", () => {
  const { engine, state } = setup("penthesilea-evicerate");
  add(state, "p", "roar", PENTHESILEA_ROAR_ID, "servant-skills", "down", false);
  let result = engine.execute(state, command(state, "roar-use", CommandType.UseSkill, "p", {
    skillId: PENTHESILEA_ROAR_ID,
    data: { abilityId: "roar-outpost" },
  }));
  add(result.state, "p", "discard-me", "card.cardq4", "hand", "down", false);
  result.state.activeRuleModifiers.push({
    id: "test-basic-power-plus-four", sourceId: "test", controllerPlayerId: "p",
    operation: "add", rule: "card_power", scope: { subject: "controller", cards: { basic: true } },
    value: 4, duration: "round", createdRound: result.state.round,
  });
  result.state.phase = "combat";
  result.state.activePlayerId = "p";
  result.state.players.p.mana = 10;
  result.state.players.a.victoryPoints = 5;
  result.state.players.b.victoryPoints = 5;

  result = engine.execute(result.state, command(result.state, "evicerate-use", CommandType.UseSkill, "p", {
    skillId: PENTHESILEA_EVICERATE_ID,
    data: { abilityId: "evicerate" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "penthesilea-evicerate-attack");
  result = resolve(engine, result.state, "evicerate-card", "p", ["discard-me"]);
  assert.equal(result.state.cards["discard-me"].zone, "discard");
  assert.equal(result.state.players.p.mana, 9);
  assert.equal(result.state.players.a.victoryPoints, 3);
  assert.equal(result.state.players.b.victoryPoints, 3);
});
