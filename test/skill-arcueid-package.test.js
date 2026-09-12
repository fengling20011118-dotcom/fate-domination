import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const MARBLE = "master.arcueid.skill.s2";
const THIRST = "master.arcueid.skill.s3";
const CASTLE = "master.arcueid.skill.ascension";

function command(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "arcueid") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "a", name: "Arcueid" }, { id: "o", name: "Opponent" }], seed: 9601 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = ["a", "o"];
  state.players.a.masterId = "master.arcueid";
  state.players.a.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["a", "o"];
  createOwnedCardInstance(state, "a", { instanceId: "marble", definitionId: MARBLE, zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(state, "a", { instanceId: "castle", definitionId: CASTLE, zone: "master-skills", face: "up", active: false });
  return { built, definitions, engine, state };
}

test("Arcueid package: all five skills are FULL", () => {
  const { built } = setup("arcueid-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.arcueid");
  assert.equal(skills.length, 5);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(MARBLE).handlerId, "core.arcueid-materialization");
  assert.equal(built.skills.get(CASTLE).requiresSkillUsedThisRound, MARBLE);
  assert.deepEqual(built.skills.get(MARBLE).rules?.ambiguities ?? [], []);
  assert.deepEqual(built.skills.get(CASTLE).rules?.unmodeledClauses ?? [], []);
});

test("Marble Phantasm is prepared in action and may replace a basic attack twice during combat", () => {
  const { built, engine, state } = setup("arcueid-marble");
  createOwnedCardInstance(state, "o", { instanceId: "target-1", definitionId: "card.cardb2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "target-2", definitionId: "card.cardq2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "draw-nonbasic", definitionId: "card.card-kohaku-blast", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "draw-basic-1", definitionId: "card.cardb2", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "draw-basic-2", definitionId: "card.cardq2", zone: "deck", face: "down", active: false });

  let result = engine.execute(state, command(state, "prepare", CommandType.UseSkill, "a", { skillId: MARBLE, data: { abilityId: "prepare-materialization" } }));
  assert.equal(result.state.players.a.flags.arcueidMaterializationPreparedRound, 4);
  result.state.phase = "combat";
  result.state.step = "player-window";
  result.state.activePlayerId = "a";

  result = engine.execute(result.state, command(result.state, "replace-1", CommandType.UseSkill, "a", { skillId: MARBLE, data: { abilityId: "materialize-replace" } }));
  assert.equal(result.state.pendingDecision?.kind, "arcueid-materialization-basic-attack");
  result = engine.execute(result.state, command(result.state, "resolve-1", CommandType.ResolveDecision, "a", { decisionId: result.state.pendingDecision.decisionId, selections: ["target-1"] }));
  assert.equal(result.state.cards["target-1"].active, false);
  assert.ok(result.state.players.o.hand.includes("draw-nonbasic"));
  assert.equal(result.state.cards["draw-basic-1"].zone, "attack");
  assert.equal(result.state.cards["draw-basic-1"].active, true);

  result = engine.execute(result.state, command(result.state, "replace-2", CommandType.UseSkill, "a", { skillId: MARBLE, data: { abilityId: "materialize-replace" } }));
  result = engine.execute(result.state, command(result.state, "resolve-2", CommandType.ResolveDecision, "a", { decisionId: result.state.pendingDecision.decisionId, selections: ["target-2"] }));
  assert.equal(result.state.cards["target-2"].active, false);
  assert.equal(result.state.cards["draw-basic-2"].zone, "attack");
  assert.equal(result.state.players.a.usage[`${MARBLE}:materialize-replace`].count, 2);
  assert.ok(!built.skills.getLegalActions(result.state, "a", { ...built.cards, ...built.skills.asCardDefinitions() })
    .some((action) => action.payload?.skillId === MARBLE && action.payload?.data?.abilityId === "materialize-replace"));
});

test("Millennium Castle can be played only after Marble Phantasm was used this round", () => {
  const { definitions, engine, state } = setup("arcueid-castle-play");
  state.players.a.mana = 8;
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "a", instanceId: "castle", definitions, faceDown: false }), /CARD_REQUIRES_SKILL_USED_THIS_ROUND/);
  const result = engine.execute(state, command(state, "prepare-castle", CommandType.UseSkill, "a", { skillId: MARBLE, data: { abilityId: "prepare-materialization" } }));
  const currentDefinitions = { ...definitions };
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state: result.state, playerId: "a", instanceId: "castle", definitions: currentDefinitions, faceDown: false }));
});

test("Millennium Castle adds a second copy of Blood Thirst's basic-card cost and power modifiers", () => {
  const { definitions, state } = setup("arcueid-castle-thirst");
  createOwnedCardInstance(state, "a", { instanceId: "thirst", definitionId: THIRST, zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(state, "a", { instanceId: "basic", definitionId: "card.cardb2", zone: "attack", face: "up", active: true });
  state.players.a.flags.moonPrincessThirstActive = true;
  const definition = definitions["card.cardb2"];
  assert.equal(getCardPlayCost(state, definition, state.players.a, state.cards.basic, definitions), 2);
  assert.equal(calculateCombatCardPower(state, state.players.a, "basic", definitions, "mountain"), 7);
});
