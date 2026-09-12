import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { calculateCombatPower, calculateTerrainAdvantage, getActiveCombatCardIds } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { isOtherPlayerAbilityEffectIgnored } from "../src/rules-core/ability-immunity.ts";
import { isStructuredMovementDestinationForbidden } from "../src/rules-core/rule-modifiers.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  ACHILLES_AMARANTOS_ID,
  ACHILLES_HANDLER,
  ACHILLES_KOSMOS_ID,
  ACHILLES_LONKHE_ID,
  useAchilles,
} from "../src/rules-core/achilles.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const runtimeCatalog = {
  servantDecks: built.playerDecks,
  servantClasses: built.servantClasses,
  skillDefinitions: built.skills.list(),
  masterInitialMana: built.masterInitialMana,
};

function setup(id = "achilles") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "a", name: "Achilles" }, { id: "o", name: "Opponent" }, { id: "x", name: "Third" }],
    seed: 73,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = ["a", "o", "x"];
  state.players.a.servantId = "servant.achilles";
  state.players.o.servantId = "servant.nitocris";
  state.players.x.servantId = "servant.artoria";
  for (const id of ["a", "o", "x"]) state.players[id].mana = 12;
  state.players.a.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.x.locationId = "city";
  state.board.locations.mountain = ["a", "o"];
  state.board.locations.city = ["x"];
  return state;
}

function addSkill(state, skillId, owner = "a", instanceId = `${owner}:${skillId}`) {
  return createOwnedCardInstance(state, owner, { instanceId, definitionId: skillId, zone: "attack", face: "up", active: true });
}

function addCard(state, owner, definitionId, zone = "hand", instanceId = `${owner}:${definitionId}:${Object.keys(state.cards).length}`) {
  return createOwnedCardInstance(state, owner, { instanceId, definitionId, zone, face: zone === "attack" ? "up" : "down", active: zone === "attack" });
}

function ctx(state, skillId, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.a,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    runtimeCatalog,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extra,
  };
}

test("Achilles package is 3/3 FULL with its dedicated handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.achilles");
  assert.equal(skills.length, 3);
  assert.equal(skills.filter((skill) => skill.supportLevel === "FULL").length, 3);
  assert.deepEqual(skills.filter((skill) => skill.supportLevel === "PARTIAL"), []);
  for (const skill of skills) {
    assert.equal(skill.handlerId, ACHILLES_HANDLER);
    assert.equal(built.skills.hasHandler(skill.id), true);
  }
});

test("Andreias Amarantos randomly discards at combat start, zeroes non-Luck/non-Agility opponents, and reveals after a loss", () => {
  const state = setup("achilles-amarantos");
  state.players.a.trueNameRevealed = false;
  const discarded = addCard(state, "o", "card.cardb1", "hand", "o:strength");
  state.phase = "combat";
  const result = useAchilles(ctx(state, ACHILLES_AMARANTOS_ID, { eventType: "phase.transitioned", event: { previousPhase: "action" } }));
  assert.deepEqual(result.discardedInstanceIds, [discarded.instanceId]);
  assert.deepEqual(result.zeroedPlayerIds, ["o"]);
  assert.equal(state.cards[discarded.instanceId].zone, "discard");
  assert.equal(state.players.o.flags.combatPowerOverrideRound, state.round);
  assert.equal(state.players.o.flags.combatPowerOverrideValue, 0);

  useAchilles(ctx(state, ACHILLES_AMARANTOS_ID, {
    eventType: "combat.resolved",
    event: { locationId: "mountain", participantIds: ["a", "o"], powers: { a: 2, o: 5 }, winnerIds: ["o"] },
  }));
  assert.equal(state.players.a.trueNameRevealed, true);
});

test("Andreias Amarantos does not zero an opponent who randomly discards Agility", () => {
  const state = setup("achilles-amarantos-agility");
  state.players.a.trueNameRevealed = false;
  addCard(state, "o", "card.cardq1", "hand", "o:agility");
  state.phase = "combat";
  const result = useAchilles(ctx(state, ACHILLES_AMARANTOS_ID, { eventType: "phase.transitioned", event: { previousPhase: "action" } }));
  assert.deepEqual(result.zeroedPlayerIds, []);
  assert.equal(state.players.o.flags.combatPowerOverrideRound, undefined);
});

