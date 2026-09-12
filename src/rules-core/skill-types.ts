import type { PhaseId, PhaseStepId, PlayerState } from "../domain/state/types.ts";
import type { AppendFromHandRule, CardAttribute, CardPlayPrerequisite } from "./content-types.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillEffectSpec, SkillTextClause } from "./skill-effects.ts";
import type { SkillRuleProgram } from "./skill-rule-program.ts";
import type { FDCardAuthoringRules, FDAuthoringFormula } from "../content/authoring/types.ts";

export type SkillActivationKind = "passive" | "optional-trigger" | "phase" | "play" | "residual";
export type SkillSupportLevel = "FULL" | "PARTIAL" | "MANUAL" | "DISABLED";
export type SkillUsageLimit = "once-per-game" | "twice-per-game" | "once-per-round" | "twice-per-round" | "once-per-turn" | "unlimited";

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
  /** This individual ability ignores active situation/event attribute-use restrictions. */
  ignoresSituationRestrictions?: boolean;
  /** Successfully activating this specific optional/phase ability reveals the servant. */
  revealsTrueNameOnSkillUse?: boolean;
}

export interface SkillDefinition {
  id: string;
  name: string;
  ownerType: "master" | "servant";
  ownerId: string;
  /** False when this definition exists in the catalogue but the physical card is granted later by rules. */
  initiallyOwned?: boolean;
  /** Generic pre-game servant package replacement supplied by a Master rule. */
  startingServantOverride?: { servantId: string; deckDefinitionIds: string[] };
  /** Generic setup-time NPC combatant created before the first round begins. */
  startingNpcCombatant?: { id: string; name: string; basePower: number; presenceEventTag?: string };
  /** Setup-time named-event-pool cards injected randomly into the main objective deck before round 1. */
  startingNamedEventPoolInjection?: { poolId: string; count: number };
  /** Latest round in which this catalogue-only skill may be unlocked. */
  unlockLatestRound?: number;
  /** Card may be played only in a round where the named skill was already used. */
  requiresSkillUsedThisRound?: string;
  /** Structured physical/resource prerequisites consumed by the card-play transaction. */
  playPrerequisite?: CardPlayPrerequisite;
  /** Before an automatic discard-to-deck recycle, let this controller keep up to N physical cards in discard. */
  automaticDeckRecycleKeepMax?: number;
  /** Printed residual card-face property, separate from activation timing. */
  cardResidual?: boolean;
  activation: SkillActivationKind;
  windows: PhaseId[];
  steps?: PhaseStepId[];
  cost: number;
  /** Structured play-cost rule for cards whose printed cost changes by round. */
  costRule?:
    | { kind: "round-linear"; base: number; perRound: number; min: number }
    | { kind: "player-count-minus-round"; offset?: number; min: number };
  /** Player-declared play-time attribute choice; each distinct selected attribute adds the configured mana cost. */
  variablePlayAttributeChoice?: { allowedAttributes: CardAttribute[]; manaPerAttribute: number };
  /** Play-time single-attribute declaration stored on this physical skill card. */
  playAttributeDeclaration?: { allowedAttributes: CardAttribute[]; uniquePerGame?: boolean; repeatAllowedWithOwnedSkillId?: string };
  /** Card may only be played from its skill zone while its physical instance is activated. */
  requiresActiveInSkillZoneToPlay?: boolean;
  /** Player may explicitly choose a zero-cost play path with authored side effects. */
  optionalFreePlay?: { waiveEightMana?: boolean; revealTrueName?: boolean; nextRoundCombatPowerOverride?: number; requireSourcePresent?: boolean };
  /** Optional resource payment chosen instead of normal mana cost. */
  alternativePlayCost?: { resource: "victory-points"; amount: number };
  /** Another eligible player may pay this card's mana play cost when explicitly selected in structured play data. */
  alternateManaPayer?: { requireSameBattlefield?: boolean; requiredControlledDefinitionId?: string };
  /** Active source-card aura allowing an eligible external player to pay a fraction of this controller's attack mana cost. */
  attackManaShare?: { numerator: number; denominator: number; rounding: "ceil"; minimumPayerMana?: number; requiredRulerSealSourceId?: string };
  /** Catalogue ability is owned by any player currently controlling a Ruler Seal created by this source skill. */
  rulerSealControllerSourceId?: string;
  /** Reduce one other face-up card committed in the same attack batch. */
  pairedPlayOtherCostReduction?: number;
  pairedPlayOtherCostIncrease?: number;
  pairedWithDefinitionCostIncrease?: { definitionId: string; amount: number };
  pairedPlayOtherPowerBonus?: number;
  terrainAdvantageCostReduction?: boolean;
  commandSealPlayCost?: number;
  /** Additional victory points paid to play this card, on top of its mana cost. */
  victoryPointPlayCost?: number;
  /** Catalogue skill whose generated physical card is an ordinary attack rather than a skill-zone card. */
  materializedCardType?: "attack" | "skill";
  /** Generic player-state gate checked before this physical card may be played. */
  playRequiresPlayerFlag?: { key: string; value: boolean | number | string };
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
  /** Optional attribute filter for a basic-card power aura. */
  basicCardPowerBonusAttributes?: CardAttribute[];
  /** Optional controller-state condition for a basic-card power aura. */
  basicCardPowerBonusCondition?: { playerFlagEquals?: { key: string; value: boolean | number | string } };
  /** Active skill card grants its controller defeat-ignore while this condition holds. */
  playerDefeatIgnoreCondition?: { playerFlagEquals?: { key: string; value: boolean | number | string } };
  /** While active, opponents cannot close cards owned by this controller. */
  protectsControllerCardsFromOpponents?: boolean;
  /** While this physical skill card is active, cards owned by the same player gain attributes by definition id. */
  activeOwnedCardAttributeGrant?: { targetDefinitionIds: string[]; attributes: CardAttribute[] };
  /** While this physical skill source is present, matching active cards controlled by any player gain attributes. */
  globalActiveCardAttributeGrant?: { targetDefinitionIds: string[]; attributes: CardAttribute[] };
  /** Dynamic attribute transform while the player-id stored in this controller flag shares a battlefield. */
  linkedPlayerSameBattlefieldAttributeTransform?: { playerFlag: string; removeAttributes?: CardAttribute[]; addAttributes?: CardAttribute[] };
  basePower?: number;
  /** Structured printed variable power, independent from ability activation. */
  basePowerFormula?: FDAuthoringFormula;
  typeLabel?: string;
  attributes?: string[];
  requirement?: number;
  /** Explicit override for cards whose printed requirement is waived by a rule. */
  requiresEightMana?: boolean;
  /** Waive the skill-zone 8-mana gate while current printed base power is at most this value. */
  eightManaWaiverMaxPrintedBasePower?: number;
  /** Waive the normal skill 8-mana gate but add this play surcharge below the configured mana threshold. */
  lowManaSkillPlaySurcharge?: { thresholdExclusive: number; amount: number };
  /** Explicit inverse mana gate printed on a card, e.g. "less than 8 mana". */
  maxManaExclusive?: number;
  /** Printed card cost reduction while the servant true name remains hidden. */
  hiddenTrueNameCostReduction?: number;
  /** Cost reduction while the current situation forbids the specified attribute. */
  situationForbiddenAttributeCostReduction?: { attribute: CardAttribute; amount: number };
  /** Active card makes every other player ignore player-specific situation effects. */
  otherPlayersIgnoreSituationEffects?: boolean;
  /** Card can ignore situation-based play restrictions when explicitly confirmed. */
  ignoresSituationRestrictions?: boolean;
  text: string;
  sourceRefs?: SkillSourceRef[];
  supportLevel: SkillSupportLevel;
  handlerId?: string;
  tags?: string[];
  /** Executable abilities exposed by the physical card face rather than SkillRegistry activation. */
  cardAbilityIds?: string[];
  /** Phase windows for physical card abilities; kept separate from skill activation windows. */
  cardAbilityPhases?: PhaseId[];
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
  /** Turning this card to its authored reverse effect reveals its servant's true name. */
  revealsTrueNameOnReverse?: boolean;
  /** Alter Ego transforms close their source by default; EX variants can opt out. */
  alterEgoCloseSource?: boolean;
  playDrawIfWithBasicAttack?: number;
  appendFromHand?: AppendFromHandRule;
  /** Explicit card rule: this skill must be the only card in the standard attack. */
  singleCardPlay?: boolean;
  /** Explicit card rule: this skill must be the only card played by its controller this round. */
  roundExclusivePlay?: boolean;
  /** This card may be added on top of the ordinary standard-attack card count. */
  standardAppend?: boolean;
  standardAppendIfBoardDefinitionAtControllerLocation?: string[];
  basePowerPerSameLocationOpponent?: number;
  basePowerZeroIfBoardDefinitionAtControllerLocation?: string[];
  standardAppendRequiresOwnedSkillId?: string;
  standardAppendStackGroup?: string;
  standardAppendRequiresBatchCards?: { minCount: number; attributesAny?: CardAttribute[] };
  /** Passive alternate attack rule copied onto the physical skill definition. */
  faceDownAttackFollowup?: { exactCount: number; definitionId: string };
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
  /** Aggregate combat-power change applied only when a paired effect movement cannot resolve. */
  combatPowerBonusIfMoveImpossible?: number;
  /** Add total paid costs of this battlefield's attacks played this round to aggregate combat power. */
  combatPowerBonusFromBattlefieldPlayedCosts?: boolean;
  /** Add a formula per same-battlefield opponent who used a command seal this round. */
  combatPowerBonusPerCommandSealUser?: { base: number; ownCommandSealMultiplier: number; includeRulerCommandSeals?: boolean };
  /** Apply Sanson's confirmed high-victory combat threshold rule. */
  highVictoryCombatPowerRule?: { penalty: number; selfBonusIfTopOpponentEngaged: number };
  /** Apply resource and aggregate power to same-battlefield opponents per costly active attack. */
  opponentBonusPerCostlyAttack?: { minPaidCost: number; mana: number; combatPower: number };
  /** Modify each eligible same-battlefield opponent active attack. */
  opponentAttackPowerModifier?: { hiddenTrueNameAmount: number; revealedTrueNameAmount: number; excludeGuardedByOwner?: boolean };
  /** Add power to this physical skill card per current event card placed by the situation. */
  eventCardPowerBonus?: { perEvent: number };
  /** Award victory points if a marked opponent loses combat this round. */
  markedDefeatVictoryPointReward?: number;
  /** Maximum variable mana that may be converted into aggregate combat power. */
  variableManaPowerBonusMax?: number;
  /** Publicly reveal the owner's hand until the current round ends. */
  revealHandUntilRoundEnd?: boolean;
  /** Draw this many cards when the game enters combat this round after activation. */
  combatStartDrawCount?: number;
  /** Reveal/check hand and add aggregate combat power by matching card base power. */
  revealHandPowerBonus?: { minBasePower: number; perCard: number; max: number };
  /** Phase ability can only be used while deployed to a battlefield. */
  requiresBattlefieldLocation?: boolean;
  /** If this skill was activated and not played before round end, set mana to zero. */
  roundEndLoseAllManaUnlessPlayedSelf?: boolean;
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
  /** Create effect-sourced cards attached to this skill card, then append-play one attached card per activation. */
  attachedSupplyAppend?: {
    definitionIds: string[];
    drawAfterAppend?: number;
    sourceEvent?: "card.played";
  };
  /** Multi-ability active attack: keep one selected basic attack or boost own active attacks. */
  activeAttackLifecycleBoost?: {
    residualAbilityId: string;
    boostAbilityId: string;
    residualRoundOffset: number;
    boostAttribute: CardAttribute;
    boostPower: number;
  };
  /** Aggregate combat-power adjustment applied to eligible same-battlefield opponents. */
  opponentCombatPowerBonus?: number;
  /** Free effect movement that follows the board arrow by this many locations if possible. */
  moveForwardSteps?: number;
  /** Restrict the opponent aggregate modifier to players without deployment advantage. */
  opponentRequiresNoDeploymentBonus?: boolean;
  /** Restrict the opponent aggregate modifier to players who have not used/spent a command seal this round. */
  opponentRequiresNoCommandSealThisRound?: boolean;
  /** Confirmed defeat target scope for a phase ability. */
  defeatScope?: "all-combat-participants";
  /** Close one active attack and activate a hidden owned card of this definition. */
  closeActiveAndActivateHiddenDefinitionId?: string;
  /** Action-phase ability that doubles the owner's current deployment advantage. */
  doubleDeploymentBonus?: boolean;
  /** Passive ownership of currently unclaimed printed battlefield terrain spaces. */
  unoccupiedTerrainLocations?: Array<"mountain" | "city">;
  /** Defeat engaged opponents when the owner's active attack count is higher. */
  defeatEngagedOpponentsIfMoreActiveAttacks?: boolean;
  /** Combat ability that removes score from players above a mana threshold. */
  manaThresholdVictoryPointLoss?: { threshold: number; amount: number; opponentExtra: number };
  /** Move a remembered same-battlefield opponent here, discard a random hand card, then penalize opponents by its base power. */
  rashomonGrudge?: { powerLossScope: "same-battlefield-opponents" };
  /** Elizabeth Bathory volume-token combat power rule. */
  elizabethVolumePower?: { perMarker: number; max: number };
  /** Elizabeth Bathory vocal performance: gain volume per opponent and add it to this card's power. */
  elizabethVocalPerformance?: { markersPerOpponent: number; loseIfNoCombatThisRound: number };
  /** Elizabeth Bathory combat-loss volume penalty. */
  elizabethVolumeLossOnCombatLoss?: number;
  /** Elizabeth Bathory Iron Maiden post-combat reward/punishment rule. */
  elizabethIronMaiden?: { loserVictoryPointLoss: number; controllerVictoryPointGainIfIncludesOverallLowest: number };
  /** Deterministic clauses extracted from the authored text for migration. */
  effects?: SkillEffectSpec[];
  /** Clauses intentionally left for a dedicated handler. */
  unparsedEffects?: string[];
  /** Faithful text segmentation used for migration tracking; never directly executed. */
  clauses?: SkillTextClause[];
  /** Lossless rule program generated for every imported skill. */
  ruleProgram?: SkillRuleProgram;
  /** Lossless authoring rules following fd-card-authoring-v1. */
  rules?: FDCardAuthoringRules;
}

