import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import {
  SHUTEN_BANQUET_ID,
  SHUTEN_SAKE_ID,
  SHUTEN_BONE_ID,
  useShutenDebaucherousBanquet,
  useShutenNoxiousSake,
  useShutenBoneCollector,
} from "../src/rules-core/shuten.ts";

function setup(id = "shuten") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "s", name: "Shuten" }, { id: "o", name: "Opponent" }], seed: 2610 });
  state.status = "playing";
  state.round = 4;
  state.phase = "preparation";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "o"];
  state.players.s.servantId = "servant.shuten";
  state.players.s.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["s", "o"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  state.players.s.mana = 20;
  state.players.o.mana = 20;
  return { built, definitions, state };
}

function addSkill(state, instanceId, definitionId, zone = "servant-skills", active = false) {
  createOwnedCardInstance(state, "s", { instanceId, definitionId, zone, face: "up", active });
}

const noopDecision = () => { throw new Error("UNEXPECTED_DECISION"); };

test("酒吞童子整包 3/3 FULL 且处理器已绑定", () => {
  const { built } = setup("shuten-full");
  new StandardMatchEngine(built);
  for (const id of [SHUTEN_BANQUET_ID, SHUTEN_SAKE_ID, SHUTEN_BONE_ID]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL");
    assert.equal(built.skills.hasHandler(id), true);
  }
  const sake = built.skills.get(SHUTEN_SAKE_ID);
  assert.equal(sake.limit, undefined);
  assert.equal(sake.requiresEightMana, false);
  assert.equal(sake.standardAppend, true);
});

test("酒池肉林放置版图后只提高当地对手手牌/技能区攻击费用，战斗结束当地玩家各+1VP，回合末回收", () => {
  const { definitions, state } = setup("shuten-banquet");
  addSkill(state, "banquet", SHUTEN_BANQUET_ID);
  createOwnedCardInstance(state, "o", { instanceId: "basic", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  const basic = state.cards.basic;
  const basicDef = definitions[basic.definitionId];
  const baseCost = getCardPlayCost(state, basicDef, state.players.o, basic, definitions);

  useShutenDebaucherousBanquet({ state, player: state.players.s, skill: definitions[SHUTEN_BANQUET_ID], payload: { abilityId: "place-banquet", locationId: "mountain" }, definitions, openDecision: noopDecision, randomInt: () => 0 });
  assert.equal(state.cards.banquet.zone, "board");
  assert.equal(state.cards.banquet.boardLocationId, "mountain");
  assert.equal(getCardPlayCost(state, basicDef, state.players.o, basic, definitions), baseCost + 2);

  const beforeS = state.players.s.victoryPoints;
  const beforeO = state.players.o.victoryPoints;
  useShutenDebaucherousBanquet({ state, player: state.players.s, skill: definitions[SHUTEN_BANQUET_ID], payload: { eventType: "combat.ending", event: { previousLocations: { s: "mountain", o: "mountain" } } }, definitions, openDecision: noopDecision, randomInt: () => 0 });
  assert.equal(state.players.s.victoryPoints, beforeS + 1);
  assert.equal(state.players.o.victoryPoints, beforeO + 1);

  useShutenDebaucherousBanquet({ state, player: state.players.s, skill: definitions[SHUTEN_BANQUET_ID], payload: { eventType: "round.ending", event: {} }, definitions, openDecision: noopDecision, randomInt: () => 0 });
  assert.equal(state.cards.banquet.zone, "servant-skills");
  assert.equal(state.cards.banquet.active, false);
});

test("毒酒在战斗开始时让当前同战斗全部基础攻击获得每局一次，但不会追溯标记已使用", () => {
  const { definitions, state } = setup("shuten-sake");
  state.phase = "combat";
  addSkill(state, "sake", SHUTEN_SAKE_ID, "attack", true);
  createOwnedCardInstance(state, "s", { instanceId: "own-basic", definitionId: "card.cardb1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "opp-basic", definitionId: "card.cardq1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "nonbasic", definitionId: SHUTEN_BONE_ID, zone: "attack", face: "up", active: true });

  useShutenNoxiousSake({ state, player: state.players.s, skill: definitions[SHUTEN_SAKE_ID], payload: { eventType: "phase.transitioned", event: { previousPhase: "action", transition: "next-phase" } }, definitions, openDecision: noopDecision, randomInt: () => 0 });
  assert.equal(state.cards["own-basic"].usageLimitOverride, "once-per-game");
  assert.equal(state.cards["opp-basic"].usageLimitOverride, "once-per-game");
  assert.equal(state.cards["own-basic"].used, undefined);
  assert.equal(state.cards["opp-basic"].used, undefined);
  assert.equal(state.cards.nonbasic.usageLimitOverride, undefined);
});

test("骨收集按目标真实开局牌库数量的四分之一向上取整移除，移除后空牌库则败北", () => {
  const { definitions, state } = setup("shuten-bone");
  state.phase = "combat";
  state.activePlayerId = "s";
  addSkill(state, "bone", SHUTEN_BONE_ID, "attack", true);
  state.players.o.flags.startingDeckSize = 10;
  for (let i = 1; i <= 3; i++) createOwnedCardInstance(state, "o", { instanceId: `d${i}`, definitionId: "card.cardb1", zone: "deck", face: "down", active: false });

  const result = useShutenBoneCollector({ state, player: state.players.s, skill: definitions[SHUTEN_BONE_ID], payload: { abilityId: "bone-collector", targetPlayerId: "o" }, definitions, openDecision: noopDecision, randomInt: () => 0 });
  assert.equal(result.count, 3);
  assert.deepEqual(result.removedInstanceIds, ["d1", "d2", "d3"]);
  assert.equal(state.players.o.deck.length, 0);
  assert.equal(state.players.o.defeated, true);
  assert.ok(result.removedInstanceIds.every((id) => state.cards[id].zone === "removed"));
});
