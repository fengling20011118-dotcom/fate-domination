import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { spendNormalCommandSeal, payCommandSealCost } from "../src/rules-core/command-seals.ts";
import { cardHasEightManaWaiver, getCardRulePowerAdd } from "../src/rules-core/card-rule-modifiers.ts";
import { calculateTerrainAdvantage } from "../src/rules-core/combat-power.ts";
import {
  HAKUNO_F_ASCENSION_ID,
  HAKUNO_F_CCC_ID,
  HAKUNO_F_DRESS_ABILITY,
  HAKUNO_F_DRESS_ID,
  HAKUNO_F_EXTELLA_ID,
  HAKUNO_F_EXTRA_ID,
  HAKUNO_F_HANDLER,
  HAKUNO_F_HACK_ABILITY,
  HAKUNO_F_LINK_ID,
  HAKUNO_F_MOON_DRIVE_ABILITY,
  HAKUNO_F_RECOVERY_ABILITY,
  resolveHakunoFDecision,
  syncHakunoFCodeState,
  useHakunoFMysticCode,
} from "../src/rules-core/hakuno-f.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function skill(id) { return built.skills.get(id); }

function setup(id = "hakuno-f") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "h", name: "Hakuno" }, { id: "o", name: "Opponent" }, { id: "x", name: "Third" }],
    seed: 8801,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "h";
  state.turnOrder = ["h", "o", "x"];
  state.players.h.masterId = "master.hakuno-f";
  state.players.h.servantId = "servant.emiya";
  state.players.h.locationId = "mountain";
  state.players.h.mana = 20;
  state.players.h.commandSeals = 3;
  state.players.h.victoryPoints = 5;
  state.players.o.masterId = "master.rin";
  state.players.o.servantId = "servant.cu";
  state.players.o.locationId = "mountain";
  state.players.o.mana = 20;
  state.players.x.masterId = "master.waver";
  state.players.x.servantId = "servant.emiya";
  state.players.x.locationId = "scouting";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["h", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = ["x"];
  return state;
}

function add(state, playerId, instanceId, definitionId, zone = "hand", options = {}) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face: zone === "attack" || zone === "master-skills" ? "up" : "down",
    active: zone === "attack",
    residual: zone === "attack" && definitions[definitionId]?.residual === true,
    ...options,
  });
}

function addCode(state, skillId, instanceId = skillId.split(".").at(-1), zone = "master-skills") {
  return add(state, "h", instanceId, skillId, zone, {
    originMasterId: "master.hakuno-f",
    face: "up",
    active: zone === "attack",
    residual: false,
  });
}

function context(state, skillDefinition, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.h,
    skill: skillDefinition,
    payload,
    definitions,
    randomInt: () => 0,
    openDecision() {},
    ...extra,
  };
}

test("Hakuno F package is 6/6 FULL; four Mystic Codes start outside the game", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.hakuno-f");
  assert.equal(skills.length, 6);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => candidate.handlerId === HAKUNO_F_HANDLER));
  for (const id of [HAKUNO_F_LINK_ID, HAKUNO_F_CCC_ID, HAKUNO_F_EXTELLA_ID, HAKUNO_F_EXTRA_ID, HAKUNO_F_ASCENSION_ID]) {
    assert.equal(skill(id).initiallyOwned, false);
  }
  for (const id of [HAKUNO_F_LINK_ID, HAKUNO_F_CCC_ID, HAKUNO_F_EXTELLA_ID, HAKUNO_F_EXTRA_ID]) assert.equal(skill(id).standardAppend, true);
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.ok(skills.every((candidate) => (candidate.rules?.ambiguities ?? []).length === 0 && (candidate.rules?.unmodeledClauses ?? []).length === 0));
});

