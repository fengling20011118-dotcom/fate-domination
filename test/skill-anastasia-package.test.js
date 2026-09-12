import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { CardAbilityRegistry } from "../src/rules-core/card-abilities.ts";
import { triggerStructuredCardPlayEffects } from "../src/rules-core/card-play.ts";
import { calculateCombatCardPower, calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { isCardTextSuppressed } from "../src/rules-core/card-text.ts";
import { runWithOtherPlayerAbilityImmunity } from "../src/rules-core/ability-immunity.ts";
import {
  ANASTASIA_CASTER_CLASS_ID,
  ANASTASIA_KREMLIN_ID,
  ANASTASIA_VIY_ID,
  useAnastasiaSumerkiKremlin,
  useAnastasiaViy,
} from "../src/rules-core/anastasia.ts";

const built = buildStandardContent(legacyContent);
new StandardMatchEngine(built);
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  "card.test.special": { id: "card.test.special", name: "Special", cardType: "attack", cost: 1, basePower: 5, typeLabel: "特殊", attributes: ["特殊"], cardAbilityIds: ["test-special-ability"], playPowerBonus: 3 },
  "card.test.special-skill": { id: "card.test.special-skill", name: "Special Skill", cardType: "skill", cost: 1, basePower: 5, typeLabel: "特殊", attributes: ["特殊"], isSkill: true, ownerType: "servant", ownerDefinitionId: "servant.other" },
  "card.test.hybrid": { id: "card.test.hybrid", name: "Hybrid", cardType: "attack", cost: 1, basePower: 5, typeLabel: "力量/特殊/宝具", attributes: ["力量", "特殊", "宝具"] },
  "card.test.strength": { id: "card.test.strength", name: "Strength", cardType: "attack", cost: 1, basePower: 5, typeLabel: "力量", attributes: ["力量"] },
  "card.test.magic": { id: "card.test.magic", name: "Magic", cardType: "attack", cost: 1, basePower: 5, typeLabel: "魔术", attributes: ["魔术"] },
  "card.test.opponent-skill": { id: "card.test.opponent-skill", name: "Opponent Skill", cardType: "skill", cost: 0, basePower: 0, typeLabel: "特殊", attributes: ["特殊"], isSkill: true, ownerType: "servant", ownerDefinitionId: "servant.other" },
};

function makeState(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "a", name: "Anastasia" }, { id: "o", name: "Opponent" }], seed: 1797 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.players.a.servantId = "servant.anastasia";
  state.players.o.servantId = "servant.other";
  putAt(state, "a", "mountain");
  putAt(state, "o", "mountain");
  return state;
}

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function addSkill(state, skillId, instanceId, zone = "servant-skills", active = false) {
  createOwnedCardInstance(state, "a", { instanceId, definitionId: skillId, zone, face: "up", active });
}

function addAttack(state, playerId, instanceId, definitionId, zone = "attack", active = true) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face: zone === "hand" ? "down" : "up", active: zone === "hand" ? false : active });
}

test("Anastasia package is 3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.anastasia");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
});

test("Absolute Freeze suppresses only active non-skill Special attacks at Anastasia's location and releases them after the fight", () => {
  const state = makeState("anastasia-freeze");
  addSkill(state, ANASTASIA_KREMLIN_ID, "kremlin");
  addSkill(state, ANASTASIA_CASTER_CLASS_ID, "caster", "attack", true);
  addAttack(state, "o", "special", "card.test.special");
  addAttack(state, "o", "special-skill", "card.test.special-skill");
  addAttack(state, "o", "special-hand", "card.test.special", "hand", false);

  useAnastasiaSumerkiKremlin({ state, player: state.players.a, skill: built.skills.get(ANASTASIA_KREMLIN_ID), definitions, payload: { eventType: "card.entered-attack" } });
  assert.equal(isCardTextSuppressed(state, state.cards.special, definitions), true);
  assert.equal(isCardTextSuppressed(state, state.cards["special-skill"], definitions), false);
  assert.equal(isCardTextSuppressed(state, state.cards["special-hand"], definitions), false);

  const registry = new CardAbilityRegistry();
  registry.register("test-special-ability", () => { state.players.o.victoryPoints += 1; });
  assert.throws(() => registry.execute("test-special-ability", { state, playerId: "o", instanceId: "special", definitions }), /CARD_TEXT_SUPPRESSED/);

  // The continuous modifier also catches a newly-entered attack before a passive marker sync.
  addAttack(state, "o", "late-special", "card.test.special");
  assert.deepEqual(triggerStructuredCardPlayEffects(state, "late-special", definitions), { powerBonus: 0 });

  putAt(state, "o", "city");
  useAnastasiaSumerkiKremlin({ state, player: state.players.a, skill: built.skills.get(ANASTASIA_KREMLIN_ID), definitions, payload: { eventType: "player.entered-location" } });
  assert.equal(isCardTextSuppressed(state, state.cards.special, definitions), false);

  putAt(state, "o", "mountain");
  useAnastasiaSumerkiKremlin({ state, player: state.players.a, skill: built.skills.get(ANASTASIA_KREMLIN_ID), definitions, payload: { eventType: "player.entered-location" } });
  assert.equal(isCardTextSuppressed(state, state.cards.special, definitions), true);
  useAnastasiaSumerkiKremlin({ state, player: state.players.a, skill: built.skills.get(ANASTASIA_KREMLIN_ID), definitions, payload: { eventType: "combat.ending" } });
  assert.equal(isCardTextSuppressed(state, state.cards.special, definitions), false);
});

