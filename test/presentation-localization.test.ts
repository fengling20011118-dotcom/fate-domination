import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildStandardContent } from "../src/content/content-package.ts";
import { GameApplication } from "../src/application/game-application.ts";
import {
  localizeActionLabel,
  localizePendingDecision,
  localizePlayerFacingLabel,
  localizePlayerFacingText,
  localizeSkillActionLabel,
} from "../src/projection/presentation-localization.ts";

test("玩家显示层将地点、资源和常用操作统一为中文", () => {
  assert.equal(localizePlayerFacingLabel("Mountain", "mountain"), "深山町");
  assert.equal(localizePlayerFacingLabel("Shinto", "city"), "新都");
  assert.equal(localizePlayerFacingLabel("Workshop", "workshop"), "魔术工房");
  assert.equal(localizePlayerFacingLabel("Scouting", "scouting"), "侦察");
  assert.equal(localizePlayerFacingLabel("Decline", "decline"), "不发动");
  assert.equal(localizePlayerFacingLabel("Gain 3 mana", "gain"), "获得3点魔力");
  assert.equal(localizePlayerFacingLabel("Pay 2 VP", "pay"), "支付2点战果");
  assert.equal(localizePlayerFacingLabel("Draw 2", "draw"), "抽2张牌");
  assert.equal(localizePlayerFacingLabel("Wisdom 4", "wisdom"), "才智 4");
  assert.equal(localizePlayerFacingLabel("Charlemagne"), "查理曼");
  assert.equal(localizePlayerFacingLabel("Dr. Henry Jekyll"), "亨利·杰基尔博士");
  assert.equal(localizePlayerFacingLabel("Queenside Castle"), "王城奇袭");
  assert.equal(localizePlayerFacingLabel("Ridicule Cat"), "嘲弄猫");
  assert.equal(localizePlayerFacingLabel("对魔力（Saber Class）"), "对魔力（剑士职阶）");
  assert.equal(localizePlayerFacingLabel("单独行动（Archer Class）"), "单独行动（弓兵职阶）");
  assert.equal(localizePlayerFacingLabel("骑乘（Rider Class）"), "骑乘（骑兵职阶）");
  assert.equal(localizePlayerFacingLabel("阵地建造（Caster Class）"), "阵地建造（魔术师职阶）");
  assert.equal(localizePlayerFacingLabel("气息遮断（Assassin Class）"), "气息遮断（暗杀者职阶）");
  assert.equal(localizePlayerFacingLabel("他人格（Alter Ego Class）"), "他人格");
  assert.equal(localizePlayerFacingLabel("伪装者（Pretender Class）"), "伪装者");
  assert.equal(localizePlayerFacingLabel("复仇者职阶卡（Avenger Class）"), "复仇者职阶卡");
  assert.equal(localizePlayerFacingLabel("赫拉克勒斯 (Attack)"), "赫拉克勒斯（攻击）");
  assert.equal(localizePlayerFacingLabel("病弱（Weak Constitution）"), "病弱");
});

test("技能按钮优先使用中文能力名，未确认译名时退回中文阶段能力", () => {
  assert.equal(localizeSkillActionLabel({
    skillName: "告死天使",
    abilityName: "Final Bell Toll",
    abilityWindows: ["combat"],
    currentPhase: "combat",
  }), "告死天使·晚钟");
  assert.equal(localizeSkillActionLabel({
    skillName: "测试技能",
    abilityName: "Untranslated Internal Ability",
    abilityWindows: ["action"],
    currentPhase: "action",
    ordinal: 1,
    sameWindowCount: 2,
  }), "测试技能·行动阶段能力2");
  assert.doesNotMatch(localizeSkillActionLabel({
    skillName: "测试技能",
    abilityName: "Untranslated Internal Ability",
    abilityWindows: ["combat"],
    currentPhase: "combat",
  }), /[A-Za-z]{2,}/);
});

test("前端动作不暴露内部命令和决策 kind", () => {
  assert.equal(localizeActionLabel("decision.resolve", "decision.resolve"), "确认选择");
  assert.equal(localizeActionLabel("sakura-corrosion-servant-skills", "decision.resolve"), "确认选择");
  assert.equal(localizeActionLabel(undefined, "player.move"), "移动");
  assert.equal(localizeActionLabel(undefined, "command-seal.use"), "使用令咒");
});

