import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { addCardToAttack } from "../src/rules-core/card-play.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCustomResource, setCustomResource } from "../src/rules-core/resources.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  TOHNO_ASCENSION_ID,
  TOHNO_CONTROL_RESOURCE,
  TOHNO_DEMON_ID,
  TOHNO_ERODING_ID,
  TOHNO_FUSION_ABILITY,
  TOHNO_POSSESSED_ID,
  TOHNO_SERPENT_ID,
  getTohnoForm,
  isTohnoShikiLegal,
  resolveTohnoShikiDecision,
  useTohnoShiki,
} from "../src/rules-core/tohno-shiki.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const basicIds = Object.values(definitions).filter((definition) => definition.basic === true).map((definition) => definition.id);
if (basicIds.length < 4) throw new Error("TOHNO_TEST_BASIC_CARDS_REQUIRED");

function setup(id = "tohno") {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "t", name: "Tohno" }, { id: "o", name: "Opponent" }], seed: 4242 });
  state.status = "playing";
  state.round = 3;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "t";
  state.turnOrder = ["t", "o"];
  state.players.t.masterId = "master.shiki-tohno";
  state.players.t.locationId = "city";
  state.players.o.locationId = "city";
  state.board.locations.city = ["t", "o"];
  state.board.locations.mountain = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return state;
}

function context(state, skillId, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.t,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extra,
  };
}

function grantEroding(state, zone = "master-skills") {
  return createOwnedCardInstance(state, "t", { instanceId: `${state.gameInstanceId}:eroding`, definitionId: TOHNO_ERODING_ID, originMasterId: "master.shiki-tohno", zone, face: zone === "attack" ? "up" : "up", active: zone === "attack" }).instanceId;
}

function transform(state, form) {
  if (form === "demon") setCustomResource(state.players.t, TOHNO_CONTROL_RESOURCE, 12);
  else setCustomResource(state.players.t, TOHNO_CONTROL_RESOURCE, 2);
  state.players.t.victoryPoints = 13;
  return useTohnoShiki(context(state, TOHNO_POSSESSED_ID, {
    eventType: "player.victory-points.changed",
    event: { playerId: "t", delta: 1, sourceId: form === "demon" ? "combat.resolve" : "effect.test" },
  }));
}

function resolveFrame(state, frame, selection, extra = {}) {
  return resolveTohnoShikiDecision(context(state, frame.sourceId, {
    previous: frame.payload,
    decision: { status: "resolved", selections: [selection] },
  }, extra));
}

test("Tohno SHIKI package is 6/6 FULL; granted form cards and Eroding are catalogue-only", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.shiki-tohno");
  assert.equal(skills.length, 6);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(TOHNO_ERODING_ID).initiallyOwned, false);
  assert.equal(built.skills.get(TOHNO_SERPENT_ID).initiallyOwned, false);
  assert.equal(built.skills.get(TOHNO_DEMON_ID).initiallyOwned, false);
  assert.equal(built.skills.get(TOHNO_ASCENSION_ID).initiallyOwned, false);
  assert.equal(definitions[TOHNO_ERODING_ID].victoryPointPlayCost, 1);
  assert.equal(definitions[TOHNO_ERODING_ID].requiresEightMana, true);
});

test("Possessed gains Control only from non-effect combat/recon VP and chooses Demon vs Serpent at first 13 VP", () => {
  const demon = setup("tohno-demon");
  demon.players.t.victoryPoints = 12;
  setCustomResource(demon.players.t, TOHNO_CONTROL_RESOURCE, 12);
  demon.players.t.victoryPoints = 13;
  const demonResult = useTohnoShiki(context(demon, TOHNO_POSSESSED_ID, { eventType: "player.victory-points.changed", event: { playerId: "t", delta: 1, sourceId: "combat.resolve" } }));
  assert.equal(getCustomResource(demon.players.t, TOHNO_CONTROL_RESOURCE), 13);
  assert.equal(demonResult.transformed, "demon");
  assert.equal(getTohnoForm(demon.players.t), "demon");
  assert.ok(demon.players.t.masterSkills.some((id) => demon.cards[id].definitionId === TOHNO_DEMON_ID));

  const serpent = setup("tohno-serpent");
  serpent.players.t.victoryPoints = 13;
  setCustomResource(serpent.players.t, TOHNO_CONTROL_RESOURCE, 12);
  const serpentResult = useTohnoShiki(context(serpent, TOHNO_POSSESSED_ID, { eventType: "player.victory-points.changed", event: { playerId: "t", delta: 1, sourceId: "effect.test" } }));
  assert.equal(getCustomResource(serpent.players.t, TOHNO_CONTROL_RESOURCE), 12, "effect VP does not add Control");
  assert.equal(serpentResult.transformed, "serpent");
  assert.equal(getTohnoForm(serpent.players.t), "serpent");
});

