import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";

const CURSE = "master.celenike.skill.s1";
const STAKE = "master.celenike.skill.ascension";

function command(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "celenike") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "c", name: "Celenike" }, { id: "a", name: "A" }, { id: "b", name: "B" }], seed: 9501 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "c";
  state.turnOrder = ["c", "a", "b"];
  state.players.c.masterId = "master.celenike";
  state.players.c.locationId = "mountain";
  state.players.a.locationId = "mountain";
  state.players.b.locationId = "mountain";
  state.board.locations.mountain = ["c", "a", "b"];
  createOwnedCardInstance(state, "c", { instanceId: "curse", definitionId: CURSE, zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(state, "c", { instanceId: "stake", definitionId: STAKE, zone: "master-skills", face: "up", active: false });
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

test("Celenike package: all three skills are FULL", () => {
  const { built } = setup("celenike-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.celenike");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(CURSE).handlerId, "core.celenike-curse");
  assert.equal(built.skills.get(STAKE).handlerId, "core.celenike-iron-stake");
  assert.deepEqual(built.skills.get(CURSE).rules?.ambiguities ?? [], []);
  assert.deepEqual(built.skills.get(STAKE).rules?.unmodeledClauses ?? [], []);
});

test("Curse Master withers combat winners on defeat, then steals 2 from withered combatants when winning", () => {
  const ctx = setup("celenike-curse-flow");
  ctx.state.players.a.victoryPoints = 5;
  ctx.state.players.b.victoryPoints = 5;
  emitPassive(ctx, "combat.resolved", {
    locationId: "mountain", powers: { c: 2, a: 7, b: 4 }, winnerIds: ["a"], defeatedPlayerIds: ["c"], victoryPoints: {}, eventIds: [], printedEventVictoryPoints: 0, scoutingPlayerId: null, attributes: {},
  });
  assert.equal(ctx.state.players.a.flags["celenikeWitheredBy:c"], true);
  assert.equal(ctx.state.players.b.flags["celenikeWitheredBy:c"], undefined);

  const cBefore = ctx.state.players.c.victoryPoints;
  emitPassive(ctx, "combat.resolved", {
    locationId: "mountain", powers: { c: 9, a: 7, b: 4 }, winnerIds: ["c"], defeatedPlayerIds: ["a", "b"], victoryPoints: {}, eventIds: [], printedEventVictoryPoints: 0, scoutingPlayerId: null, attributes: {},
  });
  assert.equal(ctx.state.players.a.victoryPoints, 3);
  assert.equal(ctx.state.players.c.victoryPoints, cBefore + 2);
});

test("Celenike gaining at least 4 victory points in one round clears only her wither marks", () => {
  const ctx = setup("celenike-clear");
  ctx.state.players.a.flags["celenikeWitheredBy:c"] = true;
  ctx.state.players.a.flags["celenikeWitheredBy:other"] = true;
  ctx.state.players.b.flags["celenikeWitheredBy:c"] = true;
  ctx.state.players.c.flags.roundVictoryPointsGained = 4;
  emitPassive(ctx, "player.victory-points.changed", { playerId: "c", round: 4, before: 0, after: 4, delta: 4 });
  assert.equal(ctx.state.players.a.flags["celenikeWitheredBy:c"], undefined);
  assert.equal(ctx.state.players.b.flags["celenikeWitheredBy:c"], undefined);
  assert.equal(ctx.state.players.a.flags["celenikeWitheredBy:other"], true);
});

test("Pain Stake makes each withered player choose pay 2 mana or discard all hand", () => {
  const { built, state } = setup("celenike-stake");
  const engine = new StandardMatchEngine(built);
  state.players.a.flags["celenikeWitheredBy:c"] = true;
  state.players.b.flags["celenikeWitheredBy:c"] = true;
  state.players.a.mana = 3;
  state.players.b.mana = 0;
  createOwnedCardInstance(state, "b", { instanceId: "b-hand-1", definitionId: "card.cardb2", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "b", { instanceId: "b-hand-2", definitionId: "card.cardq2", zone: "hand", face: "down", active: false });

  let result = engine.execute(state, command(state, "stake-use", CommandType.UseSkill, "c", { skillId: STAKE, data: { abilityId: "pain-stake" } }));
  assert.equal(result.state.pendingDecision?.kind, "celenike-pain-stake");
  assert.deepEqual(result.state.pendingDecision?.chooserPlayerIds, ["a"]);
  assert.ok(result.state.pendingDecision?.options.some((option) => option.id === "pay-mana"));

  result = engine.execute(result.state, command(result.state, "a-pay", CommandType.ResolveDecision, "a", { decisionId: result.state.pendingDecision.decisionId, selections: ["pay-mana"] }));
  assert.equal(result.state.players.a.mana, 1);
  assert.deepEqual(result.state.pendingDecision?.chooserPlayerIds, ["b"]);
  assert.deepEqual(result.state.pendingDecision?.options.map((option) => option.id), ["discard-all"]);

  result = engine.execute(result.state, command(result.state, "b-discard", CommandType.ResolveDecision, "b", { decisionId: result.state.pendingDecision.decisionId, selections: ["discard-all"] }));
  assert.equal(result.state.pendingDecision, null);
  assert.deepEqual(result.state.players.b.hand, []);
  assert.ok(result.state.players.b.discard.includes("b-hand-1"));
  assert.ok(result.state.players.b.discard.includes("b-hand-2"));
});
