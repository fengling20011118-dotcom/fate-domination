import type { PhaseId, PhaseStepId } from "../../domain/state/types.ts";
import type { SkillSourceRef } from "../../rules-core/skill-types.ts";
import { FD_CARD_AUTHORING_SCHEMA_VERSION, type FDAuthoringAbility, type FDAuthoringAdapterReportItem, type FDAuthoringExecution, type FDAuthoringHostOperation, type FDAuthoringSkillCard, type FDCardAuthoringRules } from "./types.ts";
import { getAutomaticAbilityRuntimeGaps, getAutomaticCardFaceRuntimeGaps } from "./runtime-capabilities.ts";

export interface CompiledAuthoringSkillCard {
  ownerType: "master" | "servant";
  ownerId: string;
  legacySkill: Record<string, unknown>;
  rules: FDCardAuthoringRules;
  report: FDAuthoringAdapterReportItem[];
}

const HOST_OPERATIONS: FDAuthoringHostOperation[] = [
  "adjust-mana",
  "adjust-victory-points",
  "move-card",
  "create-status",
  "skip-ability",
];

const KIND_PRIORITY = ["passive", "play_trigger", "phase_action", "response", "residual"] as const;

export function compileAuthoringSkillCard(card: FDAuthoringSkillCard): CompiledAuthoringSkillCard {
  const report: FDAuthoringAdapterReportItem[] = [];
  const rules = normalizeAuthoringRules(card, report);
  const windows = unique(rules.abilities.flatMap((ability) => [ability.activation?.phase, ...(ability.activation?.phases ?? [])]).filter(isPhaseId));
  const steps = unique(rules.abilities.map((ability) => ability.activation?.step).filter(isPhaseStepId));
  const primaryKind = inferPrimaryKind(rules.abilities);
  const handlerId = rules.abilities.map((ability) => ability.execution?.handlerId).find((value): value is string => typeof value === "string" && value.length > 0);

  const legacySkill: Record<string, unknown> = {
    id: card.id,
    name: card.name,
    text: card.printedText,
    initiallyOwned: card.initiallyOwned,
    typeLabel: rules.cardFace?.typeLabel,
    cost: rules.cardFace?.cost ?? 0,
    basePower: rules.cardFace?.basePower ?? 0,
    basePowerFormula: rules.cardFace?.basePowerFormula,
    cardResidual: rules.cardFace?.residual,
    attributes: rules.cardFace?.attributes,
    requirement: toLegacyRequirement(rules.cardFace?.requirement),
    activation: {
      kind: toLegacyActivationKind(primaryKind, card.id, report),
      windows,
      steps,
    },
    implementation: toLegacyImplementation(rules.abilities),
    sourceRefs: rules.evidence,
    rules,
  };

  if (handlerId) legacySkill.handlerId = handlerId;
  if (rules.cardFace?.requirement?.type === "none") legacySkill.requiresEightMana = false;

  return {
    ownerType: card.ownerType,
    ownerId: card.ownerId,
    legacySkill: stripUndefined(legacySkill),
    rules,
    report,
  };
}

export function buildLegacyContentPatchFromAuthoring(cards: FDAuthoringSkillCard[]): {
  masters: Array<{ id: string; skills: Record<string, unknown>[] }>;
  servants: Array<{ id: string; skills: Record<string, unknown>[] }>;
  adapterReport: FDAuthoringAdapterReportItem[];
  authoringRules: Record<string, FDCardAuthoringRules>;
} {
  const masters = new Map<string, Record<string, unknown>[]>();
  const servants = new Map<string, Record<string, unknown>[]>();
  const adapterReport: FDAuthoringAdapterReportItem[] = [];
  const authoringRules: Record<string, FDCardAuthoringRules> = {};

  for (const card of cards) {
    const compiled = compileAuthoringSkillCard(card);
    const target = compiled.ownerType === "master" ? masters : servants;
    target.set(compiled.ownerId, [...(target.get(compiled.ownerId) ?? []), compiled.legacySkill]);
    adapterReport.push(...compiled.report);
    authoringRules[card.id] = compiled.rules;
  }

  return {
    masters: [...masters.entries()].map(([id, skills]) => ({ id, skills })),
    servants: [...servants.entries()].map(([id, skills]) => ({ id, skills })),
    adapterReport,
    authoringRules,
  };
}

