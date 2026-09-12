import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import {
  SHERLOCK_ELEMENTARY_ID,
  SHERLOCK_EMPTY_HOUSE_ID,
  SHERLOCK_RETRODUCTION_ID,
  getSherlockRetroductionRecord,
  resolveSherlockRetroduction,
  useSherlockElementary,
  useSherlockEmptyHouse,
  useSherlockRetroduction,
} from "../src/rules-core/sherlock.ts";

function setup(id = "sherlock-package") {
  const built = buildStandardContent(legacyContent);
  new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "p", name: "Sherlock" }, { id: "q", name: "Opponent" }],
    seed: 22117,
  });
  state.status = "playing";
  state.round = 1;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "p";
  state.turnOrder = ["p", "q"];
  state.players.p.servantId = "servant.sherlock";
  state.players.p.locationId = "mountain";
  state.players.q.locationId = "mountain";
  state.players.p.mana = 20;
  state.players.q.mana = 20;
  state.board.locations.mountain = ["p", "q"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, state };
}

function skill(built, id) {
  return built.skills.list().find((candidate) => candidate.id === id);
}

function add(state, playerId, instanceId, definitionId, zone = "attack", face = "up", active = true, originServantId) {
  createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face,
    active,
    ...(originServantId ? { originServantId } : {}),
  });
}

function installEmptyHouse(ctx) {
  add(ctx.state, "p", "empty-house", SHERLOCK_EMPTY_HOUSE_ID, "attack", "up", true, "servant.sherlock");
  ctx.state.cards["empty-house"].residual = true;
}

test("Sherlock package is 7/7 FULL and deduction marker cards are catalogue-only", () => {
  const { built } = setup("sherlock-full");
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "servant.sherlock");
  assert.equal(skills.length, 7);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.unmodeledClauses ?? []), []);
  for (const id of [4, 5, 6, 7]) {
    assert.equal(skill(built, `servant.sherlock.skill.sc-sherlock-${id}`).initiallyOwned, false);
  }
});

test("Empty House uses player-count-minus-round cost and its residual gains mana on Workshop deployment", () => {
  const ctx = setup("sherlock-empty-house");
  const { built, definitions, state } = ctx;
  const definition = definitions[SHERLOCK_EMPTY_HOUSE_ID];
  assert.equal(getCardPlayCost(state, definition, state.players.p, undefined, definitions), 1);
  state.round = 2;
  assert.equal(getCardPlayCost(state, definition, state.players.p, undefined, definitions), 0);

  installEmptyHouse(ctx);
  const before = state.players.p.mana;
  useSherlockEmptyHouse({
    state,
    player: state.players.p,
    skill: skill(built, SHERLOCK_EMPTY_HOUSE_ID),
    payload: { eventType: "player.deployed", event: { playerId: "p", locationId: "workshop" } },
    definitions,
  });
  assert.equal(state.players.p.mana, before + 1);
});

test("Memory Palace creates a secret deduction record; a matching basic play scores, discards it, and offers another deduction", () => {
  const ctx = setup("sherlock-retroduction");
  const { built, definitions, state } = ctx;
  installEmptyHouse(ctx);
  const emptyHouse = skill(built, SHERLOCK_EMPTY_HOUSE_ID);
  const retroduction = skill(built, SHERLOCK_RETRODUCTION_ID);

  const created = useSherlockEmptyHouse({
    state,
    player: state.players.p,
    skill: emptyHouse,
    payload: { abilityId: "mind-palace", attribute: "力量" },
    definitions,
  });
  assert.equal(created.attribute, "力量");
  const record = getSherlockRetroductionRecord(state, "p");
  assert.ok(record);
  assert.equal(record.definitionId, "servant.sherlock.skill.sc-sherlock-4");
  assert.equal(record.face, "down");

  add(state, "q", "q-strength", "card.cardb1", "attack", "up", true);
  let decision;
  const result = useSherlockRetroduction({
    state,
    player: state.players.p,
    skill: retroduction,
    payload: { eventType: "card.played", event: { playerId: "q", instanceId: "q-strength", definitionId: "card.cardb1", face: "up" } },
    definitions,
    openDecision: (value) => { decision = value; },
  });
  assert.equal(result.attribute, "力量");
  assert.equal(result.gainedVictoryPoints, 1);
  assert.equal(state.players.p.victoryPoints, 1);
  assert.equal(record.zone, "side-discard");
  assert.equal(record.face, "up");
  assert.equal(decision.kind, "sherlock-retroduction");
  assert.ok(decision.options.some((option) => option.id === "skip"));
});

test("an unresolved deduction record costs 3 VP at round end", () => {
  const ctx = setup("sherlock-penalty");
  const { built, definitions, state } = ctx;
  installEmptyHouse(ctx);
  useSherlockEmptyHouse({
    state,
    player: state.players.p,
    skill: skill(built, SHERLOCK_EMPTY_HOUSE_ID),
    payload: { abilityId: "mind-palace", attribute: "迅捷" },
    definitions,
  });
  state.players.p.victoryPoints = 5;
  const record = getSherlockRetroductionRecord(state, "p");
  const result = useSherlockRetroduction({
    state,
    player: state.players.p,
    skill: skill(built, SHERLOCK_RETRODUCTION_ID),
    payload: { eventType: "round.ending", event: { round: state.round } },
    definitions,
  });
  assert.equal(result.victoryPointDelta, -3);
  assert.equal(state.players.p.victoryPoints, 2);
  assert.equal(record.zone, "side-discard");
});

test("Elementary reveals the local opponent set, triggers the recorded type, and applies defeat", () => {
  const ctx = setup("sherlock-elementary");
  const { built, definitions, state } = ctx;
  installEmptyHouse(ctx);
  useSherlockEmptyHouse({
    state,
    player: state.players.p,
    skill: skill(built, SHERLOCK_EMPTY_HOUSE_ID),
    payload: { abilityId: "mind-palace", attribute: "力量" },
    definitions,
  });
  add(state, "p", "elementary", SHERLOCK_ELEMENTARY_ID, "attack", "up", true, "servant.sherlock");
  add(state, "q", "q-hand-strength", "card.cardb1", "hand", "down", false);
  state.phase = "combat";
  state.activePlayerId = "p";
  let nextDecision;
  const result = useSherlockElementary({
    state,
    player: state.players.p,
    skill: skill(built, SHERLOCK_ELEMENTARY_ID),
    payload: { abilityId: "elementary", targetPlayerId: "q" },
    definitions,
    openDecision: (value) => { nextDecision = value; },
  });
  assert.equal(result.targetPlayerId, "q");
  assert.equal(result.matched, true);
  assert.equal(result.attribute, "力量");
  assert.equal(result.defeated, true);
  assert.equal(state.players.q.defeated, true);
  assert.equal(state.players.p.victoryPoints, 1);
  assert.ok(result.shownInstanceIds.includes("q-hand-strength"));
  assert.equal(nextDecision.kind, "sherlock-retroduction");
});

test("Retroduction decision resolver can create a new derived record", () => {
  const ctx = setup("sherlock-resolve-record");
  const { built, definitions, state } = ctx;
  const result = resolveSherlockRetroduction({
    state,
    player: state.players.p,
    skill: skill(built, SHERLOCK_RETRODUCTION_ID),
    payload: {
      previous: { candidates: ["力量", "迅捷", "魔术", "特殊"], optional: false },
      decision: { status: "resolved", selections: ["特殊"] },
    },
    definitions,
  });
  assert.equal(result.attribute, "特殊");
  assert.equal(getSherlockRetroductionRecord(state, "p").definitionId, "servant.sherlock.skill.sc-sherlock-7");
});
