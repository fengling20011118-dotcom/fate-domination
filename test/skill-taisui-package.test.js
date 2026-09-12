import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { getBoardToken, placeBoardToken } from "../src/rules-core/board-tokens.ts";
import { calculateTerrainAdvantage } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  TAISUI_AWAKEN_ID,
  TAISUI_CALAMITY_ID,
  taisuiFleshTokenId,
  useTaisuiCalamity,
} from "../src/rules-core/taisui.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function stateOf(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "t", name: "太岁" }, { id: "a", name: "甲" }, { id: "b", name: "乙" }], seed: 51 });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "t";
  state.players.t.servantId = "servant.taisui";
  for (const player of Object.values(state.players)) { player.mana = 20; player.victoryPoints = 5; }
  putAt(state, "t", "mountain");
  putAt(state, "a", "city");
  putAt(state, "b", "city");
  return state;
}

function activeSkill(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "t", { instanceId, definitionId, zone: "attack", face: "up", active: true });
  return state.cards[instanceId];
}

function fleshAt(state, locationId) {
  placeBoardToken(state, { id: taisuiFleshTokenId("t"), sourceId: TAISUI_AWAKEN_ID, controllerPlayerId: "t", locationId });
}

test("太岁星君技能包 3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.taisui");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("太岁觉醒正面在前哨阶段把视肉放置或移动到自己地点", () => {
  const state = stateOf("taisui-flesh");
  state.phase = "outpost";
  const source = activeSkill(state, "awaken", TAISUI_AWAKEN_ID);
  built.skills.execute(state, "t", TAISUI_AWAKEN_ID, { abilityId: "taisui-flesh-place" }, () => {}, () => 0, definitions);
  assert.equal(getBoardToken(state, taisuiFleshTokenId("t")).locationId, "mountain");
  putAt(state, "t", "city");
  delete state.players.t.usage[`${TAISUI_AWAKEN_ID}:taisui-flesh-place`];
  built.skills.execute(state, "t", TAISUI_AWAKEN_ID, { abilityId: "taisui-flesh-place" }, () => {}, () => 0, definitions);
  assert.equal(getBoardToken(state, taisuiFleshTokenId("t")).locationId, "city");
  assert.notEqual(source.reversed, true);
});

test("凶神让视肉跟随从其所在地移动的对手，但部署不会触发跟随", () => {
  const state = stateOf("taisui-follow");
  activeSkill(state, "calamity", TAISUI_CALAMITY_ID);
  fleshAt(state, "city");
  useTaisuiCalamity({ state, player: state.players.t, skill: built.skills.get(TAISUI_CALAMITY_ID), definitions,
    payload: { eventType: "player.entered-location", event: { playerId: "a", previousLocationId: "city", locationId: "scouting", method: "move" } }, openDecision: () => {} });
  assert.equal(getBoardToken(state, taisuiFleshTokenId("t")).locationId, "scouting");
  useTaisuiCalamity({ state, player: state.players.t, skill: built.skills.get(TAISUI_CALAMITY_ID), definitions,
    payload: { eventType: "player.entered-location", event: { playerId: "b", previousLocationId: "scouting", locationId: "mountain", method: "deploy" } }, openDecision: () => {} });
  assert.equal(getBoardToken(state, taisuiFleshTokenId("t")).locationId, "scouting");
});

test("凶神正面在视肉所在地获得+3地利；反转且不在该地时从当地每名玩家偷1战果", () => {
  const state = stateOf("taisui-calamity");
  const source = activeSkill(state, "calamity", TAISUI_CALAMITY_ID);
  fleshAt(state, "mountain");
  state.phase = "combat";
  const before = calculateTerrainAdvantage(state, state.players.t, definitions, "mountain");
  built.skills.execute(state, "t", TAISUI_CALAMITY_ID, { abilityId: "taisui-calamity-combat" }, () => {}, () => 0, definitions);
  const after = calculateTerrainAdvantage(state, state.players.t, definitions, "mountain");
  assert.equal(after - before, 3);

  delete state.players.t.usage[`${TAISUI_CALAMITY_ID}:taisui-calamity-combat`];
  source.reversed = true;
  fleshAt(state, "city");
  state.players.t.victoryPoints = 5;
  state.players.a.victoryPoints = 1;
  state.players.b.victoryPoints = 5;
  const result = built.skills.execute(state, "t", TAISUI_CALAMITY_ID, { abilityId: "taisui-calamity-combat" }, () => {}, () => 0, definitions);
  assert.equal(result.mode, "steal");
  assert.deepEqual(result.stolen, { a: 1, b: 1 });
  assert.equal(state.players.t.victoryPoints, 7);
  assert.equal(state.players.a.victoryPoints, 0);
  assert.equal(state.players.b.victoryPoints, 4);
});

test("太岁觉醒反转后仅在恰隔一处地点时汇合到中间地点，并令当地所有对手败北", () => {
  const state = stateOf("taisui-awaken-alter");
  const source = activeSkill(state, "awaken", TAISUI_AWAKEN_ID);
  source.reversed = true;
  state.phase = "action";
  putAt(state, "t", "workshop");
  putAt(state, "a", "mountain");
  putAt(state, "b", "mountain");
  fleshAt(state, "city");
  state.players.t.trueNameRevealed = false;

  const result = built.skills.execute(state, "t", TAISUI_AWAKEN_ID, { abilityId: "taisui-awaken-alter" }, () => {}, () => 0, definitions);
  assert.equal(result.targetLocationId, "mountain");
  assert.equal(state.players.t.locationId, "mountain");
  assert.equal(getBoardToken(state, taisuiFleshTokenId("t")).locationId, "mountain");
  assert.equal(state.players.t.trueNameRevealed, true);
  assert.equal(state.players.a.defeated, true);
  assert.equal(state.players.b.defeated, true);
});
