import type { PhaseId, PhaseStepId } from "../domain/state/types.ts";
import type { SkillActivationKind, SkillDefinition, SkillUsageLimit } from "./skill-types.ts";
import type { SkillEffectSpec, SkillTextClause } from "./skill-effects.ts";

/**
 * A lossless, executable boundary for authored skill text.
 *
 * Deterministic effects are represented by normal effect nodes.  Everything
 * that still needs a dedicated rule handler remains an explicit unresolved
 * node instead of being silently discarded or promoted to FULL.
 */
export type SkillRuleNode =
  | { kind: "effect"; effect: SkillEffectSpec }
  | { kind: "handler"; handlerId: string; clauseIndexes: number[] }
  | { kind: "unresolved"; clauseIndex: number; text: string; reason: "choice" | "condition" | "target" | "lifecycle" | "custom" };

export interface SkillRuleProgram {
  schemaVersion: 1;
  skillId: string;
  activation: SkillActivationKind;
  windows: PhaseId[];
  steps?: PhaseStepId[];
  costs: { card: number; ability: number };
  limit?: SkillUsageLimit;
  constraints: {
    requiresEightMana?: boolean;
    requiresTrueName?: boolean;
    requiresHiddenTrueName?: boolean;
    requiresActiveCard?: boolean;
    attributes?: string[];
  };
  nodes: SkillRuleNode[];
  resolution: "deterministic" | "handler" | "requires-handler";
  sourceText: string;
  clauses: SkillTextClause[];
}

type ProgramInput = Pick<SkillDefinition, "id" | "activation" | "windows" | "steps" | "cost" | "abilityCost" | "limit" | "requiresEightMana" | "requiresTrueName" | "requiresHiddenTrueName" | "requiresActiveCard" | "attributes" | "text" | "effects" | "unparsedEffects" | "clauses" | "supportLevel" | "handlerId">;

/** Build a rule program for every skill, including skills that remain partial. */
export function buildSkillRuleProgram(skill: ProgramInput): SkillRuleProgram {
  const clauses = skill.clauses ? skill.clauses.map((clause) => ({ ...clause })) : [];
  const effects = (skill.effects ?? []).map((effect) => ({ kind: "effect", effect: { ...effect } } as SkillRuleNode));
  const unresolvedTexts = skill.unparsedEffects ?? [];
  const unresolvedCandidates = unresolvedTexts.map((text, index) => {
    const clause = clauses.find((item) => item.text === text);
    const clauseIndex = clause?.index ?? index;
    const reason = classifyUnresolvedClause(clause?.text ?? text, clause);
    return { kind: "unresolved", clauseIndex, text, reason } as SkillRuleNode;
  });
  const handlerNodes = skill.supportLevel === "FULL" && skill.handlerId && unresolvedCandidates.length > 0
    ? [{ kind: "handler" as const, handlerId: skill.handlerId, clauseIndexes: [...new Set(unresolvedCandidates.map((node) => node.clauseIndex))] }]
    : [];
  const unresolved = handlerNodes.length > 0 ? [] : unresolvedCandidates;
  return {
    schemaVersion: 1,
    skillId: skill.id,
    activation: skill.activation,
    windows: [...skill.windows],
    ...(skill.steps?.length ? { steps: [...skill.steps] } : {}),
    costs: { card: skill.cost, ability: skill.abilityCost ?? 0 },
    ...(skill.limit ? { limit: skill.limit } : {}),
    constraints: {
      ...(skill.requiresEightMana !== undefined ? { requiresEightMana: skill.requiresEightMana } : {}),
      ...(skill.requiresTrueName !== undefined ? { requiresTrueName: skill.requiresTrueName } : {}),
      ...(skill.requiresHiddenTrueName !== undefined ? { requiresHiddenTrueName: skill.requiresHiddenTrueName } : {}),
      ...(skill.requiresActiveCard !== undefined ? { requiresActiveCard: skill.requiresActiveCard } : {}),
      ...(skill.attributes?.length ? { attributes: [...skill.attributes] } : {}),
    },
    nodes: [...effects, ...handlerNodes, ...unresolved],
    resolution: unresolved.length > 0 ? "requires-handler" : handlerNodes.length > 0 ? "handler" : "deterministic",
    sourceText: skill.text,
    clauses,
  };
}

/** Validate the lossless program boundary before it enters the registry. */
export function assertSkillRuleProgram(program: SkillRuleProgram): void {
  if (program.schemaVersion !== 1 || typeof program.skillId !== "string" || program.skillId.length === 0) {
    throw new Error("SKILL_RULE_PROGRAM_INVALID");
  }
  if (!Array.isArray(program.windows) || !Array.isArray(program.nodes) || !Array.isArray(program.clauses)) {
    throw new Error("SKILL_RULE_PROGRAM_INVALID");
  }
  let unresolved = 0;
  let handlers = 0;
  for (const node of program.nodes) {
    if (node.kind === "effect") {
      if (!node.effect || typeof node.effect.kind !== "string") throw new Error("SKILL_RULE_PROGRAM_EFFECT_INVALID");
      continue;
    }
    if (node.kind === "handler") {
      if (typeof node.handlerId !== "string" || !node.handlerId || !Array.isArray(node.clauseIndexes)
        || node.clauseIndexes.length === 0 || node.clauseIndexes.some((index) => !Number.isInteger(index) || index < 0)) {
        throw new Error("SKILL_RULE_PROGRAM_HANDLER_INVALID");
      }
      handlers += 1;
      continue;
    }
    if (node.kind !== "unresolved" || !Number.isInteger(node.clauseIndex) || typeof node.text !== "string"
      || !["choice", "condition", "target", "lifecycle", "custom"].includes(node.reason)) {
      throw new Error("SKILL_RULE_PROGRAM_UNRESOLVED_INVALID");
    }
    unresolved += 1;
  }
  if (program.resolution === "deterministic" && (unresolved > 0 || handlers > 0)) throw new Error("SKILL_RULE_PROGRAM_RESOLUTION_MISMATCH");
  if (program.resolution === "requires-handler" && (unresolved === 0 || handlers > 0)) throw new Error("SKILL_RULE_PROGRAM_RESOLUTION_MISMATCH");
  if (program.resolution === "handler" && (handlers === 0 || unresolved > 0)) throw new Error("SKILL_RULE_PROGRAM_RESOLUTION_MISMATCH");
}

function classifyUnresolvedClause(text: string, clause?: SkillTextClause): "choice" | "condition" | "target" | "lifecycle" | "custom" {
  if (clause?.hasLifecycle || /残留|关闭|移除游戏|弃置|洗回|返回技能区|回合结束|回合开始|下回合/.test(text)) return "lifecycle";
  if (clause?.hasChoice || /选择|可以|可令|至多|任意|展示|若如此|询问/.test(text)) return "choice";
  if (/当|每当|若|如果|只有|无法|不能|除非/.test(text)) return "condition";
  if (/一名|所有|同一战场|同一地点|目标|对手|玩家/.test(text)) return "target";
  return "custom";
}
