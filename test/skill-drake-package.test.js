import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const RIDING = "servant.drake.skill.sc-drake-1";
const GOLDEN_HIND = "servant.drake.skill.sc-drake-2";
const NAVIGATOR = "servant.drake.skill.sc-drake-3";
const QUICK_MARCH = "card.cardsurveil";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setupBuilt() {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  return { built, engine, definitions };
}

function addCard(state, playerId, instanceId, definitionId, zone = "attack", active = true) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face: active ? "up" : "down",
    active,
    residual: false,
  });
}

function actionState(id, includeNavigator = true) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "drake", name: "Drake" }, { id: "opponent", name: "Opponent" }], seed: 2701 });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "drake";
  state.players.drake.servantId = "servant.drake";
  state.players.drake.locationId = "city";
  state.board.locations.city = ["drake"];
  if (includeNavigator) addCard(state, "drake", "navigator-passive", NAVIGATOR, "servant-skills", false);
  addCard(state, "drake", "quick-march", QUICK_MARCH, "attack", true);
  return state;
}

test("Drake package: all three reviewed skills are FULL and Navigator keeps its independent three clauses", () => {
  const { built } = setupBuilt();
  const riding = built.skills.get(RIDING);
  const hind = built.skills.get(GOLDEN_HIND);
  const navigator = built.skills.get(NAVIGATOR);

  assert.equal(riding.supportLevel, "FULL");
  assert.equal(riding.handlerId, "core.riding");
  assert.equal(hind.supportLevel, "FULL");
  assert.equal(hind.handlerId, "core.structured-skill");
  assert.equal(navigator.supportLevel, "FULL");
  assert.equal(navigator.handlerId, "core.structured-skill");
  assert.equal(navigator.cost, 2);
  assert.equal(navigator.requirement, 2);
  assert.equal(navigator.typeLabel, "特殊");
  assert.deepEqual(navigator.attributes, ["特殊"]);
  assert.deepEqual(navigator.basePowerFormula, {
    type: "formula",
    op: "multiply",
    args: [{ type: "metric", metric: "movement_distance_this_round" }, 4],
  });
  assert.deepEqual(navigator.rules.abilities.map((ability) => ability.id), ["navigator-reverse-quick-march", "plunder"]);
  const reverse = navigator.rules.abilities[0];
  assert.equal(reverse.kind, "passive");
  assert.deepEqual(reverse.conditions, [{ type: "source_owned" }]);
  assert.equal(reverse.ruleModifiers[0].rule, "card_ability_move_direction");
  const plunder = navigator.rules.abilities[1];
  assert.equal(plunder.kind, "phase_action");
  assert.equal(plunder.effects[0].amount.metric, "locations_passed_this_round");
  assert.deepEqual(plunder.effects[0].amount.locationIds, ["mountain", "city"]);
});

test("Drake package: Navigator X is four times authoritative movement distance this round", () => {
  const { definitions } = setupBuilt();
  for (const [distance, expected] of [[0, 0], [1, 4], [2, 8], [3, 12]]) {
    const state = createGameState({ gameInstanceId: `drake-x-${distance}`, players: [{ id: "drake", name: "Drake" }], seed: 2702 });
    state.status = "playing";
    state.round = 5;
    state.phase = "combat";
    state.players.drake.flags.movementDistanceThisRound = distance;
    const card = addCard(state, "drake", `navigator-${distance}`, NAVIGATOR, "attack", true);
    assert.equal(calculateCombatCardPower(state, state.players.drake, card.instanceId, definitions, "mountain"), expected);
  }
});

test("Drake package: board movement records ordered passed/stopped locations independently from movement distance", () => {
  const { built, engine } = setupBuilt();
  const state = createGameState({ gameInstanceId: "drake-route-history", players: [{ id: "drake", name: "Drake" }], seed: 2703 });
  state.status = "playing";
  state.round = 5;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "drake";
  state.players.drake.servantId = "servant.drake";

  let result = engine.execute(state, command(state, "drake-deploy-mountain", CommandType.DeployPlayer, "drake", { locationId: "mountain" }));
  assert.deepEqual(result.state.players.drake.locationsPassedThisRound, []);
  assert.equal(Number(result.state.players.drake.flags.movementDistanceThisRound ?? 0), 0);

  result.state.phase = "action";
  result.state.step = "move-decision";
  result.state.activePlayerId = "drake";
  result.state.players.drake.mana = 10;
  result = engine.execute(result.state, command(result.state, "drake-move-scouting", CommandType.MovePlayer, "drake", { locationId: "scouting", ignoreEngagement: true }));
  assert.deepEqual(result.state.players.drake.locationsPassedThisRound, ["city", "scouting"]);
  assert.equal(result.state.players.drake.flags.movementDistanceThisRound, 2);

  // The route history is a separate metric: only mountain/city are battlefields.
  assert.equal(result.state.players.drake.locationsPassedThisRound.filter((id) => id === "mountain" || id === "city").length, 1);
  assert.ok(built.cards[QUICK_MARCH].cardAbilityIds.includes("basic.quick-march"));
});

