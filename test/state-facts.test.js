import test from "node:test";
import assert from "node:assert/strict";

import { createGameState } from "../src/domain/state/createGameState.ts";
import { SkillRegistry } from "../src/rules-core/skill-registry.ts";
import { gainMana } from "../src/rules-core/resources.ts";
import { captureStateFacts, emitStateFactDiff } from "../src/rules-core/state-facts.ts";
import { closePlayerCard, createOwnedCardInstance, drawCards } from "../src/rules-core/decks.ts";

test("skill registry emits one mana fact including ability cost and handler resource changes", () => {
  const registry = new SkillRegistry();
  registry.register({
    id: "test.skill.fact", name: "fact", ownerType: "master", ownerId: "master.fact",
    activation: "phase", windows: ["action"], cost: 0, abilityCost: 2, text: "fact", supportLevel: "FULL",
  }, ({ player }) => { gainMana(player, 1); });
  const state = createGameState({ gameInstanceId: "state-facts-skill", players: [{ id: "p", name: "p" }], seed: 1 });
  state.status = "playing"; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "p";
  state.players.p.masterId = "master.fact"; state.players.p.mana = 5;
  const events = [];
  registry.execute(state, "p", "test.skill.fact", {}, () => {}, () => 0, {}, (type, payload) => events.push({ type, payload }));
  assert.equal(state.players.p.mana, 4);
  assert.deepEqual(events.filter((event) => event.type === "player.mana.changed").map((event) => event.payload), [
    { playerId: "p", round: 0, before: 5, after: 4, delta: -1, sourceId: "test.skill.fact" },
  ]);
});

test("state fact diff exposes draw, close, discard and resource changes without text parsing", () => {
  const state = createGameState({ gameInstanceId: "state-facts-cards", players: [{ id: "p", name: "p" }], seed: 2 });
  state.players.p.masterId = "master.fact"; state.players.p.mana = 3; state.players.p.victoryPoints = 4;
  createOwnedCardInstance(state, "p", { instanceId: "deck-card", definitionId: "test.basic", zone: "deck" });
  createOwnedCardInstance(state, "p", { instanceId: "active-card", definitionId: "test.skill", zone: "attack", face: "up", active: true });
  const before = captureStateFacts(state);
  const definitions = {
    "test.basic": { id: "test.basic", name: "basic", cost: 0, basePower: 1, typeLabel: "力量" },
    "test.skill": { id: "test.skill", name: "skill", cost: 0, basePower: 1, typeLabel: "特殊", isSkill: true, skillOwnerType: "master" },
  };
  drawCards(state, "p", 1, () => 0, definitions);
  closePlayerCard(state, "p", "active-card", definitions);
  state.players.p.mana = 1; state.players.p.victoryPoints = 7;
  const events = [];
  emitStateFactDiff(before, state, (type, payload) => events.push({ type, payload }), { sourceId: "test" });
  assert.ok(events.some((event) => event.type === "card.drawn" && event.payload.instanceId === "deck-card"));
  assert.ok(events.some((event) => event.type === "card.closed" && event.payload.instanceId === "active-card"));
  assert.ok(events.some((event) => event.type === "player.mana.changed" && event.payload.delta === -2));
  assert.ok(events.some((event) => event.type === "player.victory-points.changed" && event.payload.delta === 3));
});

test("automatic discard recycle emits a structured deck-shuffle reason", () => {
  const state = createGameState({ gameInstanceId: "state-facts-recycle", players: [{ id: "p", name: "p" }], seed: 3 });
  state.players.p.masterId = "master.fact";
  createOwnedCardInstance(state, "p", { instanceId: "discard-card", definitionId: "test.basic", zone: "discard" });
  const definitions = {
    "test.basic": { id: "test.basic", name: "basic", cost: 0, basePower: 1, typeLabel: "力量" },
  };
  const before = captureStateFacts(state);
  assert.deepEqual(drawCards(state, "p", 1, () => 0, definitions), ["discard-card"]);
  const events = [];
  emitStateFactDiff(before, state, (type, payload) => events.push({ type, payload }));
  assert.ok(events.some((event) => event.type === "player.deck-shuffled"
    && event.payload.playerId === "p"
    && event.payload.reason === "automatic-recycle"));
});
