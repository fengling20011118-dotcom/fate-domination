import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { createOwnedCardInstance, drawCards, movePlayerCard } from "../src/rules-core/decks.ts";

const CHARGE = "master.artoira.skill.s1";
const WOODEN = "master.artoira.skill.ascension";
const SERVANT_ATTACK = "servant.mhx.skill.sc-mhx-2"; // printed cost 3 => charged position 4

function setup(id = "artoira") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "a", name: "Artoria" }, { id: "o", name: "Opponent" }],
    seed: 9601,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = ["a", "o"];
  state.players.a.masterId = "master.artoira";
  state.players.a.servantId = "servant.mhx";
  state.players.a.locationId = "city";
  state.players.o.locationId = "city";
  state.board.locations.city = ["a", "o"];
  state.board.locations.mountain = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  for (let i = 0; i < 12; i += 1) {
    createOwnedCardInstance(state, "a", {
      instanceId: `deck-${i}`,
      definitionId: "card.cardb1",
      zone: "deck",
      face: "down",
      active: false,
    });
  }
  return { built, definitions, engine, state };
}

function command(state, id, type, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId: "a", expectedRevision: state.revision, type, payload };
}

test("Artoria charge package: both skills are FULL", () => {
  const { built } = setup("artoira-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.artoira");
  assert.equal(skills.length, 2);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(CHARGE).handlerId, "core.artoira-charge");
  assert.equal(built.skills.get(WOODEN).handlerId, "core.artoira-wooden-sword");
  assert.equal(built.skills.get(WOODEN).initiallyOwned, false);
});

test("White Steel charges a face-up attack belonging to your servant into cost+1 deck position", () => {
  const { engine, state } = setup("artoira-charge");
  createOwnedCardInstance(state, "a", {
    instanceId: "servant-skill",
    definitionId: SERVANT_ATTACK,
    zone: "servant-skills",
    face: "up",
    active: false,
  });
  let result = engine.execute(state, command(state, "charge", CommandType.UseSkill, { skillId: CHARGE, data: { abilityId: "charge-skill-attack" } }));
  assert.equal(result.state.pendingDecision?.kind, "artoira-charge-skill-attack");
  assert.deepEqual(result.state.pendingDecision?.options.map((option) => option.id), ["servant-skill"]);
  result = engine.execute(result.state, command(result.state, "choose", CommandType.ResolveDecision, {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["servant-skill"],
  }));
  assert.equal(result.state.cards["servant-skill"].zone, "deck");
  assert.equal(result.state.players.a.deck[3], "servant-skill");
  assert.equal(result.state.cards["servant-skill"].chargedAttackOnDeckLeave?.sourceId, CHARGE);
});

test("charged card leaving deck for draw or discard instead freely joins attack face-up", () => {
  const { definitions, state } = setup("artoira-leave");
  createOwnedCardInstance(state, "a", {
    instanceId: "charged",
    definitionId: SERVANT_ATTACK,
    zone: "deck",
    face: "down",
    active: false,
  });
  const card = state.cards.charged;
  card.chargedAttackOnDeckLeave = { sourceId: CHARGE, residual: false };
  const idx = state.players.a.deck.indexOf("charged");
  state.players.a.deck.splice(idx, 1);
  state.players.a.deck.unshift("charged");
  const drawn = drawCards(state, "a", 1, () => 0, definitions);
  assert.deepEqual(drawn, ["charged"]);
  assert.equal(card.zone, "attack");
  assert.equal(card.face, "up");
  assert.equal(card.active, true);
  assert.equal(card.paidCost, 0);
  assert.equal(card.chargedAttackEnteredRound, 4);

  createOwnedCardInstance(state, "a", {
    instanceId: "charged-remove",
    definitionId: SERVANT_ATTACK,
    zone: "deck",
    face: "down",
    active: false,
  });
  state.cards["charged-remove"].chargedAttackOnDeckLeave = { sourceId: CHARGE, residual: false };
  movePlayerCard(state, "a", "charged-remove", "discard");
  assert.equal(state.cards["charged-remove"].zone, "attack");
  assert.equal(state.cards["charged-remove"].active, true);
  assert.ok(state.players.a.attack.includes("charged-remove"));
  assert.ok(!state.players.a.discard.includes("charged-remove"));
});

test("Wooden Sword can be charged and immediately wins after entering from deck this round and winning combat", () => {
  const { built, definitions, state } = setup("artoira-win");
  createOwnedCardInstance(state, "a", {
    instanceId: "wooden",
    definitionId: WOODEN,
    zone: "master-skills",
    face: "up",
    active: false,
  });
  // Simulate the generic charge replacement having fired this round.
  movePlayerCard(state, "a", "wooden", "deck");
  state.cards.wooden.chargedAttackOnDeckLeave = { sourceId: CHARGE, residual: false };
  movePlayerCard(state, "a", "wooden", "hand");
  assert.equal(state.cards.wooden.zone, "attack");
  assert.equal(state.cards.wooden.chargedAttackEnteredRound, 4);

  state.phase = "combat";
  state.step = "settlement";
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  enqueuePassiveEffects(state, passives, {
    eventId: "combat-win",
    sourceCommandId: "test",
    revision: 0,
    type: "combat.resolved",
    payload: { locationId: "city", winnerIds: ["a"], powers: { a: 20, o: 10 } },
  });
  effects.drain(state, 1000, definitions);
  assert.equal(state.status, "finished");
  assert.deepEqual(state.modeState.instantVictoryIds, ["a"]);
  assert.equal(state.modeState.instantVictoryReason, WOODEN);
});
