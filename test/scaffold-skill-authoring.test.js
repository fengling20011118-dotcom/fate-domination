import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffoldSkillCards, runScaffold } from "../tools/scaffold-skill-authoring.mjs";
import { compileAuthoringSkillCard } from "../src/content/authoring/adapter.ts";

const source = { servants: [{ id: "servant.example", skills: [{
  id: "servant.example.skill.one", name: "例子", text: "打出时：抽一张牌。然后获得魔力。\n行动阶段：关闭此牌。",
  cost: 0, requirement: 0, sourceRefs: [{ kind: "legacy", document: "fixture" }],
}] }] };

test("scaffold preserves source and candidate fragments without inventing executable semantics", () => {
  const before = JSON.stringify(source);
  const [card] = scaffoldSkillCards(source, ["servant.example.skill.one", "servant.example.skill.one"]);
  assert.equal(card.printedText, source.servants[0].skills[0].text);
  assert.equal(card.ownerId, "servant.example");
  assert.equal(card.abilities.length, 2);
  assert.equal(card.abilities[0].printedClause, "打出时：抽一张牌。然后获得魔力。");
  assert.equal(card.cardFace.cost, 0);
  assert.deepEqual(card.cardFace.requirement, { type: "none" });
  assert.equal(card.verification.fragmentSource, "source-lines");
  assert.ok(card.abilities.every((ability) => ability.execution.mode === "unsupported" && ability.effects.length === 0));
  assert.deepEqual(card.unmodeledClauses, [card.printedText]);
  const compiled = compileAuthoringSkillCard(card);
  assert.equal(compiled.legacySkill.implementation, "disabled");
  assert.equal(compiled.legacySkill.handlerId, undefined);
  assert.ok(compiled.report.some((item) => item.severity === "blocking"));
  assert.equal(JSON.stringify(source), before);
});

test("existing authored fragments retain IDs, but imported effects cannot become executable", () => {
  const input = structuredClone(source);
  input.servants[0].skills[0].rules = { abilities: [{
    id: "draw", kind: "play_trigger", printedClause: "打出时：抽一张牌。",
    execution: { mode: "automatic" }, effects: [{ type: "draw_cards", amount: 1 }],
  }] };
  const [card] = scaffoldSkillCards(input, ["servant.example.skill.one"]);
  assert.equal(card.abilities[0].id, "draw");
  assert.equal(card.abilities[0].kind, "play_trigger");
  assert.equal(card.abilities[0].execution.mode, "unsupported");
  assert.deepEqual(card.unmodeledClauses, [card.printedText]);
});

test("explicit output is exclusive and invalid IDs create no draft", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-scaffold-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, "source.json");
  const output = path.join(dir, "draft.json");
  fs.writeFileSync(input, JSON.stringify(source));
  const args = ["--input", input, "--out", output, "--id", "servant.example.skill.one"];
  const result = runScaffold(args);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), result);
  const original = fs.readFileSync(output, "utf8");
  assert.throws(() => runScaffold(args), { code: "EEXIST" });
  assert.equal(fs.readFileSync(output, "utf8"), original);
  const missing = path.join(dir, "missing.json");
  assert.throws(() => runScaffold(["--input", input, "--out", missing, "--id", "missing"]), /UNKNOWN_SKILL/);
  assert.equal(fs.existsSync(missing), false);
  assert.throws(() => runScaffold(["--input", input, "--id", "servant.example.skill.one"]), /OUTPUT_REQUIRED/);
  assert.throws(() => runScaffold(["--out"]), /ARG_VALUE_REQUIRED/);
});
