import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const SABER = "servant.saitou.skill.sc-saitou-1";
const FLAG = "servant.saitou.skill.sc-saitou-2";
const FORMLESS = "servant.saitou.skill.sc-saitou-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "saitou", playerSpecs = [{ id: "s", name: "Saitou" }, { id: "o", name: "Opponent" }]) {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: playerSpecs, seed: 1801 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.turnOrder = playerSpecs.map((player) => player.id);
  state.players.s.servantId = "servant.saitou";
  return { built, definitions, engine, state };
}

test("Saitou package: all three skills are FULL", () => {
  const { built } = setup("saitou-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.saitou");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(SABER).handlerId, "core.saber-magic-resistance");
  assert.equal(built.skills.get(FLAG).handlerId, "core.saitou-flag-of-sincerity");
  assert.equal(built.skills.get(FORMLESS).handlerId, "core.saitou-formlessness");
});

test("Flag of Sincerity draws two, reveals the whole hand, freely face-up plays every basic Strength/Agility card, then closes one chosen attribute", () => {
  const { engine, definitions, state } = setup("saitou-flag");
  state.players.s.mana = 0;
  createOwnedCardInstance(state, "s", { instanceId: "flag", definitionId: FLAG, zone: "servant-skills", face: "down", active: false });
  createOwnedCardInstance(state, "s", { instanceId: "strength", definitionId: "card.cardb4", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "s", { instanceId: "agility", definitionId: "card.cardq3", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "s", { instanceId: "luck", definitionId: "card.cardluck", zone: "deck", face: "down", active: false });

  let result = engine.execute(state, command(state, "saitou-flag-use", CommandType.UseSkill, "s", {
    skillId: FLAG,
    data: { abilityId: "rally-multiattack" },
  }));
  assert.equal(result.state.players.s.trueNameRevealed, true);
  assert.equal(result.state.players.s.mana, 0);
  assert.equal(result.state.cards.strength.zone, "attack");
  assert.equal(result.state.cards.strength.face, "up");
  assert.equal(result.state.cards.strength.paidCost, 0);
  assert.equal(result.state.cards.agility.zone, "attack");
  assert.equal(result.state.cards.agility.face, "up");
  assert.equal(result.state.cards.agility.paidCost, 0);
  assert.equal(result.state.cards.luck.zone, "hand");
  assert.equal(result.state.pendingDecision?.kind, "saitou-flag-close-attribute");

  result = engine.execute(result.state, command(result.state, "saitou-flag-close-strength", CommandType.ResolveDecision, "s", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["strength"],
  }));
  assert.equal(result.state.cards.strength.zone, "attack");
  assert.equal(result.state.cards.strength.face, "down");
  assert.equal(result.state.cards.strength.active, false);
  assert.equal(result.state.cards.agility.zone, "attack");
  assert.equal(result.state.cards.agility.active, true);
});

test("Formlessness zeros Agility attacks only for opponents lacking an identical active basic Agility attack", () => {
  const { engine, definitions, state } = setup("saitou-formless-agility", [{ id: "s", name: "Saitou" }, { id: "o1", name: "No Match" }, { id: "o2", name: "Match" }]);
  state.phase = "combat";
  state.players.s.locationId = "mountain";
  state.players.o1.locationId = "mountain";
  state.players.o2.locationId = "mountain";
  state.board.locations.mountain = ["s", "o1", "o2"];
  createOwnedCardInstance(state, "s", { instanceId: "sq3", definitionId: "card.cardq3", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o1", { instanceId: "o1q4", definitionId: "card.cardq4", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o2", { instanceId: "o2q3", definitionId: "card.cardq3", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o2", { instanceId: "o2q4", definitionId: "card.cardq4", zone: "attack", face: "up", active: true });

  const beforeO1 = calculateCombatCardPower(state, state.players.o1, "o1q4", definitions, "mountain");
  const beforeO2 = calculateCombatCardPower(state, state.players.o2, "o2q4", definitions, "mountain");
  assert.ok(beforeO1 > 0 && beforeO2 > 0);
  const result = engine.execute(state, command(state, "saitou-formless-agi", CommandType.UseSkill, "s", {
    skillId: FORMLESS,
    data: { abilityId: "iai-agility" },
  }));
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o1, "o1q4", definitions, "mountain"), 0);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o2, "o2q4", definitions, "mountain"), beforeO2);
});

test("Formlessness Strength repeat is independently usable for 3 mana even if Agility was not used", () => {
  const { engine, definitions, state } = setup("saitou-formless-strength");
  state.phase = "combat";
  state.players.s.mana = 3;
  state.players.s.locationId = "city";
  state.players.o.locationId = "city";
  state.board.locations.city = ["s", "o"];
  createOwnedCardInstance(state, "s", { instanceId: "sb4", definitionId: "card.cardb4", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "ob6", definitionId: "card.cardb6", zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "saitou-formless-str", CommandType.UseSkill, "s", {
    skillId: FORMLESS,
    data: { abilityId: "iai-strength" },
  }));
  assert.equal(result.state.players.s.mana, 0);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "ob6", definitions, "city"), 0);
  assert.equal(result.state.players.s.usage[`${FORMLESS}:iai-agility`], undefined);
  assert.equal(result.state.players.s.usage[`${FORMLESS}:iai-strength`]?.used, true);
});
