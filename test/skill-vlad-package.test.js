import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { deployPlayer } from "../src/rules-core/board.ts";
import { calculateTerrainAdvantage } from "../src/rules-core/combat-power.ts";
import { useVladProtectorOfNation } from "../src/rules-core/skill-handlers.ts";

const PROTECTOR = "servant.vlad.skill.sc-vlad-1";
const KAZIKLI = "servant.vlad.skill.sc-vlad-2";
const LANCER = "servant.vlad.skill.sc-vlad-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "vlad-package", players = [{ id: "v", name: "Vlad" }, { id: "m", name: "Mover" }, { id: "o", name: "Other" }]) {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players, seed: 9201 });
  state.status = "playing";
  state.round = 4;
  state.turnOrder = players.map((player) => player.id);
  state.players.v.servantId = "servant.vlad";
  state.players.v.mana = 8;
  state.players.v.locationId = "mountain";
  for (const id of players.map((p) => p.id).filter((id) => id !== "v")) state.players[id].locationId = "mountain";
  state.board.locations = { workshop: [], mountain: players.map((p) => p.id), city: [], scouting: [] };
  state.board.outpostRecords = { workshop: [null, null, null, null], mountain: ["v", null], city: [null, null] };
  state.players.v.flags.deploymentLocationId = "mountain";
  state.players.v.flags.deploymentBonus = 3;
  state.players.v.flags.deploymentBonusActive = true;
  createOwnedCardInstance(state, "v", { instanceId: "protector", definitionId: PROTECTOR, zone: "servant-skills", face: "down", active: false });
  return { built, definitions, engine, state };
}

function activeSkill(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "v", { instanceId, definitionId, zone: "attack", face: "up", active: true });
  state.cards[instanceId].playedRound = state.round;
}

function handCard(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "v", { instanceId, definitionId, zone: "hand", face: "down", active: false });
}

test("Vlad III package is 3/3 FULL", () => {
  const { built } = setup("vlad-full");
  const skills = [PROTECTOR, KAZIKLI, LANCER].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[0].handlerId, "core.vlad-protector-of-nation");
  assert.equal(skills[1].handlerId, "core.vlad-kazikli-bey");
  assert.equal(skills[2].handlerId, "core.move-to-non-workshop");
});

test("Protector of the Nation pays 1 through ability metadata and doubles current terrain", () => {
  const { engine, definitions, state } = setup("vlad-double-terrain");
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "v";
  state.players.v.mana = 5;
  assert.equal(calculateTerrainAdvantage(state, state.players.v, definitions), 3);
  const result = engine.execute(state, command(state, "vlad-double", CommandType.UseSkill, "v", {
    skillId: PROTECTOR, data: { abilityId: "protector-double-terrain" },
  }));
  assert.equal(result.state.players.v.mana, 4);
  assert.equal(calculateTerrainAdvantage(result.state, result.state.players.v, definitions), 6);
});

test("Protector combat ability penalizes players who moved into this battlefield and arms Fortify", () => {
  const { engine, state } = setup("vlad-fortify-penalty");
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "v";
  state.players.v.mana = 5;
  state.players.m.locationsPassedThisRound = ["mountain"];
  state.players.o.locationsPassedThisRound = [];
  const result = engine.execute(state, command(state, "vlad-fortify", CommandType.UseSkill, "v", {
    skillId: PROTECTOR, data: { abilityId: "protector-fortify" },
  }));
  assert.equal(result.state.players.v.mana, 4);
  assert.equal(result.state.players.m.flags.roundPowerBonus, -4);
  assert.equal(Number(result.state.players.o.flags.roundPowerBonus ?? 0), 0);
  assert.equal(result.state.players.v.flags.vladFortifyArmedRound, 4);
  assert.equal(result.state.players.v.flags.vladFortifyLocationId, "mountain");
});

