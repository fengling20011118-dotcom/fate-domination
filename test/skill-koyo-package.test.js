import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { attachCard, getAttachedCards } from "../src/rules-core/card-attachments.ts";
import { joinOwnedCardToAttack } from "../src/rules-core/card-play.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { getCardAttributes } from "../src/rules-core/content-types.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { createOwnedCardInstance, closePlayerCard } from "../src/rules-core/decks.ts";
import {
  resolveKoyoDemonUpkeep,
  useKoyoDemonForm,
  useKoyoFireBreathing,
  useKoyoMomijigari,
} from "../src/rules-core/koyo.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const MOMI = "servant.koyo.skill.sc-koyo-1";
const DEMON = "servant.koyo.skill.sc-koyo-2";
const FIRE = "servant.koyo.skill.sc-koyo-3";

function setup(id = "koyo-package") {
  const built = buildStandardContent(legacyContent);
  registerCoreSkillHandlers(built.skills);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "k", name: "Koyo" }, { id: "o", name: "Opponent" }], seed: 512 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "k";
  state.players.k.servantId = "servant.koyo";
  state.players.k.mana = 20;
  add(state, "k", "momi", MOMI, "servant-skills", false, "up");
  add(state, "k", "demon", DEMON, "servant-skills", false, "up");
  add(state, "k", "fire", FIRE, "servant-skills", false, "up");
  return { built, definitions, state };
}

function add(state, playerId, instanceId, definitionId, zone, active = false, face = active ? "up" : "down") {
  return createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, active, face });
}

function basicByAttribute(definitions, attribute, exclude = new Set()) {
  const definition = Object.values(definitions).find((card) => card.basic === true && !exclude.has(card.id) && getCardAttributes(card).includes(attribute));
  assert.ok(definition, `missing basic ${attribute}`);
  return definition.id;
}

function resolved(previous, selections) {
  return { previous, decision: { status: "resolved", selections } };
}

test("Koyo package is 3/3 FULL with ability-level situation immunity only on Momijigari store", () => {
  const { built } = setup("koyo-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.koyo");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(MOMI).handlerId, "core.koyo-momijigari");
  assert.equal(built.skills.get(DEMON).handlerId, "core.koyo-demon-form");
  assert.equal(built.skills.get(FIRE).handlerId, "core.koyo-fire-breathing");
  assert.equal(built.skills.get(MOMI).abilities.find((a) => a.id === "store").ignoresSituationRestrictions, true);
  assert.equal(built.skills.get(MOMI).abilities.find((a) => a.id === "demon-form").revealsTrueNameOnSkillUse, true);
  assert.equal(built.skills.get(DEMON).cardResidual, true);
});

test("Momijigari stores Magic/Special cards and spends two to put Demon Form into play", () => {
  const { built, definitions, state } = setup("koyo-momijigari");
  const magic = basicByAttribute(definitions, "魔术");
  const special = basicByAttribute(definitions, "特殊");
  add(state, "k", "magic", magic, "hand");
  useKoyoMomijigari({ state, player: state.players.k, skill: built.skills.get(MOMI), payload: { abilityId: "store" }, definitions, openDecision: () => {} });
  assert.equal(state.cards.magic.zone, "attached");
  add(state, "k", "special", special, "hand");
  useKoyoMomijigari({ state, player: state.players.k, skill: built.skills.get(MOMI), payload: { abilityId: "store" }, definitions, openDecision: () => {} });
  assert.equal(getAttachedCards(state, "momi").length, 2);

  state.phase = "outpost";
  state.step = "player-window";
  const result = useKoyoMomijigari({ state, player: state.players.k, skill: built.skills.get(MOMI), payload: { abilityId: "demon-form" }, definitions, openDecision: () => {} });
  assert.deepEqual(result.discardedInstanceIds, ["magic", "special"]);
  assert.equal(state.cards.magic.zone, "discard");
  assert.equal(state.cards.special.zone, "discard");
  assert.equal(state.cards.demon.zone, "attack");
  assert.equal(state.cards.demon.active, true);
  assert.equal(state.cards.demon.residual, true);
});

test("active Demon Form forbids basic Magic and gives Fire Breathing +5 cost/+6 power only while active", () => {
  const { built, definitions, state } = setup("koyo-continuous");
  joinOwnedCardToAttack(state, "k", "demon", definitions, { allowedSourceZones: ["servant-skills"] });
  state.cards.demon.residual = true;
  useKoyoDemonForm({ state, player: state.players.k, skill: built.skills.get(DEMON), payload: { eventType: "card.played", event: { playerId: "k", definitionId: DEMON } }, definitions, openDecision: () => {} });

  const baseFireCost = definitions[FIRE].cost;
  assert.equal(getCardPlayCost(state, definitions[FIRE], state.players.k, state.cards.fire, definitions), baseFireCost + 5);
  joinOwnedCardToAttack(state, "k", "fire", definitions, { allowedSourceZones: ["servant-skills"] });
  assert.equal(calculateCombatCardPower(state, state.players.k, "fire", definitions, "mountain"), Number(definitions[FIRE].basePower) + 6);

  const magic = basicByAttribute(definitions, "魔术");
  add(state, "k", "magic", magic, "hand");
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "k", instanceId: "magic", definitions, faceDown: false }), /CARD_PLAY_FORBIDDEN_BY_MODIFIER/);

  closePlayerCard(state, "k", "demon", definitions);
  assert.equal(getCardPlayCost(state, definitions[FIRE], state.players.k, state.cards.fire, definitions), baseFireCost);
  assert.equal(calculateCombatCardPower(state, state.players.k, "fire", definitions, "mountain"), Number(definitions[FIRE].basePower));
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "k", instanceId: "magic", definitions, faceDown: false }));
});