test("Akhilleus Kosmos enforces one option per round, pays 3 mana for temporary name hiding, and restores the name", () => {
  const state = setup("achilles-kosmos-hide");
  addSkill(state, ACHILLES_KOSMOS_ID);
  state.players.a.trueNameRevealed = true;
  const before = state.players.a.mana;
  built.skills.execute(state, "a", ACHILLES_KOSMOS_ID, { abilityId: "kosmos-hide-name" }, () => {}, () => 0, definitions, undefined, undefined, runtimeCatalog);
  assert.equal(state.players.a.mana, before - 3);
  assert.equal(state.players.a.trueNameRevealed, false);
  assert.throws(() => built.skills.execute(state, "a", ACHILLES_KOSMOS_ID, { abilityId: "kosmos-random-discard" }, () => {}, () => 0, definitions, undefined, undefined, runtimeCatalog), /SKILL_USE_FORBIDDEN/);

  useAchilles(ctx(state, ACHILLES_KOSMOS_ID, { eventType: "round.ended", event: {} }));
  assert.equal(state.players.a.trueNameRevealed, true);
});

test("Akhilleus Kosmos random-discard and skill-lock options affect all battlefield opponents", () => {
  const discardState = setup("achilles-kosmos-discard");
  addSkill(discardState, ACHILLES_KOSMOS_ID);
  addCard(discardState, "o", "card.cardb1", "hand", "o:discard-me");
  const discarded = useAchilles(ctx(discardState, ACHILLES_KOSMOS_ID, { abilityId: "kosmos-random-discard" }));
  assert.deepEqual(discarded.discardedInstanceIds, ["o:discard-me"]);

  const blockState = setup("achilles-kosmos-block");
  addSkill(blockState, ACHILLES_KOSMOS_ID);
  addSkill(blockState, "servant.nitocris.skill.sc-nitocris-1", "o", "o:nitocris-skill");
  blockState.activePlayerId = "o";
  assert.ok(built.skills.getLegalActions(blockState, "o", definitions).some((action) => action.payload?.skillId === "servant.nitocris.skill.sc-nitocris-1"));
  blockState.activePlayerId = "a";
  useAchilles(ctx(blockState, ACHILLES_KOSMOS_ID, { abilityId: "kosmos-block-skills" }));
  blockState.activePlayerId = "o";
  assert.equal(built.skills.getLegalActions(blockState, "o", definitions).some((action) => action.payload?.skillId === "servant.nitocris.skill.sc-nitocris-1"), false);
});

test("Diatrekhon Aster Lonkhe locks the battlefield and ignores terrain plus third-party cards/effects", () => {
  const state = setup("achilles-lonkhe");
  addSkill(state, ACHILLES_LONKHE_ID, "a", "a:lonkhe");
  const own = addCard(state, "o", "card.cardb1", "attack", "o:own-attack");
  const third = addCard(state, "x", "card.cardb4", "attack", "x:loaned-attack");
  state.players.x.attack = state.players.x.attack.filter((id) => id !== third.instanceId);
  state.players.o.attack.push(third.instanceId);
  third.controllerPlayerId = "o";
  state.players.o.flags.deploymentBonusActive = true;
  state.players.o.flags.deploymentLocationId = "mountain";
  state.players.o.flags.deploymentBonus = 3;

  const result = useAchilles(ctx(state, ACHILLES_LONKHE_ID, { abilityId: "hero-killer" }));
  assert.equal(result.opponentPlayerId, "o");
  assert.equal(calculateTerrainAdvantage(state, state.players.o, definitions, "mountain"), 0);
  assert.equal(isStructuredMovementDestinationForbidden(state, "x", definitions, { method: "effect", fromLocationId: "city", toLocationId: "mountain" }), true);
  assert.equal(isStructuredMovementDestinationForbidden(state, "o", definitions, { method: "effect", fromLocationId: "mountain", toLocationId: "city" }), true);
  assert.equal(isOtherPlayerAbilityEffectIgnored(state, "x", "o", "third-party-skill"), true);
  assert.equal(isOtherPlayerAbilityEffectIgnored(state, "a", "o", ACHILLES_LONKHE_ID), false);
  assert.deepEqual(getActiveCombatCardIds(state, state.players.o).sort(), [own.instanceId].sort());
  assert.ok(calculateCombatPower(state, state.players.o, definitions, "mountain") >= 0);
});
