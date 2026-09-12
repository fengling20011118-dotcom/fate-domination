import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { gainCommandSeals, payCommandSealCost } from "../src/rules-core/command-seals.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { useZoukenFounder, useZoukenIllusiveMastermind, useZoukenObsession } from "../src/rules-core/zouken.ts";

const FOUNDER = "master.zouken.skill.s3";
const OBSESSION = "master.zouken.skill.s4";
const ASCENSION = "master.zouken.skill.ascension";

function setup(id = "zouken-package") {
  const built = buildStandardContent(legacyContent);
  registerCoreSkillHandlers(built.skills);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "z", name: "Zouken" }, { id: "o", name: "Opponent" }], seed: 739 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "z";
  state.players.z.masterId = "master.zouken";
  state.players.z.mana = 10;
  state.players.z.victoryPoints = 8;
  state.players.o.mana = 9;
  state.players.o.commandSeals = 3;
  return { built, definitions, state };
}

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.board.locations[locationId].push(playerId);
  state.players[playerId].locationId = locationId;
}

test("Zouken package is 6/6 FULL and converted skills use dedicated handlers", () => {
  const { built } = setup("zouken-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.zouken");
  assert.equal(skills.length, 6);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(FOUNDER).handlerId, "core.zouken-founder");
  assert.equal(built.skills.get(OBSESSION).handlerId, "core.zouken-pseudo-vampire");
  assert.equal(built.skills.get(ASCENSION).handlerId, "core.zouken-illusive-mastermind");
});

test("Founder replaces Command Seal gain and ability-cost payment with 4 mana per seal", () => {
  const { built, state } = setup("zouken-seals");
  useZoukenFounder({ state, player: state.players.z, skill: built.skills.get(FOUNDER), payload: { eventType: "game.started" } });
  assert.equal(state.players.z.commandSeals, 0);
  state.players.z.mana = 5;
  assert.deepEqual(gainCommandSeals(state, "z", 1), { gainedSeals: 0, gainedMana: 4 });
  assert.equal(state.players.z.mana, 9);
  const paid = payCommandSealCost(state, "z", 1);
  assert.deepEqual(paid, { paidSeals: 0, substitutionCredits: 0 });
  assert.equal(state.players.z.mana, 5);
  assert.equal(state.players.z.commandSeals, 0);
  assert.equal(state.players.z.flags.commandSealUsedRound, undefined);
});

test("Founder spends 2X for X power and awards X VP after winning this round", () => {
  const { built, definitions, state } = setup("zouken-founder-x");
  const result = useZoukenFounder({ state, player: state.players.z, skill: built.skills.get(FOUNDER), payload: { x: 3 }, definitions });
  assert.deepEqual(result, { x: 3, paidMana: 6 });
  assert.equal(state.players.z.mana, 4);
  assert.equal(state.players.z.flags.roundPowerBonus, 3);
  useZoukenFounder({ state, player: state.players.z, skill: built.skills.get(FOUNDER), payload: { eventType: "combat.resolved", event: { winnerIds: ["z"] } }, definitions });
  assert.equal(state.players.z.victoryPoints, 11);
  assert.equal(state.players.z.flags.zoukenFounderRewardVp, undefined);
});

test("Pseudo Vampire applies low-mana penalty, drains a loser, and gains 3 mana when alone", () => {
  const { built, definitions, state } = setup("zouken-vampire");
  state.players.z.flags.roundManaGained = 2;
  useZoukenObsession({ state, player: state.players.z, skill: built.skills.get(OBSESSION), payload: { eventType: "round.ending" }, definitions });
  assert.equal(state.players.z.victoryPoints, 6);

  putAt(state, "z", "mountain"); putAt(state, "o", "mountain");
  state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "z";
  state.modeState.combatWinnerIdsByLocation = { mountain: ["z"] };
  state.players.z.mana = 4; state.players.o.mana = 9;
  const drain = useZoukenObsession({ state, player: state.players.z, skill: built.skills.get(OBSESSION), payload: { abilityId: "blood-worms", targetPlayerId: "o" }, definitions });
  assert.equal(drain.transferredMana, 3);
  assert.equal(state.players.z.mana, 7);
  assert.equal(state.players.o.mana, 6);

  putAt(state, "o", "city");
  const alone = useZoukenObsession({ state, player: state.players.z, skill: built.skills.get(OBSESSION), payload: { abilityId: "blood-worms" }, definitions });
  assert.equal(alone.gainedMana, 3);
  assert.equal(state.players.z.mana, 10);
});

test("Bug Form pays 7 mana and moves by effect to any legal location", () => {
  const { built, definitions, state } = setup("zouken-bug-form");
  putAt(state, "z", "mountain"); putAt(state, "o", "mountain");
  state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "z";
  state.players.z.mana = 10;
  const moved = useZoukenObsession({ state, player: state.players.z, skill: built.skills.get(OBSESSION), payload: { abilityId: "bug-form", targetLocationId: "scouting" }, definitions });
  assert.equal(moved.locationId, "scouting");
  assert.equal(state.players.z.locationId, "scouting");
  assert.equal(state.players.z.mana, 3);
});

test("Illusive Mastermind ignores engagement, removes Blood Worms win gate, and strips local seals", () => {
  const { built, definitions, state } = setup("zouken-ascension");
  useZoukenIllusiveMastermind({ state, player: state.players.z, skill: built.skills.get(ASCENSION), payload: { eventType: "skill.unlocked", event: { playerId: "z", skillId: ASCENSION } }, definitions });
  assert.equal(state.players.z.flags.ignoreEngagement, true);
  assert.equal(state.players.z.flags.zoukenIllusiveMastermindActive, true);
  putAt(state, "z", "city"); putAt(state, "o", "city");
  state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "z";
  state.modeState.combatWinnerIdsByLocation = { city: ["o"] };
  const drain = useZoukenObsession({ state, player: state.players.z, skill: built.skills.get(OBSESSION), payload: { abilityId: "blood-worms", targetPlayerId: "o", amount: 2 }, definitions });
  assert.equal(drain.transferredMana, 2);

  state.phase = "action"; state.activePlayerId = "z"; state.players.z.mana = 10; state.players.o.commandSeals = 2;
  const result = useZoukenIllusiveMastermind({ state, player: state.players.z, skill: built.skills.get(ASCENSION), payload: {}, definitions });
  assert.equal(state.players.z.mana, 4);
  assert.equal(state.players.o.commandSeals, 1);
  assert.deepEqual(result.affectedPlayerIds, ["o"]);
});
