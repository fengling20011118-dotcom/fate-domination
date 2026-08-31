import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("英文版从者索引不会把中文版节点混入运行时来源", async () => {
  const index = JSON.parse(await readFile(new URL("../src/content/generated/english-servant-sources.json", import.meta.url), "utf8"));
  assert.equal(index.categoryRule, "从者/<职阶>/英文版 的直接子节点");
  assert.ok(index.entries.length > 0);
  assert.ok(index.entries.every((entry: { className: string; name: string; sourcePage: string }) => entry.className && entry.name && entry.sourcePage));
  assert.equal(index.counts.englishEntries, index.entries.length);
  assert.equal(
    index.counts.exactMatches + index.counts.unresolved + index.counts.ambiguous + index.counts.classMismatches,
    index.counts.englishEntries,
  );
  assert.ok(index.entries.every((entry: { matchStatus: string }) => entry.matchStatus !== "chinese-version"));
});
