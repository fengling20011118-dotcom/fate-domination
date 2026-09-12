import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { closePlayerCard, createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { spendNormalCommandSeal } from "../src/rules-core/command-seals.ts";
import { discardNamedSideDeckHandCards, drawNamedSideDeck, getNamedSideDeck, namedSideDeckHand } from "../src/rules-core/named-side-decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  CHAOS_666_ID,
  CHAOS_999_ID,
  CHAOS_ASCENSION_DRAW_ABILITY,
  CHAOS_ASCENSION_ID,
  CHAOS_BEAST_DECK_ID,
  CHAOS_BEAST_IDS,
  CHAOS_BEAST_PLAY_ABILITY,
  CHAOS_COLOSSUS_ID,
  CHAOS_DEVOURER_ABILITY,
  CHAOS_DEVOURER_ID,
  CHAOS_EMPEROR_ID,
  CHAOS_HANDLER,
  CHAOS_SCRAMBLED_ABILITY,
  CHAOS_SCRAMBLED_SEAL_ID,
  CHAOS_WATCHER_ID,
  isChaosBeastEngineLegal,
  resolveChaosBeastDecision,
  useChaosBeastEngine,
} from "../src/rules-core/chaos.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function setup(id = "chaos") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "c", name: "Chaos" }, { id: "o", name: "Opponent" }],
    seed: 666,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "c";
  state.turnOrder = ["c", "o"];
  state.players.c.masterId = "master.chaos";
  state.players.c.commandSeals = 3;
  state.players.c.mana = 10;
  return state;
}

function ctx(state, skillId, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.c,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extra,
  };
}

function start(state) {
  return useChaosBeastEngine(ctx(state, CHAOS_666_ID, { eventType: "game.started", event: {} }));
}

function sideInstance(state, definitionId) {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === "c" && card.namedSideDeckId === CHAOS_BEAST_DECK_ID && card.definitionId === definitionId);
}

function resolve(state, skillId, previous, selections, extra = {}) {
  return resolveChaosBeastDecision(ctx(state, skillId, {
    previous,
    decision: { status: "resolved", selections },
  }, extra));
}

function drawAll(state) {
  drawNamedSideDeck(state, "c", CHAOS_BEAST_DECK_ID, 15, () => 0);
}

function playBeast(state, definitionId, paymentDefinitionIds = []) {
  const selected = sideInstance(state, definitionId);
  assert.ok(selected);
  let opened;
  useChaosBeastEngine(ctx(state, CHAOS_666_ID, { abilityId: CHAOS_BEAST_PLAY_ABILITY }, {
    openDecision(value) { opened = value; },
  }));
  const selectFrame = state.effectQueue.shift();
  const first = resolve(state, CHAOS_666_ID, selectFrame.payload, [selected.instanceId], {
    openDecision(value) { opened = value; },
  });
  if (paymentDefinitionIds.length === 0) return first;
  assert.equal(first.pending, true);
  const payFrame = state.effectQueue.shift();
  const paymentIds = paymentDefinitionIds.map((id) => sideInstance(state, id)?.instanceId).filter(Boolean);
  return resolve(state, CHAOS_666_ID, payFrame.payload, paymentIds);
}

test("Chaos package is 18/18 FULL and all 15 Beasts are physical side-deck cards", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.chaos");
  assert.equal(skills.length, 18);
  assert.equal(skills.filter((skill) => skill.supportLevel === "FULL").length, 18);
  assert.deepEqual(skills.filter((skill) => skill.supportLevel === "PARTIAL"), []);
  for (const id of CHAOS_BEAST_IDS) assert.equal(built.skills.get(id).initiallyOwned, false);
  for (const id of [CHAOS_666_ID, CHAOS_DEVOURER_ID, CHAOS_WATCHER_ID, CHAOS_COLOSSUS_ID, CHAOS_EMPEROR_ID, CHAOS_999_ID, CHAOS_SCRAMBLED_SEAL_ID, CHAOS_ASCENSION_ID]) {
    assert.equal(built.skills.get(id).handlerId, CHAOS_HANDLER);
    assert.equal(built.skills.hasHandler(id), true);
  }
  const breaker = built.skills.get("master.chaos.skill.s12");
  assert.equal(breaker.rules.abilities[0].effects[0].steps.max, 3);
  assert.equal(breaker.rules.abilities[0].effects[1].amount.max, 4);
});

