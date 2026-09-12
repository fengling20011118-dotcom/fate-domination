import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, drawCards } from "../src/rules-core/decks.ts";
import { addCardToAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { applyClimaxElimination, startStandardRound } from "../src/rules-core/rounds.ts";
import { gainVictoryPoints } from "../src/rules-core/resources.ts";

const RIDING = "servant.constantine.skill.sc-constantine-1";
const EMPIRE = "servant.constantine.skill.sc-constantine-2";
const WALLS = "servant.constantine.skill.sc-constantine-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "constantine", players = [{ id: "c", name: "Constantine" }, { id: "o", name: "Opponent" }]) {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players, seed: 1301 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "c";
  state.turnOrder = players.map((player) => player.id);
  state.players.c.servantId = "servant.constantine";
  state.players.c.mana = 12;
  return { built, definitions, engine, state };
}

let passiveCounter = 0;
function emitPassive(ctx, type, payload) {
  passiveCounter += 1;
  enqueuePassiveEffects(ctx.state, ctx.engine.passives, {
    eventId: `${ctx.state.gameInstanceId}:${type}:${passiveCounter}`,
    sourceCommandId: "test",
    revision: ctx.state.revision,
    type,
    payload,
  });
  ctx.engine.effects.drain(ctx.state, 1000, ctx.definitions);
}

test("Constantine package: all three skills are FULL", () => {
  const { built } = setup("constantine-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.constantine");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(RIDING).handlerId, "core.riding");
  assert.equal(built.skills.get(EMPIRE).handlerId, "core.structured-skill");
  assert.equal(built.skills.get(WALLS).handlerId, "core.constantine-triple-walls");
});

test("Falling Empire replaces climax elimination, removes itself, and doubles every positive VP gain only next round", () => {
  const players = [
    { id: "c", name: "Constantine" }, { id: "a", name: "A" }, { id: "b", name: "B" }, { id: "d", name: "D" }, { id: "e", name: "E" },
  ];
  const { definitions, state } = setup("constantine-empire", players);
  state.round = 8;
  state.players.c.victoryPoints = 0;
  for (const id of ["a", "b", "d", "e"]) state.players[id].victoryPoints = 10;
  createOwnedCardInstance(state, "c", { instanceId: "empire", definitionId: EMPIRE, zone: "servant-skills", face: "down", active: false });

  const eliminated = applyClimaxElimination(state, definitions);
  assert.deepEqual(eliminated, []);
  assert.equal(state.players.c.eliminated, false);
  assert.equal(state.cards.empire.zone, "removed");
  assert.equal(state.players.c.flags.nextRoundVictoryPointGainMultiplier, 2);

  state.board.situationDeck = ["s9", "s10"];
  startStandardRound(state, [{ id: "s9", mana: 0, eventPlacement: { mountain: 0, city: 0 } }, { id: "s10", mana: 0, eventPlacement: { mountain: 0, city: 0 } }], [], () => 0, definitions);
  assert.equal(state.round, 9);
  assert.equal(state.players.c.flags.victoryPointGainMultiplier, 2);
  assert.equal(gainVictoryPoints(state.players.c, 2), 4);
  assert.equal(state.players.c.victoryPoints, 4);

  startStandardRound(state, [{ id: "s10", mana: 0, eventPlacement: { mountain: 0, city: 0 } }], [], () => 0, definitions);
  assert.equal(state.round, 10);
  assert.equal(state.players.c.flags.victoryPointGainMultiplier, undefined);
  assert.equal(gainVictoryPoints(state.players.c, 2), 2);
  assert.equal(state.players.c.victoryPoints, 6);
});

test("Faith Wall may pay 3 when a basic attack is drawn, reveals that physical card and doubles its power while active", () => {
  const ctx = setup("constantine-faith");
  createOwnedCardInstance(ctx.state, "c", { instanceId: "walls", definitionId: WALLS, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(ctx.state, "c", { instanceId: "basic", definitionId: "card.cardb1", zone: "deck", face: "down", active: false });
  drawCards(ctx.state, "c", 1, () => 0, ctx.definitions);
  emitPassive(ctx, "card.drawn", { ownerPlayerId: "c", instanceId: "basic", definitionId: "card.cardb1", fromZone: "deck", toZone: "hand" });
  assert.equal(ctx.state.pendingDecision?.kind, "constantine-faith-wall");

  const result = ctx.engine.execute(ctx.state, command(ctx.state, "faith-bless", CommandType.ResolveDecision, "c", {
    decisionId: ctx.state.pendingDecision.decisionId,
    selections: ["bless"],
  }));
  ctx.state = result.state;
  assert.equal(ctx.state.players.c.mana, 9);
  assert.equal(ctx.state.cards.basic.face, "up");
  assert.equal(ctx.state.players.c.flags.constantineFaithWallUsedRound, 4);
  addCardToAttack(ctx.state, "c", "basic", ctx.definitions, { payCost: false, bypassTiming: true });
  assert.equal(calculateCombatCardPower(ctx.state, ctx.state.players.c, "basic", ctx.definitions, "mountain"), 4);
});

test("declining Faith Wall does not consume its once-per-round opportunity", () => {
  const ctx = setup("constantine-faith-decline");
  createOwnedCardInstance(ctx.state, "c", { instanceId: "walls", definitionId: WALLS, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(ctx.state, "c", { instanceId: "first", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  emitPassive(ctx, "card.drawn", { ownerPlayerId: "c", instanceId: "first", definitionId: "card.cardb1", fromZone: "deck", toZone: "hand" });
  let result = ctx.engine.execute(ctx.state, command(ctx.state, "faith-decline", CommandType.ResolveDecision, "c", {
    decisionId: ctx.state.pendingDecision.decisionId,
    selections: ["decline"],
  }));
  ctx.state = result.state;
  assert.equal(ctx.state.players.c.flags.constantineFaithWallUsedRound, undefined);
  createOwnedCardInstance(ctx.state, "c", { instanceId: "second", definitionId: "card.cardq2", zone: "hand", face: "down", active: false });
  emitPassive(ctx, "card.drawn", { ownerPlayerId: "c", instanceId: "second", definitionId: "card.cardq2", fromZone: "deck", toZone: "hand" });
  assert.equal(ctx.state.pendingDecision?.kind, "constantine-faith-wall");
});

test("Destined Defeat grants 3 VP when Constantine participates and loses combat", () => {
  const ctx = setup("constantine-defeat");
  createOwnedCardInstance(ctx.state, "c", { instanceId: "walls", definitionId: WALLS, zone: "attack", face: "up", active: true });
  ctx.state.players.c.victoryPoints = 1;
  emitPassive(ctx, "combat.resolved", { locationId: "mountain", powers: { c: 5, o: 8 }, winnerIds: ["o"], defeatedPlayerIds: ["c"] });
  assert.equal(ctx.state.players.c.victoryPoints, 4);
});
