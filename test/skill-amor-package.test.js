import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import {
  grantRulerSeal,
  listRulerSealsControlledBy,
  listRulerSealsOnPlayer,
  listRulerSealUses,
} from "../src/rules-core/ruler-seals.ts";
import { AMOR_CALLING_AGAPE_ID, AMOR_GOLDEN_ARROW_ID, AMOR_RULER_ID } from "../src/rules-core/amor.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "amor-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "r", name: "Amor" }, { id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
    seed: 9821,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "r";
  state.turnOrder = ["r", "a", "b", "c"];
  state.players.r.servantId = "servant.amor";
  for (const id of ["r", "a", "b"]) {
    state.players[id].locationId = "mountain";
    state.players[id].mana = 20;
  }
  state.players.c.locationId = "city";
  state.players.c.mana = 20;
  state.board.locations.mountain = ["r", "a", "b"];
  state.board.locations.city = ["c"];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function addActiveSkill(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "r", { instanceId, definitionId, zone: "attack", face: "up", active: true });
  state.cards[instanceId].playedRound = state.round;
}

function resolve(engine, state, id, actorId, selections) {
  return engine.execute(state, command(state, id, CommandType.ResolveDecision, actorId, {
    decisionId: state.pendingDecision.decisionId,
    selections,
  }));
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload) {
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${++passiveCounter}`,
    sourceCommandId: "amor-test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

function useJudgment(engine, state, first, second) {
  let result = engine.execute(state, command(state, "amor-judgment", CommandType.UseSkill, "r", {
    skillId: AMOR_RULER_ID,
    data: { abilityId: "divine-judgment" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "ruler-divine-judgment-first-target");
  result = resolve(engine, result.state, "amor-judgment-first", "r", [first]);
  assert.equal(result.state.pendingDecision?.kind, "ruler-divine-judgment-second-target");
  result = resolve(engine, result.state, "amor-judgment-second", "r", [second]);
  return result;
}

test("Amor package is 3/3 FULL and all three skills are executable", () => {
  const { built } = setup("amor-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.amor");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(built.skills.get(AMOR_RULER_ID).handlerId, "core.ruler-class");
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.unmodeledClauses ?? []), []);
});

test("Amor reuses shared Ruler Class and binds two least-bound opponents", () => {
  const { engine, state } = setup("amor-ruler");
  const result = useJudgment(engine, state, "a", "b");
  assert.equal(listRulerSealsControlledBy(result.state, "r").length, 2);
  assert.deepEqual(new Set(listRulerSealsControlledBy(result.state, "r").map((seal) => seal.boundPlayerId)), new Set(["a", "b"]));
});

test("Golden Arrow lets one Ruler Seal choose two actions, restricts movement to Amor's battlefield, records use, and rebinds a winning target", () => {
  const { engine, definitions, state } = setup("amor-golden-arrow");
  addActiveSkill(state, "golden", AMOR_GOLDEN_ARROW_ID);
  createOwnedCardInstance(state, "c", { instanceId: "c-hand", definitionId: "card.cardq4", zone: "hand", face: "down", active: false });
  state.players.c.mana = 0;
  const seal = grantRulerSeal(state, "r", "c", AMOR_RULER_ID);

  let result = engine.execute(state, command(state, "golden-seal-use", CommandType.UseSkill, "r", {
    skillId: AMOR_RULER_ID,
    data: { abilityId: "ruler-seal-command" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "ruler-seal-command-mode");
  assert.equal(result.state.pendingDecision?.max, 2);
  assert.deepEqual(new Set(result.state.pendingDecision?.options.map((option) => option.id)), new Set(["move", "lock", "free-play"]));

  result = resolve(engine, result.state, "golden-two-actions", "r", ["move", "free-play"]);
  assert.equal(result.state.players.c.locationId, "mountain");
  assert.equal(result.state.pendingDecision?.kind, "ruler-seal-free-play-card");
  result = resolve(engine, result.state, "golden-free-card", "c", ["c-hand"]);
  assert.equal(result.state.cards["c-hand"].zone, "attack");
  assert.equal(result.state.cards["c-hand"].paidCost, 0);
  assert.equal(listRulerSealsControlledBy(result.state, "r").length, 0);
  assert.deepEqual(listRulerSealUses(result.state, "r", 4).map((use) => [use.sealId, use.boundPlayerId]), [[seal.sealId, "c"]]);

  emitPassive(engine, result.state, definitions, "combat.resolved", {
    locationId: "mountain",
    participantIds: ["r", "c"],
    powers: { r: 3, c: 8 },
    winnerIds: ["c"],
  });
  const rebound = listRulerSealsControlledBy(result.state, "r");
  assert.equal(rebound.length, 1);
  assert.equal(rebound[0].boundPlayerId, "c");
  assert.equal(rebound[0].sourceId, AMOR_GOLDEN_ARROW_ID);
});

test("Calling Agape transfers all Ruler Seals off an eliminated bound player to one chosen opponent", () => {
  const { engine, definitions, state } = setup("amor-agape-transfer");
  addActiveSkill(state, "agape", AMOR_CALLING_AGAPE_ID);
  grantRulerSeal(state, "r", "a", AMOR_RULER_ID);
  grantRulerSeal(state, "r", "a", AMOR_RULER_ID);
  state.players.a.eliminated = true;

  emitPassive(engine, state, definitions, "elimination.resolved", { round: 4, eliminatedPlayerIds: ["a"] });
  assert.equal(state.pendingDecision?.kind, "amor-agape-transfer");
  assert.deepEqual(new Set(state.pendingDecision?.options.map((option) => option.id)), new Set(["b", "c"]));
  const result = resolve(engine, state, "agape-transfer", "r", ["b"]);
  assert.equal(listRulerSealsOnPlayer(result.state, "a").length, 0);
  assert.equal(listRulerSealsOnPlayer(result.state, "b").length, 2);
  assert.ok(listRulerSealsOnPlayer(result.state, "b").every((seal) => seal.controllerPlayerId === "r"));
});

test("Absolute Surrender sets only players with 3+ Ruler Seals in Amor's fight to zero total power", () => {
  const { engine, definitions, state } = setup("amor-absolute-surrender");
  addActiveSkill(state, "agape", AMOR_CALLING_AGAPE_ID);
  createOwnedCardInstance(state, "a", { instanceId: "a-basic", definitionId: "card.cardq4", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "b", { instanceId: "b-basic", definitionId: "card.cardq4", zone: "attack", face: "up", active: true });
  for (let i = 0; i < 3; i += 1) grantRulerSeal(state, "r", "a", AMOR_RULER_ID);
  grantRulerSeal(state, "r", "b", AMOR_RULER_ID);
  const beforeA = calculateCombatPower(state, state.players.a, definitions, "mountain");
  const beforeB = calculateCombatPower(state, state.players.b, definitions, "mountain");
  assert.ok(beforeA > 0 && beforeB > 0);

  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "r";
  const result = engine.execute(state, command(state, "absolute-surrender", CommandType.UseSkill, "r", {
    skillId: AMOR_CALLING_AGAPE_ID,
    data: { abilityId: "absolute-surrender" },
  }));
  assert.equal(calculateCombatPower(result.state, result.state.players.a, definitions, "mountain"), 0);
  assert.equal(calculateCombatPower(result.state, result.state.players.b, definitions, "mountain"), beforeB);
});
