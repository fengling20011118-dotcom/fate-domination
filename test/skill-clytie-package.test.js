import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { clearCardStateBoundToClose, createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  CLYTIE_FOREIGNER_CLASS_ID,
  CLYTIE_STARRY_NIGHT_ID,
  CLYTIE_WATER_NYMPH_ID,
} from "../src/rules-core/clytie.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const testStrength = { id: "card.test.clytie-strength", name: "测试力量", cardType: "attack", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true };
const testMagic = { id: "card.test.clytie-magic", name: "测试魔术", cardType: "attack", cost: 0, basePower: 2, typeLabel: "魔术", attributes: ["魔术"], basic: true };
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  [testStrength.id]: testStrength,
  [testMagic.id]: testMagic,
};

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function makeState(id) {
  const state = createGameState({
    gameInstanceId: id,
    players: [
      { id: "c", name: "Clytie" },
      { id: "o", name: "Opponent" },
      { id: "r", name: "Recon" },
      { id: "w", name: "Workshop" },
    ],
    seed: 43,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "c";
  state.players.c.servantId = "servant.clytie";
  for (const player of Object.values(state.players)) player.mana = 20;
  putAt(state, "c", "mountain");
  putAt(state, "o", "city");
  putAt(state, "r", "scouting");
  putAt(state, "w", "workshop");
  return state;
}

function addAttack(state, playerId, instanceId, definitionId, face = "up", active = true) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone: "attack", face, active });
}

function useSkill(state, playerId, skillId, payload) {
  return built.skills.execute(state, playerId, skillId, payload, () => {}, () => 0, definitions);
}

test("克吕提厄·梵高技能包 4/4 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.clytie");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(built.skills.get(CLYTIE_STARRY_NIGHT_ID).standardAppend, true);
  assert.equal(built.skills.get(CLYTIE_WATER_NYMPH_ID).standardAppend, true);
  assert.equal(built.skills.get(CLYTIE_WATER_NYMPH_ID).requiresTrueName, true);
});

test("星月夜在真名隐藏时只给战场与侦查玩家加入梵高的领域外生命", () => {
  const state = makeState("clytie-starry-hidden");
  state.phase = "combat";
  addAttack(state, "c", "starry", CLYTIE_STARRY_NIGHT_ID);
  const result = useSkill(state, "c", CLYTIE_STARRY_NIGHT_ID, { abilityId: "starry-night" });
  assert.equal(result.mode, "distribute");
  assert.equal(result.created.length, 3);
  for (const playerId of ["c", "o", "r"]) {
    const instanceId = state.players[playerId].hand.find((id) => state.cards[id]?.definitionId === CLYTIE_FOREIGNER_CLASS_ID);
    assert.ok(instanceId);
    assert.equal(state.cards[instanceId].ownerPlayerId, playerId);
    assert.equal(state.cards[instanceId].createdByPlayerId, "c");
  }
  assert.equal(state.players.w.hand.some((id) => state.cards[id]?.definitionId === CLYTIE_FOREIGNER_CLASS_ID), false);
});

test("由星月夜生成的领域外生命保持实体所有权，并可由获得者发动后同时强化梵高", () => {
  const state = makeState("clytie-generated-class-card");
  state.phase = "combat";
  addAttack(state, "c", "starry", CLYTIE_STARRY_NIGHT_ID);
  useSkill(state, "c", CLYTIE_STARRY_NIGHT_ID, { abilityId: "starry-night" });
  const instanceId = state.players.o.hand.find((id) => state.cards[id]?.definitionId === CLYTIE_FOREIGNER_CLASS_ID);
  assert.ok(instanceId);
  movePlayerCard(state, "o", instanceId, "attack");
  state.cards[instanceId].face = "up";
  state.cards[instanceId].active = true;
  state.activePlayerId = "o";
  useSkill(state, "o", CLYTIE_FOREIGNER_CLASS_ID, {});
  assert.equal(state.players.o.flags.roundPowerBonus, 6);
  assert.equal(state.players.c.flags.roundPowerBonus, 6);
});

test("星月夜在真名已解放时使所有玩家场上的领域外生命本回合+3威力", () => {
  const state = makeState("clytie-starry-revealed");
  state.phase = "combat";
  state.players.c.trueNameRevealed = true;
  addAttack(state, "c", "starry", CLYTIE_STARRY_NIGHT_ID);
  addAttack(state, "c", "life-c", CLYTIE_FOREIGNER_CLASS_ID);
  addAttack(state, "o", "life-o", "card.x-foreigner");
  assert.equal(calculateCombatCardPower(state, state.players.c, "life-c", definitions, "mountain"), 0);
  assert.equal(calculateCombatCardPower(state, state.players.o, "life-o", definitions, "city"), 0);
  const result = useSkill(state, "c", CLYTIE_STARRY_NIGHT_ID, { abilityId: "starry-night" });
  assert.equal(result.mode, "power");
  assert.equal(calculateCombatCardPower(state, state.players.c, "life-c", definitions, "mountain"), 3);
  assert.equal(calculateCombatCardPower(state, state.players.o, "life-o", definitions, "city"), 3);
});

test("水之宁芙必须在真名解放后打出和使用", () => {
  const state = makeState("clytie-water-name-gate");
  createOwnedCardInstance(state, "c", { instanceId: "water-hand", definitionId: CLYTIE_WATER_NYMPH_ID, zone: "hand", face: "down", active: false });
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "c", instanceId: "water-hand", definitions, faceDown: false }), /CARD_REQUIRES_TRUE_NAME/);
  state.players.c.trueNameRevealed = true;
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "c", instanceId: "water-hand", definitions, faceDown: false }));
});

test("水之宁芙按场上每张领域外生命逐张抽牌并赋予对应属性，包括对手控制的领域外生命", () => {
  const state = makeState("clytie-water-all-in-play");
  state.players.c.trueNameRevealed = true;
  addAttack(state, "c", "water", CLYTIE_WATER_NYMPH_ID);
  addAttack(state, "c", "life-c", CLYTIE_FOREIGNER_CLASS_ID);
  addAttack(state, "o", "life-o", "card.x-foreigner");
  addAttack(state, "r", "life-hidden", CLYTIE_FOREIGNER_CLASS_ID, "down", false);
  createOwnedCardInstance(state, "c", { instanceId: "draw-strength", definitionId: testStrength.id, zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "c", { instanceId: "draw-magic", definitionId: testMagic.id, zone: "deck", face: "down", active: false });
  const result = useSkill(state, "c", CLYTIE_WATER_NYMPH_ID, { abilityId: "water-nymph" });
  assert.deepEqual(result.drawnInstanceIds, ["draw-strength", "draw-magic"]);
  assert.equal(result.pairs.length, 2);
  assert.ok(state.cards["life-c"].attributeOverrides.includes("特殊"));
  assert.ok(state.cards["life-c"].attributeOverrides.includes("力量"));
  assert.ok(state.cards["life-o"].attributeOverrides.includes("特殊"));
  assert.ok(state.cards["life-o"].attributeOverrides.includes("魔术"));
  assert.equal(state.cards["life-hidden"].attributeOverrides, undefined);
  clearCardStateBoundToClose(state.cards["life-o"]);
  assert.equal(state.cards["life-o"].attributeOverrides, undefined);
});
