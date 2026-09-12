import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { CardAbilityRegistry } from "../src/rules-core/card-abilities.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { swapPlayerRedeployPositionsByEffect } from "../src/rules-core/board.ts";
import {
  USHIWAKAMARU_EIGHT_BOAT_ID,
  USHIWAKAMARU_ICICLE_ID,
} from "../src/rules-core/ushiwakamaru.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const customCard = {
  id: "card.test.ushi-action",
  name: "测试行动能力攻击",
  cardType: "attack",
  cost: 0,
  basePower: 1,
  typeLabel: "迅捷",
  attributes: ["迅捷"],
  phases: ["action"],
  cardAbilityIds: ["test.ushi-action"],
};
const highCard = { id: "card.test.ushi-high", name: "高威力", cardType: "attack", cost: 0, basePower: 30, typeLabel: "力量", attributes: ["力量"] };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [customCard.id]: customCard, [highCard.id]: highCard };

function makeState(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "u", name: "Ushi" }, { id: "o", name: "Opponent" }, { id: "x", name: "Extra" }], seed: 31 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "u";
  state.players.u.servantId = "servant.ushiwakamaru";
  putAt(state, "u", "mountain");
  putAt(state, "o", "city");
  putAt(state, "x", "workshop");
  state.players.u.mana = 20;
  state.players.o.mana = 20;
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

function addAttack(state, playerId, instanceId, definitionId, active = true) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone: "attack", face: "up", active });
}

function addUshiSkills(state, includeEightBoat = true) {
  addAttack(state, "u", "icicle", USHIWAKAMARU_ICICLE_ID);
  if (includeEightBoat) addAttack(state, "u", "eight", USHIWAKAMARU_EIGHT_BOAT_ID);
}

function setActiveDeploymentPosition(state, playerId, locationId, slot) {
  putAt(state, playerId, locationId);
  const records = state.board.outpostRecords[locationId];
  if (!records) throw new Error("TEST_DEPLOYMENT_RECORD_REQUIRED");
  for (let i = 0; i < records.length; i += 1) if (records[i] === playerId) records[i] = null;
  records[slot] = playerId;
  const bonus = locationId === "workshop" ? (slot === 0 ? 2 : 1) : (slot === 0 ? 3 : 1);
  state.players[playerId].flags.deploymentLocationId = locationId;
  state.players[playerId].flags.deploymentBonus = bonus;
  state.players[playerId].flags.deploymentBonusActive = true;
}

test("牛若丸技能包 3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.ushiwakamaru");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
});

test("喜见城允许行动阶段技能在战斗阶段使用，但原能力仍保持每回合一次", () => {
  const state = makeState("ushi-action-in-combat");
  addUshiSkills(state);
  built.skills.execute(state, "u", USHIWAKAMARU_EIGHT_BOAT_ID, { abilityId: "eight-boat-leap", targetPlayerId: "o" }, () => {}, () => 0, definitions);
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "u";
  assert.throws(() => built.skills.execute(state, "u", USHIWAKAMARU_EIGHT_BOAT_ID,
    { abilityId: "eight-boat-leap", targetPlayerId: "o" }, () => {}, () => 0, definitions), /SKILL_USE_FORBIDDEN/);
});

test("旋回斩击只为一个已使用技能能力追加一次重用，且重用不会重置原能力次数", () => {
  const state = makeState("ushi-skill-reuse");
  addUshiSkills(state);
  built.skills.execute(state, "u", USHIWAKAMARU_EIGHT_BOAT_ID, { abilityId: "eight-boat-leap", targetPlayerId: "o" }, () => {}, () => 0, definitions);
  const originalUsage = structuredClone(state.players.u.usage[`${USHIWAKAMARU_EIGHT_BOAT_ID}:eight-boat-leap`]);
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "u";
  built.skills.execute(state, "u", USHIWAKAMARU_ICICLE_ID,
    { abilityId: "whirling-slashes", targetInstanceId: "eight", targetAbilityId: "eight-boat-leap" }, () => {}, () => 0, definitions);
  assert.equal(state.players.u.abilityReuseGrants?.length, 1);
  built.skills.execute(state, "u", USHIWAKAMARU_EIGHT_BOAT_ID,
    { abilityId: "eight-boat-leap", targetPlayerId: "o" }, () => {}, () => 0, definitions);
  assert.deepEqual(state.players.u.usage[`${USHIWAKAMARU_EIGHT_BOAT_ID}:eight-boat-leap`], originalUsage);
  assert.equal(state.players.u.abilityReuseGrants, undefined);
  assert.throws(() => built.skills.execute(state, "u", USHIWAKAMARU_EIGHT_BOAT_ID,
    { abilityId: "eight-boat-leap", targetPlayerId: "o" }, () => {}, () => 0, definitions), /SKILL_USE_FORBIDDEN/);
});

