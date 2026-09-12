import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CardAbilityRegistry } from "../src/rules-core/card-abilities.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  CAULES_FORVEDGE_ASCENSION_HANDLER,
  CAULES_FORVEDGE_ASCENSION_ID,
  CAULES_FORVEDGE_BATTERY_HANDLER,
  CAULES_FORVEDGE_BATTERY_ID,
  CAULES_FORVEDGE_BIOELECTROMANCER_HANDLER,
  CAULES_FORVEDGE_CRAFTED_TREE_HANDLER,
  CAULES_FORVEDGE_CRAFTED_TREE_ID,
  CAULES_FORVEDGE_OVERHEAL_ABILITY,
  CAULES_FORVEDGE_OVERLOAD_ABILITY,
  CAULES_FORVEDGE_RECHARGE_ABILITY,
  useCaulesForvedgeCraftedTree,
  useCaulesForvedgeEnhancedCircuits,
  useCaulesForvedgePrimevalBattery,
} from "../src/rules-core/caules-forvedge.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function setup(id = "caules-forvedge") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "c", name: "Caules" }, { id: "o", name: "Opponent" }, { id: "x", name: "Remote" }],
    seed: 939,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "c";
  state.turnOrder = ["c", "o", "x"];
  state.players.c.masterId = "master.caules";
  state.players.c.locationId = "workshop";
  state.players.o.locationId = "workshop";
  state.players.x.locationId = "city";
  state.players.c.mana = 10;
  state.players.c.victoryPoints = 6;
  state.players.o.mana = 10;
  state.players.x.mana = 10;
  state.board.locations.workshop = ["c", "o"];
  state.board.locations.city = ["x"];
  state.board.locations.mountain = [];
  state.board.locations.scouting = [];
  return state;
}

function add(state, playerId, instanceId, definitionId, zone = "attack", extra = {}) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face: zone === "attack" ? "up" : "down",
    active: zone === "attack",
    ...extra,
  });
}

function skill(id) {
  return built.skills.get(id);
}

test("Caules Forvedge package is 5/5 FULL with dedicated handlers and exact Crafted Tree face", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.caules");
  assert.equal(skills.length, 5);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.equal(skill("master.caules.skill.s1").handlerId, CAULES_FORVEDGE_BIOELECTROMANCER_HANDLER);
  assert.equal(skill(CAULES_FORVEDGE_BATTERY_ID).handlerId, CAULES_FORVEDGE_BATTERY_HANDLER);
  assert.equal(skill(CAULES_FORVEDGE_CRAFTED_TREE_ID).handlerId, CAULES_FORVEDGE_CRAFTED_TREE_HANDLER);
  assert.equal(skill(CAULES_FORVEDGE_ASCENSION_ID).handlerId, CAULES_FORVEDGE_ASCENSION_HANDLER);
  const tree = skill(CAULES_FORVEDGE_CRAFTED_TREE_ID);
  assert.equal(tree.initiallyOwned, false);
  assert.equal(tree.cost, 3);
  assert.equal(tree.requirement, 3);
  assert.equal(tree.basePower, 6);
  assert.deepEqual(tree.attributes, ["魔术"]);
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.unmodeledClauses ?? []), []);
});

test("Primeval Battery requires Workshop and shares one option per round", () => {
  const state = setup("caules-battery");
  const result = built.skills.execute(
    state, "c", CAULES_FORVEDGE_BATTERY_ID,
    { abilityId: CAULES_FORVEDGE_RECHARGE_ABILITY, x: 2 }, () => undefined, () => 0, definitions,
  );
  assert.equal(result.victoryPointsSpent, 2);
  assert.equal(state.players.c.victoryPoints, 4);
  assert.equal(state.players.c.mana, 15);
  assert.throws(() => built.skills.execute(
    state, "c", CAULES_FORVEDGE_BATTERY_ID,
    { abilityId: CAULES_FORVEDGE_OVERHEAL_ABILITY }, () => undefined, () => 0, definitions,
  ), /SKILL_USE_FORBIDDEN/);

  const away = setup("caules-battery-away");
  away.players.c.locationId = "mountain";
  away.board.locations.workshop = ["o"];
  away.board.locations.mountain = ["c"];
  assert.throws(() => built.skills.execute(
    away, "c", CAULES_FORVEDGE_BATTERY_ID,
    { abilityId: CAULES_FORVEDGE_RECHARGE_ABILITY, x: 0 }, () => undefined, () => 0, definitions,
  ), /SKILL_USE_FORBIDDEN/);
});

test("Overheal grants current-round defeat immunity and Overload creates one hidden chosen Crafted Tree", () => {
  const overheal = setup("caules-overheal");
  built.skills.execute(
    overheal, "c", CAULES_FORVEDGE_BATTERY_ID,
    { abilityId: CAULES_FORVEDGE_OVERHEAL_ABILITY }, () => undefined, () => 0, definitions,
  );
  assert.equal(overheal.players.c.mana, 8);
  assert.equal(overheal.players.c.flags.ignoreDefeatRound, overheal.round);

  const overload = setup("caules-overload");
  overload.phase = "combat";
  built.skills.execute(
    overload, "c", CAULES_FORVEDGE_BATTERY_ID,
    { abilityId: CAULES_FORVEDGE_OVERLOAD_ABILITY, variantId: "strength" }, () => undefined, () => 0, definitions,
  );
  const tree = overload.cards["c:caules-crafted-tree:strength"];
  assert.equal(tree.zone, "master-skills");
  assert.equal(tree.face, "down");
  assert.equal(tree.active, false);
  assert.equal(tree.declaredAttribute, "力量");
  assert.equal(tree.declaredAttributeRevealed, false);
  assert.throws(() => useCaulesForvedgePrimevalBattery({
    state: overload, player: overload.players.c, skill: skill(CAULES_FORVEDGE_BATTERY_ID), definitions,
    payload: { abilityId: CAULES_FORVEDGE_OVERLOAD_ABILITY, variantId: "strength" }, openDecision: () => undefined,
  }), /CAULES_CRAFTED_TREE_VARIANT_ALREADY_CREATED/);
});

