import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, placeOwnedCardOnBoard } from "../src/rules-core/decks.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { movePlayerByEffect } from "../src/rules-core/board.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { OZY_DENDERA_ID, OZY_RAMESSEUM_ID } from "../src/rules-core/ozymandias.ts";

const SPHINX_ID = "servant.ozymandias.skill.sc-ozymandias-2";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "ozy-package") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions(),
    "card.test.special": { id: "card.test.special", name: "Special Test", cost: 10, basePower: 1, typeLabel: "特殊", attributes: ["特殊"] },
    "card.test.normal": { id: "card.test.normal", name: "Normal Test", cost: 10, basePower: 1, typeLabel: "力量", attributes: ["力量"] },
  };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "o", name: "Ozymandias" }, { id: "p", name: "Opponent" }], seed: 1772 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "o";
  state.players.o.servantId = "servant.ozymandias";
  state.players.o.mana = 20;
  state.players.o.locationId = "mountain";
  state.players.p.locationId = "mountain";
  state.board.locations.mountain = ["o", "p"];
  createOwnedCardInstance(state, "o", { instanceId: "temple", definitionId: OZY_RAMESSEUM_ID, zone: "servant-skills", face: "up", active: false });
  return { built, engine, definitions, state };
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

test("Ozymandias package is 3/3 FULL and Dendera is a standard append", () => {
  const { built } = setup("ozy-full");
  const skills = [OZY_RAMESSEUM_ID, SPHINX_ID, OZY_DENDERA_ID].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[0].handlerId, "core.ozymandias-ramesseum");
  assert.equal(skills[0].abilities[0].abilityCost, 4);
  assert.equal(skills[2].handlerId, "core.ozymandias-dendera");
  assert.equal(skills[2].standardAppend, true);
  assert.equal(skills[2].revealsTrueNameOnPlay, true);
});

test("Ramesseum pays exactly 4 mana, becomes one physical board card, and can be reattached on a later round", () => {
  const { engine, state } = setup("ozy-temple-attach");
  const before = state.players.o.mana;
  let result = engine.execute(state, command(state, "attach-mountain", CommandType.UseSkill, "o", {
    skillId: OZY_RAMESSEUM_ID,
    data: { abilityId: "ramesseum-attach" },
  }));
  assert.equal(result.state.players.o.mana, before - 4);
  assert.equal(result.state.cards.temple.zone, "board");
  assert.equal(result.state.cards.temple.boardLocationId, "mountain");
  assert.equal(result.state.cards.temple.boardOpponentCardCostAura.amount, 3);

  result.state.round += 1;
  result.state.board.locations.mountain = ["p"];
  result.state.board.locations.city = ["o"];
  result.state.players.o.locationId = "city";
  result.state.players.p.locationId = "mountain";
  result.state.phase = "action";
  result.state.step = "player-window";
  result.state.activePlayerId = "o";
  const secondBefore = result.state.players.o.mana;
  result = engine.execute(result.state, command(result.state, "reattach-city", CommandType.UseSkill, "o", {
    skillId: OZY_RAMESSEUM_ID,
    data: { abilityId: "ramesseum-attach" },
  }));
  assert.equal(result.state.players.o.mana, secondBefore - 4);
  assert.equal(result.state.cards.temple.boardLocationId, "city");
  assert.equal(Object.values(result.state.cards).filter((card) => card.definitionId === OZY_RAMESSEUM_ID).length, 1);
});

