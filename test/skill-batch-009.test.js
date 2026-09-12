import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { useGameStartRuleFlags } from "../src/rules-core/skill-handlers.ts";
import { getStandardAttackRequirements } from "../src/rules-core/card-rules.ts";
import { gainMana, setMana } from "../src/rules-core/resources.ts";
import { payMana } from "../src/rules-core/costs.ts";

const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));

test("skills-009 三张纯配置被动写入令咒窗口、魔眼次数和异闻带职责", () => {
  const built = buildStandardContent(raw);
  const state = createGameState({ gameInstanceId: "config-passives", players: [{ id: "p1", name: "一" }], seed: 9 });
  const player = state.players.p1;
  for (const id of ["master.irisviel.skill.s1", "master.ophelia.skill.s1a", "master.peperoncino.skill.s1"]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL", id);
    assert.equal(skill.handlerId, "core.game-start-rule-flags", id);
    useGameStartRuleFlags({ state, player, skill, payload: { eventType: "game.started" }, openDecision: () => undefined });
  }
  assert.equal(player.flags.commandSealWindow, "outpost");
  assert.equal(player.flags.delayedMysticEyeUsesPerGame, 2);
  assert.equal(player.flags.lostbeltResponsibility, "india");
});

test("skills-009 四张逆推法记录以结构化属性标签供福尔摩斯主技能读取", () => {
  const built = buildStandardContent(raw);
  const expected = new Map([
    ["servant.sherlock.skill.sc-sherlock-4", "力量"],
    ["servant.sherlock.skill.sc-sherlock-5", "迅捷"],
    ["servant.sherlock.skill.sc-sherlock-6", "魔术"],
    ["servant.sherlock.skill.sc-sherlock-7", "特殊"],
  ]);
  for (const [id, attribute] of expected) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL", id);
    assert.equal(skill.handlerId, "core.rule-marker", id);
    assert.deepEqual(skill.tags, ["deduction-record", `deduction-attribute:${attribute}`], id);
  }
});

test("skills-009 过载炉心在11魔力时把常规攻击从两张提升为三张", () => {
  const state = createGameState({ gameInstanceId: "overload-core", players: [{ id: "p1", name: "齐格" }], seed: 9 });
  const player = state.players.p1;
  player.flags.extraStandardAttackManaThreshold = 11;
  player.mana = 10;
  assert.equal(getStandardAttackRequirements(player, state, {}).requiredCards, 2);
  player.mana = 11;
  assert.equal(getStandardAttackRequirements(player, state, {}).requiredCards, 3);
});

test("skills-009 被污染的圣杯冻结魔力且为常规攻击增加一张牌", () => {
  const state = createGameState({ gameInstanceId: "corrupted-grail", players: [{ id: "p1", name: "樱" }], seed: 9 });
  const player = state.players.p1;
  player.mana = 4;
  player.flags.infiniteMana = true;
  player.flags.extraStandardAttackCards = 1;
  assert.equal(gainMana(player, 6), 0);
  setMana(player, 0);
  payMana(player, 20);
  assert.equal(player.mana, 4);
  assert.equal(getStandardAttackRequirements(player, state, {}).requiredCards, 3);
});
