import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CardAbilityRegistry } from "../src/rules-core/card-abilities.ts";
import { registerBasicCardAbilities } from "../src/rules-core/basic-card-abilities.ts";
import { getStructuredCardName, executeStructuredGrantedCardAbility } from "../src/rules-core/card-transforms.ts";
import { hasPendingMandatoryActionAbilityInCombat, markMandatoryActionAbilityInCombatUsed } from "../src/rules-core/card-rule-modifiers.ts";
import { playerIgnoresDefeat } from "../src/rules-core/defeat.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import {
  ISHTAR_AN_GAL_ID,
  ISHTAR_DIVINE_AUTHORITY_ID,
  useIshtarAnGalTaKigalShe,
} from "../src/rules-core/ishtar.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  "card.test.power10": { id: "card.test.power10", name: "Power 10", cardType: "attack", cost: 0, basePower: 10, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.power14": { id: "card.test.power14", name: "Power 14", cardType: "attack", cost: 0, basePower: 14, typeLabel: "力量", attributes: ["力量"], basic: true },
};

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function stateOf(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "i", name: "伊什塔尔" }, { id: "a", name: "甲" }, { id: "n", name: "南丁格尔" }], seed: 1917 });
  state.status = "playing";
  state.round = 5;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "i";
  state.players.i.servantId = "servant.ishtar";
  state.players.n.servantId = "servant.nightingale";
  for (const player of Object.values(state.players)) player.mana = 30;
  putAt(state, "i", "mountain");
  putAt(state, "a", "city");
  putAt(state, "n", "workshop");
  return state;
}

function add(state, playerId, instanceId, definitionId, zone, active = false, face = zone === "attack" ? "up" : "down") {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, active, face });
  return state.cards[instanceId];
}

function addDivineSource(state) {
  return add(state, "i", "divine-source", ISHTAR_DIVINE_AUTHORITY_ID, "servant-skills", false, "down");
}

function addAnGal(state) {
  return add(state, "i", "an-gal", ISHTAR_AN_GAL_ID, "attack", true, "up");
}

test("伊什塔尔技能包 3/3 FULL 且两个重构技能均绑定专用 handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.ishtar");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("神性权能把当前控制的特殊牌按规则名视为幸运，借来的克里米亚天使同样生效", () => {
  const state = stateOf("ishtar-divine-name");
  addDivineSource(state);
  add(state, "i", "surveil", "card.cardsurveil", "attack", true, "up");
  const angel = add(state, "n", "angel", "servant.nightingale.skill.sc-nightingale-3", "attack", true, "up");
  state.players.n.attack = state.players.n.attack.filter((id) => id !== angel.instanceId);
  state.players.i.attack.push(angel.instanceId);
  angel.controllerPlayerId = "i";
  angel.returnToOwnerDiscardOnClose = true;

  assert.equal(getStructuredCardName(state, "i", definitions["card.cardsurveil"], definitions), "幸运");
  assert.equal(getStructuredCardName(state, "i", definitions[angel.definitionId], definitions), "幸运");
  assert.notEqual(getStructuredCardName(state, "n", definitions[angel.definitionId], definitions), "幸运");
});

test("神性权能授予幸运战斗能力，可结构化地无视本回合败北", () => {
  const state = stateOf("ishtar-divine-ignore-defeat");
  addDivineSource(state);
  add(state, "i", "surveil", "card.cardsurveil", "attack", true, "up");

  executeStructuredGrantedCardAbility(state, "i", "surveil", "ishtar-luck-ignore-defeat", definitions);
  assert.equal(playerIgnoresDefeat(state, state.players.i, definitions), true);
});

