import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";

const MAGIC_ENHANCEMENT = "servant.shakespeare.skill.sc-shakespeare-2";
const OPENING_NIGHT = "servant.shakespeare.skill.sc-shakespeare-3";

function setup() {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  return { built, engine, definitions };
}

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function appendState(id, definitions, withSource = true) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "shakespeare", name: "Shakespeare" }], seed: 3601 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "shakespeare";
  state.players.shakespeare.servantId = "servant.shakespeare";
  state.players.shakespeare.masterId = "master.rin";
  state.players.shakespeare.locationId = "mountain";
  state.players.shakespeare.mana = 20;
  state.board.locations.mountain = ["shakespeare"];
  if (withSource) createOwnedCardInstance(state, "shakespeare", { instanceId: "magic-enhancement", definitionId: MAGIC_ENHANCEMENT, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "shakespeare", { instanceId: "opening-night", definitionId: OPENING_NIGHT, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "shakespeare", { instanceId: "basic-a", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "shakespeare", { instanceId: "basic-b", definitionId: "card.cardq1", zone: "hand", face: "down", active: false });
  return state;
}

test("Shakespeare package: all skills are FULL and FQA unlock is a non-active action ability", () => {
  const { built } = setup();
  const skills = [1, 2, 3].map((index) => built.skills.get(`servant.shakespeare.skill.sc-shakespeare-${index}`));
  assert.deepEqual(skills.map((skill) => skill.supportLevel), ["FULL", "FULL", "FULL"]);
  const enhancement = skills[1];
  assert.equal(enhancement.handlerId, "core.unlock-owner-ascension");
  assert.deepEqual(enhancement.windows, ["action"]);
  assert.equal(enhancement.abilities[0].id, "unlock-master-ascension");
  assert.equal(enhancement.abilities[0].requiresActiveCard, false);
  assert.ok(enhancement.rules.evidence.some((evidence) => evidence.kind === "fqa" && evidence.locator === "paragraph:168"));
  const opening = skills[2];
  assert.equal(opening.standardAppend, true);
  assert.equal(opening.standardAppendRequiresOwnedSkillId, MAGIC_ENHANCEMENT);
});

test("Shakespeare package: Character Reversal unlocks exactly the current master's catalogue-only ascension skill", () => {
  const { engine } = setup();
  const state = createGameState({ gameInstanceId: "shakespeare-unlock", players: [{ id: "shakespeare", name: "Shakespeare" }], seed: 3602 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "shakespeare";
  state.players.shakespeare.servantId = "servant.shakespeare";
  state.players.shakespeare.masterId = "master.rin";
  createOwnedCardInstance(state, "shakespeare", { instanceId: "magic-enhancement", definitionId: MAGIC_ENHANCEMENT, zone: "servant-skills", face: "up", active: false });

  const result = engine.execute(state, command(state, "unlock-rin", CommandType.UseSkill, "shakespeare", {
    skillId: MAGIC_ENHANCEMENT,
    data: { abilityId: "unlock-master-ascension" },
  }));
  const unlocked = result.state.players.shakespeare.masterSkills
    .map((instanceId) => result.state.cards[instanceId])
    .find((card) => card?.definitionId === "master.rin.skill.ascension");
  assert.ok(unlocked);
  assert.equal(unlocked.face, "up");
  assert.equal(unlocked.active, false);
  assert.equal(result.state.cards["magic-enhancement"].active, false);
  assert.throws(() => engine.execute(result.state, command(result.state, "unlock-rin-again", CommandType.UseSkill, "shakespeare", {
    skillId: MAGIC_ENHANCEMENT,
    data: { abilityId: "unlock-master-ascension" },
  })), /SKILL_USE_FORBIDDEN/);
});

test("Shakespeare package: Opening Night is one appended third card only while Magic Enhancement remains owned", () => {
  const { definitions } = setup();
  const allowed = appendState("shakespeare-append-allowed", definitions, true);
  const result = commitStandardAttack(allowed, "shakespeare", ["basic-a", "basic-b", "opening-night"], [], definitions);
  assert.equal(result.committed.length, 3);
  assert.equal(allowed.cards["opening-night"].zone, "attack");

  const blocked = appendState("shakespeare-append-blocked", definitions, true);
  movePlayerCard(blocked, "shakespeare", "magic-enhancement", "removed");
  assert.throws(() => commitStandardAttack(blocked, "shakespeare", ["basic-a", "basic-b", "opening-night"], [], definitions), /EXACTLY_TWO_CARDS_REQUIRED/);
});
