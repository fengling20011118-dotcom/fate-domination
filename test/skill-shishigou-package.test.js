import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { calculateCombatCardBasePower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  SHISHIGOU_CRAFTER_ID,
  SHISHIGOU_HANDLER,
  SHISHIGOU_MASTERY_ABILITY,
  SHISHIGOU_MASTERY_ID,
  SHISHIGOU_STORE_ABILITY,
  SHISHIGOU_USE_ABILITY,
  useShishigouNecromancy,
} from "../src/rules-core/shishigou.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  "card.test.str": { id: "card.test.str", name: "Strength Test", cardType: "attack", cost: 1, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.agi": { id: "card.test.agi", name: "Agility Test", cardType: "attack", cost: 1, basePower: 3, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
  "card.test.mag": { id: "card.test.mag", name: "Magic Test", cardType: "attack", cost: 1, basePower: 2, typeLabel: "魔术", attributes: ["魔术"], basic: true },
  "card.test.spc": { id: "card.test.spc", name: "Special Test", cardType: "attack", cost: 1, basePower: 0, typeLabel: "特殊", attributes: ["特殊"], basic: true },
  "card.test.top": { id: "card.test.top", name: "Top Test", cardType: "attack", cost: 2, basePower: 5, typeLabel: "力量", attributes: ["力量"], basic: true },
};

function skill(id) {
  return built.skills.get(id);
}

function setup(id = "shishigou") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "s", name: "Shishigou" }, { id: "o", name: "Opponent" }],
    seed: 1601,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "o"];
  state.players.s.masterId = "master.shishigou";
  state.players.s.locationId = "workshop";
  state.players.o.locationId = "mountain";
  state.players.s.mana = 10;
  state.board.locations.workshop = ["s"];
  state.board.locations.mountain = ["o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return state;
}

function add(state, instanceId, definitionId, zone = "attack", face = "up", active = true) {
  return createOwnedCardInstance(state, "s", { instanceId, definitionId, zone, face, active });
}

function ctx(state, skillDefinition, payload) {
  return { state, player: state.players.s, skill: skillDefinition, definitions, payload, openDecision() {} };
}

function store(state, instanceId) {
  return useShishigouNecromancy(ctx(state, skill(SHISHIGOU_CRAFTER_ID), { abilityId: SHISHIGOU_STORE_ABILITY, targetInstanceId: instanceId }));
}

test("Shishigou package is 4/4 FULL with one dedicated necromancy handler", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.shishigou");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => candidate.handlerId === SHISHIGOU_HANDLER));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  for (const candidate of skills) {
    assert.deepEqual(candidate.rules?.ambiguities ?? [], []);
    assert.deepEqual(candidate.rules?.unmodeledClauses ?? [], []);
  }
});

test("Corpse Crafter stores a face-down attack once, then a Strength corpse moves to a battlefield and grants +2 terrain", () => {
  const state = setup("shishigou-strength");
  add(state, "s:corpse", "card.test.str", "attack", "down", false);
  store(state, "s:corpse");
  assert.equal(state.cards["s:corpse"].zone, "removed");
  assert.equal(state.cards["s:corpse"].face, "down");

  state.phase = "action";
  const result = useShishigouNecromancy(ctx(state, skill(SHISHIGOU_CRAFTER_ID), {
    abilityId: SHISHIGOU_USE_ABILITY,
    corpseInstanceId: "s:corpse",
    targetLocationId: "mountain",
  }));
  assert.equal(result.attribute, "力量");
  assert.equal(state.cards["s:corpse"].face, "up");
  assert.equal(state.players.s.locationId, "mountain");
  assert.equal(state.players.s.flags.roundTerrainAdvantageBonus, 2);
  assert.equal(state.players.s.flags.roundTerrainAdvantageBonusLocationId, "mountain");
  assert.throws(() => useShishigouNecromancy(ctx(state, skill(SHISHIGOU_CRAFTER_ID), {
    abilityId: SHISHIGOU_USE_ABILITY, corpseInstanceId: "s:corpse",
  })), /SHISHIGOU_CORPSE_TARGET_INVALID/);
});

