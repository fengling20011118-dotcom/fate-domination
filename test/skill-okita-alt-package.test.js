import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const ALTER_EGO = "servant.okita-alt.skill.sc-okita-alt-1";
const BOUNDLESS = "servant.okita-alt.skill.sc-okita-alt-2";
const RENGOKU = "servant.okita-alt.skill.sc-okita-alt-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "okita-alt") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "o", name: "Okita Alter" }, { id: "x", name: "Opponent" }], seed: 1901 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "o";
  state.turnOrder = ["o", "x"];
  state.players.o.servantId = "servant.okita-alt";
  return { built, definitions, engine, state };
}

test("Okita Alter package: all three skills are FULL and Rengoku is a low-mana playable Alter target", () => {
  const { built, definitions, state } = setup("okita-alt-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.okita-alt");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(ALTER_EGO).handlerId, "core.alter-ego-transform");
  assert.equal(built.skills.get(BOUNDLESS).handlerId, "core.okita-alt-boundless");
  assert.equal(built.skills.get(RENGOKU).handlerId, "core.okita-alt-rengoku");
  assert.equal(built.skills.get(RENGOKU).hasReversalEffect, true);
  createOwnedCardInstance(state, "o", { instanceId: "rengoku", definitionId: RENGOKU, zone: "servant-skills", face: "down", active: false });
  state.players.o.mana = 2;
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "o", instanceId: "rengoku", definitions, faceDown: false }));
});

test("Boundless repeatedly joins matching basics for free, loses one mana per join, and stops by discarding the first mismatch", () => {
  const { engine, state } = setup("okita-alt-boundless-mismatch");
  state.players.o.mana = 3;
  createOwnedCardInstance(state, "o", { instanceId: "boundless", definitionId: BOUNDLESS, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "seed-strength", definitionId: "card.cardb2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "match-strength", definitionId: "card.cardb3", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "mismatch-magic", definitionId: "card.carda2", zone: "deck", face: "down", active: false });

  const result = engine.execute(state, command(state, "okita-alt-boundless-use", CommandType.UseSkill, "o", {
    skillId: BOUNDLESS,
    data: { abilityId: "boundless-chain" },
  }));
  assert.equal(result.state.cards["match-strength"].zone, "attack");
  assert.equal(result.state.cards["match-strength"].active, true);
  assert.equal(result.state.cards["match-strength"].paidCost, 0);
  assert.equal(result.state.cards["mismatch-magic"].zone, "discard");
  assert.equal(result.state.cards["mismatch-magic"].face, "up");
  assert.equal(result.state.players.o.mana, 2);
  assert.equal(result.state.players.o.defeated, false);
});

test("Boundless immediately stops and defeats Okita Alter when a successful join reduces her mana to zero", () => {
  const { engine, state } = setup("okita-alt-boundless-zero");
  state.players.o.mana = 1;
  createOwnedCardInstance(state, "o", { instanceId: "boundless", definitionId: BOUNDLESS, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "seed-strength", definitionId: "card.cardb2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "match-strength", definitionId: "card.cardb3", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "would-be-next", definitionId: "card.cardb2", zone: "deck", face: "down", active: false });

  const result = engine.execute(state, command(state, "okita-alt-boundless-zero-use", CommandType.UseSkill, "o", {
    skillId: BOUNDLESS,
    data: { abilityId: "boundless-chain" },
  }));
  assert.equal(result.state.players.o.mana, 0);
  assert.equal(result.state.players.o.defeated, true);
  assert.equal(result.state.cards["match-strength"].zone, "attack");
  assert.equal(result.state.cards["would-be-next"].zone, "deck");
});

test("Rengoku normal face selects exactly two basic discard cards and shuffles them back into the deck", () => {
  const { engine, state } = setup("okita-alt-rengoku-normal");
  createOwnedCardInstance(state, "o", { instanceId: "rengoku", definitionId: RENGOKU, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "b1", definitionId: "card.cardb2", zone: "discard", face: "up", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "b2", definitionId: "card.cardq2", zone: "discard", face: "up", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "b3", definitionId: "card.carda2", zone: "discard", face: "up", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "luck", definitionId: "card.cardluck", zone: "discard", face: "up", active: false });

  let result = engine.execute(state, command(state, "okita-alt-rengoku-open", CommandType.UseSkill, "o", {
    skillId: RENGOKU,
    data: { abilityId: "rengoku-return-basics" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "okita-alt-rengoku-return-basics");
  result = engine.execute(result.state, command(result.state, "okita-alt-rengoku-pick", CommandType.ResolveDecision, "o", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["b1", "b2"],
  }));
  assert.ok(result.state.players.o.deck.includes("b1"));
  assert.ok(result.state.players.o.deck.includes("b2"));
  assert.equal(result.state.cards.b1.zone, "deck");
  assert.equal(result.state.cards.b2.zone, "deck");
  assert.equal(result.state.cards.b3.zone, "discard");
  assert.equal(result.state.cards.luck.zone, "discard");
});

test("Rengoku Alter/Purgatory removes the entire discard and gives the reversed source +8 when at least two cards were removed", () => {
  const { engine, definitions, state } = setup("okita-alt-rengoku-alter");
  createOwnedCardInstance(state, "o", { instanceId: "rengoku", definitionId: RENGOKU, zone: "attack", face: "up", active: true });
  state.cards.rengoku.reversed = true;
  createOwnedCardInstance(state, "o", { instanceId: "d1", definitionId: "card.cardb2", zone: "discard", face: "up", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "d2", definitionId: "card.cardluck", zone: "discard", face: "up", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "d3", definitionId: "card.cardq2", zone: "discard", face: "up", active: false });
  const before = calculateCombatCardPower(state, state.players.o, "rengoku", definitions, "mountain");

  const result = engine.execute(state, command(state, "okita-alt-purgatory-use", CommandType.UseSkill, "o", {
    skillId: RENGOKU,
    data: { abilityId: "rengoku-alter-purgatory" },
  }));
  assert.deepEqual(result.state.players.o.discard, []);
  assert.equal(result.state.cards.d1.zone, "removed");
  assert.equal(result.state.cards.d2.zone, "removed");
  assert.equal(result.state.cards.d3.zone, "removed");
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "rengoku", definitions, "mountain"), before + 8);
});
