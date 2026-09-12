import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { deployPlayer } from "../src/rules-core/board.ts";
import { createDerivedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  HISUI_ASCENSION_ID,
  HISUI_CLUE_ID,
  HISUI_CONFRONTATION_ID,
  HISUI_CONFRONT_ABILITY,
  HISUI_HANDLER,
  HISUI_LOCKED_ROOM_ID,
  HISUI_RUMOR_ID,
  resolveHisuiDetectiveDecision,
  useHisuiDetective,
} from "../src/rules-core/hisui-detective.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function setup(id = "hisui") {
  const state = createGameState({
    gameInstanceId: id,
    players: [
      { id: "h", name: "Hisui" },
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
    seed: 1507,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "h";
  state.turnOrder = ["h", "a", "b"];
  state.players.h.masterId = "master.hisui-detective";
  state.players.h.victoryPoints = 2;
  state.players.a.victoryPoints = 8;
  state.players.b.victoryPoints = 6;
  state.players.h.locationId = "workshop";
  state.players.a.locationId = "mountain";
  state.players.b.locationId = "mountain";
  state.board.locations.workshop = ["h"];
  state.board.locations.mountain = ["a", "b"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  state.board.eventDeck = ["event.fuyuki.17", "event.fuyuki.1"];
  state.board.eventDiscard = [];
  state.board.eventRemoved = [];
  state.board.currentEvents.mountain = [];
  state.board.currentEvents.city = [];
  return state;
}

function ctx(state, skillId, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.h,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extra,
  };
}

function resolve(state, previous, selections, extra = {}) {
  return resolveHisuiDetectiveDecision(ctx(state, HISUI_RUMOR_ID, {
    previous,
    decision: { status: "resolved", selections },
  }, extra));
}

function addClue(state, instanceId, culpritPlayerId, zone = "master-skills", locationId) {
  return createDerivedCardInstance(state, "h", {
    instanceId,
    definitionId: `card.skill.${HISUI_CLUE_ID}`,
    originMasterId: "master.hisui-detective",
    zone,
    ...(locationId ? { boardLocationId: locationId } : {}),
    face: "up",
    active: zone === "board",
    residual: false,
    sourceEffectId: HISUI_RUMOR_ID,
    createdByPlayerId: culpritPlayerId,
  });
}

function addConfrontation(state, instanceId, culpritPlayerId) {
  return createDerivedCardInstance(state, "h", {
    instanceId,
    definitionId: `card.skill.${HISUI_CONFRONTATION_ID}`,
    originMasterId: "master.hisui-detective",
    zone: "master-skills",
    face: "up",
    active: false,
    residual: false,
    sourceEffectId: HISUI_RUMOR_ID,
    createdByPlayerId: culpritPlayerId,
  });
}

test("Brainwash Detective Hisui package is 5/5 FULL with dedicated handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.hisui-detective");
  assert.equal(skills.length, 5);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => skill.handlerId === HISUI_HANDLER));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(built.skills.get(HISUI_CLUE_ID).initiallyOwned, false);
  assert.equal(built.skills.get(HISUI_CONFRONTATION_ID).initiallyOwned, false);
});

test("Locked-Room Mystery removes a stable Break Bounded Field, places it after Outpost, and winners leave physical Clues", () => {
  const state = setup("hisui-mystery");
  const setupResult = useHisuiDetective(ctx(state, HISUI_LOCKED_ROOM_ID, { eventType: "game.started", event: {} }));
  assert.equal(setupResult.removedEventId, "event.fuyuki.17");
  assert.deepEqual(state.board.eventRemoved, ["event.fuyuki.17"]);

  let opened;
  useHisuiDetective(ctx(state, HISUI_RUMOR_ID, {
    eventType: "phase.transitioned",
    event: { previousPhase: "outpost", transition: "next-phase" },
  }, { openDecision(value) { opened = value; } }));
  assert.ok(opened.options.some((option) => option.id === "place-0"));
  const frame = state.effectQueue.shift();
  const placed = resolve(state, frame.payload, ["place-0"]);
  assert.equal(placed.locationId, "mountain");
  assert.deepEqual(state.board.currentEvents.mountain, ["event.fuyuki.17"]);
  assert.equal(state.players.h.flags.hisuiLockedRoomUsesRemaining, 0);

  const clues = useHisuiDetective(ctx(state, HISUI_RUMOR_ID, {
    eventType: "combat.resolved",
    event: { round: 4, locationId: "mountain", eventIds: ["event.fuyuki.17"], winnerIds: ["a", "b"] },
  }));
  assert.equal(clues.clueInstanceIds.length, 2);
  const created = clues.clueInstanceIds.map((id) => state.cards[id]);
  assert.ok(created.every((card) => card.zone === "board" && card.boardLocationId === "mountain"));
  assert.deepEqual(created.map((card) => card.createdByPlayerId).sort(), ["a", "b"]);
});

