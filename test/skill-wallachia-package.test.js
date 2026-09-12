import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { getEffectiveCardCost } from "../src/rules-core/card-rule-modifiers.ts";
import { movePlayer } from "../src/rules-core/board.ts";
import { projectPublicState } from "../src/projection/project-state.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  WALLACHIA_ASCENSION_ID,
  WALLACHIA_DARKNESS_ID,
  WALLACHIA_DRAMA_ID,
  WALLACHIA_FEAR_ID,
  WALLACHIA_HANDLER,
  WALLACHIA_MADNESS_ID,
  WALLACHIA_MALICE_ID,
  WALLACHIA_PHOBIA_ID,
  WALLACHIA_TATARI_ID,
  WALLACHIA_TERROR_ACTION,
  WALLACHIA_TERROR_ID,
  getWallachiaRuntimeState,
  resolveWallachiaDecision,
  useWallachiaTatari,
} from "../src/rules-core/wallachia.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const runtimeCatalog = {
  servantDecks: built.playerDecks,
  skillDefinitions: built.skills.list(),
  masterInitialMana: built.masterInitialMana ?? {},
};

function setup(id = "wallachia") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "w", name: "Wallachia" }, { id: "a", name: "Cu" }, { id: "b", name: "Gil" }],
    seed: 666,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "w";
  state.turnOrder = ["w", "a", "b"];
  state.players.w.masterId = "master.wallachia";
  state.players.w.servantId = "servant.emiya";
  state.players.a.servantId = "servant.cu";
  state.players.b.servantId = "servant.gil";
  for (const player of Object.values(state.players)) player.mana = 20;
  setLocation(state, "w", "mountain");
  setLocation(state, "a", "mountain");
  setLocation(state, "b", "mountain");
  return state;
}

function setLocation(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  if (locationId) state.board.locations[locationId].push(playerId);
}

function ctx(state, skillId, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.w,
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

function initialize(state) {
  return useWallachiaTatari(ctx(state, WALLACHIA_TERROR_ID, { eventType: "game.started", event: {} }));
}

function enterTatari(state, locationId = "mountain") {
  setLocation(state, "w", locationId);
  return useWallachiaTatari(ctx(state, WALLACHIA_TERROR_ID, {
    eventType: "player.entered-location",
    event: { playerId: "w", previousLocationId: "workshop", locationId, method: "move" },
  }));
}

function resolveFrame(state, frame, selections) {
  return resolveWallachiaDecision(ctx(state, frame.sourceId, {
    previous: frame.payload,
    decision: { status: "resolved", selections },
  }));
}

function acquireEscalation(state, escalationId) {
  let opened;
  const result = useWallachiaTatari(ctx(state, WALLACHIA_TERROR_ID, {
    eventType: "combat.resolved",
    event: { locationId: getWallachiaRuntimeState(state, "w").tatariLocationId, participantIds: ["w", "a"], winnerIds: ["w"] },
  }, { openDecision(value) { opened = value; } }));
  assert.equal(result.escalation.pending, true);
  assert.ok(opened.options.some((option) => option.id === escalationId));
  const frame = state.effectQueue.shift();
  return resolveFrame(state, frame, [escalationId]);
}

function addAttack(state, playerId, instanceId, definitionId, playedRound = state.round) {
  const card = createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone: "attack",
    face: "up",
    active: true,
  });
  card.playedRound = playedRound;
  return card;
}

test("Wallachia package is 9/9 FULL and all catalogue-only TATARI/Escalation cards are not initially physical", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.wallachia");
  assert.equal(skills.length, 9);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => skill.handlerId === WALLACHIA_HANDLER));
  assert.equal(built.skills.get(WALLACHIA_TERROR_ID).initiallyOwned, true);
  assert.equal(built.skills.get(WALLACHIA_FEAR_ID).initiallyOwned, true);
  for (const id of [WALLACHIA_TATARI_ID, WALLACHIA_MADNESS_ID, WALLACHIA_DARKNESS_ID, WALLACHIA_MALICE_ID, WALLACHIA_PHOBIA_ID]) {
    assert.equal(built.skills.get(id).initiallyOwned, false);
  }
  assert.equal(built.skills.get(WALLACHIA_ASCENSION_ID).standardAppend, true);
});

test("Fear uses starting-deck count, then base-power sum, then Magic > Strength > Agility and remains owner-private", () => {
  const state = setup("wallachia-fear");
  initialize(state);
  const data = getWallachiaRuntimeState(state, "w");
  assert.equal(data.fears.a, "力量", "Cu has fewer Strength cards than Magic/Agility");
  assert.equal(data.fears.b, "魔术", "Gil ties count and base-power sum, so Magic wins the final tiebreak");
  const ownerView = projectPublicState(state, "w");
  const opponentView = projectPublicState(state, "a");
  assert.deepEqual(ownerView.modeState.privatePlayerKnowledge.w.wallachiaTatari.fears, { a: "力量", b: "魔术" });
  assert.equal(opponentView.modeState.privateRulesState, undefined);
  assert.deepEqual(opponentView.modeState.privatePlayerKnowledge, {});
});

