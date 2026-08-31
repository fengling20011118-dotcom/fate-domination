import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultExtractRoot = resolve(projectRoot, "..", "_chm_extract");
const extractRoot = process.env.FD_CHM_EXTRACT_ROOT || defaultExtractRoot;
const hhcPath = resolve(extractRoot, "FD全卡图鉴V2.0.hhc");
const contentPath = resolve(projectRoot, "src", "content", "generated", "legacy-content.json");
const outputPath = resolve(projectRoot, "src", "content", "generated", "english-servant-sources.json");

const hhc = new TextDecoder("gbk").decode(await readFile(hhcPath));
const content = JSON.parse(await readFile(contentPath, "utf8"));
const root = parseContentsTree(hhc);
const servantRoot = findServantRoot(root);
if (!servantRoot) throw new Error("CHM_SERVANT_ROOT_NOT_FOUND");

const classMap = {
  "剑士": "Saber",
  "枪兵": "Lancer",
  "弓兵": "Archer",
  "骑兵": "Rider",
  "魔术师": "Caster",
  "暗匿者": "Assassin",
  "狂战士": "Berserker",
  "裁定者": "Ruler",
  "复仇者": "Avenger",
  "他人格": "Alterego",
  "月之癌": "MoonCancer",
  "降临者": "Foreigner",
  "盾兵": "Shielder",
  "兽": "Beast",
};
const sourceAliases = {
  "剑士/Sigurd.htm": "servant.sigurd",
  "剑士/阿尔托莉雅·潘德拉贡[Alter.htm": "servant.artoria-alt",
  "剑士/查理曼.htm": "servant.charlemagne",
  "弓兵/卫宫(Alter.htm": "servant.emiya-alt",
  "魔术师/吉尔伽美什2.htm": "servant.kinggil",
  "暗匿者/亨利·杰基尔博士.htm": "servant.jekyll",
  "狂战士/阿周那(Alter).htm": "servant.arjuna",
  "狂战士/库·丘林〔Alter].htm": "servant.cu-alter",
  "裁定者/阿摩耳〔卡莲].htm": "servant.amor",
  "复仇者/贞德〔Alter_].htm": "servant.jeanne-alter",
  "他人格/冲田总司(〔Alter_].htm": "servant.okita-alt",
};

const englishEntries = [];
for (const classNode of servantRoot.children) {
  const englishNode = classNode.children.find((node) => node.name === "英文版");
  if (!englishNode) continue;
  for (const servantNode of englishNode.children) {
    englishEntries.push({ className: classNode.name, name: servantNode.name, sourcePage: servantNode.local });
  }
}

const contentByName = new Map();
for (const servant of content.servants ?? []) {
  const list = contentByName.get(servant.name) ?? [];
  list.push(servant);
  contentByName.set(servant.name, list);
}

const rows = englishEntries.map((entry) => {
  const matches = contentByName.get(entry.name) ?? [];
  const aliasId = sourceAliases[entry.className + "/" + entry.sourcePage];
  const aliasMatch = aliasId ? (content.servants ?? []).find((servant) => servant.id === aliasId) : undefined;
  const effectiveMatches = aliasMatch ? [aliasMatch] : matches;
  const expectedClass = classMap[entry.className] ?? null;
  const classMatches = effectiveMatches.filter((servant) => !expectedClass || normalizeClass(servant.class) === normalizeClass(expectedClass));
  const classMismatch = effectiveMatches.length > 0 && classMatches.length === 0;
  return {
    ...entry,
    expectedClass,
    servantId: effectiveMatches.length === 1 && !classMismatch ? effectiveMatches[0].id : null,
    matchStatus: classMismatch ? "class-mismatch" : effectiveMatches.length === 1 ? "exact" : effectiveMatches.length === 0 ? "unresolved" : "ambiguous",
    ...(effectiveMatches.length > 1 ? { candidateIds: effectiveMatches.map((servant) => servant.id) } : {}),
    ...(aliasMatch ? { mappingSource: "explicit-alias" } : {}),
  };
});

const mappedIds = rows.flatMap((row) => row.servantId ? [row.servantId] : []);
const duplicateIds = [...new Set(mappedIds.filter((id, index) => mappedIds.indexOf(id) !== index))];
const runtimeNotInEnglishIndex = (content.servants ?? [])
  .filter((servant) => !mappedIds.includes(servant.id))
  .map((servant) => ({ id: servant.id, name: servant.name, class: servant.class }));
