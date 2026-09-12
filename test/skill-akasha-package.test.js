import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  AKASHA_ASCENSION_ID,
  AKASHA_ELESIA_ID,
  AKASHA_HANDLER,
  AKASHA_OVERLOAD_ID,
  AKASHA_REINCARNATION_ID,
  AKASHA_REINCARNATOR_ID,
  AKASHA_ROA_ID,
  AKASHA_SHIKI_ID,
  AKASHA_SQUARE_ABILITY,
  getAkashaRuntimeState,
  resolveAkashaDecision,
  useAkashaReincarnation,
} from "../src/rules-core/akasha.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function setup(id = "akasha") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "a", name: "Akasha" }, { id: "o", name: "Opponent" }],
    seed: 310,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = ["a", "o"];
  state.players.a.masterId = "master.akasha";
  state.players.a.mana = 20;
  state.players.a.locationId = "mountain";
  state.players.o.locationId = "city";
  state.board.locations.mountain = ["a"];
  state.board.locations.city = ["o"];
  return state;
}

function ctx(state, skillId, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.a,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extra,
  };
}

function originalOverload(state, instanceId = "a:overload:original") {
  return createOwnedCardInstance(state, "a", {
    instanceId,
    definitionId: AKASHA_OVERLOAD_ID,
    originMasterId: "master.akasha",
    zone: "master-skills",
    face: "up",
  });
}

function temporaryBoardOverload(state, instanceId, locationId = "mountain") {
  return createOwnedCardInstance(state, "a", {
    instanceId,
    definitionId: AKASHA_OVERLOAD_ID,
    originMasterId: "master.akasha",
    zone: "board",
    boardLocationId: locationId,
    face: "up",
    active: false,
    temporary: true,
    temporaryCleanup: "explicit",
  });
}

function init(state) {
  return useAkashaReincarnation(ctx(state, AKASHA_REINCARNATOR_ID, { eventType: "game.started", event: {} }));
}

function earn(state, amount) {
  state.players.a.victoryPoints += amount;
  return useAkashaReincarnation(ctx(state, AKASHA_REINCARNATOR_ID, {
    eventType: "player.victory-points.changed",
    event: { playerId: "a", delta: amount, before: state.players.a.victoryPoints - amount, after: state.players.a.victoryPoints },
  }));
}

function defeatAndReincarnate(state) {
  useAkashaReincarnation(ctx(state, AKASHA_REINCARNATOR_ID, { eventType: "player.defeated", event: { playerId: "a" } }));
  state.round += 1;
  return useAkashaReincarnation(ctx(state, AKASHA_REINCARNATION_ID, { eventType: "round.started", event: { round: state.round } }));
}

function makeShiki(state) {
  init(state);
  originalOverload(state);
  earn(state, 6); // Roa doubles to 12 for reincarnation.
  const result = defeatAndReincarnate(state);
  assert.equal(result.nextVessel, "shiki");
  return state;
}

function resolveFrame(state, frame, selections) {
  return resolveAkashaDecision(ctx(state, frame.sourceId, {
    previous: frame.payload,
    decision: { status: "resolved", selections },
  }));
}

test("Akasha package is 8/8 FULL; the seven rebuilt cards use the dedicated handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.akasha");
  assert.equal(skills.length, 8);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get("master.akasha.skill.s1").handlerId, "core.structured-skill");
  for (const id of [AKASHA_REINCARNATOR_ID, AKASHA_REINCARNATION_ID, AKASHA_ROA_ID, AKASHA_ELESIA_ID, AKASHA_SHIKI_ID, AKASHA_OVERLOAD_ID, AKASHA_ASCENSION_ID]) {
    assert.equal(built.skills.get(id).handlerId, AKASHA_HANDLER);
    assert.equal(built.skills.hasHandler(id), true);
  }
  assert.equal(definitions[AKASHA_OVERLOAD_ID].requiresEightMana, true);
  assert.equal(definitions[AKASHA_OVERLOAD_ID].standardAppend, true);
});

test("Reincarnation counts only current-incarnation VP, applies Roa double, and removes ALL temporary Overloads", () => {
  const state = setup("akasha-reincarnate");
  init(state);
  originalOverload(state);
  temporaryBoardOverload(state, "a:temp:mountain", "mountain");
  temporaryBoardOverload(state, "a:temp:city", "city");
  earn(state, 3);
  useAkashaReincarnation(ctx(state, AKASHA_REINCARNATOR_ID, {
    eventType: "combat.resolved",
    event: { locationId: "mountain", powers: { a: 4, o: 9 }, winnerIds: ["o"] },
  }));
  assert.equal(getAkashaRuntimeState(state, "a").pendingReincarnationRound, 4);
  state.round = 4;
  const result = useAkashaReincarnation(ctx(state, AKASHA_REINCARNATION_ID, { eventType: "round.started", event: { round: 4 } }));
  assert.equal(result.countedVictoryPoints, 6);
  assert.equal(result.nextVessel, "elesia");
  assert.deepEqual(result.removedTemporaryOverloadIds.sort(), ["a:temp:city", "a:temp:mountain"]);
  assert.equal(state.cards["a:temp:city"].zone, "removed");
  assert.equal(state.cards["a:temp:mountain"].zone, "removed");
  assert.equal(getAkashaRuntimeState(state, "a").incarnationVictoryPoints, 0);
});