test("Drake package: Navigator passive lets only Quick March move one arrow backward and does not gate forward Quick March", () => {
  const { engine } = setupBuilt();
  const state = actionState("drake-quick-march-backward", true);
  let result = engine.execute(state, command(state, "drake-march-back", CommandType.UseCardAbility, "drake", {
    instanceId: "quick-march",
    ability: "basic.quick-march",
    targetLocationId: "mountain",
  }));
  assert.equal(result.state.players.drake.locationId, "mountain");
  assert.equal(result.events.some((event) => event.type === "card.used" && event.payload?.method === "ability"), true);

  const ordinary = actionState("ordinary-quick-march-backward", false);
  assert.throws(() => engine.execute(ordinary, command(ordinary, "ordinary-march-back", CommandType.UseCardAbility, "drake", {
    instanceId: "quick-march",
    ability: "basic.quick-march",
    targetLocationId: "mountain",
  })), /QUICK_MARCH_DIRECTION_FORBIDDEN/);

  const forward = actionState("ordinary-quick-march-forward", false);
  forward.players.drake.locationId = "mountain";
  forward.board.locations.city = [];
  forward.board.locations.mountain = ["drake", "opponent"]; // engaged: Quick March ignores engagement.
  forward.players.opponent.locationId = "mountain";
  const forwardResult = engine.execute(forward, command(forward, "ordinary-march-forward", CommandType.UseCardAbility, "drake", {
    instanceId: "quick-march",
    ability: "basic.quick-march",
    targetLocationId: "city",
  }));
  assert.equal(forwardResult.state.players.drake.locationId, "city");

  const far = actionState("drake-quick-march-far", true);
  far.players.drake.locationId = "mountain";
  far.board.locations.city = [];
  far.board.locations.mountain = ["drake"];
  assert.throws(() => engine.execute(far, command(far, "drake-march-far", CommandType.UseCardAbility, "drake", {
    instanceId: "quick-march",
    ability: "basic.quick-march",
    targetLocationId: "scouting",
  })), /QUICK_MARCH_DESTINATION_INVALID/);
});

test("Drake package: Navigator passive is valid from the hand per FQA passive-source rule", () => {
  const { engine } = setupBuilt();
  const state = actionState("drake-navigator-in-hand", false);
  addCard(state, "drake", "navigator-hand", NAVIGATOR, "hand", false);
  const result = engine.execute(state, command(state, "drake-hand-passive-back", CommandType.UseCardAbility, "drake", {
    instanceId: "quick-march",
    ability: "basic.quick-march",
    targetLocationId: "mountain",
  }));
  assert.equal(result.state.players.drake.locationId, "mountain");
});

test("Drake package: Plunder counts battlefield passes/stops, including repeated battlefield visits, but not non-battlefields", () => {
  const { engine } = setupBuilt();
  const state = createGameState({ gameInstanceId: "drake-plunder", players: [{ id: "drake", name: "Drake" }], seed: 2704 });
  state.status = "playing";
  state.round = 5;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "drake";
  state.players.drake.servantId = "servant.drake";
  state.players.drake.locationId = "city";
  state.board.locations.city = ["drake"];
  state.players.drake.locationsPassedThisRound = ["mountain", "city", "scouting", "city"];
  addCard(state, "drake", "navigator-active", NAVIGATOR, "attack", true);

  const result = engine.execute(state, command(state, "drake-plunder-use", CommandType.UseSkill, "drake", {
    skillId: NAVIGATOR,
    data: { abilityId: "plunder" },
  }));
  assert.equal(result.state.players.drake.victoryPoints, 3);
});
