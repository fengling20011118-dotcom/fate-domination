import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { SkillRegistry } from "../src/rules-core/skill-registry.ts";
import { BEDIVERE_OATH_ID, BEDIVERE_SILVER_ARM_ID } from "../src/rules-core/bedivere.ts";
import {
  MELTRYLLIS_MELT_VIRUS_HANDLER,
  MELTRYLLIS_MELT_VIRUS_ID,
  MELTRYLLIS_SARASWATI_HANDLER,
  MELTRYLLIS_SARASWATI_ID,
  useMeltryllisMeltVirus,
} from "../src/rules-core/meltryllis.ts";

function setup(id = "meltryllis-package") {
  const built = buildStandardContent(legacyContent);
  registerCoreSkillHandlers(built.skills);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "m", name: "Meltryllis" }, { id: "b", name: "Bedivere" }, { id: "o", name: "Other" }],
    seed: 13131,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "m";
  state.players.m.servantId = "servant.meltryllis";
  state.players.b.servantId = "servant.bedivere";
  state.players.m.mana = 30;
  state.players.b.mana = 30;
  state.players.o.mana = 30;
  state.players.m.locationId = "mountain";
  state.players.b.locationId = "mountain";
  state.players.o.locationId = "city";
  state.board.locations = { workshop: [], mountain: ["m", "b"], city: ["o"], scouting: [] };
  return { built, definitions, state };
}

function add(state, playerId, instanceId, definitionId, zone, extra = {}) {
  return createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, ...extra });
}

function addMeltVirus(state, reversed = false) {
  const card = add(state, "m", "m:melt-virus", MELTRYLLIS_MELT_VIRUS_ID, "attack", {
    face: "up", active: true,
  });
  card.reversed = reversed;
  return card;
}

function addSaraswati(state, reversed = false) {
  const card = add(state, "m", "m:saraswati", MELTRYLLIS_SARASWATI_ID, "attack", {
    face: "up", active: true,
  });
  card.reversed = reversed;
  return card;
}

function useSkill(registry, state, playerId, skillId, data, definitions, randomInt = () => 0) {
  return registry.execute(state, playerId, skillId, data, () => { throw new Error("UNEXPECTED_DECISION"); }, randomInt, definitions);
}

function resolveMeltSchedule(built, definitions, state, randomInt = () => 0) {
  const scheduled = state.scheduledEffects?.[0];
  assert.ok(scheduled);
  return useMeltryllisMeltVirus({
    state,
    player: state.players.m,
    skill: built.skills.get(MELTRYLLIS_MELT_VIRUS_ID),
    payload: { scheduled: scheduled.payload, eventType: "round.started", event: {} },
    openDecision: () => { throw new Error("UNEXPECTED_DECISION"); },
    randomInt,
    definitions,
  });
}

test("Meltryllis package is 3/3 FULL with dedicated handlers for both complex Skill cards", () => {
  const { built } = setup("meltryllis-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.meltryllis");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(built.skills.get(MELTRYLLIS_MELT_VIRUS_ID).handlerId, MELTRYLLIS_MELT_VIRUS_HANDLER);
  assert.equal(built.skills.get(MELTRYLLIS_SARASWATI_ID).handlerId, MELTRYLLIS_SARASWATI_HANDLER);
  assert.deepEqual(built.skills.get(MELTRYLLIS_SARASWATI_ID).abilities?.map((ability) => ability.uniqueGroup), [
    "meltryllis-saraswati-one-ability",
    "meltryllis-saraswati-one-ability",
  ]);
});

test("Melt Virus schedules next-round infection and does nothing if the source is no longer available", () => {
  const { built, definitions, state } = setup("melt-virus-source-lost");
  addMeltVirus(state, true);
  add(state, "b", "b:silver", BEDIVERE_SILVER_ARM_ID, "servant-skills", { face: "down", active: false });

  const result = useSkill(built.skills, state, "m", MELTRYLLIS_MELT_VIRUS_ID, { abilityId: "absorb" }, definitions);
  assert.deepEqual(result.targetPlayerIds, ["b"]);
  assert.equal(result.copyOnResolve, true);
  assert.equal(state.scheduledEffects?.[0]?.triggerEventType, "round.started");
  assert.equal(state.scheduledEffects?.[0]?.triggerRound, 5);

  movePlayerCard(state, "m", "m:melt-virus", "removed");
  state.round = 5;
  const delayed = resolveMeltSchedule(built, definitions, state);
  assert.equal(delayed.sourceUnavailable, true);
  assert.deepEqual(delayed.infectedInstanceIds, []);
  assert.deepEqual(delayed.copiedInstanceIds, []);
  assert.equal(state.players.b.skillUseBlocks, undefined);
});