test("Ramesseum raises opponent Special/NP costs by 3 to max 12 even when Ozymandias is elsewhere", () => {
  const { engine, definitions, state } = setup("ozy-temple-cost");
  let result = engine.execute(state, command(state, "attach-cost", CommandType.UseSkill, "o", {
    skillId: OZY_RAMESSEUM_ID,
    data: { abilityId: "ramesseum-attach" },
  }));
  createOwnedCardInstance(result.state, "p", { instanceId: "special", definitionId: "card.test.special", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(result.state, "p", { instanceId: "normal", definitionId: "card.test.normal", zone: "hand", face: "down", active: false });
  const special = result.state.cards.special;
  const normal = result.state.cards.normal;
  assert.equal(getCardPlayCost(result.state, definitions["card.test.special"], result.state.players.p, special, definitions), 12);
  assert.equal(getCardPlayCost(result.state, definitions["card.test.normal"], result.state.players.p, normal, definitions), 10);

  result.state.board.locations.mountain = ["p"];
  result.state.board.locations.city = ["o"];
  result.state.players.o.locationId = "city";
  assert.equal(getCardPlayCost(result.state, definitions["card.test.special"], result.state.players.p, special, definitions), 12);
});

test("Ramesseum movement lock applies only while its owner is physically at the attached battlefield", () => {
  const { engine, definitions, state } = setup("ozy-temple-move");
  state.board.locations.mountain = ["o"];
  state.board.locations.city = ["p"];
  state.players.p.locationId = "city";
  let result = engine.execute(state, command(state, "attach-lock", CommandType.UseSkill, "o", {
    skillId: OZY_RAMESSEUM_ID,
    data: { abilityId: "ramesseum-attach" },
  }));
  assert.throws(() => movePlayerByEffect(result.state, "p", "mountain", definitions), /MOVEMENT_BLOCKED_BY_BOARD_CARD/);

  result.state.board.locations.mountain = [];
  result.state.board.locations.city = ["p", "o"];
  result.state.players.o.locationId = "city";
  assert.doesNotThrow(() => movePlayerByEffect(result.state, "p", "mountain", definitions));
});

test("Dendera stays active with Ramesseum at another location and returns that temple after combat", () => {
  const { engine, definitions, state } = setup("ozy-dendera-return");
  state.board.locations.mountain = ["o", "p"];
  placeOwnedCardOnBoard(state, "o", "temple", "city");
  state.cards.temple.boardOpponentCardCostAura = { attributesAny: ["特殊", "宝具"], amount: 3, max: 12 };
  state.cards.temple.boardOpponentMovementLockWhileOwnerPresent = true;
  createOwnedCardInstance(state, "o", { instanceId: "dendera", definitionId: OZY_DENDERA_ID, zone: "attack", face: "up", active: true });
  state.cards.dendera.playedRound = state.round;

  emitPassive(engine, state, definitions, "card.played", { playerId: "o", instanceId: "dendera", definitionId: OZY_DENDERA_ID, face: "up", paidMana: 0 });
  assert.equal(state.cards.dendera.zone, "attack");
  assert.equal(state.players.o.flags.ozymandiasDenderaTempleInstanceId, "temple");
  emitPassive(engine, state, definitions, "combat.ending", { round: state.round, previousLocations: { o: "mountain", p: "mountain" } });
  assert.equal(state.cards.temple.zone, "servant-skills");
  assert.equal(state.cards.temple.boardLocationId, undefined);
  assert.equal(state.cards.temple.boardOpponentCardCostAura, undefined);
  assert.ok(state.players.o.servantSkills.includes("temple"));
});

test("Dendera immediately deactivates when no Ramesseum is controlled at another location", () => {
  const { engine, definitions, state } = setup("ozy-dendera-close");
  createOwnedCardInstance(state, "o", { instanceId: "dendera", definitionId: OZY_DENDERA_ID, zone: "attack", face: "up", active: true });
  state.cards.dendera.playedRound = state.round;
  emitPassive(engine, state, definitions, "card.played", { playerId: "o", instanceId: "dendera", definitionId: OZY_DENDERA_ID, face: "up", paidMana: 0 });
  assert.equal(state.cards.dendera.zone, "servant-skills");
  assert.equal(state.cards.dendera.active, false);
  assert.equal(state.players.o.flags.ozymandiasDenderaTempleInstanceId, undefined);
});
