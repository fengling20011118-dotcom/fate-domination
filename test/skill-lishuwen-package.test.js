import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import {
  LISHUWEN_NO_SECOND_STRIKE_ID,
  LISHUWEN_QIJING_ID,
  getLishuwenJinCards,
  resolveLishuwenQijing,
  useLishuwenNoSecondStrike,
  useLishuwenQijing,
} from "../src/rules-core/lishuwen.ts";

function setup(id = "lishuwen-package") {
  const built = buildStandardContent(legacyContent);
  new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "p", name: "Li" }, { id: "q", name: "Opponent" }],
    seed: 8128,
  });
  state.status = "playing";
  state.round = 2;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "p";
  state.turnOrder = ["p", "q"];
  state.players.p.servantId = "servant.lishuwen";
  state.players.p.locationId = "mountain";
  state.players.q.locationId = "mountain";
  state.players.p.mana = 10;
  state.players.q.mana = 10;
  state.board.locations.mountain = ["p", "q"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, state };
}

function skill(built, id) {
  return built.skills.list().find((candidate) => candidate.id === id);
}

function add(state, playerId, instanceId, definitionId, zone, face = "up", active = false) {
  return createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active, originServantId: playerId === "p" ? "servant.lishuwen" : undefined });
}

test("Li Shuwen package is 3/3 FULL", () => {
  const { built } = setup("lishuwen-full");
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "servant.lishuwen");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.unmodeledClauses ?? []), []);
});

test("Sphere Boundary pays 3, hides the servant skill zone, and enables the generic Jin set-aside source", () => {
  const { built, definitions, state } = setup("lishuwen-qijing");
  add(state, "p", "qijing-skill", LISHUWEN_QIJING_ID, "servant-skills", "up", false);
  add(state, "p", "no-second-skill", LISHUWEN_NO_SECOND_STRIKE_ID, "servant-skills", "up", false);
  state.players.p.trueNameRevealed = true;
  const result = useLishuwenQijing({
    state,
    player: state.players.p,
    skill: skill(built, LISHUWEN_QIJING_ID),
    payload: { abilityId: "activate-sphere-boundary" },
    definitions,
  });
  assert.equal(result.paidMana, 3);
  assert.equal(state.players.p.mana, 7);
  assert.equal(state.players.p.flags.lishuwenSphereBoundaryActive, true);
  assert.equal(state.players.p.flags.actionCardSetAsideSourceId, LISHUWEN_QIJING_ID);
  assert.equal(state.players.p.trueNameRevealed, false);
  assert.equal(state.cards["qijing-skill"].face, "down");
  assert.equal(state.cards["no-second-skill"].face, "down");
});

test("Sphere Boundary releases every Jin in Combat and grants face-up Jin Action abilities in Combat", () => {
  const { built, definitions, state } = setup("lishuwen-release");
  add(state, "p", "qijing-skill", LISHUWEN_QIJING_ID, "servant-skills", "down", false);
  state.players.p.flags.lishuwenSphereBoundaryActive = true;
  state.players.p.flags.actionCardSetAsideSourceId = LISHUWEN_QIJING_ID;
  const jin = add(state, "p", "jin-1", "card.cardb1", "removed", "down", false);
  jin.setAsideForCombat = { sourceId: LISHUWEN_QIJING_ID, round: state.round };
  state.phase = "combat";
  let decision;
  useLishuwenQijing({
    state,
    player: state.players.p,
    skill: skill(built, LISHUWEN_QIJING_ID),
    payload: { eventType: "phase.transitioned", event: { previousPhase: "action", transition: "next-phase" } },
    definitions,
    openDecision: (value) => { decision = value; },
  });
  assert.equal(decision.kind, "lishuwen-release-jin");
  const result = resolveLishuwenQijing({
    state,
    player: state.players.p,
    skill: skill(built, LISHUWEN_QIJING_ID),
    payload: { previous: { instanceIds: ["jin-1"] }, decision: { status: "resolved", selections: ["up:jin-1"] } },
    definitions,
  });
  assert.deepEqual(result.faceUpInstanceIds, ["jin-1"]);
  assert.equal(state.cards["jin-1"].zone, "attack");
  assert.equal(state.cards["jin-1"].face, "up");
  assert.equal(state.cards["jin-1"].active, true);
  assert.equal(getLishuwenJinCards(state, "p").length, 0);
  assert.ok(state.players.p.cardRuleModifiers.some((modifier) => modifier.targetInstanceIds?.includes("jin-1") && modifier.allowActionAbilityInCombat === true));
});

test("Sphere Boundary persists until defeat and then clears its replacement source", () => {
  const { built, definitions, state } = setup("lishuwen-defeat");
  add(state, "p", "qijing-skill", LISHUWEN_QIJING_ID, "servant-skills", "down", false);
  state.players.p.flags.lishuwenSphereBoundaryActive = true;
  state.players.p.flags.actionCardSetAsideSourceId = LISHUWEN_QIJING_ID;
  const result = useLishuwenQijing({
    state,
    player: state.players.p,
    skill: skill(built, LISHUWEN_QIJING_ID),
    payload: { eventType: "player.defeated", event: { playerId: "p" } },
    definitions,
  });
  assert.equal(result.ended, true);
  assert.equal(state.players.p.flags.lishuwenSphereBoundaryActive, undefined);
  assert.equal(state.players.p.flags.actionCardSetAsideSourceId, undefined);
});

test("No Second Strike removes a matching hidden attack, defeats the engaged opponent, and doubles itself", () => {
  const { built, definitions, state } = setup("lishuwen-no-second");
  state.phase = "combat";
  add(state, "p", "no-second", LISHUWEN_NO_SECOND_STRIKE_ID, "attack", "up", true);
  add(state, "p", "own-hidden", "card.cardb1", "attack", "down", false);
  add(state, "q", "opp-strength", "card.cardb1", "attack", "up", true);
  const result = useLishuwenNoSecondStrike({
    state,
    player: state.players.p,
    skill: skill(built, LISHUWEN_NO_SECOND_STRIKE_ID),
    payload: { abilityId: "one-strike-defeat", targetPlayerId: "q", ownHiddenInstanceId: "own-hidden" },
    definitions,
  });
  assert.equal(result.targetPlayerId, "q");
  assert.equal(result.removedInstanceId, "own-hidden");
  assert.equal(result.defeated, true);
  assert.equal(state.cards["own-hidden"].zone, "removed");
  assert.equal(state.players.q.defeated, true);
  assert.ok(state.cards["no-second"].powerModifiers.some((modifier) => modifier.kind === "multiply" && modifier.value === 2));
});
