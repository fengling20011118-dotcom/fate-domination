import test from "node:test";
import assert from "node:assert/strict";

import content from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function buildFixture() {
  const built = buildStandardContent(content);
  return { built, engine: new StandardMatchEngine(built) };
}

function setupState() {
  const state = createGameState({ gameInstanceId: "irisviel-life-giving", players: [{ id: "iri", name: "爱丽丝菲尔" }], seed: 802 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "iri";
  state.players.iri.masterId = "master.irisviel";
  state.players.iri.mana = 10;
  createOwnedCardInstance(state, "iri", { instanceId: "life", definitionId: "master.irisviel.skill.ascension", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "iri", { instanceId: "basic", definitionId: "card.cardb1", zone: "attack", face: "up", active: true });
  state.cards.basic.playedRound = 4;
  return state;
}

test("Irisviel package: all master skills are FULL and Life Giving has two active-card abilities", () => {
  const { built } = buildFixture();
  const ids = ["master.irisviel.skill.s1", "master.irisviel.skill.s2", "master.irisviel.skill.ascension"];
  assert.deepEqual(ids.map((id) => built.skills.get(id).supportLevel), ["FULL", "FULL", "FULL"]);
  const ascension = built.skills.get("master.irisviel.skill.ascension");
  assert.equal(ascension.handlerId, "core.active-attack-lifecycle-boost");
  assert.equal(ascension.requiresActiveCard, true);
  assert.deepEqual(ascension.abilities.map((ability) => ability.id), ["keep-basic-active", "magic-attack-boost"]);
  assert.equal(ascension.activeAttackLifecycleBoost.boostAttribute, "魔术");
  assert.equal(ascension.activeAttackLifecycleBoost.boostPower, 1);
});

test("Irisviel package: Life Giving keeps a current-round basic attack until next round end", () => {
  const { built, engine } = buildFixture();
  let state = setupState();
  let result = engine.execute(state, command(state, "life-keep", CommandType.UseSkill, "iri", {
    skillId: "master.irisviel.skill.ascension",
    data: { abilityId: "keep-basic-active", instanceId: "basic" },
  }));
  state = result.state;

  assert.equal(state.cards.basic.residual, true);
  assert.ok(state.cards.basic.modifiers.includes("residual-until-round-end:5:master.irisviel.skill.ascension"));

  endStandardRound(state, built.cards);
  assert.equal(state.cards.basic.zone, "attack");
  assert.equal(state.cards.basic.residual, true);
  assert.ok(state.players.iri.attack.includes("basic"));

  state.round = 5;
  endStandardRound(state, built.cards);
  assert.equal(state.cards.basic.residual, false);
  assert.equal(state.cards.basic.zone, "discard");
  assert.ok(state.players.iri.discard.includes("basic"));
});

test("Irisviel package: Life Giving combat ability grants magic attribute and +1 power for this round", () => {
  const { built, engine } = buildFixture();
  let state = setupState();
  state.phase = "combat";
  state.step = "player-window";
  const beforePower = calculateCombatCardPower(state, state.players.iri, "basic", built.cards);
  assert.deepEqual(getCardInstanceAttributes(state.cards.basic, built.cards[state.cards.basic.definitionId]), ["力量"]);

  const result = engine.execute(state, command(state, "life-boost", CommandType.UseSkill, "iri", {
    skillId: "master.irisviel.skill.ascension",
    data: { abilityId: "magic-attack-boost" },
  }));
  state = result.state;

  assert.deepEqual(getCardInstanceAttributes(state.cards.basic, built.cards[state.cards.basic.definitionId]), ["力量", "魔术"]);
  assert.equal(calculateCombatCardPower(state, state.players.iri, "basic", built.cards), beforePower + 1);

  endStandardRound(state, built.cards);
  assert.equal(state.cards.basic.attributeOverrides, undefined);
  assert.equal(state.cards.basic.powerModifiers, undefined);
});

test("Irisviel package: Proxy Master moves normal Command Seal use to Outpost and it remains usable after Conversion Magic", () => {
  const { engine } = buildFixture();
  let state = createGameState({ gameInstanceId: "irisviel-command-seal-window", players: [{ id: "iri", name: "爱丽丝菲尔" }], seed: 803 });
  state.players.iri.masterId = "master.irisviel";
  state = engine.execute(state, command(state, "iri-start", CommandType.StartStandardGame, "host")).state;
  assert.equal(state.players.iri.flags.commandSealWindow, "outpost");

  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "iri";
  state.players.iri.locationId = "mountain";
  state.board.locations.mountain = ["iri"];
  state.players.iri.mana = 1;
  createOwnedCardInstance(state, "iri", { instanceId: "iri-discard-1", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "iri", { instanceId: "iri-discard-2", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });

  state = engine.execute(state, command(state, "iri-convert", CommandType.UseSkill, "iri", {
    skillId: "master.irisviel.skill.s2",
  })).state;
  assert.equal(state.players.iri.hand.length, 0);
  assert.equal(state.players.iri.mana, 3);
  assert.equal(engine.getLegalActions(state, "iri").some((action) => action.type === CommandType.UseCommandSeal), true);

  state = engine.execute(state, command(state, "iri-seal-mana", CommandType.UseCommandSeal, "iri", { mode: "mana" })).state;
  assert.equal(state.players.iri.mana, 7);
  assert.equal(state.players.iri.commandSeals, 2);

  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "iri";
  assert.equal(engine.getLegalActions(state, "iri").some((action) => action.type === CommandType.UseCommandSeal), false);
  assert.throws(() => engine.execute(state, command(state, "iri-seal-action", CommandType.UseCommandSeal, "iri", { mode: "mana" })), /COMMAND_SEAL_WINDOW_INVALID/);
});
