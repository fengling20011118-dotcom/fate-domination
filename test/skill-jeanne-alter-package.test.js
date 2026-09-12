import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, closePlayerCard } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";

const DRAGON_WITCH = "servant.jeanne-alter.skill.sc-jeanne-alter-2";
const OBLIVION = "servant.jeanne-alter.skill.sc-jeanne-alter-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "jeanne-alter") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "j", name: "Jeanne Alter" }, { id: "o", name: "Opponent" }],
    seed: 2801,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "j";
  state.turnOrder = ["j", "o"];
  state.players.j.servantId = "servant.jeanne-alter";
  state.players.j.locationId = "workshop";
  state.players.o.locationId = "city";
  state.players.o.victoryPoints = 6;
  state.board.locations.workshop = ["j"];
  state.board.locations.mountain = [];
  state.board.locations.city = ["o"];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
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

test("Jeanne Alter package: all three skills are FULL", () => {
  const { built } = setup("jeanne-alter-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.jeanne-alter");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(DRAGON_WITCH).handlerId, "core.jeanne-alter-dragon-witch");
  assert.equal(built.skills.get(OBLIVION).handlerId, "core.jeanne-alter-oblivion-correction");
});

test("Dragon Witch grants Strength to owned Avenger cards only while the residual source is active", () => {
  const { definitions, state } = setup("jeanne-alter-attribute");
  createOwnedCardInstance(state, "j", { instanceId: "dragon-witch", definitionId: DRAGON_WITCH, zone: "attack", face: "up", active: true, residual: true });
  createOwnedCardInstance(state, "j", { instanceId: "avenger", definitionId: "card.card-avenger", zone: "hand" });
  const avenger = state.cards.avenger;
  assert.equal(getCardInstanceAttributes(avenger, definitions[avenger.definitionId], state, definitions).includes("力量"), true);
  closePlayerCard(state, "j", "dragon-witch", definitions);
  assert.equal(getCardInstanceAttributes(avenger, definitions[avenger.definitionId], state, definitions).includes("力量"), false);
});

test("Dragon Witch closes one Avenger, moves forward one or two arrows for free, then same-battlefield opponents lose 2 VP", () => {
  const { engine, state } = setup("jeanne-alter-march");
  createOwnedCardInstance(state, "j", { instanceId: "dragon-witch", definitionId: DRAGON_WITCH, zone: "attack", face: "up", active: true, residual: true });
  createOwnedCardInstance(state, "j", { instanceId: "avenger", definitionId: "card.card-avenger", zone: "attack", face: "up", active: true });

  let result = engine.execute(state, command(state, "jeanne-alter-march", CommandType.UseSkill, "j", {
    skillId: DRAGON_WITCH,
    data: { abilityId: "avenger-march" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "jeanne-alter-dragon-witch-march");
  assert.ok(result.state.pendingDecision.options.some((option) => option.id === "avenger::city"));

  result = engine.execute(result.state, command(result.state, "jeanne-alter-march-city", CommandType.ResolveDecision, "j", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["avenger::city"],
  }));
  assert.equal(result.state.players.j.locationId, "city");
  assert.equal(result.state.cards.avenger.zone, "attack");
  assert.equal(result.state.cards.avenger.face, "down");
  assert.equal(result.state.cards.avenger.active, false);
  assert.equal(result.state.players.o.victoryPoints, 4);
  assert.equal(result.state.players.j.flags.movementDistanceThisRound, 2);
});

test("Dragon Witch closes itself when Jeanne Alter loses a combat", () => {
  const { engine, definitions, state } = setup("jeanne-alter-loss");
  state.phase = "combat";
  state.players.j.locationId = "city";
  state.board.locations.workshop = [];
  state.board.locations.city = ["j", "o"];
  createOwnedCardInstance(state, "j", { instanceId: "dragon-witch", definitionId: DRAGON_WITCH, zone: "attack", face: "up", active: true, residual: true });
  emitPassive(engine, state, definitions, "combat.resolved", { locationId: "city", powers: { j: 4, o: 8 }, winnerIds: ["o"] });
  assert.equal(state.cards["dragon-witch"].zone, "servant-skills");
  assert.equal(state.cards["dragon-witch"].active, false);
});

test("Oblivion Correction reacts once to one-or-more face-up Luck entering attack: discard hand, draw 3, then join discarded Avengers", () => {
  const { engine, definitions, state } = setup("jeanne-alter-oblivion");
  createOwnedCardInstance(state, "j", { instanceId: "avenger-hand", definitionId: "card.card-avenger", zone: "hand" });
  createOwnedCardInstance(state, "j", { instanceId: "other-hand", definitionId: "card.cardb2", zone: "hand" });
  createOwnedCardInstance(state, "j", { instanceId: "draw-a", definitionId: "card.cardq1", zone: "deck" });
  createOwnedCardInstance(state, "j", { instanceId: "draw-b", definitionId: "card.cardq2", zone: "deck" });
  createOwnedCardInstance(state, "j", { instanceId: "draw-c", definitionId: "card.carda2", zone: "deck" });
  createOwnedCardInstance(state, "o", { instanceId: "luck-a", definitionId: "card.cardluck", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "luck-b", definitionId: "card.cardluck", zone: "attack", face: "up", active: true });

  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:luck-a`, sourceCommandId: "same-batch", revision: state.revision,
    type: "card.entered-attack", payload: { instanceId: "luck-a", definitionId: "card.cardluck", ownerPlayerId: "o", fromZone: "hand", toZone: "attack", face: "up", active: true },
  });
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:luck-b`, sourceCommandId: "same-batch", revision: state.revision,
    type: "card.entered-attack", payload: { instanceId: "luck-b", definitionId: "card.cardluck", ownerPlayerId: "o", fromZone: "hand", toZone: "attack", face: "up", active: true },
  });
  engine.effects.drain(state, 1000, definitions);

  assert.equal(state.cards["avenger-hand"].zone, "attack");
  assert.equal(state.cards["avenger-hand"].active, true);
  assert.equal(state.cards["other-hand"].zone, "discard");
  assert.equal(state.players.j.hand.length, 3);
  assert.deepEqual(new Set(state.players.j.hand), new Set(["draw-a", "draw-b", "draw-c"]));
});
