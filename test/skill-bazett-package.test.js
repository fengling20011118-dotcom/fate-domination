import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { cardHasResidualGrant, cardIgnoresUsageLimit } from "../src/rules-core/card-rule-modifiers.ts";
import { applyClimaxElimination } from "../src/rules-core/rounds.ts";
import {
  registerCoreSkillHandlers,
  useBazettFlawlessDefense,
  useBazettFragarach,
  useBazettTimeLoop,
} from "../src/rules-core/skill-handlers.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const TIME_LOST = "master.bazett.skill.s1a";
const DAY_TWO = "master.bazett.skill.s1c";
const DAY_FOUR = "master.bazett.skill.s1d";
const FRAGARACH = "master.bazett.skill.s2";
const AWAKE = "master.bazett.skill.s4";
const ASCENSION = "master.bazett.skill.ascension";

function stateOf(id, players = [{ id: "b", name: "Bazett" }, { id: "o", name: "Opponent" }]) {
  const state = createGameState({ gameInstanceId: id, players, seed: 1717 });
  state.status = "playing";
  state.round = 1;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "b";
  state.players.b.masterId = "master.bazett";
  state.players.b.mana = 10;
  state.players.b.commandSeals = 3;
  return state;
}

function addOwned(state, instanceId, definitionId, zone = "master-skills", active = false) {
  createOwnedCardInstance(state, "b", { instanceId, definitionId, zone, face: "up", active });
  return state.cards[instanceId];
}

function useTimeLoop(state, eventType, event = {}) {
  return useBazettTimeLoop({
    state,
    player: state.players.b,
    skill: built.skills.get(TIME_LOST),
    payload: { eventType, event },
    definitions,
    openDecision: () => {},
  });
}

test("Bazett 技能包 10/10 FULL，Day 2/Day 4/升华均绑定可执行 handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.bazett");
  assert.equal(skills.length, 10);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(DAY_TWO).handlerId, "core.bazett-time-loop");
  assert.equal(built.skills.get(DAY_FOUR).handlerId, "core.bazett-time-loop");
  assert.equal(built.skills.get(ASCENSION).handlerId, "core.bazett-flawless-defense");
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("第二天只豁免 Fragarach 的8魔力门槛/每局一次，不会把印刷1魔力费用改成0", () => {
  const state = stateOf("bazett-day-two");
  const fragarach = addOwned(state, "fragarach", FRAGARACH);
  state.players.b.mana = 1;
  fragarach.usedGameCount = 1;
  useTimeLoop(state, "game.started");
  state.round = 2;
  useTimeLoop(state, "round.started");
  assert.equal(state.players.b.flags.bazettDay, 2);
  assert.equal(cardIgnoresUsageLimit(state, state.players.b, fragarach), true);
  assert.equal(getCardPlayCost(state, definitions[FRAGARACH], state.players.b, fragarach, definitions), 1);
  assert.doesNotThrow(() => assertCardCanEnterAttack({
    state,
    playerId: "b",
    instanceId: "fragarach",
    definitions,
    faceDown: false,
  }));

  const before = state.players.b.victoryPoints;
  useTimeLoop(state, "combat.resolved", { winnerIds: ["b"], powers: { b: 8, o: 2 } });
  assert.equal(state.players.b.victoryPoints, before + 2);
});

test("第四天获胜立即觉醒并恢复3令咒、返还 Fragarach，未获胜则在回合末排定 Reset", () => {
  const winState = stateOf("bazett-day-four-win");
  winState.players.b.flags.bazettTimeLost = true;
  winState.players.b.flags.bazettDay = 4;
  winState.players.b.commandSeals = 0;
  const fragarach = addOwned(winState, "fragarach", FRAGARACH, "discard");
  useTimeLoop(winState, "combat.resolved", { winnerIds: ["b"], powers: { b: 9, o: 3 } });
  assert.equal(winState.players.b.flags.bazettAwakened, true);
  assert.equal(winState.players.b.commandSeals, 3);
  assert.equal(frgarachZone(winState), "master-skills");

  const loseState = stateOf("bazett-day-four-reset");
  loseState.players.b.flags.bazettTimeLost = true;
  loseState.players.b.flags.bazettDay = 4;
  useTimeLoop(loseState, "round.ending", { round: loseState.round });
  assert.equal(loseState.players.b.flags.bazettRestartPending, true);
  loseState.round += 1;
  const before = loseState.players.b.victoryPoints;
  useTimeLoop(loseState, "round.started", { round: loseState.round });
  assert.equal(loseState.players.b.flags.bazettDay, 1);
  assert.equal(loseState.players.b.flags.bazettRestartPending, false);
  assert.equal(loseState.players.b.victoryPoints, before + 1);
});

