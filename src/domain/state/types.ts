export type GameStatus = "lobby" | "setup" | "playing" | "finished";
export type GameMode = "standard" | "three-x";
export type PhaseId = "preparation" | "outpost" | "action" | "combat";
export type PhaseStepId =
  | "player-window"
  | "move-decision"
  | "play-batch-draft"
  | "play-batch-commit"
  | "post-power-response"
  | "settlement";

export type CardZone =
  | "master-skills"
  | "servant-skills"
  | "deck"
  | "hand"
  | "attack"
  | "attached"
  | "discard"
  | "removed"
  | "board"
  | "event-deck"
  | "event-discard"
  | "situation-deck"
  | "situation-discard"
  /** Generic isolated physical-card zones owned by a named side deck/pool. */
  | "side-deck"
  | "side-hand"
  | "side-discard";

export interface SkillUsageLimitOverride {
  id: string;
  sourceId: string;
  targetSkillId: string;
  limit: "once-per-game" | "twice-per-game" | "once-per-round" | "twice-per-round" | "once-per-turn" | "unlimited";
  /** Inclusive round in which this override applies. */
  round: number;
}

export interface PlayerState {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  ready: boolean;
  eliminated: boolean;
  defeated: boolean;
  masterId: string | null;
  servantId: string | null;
  /** Additional printed Servant identities granted by explicit rules such as Magical Sapphire. */
  servantIdentityAliases?: string[];
  /** Additional printed Servant classes granted alongside identity aliases. */
  servantClassAliases?: string[];
  identityRevealed: boolean;
  trueNameRevealed: boolean;
  /** Structured public/hidden form state selected by authored rules; never parsed from display text. */
  form: string | null;
  locationId: string | null;
  mana: number;
  victoryPoints: number;
  commandSeals: number;
  hand: string[];
  deck: string[];
  discard: string[];
  attack: string[];
  masterSkills: string[];
  servantSkills: string[];
  statuses: string[];
  /** Canonical player ids that shared a battlefield with this player at least once this round. */
  sharedBattlefieldPlayerIdsThisRound: string[];
  /** Ordered locations newly passed through or stopped at this round; duplicates are meaningful. */
  locationsPassedThisRound: string[];
  /** Structured, source-bound changes to how specific cards may be played. */
  cardRuleModifiers?: CardRuleModifier[];
  /** Persistent/temporary stackable statuses that modify aggregate combat power without parsing display text. */
  stackedStatusModifiers?: StackedStatusModifier[];
  /** Temporary, source-bound overrides for another skill's per-ability usage limit. */
  skillUsageLimitOverrides?: SkillUsageLimitOverride[];
  /** One-shot permissions to reuse a specific activated ability after its ordinary usage limit was exhausted. */
  abilityReuseGrants?: AbilityReuseGrantState[];
  /** Source-bound, round-limited bans on using specific skill definitions. */
  skillUseBlocks?: SkillUseBlockState[];
  /** Per-definition play-time attribute declarations already used this game. */
  playAttributeDeclarations?: Record<string, string[]>;
  /**
   * Round-scoped restriction on which physical cards may be played. Some rules
   * also allow one restricted-out card to be played by discarding one of the
   * permitted cards as a structured substitution cost.
   */
  roundPlayRestriction?: {
    round: number;
    sourceId: string;
    allowedInstanceIds: string[];
    substitution?: {
      eligibleDiscardInstanceIds: string[];
      targetKind: "skill";
      costReduction: number;
    };
  };
  usage: Record<string, { round?: number; phase?: PhaseId; used?: boolean; usedGame?: boolean; count?: number }>;
  /** Authored named counters such as Food, Bloodlust, Control, etc. */
  customResources?: Record<string, number>;
  /** Generic resource-driven card power rules installed by authored skills. */
  resourcePowerRules?: ResourcePowerRule[];
  /** Source-bound partition rules for attacks belonging to the current Servant package. */
  servantAttackPartitionRules?: ServantAttackPartitionRule[];
  flags: Record<string, boolean | number | string>;
}

export interface ResourcePowerRule {
  sourceId: string;
  resourceId: string;
  perUnit: number;
  basicOnly?: boolean;
  attributesAny?: string[];
}

export interface ServantAttackPartitionRule {
  id: string;
  sourceId: string;
  servantId: string;
  firstGroupDefinitionIds: string[];
  secondGroupDefinitionIds: string[];
  /** If both ordinary face-up cards belong to this package, require one from each group. */
  requireMixedRegularPair?: boolean;
  /** Repeat additive/multiplicative power-altering effects this many total times. */
  powerAlterationApplications?: number;
}

