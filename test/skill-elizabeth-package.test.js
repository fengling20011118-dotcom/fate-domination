import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import {
  registerCoreSkillHandlers,
  useElizabethIronMaiden,
  useElizabethVocalPerformance,
  useElizabethVolumeLossOnCombatLoss,
  useElizabethVolumePower,
} from "../src/rules-core/skill-handlers.ts";

const PRISON = "servant.elizabeth.skill.sc-elizabeth-1";
const VOCAL = "servant.elizabeth.skill.sc-elizabeth-2";
const TORTURE = "servant.elizabeth.skill.sc-elizabeth-3";

function setup(id = "elizabeth-package") {
  const built = buildStandardContent(legacyContent);
  registerCoreSkillHandlers(built.skills);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "e", name: "Elizabeth" }, { id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
    seed: 4242,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "e";
  state.players.e.servantId = "servant.elizabeth";
  for (const id of ["e", "a", "b"]) state.players[id].locationId = "mountain";
  state.players.c.locationId = "city";
  state.board.locations = { workshop: [], mountain: ["e", "a", "b"], city: ["c"], scouting: [] };
  return { built, definitions, state };
}

function addSkill(state, definitionId, active = true) {
  const instanceId = `e:${definitionId.split(".").at(-1)}`;
  return createOwnedCardInstance(state, "e", {
    instanceId,
    definitionId,
    zone: active ? "attack" : "servant-skills",
    face: "up",
    active,
  });
}

function combatPayload(winnerIds, powers = { e: 20, a: 10, b: 9 }) {
  return { powers, winnerIds };
}

test("Elizabeth package is 3/3 FULL and uses the dedicated handlers", () => {
  const { built } = setup("elizabeth-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.elizabeth");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(PRISON).handlerId, "core.elizabeth-volume-power");
  assert.equal(built.skills.get(VOCAL).handlerId, "core.elizabeth-vocal-performance");
  assert.equal(built.skills.get(TORTURE).handlerId, "core.elizabeth-iron-maiden");
});

test("Prison Castle caps only converted power at 15 while Volume itself remains unbounded", () => {
  const { built, definitions, state } = setup("elizabeth-prison");
  addSkill(state, PRISON, true);
  state.players.e.flags.elizabethVolumeMarkers = 8;
  useElizabethVolumePower({ state, player: state.players.e, skill: built.skills.get(PRISON), payload: {}, definitions });
  assert.equal(state.players.e.flags.roundPowerBonus, 15);

  useElizabethVolumeLossOnCombatLoss({
    state, player: state.players.e, skill: built.skills.get(PRISON), payload: combatPayload(["a"]), definitions,
  });
  assert.equal(state.players.e.flags.elizabethVolumeMarkers, 5);

  state.cards["e:sc-elizabeth-1"].active = false;
  useElizabethVolumeLossOnCombatLoss({
    state, player: state.players.e, skill: built.skills.get(PRISON), payload: combatPayload(["a"]), definitions,
  });
  assert.equal(state.players.e.flags.elizabethVolumeMarkers, 5);
});

test("Kilenc Sarkany gains one unbounded Volume per opponent and loses one after a no-combat round only while active", () => {
  const { built, definitions, state } = setup("elizabeth-vocal");
  const source = addSkill(state, VOCAL, true);
  state.players.e.flags.elizabethVolumeMarkers = 20;
  useElizabethVocalPerformance({ state, player: state.players.e, skill: built.skills.get(VOCAL), payload: {}, definitions });
  assert.equal(state.players.e.flags.elizabethVolumeMarkers, 22);
  assert.equal(source.powerModifiers.at(-1).value, 22);

  delete state.players.e.flags.combatWinRound;
  delete state.players.e.flags.combatLossRound;
  useElizabethVocalPerformance({
    state, player: state.players.e, skill: built.skills.get(VOCAL), payload: { eventType: "combat.ending" }, definitions,
  });
  assert.equal(state.players.e.flags.elizabethVolumeMarkers, 21);

  source.active = false;
  useElizabethVocalPerformance({
    state, player: state.players.e, skill: built.skills.get(VOCAL), payload: { eventType: "combat.ending" }, definitions,
  });
  assert.equal(state.players.e.flags.elizabethVolumeMarkers, 21);
});

test("Torture Techniques costs 2 less only with a same-battlefield lower-VP opponent", () => {
  const { definitions, state } = setup("elizabeth-torture-cost");
  const card = addSkill(state, TORTURE, false);
  state.players.e.victoryPoints = 5;
  state.players.a.victoryPoints = 4;
  state.players.b.victoryPoints = 7;
  assert.equal(getCardPlayCost(state, definitions[TORTURE], state.players.e, card, definitions), 2);

  state.players.a.victoryPoints = 5;
  assert.equal(getCardPlayCost(state, definitions[TORTURE], state.players.e, card, definitions), 4);
  state.players.a.locationId = "city";
  state.board.locations.mountain = ["e", "b"];
  state.board.locations.city = ["a", "c"];
  state.players.a.victoryPoints = 0;
  assert.equal(getCardPlayCost(state, definitions[TORTURE], state.players.e, card, definitions), 4);
});

test("Iron Maiden hits all lowest-VP combat losers and rewards Elizabeth when that set includes an overall last-place player", () => {
  const { built, definitions, state } = setup("elizabeth-iron-maiden");
  const source = addSkill(state, TORTURE, true);
  state.players.e.victoryPoints = 8;
  state.players.a.victoryPoints = 3;
  state.players.b.victoryPoints = 3;
  state.players.c.victoryPoints = 6;
  useElizabethIronMaiden({
    state, player: state.players.e, skill: built.skills.get(TORTURE), payload: combatPayload(["e"]), definitions,
  });
  assert.equal(state.players.a.victoryPoints, 1);
  assert.equal(state.players.b.victoryPoints, 1);
  assert.equal(state.players.c.victoryPoints, 6);
  assert.equal(state.players.e.victoryPoints, 10);

  source.active = false;
  useElizabethIronMaiden({
    state, player: state.players.e, skill: built.skills.get(TORTURE), payload: combatPayload(["e"]), definitions,
  });
  assert.equal(state.players.a.victoryPoints, 1);
  assert.equal(state.players.e.victoryPoints, 10);
});