test("Melt Virus infects one physical Skill; Bedivere Oath can bypass another infected Skill but cannot activate when Oath itself is infected", () => {
  const first = setup("melt-virus-bedivere-bypass");
  addMeltVirus(first.state, false);
  add(first.state, "b", "b:oath", BEDIVERE_OATH_ID, "servant-skills", { face: "down", active: false });
  add(first.state, "b", "b:silver", BEDIVERE_SILVER_ARM_ID, "servant-skills", { face: "down", active: false });
  add(first.state, "b", "b:deck-1", "card.cardb1", "deck");
  add(first.state, "b", "b:deck-2", "card.cardb2", "deck");
  add(first.state, "b", "b:oath-discard", "card.cardq1", "hand");
  useSkill(first.built.skills, first.state, "m", MELTRYLLIS_MELT_VIRUS_ID, { abilityId: "absorb" }, first.definitions);
  first.state.round = 5;
  const infection = resolveMeltSchedule(first.built, first.definitions, first.state, () => 1);
  assert.deepEqual(infection.infectedInstanceIds, ["b:silver"]);

  first.state.phase = "action";
  first.state.activePlayerId = "b";
  assert.throws(() => first.built.skills.assertCanExecute(first.state, "b", BEDIVERE_SILVER_ARM_ID, { abilityId: "grip-the-sword" }, first.definitions), /SKILL_USE_FORBIDDEN/);

  first.state.phase = "outpost";
  useSkill(first.built.skills, first.state, "b", BEDIVERE_OATH_ID, { abilityId: "oath-protection", discardInstanceId: "b:oath-discard" }, first.definitions);
  first.state.phase = "action";
  first.built.skills.assertCanExecute(first.state, "b", BEDIVERE_SILVER_ARM_ID, { abilityId: "grip-the-sword" }, first.definitions);

  const second = setup("melt-virus-bedivere-oath-infected");
  addMeltVirus(second.state, false);
  add(second.state, "b", "b:oath", BEDIVERE_OATH_ID, "servant-skills", { face: "down", active: false });
  add(second.state, "b", "b:silver", BEDIVERE_SILVER_ARM_ID, "servant-skills", { face: "down", active: false });
  add(second.state, "b", "b:oath-discard", "card.cardq1", "hand");
  useSkill(second.built.skills, second.state, "m", MELTRYLLIS_MELT_VIRUS_ID, { abilityId: "absorb" }, second.definitions);
  second.state.round = 5;
  resolveMeltSchedule(second.built, second.definitions, second.state, () => 0);
  second.state.phase = "outpost";
  second.state.activePlayerId = "b";
  assert.throws(() => second.built.skills.assertCanExecute(second.state, "b", BEDIVERE_OATH_ID, { abilityId: "oath-protection", discardInstanceId: "b:oath-discard" }, second.definitions), /SKILL_USE_FORBIDDEN/);
});

test("reversed Melt Virus creates a fresh temporary full-text copy without source instance state", () => {
  const { built, definitions, state } = setup("melt-virus-reversed-copy");
  addMeltVirus(state, true);
  const source = add(state, "b", "b:silver", BEDIVERE_SILVER_ARM_ID, "servant-skills", { face: "up", active: false });
  source.modifiers.push("token-like-marker:3");
  source.powerModifiers = [{ id: "dirty-power", sourceId: "test", kind: "add", value: 9, duration: "game" }];
  source.costModifiers = [{ id: "dirty-cost", sourceId: "test", kind: "add", value: -1, duration: "game" }];
  source.reversed = true;

  useSkill(built.skills, state, "m", MELTRYLLIS_MELT_VIRUS_ID, { abilityId: "absorb" }, definitions);
  state.round = 5;
  const delayed = resolveMeltSchedule(built, definitions, state, () => 0);
  assert.deepEqual(delayed.infectedInstanceIds, ["b:silver"]);
  assert.equal(delayed.copiedInstanceIds.length, 1);
  const copy = state.cards[delayed.copiedInstanceIds[0]];
  assert.ok(copy);
  assert.ok(state.players.m.servantSkills.includes(copy.instanceId));
  assert.equal(copy.definitionId, BEDIVERE_SILVER_ARM_ID);
  assert.equal(copy.temporary, true);
  assert.equal(copy.temporaryCleanup, "round-end");
  assert.equal(copy.derivedFromInstanceId, "b:silver");
  assert.deepEqual(copy.modifiers, []);
  assert.equal(copy.powerModifiers, undefined);
  assert.equal(copy.costModifiers, undefined);
  assert.equal(copy.reversed, undefined);
  assert.deepEqual(copy.fullSkillCopy, {
    sourceId: MELTRYLLIS_MELT_VIRUS_ID,
    sourceSkillId: BEDIVERE_SILVER_ARM_ID,
    rebindNamedOwnerToController: true,
  });

  add(state, "m", "m:deck-1", "card.cardb1", "deck");
  add(state, "m", "m:deck-2", "card.cardb2", "deck");
  state.phase = "action";
  state.activePlayerId = "m";
  built.skills.assertCanExecute(state, "m", BEDIVERE_SILVER_ARM_ID, { abilityId: "grip-the-sword" }, definitions);
});

