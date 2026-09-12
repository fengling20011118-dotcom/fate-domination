import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

const DESCENT = "servant.valkyrie.skill.sc-valkyrie-1";
const SWAN = "servant.valkyrie.skill.sc-valkyrie-2";
const COMMANDERS = ["card.x-commanderortlinde", "card.x-commanderhildr", "card.x-commanderthrud"];

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "valkyrie") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "v", name: "Valkyrie" }, { id: "o", name: "Opponent" }], seed: 3101 });
  state.status = "playing";
  state.round = 4;
  state.turnOrder = ["v", "o"];
  state.players.v.servantId = "servant.valkyrie";
  state.players.v.mana = 10;
  state.players.v.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["v", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, engine, definitions, state };
}

function seedCommanders(state) {
  createOwnedCardInstance(state, "v", { instanceId: "ortlinde", definitionId: COMMANDERS[0], zone: "removed" });
  createOwnedCardInstance(state, "v", { instanceId: "hildr", definitionId: COMMANDERS[1], zone: "discard" });
  createOwnedCardInstance(state, "v", { instanceId: "thrud", definitionId: COMMANDERS[2], zone: "deck" });
}

test("Valkyrie package: all three skills are FULL", () => {
  const { built } = setup("valkyrie-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.valkyrie");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(DESCENT).handlerId, "core.valkyrie-maiden-descent");
  assert.equal(built.skills.get(SWAN).handlerId, "core.valkyrie-swan-dress");
});

test("Maiden Descent moves all three Commanders from any zones to chosen hand/attack destinations without play effects", () => {
  const { engine, state } = setup("valkyrie-descent");
  seedCommanders(state);
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "v";

  let result = engine.execute(state, command(state, "valkyrie-descent-use", CommandType.UseSkill, "v", {
    skillId: DESCENT, data: { abilityId: "maiden-descent" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "valkyrie-maiden-descent");
  assert.equal(result.state.players.v.trueNameRevealed, true);
  result = engine.execute(result.state, command(result.state, "valkyrie-descent-resolve", CommandType.ResolveDecision, "v", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: [
      `${COMMANDERS[0]}::attack`,
      `${COMMANDERS[1]}::hand`,
      `${COMMANDERS[2]}::attack`,
    ],
  }));

  assert.equal(result.state.cards.ortlinde.zone, "attack");
  assert.equal(result.state.cards.ortlinde.active, true);
  assert.equal(result.state.cards.thrud.zone, "attack");
  assert.equal(result.state.cards.thrud.active, true);
  assert.equal(result.state.cards.hildr.zone, "hand");
  assert.equal(result.state.cards.hildr.active, false);
  assert.equal(result.state.cards.ortlinde.paidCost, 0);
  assert.equal(result.state.cards.thrud.paidCost, 0);
  assert.equal(result.state.cards.ortlinde.powerModifiers?.some((modifier) => modifier.id.startsWith("structured-play-power:")) ?? false, false);
  assert.equal(result.state.cards.thrud.powerModifiers?.some((modifier) => modifier.id.startsWith("structured-play-power:")) ?? false, false);
});

test("Swan Dress active card moves exactly one arrow in action and combat phases", () => {
  const { engine, state } = setup("valkyrie-swan-move");
  createOwnedCardInstance(state, "v", { instanceId: "swan", definitionId: SWAN, zone: "attack", face: "up", active: true });
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "v";

  let result = engine.execute(state, command(state, "valkyrie-swan-action", CommandType.UseSkill, "v", {
    skillId: SWAN, data: { abilityId: "swan-move-action" },
  }));
  assert.equal(result.state.players.v.locationId, "city");

  result.state.phase = "combat";
  result.state.step = "player-window";
  result.state.activePlayerId = "v";
  result = engine.execute(result.state, command(result.state, "valkyrie-swan-combat", CommandType.UseSkill, "v", {
    skillId: SWAN, data: { abilityId: "swan-move-combat" },
  }));
  assert.equal(result.state.players.v.locationId, "scouting");
});

test("Steel Shield pays Swan Dress current cost, returns one active Commander to hand, then joins Swan Dress without a play trigger", () => {
  const { engine, state } = setup("valkyrie-steel-shield");
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "v";
  state.players.v.mana = 5;
  createOwnedCardInstance(state, "v", { instanceId: "swan", definitionId: SWAN, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "v", { instanceId: "hildr", definitionId: COMMANDERS[1], zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "valkyrie-steel-shield-use", CommandType.UseSkill, "v", {
    skillId: SWAN, data: { abilityId: "steel-shield", commanderInstanceId: "hildr" },
  }));
  assert.equal(result.state.players.v.mana, 3);
  assert.equal(result.state.cards.hildr.zone, "hand");
  assert.equal(result.state.cards.hildr.active, false);
  assert.equal(result.state.cards.swan.zone, "attack");
  assert.equal(result.state.cards.swan.active, true);
  assert.equal(result.state.cards.swan.paidCost, 0);
  assert.equal(result.state.cards.swan.playCount ?? 0, 0);
});
