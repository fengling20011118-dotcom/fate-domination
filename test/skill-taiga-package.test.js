import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { getBattlefieldLocationIds } from "../src/rules-core/battlefield-rules.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { movePlayer } from "../src/rules-core/board.ts";
import { getBattlefieldCompetitionReward } from "../src/rules-core/scoring.ts";
import { getStackedStatus } from "../src/rules-core/stacked-statuses.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { TAIGA_ASCENSION_ID, TAIGA_FATES_GUIDE_ID, TIGER_STAMP_STATUS_ID, useTaigaDomesticCarnage, useTaigaFatesGuide } from "../src/rules-core/taiga.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  "card.test.power10": { id: "card.test.power10", name: "Power 10", cardType: "attack", cost: 0, basePower: 10, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.power5": { id: "card.test.power5", name: "Power 5", cardType: "attack", cost: 0, basePower: 5, typeLabel: "力量", attributes: ["力量"], basic: true },
};

function stateOf(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "t", name: "大河" }, { id: "a", name: "甲" }, { id: "b", name: "乙" }], seed: 13 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "t";
  state.players.t.masterId = "master.taiga";
  for (const player of Object.values(state.players)) player.mana = 20;
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

function add(state, playerId, instanceId, definitionId, zone = "attack", active = zone === "attack", face = zone === "attack" ? "up" : "down") {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, active, face });
  return state.cards[instanceId];
}

function unlockAscension(state) {
  add(state, "t", "taiga-asc", TAIGA_ASCENSION_ID, "master-skills", false, "up");
  state.modeState.currentSituationMana = 4;
  const skill = built.skills.get(TAIGA_ASCENSION_ID);
  useTaigaDomesticCarnage({
    state,
    player: state.players.t,
    skill,
    payload: { eventType: "skill.unlocked", event: { playerId: "t", skillId: TAIGA_ASCENSION_ID } },
    openDecision: () => {},
    definitions,
  });
}

test("藤村大河技能包 3/3 FULL 且重构技能均绑定 handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.taiga");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("命运的向导给每名败者一枚老虎并按分发数给大河战果", () => {
  const state = stateOf("taiga-guide");
  putAt(state, "t", "mountain");
  putAt(state, "a", "mountain");
  putAt(state, "b", "mountain");
  const result = useTaigaFatesGuide({
    state,
    player: state.players.t,
    skill: built.skills.get(TAIGA_FATES_GUIDE_ID),
    payload: { eventType: "combat.resolved", event: { locationId: "mountain", winnerIds: ["t"] } },
    openDecision: () => {},
    definitions,
  });
  assert.deepEqual(result.stampedPlayerIds, ["a", "b"]);
  assert.equal(state.players.t.victoryPoints, 2);
  assert.equal(getStackedStatus(state.players.a, TIGER_STAMP_STATUS_ID)?.count, 1);
  assert.equal(getStackedStatus(state.players.b, TIGER_STAMP_STATUS_ID)?.count, 1);
});

test("老虎标记数量可超过3，但合计威力贡献封顶+3", () => {
  const state = stateOf("taiga-stamp-cap");
  putAt(state, "t", "mountain");
  putAt(state, "a", "mountain");
  add(state, "a", "a-power", "card.test.power5");
  for (let index = 0; index < 5; index += 1) {
    useTaigaFatesGuide({
      state,
      player: state.players.t,
      skill: built.skills.get(TAIGA_FATES_GUIDE_ID),
      payload: { eventType: "combat.resolved", event: { locationId: "mountain", winnerIds: ["t"] } },
      openDecision: () => {},
      definitions,
    });
  }
  assert.equal(getStackedStatus(state.players.a, TIGER_STAMP_STATUS_ID)?.count, 5);
  assert.equal(calculateCombatPower(state, state.players.a, definitions, "mountain"), 8);
  assert.equal(state.players.t.victoryPoints, 5);
});

test("冬木之虎解锁后工房成为第三战场，争夺战果等于当前局势魔力且不放事件", () => {
  const state = stateOf("taiga-workshop");
  unlockAscension(state);
  assert.deepEqual(getBattlefieldLocationIds(state), ["mountain", "city", "workshop"]);
  assert.equal(getBattlefieldCompetitionReward(state, "workshop"), 4);
  assert.deepEqual(state.board.currentEvents.workshop ?? [], []);

  putAt(state, "t", "workshop");
  putAt(state, "a", "workshop");
  add(state, "t", "t-power", "card.test.power10");
  add(state, "a", "a-power", "card.test.power5");
  const result = resolveCombat(state, "workshop", definitions, {});
  assert.deepEqual(result.eventIds, []);
  assert.deepEqual(result.winnerIds, ["t"]);
  assert.equal(result.victoryPoints.t, 4);
});

test("冬木之虎启用后工房适用交战规则，且来源消失后动态战场失效", () => {
  const state = stateOf("taiga-engagement");
  unlockAscension(state);
  putAt(state, "t", "workshop");
  putAt(state, "a", "workshop");
  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "t";
  assert.throws(() => movePlayer(state, "t", "mountain", false, definitions), /ENGAGED_CANNOT_MOVE/);

  state.cards["taiga-asc"].zone = "removed";
  state.players.t.masterSkills = state.players.t.masterSkills.filter((id) => id !== "taiga-asc");
  assert.deepEqual(getBattlefieldLocationIds(state), ["mountain", "city"]);
});
