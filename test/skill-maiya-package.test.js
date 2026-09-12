import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { finalizeCombatFromSnapshot } from "../src/rules-core/combat.ts";
import { calculateTerrainAdvantage } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  MAIYA_ASCENSION_ID,
  MAIYA_HANDLER,
  MAIYA_MILITARY_ID,
  MAIYA_SHOOTING_ID,
  MAIYA_SUPPORT_FIRE_ID,
  useMaiya,
} from "../src/rules-core/maiya.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function setup(id = "maiya") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "m", name: "Maiya" }, { id: "b", name: "Borrower" }],
    seed: 91,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "m";
  state.turnOrder = ["m", "b"];
  state.players.m.masterId = "master.maiya";
  state.players.m.mana = 10;
  state.players.b.mana = 10;
  state.players.m.locationId = "workshop";
  state.players.b.locationId = "mountain";
  state.board.locations.workshop = ["m"];
  state.board.locations.mountain = ["b"];
  return state;
}

function addSupportFire(state) {
  return createOwnedCardInstance(state, "m", {
    instanceId: `${state.gameInstanceId}:support-fire`,
    definitionId: MAIYA_SUPPORT_FIRE_ID,
    zone: "master-skills",
    face: "up",
    active: false,
  });
}

function ctx(state, playerId, skillId, payload = {}) {
  return {
    state,
    player: state.players[playerId],
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
  };
}

test("Maiya package is 3/3 FULL and Support Fire has its authored attack face", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.maiya");
  assert.equal(skills.length, 3);
  assert.equal(skills.filter((skill) => skill.supportLevel === "FULL").length, 3);
  assert.deepEqual(skills.filter((skill) => skill.supportLevel === "PARTIAL"), []);
  for (const skill of skills) assert.equal(skill.handlerId, MAIYA_HANDLER);
  const support = definitions[MAIYA_SUPPORT_FIRE_ID];
  assert.equal(support.cardType, "attack");
  assert.equal(support.cost, 2);
  assert.equal(support.requirement, 2);
  assert.equal(support.basePower, 0);
  assert.deepEqual(support.attributes, ["迅捷"]);
  assert.equal(support.standardAppend, true);
});

test("Military Experience pays 2 mana, lends the physical Support Fire, and excludes Maiya from combat winners", () => {
  const state = setup("maiya-military");
  const support = addSupportFire(state);
  const manaBefore = state.players.m.mana;
  const result = built.skills.execute(state, "m", MAIYA_MILITARY_ID, { abilityId: "military-support" }, () => {}, () => 0, definitions);
  assert.equal(state.players.m.mana, manaBefore - 2);
  assert.equal(result.targetPlayerId, "b");
  assert.equal(support.ownerPlayerId, "m");
  assert.equal(support.controllerPlayerId, "b");
  assert.equal(support.zone, "attack");
  assert.equal(support.active, true);
  assert.ok(state.activeRuleModifiers.some((modifier) => modifier.rule === "combat_winner_eligibility" && modifier.controllerPlayerId === "m"));

  state.players.m.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["m", "b"];
  state.phase = "combat";
  const snapshot = {
    round: state.round,
    locationId: "mountain",
    participantIds: ["m", "b"],
    powers: { m: 10, b: 5 },
    attributes: { m: [], b: [] },
    participantVictoryPointsBeforeCombat: { m: 0, b: 0 },
    cardPowers: { m: {}, b: {} },
    cardAttributes: { m: {}, b: {} },
  };
  const combat = finalizeCombatFromSnapshot(state, snapshot, definitions, {});
  assert.deepEqual(combat.winnerIds, ["b"]);
});

test("the borrower can use Suppressing Fire, pays Maiya 2 VP, and applies (terrain + 1) x2", () => {
  const state = setup("maiya-suppressing");
  addSupportFire(state);
  built.skills.execute(state, "m", MAIYA_MILITARY_ID, { abilityId: "military-support" }, () => {}, () => 0, definitions);
  state.phase = "action";
  state.activePlayerId = "b";
  state.players.b.victoryPoints = 3;
  state.players.b.flags.deploymentBonusActive = true;
  state.players.b.flags.deploymentLocationId = "mountain";
  state.players.b.flags.deploymentBonus = 2;
  assert.ok(built.skills.getLegalActions(state, "b", definitions).some((action) => action.payload?.skillId === MAIYA_SUPPORT_FIRE_ID));
  const result = built.skills.execute(state, "b", MAIYA_SUPPORT_FIRE_ID, { abilityId: "suppressing-fire" }, () => {}, () => 0, definitions);
  assert.equal(result.paidVictoryPoints, 2);
  assert.equal(state.players.b.victoryPoints, 1);
  assert.equal(state.players.m.victoryPoints, 2);
  assert.equal(result.terrainAdvantageBefore, 2);
  assert.equal(result.terrainAdvantageAfter, 6);
  assert.equal(calculateTerrainAdvantage(state, state.players.b, definitions, "mountain"), 6);
});

test("Support Fire returns to Maiya's Skill Zone at round end", () => {
  const state = setup("maiya-return");
  const support = addSupportFire(state);
  built.skills.execute(state, "m", MAIYA_MILITARY_ID, { abilityId: "military-support" }, () => {}, () => 0, definitions);
  const result = useMaiya(ctx(state, "m", MAIYA_MILITARY_ID, { eventType: "round.ending", event: {} }));
  assert.equal(result.returnedInstanceId, support.instanceId);
  assert.equal(support.controllerPlayerId, "m");
  assert.equal(support.zone, "master-skills");
  assert.equal(support.active, false);
  assert.ok(state.players.m.masterSkills.includes(support.instanceId));
  assert.equal(state.players.b.attack.includes(support.instanceId), false);
});

test("Dessert Fanatic removes Magic cards, grants 2 mana each, and creates the outside-game Shooting card", () => {
  const state = setup("maiya-ascension");
  state.players.m.mana = 0;
  createOwnedCardInstance(state, "m", { instanceId: "m:magic-hand", definitionId: "card.carda1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "m", { instanceId: "m:magic-deck", definitionId: "card.carda2", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "m", { instanceId: "m:strength-discard", definitionId: "card.cardb1", zone: "discard", face: "up", active: false });
  const result = useMaiya(ctx(state, "m", MAIYA_ASCENSION_ID, { eventType: "skill.unlocked", event: { playerId: "m", skillId: MAIYA_ASCENSION_ID } }));
  assert.deepEqual(new Set(result.removedInstanceIds), new Set(["m:magic-hand", "m:magic-deck"]));
  assert.equal(state.cards["m:magic-hand"].zone, "removed");
  assert.equal(state.cards["m:magic-deck"].zone, "removed");
  assert.equal(state.cards["m:strength-discard"].zone, "discard");
  assert.equal(state.players.m.mana, 4);
  const shooting = state.cards[result.shootingInstanceId];
  assert.equal(shooting.definitionId, MAIYA_SHOOTING_ID);
  assert.equal(shooting.zone, "master-skills");
  const definition = definitions[MAIYA_SHOOTING_ID];
  assert.equal(definition.cost, 1);
  assert.equal(definition.requirement, 0);
  assert.equal(definition.basePower, 3);
  assert.deepEqual(definition.attributes, ["迅捷"]);
  assert.equal(definition.standardAppend, true);
});
