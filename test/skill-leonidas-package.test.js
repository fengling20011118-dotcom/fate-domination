import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";

const PRIDE = "servant.leonidas.skill.sc-leonidas-3";
const ROAR = "servant.leonidas.skill.sc-leonidas-2";

function setup(id = "leonidas") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "l", name: "Leonidas" }, { id: "o", name: "Opponent" }, { id: "x", name: "Third" }], seed: 9401 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "l";
  state.turnOrder = ["l", "o", "x"];
  state.players.l.servantId = "servant.leonidas";
  state.players.l.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.x.locationId = "city";
  state.board.locations.mountain = ["l", "o"];
  state.board.locations.city = ["x"];
  createOwnedCardInstance(state, "l", { instanceId: "pride", definitionId: PRIDE, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "l", { instanceId: "roar", definitionId: ROAR, zone: "servant-skills", face: "down", active: false });
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  return { built, definitions, state, passives, effects };
}

function emitPassive(ctx, type, payload) {
  enqueuePassiveEffects(ctx.state, ctx.passives, { eventId: `${ctx.state.gameInstanceId}:${type}:${ctx.state.revision}`, sourceCommandId: "test", revision: ctx.state.revision, type, payload });
  ctx.effects.drain(ctx.state, 1000, ctx.definitions);
}

test("Leonidas package: all three skills are FULL", () => {
  const { built } = setup("leonidas-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.leonidas");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(PRIDE).handlerId, "core.leonidas-pride");
  assert.deepEqual(built.skills.get(PRIDE).rules?.ambiguities ?? [], []);
  assert.deepEqual(built.skills.get(PRIDE).rules?.unmodeledClauses ?? [], []);
});

test("Rear Guard Pride grants Warrior's Roar permission to be played face-down", () => {
  const ctx = setup("leonidas-facedown");
  ctx.state.players.l.mana = 8;
  emitPassive(ctx, "game.started", { round: ctx.state.round });
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state: ctx.state, playerId: "l", instanceId: "roar", definitions: ctx.definitions, faceDown: true }));
  assert.ok(ctx.state.players.l.cardRuleModifiers?.some((modifier) => modifier.allowFaceDownPlay === true && modifier.targetDefinitionIds.includes(ROAR)));
});

test("Phalanx records an opponent moving into Leonidas' battlefield and grants base terrain 3", () => {
  const ctx = setup("leonidas-phalanx");
  emitPassive(ctx, "player.entered-location", { playerId: "o", previousLocationId: "city", locationId: "mountain", method: "effect", distance: 1 });
  ctx.built.skills.execute(ctx.state, "l", PRIDE, { abilityId: "phalanx" }, () => { throw new Error("unexpected decision"); }, () => 0, ctx.definitions);
  assert.equal(ctx.state.players.l.flags.deploymentBonus, 3);
  assert.equal(ctx.state.players.l.flags.deploymentBonusActive, true);
  assert.equal(ctx.state.players.l.flags.deploymentLocationId, "mountain");
});
