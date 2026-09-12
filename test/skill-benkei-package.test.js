import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { spendNormalCommandSeal, payCommandSealCost } from "../src/rules-core/command-seals.ts";
import { playerNoblePhantasmUseBlocked } from "../src/rules-core/player-statuses.ts";
import { isSkillUseBlocked } from "../src/rules-core/skill-use-blocks.ts";
import { getOwnedSkillCopyIds } from "../src/rules-core/skill-copies.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";
import {
  BENKEI_BULWARK_HANDLER,
  BENKEI_BULWARK_ID,
  BENKEI_BULWARK_RESOLVE,
  BENKEI_EVENLY_MATCHED_HANDLER,
  BENKEI_EVENLY_MATCHED_ID,
  BENKEI_EVENLY_MATCHED_RESOLVE,
  getBenkeiBulwarkOptions,
  resolveBenkeiBulwark,
  resolveBenkeiEvenlyMatched,
  useBenkeiBulwark,
  useBenkeiEvenlyMatched,
} from "../src/rules-core/benkei.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const bulwark = built.skills.get(BENKEI_BULWARK_ID);
const evenly = built.skills.get(BENKEI_EVENLY_MATCHED_ID);
const COPY_SOURCE = "master.kirei.skill.s2";
const COPY_ABILITY = "neutral-move";

function setup(id = "benkei") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "b", name: "Benkei" }, { id: "o", name: "Opponent" }, { id: "x", name: "Other" }],
    seed: 771,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "b";
  state.players.b.servantId = "servant.benkei";
  state.players.o.masterId = "master.kirei";
  state.players.b.mana = 6;
  state.players.o.mana = 6;
  state.players.x.mana = 6;
  for (const id of ["b", "o"]) {
    state.players[id].locationId = "mountain";
    state.board.locations.mountain.push(id);
  }
  state.players.x.locationId = "city";
  state.board.locations.city.push("x");
  return state;
}

function addCard(state, playerId, instanceId, definitionId, zone = "hand", extra = {}) {
  return createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, ...extra });
}

function activeBulwark(state) {
  return addCard(state, "b", "b:bulwark", BENKEI_BULWARK_ID, "attack", { face: "up", active: true });
}

function resolveBulwarkOption(state, option) {
  let opened;
  useBenkeiBulwark({
    state, player: state.players.b, skill: bulwark, payload: { abilityId: "intimidation" }, definitions,
    openDecision: (decision) => { opened = decision; },
  });
  assert.ok(opened);
  const frame = state.effectQueue.shift();
  const result = resolveBenkeiBulwark({
    state, player: state.players.b, skill: bulwark,
    payload: { previous: frame.payload, decision: { status: "resolved", selections: [option] } },
    definitions, openDecision: () => {},
  });
  return { opened, result };
}

function copySourceSkill(state, { discardId = "b:discard", sourcePlayerId = "o" } = {}) {
  if (!state.cards[discardId]) addCard(state, "b", discardId, "card.cardluck", "hand", { face: "down" });
  let opened;
  useBenkeiEvenlyMatched({
    state, player: state.players.b, skill: evenly,
    payload: { eventType: "skill.used", event: { playerId: sourcePlayerId, skillId: COPY_SOURCE } },
    definitions, openDecision: (decision) => { opened = decision; },
  });
  assert.ok(opened);
  const frame = state.effectQueue.shift();
  const result = resolveBenkeiEvenlyMatched({
    state, player: state.players.b, skill: evenly,
    payload: { previous: frame.payload, decision: { status: "resolved", selections: [discardId] } },
    definitions, openDecision: () => {},
  });
  return result;
}

test("Benkei package is 3/3 FULL; passive and decision continuations are registered", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.benkei");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(evenly.limit, undefined, "Evenly Matched itself is not once-per-game");
  assert.equal(bulwark.handlerId, BENKEI_BULWARK_HANDLER);
  assert.equal(evenly.handlerId, BENKEI_EVENLY_MATCHED_HANDLER);

  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  assert.equal(effects.has(BENKEI_BULWARK_RESOLVE), true);
  assert.equal(effects.has(BENKEI_EVENLY_MATCHED_HANDLER), true);
  assert.equal(effects.has(BENKEI_EVENLY_MATCHED_RESOLVE), true);
});

test("Bulwark Command Seal option blocks use but not paying a seal as a cost, and each option is independently once per game", () => {
  const state = setup("benkei-bulwark-seal");
  activeBulwark(state);
  const { opened } = resolveBulwarkOption(state, "command-seals");
  assert.deepEqual(opened.options.map((option) => option.id), ["command-seals", "noble-phantasms", "copied-skills"]);
  assert.throws(() => spendNormalCommandSeal(state, "o"), /COMMAND_SEAL_USE_BLOCKED/);
  const before = state.players.o.commandSeals;
  payCommandSealCost(state, "o", 1);
  assert.equal(state.players.o.commandSeals, before - 1, "paying a Command Seal cost is not using a Command Seal");
  assert.deepEqual(getBenkeiBulwarkOptions(state.players.b), ["noble-phantasms", "copied-skills"]);

  state.round += 1;
  spendNormalCommandSeal(state, "o");
  assert.equal(state.players.o.flags.commandSealUsedRound, state.round);
});

