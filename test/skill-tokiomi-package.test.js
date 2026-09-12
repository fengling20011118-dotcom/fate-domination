import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower, calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { useGameStartAddSkill } from "../src/rules-core/skill-handlers.ts";
import {
  TOKIOMI_ASCENSION_ID,
  TOKIOMI_ELEMENTALIST_ID,
  TOKIOMI_FIREBALL_ABILITY,
  TOKIOMI_FIREBALL_ID,
  TOKIOMI_ITEM_AZOTH,
  TOKIOMI_ITEM_GRIMOIR,
  TOKIOMI_ITEM_MAGIC_METER,
  TOKIOMI_ITEM_MANA_RESERVE,
  useTokiomiElementalist,
} from "../src/rules-core/tokiomi.ts";
import { getStackedStatus } from "../src/rules-core/stacked-statuses.ts";

const CARELESS_MENTOR = "master.tokiomi.skill.s2";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "tokiomi-package") {
  const players = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
    { id: "t", name: "Tokiomi" },
  ];
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players, seed: 24680 });
  state.status = "playing";
  state.round = 4;
  state.turnOrder = players.map((player) => player.id);
  state.players.t.masterId = "master.tokiomi";
  for (const player of Object.values(state.players)) {
    player.mana = 20;
    player.locationId = "mountain";
  }
  state.board.locations = { workshop: [], mountain: ["a", "b", "c", "t"], city: [], scouting: [] };
  state.board.outpostRecords = { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] };
  return { built, definitions, engine, state };
}

function addTokiomiStartCards(state, built) {
  const tokiomi = state.players.t;
  useTokiomiElementalist({
    state,
    player: tokiomi,
    skill: built.skills.get(TOKIOMI_ELEMENTALIST_ID),
    payload: { eventType: "game.started", event: {} },
    openDecision: () => undefined,
  });
  useGameStartAddSkill({
    state,
    player: tokiomi,
    skill: built.skills.get(CARELESS_MENTOR),
    payload: undefined,
    openDecision: () => undefined,
  });
}

function itemInstanceId(state, definitionId) {
  return state.players.t.masterSkills.find((instanceId) => state.cards[instanceId]?.definitionId === definitionId);
}

function addHandCard(state, playerId, instanceId, definitionId) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone: "hand", face: "down", active: false });
}

test("Tokiomi package is 3/3 FULL and game start creates Einäscherung plus four shared items", () => {
  const { built, state } = setup("tokiomi-full");
  const skills = [TOKIOMI_ELEMENTALIST_ID, CARELESS_MENTOR, TOKIOMI_ASCENSION_ID].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[0].handlerId, "core.tokiomi-elementalist");
  assert.equal(skills[1].handlerId, "core.game-start-add-skill");
  assert.equal(skills[2].handlerId, "core.rule-marker");

  const fireball = built.cards[TOKIOMI_FIREBALL_ID];
  assert.equal(fireball.standardAppend, true);
  assert.equal(fireball.requiresEightMana, true);
  assert.deepEqual(fireball.cardAbilityIds, [TOKIOMI_FIREBALL_ABILITY]);

  addTokiomiStartCards(state, built);
  const created = state.players.t.masterSkills.map((instanceId) => state.cards[instanceId].definitionId);
  assert.ok(created.includes(TOKIOMI_FIREBALL_ID));
  for (const definitionId of [TOKIOMI_ITEM_AZOTH, TOKIOMI_ITEM_GRIMOIR, TOKIOMI_ITEM_MAGIC_METER, TOKIOMI_ITEM_MANA_RESERVE]) {
    assert.ok(created.includes(definitionId));
    assert.ok(built.cards[definitionId].tags.includes("shared-public-ability"));
  }
});

