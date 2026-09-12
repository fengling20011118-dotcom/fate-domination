import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, drawCards } from "../src/rules-core/decks.ts";
import { addCardToAttack } from "../src/rules-core/card-play.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { isStructuredDefeatIgnored } from "../src/rules-core/rule-modifiers.ts";

const ALCHEMIST = "master.kayneth.skill.s2";
const FLUID = "master.kayneth.skill.ascension";
const SCALP = "card.card-volumen-slash";
const IRE = "card.card-volumen-track";
const FERVOR = "card.card-volumen-boil";

function command(state, id, type, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId: "k", expectedRevision: state.revision, type, payload };
}

function setup(id = "kayneth") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "k", name: "Kayneth" }, { id: "o", name: "Opponent" }], seed: 9911 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "k";
  state.players.k.masterId = "master.kayneth";
  state.players.k.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["k", "o"];
  return { built, definitions, state, engine: new StandardMatchEngine(built) };
}

function passiveContext(id = "kayneth-passive") {
  const ctx = setup(id);
  registerCoreSkillHandlers(ctx.built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(ctx.built.skills, passives, effects, ctx.definitions);
  return { ...ctx, passives, effects };
}

function emitPassive(ctx, type, payload = {}) {
  enqueuePassiveEffects(ctx.state, ctx.passives, {
    eventId: `${ctx.state.gameInstanceId}:${type}:${ctx.state.revision}:${ctx.state.effectQueue.length}`,
    sourceCommandId: "test",
    revision: ctx.state.revision,
    type,
    payload,
  });
  ctx.effects.drain(ctx.state, 1000, ctx.definitions);
}

test("Kayneth package: all four master skills are FULL and Volumen cards expose their English-original abilities", () => {
  const { built, definitions } = setup("kayneth-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.kayneth");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(ALCHEMIST).handlerId, "core.kayneth-alchemist");
  assert.equal(built.skills.get(FLUID).handlerId, "core.kayneth-fluid-dynamics");
  assert.deepEqual(definitions[SCALP].cardAbilityIds, ["volumen.perfect-flow", "volumen.scalp"]);
  assert.deepEqual(definitions[IRE].cardAbilityIds, ["volumen.perfect-flow", "volumen.ire-sanctio"]);
  assert.deepEqual(definitions[FERVOR].cardAbilityIds, ["volumen.perfect-flow", "volumen.fervor"]);
});

test("Alchemist builds the ruled 3 Scalp / 2 Ire Sanctio / 1 Fervor separate deck and draws from it", () => {
  const ctx = passiveContext("kayneth-alchemist");
  emitPassive(ctx, "game.started", { round: 3 });
  const deck = ctx.state.modeState["kaynethVolumenDeck:k"];
  assert.equal(deck.length, 6);
  assert.equal(deck.filter((id) => id === SCALP).length, 3);
  assert.equal(deck.filter((id) => id === IRE).length, 2);
  assert.equal(deck.filter((id) => id === FERVOR).length, 1);

  ctx.built.skills.execute(ctx.state, "k", ALCHEMIST, { abilityId: "alchemist-draw" }, () => { throw new Error("UNEXPECTED_DECISION"); }, () => 0, ctx.definitions);
  assert.equal(ctx.state.modeState["kaynethVolumenDeck:k"].length, 5);
  assert.equal(ctx.state.players.k.hand.length, 1);
  assert.ok([SCALP, IRE, FERVOR].includes(ctx.state.cards[ctx.state.players.k.hand[0]].definitionId));
});

test("Perfect Flow pays 2 mana as an ability cost while the Volumen card itself keeps paidCost 0; Scalp gives +2 power", () => {
  const { engine, definitions, state } = setup("kayneth-scalp");
  state.phase = "combat";
  state.players.k.mana = 2;
  createOwnedCardInstance(state, "k", { instanceId: "scalp", definitionId: SCALP, zone: "hand", face: "down", active: false });
  let result = engine.execute(state, command(state, "perfect-flow", CommandType.UseCardAbility, { instanceId: "scalp", ability: "volumen.perfect-flow" }));
  assert.equal(result.state.players.k.mana, 0);
  assert.equal(result.state.cards.scalp.zone, "attack");
  assert.equal(result.state.cards.scalp.active, true);
  assert.equal(result.state.cards.scalp.paidCost, 0);

  result.state.phase = "action";
  result.state.step = "player-window";
  result.state.activePlayerId = "k";
  result = engine.execute(result.state, command(result.state, "scalp", CommandType.UseCardAbility, { instanceId: "scalp", ability: "volumen.scalp" }));
  assert.equal(calculateCombatCardPower(result.state, result.state.players.k, "scalp", definitions, "mountain"), 4);
});

