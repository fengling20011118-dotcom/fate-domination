import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance, drawCards, movePlayerCard } from "../src/rules-core/decks.ts";
import { installDeckEntryRestriction } from "../src/rules-core/deck-entry-rules.ts";
import { applyEventObjectiveNumericEffectMultiplier } from "../src/rules-core/event-effect-modifiers.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  MAGICAL_RUBY_HANDLER,
  RUBY_DOPPELGANGER_ID,
  RUBY_DRAW_ABILITY,
  RUBY_IMAGINATION_ID,
  RUBY_KALEIDOSTICK_ID,
  RUBY_SHUFFLE_ABILITY,
  resolveMagicalRubyDecision,
  useMagicalRuby,
} from "../src/rules-core/magical-ruby.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = {
  ...built.cards,
  ...Object.fromEntries(built.events.map((event) => [event.id, event])),
  ...built.skills.asCardDefinitions(),
};

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "magical-ruby") {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "i", name: "Illya" }, { id: "o", name: "Opponent" }], seed: 777 });
  state.status = "playing";
  state.round = 4;
  state.phase = "preparation";
  state.step = "player-window";
  state.activePlayerId = "i";
  state.turnOrder = ["i", "o"];
  state.players.i.masterId = "master.illya-mahou";
  state.players.i.mana = 20;
  state.players.i.locationId = "mountain";
  state.players.o.locationId = "city";
  state.board.locations.mountain = ["i"];
  state.board.locations.city = ["o"];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return state;
}

function add(state, instanceId, definitionId, zone = "hand", face = "down", active = false) {
  createOwnedCardInstance(state, "i", { instanceId, definitionId, zone, face, active });
}

function context(state, skillId, payload, extra = {}) {
  return {
    state,
    player: state.players.i,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    emitEvent() {},
    randomInt: () => 0,
    ...extra,
  };
}

test("Magical Ruby three-card package is FULL and registered to its dedicated handler", () => {
  for (const id of [RUBY_IMAGINATION_ID, RUBY_KALEIDOSTICK_ID, RUBY_DOPPELGANGER_ID]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL");
    assert.equal(skill.handlerId, MAGICAL_RUBY_HANDLER);
    assert.equal(built.skills.hasHandler(id), true);
    assert.deepEqual(skill.rules?.ambiguities ?? [], []);
    assert.deepEqual(skill.rules?.unmodeledClauses ?? [], []);
  }
});

test("Unlimited Imagination blocks automatic discard recycle and redirects external deck entry to discard", () => {
  const state = setup("ruby-deck-boundary");
  add(state, "imagination", RUBY_IMAGINATION_ID, "master-skills", "up", false);
  add(state, "discard-a", "card.carda1", "discard", "up", false);
  useMagicalRuby(context(state, RUBY_IMAGINATION_ID, { eventType: "game.started", event: {} }));

  const drawn = drawCards(state, "i", 1, () => 0, definitions);
  assert.deepEqual(drawn, []);
  assert.deepEqual(state.players.i.deck, []);
  assert.deepEqual(state.players.i.discard, ["discard-a"]);

  add(state, "hand-a", "card.cardb1", "hand", "down", false);
  movePlayerCard(state, "i", "hand-a", "deck");
  assert.equal(state.cards["hand-a"].zone, "discard");
  assert.equal(state.cards["hand-a"].face, "up");
  assert.deepEqual(state.players.i.deck, []);
});

test("Kaleidostick Prep draw chooses any count from the current deck without recycling discard", () => {
  const state = setup("ruby-draw");
  const engine = new StandardMatchEngine(built);
  add(state, "imagination", RUBY_IMAGINATION_ID, "master-skills", "up", false);
  add(state, "stick", RUBY_KALEIDOSTICK_ID, "master-skills", "up", false);
  add(state, "deck-a", "card.carda1", "deck", "down", false);
  add(state, "deck-b", "card.cardb1", "deck", "down", false);
  add(state, "discard-a", "card.carda2", "discard", "up", false);
  installDeckEntryRestriction(state.players.i, RUBY_IMAGINATION_ID);

  let result = engine.execute(state, command(state, "ruby-draw-open", CommandType.UseSkill, "i", {
    skillId: RUBY_KALEIDOSTICK_ID,
    data: { abilityId: RUBY_DRAW_ABILITY },
  }));
  assert.equal(result.state.pendingDecision?.kind, "magical-ruby-draw");
  assert.ok(result.state.pendingDecision?.options.some((option) => option.id === "2"));
  result = engine.execute(result.state, command(result.state, "ruby-draw-two", CommandType.ResolveDecision, "i", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["2"],
  }));
  assert.equal(result.state.players.i.hand.length, 2);
  assert.equal(result.state.players.i.deck.length, 0);
  assert.deepEqual(result.state.players.i.discard, ["discard-a"]);
});

