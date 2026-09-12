import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { grantRulerSeal, listRulerSealsControlledBy } from "../src/rules-core/ruler-seals.ts";

const OBERON_NP = "servant.oberon.skill.sc-oberon-1";
const OBERON_PRETENDER = "servant.oberon.skill.sc-oberon-2";
const OBERON_RULER = "servant.oberon.skill.sc-oberon-3";
const OBERON_SEAL = "servant.oberon.skill.sc-oberon-4";
const JEANNE_RULER = "servant.jeanne.skill.sc-jeanne-1";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "oberon-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "o", name: "Oberon" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    seed: 8117,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "o";
  state.turnOrder = ["o", "a", "b"];
  state.players.o.servantId = "servant.oberon";
  state.players.o.locationId = "mountain";
  state.players.a.locationId = "mountain";
  state.players.b.locationId = "city";
  state.players.o.mana = 20;
  state.players.a.mana = 20;
  state.players.b.mana = 20;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["o", "a"];
  state.board.locations.city = ["b"];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
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

function resolve(engine, state, id, actorId, selections) {
  return engine.execute(state, command(state, id, CommandType.ResolveDecision, actorId, {
    decisionId: state.pendingDecision.decisionId,
    selections,
  }));
}

test("Oberon package is 4/4 FULL and the Ruler skills use the shared Ruler handler", () => {
  const { built } = setup("oberon-full");
  const skills = [OBERON_NP, OBERON_PRETENDER, OBERON_RULER, OBERON_SEAL].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[0].handlerId, "core.game-start-player-config");
  assert.equal(skills[1].handlerId, "core.pretender-class");
  assert.equal(skills[2].handlerId, "core.ruler-class");
  assert.equal(skills[3].handlerId, "core.ruler-class");
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("Lie Like Vortigern configures only Oberon and replaces every Ruler Seal top action after reveal", () => {
  const { definitions, engine, state } = setup("oberon-global-ruler-replacement");
  emitPassive(engine, state, definitions, "game.started", {});
  assert.equal(state.players.o.flags.rulerSealGlobalAvengerAction, true);
  assert.equal(state.players.o.flags.rulerSealVictoryPointGainBlocked, true);
  assert.notEqual(state.players.a.flags.rulerSealGlobalAvengerAction, true);

  // The physical seal deliberately comes from Jeanne: the English ruling says
  // Oberon's revealed NP replaces the top Action even on other Rulers' seals.
  grantRulerSeal(state, "o", "a", JEANNE_RULER);
  let result = engine.execute(state, command(state, "before-reveal", CommandType.UseSkill, "o", {
    skillId: OBERON_RULER,
    data: { abilityId: "ruler-seal-command" },
  }));
  assert.ok(result.state.pendingDecision.options.some((option) => option.id === "move"));
  assert.equal(result.state.pendingDecision.options.some((option) => option.id === "avenger"), false);

  // Discard the unresolved probe and create a clean command window after reveal.
  result.state.pendingDecision = null;
  result.state.effectQueue = [];
  delete result.state.players.o.usage[`${OBERON_RULER}:ruler-seal-command`];
  result.state.players.o.trueNameRevealed = true;
  result = engine.execute(result.state, command(result.state, "after-reveal", CommandType.UseSkill, "o", {
    skillId: OBERON_RULER,
    data: { abilityId: "ruler-seal-command" },
  }));
  assert.ok(result.state.pendingDecision.options.some((option) => option.id === "avenger"));
  assert.equal(result.state.pendingDecision.options.some((option) => option.id === "move"), false);

  result = resolve(engine, result.state, "make-avenger", "o", ["avenger"]);
  const generated = result.state.players.o.attack.map((id) => result.state.cards[id])
    .find((card) => card?.definitionId === "card.x-avenger");
  assert.ok(generated);
  assert.equal(generated.face, "up");
  assert.equal(generated.active, true);
  assert.equal(listRulerSealsControlledBy(result.state, "o").length, 0);
});

test("Oberon cannot gain the delayed +2 VP from a Ruler Seal free-play command", () => {
  const { definitions, engine, state } = setup("oberon-ruler-vp-block");
  emitPassive(engine, state, definitions, "game.started", {});
  grantRulerSeal(state, "o", "a", OBERON_RULER);
  createOwnedCardInstance(state, "a", { instanceId: "a-hand", definitionId: "card.cardq4", zone: "hand", face: "down", active: false });
  state.players.o.victoryPoints = 3;

  let result = engine.execute(state, command(state, "seal-free", CommandType.UseSkill, "o", {
    skillId: OBERON_RULER,
    data: { abilityId: "ruler-seal-command" },
  }));
  result = resolve(engine, result.state, "seal-free-mode", "o", ["free-play"]);
  assert.equal(result.state.pendingDecision?.kind, "ruler-seal-free-play-card");
  result = resolve(engine, result.state, "seal-free-card", "a", ["a-hand"]);
  assert.equal(result.state.cards["a-hand"].paidCost, 0);

  emitPassive(engine, result.state, definitions, "combat.resolved", {
    locationId: "mountain",
    powers: { o: 2, a: 7 },
    winnerIds: ["a"],
  });
  assert.equal(result.state.players.o.victoryPoints, 3);
});