test("Dress Change random-discards one card, swaps a physical outside-game code, and Link restricts seal uses but not movement/payment", () => {
  const state = setup("hakuno-f-dress");
  state.phase = "outpost";
  add(state, "h", "hand-a", "card.carda1");
  add(state, "h", "hand-b", "card.cardb1");
  const first = useHakunoFMysticCode(context(state, skill(HAKUNO_F_DRESS_ID), {
    abilityId: HAKUNO_F_DRESS_ABILITY,
    mysticCodeSkillId: HAKUNO_F_LINK_ID,
  }));
  assert.equal(first.discardedInstanceId, "hand-a");
  assert.equal(state.cards["hand-a"].zone, "discard");
  const link = state.cards[first.mysticCodeInstanceId];
  assert.equal(link.zone, "master-skills");
  assert.equal(state.players.h.flags.commandSealUseMovementOnlySourceInstanceId, link.instanceId);
  assert.throws(() => spendNormalCommandSeal(state, "h"), /COMMAND_SEAL_USE_PURPOSE_FORBIDDEN/);
  spendNormalCommandSeal(state, "h", "movement");
  assert.equal(state.players.h.commandSeals, 2);
  payCommandSealCost(state, "h", 1);
  assert.equal(state.players.h.commandSeals, 1);

  add(state, "h", "hand-c", "card.carda2");
  const second = useHakunoFMysticCode(context(state, skill(HAKUNO_F_DRESS_ID), {
    abilityId: HAKUNO_F_DRESS_ABILITY,
    mysticCodeSkillId: HAKUNO_F_EXTELLA_ID,
  }));
  assert.equal(state.cards[link.instanceId].zone, "removed");
  assert.equal(state.cards[second.mysticCodeInstanceId].zone, "master-skills");
  assert.equal(state.players.h.flags.commandSealUseMovementOnlySourceInstanceId, undefined);
});

test("Link Moon Drive is idempotent and adds each played attack's current mana cost up to +3; Regalia adds +1 to basic attacks", () => {
  const state = setup("hakuno-f-link");
  const link = addCode(state, HAKUNO_F_LINK_ID, "link", "attack");
  link.playedRound = state.round;
  add(state, "h", "cheap", "card.cardpreparation", "attack", { face: "up", active: true });
  add(state, "h", "costly", "card.carda5", "attack", { face: "up", active: true });
  state.cards.cheap.playedRound = state.round;
  state.cards.cheap.paidCost = 1;
  state.cards.costly.playedRound = state.round;
  state.cards.costly.paidCost = 3;
  const first = useHakunoFMysticCode(context(state, skill(HAKUNO_F_LINK_ID), { abilityId: HAKUNO_F_MOON_DRIVE_ABILITY }));
  assert.deepEqual(new Map(first.modified.map((entry) => [entry.instanceId, entry.power])), new Map([["cheap", 1], ["costly", 3]]));
  useHakunoFMysticCode(context(state, skill(HAKUNO_F_LINK_ID), { abilityId: HAKUNO_F_MOON_DRIVE_ABILITY }));
  assert.equal(state.cards.costly.powerModifiers.filter((modifier) => modifier.sourceId === HAKUNO_F_LINK_ID).length, 1);

  addCode(state, HAKUNO_F_ASCENSION_ID, "regalia", "master-skills");
  syncHakunoFCodeState(state, "h", definitions);
  assert.equal(getCardRulePowerAdd(state, state.players.h, state.cards.cheap), 1);
});

test("CCC Data Leak loses 1 VP from the equipped skill zone; Regalia Hack can pay for one temporary discarded-card copy", () => {
  const state = setup("hakuno-f-ccc");
  const ccc = addCode(state, HAKUNO_F_CCC_ID, "ccc", "attack");
  ccc.playedRound = state.round;
  addCode(state, HAKUNO_F_ASCENSION_ID, "regalia", "master-skills");
  add(state, "o", "top1", "card.carda5", "deck");
  add(state, "o", "top2", "card.carda1", "deck");
  add(state, "o", "top3", "card.cardb1", "deck");
  const manaBefore = state.players.h.mana;
  const hacked = useHakunoFMysticCode(context(state, skill(HAKUNO_F_CCC_ID), {
    abilityId: HAKUNO_F_HACK_ABILITY,
    targetPlayerId: "o",
    discardInstanceIds: ["top1"],
    orderedRestInstanceIds: ["top3", "top2"],
    copyDiscardInstanceId: "top1",
  }));
  assert.equal(state.cards.top1.zone, "discard");
  assert.deepEqual(state.players.o.deck.slice(0, 2), ["top3", "top2"]);
  assert.equal(state.cards[hacked.copiedInstanceId].zone, "attack");
  assert.equal(state.cards[hacked.copiedInstanceId].temporary, true);
  assert.equal(state.cards[hacked.copiedInstanceId].temporaryCleanup, "round-end");
  assert.equal(state.players.h.mana, manaBefore - definitions["card.carda5"].cost);

  // Data Leak remains a passive of the equipped code. Put it back in the skill zone to verify that ownership mode.
  state.players.h.attack = state.players.h.attack.filter((id) => id !== "ccc");
  state.players.h.masterSkills.push("ccc");
  state.cards.ccc.zone = "master-skills";
  state.cards.ccc.active = false;
  useHakunoFMysticCode(context(state, skill(HAKUNO_F_CCC_ID), {
    eventType: "combat.resolved",
    event: { locationId: "mountain", participantIds: ["h", "o"], winnerIds: ["o"] },
  }));
  assert.equal(state.players.h.victoryPoints, 4);
});

