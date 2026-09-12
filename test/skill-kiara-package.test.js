import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, drawCards } from "../src/rules-core/decks.ts";
import { getStructuredStandardAttackCardCountRule, isStructuredCardDrawForbidden, isStructuredDefeatIgnored } from "../src/rules-core/rule-modifiers.ts";
import { projectPublicState } from "../src/projection/project-state.ts";
import {
  KIARA_ASCENSION_ID,
  KIARA_DESIRE_ID,
  KIARA_DIAMOND_ID,
  KIARA_GARDENS_ID,
  KIARA_HANDLER,
  KIARA_HEAVENS_HOLE_ID,
  KIARA_MASTER_ID,
  KIARA_REALM_IDS,
  KIARA_THESIS_ID,
  KIARA_WOMB_ID,
  getKiaraSecretGardens,
  resolveKiaraDecision,
  useKiaraSecretGardens,
} from "../src/rules-core/kiara.ts";

const built = buildStandardContent(legacyContent);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function setup(id = "kiara", playerCount = 3) {
  const players = [{ id: "k", name: "Kiara" }, { id: "a", name: "A" }, { id: "b", name: "B" }].slice(0, playerCount);
  const state = createGameState({ gameInstanceId: id, players, seed: 31337 });
  state.status = "playing";
  state.round = 4;
  state.phase = "preparation";
  state.step = "player-window";
  state.turnOrder = players.map((player) => player.id);
  state.activePlayerId = state.turnOrder[0];
  state.modeState.phaseStartPlayerId = state.activePlayerId;
  state.players.k.masterId = "master.kiara";
  state.players.k.locationId = "mountain";
  for (const player of players.slice(1)) player.id && (state.players[player.id].locationId = "mountain");
  state.board.locations.mountain = [...state.turnOrder];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return state;
}

function ctx(state, skillId, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.k,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extra,
  };
}

function startGardens(state, randomInt = () => 0) {
  return useKiaraSecretGardens(ctx(state, KIARA_MASTER_ID, { eventType: "game.started", event: {} }, { randomInt }));
}

function resolveFrame(state, skillId, frame, selections, extra = {}) {
  return resolveKiaraDecision(ctx(state, skillId, {
    previous: frame.payload,
    decision: { status: "resolved", selections },
  }, extra));
}

function command(state, id, actorId) {
  return {
    commandId: id,
    gameInstanceId: state.gameInstanceId,
    actorId,
    expectedRevision: state.revision,
    type: CommandType.CompletePlayerWindow,
    payload: {},
  };
}

test("Kiara package is 8/8 FULL; catalogue helpers and Realms are not initially physical", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.kiara");
  assert.equal(skills.length, 8);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => skill.handlerId === KIARA_HANDLER));
  for (const id of [KIARA_THESIS_ID, KIARA_GARDENS_ID, KIARA_HEAVENS_HOLE_ID, ...KIARA_REALM_IDS, KIARA_ASCENSION_ID]) {
    assert.equal(built.skills.get(id).initiallyOwned, false);
  }
});

test("Secret Gardens use opaque ids, random holders, holder-private projection, and public reveal state", () => {
  const state = setup("kiara-private");
  let call = 0;
  startGardens(state, (max) => (call++ % Math.max(1, max)));
  const gardens = getKiaraSecretGardens(state, "k");
  assert.equal(gardens.length, 6);
  assert.ok(gardens.every((garden) => /^kiara-garden:\d+$/.test(garden.id)));
  assert.ok(new Set(gardens.map((garden) => garden.holderPlayerId)).size >= 2);

  const viewA = projectPublicState(state, "a");
  const viewB = projectPublicState(state, "b");
  assert.equal(viewA.modeState.privateRulesState, undefined);
  assert.equal(viewB.modeState.privateRulesState, undefined);
  assert.deepEqual(Object.keys(viewA.modeState.privatePlayerKnowledge), ["a"]);
  assert.deepEqual(Object.keys(viewB.modeState.privatePlayerKnowledge), ["b"]);
  const knownA = viewA.modeState.privatePlayerKnowledge.a.kiaraSecretGardens;
  assert.ok(knownA.every((garden) => gardens.find((item) => item.id === garden.id)?.holderPlayerId === "a"));

  const winner = gardens[0].holderPlayerId;
  let opened;
  const result = useKiaraSecretGardens(ctx(state, KIARA_MASTER_ID, {
    eventType: "combat.resolved",
    event: { participantIds: ["k", winner], winnerIds: [winner] },
  }, { openDecision(value) { opened = value; } }));
  if (result?.pending) {
    const frame = state.effectQueue.shift();
    resolveFrame(state, KIARA_MASTER_ID, frame, [opened.options[0].id]);
  }
  const publicAfter = projectPublicState(state, "b").modeState.publicRulesState.kiaraSecretGardens;
  assert.equal(publicAfter.length, 1);
  assert.equal(typeof publicAfter[0].kind, "string");
});

