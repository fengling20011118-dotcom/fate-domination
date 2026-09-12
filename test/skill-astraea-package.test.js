import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";

const ORDER = "servant.astraea.skill.sc-astraea-2";
const SCALE = "servant.astraea.skill.sc-astraea-3";

function command(state, id, payload) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId: "a", expectedRevision: state.revision, type: CommandType.UseSkill, payload };
}

function setup(id = "astraea-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "a", name: "Astraea" }, { id: "o", name: "Opponent" }], seed: 1519 });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = ["a", "o"];
  state.players.a.servantId = "servant.astraea";
  state.players.a.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["a", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  createOwnedCardInstance(state, "a", { instanceId: "scale", definitionId: SCALE, zone: "servant-skills", face: "up", active: false });
  return { built, definitions, engine, state };
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload) {
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${++passiveCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Astraea package: all three skills are FULL and s2/s3 use dedicated structured handlers", () => {
  const { built } = setup("astraea-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.astraea");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(ORDER).handlerId, "core.astraea-return-order");
  assert.equal(built.skills.get(SCALE).handlerId, "core.astraea-scale-protection");
  assert.deepEqual(built.skills.get(SCALE).passiveEventTypes, ["card.played"]);
});

test("Scale Protection constrains a discarded printed attribute and replaces the previous constraint on later rounds", () => {
  const { engine, state } = setup("astraea-constrain");
  createOwnedCardInstance(state, "a", { instanceId: "magic", definitionId: "card.carda1", zone: "hand", face: "down", active: false });
  let result = engine.execute(state, command(state, "constrain-magic", { skillId: SCALE, data: { abilityId: "scale-constrain", discardInstanceId: "magic", attribute: "魔术" } }));
  assert.equal(result.state.cards.magic.zone, "discard");
  assert.equal(result.state.players.a.flags.astraeaConstrainedAttribute, "魔术");
  assert.equal(result.state.activeRuleModifiers.filter((m) => m.sourceId === SCALE && m.rule === "card_cost").length, 1);

  result.state.round = 5;
  result.state.phase = "outpost";
  result.state.step = "player-window";
  result.state.activePlayerId = "a";
  createOwnedCardInstance(result.state, "a", { instanceId: "strength", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  result = engine.execute(result.state, command(result.state, "constrain-strength", { skillId: SCALE, data: { abilityId: "scale-constrain", discardInstanceId: "strength", attribute: "力量" } }));
  assert.equal(result.state.players.a.flags.astraeaConstrainedAttribute, "力量");
  assert.equal(result.state.activeRuleModifiers.filter((m) => m.sourceId === SCALE && m.rule === "card_cost").length, 1);
  assert.deepEqual(result.state.activeRuleModifiers.find((m) => m.sourceId === SCALE)?.scope?.cards?.attributesAny, ["力量"]);
});

test("matching opponent use condemns after that use; later matching hand/skill attacks cost +3 capped at 12", () => {
  const { definitions, engine, state } = setup("astraea-condemn-cost");
  createOwnedCardInstance(state, "a", { instanceId: "discard-strength", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  let result = engine.execute(state, command(state, "constrain", { skillId: SCALE, data: { abilityId: "scale-constrain", discardInstanceId: "discard-strength", attribute: "力量" } }));

  createOwnedCardInstance(result.state, "o", { instanceId: "trigger", definitionId: "card.cardb2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(result.state, "o", { instanceId: "expensive", definitionId: "servant.altera.skill.sc-altera-2", zone: "servant-skills", face: "up", active: false });
  assert.equal(getCardPlayCost(result.state, definitions["servant.altera.skill.sc-altera-2"], result.state.players.o, result.state.cards.expensive, definitions), 10);
  emitPassive(engine, result.state, definitions, "card.played", { playerId: "o", instanceId: "trigger", definitionId: "card.cardb2", face: "up" });
  assert.equal(result.state.players.o.flags.condemned, true);
  assert.ok(result.state.players.o.statuses.includes("谴责"));
  assert.equal(getCardPlayCost(result.state, definitions["servant.altera.skill.sc-altera-2"], result.state.players.o, result.state.cards.expensive, definitions), 12);

  createOwnedCardInstance(result.state, "o", { instanceId: "quick", definitionId: "card.cardq1", zone: "hand", face: "down", active: false });
  assert.equal(getCardPlayCost(result.state, definitions["card.cardq1"], result.state.players.o, result.state.cards.quick, definitions), 0);
});

test("Return Order gives +2 only when no active attack has the constrained attribute", () => {
  const { engine, state } = setup("astraea-order-self");
  state.phase = "action";
  state.players.a.flags.astraeaConstrainedAttribute = "力量";
  createOwnedCardInstance(state, "a", { instanceId: "magic", definitionId: "card.carda1", zone: "attack", face: "up", active: true });
  let result = engine.execute(state, command(state, "order-self", { skillId: ORDER, data: { abilityId: "order-self-power" } }));
  assert.equal(result.state.players.a.flags.roundPowerBonus, 2);

  result.state.round = 5;
  result.state.phase = "action";
  result.state.step = "player-window";
  result.state.activePlayerId = "a";
  createOwnedCardInstance(result.state, "a", { instanceId: "strength", definitionId: "card.cardb1", zone: "attack", face: "up", active: true });
  assert.ok(!engine.getLegalActions(result.state, "a").some((action) => action.type === CommandType.UseSkill && action.payload?.skillId === ORDER && action.payload?.data?.abilityId === "order-self-power"));
});

test("Return Order combat clause requires active s2 and gives -4 only to opponents whose 2+ attacks share no common attribute", () => {
  const { engine, state } = setup("astraea-order-combat");
  state.phase = "combat";
  createOwnedCardInstance(state, "a", { instanceId: "order", definitionId: ORDER, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "o-strength", definitionId: "card.cardb1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "o-magic", definitionId: "card.carda1", zone: "attack", face: "up", active: true });
  const result = engine.execute(state, command(state, "order-combat", { skillId: ORDER, data: { abilityId: "order-opponent-power" } }));
  assert.equal(result.state.players.o.flags.roundPowerBonus, -4);
});
