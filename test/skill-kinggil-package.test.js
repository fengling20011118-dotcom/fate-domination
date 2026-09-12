import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { closePlayerCard, createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";

const CASTER_CLASS = "servant.kinggil.skill.sc-kinggil-1";
const GATE = "servant.kinggil.skill.sc-kinggil-2";
const MELAMMU = "servant.kinggil.skill.sc-kinggil-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "kinggil") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "g", name: "Gil" }, { id: "o", name: "Opponent" }], seed: 223 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "g";
  state.turnOrder = ["g", "o"];
  state.players.g.servantId = "servant.kinggil";
  state.players.g.mana = 20;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["g"];
  state.board.locations.city = ["o"];
  state.board.locations.scouting = [];
  state.players.g.locationId = "mountain";
  state.players.o.locationId = "city";
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

test("King Gil package: all three skills are FULL", () => {
  const { built } = setup("kinggil-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.kinggil");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(GATE).handlerId, "core.king-gil-gate-of-babylon");
  assert.equal(built.skills.get(MELAMMU).handlerId, "core.king-gil-melammu-dingir");
});

test("Gate of Babylon discards the whole hand, gains all discarded attributes until closed, and doubles its combat power", () => {
  const { built, engine, definitions, state } = setup("kinggil-gate");
  createOwnedCardInstance(state, "g", { instanceId: "gate", definitionId: GATE, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "g", { instanceId: "b", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "g", { instanceId: "q", definitionId: "card.cardq1", zone: "hand", face: "down", active: false });

  const result = engine.execute(state, command(state, "gate-attrs", CommandType.UseSkill, "g", {
    skillId: GATE,
    data: { abilityId: "treasury-attributes" },
  }));
  assert.deepEqual(result.state.players.g.hand, []);
  assert.equal(result.state.cards.b.zone, "discard");
  assert.equal(result.state.cards.q.zone, "discard");
  const attrs = getCardInstanceAttributes(result.state.cards.gate, definitions[GATE]);
  assert.ok(attrs.includes("宝具"));
  assert.ok(attrs.includes("力量"));
  assert.ok(attrs.includes("迅捷"));
  assert.equal(calculateCombatCardPower(result.state, result.state.players.g, "gate", definitions, "mountain"), 3);
  result.state.phase = "combat";
  assert.equal(calculateCombatCardPower(result.state, result.state.players.g, "gate", definitions, "mountain"), 6);

  closePlayerCard(result.state, "g", "gate", definitions);
  assert.equal(result.state.cards.gate.attributeOverrides, undefined);
  assert.deepEqual(getCardInstanceAttributes(result.state.cards.gate, definitions[GATE]), ["宝具"]);
  assert.ok(!built.skills.getLegalActions(result.state, "g", definitions).some((action) => action.payload?.skillId === GATE));
});

test("Melammu Dingir cannot be played without active Caster Class and consumes one active Caster Class when played", () => {
  const { definitions, state } = setup("kinggil-melammu-prereq");
  state.step = "play-batch-draft";
  createOwnedCardInstance(state, "g", { instanceId: "melammu", definitionId: MELAMMU, zone: "servant-skills", face: "down", active: false });
  createOwnedCardInstance(state, "g", { instanceId: "basic", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  assert.throws(() => commitStandardAttack(state, "g", ["melammu", "basic"], [], definitions), /CARD_PLAY_PREREQUISITE_MISSING/);

  createOwnedCardInstance(state, "g", { instanceId: "caster", definitionId: CASTER_CLASS, zone: "attack", face: "up", active: true, residual: true });
  const played = commitStandardAttack(state, "g", ["melammu", "basic"], [], definitions);
  assert.deepEqual(played.committed, ["melammu", "basic"]);
  assert.equal(state.cards.caster.zone, "servant-skills");
  assert.equal(state.cards.caster.active, false);
  assert.equal(state.cards.melammu.zone, "attack");
  assert.equal(state.cards.melammu.active, true);
});

test("Melammu Dingir next round offers 0..2 extra Prep draws and permits 0..1 extra standard attack card", () => {
  const { engine, definitions, state } = setup("kinggil-melammu-next-round");
  createOwnedCardInstance(state, "g", { instanceId: "melammu", definitionId: MELAMMU, zone: "attack", face: "up", active: true });
  emitPassive(engine, state, definitions, "card.played", { playerId: "g", instanceId: "melammu", definitionId: MELAMMU, face: "up" });
  assert.equal(state.players.g.flags.kingGilMelammuPendingRound, 5);

  state.round = 5;
  state.phase = "preparation";
  state.step = "player-window";
  createOwnedCardInstance(state, "g", { instanceId: "draw1", definitionId: "card.cardb1", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "g", { instanceId: "draw2", definitionId: "card.cardq1", zone: "deck", face: "down", active: false });
  state.players.g.deck = ["draw1", "draw2"];
  emitPassive(engine, state, definitions, "round.started", { round: 5, phase: "preparation", activePlayerId: "g" });
  assert.equal(state.pendingDecision?.kind, "king-gil-melammu-prep-draw");
  assert.deepEqual(state.pendingDecision?.options.map((option) => option.id), ["0", "1", "2"]);
  assert.equal(state.players.g.flags.optionalExtraStandardAttackCards, 1);

  let result = engine.execute(state, command(state, "melammu-draw", CommandType.ResolveDecision, "g", {
    decisionId: state.pendingDecision.decisionId,
    selections: ["2"],
  }));
  assert.equal(result.state.players.g.hand.length, 2);
  assert.equal(result.state.players.g.deck.length, 0);

  result.state.phase = "action";
  result.state.step = "play-batch-draft";
  result.state.activePlayerId = "g";
  for (const [id, definitionId] of [["a", "card.cardb1"], ["b", "card.cardq1"], ["c", "card.carda1"], ["d", "card.cardluck"]]) {
    createOwnedCardInstance(result.state, "g", { instanceId: id, definitionId, zone: "hand", face: "down", active: false });
  }
  assert.doesNotThrow(() => commitStandardAttack(structuredClone(result.state), "g", ["a", "b", "c"], [], definitions));
  assert.throws(() => commitStandardAttack(structuredClone(result.state), "g", ["a", "b", "c", "d"], [], definitions), /STANDARD_ATTACK_CARD_COUNT_INVALID/);
});
