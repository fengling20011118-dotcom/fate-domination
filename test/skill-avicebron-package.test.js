import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { closePlayerCard, createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  AVICEBRON_COMMON_CARD_ID,
  AVICEBRON_COMMON_ID,
  AVICEBRON_HANDLER,
  AVICEBRON_KETER_ID,
  AVICEBRON_LESSER_CARD_ID,
  AVICEBRON_LESSER_ID,
  AVICEBRON_PLATING_ABILITY,
  AVICEBRON_RESEARCH_ID,
  AVICEBRON_STUDY_ABILITY,
  resolveAvicebronDecision,
  useAvicebronGolems,
} from "../src/rules-core/avicebron.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function skill(id) { return built.skills.get(id); }

function setup(id = "avicebron", opponents = 2) {
  const players = [{ id: "a", name: "Avicebron" }];
  for (let i = 0; i < opponents; i += 1) players.push({ id: `o${i + 1}`, name: `Opponent ${i + 1}` });
  const state = createGameState({ gameInstanceId: id, players, seed: 5521 });
  state.status = "playing";
  state.round = 5;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = players.map((entry) => entry.id);
  state.players.a.masterId = "master.rin";
  state.players.a.servantId = "servant.avicebron";
  state.players.a.locationId = "mountain";
  state.players.a.mana = 10;
  for (let i = 0; i < opponents; i += 1) {
    const p = state.players[`o${i + 1}`];
    p.masterId = i === 0 ? "master.kirei" : "master.waver";
    p.servantId = i === 0 ? "servant.cu" : "servant.emiya";
    p.locationId = "mountain";
    p.mana = 10;
  }
  state.board.locations.workshop = [];
  state.board.locations.mountain = players.map((entry) => entry.id);
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return state;
}

function add(state, playerId, instanceId, definitionId, zone = "hand", options = {}) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face: zone === "attack" || zone === "servant-skills" ? "up" : "down",
    active: zone === "attack",
    residual: zone === "attack" && definitions[definitionId]?.residual === true,
    ...options,
  });
}

function ctx(state, skillDefinition, payload, extra = {}) {
  return {
    state,
    player: state.players.a,
    skill: skillDefinition,
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    ...extra,
  };
}

function activeSkill(state, instanceId, skillId) {
  return add(state, "a", instanceId, skillId, "attack", { originServantId: "servant.avicebron", face: "up", active: true, residual: true });
}

function activeGolem(state, instanceId, definitionId) {
  return add(state, "a", instanceId, definitionId, "attack", { originServantId: "servant.avicebron", face: "up", active: true, residual: true });
}

test("Avicebron package is 5/5 FULL and physical Lesser/Common Golems carry the catalogue rules without extra starting skills", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "servant.avicebron");
  assert.equal(skills.length, 5);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.equal(skill(AVICEBRON_RESEARCH_ID).handlerId, AVICEBRON_HANDLER);
  assert.equal(skill(AVICEBRON_KETER_ID).handlerId, AVICEBRON_HANDLER);
  assert.equal(skill(AVICEBRON_LESSER_ID).handlerId, AVICEBRON_HANDLER);
  assert.equal(skill(AVICEBRON_COMMON_ID).handlerId, AVICEBRON_HANDLER);
  assert.equal(skill(AVICEBRON_LESSER_ID).initiallyOwned, false);
  assert.equal(skill(AVICEBRON_COMMON_ID).initiallyOwned, false);
  assert.equal(built.cards[AVICEBRON_LESSER_CARD_ID].residual, true);
  assert.equal(built.cards[AVICEBRON_COMMON_CARD_ID].residual, true);
  assert.equal(built.cards[AVICEBRON_LESSER_CARD_ID].linkedSkillId, AVICEBRON_LESSER_ID);
  assert.equal(built.cards[AVICEBRON_COMMON_CARD_ID].linkedSkillId, AVICEBRON_COMMON_ID);
  for (const id of [AVICEBRON_RESEARCH_ID, AVICEBRON_KETER_ID, AVICEBRON_LESSER_ID, AVICEBRON_COMMON_ID]) {
    assert.equal(built.skills.hasHandler(id), true);
    assert.deepEqual(skill(id).rules?.ambiguities ?? [], []);
    assert.deepEqual(skill(id).rules?.unmodeledClauses ?? [], []);
  }
});

