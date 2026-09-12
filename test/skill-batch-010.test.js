import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardPower, getCombatCardAttributes } from "../src/rules-core/combat-power.ts";
import { buildStandardContent } from "../src/content/content-package.ts";

function actionState(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "p1", name: "伊莉雅" }], seed: 10 });
  state.status = "playing";
  state.round = 2;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "p1";
  state.players.p1.mana = 8;
  state.players.p1.locationId = "workshop";
  state.board.locations.workshop = ["p1"];
  return state;
}

test("skills-010 梦幻召唤骑兵可作为第三张常规攻击且写入共享次数锁", () => {
  const state = actionState("dream-rider");
  const definitions = {
    b1: { id: "b1", name: "基础一", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true },
    b2: { id: "b2", name: "基础二", cost: 0, basePower: 2, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
    rider: { id: "rider", name: "梦幻召唤-骑兵", cost: 0, basePower: 1, typeLabel: "特殊", attributes: ["特殊"], isSkill: true, requiresEightMana: false, standardAppend: true, uniqueGroup: "illya-dream-summon" },
  };
  for (const id of Object.keys(definitions)) createOwnedCardInstance(state, "p1", { instanceId: id, definitionId: id, zone: "hand" });
  const result = commitStandardAttack(state, "p1", ["b1", "b2", "rider"], [], definitions);
  assert.deepEqual(result.committed, ["b1", "b2", "rider"]);
  assert.equal(state.players.p1.usage["__unique:illya-dream-summon"].round, 2);
});

test("skills-010 梦幻召唤共享次数锁也约束打出型入口", () => {
  const state = actionState("dream-shared-lock");
  state.players.p1.usage["__unique:illya-dream-summon"] = { round: 2, used: true };
  const definitions = {
    b1: { id: "b1", name: "基础一", cost: 0, basePower: 2, typeLabel: "力量", basic: true },
    dream: { id: "dream", name: "梦幻召唤", cost: 0, basePower: 2, typeLabel: "特殊", isSkill: true, requiresEightMana: false, uniqueGroup: "illya-dream-summon" },
  };
  createOwnedCardInstance(state, "p1", { instanceId: "b1", definitionId: "b1", zone: "hand" });
  createOwnedCardInstance(state, "p1", { instanceId: "dream", definitionId: "dream", zone: "hand" });
  assert.throws(() => commitStandardAttack(state, "p1", ["b1", "dream"], [], definitions), /SKILL_UNIQUE_GROUP_USED/);
});

test("skills-010 梦幻召唤狂战士令其他攻击仅保留力量属性并增加1威力", () => {
  const state = actionState("dream-berserker");
  const definitions = {
    berserker: { id: "berserker", name: "梦幻召唤-狂战士", cost: 0, basePower: 2, typeLabel: "特殊", attributes: ["特殊"], tags: ["dream-summon-berserker"] },
    target: { id: "target", name: "其他攻击", cost: 0, basePower: 4, typeLabel: "魔术", attributes: ["魔术", "宝具"] },
  };
  createOwnedCardInstance(state, "p1", { instanceId: "berserker", definitionId: "berserker", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "p1", { instanceId: "target", definitionId: "target", zone: "attack", face: "up", active: true });
  assert.deepEqual(getCombatCardAttributes(state, state.players.p1, "target", definitions), ["力量"]);
  assert.equal(calculateCombatCardPower(state, state.players.p1, "target", definitions), 5);
  assert.deepEqual(getCombatCardAttributes(state, state.players.p1, "berserker", definitions), ["特殊"]);
});

test("skills-010 剑士、狂战士与骑兵三张梦幻召唤均达到FULL并共享唯一组", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  for (const id of ["servant.illya.skill.sc-illya-4", "servant.illya.skill.sc-illya-5", "servant.illya.skill.sc-illya-9"]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL", id);
    assert.equal(skill.uniqueGroup, "illya-dream-summon", id);
  }
  assert.equal(built.skills.get("servant.illya.skill.sc-illya-9").standardAppend, true);
});
