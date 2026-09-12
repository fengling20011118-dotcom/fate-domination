import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { projectPublicState } from "../src/projection/project-state.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { initializeEventDeck, resolveDeferredActionStartDraws, startStandardRound } from "../src/rules-core/rounds.ts";
import {
  registerCoreSkillHandlers,
  resolveRocheBetrayal,
  useRocheBetrayal,
  useRocheInnocence,
  useRocheNobleSacrifice,
} from "../src/rules-core/skill-handlers.ts";

const INNOCENCE = "master.roche.skill.s1";
const GUIDANCE = "master.roche.skill.s1a";
const BETRAYAL = "master.roche.skill.s2";
const ASCENSION = "master.roche.skill.ascension";

function packageSetup(id = "roche-package") {
  const built = buildStandardContent(legacyContent);
  registerCoreSkillHandlers(built.skills);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const basicId = Object.values(definitions).find((definition) => definition.basic === true && definition.cost <= 2)?.id;
  assert.ok(basicId, "expected at least one cheap basic card");
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "r", name: "Roche" }, { id: "o", name: "Opponent" }],
    seed: 1408,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "r";
  state.players.r.masterId = "master.roche";
  state.players.r.locationId = "mountain";
  state.players.o.locationId = "city";
  state.board.locations = { workshop: [], mountain: ["r"], city: ["o"], scouting: [] };
  return { built, definitions, basicId, state };
}

function addCard(state, instanceId, definitionId, zone = "hand") {
  return createOwnedCardInstance(state, "r", {
    instanceId,
    definitionId,
    zone,
    face: zone === "master-skills" ? "up" : "down",
    active: false,
  });
}

function passivePayload(eventType, event) {
  return { eventType, event };
}

test("Roche package is 4/4 FULL and Betrayal materializes as a gated deck attack", () => {
  const { built, definitions } = packageSetup("roche-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.roche");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(INNOCENCE).handlerId, "core.roche-innocence");
  assert.equal(built.skills.get(GUIDANCE).handlerId, "core.roche-giant-guidance");
  assert.equal(built.skills.get(BETRAYAL).handlerId, "core.roche-betrayal");
  assert.equal(built.skills.get(ASCENSION).handlerId, "core.roche-noble-sacrifice");
  assert.equal(built.skills.get(BETRAYAL).initiallyOwned, false);
  assert.equal(definitions[BETRAYAL].cardType, "attack");
  assert.equal(definitions[BETRAYAL].isSkill, false);
  assert.deepEqual(definitions[BETRAYAL].playRequiresPlayerFlag, { key: "rocheNobleSacrificeActive", value: true });
});

test("Innocence defers preparation refill and Action-start refill uses the live hand size", () => {
  const { built, definitions, basicId } = packageSetup("roche-innocence-draw");
  const state = createGameState({ gameInstanceId: "roche-round", players: [{ id: "r", name: "Roche" }], seed: 88 });
  state.status = "playing";
  state.players.r.masterId = "master.roche";
  addCard(state, "r:innocence", INNOCENCE, "master-skills");
  for (let i = 0; i < 5; i += 1) addCard(state, `r:basic:${i}`, basicId, "deck");
  initializeEventDeck(state, built.events, () => 0);
  startStandardRound(state, built.situations, built.events, () => 0, definitions);
  assert.equal(state.round, 1);
  assert.equal(state.players.r.hand.length, 0);
  assert.equal(state.players.r.flags.deferredPreparationDrawTarget, 3);

  movePlayerCard(state, "r", state.players.r.deck[0], "hand");
  const result = resolveDeferredActionStartDraws(state, () => 0, definitions);
  assert.equal(result.r.length, 2);
  assert.equal(state.players.r.hand.length, 3);
  assert.equal(state.players.r.flags.deferredPreparationDrawTarget, undefined);
});

test("Innocence makes Roche's hand public until Noble Sacrifice removes it", () => {
  const { built, definitions, basicId, state } = packageSetup("roche-public-hand");
  const handCard = addCard(state, "r:hand", basicId, "hand");
  useRocheInnocence({ state, player: state.players.r, skill: built.skills.get(INNOCENCE), payload: passivePayload("game.started", { round: state.round }), definitions });
  assert.equal(projectPublicState(state, "o").cards[handCard.instanceId].definitionId, basicId);

  addCard(state, "r:innocence", INNOCENCE, "master-skills");
  addCard(state, "r:guidance", GUIDANCE, "master-skills");
  state.players.r.commandSeals = 2;
  useRocheNobleSacrifice({
    state,
    player: state.players.r,
    skill: built.skills.get(ASCENSION),
    payload: passivePayload("skill.unlocked", { playerId: "r", skillId: ASCENSION }),
    definitions,
  });
  assert.equal(state.players.r.flags["public:handRevealed"], undefined);
  assert.equal(projectPublicState(state, "o").cards[handCard.instanceId].definitionId, null);
  assert.equal(state.cards["r:innocence"].zone, "removed");
  assert.equal(state.cards["r:guidance"].zone, "removed");
});

