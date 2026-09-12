import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getAttachedCards } from "../src/rules-core/card-attachments.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import {
  ILLYA_HOLSTER_ID,
  ILLYA_QUINTETT_ID,
  ILLYA_CASTER_SKILL_ID,
  ILLYA_CASTER_CARD_ID,
} from "../src/rules-core/illya-servant.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "illya-servant-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "i", name: "Prisma Illya" }, { id: "o", name: "Opponent" }],
    seed: 8103,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "i";
  state.turnOrder = ["i", "o"];
  state.players.i.servantId = "servant.illya";
  state.players.i.mana = 20;
  state.players.o.mana = 20;
  state.players.i.locationId = "mountain";
  state.players.o.locationId = "city";
  state.board.locations.mountain = ["i"];
  state.board.locations.city = ["o"];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function add(state, instanceId, definitionId, zone = "hand", face = "down", active = false) {
  createOwnedCardInstance(state, "i", { instanceId, definitionId, zone, face, active });
}

function useSkill(engine, state, commandId, skillId, abilityId) {
  return engine.execute(state, command(state, commandId, CommandType.UseSkill, "i", { skillId, data: { abilityId } }));
}

function resolve(engine, state, commandId, selections) {
  assert.ok(state.pendingDecision);
  return engine.execute(state, command(state, commandId, CommandType.ResolveDecision, "i", {
    decisionId: state.pendingDecision.decisionId,
    selections,
  }));
}