function frgarachZone(state) {
  return state.cards.fragarach?.zone;
}

test("高潮回合未觉醒只由时间迷失扣5战果一次，淘汰检查不再重复扣除", () => {
  const state = stateOf("bazett-climax-once", [{ id: "b", name: "Bazett" }]);
  state.round = 8;
  state.players.b.flags.bazettTimeLost = true;
  state.players.b.victoryPoints = 10;
  state.modeState.currentSituationClimax = true;
  useTimeLoop(state, "round.ending", { round: 8 });
  assert.equal(state.players.b.victoryPoints, 5);
  applyClimaxElimination(state, definitions);
  assert.equal(state.players.b.victoryPoints, 5);
});

test("无懈可击令 Fragarach 永久忽略每局一次并保持激活；Ultimate Counter 后立即关闭", () => {
  const state = stateOf("bazett-asc-counter");
  const ascension = addOwned(state, "asc", ASCENSION);
  const fragarach = addOwned(state, "fragarach", FRAGARACH);
  useBazettFlawlessDefense({
    state,
    player: state.players.b,
    skill: built.skills.get(ASCENSION),
    payload: { eventType: "skill.unlocked", event: { playerId: "b", skillId: ASCENSION } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(ascension.zone, "master-skills");
  assert.equal(cardIgnoresUsageLimit(state, state.players.b, fragarach), true);
  assert.equal(cardHasResidualGrant(state, state.players.b, fragarach), true);

  movePlayerCard(state, "b", "fragarach", "attack");
  fragarach.face = "up";
  fragarach.active = true;
  fragarach.residual = true;
  useBazettFragarach({
    state,
    player: state.players.b,
    skill: built.skills.get(FRAGARACH),
    payload: { eventType: "card.played", event: { playerId: "b", definitionId: FRAGARACH } },
    definitions,
    openDecision: () => {},
  });
  useBazettFragarach({
    state,
    player: state.players.b,
    skill: built.skills.get(FRAGARACH),
    payload: { eventType: "card.used", event: { playerId: "o", attributes: ["宝具"] } },
    definitions,
    emitEvent: () => {},
    openDecision: () => {},
  });
  assert.equal(state.players.o.defeated, true);
  assert.equal(frgarachZone(state), "master-skills");
  assert.equal(fragarach.active, false);
});

test("无懈可击的 Permanent Fragarach 也会在 Reset 时关闭", () => {
  const state = stateOf("bazett-asc-reset");
  addOwned(state, "asc", ASCENSION);
  const fragarach = addOwned(state, "fragarach", FRAGARACH);
  useBazettFlawlessDefense({
    state,
    player: state.players.b,
    skill: built.skills.get(ASCENSION),
    payload: { eventType: "skill.unlocked", event: { playerId: "b", skillId: ASCENSION } },
    definitions,
    openDecision: () => {},
  });
  movePlayerCard(state, "b", "fragarach", "attack");
  fragarach.face = "up";
  fragarach.active = true;
  fragarach.residual = true;
  state.players.b.flags.bazettTimeLost = true;
  state.players.b.flags.bazettRestartPending = true;
  state.players.b.flags.bazettDay = 4;
  state.round = 5;
  useTimeLoop(state, "round.started", { round: 5 });
  assert.equal(frgarachZone(state), "master-skills");
  assert.equal(fragarach.active, false);
  assert.equal(state.players.b.flags.bazettDay, 1);
});
