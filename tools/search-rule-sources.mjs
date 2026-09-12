import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const corpusPath = path.join(root, "docs", "generated-rule-sources.json");
const terms = process.argv.slice(2).map((term) => term.trim()).filter(Boolean);
if (terms.length === 0) {
  console.error("用法：npm run search:rules -- <关键词> [更多关键词]");
  process.exitCode = 2;
} else {
  const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
  const matches = corpus.documents.flatMap((document) => document.entries
    .filter((entry) => terms.every((term) => entry.text.includes(term)))
    .map((entry) => ({ sourceId: document.id, file: document.file, locator: entry.locator, text: entry.text })));
  process.stdout.write(`${JSON.stringify({ terms, count: matches.length, matches }, null, 2)}\n`);
}
