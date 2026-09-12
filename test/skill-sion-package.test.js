import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { isCardTextSuppressed } from "../src/rules-core/card-text.ts";
import { getEffectiveCardCost, getCardRulePowerAdd } from "../src/rules-core/card-rule-modifiers.ts";
import { listRulerSealsOnPlayer } from "../src/rules-core/ruler-seals.ts";
import { getMoonCellState, setMoonCellState } from "../src/rules-core/moon-cell.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  SION_BLACK_BARREL_ABILITY,
  SION_BLACK_BARREL_ID,
  SION_CAFETERIA_ABILITY,
  SION_CAFETERIA_ID,
  SION_GYM_ID,
  SION_HANDLER,
  SION_LIBRARY_ID,
  SION_MOON_CANCER_ID,
  SION_REBOOT_ABILITY,
  SION_RULER_ABILITY,
  SION_RULER_ID,
  SION_TRAIN_ABILITY,
  SION_TRAINING_ID,
  getSionRuntimeState,
  resolveSionDecision,
  useSionPackage,
} from "../src/rules-core/sion.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const runtimeCatalog = {
  servantDecks: built.playerDecks,
  servantClasses: built.servantClasses ?? {},
  skillDefinitions: built.skills.list(),
  masterInitialMana: built.masterInitialMana ?? {},
};
const servantId = "servant.cu";
const servantSkillDefs = built.skills.list().filter((skill) => skill.ownerId === servantId).slice(0, 3);

function setup(id = "sion") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "s", name: "Sion" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    seed: 31415,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "preparation";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "a", "b"];
  state.players.s.masterId = "master.sion";
  state.players.s.servantId = servantId;
  state.players.a.servantId = "servant.gil";
  state.players.b.servantId = "servant.emiya";
  for (const player of Object.values(state.players)) {
    player.locationId = "mountain";
    player.mana = 0;
  }
  state.board.locations.mountain = ["s", "a", "b"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  for (const definitionId of [SION_TRAINING_ID, SION_LIBRARY_ID, SION_CAFETERIA_ID, SION_GYM_ID]) {
    createOwnedCardInstance(state, "s", { instanceId: `s:${definitionId}`, definitionId, originMasterId: "master.sion", zone: "master-skills", face: "up" });
  }
  for (const skill of servantSkillDefs) {
    createOwnedCardInstance(state, "s", { instanceId: `s:${skill.id}`, definitionId: skill.id, originServantId: servantId, zone: "servant-skills", face: "up" });
  }
  return state;
}

function ctx(state, skillId, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.s,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    runtimeCatalog,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extra,
  };
}
function init(state) { return useSionPackage(ctx(state, SION_TRAINING_ID, { eventType: "game.started", event: {} })); }
function resolveFrame(state, frame, selections, extra = {}) {
  return resolveSionDecision(ctx(state, frame.sourceId, { previous: frame.payload, decision: { status: "resolved", selections } }, extra));
}
function activeEx(state, definitionId, instanceId = `s:${definitionId}:active`) {
  return createOwnedCardInstance(state, "s", { instanceId, definitionId, originMasterId: "master.sion", zone: "attack", face: "up", active: true });
}

test("Sion package is 18/18 FULL; all EX Class cards s5-s17 are outside-game until granted", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.sion");
  assert.equal(skills.length, 18);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  for (const id of [SION_TRAINING_ID, SION_LIBRARY_ID, SION_CAFETERIA_ID, SION_GYM_ID, SION_RULER_ID, SION_MOON_CANCER_ID, SION_BLACK_BARREL_ID]) {
    assert.equal(built.skills.get(id).handlerId, SION_HANDLER);
    assert.equal(built.skills.hasHandler(id), true);
  }
  for (let index = 5; index <= 17; index += 1) assert.equal(built.skills.get(`master.sion.skill.s${index}`).initiallyOwned, false);
  assert.equal(definitions[SION_BLACK_BARREL_ID].commandSealPlayCost, 1);
  assert.equal(runtimeCatalog.servantClasses[servantId], "Lancer");
});

test("Advanced Training overlays the three Servant skills and generic text suppression disables their rules text", () => {
  const state = setup("sion-overlay");
  init(state);
  const data = getSionRuntimeState(state, "s");
  assert.equal(Object.keys(data.overlays).length, 3);
  for (const record of Object.values(data.overlays)) assert.equal(isCardTextSuppressed(state, state.cards[record.coveredInstanceId], definitions), true);
});