test("Kabbalistic Study discards exactly two basic Magic/Preparation cards and gains 2 mana", () => {
  const state = setup("avicebron-study");
  state.phase = "outpost";
  add(state, "a", "magic", "card.carda1");
  add(state, "a", "prep", "card.cardpreparation");
  add(state, "a", "strength", "card.cardb1");
  state.players.a.mana = 3;
  const result = useAvicebronGolems(ctx(state, skill(AVICEBRON_RESEARCH_ID), {
    abilityId: AVICEBRON_STUDY_ABILITY,
    discardInstanceIds: ["magic", "prep"],
  }));
  assert.deepEqual(new Set(result.discardedInstanceIds), new Set(["magic", "prep"]));
  assert.equal(result.manaGained, 2);
  assert.equal(state.players.a.mana, 5);
  assert.equal(state.cards.magic.zone, "discard");
  assert.equal(state.cards.prep.zone, "discard");
  assert.ok(state.players.a.hand.includes("strength"));
  add(state, "a", "magic2", "card.carda2");
  add(state, "a", "prep2", "card.cardpreparation");
  assert.throws(() => useAvicebronGolems(ctx(state, skill(AVICEBRON_RESEARCH_ID), {
    abilityId: AVICEBRON_STUDY_ABILITY,
    discardInstanceIds: ["strength", "prep2"],
  })), /AVICEBRON_STUDY_SELECTION_INVALID/);
});

test("each active non-skill Golem adds +1 mana to Golems in hand and the source-bound surcharge disappears when a source closes", () => {
  const state = setup("avicebron-cost", 1);
  activeGolem(state, "lesser-active", AVICEBRON_LESSER_CARD_ID);
  activeGolem(state, "common-active", AVICEBRON_COMMON_CARD_ID);
  add(state, "a", "lesser-hand", AVICEBRON_LESSER_CARD_ID, "hand", { originServantId: "servant.avicebron" });
  for (const instanceId of ["lesser-active", "common-active"]) {
    useAvicebronGolems(ctx(state, skill(AVICEBRON_RESEARCH_ID), {
      eventType: "card.played",
      event: { playerId: "a", instanceId, definitionId: state.cards[instanceId].definitionId },
    }));
  }
  const handCard = state.cards["lesser-hand"];
  assert.equal(getCardPlayCost(state, definitions[handCard.definitionId], state.players.a, handCard, definitions), 2);
  closePlayerCard(state, "a", "common-active", definitions);
  assert.equal(getCardPlayCost(state, definitions[handCard.definitionId], state.players.a, handCard, definitions), 1);
});

test("Unique Golem upkeep uses physical deck-card ownership and requires one non-skill Golem close per engaged opponent", () => {
  const state = setup("avicebron-upkeep", 1);
  activeGolem(state, "lesser-active", AVICEBRON_LESSER_CARD_ID);
  activeGolem(state, "common-active", AVICEBRON_COMMON_CARD_ID);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  const frames = enqueuePassiveEffects(state, passives, {
    eventId: "evt:combat-turn",
    sourceCommandId: "test",
    revision: state.revision,
    type: "phase.transitioned",
    payload: { previousPhase: "action", transition: "next-phase" },
  }).filter((frame) => frame.sourceId === AVICEBRON_LESSER_ID || frame.sourceId === AVICEBRON_COMMON_ID);
  assert.equal(frames.length, 1, "Unique collapses Lesser/Common Golem upkeep into one passive frame");
  let decision;
  const pending = useAvicebronGolems(ctx(state, skill(frames[0].sourceId), {
    eventType: "phase.transitioned",
    event: { previousPhase: "action", transition: "next-phase" },
  }, { openDecision(value) { decision = value; } }));
  assert.equal(pending.pending, true);
  assert.equal(pending.required, 1);
  assert.equal(decision.min, 1);
  assert.equal(decision.max, 1);
  const previous = state.effectQueue.find((entry) => entry.handlerId === "core.avicebron-golems-resolve")?.payload;
  const resolved = resolveAvicebronDecision(ctx(state, skill(frames[0].sourceId), {
    previous,
    decision: { status: "resolved", selections: ["lesser-active"] },
  }));
  assert.deepEqual(resolved.closedOrDeferredGolemIds, ["lesser-active"]);
  assert.equal(state.cards["lesser-active"].zone, "attack");
  assert.equal(state.cards["lesser-active"].face, "down");
  assert.equal(state.cards["lesser-active"].active, false);
  assert.equal(state.cards["common-active"].zone, "attack");
});

