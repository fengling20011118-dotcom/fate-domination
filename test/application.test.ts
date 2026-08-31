import test from "node:test";
import assert from "node:assert/strict";
import { GameApplication } from "../src/application/game-application.ts";
import { CommandType } from "../src/match-engine/commands.ts";

const content = {
  cards: {}, situations: [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, mana: 1 })),
    { id: "c1", mana: 2, climax: true }, { id: "c2", mana: 2, climax: true }, { id: "c3", mana: 2, climax: true },
  ],
  events: Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, victoryPoints: 1 })),
  playerDecks: { p1: [], p2: [] },
};

test("应用门面只通过命令改变状态，保存恢复不改变房间身份", () => {
  const app = GameApplication.create({ gameInstanceId: "app-room", players: [{ id: "p1", name: "一" }], seed: 1, content });
  const before = app.state;
  const result = app.dispatch({ commandId: "start", gameInstanceId: "app-room", actorId: "host", expectedRevision: 0, type: CommandType.StartStandardGame, payload: {} });
  assert.equal(result.state.revision, 1);
  assert.equal(before.revision, 0);
  const saved = app.save("2026-08-30T00:00:00.000Z");
  app.dispatch({ commandId: "window", gameInstanceId: "app-room", actorId: "p1", expectedRevision: 1, type: CommandType.CompletePlayerWindow, payload: {} });
  app.restore(saved);
  assert.equal(app.state.revision, 1);
  assert.equal(app.state.gameInstanceId, "app-room");
});
