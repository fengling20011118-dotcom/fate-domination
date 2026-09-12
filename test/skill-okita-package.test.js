import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";

const SINCERITY = "servant.okita.skill.sc-okita-1";
const THREE_STAGE = "servant.okita.skill.sc-okita-2";
const HAORI = "servant.okita.skill.sc-okita-3";
const WEAK = "servant.okita.skill.sc-okita-4";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "okita") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "o", name: "Okita" }, { id: "e", name: "Enemy" }], seed: 1919 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "o";
  state.turnOrder = ["o", "e"];
  state.players.o.servantId = "servant.okita";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["o"];
  state.board.locations.city = ["e"];
  state.board.locations.scouting = [];
  state.players.o.locationId = "mountain";
  state.players.e.locationId = "city";
  return { built, engine, definitions, state };
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload = {}) {
  passiveCounter += 1;
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${passiveCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Okita package: all four skills are FULL", () => {
  const { built } = setup("okita-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.okita");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(SINCERITY).handlerId, "core.okita-sincerity-flag");
  assert.equal(built.skills.get(THREE_STAGE).handlerId, "core.create-temporary-attacks");
  assert.equal(built.skills.get(HAORI).handlerId, "core.okita-haori");
  assert.equal(built.skills.get(WEAK).handlerId, "core.okita-weak-constitution");
});

test("Sincerity Flag face-up plays one hand card, draws one, and can repeat exactly three times per round", () => {
  const { engine, state } = setup("okita-sincerity");
  state.players.o.mana = 10;
  createOwnedCardInstance(state, "o", { instanceId: "sincerity", definitionId: SINCERITY, zone: "attack", face: "up", active: true });
  for (let i = 1; i <= 3; i += 1) createOwnedCardInstance(state, "o", { instanceId: `hand-${i}`, definitionId: "card.cardb2", zone: "hand", face: "down", active: false });
  for (let i = 1; i <= 4; i += 1) createOwnedCardInstance(state, "o", { instanceId: `draw-${i}`, definitionId: "card.cardq2", zone: "deck", face: "down", active: false });

  let current = state;
  for (let i = 1; i <= 3; i += 1) {
    let result = engine.execute(current, command(current, `sincerity-open-${i}`, CommandType.UseSkill, "o", {
      skillId: SINCERITY,
      data: { abilityId: "sincerity-play-and-draw" },
    }));
    assert.equal(result.state.pendingDecision?.kind, "okita-sincerity-card");
    const selected = `hand-${i}`;
    assert.ok(result.state.pendingDecision.options.some((option) => option.id === selected));
    const handBefore = result.state.players.o.hand.length;
    result = engine.execute(result.state, command(result.state, `sincerity-pick-${i}`, CommandType.ResolveDecision, "o", {
      decisionId: result.state.pendingDecision.decisionId,
      selections: [selected],
    }));
    assert.equal(result.state.cards[selected].zone, "attack");
    assert.equal(result.state.cards[selected].face, "up");
    assert.equal(result.state.cards[selected].active, true);
    assert.equal(result.state.players.o.hand.length, handBefore); // played one, drew one
    current = result.state;
  }
  assert.equal(current.players.o.flags.okitaSincerityCount, 3);
  assert.equal(current.players.o.flags.okitaSincerityRound, 4);
  assert.throws(() => engine.execute(current, command(current, "sincerity-fourth", CommandType.UseSkill, "o", {
    skillId: SINCERITY,
    data: { abilityId: "sincerity-play-and-draw" },
  })), /SKILL_USE_FORBIDDEN/);
});

test("Weak Constitution installs a generic exile-to-discard replacement on the physical Weak card", () => {
  const { engine, definitions, state } = setup("okita-weak-exile");
  createOwnedCardInstance(state, "o", { instanceId: "weak", definitionId: "card.x-weak", zone: "hand", face: "down", active: false });
  emitPassive(engine, state, definitions, "game.started", { round: 4, phase: "action", activePlayerId: "o" });
  assert.equal(state.cards.weak.zoneMoveReplacement?.replacementDestination, "discard");
  movePlayerCard(state, "o", "weak", "removed");
  assert.equal(state.cards.weak.zone, "discard");
  assert.ok(state.players.o.discard.includes("weak"));
  assert.equal(state.players.o.hand.includes("weak"), false);
});

test("Weak Constitution is force-revealed when its owner fights, sets final combat power to zero, then is discarded", () => {
  const { engine, definitions, state } = setup("okita-weak-combat");
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  state.board.locations.mountain = ["o", "e"];
  state.board.locations.city = [];
  state.players.e.locationId = "mountain";
  state.players.o.flags.roundPowerBonus = 20;
  createOwnedCardInstance(state, "o", { instanceId: "weak", definitionId: "card.x-weak", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "okita-high", definitionId: "card.cardq4", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "e", { instanceId: "enemy-low", definitionId: "card.cardq2", zone: "attack", face: "up", active: true });
  emitPassive(engine, state, definitions, "game.started", { round: 4, phase: "combat", activePlayerId: null });

  const result = engine.execute(state, command(state, "okita-weak-fight", CommandType.ResolveCombat, "o", { locationId: "mountain" }));
  const combat = result.events.find((event) => event.type === "combat.resolved");
  assert.equal(combat?.payload.powers.o, 0);
  assert.equal(combat?.payload.powers.e, 3);
  assert.deepEqual(combat?.payload.winnerIds, ["e"]);
  assert.equal(result.state.cards.weak.zone, "discard");
  assert.equal(result.state.cards.weak.face, "down");
  assert.equal(result.state.players.o.hand.includes("weak"), false);
});
