import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { finalizeCombatFromSnapshot } from "../src/rules-core/combat.ts";

const CASE_FILES = "master.waver.skill.ascension";

function setup(id = "waver") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "w", name: "Waver" }, { id: "o", name: "Opponent" }, { id: "x", name: "Third" }],
    seed: 9501,
  });
  state.status = "playing";
  state.round = 6;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "w";
  state.turnOrder = ["w", "o", "x"];
  state.players.w.masterId = "master.waver";
  state.players.w.mana = 10;
  state.players.w.locationId = "workshop";
  state.players.o.locationId = "workshop";
  state.players.x.locationId = "mountain";
  state.board.locations.workshop = ["w", "o"];
  state.board.locations.mountain = ["x"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  createOwnedCardInstance(state, "w", { instanceId: "case-files", definitionId: CASE_FILES, zone: "master-skills", face: "up", active: false });
  return { built, definitions, engine, state };
}

function command(state, id, type, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId: "w", expectedRevision: state.revision, type, payload };
}

function passiveRuntime(built, definitions) {
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  return { passives, effects };
}

test("Waver package: all four skills are FULL", () => {
  const { built } = setup("waver-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.waver");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  const ascension = built.skills.get(CASE_FILES);
  assert.equal(ascension.handlerId, "core.waver-case-files");
  assert.deepEqual(ascension.abilities?.map((ability) => ability.id), ["case-files-predict", "case-files-discard"]);
  assert.deepEqual(ascension.rules?.ambiguities ?? [], []);
  assert.deepEqual(ascension.rules?.unmodeledClauses ?? [], []);
});

test("Case Files prediction records one prediction per battlefield, blocks scouting reward, and awards one point per correct battlefield", () => {
  const { built, definitions, engine, state } = setup("waver-predict");
  let result = engine.execute(state, command(state, "predict", CommandType.UseSkill, {
    skillId: CASE_FILES,
    data: { abilityId: "case-files-predict" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "waver-case-files-predictions");
  result = engine.execute(result.state, command(result.state, "predict-resolve", CommandType.ResolveDecision, {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["mountain:o", "city:w"],
  }));
  assert.equal(result.state.players.w.flags.waverPredictionMountainPlayerId, "o");
  assert.equal(result.state.players.w.flags.waverPredictionCityPlayerId, "w");
  assert.equal(result.state.players.w.flags.scoutingVictoryPointGainBlockedRound, 6);

  result.state.phase = "combat";
  result.state.players.w.locationId = "scouting";
  result.state.players.o.locationId = "mountain";
  result.state.players.x.locationId = "mountain";
  result.state.board.locations.workshop = [];
  result.state.board.locations.scouting = ["w"];
  result.state.board.locations.mountain = ["o", "x"];
  result.state.board.currentEvents.mountain = [];
  const combat = finalizeCombatFromSnapshot(result.state, {
    locationId: "mountain",
    participantIds: ["o", "x"],
    powers: { o: 10, x: 1 },
    attributes: { o: [], x: [] },
    round: 6,
  }, definitions, {});
  assert.equal(combat.scoutingPlayerId, "w");
  assert.equal(combat.victoryPoints.w, 0);

  const { passives, effects } = passiveRuntime(built, definitions);
  const before = result.state.players.w.victoryPoints;
  enqueuePassiveEffects(result.state, passives, {
    eventId: "combat-ending",
    sourceCommandId: "test",
    revision: result.state.revision,
    type: "combat.ending",
    payload: { round: 6, combatWinnerIdsByLocation: { mountain: ["o"], city: ["w"] } },
  });
  effects.drain(result.state, 1000, definitions);
  assert.equal(result.state.players.w.victoryPoints, before + 2);
});

test("Case Files 5-mana mode discards two random hand cards from every player at Waver's location when outpost ends", () => {
  const { built, definitions, engine, state } = setup("waver-discard");
  for (const [playerId, prefix] of [["w", "w"], ["o", "o"], ["x", "x"]]) {
    for (let index = 1; index <= 3; index += 1) {
      createOwnedCardInstance(state, playerId, { instanceId: `${prefix}${index}`, definitionId: "card.cardb2", zone: "hand", face: "down", active: false });
    }
  }
  let result = engine.execute(state, command(state, "discard-mode", CommandType.UseSkill, {
    skillId: CASE_FILES,
    data: { abilityId: "case-files-discard" },
  }));
  assert.equal(result.state.players.w.mana, 5);
  assert.equal(result.state.players.w.flags.waverCaseFilesDiscardRound, 6);

  const { passives, effects } = passiveRuntime(built, definitions);
  enqueuePassiveEffects(result.state, passives, {
    eventId: "outpost-ended",
    sourceCommandId: "test",
    revision: result.state.revision,
    type: "phase.transitioned",
    payload: { previousPhase: "outpost", transition: "next-phase" },
  });
  effects.drain(result.state, 1000, definitions);
  assert.equal(result.state.players.w.hand.length, 1);
  assert.equal(result.state.players.o.hand.length, 1);
  assert.equal(result.state.players.x.hand.length, 3);
  assert.equal(result.state.players.w.discard.length, 2);
  assert.equal(result.state.players.o.discard.length, 2);
});