export interface SkillContext {
  state: import("../domain/state/types.ts").GameState;
  player: PlayerState;
  skill: SkillDefinition;
  payload: unknown;
  openDecision(decision: import("../domain/state/types.ts").PendingDecision): void;
  /** Emits an authoritative domain event produced by a rule/effect. */
  emitEvent?: (type: string, payload: unknown) => void;
  /** Execute one physical card ability through the authoritative card-ability registry.
   * Skill effects that say “play a card, then immediately use its ability” must use
   * this boundary instead of reimplementing card text or bypassing usage/phase rules. */
  executeCardAbility?: (instanceId: string, abilityId: string, target?: unknown, options?: { timingOverride?: boolean }) => void;
  randomInt?: (maxExclusive: number) => number;
  definitions?: Record<string, CardDefinition>;
  runtimeCatalog?: SkillRuntimeCatalog;
}

/** Immutable content facts needed by rare runtime identity/package replacements. */
export interface SkillRuntimeCatalog {
  servantDecks: Readonly<Record<string, readonly string[]>>;
  /** Printed Servant class keyed by Servant definition id. */
  servantClasses: Readonly<Record<string, string>>;
  skillDefinitions: readonly SkillDefinition[];
  masterInitialMana: Readonly<Record<string, number>>;
}

export type SkillHandler = (context: SkillContext) => unknown;
export type SkillLegalityPredicate = (
  state: import("../domain/state/types.ts").GameState,
  playerId: string,
  skill: SkillDefinition,
  ability?: SkillAbilityDefinition,
  definitions?: Record<string, CardDefinition>,
) => boolean;