test("same-Vessel reincarnation loses exactly 3 VP; Elesia halves earned VP rounded up", () => {
  const state = setup("akasha-same-vessel");
  init(state);
  originalOverload(state);
  earn(state, 1);
  const before = state.players.a.victoryPoints;
  const same = defeatAndReincarnate(state);
  assert.equal(same.nextVessel, "roa");
  assert.equal(same.victoryPointsLost, 3);
  assert.equal(state.players.a.victoryPoints, before - 3);

  earn(state, 3); // Roa: 6 => Elesia.
  defeatAndReincarnate(state);
  earn(state, 11); // Elesia: ceil(11/2)=6 => Elesia again.
  const elesia = defeatAndReincarnate(state);
  assert.equal(elesia.countedVictoryPoints, 6);
  assert.equal(elesia.nextVessel, "elesia");
});

test("Roa gains +1 additional VP from Recon", () => {
  const state = setup("akasha-roa-recon");
  init(state);
  const before = state.players.a.victoryPoints;
  const result = useAkashaReincarnation(ctx(state, AKASHA_ROA_ID, {
    eventType: "combat.resolved",
    event: { scoutingPlayerId: "a", winnerIds: ["o"], powers: { o: 5 } },
  }));
  assert.equal(result.scoutingBonus, 1);
  assert.equal(state.players.a.victoryPoints, before + 1);
});

test("Elesia High Power Circuits gives owned Skills +1 power and -1 mana while Overload is controlled", () => {
  const state = setup("akasha-elesia");
  init(state);
  const overload = originalOverload(state);
  earn(state, 3); // Roa double -> 6 => Elesia.
  defeatAndReincarnate(state);
  assert.equal(getAkashaRuntimeState(state, "a").currentVessel, "elesia");
  assert.equal(getCardPlayCost(state, definitions[AKASHA_OVERLOAD_ID], state.players.a, overload, definitions), 0);
  state.players.a.masterSkills = state.players.a.masterSkills.filter((id) => id !== overload.instanceId);
  state.players.a.attack.push(overload.instanceId);
  overload.zone = "attack";
  overload.face = "up";
  overload.active = true;
  assert.equal(calculateCombatCardPower(state, state.players.a, overload.instanceId, definitions, "mountain"), 1);
});

test("SHIKI SNAP waives the 8-mana gate below 8, grants +3, and prevents Overload Set deactivation", () => {
  const state = setup("akasha-snap");
  makeShiki(state);
  const overload = state.cards["a:overload:original"];
  state.players.a.masterSkills = state.players.a.masterSkills.filter((id) => id !== overload.instanceId);
  state.players.a.attack.push(overload.instanceId);
  overload.zone = "attack";
  overload.face = "up";
  overload.active = true;
  overload.playedRound = state.round;
  state.players.a.flags.lastAttackCommitManaBefore = 7;
  useAkashaReincarnation(ctx(state, AKASHA_OVERLOAD_ID, {
    eventType: "card.played", event: { playerId: "a", instanceId: overload.instanceId, definitionId: AKASHA_OVERLOAD_ID },
  }));
  assert.equal(overload.zone, "attack");
  assert.equal(overload.active, true);
  assert.equal(overload.powerModifiers.find((modifier) => modifier.id.startsWith("akasha-snap:")).value, 3);
  assert.ok(state.players.a.cardRuleModifiers.some((modifier) => modifier.id === "akasha-snap-eight-mana" && modifier.waiveEightMana === true));
});