test("Fortify win schedules next-round same-battlefield deployment with +3/+1/no-terrain choice", () => {
  const { built, definitions, engine, state } = setup("vlad-fortify-deploy");
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "v";
  state.players.m.locationsPassedThisRound = ["mountain"];
  let result = engine.execute(state, command(state, "vlad-arm", CommandType.UseSkill, "v", {
    skillId: PROTECTOR, data: { abilityId: "protector-fortify" },
  }));
  useVladProtectorOfNation({
    state: result.state,
    player: result.state.players.v,
    skill: built.skills.get(PROTECTOR),
    payload: { eventType: "combat.resolved", event: { locationId: "mountain", winnerIds: ["v"] } },
    definitions,
  });
  const next = result.state;
  assert.equal(next.players.v.flags.forcedDeploymentRound, 5);
  assert.equal(next.players.v.flags.forcedDeploymentLocationId, "mountain");
  assert.equal(next.players.v.flags.chooseTerrainAdvantageRound, 5);

  next.round = 5;
  next.phase = "outpost";
  next.activePlayerId = "v";
  next.board.locations = { workshop: [], mountain: [], city: [], scouting: [] };
  next.board.outpostRecords = { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] };
  assert.throws(() => deployPlayer(next, "v", "city", definitions), /FORCED_DEPLOYMENT_LOCATION_REQUIRED/);
  deployPlayer(next, "v", "mountain", definitions, { terrainAdvantageChoice: 1 });
  assert.equal(next.players.v.locationId, "mountain");
  assert.equal(next.players.v.flags.deploymentBonus, 1);
  assert.deepEqual(next.board.outpostRecords.mountain, [null, "v"]);
  assert.equal(next.players.v.flags.forcedDeploymentRound, undefined);
});

test("Fortify falls back to ordinary deployment if the stored battlefield is unavailable", () => {
  const { definitions, state } = setup("vlad-fortify-fallback");
  state.round = 5;
  state.phase = "outpost";
  state.activePlayerId = "v";
  state.players.v.flags.forcedDeploymentRound = 5;
  state.players.v.flags.forcedDeploymentLocationId = "mountain";
  state.players.v.flags.chooseTerrainAdvantageRound = 5;
  state.modeState.situationRestrictions = { forbiddenLocations: ["mountain"] };
  state.board.locations = { workshop: [], mountain: [], city: [], scouting: [] };
  state.board.outpostRecords = { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] };
  assert.doesNotThrow(() => deployPlayer(state, "v", "city", definitions));
  assert.equal(state.players.v.locationId, "city");
  assert.equal(state.players.v.flags.forcedDeploymentRound, undefined);
});

test("Kazikli Bey plays one hand card, or two with terrain for exactly 2 extra mana", () => {
  const { engine, state } = setup("vlad-kazikli");
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "v";
  state.players.v.mana = 5;
  activeSkill(state, "kazikli", KAZIKLI);
  handCard(state, "first", "card.cardb1");
  handCard(state, "second", "card.cardb2");
  const result = engine.execute(state, command(state, "vlad-kazikli-two", CommandType.UseSkill, "v", {
    skillId: KAZIKLI, data: { abilityId: "kazikli-play-hand", instanceIds: ["first", "second"] },
  }));
  assert.equal(result.state.players.v.mana, 3);
  assert.ok(result.state.players.v.attack.includes("first"));
  assert.ok(result.state.players.v.attack.includes("second"));
  assert.equal(result.state.cards.first.active, true);
  assert.equal(result.state.cards.second.active, true);
});

test("Kazikli Bey cannot take the second play without terrain and remains transactional", () => {
  const { engine, state } = setup("vlad-kazikli-no-terrain");
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "v";
  state.players.v.flags.deploymentBonusActive = false;
  state.players.v.flags.deploymentBonus = 0;
  activeSkill(state, "kazikli", KAZIKLI);
  handCard(state, "first", "card.cardb1");
  handCard(state, "second", "card.cardb2");
  const before = structuredClone(state);
  assert.throws(() => engine.execute(state, command(state, "vlad-kazikli-illegal-two", CommandType.UseSkill, "v", {
    skillId: KAZIKLI, data: { abilityId: "kazikli-play-hand", instanceIds: ["first", "second"] },
  })), /VLAD_KAZIKLI_TERRAIN_REQUIRED/);
  assert.deepEqual(state, before);
});
