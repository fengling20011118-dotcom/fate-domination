import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CardAbilityRegistry } from "../src/rules-core/card-abilities.ts";
import { calculateCombatCardBasePower, calculateCombatCardPower, calculateCombatPower, calculateTerrainAdvantage } from "../src/rules-core/combat-power.ts";
import { calculateCombatSnapshot } from "../src/rules-core/combat.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { playerIgnoresDefeat } from "../src/rules-core/defeat.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";
import { registerCoreSkillHandlers, useOpponentAttackPowerModifier } from "../src/rules-core/skill-handlers.ts";
import {
  MASH_GUARD_ABILITY,
  MASH_GUARD_DEFINITION_ID,
  MASH_LORD_CAMELOT_ID,
  MASH_ORTENAUS_ID,
  registerMashCardAbilities,
  useMashLordCamelot,
  useMashOrtenaus,
} from "../src/rules-core/mash.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const attack2 = { id: "card.test.mash-p2", name: "P2", cardType: "attack", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true };
const attack8 = { id: "card.test.mash-p8", name: "P8", cardType: "attack", cost: 0, basePower: 8, typeLabel: "力量", attributes: ["力量"], basic: true };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [attack2.id]: attack2, [attack8.id]: attack8 };

function state(id, phase = "action") {
  const s = createGameState({ gameInstanceId: id, players: [{ id: "m", name: "Mash" }, { id: "o", name: "Opponent" }, { id: "x", name: "Other" }], seed: 241 });
  s.status = "playing";
  s.round = 5;
  s.phase = phase;
  s.step = "player-window";
  s.activePlayerId = "m";
  s.players.m.servantId = "servant.mash";
  s.players.m.commandSeals = 3;
  s.players.m.mana = 12;
  s.players.m.locationId = "mountain";
  s.players.o.locationId = "mountain";
  s.players.x.locationId = "mountain";
  s.board.locations.workshop = [];
  s.board.locations.mountain = ["m", "o", "x"];
  s.board.locations.city = [];
  s.board.locations.scouting = [];
  return s;
}

function add(s, playerId, id, definitionId, zone = "hand", face, active = false) {
  return createOwnedCardInstance(s, playerId, {
    instanceId: id,
    definitionId,
    zone,
    face: face ?? (zone === "servant-skills" || zone === "master-skills" ? "up" : "down"),
    active,
  });
}

function skillCtx(s, skillId, payload) {
  return { state: s, player: s.players.m, skill: built.skills.get(skillId), payload, definitions, emitEvent: () => {}, openDecision: () => {}, randomInt: () => 0 };
}

test("Mash package is 4/4 FULL while legacy sc-mash-4 is non-materialized", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.mash");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(built.skills.get("servant.mash.skill.sc-mash-4").initiallyOwned, false);
  assert.deepEqual(built.playerDecks["servant.mash"].filter((id) => id === MASH_GUARD_DEFINITION_ID), [MASH_GUARD_DEFINITION_ID, MASH_GUARD_DEFINITION_ID]);
});

test("Lord Camelot gives +2 terrain then doubles it on Mash's battlefield only", () => {
  const s = state("mash-camelot");
  add(s, "m", "camelot", MASH_LORD_CAMELOT_ID, "attack", "up", true);
  s.players.o.flags.deploymentBonusActive = true;
  s.players.o.flags.deploymentLocationId = "mountain";
  s.players.o.flags.deploymentBonus = 1;
  assert.equal(calculateTerrainAdvantage(s, s.players.o, definitions, "mountain"), 1);
  const result = useMashLordCamelot(skillCtx(s, MASH_LORD_CAMELOT_ID, { abilityId: "castle-distant-utopia", targetPlayerId: "o" }));
  assert.equal(result.terrainAdvantageBefore, 1);
  assert.equal(result.terrainAdvantageAfter, 6);
  assert.equal(calculateTerrainAdvantage(s, s.players.o, definitions, "mountain"), 6);
  assert.equal(calculateTerrainAdvantage(s, s.players.o, definitions, "city"), 0);
});

test("Ortenaus at zero Command Seals hides/restores true name and doubles physical Guard base power", () => {
  const s = state("mash-ortenaus");
  const guard = add(s, "m", "guard", MASH_GUARD_DEFINITION_ID, "attack", "up", true);
  s.players.m.trueNameRevealed = true;
  s.players.m.commandSeals = 0;
  const active = useMashOrtenaus(skillCtx(s, MASH_ORTENAUS_ID, { eventType: "player.command-seals.changed", event: { playerId: "m" } }));
  assert.equal(active.active, true);
  assert.equal(s.players.m.trueNameRevealed, false);
  assert.equal(s.players.m.flags.preventTrueNameRevealWhenNoSeals, true);
  assert.equal(calculateCombatCardBasePower(s, s.players.m, guard.instanceId, definitions), 10);
  s.players.m.commandSeals = 1;
  const inactive = useMashOrtenaus(skillCtx(s, MASH_ORTENAUS_ID, { eventType: "player.command-seals.changed", event: { playerId: "m" } }));
  assert.equal(inactive.active, false);
  assert.equal(s.players.m.trueNameRevealed, true);
  assert.equal(calculateCombatCardBasePower(s, s.players.m, guard.instanceId, definitions), 5);
});

