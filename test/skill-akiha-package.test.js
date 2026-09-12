import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import {
  AKIHA_ASCENSION_ID,
  AKIHA_BLOODLUST_ACTION,
  AKIHA_BLOODLUST_ID,
  AKIHA_CAGING_HAIR_ID,
  AKIHA_DEMONIC_HERITAGE_ID,
  AKIHA_HANDLER,
  useAkiha,
} from "../src/rules-core/akiha.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { calculateCombatCardPower, calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { getCardPlayCost, payManaCost } from "../src/rules-core/costs.ts";
import { closePlayerCard, createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { clearCommandManaContribution, finishCommandManaContribution, prepareCommandManaContribution } from "../src/rules-core/linked-player-rules.ts";
import { gainMana, gainVictoryPoints, getCustomResource } from "../src/rules-core/resources.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function skill(id) {
  return built.skills.get(id);
}

function fresh(id = "akiha") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "a", name: "Akiha" }, { id: "o1", name: "One" }, { id: "o2", name: "Two" }],
    seed: 8181,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.players.a.masterId = "master.akiha";
  for (const playerId of ["a", "o1", "o2"]) {
    state.players[playerId].locationId = "mountain";
    state.board.locations.mountain.push(playerId);
  }
  return state;
}

function invoke(state, skillId, payload, extra = {}) {
  return useAkiha({
    state,
    player: state.players.a,
    skill: skill(skillId),
    payload,
    definitions,
    randomInt: () => 0,
    openDecision: () => {},
    ...extra,
  });
}

function startAkiha(state) {
  invoke(state, AKIHA_CAGING_HAIR_ID, { eventType: "game.started", event: {} });
  invoke(state, AKIHA_DEMONIC_HERITAGE_ID, { eventType: "game.started", event: {} });
  invoke(state, AKIHA_BLOODLUST_ID, { eventType: "game.started", event: {} });
}

test("Akiha package is 5/5 FULL with one dedicated executable handler", () => {
  const skills = built.skills.list().filter((entry) => entry.ownerId === "master.akiha");
  assert.equal(skills.length, 5);
  assert.ok(skills.every((entry) => entry.supportLevel === "FULL"));
  assert.ok(skills.every((entry) => entry.handlerId === AKIHA_HANDLER));
  assert.ok(skills.every((entry) => built.skills.hasHandler(entry.id)));
  assert.equal(skill(AKIHA_BLOODLUST_ID).abilities?.[0]?.id, AKIHA_BLOODLUST_ACTION);
});

test("Caging Hair can take one mana from each eligible same-battlefield opponent in one payment and keeps per-opponent round limits", () => {
  const state = fresh("akiha-caging");
  startAkiha(state);
  state.players.a.mana = 1;
  state.players.o1.mana = 6;
  state.players.o2.mana = 7;
  prepareCommandManaContribution(state, "a", {
    manaContributions: [
      { contributorPlayerId: "o1", amount: 1, sourceInstanceId: "brilliant" },
      { contributorPlayerId: "o2", amount: 1, sourceInstanceId: "brilliant" },
    ],
  });
  const split = payManaCost(state, state.players.a, 3, definitions);
  finishCommandManaContribution(state);
  assert.equal(split.payerAmount, 1);
  assert.deepEqual(split.contributions.map(({ contributorPlayerId, amount }) => [contributorPlayerId, amount]), [["o1", 1], ["o2", 1]]);
  assert.equal(state.players.a.mana, 0);
  assert.equal(state.players.o1.mana, 5);
  assert.equal(state.players.o2.mana, 6);

  state.players.a.mana = 1;
  state.players.o1.mana = 6;
  prepareCommandManaContribution(state, "a", { manaContribution: { contributorPlayerId: "o1", amount: 1 } });
  assert.throws(() => payManaCost(state, state.players.a, 2, definitions), /MANA_CONTRIBUTION_ROUND_LIMIT_REACHED/);
  clearCommandManaContribution(state);

  state.round += 1;
  state.players.a.mana = 1;
  state.players.o1.mana = 5;
  prepareCommandManaContribution(state, "a", { manaContribution: { contributorPlayerId: "o1", amount: 1 } });
  assert.throws(() => payManaCost(state, state.players.a, 2, definitions), /MANA_CONTRIBUTION_NOT_ALLOWED/);
  clearCommandManaContribution(state);
});

