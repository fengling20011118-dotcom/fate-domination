import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { defeatPlayer, defeatPlayerByEffect } from "../src/rules-core/defeat.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { isStructuredSkillUseForbidden } from "../src/rules-core/rule-modifiers.ts";

const PASSIVE = "servant.cu-alter.skill.sc-cu-alter-1";
const PERMANENT = "servant.cu-alter.skill.sc-cu-alter-2";
const GAE_BOLG = "servant.cu-alter.skill.sc-cu-alter-3";

function command(state, commandId, type, actorId = "cu", payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "cu-alter-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "cu", name: "Cu Alter" }, { id: "enemy", name: "Enemy" }, { id: "away", name: "Away" }],
    seed: 6801,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "cu";
  state.turnOrder = ["cu", "enemy", "away"];
  state.players.cu.servantId = "servant.cu-alter";
  state.players.cu.locationId = "mountain";
  state.players.enemy.locationId = "mountain";
  state.players.away.locationId = "city";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["cu", "enemy"];
  state.board.locations.city = ["away"];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function addSkill(state, instanceId, definitionId, zone = "servant-skills", face = "down", active = false) {
  createOwnedCardInstance(state, "cu", { instanceId, definitionId, zone, face, active });
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

test("Cu Alter package: all three skills are FULL with concrete handlers", () => {
  const { built } = setup("cu-alter-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.cu-alter");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(PASSIVE).handlerId, "core.cu-alter-curruid-passive");
  assert.equal(built.skills.get(PERMANENT).handlerId, "core.cu-alter-curruid-permanent");
  assert.equal(built.skills.get(GAE_BOLG).handlerId, "core.cu-alter-gae-bolg");
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("Protection from Arrows charges an opposing defeat effect 3 mana but does not tax ordinary combat defeat", () => {
  const { definitions, state } = setup("cu-alter-defeat-cost");
  addSkill(state, "passive", PASSIVE);
  state.players.enemy.mana = 2;
  assert.equal(defeatPlayerByEffect(state, "cu", "enemy", definitions), false);
  assert.equal(state.players.cu.defeated, false);
  assert.equal(state.players.enemy.mana, 2);

  state.players.enemy.mana = 3;
  assert.equal(defeatPlayerByEffect(state, "cu", "enemy", definitions), true);
  assert.equal(state.players.cu.defeated, true);
  assert.equal(state.players.enemy.mana, 0);

  state.players.cu.defeated = false;
  state.players.enemy.mana = 0;
  assert.equal(defeatPlayer(state, "cu"), true);
  assert.equal(state.players.cu.defeated, true);
  assert.equal(state.players.enemy.mana, 0);
});

test("Curruid passive loses VP after combat from active attack count minus one, capped at three", () => {
  const { definitions, engine, state } = setup("cu-alter-attrition");
  addSkill(state, "passive", PASSIVE);
  state.players.enemy.victoryPoints = 8;
  state.players.away.victoryPoints = 8;
  for (let index = 0; index < 5; index += 1) {
    createOwnedCardInstance(state, "enemy", { instanceId: `e-${index}`, definitionId: "card.cardb1", zone: "attack", face: "up", active: true });
  }
  for (let index = 0; index < 4; index += 1) {
    createOwnedCardInstance(state, "away", { instanceId: `a-${index}`, definitionId: "card.cardb1", zone: "attack", face: "up", active: true });
  }
  emitPassive(engine, state, definitions, "combat.ending", {
    round: 4,
    previousLocations: { cu: "mountain", enemy: "mountain", away: "city" },
    combatWinnerIdsByLocation: {},
  });
  assert.equal(state.players.enemy.victoryPoints, 5);
  assert.equal(state.players.away.victoryPoints, 8);
});

test("Permanent Curruid blocks Cu Alter Noble Phantasm play/use and its action grants +3 total power", () => {
  const { definitions, engine, state } = setup("cu-alter-permanent-lock");
  addSkill(state, "permanent", PERMANENT, "attack", "up", true);
  addSkill(state, "np", GAE_BOLG);
  state.players.cu.mana = 12;
  state.phase = "combat";
  state.step = "player-window";
  assert.throws(() => assertCardCanEnterAttack({
    state,
    playerId: "cu",
    instanceId: "np",
    definitions,
    faceDown: false,
    allowedSourceZones: ["servant-skills"],
  }), /CARD_PLAY_FORBIDDEN_BY_RULE/);
  assert.equal(isStructuredSkillUseForbidden(state, "cu", GAE_BOLG, definitions), true);

  state.phase = "action";
  state.step = "player-window";
  let result = engine.execute(state, command(state, "curruid-power", CommandType.UseSkill, "cu", {
    skillId: PERMANENT,
    data: { abilityId: "curruid-power" },
  }));
  assert.equal(result.state.players.cu.flags.roundPowerBonus, 3);
});

test("Permanent Curruid optionally upgrades each normally played basic for +1 mana, Strength and +1 power", () => {
  const { definitions, state } = setup("cu-alter-basic-upgrade");
  addSkill(state, "permanent", PERMANENT, "attack", "up", true);
  state.step = "play-batch-draft";
  state.players.cu.mana = 5;
  createOwnedCardInstance(state, "cu", { instanceId: "q", definitionId: "card.cardq2", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "cu", { instanceId: "b", definitionId: "card.cardb2", zone: "hand", face: "down", active: false });
  const result = commitStandardAttack(state, "cu", ["q", "b"], [], definitions, {
    cardDataByInstanceId: { q: { applyPlayUpgrade: true } },
  });
  assert.equal(result.paidMana, 1);
  assert.equal(state.cards.q.paidCost, 1);
  assert.equal(state.cards.b.paidCost, 0);
  assert.ok(getCardInstanceAttributes(state.cards.q, definitions["card.cardq2"], state, definitions).includes("力量"));
  assert.equal(state.cards.q.powerModifiers?.some((modifier) => modifier.value === 1 && modifier.duration === "round"), true);
  assert.equal(state.cards.b.powerModifiers?.some((modifier) => modifier.value === 1 && modifier.duration === "round") ?? false, false);
});

test("Permanent Curruid combat end removes every owned Curruid card and therefore removes Protection from Arrows", () => {
  const { definitions, engine, state } = setup("cu-alter-cleanup");
  addSkill(state, "passive", PASSIVE);
  addSkill(state, "permanent", PERMANENT, "attack", "up", true);
  emitPassive(engine, state, definitions, "combat.ending", {
    round: 4,
    previousLocations: { cu: "mountain", enemy: "mountain", away: "city" },
    combatWinnerIdsByLocation: {},
  });
  assert.equal(state.cards.passive.zone, "removed");
  assert.equal(state.cards.permanent.zone, "removed");
  state.players.enemy.mana = 0;
  assert.equal(defeatPlayerByEffect(state, "cu", "enemy", definitions), true);
});
