import test from "node:test";
import assert from "node:assert/strict";
import rawContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { GameApplication } from "../src/application/game-application.ts";
import { FRONTEND_SMOKE_PLAYABLE_PRESET, buildPlayableSetupCommands } from "../src/application/playable-presets.ts";
import { buildStandardContent } from "../src/content/content-package.ts";

test("frontend smoke preset starts a playable match from real content", () => {
  const content = buildStandardContent(rawContent);
  const app = GameApplication.create({
    gameInstanceId: FRONTEND_SMOKE_PLAYABLE_PRESET.gameInstanceId,
    players: FRONTEND_SMOKE_PLAYABLE_PRESET.players,
    seed: FRONTEND_SMOKE_PLAYABLE_PRESET.seed,
    content,
  });

  let lastResult;
  for (const command of buildPlayableSetupCommands()) {
    lastResult = app.dispatchFor(command.actorId === "host" ? "p1" : command.actorId, command);
    assert.equal(lastResult.ok, true);
  }

  assert.ok(lastResult?.ok);
  const state = app.state;
  assert.equal(state.status, "playing");
  for (const pick of FRONTEND_SMOKE_PLAYABLE_PRESET.picks) {
    const player = state.players[pick.playerId];
    assert.equal(player.masterId, pick.masterId);
    assert.equal(player.servantId, pick.servantId);
    assert.equal(player.hand.length, 3);
    assert.equal(player.deck.length, 9);
    assert.ok(player.masterSkills.length > 0);
    assert.ok(player.servantSkills.length > 0);
    assert.equal(content.playerDecks[pick.servantId].length, 12);
  }

  const view = app.viewFor("p1");
  assert.equal(view.status, "playing");
  assert.ok(app.availableActionsFor("p1").length > 0);
});
