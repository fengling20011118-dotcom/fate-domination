import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildStandardContentFromSources } from "../src/content/standard-content-adapter.ts";
import type { StandardContentSources } from "../src/content/standard-content-adapter.ts";

test("真实 Angra 原始样本可经 adapter 导入 Content/Skill 契约", async () => {
  const raw = JSON.parse(
    await readFile(new URL("./fixtures/content-contract/angra.raw.json", import.meta.url), "utf8"),
  ) as StandardContentSources;

  const content = buildStandardContentFromSources(raw);
  const servantDeck = content.playerDecks["servant.angra"];
  const skills = content.skills.list().filter((skill) => skill.ownerId === "servant.angra");

  assert.equal(servantDeck.length, 12);
  assert.equal(servantDeck.filter((id) => id === "card.card-avenger").length, 3);
  assert.deepEqual(skills.map((skill) => skill.id), [
    "servant.angra.skill.sc-angra-1",
    "servant.angra.skill.sc-angra-2",
    "servant.angra.skill.sc-angra-3",
  ]);
  assert.equal(content.cards["card.card-avenger"].name, "复仇者");
});

test("adapter 构造 raw 时会补齐缺省集合", () => {
  const content = buildStandardContentFromSources({ cards: [{ id: "card.contract", name: "契约样本" }] });

  assert.equal(content.cards["card.contract"].name, "契约样本");
  assert.equal(content.threeXMasterPool, undefined);
  assert.equal(content.threeXServantPool, undefined);
});
