import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { addEventVictoryPointBonus, getEffectiveEventVictoryPoints } from "../src/rules-core/event-lifecycle.ts";
import { getMoonCellEventEffectRestriction, getMoonCellObjectiveIds, setMoonCellState } from "../src/rules-core/moon-cell.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  BIKUNI_CLAM_ID,
  BIKUNI_DREAM_BUBBLE,
  BIKUNI_HANDLER,
  BIKUNI_HEAVEN_FOAM,
  BIKUNI_MERMAID_ID,
  BIKUNI_MOON_CANCER_ID,
  BIKUNI_OTHERWORLD_ACTION,
  BIKUNI_OTHERWORLD_ID,
  BIKUNI_PHANTOM_CITY,
  resolveBikuniDecision,
  useBikuni,
} from "../src/rules-core/bikuni.ts";
import {
  MOON_CANCER_HANDLER,
  MOON_CANCER_RESTRICT,
  MOON_CANCER_SWAP,
  resolveMoonCancerDecision,
  useMoonCancer,
} from "../src/rules-core/moon-cancer.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function setup(id = "bikuni") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "b", name: "Bikuni" }, { id: "o", name: "Opponent" }, { id: "x", name: "Other" }],
    seed: 23,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "b";
  state.turnOrder = ["b", "o", "x"];
  state.players.b.servantId = "servant.bikuni";
  state.players.b.locationId = "mountain";
  state.players.o.locationId = "city";
  state.players.x.locationId = "city";
  state.board.locations.mountain = ["b"];
  state.board.locations.city = ["o", "x"];
  state.players.b.mana = 5;
  return state;
}

function ctx(state, skillId, payload = {}, extras = {}) {
  return {
    state,
    player: state.players.b,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extras,
  };
}

function activeSkill(state, skillId, instanceId = `b:${skillId}`) {
  return createOwnedCardInstance(state, "b", {
    instanceId,
    definitionId: skillId,
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
  });
}

function placeEvent(state, locationId, eventId) {
  state.board.currentEvents[locationId].push(eventId);
  state.board.eventVisibility[eventId] = "up";
}

function resolveFrame(state, skillId, selection, extras = {}) {
  const frame = state.effectQueue[0];
  assert.ok(frame);
  return resolveBikuniDecision(ctx(state, skillId, {
    previous: frame.payload,
    decision: { status: "resolved", selections: [selection] },
  }, extras));
}

test("Bikuni package is 4/4 FULL with three Bikuni skills plus shared Moon Cancer", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.bikuni");
  assert.equal(skills.length, 4);
  assert.equal(skills.filter((skill) => skill.supportLevel === "FULL").length, 4);
  assert.deepEqual(skills.filter((skill) => skill.supportLevel === "PARTIAL"), []);
  assert.equal(skills.filter((skill) => skill.handlerId === BIKUNI_HANDLER).length, 3);
  assert.equal(built.skills.get(BIKUNI_MOON_CANCER_ID).handlerId, MOON_CANCER_HANDLER);
});

test("Otherworld Creation rewards Moon Cell opponents and Foam of Heaven gains +2 per Moon Cell event", () => {
  const state = setup("bikuni-otherworld");
  activeSkill(state, BIKUNI_OTHERWORLD_ID);
  setMoonCellState(state, { playerIds: ["o", "x"], objectiveEventIds: ["event.a", "event.b"] });
  const result = useBikuni(ctx(state, BIKUNI_OTHERWORLD_ID, { abilityId: BIKUNI_OTHERWORLD_ACTION }));
  assert.equal(state.players.o.victoryPoints, 1);
  assert.equal(state.players.x.victoryPoints, 1);
  assert.equal(result.manaGained, 2);
  assert.equal(state.players.b.mana, 7);

  state.phase = "combat";
  state.activePlayerId = "b";
  const foam = useBikuni(ctx(state, BIKUNI_OTHERWORLD_ID, { abilityId: BIKUNI_HEAVEN_FOAM }));
  assert.equal(foam.powerBonus, 4);
  const source = state.cards[`b:${BIKUNI_OTHERWORLD_ID}`];
  assert.ok(source.powerModifiers.some((modifier) => modifier.value === 4 && modifier.sourceId === BIKUNI_OTHERWORLD_ID));
});

