import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, movePlayerCard, transferSkillToPlayerSkillZone } from "../src/rules-core/decks.ts";
import { getStructuredCombatWinnerInclusions } from "../src/rules-core/rule-modifiers.ts";
import { playerNoblePhantasmUseBlocked } from "../src/rules-core/player-statuses.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  KRIEMHILD_BALMUNG_ID,
  KRIEMHILD_BLACK_WEDDING_ID,
  KRIEMHILD_RHEINGOLD_ID,
  resolveKriemhildBlackWedding,
  resolveKriemhildCorruptedBalmung,
  useKriemhildBlackWedding,
  useKriemhildCorruptedBalmung,
  useKriemhildDasRheingold,
} from "../src/rules-core/kriemhild.ts";

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
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "k", name: "Kriemhild" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    seed: 31,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "k";
  state.players.k.servantId = "servant.kriemhild";
  for (const player of Object.values(state.players)) {
    player.mana = 20;
    player.victoryPoints = 10;
  }
  putAt(state, "k", "mountain");
  putAt(state, "a", "city");
  putAt(state, "b", "scouting");
  return state;
}

function add(state, playerId, instanceId, definitionId, zone, face = "down", active = false, originServantId) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active, ...(originServantId ? { originServantId } : {}) });
}

function ctx(state, playerId, skillId, payload, openDecision = () => {}, emitEvent = () => {}) {
  return {
    state,
    player: state.players[playerId],
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision,
    emitEvent,
    randomInt: () => 0,
  };
}

function frame(state) {
  assert.ok(state.effectQueue.length > 0);
  return state.effectQueue[0].payload;
}

test("克琳希德技能包 3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.kriemhild");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("未亡人的请柬按回合顺位收集其他玩家选择，并只移动选择移动者", () => {
  const state = stateOf("kriemhild-wedding-invite");
  state.phase = "action";
  add(state, "k", "wedding", KRIEMHILD_BLACK_WEDDING_ID, "attack", "up", true, "servant.kriemhild");
  let decision;
  const opened = useKriemhildBlackWedding(ctx(
    state,
    "k",
    KRIEMHILD_BLACK_WEDDING_ID,
    { eventType: "card.played", event: { playerId: "k", instanceId: "wedding", definitionId: KRIEMHILD_BLACK_WEDDING_ID, face: "up" } },
    (value) => { decision = value; },
  ));
  assert.equal(opened.pending, true);
  assert.deepEqual(decision.chooserPlayerIds, ["a", "b"]);
  const emitted = [];
  const result = resolveKriemhildBlackWedding(ctx(
    state,
    "k",
    KRIEMHILD_BLACK_WEDDING_ID,
    { previous: frame(state), decision: { status: "resolved", submissions: { a: ["move"], b: ["stay"] } } },
    () => {},
    (type, payload) => emitted.push({ type, payload }),
  ));
  assert.deepEqual(result.movedPlayerIds, ["a"]);
  assert.equal(state.players.a.locationId, "mountain");
  assert.equal(state.players.b.locationId, "scouting");
  assert.deepEqual(emitted.map((entry) => entry.type), ["player.moved", "player.entered-location"]);
});

test("Black Wedding 在自身败北时仍可因持有 Balmung 的另一胜者被纳入胜者", () => {
  const state = stateOf("kriemhild-wedding-win");
  putAt(state, "a", "mountain");
  state.players.k.defeated = true;
  add(state, "k", "wedding", KRIEMHILD_BLACK_WEDDING_ID, "attack", "up", true, "servant.kriemhild");
  add(state, "a", "balmung", KRIEMHILD_BALMUNG_ID, "servant-skills", "up", false, "servant.kriemhild");
  assert.deepEqual(getStructuredCombatWinnerInclusions(state, ["k", "a"], definitions, ["a"]), ["k"]);
  movePlayerCard(state, "a", "balmung", "discard");
  assert.deepEqual(getStructuredCombatWinnerInclusions(state, ["k", "a"], definitions, ["a"]), []);
});

test("流离魔剑回合结束时未获胜则失去本回合全部已获得战果；获胜则不失去", () => {
  const state = stateOf("kriemhild-balmung-curse");
  add(state, "k", "balmung", KRIEMHILD_BALMUNG_ID, "servant-skills", "up", false, "servant.kriemhild");
  state.players.k.flags.roundVictoryPointsGained = 4;
  state.players.k.victoryPoints = 14;
  const lost = useKriemhildCorruptedBalmung(ctx(state, "k", KRIEMHILD_BALMUNG_ID, { eventType: "round.ending", event: { round: 4 } }));
  assert.equal(lost.lostVictoryPoints, 4);
  assert.equal(state.players.k.victoryPoints, 10);
  state.players.k.flags.roundVictoryPointsGained = 5;
  state.players.k.victoryPoints = 15;
  state.players.k.flags.combatWinRound = 4;
  const kept = useKriemhildCorruptedBalmung(ctx(state, "k", KRIEMHILD_BALMUNG_ID, { eventType: "round.ending", event: { round: 4 } }));
  assert.equal(kept.lostVictoryPoints, 0);
  assert.equal(state.players.k.victoryPoints, 15);
});

