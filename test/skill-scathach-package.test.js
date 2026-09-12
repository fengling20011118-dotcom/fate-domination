import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { getCombatResponseResponderIds } from "../src/rules-core/skill-handlers.ts";

const WISDOM = "servant.scathach.skill.sc-scathach-1";
const SPEAR = "servant.scathach.skill.sc-scathach-2";
const GATE = "servant.scathach.skill.sc-scathach-3";

function command(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "scathach", playerCount = 3) {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const players = Array.from({ length: playerCount }, (_, index) => ({ id: index === 0 ? "s" : String.fromCharCode(96 + index), name: `P${index}` }));
  const state = createGameState({ gameInstanceId: id, players, seed: 9701 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "s";
  state.turnOrder = players.map((player) => player.id);
  state.players.s.servantId = "servant.scathach";
  state.players.s.mana = 20;
  for (const player of Object.values(state.players)) player.locationId = "mountain";
  state.board.locations.mountain = state.turnOrder.slice();
  return { built, definitions, engine: new StandardMatchEngine(built), state };
}

function add(state, playerId, instanceId, definitionId, zone = "attack", active = true) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face: active ? "up" : "down",
    active,
    residual: false,
  });
}

function setWisdomMode(state, mode) {
  const source = add(state, "s", "wisdom", WISDOM, "attack", true);
  source.modifiers.push(`scathach-wisdom-mode:${state.round}:${mode}`);
  return source;
}

test("Scathach package: all three skills are FULL", () => {
  const { built } = setup("scathach-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.scathach");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(WISDOM).handlerId, "core.scathach-wisdom");
  assert.deepEqual(built.skills.get(WISDOM).rules?.ambiguities ?? [], []);
});

