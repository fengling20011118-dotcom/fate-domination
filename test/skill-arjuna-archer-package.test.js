import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, closePlayerCard } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";

const ENDOWED = "servant.arjuna-archer.skill.sc-arjuna-archer-1";
const AGNI = "servant.arjuna-archer.skill.sc-arjuna-archer-2";
const PASHUPATA = "servant.arjuna-archer.skill.sc-arjuna-archer-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "arjuna-archer") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "a", name: "Arjuna" }, { id: "o", name: "Opponent" }], seed: 1001 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = ["a", "o"];
  state.players.a.servantId = "servant.arjuna-archer";
  state.players.a.mana = 12;
  state.players.o.mana = 12;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["a"];
  state.board.locations.city = ["o"];
  state.board.locations.scouting = [];
  state.players.a.locationId = "mountain";
  state.players.o.locationId = "city";
  return { built, engine, definitions, state };
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

test("Arjuna Archer package: all three skills are FULL", () => {
  const { built } = setup("arjuna-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.arjuna-archer");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(ENDOWED).handlerId, "core.arjuna-endowed-hero");
  assert.equal(built.skills.get(AGNI).handlerId, "core.arjuna-agni-gandiva");
  assert.equal(built.skills.get(PASHUPATA).handlerId, "core.arjuna-judgment");
});

test("Endowed Hero reveals its hidden passive card, pays 1, fetches a basic card, then may pay 2 plus its actual play cost", () => {
  const { engine, state } = setup("arjuna-endowed-play");
  createOwnedCardInstance(state, "a", { instanceId: "endowed", definitionId: ENDOWED, zone: "servant-skills", face: "down", active: false });
  createOwnedCardInstance(state, "a", { instanceId: "surveil", definitionId: "card.cardsurveil", zone: "deck", face: "down", active: false });
  state.players.a.mana = 6;

  let result = engine.execute(state, command(state, "endowed-use", CommandType.UseSkill, "a", {
    skillId: ENDOWED,
    data: { abilityId: "endowed-search" },
  }));
  assert.equal(result.state.players.a.mana, 5);
  assert.equal(result.state.cards.endowed.face, "up");
  assert.equal(result.state.pendingDecision?.kind, "arjuna-endowed-basic-card");

  result = engine.execute(result.state, command(result.state, "endowed-pick", CommandType.ResolveDecision, "a", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["surveil"],
  }));
  assert.equal(result.state.cards.surveil.zone, "hand");
  assert.equal(result.state.pendingDecision?.kind, "arjuna-endowed-play-card");

  result = engine.execute(result.state, command(result.state, "endowed-play", CommandType.ResolveDecision, "a", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["play"],
  }));
  assert.equal(result.state.players.a.mana, 2);
  assert.equal(result.state.cards.surveil.zone, "attack");
  assert.equal(result.state.cards.surveil.active, true);
  assert.equal(result.state.cards.surveil.paidCost, 1);
  assert.ok(result.events.some((event) => event.type === "card.played" && event.payload.instanceId === "surveil"));
});

test("Endowed Hero can take a basic card from discard and keep it in hand", () => {
  const { engine, state } = setup("arjuna-endowed-keep");
  createOwnedCardInstance(state, "a", { instanceId: "endowed", definitionId: ENDOWED, zone: "servant-skills", face: "down", active: false });
  createOwnedCardInstance(state, "a", { instanceId: "basic", definitionId: "card.cardb1", zone: "discard", face: "up", active: false });
  state.players.a.mana = 8;
  let result = engine.execute(state, command(state, "endowed-keep-use", CommandType.UseSkill, "a", {
    skillId: ENDOWED,
    data: { abilityId: "endowed-search" },
  }));
  result = engine.execute(result.state, command(result.state, "endowed-keep-pick", CommandType.ResolveDecision, "a", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["basic"],
  }));
  result = engine.execute(result.state, command(result.state, "endowed-keep-decline", CommandType.ResolveDecision, "a", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["keep"],
  }));
  assert.equal(result.state.cards.basic.zone, "hand");
  assert.equal(result.state.players.a.mana, 7);
});

test("Agni Gandiva arms after discarding 0..3 cards and can defeat a matching opponent at another location", () => {
  const { engine, definitions, state } = setup("arjuna-agni-global");
  createOwnedCardInstance(state, "a", { instanceId: "agni", definitionId: AGNI, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "h2", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "a", { instanceId: "h3", definitionId: "card.cardq2", zone: "hand", face: "down", active: false });

  let result = engine.execute(state, command(state, "agni-use", CommandType.UseSkill, "a", {
    skillId: AGNI,
    data: { abilityId: "prophetic-shot" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "arjuna-agni-discard");
  result = engine.execute(result.state, command(result.state, "agni-discard-zero", CommandType.ResolveDecision, "a", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: [],
  }));
  assert.equal(result.state.players.a.flags.arjunaAgniArmedRound, 4);

  createOwnedCardInstance(result.state, "o", { instanceId: "match5", definitionId: "card.cardq4", zone: "attack", face: "up", active: true });
  emitPassive(engine, result.state, definitions, "card.played", { playerId: "o", instanceId: "match5", definitionId: "card.cardq4", face: "up", paidMana: 1 });
  assert.equal(result.state.pendingDecision?.kind, "arjuna-agni-defeat-response");
  result = engine.execute(result.state, command(result.state, "agni-defeat", CommandType.ResolveDecision, "a", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["defeat"],
  }));
  assert.equal(result.state.players.o.defeated, true);
  assert.equal(result.state.players.a.hand.length, 0);
  assert.equal(result.state.cards.h2.zone, "discard");
  assert.equal(result.state.cards.h3.zone, "discard");
});

test("Agni Gandiva prediction expires next round and ends immediately if the source is closed", () => {
  const { engine, definitions, state } = setup("arjuna-agni-expiry");
  createOwnedCardInstance(state, "a", { instanceId: "agni", definitionId: AGNI, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "h5", definitionId: "card.cardq4", zone: "hand", face: "down", active: false });
  let result = engine.execute(state, command(state, "agni-expiry-use", CommandType.UseSkill, "a", {
    skillId: AGNI,
    data: { abilityId: "prophetic-shot" },
  }));
  result = engine.execute(result.state, command(result.state, "agni-expiry-arm", CommandType.ResolveDecision, "a", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: [],
  }));
  createOwnedCardInstance(result.state, "o", { instanceId: "match", definitionId: "card.cardq4", zone: "attack", face: "up", active: true });

  closePlayerCard(result.state, "a", "agni", definitions);
  emitPassive(engine, result.state, definitions, "card.played", { playerId: "o", instanceId: "match", definitionId: "card.cardq4", face: "up" });
  assert.equal(result.state.pendingDecision, null);

  result.state.cards.agni.zone = "attack";
  result.state.cards.agni.face = "up";
  result.state.cards.agni.active = true;
  result.state.players.a.attack.push("agni");
  result.state.players.a.servantSkills = result.state.players.a.servantSkills.filter((id) => id !== "agni");
  result.state.round = 5;
  emitPassive(engine, result.state, definitions, "card.played", { playerId: "o", instanceId: "match", definitionId: "card.cardq4", face: "up" });
  assert.equal(result.state.pendingDecision, null);
});
