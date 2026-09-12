import test from "node:test";
import assert from "node:assert/strict";

import content from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { isStructuredSkillUseForbidden } from "../src/rules-core/rule-modifiers.ts";

function command(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function addCielSource(state) {
  state.players.ciel.masterId = "master.ciel";
  createOwnedCardInstance(state, "ciel", { instanceId: "ciel-cremation", definitionId: "master.ciel.skill.s2", zone: "master-skills", face: "up", active: false });
}

test("batch021 Ciel exorcism rewards the authoritative deployment advantage on an uncontested win", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch021-ciel-exorcism", players: [{ id: "ciel", name: "ciel" }], seed: 2101 });
  state.status = "playing"; state.round = 2; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
  addCielSource(state);
  state.players.ciel.locationId = "mountain"; state.board.locations.mountain = ["ciel"];
  state.players.ciel.flags.deploymentBonusActive = true; state.players.ciel.flags.deploymentBonus = 3; state.players.ciel.flags.deploymentLocationId = "mountain";
  const result = engine.execute(state, command(state, "ciel-uncontested", CommandType.ResolveCombat, "ciel", { locationId: "mountain" }));
  assert.equal(result.state.players.ciel.victoryPoints, 3);
  assert.ok(result.events.some((event) => event.type === "combat.resolved"));
  assert.ok(result.events.some((event) => event.type === "player.victory-points.changed" && event.payload.playerId === "ciel" && event.payload.delta === 3));
});

test("batch021 Ciel clerical convenience gains two mana at scouting during combat", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch021-ciel-scouting", players: [{ id: "ciel", name: "ciel" }], seed: 2102 });
  state.status = "playing"; state.round = 2; state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "ciel";
  addCielSource(state);
  state.players.ciel.locationId = "scouting"; state.board.locations.scouting = ["ciel"]; state.players.ciel.mana = 1;
  const result = engine.execute(state, command(state, "ciel-clerical", CommandType.UseSkill, "ciel", { skillId: "master.ciel.skill.s2", data: { abilityId: "clerical-convenience" } }));
  assert.equal(result.state.players.ciel.mana, 3);
  assert.ok(result.events.some((event) => event.type === "player.mana.changed" && event.payload.playerId === "ciel" && event.payload.delta === 2));
});


