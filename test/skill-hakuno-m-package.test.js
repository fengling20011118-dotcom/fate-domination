import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  HAKUNO_ANALYSIS_ID,
  HAKUNO_DEAD_FACE_ABILITY,
  HAKUNO_DEAD_FACE_ID,
  HAKUNO_HANDLER,
  HAKUNO_YOMI_ABILITY,
  HAKUNO_YOMI_ID,
  grantHakunoAnalysis,
  resolveHakunoMale,
  useHakunoMale,
} from "../src/rules-core/hakuno-m.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function skill(id) {
  return built.skills.get(id);
}

function setup(id = "hakuno-m") {
  const state = createGameState({
    gameInstanceId: id,
    players: [
      { id: "h", name: "Hakuno" },
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ],
    seed: 1701,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "h";
  state.turnOrder = ["h", "a", "b", "c"];
  state.players.h.masterId = "master.hakuno-m";
  state.players.h.mana = 8;
  state.players.h.locationId = "mountain";
  state.players.a.locationId = "mountain";
  state.players.b.locationId = "city";
  state.players.c.locationId = "city";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["h", "a"];
  state.board.locations.city = ["b", "c"];
  state.board.locations.scouting = [];
  return state;
}

function ctx(state, definition, payload, extra = {}) {
  return {
    state,
    player: state.players.h,
    skill: definition,
    definitions,
    payload,
    openDecision() {},
    ...extra,
  };
}

test("Hakuno male package is 4/4 FULL with the dedicated Yomi handler", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.hakuno-m");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => candidate.handlerId === HAKUNO_HANDLER));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  for (const candidate of skills) {
    assert.deepEqual(candidate.rules?.ambiguities ?? [], []);
    assert.deepEqual(candidate.rules?.unmodeledClauses ?? [], []);
  }
});

test("Yomi Analysis gives the engaged opponent a physical Analysis and costs Hakuno 2 total power", () => {
  const state = setup("hakuno-analysis");
  const result = useHakunoMale(ctx(state, skill(HAKUNO_YOMI_ID), {
    abilityId: HAKUNO_YOMI_ABILITY,
    mode: "analysis",
    targetPlayerId: "a",
  }));
  assert.equal(result.powerDelta, -2);
  assert.equal(state.players.h.flags.roundPowerBonus, -2);
  assert.ok(state.players.a.masterSkills.includes(result.analysisInstanceId));
  assert.equal(state.cards[result.analysisInstanceId].ownerPlayerId, "a");
  assert.equal(state.cards[result.analysisInstanceId].createdByPlayerId, "h");
});

test("Challenge counts ties as games and cumulative 2-win results grant +5 total power plus Analysis", () => {
  const state = setup("hakuno-rps");
  const decisions = [];
  const first = useHakunoMale(ctx(state, skill(HAKUNO_YOMI_ID), {
    abilityId: HAKUNO_YOMI_ABILITY,
    mode: "challenge",
    targetPlayerId: "a",
  }, { openDecision: (decision) => decisions.push(decision) }));
  assert.equal(first.pending, true);
  assert.deepEqual(decisions[0].chooserPlayerIds, ["h", "a"]);

  let result = resolveHakunoMale(ctx(state, skill(HAKUNO_YOMI_ID), {
    previous: { stage: "rps", targetPlayerId: "a", wins: 0, gamesPlayed: 0 },
    decision: { status: "resolved", submissions: { h: ["rock"], a: ["rock"] } },
  }, { openDecision: (decision) => decisions.push(decision) }));
  assert.equal(result.gamesPlayed, 1);
  assert.equal(result.wins, 0);

  result = resolveHakunoMale(ctx(state, skill(HAKUNO_YOMI_ID), {
    previous: { stage: "rps", targetPlayerId: "a", wins: 0, gamesPlayed: 1 },
    decision: { status: "resolved", submissions: { h: ["paper"], a: ["rock"] } },
  }, { openDecision: (decision) => decisions.push(decision) }));
  assert.equal(result.gamesPlayed, 2);
  assert.equal(result.wins, 1);

  result = resolveHakunoMale(ctx(state, skill(HAKUNO_YOMI_ID), {
    previous: { stage: "rps", targetPlayerId: "a", wins: 1, gamesPlayed: 2 },
    decision: { status: "resolved", submissions: { h: ["scissors"], a: ["paper"] } },
  }));
  assert.equal(result.wins, 2);
  assert.equal(result.powerBonus, 5);
  assert.equal(state.players.h.flags.roundPowerBonus, 5);
  assert.ok(result.analysisInstanceId);
  assert.equal(state.players.a.defeated, false);
});