test("Library/Gym/Cafeteria gain EXP from their exact triggers", () => {
  const state = setup("sion-exp");
  init(state);
  const vpBefore = state.players.s.victoryPoints;
  useSionPackage(ctx(state, SION_LIBRARY_ID, { eventType: "servant.true-name-revealed", event: { playerId: "a", servantId: "servant.gil" } }));
  useSionPackage(ctx(state, SION_LIBRARY_ID, { eventType: "servant.true-name-revealed", event: { playerId: "a", servantId: "servant.gil" } }));
  useSionPackage(ctx(state, SION_LIBRARY_ID, { eventType: "servant.true-name-revealed", event: { playerId: "b", servantId: "servant.emiya" } }));
  assert.equal(state.players.s.victoryPoints, vpBefore + 2);
  useSionPackage(ctx(state, SION_GYM_ID, { eventType: "combat.resolved", event: { participantIds: ["s", "a"], winnerIds: ["s"] } }));
  useSionPackage(ctx(state, SION_GYM_ID, { eventType: "combat.resolved", event: { participantIds: ["s", "b"], winnerIds: ["b"] } }));
  state.phase = "combat";
  useSionPackage(ctx(state, SION_CAFETERIA_ID, { abilityId: SION_CAFETERIA_ABILITY }));
  useSionPackage(ctx(state, SION_CAFETERIA_ID, { abilityId: SION_CAFETERIA_ABILITY }));
  const data = getSionRuntimeState(state, "s");
  assert.equal(data.overlays[SION_LIBRARY_ID].exp, 2);
  assert.equal(data.overlays[SION_GYM_ID].exp, 2);
  assert.equal(data.overlays[SION_CAFETERIA_ID].exp, 2);
});

test("Preparation Train removes all selected Chaldea cards, restores covered text, applies Library/Gym upgrades, and Cafeteria grants matching EX Class", () => {
  const state = setup("sion-train");
  init(state);
  for (const targetId of ["a", "b"]) useSionPackage(ctx(state, SION_LIBRARY_ID, { eventType: "servant.true-name-revealed", event: { playerId: targetId, servantId: state.players[targetId].servantId } }));
  for (const targetId of ["a", "b"]) useSionPackage(ctx(state, SION_GYM_ID, { eventType: "combat.resolved", event: { participantIds: ["s", targetId], winnerIds: ["s"] } }));
  state.phase = "combat";
  useSionPackage(ctx(state, SION_CAFETERIA_ID, { abilityId: SION_CAFETERIA_ABILITY }));
  useSionPackage(ctx(state, SION_CAFETERIA_ID, { abilityId: SION_CAFETERIA_ABILITY }));
  state.phase = "preparation";
  let opened;
  useSionPackage(ctx(state, SION_TRAINING_ID, { abilityId: SION_TRAIN_ABILITY }, { openDecision(value) { opened = value; } }));
  const selectFrame = state.effectQueue.shift();
  let result = resolveFrame(state, selectFrame, [SION_LIBRARY_ID, SION_CAFETERIA_ID, SION_GYM_ID], { openDecision(value) { opened = value; } });
  assert.equal(result.pending, true);
  assert.equal(opened.kind, "sion-gym-choice");
  const gymFrame = state.effectQueue.shift();
  result = resolveFrame(state, gymFrame, ["power"], { openDecision(value) { opened = value; } });
  assert.equal(result.pending, true);
  assert.equal(opened.kind, "sion-cafeteria-choice");
  const cafeFrame = state.effectQueue.shift();
  const replace = resolveFrame(state, cafeFrame, ["replace"]);
  assert.equal(replace.exDefinitionId, "master.sion.skill.s6", "Cu is Lancer, so Cafeteria grants EX Lancer");
  assert.equal(state.cards[replace.instanceId].face, "down");
  const data = getSionRuntimeState(state, "s");
  for (const record of Object.values(data.overlays)) {
    assert.equal(state.cards[record.chaldeaInstanceId].zone, "removed");
    if (state.cards[record.coveredInstanceId]?.zone !== "removed") assert.equal(isCardTextSuppressed(state, state.cards[record.coveredInstanceId], definitions), false);
  }
  const libraryCovered = state.cards[data.overlays[SION_LIBRARY_ID].coveredInstanceId];
  assert.equal(getEffectiveCardCost(state, state.players.s, libraryCovered, definitions[libraryCovered.definitionId]), Math.max(0, definitions[libraryCovered.definitionId].cost - 1));
  const gymCovered = state.cards[data.overlays[SION_GYM_ID].coveredInstanceId];
  assert.equal(getCardRulePowerAdd(state, state.players.s, gymCovered), 1);
});

