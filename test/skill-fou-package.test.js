import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { payCommandSealCost } from "../src/rules-core/command-seals.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { applyClimaxElimination } from "../src/rules-core/rounds.ts";
import { closePlayerCard, createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { determineStandardFinalVictory } from "../src/rules-core/scoring.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  FOU_FORCE_ID,
  FOU_MARK_ID,
  getFouForceCandidates,
  getFouMarkCandidates,
  resolveFouForceOfProvidence,
  resolveFouMarkOfBeast,
  useFouForceOfProvidence,
  useFouMarkOfBeast,
} from "../src/rules-core/fou.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const TARGET_SKILL_ID = "servant.lance.skill.sc-lance-1"; // printed cost 4

function stateOf(id, playerCount = 3) {
  const players = Array.from({ length: playerCount }, (_, index) => ({ id: index === 0 ? "f" : `p${index}`, name: index === 0 ? "Fou" : `P${index}` }));
  const state = createGameState({ gameInstanceId: id, players, seed: 1616 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  state.players.f.masterId = "master.fou";
  for (const player of Object.values(state.players)) {
    player.mana = 20;
    player.commandSeals = 3;
  }
  return state;
}

function addOwned(state, playerId, instanceId, definitionId, zone, face = "up", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
  return state.cards[instanceId];
}

function addFouSources(state, withAscension = false) {
  addOwned(state, "f", "fou-main", FOU_MARK_ID, "master-skills", "up", false);
  if (withAscension) addOwned(state, "f", "fou-asc", FOU_FORCE_ID, "master-skills", "up", false);
}

function returnTargetSkillThisRound(state) {
  if (!state.cards.target) addOwned(state, "f", "target", TARGET_SKILL_ID, "servant-skills", "up", false);
  movePlayerCard(state, "f", "target", "attack");
  state.cards.target.face = "up";
  state.cards.target.active = true;
  closePlayerCard(state, "f", "target", definitions);
  assert.equal(state.cards.target.returnedToSkillZoneRound, state.round);
}

function resolveMark(state, instanceId = "target") {
  resolveFouMarkOfBeast({
    state,
    player: state.players.f,
    skill: built.skills.get(FOU_MARK_ID),
    payload: {
      previous: { candidates: [instanceId], round: state.round },
      decision: { status: "resolved", selections: [instanceId] },
    },
    definitions,
    openDecision: () => {},
  });
}

test("Fou 技能包 2/2 FULL 且均绑定专用 handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.fou");
  assert.equal(skills.length, 2);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("兽之印记只认实际花掉的令咒与本回合真实返回技能区的实体技能", () => {
  const state = stateOf("fou-mark-facts");
  addFouSources(state);
  addOwned(state, "f", "target", TARGET_SKILL_ID, "servant-skills", "up", false);
  assert.deepEqual(getFouMarkCandidates(state, "f", definitions), []);

  // Paying with an actual seal is expenditure even though it is not a Command Seal 'use' fact.
  payCommandSealCost(state, "f", 1);
  assert.equal(state.players.f.flags.commandSealSpentRound, state.round);
  assert.equal(state.players.f.flags.commandSealUsedRound, undefined);
  assert.deepEqual(getFouMarkCandidates(state, "f", definitions), []);

  returnTargetSkillThisRound(state);
  assert.deepEqual(getFouMarkCandidates(state, "f", definitions), ["target"]);

  let decision;
  useFouMarkOfBeast({
    state,
    player: state.players.f,
    skill: built.skills.get(FOU_MARK_ID),
    payload: { eventType: "round.ending", event: { round: state.round } },
    definitions,
    openDecision: (value) => { decision = value; },
  });
  assert.equal(decision.kind, "fou-mark-of-beast");
  assert.deepEqual(decision.options.map((option) => option.id), ["target"]);
});

test("令咒支付替代额度没有消耗真实令咒时，不会误触兽之印记", () => {
  const state = stateOf("fou-mark-substitution");
  addFouSources(state);
  returnTargetSkillThisRound(state);
  state.players.f.commandSeals = 0;
  state.players.f.flags.commandSealPaymentCreditRound = state.round;
  state.players.f.flags.commandSealPaymentCredits = 1;
  const paid = payCommandSealCost(state, "f", 1);
  assert.deepEqual(paid, { paidSeals: 0, substitutionCredits: 1 });
  assert.equal(state.players.f.flags.commandSealSpentRound, undefined);
  assert.deepEqual(getFouMarkCandidates(state, "f", definitions), []);
});

test("兽之印记可反复叠加：威力持续增加，费用最低为印刷费用一半", () => {
  const state = stateOf("fou-mark-stack");
  addFouSources(state);
  for (let count = 1; count <= 3; count += 1) {
    state.round = 3 + count;
    state.players.f.flags.commandSealSpentRound = state.round;
    returnTargetSkillThisRound(state);
    resolveMark(state);
  }
  const target = state.cards.target;
  const definition = definitions[target.definitionId];
  assert.equal(target.powerModifiers.filter((modifier) => modifier.sourceId === FOU_MARK_ID).length, 3);
  assert.equal(target.costModifiers.filter((modifier) => modifier.sourceId === FOU_MARK_ID).length, 3);
  assert.equal(getCardPlayCost(state, definition, state.players.f, target, definitions), 2);

  movePlayerCard(state, "f", "target", "attack");
  target.face = "up";
  target.active = true;
  assert.equal(calculateCombatCardPower(state, state.players.f, "target", definitions, "mountain"), Number(definition.basePower ?? 0) + 3);

  // Physical modifiers survive removal/return because they are not definition-level copy state.
  movePlayerCard(state, "f", "target", "removed");
  movePlayerCard(state, "f", "target", "servant-skills");
  assert.equal(target.powerModifiers.filter((modifier) => modifier.sourceId === FOU_MARK_ID).length, 3);
  assert.equal(getCardPlayCost(state, definition, state.players.f, target, definitions), 2);
});

test("苍天之力可防止对手的高潮淘汰，结算后交换战果并建立共同胜利", () => {
  const state = stateOf("fou-force-opponent", 5);
  state.round = 8;
  addFouSources(state, true);
  state.players.f.victoryPoints = 10;
  state.players.p1.victoryPoints = 9;
  state.players.p2.victoryPoints = 8;
  state.players.p3.victoryPoints = 7;
  state.players.p4.victoryPoints = 1;
  assert.deepEqual(getFouForceCandidates(state, "f", definitions), ["p4"]);

  let decision;
  useFouForceOfProvidence({
    state,
    player: state.players.f,
    skill: built.skills.get(FOU_FORCE_ID),
    payload: { eventType: "round.ending", event: { round: 8 } },
    definitions,
    openDecision: (value) => { decision = value; },
  });
  assert.equal(decision.kind, "fou-force-of-providence");
  assert.deepEqual(decision.options.map((option) => option.id), ["skip", "p4"]);

  resolveFouForceOfProvidence({
    state,
    player: state.players.f,
    skill: built.skills.get(FOU_FORCE_ID),
    payload: { previous: { candidates: ["p4"], round: 8 }, decision: { status: "resolved", selections: ["p4"] } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(state.cards["fou-asc"].used, true);
  assert.deepEqual(applyClimaxElimination(state, definitions), []);
  assert.equal(state.players.p4.eliminated, false);

  useFouForceOfProvidence({
    state,
    player: state.players.f,
    skill: built.skills.get(FOU_FORCE_ID),
    payload: { eventType: "elimination.resolved", event: { round: 8, eliminatedPlayerIds: [] } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(state.players.f.victoryPoints, 1);
  assert.equal(state.players.p4.victoryPoints, 10);
  const final = determineStandardFinalVictory(state);
  assert.deepEqual(new Set(final.winnerIds), new Set(["p4", "f"]));
  assert.deepEqual(getFouForceCandidates(state, "f", definitions), []);
});

test("苍天之力也可以救自己，救自己不交换战果也不制造额外胜者", () => {
  const state = stateOf("fou-force-self", 5);
  state.round = 8;
  addFouSources(state, true);
  state.players.f.victoryPoints = 0;
  state.players.p1.victoryPoints = 10;
  state.players.p2.victoryPoints = 9;
  state.players.p3.victoryPoints = 8;
  state.players.p4.victoryPoints = 7;
  assert.deepEqual(getFouForceCandidates(state, "f", definitions), ["f"]);
  resolveFouForceOfProvidence({
    state,
    player: state.players.f,
    skill: built.skills.get(FOU_FORCE_ID),
    payload: { previous: { candidates: ["f"], round: 8 }, decision: { status: "resolved", selections: ["f"] } },
    definitions,
    openDecision: () => {},
  });
  applyClimaxElimination(state, definitions);
  useFouForceOfProvidence({
    state,
    player: state.players.f,
    skill: built.skills.get(FOU_FORCE_ID),
    payload: { eventType: "elimination.resolved", event: { round: 8, eliminatedPlayerIds: [] } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(state.players.f.eliminated, false);
  assert.equal(state.players.f.victoryPoints, 0);
  assert.equal(state.modeState.sharedVictoryLinks, undefined);
});
