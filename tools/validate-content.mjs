import { readFile } from "node:fs/promises";
import { isStableId } from "../src/content/schema.js";
import { MAP_LOCATIONS } from "../src/map/locations.js";

const errors = [];
const warnings = [];
for (const [key, location] of Object.entries(MAP_LOCATIONS)) {
  if (key !== location.id) errors.push(`地图地点键与 ID 不一致：${key}`);
  if (!isStableId(`map.${location.id}`)) errors.push(`地图地点 ID 不稳定：${location.id}`);
}

let content;
let sourceIndex;
let developmentImageIndex;
try {
  content = JSON.parse(
    await readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"),
  );
} catch (error) {
  errors.push(`无法读取迁移内容快照：${error.message}`);
}

try {
  sourceIndex = JSON.parse(
    await readFile(new URL("../src/content/generated/english-servant-sources.json", import.meta.url), "utf8"),
  );
  if (sourceIndex.categoryRule !== "从者/<职阶>/英文版 的直接子节点") {
    errors.push("英文版从者索引分类规则不匹配");
  }
} catch (error) {
  warnings.push(`缺少备用 CHM 从者图鉴索引：${error.message}`);
}

try {
  developmentImageIndex = JSON.parse(
    await readFile(new URL("../src/content/generated/development-image-sources.json", import.meta.url), "utf8"),
  );
  if (developmentImageIndex.source !== "Fate_Domination-开发版/images") {
    errors.push("开发版角色卡图索引来源不匹配");
  }
} catch (error) {
  errors.push(`无法读取开发版角色卡图索引：${error.message}`);
}

if (content) {
  const allIds = [
    ...content.masters.flatMap((master) => [master.id, ...master.skills.map((skill) => skill.id)]),
    ...content.servants.flatMap((servant) => [servant.id, ...servant.skills.map((skill) => skill.id)]),
    ...content.cards.map((card) => card.id),
    ...content.situations.map((situation) => situation.id),
    ...content.eventGroups.flatMap((group) => [group.id, ...group.cards.map((card) => card.id)]),
    ...content.civilizationRuins.map((card) => card.id),
  ];
  const seen = new Set();
  for (const id of allIds) {
    if (!isStableId(id)) errors.push(`ID 格式不合法：${id}`);
    if (seen.has(id)) errors.push(`ID 重复：${id}`);
    seen.add(id);
  }

  for (const servant of content.servants) {
    if (servant.deck.length !== 12) {
      warnings.push(`从者【${servant.name}】牌库不是 12 张：${servant.deck.length}`);
    }
    for (const cardId of servant.deck) {
      if (!content.cards.some((card) => card.id === cardId)) {
        errors.push(`从者【${servant.name}】引用了不存在的牌：${cardId}`);
      }
    }
  }

  if (sourceIndex) {
    const exactSources = new Map(
      (sourceIndex.entries ?? [])
        .filter((entry) => entry.matchStatus === "exact" && entry.servantId)
        .map((entry) => [entry.servantId, entry]),
    );
    for (const servant of content.servants) {
      const entry = exactSources.get(servant.id);
      if (!entry) continue;
      const expectedLocator = `从者/${entry.className}/英文版/${entry.sourcePage}`;
      for (const skill of servant.skills ?? []) {
        const refs = skill.sourceRefs;
        const valid = Array.isArray(refs) && refs.some((ref) =>
          ref?.kind === "chm" && ref.document === "FD全卡图鉴V2.0.chm" &&
          ref.category === "servant/english" && ref.page === entry.sourcePage &&
          ref.locator === expectedLocator,
        );
        if (!valid) errors.push(`已登记的 CHM 从者技能缺少有效备用图鉴来源：${skill.id}`);
      }
    }
  }

  if (developmentImageIndex) {
    const entries = developmentImageIndex.entries ?? [];
    const byOwnerId = new Map(entries.map((entry) => [entry.ownerId, entry]));
    const owners = [
      ...content.masters.map((master) => ({ ...master, ownerType: "master" })),
      ...content.servants.map((servant) => ({ ...servant, ownerType: "servant" })),
    ];
    if (entries.length !== owners.length) errors.push(`开发版角色卡图索引数量不匹配：${entries.length}/${owners.length}`);
    for (const owner of owners) {
      const entry = byOwnerId.get(owner.id);
      if (!entry || entry.ownerType !== owner.ownerType || entry.ownerName !== owner.name || entry.matchStatus !== "exact-name") {
        errors.push(`开发版角色卡图索引缺失或归属错误：${owner.id}`);
        continue;
      }
      const expectedPath = `images/${owner.ownerType === "master" ? "masters" : "servants"}/${owner.name}.png`;
      if (entry.imagePath !== expectedPath) errors.push(`开发版角色卡图路径不匹配：${owner.id}`);
      const expectedSkillIds = (owner.skills ?? []).map((skill) => skill.id);
      if (JSON.stringify(entry.skillIds) !== JSON.stringify(expectedSkillIds)) errors.push(`开发版角色技能归属不匹配：${owner.id}`);
      for (const skill of owner.skills ?? []) {
        const valid = skill.sourceRefs?.some((ref) => ref?.kind === "development-image"
          && ref.document === "Fate_Domination-开发版"
          && ref.category === owner.ownerType
          && ref.page === expectedPath
          && ref.locator === `${owner.id}/${owner.name}`);
        if (!valid) errors.push(`技能缺少开发版卡图来源：${skill.id}`);
      }
    }
  }

  for (const group of content.eventGroups) {
    if (group.cards.length !== 20) {
      errors.push(`事件组【${group.name}】不是 20 张：${group.cards.length}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  if (warnings.length) console.warn(`迁移警告：\n${warnings.join("\n")}`);
  console.log(
    `内容结构检查通过：${Object.keys(MAP_LOCATIONS).length} 个地图地点，` +
      `${content.masters.length} 名御主，${content.servants.length} 名从者。`,
  );
}
