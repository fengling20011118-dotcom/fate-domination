import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(toolDir, "..");
const developmentDir = path.resolve(projectDir, "..", "Fate_Domination-开发版");
const contentPath = path.join(projectDir, "src", "content", "generated", "legacy-content.json");
const outputPath = path.join(projectDir, "src", "content", "generated", "development-image-sources.json");

const content = JSON.parse(await readFile(contentPath, "utf8"));
const groups = [
  { collection: "masters", ownerType: "master", directory: "masters" },
  { collection: "servants", ownerType: "servant", directory: "servants" },
];

const entries = [];
for (const group of groups) {
  const imageDir = path.join(developmentDir, "images", group.directory);
  const files = (await readdir(imageDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => entry.name);
  const filesByBaseName = new Map(files.map((file) => [path.parse(file).name, file]));

  for (const owner of content[group.collection] ?? []) {
    const file = filesByBaseName.get(owner.name);
    const relativePath = file ? `images/${group.directory}/${file}` : null;
    if (relativePath) await access(path.join(developmentDir, ...relativePath.split("/")));
    entries.push({
      ownerType: group.ownerType,
      ownerId: owner.id,
      ownerName: owner.name,
      imagePath: relativePath,
      matchStatus: relativePath ? "exact-name" : "missing",
      skillIds: (owner.skills ?? []).map((skill) => skill.id),
    });
  }
}

const exactEntries = entries.filter((entry) => entry.matchStatus === "exact-name");
const sourceByOwnerId = new Map(exactEntries.map((entry) => [entry.ownerId, {
  kind: "development-image",
  document: "Fate_Domination-开发版",
  category: entry.ownerType,
  page: entry.imagePath,
  locator: `${entry.ownerId}/${entry.ownerName}`,
}]));
let sourceRefsApplied = 0;
for (const group of groups) {
  for (const owner of content[group.collection] ?? []) {
    const source = sourceByOwnerId.get(owner.id);
    if (!source) continue;
    for (const skill of owner.skills ?? []) {
      const otherRefs = (skill.sourceRefs ?? []).filter((ref) => ref.kind !== "development-image");
      skill.sourceRefs = [structuredClone(source), ...otherRefs];
      sourceRefsApplied += 1;
    }
  }
}

const report = {
  schemaVersion: 1,
  source: "Fate_Domination-开发版/images",
  matchingRule: "稳定角色 ID 所属实体的名称必须与对应 masters/servants PNG 基名完全一致",
  counts: {
    masters: entries.filter((entry) => entry.ownerType === "master").length,
    servants: entries.filter((entry) => entry.ownerType === "servant").length,
    exactMatches: exactEntries.length,
    missing: entries.length - exactEntries.length,
    sourceRefsApplied,
  },
  entries,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(contentPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.counts, null, 2));
for (const entry of entries.filter((item) => item.matchStatus !== "exact-name")) {
  console.warn(`missing: ${entry.ownerId} / ${entry.ownerName}`);
}
