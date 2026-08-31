import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = JSON.parse(await readFile(new URL("../src/content/generated/development-image-sources.json", import.meta.url), "utf8"));
const content = JSON.parse(await readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));

test("开发版全部御主与从者按稳定角色归属精确映射卡图", () => {
  assert.equal(index.source, "Fate_Domination-开发版/images");
  assert.equal(index.counts.masters, 68);
  assert.equal(index.counts.servants, 183);
  assert.equal(index.counts.exactMatches, 251);
  assert.equal(index.counts.missing, 0);
  assert.equal(index.entries.length, 251);
  assert.ok(index.entries.every((entry) => entry.matchStatus === "exact-name"));
  assert.ok(index.entries.every((entry) => entry.imagePath === `images/${entry.ownerType === "master" ? "masters" : "servants"}/${entry.ownerName}.png`));
});

test("开发版角色卡图来源覆盖943项静态技能且保留原有备用来源", () => {
  const owners = [...content.masters, ...content.servants];
  const skills = owners.flatMap((owner) => owner.skills ?? []);
  assert.equal(skills.length, 943);
  assert.equal(index.counts.sourceRefsApplied, 943);
  for (const owner of owners) {
    const entry = index.entries.find((candidate) => candidate.ownerId === owner.id);
    assert.ok(entry, `missing owner image ${owner.id}`);
    assert.deepEqual(entry.skillIds, (owner.skills ?? []).map((skill) => skill.id));
    for (const skill of owner.skills ?? []) {
      assert.ok(skill.sourceRefs?.some((ref) => ref.kind === "development-image"
        && ref.document === "Fate_Domination-开发版"
        && ref.category === entry.ownerType
        && ref.page === entry.imagePath), `missing development image source ${skill.id}`);
      assert.ok(skill.sourceRefs?.some((ref) => ref.kind === "chm" || ref.kind === "legacy"), `missing fallback source ${skill.id}`);
    }
  }
});
