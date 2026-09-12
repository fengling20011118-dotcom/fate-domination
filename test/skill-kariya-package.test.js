import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { useKariyaCollapse } from "../src/rules-core/skill-handlers.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const BROKEN = "master.kariya.skill.s4";
const BATTERY = "master.kariya.skill.ascension";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "kariya") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "k", name: "Kariya" }, { id: "n", name: "Nemesis" }], seed: 7701 });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "k";
  state.turnOrder = ["k", "n"];
  state.players.k.masterId = "master.kariya";
  state.players.k.locationId = "workshop";
  state.players.n.locationId = "city";
  state.board.locations.workshop = ["k"];
  state.board.locations.mountain = [];
  state.board.locations.city = ["n"];
  state.board.locations.scouting = [];
  state.players.k.flags.kariyaNemesisPlayerId = "n";
  return { built, definitions, engine, state };
}

test("Kariya package: all five skills are FULL", () => {
  const { built } = setup("kariya-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.kariya");
  assert.equal(skills.length, 5);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(BROKEN).handlerId, "core.kariya-collapse");
  assert.equal(built.skills.get(BATTERY).handlerId, "core.kariya-human-battery");
  assert.equal(built.skills.get(BATTERY).abilities.find((ability) => ability.id === "human-battery-top-card")?.abilityCost, 6);
});

test("Broken randomly reveals an attack, forces it into the regular pair, and grants +3 power", () => {
  const { built, definitions, engine, state } = setup("kariya-broken");
  state.players.k.flags.kariyaCollapse = true;
  createOwnedCardInstance(state, "k", { instanceId: "forced", definitionId: "card.cardb2", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "k", { instanceId: "other", definitionId: "card.cardq2", zone: "hand", face: "down", active: false });
  const skill = built.skills.get(BROKEN);
  useKariyaCollapse({ state, player: state.players.k, skill, payload: { eventType: "round.started" }, definitions, randomInt: () => 0, openDecision: () => {}, emitEvent: () => {} });
  assert.equal(state.players.k.flags.forcedStandardAttackInstanceId, "forced");
  assert.equal(state.players.k.flags.forcedStandardAttackRound, 5);
  assert.ok(state.cards.forced.powerModifiers.some((modifier) => modifier.sourceId === BROKEN && modifier.value === 3));

  state.step = "play-batch-draft";
  state.players.k.locationId = "workshop";
  state.players.k.mana = 12;
  assert.throws(() => engine.execute(state, command(state, "broken-missing", CommandType.CommitAttack, "k", {
    faceUpInstanceIds: ["other"], faceDownInstanceIds: [],
  })), /FORCED_STANDARD_ATTACK_REQUIRED/);

  const result = engine.execute(state, command(state, "broken-play", CommandType.CommitAttack, "k", {
    faceUpInstanceIds: ["forced", "other"], faceDownInstanceIds: [],
  }));
  assert.equal(result.state.players.k.flags.forcedStandardAttackInstanceId, undefined);
  assert.equal(result.state.cards.forced.zone, "attack");
  assert.equal(calculateCombatCardPower(result.state, result.state.players.k, "forced", definitions), definitions["card.cardb2"].basePower + 3);
});

test("Human Battery gives basic attacks +3 cost and +4 power while the ascension card is owned", () => {
  const { definitions, state } = setup("kariya-battery-aura");
  createOwnedCardInstance(state, "k", { instanceId: "battery", definitionId: BATTERY, zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(state, "k", { instanceId: "basic", definitionId: "card.cardb2", zone: "attack", face: "up", active: true });
  const definition = definitions["card.cardb2"];
  assert.equal(getCardPlayCost(state, definition, state.players.k, state.cards.basic, definitions), definition.cost + 3);
  assert.equal(calculateCombatCardPower(state, state.players.k, "basic", definitions), definition.basePower + 4);
});

test("Human Battery uses the English-original 6 mana cost and joins the deck top while Broken", () => {
  const { engine, state } = setup("kariya-battery-top");
  createOwnedCardInstance(state, "k", { instanceId: "battery", definitionId: BATTERY, zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(state, "k", { instanceId: "top", definitionId: "card.cardq2", zone: "deck", face: "down", active: false });
  state.players.k.flags.kariyaCollapse = true;
  state.players.k.mana = 6;
  const result = engine.execute(state, command(state, "battery-top", CommandType.UseSkill, "k", {
    skillId: BATTERY,
    data: { abilityId: "human-battery-top-card" },
  }));
  assert.equal(result.state.players.k.mana, 0);
  assert.equal(result.state.cards.top.zone, "attack");
  assert.equal(result.state.cards.top.active, true);
  assert.equal(result.state.cards.top.paidCost, 0);
});

test("Human Battery may move Kariya from Workshop to the Nemesis battlefield during combat", () => {
  const { engine, state } = setup("kariya-battery-move");
  createOwnedCardInstance(state, "k", { instanceId: "battery", definitionId: BATTERY, zone: "master-skills", face: "up", active: false });
  state.phase = "combat";
  state.step = "player-window";
  const result = engine.execute(state, command(state, "battery-move", CommandType.UseSkill, "k", {
    skillId: BATTERY,
    data: { abilityId: "human-battery-nemesis-move" },
  }));
  assert.equal(result.state.players.k.locationId, "city");
  assert.ok(result.state.board.locations.city.includes("k"));
  assert.ok(!result.state.board.locations.workshop.includes("k"));
  assert.ok(result.events.some((event) => event.type === "player.moved" && event.payload?.playerId === "k"));
});
