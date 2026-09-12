import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { areLocationsAdjacentByMovementArrows, deployPlayer, movePlayer } from "../src/rules-core/board.ts";
import { spendNormalCommandSeal } from "../src/rules-core/command-seals.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getStructuredCardCost, getStructuredCardPower } from "../src/rules-core/rule-modifiers.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { captureStateFacts, emitStateFactDiff } from "../src/rules-core/state-facts.ts";
import {
  FUJINO_ASCENSION_ID,
  FUJINO_BEND_ABILITY,
  FUJINO_DISTORTION_ID,
  FUJINO_HANDLER,
  FUJINO_HYPOSTHESIA_ID,
  FUJINO_INJURY_ID,
  FUJINO_REPAIR_ABILITY,
  FUJINO_WARP_ID,
  resolveFujinoDecision,
  useFujinoPackage,
} from "../src/rules-core/fujino.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  "card.test.basic": { id: "card.test.basic", name: "Basic", cardType: "attack", cost: 0, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.skill": { id: "card.test.skill", name: "Skill", cardType: "attack", cost: 3, basePower: 1, typeLabel: "特殊", attributes: ["特殊"], isSkill: true },
};

function setup(id = "fujino") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "f", name: "Fujino" }, { id: "o", name: "Opponent" }],
    seed: 1301,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "f";
  state.players.f.masterId = "master.fujino";
  state.players.f.locationId = "mountain";
  state.players.f.mana = 20;
  state.players.f.victoryPoints = 5;
  state.players.f.commandSeals = 3;
  state.players.o.locationId = "city";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["f"];
  state.board.locations.city = ["o"];
  state.board.locations.scouting = [];
  return state;
}

function addSkill(state, skillId, instanceId = skillId.split(".").at(-1), zone = "master-skills", active = false) {
  const definitionId = `card.skill.${skillId}`;
  assert.ok(definitions[definitionId], definitionId);
  return createOwnedCardInstance(state, "f", {
    instanceId,
    definitionId,
    originMasterId: "master.fujino",
    zone,
    face: "up",
    active,
    residual: false,
  });
}

function context(state, skillId, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.f,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    randomInt: () => 0,
    openDecision() {},
    emitEvent() {},
    ...extra,
  };
}

function autoGainInjury(state, injuryId) {
  state.players.f.flags.fujinoInjuryDeck = [injuryId];
  return useFujinoPackage(context(state, FUJINO_HYPOSTHESIA_ID, {
    eventType: "phase.transitioned",
    event: { previousPhase: "action", phase: "combat" },
  }));
}

test("Fujino package is 6/6 FULL and all non-setup mechanics are executable", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.fujino");
  assert.equal(skills.length, 6);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.equal(built.skills.get(FUJINO_HYPOSTHESIA_ID).handlerId, FUJINO_HANDLER);
  assert.equal(built.skills.get(FUJINO_WARP_ID).handlerId, FUJINO_HANDLER);
  assert.equal(built.skills.get(FUJINO_DISTORTION_ID).handlerId, FUJINO_HANDLER);
  assert.equal(built.skills.get(FUJINO_INJURY_ID).handlerId, FUJINO_HANDLER);
  assert.equal(built.skills.get(FUJINO_ASCENSION_ID).handlerId, FUJINO_HANDLER);
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
});

test("Hyposthesia draws two random Injuries, keeps the chosen one, and Head discards immediately plus at Action start", () => {
  const state = setup("fujino-head");
  const handA = createOwnedCardInstance(state, "f", { instanceId: "h1", definitionId: "card.test.basic", zone: "hand", face: "down" });
  createOwnedCardInstance(state, "f", { instanceId: "h2", definitionId: "card.test.basic", zone: "hand", face: "down" });
  state.players.f.flags.fujinoInjuryDeck = ["head", "shoulder", "stomach"];
  let decision;
  const pending = useFujinoPackage(context(state, FUJINO_HYPOSTHESIA_ID, {
    eventType: "phase.transitioned",
    event: { previousPhase: "action", phase: "combat" },
  }, { openDecision(value) { decision = value; } }));
  assert.equal(pending.pending, true);
  assert.deepEqual(decision.options.map((option) => option.id), ["head", "shoulder"]);
  const frame = state.effectQueue.shift();
  const gained = resolveFujinoDecision(context(state, FUJINO_HYPOSTHESIA_ID, {
    previous: frame.payload,
    decision: { status: "resolved", selections: ["head"] },
  }));
  assert.equal(gained.injuryId, "head");
  assert.ok(!state.players.f.flags.fujinoInjuryDeck.includes("head"));
  assert.ok(state.players.f.flags.fujinoInjuryDeck.includes("shoulder"));
  assert.equal(handA.zone, "discard");
  assert.equal(state.players.f.hand.length, 1);

  state.phase = "action";
  useFujinoPackage(context(state, FUJINO_INJURY_ID, { eventType: "phase.transitioned", event: { previousPhase: "outpost" } }));
  assert.equal(state.players.f.hand.length, 0);
});

