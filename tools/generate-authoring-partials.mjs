import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const partialPath = path.join(root, "docs", "partial-current.json");
const outDir = path.join(root, "src", "content", "authoring");
const outPath = path.join(outDir, "cards.json");

if (!fs.existsSync(partialPath)) {
  console.log("No partial-current.json; skipping authoring scaffold generation.");
  process.exit(0);
}

const partials = JSON.parse(fs.readFileSync(partialPath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(outPath)) {
  fs.writeFileSync(outPath, JSON.stringify({
    schemaVersion: "fd-card-authoring-v1",
    skillCards: partials.map((skill) => ({
      id: skill.id,
      name: skill.name,
      sourceRefs: skill.sourceRefs ?? [],
      abilities: skill.rules?.abilities ?? []
    }))
  }, null, 2));
}

console.log(`Generated authoring scaffold: ${partials.length} partial skills.`);