test("Demonic Heritage counts only Akiha's actual mana spending and its random post-combat loss doubles in Workshop", () => {
  const state = fresh("akiha-heritage");
  startAkiha(state);
  invoke(state, AKIHA_DEMONIC_HERITAGE_ID, { eventType: "player.mana.spent", event: { playerId: "o1", amount: 4 } });
  assert.equal(getCustomResource(state.players.a, "bloodlust"), 0);
  invoke(state, AKIHA_DEMONIC_HERITAGE_ID, { eventType: "player.mana.spent", event: { playerId: "a", amount: 8 } });
  assert.equal(getCustomResource(state.players.a, "bloodlust"), 8);
  state.board.locations.mountain = state.board.locations.mountain.filter((id) => id !== "a");
  state.board.locations.workshop.push("a");
  state.players.a.locationId = "workshop";
  const result = invoke(state, AKIHA_DEMONIC_HERITAGE_ID, { eventType: "combat.ending", event: {} }, { randomInt: () => 1 });
  assert.equal(result.loss, 4);
  assert.equal(getCustomResource(state.players.a, "bloodlust"), 4);
});

test("Bloodlust thresholds grant the action, skill-entry +1 and the sourced 8-mana waiver", () => {
  const state = fresh("akiha-thresholds");
  startAkiha(state);
  state.players.a.mana = 2;
  const action = invoke(state, AKIHA_BLOODLUST_ID, { abilityId: AKIHA_BLOODLUST_ACTION });
  assert.equal(action.manaGained, 1);
  assert.equal(action.powerBonus, 2);
  assert.equal(action.bloodlust, 3);
  assert.equal(state.players.a.flags.akihaBloodlustLossBlockedRound, state.round);
  const protectedLoss = invoke(state, AKIHA_DEMONIC_HERITAGE_ID, { eventType: "combat.ending", event: {} }, { randomInt: () => 2 });
  assert.equal(protectedLoss.loss, 0);
  assert.equal(getCustomResource(state.players.a, "bloodlust"), 3);

  invoke(state, AKIHA_DEMONIC_HERITAGE_ID, { eventType: "player.mana.spent", event: { playerId: "a", amount: 2 } });
  createOwnedCardInstance(state, "a", { instanceId: "brilliant", definitionId: AKIHA_ASCENSION_ID, zone: "attack", face: "up", active: true });
  const before = calculateCombatCardPower(state, state.players.a, "brilliant", definitions, "mountain");
  invoke(state, AKIHA_BLOODLUST_ID, { eventType: "card.played", event: { playerId: "a", instanceId: "brilliant", definitionId: AKIHA_ASCENSION_ID } });
  assert.equal(calculateCombatCardPower(state, state.players.a, "brilliant", definitions, "mountain"), before + 1);

  invoke(state, AKIHA_DEMONIC_HERITAGE_ID, { eventType: "player.mana.spent", event: { playerId: "a", amount: 5 } });
  assert.ok(state.players.a.flags.skillEightManaWaiverSourceIds.includes(AKIHA_BLOODLUST_ID));
  const gated = Object.values(definitions).find((definition) => definition.isSkill && definition.requiresEightMana === true && definition.id !== AKIHA_ASCENSION_ID);
  assert.ok(gated);
  createOwnedCardInstance(state, "a", { instanceId: "gated", definitionId: gated.id, zone: gated.skillOwnerType === "master" ? "master-skills" : "servant-skills", face: "up", active: false });
  state.players.a.mana = 1;
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "a", instanceId: "gated", definitions, faceDown: false }));
});

