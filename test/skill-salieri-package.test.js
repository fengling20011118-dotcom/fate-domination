import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CardAbilityRegistry } from "../src/rules-core/card-abilities.ts";
import { registerBasicCardAbilities } from "../src/rules-core/basic-card-abilities.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import { getPrintedCardBasePower } from "../src/rules-core/card-values.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  SALIERI_HANDLER,
  SALIERI_MISERICORDIA_ID,
  SALIERI_MISERICORDIA_PUBLIC_ABILITY,
  SALIERI_OBLIVION_ID,
  SALIERI_WILDFIRE_GAIN_ABILITY,
  SALIERI_WILDFIRE_ID,
  resolveSalieriDecision,
  useSalieri,
} from "../src/rules-core/salieri.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const cardAbilities = new CardAbilityRegistry();
registerBasicCardAbilities(cardAbilities);

function setup(id = "salieri") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "s", name: "Salieri" }, { id: "o", name: "Opponent" }],
    seed: 17,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "o"];
  state.players.s.servantId = "servant.salieri";
  state.players.s.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["s", "o"];
  state.players.s.mana = 12;
  state.players.o.mana = 12;
  return state;
}

function ctx(state, skillId, payload = {}, extras = {}) {
  return {
    state,
    player: state.players.s,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extras,
  };
}

test("Salieri package is 3/3 FULL with executable card-face/public metadata", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.salieri");
  assert.equal(skills.length, 3);
  assert.equal(skills.filter((skill) => skill.supportLevel === "FULL").length, 3);
  assert.deepEqual(skills.filter((skill) => skill.supportLevel === "PARTIAL"), []);
  for (const skill of skills) assert.equal(skill.handlerId, SALIERI_HANDLER);
  assert.deepEqual(definitions[SALIERI_MISERICORDIA_ID].cardAbilityIds, [SALIERI_MISERICORDIA_PUBLIC_ABILITY]);
  assert.deepEqual(definitions[SALIERI_MISERICORDIA_ID].phases, ["action"]);
  assert.ok(definitions[SALIERI_MISERICORDIA_ID].tags.includes("shared-public-ability"));
});

test("Misericordia public Action is independently usable by a lower-VP player and closes when Salieri reaches tied first", () => {
  const state = setup("salieri-misericordia");
  state.players.s.victoryPoints = 6;
  state.players.o.victoryPoints = 3;
  const source = createOwnedCardInstance(state, "s", {
    instanceId: "s:misericordia",
    definitionId: SALIERI_MISERICORDIA_ID,
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
  });
  state.activePlayerId = "o";
  cardAbilities.execute(SALIERI_MISERICORDIA_PUBLIC_ABILITY, {
    state,
    playerId: "o",
    instanceId: source.instanceId,
    definitions,
  });
  assert.equal(state.players.o.victoryPoints, 4);
  assert.equal(state.players.o.flags.roundPowerBonus, 2);
  assert.throws(() => cardAbilities.execute(SALIERI_MISERICORDIA_PUBLIC_ABILITY, {
    state,
    playerId: "o",
    instanceId: source.instanceId,
    definitions,
  }), /CARD_ABILITY_LIMIT_REACHED/);

  state.players.s.victoryPoints = 6;
  state.players.o.victoryPoints = 6;
  const closed = useSalieri(ctx(state, SALIERI_MISERICORDIA_ID, {
    eventType: "player.victory-points.changed",
    event: { playerId: "o", delta: 2, sourceId: "card.ability.use" },
  }));
  assert.equal(closed.closed, true);
  assert.equal(source.active, false);
  assert.equal(source.zone, "servant-skills");
});

test("Wildfire uses ceil(mana/2)+2 capped at 10, chooses 8..12 mana at Outpost, and burns all finite mana for half VP loss", () => {
  const state = setup("salieri-wildfire");
  state.players.s.mana = 7;
  assert.equal(getPrintedCardBasePower(state, state.players.s, definitions[SALIERI_WILDFIRE_ID]), 6);
  state.players.s.mana = 20;
  assert.equal(getPrintedCardBasePower(state, state.players.s, definitions[SALIERI_WILDFIRE_ID]), 10);

  state.players.s.mana = 0;
  state.players.s.victoryPoints = 10;
  state.phase = "outpost";
  state.activePlayerId = "s";
  let opened;
  built.skills.execute(state, "s", SALIERI_WILDFIRE_ID, { abilityId: SALIERI_WILDFIRE_GAIN_ABILITY }, (decision) => { opened = decision; }, () => 0, definitions);
  assert.equal(opened.kind, "salieri-wildfire-mana");
  assert.deepEqual(opened.options.map((option) => option.id), ["mana-8", "mana-9", "mana-10", "mana-11", "mana-12"]);
  const frame = state.effectQueue[0];
  const gain = resolveSalieriDecision(ctx(state, SALIERI_WILDFIRE_ID, {
    previous: frame.payload,
    decision: { status: "resolved", selections: ["mana-11"] },
  }));
  assert.equal(gain.requested, 11);
  assert.equal(state.players.s.mana, 11);

  const cleanup = useSalieri(ctx(state, SALIERI_WILDFIRE_ID, { eventType: "combat.ending", event: {} }));
  assert.equal(cleanup.manaLost, 11);
  assert.equal(cleanup.victoryPointsLost, 6);
  assert.equal(state.players.s.mana, 0);
  assert.equal(state.players.s.victoryPoints, 4);
});

