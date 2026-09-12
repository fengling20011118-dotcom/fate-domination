import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

function command(state, id, actorId, payload) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type: CommandType.UseSkill, payload };
}

test("skill effects can immediately execute a physical card ability through CardAbilityRegistry", () => {
  const built = buildStandardContent(legacyContent);
  built.skills.register({
    id: "master.test.effect-card-bridge",
    name: "Effect Card Bridge",
    ownerType: "master",
    ownerId: "master.test",
    activation: "phase",
    windows: ["action"],
    cost: 0,
    text: "test-only",
    supportLevel: "FULL",
    handlerId: "test.effect-card-bridge",
  }, ({ executeCardAbility, payload }) => {
    assert.equal(typeof executeCardAbility, "function");
    executeCardAbility(payload.instanceId, "basic.quick-march", payload.locationId);
  });
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "effect-card-bridge", players: [{ id: "p", name: "P" }], seed: 911 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "p";
  state.players.p.masterId = "master.test";
  state.players.p.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["p"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  createOwnedCardInstance(state, "p", { instanceId: "quick", definitionId: "card.cardsurveil", zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "bridge", "p", {
    skillId: "master.test.effect-card-bridge",
    data: { instanceId: "quick", locationId: "city" },
  }));
  assert.equal(result.state.players.p.locationId, "city");
  assert.ok(result.events.some((event) => event.type === "card.ability.used" && event.payload.instanceId === "quick"));
  assert.ok(result.events.some((event) => event.type === "player.moved" && event.payload.locationId === "city"));
});
