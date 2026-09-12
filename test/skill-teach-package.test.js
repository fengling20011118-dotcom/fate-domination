import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { finalizeCombatFromSnapshot } from "../src/rules-core/combat.ts";
import { TEACH_GENTLEMAN_LOVE_ID, TEACH_QUEEN_ANNE_ID } from "../src/rules-core/teach.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "teach-package") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const events = Object.fromEntries(built.events.map((event) => [event.id, event]));
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "t", name: "Teach" }, { id: "o", name: "Opponent" }, { id: "x", name: "Other" }],
    seed: 9901,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "t";
  state.turnOrder = ["t", "o", "x"];
  state.players.t.servantId = "servant.teach";
  state.players.t.mana = 12;
  state.players.o.mana = 12;
  state.players.x.mana = 12;
  state.players.t.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.x.locationId = "city";
  state.board.locations = { workshop: [], mountain: ["t", "o"], city: ["x"], scouting: [] };
  state.board.outpostRecords = { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] };
  createOwnedCardInstance(state, "t", { instanceId: "gentleman", definitionId: TEACH_GENTLEMAN_LOVE_ID, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "t", { instanceId: "queen", definitionId: TEACH_QUEEN_ANNE_ID, zone: "attack", face: "up", active: true });
  return { built, engine, definitions, events, state };
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

function resolveDecision(engine, state, commandId, selections) {
  assert.ok(state.pendingDecision, `pending decision required for ${commandId}`);
  return engine.execute(state, command(state, commandId, CommandType.ResolveDecision, "t", {
    decisionId: state.pendingDecision.decisionId,
    selections,
  }));
}

test("Edward Teach package is 3/3 FULL", () => {
  const { built } = setup("teach-full");
  const ids = [TEACH_GENTLEMAN_LOVE_ID, TEACH_QUEEN_ANNE_ID, "servant.teach.skill.sc-teach-3"];
  assert.ok(ids.every((id) => built.skills.get(id).supportLevel === "FULL"));
  assert.equal(built.skills.get(TEACH_GENTLEMAN_LOVE_ID).handlerId, "core.teach-gentleman-love");
  assert.equal(built.skills.get(TEACH_QUEEN_ANNE_ID).handlerId, "core.teach-queen-anne");
});

test("Gentlemanly Love replaces only competition VP, removes one of the loser's top three and reorders the rest", () => {
  const { built, engine, definitions, events, state } = setup("teach-gentleman");
  const event = built.events.find((candidate) => Number(candidate.victoryPoints ?? 0) > 0);
  assert.ok(event);
  state.board.currentEvents = { mountain: [event.id], city: [] };
  state.board.eventVisibility = { [event.id]: "up" };
  createOwnedCardInstance(state, "o", { instanceId: "loot1", definitionId: "card.cardb1", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "loot4", definitionId: "card.cardb4", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "loot2", definitionId: "card.cardb2", zone: "deck", face: "down", active: false });

  emitPassive(engine, state, definitions, "game.started", {});
  assert.equal(state.players.t.flags.competitionVictoryPointGainBlocked, true);
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  const result = finalizeCombatFromSnapshot(state, {
    locationId: "mountain",
    participantIds: ["t", "o"],
    powers: { t: 10, o: 5 },
    attributes: { t: [], o: [] },
    cardPowers: { t: {}, o: {} },
    cardAttributes: { t: {}, o: {} },
    round: state.round,
  }, definitions, events);
  assert.deepEqual(result.winnerIds, ["t"]);
  assert.equal(result.victoryPoints.t, event.victoryPoints, "event VP remains, mountain competition +2 is replaced");

  emitPassive(engine, state, definitions, "combat.resolved", result);
  assert.equal(state.pendingDecision?.kind, "teach-gentleman-target");
  let resolved = resolveDecision(engine, state, "teach-target", ["o"]);
  assert.equal(resolved.state.pendingDecision?.kind, "teach-gentleman-remove");
  assert.deepEqual(new Set(resolved.state.pendingDecision.options.map((option) => option.id)), new Set(["loot1", "loot4", "loot2"]));
  resolved = resolveDecision(engine, resolved.state, "teach-remove", ["loot4"]);
  assert.equal(resolved.state.cards.loot4.zone, "removed");
  const removedPrintedPower = Math.min(5, Number(definitions["card.cardb4"].basePower ?? 0));
  assert.equal(resolved.state.players.t.victoryPoints, Number(event.victoryPoints) + removedPrintedPower);
  assert.equal(resolved.state.pendingDecision?.kind, "teach-gentleman-order");
  resolved = resolveDecision(engine, resolved.state, "teach-order", ["loot2", "loot1"]);
  assert.deepEqual(resolved.state.players.o.deck.slice(0, 2), ["loot2", "loot1"]);
  assert.deepEqual(resolved.state.players.t.flags.teachGentlemanLoveRemovedInstanceIds, ["loot4"]);
});

test("Queen Anne's Revenge plays only Gentlemanly Love loot with a minimum cost of 2 and exiles itself after Combat", () => {
  const { engine, definitions, state } = setup("teach-queen-anne");
  createOwnedCardInstance(state, "o", { instanceId: "loot", definitionId: "card.cardb1", zone: "removed", face: "down", active: false });
  state.players.t.flags.teachGentlemanLoveRemovedInstanceIds = ["loot"];
  const manaBefore = state.players.t.mana;
  let result = engine.execute(state, command(state, "queen-open", CommandType.UseSkill, "t", {
    skillId: TEACH_QUEEN_ANNE_ID,
    data: { abilityId: "queen-anne-revenge" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "teach-queen-anne-card");
  result = resolveDecision(engine, result.state, "queen-play", ["loot"]);
  assert.equal(result.state.cards.loot.zone, "attack");
  assert.equal(result.state.cards.loot.ownerPlayerId, "o");
  assert.equal(result.state.cards.loot.controllerPlayerId, "t");
  assert.equal(result.state.cards.loot.returnToOwnerDiscardOnClose, true);
  assert.equal(result.state.cards.loot.paidCost, 2);
  assert.equal(result.state.players.t.mana, manaBefore - 2);
  assert.equal(result.state.players.t.flags.teachQueenAnneRemoveRound, state.round);

  result.state.phase = "combat";
  result.state.step = "settlement";
  result.state.activePlayerId = null;
  emitPassive(engine, result.state, definitions, "combat.ending", { round: state.round });
  assert.equal(result.state.cards.queen.zone, "removed");
  assert.equal(result.state.cards.queen.active, false);
  assert.equal(result.state.cards.loot.zone, "attack", "the played loot is not the card referred to by the self-exile clause");
});
