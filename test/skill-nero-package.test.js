import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";

const EMPEROR = "servant.nero.skill.sc-nero-3";

function setup() {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = {
    ...built.cards,
    ...Object.fromEntries(built.events.map((event) => [event.id, event])),
    ...built.skills.asCardDefinitions(),
  };
  return { built, engine, definitions };
}

function preparationState(id = "nero-emperor") {
  const state = createGameState({
    gameInstanceId: id,
    players: [
      { id: "a", name: "A" },
      { id: "nero", name: "Nero" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ],
    seed: 5101,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "preparation";
  state.step = "player-window";
  state.turnOrder = ["a", "nero", "b", "c"];
  state.activePlayerId = "nero";
  state.modeState.phaseStartPlayerId = "a";
  state.players.nero.servantId = "servant.nero";
  state.players.nero.mana = 5;
  return state;
}

function command(state, commandId, actorId, type, payload = {}) {
  return {
    commandId,
    gameInstanceId: state.gameInstanceId,
    actorId,
    expectedRevision: state.revision,
    type,
    payload,
  };
}

function resolveEmperorChoice(engine, state, position) {
  let result = engine.execute(state, command(state, `${state.gameInstanceId}:use`, "nero", CommandType.UseSkill, { skillId: EMPEROR }));
  assert.equal(result.state.players.nero.mana, 3);
  assert.deepEqual(result.state.turnOrder, ["a", "nero", "b", "c"]);
  const decision = result.state.pendingDecision;
  assert.ok(decision);
  assert.equal(decision.kind, "nero-emperor-privilege-position");
  assert.deepEqual(decision.options.map((option) => option.id), ["first", "last"]);
  assert.equal(decision.allowCancel, false);
  result = engine.execute(result.state, command(result.state, `${state.gameInstanceId}:choice`, "nero", CommandType.ResolveDecision, {
    decisionId: decision.decisionId,
    selections: [position],
  }));
  assert.equal(result.state.pendingDecision, null);
  assert.deepEqual(result.state.turnOrder, ["a", "nero", "b", "c"]);
  return result.state;
}

function finishPreparation(engine, state) {
  let result = engine.execute(state, command(state, `${state.gameInstanceId}:nero-done`, "nero", CommandType.CompletePlayerWindow));
  assert.equal(result.state.activePlayerId, "b");
  result = engine.execute(result.state, command(result.state, `${state.gameInstanceId}:b-done`, "b", CommandType.CompletePlayerWindow));
  assert.equal(result.state.activePlayerId, "c");
  result = engine.execute(result.state, command(result.state, `${state.gameInstanceId}:c-done`, "c", CommandType.CompletePlayerWindow));
  assert.equal(result.state.phase, "outpost");
  return result.state;
}

test("Nero package: all three reviewed skills are FULL with authoritative evidence", () => {
  const { built } = setup();
  const skills = [1, 2, 3].map((index) => built.skills.get(`servant.nero.skill.sc-nero-${index}`));
  assert.deepEqual(skills.map((skill) => skill.supportLevel), ["FULL", "FULL", "FULL"]);
  assert.equal(skills[0].handlerId, "core.structured-skill");
  assert.equal(skills[1].handlerId, "core.structured-skill");
  assert.equal(skills[2].handlerId, "core.nero-emperor-privilege");
  assert.equal(skills[2].abilityCost, 2);
  assert.deepEqual(skills[2].windows, ["preparation"]);
  for (const skill of skills) {
    assert.ok(skill.sourceRefs.some((source) => source.kind === "development-image"));
    if (skill.rules) {
      assert.deepEqual(skill.rules.ambiguities ?? [], []);
      assert.deepEqual(skill.rules.unmodeledClauses ?? [], []);
    }
  }
});

test("Nero Emperor Privilege: choosing first waits until preparation fully ends, then moves only Nero to first", () => {
  const { engine } = setup();
  let state = resolveEmperorChoice(engine, preparationState("nero-first"), "first");
  assert.equal(state.players.nero.usage[EMPEROR].round, 3);
  state = finishPreparation(engine, state);
  assert.deepEqual(state.turnOrder, ["nero", "a", "b", "c"]);
  assert.equal(state.activePlayerId, "nero");
  assert.deepEqual(state.turnOrder.filter((id) => id !== "nero"), ["a", "b", "c"]);
});

test("Nero Emperor Privilege: choosing last preserves every other player's relative order", () => {
  const { engine } = setup();
  let state = resolveEmperorChoice(engine, preparationState("nero-last"), "last");
  state = finishPreparation(engine, state);
  assert.deepEqual(state.turnOrder, ["a", "b", "c", "nero"]);
  assert.equal(state.activePlayerId, "a");
  assert.deepEqual(state.turnOrder.filter((id) => id !== "nero"), ["a", "b", "c"]);
});

test("Nero Emperor Privilege: the override lasts only this round and normal next-round rotation uses the original order", () => {
  const { engine, definitions } = setup();
  let state = resolveEmperorChoice(engine, preparationState("nero-restore"), "first");
  state = finishPreparation(engine, state);
  assert.deepEqual(state.turnOrder, ["nero", "a", "b", "c"]);
  endStandardRound(state, definitions);
  assert.deepEqual(state.turnOrder, ["nero", "b", "c", "a"]);
  assert.equal(Object.prototype.hasOwnProperty.call(state.modeState, "roundTurnOrderOverride"), false);
});

test("Nero Emperor Privilege: insufficient mana hides the action and execution is rejected atomically", () => {
  const { engine } = setup();
  const state = preparationState("nero-no-mana");
  state.players.nero.mana = 1;
  assert.equal(engine.getLegalActions(state, "nero").some((action) => action.payload?.skillId === EMPEROR), false);
  assert.throws(
    () => engine.execute(state, command(state, "nero-no-mana:use", "nero", CommandType.UseSkill, { skillId: EMPEROR })),
    /SKILL_USE_FORBIDDEN/,
  );
  assert.equal(state.players.nero.mana, 1);
  assert.equal(state.pendingDecision, null);
});