test("TATARI appears only on Wallachia's first battlefield entry each round, starts at X=0, and is removed before round cleanup", () => {
  const state = setup("wallachia-tatari");
  initialize(state);
  const first = enterTatari(state, "mountain");
  assert.equal(first.x, 0);
  assert.deepEqual(state.board.currentEvents.mountain, [WALLACHIA_TATARI_ID]);
  assert.equal(state.board.eventVictoryPointBonuses[WALLACHIA_TATARI_ID], 0);
  useWallachiaTatari(ctx(state, WALLACHIA_TERROR_ID, {
    eventType: "player.entered-location", event: { playerId: "w", previousLocationId: "mountain", locationId: "city" },
  }));
  assert.deepEqual(state.board.currentEvents.mountain, [WALLACHIA_TATARI_ID], "second battlefield entry does not move/create TATARI");
  useWallachiaTatari(ctx(state, WALLACHIA_TERROR_ID, { eventType: "round.ending", event: { round: state.round } }));
  assert.deepEqual(state.board.currentEvents.mountain, []);
  assert.equal(state.board.eventVictoryPointBonuses[WALLACHIA_TATARI_ID], undefined);
});

test("Escalations persist, TATARI X is ceil(count/2), and Drama adds another +1", () => {
  const state = setup("wallachia-x");
  initialize(state);
  enterTatari(state);
  assert.equal(acquireEscalation(state, WALLACHIA_MADNESS_ID).x, 1);
  assert.equal(acquireEscalation(state, WALLACHIA_DARKNESS_ID).x, 1);
  assert.equal(acquireEscalation(state, WALLACHIA_DRAMA_ID).x, 3);
  assert.equal(state.board.eventVictoryPointBonuses[WALLACHIA_TATARI_ID], 3);
  assert.deepEqual(getWallachiaRuntimeState(state, "w").escalations, [WALLACHIA_MADNESS_ID, WALLACHIA_DARKNESS_ID, WALLACHIA_DRAMA_ID]);
});

test("generic location access rules enforce Darkness mana/discard entry choice and TATARI leave mana", () => {
  const state = setup("wallachia-access");
  initialize(state);
  enterTatari(state, "mountain");
  acquireEscalation(state, WALLACHIA_DARKNESS_ID); // X=1
  setLocation(state, "a", "workshop");
  state.activePlayerId = "a";
  state.phase = "action";
  state.step = "move-decision";
  assert.throws(() => movePlayer(state, "a", "mountain", false, definitions), /LOCATION_ACCESS_PAYMENT_REQUIRED/);
  const beforeMana = state.players.a.mana;
  const cost = movePlayer(state, "a", "mountain", false, definitions, {
    locationAccessPayments: [{ ruleId: "wallachia-tatari-access:w", kind: "mana" }],
  });
  assert.equal(cost, 3, "Workshop->Mountain base 2 plus Darkness X=1");
  assert.equal(state.players.a.mana, beforeMana - 3);

  state.step = "move-decision";
  const leaveBefore = state.players.a.mana;
  const leaveCost = movePlayer(state, "a", "city", true, definitions);
  assert.equal(leaveCost, 3, "Mountain->City base 2 plus TATARI leave X=1");
  assert.equal(state.players.a.mana, leaveBefore - 3);

  setLocation(state, "a", "workshop");
  state.step = "move-decision";
  const feared = createOwnedCardInstance(state, "a", { instanceId: "a:feared", definitionId: "card.cardb1", zone: "hand", face: "down" });
  const discardBefore = state.players.a.mana;
  const discardCost = movePlayer(state, "a", "mountain", false, definitions, {
    locationAccessPayments: [{ ruleId: "wallachia-tatari-access:w", kind: "discard", instanceId: feared.instanceId }],
  });
  assert.equal(discardCost, 2);
  assert.equal(state.players.a.mana, discardBefore - 2);
  assert.equal(feared.zone, "discard");
});

