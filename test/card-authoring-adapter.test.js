import test from "node:test";
import assert from "node:assert/strict";

test("标准化技能卡可以适配为旧技能定义且保留完整 rules 扩展", async () => {
  const { compileAuthoringSkillCard } = await import("../src/content/authoring/adapter.ts");
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");

  const compiled = compileAuthoringSkillCard({
    id: "servant.drake.skill.sc-drake-1",
    aliases: ["servant.francis_drake.skill.riding"],
    ownerType: "servant",
    ownerId: "servant.drake",
    name: "骑乘（Rider Class）",
    printedText: "打出时：若此牌与一张基础攻击一同打出，抽一张牌。\n坐骑召唤-行动阶段：打出至多3张基本威力为3或更低的手牌。",
    cardFace: {
      typeLabel: "特殊",
      cost: 3,
      requirement: { type: "min_mana", value: 3 },
      basePower: 0,
      attributes: ["特殊"],
    },
    abilities: [
      {
        id: "play_draw",
        printedClause: "打出时：若此牌与一张基础攻击一同打出，抽一张牌。",
        kind: "play_trigger",
        activation: { phase: "action" },
        execution: { mode: "automatic" },
        effects: [{ type: "draw_cards", target: "controller", amount: 1 }],
      },
      {
        id: "mount_summon",
        printedClause: "坐骑召唤-行动阶段：打出至多3张基本威力为3或更低的手牌。",
        kind: "phase_action",
        activation: { phase: "action" },
        execution: { mode: "handler", handlerId: "core.riding" },
        effects: [{ type: "append_from_hand", target: "controller", maxCount: 3, maxBasePower: 3 }],
      },
    ],
    evidence: [{ kind: "user-confirmed", document: "卡牌技能标准化文档.md", locator: "14.2" }],
    verification: { status: "pilot" },
  });

  assert.equal(compiled.legacySkill.id, "servant.drake.skill.sc-drake-1");
  assert.equal(compiled.legacySkill.text, "打出时：若此牌与一张基础攻击一同打出，抽一张牌。\n坐骑召唤-行动阶段：打出至多3张基本威力为3或更低的手牌。");
  assert.deepEqual(compiled.legacySkill.activation, { kind: "active", windows: ["action"], steps: [] });
  assert.equal(compiled.legacySkill.implementation, "implemented");
  assert.equal(compiled.legacySkill.handlerId, "core.riding");
  assert.equal(compiled.rules.schemaVersion, "fd-card-authoring-v1");
  assert.deepEqual(compiled.rules.aliases, ["servant.francis_drake.skill.riding"]);
  assert.equal(compiled.rules.abilities[0].printedClause, "打出时：若此牌与一张基础攻击一同打出，抽一张牌。");
  assert.equal(compiled.rules.abilities[1].execution.handlerId, "core.riding");
  assert.ok(compiled.report.some((item) => item.field === "abilities[1].execution" && item.requiredAction === "keep_handler_until_generic_runtime_exists"));

  const [skill] = buildSkillDefinitions({
    servants: [{ id: compiled.ownerId, skills: [compiled.legacySkill] }],
  });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.riding");
  assert.equal(skill.rules?.schemaVersion, "fd-card-authoring-v1");
  assert.equal(skill.rules?.abilities.length, 2);
});

test("标准化 rules 会同步到运行时卡牌目录的技能卡", async () => {
  const { compileAuthoringSkillCard } = await import("../src/content/authoring/adapter.ts");
  const { buildStandardContent } = await import("../src/content/content-package.ts");

  const compiled = compileAuthoringSkillCard({
    id: "master.test.skill.s1",
    ownerType: "master",
    ownerId: "master.test",
    name: "测试技能",
    printedText: "行动阶段：获得1点魔力。",
    cardFace: { typeLabel: "特殊", cost: 0, basePower: 0, attributes: ["特殊"] },
    abilities: [{
      id: "gain_mana",
      printedClause: "行动阶段：获得1点魔力。",
      kind: "phase_action",
      activation: { phase: "action" },
      execution: { mode: "handler", handlerId: "core.pay-mana-draw" },
      effects: [{ type: "gain_mana", target: "controller", amount: 1 }],
    }],
  });

  const content = buildStandardContent({
    masters: [{ id: "master.test", skills: [compiled.legacySkill] }],
    cards: [{
      id: "card.skill.master.test.skill.s1",
      name: "测试技能",
      cardType: "skill",
      ownerType: "master",
      linkedSkillId: "master.test.skill.s1",
      cost: 0,
      basePower: 0,
      typeLabel: "特殊",
      attributes: ["特殊"],
      rules: { schemaVersion: "fd-card-authoring-v1", abilities: [] },
    }],
  });

  assert.equal(content.cards["card.skill.master.test.skill.s1"].rules?.schemaVersion, "fd-card-authoring-v1");
  assert.equal(content.cards["card.skill.master.test.skill.s1"].rules?.abilities[0].id, "gain_mana");
});
