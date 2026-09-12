import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance, lendActiveSkillToPlayer } from "../src/rules-core/decks.ts";
import { applyClimaxElimination } from "../src/rules-core/rounds.ts";
import { getStructuredMovementCost } from "../src/rules-core/rule-modifiers.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  ODYSSEUS_AIGIS_ID,
  ODYSSEUS_TROIA_ID,
  resolveOdysseusAigis,
  resolveOdysseusTroiaHippos,
  useOdysseusAigis,
  useOdysseusTroiaHippos,
} from "../src/rules-core/odysseus.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const troiaSkill = built.skills.get(ODYSSEUS_TROIA_ID);
const aigisSkill = built.skills.get(ODYSSEUS_AIGIS_ID);

function fresh(id = "odysseus") {
  const state = createGameState({
    gameInstanceId: id,
    players: [
      { id: "o", name: "Odysseus" },
      { id: "t", name: "Target" },
      { id: "x", name: "Third" },
    ],
    seed: 777,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "o";
  state.players.o.servantId = "servant.odysseus";
  state.players.o.mana = 10;
  state.players.t.mana = 10;
  state.players.x.mana = 10;
  return state;
}

function putPlayer(state, playerId, locationId) {
  for (const occupants of Object.values(state.board.locations)) {
    const index = occupants.indexOf(playerId);
    if (index >= 0) occupants.splice(index, 1);
  }
  state.board.locations[locationId].push(playerId);
  state.players[playerId].locationId = locationId;
}

function createActiveSkill(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "o", {
    instanceId,
    definitionId,
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
  });
  return state.cards[instanceId];
}

test("Odysseus package is 3/3 FULL and both complex cards have executable handlers", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.odysseus");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(troiaSkill.handlerId, "core.odysseus-troia-hippos");
  assert.equal(aigisSkill.handlerId, "core.odysseus-aigis");
});

test("Troia Hippos cannot be played without another player at the same location", () => {
  const state = fresh("troia-prerequisite");
  putPlayer(state, "o", "city");
  putPlayer(state, "t", "mountain");
  putPlayer(state, "x", "workshop");
  createOwnedCardInstance(state, "o", {
    instanceId: "o:troia",
    definitionId: ODYSSEUS_TROIA_ID,
    zone: "servant-skills",
    face: "up",
    active: false,
  });
  assert.throws(() => assertCardCanEnterAttack({
    state,
    playerId: "o",
    instanceId: "o:troia",
    definitions,
    faceDown: false,
  }), /CARD_REQUIRES_OTHER_PLAYER_SAME_LOCATION/);

  putPlayer(state, "t", "city");
  assert.doesNotThrow(() => assertCardCanEnterAttack({
    state,
    playerId: "o",
    instanceId: "o:troia",
    definitions,
    faceDown: false,
  }));
});

