import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const ASCENSION = "master.ciel.skill.ascension";
const FUNERAL_RITE = "master.ciel.skill.s2";

function setup() {
  const built = buildStandardContent(legacyContent);
  const definitions = {
    ...built.cards,
    ...Object.fromEntries(built.events.map((event) => [event.id, event])),
    ...built.skills.asCardDefinitions(),
  };
  return { built, engine: new StandardMatchEngine(built), definitions };
}

function stateFor(id, players = [{ id: "ciel", name: "Ciel" }]) {
  const state = createGameState({ gameInstanceId: id, players, seed: 6101 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "ciel";
  state.turnOrder = players.map((player) => player.id);
  state.players.ciel.masterId = "master.ciel";
  state.players.ciel.mana = 8;
  return state;
}

function addAscension(state) {
  createOwnedCardInstance(state, "ciel", {
    instanceId: "ciel-ascension",
    definitionId: ASCENSION,
    zone: "master-skills",
    face: "up",
    active: false,
  });
}

function addAttackCard(state, ownerId, instanceId, definitionId, zone = "hand", active = false) {
  createOwnedCardInstance(state, ownerId, {
    instanceId,
    definitionId,
    zone,
    face: "up",
    active,
  });
}

function command(state, id, actorId, payload) {
  return {
    commandId: id,
    gameInstanceId: state.gameInstanceId,
    actorId,
    expectedRevision: state.revision,
    type: CommandType.UseCardAbility,
    payload,
  };
}

test("Ciel package: every master skill is FULL after reviewing Seventh Scripture Expansion", () => {
  const { built } = setup();
  const ids = [
    "master.ciel.skill.s1",
    "master.ciel.skill.s1a",
    "master.ciel.skill.s1b",
    "master.ciel.skill.s2",
    "master.ciel.skill.s3",
    ASCENSION,
  ];
  const skills = ids.map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  const ascension = built.skills.get(ASCENSION);
  assert.equal(ascension.handlerId, "core.structured-skill");
  assert.deepEqual(ascension.rules?.ambiguities ?? [], []);
  assert.deepEqual(ascension.rules?.unmodeledClauses ?? [], []);
  assert.ok(ascension.sourceRefs.some((source) => source.kind === "development-image"));
});

test("Ciel Expansion: every Strength attack gets +4 card power while the ascension skill is owned", () => {
  const { definitions } = setup();
  const state = stateFor("ciel-strength");
  state.phase = "combat";
  state.step = "player-window";
  state.players.ciel.locationId = "mountain";
  state.board.locations.mountain = ["ciel"];
  addAttackCard(state, "ciel", "strength", "card.cardb2", "attack", true);
  const base = calculateCombatCardPower(state, state.players.ciel, "strength", definitions, "mountain");
  addAscension(state);
  const boosted = calculateCombatCardPower(state, state.players.ciel, "strength", definitions, "mountain");
  assert.equal(boosted, base + 4);
});

test("Ciel Expansion: granted Soul Crush marks next-round situation suppression only on engaged opponents without active Lucky", () => {
  const { engine } = setup();
  const state = stateFor("ciel-soul-crush", [
    { id: "ciel", name: "Ciel" },
    { id: "plain", name: "Plain" },
    { id: "lucky", name: "Lucky" },
  ]);
  state.phase = "combat";
  state.step = "player-window";
  for (const id of ["ciel", "plain", "lucky"]) state.players[id].locationId = "mountain";
  state.board.locations.mountain = ["ciel", "plain", "lucky"];
  addAscension(state);
  addAttackCard(state, "ciel", "strength", "card.cardb2", "attack", true);
  addAttackCard(state, "lucky", "lucky-card", "card.cardluck", "attack", true);

  const result = engine.execute(state, command(state, "ciel-soul-crush:use", "ciel", {
    instanceId: "strength",
    ability: "expanded-soul-crush",
  }));
  assert.equal(result.state.players.plain.flags.situationBenefitsSuppressedRound, 5);
  assert.equal(result.state.players.lucky.flags.situationBenefitsSuppressedRound, undefined);
  assert.ok(result.events.some((event) => event.type === "card.used" && event.payload?.ability === "expanded-soul-crush"));
});

test("Ciel Expansion: Funeral Rite can occupy one extra standard slot at 8+ mana and pays exactly +2 surcharge", () => {
  const { definitions } = setup();
  const state = stateFor("ciel-append");
  addAscension(state);
  addAttackCard(state, "ciel", "basic-a", "card.cardb1");
  addAttackCard(state, "ciel", "basic-b", "card.carda2");
  addAttackCard(state, "ciel", "funeral", FUNERAL_RITE, "master-skills");

  const result = commitStandardAttack(state, "ciel", ["basic-a", "basic-b", "funeral"], [], definitions);
  assert.equal(result.paidMana, 3);
  assert.equal(state.cards.funeral.paidCost, 3);
  assert.equal(state.players.ciel.mana, 5);
  assert.deepEqual(result.committed, ["basic-a", "basic-b", "funeral"]);
});

test("Ciel Expansion: Funeral Rite remains an ordinary card in a two-card batch and append permission disappears below 8 mana", () => {
  const { definitions } = setup();
  const normal = stateFor("ciel-normal-two");
  normal.players.ciel.mana = 7;
  addAscension(normal);
  addAttackCard(normal, "ciel", "basic-a", "card.cardb1");
  addAttackCard(normal, "ciel", "funeral", FUNERAL_RITE, "master-skills");
  const regular = commitStandardAttack(normal, "ciel", ["basic-a", "funeral"], [], definitions);
  assert.equal(regular.paidMana, 1);
  assert.equal(normal.cards.funeral.paidCost, 1);

  const append = stateFor("ciel-no-append");
  append.players.ciel.mana = 7;
  addAscension(append);
  addAttackCard(append, "ciel", "basic-a", "card.cardb1");
  addAttackCard(append, "ciel", "basic-b", "card.carda2");
  addAttackCard(append, "ciel", "funeral", FUNERAL_RITE, "master-skills");
  assert.throws(
    () => commitStandardAttack(append, "ciel", ["basic-a", "basic-b", "funeral"], [], definitions),
    /EXACTLY_TWO_CARDS_REQUIRED/,
  );
  assert.equal(append.players.ciel.mana, 7);
});
