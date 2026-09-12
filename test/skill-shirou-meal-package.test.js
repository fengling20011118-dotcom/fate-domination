import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { gainCustomResource, getCustomResource } from "../src/rules-core/resources.ts";
import { SHIROU_MEAL_ASCENSION_ID, SHIROU_MEAL_FOOD, SHIROU_MEAL_MENU_ID, SHIROU_MEAL_PROCUREMENT_ID } from "../src/rules-core/shirou-meal.ts";

function setup(id = "shirou-meal") {
  const built = buildStandardContent(legacyContent);
  registerCoreSkillHandlers(built.skills);
  const definitions = {
    ...built.cards,
    ...Object.fromEntries(built.events.map((definition) => [definition.id, definition])),
    ...Object.fromEntries(built.situations.map((definition) => [definition.id, definition])),
    ...built.skills.asCardDefinitions(),
  };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "s", name: "Shirou" }, { id: "o", name: "Opponent" }], seed: 616 });
  state.status = "playing";
  state.round = 2;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.players.s.masterId = "master.shirou-meal";
  state.players.s.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["s", "o"];
  state.players.s.flags.deploymentLocationId = "mountain";
  state.players.s.flags.deploymentBonus = 3;
  state.players.s.flags.deploymentBonusActive = true;
  state.board.currentEvents.mountain = ["event.fuyuki.4", "event.fuyuki.6"];
  state.board.activeSituations = ["situation.sit5"];
  return { built, definitions, state };
}

function passiveContext(id) {
  const ctx = setup(id);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(ctx.built.skills, passives, effects, ctx.definitions);
  return { ...ctx, passives, effects };
}

function emitPassive(ctx, type, payload = {}) {
  enqueuePassiveEffects(ctx.state, ctx.passives, {
    eventId: `${ctx.state.gameInstanceId}:${type}:${ctx.state.effectQueue.length}`,
    sourceCommandId: "test",
    revision: ctx.state.revision,
    type,
    payload,
  });
  ctx.effects.drain(ctx.state, 1000, ctx.definitions);
}

test("Shirou Meal package is fully handled and Situation attributes are structured", () => {
  const { built } = setup("shirou-meal-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.shirou-meal");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(SHIROU_MEAL_PROCUREMENT_ID).handlerId, "core.shirou-meal-procurement");
  assert.equal(built.skills.get(SHIROU_MEAL_MENU_ID).handlerId, "core.shirou-meal-menu");
  assert.equal(built.skills.get(SHIROU_MEAL_ASCENSION_ID).handlerId, "core.shirou-meal-ascension");
  assert.deepEqual(built.situations.find((item) => item.id === "situation.sit4")?.mentionedAttributes, ["力量"]);
  assert.deepEqual(built.situations.find((item) => item.id === "situation.sit7")?.mentionedAttributes, ["魔术", "宝具"]);
});

test("Food Procurement gains each Strength/Agility/Magic food at most once per round", () => {
  const { built, definitions, state } = setup("shirou-meal-procurement");
  built.skills.execute(state, "s", SHIROU_MEAL_PROCUREMENT_ID, { abilityId: "food-procurement" }, () => { throw new Error("UNEXPECTED_DECISION"); }, () => 0, definitions);
  assert.equal(getCustomResource(state.players.s, SHIROU_MEAL_FOOD.meat), 1);
  assert.equal(getCustomResource(state.players.s, SHIROU_MEAL_FOOD.vegetable), 1);
  assert.equal(getCustomResource(state.players.s, SHIROU_MEAL_FOOD.fish), 1);
  assert.throws(() => built.skills.execute(state, "s", SHIROU_MEAL_PROCUREMENT_ID, { abilityId: "food-procurement" }, () => {}, () => 0, definitions), /SKILL_USE_FORBIDDEN/);
  state.round += 1;
  built.skills.execute(state, "s", SHIROU_MEAL_PROCUREMENT_ID, { abilityId: "food-procurement" }, () => { throw new Error("UNEXPECTED_DECISION"); }, () => 0, definitions);
  assert.equal(getCustomResource(state.players.s, SHIROU_MEAL_FOOD.meat), 2);
  assert.equal(getCustomResource(state.players.s, SHIROU_MEAL_FOOD.vegetable), 2);
  assert.equal(getCustomResource(state.players.s, SHIROU_MEAL_FOOD.fish), 2);
});

