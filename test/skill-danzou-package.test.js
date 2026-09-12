import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { getPrintedCardBasePower } from "../src/rules-core/card-values.ts";

const MECHANICAL = "servant.danzou.skill.sc-danzou-1";
const SYNTHETIC = "servant.danzou.skill.sc-danzou-2";
const ASSASSIN = "servant.danzou.skill.sc-danzou-3";

function command(state, commandId, type, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId: "d", expectedRevision: state.revision, type, payload };
}

function setup(id = "danzou-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "d", name: "Danzou" }, { id: "low", name: "Low" }, { id: "high", name: "High" }],
    seed: 6901,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "d";
  state.turnOrder = ["d", "low", "high"];
  state.players.d.servantId = "servant.danzou";
  state.players.d.locationId = "mountain";
  state.players.low.locationId = "mountain";
  state.players.high.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["d", "low", "high"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  state.players.d.mana = 12;
  return { built, definitions, engine, state };
}

function addDanzouSkill(state, instanceId, definitionId, zone = "servant-skills", face = "down", active = false) {
  createOwnedCardInstance(state, "d", { instanceId, definitionId, zone, face, active });
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload) {
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${++passiveCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Danzou package: all three skills are FULL with concrete handlers", () => {
  const { built } = setup("danzou-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.danzou");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(MECHANICAL).handlerId, "core.danzou-mechanical-illusion");
  assert.equal(built.skills.get(SYNTHETIC).handlerId, "core.danzou-synthetic-limbs");
  assert.equal(built.skills.get(ASSASSIN).handlerId, "core.presence-concealment");
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("Vacuum Blade stores discarded printed base-power sum and only defeats an engaged opponent with no attack above it", () => {
  const { definitions, engine, state } = setup("danzou-vacuum");
  addDanzouSkill(state, "mechanical", MECHANICAL, "attack", "up", true);
  createOwnedCardInstance(state, "d", { instanceId: "h1", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "d", { instanceId: "h2", definitionId: "card.cardq2", zone: "hand", face: "down", active: false });
  const expected = getPrintedCardBasePower(state, state.players.d, definitions["card.cardb1"])
    + getPrintedCardBasePower(state, state.players.d, definitions["card.cardq2"]);
  createOwnedCardInstance(state, "low", { instanceId: "low-card", definitionId: "card.cardb1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "high", { instanceId: "high-card", definitionId: "card.cardq5", zone: "attack", face: "up", active: true });

  let result = engine.execute(state, command(state, "vacuum-discard", CommandType.UseSkill, {
    skillId: MECHANICAL,
    data: { abilityId: "vacuum-blade-discard" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "danzou-vacuum-discard");
  result = engine.execute(result.state, command(result.state, "vacuum-pick-discard", CommandType.ResolveDecision, {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["h1", "h2"],
  }));
  assert.equal(result.state.players.d.flags.danzouVacuumBasePowerSum, expected);
  assert.equal(result.state.cards.h1.zone, "discard");
  assert.equal(result.state.cards.h2.zone, "discard");

  result.state.phase = "combat";
  result.state.step = "player-window";
  result.state.activePlayerId = "d";
  result = engine.execute(result.state, command(result.state, "vacuum-defeat", CommandType.UseSkill, {
    skillId: MECHANICAL,
    data: { abilityId: "vacuum-blade-defeat" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "danzou-vacuum-target");
  const optionIds = result.state.pendingDecision.options.map((option) => option.id);
  assert.ok(optionIds.includes("low"));
  assert.ok(!optionIds.includes("high"));
  result = engine.execute(result.state, command(result.state, "vacuum-target", CommandType.ResolveDecision, {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["low"],
  }));
  assert.equal(result.state.players.low.defeated, true);
  assert.equal(result.state.players.high.defeated, false);
});

test("Overclock reveals a hidden true name and can append any number of Danzou skills below the normal 8-mana gate while paying their costs", () => {
  const { engine, state } = setup("danzou-overclock");
  addDanzouSkill(state, "synthetic", SYNTHETIC);
  addDanzouSkill(state, "mechanical", MECHANICAL);
  addDanzouSkill(state, "assassin", ASSASSIN);
  state.players.d.trueNameRevealed = false;
  state.players.d.mana = 7;

  let result = engine.execute(state, command(state, "overclock", CommandType.UseSkill, {
    skillId: SYNTHETIC,
    data: { abilityId: "overclock" },
  }));
  assert.equal(result.state.players.d.trueNameRevealed, true);
  assert.equal(result.state.pendingDecision?.kind, "danzou-overclock-append");
  result = engine.execute(result.state, command(result.state, "overclock-pick", CommandType.ResolveDecision, {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["mechanical", "assassin"],
  }));
  assert.equal(result.state.players.d.mana, 0);
  assert.equal(result.state.cards.mechanical.zone, "attack");
  assert.equal(result.state.cards.assassin.zone, "attack");
  assert.equal(result.state.cards.mechanical.paidCost, 4);
  assert.equal(result.state.cards.assassin.paidCost, 3);
  assert.ok(result.events.some((event) => event.type === "card.played" && event.payload.instanceId === "mechanical"));
  assert.ok(result.events.some((event) => event.type === "card.played" && event.payload.instanceId === "assassin"));
});

test("Overclock does not offer appended skills when the true name was already revealed before activation", () => {
  const { engine, state } = setup("danzou-overclock-already-revealed");
  addDanzouSkill(state, "synthetic", SYNTHETIC);
  addDanzouSkill(state, "mechanical", MECHANICAL);
  state.players.d.trueNameRevealed = true;
  state.players.d.mana = 12;
  const result = engine.execute(state, command(state, "overclock-visible", CommandType.UseSkill, {
    skillId: SYNTHETIC,
    data: { abilityId: "overclock" },
  }));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.cards.mechanical.zone, "servant-skills");
});

test("Tactical Reconstruction arms in combat, then on a win hides the true name and draws four", () => {
  const { definitions, engine, state } = setup("danzou-reconstruction");
  addDanzouSkill(state, "synthetic", SYNTHETIC, "attack", "up", true);
  for (let index = 0; index < 4; index += 1) {
    createOwnedCardInstance(state, "d", { instanceId: `deck-${index}`, definitionId: "card.cardb1", zone: "deck", face: "down", active: false });
  }
  state.players.d.trueNameRevealed = true;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "d";
  let result = engine.execute(state, command(state, "reconstruct", CommandType.UseSkill, {
    skillId: SYNTHETIC,
    data: { abilityId: "tactical-reconstruction" },
  }));
  assert.equal(result.state.players.d.flags.danzouTacticalReconstructionRound, 4);
  emitPassive(engine, result.state, definitions, "combat.resolved", {
    locationId: "mountain",
    powers: { d: 10, low: 4, high: 3 },
    winnerIds: ["d"],
  });
  assert.equal(result.state.players.d.trueNameRevealed, false);
  assert.equal(result.state.players.d.hand.length, 4);
  assert.equal(result.state.players.d.flags.danzouTacticalReconstructionRound, undefined);
});
