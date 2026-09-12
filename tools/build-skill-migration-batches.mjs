import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStandardContent } from "../src/content/content-package.ts";
import { parseSkillEffects } from "../src/rules-core/skill-effects.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const contentPath = path.join(root, "src", "content", "generated", "legacy-content.json");
const outputPath = path.join(root, "docs", "skill-migration-batches.json");
const batchSize = 100;

const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
const built = buildStandardContent(content);
const definitions = new Map(built.skills.list().map((skill) => [skill.id, skill]));
const owners = [
  ...(content.masters ?? []).map((owner) => ({ ...owner, ownerType: "master" })),
  ...(content.servants ?? []).map((owner) => ({ ...owner, ownerType: "servant" })),
];

function classify(raw, definition) {
  const parsed = parseSkillEffects(raw.text ?? "");
  const hasDerivedText = parsed.clauses.some((clause) => clause.hasDerivedCard);
  const hasDecisionText = parsed.clauses.some((clause) => clause.hasChoice);
  const hasLifecycleText = parsed.clauses.some((clause) => clause.hasLifecycle);
  const hasCombatText = parsed.clauses.some((clause) => clause.hasCombat);
  return {
    id: raw.id,
    name: raw.name,
    ownerId: definition.ownerId,
    ownerType: definition.ownerType,
    activation: definition.activation,
    windows: definition.windows,
    cost: definition.cost,
    requirement: definition.requirement,
    attributes: definition.attributes ?? [],
    tags: definition.tags ?? [],
    abilityCost: definition.abilityCost ?? 0,
    drawOnPlay: definition.drawOnPlay,
    returnToDeckOnDefeat: definition.returnToDeckOnDefeat,
    preparationHandSize: definition.preparationHandSize,
    limit: definition.limit,
    uniqueGroup: definition.uniqueGroup,
    standardAppend: definition.standardAppend,
    requiresEightMana: definition.requiresEightMana,
    maxManaExclusive: definition.maxManaExclusive,
    requiresTrueName: definition.requiresTrueName,
    requiresHiddenTrueName: definition.requiresHiddenTrueName,
    requiresActiveCard: definition.requiresActiveCard,
    revealsTrueNameOnPlay: definition.revealsTrueNameOnPlay,
    revealsTrueNameOnSkillUse: definition.revealsTrueNameOnSkillUse,
    ignoresSituationRestrictions: definition.ignoresSituationRestrictions,
    closeActiveAndActivateHiddenDefinitionId: definition.closeActiveAndActivateHiddenDefinitionId,
    doubleDeploymentBonus: definition.doubleDeploymentBonus,
    defeatEngagedOpponentsIfMoreActiveAttacks: definition.defeatEngagedOpponentsIfMoreActiveAttacks,
    manaThresholdVictoryPointLoss: definition.manaThresholdVictoryPointLoss,
    handlerId: definition.handlerId,
    implementationLevel: definition.supportLevel,
    abilities: definition.abilities ?? [],
    text: definition.text,
    supportLevel: definition.supportLevel,
    sourceRefs: definition.sourceRefs ?? [],
    effects: parsed.effects,
    clauses: parsed.clauses,
    unparsedEffects: parsed.unparsed,
    groupKey: [
      definition.activation,
      definition.windows.join(",") || "no-window",
      hasDerivedText ? "derived" : "plain",
      hasDecisionText ? "choice" : "automatic",
      hasLifecycleText ? "lifecycle" : "stable",
    ].join("/"),
  };
}

const records = owners.flatMap((owner) => (owner.skills ?? []).map((raw) => {
  const definition = definitions.get(raw.id);
  if (!definition) throw new Error(`SKILL_DEFINITION_MISSING:${raw.id}`);
  return classify(raw, definition);
}));

// Migration batches are an audit trail, not a moving window. Once a batch has
// been written, preserve its membership even when individual skills later
// move from PARTIAL to FULL. This prevents a rerun from silently replacing
// the promised 100 skills with a different set.
const existing = fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, "utf8"))
  : undefined;