test("EX Ruler grants a round-scoped Ruler Seal and enforces three full cooldown rounds", () => {
  const state = setup("sion-ruler");
  init(state);
  activeEx(state, SION_RULER_ID);
  state.phase = "outpost";
  let opened;
  useSionPackage(ctx(state, SION_RULER_ID, { abilityId: SION_RULER_ABILITY }, { openDecision(value) { opened = value; } }));
  const frame = state.effectQueue.shift();
  resolveFrame(state, frame, ["a"]);
  assert.equal(listRulerSealsOnPlayer(state, "a").length, 1);
  state.round = 4;
  useSionPackage(ctx(state, SION_RULER_ID, { abilityId: SION_RULER_ABILITY }, { openDecision(value) { opened = value; } }));
  assert.deepEqual(opened.options.map((option) => option.id), ["b"]);
  state.effectQueue.shift();
  state.round = 7;
  useSionPackage(ctx(state, SION_RULER_ID, { abilityId: SION_RULER_ABILITY }, { openDecision(value) { opened = value; } }));
  assert.ok(opened.options.some((option) => option.id === "a"));
});

test("EX Moon Cancer Reboot redeploys Moon Cell players in turn order then discards objectives and clears Moon Cell", () => {
  const state = setup("sion-reboot");
  init(state);
  activeEx(state, SION_MOON_CANCER_ID);
  state.phase = "combat";
  state.board.eventDeck = ["event.fuyuki.1"];
  setMoonCellState(state, { playerIds: ["b", "a"], objectiveEventIds: ["event.fuyuki.1"], sourceIds: ["test"] });
  let opened;
  let result = useSionPackage(ctx(state, SION_MOON_CANCER_ID, { abilityId: SION_REBOOT_ABILITY }, { openDecision(value) { opened = value; } }));
  assert.equal(result.targetPlayerId, "a", "turn order, not insertion order");
  let frame = state.effectQueue.shift();
  result = resolveFrame(state, frame, ["city"], { openDecision(value) { opened = value; } });
  assert.equal(result.targetPlayerId, "b");
  frame = state.effectQueue.shift();
  result = resolveFrame(state, frame, ["mountain"], { openDecision(value) { opened = value; } });
  assert.equal(result.done, true);
  assert.equal(state.players.a.locationId, "city");
  assert.equal(state.players.b.locationId, "mountain");
  assert.equal(getMoonCellState(state).playerIds.length, 0);
  assert.ok(state.board.eventDiscard.includes("event.fuyuki.1"));
});

test("Black Barrel closes active Luck, draws two for opponents, reveals hidden zones, and defeats a player revealing Luck", () => {
  const state = setup("sion-black-barrel");
  init(state);
  activeEx(state, SION_BLACK_BARREL_ID);
  state.phase = "combat";
  createOwnedCardInstance(state, "a", { instanceId: "a:luck-active", definitionId: "card.cardluck", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "a:luck-hand", definitionId: "card.cardluck", zone: "hand", face: "down" });
  createOwnedCardInstance(state, "a", { instanceId: "a:deck1", definitionId: "card.cardb1", zone: "deck", face: "down" });
  createOwnedCardInstance(state, "a", { instanceId: "a:deck2", definitionId: "card.cardq1", zone: "deck", face: "down" });
  createOwnedCardInstance(state, "b", { instanceId: "b:deck1", definitionId: "card.cardb1", zone: "deck", face: "down" });
  createOwnedCardInstance(state, "b", { instanceId: "b:deck2", definitionId: "card.cardq1", zone: "deck", face: "down" });
  const result = useSionPackage(ctx(state, SION_BLACK_BARREL_ID, { abilityId: SION_BLACK_BARREL_ABILITY }));
  assert.ok(result.closedLuckIds.includes("a:luck-active"));
  assert.equal(state.cards["a:luck-active"].active, false);
  assert.equal(state.players.a.hand.length, 3);
  assert.equal(state.players.a.defeated, true);
  assert.ok(result.defeatedPlayerIds.includes("a"));
  assert.equal(state.cards["a:luck-hand"].publiclyRevealed, true);
});
