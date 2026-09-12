import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { isDeonFleurLegal, resolveDeonParryDiscard, resolveDeonParryTarget, resolveDeonSelfCard, resolveDeonSelfTarget, useDeonFleur, useDeonSelfSuggestion, useDeonSwordDance } from "../src/rules-core/deon.ts";

const SWORD = "servant.deon.skill.sc-deon-1";
const FLEUR = "servant.deon.skill.sc-deon-2";
const SELF = "servant.deon.skill.sc-deon-3";

function setup(id = "deon-package") {
  const built = buildStandardContent(legacyContent);
  registerCoreSkillHandlers(built.skills);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "d", name: "d'Eon" }, { id: "o", name: "Opponent" }], seed: 991 });
  state.status = "playing"; state.round = 4; state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "d";
  state.players.d.servantId = "servant.deon"; state.players.d.mana = 8;
  state.players.o.mana = 8;
  return { built, definitions, state };
}

function putAt(state, playerId, locationId = "mountain") {
  for (const ids of Object.values(state.board.locations)) { const i = ids.indexOf(playerId); if (i >= 0) ids.splice(i, 1); }
  state.board.locations[locationId].push(playerId); state.players[playerId].locationId = locationId;
}

function add(state, playerId, instanceId, definitionId, zone, active = false) {
  return createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face: active ? "up" : "down", active });
}

function basicWithPower(definitions, power) {
  const definition = Object.values(definitions).find((card) => card.basic === true && Number(card.basePower) === power);
  assert.ok(definition, `basic power ${power} missing`); return definition.id;
}

function resolved(previous, selections) { return { previous, decision: { status: "resolved", selections } }; }

test("d'Eon package is 3/3 FULL with dedicated handlers and protected Self-Suggestion", () => {
  const { built } = setup("deon-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.deon");
  assert.equal(skills.length, 3); assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(SWORD).handlerId, "core.deon-sword-dance");
  assert.equal(built.skills.get(FLEUR).handlerId, "core.deon-fleur-de-lys");
  assert.equal(built.skills.get(SELF).handlerId, "core.deon-self-suggestion");
  assert.ok(built.skills.get(SELF).tags.includes("cannot-copy")); assert.ok(built.skills.get(SELF).tags.includes("cannot-steal"));
  assert.equal(built.skills.get(FLEUR).abilities.length, 3);
});

test("Sword Dance costs +1 below 8 mana and Riposte closes it if no Parry occurred", () => {
  const { built, definitions, state } = setup("deon-sword");
  add(state, "d", "sword", SWORD, "attack", true);
  state.players.d.mana = 7;
  assert.equal(getCardPlayCost(state, definitions[SWORD], state.players.d, state.cards.sword, definitions), 3);
  state.players.d.mana = 8;
  assert.equal(getCardPlayCost(state, definitions[SWORD], state.players.d, state.cards.sword, definitions), 2);
  const result = useDeonSwordDance({ state, player: state.players.d, skill: built.skills.get(SWORD), payload: {}, definitions });
  assert.deepEqual(result, { powerBonus: 4 });
  assert.equal(calculateCombatCardPower(state, state.players.d, "sword", definitions, "mountain"), 10);
  state.phase = "combat";
  useDeonSwordDance({ state, player: state.players.d, skill: built.skills.get(SWORD), payload: { eventType: "phase.player-window.closed", event: { playerId: "d", phase: "combat" } }, definitions });
  assert.equal(state.cards.sword.zone, "servant-skills");
});

