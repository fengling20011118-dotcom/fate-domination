import test from "node:test";
import assert from "node:assert/strict";

import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { MatchEngine } from "../src/match-engine/match-engine.ts";
import { canPlayCard } from "../src/rules-core/legality.ts";
import { initializeSituationDeck } from "../src/rules-core/situation-setup.ts";

function command(state: ReturnType<typeof createGameState>, commandId: string, type: string, actorId = "p1", payload: unknown = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

test("V2 TypeScript 引擎按准备、前哨、行动、战斗推进，并跳过淘汰玩家", () => {
  const state = createGameState({ gameInstanceId: "ts-game", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 1 });
  const engine = new MatchEngine();
  let result = engine.execute(state, command(state, "start", CommandType.StartGame));
  result.state.players.p2.eliminated = true;
  result = engine.execute(result.state, command(result.state, "prep", CommandType.CompletePlayerWindow));
  assert.equal(result.state.activePlayerId, "p1");
  result = engine.execute(result.state, command(result.state, "outpost", CommandType.CompletePlayerWindow));
  assert.equal(result.state.phase, "action");
});

test("败北状态在唯一出牌合法性入口被拦截", () => {
  const state = createGameState({ gameInstanceId: "defeat-game", players: [{ id: "p1", name: "一" }], seed: 2 });
  const engine = new MatchEngine();
  let result = engine.execute(state, command(state, "start", CommandType.StartGame));
  result.state.phase = "action";
  result.state.activePlayerId = "p1";
  result.state.players.p1.defeated = true;
  assert.equal(canPlayCard(result.state, "p1"), false);
  assert.throws(() => engine.execute(result.state, command(result.state, "play", CommandType.PlayCard)), /CARD_PLAY_FORBIDDEN/);
});

test("局势牌按10张非高潮移除2张，再接3张高潮牌", () => {
  const state = createGameState({ gameInstanceId: "situation-game", players: [{ id: "p1", name: "一" }], seed: 3 });
  const regular = Array.from({ length: 10 }, (_, index) => ({ id: `situation.regular-${index + 1}` }));
  const climax = Array.from({ length: 3 }, (_, index) => ({ id: `situation.climax-${index + 1}`, climax: true }));
  initializeSituationDeck(state, [...regular, ...climax], (max) => max - 1);
  assert.equal(state.board.situationDiscard.length, 2);
  assert.equal(state.board.situationDeck.length, 11);
  assert.deepEqual(state.board.situationDeck.slice(-3), climax.map((item) => item.id));
});
