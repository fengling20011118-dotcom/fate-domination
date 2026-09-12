import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, removeCardsScheduledAfterCombat } from "../src/rules-core/decks.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { executeStructuredGrantedCardAbility } from "../src/rules-core/card-transforms.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  SIGURD_BOLVERK_ID,
  SIGURD_GRAM_II_ID,
  SIGURD_RIDILL_ID,
  resolveSigurdGramII,
  useSigurdBolverkGram,
  useSigurdGramII,
} from "../src/rules-core/sigurd.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const basic4 = { id: "card.test.sigurd-basic4", name: "力量4", cardType: "attack", cost: 2, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true };
const opp3 = { id: "card.test.sigurd-opp3", name: "对手3费", cardType: "attack", cost: 3, basePower: 3, typeLabel: "迅捷", attributes: ["迅捷"], basic: true };
const opp7 = { id: "card.test.sigurd-opp7", name: "对手7费", cardType: "attack", cost: 7, basePower: 5, typeLabel: "魔术", attributes: ["魔术"], basic: true };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [basic4.id]: basic4, [opp3.id]: opp3, [opp7.id]: opp7 };

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function makeState(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "s", name: "Sigurd" }, { id: "o", name: "Opponent" }, { id: "x", name: "Other" }], seed: 173 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.players.s.servantId = "servant.sigurd";
  state.players.s.mana = 20;
  state.players.s.victoryPoints = 10;
  for (const id of ["o", "x"]) state.players[id].mana = 20;
  putAt(state, "s", "mountain");
  putAt(state, "o", "mountain");
  putAt(state, "x", "city");
  return state;
}

function addCard(state, playerId, instanceId, definitionId, zone, face = "down", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}

function ctx(state, skillId, payload, openDecision = () => {}) {
  return { state, player: state.players.s, skill: built.skills.get(skillId), payload, definitions, openDecision, randomInt: () => 0, emitEvent: () => {} };
}

function event(eventId, type, payload) {
  return { eventId, type, revision: 1, sourceCommandId: "test", payload };
}

test("齐格鲁德技能包3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.sigurd");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("两张Gram明置时每回合开始各失1战果，暗置时不触发", () => {
  const state = makeState("sigurd-cursed");
  addCard(state, "s", "gram", SIGURD_GRAM_II_ID, "servant-skills", "up", false);
  addCard(state, "s", "bolverk", SIGURD_BOLVERK_ID, "servant-skills", "up", false);
  useSigurdGramII(ctx(state, SIGURD_GRAM_II_ID, { eventType: "round.started", event: { round: 4 } }));
  useSigurdBolverkGram(ctx(state, SIGURD_BOLVERK_ID, { eventType: "round.started", event: { round: 4 } }));
  assert.equal(state.players.s.victoryPoints, 8);
  state.cards.gram.face = "down";
  state.cards.bolverk.face = "down";
  useSigurdGramII(ctx(state, SIGURD_GRAM_II_ID, { eventType: "round.started", event: { round: 5 } }));
  useSigurdBolverkGram(ctx(state, SIGURD_BOLVERK_ID, { eventType: "round.started", event: { round: 5 } }));
  assert.equal(state.players.s.victoryPoints, 8);
});

test("Ridill & Hrotti随已展示Bölverk/Gram II分别获得迅捷与魔术", () => {
  const state = makeState("sigurd-ridill-types");
  addCard(state, "s", "gram", SIGURD_GRAM_II_ID, "servant-skills", "up", false);
  addCard(state, "s", "bolverk", SIGURD_BOLVERK_ID, "servant-skills", "up", false);
  addCard(state, "s", "ridill", SIGURD_RIDILL_ID, "attack", "up", true);
  useSigurdGramII(ctx(state, SIGURD_GRAM_II_ID, { eventType: "servant.true-name-revealed", event: { playerId: "s" } }));
  useSigurdBolverkGram(ctx(state, SIGURD_BOLVERK_ID, { eventType: "servant.true-name-revealed", event: { playerId: "s" } }));
  const attrs = getCardInstanceAttributes(state.cards.ridill, definitions[state.cards.ridill.definitionId], state, definitions);
  assert.ok(attrs.includes("力量"));
  assert.ok(attrs.includes("迅捷"));
  assert.ok(attrs.includes("魔术"));
});

