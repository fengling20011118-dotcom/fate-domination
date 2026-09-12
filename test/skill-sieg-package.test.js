import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { captureStateFacts, emitStateFactDiff } from "../src/rules-core/state-facts.ts";
import { payManaCost } from "../src/rules-core/costs.ts";
import { SIEG_BALMUNG_ID, SIEG_GALVANISM_ID, SIEG_LINDEN_LEAF_ABILITY_ID, SIEG_TRANSFORMED_ROUND_FLAG, siegLindenLeafGrantKey } from "../src/rules-core/sieg.ts";

const TRANSFORM = "master.sieg.skill.s1a";
const OVERLOAD = "master.sieg.skill.s1";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "sieg-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "s", name: "Sieg" }, { id: "o", name: "Opponent" }, { id: "f", name: "Far" }],
    seed: 6011,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "o", "f"];
  state.players.s.masterId = "master.sieg";
  state.players.s.mana = 10;
  state.players.s.commandSeals = 3;
  state.players.o.mana = 10;
  state.players.f.mana = 10;
  state.players.s.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.f.locationId = "city";
  state.board.locations.mountain = ["s", "o"];
  state.board.locations.city = ["f"];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function addZeroBasic(state, playerId, instanceId) {
  createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId: "card.cardb1",
    zone: "hand",
    face: "down",
    active: false,
  });
}

function addAscension(state) {
  createOwnedCardInstance(state, "s", {
    instanceId: "galvanism",
    definitionId: SIEG_GALVANISM_ID,
    zone: "master-skills",
    face: "up",
    active: false,
  });
}

test("Sieg package: all four skills are FULL and Balmung is Transform-only physical content", () => {
  const { built } = setup("sieg-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.sieg");
  assert.equal(skills.length, 4);
  assert.deepEqual(skills.map((skill) => skill.supportLevel), ["FULL", "FULL", "FULL", "FULL"]);
  assert.equal(built.skills.get(OVERLOAD).handlerId, "core.game-start-rule-flags");
  assert.equal(built.skills.get(TRANSFORM).handlerId, "core.sieg-dragon-command-seal");
  assert.equal(built.skills.get(SIEG_BALMUNG_ID).handlerId, "core.sieg-balmung");
  assert.equal(built.skills.get(SIEG_BALMUNG_ID).initiallyOwned, false);
  assert.equal(built.skills.get(SIEG_GALVANISM_ID).handlerId, "core.sieg-galvanism");
  assert.equal(built.skills.get(SIEG_GALVANISM_ID).initiallyOwned, false);
});

test("Transform consumes one seal, gains two mana, creates temporary Balmung, and marks [transformed] for this round", () => {
  const { engine, state } = setup("sieg-transform");
  const result = engine.execute(state, command(state, "transform", CommandType.UseSkill, "s", { skillId: TRANSFORM }));
  const balmungId = `s:derived:${TRANSFORM}:round-4`;
  assert.equal(result.state.players.s.commandSeals, 2);
  assert.equal(result.state.players.s.mana, 12);
  assert.equal(result.state.players.s.flags[SIEG_TRANSFORMED_ROUND_FLAG], 4);
  assert.equal(result.state.cards[balmungId].definitionId, SIEG_BALMUNG_ID);
  assert.equal(result.state.cards[balmungId].zone, "master-skills");
  assert.equal(result.state.cards[balmungId].temporary, true);
});

test("Balmung paid normally does not grant Linden Leaf retaliation", () => {
  const { engine, state } = setup("sieg-balmung-paid");
  addZeroBasic(state, "s", "basic");
  let result = engine.execute(state, command(state, "transform-paid", CommandType.UseSkill, "s", { skillId: TRANSFORM }));
  const balmungId = `s:derived:${TRANSFORM}:round-4`;
  result = engine.execute(result.state, command(result.state, "play-paid", CommandType.CommitAttack, "s", {
    faceUpInstanceIds: [balmungId, "basic"],
    faceDownInstanceIds: [],
  }));
  assert.equal(result.state.cards[balmungId].paidCost, 4);
  assert.equal(result.state.players.o.flags[siegLindenLeafGrantKey(balmungId)], undefined);
});

test("Free Balmung grants Linden Leaf only to same-battlefield opponents; qualifying Agility attack can defeat Sieg", () => {
  const { engine, state } = setup("sieg-balmung-free");
  addZeroBasic(state, "s", "basic");
  let result = engine.execute(state, command(state, "transform-free", CommandType.UseSkill, "s", { skillId: TRANSFORM }));
  const balmungId = `s:derived:${TRANSFORM}:round-4`;
  result = engine.execute(result.state, command(result.state, "arm-free", CommandType.UseSkill, "s", {
    skillId: SIEG_BALMUNG_ID,
    data: { abilityId: "linden-leaf-free-play" },
  }));
  result = engine.execute(result.state, command(result.state, "play-free", CommandType.CommitAttack, "s", {
    faceUpInstanceIds: [balmungId, "basic"],
    faceDownInstanceIds: [],
  }));
  assert.equal(result.state.cards[balmungId].paidCost, 0);
  assert.equal(result.state.players.o.flags[siegLindenLeafGrantKey(balmungId)], 4);
  assert.equal(result.state.players.f.flags[siegLindenLeafGrantKey(balmungId)], undefined);

  createOwnedCardInstance(result.state, "o", {
    instanceId: "agility-five",
    definitionId: "card.cardq4",
    zone: "attack",
    face: "up",
    active: true,
  });
  result.state.activePlayerId = "o";
  result.state.step = "player-window";
  result = engine.execute(result.state, command(result.state, "linden-retaliate", CommandType.UseCardAbility, "o", {
    instanceId: "agility-five",
    ability: SIEG_LINDEN_LEAF_ABILITY_ID,
  }));
  assert.equal(result.state.cards["agility-five"].active, false);
  assert.equal(result.state.players.s.defeated, true);
});

