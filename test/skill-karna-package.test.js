import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const KARNA_1 = "servant.karna.skill.sc-karna-1";
const ARMOR = "servant.karna.skill.sc-karna-2";
const KARNA_3 = "servant.karna.skill.sc-karna-3";

function setup() {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = {
    ...built.cards,
    ...Object.fromEntries(built.events.map((event) => [event.id, event])),
    ...built.skills.asCardDefinitions(),
  };
  return { built, engine, definitions };
}

function makeState(id = "karna") {
  const state = createGameState({
    gameInstanceId: id,
    players: [
      { id: "karna", name: "Karna" },
      { id: "enemy-a", name: "Enemy A" },
      { id: "enemy-b", name: "Enemy B" },
    ],
    seed: 5301,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "karna";
  state.turnOrder = ["karna", "enemy-a", "enemy-b"];
  state.players.karna.servantId = "servant.karna";
  state.players.karna.mana = 15;
  state.players.karna.locationId = "mountain";
  state.players["enemy-a"].locationId = "mountain";
  state.players["enemy-b"].locationId = "mountain";
  state.board.locations.mountain = ["karna", "enemy-a", "enemy-b"];
  return state;
}

function command(state, commandId, payload) {
  return {
    commandId,
    gameInstanceId: state.gameInstanceId,
    actorId: "karna",
    expectedRevision: state.revision,
    type: CommandType.UseSkill,
    payload,
  };
}

function addArmor(state, zone = "servant-skills", active = false) {
  createOwnedCardInstance(state, "karna", {
    instanceId: "karna-armor",
    definitionId: ARMOR,
    zone,
    face: "up",
    active,
  });
}

test("Karna package: all three skills are FULL and Sun Armor exposes independent outpost/combat abilities", () => {
  const { built } = setup();
  const skills = [KARNA_1, ARMOR, KARNA_3].map((id) => built.skills.get(id));
  assert.deepEqual(skills.map((skill) => skill.supportLevel), ["FULL", "FULL", "FULL"]);
  assert.equal(skills[1].handlerId, "core.karna-sun-armor");
  assert.deepEqual(skills[1].abilities.map((ability) => ability.id), ["exile-armor", "glory-armor"]);
  assert.deepEqual(skills[1].abilities.map((ability) => ability.windows), [["outpost"], ["combat"]]);
  assert.deepEqual(skills[1].abilities.map((ability) => ability.requiresActiveCard), [false, true]);
  assert.deepEqual(skills[1].rules?.ambiguities ?? [], []);
  assert.deepEqual(skills[1].rules?.unmodeledClauses ?? [], []);
  assert.ok(skills[1].sourceRefs.some((source) => source.kind === "chm"));
  assert.ok(skills[1].sourceRefs.some((source) => source.kind === "development-image"));
});

test("Sun Armor passive forbids Karna's other Noble Phantasm card, but does not over-block his non-NP true-name skill", () => {
  const { definitions } = setup();
  const state = makeState("karna-np-lock");
  addArmor(state);
  createOwnedCardInstance(state, "karna", {
    instanceId: "karna-one",
    definitionId: KARNA_1,
    zone: "servant-skills",
    face: "up",
    active: false,
  });
  createOwnedCardInstance(state, "karna", {
    instanceId: "karna-three",
    definitionId: KARNA_3,
    zone: "servant-skills",
    face: "up",
    active: false,
  });

  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "karna", instanceId: "karna-one", definitions, faceDown: false }));
  assert.throws(
    () => assertCardCanEnterAttack({ state, playerId: "karna", instanceId: "karna-three", definitions, faceDown: false }),
    /CARD_PLAY_FORBIDDEN_BY_RULE/,
  );
});

test("Sun Armor outpost ability exiles the physical card without requiring it to be active", () => {
  const { engine } = setup();
  const state = makeState("karna-exile");
  state.phase = "outpost";
  state.step = "player-window";
  addArmor(state);
  const result = engine.execute(state, command(state, "karna-exile:use", {
    skillId: ARMOR,
    data: { abilityId: "exile-armor" },
  }));
  assert.equal(result.state.cards["karna-armor"].zone, "removed");
  assert.equal(result.state.cards["karna-armor"].active, false);
  assert.equal(result.state.cards["karna-armor"].face, "down");
});

test("Sun Armor combat ability pays one mana per opponent and sets every engaged opponent basic attack to zero", () => {
  const { engine, definitions } = setup();
  const state = makeState("karna-combat");
  state.phase = "combat";
  state.step = "player-window";
  state.players.karna.mana = 2;
  addArmor(state, "attack", true);
  createOwnedCardInstance(state, "enemy-a", {
    instanceId: "enemy-a-basic",
    definitionId: "card.cardb2",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "enemy-b", {
    instanceId: "enemy-b-basic",
    definitionId: "card.carda2",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, command(state, "karna-combat:use", {
    skillId: ARMOR,
    data: { abilityId: "glory-armor" },
  }));
  assert.equal(result.state.players.karna.mana, 0);
  assert.equal(result.state.players.karna.flags.roundManaSpent, 2);
  assert.equal(calculateCombatCardPower(result.state, result.state.players["enemy-a"], "enemy-a-basic", definitions, "mountain"), 0);
  assert.equal(calculateCombatCardPower(result.state, result.state.players["enemy-b"], "enemy-b-basic", definitions, "mountain"), 0);
});

test("Sun Armor combat action is hidden and rejected atomically when Karna cannot pay the per-opponent mana cost", () => {
  const { engine } = setup();
  const state = makeState("karna-combat-poor");
  state.phase = "combat";
  state.step = "player-window";
  state.players.karna.mana = 1;
  addArmor(state, "attack", true);
  assert.equal(engine.getLegalActions(state, "karna").some((action) => action.payload?.skillId === ARMOR && action.payload?.data?.abilityId === "glory-armor"), false);
  assert.throws(
    () => engine.execute(state, command(state, "karna-combat-poor:use", { skillId: ARMOR, data: { abilityId: "glory-armor" } })),
    /SKILL_USE_FORBIDDEN/,
  );
  assert.equal(state.players.karna.mana, 1);
});

test("Sun Armor passive also blocks abilities of another active Karna Noble Phantasm", () => {
  const { engine } = setup();
  const state = makeState("karna-skill-lock");
  state.phase = "combat";
  state.step = "player-window";
  addArmor(state);
  createOwnedCardInstance(state, "karna", {
    instanceId: "karna-three",
    definitionId: KARNA_3,
    zone: "attack",
    face: "up",
    active: true,
  });
  assert.equal(engine.getLegalActions(state, "karna").some((action) => action.payload?.skillId === KARNA_3), false);
});
