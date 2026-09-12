import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { movePlayer, movePlayerByEffect } from "../src/rules-core/board.ts";

const BEAST = "servant.ivan.skill.sc-ivan-2";

function setup(id = "ivan") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "i", name: "Ivan" }, { id: "o", name: "Opponent" }, { id: "x", name: "Third" }],
    seed: 9401,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "i";
  state.turnOrder = ["i", "o", "x"];
  state.players.i.servantId = "servant.ivan";
  state.players.i.locationId = "city";
  state.players.o.locationId = "city";
  state.players.x.locationId = "mountain";
  state.board.locations.city = ["i", "o"];
  state.board.locations.mountain = ["x"];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function command(state, id, actorId, type, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function passiveRuntime(built, definitions) {
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  return { passives, effects };
}

test("Ivan package: all three skills are FULL", () => {
  const { built } = setup("ivan-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.ivan");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  const beast = built.skills.get(BEAST);
  assert.equal(beast.handlerId, "core.ivan-beast-form");
  assert.deepEqual(beast.passiveEventTypes, ["game.started", "player.victory-points.changed"]);
  assert.deepEqual(beast.abilities?.map((ability) => ability.id), ["beast-form-move"]);
  assert.deepEqual(beast.rules?.ambiguities ?? [], []);
  assert.deepEqual(beast.rules?.unmodeledClauses ?? [], []);
});

test("Beast Form permanently prevents Ivan from moving or being moved", () => {
  const { built, definitions, state } = setup("ivan-immovable");
  const { passives, effects } = passiveRuntime(built, definitions);
  enqueuePassiveEffects(state, passives, { eventId: "start", sourceCommandId: "test", revision: 0, type: "game.started", payload: { round: 5 } });
  effects.drain(state, 1000, definitions);
  assert.equal(state.players.i.flags.movementBlockedPermanent, true);

  state.step = "move-decision";
  assert.throws(() => movePlayer(state, "i", "scouting", false, definitions), /PLAYER_MOVEMENT_BLOCKED/);
  assert.throws(() => movePlayerByEffect(state, "i", "mountain", definitions), /PLAYER_MOVEMENT_BLOCKED/);
});

test("Displayed Beast Form halves same-location opponent victory-point gains, rounding up", () => {
  const { built, definitions, state } = setup("ivan-half-vp");
  const { passives, effects } = passiveRuntime(built, definitions);
  createOwnedCardInstance(state, "i", { instanceId: "beast", definitionId: BEAST, zone: "servant-skills", face: "up", active: false });
  state.players.o.victoryPoints = 5;
  enqueuePassiveEffects(state, passives, {
    eventId: "vp+5",
    sourceCommandId: "test",
    revision: 0,
    type: "player.victory-points.changed",
    payload: { playerId: "o", round: 5, before: 0, after: 5, delta: 5, sourceId: "test" },
  });
  effects.drain(state, 1000, definitions);
  assert.equal(state.players.o.victoryPoints, 3);

  state.cards.beast.face = "down";
  state.players.o.victoryPoints = 7;
  enqueuePassiveEffects(state, passives, {
    eventId: "vp+4-hidden",
    sourceCommandId: "test",
    revision: 0,
    type: "player.victory-points.changed",
    payload: { playerId: "o", round: 5, before: 3, after: 7, delta: 4, sourceId: "test" },
  });
  effects.drain(state, 1000, definitions);
  assert.equal(state.players.o.victoryPoints, 7);
});

test("Beast Form action lets Ivan choose one engaged opponent, moves them to scouting, and grants round-number total power", () => {
  const { engine, state } = setup("ivan-move");
  let result = engine.execute(state, command(state, "use-beast", "i", CommandType.UseSkill, {
    skillId: BEAST,
    data: { abilityId: "beast-form-move" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "ivan-beast-form-move-opponent");
  assert.deepEqual(result.state.pendingDecision?.chooserPlayerIds, ["i"]);
  assert.deepEqual(result.state.pendingDecision?.options.map((option) => option.id), ["o"]);

  result = engine.execute(result.state, command(result.state, "choose-o", "i", CommandType.ResolveDecision, {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["o"],
  }));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.players.o.locationId, "scouting");
  assert.deepEqual(result.state.board.locations.scouting, ["o"]);
  assert.equal(result.state.players.i.flags.roundPowerBonus, 5);
});
