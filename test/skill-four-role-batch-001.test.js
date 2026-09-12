import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { calculateCombatCardPower, getCombatCardAttributes } from "../src/rules-core/combat-power.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { gainVictoryPoints } from "../src/rules-core/resources.ts";
import { addPlayerStatus, STATUS_DISARMED, STATUS_ROMAN } from "../src/rules-core/player-statuses.ts";
import {
  LIONKING_DIVINE_COMMAND_ID,
  LIONKING_DUN_STALLION_ID,
  useLionKingDivineCommand,
} from "../src/rules-core/lionking.ts";
import {
  ROMULUS_MAGNA_ID,
  ROMULUS_MOLES_ID,
  useRomulusMagnaVoluisseMagnum,
  useRomulusMolesNecessrie,
} from "../src/rules-core/romulus.ts";
import {
  CHLOE_KANSHOU_ID,
  CHLOE_PROJECTION_ID,
  isChloeKanshouBakuyaLegal,
  useChloeKanshouBakuya,
  useChloeProjectionMagic,
} from "../src/rules-core/chloe.ts";
import {
  ERESH_BLESSING_ID,
  ERESH_KUR_KIGAL_ID,
  useEreshkigalBlessingOfKur,
  useEreshkigalKurKigalIrkalla,
} from "../src/rules-core/ereshkigal.ts";

