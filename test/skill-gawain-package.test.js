import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { getEventVictoryPointBonus } from "../src/rules-core/event-lifecycle.ts";
import { isSaberMagicResistanceLegal, resolveGawainSaintNumberChallenge, useGawainGalatine, useGawainSaintNumber, useSaberMagicResistance } from "../src/rules-core/skill-handlers.ts";

const SAINT_NUMBER = "servant.gawain.skill.sc-gawain-2";

function setup() {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = {
    ...built.cards,
    ...Object.fromEntries(built.events.map((event) => [event.id, event])),
    ...built.skills.asCardDefinitions(),
  };
  return { built, engine, definitions };
}

function combatState(id = "gawain-combat") {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "gawain", name: "高文" }, { id: "enemy", name: "enemy" }], seed: 4101 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "gawain";
  state.players.gawain.servantId = "servant.gawain";
  state.players.gawain.locationId = "mountain";
  state.players.enemy.locationId = "mountain";
  state.players.gawain.mana = 10;
  state.board.locations.mountain = ["gawain", "enemy"];
  createOwnedCardInstance(state, "gawain", {
    instanceId: "saint-number",
    definitionId: SAINT_NUMBER,
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "gawain", {
    instanceId: "base-three",
    definitionId: "card.cardb2",
    zone: "attack",
    face: "up",
    active: true,
  });
  return state;
}

function useNightless(state, suffix = "use") {
  return {
    commandId: `gawain-${suffix}`,
    gameInstanceId: state.gameInstanceId,
    actorId: "gawain",
    expectedRevision: state.revision,
    type: CommandType.UseSkill,
    payload: { skillId: SAINT_NUMBER, data: { abilityId: "nightless-charm" } },
  };
}

test("Gawain package: all three skills are FULL and Saint's Number has challenge + Nightless Charm", () => {
  const { built } = setup();
  const skills = [1, 2, 3].map((index) => built.skills.get(`servant.gawain.skill.sc-gawain-${index}`));
  assert.deepEqual(skills.map((skill) => skill.supportLevel), ["FULL", "FULL", "FULL"]);
  assert.equal(skills[0].handlerId, "core.gawain-galatine");
  assert.equal(skills[2].handlerId, "core.saber-magic-resistance");
  const saint = skills[1];
  assert.equal(saint.handlerId, "core.gawain-saint-number");
  assert.equal(saint.requiresActiveCard, true);
  assert.deepEqual(saint.windows, ["combat"]);
  assert.deepEqual(saint.passiveEventTypes, ["event.revealed"]);
  assert.deepEqual(saint.abilities.map((ability) => ability.id), ["challenge", "nightless-charm"]);
  assert.ok(saint.rules.evidence.some((source) => source.kind === "development-image"));
  assert.deepEqual(saint.rules.ambiguities, []);
  assert.deepEqual(saint.rules.unmodeledClauses, []);
});

test("Gawain Galatine: outpost activation grants 3 mana/+3 total power and round-end wipes mana only if Galatine was not played", () => {
  const { built } = setup();
  const skill = built.skills.get("servant.gawain.skill.sc-gawain-1");
  const state = combatState("gawain-galatine");
  state.phase = "outpost";
  state.players.gawain.mana = 4;
  useGawainGalatine({ state, player: state.players.gawain, skill, payload: {}, openDecision: () => {} });
  assert.equal(state.players.gawain.mana, 7);
  assert.equal(state.players.gawain.flags.roundPowerBonus, 3);
  useGawainGalatine({
    state,
    player: state.players.gawain,
    skill,
    payload: { eventType: "round.ended", event: {} },
    openDecision: () => {},
  });
  assert.equal(state.players.gawain.mana, 0);

  state.players.gawain.mana = 4;
  useGawainGalatine({ state, player: state.players.gawain, skill, payload: {}, openDecision: () => {} });
  useGawainGalatine({
    state,
    player: state.players.gawain,
    skill,
    payload: { eventType: "card.played", event: { playerId: "gawain", definitionId: skill.id } },
    openDecision: () => {},
  });
  useGawainGalatine({
    state,
    player: state.players.gawain,
    skill,
    payload: { eventType: "round.ended", event: {} },
    openDecision: () => {},
  });
  assert.equal(state.players.gawain.mana, 7);
});