test("Today's Menu handles three-same and three-different Food rewards and the next natural shuffle shield", () => {
  const ctx = passiveContext("shirou-meal-menu");
  ctx.state.players.s.victoryPoints = 8;
  gainCustomResource(ctx.state.players.s, SHIROU_MEAL_FOOD.meat, 3);
  ctx.built.skills.execute(ctx.state, "s", SHIROU_MEAL_MENU_ID, { abilityId: "prepare-meal", foodResourceIds: [SHIROU_MEAL_FOOD.meat, SHIROU_MEAL_FOOD.meat, SHIROU_MEAL_FOOD.meat] }, () => { throw new Error("UNEXPECTED_DECISION"); }, () => 0, ctx.definitions);
  assert.equal(getCustomResource(ctx.state.players.s, SHIROU_MEAL_FOOD.meat), 0);
  assert.equal(ctx.state.players.s.flags.roundPowerBonus, 6);
  assert.equal(ctx.state.players.s.flags.shirouMealGluttonProtection, 1);
  emitPassive(ctx, "player.deck-shuffled", { playerId: "s", reason: "automatic-recycle", sequence: 1, round: ctx.state.round });
  assert.equal(ctx.state.players.s.victoryPoints, 8);
  assert.equal(ctx.state.players.s.flags.shirouMealGluttonProtection, 0);
  emitPassive(ctx, "player.deck-shuffled", { playerId: "s", reason: "automatic-recycle", sequence: 2, round: ctx.state.round });
  assert.equal(ctx.state.players.s.victoryPoints, 5);

  ctx.state.round += 1;
  gainCustomResource(ctx.state.players.s, SHIROU_MEAL_FOOD.meat, 1);
  gainCustomResource(ctx.state.players.s, SHIROU_MEAL_FOOD.vegetable, 1);
  gainCustomResource(ctx.state.players.s, SHIROU_MEAL_FOOD.fish, 1);
  ctx.state.players.s.mana = 1;
  ctx.built.skills.execute(ctx.state, "s", SHIROU_MEAL_MENU_ID, { abilityId: "prepare-meal", foodResourceIds: [SHIROU_MEAL_FOOD.meat, SHIROU_MEAL_FOOD.vegetable, SHIROU_MEAL_FOOD.fish] }, () => { throw new Error("UNEXPECTED_DECISION"); }, () => 0, ctx.definitions);
  assert.equal(ctx.state.players.s.mana, 5);
  assert.equal(ctx.state.players.s.flags.roundPowerBonus, 6);
});

test("Ascension Food payment is atomic, its Food aura boosts matching basics, and round end discards the deck top", () => {
  const ctx = passiveContext("shirou-meal-ascension");
  emitPassive(ctx, "game.started", { round: ctx.state.round });
  const ascension = ctx.built.skills.get(SHIROU_MEAL_ASCENSION_ID);
  assert.deepEqual(ascension.playPrerequisite, { customResource: { amount: 1, resourceIds: [SHIROU_MEAL_FOOD.meat, SHIROU_MEAL_FOOD.vegetable, SHIROU_MEAL_FOOD.fish] } });

  createOwnedCardInstance(ctx.state, "s", { instanceId: "ascension", definitionId: SHIROU_MEAL_ASCENSION_ID, zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(ctx.state, "s", { instanceId: "strength", definitionId: "card.cardb1", zone: "attack", face: "up", active: true });
  const strengthBeforeFood = calculateCombatCardPower(ctx.state, ctx.state.players.s, "strength", ctx.definitions);
  gainCustomResource(ctx.state.players.s, SHIROU_MEAL_FOOD.meat, 2);
  assert.equal(calculateCombatCardPower(ctx.state, ctx.state.players.s, "strength", ctx.definitions), strengthBeforeFood + 2);

  createOwnedCardInstance(ctx.state, "s", { instanceId: "top", definitionId: "card.carda1", zone: "deck", face: "down", active: false });
  emitPassive(ctx, "round.ending", { round: ctx.state.round });
  assert.equal(ctx.state.cards.top.zone, "discard");

  const play = setup("shirou-meal-payment");
  play.state.players.s.mana = 10;
  play.state.step = "play-batch-draft";
  createOwnedCardInstance(play.state, "s", { instanceId: "skill-play", definitionId: SHIROU_MEAL_ASCENSION_ID, zone: "master-skills", face: "down", active: false });
  createOwnedCardInstance(play.state, "s", { instanceId: "basic-play", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  gainCustomResource(play.state.players.s, SHIROU_MEAL_FOOD.fish, 1);
  commitStandardAttack(play.state, "s", ["skill-play", "basic-play"], [], play.definitions, {
    cardDataByInstanceId: { "skill-play": { playPrerequisiteResourceIds: [SHIROU_MEAL_FOOD.fish] } },
  });
  assert.equal(getCustomResource(play.state.players.s, SHIROU_MEAL_FOOD.fish), 0);
  assert.equal(play.state.cards["skill-play"].zone, "attack");
});