function normalizeAuthoringRules(card: FDAuthoringSkillCard, report: FDAuthoringAdapterReportItem[]): FDCardAuthoringRules {
  const cardFaceGaps = getAutomaticCardFaceRuntimeGaps(card.cardFace);
  if (cardFaceGaps.length > 0) {
    report.push({
      severity: "blocking",
      cardId: card.id,
      field: "cardFace.basePowerFormula",
      message: `Card-face formula uses runtime atoms that are not implemented: ${cardFaceGaps.join(", ")}.`,
      requiredAction: "implement_generic_card_face_formula_atom_or_remove_formula",
    });
  }
  const abilities = card.abilities.map((ability, index) => normalizeAbility(card.id, ability, index, report));
  if (abilities.length === 0) {
    report.push({
      severity: "error",
      cardId: card.id,
      field: "abilities",
      message: "Authoring skill cards must preserve every printed rule clause in abilities[].",
      requiredAction: "add_ability_or_move_text_to_unmodeled_clauses",
    });
  }
  return {
    schemaVersion: FD_CARD_AUTHORING_SCHEMA_VERSION,
    aliases: card.aliases ?? [],
    cardFace: card.cardFace ?? {},
    playRequirements: card.playRequirements ?? [],
    abilities,
    evidence: card.evidence ?? [],
    verification: card.verification ?? {},
    ambiguities: card.ambiguities ?? [],
    unmodeledClauses: card.unmodeledClauses ?? [],
  };
}

function normalizeAbility(cardId: string, ability: FDAuthoringAbility, index: number, report: FDAuthoringAdapterReportItem[]): FDAuthoringAbility {
  if (!ability.printedClause) {
    report.push({
      severity: "error",
      cardId,
      field: `abilities[${index}].printedClause`,
      message: "Every ability must keep the matching printed text clause.",
      requiredAction: "copy_exact_printed_clause",
    });
  }

  const execution = normalizeExecution(cardId, ability.execution, `abilities[${index}].execution`, report);
  if (execution.mode === "automatic") {
    const runtimeGaps = getAutomaticAbilityRuntimeGaps(ability);
    if (runtimeGaps.length > 0) {
      report.push({
        severity: "blocking",
        cardId,
        field: `abilities[${index}]`,
        message: `Automatic ability uses runtime atoms that are not implemented: ${runtimeGaps.join(", ")}.`,
        requiredAction: "implement_generic_runtime_atom_or_downgrade_execution",
      });
    }
  }
  if (ability.kind === "response" && !ability.responseWindow?.opens) {
    report.push({
      severity: "error",
      cardId,
      field: `abilities[${index}].responseWindow.opens`,
      message: "Response abilities must explicitly declare the response window.",
      requiredAction: "confirm_response_window",
    });
  }
  if ((ability.targets?.length ?? 0) > 0) {
    report.push({
      severity: "info",
      cardId,
      field: `abilities[${index}].targets`,
      message: "Player/host selected targets are preserved in rules and require runtime/UI mapping before generic execution.",
      requiredAction: "map_target_selection_to_available_action",
    });
  }
  if ((ability.ruleModifiers?.length ?? 0) > 0) {
    report.push({
      severity: "info",
      cardId,
      field: `abilities[${index}].ruleModifiers`,
      message: "Rule modifiers are preserved in rules; legacy fields only receive minimum compatibility data.",
      requiredAction: "connect_rule_modifier_runtime",
    });
  }

  return stripUndefined({
    ...ability,
    execution,
    responseWindow: ability.kind === "response" && ability.responseWindow
      ? {
          responders: { type: "controller" },
          priority: "turn_order",
          closeCondition: "controller_resolves_or_passes",
          passBehavior: "decline_this_window",
          ...ability.responseWindow,
        }
      : ability.responseWindow,
    lifecycle: ability.kind === "residual"
      ? { starts: "immediate", cleanup: "remain_active", ...ability.lifecycle }
      : ability.lifecycle,
    visibility: ability.markers?.includes("\u771f\u540d\u89e3\u653e")
      ? {
          revealsTrueName: true,
          revealTiming: "on_use_declared",
          revealScope: "servant_package",
          ...ability.visibility,
        }
      : ability.visibility,
  }) as FDAuthoringAbility;
}

