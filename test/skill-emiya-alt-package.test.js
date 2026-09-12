import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";

const UBW = "servant.emiya-alt.skill.sc-emiya-alt-2";
const KANSHOU = "servant.emiya-alt.skill.sc-emiya-alt-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "emiya-alt") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "e", name: "Emiya Alter" }, { id: "o", name: "Opponent" }], seed: 2901 });
  state.status = "playing";
  state.round = 5;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "e";
  state.turnOrder = ["e", "o"];
  state.players.e.servantId = "servant.emiya-alt";
  state.players.e.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["e", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, engine, definitions, state };
}

test("Emiya Alter package: all three skills are FULL", () => {
  const { built } = setup("emiya-alt-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.emiya-alt");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(UBW).handlerId, "core.emiya-alt-unlimited-blade-works");
  assert.equal(built.skills.get(KANSHOU).handlerId, "core.emiya-alt-kanshou-bakuya");
  assert.equal(built.skills.get(KANSHOU).standardAppend, true);
});

test("Unlimited Blade Works shuffles every selected-attribute discard card back, gains +2 each, and defeats at four", () => {
  const { engine, state } = setup("emiya-alt-ubw");
  createOwnedCardInstance(state, "e", { instanceId: "ubw", definitionId: UBW, zone: "attack", face: "up", active: true });
  for (let index = 0; index < 4; index += 1) createOwnedCardInstance(state, "o", { instanceId: `strength-${index}`, definitionId: "card.cardb2", zone: "discard" });
  createOwnedCardInstance(state, "o", { instanceId: "magic", definitionId: "card.carda2", zone: "discard" });

  let result = engine.execute(state, command(state, "emiya-alt-ubw-use", CommandType.UseSkill, "e", {
    skillId: UBW,
    data: { abilityId: "derisive-iron-heart" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "emiya-alt-unlimited-blade-works");
  result = engine.execute(result.state, command(result.state, "emiya-alt-ubw-pick", CommandType.ResolveDecision, "e", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["o::力量"],
  }));

  assert.deepEqual(result.state.players.o.discard, ["magic"]);
  assert.equal(result.state.players.o.deck.filter((instanceId) => instanceId.startsWith("strength-")).length, 4);
  assert.equal(result.state.players.e.flags.roundPowerBonus, 8);
  assert.equal(result.state.players.o.defeated, true);
});

test("Kanshou & Bakuya is a third appended card, requires exactly two discard exiles, and inherits their attributes for the round", () => {
  const { engine, definitions, state } = setup("emiya-alt-kanshou");
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "e";
  state.players.e.mana = 10;
  state.players.e.locationId = "workshop";
  state.players.o.locationId = "city";
  state.board.locations.mountain = [];
  state.board.locations.workshop = ["e"];
  state.board.locations.city = ["o"];
  createOwnedCardInstance(state, "e", { instanceId: "basic-a", definitionId: "card.cardb2", zone: "hand" });
  createOwnedCardInstance(state, "e", { instanceId: "basic-b", definitionId: "card.cardq2", zone: "hand" });
  createOwnedCardInstance(state, "e", { instanceId: "kanshou", definitionId: KANSHOU, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "e", { instanceId: "discard-strength", definitionId: "card.cardb3", zone: "discard" });
  createOwnedCardInstance(state, "e", { instanceId: "discard-magic", definitionId: "card.carda3", zone: "discard" });

  const result = engine.execute(state, command(state, "emiya-alt-kanshou-play", CommandType.CommitAttack, "e", {
    faceUpInstanceIds: ["basic-a", "kanshou"],
    faceDownInstanceIds: ["basic-b"],
    cardDataByInstanceId: { kanshou: { removedDiscardInstanceIds: ["discard-strength", "discard-magic"] } },
  }));
  assert.equal(result.state.cards["discard-strength"].zone, "removed");
  assert.equal(result.state.cards["discard-magic"].zone, "removed");
  const attributes = getCardInstanceAttributes(result.state.cards.kanshou, definitions[KANSHOU], result.state, definitions);
  assert.ok(attributes.includes("力量"));
  assert.ok(attributes.includes("魔术"));
  assert.ok(attributes.includes("宝具"));
  assert.ok(result.state.cards.kanshou.modifiers.some((marker) => marker.startsWith("attribute-overrides-until-round-end:5:")));
  assert.equal(result.state.players.e.trueNameRevealed, true);
});

test("Kanshou & Bakuya play prerequisite is atomic: missing two discard selections rejects the whole attack", () => {
  const { engine, state } = setup("emiya-alt-kanshou-invalid");
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "e";
  state.players.e.mana = 10;
  state.players.e.locationId = "workshop";
  state.board.locations.mountain = [];
  state.board.locations.workshop = ["e"];
  createOwnedCardInstance(state, "e", { instanceId: "basic-a", definitionId: "card.cardb2", zone: "hand" });
  createOwnedCardInstance(state, "e", { instanceId: "basic-b", definitionId: "card.cardq2", zone: "hand" });
  createOwnedCardInstance(state, "e", { instanceId: "kanshou", definitionId: KANSHOU, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "e", { instanceId: "discard-strength", definitionId: "card.cardb3", zone: "discard" });

  assert.throws(() => engine.execute(state, command(state, "emiya-alt-kanshou-invalid-play", CommandType.CommitAttack, "e", {
    faceUpInstanceIds: ["basic-a", "kanshou"],
    faceDownInstanceIds: ["basic-b"],
    cardDataByInstanceId: { kanshou: { removedDiscardInstanceIds: ["discard-strength"] } },
  })), /EMIYA_ALT_KANSHOU_TWO_DISCARD_REQUIRED/);
  assert.equal(state.cards.kanshou.zone, "servant-skills");
  assert.equal(state.cards["basic-a"].zone, "hand");
  assert.equal(state.cards["discard-strength"].zone, "discard");
  assert.equal(state.players.e.trueNameRevealed, false);
});
