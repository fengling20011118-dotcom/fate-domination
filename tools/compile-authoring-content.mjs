import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegacyContentPatchFromAuthoring, compileAuthoringSkillCard } from "../src/content/authoring/adapter.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(root, args.input ?? path.join("src", "content", "authoring", "cards.json"));
const outDir = path.resolve(root, args.out ?? path.join("dist", "main-repo"));
const runtimeOut = path.resolve(root, args.runtimeOut ?? path.join("src", "content", "generated", "authoring-skill-overrides.ts"));

if (!fs.existsSync(inputPath)) {
  console.error(`Authoring input not found: ${path.relative(root, inputPath)}`);
  console.error("Pass --input <path> or create src/content/authoring/cards.json.");
  process.exitCode = 1;
} else {
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const cards = Array.isArray(input) ? input : input.skillCards;
  if (!Array.isArray(cards)) throw new Error("AUTHORING_INPUT_INVALID: expected an array or { skillCards: [] }");

  const compiled = buildLegacyContentPatchFromAuthoring(cards);
  fs.mkdirSync(outDir, { recursive: true });
  writeJson(path.join(outDir, "legacy-content.patch.json"), {
    masters: compiled.masters,
    servants: compiled.servants,
    cards: [],
    situations: [],
    eventGroups: [],
  });
  writeJson(path.join(outDir, "fd-card-authoring-rules.json"), {
    schemaVersion: "fd-card-authoring-v1",
    generatedAt: new Date().toISOString(),
    source: path.relative(root, inputPath),
    rules: compiled.authoringRules,
  });
  writeJson(path.join(outDir, "adapter-report.json"), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: path.relative(root, inputPath),
    itemCount: compiled.adapterReport.length,
    items: compiled.adapterReport,
  });

  const runtimeOverrides = Object.fromEntries(cards.map((card) => [card.id, toRuntimeOverride(card)]));
  fs.mkdirSync(path.dirname(runtimeOut), { recursive: true });
  fs.writeFileSync(runtimeOut, renderRuntimeOverrides(runtimeOverrides), "utf8");

  console.log(`已编译 ${cards.length} 张标准化技能卡到 ${path.relative(root, outDir)}。`);
  console.log(`已生成运行时适配：${path.relative(root, runtimeOut)}。`);
  if (compiled.adapterReport.length) {
    const bySeverity = compiled.adapterReport.reduce((counts, item) => {
      counts[item.severity] = (counts[item.severity] ?? 0) + 1;
      return counts;
    }, {});
    console.log(`adapter report: ${Object.entries(bySeverity).map(([key, value]) => `${key}=${value}`).join(", ")}`);
  }
}

