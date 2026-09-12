import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { listUnusedRandomServantIds } from "../src/rules-core/identity-replacement.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  SHINJI_ASCENSION_ID,
  SHINJI_BOOK_ID,
  SHINJI_HANDLER,
  SHINJI_UNWORTHY_ID,
  useShinjiBook,
} from "../src/rules-core/shinji.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const runtimeCatalog = {
  servantDecks: Object.fromEntries(legacyContent.servants.map((servant) => [servant.id, [...servant.deck]])),
  skillDefinitions: built.skills.list(),
  masterInitialMana: Object.fromEntries(legacyContent.masters.map((master) => [master.id, Number(master.initialMana ?? 4)])),
};

function skill(id) { return built.skills.get(id); }

function setup(gameInstanceId = "shinji") {
  const state = createGameState({
    gameInstanceId,
    players: [{ id: "s", name: "Shinji" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    seed: 971,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "a", "b"];
  state.players.s.masterId = "master.shinji";
  state.players.s.servantId = "servant.saber";
  state.players.s.flags.firstMasterId = "master.shinji";
  state.players.s.flags.firstServantId = "servant.saber";
  state.players.s.mana = 11;
  state.players.s.commandSeals = 3;
  state.players.s.victoryPoints = 7;
  state.players.a.masterId = "master.rin";
  state.players.a.servantId = "servant.gil";
  state.players.b.masterId = "master.kirei";
  state.players.b.servantId = "servant.cu";
  for (const player of Object.values(state.players)) player.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["s", "a", "b"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return state;
}

function add(state, playerId, instanceId, definitionId, zone, options = {}) {
  return createOwnedCardInstance(state, playerId, {
    instanceId, definitionId, zone, face: zone === "master-skills" ? "up" : "down", active: false, ...options,
  });
}

function context(state, skillDefinition, payload, extra = {}) {
  return {
    state,
    player: state.players.s,
    skill: skillDefinition,
    payload,
    definitions,
    runtimeCatalog,
    randomInt: () => 0,
    openDecision() {},
    ...extra,
  };
}

function addShinjiBookPackage(state) {
  add(state, "s", "s:unworthy", SHINJI_UNWORTHY_ID, "master-skills", { originMasterId: "master.shinji" });
  add(state, "s", "s:book", SHINJI_BOOK_ID, "master-skills", { originMasterId: "master.shinji" });
  add(state, "s", "s:ascension", SHINJI_ASCENSION_ID, "master-skills", { originMasterId: "master.shinji" });
}

test("Shinji package is 5/5 FULL and the replacement cards use a dedicated handler", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.shinji");
  assert.equal(skills.length, 5);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  for (const id of [SHINJI_UNWORTHY_ID, SHINJI_BOOK_ID, SHINJI_ASCENSION_ID]) {
    const candidate = skill(id);
    assert.equal(candidate.handlerId, SHINJI_HANDLER);
    assert.equal(built.skills.hasHandler(id), true);
    assert.deepEqual(candidate.rules?.ambiguities ?? [], []);
    assert.deepEqual(candidate.rules?.unmodeledClauses ?? [], []);
  }
});

test("Sakura already being in the game forces Second Contract without a choice", () => {
  const state = setup("shinji-sakura-present");
  state.players.a.masterId = "master.sakura";
  let opened = false;
  const result = useShinjiBook(context(state, skill(SHINJI_UNWORTHY_ID), { eventType: "game.started", event: {} }, { openDecision() { opened = true; } }));
  assert.equal(opened, false);
  assert.equal(result.mode, "second-contract");
  assert.equal(state.players.s.flags.shinjiBookMode, "second-contract");
});

test("Replacement resolves after the first zero-seal event, changes Master to Sakura, resets mana and adds two seals while preserving VP", () => {
  const state = setup("shinji-replacement");
  addShinjiBookPackage(state);
  state.players.s.flags.shinjiBookMode = "replacement";
  state.players.s.commandSeals = 0;
  useShinjiBook(context(state, skill(SHINJI_BOOK_ID), {
    eventType: "player.command-seals.changed",
    event: { playerId: "s", before: 1, after: 0, delta: -1 },
  }));
  assert.equal(state.players.s.flags.shinjiBookPendingRound, 4);
  state.players.s.commandSeals = 1; // e.g. Contain Neutral Threat ruling: later gain does not cancel the replacement.
  const result = useShinjiBook(context(state, skill(SHINJI_BOOK_ID), { eventType: "round.ending", event: { round: 4 } }));
  assert.equal(result.mode, "replacement");
  assert.equal(state.players.s.masterId, "master.sakura");
  assert.equal(state.players.s.mana, 4);
  assert.equal(state.players.s.commandSeals, 3);
  assert.equal(state.players.s.victoryPoints, 7);
  assert.equal(state.players.s.flags.firstMasterId, "master.shinji");
  assert.ok(state.players.s.masterSkills.some((id) => state.cards[id]?.definitionId === "master.sakura.skill.s1"));
  assert.ok(["s:unworthy", "s:book", "s:ascension"].every((id) => state.cards[id].zone === "removed"));
  assert.equal(state.players.s.servantId, "servant.saber");
});

test("Second Contract replaces only the old Servant package, preserves later-added cards and never selects replacement-only Albion", () => {
  const state = setup("shinji-contract");
  addShinjiBookPackage(state);
  state.players.s.flags.shinjiBookMode = "second-contract";
  state.players.s.flags.shinjiBookTriggered = true;
  state.players.s.flags.shinjiBookPendingRound = 4;
  state.players.s.commandSeals = 0;
  add(state, "s", "s:old-deck", "card.carda1", "deck", { originServantId: "servant.saber" });
  add(state, "s", "s:old-skill", "servant.saber.skill.sc-saber-1", "servant-skills", { originServantId: "servant.saber" });
  add(state, "s", "s:later", "card.cardluck", "deck");
  const expected = listUnusedRandomServantIds(state, runtimeCatalog)[0];
  assert.ok(expected);
  assert.notEqual(expected, "servant.albion");
  const result = useShinjiBook(context(state, skill(SHINJI_BOOK_ID), { eventType: "round.ending", event: { round: 4 } }));
  assert.equal(result.mode, "second-contract");
  assert.equal(state.players.s.servantId, expected);
  assert.equal(state.players.s.commandSeals, 3);
  assert.equal(state.players.s.flags.firstServantId, "servant.saber");
  assert.equal(state.players.s.flags.servantReplacementCount, 1);
  assert.equal(state.cards["s:old-deck"].zone, "removed");
  assert.equal(state.cards["s:old-skill"].zone, "removed");
  assert.equal(state.cards["s:later"].zone, "deck");
  assert.ok(state.players.s.deck.includes("s:later"));
  assert.ok(state.players.s.servantSkills.length > 0);
  assert.ok(state.players.s.servantSkills.every((id) => state.cards[id].face === "down"));
});

test("Cancerous Vessel ordinary branch removes the Book and gains 8 VP at the start of Climax", () => {
  const state = setup("shinji-cancer-vp");
  addShinjiBookPackage(state);
  state.round = 9;
  state.players.s.servantId = "servant.saber";
  const before = state.players.s.victoryPoints;
  const result = useShinjiBook(context(state, skill(SHINJI_ASCENSION_ID), { eventType: "round.started", event: { round: 9 } }));
  assert.equal(result.branch, "gain-vp");
  assert.equal(state.players.s.victoryPoints, before + 8);
  assert.equal(state.cards["s:book"].zone, "removed");
  assert.notEqual(state.players.s.flags.shinjiCancerousVesselDrainActive, true);
});

test("Cancerous Vessel Shakespeare branch gives +12 only in Miyama and mirrors Shinji VP gains as opponent VP loss there", () => {
  const state = setup("shinji-cancer-shakespeare");
  addShinjiBookPackage(state);
  state.round = 9;
  state.players.s.servantId = "servant.shakespeare";
  state.players.s.flags.firstServantId = "servant.shakespeare";
  state.players.s.flags.servantReplacementCount = 0;
  state.players.s.victoryPoints = 0;
  state.players.a.victoryPoints = 5;
  state.players.b.victoryPoints = 2;
  state.players.b.locationId = "city";
  state.board.locations.mountain = ["s", "a"];
  state.board.locations.city = ["b"];
  const beforePower = calculateCombatPower(state, state.players.s, definitions, "mountain");
  const result = useShinjiBook(context(state, skill(SHINJI_ASCENSION_ID), { eventType: "round.started", event: { round: 9 } }));
  assert.equal(result.branch, "shakespeare");
  assert.equal(state.cards["s:book"].zone, "removed");
  assert.equal(state.players.s.flags.shinjiCancerousVesselDrainActive, true);
  assert.equal(calculateCombatPower(state, state.players.s, definitions, "mountain"), beforePower + 12);
  state.players.s.locationId = "city";
  assert.equal(calculateCombatPower(state, state.players.s, definitions, "city"), beforePower);
  state.players.s.locationId = "mountain";
  useShinjiBook(context(state, skill(SHINJI_ASCENSION_ID), {
    eventType: "player.victory-points.changed",
    event: { playerId: "s", before: 0, after: 3, delta: 3 },
  }));
  assert.equal(state.players.a.victoryPoints, 2);
  assert.equal(state.players.b.victoryPoints, 2);
});
