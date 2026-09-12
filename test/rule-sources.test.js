import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const corpus = JSON.parse(fs.readFileSync(new URL("../docs/generated-rule-sources.json", import.meta.url), "utf8"));

test("权威规则资料均进入可追踪的只读索引", () => {
  assert.equal(corpus.schemaVersion, 1);
  assert.deepEqual(corpus.sourcePriority, ["base-rules", "fqa", "rule-answers", "turn-keywords", "three-x"]);
  assert.equal(corpus.documents.length, 5);
  for (const document of corpus.documents) {
    assert.ok(document.file.length > 0);
    assert.equal(document.entryCount, document.entries.length);
    assert.ok(document.entries.length > 0);
    assert.ok(document.entries.every((entry) => entry.locator.length > 0 && entry.text.length > 0));
  }
});

test("规则索引保留关键词与3X模式的关键裁定", () => {
  const textById = Object.fromEntries(corpus.documents.map((document) => [document.id, document.entries.map((entry) => entry.text).join("\n")]));
  assert.match(textById["turn-keywords"], /残留/);
  assert.match(textById["turn-keywords"], /唯一/);
  assert.match(textById["three-x"], /圣晶石/);
  assert.match(textById["base-rules"], /行动阶段/);
  assert.match(textById.fqa, /技能/);
});
