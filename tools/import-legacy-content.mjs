import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(toolDir, "..");
const legacyDir = path.resolve(projectDir, "..", "Fate_Domination-开发版");
const outputDir = path.join(projectDir, "src", "content", "generated");
const outputFile = path.join(outputDir, "legacy-content.json");
const inventoryFile = path.join(projectDir, "docs", "content-inventory.md");

const sourceFiles = [
  "data_core.js",
  "data_cards.js",
  "data_masters.js",
  "data_servants.js",
  "batch_saber_archer.js",
  "batch_lancer_rider.js",
  "batch_caster_assassin.js",
  "batch_berserker_extra.js",
];

const context = vm.createContext({ console, window: {} });
for (const sourceFile of sourceFiles) {
  const source = await readFile(path.join(legacyDir, sourceFile), "utf8");
  vm.runInContext(source, context, { filename: sourceFile });
}

vm.runInContext(
  `{
    const rawCardBatches = [BATCH_RAWCARDS_SA, BATCH_RAWCARDS_LR, BATCH_RAWCARDS_CA, BATCH_RAWCARDS_BE];
    for (const batch of rawCardBatches) {
      for (const [id, card] of Object.entries(batch)) {
        DB.cards[id] = {
          id,
          name: card[0],
          cost: card[1],
          power: card[2],
          type: card[3],
          desc: card[4] || "基础攻击卡牌"
        };
      }
    }

    const servantBatches = [BATCH_SERVANTS_SA, BATCH_SERVANTS_LR, BATCH_SERVANTS_CA, BATCH_SERVANTS_BE];
    const existingServants = new Set(DB.servants.map(servant => servant.class + "|" + servant.trueName));
    for (const batch of servantBatches) {
      for (const servant of batch) {
        const key = servant.class + "|" + servant.trueName;
        if (!existingServants.has(key)) {
          existingServants.add(key);
          DB.servants.push(servant);
        }
      }
    }
  }`,
  context,
);

vm.runInContext(
  `globalThis.__legacyContent = {
    masters: DB.masters,
    servants: DB.servants,
    cards: DB.cards,
    situations: DB.situations,
    eventGroups: EVENT_GROUPS,
    civilizationRuins: CIVILIZATION_RUINS_EVENTS
  }`,
  context,
);

const legacy = structuredClone(context.__legacyContent);

function normalizedCardId(legacyId) {
  return `card.${String(legacyId).replaceAll("_", "-").toLowerCase()}`;
}

function masterId(legacyId) {
  return `master.${String(legacyId).replace(/^m_/, "").replaceAll("_", "-").toLowerCase()}`;
}

function servantId(servant, index) {
  const firstSkillId = servant.skillCards?.[0]?.id ?? "";
  const match = firstSkillId.match(/^sc_(.+?)(?:_\d+|_[a-z])$/i);
  const candidate = match?.[1]?.replaceAll("_", "-").toLowerCase();
  return candidate ? `servant.${candidate}` : `servant.legacy-${index + 1}`;
}

// Card-image-confirmed deck correction: Misfortune is in Lakshmi Bai's
// 12-card deck; the extra card in the legacy data is cardA2.
const DECK_OVERRIDES = Object.freeze({
  "servant.lakshmibai": ["cardB2", "cardB3", "cardB3", "cardQ1", "cardQ2", "cardQ4", "cardQ4", "cardA1", "x_misfortune", "cardSurveil", "cardPreparation", "cardPreparation"],
});

function inferActivation(type = "", description = "") {
  const text = `${type}\n${description}`;
  const windows = [];
  const windowNames = {
    准备: "preparation",
    前哨: "outpost",
    行动: "action",
    战斗: "combat",
  };
  for (const [label, value] of Object.entries(windowNames)) {
    if (text.includes(`${label}阶段`) || type.includes(label)) windows.push(value);
  }

  let kind = "play";
  if (/被动[／/]\s*(准备|前哨|行动|战斗)/.test(text)) kind = "optional-trigger";
  else if (String(type).includes("被动")) kind = "passive";
  else if (String(type).includes("残留") || text.includes("残留：")) kind = "residual";
  else if (windows.length) kind = "active";

  return {
    kind,
    windows,
    migrationConfidence: "inferred",
  };
}

function normalizeSkill(ownerId, skill, slot) {
  const localId = skill.id ?? `slot-${slot + 1}`;
  const text = skill.desc ?? "";
  return {
    id: `${ownerId}.skill.${String(localId).replaceAll("_", "-").toLowerCase()}`,
    legacyId: skill.id ?? null,
    name: skill.name,
    typeLabel: skill.type ?? "",
    cost: skill.cost ?? null,
    requirement: skill.req ?? null,
    basePower: skill.power ?? null,
    text,
    revealsTrueNameOnPlay: /^\s*【真名解放】/.test(text) || undefined,
    revealsTrueNameOnSkillUse: /被动[／/][^\n]*【真名解放】/.test(text) || undefined,
    activation: inferActivation(skill.type, skill.desc),
    implementation: "pending",
  };
}