export interface AbilityReuseGrantState {
  kind: "skill" | "card";
  sourceId: string;
  round: number;
  abilityId: string;
  targetSkillId?: string;
  targetInstanceId?: string;
  /** Number of one-shot reuses still available; omitted means one for legacy snapshots. */
  remainingUses?: number;
}

export interface SkillUseBlockState {
  id: string;
  sourceId: string;
  throughRound: number;
  /** Definition-wide blocks (for example, copied-skill suppression). */
  definitionIds: string[];
  /** Optional physical-card scope for effects that disable one specific Skill card. */
  instanceIds?: string[];
  /** Controller of the opposing ability that created this block, when relevant to ability-immunity rules. */
  sourcePlayerId?: string;
}

export interface StackedStatusModifier {
  /** Stable source-scoped status identity; multiple applications increment count instead of duplicating records. */
  id: string;
  sourceId: string;
  sourcePlayerId?: string;
  count: number;
  /** Aggregate combat-power delta applied once per stack. Negative values are penalties. */
  totalPowerPerStack: number;
  /** Only this many stacks contribute to aggregate combat power; the status count itself may continue increasing. */
  maxPowerStacks?: number;
  /** Optional additional mana paid by the affected player when a rule removes one stack. */
  removalManaCost?: number;
  /** Optional source-owned upgrade that changes every existing and future stack without rewriting old status records. */
  upgradeSourceDefinitionId?: string;
  upgradedTotalPowerPerStack?: number;
  upgradedRemovalManaCost?: number;
}

export interface CardRuleModifier {
  id: string;
  sourceId: string;
  targetDefinitionIds: string[];
  /** Optional instance scope for one-card effects; omitted means every matching definition. */
  targetInstanceIds?: string[];
  waiveEightMana?: boolean;
  /** Temporarily ignore this card definition's printed usage limit. */
  ignoreUsageLimit?: boolean;
  /** Override the matching physical card's play usage limit while this modifier applies. */
  usageLimitOverride?: "once-per-game" | "twice-per-game" | "once-per-round" | "twice-per-round" | "once-per-turn" | "unlimited";
  /** Treat this card as residual while the modifier applies. */
  grantResidual?: boolean;
  /** Treat this matching card as a standard-attack append while the modifier applies. */
  grantStandardAppend?: boolean;
  /** Forbid playing matching cards while this modifier applies. */
  forbidPlay?: boolean;
  /** Optional inclusive round offset for a temporary residual grant: 0=current round end, 1=next round end. */
  residualUntilRoundOffset?: number;
  /** Explicit exception to the base rule that skill cards cannot be committed face-down. */
  allowFaceDownPlay?: boolean;
  /** Allow this active card's printed action-phase abilities to be used during combat. */
  allowActionAbilityInCombat?: boolean;
  /** Optional combat-window usage limit for this physical card's action abilities. */
  actionAbilityCombatLimit?: "once-per-round" | "twice-per-round";
  /** Action-phase ability ids that must resolve before this controller may leave their combat player window. */
  mandatoryActionAbilityInCombatIds?: string[];
  /** Semantic card-name replacement; effects that care about a card name must use the rules-core effective-name helper. */
  nameOverride?: string;
  /** Executable abilities granted to the matching physical card without changing its printed definition. */
  grantAbilities?: Array<{ id: string; phases: PhaseId[] }>;
  costOverride?: number;
  costAdd?: number;
  /** Override an additional victory-point play cost while this modifier applies. */
  victoryPointPlayCostOverride?: number;
  /** Reduce this card's same-batch play cost by other face-up attack costs, excluding an optional tag. */
  sameBatchOtherAttackCostReduction?: { excludeTag?: string };
  /** Attributes granted to matching physical cards while this modifier applies. */
  grantAttributes?: string[];
  /** Replace matching cards' effective attributes instead of adding to them. */
  replaceAttributes?: string[];
  /** After all grants/transforms, retain only these attributes on matching cards. */
  retainAttributes?: string[];
  /** Attributes granted only while calculating combat power; normal play/legality still sees the printed/runtime card attributes. */
  grantCombatAttributes?: string[];
  /** Matching cards ignore all power reductions while preserving increases. */
  preventPowerReduction?: boolean;
  /** Matching cards ignore power reductions originating from other players only. */
  preventOpponentPowerReduction?: boolean;
  /** Optional effective-attribute scope for protection fields on this modifier. */
  protectionAttributes?: string[];
  /** Opponent-controlled abilities cannot close matching cards; ordinary cleanup and self-costs are unaffected. */
  preventOpponentClose?: boolean;
  /** Closing a matching active card is postponed until the current combat ends. */
  deferCloseUntilCombatEnd?: boolean;
  /** Additive combat power applied to the matching card while the modifier is applicable. */
  powerAdd?: number;
  /** Multiplier for additive power granted by attached upgrade cards. */
  attachmentPowerBonusMultiplier?: number;
  /** Upper bound applied after all combat-power changes for this matching card. */
  powerCeiling?: number;
  /** Dynamic power per active controlled attack whose current attribute set is unique among that attack group. */
  powerAddPerUniqueControlledAttackTypeSet?: number;
  /** Dynamic power per other player who is currently defeated or eliminated. */
  powerAddPerDefeatedOrEliminatedOpponent?: number;
  /** Optional generic runtime condition for this modifier. */
  condition?: {
    allOtherBattlefieldPlayersHaveStatus?: string;
    /** Source controller and target player must currently share a battlefield. */
    sourceControllerSameBattlefield?: boolean;
    /** Matching physical card must currently be in the attack zone. */
    targetZoneAttack?: boolean;
    /** Matching physical card must currently be in the owner's hand. */
    targetZoneHand?: boolean;
    /** Matching physical card must currently be active and face-up. */
    targetActiveFaceUp?: boolean;
    /** The modifier's physical source must currently remain active and face-up. */
    sourceActive?: boolean;
    /** At least one other living player at this location must control the named active card. */
    anyOpponentAtLocationControlsDefinitionId?: { locationId: string; definitionId: string };
  };
  ignoreSituationRestrictions?: boolean;
  duration: "round" | "game" | "while-source-active" | "while-source-present";
  sourceInstanceId?: string;
}

