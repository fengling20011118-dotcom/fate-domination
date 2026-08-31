import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ContentRepository } from "../src/content/ContentRepository.js";
import { mergeContentPackages } from "../src/content/content-loader.js";

const content = JSON.parse(
  await readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"),
);

test("旧版内容已完整进入稳定 ID 迁移仓库", () => {
  const repository = new ContentRepository(content);
  assert.equal(repository.list("masters").length, 68);
  assert.equal(repository.list("servants").length, 183);
  assert.equal(repository.require("master.tiamat").name, "提亚马特");
  assert.equal(repository.require("event-group.fuyuki").cards.length, 20);
  const lakshmi = repository.require("servant.lakshmibai");
  assert.equal(lakshmi.deck.length, 12);
  assert.equal(lakshmi.deck.includes("card.x-misfortune"), true);
  assert.equal(lakshmi.deck.includes("card.carda2"), false);
});

test("扩展包内不同集合不能复用同一稳定 ID", () => {
  const base = {};
  assert.throws(() => mergeContentPackages(base, {
    masters: [{ id: "master.new", skills: [{ id: "skill.same" }] }],
    cards: [{ id: "skill.same", name: "冲突" }],
  }), /CONTENT_ID_DUPLICATE:skill\.same/);
});

test("内容仓库返回副本，界面无法直接污染规则数据", () => {
  const repository = new ContentRepository(content);
  const tiamat = repository.require("master.tiamat");
  tiamat.name = "被界面修改";
  assert.equal(repository.require("master.tiamat").name, "提亚马特");
});

test("内容导入器从角色集合生成 3X 候选池", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const content = buildStandardContent({ masters: [{ id: "master.a" }], servants: [{ id: "servant.a", deck: [] }] });
  assert.deepEqual(content.threeXMasterPool, ["master.a"]);
  assert.deepEqual(content.threeXServantPool, ["servant.a"]);
});

test("内容导入器拒绝从者牌库中的未知卡牌引用", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  assert.throws(() => buildStandardContent({
    cards: [{ id: "card.known", name: "已知牌" }],
    servants: [{ id: "servant.invalid-deck", deck: ["card.missing"] }],
  }), /SERVANT_CARD_NOT_FOUND:servant.invalid-deck:card.missing/);
});

test("标准内容包将943个技能全部装入注册表但只开放真实FULL能力", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const { StandardMatchEngine } = await import("../src/match-engine/standard-match-engine.ts");
  const built = buildStandardContent(content);
  assert.equal(built.skills.list().length, 943);
  new StandardMatchEngine(built);
  assert.equal(built.skills.list().length, 944);
  const levels = Object.groupBy(built.skills.list(), (skill) => skill.supportLevel);
  assert.equal(levels.FULL.length, 90);
  assert.equal(levels.PARTIAL.length, 854);
  assert.equal(levels.MANUAL, undefined);
  assert.equal(levels.DISABLED, undefined);
  const sourceRefs = built.skills.list().flatMap((skill) => skill.sourceRefs ?? []);
  assert.equal(sourceRefs.length, 1886);
  assert.equal(sourceRefs.filter((ref) => ref.kind === "development-image").length, 943);
  assert.equal(sourceRefs.filter((ref) => ref.kind === "chm").length, 590);
  assert.equal(sourceRefs.filter((ref) => ref.kind === "legacy").length, 353);
  const full = built.skills.list().filter((skill) => skill.supportLevel === "FULL");
  assert.deepEqual(full.filter((skill) => !built.skills.hasHandler(skill.id)), []);
  assert.deepEqual(built.skills.list().filter((skill) => skill.supportLevel !== "FULL" && built.skills.hasHandler(skill.id)), []);
});

