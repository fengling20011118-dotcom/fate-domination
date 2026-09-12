import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { enqueueScheduledEffects } from "../src/rules-core/scheduled-effects.ts";
import { gainMana, gainVictoryPoints } from "../src/rules-core/resources.ts";

const POISON = "servant.hassanser.skill.sc-hassanser-2";
const DANCE = "servant.hassanser.skill.sc-hassanser-3";

function setup(id = "serenity") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "s", name: "Serenity" }, { id: "o", name: "Opponent" }], seed: 8801 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "o"];
  state.players.s.servantId = "servant.hassanser";
  state.players.s.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.s.victoryPoints = 5;
  state.players.o.victoryPoints = 5;
  state.board.locations.mountain = ["s", "o"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  createOwnedCardInstance(state, "s", { instanceId: "poison", definitionId: POISON, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "s", { instanceId: "dance", definitionId: DANCE, zone: "attack", face: "up", active: true });
  return { built, definitions, state, passives, effects };
}

function emitPassive(ctx, type, payload = {}) {
  enqueuePassiveEffects(ctx.state, ctx.passives, {
    eventId: `${ctx.state.gameInstanceId}:${type}:${ctx.state.revision}:${ctx.state.effectQueue.length}`,
    sourceCommandId: "test",
    revision: ctx.state.revision,
    type,
    payload,
  });
  ctx.effects.drain(ctx.state, 1000, ctx.definitions);
}

test("Serenity package: all three skills are FULL", () => {
  const { built } = setup("serenity-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.hassanser");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(DANCE).handlerId, "core.serenity-dance");
});

test("playing Serenity Dance raises each Delusional Poison Body ability to twice this round", () => {
  const ctx = setup("serenity-double");
  emitPassive(ctx, "card.played", { playerId: "s", instanceId: "dance", definitionId: DANCE, face: "up" });
  assert.equal(ctx.state.players.s.skillUsageLimitOverrides?.[0]?.targetSkillId, POISON);
  assert.equal(ctx.state.players.s.skillUsageLimitOverrides?.[0]?.limit, "twice-per-round");

  ctx.built.skills.execute(ctx.state, "s", POISON, { abilityId: "poison-gas" }, () => { throw new Error("UNEXPECTED_DECISION"); }, () => 0, ctx.definitions);
  ctx.built.skills.execute(ctx.state, "s", POISON, { abilityId: "poison-gas" }, () => { throw new Error("UNEXPECTED_DECISION"); }, () => 0, ctx.definitions);
  assert.equal(ctx.state.players.o.victoryPoints, 3);
  assert.throws(() => ctx.built.skills.execute(ctx.state, "s", POISON, { abilityId: "poison-gas" }, () => {}, () => 0, ctx.definitions), /SKILL_USE_FORBIDDEN/);
});

test("Serenity Dance moves directly from one battlefield to the other", () => {
  const ctx = setup("serenity-move");
  ctx.built.skills.execute(ctx.state, "s", DANCE, { abilityId: "serenity-dance-move" }, () => {}, () => 0, ctx.definitions);
  assert.equal(ctx.state.players.s.locationId, "city");
  assert.ok(ctx.state.board.locations.city.includes("s"));
  assert.ok(!ctx.state.board.locations.mountain.includes("s"));
});

test("Serenity Dance schedules next-round Workshop mana and victory-point gain blocking for all players", () => {
  const ctx = setup("serenity-block");
  ctx.state.phase = "combat";
  ctx.built.skills.execute(ctx.state, "s", DANCE, { abilityId: "serenity-dance-workshop-block" }, () => {}, () => 0, ctx.definitions);
  assert.equal(ctx.state.scheduledEffects.length, 1);
  assert.equal(ctx.state.scheduledEffects[0].triggerRound, 4);

  ctx.state.round = 4;
  enqueueScheduledEffects(ctx.state, {
    eventId: "round-4-start",
    sourceCommandId: "test",
    revision: 0,
    type: "round.started",
    payload: { round: 4 },
  });
  ctx.effects.drain(ctx.state, 1000, ctx.definitions);
  assert.equal(ctx.state.players.s.flags.workshopResourceGainBlocked, true);
  assert.equal(ctx.state.players.o.flags.workshopResourceGainBlocked, true);

  ctx.state.players.s.locationId = "workshop";
  ctx.state.players.s.mana = 1;
  ctx.state.players.s.victoryPoints = 5;
  assert.equal(gainMana(ctx.state.players.s, 3), 0);
  assert.equal(gainVictoryPoints(ctx.state.players.s, 2), 0);
  assert.equal(ctx.state.players.s.mana, 1);
  assert.equal(ctx.state.players.s.victoryPoints, 5);

  ctx.state.players.s.locationId = "city";
  assert.equal(gainMana(ctx.state.players.s, 3), 3);
  assert.equal(gainVictoryPoints(ctx.state.players.s, 2), 2);
  assert.equal(ctx.state.players.s.mana, 4);
  assert.equal(ctx.state.players.s.victoryPoints, 7);
});