export interface CardPowerModifier {
  id: string;
  sourceId: string;
  kind: "add" | "set" | "multiply";
  value: number;
  duration: "round" | "game";
  /** Optional authored rounding applied immediately after this multiplicative modifier. */
  rounding?: "floor" | "ceil" | "round";
}

export interface CardCostModifier {
  id: string;
  sourceId: string;
  kind: "add";
  value: number;
  duration: "round" | "game";
  /** Final cost floor imposed by this modifier family, as a fraction of printed/calculated printed cost. */
  minPrintedFraction?: number;
}

export interface CardInstance {
  instanceId: string;
  definitionId: string;
  ownerPlayerId: string | null;
  controllerPlayerId: string | null;
  /** Stable identity provenance for cards that belonged to a Master's original package. */
  originMasterId?: string;
  /** Stable identity provenance for cards that belonged to a Servant's original package. */
  originServantId?: string;
  zone: CardZone;
  face: "up" | "down";
  active: boolean;
  /** Source ids that intercepted an attempted close until combat end. */
  deferredCloseAfterCombatSourceIds?: string[];
  /** Source ids whose continuous rules currently make this physical card lose its rules text. */
  textSuppressedBySourceIds?: string[];
  residual: boolean;
  /** Inclusive round-end through which a temporary residual grant remains active. Undefined means the residual has its normal unbounded/card-defined lifecycle. */
  residualUntilRound?: number;
  temporary: boolean;
  /** Host card while this card is placed on/under another physical card. */
  attachedToInstanceId?: string;
  /** Monotonic order within one attachment stack; larger values are closer to the top. */
  attachmentOrder?: number;
  /** Round in which this physical card was most recently placed on another card. */
  attachmentPlacedRound?: number;
  /** While attached to this exact source, the physical card may be selected anywhere a hand card could be played. */
  playAsHandWhileAttached?: { sourceInstanceId: string };
  /** Generic additive power that persists exactly until this physical card is closed. */
  untilClosePowerBonus?: number;
  /** Generic host rule: add the top attached card's power/cost/types/abilities without becoming basic. */
  copyTopAttachmentTraits?: {
    sourceId: string;
    /** Optional proxy host whose top attachment supplies printed traits without copying that attachment's runtime state. */
    proxyHostInstanceId?: string;
    /** Optional cap on combined host cost plus inherited attachment cost. */
    maxTotalCost?: number;
  };
  /** Physical board location while zone === "board". */
  boardLocationId?: string;
  /** While attached here, this face-up board card contributes as an active attack whenever its owner is physically at the same battlefield. */
  boardAttackWhileOwnerPresent?: boolean;
  /** Generic board aura that raises opponents' matching card costs at this location. */
  boardOpponentCardCostAura?: {
    attributesAny?: string[];
    attackOnly?: boolean;
    sourceZones?: CardZone[];
    amount: number;
    max?: number;
  };
  /** Opponents cannot move into or out of this board-card location while its owner is physically there. */
  boardOpponentMovementLockWhileOwnerPresent?: boolean;
  /** Multiply objective/situation power modifiers for players at this board-card location. */
  boardSituationPowerModifierMultiplier?: number;
  /** Multiply event-card power modifiers for players at this board-card location. */
  boardEventPowerModifierMultiplier?: number;
  /** Player ids explicitly unaffected by this board-card power aura. */
  boardPowerModifierExemptPlayerIds?: string[];
  /** Temporary provenance is separate from automatic cleanup timing. */
  temporaryCleanup?: "round-end" | "explicit";
  /** A borrowed physical card temporarily controlled in another player's attack; closing it returns the same instance to its original owner's discard. */
  returnToOwnerDiscardOnClose?: boolean;
  /** A lent physical Skill controlled in another player's attack; closing it returns the same instance to its original owner's skill zone. */
  returnToOwnerSkillZoneOnClose?: "master-skills" | "servant-skills";
  /** Effect-specific lent-card lifecycle: remove the physical card if its current non-owner controller is eliminated. */
  removeWithControllerOnElimination?: boolean;
  /** Temporary explicit public reveal without changing zone or face state. */
  publiclyRevealed?: boolean;
  paidCost?: number;
  /** Player whose mana actually paid this physical card's most recent play cost. */
  playManaPayerPlayerId?: string;
  /** Explicit linked-player mana contributions used for this physical card's most recent play. */
  playManaContributions?: Array<{ playerId: string; amount: number }>;
  /** Round in which this card instance was most recently played into an attack. */
  playedRound?: number;
  /** Round in which that play was caused by a card/skill effect rather than the standard hand-play command. */
  playedByEffectRound?: number;
  /** Board location occupied by the controller when this card was most recently played. */
  playedLocationId?: string | null;
  /** Authoritative true-name visibility snapshot immediately before this physical card's most recent play. */
  trueNameRevealedWhenPlayed?: boolean;
  /** Round in which this physical card was most recently attached/placed on the board. */
  boardPlacedRound?: number;
  /** Round in which this card most recently joined an attack by an effect without being played. */
  joinedAttackRound?: number;
  /** Generic charge lifecycle: while in deck, the next departure is replaced by a free face-up join to attack. */
  chargedAttackOnDeckLeave?: {
    sourceId: string;
    residual: boolean;
  };
  /** Round in which a charged card most recently entered attack by leaving the deck. */
  chargedAttackEnteredRound?: number;
  /** Generic named side deck/pool that owns this physical card outside the normal player zones. */
  namedSideDeckId?: string;
  /** Generic destination replacement installed by a rule, e.g. exile becoming discard. */
  zoneMoveReplacement?: {
    sourceId: string;
    requestedDestination: "removed";
    replacementDestination: "discard";
  };
  /** Generic hand-held combat rule for cards that must be revealed when their owner fights. */
  combatHandRule?: {
    sourceId: string;
    revealWhenOwnerFights?: boolean;
    setControllerCombatPowerToZero?: boolean;
    discardAfterCombat?: boolean;
  };
  /** Round in which this card was force-revealed from hand for combat. */
  combatHandRevealedRound?: number;
  /** Generic play lock removed after this card's owner next wins a combat. */
  playBlockedUntilOwnerCombatWin?: { sourceId: string };
  /** Temporary effect exile that restores this physical card to its former controller's attack after the Combat phase. */
  returnAfterCombat?: { sourceId: string; controllerPlayerId: string; face: "up" | "down"; active: boolean; residual: boolean };
  /** Physical card is removed from the game after the Combat phase of this round, even if it changed zones meanwhile. */
  removeAfterCombatRound?: number;
  /** Number of successful face-up plays of this physical card during this game. */
  playCount?: number;
  /** Definition ids consumed by structured play prerequisites that transferred cards to another deck. */
  playPrerequisiteTransferredDefinitionIds?: string[];
  modifiers: string[];
  /** Structured power changes applied by combat effects. */
  powerModifiers?: CardPowerModifier[];
  /** Temporary executable card abilities gained by this physical card from another printed card. */
  grantedCardAbilities?: Array<{ abilityId: string; sourceDefinitionId: string; phases?: PhaseId[] }>;
  /** Structured physical-card cost changes that remain with the instance across zones. */
  costModifiers?: CardCostModifier[];
  /** Persistent multiplier applied to this physical card's base power. */
  basePowerMultiplier?: number;
  /** Round in which this physical skill most recently returned from play to its skill zone. */
  returnedToSkillZoneRound?: number;
  /** Runtime attribute replacement applied to this physical card instance. */
  attributeOverrides?: string[];
  /** Authored play-time attribute declaration attached to this physical card. */
  declaredAttribute?: string;
  /** False while a rule keeps the declaration private from other players. */
  declaredAttributeRevealed?: boolean;
  /** Whether the card's authored reverse face/effect is currently selected. */
  reversed?: boolean;
  /** Card-level usage marker, independent from per-round skill usage. */
  used?: boolean;
  /** Runtime keyword granted to this physical card. It never retroactively marks an already-played card as used. */
  usageLimitOverride?: "once-per-game" | "twice-per-game" | "once-per-round" | "twice-per-round" | "three-per-round" | "once-per-turn" | "unlimited";
  /** Ability-specific usage records. Unlike the legacy card-level marker, these keep multiple printed abilities independent. */
  abilityUsage?: Record<string, { round?: number; phase?: PhaseId; used?: boolean; usedGame?: boolean; count?: number }>;
  /** Round/phase markers for reusable card-level limits. */
  usedRound?: number;
  usedPhase?: PhaseId;
  usedCount?: number;
  /** Persistent game-wide use count for limits such as twice-per-game. */
  usedGameCount?: number;
  /** Effect that created a generated/derived card instance, when applicable. */
  createdByEffectId?: string;
  /** Card selected by a structured replacement to be played at the owner's Combat turn. */
  setAsideForCombat?: { sourceId: string; round: number };
  /** Player whose effect created this generated/derived card instance. */
  createdByPlayerId?: string;
  /** Physical source instance copied/transformed into this derived card, when applicable. */
  derivedFromInstanceId?: string;
  /**
   * Generic physical-skill copy whose printed activated effects are replaced
   * without mutating the shared SkillDefinition. Passive/non-activated source
   * text does not belong to the copy.
   */
  skillCopyReplacement?: {
    sourceId: string;
    sourceSkillId: string;
    totalPowerGain: number;
    oncePerCopy: boolean;
    removeAtRoundEndAfterUse: boolean;
    used?: boolean;
  };
  /** Full-text temporary Skill copy. Fresh derived instances intentionally do not inherit tokens/stacks or other instance state. */
  fullSkillCopy?: {
    sourceId: string;
    sourceSkillId: string;
    /** Printed references to the source card's named owner resolve as the copy controller. */
    rebindNamedOwnerToController?: boolean;
  };
  /**
   * Generic physical-card transformation: this same instance temporarily uses
   * another card definition, then restores its original printed identity.
   * Only the definition is copied; target-instance tokens/stacks/modifiers are
   * intentionally not transferred.
   */
  temporaryDefinitionCopy?: {
    sourceId: string;
    originalDefinitionId: string;
    /** Physical source copied from, when the transformation originated from another instance. */
    copiedFromInstanceId?: string;
    /** Stable target definition when the transformation does not require a physical template instance. */
    copiedFromDefinitionId?: string;
    expiresRound: number;
    /** Optional copied printed mana cost after the copying rule's own discount. */
    copiedManaCost?: number;
    /** Preserve a pre-existing full-text copy wrapper when nested copies occur. */
    restoreFullSkillCopy?: {
      sourceId: string;
      sourceSkillId: string;
      rebindNamedOwnerToController?: boolean;
    };
    /** Restore any pre-existing attachment-trait inheritance after the temporary face ends. */
    restoreCopyTopAttachmentTraits?: {
      sourceId: string;
      proxyHostInstanceId?: string;
      maxTotalCost?: number;
    };
    /** Card-local usage belongs to the copied face only and is restored with it. */
    restoreUsageState: {
      abilityUsage?: Record<string, { round?: number; phase?: PhaseId; used?: boolean; usedGame?: boolean; count?: number }>;
      used?: boolean;
      usedRound?: number;
      usedPhase?: PhaseId;
      usedCount?: number;
      usedGameCount?: number;
      residual: boolean;
    };
    copyPowerModifierId?: string;
  };
  /**
   * Structured temporary removal lifecycle. The card stays physically owned by
   * its original player while in the removed zone, then returns when the named
   * player is eliminated. This is generic rules state, not character identity.
   */
  sequestration?: {
    sourceId: string;
    returnOnPlayerEliminationId: string;
    returnZone: "master-skills" | "servant-skills";
    /** Preserve hidden information when the temporarily removed skill returns. */
    returnFace: "up" | "down";
  };
}

