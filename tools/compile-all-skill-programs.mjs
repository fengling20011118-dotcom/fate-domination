import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStandardContent } from "../src/content/content-package.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const inputPath = path.join(root, "src", "content", "generated", "legacy-content.json");
const outputPath = path.join(root, "docs", "skill-rule-programs.json");
const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const content = buildStandardContent(raw);
const skills = content.skills.list();
const programs = skills.map((skill) => skill.ruleProgram);
if (programs.some((program) => !program || program.skillId.length === 0)) {
  throw new Error("SKILL_RULE_PROGRAM_MISSING");
}
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "src/content/generated/legacy-content.json",
  totalSkills: programs.length,
  deterministicPrograms: programs.filter((program) => program.resolution === "deterministic").length,
  handledPrograms: programs.filter((program) => program.resolution === "handler").length,
  unresolvedPrograms: programs.filter((program) => program.resolution === "requires-handler").length,
  programs,
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`已生成全量技能规则程序：${output.totalSkills} 项；确定性 ${output.deterministicPrograms}，处理器覆盖 ${output.handledPrograms}，待专用处理器 ${output.unresolvedPrograms}。`);