function toRuntimeOverride(card) {
  const compiled = compileAuthoringSkillCard(card);
  const rules = compiled.rules;
  const abilities = rules.abilities ?? [];
  const primaryKind = inferPrimaryKind(abilities.map((ability) => ability.kind));
  const passiveEventTypes = [...new Set(abilities.flatMap((ability) => {
    if (ability.kind === "play_trigger") return ["card.played"];
    return (ability.conditions ?? [])
      .filter((condition) => condition?.type === "event_type_is" && typeof condition.eventType === "string")
      .map((condition) => condition.eventType);
  }))];
  const hasIncompleteRules = (rules.ambiguities?.length ?? 0) > 0
    || (rules.unmodeledClauses?.length ?? 0) > 0
    || abilities.some((ability) => (ability.ambiguities?.length ?? 0) > 0 || (ability.unmodeledClauses?.length ?? 0) > 0);
  const allAutomatic = abilities.length > 0 && abilities.every((ability) => (ability.execution?.mode ?? "automatic") === "automatic");
  const blockingReport = compiled.report.some((item) => item.severity === "error" || item.severity === "blocking");
  const supportLevel = allAutomatic && !hasIncompleteRules && !blockingReport ? "FULL" : "PARTIAL";
  const runtimeAbilities = abilities.filter((ability) => ability.kind === "phase_action" || ability.kind === "response").map((ability) => stripUndefined({
    id: ability.id,
    name: typeof ability.name === "string" && ability.name.length > 0 ? ability.name : ability.id,
    activation: ability.kind === "response" ? "optional-trigger" : "phase",
    windows: [...new Set([ability.activation?.phase, ...(ability.activation?.phases ?? [])].filter(Boolean))],
    steps: ability.activation?.step ? [ability.activation.step] : undefined,
    abilityCost: Number.isInteger(ability.cost?.mana) ? ability.cost.mana : undefined,
    requiresActiveCard: (ability.conditions ?? []).some((condition) => condition?.type === "source_active"),
    revealsTrueNameOnSkillUse: ability.visibility?.revealsTrueName === true,
  }));
  const usageLimit = (rules.playRequirements ?? []).find((item) => item?.type === "usage_limit");
  const limit = usageLimit?.scope === "game" && usageLimit?.maxUses === 1
    ? "once-per-game"
    : usageLimit?.scope === "round" && usageLimit?.maxUses === 1
      ? "once-per-round"
      : usageLimit?.scope === "turn" && usageLimit?.maxUses === 1
        ? "once-per-turn"
        : undefined;

  return stripUndefined({
    initiallyOwned: card.initiallyOwned,
    cardResidual: rules.cardFace?.residual,
    cost: rules.cardFace?.cost,
    requirement: rules.cardFace?.requirement?.type === "min_mana" ? rules.cardFace.requirement.value : undefined,
    requiresEightMana: rules.cardFace?.requirement?.type === "none" ? false : undefined,
    typeLabel: rules.cardFace?.typeLabel,
    attributes: rules.cardFace?.attributes,
    basePower: rules.cardFace?.basePower,
    basePowerFormula: rules.cardFace?.basePowerFormula,
    activation: toRuntimeActivation(primaryKind),
    windows: [...new Set(abilities.flatMap((ability) => [ability.activation?.phase, ...(ability.activation?.phases ?? [])]).filter(Boolean))],
    steps: [...new Set(abilities.map((ability) => ability.activation?.step).filter(Boolean))],
    requiresActiveCard: abilities.some((ability) => (ability.conditions ?? []).some((condition) => condition?.type === "source_active")),
    revealsTrueNameOnPlay: abilities.some((ability) => ability.visibility?.revealsTrueName === true),
    abilities: runtimeAbilities,
    passiveEventTypes: passiveEventTypes.length ? passiveEventTypes : undefined,
    limit,
    handlerId: supportLevel === "FULL" ? "core.structured-skill" : undefined,
    supportLevel,
    rules,
  });
}

function inferPrimaryKind(kinds) {
  const priority = ["passive", "play_trigger", "phase_action", "response", "residual"];
  return kinds.reduce((best, kind) => priority.indexOf(kind) > priority.indexOf(best) ? kind : best, "passive");
}

function toRuntimeActivation(kind) {
  if (kind === "residual") return "residual";
  if (kind === "response") return "optional-trigger";
  if (kind === "phase_action") return "phase";
  if (kind === "play_trigger") return "play";
  return "passive";
}

function renderRuntimeOverrides(overrides) {
  return `// AUTO-GENERATED by tools/compile-authoring-content.mjs. DO NOT EDIT.\n`
    + `import type { ConfirmedSkillOverride } from "../confirmed-skill-overrides.ts";\n\n`
    + `export const authoringGeneratedOverrides: Record<string, ConfirmedSkillOverride> = ${JSON.stringify(overrides, null, 2)};\n`;
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--input") result.input = values[++index];
    else if (value === "--out") result.out = values[++index];
    else if (value === "--runtime-out") result.runtimeOut = values[++index];
    else throw new Error(`UNKNOWN_ARG:${value}`);
  }
  return result;
}
