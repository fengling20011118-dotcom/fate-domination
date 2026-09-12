import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { closePlayerCard, createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getStructuredCombatPower } from "../src/rules-core/rule-modifiers.ts";

const RULER = "servant.jeanne.skill.sc-jeanne-1";
const LORD = "servant.jeanne.skill.sc-jeanne-2";
const LA_PUCELLE = "servant.jeanne.skill.sc-jeanne-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "jeanne-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "j", name: "Jeanne" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    seed: 8001,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "j";
  state.turnOrder = ["j", "a", "b"];
  state.players.j.servantId = "servant.jeanne";
  for (const playerId of ["j", "a", "b"]) state.players[playerId].mana = 12;
  state.players.j.locationId = "mountain";
  state.players.a.locationId = "mountain";
  state.players.b.locationId = "city";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["j", "a"];
  state.board.locations.city = ["b"];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function addLord(state) {
  createOwnedCardInstance(state, "j", { instanceId: "lord", definitionId: LORD, zone: "attack", face: "up", active: true });
}

test("Jeanne package: all three skills are FULL", () => {
  const { built } = setup("jeanne-full");
  const skills = [RULER, LORD, LA_PUCELLE].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[0].handlerId, "core.ruler-class");
  assert.equal(skills[1].handlerId, "core.structured-skill");
  assert.equal(skills[2].handlerId, "core.defeat-combat-participants");
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("Luminosité Eternelle gives Jeanne +2 total power for every active face-up Luck across all players and updates continuously", () => {
  const { definitions, state } = setup("jeanne-luck-aura");
  addLord(state);
  state.phase = "combat";
  createOwnedCardInstance(state, "j", { instanceId: "luck-j", definitionId: "card.cardluck", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "luck-a", definitionId: "card.cardluck", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "b", { instanceId: "luck-hidden", definitionId: "card.cardluck", zone: "attack", face: "down", active: true });

  assert.equal(getStructuredCombatPower(state, "j", definitions, 10), 14);
  state.cards["luck-a"].active = false;
  assert.equal(getStructuredCombatPower(state, "j", definitions, 10), 12);
  state.cards["luck-a"].active = true;
  state.cards["luck-hidden"].face = "up";
  assert.equal(getStructuredCombatPower(state, "j", definitions, 10), 16);

  closePlayerCard(state, "j", "lord", definitions);
  assert.equal(getStructuredCombatPower(state, "j", definitions, 10), 10);
});

test("Luminosité Eternelle action ability makes every living player draw one card", () => {
  const { engine, state } = setup("jeanne-draw-all");
  addLord(state);
  for (const playerId of ["j", "a", "b"]) {
    createOwnedCardInstance(state, playerId, { instanceId: `${playerId}-deck`, definitionId: "card.cardb1", zone: "deck", face: "down", active: false });
  }
  const result = engine.execute(state, command(state, "lord-draw", CommandType.UseSkill, "j", {
    skillId: LORD,
    data: { abilityId: "lord-draw-all" },
  }));
  assert.deepEqual([result.state.players.j.hand.length, result.state.players.a.hand.length, result.state.players.b.hand.length], [1, 1, 1]);
  assert.ok(result.state.players.j.hand.includes("j-deck"));
  assert.ok(result.state.players.a.hand.includes("a-deck"));
  assert.ok(result.state.players.b.hand.includes("b-deck"));
});

test("while Luminosité Eternelle is active, another player's Luck gains a combat-window play ability that performs a real paid play", () => {
  const { engine, state } = setup("jeanne-luck-play");
  addLord(state);
  createOwnedCardInstance(state, "a", { instanceId: "luck-hand", definitionId: "card.cardluck", zone: "hand", face: "down", active: false });
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.players.a.mana = 5;

  const result = engine.execute(state, command(state, "luck-combat-play", CommandType.UseCardAbility, "a", {
    instanceId: "luck-hand",
    ability: "lord-luck-combat-play",
  }));
  assert.equal(result.state.cards["luck-hand"].zone, "attack");
  assert.equal(result.state.cards["luck-hand"].face, "up");
  assert.equal(result.state.cards["luck-hand"].active, true);
  assert.equal(result.state.cards["luck-hand"].paidCost, 0);
  assert.equal(result.state.players.a.mana, 5);
  assert.ok(result.events.some((event) => event.type === "card.played" && event.payload.instanceId === "luck-hand"));
});

test("closing Luminosité Eternelle immediately removes the granted Luck combat-play ability", () => {
  const { definitions, engine, state } = setup("jeanne-luck-grant-close");
  addLord(state);
  createOwnedCardInstance(state, "a", { instanceId: "luck-hand", definitionId: "card.cardluck", zone: "hand", face: "down", active: false });
  closePlayerCard(state, "j", "lord", definitions);
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "a";
  assert.throws(() => engine.execute(state, command(state, "luck-no-grant", CommandType.UseCardAbility, "a", {
    instanceId: "luck-hand",
    ability: "lord-luck-combat-play",
  })), /CARD_ABILITY_NOT_FOUND/);
});
