import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CardAbilityRegistry } from "../src/rules-core/card-abilities.ts";
import { registerBasicCardAbilities } from "../src/rules-core/basic-card-abilities.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { hasClimaxEliminationPrevention } from "../src/rules-core/elimination-prevention.ts";
import { peekForcedExtraRound, queueForcedExtraRound } from "../src/rules-core/extra-round.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import {
  HEAVENS_FEEL_SITUATION_ID,
  LAKSHMI_HANDLER,
  LAKSHMI_NAHI_ID,
  LAKSHMI_RESISTANCE_ID,
  resolveLakshmiDecision,
  useLakshmiPackage,
} from "../src/rules-core/lakshmibai.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
function skill(id) { return built.skills.get(id); }

function setup(id = "lakshmi") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "l", name: "Lakshmi" }, { id: "o", name: "Opponent" }, { id: "x", name: "Third" }],
    seed: 2341,
  });
  state.status = "playing";
  state.round = 7;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "o";
  state.turnOrder = ["l", "o", "x"];
  state.players.l.masterId = "master.rin";
  state.players.l.servantId = "servant.lakshmibai";
  state.players.l.locationId = "mountain";
  state.players.l.mana = 20;
  state.players.l.victoryPoints = 4;
  state.players.l.flags.deploymentBonusActive = true;
  state.players.l.flags.deploymentLocationId = "mountain";
  state.players.l.flags.deploymentBonus = 2;
  state.players.o.masterId = "master.kirei";
  state.players.o.servantId = "servant.cu";
  state.players.o.locationId = "mountain";
  state.players.o.victoryPoints = 7;
  state.players.x.masterId = "master.waver";
  state.players.x.servantId = "servant.emiya";
  state.players.x.locationId = "city";
  state.players.x.victoryPoints = 5;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["l", "o"];
  state.board.locations.city = ["x"];
  state.board.locations.scouting = [];
  return state;
}

function add(state, playerId, instanceId, definitionId, zone = "hand", options = {}) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face: zone === "attack" || zone.endsWith("skills") ? "up" : "down",
    active: zone === "attack",
    residual: false,
    ...options,
  });
}

function context(state, skillDefinition, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.l,
    skill: skillDefinition,
    payload,
    definitions,
    randomInt: () => 0,
    openDecision() {},
    ...extra,
  };
}

function popPrevious(state, stage) {
  const frame = state.effectQueue.find((entry) => entry.handlerId === "core.lakshmibai-package-resolve" && entry.payload?.stage === stage);
  assert.ok(frame, `missing ${stage}`);
  state.effectQueue = state.effectQueue.filter((entry) => entry !== frame);
  return frame.payload;
}

function command(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

test("Lakshmibai package is 4/4 FULL; Misfortune is a deck card shadow with complete card lifecycle metadata", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "servant.lakshmibai");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.equal(skill(LAKSHMI_RESISTANCE_ID).handlerId, LAKSHMI_HANDLER);
  assert.equal(skill(LAKSHMI_NAHI_ID).handlerId, LAKSHMI_HANDLER);
  assert.equal(skill("servant.lakshmibai.skill.sc-lakshmibai-4").handlerId, LAKSHMI_HANDLER);
  assert.equal(skill("servant.lakshmibai.skill.sc-lakshmibai-4").initiallyOwned, false);
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.equal(built.cards["card.x-misfortune"].drawOnPlay, 1);
  assert.equal(built.cards["card.x-misfortune"].returnToDeckOnDefeat, true);
  assert.deepEqual(built.cards["card.x-misfortune"].cardAbilityIds, ["misfortune-battle-loss"]);
});

test("Queen of Resistance compares pre-reward VP, installs round elimination prevention, and queues one Heaven's Feel final round", () => {
  const state = setup("lakshmi-resistance");
  state.round = 11;
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  state.board.situationDeck = [];
  state.players.l.victoryPoints = 6;
  state.players.o.victoryPoints = 9;
  const result = useLakshmiPackage(context(state, skill(LAKSHMI_RESISTANCE_ID), {
    eventType: "combat.resolved",
    event: {
      round: 11,
      locationId: "mountain",
      participantIds: ["l", "o"],
      winnerIds: ["l"],
      participantVictoryPointsBeforeCombat: { l: 2, o: 8 },
    },
  }));
  assert.equal(result.eliminationProtected, true);
  assert.equal(result.extraRoundQueued, true);
  assert.equal(hasClimaxEliminationPrevention(state, "l"), true);
  assert.equal(peekForcedExtraRound(state).situationId, HEAVENS_FEEL_SITUATION_ID);
});

