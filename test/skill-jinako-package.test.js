import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { playerSkipsOutpostDeployment } from "../src/rules-core/board.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  JINAKO_CHEAT_ID,
  JINAKO_GAMER_ID,
  JINAKO_TIMEOUT_ID,
  useJinakoCheatCodeCast,
  useJinakoGamer,
  useJinakoTimeOut,
} from "../src/rules-core/jinako.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const str2 = { id: "card.test.jinako-str2", name: "Strength 2", cardType: "attack", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true };
const str3 = { id: "card.test.jinako-str3", name: "Strength 3", cardType: "attack", cost: 0, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true };
const str4 = { id: "card.test.jinako-str4", name: "Strength 4", cardType: "attack", cost: 0, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true };
const str5 = { id: "card.test.jinako-str5", name: "Strength 5", cardType: "attack", cost: 0, basePower: 5, typeLabel: "力量", attributes: ["力量"], basic: true };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [str2.id]: str2, [str3.id]: str3, [str4.id]: str4, [str5.id]: str5 };

function makeState(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "j", name: "Jinako" }, { id: "o", name: "Opponent" }], seed: 223 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "j";
  state.players.j.masterId = "master.jinako";
  state.players.j.servantId = "servant.test-jinako";
  state.players.j.mana = 10;
  state.players.j.locationId = "mountain";
  state.players.o.locationId = "city";
  state.board.locations.mountain = ["j"];
  state.board.locations.city = ["o"];
  return state;
}

function add(state, id, definitionId, zone = "hand", options = {}) {
  createOwnedCardInstance(state, "j", { instanceId: id, definitionId, zone, face: zone.includes("skills") ? "up" : "down", active: false, ...options });
}

function ctx(state, skillId, payload) {
  return { state, player: state.players.j, skill: built.skills.get(skillId), payload, definitions };
}

function armCheat(state) {
  add(state, "cheat", JINAKO_CHEAT_ID, "master-skills");
  return useJinakoCheatCodeCast(ctx(state, JINAKO_CHEAT_ID, { abilityId: "cheat-code-cast" }));
}

function commitConverted(state, convertedId, fillerId = "filler") {
  return commitStandardAttack(state, "j", [convertedId, fillerId], [], definitions, {
    cardDataByInstanceId: { [convertedId]: { basicSpecialConversion: true } },
  });
}

test("吉娜可技能包3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.jinako");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("Gamer按开局从者牌库基础特殊数量计算X，最低为1；转换后的基础特殊同样获得X", () => {
  const state = makeState("jinako-gamer");
  add(state, "origin-luck", "card.cardluck", "deck", { originServantId: "servant.test-jinako" });
  add(state, "origin-prep", "card.cardpreparation", "deck", { originServantId: "servant.test-jinako" });
  const gamer = useJinakoGamer(ctx(state, JINAKO_GAMER_ID, { eventType: "game.started", event: {} }));
  assert.equal(gamer.initialBasicSpecialCount, 2);
  assert.equal(gamer.powerBonus, 4);
  assert.equal(state.players.j.flags.basicSpecialAttackPowerBonus, 4);

  armCheat(state);
  add(state, "converted", str4.id);
  add(state, "filler", str2.id);
  commitConverted(state, "converted");
  assert.equal(state.cards.converted.definitionId, "card.cardluck");
  assert.equal(calculateCombatCardPower(state, state.players.j, "converted", definitions), 8);
});

test("Shut-in按英文原文：离开魔术工房失去2魔力，而不是旧迁移文本的3", () => {
  const state = makeState("jinako-shut-in");
  state.players.j.mana = 6;
  const result = useJinakoGamer(ctx(state, JINAKO_GAMER_ID, { eventType: "player.moved", event: { playerId: "j", previousLocationId: "workshop", locationId: "mountain" } }));
  assert.equal(result.lostMana, 2);
  assert.equal(state.players.j.mana, 4);
});

for (const [power, source, targetId, expectedCost] of [
  [4, str4, "card.cardluck", 0],
  [3, str3, "card.cardsurveil", 1],
  [2, str2, "card.cardpreparation", 1],
]) {
  test(`作弊代码转换 ${power} 威力基础牌完整变为对应Special定义并支付新费用`, () => {
    const state = makeState(`jinako-convert-${power}`);
    armCheat(state);
    add(state, "converted", source.id);
    add(state, "filler", str2.id);
    const before = state.players.j.mana;
    const result = commitConverted(state, "converted");
    assert.equal(state.cards.converted.definitionId, targetId);
    assert.equal(state.cards.converted.temporaryDefinitionCopy.originalDefinitionId, source.id);
    assert.equal(state.cards.converted.temporaryDefinitionCopy.copiedFromDefinitionId, targetId);
    assert.deepEqual(getCardInstanceAttributes(state.cards.converted, definitions[targetId], state, definitions), ["特殊"]);
    assert.equal(state.players.j.mana, before - expectedCost);
    assert.equal(result.cards.find((card) => card.instanceId === "converted").paidMana, expectedCost);
    assert.deepEqual(definitions[targetId].cardAbilityIds ?? [], definitions[state.cards.converted.definitionId].cardAbilityIds ?? []);
  });
}

test("非法5威力转换在克隆验证阶段原子失败，不污染真实实体或魔力", () => {
  const state = makeState("jinako-invalid-convert");
  armCheat(state);
  add(state, "converted", str5.id);
  add(state, "filler", str2.id);
  const beforeMana = state.players.j.mana;
  assert.throws(() => commitConverted(state, "converted"), /BASIC_SPECIAL_CONVERSION_TARGET_MISSING/);
  assert.equal(state.cards.converted.definitionId, str5.id);
  assert.equal(state.cards.converted.temporaryDefinitionCopy, undefined);
  assert.equal(state.cards.converted.zone, "hand");
  assert.equal(state.players.j.mana, beforeMana);
});

test("Time Out解锁后所有受控攻击保留原印刷属性；作弊转换因此同时保留力量与特殊", () => {
  const state = makeState("jinako-timeout-types");
  add(state, "timeout", JINAKO_TIMEOUT_ID, "master-skills");
  useJinakoTimeOut(ctx(state, JINAKO_TIMEOUT_ID, { eventType: "skill.unlocked", event: { playerId: "j", skillId: JINAKO_TIMEOUT_ID } }));
  assert.equal(state.players.j.flags.retainControlledAttackPrintedAttributes, true);
  armCheat(state);
  add(state, "converted", str4.id);
  add(state, "filler", str2.id);
  commitConverted(state, "converted");
  const attrs = getCardInstanceAttributes(state.cards.converted, definitions[state.cards.converted.definitionId], state, definitions);
  assert.deepEqual(new Set(attrs), new Set(["力量", "特殊"]));
});

test("Time Out跳过本回合部署并取回已移除的Cheat Code Cast，清除其每局使用记录", () => {
  const state = makeState("jinako-timeout-recover");
  armCheat(state);
  assert.equal(state.cards.cheat.zone, "removed");
  state.players.j.usage[JINAKO_CHEAT_ID] = { usedGame: true };
  state.phase = "outpost";
  state.step = "player-window";
  const result = useJinakoTimeOut(ctx(state, JINAKO_TIMEOUT_ID, { abilityId: "time-out" }));
  assert.equal(result.recoveredInstanceId, "cheat");
  assert.equal(state.cards.cheat.zone, "master-skills");
  assert.equal(state.cards.cheat.face, "up");
  assert.equal(state.players.j.usage[JINAKO_CHEAT_ID], undefined);
  assert.equal(playerSkipsOutpostDeployment(state, "j"), true);
});
