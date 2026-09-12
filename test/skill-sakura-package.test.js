import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import {
  isUnlockOwnerAscensionLegal,
  registerCorePassiveHandlers,
  registerCoreSkillHandlers,
  useUnlockOwnerAscension,
} from "../src/rules-core/skill-handlers.ts";

const ASCENSION = "master.sakura.skill.ascension";
const GRAIL = "master.sakura.skill.s4";

function setup(id = "sakura-corrosion") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "s", name: "Sakura" }, { id: "v", name: "Victim" }, { id: "w", name: "Other" }],
    seed: 9401,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.players.s.masterId = "master.sakura";
  state.players.v.servantId = "servant.saber";
  createOwnedCardInstance(state, "s", { instanceId: "grail", definitionId: GRAIL, zone: "master-skills", face: "up", active: true });
  createOwnedCardInstance(state, "s", { instanceId: "corrosion", definitionId: ASCENSION, zone: "master-skills", face: "up", active: false });
  return { built, definitions, state };
}

function addVictimServantSkills(state, built) {
  const skills = built.skills.list().filter((skill) => skill.ownerType === "servant" && skill.ownerId === "servant.saber").slice(0, 2);
  assert.equal(skills.length, 2);
  skills.forEach((skill, index) => createOwnedCardInstance(state, "v", {
    instanceId: `victim-skill-${index + 1}`,
    definitionId: skill.id,
    zone: "servant-skills",
    face: index === 0 ? "up" : "down",
    active: false,
  }));
  state.players.v.eliminated = true;
  return skills.map((_skill, index) => `victim-skill-${index + 1}`);
}

function pumpRoundEnded(state, built, definitions, eliminatedThisRound) {
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  enqueuePassiveEffects(state, passives, {
    eventId: `evt:round-ended:${state.revision}`,
    sourceCommandId: "test",
    revision: state.revision,
    type: "round.ended",
    payload: { round: state.round, nextPhase: "outpost", eliminatedThisRound },
  });
  effects.drain(state, 1000, definitions);
  return effects;
}

function resolvePending(state, effects, definitions, status, selections = []) {
  const decision = state.pendingDecision;
  assert.ok(decision);
  const effectId = status === "resolved" ? decision.continuationEffectId : decision.fallbackEffectId;
  assert.ok(effectId);
  const frame = state.effectQueue.find((item) => item.effectId === effectId);
  assert.ok(frame);
  frame.payload = {
    previous: frame.payload,
    decision: {
      decisionId: decision.decisionId,
      status,
      selections,
      chooserPlayerIds: [...decision.chooserPlayerIds],
      submissions: { ...decision.submissions },
    },
  };
  state.pendingDecision = null;
  effects.drain(state, 1000, definitions);
}

test("Sakura package: all five skills are FULL and Corrosion is structured", () => {
  const { built } = setup("sakura-full");
  const ids = ["master.sakura.skill.s1", "master.sakura.skill.s2", "master.sakura.skill.s3", GRAIL, ASCENSION];
  assert.ok(ids.every((id) => built.skills.get(id).supportLevel === "FULL"));
  const corrosion = built.skills.get(ASCENSION);
  assert.equal(corrosion.handlerId, "core.sakura-corrosion");
  assert.equal(corrosion.unlockLatestRound, 4);
  assert.deepEqual(corrosion.passiveEventTypes, ["round.ended"]);
  assert.deepEqual(corrosion.rules?.ambiguities ?? [], []);
  assert.deepEqual(corrosion.rules?.unmodeledClauses ?? [], []);
});

test("Corrosion ascension can be unlocked through round 4 but not from round 5", () => {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const early = createGameState({ gameInstanceId: "sakura-unlock-4", players: [{ id: "s", name: "Sakura" }], seed: 1 });
  early.status = "playing";
  early.round = 4;
  early.players.s.masterId = "master.sakura";
  assert.equal(isUnlockOwnerAscensionLegal(early, "s", built.skills.get(ASCENSION), undefined, definitions), true);
  useUnlockOwnerAscension({ state: early, player: early.players.s, skill: built.skills.get(ASCENSION), definitions, openDecision: () => undefined });
  assert.ok(early.players.s.masterSkills.some((id) => early.cards[id]?.definitionId === ASCENSION));

  const late = createGameState({ gameInstanceId: "sakura-unlock-5", players: [{ id: "s", name: "Sakura" }], seed: 2 });
  late.status = "playing";
  late.round = 5;
  late.players.s.masterId = "master.sakura";
  assert.equal(isUnlockOwnerAscensionLegal(late, "s", built.skills.get(ASCENSION), undefined, definitions), false);
  assert.throws(() => useUnlockOwnerAscension({ state: late, player: late.players.s, skill: built.skills.get(ASCENSION), definitions, openDecision: () => undefined }), /ASCENSION_UNLOCK_WINDOW_CLOSED/);
});

test("Corrosion transfers any selected servant skills into Sakura's master skill zone and consumes once per game", () => {
  const { built, definitions, state } = setup("sakura-transfer");
  const victimSkills = addVictimServantSkills(state, built);
  const effects = pumpRoundEnded(state, built, definitions, ["v"]);
  assert.equal(state.pendingDecision?.kind, "sakura-corrosion-servant-skills");
  assert.deepEqual(new Set(state.pendingDecision?.options.map((option) => option.id)), new Set(victimSkills));
  resolvePending(state, effects, definitions, "resolved", victimSkills);

  assert.equal(state.players.s.flags.sakuraCorrosionUsed, true);
  assert.deepEqual(state.players.v.servantSkills, []);
  for (const instanceId of victimSkills) {
    assert.ok(state.players.s.masterSkills.includes(instanceId));
    assert.equal(state.cards[instanceId].ownerPlayerId, "s");
    assert.equal(state.cards[instanceId].controllerPlayerId, "s");
    assert.equal(state.cards[instanceId].zone, "master-skills");
    assert.equal(state.cards[instanceId].active, false);
  }

  state.pendingDecision = null;
  pumpRoundEnded(state, built, definitions, ["v"]);
  assert.equal(state.pendingDecision, null);
});

test("Corrosion does not trigger while the corrupted grail is inactive", () => {
  const { built, definitions, state } = setup("sakura-inactive");
  addVictimServantSkills(state, built);
  state.cards.grail.active = false;
  pumpRoundEnded(state, built, definitions, ["v"]);
  assert.equal(state.pendingDecision, null);
  assert.equal(state.players.s.flags.sakuraCorrosionUsed, undefined);
});
