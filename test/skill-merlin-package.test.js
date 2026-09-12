import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const CHARISMA = "servant.merlin.skill.sc-merlin-1";
const FLOWER_SEA = "servant.merlin.skill.sc-merlin-2";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "merlin") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "m", name: "Merlin" }, { id: "o", name: "Opponent" }], seed: 3001 });
  state.status = "playing";
  state.round = 4;
  state.turnOrder = ["m", "o"];
  state.players.m.servantId = "servant.merlin";
  state.players.m.mana = 10;
  state.players.m.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["m", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, engine, definitions, state };
}

function triggerGameStarted(engine, state, definitions) {
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:game-started`, sourceCommandId: "test", revision: state.revision,
    type: "game.started", payload: {},
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Merlin package: all three skills are FULL", () => {
  const { built } = setup("merlin-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.merlin");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(CHARISMA).handlerId, "core.game-start-rule-flags");
  assert.equal(built.skills.get(FLOWER_SEA).handlerId, "core.merlin-flower-sea");
});

test("Dreamlike Charisma reverses action order generically and movement ignores engagement", () => {
  const { engine, definitions, state } = setup("merlin-charisma");
  triggerGameStarted(engine, state, definitions);
  assert.equal(state.players.m.flags.actionPlayBeforeMove, true);
  assert.equal(state.players.m.flags.ignoreEngagement, true);

  state.turnOrder = ["m"];
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "m";
  state.modeState.phaseStartPlayerId = "m";
  let result = engine.execute(state, command(state, "merlin-enter-action", CommandType.CompletePlayerWindow, "m"));
  assert.equal(result.state.phase, "action");
  assert.equal(result.state.step, "play-batch-draft");

  createOwnedCardInstance(result.state, "m", { instanceId: "basic-up", definitionId: "card.cardb1", zone: "hand" });
  createOwnedCardInstance(result.state, "m", { instanceId: "basic-down", definitionId: "card.cardq1", zone: "hand" });
  result = engine.execute(result.state, command(result.state, "merlin-play-first", CommandType.CommitAttack, "m", {
    faceUpInstanceIds: ["basic-up"], faceDownInstanceIds: ["basic-down"],
  }));
  assert.equal(result.state.step, "move-decision");

  result = engine.execute(result.state, command(result.state, "merlin-move-engaged", CommandType.MovePlayer, "m", { locationId: "city" }));
  assert.equal(result.state.players.m.locationId, "city");
  assert.equal(result.state.step, "settlement");
});

test("Flower Sea freely chooses X and zeros every other same-battlefield attack with current mana cost X", () => {
  const { engine, definitions, state } = setup("merlin-flower-sea-two");
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "m";
  createOwnedCardInstance(state, "m", { instanceId: "flower-sea", definitionId: FLOWER_SEA, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "m", { instanceId: "own-cost-two", definitionId: "card.card-cover", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "opp-cost-two", definitionId: "card.card-cover", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "opp-cost-zero", definitionId: "card.cardb2", zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "merlin-illusion-two", CommandType.UseSkill, "m", {
    skillId: FLOWER_SEA, data: { abilityId: "illusion", x: 2 },
  }));
  assert.equal(calculateCombatCardPower(result.state, result.state.players.m, "own-cost-two", definitions), 0);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "opp-cost-two", definitions), 0);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "opp-cost-zero", definitions), definitions["card.cardb2"].basePower);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.m, "flower-sea", definitions), 3);
  assert.equal(result.state.players.m.mana, 10);
});

test("Flower Sea X=0 loses up to 5 mana and zeros cost-0 attacks without zeroing itself", () => {
  const { engine, definitions, state } = setup("merlin-flower-sea-zero");
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "m";
  state.players.m.mana = 3;
  createOwnedCardInstance(state, "m", { instanceId: "flower-sea", definitionId: FLOWER_SEA, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "opp-cost-zero", definitionId: "card.cardb2", zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "merlin-illusion-zero", CommandType.UseSkill, "m", {
    skillId: FLOWER_SEA, data: { abilityId: "illusion", x: 0 },
  }));
  assert.equal(result.state.players.m.mana, 0);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "opp-cost-zero", definitions), 0);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.m, "flower-sea", definitions), 3);
});
