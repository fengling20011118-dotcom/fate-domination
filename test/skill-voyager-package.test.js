import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  VOYAGER_FOREIGNER_CLASS_ID,
  VOYAGER_HOPE_ID,
  VOYAGER_PALE_BLUE_DOT_ID,
  VOYAGER_PEACE_ID,
  resolveVoyagerMessageHope,
  resolveVoyagerMessagePeace,
  resolveVoyagerPaleBlueDot,
  useVoyagerMessageHope,
  useVoyagerMessagePeace,
  useVoyagerPaleBlueDot,
} from "../src/rules-core/voyager.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const basicStrength = { id: "card.test.voyager-strength", name: "Strength Test", cardType: "attack", cost: 2, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true };
const basicAgility = { id: "card.test.voyager-agility", name: "Agility Test", cardType: "attack", cost: 1, basePower: 3, typeLabel: "迅捷", attributes: ["迅捷"], basic: true };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [basicStrength.id]: basicStrength, [basicAgility.id]: basicAgility };

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function makeState(id, playerCount = 3) {
  const players = [{ id: "v", name: "Voyager" }, { id: "a", name: "A" }, { id: "b", name: "B" }].slice(0, playerCount);
  const state = createGameState({ gameInstanceId: id, players, seed: 113 });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "v";
  state.players.v.servantId = "servant.voyager";
  for (const player of Object.values(state.players)) { player.mana = 20; player.victoryPoints = 5; }
  putAt(state, "v", "mountain");
  if (state.players.a) putAt(state, "a", "mountain");
  if (state.players.b) putAt(state, "b", "city");
  return state;
}

function addCard(state, playerId, instanceId, definitionId, zone, face = "down", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}

function ctx(state, skillId, payload, openDecision = () => {}, emitEvent = () => {}) {
  return { state, player: state.players.v, skill: built.skills.get(skillId), payload, definitions, openDecision, randomInt: () => 0, emitEvent };
}

function latestFrame(state) {
  assert.ok(state.effectQueue.length > 0);
  return state.effectQueue[0].payload;
}

test("旅行者技能包 4/4 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.voyager");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("讯息：希望在任意玩家进入侦察时从游戏外给该玩家两张实体领域外生命", () => {
  const state = makeState("voyager-hope-enter");
  addCard(state, "v", "hope", VOYAGER_HOPE_ID, "servant-skills", "down", false);
  putAt(state, "a", "scouting");
  const events = [];
  const result = useVoyagerMessageHope(ctx(state, VOYAGER_HOPE_ID, { eventType: "player.entered-location", event: { playerId: "a", previousLocationId: "city", locationId: "scouting", method: "move" } }, () => {}, (type, payload) => events.push({ type, payload })));
  assert.equal(result.targetPlayerId, "a");
  assert.equal(result.createdInstanceIds.length, 2);
  assert.equal(state.players.a.hand.filter((id) => state.cards[id]?.definitionId === VOYAGER_FOREIGNER_CLASS_ID).length, 2);
  for (const instanceId of result.createdInstanceIds) {
    assert.equal(state.cards[instanceId].ownerPlayerId, "a");
    assert.equal(state.cards[instanceId].createdByPlayerId, "v");
    assert.equal(state.cards[instanceId].zone, "hand");
  }
  assert.equal(events.filter((event) => event.type === "card.created").length, 2);
});

