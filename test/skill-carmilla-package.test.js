import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { deployPlayer } from "../src/rules-core/board.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { createOwnedCardInstance, returnBorrowedCardToOwnerDiscard } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  CARMILLA_FRESH_BLOOD_ID,
  CARMILLA_IMMORAL_ID,
  CARMILLA_PHANTOM_ID,
  resolveCarmillaFreshBlood,
  resolveCarmillaImmoralSuggestion,
  useCarmillaFreshBlood,
  useCarmillaImmoralSuggestion,
  useCarmillaPhantomMaiden,
} from "../src/rules-core/carmilla.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const basic = { id: "card.test.carmilla-basic", name: "Test Basic", cardType: "attack", cost: 0, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true };
const nonbasic = { id: "card.test.carmilla-nonbasic", name: "Test Nonbasic", cardType: "attack", cost: 0, basePower: 5, typeLabel: "魔术", attributes: ["魔术"], basic: false };
definitions[basic.id] = basic;
definitions[nonbasic.id] = nonbasic;

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function makeState(id) {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "c", name: "Carmilla" }, { id: "o1", name: "O1" }, { id: "o2", name: "O2" }],
    seed: 89,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "c";
  state.players.c.servantId = "servant.carmilla";
  state.players.c.mana = 5;
  state.players.o1.mana = 5;
  state.players.o2.mana = 5;
  state.players.c.victoryPoints = 6;
  state.players.o1.victoryPoints = 6;
  state.players.o2.victoryPoints = 6;
  putAt(state, "c", "mountain");
  putAt(state, "o1", "mountain");
  putAt(state, "o2", "mountain");
  return state;
}

function addCard(state, playerId, instanceId, definitionId, zone, face = "down", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}

function ctx(state, skillId, payload, openDecision = () => {}, emitEvent = () => {}) {
  return { state, player: state.players.c, skill: built.skills.get(skillId), payload, definitions, openDecision, randomInt: () => 0, emitEvent };
}

test("卡米拉技能包 3/3 FULL，吸血不受8魔力技能门槛", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.carmilla");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(built.skills.get(CARMILLA_FRESH_BLOOD_ID).requiresEightMana, false);

  const state = makeState("carmilla-low-mana");
  state.phase = "action";
  state.players.c.mana = 1;
  addCard(state, "c", "fresh", CARMILLA_FRESH_BLOOD_ID, "servant-skills", "down", false);
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "c", instanceId: "fresh", definitions, faceDown: false }));
});

test("浴血重生在技能区也可触发：支付3战果并移除吸血后忽略本回合败北", () => {
  const state = makeState("carmilla-rejuvenation");
  addCard(state, "c", "fresh", CARMILLA_FRESH_BLOOD_ID, "servant-skills", "down", false);
  state.players.c.defeated = true;
  let decision;
  const opened = useCarmillaFreshBlood(ctx(state, CARMILLA_FRESH_BLOOD_ID, { eventType: "player.defeated", event: { playerId: "c" } }, (value) => { decision = value; }));
  assert.equal(opened.pending, true);
  assert.deepEqual(decision.options.map((option) => option.id), ["use", "decline"]);
  const previous = state.effectQueue[0].payload;
  const result = resolveCarmillaFreshBlood(ctx(state, CARMILLA_FRESH_BLOOD_ID, { previous, decision: { status: "resolved", selections: ["use"] } }));
  assert.equal(result.victoryPointsPaid, 3);
  assert.equal(state.players.c.victoryPoints, 3);
  assert.equal(state.players.c.defeated, false);
  assert.equal(state.players.c.flags.ignoreDefeatRound, state.round);
  assert.equal(state.cards.fresh.zone, "removed");
});

