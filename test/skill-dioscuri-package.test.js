import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCardRuleUsageLimitOverride } from "../src/rules-core/card-rule-modifiers.ts";
import {
  assertServantAttackRegularPairAllowed,
  classifyServantAttackDefinition,
} from "../src/rules-core/servant-attack-partitions.ts";
import {
  DIOSCURI_ADAMANT_FISTS_ABILITY,
  DIOSCURI_ANTHEM_ABILITY,
  DIOSCURI_GIFT_ID,
  DIOSCURI_TWIN_ID,
  DIOSCURI_TYNDARIDAE_ID,
  useDioscuriGiftOfMortality,
  useDioscuriTwinDivinity,
  useDioscuriTyndaridae,
} from "../src/rules-core/dioscuri.ts";

function setup(id = "dioscuri-package") {
  const built = buildStandardContent(legacyContent);
  new StandardMatchEngine(built);
  const definitions = {
    ...built.cards,
    ...built.skills.asCardDefinitions(),
    "card.test.foreign": { id: "card.test.foreign", name: "Foreign", cardType: "attack", cost: 0, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: false },
  };
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "p", name: "Dioscuri" }, { id: "q", name: "Opponent" }],
    seed: 9917,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "p";
  state.turnOrder = ["p", "q"];
  state.players.p.servantId = "servant.dioscuri";
  state.players.p.locationId = "mountain";
  state.players.q.locationId = "mountain";
  state.players.p.mana = 30;
  state.players.q.mana = 30;
  state.board.locations.mountain = ["p", "q"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, state };
}

function add(state, playerId, instanceId, definitionId, zone = "hand", face = "down", active = false, originServantId) {
  createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face,
    active,
    ...(originServantId ? { originServantId } : {}),
  });
}

function skill(built, id) {
  return built.skills.list().find((candidate) => candidate.id === id);
}

function installTwin({ built, definitions, state }) {
  add(state, "p", "twin", DIOSCURI_TWIN_ID, "servant-skills", "down", false, "servant.dioscuri");
  useDioscuriTwinDivinity({ state, player: state.players.p, skill: skill(built, DIOSCURI_TWIN_ID), payload: { eventType: "game.started" }, definitions });
}

test("Dioscuri package is 3/3 FULL with concrete handlers", () => {
  const { built } = setup("dioscuri-full");
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "servant.dioscuri");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.unmodeledClauses ?? []), []);
});

test("Twin Divinity constrains only ordinary pairs where both cards are Dioscuri cards", () => {
  const ctx = setup("dioscuri-pair");
  const { state, definitions } = ctx;
  add(state, "p", "str-a", "card.cardb1", "hand", "down", false, "servant.dioscuri");
  add(state, "p", "str-b", "card.cardb2", "hand", "down", false, "servant.dioscuri");
  add(state, "p", "agi", "card.cardq1", "hand", "down", false, "servant.dioscuri");
  add(state, "p", "avenger", "card.x-avenger", "hand", "down", false, "servant.dioscuri");
  add(state, "p", "foreign", "card.test.foreign", "hand");
  installTwin(ctx);

  assert.equal(classifyServantAttackDefinition(state, state.players.p, "card.cardb1", definitions), "first");
  assert.equal(classifyServantAttackDefinition(state, state.players.p, "card.cardq1", definitions), "second");
  assert.equal(classifyServantAttackDefinition(state, state.players.p, "card.x-avenger", definitions), "second");
  assert.equal(classifyServantAttackDefinition(state, state.players.p, "card.test.foreign", definitions), null);
  assert.throws(() => assertServantAttackRegularPairAllowed(state, state.players.p, ["str-a", "str-b"], definitions), /SERVANT_ATTACK_PARTITION_PAIR_INVALID/);
  assert.doesNotThrow(() => assertServantAttackRegularPairAllowed(state, state.players.p, ["str-a", "agi"], definitions));
  assert.doesNotThrow(() => assertServantAttackRegularPairAllowed(state, state.players.p, ["str-a", "foreign"], definitions));
});