const built = buildStandardContent(legacyContent);
const eventCards = Object.fromEntries(built.events.map((event) => [event.id, {
  ...event,
  cardType: "event",
  cost: 0,
  basePower: 0,
  typeLabel: "特殊",
}]));
const definitions = {
  ...built.cards,
  ...eventCards,
  ...built.skills.asCardDefinitions(),
  "card.test.str2": { id: "card.test.str2", name: "Str2", cardType: "attack", cost: 1, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.str3": { id: "card.test.str3", name: "Str3", cardType: "attack", cost: 1, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.str5": { id: "card.test.str5", name: "Str5", cardType: "attack", cost: 0, basePower: 5, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.agi2": { id: "card.test.agi2", name: "Agi2", cardType: "attack", cost: 1, basePower: 2, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
};

function makeState(id, players) {
  const state = createGameState({ gameInstanceId: id, players: players.map((playerId) => ({ id: playerId, name: playerId })), seed: 9001 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = players[0];
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

test("first four-role batch closes all eight targeted skills as FULL", () => {
  for (const id of [
    LIONKING_DIVINE_COMMAND_ID, LIONKING_DUN_STALLION_ID,
    ROMULUS_MOLES_ID, ROMULUS_MAGNA_ID,
    CHLOE_PROJECTION_ID, CHLOE_KANSHOU_ID,
    ERESH_BLESSING_ID, ERESH_KUR_KIGAL_ID,
  ]) {
    assert.equal(built.skills.get(id).supportLevel, "FULL", id);
    assert.ok(built.skills.get(id).handlerId, id);
  }
});

test("Lion King: Luck gains all types only for power calculation and cannot have its power reduced", () => {
  const state = makeState("lion-divine", ["l"]);
  state.players.l.servantId = "servant.lionking";
  putAt(state, "l", "mountain");
  createOwnedCardInstance(state, "l", { instanceId: "luck", definitionId: "card.cardluck", zone: "attack", face: "up", active: true });
  const skill = built.skills.get(LIONKING_DIVINE_COMMAND_ID);
  useLionKingDivineCommand({ state, player: state.players.l, skill, payload: { eventType: "game.started", event: {} } });

  assert.deepEqual(getCardInstanceAttributes(state.cards.luck, definitions["card.cardluck"], state, definitions), ["特殊"]);
  assert.deepEqual(new Set(getCombatCardAttributes(state, state.players.l, "luck", definitions)), new Set(["力量", "迅捷", "魔术", "特殊", "宝具"]));
  state.cards.luck.powerModifiers = [{ id: "penalty", sourceId: "test", kind: "add", value: -10, duration: "round" }];
  assert.equal(calculateCombatCardPower(state, state.players.l, "luck", definitions, "mountain"), 4);
});

test("Lion King: No Price Too Great is one automatic outpost transition effect and blocks VP gain for the round", () => {
  const state = makeState("lion-price", ["l"]);
  const skill = built.skills.get(LIONKING_DIVINE_COMMAND_ID);
  state.phase = "outpost";
  state.players.l.mana = 2;
  state.players.l.victoryPoints = 5;
  useLionKingDivineCommand({ state, player: state.players.l, skill, payload: { eventType: "phase.transitioned", event: { previousPhase: "preparation", transition: "next-phase" } } });
  assert.equal(state.players.l.mana, 3);
  assert.equal(state.players.l.flags.roundPowerBonus, 3);
  assert.equal(state.players.l.flags.victoryPointGainBlocked, true);
  gainVictoryPoints(state.players.l, 4);
  assert.equal(state.players.l.victoryPoints, 5);
});

test("Lion King: Dun Stallion can pay 2 VP instead of its printed mana cost", () => {
  const state = makeState("lion-stallion-cost", ["l"]);
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "l";
  state.players.l.servantId = "servant.lionking";
  state.players.l.mana = 10;
  state.players.l.victoryPoints = 3;
  putAt(state, "l", "mountain");
  createOwnedCardInstance(state, "l", { instanceId: "stallion", definitionId: LIONKING_DUN_STALLION_ID, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "l", { instanceId: "basic", definitionId: "card.test.str2", zone: "hand", face: "down", active: false });
  const result = commitStandardAttack(state, "l", ["stallion", "basic"], [], definitions, {
    cardDataByInstanceId: { stallion: { alternativePayment: "victory-points" } },
  });
  assert.equal(result.paidMana, 1);
  assert.equal(state.players.l.mana, 9);
  assert.equal(state.players.l.victoryPoints, 1);
  assert.equal(state.cards.stallion.paidCost, 0);
  assert.equal(state.cards.stallion.playedLocationId, "mountain");
});

test("Romulus: Moles disarms a non-Roman mover and Pax Romana grants +4 even when Romulus fights alone", () => {
  const state = makeState("romulus-moles", ["r", "o"]);
  state.players.r.servantId = "servant.romulus";
  putAt(state, "r", "mountain");
  putAt(state, "o", "city");
  const skill = built.skills.get(ROMULUS_MOLES_ID);
  useRomulusMolesNecessrie({ state, player: state.players.r, skill, payload: { eventType: "game.started", event: {} } });
  putAt(state, "o", "mountain");
  useRomulusMolesNecessrie({ state, player: state.players.r, skill, payload: { eventType: "player.moved", event: { playerId: "o", previousLocationId: "city", locationId: "mountain" } } });
  assert.ok(state.players.o.statuses.includes(STATUS_DISARMED));
  createOwnedCardInstance(state, "o", { instanceId: "o-basic", definitionId: "card.test.str2", zone: "hand", face: "down", active: false });
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "o", instanceId: "o-basic", definitions, faceDown: false }), /PLAYER_DISARMED/);

  state.board.locations.mountain = ["r"];
  state.players.o.locationId = "city";
  createOwnedCardInstance(state, "r", { instanceId: "moles", definitionId: ROMULUS_MOLES_ID, zone: "attack", face: "up", active: true });
  assert.equal(calculateCombatCardPower(state, state.players.r, "moles", definitions, "mountain"), 9);
});

test("Romulus: Magna makes losers Roman and rewards each Roman winner independently", () => {
  const state = makeState("romulus-magna", ["r", "a", "loser"]);
  state.players.r.servantId = "servant.romulus";
  for (const id of ["r", "a", "loser"]) putAt(state, id, "mountain");
  addPlayerStatus(state.players.a, STATUS_ROMAN);
  createOwnedCardInstance(state, "r", { instanceId: "magna", definitionId: ROMULUS_MAGNA_ID, zone: "attack", face: "up", active: true });
  const skill = built.skills.get(ROMULUS_MAGNA_ID);
  useRomulusMagnaVoluisseMagnum({ state, player: state.players.r, skill, definitions, payload: {
    eventType: "combat.resolved",
    event: { locationId: "mountain", winnerIds: ["r", "a"], powers: { r: 10, a: 10, loser: 2 } },
  } });
  assert.ok(state.players.loser.statuses.includes(STATUS_ROMAN));
  assert.equal(state.players.r.victoryPoints, 1);
  assert.equal(state.players.a.victoryPoints, 1);
});

test("Chloe: Projection Magic counts unique current attack type-sets and awards 2 VP on a win", () => {
  const state = makeState("chloe-projection", ["c"]);
  state.players.c.servantId = "servant.chloe";
  putAt(state, "c", "mountain");
  createOwnedCardInstance(state, "c", { instanceId: "projection", definitionId: CHLOE_PROJECTION_ID, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "c", { instanceId: "s1", definitionId: "card.test.str2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "c", { instanceId: "s2", definitionId: "card.test.str3", zone: "attack", face: "up", active: true });
  const skill = built.skills.get(CHLOE_PROJECTION_ID);
  useChloeProjectionMagic({ state, player: state.players.c, skill, definitions, payload: { abilityId: "ferromantic-coalescence" } });
  // Strength is duplicated, while Projection's Magic type-set is unique: every basic attack gets +1.
  assert.equal(calculateCombatCardPower(state, state.players.c, "s1", definitions, "mountain"), 3);
  useChloeProjectionMagic({ state, player: state.players.c, skill, definitions, payload: {
    eventType: "combat.resolved",
    event: { locationId: "mountain", winnerIds: ["c"], powers: { c: 99 } },
  } });
  assert.equal(state.players.c.victoryPoints, 2);
});

test("Chloe: Kanshou plays on printed-base-power sum 5 and Crane Wings remembers the actual play battlefield", () => {
  const state = makeState("chloe-kanshou", ["c"]);
  state.players.c.servantId = "servant.chloe";
  state.players.c.mana = 10;
  putAt(state, "c", "mountain");
  createOwnedCardInstance(state, "c", { instanceId: "sum5", definitionId: "card.test.str5", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "c", { instanceId: "extra", definitionId: "card.test.agi2", zone: "hand", face: "down", active: false });
  const skill = built.skills.get(CHLOE_KANSHOU_ID);
  const played = useChloeKanshouBakuya({ state, player: state.players.c, skill, definitions, payload: { abilityId: "kanshou-play", instanceId: "extra" } });
  assert.equal(played.cards[0].instanceId, "extra");
  assert.equal(state.cards.extra.playedLocationId, "mountain");

  createOwnedCardInstance(state, "c", { instanceId: "kanshou", definitionId: CHLOE_KANSHOU_ID, zone: "attack", face: "up", active: true });
  state.cards.kanshou.playedRound = state.round;
  state.cards.kanshou.playedLocationId = "workshop";
  state.phase = "combat";
  state.activePlayerId = "c";
  const craneAbility = skill.abilities.find((ability) => ability.id === "triple-linked-crane-wings");
  assert.equal(isChloeKanshouBakuyaLegal(state, "c", skill, craneAbility, definitions), false);
  state.cards.kanshou.playedLocationId = "mountain";
  assert.equal(isChloeKanshouBakuyaLegal(state, "c", skill, craneAbility, definitions), true);
  useChloeKanshouBakuya({ state, player: state.players.c, skill, definitions, payload: { abilityId: "triple-linked-crane-wings" } });
  assert.equal(state.cards.kanshou.active, false);
  assert.deepEqual(state.modeState.pendingRoundAttackJoins, [{ targetRound: 5, playerId: "c", instanceId: "kanshou", sourceId: CHLOE_KANSHOU_ID }]);
});

test("Ereshkigal: Blessing reverses structured situation/event power, can exempt Eresh, gains mana on deployment, and returns after combat", () => {
  const state = makeState("eresh-blessing", ["e", "o"]);
  state.players.e.servantId = "servant.ereshkigal";
  putAt(state, "e", "mountain");
  putAt(state, "o", "mountain");
  createOwnedCardInstance(state, "e", { instanceId: "blessing", definitionId: ERESH_BLESSING_ID, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "e", { instanceId: "kur", definitionId: ERESH_KUR_KIGAL_ID, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "e", { instanceId: "e-str", definitionId: "card.test.str2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "o-str", definitionId: "card.test.str2", zone: "attack", face: "up", active: true });
  state.modeState.situationRestrictions = { combatPower: { cardAddByAttribute: { 力量: 2 }, locations: ["mountain"] } };
  state.board.currentEvents.mountain = ["event.fuyuki.6"];

  const kurSkill = built.skills.get(ERESH_KUR_KIGAL_ID);
  useEreshkigalKurKigalIrkalla({ state, player: state.players.e, skill: kurSkill, payload: { abilityId: "terraform" } });
  assert.equal(state.cards.blessing.zone, "board");
  assert.equal(state.cards.blessing.boardLocationId, "mountain");
  assert.equal(calculateCombatCardPower(state, state.players.o, "o-str", definitions, "mountain"), 0);

  const blessingSkill = built.skills.get(ERESH_BLESSING_ID);
  useEreshkigalBlessingOfKur({ state, player: state.players.e, skill: blessingSkill, payload: { abilityId: "blessing-unaffected" } });
  assert.equal(calculateCombatCardPower(state, state.players.e, "e-str", definitions, "mountain"), 7);

  const manaBefore = state.players.e.mana;
  useEreshkigalBlessingOfKur({ state, player: state.players.e, skill: blessingSkill, payload: { eventType: "player.deployed", event: { playerId: "o", locationId: "mountain" } } });
  assert.equal(state.players.e.mana, manaBefore + 1);
  useEreshkigalBlessingOfKur({ state, player: state.players.e, skill: blessingSkill, payload: { eventType: "combat.ending", event: { round: state.round } } });
  assert.equal(state.cards.blessing.zone, "servant-skills");
  assert.equal(state.cards.blessing.boardSituationPowerModifierMultiplier, undefined);
  assert.equal(state.cards.blessing.boardEventPowerModifierMultiplier, undefined);
});

test("Ereshkigal: Terraform grants +6 when Blessing is already on her battlefield", () => {
  const state = makeState("eresh-kur-bonus", ["e"]);
  state.players.e.servantId = "servant.ereshkigal";
  putAt(state, "e", "city");
  createOwnedCardInstance(state, "e", { instanceId: "blessing", definitionId: ERESH_BLESSING_ID, zone: "servant-skills", face: "up", active: false });
  const skill = built.skills.get(ERESH_KUR_KIGAL_ID);
  useEreshkigalKurKigalIrkalla({ state, player: state.players.e, skill, payload: { abilityId: "terraform" } });
  useEreshkigalKurKigalIrkalla({ state, player: state.players.e, skill, payload: { abilityId: "terraform" } });
  assert.equal(state.players.e.flags.roundPowerBonus, 6);
});