test("Bölverk把剑刃风暴授予基础攻击：付2魔力、基本威力翻倍并在Combat结束移除", () => {
  const state = makeState("sigurd-blade-storm");
  addCard(state, "s", "bolverk", SIGURD_BOLVERK_ID, "servant-skills", "up", false);
  addCard(state, "s", "basic", basic4.id, "attack", "up", true);
  executeStructuredGrantedCardAbility(state, "s", "basic", "sigurd-blade-storm", definitions);
  assert.equal(state.players.s.mana, 18);
  assert.equal(state.cards.basic.basePowerMultiplier, 2);
  assert.equal(state.cards.basic.removeAfterCombatRound, 4);
  const removed = removeCardsScheduledAfterCombat(state);
  assert.deepEqual(removed, ["basic"]);
  assert.equal(state.cards.basic.zone, "removed");
});

test("Gram II仅从本回合同战斗对手实际打出的攻击取返魔候选；单候选自动返还", () => {
  const state = makeState("sigurd-gram-single");
  addCard(state, "s", "gram", SIGURD_GRAM_II_ID, "attack", "up", true);
  addCard(state, "o", "opp", opp7.id, "attack", "up", true);
  addCard(state, "x", "other", opp7.id, "attack", "up", true);
  state.cards.opp.playedRound = 4;
  state.cards.other.playedRound = 4;
  state.cards.opp.paidCost = 7;
  state.cards.other.paidCost = 7;
  state.eventLog.push(
    event("play-o", "card.played", { playerId: "o", instanceId: "opp", definitionId: opp7.id, paidMana: 7 }),
    event("play-x", "card.played", { playerId: "x", instanceId: "other", definitionId: opp7.id, paidMana: 7 }),
    event("combat-m", "combat.resolved", { round: 4, locationId: "mountain", participantIds: ["s", "o"], winnerIds: ["o"] }),
  );
  state.players.s.mana = 5;
  const result = useSigurdGramII(ctx(state, SIGURD_GRAM_II_ID, { eventType: "combat.ending", event: { round: 4 } }));
  assert.equal(result.gainedMana, 7);
  assert.equal(state.players.s.mana, 12);
  assert.equal(result.selected.playerId, "o");
});

test("Gram II有多张候选时只选择其中一张返魔，不合计", () => {
  const state = makeState("sigurd-gram-choice");
  addCard(state, "s", "gram", SIGURD_GRAM_II_ID, "attack", "up", true);
  addCard(state, "o", "opp3", opp3.id, "discard", "down", false);
  addCard(state, "o", "opp7", opp7.id, "attack", "up", true);
  state.cards.opp3.playedRound = 4;
  state.cards.opp7.playedRound = 4;
  state.eventLog.push(
    event("play3", "card.played", { playerId: "o", instanceId: "opp3", definitionId: opp3.id, paidMana: 3 }),
    event("play7", "card.played", { playerId: "o", instanceId: "opp7", definitionId: opp7.id, paidMana: 7 }),
    event("combat-m", "combat.resolved", { round: 4, locationId: "mountain", participantIds: ["s", "o"], winnerIds: ["o"] }),
  );
  let opened;
  state.players.s.mana = 5;
  const pending = useSigurdGramII(ctx(state, SIGURD_GRAM_II_ID, { eventType: "combat.ending", event: { round: 4 } }, (decision) => { opened = decision; }));
  assert.equal(pending.pending, true);
  assert.equal(opened.options.length, 2);
  const result = resolveSigurdGramII(ctx(state, SIGURD_GRAM_II_ID, {
    previous: { candidates: [
      { optionId: "play3", playerId: "o", instanceId: "opp3", definitionId: opp3.id, manaCost: 3 },
      { optionId: "play7", playerId: "o", instanceId: "opp7", definitionId: opp7.id, manaCost: 7 },
    ] },
    decision: { status: "resolved", selections: ["play7"] },
  }));
  assert.equal(result.gainedMana, 7);
  assert.equal(state.players.s.mana, 12);
});