test("Bulwark Noble Phantasm and copied-skill options install round-scoped generic blocks", () => {
  const np = setup("benkei-bulwark-np");
  activeBulwark(np);
  resolveBulwarkOption(np, "noble-phantasms");
  assert.equal(playerNoblePhantasmUseBlocked(np.players.o, np.round), true);
  assert.equal(playerNoblePhantasmUseBlocked(np.players.x, np.round), true);

  const copied = setup("benkei-bulwark-copy");
  activeBulwark(copied);
  copySourceSkill(copied);
  resolveBulwarkOption(copied, "copied-skills");
  assert.deepEqual(getOwnedSkillCopyIds(copied, copied.players.b), [COPY_SOURCE]);
  assert.equal(isSkillUseBlocked(copied.players.o, copied.round, COPY_SOURCE), true);
  assert.equal(isSkillUseBlocked(copied.players.o, copied.round, "master.kirei.skill.s1a"), false);
  assert.equal(isSkillUseBlocked(copied.players.x, copied.round, COPY_SOURCE), true);
});

test("Evenly Matched triggers only for same-battlefield skills, serializes optional discard, and creates a text-replaced persistent copy", () => {
  const state = setup("benkei-copy-trigger");
  addCard(state, "b", "b:discard", "card.cardluck", "hand", { face: "down" });
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  const event = { eventId: "evt:kirei", type: "skill.used", revision: state.revision, sourceCommandId: "test", payload: { playerId: "o", skillId: COPY_SOURCE } };
  const frames = enqueuePassiveEffects(state, passives, event);
  assert.equal(frames.some((frame) => frame.sourceId === BENKEI_EVENLY_MATCHED_ID), true);
  state.effectQueue = [];

  state.players.o.locationId = "city";
  state.board.locations.mountain = ["b"];
  state.board.locations.city = ["x", "o"];
  assert.equal(enqueuePassiveEffects(state, passives, { ...event, eventId: "evt:remote" }).length, 0);
  state.effectQueue = [];
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["b", "o"];
  state.board.locations.city = ["x"];

  const copied = copySourceSkill(state);
  assert.equal(copied.copied, true);
  assert.equal(state.cards["b:discard"].zone, "discard");
  const instance = state.cards[copied.instanceId];
  assert.equal(instance.zone, "master-skills");
  assert.equal(instance.temporary, true);
  assert.equal(instance.temporaryCleanup, "explicit", "unused copy survives ordinary round cleanup");
  assert.deepEqual(instance.skillCopyReplacement, {
    sourceId: BENKEI_EVENLY_MATCHED_ID,
    sourceSkillId: COPY_SOURCE,
    totalPowerGain: 3,
    oncePerCopy: true,
    removeAtRoundEndAfterUse: true,
  });
});

test("a copied activated ability ignores original cost/effect/conditions, grants +3 once per physical copy, and is removed only after a round in which it is used", () => {
  const state = setup("benkei-copy-use");
  const copied = copySourceSkill(state);
  const instance = state.cards[copied.instanceId];
  const manaBefore = state.players.b.mana;
  const locationBefore = state.players.b.locationId;

  const result = built.skills.execute(
    state, "b", COPY_SOURCE, { abilityId: COPY_ABILITY }, () => {}, () => 0, definitions,
  );
  assert.equal(result.totalPowerGain, 3);
  assert.equal(state.players.b.flags.roundPowerBonus, 3);
  assert.equal(state.players.b.mana, manaBefore, "original 2-mana ability cost is replaced");
  assert.equal(state.players.b.locationId, locationBefore, "original movement effect is replaced");
  assert.equal(instance.skillCopyReplacement.used, true);
  assert.equal(instance.temporaryCleanup, "round-end");
  assert.throws(() => built.skills.execute(state, "b", COPY_SOURCE, { abilityId: COPY_ABILITY }, () => {}, () => 0, definitions), /SKILL_USE_FORBIDDEN/);

  endStandardRound(state, definitions);
  assert.equal(instance.zone, "removed");
  state.round += 1;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "b";
  state.players.b.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["b", "o"];
  addCard(state, "b", "b:discard-2", "card.cardluck", "hand", { face: "down" });
  const second = copySourceSkill(state, { discardId: "b:discard-2" });
  assert.notEqual(second.instanceId, copied.instanceId);
  assert.equal(state.cards[second.instanceId].skillCopyReplacement.used, undefined, "a later physical copy receives its own once-per-copy use");
});
