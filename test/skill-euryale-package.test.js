import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, closePlayerCard } from "../src/rules-core/decks.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { projectPublicState } from "../src/projection/project-state.ts";

const ARCHER = "servant.euryale.skill.sc-euryale-1";
const SIREN = "servant.euryale.skill.sc-euryale-2";
const EYE = "servant.euryale.skill.sc-euryale-3";

function command(state, commandId, type, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId: "e", expectedRevision: state.revision, type, payload };
}

function setup(id = "euryale-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "e", name: "Euryale" }, { id: "o", name: "Opponent" }], seed: 1601 });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "e";
  state.turnOrder = ["o", "e"];
  state.players.e.servantId = "servant.euryale";
  state.players.e.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["e", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function addSkill(state, instanceId, definitionId, zone = "servant-skills", face = "down", active = false) {
  createOwnedCardInstance(state, "e", { instanceId, definitionId, zone, face, active });
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload) {
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${++passiveCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Euryale package: all three skills are FULL with reviewed handlers", () => {
  const { built } = setup("euryale-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.euryale");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(ARCHER).handlerId, "core.independent-action");
  assert.equal(built.skills.get(SIREN).handlerId, "core.euryale-siren-song");
  assert.equal(built.skills.get(EYE).handlerId, "core.euryale-eye");
});

test("Siren Song reduces same-location hand/skill attack cost by one without affecting a player elsewhere", () => {
  const { definitions, state } = setup("euryale-siren-cost");
  addSkill(state, "siren", SIREN);
  createOwnedCardInstance(state, "o", { instanceId: "op-skill", definitionId: "servant.altera.skill.sc-altera-2", zone: "servant-skills", face: "down", active: false });
  assert.equal(getCardPlayCost(state, definitions["servant.altera.skill.sc-altera-2"], state.players.o, state.cards["op-skill"], definitions), 9);
  state.players.o.locationId = "city";
  state.board.locations.mountain = ["e"];
  state.board.locations.city = ["o"];
  assert.equal(getCardPlayCost(state, definitions["servant.altera.skill.sc-altera-2"], state.players.o, state.cards["op-skill"], definitions), 10);
});

test("Siren duet requires eight mana, ignores Archer Class seat restriction, and defers its reward to action end", () => {
  const { engine, definitions, state } = setup("euryale-siren-duet");
  addSkill(state, "archer", ARCHER);
  addSkill(state, "siren", SIREN);
  state.players.e.mana = 7;
  assert.ok(!engine.getLegalActions(state, "e").some((action) => action.type === CommandType.UseSkill && action.payload?.skillId === SIREN));

  state.players.e.mana = 8;
  let result = engine.execute(state, command(state, "siren-duet", CommandType.UseSkill, {
    skillId: SIREN,
    data: { abilityId: "siren-song-duet" },
  }));
  assert.equal(result.state.cards.siren.zone, "attack");
  assert.equal(result.state.cards.archer.zone, "attack");
  assert.equal(result.state.cards.siren.active, true);
  assert.equal(result.state.cards.archer.active, true);
  assert.equal(result.state.players.e.mana, 5);
  assert.equal(Number(result.state.players.e.flags.faceUpCardsPlayedThisRound ?? 0), 0);
  assert.equal(result.state.players.e.flags.independentActionDeferredRound, 4);
  assert.equal(result.state.players.e.flags.independentActionPenaltyRound, undefined);

  result.state.phase = "action";
  result.state.step = "player-window";
  result.state.activePlayerId = "e";
  assert.ok(!engine.getLegalActions(result.state, "e").some((action) => action.type === CommandType.UseSkill && action.payload?.skillId === ARCHER));
  const before = result.state.players.e.victoryPoints;
  result.state.phase = "combat";
  emitPassive(engine, result.state, definitions, "phase.transitioned", { previousPhase: "action", transition: "next-phase" });
  assert.equal(result.state.players.e.victoryPoints, before + 3);
  emitPassive(engine, result.state, definitions, "phase.transitioned", { previousPhase: "action", transition: "next-phase" });
  assert.equal(result.state.players.e.victoryPoints, before + 3);
});

test("Eye publicly reveals co-located hands and may borrow exactly one opponent Luck; closing returns the same card to its owner discard", () => {
  const { engine, definitions, state } = setup("euryale-eye-borrow");
  state.phase = "action";
  addSkill(state, "eye", EYE, "attack", "up", true);
  createOwnedCardInstance(state, "e", { instanceId: "e-other", definitionId: "card.cardq1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "o-luck", definitionId: "card.cardluck", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "o-other", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });

  let result = engine.execute(state, command(state, "eye-open", CommandType.UseSkill, {
    skillId: EYE,
    data: { abilityId: "eye-reveal-luck" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "euryale-eye-luck");
  assert.equal(result.state.pendingDecision?.min, 0);
  assert.equal(result.state.pendingDecision?.max, 1);
  assert.deepEqual(result.state.pendingDecision?.options.map((option) => option.id), ["o-luck"]);
  assert.equal(projectPublicState(result.state, "e").cards["o-other"].definitionId, "card.cardb1");

  result = engine.execute(result.state, command(result.state, "eye-luck", CommandType.ResolveDecision, {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["o-luck"],
  }));
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.cards["o-other"].publiclyRevealed, undefined);
  assert.equal(projectPublicState(result.state, "e").cards["o-other"].definitionId, null);
  assert.equal(result.state.cards["o-luck"].ownerPlayerId, "o");
  assert.equal(result.state.cards["o-luck"].controllerPlayerId, "e");
  assert.equal(result.state.cards["o-luck"].zone, "attack");
  assert.equal(result.state.cards["o-luck"].returnToOwnerDiscardOnClose, true);
  assert.ok(result.state.players.e.attack.includes("o-luck"));
  assert.ok(!result.state.players.o.hand.includes("o-luck"));

  closePlayerCard(result.state, "e", "o-luck", definitions);
  assert.equal(result.state.cards["o-luck"].controllerPlayerId, "o");
  assert.equal(result.state.cards["o-luck"].zone, "discard");
  assert.ok(result.state.players.o.discard.includes("o-luck"));
  assert.ok(!result.state.players.e.attack.includes("o-luck"));
});

test("Eye may decline and clears every temporary public hand reveal", () => {
  const { engine, state } = setup("euryale-eye-decline");
  state.phase = "action";
  addSkill(state, "eye", EYE, "attack", "up", true);
  createOwnedCardInstance(state, "e", { instanceId: "e-luck", definitionId: "card.cardluck", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "o-luck", definitionId: "card.cardluck", zone: "hand", face: "down", active: false });
  let result = engine.execute(state, command(state, "eye-decline-open", CommandType.UseSkill, {
    skillId: EYE,
    data: { abilityId: "eye-reveal-luck" },
  }));
  assert.equal(result.state.pendingDecision.options.length, 2);
  result = engine.execute(result.state, command(result.state, "eye-decline", CommandType.ResolveDecision, {
    decisionId: result.state.pendingDecision.decisionId,
    selections: [],
  }));
  assert.equal(result.state.cards["e-luck"].publiclyRevealed, undefined);
  assert.equal(result.state.cards["o-luck"].publiclyRevealed, undefined);
  assert.equal(result.state.cards["e-luck"].zone, "hand");
  assert.equal(result.state.cards["o-luck"].zone, "hand");
});
