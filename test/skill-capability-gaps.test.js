import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCapabilityGapReport, indexSourceLocations, formatCapabilityGapReport } from "../tools/report-skill-capability-gaps.mjs";

const partial = {
  id: "skill.partial", name: "待迁移", supportLevel: "PARTIAL",
  ruleProgram: {
    clauses: [{ index: 0, sectionName: "子技能甲" }, { index: 1 }],
    nodes: [
      { kind: "unresolved", clauseIndex: 0, reason: "choice", text: "选择目标" },
      { kind: "unresolved", clauseIndex: 1, reason: "lifecycle", text: "回合结束关闭" },
    ],
  },
};

test("报告逐条保留小技能标题、分类和可定位的节点，不改写执行状态", () => {
  const before = structuredClone(partial);
  const locations = indexSourceLocations([{ file: "skills.ts", text: '\n"skill.partial": {\n}\n"skill.partial-extra": {}' }], [partial.id]);
  const report = buildCapabilityGapReport([partial], { hasHandler: () => false, sourceLocations: locations });
  assert.deepEqual(partial, before);
  assert.equal(report.unresolvedClauses, 2);
  assert.equal(report.skills[0].cardId, partial.id);
  assert.equal(report.skills[0].clauses[0].sectionName, "子技能甲");
  assert.equal(report.skills[0].clauses[1].sectionName, null);
  assert.equal(report.skills[0].clauses[1].programLocator, "ruleProgram.nodes[1]");
  assert.deepEqual(report.skills[0].sourceLocations, [{ file: "skills.ts", line: 2 }]);
  assert.match(formatCapabilityGapReport(report), /skills.ts:2/);
  assert.deepEqual(report.groups.find((group) => group.reason === "choice").skillIds, [partial.id]);
});

test("已由 handler 覆盖的旧未解析文本不算缺口，但 FULL 无执行器仍报告", () => {
  const full = { id: "full", supportLevel: "FULL", unparsedEffects: ["旧文本"], ruleProgram: { nodes: [{ kind: "handler" }] } };
  assert.equal(buildCapabilityGapReport([full], { hasHandler: () => true }).reportedSkills, 0);
  assert.deepEqual(buildCapabilityGapReport([full], { hasHandler: () => false }).skills[0].issues, ["missing-executable-handler"]);
  const invalid = { ...partial, supportLevel: "FULL" };
  assert.ok(buildCapabilityGapReport([invalid], { hasHandler: () => true }).skills[0].issues.includes("full-with-unresolved-clauses"));
});

test("按原因与技能过滤仍保留真实状态，并拒绝拼错的筛选条件", () => {
  const report = buildCapabilityGapReport([partial], { hasHandler: () => false, skillId: partial.id, reason: "choice" });
  assert.equal(report.unresolvedClauses, 1);
  assert.equal(report.skills[0].supportLevel, "PARTIAL");
  assert.throws(() => buildCapabilityGapReport([partial], { hasHandler: () => false, skillId: "typo" }), /Unknown skill/);
  assert.throws(() => buildCapabilityGapReport([partial], { hasHandler: () => false, reason: "typo" }), /Unknown reason/);
});

test("真实内容缺口数与当前运行时审计节点一致，不依赖旧队列快照", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const { StandardMatchEngine } = await import("../src/match-engine/standard-match-engine.ts");
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const content = buildStandardContent(raw);
  const definitions = content.skills.list();
  new StandardMatchEngine(content);
  const report = buildCapabilityGapReport(definitions, { hasHandler: (id) => content.skills.hasHandler(id) });
  assert.equal(report.totalStaticSkills, definitions.length);
  assert.equal(report.unresolvedClauses, definitions.flatMap((skill) => skill.ruleProgram?.nodes ?? []).filter((node) => node.kind === "unresolved").length);
  for (const definition of definitions.filter((skill) => skill.supportLevel !== "FULL")) {
    assert.ok(report.skills.some((skill) => skill.skillId === definition.id), definition.id);
  }
});
