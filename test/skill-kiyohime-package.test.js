import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { isSourceBoundMovementBlocked, playerSkipsOutpostDeployment } from "../src/rules-core/board.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import {
  KIYOHIME_KISS_ID, KIYOHIME_LIES_ID, KIYOHIME_SAMADHI_ID,
  useKiyohimeFlameColoredKiss, useKiyohimeNoMoreLies, resolveKiyohimeNoMoreLies,
  useKiyohimeSamadhi, resolveKiyohimeSamadhi,
} from "../src/rules-core/kiyohime.ts";

function setup(id = "kiyohime") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "k", name: "Kiyohime" }, { id: "o", name: "Opponent" }], seed: 2610 });
  state.status = "playing"; state.round = 4; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "k"; state.turnOrder = ["k", "o"];
  state.players.k.servantId = "servant.kiyohime"; state.players.k.locationId = "mountain"; state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["k", "o"]; state.board.locations.city = []; state.board.locations.workshop = []; state.board.locations.scouting = [];
  state.players.k.mana = 20; state.players.o.mana = 20; state.players.k.commandSeals = 3; state.players.o.commandSeals = 3;
  return { built, definitions, engine, state };
}

function addSkill(state, id, definitionId, zone = "servant-skills", active = false) {
  createOwnedCardInstance(state, "k", { instanceId: id, definitionId, zone, face: "up", active });
}

const noDecision = () => { throw new Error("UNEXPECTED_DECISION"); };

test("清姬整包 3/3 FULL 且 handler 已注册", () => {
  const { built } = setup("kiyo-full");
  for (const id of [KIYOHIME_KISS_ID, KIYOHIME_LIES_ID, KIYOHIME_SAMADHI_ID]) {
    assert.equal(built.skills.get(id).supportLevel, "FULL");
    assert.equal(built.skills.hasHandler(id), true);
  }
});