function normalizeExecution(cardId: string, execution: FDAuthoringExecution | undefined, field: string, report: FDAuthoringAdapterReportItem[]): FDAuthoringExecution {
  const normalized: FDAuthoringExecution = execution ? { ...execution } : { mode: "automatic" };
  if (normalized.mode === "handler") {
    report.push({
      severity: normalized.handlerId ? "warning" : "error",
      cardId,
      field,
      message: normalized.handlerId ? "Ability requires a dedicated handler and cannot be represented only by legacy generic fields." : "Handler execution requires handlerId.",
      requiredAction: normalized.handlerId ? "keep_handler_until_generic_runtime_exists" : "add_handler_id",
    });
  }
  if (normalized.mode === "host_adjudicated") {
    normalized.allowedOperations ??= [...HOST_OPERATIONS];
    report.push({
      severity: "warning",
      cardId,
      field,
      message: "Host adjudicated abilities are not imported as fully automatic runtime effects.",
      requiredAction: "confirm_or_implement_effect",
    });
  }
  if (normalized.mode === "text_unconfirmed") {
    report.push({
      severity: "error",
      cardId,
      field,
      message: "Unconfirmed text cannot be silently imported as an implemented ability.",
      requiredAction: "verify_printed_text",
    });
  }
  if (normalized.mode === "unsupported") {
    report.push({
      severity: "blocking",
      cardId,
      field,
      message: "Unsupported abilities must not be enabled in the formal runtime package.",
      requiredAction: "exclude_or_add_runtime_support",
    });
  }
  return normalized;
}

function inferPrimaryKind(abilities: FDAuthoringAbility[]): FDAuthoringAbility["kind"] {
  let best: FDAuthoringAbility["kind"] = "passive";
  for (const ability of abilities) {
    if (KIND_PRIORITY.indexOf(ability.kind) > KIND_PRIORITY.indexOf(best)) best = ability.kind;
  }
  return best;
}

function toLegacyActivationKind(kind: FDAuthoringAbility["kind"], cardId: string, report: FDAuthoringAdapterReportItem[]): string {
  if (kind === "passive") return "passive";
  if (kind === "play_trigger") return "play";
  if (kind === "residual") return "residual";
  if (kind === "response") {
    report.push({
      severity: "warning",
      cardId,
      field: "activation.kind",
      message: "Legacy SkillDefinition has no first-class response activation; adapter downgraded it to active phase compatibility.",
      requiredAction: "connect_response_runtime",
    });
    return "active";
  }
  return "active";
}

function toLegacyImplementation(abilities: FDAuthoringAbility[]): string {
  const modes = abilities.map((ability) => ability.execution?.mode ?? "automatic");
  if (modes.includes("unsupported")) return "disabled";
  if (modes.includes("text_unconfirmed")) return "pending";
  if (modes.includes("host_adjudicated")) return "manual";
  return "implemented";
}

function toLegacyRequirement(requirement: FDCardAuthoringRules["cardFace"] extends infer Face ? Face extends { requirement?: infer Requirement } ? Requirement : never : never): number | undefined {
  if (!requirement || requirement.type === "none") return undefined;
  return requirement.value;
}

function isPhaseId(value: unknown): value is PhaseId {
  return value === "preparation" || value === "outpost" || value === "action" || value === "combat";
}

function isPhaseStepId(value: unknown): value is PhaseStepId {
  return value === "player-window" || value === "move-decision" || value === "play-batch-draft" || value === "play-batch-commit" || value === "post-power-response" || value === "settlement";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