test("Shoulder, Stomach, Leg and Wrist Injuries use shared power/deployment/movement/seal boundaries", () => {
  const shoulder = setup("fujino-shoulder");
  autoGainInjury(shoulder, "shoulder");
  const basic = createOwnedCardInstance(shoulder, "f", { instanceId: "basic", definitionId: "card.test.basic", zone: "attack", face: "up", active: true });
  assert.equal(getStructuredCardPower(shoulder, "f", basic, definitions["card.test.basic"], definitions, 4), 3);

  const stomach = setup("fujino-stomach");
  autoGainInjury(stomach, "stomach");
  stomach.phase = "outpost";
  stomach.players.f.locationId = null;
  stomach.board.locations.mountain = [];
  deployPlayer(stomach, "f", "mountain", definitions);
  assert.equal(stomach.players.f.flags.deploymentBonus, 1);

  const leg = setup("fujino-leg");
  autoGainInjury(leg, "leg");
  const manaBefore = leg.players.f.mana;
  useFujinoPackage(context(leg, FUJINO_INJURY_ID, { eventType: "player.moved", event: { playerId: "f", fromLocationId: "mountain", locationId: "city" } }));
  assert.equal(leg.players.f.mana, manaBefore - 1);

  const wrist = setup("fujino-wrist");
  autoGainInjury(wrist, "wrist");
  const before = captureStateFacts(wrist);
  spendNormalCommandSeal(wrist, "f");
  const events = [];
  emitStateFactDiff(before, wrist, (type, payload) => events.push({ type, payload }));
  const sealUse = events.find((event) => event.type === "player.command-seal-used");
  assert.ok(sealUse);
  const vpBefore = wrist.players.f.victoryPoints;
  useFujinoPackage(context(wrist, FUJINO_INJURY_ID, { eventType: sealUse.type, event: sealUse.payload }));
  assert.equal(wrist.players.f.victoryPoints, vpBefore - 1);
});

test("Spinal converts active Injuries to Pain, removes remaining Injuries, moves Distortion into attack, and Pain is Unique", () => {
  const state = setup("fujino-spinal");
  addSkill(state, FUJINO_DISTORTION_ID, "distortion");
  state.players.f.flags.fujinoActiveInjuries = ["shoulder"];
  state.players.f.flags.fujinoInjuryDeck = ["spinal", "head", "leg"];
  autoGainInjury(state, "spinal");
  assert.deepEqual(state.players.f.flags.fujinoInjuryDeck, []);
  assert.deepEqual(state.players.f.flags.fujinoActiveInjuries, []);
  assert.equal(state.players.f.flags.fujinoPainCount, 2);
  assert.equal(state.cards.distortion.zone, "attack");
  assert.equal(state.cards.distortion.active, true);

  const skillCard = createOwnedCardInstance(state, "f", { instanceId: "test-skill", definitionId: "card.test.skill", zone: "hand", face: "down" });
  assert.equal(getStructuredCardCost(state, "f", skillCard, definitions["card.test.skill"], definitions, 3), 2);
  useFujinoPackage(context(state, FUJINO_INJURY_ID, { eventType: "combat.ending", event: {} }));
  assert.equal(state.players.f.flags.fujinoPainCount, 1);
  assert.equal(getStructuredCardCost(state, "f", skillCard, definitions["card.test.skill"], definitions, 3), 2);
});

test("Remaining Sense of Pain creates a second Distortion and awards 4 VP when the last post-Spinal Pain is lost", () => {
  const state = setup("fujino-ascension");
  addSkill(state, FUJINO_DISTORTION_ID, "distortion-original");
  const unlocked = useFujinoPackage(context(state, FUJINO_ASCENSION_ID, {
    eventType: "skill.unlocked",
    event: { playerId: "f", skillId: FUJINO_ASCENSION_ID },
  }));
  assert.ok(unlocked.createdInstanceId);
  assert.equal(Object.values(state.cards).filter((card) => definitions[card.definitionId]?.linkedSkillId === FUJINO_DISTORTION_ID).length, 2);

  state.players.f.flags.fujinoSpinalOccurred = true;
  state.players.f.flags.fujinoPainCount = 1;
  const vpBefore = state.players.f.victoryPoints;
  const result = useFujinoPackage(context(state, FUJINO_INJURY_ID, { eventType: "combat.ending", event: {} }));
  assert.equal(result.painAfter, 0);
  assert.equal(result.victoryPoints, 4);
  assert.equal(state.players.f.victoryPoints, vpBefore + 4);
});

test("Bend activates the global Warp Space arrow graph; Repair can be used out of turn and restores normal adjacency", () => {
  const state = setup("fujino-warp");
  state.phase = "action";
  state.step = "player-window";
  state.players.f.locationId = "workshop";
  state.board.locations.workshop = ["f"];
  state.board.locations.mountain = [];
  addSkill(state, FUJINO_WARP_ID, "warp");
  addSkill(state, FUJINO_DISTORTION_ID, "distortion", "attack", true);

  useFujinoPackage(context(state, FUJINO_DISTORTION_ID, { abilityId: FUJINO_BEND_ABILITY }));
  assert.equal(state.cards.warp.active, true);
  assert.equal(areLocationsAdjacentByMovementArrows(state, "workshop", "city"), true);
  assert.equal(areLocationsAdjacentByMovementArrows(state, "workshop", "mountain"), false);
  state.step = "move-decision";
  const cost = movePlayer(state, "f", "city", false, definitions);
  assert.equal(cost, 2);
  assert.equal(state.players.f.locationId, "city");

  state.activePlayerId = "o";
  state.step = "player-window";
  const legal = built.skills.getLegalActions(state, "f", definitions);
  assert.ok(legal.some((action) => action.payload?.skillId === FUJINO_WARP_ID && action.payload?.data?.abilityId === FUJINO_REPAIR_ABILITY));
  useFujinoPackage(context(state, FUJINO_WARP_ID, { abilityId: FUJINO_REPAIR_ABILITY }));
  assert.equal(state.cards.warp.active, false);
  assert.equal(areLocationsAdjacentByMovementArrows(state, "workshop", "mountain"), true);
  assert.equal(areLocationsAdjacentByMovementArrows(state, "workshop", "city"), false);
});
