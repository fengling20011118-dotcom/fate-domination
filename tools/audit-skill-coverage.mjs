import { readFile, writeFile } from "node:fs/promises";
import { buildStandardContent } from "../src/content/content-package.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";

const raw = JSON.parse(await readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
const content = buildStandardContent(raw);
const staticDefinitions = content.skills.list();
new StandardMatchEngine(content);

const definitions = content.skills.list();
const supportLevels = Object.fromEntries(
  ["FULL", "PARTIAL", "MANUAL", "DISABLED"].map((level) => [level, definitions.filter((skill) => skill.supportLevel === level).length]),
);
const fullWithoutHandler = definitions
  .filter((skill) => skill.supportLevel === "FULL" && !content.skills.hasHandler(skill.id))
  .map((skill) => skill.id);
const nonFullWithHandler = definitions
  .filter((skill) => skill.supportLevel !== "FULL" && content.skills.hasHandler(skill.id))
  .map((skill) => skill.id);

const unresolvedReasons = { choice: 0, condition: 0, target: 0, lifecycle: 0, custom: 0 };
const resolutionNodes = { effect: 0, handler: 0, unresolved: 0 };
for (const skill of definitions) {
  for (const node of skill.ruleProgram?.nodes ?? []) {
    resolutionNodes[node.kind] = (resolutionNodes[node.kind] ?? 0) + 1;
    if (node.kind === "unresolved") unresolvedReasons[node.reason] += 1;
  }
}

const report = {
  staticSkillCount: staticDefinitions.length,
  runtimeSkillCount: definitions.length,
  supportLevels,
  executableStaticSkills: definitions.filter((skill) => content.skills.hasHandler(skill.id)).length,
  fullWithoutHandler,
  nonFullWithHandler,
  dynamicRuntimeSkills: definitions.filter((skill) => !staticDefinitions.some((item) => item.id === skill.id)).map((skill) => skill.id),
  rulePrograms: {
    total: definitions.filter((skill) => skill.ruleProgram).length,
    deterministic: definitions.filter((skill) => skill.ruleProgram?.resolution === "deterministic").length,
    handled: definitions.filter((skill) => skill.ruleProgram?.resolution === "handler").length,
    requiresHandler: definitions.filter((skill) => skill.ruleProgram?.resolution === "requires-handler").length,
    nodes: resolutionNodes,
    unresolvedReasons,
  },
};
await writeFile(new URL("../docs/skill-audit.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (staticDefinitions.length !== 943 || definitions.length !== 944 || report.dynamicRuntimeSkills.length !== 1 || fullWithoutHandler.length || nonFullWithHandler.length) process.exitCode = 1;
