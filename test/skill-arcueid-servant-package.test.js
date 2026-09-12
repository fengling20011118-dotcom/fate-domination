import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { closePlayerCard, createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";

const CRIMSON = "servant.arcueid.skill.sc-arcueid-1";
const CASTLE = "servant.arcueid.skill.sc-arcueid-2";
const MARBLE = "servant.arcueid.skill.sc-arcueid-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "servant-arcueid", players = [{ id: "a", name: "Arcueid" }, { id: "o", name: "Opponent" }]) {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players, seed: 3301 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = players.map((player) => player.id);
  state.players.a.servantId = "servant.arcueid";
  state.players.a.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["a"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  for (const player of players.slice(1)) {
    state.players[player.id].locationId = "mountain";
    state.board.locations.mountain.push(player.id);
  }
  return { built, definitions, engine, state };
}

test("Servant Arcueid package: all three skills are FULL", () => {
  const { built } = setup("servant-arcueid-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.arcueid");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(CRIMSON).handlerId, "core.arcueid-crimson-moon");
  assert.equal(built.skills.get(CASTLE).handlerId, "core.arcueid-millennium-castle");
  assert.equal(built.skills.get(MARBLE).handlerId, "core.arcueid-marble-phantasm");
  assert.equal(built.skills.get(CRIMSON).pairedPlayOtherCostReduction, 3);
  assert.deepEqual(built.skills.get(CRIMSON).rules?.ambiguities ?? [], []);
  assert.deepEqual(built.skills.get(CASTLE).rules?.unmodeledClauses ?? [], []);
});

test("Crimson Moon reduces the other same-batch face-up card by 3 without reducing its own paid cost", () => {
  const { engine, state } = setup("servant-arcueid-paired-cost");
  state.step = "play-batch-draft";
  state.players.a.mana = 8;
  state.players.a.trueNameRevealed = true;
  createOwnedCardInstance(state, "a", { instanceId: "crimson", definitionId: CRIMSON, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "a", { instanceId: "other", definitionId: "card.cardb6", zone: "hand", face: "down", active: false });

  const result = engine.execute(state, command(state, "arcueid-paired-play", CommandType.CommitAttack, "a", {
    faceUpInstanceIds: ["crimson", "other"],
    faceDownInstanceIds: [],
  }));

  assert.equal(result.state.players.a.mana, 0);
  assert.equal(result.state.cards.crimson.paidCost, 6);
  assert.equal(result.state.cards.other.paidCost, 2);
  assert.equal(result.state.cards.crimson.zone, "attack");
  assert.equal(result.state.cards.other.zone, "attack");
  const committed = result.events.find((event) => event.type === "attack.committed");
  assert.equal(committed?.payload.paidMana, 8);
});

test("Crimson Moon drains and gathers only opponents who were not already engaged", () => {
  const players = [
    { id: "a", name: "Arcueid" },
    { id: "u", name: "Unengaged" },
    { id: "e", name: "Engaged A" },
    { id: "f", name: "Engaged B" },
  ];
  const { engine, state } = setup("servant-arcueid-gather", players);
  state.phase = "combat";
  state.step = "player-window";
  state.board.locations.mountain = ["a"];
  state.board.locations.workshop = ["u"];
  state.board.locations.city = ["e", "f"];
  state.players.a.locationId = "mountain";
  state.players.u.locationId = "workshop";
  state.players.e.locationId = "city";
  state.players.f.locationId = "city";
  state.players.u.victoryPoints = 5;
  state.players.e.victoryPoints = 5;
  state.players.f.victoryPoints = 5;
  createOwnedCardInstance(state, "a", { instanceId: "crimson", definitionId: CRIMSON, zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "arcueid-gather", CommandType.UseSkill, "a", {
    skillId: CRIMSON,
    data: { abilityId: "crimson-moon-gather" },
  }));

  assert.equal(result.state.players.u.victoryPoints, 4);
  assert.equal(result.state.players.u.locationId, "mountain");
  assert.ok(result.state.board.locations.mountain.includes("u"));
  assert.equal(result.state.players.e.victoryPoints, 5);
  assert.equal(result.state.players.f.victoryPoints, 5);
  assert.equal(result.state.players.e.locationId, "city");
  assert.equal(result.state.players.f.locationId, "city");
  assert.ok(result.events.some((event) => event.type === "player.moved" && event.payload?.playerId === "u"));
});

test("Millennium Castle drains all engaged opponents, removes Arcueid from the board, and locks that physical card", () => {
  const players = [{ id: "a", name: "Arcueid" }, { id: "o", name: "Opponent" }, { id: "p", name: "Opponent 2" }];
  const { definitions, engine, state } = setup("servant-arcueid-castle", players);
  state.phase = "combat";
  state.step = "player-window";
  state.players.o.mana = 5;
  state.players.p.mana = 2;
  createOwnedCardInstance(state, "a", { instanceId: "castle", definitionId: CASTLE, zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "arcueid-castle", CommandType.UseSkill, "a", {
    skillId: CASTLE,
    data: { abilityId: "millennium-castle-exile" },
  }));

  assert.equal(result.state.players.o.mana, 2);
  assert.equal(result.state.players.p.mana, 0);
  assert.equal(result.state.players.a.locationId, null);
  assert.ok(!result.state.board.locations.mountain.includes("a"));
  assert.deepEqual(result.state.cards.castle.playBlockedUntilOwnerCombatWin, { sourceId: CASTLE });

  closePlayerCard(result.state, "a", "castle", definitions);
  assert.equal(result.state.cards.castle.zone, "servant-skills");
  assert.throws(() => assertCardCanEnterAttack({ state: result.state, playerId: "a", instanceId: "castle", definitions, faceDown: false }), /CARD_PLAY_BLOCKED_UNTIL_COMBAT_WIN/);
});

test("Millennium Castle's physical-card lock clears only after its owner later wins a combat", () => {
  const { definitions, engine, state } = setup("servant-arcueid-castle-unlock");
  state.phase = "combat";
  state.step = "player-window";
  state.players.o.mana = 6;
  createOwnedCardInstance(state, "a", { instanceId: "castle", definitionId: CASTLE, zone: "attack", face: "up", active: true });

  let result = engine.execute(state, command(state, "arcueid-castle-lock", CommandType.UseSkill, "a", {
    skillId: CASTLE,
    data: { abilityId: "millennium-castle-exile" },
  }));
  closePlayerCard(result.state, "a", "castle", definitions);
  assert.ok(result.state.cards.castle.playBlockedUntilOwnerCombatWin);

  result.state.players.a.locationId = "mountain";
  result.state.players.o.locationId = "mountain";
  result.state.board.locations.mountain = ["a", "o"];
  createOwnedCardInstance(result.state, "a", { instanceId: "a-attack", definitionId: "card.cardb6", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(result.state, "o", { instanceId: "o-attack", definitionId: "card.cardq1", zone: "attack", face: "up", active: true });
  resolveCombat(result.state, "mountain", definitions, {});

  assert.equal(result.state.players.a.flags.combatWinRound, 4);
  assert.equal(result.state.cards.castle.playBlockedUntilOwnerCombatWin, undefined);
});