test("Parry compares printed base power, forces a matching close, and active Fleur gains +3", () => {
  const { built, definitions, state } = setup("deon-parry");
  putAt(state, "d"); putAt(state, "o"); state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "d";
  const p3 = basicWithPower(definitions, 3); const p4 = basicWithPower(definitions, 4);
  add(state, "d", "fleur", FLEUR, "attack", true); add(state, "d", "discard3", p3, "hand");
  const target = add(state, "o", "target3", p3, "attack", true); target.playedRound = state.round;
  add(state, "o", "target4", p4, "attack", true).playedRound = state.round;
  let discardDecision;
  useDeonFleur({ state, player: state.players.d, skill: built.skills.get(FLEUR), payload: { abilityId: "parry" }, definitions, openDecision: (d) => { discardDecision = d; } });
  assert.equal(discardDecision.kind, "deon-parry-discard");
  let targetDecision;
  const discardResult = resolveDeonParryDiscard({ state, player: state.players.d, skill: built.skills.get(FLEUR), payload: resolved(state.effectQueue[0].payload, ["discard3"]), definitions, openDecision: (d) => { targetDecision = d; } });
  assert.equal(discardResult, undefined); assert.deepEqual(targetDecision.options.map((o) => o.id), ["target3"]);
  const targetFrame = state.effectQueue[0];
  resolveDeonParryTarget({ state, player: state.players.d, skill: built.skills.get(FLEUR), payload: resolved(targetFrame.payload, ["target3"]), definitions });
  assert.equal(state.cards.target3.zone, "attack"); assert.equal(state.cards.target3.face, "down"); assert.equal(state.cards.target3.active, false); assert.equal(state.cards.target4.zone, "attack");
  assert.equal(state.players.d.flags.deonParryRound, state.round);
  assert.equal(calculateCombatCardPower(state, state.players.d, "fleur", definitions, "mountain"), 6);
});

test("Fleur grants exactly two extra Parry ability slots only while Fleur is active", () => {
  const { built, definitions, state } = setup("deon-extra-parry");
  putAt(state, "d"); putAt(state, "o"); state.phase = "combat"; state.activePlayerId = "d";
  add(state, "d", "h", basicWithPower(definitions, 2), "hand");
  const skill = built.skills.get(FLEUR); const extra1 = skill.abilities.find((ability) => ability.id === "parry-extra-1");
  assert.equal(isDeonFleurLegal(state, "d", skill, extra1, definitions), false);
  add(state, "d", "fleur", FLEUR, "attack", true);
  assert.equal(isDeonFleurLegal(state, "d", skill, extra1, definitions), true);
  assert.throws(() => { state.cards.fleur.active = false; useDeonFleur({ state, player: state.players.d, skill, payload: { abilityId: "parry-extra-1" }, definitions, openDecision: () => {} }); }, /EXTRA_PARRY_REQUIRES_FLEUR/);
});

test("Self-Suggestion reveals an opponent hand choice, discards one card and gains its printed base power", () => {
  const { built, definitions, state } = setup("deon-self");
  putAt(state, "d"); putAt(state, "o"); add(state, "d", "self", SELF, "attack", true);
  const p4 = basicWithPower(definitions, 4); add(state, "o", "opp4", p4, "hand");
  useDeonSelfSuggestion({ state, player: state.players.d, skill: built.skills.get(SELF), payload: { eventType: "game.started" }, definitions });
  assert.equal(state.players.d.flags.servantGenderRule, "male-or-female");
  let playerDecision;
  useDeonSelfSuggestion({ state, player: state.players.d, skill: built.skills.get(SELF), payload: {}, definitions, openDecision: (d) => { playerDecision = d; } });
  assert.deepEqual(playerDecision.options.map((o) => o.id), ["o"]);
  let cardDecision;
  resolveDeonSelfTarget({ state, player: state.players.d, skill: built.skills.get(SELF), payload: resolved(state.effectQueue[0].payload, ["o"]), definitions, openDecision: (d) => { cardDecision = d; } });
  assert.deepEqual(cardDecision.options.map((o) => o.id), ["opp4"]);
  const result = resolveDeonSelfCard({ state, player: state.players.d, skill: built.skills.get(SELF), payload: resolved(state.effectQueue[0].payload, ["opp4"]), definitions });
  assert.deepEqual(result, { targetPlayerId: "o", discardedInstanceId: "opp4", powerBonus: 4 });
  assert.equal(state.cards.opp4.zone, "discard"); assert.equal(state.players.d.flags.roundPowerBonus, 4);
});
