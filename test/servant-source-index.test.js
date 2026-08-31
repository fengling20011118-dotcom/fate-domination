import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("英文版从者索引只取职阶/英文版直接子节点并保留未映射证据", async () => {
  const index = JSON.parse(await readFile(new URL("../src/content/generated/english-servant-sources.json", import.meta.url), "utf8"));
  assert.equal(index.categoryRule, "从者/<职阶>/英文版 的直接子节点");
  assert.ok(index.counts.englishEntries > 0);
  assert.equal(index.counts.englishEntries, index.entries.length);
  assert.ok(index.entries.every((entry) => entry.className && entry.sourcePage && entry.name));
  assert.ok(index.entries.every((entry) => entry.matchStatus !== "chinese-version"));
  assert.equal(index.counts.exactMatches + index.counts.unresolved + index.counts.ambiguous + index.counts.classMismatches, index.counts.englishEntries);
});

test("已精确映射的英文版从者技能均持久化对应 CHM 来源", async () => {
  const index = JSON.parse(await readFile(new URL("../src/content/generated/english-servant-sources.json", import.meta.url), "utf8"));
  const content = JSON.parse(await readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const servants = new Map(content.servants.map((servant) => [servant.id, servant]));
  let checked = 0;
  for (const entry of index.entries.filter((item) => item.matchStatus === "exact")) {
    const servant = servants.get(entry.servantId);
    assert.ok(servant, `missing servant ${entry.servantId}`);
    for (const skill of servant.skills ?? []) {
      assert.ok(skill.sourceRefs?.some((ref) =>
        ref.kind === "chm" && ref.document === "FD全卡图鉴V2.0.chm" &&
        ref.category === "servant/english" && ref.page === entry.sourcePage &&
        ref.locator === `从者/${entry.className}/英文版/${entry.sourcePage}`,
      ), `missing source ref ${skill.id}`);
      checked += 1;
    }
  }
  assert.equal(checked, index.counts.sourceRefsApplied);
  assert.ok(checked > 0);
});
