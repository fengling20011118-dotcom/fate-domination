import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { deployPlayer } from "../src/rules-core/board.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { grantRulerSeal, listRulerSealsControlledBy, listRulerSealsOnPlayer } from "../src/rules-core/ruler-seals.ts";

const DIVINE = "servant.martha.skill.sc-martha-1";
const TARASQUE = "servant.martha.skill.sc-martha-2";
const RIDER = "servant.martha.skill.sc-martha-3";
const RULER_SEAL = "servant.martha.skill.sc-martha-4";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "martha") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "m", name: "Martha" }, { id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
    seed: 1818,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "m";
  state.turnOrder = ["m", "a", "b", "c"];
  state.players.m.servantId = "servant.martha";
  for (const id of ["m", "a", "b"]) state.players[id].locationId = "mountain";
  state.players.c.locationId = "city";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["m", "a", "b"];
  state.board.locations.city = ["c"];
  state.board.locations.scouting = [];
  for (const player of Object.values(state.players)) {
    player.mana = 12;
    player.commandSeals = 3;
  }
  return { built, definitions, engine, state };
}

function addActiveSkill(state, playerId, instanceId, definitionId) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone: "attack", face: "up", active: true });
}

function resolve(engine, state, id, actorId, selections) {
  return engine.execute(state, command(state, id, CommandType.ResolveDecision, actorId, {
    decisionId: state.pendingDecision.decisionId,
    selections,
  }));
}

test("Martha package is 4/4 FULL including generated Ruler Seal", () => {
  const { built } = setup("martha-full");
  const skills = [DIVINE, TARASQUE, RIDER, RULER_SEAL].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(skills[3].initiallyOwned, false);
});

test("Divine Obedience can bind Martha herself, but cannot be used while Martha is already bound", () => {
  const { engine, state } = setup("martha-self-vow");
  addActiveSkill(state, "m", "divine", DIVINE);
  let result = engine.execute(state, command(state, "vow", CommandType.UseSkill, "m", {
    skillId: DIVINE,
    data: { abilityId: "saints-vow" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "martha-saints-vow-mode");
  result = resolve(engine, result.state, "vow-self", "m", ["self"]);
  assert.equal(result.state.pendingDecision, null);
  const seals = listRulerSealsControlledBy(result.state, "m");
  assert.equal(seals.length, 1);
  assert.equal(seals[0].boundPlayerId, "m");
  assert.equal(listRulerSealsOnPlayer(result.state, "m").length, 1);

  result.state.round += 1;
  result.state.phase = "combat";
  result.state.activePlayerId = "m";
  assert.throws(() => engine.execute(result.state, command(result.state, "vow-again", CommandType.UseSkill, "m", {
    skillId: DIVINE,
    data: { abilityId: "saints-vow" },
  })), /SKILL_USE_FORBIDDEN/);
});

test("Divine Obedience removes Luck to bind another player at Martha's location with a Martha-controlled seal", () => {
  const { engine, state } = setup("martha-other-vow");
  addActiveSkill(state, "m", "divine", DIVINE);
  createOwnedCardInstance(state, "m", { instanceId: "luck", definitionId: "card.cardluck", zone: "hand", face: "down", active: false });

  let result = engine.execute(state, command(state, "vow", CommandType.UseSkill, "m", {
    skillId: DIVINE,
    data: { abilityId: "saints-vow" },
  }));
  result = resolve(engine, result.state, "vow-other", "m", ["other"]);
  assert.equal(result.state.pendingDecision?.kind, "martha-saints-vow-luck");
  result = resolve(engine, result.state, "vow-luck", "m", ["luck"]);
  assert.equal(result.state.pendingDecision?.kind, "martha-saints-vow-target");
  assert.equal(result.state.pendingDecision.options.some((option) => option.id === "c"), false);
  result = resolve(engine, result.state, "vow-target", "m", ["a"]);

  assert.equal(result.state.cards.luck.zone, "removed");
  const seals = listRulerSealsControlledBy(result.state, "m");
  assert.equal(seals.length, 1);
  assert.equal(seals[0].boundPlayerId, "a");
});

test("Tarasque may pay an ordinary Command Seal, gains +4, and forces engaged opponents to Workshop next Outpost when possible", () => {
  const { engine, definitions, state } = setup("martha-tarasque-normal");
  addActiveSkill(state, "m", "tarasque", TARASQUE);
  const before = calculateCombatCardPower(state, state.players.m, "tarasque", definitions, "mountain");
  const result = engine.execute(state, command(state, "tarasque-use", CommandType.UseSkill, "m", {
    skillId: TARASQUE,
    data: { abilityId: "leviathan-child" },
  }));
  assert.equal(result.state.players.m.commandSeals, 2);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.m, "tarasque", definitions, "mountain"), before + 4);
  for (const id of ["a", "b"]) {
    assert.equal(result.state.players[id].flags.forcedDeploymentRound, 5);
    assert.equal(result.state.players[id].flags.forcedDeploymentLocationId, "workshop");
  }
  assert.equal(result.state.players.c.flags.forcedDeploymentRound, undefined);

  result.state.round = 5;
  result.state.phase = "outpost";
  result.state.activePlayerId = "a";
  assert.throws(() => deployPlayer(result.state, "a", "city", definitions), /FORCED_DEPLOYMENT_LOCATION_REQUIRED/);
  deployPlayer(result.state, "a", "workshop", definitions);
  assert.equal(result.state.players.a.locationId, "workshop");
  assert.equal(result.state.players.a.flags.forcedDeploymentRound, undefined);
});

test("Tarasque can spend a Martha-controlled Ruler Seal as its cost and the Workshop force is ignored when Workshop is impossible", () => {
  const { engine, definitions, state } = setup("martha-tarasque-ruler");
  addActiveSkill(state, "m", "tarasque", TARASQUE);
  state.players.m.commandSeals = 0;
  const seal = grantRulerSeal(state, "m", "a", DIVINE);
  const result = engine.execute(state, command(state, "tarasque-use", CommandType.UseSkill, "m", {
    skillId: TARASQUE,
    data: { abilityId: "leviathan-child" },
  }));
  assert.equal(listRulerSealsControlledBy(result.state, "m").some((item) => item.sealId === seal.sealId), false);

  result.state.round = 5;
  result.state.phase = "outpost";
  result.state.activePlayerId = "a";
  result.state.board.locations.workshop = ["full-1", "full-2", "full-3", "full-4"];
  deployPlayer(result.state, "a", "city", definitions);
  assert.equal(result.state.players.a.locationId, "city");
  assert.equal(result.state.players.a.flags.forcedDeploymentRound, undefined);
});