test("大王冠关闭一张幸运、只支付一次新幸运费用，并强制在战斗阶段使用其行动能力", () => {
  const state = stateOf("ishtar-divine-swap");
  addDivineSource(state);
  add(state, "i", "surveil", "card.cardsurveil", "attack", true, "up");
  add(state, "i", "preparation", "card.cardpreparation", "hand");
  state.players.i.flags.deploymentLocationId = "mountain";
  state.players.i.flags.deploymentBonusActive = true;
  state.players.i.flags.deploymentBonus = 1;
  const manaBefore = state.players.i.mana;

  const result = built.skills.execute(
    state,
    "i",
    ISHTAR_DIVINE_AUTHORITY_ID,
    { abilityId: "divine-authority-swap", closeInstanceId: "surveil", playInstanceId: "preparation" },
    () => {},
    () => 0,
    definitions,
  );
  assert.equal(state.cards.surveil.zone, "attack");
  assert.equal(state.cards.surveil.face, "down");
  assert.equal(state.cards.surveil.active, false);
  assert.equal(state.cards.preparation.zone, "attack");
  assert.equal(result.paidMana, 1);
  assert.equal(state.players.i.mana, manaBefore - 1);
  assert.equal(hasPendingMandatoryActionAbilityInCombat(state, state.players.i, definitions), true);

  const cardAbilities = new CardAbilityRegistry();
  registerBasicCardAbilities(cardAbilities);
  cardAbilities.execute("basic.remote-control", { state, playerId: "i", instanceId: "preparation", definitions });
  assert.equal(state.players.i.flags.deploymentBonus, 2);
  markMandatoryActionAbilityInCombatUsed(state.players.i, "preparation", "basic.remote-control");
  assert.equal(hasPendingMandatoryActionAbilityInCombat(state, state.players.i, definitions), false);
});

test("山脉震撼明星之薪打出时离场；通用移动/离场锁可阻止离场", () => {
  const removed = stateOf("ishtar-an-gal-remove");
  addAnGal(removed);
  const skill = built.skills.get(ISHTAR_AN_GAL_ID);
  const result = useIshtarAnGalTaKigalShe({
    state: removed,
    player: removed.players.i,
    skill,
    payload: { eventType: "card.played", event: { playerId: "i", definitionId: ISHTAR_AN_GAL_ID, face: "up" } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(result.removed, true);
  assert.equal(removed.players.i.locationId, null);
  assert.ok(!Object.values(removed.board.locations).some((ids) => ids.includes("i")));

  const blocked = stateOf("ishtar-an-gal-blocked");
  addAnGal(blocked);
  blocked.players.i.flags.movementBlockedRound = blocked.round;
  const blockedResult = useIshtarAnGalTaKigalShe({
    state: blocked,
    player: blocked.players.i,
    skill,
    payload: { eventType: "card.played", event: { playerId: "i", definitionId: ISHTAR_AN_GAL_ID, face: "up" } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(blockedResult.prevented, true);
  assert.equal(blocked.players.i.locationId, "mountain");
});

function prepareChallenge(id, opponentDefinitionId) {
  const state = stateOf(id);
  addAnGal(state);
  add(state, "a", "opponent", opponentDefinitionId, "attack", true, "up");
  const skill = built.skills.get(ISHTAR_AN_GAL_ID);
  useIshtarAnGalTaKigalShe({
    state,
    player: state.players.i,
    skill,
    payload: { eventType: "card.played", event: { playerId: "i", definitionId: ISHTAR_AN_GAL_ID, face: "up" } },
    definitions,
    openDecision: () => {},
  });
  state.activePlayerId = "i";
  built.skills.execute(state, "i", ISHTAR_AN_GAL_ID, { abilityId: "an-gal-challenge", locationId: "city" }, () => {}, () => 0, definitions);
  return state;
}

test("场外挑战严格高于才取代胜者，最终威力在正式战斗结算时读取", () => {
  const state = prepareChallenge("ishtar-an-gal-win", "card.test.power10");
  // Selection already happened. A later round modifier must still affect the challenge.
  state.players.i.flags.roundPowerBonus = 3;
  state.board.currentEvents.city = ["event.test"];
  const result = resolveCombat(state, "city", definitions, { "event.test": { id: "event.test", name: "Event", victoryPoints: 5 } });
  assert.deepEqual(result.winnerIds, ["i"]);
  assert.equal(result.powers.i, 17);
  // Off-board Ishtar receives the battlefield competition reward, not the event's 5 VP.
  assert.equal(result.victoryPoints.i, 3);
  assert.equal(state.players.i.victoryPoints, 3);
});

test("场外挑战与原胜者同威力时不能取代，并按败北处理", () => {
  const state = prepareChallenge("ishtar-an-gal-tie", "card.test.power14");
  const result = resolveCombat(state, "city", definitions, {});
  assert.deepEqual(result.winnerIds, ["a"]);
  assert.equal(result.powers.i, 14);
  assert.equal(state.players.i.defeated, true);
});
