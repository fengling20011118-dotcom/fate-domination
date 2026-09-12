import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, drawCards } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { expireTimedManaGainBlock, gainMana } from "../src/rules-core/resources.ts";
import { SITONAI_COMBINATION_ID, SITONAI_FIMBUL_ID } from "../src/rules-core/sitonai.ts";

const ALTER_EGO = "servant.sitonai.skill.sc-sitonai-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "sitonai-package") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "s", name: "Sitonai" }, { id: "o", name: "Opponent" }], seed: 9009 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.players.s.servantId = "servant.sitonai";
  state.players.s.mana = 20;
  state.players.o.mana = 5;
  createOwnedCardInstance(state, "s", { instanceId: "combo", definitionId: SITONAI_COMBINATION_ID, zone: "servant-skills", face: "down", active: false });
  return { built, engine, definitions, state };
}

function addActive(state, ownerId, instanceId, definitionId) {
  createOwnedCardInstance(state, ownerId, { instanceId, definitionId, zone: "attack", face: "up", active: true });
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload) {
  passiveCounter += 1;
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${passiveCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Sitonai package is 3/3 FULL", () => {
  const { built } = setup("sitonai-full");
  const skills = [SITONAI_COMBINATION_ID, SITONAI_FIMBUL_ID, ALTER_EGO].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[0].handlerId, "core.sitonai-combination-attack");
  assert.equal(skills[1].handlerId, "core.sitonai-pohjola-fimbul");
  assert.equal(skills[0].hasReversalEffect, true);
  assert.equal(skills[1].hasReversalEffect, true);
  assert.equal(skills[2].handlerId, "core.alter-ego-transform");
});

test("Combination Attack pays exactly 3 mana and joins when exactly one Strength and one Magic attack are controlled", () => {
  const { engine, state } = setup("sitonai-combination-join");
  addActive(state, "s", "strength", "card.cardb1");
  addActive(state, "s", "magic", "card.carda1");
  // An active attack with neither Strength nor Magic does not change the exact counts.
  addActive(state, "s", "alter", ALTER_EGO);
  const before = state.players.s.mana;
  const result = engine.execute(state, command(state, "combo-join", CommandType.UseSkill, "s", {
    skillId: SITONAI_COMBINATION_ID,
    data: { abilityId: "combination-join" },
  }));
  assert.equal(result.state.players.s.mana, before - 3);
  assert.equal(result.state.cards.combo.zone, "attack");
  assert.equal(result.state.cards.combo.face, "up");
  assert.equal(result.state.cards.combo.active, true);
  assert.equal(result.state.cards.combo.paidCost, 0);
  assert.equal(result.state.cards.combo.joinedAttackRound, 4);
});

test("Combination Attack rejects an extra Strength or Magic attack atomically", () => {
  const { engine, state } = setup("sitonai-combination-reject");
  addActive(state, "s", "strength-a", "card.cardb1");
  addActive(state, "s", "strength-b", "card.cardb2");
  addActive(state, "s", "magic", "card.carda1");
  const before = state.players.s.mana;
  assert.throws(() => engine.execute(state, command(state, "combo-invalid", CommandType.UseSkill, "s", {
    skillId: SITONAI_COMBINATION_ID,
    data: { abilityId: "combination-join" },
  })), /SKILL_USE_FORBIDDEN|SITONAI_COMBINATION/);
  assert.equal(state.players.s.mana, before);
  assert.equal(state.cards.combo.zone, "servant-skills");
});

test("Alter Ego can reverse a card that joined the attack this round and reversed Combination Attack rewards a win", () => {
  const { engine, definitions, state } = setup("sitonai-combination-alter");
  addActive(state, "s", "strength", "card.cardb1");
  addActive(state, "s", "magic", "card.carda1");
  addActive(state, "s", "alter", ALTER_EGO);
  let result = engine.execute(state, command(state, "combo-join-before-alter", CommandType.UseSkill, "s", {
    skillId: SITONAI_COMBINATION_ID,
    data: { abilityId: "combination-join" },
  }));
  result = engine.execute(result.state, command(result.state, "alter-combo", CommandType.UseSkill, "s", {
    skillId: ALTER_EGO,
    data: { abilityId: "alter-ego-transform", targetInstanceId: "combo", reverse: true },
  }));
  assert.equal(result.state.cards.combo.reversed, true);
  assert.equal(result.state.cards.alter.zone, "servant-skills");
  const before = result.state.players.s.victoryPoints;
  emitPassive(engine, result.state, definitions, "combat.resolved", { locationId: "mountain", winnerIds: ["s"], powers: { s: 10, o: 5 } });
  assert.equal(result.state.players.s.victoryPoints, before + 4);
});

test("Pohjola Fimbul blocks ordinary attack-deck draws through the end of the next round", () => {
  const { engine, definitions, state } = setup("sitonai-fimbul-draw");
  createOwnedCardInstance(state, "s", { instanceId: "fimbul", definitionId: SITONAI_FIMBUL_ID, zone: "attack", face: "up", active: true });
  state.cards.fimbul.playedRound = state.round;
  createOwnedCardInstance(state, "s", { instanceId: "deck-a", definitionId: "card.cardb1", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "s", { instanceId: "deck-b", definitionId: "card.cardb2", zone: "deck", face: "down", active: false });
  const result = engine.execute(state, command(state, "fimbul-draw-block", CommandType.UseSkill, "s", {
    skillId: SITONAI_FIMBUL_ID,
    data: { abilityId: "freeze-forces" },
  }));
  assert.equal(result.state.players.s.flags.normalCardDrawBlockedThroughRound, 5);
  assert.equal(result.state.players.o.flags.normalCardDrawBlockedThroughRound, 5);
  assert.deepEqual(drawCards(result.state, "s", 1, () => 0, definitions), []);
  result.state.round = 5;
  assert.deepEqual(drawCards(result.state, "s", 1, () => 0, definitions), []);
  result.state.round = 6;
  assert.deepEqual(drawCards(result.state, "s", 1, () => 0, definitions), ["deck-a"]);
});

test("Altered Pohjola Fimbul blocks mana gain instead of draws and expires after the next round", () => {
  const { engine, state } = setup("sitonai-fimbul-mana");
  createOwnedCardInstance(state, "s", { instanceId: "fimbul", definitionId: SITONAI_FIMBUL_ID, zone: "attack", face: "up", active: true });
  state.cards.fimbul.playedRound = state.round;
  addActive(state, "s", "alter", ALTER_EGO);
  let result = engine.execute(state, command(state, "alter-fimbul", CommandType.UseSkill, "s", {
    skillId: ALTER_EGO,
    data: { abilityId: "alter-ego-transform", targetInstanceId: "fimbul", reverse: true },
  }));
  result = engine.execute(result.state, command(result.state, "fimbul-mana-block", CommandType.UseSkill, "s", {
    skillId: SITONAI_FIMBUL_ID,
    data: { abilityId: "freeze-forces" },
  }));
  assert.equal(result.state.players.s.flags.normalCardDrawBlockedThroughRound, undefined);
  assert.equal(result.state.players.s.flags.manaGainBlockedThroughRound, 5);
  assert.equal(result.state.players.o.flags.manaGainBlockedThroughRound, 5);
  const before = result.state.players.o.mana;
  assert.equal(gainMana(result.state.players.o, 3), 0);
  assert.equal(result.state.players.o.mana, before);
  expireTimedManaGainBlock(result.state.players.o, 5);
  assert.equal(gainMana(result.state.players.o, 1), 0);
  expireTimedManaGainBlock(result.state.players.o, 6);
  assert.equal(gainMana(result.state.players.o, 1), 1);
});
