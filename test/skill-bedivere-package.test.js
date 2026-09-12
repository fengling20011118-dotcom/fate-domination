import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, drawCards, movePlayerCard } from "../src/rules-core/decks.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { BEDIVERE_OATH_ID, BEDIVERE_SILVER_ARM_ID } from "../src/rules-core/bedivere.ts";

const TEST_CARD = "card.test.bedivere-ability-source";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "bedivere-package") {
  const built = buildStandardContent(legacyContent);
  const cards = {
    ...built.cards,
    [TEST_CARD]: {
      id: TEST_CARD,
      version: 1,
      name: "Test Ability Source",
      cardType: "attack",
      ownerType: "common",
      cost: 0,
      basePower: 0,
      typeLabel: "特殊",
      attributes: [],
      basic: false,
      isSkill: false,
      phases: ["outpost", "action"],
      cardAbilityIds: ["test.bedivere.hostile", "test.bedivere.shuffle"],
      implementation: { level: "FULL", handlerId: "test.bedivere" },
    },
  };
  const content = { ...built, cards };
  const engine = new StandardMatchEngine(content);
  const definitions = { ...cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "b", name: "Bedivere" }, { id: "o", name: "Opponent" }], seed: 7411 });
  state.status = "playing";
  state.round = 4;
  state.turnOrder = ["b", "o"];
  state.players.b.servantId = "servant.bedivere";
  state.players.b.mana = 10;
  state.players.o.mana = 10;
  state.players.b.locationId = "mountain";
  state.players.o.locationId = "city";
  state.board.locations = { workshop: [], mountain: ["b"], city: ["o"], scouting: [] };
  state.board.outpostRecords = { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] };
  createOwnedCardInstance(state, "b", { instanceId: "oath", definitionId: BEDIVERE_OATH_ID, zone: "servant-skills", face: "down", active: false });
  createOwnedCardInstance(state, "b", { instanceId: "silver", definitionId: BEDIVERE_SILVER_ARM_ID, zone: "servant-skills", face: "down", active: false });
  createOwnedCardInstance(state, "b", { instanceId: "b-ability", definitionId: TEST_CARD, zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "o-ability", definitionId: TEST_CARD, zone: "master-skills", face: "up", active: false });
  engine.cardAbilities.register("test.bedivere.hostile", ({ state }) => {
    state.players.b.mana = 0;
    movePlayerCard(state, "b", "silver", "removed");
    const eventId = state.board.currentEvents.mountain[0];
    if (eventId) {
      state.board.currentEvents.mountain = state.board.currentEvents.mountain.filter((id) => id !== eventId);
      state.board.eventDiscard.push(eventId);
      state.board.eventVisibility[eventId] = "down";
    }
  }, { allowedZones: ["master-skills"], allowInactive: true });
  engine.cardAbilities.register("test.bedivere.shuffle", ({ state, playerId, definitions }) => {
    drawCards(state, playerId, 1, () => 0, definitions);
  }, { allowedZones: ["master-skills"], allowInactive: true });
  return { built, definitions, engine, state };
}

function addCard(state, playerId, instanceId, definitionId, zone) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face: "down", active: false });
}

test("Bedivere package is 3/3 FULL", () => {
  const { built } = setup("bedivere-full");
  const skills = [
    built.skills.get("servant.bedivere.skill.sc-bedivere-1"),
    built.skills.get(BEDIVERE_OATH_ID),
    built.skills.get(BEDIVERE_SILVER_ARM_ID),
  ];
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[1].handlerId, "core.bedivere-oath-of-protection");
  assert.equal(skills[2].handlerId, "core.bedivere-silver-arm");
  assert.deepEqual(skills[2].passiveEventTypes, ["player.deck-shuffled"]);
});

test("Oath discards one card, grants +2 and ignores an opponent ability including battlefield event mutation", () => {
  const { definitions, engine, state } = setup("bedivere-oath");
  addCard(state, "b", "oath-discard", "card.cardb1", "hand");
  const eventId = "event.fuyuki.1";
  state.board.currentEvents.mountain = [eventId];
  state.board.eventVisibility[eventId] = "up";
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "b";
  let current = engine.execute(state, command(state, "oath-use", CommandType.UseSkill, "b", {
    skillId: BEDIVERE_OATH_ID,
    data: { abilityId: "oath-protection", discardInstanceId: "oath-discard" },
  })).state;
  assert.ok(current.players.b.discard.includes("oath-discard"));
  assert.equal(calculateCombatPower(current, current.players.b, definitions, "mountain"), 2);

  const manaBefore = current.players.b.mana;
  current.phase = "action";
  current.step = "player-window";
  current.activePlayerId = "o";
  current = engine.execute(current, command(current, "hostile-use", CommandType.UseCardAbility, "o", {
    instanceId: "o-ability",
    ability: "test.bedivere.hostile",
  })).state;
  assert.equal(current.players.b.mana, manaBefore);
  assert.ok(current.players.b.servantSkills.includes("silver"));
  assert.equal(current.cards.silver.zone, "servant-skills");
  assert.deepEqual(current.board.currentEvents.mountain, [eventId]);
  assert.ok(!current.board.eventDiscard.includes(eventId));
  assert.equal(current.board.eventVisibility[eventId], "up");
});

test("automatic discard reshuffle emits a rule event and Silver Arm permanently stacks -1 total power", () => {
  const { definitions, engine, state } = setup("bedivere-shuffle");
  addCard(state, "b", "discard-a", "card.carda1", "discard");
  addCard(state, "b", "discard-b", "card.cardb1", "discard");
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "b";
  let result = engine.execute(state, command(state, "shuffle-one", CommandType.UseCardAbility, "b", {
    instanceId: "b-ability",
    ability: "test.bedivere.shuffle",
  }));
  let current = result.state;
  assert.ok(result.events.some((event) => event.type === "player.deck-shuffled" && event.payload.playerId === "b"));
  assert.equal(calculateCombatPower(current, current.players.b, definitions, "mountain"), 0);

  for (const instanceId of [...current.players.b.deck]) movePlayerCard(current, "b", instanceId, "discard");
  current.round = 5;
  current = engine.execute(current, command(current, "shuffle-two", CommandType.UseCardAbility, "b", {
    instanceId: "b-ability",
    ability: "test.bedivere.shuffle",
  })).state;
  assert.equal(calculateCombatPower(current, current.players.b, definitions, "mountain"), 0);
});

test("Grip the Sword exiles the remaining deck, joins Silver Arm for free, and reveals true name", () => {
  const { engine, state } = setup("bedivere-grip");
  addCard(state, "b", "deck-a", "card.carda1", "deck");
  addCard(state, "b", "deck-b", "card.cardb1", "deck");
  addCard(state, "b", "deck-c", "card.cardq1", "deck");
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "b";
  const manaBefore = state.players.b.mana;
  const result = engine.execute(state, command(state, "grip", CommandType.UseSkill, "b", {
    skillId: BEDIVERE_SILVER_ARM_ID,
    data: { abilityId: "grip-the-sword" },
  }));
  const current = result.state;
  assert.equal(current.players.b.deck.length, 0);
  assert.ok(["deck-a", "deck-b", "deck-c"].every((id) => current.cards[id].zone === "removed"));
  assert.ok(current.players.b.attack.includes("silver"));
  assert.equal(current.cards.silver.active, true);
  assert.equal(current.cards.silver.face, "up");
  assert.equal(current.players.b.mana, manaBefore);
  assert.equal(current.players.b.trueNameRevealed, true);
  assert.ok(result.events.some((event) => event.type === "servant.true-name-revealed" && event.payload.playerId === "b"));
});