test("内容包校验事件组内的事件卡 ID", () => {
  const base = { eventGroups: [] };
  const validCards = Array.from({ length: 20 }, (_, index) => ({ id: `event.new.${index + 1}` }));
  const valid = mergeContentPackages(base, { eventGroups: [{ id: "event-group.new", name: "新组", cards: validCards }] });
  assert.equal(valid.eventGroups[0].cards[0].id, "event.new.1");
  const duplicateCards = Array.from({ length: 19 }, (_, index) => ({ id: `event.duplicate.${index + 1}` }));
  duplicateCards.push({ id: "event.duplicate.1" });
  assert.throws(() => mergeContentPackages(base, { eventGroups: [{ id: "event-group.bad", name: "坏组", cards: duplicateCards }] }), /EVENT_GROUP_CARD_DUPLICATE/);
  assert.throws(() => mergeContentPackages(base, { eventGroups: [{ id: "event-group.bad-shape", name: "坏组", cards: "not-array" }] }), /EVENT_GROUP_CARDS_INVALID/);
});

test("内容包校验拒绝非法集合、局势和事件组结构", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const errors = validateAuthoredPackage({
    situations: "bad",
    eventGroups: [{ id: "event-group.test", cards: [{ id: "event.valid" }, { id: "event.valid" }] }],
  });
  assert.ok(errors.includes("CONTENT_COLLECTION_INVALID:situations"));
  assert.ok(errors.includes("EVENT_GROUP_CARD_DUPLICATE:event-group.test:event.valid"));
});

test("事件组必须包含恰好20张事件卡", () => {
  const base = { eventGroups: [] };
  assert.throws(() => mergeContentPackages(base, { eventGroups: [{ id: "event-group.short", name: "短组", cards: [{ id: "event.short" }] }] }), /EVENT_GROUP_CARD_COUNT_INVALID/);
});

test("文明废墟校验结构化名称、战果和属性字段", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const errors = validateAuthoredPackage({ civilizationRuins: [
    { id: "ruin.bad", name: 7, victoryPoints: "未知", typeLabel: 3, text: { bad: true } },
  ] });
  assert.ok(errors.includes("CIVILIZATION_RUIN_NAME_INVALID:ruin.bad"));
  assert.ok(errors.includes("CIVILIZATION_RUIN_VICTORY_POINTS_INVALID:ruin.bad"));
  assert.ok(errors.includes("CIVILIZATION_RUIN_TYPE_INVALID:ruin.bad"));
  assert.ok(errors.includes("CIVILIZATION_RUIN_TEXT_INVALID:ruin.bad"));
});

test("技能定义拒绝未知支持等级、激活类型和阶段窗口", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const errors = validateAuthoredPackage({ masters: [{ id: "master.skill-validation", name: "测试御主", image: "master.png", skills: [{ id: "skill.validation", name: "测试", text: "", image: "skill.png", implementation: "FULL", activation: { kind: "unknown", windows: ["action", 3] } }] }] });
  assert.ok(errors.includes("SKILL_IMPLEMENTATION_INVALID:skill.validation"));
  assert.ok(errors.includes("SKILL_ACTIVATION_INVALID:skill.validation"));
  assert.ok(errors.includes("SKILL_WINDOWS_INVALID:skill.validation"));
});

test("真名结构字段只接受布尔值且内容卡保留打出触发", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const errors = validateAuthoredPackage({ masters: [{
    id: "master.true-name-fields", name: "测试御主", image: "master.png",
    skills: [{ id: "skill.true-name-fields", name: "测试", text: "", image: "skill.png", revealsTrueNameOnPlay: "yes", revealsTrueNameOnSkillUse: 1 }],
  }] });
  assert.ok(errors.includes("SKILL_BOOLEAN_FIELD_INVALID:skill.true-name-fields:revealsTrueNameOnPlay"));
  assert.ok(errors.includes("SKILL_BOOLEAN_FIELD_INVALID:skill.true-name-fields:revealsTrueNameOnSkillUse"));

  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const built = buildStandardContent({ cards: [{ id: "card.true-name", name: "真名牌", revealsTrueNameOnPlay: true }] });
  assert.equal(built.cards["card.true-name"].revealsTrueNameOnPlay, true);
});