test("terrain deployment acquires one Clue and entering Recon transforms it into Confrontation while preserving Culprit", () => {
  const state = setup("hisui-clue");
  state.players.h.locationId = null;
  state.board.locations.workshop = [];
  addClue(state, "clue-a", "a", "board", "mountain");
  state.phase = "outpost";
  state.activePlayerId = "h";
  deployPlayer(state, "h", "mountain", definitions);
  assert.ok(Number(state.players.h.flags.deploymentBonus) > 0);
  const acquired = useHisuiDetective(ctx(state, HISUI_RUMOR_ID, {
    eventType: "player.deployed", event: { playerId: "h", locationId: "mountain" },
  }));
  assert.equal(acquired.acquiredInstanceId, "clue-a");
  assert.equal(state.cards["clue-a"].zone, "master-skills");
  assert.equal(state.cards["clue-a"].boardLocationId, undefined);

  const transformed = useHisuiDetective(ctx(state, HISUI_RUMOR_ID, {
    eventType: "player.entered-location", event: { playerId: "h", locationId: "scouting" },
  }));
  assert.deepEqual(transformed.transformedInstanceIds, ["clue-a"]);
  assert.equal(state.cards["clue-a"].definitionId, `card.skill.${HISUI_CONFRONTATION_ID}`);
  assert.equal(state.cards["clue-a"].createdByPlayerId, "a");
});

test("Confrontation steals up to 4 VP and grants +5 before round 11; each physical Confrontation is once per game", () => {
  const state = setup("hisui-confront");
  state.phase = "action";
  state.activePlayerId = "h";
  state.players.h.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["h", "a", "b"];
  addConfrontation(state, "confront-a", "a");
  const result = useHisuiDetective(ctx(state, HISUI_CONFRONTATION_ID, { abilityId: HISUI_CONFRONT_ABILITY }));
  assert.equal(result.culpritPlayerId, "a");
  assert.equal(result.stolenVictoryPoints, 4);
  assert.equal(state.players.h.victoryPoints, 6);
  assert.equal(state.players.a.victoryPoints, 4);
  assert.equal(state.players.h.flags.roundPowerBonus, 5);
  assert.equal(state.cards["confront-a"].usedGameCount, 1);
  assert.equal(built.skills.getLegalActions(state, "h", definitions).some((action) => action.payload?.skillId === HISUI_CONFRONTATION_ID), false);
});

test("round 11 Confrontation directly eliminates its recorded Culprit through shared elimination lifecycle", () => {
  const state = setup("hisui-round11");
  state.round = 11;
  state.phase = "action";
  state.activePlayerId = "h";
  addConfrontation(state, "confront-b", "b");
  const result = useHisuiDetective(ctx(state, HISUI_CONFRONTATION_ID, { abilityId: HISUI_CONFRONT_ABILITY }));
  assert.equal(result.culpritPlayerId, "b");
  assert.equal(result.eliminated, true);
  assert.equal(state.players.b.eliminated, true);
});

test("Deduction Mode transforms a Clue, removes a discarded Break Bounded Field, and restores one Locked-Room Mystery use", () => {
  const state = setup("hisui-ascension");
  state.board.eventDeck = [];
  state.board.eventDiscard = ["event.fuyuki.18"];
  state.players.h.flags.hisuiLockedRoomUsesRemaining = 0;
  addClue(state, "clue-b", "b");
  const result = useHisuiDetective(ctx(state, HISUI_ASCENSION_ID, {
    eventType: "skill.unlocked", event: { playerId: "h", skillId: HISUI_ASCENSION_ID },
  }));
  assert.equal(result.transformedInstanceId, "clue-b");
  assert.equal(result.removedEventId, "event.fuyuki.18");
  assert.equal(result.regainedUse, true);
  assert.equal(state.cards["clue-b"].definitionId, `card.skill.${HISUI_CONFRONTATION_ID}`);
  assert.deepEqual(state.board.eventDiscard, []);
  assert.deepEqual(state.board.eventRemoved, ["event.fuyuki.18"]);
  assert.equal(state.players.h.flags.hisuiLockedRoomUsesRemaining, 1);
});
