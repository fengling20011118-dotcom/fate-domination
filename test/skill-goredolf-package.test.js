import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { deployPlayer, movePlayer, movePlayerByEffect } from "../src/rules-core/board.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const RESOLVE = "master.goredolf.skill.s1a";
const ASCENSION = "master.goredolf.skill.ascension";

function setup(id = "goredolf") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "g", name: "Goredolf" }, { id: "o", name: "Opponent" }, { id: "x", name: "Third" }],
    seed: 8801,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "g";
  state.turnOrder = ["g", "o", "x"];
  state.players.g.masterId = "master.goredolf";
  state.players.g.victoryPoints = 6;
  state.players.g.mana = 6;
  state.players.o.victoryPoints = 6;
  state.players.x.victoryPoints = 6;
  createOwnedCardInstance(state, "g", { instanceId: "resolve", definitionId: RESOLVE, zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(state, "g", { instanceId: "asc", definitionId: ASCENSION, zone: "master-skills", face: "up", active: true });
  return { built, definitions, engine, state };
}

function command(state, id, type, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId: "g", expectedRevision: state.revision, type, payload };
}

function runCombatResolved(state, built, definitions, winnerIds, defeatedPlayerIds = []) {
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  enqueuePassiveEffects(state, passives, {
    eventId: `evt:combat:${winnerIds.join("-")}`,
    sourceCommandId: "test",
    revision: state.revision,
    type: "combat.resolved",
    payload: {
      locationId: "mountain",
      winnerIds,
      defeatedPlayerIds,
      powers: { g: 8, o: 5, x: 4 },
    },
  });
  effects.drain(state, 1000, definitions);
}

test("Goredolf package: all three skills are FULL", () => {
  const { built } = setup("goredolf-full");
  const ids = ["master.goredolf.skill.s1", RESOLVE, ASCENSION];
  assert.ok(ids.every((id) => built.skills.get(id).supportLevel === "FULL"));
  for (const id of [RESOLVE, ASCENSION]) {
    const skill = built.skills.get(id);
    assert.deepEqual(skill.rules?.ambiguities ?? [], []);
    assert.deepEqual(skill.rules?.unmodeledClauses ?? [], []);
  }
});

test("Foolish Resolve grants +2 power, forces battlefield deployment, and blocks movement this round", () => {
  const { definitions, engine, state } = setup("goredolf-resolve");
  let result = engine.execute(state, command(state, "use-resolve", CommandType.UseSkill, {
    skillId: RESOLVE,
    data: { abilityId: "foolish-resolve-use" },
  })).state;
  assert.equal(result.players.g.flags.roundPowerBonus, 2);
  assert.equal(result.players.g.flags.goredolfFoolishResolveRound, 4);
  assert.equal(result.players.g.flags.mustDeployBattlefieldRound, 4);
  assert.equal(result.players.g.flags.movementBlockedRound, 4);

  assert.throws(() => deployPlayer(result, "g", "workshop", definitions), /DEPLOYMENT_BATTLEFIELD_REQUIRED_THIS_ROUND/);
  assert.doesNotThrow(() => deployPlayer(result, "g", "mountain", definitions));
  result.phase = "action";
  result.step = "move-decision";
  result.activePlayerId = "g";
  assert.throws(() => movePlayer(result, "g", "city", undefined, definitions), /PLAYER_MOVEMENT_BLOCKED/);
});

test("Foolish Resolve costs 2 VP when Goredolf loses combat that round", () => {
  const { built, definitions, engine, state } = setup("goredolf-loss");
  const result = engine.execute(state, command(state, "use-resolve-loss", CommandType.UseSkill, {
    skillId: RESOLVE,
    data: { abilityId: "foolish-resolve-use" },
  })).state;
  result.players.g.locationId = "mountain";
  result.players.o.locationId = "mountain";
  result.board.locations.mountain = ["g", "o"];
  const before = result.players.g.victoryPoints;
  runCombatResolved(result, built, definitions, ["o"], ["g"]);
  assert.equal(result.players.g.victoryPoints, before - 2);
});

test("Ascension gives Gof Fist +6 printed combat power", () => {
  const { definitions, state } = setup("goredolf-fist");
  state.players.g.locationId = "mountain";
  state.board.locations.mountain = ["g"];
  createOwnedCardInstance(state, "g", { instanceId: "fist", definitionId: "card.card-gof-fist", zone: "attack", face: "up", active: true });
  const base = definitions["card.card-gof-fist"].basePower;
  assert.equal(calculateCombatCardPower(state, state.players.g, "fist", definitions, "mountain"), base + 6);
});

test("Ascension makes every combat loser lose 2 VP after Foolish Resolve win", () => {
  const { built, definitions, state } = setup("goredolf-win");
  state.players.g.flags.goredolfFoolishResolveRound = state.round;
  state.players.g.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.x.locationId = "mountain";
  state.board.locations.mountain = ["g", "o", "x"];
  const beforeO = state.players.o.victoryPoints;
  const beforeX = state.players.x.victoryPoints;
  runCombatResolved(state, built, definitions, ["g"], ["o", "x"]);
  assert.equal(state.players.o.victoryPoints, beforeO - 2);
  assert.equal(state.players.x.victoryPoints, beforeX - 2);
});

test("Goredolf package: combat-play-from-hand executes Gof Fist from hand", () => {
  const { engine, state } = setup("goredolf-fist-hand-play");
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "g";
  state.players.g.locationId = "mountain";
  state.board.locations.mountain = ["g"];
  createOwnedCardInstance(state, "g", { instanceId: "fist-hand", definitionId: "card.card-gof-fist", zone: "hand", face: "down", active: false });
  const result = engine.execute(state, command(state, "play-fist-from-hand", CommandType.UseCardAbility, {
    instanceId: "fist-hand",
    ability: "basic.combat-play-from-hand",
  }));
  assert.equal(result.state.cards["fist-hand"].zone, "attack");
  assert.equal(result.state.cards["fist-hand"].face, "up");
  assert.equal(result.state.cards["fist-hand"].active, true);
  assert.equal(result.state.cards["fist-hand"].paidCost, 0);
  assert.ok(result.events.some((event) => event.type === "card.played" && event.payload?.instanceId === "fist-hand"));
});