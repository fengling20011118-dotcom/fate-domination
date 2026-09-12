import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import {
  FIORE_CLEVER_MIND_ID,
  FIORE_DETERMINATION_ID,
  FIORE_FULL_RECOVERY_ID,
  FIORE_NEUROMECHANICS_ID,
  FIORE_TRANSCEND_ID,
  useFioreCleverMind,
  useFioreDetermination,
  useFioreFullRecovery,
  useFioreNeuromechanics,
  useFioreTranscend,
} from "../src/rules-core/fiore.ts";

function setup(id = "fiore-package") {
  const built = buildStandardContent(legacyContent);
  new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "p", name: "菲奥蕾" }, { id: "q", name: "对手" }],
    seed: 6102,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "p";
  state.turnOrder = ["p", "q"];
  state.players.p.masterId = "master.fiore";
  state.players.p.locationId = "workshop";
  state.players.q.locationId = "mountain";
  state.players.p.mana = 20;
  state.players.p.victoryPoints = 2;
  state.players.q.victoryPoints = 5;
  state.players.p.flags.movementLockedOwnActionCombat = true;
  state.players.p.flags.fioreGentle = true;
  state.players.p.flags.roundManaGainCap = 2;
  state.board.locations.workshop = ["p"];
  state.board.locations.mountain = ["q"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, definitions, state };
}

function skill(built, id) {
  return built.skills.list().find((candidate) => candidate.id === id);
}

function activateSkillCard(state, playerId, instanceId, definitionId) {
  createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone: "attack",
    face: "up",
    active: true,
    temporary: false,
  });
}

test("菲奥蕾整包9/9 FULL且所有FULL技能均有处理器", () => {
  const { built } = setup("fiore-full");
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.fiore");
  assert.equal(skills.length, 9);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.unmodeledClauses ?? []), []);
  assert.equal(skill(built, FIORE_NEUROMECHANICS_ID).initiallyOwned, false);
  assert.equal(skill(built, FIORE_DETERMINATION_ID).initiallyOwned, false);
  assert.equal(skill(built, FIORE_CLEVER_MIND_ID).initiallyOwned, false);
  assert.equal(skill(built, FIORE_FULL_RECOVERY_ID).initiallyOwned, false);
});

test("超越替换瘫痪并在回合结束恢复，行动阶段第二次超越战后失去4魔力", () => {
  const { built, state } = setup("fiore-transcend");
  const transcend = skill(built, FIORE_TRANSCEND_ID);
  const first = useFioreTranscend({
    state,
    player: state.players.p,
    skill: transcend,
    payload: { abilityId: "transcend-outpost", pairId: "paralysis" },
    openDecision: () => undefined,
  });
  assert.equal(first.pair, "paralysis");
  assert.equal(state.players.p.flags.movementLockedOwnActionCombat, false);
  assert.ok(state.players.p.masterSkills.some((id) => state.cards[id]?.definitionId === FIORE_NEUROMECHANICS_ID));

  state.phase = "action";
  useFioreTranscend({
    state,
    player: state.players.p,
    skill: transcend,
    payload: { abilityId: "transcend-action", pairId: "circuit" },
    openDecision: () => undefined,
  });
  assert.equal(state.players.p.flags.roundManaGainCap, undefined);
  state.players.p.mana = 10;
  useFioreTranscend({ state, player: state.players.p, skill: transcend, payload: { eventType: "combat.ending" }, openDecision: () => undefined });
  assert.equal(state.players.p.mana, 6);

  useFioreTranscend({ state, player: state.players.p, skill: transcend, payload: { eventType: "round.ending" }, openDecision: () => undefined });
  assert.equal(state.players.p.flags.movementLockedOwnActionCombat, true);
  assert.equal(state.players.p.flags.roundManaGainCap, 2);
  assert.ok(!Object.values(state.cards).some((card) => card.ownerPlayerId === "p" && card.temporary === true
    && [FIORE_NEUROMECHANICS_ID, FIORE_CLEVER_MIND_ID, FIORE_DETERMINATION_ID].includes(card.definitionId) && card.zone !== "removed"));
});

test("神经机械学解除瘫痪后可沿箭头移动，并在未部署战场获得2点地利", () => {
  const { built, definitions, state } = setup("fiore-neuro");
  state.phase = "action";
  state.players.p.flags.movementLockedOwnActionCombat = false;
  activateSkillCard(state, "p", "neuro", FIORE_NEUROMECHANICS_ID);
  const neuro = skill(built, FIORE_NEUROMECHANICS_ID);
  const movement = useFioreNeuromechanics({
    state, player: state.players.p, skill: neuro,
    payload: { abilityId: "neuromechanics-move" }, definitions,
  });
  assert.equal(movement.locationId, "mountain");
  assert.equal(state.players.p.locationId, "mountain");
  state.players.p.flags.deploymentLocationId = "workshop";
  useFioreNeuromechanics({
    state, player: state.players.p, skill: neuro,
    payload: { abilityId: "neuromechanics-terrain" }, definitions,
  });
  assert.equal(state.players.p.flags.roundTerrainAdvantageBonus, 2);
  assert.equal(state.players.p.flags.roundTerrainAdvantageBonusLocationId, "mountain");
});

test("决意只在本回合战胜所选高战果对手时获得2战果", () => {
  const { built, state } = setup("fiore-resolute");
  const transcend = skill(built, FIORE_TRANSCEND_ID);
  useFioreTranscend({
    state, player: state.players.p, skill: transcend,
    payload: { abilityId: "transcend-outpost", pairId: "gentle", targetPlayerId: "q" },
    openDecision: () => undefined,
  });
  assert.equal(state.players.p.flags.fioreGentle, false);
  const before = state.players.p.victoryPoints;
  useFioreDetermination({
    state,
    player: state.players.p,
    skill: skill(built, FIORE_DETERMINATION_ID),
    payload: { eventType: "combat.resolved", event: { winnerIds: ["p"], powers: { p: 8, q: 4 } } },
  });
  assert.equal(state.players.p.victoryPoints, before + 2);
});

test("聪慧头脑强化自己的技能牌，完全恢复追加超越并在战败时失去2战果", () => {
  const { built, definitions, state } = setup("fiore-clever-recovery");
  state.phase = "action";
  activateSkillCard(state, "p", "clever", FIORE_CLEVER_MIND_ID);
  activateSkillCard(state, "p", "neuro", FIORE_NEUROMECHANICS_ID);
  const beforePower = calculateCombatCardPower(state, state.players.p, "neuro", definitions, "workshop");
  useFioreCleverMind({
    state, player: state.players.p, skill: skill(built, FIORE_CLEVER_MIND_ID),
    payload: { abilityId: "clever-mind-reinforcement" }, definitions,
  });
  assert.equal(calculateCombatCardPower(state, state.players.p, "neuro", definitions, "workshop"), beforePower + 1);

  const vpBefore = state.players.p.victoryPoints;
  useFioreFullRecovery({
    state, player: state.players.p, skill: skill(built, FIORE_FULL_RECOVERY_ID),
    payload: { abilityId: "full-recovery", pairId: "paralysis" }, openDecision: () => undefined,
  });
  assert.equal(state.players.p.flags.movementLockedOwnActionCombat, false);
  useFioreFullRecovery({
    state, player: state.players.p, skill: skill(built, FIORE_FULL_RECOVERY_ID),
    payload: { eventType: "combat.resolved", event: { winnerIds: ["q"], powers: { p: 2, q: 7 } } }, openDecision: () => undefined,
  });
  assert.equal(state.players.p.victoryPoints, vpBefore - 2);
});