test("Betrayal chained draws finish before the three-card conflict decision and do not double trigger", () => {
  const { built, definitions, basicId, state } = packageSetup("roche-betrayal-chain");
  state.players.r.victoryPoints = 10;
  addCard(state, "r:b1", BETRAYAL, "hand");
  addCard(state, "r:b2", BETRAYAL, "hand");
  addCard(state, "r:b3", BETRAYAL, "hand");
  addCard(state, "r:b4", BETRAYAL, "deck");
  addCard(state, "r:normal", basicId, "deck");
  const skill = built.skills.get(BETRAYAL);
  useRocheBetrayal({
    state,
    player: state.players.r,
    skill,
    payload: passivePayload("card.drawn", { ownerPlayerId: "r", instanceId: "r:b3", definitionId: BETRAYAL, fromZone: "deck" }),
    definitions,
    randomInt: () => 0,
    openDecision: (decision) => { state.pendingDecision = structuredClone(decision); },
  });
  assert.deepEqual(new Set(state.players.r.hand), new Set(["r:b1", "r:b2", "r:b3", "r:b4", "r:normal"]));
  assert.equal(state.players.r.victoryPoints, 4);
  assert.equal(state.pendingDecision?.kind, "roche-betrayal-conflict");

  const handCount = state.players.r.hand.length;
  useRocheBetrayal({
    state,
    player: state.players.r,
    skill,
    payload: passivePayload("card.drawn", { ownerPlayerId: "r", instanceId: "r:b4", definitionId: BETRAYAL, fromZone: "deck" }),
    definitions,
    randomInt: () => 0,
    openDecision: () => { throw new Error("nested Betrayal must not reopen the conflict"); },
  });
  assert.equal(state.players.r.hand.length, handCount);
});

test("Betrayal conflict can spend a seal to shuffle all Betrayals back or decline and be defeated", () => {
  const pay = packageSetup("roche-betrayal-pay");
  pay.state.players.r.commandSeals = 1;
  for (let i = 1; i <= 3; i += 1) addCard(pay.state, `r:pay-b${i}`, BETRAYAL, "hand");
  resolveRocheBetrayal({
    state: pay.state,
    player: pay.state.players.r,
    skill: pay.built.skills.get(BETRAYAL),
    payload: { decision: { status: "resolved", selections: ["pay"] } },
    definitions: pay.definitions,
    randomInt: () => 0,
  });
  assert.equal(pay.state.players.r.commandSeals, 0);
  assert.equal(pay.state.players.r.hand.filter((id) => pay.state.cards[id].definitionId === BETRAYAL).length, 0);
  assert.equal(pay.state.players.r.deck.filter((id) => pay.state.cards[id].definitionId === BETRAYAL).length, 3);
  assert.equal(pay.state.players.r.defeated, false);

  const decline = packageSetup("roche-betrayal-decline");
  for (let i = 1; i <= 3; i += 1) addCard(decline.state, `r:no-b${i}`, BETRAYAL, "hand");
  resolveRocheBetrayal({
    state: decline.state,
    player: decline.state.players.r,
    skill: decline.built.skills.get(BETRAYAL),
    payload: { decision: { status: "resolved", selections: ["decline"] } },
    definitions: decline.definitions,
  });
  assert.equal(decline.state.players.r.defeated, true);
  assert.equal(decline.state.players.r.flags.rocheDefeatedByBetrayal, true);
  assert.equal(decline.state.players.r.discard.filter((id) => decline.state.cards[id].definitionId === BETRAYAL).length, 3);
});

test("Noble Sacrifice gates Betrayal before ascension, then grants Magic, +3 per lost seal and standard append", () => {
  const { built, definitions, basicId, state } = packageSetup("roche-ascension");
  const betrayal = addCard(state, "r:betrayal", BETRAYAL, "hand");
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "r", instanceId: betrayal.instanceId, definitions, faceDown: false }), /CARD_PLAY_PLAYER_FLAG_REQUIRED/);

  addCard(state, "r:innocence", INNOCENCE, "master-skills");
  addCard(state, "r:guidance", GUIDANCE, "master-skills");
  state.players.r.commandSeals = 3;
  const result = useRocheNobleSacrifice({
    state,
    player: state.players.r,
    skill: built.skills.get(ASCENSION),
    payload: passivePayload("skill.unlocked", { playerId: "r", skillId: ASCENSION }),
    definitions,
  });
  assert.deepEqual(result, { lostCommandSeals: 3, betrayalPowerBonus: 9 });
  assert.equal(state.players.r.commandSeals, 0);
  assert.equal(state.players.r.flags.rocheNobleSacrificeActive, true);
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "r", instanceId: betrayal.instanceId, definitions, faceDown: false }));
  assert.ok(getCardInstanceAttributes(betrayal, definitions[BETRAYAL], state, definitions).includes("魔术"));

  const b1 = addCard(state, "r:basic1", basicId, "hand");
  const b2 = addCard(state, "r:basic2", basicId, "hand");
  state.players.r.mana = 30;
  const committed = commitStandardAttack(state, "r", [b1.instanceId, b2.instanceId, betrayal.instanceId], [], definitions);
  assert.equal(committed.committed.length, 3);
  assert.equal(calculateCombatCardPower(state, state.players.r, betrayal.instanceId, definitions, "mountain"), 9);
});

test("Noble Sacrifice has no effect after Roche was defeated by Betrayal", () => {
  const { built, definitions, state } = packageSetup("roche-blocked-ascension");
  state.players.r.flags.rocheDefeatedByBetrayal = true;
  state.players.r.commandSeals = 3;
  const result = useRocheNobleSacrifice({
    state,
    player: state.players.r,
    skill: built.skills.get(ASCENSION),
    payload: passivePayload("skill.unlocked", { playerId: "r", skillId: ASCENSION }),
    definitions,
  });
  assert.deepEqual(result, { applied: false, reason: "betrayal-defeat" });
  assert.equal(state.players.r.commandSeals, 3);
  assert.notEqual(state.players.r.flags.rocheNobleSacrificeActive, true);
});