test("Thesis grants the Garden VP only if Kiara did not move this round", () => {
  const state = setup("kiara-thesis");
  startGardens(state);
  const garden = getKiaraSecretGardens(state, "k")[0];
  const before = state.players.k.victoryPoints;
  let opened;
  let frameResult = useKiaraSecretGardens(ctx(state, KIARA_MASTER_ID, {
    eventType: "combat.resolved",
    event: { participantIds: ["k", garden.holderPlayerId], winnerIds: [garden.holderPlayerId] },
  }, { openDecision(value) { opened = value; } }));
  if (frameResult?.pending) {
    const frame = state.effectQueue.shift();
    frameResult = resolveFrame(state, KIARA_MASTER_ID, frame, [garden.id]);
  }
  assert.equal(frameResult.gainedVictoryPoints, garden.victoryPoints);
  assert.equal(state.players.k.victoryPoints, before + garden.victoryPoints);

  const stateMoved = setup("kiara-thesis-moved");
  startGardens(stateMoved);
  stateMoved.players.k.flags.movementCountThisRound = 1;
  const movedGarden = getKiaraSecretGardens(stateMoved, "k")[0];
  const movedBefore = stateMoved.players.k.victoryPoints;
  let movedResult = useKiaraSecretGardens(ctx(stateMoved, KIARA_MASTER_ID, {
    eventType: "combat.resolved",
    event: { participantIds: ["k", movedGarden.holderPlayerId], winnerIds: [movedGarden.holderPlayerId] },
  }, { openDecision(value) { opened = value; } }));
  if (movedResult?.pending) {
    const frame = stateMoved.effectQueue.shift();
    movedResult = resolveFrame(stateMoved, KIARA_MASTER_ID, frame, [movedGarden.id]);
  }
  assert.equal(movedResult.gainedVictoryPoints, 0);
  assert.equal(stateMoved.players.k.victoryPoints, movedBefore);
});

test("Heaven's Hole removes chosen skills, applies Bodhisattva Shakespeare counting exception, and materializes chosen Realms", () => {
  const state = setup("kiara-hole");
  startGardens(state);
  state.round = 8;
  for (let index = 1; index <= 3; index += 1) {
    createOwnedCardInstance(state, "k", {
      instanceId: `k:shake:${index}`,
      definitionId: `servant.shakespeare.skill.sc-shakespeare-${index}`,
      originServantId: "servant.shakespeare",
      zone: "servant-skills",
      face: "up",
    });
  }
  createOwnedCardInstance(state, "k", { instanceId: "k:bodhi", definitionId: KIARA_ASCENSION_ID, originMasterId: "master.kiara", zone: "master-skills", face: "up" });

  let opened;
  const begin = useKiaraSecretGardens(ctx(state, KIARA_MASTER_ID, { eventType: "round.ending", event: { round: 8 } }, {
    openDecision(value) { opened = value; },
  }));
  assert.equal(begin.pending, true);
  assert.equal(opened.min, 0);
  const removeFrame = state.effectQueue.shift();
  const afterRemove = resolveFrame(state, KIARA_MASTER_ID, removeFrame, [], { openDecision(value) { opened = value; } });
  assert.equal(afterRemove.pending, true);
  assert.equal(opened.min, 2);
  assert.equal(opened.max, 2);
  const realmFrame = state.effectQueue.shift();
  const selectedRealms = [KIARA_WOMB_ID, KIARA_DIAMOND_ID];
  const done = resolveFrame(state, KIARA_MASTER_ID, realmFrame, selectedRealms);
  assert.equal(done.addedRealmInstanceIds.length, 2);
  assert.equal(state.players.k.flags.outpostActionDuringPreparation, true);
  assert.ok(selectedRealms.every((definitionId) => state.players.k.masterSkills.some((instanceId) => state.cards[instanceId].definitionId === definitionId)));
  assert.equal(state.players.k.servantSkills.length, 3);
});

