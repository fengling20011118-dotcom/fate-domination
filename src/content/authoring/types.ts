import type { CardZone, PhaseId, PhaseStepId } from "../../domain/state/types.ts";
import type { CardAttribute } from "../../rules-core/content-types.ts";
import type { SkillSourceRef } from "../../rules-core/skill-types.ts";

export const FD_CARD_AUTHORING_SCHEMA_VERSION = "fd-card-authoring-v1" as const;

export type FDCardAuthoringSchemaVersion = typeof FD_CARD_AUTHORING_SCHEMA_VERSION;

export type FDAuthoringAbilityKind =
  | "passive"
  | "play_trigger"
  | "phase_action"
  | "response"
  | "residual";

export type FDAuthoringExecutionMode =
  | "automatic"
  | "handler"
  | "host_adjudicated"
  | "text_unconfirmed"
  | "unsupported";

export type FDAuthoringHostOperation =
  | "adjust-mana"
  | "adjust-victory-points"
  | "move-card"
  | "create-status"
  | "skip-ability";

export type FDAuthoringVisibility =
  | "public"
  | "private_to_controller"
  | "private_to_host"
  | "reveal_result_only"
  | "hidden_until_resolved";

export interface FDAuthoringCardFace {
  typeLabel?: string;
  cost?: number;
  basePower?: number;
  /** Printed variable base power represented as a controlled formula AST. */
  basePowerFormula?: FDAuthoringFormula;
  attributes?: CardAttribute[];
  /** Printed residual card-face property; independent from ability activation timing. */
  residual?: boolean;
  requirement?: { type: "min_mana"; value: number } | { type: "none" };
}

export interface FDAuthoringActivation {
  phase?: PhaseId;
  phases?: PhaseId[];
  step?: PhaseStepId;
}

export interface FDAuthoringExecution {
  mode: FDAuthoringExecutionMode;
  reason?: string;
  handlerId?: string;
  allowedOperations?: FDAuthoringHostOperation[];
}

export interface FDAuthoringResponseWindow {
  opens: string;
  responders?: Record<string, unknown>;
  priority?: "turn_order" | "active_player_first" | "host_order";
  visibility?: Record<string, unknown>;
  closeCondition?: "controller_resolves_or_passes" | "all_eligible_players_pass_or_resolve" | "first_response_resolves" | "host_closes";
  passBehavior?: "decline_this_window";
}

export interface FDAuthoringLifecycle {
  duration?: "this_round" | "while_active" | "until_card_closed" | "until_condition_met" | "permanent" | string;
  starts?: "immediate" | "next_round" | "next_phase" | "on_condition_met" | string;
  cleanup?: "close_at_round_end" | "remain_active" | "discard_at_round_end" | "return_to_deck_on_defeat" | "remove_from_game" | string;
  expiresOn?: string[];
}

export type FDAuthoringFormula =
  | number
  | { formula: string }
  | { type: "constant"; value: number }
  | { type: "metric"; metric: string; source?: string; key?: string; locationIds?: string[] }
  | { type: "effect_result"; effectId: string; field: string }
  | { type: "formula"; op: string; args: FDAuthoringFormula[] };

export interface FDAuthoringTarget {
  id: string;
  type: "player" | "card" | "host_choice" | string;
  scope?: string;
  count?: { min?: number; max?: number };
  required?: boolean;
  visibility?: FDAuthoringVisibility;
  constraints?: Record<string, unknown>;
}

export interface FDAuthoringEffect {
  id?: string;
  printedClause?: string;
  type: string;
  target?: string | Record<string, unknown>;
  amount?: FDAuthoringFormula;
  [key: string]: unknown;
}

export interface FDAuthoringRuleModifier {
  id: string;
  printedClause?: string;
  type?: string;
  operation: "allow" | "forbid" | "replace" | "add" | "subtract" | "multiply" | "set" | "ignore";
  rule: string;
  scope?: Record<string, unknown>;
  value?: FDAuthoringFormula;
  lifecycle?: FDAuthoringLifecycle;
  priority?: {
    tier?: "base_rule" | "situation" | "event" | "card_text" | "mode_rule" | "host_ruling";
    specificity?: "general" | "normal" | "specific" | "explicit_exception";
  };
  conflictPolicy?: "forbid_over_allow" | "explicit_exception_over_general" | "latest_effect_wins" | "higher_priority_wins" | "host_required";
  /** Dynamic targets may defer installation until a structured choice resolves. */
  installation?: "automatic" | "effect";
}

