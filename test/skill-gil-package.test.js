import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

const GATE = "servant.gil.skill.sc-gil-2";
const BASIC = "card.carda1";

function setup() {
  const built = buildStandardContent(legacyContent);
  return { built, engine: new StandardMatchEngine(built) };
}

function makeState(id = "gil-gate") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "gil", name: "Gil" }, { id: "other", name: "Other" }],
    seed: 8101,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "gil";
  state.turnOrder = ["gil", "other"];
  state.players.gil.servantId = "servant.gil";
  state.players.gil.masterId = "master.rin";
  state.players.gil.locationId = "mountain";
  state.players.gil.mana = 10;
  state.players.gil.trueNameRevealed = false;
  state.players.other.locationId = "mountain";
  state.board.locations.mountain = ["gil", "other"];
  createOwnedCardInstance(state, "gil", {
    instanceId: "gate",
    definitionId: GATE,
    zone: "servant-skills",
    face: "up",
    active: false,
  });
  createOwnedCardInstance(state, "gil", {
    instanceId: "basic",
    definitionId: BASIC,
    zone: "hand",
    face: "down",
    active: false,
  });
  return state;
}

function command(state, commandId, type, payload = {}) {
  return {
    commandId,
    gameInstanceId: state.gameInstanceId,
    actorId: "gil",
    expectedRevision: state.revision,
    type,
    payload,
  };
}

function playGate(engine, state, x, attributes) {
  return engine.execute(state, command(state, `play-gate-${x}-${attributes.join("-")}`, CommandType.CommitAttack, {
    faceUpInstanceIds: ["gate", "basic"],
    faceDownInstanceIds: [],
    cardDataByInstanceId: {
      gate: { x, attributes },
    },
  }));
}

test("Gilgamesh package: all three skills are FULL after Gate of Babylon refactor", () => {
  const { built } = setup();
  const ids = [
    "servant.gil.skill.sc-gil-1",
    GATE,
    "servant.gil.skill.sc-gil-np",
  ];
  assert.ok(ids.every((id) => built.skills.get(id).supportLevel === "FULL"));
  const gate = built.skills.get(GATE);
  assert.equal(gate.handlerId, "core.double-deployment-bonus");
  assert.equal(gate.requiresActiveCard, true);
  assert.equal(gate.doubleDeploymentBonus, true);
  assert.deepEqual(gate.variablePlayAttributeChoice, {
    allowedAttributes: ["力量", "迅捷", "魔术", "宝具"],
    manaPerAttribute: 1,
  });
  assert.deepEqual(gate.rules?.ambiguities ?? [], []);
  assert.deepEqual(gate.rules?.unmodeledClauses ?? [], []);
});

test("Gate of Babylon pays X mana and gains the X distinct non-special attributes chosen by Gilgamesh's player", () => {
  const { engine } = setup();
  const result = playGate(engine, makeState("gil-gate-choice"), 3, ["力量", "魔术", "宝具"]);
  assert.equal(result.state.players.gil.mana, 7);
  assert.equal(result.state.cards.gate.paidCost, 3);
  assert.deepEqual(result.state.cards.gate.attributeOverrides, ["宝具", "力量", "魔术"]);
  assert.equal(result.state.players.gil.trueNameRevealed, true);

  const committed = result.events.find((event) => event.type === "attack.committed");
  assert.equal(committed?.payload.paidMana, 3);
  const played = result.events.find((event) => event.type === "card.played" && event.payload?.instanceId === "gate");
  assert.ok(played);
  assert.equal(played.payload.paidMana, 3);
  assert.deepEqual(played.payload.attributes, ["宝具", "力量", "魔术"]);
  assert.deepEqual(played.payload.data, { x: 3, attributes: ["力量", "魔术", "宝具"] });
});

test("Gate of Babylon supports X=0 and X=4 as the bounded distinct non-special attribute set", () => {
  const { engine } = setup();
  const zero = playGate(engine, makeState("gil-gate-zero"), 0, []);
  assert.equal(zero.state.players.gil.mana, 10);
  assert.equal(zero.state.cards.gate.paidCost, 0);
  assert.deepEqual(zero.state.cards.gate.attributeOverrides, ["宝具"]);

  const four = playGate(engine, makeState("gil-gate-four"), 4, ["力量", "迅捷", "魔术", "宝具"]);
  assert.equal(four.state.players.gil.mana, 6);
  assert.equal(four.state.cards.gate.paidCost, 4);
  assert.deepEqual(four.state.cards.gate.attributeOverrides, ["宝具", "力量", "迅捷", "魔术"]);
});

test("Gate of Babylon rejects special, duplicate, missing, or X-mismatched play choices before payment", () => {
  const { engine } = setup();
  const cases = [
    [{ x: 1, attributes: ["特殊"] }, /VARIABLE_PLAY_ATTRIBUTE_FORBIDDEN/],
    [{ x: 2, attributes: ["力量", "力量"] }, /VARIABLE_PLAY_ATTRIBUTES_DUPLICATE/],
    [{ x: 2, attributes: ["力量"] }, /VARIABLE_PLAY_ATTRIBUTE_X_MISMATCH/],
  ];
  for (const [data, expected] of cases) {
    const state = makeState(`gil-invalid-${String(expected)}`);
    assert.throws(() => engine.execute(state, command(state, "invalid-gate", CommandType.CommitAttack, {
      faceUpInstanceIds: ["gate", "basic"],
      faceDownInstanceIds: [],
      cardDataByInstanceId: { gate: data },
    })), expected);
    assert.equal(state.players.gil.mana, 10);
    assert.equal(state.cards.gate.zone, "servant-skills");
  }

  const missing = makeState("gil-missing-choice");
  assert.throws(() => engine.execute(missing, command(missing, "missing-gate", CommandType.CommitAttack, {
    faceUpInstanceIds: ["gate", "basic"],
    faceDownInstanceIds: [],
  })), /VARIABLE_PLAY_ATTRIBUTE_CHOICE_REQUIRED/);
  assert.equal(missing.players.gil.mana, 10);
});

test("Gate of Babylon action ability doubles Gilgamesh's current deployment bonus while the card is active", () => {
  const { engine } = setup();
  let state = playGate(engine, makeState("gil-gate-advantage"), 1, ["迅捷"]).state;
  state.step = "player-window";
  state.players.gil.flags.deploymentBonusActive = true;
  state.players.gil.flags.deploymentBonus = 3;
  state = engine.execute(state, command(state, "use-gate-advantage", CommandType.UseSkill, {
    skillId: GATE,
  })).state;
  assert.equal(state.players.gil.flags.deploymentBonus, 6);
});