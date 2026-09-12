import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

const THUNDERER_PASSIVE = "servant.billy.skill.sc-billy-1";
const THUNDERER_ATTACK = "servant.billy.skill.sc-billy-2";
const QUICK_DRAW = "servant.billy.skill.sc-billy-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "billy-package", phase = "action") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "b", name: "Billy" }, { id: "o", name: "Opponent" }], seed: 1515 });
  state.status = "playing";
  state.round = 4;
  state.phase = phase;
  state.step = "player-window";
  state.activePlayerId = "b";
  state.players.b.servantId = "servant.billy";
  state.players.b.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["b", "o"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, engine, state };
}

function addHidden(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "b", { instanceId, definitionId, zone: "attack", face: "down", active: false });
}

test("Billy package: all three skills are FULL with concrete handlers", () => {
  const { built } = setup("billy-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.billy");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(THUNDERER_PASSIVE).handlerId, "core.billy-thunderer-hidden-attacks");
  assert.equal(built.skills.get(QUICK_DRAW).handlerId, "core.billy-quick-draw");
});

test("Thunderer may spend 3 mana to activate every face-down Agility basic and closes Billy's active skill attacks", () => {
  const { engine, state } = setup("billy-thunderer-all", "combat");
  state.players.b.mana = 5;
  addHidden(state, "a1", "card.cardq2");
  addHidden(state, "a2", "card.cardq3");
  addHidden(state, "a3", "card.cardq4");
  addHidden(state, "strength", "card.cardb2");
  createOwnedCardInstance(state, "b", { instanceId: "thunderer-attack", definitionId: THUNDERER_ATTACK, zone: "attack", face: "up", active: true });

  let result = engine.execute(state, command(state, "thunderer-open", CommandType.UseSkill, "b", {
    skillId: THUNDERER_PASSIVE,
    data: { abilityId: "thunderer-hidden-attacks" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "billy-thunderer-mode");
  assert.deepEqual(new Set(result.state.pendingDecision.options.map((option) => option.id)), new Set(["up-to-two", "all-for-three"]));
  assert.equal(result.state.players.b.trueNameRevealed, true);

  result = engine.execute(result.state, command(result.state, "thunderer-all", CommandType.ResolveDecision, "b", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["all-for-three"],
  }));
  assert.equal(result.state.players.b.mana, 2);
  for (const id of ["a1", "a2", "a3"]) {
    assert.equal(result.state.cards[id].face, "up");
    assert.equal(result.state.cards[id].active, true);
  }
  assert.equal(result.state.cards.strength.face, "down");
  assert.equal(result.state.cards.strength.active, false);
  assert.equal(result.state.cards["thunderer-attack"].zone, "servant-skills");
  assert.equal(result.state.cards["thunderer-attack"].active, false);
});

test("Thunderer free branch activates at most two selected face-down Agility basics", () => {
  const { engine, state } = setup("billy-thunderer-two", "combat");
  state.players.b.mana = 0;
  addHidden(state, "a1", "card.cardq2");
  addHidden(state, "a2", "card.cardq3");
  addHidden(state, "a3", "card.cardq4");
  let result = engine.execute(state, command(state, "thunderer-mode", CommandType.UseSkill, "b", {
    skillId: THUNDERER_PASSIVE,
    data: { abilityId: "thunderer-hidden-attacks" },
  }));
  assert.deepEqual(result.state.pendingDecision.options.map((option) => option.id), ["up-to-two"]);
  result = engine.execute(result.state, command(result.state, "thunderer-free", CommandType.ResolveDecision, "b", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["up-to-two"],
  }));
  assert.equal(result.state.pendingDecision?.kind, "billy-thunderer-hidden-attacks");
  assert.equal(result.state.pendingDecision.max, 2);
  result = engine.execute(result.state, command(result.state, "thunderer-pick-two", CommandType.ResolveDecision, "b", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["a1", "a3"],
  }));
  assert.equal(result.state.players.b.mana, 0);
  assert.equal(result.state.cards.a1.active, true);
  assert.equal(result.state.cards.a3.active, true);
  assert.equal(result.state.cards.a2.active, false);
});

test("Quick Draw is free once, then costs 1 per repeat, draws after each card, and caps at six cards per round", () => {
  const { engine, state } = setup("billy-quick-draw", "action");
  state.players.b.mana = 10;
  for (let i = 1; i <= 6; i += 1) createOwnedCardInstance(state, "b", { instanceId: `hand-${i}`, definitionId: "card.cardb2", zone: "hand", face: "down", active: false });
  for (let i = 1; i <= 6; i += 1) createOwnedCardInstance(state, "b", { instanceId: `draw-${i}`, definitionId: "card.cardq2", zone: "deck", face: "down", active: false });

  let current = state;
  for (let i = 1; i <= 6; i += 1) {
    let result = engine.execute(current, command(current, `quick-open-${i}`, CommandType.UseSkill, "b", {
      skillId: QUICK_DRAW,
      data: { abilityId: "quick-draw" },
    }));
    assert.equal(result.state.pendingDecision?.kind, "billy-quick-draw-card");
    const selected = result.state.pendingDecision.options.find((option) => option.id.startsWith("hand-"))?.id
      ?? result.state.pendingDecision.options[0].id;
    result = engine.execute(result.state, command(result.state, `quick-pick-${i}`, CommandType.ResolveDecision, "b", {
      decisionId: result.state.pendingDecision.decisionId,
      selections: [selected],
    }));
    assert.equal(result.state.cards[selected].zone, "attack");
    assert.equal(result.state.cards[selected].face, "down");
    assert.equal(result.state.cards[selected].active, false);
    assert.equal(result.state.cards[selected].paidCost, 0);
    current = result.state;
  }

  assert.equal(current.players.b.flags.billyQuickDrawCount, 6);
  assert.equal(current.players.b.flags.billyQuickDrawRound, 4);
  assert.equal(current.players.b.mana, 5);
  assert.equal(current.players.b.attack.filter((id) => current.cards[id].face === "down").length, 6);
  assert.throws(() => engine.execute(current, command(current, "quick-seven", CommandType.UseSkill, "b", {
    skillId: QUICK_DRAW,
    data: { abilityId: "quick-draw" },
  })), /SKILL_USE_FORBIDDEN/);
});