test("normal Overload Set closes itself and places a temporary copy; Boiling may add all local copies at +2", () => {
  const state = setup("akasha-overload-cycle");
  init(state);
  const overload = originalOverload(state);
  state.players.a.masterSkills = [];
  state.players.a.attack = [overload.instanceId];
  overload.zone = "attack";
  overload.face = "up";
  overload.active = true;
  state.players.a.flags.lastAttackCommitManaBefore = 8;
  const set = useAkashaReincarnation(ctx(state, AKASHA_OVERLOAD_ID, {
    eventType: "card.played", event: { playerId: "a", instanceId: overload.instanceId, definitionId: AKASHA_OVERLOAD_ID },
  }));
  assert.equal(overload.zone, "master-skills");
  const copy = state.cards[set.createdInstanceId];
  assert.equal(copy.zone, "board");
  assert.equal(copy.boardLocationId, "mountain");
  assert.equal(copy.temporary, true);

  temporaryBoardOverload(state, "a:temp:second", "mountain");
  let opened;
  const boiling = useAkashaReincarnation(ctx(state, AKASHA_OVERLOAD_ID, {
    eventType: "player.deployed", event: { playerId: "a", locationId: "mountain" },
  }, { openDecision(value) { opened = value; } }));
  assert.equal(boiling.pending, true);
  assert.deepEqual(opened.options.map((option) => option.id), ["join", "decline"]);
  const frame = state.effectQueue.shift();
  const joined = resolveFrame(state, frame, ["join"]);
  assert.equal(joined.joinedInstanceIds.length, 2);
  for (const instanceId of joined.joinedInstanceIds) {
    const card = state.cards[instanceId];
    assert.equal(card.zone, "attack");
    assert.equal(card.active, true);
    assert.equal(card.powerModifiers.find((modifier) => modifier.id.startsWith("akasha-boiling:")).value, 2);
  }
});

test("SQUARE pays the total current mana cost of active Overloads and doubles all of them", () => {
  const state = setup("akasha-square");
  makeShiki(state);
  const first = state.cards["a:overload:original"];
  state.players.a.masterSkills = [];
  state.players.a.attack = [first.instanceId];
  first.zone = "attack";
  first.face = "up";
  first.active = true;
  const second = createOwnedCardInstance(state, "a", {
    instanceId: "a:overload:second", definitionId: AKASHA_OVERLOAD_ID, originMasterId: "master.akasha",
    zone: "attack", face: "up", active: true, temporary: true,
  });
  const expected = getCardPlayCost(state, definitions[AKASHA_OVERLOAD_ID], state.players.a, first, definitions)
    + getCardPlayCost(state, definitions[AKASHA_OVERLOAD_ID], state.players.a, second, definitions);
  const before = state.players.a.mana;
  const result = useAkashaReincarnation(ctx(state, AKASHA_SHIKI_ID, { abilityId: AKASHA_SQUARE_ABILITY }));
  assert.equal(result.manaPaid, expected);
  assert.equal(state.players.a.mana, before - expected);
  assert.equal(result.doubledInstanceIds.length, 2);
  for (const instanceId of result.doubledInstanceIds) {
    assert.equal(state.cards[instanceId].powerModifiers.find((modifier) => modifier.id.startsWith("akasha-square:")).value, 2);
  }
});

test("Ultimate Form activates after all three Vessels, stops reincarnation, and creates one chosen Climax Overload", () => {
  const state = setup("akasha-ultimate");
  init(state);
  originalOverload(state);
  earn(state, 3); // Roa -> counted 6 -> Elesia.
  defeatAndReincarnate(state);
  assert.equal(getAkashaRuntimeState(state, "a").currentVessel, "elesia");
  earn(state, 21); // Elesia -> ceil(21/2)=11 -> SHIKI.
  useAkashaReincarnation(ctx(state, AKASHA_REINCARNATOR_ID, { eventType: "player.defeated", event: { playerId: "a" } }));
  createOwnedCardInstance(state, "a", {
    instanceId: "a:ultimate", definitionId: AKASHA_ASCENSION_ID, originMasterId: "master.akasha", zone: "master-skills", face: "up",
  });
  state.round += 1;
  const finalReincarnation = useAkashaReincarnation(ctx(state, AKASHA_REINCARNATION_ID, { eventType: "round.started", event: { round: state.round } }));
  assert.equal(finalReincarnation.nextVessel, "shiki");
  assert.equal(finalReincarnation.ultimateActivated, true);
  const data = getAkashaRuntimeState(state, "a");
  assert.equal(data.ultimate, true);
  assert.deepEqual([...data.incarnatedVessels].sort(), ["elesia", "roa", "shiki"]);

  const noSchedule = useAkashaReincarnation(ctx(state, AKASHA_REINCARNATOR_ID, { eventType: "player.defeated", event: { playerId: "a" } }));
  assert.equal(noSchedule.scheduledRound, undefined);

  state.round += 1;
  state.modeState.currentSituationClimax = true;
  let opened;
  const climax = useAkashaReincarnation(ctx(state, AKASHA_ASCENSION_ID, { eventType: "round.started", event: { round: state.round } }, {
    openDecision(value) { opened = value; },
  }));
  assert.equal(climax.pending, true);
  assert.deepEqual(opened.options.map((option) => option.id), ["mountain", "city"]);
  const frame = state.effectQueue.shift();
  const placed = resolveFrame(state, frame, ["city"]);
  assert.equal(placed.locationId, "city");
  assert.equal(state.cards[placed.createdInstanceId].boardLocationId, "city");
  assert.equal(state.cards[placed.createdInstanceId].temporary, true);
});
