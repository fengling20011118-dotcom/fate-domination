import { execFileSync } from "node:child_process";

const steps = [
  ["compile-all-skill-programs.mjs", "全量技能规则程序"],
  ["build-skill-migration-queue.mjs", "全量迁移队列"],
  ["build-skill-migration-batches.mjs", "技能批次记录"],
  ["generate-authoring-partials.mjs", "标准化 authoring 结构"],
];

for (const [script, label] of steps) {
  execFileSync(process.execPath, ["--experimental-strip-types", `tools/${script}`], { stdio: "inherit" });
  console.log(`完成：${label}`);
}

console.log("全量技能迁移结构化完成；未解析条款保留为 requires-handler，不会伪装成 FULL。");
