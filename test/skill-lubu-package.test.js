import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { addCardToAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardBasePower } from "../src/rules-core/combat-power.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";
import { getBattlefieldCompetitionReward } from "../src/rules-core/scoring.ts";
import { getStructuredVictoryPointGainForSource } from "../src/rules-core/rule-modifiers.ts";
import { useLubuRestlessSoul } from "../src/rules-core/lubu.ts";

const RESTLESS = "servant.lubu.skill.sc-lubu-1";
const DEFIANCE = "servant.lubu.skill.sc-lubu-2";
const GOD_FORCE = "servant.lubu.skill.sc-lubu-3";
const TARGET = "servant.sasaki.skill.sc-sasaki-1";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "lubu") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const events = Object.fromEntries(built.events.map((event) => [event.id, event]));
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "l", name: "Lu Bu" }, { id: "o", name: "Opponent" }], seed: 2612 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "l";
  state.turnOrder = ["l", "o"];
  state.players.l.servantId = "servant.lubu";
  state.players.l.mana = 30;
  state.players.l.victoryPoints = 8;
  state.players.l.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["l", "o"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, events, engine, state };
}

function add(state, ownerId, instanceId, definitionId, zone = "attack", active = true) {
  createOwnedCardInstance(state, ownerId, { instanceId, definitionId, zone, face: "up", active });
}

test("Lu Bu package is 3/3 FULL and God Force itself is not incorrectly inferred as Once Per Game", () => {
  const { built } = setup("lubu-full");
  const skills = [RESTLESS, DEFIANCE, GOD_FORCE].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(skills[2].limit, undefined);
  assert.equal(skills[2].abilities[0].id, "god-force");
});

test("Restless Soul retains every active basic through next round and loses exactly 1 VP per retained card when Lu Bu fought nobody", () => {
  const { built, definitions, state } = setup("lubu-restless");
  add(state, "l", "b1", "card.cardb1");
  add(state, "l", "b2", "card.cardq1");
  const before = state.players.l.victoryPoints;
  const result = useLubuRestlessSoul({
    state,
    player: state.players.l,
    skill: built.skills.get(RESTLESS),
    payload: { eventType: "round.ending", event: { round: 4 } },
    definitions,
    openDecision: () => {},
  });
  assert.deepEqual(new Set(result.retainedInstanceIds), new Set(["b1", "b2"]));
  assert.equal(state.players.l.victoryPoints, before - 2);
  assert.equal(state.cards.b1.residualUntilRound, 5);
  assert.equal(state.cards.b2.residualUntilRound, 5);
  endStandardRound(state, definitions);
  assert.equal(state.cards.b1.zone, "attack");
  assert.equal(state.cards.b2.zone, "attack");
  assert.equal(state.cards.b1.active, true);
  assert.equal(state.cards.b2.active, true);
});

test("Restless Soul does not retain or penalize after an actual combat with an opponent", () => {
  const { built, definitions, state } = setup("lubu-restless-fought");
  add(state, "l", "b1", "card.cardb1");
  const before = state.players.l.victoryPoints;
  useLubuRestlessSoul({
    state,
    player: state.players.l,
    skill: built.skills.get(RESTLESS),
    payload: { eventType: "combat.resolved", event: { participantIds: ["l", "o"], winnerIds: ["l"] } },
    definitions,
    openDecision: () => {},
  });
  useLubuRestlessSoul({
    state,
    player: state.players.l,
    skill: built.skills.get(RESTLESS),
    payload: { eventType: "round.ending", event: { round: 4 } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(state.players.l.victoryPoints, before);
  assert.equal(state.cards.b1.residual, false);
  endStandardRound(state, definitions);
  assert.equal(state.cards.b1.zone, "discard");
});

test("Defiance grants 0 objective VP, doubles contested-area VP, and exposes the same source rule for Command Seal VP", () => {
  const { built, definitions, events, state } = setup("lubu-defiance");
  add(state, "l", "defiance", DEFIANCE, "servant-skills", false);
  add(state, "l", "l-attack", "card.cardb6");
  add(state, "o", "o-attack", "card.cardq1");
  const objective = built.events.find((event) => Number(event.victoryPoints ?? 0) > 0);
  assert.ok(objective);
  state.board.currentEvents.mountain = [objective.id];
  const competition = getBattlefieldCompetitionReward(state, "mountain");
  const before = state.players.l.victoryPoints;
  const result = resolveCombat(state, "mountain", definitions, events);
  assert.ok(result.winnerIds.includes("l"));
  assert.equal(result.victoryPoints.l, competition * 2);
  assert.equal(state.players.l.victoryPoints - before, competition * 2);
  assert.equal(getStructuredVictoryPointGainForSource(state, "l", definitions, "objective", 5), 0);
  assert.equal(getStructuredVictoryPointGainForSource(state, "l", definitions, "command_seal", 2), 4);
});

test("God Force pays the target's current cost, doubles physical base power, grants OPG without retroactive exhaustion, then removes it after a later real play", () => {
  const { definitions, engine, state } = setup("lubu-god-force");
  add(state, "l", "god-force", GOD_FORCE);
  add(state, "l", "target", TARGET);
  const targetCost = definitions[TARGET].cost;
  const baseBefore = calculateCombatCardBasePower(state, state.players.l, "target", definitions);
  const manaBefore = state.players.l.mana;
  let result = engine.execute(state, command(state, "god-force-use", CommandType.UseSkill, "l", {
    skillId: GOD_FORCE,
    data: { abilityId: "god-force", targetInstanceId: "target" },
  }));
  assert.equal(result.state.players.l.mana, manaBefore - targetCost);
  assert.equal(result.state.cards.target.basePowerMultiplier, 2);
  assert.equal(calculateCombatCardBasePower(result.state, result.state.players.l, "target", definitions), baseBefore * 2);
  assert.equal(result.state.cards.target.usageLimitOverride, "once-per-game");
  assert.notEqual(result.state.cards.target.used, true, "granting OPG must not retroactively count the already-active card as used");
  assert.equal(result.state.players.l.trueNameRevealed, true);

  endStandardRound(result.state, definitions);
  assert.equal(result.state.cards.target.zone, "servant-skills", "unused newly-granted OPG card is not removed at this cleanup");
  assert.notEqual(result.state.cards.target.zone, "removed");

  result.state.round += 1;
  result.state.phase = "action";
  result.state.step = "play-batch-draft";
  result.state.activePlayerId = "l";
  addCardToAttack(result.state, "l", "target", definitions, { payCost: false, bypassSkillEightMana: true, allowedSourceZones: ["servant-skills"], bypassTiming: true });
  assert.equal(result.state.cards.target.used, true);
  endStandardRound(result.state, definitions);
  assert.equal(result.state.cards.target.zone, "removed");
});
