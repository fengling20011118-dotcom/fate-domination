import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createEvent } from "../src/match-engine/events.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { createOwnedCardInstance, restoreSequesteredCardsOnPlayerElimination } from "../src/rules-core/decks.ts";
import { applyClimaxElimination } from "../src/rules-core/rounds.ts";

const YELLOW = "servant.diarmuid.skill.sc-diarmuid-1";
const RED = "servant.diarmuid.skill.sc-diarmuid-2";
const CONTINUATION = "servant.diarmuid.skill.sc-diarmuid-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setupBuilt() {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  return { built, engine, definitions };
}

function addSkill(state, playerId, instanceId, definitionId, zone = "servant-skills", active = false) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face: "up",
    active,
    residual: false,
  });
}

function combatState(id, extraPlayers = []) {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "diarmuid", name: "Diarmuid" }, { id: "target", name: "Target" }, ...extraPlayers],
    seed: 2601,
  });
  state.status = "playing";
  state.round = 6;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "diarmuid";
  state.players.diarmuid.servantId = "servant.diarmuid";
  state.players.diarmuid.locationId = "mountain";
  state.players.target.locationId = "mountain";
  state.board.locations.mountain = ["diarmuid", "target"];
  return state;
}

function armYellowRose(engine, state) {
  addSkill(state, "diarmuid", "yellow-rose", YELLOW, "attack", true);
  return engine.execute(state, command(state, "yellow-arm", CommandType.UseSkill, "diarmuid", {
    skillId: YELLOW,
    data: { abilityId: "yellow-rose-arm" },
  })).state;
}

function resolveCombatPassive(engine, state, payload) {
  const event = createEvent(state, "yellow-combat", 0, "combat.resolved", payload);
  enqueuePassiveEffects(state, engine.passives, event);
  engine.effects.drain(state, 1000, engine.cardDefinitions());
}

test("Diarmuid package: all three official skills are FULL with reviewed card fields", () => {
  const { built } = setupBuilt();
  const yellow = built.skills.get(YELLOW);
  const red = built.skills.get(RED);
  const continuation = built.skills.get(CONTINUATION);

  assert.equal(yellow.supportLevel, "FULL");
  assert.equal(yellow.handlerId, "core.structured-skill");
  assert.equal(yellow.cost, 8);
  assert.equal(yellow.basePower, 9);
  assert.equal(yellow.requirement, 8);
  assert.equal(yellow.typeLabel, "迅捷/宝具");
  assert.deepEqual(yellow.attributes, ["迅捷", "宝具"]);
  assert.deepEqual(yellow.rules.abilities.map((ability) => ability.id), ["yellow-rose-arm", "yellow-rose-sequester-on-win"]);
  const passive = yellow.rules.abilities.find((ability) => ability.id === "yellow-rose-sequester-on-win");
  assert.equal(passive.effects[0].type, "sequester_random_inactive_servant_skill");
  assert.deepEqual(passive.effects[0].target, { scope: "event_defeated_players" });
  assert.equal(passive.effects[0].returnOn, "controller_elimination");

  assert.equal(red.supportLevel, "FULL");
  assert.equal(red.handlerId, "core.diarmuid-red-rose");
  assert.deepEqual(red.abilities.map((ability) => ability.id), ["add-yellow-rose", "zero-noble-phantasm"]);

  assert.equal(continuation.supportLevel, "FULL");
  assert.equal(continuation.handlerId, "core.move-to-non-workshop");
  assert.deepEqual(continuation.windows, ["action"]);
  assert.equal(continuation.requiresActiveCard, true);
});

test("Diarmuid package: Yellow Rose removes exactly one inactive servant skill from each player defeated by that combat", () => {
  const { engine } = setupBuilt();
  let state = combatState("diarmuid-yellow-defeated", [{ id: "loser", name: "Loser" }]);
  state.players.loser.locationId = "mountain";
  state.board.locations.mountain.push("loser");

  addSkill(state, "target", "target-inactive-a", "servant.target.skill.a");
  addSkill(state, "target", "target-inactive-b", "servant.target.skill.b");
  addSkill(state, "target", "target-active", "servant.target.skill.active", "attack", true);
  addSkill(state, "target", "target-master", "master.target.skill", "master-skills", false);
  addSkill(state, "loser", "loser-inactive", "servant.loser.skill.a");

  state = armYellowRose(engine, state);
  assert.equal(state.players.diarmuid.flags.yellowRoseArmedRound, state.round);
  assert.equal(state.players.diarmuid.trueNameRevealed, true);

  resolveCombatPassive(engine, state, {
    locationId: "mountain",
    winnerIds: ["diarmuid"],
    defeatedPlayerIds: ["target"],
    powers: { diarmuid: 12, target: 3, loser: 2 },
  });

  const removedTarget = ["target-inactive-a", "target-inactive-b"].filter((id) => state.cards[id].zone === "removed");
  assert.equal(removedTarget.length, 1);
  assert.equal(state.cards[removedTarget[0]].sequestration.sourceId, YELLOW);
  assert.equal(state.cards[removedTarget[0]].sequestration.returnOnPlayerEliminationId, "diarmuid");
  assert.equal(state.cards[removedTarget[0]].sequestration.returnZone, "servant-skills");
  assert.equal(state.cards["target-active"].zone, "attack");
  assert.equal(state.cards["target-master"].zone, "master-skills");
  assert.equal(state.cards["loser-inactive"].zone, "servant-skills");
  assert.equal(state.players.diarmuid.flags.yellowRoseArmedRound, undefined);
});