test("Extella removes itself on movement, Recovery pays half rounded up after a loss, and Regalia gives +5 plus source-bound zero terrain", () => {
  const moved = setup("hakuno-f-extella-move");
  addCode(moved, HAKUNO_F_EXTELLA_ID, "extella", "master-skills");
  useHakunoFMysticCode(context(moved, skill(HAKUNO_F_EXTELLA_ID), {
    eventType: "player.moved",
    event: { playerId: "h", previousLocationId: "mountain", locationId: "city" },
  }));
  assert.equal(moved.cards.extella.zone, "removed");

  const state = setup("hakuno-f-extella-recovery");
  state.phase = "combat";
  const extella = addCode(state, HAKUNO_F_EXTELLA_ID, "extella", "attack");
  extella.playedRound = state.round;
  const candidate = add(state, "h", "candidate", "card.carda5", "attack", { face: "up", active: true, residual: false });
  candidate.playedRound = state.round;
  candidate.paidCost = 3;
  addCode(state, HAKUNO_F_ASCENSION_ID, "regalia", "master-skills");
  syncHakunoFCodeState(state, "h", definitions);
  assert.equal(getCardRulePowerAdd(state, state.players.h, extella), 5);
  state.players.h.flags.deploymentBonusActive = true;
  state.players.h.flags.deploymentLocationId = "mountain";
  state.players.h.flags.deploymentBonus = 3;
  useHakunoFMysticCode(context(state, skill(HAKUNO_F_EXTELLA_ID), {
    eventType: "card.played",
    event: { playerId: "h", instanceId: "extella", definitionId: HAKUNO_F_EXTELLA_ID },
  }));
  assert.equal(calculateTerrainAdvantage(state, state.players.h, definitions, "mountain"), 0);
  const manaBefore = state.players.h.mana;
  useHakunoFMysticCode(context(state, skill(HAKUNO_F_EXTELLA_ID), { abilityId: HAKUNO_F_RECOVERY_ABILITY, targetInstanceId: candidate.instanceId }));
  const result = useHakunoFMysticCode(context(state, skill(HAKUNO_F_EXTELLA_ID), {
    eventType: "combat.resolved",
    event: { locationId: "mountain", participantIds: ["h", "o"], winnerIds: ["o"] },
  }));
  assert.equal(result.requestedMana, 2);
  assert.equal(state.players.h.mana, manaBefore + 2);
});

test("Extra Backdoor may enter full Recon and Emergency Protocol removes the equipped code on a win; Regalia waives its 8-mana gate", () => {
  const state = setup("hakuno-f-extra");
  const extra = addCode(state, HAKUNO_F_EXTRA_ID, "extra", "master-skills");
  addCode(state, HAKUNO_F_ASCENSION_ID, "regalia", "master-skills");
  syncHakunoFCodeState(state, "h", definitions);
  assert.equal(cardHasEightManaWaiver(state, state.players.h, extra), true);

  let decision;
  const pending = useHakunoFMysticCode(context(state, skill(HAKUNO_F_EXTRA_ID), {
    eventType: "player.entered-location",
    event: { playerId: "o", previousLocationId: "city", locationId: "mountain" },
  }, { openDecision(value) { decision = value; } }));
  assert.equal(pending.pending, true);
  assert.equal(decision.kind, "hakuno-f-backdoor");
  const previous = state.effectQueue.find((entry) => entry.handlerId === "core.hakuno-f-mystic-code-resolve").payload;
  const moved = resolveHakunoFDecision(context(state, skill(HAKUNO_F_EXTRA_ID), {
    previous,
    decision: { status: "resolved", selections: ["move"] },
  }));
  assert.equal(moved.moved, true);
  assert.equal(state.players.h.locationId, "scouting");
  assert.deepEqual(new Set(state.board.locations.scouting), new Set(["x", "h"]));

  // Return the code and Hakuno to the battlefield, then verify the win-removal passive.
  state.board.locations.scouting = state.board.locations.scouting.filter((id) => id !== "h");
  state.board.locations.mountain.push("h");
  state.players.h.locationId = "mountain";
  const result = useHakunoFMysticCode(context(state, skill(HAKUNO_F_EXTRA_ID), {
    eventType: "combat.resolved",
    event: { locationId: "mountain", participantIds: ["h", "o"], winnerIds: ["h"] },
  }));
  assert.equal(result.removedInstanceId, "extra");
  assert.equal(state.cards.extra.zone, "removed");
});
