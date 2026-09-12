import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { deployPlayer } from "../src/rules-core/board.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import {
  resolveJuliusRapidAgingMode,
  resolveJuliusRapidAgingRemove,
  resolveJuliusSkulkDeployment,
  resolveJuliusSkulkTiming,
  useJuliusBlackScorpion,
  useJuliusRapidAging,
  useJuliusSkulk,
} from "../src/rules-core/julius.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const SKULK = "master.julius.skill.s1";
const AGING = "master.julius.skill.s1a";
const ASCENSION = "master.julius.skill.ascension";

function setup(id = "julius-package") {
  const built = buildStandardContent(legacyContent);
  registerCoreSkillHandlers(built.skills);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const basicId = Object.values(definitions).find((definition) => definition.basic === true)?.id;
  assert.ok(basicId);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "j", name: "Julius" }, { id: "o", name: "Opponent" }],
    seed: 739,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "j";
  state.players.j.masterId = "master.julius";
  state.players.j.mana = 8;
  return { built, definitions, basicId, state };
}

function addCard(state, instanceId, definitionId, zone) {
  return createOwnedCardInstance(state, "j", {
    instanceId,
    definitionId,
    zone,
    face: "down",
    active: false,
  });
}

function decisionPayload(previous, selections) {
  return {
    previous,
    decision: { status: "resolved", selections, decisionId: "d", chooserPlayerIds: ["j"], submissions: {} },
  };
}

test("Julius package is 3/3 FULL with dedicated handlers", () => {
  const { built } = setup("julius-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.julius");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(SKULK).handlerId, "core.julius-skulk");
  assert.equal(built.skills.get(AGING).handlerId, "core.julius-rapid-aging");
  assert.equal(built.skills.get(ASCENSION).handlerId, "core.julius-black-scorpion");
  assert.equal(built.skills.get(ASCENSION).initiallyOwned, false);
});

test("cc_skulk replaces ordinary Outpost deployment and deploys on Julius's Action turn", () => {
  const { built, definitions, state } = setup("julius-skulk-action");
  const result = useJuliusSkulk({ state, player: state.players.j, skill: built.skills.get(SKULK), payload: {}, definitions });
  assert.deepEqual(result, { deploymentPhase: "action" });
  assert.equal(state.players.j.flags.skipDeploymentRound, 4);
  assert.equal(state.players.j.flags.juliusSkulkDeploymentPhase, "action");
  assert.throws(() => deployPlayer(state, "j", "mountain", definitions), /DEPLOYMENT_SKIPPED_THIS_ROUND/);

  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "j";
  let opened;
  useJuliusSkulk({
    state,
    player: state.players.j,
    skill: built.skills.get(SKULK),
    payload: { eventType: "phase.transitioned", event: { transition: "next-phase", previousPhase: "outpost" } },
    definitions,
    openDecision: (decision) => { opened = decision; },
  });
  assert.equal(opened.kind, "julius-skulk-deployment");
  assert.deepEqual(opened.options.map((option) => option.id).sort(), ["city", "mountain"]);
  const frame = state.effectQueue[0];
  const deployed = resolveJuliusSkulkDeployment({
    state,
    player: state.players.j,
    skill: built.skills.get(SKULK),
    payload: decisionPayload(frame.payload, ["mountain"]),
    definitions,
  });
  assert.deepEqual(deployed, { locationId: "mountain" });
  assert.equal(state.players.j.locationId, "mountain");
  assert.equal(state.players.j.flags.skipDeploymentRound, undefined);
  assert.equal(state.players.j.flags.juliusSkulkRound, undefined);
});

test("Black Scorpion lets skulk choose Combat deployment for 2 mana and permits Workshop", () => {
  const { built, definitions, state } = setup("julius-black-scorpion");
  useJuliusBlackScorpion({
    state,
    player: state.players.j,
    skill: built.skills.get(ASCENSION),
    payload: { eventType: "skill.unlocked", event: { playerId: "j", skillId: ASCENSION } },
    definitions,
  });
  assert.equal(state.players.j.flags.juliusBlackScorpionActive, true);

  let timing;
  useJuliusSkulk({
    state,
    player: state.players.j,
    skill: built.skills.get(SKULK),
    payload: {},
    definitions,
    openDecision: (decision) => { timing = decision; },
  });
  assert.deepEqual(timing.options.map((option) => option.id), ["action", "combat"]);
  const beforeMana = state.players.j.mana;
  const timingResult = resolveJuliusSkulkTiming({
    state,
    player: state.players.j,
    skill: built.skills.get(SKULK),
    payload: { decision: { status: "resolved", selections: ["combat"] } },
    definitions,
  });
  assert.deepEqual(timingResult, { deploymentPhase: "combat", paidMana: 2 });
  assert.equal(state.players.j.mana, beforeMana - 2);

  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "j";
  let deployment;
  useJuliusSkulk({
    state,
    player: state.players.j,
    skill: built.skills.get(SKULK),
    payload: { eventType: "phase.transitioned", event: { transition: "next-phase", previousPhase: "action" } },
    definitions,
    openDecision: (decision) => { deployment = decision; },
  });
  assert.ok(deployment.options.some((option) => option.id === "workshop"));
  const deployFrame = state.effectQueue[0];
  resolveJuliusSkulkDeployment({
    state,
    player: state.players.j,
    skill: built.skills.get(SKULK),
    payload: decisionPayload(deployFrame.payload, ["workshop"]),
    definitions,
  });
  assert.equal(state.players.j.locationId, "workshop");
});

