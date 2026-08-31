import type { PhaseId, PhaseStepId, PlayerState } from "../domain/state/types.ts";
import type { AppendFromHandRule, CardAttribute } from "./content-types.ts";
import type { CardDefinition } from "./content-types.ts";

export type SkillActivationKind = "passive" | "optional-trigger" | "phase" | "play" | "residual";
export type SkillSupportLevel = "FULL" | "PARTIAL" | "MANUAL" | "DISABLED";
export type SkillUsageLimit = "once-per-game" | "once-per-round" | "once-per-turn";

/** Traceable rule evidence for a skill definition; never used to execute rules. */
export interface SkillSourceRef {
  kind: "development-image" | "chm" | "rulebook" | "fqa" | "keywords" | "three-x" | "user-confirmed" | "legacy";
  document: string;
  locator?: string;
  page?: string;
  category?: string;
}

/** A separately activatable effect printed on a multi-ability skill card. */
export interface SkillAbilityDefinition {
  id: string;
  name: string;
  activation: SkillActivationKind;
  windows: PhaseId[];
  steps?: PhaseStepId[];
  abilityCost?: number;
  limit?: SkillUsageLimit;
  /** Keyword 唯一 group; only one ability in the group may resolve per round. */
  uniqueGroup?: string;
  handlerId?: string;
  requiresActiveCard?: boolean;
}

export interface SkillDefinition {
  id: string;
  name: string;
  ownerType: "master" | "servant";
  ownerId: string;
  activation: SkillActivationKind;
  windows: PhaseId[];
  steps?: PhaseStepId[];
  cost: number;
  /** Structured play-cost rule for cards whose printed cost changes by round. */
  costRule?: { kind: "round-linear"; base: number; perRound: number; min: number };
  /** Cost printed for using the phase ability itself, separate from playing the card. */
  abilityCost?: number;
  /** Number of cards drawn by a confirmed generic draw ability. */
  drawCount?: number;
  /** Location and resource amount for a confirmed enter-location passive. */
  locationId?: string;
  manaGain?: number;
  basePower?: number;
  typeLabel?: string;
  attributes?: string[];
  requirement?: number;
  /** Explicit override for cards whose printed requirement is waived by a rule. */
  requiresEightMana?: boolean;
  /** Card can ignore situation-based play restrictions when explicitly confirmed. */
  ignoresSituationRestrictions?: boolean;
  text: string;
  sourceRefs?: SkillSourceRef[];
  supportLevel: SkillSupportLevel;
  handlerId?: string;
  tags?: string[];
  limit?: SkillUsageLimit;
  /** Keyword 唯一 group shared by equivalent abilities on multiple cards. */
  uniqueGroup?: string;
  requiresTrueName?: boolean;
  /** Playing this card face-up reveals its servant's true name after the play succeeds. */
  revealsTrueNameOnPlay?: boolean;
  /** Successfully activating this optional/phase ability reveals the servant. */
  revealsTrueNameOnSkillUse?: boolean;
  requiresHiddenTrueName?: boolean;
  playDrawIfWithBasicAttack?: number;
  appendFromHand?: AppendFromHandRule;
  /** Explicit card rule: this skill must be the only card in the standard attack. */
  singleCardPlay?: boolean;
  /** Ordinary servant card abilities require their physical card to be active. */
  requiresActiveCard?: boolean;
  /** Independent effects printed on one physical skill card. */
  abilities?: SkillAbilityDefinition[];
  /** Mandatory domain events emitted after this card is successfully played. */
  passiveEventTypes?: string[];
  /** Combat-stage effect that zeroes matching opponent attack attributes. */
  combatPowerZeroAttribute?: CardAttribute;
}

export interface SkillContext {
  state: import("../domain/state/types.ts").GameState;
  player: PlayerState;
  skill: SkillDefinition;
  payload: unknown;
  openDecision(decision: import("../domain/state/types.ts").PendingDecision): void;
  randomInt?: (maxExclusive: number) => number;
  definitions?: Record<string, CardDefinition>;
}

export type SkillHandler = (context: SkillContext) => unknown;
export type SkillLegalityPredicate = (
  state: import("../domain/state/types.ts").GameState,
  playerId: string,
  skill: SkillDefinition,
  ability?: SkillAbilityDefinition,
  definitions?: Record<string, CardDefinition>,
) => boolean;