test("Gae Bolg Alternative lets the sole opponent choose which non-residual attack to close", () => {
  const { engine, state } = setup("scathach-spear-opponent-choice", 2);
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "s";
  add(state, "s", "spear", SPEAR, "attack", true);
  add(state, "a", "normal-a", "card.cardq2", "attack", true);
  add(state, "a", "normal-b", "card.cardb2", "attack", true);
  const residual = add(state, "a", "residual", "card.cardb3", "attack", true);
  residual.residual = true;

  let result = engine.execute(state, command(state, "spear-use", CommandType.UseSkill, "s", {
    skillId: SPEAR, data: { abilityId: "piercing-spear-close" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "structured-each-player-card-choice");
  assert.deepEqual(result.state.pendingDecision?.chooserPlayerIds, ["a"]);
  assert.deepEqual(new Set(result.state.pendingDecision?.options.map((option) => option.id)), new Set(["normal-a", "normal-b"]));
  result = engine.execute(result.state, command(result.state, "spear-choice", CommandType.ResolveDecision, "a", {
    decisionId: result.state.pendingDecision.decisionId, selections: ["normal-b"],
  }));
  assert.equal(result.state.cards["normal-b"].active, false);
  assert.equal(result.state.cards["normal-a"].active, true);
  assert.equal(result.state.cards.residual.active, true);
});

test("Gate of Skye counts only mana actually lost by this ability and defeats Corrupted-Grail-style infinite mana", () => {
  const { engine, state } = setup("scathach-gate-infinite", 3);
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "s";
  add(state, "s", "gate", GATE, "attack", true);
  state.players.a.mana = 11;
  state.players.a.flags.infiniteMana = true;
  state.players.b.mana = 8;

  const result = engine.execute(state, command(state, "gate-use", CommandType.UseSkill, "s", { skillId: GATE }));
  assert.equal(result.state.players.a.mana, 11);
  assert.equal(result.state.players.a.defeated, true);
  assert.equal(result.state.players.b.mana, 0);
  assert.equal(result.state.players.b.defeated, false);
});

test("Wisdom of Dun Scaith chooses exactly one mode when played", () => {
  const { engine, state } = setup("scathach-mode", 1);
  add(state, "s", "wisdom-play", WISDOM, "servant-skills", false);
  add(state, "s", "basic", "card.cardb2", "hand", false);
  let result = engine.execute(state, command(state, "wisdom-play", CommandType.CommitAttack, "s", {
    faceUpInstanceIds: ["wisdom-play", "basic"], faceDownInstanceIds: [],
  }));
  assert.equal(result.state.pendingDecision?.kind, "scathach-wisdom-mode");
  assert.deepEqual(new Set(result.state.pendingDecision.options.map((option) => option.id)), new Set(["zero-magic", "move-anywhere", "strict-second"]));
  result = engine.execute(result.state, command(result.state, "wisdom-mode", CommandType.ResolveDecision, "s", {
    decisionId: result.state.pendingDecision.decisionId, selections: ["zero-magic"],
  }));
  assert.ok(result.state.cards["wisdom-play"].modifiers.includes("scathach-wisdom-mode:4:zero-magic"));
});

test("Wisdom magic mode zeroes every engaged opponent Magic attack only", () => {
  const { engine, definitions, state } = setup("scathach-zero", 2);
  setWisdomMode(state, "zero-magic");
  add(state, "a", "magic", "card.carda2", "attack", true);
  add(state, "a", "strength", "card.cardb2", "attack", true);
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "s";
  const result = engine.execute(state, command(state, "wisdom-zero", CommandType.UseSkill, "s", {
    skillId: WISDOM, data: { abilityId: "wisdom-zero-magic" },
  }));
  assert.equal(calculateCombatCardPower(result.state, result.state.players.a, "magic", definitions, "mountain"), 0);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.a, "strength", definitions, "mountain"), 3);
});

test("Wisdom move mode opens a destination choice and moves by the generic effect-movement path", () => {
  const { engine, state } = setup("scathach-move", 1);
  setWisdomMode(state, "move-anywhere");
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "s";
  let result = engine.execute(state, command(state, "wisdom-move", CommandType.UseSkill, "s", {
    skillId: WISDOM, data: { abilityId: "wisdom-move-anywhere" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "scathach-wisdom-move");
  assert.ok(result.state.pendingDecision.options.some((option) => option.id === "city"));
  result = engine.execute(result.state, command(result.state, "wisdom-move-city", CommandType.ResolveDecision, "s", {
    decisionId: result.state.pendingDecision.decisionId, selections: ["city"],
  }));
  assert.equal(result.state.players.s.locationId, "city");
});

test("Wisdom strict-second mode uses the same power judgement as Presence Concealment", () => {
  const { built, definitions, engine, state } = setup("scathach-strict", 3);
  setWisdomMode(state, "strict-second");
  state.phase = "combat";
  state.step = "post-power-response";
  state.activePlayerId = "s";
  const snapshot = {
    locationId: "mountain",
    participantIds: ["s", "a", "b"],
    powers: { s: 5, a: 8, b: 8 },
    attributes: { s: [], a: [], b: [] },
    round: 4,
  };
  assert.deepEqual(getCombatResponseResponderIds(state, built.skills, snapshot, definitions), ["s"]);
  state.modeState.pendingCombatResolution = { snapshot, responderIds: ["s"], nextResponderIndex: 0 };
  const result = engine.execute(state, command(state, "wisdom-strict-use", CommandType.UseSkill, "s", {
    skillId: WISDOM, data: { abilityId: "wisdom-strict-second" },
  }));
  assert.equal(result.state.players.a.defeated, true);
  assert.equal(result.state.players.b.defeated, true);

  const bad = structuredClone(snapshot);
  bad.powers = { s: 5, a: 8, b: 7 };
  const badState = structuredClone(state);
  delete badState.modeState.pendingCombatResolution;
  assert.deepEqual(getCombatResponseResponderIds(badState, built.skills, bad, definitions), []);
});
