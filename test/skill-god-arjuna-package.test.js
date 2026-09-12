import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { endStandardRound, startStandardRound } from "../src/rules-core/rounds.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { GOD_ARJUNA_JUDGMENT_ID, GOD_ARJUNA_RESET_ID, GOD_ARJUNA_SUPREME_ID } from "../src/rules-core/god-arjuna.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "god-arjuna-package") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "a", name: "God Arjuna" }, { id: "f", name: "Flawed" }, { id: "l", name: "Lucky Flawed" }], seed: 7007 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = ["a", "f", "l"];
  state.players.a.servantId = "servant.arjuna";
  state.players.a.mana = 12;
  state.players.f.mana = 12;
  state.players.l.mana = 12;
  state.players.a.locationId = "mountain";
  state.players.f.locationId = "mountain";
  state.players.l.locationId = "mountain";
  state.board.locations = { workshop: [], mountain: ["a", "f", "l"], city: [], scouting: [] };
  state.board.outpostRecords = { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] };
  createOwnedCardInstance(state, "a", { instanceId: "supreme", definitionId: GOD_ARJUNA_SUPREME_ID, zone: "removed", face: "down", active: false });
  createOwnedCardInstance(state, "a", { instanceId: "reset", definitionId: GOD_ARJUNA_RESET_ID, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "judgment", definitionId: GOD_ARJUNA_JUDGMENT_ID, zone: "attack", face: "up", active: true });
  return { built, engine, definitions, state };
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload) {
  passiveCounter += 1;
  enqueuePassiveEffects(state, engine.passives, { eventId: `${state.gameInstanceId}:${type}:${passiveCounter}`, sourceCommandId: "test", revision: state.revision, type, payload });
  engine.effects.drain(state, 1000, definitions);
}

test("God Arjuna package is 3/3 FULL", () => {
  const { built } = setup("god-arjuna-full");
  assert.ok([GOD_ARJUNA_SUPREME_ID, GOD_ARJUNA_RESET_ID, GOD_ARJUNA_JUDGMENT_ID].every((id) => built.skills.get(id).supportLevel === "FULL"));
  assert.equal(built.skills.get(GOD_ARJUNA_RESET_ID).handlerId, "core.god-arjuna-world-reset");
  assert.equal(built.skills.get(GOD_ARJUNA_JUDGMENT_ID).handlerId, "core.god-arjuna-imperfection-is-sin");
});

test("World Reset carries a current event into the next Prep and returns the selected removed skill", () => {
  const { built, engine, definitions, state } = setup("god-arjuna-reset");
  const [carry, other, ...restEvents] = built.events;
  const [nextSituation] = built.situations;
  assert.ok(carry && other && nextSituation);
  state.board.currentEvents = { mountain: [carry.id], city: [other.id] };
  state.board.eventVisibility = { [carry.id]: "up", [other.id]: "down" };
  state.board.eventDeck = restEvents.map((event) => event.id);
  state.board.eventDiscard = [];
  state.board.eventRemoved = [];
  state.board.situationDeck = [nextSituation.id];

  let result = engine.execute(state, command(state, "reset-use", CommandType.UseSkill, "a", { skillId: GOD_ARJUNA_RESET_ID, data: { abilityId: "world-reset" } }));
  assert.equal(result.state.pendingDecision?.kind, "god-arjuna-world-reset-event");
  result = engine.execute(result.state, command(result.state, "reset-event", CommandType.ResolveDecision, "a", { decisionId: result.state.pendingDecision.decisionId, selections: [carry.id] }));
  assert.equal(result.state.pendingDecision?.kind, "god-arjuna-world-reset-location");
  result = engine.execute(result.state, command(result.state, "reset-location", CommandType.ResolveDecision, "a", { decisionId: result.state.pendingDecision.decisionId, selections: ["city"] }));
  assert.equal(result.state.pendingDecision?.kind, "god-arjuna-world-reset-return");
  result = engine.execute(result.state, command(result.state, "reset-return", CommandType.ResolveDecision, "a", { decisionId: result.state.pendingDecision.decisionId, selections: [GOD_ARJUNA_SUPREME_ID] }));
  assert.equal(result.state.modeState.pendingRoundEventPlacements.length, 1);
  assert.equal(result.state.modeState.pendingRoundCardReturns.length, 1);

  const current = result.state;
  endStandardRound(current, definitions);
  assert.ok(current.board.eventDiscard.includes(carry.id));
  assert.equal(current.cards.supreme.zone, "removed");
  startStandardRound(current, built.situations, built.events, () => 0, definitions);
  assert.equal(current.round, 5);
  assert.ok(current.board.currentEvents.city.includes(carry.id));
  assert.ok(!current.board.eventDiscard.includes(carry.id));
  assert.equal(current.cards.supreme.zone, "servant-skills");
  assert.ok(current.players.a.servantSkills.includes("supreme"));
  assert.equal(current.modeState.pendingRoundEventPlacements, undefined);
  assert.equal(current.modeState.pendingRoundCardReturns, undefined);
});

test("Imperfection is Sin defeats all flawed opponents at combat start and loses 5 power per flawed Luck controller", () => {
  const { engine, definitions, state } = setup("god-arjuna-judgment");
  state.players.f.statuses.push("flawed:supreme");
  state.players.l.statuses.push("flawed:supreme");
  createOwnedCardInstance(state, "l", { instanceId: "luck", definitionId: "card.cardluck", zone: "attack", face: "up", active: true });

  let result = engine.execute(state, command(state, "judgment-use", CommandType.UseSkill, "a", { skillId: GOD_ARJUNA_JUDGMENT_ID, data: { abilityId: "imperfection-is-sin" } }));
  assert.equal(result.state.players.a.flags.godArjunaJudgmentArmedRound, 4);
  result.state.phase = "combat";
  emitPassive(engine, result.state, definitions, "phase.transitioned", { previousPhase: "action", transition: "next-phase" });
  assert.equal(result.state.players.f.defeated, true);
  assert.equal(result.state.players.l.defeated, true);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.a, "judgment", definitions, "mountain"), 10);
});
