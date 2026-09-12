import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, movePlayerCard, removePhysicalCardFromGame } from "../src/rules-core/decks.ts";
import { gainCommandSeals, loseCommandSeals, payCommandSealCost } from "../src/rules-core/command-seals.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  GOETIA_BARBATOS_ABILITY,
  GOETIA_COLLECTIVE_ID,
  GOETIA_DEMON_GODS_ID,
  GOETIA_FLAUROS_ABILITY,
  GOETIA_FORNEUS_ABILITY,
  GOETIA_HANDLER,
  GOETIA_PHENEX_ABILITY,
  GOETIA_RAUM_ABILITY,
  GOETIA_TEMPLE_DRAW_ABILITY,
  GOETIA_TEMPLE_ID,
  isGoetiaDemonGodsLegal,
  resolveGoetiaDecision,
  useGoetiaDemonGods,
} from "../src/rules-core/goetia.ts";
import {
  GOETIA_BARBATOS_ID,
  GOETIA_DEMON_GOD_IDS,
  GOETIA_FORNEUS_ID,
  GOETIA_PHENEX_ID,
  GOETIA_RAUM_ID,
  GOETIA_ZEPAR_ID,
} from "../src/content/goetia-cards.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const fillerDefinitionIds = Object.values(built.cards)
  .filter((definition) => definition.cardType === "attack" && !GOETIA_DEMON_GOD_IDS.includes(definition.id))
  .slice(0, 6)
  .map((definition) => definition.id);

function setup(id = "goetia") {
  const state = createGameState({
    gameInstanceId: id,
    players: [
      { id: "g", name: "Goetia" },
      { id: "o", name: "Opponent" },
    ],
    seed: 1607,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "g";
  state.turnOrder = ["g", "o"];
  state.players.g.masterId = "master.goetia";
  state.players.g.locationId = "workshop";
  state.players.o.locationId = "mountain";
  state.board.locations.workshop = ["g"];
  state.board.locations.mountain = ["o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return state;
}

function ctx(state, skillId, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.g,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extra,
  };
}

function startCollective(state) {
  return useGoetiaDemonGods(ctx(state, GOETIA_COLLECTIVE_ID, { eventType: "game.started", event: {} }));
}

function demon(state, definitionId) {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === "g" && card.definitionId === definitionId);
}

function resolve(state, previous, selections, extra = {}) {
  return resolveGoetiaDecision(ctx(state, GOETIA_DEMON_GODS_ID, {
    previous,
    decision: { status: "resolved", selections },
  }, extra));
}

test("Demon God Goetia package is 3/3 FULL, registered, and ships seven physical Demon Gods", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.goetia");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => skill.handlerId === GOETIA_HANDLER));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(GOETIA_DEMON_GOD_IDS.length, 7);
  for (const definitionId of GOETIA_DEMON_GOD_IDS) assert.ok(built.cards[definitionId]);
});

test("Collective Consciousness puts all seven Demon Gods into play and Barbatos substitutes Command Seals with 4 mana", () => {
  const state = setup("goetia-collective");
  state.players.g.commandSeals = 3;
  state.players.g.mana = 8;
  const result = startCollective(state);
  assert.equal(state.players.g.commandSeals, 0);
  assert.equal(state.players.g.flags.commandSealMaximum, 0);
  assert.equal(result.createdInstanceIds.length, 7);
  assert.equal(GOETIA_DEMON_GOD_IDS.filter((definitionId) => {
    const card = demon(state, definitionId);
    return card?.zone === "attack" && card.active && card.face === "up" && card.residual;
  }).length, 7);

  const beforeGain = state.players.g.mana;
  assert.deepEqual(gainCommandSeals(state, "g", 1), { gainedSeals: 0, gainedMana: 4 });
  assert.equal(state.players.g.mana, beforeGain + 4);
  const beforeLoss = state.players.g.mana;
  assert.equal(loseCommandSeals(state, "g", 1), 0);
  assert.equal(state.players.g.mana, beforeLoss - 4);
  const beforePay = state.players.g.mana;
  assert.deepEqual(payCommandSealCost(state, "g", 1), { paidSeals: 0, substitutionCredits: 0 });
  assert.equal(state.players.g.mana, beforePay - 4);

  const barbatos = demon(state, GOETIA_BARBATOS_ID);
  useGoetiaDemonGods(ctx(state, GOETIA_DEMON_GODS_ID, { abilityId: GOETIA_BARBATOS_ABILITY }));
  assert.equal(barbatos.zone, "deck");
  const afterShuffle = state.players.g.mana;
  assert.deepEqual(gainCommandSeals(state, "g", 1), { gainedSeals: 0, gainedMana: 0 });
  assert.equal(state.players.g.mana, afterShuffle);
});

