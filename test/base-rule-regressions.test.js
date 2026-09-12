import test from "node:test";
import assert from "node:assert/strict";

import { createGameState } from "../src/domain/state/createGameState.ts";
import { CardAbilityRegistry } from "../src/rules-core/card-abilities.ts";
import { calculateCombatCardPower, calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { closePlayerCard, createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { eliminatePlayerByEffect } from "../src/rules-core/elimination.ts";
import { applyClimaxElimination, endStandardRound } from "../src/rules-core/rounds.ts";

function stateOf(id = "base-rule", playerIds = ["p", "o"]) {
  const state = createGameState({
    gameInstanceId: id,
    players: playerIds.map((playerId) => ({ id: playerId, name: playerId })),
    seed: 1,
  });
  state.status = "playing";
  state.round = 1;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = playerIds[0];
  return state;
}

const basic = { id: "card.basic", name: "Basic", cost: 0, basePower: 1, typeLabel: "力量" };

test("base deactivation keeps an ordinary non-Skill attack face-down in play until round cleanup", () => {
  const state = stateOf("base-close");
  const definitions = { [basic.id]: basic };
  createOwnedCardInstance(state, "p", { instanceId: "a", definitionId: basic.id, zone: "attack", face: "up", active: true });

  closePlayerCard(state, "p", "a", definitions);
  assert.equal(state.cards.a.zone, "attack");
  assert.equal(state.cards.a.face, "down");
  assert.equal(state.cards.a.active, false);
  assert.deepEqual(state.players.p.attack, ["a"]);
  assert.deepEqual(state.players.p.discard, []);

  endStandardRound(state, definitions);
  assert.equal(state.cards.a.zone, "discard");
  assert.ok(state.players.p.discard.includes("a"));
});

test("deactivating a spent once-per-game non-Skill still removes it from the game", () => {
  const state = stateOf("base-close-opg");
  const definitions = { [basic.id]: { ...basic, limit: "once-per-game" } };
  createOwnedCardInstance(state, "p", { instanceId: "a", definitionId: basic.id, zone: "attack", face: "up", active: true });
  state.cards.a.used = true;

  closePlayerCard(state, "p", "a", definitions);
  assert.equal(state.cards.a.zone, "removed");
  assert.ok(!state.players.p.attack.includes("a"));
});

test("activated ability resets after returning from play to hand, but not after returning to Skill Zone", () => {
  const state = stateOf("ability-reset");
  const actionCard = { id: "card.action", name: "Action", cost: 0, basePower: 1, typeLabel: "力量", phases: ["action"], cardAbilityIds: ["act"] };
  const skillCard = { id: "servant.test.skill.s1", name: "Skill", cost: 0, basePower: 1, typeLabel: "特殊", isSkill: true, skillOwnerType: "servant", phases: ["action"], cardAbilityIds: ["skill-act"] };
  const definitions = { [actionCard.id]: actionCard, [skillCard.id]: skillCard };
  let calls = 0;
  const registry = new CardAbilityRegistry();
  registry.register("act", () => { calls += 1; });
  registry.register("skill-act", () => { calls += 1; });

  createOwnedCardInstance(state, "p", { instanceId: "action", definitionId: actionCard.id, zone: "attack", face: "up", active: true });
  registry.execute("act", { state, playerId: "p", instanceId: "action", definitions });
  movePlayerCard(state, "p", "action", "hand");
  movePlayerCard(state, "p", "action", "attack");
  state.cards.action.face = "up";
  state.cards.action.active = true;
  assert.doesNotThrow(() => registry.execute("act", { state, playerId: "p", instanceId: "action", definitions }));

  createOwnedCardInstance(state, "p", { instanceId: "skill", definitionId: skillCard.id, zone: "attack", face: "up", active: true });
  registry.execute("skill-act", { state, playerId: "p", instanceId: "skill", definitions });
  closePlayerCard(state, "p", "skill", definitions);
  movePlayerCard(state, "p", "skill", "attack");
  state.cards.skill.face = "up";
  state.cards.skill.active = true;
  assert.throws(() => registry.execute("skill-act", { state, playerId: "p", instanceId: "skill", definitions }), /CARD_ABILITY_LIMIT_REACHED/);
  assert.equal(calls, 3);
});

test("game-wide activated-ability limits stay spent after leaving play", () => {
  const state = stateOf("ability-opg");
  const definition = { id: "card.opg", name: "OPG", cost: 0, basePower: 1, typeLabel: "力量", phases: ["action"], cardAbilityIds: ["opg"], limit: "once-per-game" };
  const definitions = { [definition.id]: definition };
  const registry = new CardAbilityRegistry();
  registry.register("opg", () => undefined);
  createOwnedCardInstance(state, "p", { instanceId: "opg", definitionId: definition.id, zone: "attack", face: "up", active: true });
  registry.execute("opg", { state, playerId: "p", instanceId: "opg", definitions });
  movePlayerCard(state, "p", "opg", "hand");
  movePlayerCard(state, "p", "opg", "attack");
  state.cards.opg.face = "up";
  state.cards.opg.active = true;
  assert.throws(() => registry.execute("opg", { state, playerId: "p", instanceId: "opg", definitions }), /CARD_ABILITY_LIMIT_REACHED/);
});

test("card power and final player combat power are floored at zero", () => {
  const state = stateOf("power-floor");
  const definitions = { [basic.id]: basic };
  state.players.p.locationId = "mountain";
  state.board.locations.mountain = ["p"];
  createOwnedCardInstance(state, "p", { instanceId: "a", definitionId: basic.id, zone: "attack", face: "up", active: true });
  state.cards.a.powerModifiers = [{ id: "negative", sourceId: "test", kind: "add", value: -3, duration: "round" }];
  assert.equal(calculateCombatCardPower(state, state.players.p, "a", definitions, "mountain"), 0);
  assert.equal(calculateCombatPower(state, state.players.p, definitions, "mountain"), 0);
});

test("elimination removes character components and source-bound effects but preserves cards in another player's ordinary zone", () => {
  const state = stateOf("elimination-cleanup");
  state.players.p.masterId = "master.test";
  state.players.p.servantId = "servant.test";
  state.players.p.locationId = "mountain";
  state.board.locations.mountain = ["p", "o"];

  createOwnedCardInstance(state, "p", { instanceId: "hand", definitionId: "card.hand", originServantId: "servant.test", zone: "hand" });
  createOwnedCardInstance(state, "p", { instanceId: "attack", definitionId: "card.attack", originServantId: "servant.test", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "p", { instanceId: "skill", definitionId: "servant.test.skill.s1", originServantId: "servant.test", zone: "servant-skills", face: "up" });
  createOwnedCardInstance(state, "p", { instanceId: "away", definitionId: "card.away", originServantId: "servant.test", zone: "hand" });
  state.players.p.hand = state.players.p.hand.filter((id) => id !== "away");
  state.players.o.hand.push("away");
  state.cards.away.zone = "hand";
  state.cards.away.controllerPlayerId = "o";
  createOwnedCardInstance(state, "o", { instanceId: "temp", definitionId: "card.temp", zone: "attack", face: "up", active: true, temporary: true, createdByPlayerId: "p", createdByEffectId: "servant.test.skill.s1" });

  state.activeRuleModifiers.push({ id: "rule", sourceId: "servant.test.skill.s1", sourceInstanceId: "attack", controllerPlayerId: "p", operation: "add", rule: "combat_power", value: 3, duration: "game", createdRound: 1 });
  state.scheduledEffects.push({ scheduleId: "future", sourceId: "servant.test.skill.s1", controllerPlayerId: "p", handlerId: "noop", payload: {}, triggerEventType: "round.started", once: true });
  state.players.o.cardRuleModifiers = [{ id: "card-rule", sourceId: "servant.test.skill.s1", sourceInstanceId: "attack", targetDefinitionIds: [basic.id], powerAdd: 2, duration: "game" }];
  state.players.o.stackedStatusModifiers = [{ id: "status", sourceId: "servant.test.skill.s1", sourcePlayerId: "p", count: 1, totalPowerPerStack: -1 }];

  const result = eliminatePlayerByEffect(state, "p");
  assert.equal(result.eliminated, true);
  assert.equal(state.players.p.eliminated, true);
  assert.equal(state.players.p.locationId, null);
  assert.ok(!state.board.locations.mountain.includes("p"));
  assert.equal(state.cards.hand.zone, "removed");
  assert.equal(state.cards.attack.zone, "removed");
  assert.equal(state.cards.skill.zone, "removed");
  assert.equal(state.cards.temp.zone, "removed");
  assert.equal(state.cards.away.zone, "hand");
  assert.ok(state.players.o.hand.includes("away"));
  assert.equal(state.activeRuleModifiers.length, 0);
  assert.equal(state.scheduledEffects.length, 0);
  assert.equal(state.players.o.cardRuleModifiers, undefined);
  assert.equal(state.players.o.stackedStatusModifiers, undefined);
});

test("climax elimination uses the same component cleanup", () => {
  const ids = ["p", "a", "b", "c", "d"];
  const state = stateOf("climax-cleanup", ids);
  state.round = 8;
  ids.forEach((id, index) => { state.players[id].victoryPoints = index === 0 ? 0 : 10 - index; });
  createOwnedCardInstance(state, "p", { instanceId: "p-card", definitionId: basic.id, zone: "attack", face: "up", active: true });
  const eliminated = applyClimaxElimination(state, { [basic.id]: basic });
  assert.deepEqual(eliminated, ["p"]);
  assert.equal(state.cards["p-card"].zone, "removed");
});
