import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const OATH = "servant.mandricardo.skill.sc-mandricardo-1";
const WOOD = "servant.mandricardo.skill.sc-mandricardo-2";

function setup(id = "mandricardo") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "m", name: "Mandricardo" }, { id: "a", name: "A" }, { id: "b", name: "B" }], seed: 9801 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "m";
  state.turnOrder = ["m", "a", "b"];
  state.players.m.servantId = "servant.mandricardo";
  state.players.m.locationId = "mountain";
  state.players.a.locationId = "mountain";
  state.players.b.locationId = "city";
  state.board.locations.mountain = ["m", "a"];
  state.board.locations.city = ["b"];
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  return { built, definitions, state, passives, effects };
}

function emitPassive(ctx, type, payload = {}) {
  enqueuePassiveEffects(ctx.state, ctx.passives, { eventId: `${ctx.state.gameInstanceId}:${type}:${Math.random()}`, sourceCommandId: "test", revision: ctx.state.revision, type, payload });
  ctx.effects.drain(ctx.state, 1000, ctx.definitions);
}

function useSkill(ctx, skillId, abilityId) {
  return ctx.built.skills.execute(ctx.state, "m", skillId, { abilityId }, () => { throw new Error("UNEXPECTED_DECISION"); }, () => 0, ctx.definitions);
}

test("Mandricardo package: all three skills are FULL", () => {
  const { built } = setup("mandricardo-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.mandricardo");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(OATH).handlerId, "core.mandricardo-instant-strike");
  assert.equal(built.skills.get(WOOD).handlerId, "core.mandricardo-instant-strike");
  assert.deepEqual(built.skills.get(OATH).rules?.ambiguities ?? [], []);
});

test("Serment de Durandal counts unique opponents crossed from below to above, then removes itself and grants Wooden Sword", () => {
  const ctx = setup("mandricardo-overtake");
  ctx.state.players.m.victoryPoints = 2;
  ctx.state.players.a.victoryPoints = 3;
  ctx.state.players.b.victoryPoints = 5;
  createOwnedCardInstance(ctx.state, "m", { instanceId: "oath", definitionId: OATH, zone: "attack", face: "up", active: true });

  emitPassive(ctx, "round.started", { round: 4 });
  ctx.state.players.m.victoryPoints = 4;
  emitPassive(ctx, "player.victory-points.changed", { playerId: "m", before: 2, after: 4, delta: 2, round: 4 });
  // B falling below Mandricardo also completes a below->above crossing.
  ctx.state.players.b.victoryPoints = 3;
  emitPassive(ctx, "player.victory-points.changed", { playerId: "b", before: 5, after: 3, delta: -2, round: 4 });
  // Falling below and crossing A again does not count A twice in this round.
  ctx.state.players.m.victoryPoints = 2;
  emitPassive(ctx, "player.victory-points.changed", { playerId: "m", before: 4, after: 2, delta: -2, round: 4 });
  ctx.state.players.m.victoryPoints = 4;
  emitPassive(ctx, "player.victory-points.changed", { playerId: "m", before: 2, after: 4, delta: 2, round: 4 });

  useSkill(ctx, OATH, "oath-instant-strike");
  assert.equal(ctx.state.players.m.flags.roundPowerBonus, 5);
  const beforeReward = ctx.state.players.m.victoryPoints;
  emitPassive(ctx, "combat.ending", { round: 4 });
  assert.equal(ctx.state.players.m.victoryPoints, beforeReward + 2);
  assert.equal(ctx.state.cards.oath.zone, "removed");
  assert.equal(ctx.state.players.m.flags.mandricardoWoodenSwordInstantStrikeGranted, true);
});

test("Wooden Sword receives the complete Instant Strike in combat and is also removed after resolving it", () => {
  const ctx = setup("mandricardo-wood");
  createOwnedCardInstance(ctx.state, "m", { instanceId: "wood", definitionId: WOOD, zone: "attack", face: "up", active: true });
  ctx.state.players.m.flags.mandricardoWoodenSwordInstantStrikeGranted = true;
  ctx.state.phase = "combat";
  ctx.state.step = "player-window";
  ctx.state.activePlayerId = "m";

  useSkill(ctx, WOOD, "wooden-sword-instant-strike");
  assert.equal(ctx.state.players.m.flags.roundPowerBonus, 5);
  emitPassive(ctx, "combat.ending", { round: 4 });
  assert.equal(ctx.state.cards.wood.zone, "removed");
  assert.equal(ctx.state.cards.wood.active, false);
});