export interface FDAuthoringCreateSpec {
  id: string;
  printedClause?: string;
  type: "card" | string;
  definitionId?: string;
  linkedSkillId?: string;
  zone?: string;
  boardLocationId?: string;
  count?: FDAuthoringFormula;
  target?: string | Record<string, unknown>;
  face?: "up" | "down";
  active?: boolean;
  residual?: boolean;
  temporary?: boolean;
  skipIfExists?: boolean;
  lifecycle?: FDAuthoringLifecycle;
  [key: string]: unknown;
}

export interface FDAuthoringCopySpec {
  id: string;
  printedClause?: string;
  source?: "selected_card" | { type: "linked_skill"; linkedSkillId: string; zones?: string[]; temporary?: boolean };
  zone?: string;
  boardLocationId?: string;
  target?: string | Record<string, unknown>;
  face?: "up" | "down";
  active?: boolean;
  residual?: boolean;
  temporary?: boolean;
  copyRuntimeAttributes?: boolean;
  skipIfExists?: boolean;
  lifecycle?: FDAuthoringLifecycle;
  [key: string]: unknown;
}

export interface FDAuthoringGrantedCardAbility {
  id: string;
  name?: string;
  activation: { phase: PhaseId; step?: PhaseStepId };
  limit?: "once-per-round";
  /** Optional dedicated runtime for a genuinely unique granted ability. */
  handlerId?: string;
  /** Defaults to an already-active attack card. Passive/phase text may opt into hand/skill zones. */
  allowedZones?: CardZone[];
  /** FQA exception for 被动/XX阶段 abilities available from hand or a skill zone. */
  allowInactive?: boolean;
  ruleModifiers?: FDAuthoringRuleModifier[];
}

export interface FDAuthoringTransformSpec {
  id: string;
  printedClause?: string;
  /** Continuous card transformation; other transform types must be implemented before automatic use. */
  type?: "card" | string;
  target?: {
    subject?: "controller" | "all_players" | "opponents" | string;
    cards?: {
      basic?: boolean;
      skill?: boolean;
      definitionIds?: string[];
      attributesAny?: string[];
      attributesAll?: string[];
      tagsAny?: string[];
    };
  };
  set?: { name?: string };
  grantAbilities?: FDAuthoringGrantedCardAbility[];
  lifecycle?: FDAuthoringLifecycle;
  [key: string]: unknown;
}

export interface FDAuthoringAbility {
  id: string;
  /** Stable display label for runtime action surfaces; never parsed for legality. */
  name?: string;
  printedClause: string;
  markers?: string[];
  kind: FDAuthoringAbilityKind;
  activation?: FDAuthoringActivation;
  responseWindow?: FDAuthoringResponseWindow;
  cost?: Record<string, unknown>;
  conditions?: Array<Record<string, unknown>>;
  targets?: FDAuthoringTarget[];
  effects?: FDAuthoringEffect[];
  ruleModifiers?: FDAuthoringRuleModifier[];
  creates?: FDAuthoringCreateSpec[];
  copies?: FDAuthoringCopySpec[];
  transforms?: FDAuthoringTransformSpec[];
  lifecycle?: FDAuthoringLifecycle;
  visibility?: {
    revealsTrueName?: boolean;
    revealTiming?: "on_use_declared" | "on_resolve" | string;
    revealScope?: "servant_package" | string;
  };
  execution?: FDAuthoringExecution;
  ambiguities?: string[];
  unmodeledClauses?: string[];
}

export interface FDCardAuthoringRules {
  schemaVersion: FDCardAuthoringSchemaVersion;
  aliases?: string[];
  cardFace?: FDAuthoringCardFace;
  playRequirements?: Array<Record<string, unknown>>;
  abilities: FDAuthoringAbility[];
  evidence?: SkillSourceRef[];
  verification?: Record<string, unknown>;
  ambiguities?: string[];
  unmodeledClauses?: string[];
}

export interface FDAuthoringSkillCard {
  id: string;
  aliases?: string[];
  ownerType: "master" | "servant";
  ownerId: string;
  name: string;
  printedText: string;
  /** Whether the physical skill card exists in the owner's skill zone before game-start effects resolve. */
  initiallyOwned?: boolean;
  cardFace?: FDAuthoringCardFace;
  playRequirements?: Array<Record<string, unknown>>;
  abilities: FDAuthoringAbility[];
  evidence?: SkillSourceRef[];
  verification?: Record<string, unknown>;
  ambiguities?: string[];
  unmodeledClauses?: string[];
}

export type FDAuthoringAdapterSeverity = "info" | "warning" | "error" | "blocking";

export interface FDAuthoringAdapterReportItem {
  severity: FDAuthoringAdapterSeverity;
  cardId: string;
  field: string;
  message: string;
  requiredAction: string;
}