test("讯息：希望行动能力由所有玩家分别选择展示或跳过，仅展示领域外生命者+2VP", () => {
  const state = makeState("voyager-hope-reveal");
  addCard(state, "v", "hope", VOYAGER_HOPE_ID, "attack", "up", true);
  addCard(state, "v", "v-life", VOYAGER_FOREIGNER_CLASS_ID, "hand");
  addCard(state, "a", "a-life", VOYAGER_FOREIGNER_CLASS_ID, "hand");
  addCard(state, "b", "b-basic", basicStrength.id, "hand");
  let decision;
  const opened = useVoyagerMessageHope(ctx(state, VOYAGER_HOPE_ID, { abilityId: "hope-reveal" }, (value) => { decision = value; }));
  assert.equal(opened.pending, true);
  assert.deepEqual(new Set(decision.chooserPlayerIds), new Set(["v", "a", "b"]));
  const events = [];
  const result = resolveVoyagerMessageHope(ctx(state, VOYAGER_HOPE_ID, {
    previous: latestFrame(state),
    decision: { status: "resolved", submissions: { v: ["v-life"], a: ["a-life"], b: ["skip:b"] } },
  }, () => {}, (type, payload) => events.push({ type, payload })));
  assert.deepEqual(result.revealed.map((entry) => entry.playerId), ["v", "a"]);
  assert.equal(state.players.v.victoryPoints, 7);
  assert.equal(state.players.a.victoryPoints, 7);
  assert.equal(state.players.b.victoryPoints, 5);
  assert.equal(events.filter((event) => event.type === "card.revealed").length, 2);
});

test("讯息：和平行动能力分两步打出至多2张领域外生命并追加至多2张暗置牌", () => {
  const state = makeState("voyager-peace-action");
  addCard(state, "v", "peace", VOYAGER_PEACE_ID, "attack", "up", true);
  addCard(state, "v", "life-1", VOYAGER_FOREIGNER_CLASS_ID, "hand");
  addCard(state, "v", "life-2", VOYAGER_FOREIGNER_CLASS_ID, "hand");
  addCard(state, "v", "hidden-1", basicStrength.id, "hand");
  addCard(state, "v", "hidden-2", basicAgility.id, "hand");
  let firstDecision;
  const first = useVoyagerMessagePeace(ctx(state, VOYAGER_PEACE_ID, { abilityId: "peace-action" }, (value) => { firstDecision = value; }));
  assert.equal(first.stage, "foreigner");
  assert.equal(firstDecision.max, 2);
  let secondDecision;
  const second = resolveVoyagerMessagePeace(ctx(state, VOYAGER_PEACE_ID, {
    previous: latestFrame(state), decision: { status: "resolved", selections: ["life-1", "life-2"] },
  }, (value) => { secondDecision = value; }));
  assert.equal(second.stage, "face-down");
  assert.equal(secondDecision.max, 2);
  const beforeMana = state.players.v.mana;
  const result = resolveVoyagerMessagePeace(ctx(state, VOYAGER_PEACE_ID, {
    previous: latestFrame(state), decision: { status: "resolved", selections: ["hidden-1", "hidden-2"] },
  }));
  assert.equal(result.playedFaceUp.length, 2);
  assert.deepEqual(result.playedFaceDownInstanceIds, ["hidden-1", "hidden-2"]);
  assert.equal(state.players.v.mana, beforeMana - 2);
  for (const instanceId of ["life-1", "life-2"]) {
    assert.equal(state.cards[instanceId].zone, "attack"); assert.equal(state.cards[instanceId].face, "up"); assert.equal(state.cards[instanceId].active, true);
  }
  for (const instanceId of ["hidden-1", "hidden-2"]) {
    assert.equal(state.cards[instanceId].zone, "attack"); assert.equal(state.cards[instanceId].face, "down"); assert.equal(state.cards[instanceId].active, false);
  }
});