test("Phenex removes another active Demon God and gains 6 mana", () => {
  const state = setup("goetia-phenex");
  startCollective(state);
  const phenex = demon(state, GOETIA_PHENEX_ID);
  const forneus = demon(state, GOETIA_FORNEUS_ID);
  for (const definitionId of GOETIA_DEMON_GOD_IDS) {
    if (definitionId === GOETIA_PHENEX_ID || definitionId === GOETIA_FORNEUS_ID) continue;
    removePhysicalCardFromGame(state, demon(state, definitionId).instanceId);
  }
  state.players.g.mana = 0;
  const result = useGoetiaDemonGods(ctx(state, GOETIA_DEMON_GODS_ID, { abilityId: GOETIA_PHENEX_ABILITY }));
  assert.equal(phenex.zone, "attack");
  assert.equal(forneus.zone, "removed");
  assert.equal(result.removedInstanceId, forneus.instanceId);
  assert.equal(state.players.g.mana, 6);
});

test("Zepar loss choice gains 2 VP and suppresses the same round's mandatory Demon God removal", () => {
  const state = setup("goetia-zepar");
  startCollective(state);
  state.players.g.victoryPoints = 1;
  let opened;
  useGoetiaDemonGods(ctx(state, GOETIA_DEMON_GODS_ID, {
    eventType: "combat.resolved",
    event: { participantIds: ["g", "o"], winnerIds: ["o"] },
  }, { openDecision(value) { opened = value; } }));
  assert.ok(opened.options.some((option) => option.id === "shuffle"));
  const frame = state.effectQueue.shift();
  const result = resolve(state, frame.payload, ["shuffle"]);
  assert.equal(result.victoryPointsGained, 2);
  assert.equal(state.players.g.victoryPoints, 3);
  assert.equal(demon(state, GOETIA_ZEPAR_ID).zone, "deck");
  assert.equal(state.players.g.flags.goetiaSkipDemonRemovalRound, state.round);
  const roundEnd = useGoetiaDemonGods(ctx(state, GOETIA_COLLECTIVE_ID, { eventType: "round.ending", event: {} }));
  assert.deepEqual(roundEnd, { skipped: true, reason: "demon-effect" });
});

test("Raum Action discards Raum from play and moves Goetia to any location", () => {
  const state = setup("goetia-raum");
  startCollective(state);
  let opened;
  useGoetiaDemonGods(ctx(state, GOETIA_DEMON_GODS_ID, { abilityId: GOETIA_RAUM_ABILITY }, {
    openDecision(value) { opened = value; },
  }));
  assert.ok(opened.options.some((option) => option.id === "city"));
  const frame = state.effectQueue.shift();
  const result = resolve(state, frame.payload, ["city"]);
  assert.equal(result.locationId, "city");
  assert.equal(state.players.g.locationId, "city");
  assert.equal(demon(state, GOETIA_RAUM_ID).zone, "discard");
});

