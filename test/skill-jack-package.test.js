import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getPrivateEventKnowledge } from "../src/rules-core/event-lifecycle.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { projectPublicState } from "../src/projection/project-state.ts";
import { JACK_DISSOCIATION_ID, JACK_MARIA_ID, JACK_MIST_ID } from "../src/rules-core/jack.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "jack-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "j", name: "Jack" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    seed: 1888,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "j";
  state.turnOrder = ["j", "a", "b"];
  state.players.j.servantId = "servant.jack";
  state.players.a.servantId = "servant.saber";
  state.players.b.servantId = "servant.cu";
  for (const player of Object.values(state.players)) {
    player.mana = 20;
    player.commandSeals = 3;
  }
  state.players.j.locationId = "mountain";
  state.players.a.locationId = "mountain";
  state.players.b.locationId = "city";
  state.board.locations.mountain = ["j", "a"];
  state.board.locations.city = ["b"];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function addSkill(state, instanceId, definitionId, zone = "servant-skills", face = "down", active = false) {
  createOwnedCardInstance(state, "j", { instanceId, definitionId, zone, face, active });
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload) {
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${++passiveCounter}`,
    sourceCommandId: "jack-test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

function useSkill(engine, state, commandId, skillId, abilityId) {
  return engine.execute(state, command(state, commandId, CommandType.UseSkill, "j", { skillId, data: { abilityId } }));
}

test("Jack package is 3/3 FULL with executable handlers and no unresolved clauses", () => {
  const { built } = setup("jack-full");
  const skills = [JACK_DISSOCIATION_ID, JACK_MIST_ID, JACK_MARIA_ID].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.unmodeledClauses ?? []), []);
});

test("Dissociation tracks the latest revealed enemy as Mother, gains mana or moves to her, and clears after Jack beats her", () => {
  const { engine, definitions, state } = setup("jack-mother");
  addSkill(state, "dissociation", JACK_DISSOCIATION_ID);

  emitPassive(engine, state, definitions, "servant.true-name-revealed", { playerId: "a", servantId: "servant.saber" });
  assert.equal(state.players.j.flags.jackMotherPlayerId, "a");
  assert.equal(state.cards.dissociation.face, "up");

  const manaBefore = state.players.j.mana;
  let result = useSkill(engine, state, "mother-mana", JACK_DISSOCIATION_ID, "mother-action");
  assert.equal(result.state.players.j.mana, manaBefore + 2);

  result.state.round = 5;
  result.state.phase = "action";
  result.state.step = "player-window";
  result.state.activePlayerId = "j";
  result.state.players.a.locationId = "city";
  result.state.board.locations.mountain = ["j"];
  result.state.board.locations.city = ["a", "b"];
  result = useSkill(engine, result.state, "mother-move", JACK_DISSOCIATION_ID, "mother-action");
  assert.equal(result.state.players.j.locationId, "city");

  emitPassive(engine, result.state, definitions, "combat.resolved", {
    locationId: "city", participantIds: ["j", "a", "b"], powers: { j: 9, a: 3, b: 1 }, winnerIds: ["j"],
  });
  assert.equal(result.state.players.j.flags.jackMotherPlayerId, undefined);

  emitPassive(engine, result.state, definitions, "servant.true-name-revealed", { playerId: "b", servantId: "servant.cu" });
  assert.equal(result.state.players.j.flags.jackMotherPlayerId, "b");
});

test("The Mist drains mana, privately hides face-up Miyama objectives until Combat, and Workshop deployment closes it and hides Jack", () => {
  const { engine, definitions, state } = setup("jack-mist");
  addSkill(state, "mist", JACK_MIST_ID, "attack", "up", true);
  state.phase = "preparation";
  state.activePlayerId = "j";
  state.board.currentEvents.mountain = ["event.fuyuki.1"];
  state.board.eventVisibility["event.fuyuki.1"] = "up";
  const before = state.players.j.mana;

  emitPassive(engine, state, definitions, "round.started", { round: 4 });
  assert.equal(state.players.j.mana, before - 1);
  assert.equal(state.board.eventVisibility["event.fuyuki.1"], "down");
  assert.deepEqual(getPrivateEventKnowledge(state, "j", "mountain"), ["event.fuyuki.1"]);
  const jackView = projectPublicState(state, "j");
  const opponentView = projectPublicState(state, "a");
  assert.deepEqual(jackView.modeState.privateEventKnowledge, { j: { mountain: ["event.fuyuki.1"] } });
  assert.deepEqual(opponentView.modeState.privateEventKnowledge, {});
  assert.deepEqual(jackView.board.currentEvents.mountain, ["event:hidden"]);

  state.phase = "combat";
  emitPassive(engine, state, definitions, "phase.transitioned", { previousPhase: "action", transition: "next-phase" });
  assert.equal(state.board.eventVisibility["event.fuyuki.1"], "up");
  assert.deepEqual(getPrivateEventKnowledge(state, "j", "mountain"), []);

  state.phase = "outpost";
  state.players.j.trueNameRevealed = true;
  state.players.j.locationId = "workshop";
  state.board.locations.mountain = ["a"];
  state.board.locations.workshop = ["j"];
  const beforeWorkshop = state.players.j.mana;
  emitPassive(engine, state, definitions, "player.deployed", { playerId: "j", locationId: "workshop" });
  assert.equal(state.players.j.mana, beforeWorkshop - 3);
  assert.equal(state.players.j.trueNameRevealed, false);
  assert.equal(state.cards.mist.active, false);
  assert.equal(state.cards.mist.zone, "servant-skills");
});

test("Maria records hidden-name-at-play before reveal; with Mist inactive it gains +3 without defeat", () => {
  const { engine, definitions, state } = setup("jack-maria-hidden");
  addSkill(state, "maria", JACK_MARIA_ID, "servant-skills", "up", false);
  createOwnedCardInstance(state, "j", { instanceId: "basic", definitionId: "card.cardq1", zone: "hand", face: "down", active: false });
  state.step = "play-batch-draft";
  state.players.j.trueNameRevealed = false;

  let result = engine.execute(state, command(state, "maria-play-hidden", CommandType.CommitAttack, "j", {
    faceUpInstanceIds: ["maria", "basic"], faceDownInstanceIds: [],
  }));
  assert.equal(result.state.players.j.trueNameRevealed, true);
  const base = calculateCombatCardPower(result.state, result.state.players.j, "maria", definitions, "mountain");
  result.state.phase = "combat";
  result.state.step = "player-window";
  result.state.activePlayerId = "j";
  result = useSkill(engine, result.state, "maria-combat-hidden", JACK_MARIA_ID, "maria-combat");
  assert.equal(calculateCombatCardPower(result.state, result.state.players.j, "maria", definitions, "mountain"), base + 3);
  assert.equal(result.state.players.a.defeated, false);
});

test("Maria with both Mist active and hidden-on-play gains +3 and defeats exactly the chosen engaged opponent", () => {
  const { engine, definitions, state } = setup("jack-maria-both");
  addSkill(state, "mist", JACK_MIST_ID, "attack", "up", true);
  addSkill(state, "maria", JACK_MARIA_ID, "servant-skills", "up", false);
  createOwnedCardInstance(state, "j", { instanceId: "basic", definitionId: "card.cardq1", zone: "hand", face: "down", active: false });
  state.players.b.locationId = "mountain";
  state.board.locations.mountain = ["j", "a", "b"];
  state.board.locations.city = [];
  state.step = "play-batch-draft";
  state.players.j.trueNameRevealed = false;

  let result = engine.execute(state, command(state, "maria-play-both", CommandType.CommitAttack, "j", {
    faceUpInstanceIds: ["maria", "basic"], faceDownInstanceIds: [],
  }));
  const base = calculateCombatCardPower(result.state, result.state.players.j, "maria", definitions, "mountain");
  result.state.phase = "combat";
  result.state.step = "player-window";
  result.state.activePlayerId = "j";
  result = useSkill(engine, result.state, "maria-combat-both", JACK_MARIA_ID, "maria-combat");
  assert.equal(result.state.pendingDecision?.kind, "jack-maria-target");
  assert.deepEqual(new Set(result.state.pendingDecision.options.map((option) => option.id)), new Set(["a", "b"]));
  assert.equal(calculateCombatCardPower(result.state, result.state.players.j, "maria", definitions, "mountain"), base + 3);

  result = engine.execute(result.state, command(result.state, "maria-target", CommandType.ResolveDecision, "j", {
    decisionId: result.state.pendingDecision.decisionId, selections: ["b"],
  }));
  assert.equal(result.state.players.a.defeated, false);
  assert.equal(result.state.players.b.defeated, true);
});