test("Linden Leaf respects defeat immunity", () => {
  const { engine, state } = setup("sieg-linden-luck");
  addZeroBasic(state, "s", "basic");
  let result = engine.execute(state, command(state, "transform-luck", CommandType.UseSkill, "s", { skillId: TRANSFORM }));
  const balmungId = `s:derived:${TRANSFORM}:round-4`;
  result = engine.execute(result.state, command(result.state, "arm-luck", CommandType.UseSkill, "s", {
    skillId: SIEG_BALMUNG_ID,
    data: { abilityId: "linden-leaf-free-play" },
  }));
  result = engine.execute(result.state, command(result.state, "play-luck", CommandType.CommitAttack, "s", {
    faceUpInstanceIds: [balmungId, "basic"], faceDownInstanceIds: [],
  }));
  result.state.players.s.flags.ignoreDefeat = true;
  createOwnedCardInstance(result.state, "o", { instanceId: "agility-seven", definitionId: "card.cardq5", zone: "attack", face: "up", active: true });
  result.state.activePlayerId = "o";
  result.state.step = "player-window";
  result = engine.execute(result.state, command(result.state, "linden-luck", CommandType.UseCardAbility, "o", {
    instanceId: "agility-seven", ability: SIEG_LINDEN_LEAF_ABILITY_ID,
  }));
  assert.equal(result.state.cards["agility-seven"].active, false);
  assert.equal(result.state.players.s.defeated, false);
});

test("Galvanism recovers one seal from one same-location payment of 4+ mana", () => {
  const { engine, state } = setup("sieg-galvanism-payment");
  addAscension(state);
  state.activePlayerId = "o";
  state.players.s.commandSeals = 1;
  createOwnedCardInstance(state, "o", { instanceId: "cost-five", definitionId: "card.cardb6", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "free", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  const result = engine.execute(state, command(state, "opponent-spend-five", CommandType.CommitAttack, "o", {
    faceUpInstanceIds: ["cost-five", "free"], faceDownInstanceIds: [],
  }));
  assert.equal(result.state.players.o.mana, 5);
  assert.equal(result.state.players.s.commandSeals, 2);
  const spendEvents = result.events.filter((event) => event.type === "player.mana.spent");
  assert.equal(spendEvents.length, 1);
  assert.equal(spendEvents[0].payload.playerId, "o");
  assert.equal(spendEvents[0].payload.amount, 5);
});

test("Mana-spend facts preserve individual transactions: 2+2 never becomes one synthetic 4", () => {
  const { definitions, state } = setup("sieg-mana-ledger");
  const before = captureStateFacts(state);
  const events = [];
  payManaCost(state, state.players.o, 2, definitions);
  payManaCost(state, state.players.o, 2, definitions);
  emitStateFactDiff(before, state, (type, payload) => events.push({ type, payload }), { sourceId: "test" });
  const spent = events.filter((event) => event.type === "player.mana.spent");
  assert.deepEqual(spent.map((event) => event.payload.amount), [2, 2]);
  assert.equal(spent.some((event) => event.payload.amount >= 4), false);
});

test("Galvanism gives +3 only to basic Strength attacks while [transformed] this round", () => {
  const { engine, definitions, state } = setup("sieg-transformed-power");
  addAscension(state);
  createOwnedCardInstance(state, "s", { instanceId: "strength", definitionId: "card.cardb1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "s", { instanceId: "agility", definitionId: "card.cardq1", zone: "attack", face: "up", active: true });
  const strengthBefore = calculateCombatCardPower(state, state.players.s, "strength", definitions);
  const agilityBefore = calculateCombatCardPower(state, state.players.s, "agility", definitions);

  const result = engine.execute(state, command(state, "transform-power", CommandType.UseSkill, "s", { skillId: TRANSFORM }));
  const strengthAfter = calculateCombatCardPower(result.state, result.state.players.s, "strength", definitions);
  const agilityAfter = calculateCombatCardPower(result.state, result.state.players.s, "agility", definitions);
  assert.equal(strengthAfter, strengthBefore + 3);
  assert.equal(agilityAfter, agilityBefore);

  result.state.round = 5;
  assert.equal(calculateCombatCardPower(result.state, result.state.players.s, "strength", definitions), strengthBefore);
});
