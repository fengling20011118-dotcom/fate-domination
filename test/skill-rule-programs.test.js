import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { assertSkillRuleProgram } from "../src/rules-core/skill-rule-program.ts";

const root = path.resolve(import.meta.dirname, "..");
const programs = JSON.parse(fs.readFileSync(path.join(root, "docs", "skill-rule-programs.json"), "utf8"));
const content = JSON.parse(fs.readFileSync(path.join(root, "src", "content", "generated", "legacy-content.json"), "utf8"));
const skillIds = [...(content.masters ?? []), ...(content.servants ?? [])].flatMap((owner) => (owner.skills ?? []).map((skill) => skill.id));

test("全量技能均有可追踪规则程序，未解析条款不会被丢弃", () => {
  assert.equal(programs.totalSkills, skillIds.length);
  assert.equal(programs.programs.length, skillIds.length);
  assert.equal(new Set(programs.programs.map((program) => program.skillId)).size, skillIds.length);
  for (const program of programs.programs) {
    assert.equal(program.schemaVersion, 1);
    assert.equal(typeof program.sourceText, "string");
    assert.ok(Array.isArray(program.nodes));
    if (program.resolution === "requires-handler") {
      assert.ok(program.nodes.some((node) => node.kind === "unresolved"));
    }
    if (program.resolution === "handler") {
      assert.ok(program.nodes.some((node) => node.kind === "handler"));
      assert.equal(program.nodes.some((node) => node.kind === "unresolved"), false);
    }
  }
});

test("技能审计报告保留规则程序分解和未解析原因", () => {
  const audit = JSON.parse(fs.readFileSync(path.join(root, "docs", "skill-audit.json"), "utf8"));
  assert.equal(audit.staticSkillCount, 943);
  assert.equal(audit.rulePrograms.total, 943);
  assert.equal(audit.rulePrograms.deterministic + audit.rulePrograms.handled + audit.rulePrograms.requiresHandler, 943);
  assert.ok(audit.rulePrograms.nodes.effect >= 0);
  assert.ok(audit.rulePrograms.nodes.handler >= 0);
  assert.ok(audit.rulePrograms.nodes.unresolved >= 0);
  for (const reason of ["choice", "condition", "target", "lifecycle", "custom"]) {
    assert.ok(Number.isInteger(audit.rulePrograms.unresolvedReasons[reason]));
  }
});

test("规则程序校验拒绝解析状态与节点不一致", () => {
  const program = programs.programs[0];
  const invalid = structuredClone(program);
  invalid.resolution = invalid.nodes.some((node) => node.kind === "unresolved") ? "deterministic" : "requires-handler";
  assert.throws(() => assertSkillRuleProgram(invalid), /SKILL_RULE_PROGRAM_RESOLUTION_MISMATCH/);
});
