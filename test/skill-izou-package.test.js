import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, closePlayerCard } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { applyDefeatEffect } from "../src/rules-core/defeat.ts";
import { IZOU_MAN_SLAYER_ID, IZOU_SHIMATSUKEN_ID } from "../src/rules-core/izou.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "izou-package", playerCount = 2) {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const players = [{ id: "i", name: "Izou" }, { id: "o", name: "Opponent" }];
  if (playerCount >= 3) players.push({ id: "x", name: "Other" });
  const state = createGameState({ gameInstanceId: id, players, seed: 8102 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "i";
  state.turnOrder = players.map((player) => player.id);
  state.players.i.servantId = "servant.izou";
  for (const player of Object.values(state.players)) player.mana = 20;
  state.players.i.locationId = "mountain";
  state.players.o.locationId = "mountain";
  if (state.players.x) state.players.x.locationId = "mountain";
  state.board.locations = { workshop: [], mountain: players.map((player) => player.id), city: [], scouting: [] };
  state.board.outpostRecords = { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] };
  createOwnedCardInstance(state, "i", { instanceId: "shim", definitionId: IZOU_SHIMATSUKEN_ID, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "i", { instanceId: "man", definitionId: IZOU_MAN_SLAYER_ID, zone: "servant-skills", face: "up", active: false });
  return { built, engine, definitions, state };
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload) {
  passiveCounter += 1;
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${passiveCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Okada Izou package is 3/3 FULL", () => {
  const { built } = setup("izou-full");
  const ids = [IZOU_SHIMATSUKEN_ID, IZOU_MAN_SLAYER_ID, "servant.izou.skill.sc-izou-3"];
  assert.ok(ids.every((id) => built.skills.get(id).supportLevel === "FULL"));
  assert.equal(built.skills.get(IZOU_SHIMATSUKEN_ID).handlerId, "core.izou-shimatsuken");
  assert.equal(built.skills.get(IZOU_MAN_SLAYER_ID).handlerId, "core.izou-man-slayer");
  assert.equal(built.skills.get("servant.izou.skill.sc-izou-3").handlerId, "core.presence-concealment");
});

test("Shimatsuken may target itself, stores exact combat-resolution power and grants it on the next play", () => {
  const { engine, definitions, state } = setup("izou-shimatsuken");
  state.cards.shim.powerModifiers = [{ id: "test:+5", sourceId: "test", kind: "add", value: 5, duration: "round" }];
  let result = engine.execute(state, command(state, "shim-open", CommandType.UseSkill, "i", {
    skillId: IZOU_SHIMATSUKEN_ID,
    data: { abilityId: "shimatsuken-record" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "izou-shimatsuken-target");
  assert.ok(result.state.pendingDecision.options.some((option) => option.id === "shim"), "English Wiki ruling: Shimatsuken can target itself");
  result = engine.execute(result.state, command(result.state, "shim-self", CommandType.ResolveDecision, "i", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["shim"],
  }));

  emitPassive(engine, result.state, definitions, "combat.resolved", {
    locationId: "mountain",
    winnerIds: ["i"],
    powers: { i: 7, o: 0 },
    cardPowers: { i: { shim: 7 }, o: {} },
    cardAttributes: { i: { shim: ["迅捷", "宝具"] }, o: {} },
  });
  assert.equal(result.state.players.i.flags.izouShimatsukenStoredPower, 7);

  closePlayerCard(result.state, "i", "shim", definitions);
  // A real round transition clears round-duration modifiers before the next play.
  result.state.cards.shim.powerModifiers = (result.state.cards.shim.powerModifiers ?? []).filter((modifier) => modifier.duration !== "round");
  result.state.round = 5;
  result.state.phase = "action";
  result.state.step = "play-batch-draft";
  result.state.activePlayerId = "i";
  result.state.players.i.mana = 20;
  createOwnedCardInstance(result.state, "i", { instanceId: "basic", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  const replayed = engine.execute(result.state, command(result.state, "shim-replay", CommandType.CommitAttack, "i", {
    faceUpInstanceIds: ["shim", "basic"],
    faceDownInstanceIds: [],
  }));
  assert.equal(calculateCombatCardPower(replayed.state, replayed.state.players.i, "shim", definitions, "mountain"), 9);
  assert.equal(replayed.state.players.i.flags.izouShimatsukenStoredPower, undefined);
});

test("Shimatsuken cannot choose the same attack name twice in a row and treats all Basic Attacks as one name", () => {
  const { engine, definitions, state } = setup("izou-shimatsuken-name");
  createOwnedCardInstance(state, "i", { instanceId: "q1", definitionId: "card.cardq1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "i", { instanceId: "q2", definitionId: "card.cardq2", zone: "attack", face: "up", active: true });
  let result = engine.execute(state, command(state, "shim-basic-open", CommandType.UseSkill, "i", {
    skillId: IZOU_SHIMATSUKEN_ID, data: { abilityId: "shimatsuken-record" },
  }));
  result = engine.execute(result.state, command(result.state, "shim-basic-pick", CommandType.ResolveDecision, "i", {
    decisionId: result.state.pendingDecision.decisionId, selections: ["q1"],
  }));
  result.state.players.i.usage[`${IZOU_SHIMATSUKEN_ID}:shimatsuken-record`] = undefined;
  const next = engine.execute(result.state, command(result.state, "shim-basic-open-2", CommandType.UseSkill, "i", {
    skillId: IZOU_SHIMATSUKEN_ID, data: { abilityId: "shimatsuken-record" },
  }));
  assert.ok(!next.state.pendingDecision.options.some((option) => option.id === "q1"));
  assert.ok(!next.state.pendingDecision.options.some((option) => option.id === "q2"));
  assert.ok(next.state.pendingDecision.options.some((option) => option.id === "shim"));
});

test("Man Slayer responds when an opponent leaves Izou's battlefield and can play an attack outside Izou's turn", () => {
  const { engine, state } = setup("izou-man-play");
  createOwnedCardInstance(state, "i", { instanceId: "hand-attack", definitionId: "card.cardb4", zone: "hand", face: "down", active: false });
  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "o";
  const manaBefore = state.players.i.mana;
  let result = engine.execute(state, command(state, "opponent-leaves", CommandType.MovePlayer, "o", { locationId: "city", ignoreEngagement: true }));
  assert.equal(result.state.pendingDecision?.kind, "izou-man-slayer-response");
  assert.ok(result.state.pendingDecision.options.some((option) => option.id === "hand-attack"));
  result = engine.execute(result.state, command(result.state, "izou-plays-response", CommandType.ResolveDecision, "i", {
    decisionId: result.state.pendingDecision.decisionId, selections: ["hand-attack"],
  }));
  assert.equal(result.state.cards["hand-attack"].zone, "attack");
  assert.equal(result.state.cards["hand-attack"].controllerPlayerId, "i");
  assert.equal(result.state.players.i.mana, manaBefore - result.state.cards["hand-attack"].paidCost);
});

test("Vicious Backstab loses 3 VP whenever Izou applies defeat, even if ignored and when repeated in the same round", () => {
  const { engine, state } = setup("izou-vicious-repeat");
  state.players.o.victoryPoints = 10;
  state.players.o.flags.ignoreDefeat = true;
  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "o";

  let result = engine.execute(state, command(state, "leave-one", CommandType.MovePlayer, "o", { locationId: "city", ignoreEngagement: true }));
  result = engine.execute(result.state, command(result.state, "defeat-one", CommandType.ResolveDecision, "i", {
    decisionId: result.state.pendingDecision.decisionId, selections: ["defeat"],
  }));
  assert.equal(result.state.players.o.defeated, false);
  assert.equal(result.state.players.o.victoryPoints, 7);
  assert.ok(result.events.some((event) => event.type === "player.defeat-applied"));

  // Reconstruct the same legal trigger condition without inventing a backwards move.
  result.state.board.locations.city = result.state.board.locations.city.filter((id) => id !== "o");
  if (!result.state.board.locations.mountain.includes("o")) result.state.board.locations.mountain.push("o");
  result.state.players.o.locationId = "mountain";
  result.state.step = "move-decision";
  result.state.activePlayerId = "o";
  result = engine.execute(result.state, command(result.state, "leave-two", CommandType.MovePlayer, "o", { locationId: "city", ignoreEngagement: true }));
  result = engine.execute(result.state, command(result.state, "defeat-two", CommandType.ResolveDecision, "i", {
    decisionId: result.state.pendingDecision.decisionId, selections: ["defeat"],
  }));
  assert.equal(result.state.players.o.defeated, false);
  assert.equal(result.state.players.o.victoryPoints, 4);
});

test("generic defeat-applied fact also fires for repeated already-defeated applications", () => {
  const { engine, definitions, state } = setup("izou-vicious-already");
  state.players.o.victoryPoints = 8;
  const emitted = [];
  applyDefeatEffect(state, "o", "i", definitions, (type, payload) => emitted.push({ type, payload }), { sourceId: "test:first" });
  for (const event of emitted.splice(0)) emitPassive(engine, state, definitions, event.type, event.payload);
  assert.equal(state.players.o.defeated, true);
  assert.equal(state.players.o.victoryPoints, 5);
  applyDefeatEffect(state, "o", "i", definitions, (type, payload) => emitted.push({ type, payload }), { sourceId: "test:second" });
  for (const event of emitted.splice(0)) emitPassive(engine, state, definitions, event.type, event.payload);
  assert.equal(state.players.o.victoryPoints, 2);
});