test("Sumerki Kremlin Combat keeps only Special and Noble Phantasm types on opponent attacks in the fight", () => {
  const state = makeState("anastasia-kremlin-combat");
  addSkill(state, ANASTASIA_KREMLIN_ID, "kremlin", "attack", true);
  addAttack(state, "o", "hybrid", "card.test.hybrid");
  addAttack(state, "o", "strength", "card.test.strength");
  addAttack(state, "o", "hybrid-hand", "card.test.hybrid", "hand", false);

  useAnastasiaSumerkiKremlin({ state, player: state.players.a, skill: built.skills.get(ANASTASIA_KREMLIN_ID), definitions, payload: { abilityId: "kremlin-combat" } });
  assert.deepEqual(getCardInstanceAttributes(state.cards.hybrid, definitions["card.test.hybrid"], state, definitions), ["特殊", "宝具"]);
  assert.deepEqual(getCardInstanceAttributes(state.cards.strength, definitions["card.test.strength"], state, definitions), []);
  assert.deepEqual(getCardInstanceAttributes(state.cards["hybrid-hand"], definitions["card.test.hybrid"], state, definitions), ["力量", "特殊", "宝具"]);

  putAt(state, "o", "city");
  assert.deepEqual(getCardInstanceAttributes(state.cards.hybrid, definitions["card.test.hybrid"], state, definitions), ["力量", "特殊", "宝具"]);
});

test("Viy zeros opponent Special attacks and blocks only other-player reductions to Anastasia Magic/total power", () => {
  const state = makeState("anastasia-viy");
  addSkill(state, ANASTASIA_VIY_ID, "viy", "attack", true);
  addAttack(state, "o", "special", "card.test.special");
  addAttack(state, "a", "magic", "card.test.magic");
  addAttack(state, "a", "strength", "card.test.strength");

  useAnastasiaViy({ state, player: state.players.a, skill: built.skills.get(ANASTASIA_VIY_ID), definitions, payload: { abilityId: "viy-eyes" } });
  assert.equal(calculateCombatCardPower(state, state.players.o, "special", definitions, "mountain"), 0);

  state.activeRuleModifiers.push({
    id: "opponent-magic-reduction",
    sourceId: "card.test.opponent-skill",
    controllerPlayerId: "o",
    operation: "subtract",
    rule: "card_power",
    scope: { subject: "opponents", cards: { attributesAny: ["魔术"] } },
    value: 2,
    duration: "round",
    createdRound: state.round,
  });
  state.cards.magic.powerModifiers = [
    { id: "other-minus", sourceId: "card.test.opponent-skill", kind: "add", value: -2, duration: "round" },
    { id: "self-minus", sourceId: ANASTASIA_VIY_ID, kind: "add", value: -1, duration: "round" },
  ];
  // Opponent -2 structured and -2 physical modifiers are ignored; Anastasia's own -1 remains.
  assert.equal(calculateCombatCardPower(state, state.players.a, "magic", definitions, "mountain"), 4);

  state.players.a.flags.roundPowerBonus = 2;
  const before = calculateCombatPower(state, state.players.a, definitions, "mountain");
  runWithOtherPlayerAbilityImmunity(state, "o", () => {
    state.players.a.flags.roundPowerBonus = -5;
    state.players.a.flags.commandSealRoundPowerBonus = -3;
  }, "card.test.opponent-skill");
  assert.equal(state.players.a.flags.roundPowerBonus, 2);
  assert.equal(state.players.a.flags.commandSealRoundPowerBonus, undefined);
  assert.equal(calculateCombatPower(state, state.players.a, definitions, "mountain"), before);
});
