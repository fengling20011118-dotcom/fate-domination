import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, closePlayerCard } from "../src/rules-core/decks.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { projectPublicState } from "../src/projection/project-state.ts";
import { applyDueDeckRebuilds } from "../src/rules-core/deck-rebuilds.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";
import {
  CAULES_NARRATOR_DECK,
  CAULES_NARRATOR_HANDLER,
  CAULES_NARRATOR_ID,
  CAULES_THUNDER_ABILITY,
  CAULES_THUNDER_HANDLER,
  CAULES_THUNDER_ID,
} from "../src/rules-core/caules-yggdmillennia.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function setup(id = "caules") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "c", name: "Caules" }, { id: "o", name: "Opponent" }, { id: "x", name: "Remote" }],
    seed: 8821,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "c";
  state.players.c.masterId = "master.caules-yggdmillennia";
  state.players.c.identityRevealed = true;
  state.players.c.mana = 30;
  state.players.o.mana = 30;
  state.players.x.mana = 30;
  state.players.c.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.x.locationId = "city";
  state.board.locations.mountain = ["c", "o"];
  state.board.locations.city = ["x"];
  return state;
}

function add(state, playerId, instanceId, definitionId, zone, extra = {}) {
  return createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, ...extra });
}

function addReadyThunder(state, instanceId = "c:thunder") {
  return add(state, "c", instanceId, CAULES_THUNDER_ID, "master-skills", { face: "up", active: true });
}

function addStandard(state, playerId, instanceId, definitionId = "card.cardb1", zone = "hand", extra = {}) {
  return add(state, playerId, instanceId, definitionId, zone, { face: zone === "attack" ? "up" : "down", active: zone === "attack", ...extra });
}

function playThunder(state, attribute, thunderId = "c:thunder", basicId = `c:basic:${state.round}`) {
  if (!state.cards[basicId]) addStandard(state, "c", basicId);
  const secondBasicId = `${basicId}:second`;
  if (!state.cards[secondBasicId]) addStandard(state, "c", secondBasicId, "card.cardq1");
  return commitStandardAttack(
    state,
    "c",
    [basicId, secondBasicId, thunderId],
    [],
    definitions,
    { cardDataByInstanceId: { [thunderId]: { declaredAttribute: attribute } } },
  );
}

function passiveHarness() {
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  return { passives, effects };
}

function emitPassive(state, harness, type, payload) {
  enqueuePassiveEffects(state, harness.passives, {
    eventId: `${state.gameInstanceId}:${type}:${state.revision}:${Math.random()}`,
    type,
    revision: state.revision,
    sourceCommandId: "test",
    payload,
  });
  harness.effects.drain(state, 1000, definitions);
}

test("Caules Yggdmillennia package is 5/5 FULL and the two completed skills use dedicated handlers", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.caules-yggdmillennia");
  assert.equal(skills.length, 5);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(built.skills.get(CAULES_THUNDER_ID).handlerId, CAULES_THUNDER_HANDLER);
  assert.equal(built.skills.get(CAULES_NARRATOR_ID).handlerId, CAULES_NARRATOR_HANDLER);
  assert.deepEqual(built.skills.get(CAULES_THUNDER_ID).playAttributeDeclaration, {
    allowedAttributes: ["力量", "迅捷", "魔术", "特殊", "宝具"],
    uniquePerGame: true,
    repeatAllowedWithOwnedSkillId: CAULES_NARRATOR_ID,
  });
});

test("Hanging Tree Thunder requires its activated skill-zone card and enforces one declaration per attribute before ascension", () => {
  const state = setup("caules-thunder-play");
  const thunder = add(state, "c", "c:thunder", CAULES_THUNDER_ID, "master-skills", { face: "up", active: false });
  addStandard(state, "c", "c:basic:3");
  assert.throws(() => playThunder(state, "力量", thunder.instanceId, "c:basic:3"), /CARD_REQUIRES_ACTIVE_SKILL_ZONE_SOURCE/);

  thunder.active = true;
  const result = playThunder(state, "力量", thunder.instanceId, "c:basic:3");
  assert.equal(result.cards.some((card) => card.instanceId === thunder.instanceId), true);
  assert.equal(thunder.declaredAttribute, "力量");
  assert.equal(thunder.declaredAttributeRevealed, true);
  assert.deepEqual(state.players.c.playAttributeDeclarations?.[CAULES_THUNDER_ID], ["力量"]);

  closePlayerCard(state, "c", thunder.instanceId, definitions);
  state.round = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "c";
  thunder.active = true;
  addStandard(state, "c", "c:basic:4");
  assert.throws(() => playThunder(state, "力量", thunder.instanceId, "c:basic:4"), /PLAY_ATTRIBUTE_ALREADY_DECLARED/);
  assert.throws(() => playThunder(state, "不存在属性", thunder.instanceId, "c:basic:4"), /CARD_ATTRIBUTE_INVALID|PLAY_ATTRIBUTE_DECLARATION_FORBIDDEN/);
});

