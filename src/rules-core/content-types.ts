import type { PhaseId, PhaseStepId } from "../domain/state/types.ts";
import type { FDCardAuthoringRules, FDAuthoringFormula } from "../content/authoring/types.ts";
import type { SkillEffectSpec } from "./skill-effects.ts";
import type { SkillRuleProgram } from "./skill-rule-program.ts";

export interface AppendFromHandRule {
  maxCount: number;
  maxBasePower: number;
}

export interface CardPlayPrerequisite {
  /** Require one matching owned physical card to already be active. */
  activeOwnedDefinitionId?: string;
  /** Consume the active prerequisite by closing it as part of the play transaction. */
  closeOnPlay?: boolean;
  /**
   * Additional physical-card payment made from hand before the played card
   * enters the attack. Selection is supplied through structured play data;
   * runtime never parses display text to discover the requirement.
   */
  discardFromHand?: {
    count: number;
    basic?: boolean;
    attributesAll?: CardAttribute[];
  };
  /** Transfer selected cards from hand into a co-located opponent's deck and shuffle that deck before this play resolves. */
  shuffleIntoOpponentDeck?: {
    count: number;
    basic?: boolean;
    requireSameLocation?: boolean;
  };
  /** Consume authored named resources from the controller as part of the play transaction. */
  customResource?: {
    amount: number;
    resourceIds: string[];
  };
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
  /** Before an automatic discard-to-deck recycle, let this controller keep up to N physical cards in discard. */
  automaticDeckRecycleKeepMax?: number;
  /** Latest round in which this catalogue-only skill may be unlocked. */
  unlockLatestRound?: number;
  /** Card play requires the named skill to have been used earlier this round. */
  requiresSkillUsedThisRound?: string;
  /** Structured physical/resource prerequisites that must be consumed by the same play transaction. */
  playPrerequisite?: CardPlayPrerequisite;
  cost: number;
  /** Structured dynamic cost; display text is never parsed at runtime. */
  costRule?:
    | { kind: "round-linear"; base: number; perRound: number; min: number }
    | { kind: "player-count-minus-round"; offset?: number; min: number };
  /** Optional player-declared play-time choice: each selected distinct attribute costs mana and is gained for this play. */
  variablePlayAttributeChoice?: { allowedAttributes: CardAttribute[]; manaPerAttribute: number };
  /** Play-time single-attribute declaration stored on the physical card; may be unique per game. */
  playAttributeDeclaration?: { allowedAttributes: CardAttribute[]; uniquePerGame?: boolean; repeatAllowedWithOwnedSkillId?: string };
  /** This physical skill card must already be activated in its skill zone before it can be played. */
  requiresActiveInSkillZoneToPlay?: boolean;
  /** Explicit alternative free-play path selected at commit time. */
  optionalFreePlay?: { waiveEightMana?: boolean; revealTrueName?: boolean; nextRoundCombatPowerOverride?: number; requireSourcePresent?: boolean };
  /** Optional resource payment chosen instead of normal mana cost. */
  alternativePlayCost?: { resource: "victory-points"; amount: number };
  /** Optional structured rule allowing another eligible player to pay this physical card's mana play cost. */
  alternateManaPayer?: { requireSameBattlefield?: boolean; requiredControlledDefinitionId?: string };
  /** Active source-card aura allowing an eligible external player to pay a fraction of this controller's attack mana cost. */
  attackManaShare?: { numerator: number; denominator: number; rounding: "ceil"; minimumPayerMana?: number; requiredRulerSealSourceId?: string };
  /** When this face-up card is committed, reduce one other face-up card in the same batch by this amount. */
  pairedPlayOtherCostReduction?: number;
  /** When this face-up card is committed, increase every other face-up attack in the same batch by this amount; the increase remains on those physical cards for the round. */
  pairedPlayOtherCostIncrease?: number;
  /** Increase this card's play cost only when a specific other definition is committed face-up in the same batch. */
  pairedWithDefinitionCostIncrease?: { definitionId: string; amount: number };
  /** When this face-up card is committed, grant every other face-up attack in the same batch this much round power. */
  pairedPlayOtherPowerBonus?: number;
  /** Reduce this card's same-batch play cost by the current costs of other face-up attacks, excluding an optional tag. */
  sameBatchOtherAttackCostReduction?: { excludeTag?: string };
  /** Printed power cannot be increased, reduced, set or multiplied by any effect. */
  powerImmutable?: boolean;
  /** This physical card cannot be deactivated/closed by card effects or its controller. */
  cannotDeactivate?: boolean;
  /** Additional ordinary Command Seals paid as a card-play cost (not a Command Seal ability use). */
  commandSealPlayCost?: number;
  /** Additional victory points paid to play this card, on top of its mana cost. */
  victoryPointPlayCost?: number;
  /** Generic player-state gate checked before this physical card may be played. */
  playRequiresPlayerFlag?: { key: string; value: boolean | number | string };
  basePower: number;
  /** Structured printed variable power; runtime must evaluate this instead of parsing display text. */
  basePowerFormula?: FDAuthoringFormula;
  typeLabel: string;
  /** Structured card attributes; typeLabel remains display-only. */
  attributes?: string[];
  basic?: boolean;
  /** Active aura: bonus applied to this controller's basic combat cards. */
  basicCardPowerBonus?: number;
  /** Optional attribute filter for a basic-card aura. */
  basicCardPowerBonusAttributes?: CardAttribute[];
  /** Optional controller-state condition for a basic-card aura. */
  basicCardPowerBonusCondition?: { playerFlagEquals?: { key: string; value: boolean | number | string } };
  /** Active card grants its controller defeat-ignore while this condition holds. */
  playerDefeatIgnoreCondition?: { playerFlagEquals?: { key: string; value: boolean | number | string } };
  /** While an owned card is lent to another controller, both owner and controller ignore defeat. */
  linkedOwnerDefeatIgnore?: boolean;
  /** While an owned card is lent, owner and controller each use the higher of their final combat powers. */
  linkedOwnerCombatPowerMaximum?: boolean;
  /** Close a lent card before combat when its physical owner is not in the controller's battlefield. */
  closeIfLinkedOwnerAbsentFromCombat?: boolean;
  /** At round combat cleanup, return this card to its owner hand if its owner lost any combat this round. */
  returnToOwnerHandOnOwnerCombatLoss?: boolean;
  /** Generic owner-state-dependent multiplier for this physical card's printed base power. */
  ownerConditionalBasePowerMultiplier?: {
    playerFlagEquals: { key: string; value: boolean | number | string };
    commandSealsAtMost?: number;
    multiplier: number;
  };
  /** While active, opponents cannot close cards owned by this controller. */
  protectsControllerCardsFromOpponents?: boolean;
  /** While this card is active, cards owned by the same player gain attributes by stable definition id. */
  activeOwnedCardAttributeGrant?: { targetDefinitionIds: string[]; attributes: CardAttribute[] };
  /** While this physical source is present, matching active cards controlled by any player gain attributes. */
  globalActiveCardAttributeGrant?: { targetDefinitionIds: string[]; attributes: CardAttribute[] };
  /** Dynamic attribute transform while the player-id stored in this controller flag shares a battlefield. */
  linkedPlayerSameBattlefieldAttributeTransform?: { playerFlag: string; removeAttributes?: CardAttribute[]; addAttributes?: CardAttribute[] };
  isSkill?: boolean;
  requiresEightMana?: boolean;
  /** Skill-zone 8-mana gate is waived when this card's current printed base power is at most this value. */
  eightManaWaiverMaxPrintedBasePower?: number;
  /** Waive the normal skill 8-mana gate but add a play-cost surcharge while mana is below a threshold. */
  lowManaSkillPlaySurcharge?: { thresholdExclusive: number; amount: number };
  /** Card may only be played while the controller has less than this mana. */
  maxManaExclusive?: number;
  /** Cost reduction that applies while the controller's true name is hidden. */
  hiddenTrueNameCostReduction?: number;
  /** Cost reduction while the current situation forbids the specified attribute. */
  situationForbiddenAttributeCostReduction?: { attribute: CardAttribute; amount: number };
  /** Reduce this card's play cost by the controller's current terrain advantage. */
  terrainAdvantageCostReduction?: boolean;
  /** While this card is active, every other player ignores player-specific situation effects. */
  otherPlayersIgnoreSituationEffects?: boolean;
  ignoresSituationRestrictions?: boolean;
  residual?: boolean;
  /** Authored card contains a separately defined reverse effect. */
  hasReversalEffect?: boolean;
  /** Turning this card to its authored reverse effect reveals its servant's true name. */
  revealsTrueNameOnReverse?: boolean;
  skillOwnerType?: "master" | "servant";
  text?: string;
  phases?: PhaseId[];
  /** Optional structured micro-step window; omitted means any step in the phase. */
  steps?: PhaseStepId[];
  /** Stable executable card ability IDs exposed by this card definition. */
  cardAbilityIds?: string[];
  /** Victory points gained by this controller when this active face-up card is present in a won combat. */
  combatWinVictoryPoints?: number;
  /** Active aura: every other face-up attack controlled by this player gains this much power. */
  activeOtherAttackPowerBonus?: number;
  /** Close this residual source after its controller defeats at least one other player in combat. */
  closeAfterControllerDefeatsOtherPlayer?: boolean;
  limit?: "once-per-game" | "twice-per-game" | "once-per-round" | "twice-per-round" | "once-per-turn" | "unlimited";
  requiresTrueName?: boolean;
  /** Authoritative reveal trigger; runtime code must not infer this from display text. */
  revealsTrueNameOnPlay?: boolean;
  requiresHiddenTrueName?: boolean;
  playDrawIfWithBasicAttack?: number;
  /** Confirmed structured power added to this card whenever its play effect is triggered. */
  playPowerBonus?: number;
  /** Draw cards whenever this card is successfully committed. */
  drawOnPlay?: number;
  /** Return this card to its owner's deck when its controller is defeated. */
  returnToDeckOnDefeat?: boolean;
  appendFromHand?: AppendFromHandRule;
  /** Card explicitly replaces the normal two-card attack with a single-card play. */
  singleCardPlay?: boolean;
  /** This card must be the only card the controller plays during the entire round. */
  roundExclusivePlay?: boolean;
  /** This card may be added on top of the ordinary standard-attack card count. */
  standardAppend?: boolean;
  /** Conditional append while one of these physical board cards is attached to the controller's current location. */
  standardAppendIfBoardDefinitionAtControllerLocation?: string[];
  /** Dynamic base power equal to this value times the number of other players at the controller's location. */
  basePowerPerSameLocationOpponent?: number;
  /** Dynamic base power becomes zero while one of these physical board cards is attached to the controller's current location. */
  basePowerZeroIfBoardDefinitionAtControllerLocation?: string[];
  /** Optional structured source skill that must still be owned for standardAppend to apply. */
  standardAppendRequiresOwnedSkillId?: string;
  /** Multiple appended cards may coexist only when every appended card declares the same non-empty stack group. */
  standardAppendStackGroup?: string;
  /** Additional cards in the same standard-attack batch required for this append slot. */
  standardAppendRequiresBatchCards?: { minCount: number; attributesAny?: CardAttribute[] };
  /** Optional alternate standard attack: exact face-down count creates the named follow-up attack from the effect source. */
  faceDownAttackFollowup?: { exactCount: number; definitionId: string };
  /** Shared once-per-round group also enforced when the card is played. */
  uniqueGroup?: string;
  /** Generic play-time choice supplied by a specific active source card before this card's cost is paid. */
  playAdjustmentFromActiveSource?: {
    sourceDefinitionId: string;
    choices: Array<{ id: string; costAdd?: number; powerAdd?: number }>;
    closeSourceAfterPlay?: boolean;
  };
  /** Active source aura that offers the same pre-payment choice to the controller's next non-basic attack. */
  activeSourcePlayAdjustmentForNonBasic?: {
    choices: Array<{ id: string; costAdd?: number; powerAdd?: number }>;
    closeSourceAfterPlay?: boolean;
  };
  tags?: string[];
  /** Structured deterministic effects extracted during content migration. */
  effects?: SkillEffectSpec[];
  /** Effects that could not be safely interpreted remain visible to audits. */
  unparsedEffects?: string[];
  /** Non-executable authored-text segments retained for migration and audit. */
  clauses?: import("./skill-effects.ts").SkillTextClause[];
  /** Lossless rule program shared with the linked skill definition. */
  ruleProgram?: SkillRuleProgram;
  /** Lossless authoring rules following fd-card-authoring-v1. */
  rules?: FDCardAuthoringRules;
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
  /** Explicit non-derived attributes named by the active Situation card. */
  mentionedAttributes?: CardAttribute[];
  text?: string;
  eventPlacement?: { mountain: number; city: number };
  forbiddenAttributes?: CardAttribute[];
  /** Structured combat modifiers; display text is never parsed at runtime. */
  combatPower?: SituationCombatPowerDefinition;
}

export interface SituationCombatPowerDefinition {
  cardAddByAttribute?: Partial<Record<CardAttribute, number>>;
  cardAddByAttributeWhenPrintedBasePowerAtLeast?: { min: number; addByAttribute: Partial<Record<CardAttribute, number>> };
  aggregateAddBySharedAttribute?: number;
  locations?: Array<"mountain" | "city">;
}

export interface EventDefinition {
  id: string;
  locationId?: "mountain" | "city";
  victoryPoints: number;
  /** Stable structured markers for objective/event mechanics; runtime never parses display text. */
  tags?: string[];
  /** Explicit attributes named by this event; never inferred from display text at runtime. */
  mentionedAttributes?: CardAttribute[];
  /** Structured combat-power contribution printed on an event card. */
  combatPower?: SituationCombatPowerDefinition;
  text?: string;
}

export interface EventGroupDefinition {
  id: string;
  name: string;
  eventIds: string[];
  persistent?: boolean;
}