test("The Emperor temporarily converts the unused Scrambled Seals component into one Command Seal and closes after it is spent", () => {
  const state = setup("chaos-emperor-spend");
  start(state);
  drawAll(state);
  playBeast(state, CHAOS_EMPEROR_ID, ["master.chaos.skill.s2"]);
  const emperor = sideInstance(state, CHAOS_EMPEROR_ID);
  assert.equal(emperor.active, true);
  useChaosBeastEngine(ctx(state, CHAOS_EMPEROR_ID, {
    eventType: "card.played",
    event: { playerId: "c", instanceId: emperor.instanceId, definitionId: CHAOS_EMPEROR_ID },
  }));
  assert.equal(state.players.c.commandSeals, 1);
  assert.equal(state.players.c.flags.chaosScrambledSealExposed, true);

  spendNormalCommandSeal(state, "c");
  useChaosBeastEngine(ctx(state, CHAOS_EMPEROR_ID, {
    eventType: "player.command-seal-used",
    event: { playerId: "c", amount: 1 },
  }));
  assert.equal(state.players.c.commandSeals, 0);
  assert.equal(state.players.c.flags.chaosScrambledSealUsed, true);
  assert.equal(emperor.active, false);
  assert.equal(emperor.zone, "side-discard");
});

test("closing The Emperor without spending its converted seal retracts the temporary Command Seal without consuming Scrambled Seals", () => {
  const state = setup("chaos-emperor-close");
  start(state);
  drawAll(state);
  playBeast(state, CHAOS_EMPEROR_ID, ["master.chaos.skill.s2"]);
  const emperor = sideInstance(state, CHAOS_EMPEROR_ID);
  useChaosBeastEngine(ctx(state, CHAOS_EMPEROR_ID, {
    eventType: "card.played",
    event: { playerId: "c", instanceId: emperor.instanceId, definitionId: CHAOS_EMPEROR_ID },
  }));
  assert.equal(state.players.c.commandSeals, 1);
  closePlayerCard(state, "c", emperor.instanceId, definitions);
  useChaosBeastEngine(ctx(state, CHAOS_666_ID, {
    eventType: "card.closed",
    event: { ownerPlayerId: "c", instanceId: emperor.instanceId, definitionId: CHAOS_EMPEROR_ID },
  }));
  assert.equal(state.players.c.commandSeals, 0);
  assert.equal(state.players.c.flags.chaosScrambledSealUsed, undefined);
});

test("Scrambled Seals mana mode is once per game, gains 2 mana and draws exactly one Beast without double-triggering The 666", () => {
  const state = setup("chaos-scrambled-mana");
  start(state);
  state.phase = "action";
  state.players.c.mana = 4;
  const result = useChaosBeastEngine(ctx(state, CHAOS_SCRAMBLED_SEAL_ID, { abilityId: CHAOS_SCRAMBLED_ABILITY, mode: "mana" }));
  assert.equal(result.result.manaGained, 2);
  assert.equal(result.result.drawnInstanceIds.length, 1);
  assert.equal(state.players.c.mana, 6);
  assert.equal(namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID).length, 1);
  useChaosBeastEngine(ctx(state, CHAOS_666_ID, {
    eventType: "player.mana.changed",
    event: { playerId: "c", delta: 2, sourceId: CHAOS_SCRAMBLED_SEAL_ID },
  }));
  assert.equal(namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID).length, 1);
  assert.throws(() => useChaosBeastEngine(ctx(state, CHAOS_SCRAMBLED_SEAL_ID, { abilityId: CHAOS_SCRAMBLED_ABILITY, mode: "mana" })), /CHAOS_SCRAMBLED_SEAL_ALREADY_USED/);
});

test("Scrambled Seals can arm the +2 VP-on-win option and resolves only for Chaos's own fight", () => {
  const state = setup("chaos-scrambled-victory");
  start(state);
  state.phase = "action";
  useChaosBeastEngine(ctx(state, CHAOS_SCRAMBLED_SEAL_ID, { abilityId: CHAOS_SCRAMBLED_ABILITY, mode: "victory" }));
  const before = state.players.c.victoryPoints;
  useChaosBeastEngine(ctx(state, CHAOS_SCRAMBLED_SEAL_ID, {
    eventType: "combat.resolved",
    event: { participantIds: ["o"], winnerIds: ["o"] },
  }));
  assert.equal(state.players.c.victoryPoints, before);
  const result = useChaosBeastEngine(ctx(state, CHAOS_SCRAMBLED_SEAL_ID, {
    eventType: "combat.resolved",
    event: { participantIds: ["c", "o"], winnerIds: ["c"] },
  }));
  assert.equal(result.victoryPointsGained, 2);
  assert.equal(state.players.c.victoryPoints, before + 2);
});

