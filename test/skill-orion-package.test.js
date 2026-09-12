import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const HUNTER = "servant.orion.skill.sc-orion-1";
const BLESSING = "servant.orion.skill.sc-orion-2";
const ARROW = "servant.orion.skill.sc-orion-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}
function setup(id = "orion") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "r", name: "Orion" }, { id: "o", name: "Opponent" }], seed: 2701 });
  state.status = "playing"; state.round = 4; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "r";
  state.turnOrder = ["r", "o"]; state.players.r.servantId = "servant.orion"; state.players.r.locationId = "mountain"; state.players.o.locationId = "mountain";
  state.board.locations.workshop = []; state.board.locations.mountain = ["r", "o"]; state.board.locations.city = []; state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}
let eventCounter = 0;
function emitPassive(engine, state, definitions, type, payload = {}) {
  eventCounter += 1;
  enqueuePassiveEffects(state, engine.passives, { eventId: `${state.gameInstanceId}:${type}:${eventCounter}`, sourceCommandId: "test", revision: state.revision, type, payload });
  engine.effects.drain(state, 1000, definitions);
}

test("Orion package: all three skills are FULL", () => {
  const { built } = setup("orion-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.orion");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(HUNTER).handlerId, "core.orion-hunter-moon");
  assert.equal(built.skills.get(BLESSING).handlerId, "core.orion-sea-god-blessing");
  assert.equal(built.skills.get(ARROW).handlerId, "core.orion-luck-exile");
});

test("Hunter pays 4 and random-discards one, then future basic plays gain +2 while repeated standard attributes grant +3 total power", () => {
  const { engine, definitions, state } = setup("orion-hunter");
  state.players.r.mana = 8;
  createOwnedCardInstance(state, "r", { instanceId: "discard-me", definitionId: "card.cardq1", zone: "hand" });
  let result = engine.execute(state, command(state, "orion-hunter-use", CommandType.UseSkill, "r", { skillId: HUNTER, data: { abilityId: "hunter-empower" } }));
  assert.equal(result.state.players.r.mana, 4);
  assert.equal(result.state.players.r.hand.length, 0);
  assert.equal(result.state.players.r.discard.includes("discard-me"), true);

  createOwnedCardInstance(result.state, "r", { instanceId: "future-a", definitionId: "card.cardb2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(result.state, "r", { instanceId: "future-b", definitionId: "card.cardb3", zone: "attack", face: "up", active: true });
  result.state.cards["future-a"].playedRound = 4;
  result.state.cards["future-b"].playedRound = 4;
  emitPassive(engine, result.state, definitions, "card.played", { playerId: "r", instanceId: "future-a", definitionId: "card.cardb2", face: "up" });
  emitPassive(engine, result.state, definitions, "card.played", { playerId: "r", instanceId: "future-b", definitionId: "card.cardb3", face: "up" });
  assert.equal(calculateCombatCardPower(result.state, result.state.players.r, "future-a", definitions, "mountain"), definitions["card.cardb2"].basePower + 2);
  emitPassive(engine, result.state, definitions, "attack.committed", { playerId: "r", committed: ["future-a", "future-b"], paidMana: 0 });
  assert.equal(result.state.players.r.flags.roundPowerBonus, 3);
});

test("Sea God Blessing joins Luck from hand/deck, second use costs 4, and both remain residual", () => {
  const { engine, state } = setup("orion-blessing");
  state.players.r.mana = 8;
  createOwnedCardInstance(state, "r", { instanceId: "blessing", definitionId: BLESSING, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "r", { instanceId: "luck-hand", definitionId: "card.cardluck", zone: "hand" });
  createOwnedCardInstance(state, "r", { instanceId: "luck-deck", definitionId: "card.cardluck", zone: "deck" });

  let result = engine.execute(state, command(state, "orion-blessing-one", CommandType.UseSkill, "r", { skillId: BLESSING, data: { abilityId: "free-love" } }));
  result = engine.execute(result.state, command(result.state, "orion-blessing-one-pick", CommandType.ResolveDecision, "r", { decisionId: result.state.pendingDecision.decisionId, selections: ["luck-hand"] }));
  assert.equal(result.state.players.r.mana, 8);
  assert.equal(result.state.cards["luck-hand"].zone, "attack");
  assert.equal(result.state.cards["luck-hand"].residual, true);

  result = engine.execute(result.state, command(result.state, "orion-blessing-two", CommandType.UseSkill, "r", { skillId: BLESSING, data: { abilityId: "free-love" } }));
  result = engine.execute(result.state, command(result.state, "orion-blessing-two-pick", CommandType.ResolveDecision, "r", { decisionId: result.state.pendingDecision.decisionId, selections: ["luck-deck"] }));
  assert.equal(result.state.players.r.mana, 4);
  assert.equal(result.state.cards["luck-deck"].zone, "attack");
  assert.equal(result.state.cards["luck-deck"].residual, true);
  assert.equal(result.state.players.r.flags.orionBlessingCount, 2);
});

test("Blessed Luck closes after combat when Orion loses or is defeated", () => {
  const { engine, definitions, state } = setup("orion-blessing-close");
  createOwnedCardInstance(state, "r", { instanceId: "blessing", definitionId: BLESSING, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "r", { instanceId: "luck", definitionId: "card.cardluck", zone: "attack", face: "up", active: true, residual: true });
  state.cards.luck.modifiers.push(`effect-until-close:${BLESSING}:free-love`);
  emitPassive(engine, state, definitions, "combat.ending", { round: 4, previousLocations: { r: "mountain", o: "mountain" }, combatWinnerIdsByLocation: { mountain: ["o"], city: [] } });
  assert.equal(state.cards.luck.zone, "attack");
  assert.equal(state.cards.luck.face, "down");
  assert.equal(state.cards.luck.active, false);
  assert.equal(state.cards.luck.modifiers.some((marker) => marker.startsWith("effect-until-close:")), false);
});