test("Clam Palace moves an event into Moon Cell in Action and returns a chosen Moon Cell event to an empty fight at Combat start", () => {
  const state = setup("bikuni-clam");
  activeSkill(state, BIKUNI_CLAM_ID);
  placeEvent(state, "mountain", "event.local");
  const moved = useBikuni(ctx(state, BIKUNI_CLAM_ID, { abilityId: BIKUNI_PHANTOM_CITY }));
  assert.equal(moved.movedEventId, "event.local");
  assert.deepEqual(state.board.currentEvents.mountain, []);
  assert.deepEqual(getMoonCellObjectiveIds(state), ["event.local"]);

  state.phase = "combat";
  state.activePlayerId = "o";
  const returned = useBikuni(ctx(state, BIKUNI_CLAM_ID, {
    eventType: "phase.transitioned",
    event: { previousPhase: "combat", transition: "next-player" },
  }));
  assert.equal(returned.movedEventId, "event.local");
  assert.deepEqual(state.board.currentEvents.mountain, ["event.local"]);
  assert.deepEqual(getMoonCellObjectiveIds(state), []);
});

test("Dreamlike Bubble discards Luck + target event, draws two replacements, and caps each replacement at 1 VP this round", () => {
  const state = setup("bikuni-mermaid-action");
  activeSkill(state, BIKUNI_MERMAID_ID);
  createOwnedCardInstance(state, "b", { instanceId: "b:luck", definitionId: "card.cardluck", zone: "hand", face: "down", active: false });
  placeEvent(state, "city", "event.old");
  state.board.eventDeck = ["event.new1", "event.new2"];
  let opened;
  useBikuni(ctx(state, BIKUNI_MERMAID_ID, { abilityId: BIKUNI_DREAM_BUBBLE }, { openDecision(decision) { opened = decision; } }));
  assert.equal(opened.kind, "bikuni-dream-bubble");
  const selection = opened.options.find((option) => option.id === "b:luck|city|event.old").id;
  const result = resolveFrame(state, BIKUNI_MERMAID_ID, selection, { randomInt: () => 0 });
  assert.deepEqual(result.drawnEventIds.sort(), ["event.new1", "event.new2"]);
  assert.ok(state.players.b.discard.includes("b:luck"));
  assert.ok(state.board.eventDiscard.includes("event.old"));
  for (const eventId of result.drawnEventIds) {
    assert.equal(getEffectiveEventVictoryPoints(state, eventId, 5), 1);
    addEventVictoryPointBonus(state, eventId, 7);
    assert.equal(getEffectiveEventVictoryPoints(state, eventId, 5), 1);
  }
});

test("Mermaid Flesh residual chooses a Moon Cell event to discard instead of closing its source", () => {
  const state = setup("bikuni-mermaid-upkeep");
  const source = activeSkill(state, BIKUNI_MERMAID_ID, "b:mermaid");
  setMoonCellState(state, { objectiveEventIds: ["event.moon"] });
  let opened;
  const pending = useBikuni(ctx(state, BIKUNI_MERMAID_ID, { eventType: "round.ending", event: {} }, { openDecision(decision) { opened = decision; } }));
  assert.equal(pending.pending, true);
  assert.ok(opened.options.some((option) => option.id === "discard:event.moon"));
  resolveFrame(state, BIKUNI_MERMAID_ID, "discard:event.moon");
  assert.deepEqual(getMoonCellObjectiveIds(state), []);
  assert.ok(state.board.eventDiscard.includes("event.moon"));
  assert.equal(source.active, true);
});

test("Moon Cancer swaps battlefield/Moon Cell events, then restriction discards Moon Cell events at combat end", () => {
  const state = setup("bikuni-moon-cancer");
  const source = activeSkill(state, BIKUNI_MOON_CANCER_ID, "b:moon-cancer");
  placeEvent(state, "mountain", "event.field");
  setMoonCellState(state, { objectiveEventIds: ["event.moon"] });
  let opened;
  useMoonCancer(ctx(state, BIKUNI_MOON_CANCER_ID, { abilityId: MOON_CANCER_SWAP }, { openDecision(decision) { opened = decision; } }));
  assert.ok(opened.options.some((option) => option.id === "event.field|event.moon"));
  const frame = state.effectQueue[0];
  resolveMoonCancerDecision(ctx(state, BIKUNI_MOON_CANCER_ID, {
    previous: frame.payload,
    decision: { status: "resolved", selections: ["event.field|event.moon"] },
  }));
  assert.deepEqual(state.board.currentEvents.mountain, ["event.moon"]);
  assert.deepEqual(getMoonCellObjectiveIds(state), ["event.field"]);

  useMoonCancer(ctx(state, BIKUNI_MOON_CANCER_ID, { abilityId: MOON_CANCER_RESTRICT }));
  assert.equal(source.zone, "discard");
  assert.equal(getMoonCellEventEffectRestriction(state).locationId, "mountain");
  state.phase = "combat";
  useMoonCancer(ctx(state, BIKUNI_MOON_CANCER_ID, { eventType: "combat.ending", event: {} }));
  assert.deepEqual(getMoonCellObjectiveIds(state), []);
  assert.ok(state.board.eventDiscard.includes("event.field"));
  assert.equal(getMoonCellEventEffectRestriction(state), undefined);
});