const existingBatches = Array.isArray(existing?.batches) ? existing.batches : [];
if (existingBatches.length > 0) {
  const currentById = new Map(records.map((record) => [record.id, record]));
  for (const batch of existingBatches) {
    batch.skills = (batch.skills ?? []).map((previous) => {
      const current = currentById.get(previous.id);
      if (!current) throw new Error(`SKILL_BATCH_SKILL_MISSING:${previous.id}`);
      return {
        ...previous,
        supportLevel: current.supportLevel,
        activation: current.activation,
        windows: current.windows,
        cost: current.cost,
        requirement: current.requirement,
        attributes: current.attributes,
        tags: current.tags,
        abilityCost: current.abilityCost,
        drawOnPlay: current.drawOnPlay,
        returnToDeckOnDefeat: current.returnToDeckOnDefeat,
        preparationHandSize: current.preparationHandSize,
        limit: current.limit,
        uniqueGroup: current.uniqueGroup,
        standardAppend: current.standardAppend,
        requiresEightMana: current.requiresEightMana,
        maxManaExclusive: current.maxManaExclusive,
        requiresTrueName: current.requiresTrueName,
        requiresHiddenTrueName: current.requiresHiddenTrueName,
        requiresActiveCard: current.requiresActiveCard,
        revealsTrueNameOnPlay: current.revealsTrueNameOnPlay,
        revealsTrueNameOnSkillUse: current.revealsTrueNameOnSkillUse,
        ignoresSituationRestrictions: current.ignoresSituationRestrictions,
        closeActiveAndActivateHiddenDefinitionId: current.closeActiveAndActivateHiddenDefinitionId,
        doubleDeploymentBonus: current.doubleDeploymentBonus,
        defeatEngagedOpponentsIfMoreActiveAttacks: current.defeatEngagedOpponentsIfMoreActiveAttacks,
        manaThresholdVictoryPointLoss: current.manaThresholdVictoryPointLoss,
        handlerId: current.handlerId,
        implementationLevel: current.implementationLevel,
        abilities: current.abilities,
        text: current.text,
        sourceRefs: current.sourceRefs,
        effects: current.effects,
        clauses: current.clauses,
        unparsedEffects: current.unparsedEffects,
        executionStatus: current.supportLevel,
        nextRequirement: current.supportLevel === "FULL"
          ? "completed"
          : current.unparsedEffects.length > 0
            ? "dedicated-handler-required"
            : "handler-verification-required",
      };
    });
  }
  const known = new Set(existingBatches.flatMap((item) => (item.skills ?? []).map((skill) => skill.id)));
  // Fill every remaining slot in one invocation.  Each batch is still capped
  // at 100 skills, but the importer no longer leaves an unexplained tail that
  // requires repeatedly rerunning the command before the full queue is visible.
  const remaining = records.filter((record) => !known.has(record.id));
  let nextBatchNumber = existingBatches.length + 1;
  for (let offset = 0; offset < remaining.length; offset += batchSize) {
    const next = remaining.slice(offset, offset + batchSize);
    existingBatches.push({
      id: `skills-${String(nextBatchNumber).padStart(3, "0")}`,
      purpose: `${nextBatchNumber}th 100-skill structural migration batch. Execution support remains independent.`,
      selection: "Current skills not already assigned to a batch, grouped by shared structural shape and ordered deterministically.",
      size: next.length,
      skills: next.map((record, index) => ({
        sequence: index + 1,
        migrationStatus: "STRUCTURED",
        executionStatus: record.supportLevel,
        nextRequirement: record.unparsedEffects.length > 0 ? "dedicated-handler-required" : "handler-verification-required",
        ...record,
      })),
    });
    nextBatchNumber += 1;
  }
  const frozenOutput = {
    schemaVersion: existing.schemaVersion ?? 1,
    source: existing.source ?? "src/content/generated/legacy-content.json",
    generatedAt: existing.generatedAt ?? new Date().toISOString(),
    batches: existingBatches,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(frozenOutput, null, 2)}\n`, "utf8");
  console.log(`已保留既有技能批次：${existingBatches.length} 批；不会因技能状态变化而重排已承诺批次。`);
  process.exit(0);
}

const groups = new Map();
for (const record of records) {
  const group = groups.get(record.groupKey) ?? { key: record.groupKey, records: [] };
  group.records.push(record);
  groups.set(record.groupKey, group);
}

// The order mirrors the migration queue: larger shared-shape groups first,
// then original authored order. Only current PARTIAL skills enter a new batch.
const selected = [...groups.values()]
  .sort((left, right) => right.records.length - left.records.length || left.key.localeCompare(right.key))
  .flatMap((group) => group.records.filter((record) => record.supportLevel === "PARTIAL"))
  .slice(0, batchSize);

if (selected.length === 0 || selected.length > batchSize) throw new Error(`SKILL_BATCH_SIZE_INVALID:${selected.length}`);

const batch = {
  id: "skills-001",
  purpose: "First 100-skill structural migration batch. Execution support remains independent.",
  selection: "Current PARTIAL skills, grouped by shared structural shape and ordered deterministically.",
  size: selected.length,
  skills: selected.map((record, index) => ({
    sequence: index + 1,
    migrationStatus: "STRUCTURED",
    executionStatus: record.supportLevel,
    nextRequirement: record.unparsedEffects.length > 0 ? "dedicated-handler-required" : "handler-verification-required",
    ...record,
  })),
};

const output = {
  schemaVersion: 1,
  source: "src/content/generated/legacy-content.json",
  generatedAt: new Date().toISOString(),
  batches: [batch],
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`已生成技能批次：${batch.id}，${batch.size} 项，全部保持可审计的独立执行状态。`);