test("内容校验拒绝未知结构化卡牌属性", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const errors = validateAuthoredPackage({ cards: [{ id: "card.invalid-attribute", name: "测试", image: "card.png", attributes: ["防御"] }] });
  assert.ok(errors.includes("CARD_ATTRIBUTES_INVALID:card.invalid-attribute"));
  const skillErrors = validateAuthoredPackage({ masters: [{ id: "master.attribute-test", name: "测试御主", image: "master.png", skills: [{ id: "skill.attribute-test", name: "测试", text: "", image: "skill.png", attributes: ["未知"] }] }] });
  assert.ok(skillErrors.includes("SKILL_ATTRIBUTES_INVALID:skill.attribute-test"));
});

test("内容导入器将卡牌属性规范化为 canonical 值", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const built = buildStandardContent({ cards: [{ id: "card.attribute-normalized", name: "属性", attributes: ["敏捷", "魔法", "宝具"] }] });
  assert.deepEqual(built.cards["card.attribute-normalized"].attributes, ["迅捷", "魔术", "宝具"]);
  assert.throws(() => buildStandardContent({ cards: [{ id: "card.attribute-invalid", name: "属性", attributes: ["防御"] }] }), /CARD_ATTRIBUTE_INVALID/);
});

test("局势牌禁用属性使用同一 canonical 规则并拒绝未知值", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const built = buildStandardContent({ situations: [{ id: "situation.attribute-lock", mana: 1, forbiddenAttributes: ["敏捷", "魔法"] }] });
  assert.deepEqual(built.situations[0].forbiddenAttributes, ["迅捷", "魔术"]);
  assert.throws(() => buildStandardContent({ situations: [{ id: "situation.attribute-invalid", mana: 1, forbiddenAttributes: ["防御"] }] }), /CARD_ATTRIBUTE_INVALID/);
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  assert.ok(validateAuthoredPackage({ situations: [{ id: "situation.schema-invalid", mana: 1, forbiddenAttributes: ["防御"] }] }).includes("SITUATION_ATTRIBUTES_INVALID:situation.schema-invalid"));
});

test("技能导入保留结构化属性与 handlerId", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const [skill] = buildSkillDefinitions({ servants: [{ id: "servant.content", skills: [{ id: "skill.content", name: "技能", attributes: ["敏捷", "魔法"], handlerId: "handler.content", activation: { kind: "phase", windows: ["combat"] }, implementation: "pending" }] }] });
  assert.deepEqual(skill.attributes, ["迅捷", "魔术"]);
  assert.equal(skill.handlerId, "handler.content");
  assert.equal(skill.supportLevel, "PARTIAL");
});

test("英文版从者技能自动附带可追溯的 CHM 来源，未映射角色不猜来源", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const [mapped] = buildSkillDefinitions({ servants: [{ id: "servant.musashi", skills: [{ id: "skill.source.mapped", name: "技能", text: "" }] }] });
  assert.deepEqual(mapped.sourceRefs, [{
    kind: "chm",
    document: "FD全卡图鉴V2.0.chm",
    category: "servant/english",
    page: "宫本武藏1.htm",
    locator: "从者/剑士/英文版/宫本武藏1.htm",
  }]);
  const [unmapped] = buildSkillDefinitions({ servants: [{ id: "servant.albion", skills: [{ id: "skill.source.unmapped", legacyId: "legacy-1", name: "待核对", text: "" }] }] });
  assert.deepEqual(unmapped.sourceRefs, [{ kind: "legacy", document: "legacy-content.json", locator: "servant/servant.albion/legacy-1" }]);
});

test("技能来源引用结构校验拒绝伪造 CHM 分类", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const errors = validateAuthoredPackage({ masters: [{ id: "master.source", name: "测试", image: "master.png", skills: [{ id: "skill.source.bad", name: "技能", text: "", image: "skill.png", sourceRefs: [{ kind: "chm", document: "other.chm", category: "servant/chinese", page: "x.htm" }] }] }] });
  assert.ok(errors.includes("SKILL_SOURCE_REF_INVALID:skill.source.bad"));
});

test("技能导入保留显式空属性，不回退到展示标签", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const [skill] = buildSkillDefinitions({ masters: [{ id: "master.empty-attributes", skills: [{ id: "skill.empty-attributes", name: "技能", typeLabel: "宝具", attributes: [], activation: { kind: "phase", windows: ["action"] }, implementation: "pending" }] }] });
  assert.deepEqual(skill.attributes, []);
});

