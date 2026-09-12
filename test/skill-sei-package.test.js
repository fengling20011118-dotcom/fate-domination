import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  SEI_EMOTIONAL_ABILITY,
  SEI_EMOTIONAL_ID,
  SEI_HANDLER,
  SEI_NOSTALGIA_ID,
  SEI_VIVID_ABILITY,
  SEI_VIVID_ID,
  useSeiNostalgia,
} from "../src/rules-core/sei.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  "card.test.str4": { id: "card.test.str4", name: "Str4", cardType: "attack", cost: 0, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.agi5": { id: "card.test.agi5", name: "Agi5", cardType: "attack", cost: 0, basePower: 5, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
  "card.test.prep": { id: "card.test.prep", name: "Prep2", cardType: "attack", cost: 0, basePower: 2, typeLabel: "特殊", attributes: ["特殊"], basic: true, cardAbilityIds: ["basic.remote-control"], phases: ["action"] },
};

function skill(id) { return built.skills.get(id); }

function setup(id = "sei") {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "s", name: "Sei" }, { id: "a", name: "A" }, { id: "b", name: "B" }], seed: 771 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "a", "b"];
  state.players.s.servantId = "servant.sei";
  for (const id of ["s", "a", "b"]) {
    state.players[id].locationId = "mountain";
    state.players[id].mana = 20;
  }
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["s", "a", "b"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return state;
}

function add(state, playerId, instanceId, definitionId, zone = "attack", active = true) {
  return createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face: "up", active });
}

function ctx(state, playerId, skillDefinition, payload, extra = {}) {
  return { state, player: state.players[playerId], skill: skillDefinition, definitions, payload, openDecision() {}, ...extra };
}

function setHistory(state, playerId, round, ids) {
  state.modeState.cardPlayDefinitionHistory = { ...(state.modeState.cardPlayDefinitionHistory ?? {}), [playerId]: { [String(round)]: [...ids] } };
}

test("Sei package is 3/3 FULL with a dedicated handler", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "servant.sei");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => candidate.handlerId === SEI_HANDLER));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  for (const candidate of skills) {
    assert.deepEqual(candidate.rules?.ambiguities ?? [], []);
    assert.deepEqual(candidate.rules?.unmodeledClauses ?? [], []);
  }
});

test("Nostalgia Drive copies previous-round basic power up to +10, types, and one chosen card ability", () => {
  const state = setup("sei-nostalgia");
  setHistory(state, "s", 3, ["card.test.str4", "card.test.agi5", "card.test.prep"]);
  add(state, "s", "s:nostalgia", SEI_NOSTALGIA_ID);
  const result = useSeiNostalgia(ctx(state, "s", skill(SEI_NOSTALGIA_ID), {
    eventType: "card.played",
    event: { playerId: "s", instanceId: "s:nostalgia", definitionId: SEI_NOSTALGIA_ID, copiedAbilityId: "basic.remote-control" },
  }));
  assert.equal(result.copiedAbilityId, "basic.remote-control");
  assert.equal(calculateCombatCardPower(state, state.players.s, "s:nostalgia", definitions, "mountain"), 10);
  assert.deepEqual(new Set(state.cards["s:nostalgia"].attributeOverrides), new Set(["力量", "迅捷", "特殊"]));
  assert.deepEqual(state.cards["s:nostalgia"].grantedCardAbilities, [{ abilityId: "basic.remote-control", sourceDefinitionId: "card.test.prep", phases: ["action"] }]);
});