test("Crafted Tree uses generic attribute activation lock only at its controller location", () => {
  const state = setup("caules-tree-lock");
  state.phase = "action";
  const tree = add(state, "c", "tree", CAULES_FORVEDGE_CRAFTED_TREE_ID, "attack");
  tree.declaredAttribute = "力量";
  tree.declaredAttributeRevealed = true;
  useCaulesForvedgeCraftedTree({
    state, player: state.players.c, skill: skill(CAULES_FORVEDGE_CRAFTED_TREE_ID), definitions,
    payload: { eventType: "card.played", event: { playerId: "c", instanceId: tree.instanceId } }, openDecision: () => undefined,
  });

  const registry = new CardAbilityRegistry();
  registry.register("test.strength-action", () => undefined);
  const local = add(state, "o", "local-strength", "test.strength", "attack");
  const remote = add(state, "x", "remote-strength", "test.strength", "attack");
  const customDefinitions = {
    ...definitions,
    "test.strength": {
      id: "test.strength", name: "Strength Test", cardType: "attack", cost: 0, basePower: 1,
      typeLabel: "力量", attributes: ["力量"], cardAbilityIds: ["test.strength-action"], phases: ["action"],
    },
  };
  assert.throws(() => registry.execute("test.strength-action", {
    state, playerId: "o", instanceId: local.instanceId, definitions: customDefinitions,
  }), /CARD_ABILITY_ACTIVATION_BLOCKED/);
  assert.doesNotThrow(() => registry.execute("test.strength-action", {
    state, playerId: "x", instanceId: remote.instanceId, definitions: customDefinitions,
  }));
});

test("Special Crafted Tree exempts Luck", () => {
  const state = setup("caules-tree-luck");
  state.phase = "combat";
  const tree = add(state, "c", "special-tree", CAULES_FORVEDGE_CRAFTED_TREE_ID, "attack");
  tree.declaredAttribute = "特殊";
  useCaulesForvedgeCraftedTree({
    state, player: state.players.c, skill: skill(CAULES_FORVEDGE_CRAFTED_TREE_ID), definitions,
    payload: { eventType: "card.played", event: { playerId: "c", instanceId: tree.instanceId } }, openDecision: () => undefined,
  });
  const luck = add(state, "o", "luck", "card.cardluck", "attack");
  const registry = new CardAbilityRegistry();
  registry.register("basic.ignore-defeat", () => undefined);
  const luckDefinitions = {
    ...definitions,
    "card.cardluck": { ...definitions["card.cardluck"], cardAbilityIds: ["basic.ignore-defeat"], phases: ["combat"] },
  };
  assert.doesNotThrow(() => registry.execute("basic.ignore-defeat", {
    state, playerId: "o", instanceId: luck.instanceId, definitions: luckDefinitions,
  }));
});

test("Enhanced Circuits adds all remaining Trees, disables Overload, and Battery grants +2 to Magic attacks this round", () => {
  const state = setup("caules-enhanced");
  useCaulesForvedgeEnhancedCircuits({
    state, player: state.players.c, skill: skill(CAULES_FORVEDGE_ASCENSION_ID), definitions,
    payload: { eventType: "skill.unlocked", event: { playerId: "c", skillId: CAULES_FORVEDGE_ASCENSION_ID } },
    openDecision: () => undefined,
  });
  const trees = state.players.c.masterSkills.map((id) => state.cards[id]).filter((card) => card.definitionId === CAULES_FORVEDGE_CRAFTED_TREE_ID);
  assert.equal(trees.length, 5);
  assert.ok(trees.every((card) => card.face === "up" && card.declaredAttributeRevealed === true));
  assert.equal(state.players.c.flags.caulesForvedgeEnhancedCircuits, true);

  state.phase = "combat";
  assert.throws(() => useCaulesForvedgePrimevalBattery({
    state, player: state.players.c, skill: skill(CAULES_FORVEDGE_BATTERY_ID), definitions,
    payload: { abilityId: CAULES_FORVEDGE_OVERLOAD_ABILITY, variantId: "strength" }, openDecision: () => undefined,
  }), /CAULES_BATTERY_OVERLOAD_DISABLED/);

  const magic = add(state, "c", "magic-attack", "card.carda4", "attack");
  const before = calculateCombatCardPower(state, state.players.c, magic.instanceId, definitions, "workshop");
  state.phase = "outpost";
  useCaulesForvedgePrimevalBattery({
    state, player: state.players.c, skill: skill(CAULES_FORVEDGE_BATTERY_ID), definitions,
    payload: { abilityId: CAULES_FORVEDGE_RECHARGE_ABILITY, x: 0 }, openDecision: () => undefined,
  });
  const after = calculateCombatCardPower(state, state.players.c, magic.instanceId, definitions, "workshop");
  assert.equal(after, before + 2);
});
