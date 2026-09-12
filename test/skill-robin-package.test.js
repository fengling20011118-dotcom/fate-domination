import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const FACELESS = "servant.robin.skill.sc-robin-2";

function setup() {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  return { built, definitions, engine: new StandardMatchEngine(built) };
}

function makeState(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "r", name: "Robin" }, { id: "o", name: "Opponent" }, { id: "x", name: "Third" }], seed: 7201 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "r";
  state.turnOrder = ["r", "o", "x"];
  state.players.r.servantId = "servant.robin";
  state.players.r.masterId = "master.rin";
  state.players.r.locationId = "mountain";
  state.players.r.mana = 7;
  state.players.r.trueNameRevealed = true;
  state.players.o.locationId = "mountain";
  state.players.x.locationId = "city";
  state.board.locations.mountain = ["r", "o"];
  state.board.locations.city = ["x"];
  createOwnedCardInstance(state, "r", { instanceId: "faceless", definitionId: FACELESS, zone: "servant-skills", face: "up", active: false });
  return state;
}

function command(state, id, type, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId: "r", expectedRevision: state.revision, type, payload };
}

function resolveMode(engine, state, mode) {
  assert.ok(state.pendingDecision);
  return engine.execute(state, command(state, `resolve-${mode}`, CommandType.ResolveDecision, {
    decisionId: state.pendingDecision.decisionId,
    selections: [mode],
  })).state;
}

function runCombatResolved(state, built, definitions, winnerIds) {
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  enqueuePassiveEffects(state, passives, {
    eventId: "evt:combat",
    sourceCommandId: "test",
    revision: state.revision,
    type: "combat.resolved",
    payload: { locationId: "mountain", winnerIds, powers: { r: 8, o: 5 } },
  });
  effects.drain(state, 1000, definitions);
}

test("Robin package: every skill is FULL after Faceless King review", () => {
  const { built } = setup();
  const ids = ["servant.robin.skill.sc-robin-1", FACELESS, "servant.robin.skill.sc-robin-3"];
  assert.ok(ids.every((id) => built.skills.get(id).supportLevel === "FULL"));
  const skill = built.skills.get(FACELESS);
  assert.equal(skill.requiresEightMana, false);
  assert.equal(skill.singleCardPlay, true);
  assert.deepEqual(skill.passiveEventTypes, ["card.played", "combat.resolved"]);
  assert.deepEqual(skill.rules?.ambiguities ?? [], []);
  assert.deepEqual(skill.rules?.unmodeledClauses ?? [], []);
});

test("Faceless King plays below eight mana, hides true name, and serializes its printed mode choice", () => {
  const { engine } = setup();
  const state = makeState("robin-choice");
  const result = engine.execute(state, command(state, "play-faceless", CommandType.CommitAttack, {
    faceUpInstanceIds: ["faceless"], faceDownInstanceIds: [],
  }));
  assert.equal(result.state.players.r.mana, 5);
  assert.equal(result.state.players.r.trueNameRevealed, false);
  assert.equal(result.state.cards.faceless.zone, "attack");
  assert.equal(result.state.pendingDecision?.kind, "structured-option-choice");
  assert.deepEqual(result.state.pendingDecision?.options.map((option) => option.id), ["move", "advantage"]);
});

test("Faceless King move mode moves exactly one arrow forward by effect", () => {
  const { engine } = setup();
  let state = makeState("robin-move");
  state = engine.execute(state, command(state, "play-faceless-move", CommandType.CommitAttack, { faceUpInstanceIds: ["faceless"], faceDownInstanceIds: [] })).state;
  state = resolveMode(engine, state, "move");
  assert.equal(state.players.r.flags.robinFacelessKingMode, "move");
  state.step = "player-window";
  state = engine.execute(state, command(state, "use-faceless-move", CommandType.UseSkill, {
    skillId: FACELESS, data: { abilityId: "faceless-king-move" },
  })).state;
  assert.equal(state.players.r.locationId, "city");
  assert.ok(state.board.locations.city.includes("r"));
  assert.equal(state.board.locations.mountain.includes("r"), false);
});

test("Faceless King advantage mode doubles current deployment advantage and grants two VP only on a win", () => {
  const { built, definitions, engine } = setup();
  let state = makeState("robin-advantage");
  state.players.r.flags.deploymentBonusActive = true;
  state.players.r.flags.deploymentBonus = 3;
  state = engine.execute(state, command(state, "play-faceless-adv", CommandType.CommitAttack, { faceUpInstanceIds: ["faceless"], faceDownInstanceIds: [] })).state;
  state = resolveMode(engine, state, "advantage");
  state.step = "player-window";
  state = engine.execute(state, command(state, "double-faceless-adv", CommandType.UseSkill, {
    skillId: FACELESS, data: { abilityId: "faceless-king-double-advantage" },
  })).state;
  assert.equal(state.players.r.flags.deploymentBonus, 6);
  const before = state.players.r.victoryPoints;
  state.phase = "combat";
  state.step = "settlement";
  runCombatResolved(state, built, definitions, ["r"]);
  assert.equal(state.players.r.victoryPoints, before + 2);

  const loss = structuredClone(state);
  loss.status = "playing";
  loss.players.r.victoryPoints = 0;
  runCombatResolved(loss, built, definitions, ["o"]);
  assert.equal(loss.players.r.victoryPoints, 0);
});
