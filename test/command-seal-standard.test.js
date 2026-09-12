import test from "node:test";
import assert from "node:assert/strict";

import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";

function command(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function fixture(id) {
  const engine = new StandardMatchEngine({ cards: {}, situations: [], events: [], playerDecks: {} });
  const state = createGameState({ gameInstanceId: id, players: [{ id: "p", name: "Player" }, { id: "o", name: "Opponent" }], seed: 901 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "p";
  state.players.p.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["p", "o"];
  return { engine, state };
}

test("normal Command Seal is a standard command: mana mode spends one seal and gains 4 mana", () => {
  const { engine, state } = fixture("seal-mana");
  state.players.p.mana = 6;
  const result = engine.execute(state, command(state, "seal-mana-use", CommandType.UseCommandSeal, "p", { mode: "mana" }));
  assert.equal(result.state.players.p.commandSeals, 2);
  assert.equal(result.state.players.p.mana, 10);
  assert.equal(result.state.players.p.flags.commandSealUsedRound, 4);
  assert.equal(result.state.players.p.flags.commandSealManaGainRound, 4);
  assert.equal(result.events.some((event) => event.type === "command-seal.used"), true);
});

test("normal Command Seal power mode gives +2 total power and +2 VP after winning", () => {
  const { engine, state } = fixture("seal-power");
  const used = engine.execute(state, command(state, "seal-power-use", CommandType.UseCommandSeal, "p", { mode: "power" })).state;
  assert.equal(used.players.p.commandSeals, 2);
  assert.equal(used.players.p.flags.commandSealRoundPowerBonus, 2);
  assert.equal(used.players.p.flags.commandSealVictoryPointBonus, 2);

  const combat = resolveCombat(used, "mountain", {}, {});
  assert.deepEqual(combat.winnerIds, ["p"]);
  assert.equal(used.players.p.victoryPoints, 4); // mountain contested reward 2 + Command Seal win reward 2
  assert.equal(used.players.p.flags.commandSealRoundPowerBonus, undefined);
  assert.equal(used.players.p.flags.commandSealVictoryPointBonus, undefined);
});

test("normal Command Seal movement uses the authoritative movement path and emits movement events", () => {
  const { engine, state } = fixture("seal-move");
  state.board.locations.mountain = ["p"];
  state.board.locations.city = ["o"];
  state.players.o.locationId = "city";
  const result = engine.execute(state, command(state, "seal-move-use", CommandType.UseCommandSeal, "p", { mode: "move", targetLocationId: "scouting" }));
  assert.equal(result.state.players.p.commandSeals, 2);
  assert.equal(result.state.players.p.locationId, "scouting");
  assert.equal(result.events.some((event) => event.type === "player.moved" && event.payload.method === "command-seal"), true);
  assert.equal(result.events.some((event) => event.type === "player.entered-location" && event.payload.method === "command-seal"), true);
});

test("normal Command Seal power bonus expires at round end even without combat", () => {
  const { engine, state } = fixture("seal-power-no-combat");
  const used = engine.execute(state, command(state, "seal-power-no-combat-use", CommandType.UseCommandSeal, "p", { mode: "power" })).state;
  used.board.locations.mountain = ["o"];
  used.board.locations.scouting = ["p"];
  used.players.p.locationId = "scouting";
  endStandardRound(used, {});
  assert.equal(used.players.p.flags.commandSealRoundPowerBonus, undefined);
  assert.equal(used.players.p.flags.commandSealVictoryPointBonusRound, undefined);
  assert.equal(used.players.p.flags.commandSealVictoryPointBonus, undefined);
});
