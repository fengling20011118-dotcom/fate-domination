import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { getRulerBindCount, grantRulerSeal, listRulerSealsControlledBy } from "../src/rules-core/ruler-seals.ts";

const JEANNE_RULER = "servant.jeanne.skill.sc-jeanne-1";
const AMAKUSA_ZERO = "servant.amakusa.skill.sc-amakusa-1";
const AMAKUSA_MAGICIAN = "servant.amakusa.skill.sc-amakusa-2";
const AMAKUSA_RULER = "servant.amakusa.skill.sc-amakusa-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(servantId = "servant.jeanne", id = "ruler-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "r", name: "Ruler" }, { id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
    seed: 7901,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "r";
  state.turnOrder = ["r", "a", "b", "c"];
  state.players.r.servantId = servantId;
  for (const [index, playerId] of ["r", "a", "b", "c"].entries()) {
    state.players[playerId].mana = 20;
    state.players[playerId].locationId = index < 3 ? "mountain" : "city";
  }
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["r", "a", "b"];
  state.board.locations.city = ["c"];
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

function useJudgment(engine, state, skillId, first, second, prefix) {
  let result = engine.execute(state, command(state, `${prefix}-use`, CommandType.UseSkill, "r", {
    skillId,
    data: { abilityId: "divine-judgment" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "ruler-divine-judgment-first-target");
  assert.ok(result.state.pendingDecision.options.some((option) => option.id === first));
  result = resolve(engine, result.state, `${prefix}-first`, "r", [first]);
  assert.equal(result.state.pendingDecision?.kind, "ruler-divine-judgment-second-target");
  assert.ok(result.state.pendingDecision.options.some((option) => option.id === second));
  result = resolve(engine, result.state, `${prefix}-second`, "r", [second]);
  assert.equal(result.state.pendingDecision, null);
  return result;
}

test("shared Ruler Class balances the two bindings sequentially and permits exactly three game uses", () => {
  const { engine, state } = setup("servant.jeanne", "ruler-three-uses");
  let result = useJudgment(engine, state, JEANNE_RULER, "a", "b", "j1");
  assert.deepEqual([getRulerBindCount(result.state, "r", "a"), getRulerBindCount(result.state, "r", "b"), getRulerBindCount(result.state, "r", "c")], [1, 1, 0]);

  result.state.round = 5;
  result.state.phase = "action";
  result.state.step = "player-window";
  result.state.activePlayerId = "r";
  result = useJudgment(engine, result.state, JEANNE_RULER, "c", "a", "j2");
  assert.deepEqual([getRulerBindCount(result.state, "r", "a"), getRulerBindCount(result.state, "r", "b"), getRulerBindCount(result.state, "r", "c")], [2, 1, 1]);

  result.state.round = 6;
  result.state.phase = "action";
  result.state.step = "player-window";
  result.state.activePlayerId = "r";
  result = useJudgment(engine, result.state, JEANNE_RULER, "b", "c", "j3");
  assert.deepEqual([getRulerBindCount(result.state, "r", "a"), getRulerBindCount(result.state, "r", "b"), getRulerBindCount(result.state, "r", "c")], [2, 2, 2]);
  assert.equal(result.state.players.r.flags[`rulerDivineJudgmentUses:${JEANNE_RULER}`], 3);

  result.state.round = 7;
  result.state.phase = "action";
  result.state.step = "player-window";
  result.state.activePlayerId = "r";
  assert.throws(() => engine.execute(result.state, command(result.state, "j4", CommandType.UseSkill, "r", {
    skillId: JEANNE_RULER,
    data: { abilityId: "divine-judgment" },
  })), /SKILL_USE_FORBIDDEN/);
});

test("Ruler Seal commands are controller-only, repeatable by physical seal, and lock movement", () => {
  const { engine, state } = setup("servant.jeanne", "ruler-lock");
  const first = grantRulerSeal(state, "r", "a", JEANNE_RULER);
  grantRulerSeal(state, "r", "b", JEANNE_RULER);
  grantRulerSeal(state, "c", "a", "other-ruler");

  let result = engine.execute(state, command(state, "seal-use", CommandType.UseSkill, "r", {
    skillId: JEANNE_RULER,
    data: { abilityId: "ruler-seal-command" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "ruler-seal-select");
  assert.ok(result.state.pendingDecision.options.some((option) => option.id === first.sealId));
  assert.equal(result.state.pendingDecision.options.some((option) => option.id === listRulerSealsControlledBy(result.state, "c")[0].sealId), false);
  result = resolve(engine, result.state, "seal-pick", "r", [first.sealId]);
  assert.equal(result.state.pendingDecision?.kind, "ruler-seal-command-mode");
  result = resolve(engine, result.state, "seal-lock", "r", ["lock"]);
  assert.equal(result.state.players.a.flags.movementBlockedRound, 4);
  assert.equal(listRulerSealsControlledBy(result.state, "r").length, 1);
  assert.equal(result.state.players.r.flags.rulerCommandSealUsesThisRound, 1);
});

test("Ruler Seal free play costs zero and awards 2 VP if the bound player wins that combat", () => {
  const { engine, definitions, state } = setup("servant.jeanne", "ruler-free-play");
  grantRulerSeal(state, "r", "b", JEANNE_RULER);
  createOwnedCardInstance(state, "b", { instanceId: "b-hand", definitionId: "card.cardq4", zone: "hand", face: "down", active: false });
  state.players.b.mana = 0;
  state.players.r.victoryPoints = 1;

  let result = engine.execute(state, command(state, "free-use", CommandType.UseSkill, "r", {
    skillId: JEANNE_RULER,
    data: { abilityId: "ruler-seal-command" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "ruler-seal-command-mode");
  result = resolve(engine, result.state, "free-mode", "r", ["free-play"]);
  assert.equal(result.state.pendingDecision?.kind, "ruler-seal-free-play-card");
  assert.deepEqual(result.state.pendingDecision?.chooserPlayerIds, ["b"]);
  result = resolve(engine, result.state, "free-card", "b", ["b-hand"]);
  assert.equal(result.state.cards["b-hand"].zone, "attack");
  assert.equal(result.state.cards["b-hand"].paidCost, 0);
  assert.equal(result.state.players.b.mana, 0);
  assert.equal(listRulerSealsControlledBy(result.state, "r").length, 0);

  emitPassive(engine, result.state, definitions, "combat.resolved", {
    locationId: "mountain",
    powers: { r: 3, a: 4, b: 8 },
    winnerIds: ["b"],
  });
  assert.equal(result.state.players.r.victoryPoints, 3);
});

test("Amakusa package is 3/3 FULL and Magician uses the shared Ruler handler for its third skill", () => {
  const { built } = setup("servant.amakusa", "amakusa-full");
  const skills = [AMAKUSA_ZERO, AMAKUSA_MAGICIAN, AMAKUSA_RULER].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[1].handlerId, "core.amakusa-magician");
  assert.equal(skills[2].handlerId, "core.ruler-class");
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("Amakusa Magician pays 3, borrows the exact top deck card without playing it, gains its attributes, and can be used twice per round", () => {
  const { engine, state } = setup("servant.amakusa", "amakusa-magician-twice");
  createOwnedCardInstance(state, "r", { instanceId: "magician", definitionId: AMAKUSA_MAGICIAN, zone: "servant-skills", face: "down", active: false });
  createOwnedCardInstance(state, "a", { instanceId: "a-top", definitionId: "card.cardq2", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "a", { instanceId: "a-next", definitionId: "card.cardb1", zone: "deck", face: "down", active: false });
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "r";
  state.players.r.mana = 9;

  let result = engine.execute(state, command(state, "magician-1", CommandType.UseSkill, "r", {
    skillId: AMAKUSA_MAGICIAN,
    data: { abilityId: "magician-borrow" },
  }));
  assert.equal(result.state.players.r.mana, 6);
  result = resolve(engine, result.state, "magician-pick-1", "r", ["a"]);
  assert.equal(result.state.cards["a-top"].zone, "attack");
  assert.equal(result.state.cards["a-top"].ownerPlayerId, "a");
  assert.equal(result.state.cards["a-top"].controllerPlayerId, "r");
  assert.equal(result.state.cards["a-top"].paidCost, 0);
  assert.equal(result.events.some((event) => event.type === "card.played" && event.payload.instanceId === "a-top"), false);
  assert.ok(result.state.players.r.cardRuleModifiers?.some((modifier) => modifier.targetInstanceIds?.includes("a-top") && modifier.allowActionAbilityInCombat === true));
  assert.ok(result.state.cards.magician.attributeOverrides?.includes("迅捷"));

  result = engine.execute(result.state, command(result.state, "magician-2", CommandType.UseSkill, "r", {
    skillId: AMAKUSA_MAGICIAN,
    data: { abilityId: "magician-borrow" },
  }));
  assert.equal(result.state.players.r.mana, 3);
  result = resolve(engine, result.state, "magician-pick-2", "r", ["a"]);
  assert.equal(result.state.cards["a-next"].controllerPlayerId, "r");
  assert.ok(result.state.cards.magician.attributeOverrides?.includes("力量"));

  assert.throws(() => engine.execute(result.state, command(result.state, "magician-3", CommandType.UseSkill, "r", {
    skillId: AMAKUSA_MAGICIAN,
    data: { abilityId: "magician-borrow" },
  })), /SKILL_USE_FORBIDDEN/);
});

test("Amakusa Magician returns every borrowed physical card to its original owner's discard at combat end", () => {
  const { engine, definitions, state } = setup("servant.amakusa", "amakusa-magician-return");
  createOwnedCardInstance(state, "r", { instanceId: "magician", definitionId: AMAKUSA_MAGICIAN, zone: "servant-skills", face: "down", active: false });
  createOwnedCardInstance(state, "a", { instanceId: "borrow-a", definitionId: "card.cardq2", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "b", { instanceId: "borrow-b", definitionId: "card.cardb1", zone: "deck", face: "down", active: false });
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "r";

  let result = engine.execute(state, command(state, "borrow-a-use", CommandType.UseSkill, "r", { skillId: AMAKUSA_MAGICIAN, data: { abilityId: "magician-borrow" } }));
  result = resolve(engine, result.state, "borrow-a-pick", "r", ["a"]);
  result = engine.execute(result.state, command(result.state, "borrow-b-use", CommandType.UseSkill, "r", { skillId: AMAKUSA_MAGICIAN, data: { abilityId: "magician-borrow" } }));
  result = resolve(engine, result.state, "borrow-b-pick", "r", ["b"]);
  assert.ok(result.state.players.r.attack.includes("borrow-a"));
  assert.ok(result.state.players.r.attack.includes("borrow-b"));

  emitPassive(engine, result.state, definitions, "combat.ending", {
    locationId: "mountain",
    previousLocations: { r: "mountain", a: "mountain", b: "mountain" },
  });
  assert.equal(result.state.players.r.attack.includes("borrow-a"), false);
  assert.equal(result.state.players.r.attack.includes("borrow-b"), false);
  assert.ok(result.state.players.a.discard.includes("borrow-a"));
  assert.ok(result.state.players.b.discard.includes("borrow-b"));
  assert.equal(result.state.cards["borrow-a"].controllerPlayerId, "a");
  assert.equal(result.state.cards["borrow-b"].controllerPlayerId, "b");
  assert.equal(result.state.cards["borrow-a"].returnToOwnerDiscardOnClose, undefined);
  assert.equal(result.state.cards["borrow-b"].returnToOwnerDiscardOnClose, undefined);
});
