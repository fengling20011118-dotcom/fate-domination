import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";

const LAMENT = "servant.tristan.skill.sc-tristan-1";
const LOVE = "servant.tristan.skill.sc-tristan-2";
const S3 = "servant.tristan.skill.sc-tristan-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "tristan") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "t", name: "Tristan" }, { id: "o", name: "Opponent" }], seed: 1919 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "t";
  state.turnOrder = ["t", "o"];
  state.players.t.servantId = "servant.tristan";
  state.board.locations.workshop = [];
  state.board.locations.mountain = [];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, engine, definitions, state };
}

function place(state, playerId, locationId) {
  for (const location of Object.keys(state.board.locations)) state.board.locations[location] = state.board.locations[location].filter((id) => id !== playerId);
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload = {}) {
  passiveCounter += 1;
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${passiveCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Tristan package: all three skills are FULL with concrete handlers", () => {
  const { built } = setup("tristan-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.tristan");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(LAMENT).handlerId, "core.tristan-lament");
  assert.equal(built.skills.get(LOVE).handlerId, "core.tristan-love");
  assert.equal(built.skills.get(S3).supportLevel, "FULL");
});

test("Lament closes every non-residual attack sharing a current base power and leaves residual/source cards", () => {
  const { engine, state } = setup("tristan-lament-match");
  place(state, "t", "mountain");
  place(state, "o", "mountain");
  createOwnedCardInstance(state, "t", { instanceId: "lament", definitionId: LAMENT, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "t", { instanceId: "same-a", definitionId: "card.cardq2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "same-b", definitionId: "card.cardq2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "same-residual", definitionId: "card.cardq2", zone: "attack", face: "up", active: true, residual: true });

  const result = engine.execute(state, command(state, "tristan-lament-use", CommandType.UseSkill, "t", {
    skillId: LAMENT,
    data: { abilityId: "lament-resonance" },
  }));
  assert.equal(result.state.cards.lament.zone, "attack");
  assert.equal(result.state.cards.lament.active, true);
  assert.equal(result.state.cards["same-a"].zone, "attack");
  assert.equal(result.state.cards["same-a"].face, "down");
  assert.equal(result.state.cards["same-a"].active, false);
  assert.equal(result.state.cards["same-b"].zone, "attack");
  assert.equal(result.state.cards["same-b"].face, "down");
  assert.equal(result.state.cards["same-b"].active, false);
  assert.equal(result.state.cards["same-residual"].zone, "attack");
  assert.equal(result.state.cards["same-residual"].active, true);
});

test("Lament discards the top three cards of Tristan's deck when no duplicate base power exists", () => {
  const { engine, state } = setup("tristan-lament-miss");
  place(state, "t", "mountain");
  place(state, "o", "mountain");
  createOwnedCardInstance(state, "t", { instanceId: "lament", definitionId: LAMENT, zone: "attack", face: "up", active: true });
  for (const [id, def] of [["d1", "card.cardq1"], ["d2", "card.cardb1"], ["d3", "card.carda1"], ["d4", "card.cardluck"]]) {
    createOwnedCardInstance(state, "t", { instanceId: id, definitionId: def, zone: "deck", face: "down", active: false });
  }
  state.players.t.deck = ["d1", "d2", "d3", "d4"];

  const result = engine.execute(state, command(state, "tristan-lament-fallback", CommandType.UseSkill, "t", {
    skillId: LAMENT,
    data: { abilityId: "lament-resonance" },
  }));
  assert.deepEqual(result.state.players.t.deck, ["d4"]);
  assert.deepEqual(result.state.players.t.discard.slice(-3), ["d1", "d2", "d3"]);
});

test("Love shuffles any chosen discard cards into the deck and records X as chosen count plus two", () => {
  const { engine, definitions, state } = setup("tristan-love-shuffle");
  place(state, "t", "mountain");
  place(state, "o", "city");
  createOwnedCardInstance(state, "t", { instanceId: "love", definitionId: LOVE, zone: "attack", face: "up", active: true, residual: true });
  createOwnedCardInstance(state, "t", { instanceId: "a", definitionId: "card.cardq1", zone: "discard", face: "down", active: false });
  createOwnedCardInstance(state, "t", { instanceId: "b", definitionId: "card.cardb1", zone: "discard", face: "down", active: false });
  createOwnedCardInstance(state, "t", { instanceId: "c", definitionId: "card.carda1", zone: "discard", face: "down", active: false });

  emitPassive(engine, state, definitions, "card.played", { playerId: "t", instanceId: "love", definitionId: LOVE, face: "up" });
  assert.equal(state.pendingDecision?.kind, "tristan-love-shuffle");
  assert.equal(state.pendingDecision?.min, 0);
  assert.equal(state.pendingDecision?.max, 3);

  const result = engine.execute(state, command(state, "tristan-love-pick", CommandType.ResolveDecision, "t", {
    decisionId: state.pendingDecision.decisionId,
    selections: ["a", "c"],
  }));
  assert.equal(result.state.players.t.flags["tristanLoveX:love"], 4);
  assert.ok(result.state.players.t.deck.includes("a"));
  assert.ok(result.state.players.t.deck.includes("c"));
  assert.deepEqual(result.state.players.t.discard, ["b"]);
});

test("Love requires X mana when Tristan fights; payment keeps it active and insufficient mana closes it", () => {
  const first = setup("tristan-love-pay");
  place(first.state, "t", "mountain");
  place(first.state, "o", "mountain");
  first.state.players.t.mana = 6;
  createOwnedCardInstance(first.state, "t", { instanceId: "love", definitionId: LOVE, zone: "attack", face: "up", active: true, residual: true });
  first.state.players.t.flags["tristanLoveX:love"] = 4;
  first.state.players.t.flags["structuredChoiceResetOnClose:love:tristanLoveX:love"] = true;
  first.state.phase = "combat";
  emitPassive(first.engine, first.state, first.definitions, "phase.transitioned", { previousPhase: "action", transition: "next-phase" });
  assert.equal(first.state.pendingDecision?.kind, "tristan-love-upkeep");
  const paid = first.engine.execute(first.state, command(first.state, "tristan-love-pay-choice", CommandType.ResolveDecision, "t", {
    decisionId: first.state.pendingDecision.decisionId,
    selections: ["pay"],
  }));
  assert.equal(paid.state.players.t.mana, 2);
  assert.equal(paid.state.cards.love.zone, "attack");
  assert.equal(paid.state.cards.love.active, true);

  const second = setup("tristan-love-close");
  place(second.state, "t", "city");
  place(second.state, "o", "city");
  second.state.players.t.mana = 3;
  createOwnedCardInstance(second.state, "t", { instanceId: "love", definitionId: LOVE, zone: "attack", face: "up", active: true, residual: true });
  second.state.players.t.flags["tristanLoveX:love"] = 4;
  second.state.players.t.flags["structuredChoiceResetOnClose:love:tristanLoveX:love"] = true;
  emitPassive(second.engine, second.state, second.definitions, "phase.transitioned", { previousPhase: "action", transition: "next-phase" });
  assert.equal(second.state.pendingDecision, null);
  assert.equal(second.state.cards.love.zone, "servant-skills");
  assert.equal(second.state.cards.love.active, false);
  assert.equal(second.state.players.t.flags["tristanLoveX:love"], undefined);
});