test("流离魔剑在战斗后转入所选胜者技能区，所有权与控制权随实体牌转移", () => {
  const state = stateOf("kriemhild-balmung-transfer");
  putAt(state, "a", "mountain");
  add(state, "k", "balmung", KRIEMHILD_BALMUNG_ID, "attack", "up", true, "servant.kriemhild");
  let decision;
  const opened = useKriemhildCorruptedBalmung(ctx(
    state,
    "k",
    KRIEMHILD_BALMUNG_ID,
    { eventType: "combat.resolved", event: { locationId: "mountain", participantIds: ["k", "a"], powers: { k: 10, a: 12 }, winnerIds: ["a"] } },
    (value) => { decision = value; },
  ));
  assert.equal(opened.pending, true);
  assert.deepEqual(decision.options.map((option) => option.id), ["a"]);
  resolveKriemhildCorruptedBalmung(ctx(
    state,
    "k",
    KRIEMHILD_BALMUNG_ID,
    { previous: frame(state), decision: { status: "resolved", selections: ["a"] } },
  ));
  assert.equal(state.cards.balmung.zone, "servant-skills");
  assert.equal(state.cards.balmung.ownerPlayerId, "a");
  assert.equal(state.cards.balmung.controllerPlayerId, "a");
  assert.equal(state.players.a.servantSkills.includes("balmung"), true);
  assert.equal(state.players.k.servantSkills.includes("balmung"), false);
});

test("Balmung 的当前持有者若选择自己，获得2战果的是克琳希德", () => {
  const state = stateOf("kriemhild-balmung-self-reward");
  putAt(state, "a", "mountain");
  add(state, "k", "balmung", KRIEMHILD_BALMUNG_ID, "servant-skills", "up", false, "servant.kriemhild");
  transferSkillToPlayerSkillZone(state, "a", "balmung", definitions);
  movePlayerCard(state, "a", "balmung", "attack");
  state.cards.balmung.face = "up";
  state.cards.balmung.active = true;
  const before = state.players.k.victoryPoints;
  useKriemhildCorruptedBalmung(ctx(
    state,
    "a",
    KRIEMHILD_BALMUNG_ID,
    { eventType: "combat.resolved", event: { locationId: "mountain", participantIds: ["a", "k"], powers: { a: 12, k: 8 }, winnerIds: ["a"] } },
  ));
  const result = resolveKriemhildCorruptedBalmung(ctx(
    state,
    "a",
    KRIEMHILD_BALMUNG_ID,
    { previous: frame(state), decision: { status: "resolved", selections: ["a"] } },
  ));
  assert.equal(result.kriemhildVictoryPointsGained, 2);
  assert.equal(state.players.k.victoryPoints, before + 2);
  assert.equal(state.cards.balmung.ownerPlayerId, "a");
  assert.equal(state.cards.balmung.zone, "servant-skills");
});

test("莱茵的黄金从玩家处召回 Balmung：该玩家-3战果且下回合禁用宝具", () => {
  const state = stateOf("kriemhild-rheingold-player");
  add(state, "k", "rheingold", KRIEMHILD_RHEINGOLD_ID, "attack", "up", true, "servant.kriemhild");
  add(state, "a", "balmung", KRIEMHILD_BALMUNG_ID, "servant-skills", "up", false, "servant.kriemhild");
  useKriemhildDasRheingold(ctx(state, "k", KRIEMHILD_RHEINGOLD_ID, { abilityId: "abandoned-love" }));
  const before = state.players.a.victoryPoints;
  const result = useKriemhildDasRheingold(ctx(state, "k", KRIEMHILD_RHEINGOLD_ID, { eventType: "round.ending", event: { round: 4 } }));
  assert.equal(result.penalizedPlayerId, "a");
  assert.equal(state.players.a.victoryPoints, before - 3);
  assert.equal(playerNoblePhantasmUseBlocked(state.players.a, 5), true);
  assert.equal(playerNoblePhantasmUseBlocked(state.players.a, 6), false);
  assert.equal(state.cards.balmung.ownerPlayerId, "k");
  assert.equal(state.cards.balmung.zone, "servant-skills");
});

test("莱茵的黄金可从游戏外召回 Balmung，游戏外来源不产生玩家处罚", () => {
  const state = stateOf("kriemhild-rheingold-removed");
  add(state, "k", "rheingold", KRIEMHILD_RHEINGOLD_ID, "attack", "up", true, "servant.kriemhild");
  add(state, "a", "balmung", KRIEMHILD_BALMUNG_ID, "removed", "up", false, "servant.kriemhild");
  useKriemhildDasRheingold(ctx(state, "k", KRIEMHILD_RHEINGOLD_ID, { abilityId: "abandoned-love" }));
  const before = state.players.a.victoryPoints;
  const result = useKriemhildDasRheingold(ctx(state, "k", KRIEMHILD_RHEINGOLD_ID, { eventType: "round.ending", event: { round: 4 } }));
  assert.equal(result.penalizedPlayerId, null);
  assert.equal(state.players.a.victoryPoints, before);
  assert.equal(playerNoblePhantasmUseBlocked(state.players.a, 5), false);
  assert.equal(state.cards.balmung.ownerPlayerId, "k");
  assert.equal(state.cards.balmung.zone, "servant-skills");
});
