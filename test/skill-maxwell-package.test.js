import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { gainMana } from "../src/rules-core/resources.ts";

const SECOND_LAW = "servant.maxwell.skill.sc-maxwell-3";

function setup() {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  return { built, engine, definitions };
}

function activeState(id, opponentMana = 4) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "maxwell", name: "Maxwell" }, { id: "opponent", name: "Opponent" }], seed: 3501 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "maxwell";
  state.players.maxwell.servantId = "servant.maxwell";
  state.players.maxwell.locationId = "city";
  state.players.opponent.locationId = "city";
  state.players.maxwell.mana = 5;
  state.players.opponent.mana = opponentMana;
  state.board.locations.city = ["maxwell", "opponent"];
  createOwnedCardInstance(state, "maxwell", {
    instanceId: "second-law",
    definitionId: SECOND_LAW,
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
  });
  return state;
}

function emitPassive(engine, state, type, payload, definitions, eventId) {
  enqueuePassiveEffects(state, engine.passives, {
    eventId,
    type,
    revision: state.revision,
    sourceCommandId: "test",
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Maxwell package: all three skills are FULL and Second Law is a residual generic resource replacement", () => {
  const { built } = setup();
  const skills = [1, 2, 3].map((index) => built.skills.get(`servant.maxwell.skill.sc-maxwell-${index}`));
  assert.deepEqual(skills.map((skill) => skill.supportLevel), ["FULL", "FULL", "FULL"]);
  const secondLaw = skills[2];
  assert.equal(secondLaw.handlerId, "core.mana-gain-replacement-residual");
  assert.equal(secondLaw.activation, "residual");
  assert.equal(secondLaw.cardResidual, true);
  assert.deepEqual(secondLaw.passiveEventTypes, ["card.played", "phase.transitioned"]);
  assert.deepEqual(secondLaw.rules.abilities.map((ability) => ability.id), [
    "replace-mana-gain-with-source-power",
    "combat-start-mana-drain-and-close",
  ]);
});

test("Maxwell package: while Second Law is active, every positive mana gain becomes equal source-card power", () => {
  const { engine, definitions } = setup();
  const state = activeState("maxwell-second-law-replace");
  emitPassive(engine, state, "card.played", {
    playerId: "maxwell",
    instanceId: "second-law",
    definitionId: SECOND_LAW,
    face: "up",
  }, definitions, "second-law-played");

  const manaBefore = state.players.maxwell.mana;
  assert.equal(gainMana(state.players.maxwell, 3), 0);
  assert.equal(state.players.maxwell.mana, manaBefore);
  assert.equal(state.players.maxwell.flags.manaGainReplacementPower, 3);
  assert.equal(calculateCombatCardPower(state, state.players.maxwell, "second-law", definitions, "city"), 6);

  assert.equal(gainMana(state.players.maxwell, 2), 0);
  assert.equal(calculateCombatCardPower(state, state.players.maxwell, "second-law", definitions, "city"), 8);
});

test("Maxwell package: combat start drains two mana from everyone at the source location and keeps the residual if all had at least two", () => {
  const { engine, definitions } = setup();
  const state = activeState("maxwell-second-law-combat", 3);
  emitPassive(engine, state, "card.played", { playerId: "maxwell", instanceId: "second-law", definitionId: SECOND_LAW, face: "up" }, definitions, "second-law-played-safe");
  state.phase = "combat";
  emitPassive(engine, state, "phase.transitioned", { previousPhase: "action", transition: "next-phase" }, definitions, "second-law-combat-safe");

  assert.equal(state.players.maxwell.mana, 3);
  assert.equal(state.players.opponent.mana, 1);
  assert.equal(state.cards["second-law"].active, true);
  assert.equal(state.cards["second-law"].zone, "attack");
});

test("Maxwell package: a player below two mana is checked before the drain, then Second Law closes and ordinary mana gain resumes", () => {
  const { engine, definitions } = setup();
  const state = activeState("maxwell-second-law-close", 1);
  emitPassive(engine, state, "card.played", { playerId: "maxwell", instanceId: "second-law", definitionId: SECOND_LAW, face: "up" }, definitions, "second-law-played-close");
  assert.equal(gainMana(state.players.maxwell, 2), 0);
  assert.equal(state.players.maxwell.flags.manaGainReplacementPower, 2);

  state.phase = "combat";
  emitPassive(engine, state, "phase.transitioned", { previousPhase: "action", transition: "next-phase" }, definitions, "second-law-combat-close");

  assert.equal(state.players.maxwell.mana, 3);
  assert.equal(state.players.opponent.mana, 0);
  assert.equal(state.cards["second-law"].active, false);
  assert.equal(state.cards["second-law"].zone, "servant-skills");
  assert.equal(state.players.maxwell.flags.manaGainReplacementSourceInstanceId, undefined);
  assert.equal(state.players.maxwell.flags.manaGainReplacementPower, undefined);
  assert.equal(gainMana(state.players.maxwell, 2), 2);
  assert.equal(state.players.maxwell.mana, 5);
});
