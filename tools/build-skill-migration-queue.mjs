import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStandardContent } from "../src/content/content-package.ts";
import { parseSkillEffects } from "../src/rules-core/skill-effects.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const contentPath = path.join(root, "src", "content", "generated", "legacy-content.json");
const outputPath = path.join(root, "docs", "skill-migration-queue.json");

const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
const built = buildStandardContent(content);
const supportById = new Map(built.skills.list().map((skill) => [skill.id, skill.supportLevel]));
const owners = [
  ...(content.masters ?? []).map((owner) => ({ ...owner, ownerType: "master" })),
  ...(content.servants ?? []).map((owner) => ({ ...owner, ownerType: "servant" })),
];

const skills = owners.flatMap((owner) => (owner.skills ?? []).map((skill) => {
  const parsed = parseSkillEffects(skill.text ?? "");
  return ({
  id: skill.id,
  name: skill.name,
  ownerId: owner.id,
  ownerType: owner.ownerType,
  text: skill.text ?? "",
  typeLabel: skill.typeLabel ?? "",
  cost: skill.cost ?? null,
  implementation: supportById.get(skill.id) ?? "MANUAL",
  activation: skill.activation?.kind ?? null,
  windows: skill.activation?.windows ?? [],
  limit: skill.limit ?? null,
  hasDerivedText: /衍生|从游戏外|创造|加入.*手牌|加入.*牌库/.test(skill.text ?? ""),
  hasDecisionText: /选择|可以|若如此|你可|任意|至多|展示/.test(skill.text ?? ""),
  hasLifecycleText: /残留|关闭|移除游戏|弃置|洗回|回合结束|下回合/.test(skill.text ?? ""),
  hasCombatText: /战斗阶段|战力|威力|败北|获胜|战败/.test(skill.text ?? ""),
  parsedEffects: parsed.effects,
  unparsedEffects: parsed.unparsed,
  clauses: parsed.clauses,
  });
}));

const recognizedEffectCounts = {};
let authoredClauses = 0;
let recognizedClauses = 0;
for (const skill of skills) {
  authoredClauses += skill.parsedEffects.length + skill.unparsedEffects.length;
  recognizedClauses += skill.parsedEffects.length;
  for (const effect of skill.parsedEffects) recognizedEffectCounts[effect.kind] = (recognizedEffectCounts[effect.kind] ?? 0) + 1;
}

const groups = new Map();
for (const skill of skills) {
  const key = [
    skill.activation ?? "unknown",
    skill.windows.join(",") || "no-window",
    skill.hasDerivedText ? "derived" : "plain",
    skill.hasDecisionText ? "choice" : "automatic",
    skill.hasLifecycleText ? "lifecycle" : "stable",
  ].join("/");
  const group = groups.get(key) ?? { key, count: 0, skillIds: [] };
  group.count += 1;
  group.skillIds.push(skill.id);
  groups.set(key, group);
}

const queue = {
  generatedAt: new Date().toISOString(),
  source: "src/content/generated/legacy-content.json",
  totalSkills: skills.length,
  pendingSkills: skills.filter((skill) => skill.implementation !== "FULL").length,
  effectCoverage: { authoredClauses, recognizedClauses, recognizedEffectCounts },
  groups: [...groups.values()].sort((a, b) => b.count - a.count),
  skills,
};

fs.writeFileSync(outputPath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
console.log(`已生成技能迁移队列：${queue.totalSkills} 项，待迁移 ${queue.pendingSkills} 项，分为 ${queue.groups.length} 组。`);
