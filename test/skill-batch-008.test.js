import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { SkillRegistry } from "../src/rules-core/skill-registry.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { buildStandardContent } from "../src/content/content-package.ts";

const alterEgoIds = [
  "servant.douman.skill.sc-douman-3",
  "servant.koyanskaya.skill.sc-koyanskaya-1",
  "servant.mechaeli.skill.sc-mechaeli-3",
  "servant.meltryllis.skill.sc-meltryllis-3",
  "servant.muramasa.skill.sc-muramasa-3",
  "servant.okita-alt.skill.sc-okita-alt-1",
  "servant.sitonai.skill.sc-sitonai-3",
  "servant.taisui.skill.sc-taisui-1",
];

function fixture(targetDefinition) {
  const skillId = alterEgoIds[0];
  const skills = new SkillRegistry();
  skills.register({
    id: skillId,
    name: "他人格",
    ownerType: "servant",
    ownerId: "servant.douman",
    activation: "residual",
    windows: [],
    cost: 0,
    text: "",
    supportLevel: "FULL",
    handlerId: "core.alter-ego-transform",
    requiresActiveCard: true,
    abilities: [{ id: "alter-ego-transform", name: "他人格", activation: "optional-trigger", windows: ["action"], requiresActiveCard: true }],
  });
  const engine = new StandardMatchEngine({ cards: { target: targetDefinition }, situations: [], events: [], playerDecks: {}, skills });
  const state = createGameState({ gameInstanceId: `alter-ego-${targetDefinition.id}`, players: [{ id: "p1", name: "一" }], seed: 8 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "p1";
  state.players.p1.servantId = "servant.douman";
  createOwnedCardInstance(state, "p1", { instanceId: "alter", definitionId: skillId, zone: "attack", face: "up", active: true, residual: true });
  createOwnedCardInstance(state, "p1", { instanceId: "target", definitionId: "target", zone: "attack", face: "up", active: true });
  state.cards.target.playedRound = state.round;
  return { engine, state, skillId };
}

function use(state, skillId, data) {
  return {
    commandId: `use-${state.gameInstanceId}`,
    gameInstanceId: state.gameInstanceId,
    actorId: "p1",
    expectedRevision: state.revision,
    type: CommandType.UseSkill,
    payload: { skillId, data: { abilityId: "alter-ego-transform", ...data } },
  };
}

test("skills-008 他人格对无反转牌写入任意力量/迅捷/魔术组合并关闭来源", () => {
  const definition = { id: "target", name: "目标", cost: 1, basePower: 3, typeLabel: "魔术", attributes: ["魔术"] };
  const { engine, state, skillId } = fixture(definition);
  const result = engine.execute(state, use(state, skillId, { targetInstanceId: "target", attributes: ["力量", "迅捷"] }));
  assert.deepEqual(getCardInstanceAttributes(result.state.cards.target, definition), ["力量", "迅捷"]);
  assert.equal(result.state.cards.alter.zone, "servant-skills");
  assert.equal(result.state.cards.alter.active, false);
});

test("skills-008 他人格对具有反转效果的牌只记录反转状态", () => {
  const definition = { id: "target", name: "反转牌", cost: 1, basePower: 3, typeLabel: "特殊", attributes: ["特殊"], hasReversalEffect: true };
  const { engine, state, skillId } = fixture(definition);
  const result = engine.execute(state, use(state, skillId, { targetInstanceId: "target", reverse: true }));
  assert.equal(result.state.cards.target.reversed, true);
  assert.equal(result.state.cards.target.attributeOverrides, undefined);
});

test("skills-008 八张同文他人格职阶牌共享完整处理器与独立子技能", () => {
  const content = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(content);
  for (const id of alterEgoIds) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL", id);
    assert.equal(skill.handlerId, "core.alter-ego-transform", id);
    assert.equal(skill.activation, "residual", id);
    assert.deepEqual(skill.abilities?.map((ability) => ability.id), ["alter-ego-transform"], id);
  }
});
