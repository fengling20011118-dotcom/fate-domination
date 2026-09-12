import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reasons = ["choice", "condition", "target", "lifecycle", "custom"];

/** Index exact quoted IDs once, instead of searching the source again per card. */
export function indexSourceLocations(files, skillIds) {
  const known = new Set(skillIds);
  const locations = new Map();
  for (const { file, text } of files) {
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      for (const match of line.matchAll(/["']([^"']+)["']/g)) {
        if (!known.has(match[1])) continue;
        const entries = locations.get(match[1]) ?? [];
        if (!entries.some((entry) => entry.file === file && entry.line === index + 1)) {
          entries.push({ file, line: index + 1 });
        }
        locations.set(match[1], entries);
      }
    }
  }
  return locations;
}

/** Runtime unresolved nodes are authoritative; old parser failures are not execution gaps. */
export function buildCapabilityGapReport(definitions, { hasHandler, sourceLocations = new Map(), skillId, reason } = {}) {
  if (typeof hasHandler !== "function") throw new Error("hasHandler is required");
  if (reason && !reasons.includes(reason)) throw new Error(`Unknown reason: ${reason}`);
  if (skillId && !definitions.some((skill) => skill.id === skillId)) throw new Error(`Unknown skill: ${skillId}`);
  const records = [];
  for (const skill of definitions) {
    if (skillId && skill.id !== skillId) continue;
    const program = skill.ruleProgram;
    const unresolved = (program?.nodes ?? []).filter((node) => node.kind === "unresolved");
    const executable = hasHandler(skill.id);
    const issues = [];
    if (!program) issues.push("missing-rule-program");
    if (!executable) issues.push("missing-executable-handler");
    if (skill.supportLevel !== "FULL") issues.push("support-not-full");
    if (skill.supportLevel === "FULL" && unresolved.length) issues.push("full-with-unresolved-clauses");
    const clauses = unresolved.filter((node) => !reason || node.reason === reason).map((node) => {
      const clause = program.clauses?.find((item) => item.index === node.clauseIndex);
      return {
        clauseIndex: node.clauseIndex,
        sectionName: clause?.sectionName ?? null,
        text: node.text,
        reason: node.reason,
        programLocator: `ruleProgram.nodes[${program.nodes.indexOf(node)}]`,
      };
    });
    if (reason ? !clauses.length : !issues.length && !clauses.length) continue;
    records.push({
      skillId: skill.id,
      cardId: skill.id,
      name: skill.name,
      ownerId: skill.ownerId,
      supportLevel: skill.supportLevel,
      handlerId: skill.handlerId ?? null,
      hasExecutableHandler: executable,
      issues,
      sourceRefs: skill.sourceRefs ?? [],
      sourceLocations: sourceLocations.get(skill.id) ?? [],
      clauses,
    });
  }
  return {
    schemaVersion: 1,
    basis: "Current static runtime definitions and unresolved rule-program nodes; reason groups are parser classifications, not proof that a DSL primitive is absent. Null sectionName means no explicit section title was recorded.",
    filters: { skillId: skillId ?? null, reason: reason ?? null },
    totalStaticSkills: definitions.length,
    reportedSkills: records.length,
    unresolvedClauses: records.reduce((sum, record) => sum + record.clauses.length, 0),
    groups: reasons.map((reason) => ({
      reason,
      clauseCount: records.reduce((sum, record) => sum + record.clauses.filter((clause) => clause.reason === reason).length, 0),
      skillIds: records.filter((record) => record.clauses.some((clause) => clause.reason === reason)).map((record) => record.skillId),
    })),
    skills: records,
  };
}

export function formatCapabilityGapReport(report) {
  const lines = [`技能能力缺口：${report.reportedSkills}/${report.totalStaticSkills} 项，未解析条款 ${report.unresolvedClauses} 条。`,
    "原因沿用现有解析分类，不表示对应 DSL 能力一定缺失；未命名条款不推断小技能归属。",
    ...report.groups.map((group) => `${group.reason}: ${group.clauseCount} 条 / ${group.skillIds.length} 项技能`),
  ];
  for (const skill of report.skills) {
    lines.push(`\n${skill.skillId} | ${skill.name ?? ""} | ${skill.supportLevel}`, `  卡 ID: ${skill.cardId}`);
    for (const location of skill.sourceLocations) lines.push(`  ${location.file}:${location.line}`);
    if (skill.issues.length) lines.push(`  状态检查: ${skill.issues.join(", ")}`);
    for (const clause of skill.clauses) lines.push(`  [${clause.reason}] 条款 ${clause.clauseIndex + 1} / ${clause.sectionName ?? "未命名"}: ${clause.text}`);
  }
  return `${lines.join("\n")}\n`;
}

async function main(args) {
  const options = {};
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      console.log("Usage: node tools/report-skill-capability-gaps.mjs [--json] [--skill ID] [--reason choice|condition|target|lifecycle|custom]\nRead-only: builds current runtime definitions without refreshing audit/queue files.");
      return;
    }
    if (argument === "--json") { json = true; continue; }
    if ((argument === "--skill" || argument === "--reason") && args[index + 1] && !args[index + 1].startsWith("--")) {
      options[argument === "--skill" ? "skillId" : "reason"] = args[++index];
      continue;
    }
    throw new Error(`Unknown argument or missing value: ${argument}`);
  }
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const { StandardMatchEngine } = await import("../src/match-engine/standard-match-engine.ts");
  const sourceFile = path.join(root, "src/content/generated/legacy-content.json");
  const raw = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
  const content = buildStandardContent(raw);
  const definitions = content.skills.list();
  new StandardMatchEngine(content);
  const sourceFiles = [sourceFile, ...fs.readdirSync(path.join(root, "src/content"), { recursive: true })
    .filter((file) => file.endsWith(".ts")).map((file) => path.join(root, "src/content", file))];
  options.sourceLocations = indexSourceLocations(sourceFiles.map((file) => ({ file, text: fs.readFileSync(file, "utf8") })), definitions.map((skill) => skill.id));
  options.hasHandler = (id) => content.skills.hasHandler(id);
  const report = buildCapabilityGapReport(definitions, options);
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatCapabilityGapReport(report));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
