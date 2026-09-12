import test from "node:test";
import assert from "node:assert/strict";

import content from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { assertStructuredCardBatchAllowed, isStructuredSkillUseForbidden } from "../src/rules-core/rule-modifiers.ts";
import { playerIgnoresDefeat } from "../src/rules-core/jekyll-hyde.ts";

function makeCommand(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function makeArcSource(state) {
  state.players.arc.masterId = "master.arcueid";
  createOwnedCardInstance(state, "arc", {
    instanceId: "blood-thirst",
    definitionId: "master.arcueid.skill.s3",
    zone: "master-skills",
    face: "up",
    active: false,
  });
}

test("batch020 each Gorgon reacts to an opponent using a Noble Phantasm phase ability, not only playing it", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "gorgon-card-used-np", players: [{ id: "g", name: "Gorgon" }, { id: "g2", name: "Gorgon2" }, { id: "d", name: "Darius" }], seed: 20001 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "d";
  state.players.g.servantId = "servant.gorgon";
  state.players.g2.servantId = "servant.gorgon";
  state.players.g.mana = 0;
  state.players.g2.mana = 0;
  state.players.d.servantId = "servant.darius";
  state.players.d.mana = 8;
  state.players.d.locationId = "mountain";
  state.players.g.locationId = "city";
  state.players.g2.locationId = "city";
  state.board.locations.mountain = ["d"];
  state.board.locations.city = ["g", "g2"];
  createOwnedCardInstance(state, "d", { instanceId: "babylon-gate", definitionId: "servant.darius.skill.sc-darius-2", zone: "attack", face: "up", active: true });

  const result = engine.execute(state, makeCommand(state, "darius-use-babylon", CommandType.UseSkill, "d", {
    skillId: "servant.darius.skill.sc-darius-2",
    data: { abilityId: "open-underworld-gate" },
  }));

  assert.ok(result.events.some((event) => event.type === "card.used" && event.payload.definitionId === "servant.darius.skill.sc-darius-2"));
  assert.equal(result.state.players.g.mana, 2);
  assert.equal(result.state.players.g2.mana, 2);
});
test("batch020 blood thirst uses static authoring ruleModifiers for basic-card cost and power", () => {
  const built = buildStandardContent(content);
  const definitions = {
    ...built.cards,
    ...built.skills.asCardDefinitions(),
    "test.basic": { id: "test.basic", name: "basic", cost: 2, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true },
  };
  const state = createGameState({ gameInstanceId: "blood-thirst-modifiers", players: [{ id: "arc", name: "arc" }], seed: 2001 });
  state.status = "playing";
  makeArcSource(state);
  createOwnedCardInstance(state, "arc", { instanceId: "basic-hand", definitionId: "test.basic", zone: "hand" });
  createOwnedCardInstance(state, "arc", { instanceId: "basic-attack", definitionId: "test.basic", zone: "attack", face: "up", active: true });

  assert.equal(getCardPlayCost(state, definitions["test.basic"], state.players.arc, state.cards["basic-hand"], definitions), 3);
  assert.equal(calculateCombatCardPower(state, state.players.arc, "basic-attack", definitions), 5);
  assert.equal(isStructuredSkillUseForbidden(state, "arc", "master.arcueid.skill.s2", definitions), true);
  assert.equal(isStructuredSkillUseForbidden(state, "arc", "master.arcueid.skill.s1", definitions), false);
});

test("batch020 round.ending resolves authoring score changes before final winner calculation", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "blood-thirst-round-ending",
    players: [{ id: "arc", name: "arc" }, { id: "other", name: "other" }],
    seed: 2002,
  });
  state.status = "playing";
  state.round = 1;
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  state.modeState.resolvedCombats = ["mountain", "city"];
  state.board.situationDeck = [];
  state.players.arc.victoryPoints = 5;
  state.players.other.victoryPoints = 4;
  makeArcSource(state);

  const result = engine.execute(state, makeCommand(state, "end-blood-thirst", CommandType.EndRound, "arc"));
  assert.equal(result.state.players.arc.victoryPoints, 3);
  const finished = result.events.find((event) => event.type === "game.finished");
  assert.deepEqual(finished?.payload.winnerIds, ["other"]);
  assert.ok(result.events.some((event) => event.type === "round.ending"));
});


