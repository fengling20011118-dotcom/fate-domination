import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const GOLDEN = "servant.sanzang.skill.sc-sanzang-1";
const TEACHINGS = "servant.sanzang.skill.sc-sanzang-2";
const PALM = "servant.sanzang.skill.sc-sanzang-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "sanzang") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "s", name: "Sanzang" }, { id: "o", name: "Opponent" }], seed: 2020 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "o"];
  state.players.s.servantId = "servant.sanzang";
  state.board.locations.workshop = [];
  state.board.locations.mountain = [];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  state.players.s.locationId = "mountain";
  state.players.o.locationId = "city";
  state.board.locations.mountain.push("s");
  state.board.locations.city.push("o");
  return { built, engine, definitions, state };
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload = {}) {
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

test("Sanzang package: all three skills are FULL", () => {
  const { built } = setup("sanzang-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.sanzang");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(GOLDEN).handlerId, GOLDEN);
  assert.equal(built.skills.get(TEACHINGS).handlerId, "core.sanzang-teachings");
  assert.equal(built.skills.get(PALM).handlerId, "core.sanzang-five-elements-palm");
});

test("Teachings chooses X, pays 3X, draws X, removes exactly X cards and gains +4 per removed Luck", () => {
  const { engine, definitions, state } = setup("sanzang-teachings");
  state.players.s.mana = 6;
  createOwnedCardInstance(state, "s", { instanceId: "teachings", definitionId: TEACHINGS, zone: "attack", face: "up", active: true, residual: true });
  createOwnedCardInstance(state, "s", { instanceId: "luck", definitionId: "card.cardluck", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "s", { instanceId: "other", definitionId: "card.cardq1", zone: "deck", face: "down", active: false });
  state.players.s.deck = ["luck", "other"];

  emitPassive(engine, state, definitions, "card.played", { playerId: "s", instanceId: "teachings", definitionId: TEACHINGS, face: "up" });
  assert.equal(state.pendingDecision?.kind, "sanzang-teachings-x");
  assert.ok(state.pendingDecision?.options.some((option) => option.id === "2"));

  let result = engine.execute(state, command(state, "sanzang-x", CommandType.ResolveDecision, "s", {
    decisionId: state.pendingDecision.decisionId,
    selections: ["2"],
  }));
  assert.equal(result.state.players.s.mana, 0);
  assert.equal(result.state.pendingDecision?.kind, "sanzang-teachings-remove");
  assert.deepEqual(new Set(result.state.pendingDecision?.options.map((option) => option.id)), new Set(["luck", "other"]));

  result = engine.execute(result.state, command(result.state, "sanzang-remove", CommandType.ResolveDecision, "s", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["luck", "other"],
  }));
  assert.equal(result.state.cards.luck.zone, "removed");
  assert.equal(result.state.cards.other.zone, "removed");
  assert.equal(result.state.cards.teachings.residualUntilRound, 5);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.s, "teachings", definitions, "mountain"), 7);
});

test("Teachings allows X=0 and still establishes the two-round residual lifecycle", () => {
  const { engine, definitions, state } = setup("sanzang-teachings-zero");
  state.players.s.mana = 0;
  createOwnedCardInstance(state, "s", { instanceId: "teachings", definitionId: TEACHINGS, zone: "attack", face: "up", active: true, residual: true });
  emitPassive(engine, state, definitions, "card.played", { playerId: "s", instanceId: "teachings", definitionId: TEACHINGS, face: "up" });
  assert.deepEqual(state.pendingDecision?.options.map((option) => option.id), ["0"]);
  const result = engine.execute(state, command(state, "sanzang-zero", CommandType.ResolveDecision, "s", {
    decisionId: state.pendingDecision.decisionId,
    selections: ["0"],
  }));
  assert.equal(result.state.cards.teachings.residual, true);
  assert.equal(result.state.cards.teachings.residualUntilRound, 5);
  assert.equal(result.state.pendingDecision, null);
});

test("Five Elements Palm hides one legal attack for free, then reveals/discards it in combat and grants +5 for Luck", () => {
  const { engine, definitions, state } = setup("sanzang-palm");
  state.players.s.mana = 8;
  createOwnedCardInstance(state, "s", { instanceId: "palm", definitionId: PALM, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "s", { instanceId: "luck", definitionId: "card.cardluck", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "s", { instanceId: "skill", definitionId: TEACHINGS, zone: "hand", face: "down", active: false });

  let result = engine.execute(state, command(state, "palm-open", CommandType.UseSkill, "s", {
    skillId: PALM,
    data: { abilityId: "palm-hidden-attack" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "sanzang-palm-hidden-attack");
  assert.ok(result.state.pendingDecision?.options.some((option) => option.id === "luck"));
  assert.ok(!result.state.pendingDecision?.options.some((option) => option.id === "skill"));

  result = engine.execute(result.state, command(result.state, "palm-hide", CommandType.ResolveDecision, "s", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["luck"],
  }));
  assert.equal(result.state.cards.luck.zone, "attack");
  assert.equal(result.state.cards.luck.face, "down");
  assert.equal(result.state.cards.luck.active, false);
  assert.equal(result.state.cards.luck.paidCost, 0);

  result.state.phase = "combat";
  emitPassive(engine, result.state, definitions, "phase.transitioned", { previousPhase: "action", transition: "next-phase" });
  assert.equal(result.state.cards.luck.zone, "discard");
  assert.equal(result.state.cards.luck.face, "down");
  assert.equal(calculateCombatCardPower(result.state, result.state.players.s, "palm", definitions, "mountain"), 10);
});
