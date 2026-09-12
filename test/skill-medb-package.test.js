import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { deployPlayer, deployScheduledFollowers, playerSkipsOutpostDeployment } from "../src/rules-core/board.ts";
import { MEDB_CHARIOT_ID, MEDB_RED_MEAD_ID, useMedbChariot, useMedbRedMead } from "../src/rules-core/medb.ts";

const built = buildStandardContent(legacyContent);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function makeState(id, count = 3) {
  const players = Array.from({ length: count }, (_, i) => ({ id: i === 0 ? "m" : `p${i}`, name: `P${i}` }));
  const state = createGameState({ gameInstanceId: id, players, seed: 27 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "m";
  state.players.m.servantId = "servant.medb";
  for (const playerId of Object.keys(state.players)) putAt(state, playerId, "mountain");
  return state;
}
function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId); if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}
function addSkill(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "m", { instanceId, definitionId, zone: "attack", face: "up", active: true });
}

test("女王梅芙技能包 3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.medb");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
});

test("我心爱的蜂蜜酒记录下回合获得的战果，并在不足3时额外失去3战果", () => {
  const state = makeState("medb-mead");
  addSkill(state, "mead", MEDB_RED_MEAD_ID);
  state.players.m.victoryPoints = 1;
  state.players.p1.victoryPoints = 8;
  useMedbRedMead({ state, player: state.players.m, skill: built.skills.get(MEDB_RED_MEAD_ID), definitions,
    payload: { abilityId: "intoxicate", targetPlayerId: "p1" } });
  state.round = 4;
  state.players.p1.flags.roundVictoryPointsGained = 2;
  useMedbRedMead({ state, player: state.players.m, skill: built.skills.get(MEDB_RED_MEAD_ID), definitions,
    payload: { eventType: "round.ending", event: {} } });
  assert.equal(state.players.m.victoryPoints, 3);
  assert.equal(state.players.p1.victoryPoints, 5);
  assert.equal(state.players.p1.flags.medbIntoxicationEffects, undefined);
});

test("蜂蜜酒在迷醉目标获得至少3战果时只复制其获得量，不执行3战果惩罚", () => {
  const state = makeState("medb-mead-high");
  addSkill(state, "mead", MEDB_RED_MEAD_ID);
  state.players.p1.victoryPoints = 8;
  useMedbRedMead({ state, player: state.players.m, skill: built.skills.get(MEDB_RED_MEAD_ID), definitions,
    payload: { abilityId: "intoxicate", targetPlayerId: "p1" } });
  state.round = 4;
  state.players.p1.flags.roundVictoryPointsGained = 4;
  useMedbRedMead({ state, player: state.players.m, skill: built.skills.get(MEDB_RED_MEAD_ID), definitions,
    payload: { eventType: "round.ending", event: {} } });
  assert.equal(state.players.m.victoryPoints, 4);
  assert.equal(state.players.p1.victoryPoints, 8);
});

test("我心爱的钢铁战车令其他胜者下回合跳过自己的部署并在梅芙部署后跟随", () => {
  const state = makeState("medb-chariot");
  addSkill(state, "chariot", MEDB_CHARIOT_ID);
  state.phase = "combat";
  useMedbChariot({ state, player: state.players.m, skill: built.skills.get(MEDB_CHARIOT_ID), definitions,
    payload: { abilityId: "ensnare-winner" }, openDecision: () => {} });
  useMedbChariot({ state, player: state.players.m, skill: built.skills.get(MEDB_CHARIOT_ID), definitions,
    payload: { eventType: "combat.resolved", event: { locationId: "mountain", powers: { m: 5, p1: 8, p2: 4 }, winnerIds: ["p1"] } }, openDecision: () => {} });
  assert.equal(state.players.p1.flags.skipDeploymentRound, 4);
  assert.equal(state.players.p1.flags.followDeploymentRound, 4);
  assert.equal(state.players.p1.flags.followDeploymentPlayerId, "m");

  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "m";
  assert.equal(playerSkipsOutpostDeployment(state, "p1"), true);
  deployPlayer(state, "m", "city", definitions);
  const followed = deployScheduledFollowers(state, "m", "city", definitions);
  assert.deepEqual(followed.map((entry) => entry.playerId), ["p1"]);
  assert.equal(state.players.p1.locationId, "city");
  assert.equal(state.players.p1.flags.skipDeploymentRound, undefined);
});

test("领队部署会为当前回合的跟随者预留有限地点容量", () => {
  const state = makeState("medb-capacity", 5);
  state.round = 4;
  state.phase = "outpost";
  state.activePlayerId = "m";
  // 工房容量4，已有3人时，梅芙+1名跟随者需要2个空位，应整体拒绝。
  putAt(state, "p2", "workshop");
  putAt(state, "p3", "workshop");
  putAt(state, "p4", "workshop");
  state.players.p1.flags.skipDeploymentRound = 4;
  state.players.p1.flags.followDeploymentRound = 4;
  state.players.p1.flags.followDeploymentPlayerId = "m";
  assert.throws(() => deployPlayer(state, "m", "workshop", definitions), /LOCATION_FULL|DEPLOYMENT_DESTINATION_FORBIDDEN_BY_RULE/);
  assert.notEqual(state.players.m.locationId, "workshop");
});
