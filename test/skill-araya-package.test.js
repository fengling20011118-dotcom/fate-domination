import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { deployPlayer, movePlayerByEffect } from "../src/rules-core/board.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { getPersistentLocationAdvantage, incrementPersistentLocationAdvantage, isPlayerAtEffectiveLocation } from "../src/rules-core/location-rules.ts";

const TRIPLE = "master.araya.skill.s1";
const PARADOX = "master.araya.skill.ascension";

function setup(id = "araya") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "a", name: "Araya" }, { id: "o", name: "Opponent" }, { id: "x", name: "Other" }],
    seed: 9701,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = ["a", "o", "x"];
  state.players.a.masterId = "master.araya";
  state.players.a.mana = 20;
  state.players.o.mana = 20;
  state.players.x.mana = 20;
  return { built, definitions, state, passives, effects };
}

function emitPassive(ctx, type, payload = {}) {
  enqueuePassiveEffects(ctx.state, ctx.passives, {
    eventId: `${ctx.state.gameInstanceId}:${type}:${ctx.state.revision}:${ctx.state.effectQueue.length}:${Math.random()}`,
    sourceCommandId: "test",
    revision: ctx.state.revision,
    type,
    payload,
  });
  ctx.effects.drain(ctx.state, 1000, ctx.definitions);
}

function unlockParadox(ctx) {
  if (!ctx.state.cards.paradox) {
    createOwnedCardInstance(ctx.state, "a", {
      instanceId: "paradox",
      definitionId: PARADOX,
      zone: "master-skills",
      face: "up",
      active: false,
    });
  }
  emitPassive(ctx, "skill.unlocked", { playerId: "a", skillId: PARADOX, definitionId: PARADOX, instanceId: "paradox" });
}

function setSameMountain(ctx) {
  for (const occupants of Object.values(ctx.state.board.locations)) occupants.splice(0, occupants.length);
  ctx.state.players.a.locationId = "mountain";
  ctx.state.players.o.locationId = "mountain";
  ctx.state.players.x.locationId = "city";
  ctx.state.board.locations.mountain.push("a", "o");
  ctx.state.board.locations.city.push("x");
}

test("Araya package: all three skills are FULL", () => {
  const { built } = setup("araya-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.araya");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(TRIPLE).handlerId, "core.araya-triple-boundary");
  assert.equal(built.skills.get(PARADOX).handlerId, "core.araya-paradox-spiral");
});

test("Triple Boundary replaces printed terrain with permanent per-location +1 layers, caps at five, and follows Araya back to that location", () => {
  const ctx = setup("araya-triple");
  ctx.state.board.outpostRecords.mountain = [null, null];
  deployPlayer(ctx.state, "a", "mountain", ctx.definitions);
  assert.equal(ctx.state.players.a.flags.deploymentBonus, 3, "printed +3 exists before the passive resolves");
  emitPassive(ctx, "player.deployed", { playerId: "a", locationId: "mountain" });
  assert.equal(getPersistentLocationAdvantage(ctx.state, "a", "mountain", TRIPLE), 1);
  assert.equal(ctx.state.players.a.flags.deploymentBonus, 1);
  assert.equal(ctx.state.players.a.flags.deploymentBonusActive, true);

  movePlayerByEffect(ctx.state, "a", "city", ctx.definitions);
  assert.equal(ctx.state.players.a.flags.deploymentBonusActive, false);
  movePlayerByEffect(ctx.state, "a", "mountain", ctx.definitions);
  assert.equal(ctx.state.players.a.flags.deploymentBonusActive, true);
  assert.equal(ctx.state.players.a.flags.deploymentBonus, 1);

  // Each later qualifying deployment adds one, independent of the printed +3/+1 slot value.
  ctx.state.board.outpostRecords.mountain = ["a", null];
  for (let index = 0; index < 6; index += 1) emitPassive(ctx, "player.deployed", { playerId: "a", locationId: "mountain" });
  assert.equal(getPersistentLocationAdvantage(ctx.state, "a", "mountain", TRIPLE), 5);
  assert.equal(ctx.state.players.a.flags.deploymentBonus, 5);
});

