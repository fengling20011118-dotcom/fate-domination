import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

const S1 = "servant.lobo.skill.sc-lobo-1";
const S2 = "servant.lobo.skill.sc-lobo-2";
const S3 = "servant.lobo.skill.sc-lobo-3";

function cmd(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "lobo-package", identity = true) {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "l", name: "Lobo" }, { id: "a", name: "A" }, { id: "b", name: "B" }], seed: 1601 });
  state.status = "playing";
  state.round = 6;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "l";
  state.turnOrder = ["l", "a", "b"];
  state.players.l.servantId = identity ? "servant.lobo" : "servant.test";
  state.players.l.mana = 10;
  state.players.a.mana = 10;
  state.players.b.mana = 10;
  state.players.l.locationId = "mountain";
  state.players.a.locationId = "city";
  state.players.b.locationId = "city";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["l"];
  state.board.locations.city = ["a", "b"];
  state.board.locations.scouting = [];
  return { built, engine, state };
}

function resolve(engine, state, id, actorId, selections) {
  assert.ok(state.pendingDecision, `missing pending decision before ${id}`);
  return engine.execute(state, cmd(state, id, CommandType.ResolveDecision, actorId, {
    decisionId: state.pendingDecision.decisionId,
    selections,
  })).state;
}

test("Hessian Lobo package is 3/3 FULL and registered", () => {
  const { built } = setup("lobo-full");
  for (const id of [S1, S2, S3]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL");
    assert.ok(skill.handlerId);
    assert.equal(built.skills.hasHandler(id), true);
    assert.deepEqual(skill.rules?.ambiguities ?? [], []);
    assert.deepEqual(skill.rules?.unmodeledClauses ?? [], []);
  }
});

test("Ghastly Howl processes opponents in turn order, allows backward/forward adjacent movement, and joins itself", () => {
  const { engine, state } = setup("lobo-howl-move", false);
  createOwnedCardInstance(state, "l", { instanceId: "howl", definitionId: S2, zone: "servant-skills", face: "up", active: false });
  let result = engine.execute(state, cmd(state, "howl-use", CommandType.UseSkill, "l", { skillId: S2, data: { abilityId: "ghastly-howl" } }));
  assert.equal(result.state.players.l.mana, 9);
  assert.equal(result.state.pendingDecision?.kind, "lobo-ghastly-howl-battlefield");
  let s = resolve(engine, result.state, "pick-city", "l", ["city"]);
  assert.equal(s.pendingDecision?.ownerPlayerId, "a");
  assert.ok(s.pendingDecision?.options.some((o) => o.id === "move:mountain"));
  assert.ok(s.pendingDecision?.options.some((o) => o.id === "move:scouting"));
  s = resolve(engine, s, "a-move", "a", ["move:scouting"]);
  assert.equal(s.players.a.locationId, "scouting");
  assert.equal(s.pendingDecision?.ownerPlayerId, "b");
  assert.ok(s.pendingDecision?.options.some((o) => o.id === "move:mountain"));
  assert.equal(s.pendingDecision?.options.some((o) => o.id === "move:scouting"), false, "full Recon is not a legal normal Howl destination");
  s = resolve(engine, s, "b-haunt", "b", ["haunt"]);
  assert.equal(s.cards.howl.zone, "attack");
  assert.equal(s.cards.howl.active, true);
  const haunts = s.modeState.loboHaunts;
  assert.ok(Array.isArray(haunts) && haunts.some((h) => h.targetPlayerId === "b" && h.controllerPlayerId === "l"));
});

