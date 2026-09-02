import type { PhaseId, PhaseStepId, PlayerState } from "../domain/state/types.ts";
import type { AppendFromHandRule, CardAttribute } from "./content-types.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillEffectSpec, SkillTextClause } from "./skill-effects.ts";
import type { SkillRuleProgram } from "./skill-rule-program.ts";

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
  /** Number of cards drawn whenever this skill card is successfully played. */
  drawOnPlay?: number;
  /** Return this skill card to its owner's deck when its controller is defeated. */
  returnToDeckOnDefeat?: boolean;
  /** Hand size reached by the preparation draw for a confirmed passive. */
  preparationHandSize?: number;
  /** Location and resource amount for a confirmed enter-location passive. */
  locationId?: string;
  manaGain?: number;
  /** Standard-mode starting mana explicitly printed on a master passive. */
  initialMana?: number;
  /** Skill card definition to place in the owner's skill zone at game start. */
  addSkillDefinitionId?: string;
  /** Skill card definitions to place in the owner's skill zone at game start. */
  addSkillDefinitionIds?: string[];
  /** Card definition(s) to add to the owner's normal deck at game start. */
  addCardDefinitionId?: string;
  addCardCount?: number;
  /** Card definition to create in hand when this phase ability resolves. */
  addCardToHandDefinitionId?: string;
  /** Skill card definition activated by a confirmed round-start trigger. */
  activateSkillDefinitionId?: string;
  /** Skill card definition activated by a confirmed domain event. */
  activationTargetDefinitionId?: string;
  /** Static rule flags installed for the owner by a mandatory game-start passive. */
  playerFlags?: Record<string, boolean | number | string>;
  /** While this card is active, add this amount to each basic attack. */
  basicCardPowerBonus?: number;
  basePower?: number;
  typeLabel?: string;
  attributes?: string[];
  requirement?: number;
  /** Explicit override for cards whose printed requirement is waived by a rule. */
  requiresEightMana?: boolean;
  /** Explicit inverse mana gate printed on a card, e.g. "less than 8 mana". */
  maxManaExclusive?: number;
  /** Printed card cost reduction while the servant true name remains hidden. */
  hiddenTrueNameCostReduction?: number;
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
  /** Authored card contains a separately defined reverse effect. */
  hasReversalEffect?: boolean;
  playDrawIfWithBasicAttack?: number;
  appendFromHand?: AppendFromHandRule;
  /** Explicit card rule: this skill must be the only card in the standard attack. */
  singleCardPlay?: boolean;
  /** This card may be added on top of the ordinary standard-attack card count. */
  standardAppend?: boolean;
  /** Ordinary servant card abilities require their physical card to be active. */
  requiresActiveCard?: boolean;
  /** Independent effects printed on one physical skill card. */
  abilities?: SkillAbilityDefinition[];
  /** Mandatory domain events emitted after this card is successfully played. */
  passiveEventTypes?: string[];
  /** Combat-stage effect that zeroes matching opponent attack attributes. */
  combatPowerZeroAttribute?: CardAttribute;
  /** Structured aggregate combat-power change applied by a phase ability. */
  combatPowerBonus?: number;
  /** Passive combat history rule used by source-confirmed handlers. */
  combatHistory?: "leonardo-victory-streak" | "nanaya-contested-combat";
  /** Round-end score penalty confirmed by the authored card text. */
  roundEndVictoryPointLoss?: number;
  /** Optional location required by a round-end score penalty. */
  roundEndLocationId?: "workshop" | "mountain" | "city" | "scouting";
  /** Optional mana gain applied at round end using the pre-cleanup location. */
  roundEndManaGain?: number;
  /** Fixed batch of temporary attacks created by a confirmed phase ability. */
  derivedAttackBatch?: {
    count: number;
    definitionIds: string[];
  };
  /** Aggregate combat-power adjustment applied to eligible same-battlefield opponents. */
  opponentCombatPowerBonus?: number;
  /** Restrict the opponent aggregate modifier to players without deployment advantage. */
  opponentRequiresNoDeploymentBonus?: boolean;
  /** Confirmed defeat target scope for a phase ability. */
  defeatScope?: "all-combat-participants";
  /** Close one active attack and activate a hidden owned card of this definition. */
  closeActiveAndActivateHiddenDefinitionId?: string;
  /** Action-phase ability that doubles the owner's current deployment advantage. */
  doubleDeploymentBonus?: boolean;
  /** Defeat engaged opponents when the owner's active attack count is higher. */
  defeatEngagedOpponentsIfMoreActiveAttacks?: boolean;
  /** Combat ability that removes score from players above a mana threshold. */
  manaThresholdVictoryPointLoss?: { threshold: number; amount: number; opponentExtra: number };
  /** Deterministic clauses extracted from the authored text for migration. */
  effects?: SkillEffectSpec[];
  /** Clauses intentionally left for a dedicated handler. */
  unparsedEffects?: string[];
  /** Faithful text segmentation used for migration tracking; never directly executed. */
  clauses?: SkillTextClause[];
  /** Lossless rule program generated for every imported skill. */
  ruleProgram?: SkillRuleProgram;
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
