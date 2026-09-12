import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("第一批技能迁移固定登记100个技能且保留结构和来源", async () => {
  const batches = JSON.parse(fs.readFileSync(path.join(root, "docs", "skill-migration-batches.json"), "utf8"));
  const [batch] = batches.batches;
  assert.equal(batch.id, "skills-001");
  assert.equal(batch.size, 100);
  assert.equal(batch.skills.length, 100);
  assert.equal(new Set(batch.skills.map((skill) => skill.id)).size, 100);

  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const content = JSON.parse(fs.readFileSync(path.join(root, "src", "content", "generated", "legacy-content.json"), "utf8"));
  const built = buildStandardContent(content);
  const { StandardMatchEngine } = await import("../src/match-engine/standard-match-engine.ts");
  new StandardMatchEngine(built);
  const skills = built.skills;
  for (const [index, record] of batch.skills.entries()) {
    const skill = skills.get(record.id);
    assert.equal(record.sequence, index + 1);
    assert.equal(record.migrationStatus, "STRUCTURED");
    assert.ok(["FULL", "PARTIAL", "MANUAL", "DISABLED"].includes(record.executionStatus));
    assert.equal(record.ownerId, skill.ownerId);
    assert.equal(record.ownerType, skill.ownerType);
    assert.ok(Array.isArray(record.windows));
    assert.ok(record.sourceRefs.length > 0, `source missing for ${record.id}`);
    assert.ok(record.clauses.length > 0, `clauses missing for ${record.id}`);
  }
});

test("迁移批次中的技能只在实际完成后暴露为正常对局操作", async () => {
  const batches = JSON.parse(fs.readFileSync(path.join(root, "docs", "skill-migration-batches.json"), "utf8"));
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const content = JSON.parse(fs.readFileSync(path.join(root, "src", "content", "generated", "legacy-content.json"), "utf8"));
  const built = buildStandardContent(content);
  const { StandardMatchEngine } = await import("../src/match-engine/standard-match-engine.ts");
  new StandardMatchEngine(built);
  const skills = built.skills;
  for (const record of batches.batches[0].skills) {
    const skill = skills.get(record.id);
    assert.equal(skills.hasHandler(record.id), skill.supportLevel === "FULL", record.id);
  }
});

test("每个批次记录都保留历史技能契约，运行时复审结果可以安全覆盖旧批次状态", async () => {
  const batches = JSON.parse(fs.readFileSync(path.join(root, "docs", "skill-migration-batches.json"), "utf8"));
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const content = JSON.parse(fs.readFileSync(path.join(root, "src", "content", "generated", "legacy-content.json"), "utf8"));
  const built = buildStandardContent(content);
  for (const batch of batches.batches) {
    assert.equal(batch.skills.length, batch.size, `${batch.id} size mismatch`);
    for (const record of batch.skills) {
      const skill = built.skills.get(record.id);
      assert.ok(skill, `missing runtime skill ${record.id}`);
      const implementationSuperseded = record.handlerId !== skill.handlerId
        || record.implementationLevel !== skill.supportLevel
        || JSON.stringify(record.abilities ?? []) !== JSON.stringify(skill.abilities ?? [])
        || JSON.stringify(record.attributes ?? []) !== JSON.stringify(skill.attributes ?? [])
        || JSON.stringify(record.tags ?? []) !== JSON.stringify(skill.tags ?? [])
        || record.requiresActiveCard !== skill.requiresActiveCard
        || record.revealsTrueNameOnPlay !== skill.revealsTrueNameOnPlay
        || record.revealsTrueNameOnSkillUse !== skill.revealsTrueNameOnSkillUse
        || record.standardAppend !== skill.standardAppend
        || JSON.stringify(record.windows ?? []) !== JSON.stringify(skill.windows ?? []);
      if (implementationSuperseded) {
        // skill-migration-batches.json records the review state at batching time.
        // Later official-rule review may either promote a skill to FULL or
        // downgrade an earlier inferred/fake FULL back to PARTIAL. The live
        // canonical runtime is authoritative; the historical batch must not
        // force a stale completion claim back onto it.
        assert.ok(["FULL", "PARTIAL"].includes(skill.supportLevel), `${record.id} has invalid canonical support level`);
        assert.equal(record.ownerId, skill.ownerId, record.id);
        assert.equal(record.ownerType, skill.ownerType, record.id);
        assert.equal(record.text, skill.text, record.id);
        continue;
      }
      assert.deepEqual(record.attributes, skill.attributes ?? [], record.id);
      assert.deepEqual(record.tags, skill.tags ?? [], record.id);
      assert.equal(record.abilityCost ?? 0, skill.abilityCost ?? 0, record.id);
      assert.equal(record.drawOnPlay ?? 0, skill.drawOnPlay ?? 0, record.id);
      assert.equal(record.returnToDeckOnDefeat ?? false, skill.returnToDeckOnDefeat ?? false, record.id);
      assert.equal(record.preparationHandSize ?? 0, skill.preparationHandSize ?? 0, record.id);
      assert.equal(record.requirement, skill.requirement, record.id);
      assert.equal(record.limit, skill.limit, record.id);
      assert.equal(record.uniqueGroup, skill.uniqueGroup, record.id);
      assert.equal(record.standardAppend, skill.standardAppend, record.id);
      assert.equal(record.requiresEightMana, skill.requiresEightMana, record.id);
      assert.equal(record.maxManaExclusive, skill.maxManaExclusive, record.id);
      assert.equal(record.requiresTrueName, skill.requiresTrueName, record.id);
      assert.equal(record.requiresHiddenTrueName, skill.requiresHiddenTrueName, record.id);
      assert.equal(record.requiresActiveCard, skill.requiresActiveCard, record.id);
      assert.equal(record.revealsTrueNameOnPlay, skill.revealsTrueNameOnPlay, record.id);
      assert.equal(record.revealsTrueNameOnSkillUse, skill.revealsTrueNameOnSkillUse, record.id);
      assert.equal(record.ignoresSituationRestrictions, skill.ignoresSituationRestrictions, record.id);
      assert.equal(record.closeActiveAndActivateHiddenDefinitionId, skill.closeActiveAndActivateHiddenDefinitionId, record.id);
      assert.equal(record.doubleDeploymentBonus, skill.doubleDeploymentBonus, record.id);
      assert.equal(record.defeatEngagedOpponentsIfMoreActiveAttacks, skill.defeatEngagedOpponentsIfMoreActiveAttacks, record.id);
      assert.deepEqual(record.manaThresholdVictoryPointLoss, skill.manaThresholdVictoryPointLoss, record.id);
      assert.equal(record.handlerId, skill.handlerId, record.id);
      assert.equal(record.implementationLevel, skill.supportLevel, record.id);
      assert.deepEqual(record.abilities, skill.abilities ?? [], record.id);
      assert.equal(record.text, skill.text, record.id);
    }
  }
});