test("batch021 Atalanta residual changes other attacks at the base-power and printed-cost layers", () => {
  const built = buildStandardContent(content);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions(),
    "test.atalanta.attack": { id: "test.atalanta.attack", name: "attack", cost: 2, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true, ownerDefinitionId: "servant.atalanta" } };
  const state = createGameState({ gameInstanceId: "batch021-atalanta", players: [{ id: "a", name: "a" }], seed: 2103 });
  state.status = "playing"; state.players.a.servantId = "servant.atalanta";
  createOwnedCardInstance(state, "a", { instanceId: "boar", definitionId: "servant.atalanta.skill.sc-atalanta-1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "target-hand", definitionId: "test.atalanta.attack", zone: "hand" });
  createOwnedCardInstance(state, "a", { instanceId: "target-attack", definitionId: "test.atalanta.attack", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "master-hand", definitionId: "card.derived.master.shirou-emiya.ganjiang-moye", zone: "hand" });
  createOwnedCardInstance(state, "a", { instanceId: "master-attack", definitionId: "card.derived.master.shirou-emiya.ganjiang-moye", zone: "attack", face: "up", active: true });
  assert.equal(getCardPlayCost(state, definitions["test.atalanta.attack"], state.players.a, state.cards["target-hand"], definitions), 5);
  assert.equal(calculateCombatCardPower(state, state.players.a, "target-attack", definitions), 7);
  assert.equal(getCardPlayCost(state, definitions["card.derived.master.shirou-emiya.ganjiang-moye"], state.players.a, state.cards["master-hand"], definitions), 1);
  assert.equal(calculateCombatCardPower(state, state.players.a, "master-attack", definitions), 5);
  assert.equal(isStructuredSkillUseForbidden(state, "a", "servant.atalanta.skill.sc-atalanta-3", definitions), true);
});

test("batch021 Helena installs a round-scoped rule that forbids same-location opponents' face-down skill-zone abilities", () => {
  const built = buildStandardContent(content);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch021-helena", players: [{ id: "h", name: "h" }, { id: "o", name: "o" }], seed: 2104 });
  state.status = "playing"; state.round = 3; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "h";
  state.players.h.servantId = "servant.helena"; state.players.h.locationId = "workshop"; state.players.o.locationId = "workshop"; state.board.locations.workshop = ["h", "o"];
  createOwnedCardInstance(state, "h", { instanceId: "helena-np", definitionId: "servant.helena.skill.sc-helena-3", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "opponent-skill", definitionId: "servant.siegfried.skill.sc-siegfried-2", zone: "servant-skills", face: "down", active: false });
  assert.equal(isStructuredSkillUseForbidden(state, "o", "servant.siegfried.skill.sc-siegfried-2", definitions), false);
  const result = engine.execute(state, command(state, "helena-sync", CommandType.UseSkill, "h", { skillId: "servant.helena.skill.sc-helena-3", data: { abilityId: "mana-synchronization" } }));
  assert.equal(isStructuredSkillUseForbidden(result.state, "o", "servant.siegfried.skill.sc-siegfried-2", definitions), true);
  assert.ok(result.state.activeRuleModifiers.some((modifier) => modifier.rule === "skill_use" && modifier.duration === "round"));
});

test("batch021 Nursery forest blocks true-name skill use only while the target card is outside the attack", () => {
  const built = buildStandardContent(content);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: "batch021-nursery", players: [{ id: "n", name: "n" }, { id: "o", name: "o" }], seed: 2105 });
  state.status = "playing"; state.players.n.servantId = "servant.nursery"; state.players.n.locationId = "city"; state.players.o.locationId = "city"; state.board.locations.city = ["n", "o"];
  createOwnedCardInstance(state, "n", { instanceId: "forest", definitionId: "servant.nursery.skill.sc-nursery-2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "true-name-skill", definitionId: "servant.siegfried.skill.sc-siegfried-2", zone: "servant-skills", face: "up", active: false });
  assert.equal(definitions["servant.siegfried.skill.sc-siegfried-2"].revealsTrueNameOnPlay, true);
  assert.equal(isStructuredSkillUseForbidden(state, "o", "servant.siegfried.skill.sc-siegfried-2", definitions), true);
  movePlayerCard(state, "o", "true-name-skill", "attack"); state.cards["true-name-skill"].active = true; state.cards["true-name-skill"].face = "up";
  assert.equal(isStructuredSkillUseForbidden(state, "o", "servant.siegfried.skill.sc-siegfried-2", definitions), false);
});


test("batch021 Ciel Extra returns Seventh Scripture only when an opponent crosses seven gained VP in the round", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const event = built.events.find((item) => item.victoryPoints === 3);
  assert.ok(event);
  const state = createGameState({ gameInstanceId: "batch021-ciel-extra", players: [{ id: "ciel", name: "ciel" }, { id: "o", name: "o" }], seed: 2106 });
  state.status = "playing"; state.round = 4; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
  state.players.ciel.masterId = "master.ciel"; state.players.ciel.locationId = "workshop"; state.board.locations.workshop = ["ciel"];
  state.players.o.locationId = "mountain"; state.board.locations.mountain = ["o"]; state.players.o.victoryPoints = 4;
  state.board.currentEvents.mountain = [event.id];
  createOwnedCardInstance(state, "ciel", { instanceId: "ciel-extra", definitionId: "master.ciel.skill.s1b", zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(state, "ciel", { instanceId: "seventh-scripture", definitionId: "master.ciel.skill.s3", zone: "removed", face: "down", active: false });
  state.eventLog.push({ eventId: "prior-vp", type: "player.victory-points.changed", revision: 0, sourceCommandId: "prior", payload: { playerId: "o", round: 4, before: 0, after: 4, delta: 4 } });
  const result = engine.execute(state, command(state, "ciel-extra-cross", CommandType.ResolveCombat, "o", { locationId: "mountain" }));
  assert.equal(result.state.players.o.victoryPoints, 7);
  assert.equal(result.state.cards["seventh-scripture"].zone, "master-skills");
  assert.ok(result.events.some((item) => item.type === "player.victory-points.changed" && item.payload.playerId === "o" && item.payload.delta === 3));
});


function addArjunaSource(state) {
  state.players.arjuna.servantId = "servant.arjuna";
  createOwnedCardInstance(state, "arjuna", { instanceId: "arjuna-supreme", definitionId: "servant.arjuna.skill.sc-arjuna-1", zone: "servant-skills", face: "up", active: false });
}

test("batch021 Arjuna Supreme God marks combat losers with a source-linked Flawed status", () => {
  const built = buildStandardContent(content); const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch021-arjuna-flaw", players: [{ id: "arjuna", name: "arjuna" }, { id: "loser", name: "loser" }], seed: 2107 });
  state.status = "playing"; state.round = 3; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
  addArjunaSource(state); state.players.arjuna.locationId = "mountain"; state.players.loser.locationId = "mountain"; state.board.locations.mountain = ["arjuna", "loser"];
  state.players.arjuna.flags.roundPowerBonus = 5;
  const result = engine.execute(state, command(state, "arjuna-win", CommandType.ResolveCombat, "arjuna", { locationId: "mountain" }));
  assert.ok(result.state.players.loser.statuses.includes("flawed:arjuna-supreme"));
});

test("batch021 Arjuna Supreme God exiles itself on combat loss and clears only its linked Flawed statuses", () => {
  const built = buildStandardContent(content); const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch021-arjuna-loss", players: [{ id: "arjuna", name: "arjuna" }, { id: "winner", name: "winner" }], seed: 2108 });
  state.status = "playing"; state.round = 3; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
  addArjunaSource(state); state.players.arjuna.locationId = "mountain"; state.players.winner.locationId = "mountain"; state.board.locations.mountain = ["arjuna", "winner"];
  state.players.winner.flags.roundPowerBonus = 5; state.players.winner.statuses.push("flawed:arjuna-supreme", "flawed:other-source");
  const result = engine.execute(state, command(state, "arjuna-loss", CommandType.ResolveCombat, "arjuna", { locationId: "mountain" }));
  assert.equal(result.state.cards["arjuna-supreme"].zone, "removed");
  assert.equal(result.state.players.winner.statuses.includes("flawed:arjuna-supreme"), false);
  assert.equal(result.state.players.winner.statuses.includes("flawed:other-source"), true);
  assert.ok(result.events.some((event) => event.type === "card.exiled" && event.payload.instanceId === "arjuna-supreme"));
});

test("batch021 Arjuna passive/action ability grants power without requiring the passive card to be active", () => {
  const built = buildStandardContent(content); const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch021-arjuna-action", players: [{ id: "arjuna", name: "arjuna" }], seed: 2109 });
  state.status = "playing"; state.round = 3; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "arjuna"; addArjunaSource(state);
  const result = engine.execute(state, command(state, "arjuna-power", CommandType.UseSkill, "arjuna", { skillId: "servant.arjuna.skill.sc-arjuna-1", data: { abilityId: "supreme-god-action-power" } }));
  assert.equal(result.state.players.arjuna.flags.roundPowerBonus, 5);
  assert.equal(result.state.players.arjuna.trueNameRevealed, true);
});


test("batch021 Nero Golden Theater rewards active-round count on a win", () => {
  const built = buildStandardContent(content); const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch021-nero-win", players: [{ id: "nero", name: "nero" }, { id: "loser", name: "loser" }], seed: 2110 });
  state.status = "playing"; state.round = 4; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
  state.players.nero.servantId = "servant.nero"; state.players.nero.locationId = "city"; state.players.loser.locationId = "city"; state.board.locations.city = ["nero", "loser"];
  createOwnedCardInstance(state, "nero", { instanceId: "nero-theater", definitionId: "servant.nero.skill.sc-nero-1", zone: "attack", face: "up", active: true }); state.cards["nero-theater"].playedRound = 2;
  state.players.nero.flags.roundPowerBonus = 5;
  const before = state.players.nero.victoryPoints; const result = engine.execute(state, command(state, "nero-win", CommandType.ResolveCombat, "nero", { locationId: "city" }));
  const combat = result.events.find((event) => event.type === "combat.resolved"); const printedGain = Number(combat?.payload?.victoryPoints?.nero ?? 0);
  assert.equal(result.state.players.nero.victoryPoints - before, printedGain + 3);
  assert.equal(result.state.cards["nero-theater"].active, true);
});

test("batch021 Nero Golden Theater closes at round ending when controller did not win combat", () => {
  const built = buildStandardContent(content); const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch021-nero-close", players: [{ id: "nero", name: "nero" }, { id: "other", name: "other" }], seed: 2111 });
  state.status = "playing"; state.round = 4; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null; state.modeState.resolvedCombats = ["mountain", "city"];
  state.players.nero.servantId = "servant.nero"; createOwnedCardInstance(state, "nero", { instanceId: "nero-theater", definitionId: "servant.nero.skill.sc-nero-1", zone: "attack", face: "up", active: true }); state.cards["nero-theater"].playedRound = 3; state.cards["nero-theater"].residual = true;
  const result = engine.execute(state, command(state, "nero-round-end", CommandType.EndRound, "nero", {}));
  assert.equal(result.state.cards["nero-theater"].active, false);
  assert.notEqual(result.state.cards["nero-theater"].zone, "attack");
});


function addKuzukiSource(state) {
  state.players.kuzuki.masterId = "master.kuzuki";
  createOwnedCardInstance(state, "kuzuki", { instanceId: "kuzuki-outsider", definitionId: "master.kuzuki.skill.s2", zone: "master-skills", face: "up", active: false });
}

test("batch021 Kuzuki Outsider suppresses workshop deployment mana and discounts regular movement once", () => {
  const built = buildStandardContent(content); const engine = new StandardMatchEngine(built);
  let state = createGameState({ gameInstanceId: "batch021-kuzuki-move", players: [{ id: "kuzuki", name: "kuzuki" }], seed: 2112 });
  state.status = "playing"; state.round = 3; state.phase = "outpost"; state.step = "player-window"; state.activePlayerId = "kuzuki"; addKuzukiSource(state);
  let result = engine.execute(state, command(state, "kuzuki-deploy", CommandType.DeployPlayer, "kuzuki", { locationId: "workshop" }));
  assert.equal(result.state.players.kuzuki.mana, 0);
  assert.equal(result.state.players.kuzuki.flags.deploymentBonus, 2);
  state = result.state; state.phase = "action"; state.step = "move-decision"; state.activePlayerId = "kuzuki"; state.players.kuzuki.mana = 1;
  result = engine.execute(state, command(state, "kuzuki-move", CommandType.MovePlayer, "kuzuki", { locationId: "mountain" }));
  assert.equal(result.state.players.kuzuki.mana, 0);
  assert.equal(result.events.find((event) => event.type === "player.moved")?.payload?.cost, 1);
});

test("batch021 Kuzuki Outsider gains two VP at combat ending only when no VP was gained and he is alone in workshop", () => {
  const built = buildStandardContent(content); const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch021-kuzuki-reward", players: [{ id: "kuzuki", name: "kuzuki" }, { id: "other", name: "other" }], seed: 2113 });
  state.status = "playing"; state.round = 3; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null; state.modeState.resolvedCombats = ["mountain", "city"]; addKuzukiSource(state);
  state.players.kuzuki.locationId = "workshop"; state.board.locations.workshop = ["kuzuki"]; state.players.kuzuki.flags.roundVictoryPointsGained = 0;
  const result = engine.execute(state, command(state, "kuzuki-end", CommandType.EndRound, "kuzuki", {}));
  assert.equal(result.state.players.kuzuki.victoryPoints, 2);
});