const report = {
  schemaVersion: 1,
  source: "FD全卡图鉴V2.0.chm/FD全卡图鉴V2.0.hhc",
  categoryRule: "从者/<职阶>/英文版 的直接子节点",
  counts: {
    englishEntries: rows.length,
    exactMatches: rows.filter((row) => row.matchStatus === "exact").length,
    unresolved: rows.filter((row) => row.matchStatus === "unresolved").length,
    ambiguous: rows.filter((row) => row.matchStatus === "ambiguous").length,
    classMismatches: rows.filter((row) => row.matchStatus === "class-mismatch").length,
    duplicateMappedIds: duplicateIds.length,
    runtimeNotInEnglishIndex: runtimeNotInEnglishIndex.length,
    runtimeServants: (content.servants ?? []).length,
  },
  duplicateMappedIds: duplicateIds,
  runtimeNotInEnglishIndex,
  entries: rows,
};

// Persist only exact English-branch mappings into the generated content. This
// is provenance metadata and never participates in rule execution.
const exactSources = new Map(
  rows
    .filter((row) => row.matchStatus === "exact" && row.servantId)
    .map((row) => [row.servantId, {
      kind: "chm",
      document: "FD全卡图鉴V2.0.chm",
      category: "servant/english",
      page: row.sourcePage,
      locator: `从者/${row.className}/英文版/${row.sourcePage}`,
    }]),
);
let sourceRefsApplied = 0;
let legacySourceRefsApplied = 0;
for (const servant of content.servants ?? []) {
  const source = exactSources.get(servant.id);
  if (!source) continue;
  for (const skill of servant.skills ?? []) {
    skill.sourceRefs = [structuredClone(source)];
    sourceRefsApplied += 1;
  }
}
for (const ownerType of ["masters", "servants"]) {
  for (const owner of content[ownerType] ?? []) {
    for (const skill of owner.skills ?? []) {
      if (Array.isArray(skill.sourceRefs) && skill.sourceRefs.length > 0) continue;
      if (typeof skill.legacyId !== "string" || !skill.legacyId) continue;
      skill.sourceRefs = [{
        kind: "legacy",
        document: "legacy-content.json",
        locator: `${ownerType === "masters" ? "master" : "servant"}/${owner.id}/${skill.legacyId}`,
      }];
      legacySourceRefsApplied += 1;
    }
  }
}
report.counts.sourceRefsApplied = sourceRefsApplied;
report.counts.legacySourceRefsApplied = legacySourceRefsApplied;
report.counts.totalSourceRefs = sourceRefsApplied + legacySourceRefsApplied;

await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
await writeFile(contentPath, JSON.stringify(content, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report.counts, null, 2));
for (const row of rows.filter((entry) => entry.matchStatus !== "exact")) {
  console.log(row.matchStatus + ": " + row.className + "/" + row.name + " -> " + row.sourcePage);
}
if (duplicateIds.length) console.log("duplicate ids: " + duplicateIds.join(", "));
for (const servant of runtimeNotInEnglishIndex) console.log("runtime-unmapped: " + servant.id + " / " + servant.name + " / " + servant.class);

function parseContentsTree(source) {
  const rootNode = { name: "__root__", local: null, children: [] };
  const stack = [rootNode];
  let lastNode = null;
  const tokenPattern = /<OBJECT\b[^>]*>[\s\S]*?<\/OBJECT>|<UL>|<\/UL>/gi;
  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    if (/^<UL>/i.test(token)) {
      // WinCHM wraps the entire contents tree in a root UL before the first OBJECT.
      stack.push(lastNode ?? stack.at(-1));
      lastNode = null;
      continue;
    }
    if (/^<\/UL>/i.test(token)) {
      if (stack.length === 1) throw new Error("CHM_TREE_UNBALANCED");
      stack.pop();
      lastNode = null;
      continue;
    }
    const name = readParam(token, "Name");
    if (!name) continue;
    const node = { name, local: readParam(token, "Local"), children: [] };
    stack.at(-1).children.push(node);
    lastNode = node;
  }
  if (stack.length !== 1) throw new Error("CHM_TREE_UNBALANCED");
  return rootNode;
}

function findServantRoot(node) {
  if (node.name === "从者" && node.children.some((child) => child.name === "剑士")) return node;
  for (const child of node.children) {
    const match = findServantRoot(child);
    if (match) return match;
  }
  return null;
}

function normalizeClass(value) {
  return String(value ?? "").replace(/[\s_-]/g, "").toLowerCase();
}

function readParam(objectHtml, name) {
  const pattern = new RegExp('<param\\s+name=["\\\']' + name + '["\\\']\\s+value=["\\\']([^"\\\']*)["\\\']', "i");
  return objectHtml.match(pattern)?.[1] ?? null;
}
