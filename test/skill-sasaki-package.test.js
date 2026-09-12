import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { payCommandSealCost, spendNormalCommandSeal } from "../src/rules-core/command-seals.ts";
import { isAbilityActivationBlocked } from "../src/rules-core/ability-activation-restrictions.ts";

const FIRST = "servant.sasaki.skill.sc-sasaki-1";
const SECOND = "servant.sasaki.skill.sc-sasaki-2";
const THIRD = "servant.sasaki.skill.sc-sasaki-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "sasaki") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "s", name: "Sasaki" }, { id: "o", name: "Opponent" }], seed: 2611 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "o"];
  state.players.s.servantId = "servant.sasaki";
  state.players.s.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["s", "o"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  state.players.s.mana = 30;
  state.players.o.mana = 20;
  state.players.s.commandSeals = 3;
  state.players.o.commandSeals = 3;
  return { built, definitions, engine, state };
}

function addSkill(state, instanceId, definitionId, zone = "servant-skills", active = false) {
  createOwnedCardInstance(state, "s", { instanceId, definitionId, zone, face: zone === "attack" ? "up" : "up", active });
}

function resolve(engine, state, id, actorId, selections) {
  return engine.execute(state, command(state, id, CommandType.ResolveDecision, actorId, {
    decisionId: state.pendingDecision.decisionId,
    selections,
  }));
}

test("Sasaki package is 3/3 FULL and Third Strike carries the authored two-Agility append requirement", () => {
  const { built } = setup("sasaki-full");
  const skills = [FIRST, SECOND, THIRD].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(skills[0].requiresEightMana, false);
  assert.equal(skills[2].standardAppend, true);
  assert.deepEqual(skills[2].standardAppendRequiresBatchCards, { minCount: 2, attributesAny: ["迅捷"] });
  assert.equal(skills[2].revealsTrueNameOnPlay, false);
});

test("Third Strike cannot consume the append slot unless two other Agility attacks are in the same standard batch", () => {
  const { engine, state } = setup("sasaki-append");
  addSkill(state, "third", THIRD);
  createOwnedCardInstance(state, "s", { instanceId: "agi", definitionId: "card.cardq1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "s", { instanceId: "str", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  assert.throws(() => engine.execute(state, command(state, "bad-append", CommandType.CommitAttack, "s", {
    faceUpInstanceIds: ["agi", "str", "third"], faceDownInstanceIds: [],
  })), /STANDARD_APPEND_BATCH_REQUIREMENT_NOT_MET/);

  const next = setup("sasaki-append-good");
  addSkill(next.state, "third", THIRD);
  createOwnedCardInstance(next.state, "s", { instanceId: "agi1", definitionId: "card.cardq1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(next.state, "s", { instanceId: "agi2", definitionId: "card.cardq2", zone: "hand", face: "down", active: false });
  const result = next.engine.execute(next.state, command(next.state, "good-append", CommandType.CommitAttack, "s", {
    faceUpInstanceIds: ["agi1", "agi2", "third"], faceDownInstanceIds: [],
  }));
  assert.equal(result.state.cards.third.zone, "attack");
  assert.equal(result.state.cards.third.active, true);
  assert.equal(result.state.players.s.trueNameRevealed, false);
});

test("Tsubame Gaeshi reveals Sasaki and gives +3 only while First, Second and Third Strike remain in play", () => {
  const { engine, definitions, state } = setup("sasaki-tsubame");
  addSkill(state, "first", FIRST);
  addSkill(state, "second", SECOND);
  addSkill(state, "third", THIRD);
  const result = engine.execute(state, command(state, "three-strikes", CommandType.CommitAttack, "s", {
    faceUpInstanceIds: ["first", "second", "third"], faceDownInstanceIds: [],
  }));
  assert.equal(result.state.players.s.trueNameRevealed, true);
  assert.equal(result.state.activeRuleModifiers.some((modifier) => modifier.sourceId === THIRD && modifier.rule === "combat_power" && modifier.value === 3), true);
  const before = calculateCombatPower(result.state, result.state.players.s, definitions, "mountain");

  result.state.phase = "combat";
  result.state.step = "player-window";
  result.state.activePlayerId = "s";
  createOwnedCardInstance(result.state, "s", { instanceId: "strength", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  let current = engine.execute(result.state, command(result.state, "first-use", CommandType.UseSkill, "s", {
    skillId: FIRST, data: { abilityId: "pommel-strike-feint" },
  }));
  current = resolve(engine, current.state, "first-play-strength", "s", ["strength"]);
  if (current.state.pendingDecision) current = resolve(engine, current.state, "first-close-none", "s", ["none"]);
  assert.equal(current.state.cards.first.zone, "servant-skills");
  assert.equal(current.state.activeRuleModifiers.some((modifier) => modifier.sourceId === THIRD && modifier.rule === "combat_power"), false);
  assert.ok(calculateCombatPower(current.state, current.state.players.s, definitions, "mountain") <= before - 1);
});

test("First Strike closes itself first, plays a basic Strength from hand, gains 2 mana and may close another player's basic attack", () => {
  const { engine, state } = setup("sasaki-first");
  state.phase = "combat";
  state.step = "player-window";
  addSkill(state, "first", FIRST, "attack", true);
  createOwnedCardInstance(state, "s", { instanceId: "strength", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "target", definitionId: "card.cardq1", zone: "attack", face: "up", active: true });
  const manaBefore = state.players.s.mana;
  let result = engine.execute(state, command(state, "first", CommandType.UseSkill, "s", {
    skillId: FIRST, data: { abilityId: "pommel-strike-feint" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "sasaki-first-card");
  result = resolve(engine, result.state, "first-card", "s", ["strength"]);
  assert.equal(result.state.cards.first.zone, "servant-skills");
  assert.equal(result.state.cards.strength.zone, "attack");
  assert.equal(result.state.players.s.mana, manaBefore + 2);
  assert.equal(result.state.pendingDecision?.kind, "sasaki-first-close");
  result = resolve(engine, result.state, "first-target", "s", ["target"]);
  assert.equal(result.state.cards.target.active, false);
  assert.equal(result.state.cards.target.face, "down");
  assert.equal(result.state.cards.target.zone, "attack");
});

test("Second Strike blocks later Action/Combat activation on Sasaki's battlefield, including Command Seal use but not seal payment", () => {
  const { engine, state } = setup("sasaki-second");
  state.step = "player-window";
  addSkill(state, "second", SECOND, "attack", true);
  const result = engine.execute(state, command(state, "second", CommandType.UseSkill, "s", {
    skillId: SECOND, data: { abilityId: "beyond-skill" },
  }));
  assert.equal(isAbilityActivationBlocked(result.state, "o", "action"), true);
  assert.equal(isAbilityActivationBlocked(result.state, "o", "combat"), true);
  assert.equal(isAbilityActivationBlocked(result.state, "s", "action"), false);
  assert.throws(() => spendNormalCommandSeal(result.state, "o"), /COMMAND_SEAL_USE_BLOCKED/);
  const before = result.state.players.o.commandSeals;
  assert.deepEqual(payCommandSealCost(result.state, "o", 1), { paidSeals: 1, substitutionCredits: 0 });
  assert.equal(result.state.players.o.commandSeals, before - 1);

  result.state.players.o.locationId = "city";
  result.state.board.locations.mountain = ["s"];
  result.state.board.locations.city = ["o"];
  assert.equal(isAbilityActivationBlocked(result.state, "o", "action"), false);
  assert.doesNotThrow(() => spendNormalCommandSeal(result.state, "o"));
});
