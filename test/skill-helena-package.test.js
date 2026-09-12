import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { initializePlayerSkillCards, createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { revealPlayerTrueName, didPlayerRevealSkillThisRound, areAllInGameSkillCardsFaceUp } from "../src/rules-core/skill-visibility.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { projectPublicState } from "../src/projection/project-state.ts";

const HELENA = "servant.helena.skill.sc-helena-2";

function builtContent() {
  return buildStandardContent(legacyContent);
}

function definitions(built) {
  return { ...built.cards, ...built.skills.asCardDefinitions() };
}

function makeState(id = "helena-search") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "h", name: "Helena" }, { id: "o", name: "Opponent" }, { id: "x", name: "Other" }],
    seed: 8201,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "settlement";
  state.players.h.servantId = "servant.helena";
  state.players.o.servantId = "servant.gil";
  state.players.x.servantId = "servant.robin";
  state.players.h.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.x.locationId = "city";
  state.board.locations.mountain = ["h", "o"];
  state.board.locations.city = ["x"];
  return state;
}

function passiveHarness(state) {
  const built = builtContent();
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  const defs = definitions(built);
  registerCorePassiveHandlers(built.skills, passives, effects, defs);
  let seq = 0;
  const emit = (type, payload) => {
    enqueuePassiveEffects(state, passives, { eventId: `helena-${++seq}`, type, revision: state.revision, sourceCommandId: "test", payload });
    effects.drain(state, 1000, defs);
  };
  return { built, defs, emit };
}

test("base visibility: servant skills start face-down while master skills remain face-up", () => {
  const state = makeState("skill-init-visibility");
  const ids = initializePlayerSkillCards(state, "h", [
    { id: "servant.helena.skill.sc-helena-1", ownerType: "servant" },
    { id: HELENA, ownerType: "servant" },
    { id: "master.rin.skill.s1", ownerType: "master" },
  ]);
  assert.equal(state.cards[ids[0]].face, "down");
  assert.equal(state.cards[ids[1]].face, "down");
  assert.equal(state.cards[ids[2]].face, "up");
});

test("base visibility: true-name release reveals every current servant skill and records a round reveal fact", () => {
  const state = makeState("true-name-reveals-skills");
  initializePlayerSkillCards(state, "o", [
    { id: "servant.gil.skill.sc-gil-1", ownerType: "servant" },
    { id: "servant.gil.skill.sc-gil-2", ownerType: "servant" },
    { id: "servant.gil.skill.sc-gil-np", ownerType: "servant" },
  ]);
  assert.ok(state.players.o.servantSkills.every((id) => state.cards[id].face === "down"));
  assert.equal(revealPlayerTrueName(state, "o"), true);
  assert.equal(state.players.o.trueNameRevealed, true);
  assert.ok(state.players.o.servantSkills.every((id) => state.cards[id].face === "up"));
  assert.equal(didPlayerRevealSkillThisRound(state, "o"), true);
  state.round += 1;
  assert.equal(didPlayerRevealSkillThisRound(state, "o"), false);
});

test("projection keeps a face-up servant skill public even if the owner's true name is hidden", () => {
  const state = makeState("face-up-skill-public");
  createOwnedCardInstance(state, "o", { instanceId: "known-skill", definitionId: "servant.gil.skill.sc-gil-1", zone: "servant-skills", face: "up", active: false });
  state.players.o.trueNameRevealed = false;
  const projected = projectPublicState(state, "h");
  assert.equal(projected.cards["known-skill"].definitionId, "servant.gil.skill.sc-gil-1");
});

test("Helena Revelation gains 2 VP when an opponent who revealed a skill this round wins Helena's combat", () => {
  const state = makeState("helena-revelation");
  const { emit } = passiveHarness(state);
  initializePlayerSkillCards(state, "h", [{ id: HELENA, ownerType: "servant" }]);
  initializePlayerSkillCards(state, "o", [{ id: "servant.gil.skill.sc-gil-1", ownerType: "servant" }]);
  revealPlayerTrueName(state, "o");
  const before = state.players.h.victoryPoints;
  emit("combat.resolved", { locationId: "mountain", winnerIds: ["o"], defeatedPlayerIds: ["h"] });
  assert.equal(state.players.h.victoryPoints, before + 2);

  state.round += 1;
  const after = state.players.h.victoryPoints;
  emit("combat.resolved", { locationId: "mountain", winnerIds: ["o"], defeatedPlayerIds: ["h"] });
  assert.equal(state.players.h.victoryPoints, after);
});

test("Helena Revelation does not trigger for a different battlefield or Helena herself winning", () => {
  const state = makeState("helena-revelation-negative");
  const { emit } = passiveHarness(state);
  initializePlayerSkillCards(state, "h", [{ id: HELENA, ownerType: "servant" }]);
  initializePlayerSkillCards(state, "o", [{ id: "servant.gil.skill.sc-gil-1", ownerType: "servant" }]);
  revealPlayerTrueName(state, "o");
  const before = state.players.h.victoryPoints;
  emit("combat.resolved", { locationId: "city", winnerIds: ["o"] });
  emit("combat.resolved", { locationId: "mountain", winnerIds: ["h"] });
  assert.equal(state.players.h.victoryPoints, before);
});

test("Helena gains 5 VP exactly once when every in-game skill card is face-up", () => {
  const state = makeState("helena-all-skills");
  const { defs, emit } = passiveHarness(state);
  initializePlayerSkillCards(state, "h", [{ id: HELENA, ownerType: "servant" }]);
  initializePlayerSkillCards(state, "o", [{ id: "servant.gil.skill.sc-gil-1", ownerType: "servant" }]);
  initializePlayerSkillCards(state, "x", [{ id: "servant.robin.skill.sc-robin-1", ownerType: "servant" }]);
  assert.equal(areAllInGameSkillCardsFaceUp(state, defs), false);
  revealPlayerTrueName(state, "h");
  revealPlayerTrueName(state, "o");
  assert.equal(areAllInGameSkillCardsFaceUp(state, defs), false);
  const before = state.players.h.victoryPoints;
  revealPlayerTrueName(state, "x");
  assert.equal(areAllInGameSkillCardsFaceUp(state, defs), true);
  emit("servant.true-name-revealed", { playerId: "x", servantId: "servant.robin" });
  assert.equal(state.players.h.victoryPoints, before + 5);
  emit("card.played", { playerId: "o", definitionId: "servant.gil.skill.sc-gil-1", face: "up" });
  assert.equal(state.players.h.victoryPoints, before + 5);
});

test("removed skill cards do not prevent the literal in-game all-skills face-up condition", () => {
  const state = makeState("helena-removed-skill");
  const { defs } = passiveHarness(state);
  createOwnedCardInstance(state, "h", { instanceId: "helena-up", definitionId: HELENA, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "gil-removed", definitionId: "servant.gil.skill.sc-gil-1", zone: "removed", face: "down", active: false });
  assert.equal(areAllInGameSkillCardsFaceUp(state, defs), true);
});

test("Helena package is fully handled and the once-per-game limiter is scoped to the +5 clause, not the passive as a whole", () => {
  const built = builtContent();
  const skills = ["servant.helena.skill.sc-helena-1", HELENA, "servant.helena.skill.sc-helena-3"].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  const search = built.skills.get(HELENA);
  assert.equal(search.handlerId, "core.helena-search-unknown");
  assert.equal(search.limit, undefined);
  assert.deepEqual(search.rules?.ambiguities ?? [], []);
  assert.deepEqual(search.rules?.unmodeledClauses ?? [], []);
});