import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

const DIVINE_CORE = "servant.stheno.skill.sc-stheno-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "stheno-package", twoOpponents = false) {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const players = [{ id: "s", name: "Stheno" }, { id: "a", name: "A" }];
  if (twoOpponents) players.push({ id: "b", name: "B" });
  const state = createGameState({ gameInstanceId: id, players, seed: 8080 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.turnOrder = twoOpponents ? ["s", "a", "b"] : ["s", "a"];
  state.players.s.servantId = "servant.stheno";
  for (const playerId of state.turnOrder) state.players[playerId].locationId = "mountain";
  state.board.locations.mountain = [...state.turnOrder];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  createOwnedCardInstance(state, "s", { instanceId: "divine-core", definitionId: DIVINE_CORE, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "s", { instanceId: "luck", definitionId: "card.cardluck", zone: "hand", face: "down", active: false });
  return { built, engine, state };
}

test("Stheno package is fully migrated and Goddess's Conceit is not once per game", () => {
  const { built } = setup("stheno-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.stheno");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  const divineCore = built.skills.get(DIVINE_CORE);
  assert.equal(divineCore.handlerId, "core.stheno-divine-core");
  assert.equal(divineCore.limit, undefined);
  assert.equal(divineCore.requiresActiveCard, true);
});

test("Goddess's Conceit discards Luck, excludes once-per-game attacks, then closes at most one eligible attack", () => {
  const { built, engine, state } = setup("stheno-close");
  engine.dynamicCards["test.stheno.normal"] = { id: "test.stheno.normal", name: "Normal", cost: 4, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true };
  engine.dynamicCards["test.stheno.once"] = { id: "test.stheno.once", name: "Once", cost: 7, basePower: 7, typeLabel: "宝具", attributes: ["宝具"], basic: false, limit: "once-per-game" };
  createOwnedCardInstance(state, "a", { instanceId: "normal", definitionId: "test.stheno.normal", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "once", definitionId: "test.stheno.once", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "drawn", definitionId: "card.cardb2", zone: "deck", face: "down", active: false });
  state.players.a.mana = 0;

  const opened = engine.execute(state, command(state, "conceit", CommandType.UseSkill, "s", { skillId: DIVINE_CORE, data: { abilityId: "goddess-conceit" } }));
  assert.equal(opened.state.cards.luck.zone, "discard");
  assert.equal(opened.state.pendingDecision?.kind, "stheno-divine-core-close-attack");
  assert.ok(opened.state.pendingDecision.options.some((option) => option.id === "normal"));
  assert.ok(opened.state.pendingDecision.options.some((option) => option.id === "skip"));
  assert.ok(!opened.state.pendingDecision.options.some((option) => option.id === "once"));

  const closed = engine.execute(opened.state, command(opened.state, "close-normal", CommandType.ResolveDecision, "s", {
    decisionId: opened.state.pendingDecision.decisionId,
    selections: ["normal"],
  }));
  assert.equal(closed.state.cards.normal.active, false);
  assert.equal(closed.state.players.a.mana, 4);
  assert.equal(closed.state.cards.drawn.zone, "hand");
  assert.equal(closed.state.pendingDecision?.kind, "stheno-divine-core-play-drawn");
  assert.equal(closed.state.pendingDecision?.chooserPlayerIds[0], "a");
});

test("affected opponents may play the exact drawn card in turn order and receive the action-in-combat permission", () => {
  const { engine, state } = setup("stheno-play");
  engine.dynamicCards["test.stheno.close"] = { id: "test.stheno.close", name: "CloseMe", cost: 2, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true };
  createOwnedCardInstance(state, "a", { instanceId: "close-me", definitionId: "test.stheno.close", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "drawn", definitionId: "card.cardb2", zone: "deck", face: "down", active: false });
  state.players.a.mana = 10;

  let result = engine.execute(state, command(state, "conceit-play", CommandType.UseSkill, "s", { skillId: DIVINE_CORE, data: { abilityId: "goddess-conceit" } }));
  result = engine.execute(result.state, command(result.state, "close", CommandType.ResolveDecision, "s", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["close-me"],
  }));
  assert.equal(result.state.pendingDecision?.chooserPlayerIds[0], "a");
  result = engine.execute(result.state, command(result.state, "play-drawn", CommandType.ResolveDecision, "a", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["play"],
  }));
  assert.equal(result.state.cards.drawn.zone, "attack");
  assert.equal(result.state.cards.drawn.active, true);
  assert.ok(result.state.players.a.cardRuleModifiers?.some((modifier) => modifier.targetInstanceIds?.includes("drawn") && modifier.allowActionAbilityInCombat === true));
});

test("multiple affected opponents receive their post-draw play choice in round turn order", () => {
  const { engine, state } = setup("stheno-order", true);
  engine.dynamicCards["test.stheno.close"] = { id: "test.stheno.close", name: "CloseMe", cost: 1, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true };
  for (const id of ["a", "b"]) {
    createOwnedCardInstance(state, id, { instanceId: `${id}-close`, definitionId: "test.stheno.close", zone: "attack", face: "up", active: true });
    createOwnedCardInstance(state, id, { instanceId: `${id}-draw`, definitionId: "card.cardb2", zone: "deck", face: "down", active: false });
    state.players[id].mana = 10;
  }
  let result = engine.execute(state, command(state, "conceit-order", CommandType.UseSkill, "s", { skillId: DIVINE_CORE, data: { abilityId: "goddess-conceit" } }));
  assert.equal(result.state.pendingDecision?.kind, "stheno-divine-core-close-attack");
  result = engine.execute(result.state, command(result.state, "close-a", CommandType.ResolveDecision, "s", { decisionId: result.state.pendingDecision.decisionId, selections: ["a-close"] }));
  assert.equal(result.state.pendingDecision?.kind, "stheno-divine-core-close-attack");
  result = engine.execute(result.state, command(result.state, "close-b", CommandType.ResolveDecision, "s", { decisionId: result.state.pendingDecision.decisionId, selections: ["b-close"] }));
  assert.equal(result.state.pendingDecision?.kind, "stheno-divine-core-play-drawn");
  assert.equal(result.state.pendingDecision?.chooserPlayerIds[0], "a");
  result = engine.execute(result.state, command(result.state, "skip-a", CommandType.ResolveDecision, "a", { decisionId: result.state.pendingDecision.decisionId, selections: ["skip"] }));
  assert.equal(result.state.pendingDecision?.chooserPlayerIds[0], "b");
});
