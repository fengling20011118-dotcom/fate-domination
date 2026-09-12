import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";

const RASHOMON = "servant.ibaraki.skill.sc-ibaraki-3";
const BOILING_BLOOD = "servant.ibaraki.skill.sc-ibaraki-2";

function setup(id = "ibaraki") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...Object.fromEntries(built.events.map((event) => [event.id, event])), ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "i", name: "Ibaraki" }, { id: "a", name: "A" }, { id: "b", name: "B" }, { id: "x", name: "X" }],
    seed: 9601,
  });
  state.status = "playing";
  state.round = 6;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "i";
  state.turnOrder = ["i", "a", "b", "x"];
  state.players.i.servantId = "servant.ibaraki";
  state.players.i.locationId = "mountain";
  state.players.a.locationId = "city";
  state.players.b.locationId = "mountain";
  state.players.x.locationId = "scouting";
  state.board.locations.mountain = ["i", "b"];
  state.board.locations.city = ["a"];
  state.board.locations.scouting = ["x"];
  state.players.i.sharedBattlefieldPlayerIdsThisRound = ["a"];
  createOwnedCardInstance(state, "i", { instanceId: "rashomon", definitionId: RASHOMON, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "discarded-five", definitionId: "card.carda5", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "x", { instanceId: "blocked-hand", definitionId: "card.carda5", zone: "hand", face: "down", active: false });
  return { built, engine, definitions, state };
}

function command(state, id, actorId, type, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

test("Ibaraki package: all skills are FULL with Rashoumon handler and English Boiling Blood VP loss", () => {
  const { built } = setup("ibaraki-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.ibaraki");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(RASHOMON).handlerId, "core.ibaraki-rashomon-grudge");
  assert.deepEqual(built.skills.get(RASHOMON).rashomonGrudge, { powerLossScope: "same-battlefield-opponents" });
  assert.deepEqual(built.skills.get(BOILING_BLOOD).manaThresholdVictoryPointLoss, { threshold: 8, amount: 1, opponentExtra: 2 });
});

test("Grudge of Rashoumon moves a remembered opponent, discards random hand card, and reduces fight opponents by its base power", () => {
  const { engine, definitions, state } = setup("ibaraki-rashomon");
  let result = engine.execute(state, command(state, "use-rashomon", "i", CommandType.UseSkill, { skillId: RASHOMON }));
  assert.equal(result.state.pendingDecision?.kind, "ibaraki-rashomon-target");
  assert.deepEqual(result.state.pendingDecision?.options.map((option) => option.id), ["a"]);

  result = engine.execute(result.state, command(result.state, "choose-a", "i", CommandType.ResolveDecision, {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["a"],
  }));

  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.players.a.locationId, "mountain");
  assert.deepEqual(new Set(result.state.board.locations.mountain), new Set(["i", "b", "a"]));
  assert.deepEqual(result.state.players.a.hand, []);
  assert.deepEqual(result.state.players.a.discard, ["discarded-five"]);
  assert.equal(result.state.cards["discarded-five"].face, "up");
  const discardedPower = definitions["card.carda5"].basePower;
  assert.equal(result.state.players.a.flags.roundPowerBonus, -discardedPower);
  assert.equal(result.state.players.b.flags.roundPowerBonus, -discardedPower);
  assert.equal(calculateCombatPower(result.state, result.state.players.a, definitions, "mountain"), 0);
});
