import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { captureStateFacts, emitStateFactDiff } from "../src/rules-core/state-facts.ts";
import { gainMana } from "../src/rules-core/resources.ts";

const HAND = "servant.tesla.skill.sc-tesla-1";
const DESCENT = "servant.tesla.skill.sc-tesla-2";
const DESCENT_ALT = "servant.tesla.skill.sc-tesla-3";

function setup(id = "tesla") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "t", name: "Tesla" }, { id: "o", name: "Opponent" }], seed: 1401 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "t";
  state.turnOrder = ["t", "o"];
  state.players.t.servantId = "servant.tesla";
  state.players.t.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["t", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

let eventCounter = 0;
function pump(ctx, initialType, initialPayload) {
  const events = [{
    eventId: `${ctx.state.gameInstanceId}:test:${++eventCounter}`,
    sourceCommandId: "test",
    revision: ctx.state.revision,
    type: initialType,
    payload: initialPayload,
  }];
  const processed = new Set();
  while (true) {
    let enqueued = 0;
    for (const event of events) {
      if (processed.has(event.eventId)) continue;
      processed.add(event.eventId);
      enqueuePassiveEffects(ctx.state, ctx.engine.passives, event);
      enqueued += 1;
    }
    const resolved = ctx.engine.effects.drain(ctx.state, 1000, ctx.definitions, (type, payload) => {
      events.push({ eventId: `${ctx.state.gameInstanceId}:test:${++eventCounter}`, sourceCommandId: "test", revision: ctx.state.revision, type, payload });
    });
    if (ctx.state.pendingDecision) break;
    if (enqueued === 0 && resolved === 0) break;
  }
  return events;
}

function gainManaWithFacts(ctx, playerId, amount) {
  const before = captureStateFacts(ctx.state);
  gainMana(ctx.state.players[playerId], amount);
  const events = [];
  emitStateFactDiff(before, ctx.state, (type, payload) => {
    events.push({ eventId: `${ctx.state.gameInstanceId}:test:${++eventCounter}`, sourceCommandId: "test", revision: ctx.state.revision, type, payload });
  });
  for (const event of events) pump(ctx, event.type, event.payload);
  return events;
}

test("Tesla package: all three skills are FULL", () => {
  const { built } = setup("tesla-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.tesla");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(HAND).handlerId, "core.tesla-lightning-hand");
  assert.equal(built.skills.get(DESCENT).handlerId, "core.tesla-lightning-descent");
  assert.equal(built.skills.get(DESCENT_ALT).handlerId, "core.structured-skill");
});

test("mana gains that exceed the storage cap emit an authoritative overflow fact even when the visible mana change is smaller", () => {
  const ctx = setup("tesla-overflow-fact");
  ctx.state.players.o.flags.manaCap = 5;
  ctx.state.players.o.mana = 4;
  const before = captureStateFacts(ctx.state);
  assert.equal(gainMana(ctx.state.players.o, 3), 1);
  const emitted = [];
  emitStateFactDiff(before, ctx.state, (type, payload) => emitted.push({ type, payload }));
  const overflow = emitted.find((event) => event.type === "player.mana-gain-overflow");
  assert.ok(overflow);
  assert.equal(overflow.payload.playerId, "o");
  assert.equal(overflow.payload.overflow, 2);
  assert.equal(overflow.payload.applied, 1);
});

test("Lightning Hand reacts to one 2+ mana payment, gains 2 mana, converts its own overflow to +5, then closes at combat end", () => {
  const ctx = setup("tesla-hand");
  createOwnedCardInstance(ctx.state, "t", { instanceId: "hand", definitionId: HAND, zone: "attack", face: "up", active: true, residual: true });
  ctx.state.players.t.flags.manaCap = 10;
  ctx.state.players.t.mana = 9;
  pump(ctx, "player.mana.spent", { playerId: "o", amount: 2, round: 4, sequence: 1 });
  assert.equal(ctx.state.players.t.mana, 10);
  assert.equal(ctx.state.players.t.flags.roundPowerBonus, 5);
  assert.equal(ctx.state.players.t.flags.teslaLightningHandCloseRound, 4);
  pump(ctx, "combat.ending", { round: 4, previousLocations: { t: "mountain", o: "mountain" }, combatWinnerIdsByLocation: {} });
  assert.equal(ctx.state.cards.hand.zone, "servant-skills");
  assert.equal(ctx.state.cards.hand.active, false);
});

test("Lightning Descent loses all remaining mana on play and converts the lost amount to round total power", () => {
  const ctx = setup("tesla-descent-play");
  createOwnedCardInstance(ctx.state, "t", { instanceId: "descent", definitionId: DESCENT, zone: "attack", face: "up", active: true });
  ctx.state.players.t.mana = 7;
  pump(ctx, "card.played", { playerId: "t", instanceId: "descent", definitionId: DESCENT, face: "up", paidMana: 0 });
  assert.equal(ctx.state.players.t.mana, 0);
  assert.equal(ctx.state.players.t.flags.roundPowerBonus, 7);
});

test("Lightning Descent defeats a same-battlefield opponent when that opponent's mana gain overflows", () => {
  const ctx = setup("tesla-descent-overload");
  createOwnedCardInstance(ctx.state, "t", { instanceId: "descent", definitionId: DESCENT, zone: "attack", face: "up", active: true });
  ctx.state.players.o.flags.manaCap = 5;
  ctx.state.players.o.mana = 4;
  const events = gainManaWithFacts(ctx, "o", 2);
  assert.ok(events.some((event) => event.type === "player.mana-gain-overflow"));
  assert.equal(ctx.state.players.o.mana, 5);
  assert.equal(ctx.state.players.o.defeated, true);
});
