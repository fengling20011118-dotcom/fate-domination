import test from "node:test";
import assert from "node:assert/strict";

import content from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance, closePlayerCard } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

function command(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function definitions(built) {
  return { ...built.cards, ...built.skills.asCardDefinitions() };
}

test("batch022 EndRound pauses at combat.ending decision and resumes without replaying the event", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  let state = createGameState({ gameInstanceId: "batch022-end-checkpoint", players: [{ id: "araya", name: "araya" }, { id: "other", name: "other" }], seed: 2201 });
  state.status = "playing"; state.round = 3; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
  state.modeState.resolvedCombats = ["mountain", "city"];
  state.players.araya.masterId = "master.araya"; state.players.araya.mana = 1;
  createOwnedCardInstance(state, "araya", { instanceId: "origin-stillness", definitionId: "master.araya.skill.s1a", zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(state, "araya", { instanceId: "basic-five", definitionId: "card.cardb4", zone: "attack", face: "up", active: true });
  state.cards["basic-five"].playedRound = 3;

  let result = engine.execute(state, command(state, "end-open", CommandType.EndRound, "araya", {}));
  assert.equal(result.state.round, 3);
  assert.equal(result.state.pendingDecision?.kind, "structured-private-card-choice");
  assert.deepEqual(result.state.pendingDecision?.options.map((option) => option.id), ["basic-five"]);
  assert.equal(result.events.filter((event) => event.type === "combat.ending").length, 1);
  assert.equal(result.state.modeState.endRoundCheckpoint?.stage, "after-combat-ending");

  state = result.state;
  result = engine.execute(state, command(state, "end-choice", CommandType.ResolveDecision, "araya", {
    decisionId: state.pendingDecision.decisionId,
    selections: ["basic-five"],
  }));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.cards["basic-five"].zone, "deck");
  assert.equal(result.state.players.araya.mana, 3); // printed cost 1 * 2

  state = result.state;
  result = engine.execute(state, command(state, "end-resume", CommandType.EndRound, "araya", {}));
  assert.equal(result.events.some((event) => event.type === "combat.ending"), false);
  assert.equal(result.state.modeState.endRoundCheckpoint, undefined);
});

test("batch022 Araya Origin Stillness skips cleanly when there is no active basic attack", () => {
  const built = buildStandardContent(content); const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch022-araya-none", players: [{ id: "araya", name: "araya" }, { id: "other", name: "other" }], seed: 2202 });
  state.status = "playing"; state.round = 3; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
  state.modeState.resolvedCombats = ["mountain", "city"]; state.players.araya.masterId = "master.araya";
  createOwnedCardInstance(state, "araya", { instanceId: "origin-stillness", definitionId: "master.araya.skill.s1a", zone: "master-skills", face: "up", active: false });
  const result = engine.execute(state, command(state, "end-no-card", CommandType.EndRound, "araya", {}));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.modeState.endRoundCheckpoint, undefined);
});

test("batch022 Napoleon draws then plays the selected hand card through normal card rules", () => {
  const built = buildStandardContent(content); const engine = new StandardMatchEngine(built);
  let state = createGameState({ gameInstanceId: "batch022-napoleon", players: [{ id: "nap", name: "nap" }, { id: "opp", name: "opp" }], seed: 2203 });
  state.status = "playing"; state.round = 4; state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "nap";
  state.players.nap.servantId = "servant.napoleon"; state.players.nap.locationId = "mountain"; state.players.nap.mana = 5; state.players.nap.victoryPoints = 1;
  state.players.opp.locationId = "mountain"; state.players.opp.victoryPoints = 5; state.board.locations.mountain = ["nap", "opp"];
  createOwnedCardInstance(state, "nap", { instanceId: "rainbow-bow", definitionId: "servant.napoleon.skill.sc-napoleon-2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "nap", { instanceId: "drawn-card", definitionId: "card.cardb4", zone: "deck", face: "down", active: false });

  let result = engine.execute(state, command(state, "nap-open", CommandType.UseSkill, "nap", { skillId: "servant.napoleon.skill.sc-napoleon-2", data: { abilityId: "light-of-possibility" } }));
  assert.equal(result.state.pendingDecision?.kind, "structured-private-card-choice");
  assert.deepEqual(result.state.pendingDecision?.options.map((option) => option.id), ["drawn-card"]);
  state = result.state;
  result = engine.execute(state, command(state, "nap-play", CommandType.ResolveDecision, "nap", { decisionId: state.pendingDecision.decisionId, selections: ["drawn-card"] }));
  assert.equal(result.state.cards["drawn-card"].zone, "attack");
  assert.equal(result.state.cards["drawn-card"].active, true);
  assert.equal(result.state.players.nap.mana, 4);
  assert.ok(result.events.some((event) => event.type === "card.played" && event.payload.instanceId === "drawn-card" && event.payload.method === "effect"));
  assert.ok(result.events.some((event) => event.type === "card.used" && event.payload.instanceId === "drawn-card" && event.payload.method === "effect"));
});

test("batch022 Darius Underworld Gate gives Undead +1 and forbids closing only this round", () => {
  const built = buildStandardContent(content); const defs = definitions(built); const engine = new StandardMatchEngine(built);
  let state = createGameState({ gameInstanceId: "batch022-darius", players: [{ id: "d", name: "d" }], seed: 2204 });
  state.status = "playing"; state.round = 5; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "d"; state.players.d.servantId = "servant.darius";
  createOwnedCardInstance(state, "d", { instanceId: "gate", definitionId: "servant.darius.skill.sc-darius-2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "d", { instanceId: "undead", definitionId: "servant.darius.skill.sc-darius-4", zone: "attack", face: "up", active: true });
  const before = calculateCombatCardPower(state, state.players.d, "undead", defs);
  const result = engine.execute(state, command(state, "darius-gate", CommandType.UseSkill, "d", { skillId: "servant.darius.skill.sc-darius-2", data: { abilityId: "open-underworld-gate" } }));
  state = result.state;
  assert.equal(calculateCombatCardPower(state, state.players.d, "undead", defs), before + 1);
  assert.throws(() => closePlayerCard(state, "d", "undead", defs), /CARD_CLOSE_FORBIDDEN_BY_RULE/);
  state.round = 6;
  closePlayerCard(state, "d", "undead", defs);
  assert.equal(state.cards.undead.active, false);
});