test("已确认的无限剑制按稳定ID使用特殊属性和正确真名触发", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const ids = [
    "servant.emiya.skill.sc-emiya-np",
    "servant.chloe.skill.sc-chloe-1",
    "servant.emiya-alt.skill.sc-emiya-alt-2",
  ];
  const skills = buildSkillDefinitions({ servants: ids.map((id, index) => ({
    id: "servant.test-" + index,
    skills: [{ id, name: "展示名称不参与规则", typeLabel: "宝具", activation: { kind: "play", windows: ["action"] }, implementation: "pending" }],
  })) });
  assert.deepEqual(skills.map((skill) => skill.attributes), [["特殊"], ["特殊"], ["特殊"]]);
  assert.deepEqual(skills.map((skill) => skill.requiresTrueName), [undefined, undefined, undefined]);
  assert.deepEqual(skills.map((skill) => skill.revealsTrueNameOnPlay), [true, true, false]);
  assert.deepEqual(skills.map((skill) => skill.supportLevel), ["PARTIAL", "PARTIAL", "PARTIAL"]);
});

test("纯牌库攻击技能复用共享出牌处理器并保留每局限制", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const definitions = buildSkillDefinitions({
    masters: content.masters
      .filter((master) => master.id === "master.kuzuki" || master.id === "master.rin")
      .map((master) => ({
        id: master.id,
        skills: (master.skills ?? []).filter((skill) =>
          skill.id === "master.kuzuki.skill.s3" || skill.id === "master.rin.skill.s4"),
      })),
    servants: content.servants
      .filter((servant) => servant.id === "servant.mandricardo")
      .map((servant) => ({
        id: servant.id,
        skills: (servant.skills ?? []).filter((skill) => skill.id === "servant.mandricardo.skill.sc-mandricardo-2"),
      })),
  });
  assert.equal(definitions.length, 3);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.card-play"));
  assert.equal(definitions.find((skill) => skill.id === "master.kuzuki.skill.s3")?.limit, undefined);
  assert.equal(definitions.find((skill) => skill.id === "master.rin.skill.s4")?.limit, "once-per-game");
});

test("仅以独立真名解放词条迁移打出后解放标记", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const definitions = buildSkillDefinitions(content);
  const marked = definitions.filter((skill) => skill.revealsTrueNameOnPlay);
  const mentionsWithoutPrefix = definitions.filter((skill) => !skill.revealsTrueNameOnPlay && skill.text.includes("【真名解放】"));
  assert.equal(marked.length, 220);
  assert.equal(mentionsWithoutPrefix.length, 28);
  assert.ok(marked.every((skill) => /^\s*【真名解放】/.test(skill.text)));
  assert.ok(mentionsWithoutPrefix.every((skill) => !/^\s*【真名解放】/.test(skill.text)));
});

test("十三张同规则战斗续行共享确认处理器且全部达到FULL", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const { confirmedBattleContinuationSkillIds } = await import("../src/content/confirmed-skill-overrides.ts");
  const rawSkills = content.servants.flatMap((servant) => servant.skills ?? []);
  const rawById = new Map(rawSkills.map((skill) => [skill.id, skill]));
  const ownersBySkill = new Map(content.servants.flatMap((servant) => (servant.skills ?? []).map((skill) => [skill.id, servant.id])));
  const definitions = buildSkillDefinitions({ servants: confirmedBattleContinuationSkillIds.map((id) => ({
    id: ownersBySkill.get(id),
    skills: [rawById.get(id)],
  })) });
  assert.equal(definitions.length, 13);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.move-to-non-workshop"));
  assert.ok(definitions.every((skill) => skill.windows.length === 1 && skill.windows[0] === "action"));
  assert.ok(definitions.every((skill) => skill.requiresActiveCard === true));
});