test("Kaleidostick Prep shuffle pays twice hand size and is the explicit exception that may return discard to deck", () => {
  const state = setup("ruby-shuffle");
  const engine = new StandardMatchEngine(built);
  add(state, "stick", RUBY_KALEIDOSTICK_ID, "master-skills", "up", false);
  add(state, "hand-a", "card.carda1", "hand", "down", false);
  add(state, "hand-b", "card.cardb1", "hand", "down", false);
  add(state, "discard-a", "card.carda2", "discard", "up", false);
  add(state, "discard-b", "card.cardb2", "discard", "up", false);
  installDeckEntryRestriction(state.players.i, RUBY_IMAGINATION_ID);
  const manaBefore = state.players.i.mana;

  const result = engine.execute(state, command(state, "ruby-shuffle", CommandType.UseSkill, "i", {
    skillId: RUBY_KALEIDOSTICK_ID,
    data: { abilityId: RUBY_SHUFFLE_ABILITY },
  }));
  assert.equal(result.state.players.i.mana, manaBefore - 4);
  assert.equal(result.state.players.i.discard.length, 0);
  assert.deepEqual(new Set(result.state.players.i.deck), new Set(["discard-a", "discard-b"]));
  assert.equal(result.state.cards["discard-a"].zone, "deck");
  assert.equal(result.state.cards["discard-b"].zone, "deck");
});

test("Doppelganger doubles structured event/objective power effects but not mana or VP", () => {
  const state = setup("ruby-doppel-double");
  state.phase = "combat";
  add(state, "attack", "card.cardb1", "attack", "up", true);
  state.board.currentEvents.mountain = ["event.fuyuki.6"];
  state.board.eventVisibility["event.fuyuki.6"] = "up";
  const baseline = calculateCombatCardPower(state, state.players.i, "attack", definitions, "mountain");

  add(state, "doppel", RUBY_DOPPELGANGER_ID, "master-skills", "up", false);
  const doubled = calculateCombatCardPower(state, state.players.i, "attack", definitions, "mountain");
  assert.equal(doubled - baseline, 3);
  assert.equal(applyEventObjectiveNumericEffectMultiplier(state, "i", definitions, "mana", 4), 4);
  assert.equal(applyEventObjectiveNumericEffectMultiplier(state, "i", definitions, "victory-points", 3), 3);
});

test("Doppelganger end-round upkeep pays 3 or is removed when payment is impossible", () => {
  const state = setup("ruby-upkeep-pay");
  add(state, "doppel", RUBY_DOPPELGANGER_ID, "master-skills", "up", false);
  let decision;
  useMagicalRuby(context(state, RUBY_DOPPELGANGER_ID, { eventType: "round.ending", event: { round: state.round } }, {
    openDecision(value) { decision = value; },
  }));
  assert.equal(decision.kind, "magical-ruby-doppelganger-upkeep");
  const previous = state.effectQueue.shift().payload;
  const manaBefore = state.players.i.mana;
  resolveMagicalRubyDecision(context(state, RUBY_DOPPELGANGER_ID, {
    previous,
    decision: { status: "resolved", selections: ["pay"] },
  }));
  assert.equal(state.players.i.mana, manaBefore - 3);
  assert.equal(state.cards.doppel.zone, "master-skills");

  const noMana = setup("ruby-upkeep-remove");
  noMana.players.i.mana = 2;
  add(noMana, "doppel", RUBY_DOPPELGANGER_ID, "master-skills", "up", false);
  useMagicalRuby(context(noMana, RUBY_DOPPELGANGER_ID, { eventType: "round.ending", event: { round: noMana.round } }));
  assert.equal(noMana.cards.doppel.zone, "removed");
});