test("generic early-phase boundary gives Kiara only her own Outpost/Action during Preparation and skips normal turns later", () => {
  const engine = new StandardMatchEngine(built);
  let state = setup("kiara-early-phase");
  state.turnOrder = ["a", "k", "b"];
  state.activePlayerId = "a";
  state.modeState.phaseStartPlayerId = "a";
  state.players.k.flags.outpostActionDuringPreparation = true;

  let result = engine.execute(state, command(state, "prep-a", "a"));
  assert.equal(result.state.phase, "preparation");
  assert.equal(result.state.activePlayerId, "k");
  result = engine.execute(result.state, command(result.state, "prep-k", "k"));
  assert.equal(result.state.phase, "outpost");
  assert.equal(result.state.activePlayerId, "k");
  assert.ok(result.events.some((event) => event.type === "phase.embedded-transitioned"));
  result = engine.execute(result.state, command(result.state, "embedded-outpost-k", "k"));
  assert.equal(result.state.phase, "action");
  assert.equal(result.state.step, "move-decision");
  result = engine.execute(result.state, command(result.state, "embedded-move-pass-k", "k"));
  assert.equal(result.state.step, "play-batch-draft");
  result = engine.execute(result.state, command(result.state, "embedded-play-pass-k", "k"));
  assert.equal(result.state.phase, "preparation");
  assert.equal(result.state.activePlayerId, "b");
  assert.equal(result.state.players.k.flags.outpostTakenEarlyRound, result.state.round);
  assert.equal(result.state.players.k.flags.actionTakenEarlyRound, result.state.round);

  result = engine.execute(result.state, command(result.state, "prep-b", "b"));
  assert.equal(result.state.phase, "outpost");
  assert.equal(result.state.activePlayerId, "a");
  result = engine.execute(result.state, command(result.state, "outpost-a", "a"));
  assert.equal(result.state.activePlayerId, "b");
  result = engine.execute(result.state, command(result.state, "outpost-b", "b"));
  assert.equal(result.state.phase, "action");
  assert.equal(result.state.activePlayerId, "a");
});

test("Diamond Realm globally forbids ordinary draw, permits Fear of the Infinite draw, allows 0-2 attack cards, and ignores defeated status", () => {
  const state = setup("kiara-diamond");
  startGardens(state);
  createOwnedCardInstance(state, "k", { instanceId: "k:diamond", definitionId: KIARA_DIAMOND_ID, originMasterId: "master.kiara", zone: "attack", face: "up", active: true, residual: true });
  for (let index = 0; index < 4; index += 1) {
    createOwnedCardInstance(state, "a", { instanceId: `a:deck:${index}`, definitionId: "card.cardb1", zone: "deck", face: "down" });
  }
  assert.equal(isStructuredCardDrawForbidden(state, "a", definitions), true);
  assert.deepEqual(drawCards(state, "a", 1, () => 0, definitions), []);
  const countRule = getStructuredStandardAttackCardCountRule(state, "a", definitions);
  assert.deepEqual({ min: countRule.minCount, max: countRule.maxCount }, { min: 0, max: 2 });

  const onPlay = useKiaraSecretGardens(ctx(state, KIARA_DIAMOND_ID, {
    eventType: "card.played", event: { playerId: "k", definitionId: KIARA_DIAMOND_ID, instanceId: "k:diamond" },
  }));
  assert.equal(onPlay.drawn.a.length, 3);
  assert.equal(state.players.a.hand.length, 3);
  state.players.k.defeated = true;
  useKiaraSecretGardens(ctx(state, KIARA_DIAMOND_ID, { eventType: "player.defeated", event: { playerId: "k" } }));
  assert.equal(state.cards["k:diamond"].powerModifiers.find((modifier) => modifier.id.endsWith(":defeated")).value, -5);
  assert.equal(isStructuredDefeatIgnored(state, "k", definitions), true);
});