test("full-text Skill copy rebinds source named-owner references to the copy controller generically", () => {
  const registry = new SkillRegistry();
  const id = "servant.test-source.skill.named-owner";
  registry.register({
    id,
    name: "Named Owner Probe",
    ownerType: "servant",
    ownerId: "servant.test-source",
    activation: "phase",
    windows: ["action"],
    cost: 0,
    supportLevel: "FULL",
    handlerId: "test.named-owner",
  });
  registry.registerHandler(id, ({ skill }) => skill.ownerId);
  const state = createGameState({ gameInstanceId: "full-copy-name-rebind", players: [{ id: "p", name: "Copy Controller" }], seed: 7 });
  state.status = "playing";
  state.round = 2;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "p";
  state.players.p.servantId = "servant.copy-controller";
  const copy = add(state, "p", "p:copy", id, "servant-skills", { face: "up", active: false });
  copy.fullSkillCopy = { sourceId: MELTRYLLIS_MELT_VIRUS_ID, sourceSkillId: id, rebindNamedOwnerToController: true };
  const ownerIdSeenByHandler = registry.execute(state, "p", id, {}, () => { throw new Error("UNEXPECTED_DECISION"); });
  assert.equal(ownerIdSeenByHandler, "servant.copy-controller");
});

test("Saraswati Liquid Body caps Strength attacks at 3 and its two abilities share one use per round", () => {
  const { built, definitions, state } = setup("saraswati-liquid-body");
  const source = addSaraswati(state, false);
  add(state, "b", "b:high-strength", "card.cardb5", "attack", { face: "up", active: true });
  add(state, "b", "b:low-strength", "card.cardb1", "attack", { face: "up", active: true });

  useSkill(built.skills, state, "m", MELTRYLLIS_SARASWATI_ID, { abilityId: "liquid-body" }, definitions);
  assert.equal(calculateCombatCardPower(state, state.players.b, "b:high-strength", definitions), 3);
  assert.equal(calculateCombatCardPower(state, state.players.b, "b:low-strength", definitions), 2);

  source.reversed = true;
  add(state, "m", "m:hand-1", "card.cardb1", "hand");
  state.phase = "action";
  assert.throws(() => built.skills.assertCanExecute(state, "m", MELTRYLLIS_SARASWATI_ID, { abilityId: "alter-play", cardInstanceIds: ["m:hand-1"] }, definitions), /SKILL_USE_FORBIDDEN/);
});

test("reversed Saraswati Action ability makes up to three real paid plays from hand", () => {
  const { built, definitions, state } = setup("saraswati-three-plays");
  addSaraswati(state, true);
  state.phase = "action";
  for (let index = 1; index <= 3; index += 1) add(state, "m", `m:hand-${index}`, "card.cardb5", "hand");
  const manaBefore = state.players.m.mana;
  const paidEach = definitions["card.cardb5"].cost;

  const result = useSkill(built.skills, state, "m", MELTRYLLIS_SARASWATI_ID, {
    abilityId: "alter-play",
    cardInstanceIds: ["m:hand-1", "m:hand-2", "m:hand-3"],
  }, definitions);
  assert.equal(result.played.length, 3);
  assert.equal(state.players.m.mana, manaBefore - paidEach * 3);
  assert.deepEqual(state.players.m.hand, []);
  assert.ok(["m:hand-1", "m:hand-2", "m:hand-3"].every((instanceId) => state.players.m.attack.includes(instanceId)));
  assert.ok(["m:hand-1", "m:hand-2", "m:hand-3"].every((instanceId) => state.cards[instanceId].playedRound === state.round));
});