test("Frostes Henker discards Avenger, defeats a combatant, and haunted defeat loses 3 VP", () => {
  const { engine, state } = setup("lobo-frostes-haunt");
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "l";
  state.players.l.locationId = "city";
  state.board.locations.mountain = [];
  state.board.locations.city = ["l", "b"];
  state.board.locations.scouting = [];
  state.players.b.locationId = "city";
  state.players.b.victoryPoints = 8;
  createOwnedCardInstance(state, "l", { instanceId: "frostes", definitionId: S1, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "l", { instanceId: "howl-active", definitionId: S2, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "l", { instanceId: "avenger", definitionId: "card.card-avenger", zone: "hand", face: "down", active: false });
  state.modeState.loboHaunts = [{ controllerPlayerId: "l", targetPlayerId: "b", sourceSkillId: S2, round: state.round }];
  let result = engine.execute(state, cmd(state, "frostes-use", CommandType.UseSkill, "l", { skillId: S1, data: { abilityId: "distant-condemnation" } }));
  let s = resolve(engine, result.state, "discard-avenger", "l", ["avenger"]);
  assert.equal(s.cards.avenger.zone, "discard");
  assert.ok(s.pendingDecision?.options.some((o) => o.id === "defeat:b"));
  s = resolve(engine, s, "defeat-b", "l", ["defeat:b"]);
  assert.equal(s.players.b.defeated, true);
  assert.equal(s.players.b.victoryPoints, 5);
});

test("Oblivion Correction follows an opponent, plays Quick March, then immediately uses its Action ability on opponent turn", () => {
  const { engine, state } = setup("lobo-oblivion-quick");
  state.players.l.locationId = "workshop";
  state.players.a.locationId = "mountain";
  state.players.b.locationId = "workshop";
  state.board.locations.workshop = ["l", "b"];
  state.board.locations.mountain = ["a"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  state.activePlayerId = "a";
  state.phase = "action";
  state.step = "move-decision";
  createOwnedCardInstance(state, "l", { instanceId: "quick", definitionId: "card.cardsurveil", zone: "hand", face: "down", active: false });
  const moved = engine.execute(state, cmd(state, "a-moves", CommandType.MovePlayer, "a", { locationId: "city" }));
  assert.equal(moved.state.players.a.locationId, "city");
  assert.equal(moved.state.pendingDecision?.kind, "lobo-oblivion-follow");
  let s = resolve(engine, moved.state, "l-follow", "l", ["follow"]);
  assert.equal(s.players.l.locationId, "mountain");
  assert.equal(s.pendingDecision?.kind, "lobo-oblivion-attack");
  s = resolve(engine, s, "l-play-quick", "l", ["quick"]);
  assert.equal(s.cards.quick.zone, "attack");
  assert.equal(s.pendingDecision?.kind, "lobo-oblivion-use-quick-march");
  s = resolve(engine, s, "l-use-quick", "l", ["use"]);
  assert.equal(s.pendingDecision?.kind, "lobo-oblivion-quick-march-destination");
  s = resolve(engine, s, "l-quick-city", "l", ["city"]);
  assert.equal(s.players.l.locationId, "city");
  assert.equal(s.activePlayerId, "a", "the granted immediate card ability does not steal the active turn");
  assert.equal(s.cards.quick.abilityUsage?.["basic.quick-march"]?.used, true);
});

test("Oblivion Correction follow ignores destination capacity but still requires an actual follow move", () => {
  const { engine, state } = setup("lobo-oblivion-capacity");
  state.players.l.locationId = "city";
  state.players.a.locationId = "workshop";
  state.players.b.locationId = "scouting";
  state.board.locations.workshop = ["a"];
  state.board.locations.mountain = [];
  state.board.locations.city = ["l"];
  state.board.locations.scouting = ["b"];
  state.activePlayerId = "a";
  state.phase = "action";
  state.step = "move-decision";
  const moved = engine.execute(state, cmd(state, "a-forward", CommandType.MovePlayer, "a", { locationId: "mountain" }));
  assert.equal(moved.state.pendingDecision?.kind, "lobo-oblivion-follow");
  let s = resolve(engine, moved.state, "l-follow-full-recon", "l", ["follow"]);
  assert.equal(s.players.l.locationId, "scouting");
  assert.deepEqual(new Set(s.board.locations.scouting), new Set(["b", "l"]));
  if (s.pendingDecision?.kind === "lobo-oblivion-attack") s = resolve(engine, s, "skip-attack", "l", []);
  assert.equal(s.players.l.locationId, "scouting");
});