test("Womb Realm reveals its three Gardens and each surviving Garden suppresses the corresponding replacement window", () => {
  const state = setup("kiara-womb");
  startGardens(state);
  createOwnedCardInstance(state, "k", { instanceId: "k:womb", definitionId: KIARA_WOMB_ID, originMasterId: "master.kiara", zone: "attack", face: "up", active: true });
  state.phase = "action";
  const onPlay = useKiaraSecretGardens(ctx(state, KIARA_WOMB_ID, {
    eventType: "card.played", event: { playerId: "k", definitionId: KIARA_WOMB_ID, instanceId: "k:womb" },
  }));
  assert.equal(onPlay.blockedByGarden, "regrets-past");
  const revealed = getKiaraSecretGardens(state, "k").filter((garden) => garden.revealed).map((garden) => garden.kind).sort();
  assert.deepEqual(revealed, ["escape-reality", "fear-future", "regrets-past"].sort());
  const action = useKiaraSecretGardens(ctx(state, KIARA_WOMB_ID, {
    eventType: "phase.embedded-transitioned", event: { transition: "embedded-action" },
  }));
  assert.equal(action.blockedByGarden, "escape-reality");
  state.phase = "combat";
  const combat = useKiaraSecretGardens(ctx(state, KIARA_WOMB_ID, {
    eventType: "phase.transitioned", event: { transition: "next-phase" },
  }));
  assert.equal(combat.blockedByGarden, "fear-future");
});

test("All the World's Desire reveals Desire Gardens, applies -6, consumes a holder Garden on deployment, and suppresses movement while Control remains", () => {
  const state = setup("kiara-desire", 2);
  startGardens(state);
  createOwnedCardInstance(state, "k", { instanceId: "k:desire", definitionId: KIARA_DESIRE_ID, originMasterId: "master.kiara", zone: "attack", face: "up", active: true });
  useKiaraSecretGardens(ctx(state, KIARA_DESIRE_ID, {
    eventType: "card.played", event: { playerId: "k", definitionId: KIARA_DESIRE_ID, instanceId: "k:desire" },
  }));
  assert.equal(state.cards["k:desire"].powerModifiers.find((modifier) => modifier.id.endsWith(":subjugation")).value, -6);
  const before = getKiaraSecretGardens(state, "k").filter((garden) => garden.holderPlayerId === "a" && !garden.removed).length;
  let opened;
  const deploy = useKiaraSecretGardens(ctx(state, KIARA_DESIRE_ID, {
    eventType: "player.deployed", event: { playerId: "a", locationId: "mountain" },
  }, { openDecision(value) { opened = value; } }));
  if (deploy.pending) {
    const frame = state.effectQueue.shift();
    resolveFrame(state, KIARA_DESIRE_ID, frame, [opened.options[0].id]);
  }
  const after = getKiaraSecretGardens(state, "k").filter((garden) => garden.holderPlayerId === "a" && !garden.removed).length;
  assert.equal(after, before - 1);
  createOwnedCardInstance(state, "a", { instanceId: "a:hand:1", definitionId: "card.cardb1", zone: "hand", face: "down" });
  const move = useKiaraSecretGardens(ctx(state, KIARA_DESIRE_ID, {
    eventType: "player.moved", event: { playerId: "a", locationId: "mountain" },
  }));
  assert.equal(move.suppressedByGarden, true);
  assert.equal(state.players.a.hand.length, 1);
});