test("Agility rite really plays and pays for the physical top card of the deck", () => {
  const state = setup("shishigou-agility");
  add(state, "s:corpse", "card.test.agi", "attack", "down", false);
  add(state, "s:top", "card.test.top", "deck", "up", false);
  store(state, "s:corpse");
  state.phase = "action";
  const result = useShishigouNecromancy(ctx(state, skill(SHISHIGOU_CRAFTER_ID), {
    abilityId: SHISHIGOU_USE_ABILITY, corpseInstanceId: "s:corpse",
  }));
  assert.equal(result.attribute, "迅捷");
  assert.equal(result.result.instanceId, "s:top");
  assert.equal(result.result.paidMana, 2);
  assert.equal(state.players.s.mana, 8);
  assert.equal(state.cards["s:top"].zone, "attack");
  assert.equal(state.cards["s:top"].active, true);
});

test("Magic rite doubles the current round terrain-advantage multiplier", () => {
  const magic = setup("shishigou-magic");
  add(magic, "s:magic-corpse", "card.test.mag", "attack", "down", false);
  store(magic, "s:magic-corpse");
  magic.phase = "action";
  const result = useShishigouNecromancy(ctx(magic, skill(SHISHIGOU_CRAFTER_ID), {
    abilityId: SHISHIGOU_USE_ABILITY, corpseInstanceId: "s:magic-corpse",
  }));
  assert.equal(result.attribute, "魔术");
  assert.equal(magic.players.s.flags.deploymentAdvantageMultiplier, 2);
  assert.equal(magic.players.s.flags.deploymentAdvantageMultiplierRound, magic.round);
});

test("Macabre Mastery charges 3 mana per basic card and each physical basic can activate its granted rite once per round", () => {
  const state = setup("shishigou-mastery");
  state.phase = "action";
  state.players.s.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["s", "o"];
  add(state, "s:str", "card.test.str", "attack", "up", true);
  add(state, "s:mag", "card.test.mag", "attack", "up", true);

  const strength = useShishigouNecromancy(ctx(state, skill(SHISHIGOU_MASTERY_ID), {
    abilityId: SHISHIGOU_MASTERY_ABILITY, sourceInstanceId: "s:str",
  }));
  assert.equal(strength.attribute, "力量");
  assert.equal(state.players.s.mana, 7);
  assert.equal(state.players.s.flags.roundTerrainAdvantageBonus, 2);
  assert.throws(() => useShishigouNecromancy(ctx(state, skill(SHISHIGOU_MASTERY_ID), {
    abilityId: SHISHIGOU_MASTERY_ABILITY, sourceInstanceId: "s:str",
  })), /SHISHIGOU_MASTERY_SOURCE_ALREADY_USED/);

  const magic = useShishigouNecromancy(ctx(state, skill(SHISHIGOU_MASTERY_ID), {
    abilityId: SHISHIGOU_MASTERY_ABILITY, sourceInstanceId: "s:mag",
  }));
  assert.equal(magic.attribute, "魔术");
  assert.equal(state.players.s.mana, 4);
  assert.equal(state.players.s.flags.deploymentAdvantageMultiplier, 2);
});

test("Hydra Poison applies a structured round base-power multiplier to exactly one active Strength/Agility attack", () => {
  const state = setup("shishigou-hydra");
  add(state, "s:corpse", "card.test.spc", "attack", "down", false);
  store(state, "s:corpse");
  state.phase = "action";
  state.players.s.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["s", "o"];
  add(state, "s:target", "card.test.str", "attack", "up", true);
  useShishigouNecromancy(ctx(state, skill(SHISHIGOU_CRAFTER_ID), {
    abilityId: SHISHIGOU_USE_ABILITY, corpseInstanceId: "s:corpse", targetInstanceId: "s:target",
  }));
  assert.equal(calculateCombatCardBasePower(state, state.players.s, "s:target", definitions), 8);
});
