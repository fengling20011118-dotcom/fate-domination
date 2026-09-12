import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

const ROCKET_PUNCH = "servant.mechaeli.skill.sc-mechaeli-1";

function setup() {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  return { built, engine, definitions };
}

function command(state, id, playerId, targetPlayerId) {
  return {
    commandId: id,
    gameInstanceId: state.gameInstanceId,
    actorId: playerId,
    expectedRevision: state.revision,
    type: CommandType.UseSkill,
    payload: { skillId: ROCKET_PUNCH, data: { abilityId: "bang", targetPlayerId } },
  };
}

function battleState(id, phase = "combat", extraPlayers = ["target"]) {
  const players = [{ id: "mecha", name: "Mecha Eli" }, ...extraPlayers.map((playerId) => ({ id: playerId, name: playerId }))];
  const state = createGameState({ gameInstanceId: id, players, seed: 3701 });
  state.status = "playing";
  state.round = 3;
  state.phase = phase;
  state.step = "player-window";
  state.activePlayerId = "mecha";
  state.turnOrder = players.map((player) => player.id);
  for (const player of Object.values(state.players)) {
    player.locationId = "mountain";
    player.mana = 20;
  }
  state.players.mecha.servantId = "servant.mechaeli";
  state.board.locations.mountain = players.map((player) => player.id);
  createOwnedCardInstance(state, "mecha", {
    instanceId: "rocket-punch",
    definitionId: ROCKET_PUNCH,
    zone: "attack",
    face: "up",
    active: true,
  });
  return state;
}

test("Mecha Eli package: Rocket Punch is FULL, appended, reversed, and shares one twice-per-round Bang ability", () => {
  const { built } = setup();
  const skills = [1, 2, 3].map((index) => built.skills.get(`servant.mechaeli.skill.sc-mechaeli-${index}`));
  assert.deepEqual(skills.map((skill) => skill.supportLevel), ["FULL", "FULL", "FULL"]);
  const rocket = skills[0];
  assert.equal(rocket.handlerId, "core.move-later-seat-opponent");
  assert.equal(rocket.standardAppend, true);
  assert.equal(rocket.hasReversalEffect, true);
  assert.equal(rocket.limit, "twice-per-round");
  assert.deepEqual(rocket.windows, ["action", "combat"]);
  assert.equal(rocket.abilities.length, 1);
  assert.equal(rocket.abilities[0].id, "bang");
  assert.equal(rocket.abilities[0].limit, "twice-per-round");
  assert.deepEqual(rocket.abilities[0].windows, ["action", "combat"]);
  assert.ok(rocket.rules.evidence.some((source) => source.kind === "development-image"));
  assert.deepEqual(rocket.rules.ambiguities, []);
  assert.deepEqual(rocket.rules.unmodeledClauses, []);
});

test("Mecha Eli package: reversed Rocket Punch acts in action, normal Rocket Punch acts in combat", () => {
  const { engine } = setup();

  const actionNormal = battleState("mecha-action-normal", "action");
  assert.throws(() => engine.execute(actionNormal, command(actionNormal, "action-normal", "mecha", "target")), /SKILL_USE_FORBIDDEN/);

  const actionReversed = battleState("mecha-action-reversed", "action");
  actionReversed.cards["rocket-punch"].reversed = true;
  const actionResult = engine.execute(actionReversed, command(actionReversed, "action-reversed", "mecha", "target"));
  assert.equal(actionResult.state.players.target.locationId, "city");

  const combatNormal = battleState("mecha-combat-normal", "combat");
  const combatResult = engine.execute(combatNormal, command(combatNormal, "combat-normal", "mecha", "target"));
  assert.equal(combatResult.state.players.target.locationId, "city");
  assert.ok(combatResult.events.some((event) => event.type === "player.moved" && event.payload.playerId === "target"));

  const combatReversed = battleState("mecha-combat-reversed", "combat");
  combatReversed.cards["rocket-punch"].reversed = true;
  assert.throws(() => engine.execute(combatReversed, command(combatReversed, "combat-reversed", "mecha", "target")), /SKILL_USE_FORBIDDEN/);
});

test("Mecha Eli package: Bang only targets a same-battlefield opponent later in turn order", () => {
  const { engine } = setup();
  const state = battleState("mecha-targeting", "combat", ["later", "remote"]);
  state.turnOrder = ["earlier", "mecha", "later", "remote"];
  state.players.earlier = {
    ...state.players.later,
    id: "earlier",
    name: "earlier",
    hand: [], deck: [], discard: [], attack: [], masterSkills: [], servantSkills: [], statuses: [],
    usage: {}, flags: {}, sharedBattlefieldPlayerIdsThisRound: [], locationsPassedThisRound: [],
  };
  state.players.earlier.locationId = "mountain";
  state.board.locations.mountain.unshift("earlier");
  state.players.remote.locationId = "city";
  state.board.locations.mountain = state.board.locations.mountain.filter((id) => id !== "remote");
  state.board.locations.city = ["remote"];

  assert.throws(() => engine.execute(state, command(state, "target-earlier", "mecha", "earlier")), /MOVE_LATER_SEAT_TARGET_INVALID/);
  assert.throws(() => engine.execute(state, command(state, "target-remote", "mecha", "remote")), /MOVE_LATER_SEAT_TARGET_INVALID/);
  const result = engine.execute(state, command(state, "target-later", "mecha", "later"));
  assert.equal(result.state.players.later.locationId, "city");
});

test("Mecha Eli package: Bang resolves twice in one round, blocks the third use, then resets next round", () => {
  const { engine } = setup();
  let state = battleState("mecha-twice", "combat", ["later-a", "later-b", "later-c"]);

  let result = engine.execute(state, command(state, "bang-a", "mecha", "later-a"));
  state = result.state;
  result = engine.execute(state, command(state, "bang-b", "mecha", "later-b"));
  state = result.state;
  const usageKey = `${ROCKET_PUNCH}:bang`;
  assert.equal(state.players.mecha.usage[usageKey].round, 3);
  assert.equal(state.players.mecha.usage[usageKey].count, 2);
  assert.throws(() => engine.execute(state, command(state, "bang-c-blocked", "mecha", "later-c")), /SKILL_USE_FORBIDDEN/);

  state.round = 4;
  const nextRound = engine.execute(state, command(state, "bang-c-next-round", "mecha", "later-c"));
  assert.equal(nextRound.state.players["later-c"].locationId, "city");
  assert.equal(nextRound.state.players.mecha.usage[usageKey].count, 1);
  assert.equal(nextRound.state.players.mecha.usage[usageKey].round, 4);
});

test("Mecha Eli package: Rocket Punch can be appended as a third standard-attack card", () => {
  const { definitions } = setup();
  const state = createGameState({ gameInstanceId: "mecha-append", players: [{ id: "mecha", name: "Mecha Eli" }], seed: 3702 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "mecha";
  state.players.mecha.servantId = "servant.mechaeli";
  state.players.mecha.mana = 20;
  state.players.mecha.locationId = "mountain";
  state.board.locations.mountain = ["mecha"];
  createOwnedCardInstance(state, "mecha", { instanceId: "basic-a", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "mecha", { instanceId: "basic-b", definitionId: "card.cardq1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "mecha", { instanceId: "rocket-punch", definitionId: ROCKET_PUNCH, zone: "hand", face: "down", active: false });

  const result = commitStandardAttack(state, "mecha", ["basic-a", "basic-b", "rocket-punch"], [], definitions);
  assert.deepEqual(result.committed, ["basic-a", "basic-b", "rocket-punch"]);
  assert.equal(state.cards["rocket-punch"].zone, "attack");
});
