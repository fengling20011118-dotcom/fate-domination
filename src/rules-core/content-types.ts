import type { PhaseId, PhaseStepId } from "../domain/state/types.ts";
import type { SkillEffectSpec } from "./skill-effects.ts";
import type { SkillRuleProgram } from "./skill-rule-program.ts";

export interface AppendFromHandRule {
  maxCount: number;
  maxBasePower: number;
}

export interface CardDefinition {
  id: string;
  /** Content schema version for front-end/shared contract consumers. */
  version?: number;
  name: string;
  cardType?: "attack" | "skill" | "event" | "situation";
  ownerType?: "master" | "servant" | "common";
  ownerDefinitionId?: string;
  /** Links a catalog card to the executable SkillDefinition with a different ID. */
  linkedSkillId?: string;
  cost: number;
  /** Structured dynamic cost; display text is never parsed at runtime. */
  costRule?: { kind: "round-linear"; base: number; perRound: number; min: number };
  basePower: number;
  typeLabel: string;
  /** Structured card attributes; typeLabel remains display-only. */
  attributes?: string[];
  basic?: boolean;
  isSkill?: boolean;
  requiresEightMana?: boolean;
  /** Card may only be played while the controller has less than this mana. */
  maxManaExclusive?: number;
  /** Cost reduction that applies while the controller's true name is hidden. */
  hiddenTrueNameCostReduction?: number;
  ignoresSituationRestrictions?: boolean;
  residual?: boolean;
  /** Authored card contains a separately defined reverse effect. */
  hasReversalEffect?: boolean;
  skillOwnerType?: "master" | "servant";
  text?: string;
  phases?: PhaseId[];
  /** Optional structured micro-step window; omitted means any step in the phase. */
  steps?: PhaseStepId[];
  limit?: "once-per-game" | "once-per-round" | "once-per-turn";
  requiresTrueName?: boolean;
  /** Authoritative reveal trigger; runtime code must not infer this from display text. */
  revealsTrueNameOnPlay?: boolean;
  requiresHiddenTrueName?: boolean;
  playDrawIfWithBasicAttack?: number;
  /** Draw cards whenever this card is successfully committed. */
  drawOnPlay?: number;
  /** Return this card to its owner's deck when its controller is defeated. */
  returnToDeckOnDefeat?: boolean;
  appendFromHand?: AppendFromHandRule;
  /** Card explicitly replaces the normal two-card attack with a single-card play. */
  singleCardPlay?: boolean;
  /** This card may be added on top of the ordinary standard-attack card count. */
  standardAppend?: boolean;
  /** Shared once-per-round group also enforced when the card is played. */
  uniqueGroup?: string;
  tags?: string[];
  /** Structured deterministic effects extracted during content migration. */
  effects?: SkillEffectSpec[];
  /** Effects that could not be safely interpreted remain visible to audits. */
  unparsedEffects?: string[];
  /** Non-executable authored-text segments retained for migration and audit. */
  clauses?: import("./skill-effects.ts").SkillTextClause[];
  /** Lossless rule program shared with the linked skill definition. */
  ruleProgram?: SkillRuleProgram;
  /** Import/implementation status; runtime legality still checks structured fields. */
  implementation?: {
    level: "FULL" | "PARTIAL" | "MANUAL" | "DISABLED" | "host_adjudicated";
    handlerId?: string;
  };
  presentation?: {
    imageKey?: string;
    cardBackKey?: string;
  };
  sourceRefs?: Array<{ kind: string; document: string; locator?: string; page?: string; category?: string }>;
}

const KNOWN_ATTRIBUTES = ["力量", "迅捷", "魔术", "特殊", "宝具"] as const;
export type CardAttribute = typeof KNOWN_ATTRIBUTES[number];
const ATTRIBUTE_ALIASES: Record<string, CardAttribute> = {
  "力量": "力量",
  "敏捷": "迅捷",
  "迅捷": "迅捷",
  "魔法": "魔术",
  "魔术": "魔术",
  "特殊": "特殊",
  "宝具": "宝具",
};

/** Normalize explicitly authored attributes and reject unknown rule values. */
export function normalizeCardAttributes(values: string[]): CardAttribute[] {
  if (!Array.isArray(values)) throw new Error("CARD_ATTRIBUTES_INVALID");
  const result: CardAttribute[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !ATTRIBUTE_ALIASES[value]) throw new Error(`CARD_ATTRIBUTE_INVALID:${String(value)}`);
    const normalized = ATTRIBUTE_ALIASES[value];
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
}

/** Returns normalized rules attributes without parsing effect text. */
export function getCardAttributes(definition: Pick<CardDefinition, "attributes" | "typeLabel">): string[] {
  // Once authored, the structured list is authoritative, including an explicit
  // empty list. Display labels are only a legacy migration fallback.
  if (definition.attributes !== undefined) return normalizeCardAttributes(definition.attributes);
  const source = definition.typeLabel
    .split(/[\\/、,，|]/)
    .map((value) => value.trim());
  return [...new Set(source.map((value) => ATTRIBUTE_ALIASES[value]).filter((value): value is CardAttribute => Boolean(value)))];
}

export function hasCardAttribute(definition: Pick<CardDefinition, "attributes" | "typeLabel">, attribute: CardAttribute): boolean {
  return getCardAttributes(definition).includes(attribute);
}

export interface SituationDefinition {
  id: string;
  mana: number;
  climax?: boolean;
  text?: string;
  eventPlacement?: { mountain: number; city: number };
  forbiddenAttributes?: CardAttribute[];
  /** Structured combat modifiers; display text is never parsed at runtime. */
  combatPower?: SituationCombatPowerDefinition;
}

export interface SituationCombatPowerDefinition {
  cardAddByAttribute?: Partial<Record<CardAttribute, number>>;
  aggregateAddBySharedAttribute?: number;
  locations?: Array<"mountain" | "city">;
}

export interface EventDefinition {
  id: string;
  locationId?: "mountain" | "city";
  victoryPoints: number;
  text?: string;
}

export interface EventGroupDefinition {
  id: string;
  name: string;
  eventIds: string[];
  persistent?: boolean;
}
