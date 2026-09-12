import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { calculateCombatCardBasePower } from "../src/rules-core/combat-power.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { BRYNHILDR_BELOVED_FLAG, BRYNHILDR_BRIDESMAID_ID, BRYNHILDR_ROMANTIA_ID } from "../src/rules-core/brynhildr.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "brynhildr-package") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "b", name: "Brynhildr" }, { id: "l", name: "Beloved" }, { id: "o", name: "Other" }],
    seed: 8801,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "b";
  state.turnOrder = ["b", "l", "o"];
  state.players.b.servantId = "servant.brynhildr";
  state.players.b.mana = 12;
  state.players.b.commandSeals = 3;
  state.players.l.mana = 12;
  state.players.o.mana = 12;
  state.players.b.locationId = "mountain";
  state.players.l.locationId = "city";
  state.players.o.locationId = "city";
  state.board.locations = { workshop: [], mountain: ["b"], city: ["l", "o"], scouting: [] };
  state.board.outpostRecords = { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] };
  createOwnedCardInstance(state, "b", { instanceId: "bridesmaid", definitionId: BRYNHILDR_BRIDESMAID_ID, zone: "servant-skills", face: "down", active: false });
  createOwnedCardInstance(state, "b", { instanceId: "romantia", definitionId: BRYNHILDR_ROMANTIA_ID, zone: "servant-skills", face: "down", active: false });
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

test("Brynhildr package is 3/3 FULL", () => {
  const { built } = setup("brynhildr-full");
  const skills = [
    built.skills.get("servant.brynhildr.skill.sc-brynhildr-1"),
    built.skills.get(BRYNHILDR_BRIDESMAID_ID),
    built.skills.get(BRYNHILDR_ROMANTIA_ID),
  ];
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[1].handlerId, "core.brynhildr-hero-bridesmaid");
  assert.equal(skills[2].handlerId, "core.card-play");
  assert.equal(skills[2].revealsTrueNameOnPlay, true);
});

test("Hero's Bridesmaid chooses the first beloved for free and spends one Command Seal when replacing them", () => {
  const { engine, state } = setup("brynhildr-beloved");
  let result = engine.execute(state, command(state, "beloved-open", CommandType.UseSkill, "b", {
    skillId: BRYNHILDR_BRIDESMAID_ID,
    data: { abilityId: "choose-beloved" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "brynhildr-beloved");
  result = engine.execute(result.state, command(result.state, "beloved-first", CommandType.ResolveDecision, "b", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["l"],
  }));
  assert.equal(result.state.players.b.flags[BRYNHILDR_BELOVED_FLAG], "l");
  assert.equal(result.state.players.b.commandSeals, 3);

  // Phase abilities follow the universal once-per-round rule, so replacement
  // is tested in the next round rather than bypassing the shared usage boundary.
  result.state.round = 5;
  result = engine.execute(result.state, command(result.state, "beloved-reopen", CommandType.UseSkill, "b", {
    skillId: BRYNHILDR_BRIDESMAID_ID,
    data: { abilityId: "choose-beloved" },
  }));
  result = engine.execute(result.state, command(result.state, "beloved-replace", CommandType.ResolveDecision, "b", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["o"],
  }));
  assert.equal(result.state.players.b.flags[BRYNHILDR_BELOVED_FLAG], "o");
  assert.equal(result.state.players.b.commandSeals, 2);
  assert.equal(result.state.players.b.flags.commandSealUsedRound, 5);
});

test("Brynhildr's Noble Phantasm doubles cost/base power and changes Agility to Strength only while sharing the beloved's battlefield", () => {
  const { definitions, state } = setup("brynhildr-romantia");
  const player = state.players.b;
  const card = state.cards.romantia;
  const definition = definitions[BRYNHILDR_ROMANTIA_ID];
  player.flags[BRYNHILDR_BELOVED_FLAG] = "l";

  assert.equal(getCardPlayCost(state, definition, player, card, definitions), 4);
  assert.equal(calculateCombatCardBasePower(state, player, "romantia", definitions), 9);
  assert.deepEqual(new Set(getCardInstanceAttributes(card, definition, state, definitions)), new Set(["迅捷", "宝具"]));

  state.board.locations.mountain = [];
  state.board.locations.city = ["b", "l", "o"];
  player.locationId = "city";
  assert.equal(getCardPlayCost(state, definition, player, card, definitions), 8);
  assert.equal(calculateCombatCardBasePower(state, player, "romantia", definitions), 18);
  assert.deepEqual(new Set(getCardInstanceAttributes(card, definition, state, definitions)), new Set(["力量", "宝具"]));

  // The cost is evaluated when paid: the card can be paid for elsewhere at 4,
  // then moving to the beloved's battlefield changes its live power/attributes.
  player.locationId = "mountain";
  state.board.locations.mountain = ["b"];
  state.board.locations.city = ["l", "o"];
  assert.equal(getCardPlayCost(state, definition, player, card, definitions), 4);
  player.locationId = "city";
  state.board.locations.mountain = [];
  state.board.locations.city = ["b", "l", "o"];
  assert.equal(calculateCombatCardBasePower(state, player, "romantia", definitions), 18);
});

test("Hero's Bridesmaid awards +1 for beloved-only victory and +3 when both win different fights in the same round", () => {
  const { engine, definitions, state } = setup("brynhildr-reward");
  state.players.b.flags[BRYNHILDR_BELOVED_FLAG] = "l";
  emitPassive(engine, state, definitions, "combat.ending", {
    round: 4,
    previousLocations: { b: "mountain", l: "city", o: "city" },
    combatWinnerIdsByLocation: { mountain: ["o"], city: ["l"] },
  });
  assert.equal(state.players.b.victoryPoints, 1);

  emitPassive(engine, state, definitions, "combat.ending", {
    round: 4,
    previousLocations: { b: "mountain", l: "city", o: "city" },
    combatWinnerIdsByLocation: { mountain: ["b"], city: ["l"] },
  });
  assert.equal(state.players.b.victoryPoints, 4);
});
