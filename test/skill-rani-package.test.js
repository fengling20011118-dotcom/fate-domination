import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { projectPublicState } from "../src/projection/project-state.ts";
import { startStandardRound } from "../src/rules-core/rounds.ts";
import {
  RANI_ASCENSION_ID,
  RANI_DOOM_ID,
  RANI_HANDLER,
  RANI_STARGAZER_ID,
  RANI_TRIUMPH_ID,
  resolveRani,
  useRani,
} from "../src/rules-core/rani.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function state(id, round = 4) {
  const s = createGameState({
    gameInstanceId: id,
    players: [{ id: "r", name: "Rani" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    seed: 81,
  });
  s.status = "playing";
  s.round = round;
  s.phase = "combat";
  s.step = "settlement";
  s.turnOrder = ["r", "a", "b"];
  s.players.r.masterId = "master.rani";
  return s;
}

function ctx(s, skillId, payload, extras = {}) {
  return {
    state: s,
    player: s.players.r,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision: () => {},
    emitEvent: () => {},
    randomInt: () => 0,
    ...extras,
  };
}

function resolve(s, skillId, previous, status, selections, extras = {}) {
  return resolveRani(ctx(s, skillId, { previous, decision: { status, selections } }, extras));
}

function command(s, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: s.gameInstanceId, actorId, expectedRevision: s.revision, type, payload };
}

test("Rani four-card package is FULL and uses one dedicated handler", () => {
  for (const id of [RANI_STARGAZER_ID, RANI_TRIUMPH_ID, RANI_DOOM_ID, RANI_ASCENSION_ID]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL");
    assert.equal(skill.handlerId, RANI_HANDLER);
    assert.ok(built.skills.hasHandler(id));
  }
});

test("Stargazer burns the pending non-climax Situation before activation and plays a burned Situation instead", () => {
  const s = state("rani-stargazer", 3);
  s.board.situationDeck = ["situation.regular-3", "situation.regular-4"];
  s.board.situationDiscard = ["situation.regular-1", "situation.regular-2"];
  let opened;
  const result = useRani(ctx(s, RANI_STARGAZER_ID, {
    eventType: "situation.will-activate",
    event: { round: 4, situationId: "situation.regular-3", climax: false },
  }, { openDecision(value) { opened = value; } }));
  assert.equal(result.pending, true);
  assert.ok(s.board.situationDiscard.includes("situation.regular-3"));
  assert.ok(opened.options.some((option) => option.id === "situation.regular-1"));
  const frame = s.effectQueue.shift();
  resolve(s, RANI_STARGAZER_ID, frame.payload, "resolved", ["situation.regular-1"]);
  assert.equal(s.board.situationDeck[0], "situation.regular-1");
  assert.ok(!s.board.situationDiscard.includes("situation.regular-1"));
});

test("Stargazer's burned-Situation inspection permission is recipient-specific", () => {
  const s = state("rani-burned-visibility");
  s.board.situationDiscard = ["situation.regular-1", "situation.regular-2"];
  assert.deepEqual(projectPublicState(s, "r").board.situationDiscard, ["situation:hidden", "situation:hidden"]);
  useRani(ctx(s, RANI_STARGAZER_ID, { eventType: "game.started", event: {} }));
  assert.deepEqual(projectPublicState(s, "r").board.situationDiscard, s.board.situationDiscard);
  assert.deepEqual(projectPublicState(s, "a").board.situationDiscard, ["situation:hidden", "situation:hidden"]);
});

test("Round-4 Stargazer creates both Prophecies, immediately chooses targets, and both rewards resolve", () => {
  const s = state("rani-prophecies", 4);
  let opened;
  useRani(ctx(s, RANI_STARGAZER_ID, { eventType: "round.ending", event: { round: 4 } }, {
    openDecision(value) { opened = value; },
  }));
  assert.ok(s.players.r.masterSkills.some((id) => s.cards[id]?.definitionId === RANI_TRIUMPH_ID));
  assert.ok(s.players.r.masterSkills.some((id) => s.cards[id]?.definitionId === RANI_DOOM_ID));
  assert.equal(opened.kind, "rani-triumph-target");
  let frame = s.effectQueue.shift();
  resolve(s, RANI_TRIUMPH_ID, frame.payload, "resolved", ["a"], { openDecision(value) { opened = value; } });
  assert.equal(opened.kind, "rani-doom-target");
  frame = s.effectQueue.shift();
  resolve(s, RANI_DOOM_ID, frame.payload, "resolved", ["b"]);
  assert.equal(s.players.r.flags.raniTriumphTargetId, "a");
  assert.equal(s.players.r.flags.raniDoomTargetId, "b");

  s.round = 8;
  s.players.r.victoryPoints = 0;
  s.players.a.victoryPoints = 5;
  s.players.b.victoryPoints = 1;
  s.players.b.eliminated = true;
  useRani(ctx(s, RANI_TRIUMPH_ID, { eventType: "elimination.resolved", event: { round: 8, eliminatedPlayerIds: ["b"] } }));
  assert.equal(s.players.r.victoryPoints, 2);
  useRani(ctx(s, RANI_DOOM_ID, { eventType: "elimination.resolved", event: { round: 8, eliminatedPlayerIds: ["b"] } }));
  assert.equal(s.players.r.victoryPoints, 8);
  useRani(ctx(s, RANI_DOOM_ID, { eventType: "elimination.resolved", event: { round: 9, eliminatedPlayerIds: ["a"] } }));
  assert.equal(s.players.r.victoryPoints, 8, "Doom rewards only the first elimination wave");
});