test("Scrambled Seals move mode only permits an adjacent location", () => {
  const state = setup("chaos-scrambled-move");
  start(state);
  state.phase = "action";
  state.players.c.locationId = "mountain";
  state.board.locations.mountain = ["c"];
  useChaosBeastEngine(ctx(state, CHAOS_SCRAMBLED_SEAL_ID, { abilityId: CHAOS_SCRAMBLED_ABILITY, mode: "move", locationId: "city" }));
  assert.equal(state.players.c.locationId, "city");

  const blocked = setup("chaos-scrambled-move-invalid");
  start(blocked);
  blocked.phase = "action";
  blocked.players.c.locationId = "mountain";
  blocked.board.locations.mountain = ["c"];
  assert.throws(() => useChaosBeastEngine(ctx(blocked, CHAOS_SCRAMBLED_SEAL_ID, { abilityId: CHAOS_SCRAMBLED_ABILITY, mode: "move", locationId: "scouting" })), /CHAOS_SCRAMBLED_SEAL_LOCATION_INVALID/);
  assert.equal(blocked.players.c.flags.chaosScrambledSealUsed, undefined);
});

test("Scrambled Seals beast mode reuses The 666 play procedure during Action and consumes the once-per-game component", () => {
  const state = setup("chaos-scrambled-beast");
  start(state);
  drawAll(state);
  state.phase = "action";
  let opened;
  const result = useChaosBeastEngine(ctx(state, CHAOS_SCRAMBLED_SEAL_ID, { abilityId: CHAOS_SCRAMBLED_ABILITY, mode: "beast-play" }, {
    openDecision(value) { opened = value; },
  }));
  assert.equal(result.result.pending, true);
  assert.ok(opened.options.length > 0);
  assert.equal(state.players.c.flags.chaosScrambledSealUsed, true);
});

test("The 666 creates an isolated 15-card Beast deck, removes ordinary seals, and draws per individual mana gain", () => {
  const state = setup("chaos-666");
  start(state);
  const side = getNamedSideDeck(state, "c", CHAOS_BEAST_DECK_ID);
  assert.equal(side.deck.length, 15);
  assert.equal(side.hand.length, 0);
  assert.equal(state.players.c.commandSeals, 0);
  const two = useChaosBeastEngine(ctx(state, CHAOS_666_ID, {
    eventType: "player.mana.changed",
    event: { playerId: "c", delta: 4, sourceId: "test-gain" },
  }));
  assert.equal(two.drawnInstanceIds.length, 2);
  const before = side.hand.length;
  useChaosBeastEngine(ctx(state, CHAOS_666_ID, { eventType: "player.mana.changed", event: { playerId: "c", delta: 1, sourceId: "gain-a" } }));
  useChaosBeastEngine(ctx(state, CHAOS_666_ID, { eventType: "player.mana.changed", event: { playerId: "c", delta: 1, sourceId: "gain-b" } }));
  assert.equal(side.hand.length, before);
  useChaosBeastEngine(ctx(state, CHAOS_666_ID, { eventType: "player.mana.changed", event: { playerId: "c", delta: 6, sourceId: CHAOS_DEVOURER_ID } }));
  assert.equal(side.hand.length, before);
});

test("The 666 pays Beast printed cost by discarding Beasts, not mana", () => {
  const state = setup("chaos-play");
  start(state);
  drawAll(state);
  const manaBefore = state.players.c.mana;
  const result = playBeast(state, "master.chaos.skill.s7", ["master.chaos.skill.s2", "master.chaos.skill.s3"]);
  const violator = sideInstance(state, "master.chaos.skill.s7");
  assert.equal(result.beastCost, 2);
  assert.equal(state.players.c.mana, manaBefore);
  assert.equal(violator.zone, "attack");
  assert.equal(violator.active, true);
  assert.equal(getNamedSideDeck(state, "c", CHAOS_BEAST_DECK_ID).discard.length, 2);
  assert.equal(namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID).includes(violator.instanceId), false);
  assert.equal(isChaosBeastEngineLegal(state, "c", built.skills.get(CHAOS_666_ID), built.skills.get(CHAOS_666_ID).abilities[0], definitions), false);
});

test("Devourer discards up to 3 Beast-hand cards for double mana and its gain is excluded from The 666", () => {
  const state = setup("chaos-devourer");
  start(state);
  drawAll(state);
  playBeast(state, CHAOS_DEVOURER_ID);
  state.phase = "action";
  state.players.c.mana = 0;
  let opened;
  useChaosBeastEngine(ctx(state, CHAOS_DEVOURER_ID, { abilityId: CHAOS_DEVOURER_ABILITY }, { openDecision(value) { opened = value; } }));
  assert.equal(opened.max, 3);
  const frame = state.effectQueue.shift();
  const picks = namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID).slice(0, 3);
  const result = resolve(state, CHAOS_DEVOURER_ID, frame.payload, picks);
  assert.equal(result.manaGained, 6);
  assert.equal(state.players.c.mana, 6);
  const handAfter = namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID).length;
  useChaosBeastEngine(ctx(state, CHAOS_666_ID, { eventType: "player.mana.changed", event: { playerId: "c", delta: 6, sourceId: CHAOS_DEVOURER_ID } }));
  assert.equal(namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID).length, handAfter);
});

