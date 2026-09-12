import test from "node:test";
import assert from "node:assert/strict";
import content from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";

const skillId = "servant.gareth.skill.sc-gareth-1";

function fixture() {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-gareth", players: [{ id: "gareth", name: "加雷斯" }, { id: "other", name: "对手" }], seed: 1530 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "gareth";
  state.players.gareth.servantId = "servant.gareth";
  state.players.gareth.locationId = "mountain";
  state.players.gareth.mana = 2;
  state.players.gareth.trueNameRevealed = false;
  state.board.locations.mountain = ["gareth"];
  createOwnedCardInstance(state, "gareth", { instanceId: "ring", definitionId: skillId, zone: "attack", face: "up", active: true });
  let eventSequence = 0;
  function emit(type, payload) {
    enqueuePassiveEffects(state, engine.passives, { eventId: `${type}-${eventSequence++}`, type, revision: state.revision, sourceCommandId: "test", payload });
    engine.effects.drain(state, 1000, { ...built.cards, ...built.skills.asCardDefinitions() });
  }
  function move(targetLocationId) {
    return engine.execute(state, { commandId: "move", gameInstanceId: state.gameInstanceId, expectedRevision: state.revision, actorId: "gareth", type: CommandType.UseSkill, payload: { skillId, data: { abilityId: "nameless-knight", targetLocationId } } });
  }
  return { state, emit, move };
}

test("结构化打出模板：伪装仅响应自己正面打出变身戒指", () => {
  const { state, emit } = fixture();
  state.players.gareth.trueNameRevealed = true;
  const ownPlay = { playerId: "gareth", instanceId: "ring", definitionId: skillId, face: "up" };
  for (const payload of [{ ...ownPlay, playerId: "other" }, { ...ownPlay, definitionId: "card.cardluck" }, { ...ownPlay, face: "down" }]) {
    emit("card.played", payload);
    assert.equal(state.players.gareth.trueNameRevealed, true);
  }
  emit("card.played", ownPlay);
  assert.equal(state.players.gareth.trueNameRevealed, false);
});

test("结构化胜利模板：荣光之冠仅在隐藏转公开时奖励，重新隐藏后可再次奖励", () => {
  const { state, emit } = fixture();
  state.phase = "combat";
  state.step = "settlement";
  const combat = { locationId: "mountain", powers: { gareth: 6, other: 3 }, winnerIds: ["gareth"] };
  emit("combat.resolved", { ...combat, winnerIds: ["other"] });
  assert.equal(state.players.gareth.trueNameRevealed, false);
  assert.equal(state.players.gareth.victoryPoints, 0);
  emit("combat.resolved", combat);
  assert.equal(state.players.gareth.trueNameRevealed, true);
  assert.equal(state.players.gareth.victoryPoints, 1);
  emit("combat.resolved", combat);
  assert.equal(state.players.gareth.victoryPoints, 1);
  emit("card.played", { playerId: "gareth", instanceId: "ring", definitionId: skillId, face: "up" });
  emit("combat.resolved", combat);
  assert.equal(state.players.gareth.victoryPoints, 2);
});

test("无名骑士支付两魔力向相邻地点移动并同步占位", () => {
  for (const location of ["workshop", "city"]) {
    const { move } = fixture();
    const { state } = move(location);
    assert.equal(state.players.gareth.mana, 0);
    assert.equal(state.players.gareth.locationId, location);
    assert.deepEqual(state.board.locations.mountain, []);
    assert.deepEqual(state.board.locations[location], ["gareth"]);
  }
});

test("荣光之冠在来源关闭或背面时不触发", () => {
  for (const patch of [{ active: false }, { face: "down" }]) {
    const { state, emit } = fixture();
    state.phase = "combat";
    state.step = "settlement";
    Object.assign(state.cards.ring, patch);
    emit("combat.resolved", { locationId: "mountain", powers: { gareth: 6, other: 3 }, winnerIds: ["gareth"] });
    assert.equal(state.players.gareth.trueNameRevealed, false);
    assert.equal(state.players.gareth.victoryPoints, 0);
  }
});

test("无名骑士拒绝原地、跨地点、无效地点且失败不扣费", () => {
  for (const location of ["mountain", "scouting", "unknown"]) {
    const { state, move } = fixture();
    assert.throws(() => move(location), /STRUCTURED_SKILL_MOVE_LOCATION_FORBIDDEN/);
    assert.equal(state.players.gareth.mana, 2);
    assert.equal(state.players.gareth.locationId, "mountain");
  }
});

test("无名骑士在真名公开或魔力不足时不可执行", () => {
  for (const patch of [{ trueNameRevealed: true }, { mana: 1 }]) {
    const { state, move } = fixture();
    Object.assign(state.players.gareth, patch);
    assert.throws(() => move("city"));
    assert.equal(state.players.gareth.locationId, "mountain");
    assert.equal(state.players.gareth.mana, patch.mana ?? 2);
  }
});