test("炽热抱拥使本回合魔术攻击 +3 并获得力量；下回合工房强制和移动锁随来源移除而失效", () => {
  const { definitions, state } = setup("kiyo-kiss");
  addSkill(state, "kiss", KIYOHIME_KISS_ID);
  createOwnedCardInstance(state, "k", { instanceId: "magic", definitionId: "card.carda1", zone: "attack", face: "up", active: true });
  const before = calculateCombatCardPower(state, state.players.k, "magic", definitions, "mountain");
  useKiyohimeFlameColoredKiss({ state, player: state.players.k, skill: definitions[KIYOHIME_KISS_ID], payload: { abilityId: "fiery-embrace" }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.equal(calculateCombatCardPower(state, state.players.k, "magic", definitions, "mountain"), before + 3);
  assert.equal(getCardInstanceAttributes(state.cards.magic, definitions[state.cards.magic.definitionId], state, definitions).includes("力量"), true);
  state.round = 5;
  assert.equal(isSourceBoundMovementBlocked(state, "k"), true);
  assert.equal(playerSkipsOutpostDeployment(state, "k"), false);
  movePlayerCard(state, "k", "kiss", "removed");
  assert.equal(isSourceBoundMovementBlocked(state, "k"), false);
  assert.equal(playerSkipsOutpostDeployment(state, "k"), false);
});

test("不再有谎言按真实战斗胜负判定答案；答错失1令咒且清姬+2VP，令咒损失不算使用", () => {
  const { definitions, state } = setup("kiyo-lies");
  addSkill(state, "lies", KIYOHIME_LIES_ID);
  const opened = [];
  useKiyohimeNoMoreLies({ state, player: state.players.k, skill: definitions[KIYOHIME_LIES_ID], payload: { abilityId: "ask-lie" }, definitions, openDecision: (d) => opened.push(d), randomInt: () => 0 });
  const targetDecision = opened.pop();
  resolveKiyohimeNoMoreLies({ state, player: state.players.k, skill: definitions[KIYOHIME_LIES_ID], payload: { previous: { stage: "lies-target", candidates: ["o"] }, decision: { status: "resolved", selections: ["o"] } }, definitions, openDecision: (d) => opened.push(d), randomInt: () => 0 });
  assert.equal(opened.at(-1).chooserPlayerIds[0], "o");
  resolveKiyohimeNoMoreLies({ state, player: state.players.k, skill: definitions[KIYOHIME_LIES_ID], payload: { previous: { stage: "lies-answer", targetPlayerId: "o" }, decision: { status: "resolved", selections: ["yes"] } }, definitions, openDecision: noDecision, randomInt: () => 0 });
  state.players.o.flags.combatWinRound = 3;
  const beforeSeals = state.players.o.commandSeals;
  const beforeVp = state.players.k.victoryPoints;
  useKiyohimeNoMoreLies({ state, player: state.players.k, skill: definitions[KIYOHIME_LIES_ID], payload: { eventType: "round.ending", event: {} }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.equal(state.players.o.commandSeals, beforeSeals - 1);
  assert.equal(state.players.o.flags.commandSealUsedRound, undefined);
  assert.equal(state.players.k.victoryPoints, beforeVp + 2);
  assert.ok(targetDecision);
});

test("不再有谎言在战斗开始允许被问者主动败北", () => {
  const { definitions, state } = setup("kiyo-self-defeat");
  addSkill(state, "lies", KIYOHIME_LIES_ID);
  state.modeState.kiyohimeNoMoreLies = { k: { round: 4, targetPlayerId: "o", answerWillWin: false } };
  state.phase = "combat";
  const opened = [];
  useKiyohimeNoMoreLies({ state, player: state.players.k, skill: definitions[KIYOHIME_LIES_ID], payload: { eventType: "phase.transitioned", event: { previousPhase: "action", transition: "next-phase" } }, definitions, openDecision: (d) => opened.push(d), randomInt: () => 0 });
  assert.equal(opened[0].chooserPlayerIds[0], "o");
  resolveKiyohimeNoMoreLies({ state, player: state.players.k, skill: definitions[KIYOHIME_LIES_ID], payload: { previous: { stage: "lies-self-defeat", targetPlayerId: "o" }, decision: { status: "resolved", selections: ["defeat"] } }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.equal(state.players.o.defeated, true);
});

test("转身火生三昧支付3魔力后仅本回合魔术攻击不可减威，实体牌持续至下回合结束", () => {
  const { definitions, state } = setup("kiyo-samadhi");
  addSkill(state, "samadhi", KIYOHIME_SAMADHI_ID, "attack", true);
  createOwnedCardInstance(state, "k", { instanceId: "magic", definitionId: "card.carda1", zone: "attack", face: "up", active: true });
  state.cards.magic.powerModifiers = [{ id: "penalty", sourceId: "test", kind: "add", value: -4, duration: "round" }];
  const opened = [];
  const manaBefore = state.players.k.mana;
  useKiyohimeSamadhi({ state, player: state.players.k, skill: definitions[KIYOHIME_SAMADHI_ID], payload: { eventType: "card.played", event: { playerId: "k", instanceId: "samadhi", definitionId: KIYOHIME_SAMADHI_ID } }, definitions, openDecision: (d) => opened.push(d), randomInt: () => 0 });
  assert.equal(opened.length, 1);
  resolveKiyohimeSamadhi({ state, player: state.players.k, skill: definitions[KIYOHIME_SAMADHI_ID], payload: { previous: { sourceInstanceId: "samadhi" }, decision: { status: "resolved", selections: ["pay"] } }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.equal(state.players.k.mana, manaBefore - 3);
  assert.equal(state.players.k.flags.magicPowerReductionProtectedRound, 4);
  assert.equal(state.cards.samadhi.residual, true);
  assert.equal(state.cards.samadhi.residualUntilRound, 5);
  assert.ok(calculateCombatCardPower(state, state.players.k, "magic", definitions, "mountain") >= 0);
});