test("batch020 Gorgon uses ruleModifiers for play-alone and ignore-defeat while active", () => {
  const built = buildStandardContent(content);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions(),
    "test.basic.gorgon": { id: "test.basic.gorgon", name: "basic", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true } };
  const state = createGameState({ gameInstanceId: "gorgon-rule-modifiers", players: [{ id: "g", name: "g" }], seed: 2003 });
  state.status = "playing";
  state.players.g.servantId = "servant.gorgon";
  createOwnedCardInstance(state, "g", { instanceId: "gorgon", definitionId: "servant.gorgon.skill.sc-gorgon-2", zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "g", { instanceId: "basic", definitionId: "test.basic.gorgon", zone: "hand" });
  assert.throws(() => assertStructuredCardBatchAllowed(state, "g", ["gorgon", "basic"], definitions), /CARD_MUST_BE_PLAYED_ALONE/);

  state.players.g.servantSkills = [];
  state.players.g.attack = ["gorgon"];
  state.cards.gorgon.zone = "attack";
  state.cards.gorgon.active = true;
  state.cards.gorgon.face = "up";
  state.cards.gorgon.residual = true;
  state.players.g.defeated = true;
  assert.equal(playerIgnoresDefeat(state, state.players.g, definitions), true);
  state.cards.gorgon.active = false;
  assert.equal(playerIgnoresDefeat(state, state.players.g, definitions), false);
});

test("batch020 Gorgon closes after combat with at least two opponents at its battlefield", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "gorgon-combat-close", players: [
    { id: "g", name: "g" }, { id: "a", name: "a" }, { id: "b", name: "b" }
  ], seed: 2004 });
  state.status = "playing"; state.round = 2; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
  state.players.g.servantId = "servant.gorgon";
  for (const id of ["g", "a", "b"]) state.players[id].locationId = "mountain";
  state.board.locations.mountain = ["g", "a", "b"];
  createOwnedCardInstance(state, "g", { instanceId: "gorgon", definitionId: "servant.gorgon.skill.sc-gorgon-2", zone: "attack", face: "up", active: true, residual: true });
  const result = engine.execute(state, makeCommand(state, "resolve-gorgon", CommandType.ResolveCombat, "g", { locationId: "mountain" }));
  assert.equal(result.state.cards.gorgon.zone, "servant-skills");
  assert.equal(result.state.cards.gorgon.active, false);
});


test("batch020 entered-location unifies movement facts for Mecha Eli passive", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "mecha-enter", players: [{ id: "m", name: "m" }, { id: "o", name: "o" }], seed: 2005 });
  state.status = "playing"; state.round = 3; state.phase = "action"; state.step = "move-decision"; state.activePlayerId = "o";
  state.players.m.servantId = "servant.mechaeli"; state.players.m.locationId = "mountain";
  state.players.o.locationId = "workshop"; state.players.o.mana = 3;
  state.board.locations.mountain = ["m"]; state.board.locations.workshop = ["o"];
  createOwnedCardInstance(state, "m", { instanceId: "steel-sky", definitionId: "servant.mechaeli.skill.sc-mechaeli-2", zone: "attack", face: "up", active: true });
  const result = engine.execute(state, makeCommand(state, "opponent-enters", CommandType.MovePlayer, "o", { locationId: "mountain" }));
  assert.equal(result.state.players.m.flags.roundPowerBonus, 2);
  assert.ok(result.events.some((event) => event.type === "player.entered-location" && event.payload.playerId === "o"));
});

test("batch020 Mecha Eli gains four victory points for an uncontested combat win", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "mecha-solo-win", players: [{ id: "m", name: "m" }, { id: "o", name: "o" }], seed: 2006 });
  state.status = "playing"; state.round = 3; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
  state.players.m.servantId = "servant.mechaeli"; state.players.m.locationId = "city"; state.players.o.locationId = "workshop";
  state.board.locations.city = ["m"]; state.board.locations.workshop = ["o"]; state.board.currentEvents.city = [];
  createOwnedCardInstance(state, "m", { instanceId: "steel-sky", definitionId: "servant.mechaeli.skill.sc-mechaeli-2", zone: "attack", face: "up", active: true });
  const result = engine.execute(state, makeCommand(state, "mecha-solo-combat", CommandType.ResolveCombat, "m", { locationId: "city" }));
  assert.equal(result.state.players.m.victoryPoints, 4);
});