test("Terror Incarnate pays 3 and grants the chosen opponent's fear only while that opponent is in TATARI", () => {
  const state = setup("wallachia-terror");
  initialize(state);
  enterTatari(state);
  const attack = addAttack(state, "w", "w:attack", "card.cardq1");
  state.players.w.mana = 10;
  let opened;
  const result = useWallachiaTatari(ctx(state, WALLACHIA_TERROR_ID, { abilityId: WALLACHIA_TERROR_ACTION }, {
    openDecision(value) { opened = value; },
  }));
  assert.equal(result.manaPaid, 3);
  assert.equal(state.players.w.mana, 7);
  const frame = state.effectQueue.shift();
  resolveFrame(state, frame, ["a"]);
  assert.ok(getCardInstanceAttributes(attack, definitions[attack.definitionId], state, definitions).includes("力量"));

  setLocation(state, "a", "city");
  useWallachiaTatari(ctx(state, WALLACHIA_TERROR_ID, {
    eventType: "player.moved", event: { playerId: "a", previousLocationId: "mountain", locationId: "city" },
  }));
  assert.equal(getCardInstanceAttributes(attack, definitions[attack.definitionId], state, definitions).includes("力量"), false);
});

test("Madness adds power per fearing opponent and Phobia adds X cost to feared-type cards in TATARI", () => {
  const state = setup("wallachia-madness-phobia");
  initialize(state);
  enterTatari(state);
  acquireEscalation(state, WALLACHIA_MADNESS_ID);
  acquireEscalation(state, WALLACHIA_PHOBIA_ID); // X=1
  const attack = addAttack(state, "w", "w:strength", "card.cardb1");
  const fearedHand = createOwnedCardInstance(state, "a", { instanceId: "a:strength", definitionId: "card.cardb1", zone: "hand", face: "down" });
  useWallachiaTatari(ctx(state, WALLACHIA_TERROR_ID, { eventType: "card.played", event: { playerId: "w", instanceId: attack.instanceId, definitionId: attack.definitionId } }));
  assert.equal(attack.powerModifiers.find((modifier) => modifier.id === "wallachia-madness-power").value, 1, "only Cu fears Strength; Gil fears Magic");
  assert.equal(getEffectiveCardCost(state, state.players.a, fearedHand, definitions[fearedHand.definitionId]), definitions[fearedHand.definitionId].cost + 1);
});

test("Malice makes a loser lose X VP when a winner controls an attack the loser fears", () => {
  const state = setup("wallachia-malice");
  initialize(state);
  enterTatari(state);
  acquireEscalation(state, WALLACHIA_MALICE_ID); // X=1
  state.players.a.victoryPoints = 5;
  addAttack(state, "b", "b:strength", "card.cardb1");
  const result = useWallachiaTatari(ctx(state, WALLACHIA_TERROR_ID, {
    eventType: "combat.resolved",
    event: { locationId: "mountain", participantIds: ["a", "b"], winnerIds: ["b"] },
  }));
  assert.equal(result.malice.losses.a, 1);
  assert.equal(state.players.a.victoryPoints, 4);
});

test("Drama discards temporary TATARI when Wallachia leaves its battlefield", () => {
  const state = setup("wallachia-drama");
  initialize(state);
  enterTatari(state);
  acquireEscalation(state, WALLACHIA_DRAMA_ID);
  setLocation(state, "w", "city");
  const result = useWallachiaTatari(ctx(state, WALLACHIA_TERROR_ID, {
    eventType: "player.moved", event: { playerId: "w", previousLocationId: "mountain", locationId: "city" },
  }));
  assert.equal(result.dramaDiscardedTatari, true);
  assert.equal(getWallachiaRuntimeState(state, "w").tatariLocationId, undefined);
  assert.deepEqual(state.board.currentEvents.mountain, []);
});

test("Malignant Replicator removes older skill-zone copies and always creates exactly one fresh skill-zone copy", () => {
  const state = setup("wallachia-replicator");
  initialize(state);
  createOwnedCardInstance(state, "w", { instanceId: "w:old1", definitionId: WALLACHIA_ASCENSION_ID, originMasterId: "master.wallachia", zone: "master-skills", face: "up" });
  createOwnedCardInstance(state, "w", { instanceId: "w:old2", definitionId: WALLACHIA_ASCENSION_ID, originMasterId: "master.wallachia", zone: "master-skills", face: "up" });
  const played = addAttack(state, "w", "w:played", WALLACHIA_ASCENSION_ID);
  const result = useWallachiaTatari(ctx(state, WALLACHIA_ASCENSION_ID, {
    eventType: "card.played", event: { playerId: "w", instanceId: played.instanceId, definitionId: WALLACHIA_ASCENSION_ID },
  }));
  assert.deepEqual(result.removedInstanceIds.sort(), ["w:old1", "w:old2"]);
  assert.equal(state.cards["w:old1"].zone, "removed");
  assert.equal(state.cards["w:old2"].zone, "removed");
  const skillCopies = state.players.w.masterSkills.filter((instanceId) => state.cards[instanceId].definitionId === WALLACHIA_ASCENSION_ID);
  assert.equal(skillCopies.length, 1);
  assert.equal(skillCopies[0], result.createdInstanceId);
  assert.equal(state.cards[played.instanceId].zone, "attack");
});