test("Watcher schedules next-round Preparation draw 3 then exact discard 2", () => {
  const state = setup("chaos-watcher");
  start(state);
  drawAll(state);
  playBeast(state, CHAOS_WATCHER_ID);
  const watcher = sideInstance(state, CHAOS_WATCHER_ID);
  useChaosBeastEngine(ctx(state, CHAOS_WATCHER_ID, { eventType: "card.played", event: { playerId: "c", instanceId: watcher.instanceId } }));
  assert.equal(state.players.c.flags.chaosWatcherPrepRound, 4);
  state.round = 4;
  state.phase = "preparation";
  let opened;
  const result = useChaosBeastEngine(ctx(state, CHAOS_666_ID, { eventType: "round.started", event: {} }, { openDecision(value) { opened = value; } }));
  assert.equal(result.pending, true);
  assert.equal(opened.min, 2);
  assert.equal(opened.max, 2);
  const frame = state.effectQueue.shift();
  const picks = frame.payload.candidates.slice(0, 2);
  const discarded = resolve(state, CHAOS_666_ID, frame.payload, picks);
  assert.equal(discarded.discardedInstanceIds.length, 2);
  assert.equal(state.players.c.flags.chaosWatcherPrepRound, undefined);
});

test("Colossus loss draws 2 Beasts and The 999th discards Beast hand to set X up to 10", () => {
  const state = setup("chaos-passives");
  start(state);
  drawAll(state);
  playBeast(state, CHAOS_COLOSSUS_ID);
  const recyclable = namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID)
    .filter((instanceId) => state.cards[instanceId].definitionId !== CHAOS_999_ID)
    .slice(0, 2);
  discardNamedSideDeckHandCards(state, "c", CHAOS_BEAST_DECK_ID, recyclable);
  const handBeforeLoss = namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID).length;
  const colossus = useChaosBeastEngine(ctx(state, CHAOS_COLOSSUS_ID, {
    eventType: "combat.resolved",
    event: { powers: { c: 3, o: 7 }, winnerIds: ["o"] },
  }));
  assert.equal(colossus.drawnInstanceIds.length, 2);
  assert.equal(namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID).length, handBeforeLoss + 2);

  state.phase = "outpost";
  delete state.players.c.flags.chaos666OutpostUseRound;
  const ninth = sideInstance(state, CHAOS_999_ID);
  assert.equal(ninth.zone, "side-hand");
  playBeast(state, CHAOS_999_ID);
  const handBeforeDespair = namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID).length;
  const despair = useChaosBeastEngine(ctx(state, CHAOS_999_ID, { eventType: "card.played", event: { playerId: "c", instanceId: ninth.instanceId } }));
  assert.equal(despair.power, Math.min(10, handBeforeDespair * 2));
  assert.equal(namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID).length, 0);
  assert.equal(ninth.powerModifiers.find((modifier) => modifier.id.endsWith(":despair")).value, despair.power);
});

test("Army of One pays 4 mana to draw a Beast and removes The 666 once-per-round gate", () => {
  const state = setup("chaos-army");
  start(state);
  drawNamedSideDeck(state, "c", CHAOS_BEAST_DECK_ID, 5, () => 0);
  createOwnedCardInstance(state, "c", { instanceId: "c:army", definitionId: CHAOS_ASCENSION_ID, zone: "master-skills", face: "up" });
  state.phase = "action";
  const manaBefore = state.players.c.mana;
  const drawnBefore = namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID).length;
  const draw = useChaosBeastEngine(ctx(state, CHAOS_ASCENSION_ID, { abilityId: CHAOS_ASCENSION_DRAW_ABILITY }));
  assert.equal(draw.manaPaid, 4);
  assert.equal(state.players.c.mana, manaBefore - 4);
  assert.equal(namedSideDeckHand(state, "c", CHAOS_BEAST_DECK_ID).length, drawnBefore + 1);
  state.phase = "outpost";
  state.players.c.flags.chaos666OutpostUseRound = state.round;
  assert.equal(isChaosBeastEngineLegal(state, "c", built.skills.get(CHAOS_666_ID), built.skills.get(CHAOS_666_ID).abilities[0], definitions), true);
});