test("通用卡牌行动能力同样受喜见城战斗许可与旋回斩击的一次重用边界控制", () => {
  const state = makeState("ushi-card-reuse");
  addUshiSkills(state, false);
  addAttack(state, "u", "action-card", customCard.id);
  const abilities = new CardAbilityRegistry();
  let calls = 0;
  abilities.register("test.ushi-action", () => { calls += 1; });
  abilities.execute("test.ushi-action", { state, playerId: "u", instanceId: "action-card", definitions });
  assert.equal(calls, 1);
  assert.throws(() => abilities.execute("test.ushi-action", { state, playerId: "u", instanceId: "action-card", definitions }), /CARD_ABILITY_LIMIT_REACHED/);
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "u";
  built.skills.execute(state, "u", USHIWAKAMARU_ICICLE_ID,
    { abilityId: "whirling-slashes", targetInstanceId: "action-card", targetAbilityId: "test.ushi-action" }, () => {}, () => 0, definitions);
  abilities.execute("test.ushi-action", { state, playerId: "u", instanceId: "action-card", definitions });
  assert.equal(calls, 2);
  assert.throws(() => abilities.execute("test.ushi-action", { state, playerId: "u", instanceId: "action-card", definitions }), /CARD_ABILITY_LIMIT_REACHED/);
});

test("坛之浦八艘跳只有在牛若丸当前威力更高时才交换", () => {
  const state = makeState("ushi-not-higher");
  addUshiSkills(state);
  addAttack(state, "o", "high", highCard.id);
  const before = { u: state.players.u.locationId, o: state.players.o.locationId };
  const result = built.skills.execute(state, "u", USHIWAKAMARU_EIGHT_BOAT_ID,
    { abilityId: "eight-boat-leap", targetPlayerId: "o" }, () => {}, () => 0, definitions);
  assert.equal(result.swapped, false);
  assert.deepEqual({ u: state.players.u.locationId, o: state.players.o.locationId }, before);
});

test("八艘跳原子交换双方部署位置，并让重新部署到工房者获得该位置魔力", () => {
  const state = makeState("ushi-workshop-redeploy");
  addUshiSkills(state);
  setActiveDeploymentPosition(state, "u", "mountain", 0);
  setActiveDeploymentPosition(state, "o", "workshop", 0);
  state.players.u.mana = 0;
  const result = built.skills.execute(state, "u", USHIWAKAMARU_EIGHT_BOAT_ID,
    { abilityId: "eight-boat-leap", targetPlayerId: "o" }, () => {}, () => 0, definitions);
  assert.equal(result.swapped, true);
  assert.equal(state.players.u.locationId, "workshop");
  assert.equal(state.players.o.locationId, "mountain");
  assert.equal(state.board.outpostRecords.workshop[0], "u");
  assert.equal(state.board.outpostRecords.mountain[0], "o");
  assert.equal(state.players.u.flags.deploymentBonus, 2);
  assert.equal(state.players.o.flags.deploymentBonus, 3);
  assert.equal(state.players.u.mana, 2);
});

test("八艘跳预检任一方无法重新部署时双方都保持原位", () => {
  const state = makeState("ushi-atomic-redeploy");
  addUshiSkills(state);
  setActiveDeploymentPosition(state, "u", "mountain", 0);
  setActiveDeploymentPosition(state, "o", "workshop", 0);
  state.modeState.situationRestrictions = { forbiddenLocations: ["workshop"] };
  const beforeRecords = structuredClone(state.board.outpostRecords);
  const beforeMana = state.players.u.mana;
  const result = built.skills.execute(state, "u", USHIWAKAMARU_EIGHT_BOAT_ID,
    { abilityId: "eight-boat-leap", targetPlayerId: "o" }, () => {}, () => 0, definitions);
  assert.equal(result.swapped, false);
  assert.equal(state.players.u.locationId, "mountain");
  assert.equal(state.players.o.locationId, "workshop");
  assert.deepEqual(state.board.outpostRecords, beforeRecords);
  assert.equal(state.players.u.mana, beforeMana);
});

test("通用原子交换帮助函数在同一地点时不制造伪部署", () => {
  const state = makeState("ushi-same-location");
  putAt(state, "o", "mountain");
  const result = swapPlayerRedeployPositionsByEffect(state, "u", "o", definitions);
  assert.deepEqual(result, []);
  assert.equal(state.players.u.locationId, "mountain");
  assert.equal(state.players.o.locationId, "mountain");
});
