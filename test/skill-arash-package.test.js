import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, closePlayerCard } from "../src/rules-core/decks.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { useArashStella } from "../src/rules-core/skill-handlers.ts";

const PRAYER = "servant.arash.skill.sc-arash-1";
const CLAIRVOYANCE = "servant.arash.skill.sc-arash-2";
const STELLA = "servant.arash.skill.sc-arash-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "arash") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "a", name: "Arash" }, { id: "o", name: "Opponent" }], seed: 8801 });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = ["a", "o"];
  state.players.a.servantId = "servant.arash";
  state.players.a.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["a", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

test("Arash package: all three skills are FULL", () => {
  const { built } = setup("arash-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.arash");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(CLAIRVOYANCE).handlerId, "core.arash-clairvoyance");
  assert.equal(built.skills.get(STELLA).handlerId, "core.arash-stella");
  assert.deepEqual(built.skills.get(STELLA).tags?.filter((tag) => tag.includes("cannot-") || tag === "opponent-close-immune").sort(), ["cannot-copy", "cannot-steal", "opponent-close-immune"].sort());
});

test("Clairvoyance doubles current Terrain Advantage during action", () => {
  const { engine, state } = setup("arash-terrain");
  createOwnedCardInstance(state, "a", { instanceId: "clairvoyance", definitionId: CLAIRVOYANCE, zone: "attack", face: "up", active: true });
  state.players.a.flags.deploymentBonusActive = true;
  state.players.a.flags.deploymentLocationId = "mountain";
  state.players.a.flags.deploymentBonus = 3;
  const result = engine.execute(state, command(state, "arash-terrain-use", CommandType.UseSkill, "a", {
    skillId: CLAIRVOYANCE,
    data: { abilityId: "clairvoyance-double-terrain" },
  }));
  assert.equal(result.state.players.a.flags.deploymentBonus, 6);
});

test("Clairvoyance discards the deck top and grants +3 total power when printed base power matches", () => {
  const { engine, state } = setup("arash-clairvoyance");
  createOwnedCardInstance(state, "a", { instanceId: "clairvoyance", definitionId: CLAIRVOYANCE, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "basic", definitionId: "card.cardb2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "top", definitionId: "card.cardb2", zone: "deck", face: "down", active: false });
  state.phase = "combat";
  state.step = "player-window";

  let result = engine.execute(state, command(state, "arash-clairvoyance-use", CommandType.UseSkill, "a", {
    skillId: CLAIRVOYANCE,
    data: { abilityId: "clairvoyance-top-card" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "arash-clairvoyance-basic-attack");
  result = engine.execute(result.state, command(result.state, "arash-clairvoyance-pick", CommandType.ResolveDecision, "a", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["basic"],
  }));
  assert.ok(result.state.players.a.discard.includes("top"));
  assert.equal(result.state.cards.top.face, "up");
  assert.equal(result.state.players.a.flags.roundPowerBonus, 3);
});

test("Stella gives 6 VP on a win, kills Arash, removes other Arash skills, and keeps basics", () => {
  const { built, definitions, state } = setup("arash-stella");
  createOwnedCardInstance(state, "a", { instanceId: "prayer", definitionId: PRAYER, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "a", { instanceId: "clairvoyance", definitionId: CLAIRVOYANCE, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "a", { instanceId: "stella", definitionId: STELLA, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "a", { instanceId: "basic", definitionId: "card.cardb2", zone: "hand", face: "down", active: false });
  useArashStella({
    state,
    player: state.players.a,
    skill: built.skills.get(STELLA),
    payload: { eventType: "combat.resolved", event: { locationId: "mountain", winnerIds: ["a"], powers: { a: 15, o: 7 } } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(state.players.a.victoryPoints, 6);
  assert.equal(state.players.a.servantId, null);
  assert.equal(state.cards.stella.zone, "removed");
  assert.equal(state.cards.clairvoyance.zone, "removed");
  assert.equal(state.cards.prayer.zone, "servant-skills");
  assert.equal(state.cards.basic.zone, "hand");
});

test("Stella cannot be closed by an opponent ability", () => {
  const { definitions, state } = setup("arash-stella-protection");
  createOwnedCardInstance(state, "a", { instanceId: "stella", definitionId: STELLA, zone: "attack", face: "up", active: true });
  assert.throws(() => closePlayerCard(state, "a", "stella", definitions, { closedByPlayerId: "o" }), /CARD_CLOSE_PROTECTED/);
  assert.equal(state.cards.stella.zone, "attack");
  assert.equal(state.cards.stella.active, true);
});
