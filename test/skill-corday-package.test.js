import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";

const CONCEALMENT = "servant.corday.skill.sc-corday-1";
const PLAN = "servant.corday.skill.sc-corday-2";
const DREAM = "servant.corday.skill.sc-corday-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "corday", players = [{ id: "c", name: "Corday" }, { id: "t", name: "Target" }, { id: "o", name: "Other" }]) {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players, seed: 1818 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "c";
  state.turnOrder = players.map((player) => player.id);
  state.players.c.servantId = "servant.corday";
  state.board.locations.workshop = [];
  state.board.locations.mountain = [];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, engine, definitions, state };
}

function place(state, playerId, locationId) {
  for (const location of Object.keys(state.board.locations)) state.board.locations[location] = state.board.locations[location].filter((id) => id !== playerId);
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload = {}) {
  passiveCounter += 1;
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${passiveCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Corday package: all three skills are FULL with concrete handlers", () => {
  const { built } = setup("corday-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.corday");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(CONCEALMENT).handlerId, "core.presence-concealment");
  assert.equal(built.skills.get(PLAN).handlerId, "core.corday-foolish-plan");
  assert.equal(built.skills.get(DREAM).handlerId, "core.corday-dream");
});

test("Foolish Plan secretly records one living opponent in outpost while Corday is in Workshop", () => {
  const { engine, definitions, state } = setup("corday-plan-target");
  place(state, "c", "workshop");
  place(state, "t", "mountain");
  place(state, "o", "city");
  state.phase = "outpost";
  state.activePlayerId = "c";
  emitPassive(engine, state, definitions, "phase.transitioned", { previousPhase: "preparation", transition: "next-phase" });
  assert.equal(state.pendingDecision?.kind, "corday-foolish-plan-target");
  assert.equal(state.pendingDecision?.ownerPlayerId, "c");
  assert.equal(state.pendingDecision?.allowCancel, true);
  assert.deepEqual(new Set(state.pendingDecision?.options.map((option) => option.id)), new Set(["t", "o"]));

  const result = engine.execute(state, command(state, "corday-plan-pick", CommandType.ResolveDecision, "c", {
    decisionId: state.pendingDecision.decisionId,
    selections: ["t"],
  }));
  assert.equal(result.state.players.c.flags.cordayPlanTargetRound, 4);
  assert.equal(result.state.players.c.flags.cordayPlanTargetPlayerId, "t");
});

test("Foolish Plan gives exactly 2 VP when Corday wins a combat that includes the recorded target", () => {
  const { engine, state } = setup("corday-plan-reward");
  place(state, "c", "mountain");
  place(state, "t", "mountain");
  place(state, "o", "city");
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  state.players.c.flags.cordayPlanTargetRound = 4;
  state.players.c.flags.cordayPlanTargetPlayerId = "t";
  state.players.c.flags.roundPowerBonus = 10;
  state.players.c.victoryPoints = 1;
  createOwnedCardInstance(state, "c", { instanceId: "corday-attack", definitionId: "card.cardq2", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "t", { instanceId: "target-attack", definitionId: "card.cardq2", zone: "attack", face: "up", active: true });
  const before = state.players.c.victoryPoints;
  const result = engine.execute(state, command(state, "corday-plan-combat", CommandType.ResolveCombat, "c", { locationId: "mountain" }));
  const combat = result.events.find((event) => event.type === "combat.resolved");
  assert.deepEqual(combat?.payload.winnerIds, ["c"]);
  const printedReward = Number(combat?.payload.victoryPoints?.c ?? 0);
  assert.equal(result.state.players.c.victoryPoints - before, printedReward + 2);
});

test("Dream action ability can play any number of basic Special attacks and pays their actual total cost", () => {
  const { engine, state } = setup("corday-dream-specials");
  place(state, "c", "mountain");
  place(state, "t", "city");
  place(state, "o", "workshop");
  state.players.c.mana = 10;
  createOwnedCardInstance(state, "c", { instanceId: "dream", definitionId: DREAM, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "c", { instanceId: "luck", definitionId: "card.cardluck", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "c", { instanceId: "remote", definitionId: "card.cardpreparation", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "c", { instanceId: "march", definitionId: "card.cardsurveil", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "c", { instanceId: "strength", definitionId: "card.cardb2", zone: "hand", face: "down", active: false });

  let result = engine.execute(state, command(state, "corday-dream-open", CommandType.UseSkill, "c", {
    skillId: DREAM,
    data: { abilityId: "dream-play-specials" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "corday-dream-special-attacks");
  assert.deepEqual(new Set(result.state.pendingDecision?.options.map((option) => option.id)), new Set(["luck", "remote", "march"]));
  assert.equal(result.state.pendingDecision?.max, 3);
  result = engine.execute(result.state, command(result.state, "corday-dream-play", CommandType.ResolveDecision, "c", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["luck", "remote", "march"],
  }));
  assert.equal(result.state.players.c.mana, 8); // 0 + 1 + 1
  for (const id of ["luck", "remote", "march"]) {
    assert.equal(result.state.cards[id].zone, "attack");
    assert.equal(result.state.cards[id].active, true);
    assert.equal(result.state.cards[id].face, "up");
  }
  assert.equal(result.state.cards.luck.paidCost, 0);
  assert.equal(result.state.cards.remote.paidCost, 1);
  assert.equal(result.state.cards.march.paidCost, 1);
  assert.equal(result.state.cards.strength.zone, "hand");
});

test("Dream combat ability defeats the recorded target only while that target is fighting Corday", () => {
  const { engine, state } = setup("corday-dream-defeat");
  place(state, "c", "mountain");
  place(state, "t", "mountain");
  place(state, "o", "city");
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "c";
  state.players.c.flags.cordayPlanTargetRound = 4;
  state.players.c.flags.cordayPlanTargetPlayerId = "t";
  createOwnedCardInstance(state, "c", { instanceId: "dream", definitionId: DREAM, zone: "attack", face: "up", active: true });
  const result = engine.execute(state, command(state, "corday-dream-defeat-target", CommandType.UseSkill, "c", {
    skillId: DREAM,
    data: { abilityId: "dream-defeat-target" },
  }));
  assert.equal(result.state.players.t.defeated, true);
  assert.ok(result.events.some((event) => event.type === "player.defeated" && event.payload.playerId === "t"));
});