test("Eroding pays +1 VP normally; Demon waives it while Serpent grants Magic and the low-mana waiver", () => {
  const normal = setup("tohno-vp-cost");
  normal.players.t.mana = 8;
  normal.players.t.victoryPoints = 5;
  const normalId = grantEroding(normal);
  addCardToAttack(normal, "t", normalId, definitions, { payCost: true, allowedSourceZones: ["master-skills"], bypassTiming: true, bypassFaceUpPlayLimit: true });
  assert.equal(normal.players.t.victoryPoints, 4);

  const demon = setup("tohno-vp-waive");
  transform(demon, "demon");
  demon.players.t.mana = 8;
  demon.players.t.victoryPoints = 5;
  const demonId = grantEroding(demon);
  addCardToAttack(demon, "t", demonId, definitions, { payCost: true, allowedSourceZones: ["master-skills"], bypassTiming: true, bypassFaceUpPlayLimit: true });
  assert.equal(demon.players.t.victoryPoints, 5);

  const serpent = setup("tohno-serpent-waiver");
  transform(serpent, "serpent");
  serpent.players.t.mana = 1;
  serpent.players.t.victoryPoints = 5;
  const serpentId = grantEroding(serpent);
  assert.ok(getCardInstanceAttributes(serpent.cards[serpentId], definitions[TOHNO_ERODING_ID], serpent, definitions).includes("魔术"));
  addCardToAttack(serpent, "t", serpentId, definitions, { payCost: true, allowedSourceZones: ["master-skills"], bypassTiming: true, bypassFaceUpPlayLimit: true });
  assert.equal(serpent.players.t.victoryPoints, 4);
  assert.equal(isTohnoShikiLegal(serpent, "t", built.skills.get(TOHNO_ERODING_ID), built.skills.get(TOHNO_ERODING_ID).abilities[0], definitions), false);
});

test("Demon Fusion reveals three random discard cards, swaps physical basic cards, and steals 2 VP from a richer opponent", () => {
  const state = setup("tohno-fusion");
  transform(state, "demon");
  state.players.t.victoryPoints = 4;
  state.players.o.victoryPoints = 8;
  grantEroding(state, "attack");
  createOwnedCardInstance(state, "t", { instanceId: "t-basic", definitionId: basicIds[0], zone: "hand", face: "down" });
  for (let index = 0; index < 3; index += 1) createOwnedCardInstance(state, "o", { instanceId: `o-basic-${index}`, definitionId: basicIds[index + 1], zone: "discard", face: "up" });
  let opened;
  const begin = useTohnoShiki(context(state, TOHNO_ERODING_ID, { abilityId: TOHNO_FUSION_ABILITY }, { openDecision(value) { opened = value; }, randomInt: () => 0 }));
  assert.equal(begin.pending, true);
  assert.equal(opened.kind, "tohno-fusion-target-card");
  let frame = state.effectQueue.shift();
  resolveFrame(state, frame, "o-basic-0", { openDecision(value) { opened = value; } });
  assert.equal(opened.kind, "tohno-fusion-own-card");
  frame = state.effectQueue.shift();
  const result = resolveFrame(state, frame, "t-basic");
  assert.equal(result.stolenVictoryPoints, 2);
  assert.ok(state.players.t.hand.includes("o-basic-0"));
  assert.equal(state.cards["o-basic-0"].ownerPlayerId, "t");
  assert.ok(state.players.o.discard.includes("t-basic"));
  assert.equal(state.cards["t-basic"].ownerPlayerId, "o");
  assert.equal(state.players.t.victoryPoints, 6);
  assert.equal(state.players.o.victoryPoints, 6);
});

test("Sobering Lucidity resolves next round, grants VP equal to Control, then fixes total power at 0 permanently", () => {
  const state = setup("tohno-ascension");
  setCustomResource(state.players.t, TOHNO_CONTROL_RESOURCE, 5);
  state.players.t.victoryPoints = 7;
  useTohnoShiki(context(state, TOHNO_ASCENSION_ID, { eventType: "skill.unlocked", event: { playerId: "t", skillId: TOHNO_ASCENSION_ID } }));
  state.round = 4;
  state.players.t.flags.roundPowerBonus = 99;
  const result = useTohnoShiki(context(state, TOHNO_ASCENSION_ID, { eventType: "round.started", event: { round: 4 } }));
  assert.equal(result.gainedVictoryPoints, 5);
  assert.equal(state.players.t.victoryPoints, 12);
  assert.equal(calculateCombatPower(state, state.players.t, definitions, "city"), 0);
  state.players.t.flags.roundPowerBonus = 999;
  assert.equal(calculateCombatPower(state, state.players.t, definitions, "city"), 0);
});