test("Einäscherung stacks source-bound Burn and existing Burn upgrades dynamically with Advanced Pyromancy", () => {
  const { built, definitions, engine, state } = setup("tokiomi-burn-upgrade");
  addTokiomiStartCards(state, built);
  const fireballId = itemInstanceId(state, TOKIOMI_FIREBALL_ID);
  movePlayerCard(state, "t", fireballId, "attack");
  state.cards[fireballId].face = "up";
  state.cards[fireballId].active = true;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "t";

  const result = engine.execute(state, command(state, "tokiomi-burn", CommandType.UseCardAbility, "t", {
    instanceId: fireballId,
    ability: TOKIOMI_FIREBALL_ABILITY,
  }));
  const burned = result.state.players.a;
  const status = getStackedStatus(burned, "status.burn:t");
  assert.equal(status?.count, 1);
  assert.equal(calculateCombatPower(result.state, burned, definitions, "mountain"), 0);
  assert.equal(getCardPlayCost(result.state, definitions[TOKIOMI_FIREBALL_ID], result.state.players.t, result.state.cards[fireballId], definitions), 2);

  createOwnedCardInstance(result.state, "t", {
    instanceId: "advanced-pyromancy",
    definitionId: TOKIOMI_ASCENSION_ID,
    zone: "master-skills",
    face: "up",
    active: false,
  });
  assert.equal(calculateCombatPower(result.state, burned, definitions, "mountain"), 0);
  assert.equal(getCardPlayCost(result.state, definitions[TOKIOMI_FIREBALL_ID], result.state.players.t, result.state.cards[fireballId], definitions), 4);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.t, fireballId, definitions, "mountain"), 2);
});

test("two face-down attacks offer one Burn removal and Advanced Pyromancy charges the extra 2 mana", () => {
  const { built, engine, state } = setup("tokiomi-burn-remove");
  addTokiomiStartCards(state, built);
  const fireballId = itemInstanceId(state, TOKIOMI_FIREBALL_ID);
  movePlayerCard(state, "t", fireballId, "attack");
  state.cards[fireballId].face = "up";
  state.cards[fireballId].active = true;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "t";
  let current = engine.execute(state, command(state, "burn-first", CommandType.UseCardAbility, "t", {
    instanceId: fireballId,
    ability: TOKIOMI_FIREBALL_ABILITY,
  })).state;
  createOwnedCardInstance(current, "t", { instanceId: "advanced-pyromancy", definitionId: TOKIOMI_ASCENSION_ID, zone: "master-skills", face: "up", active: false });

  current.round = 5;
  current.phase = "action";
  current.step = "play-batch-draft";
  current.activePlayerId = "a";
  current.board.locations.mountain = current.board.locations.mountain.filter((id) => id !== "a");
  current.board.locations.workshop = ["a"];
  current.players.a.locationId = "workshop";
  addHandCard(current, "a", "hidden-one", "card.cardb1");
  addHandCard(current, "a", "hidden-two", "card.cardq1");
  current.players.a.mana = 10;

  current = engine.execute(current, command(current, "two-hidden", CommandType.CommitAttack, "a", {
    faceUpInstanceIds: [],
    faceDownInstanceIds: ["hidden-one", "hidden-two"],
  })).state;
  assert.equal(current.pendingDecision?.kind, "tokiomi-burn-remove");
  assert.deepEqual(current.pendingDecision?.chooserPlayerIds, ["a"]);
  const manaBeforeRemoval = current.players.a.mana;
  const decisionId = current.pendingDecision.decisionId;
  current = engine.execute(current, command(current, "remove-burn", CommandType.ResolveDecision, "a", {
    decisionId,
    selections: ["remove"],
  })).state;
  assert.equal(current.players.a.mana, manaBeforeRemoval - 2);
  assert.equal(getStackedStatus(current.players.a, "status.burn:t"), undefined);
});

