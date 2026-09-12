import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, closePlayerCard } from "../src/rules-core/decks.ts";
import { addCardToAttack } from "../src/rules-core/card-play.ts";
import { useSiegfriedInvisibilityCloak } from "../src/rules-core/skill-handlers.ts";
import { isOtherPlayerAbilityEffectIgnored } from "../src/rules-core/ability-immunity.ts";
import { SkillRegistry } from "../src/rules-core/skill-registry.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";

const CLOAK = "servant.siegfried.skill.sc-siegfried-1";

function setup() {
  const built = buildStandardContent(legacyContent);
  const definitions = {
    ...built.cards,
    ...Object.fromEntries(built.events.map((event) => [event.id, event])),
    ...built.skills.asCardDefinitions(),
  };
  return { built, definitions };
}

function actionState(id = "siegfried-cloak") {
  const state = createGameState({
    gameInstanceId: id,
    players: [
      { id: "siegfried", name: "齐格飞" },
      { id: "enemy", name: "enemy" },
      { id: "far", name: "far" },
    ],
    seed: 5201,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "siegfried";
  state.turnOrder = ["siegfried", "enemy", "far"];
  state.players.siegfried.servantId = "servant.siegfried";
  state.players.siegfried.locationId = "mountain";
  state.players.enemy.locationId = "mountain";
  state.players.far.locationId = "city";
  state.board.locations.mountain = ["siegfried", "enemy"];
  state.board.locations.city = ["far"];
  return state;
}

function installActiveCloak(state) {
  createOwnedCardInstance(state, "siegfried", {
    instanceId: "cloak",
    definitionId: CLOAK,
    zone: "attack",
    face: "up",
    active: true,
  });
  state.cards.cloak.playCount = 1;
  state.cards.cloak.playedRound = state.round;
}

test("Siegfried package: all three reviewed skills are FULL and Invisibility Cloak is dedicated", () => {
  const { built } = setup();
  const skills = [1, 2, 3].map((index) => built.skills.get(`servant.siegfried.skill.sc-siegfried-${index}`));
  assert.deepEqual(skills.map((skill) => skill.supportLevel), ["FULL", "FULL", "FULL"]);
  assert.equal(skills[0].handlerId, "core.siegfried-invisibility-cloak");
  assert.equal(skills[0].activation, "phase");
  assert.deepEqual(skills[0].windows, ["action"]);
  assert.deepEqual(skills[0].passiveEventTypes, ["card.played", "round.ended"]);
  assert.equal(skills[0].requiresActiveCard, true);
  assert.equal(skills[1].handlerId, "core.structured-skill");
  assert.equal(skills[2].handlerId, "core.reveal-hand-power-bonus");
  for (const skill of skills) {
    assert.ok(skill.sourceRefs.some((source) => source.kind === "development-image"));
  }
  assert.deepEqual(skills[0].rules?.ambiguities ?? [], []);
  assert.deepEqual(skills[0].rules?.unmodeledClauses ?? [], []);
  assert.deepEqual(skills[0].rules?.abilities.map((ability) => ability.execution?.mode), ["handler", "handler"]);
});

test("Invisibility Cloak: physical face-up play count persists across closing and replaying the same card", () => {
  const { built, definitions } = setup();
  const skill = built.skills.get(CLOAK);
  const state = actionState("siegfried-play-count");
  state.players.siegfried.victoryPoints = 10;
  createOwnedCardInstance(state, "siegfried", {
    instanceId: "cloak",
    definitionId: CLOAK,
    zone: "servant-skills",
    face: "up",
    active: false,
  });

  addCardToAttack(state, "siegfried", "cloak", definitions);
  assert.equal(state.cards.cloak.playCount, 1);
  useSiegfriedInvisibilityCloak({
    state,
    player: state.players.siegfried,
    skill,
    payload: { eventType: "card.played", event: { playerId: "siegfried", instanceId: "cloak", definitionId: CLOAK, face: "up" } },
    openDecision: () => {},
  });
  assert.equal(state.players.siegfried.victoryPoints, 9);

  closePlayerCard(state, "siegfried", "cloak", definitions);
  addCardToAttack(state, "siegfried", "cloak", definitions);
  assert.equal(state.cards.cloak.playCount, 2);
  useSiegfriedInvisibilityCloak({
    state,
    player: state.players.siegfried,
    skill,
    payload: { eventType: "card.played", event: { playerId: "siegfried", instanceId: "cloak", definitionId: CLOAK, face: "up" } },
    openDecision: () => {},
  });
  assert.equal(state.players.siegfried.victoryPoints, 7);
});

test("Invisibility Cloak: action hides true name only for this round and installs location-sensitive ability immunity", () => {
  const { built } = setup();
  const skill = built.skills.get(CLOAK);
  const state = actionState("siegfried-hide-name");
  installActiveCloak(state);
  state.players.siegfried.trueNameRevealed = true;

  useSiegfriedInvisibilityCloak({ state, player: state.players.siegfried, skill, payload: {}, openDecision: () => {} });
  assert.equal(state.players.siegfried.trueNameRevealed, false);
  assert.equal(isOtherPlayerAbilityEffectIgnored(state, "enemy", "siegfried"), true);
  assert.equal(isOtherPlayerAbilityEffectIgnored(state, "far", "siegfried"), false);
  assert.equal(state.activeRuleModifiers.some((modifier) => modifier.rule === "other_player_ability_effect" && modifier.operation === "ignore"), true);

  state.players.enemy.locationId = "city";
  state.board.locations.mountain = ["siegfried"];
  state.board.locations.city = ["enemy", "far"];
  assert.equal(isOtherPlayerAbilityEffectIgnored(state, "enemy", "siegfried"), false);

  useSiegfriedInvisibilityCloak({
    state,
    player: state.players.siegfried,
    skill,
    payload: { eventType: "round.ended", event: {} },
    openDecision: () => {},
  });
  assert.equal(state.players.siegfried.trueNameRevealed, true);
});

test("Ability immunity boundary: same-location opponent phase ability cannot mutate protected player, but a different-location ability can", () => {
  const { built } = setup();
  const cloak = built.skills.get(CLOAK);
  const state = actionState("siegfried-registry-immunity");
  installActiveCloak(state);
  useSiegfriedInvisibilityCloak({ state, player: state.players.siegfried, skill: cloak, payload: {}, openDecision: () => {} });
  state.players.siegfried.victoryPoints = 6;

  const registry = new SkillRegistry();
  registry.register({
    id: "test.enemy.ability",
    name: "enemy ability",
    ownerType: "master",
    ownerId: "test.enemy",
    activation: "phase",
    windows: ["action"],
    cost: 0,
    text: "",
    supportLevel: "FULL",
  }, ({ state: current }) => { current.players.siegfried.victoryPoints = 0; });
  state.players.enemy.masterId = "test.enemy";
  state.activePlayerId = "enemy";
  registry.execute(state, "enemy", "test.enemy.ability", {}, () => {});
  assert.equal(state.players.siegfried.victoryPoints, 6);

  state.players.enemy.locationId = "city";
  state.board.locations.mountain = ["siegfried"];
  state.board.locations.city = ["enemy", "far"];
  state.players.enemy.usage = {};
  registry.execute(state, "enemy", "test.enemy.ability", {}, () => {});
  assert.equal(state.players.siegfried.victoryPoints, 0);
});

test("Ability immunity boundary: queued/passive abilities from same-location opponents are also ignored", () => {
  const { built } = setup();
  const cloak = built.skills.get(CLOAK);
  const state = actionState("siegfried-effect-immunity");
  installActiveCloak(state);
  useSiegfriedInvisibilityCloak({ state, player: state.players.siegfried, skill: cloak, payload: {}, openDecision: () => {} });
  state.players.siegfried.mana = 8;
  const runtime = new EffectRuntime();
  runtime.register("test.passive", ({ state: current }) => { current.players.siegfried.mana = 0; });
  state.effectQueue.push({
    effectId: "enemy-passive",
    handlerId: "test.passive",
    sourceId: "test.enemy.passive",
    controllerPlayerId: "enemy",
    payload: {},
    createdAtRevision: state.revision,
  });
  runtime.drain(state);
  assert.equal(state.players.siegfried.mana, 8);
});