test("Wildfire infinite mana loses zero mana and zero VP at combat end", () => {
  const state = setup("salieri-wildfire-infinite");
  state.players.s.flags.infiniteMana = true;
  state.players.s.mana = 12;
  state.players.s.victoryPoints = 8;
  const result = useSalieri(ctx(state, SALIERI_WILDFIRE_ID, { eventType: "combat.ending", event: {} }));
  assert.deepEqual(result, { manaLost: 0, victoryPointsLost: 0 });
  assert.equal(state.players.s.victoryPoints, 8);
});

test("Oblivion Correction ignores ordinary combat VP but can double-pay an ability response card and draw one", () => {
  const state = setup("salieri-oblivion");
  state.phase = "combat";
  state.activePlayerId = "o";
  state.players.s.mana = 12;
  const hand = createOwnedCardInstance(state, "s", {
    instanceId: "s:response",
    definitionId: "card.carda1",
    zone: "hand",
    face: "down",
    active: false,
  });
  createOwnedCardInstance(state, "s", {
    instanceId: "s:draw",
    definitionId: "card.cardb1",
    zone: "deck",
    face: "down",
    active: false,
  });
  let opened = null;
  const ordinary = useSalieri(ctx(state, SALIERI_OBLIVION_ID, {
    eventType: "player.victory-points.changed",
    event: { playerId: "o", delta: 2, sourceId: "combat.resolve" },
  }, { openDecision(decision) { opened = decision; } }));
  assert.equal(ordinary, undefined);
  assert.equal(opened, null);

  const trigger = useSalieri(ctx(state, SALIERI_OBLIVION_ID, {
    eventType: "player.victory-points.changed",
    event: { playerId: "o", delta: 1, sourceId: "card.ability.use" },
  }, { openDecision(decision) { opened = decision; } }));
  assert.equal(trigger.pending, true);
  assert.equal(opened.kind, "salieri-oblivion-correction");
  assert.ok(opened.options.some((option) => option.id === hand.instanceId));
  const frame = state.effectQueue[0];
  const normalCost = getCardPlayCost(state, definitions[hand.definitionId], state.players.s, hand, definitions);
  const manaBefore = state.players.s.mana;
  const emitted = [];
  const result = resolveSalieriDecision(ctx(state, SALIERI_OBLIVION_ID, {
    previous: frame.payload,
    decision: { status: "resolved", selections: [hand.instanceId] },
  }, { emitEvent(type, payload) { emitted.push({ type, payload }); } }));
  assert.equal(result.played, true);
  assert.equal(result.paidMana, normalCost * 2);
  assert.equal(state.players.s.mana, manaBefore - normalCost * 2);
  assert.equal(hand.zone, "attack");
  assert.equal(hand.active, true);
  assert.equal(hand.paidCost, normalCost * 2);
  assert.ok(state.players.s.hand.includes("s:draw"));
  assert.ok(emitted.some((event) => event.type === "card.played" && event.payload.method === "salieri-oblivion-correction"));
});

test("Oblivion Correction recognizes Preparation and Command Seal VP gained during combat settlement", () => {
  const state = setup("salieri-oblivion-combat-bonus");
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  const localDefinitions = {
    ...definitions,
    "test.salieri.tie": { id: "test.salieri.tie", name: "tie", cardType: "attack", ownerType: "common", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true },
  };
  createOwnedCardInstance(state, "s", { instanceId: "s:tie", definitionId: "test.salieri.tie", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "o:preparation", definitionId: "card.cardpreparation", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "s", { instanceId: "s:response-combat", definitionId: "card.carda1", zone: "hand", face: "down", active: false });
  state.players.o.flags.commandSealVictoryPointBonusRound = state.round;
  state.players.o.flags.commandSealVictoryPointBonus = 2;
  const combat = resolveCombat(state, "mountain", localDefinitions, {});
  assert.ok(combat.winnerIds.includes("o"));
  assert.equal(combat.abilityVictoryPoints?.o, 4);
  let opened = null;
  const trigger = useSalieri({
    ...ctx(state, SALIERI_OBLIVION_ID, { eventType: "combat.resolved", event: combat }),
    definitions: localDefinitions,
    openDecision(decision) { opened = decision; },
  });
  assert.equal(trigger.pending, true);
  assert.equal(opened.kind, "salieri-oblivion-correction");
  assert.ok(opened.options.some((option) => option.id === "s:response-combat"));
});