test("15 Bloodlust transforms into Vermilion: Bloodlust stays 1, seals are lost, mana gains double and VP gains halve down", () => {
  const state = fresh("akiha-vermilion");
  startAkiha(state);
  state.players.a.commandSeals = 3;
  invoke(state, AKIHA_DEMONIC_HERITAGE_ID, { eventType: "player.mana.spent", event: { playerId: "a", amount: 15 } });
  const transformed = invoke(state, AKIHA_BLOODLUST_ID, { eventType: "round.ending", event: {} });
  assert.equal(transformed.lostCommandSeals, 3);
  assert.equal(state.players.a.flags.akihaVermilion, true);
  assert.equal(state.players.a.commandSeals, 0);
  assert.equal(getCustomResource(state.players.a, "bloodlust"), 1);
  assert.ok(!state.players.a.flags.skillEightManaWaiverSourceIds?.includes(AKIHA_BLOODLUST_ID));

  state.players.a.mana = 0;
  assert.equal(gainMana(state.players.a, 2), 4);
  const vpBefore = state.players.a.victoryPoints;
  assert.equal(gainVictoryPoints(state.players.a, 3), 1);
  assert.equal(state.players.a.victoryPoints, vpBefore + 1);

  state.players.a.mana = 2;
  state.players.o1.mana = 6;
  prepareCommandManaContribution(state, "a", { manaContribution: { contributorPlayerId: "o1", amount: 1 } });
  assert.throws(() => payManaCost(state, state.players.a, 3, definitions), /MANA_CONTRIBUTION_NOT_ALLOWED/);
  clearCommandManaContribution(state);
});

test("Brilliant Phantasm penalizes only actual Caging Hair contributors while Akiha, then gains +3 cost/+4 power as Vermilion", () => {
  const state = fresh("akiha-brilliant");
  startAkiha(state);
  createOwnedCardInstance(state, "a", { instanceId: "brilliant", definitionId: AKIHA_ASCENSION_ID, zone: "attack", face: "up", active: true });
  state.cards.brilliant.playManaContributions = [{ playerId: "o1", amount: 1 }, { playerId: "o2", amount: 1 }];
  const before1 = calculateCombatPower(state, state.players.o1, definitions, "mountain");
  const before2 = calculateCombatPower(state, state.players.o2, definitions, "mountain");
  invoke(state, AKIHA_ASCENSION_ID, { eventType: "card.played", event: { playerId: "a", instanceId: "brilliant", definitionId: AKIHA_ASCENSION_ID } });
  assert.equal(calculateCombatPower(state, state.players.o1, definitions, "mountain"), Math.max(0, before1 - 3));
  assert.equal(calculateCombatPower(state, state.players.o2, definitions, "mountain"), Math.max(0, before2 - 3));
  closePlayerCard(state, "a", "brilliant", definitions);
  assert.equal(calculateCombatPower(state, state.players.o1, definitions, "mountain"), before1);

  invoke(state, AKIHA_DEMONIC_HERITAGE_ID, { eventType: "player.mana.spent", event: { playerId: "a", amount: 15 } });
  invoke(state, AKIHA_BLOODLUST_ID, { eventType: "round.ending", event: {} });
  createOwnedCardInstance(state, "a", { instanceId: "brilliant2", definitionId: AKIHA_ASCENSION_ID, zone: "master-skills", face: "up", active: false });
  assert.equal(getCardPlayCost(state, definitions[AKIHA_ASCENSION_ID], state.players.a, state.cards.brilliant2, definitions), 6);
  state.cards.brilliant2.zone = "attack";
  state.cards.brilliant2.active = true;
  assert.equal(calculateCombatCardPower(state, state.players.a, "brilliant2", definitions, "mountain"), 10);
});