test("Black Scorpion cannot select Combat delay without 2 mana", () => {
  const { built, definitions, state } = setup("julius-black-scorpion-no-mana");
  state.players.j.flags.juliusBlackScorpionActive = true;
  state.players.j.mana = 1;
  let timing;
  useJuliusSkulk({ state, player: state.players.j, skill: built.skills.get(SKULK), payload: {}, definitions, openDecision: (d) => { timing = d; } });
  assert.deepEqual(timing.options.map((option) => option.id), ["action"]);
  assert.throws(() => resolveJuliusSkulkTiming({
    state,
    player: state.players.j,
    skill: built.skills.get(SKULK),
    payload: { decision: { status: "resolved", selections: ["combat"] } },
    definitions,
  }), /JULIUS_SKULK_INSUFFICIENT_MANA/);
});

test("Rapid Aging can choose exactly two discard cards to remove", () => {
  const { built, definitions, basicId, state } = setup("julius-aging-remove");
  addCard(state, "j:d1", basicId, "discard");
  addCard(state, "j:d2", basicId, "discard");
  addCard(state, "j:d3", basicId, "discard");
  let mode;
  useJuliusRapidAging({
    state,
    player: state.players.j,
    skill: built.skills.get(AGING),
    payload: { eventType: "round.ending", event: { round: state.round } },
    definitions,
    openDecision: (decision) => { mode = decision; },
  });
  assert.equal(mode.kind, "julius-rapid-aging-mode");

  let removal;
  resolveJuliusRapidAgingMode({
    state,
    player: state.players.j,
    skill: built.skills.get(AGING),
    payload: { decision: { status: "resolved", selections: ["remove-two"] } },
    definitions,
    openDecision: (decision) => { removal = decision; },
  });
  assert.equal(removal.kind, "julius-rapid-aging-remove-two");
  const frame = state.effectQueue[0];
  const result = resolveJuliusRapidAgingRemove({
    state,
    player: state.players.j,
    skill: built.skills.get(AGING),
    payload: decisionPayload(frame.payload, ["j:d1", "j:d2"]),
    definitions,
  });
  assert.deepEqual(result.removedInstanceIds, ["j:d1", "j:d2"]);
  assert.equal(state.cards["j:d1"].zone, "removed");
  assert.equal(state.cards["j:d2"].zone, "removed");
  assert.equal(state.cards["j:d3"].zone, "discard");
});

test("Rapid Aging randomly discards; if hand is empty it draws first", () => {
  const { built, definitions, basicId, state } = setup("julius-aging-random");
  addCard(state, "j:deck", basicId, "deck");
  const result = useJuliusRapidAging({
    state,
    player: state.players.j,
    skill: built.skills.get(AGING),
    payload: { eventType: "round.ending", event: { round: state.round } },
    definitions,
    randomInt: () => 0,
  });
  assert.deepEqual(result, { discardedInstanceId: "j:deck", drewFirst: true });
  assert.equal(state.players.j.hand.length, 0);
  assert.ok(state.players.j.discard.includes("j:deck"));
});

test("Delayed deployment still respects normal situation destination restrictions", () => {
  const { built, definitions, state } = setup("julius-skulk-restrictions");
  state.players.j.flags.juliusBlackScorpionActive = true;
  state.players.j.flags.juliusSkulkRound = state.round;
  state.players.j.flags.juliusSkulkDeploymentPhase = "action";
  state.players.j.flags.skipDeploymentRound = state.round;
  state.modeState.situationRestrictions = { forbiddenLocations: ["city"] };
  state.phase = "action";
  state.activePlayerId = "j";
  let deployment;
  useJuliusSkulk({
    state,
    player: state.players.j,
    skill: built.skills.get(SKULK),
    payload: { eventType: "phase.transitioned", event: { transition: "next-phase" } },
    definitions,
    openDecision: (decision) => { deployment = decision; },
  });
  assert.equal(deployment.options.some((option) => option.id === "city"), false);
  assert.ok(deployment.options.some((option) => option.id === "mountain"));
  assert.ok(deployment.options.some((option) => option.id === "workshop"));
});