test("Diarmuid package: Yellow Rose does nothing unless armed and won by Diarmuid", () => {
  const { engine } = setupBuilt();
  const unarmed = combatState("diarmuid-yellow-unarmed");
  addSkill(unarmed, "diarmuid", "yellow-rose-unarmed", YELLOW, "attack", true);
  addSkill(unarmed, "target", "target-skill-unarmed", "servant.target.skill.a");
  resolveCombatPassive(engine, unarmed, {
    locationId: "mountain",
    winnerIds: ["diarmuid"],
    defeatedPlayerIds: ["target"],
    powers: { diarmuid: 10, target: 1 },
  });
  assert.equal(unarmed.cards["target-skill-unarmed"].zone, "servant-skills");

  let lost = combatState("diarmuid-yellow-lost");
  addSkill(lost, "target", "target-skill-lost", "servant.target.skill.a");
  lost = armYellowRose(engine, lost);
  resolveCombatPassive(engine, lost, {
    locationId: "mountain",
    winnerIds: ["target"],
    defeatedPlayerIds: ["diarmuid"],
    powers: { diarmuid: 1, target: 10 },
  });
  assert.equal(lost.cards["target-skill-lost"].zone, "servant-skills");
});

test("Diarmuid package: sequestered skill returns to its original servant skill zone when Diarmuid is eliminated", () => {
  const { engine, definitions } = setupBuilt();
  let state = combatState("diarmuid-yellow-return", [
    { id: "p3", name: "P3" }, { id: "p4", name: "P4" }, { id: "p5", name: "P5" },
  ]);
  addSkill(state, "target", "target-return-skill", "servant.target.skill.a");
  state.cards["target-return-skill"].face = "down";
  state = armYellowRose(engine, state);
  resolveCombatPassive(engine, state, {
    locationId: "mountain",
    winnerIds: ["diarmuid"],
    defeatedPlayerIds: ["target"],
    powers: { diarmuid: 10, target: 1 },
  });
  assert.equal(state.cards["target-return-skill"].zone, "removed");

  state.round = 8;
  state.players.diarmuid.victoryPoints = 0;
  state.players.target.victoryPoints = 10;
  state.players.p3.victoryPoints = 9;
  state.players.p4.victoryPoints = 8;
  state.players.p5.victoryPoints = 7;
  const eliminated = applyClimaxElimination(state, definitions);
  assert.deepEqual(eliminated, ["diarmuid"]);
  assert.equal(state.players.diarmuid.eliminated, true);
  assert.equal(state.cards["target-return-skill"].zone, "servant-skills");
  assert.equal(state.players.target.servantSkills.includes("target-return-skill"), true);
  assert.equal(state.cards["target-return-skill"].sequestration, undefined);
  assert.equal(state.cards["target-return-skill"].face, "down");
  assert.equal(state.cards["target-return-skill"].active, false);
});

test("Diarmuid package: Yellow Rose permanently removes a once-per-game servant skill", () => {
  const { engine } = setupBuilt();
  let state = combatState("diarmuid-yellow-once-per-game");
  addSkill(state, "target", "amakusa-once", "servant.amakusa.skill.sc-amakusa-1");
  state.cards["amakusa-once"].face = "down";
  state = armYellowRose(engine, state);
  resolveCombatPassive(engine, state, {
    locationId: "mountain",
    winnerIds: ["diarmuid"],
    defeatedPlayerIds: ["target"],
    powers: { diarmuid: 10, target: 1 },
  });
  assert.equal(state.cards["amakusa-once"].zone, "removed");
  assert.equal(state.cards["amakusa-once"].sequestration, undefined);
  assert.deepEqual(restoreSequesteredCardsOnPlayerElimination(state, "diarmuid"), []);
  assert.equal(state.cards["amakusa-once"].zone, "removed");
});

test("Diarmuid package: Battle Continuation moves to any non-workshop location and rejects workshop", () => {
  const { built } = setupBuilt();
  const engine = new StandardMatchEngine(built);
  const makeState = (id) => {
    const state = createGameState({ gameInstanceId: id, players: [{ id: "diarmuid", name: "Diarmuid" }], seed: 2605 });
    state.status = "playing";
    state.round = 4;
    state.phase = "action";
    state.step = "player-window";
    state.activePlayerId = "diarmuid";
    state.players.diarmuid.servantId = "servant.diarmuid";
    state.players.diarmuid.locationId = "mountain";
    state.board.locations.mountain = ["diarmuid"];
    // Base rules: a non-passive action-phase ability on a skill card requires
    // that physical skill card to be active in the attack zone.
    addSkill(state, "diarmuid", "continuation", CONTINUATION, "attack", true);
    return state;
  };

  const movedState = makeState("diarmuid-continuation-city");
  const moved = engine.execute(movedState, command(movedState, "continuation-city", CommandType.UseSkill, "diarmuid", {
    skillId: CONTINUATION,
    data: { locationId: "city" },
  }));
  assert.equal(moved.state.players.diarmuid.locationId, "city");
  assert.equal(moved.state.step, "play-batch-draft");

  const blockedState = makeState("diarmuid-continuation-workshop");
  assert.throws(() => engine.execute(blockedState, command(blockedState, "continuation-workshop", CommandType.UseSkill, "diarmuid", {
    skillId: CONTINUATION,
    data: { locationId: "workshop" },
  })), /SKILL_TARGET_LOCATION_INVALID/);
});