test("Emotional Engine creates one once-per-game Nostalgia copy for each opponent and caps their Nostalgia power at 0", () => {
  const state = setup("sei-emotional");
  state.phase = "combat";
  add(state, "s", "s:emotional", SEI_EMOTIONAL_ID);
  const result = useSeiNostalgia(ctx(state, "s", skill(SEI_EMOTIONAL_ID), { abilityId: SEI_EMOTIONAL_ABILITY }));
  assert.equal(result.createdInstanceIds.length, 2);
  const copyId = result.createdInstanceIds.find((id) => state.cards[id].ownerPlayerId === "a");
  assert.ok(copyId);
  assert.equal(state.cards[copyId].usageLimitOverride, "once-per-game");
  movePlayerCard(state, "a", copyId, "attack");
  state.cards[copyId].active = true;
  state.cards[copyId].face = "up";
  state.cards[copyId].powerModifiers = [{ id: "boost", sourceId: "test", kind: "add", value: 20, duration: "round" }];
  assert.equal(calculateCombatCardPower(state, state.players.a, copyId, definitions, "mountain"), 0);
});

test("Hyper Vibes borrows an opponent Nostalgia from their skill zone, pays its printed cost, and keeps that opponent as history source", () => {
  const state = setup("sei-vivid");
  add(state, "s", "s:vivid", SEI_VIVID_ID);
  const copy = add(state, "a", "a:nostalgia", SEI_NOSTALGIA_ID, "servant-skills", false);
  copy.usageLimitOverride = "once-per-game";
  setHistory(state, "a", 3, ["card.test.str4"]);
  const before = state.players.s.mana;
  const used = useSeiNostalgia(ctx(state, "s", skill(SEI_VIVID_ID), { abilityId: SEI_VIVID_ABILITY, instanceIds: ["a:nostalgia"] }));
  assert.equal(used.played.length, 1);
  assert.equal(state.cards["a:nostalgia"].controllerPlayerId, "s");
  assert.equal(state.cards["a:nostalgia"].zone, "attack");
  assert.equal(state.players.s.mana, before - 2);
  useSeiNostalgia(ctx(state, "a", skill(SEI_NOSTALGIA_ID), {
    eventType: "card.played", event: { playerId: "s", instanceId: "a:nostalgia", definitionId: SEI_NOSTALGIA_ID },
  }));
  assert.equal(calculateCombatCardPower(state, state.players.s, "a:nostalgia", definitions, "mountain"), 7);
  assert.deepEqual(state.cards["a:nostalgia"].attributeOverrides, ["力量"]);
});

test("Vivid gives +3 to a one-type Nostalgia and Elate caps Sei's gain at 3 per round across copies", () => {
  const state = setup("sei-elate");
  add(state, "s", "s:vivid", SEI_VIVID_ID);
  setHistory(state, "a", 3, ["card.test.str4"]);
  setHistory(state, "b", 3, ["card.test.agi5"]);
  add(state, "a", "a:n", SEI_NOSTALGIA_ID);
  add(state, "b", "b:n", SEI_NOSTALGIA_ID);
  useSeiNostalgia(ctx(state, "a", skill(SEI_NOSTALGIA_ID), { eventType: "card.played", event: { playerId: "a", instanceId: "a:n", definitionId: SEI_NOSTALGIA_ID } }));
  useSeiNostalgia(ctx(state, "b", skill(SEI_NOSTALGIA_ID), { eventType: "card.played", event: { playerId: "b", instanceId: "b:n", definitionId: SEI_NOSTALGIA_ID } }));
  assert.equal(calculateCombatCardPower(state, state.players.a, "a:n", definitions, "mountain"), 7);
  state.phase = "combat";
  useSeiNostalgia(ctx(state, "a", skill(SEI_NOSTALGIA_ID), { eventType: "combat.resolved", event: { locationId: "mountain", winnerIds: ["a"] } }));
  useSeiNostalgia(ctx(state, "b", skill(SEI_NOSTALGIA_ID), { eventType: "combat.resolved", event: { locationId: "mountain", winnerIds: ["b"] } }));
  assert.equal(state.players.a.victoryPoints, 2);
  assert.equal(state.players.b.victoryPoints, 2);
  assert.equal(state.players.s.victoryPoints, 3);
});