test("Atlas Researcher unlock reward and Climax objective replacement use generic scheduled slots", () => {
  const s = state("rani-atlas", 8);
  s.players.r.victoryPoints = 2;
  const unlock = useRani(ctx(s, RANI_ASCENSION_ID, {
    eventType: "skill.unlocked", event: { playerId: "r", skillId: RANI_ASCENSION_ID },
  }));
  assert.equal(unlock.gainedVictoryPoints, 13); // 2*8 - 3 players
  assert.equal(s.players.r.victoryPoints, 15);

  const chosenEvents = built.events.slice(0, 2);
  s.board.eventDeck = chosenEvents.map((event) => event.id);
  s.board.eventDiscard = [];
  s.board.eventRemoved = [];
  let opened;
  useRani(ctx(s, RANI_ASCENSION_ID, {
    eventType: "situation.will-activate",
    event: { round: 9, situationId: "rani-climax", climax: true, eventPlacement: { mountain: 1, city: 1 } },
  }, { openDecision(value) { opened = value; } }));
  let frame = s.effectQueue.shift();
  resolve(s, RANI_ASCENSION_ID, frame.payload, "resolved", [chosenEvents[0].id], { openDecision(value) { opened = value; } });
  frame = s.effectQueue.shift();
  resolve(s, RANI_ASCENSION_ID, frame.payload, "resolved", [chosenEvents[1].id]);
  assert.equal(s.modeState.pendingRoundEventPlacements.length, 2);
  assert.ok(s.modeState.pendingRoundEventPlacements.every((entry) => entry.replaceOrdinarySlot === true));

  s.board.situationDeck = ["rani-climax"];
  const climax = { id: "rani-climax", mana: 0, climax: true, eventPlacement: { mountain: 1, city: 1 } };
  startStandardRound(s, [climax], chosenEvents, () => 0, definitions);
  assert.equal(s.round, 9);
  assert.deepEqual(s.board.currentEvents.mountain, [chosenEvents[0].id]);
  assert.deepEqual(s.board.currentEvents.city, [chosenEvents[1].id]);
});

test("standard engine pauses before first Situation activation for Stargazer and resumes the round after the choice", () => {
  const engine = new StandardMatchEngine(built);
  const s = createGameState({ gameInstanceId: "rani-engine-pre-round", players: [{ id: "r", name: "Rani" }, { id: "o", name: "Other" }], seed: 99 });
  s.players.r.masterId = "master.rani";
  s.players.r.servantId = "servant.saber";
  s.players.o.masterId = "master.kirei";
  s.players.o.servantId = "servant.emiya";
  let result = engine.execute(s, command(s, "start-rani", CommandType.StartStandardGame, "host"));
  assert.equal(result.state.round, 0);
  assert.equal(result.state.pendingDecision?.kind, "rani-stargazer-event");
  assert.equal(result.events.some((event) => event.type === "situation.will-activate"), true);
  assert.equal(result.events.some((event) => event.type === "round.started"), false);
  const selected = result.state.pendingDecision.options[0].id;
  result = engine.execute(result.state, command(result.state, "choose-rani-event", CommandType.ResolveDecision, "r", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: [selected],
  }));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.round, 1);
  assert.deepEqual(result.state.board.activeSituations, [selected]);
  assert.equal(result.events.some((event) => event.type === "game.started"), true);
  assert.equal(result.events.some((event) => event.type === "round.started"), true);
  assert.equal(result.state.players.r.flags.viewBurnedSituationsSourceId, RANI_STARGAZER_ID);
});