const masters = legacy.masters.map((master) => {
  const id = masterId(master.id);
  const skills = (master.skills ?? []).map((skill, index) => normalizeSkill(id, skill, index));
  if (master.ascensionSkill) {
    skills.push({
      ...normalizeSkill(id, { id: "ascension", ...master.ascensionSkill }, skills.length),
      tags: ["ascension"],
    });
  }
  return {
    id,
    legacyId: master.id,
    name: master.name,
    initialMana: master.initMana ?? 4,
    skills,
  };
});

const servantIds = new Set();
const servants = legacy.servants.map((servant, index) => {
  let id = servantId(servant, index);
  if (servantIds.has(id)) id = `${id}-${index + 1}`;
  servantIds.add(id);
  return {
    id,
    name: servant.trueName,
    class: servant.class,
    deck: (DECK_OVERRIDES[id] ?? servant.deck ?? []).map(normalizedCardId),
    skills: (servant.skillCards ?? []).map((skill, skillIndex) =>
      normalizeSkill(id, skill, skillIndex),
    ),
  };
});

const cards = Object.values(legacy.cards).map((card) => ({
  id: normalizedCardId(card.id),
  legacyId: card.id,
  name: card.name,
  cost: card.cost,
  basePower: card.power,
  typeLabel: card.type,
  basic: isBasicCard(card),
  text: card.desc,
}));

function isBasicCard(card) {
  return card.desc === "基础攻击卡牌" || ["幸运", "远隔操作", "急行"].includes(card.name);
}

const eventGroups = legacy.eventGroups.map((group) => ({
  id: `event-group.${String(group.id).toLowerCase()}`,
  legacyId: group.id,
  name: group.name,
  cards: group.cards.map((card, index) => ({
    id: `event.${String(group.id).toLowerCase()}.${index + 1}`,
    legacyId: card.id,
    name: card.name,
    victoryPoints: card.vp,
    text: card.desc,
    implementation: "pending",
  })),
}));

const civilizationRuins = legacy.civilizationRuins.map((card, index) => ({
  id: `event.civilization-ruins.${index + 1}`,
  legacyId: card.id,
  name: card.name,
  victoryPoints: card.vp,
  typeLabel: card.type,
  text: card.desc,
  implementation: "pending",
}));

const content = {
  generatedAt: new Date().toISOString(),
  warning: "迁移核对快照。activation 为机器推断，不能作为最终规则裁定。",
  masters,
  servants,
  cards,
  situations: legacy.situations.map((situation) => ({
    id: `situation.${situation.id}`,
    legacyId: situation.id,
    name: situation.name,
    mana: situation.mana,
    climax: Boolean(situation.isClimax),
    text: situation.desc,
    implementation: "pending",
  })),
  eventGroups,
  civilizationRuins,
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, `${JSON.stringify(content, null, 2)}\n`, "utf8");

const masterSkills = masters.reduce((count, master) => count + master.skills.length, 0);
const servantSkills = servants.reduce((count, servant) => count + servant.skills.length, 0);
const deckSizeWarnings = servants
  .filter((servant) => servant.deck.length !== 12)
  .map((servant) => `- 从者【${servant.name}】旧版牌库为 ${servant.deck.length} 张，需要按卡图或规则确认。`);

const inventory = `# 旧版内容迁移清单

本清单由 \`tools/import-legacy-content.mjs\` 从旧开发版数据文件生成。数量用于防止重构漏项，不代表对应规则已经实现。

## 总量

- 御主：${masters.length}
- 御主技能（含升华技）：${masterSkills}
- 从者：${servants.length}
- 从者技能卡：${servantSkills}
- 基础及特殊卡牌定义：${content.cards.length}
- 局势牌：${content.situations.length}
- 普通事件组：${content.eventGroups.length}
- 普通事件牌：${content.eventGroups.reduce((count, group) => count + group.cards.length, 0)}
- 文明废墟专用事件：${content.civilizationRuins.length}

## 迁移状态

- 数据已建立稳定 ID：完成
- 卡面文本已保存为展示字段：完成
- 技能发动类型机器初筛：完成，仅作人工迁移提示
- 每项技能规则处理器：待逐项实现和测试
- 卡图资源映射：待建立
- FQA 裁定映射：待建立

## 数据警告

${deckSizeWarnings.length ? deckSizeWarnings.join("\n") : "- 未发现牌库张数异常。"}
`;

await writeFile(inventoryFile, inventory, "utf8");

console.log(
  JSON.stringify(
    {
      outputFile,
      inventoryFile,
      masters: masters.length,
      masterSkills,
      servants: servants.length,
      servantSkills,
      cards: content.cards.length,
      situations: content.situations.length,
      eventGroups: content.eventGroups.map((group) => ({ id: group.id, cards: group.cards.length })),
    },
    null,
    2,
  ),
);
