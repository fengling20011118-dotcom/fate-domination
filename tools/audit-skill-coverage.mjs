import { readFile } from "node:fs/promises";
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

const report = {
  staticSkillCount: staticDefinitions.length,
  runtimeSkillCount: definitions.length,
  supportLevels,
  executableStaticSkills: definitions.filter((skill) => content.skills.hasHandler(skill.id)).length,
  fullWithoutHandler,
  nonFullWithHandler,
  dynamicRuntimeSkills: definitions.filter((skill) => !staticDefinitions.some((item) => item.id === skill.id)).map((skill) => skill.id),
};
console.log(JSON.stringify(report, null, 2));
if (staticDefinitions.length !== 943 || definitions.length !== 944 || report.dynamicRuntimeSkills.length !== 1 || fullWithoutHandler.length || nonFullWithHandler.length) process.exitCode = 1;