test("batch020 Nobunaga defeat and combat-loss passives resolve from ordered domain facts", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "nobunaga-defeat-facts", players: [{ id: "n", name: "n" }, { id: "w", name: "w" }], seed: 2007 });
  state.status = "playing"; state.round = 4; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
  state.players.n.servantId = "servant.nobunaga"; state.players.n.locationId = "mountain";
  state.players.w.locationId = "mountain"; state.board.locations.mountain = ["n", "w"]; state.board.currentEvents.mountain = [];
  state.players.n.victoryPoints = 0; state.players.w.victoryPoints = 0;
  createOwnedCardInstance(state, "n", { instanceId: "fool", definitionId: "servant.nobunaga.skill.sc-nobunaga-3", zone: "servant-skills", face: "up", active: false });
  const defs = { ...built.cards, ...built.skills.asCardDefinitions(), "test.win": { id: "test.win", name: "win", cost: 0, basePower: 5, typeLabel: "力量", attributes: ["力量"], basic: true } };
  engine['dynamicCards']['test.win'] = defs['test.win'];
  createOwnedCardInstance(state, "w", { instanceId: "win", definitionId: "test.win", zone: "attack", face: "up", active: true });
  const result = engine.execute(state, makeCommand(state, "resolve-nobunaga", CommandType.ResolveCombat, "n", { locationId: "mountain" }));
  const defeatIndex = result.events.findIndex((event) => event.type === "player.defeated" && event.payload.playerId === "n");
  const combatIndex = result.events.findIndex((event) => event.type === "combat.resolved");
  assert.ok(defeatIndex >= 0 && combatIndex > defeatIndex);
  assert.equal(result.state.players.n.victoryPoints, 1);
  assert.equal(result.state.players.w.victoryPoints, 4);
});


test("batch020 Ozymandias doubles source base power on face-up play and drains entering opponent mana", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine({ ...built, cards: { ...built.cards, "test.basic.ozy": { id: "test.basic.ozy", name: "basic", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true } } });
  const state = createGameState({ gameInstanceId: "ozy-play", players: [{ id: "o", name: "o" }, { id: "e", name: "e" }], seed: 2008 });
  state.status = "playing"; state.round = 3; state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "o";
  state.players.o.servantId = "servant.ozymandias"; state.players.o.locationId = "mountain"; state.players.o.mana = 8; state.board.locations.mountain = ["o"];
  state.players.e.locationId = "workshop"; state.players.e.mana = 5; state.board.locations.workshop = ["e"];
  createOwnedCardInstance(state, "o", { instanceId: "sphinx", definitionId: "servant.ozymandias.skill.sc-ozymandias-2", zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "basic", definitionId: "test.basic.ozy", zone: "hand" });
  let result = engine.execute(state, makeCommand(state, "play-sphinx", CommandType.CommitAttack, "o", { faceUpInstanceIds: ["sphinx", "basic"], faceDownInstanceIds: [] }));
  assert.equal(result.state.cards.sphinx.powerModifiers?.some((modifier) => modifier.value === 4 && modifier.duration === "round"), true);

  result.state.phase = "action"; result.state.step = "move-decision"; result.state.activePlayerId = "e";
  const moved = engine.execute(result.state, makeCommand(result.state, "enter-sphinx", CommandType.MovePlayer, "e", { locationId: "mountain" }));
  assert.equal(moved.state.players.e.mana, 1); // 2 move cost, then 2 residual drain
});