export interface BoardState {
  locations: Record<string, string[]>;
  situationDeck: string[];
  situationDiscard: string[];
  activeSituations: string[];
  eventDeck: string[];
  eventDiscard: string[];
  /** Events removed from the selected event pool for the rest of the game unless a rule explicitly restores them. */
  eventRemoved: string[];
  /** Independent objective/event decks used by rules that permanently replace one location's normal event source. */
  namedEventPools?: Record<string, { allIds: string[]; deck: string[]; discard: string[] }>;
  /** Per-location override selecting a named event pool instead of the match's normal event deck. */
  eventPoolOverrides?: Record<string, { poolId: string; sourceId: string; controllerPlayerId?: string }>;
  currentEvents: Record<string, string[]>;
  eventVisibility: Record<string, "up" | "down">;
  /** Temporary/additive VP changes attached to a currently placed event. */
  eventVictoryPointBonuses?: Record<string, number>;
  /** Structured absolute event-reward overrides. maxValue caps later additive increases without text parsing. */
  eventVictoryPointOverrides?: Record<string, { value: number; maxValue?: number; sourceId: string; round?: number }>;
  outpostRecords: Record<string, Array<string | null>>;
  scoutingAwardedRound: number | null;
}

export interface PendingDecision {
  decisionId: string;
  ownerPlayerId: string;
  chooserPlayerIds: string[];
  kind: string;
  options: Array<{ id: string; label: string; disabled?: boolean; chooserPlayerIds?: string[] }>;
  min: number;
  max: number;
  allowCancel: boolean;
  continuationEffectId?: string;
  fallbackEffectId?: string;
  submissions: Record<string, string[]>;
}