test("待决策投影只改显示文本，不改稳定选项 ID", () => {
  const decision = localizePendingDecision({
    decisionId: "d1",
    ownerPlayerId: "p1",
    chooserPlayerIds: ["p1"],
    kind: "internal-kind",
    options: [
      { id: "mountain", label: "Mountain" },
      { id: "decline", label: "Decline" },
      { id: "mana", label: "Gain 2 mana" },
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    submissions: {},
  });
  assert.deepEqual(decision.options.map((option) => option.id), ["mountain", "decline", "mana"]);
  assert.deepEqual(decision.options.map((option) => option.label), ["深山町", "不发动", "获得2点魔力"]);
});

test("动态英文选择模板在实际数值和地点下全部中文化", () => {
  const cases = new Map([
    ["Draw 2", "抽2张牌"],
    ["Gain 10 mana", "获得10点魔力"],
    ["Wisdom 2", "才智 2"],
    ["Place Break Bounded Field at mountain", "将【结界破坏】放置于深山町"],
    ["令咒：移动至city", "令咒：移动至新都"],
    ["Event A @ workshop", "Event A · 魔术工房"],
    ["Clue: Culprit", "线索：犯人"],
  ]);
  for (const [raw, expected] of cases) assert.equal(localizePlayerFacingLabel(raw), expected);
});

test("Goetia与美游衍生牌使用开发版中文展示文本", () => {
  assert.equal(localizePlayerFacingLabel("Demon God Baal"), "魔神柱巴力");
  assert.equal(localizePlayerFacingLabel("Demon God Barbatos"), "魔神柱巴巴妥司");
  assert.equal(localizePlayerFacingLabel("Card Selection"), "卡牌选择");
  assert.equal(localizePlayerFacingLabel("Saber Install"), "梦幻召唤-剑士");
  assert.equal(localizePlayerFacingLabel("Caster Install"), "梦幻召唤-魔术师");
  assert.equal(localizePlayerFacingText(
    "Passive/Outpost: Discard this card. Draw 2 cards. Passive/Outpost: Exchange this card with a card from a drawn Servant deck or a Miyu Install from outside the game.",
  ), "被动/前哨阶段：弃置此牌，抽2张牌。\n被动/前哨阶段：将此牌与游戏开始时你所抽取从者的牌堆中的牌或游戏外的【梦幻召唤】交换。");
  assert.equal(localizePlayerFacingText(
    "Only play 1 [Install] per turn. <Once Per Game> Action: Double your terrain advantage.",
  ), "每回合只能进行1次【梦幻召唤】<每局游戏限一次>。行动阶段：将你的地利翻倍。");
});

test("完整正式内容经前端卡牌出口后不再泄漏普通英文名称或正文", () => {
  const contentPath = fileURLToPath(new URL("../src/content/generated/legacy-content.json", import.meta.url));
  const raw = JSON.parse(readFileSync(contentPath, "utf8"));
  const content = buildStandardContent(raw);
  const app = GameApplication.create({ gameInstanceId: "zh-display-audit", players: [{ id: "p1", name: "测试" }], seed: 1, content });
  const definitions = app.cardDefinitions();
  const properTerms = /\b(?:EX|CCC|NFF|NF|Extella|Extra|Link|Alter|Prototype|VIII|W|F|D|B|Dies|Irae)\b/gi;
  const leakedNames: string[] = [];
  const leakedTexts: string[] = [];
  const leakedSkillActions: string[] = [];
  for (const definition of Object.values(definitions)) {
    const name = String(definition.name ?? "").replace(properTerms, "");
    if (/[A-Za-z]{2,}/.test(name)) leakedNames.push(`${definition.id}:${definition.name}`);
    const text = String(definition.text ?? "").replace(properTerms, "");
    if (/[A-Za-z]{3,}/.test(text)) leakedTexts.push(`${definition.id}:${definition.text}`);
  }
  for (const skill of content.skills.list()) {
    const abilities = skill.abilities?.length ? skill.abilities : [undefined];
    for (const ability of abilities) {
      const label = localizeSkillActionLabel({
        skillName: skill.name,
        abilityName: ability?.name,
        abilityWindows: ability?.windows,
        currentPhase: ability?.windows?.[0],
      }).replace(properTerms, "");
      if (/[A-Za-z]{2,}/.test(label)) leakedSkillActions.push(`${skill.id}:${ability?.id ?? "default"}:${label}`);
    }
  }
  assert.deepEqual(leakedNames, []);
  assert.deepEqual(leakedTexts, []);
  assert.deepEqual(leakedSkillActions, []);
});

test("地图源码使用 UTF-8 中文且不再包含旧编码乱码", () => {
  const path = fileURLToPath(new URL("../src/map/MapView.js", import.meta.url));
  const source = readFileSync(path, "utf8");
  for (const label of ["冬木市地图", "局势牌", "魔术工房", "事件牌", "深山町", "侦察", "新都"]) {
    assert.match(source, new RegExp(label));
  }
  assert.doesNotMatch(source, /鍐|榄|娣|渚|鏂|鈻|鈼|�/);
});

test("src 源码不含已知编码乱码或成片问号占位", () => {
  const srcRoot = fileURLToPath(new URL("../src", import.meta.url));
  const bad: string[] = [];
  const scan = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        scan(path);
        continue;
      }
      if (!/\.(?:ts|js|json|md)$/i.test(entry.name)) continue;
      const source = readFileSync(path, "utf8");
      if (/\?{4,}|鍐|榄|娣|渚|鏂|鈻|鈼|锟|烫烫|屯屯|�|Ã|Â|â€|â€”|â€“|ï¿½/.test(source)) bad.push(path);
    }
  };
  scan(srcRoot);
  assert.deepEqual(bad, []);
});