test("batch020 Ozymandias defeat gives same-location players mana then closes residual source", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine({ ...built, cards: { ...built.cards, "test.ozy.winner": { id: "test.ozy.winner", name: "win", cost: 0, basePower: 10, typeLabel: "力量", attributes: ["力量"], basic: true } } });
  const state = createGameState({ gameInstanceId: "ozy-defeat", players: [{ id: "o", name: "o" }, { id: "w", name: "w" }], seed: 2009 });
  state.status = "playing"; state.round = 4; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
  state.players.o.servantId = "servant.ozymandias"; state.players.o.locationId = "city"; state.players.w.locationId = "city"; state.board.locations.city = ["o", "w"]; state.board.currentEvents.city = [];
  state.players.o.mana = 0; state.players.w.mana = 0;
  createOwnedCardInstance(state, "o", { instanceId: "sphinx", definitionId: "servant.ozymandias.skill.sc-ozymandias-2", zone: "attack", face: "up", active: true, residual: true });
  createOwnedCardInstance(state, "w", { instanceId: "win", definitionId: "test.ozy.winner", zone: "attack", face: "up", active: true });
  const result = engine.execute(state, makeCommand(state, "resolve-ozy", CommandType.ResolveCombat, "o", { locationId: "city" }));
  assert.equal(result.state.players.o.mana, 3);
  assert.equal(result.state.players.w.mana, 3);
  assert.equal(result.state.cards.sphinx.zone, "servant-skills");
  assert.equal(result.state.cards.sphinx.active, false);
});


test("batch020 Darius closes at combat.ending unless he lost combat this round", () => {
  const built = buildStandardContent(content);
  const makeState = (id, lost) => {
    const state = createGameState({ gameInstanceId: id, players: [{ id: "d", name: "d" }], seed: 2010 });
    state.status = "playing"; state.round = 5; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
    state.modeState.resolvedCombats = ["mountain", "city"]; state.board.situationDeck = [];
    state.players.d.servantId = "servant.darius"; state.players.d.locationId = "mountain"; state.board.locations.mountain = ["d"];
    if (lost) state.players.d.flags.combatLossRound = state.round;
    createOwnedCardInstance(state, "d", { instanceId: "glory", definitionId: "servant.darius.skill.sc-darius-1", zone: "attack", face: "up", active: true, residual: true });
    return state;
  };
  const engine = new StandardMatchEngine(built);
  const clean = makeState("darius-clean", false);
  const closed = engine.execute(clean, makeCommand(clean, "end-darius-clean", CommandType.EndRound, "d"));
  assert.equal(closed.state.cards.glory.zone, "servant-skills");
  const lost = makeState("darius-lost", true);
  const kept = engine.execute(lost, makeCommand(lost, "end-darius-lost", CommandType.EndRound, "d"));
  assert.equal(kept.state.cards.glory.zone, "attack");
  assert.equal(kept.state.cards.glory.active, true);
});


test("batch020 Stheno replaces combat reward splitting and still gains her printed bonus", () => {
  const built = buildStandardContent(content);
  const cards = {
    ...built.cards,
    "test.tie": { id: "test.tie", name: "tie", cost: 0, basePower: 5, typeLabel: "力量", attributes: ["力量"], basic: true },
    "test.lose": { id: "test.lose", name: "lose", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true },
  };
  const engine = new StandardMatchEngine({ ...built, cards });
  const state = createGameState({ gameInstanceId: "stheno-reward", players: [{ id: "s", name: "s" }, { id: "c", name: "c" }, { id: "l", name: "l" }], seed: 2011 });
  state.status = "playing"; state.round = 3; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = null;
  state.players.s.servantId = "servant.stheno";
  for (const id of ["s", "c", "l"]) state.players[id].locationId = "mountain";
  state.board.locations.mountain = ["s", "c", "l"]; state.board.currentEvents.mountain = [];
  createOwnedCardInstance(state, "s", { instanceId: "smile", definitionId: "servant.stheno.skill.sc-stheno-2", zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "s", { instanceId: "s-tie", definitionId: "test.tie", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "c", { instanceId: "c-tie", definitionId: "test.tie", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "l", { instanceId: "l-lose", definitionId: "test.lose", zone: "attack", face: "up", active: true });
  const result = engine.execute(state, makeCommand(state, "resolve-stheno", CommandType.ResolveCombat, "s", { locationId: "mountain" }));
  assert.deepEqual(result.events.find((event) => event.type === "combat.resolved")?.payload.winnerIds.sort(), ["c", "s"]);
  assert.equal(result.state.players.s.victoryPoints, 3); // full 2-point battlefield reward + printed +1
  assert.equal(result.state.players.c.victoryPoints, 2);
});