test("Forneus Combat closes one attack, plays and pays for a hand card, and grants its Action access in Combat", () => {
  const state = setup("goetia-forneus");
  startCollective(state);
  state.phase = "combat";
  state.players.g.mana = 99;
  const closeDefinitionId = fillerDefinitionIds[0];
  const playDefinitionId = fillerDefinitionIds[1];
  createOwnedCardInstance(state, "g", { instanceId: "g:close", definitionId: closeDefinitionId, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "g", { instanceId: "g:play", definitionId: playDefinitionId, zone: "hand", face: "down" });
  let opened;
  useGoetiaDemonGods(ctx(state, GOETIA_DEMON_GODS_ID, { abilityId: GOETIA_FORNEUS_ABILITY }, {
    openDecision(value) { opened = value; },
  }));
  assert.ok(opened.options.some((option) => option.id === "g:close"));
  const closeFrame = state.effectQueue.shift();
  const closeResult = resolve(state, closeFrame.payload, ["g:close"], { openDecision(value) { opened = value; } });
  assert.equal(closeResult.closedInstanceId, "g:close");
  assert.equal(demon(state, GOETIA_FORNEUS_ID).zone, "deck");
  assert.ok(opened.options.some((option) => option.id === "g:play"));
  const playFrame = state.effectQueue.shift();
  const playResult = resolve(state, playFrame.payload, ["g:play"]);
  assert.equal(playResult.playedInstanceId, "g:play");
  assert.equal(state.cards["g:play"].zone, "attack");
  assert.equal(state.cards["g:play"].active, true);
  assert.ok(state.players.g.cardRuleModifiers.some((modifier) => modifier.targetInstanceIds?.includes("g:play") && modifier.allowActionAbilityInCombat));
});

test("Temple of Time activates permanently, gives mutable Demon Gods +4 on play, and Outpost pays 1 mana before redraw", () => {
  const state = setup("goetia-temple");
  startCollective(state);
  createOwnedCardInstance(state, "g", {
    instanceId: "g:temple",
    definitionId: GOETIA_TEMPLE_ID,
    zone: "master-skills",
    face: "up",
  });
  const activated = useGoetiaDemonGods(ctx(state, GOETIA_TEMPLE_ID, {
    eventType: "skill.unlocked",
    event: { playerId: "g", skillId: GOETIA_TEMPLE_ID },
  }));
  assert.equal(activated.templeInstanceId, "g:temple");
  assert.equal(state.cards["g:temple"].zone, "attack");
  assert.equal(state.cards["g:temple"].active, true);
  assert.equal(state.cards["g:temple"].residual, true);

  const forneus = demon(state, GOETIA_FORNEUS_ID);
  const beforeModifiers = forneus.powerModifiers?.length ?? 0;
  const boost = useGoetiaDemonGods(ctx(state, GOETIA_TEMPLE_ID, {
    eventType: "card.played",
    event: { playerId: "g", instanceId: forneus.instanceId },
  }));
  assert.equal(boost.powerGained, 4);
  assert.equal((forneus.powerModifiers?.length ?? 0), beforeModifiers + 1);
  const phenex = demon(state, GOETIA_PHENEX_ID);
  const immutableBoost = useGoetiaDemonGods(ctx(state, GOETIA_TEMPLE_ID, {
    eventType: "card.played",
    event: { playerId: "g", instanceId: phenex.instanceId },
  }));
  assert.equal(immutableBoost.powerGained, 0);
  assert.equal(phenex.powerModifiers?.length ?? 0, 0);

  state.phase = "outpost";
  state.players.g.mana = 5;
  createOwnedCardInstance(state, "g", { instanceId: "g:hand", definitionId: fillerDefinitionIds[2], zone: "hand", face: "down" });
  for (let i = 0; i < 3; i += 1) {
    createOwnedCardInstance(state, "g", { instanceId: `g:deck:${i}`, definitionId: fillerDefinitionIds[3 + i], zone: "deck", face: "down" });
  }
  assert.equal(isGoetiaDemonGodsLegal(state, "g", built.skills.get(GOETIA_TEMPLE_ID), built.skills.get(GOETIA_TEMPLE_ID).abilities[0], definitions), true);
  const redrawn = useGoetiaDemonGods(ctx(state, GOETIA_TEMPLE_ID, { abilityId: GOETIA_TEMPLE_DRAW_ABILITY }));
  assert.equal(redrawn.manaPaid, 1);
  assert.equal(state.players.g.mana, 4);
  assert.equal(redrawn.discardedInstanceIds.includes("g:hand"), true);
  assert.equal(redrawn.drawnInstanceIds.length, 3);

  movePlayerCard(state, "g", demon(state, GOETIA_RAUM_ID).instanceId, "hand");
  assert.equal(isGoetiaDemonGodsLegal(state, "g", built.skills.get(GOETIA_TEMPLE_ID), built.skills.get(GOETIA_TEMPLE_ID).abilities[0], definitions), false);
});

test("Flauros Outpost shuffles itself and grants +5 total power for the round", () => {
  const state = setup("goetia-flauros");
  startCollective(state);
  state.phase = "outpost";
  const result = useGoetiaDemonGods(ctx(state, GOETIA_DEMON_GODS_ID, { abilityId: GOETIA_FLAUROS_ABILITY }));
  assert.equal(result.totalPowerBonus, 5);
  assert.equal(state.players.g.flags.roundPowerBonus, 5);
});