test("every three Analysis cards pre-win one Challenge game; three pre-wins defeat the challenged opponent", () => {
  const state = setup("hakuno-auto-wins");
  for (let index = 0; index < 9; index += 1) grantHakunoAnalysis(state, "h", "a", definitions);
  const result = useHakunoMale(ctx(state, skill(HAKUNO_YOMI_ID), {
    abilityId: HAKUNO_YOMI_ABILITY,
    mode: "challenge",
    targetPlayerId: "a",
  }));
  assert.equal(result.wins, 3);
  assert.equal(result.powerBonus, 5);
  assert.equal(result.targetDefeated, true);
  assert.equal(state.players.a.defeated, true);
  assert.equal(state.players.a.masterSkills.filter((id) => state.cards[id].definitionId === HAKUNO_ANALYSIS_ID).length, 10);
});

test("eliminated holder passes Hakuno Analysis to the next living Hakuno opponent in turn order", () => {
  const state = setup("hakuno-pass-analysis");
  const first = grantHakunoAnalysis(state, "h", "a", definitions);
  const second = grantHakunoAnalysis(state, "h", "a", definitions);
  state.players.a.eliminated = true;
  const result = useHakunoMale(ctx(state, skill(HAKUNO_ANALYSIS_ID), {
    eventType: "round.ended",
    event: { eliminatedThisRound: ["a"] },
  }));
  assert.equal(result.transferred.length, 1);
  assert.equal(result.transferred[0].toPlayerId, "b");
  assert.ok(state.players.b.masterSkills.includes(first));
  assert.ok(state.players.b.masterSkills.includes(second));
  assert.equal(state.cards[first].ownerPlayerId, "b");
  assert.equal(state.players.a.masterSkills.includes(first), false);
});

test("Dead Face pays 1 mana through SkillRegistry and may transfer Analysis repeatedly", () => {
  const state = setup("hakuno-dead-face");
  state.phase = "action";
  createOwnedCardInstance(state, "h", {
    instanceId: "h:dead-face",
    definitionId: HAKUNO_DEAD_FACE_ID,
    zone: "master-skills",
    face: "up",
    active: false,
  });
  const one = grantHakunoAnalysis(state, "h", "a", definitions);
  const two = grantHakunoAnalysis(state, "h", "a", definitions);

  built.skills.execute(state, "h", HAKUNO_DEAD_FACE_ID, {
    abilityId: HAKUNO_DEAD_FACE_ABILITY,
    sourcePlayerId: "a",
    targetPlayerId: "b",
    instanceId: one,
  }, () => {}, () => 0, definitions);
  assert.equal(state.players.h.mana, 7);
  assert.equal(state.cards[one].ownerPlayerId, "b");

  built.skills.execute(state, "h", HAKUNO_DEAD_FACE_ID, {
    abilityId: HAKUNO_DEAD_FACE_ABILITY,
    sourcePlayerId: "a",
    targetPlayerId: "c",
    instanceId: two,
  }, () => {}, () => 0, definitions);
  assert.equal(state.players.h.mana, 6);
  assert.equal(state.cards[two].ownerPlayerId, "c");
});