function emitPassive(engine, state, type, payload, definitions) {
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${state.revision}:${Math.random()}`,
    sourceCommandId: "illya-test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Prisma Illya package is 10/10 FULL and the three migrated skills are executable", () => {
  const { built } = setup("illya-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.illya");
  assert.equal(skills.length, 10);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  for (const id of [ILLYA_HOLSTER_ID, ILLYA_QUINTETT_ID, ILLYA_CASTER_SKILL_ID]) {
    const skill = built.skills.get(id);
    assert.equal(built.skills.hasHandler(id), true);
    assert.deepEqual(skill.rules?.ambiguities ?? [], []);
    assert.deepEqual(skill.rules?.unmodeledClauses ?? [], []);
  }
});

test("Card Holster stores a face-up hand card and that physical attachment can be used by a normal CommitAttack", () => {
  const { engine, state } = setup("illya-holster-play");
  state.phase = "outpost";
  state.step = "player-window";
  add(state, "holster", ILLYA_HOLSTER_ID, "servant-skills", "up", false);
  add(state, "stored", "card.carda1");
  add(state, "partner", "card.carda2");

  let result = useSkill(engine, state, "holster-open", ILLYA_HOLSTER_ID, "card-holster");
  assert.equal(result.state.pendingDecision?.kind, "illya-card-holster-store");
  result = resolve(engine, result.state, "holster-store", ["stored"]);
  assert.equal(result.state.cards.stored.zone, "attached");
  assert.equal(result.state.cards.stored.face, "up");
  assert.equal(result.state.cards.stored.attachedToInstanceId, "holster");
  assert.equal(result.state.cards.stored.playAsHandWhileAttached?.sourceInstanceId, "holster");
  assert.deepEqual(getAttachedCards(result.state, "holster").map((card) => card.instanceId), ["stored"]);

  result.state.phase = "action";
  result.state.step = "play-batch-draft";
  result.state.activePlayerId = "i";
  result = engine.execute(result.state, command(result.state, "play-stored", CommandType.CommitAttack, "i", {
    faceUpInstanceIds: ["stored", "partner"],
    faceDownInstanceIds: [],
  }));
  assert.equal(result.state.cards.stored.zone, "attack");
  assert.equal(result.state.cards.stored.active, true);
  assert.equal(result.state.cards.stored.attachedToInstanceId, undefined);
});

test("Card Holster cashes out the stored card for its current play cost", () => {
  const { engine, state, definitions } = setup("illya-holster-mana");
  state.phase = "outpost";
  add(state, "holster", ILLYA_HOLSTER_ID, "servant-skills", "up", false);
  add(state, "stored", "card.carda2");
  state.players.i.mana = 3;

  let result = useSkill(engine, state, "holster-open-2", ILLYA_HOLSTER_ID, "card-holster");
  result = resolve(engine, result.state, "holster-store-2", ["stored"]);
  result.state.round += 1;
  result.state.phase = "outpost";
  result.state.step = "player-window";
  result.state.activePlayerId = "i";
  const expected = definitions["card.carda2"].cost;
  const before = result.state.players.i.mana;
  result = useSkill(engine, result.state, "holster-cash", ILLYA_HOLSTER_ID, "card-holster");
  assert.equal(result.state.cards.stored.zone, "discard");
  assert.equal(result.state.players.i.mana, before + expected);
});

test("Quintett Feuer freely plays multiple Installs in one action and Caster Install boosts then closes", () => {
  const { engine, state, definitions } = setup("illya-quintett");
  add(state, "quintett", ILLYA_QUINTETT_ID, "attack", "up", true);
  add(state, "caster", ILLYA_CASTER_CARD_ID);
  add(state, "saber", "card.x-installsaber");
  add(state, "lancer", "card.x-installlancer");
  const manaBefore = state.players.i.mana;

  let result = useSkill(engine, state, "quintett-open", ILLYA_QUINTETT_ID, "quintett-barrage");
  assert.equal(result.state.pendingDecision?.kind, "illya-quintett-installs");
  result = resolve(engine, result.state, "quintett-pick", ["caster", "saber", "lancer"]);
  assert.equal(result.state.pendingDecision?.kind, "illya-caster-install-choice");
  result = resolve(engine, result.state, "quintett-caster-power", ["power"]);

  assert.equal(result.state.players.i.mana, manaBefore);
  assert.equal(result.state.cards.saber.zone, "attack");
  assert.equal(result.state.cards.saber.active, true);
  assert.equal(result.state.cards.saber.paidCost, 0);
  assert.equal(result.state.cards.lancer.zone, "attack");
  assert.equal(result.state.cards.lancer.active, true);
  assert.equal(result.state.cards.lancer.paidCost, 0);
  assert.equal(result.state.cards.caster.active, false);
  assert.notEqual(result.state.cards.caster.zone, "attack");
  assert.ok(result.state.cards.saber.powerModifiers?.some((modifier) => modifier.sourceId === ILLYA_CASTER_SKILL_ID && modifier.value === 4));
  assert.equal(result.state.cards.saber.usageLimitOverride, "once-per-game");
  assert.equal(result.state.cards.lancer.usageLimitOverride, "once-per-game");
});

test("Quintett Feuer applies next-round mana lock only while the skill remains available", () => {
  const { engine, state, definitions } = setup("illya-quintett-mana-lock");
  add(state, "quintett", ILLYA_QUINTETT_ID, "attack", "up", true);
  emitPassive(engine, state, "card.played", { playerId: "i", instanceId: "quintett", definitionId: ILLYA_QUINTETT_ID, face: "up" }, definitions);
  assert.equal(state.players.i.flags.illyaQuintettPendingManaBlockRound, state.round + 1);

  state.round += 1;
  state.phase = "preparation";
  emitPassive(engine, state, "round.started", { round: state.round, phase: "preparation", activePlayerId: "i" }, definitions);
  assert.equal(state.players.i.flags.manaGainBlockedThroughRound, state.round);

  const second = setup("illya-quintett-no-lock");
  add(second.state, "quintett", ILLYA_QUINTETT_ID, "attack", "up", true);
  emitPassive(second.engine, second.state, "card.played", { playerId: "i", instanceId: "quintett", definitionId: ILLYA_QUINTETT_ID, face: "up" }, second.definitions);
  second.state.cards.quintett.zone = "removed";
  second.state.players.i.attack = second.state.players.i.attack.filter((id) => id !== "quintett");
  second.state.round += 1;
  second.state.phase = "preparation";
  emitPassive(second.engine, second.state, "round.started", { round: second.state.round, phase: "preparation", activePlayerId: "i" }, second.definitions);
  assert.equal(second.state.players.i.flags.manaGainBlockedThroughRound, undefined);
});
