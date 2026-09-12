import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, closePlayerCard } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { startStandardRound } from "../src/rules-core/rounds.ts";

const ALTER_EGO = "servant.passionlip.skill.sc-passionlip-1";
const MASOCHISM = "servant.passionlip.skill.sc-passionlip-2";
const ARMOR = "servant.passionlip.skill.sc-passionlip-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "passionlip") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "p", name: "Passionlip" }, { id: "o", name: "Opponent" }], seed: 1501 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "p";
  state.turnOrder = ["p", "o"];
  state.players.p.servantId = "servant.passionlip";
  state.players.p.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["p", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function useSkill(engine, state, actorId, skillId, abilityId, commandId) {
  return engine.execute(state, command(state, commandId, CommandType.UseSkill, actorId, {
    skillId,
    data: { abilityId },
  }));
}

test("Passionlip package: all three skills are FULL and both Alter targets expose authored reversal", () => {
  const { built } = setup("passionlip-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.passionlip");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(ALTER_EGO).handlerId, "core.alter-ego-transform");
  assert.equal(built.skills.get(MASOCHISM).handlerId, "core.passionlip-masochism");
  assert.equal(built.skills.get(ARMOR).handlerId, "core.passionlip-durga-armor");
  assert.equal(built.skills.get(MASOCHISM).hasReversalEffect, true);
  assert.equal(built.skills.get(ARMOR).hasReversalEffect, true);
});

test("Alter Ego reverses a just-played Passionlip skill and reversal is cleared when that card closes", () => {
  const { engine, definitions, state } = setup("passionlip-reverse-lifecycle");
  state.phase = "action";
  createOwnedCardInstance(state, "p", { instanceId: "alter", definitionId: ALTER_EGO, zone: "attack", face: "up", active: true, residual: true });
  createOwnedCardInstance(state, "p", { instanceId: "maso", definitionId: MASOCHISM, zone: "attack", face: "up", active: true });
  state.cards.maso.playedRound = 4;

  const result = engine.execute(state, command(state, "passionlip-reverse", CommandType.UseSkill, "p", {
    skillId: ALTER_EGO,
    data: { abilityId: "alter-ego-transform", targetInstanceId: "maso", reverse: true },
  }));
  assert.equal(result.state.cards.maso.reversed, true);
  assert.ok(result.state.cards.maso.modifiers.some((marker) => marker.startsWith("reversed-until-close:")));
  assert.equal(result.state.cards.alter.zone, "servant-skills");

  closePlayerCard(result.state, "p", "maso", definitions);
  assert.equal(result.state.cards.maso.reversed, undefined);
  assert.ok(!result.state.cards.maso.modifiers.some((marker) => marker.startsWith("reversed-until-close:")));
});

test("Masochistic Nature counts each stronger opposing attack; Alter grants +3 next-round total power for each affected attack", () => {
  const { engine, definitions, state } = setup("passionlip-masochism");
  createOwnedCardInstance(state, "p", { instanceId: "maso", definitionId: MASOCHISM, zone: "attack", face: "up", active: true });
  state.cards.maso.reversed = true;
  createOwnedCardInstance(state, "p", { instanceId: "p7", definitionId: "card.cardb5", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "o9", definitionId: "card.cardb6", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "o12", definitionId: "card.cardq6", zone: "attack", face: "up", active: true });
  state.cards.o12.powerModifiers = [{ id: "test-plus", sourceId: "test", kind: "add", value: 3, duration: "round" }];
  createOwnedCardInstance(state, "o", { instanceId: "o4", definitionId: "card.cardq3", zone: "attack", face: "up", active: true });

  const result = useSkill(engine, state, "p", MASOCHISM, "masochistic-nature", "passionlip-maso-use");
  assert.equal(result.state.players.p.victoryPoints, 2);
  assert.equal(result.state.players.p.flags.nextRoundTotalPowerBonus, 6);

  result.state.board.situationDeck = ["passionlip-next"];
  startStandardRound(result.state, [{ id: "passionlip-next", mana: 0, eventPlacement: { mountain: 0, city: 0 } }], [], () => 0, definitions);
  assert.equal(result.state.round, 5);
  assert.equal(result.state.players.p.flags.nextRoundTotalPowerBonus, undefined);
  assert.equal(result.state.players.p.flags.roundPowerBonus, 6);
});

test("Durga Armor normal face caps only attacks currently above 9, leaving lower attacks unchanged", () => {
  const { engine, definitions, state } = setup("passionlip-armor-normal");
  createOwnedCardInstance(state, "p", { instanceId: "armor", definitionId: ARMOR, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "p", { instanceId: "p7", definitionId: "card.cardb5", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "o12", definitionId: "card.cardb6", zone: "attack", face: "up", active: true });
  state.cards.o12.powerModifiers = [{ id: "test-plus", sourceId: "test", kind: "add", value: 3, duration: "round" }];

  const result = useSkill(engine, state, "p", ARMOR, "durga-armor", "passionlip-armor-normal-use");
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "o12", definitions, "mountain"), 9);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.p, "p7", definitions, "mountain"), 7);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.p, "armor", definitions, "mountain"), 6);
});

test("Durga Armor Alter has every combatant preserve one active attack, zeros all other active attacks, and reveals true name", () => {
  const { engine, definitions, state } = setup("passionlip-armor-alter");
  state.players.p.trueNameRevealed = false;
  createOwnedCardInstance(state, "p", { instanceId: "armor", definitionId: ARMOR, zone: "attack", face: "up", active: true });
  state.cards.armor.reversed = true;
  createOwnedCardInstance(state, "p", { instanceId: "p7", definitionId: "card.cardb5", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "o9", definitionId: "card.cardb6", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "o4", definitionId: "card.cardq3", zone: "attack", face: "up", active: true });

  let result = useSkill(engine, state, "p", ARMOR, "durga-armor", "passionlip-armor-alter-open");
  assert.equal(result.state.players.p.trueNameRevealed, true);
  assert.equal(result.state.pendingDecision?.kind, "passionlip-durga-armor-select");
  assert.deepEqual(result.state.pendingDecision?.chooserPlayerIds, ["p", "o"]);

  result = engine.execute(result.state, command(result.state, "passionlip-armor-pick-p", CommandType.ResolveDecision, "p", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["armor"],
  }));
  assert.ok(result.state.pendingDecision);

  result = engine.execute(result.state, command(result.state, "passionlip-armor-pick-o", CommandType.ResolveDecision, "o", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["o9"],
  }));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.p, "armor", definitions, "mountain"), 6);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "o9", definitions, "mountain"), 9);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.p, "p7", definitions, "mountain"), 0);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "o4", definitions, "mountain"), 0);
});
