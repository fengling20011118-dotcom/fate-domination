import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildStandardContent } from "../src/content/content-package.ts";
import { THREE_X_MASTER_RATINGS } from "../src/content/three-x-ratings.ts";
import { getThreeXMasterRating } from "../src/rules-core/three-x-economy.ts";

test("3X 内容包接入规则书御主评级，未列出的内容保持默认4石", async () => {
  const raw = JSON.parse(await readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const content = buildStandardContent(raw);
  assert.deepEqual(content.threeXMasterRatings, THREE_X_MASTER_RATINGS);
  assert.equal(content.threeXMasterRatings?.["master.taiga"], 10);
  assert.equal(content.threeXMasterRatings?.["master.twice"], 4);
  assert.equal(getThreeXMasterRating("master.kohaku", content.threeXMasterRatings ?? {}), 4);
});