test("shared items enforce last-two eligibility, per-player one-item limit, global item limit, and item effects", () => {
  const { built, definitions, engine, state } = setup("tokiomi-items");
  addTokiomiStartCards(state, built);
  addHandCard(state, "c", "c-basic", "card.carda1");
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "c";
  const azothId = itemInstanceId(state, TOKIOMI_ITEM_AZOTH);
  const reserveId = itemInstanceId(state, TOKIOMI_ITEM_MANA_RESERVE);
  const meterId = itemInstanceId(state, TOKIOMI_ITEM_MAGIC_METER);
  let current = engine.execute(state, command(state, "use-azoth", CommandType.UseCardAbility, "c", {
    instanceId: azothId,
    ability: "tokiomi.item.azoth-blade",
    data: { targetInstanceId: "c-basic" },
  })).state;
  assert.equal(current.players.t.victoryPoints, 1);
  assert.equal(current.cards["c-basic"].powerModifiers?.at(-1)?.value, 2);
  assert.equal(current.players.t.flags.roundPowerBonus, -2);

  assert.throws(() => engine.execute(current, command(current, "same-player-second-item", CommandType.UseCardAbility, "c", {
    instanceId: reserveId,
    ability: "tokiomi.item.mana-reserve",
  })), /TOKIOMI_ITEM_PLAYER_LIMIT_REACHED/);

  current.activePlayerId = "t";
  assert.throws(() => engine.execute(current, command(current, "same-item-second-user", CommandType.UseCardAbility, "t", {
    instanceId: azothId,
    ability: "tokiomi.item.azoth-blade",
    data: { targetInstanceId: "c-basic" },
  })), /CARD_ABILITY_LIMIT_REACHED/);

  current.round = 5;
  current.phase = "action";
  current.step = "player-window";
  current.activePlayerId = "t";
  addHandCard(current, "t", "costly", "card.carda5");
  const beforeCost = getCardPlayCost(current, definitions["card.carda5"], current.players.t, current.cards.costly, definitions);
  const beforeMana = current.players.t.mana;
  const beforeVp = current.players.t.victoryPoints;
  current = engine.execute(current, command(current, "self-reserve", CommandType.UseCardAbility, "t", {
    instanceId: reserveId,
    ability: "tokiomi.item.mana-reserve",
  })).state;
  assert.equal(current.players.t.victoryPoints, beforeVp);
  assert.equal(current.players.t.mana, beforeMana - 1);
  assert.equal(getCardPlayCost(current, definitions["card.carda5"], current.players.t, current.cards.costly, definitions), beforeCost - 1);

  current.activePlayerId = "c";
  current.board.outpostRecords.mountain = [null, null];
  current = engine.execute(current, command(current, "magic-meter", CommandType.UseCardAbility, "c", {
    instanceId: meterId,
    ability: "tokiomi.item.magic-meter",
    data: { terrainAdvantage: 3 },
  })).state;
  assert.equal(current.board.outpostRecords.mountain[0], "c");
  assert.equal(current.players.c.flags.deploymentBonus, 3);
  assert.equal(current.players.t.victoryPoints, beforeVp + 1);

  current.activePlayerId = "a";
  const grimoirId = itemInstanceId(current, TOKIOMI_ITEM_GRIMOIR);
  assert.throws(() => engine.execute(current, command(current, "early-seat-item", CommandType.UseCardAbility, "a", {
    instanceId: grimoirId,
    ability: "tokiomi.item.grimoir",
  })), /TOKIOMI_ITEM_TURN_ORDER_FORBIDDEN/);
});

test("Grimoir persists through user discard/search and makes Tokiomi choose his own discard", () => {
  const { built, engine, state } = setup("tokiomi-grimoir");
  addTokiomiStartCards(state, built);
  addHandCard(state, "c", "discard-one", "card.carda1");
  addHandCard(state, "c", "discard-two", "card.cardb1");
  createOwnedCardInstance(state, "c", { instanceId: "searched", definitionId: "card.carda4", zone: "deck", face: "down", active: false });
  addHandCard(state, "t", "tokiomi-discard", "card.cardq1");
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "c";
  const grimoirId = itemInstanceId(state, TOKIOMI_ITEM_GRIMOIR);

  let current = engine.execute(state, command(state, "grimoir-use", CommandType.UseCardAbility, "c", {
    instanceId: grimoirId,
    ability: "tokiomi.item.grimoir",
  })).state;
  assert.equal(current.players.t.victoryPoints, 1);
  assert.equal(current.pendingDecision?.kind, "tokiomi-grimoir-discard-two");

  let decisionId = current.pendingDecision.decisionId;
  current = engine.execute(current, command(current, "grimoir-discard-two", CommandType.ResolveDecision, "c", {
    decisionId,
    selections: ["discard-one", "discard-two"],
  })).state;
  assert.equal(current.pendingDecision?.kind, "tokiomi-grimoir-search");
  assert.ok(current.players.c.discard.includes("discard-one"));
  assert.ok(current.players.c.discard.includes("discard-two"));

  decisionId = current.pendingDecision.decisionId;
  current = engine.execute(current, command(current, "grimoir-search", CommandType.ResolveDecision, "c", {
    decisionId,
    selections: ["searched"],
  })).state;
  assert.equal(current.pendingDecision?.kind, "tokiomi-grimoir-tokiomi-discard");
  assert.deepEqual(current.pendingDecision?.chooserPlayerIds, ["t"]);
  assert.ok(current.players.c.hand.includes("searched"));

  decisionId = current.pendingDecision.decisionId;
  current = engine.execute(current, command(current, "grimoir-tokiomi-discard", CommandType.ResolveDecision, "t", {
    decisionId,
    selections: ["tokiomi-discard"],
  })).state;
  assert.equal(current.pendingDecision, null);
  assert.ok(current.players.t.discard.includes("tokiomi-discard"));
});