test("Gawain Magic Resistance: Noble Bloom requires Gawain to have played a highest-mana NP in this battle", () => {
  const { built, definitions } = setup();
  const state = combatState("gawain-noble-bloom-highest");
  const skill = built.skills.get("servant.gawain.skill.sc-gawain-3");
  const ability = skill.abilities.find((candidate) => candidate.id === "noble-bloom");
  definitions["test.gawain-own-np"] = { id: "test.gawain-own-np", name: "own NP", cost: 4, basePower: 5, typeLabel: "宝具", attributes: ["宝具"] };
  definitions["test.enemy-high-np"] = { id: "test.enemy-high-np", name: "enemy NP", cost: 5, basePower: 5, typeLabel: "宝具", attributes: ["宝具"] };
  createOwnedCardInstance(state, "gawain", {
    instanceId: "gawain-own-np",
    definitionId: "test.gawain-own-np",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "enemy", {
    instanceId: "enemy-high-np",
    definitionId: "test.enemy-high-np",
    zone: "attack",
    face: "up",
    active: true,
  });
  state.cards["gawain-own-np"].playedRound = state.round;
  state.cards["gawain-own-np"].paidCost = 4;
  state.cards["enemy-high-np"].playedRound = state.round;
  state.cards["enemy-high-np"].paidCost = 5;
  assert.equal(isSaberMagicResistanceLegal(state, "gawain", skill, ability, definitions), false);
  state.cards["gawain-own-np"].paidCost = 5;
  assert.equal(isSaberMagicResistanceLegal(state, "gawain", skill, ability, definitions), true);
  useSaberMagicResistance({
    state,
    player: state.players.gawain,
    skill,
    payload: { abilityId: "noble-bloom" },
    openDecision: () => {},
    definitions,
  });
  assert.equal(state.players.gawain.victoryPoints, 2);
});

test("Gawain Challenge: only a hand card matching the event's explicit mentioned attribute can be discarded for +3 event VP", () => {
  const { built, definitions } = setup();
  const state = combatState("gawain-challenge");
  state.board.currentEvents.mountain = ["event.fuyuki.6"];
  state.board.eventVisibility["event.fuyuki.6"] = "up";
  createOwnedCardInstance(state, "gawain", {
    instanceId: "matching-strength",
    definitionId: "card.cardb2",
    zone: "hand",
    face: "down",
    active: false,
  });
  createOwnedCardInstance(state, "gawain", {
    instanceId: "nonmatching-magic",
    definitionId: "card.carda2",
    zone: "hand",
    face: "down",
    active: false,
  });
  const skill = built.skills.get(SAINT_NUMBER);
  let decision;
  useGawainSaintNumber({
    state,
    player: state.players.gawain,
    skill,
    payload: { eventType: "event.revealed", event: { eventId: "event.fuyuki.6", locationId: "mountain" } },
    openDecision: (next) => { decision = next; },
    definitions,
  });
  assert.ok(decision);
  assert.deepEqual(decision.options.map((option) => option.id), ["matching-strength"]);
  assert.equal(decision.allowCancel, true);
  assert.equal(state.effectQueue[0].handlerId, "core.gawain-saint-number-challenge-resolve");

  resolveGawainSaintNumberChallenge({
    state,
    player: state.players.gawain,
    skill,
    payload: {
      previous: { eventId: "event.fuyuki.6" },
      decision: { status: "resolved", submissions: { gawain: ["matching-strength"] } },
    },
    openDecision: () => {},
    definitions,
  });
  assert.equal(state.cards["matching-strength"].zone, "discard");
  assert.equal(state.cards["nonmatching-magic"].zone, "hand");
  assert.equal(getEventVictoryPointBonus(state, "event.fuyuki.6"), 3);
});

test("Gawain Nightless Charm: challenged battlefield waives 3 mana and all active printed-base-3 attacks receive +6", () => {
  const { engine, definitions } = setup();
  const state = combatState("gawain-nightless-free");
  state.board.currentEvents.mountain = ["event.fuyuki.6"];
  state.board.eventVisibility["event.fuyuki.6"] = "up";
  state.board.eventVictoryPointBonuses["event.fuyuki.6"] = 3;
  const beforeMana = state.players.gawain.mana;
  const result = engine.execute(state, useNightless(state, "free"));
  assert.equal(result.state.players.gawain.mana, beforeMana);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.gawain, "base-three", definitions, "mountain"), 12);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.gawain, "saint-number", definitions, "mountain"), 12);
});

test("Gawain Nightless Charm: without a challenged event it pays exactly 3 mana", () => {
  const { engine, definitions } = setup();
  const state = combatState("gawain-nightless-paid");
  const result = engine.execute(state, useNightless(state, "paid"));
  assert.equal(result.state.players.gawain.mana, 7);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.gawain, "base-three", definitions, "mountain"), 9);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.gawain, "saint-number", definitions, "mountain"), 9);
});

test("Gawain Nightless Charm: without a challenged event, insufficient mana makes the action illegal", () => {
  const { engine } = setup();
  const state = combatState("gawain-nightless-insufficient-mana");
  state.players.gawain.mana = 2;
  assert.throws(() => engine.execute(state, useNightless(state, "insufficient-mana")), /SKILL_USE_FORBIDDEN/);
});
