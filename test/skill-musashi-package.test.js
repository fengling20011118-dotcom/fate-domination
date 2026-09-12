import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower, calculateCombatPower } from "../src/rules-core/combat-power.ts";

const SIX_REALMS = "servant.musashi.skill.sc-musashi-1";
const NITEN = "servant.musashi.skill.sc-musashi-2";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function builtContent() {
  return buildStandardContent(legacyContent);
}

function definitions(built) {
  return { ...built.cards, ...built.skills.asCardDefinitions() };
}

function makeState(id, players = [{ id: "m", name: "Musashi" }, { id: "o", name: "Opponent" }]) {
  const state = createGameState({ gameInstanceId: id, players, seed: 1313 });
  state.status = "playing";
  state.round = 4;
  state.players.m.servantId = "servant.musashi";
  for (const player of players) state.players[player.id].locationId = "mountain";
  state.board.locations.mountain = players.map((player) => player.id);
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return state;
}

function addNiten(state) {
  createOwnedCardInstance(state, "m", { instanceId: "niten", definitionId: NITEN, zone: "servant-skills", face: "up", active: false });
}

test("Musashi package: all three skills are FULL with concrete handlers", () => {
  const built = builtContent();
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.musashi");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(SIX_REALMS).handlerId, "core.musashi-mastery");
  assert.equal(built.skills.get(NITEN).handlerId, "core.musashi-niten-ichiryu");
});

test("Six Realms grants 1 Mastery plus one per combat opponent, capped at 3 gained in the round", () => {
  const built = builtContent();
  const engine = new StandardMatchEngine(built);
  const state = makeState("musashi-mastery", [{ id: "m", name: "Musashi" }, { id: "a", name: "A" }, { id: "b", name: "B" }]);
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  createOwnedCardInstance(state, "m", { instanceId: "six-realms", definitionId: SIX_REALMS, zone: "attack", face: "up", active: true });
  engine.dynamicCards["test.musashi.low"] = { id: "test.musashi.low", name: "Low", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true };
  createOwnedCardInstance(state, "a", { instanceId: "a-low", definitionId: "test.musashi.low", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "b", { instanceId: "b-low", definitionId: "test.musashi.low", zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "musashi-win", CommandType.ResolveCombat, "m", { locationId: "mountain" }));
  assert.deepEqual(result.events.find((event) => event.type === "combat.resolved")?.payload.winnerIds, ["m"]);
  assert.equal(result.state.players.m.flags.musashiBoundaryMarkers, 3);
  assert.equal(result.state.players.m.flags.musashiBoundaryGainedThisRound, 3);
  assert.equal(result.state.players.m.flags.musashiBoundaryGainRound, 4);
});

test("Six Realms gives two Mastery for a normal one-on-one win", () => {
  const built = builtContent();
  const engine = new StandardMatchEngine(built);
  const state = makeState("musashi-mastery-duel");
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  createOwnedCardInstance(state, "m", { instanceId: "six-realms", definitionId: SIX_REALMS, zone: "attack", face: "up", active: true });
  engine.dynamicCards["test.musashi.low"] = { id: "test.musashi.low", name: "Low", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true };
  createOwnedCardInstance(state, "o", { instanceId: "low", definitionId: "test.musashi.low", zone: "attack", face: "up", active: true });
  const result = engine.execute(state, command(state, "musashi-duel-win", CommandType.ResolveCombat, "m", { locationId: "mountain" }));
  assert.equal(result.state.players.m.flags.musashiBoundaryMarkers, 2);
});

test("Niten Ichiryu at 2+ Mastery grants +5 total power when any two active attacks share base power", () => {
  const built = builtContent();
  const state = makeState("musashi-niten-two");
  addNiten(state);
  const defs = {
    ...definitions(built),
    "test.same-a": { id: "test.same-a", name: "Same A", cost: 0, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true },
    "test.same-b": { id: "test.same-b", name: "Same B", cost: 0, basePower: 3, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
    "test.other": { id: "test.other", name: "Other", cost: 0, basePower: 1, typeLabel: "魔术", attributes: ["魔术"], basic: true },
  };
  createOwnedCardInstance(state, "m", { instanceId: "same-a", definitionId: "test.same-a", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "m", { instanceId: "other", definitionId: "test.other", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "m", { instanceId: "same-b", definitionId: "test.same-b", zone: "attack", face: "up", active: true });
  state.players.m.flags.musashiBoundaryMarkers = 2;
  assert.equal(calculateCombatPower(state, state.players.m, defs, "mountain"), 12); // 3 + 1 + 3 + 5
  state.players.m.flags.musashiBoundaryMarkers = 1;
  assert.equal(calculateCombatPower(state, state.players.m, defs, "mountain"), 7);
});

test("Niten Ichiryu at 7+ doubles basic base power, and at 12+ doubles only Musashi skill base power", () => {
  const built = builtContent();
  const state = makeState("musashi-niten-base");
  addNiten(state);
  const defs = {
    ...definitions(built),
    "test.basic-four": { id: "test.basic-four", name: "Basic Four", cost: 0, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true },
    "test.master-skill": { id: "test.master-skill", name: "Master Skill", cost: 0, basePower: 4, typeLabel: "特殊", attributes: ["特殊"], isSkill: true, ownerType: "master", ownerDefinitionId: "master.test" },
  };
  createOwnedCardInstance(state, "m", { instanceId: "basic-four", definitionId: "test.basic-four", zone: "attack", face: "up", active: true });
  state.players.m.flags.musashiBoundaryMarkers = 7;
  assert.equal(calculateCombatCardPower(state, state.players.m, "basic-four", defs, "mountain"), 8);

  state.players.m.attack = [];
  state.cards["basic-four"].zone = "discard";
  createOwnedCardInstance(state, "m", { instanceId: "musashi-skill", definitionId: SIX_REALMS, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "m", { instanceId: "master-skill", definitionId: "test.master-skill", zone: "attack", face: "up", active: true });
  state.players.m.flags.musashiBoundaryMarkers = 12;
  assert.equal(calculateCombatCardPower(state, state.players.m, "musashi-skill", defs, "mountain"), 16);
  assert.equal(calculateCombatCardPower(state, state.players.m, "master-skill", defs, "mountain"), 4);
});