test("Twin Divinity doubles Avenger Class power alteration and Avenger closes after defeating another player", () => {
  const ctx = setup("dioscuri-avenger");
  const { built, state, definitions } = ctx;
  add(state, "p", "strength", "card.cardb1", "attack", "up", true, "servant.dioscuri");
  add(state, "p", "avenger", "card.x-avenger", "attack", "up", true, "servant.dioscuri");
  state.cards.avenger.residual = definitions["card.x-avenger"].residual === true;
  add(state, "q", "weak", "card.cardb1", "attack", "up", true);
  installTwin(ctx);

  state.phase = "combat";
  assert.equal(calculateCombatCardPower(state, state.players.p, "strength", definitions, "mountain"), 4);
  assert.equal(state.cards.avenger.residual, true);
  const result = resolveCombat(state, "mountain", definitions, built.events);
  assert.ok(result.winnerIds.includes("p"));
  assert.ok(result.defeatedPlayerIds.includes("q"));
  assert.equal(state.cards.avenger.zone, "attack");
  assert.equal(state.cards.avenger.face, "down");
  assert.equal(state.cards.avenger.active, false);
});

test("Gift of Mortality grants Once Per Game to Castor basics by definition, including later copies", () => {
  const ctx = setup("dioscuri-gift-limit");
  const { built, state, definitions } = ctx;
  add(state, "p", "agi-original", "card.cardq1", "hand", "down", false, "servant.dioscuri");
  add(state, "p", "str-original", "card.cardb1", "hand", "down", false, "servant.dioscuri");
  add(state, "p", "agi-copy", "card.cardq1", "hand");
  add(state, "p", "gift", DIOSCURI_GIFT_ID, "servant-skills", "down", false, "servant.dioscuri");
  installTwin(ctx);
  useDioscuriGiftOfMortality({ state, player: state.players.p, skill: skill(built, DIOSCURI_GIFT_ID), payload: { eventType: "game.started" }, definitions });

  assert.equal(getCardRuleUsageLimitOverride(state, state.players.p, state.cards["agi-original"]), "once-per-game");
  assert.equal(getCardRuleUsageLimitOverride(state, state.players.p, state.cards["agi-copy"]), "once-per-game");
  assert.equal(getCardRuleUsageLimitOverride(state, state.players.p, state.cards["str-original"]), undefined);
});

test("Dioscures Tyndaridae boosts are doubled by Twin Divinity", () => {
  const ctx = setup("dioscuri-tyndaridae");
  const { built, state, definitions } = ctx;
  add(state, "p", "pollux-discard", "card.cardb2", "hand", "down", false, "servant.dioscuri");
  add(state, "p", "pollux-active", "card.cardb1", "attack", "up", true, "servant.dioscuri");
  add(state, "p", "castor-active", "card.cardq1", "attack", "up", true, "servant.dioscuri");
  add(state, "p", "np", DIOSCURI_TYNDARIDAE_ID, "attack", "up", true, "servant.dioscuri");
  installTwin(ctx);

  useDioscuriTyndaridae({
    state,
    player: state.players.p,
    skill: skill(built, DIOSCURI_TYNDARIDAE_ID),
    payload: { abilityId: DIOSCURI_ADAMANT_FISTS_ABILITY, discardInstanceId: "pollux-discard" },
    definitions,
  });
  assert.equal(state.cards["pollux-discard"].zone, "discard");
  assert.equal(calculateCombatCardPower(state, state.players.p, "pollux-active", definitions, "mountain"), 4);

  state.phase = "combat";
  state.activePlayerId = "p";
  useDioscuriTyndaridae({
    state,
    player: state.players.p,
    skill: skill(built, DIOSCURI_TYNDARIDAE_ID),
    payload: { abilityId: DIOSCURI_ANTHEM_ABILITY },
    definitions,
  });
  assert.equal(calculateCombatCardPower(state, state.players.p, "castor-active", definitions, "mountain"), 6);
});
