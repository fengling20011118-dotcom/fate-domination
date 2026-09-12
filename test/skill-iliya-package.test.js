import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const ASCENSION = "master.iliya.skill.ascension";

function setup() {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  return { built, definitions };
}

function makeState(id = "iliya-third-magic") {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "i", name: "Illya" }, { id: "a", name: "Alive" }, { id: "e", name: "Eliminated" }], seed: 7101 });
  state.status = "playing";
  state.round = 9;
  state.phase = "preparation";
  state.step = "player-window";
  state.activePlayerId = "i";
  state.turnOrder = ["i", "a", "e"];
  state.players.i.masterId = "master.iliya";
  state.players.e.eliminated = true;
  createOwnedCardInstance(state, "i", { instanceId: "third-magic", definitionId: ASCENSION, zone: "master-skills", face: "up", active: false });
  return state;
}

function runPassive(state, built, definitions, type, payload) {
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  enqueuePassiveEffects(state, passives, { eventId: `evt:${type}`, type, revision: state.revision, sourceCommandId: "test", payload });
  effects.drain(state, 1000, definitions);
}

test("Illya package: all master skills are FULL after Third Magic review", () => {
  const { built } = setup();
  const ids = ["master.iliya.skill.s1", "master.iliya.skill.s2", "master.iliya.skill.s3", "master.iliya.skill.s4", ASCENSION];
  assert.ok(ids.every((id) => built.skills.get(id).supportLevel === "FULL"));
  const ascension = built.skills.get(ASCENSION);
  assert.deepEqual(ascension.passiveEventTypes, ["skill.unlocked", "round.started"]);
  assert.deepEqual(ascension.rules?.ambiguities ?? [], []);
  assert.deepEqual(ascension.rules?.unmodeledClauses ?? [], []);
});

test("Third Magic unlock removes Strength cards only from hand, deck and discard", () => {
  const { built, definitions } = setup();
  const state = makeState("iliya-remove-strength");
  for (const [instanceId, definitionId, zone] of [["s-hand", "card.cardb1", "hand"], ["s-deck", "card.cardb2", "deck"], ["s-discard", "card.cardb3", "discard"], ["m-hand", "card.carda1", "hand"]]) {
    createOwnedCardInstance(state, "i", { instanceId, definitionId, zone, face: "down", active: false });
  }
  runPassive(state, built, definitions, "skill.unlocked", { playerId: "i", skillId: ASCENSION, definitionId: ASCENSION, instanceId: "third-magic" });
  for (const id of ["s-hand", "s-deck", "s-discard"]) assert.equal(state.cards[id].zone, "removed");
  assert.equal(state.cards["m-hand"].zone, "hand");
});

test("Third Magic gives +2 only to basic Magic and Special attacks", () => {
  const { definitions } = setup();
  const state = makeState("iliya-third-power");
  state.phase = "combat";
  for (const [instanceId, definitionId] of [["magic", "card.carda2"], ["quick", "card.cardq2"]]) createOwnedCardInstance(state, "i", { instanceId, definitionId, zone: "attack", face: "up", active: true });
  const magicBase = definitions["card.carda2"].basePower;
  const quickBase = definitions["card.cardq2"].basePower;
  assert.equal(calculateCombatCardPower(state, state.players.i, "magic", definitions), magicBase + 2);
  assert.equal(calculateCombatCardPower(state, state.players.i, "quick", definitions), quickBase);
});

test("Third Magic on Heaven's Cup immediately wins for every non-eliminated player", () => {
  const { built, definitions } = setup();
  const state = makeState("iliya-heavens-cup");
  state.modeState.currentSituationId = "situation.sit13";
  state.modeState.currentSituationClimax = true;
  runPassive(state, built, definitions, "round.started", { round: state.round, phase: state.phase, activePlayerId: state.activePlayerId });
  assert.equal(state.status, "finished");
  assert.deepEqual(state.modeState.instantVictoryIds, ["i", "a"]);
  assert.equal(state.modeState.instantVictoryReason, "master.iliya.third-magic-heavens-cup");
});

test("Third Magic does not end the game under a different situation", () => {
  const { built, definitions } = setup();
  const state = makeState("iliya-not-heavens-cup");
  state.modeState.currentSituationId = "situation.sit12";
  runPassive(state, built, definitions, "round.started", { round: state.round, phase: state.phase, activePlayerId: state.activePlayerId });
  assert.equal(state.status, "playing");
});