test("Demon Form Prep upkeep discards a Momijigari card or deactivates if none remain", () => {
  const { built, definitions, state } = setup("koyo-upkeep");
  const magic = basicByAttribute(definitions, "魔术");
  add(state, "k", "fuel", magic, "hand");
  attachCard(state, "fuel", "momi", "up");
  joinOwnedCardToAttack(state, "k", "demon", definitions, { allowedSourceZones: ["servant-skills"] });
  state.cards.demon.residual = true;
  state.phase = "preparation";
  state.step = "player-window";
  state.activePlayerId = "k";
  let decision;
  useKoyoDemonForm({ state, player: state.players.k, skill: built.skills.get(DEMON), payload: { eventType: "round.started", event: {} }, definitions, openDecision: (d) => { decision = d; } });
  assert.equal(decision.kind, "koyo-demon-upkeep");
  const frame = state.effectQueue[0];
  const kept = resolveKoyoDemonUpkeep({ state, player: state.players.k, skill: built.skills.get(DEMON), payload: resolved(frame.payload, ["fuel"]), definitions });
  assert.deepEqual(kept, { discardedInstanceId: "fuel", deactivated: false });
  assert.equal(state.cards.demon.active, true);

  state.round += 1;
  delete state.players.k.flags.koyoDemonUpkeepRound;
  const closed = useKoyoDemonForm({ state, player: state.players.k, skill: built.skills.get(DEMON), payload: { eventType: "round.started", event: {} }, definitions, openDecision: () => {} });
  assert.deepEqual(closed, { deactivated: true });
  assert.equal(state.cards.demon.zone, "servant-skills");
});

test("Demon Form Action spends one Momijigari card for +4 basic Strength while source remains active", () => {
  const { built, definitions, state } = setup("koyo-strength");
  const magic = basicByAttribute(definitions, "魔术");
  const strength = basicByAttribute(definitions, "力量");
  add(state, "k", "fuel", magic, "hand");
  attachCard(state, "fuel", "momi", "up");
  joinOwnedCardToAttack(state, "k", "demon", definitions, { allowedSourceZones: ["servant-skills"] });
  add(state, "k", "strength", strength, "attack", true, "up");
  const basePower = Number(definitions[strength].basePower);
  const result = useKoyoDemonForm({ state, player: state.players.k, skill: built.skills.get(DEMON), payload: { abilityId: "strength-boost" }, definitions, openDecision: () => {} });
  assert.deepEqual(result, { discardedInstanceId: "fuel", powerBonus: 4 });
  assert.equal(calculateCombatCardPower(state, state.players.k, "strength", definitions, "mountain"), basePower + 4);
  closePlayerCard(state, "k", "demon", definitions);
  assert.equal(calculateCombatCardPower(state, state.players.k, "strength", definitions, "mountain"), basePower);
});

test("Thermoregulation reveals hand; with at least three Strength attacks it discards all Strength attacks, gains +5 and draws one", () => {
  const { built, definitions, state } = setup("koyo-thermo");
  const used = new Set();
  const s1 = basicByAttribute(definitions, "力量", used); used.add(s1);
  const s2 = basicByAttribute(definitions, "力量", used); used.add(s2);
  const s3 = basicByAttribute(definitions, "力量", used);
  const magic = basicByAttribute(definitions, "魔术");
  add(state, "k", "s1", s1, "hand");
  add(state, "k", "s2", s2, "hand");
  add(state, "k", "s3", s3, "hand");
  add(state, "k", "m1", magic, "hand");
  add(state, "k", "draw", magic, "deck");
  const events = [];
  const result = useKoyoFireBreathing({
    state, player: state.players.k, skill: built.skills.get(FIRE), payload: { abilityId: "thermoregulation" }, definitions,
    randomInt: () => 0, emitEvent: (type, payload) => events.push({ type, payload }),
  });
  assert.deepEqual(result.discardedInstanceIds.sort(), ["s1", "s2", "s3"]);
  assert.equal(result.powerBonus, 5);
  assert.equal(result.drewCards, 1);
  assert.equal(state.players.k.flags.roundPowerBonus, 5);
  assert.ok(state.players.k.hand.includes("m1"));
  assert.ok(state.players.k.hand.includes("draw"));
  assert.equal(events.filter((event) => event.type === "card.revealed").length, 4);
});

test("Momijigari store alone ignores situation attribute restrictions; transformation does not", () => {
  const { built, definitions, state } = setup("koyo-event-immunity");
  const magic = basicByAttribute(definitions, "魔术");
  add(state, "k", "magic", magic, "hand");
  state.modeState.situationRestrictions = { forbiddenAttributes: ["宝具"] };
  assert.doesNotThrow(() => built.skills.assertCanExecute(state, "k", MOMI, { abilityId: "store" }, definitions));

  attachCard(state, "magic", "momi", "up");
  add(state, "k", "special", basicByAttribute(definitions, "特殊"), "hand");
  attachCard(state, "special", "momi", "up");
  state.phase = "outpost";
  state.step = "player-window";
  assert.throws(() => built.skills.assertCanExecute(state, "k", MOMI, { abilityId: "demon-form" }, definitions), /SKILL_USE_FORBIDDEN/);
});