test("十一张同规则单独行动共享确认处理器且全部达到FULL", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const { confirmedIndependentActionSkillIds } = await import("../src/content/confirmed-skill-overrides.ts");
  const rawSkills = content.servants.flatMap((servant) => servant.skills ?? []);
  const rawById = new Map(rawSkills.map((skill) => [skill.id, skill]));
  const ownersBySkill = new Map(content.servants.flatMap((servant) => (servant.skills ?? []).map((skill) => [skill.id, servant.id])));
  const definitions = buildSkillDefinitions({ servants: confirmedIndependentActionSkillIds.map((id) => ({
    id: ownersBySkill.get(id),
    skills: [rawById.get(id)],
  })) });
  assert.equal(definitions.length, 11);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.independent-action"));
  assert.ok(definitions.every((skill) => skill.requiresActiveCard === true));
});

test("十二张同规则阵地建造使用残留触发和结构化动态费用", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const { confirmedTerritoryCreationSkillIds } = await import("../src/content/confirmed-skill-overrides.ts");
  const rawSkills = content.servants.flatMap((servant) => servant.skills ?? []);
  const rawById = new Map(rawSkills.map((skill) => [skill.id, skill]));
  const ownersBySkill = new Map(content.servants.flatMap((servant) => (servant.skills ?? []).map((skill) => [skill.id, servant.id])));
  const definitions = buildSkillDefinitions({ servants: confirmedTerritoryCreationSkillIds.map((id) => ({ id: ownersBySkill.get(id), skills: [rawById.get(id)] })) });
  assert.equal(definitions.length, 12);
  assert.ok(definitions.every((skill) => skill.activation === "residual"));
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.territory-creation"));
  assert.ok(definitions.every((skill) => skill.requiresActiveCard === true));
  assert.ok(definitions.every((skill) => JSON.stringify(skill.costRule) === JSON.stringify({ kind: "round-linear", base: 16, perRound: -2, min: 0 })));
});

test("十一张气息遮断共享战力结算后响应处理器并限制为每回合一次", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const { confirmedPresenceConcealmentSkillIds } = await import("../src/content/confirmed-skill-overrides.ts");
  const rawSkills = content.servants.flatMap((servant) => servant.skills ?? []);
  const rawById = new Map(rawSkills.map((skill) => [skill.id, skill]));
  const ownersBySkill = new Map(content.servants.flatMap((servant) => (servant.skills ?? []).map((skill) => [skill.id, servant.id])));
  const definitions = buildSkillDefinitions({ servants: confirmedPresenceConcealmentSkillIds.map((id) => ({ id: ownersBySkill.get(id), skills: [rawById.get(id)] })) });
  assert.equal(definitions.length, 11);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.presence-concealment"));
  assert.ok(definitions.every((skill) => skill.activation === "phase"));
  assert.ok(definitions.every((skill) => JSON.stringify(skill.steps) === JSON.stringify(["post-power-response"])));
  assert.ok(definitions.every((skill) => skill.limit === "once-per-round"));
});

test("十四张骑乘共享追加出牌与打出抽牌处理器", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const { confirmedRidingSkillIds } = await import("../src/content/confirmed-skill-overrides.ts");
  const rawSkills = content.servants.flatMap((servant) => servant.skills ?? []);
  const rawById = new Map(rawSkills.map((skill) => [skill.id, skill]));
  const ownersBySkill = new Map(content.servants.flatMap((servant) => (servant.skills ?? []).map((skill) => [skill.id, servant.id])));
  const definitions = buildSkillDefinitions({ servants: confirmedRidingSkillIds.map((id) => ({ id: ownersBySkill.get(id), skills: [rawById.get(id)] })) });
  assert.equal(definitions.length, 14);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.riding"));
  assert.ok(definitions.every((skill) => skill.activation === "phase"));
  assert.ok(definitions.every((skill) => skill.limit === "once-per-round"));
  assert.ok(definitions.every((skill) => skill.playDrawIfWithBasicAttack === 1));
  assert.ok(definitions.every((skill) => JSON.stringify(skill.appendFromHand) === JSON.stringify({ maxCount: 3, maxBasePower: 3 })));
});