test("Triple Boundary does not gain a layer when Araya deploys to a battlefield after both terrain slots are occupied", () => {
  const ctx = setup("araya-no-slot");
  ctx.state.players.a.locationId = "mountain";
  ctx.state.board.locations.mountain = ["a"];
  ctx.state.board.outpostRecords.mountain = ["o", "x"];
  emitPassive(ctx, "player.deployed", { playerId: "a", locationId: "mountain" });
  assert.equal(getPersistentLocationAdvantage(ctx.state, "a", "mountain", TRIPLE), 0);
});

test("Paradox Spiral treats only Araya as being at Workshop at five Triple Boundary terrain and source-binds the restriction", () => {
  const ctx = setup("araya-paradox");
  setSameMountain(ctx);
  unlockParadox(ctx);
  incrementPersistentLocationAdvantage(ctx.state, { sourceId: TRIPLE, playerId: "a", locationId: "mountain", amount: 4, max: 5, mode: "replace" });
  assert.equal(isPlayerAtEffectiveLocation(ctx.state, "a", "workshop"), false);
  assert.equal(isPlayerAtEffectiveLocation(ctx.state, "o", "workshop"), false);

  movePlayerByEffect(ctx.state, "o", "city", ctx.definitions);
  assert.equal(ctx.state.players.o.locationId, "city", "four layers do not activate Paradox Spiral");
  ctx.state.board.locations.city = ctx.state.board.locations.city.filter((id) => id !== "o");
  ctx.state.board.locations.mountain.push("o");
  ctx.state.players.o.locationId = "mountain";

  incrementPersistentLocationAdvantage(ctx.state, { sourceId: TRIPLE, playerId: "a", locationId: "mountain", amount: 1, max: 5, mode: "replace" });
  assert.equal(isPlayerAtEffectiveLocation(ctx.state, "a", "workshop"), true);
  assert.equal(isPlayerAtEffectiveLocation(ctx.state, "o", "workshop"), false, "the opponent does not inherit Araya's virtual Workshop identity");
  assert.throws(() => movePlayerByEffect(ctx.state, "o", "city", ctx.definitions), /MOVEMENT_BLOCKED_BY_LOCATION_RULE/);

  ctx.state.cards.paradox.zone = "removed";
  assert.equal(isPlayerAtEffectiveLocation(ctx.state, "a", "workshop"), false, "removing the source disables the source-bound rule");
  movePlayerByEffect(ctx.state, "o", "city", ctx.definitions);
  assert.equal(ctx.state.players.o.locationId, "city");
});

test("Paradox Spiral requires an affected opponent's normal attack to contain a face-down card", () => {
  const ctx = setup("araya-facedown");
  setSameMountain(ctx);
  unlockParadox(ctx);
  incrementPersistentLocationAdvantage(ctx.state, { sourceId: TRIPLE, playerId: "a", locationId: "mountain", amount: 5, max: 5, mode: "replace" });

  const basicIds = Object.values(ctx.definitions)
    .filter((definition) => definition.basic === true && definition.isSkill !== true && definition.cardType === "attack")
    .map((definition) => definition.id);
  assert.ok(basicIds.length >= 2);
  createOwnedCardInstance(ctx.state, "o", { instanceId: "basic-1", definitionId: basicIds[0], zone: "hand", face: "down", active: false });
  createOwnedCardInstance(ctx.state, "o", { instanceId: "basic-2", definitionId: basicIds[1], zone: "hand", face: "down", active: false });
  ctx.state.phase = "action";
  ctx.state.activePlayerId = "o";
  ctx.state.step = "play-batch-draft";

  assert.throws(
    () => commitStandardAttack(ctx.state, "o", ["basic-1", "basic-2"], [], ctx.definitions),
    /STANDARD_ATTACK_REQUIRES_FACE_DOWN_CARD/,
  );
  const result = commitStandardAttack(ctx.state, "o", ["basic-1"], ["basic-2"], ctx.definitions);
  assert.deepEqual(result.committed.sort(), ["basic-1", "basic-2"]);
  assert.equal(ctx.state.cards["basic-2"].face, "down");
});