test("所有待迁移技能按不超过100项分批且不重复", async () => {
  const batches = JSON.parse(fs.readFileSync(path.join(root, "docs", "skill-migration-batches.json"), "utf8"));
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const content = JSON.parse(fs.readFileSync(path.join(root, "src", "content", "generated", "legacy-content.json"), "utf8"));
  const built = buildStandardContent(content);
  const pending = new Set(built.skills.list().filter((skill) => skill.supportLevel === "PARTIAL").map((skill) => skill.id));
  const ids = batches.batches.flatMap((batch) => {
    assert.ok(batch.size > 0 && batch.size <= 100, `${batch.id} size`);
    assert.equal(batch.skills.length, batch.size, `${batch.id} size mismatch`);
    return batch.skills.map((skill) => skill.id);
  });
  assert.equal(new Set(ids).size, ids.length, "migration batches must not repeat skill IDs");
  const batched = new Set(ids);
  for (const skillId of pending) {
    assert.ok(batched.has(skillId), `current PARTIAL skill missing from batches: ${skillId}`);
  }
});

test("技能批次覆盖全部运行时技能，不留下未分配尾部", async () => {
  const batches = JSON.parse(fs.readFileSync(path.join(root, "docs", "skill-migration-batches.json"), "utf8"));
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const content = JSON.parse(fs.readFileSync(path.join(root, "src", "content", "generated", "legacy-content.json"), "utf8"));
  const built = buildStandardContent(content);
  const ids = batches.batches.flatMap((batch) => batch.skills.map((skill) => skill.id));
  const runtimeIds = built.skills.list().map((skill) => skill.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, runtimeIds.length);
  assert.deepEqual([...new Set(ids)].sort(), [...new Set(runtimeIds)].sort());
});

test("skills-004 批次保留100项逐项审查结果且不伪造完成等级", async () => {
  const review = JSON.parse(fs.readFileSync(path.join(root, "docs", "skill-batch-review-004.json"), "utf8"));
  assert.equal(review.batchId, "skills-004");
  assert.equal(review.count, 100);
  assert.equal(review.entries.length, 100);
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const content = JSON.parse(fs.readFileSync(path.join(root, "src", "content", "generated", "legacy-content.json"), "utf8"));
  const built = buildStandardContent(content);
  for (const entry of review.entries) {
    const skill = built.skills.get(entry.id);
    assert.ok(skill, `missing reviewed skill ${entry.id}`);
    assert.equal(entry.before, entry.after, entry.id);
    if (entry.after === "FULL") {
      assert.equal(skill.supportLevel, "FULL", entry.id);
    }
    assert.equal(entry.requiresDedicatedHandler, (entry.unparsedCount ?? 0) > 0, entry.id);
  }
});

test("迁移批次保留开发版明确的子技能标题", () => {
  const batches = JSON.parse(fs.readFileSync(path.join(root, "docs", "skill-migration-batches.json"), "utf8"));
  const records = batches.batches.flatMap((batch) => batch.skills);
  const dioscuri = records.find((record) => record.id === "servant.dioscuri.skill.sc-dioscuri-3");
  assert.ok(dioscuri);
  assert.ok(dioscuri.clauses.some((clause) => clause.sectionName === "坚定铁拳"));
  assert.ok(dioscuri.clauses.some((clause) => clause.sectionName === "双子座之颂"));
});