test("Last Narrator rewrite permits repeated declarations and hides one until Combat begins", () => {
  const state = setup("caules-secret");
  state.players.c.playAttributeDeclarations = { [CAULES_THUNDER_ID]: ["力量"] };
  add(state, "c", "c:narrator", CAULES_NARRATOR_ID, "master-skills", { face: "up", active: false });
  const thunder = addReadyThunder(state);
  playThunder(state, "力量", thunder.instanceId);
  const harness = passiveHarness();
  emitPassive(state, harness, "card.played", { playerId: "c", instanceId: thunder.instanceId, definitionId: CAULES_THUNDER_ID, face: "up" });
  assert.equal(thunder.declaredAttributeRevealed, false);
  assert.equal(projectPublicState(state, "c").cards[thunder.instanceId].declaredAttribute, "力量");
  assert.equal(projectPublicState(state, "o").cards[thunder.instanceId].declaredAttribute, null);
  assert.equal("playAttributeDeclarations" in projectPublicState(state, "o").players.c, false, "declaration history is never projected");

  state.phase = "combat";
  state.step = "player-window";
  emitPassive(state, harness, "phase.transitioned", { previousPhase: "action", transition: "next-phase" });
  assert.equal(thunder.declaredAttributeRevealed, true);
  assert.equal(projectPublicState(state, "o").cards[thunder.instanceId].declaredAttribute, "力量");
});

test("Electromancy sets only matching same-battlefield opponent basic attacks to zero", () => {
  const state = setup("caules-electromancy");
  state.phase = "combat";
  state.step = "player-window";
  const thunder = add(state, "c", "c:thunder", CAULES_THUNDER_ID, "attack", { face: "up", active: true });
  thunder.declaredAttribute = "力量";
  thunder.declaredAttributeRevealed = true;
  addStandard(state, "o", "o:str", "card.cardb4", "attack");
  addStandard(state, "o", "o:magic", "card.carda4", "attack");
  definitions["test.nonbasic-strength"] = { id: "test.nonbasic-strength", name: "Nonbasic Strength", cost: 0, basePower: 8, typeLabel: "力量", attributes: ["力量"] };
  add(state, "o", "o:nonbasic", "test.nonbasic-strength", "attack", { face: "up", active: true });
  addStandard(state, "x", "x:str", "card.cardb4", "attack");

  const result = built.skills.execute(
    state, "c", CAULES_THUNDER_ID, { abilityId: CAULES_THUNDER_ABILITY }, () => {}, () => 0, definitions,
  );
  assert.deepEqual(result.affectedInstanceIds, ["o:str"]);
  assert.equal(calculateCombatCardPower(state, state.players.o, "o:str", definitions, "mountain"), 0);
  assert.equal(calculateCombatCardPower(state, state.players.o, "o:magic", definitions, "mountain"), 5);
  assert.equal(calculateCombatCardPower(state, state.players.o, "o:nonbasic", definitions, "mountain"), 8);
  assert.equal(calculateCombatCardPower(state, state.players.x, "x:str", definitions, "city"), 5);
});

test("Last Narrator schedules exact post-cleanup deck replacement before the next round draw", () => {
  const state = setup("caules-rebuild");
  const narrator = add(state, "c", "c:narrator", CAULES_NARRATOR_ID, "master-skills", { face: "up", active: false });
  addStandard(state, "c", "old-hand", "card.cardb1", "hand");
  addStandard(state, "c", "old-deck", "card.cardq1", "deck");
  addStandard(state, "c", "old-discard", "card.carda1", "discard");
  addStandard(state, "c", "old-attack", "card.cardb2", "attack");
  const harness = passiveHarness();
  emitPassive(state, harness, "skill.unlocked", { playerId: "c", skillId: CAULES_NARRATOR_ID, definitionId: CAULES_NARRATOR_ID, instanceId: narrator.instanceId });
  assert.equal(Array.isArray(state.modeState.pendingDeckRebuilds), true);
  assert.equal(state.modeState.pendingDeckRebuilds[0].targetRound, 4);

  endStandardRound(state, definitions);
  assert.equal(state.cards["old-attack"].zone, "discard", "round cleanup happens before replacement");
  state.round = 4;
  const applied = applyDueDeckRebuilds(state, 4, definitions, () => 0);
  assert.equal(applied.length, 1);
  for (const id of ["old-hand", "old-deck", "old-discard", "old-attack"]) assert.equal(state.cards[id].zone, "removed");
  assert.equal(state.players.c.hand.length, 0);
  assert.equal(state.players.c.discard.length, 0);
  assert.equal(state.players.c.deck.length, 12);
  assert.equal(state.players.c.masterSkills.includes(narrator.instanceId), true, "skill zone is not part of the rebuild removal");
  const counts = Object.fromEntries(CAULES_NARRATOR_DECK.map((id) => [id, state.players.c.deck.filter((instanceId) => state.cards[instanceId].definitionId === id).length]));
  assert.deepEqual(counts, {
    "card.cardb3": 2,
    "card.cardb4": 3,
    "card.carda3": 2,
    "card.carda4": 3,
    "card.cardluck": 1,
    "card.cardsurveil": 1,
  });
  assert.equal(state.modeState.pendingDeckRebuilds, undefined);
});