test("Ortenaus blocks Lord Camelot and Guard lending while Mash has zero Command Seals", () => {
  const s = state("mash-zero-seal-block");
  add(s, "m", "camelot", MASH_LORD_CAMELOT_ID, "attack", "up", true);
  add(s, "m", "guard", MASH_GUARD_DEFINITION_ID, "attack", "up", true);
  s.players.m.commandSeals = 0;
  useMashOrtenaus(skillCtx(s, MASH_ORTENAUS_ID, {}));
  assert.throws(() => useMashLordCamelot(skillCtx(s, MASH_LORD_CAMELOT_ID, { abilityId: "castle-distant-utopia", targetPlayerId: "o" })), /MASH_CAMELOT_BLOCKED_BY_ORTENAUS/);
  const registry = new CardAbilityRegistry();
  registerMashCardAbilities(registry);
  assert.throws(() => registry.execute(MASH_GUARD_ABILITY, { state: s, playerId: "m", instanceId: "guard", target: "o", definitions }), /MASH_GUARD_BLOCKED_BY_ORTENAUS/);
});

test("lent Guard preserves ownership, excludes its controller from Snowflakes and shares the higher combat power", () => {
  const s = state("mash-guard-link");
  add(s, "m", "guard", MASH_GUARD_DEFINITION_ID, "attack", "up", true);
  add(s, "m", "m8", attack8.id, "attack", "up", true);
  add(s, "o", "o2", attack2.id, "attack", "up", true);
  add(s, "x", "x2", attack2.id, "attack", "up", true);
  add(s, "m", "snow", "servant.mash.skill.sc-mash-2", "attack", "up", true);
  const registry = new CardAbilityRegistry();
  registerMashCardAbilities(registry);
  registry.execute(MASH_GUARD_ABILITY, { state: s, playerId: "m", instanceId: "guard", target: "o", definitions });
  assert.equal(s.cards.guard.ownerPlayerId, "m");
  assert.equal(s.cards.guard.controllerPlayerId, "o");
  assert.ok(!s.players.m.attack.includes("guard"));
  assert.ok(s.players.o.attack.includes("guard"));
  useOpponentAttackPowerModifier(skillCtx(s, "servant.mash.skill.sc-mash-2", { abilityId: "mana-defense" }));
  assert.equal(calculateCombatCardPower(s, s.players.o, "o2", definitions, "mountain"), 2);
  assert.equal(calculateCombatCardPower(s, s.players.x, "x2", definitions, "mountain"), 0);
  const mashRawFloor = calculateCombatPower(s, s.players.m, definitions, "mountain");
  const opponentPower = calculateCombatPower(s, s.players.o, definitions, "mountain");
  assert.equal(opponentPower, mashRawFloor);
  assert.equal(playerIgnoresDefeat(s, s.players.m, definitions), true);
  assert.equal(playerIgnoresDefeat(s, s.players.o, definitions), true);
});

test("lent Guard closes before a combat its owner does not participate in", () => {
  const s = state("mash-guard-owner-absent", "combat");
  add(s, "m", "guard", MASH_GUARD_DEFINITION_ID, "attack", "up", true);
  const registry = new CardAbilityRegistry();
  registerMashCardAbilities(registry);
  s.phase = "action";
  registry.execute(MASH_GUARD_ABILITY, { state: s, playerId: "m", instanceId: "guard", target: "o", definitions });
  s.phase = "combat";
  s.players.m.locationId = "city";
  s.board.locations.mountain = ["o", "x"];
  s.board.locations.city = ["m"];
  calculateCombatSnapshot(s, "mountain", definitions);
  assert.equal(s.cards.guard.controllerPlayerId, "m");
  assert.equal(s.cards.guard.zone, "discard");
  assert.ok(s.players.m.discard.includes("guard"));
});

test("Guard returns to Mash's hand at combat cleanup when Mash lost, including while lent", () => {
  const s = state("mash-guard-return");
  add(s, "m", "guard", MASH_GUARD_DEFINITION_ID, "attack", "up", true);
  const registry = new CardAbilityRegistry();
  registerMashCardAbilities(registry);
  registry.execute(MASH_GUARD_ABILITY, { state: s, playerId: "m", instanceId: "guard", target: "o", definitions });
  s.players.m.flags.combatLossRound = s.round;
  endStandardRound(s, definitions);
  assert.equal(s.cards.guard.controllerPlayerId, "m");
  assert.equal(s.cards.guard.zone, "hand");
  assert.ok(s.players.m.hand.includes("guard"));
  assert.ok(!s.players.o.attack.includes("guard"));
});
