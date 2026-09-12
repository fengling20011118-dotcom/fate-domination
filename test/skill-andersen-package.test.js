import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { calculateCombatSnapshot, finalizeCombatFromSnapshot } from "../src/rules-core/combat.ts";
import { getStructuredCardName } from "../src/rules-core/card-transforms.ts";
import { isStructuredDefeatIgnored } from "../src/rules-core/rule-modifiers.ts";

function builtContent() {
  const built = buildStandardContent(legacyContent);
  return { built, definitions: { ...built.cards, ...built.skills.asCardDefinitions() } };
}

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function addWrittenStory(state, playerId = "andersen") {
  return createOwnedCardInstance(state, playerId, {
    instanceId: `${playerId}-written-story`,
    definitionId: "servant.andersen.skill.sc-andersen-2",
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
  });
}

function playingState(id, players = [{ id: "andersen", name: "Andersen" }, { id: "other", name: "Other" }]) {
  const state = createGameState({ gameInstanceId: id, players, seed: 2501 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = players[0].id;
  state.players.andersen.servantId = "servant.andersen";
  return state;
}

test("Andersen package: all three reviewed skills keep official card fields and FULL support", () => {
  const { built } = builtContent();
  const territory = built.skills.get("servant.andersen.skill.sc-andersen-1");
  const story = built.skills.get("servant.andersen.skill.sc-andersen-2");
  const monster = built.skills.get("servant.andersen.skill.sc-andersen-3");

  assert.equal(territory.supportLevel, "FULL");
  assert.equal(territory.handlerId, "core.territory-creation");
  assert.equal(territory.basePower, 2);
  assert.deepEqual(territory.costRule, { kind: "round-linear", base: 16, perRound: -2, min: 0 });

  assert.equal(story.supportLevel, "FULL");
  assert.equal(story.handlerId, "core.structured-skill");
  assert.equal(story.cost, 8);
  assert.equal(story.basePower, 0);
  assert.deepEqual(story.basePowerFormula, {
    type: "formula",
    op: "ceil_divide",
    args: [{ type: "metric", metric: "victory_points" }, 5],
  });
  assert.equal(story.cardResidual, true);
  const storyAbility = story.rules.abilities.find((ability) => ability.id === "written-story-residual");
  assert.ok(storyAbility);
  assert.equal(storyAbility.ruleModifiers.some((modifier) => modifier.rule === "non_effect_victory_point_gain" && modifier.operation === "forbid"), true);
  assert.equal(storyAbility.transforms.some((transform) => transform.id === "basic-special-becomes-luck"), true);

  assert.equal(monster.supportLevel, "FULL");
  assert.equal(monster.handlerId, "core.andersen-innocent-monster");
  assert.equal(monster.markedDefeatVictoryPointReward, 2);
  assert.equal(monster.variableManaPowerBonusMax, 12);
});

test("Andersen package: Written Story X is actual printed base power ceil(victoryPoints/5)", () => {
  const { definitions } = builtContent();
  for (const [victoryPoints, expected] of [[0, 0], [1, 1], [5, 1], [6, 2], [11, 3]]) {
    const state = playingState(`andersen-x-${victoryPoints}`);
    state.players.andersen.victoryPoints = victoryPoints;
    const card = addWrittenStory(state);
    assert.equal(calculateCombatCardPower(state, state.players.andersen, card.instanceId, definitions, "mountain"), expected);
  }
});

test("Andersen package: Written Story continuously renames own basic Special cards to Lucky and reverts with source", () => {
  const { definitions } = builtContent();
  const state = playingState("andersen-transform-name");
  const source = addWrittenStory(state);
  const preparation = definitions["card.cardpreparation"];
  const surveil = definitions["card.cardsurveil"];
  assert.equal(preparation.name, "远隔操作");
  assert.equal(surveil.name, "急行");
  assert.equal(getStructuredCardName(state, "andersen", preparation, definitions), "幸运");
  assert.equal(getStructuredCardName(state, "andersen", surveil, definitions), "幸运");
  assert.equal(getStructuredCardName(state, "other", preparation, definitions), "远隔操作");
  source.active = false;
  assert.equal(getStructuredCardName(state, "andersen", preparation, definitions), "远隔操作");
});

test("Andersen package: granted Lucky combat ability uses canonical UseCardAbility and emits card.used", () => {
  const { built, definitions } = builtContent();
  const engine = new StandardMatchEngine(built);
  const state = playingState("andersen-granted-luck");
  addWrittenStory(state);
  createOwnedCardInstance(state, "andersen", {
    instanceId: "andersen-preparation",
    definitionId: "card.cardpreparation",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, command(state, "andersen-use-granted-luck", CommandType.UseCardAbility, "andersen", {
    instanceId: "andersen-preparation",
    ability: "written-story-ignore-defeat",
  }));
  assert.equal(isStructuredDefeatIgnored(result.state, "andersen", definitions), true);
  const used = result.events.find((event) => event.type === "card.used" && event.payload?.instanceId === "andersen-preparation");
  assert.ok(used);
  assert.equal(used.payload.method, "ability");
  assert.throws(() => engine.execute(result.state, command(result.state, "andersen-use-granted-luck-twice", CommandType.UseCardAbility, "andersen", {
    instanceId: "andersen-preparation",
    ability: "written-story-ignore-defeat",
  })), /CARD_ABILITY_LIMIT_REACHED/);

  const actionState = playingState("andersen-granted-luck-wrong-window");
  actionState.phase = "action";
  addWrittenStory(actionState);
  createOwnedCardInstance(actionState, "andersen", {
    instanceId: "andersen-preparation-action",
    definitionId: "card.cardpreparation",
    zone: "attack",
    face: "up",
    active: true,
  });
  assert.throws(() => engine.execute(actionState, command(actionState, "andersen-use-granted-luck-action", CommandType.UseCardAbility, "andersen", {
    instanceId: "andersen-preparation-action",
    ability: "written-story-ignore-defeat",
  })), /CARD_ABILITY_WINDOW_FORBIDDEN/);
});

test("Andersen package: Written Story blocks base combat reward while active and restores it when closed", () => {
  const { definitions } = builtContent();
  const resolve = (id, active) => {
    const state = playingState(id);
    state.players.andersen.locationId = "mountain";
    state.players.other.locationId = "mountain";
    state.board.locations.mountain = ["andersen", "other"];
    state.board.currentEvents.mountain = [];
    const source = addWrittenStory(state);
    source.active = active;
    const snapshot = calculateCombatSnapshot(state, "mountain", definitions);
    snapshot.powers.andersen = 10;
    snapshot.powers.other = 0;
    return { state, result: finalizeCombatFromSnapshot(state, snapshot, definitions, {}) };
  };

  const blocked = resolve("andersen-combat-vp-blocked", true);
  assert.equal(blocked.result.victoryPoints.andersen, 0);
  assert.equal(blocked.state.players.andersen.victoryPoints, 0);

  const allowed = resolve("andersen-combat-vp-allowed", false);
  assert.equal(allowed.result.victoryPoints.andersen, 2);
  assert.equal(allowed.state.players.andersen.victoryPoints, 2);
});

test("Andersen package: Written Story blocks the FQA scouting base reward while active", () => {
  const { definitions } = builtContent();
  const state = playingState("andersen-scouting-vp", [
    { id: "fighterA", name: "A" },
    { id: "fighterB", name: "B" },
    { id: "andersen", name: "Andersen" },
  ]);
  state.activePlayerId = "fighterA";
  state.players.andersen.locationId = "scouting";
  state.players.fighterA.locationId = "mountain";
  state.players.fighterB.locationId = "mountain";
  state.board.locations.scouting = ["andersen"];
  state.board.locations.mountain = ["fighterA", "fighterB"];
  state.board.currentEvents.mountain = [];
  addWrittenStory(state);
  const snapshot = calculateCombatSnapshot(state, "mountain", definitions);
  snapshot.powers.fighterA = 10;
  snapshot.powers.fighterB = 0;
  const result = finalizeCombatFromSnapshot(state, snapshot, definitions, {});
  assert.equal(result.scoutingPlayerId, "andersen");
  assert.equal(result.victoryPoints.andersen, 0);
  assert.equal(state.players.andersen.victoryPoints, 0);
  assert.equal(state.board.scoutingAwardedRound, state.round);
});