export interface EffectFrame {
  effectId: string;
  handlerId: string;
  sourceId: string;
  controllerPlayerId: string | null;
  payload: unknown;
  createdAtRevision: number;
}

/** Serializable future effect bound to a domain event and optional round. */
export interface ScheduledEffect {
  scheduleId: string;
  sourceId: string;
  controllerPlayerId: string;
  handlerId: string;
  payload: unknown;
  triggerEventType: string;
  triggerRound?: number;
  expiresAfterRound?: number;
  once: boolean;
}

/** Serializable runtime rule override created by an activated structured ability. */
export interface ActiveRuleModifier {
  id: string;
  sourceId: string;
  controllerPlayerId: string;
  sourceInstanceId?: string;
  operation: "allow" | "forbid" | "replace" | "add" | "subtract" | "multiply" | "set" | "ignore";
  rule: string;
  scope?: Record<string, unknown>;
  value?: unknown;
  duration: "round" | "game" | "while-source-active";
  createdRound: number;
}

export interface GameEvent {
  eventId: string;
  type: string;
  revision: number;
  sourceCommandId: string;
  payload: unknown;
}

export interface GameState {
  schemaVersion: number;
  rulesPackageId: string;
  gameInstanceId: string;
  revision: number;
  status: GameStatus;
  mode: GameMode;
  modeState: Record<string, unknown>;
  round: number;
  phase: PhaseId;
  step: PhaseStepId;
  activePlayerId: string | null;
  turnOrder: string[];
  players: Record<string, PlayerState>;
  cards: Record<string, CardInstance>;
  board: BoardState;
  effectQueue: EffectFrame[];
  scheduledEffects: ScheduledEffect[];
  activeRuleModifiers: ActiveRuleModifier[];
  pendingDecision: PendingDecision | null;
  processedCommandIds: string[];
  eventLog: GameEvent[];
  rng: { seed: number; state: number; draws: number };
}

export interface GameAction {
  type: string;
  label?: string;
  payload?: unknown;
}

export interface PhasePlan {
  phases: PhaseId[];
  steps: Record<string, PhaseStepId[]>;
}

export interface VictoryStatus {
  finished: boolean;
  winnerIds: string[];
  reason: string | null;
}

export interface PublicModeState {
  modeId: GameMode;
  values: Record<string, unknown>;
}
