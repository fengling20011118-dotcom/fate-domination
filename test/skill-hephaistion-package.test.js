import test from "node:test";
import assert from "node:assert/strict";
import content from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

const WHEEL = "servant.hephaistion.skill.sc-hephaistion-1";

function command(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id) {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "h", name: "H" }, { id: "a", name: "A" }, { id: "b", name: "B" }], seed: 1101 });
  state.status = "playing"; state.round = 4; state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "h"; state.turnOrder = ["h", "a", "b"];
  state.players.h.servantId = "servant.hephaistion";
  for (const id of ["h", "a", "b"]) state.players[id].locationId = "mountain";
  state.board.locations.mountain = ["h", "a", "b"];
  createOwnedCardInstance(state, "h", { instanceId: "wheel", definitionId: WHEEL, zone: "attack", face: "up", active: true });
  for (const [playerId, ids] of [["a", ["a1", "a2", "a3"]], ["b", ["b1", "b2"]]]) {
    ids.forEach((instanceId, index) => createOwnedCardInstance(state, playerId, { instanceId, definitionId: ["card.cardb2", "card.cardq2", "card.carda2"][index] ?? "card.cardb2", zone: "attack", face: "up", active: true }));
  }
  return { built, engine, state };
}

test("Hephaistion package: all three skills are FULL", () => {
  const { built } = setup("hephaistion-full");
  assert.ok([WHEEL, "servant.hephaistion.skill.sc-hephaistion-2", "servant.hephaistion.skill.sc-hephaistion-3"].every((id) => built.skills.get(id).supportLevel === "FULL"));
  assert.equal(built.skills.get(WHEEL).handlerId, "core.hephaistion-wheel");
  assert.deepEqual(built.skills.get(WHEEL).rules?.ambiguities ?? [], []);
  assert.deepEqual(built.skills.get(WHEEL).rules?.unmodeledClauses ?? [], []);
});

test("Magic Heavenly Wheel lets each engaged opponent spend a seal; only non-users close ceil half their active attacks", () => {
  const { engine, state } = setup("hephaistion-wheel");
  state.players.b.flags.commandSealUsedRound = 4;
  let result = engine.execute(state, command(state, "wheel-use", CommandType.UseSkill, "h", { skillId: WHEEL }));
  assert.equal(result.state.pendingDecision?.kind, "hephaistion-wheel-command-seal");
  assert.deepEqual(result.state.pendingDecision?.chooserPlayerIds, ["a"]);

  result = engine.execute(result.state, command(result.state, "a-decline", CommandType.ResolveDecision, "a", { decisionId: result.state.pendingDecision.decisionId, selections: ["decline"] }));
  assert.equal(result.state.pendingDecision?.kind, "hephaistion-wheel-close-attacks");
  assert.deepEqual(result.state.pendingDecision?.chooserPlayerIds, ["a"]);
  assert.equal(result.state.pendingDecision?.min, 2);
  assert.equal(result.state.pendingDecision?.max, 2);

  result = engine.execute(result.state, command(result.state, "a-close", CommandType.ResolveDecision, "a", { decisionId: result.state.pendingDecision.decisionId, selections: ["a1", "a2"] }));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.cards.a1.active, false);
  assert.equal(result.state.cards.a2.active, false);
  assert.equal(result.state.cards.a3.active, true);
  assert.equal(result.state.cards.b1.active, true);
  assert.equal(result.state.cards.b2.active, true);
});

test("Magic Heavenly Wheel immediate seal spend marks this round and avoids attack closure", () => {
  const { engine, state } = setup("hephaistion-spend");
  state.players.b.eliminated = true;
  state.board.locations.mountain = ["h", "a"];
  const before = state.players.a.commandSeals;
  let result = engine.execute(state, command(state, "wheel-use-spend", CommandType.UseSkill, "h", { skillId: WHEEL }));
  result = engine.execute(result.state, command(result.state, "a-spend", CommandType.ResolveDecision, "a", { decisionId: result.state.pendingDecision.decisionId, selections: ["spend"] }));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.players.a.commandSeals, before - 1);
  assert.equal(result.state.players.a.flags.commandSealUsedRound, 4);
  assert.ok(["a1", "a2", "a3"].every((id) => result.state.cards[id].active));
});
