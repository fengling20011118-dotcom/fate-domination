import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { getStructuredCombatPower } from "../src/rules-core/rule-modifiers.ts";

const EVIL = "servant.douman.skill.sc-douman-1";
const CAT = "servant.douman.skill.sc-douman-2";
const ALTER = "servant.douman.skill.sc-douman-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "douman-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "d", name: "Douman" }, { id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
    seed: 8301,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "d";
  state.turnOrder = ["d", "a", "b", "c"];
  state.players.d.servantId = "servant.douman";
  for (const player of Object.values(state.players)) player.mana = 20;
  state.players.d.locationId = "mountain";
  state.players.a.locationId = "mountain";
  state.players.b.locationId = "mountain";
  state.players.c.locationId = "city";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["d", "a", "b"];
  state.board.locations.city = ["c"];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function active(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "d", { instanceId, definitionId, zone: "attack", face: "up", active: true });
  state.cards[instanceId].playedRound = state.round;
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload) {
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${++passiveCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Douman package is 3/3 FULL and both attack skills are authored reversal cards", () => {
  const { built } = setup("douman-full");
  const skills = [EVIL, CAT, ALTER].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[0].handlerId, "core.douman-evil-minister");
  assert.equal(skills[1].handlerId, "core.douman-ridicule-cat");
  assert.equal(skills[2].handlerId, "core.alter-ego-transform");
  assert.equal(skills[0].hasReversalEffect, true);
  assert.equal(skills[1].hasReversalEffect, true);
  assert.equal(skills[0].revealsTrueNameOnReverse, true);
});

test("Evil Minister curses all co-located opponents and a cursed player loses this source's curse after winning a contest", () => {
  const { definitions, engine, state } = setup("douman-curse");
  active(state, "evil", EVIL);
  let result = engine.execute(state, command(state, "curse-use", CommandType.UseSkill, "d", {
    skillId: EVIL, data: { abilityId: "evil-minister-curse" },
  }));
  for (const id of ["a", "b"]) {
    assert.equal(result.state.players[id].flags["doumanCursedBy:d"], true);
    assert.ok(result.state.players[id].statuses.includes("诅咒"));
  }
  assert.equal(result.state.players.c.statuses.includes("诅咒"), false);

  emitPassive(engine, result.state, definitions, "combat.resolved", {
    locationId: "mountain", powers: { d: 5, a: 8, b: 4 }, winnerIds: ["a"], defeatedPlayerIds: ["d", "b"],
  });
  assert.equal(result.state.players.a.flags["doumanCursedBy:d"], undefined);
  assert.equal(result.state.players.a.statuses.includes("诅咒"), false);
  assert.equal(result.state.players.b.flags["doumanCursedBy:d"], true);
});

test("Alter Ego reverses Evil Minister, reveals Douman's true name, and reverse power is a live 12-2X formula", () => {
  const { definitions, engine, state } = setup("douman-reverse-power");
  active(state, "evil", EVIL);
  active(state, "alter", ALTER);
  state.players.a.statuses.push("诅咒");
  state.players.a.flags["doumanCursedBy:d"] = true;
  state.players.d.trueNameRevealed = false;

  const result = engine.execute(state, command(state, "reverse-evil", CommandType.UseSkill, "d", {
    skillId: ALTER,
    data: { abilityId: "alter-ego-transform", targetInstanceId: "evil", reverse: true },
  }));
  assert.equal(result.state.cards.evil.reversed, true);
  assert.equal(result.state.players.d.trueNameRevealed, true);
  // three opponents, only A cursed => X=2, +8
  assert.equal(getStructuredCombatPower(result.state, "d", definitions, 10), 18);
  result.state.players.b.statuses.push("诅咒");
  result.state.players.b.flags["doumanCursedBy:d"] = true;
  // now X=1, +10; proves this is not a reversal-time snapshot
  assert.equal(getStructuredCombatPower(result.state, "d", definitions, 10), 20);
});

test("Ridicule Cat normal face rewards subsequent opponent defeats and penalizes cursed players that did not fight", () => {
  const { definitions, engine, state } = setup("douman-ridicule-normal");
  active(state, "evil", EVIL);
  active(state, "cat", CAT);
  state.players.d.victoryPoints = 1;
  state.players.a.victoryPoints = 7;
  state.players.b.victoryPoints = 7;

  let result = engine.execute(state, command(state, "curse-before-cat", CommandType.UseSkill, "d", {
    skillId: EVIL, data: { abilityId: "evil-minister-curse" },
  }));
  result = engine.execute(result.state, command(result.state, "cat-arm", CommandType.UseSkill, "d", {
    skillId: CAT, data: { abilityId: "ridicule-cat-normal" },
  }));
  emitPassive(engine, result.state, definitions, "player.defeated", { playerId: "a", reason: "combat" });
  assert.equal(result.state.players.d.victoryPoints, 2);
  emitPassive(engine, result.state, definitions, "combat.resolved", {
    locationId: "mountain", powers: { d: 9, a: 4 }, winnerIds: ["d"], defeatedPlayerIds: ["a"],
  });
  emitPassive(engine, result.state, definitions, "round.ending", { round: 4 });
  assert.equal(result.state.players.a.victoryPoints, 7); // fought this round
  assert.equal(result.state.players.b.victoryPoints, 4); // cursed and did not fight
});

test("Ridicule Cat reverse face prevents Curse loss for every player during this round", () => {
  const { definitions, engine, state } = setup("douman-ridicule-reverse");
  active(state, "evil", EVIL);
  active(state, "cat", CAT);
  active(state, "alter", ALTER);
  let result = engine.execute(state, command(state, "curse-for-preserve", CommandType.UseSkill, "d", {
    skillId: EVIL, data: { abilityId: "evil-minister-curse" },
  }));
  result = engine.execute(result.state, command(result.state, "reverse-cat", CommandType.UseSkill, "d", {
    skillId: ALTER, data: { abilityId: "alter-ego-transform", targetInstanceId: "cat", reverse: true },
  }));
  result = engine.execute(result.state, command(result.state, "preserve-curse", CommandType.UseSkill, "d", {
    skillId: CAT, data: { abilityId: "ridicule-cat-reverse" },
  }));
  assert.ok(Object.values(result.state.players).every((player) => player.flags.curseLossPreventedRound === 4));

  emitPassive(engine, result.state, definitions, "combat.resolved", {
    locationId: "mountain", powers: { d: 5, a: 8, b: 4 }, winnerIds: ["a"], defeatedPlayerIds: ["d", "b"],
  });
  assert.equal(result.state.players.a.flags["doumanCursedBy:d"], true);
  assert.ok(result.state.players.a.statuses.includes("诅咒"));
});
