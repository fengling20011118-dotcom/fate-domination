import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { grantRulerSeal, listRulerSealsControlledBy } from "../src/rules-core/ruler-seals.ts";
import { KAGETORA_CHARGE_ID, KAGETORA_GOD_ID, KAGETORA_RULER_SEAL_ID } from "../src/rules-core/kagetora.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "kagetora-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "k", name: "Kagetora" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    seed: 19341,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "k";
  state.turnOrder = ["k", "a", "b"];
  state.players.k.servantId = "servant.kagetora";
  for (const playerId of state.turnOrder) {
    state.players[playerId].locationId = "mountain";
    state.players[playerId].mana = 20;
  }
  state.board.locations.mountain = ["k", "a", "b"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function addActiveSkill(state, instanceId, skillId) {
  createOwnedCardInstance(state, "k", { instanceId, definitionId: skillId, zone: "attack", face: "up", active: true });
  state.cards[instanceId].playedRound = state.round;
}

function resolve(engine, state, id, actorId, selections) {
  return engine.execute(state, command(state, id, CommandType.ResolveDecision, actorId, {
    decisionId: state.pendingDecision.decisionId,
    selections,
  }));
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload) {
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${++passiveCounter}`,
    sourceCommandId: "kagetora-test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Kagetora package is 4/4 FULL and all skills are executable", () => {
  const { built } = setup("kagetora-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.kagetora");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(built.skills.get(KAGETORA_RULER_SEAL_ID).initiallyOwned, false);
  assert.equal(built.skills.get(KAGETORA_RULER_SEAL_ID).rulerSealControllerSourceId, KAGETORA_GOD_ID);
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.unmodeledClauses ?? []), []);
});

test("God of War gives a losing player Kagetora's Ruler Seal and grants 1 victory point", () => {
  const { engine, definitions, state } = setup("kagetora-god");
  addActiveSkill(state, "god", KAGETORA_GOD_ID);
  const before = state.players.k.victoryPoints;

  emitPassive(engine, state, definitions, "combat.resolved", {
    locationId: "mountain",
    participantIds: ["k", "a", "b"],
    powers: { k: 4, a: 2, b: 8 },
    winnerIds: ["b"],
  });
  assert.equal(state.pendingDecision?.kind, "kagetora-god-of-war-target");
  assert.deepEqual(state.pendingDecision?.options.map((option) => option.id), ["a"]);
  const result = resolve(engine, state, "god-target", "k", ["a"]);
  const seals = listRulerSealsControlledBy(result.state, "a");
  assert.equal(seals.length, 1);
  assert.equal(seals[0].boundPlayerId, "k");
  assert.equal(seals[0].sourceId, KAGETORA_GOD_ID);
  assert.equal(result.state.players.k.victoryPoints, before + 1);
});

test("Kagetora Ruler Seal is dynamically owned by its holder and can lock the bound Kagetora", () => {
  const { engine, state } = setup("kagetora-seal-lock");
  grantRulerSeal(state, "a", "k", KAGETORA_GOD_ID);
  state.activePlayerId = "a";

  let result = engine.execute(state, command(state, "seal-use", CommandType.UseSkill, "a", {
    skillId: KAGETORA_RULER_SEAL_ID,
    data: { abilityId: "ruler-seal-command" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "ruler-seal-command-mode");
  result = resolve(engine, result.state, "seal-lock", "a", ["lock"]);
  assert.equal(result.state.players.k.flags.movementBlockedRound, 4);
  assert.equal(listRulerSealsControlledBy(result.state, "a").length, 0);
});

test("Eight Phase movement follow-up can use an 8+ mana Ruler Seal holder to pay ceil(one third) of attack cost", () => {
  const { engine, definitions, state } = setup("kagetora-share");
  addActiveSkill(state, "charge", KAGETORA_CHARGE_ID);
  createOwnedCardInstance(state, "k", { instanceId: "extra", definitionId: "card.cardq4", zone: "hand", face: "down", active: false });
  grantRulerSeal(state, "a", "k", KAGETORA_GOD_ID);
  state.players.k.mana = 5;
  state.players.a.mana = 8;

  emitPassive(engine, state, definitions, "player.moved", { playerId: "k", from: "city", to: "mountain" });
  assert.equal(state.pendingDecision?.kind, "kagetora-move-extra-attack");
  let result = resolve(engine, state, "charge-card", "k", ["extra"]);
  assert.equal(result.state.pendingDecision?.kind, "kagetora-attack-mana-payer");
  assert.ok(result.state.pendingDecision?.options.some((option) => option.id === "a"));
  result = resolve(engine, result.state, "charge-payer", "k", ["a"]);
  assert.equal(result.state.cards.extra.zone, "attack");
  assert.equal(result.state.cards.extra.paidCost, 1);
  assert.equal(result.state.players.k.mana, 5);
  assert.equal(result.state.players.a.mana, 7);
});

test("Eight Phase play trigger offers only attacks with printed base power 3 or less", () => {
  const { engine, definitions, state } = setup("kagetora-low-power");
  addActiveSkill(state, "charge", KAGETORA_CHARGE_ID);
  createOwnedCardInstance(state, "k", { instanceId: "low", definitionId: "card.cardsurveil", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "k", { instanceId: "high", definitionId: "card.cardq4", zone: "hand", face: "down", active: false });

  emitPassive(engine, state, definitions, "card.played", {
    playerId: "k", instanceId: "charge", definitionId: KAGETORA_CHARGE_ID, face: "up", paidMana: 6,
  });
  assert.equal(state.pendingDecision?.kind, "kagetora-play-low-power-attack");
  assert.deepEqual(state.pendingDecision?.options.map((option) => option.id), ["low"]);
});

test("Free-play Ruler Seal reward survives seal consumption and pays the holder +2 when Kagetora wins", () => {
  const { engine, definitions, state } = setup("kagetora-seal-reward");
  grantRulerSeal(state, "a", "k", KAGETORA_GOD_ID);
  createOwnedCardInstance(state, "k", { instanceId: "free", definitionId: "card.cardq4", zone: "hand", face: "down", active: false });
  state.activePlayerId = "a";
  const before = state.players.a.victoryPoints;

  let result = engine.execute(state, command(state, "free-use", CommandType.UseSkill, "a", {
    skillId: KAGETORA_RULER_SEAL_ID,
    data: { abilityId: "ruler-seal-command" },
  }));
  result = resolve(engine, result.state, "free-mode", "a", ["free-play"]);
  assert.equal(result.state.pendingDecision?.kind, "ruler-seal-free-play-card");
  result = resolve(engine, result.state, "free-card", "k", ["free"]);
  assert.equal(listRulerSealsControlledBy(result.state, "a").length, 0);
  assert.equal(result.state.cards.free.paidCost, 0);

  emitPassive(engine, result.state, definitions, "combat.resolved", {
    locationId: "mountain", participantIds: ["k", "b"], powers: { k: 9, b: 4 }, winnerIds: ["k"],
  });
  assert.equal(result.state.players.a.victoryPoints, before + 2);
});