test("Troia Hippos is lent physically, buffs its controller's Special attacks, steals 1 VP, then recalls next-round on same combat and closes to owner's skill zone", () => {
  const state = fresh("troia-lifecycle");
  putPlayer(state, "o", "city");
  putPlayer(state, "t", "city");
  putPlayer(state, "x", "workshop");
  const troia = createActiveSkill(state, "o:troia", ODYSSEUS_TROIA_ID);
  troia.playedRound = state.round;
  troia.paidCost = 3;
  createOwnedCardInstance(state, "t", {
    instanceId: "t:luck",
    definitionId: "card.cardluck",
    zone: "attack",
    face: "up",
    active: true,
  });

  let opened;
  useOdysseusTroiaHippos({
    state,
    player: state.players.o,
    skill: troiaSkill,
    payload: { eventType: "card.played", event: { playerId: "o", instanceId: "o:troia", definitionId: ODYSSEUS_TROIA_ID, face: "up" } },
    definitions,
    openDecision: (decision) => { opened = decision; },
  });
  assert.ok(opened);
  const frame = state.effectQueue.shift();
  resolveOdysseusTroiaHippos({
    state,
    player: state.players.o,
    skill: troiaSkill,
    payload: { previous: frame.payload, decision: { status: "resolved", selections: ["t"] } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(troia.ownerPlayerId, "o");
  assert.equal(troia.controllerPlayerId, "t");
  assert.ok(state.players.t.attack.includes("o:troia"));
  assert.equal(troia.returnToOwnerSkillZoneOnClose, "servant-skills");
  assert.equal(troia.removeWithControllerOnElimination, true);

  state.phase = "combat";
  const luckWithoutTroia = 4;
  assert.equal(calculateCombatCardPower(state, state.players.t, "t:luck", definitions, "city"), luckWithoutTroia + 3);

  state.players.t.victoryPoints = 4;
  state.players.o.victoryPoints = 2;
  useOdysseusTroiaHippos({
    state,
    player: state.players.o,
    skill: troiaSkill,
    payload: { eventType: "round.ending", event: { round: state.round } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(state.players.t.victoryPoints, 3);
  assert.equal(state.players.o.victoryPoints, 3);
  assert.equal(troia.controllerPlayerId, "t", "played-round combat does not recall Troia");

  state.round += 1;
  putPlayer(state, "o", "city");
  putPlayer(state, "t", "city");
  useOdysseusTroiaHippos({
    state,
    player: state.players.o,
    skill: troiaSkill,
    payload: { eventType: "combat.resolved", event: { locationId: "city", powers: { o: 7, t: 6 }, winnerIds: ["o"] } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(troia.controllerPlayerId, "o");
  assert.ok(state.players.o.attack.includes("o:troia"));
  assert.equal(troia.removeWithControllerOnElimination, undefined);

  useOdysseusTroiaHippos({
    state,
    player: state.players.o,
    skill: troiaSkill,
    payload: { eventType: "round.ending", event: { round: state.round } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(troia.zone, "servant-skills");
  assert.equal(troia.active, false);
  assert.equal(troia.controllerPlayerId, "o");
  assert.ok(state.players.o.servantSkills.includes("o:troia"));
});

test("a lent skill marked to leave with its controller is removed by climax elimination", () => {
  const state = fresh("troia-elimination");
  state.round = 10;
  state.players.o.victoryPoints = 10;
  state.players.t.victoryPoints = 0;
  state.players.x.victoryPoints = 8;
  const troia = createActiveSkill(state, "o:troia", ODYSSEUS_TROIA_ID);
  lendActiveSkillToPlayer(state, "o", "t", troia.instanceId, definitions, { removeWithControllerOnElimination: true });
  const eliminated = applyClimaxElimination(state, definitions);
  assert.deepEqual(eliminated, ["t"]);
  assert.equal(state.players.t.eliminated, true);
  assert.equal(troia.zone, "removed");
  assert.equal(troia.controllerPlayerId, "o");
});

test("Aigis moves backward for free, lets an affordable player pay 4 to stay with -5, penalizes impossible movers, and adds +2 normal movement cost per space", () => {
  const state = fresh("aigis");
  putPlayer(state, "o", "city");
  putPlayer(state, "t", "scouting");
  putPlayer(state, "x", "workshop");
  state.players.o.mana = 0;
  state.players.t.mana = 4;
  state.players.x.mana = 0;
  createActiveSkill(state, "o:aigis", ODYSSEUS_AIGIS_ID);

  let opened;
  const events = [];
  const first = useOdysseusAigis({
    state,
    player: state.players.o,
    skill: aigisSkill,
    payload: { abilityId: "aigis-retreat" },
    definitions,
    openDecision: (decision) => { opened = decision; },
    emitEvent: (type, payload) => events.push({ type, payload }),
  });
  assert.equal(first.completed, false);
  assert.equal(state.players.o.locationId, "mountain", "forced Aigis movement costs no normal movement mana");
  assert.equal(state.players.o.mana, 0);
  assert.deepEqual(opened.chooserPlayerIds, ["t"]);
  assert.equal(getStructuredMovementCost(state, "o", definitions, 5, { method: "regular", fromLocationId: "workshop", toLocationId: "scouting" }), 11);
  assert.equal(getStructuredMovementCost(state, "o", definitions, 0, { method: "effect", fromLocationId: "city", toLocationId: "mountain" }), 0);

  const frame = state.effectQueue.shift();
  const resolved = resolveOdysseusAigis({
    state,
    player: state.players.o,
    skill: aigisSkill,
    payload: { previous: frame.payload, decision: { status: "resolved", selections: ["pay"] } },
    definitions,
    openDecision: () => {},
    emitEvent: (type, payload) => events.push({ type, payload }),
  });
  assert.equal(resolved.completed, true);
  assert.equal(state.players.t.locationId, "scouting");
  assert.equal(state.players.t.mana, 0);
  assert.equal(state.players.t.flags.roundPowerBonus, -5);
  assert.equal(state.players.x.locationId, "workshop");
  assert.equal(state.players.x.flags.roundPowerBonus, -5, "Workshop has no backward arrow destination");
  assert.ok(events.some((event) => event.type === "player.moved" && event.payload.playerId === "o"));
});