test("Ire Sanctio removes engaged opponents' terrain advantage and Fervor ignores defeat for the current round", () => {
  const { engine, definitions, state } = setup("kayneth-volumen-combat");
  state.phase = "combat";
  state.players.o.flags.deploymentLocationId = "mountain";
  state.players.o.flags.deploymentBonus = 3;
  state.players.o.flags.deploymentBonusActive = true;
  createOwnedCardInstance(state, "k", { instanceId: "ire", definitionId: IRE, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "k", { instanceId: "fervor", definitionId: FERVOR, zone: "attack", face: "up", active: true });

  let result = engine.execute(state, command(state, "ire", CommandType.UseCardAbility, { instanceId: "ire", ability: "volumen.ire-sanctio" }));
  assert.equal(result.state.players.o.flags.deploymentBonusActive, false);
  assert.equal(result.state.players.o.flags.deploymentBonus, 0);
  result.state.players.k.defeated = true;
  result = engine.execute(result.state, command(result.state, "fervor", CommandType.UseCardAbility, { instanceId: "fervor", ability: "volumen.fervor" }));
  assert.equal(result.state.players.k.flags.ignoreDefeatRound, 3);
  assert.equal(isStructuredDefeatIgnored(result.state, "k", definitions), true);
});

test("Fluid Dynamics keeps non-skill attacks active through the next round end, then lets them close normally", () => {
  const ctx = passiveContext("kayneth-fluid-residual");
  createOwnedCardInstance(ctx.state, "k", { instanceId: "fluid", definitionId: FLUID, zone: "master-skills", face: "up", active: false });
  emitPassive(ctx, "skill.unlocked", { playerId: "k", skillId: FLUID, definitionId: FLUID, instanceId: "fluid" });
  const modifier = ctx.state.players.k.cardRuleModifiers.find((item) => item.sourceId === FLUID);
  assert.equal(modifier?.grantResidual, true);
  assert.equal(modifier?.residualUntilRoundOffset, 1);

  createOwnedCardInstance(ctx.state, "k", { instanceId: "attack", definitionId: "card.cardb2", zone: "hand", face: "down", active: false });
  addCardToAttack(ctx.state, "k", "attack", ctx.definitions, { payCost: false, allowedSourceZones: ["hand"] });
  assert.equal(ctx.state.cards.attack.residual, true);
  assert.equal(ctx.state.cards.attack.residualUntilRound, 4);
  endStandardRound(ctx.state, ctx.definitions);
  assert.equal(ctx.state.cards.attack.zone, "attack");
  assert.equal(ctx.state.cards.attack.active, true);
  ctx.state.round = 4;
  endStandardRound(ctx.state, ctx.definitions);
  assert.equal(ctx.state.cards.attack.zone, "discard");
  assert.equal(ctx.state.cards.attack.active, false);
});

test("Fluid Dynamics only offers the extra draw for a Volumen drawn from the normal attack deck", () => {
  const ctx = passiveContext("kayneth-fluid-draw");
  createOwnedCardInstance(ctx.state, "k", { instanceId: "fluid", definitionId: FLUID, zone: "master-skills", face: "up", active: false });
  emitPassive(ctx, "skill.unlocked", { playerId: "k", skillId: FLUID, definitionId: FLUID, instanceId: "fluid" });
  createOwnedCardInstance(ctx.state, "k", { instanceId: "deck-volumen", definitionId: SCALP, zone: "deck", face: "down", active: false });
  createOwnedCardInstance(ctx.state, "k", { instanceId: "extra", definitionId: "card.cardq2", zone: "deck", face: "down", active: false });
  drawCards(ctx.state, "k", 1, () => 0, ctx.definitions);
  emitPassive(ctx, "card.drawn", { playerId: "k", ownerPlayerId: "k", instanceId: "deck-volumen", definitionId: SCALP, fromZone: "deck", toZone: "hand" });
  assert.equal(ctx.state.pendingDecision?.kind, "kayneth-fluid-reveal-draw");
  const decision = ctx.state.pendingDecision;
  const frame = ctx.state.effectQueue.find((item) => item.effectId === decision.continuationEffectId);
  frame.payload = { previous: frame.payload, decision: { status: "resolved", selections: ["reveal-draw"] } };
  ctx.state.pendingDecision = null;
  ctx.effects.drain(ctx.state, 1000, ctx.definitions);
  assert.ok(ctx.state.players.k.hand.includes("deck-volumen"));
  assert.ok(ctx.state.players.k.hand.includes("extra"));
});