test("forced-extra-round boundary makes EndRound start Heaven's Feel instead of ending the game", () => {
  const situations = [
    { id: "situation.normal", name: "Normal", mana: 0 },
    { id: HEAVENS_FEEL_SITUATION_ID, name: "Heaven's Feel", mana: 0, climax: true },
  ];
  const events = [
    { id: "event.1", name: "E1", victoryPoints: 1 },
    { id: "event.2", name: "E2", victoryPoints: 1 },
    { id: "event.3", name: "E3", victoryPoints: 1 },
    { id: "event.4", name: "E4", victoryPoints: 1 },
  ];
  const state = createGameState({ gameInstanceId: "forced-extra-round", players: [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }], seed: 55 });
  state.status = "playing";
  state.round = 11;
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  state.turnOrder = ["p1", "p2"];
  state.board.activeSituations = ["situation.normal"];
  state.board.situationDeck = [];
  state.board.situationDiscard = [];
  state.board.eventDeck = events.map((event) => event.id);
  state.board.eventDiscard = [];
  state.board.currentEvents = { mountain: [], city: [] };
  state.modeState.resolvedCombats = ["mountain", "city"];
  state.modeState.combatWinnerIdsByLocation = { mountain: [], city: [] };
  queueForcedExtraRound(state, "test-source", HEAVENS_FEEL_SITUATION_ID);
  const engine = new StandardMatchEngine({ cards: {}, situations, events, playerDecks: { p1: [], p2: [] } });
  const result = engine.execute(state, command(state, "end-forced", CommandType.EndRound, "host"));
  assert.equal(result.state.status, "playing");
  assert.equal(result.state.round, 12);
  assert.deepEqual(result.state.board.activeSituations, [HEAVENS_FEEL_SITUATION_ID]);
  assert.equal(result.state.modeState.activeForcedExtraRound.sourceId, "test-source");
  assert.equal(result.state.modeState.activeForcedExtraRound.round, 12);
});

test("Nahi Doongi may play a hand Action card outside normal timing, halves its base power, and immediately uses its Action", () => {
  const state = setup("lakshmi-nahi-hand");
  add(state, "l", "nahi", LAKSHMI_NAHI_ID, "servant-skills");
  add(state, "l", "prep", "card.cardpreparation", "hand");
  const registry = new CardAbilityRegistry();
  registerBasicCardAbilities(registry);
  const executeCardAbility = (instanceId, abilityId, target, options = {}) => registry.execute(abilityId, {
    state,
    playerId: "l",
    instanceId,
    target,
    definitions,
    effectTimingOverride: options.timingOverride === true,
  });
  let decision;
  const pending = useLakshmiPackage(context(state, skill(LAKSHMI_NAHI_ID), {
    eventType: "player.entered-location",
    event: { playerId: "o", previousLocationId: "city", locationId: "mountain" },
  }, { openDecision(value) { decision = value; }, executeCardAbility }));
  assert.equal(pending.pending, true);
  assert.equal(decision.kind, "lakshmi-nahi-play");
  assert.ok(decision.options.some((option) => option.id === "prep"));
  const previous = popPrevious(state, "nahi-play");
  const result = resolveLakshmiDecision(context(state, skill(LAKSHMI_NAHI_ID), {
    previous,
    decision: { status: "resolved", selections: ["prep"] },
  }, { executeCardAbility }));
  assert.equal(result.playedInstanceId, "prep");
  assert.equal(state.cards.prep.zone, "attack");
  assert.equal(result.halvedBasePower, 1);
  assert.equal(state.players.l.flags.deploymentBonus, 4);
  assert.equal(calculateCombatCardPower(state, state.players.l, "prep", definitions, "mountain"), 1);
});

test("Nahi Doongi can play itself, reveal true name, halve its base power and then move an opponent one adjacent space", () => {
  const state = setup("lakshmi-nahi-self");
  const nahi = add(state, "l", "nahi", LAKSHMI_NAHI_ID, "servant-skills");
  let firstDecision;
  useLakshmiPackage(context(state, skill(LAKSHMI_NAHI_ID), {
    eventType: "player.entered-location",
    event: { playerId: "o", previousLocationId: "city", locationId: "mountain" },
  }, { openDecision(value) { firstDecision = value; } }));
  assert.ok(firstDecision.options.some((option) => option.id === "nahi"));
  const firstPrevious = popPrevious(state, "nahi-play");
  let moveDecision;
  const played = resolveLakshmiDecision(context(state, skill(LAKSHMI_NAHI_ID), {
    previous: firstPrevious,
    decision: { status: "resolved", selections: ["nahi"] },
  }, { openDecision(value) { moveDecision = value; } }));
  assert.equal(played.playedInstanceId, "nahi");
  assert.equal(nahi.zone, "attack");
  assert.equal(state.players.l.trueNameRevealed, true);
  assert.equal(played.halvedBasePower, Math.ceil(definitions[LAKSHMI_NAHI_ID].basePower / 2));
  assert.equal(moveDecision.kind, "lakshmi-nahi-move");
  const option = moveDecision.options.find((candidate) => candidate.id.startsWith("o::"));
  assert.ok(option);
  const movePrevious = popPrevious(state, "nahi-move");
  const moved = resolveLakshmiDecision(context(state, skill(LAKSHMI_NAHI_ID), {
    previous: movePrevious,
    decision: { status: "resolved", selections: [option.id] },
  }));
  assert.equal(moved.movedOpponentId, "o");
  assert.notEqual(state.players.o.locationId, "mountain");
});
