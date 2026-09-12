import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

const ALL_EVILS = "servant.angra.skill.sc-angra-1";
const ETERNAL_BINDING = "servant.angra.skill.sc-angra-2";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "angra-package", players = [{ id: "angra", name: "Angra" }, { id: "a", name: "A" }]) {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players, seed: 9090 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "angra";
  state.players.angra.servantId = "servant.angra";
  for (const player of players) state.players[player.id].locationId = "mountain";
  state.board.locations.mountain = players.map((player) => player.id);
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, engine, state };
}

function addActiveSkill(state, skillId, instanceId) {
  createOwnedCardInstance(state, "angra", { instanceId, definitionId: skillId, zone: "attack", face: "up", active: true });
}

function addHand(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "angra", { instanceId, definitionId, zone: "hand", face: "down", active: false });
}

function addDiscard(state, instanceId, definitionId = "card.card-avenger") {
  createOwnedCardInstance(state, "angra", { instanceId, definitionId, zone: "discard", face: "up", active: false });
}

test("Angra package: all three skills are FULL with concrete handlers", () => {
  const { built } = setup("angra-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.angra");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(ALL_EVILS).handlerId, "core.angra-all-evils");
  assert.equal(built.skills.get(ETERNAL_BINDING).handlerId, "core.angra-eternal-binding");
});

test("All the World's Evils discards exactly four after combat and each discarded Avenger may steal 2 VP from a winner", () => {
  const players = [{ id: "angra", name: "Angra" }, { id: "a", name: "A" }, { id: "b", name: "B" }];
  const { engine, state } = setup("angra-all-evils", players);
  addActiveSkill(state, ALL_EVILS, "all-evils");
  addHand(state, "av1", "card.card-avenger");
  addHand(state, "av2", "card.card-avenger");
  addHand(state, "h1", "card.cardb1");
  addHand(state, "h2", "card.cardq1");
  addHand(state, "keep", "card.carda1");
  state.players.a.victoryPoints = 5;
  state.players.b.victoryPoints = 1;

  let result = engine.execute(state, command(state, "arm-all-evils", CommandType.UseSkill, "angra", {
    skillId: ALL_EVILS,
    data: { abilityId: "all-world-evils-delay" },
  }));
  assert.equal(result.state.players.angra.flags.angraAllEvilsRound, 4);

  result.state.phase = "combat";
  result.state.step = "settlement";
  result.state.activePlayerId = null;
  result.state.modeState.resolvedCombats = ["mountain", "city"];
  result.state.modeState.combatWinnerIdsByLocation = { mountain: ["a", "b"], city: [] };
  result.state.players.angra.flags.combatLossRound = 4;

  result = engine.execute(result.state, command(result.state, "end-open", CommandType.EndRound, "angra"));
  assert.equal(result.state.pendingDecision?.kind, "angra-all-evils-discard");
  assert.equal(result.state.pendingDecision?.min, 4);
  assert.equal(result.state.pendingDecision?.max, 4);

  result = engine.execute(result.state, command(result.state, "discard-four", CommandType.ResolveDecision, "angra", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["av1", "av2", "h1", "h2"],
  }));
  assert.deepEqual(new Set(result.state.players.angra.discard), new Set(["av1", "av2", "h1", "h2"]));
  assert.deepEqual(result.state.players.angra.hand, ["keep"]);
  assert.equal(result.state.pendingDecision?.kind, "angra-all-evils-steal");

  result = engine.execute(result.state, command(result.state, "steal-b", CommandType.ResolveDecision, "angra", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["b"],
  }));
  assert.equal(result.state.players.b.victoryPoints, 0);
  assert.equal(result.state.players.angra.victoryPoints, 1);
  assert.equal(result.state.pendingDecision?.kind, "angra-all-evils-steal");

  result = engine.execute(result.state, command(result.state, "steal-a", CommandType.ResolveDecision, "angra", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["a"],
  }));
  assert.equal(result.state.players.a.victoryPoints, 3);
  assert.equal(result.state.players.angra.victoryPoints, 3);
  assert.equal(result.state.pendingDecision, null);
});

test("All the World's Evils discards the whole hand when fewer than four cards remain", () => {
  const { engine, state } = setup("angra-short-hand");
  addActiveSkill(state, ALL_EVILS, "all-evils");
  addHand(state, "av", "card.card-avenger");
  addHand(state, "h1", "card.cardb1");
  addHand(state, "h2", "card.cardq1");
  let result = engine.execute(state, command(state, "arm-short", CommandType.UseSkill, "angra", {
    skillId: ALL_EVILS,
    data: { abilityId: "all-world-evils-delay" },
  }));
  result.state.phase = "combat";
  result.state.step = "settlement";
  result.state.activePlayerId = null;
  result.state.modeState.resolvedCombats = ["mountain", "city"];
  result.state.modeState.combatWinnerIdsByLocation = { mountain: ["angra"], city: [] };
  result.state.players.angra.flags.combatWinRound = 4;
  result = engine.execute(result.state, command(result.state, "end-short", CommandType.EndRound, "angra"));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.players.angra.hand.length, 0);
  assert.deepEqual(new Set(result.state.players.angra.discard), new Set(["av", "h1", "h2"]));
});

test("Eternal Binding returns all discarded Avengers to hand without a previous-round combat loss", () => {
  const { engine, state } = setup("angra-binding-hand");
  addActiveSkill(state, ETERNAL_BINDING, "binding");
  addDiscard(state, "av1");
  addDiscard(state, "av2");
  addDiscard(state, "other", "card.cardb1");
  const result = engine.execute(state, command(state, "binding-hand", CommandType.UseSkill, "angra", {
    skillId: ETERNAL_BINDING,
    data: { abilityId: "eternal-binding-return" },
  }));
  assert.deepEqual(new Set(result.state.players.angra.hand), new Set(["av1", "av2"]));
  assert.deepEqual(result.state.players.angra.discard, ["other"]);
  assert.equal(result.state.cards.av1.face, "down");
  assert.equal(result.state.cards.av1.active, false);
});

test("Eternal Binding joins all discarded Avengers directly to the attack after losing the previous round", () => {
  const { engine, state } = setup("angra-binding-attack");
  addActiveSkill(state, ETERNAL_BINDING, "binding");
  addDiscard(state, "av1");
  addDiscard(state, "av2");
  state.players.angra.flags.combatLossRound = 3;
  state.players.angra.mana = 0;
  const result = engine.execute(state, command(state, "binding-attack", CommandType.UseSkill, "angra", {
    skillId: ETERNAL_BINDING,
    data: { abilityId: "eternal-binding-return" },
  }));
  assert.ok(result.state.players.angra.attack.includes("av1"));
  assert.ok(result.state.players.angra.attack.includes("av2"));
  assert.equal(result.state.cards.av1.face, "up");
  assert.equal(result.state.cards.av1.active, true);
  assert.equal(result.state.cards.av1.paidCost, 0);
  assert.equal(result.state.players.angra.mana, 0);
});
