import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { claimAllBattlefieldAdvantages, movePlayerByEffect } from "../src/rules-core/board.ts";

const CONTINUATION = "servant.jaguarman.skill.sc-jaguarman-1";
const DARK_FOREST = "servant.jaguarman.skill.sc-jaguarman-2";
const DEATH_CLAW = "servant.jaguarman.skill.sc-jaguarman-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "jaguarman-package", players = [{ id: "j", name: "Jaguarman" }, { id: "o", name: "Opponent" }]) {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players, seed: 1717 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "j";
  state.players.j.servantId = "servant.jaguarman";
  state.board.locations.workshop = [];
  state.board.locations.mountain = [];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, engine, state };
}

function definitions(built) {
  return { ...built.cards, ...built.skills.asCardDefinitions() };
}

function place(state, playerId, locationId) {
  for (const location of Object.keys(state.board.locations)) state.board.locations[location] = state.board.locations[location].filter((id) => id !== playerId);
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

test("Jaguarman package: all three skills are FULL with concrete handlers", () => {
  const { built } = setup("jaguarman-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.jaguarman");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(CONTINUATION).handlerId, "core.move-to-non-workshop");
  assert.equal(built.skills.get(DARK_FOREST).handlerId, "core.jaguarman-dark-forest");
  assert.equal(built.skills.get(DEATH_CLAW).handlerId, "core.jaguarman-death-claw");
});

test("Dark Forest may join the attack for free when Jaguarman enters Scouting and becomes residual", () => {
  const { engine, state } = setup("jaguarman-scouting-join");
  place(state, "j", "city");
  place(state, "o", "mountain");
  state.players.j.mana = 10;
  state.step = "move-decision";
  createOwnedCardInstance(state, "j", { instanceId: "dark-forest", definitionId: DARK_FOREST, zone: "servant-skills", face: "up", active: false });

  let result = engine.execute(state, command(state, "jaguarman-enter-scouting", CommandType.MovePlayer, "j", { locationId: "scouting" }));
  assert.equal(result.state.pendingDecision?.kind, "jaguarman-dark-forest-join");
  assert.equal(result.state.pendingDecision?.allowCancel, true);
  const manaAfterMove = result.state.players.j.mana;
  result = engine.execute(result.state, command(result.state, "jaguarman-join-forest", CommandType.ResolveDecision, "j", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["dark-forest"],
  }));
  assert.equal(result.state.cards["dark-forest"].zone, "attack");
  assert.equal(result.state.cards["dark-forest"].active, true);
  assert.equal(result.state.cards["dark-forest"].face, "up");
  assert.equal(result.state.cards["dark-forest"].residual, true);
  assert.equal(result.state.cards["dark-forest"].paidCost, 0);
  assert.equal(result.state.players.j.mana, manaAfterMove);
});

test("Dark Forest doubles its base power after either movement or structured redeployment", () => {
  const { built, state } = setup("jaguarman-dark-forest-power");
  const defs = definitions(built);
  place(state, "j", "mountain");
  place(state, "o", "city");
  createOwnedCardInstance(state, "j", { instanceId: "dark-forest", definitionId: DARK_FOREST, zone: "attack", face: "up", active: true, residual: true });
  assert.equal(calculateCombatCardPower(state, state.players.j, "dark-forest", defs, "mountain"), 2);

  movePlayerByEffect(state, "j", "city", defs);
  assert.equal(state.players.j.flags.movedOrRedeployedRound, 4);
  assert.equal(calculateCombatCardPower(state, state.players.j, "dark-forest", defs, "city"), 4);

  state.players.j.flags.movedOrRedeployedRound = 3;
  claimAllBattlefieldAdvantages(state, "j", "city");
  assert.equal(state.players.j.flags.movedOrRedeployedRound, 4);
  assert.equal(calculateCombatCardPower(state, state.players.j, "dark-forest", defs, "city"), 4);
});

test("Dark Forest closes after Jaguarman actually fights an opponent", () => {
  const { engine, state } = setup("jaguarman-dark-forest-close");
  place(state, "j", "mountain");
  place(state, "o", "mountain");
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  createOwnedCardInstance(state, "j", { instanceId: "dark-forest", definitionId: DARK_FOREST, zone: "attack", face: "up", active: true, residual: true });
  const result = engine.execute(state, command(state, "jaguarman-forest-combat", CommandType.ResolveCombat, "j", { locationId: "mountain" }));
  assert.equal(result.state.cards["dark-forest"].zone, "servant-skills");
  assert.equal(result.state.cards["dark-forest"].active, false);
});

test("Death Claw pulls only an adjacent unengaged opponent into Jaguarman's battlefield", () => {
  const { engine, state } = setup("jaguarman-death-claw-pull", [{ id: "j", name: "Jaguarman" }, { id: "target", name: "Target" }, { id: "remote", name: "Remote" }]);
  place(state, "j", "mountain");
  place(state, "target", "city");
  place(state, "remote", "scouting");
  createOwnedCardInstance(state, "j", { instanceId: "death-claw", definitionId: DEATH_CLAW, zone: "attack", face: "up", active: true });

  let result = engine.execute(state, command(state, "jaguarman-claw-open", CommandType.UseSkill, "j", {
    skillId: DEATH_CLAW,
    data: { abilityId: "death-claw-pull" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "jaguarman-death-claw-target");
  assert.deepEqual(result.state.pendingDecision?.options.map((option) => option.id), ["target"]);
  result = engine.execute(result.state, command(result.state, "jaguarman-claw-target", CommandType.ResolveDecision, "j", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["target"],
  }));
  assert.equal(result.state.players.target.locationId, "mountain");
  assert.ok(result.events.some((event) => event.type === "player.moved" && event.payload.playerId === "target"));
});

test("Death Claw waits until combat phase end, then removes 2 VP only from opponents below 12 power", () => {
  const { engine, state } = setup("jaguarman-death-claw-penalty", [{ id: "j", name: "Jaguarman" }, { id: "low", name: "Low" }, { id: "high", name: "High" }]);
  for (const id of ["j", "low", "high"]) place(state, id, "mountain");
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  state.players.low.victoryPoints = 5;
  state.players.high.victoryPoints = 5;
  state.players.j.flags.roundPowerBonus = 20;
  state.players.high.flags.roundPowerBonus = 9;
  createOwnedCardInstance(state, "j", { instanceId: "death-claw", definitionId: DEATH_CLAW, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "low", { instanceId: "low-attack", definitionId: "card.cardq2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "high", { instanceId: "high-attack", definitionId: "card.cardq2", zone: "attack", face: "up", active: true });

  let result = engine.execute(state, command(state, "jaguarman-claw-mountain", CommandType.ResolveCombat, "j", { locationId: "mountain" }));
  const combat = result.events.find((event) => event.type === "combat.resolved");
  assert.equal(combat?.payload.powers.low, 3);
  assert.equal(combat?.payload.powers.high, 12);
  assert.equal(result.state.players.low.victoryPoints, 5);
  assert.equal(result.state.players.high.victoryPoints, 5);

  result = engine.execute(result.state, command(result.state, "jaguarman-claw-city", CommandType.ResolveCombat, "j", { locationId: "city" }));
  assert.equal(result.state.players.low.victoryPoints, 5);
  result = engine.execute(result.state, command(result.state, "jaguarman-claw-end", CommandType.EndRound, "j"));
  assert.equal(result.state.players.low.victoryPoints, 3);
  assert.equal(result.state.players.high.victoryPoints, 5);
});