test("讯息：和平战斗能力展示全员手牌，并将展示到领域外生命玩家的所有当前攻击威力设为0", () => {
  const state = makeState("voyager-peace-combat");
  state.phase = "combat";
  addCard(state, "v", "peace", VOYAGER_PEACE_ID, "attack", "up", true);
  addCard(state, "a", "a-life", VOYAGER_FOREIGNER_CLASS_ID, "hand");
  addCard(state, "a", "a-attack", basicStrength.id, "attack", "up", true);
  addCard(state, "b", "b-basic", basicAgility.id, "hand");
  addCard(state, "b", "b-attack", basicStrength.id, "attack", "up", true);
  const beforeA = calculateCombatCardPower(state, state.players.a, "a-attack", definitions, "mountain");
  const beforeB = calculateCombatCardPower(state, state.players.b, "b-attack", definitions, "city");
  assert.equal(beforeA, 4); assert.equal(beforeB, 4);
  const result = useVoyagerMessagePeace(ctx(state, VOYAGER_PEACE_ID, { abilityId: "peace-combat" }));
  assert.deepEqual(result.affectedPlayerIds, ["a"]);
  assert.equal(calculateCombatCardPower(state, state.players.a, "a-attack", definitions, "mountain"), 0);
  assert.equal(calculateCombatCardPower(state, state.players.b, "b-attack", definitions, "city"), 4);
  assert.deepEqual(result.revealedHands.a, ["a-life"]);
  assert.deepEqual(result.revealedHands.b, ["b-basic"]);
});

test("遥远的蓝色星球展示对手弃牌堆，可将其中全部领域外生命0魔力真实打出并偷2VP", () => {
  const state = makeState("voyager-pale-play", 2);
  addCard(state, "v", "pale", VOYAGER_PALE_BLUE_DOT_ID, "attack", "up", true);
  addCard(state, "a", "life-1", VOYAGER_FOREIGNER_CLASS_ID, "discard");
  addCard(state, "a", "life-2", VOYAGER_FOREIGNER_CLASS_ID, "discard");
  addCard(state, "a", "ordinary", basicStrength.id, "discard");
  const beforeMana = state.players.v.mana;
  let decision;
  const opened = useVoyagerPaleBlueDot(ctx(state, VOYAGER_PALE_BLUE_DOT_ID, { abilityId: "pale-blue-dot" }, (value) => { decision = value; }));
  assert.equal(opened.pending, true);
  assert.deepEqual(new Set(opened.foreignerInstanceIds), new Set(["life-1", "life-2"]));
  assert.deepEqual(decision.options.map((option) => option.id), ["play-all", "skip"]);
  const result = resolveVoyagerPaleBlueDot(ctx(state, VOYAGER_PALE_BLUE_DOT_ID, {
    previous: latestFrame(state), decision: { status: "resolved", selections: ["play-all"] },
  }));
  assert.deepEqual(result.playedInstanceIds, ["life-1", "life-2"]);
  assert.equal(result.victoryPointsStolen, 2);
  assert.equal(state.players.v.victoryPoints, 7);
  assert.equal(state.players.a.victoryPoints, 3);
  assert.equal(state.players.v.mana, beforeMana);
  for (const instanceId of ["life-1", "life-2"]) {
    assert.equal(state.cards[instanceId].controllerPlayerId, "v");
    assert.equal(state.cards[instanceId].ownerPlayerId, "a");
    assert.equal(state.cards[instanceId].paidCost, 0);
    assert.equal(state.cards[instanceId].returnToOwnerDiscardOnClose, true);
  }
  assert.equal(state.players.a.discard.includes("ordinary"), true);
  assert.equal(state.players.a.discard.includes("life-1"), false);
});

test("遥远的蓝色星球选择不打出时不偷VP，也不改变对手弃牌堆", () => {
  const state = makeState("voyager-pale-skip", 2);
  addCard(state, "v", "pale", VOYAGER_PALE_BLUE_DOT_ID, "attack", "up", true);
  addCard(state, "a", "life", VOYAGER_FOREIGNER_CLASS_ID, "discard");
  useVoyagerPaleBlueDot(ctx(state, VOYAGER_PALE_BLUE_DOT_ID, { abilityId: "pale-blue-dot" }));
  const result = resolveVoyagerPaleBlueDot(ctx(state, VOYAGER_PALE_BLUE_DOT_ID, {
    previous: latestFrame(state), decision: { status: "resolved", selections: ["skip"] },
  }));
  assert.equal(result.victoryPointsStolen, 0);
  assert.equal(state.players.v.victoryPoints, 5);
  assert.equal(state.players.a.victoryPoints, 5);
  assert.deepEqual(state.players.a.discard, ["life"]);
});