test("十二张对魔力拆分为两个独立的结构化战斗效果", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const { confirmedSaberMagicResistanceSkillIds } = await import("../src/content/confirmed-skill-overrides.ts");
  const rawSkills = content.servants.flatMap((servant) => servant.skills ?? []);
  const rawById = new Map(rawSkills.map((skill) => [skill.id, skill]));
  const ownersBySkill = new Map(content.servants.flatMap((servant) => (servant.skills ?? []).map((skill) => [skill.id, servant.id])));
  const definitions = buildSkillDefinitions({ servants: confirmedSaberMagicResistanceSkillIds.map((id) => ({ id: ownersBySkill.get(id), skills: [rawById.get(id)] })) });
  assert.equal(definitions.length, 12);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.saber-magic-resistance"));
  assert.ok(definitions.every((skill) => skill.requiresActiveCard === true));
  assert.ok(definitions.every((skill) => skill.abilities?.map((ability) => ability.id).join(",") === "noble-bloom,magic-resistance"));
  assert.ok(definitions.every((skill) => skill.abilities?.every((ability) => ability.limit === "once-per-round" && ability.windows[0] === "combat")));
  assert.ok(definitions.every((skill) => skill.abilities?.find((ability) => ability.id === "noble-bloom")?.requiresActiveCard === false));
  assert.ok(definitions.every((skill) => skill.abilities?.find((ability) => ability.id === "magic-resistance")?.requiresActiveCard === true));
});

test("金时两张黄金冲击保留无视8魔力与局势禁用的结构化例外", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const definitions = buildSkillDefinitions({ servants: content.servants
    .filter((servant) => servant.id === "servant.kintoki")
    .map((servant) => ({ id: servant.id, skills: (servant.skills ?? []).filter((skill) => skill.id.endsWith("sc-kintoki-1") || skill.id.endsWith("sc-kintoki-2")) })) });
  assert.equal(definitions.length, 2);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.card-play"));
  assert.ok(definitions.every((skill) => skill.requiresEightMana === false));
  assert.ok(definitions.every((skill) => skill.ignoresSituationRestrictions === true));
  assert.ok(definitions.every((skill) => skill.revealsTrueNameOnPlay === true));
  assert.ok(definitions.every((skill) => skill.limit === "once-per-game"));
});

test("肯尼斯双重御主登记为开局被动并绑定8魔力豁免处理器", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.masters.find((master) => master.id === "master.kayneth");
  const definitions = buildSkillDefinitions({ masters: [{ id: raw.id, skills: [raw.skills.find((skill) => skill.id === "master.kayneth.skill.s1")] }] });
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0].activation, "passive");
  assert.equal(definitions[0].supportLevel, "FULL");
  assert.equal(definitions[0].handlerId, "core.skill-eight-mana-waiver");
});

test("韦伯战略部署保留结构化能力费用、抽牌数量和处理器", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.masters.find((master) => master.id === "master.waver");
  const definitions = buildSkillDefinitions({ masters: [{ id: raw.id, skills: [raw.skills.find((skill) => skill.id === "master.waver.skill.s2")] }] });
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0].activation, "phase");
  assert.deepEqual(definitions[0].windows, ["outpost"]);
  assert.equal(definitions[0].abilityCost, 1);
  assert.equal(definitions[0].drawCount, 2);
  assert.equal(definitions[0].supportLevel, "FULL");
  assert.equal(definitions[0].handlerId, "core.pay-mana-draw");
});

test("内容包保留御主初始魔力配置", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const built = buildStandardContent({
    masters: [{ id: "master.shirou", initialMana: 2 }, { id: "master.illya", initialMana: 6 }, { id: "master.default" }],
  });
  assert.deepEqual(built.masterInitialMana, { "master.shirou": 2, "master.illya": 6 });
});

test("慎二吸魔命令保留进入深山町被动的结构化位置与魔力值", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.masters.find((master) => master.id === "master.shinji");
  const skill = raw.skills.find((item) => item.id === "master.shinji.skill.s1");
  const definitions = buildSkillDefinitions({ masters: [{ id: raw.id, skills: [skill] }] });
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0].activation, "passive");
  assert.equal(definitions[0].handlerId, "core.enter-location-gain-mana");
  assert.equal(definitions[0].locationId, "mountain");
  assert.equal(definitions[0].manaGain, 1);
  assert.equal(definitions[0].supportLevel, "FULL");
});
