import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const ASCENSION = "master.kuzuki.skill.ascension";
const SNAKE = "master.kuzuki.skill.s3";
const SHAKESPEARE_UNLOCK = "servant.shakespeare.skill.sc-shakespeare-2";

function setup() {
  const built = buildStandardContent(legacyContent);
  return {
    built,
    engine: new StandardMatchEngine(built),
    definitions: { ...built.cards, ...built.skills.asCardDefinitions() },
  };
}

function stateFor(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "kuzuki", name: "Kuzuki" }], seed: 6201 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "kuzuki";
  state.turnOrder = ["kuzuki"];
  state.players.kuzuki.masterId = "master.kuzuki";
  state.players.kuzuki.servantId = "servant.shakespeare";
  state.players.kuzuki.mana = 12;
  return state;
}

function add(state, instanceId, definitionId, zone, active = false) {
  createOwnedCardInstance(state, "kuzuki", { instanceId, definitionId, zone, face: active ? "up" : "down", active });
}

function command(state, id, type, payload) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId: "kuzuki", expectedRevision: state.revision, type, payload };
}

test("Kuzuki package: all skills are FULL after Perfect Breathing review", () => {
  const { built } = setup();
  const ids = ["master.kuzuki.skill.s1", "master.kuzuki.skill.s2", SNAKE, ASCENSION];
  const skills = ids.map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  const ascension = built.skills.get(ASCENSION);
  assert.deepEqual(ascension.passiveEventTypes, ["skill.unlocked"]);
  assert.deepEqual(ascension.rules?.ambiguities ?? [], []);
  assert.deepEqual(ascension.rules?.unmodeledClauses ?? [], []);
  assert.ok(ascension.rules?.evidence?.some((source) => source.kind === "fqa"));
  assert.ok(ascension.rules?.evidence?.some((source) => source.kind === "keywords"));
});

test("Perfect Breathing unlock removes only Magic cards from hand, deck and discard", () => {
  const { engine } = setup();
  const state = stateFor("kuzuki-unlock");
  add(state, "unlock", SHAKESPEARE_UNLOCK, "servant-skills");
  add(state, "magic-hand", "card.carda1", "hand");
  add(state, "magic-deck", "card.carda2", "deck");
  add(state, "magic-discard", "card.carda3", "discard");
  add(state, "quick-hand", "card.cardq1", "hand");

  const result = engine.execute(state, command(state, "unlock-perfect-breath", CommandType.UseSkill, {
    skillId: SHAKESPEARE_UNLOCK,
    data: { abilityId: "unlock-master-ascension" },
  }));
  for (const id of ["magic-hand", "magic-deck", "magic-discard"]) assert.equal(result.state.cards[id].zone, "removed");
  assert.equal(result.state.cards["quick-hand"].zone, "hand");
  assert.ok(result.events.some((event) => event.type === "skill.unlocked" && event.payload?.definitionId === ASCENSION));
});

test("Perfect Breathing continuously gives +3 only to basic Quick attacks", () => {
  const { definitions } = setup();
  const state = stateFor("kuzuki-quick");
  state.phase = "combat";
  add(state, "quick", "card.cardq2", "attack", true);
  const before = calculateCombatCardPower(state, state.players.kuzuki, "quick", definitions);
  add(state, "ascension", ASCENSION, "master-skills");
  const after = calculateCombatCardPower(state, state.players.kuzuki, "quick", definitions);
  assert.equal(after, before + 3);
});

test("Perfect Breathing lets a Snake in hand pay 6 mana and join the attack without becoming a played card", () => {
  const { engine } = setup();
  const state = stateFor("kuzuki-snake");
  state.phase = "combat";
  state.players.kuzuki.mana = 6;
  add(state, "ascension", ASCENSION, "master-skills");
  add(state, "snake", SNAKE, "hand");

  const result = engine.execute(state, command(state, "snake-join", CommandType.UseCardAbility, {
    instanceId: "snake",
    ability: "perfect-breath-snake-join",
  }));
  assert.equal(result.state.players.kuzuki.mana, 0);
  assert.equal(result.state.cards.snake.zone, "attack");
  assert.equal(result.state.cards.snake.face, "up");
  assert.equal(result.state.cards.snake.active, true);
  assert.equal(result.state.cards.snake.paidCost, 0);
  assert.equal(result.events.some((event) => event.type === "card.played" && event.payload?.instanceId === "snake"), false);
  assert.ok(result.events.some((event) => event.type === "card.used" && event.payload?.instanceId === "snake"));
});

test("Perfect Breathing Snake passive/Combat ability follows FQA: hand/skill zone works, deck and discard do not", () => {
  const { engine } = setup();
  for (const [zone, expected] of [["deck", /CARD_ABILITY_ZONE_FORBIDDEN/], ["discard", /CARD_ABILITY_ZONE_FORBIDDEN|CARD_ABILITY_INACTIVE/]]) {
    const state = stateFor(`kuzuki-snake-${zone}`);
    state.phase = "combat";
    add(state, "ascension", ASCENSION, "master-skills");
    add(state, "snake", SNAKE, zone);
    assert.throws(() => engine.execute(state, command(state, `snake-${zone}`, CommandType.UseCardAbility, {
      instanceId: "snake",
      ability: "perfect-breath-snake-join",
    })), expected);
    assert.equal(state.cards.snake.zone, zone);
  }
});