test("吸血从战斗胜者偷2魔力并记录目标，下一回合拷问技术可在技能区花2魔力精确指定部署地点与地利格", () => {
  const state = makeState("carmilla-deploy-control");
  addCard(state, "c", "fresh", CARMILLA_FRESH_BLOOD_ID, "attack", "up", true);
  const stolen = useCarmillaFreshBlood(ctx(state, CARMILLA_FRESH_BLOOD_ID, {
    eventType: "combat.resolved", event: { powers: { c: 6, o1: 8 }, winnerIds: ["o1"], locationId: "mountain" },
  }));
  assert.equal(stolen.transferred, 2);
  assert.equal(state.players.c.mana, 7);
  assert.equal(state.players.o1.mana, 3);
  assert.equal(state.players.c.flags["carmillaFreshBloodStolenRound:o1"], 4);

  state.round = 5;
  state.phase = "outpost";
  state.activePlayerId = "o1";
  addCard(state, "c", "immoral-resting", CARMILLA_IMMORAL_ID, "servant-skills", "down", false);
  let decision;
  const opened = useCarmillaImmoralSuggestion(ctx(state, CARMILLA_IMMORAL_ID, { eventType: "phase.player-window.closed", event: { playerId: "c", phase: "outpost" } }, (value) => { decision = value; }));
  assert.equal(opened.pending, true);
  assert.ok(decision.options.some((option) => option.id === "city|0"));
  const previous = state.effectQueue[0].payload;
  const result = resolveCarmillaImmoralSuggestion(ctx(state, CARMILLA_IMMORAL_ID, { previous, decision: { status: "resolved", selections: ["city|0"] } }));
  assert.equal(result.manaPaid, 2);
  assert.equal(state.players.c.mana, 5);
  assert.equal(state.players.o1.flags.forcedDeploymentLocationId, "city");
  assert.equal(state.players.o1.flags.forcedDeploymentSlotIndex, 0);
  deployPlayer(state, "o1", "city", definitions);
  assert.equal(state.players.o1.locationId, "city");
  assert.equal(state.board.outpostRecords.city[0], "o1");
  assert.equal(state.players.o1.flags.deploymentBonus, 3);
});

test("拷问技术激活对手暗置基础攻击时本回合取得控制权，实体所有权不变且可由通用借牌清理归还", () => {
  const state = makeState("carmilla-immoral-basic");
  addCard(state, "c", "immoral", CARMILLA_IMMORAL_ID, "attack", "up", true);
  addCard(state, "o1", "hidden-basic", basic.id, "attack", "down", false);
  putAt(state, "o2", "city");
  const result = useCarmillaImmoralSuggestion(ctx(state, CARMILLA_IMMORAL_ID, { abilityId: "activate-hidden" }));
  assert.equal(result.basic, true);
  assert.equal(state.cards["hidden-basic"].active, true);
  assert.equal(state.cards["hidden-basic"].face, "up");
  assert.equal(state.cards["hidden-basic"].ownerPlayerId, "o1");
  assert.equal(state.cards["hidden-basic"].controllerPlayerId, "c");
  assert.ok(state.players.c.attack.includes("hidden-basic"));
  assert.equal(state.players.o1.attack.includes("hidden-basic"), false);
  assert.equal(state.players.c.flags["carmillaImmoralCombatRound:o1"], state.round);
  returnBorrowedCardToOwnerDiscard(state, "c", "hidden-basic");
  assert.ok(state.players.o1.discard.includes("hidden-basic"));
  assert.equal(state.cards["hidden-basic"].controllerPlayerId, "o1");
});

test("拷问技术激活非基础攻击时不夺取控制权", () => {
  const state = makeState("carmilla-immoral-nonbasic");
  addCard(state, "c", "immoral", CARMILLA_IMMORAL_ID, "attack", "up", true);
  addCard(state, "o1", "hidden-nonbasic", nonbasic.id, "attack", "down", false);
  putAt(state, "o2", "city");
  const result = useCarmillaImmoralSuggestion(ctx(state, CARMILLA_IMMORAL_ID, { abilityId: "activate-hidden" }));
  assert.equal(result.basic, false);
  assert.equal(state.cards["hidden-nonbasic"].controllerPlayerId, "o1");
  assert.ok(state.players.o1.attack.includes("hidden-nonbasic"));
});

test("幻想铁处女战后只从威力更低败者偷3战果，并排除本回合被拷问技术命中的玩家", () => {
  const state = makeState("carmilla-phantom");
  addCard(state, "c", "phantom", CARMILLA_PHANTOM_ID, "attack", "up", true);
  state.players.c.victoryPoints = 1;
  state.players.o1.victoryPoints = 7;
  state.players.o2.victoryPoints = 5;
  state.players.c.flags["carmillaImmoralCombatRound:o1"] = state.round;
  const result = useCarmillaPhantomMaiden(ctx(state, CARMILLA_PHANTOM_ID, {
    eventType: "combat.resolved", event: { powers: { c: 10, o1: 5, o2: 6 }, winnerIds: ["c"], locationId: "mountain" },
  }));
  assert.equal(result.targetPlayerId, "o2");
  assert.equal(result.transferred, 3);
  assert.equal(state.players.c.victoryPoints, 4);
  assert.equal(state.players.o1.victoryPoints, 7);
  assert.equal(state.players.o2.victoryPoints, 2);
});