test("Reinforced Golem Plating postpones a real close until combat ending", () => {
  const state = setup("avicebron-plating", 1);
  activeSkill(state, "research", AVICEBRON_RESEARCH_ID);
  activeGolem(state, "golem", AVICEBRON_COMMON_CARD_ID);
  useAvicebronGolems(ctx(state, skill(AVICEBRON_RESEARCH_ID), { abilityId: AVICEBRON_PLATING_ABILITY }));
  closePlayerCard(state, "a", "golem", definitions);
  assert.equal(state.cards.golem.zone, "attack");
  assert.equal(state.cards.golem.active, true);
  assert.ok(state.cards.golem.deferredCloseAfterCombatSourceIds?.includes(AVICEBRON_RESEARCH_ID));
  const ending = useAvicebronGolems(ctx(state, skill(AVICEBRON_RESEARCH_ID), { eventType: "combat.ending", event: {} }));
  assert.deepEqual(ending.closedInstanceIds, ["golem"]);
  assert.equal(state.cards.golem.zone, "attack");
  assert.equal(state.cards.golem.face, "down");
  assert.equal(state.cards.golem.active, false);
});

test("Keter deactivates all Golems when Avicebron lacks highest power, but a tie for highest survives", () => {
  const loss = setup("avicebron-keter-loss", 1);
  activeSkill(loss, "keter", AVICEBRON_KETER_ID);
  activeGolem(loss, "golem", AVICEBRON_LESSER_CARD_ID);
  const result = useAvicebronGolems(ctx(loss, skill(AVICEBRON_KETER_ID), {
    eventType: "combat.resolved",
    event: { participantIds: ["a", "o1"], winnerIds: ["o1"], powers: { a: 5, o1: 7 } },
  }));
  assert.deepEqual(new Set(result.closedOrDeferredGolemIds), new Set(["keter", "golem"]));
  assert.notEqual(loss.cards.keter.zone, "attack");
  assert.equal(loss.cards.golem.zone, "attack");
  assert.equal(loss.cards.golem.face, "down");
  assert.equal(loss.cards.golem.active, false);

  const tie = setup("avicebron-keter-tie", 1);
  activeSkill(tie, "keter", AVICEBRON_KETER_ID);
  activeGolem(tie, "golem", AVICEBRON_LESSER_CARD_ID);
  useAvicebronGolems(ctx(tie, skill(AVICEBRON_KETER_ID), {
    eventType: "combat.resolved",
    event: { participantIds: ["a", "o1"], winnerIds: ["a", "o1"], powers: { a: 7, o1: 7 } },
  }));
  assert.equal(tie.cards.keter.zone, "attack");
  assert.equal(tie.cards.golem.zone, "attack");
});

test("Keter win puts one physical Golem from hand/deck/discard into play for free and its residual hand-cost aura starts immediately", () => {
  const state = setup("avicebron-keter-win", 1);
  activeSkill(state, "keter", AVICEBRON_KETER_ID);
  add(state, "a", "candidate", AVICEBRON_COMMON_CARD_ID, "discard", { originServantId: "servant.avicebron", face: "up" });
  add(state, "a", "hand-golem", AVICEBRON_LESSER_CARD_ID, "hand", { originServantId: "servant.avicebron" });
  // Keep exactly one eligible candidate outside attack for deterministic direct resolution.
  state.players.a.hand = state.players.a.hand.filter((id) => id !== "hand-golem");
  state.cards["hand-golem"].zone = "removed";
  const result = useAvicebronGolems(ctx(state, skill(AVICEBRON_KETER_ID), {
    eventType: "combat.resolved",
    event: { participantIds: ["a", "o1"], winnerIds: ["a"], powers: { a: 8, o1: 6 } },
  }));
  assert.equal(result.putIntoPlay.instanceId, "candidate");
  assert.equal(state.cards.candidate.zone, "attack");
  assert.equal(state.cards.candidate.active, true);
  assert.equal(state.cards.candidate.residual, true);
  assert.equal(state.cards.candidate.paidCost, 0);

  add(state, "a", "new-hand-golem", AVICEBRON_LESSER_CARD_ID, "hand", { originServantId: "servant.avicebron" });
  const hand = state.cards["new-hand-golem"];
  assert.equal(getCardPlayCost(state, definitions[hand.definitionId], state.players.a, hand, definitions), 1);
});
