import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import {
  AMAKUSA_ASCENSION_ID,
  AMAKUSA_VASSAL_ID,
  FIRST_FOLIO_ID,
  useAmakusaPastRuler,
  useAmakusaVassal,
} from "../src/rules-core/amakusa-master.ts";
import { deployPlayer, movePlayerByEffect } from "../src/rules-core/board.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { payManaCost } from "../src/rules-core/costs.ts";
import { closePlayerCard, createOwnedCardInstance } from "../src/rules-core/decks.ts";
import {
  clearCommandManaContribution,
  finishCommandManaContribution,
  prepareCommandManaContribution,
} from "../src/rules-core/linked-player-rules.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const vassalSkill = built.skills.get(AMAKUSA_VASSAL_ID);
const ascensionSkill = built.skills.get(AMAKUSA_ASCENSION_ID);

function fresh(id = "amakusa") {
  const state = createGameState({
    gameInstanceId: id,
    players: [
      { id: "a", name: "Amakusa" },
      { id: "v", name: "Vassal" },
      { id: "o", name: "Opponent" },
    ],
    seed: 4242,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "v";
  state.players.a.masterId = "master.amakusa";
  state.players.a.statuses.push("role:red-team-leader");
  state.players.v.statuses.push("role:god-servant", "history:god-servant");
  state.players.a.commandSeals = 3;
  state.players.v.commandSeals = 3;
  state.players.o.commandSeals = 3;
  useAmakusaVassal({
    state,
    player: state.players.a,
    skill: vassalSkill,
    payload: { eventType: "game.started", event: {} },
    definitions,
    openDecision: () => {},
  });
  return state;
}

function putPlayer(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.board.locations[locationId].push(playerId);
  state.players[playerId].locationId = locationId;
}

test("Amakusa Master package is 5/5 FULL with executable handlers", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.amakusa");
  assert.equal(skills.length, 5);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(vassalSkill.handlerId, "core.amakusa-vassal");
  assert.equal(ascensionSkill.handlerId, "core.amakusa-past-ruler");
  assert.equal(vassalSkill.limit, undefined, "once-per-round belongs only to linked mana contribution, not the whole card");
});

test("before climax a Vassal pays one Command Seal to enter Amakusa battlefield; failure is atomic and climax waives it", () => {
  const state = fresh("amakusa-entry");
  putPlayer(state, "a", "mountain");
  state.players.v.locationId = null;
  state.players.v.commandSeals = 1;
  deployPlayer(state, "v", "mountain", definitions);
  assert.equal(state.players.v.commandSeals, 0);
  assert.equal(state.players.v.locationId, "mountain");
  assert.equal(state.players.v.flags.commandSealUsedRound, undefined, "entry seal is a cost, not a Command Seal ability use");

  const blocked = fresh("amakusa-entry-blocked");
  putPlayer(blocked, "a", "city");
  blocked.players.v.locationId = null;
  blocked.players.v.commandSeals = 0;
  assert.throws(() => deployPlayer(blocked, "v", "city", definitions), /COMMAND_SEAL_NOT_AVAILABLE/);
  assert.equal(blocked.players.v.locationId, null);
  assert.equal(blocked.board.locations.city.includes("v"), false);

  const climax = fresh("amakusa-entry-climax");
  putPlayer(climax, "a", "city");
  putPlayer(climax, "v", "mountain");
  climax.players.v.commandSeals = 0;
  climax.modeState.currentSituationClimax = true;
  movePlayerByEffect(climax, "v", "city", definitions);
  assert.equal(climax.players.v.commandSeals, 0);
  assert.equal(climax.players.v.locationId, "city");
});

test("different-battlefield mana contribution is explicit, once per round, and records each actual payer", () => {
  const state = fresh("amakusa-mana");
  putPlayer(state, "a", "city");
  putPlayer(state, "v", "mountain");
  state.players.a.mana = 1;
  state.players.v.mana = 3;

  prepareCommandManaContribution(state, "v", { manaContribution: { contributorPlayerId: "a", amount: 1 } });
  payManaCost(state, state.players.v, 4, definitions);
  finishCommandManaContribution(state);
  assert.equal(state.players.v.mana, 0);
  assert.equal(state.players.a.mana, 0);
  const ledger = state.modeState.manaSpendLedger;
  assert.deepEqual(ledger.slice(-2).map(({ playerId, amount }) => ({ playerId, amount })), [
    { playerId: "v", amount: 3 },
    { playerId: "a", amount: 1 },
  ]);

  state.players.a.mana = 1;
  state.players.v.mana = 4;
  prepareCommandManaContribution(state, "v", { manaContribution: { contributorPlayerId: "a", amount: 1 } });
  assert.throws(() => payManaCost(state, state.players.v, 4, definitions), /MANA_CONTRIBUTION_ROUND_LIMIT_REACHED/);
  assert.equal(state.players.v.mana, 4);
  assert.equal(state.players.a.mana, 1);
  clearCommandManaContribution(state);

  state.round += 1;
  putPlayer(state, "a", "mountain");
  state.players.a.mana = 1;
  state.players.v.mana = 4;
  prepareCommandManaContribution(state, "v", { manaContribution: { contributorPlayerId: "a", amount: 1 } });
  assert.throws(() => payManaCost(state, state.players.v, 4, definitions), /MANA_CONTRIBUTION_NOT_ALLOWED/);
  assert.equal(state.players.v.mana, 4);
  assert.equal(state.players.a.mana, 1);
  clearCommandManaContribution(state);
});

test("a Vassal and Amakusa winning different fights gain 1 VP each exactly once per pair per round", () => {
  const state = fresh("amakusa-vp");
  state.players.a.victoryPoints = 5;
  state.players.v.victoryPoints = 7;
  useAmakusaVassal({
    state,
    player: state.players.a,
    skill: vassalSkill,
    payload: { eventType: "combat.resolved", event: { locationId: "mountain", winnerIds: ["v"] } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(state.players.a.victoryPoints, 5);
  assert.equal(state.players.v.victoryPoints, 7);
  useAmakusaVassal({
    state,
    player: state.players.a,
    skill: vassalSkill,
    payload: { eventType: "combat.resolved", event: { locationId: "city", winnerIds: ["a"] } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(state.players.a.victoryPoints, 6);
  assert.equal(state.players.v.victoryPoints, 8);
  useAmakusaVassal({
    state,
    player: state.players.a,
    skill: vassalSkill,
    payload: { eventType: "combat.resolved", event: { locationId: "city", winnerIds: ["a"] } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(state.players.a.victoryPoints, 6);
  assert.equal(state.players.v.victoryPoints, 8);
});

test("Past Ruler removes two seals on unlock and grants +4 to basics only while First Folio is active", () => {
  const state = fresh("amakusa-ascension");
  state.phase = "combat";
  state.activePlayerId = "a";
  putPlayer(state, "a", "mountain");
  state.players.v.commandSeals = 1;
  state.players.o.commandSeals = 3;
  createOwnedCardInstance(state, "a", {
    instanceId: "a:amakusa-ascension",
    definitionId: AMAKUSA_ASCENSION_ID,
    zone: "master-skills",
    face: "up",
  });
  createOwnedCardInstance(state, "a", {
    instanceId: "a:first-folio",
    definitionId: FIRST_FOLIO_ID,
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "a", {
    instanceId: "a:basic",
    definitionId: "card.cardb2",
    zone: "attack",
    face: "up",
    active: true,
  });
  const before = calculateCombatCardPower(state, state.players.a, "a:basic", definitions, "mountain");
  useAmakusaPastRuler({
    state,
    player: state.players.a,
    skill: ascensionSkill,
    payload: { eventType: "skill.unlocked", event: { playerId: "a", skillId: AMAKUSA_ASCENSION_ID } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(state.players.v.commandSeals, 0);
  assert.equal(state.players.o.commandSeals, 1);
  assert.equal(calculateCombatCardPower(state, state.players.a, "a:basic", definitions, "mountain"), before + 4);

  closePlayerCard(state, "a", "a:first-folio", definitions);
  assert.equal(calculateCombatCardPower(state, state.players.a, "a:basic", definitions, "mountain"), before);
});
