import type { AppendFromHandRule, CardAttribute, CardPlayPrerequisite } from "../rules-core/content-types.ts";
import type { SkillAbilityDefinition, SkillSupportLevel } from "../rules-core/skill-types.ts";
import type { PhaseId, PhaseStepId } from "../domain/state/types.ts";
import type { FDCardAuthoringRules, FDAuthoringFormula } from "./authoring/types.ts";
import { onActiveCombatWin, onOwnFaceUpPlay } from "./authoring/ability-templates.ts";
import { structuredMasterBatchOverrides } from "./structured-master-batch.ts";
import { structuredServantBatchOverrides } from "./structured-servant-batch.ts";
import { structuredBatch002Overrides } from "./structured-batch-002.ts";
import { structuredBatch003Overrides } from "./structured-batch-003.ts";
import { structuredBatch004Overrides } from "./structured-batch-004.ts";
import { structuredBatch005Overrides } from "./structured-batch-005.ts";
import { structuredBatch006Overrides } from "./structured-batch-006.ts";
import { structuredBatch007Overrides } from "./structured-batch-007.ts";
import { structuredBatch008Overrides } from "./structured-batch-008.ts";
import { structuredBatch009Overrides } from "./structured-batch-009.ts";
import { structuredBatch010Overrides } from "./structured-batch-010.ts";
import { structuredBatch011Overrides } from "./structured-batch-011.ts";
import { structuredBatch012Overrides } from "./structured-batch-012.ts";
import { structuredBatch013Overrides } from "./structured-batch-013.ts";
import { structuredBatch014Overrides } from "./structured-batch-014.ts";
import { structuredBatch015Overrides } from "./structured-batch-015.ts";
import { structuredBatch016Overrides } from "./structured-batch-016.ts";
import { structuredBatch017Overrides } from "./structured-batch-017.ts";
import { structuredBatch018Overrides } from "./structured-batch-018.ts";
import { authoringGeneratedOverrides } from "./generated/authoring-skill-overrides.ts";
import { MIYU_SAPPHIRE_DECK, MIYU_SAPPHIRE_SERVANT_ID } from "./miyu-cards.ts";
import { CHINESE_LOSTBELT_POOL_ID } from "./lostbelt-objectives.ts";

/** Confirmed rule metadata keyed by stable skill IDs. */
export interface ConfirmedSkillOverride {
  /** False for granted/unlocked skill cards that must not be seeded during base setup. */
  initiallyOwned?: boolean;
  /** Generic pre-game servant package replacement supplied by this Master rule. */
  startingServantOverride?: { servantId: string; deckDefinitionIds: string[] };
  /** Generic setup-time NPC combatant created before round 1. */
  startingNpcCombatant?: { id: string; name: string; basePower: number; presenceEventTag?: string };
  /** Setup-time random named-pool injection into the main objective deck. */
  startingNamedEventPoolInjection?: { poolId: string; count: number };
  /** Latest round in which this catalogue-only skill may be unlocked. */
  unlockLatestRound?: number;
  /** Card play requires the named skill to have been used earlier this round. */
  requiresSkillUsedThisRound?: string;
  /** Structured physical/resource prerequisites consumed by the card-play transaction. */
  playPrerequisite?: CardPlayPrerequisite;
  /** Before an automatic discard-to-deck recycle, let this controller keep up to N physical cards in discard. */
  automaticDeckRecycleKeepMax?: number;
  /** Another eligible player may pay this card's mana play cost when selected in structured play data. */
  alternateManaPayer?: { requireSameBattlefield?: boolean; requiredControlledDefinitionId?: string };
  /** Active source-card aura allowing an eligible external player to pay a fraction of this controller's attack mana cost. */
  attackManaShare?: { numerator: number; denominator: number; rounding: "ceil"; minimumPayerMana?: number; requiredRulerSealSourceId?: string };
  /** Catalogue ability is owned by any player currently controlling a Ruler Seal created by this source skill. */
  rulerSealControllerSourceId?: string;
  /** Printed residual card-face property; not an ability window. */
  cardResidual?: boolean;
  attributes?: CardAttribute[];
  tags?: string[];
  abilities?: SkillAbilityDefinition[];
  requiresActiveCard?: boolean;
  requiresTrueName?: boolean;
  requiresEightMana?: boolean;
  eightManaWaiverMaxPrintedBasePower?: number;
  lowManaSkillPlaySurcharge?: { thresholdExclusive: number; amount: number };
  maxManaExclusive?: number;
  hiddenTrueNameCostReduction?: number;
  situationForbiddenAttributeCostReduction?: { attribute: CardAttribute; amount: number };
  otherPlayersIgnoreSituationEffects?: boolean;
  ignoresSituationRestrictions?: boolean;
  abilityCost?: number;
  drawCount?: number;
  /** Number of cards drawn when this card is successfully committed. */
  drawOnPlay?: number;
  returnToDeckOnDefeat?: boolean;
  preparationHandSize?: number;
  locationId?: string;
  manaGain?: number;
  initialMana?: number;
  addSkillDefinitionId?: string;
  addSkillDefinitionIds?: string[];
  addCardDefinitionId?: string;
  addCardCount?: number;
  addCardToHandDefinitionId?: string;
  activateSkillDefinitionId?: string;
  activationTargetDefinitionId?: string;
  playerFlags?: Record<string, boolean | number | string>;
  basicCardPowerBonus?: number;
  basicCardPowerBonusAttributes?: CardAttribute[];
  basicCardPowerBonusCondition?: { playerFlagEquals?: { key: string; value: boolean | number | string } };
  playerDefeatIgnoreCondition?: { playerFlagEquals?: { key: string; value: boolean | number | string } };
  protectsControllerCardsFromOpponents?: boolean;
  activeOwnedCardAttributeGrant?: { targetDefinitionIds: string[]; attributes: CardAttribute[] };
  globalActiveCardAttributeGrant?: { targetDefinitionIds: string[]; attributes: CardAttribute[] };
  /** Dynamic attribute transform while a player-id stored in a controller flag shares the same battlefield. */
  linkedPlayerSameBattlefieldAttributeTransform?: { playerFlag: string; removeAttributes?: CardAttribute[]; addAttributes?: CardAttribute[] };
  revealsTrueNameOnPlay?: boolean;
  revealsTrueNameOnSkillUse?: boolean;
  /** Authored card contains a separately defined reverse effect. */
  hasReversalEffect?: boolean;
  /** Turning this card to its authored reverse effect reveals its servant's true name. */
  revealsTrueNameOnReverse?: boolean;
  alterEgoCloseSource?: boolean;
  handlerId?: string;
  supportLevel?: SkillSupportLevel;
  activation?: "passive" | "optional-trigger" | "phase" | "play" | "residual";
  windows?: PhaseId[];
  costRule?:
    | { kind: "round-linear"; base: number; perRound: number; min: number }
    | { kind: "player-count-minus-round"; offset?: number; min: number };
  variablePlayAttributeChoice?: { allowedAttributes: CardAttribute[]; manaPerAttribute: number };
  playAttributeDeclaration?: { allowedAttributes: CardAttribute[]; uniquePerGame?: boolean; repeatAllowedWithOwnedSkillId?: string };
  requiresActiveInSkillZoneToPlay?: boolean;
  /** Explicit player choice to play this card for free instead of paying its normal cost. */
  optionalFreePlay?: { waiveEightMana?: boolean; revealTrueName?: boolean; nextRoundCombatPowerOverride?: number; requireSourcePresent?: boolean };
  alternativePlayCost?: { resource: "victory-points"; amount: number };
  pairedPlayOtherCostReduction?: number;
  pairedPlayOtherCostIncrease?: number;
  pairedWithDefinitionCostIncrease?: { definitionId: string; amount: number };
  pairedPlayOtherPowerBonus?: number;
  terrainAdvantageCostReduction?: boolean;
  commandSealPlayCost?: number;
  /** Additional victory points paid to play this card, on top of its mana cost. */
  victoryPointPlayCost?: number;
  materializedCardType?: "attack" | "skill";
  playRequiresPlayerFlag?: { key: string; value: boolean | number | string };
  steps?: PhaseStepId[];
  limit?: "once-per-game" | "twice-per-game" | "once-per-round" | "twice-per-round" | "once-per-turn";
  suppressInferredLimit?: boolean;
  uniqueGroup?: string;
  playDrawIfWithBasicAttack?: number;
  appendFromHand?: AppendFromHandRule;
  singleCardPlay?: boolean;
  roundExclusivePlay?: boolean;
  standardAppend?: boolean;
  standardAppendRequiresOwnedSkillId?: string;
  standardAppendStackGroup?: string;
  standardAppendRequiresBatchCards?: { minCount: number; attributesAny?: CardAttribute[] };
  faceDownAttackFollowup?: { exactCount: number; definitionId: string };
  passiveEventTypes?: string[];
  combatPowerZeroAttribute?: CardAttribute;
  combatPowerBonus?: number;
  combatPowerBonusIfMoveImpossible?: number;
  combatPowerBonusFromBattlefieldPlayedCosts?: boolean;
  combatPowerBonusPerCommandSealUser?: { base: number; ownCommandSealMultiplier: number; includeRulerCommandSeals?: boolean };
  highVictoryCombatPowerRule?: { penalty: number; selfBonusIfTopOpponentEngaged: number };
  opponentBonusPerCostlyAttack?: { minPaidCost: number; mana: number; combatPower: number };
  opponentAttackPowerModifier?: { hiddenTrueNameAmount: number; revealedTrueNameAmount: number; excludeGuardedByOwner?: boolean };
  eventCardPowerBonus?: { perEvent: number };
  markedDefeatVictoryPointReward?: number;
  variableManaPowerBonusMax?: number;
  revealHandUntilRoundEnd?: boolean;
  combatStartDrawCount?: number;
  revealHandPowerBonus?: { minBasePower: number; perCard: number; max: number };
  requiresBattlefieldLocation?: boolean;
  roundEndLoseAllManaUnlessPlayedSelf?: boolean;
  combatHistory?: "leonardo-victory-streak" | "nanaya-contested-combat";
  roundEndVictoryPointLoss?: number;
  roundEndLocationId?: "workshop" | "mountain" | "city" | "scouting";
  roundEndManaGain?: number;
  derivedAttackBatch?: { count: number; definitionIds: string[] };
  attachedSupplyAppend?: { definitionIds: string[]; drawAfterAppend?: number; sourceEvent?: "card.played" };
  activeAttackLifecycleBoost?: {
    residualAbilityId: string;
    boostAbilityId: string;
    residualRoundOffset: number;
    boostAttribute: CardAttribute;
    boostPower: number;
  };
  opponentCombatPowerBonus?: number;
  moveForwardSteps?: number;
  opponentRequiresNoDeploymentBonus?: boolean;
  opponentRequiresNoCommandSealThisRound?: boolean;
  defeatScope?: "all-combat-participants";
  closeActiveAndActivateHiddenDefinitionId?: string;
  doubleDeploymentBonus?: boolean;
  unoccupiedTerrainLocations?: Array<"mountain" | "city">;
  defeatEngagedOpponentsIfMoreActiveAttacks?: boolean;
  manaThresholdVictoryPointLoss?: { threshold: number; amount: number; opponentExtra: number };
  rashomonGrudge?: { powerLossScope: "same-battlefield-opponents" };
  elizabethVolumePower?: { perMarker: number; max: number };
  elizabethVocalPerformance?: { markersPerOpponent: number; loseIfNoCombatThisRound: number };
  elizabethVolumeLossOnCombatLoss?: number;
  elizabethIronMaiden?: { loserVictoryPointLoss: number; controllerVictoryPointGainIfIncludesOverallLowest: number };
  /** Explicit card-face fields supplied by standardized authoring content. */
  cost?: number;
  requirement?: number;
  typeLabel?: string;
  basePower?: number;
  basePowerFormula?: FDAuthoringFormula;
  /** Executable abilities exposed by the physical card face. */
  cardAbilityIds?: string[];
  cardAbilityPhases?: PhaseId[];
  standardAppendIfBoardDefinitionAtControllerLocation?: string[];
  basePowerPerSameLocationOpponent?: number;
  basePowerZeroIfBoardDefinitionAtControllerLocation?: string[];
  /** Executable fd-card-authoring-v1 rules consumed by core.structured-skill. */
  rules?: FDCardAuthoringRules;
}

const BATTLE_CONTINUATION_HANDLER = "core.move-to-non-workshop";

const pretenderClassSkillIds = [
  "servant.hephaistion.skill.sc-hephaistion-2",
  "servant.ladyavalon.skill.sc-ladyavalon-2",
  "servant.oberon.skill.sc-oberon-2",
] as const;

const outerGodLifeSkillIds = [
  "servant.molay.skill.sc-molay-4",
  "servant.abigail.skill.sc-abigail-4",
  "servant.hokusai.skill.sc-hokusai-4",
  "servant.voyager.skill.sc-voyager-4",
  "servant.clytie.skill.sc-clytie-4",
] as const;

const battleContinuationSkillIds = [
  "servant.diarmuid.skill.sc-diarmuid-3",
  "servant.cu.skill.sc-cu-2",
  "servant.vlad.skill.sc-vlad-3",
  "servant.ereshkigal.skill.sc-ereshkigal-1",
  "servant.enkidu.skill.sc-enkidu-3",
  "servant.brynhildr.skill.sc-brynhildr-1",
  "servant.romulus.skill.sc-romulus-3",
  "servant.jaguarman.skill.sc-jaguarman-1",
  "servant.benkei.skill.sc-benkei-1",
  "servant.donquixote.skill.sc-donquixote-3",
  "servant.bradamante.skill.sc-bradamante-1",
  "servant.kagetora.skill.sc-kagetora-3",
  "servant.lishuwen.skill.sc-lishuwen-3",
] as const;

const independentActionSkillIds = [
  "servant.gil.skill.sc-gil-1",
  "servant.atalanta.skill.sc-atalanta-3",
  "servant.chiron.skill.sc-chiron-1",
  "servant.robin.skill.sc-robin-1",
  "servant.ishtar.skill.sc-ishtar-3",
  "servant.napoleon.skill.sc-napoleon-3",
  "servant.tristan.skill.sc-tristan-3",
  "servant.emiya-alt.skill.sc-emiya-alt-1",
  "servant.baobhan.skill.sc-baobhan-3",
  "servant.tomoe.skill.sc-tomoe-1",
  "servant.euryale.skill.sc-euryale-1",
] as const;

const territoryCreationSkillIds = [
  "servant.medea.skill.sc-medea-2",
  "servant.gilles.skill.sc-gilles-2",
  "servant.andersen.skill.sc-andersen-1",
  "servant.avicebron.skill.sc-avicebron-3",
  "servant.shakespeare.skill.sc-shakespeare-1",
  "servant.mozart.skill.sc-mozart-3",
  "servant.anastasia.skill.sc-anastasia-1",
  "servant.maxwell.skill.sc-maxwell-1",
  "servant.kinggil.skill.sc-kinggil-1",
  "servant.mephisto.skill.sc-mephisto-1",
  "servant.ladyavalon.skill.sc-ladyavalon-3",
  "servant.semiramis.skill.sc-semiramis-2",
] as const;

const presenceConcealmentSkillIds = [
  "servant.hassan.skill.sc-hassan-1",
  "servant.hassanhf.skill.sc-hassanhf-3",
  "servant.hassanser.skill.sc-hassanser-1",
  "servant.semiramis.skill.sc-semiramis-1",
  "servant.kiritsugu.skill.sc-kiritsugu-1",
  // The development card explicitly applies the same Assassin-class response
  // to Jekyll, while Hyde is rejected by the shared legality predicate.
  "servant.jekyll.skill.sc-jekyll-3",
  "servant.corday.skill.sc-corday-1",
  "servant.kama.skill.sc-kama-3",
  "servant.stheno.skill.sc-stheno-1",
  "servant.kotarou.skill.sc-kotarou-1",
  "servant.danzou.skill.sc-danzou-3",
  "servant.izou.skill.sc-izou-3",
] as const;

const ridingSkillIds = [
  "servant.iskandar.skill.sc-iskandar-1",
  "servant.medusa.skill.sc-medusa-1",
  "servant.ivan.skill.sc-ivan-3",
  "servant.drake.skill.sc-drake-1",
  "servant.ushiwakamaru.skill.sc-ushiwakamaru-3",
  "servant.odysseus.skill.sc-odysseus-3",
  "servant.medb.skill.sc-medb-1",
  "servant.roberts.skill.sc-roberts-3",
  "servant.boudica.skill.sc-boudica-3",
  "servant.hephaistion.skill.sc-hephaistion-3",
  "servant.teach.skill.sc-teach-3",
  "servant.mandricardo.skill.sc-mandricardo-3",
  "servant.martha.skill.sc-martha-3",
  "servant.constantine.skill.sc-constantine-1",
] as const;

const alterEgoSkillIds = [
  "servant.douman.skill.sc-douman-3",
  "servant.koyanskaya.skill.sc-koyanskaya-1",
  "servant.mechaeli.skill.sc-mechaeli-3",
  "servant.meltryllis.skill.sc-meltryllis-3",
  "servant.muramasa.skill.sc-muramasa-3",
  "servant.okita-alt.skill.sc-okita-alt-1",
  "servant.passionlip.skill.sc-passionlip-1",
  "servant.sitonai.skill.sc-sitonai-3",
  "servant.taisui.skill.sc-taisui-1",
] as const;

const gorgonNoblePhantasmPassiveId = "servant.gorgon.skill.sc-gorgon-1";
const shinjiDefeatSealId = "master.shinji.skill.s3";
const kireiCombatPowerSkillId = "master.kirei.skill.s3";
const dragonHeartSkillIds = [
  "servant.melusine.skill.sc-melusine-3",
  "servant.albion.skill.sc-albion-3",
] as const;

// Rulebook/FQA-confirmed card-play exceptions: these cards explicitly state
// that their own play/use does not require the normal 8-mana skill threshold.
// The exception is recorded on the card definition only; attached phase or
// passive effects remain PARTIAL until their complete handlers are migrated.
const explicitEightManaExceptionSkillIds = [
  "master.ciel.skill.s2",
  "master.hakuno-f.skill.ascension",
  "master.sion.skill.s11",
  "master.wodime.skill.s2",
  "servant.angra.skill.sc-angra-3",
  "servant.sasaki.skill.sc-sasaki-1",
  "servant.artoria-alt.skill.sc-artoria-alt-2",
  "servant.okita-alt.skill.sc-okita-alt-3",
  "servant.parvati.skill.sc-parvati-2",
  "servant.davinci.skill.sc-davinci-3",
  "servant.illya.skill.sc-illya-2",
  "servant.edison.skill.sc-edison-1",
  "servant.maxwell.skill.sc-maxwell-2",
  "servant.nitocris.skill.sc-nitocris-1",
  "servant.shuten.skill.sc-shuten-2",
  "servant.carmilla.skill.sc-carmilla-1",
  "servant.frank.skill.sc-frank-1",
  "servant.darius.skill.sc-darius-1",
  "servant.kingprotea.skill.sc-kingprotea-2",
] as const;

const overrides: Record<string, ConfirmedSkillOverride> = {
  "master.wodime.skill.s2": {
    initiallyOwned: false,
  },
  "master.arcueid.skill.s2": {
    initiallyOwned: false,
  },
  "servant.koyanskaya.skill.sc-koyanskaya-2": {
    activation: "phase",
    windows: ["outpost"],
    passiveEventTypes: ["player.entered-location", "combat.ending"],
    requiresActiveCard: false,
    handlerId: "core.koyanskaya-nff",
    supportLevel: "FULL",
  },
  "servant.koyanskaya.skill.sc-koyanskaya-4": {
    initiallyOwned: false,
    activation: "passive",
    hasReversalEffect: true,
    handlerId: "core.rule-marker",
    supportLevel: "FULL",
  },
  "master.araya.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["player.deployed"],
    handlerId: "core.araya-triple-boundary",
    supportLevel: "FULL",
  },
  "master.araya.skill.ascension": {
    initiallyOwned: false,
    activation: "passive",
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.araya-paradox-spiral",
    supportLevel: "FULL",
  },
  "master.akasha.skill.s6": {
    initiallyOwned: false,
  },
  "master.irisviel.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { commandSealWindow: "outpost" },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.ophelia.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { delayedMysticEyeUsesPerGame: 2 },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.peperoncino.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { lostbeltResponsibility: "india" },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.sieg.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { extraStandardAttackManaThreshold: 11 },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.sakura.skill.s4": {
    activation: "passive",
    tags: ["infinite-mana", "extra-standard-attack"],
    handlerId: "core.rule-marker",
    supportLevel: "FULL",
  },
  "master.sakura.skill.ascension": {
    initiallyOwned: false,
    unlockLatestRound: 4,
    activation: "passive",
    passiveEventTypes: ["round.ended"],
    handlerId: "core.sakura-corrosion",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "unlock-first-four-rounds",
          kind: "passive",
          printedClause: "你只能在游戏的前四回合中解锁此牌。",
          execution: { mode: "automatic", handlerId: "core.unlock-owner-ascension" },
        },
        {
          id: "corrosion-transfer",
          kind: "passive",
          printedClause: "每局游戏限一次，当一名玩家被淘汰且【被污染的圣杯】处于激活状态，你可将其拥有的任意张从者技能牌加入你的技能区。",
          execution: { mode: "automatic", handlerId: "core.sakura-corrosion" },
        },
      ],
    },
  },
  "servant.sherlock.skill.sc-sherlock-1": {
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnSkillUse: true,
    abilities: [{
      id: "elementary",
      name: "这是常识，我亲爱的朋友啊",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
      revealsTrueNameOnSkillUse: true,
      handlerId: "core.sherlock-elementary",
    }],
    handlerId: "core.sherlock-elementary",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "elementary",
        kind: "phase_action",
        printedClause: "【真名解放】战斗阶段：你所在地点的一名对手展示其手牌与其打出的暗置牌，若其展示了一张你以【逆推法】记录的卡牌，触发【逆推法】并令其【败北】。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.sherlock-elementary" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.sherlock.skill.sc-sherlock-2": {
    activation: "phase",
    windows: ["outpost"],
    cardResidual: true,
    requiresActiveCard: true,
    costRule: { kind: "player-count-minus-round", min: 0 },
    passiveEventTypes: ["player.deployed"],
    abilities: [{
      id: "mind-palace",
      name: "记忆宫殿",
      activation: "phase",
      windows: ["outpost"],
      requiresActiveCard: true,
      handlerId: "core.sherlock-empty-house",
    }],
    handlerId: "core.sherlock-empty-house",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "dynamic-cost",
          kind: "passive",
          printedClause: "X等于玩家数减去回合数。",
          execution: { mode: "automatic" },
        },
        {
          id: "workshop-residual",
          kind: "residual",
          printedClause: "残留：当你部署于魔术工房时，获得1点魔力。",
          conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "player.deployed" }],
          execution: { mode: "handler", handlerId: "core.sherlock-empty-house" },
        },
        {
          id: "mind-palace",
          kind: "phase_action",
          printedClause: "记忆宫殿-前哨阶段：进行一次【逆推法】。",
          activation: { phase: "outpost" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.sherlock-empty-house" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.sherlock.skill.sc-sherlock-3": {
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["card.played", "round.ending"],
    handlerId: "core.sherlock-retroduction",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "record-type",
          kind: "passive",
          printedClause: "秘密记录一种攻击类型。",
          execution: { mode: "handler", handlerId: "core.sherlock-retroduction" },
        },
        {
          id: "matched-basic",
          kind: "passive",
          printedClause: "当一名其他玩家打出相对应的基础牌时，翻开并弃置秘密记录的牌获得一点战果，然后你可以再进行一次【逆推法】。",
          conditions: [{ type: "event_type_is", eventType: "card.played" }],
          execution: { mode: "handler", handlerId: "core.sherlock-retroduction" },
        },
        {
          id: "untriggered-penalty",
          kind: "passive",
          printedClause: "如果回合结束时尚有未触发的【逆推法】，失去3点战果然后将其弃置。",
          conditions: [{ type: "event_type_is", eventType: "round.ending" }],
          execution: { mode: "handler", handlerId: "core.sherlock-retroduction" },
        },
        {
          id: "noble-phantasm-reveal-exception",
          kind: "passive",
          printedClause: "*以宝具展示攻击的情况下，不局限于基础攻击。",
          execution: { mode: "handler", handlerId: "core.sherlock-retroduction" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.sherlock.skill.sc-sherlock-4": {
    initiallyOwned: false,
    activation: "passive",
    tags: ["deduction-record", "deduction-attribute:力量"],
    handlerId: "core.rule-marker",
    supportLevel: "FULL",
  },
  "servant.sherlock.skill.sc-sherlock-5": {
    initiallyOwned: false,
    activation: "passive",
    tags: ["deduction-record", "deduction-attribute:迅捷"],
    handlerId: "core.rule-marker",
    supportLevel: "FULL",
  },
  "servant.sherlock.skill.sc-sherlock-6": {
    initiallyOwned: false,
    activation: "passive",
    tags: ["deduction-record", "deduction-attribute:魔术"],
    handlerId: "core.rule-marker",
    supportLevel: "FULL",
  },
  "servant.sherlock.skill.sc-sherlock-7": {
    initiallyOwned: false,
    activation: "passive",
    tags: ["deduction-record", "deduction-attribute:特殊"],
    handlerId: "core.rule-marker",
    supportLevel: "FULL",
  },
  // Reines' authored text is an explicit action-phase fetch from out of game.
  // The card instance is created in hand with provenance; no random draw is
  // involved and the remaining Trimmau effects stay separate.
  "master.reines.skill.s1": {
    activation: "phase",
    handlerId: "core.add-card-to-hand",
    supportLevel: "FULL",
    addCardToHandDefinitionId: "card.skill.master.reines.skill.s2",
  },
  // These cards explicitly draw on successful play; their other clauses stay
  // partial until their dedicated handlers are migrated.
  "servant.georgios.skill.sc-georgios-2": { drawOnPlay: 1 },
  "servant.lakshmibai.skill.sc-lakshmibai-4": { drawOnPlay: 1, returnToDeckOnDefeat: true },
  "servant.parvati.skill.sc-parvati-2": { drawOnPlay: 1 },
  "master.kohaku.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started", "round.started"],
    addCardDefinitionId: "card.card-kohaku-blast",
    addCardCount: 2,
    preparationHandSize: 4,
    handlerId: "core.kohaku-smile",
    supportLevel: "FULL",
  },
  // Kadoc's authored text is an unconditional round-end penalty while he is
  // in the workshop. The event carries the pre-cleanup location snapshot.
  "master.kadoc.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["round.ended"],
    roundEndVictoryPointLoss: 1,
    roundEndLocationId: "workshop",
    handlerId: "core.round-end-victory-point-loss",
    supportLevel: "FULL",
  },
  "master.celenike.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["round.ended"],
    roundEndManaGain: 2,
    roundEndVictoryPointLoss: 1,
    roundEndLocationId: "workshop",
    handlerId: "core.round-end-resource-adjustment",
    supportLevel: "FULL",
  },
  // Development-card text explicitly grants these derived master skill cards
  // at game start. The cards are registered separately by the content importer.
  "master.shirou-emiya.skill.s2": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionId: "card.derived.master.shirou-emiya.ganjiang-moye",
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  "master.tokiomi.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started", "attack.committed"],
    handlerId: "core.tokiomi-elementalist",
    supportLevel: "FULL",
  },
  "master.tokiomi.skill.s2": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionIds: [
      "card.derived.master.tokiomi.item.azoth-blade",
      "card.derived.master.tokiomi.item.grimoir",
      "card.derived.master.tokiomi.item.magic-meter",
      "card.derived.master.tokiomi.item.mana-reserve",
    ],
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  "master.tokiomi.skill.ascension": {
    activation: "passive",
    initiallyOwned: false,
    tags: ["ascension"],
    handlerId: "core.rule-marker",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "advanced-pyromancy",
        kind: "passive",
        printedClause: "【火炎弹】+2魔力消耗与威力。\n【燃烧】印记更改为-3合计威力且移除时需额外花费2点魔力。",
        conditions: [{ type: "source_owned" }],
        ruleModifiers: [
          {
            id: "advanced-pyromancy-fireball-cost",
            operation: "add",
            rule: "card_cost",
            scope: { subject: "controller", cards: { definitionIds: ["card.derived.master.tokiomi.fireball"] } },
            value: 2,
            lifecycle: { duration: "permanent" },
          },
          {
            id: "advanced-pyromancy-fireball-power",
            operation: "add",
            rule: "card_power",
            scope: { subject: "controller", cards: { definitionIds: ["card.derived.master.tokiomi.fireball"] } },
            value: 2,
            lifecycle: { duration: "permanent" },
          },
        ],
        execution: { mode: "automatic" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  // The card states that Zouken is both the Creator and bearer of the
  // Five-Hundred-Year Obsession; both are already registered skill cards.
  "master.zouken.skill.s2": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionIds: ["master.zouken.skill.s3", "master.zouken.skill.s4"],
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  // Sakura's eighth-round trigger is a mandatory round-end activation. The
  // handler checks whether her score is below the current first place before
  // activating the already-owned corrupted grail card.
  "master.sakura.skill.s2": {
    activation: "passive",
    passiveEventTypes: ["round.ended"],
    activateSkillDefinitionId: "master.sakura.skill.s4",
    handlerId: "core.sakura-corrupted-grail-trigger",
    supportLevel: "FULL",
  },
  // Development-card text: Leonardo's bonus depends on immediately prior
  // combat wins, so the handler records history instead of parsing UI text.
  "master.leonardo.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["combat.resolved"],
    combatHistory: "leonardo-victory-streak",
    handlerId: "core.combat-history",
    supportLevel: "FULL",
  },
  // Development-card text: Nanaya loses 2 total power after a contested
  // battle in the immediately preceding round.
  "master.shiki-nanaya.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["combat.resolved"],
    combatHistory: "nanaya-contested-combat",
    handlerId: "core.combat-history",
    supportLevel: "FULL",
  },
  // Development-card text: total mana gained each round is capped at 2 in
  // ordinary rounds and 4 in climax rounds.
  "master.fiore.skill.s3": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { roundManaGainCapRegular: 2, roundManaGainCapClimax: 4 },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.fiore.skill.s4": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { fioreGentle: true },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.leonardo.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { leonardoEventRewardBonus: 1 },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.dan.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["player.deployed"],
    handlerId: "core.dan-sniper",
    supportLevel: "FULL",
  },
  "servant.donquixote.skill.sc-donquixote-2": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { donquixoteEventLowBonus: 2, donquixoteEventHighPenalty: 2 },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "servant.saber.skill.sc-saber-np": {
    tags: ["climax-total-power-plus-4", "round-eleven-victory"],
    handlerId: "core.card-play",
    supportLevel: "FULL",
  },
  "servant.gil.skill.sc-gil-np": {
    activation: "phase",
    handlerId: "core.gilgamesh-enuma-elish",
    supportLevel: "FULL",
  },
  "master.kiritsugu.skill.s4": {
    activation: "phase",
    handlerId: "core.kiritsugu-origin-bullet",
    supportLevel: "FULL",
  },
  "master.goredolf.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    handlerId: "core.goredolf-iron-fist",
    supportLevel: "FULL",
  },
  "master.shirou-emiya.skill.s3": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { shirouIdealLandReady: true },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.chaos.skill.s8": {
    activation: "phase",
    steps: ["player-window"],
    handlerId: "core.chaos-giant-shark",
    supportLevel: "FULL",
  },
  "master.ryuunosuke.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started", "player.deployed", "combat.resolved"],
    addSkillDefinitionId: "master.ryuunosuke.skill.s2",
    activationTargetDefinitionId: "master.ryuunosuke.skill.s2",
    playerFlags: { noWorkshopManaGain: true },
    handlerId: "core.ryuunosuke-chain-killer",
    supportLevel: "FULL",
  },
  "master.caren.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["servant.true-name-revealed"],
    addSkillDefinitionId: "master.caren.skill.s3",
    handlerId: "core.true-name-add-skill",
    supportLevel: "FULL",
  },
  "master.ciel.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { ignoreEngagement: true, ignoreOthersEngagement: true },
    handlerId: "core.ciel-mediator",
    supportLevel: "FULL",
  },
  "servant.lance.skill.sc-lance-2": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { servantSkillEightManaWaiver: true, preventTrueNameRevealWhenNoSeals: true },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.kariya.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    handlerId: "core.kariya-insects",
    supportLevel: "FULL",
  },
  "master.kariya.skill.s2": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    handlerId: "core.kariya-nemesis",
    supportLevel: "FULL",
  },
  "master.kariya.skill.s3": {
    activation: "passive",
    passiveEventTypes: ["combat.resolved", "round.ended", "game.finished"],
    handlerId: "core.kariya-nemesis",
    supportLevel: "FULL",
  },
  "master.bazett.skill.s1b": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { firstDayPowerPenalty: -2 },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.bazett.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["game.started", "combat.resolved", "round.ending", "round.started"],
    handlerId: "core.bazett-time-loop",
    supportLevel: "FULL",
    uniqueGroup: "bazett-time-loop",
  },
  "master.bazett.skill.s1c": {
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    handlerId: "core.bazett-time-loop",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "second-day",
        kind: "passive",
        printedClause: "你拥有的魔力少于8点也可以打出【佛拉格拉克】且其于本回合失去<每局游戏限一次>。战斗阶段：若你获胜，获得2点战果。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.bazett-time-loop" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.bazett.skill.s1d": {
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    handlerId: "core.bazett-time-loop",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "fourth-day",
        kind: "passive",
        printedClause: "若你于本回合获胜，【觉醒】。若你于回合结束时未【觉醒】，【再启动】。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.bazett-time-loop" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.bazett.skill.s3": {
    activation: "passive",
    passiveEventTypes: ["round.started"],
    handlerId: "core.bazett-time-loop",
    supportLevel: "FULL",
    uniqueGroup: "bazett-time-loop",
  },
  "master.bazett.skill.s4": {
    activation: "passive",
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.bazett-time-loop",
    supportLevel: "FULL",
    uniqueGroup: "bazett-time-loop",
  },
  "master.bazett.skill.s5": {
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"],
    abilities: [
      {
        id: "third-day-attack",
        name: "第三天",
        activation: "phase",
        windows: ["action"],
        handlerId: "core.bazett-third-day",
        requiresActiveCard: false,
      },
      {
        id: "third-day-victory",
        name: "第三天",
        activation: "phase",
        windows: ["combat"],
        handlerId: "core.bazett-third-day",
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.bazett-third-day",
    supportLevel: "FULL",
  },
  "master.bazett.skill.ascension": {
    initiallyOwned: false,
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.bazett-flawless-defense",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "flawless-defense",
        kind: "passive",
        printedClause: "【佛拉格拉克】失去<每局游戏限一次>并获得：\"残留：此牌持续激活至你触发先发后至或再启动。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.bazett-flawless-defense" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.leonardo.skill.ascension": {
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: false,
    abilityCost: 6,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.leonardo-final-judgment",
    supportLevel: "FULL",
  },
  "master.roche.skill.s1a": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    handlerId: "core.roche-giant-guidance",
    supportLevel: "FULL",
  },
  "master.sion.skill.s10": {
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.sion-presence-concealment-ex",
    supportLevel: "FULL",
  },
  "master.sion.skill.ascension": {
    activation: "play",
    passiveEventTypes: ["card.played"],
    addSkillDefinitionIds: [
      "master.sion.skill.s5",
      "master.sion.skill.s6",
      "master.sion.skill.s7",
      "master.sion.skill.s8",
      "master.sion.skill.s10",
      "master.sion.skill.s11",
    ],
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  "master.sion.skill.s6": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    abilities: [
      {
        id: "hunt",
        name: "追猎",
        activation: "phase",
        windows: ["action"],
        handlerId: "core.structured-skill",
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "hunt",
          printedClause: "追猎-行动阶段：重新部署至一处战场或花费1点魔力，移动至侦查。",
          kind: "phase_action",
          activation: { phase: "action" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "action" },
          ],
          effects: [
            {
              type: "choose_one",
              id: "hunt-choice",
              options: [
                {
                  id: "battlefield",
                  label: "追猎-行动阶段：重新部署至一处战场或花费1点魔力，移动至侦查。",
                  effects: [
                    { type: "move_player", target: "controller", allowedLocationIds: ["mountain", "city"] },
                  ],
                },
                {
                  id: "scouting",
                  label: "追猎-行动阶段：重新部署至一处战场或花费1点魔力，移动至侦查。",
                  effects: [
                    { type: "pay_mana", amount: 1 },
                    { type: "move_player", target: "controller", locationId: "scouting", ignoreEngagement: true },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  "master.sion.skill.s7": {
    activation: "phase",
    windows: ["action", "combat"],
    passiveEventTypes: ["combat.resolved"],
    abilities: [
      {
        id: "sion-ex-remote-control",
        name: "远隔操作",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: false,
      },
      {
        id: "sion-ex-combat-result",
        name: "胜败结算",
        activation: "phase",
        windows: ["combat"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.sion-independent-action-ex",
    supportLevel: "FULL",
  },
  "master.zouken.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    initialMana: 10,
    playerFlags: { manaCap: 16 },
    handlerId: "core.game-start-player-config",
    supportLevel: "FULL",
  },
  "master.iliya.skill.s2": {
    activation: "passive",
    passiveEventTypes: ["round.started"],
    activateSkillDefinitionId: "master.iliya.skill.s4",
    handlerId: "core.round-start-activate-skill",
    supportLevel: "FULL",
  },
  "master.ophelia.skill.s1b": {
    activation: "passive",
    passiveEventTypes: ["round.started"],
    combatPowerBonus: -10,
    handlerId: "core.round-start-power-bonus",
    supportLevel: "FULL",
  },
  "servant.cu.skill.sc-cu-np": {
    activation: "passive",
    passiveEventTypes: ["combat.resolved"],
    requiresActiveCard: true,
    handlerId: "core.cu-gungnir-reward",
    supportLevel: "FULL",
  },
  "master.dan.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["player.moved", "combat.resolved"],
    handlerId: "core.dan-honor",
    supportLevel: "FULL",
  },
  "servant.hassan.skill.sc-hassan-np": {
    activation: "phase",
    requiresActiveCard: true,
    requiresHiddenTrueName: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.hassan-np",
    supportLevel: "FULL",
  },
  // Development-card text explicitly gives these four skills a single,
  // same-owner skill card at game start.  They share the already verified
  // idempotent game-start registration handler.
  "master.bazett.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionId: "master.bazett.skill.s2",
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  "master.ciel.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionId: "master.ciel.skill.s2",
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  "master.shiki-tohno.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionId: "master.shiki-tohno.skill.s2",
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  "master.fujino.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionId: "master.fujino.skill.s3",
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  "master.fujino.skill.s3": {
    activation: "phase",
    windows: ["action"],
    standardAppend: true,
    requiresActiveCard: true,
    abilities: [
      {
        id: "distort",
        name: "歪曲吧！",
        activation: "phase",
        windows: ["action"],
        handlerId: "core.structured-skill",
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "distort",
          printedClause: "歪曲吧！-行动阶段：激活【扭曲空间】。",
          kind: "phase_action",
          activation: { phase: "action" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "action" },
          ],
          effects: [
            { type: "activate_owned_skill_card", definitionId: "master.fujino.skill.s2" },
          ],
        },
      ],
    },
  },
  "master.shiki-ryougi.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionId: "master.shiki-ryougi.skill.s2",
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  "master.shiki-ryougi.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionId: "master.shiki-ryougi.skill.s3",
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  "master.shirou-emiya.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    initialMana: 2,
    handlerId: "core.master-initial-mana",
    supportLevel: "FULL",
  },
  "master.rin.skill.s3": {
    activation: "phase",
    windows: ["action"],
    limit: "once-per-game",
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "gem-option",
          printedClause: "<每局游戏限一次>\n行动阶段：选择一项本回合没有选择过的选项：\n-获得1点魔力。\n-打出一张游戏外的【阴炁弹】。\n-弃置1-3张牌，然后抽取相同数量的牌。",
          kind: "phase_action",
          activation: { phase: "action" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "action" },
          ],
          effects: [
            {
              type: "choose_one",
              id: "gem-choice",
              recordChoice: { key: "rin-gem-option", scope: "round" },
              options: [
                {
                  id: "gain-mana",
                  label: "-获得1点魔力。",
                  effects: [
                    { type: "gain_mana", target: "controller", amount: 1 },
                  ],
                },
                {
                  id: "play-yinqi",
                  label: "-打出一张游戏外的【阴炁弹】。",
                  effects: [
                    { type: "create_card_instances", definitionId: "card.card-yinqi", zone: "attack", count: 1, face: "up", active: true, temporary: true },
                  ],
                },
                {
                  id: "discard-draw",
                  label: "-弃置1-3张牌，然后抽取相同数量的牌。",
                  effects: [
                    { type: "discard_selected_hand_and_draw", payloadKey: "discardInstanceIds", minCount: 1, maxCount: 3 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  "master.shinji.skill.s2": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionId: "master.shinji.skill.s4",
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  // These cards have no additional lifecycle text: their entire mandatory
  // game-start effect is to put the named, already-registered skill cards
  // into the same owner's skill zone.
  "master.shiki-nanaya.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionId: "master.shiki-nanaya.skill.s2",
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  "master.fiore.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionIds: [
      "master.fiore.skill.s2",
      "master.fiore.skill.s3",
      "master.fiore.skill.s4",
    ],
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  "master.caules-yggdmillennia.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addSkillDefinitionIds: [
      "master.caules-yggdmillennia.skill.s2",
      "master.caules-yggdmillennia.skill.s3",
    ],
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
  },
  "master.caules-yggdmillennia.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["game.started", "round.ended"],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "reset-thunder",
          printedClause: "游戏开始与每回合结束时，【绞首刑之雷】更改为未激活状态（【绞首刑之雷】视为技能）。",
          kind: "passive",
          execution: { mode: "automatic" },
          conditions: [],
          effects: [
            { type: "deactivate_owned_skill_card", definitionId: "master.caules-yggdmillennia.skill.s3" },
          ],
        },
      ],
    },
  },
  "master.caules-yggdmillennia.skill.s2": {
    activation: "phase",
    windows: ["outpost"],
    requiresActiveCard: false,
    abilities: [
      {
        id: "charge",
        name: "充电",
        activation: "phase",
        windows: ["outpost"],
        handlerId: "core.structured-skill",
        requiresActiveCard: false,
      },
      {
        id: "start-thunder",
        name: "起载",
        activation: "phase",
        windows: ["outpost"],
        handlerId: "core.structured-skill",
        requiresActiveCard: false,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "charge",
          printedClause: "充电-前哨阶段：若你于前哨阶段部署于魔术工房，选择下列一项：1.获得1点魔力。2.花费2点魔力，你于本回合无视【败北】状态。",
          kind: "phase_action",
          activation: { phase: "outpost" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "outpost" },
            { type: "player_flag_equals", key: "deploymentLocationId", value: "workshop" },
          ],
          effects: [
            {
              type: "choose_one",
              id: "charge-choice",
              options: [
                {
                  id: "gain-mana",
                  label: "选项",
                  effects: [
                    { type: "gain_mana", target: "controller", amount: 1 },
                  ],
                },
                {
                  id: "ignore-defeat",
                  label: "2.花费2点魔力，你于本回合无视【败北】状态。",
                  effects: [
                    { type: "pay_mana", amount: 2 },
                    { type: "set_player_flag", target: "controller", key: "ignoreDefeat", value: true, lifecycle: { duration: "this_round" } },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "start-thunder",
          printedClause: "起载-前哨阶段：若你于前哨阶段部署于战场，激活【绞首刑之雷】。",
          kind: "phase_action",
          activation: { phase: "outpost" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "outpost" },
            { type: "at_battlefield" },
          ],
          effects: [
            { type: "activate_owned_skill_card", definitionId: "master.caules-yggdmillennia.skill.s3" },
          ],
        },
      ],
    },
  },
  "master.hinako.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["game.started", "combat.resolved"],
    addSkillDefinitionId: "master.hinako.skill.s2",
    handlerId: "core.hinako-death-wish",
    supportLevel: "FULL",
  },
  "master.hinako.skill.s2": {
    activation: "phase",
    windows: ["combat"],
    limit: "once-per-game",
    standardAppend: true,
    requiresActiveCard: true,
    handlerId: "core.hinako-blood-song",
    supportLevel: "FULL",
  },
  "master.kuzuki.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    addCardDefinitionId: "card.skill.master.kuzuki.skill.s3",
    addCardCount: 2,
    handlerId: "core.game-start-add-deck-cards",
    supportLevel: "FULL",
  },
  "servant.davinci.skill.sc-davinci-8": {
    handlerId: "core.card-play",
    supportLevel: "FULL",
  },
  "servant.davinci.skill.sc-davinci-7": {
    activation: "play",
    basicCardPowerBonus: 1,
    handlerId: "core.card-play",
    supportLevel: "FULL",
  },
  "master.zouken.skill.s5": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { situationNoblePhantasmWaiver: true },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.zouken.skill.s3": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    passiveEventTypes: ["game.started", "combat.resolved"],
    handlerId: "core.zouken-founder",
    supportLevel: "FULL",
  },
  "master.zouken.skill.s4": {
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: false,
    passiveEventTypes: ["round.ending"],
    handlerId: "core.zouken-pseudo-vampire",
    abilities: [
      { id: "blood-worms", name: "刻印虫", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.zouken-pseudo-vampire", requiresActiveCard: false },
      { id: "bug-form", name: "虫之身", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.zouken-pseudo-vampire", requiresActiveCard: false },
    ],
    handlerId: "core.zouken-pseudo-vampire",
    supportLevel: "FULL",
  },
  "master.zouken.skill.ascension": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.zouken-illusive-mastermind",
    supportLevel: "FULL",
  },
  "master.fiore.skill.s2": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { movementLockedOwnActionCombat: true },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.caules.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { nonClimaxSituationManaCap: 1 },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.kirei.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started", "servant.true-name-revealed"],
    handlerId: "core.kirei-role",
    supportLevel: "FULL",
  },
  "master.peperoncino.skill.s1a": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { canViewOpponentDiscard: true },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.peperoncino.skill.s1b": {
    activation: "phase",
    windows: ["action"],
    abilityCost: 2,
    combatPowerBonus: 3,
    moveForwardSteps: 1,
    handlerId: "core.power-bonus-and-forward-move",
    supportLevel: "FULL",
  },
  "servant.quetzalcoatl.skill.sc-quetzalcoatl-3": {
    activation: "phase",
    windows: ["action"],
    moveForwardSteps: 2,
    combatPowerBonusIfMoveImpossible: 3,
    handlerId: "core.power-bonus-and-forward-move",
    supportLevel: "FULL",
  },
  "servant.diarmuid.skill.sc-diarmuid-2": {
    activation: "phase",
    windows: ["combat"],
    combatPowerZeroAttribute: "宝具",
    abilities: [
      {
        id: "add-yellow-rose",
        name: "破魔的红蔷薇",
        activation: "phase",
        windows: ["combat"],
        abilityCost: 6,
        requiresActiveCard: true,
      },
      {
        id: "zero-noble-phantasm",
        name: "破魔",
        activation: "phase",
        windows: ["combat"],
        abilityCost: 0,
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.diarmuid-red-rose",
    supportLevel: "FULL",
  },
  "servant.angra.skill.sc-angra-1": {
    activation: "phase",
    windows: ["action"],
    passiveEventTypes: ["combat.ending"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    abilities: [{
      id: "all-world-evils-delay",
      name: "伪写记载之万象",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
    }],
    handlerId: "core.angra-all-evils",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "all-world-evils-delay",
        kind: "phase_action",
        printedClause: "行动阶段：战斗阶段结束后弃置自己4张牌（若不足4张，则手牌全部弃置）。若你战败，每弃置一张【复仇者】，你便可偷取一名击败你的胜利者2点战果。",
        activation: { phase: "action" },
        execution: { mode: "handler", handlerId: "core.angra-all-evils" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.angra.skill.sc-angra-2": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    abilities: [{
      id: "eternal-binding-return",
      name: "永世束缚",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
    }],
    handlerId: "core.angra-eternal-binding",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "eternal-binding-return",
        kind: "phase_action",
        printedClause: "行动阶段：将你的弃牌堆中的所有【复仇者】加入手牌。如果你于上一回合中战败，则将它们加入攻击。",
        activation: { phase: "action" },
        execution: { mode: "handler", handlerId: "core.angra-eternal-binding" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.angra.skill.sc-angra-3": {
    activation: "phase",
    windows: ["action"],
    requiresEightMana: false,
    drawCount: 2,
    manaGain: 4,
    handlerId: "core.angra-bites",
    supportLevel: "FULL",
  },
  "servant.frank.skill.sc-frank-2": {
    activation: "phase",
    windows: ["combat"],
    combatPowerBonusFromBattlefieldPlayedCosts: true,
    handlerId: "core.combat-power-from-battlefield-played-costs",
    supportLevel: "FULL",
  },
  "servant.frank.skill.sc-frank-3": {
    activation: "play",
    passiveEventTypes: ["card.played"],
    revealsTrueNameOnPlay: true,
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        onOwnFaceUpPlay({
          id: "death-and-rebirth",
          printedClause: "【真名解放】死亡与新生-你无视【败北】效果。在下回合开始时你【败北】。",
          activation: { phase: "action" },
          execution: { mode: "automatic" },
          effects: [
            { type: "set_player_flag", target: "controller", key: "ignoreDefeat", value: true, lifecycle: { duration: "this_round" } },
            { type: "schedule_effect", abilityId: "next-round-defeat-self", triggerEventType: "round.started", triggerRoundOffset: 1 },
          ],
        }),
        {
          id: "next-round-defeat-self",
          printedClause: "在下回合开始时你【败北】。",
          kind: "passive",
          activation: { phase: "preparation" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "event_type_is", eventType: "round.started" },
          ],
          effects: [
            { type: "defeat_player", target: "controller" },
          ],
        },
      ],
    },
  },
  "servant.illya.skill.sc-illya-2": {
    activation: "play",
    passiveEventTypes: ["card.played"],
    requiresEightMana: false,
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        onOwnFaceUpPlay({
          id: "mana-slash-boost",
          printedClause: "打出时：若你在打出此牌时拥有至少8点魔力，此牌获得威力+3。",
          activation: { phase: "action" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "player_flag_number_at_least", key: "lastAttackCommitManaBefore", value: 8 },
          ],
          effects: [
            { type: "source_card_power_bonus", amount: 3 },
          ],
        }),
      ],
    },
  },
  "servant.maxwell.skill.sc-maxwell-2": {
    activation: "phase",
    windows: ["action", "combat"],
    requiresEightMana: false,
    requiresActiveCard: true,
    limit: "once-per-round",
    abilities: [
      {
        id: "paradox-seed",
        name: "恶魔的证明",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
      {
        id: "paradox-collapse",
        name: "恶魔证明",
        activation: "phase",
        windows: ["combat"],
        limit: "once-per-game",
        requiresActiveCard: true,
        revealsTrueNameOnSkillUse: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "paradox-seed",
          printedClause: "行动阶段：你所在地点的玩家获得2点魔力与一个【悖论】指示物。",
          kind: "activated",
          activation: { phase: "action" },
          execution: { mode: "manual" },
          conditions: [
            { type: "phase_is", phase: "action" },
          ],
          effects: [
            { type: "gain_mana", target: { scope: "same_location_players" }, amount: 2 },
            { type: "add_player_flag_number", target: { scope: "same_location_players" }, key: "paradoxCount", amount: 1 },
          ],
        },
        {
          id: "paradox-collapse",
          printedClause: "战斗阶段：<每局游戏限一次>【真名解放】，令拥有【悖论】的数量大于其魔力值一半的所有玩家【败北】。",
          kind: "activated",
          activation: { phase: "combat" },
          execution: { mode: "manual" },
          conditions: [
            { type: "phase_is", phase: "combat" },
          ],
          effects: [
            {
              type: "defeat_player",
              target: {
                scope: "all_players",
                where: [
                  { type: "player_flag_greater_than_mana_ratio", key: "paradoxCount", numerator: 1, denominator: 2 },
                ],
              },
            },
          ],
        },
      ],
    },
  },
  "servant.artoriac.skill.sc-artoriac-2": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    abilities: [
      {
        id: "selection-staff",
        name: "选定之杖",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "selection-staff",
          printedClause: "行动阶段：花费X点魔力，然后查看你牌库顶的X+2张牌，你可以将其中一张加入手牌，然后弃置其余被查看的牌。",
          kind: "activated",
          activation: { phase: "action" },
          execution: { mode: "manual" },
          conditions: [
            { type: "phase_is", phase: "action" },
          ],
          effects: [
            { type: "pay_mana", amount: { type: "payload_number", key: "amount", min: 0 } },
            {
              type: "look_deck_top_choose_one_to_hand_discard_rest",
              count: { type: "payload_number_plus", key: "amount", add: 2, min: 2 },
              payloadKey: "selectedInstanceId",
            },
          ],
        },
      ],
    },
  },
  "servant.shakespeare.skill.sc-shakespeare-3": {
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    abilities: [
      {
        id: "tragedy-writing",
        name: "悲剧创作",
        activation: "phase",
        windows: ["combat"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "tragedy-writing",
          printedClause: "悲剧创作-战斗阶段：使一名本回合未使用过令咒的交战玩家【败北】。",
          kind: "activated",
          activation: { phase: "combat" },
          execution: { mode: "manual" },
          conditions: [
            { type: "phase_is", phase: "combat" },
          ],
          effects: [
            {
              type: "defeat_player",
              target: {
                scope: "selected_same_battlefield_opponent",
                where: [
                  { type: "player_flag_number_not_current_round", key: "commandSealUsedRound" },
                ],
              },
            },
          ],
        },
      ],
    },
  },
  "servant.leonidas.skill.sc-leonidas-2": {
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnSkillUse: true,
    abilities: [
      {
        id: "warrior-roar",
        name: "战士的雄叫",
        activation: "phase",
        windows: ["combat"],
        requiresActiveCard: true,
        revealsTrueNameOnSkillUse: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "warrior-roar",
          printedClause: "战斗阶段：选择一张此战斗中对手的攻击，于下回合获得该牌的攻击数值的合计威力。",
          kind: "activated",
          activation: { phase: "combat" },
          execution: { mode: "manual" },
          conditions: [
            { type: "phase_is", phase: "combat" },
          ],
          effects: [
            {
              type: "schedule_combat_power_bonus_from_selected_card",
              scope: "same_battlefield_opponent_attack",
              payloadKey: "targetInstanceId",
              abilityId: "warrior-roar-next-round",
              triggerEventType: "round.started",
              triggerRoundOffset: 1,
            },
          ],
        },
        {
          id: "warrior-roar-next-round",
          printedClause: "战斗阶段：选择一张此战斗中对手的攻击，于下回合获得该牌的攻击数值的合计威力。",
          kind: "passive",
          activation: { phase: "preparation" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "event_type_is", eventType: "round.started" },
          ],
          effects: [
            { type: "combat_power_bonus", target: "controller", amount: { type: "payload_number", key: "amount", min: 0 } },
          ],
        },
      ],
    },
  },
  "servant.astraea.skill.sc-astraea-1": {
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnSkillUse: true,
    abilities: [
      {
        id: "judgment-time",
        name: "裁决之时",
        activation: "phase",
        windows: ["combat"],
        requiresActiveCard: true,
        revealsTrueNameOnSkillUse: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "judgment-time",
          printedClause: "【真名解放】战斗阶段：移除所有玩家的【谴责】，每有一名被移除【谴责】的玩家，此牌+4威力（至多+8威力）。",
          kind: "activated",
          activation: { phase: "combat" },
          execution: { mode: "manual" },
          conditions: [
            { type: "phase_is", phase: "combat" },
          ],
          effects: [
            {
              type: "clear_player_status_and_source_card_power_bonus",
              target: { scope: "all_players" },
              status: "谴责",
              flagKey: "condemned",
              amountPerTarget: 4,
              maxAmount: 8,
            },
          ],
        },
      ],
    },
  },
  "servant.darius.skill.sc-darius-4": {
    activation: "residual",
    windows: ["combat"],
    passiveEventTypes: ["combat.resolved"],
    uniqueGroup: "darius-undead-soldiers",
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "undead-soldier-half-close",
          printedClause: "残留-唯一：战斗阶段结束后，若你处于交战状态，关闭你一半数量的【不死兵】（向上取整）",
          kind: "residual",
          activation: { phase: "combat" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "event_type_is", eventType: "combat.resolved" },
            { type: "source_active" },
            { type: "target_count_at_least", scope: "same_battlefield_opponents", count: 1 },
          ],
          effects: [
            { type: "close_owned_active_cards_by_definition", definitionId: "self", residualOnly: true, countFormula: "half_up" },
          ],
        },
      ],
    },
  },
  "servant.hassanser.skill.sc-hassanser-2": {
    activation: "phase",
    windows: ["action", "combat"],
    steps: ["player-window"],
    standardAppend: true,
    requiresActiveCard: true,
    abilities: [
      {
        id: "poison-gas",
        name: "毒气",
        activation: "phase",
        windows: ["action"],
        steps: ["player-window"],
        requiresActiveCard: true,
      },
      {
        id: "wither",
        name: "妄想毒身",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        requiresActiveCard: true,
      },
      {
        id: "death-kiss",
        name: "死亡之吻",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "poison-gas",
          printedClause: "毒气-行动阶段：与你位于同一战场的对手失去1点战果。",
          kind: "phase_action",
          activation: { phase: "action" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "action" },
            { type: "at_battlefield" },
          ],
          effects: [
            { type: "lose_victory_points", target: { scope: "same_battlefield_opponents" }, amount: 1 },
          ],
        },
        {
          id: "wither",
          printedClause: "枯萎-被动/战斗阶段：与你位于同一战场的对手失去1点战果。",
          kind: "phase_action",
          activation: { phase: "combat" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "combat" },
            { type: "at_battlefield" },
          ],
          effects: [
            { type: "lose_victory_points", target: { scope: "same_battlefield_opponents" }, amount: 1 },
          ],
        },
        {
          id: "death-kiss",
          printedClause: "死亡之吻-战斗阶段：关闭此战场的一张基础牌，你和该牌的拥有者各失去1点战果。",
          kind: "phase_action",
          activation: { phase: "combat" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "combat" },
            { type: "at_battlefield" },
          ],
          effects: [
            { type: "close_selected_card", scope: "same_battlefield", zone: "attack", basicOnly: true, activeOnly: true, payloadKey: "targetInstanceId" },
            { type: "lose_victory_points", target: "controller", amount: 1 },
            { type: "lose_victory_points", target: { scope: "selected_card_owners", payloadKey: "targetInstanceId" }, amount: 1 },
          ],
        },
      ],
    },
  },
  "master.hakuno-f.skill.s3": {
    activation: "phase",
    windows: ["action"],
    steps: ["player-window"],
    passiveEventTypes: ["combat.resolved"],
    standardAppend: true,
    requiresActiveCard: true,
    abilities: [
      {
        id: "illegal-intrusion",
        name: "代码_非法侵入",
        activation: "phase",
        windows: ["action"],
        steps: ["player-window"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "data-leak",
          printedClause: "数据泄露-被动：当你输掉一场战斗时，失去1点战果。",
          kind: "passive",
          activation: { phase: "combat" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "event_type_is", eventType: "combat.resolved" },
            { type: "source_active" },
            { type: "event_player_lost_combat" },
          ],
          effects: [
            { type: "lose_victory_points", target: "controller", amount: 1 },
          ],
        },
        {
          id: "illegal-intrusion",
          printedClause: "代码_非法侵入-行动阶段：选择一名位于当前战场的玩家，查看其牌堆顶3张牌。弃置其中任意数量的牌，然后将剩余牌按任意顺序放回其牌堆顶部。",
          kind: "phase_action",
          activation: { phase: "action" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "action" },
            { type: "at_battlefield" },
          ],
          effects: [
            {
              type: "look_target_deck_top_discard_selected_keep_rest",
              target: { scope: "selected_same_location_player" },
              count: 3,
              minCount: 0,
              maxCount: 3,
            },
          ],
        },
      ],
    },
  },
  "servant.scathach.skill.sc-scathach-2": {
    activation: "phase",
    windows: ["combat"],
    steps: ["player-window"],
    passiveEventTypes: ["combat.resolved"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    abilities: [
      {
        id: "piercing-spear-close",
        name: "贯穿死翔之枪",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "piercing-spear-close",
          printedClause: "战斗阶段：若仅有一名对手与你位于同一战场，令其关闭一张自己的非残留攻击。",
          kind: "phase_action",
          activation: { phase: "combat" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "combat" },
            { type: "target_count_equals", scope: "same_battlefield_opponents", count: 1 },
          ],
          effects: [
            {
              type: "choose_each_player_cards",
              candidateTarget: { scope: "same_battlefield_opponents" },
              zone: "attack",
              activeOnly: true,
              face: "up",
              residual: false,
              minCandidateCount: 1,
              minCount: 1,
              maxCount: 1,
              payloadKey: "targetInstanceId",
              then: [
                {
                  type: "close_selected_card",
                  scope: "same_battlefield",
                  zone: "attack",
                  activeOnly: true,
                  nonResidualOnly: true,
                  ownerScope: "same_battlefield_opponents",
                  payloadKey: "targetInstanceId",
                },
              ],
            },
          ],
        },
        onActiveCombatWin({
          id: "death-omen",
          printedClause: "死兆-战斗阶段：若你获胜，你每有一名交战对手，便获得1点战果。",
          execution: { mode: "automatic" },
          effects: [
            { type: "gain_victory_points_per_target", target: "controller", countTarget: { scope: "same_battlefield_opponents" }, amountPerTarget: 1 },
          ],
        }),
      ],
    },
  },
  "servant.boudica.skill.sc-boudica-2": {
    activation: "phase",
    windows: ["outpost"],
    steps: ["player-window"],
    passiveEventTypes: ["combat.resolved", "round.ended"],
    requiresActiveCard: true,
    abilities: [
      {
        id: "oathless-sword",
        name: "无以誓约胜利之剑",
        activation: "phase",
        windows: ["outpost"],
        steps: ["player-window"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "lost-combat-penalty",
          printedClause: "当你输掉一场战斗时，失去1点战果。",
          kind: "passive",
          activation: { phase: "combat" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "event_type_is", eventType: "combat.resolved" },
            { type: "source_active" },
            { type: "event_player_lost_combat" },
          ],
          effects: [
            { type: "lose_victory_points", target: "controller", amount: 1 },
          ],
        },
        {
          id: "oathless-sword",
          printedClause: "被动/前哨阶段：弃置一张【幸运】，抽一张牌。本回合获得5点合计威力，若你本回合赢得战斗，每有一名回合顺位在你之后的玩家便获得1点战果，若你没有赢得战斗，失去2点战果。",
          kind: "phase_action",
          activation: { phase: "outpost" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "outpost" },
          ],
          effects: [
            { type: "discard_selected_cards", target: "controller", zone: "hand", definitionId: "card.cardluck", count: 1, payloadKey: "discardInstanceIds" },
            { type: "draw_cards", target: "controller", amount: 1 },
            { type: "combat_power_bonus", target: "controller", amount: 5 },
            { type: "set_player_flag", target: "controller", key: "boudicaOathlessSwordRound", value: { type: "current_round" } },
          ],
        },
        {
          id: "oathless-sword-win",
          printedClause: "本回合获得5点合计威力，若你本回合赢得战斗，每有一名回合顺位在你之后的玩家便获得1点战果，若你没有赢得战斗，失去2点战果。",
          kind: "passive",
          activation: { phase: "combat" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "event_type_is", eventType: "combat.resolved" },
            { type: "player_flag_number_current_round", key: "boudicaOathlessSwordRound" },
            { type: "event_player_won_combat" },
          ],
          effects: [
            { type: "gain_victory_points_per_target", target: "controller", countTarget: { scope: "turn_order_after_controller" }, amountPerTarget: 1 },
            { type: "set_player_flag", target: "controller", key: "boudicaOathlessSwordWonRound", value: { type: "current_round" } },
          ],
        },
        {
          id: "oathless-sword-no-win",
          printedClause: "当你输掉一场战斗时，失去1点战果。",
          kind: "passive",
          activation: { phase: "combat" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "event_type_is", eventType: "round.ended" },
            { type: "player_flag_number_equals_event_field", key: "boudicaOathlessSwordRound", field: "round" },
            { type: "player_flag_number_not_event_field", key: "boudicaOathlessSwordWonRound", field: "round" },
          ],
          effects: [
            { type: "lose_victory_points", target: "controller", amount: 2 },
            { type: "clear_player_flag", target: "controller", key: "boudicaOathlessSwordRound" },
            { type: "clear_player_flag", target: "controller", key: "boudicaOathlessSwordWonRound" },
          ],
        },
        {
          id: "oathless-sword-cleanup",
          printedClause: "当你输掉一场战斗时，失去1点战果。\n被动/前哨阶段：弃置一张【幸运】，抽一张牌。本回合获得5点合计威力，若你本回合赢得战斗，每有一名回合顺位在你之后的玩家便获得1点战果，若你没有赢得战斗，失去2点战果。",
          kind: "passive",
          activation: { phase: "combat" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "event_type_is", eventType: "round.ended" },
            { type: "player_flag_number_equals_event_field", key: "boudicaOathlessSwordRound", field: "round" },
            { type: "player_flag_number_equals_event_field", key: "boudicaOathlessSwordWonRound", field: "round" },
          ],
          effects: [
            { type: "clear_player_flag", target: "controller", key: "boudicaOathlessSwordRound" },
            { type: "clear_player_flag", target: "controller", key: "boudicaOathlessSwordWonRound" },
          ],
        },
      ],
    },
  },
  "servant.gareth.skill.sc-gareth-1": {
    activation: "phase",
    windows: ["action"],
    steps: ["player-window"],
    passiveEventTypes: ["card.played", "combat.resolved"],
    requiresActiveCard: true,
    abilities: [
      {
        id: "nameless-knight",
        name: "无名骑士",
        activation: "phase",
        windows: ["action"],
        steps: ["player-window"],
        abilityCost: 2,
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        onActiveCombatWin({
          id: "crown-of-glory",
          printedClause: "荣光之冠-被动：当你赢得一场战斗时，你【真名解放】。若你以此法【真名解放】，你获得1点战果。",
          execution: { mode: "automatic" },
          effects: [
            {
              type: "reveal_true_name",
              target: "controller",
              thenIfChanged: [
                { type: "gain_victory_points", target: "controller", amount: 1 },
              ],
            },
          ],
        }),
        onOwnFaceUpPlay({
          id: "disguise-on-play",
          printedClause: "伪装-打出时：隐藏真名。",
          execution: { mode: "automatic" },
          effects: [
            { type: "hide_true_name", target: "controller" },
          ],
        }),
        {
          id: "nameless-knight",
          printedClause: "无名骑士-被动/行动阶段：花费2点魔力，若你真名隐藏，移动至一处相邻的地点。",
          kind: "phase_action",
          activation: { phase: "action" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "action" },
            { type: "true_name_hidden" },
          ],
          effects: [
            { type: "move_player", target: "controller", adjacentOnly: true },
          ],
        },
      ],
    },
  },
  "servant.spartacus.skill.sc-spartacus-1": {
    activation: "phase",
    windows: ["combat"],
    combatPowerBonusPerCommandSealUser: { base: 6, ownCommandSealMultiplier: -2, includeRulerCommandSeals: true },
    handlerId: "core.combat-power-from-command-seal-users",
    supportLevel: "FULL",
  },
  "servant.sanson.skill.sc-sanson-3": {
    activation: "phase",
    windows: ["combat"],
    highVictoryCombatPowerRule: { penalty: -3, selfBonusIfTopOpponentEngaged: 3 },
    handlerId: "core.high-victory-combat-power",
    supportLevel: "FULL",
  },
  "servant.edison.skill.sc-edison-1": {
    activation: "phase",
    windows: ["combat"],
    requiresEightMana: false,
    opponentBonusPerCostlyAttack: { minPaidCost: 1, mana: 1, combatPower: 2 },
    handlerId: "core.opponent-bonus-per-costly-attack",
    supportLevel: "FULL",
  },
  "servant.mash.skill.sc-mash-2": {
    activation: "phase",
    windows: ["combat"],
    opponentAttackPowerModifier: { hiddenTrueNameAmount: -3, revealedTrueNameAmount: -4, excludeGuardedByOwner: true },
    handlerId: "core.opponent-attack-power-modifier",
    supportLevel: "FULL",
  },
  "servant.ivan.skill.sc-ivan-1": {
    activation: "phase",
    windows: ["action"],
    abilities: [
      {
        id: "tsar-eye",
        name: "沙皇之眼",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
      {
        id: "tsar-law",
        name: "沙皇之律",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
      {
        id: "tsar-wrath",
        name: "于吾梦路 潜行而出之黑犬",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.ivan-black-dog",
    supportLevel: "FULL",
  },
  "servant.mhx.skill.sc-mhx-1": {
    activation: "phase",
    windows: ["combat"],
    steps: ["player-window"],
    limit: "once-per-game",
    requiresActiveCard: true,
    abilities: [
      {
        id: "saber-must-die",
        name: "Saber必须死！",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.mhx-anti-saber-weapon",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "saber-must-die",
          kind: "phase_action",
          printedClause: "Saber必须死！-战斗阶段：令一名交战对手【败北】。若其战败，偷取其2点战果。若其战败且从者为金发或职阶为Saber，改为偷取4点战果。若均满足，改为偷取6点战果。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "automatic", handlerId: "core.mhx-anti-saber-weapon" },
        },
      ],
    },
  },
  "servant.mhx.skill.sc-mhx-2": {
    activation: "phase",
    windows: ["action", "combat"],
    abilities: [
      {
        id: "galaxy-meteor-sword",
        name: "银河流星剑",
        activation: "phase",
        windows: ["action"],
        abilityCost: 4,
        requiresActiveCard: true,
      },
      {
        id: "cosmic-reactor",
        name: "宇宙反应器",
        activation: "phase",
        windows: ["combat"],
        requiresActiveCard: true,
      },
    ],
    eventCardPowerBonus: { perEvent: 3 },
    handlerId: "core.mhx-nameless-victory-sword",
    supportLevel: "FULL",
  },
  "servant.andersen.skill.sc-andersen-3": {
    activation: "phase",
    windows: ["outpost", "action"],
    passiveEventTypes: ["combat.resolved", "round.ended"],
    abilities: [
      {
        id: "innocent-mark",
        name: "无辜的怪物",
        activation: "phase",
        windows: ["outpost"],
        abilityCost: 1,
        requiresActiveCard: true,
      },
      {
        id: "monster-power",
        name: "无辜的怪物",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
    ],
    markedDefeatVictoryPointReward: 2,
    variableManaPowerBonusMax: 12,
    handlerId: "core.andersen-innocent-monster",
    supportLevel: "FULL",
  },
  "servant.okita.skill.sc-okita-3": {
    activation: "phase",
    windows: ["outpost"],
    passiveEventTypes: ["phase.transitioned", "round.ended"],
    requiresActiveCard: false,
    combatPowerBonus: 3,
    revealHandUntilRoundEnd: true,
    combatStartDrawCount: 1,
    handlerId: "core.okita-haori",
    supportLevel: "FULL",
  },
  "servant.siegfried.skill.sc-siegfried-1": {
    activation: "phase",
    windows: ["action"],
    passiveEventTypes: ["card.played", "round.ended"],
    requiresActiveCard: true,
    handlerId: "core.siegfried-invisibility-cloak",
    supportLevel: "FULL",
  },
  "servant.siegfried.skill.sc-siegfried-3": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    revealHandPowerBonus: { minBasePower: 4, perCard: 2, max: 6 },
    handlerId: "core.reveal-hand-power-bonus",
    supportLevel: "FULL",
  },
  "servant.gawain.skill.sc-gawain-1": {
    activation: "phase",
    windows: ["outpost"],
    passiveEventTypes: ["card.played", "round.ended"],
    requiresActiveCard: false,
    requiresBattlefieldLocation: true,
    manaGain: 3,
    combatPowerBonus: 3,
    roundEndLoseAllManaUnlessPlayedSelf: true,
    handlerId: "core.gawain-galatine",
    supportLevel: "FULL",
  },
  "servant.gawain.skill.sc-gawain-2": {
    activation: "phase",
    windows: ["combat"],
    passiveEventTypes: ["event.revealed"],
    requiresActiveCard: true,
    handlerId: "core.gawain-saint-number",
    supportLevel: "FULL",
    abilities: [
      {
        id: "challenge",
        name: "挑战",
        activation: "passive",
        windows: [],
        handlerId: "core.gawain-saint-number",
        requiresActiveCard: true,
      },
      {
        id: "nightless-charm",
        name: "不夜的魅力",
        activation: "phase",
        windows: ["combat"],
        handlerId: "core.gawain-saint-number",
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "challenge",
          kind: "passive",
          printedClause: "挑战-被动：当一张事件牌被展示后，你可以弃置一张与其提到的属性对应的手牌。若你如此做，被【挑战】的事件牌获得获得+3战果。",
          execution: { mode: "automatic", handlerId: "core.gawain-saint-number" },
        },
        {
          id: "nightless-charm",
          kind: "phase_action",
          printedClause: "不夜的魅力-战斗阶段：如果你位于被【挑战】事件牌的战斗中，或你支付3点魔力：将你所有基础威力为3的攻击的基础威力×3。",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.gawain-saint-number" },
        },
      ],
      evidence: [
        {
          kind: "development-image",
          document: "Fate_Domination-开发版",
          locator: "servant.gawain/高文",
        },
        {
          kind: "chm",
          document: "FD全卡图鉴V2.0.chm",
          locator: "从者/剑士/英文版/高文.htm",
        },
      ],
      verification: { status: "scenario-tested" },
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "master.waver.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    playerFlags: { canViewFaceDownEvents: true },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
  },
  "master.iliya.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    initialMana: 6,
    handlerId: "core.master-initial-mana",
    supportLevel: "FULL",
  },
  "master.taiga.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    initialMana: 3,
    handlerId: "core.master-initial-mana",
    supportLevel: "FULL",
  },
  [gorgonNoblePhantasmPassiveId]: {
    activation: "passive",
    passiveEventTypes: ["card.used"],
    handlerId: "core.gorgon-noble-phantasm-watch",
    supportLevel: "FULL",
  },
  [shinjiDefeatSealId]: {
    activation: "passive",
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.defeat-lose-command-seal",
    supportLevel: "FULL",
  },
  [kireiCombatPowerSkillId]: {
    activation: "phase",
    steps: ["player-window"],
    handlerId: "core.combat-power-bonus",
    combatPowerBonus: 2,
    supportLevel: "FULL",
  },
  [dragonHeartSkillIds[0]]: {
    activation: "passive",
    passiveEventTypes: ["combat.resolved"],
    requiresActiveCard: true,
    handlerId: "core.dragon-heart",
    supportLevel: "FULL",
  },
  [dragonHeartSkillIds[1]]: {
    activation: "passive",
    passiveEventTypes: ["combat.resolved"],
    requiresActiveCard: true,
    handlerId: "core.dragon-heart",
    supportLevel: "FULL",
  },
  "master.sieg.skill.s1a": {
    activation: "phase",
    handlerId: "core.sieg-dragon-command-seal",
    supportLevel: "FULL",
    steps: ["play-batch-draft"],
    limit: "once-per-round",
  },
  "master.sakura.skill.s3": {
    activation: "phase",
    abilityCost: 2,
    handlerId: "core.sakura-black-mud",
    supportLevel: "FULL",
    steps: ["player-window"],
    limit: "once-per-round",
  },
  "master.irisviel.skill.s2": {
    activation: "phase",
    handlerId: "core.irisviel-conversion-magic",
    supportLevel: "FULL",
    steps: ["player-window"],
    limit: "once-per-round",
  },
  // Development card images confirm these are plain skill-deck attacks.
  // They have no phase ability beyond the shared card-play transaction.
  "master.kuzuki.skill.s3": {
    handlerId: "core.card-play",
    supportLevel: "FULL",
  },
  "master.rin.skill.s4": {
    handlerId: "core.card-play",
    supportLevel: "FULL",
    limit: "once-per-game",
  },
  // Development card image explicitly notes no extra ability text.
  "servant.mandricardo.skill.sc-mandricardo-2": {
    handlerId: "core.card-play",
    supportLevel: "FULL",
  },
  "servant.sanzang.skill.sc-sanzang-1": {
    handlerId: "servant.sanzang.skill.sc-sanzang-1",
    supportLevel: "FULL",
  },
  "servant.emiya.skill.sc-emiya-np": { attributes: ["特殊"], revealsTrueNameOnPlay: true },
  "servant.chloe.skill.sc-chloe-1": { attributes: ["特殊"], revealsTrueNameOnPlay: true },
  "servant.emiya-alt.skill.sc-emiya-alt-2": { attributes: ["特殊"] },
  "servant.kintoki.skill.sc-kintoki-1": {
    requiresEightMana: false,
    ignoresSituationRestrictions: true,
    handlerId: "core.card-play",
    supportLevel: "FULL",
  },
  "servant.kintoki.skill.sc-kintoki-2": {
    requiresEightMana: false,
    ignoresSituationRestrictions: true,
    handlerId: "core.card-play",
    supportLevel: "FULL",
  },
  "master.kayneth.skill.s1": {
    handlerId: "core.skill-eight-mana-waiver",
    supportLevel: "FULL",
  },
  "master.waver.skill.s2": {
    abilityCost: 1,
    drawCount: 2,
    handlerId: "core.pay-mana-draw",
    supportLevel: "FULL",
  },
  "master.shinji.skill.s1": {
    handlerId: "core.enter-location-gain-mana",
    locationId: "mountain",
    manaGain: 1,
    supportLevel: "FULL",
  },
  "master.tiamat.skill.s1a": {
    tags: ["tiamat-human-evil"],
    handlerId: "core.tiamat-human-evil",
    supportLevel: "FULL",
  },
  "servant.emiya.skill.sc-emiya-1": {
    handlerId: "core.zero-opponent-attribute",
    supportLevel: "FULL",
    combatPowerZeroAttribute: "迅捷",
  },
  "master.iliya.skill.s4": {
    activation: "passive",
    passiveEventTypes: ["combat.resolved", "round.ended", "round.started"],
    handlerId: "core.illya-heavenly-garment",
    supportLevel: "FULL",
  },
  "master.iliya.skill.s3": {
    activation: "passive",
    passiveEventTypes: ["game.started", "round.ended"],
    handlerId: "core.illya-small-grail",
    supportLevel: "FULL",
  },
  "servant.saber.skill.sc-saber-2": {
    handlerId: "core.zero-opponent-attribute",
    supportLevel: "FULL",
    combatPowerZeroAttribute: "力量",
    hiddenTrueNameCostReduction: 2,
  },
  "servant.arthur.skill.sc-arthur-2": {
    handlerId: "core.arthur-windbreaker",
    supportLevel: "FULL",
    combatPowerZeroAttribute: "力量",
    passiveEventTypes: ["game.started"],
  },
  "servant.muramasa.skill.sc-muramasa-1": {
    singleCardPlay: true,
  },
  "servant.arash.skill.sc-arash-1": {
    activation: "optional-trigger",
    requiresActiveCard: false,
    revealsTrueNameOnSkillUse: true,
    handlerId: "core.arash-preparation",
    supportLevel: "FULL",
  },
  "servant.chiron.skill.sc-chiron-3": {
    activation: "optional-trigger",
    requiresActiveCard: false,
    handlerId: "core.self-play-card",
    supportLevel: "FULL",
  },
  // 混沌【恐惧?的“支配?是明确的战斗阶段属性归零效果：
  // ?响与混沌同一战场的?手所控制的?幸运?攻击??
  "master.chaos.skill.s9": {
    activation: "phase",
    handlerId: "core.chaos-fear",
    supportLevel: "FULL",
  },
  "master.chaos.skill.s2": {
    activation: "phase",
    handlerId: "core.chaos-hunter",
    supportLevel: "FULL",
  },
  "servant.cu.skill.sc-cu-1": {
    handlerId: "core.cu-gae-bolg",
    supportLevel: "FULL",
  },
  "servant.emiya.skill.sc-emiya-2": {
    activation: "phase",
    windows: ["action", "combat"],
    limit: "once-per-game",
    passiveEventTypes: ["combat.resolved"],
    abilities: [
      {
        id: "fake-spiral-triple-advantage",
        name: "伪·螺旋剑",
        activation: "phase",
        windows: ["action"],
        // 基?规则 paragraph:138：非“??”的行动阶?能力必须先将该牌?活??
        requiresActiveCard: true,
      },
      {
        id: "fake-spiral-victory-reward",
        name: "胜利奖励",
        activation: "phase",
        windows: ["combat"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.emiya-fake-spiral-sword",
    supportLevel: "FULL",
  },
  "servant.cu-alter.skill.sc-cu-alter-1": {
    activation: "passive",
    windows: ["combat"],
    requiresActiveCard: false,
    passiveEventTypes: ["combat.ending"],
    handlerId: "core.cu-alter-curruid-passive",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "protection-from-arrows",
          kind: "passive",
          printedClause: "避矢之加护-被动：当一名对手即将令你【败北】时，他需花费3点魔力。",
          conditions: [{ type: "source_owned" }],
          execution: { mode: "automatic" },
          ruleModifiers: [{
            id: "opponent-defeat-cost-three",
            operation: "add",
            rule: "defeat_cost",
            scope: { subject: "controller" },
            value: 3,
            lifecycle: { duration: "permanent" },
          }],
        },
        {
          id: "curruid-combat-attrition",
          kind: "passive",
          printedClause: "被动：与你交战的对手在战斗阶段结束后失去X点战果，X为其控制的激活攻击数-1且最大为3。",
          execution: { mode: "handler", handlerId: "core.cu-alter-curruid-passive" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.cu-alter.skill.sc-cu-alter-2": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    cardResidual: true,
    passiveEventTypes: ["combat.ending"],
    handlerId: "core.cu-alter-curruid-permanent",
    supportLevel: "FULL",
    abilities: [{
      id: "curruid-power",
      name: "噬碎死牙·力量",
      activation: "phase",
      windows: ["action"],
      steps: ["player-window"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "curruid-np-lock",
          kind: "residual",
          printedClause: "残留：你不能使用【库·丘林Alter】的宝具。",
          conditions: [{ type: "source_active" }],
          execution: { mode: "automatic" },
          ruleModifiers: [
            {
              id: "curruid-forbid-cu-np-play",
              operation: "forbid",
              rule: "card_play",
              scope: { subject: "controller", cards: { ownerDefinitionIds: ["servant.cu-alter"], attributesAny: ["宝具"] } },
              lifecycle: { duration: "while_active" },
            },
            {
              id: "curruid-forbid-cu-np-use",
              operation: "forbid",
              rule: "skill_use",
              scope: { subject: "controller", skillCard: { ownerDefinitionIds: ["servant.cu-alter"], attributesAny: ["宝具"] } },
              lifecycle: { duration: "while_active" },
            },
          ],
        },
        {
          id: "curruid-basic-upgrade",
          kind: "residual",
          printedClause: "残留：你不能使用【库·丘林Alter】的宝具。你每打出一张基础攻击时，可以支付1点魔力。若如此做，此攻击获得力量属性与+1威力至回合结束。",
          conditions: [{ type: "source_active" }],
          execution: { mode: "automatic" },
          ruleModifiers: [{
            id: "curruid-basic-play-upgrade",
            operation: "allow",
            rule: "card_play_upgrade",
            scope: { subject: "controller", cards: { basic: true }, extraMana: 1, addAttributes: ["力量"], powerBonus: 1 },
            lifecycle: { duration: "while_active" },
          }],
        },
        {
          id: "curruid-power",
          kind: "phase_action",
          printedClause: "行动阶段：+3合计威力。",
          activation: { phase: "action", step: "player-window" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.cu-alter-curruid-permanent" },
        },
        {
          id: "curruid-cleanup",
          kind: "passive",
          printedClause: "战斗阶段结束后，将你的所有【噬碎死牙之兽】从游戏中移除。",
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.cu-alter-curruid-permanent" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.cu-alter.skill.sc-cu-alter-3": {
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    handlerId: "core.cu-alter-gae-bolg",
    supportLevel: "FULL",
  },
  "master.chaos.skill.s7": {
    activation: "phase",
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.chaos-sacrifice",
    supportLevel: "FULL",
  },
  "master.chaos.skill.s14": {
    activation: "phase",
    handlerId: "core.chaos-phantom",
    supportLevel: "FULL",
  },
  "servant.robin.skill.sc-robin-3": {
    activation: "phase",
    requiresActiveCard: true,
    hiddenTrueNameCostReduction: 6,
    handlerId: "core.robin-prayer-bow",
    supportLevel: "FULL",
  },
  "master.kiritsugu.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["game.started"],
    handlerId: "core.game-start-replace-deck-card",
    supportLevel: "FULL",
  },
  "master.kiritsugu.skill.s2": {
    activation: "phase",
    steps: ["player-window", "move-decision", "play-batch-draft"],
    handlerId: "core.kiritsugu-time-control",
    supportLevel: "FULL",
  },
  "master.kiritsugu.skill.ascension": {
    activation: "play",
    passiveEventTypes: ["card.played"],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "unlock-origin-bullets",
          printedClause: "解锁此技能后立刻移除你弃牌堆中的2张牌并将2张游戏外的起源弹加入手牌。",
          kind: "play_trigger",
          activation: { phase: "action" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "event_type_is", eventType: "card.played" },
            { type: "event_player_is_controller" },
            { type: "event_definition_is_self" },
            { type: "event_face_is", face: "up" },
          ],
          effects: [
            { type: "remove_selected_cards", zone: "discard", payloadKey: "removedDiscardInstanceIds", count: 2 },
            { type: "create_card_instances", definitionId: "card.card-origin", zone: "hand", count: 2 },
          ],
        },
      ],
    },
  },
  "master.ryuunosuke.skill.s2": {
    activation: "phase",
    steps: ["player-window", "move-decision", "play-batch-draft"],
    handlerId: "core.ryuunosuke-death-art",
    supportLevel: "FULL",
  },
  "servant.davinci.skill.sc-davinci-4": {
    activation: "passive",
    passiveEventTypes: ["player.deployed"],
    locationId: "workshop",
    manaGain: 1,
    handlerId: "core.deploy-workshop-gain-mana",
    supportLevel: "FULL",
  },
  // Batch skills-005: each of these cards has one independently provable
  // combat/resource effect; the remaining multi-clause cards stay PARTIAL.
  "servant.karna.skill.sc-karna-1": {
    activation: "phase",
    handlerId: "core.karna-victory-for-power",
    supportLevel: "FULL",
  },
  "servant.karna.skill.sc-karna-3": {
    activation: "phase",
    windows: ["combat"],
    limit: "once-per-game",
    requiresActiveCard: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.karna-next-round-defeat",
    supportLevel: "FULL",
  },
  "servant.arjuna-archer.skill.sc-arjuna-archer-1": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    handlerId: "core.arjuna-endowed-hero",
    supportLevel: "FULL",
    abilities: [{
      id: "endowed-search",
      name: "天授的英雄",
      activation: "phase",
      windows: ["action"],
      abilityCost: 1,
      requiresActiveCard: false,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "endowed-search",
        kind: "phase_action",
        printedClause: "被动/行动阶段：花费1点魔力，选择牌库或弃牌堆中的一张基础牌加入手牌。你可以额外花费2点魔力将其打出（支付魔力消耗）。",
        activation: { phase: "action" },
        execution: { mode: "handler", handlerId: "core.arjuna-endowed-hero" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.arjuna-archer.skill.sc-arjuna-archer-2": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    passiveEventTypes: ["card.played"],
    handlerId: "core.arjuna-agni-gandiva",
    supportLevel: "FULL",
    abilities: [{
      id: "prophetic-shot",
      name: "预言之射",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "prophetic-shot",
          kind: "phase_action",
          printedClause: "预言之射-行动阶段：弃置0~3张手牌。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.arjuna-agni-gandiva" },
        },
        {
          id: "prophetic-shot-reaction",
          kind: "passive",
          printedClause: "在你使用此效果后，当一名对手打出了印刷威力等于你手牌印刷威力之和的攻击后，你可以弃置所有手牌（至少一张）并令其【败北】。",
          execution: { mode: "handler", handlerId: "core.arjuna-agni-gandiva" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.arjuna-archer.skill.sc-arjuna-archer-3": {
    activation: "phase",
    handlerId: "core.arjuna-judgment",
    supportLevel: "FULL",
  },
  "servant.billy.skill.sc-billy-2": {
    activation: "phase",
    handlerId: "core.billy-luck-double",
    supportLevel: "FULL",
  },
  "servant.orion.skill.sc-orion-3": {
    activation: "phase",
    handlerId: "core.orion-luck-exile",
    supportLevel: "FULL",
  },
  "servant.scathach.skill.sc-scathach-3": {
    activation: "phase",
    handlerId: "core.scathach-mana-gate",
    supportLevel: "FULL",
  },
  "servant.iskandar.skill.sc-iskandar-np": {
    activation: "phase",
    derivedAttackBatch: {
      count: 5,
      definitionIds: [
        "card.derived.temporary-basic.power-2.strength",
        "card.derived.temporary-basic.power-2.agility",
      ],
    },
    handlerId: "core.create-temporary-attacks",
    supportLevel: "FULL",
  },
  "servant.okita.skill.sc-okita-2": {
    activation: "phase",
    derivedAttackBatch: {
      count: 2,
      definitionIds: ["card.derived.temporary-attack.power-4.agility"],
    },
    handlerId: "core.create-temporary-attacks",
    supportLevel: "FULL",
  },
  "servant.tomoe.skill.sc-tomoe-3": {
    activation: "phase",
    opponentCombatPowerBonus: -5,
    opponentRequiresNoDeploymentBonus: true,
    handlerId: "core.same-battlefield-opponent-power",
    supportLevel: "FULL",
  },
  "servant.jeanne.skill.sc-jeanne-3": {
    activation: "phase",
    defeatScope: "all-combat-participants",
    handlerId: "core.defeat-combat-participants",
    supportLevel: "FULL",
  },
  "servant.tesla.skill.sc-tesla-3": {
    activation: "play",
    windows: [],
    passiveEventTypes: ["card.played"],
    abilities: [
      {
        id: "play-shock",
        name: "人类神话·雷电降临",
        activation: "passive",
        windows: [],
        handlerId: "core.structured-skill",
        requiresActiveCard: false,
      },
      {
        id: "combat-shock",
        name: "雷电降临",
        activation: "phase",
        windows: ["combat"],
        handlerId: "core.structured-skill",
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "play-shock",
          printedClause: "打出时：与你位于同一地点的对手获得2点魔力。",
          kind: "play_trigger",
          execution: { mode: "automatic" },
          conditions: [
            { type: "event_type_is", eventType: "card.played" },
            { type: "event_player_is_controller" },
            { type: "event_definition_is_self" },
            { type: "event_face_is", face: "up" },
            { type: "target_count_at_least", scope: "same_location_opponents", count: 1 },
          ],
          effects: [
            {
              type: "gain_mana",
              target: { scope: "same_location_opponents" },
              amount: { type: "constant", value: 2 },
            },
          ],
        },
        {
          id: "combat-shock",
          printedClause: "战斗阶段：与你位于同一地点的对手获得2点魔力，此效果具有强制性。",
          kind: "phase_action",
          activation: { phase: "combat" },
          execution: { mode: "automatic" },
          conditions: [
            { type: "phase_is", phase: "combat" },
            { type: "target_count_at_least", scope: "same_location_opponents", count: 1 },
          ],
          effects: [
            {
              type: "gain_mana",
              target: { scope: "same_location_opponents" },
              amount: { type: "constant", value: 2 },
            },
          ],
        },
      ],
    },
  },
  "master.kiritsugu.skill.s3": {
    activation: "phase",
    closeActiveAndActivateHiddenDefinitionId: "master.kiritsugu.skill.s4",
    handlerId: "core.kiritsugu-fourfold-speed",
    supportLevel: "FULL",
  },
  "master.chaos.skill.s10": {
    activation: "phase",
    doubleDeploymentBonus: true,
    handlerId: "core.double-deployment-bonus",
    supportLevel: "FULL",
  },
  "master.sion.skill.s5": {
    activation: "phase",
    windows: ["combat"],
    combatPowerZeroAttribute: "魔术",
    handlerId: "core.sion-magic-immunity-ex",
    supportLevel: "FULL",
  },
  "master.shirou-emiya.skill.ascension": {
    activation: "play",
    tags: ["ascension", "climax-total-power-plus-4"],
    basicCardPowerBonus: 2,
    basicCardPowerBonusAttributes: ["力量", "迅捷"],
    handlerId: "core.card-play",
    supportLevel: "FULL",
  },
  "master.kirei.skill.s2": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    abilities: [
      {
        id: "overseer-info",
        name: "管理者-所有玩家秘密告诉你从者职阶。 中立",
        activation: "passive",
        windows: [],
        handlerId: "core.structured-skill",
        requiresActiveCard: false,
      },
      {
        id: "neutral-move",
        name: "监督者",
        activation: "phase",
        windows: ["action"],
        abilityCost: 2,
        handlerId: "core.structured-skill",
        requiresActiveCard: false,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "overseer-info",
          printedClause: "管理者-所有玩家秘密告诉你从者职阶。",
          kind: "passive",
          execution: { mode: "automatic" },
          effects: [
            {
              type: "info_note",
              note: "所有玩家秘密告知控制者其从者职阶；该情报不改变公开 GameState。",
            },
          ],
        },
        {
          id: "neutral-move",
          printedClause: "中立-行动阶段：你可以无视交战状态，花费2魔力移动至侦察。",
          kind: "phase_action",
          execution: { mode: "automatic" },
          activation: { phase: "action" },
          conditions: [
            { type: "player_flag_equals", key: "kireiRole", value: "overseer" },
          ],
          effects: [
            {
              type: "move_player",
              target: "controller",
              locationId: "scouting",
              ignoreEngagement: true,
            },
          ],
        },
      ],
    },
  },
  "master.chaos.skill.s15": {
    activation: "phase",
    windows: ["combat"],
    opponentCombatPowerBonus: -3,
    opponentRequiresNoCommandSealThisRound: true,
    handlerId: "core.same-battlefield-opponent-power",
    supportLevel: "FULL",
  },
  "servant.jeanne-alter.skill.sc-jeanne-alter-1": {
    activation: "phase",
    defeatEngagedOpponentsIfMoreActiveAttacks: true,
    handlerId: "core.defeat-engaged-if-more-attacks",
    supportLevel: "FULL",
  },
  "servant.ibaraki.skill.sc-ibaraki-2": {
    activation: "phase",
    maxManaExclusive: 8,
    manaThresholdVictoryPointLoss: { threshold: 8, amount: 1, opponentExtra: 2 },
    handlerId: "core.mana-threshold-vp-loss",
    supportLevel: "FULL",
  },
  "servant.ibaraki.skill.sc-ibaraki-3": {
    activation: "play",
    windows: ["combat"],
    revealsTrueNameOnPlay: true,
    requiresActiveCard: true,
    rashomonGrudge: { powerLossScope: "same-battlefield-opponents" },
    handlerId: "core.ibaraki-rashomon-grudge",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "oni-grapple",
          kind: "play_trigger",
          printedClause: "【真名解放】恶鬼缠身-战斗阶段：将一名于本回合曾与你位于同一战场的对手移动至你所在的战场。",
          execution: { mode: "handler", handlerId: "core.ibaraki-rashomon-grudge" },
          activation: { phase: "combat" },
        },
        {
          id: "random-discard-power-loss",
          kind: "play_trigger",
          printedClause: "若如此做，令其随机弃置一张手牌并记录其基本威力为X，与你位于同一战场的对手失去X点合计威力。",
          execution: { mode: "handler", handlerId: "core.ibaraki-rashomon-grudge" },
          activation: { phase: "combat" },
        },
      ],
    },
  },
  "servant.davinci.skill.sc-davinci-5": {
    activation: "phase",
    requiresActiveCard: false,
    handlerId: "core.reveal-target-true-name-and-exile",
    supportLevel: "FULL",
  },
  "servant.davinci.skill.sc-davinci-6": {
    activation: "phase",
    requiresActiveCard: false,
    abilityCost: 4,
    handlerId: "core.davinci-black-key",
    passiveEventTypes: ["phase.transitioned"],
    supportLevel: "FULL",
  },
  "servant.davinci.skill.sc-davinci-16": {
    activation: "phase",
    requiresActiveCard: false,
    handlerId: "core.block-movement-and-exile",
    supportLevel: "FULL",
  },
  "servant.davinci.skill.sc-davinci-10": {
    activation: "phase",
    requiresActiveCard: false,
    handlerId: "core.zero-target-strength-and-exile",
    supportLevel: "FULL",
  },
  "servant.davinci.skill.sc-davinci-11": {
    activation: "phase",
    requiresActiveCard: false,
    handlerId: "core.imaginary-submarine-and-exile",
    supportLevel: "FULL",
  },
  "servant.davinci.skill.sc-davinci-12": {
    activation: "phase",
    requiresActiveCard: false,
    handlerId: "core.spiritron-transfer-and-exile",
    supportLevel: "FULL",
  },
  "servant.davinci.skill.sc-davinci-13": {
    activation: "phase",
    requiresActiveCard: false,
    handlerId: "core.instant-enhancement",
    supportLevel: "FULL",
  },
  "servant.davinci.skill.sc-davinci-14": {
    activation: "phase",
    requiresActiveCard: false,
    handlerId: "core.emergency-treatment-and-exile",
    supportLevel: "FULL",
  },
  "servant.davinci.skill.sc-davinci-15": {
    activation: "phase",
    requiresActiveCard: false,
    handlerId: "core.davinci-focus",
    passiveEventTypes: ["round.ended"],
    supportLevel: "FULL",
  },
  "servant.davinci.skill.sc-davinci-17": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    tags: ["attached-power-plus-1"],
    handlerId: "core.attach-power-upgrade",
    supportLevel: "FULL",
  },
  "servant.arcueid.skill.sc-arcueid-1": {
    activation: "phase",
    windows: ["combat"],
    pairedPlayOtherCostReduction: 3,
    requiresActiveCard: true,
    handlerId: "core.arcueid-crimson-moon",
    supportLevel: "FULL",
    abilities: [{
      id: "crimson-moon-gather",
      name: "腥红之月",
      activation: "phase",
      windows: ["combat"],
      handlerId: "core.arcueid-crimson-moon",
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "crimson-moon-paired-cost",
          kind: "play_trigger",
          printedClause: "与腥红之月一同打出的另一张牌的魔力消耗-3。",
          execution: { mode: "handler", handlerId: "core.arcueid-crimson-moon" },
        },
        {
          id: "crimson-moon-gather",
          kind: "phase_action",
          printedClause: "战斗阶段：所有未与其他人进行交战的对手失去1点战果，然后移动至你所在的战场。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }, { type: "at_battlefield" }],
          execution: { mode: "handler", handlerId: "core.arcueid-crimson-moon" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.arcueid.skill.sc-arcueid-2": {
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    handlerId: "core.arcueid-millennium-castle",
    supportLevel: "FULL",
    abilities: [{
      id: "millennium-castle-exile",
      name: "千年城",
      activation: "phase",
      windows: ["combat"],
      handlerId: "core.arcueid-millennium-castle",
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "millennium-castle-exile",
        kind: "phase_action",
        printedClause: "战斗阶段：与你进行交战的对手失去3点魔力，然后将你从版图移除。你不可再打出此牌，直到你赢得一场胜利。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }, { type: "at_battlefield" }],
        execution: { mode: "handler", handlerId: "core.arcueid-millennium-castle" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.arcueid.skill.sc-arcueid-3": {
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    handlerId: "core.arcueid-marble-phantasm",
    supportLevel: "FULL",
  },
  "servant.raikou.skill.sc-raikou-1": {
    activation: "phase",
    windows: ["outpost"],
    requiresActiveCard: false,
    revealsTrueNameOnSkillUse: true,
    limit: "twice-per-game",
    handlerId: "core.raikou-ox-king",
    supportLevel: "FULL",
  },
  "servant.raikou.skill.sc-raikou-2": {
    activation: "play",
    situationForbiddenAttributeCostReduction: { attribute: "宝具", amount: 6 },
    otherPlayersIgnoreSituationEffects: true,
    handlerId: "core.card-play",
    supportLevel: "FULL",
  },
  "servant.raikou.skill.sc-raikou-3": {
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.raikou-mystery-killer",
    supportLevel: "FULL",
  },
  "servant.illya.skill.sc-illya-7": {
    activation: "phase",
    uniqueGroup: "illya-dream-summon",
    handlerId: "core.move-to-non-workshop",
    supportLevel: "FULL",
  },
  "servant.illya.skill.sc-illya-4": {
    activation: "phase",
    uniqueGroup: "illya-dream-summon",
    combatPowerZeroAttribute: "魔术",
    handlerId: "core.zero-opponent-attribute",
    supportLevel: "FULL",
  },
  "servant.illya.skill.sc-illya-5": {
    activation: "play",
    uniqueGroup: "illya-dream-summon",
    tags: ["dream-summon-berserker"],
    handlerId: "core.card-play",
    supportLevel: "FULL",
  },
  "servant.illya.skill.sc-illya-6": {
    activation: "phase",
    uniqueGroup: "illya-dream-summon",
    handlerId: "core.illya-dream-archer",
    passiveEventTypes: ["combat.resolved"],
    supportLevel: "FULL",
  },
  "servant.illya.skill.sc-illya-8": {
    activation: "phase",
    uniqueGroup: "illya-dream-summon",
    handlerId: "core.illya-dream-assassin",
    passiveEventTypes: ["card.played", "skill.used", "combat.resolved"],
    supportLevel: "FULL",
  },
  "servant.illya.skill.sc-illya-9": {
    activation: "play",
    uniqueGroup: "illya-dream-summon",
    standardAppend: true,
    handlerId: "core.card-play",
    supportLevel: "FULL",
  },
};

const twelveLaborsSkillIds = [
  "servant.herc.skill.sc-herc-1",
  "servant.herc.skill.sc-herc-2",
  "servant.herc.skill.sc-herc-3",
] as const;

for (const skillId of twelveLaborsSkillIds) {
  overrides[skillId] = {
    ...overrides[skillId],
    handlerId: "core.twelve-labors",
    supportLevel: "FULL",
    passiveEventTypes: ["combat.resolved"],
  };
}

const saberMagicResistanceIds = [
  "servant.saber.skill.sc-saber-1",
  "servant.mordred.skill.sc-mordred-3",
  "servant.altera.skill.sc-altera-3",
  "servant.gawain.skill.sc-gawain-3",
  "servant.bedivere.skill.sc-bedivere-1",
  "servant.musashi.skill.sc-musashi-3",
  "servant.artoria-alt.skill.sc-artoria-alt-3",
  "servant.charlemagne.skill.sc-charlemagne-3",
  "servant.arthur.skill.sc-arthur-3",
  "servant.saitou.skill.sc-saitou-1",
  "servant.lakshmibai.skill.sc-lakshmibai-3",
  "servant.mhx.skill.sc-mhx-3",
] as const;

const saberMagicResistanceAbilities: SkillAbilityDefinition[] = [
  {
    id: "noble-bloom",
    name: "宝具绽放",
    activation: "optional-trigger",
    windows: ["combat"],
    limit: "once-per-round",
    handlerId: "core.saber-magic-resistance",
    requiresActiveCard: false,
  },
  {
    id: "magic-resistance",
    name: "梦幻召唤-骑兵",
    activation: "phase",
    windows: ["combat"],
    limit: "once-per-round",
    handlerId: "core.saber-magic-resistance",
    requiresActiveCard: true,
  },
];

for (const skillId of saberMagicResistanceIds) {
  overrides[skillId] = {
    ...overrides[skillId],
    abilities: saberMagicResistanceAbilities,
    handlerId: "core.saber-magic-resistance",
    supportLevel: "FULL",
    requiresActiveCard: true,
  };
}

for (const skillId of battleContinuationSkillIds) {
  overrides[skillId] = {
    ...overrides[skillId],
    handlerId: BATTLE_CONTINUATION_HANDLER,
    supportLevel: "FULL",
  };
}

for (const skillId of pretenderClassSkillIds) {
  overrides[skillId] = {
    ...overrides[skillId],
    activation: "passive",
    passiveEventTypes: ["servant.true-name-revealed"],
    basePower: 0,
    handlerId: "core.pretender-class",
    supportLevel: "FULL",
  };
}

for (const skillId of outerGodLifeSkillIds) {
  overrides[skillId] = {
    ...overrides[skillId],
    activation: "phase",
    windows: ["combat"],
    passiveEventTypes: ["combat.resolved"],
    requiresActiveCard: true,
    handlerId: "core.outer-god-life",
    supportLevel: "FULL",
  };
}

for (const skillId of independentActionSkillIds) {
  overrides[skillId] = {
    ...overrides[skillId],
    handlerId: "core.independent-action",
    supportLevel: "FULL",
  };
}

for (const skillId of territoryCreationSkillIds) {
  overrides[skillId] = {
    ...overrides[skillId],
    activation: "residual",
    costRule: { kind: "round-linear", base: 16, perRound: -2, min: 0 },
    handlerId: "core.territory-creation",
    supportLevel: "FULL",
  };
}

for (const skillId of presenceConcealmentSkillIds) {
  overrides[skillId] = {
    ...overrides[skillId],
    activation: "phase",
    steps: ["post-power-response"],
    limit: "once-per-round",
    handlerId: "core.presence-concealment",
    supportLevel: "FULL",
  };
}

for (const skillId of ridingSkillIds) {
  overrides[skillId] = {
    ...overrides[skillId],
    activation: "phase",
    limit: "once-per-round",
    playDrawIfWithBasicAttack: 1,
    appendFromHand: { maxCount: 3, maxBasePower: 3 },
    handlerId: "core.riding",
    supportLevel: "FULL",
  };
}

for (const skillId of alterEgoSkillIds) {
  overrides[skillId] = {
    ...overrides[skillId],
    activation: "residual",
    abilities: [{
      id: "alter-ego-transform",
      name: "梦幻召唤-骑兵",
      activation: "optional-trigger",
      windows: ["action"],
      handlerId: "core.alter-ego-transform",
      requiresActiveCard: true,
    }],
    requiresActiveCard: true,
    handlerId: "core.alter-ego-transform",
    supportLevel: "FULL",
  };
}

for (const skillId of explicitEightManaExceptionSkillIds) {
  overrides[skillId] = {
    ...overrides[skillId],
    requiresEightMana: false,
  };
}

for (const [id, definition] of Object.entries(structuredMasterBatchOverrides)) {
  overrides[id] = { ...overrides[id], ...definition };
}
for (const [id, definition] of Object.entries(structuredServantBatchOverrides)) {
  overrides[id] = { ...overrides[id], ...definition };
}
for (const batch of [structuredBatch002Overrides, structuredBatch003Overrides, structuredBatch004Overrides, structuredBatch005Overrides, structuredBatch006Overrides, structuredBatch007Overrides, structuredBatch008Overrides, structuredBatch009Overrides, structuredBatch010Overrides, structuredBatch011Overrides, structuredBatch012Overrides, structuredBatch013Overrides, structuredBatch014Overrides, structuredBatch015Overrides, structuredBatch016Overrides, structuredBatch017Overrides, structuredBatch018Overrides]) {
  for (const [id, definition] of Object.entries(batch)) {
    overrides[id] = { ...overrides[id], ...definition };
  }
}

// Post-batch authoritative patches: these must run after the generated structured
// batches so reviewed English/original rulings cannot be overwritten by older PARTIAL data.
for (const skillId of presenceConcealmentSkillIds) {
  overrides[skillId] = {
    ...overrides[skillId],
    tags: [...new Set([...(overrides[skillId]?.tags ?? []), "assassin-class"])],
  };
}

overrides["servant.jekyll.skill.sc-jekyll-1"] = {
  ...overrides["servant.jekyll.skill.sc-jekyll-1"],
  activation: "passive",
  passiveEventTypes: ["game.started", "round.started"],
  handlerId: "core.jekyll-dangerous-game",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "dangerous-game-form",
      kind: "passive",
      printedClause: "Passive: Dr. Jekyll becomes Mr. Hyde in odd-numbered rounds. This card's effects cannot be lost. Jekyll cannot use Berserker Class and pays 1 less mana per space when moving; Hyde cannot use Assassin Class.",
      execution: { mode: "handler", handlerId: "core.jekyll-dangerous-game" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.jekyll.skill.sc-jekyll-2"] = {
  ...overrides["servant.jekyll.skill.sc-jekyll-2"],
  activation: "passive",
  passiveEventTypes: ["combat.resolved"],
  revealsTrueNameOnPlay: false,
  optionalFreePlay: { waiveEightMana: true, revealTrueName: true, nextRoundCombatPowerOverride: 0, requireSourcePresent: true },
  playerDefeatIgnoreCondition: { playerFlagEquals: { key: "jekyllForm", value: "hyde" } },
  handlerId: "core.jekyll-lycanthropy",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "lycanthropy-class-power",
      kind: "residual",
      printedClause: "Lycanthropy: Jekyll & Hyde's non-basic attacks have +3 power.",
      conditions: [{ type: "source_active" }],
      ruleModifiers: [{
        id: "lycanthropy-class-power",
        operation: "add",
        rule: "card_power",
        scope: { subject: "controller", cards: { tagsAny: ["assassin-class", "berserker-attack"] } },
        value: 3,
        lifecycle: { duration: "while_active" },
      }],
      execution: { mode: "automatic" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.bedivere.skill.sc-bedivere-2"] = {
  ...overrides["servant.bedivere.skill.sc-bedivere-2"],
  activation: "phase",
  windows: ["outpost"],
  requiresActiveCard: false,
  handlerId: "core.bedivere-oath-of-protection",
  supportLevel: "FULL",
  abilities: [{
    id: "oath-protection",
    name: "守护的誓约",
    activation: "phase",
    windows: ["outpost"],
    handlerId: "core.bedivere-oath-of-protection",
    requiresActiveCard: false,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "oath-protection",
      kind: "phase_action",
      printedClause: "被动/前哨阶段：弃置一张手牌，若如此做，你获得+2合计威力且你控制的攻击，你的技能区、手牌、牌库和你战场的事件牌不会被其他玩家的能力所影响直至回合结束。",
      activation: { phase: "outpost" },
      execution: { mode: "automatic", handlerId: "core.bedivere-oath-of-protection" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.bedivere.skill.sc-bedivere-3"] = {
  ...overrides["servant.bedivere.skill.sc-bedivere-3"],
  activation: "phase",
  windows: ["action"],
  passiveEventTypes: ["player.deck-shuffled"],
  requiresActiveCard: false,
  revealsTrueNameOnSkillUse: true,
  handlerId: "core.bedivere-silver-arm",
  supportLevel: "FULL",
  abilities: [{
    id: "grip-the-sword",
    name: "紧握其剑",
    activation: "phase",
    windows: ["action"],
    handlerId: "core.bedivere-silver-arm",
    requiresActiveCard: false,
    revealsTrueNameOnSkillUse: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "fleeting",
        kind: "passive",
        printedClause: "一闪即逝-被动：每当你的弃牌堆被洗回牌堆时，本局游戏你的合计威力便-1。",
        conditions: [{ type: "event_type_is", eventType: "player.deck-shuffled" }, { type: "source_owned" }],
        execution: { mode: "automatic", handlerId: "core.bedivere-silver-arm" },
      },
      {
        id: "grip-the-sword",
        kind: "phase_action",
        printedClause: "紧握其剑-被动/行动阶段：将你剩余的牌堆从游戏中移除（至少2张牌），然后将此牌加入你的攻击。",
        activation: { phase: "action" },
        execution: { mode: "automatic", handlerId: "core.bedivere-silver-arm" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.brynhildr.skill.sc-brynhildr-2"] = {
  ...overrides["servant.brynhildr.skill.sc-brynhildr-2"],
  activation: "phase",
  windows: ["outpost"],
  passiveEventTypes: ["combat.ending"],
  requiresActiveCard: false,
  handlerId: "core.brynhildr-hero-bridesmaid",
  supportLevel: "FULL",
  abilities: [{
    id: "choose-beloved",
    name: "英雄的伴娘",
    activation: "phase",
    windows: ["outpost"],
    handlerId: "core.brynhildr-hero-bridesmaid",
    requiresActiveCard: false,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "choose-beloved",
        kind: "phase_action",
        printedClause: "自我催眠-被动/前哨阶段：若布伦希尔德处于【爱意】状态，消耗一枚令咒使用。",
        activation: { phase: "outpost" },
        execution: { mode: "automatic", handlerId: "core.brynhildr-hero-bridesmaid" },
      },
      {
        id: "beloved-victory-reward",
        kind: "passive",
        printedClause: "当【爱人】赢得战斗时，你获得1点战果，若你与其同时赢得战斗，则你获得3点战果。",
        conditions: [{ type: "event_type_is", eventType: "combat.ending" }, { type: "source_owned" }],
        execution: { mode: "automatic", handlerId: "core.brynhildr-hero-bridesmaid" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.brynhildr.skill.sc-brynhildr-3"] = {
  ...overrides["servant.brynhildr.skill.sc-brynhildr-3"],
  activation: "play",
  windows: ["action"],
  revealsTrueNameOnPlay: true,
  linkedPlayerSameBattlefieldAttributeTransform: {
    playerFlag: "brynhildrBelovedPlayerId",
    removeAttributes: ["迅捷"],
    addAttributes: ["力量"],
  },
  handlerId: "core.card-play",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "beloved-romantia",
      kind: "passive",
      printedClause: "被动：当你与【爱人】位于同一战场时，直到回合结束此牌失去迅捷属性然后得到力量属性，基础威力和魔力消耗翻倍。",
      conditions: [
        { type: "source_owned" },
        { type: "linked_player_flag_same_battlefield", key: "brynhildrBelovedPlayerId" },
      ],
      ruleModifiers: [
        {
          id: "beloved-double-cost",
          operation: "multiply",
          rule: "card_cost",
          scope: { subject: "controller", cards: { definitionIds: ["servant.brynhildr.skill.sc-brynhildr-3"] } },
          value: 2,
          lifecycle: { duration: "permanent" },
        },
        {
          id: "beloved-double-base-power",
          operation: "multiply",
          rule: "card_base_power",
          scope: { subject: "controller", cards: { definitionIds: ["servant.brynhildr.skill.sc-brynhildr-3"] } },
          value: 2,
          lifecycle: { duration: "permanent" },
        },
      ],
      execution: { mode: "automatic" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.arjuna.skill.sc-arjuna-2"] = {
  ...overrides["servant.arjuna.skill.sc-arjuna-2"],
  activation: "phase",
  windows: ["action"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  revealsTrueNameOnSkillUse: true,
  limit: "once-per-game",
  handlerId: "core.god-arjuna-world-reset",
  supportLevel: "FULL",
  abilities: [{
    id: "world-reset",
    name: "世界重启",
    activation: "phase",
    windows: ["action"],
    limit: "once-per-game",
    handlerId: "core.god-arjuna-world-reset",
    requiresActiveCard: true,
    revealsTrueNameOnSkillUse: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "world-reset",
      kind: "phase_action",
      printedClause: "【真名解放】<每局游戏限一次>世界重启-行动阶段：下一个准备阶段抽取局势牌前，将一张本回合的事件牌增加至深山町或新都，并令一张【至高神】或至多一张【裁定归灭之回剑】返回你的技能区。",
      activation: { phase: "action" },
      execution: { mode: "automatic", handlerId: "core.god-arjuna-world-reset" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.arjuna.skill.sc-arjuna-3"] = {
  ...overrides["servant.arjuna.skill.sc-arjuna-3"],
  activation: "phase",
  windows: ["action"],
  passiveEventTypes: ["phase.transitioned"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  revealsTrueNameOnSkillUse: true,
  limit: "once-per-game",
  handlerId: "core.god-arjuna-imperfection-is-sin",
  supportLevel: "FULL",
  abilities: [{
    id: "imperfection-is-sin",
    name: "裁定归灭之回剑",
    activation: "phase",
    windows: ["action"],
    limit: "once-per-game",
    handlerId: "core.god-arjuna-imperfection-is-sin",
    requiresActiveCard: true,
    revealsTrueNameOnSkillUse: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "imperfection-is-sin",
        kind: "phase_action",
        printedClause: "【真名解放】<每局游戏一次>在战斗阶段开始时，令所有与你战斗的【有瑕】玩家【直接败北】。",
        activation: { phase: "action" },
        execution: { mode: "automatic", handlerId: "core.god-arjuna-imperfection-is-sin" },
      },
      {
        id: "flawed-luck-penalty",
        kind: "passive",
        printedClause: "每有一名控制【幸运】的【有瑕】对手，此攻击失去5点威力。",
        conditions: [{ type: "event_type_is", eventType: "phase.transitioned" }, { type: "source_owned" }],
        execution: { mode: "automatic", handlerId: "core.god-arjuna-imperfection-is-sin" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.teach.skill.sc-teach-1"] = {
  ...overrides["servant.teach.skill.sc-teach-1"],
  activation: "passive",
  passiveEventTypes: ["game.started", "combat.resolved"],
  handlerId: "core.teach-gentleman-love",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "gentlemanly-love",
      kind: "passive",
      printedClause: "被动：当你赢得一场争夺战时，你不获得竞争战果，而是选择一名该场战斗的败者并抽取其牌库顶的三张牌，然后将其中一张移除并将剩余的牌以任意顺序放回其牌堆顶。你获得X点战果，X为因此效果被移除的卡的印刷基本威力且至多为5。",
      conditions: [{ type: "source_owned" }],
      execution: { mode: "automatic", handlerId: "core.teach-gentleman-love" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.teach.skill.sc-teach-2"] = {
  ...overrides["servant.teach.skill.sc-teach-2"],
  activation: "phase",
  windows: ["action"],
  passiveEventTypes: ["combat.ending"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  revealsTrueNameOnSkillUse: true,
  handlerId: "core.teach-queen-anne",
  supportLevel: "FULL",
  abilities: [{
    id: "queen-anne-revenge",
    name: "安妮女王之复仇",
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    revealsTrueNameOnSkillUse: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "queen-anne-revenge",
        kind: "phase_action",
        printedClause: "行动阶段：打出一张你以【绅士之爱】移除的牌（若该牌魔力消耗低于2，将其增加至2）。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.teach-queen-anne" },
      },
      {
        id: "queen-anne-self-exile",
        kind: "passive",
        printedClause: "并于战斗阶段结束后将此牌移除游戏。",
        conditions: [{ type: "event_type_is", eventType: "combat.ending" }, { type: "source_owned" }],
        execution: { mode: "automatic", handlerId: "core.teach-queen-anne" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.izou.skill.sc-izou-1"] = {
  ...overrides["servant.izou.skill.sc-izou-1"],
  activation: "phase",
  windows: ["combat"],
  passiveEventTypes: ["combat.resolved", "card.played"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  revealsTrueNameOnSkillUse: true,
  handlerId: "core.izou-shimatsuken",
  supportLevel: "FULL",
  abilities: [{
    id: "shimatsuken-record",
    name: "了结剑",
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnSkillUse: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "shimatsuken-record",
        kind: "phase_action",
        printedClause: "战斗阶段：选择一张你战斗中的敏捷攻击并记录其于战力结算时的威力为X。【了结剑】下次被打出时+X威力。你无法连续选择同一牌名的攻击（基础攻击视为同一牌名）。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.izou-shimatsuken" },
      },
      {
        id: "shimatsuken-measure-and-carry",
        kind: "passive",
        printedClause: "【真名解放】\n战斗阶段：选择一张你战斗中的敏捷攻击并记录其于战力结算时的威力为X。【了结剑】下次被打出时+X威力。你无法连续选择同一牌名的攻击（基础攻击视为同一牌名）。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "automatic", handlerId: "core.izou-shimatsuken" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.izou.skill.sc-izou-2"] = {
  ...overrides["servant.izou.skill.sc-izou-2"],
  activation: "passive",
  passiveEventTypes: ["player.moved", "player.defeat-applied"],
  requiresActiveCard: false,
  handlerId: "core.izou-man-slayer",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "are-you-mocking-me",
        kind: "passive",
        printedClause: "击剑斩捷如鹰隼-被动：当一名对手离开你所在的战场时，你可以打出一张攻击。否则，你可令其【败北】。",
        conditions: [{ type: "source_owned" }, { type: "event_type_is", eventType: "player.moved" }],
        execution: { mode: "automatic", handlerId: "core.izou-man-slayer" },
      },
      {
        id: "vicious-backstab",
        kind: "passive",
        printedClause: "刽子手-被动：当你令一名玩家【败北】时，他失去3点战果（即使其无视【败北】效果）。",
        conditions: [{ type: "source_owned" }, { type: "event_type_is", eventType: "player.defeat-applied" }],
        execution: { mode: "automatic", handlerId: "core.izou-man-slayer" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.sitonai.skill.sc-sitonai-1"] = {
  ...overrides["servant.sitonai.skill.sc-sitonai-1"],
  activation: "phase",
  windows: ["action"],
  passiveEventTypes: ["combat.resolved"],
  requiresActiveCard: false,
  hasReversalEffect: true,
  handlerId: "core.sitonai-combination-attack",
  supportLevel: "FULL",
  abilities: [{
    id: "combination-join",
    name: "连携打击",
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "combination-join",
        kind: "phase_action",
        printedClause: "Passive/Action: If you control exactly one Strength and one Magic attack, pay 3 mana to add this card to your attack.",
        activation: { phase: "action" },
        execution: { mode: "handler", handlerId: "core.sitonai-combination-attack" },
      },
      {
        id: "combination-alter-win",
        kind: "passive",
        printedClause: "Alter: If you win the fight, gain 4 VP.",
        conditions: [{ type: "event_type_is", eventType: "combat.resolved" }, { type: "source_reversed" }],
        execution: { mode: "automatic", handlerId: "core.sitonai-combination-attack" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.sitonai.skill.sc-sitonai-2"] = {
  ...overrides["servant.sitonai.skill.sc-sitonai-2"],
  activation: "phase",
  windows: ["action"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  hasReversalEffect: true,
  handlerId: "core.sitonai-pohjola-fimbul",
  supportLevel: "FULL",
  abilities: [{
    id: "freeze-forces",
    name: "冻结吧，天上的诸力",
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "freeze-forces",
      kind: "phase_action",
      printedClause: "Action: Until the end of the next round players cannot draw cards. Alter: or gain mana.",
      activation: { phase: "action" },
      conditions: [{ type: "source_active" }],
      execution: { mode: "handler", handlerId: "core.sitonai-pohjola-fimbul" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.ozymandias.skill.sc-ozymandias-1"] = {
  ...overrides["servant.ozymandias.skill.sc-ozymandias-1"],
  activation: "phase",
  windows: ["action"],
  requiresActiveCard: false,
  handlerId: "core.ozymandias-ramesseum",
  supportLevel: "FULL",
  abilities: [{
    id: "ramesseum-attach",
    name: "光辉大复合神殿",
    activation: "phase",
    windows: ["action"],
    abilityCost: 4,
    requiresActiveCard: false,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "ramesseum-attach",
      kind: "phase_action",
      printedClause: "Passive/Action: Pay 4 mana. Attach this card to your location. If it is a battlefield, opponents cannot move to or from here while you are there; their Noble Phantasms and Specials here cost +3 mana, max 12.",
      activation: { phase: "action" },
      execution: { mode: "handler", handlerId: "core.ozymandias-ramesseum" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.ozymandias.skill.sc-ozymandias-3"] = {
  ...overrides["servant.ozymandias.skill.sc-ozymandias-3"],
  activation: "passive",
  windows: [],
  requiresActiveCard: false,
  revealsTrueNameOnPlay: true,
  standardAppend: true,
  passiveEventTypes: ["card.played", "combat.ending"],
  handlerId: "core.ozymandias-dendera",
  supportLevel: "FULL",
  abilities: [],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "dendera-play-check",
        kind: "play_trigger",
        printedClause: "Long Range Artillery: Deactivate this card if you do not control Ramesseum Tentyris at another location.",
        conditions: [{ type: "event_type_is", eventType: "card.played" }],
        execution: { mode: "automatic", handlerId: "core.ozymandias-dendera" },
      },
      {
        id: "dendera-return-ramesseum",
        kind: "passive",
        printedClause: "Return Ramesseum Tentyris to your skills after combat.",
        conditions: [{ type: "event_type_is", eventType: "combat.ending" }],
        execution: { mode: "automatic", handlerId: "core.ozymandias-dendera" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["master.tokiomi.skill.s2"] = {
  ...overrides["master.tokiomi.skill.s2"],
  activation: "passive",
  passiveEventTypes: ["game.started"],
  addSkillDefinitionIds: [
    "card.derived.master.tokiomi.item.azoth-blade",
    "card.derived.master.tokiomi.item.grimoir",
    "card.derived.master.tokiomi.item.magic-meter",
    "card.derived.master.tokiomi.item.mana-reserve",
  ],
  handlerId: "core.game-start-add-skill",
  supportLevel: "FULL",
};
overrides["master.tokiomi.skill.ascension"] = {
  ...overrides["master.tokiomi.skill.ascension"],
  activation: "passive",
  initiallyOwned: false,
  tags: ["ascension"],
  handlerId: "core.rule-marker",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "advanced-pyromancy",
      kind: "passive",
      printedClause: "【火炎弹】+2魔力消耗与威力。\n【燃烧】印记更改为-3合计威力且移除时需额外花费2点魔力。",
      conditions: [{ type: "source_owned" }],
      ruleModifiers: [
        {
          id: "advanced-pyromancy-fireball-cost",
          operation: "add",
          rule: "card_cost",
          scope: { subject: "controller", cards: { definitionIds: ["card.derived.master.tokiomi.fireball"] } },
          value: 2,
          lifecycle: { duration: "permanent" },
        },
        {
          id: "advanced-pyromancy-fireball-power",
          operation: "add",
          rule: "card_power",
          scope: { subject: "controller", cards: { definitionIds: ["card.derived.master.tokiomi.fireball"] } },
          value: 2,
          lifecycle: { duration: "permanent" },
        },
      ],
      execution: { mode: "automatic" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.danzou.skill.sc-danzou-1"] = {
  ...overrides["servant.danzou.skill.sc-danzou-1"],
  activation: "phase",
  windows: ["action", "combat"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  handlerId: "core.danzou-mechanical-illusion",
  supportLevel: "FULL",
  abilities: [
    {
      id: "vacuum-blade-discard",
      name: "真空刀刃",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
    },
    {
      id: "vacuum-blade-defeat",
      name: "真空刀刃",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
    },
  ],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "vacuum-blade-discard",
        kind: "phase_action",
        printedClause: "真空刀刃-行动阶段：展示并弃置至多5张你的手牌。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.danzou-mechanical-illusion" },
      },
      {
        id: "vacuum-blade-defeat",
        kind: "phase_action",
        printedClause: "战斗阶段：令一名未控制威力高于你以真空刀刃弃置的牌的基本威力之和的攻击的交战玩家【败北】。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }, { type: "used_ability_this_round", abilityId: "vacuum-blade-discard" }],
        execution: { mode: "handler", handlerId: "core.danzou-mechanical-illusion" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.danzou.skill.sc-danzou-2"] = {
  ...overrides["servant.danzou.skill.sc-danzou-2"],
  activation: "phase",
  windows: ["action", "combat"],
  requiresActiveCard: false,
  revealsTrueNameOnSkillUse: false,
  passiveEventTypes: ["combat.resolved"],
  handlerId: "core.danzou-synthetic-limbs",
  supportLevel: "FULL",
  abilities: [
    {
      id: "overclock",
      name: "超频",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: false,
      revealsTrueNameOnSkillUse: true,
    },
    {
      id: "tactical-reconstruction",
      name: "战术重构",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
      revealsTrueNameOnSkillUse: false,
    },
  ],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "overclock",
        kind: "phase_action",
        printedClause: "超频-被动/行动阶段：【真名解放】。若你原本真名隐藏，你可以追加打出任意张加藤段藏的技能牌（你拥有的魔力少于8点也可打出）。",
        activation: { phase: "action" },
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.danzou-synthetic-limbs" },
      },
      {
        id: "tactical-reconstruction",
        kind: "phase_action",
        printedClause: "战术重构-战斗阶段：若你获胜，隐藏真名并抽4张牌。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.danzou-synthetic-limbs" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
for (const rulerSkillId of ["servant.jeanne.skill.sc-jeanne-1", "servant.amakusa.skill.sc-amakusa-3", "servant.morgan.skill.sc-morgan-3", "servant.amor.skill.sc-amor-1"]) {
  overrides[rulerSkillId] = {
    ...overrides[rulerSkillId],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    revealsTrueNameOnSkillUse: false,
    passiveEventTypes: ["combat.resolved", "round.ending"],
    handlerId: "core.ruler-class",
    supportLevel: "FULL",
    tags: [...new Set([...(overrides[rulerSkillId]?.tags ?? []), "cannot-copy", "cannot-steal"])],
    abilities: [
      {
        id: "divine-judgment",
        name: "神明裁决",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: false,
        revealsTrueNameOnSkillUse: false,
      },
      {
        id: "ruler-seal-command",
        name: "连携爆弹",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: false,
        revealsTrueNameOnSkillUse: false,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "ruler-copy-protection",
          kind: "passive",
          printedClause: "超频-被动/行动阶段：【真名解放】。若你原本真名隐藏，你可以追加打出任意张加藤段藏的技能牌（你拥有的魔力少于8点也可打出）。\n战术重构-战斗阶段：若你获胜，隐藏真名并抽4张牌。",
          conditions: [{ type: "source_owned" }],
          execution: { mode: "automatic" },
        },
        {
          id: "divine-judgment",
          kind: "phase_action",
          printedClause: "超频-被动/行动阶段：【真名解放】。若你原本真名隐藏，你可以追加打出任意张加藤段藏的技能牌（你拥有的魔力少于8点也可打出）。\n战术重构-战斗阶段：若你获胜，隐藏真名并抽4张牌。",
          activation: { phase: "action" },
          conditions: [{ type: "source_owned" }],
          execution: { mode: "handler", handlerId: "core.ruler-class" },
        },
        {
          id: "ruler-seal-command",
          kind: "phase_action",
          printedClause: "超频-被动/行动阶段：【真名解放】。若你原本真名隐藏，你可以追加打出任意张加藤段藏的技能牌（你拥有的魔力少于8点也可打出）。\n战术重构-战斗阶段：若你获胜，隐藏真名并抽4张牌。",
          activation: { phase: "action" },
          conditions: [{ type: "source_owned" }],
          execution: { mode: "handler", handlerId: "core.ruler-class" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  };
}
overrides["servant.amakusa.skill.sc-amakusa-2"] = {
  ...overrides["servant.amakusa.skill.sc-amakusa-2"],
  activation: "phase",
  windows: ["combat"],
  requiresActiveCard: false,
  revealsTrueNameOnSkillUse: false,
  passiveEventTypes: ["combat.ending"],
  handlerId: "core.amakusa-magician",
  supportLevel: "FULL",
  abilities: [
    {
      id: "magician-borrow",
      name: "奇术师",
      activation: "phase",
      windows: ["combat"],
      abilityCost: 3,
      limit: "twice-per-round",
      requiresActiveCard: false,
      revealsTrueNameOnSkillUse: false,
    },
  ],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "magician-borrow",
        kind: "phase_action",
        printedClause: "战斗阶段：花费3点魔力，抽取一位对手牌堆顶的一张牌并将之加入你的攻击。【奇术师】获得该牌的属性，且你可以使用该牌的【行动阶段】能力，战斗后将那张牌返回原主的弃牌堆。每回合你可使用两次此能力。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.amakusa-magician" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.jeanne.skill.sc-jeanne-2"] = {
  ...overrides["servant.jeanne.skill.sc-jeanne-2"],
  activation: "play",
  windows: ["action", "combat"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  revealsTrueNameOnSkillUse: false,
  handlerId: "core.structured-skill",
  supportLevel: "FULL",
  abilities: [
    {
      id: "lord-draw-all",
      name: "吾主在此·启示",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
      revealsTrueNameOnSkillUse: false,
    },
  ],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "lord-luck-field",
        kind: "passive",
        printedClause: "【真名解放】被动/战斗阶段：场上每有一张正面表示的【幸运】牌，便获得合计威力+2。行动阶段：所有玩家抽一张牌。所有【幸运】牌获得：“被动/战斗阶段：打出此牌。”",
        conditions: [
          { type: "source_active" },
          { type: "phase_is", phase: "combat" },
        ],
        ruleModifiers: [
          {
            id: "face-up-luck-total-power",
            operation: "add",
            rule: "combat_power",
            scope: { subject: "controller" },
            value: {
              type: "formula",
              op: "multiply",
              args: [
                { type: "constant", value: 2 },
                { type: "metric", metric: "face_up_definition_count", source: "all_players", key: "card.cardluck" },
              ],
            },
            lifecycle: { duration: "while_active" },
          },
        ],
        transforms: [
          {
            id: "grant-luck-combat-play",
            printedClause: "所有【幸运】牌获得：“被动/战斗阶段：打出此牌。",
            type: "card",
            target: { subject: "all_players", cards: { definitionIds: ["card.cardluck"] } },
            grantAbilities: [
              {
                id: "lord-luck-combat-play",
                name: "打出此牌",
                activation: { phase: "combat", step: "player-window" },
                handlerId: "core.play-card-from-hand-in-combat",
                allowedZones: ["hand"],
                allowInactive: true,
              },
            ],
            lifecycle: { duration: "while_active" },
          },
        ],
        lifecycle: { duration: "while_active" },
        execution: { mode: "automatic" },
      },
      {
        id: "lord-draw-all",
        kind: "phase_action",
        printedClause: "行动阶段：所有玩家抽一张牌。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        effects: [{ type: "draw_cards", target: "all_players", amount: 1 }],
        execution: { mode: "automatic" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.cu-alter.skill.sc-cu-alter-1"] = {
  ...overrides["servant.cu-alter.skill.sc-cu-alter-1"],
  activation: "passive",
  windows: ["combat"],
  requiresActiveCard: false,
  passiveEventTypes: ["combat.ending"],
  handlerId: "core.cu-alter-curruid-passive",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "protection-from-arrows",
        kind: "passive",
        printedClause: "避矢之加护-被动：当一名对手即将令你【败北】时，他需花费3点魔力。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "automatic" },
        ruleModifiers: [{
          id: "opponent-defeat-cost-three",
          operation: "add",
          rule: "defeat_cost",
          scope: { subject: "controller" },
          value: 3,
          lifecycle: { duration: "permanent" },
        }],
      },
      {
        id: "curruid-combat-attrition",
        kind: "passive",
        printedClause: "被动：与你交战的对手在战斗阶段结束后失去X点战果，X为其控制的激活攻击数-1且最大为3。",
        execution: { mode: "handler", handlerId: "core.cu-alter-curruid-passive" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.cu-alter.skill.sc-cu-alter-2"] = {
  ...overrides["servant.cu-alter.skill.sc-cu-alter-2"],
  activation: "phase",
  windows: ["action"],
  requiresActiveCard: true,
  cardResidual: true,
  passiveEventTypes: ["combat.ending"],
  handlerId: "core.cu-alter-curruid-permanent",
  supportLevel: "FULL",
  abilities: [{
    id: "curruid-power",
    name: "噬碎死牙·力量",
    activation: "phase",
    windows: ["action"],
    steps: ["player-window"],
    requiresActiveCard: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "curruid-np-lock",
        kind: "residual",
        printedClause: "残留：你不能使用【库·丘林Alter】的宝具。",
        conditions: [{ type: "source_active" }],
        execution: { mode: "automatic" },
        ruleModifiers: [
          {
            id: "curruid-forbid-cu-np-play",
            operation: "forbid",
            rule: "card_play",
            scope: { subject: "controller", cards: { ownerDefinitionIds: ["servant.cu-alter"], attributesAny: ["宝具"] } },
            lifecycle: { duration: "while_active" },
          },
          {
            id: "curruid-forbid-cu-np-use",
            operation: "forbid",
            rule: "skill_use",
            scope: { subject: "controller", skillCard: { ownerDefinitionIds: ["servant.cu-alter"], attributesAny: ["宝具"] } },
            lifecycle: { duration: "while_active" },
          },
        ],
      },
      {
        id: "curruid-basic-upgrade",
        kind: "residual",
        printedClause: "残留：你不能使用【库·丘林Alter】的宝具。你每打出一张基础攻击时，可以支付1点魔力。若如此做，此攻击获得力量属性与+1威力至回合结束。",
        conditions: [{ type: "source_active" }],
        execution: { mode: "automatic" },
        ruleModifiers: [{
          id: "curruid-basic-play-upgrade",
          operation: "allow",
          rule: "card_play_upgrade",
          scope: { subject: "controller", cards: { basic: true }, extraMana: 1, addAttributes: ["力量"], powerBonus: 1 },
          lifecycle: { duration: "while_active" },
        }],
      },
      {
        id: "curruid-power",
        kind: "phase_action",
        printedClause: "行动阶段：+3合计威力。",
        activation: { phase: "action", step: "player-window" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.cu-alter-curruid-permanent" },
      },
      {
        id: "curruid-cleanup",
        kind: "passive",
        printedClause: "战斗阶段结束后，将你的所有【噬碎死牙之兽】从游戏中移除。",
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.cu-alter-curruid-permanent" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.quetzalcoatl.skill.sc-quetzalcoatl-1"] = {
  ...overrides["servant.quetzalcoatl.skill.sc-quetzalcoatl-1"],
  activation: "phase",
  windows: ["action"],
  requiresActiveCard: true,
  handlerId: "core.quetzal-flame",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "flame-chain",
      kind: "phase_action",
      printedClause: "行动阶段：若你激活的攻击中没有💥力量基础攻击，抽一张牌并打出。若此效果打出的牌是🟢迅捷属性，你可以再次执行该效果；如果此效果打出的牌是💥力量属性，本回合每张因此效果打出的攻击令该张被打出的攻击获得+1威力。",
      activation: { phase: "action" },
      conditions: [{ type: "source_active" }],
      execution: { mode: "handler", handlerId: "core.quetzal-flame" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.quetzalcoatl.skill.sc-quetzalcoatl-2"] = {
  ...overrides["servant.quetzalcoatl.skill.sc-quetzalcoatl-2"],
  activation: "phase",
  windows: ["outpost", "action"],
  cardResidual: true,
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  limit: "once-per-game",
  passiveEventTypes: ["combat.resolved"],
  abilities: [
    {
      id: "sunstone-outpost",
      name: "太阳石·胜利预言",
      activation: "phase",
      windows: ["outpost"],
      handlerId: "core.quetzal-sunstone",
      requiresActiveCard: true,
      limit: "once-per-round",
    },
    {
      id: "sunstone-prophecy",
      name: "太阳石·预言",
      activation: "phase",
      windows: ["action"],
      handlerId: "core.quetzal-sunstone",
      requiresActiveCard: true,
      limit: "once-per-round",
    },
  ],
  handlerId: "core.quetzal-sunstone",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "sunstone-outpost",
        kind: "phase_action",
        printedClause: "前哨阶段：关闭此牌，若本回合魁札尔·科亚特尔获胜，获得4点战果。",
        activation: { phase: "outpost" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.quetzal-sunstone" },
      },
      {
        id: "sunstone-prophecy",
        kind: "phase_action",
        printedClause: "预言之行动阶段：抽至多2张牌，然后将2张手牌以任意顺序放置于你的牌库底。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.quetzal-sunstone" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.arash.skill.sc-arash-2"] = {
  ...overrides["servant.arash.skill.sc-arash-2"],
  activation: "phase",
  windows: ["action", "combat"],
  requiresActiveCard: true,
  abilities: [
    {
      id: "clairvoyance-double-terrain",
      name: "千里眼",
      activation: "phase",
      windows: ["action"],
      handlerId: "core.arash-clairvoyance",
      requiresActiveCard: true,
    },
    {
      id: "clairvoyance-top-card",
      name: "千里眼",
      activation: "phase",
      windows: ["combat"],
      handlerId: "core.arash-clairvoyance",
      requiresActiveCard: true,
    },
  ],
  handlerId: "core.arash-clairvoyance",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "clairvoyance-double-terrain",
        kind: "phase_action",
        printedClause: "行动阶段：将你的地利变为2倍。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.arash-clairvoyance" },
      },
      {
        id: "clairvoyance-top-card",
        kind: "phase_action",
        printedClause: "战斗阶段：选择你的一张生效的基础攻击，然后弃置牌库顶的牌。若弃置的牌与你选择的牌拥有相同的基本威力，则合计威力+3。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.arash-clairvoyance" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.arash.skill.sc-arash-3"] = {
  ...overrides["servant.arash.skill.sc-arash-3"],
  activation: "play",
  revealsTrueNameOnPlay: true,
  limit: "once-per-game",
  tags: [...new Set([...(overrides["servant.arash.skill.sc-arash-3"]?.tags ?? []), "cannot-copy", "cannot-steal", "opponent-close-immune"])],
  passiveEventTypes: ["combat.resolved"],
  handlerId: "core.arash-stella",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "stella-resolution",
        kind: "passive",
        printedClause: "此牌不能被复制、盗用或无效关闭。若你赢得战斗，获得六点战果。战斗结束后阿拉什【死亡】。他将不再是你的从者。将【神圣的献身】以外的阿拉什技能移除游戏。",
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.arash-stella" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["master.kariya.skill.s4"] = {
  ...overrides["master.kariya.skill.s4"],
  activation: "passive",
  windows: ["preparation"],
  requiresActiveCard: false,
  passiveEventTypes: ["round.started"],
  handlerId: "core.kariya-collapse",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "broken-random-card",
      kind: "passive",
      printedClause: "准备阶段：将你技能区的牌与手牌混洗之后，随机抽取一张牌并展示。若该牌是攻击牌，则你本回合必须在常规出牌时将其打出（可以暗置）且该牌获得“此牌获得+3威力”。该效果具有强制性。",
      conditions: [{ type: "source_owned" }],
      execution: { mode: "handler", handlerId: "core.kariya-collapse" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["master.kariya.skill.ascension"] = {
  ...overrides["master.kariya.skill.ascension"],
  initiallyOwned: false,
  activation: "phase",
  windows: ["action", "combat"],
  requiresActiveCard: false,
  handlerId: "core.kariya-human-battery",
  supportLevel: "FULL",
  abilities: [
    {
      id: "human-battery-top-card",
      name: "人体反应堆",
      activation: "phase",
      windows: ["action"],
      abilityCost: 6,
      handlerId: "core.kariya-human-battery",
      requiresActiveCard: false,
    },
    {
      id: "human-battery-nemesis-move",
      name: "人体反应堆",
      activation: "phase",
      windows: ["combat"],
      handlerId: "core.kariya-human-battery",
      requiresActiveCard: false,
    },
  ],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "human-battery-basic-overclock",
        kind: "passive",
        printedClause: "你的基础牌的魔力消耗+3且威力+4。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "automatic" },
        ruleModifiers: [
          { id: "human-battery-basic-cost", operation: "add", rule: "card_cost", scope: { subject: "controller", cards: { basic: true } }, value: 3, lifecycle: { duration: "permanent" } },
          { id: "human-battery-basic-power", operation: "add", rule: "card_power", scope: { subject: "controller", cards: { basic: true } }, value: 4, lifecycle: { duration: "permanent" } },
        ],
      },
      {
        id: "human-battery-top-card",
        kind: "phase_action",
        printedClause: "行动阶段：如果你已【崩坏】，你可花费4点魔力将牌堆顶的那张牌加入攻击。",
        activation: { phase: "action" },
        execution: { mode: "handler", handlerId: "core.kariya-human-battery" },
      },
      {
        id: "human-battery-nemesis-move",
        kind: "phase_action",
        printedClause: "战斗阶段：如果你在【魔术工房】，你可以移动至宿敌所在的战场。",
        activation: { phase: "combat" },
        execution: { mode: "handler", handlerId: "core.kariya-human-battery" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.arcueid.skill.sc-arcueid-1"] = {
  ...overrides["servant.arcueid.skill.sc-arcueid-1"],
  activation: "phase",
  windows: ["combat"],
  pairedPlayOtherCostReduction: 3,
  requiresActiveCard: true,
  handlerId: "core.arcueid-crimson-moon",
  supportLevel: "FULL",
  abilities: [{
    id: "crimson-moon-gather",
    name: "腥红之月",
    activation: "phase",
    windows: ["combat"],
    handlerId: "core.arcueid-crimson-moon",
    requiresActiveCard: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "crimson-moon-paired-cost",
        kind: "play_trigger",
        printedClause: "与腥红之月一同打出的另一张牌的魔力消耗-3。",
        execution: { mode: "handler", handlerId: "core.arcueid-crimson-moon" },
      },
      {
        id: "crimson-moon-gather",
        kind: "phase_action",
        printedClause: "战斗阶段：所有未与其他人进行交战的对手失去1点战果，然后移动至你所在的战场。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }, { type: "at_battlefield" }],
        execution: { mode: "handler", handlerId: "core.arcueid-crimson-moon" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};
overrides["servant.arcueid.skill.sc-arcueid-2"] = {
  ...overrides["servant.arcueid.skill.sc-arcueid-2"],
  activation: "phase",
  windows: ["combat"],
  requiresActiveCard: true,
  handlerId: "core.arcueid-millennium-castle",
  supportLevel: "FULL",
  abilities: [{
    id: "millennium-castle-exile",
    name: "千年城",
    activation: "phase",
    windows: ["combat"],
    handlerId: "core.arcueid-millennium-castle",
    requiresActiveCard: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "millennium-castle-exile",
      kind: "phase_action",
      printedClause: "战斗阶段：与你进行交战的对手失去3点魔力，然后将你从版图移除。你不可再打出此牌，直到你赢得一场胜利。",
      activation: { phase: "combat" },
      conditions: [{ type: "source_active" }, { type: "at_battlefield" }],
      execution: { mode: "handler", handlerId: "core.arcueid-millennium-castle" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.spartacus.skill.sc-spartacus-3"] = {
  ...overrides["servant.spartacus.skill.sc-spartacus-3"],
  activation: "phase",
  windows: ["action"],
  steps: ["player-window"],
  requiresActiveCard: false,
  handlerId: "core.spartacus-free-spirit",
  supportLevel: "FULL",
  abilities: [
    {
      id: "free-spirit-use-command-seal",
      name: "不屈的意志",
      activation: "phase",
      windows: ["action"],
      steps: ["player-window"],
      requiresActiveCard: false,
    },
    {
      id: "free-spirit-use-ruler-seal",
      name: "不屈的意志",
      activation: "phase",
      windows: ["action"],
      steps: ["player-window"],
      requiresActiveCard: false,
    },
    {
      id: "free-spirit-unused-seal-aura",
      name: "不屈的意志",
      activation: "phase",
      windows: ["action"],
      steps: ["player-window"],
      limit: "once-per-round",
      requiresActiveCard: false,
    },
  ],
};

overrides["servant.angra.skill.sc-angra-1"] = {
  ...overrides["servant.angra.skill.sc-angra-1"],
  activation: "phase",
  windows: ["action"],
  passiveEventTypes: ["combat.ending"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  handlerId: "core.angra-all-evils",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "all-world-evils-delay",
      kind: "phase_action",
      printedClause: "行动阶段：战斗阶段结束后弃置自己4张牌（若不足4张，则手牌全部弃置）。若你战败，每弃置一张【复仇者】，你便可偷取一名击败你的胜利者2点战果。",
      activation: { phase: "action" },
      execution: { mode: "handler", handlerId: "core.angra-all-evils" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.angra.skill.sc-angra-2"] = {
  ...overrides["servant.angra.skill.sc-angra-2"],
  activation: "phase",
  windows: ["action"],
  requiresActiveCard: true,
  handlerId: "core.angra-eternal-binding",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "eternal-binding-return",
      kind: "phase_action",
      printedClause: "行动阶段：将你的弃牌堆中的所有【复仇者】加入手牌。如果你于上一回合中战败，则将它们加入攻击。",
      activation: { phase: "action" },
      execution: { mode: "handler", handlerId: "core.angra-eternal-binding" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.musashi.skill.sc-musashi-1"] = {
  ...overrides["servant.musashi.skill.sc-musashi-1"],
  activation: "passive",
  windows: [],
  passiveEventTypes: ["combat.resolved"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  handlerId: "core.musashi-mastery",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "gain-mastery-on-win",
      kind: "passive",
      printedClause: "被动：当你赢得战斗时，获得一枚【境界】标记。战斗中每有一名对手额外获得1枚【境界】标记。每回合获得【境界】标记不能超过3个。",
      conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "combat.resolved" }, { type: "event_player_won_combat" }],
      execution: { mode: "handler", handlerId: "core.musashi-mastery" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.musashi.skill.sc-musashi-2"] = {
  ...overrides["servant.musashi.skill.sc-musashi-2"],
  activation: "passive",
  windows: [],
  requiresActiveCard: false,
  handlerId: "core.musashi-niten-ichiryu",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "niten-ichiryu-mastery-thresholds",
      kind: "passive",
      printedClause: "被动：基于【境界】层数宫本武藏得到：\n2+：如果你控制的2张攻击拥有相同的基础威力，总威力+5。\n7+：将你的基本攻击的基础威力翻倍。\n12+：将武藏的技能牌基础威力翻倍。",
      execution: { mode: "handler", handlerId: "core.musashi-niten-ichiryu" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.billy.skill.sc-billy-1"] = {
  ...overrides["servant.billy.skill.sc-billy-1"],
  activation: "phase",
  windows: ["combat"],
  requiresActiveCard: false,
  revealsTrueNameOnSkillUse: true,
  handlerId: "core.billy-thunderer-hidden-attacks",
  supportLevel: "FULL",
  abilities: [{
    id: "thunderer-hidden-attacks",
    name: "坏音霹雳",
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: false,
    revealsTrueNameOnSkillUse: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "thunderer-hidden-attacks",
      kind: "phase_action",
      printedClause: "被动/战斗阶段：关闭比利小子的技能牌，激活你控制的至多2张暗置的迅捷基础攻击。你可以花费3点魔力改为激活你所有暗置的迅捷基础攻击。",
      activation: { phase: "combat" },
      execution: { mode: "handler", handlerId: "core.billy-thunderer-hidden-attacks" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.billy.skill.sc-billy-3"] = {
  ...overrides["servant.billy.skill.sc-billy-3"],
  activation: "phase",
  windows: ["action"],
  requiresActiveCard: false,
  handlerId: "core.billy-quick-draw",
  supportLevel: "FULL",
  abilities: [{
    id: "quick-draw",
    name: "快速拔枪",
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "quick-draw",
      kind: "phase_action",
      printedClause: "行动阶段：将一张手牌暗置打出，然后抽1张牌。你可以花费1点魔力重复进行此操作，每回合合计使用此效果暗置至多6张牌。",
      activation: { phase: "action" },
      execution: { mode: "handler", handlerId: "core.billy-quick-draw" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.jaguarman.skill.sc-jaguarman-2"] = {
  ...overrides["servant.jaguarman.skill.sc-jaguarman-2"],
  activation: "residual",
  windows: [],
  cardResidual: true,
  passiveEventTypes: ["player.entered-location", "combat.resolved"],
  requiresActiveCard: false,
  handlerId: "core.jaguarman-dark-forest",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "dark-forest-scouting-join",
        kind: "passive",
        printedClause: "被动：当你进入侦察时，可以将此牌加入攻击。",
        conditions: [{ type: "event_type_is", eventType: "player.entered-location" }],
        execution: { mode: "handler", handlerId: "core.jaguarman-dark-forest" },
      },
      {
        id: "dark-forest-close-after-combat",
        kind: "residual",
        printedClause: "残留：与对手战斗后，关闭此牌。",
        conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "combat.resolved" }],
        execution: { mode: "handler", handlerId: "core.jaguarman-dark-forest" },
      },
      {
        id: "dark-forest-move-double",
        kind: "residual",
        printedClause: "若你本回合进行了移动或重新部署，此牌威力翻倍。",
        conditions: [
          { type: "source_active" },
          { type: "player_flag_number_current_round", key: "movedOrRedeployedRound" },
        ],
        execution: { mode: "automatic" },
        ruleModifiers: [{
          id: "dark-forest-double-base-power",
          printedClause: "若你本回合进行了移动或重新部署，此牌威力翻倍。",
          operation: "multiply",
          rule: "card_base_power",
          scope: { subject: "controller", cards: { definitionIds: ["servant.jaguarman.skill.sc-jaguarman-2"] } },
          value: 2,
          lifecycle: { duration: "while_active" },
        }],
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.jaguarman.skill.sc-jaguarman-3"] = {
  ...overrides["servant.jaguarman.skill.sc-jaguarman-3"],
  activation: "phase",
  windows: ["action"],
  passiveEventTypes: ["combat.resolved", "combat.ending"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  handlerId: "core.jaguarman-death-claw",
  supportLevel: "FULL",
  abilities: [{
    id: "death-claw-pull",
    name: "无可逃脱死亡钩爪",
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "death-claw-pull",
        kind: "phase_action",
        printedClause: "行动阶段：你可将一名相邻地点未处于交战状态的对手移动至你的战场。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.jaguarman-death-claw" },
      },
      {
        id: "death-claw-low-power-penalty",
        kind: "passive",
        printedClause: "你的战斗中，战力小于12的对手于战斗阶段结束后失去2点战果。",
        execution: { mode: "handler", handlerId: "core.jaguarman-death-claw" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.corday.skill.sc-corday-2"] = {
  ...overrides["servant.corday.skill.sc-corday-2"],
  activation: "optional-trigger",
  windows: ["outpost"],
  passiveEventTypes: ["phase.transitioned", "combat.resolved"],
  requiresActiveCard: false,
  handlerId: "core.corday-foolish-plan",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "foolish-plan-mark",
        kind: "passive",
        printedClause: "被动/前哨阶段：若你位于魔术工房，秘密记录另一名玩家于本回合作为你的【目标】。",
        execution: { mode: "handler", handlerId: "core.corday-foolish-plan" },
      },
      {
        id: "foolish-plan-reward",
        kind: "passive",
        printedClause: "若你赢得一场包括【目标】的战斗，获得2点战果。",
        conditions: [{ type: "event_type_is", eventType: "combat.resolved" }],
        execution: { mode: "handler", handlerId: "core.corday-foolish-plan" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.corday.skill.sc-corday-3"] = {
  ...overrides["servant.corday.skill.sc-corday-3"],
  activation: "phase",
  windows: ["action", "combat"],
  requiresActiveCard: true,
  handlerId: "core.corday-dream",
  supportLevel: "FULL",
  abilities: [
    {
      id: "dream-play-specials",
      name: "予故国以爱：特殊攻击",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
    },
    {
      id: "dream-defeat-target",
      name: "予故国以爱，以沉溺般的梦",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
    },
  ],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "dream-play-specials",
        kind: "phase_action",
        printedClause: "行动阶段：打出手牌中任意数量的基础特殊攻击。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.corday-dream" },
      },
      {
        id: "dream-defeat-target",
        kind: "phase_action",
        printedClause: "战斗阶段：使与你进行战斗的一名【目标】【败北】。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.corday-dream" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.okita.skill.sc-okita-1"] = {
  ...overrides["servant.okita.skill.sc-okita-1"],
  activation: "phase",
  windows: ["action"],
  requiresActiveCard: true,
  handlerId: "core.okita-sincerity-flag",
  supportLevel: "FULL",
  abilities: [{
    id: "sincerity-play-and-draw",
    name: "诚之旗",
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "sincerity-play-and-draw",
      kind: "phase_action",
      printedClause: "行动阶段：从手牌中正面打出一张牌，然后抽一张牌。你每回合可以使用此效果至多三次。",
      activation: { phase: "action" },
      conditions: [{ type: "source_active" }],
      execution: { mode: "handler", handlerId: "core.okita-sincerity-flag" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.okita.skill.sc-okita-4"] = {
  ...overrides["servant.okita.skill.sc-okita-4"],
  activation: "passive",
  windows: [],
  passiveEventTypes: ["game.started"],
  requiresActiveCard: false,
  handlerId: "core.okita-weak-constitution",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "weak-exile-replacement",
        kind: "passive",
        printedClause: "（当此牌被移除游戏时，改为弃置此牌）被动：本回合的合计威力变为0。",
        execution: { mode: "handler", handlerId: "core.okita-weak-constitution" },
      },
      {
        id: "weak-combat-reveal",
        kind: "passive",
        printedClause: "若此牌在你的手牌中，在战斗时必须展示此牌，战斗后弃置此牌。",
        execution: { mode: "handler", handlerId: "core.okita-weak-constitution" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.tristan.skill.sc-tristan-1"] = {
  ...overrides["servant.tristan.skill.sc-tristan-1"],
  activation: "phase",
  windows: ["combat"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  handlerId: "core.tristan-lament",
  supportLevel: "FULL",
  abilities: [{
    id: "lament-resonance",
    name: "悲叹共鸣",
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [{
      id: "lament-resonance",
      kind: "phase_action",
      printedClause: "悲叹共鸣-战斗阶段：关闭你战斗中除此牌外的，所有与另一张攻击具有相同基本威力的非残留攻击。若没有，更改为弃置你牌库顶的三张牌。",
      activation: { phase: "combat" },
      conditions: [{ type: "source_active" }],
      execution: { mode: "handler", handlerId: "core.tristan-lament" },
    }],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.tristan.skill.sc-tristan-2"] = {
  ...overrides["servant.tristan.skill.sc-tristan-2"],
  activation: "residual",
  windows: [],
  cardResidual: true,
  passiveEventTypes: ["card.played", "phase.transitioned"],
  requiresActiveCard: false,
  handlerId: "core.tristan-love",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "love-shuffle-on-play",
        kind: "play_trigger",
        printedClause: "打出时：将你弃牌堆内任意数量的牌洗回牌库。\nX为你以此效果洗回的牌的数量+2直至此牌关闭。\n记忆渐熄-残留：你进行战斗的战斗阶段需花费X点魔力，否则关闭此牌。",
        execution: { mode: "handler", handlerId: "core.tristan-love" },
      },
      {
        id: "fading-memory-upkeep",
        kind: "residual",
        printedClause: "记忆渐熄-残留：你进行战斗的战斗阶段需花费X点魔力，否则关闭此牌。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.tristan-love" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.sanzang.skill.sc-sanzang-2"] = {
  ...overrides["servant.sanzang.skill.sc-sanzang-2"],
  activation: "residual",
  windows: [],
  cardResidual: true,
  passiveEventTypes: ["card.played"],
  requiresActiveCard: false,
  revealsTrueNameOnPlay: true,
  handlerId: "core.sanzang-teachings",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "rapid-chanting-on-play",
        kind: "play_trigger",
        printedClause: "高速诵经-打出时：支付3X点魔力，抽X张牌，然后将X张手牌移除游戏。每有一张因此效果被移除的【幸运】，此牌威力+4直至被关闭。",
        execution: { mode: "handler", handlerId: "core.sanzang-teachings" },
      },
      {
        id: "teachings-two-round-residual",
        kind: "residual",
        printedClause: "残留：此牌持续激活两个回合。",
        execution: { mode: "handler", handlerId: "core.sanzang-teachings" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.sanzang.skill.sc-sanzang-3"] = {
  ...overrides["servant.sanzang.skill.sc-sanzang-3"],
  activation: "phase",
  windows: ["action"],
  passiveEventTypes: ["phase.transitioned"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  handlerId: "core.sanzang-five-elements-palm",
  supportLevel: "FULL",
  abilities: [{
    id: "palm-hidden-attack",
    name: "五行山·释迦如来掌",
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "palm-hidden-attack",
        kind: "phase_action",
        printedClause: "行动阶段：打出一张暗置攻击并于你的战斗阶段将其展示后弃置。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.sanzang-five-elements-palm" },
      },
      {
        id: "palm-luck-power",
        kind: "passive",
        printedClause: "若该攻击为【幸运】，【五行山·释迦如来掌】获得+5威力。",
        execution: { mode: "handler", handlerId: "core.sanzang-five-elements-palm" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.artoria-alt.skill.sc-artoria-alt-1"] = {
  ...overrides["servant.artoria-alt.skill.sc-artoria-alt-1"],
  activation: "phase",
  windows: ["action"],
  passiveEventTypes: ["card.played"],
  revealsTrueNameOnPlay: true,
  ignoresSituationRestrictions: true,
  requiresActiveCard: true,
  handlerId: "core.artoria-alt-excalibur-morgan",
  supportLevel: "FULL",
  abilities: [{
    id: "vortigerns-hammer",
    name: "风王铁锤",
    activation: "phase",
    windows: ["action"],
    abilityCost: 4,
    requiresActiveCard: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "situation-cannot-prevent-play",
        kind: "passive",
        printedClause: "局势牌无法阻止你打出此牌。",
        execution: { mode: "handler", handlerId: "core.artoria-alt-excalibur-morgan" },
      },
      {
        id: "vortigerns-hammer",
        kind: "phase_action",
        printedClause: "风王铁锤-行动阶段：花费4点魔力，此牌每被连续打出一回合，便获得+3威力。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.artoria-alt-excalibur-morgan" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.artoria-alt.skill.sc-artoria-alt-2"] = {
  ...overrides["servant.artoria-alt.skill.sc-artoria-alt-2"],
  activation: "residual",
  windows: [],
  requiresEightMana: false,
  cardResidual: true,
  passiveEventTypes: ["attack.committed", "card.used"],
  requiresActiveCard: false,
  handlerId: "core.artoria-alt-blackening-curse",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "play-below-eight-mana",
        kind: "passive",
        printedClause: "你拥有的魔力少于8点也可以打出此牌。",
        execution: { mode: "handler", handlerId: "core.artoria-alt-blackening-curse" },
      },
      {
        id: "angra-embrace-lock",
        kind: "residual",
        printedClause: "若你的魔力少于8点，与你位于同一战场的对手无法使用宝具。",
        conditions: [{ type: "source_active" }, { type: "mana_below", amount: 8 }],
        ruleModifiers: [
          {
            id: "forbid-opponent-np-play",
            printedClause: "若你的魔力少于8点，与你位于同一战场的对手无法使用宝具。",
            operation: "forbid",
            rule: "card_play",
            scope: { subject: "opponents_at_source_battlefield", cards: { attributesAny: ["宝具"] } },
            lifecycle: { duration: "while_active" },
          },
          {
            id: "forbid-opponent-np-ability",
            printedClause: "若你的魔力少于8点，与你位于同一战场的对手无法使用宝具。",
            operation: "forbid",
            rule: "skill_use",
            scope: { subject: "opponents_at_source_battlefield", skillCard: { attributesAny: ["宝具"] } },
            lifecycle: { duration: "while_active" },
          },
        ],
        execution: { mode: "automatic" },
      },
      {
        id: "angra-embrace-close",
        kind: "residual",
        printedClause: "安哥拉曼纽的拥抱-残留：当你使用宝具时，关闭此牌。",
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.artoria-alt-blackening-curse" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.kinggil.skill.sc-kinggil-2"] = {
  ...overrides["servant.kinggil.skill.sc-kinggil-2"],
  activation: "phase",
  windows: ["action"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  handlerId: "core.king-gil-gate-of-babylon",
  supportLevel: "FULL",
  abilities: [{
    id: "treasury-attributes",
    name: "王之财宝",
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
  }],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "treasury-attributes",
        kind: "phase_action",
        printedClause: "行动阶段：弃置你的所有手牌，然后令此牌获得被弃置牌的所有属性。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.king-gil-gate-of-babylon" },
      },
      {
        id: "treasury-combat-double",
        kind: "passive",
        printedClause: "战斗阶段：此牌威力翻倍。",
        conditions: [{ type: "source_active" }, { type: "phase_is", phase: "combat" }],
        ruleModifiers: [{
          id: "gate-combat-double-power",
          printedClause: "战斗阶段：此牌威力翻倍。",
          operation: "multiply",
          rule: "card_power",
          scope: { subject: "controller", cards: { definitionIds: ["servant.kinggil.skill.sc-kinggil-2"] } },
          value: 2,
          lifecycle: { duration: "while_active" },
        }],
        execution: { mode: "automatic" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.kinggil.skill.sc-kinggil-3"] = {
  ...overrides["servant.kinggil.skill.sc-kinggil-3"],
  activation: "passive",
  windows: [],
  revealsTrueNameOnPlay: true,
  playPrerequisite: { activeOwnedDefinitionId: "servant.kinggil.skill.sc-kinggil-1", closeOnPlay: true },
  passiveEventTypes: ["card.played", "round.started"],
  requiresActiveCard: false,
  handlerId: "core.king-gil-melammu-dingir",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "empty-the-treasury-prerequisite",
        kind: "play_trigger",
        printedClause: "开炮！开炮！-你需关闭你激活的【阵地作成】才可打出此牌。",
        execution: { mode: "handler", handlerId: "core.king-gil-melammu-dingir" },
      },
      {
        id: "next-round-preparation",
        kind: "passive",
        printedClause: "下个回合，你于准备阶段抽牌后额外抽2张牌且于进行常规出牌时可以追加打出1张牌。",
        execution: { mode: "handler", handlerId: "core.king-gil-melammu-dingir" },
      },
      {
        id: "next-round-extra-standard-card",
        kind: "passive",
        printedClause: "下个回合，你于准备阶段抽牌后额外抽2张牌且于进行常规出牌时可以追加打出1张牌。",
        execution: { mode: "handler", handlerId: "core.king-gil-melammu-dingir" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["servant.mhx.skill.sc-mhx-1"] = {
  ...overrides["servant.mhx.skill.sc-mhx-1"],
  activation: "phase",
  windows: ["combat"],
  steps: ["player-window"],
  limit: "once-per-game",
  requiresActiveCard: true,
  abilities: [
    {
      id: "saber-must-die",
      name: "Saber必须死！",
      activation: "phase",
      windows: ["combat"],
      steps: ["player-window"],
      requiresActiveCard: true,
    },
  ],
  handlerId: "core.mhx-anti-saber-weapon",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "saber-must-die",
        kind: "phase_action",
        printedClause: "Saber必须死！-战斗阶段：令一名交战对手【败北】。若其战败，偷取其2点战果。若其战败且从者为金发或职阶为Saber，改为偷取4点战果。若均满足，改为偷取6点战果。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "automatic", handlerId: "core.mhx-anti-saber-weapon" },
      },
    ],
  },
};

overrides["master.artoira.skill.s1"] = {
  ...overrides["master.artoira.skill.s1"],
  activation: "phase",
  windows: ["outpost"],
  steps: ["player-window"],
  requiresActiveCard: false,
  handlerId: "core.artoira-charge",
  supportLevel: "FULL",
  abilities: [
    {
      id: "charge-skill-attack",
      name: "蓄势",
      activation: "phase",
      windows: ["outpost"],
      steps: ["player-window"],
      requiresActiveCard: false,
    },
  ],
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "charge-skill-attack",
        kind: "phase_action",
        printedClause: "前哨阶段：选择你技能区一张明置的，属于你从者的技能攻击进行蓄势。\n（蓄势：将该攻击放置于你牌库顶的第X张[牌库不足则无法放置]，X为其魔力消耗+1，当其因任何原因从你的牌库离开时[被抽取,弃置,移除等]，将其免费加入你的攻击。）",
        activation: { phase: "outpost" },
        execution: { mode: "automatic", handlerId: "core.artoira-charge" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

overrides["master.artoira.skill.ascension"] = {
  ...overrides["master.artoira.skill.ascension"],
  initiallyOwned: false,
  activation: "passive",
  windows: [],
  requiresActiveCard: false,
  passiveEventTypes: ["combat.resolved"],
  handlerId: "core.artoira-wooden-sword",
  supportLevel: "FULL",
  rules: {
    schemaVersion: "fd-card-authoring-v1",
    abilities: [
      {
        id: "charge-eligible",
        kind: "passive",
        printedClause: "被动：你可以蓄势此牌。",
        execution: { mode: "automatic" },
      },
      {
        id: "wooden-sword-instant-win",
        kind: "passive",
        printedClause: "剑岂是如此不便之物-战斗阶段：若你获胜且此牌本回合是从你的牌库入场，你立即获得游戏胜利。",
        execution: { mode: "automatic", handlerId: "core.artoira-wooden-sword" },
      },
    ],
    ambiguities: [],
    unmodeledClauses: [],
  },
};

Object.assign(overrides, {
  "master.bazett.skill.s2": {
    ...overrides["master.bazett.skill.s2"],
    activation: "passive",
    limit: "once-per-game",
    passiveEventTypes: ["card.played", "card.used"],
    handlerId: "core.bazett-fragarach",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "fragarach-counter",
          kind: "passive",
          printedClause: "<每局游戏限一次>\n先发后至-下一次一名与你位于同一战场的对手使用宝具时，令其【败北】。",
          execution: { mode: "automatic", handlerId: "core.bazett-fragarach" },
        },
      ],
    },
  },
  "servant.hephaistion.skill.sc-hephaistion-1": {
    ...overrides["servant.hephaistion.skill.sc-hephaistion-1"],
    activation: "phase",
    windows: ["combat"],
    revealsTrueNameOnPlay: true,
    requiresActiveCard: true,
    handlerId: "core.hephaistion-wheel",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "domination-eye-command-seal",
          kind: "phase_action",
          activation: { phase: "combat" },
          requiresActiveCard: true,
          printedClause: "支配之眼-战斗阶段：你的交战对手可以立即花费1枚令咒。然后，令所有本回合未花费或使用至少1枚令咒的交战对手关闭其一半已激活的攻击（向上取整）。",
          execution: { mode: "automatic", handlerId: "core.hephaistion-wheel" },
        },
      ],
    },
  },
  "master.sakura.skill.ascension": {
    ...overrides["master.sakura.skill.ascension"],
    initiallyOwned: false,
    unlockLatestRound: 4,
    activation: "passive",
    passiveEventTypes: ["round.ended"],
    handlerId: "core.sakura-corrosion",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "unlock-first-four-rounds",
          kind: "passive",
          printedClause: "你只能在游戏的前四回合中解锁此牌。",
          execution: { mode: "automatic", handlerId: "core.unlock-owner-ascension" },
        },
        {
          id: "corrosion-transfer",
          kind: "passive",
          printedClause: "每局游戏限一次，当一名玩家被淘汰且【被污染的圣杯】处于激活状态，你可将其拥有的任意张从者技能牌加入你的技能区。",
          execution: { mode: "automatic", handlerId: "core.sakura-corrosion" },
        },
      ],
    },
  },
  "servant.tomoe.skill.sc-tomoe-2": {
    ...overrides["servant.tomoe.skill.sc-tomoe-2"],
    activation: "phase",
    windows: ["action", "combat"],
    handlerId: "core.tomoe-demonic-nature",
    supportLevel: "FULL",
    requiresActiveCard: false,
    abilities: [
      {
        id: "infernal-fire",
        name: "无间业火",
        activation: "phase",
        windows: ["action"],
        steps: ["player-window"],
        limit: "once-per-round",
      },
      {
        id: "double-advantage",
        name: "鬼种之魔",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        limit: "once-per-round",
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "infernal-fire",
          kind: "phase_action",
          printedClause: "无间业火-行动阶段：下个回合，所有对手部署于此战场前可以花费至多5点战果，所有基础地利数高于其支付战果数的地利位置视为已被占据，无法部署。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.tomoe-demonic-nature" },
        },
        {
          id: "double-advantage",
          kind: "phase_action",
          printedClause: "战斗阶段：将你的地利翻倍。",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.tomoe-demonic-nature" },
        },
      ],
    },
  },
  "servant.ladyavalon.skill.sc-ladyavalon-1": {
    ...overrides["servant.ladyavalon.skill.sc-ladyavalon-1"],
    activation: "phase",
    windows: ["combat"],
    passiveEventTypes: ["game.started"],
    handlerId: "core.lady-avalon-ideal-land",
    supportLevel: "FULL",
    requiresActiveCard: false,
    abilities: [
      {
        id: "ideal-land-close",
        name: "幻世隔绝的理想乡",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        limit: "once-per-round",
        requiresActiveCard: false,
        revealsTrueNameOnSkillUse: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "climax-event-reward-block",
          kind: "passive",
          printedClause: "被动：高潮阶段你无法从事件牌中获得战果。此效果于阿瓦隆女士不会因任何方式失效且不可被复制。",
          execution: { mode: "automatic", handlerId: "core.lady-avalon-ideal-land" },
        },
        {
          id: "ideal-land-close",
          kind: "phase_action",
          printedClause: "战斗阶段：关闭你战斗中所有印刷魔力消耗与【伪装者】的印刷基本威力相同的其他攻击。",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.lady-avalon-ideal-land" },
        },
      ],
    },
  },
  "master.waver.skill.ascension": {
    ...overrides["master.waver.skill.ascension"],
    initiallyOwned: false,
    activation: "phase",
    windows: ["outpost"],
    passiveEventTypes: ["combat.ending", "phase.transitioned"],
    handlerId: "core.waver-case-files",
    supportLevel: "FULL",
    requiresActiveCard: false,
    abilities: [
      {
        id: "case-files-predict",
        name: "战场预测",
        activation: "phase",
        windows: ["outpost"],
        steps: ["player-window"],
        limit: "once-per-round",
        requiresActiveCard: false,
      },
      {
        id: "case-files-discard",
        name: "群体弃牌",
        activation: "phase",
        windows: ["outpost"],
        steps: ["player-window"],
        abilityCost: 5,
        limit: "once-per-round",
        requiresActiveCard: false,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "case-files-predict",
          kind: "phase_action",
          printedClause: "前哨阶段：预测每个游戏内的战场的胜者，战斗阶段结束时，你每预测正确一个，便获得1点战果。你本回合无法从侦查获得战果。",
          activation: { phase: "outpost" },
          execution: { mode: "automatic", handlerId: "core.waver-case-files" },
        },
        {
          id: "case-files-discard",
          kind: "phase_action",
          printedClause: "前哨阶段：花费5点魔力，本阶段结束时，你所在地点的所有玩家均随机弃置2张手牌。",
          activation: { phase: "outpost" },
          execution: { mode: "automatic", handlerId: "core.waver-case-files" },
        },
      ],
    },
  },
  "servant.leonidas.skill.sc-leonidas-3": {
    ...overrides["servant.leonidas.skill.sc-leonidas-3"],
    activation: "phase",
    windows: ["combat"],
    passiveEventTypes: ["game.started", "card.created", "card.zone.changed", "player.entered-location"],
    handlerId: "core.leonidas-pride",
    supportLevel: "FULL",
    requiresActiveCard: false,
    abilities: [
      {
        id: "activate-hidden-attack",
        name: "殿军的矜持",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        limit: "once-per-round",
        requiresActiveCard: false,
      },
      {
        id: "phalanx",
        name: "方阵",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        limit: "once-per-round",
        requiresActiveCard: false,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "warrior-roar-face-down",
          kind: "passive",
          printedClause: "被动：你的【战士的雄叫】可以被暗置打出。",
          execution: { mode: "automatic", handlerId: "core.leonidas-pride" },
        },
        {
          id: "activate-hidden-attack",
          kind: "phase_action",
          printedClause: "战斗阶段：花费一张你控制的暗置攻击三倍消耗的魔力将其激活，你可以使用它的行动阶段能力。",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.leonidas-pride" },
        },
        {
          id: "phalanx",
          kind: "phase_action",
          printedClause: "方阵-战斗阶段：若有对手于本回合移动至你所在的战场，你获得3点基础地利（在翻倍等效果之前计算）。",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.leonidas-pride" },
        },
      ],
    },
  },
  "master.arcueid.skill.s2": {
    ...overrides["master.arcueid.skill.s2"],
    initiallyOwned: false,
    activation: "phase",
    windows: ["action", "combat"],
    handlerId: "core.arcueid-materialization",
    supportLevel: "FULL",
    requiresActiveCard: false,
    abilities: [
      {
        id: "prepare-materialization",
        name: "空想具现化",
        activation: "phase",
        windows: ["action"],
        steps: ["player-window"],
        limit: "once-per-game",
        requiresActiveCard: false,
      },
      {
        id: "materialize-replace",
        name: "具现替换",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        limit: "twice-per-round",
        requiresActiveCard: false,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "prepare-materialization",
          kind: "phase_action",
          printedClause: "<每局游戏限一次>\n行动阶段：在你的战斗阶段时，你可以关闭一张你战斗中的基础攻击。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.arcueid-materialization" },
        },
        {
          id: "materialize-replace",
          kind: "phase_action",
          printedClause: "若如此做，其控制者抽牌直至抽到一张基础攻击后，将其加入攻击，然后你可以重复使用一次此效果。",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.arcueid-materialization" },
        },
      ],
    },
  },
  "master.arcueid.skill.ascension": {
    ...overrides["master.arcueid.skill.ascension"],
    initiallyOwned: false,
    activation: "passive",
    windows: [],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    requiresActiveCard: false,
    requiresSkillUsedThisRound: "master.arcueid.skill.s2",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "millennium-castle-double-thirst",
          kind: "passive",
          printedClause: "月之真祖-被动：你的基础攻击受到【血之渴望】效果的双倍影响。",
          conditions: [{ type: "player_flag_equals", key: "moonPrincessThirstActive", value: true }],
          ruleModifiers: [
            {
              id: "millennium-castle-extra-thirst-cost",
              printedClause: "月之真祖-被动：你的基础攻击受到【血之渴望】效果的双倍影响。",
              operation: "add",
              rule: "card_cost",
              scope: { subject: "controller", cards: { basic: true } },
              value: 1,
            },
            {
              id: "millennium-castle-extra-thirst-power",
              printedClause: "月之真祖-被动：你的基础攻击受到【血之渴望】效果的双倍影响。",
              operation: "add",
              rule: "card_power",
              scope: { subject: "controller", cards: { basic: true } },
              value: 2,
            },
          ],
          execution: { mode: "automatic" },
        },
      ],
    },
  },
  "master.celenike.skill.s1": {
    ...overrides["master.celenike.skill.s1"],
    activation: "passive",
    windows: [],
    passiveEventTypes: ["combat.resolved", "player.victory-points.changed"],
    handlerId: "core.celenike-curse",
    supportLevel: "FULL",
    requiresActiveCard: false,
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "curse-wither",
          kind: "passive",
          printedClause: "当你战败时，令此战斗的所有胜者【枯萎】直至你于一回合内获得了4点及以上的战果。",
          conditions: [{ type: "event_type_is", eventType: "combat.resolved" }],
          execution: { mode: "automatic", handlerId: "core.celenike-curse" },
        },
        {
          id: "curse-steal",
          kind: "passive",
          printedClause: "当你获胜时，偷取该战斗中所有【枯萎】的玩家各2点战果。",
          conditions: [{ type: "event_type_is", eventType: "combat.resolved" }],
          execution: { mode: "automatic", handlerId: "core.celenike-curse" },
        },
      ],
    },
  },
  "master.celenike.skill.ascension": {
    ...overrides["master.celenike.skill.ascension"],
    initiallyOwned: false,
    activation: "phase",
    windows: ["action"],
    handlerId: "core.celenike-iron-stake",
    supportLevel: "FULL",
    requiresActiveCard: false,
    abilities: [
      {
        id: "pain-stake",
        name: "痛苦钉刺",
        activation: "phase",
        windows: ["action"],
        steps: ["player-window"],
        requiresActiveCard: false,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "pain-stake",
          kind: "phase_action",
          printedClause: "痛苦钉刺-行动阶段：令【枯萎】的玩家选择花费2点魔力或弃置所有手牌。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.celenike-iron-stake" },
        },
      ],
    },
  },
  "servant.ivan.skill.sc-ivan-2": {
    ...overrides["servant.ivan.skill.sc-ivan-2"],
    activation: "phase",
    windows: ["action"],
    passiveEventTypes: ["game.started", "player.victory-points.changed"],
    handlerId: "core.ivan-beast-form",
    supportLevel: "FULL",
    requiresActiveCard: false,
    abilities: [
      {
        id: "beast-form-move",
        name: "魔兽外形",
        activation: "phase",
        windows: ["action"],
        steps: ["player-window"],
        limit: "once-per-round",
        requiresActiveCard: false,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "beast-form-immovable",
          kind: "passive",
          printedClause: "被动：你不能移动也不能被移动。",
          execution: { mode: "automatic", handlerId: "core.ivan-beast-form" },
        },
        {
          id: "beast-form-half-victory",
          kind: "passive",
          printedClause: "被动：此牌展示后，与你位于同一地点的对手获得的战果减半（向上取整）。",
          execution: { mode: "automatic", handlerId: "core.ivan-beast-form" },
        },
        {
          id: "beast-form-move",
          kind: "phase_action",
          printedClause: "行动阶段：将与你位于同一战场的一名对手移动至侦查。获得等于回合数的合计威力。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.ivan-beast-form" },
        },
      ],
    },
  },
  "servant.maxwell.skill.sc-maxwell-3": {
    ...overrides["servant.maxwell.skill.sc-maxwell-3"],
    activation: "residual",
    windows: [],
    cardResidual: true,
    requiresActiveCard: true,
    handlerId: "core.mana-gain-replacement-residual",
    passiveEventTypes: ["card.played", "phase.transitioned"],
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "replace-mana-gain-with-source-power",
          kind: "residual",
          printedClause: "残留：当你要获得魔力时，改为令此牌在关闭前增加相同数量的威力。",
          conditions: [{ type: "source_active" }],
          lifecycle: { duration: "until_card_closed" },
          execution: { mode: "automatic", handlerId: "core.mana-gain-replacement-residual" },
        },
        {
          id: "combat-start-mana-drain-and-close",
          kind: "passive",
          printedClause: "残留：当你要获得魔力时，改为令此牌在关闭前增加相同数量的威力。在战斗阶段开始时，你所在地点的玩家失去2点魔力。若其中有玩家在失去魔力前其魔力值小于2，关闭此牌。",
          conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "phase.transitioned" }],
          execution: { mode: "automatic", handlerId: "core.mana-gain-replacement-residual" },
        },
      ],
    },
  },
  "servant.mechaeli.skill.sc-mechaeli-1": {
    ...overrides["servant.mechaeli.skill.sc-mechaeli-1"],
    activation: "phase",
    windows: ["action", "combat"],
    limit: "twice-per-round",
    standardAppend: true,
    hasReversalEffect: true,
    requiresActiveCard: true,
    handlerId: "core.move-later-seat-opponent",
    supportLevel: "FULL",
    abilities: [
      {
        id: "bang",
        name: "砰！",
        activation: "phase",
        windows: ["action", "combat"],
        limit: "twice-per-round",
        handlerId: "core.move-later-seat-opponent",
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "append-play-permission",
          kind: "passive",
          printedClause: "你可以追加打出此牌。",
          execution: { mode: "automatic" },
        },
        {
          id: "bang",
          kind: "phase_action",
          printedClause: "砰！-行动阶段反转：或战斗阶段：将一名与你位于同一战场且其回合顺位在你之后的对手沿箭头移动一个地点。你每回合可以使用砰！两次。",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.move-later-seat-opponent" },
        },
      ],
      evidence: [
        {
          kind: "development-image",
          document: "Fate_Domination-开发版",
          locator: "servant.mechaeli/机械伊丽亲",
        },
        {
          kind: "chm",
          document: "FD全卡图鉴V2.0.chm",
          locator: "从者/他人格/英文版/机械伊丽亲.htm",
        },
      ],
      verification: { status: "scenario-tested" },
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  // Canonical promotion after structured batch 011: that batch is historical
  // migration data and must not overwrite the now-executable Saint's Number.
  "servant.gawain.skill.sc-gawain-2": {
    ...overrides["servant.gawain.skill.sc-gawain-2"],
    activation: "phase",
    windows: ["combat"],
    passiveEventTypes: ["event.revealed"],
    requiresActiveCard: true,
    handlerId: "core.gawain-saint-number",
    supportLevel: "FULL",
    abilities: [
      {
        id: "challenge",
        name: "挑战",
        activation: "passive",
        windows: [],
        handlerId: "core.gawain-saint-number",
        requiresActiveCard: true,
      },
      {
        id: "nightless-charm",
        name: "不夜的魅力",
        activation: "phase",
        windows: ["combat"],
        handlerId: "core.gawain-saint-number",
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "challenge",
          kind: "passive",
          printedClause: "挑战-被动：当一张事件牌被展示后，你可以弃置一张与其提到的属性对应的手牌。若你如此做，被【挑战】的事件牌获得获得+3战果。",
          execution: { mode: "automatic", handlerId: "core.gawain-saint-number" },
        },
        {
          id: "nightless-charm",
          kind: "phase_action",
          printedClause: "不夜的魅力-战斗阶段：如果你位于被【挑战】事件牌的战斗中，或你支付3点魔力：将你所有基础威力为3的攻击的基础威力×3。",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.gawain-saint-number" },
        },
      ],
      evidence: [
        {
          kind: "development-image",
          document: "Fate_Domination-开发版",
          locator: "servant.gawain/高文",
        },
        {
          kind: "chm",
          document: "FD全卡图鉴V2.0.chm",
          locator: "从者/剑士/英文版/高文.htm",
        },
      ],
      verification: { status: "scenario-tested" },
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  // Canonical promotion after structured batch 013. Emperor Privilege is an
  // optional preparation action whose choice is serialized by the rules core.
  "servant.nero.skill.sc-nero-3": {
    ...overrides["servant.nero.skill.sc-nero-3"],
    activation: "phase",
    windows: ["preparation"],
    abilityCost: 2,
    requiresActiveCard: false,
    handlerId: "core.nero-emperor-privilege",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "emperor-privilege-position",
          kind: "phase_action",
          printedClause: "准备阶段/被动：你可以花费2魔力选择在本轮将自己的玩家顺位调至第一或最后一位，这不会影响其他玩家的行动顺序。",
          activation: { phase: "preparation" },
          execution: { mode: "automatic", handlerId: "core.nero-emperor-privilege" },
        },
      ],
      evidence: [
        {
          kind: "development-image",
          document: "Fate_Domination-开发版",
          locator: "servant.nero/尼禄·克劳狄乌斯",
        },
        {
          kind: "chm",
          document: "FD全卡图鉴V2.0.chm",
          locator: "从者/剑士/英文版/尼禄·克劳狄乌斯.htm",
        },
      ],
      verification: { status: "scenario-tested" },
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.shakespeare.skill.sc-shakespeare-2": {
    ...overrides["servant.shakespeare.skill.sc-shakespeare-2"],
    activation: "phase",
    windows: ["action"],
    handlerId: "core.unlock-owner-ascension",
    supportLevel: "FULL",
    abilities: [
      {
        id: "unlock-master-ascension",
        name: "角色颠倒",
        activation: "phase",
        windows: ["action"],
        handlerId: "core.unlock-owner-ascension",
        requiresActiveCard: false,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "unlock-master-ascension",
          kind: "phase_action",
          printedClause: "角色颠倒-被动/行动阶段：如果莎士比亚是你的从者，解锁你的【升华技】。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.unlock-owner-ascension" },
        },
        {
          id: "append-opening-night",
          kind: "passive",
          printedClause: "被动：你可以追加打出【开演之时已至，此处应有雷鸣般的喝彩】。",
          execution: { mode: "automatic" },
        },
      ],
      evidence: [
        {
          kind: "fqa",
          document: "Fate_Domination FQA.docx",
          locator: "paragraph:168",
        },
      ],
    },
  },
  "servant.shakespeare.skill.sc-shakespeare-3": {
    ...overrides["servant.shakespeare.skill.sc-shakespeare-3"],
    standardAppend: true,
    standardAppendRequiresOwnedSkillId: "servant.shakespeare.skill.sc-shakespeare-2",
  },
  "master.dan.skill.ascension": {
    ...overrides["master.dan.skill.ascension"],
    activation: "phase",
    windows: ["action"],
    initiallyOwned: false,
    tags: ["ascension"],
    handlerId: "core.attached-supply-append",
    passiveEventTypes: ["card.played"],
    attachedSupplyAppend: {
      definitionIds: [
        "card.cardpreparation",
        "card.cardpreparation",
        "card.cardpreparation",
        "card.cardsurveil",
        "card.cardsurveil",
      ],
      drawAfterAppend: 1,
      sourceEvent: "card.played",
    },
    supportLevel: "FULL",
    abilities: [
      {
        id: "append-supplied-basic",
        name: "五朔节骑士",
        activation: "phase",
        windows: ["action"],
        handlerId: "core.attached-supply-append",
        requiresActiveCard: false,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "seed-supplied-basics",
          kind: "passive",
          printedClause: "从游戏外将3张远隔操作和2张急行放置于此牌上。",
          execution: { mode: "automatic", handlerId: "core.attached-supply-append" },
        },
        {
          id: "append-supplied-basic",
          kind: "phase_action",
          printedClause: "每回合你至多可将其中的一张牌追加打出（回合结束时该牌进入你的弃牌堆）。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.attached-supply-append" },
        },
      ],
    },
  },
  "master.rin.skill.s1": {
    ...overrides["master.rin.skill.s1"],
    activation: "passive",
    handlerId: "core.rin-gem-magic",
    passiveEventTypes: ["game.started"],
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "gain-ten-gems",
          kind: "passive",
          printedClause: "游戏开始时，你获得10枚【宝石】。",
          execution: { mode: "automatic", handlerId: "core.rin-gem-magic" },
        },
        {
          id: "climax-repeat-options",
          kind: "passive",
          printedClause: "高潮阶段时你可以在【宝石】上选择相同的选项，每个选项至多3次(共计9次)。",
          execution: { mode: "automatic", handlerId: "core.rin-gem" },
        },
      ],
    },
  },
  "master.rin.skill.s2": {
    ...overrides["master.rin.skill.s2"],
    activation: "passive",
    windows: ["combat"],
    handlerId: "core.rin-command-seal-duty",
    passiveEventTypes: ["combat.ending", "round.ended"],
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "first-round-command-seal-duty",
          kind: "passive",
          printedClause: "否则于该回合结束失去一枚令咒。",
          execution: { mode: "automatic", handlerId: "core.rin-command-seal-duty" },
        },
        {
          id: "mana-command-seal-recoil",
          kind: "passive",
          printedClause: "若你以该令咒获得了魔力，战斗阶段结束后，你失去4点魔力。",
          execution: { mode: "automatic", handlerId: "core.rin-command-seal-duty" },
        },
      ],
    },
  },
  "master.rin.skill.s3": {
    ...overrides["master.rin.skill.s3"],
    activation: "phase",
    windows: ["action"],
    suppressInferredLimit: true,
    handlerId: "core.rin-gem",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "gem-option",
          printedClause: "<每局游戏限一次>\n行动阶段：选择一项本回合没有选择过的选项：\n-获得1点魔力。\n-打出一张游戏外的【阴炁弹】。\n-弃置1-3张牌，然后抽取相同数量的牌。",
          kind: "phase_action",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.rin-gem" },
          effects: [
            { type: "choose_one", options: [
              { id: "gain-mana", label: "-获得1点魔力。" },
              { id: "play-yinqi", label: "-打出一张游戏外的【阴炁弹】。" },
              { id: "discard-draw", label: "-弃置1-3张牌，然后抽取相同数量的牌。" },
            ] },
          ],
        },
      ],
    },
  },
  "master.irisviel.skill.ascension": {
    ...overrides["master.irisviel.skill.ascension"],
    activation: "phase",
    windows: ["action", "combat"],
    steps: ["player-window"],
    initiallyOwned: false,
    tags: ["ascension"],
    handlerId: "core.active-attack-lifecycle-boost",
    supportLevel: "FULL",
    requiresActiveCard: true,
    activeAttackLifecycleBoost: {
      residualAbilityId: "keep-basic-active",
      boostAbilityId: "magic-attack-boost",
      residualRoundOffset: 1,
      boostAttribute: "魔术",
      boostPower: 1,
    },
    abilities: [
      {
        id: "keep-basic-active",
        name: "生命赋予",
        activation: "phase",
        windows: ["action"],
        steps: ["player-window"],
        uniqueGroup: "master.irisviel.life-giving.choice",
        handlerId: "core.active-attack-lifecycle-boost",
        requiresActiveCard: true,
      },
      {
        id: "magic-attack-boost",
        name: "生命赋予",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        uniqueGroup: "master.irisviel.life-giving.choice",
        handlerId: "core.active-attack-lifecycle-boost",
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "life-giving-choice-limit",
          kind: "phase_action",
          printedClause: "你每回合只能使用此攻击的其中一项能力。",
          execution: { mode: "automatic", handlerId: "core.active-attack-lifecycle-boost" },
        },
        {
          id: "keep-basic-active",
          kind: "phase_action",
          printedClause: "行动阶段：本回合的一张基础攻击可以保持激活至下回合结束。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.active-attack-lifecycle-boost" },
        },
        {
          id: "magic-attack-boost",
          kind: "phase_action",
          printedClause: "战斗阶段：你的攻击获得魔术属性并且威力+1。",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.active-attack-lifecycle-boost" },
        },
      ],
    },
  },
  "master.rin.skill.ascension": {
    ...overrides["master.rin.skill.ascension"],
    activation: "phase",
    windows: ["action"],
    initiallyOwned: false,
    tags: ["ascension"],
    handlerId: "core.rin-jewel-sword",
    passiveEventTypes: ["combat.ending"],
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "magic-basic-yinqi-power",
          kind: "passive",
          printedClause: "被动：你的魔术基础牌和【阴炁弹】的威力+2。",
          execution: { mode: "automatic", handlerId: "core.rin-jewel-sword" },
        },
        {
          id: "collect-spent-mana",
          kind: "phase_action",
          printedClause: "行动阶段：获得本回合所有玩家花费的魔力。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.rin-jewel-sword" },
        },
        {
          id: "exile-after-combat",
          kind: "passive",
          printedClause: "战斗结束后，将此牌移除游戏。",
          execution: { mode: "automatic", handlerId: "core.rin-jewel-sword" },
        },
      ],
    },
  },
  "servant.helena.skill.sc-helena-2": {
    activation: "passive",
    windows: [],
    passiveEventTypes: ["card.played", "servant.true-name-revealed", "combat.resolved"],
    requiresActiveCard: false,
    suppressInferredLimit: true,
    handlerId: "core.helena-search-unknown",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "revelation-reward",
          kind: "passive",
          printedClause: "启示-被动：当一名于本回合明置了技能的对手赢得你所在的战斗时，你获得2点战果。",
          execution: { mode: "automatic", handlerId: "core.helena-search-unknown" },
        },
        {
          id: "all-skills-revealed",
          kind: "passive",
          printedClause: "每局游戏限一次，当游戏内的所有技能均明置后，你获得5点战果。",
          execution: { mode: "automatic", handlerId: "core.helena-search-unknown" },
        },
      ],
    },
  },
  "master.kayneth.skill.s2": {
    activation: "phase",
    windows: ["action"],
    passiveEventTypes: ["game.started"],
    handlerId: "core.kayneth-alchemist",
    supportLevel: "FULL",
    requiresActiveCard: false,
    abilities: [
      {
        id: "alchemist-draw",
        name: "炼金术师",
        activation: "phase",
        windows: ["action"],
        steps: ["player-window"],
        requiresActiveCard: false,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "alchemist-deck",
          kind: "passive",
          printedClause: "游戏开始时，将6张【月灵髓液】洗成一副独立的牌库。",
          execution: { mode: "automatic", handlerId: "core.kayneth-alchemist" },
        },
        {
          id: "alchemist-draw",
          kind: "phase_action",
          printedClause: "行动阶段：从独立牌库抽一张【月灵髓液】。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.kayneth-alchemist" },
        },
      ],
    },
  },
  "master.kayneth.skill.ascension": {
    activation: "passive",
    windows: [],
    initiallyOwned: false,
    passiveEventTypes: ["game.started", "skill.unlocked", "card.entered-attack", "card.drawn"],
    handlerId: "core.kayneth-fluid-dynamics",
    supportLevel: "FULL",
    requiresActiveCard: false,
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "fluid-two-rounds",
          kind: "passive",
          printedClause: "你的所有攻击牌可以残留至下回合结束。当你从从者牌库中抽到【月灵髓液】时，你可以将其展示并再抽一张牌。",
          execution: { mode: "automatic", handlerId: "core.kayneth-fluid-dynamics" },
        },
        {
          id: "fluid-reveal-draw",
          kind: "passive",
          printedClause: "当你从从者牌库中抽到【月灵髓液】时，你可以将其展示并再抽一张牌。",
          execution: { mode: "automatic", handlerId: "core.kayneth-fluid-dynamics" },
        },
      ],
    },
  },
  "servant.mandricardo.skill.sc-mandricardo-1": {
    activation: "phase",
    windows: ["action"],
    passiveEventTypes: ["round.started", "player.victory-points.changed", "combat.ending"],
    handlerId: "core.mandricardo-instant-strike",
    supportLevel: "FULL",
    requiresActiveCard: true,
    abilities: [
      {
        id: "oath-instant-strike",
        name: "顷刻一击",
        activation: "phase",
        windows: ["action"],
        steps: ["player-window"],
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "oath-instant-strike",
          kind: "phase_action",
          printedClause: "【真名解放】\n顷刻一击-行动阶段：+5合计威力，战斗结束后，你的战果数每于本回合超过一名对手，便获得1点战果，之后将此牌移除游戏。若【不带剑的誓言】因此效果被移除，令曼迪卡尔多的【木剑】获得顷刻一击并更改为“战斗阶段：”直至游戏结束。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.mandricardo-instant-strike" },
        },
        {
          id: "oath-after-combat",
          kind: "passive",
          printedClause: "顷刻一击-行动阶段：+5合计威力，战斗结束后，你的战果数每于本回合超过一名对手，便获得1点战果，之后将此牌移除游戏。",
          conditions: [{ type: "event_type_is", eventType: "combat.ending" }],
          execution: { mode: "automatic", handlerId: "core.mandricardo-instant-strike" },
        },
        {
          id: "oath-grant-wooden-sword",
          kind: "passive",
          printedClause: "若【不带剑的誓言】因此效果被移除，令曼迪卡尔多的【木剑】获得顷刻一击并更改为“战斗阶段：”直至游戏结束。",
          conditions: [{ type: "event_type_is", eventType: "combat.ending" }],
          execution: { mode: "automatic", handlerId: "core.mandricardo-instant-strike" },
        },
      ],
    },
  },
  "servant.mandricardo.skill.sc-mandricardo-2": {
    activation: "phase",
    windows: ["combat"],
    handlerId: "core.mandricardo-instant-strike",
    supportLevel: "FULL",
    requiresActiveCard: true,
    abilities: [
      {
        id: "wooden-sword-instant-strike",
        name: "木剑",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "wooden-sword-instant-strike",
          kind: "phase_action",
          printedClause: "（注：此牌卡面下方无额外文字描述）",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.mandricardo-instant-strike" },
        },
      ],
    },
  },
  "servant.scathach.skill.sc-scathach-1": {
    activation: "phase",
    windows: ["action", "combat"],
    passiveEventTypes: ["card.played"],
    handlerId: "core.scathach-wisdom",
    supportLevel: "FULL",
    requiresActiveCard: true,
    abilities: [
      {
        id: "wisdom-zero-magic",
        name: "魔术归零",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        requiresActiveCard: true,
      },
      {
        id: "wisdom-move-anywhere",
        name: "任意移动",
        activation: "phase",
        windows: ["action"],
        steps: ["player-window"],
        requiresActiveCard: true,
      },
      {
        id: "wisdom-strict-second",
        name: "魔境的智慧",
        activation: "phase",
        windows: ["combat"],
        steps: ["post-power-response"],
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "wisdom-select-mode",
          kind: "play_trigger",
          printedClause: "打出时：选择以下一项为本回合此牌的效果：",
          execution: { mode: "automatic", handlerId: "core.scathach-wisdom" },
        },
        {
          id: "wisdom-zero-magic",
          kind: "phase_action",
          printedClause: "-战斗阶段：将所有交战对手的魔术攻击的威力变为0。",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.scathach-wisdom" },
        },
        {
          id: "wisdom-move-anywhere",
          kind: "phase_action",
          printedClause: "-行动阶段：移动至任意地点。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.scathach-wisdom" },
        },
        {
          id: "wisdom-strict-second",
          kind: "phase_action",
          printedClause: "-战斗阶段：战力结算后，如果与你位于同一战场的对手有两名及以上，威力高于你的玩家中不包含战力不同的，使他们【败北】。",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.scathach-wisdom" },
        },
      ],
    },
  },
  "servant.gil.skill.sc-gil-2": {
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    variablePlayAttributeChoice: {
      allowedAttributes: ["力量", "迅捷", "魔术", "宝具"],
      manaPerAttribute: 1,
    },
    doubleDeploymentBonus: true,
    handlerId: "core.double-deployment-bonus",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "variable-play-attribute-choice",
          kind: "play_trigger",
          printedClause: "打出时：自由选择X（作为魔力消耗）。此牌获得X种非特殊属性（由你选择）。",
          execution: { mode: "automatic", handlerId: "core.card-play" },
        },
        {
          id: "double-deployment-bonus",
          kind: "phase_action",
          printedClause: "行动阶段：翻倍你的地利。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.double-deployment-bonus" },
        },
      ],
    },
  },});
delete overrides["master.rin.skill.s3"].limit;
// Authoring JSON is the final source of truth for migrated V2 cards. Generated
// compatibility overrides intentionally apply last so older migration batches
// cannot overwrite confirmed canonical rules.
for (const [id, definition] of Object.entries(authoringGeneratedOverrides)) {
  overrides[id] = { ...overrides[id], ...definition };
}

Object.assign(overrides, {
  "servant.raikou.skill.sc-raikou-1": {
    ...overrides["servant.raikou.skill.sc-raikou-1"],
    activation: "phase",
    windows: ["outpost"],
    requiresActiveCard: false,
    revealsTrueNameOnSkillUse: true,
    limit: "twice-per-game",
    handlerId: "core.raikou-ox-king",
    supportLevel: "FULL",
    abilities: [{
      id: "ox-king-storm-call",
      name: "牛王招雷·天网恢恢",
      activation: "phase",
      windows: ["outpost"],
      requiresActiveCard: false,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "ox-king-storm-call",
        kind: "phase_action",
        printedClause: "【真名解放】<每局游戏限两次>被动/前哨阶段：本回合你可追加打出至多2张攻击。你可不用支付其中一张牌的魔力消耗。",
        activation: { phase: "outpost" },
        execution: { mode: "handler", handlerId: "core.raikou-ox-king" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.raikou.skill.sc-raikou-2": {
    ...overrides["servant.raikou.skill.sc-raikou-2"],
    activation: "play",
    situationForbiddenAttributeCostReduction: { attribute: "宝具", amount: 6 },
    otherPlayersIgnoreSituationEffects: true,
    handlerId: "core.card-play",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "situation-immunity",
          kind: "passive",
          printedClause: "其他玩家不受局势牌影响。",
          execution: { mode: "automatic" },
        },
        {
          id: "noble-phantasm-ban-cost-reduction",
          kind: "passive",
          printedClause: "被动：若当前局势牌禁止使用宝具，则此牌的魔力消耗-6。",
          execution: { mode: "automatic" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.astraea.skill.sc-astraea-2": {
    ...overrides["servant.astraea.skill.sc-astraea-2"],
    activation: "phase",
    windows: ["action", "combat"],
    handlerId: "core.astraea-return-order",
    supportLevel: "FULL",
    abilities: [
      { id: "order-self-power", name: "秩序归还·自阵", activation: "phase", windows: ["action"], steps: ["player-window"], limit: "once-per-round", requiresActiveCard: false },
      { id: "order-opponent-power", name: "秩序归还·敌阵", activation: "phase", windows: ["combat"], steps: ["player-window"], limit: "once-per-round", requiresActiveCard: true },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "order-self-power",
          kind: "phase_action",
          printedClause: "被动/行动阶段：若你的攻击中不包含被【制约】的属性，合计威力+2。",
          activation: { phase: "action", step: "player-window" },
          execution: { mode: "handler", handlerId: "core.astraea-return-order" },
        },
        {
          id: "order-opponent-power",
          kind: "phase_action",
          printedClause: "战斗阶段：若与你战斗的对手控制的攻击有两张及以上且其中不包含至少一种相同属性，则其合计威力-4。",
          activation: { phase: "combat", step: "player-window" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.astraea-return-order" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.astraea.skill.sc-astraea-3": {
    ...overrides["servant.astraea.skill.sc-astraea-3"],
    activation: "phase",
    windows: ["outpost"],
    handlerId: "core.astraea-scale-protection",
    supportLevel: "FULL",
    passiveEventTypes: ["card.played"],
    abilities: [{ id: "scale-constrain", name: "制约", activation: "phase", windows: ["outpost"], steps: ["player-window"], limit: "once-per-round", requiresActiveCard: false }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "scale-constrain",
          kind: "phase_action",
          printedClause: "被动/前哨阶段：弃置一张牌，【制约】它的一种属性。",
          activation: { phase: "outpost", step: "player-window" },
          execution: { mode: "handler", handlerId: "core.astraea-scale-protection" },
        },
        {
          id: "condemned-cost",
          kind: "passive",
          printedClause: "被【谴责】的玩家从手牌和技能区使用含【制约】属性的攻击时消耗+3（最多+12）。",
          execution: { mode: "handler", handlerId: "core.astraea-scale-protection" },
        },
        {
          id: "condemn-on-use",
          kind: "passive",
          printedClause: "你的对手使用含【制约】属性卡牌即视为被【谴责】，直到他们的【谴责】被移除。",
          execution: { mode: "handler", handlerId: "core.astraea-scale-protection" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.euryale.skill.sc-euryale-2": {
    ...overrides["servant.euryale.skill.sc-euryale-2"],
    activation: "phase",
    windows: ["outpost"],
    requiresActiveCard: false,
    passiveEventTypes: ["phase.transitioned"],
    handlerId: "core.euryale-siren-song",
    supportLevel: "FULL",
    abilities: [{
      id: "siren-song-duet",
      name: "塞壬之歌·合奏",
      activation: "phase",
      windows: ["outpost"],
      steps: ["player-window"],
      requiresActiveCard: false,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "charming-voice",
          kind: "passive",
          printedClause: "魅惑的美声-与你位于同一地点的玩家手牌和技能区的攻击魔力消耗-1。",
          conditions: [{ type: "source_owned" }],
          execution: { mode: "automatic" },
          ruleModifiers: [{
            id: "same-location-attack-cost-minus-one",
            operation: "subtract",
            rule: "card_cost",
            scope: {
              subject: "players_at_source_location",
              cards: { zones: ["hand", "master-skills", "servant-skills"], attack: true },
            },
            value: 1,
            lifecycle: { duration: "permanent" },
          }],
        },
        {
          id: "siren-song-duet",
          kind: "phase_action",
          printedClause: "被动/前哨阶段：无视回合顺位限制打出此牌与【单独行动】并将其激活能力更改为：“行动阶段：你的行动阶段结束时，若你位于战场，你获得3点战果。",
          activation: { phase: "outpost", step: "player-window" },
          execution: { mode: "handler", handlerId: "core.euryale-siren-song" },
        },
        {
          id: "deferred-independent-action",
          kind: "passive",
          printedClause: "被动/前哨阶段：无视回合顺位限制打出此牌与【单独行动】并将其激活能力更改为：“行动阶段：你的行动阶段结束时，若你位于战场，你获得3点战果。",
          execution: { mode: "handler", handlerId: "core.euryale-siren-song" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.euryale.skill.sc-euryale-3": {
    ...overrides["servant.euryale.skill.sc-euryale-3"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    handlerId: "core.euryale-eye",
    supportLevel: "FULL",
    abilities: [{
      id: "eye-reveal-luck",
      name: "女神的视线",
      activation: "phase",
      windows: ["action"],
      steps: ["player-window"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "eye-reveal-luck",
        kind: "phase_action",
        printedClause: "行动阶段：展示所有与你位于同一地点的玩家的手牌，你可以打出一张因此效果展示的【幸运】（被打出的【幸运】进入原拥有者的弃牌堆）。",
        activation: { phase: "action", step: "player-window" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.euryale-eye" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.arjuna-archer.skill.sc-arjuna-archer-1": {
    ...overrides["servant.arjuna-archer.skill.sc-arjuna-archer-1"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    handlerId: "core.arjuna-endowed-hero",
    supportLevel: "FULL",
    abilities: [{ id: "endowed-search", name: "天授的英雄", activation: "phase", windows: ["action"], abilityCost: 1, requiresActiveCard: false }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "endowed-search",
        kind: "phase_action",
        printedClause: "被动/行动阶段：花费1点魔力，选择牌库或弃牌堆中的一张基础牌加入手牌。你可以额外花费2点魔力将其打出（支付魔力消耗）。",
        activation: { phase: "action" },
        execution: { mode: "handler", handlerId: "core.arjuna-endowed-hero" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.arjuna-archer.skill.sc-arjuna-archer-2": {
    ...overrides["servant.arjuna-archer.skill.sc-arjuna-archer-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    passiveEventTypes: ["card.played"],
    handlerId: "core.arjuna-agni-gandiva",
    supportLevel: "FULL",
    abilities: [{ id: "prophetic-shot", name: "预言之射", activation: "phase", windows: ["action"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "prophetic-shot",
          kind: "phase_action",
          printedClause: "预言之射-行动阶段：弃置0~3张手牌。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.arjuna-agni-gandiva" },
        },
        {
          id: "prophetic-shot-reaction",
          kind: "passive",
          printedClause: "在你使用此效果后，当一名对手打出了印刷威力等于你手牌印刷威力之和的攻击后，你可以弃置所有手牌（至少一张）并令其【败北】。",
          execution: { mode: "handler", handlerId: "core.arjuna-agni-gandiva" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.muramasa.skill.sc-muramasa-1": {
    ...overrides["servant.muramasa.skill.sc-muramasa-1"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    basePower: 0,
    basePowerFormula: { type: "metric", metric: "player_flag_number", key: "muramasaSwordTrialExiledPower" },
    singleCardPlay: true,
    roundExclusivePlay: true,
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "round-exclusive-play",
          kind: "passive",
          printedClause: "此牌不能同其他牌一起打出，是你本回合打出唯一的一张牌。",
          execution: { mode: "automatic" },
        },
        {
          id: "sword-trial-total-power",
          kind: "passive",
          printedClause: "X等于你本局游戏中通过【试斩】移除的所有牌的基本威力之和。",
          execution: { mode: "automatic" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.muramasa.skill.sc-muramasa-2": {
    ...overrides["servant.muramasa.skill.sc-muramasa-2"],
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: true,
    handlerId: "core.muramasa-imperfect-edge",
    supportLevel: "FULL",
    abilities: [
      { id: "sword-trial", name: "试斩", activation: "phase", windows: ["combat"], requiresActiveCard: true },
      { id: "alter-draw-discard", name: "反转", activation: "phase", windows: ["action"], requiresActiveCard: true },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "sword-trial",
          kind: "phase_action",
          printedClause: "战斗阶段：将至多3张手牌移除游戏，此牌获得移除牌基本威力之和的威力。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.muramasa-imperfect-edge" },
        },
        {
          id: "alter-draw-discard",
          kind: "phase_action",
          printedClause: "反转/行动阶段：抽4张牌，弃3张牌。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.muramasa-imperfect-edge" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.constantine.skill.sc-constantine-2": {
    ...overrides["servant.constantine.skill.sc-constantine-2"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "empire-to-dust",
        kind: "passive",
        printedClause: "尽归尘土-被动：当你即将被淘汰时，改为将此牌移除游戏并令你于下回合获得的战果翻倍。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "automatic" },
        ruleModifiers: [{
          id: "empire-elimination-replacement",
          operation: "replace",
          rule: "elimination",
          scope: { subject: "controller", replacement: "remove_source_card", nextRoundVictoryPointGainMultiplier: 2 },
          lifecycle: { duration: "permanent" },
        }],
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.constantine.skill.sc-constantine-3": {
    ...overrides["servant.constantine.skill.sc-constantine-3"],
    activation: "passive",
    windows: [],
    requiresActiveCard: true,
    passiveEventTypes: ["card.drawn", "combat.resolved"],
    handlerId: "core.constantine-triple-walls",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "faith-wall",
          kind: "passive",
          printedClause: "信仰之墙-被动：每回合限一次，当你抽到一张基础攻击时，你可以花费3点魔力将其展示并令其威力翻倍（于在场时）。",
          conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "card.drawn" }],
          execution: { mode: "handler", handlerId: "core.constantine-triple-walls" },
        },
        {
          id: "destined-defeat",
          kind: "passive",
          printedClause: "命定之败-战斗阶段：若你战败，获得3点战果。",
          conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "combat.resolved" }],
          execution: { mode: "handler", handlerId: "core.constantine-triple-walls" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.tesla.skill.sc-tesla-1": {
    ...overrides["servant.tesla.skill.sc-tesla-1"],
    activation: "residual",
    windows: [],
    requiresActiveCard: true,
    cardResidual: true,
    passiveEventTypes: ["player.mana.spent", "player.mana-gain-overflow", "combat.ending"],
    handlerId: "core.tesla-lightning-hand",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "lightning-hand-mana",
          kind: "residual",
          printedClause: "残留：与你位于同一地点的其他玩家花费2点或更多的魔力时，你获得2点魔力。",
          conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "player.mana.spent" }],
          execution: { mode: "handler", handlerId: "core.tesla-lightning-hand" },
        },
        {
          id: "lightning-hand-overflow",
          kind: "residual",
          printedClause: "每当你获得魔力超过上限时，合计威力+5，然后于战斗阶段结束时关闭此牌。",
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.tesla-lightning-hand" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.tesla.skill.sc-tesla-2": {
    ...overrides["servant.tesla.skill.sc-tesla-2"],
    activation: "passive",
    windows: [],
    requiresActiveCard: true,
    passiveEventTypes: ["card.played", "player.mana-gain-overflow"],
    handlerId: "core.tesla-lightning-descent",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "overload",
          kind: "passive",
          printedClause: "过载-被动：当一名位于你所在战场的对手获得的魔力超过其上限时，令其【败北】。",
          conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "player.mana-gain-overflow" }],
          execution: { mode: "handler", handlerId: "core.tesla-lightning-descent" },
        },
        {
          id: "descent-play-loss",
          kind: "play_trigger",
          printedClause: "打出时：失去你的所有魔力，本回合你每失去一点魔力便+1合计威力。",
          conditions: [{ type: "event_type_is", eventType: "card.played" }],
          execution: { mode: "handler", handlerId: "core.tesla-lightning-descent" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.passionlip.skill.sc-passionlip-2": {
    ...overrides["servant.passionlip.skill.sc-passionlip-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    hasReversalEffect: true,
    handlerId: "core.passionlip-masochism",
    supportLevel: "FULL",
    abilities: [{
      id: "masochistic-nature",
      name: "受虐体制",
      activation: "phase",
      windows: ["combat"],
      handlerId: "core.passionlip-masochism",
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "masochistic-nature",
        kind: "phase_action",
        printedClause: "战斗阶段：你的战斗中每有一张由对手控制的，威力高于你最高威力攻击的攻击，你获得1点战果。反转：并令你于下回合+3合计威力。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.passionlip-masochism" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.passionlip.skill.sc-passionlip-3": {
    ...overrides["servant.passionlip.skill.sc-passionlip-3"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    hasReversalEffect: true,
    handlerId: "core.passionlip-durga-armor",
    supportLevel: "FULL",
    abilities: [{
      id: "durga-armor",
      name: "杜尔迦之甲",
      activation: "phase",
      windows: ["combat"],
      handlerId: "core.passionlip-durga-armor",
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "durga-armor",
        kind: "phase_action",
        printedClause: "战斗阶段：将你所在战斗中的所有攻击威力减少至9。反转/战斗阶段：【真名解放】每名玩家选择一张他的攻击牌，将你的战斗中的所有未被选择的攻击威力减少至0。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.passionlip-durga-armor" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.saitou.skill.sc-saitou-2": {
    ...overrides["servant.saitou.skill.sc-saitou-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    revealsTrueNameOnSkillUse: true,
    handlerId: "core.saitou-flag-of-sincerity",
    supportLevel: "FULL",
    abilities: [{
      id: "rally-multiattack",
      name: "诚之旗",
      activation: "phase",
      windows: ["action"],
      handlerId: "core.saitou-flag-of-sincerity",
      requiresActiveCard: false,
      revealsTrueNameOnSkillUse: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "rally-multiattack",
        kind: "phase_action",
        printedClause: "【真名解放】\n行动阶段：抽2张牌并展示你的手牌。免费正面打出所有因此效果展示的基础力量和敏捷攻击，然后关闭你所有的基础力量或敏捷攻击。",
        activation: { phase: "action" },
        execution: { mode: "handler", handlerId: "core.saitou-flag-of-sincerity" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.saitou.skill.sc-saitou-3": {
    ...overrides["servant.saitou.skill.sc-saitou-3"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: false,
    handlerId: "core.saitou-formlessness",
    supportLevel: "FULL",
    abilities: [
      {
        id: "iai-agility",
        name: "拔刀自如",
        activation: "phase",
        windows: ["combat"],
        handlerId: "core.saitou-formlessness",
        requiresActiveCard: false,
      },
      {
        id: "iai-strength",
        name: "拔刀自如",
        activation: "phase",
        windows: ["combat"],
        abilityCost: 3,
        handlerId: "core.saitou-formlessness",
        requiresActiveCard: false,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "iai-agility",
          kind: "phase_action",
          printedClause: "拔刀自如-被动/战斗阶段：若你控制基础敏捷攻击，将所有未与你控制至少一张与你相同基础敏捷攻击的交战对手的敏捷攻击威力变为0。",
          activation: { phase: "combat" },
          execution: { mode: "handler", handlerId: "core.saitou-formlessness" },
        },
        {
          id: "iai-strength",
          kind: "phase_action",
          printedClause: "你可以支付3点魔力，将拔刀自如中的“敏捷”更改为“力量”，重复发动一次本效果（即使未发动过）。",
          activation: { phase: "combat" },
          cost: { type: "mana", amount: 3 },
          execution: { mode: "handler", handlerId: "core.saitou-formlessness" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.okita-alt.skill.sc-okita-alt-2": {
    ...overrides["servant.okita-alt.skill.sc-okita-alt-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    handlerId: "core.okita-alt-boundless",
    supportLevel: "FULL",
    abilities: [{
      id: "boundless-chain",
      name: "不断",
      activation: "phase",
      windows: ["action"],
      handlerId: "core.okita-alt-boundless",
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "boundless-chain",
        kind: "phase_action",
        printedClause: "不断-行动阶段：抽一张牌并将其加入攻击，然后重复此效果。当你未抽到与你激活的攻击具有相同属性的基础攻击时，改为将被抽取的牌弃置并立即停止不断。你每以此法将一张牌加入攻击，便失去1点魔力。若你的魔力因此效果被扣减至0，你【败北】并立即停止不断。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.okita-alt-boundless" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.okita-alt.skill.sc-okita-alt-3": {
    ...overrides["servant.okita-alt.skill.sc-okita-alt-3"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    requiresEightMana: false,
    hasReversalEffect: true,
    handlerId: "core.okita-alt-rengoku",
    supportLevel: "FULL",
    abilities: [
      {
        id: "rengoku-return-basics",
        name: "绝剑·无穹三段",
        activation: "phase",
        windows: ["action"],
        handlerId: "core.okita-alt-rengoku",
        requiresActiveCard: true,
      },
      {
        id: "rengoku-alter-purgatory",
        name: "炼狱·反转",
        activation: "phase",
        windows: ["action"],
        handlerId: "core.okita-alt-rengoku",
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "rengoku-return-basics",
          kind: "phase_action",
          printedClause: "行动阶段：将两张你弃牌堆中的基础攻击洗回牌库。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.okita-alt-rengoku" },
        },
        {
          id: "rengoku-alter-purgatory",
          kind: "phase_action",
          printedClause: "炼狱-反转/行动阶段：将你弃牌堆的所有牌移除游戏，若你以此法移除了2张及以上的牌，此牌+8威力。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.okita-alt-rengoku" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.mordred.skill.sc-mordred-1": {
    ...overrides["servant.mordred.skill.sc-mordred-1"],
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: true,
    handlerId: "core.mordred-hidden-helm",
    supportLevel: "FULL",
    abilities: [
      {
        id: "hide-true-name",
        name: "隐藏真名",
        activation: "phase",
        windows: ["action"],
        handlerId: "core.mordred-hidden-helm",
        requiresActiveCard: true,
      },
      {
        id: "combat-play",
        name: "隐藏不贞的头盔",
        activation: "phase",
        windows: ["combat"],
        handlerId: "core.mordred-hidden-helm",
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "hide-true-name",
          kind: "phase_action",
          printedClause: "行动阶段：隐藏你的从者真名。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.mordred-hidden-helm" },
        },
        {
          id: "combat-play",
          kind: "phase_action",
          printedClause: "战斗阶段：你可以关闭本牌并打出另一张牌，支付其花费并使用其行动阶段的效果。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.mordred-hidden-helm" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.mordred.skill.sc-mordred-2": {
    ...overrides["servant.mordred.skill.sc-mordred-2"],
    activation: "phase",
    windows: ["action"],
    passiveEventTypes: ["combat.resolved"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.mordred-clarent",
    supportLevel: "FULL",
    abilities: [{
      id: "mana-burst",
      name: "魔力放出",
      activation: "phase",
      windows: ["action"],
      handlerId: "core.mordred-clarent",
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "mana-burst",
          kind: "phase_action",
          printedClause: "魔力放出-行动阶段：花费X点魔力，此牌获得+2X威力（X至多为10）。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.mordred-clarent" },
        },
        {
          id: "mana-burst-refund",
          kind: "passive",
          printedClause: "若你战败，恢复因魔力放出消耗的魔力的一半（向上取整），该恢复效果不能被任何方式阻止。",
          conditions: [{ type: "event_type_is", eventType: "combat.resolved" }, { type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.mordred-clarent" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.orion.skill.sc-orion-1": {
    ...overrides["servant.orion.skill.sc-orion-1"],
    activation: "optional-trigger",
    windows: ["action"],
    passiveEventTypes: ["card.played", "attack.committed"],
    requiresActiveCard: false,
    handlerId: "core.orion-hunter-moon",
    supportLevel: "FULL",
    abilities: [{
      id: "hunter-empower",
      name: "触及月亮的猎人",
      activation: "optional-trigger",
      windows: ["action"],
      handlerId: "core.orion-hunter-moon",
      requiresActiveCard: false,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "hunter-empower",
          kind: "phase_action",
          printedClause: "被动/行动阶段：花费4点魔力并随机弃置一张手牌，你发动此效果后打出的基础攻击+2威力。",
          activation: { phase: "action" },
          execution: { mode: "handler", handlerId: "core.orion-hunter-moon" },
        },
        {
          id: "hunter-paired-attribute",
          kind: "passive",
          printedClause: "同时，若你在常规打牌时打出了至少两张具有相同属性的攻击，+3合计威力。",
          conditions: [{ type: "event_type_is", eventType: "attack.committed" }],
          execution: { mode: "handler", handlerId: "core.orion-hunter-moon" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.orion.skill.sc-orion-2": {
    ...overrides["servant.orion.skill.sc-orion-2"],
    activation: "phase",
    windows: ["action"],
    passiveEventTypes: ["combat.ending"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.orion-sea-god-blessing",
    supportLevel: "FULL",
    abilities: [{
      id: "free-love",
      name: "无偿之爱",
      activation: "phase",
      windows: ["action"],
      handlerId: "core.orion-sea-god-blessing",
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "free-love",
          kind: "phase_action",
          printedClause: "无偿之爱-行动阶段：从你的手牌或牌库将1张【幸运】基础牌加入攻击并令其获得“残留”和“唯一：战斗结束后，若你战败或【败北】，关闭此牌。”直至被关闭。你可以额外花费4点魔力再使用一次此效果。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.orion-sea-god-blessing" },
        },
        {
          id: "free-love-close",
          kind: "passive",
          printedClause: "【真名解放】\n无偿之爱-行动阶段：从你的手牌或牌库将1张【幸运】基础牌加入攻击并令其获得“残留”和“唯一：战斗结束后，若你战败或【败北】，关闭此牌。”直至被关闭。你可以额外花费4点魔力再使用一次此效果。",
          conditions: [{ type: "event_type_is", eventType: "combat.ending" }],
          execution: { mode: "handler", handlerId: "core.orion-sea-god-blessing" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.jeanne-alter.skill.sc-jeanne-alter-2": {
    ...overrides["servant.jeanne-alter.skill.sc-jeanne-alter-2"],
    activation: "residual",
    windows: [],
    cardResidual: true,
    passiveEventTypes: ["combat.resolved"],
    requiresActiveCard: true,
    activeOwnedCardAttributeGrant: { targetDefinitionIds: ["card.card-avenger"], attributes: ["力量"] },
    handlerId: "core.jeanne-alter-dragon-witch",
    supportLevel: "FULL",
    abilities: [{
      id: "avenger-march",
      name: "龙之魔女",
      activation: "phase",
      windows: ["action"],
      handlerId: "core.jeanne-alter-dragon-witch",
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "dragon-witch-residual",
          kind: "residual",
          printedClause: "残留：当你战败时关闭此牌。",
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.jeanne-alter-dragon-witch" },
          lifecycle: { duration: "while_active" },
        },
        {
          id: "avenger-march",
          kind: "phase_action",
          printedClause: "行动阶段：关闭一张自己的【复仇者】，沿着箭头移动1或2个地点，与你位于同一战场的对手失去2点战果。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.jeanne-alter-dragon-witch" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.jeanne-alter.skill.sc-jeanne-alter-3": {
    ...overrides["servant.jeanne-alter.skill.sc-jeanne-alter-3"],
    activation: "passive",
    windows: [],
    passiveEventTypes: ["card.entered-attack"],
    requiresActiveCard: false,
    handlerId: "core.jeanne-alter-oblivion-correction",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "oblivion-correction",
        kind: "passive",
        printedClause: "被动：每当一张或更多【幸运】放置入场时，弃置你的手牌然后抽3张牌。将因此弃置的【复仇者】加入攻击。",
        conditions: [{ type: "event_type_is", eventType: "card.entered-attack" }],
        execution: { mode: "handler", handlerId: "core.jeanne-alter-oblivion-correction" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.emiya-alt.skill.sc-emiya-alt-2": {
    ...overrides["servant.emiya-alt.skill.sc-emiya-alt-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    handlerId: "core.emiya-alt-unlimited-blade-works",
    supportLevel: "FULL",
    abilities: [{
      id: "derisive-iron-heart",
      name: "嗤笑铁心",
      activation: "phase",
      windows: ["combat"],
      handlerId: "core.emiya-alt-unlimited-blade-works",
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "derisive-iron-heart",
        kind: "phase_action",
        printedClause: "嗤笑铁心-战斗阶段：选择一种属性和一名你战斗中的玩家，令其展示其弃牌堆。将所有具有选择的属性的牌洗回其牌库，每以此效果洗回一张牌，便令你获得+2合计威力。若因此效果洗回了4张以上的牌，令该玩家【败北】。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.emiya-alt-unlimited-blade-works" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.emiya-alt.skill.sc-emiya-alt-3": {
    ...overrides["servant.emiya-alt.skill.sc-emiya-alt-3"],
    activation: "passive",
    windows: [],
    standardAppend: true,
    passiveEventTypes: ["card.played"],
    requiresActiveCard: false,
    revealsTrueNameOnPlay: true,
    handlerId: "core.emiya-alt-kanshou-bakuya",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "bulletproof-treatment",
        kind: "play_trigger",
        printedClause: "防弹加工-打出此牌需移除你弃牌堆的两张牌，此牌获得因此效果被移除的牌属性至回合结束。",
        conditions: [{ type: "event_type_is", eventType: "card.played" }],
        execution: { mode: "handler", handlerId: "core.emiya-alt-kanshou-bakuya" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.merlin.skill.sc-merlin-1": {
    ...overrides["servant.merlin.skill.sc-merlin-1"],
    activation: "passive",
    windows: [],
    passiveEventTypes: ["game.started"],
    requiresActiveCard: false,
    playerFlags: { actionPlayBeforeMove: true, ignoreEngagement: true },
    handlerId: "core.game-start-rule-flags",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "dreamlike-charisma",
        kind: "passive",
        printedClause: "被动：你在移动之前进行打牌而不是之后。当你移动时，无视交战状态。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.game-start-rule-flags" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.merlin.skill.sc-merlin-2": {
    ...overrides["servant.merlin.skill.sc-merlin-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    handlerId: "core.merlin-flower-sea",
    supportLevel: "FULL",
    abilities: [{
      id: "illusion",
      name: "幻术",
      activation: "phase",
      windows: ["combat"],
      handlerId: "core.merlin-flower-sea",
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "illusion",
        kind: "phase_action",
        printedClause: "自由选择X。若X为0，则失去5点魔力。\n幻术-战斗阶段：将此战场中除此牌以外的所有消耗为X的攻击威力减至0。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }, { type: "at_battlefield" }],
        execution: { mode: "handler", handlerId: "core.merlin-flower-sea" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.valkyrie.skill.sc-valkyrie-1": {
    ...overrides["servant.valkyrie.skill.sc-valkyrie-1"],
    activation: "phase",
    windows: ["outpost"],
    steps: [],
    limit: "once-per-game",
    requiresActiveCard: false,
    revealsTrueNameOnPlay: false,
    revealsTrueNameOnSkillUse: true,
    handlerId: "core.valkyrie-maiden-descent",
    supportLevel: "FULL",
    abilities: [{
      id: "maiden-descent",
      name: "终末幻想·少女降临",
      activation: "phase",
      windows: ["outpost"],
      handlerId: "core.valkyrie-maiden-descent",
      requiresActiveCard: false,
      revealsTrueNameOnSkillUse: true,
      limit: "once-per-game",
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "maiden-descent",
        kind: "phase_action",
        printedClause: "【真名解放】 <每局游戏限一次>\n被动/前哨阶段：从任意处（包括游戏外）将3张【指挥官】加入手牌或攻击。（不触发“打出时”效果）",
        activation: { phase: "outpost" },
        visibility: { revealsTrueName: true, revealTiming: "on_use_declared", revealScope: "servant_package" },
        execution: { mode: "handler", handlerId: "core.valkyrie-maiden-descent" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.valkyrie.skill.sc-valkyrie-2": {
    ...overrides["servant.valkyrie.skill.sc-valkyrie-2"],
    activation: "phase",
    windows: ["action", "combat"],
    steps: [],
    requiresActiveCard: false,
    handlerId: "core.valkyrie-swan-dress",
    supportLevel: "FULL",
    abilities: [
      { id: "swan-move-action", name: "天鹅礼装", activation: "phase", windows: ["action"], handlerId: "core.valkyrie-swan-dress", requiresActiveCard: true },
      { id: "swan-move-combat", name: "天鹅礼装", activation: "phase", windows: ["combat"], handlerId: "core.valkyrie-swan-dress", requiresActiveCard: true },
      { id: "steel-shield", name: "钢铁之盾", activation: "phase", windows: ["combat"], handlerId: "core.valkyrie-swan-dress", requiresActiveCard: false },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "swan-move-action", kind: "phase_action", printedClause: "行动阶段：沿着箭头移动至下一地点。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.valkyrie-swan-dress" } },
        { id: "swan-move-combat", kind: "phase_action", printedClause: "战斗阶段：沿着箭头移动至下一地点。", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.valkyrie-swan-dress" } },
        { id: "steel-shield", kind: "phase_action", printedClause: "钢铁之盾-被动/战斗阶段：支付此牌的魔力消耗，将一张你激活的【指挥官】加入手牌，并将此牌加入攻击。", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.valkyrie-swan-dress" } },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.nobunaga.skill.sc-nobunaga-1": {
    ...overrides["servant.nobunaga.skill.sc-nobunaga-1"],
    activation: "phase",
    windows: ["combat"],
    cardResidual: true,
    passiveEventTypes: ["round.started", "phase.transitioned", "player.defeated", "round.ended"],
    requiresActiveCard: true,
    handlerId: "core.nobunaga-papiyas",
    supportLevel: "FULL",
    abilities: [{
      id: "desecration",
      name: "亵渎",
      activation: "phase",
      windows: ["combat"],
      handlerId: "core.nobunaga-papiyas",
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "hellfire-upkeep",
          kind: "residual",
          printedClause: "地狱之火-残留：准备阶段，你需花费2点魔力，否则关闭此牌。",
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.nobunaga-papiyas" },
          lifecycle: { duration: "while_active" },
        },
        {
          id: "hellfire-growth",
          kind: "residual",
          printedClause: "每当一名玩家【败北】或淘汰时，此牌+1威力直至游戏结束（至多+7）。",
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.nobunaga-papiyas" },
          lifecycle: { duration: "while_active" },
        },
        {
          id: "desecration",
          kind: "phase_action",
          printedClause: "亵渎-战斗阶段：令你战斗中所有控制【幸运】的玩家【败北】，然后关闭他们的所有【幸运】。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.nobunaga-papiyas" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.nobunaga.skill.sc-nobunaga-2": {
    ...overrides["servant.nobunaga.skill.sc-nobunaga-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.nobunaga-three-line-formation",
    supportLevel: "FULL",
    abilities: [{
      id: "three-thousand-worlds",
      name: "三千世界",
      activation: "phase",
      windows: ["combat"],
      handlerId: "core.nobunaga-three-line-formation",
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "three-thousand-worlds",
        kind: "phase_action",
        printedClause: "三千世界-战斗阶段：与你位于同一战场的对手控制的非❄魔术攻击威力-2，战力结算时，令所有控制威力为0的非残留攻击的交战对手【败北】。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.nobunaga-three-line-formation" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "master.sieg.skill.s2": {
    ...overrides["master.sieg.skill.s2"],
    initiallyOwned: false,
    activation: "phase",
    windows: ["action"],
    passiveEventTypes: ["card.played"],
    abilities: [{
      id: "linden-leaf-free-play",
      name: "菩提之叶",
      activation: "phase",
      windows: ["action"],
      steps: ["play-batch-draft"],
    }],
    handlerId: "core.sieg-balmung",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "linden-leaf-free-play",
          kind: "phase_action",
          activation: { phase: "action", step: "play-batch-draft" },
          printedClause: "菩提之叶-你可以免费打出此牌。",
          execution: { mode: "handler", handlerId: "core.sieg-balmung" },
        },
        {
          id: "linden-leaf-retaliation",
          kind: "play_trigger",
          printedClause: "若如此做，与你位于同一战场的对手获得：\"行动阶段：关闭一张你控制的，基本威力大于等于5的敏捷攻击，然后令齐格【败北】。",
          conditions: [{ type: "event_type_is", eventType: "card.played" }],
          execution: { mode: "handler", handlerId: "core.sieg-balmung" },
        },
      ],
    },
  },
  "master.sieg.skill.ascension": {
    ...overrides["master.sieg.skill.ascension"],
    initiallyOwned: false,
    activation: "passive",
    windows: [],
    passiveEventTypes: ["player.mana.spent"],
    handlerId: "core.sieg-galvanism",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "galvanism-recover-seal",
          kind: "passive",
          printedClause: "当位于你所在地点的一名对手花费了4点或更多的魔力时，你恢复一枚令咒。",
          conditions: [{ type: "event_type_is", eventType: "player.mana.spent" }],
          execution: { mode: "handler", handlerId: "core.sieg-galvanism" },
        },
        {
          id: "galvanism-transformed-strength",
          kind: "passive",
          printedClause: "【同调】状态时，你的力量基础攻击获得威力+3。",
          conditions: [
            { type: "source_owned" },
            { type: "player_flag_number_current_round", key: "transformedRound" },
          ],
          execution: { mode: "automatic" },
          ruleModifiers: [{
            id: "galvanism-transformed-strength-power",
            rule: "card_power",
            operation: "add",
            scope: { subject: "controller", cards: { basic: true, attributesAny: ["力量"] } },
            value: 3,
            lifecycle: { duration: "permanent" },
          }],
        },
      ],
    },
  },
  "master.kohaku.skill.s3": {
    ...overrides["master.kohaku.skill.s3"],
    activation: "passive",
    passiveEventTypes: ["round.ending"],
    handlerId: "core.kohaku-burned-workshop",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "burned-workshop-continuous",
          kind: "passive",
          printedClause: "你无法部署于魔术工房，且你通过局势牌获得的魔力减半。",
          conditions: [{ type: "source_owned" }],
          execution: { mode: "automatic" },
          ruleModifiers: [
            {
              id: "burned-no-workshop",
              rule: "deployment_destinations",
              operation: "replace",
              scope: { subject: "controller", destinationFilter: { locationKind: "battlefield" } },
              lifecycle: { duration: "permanent" },
            },
            {
              id: "burned-half-situation-mana",
              rule: "situation_mana_gain",
              operation: "multiply",
              scope: { subject: "controller" },
              value: 0.5,
              lifecycle: { duration: "permanent" },
            },
            {
              id: "burned-face-up-limit",
              rule: "face_up_cards_per_round",
              operation: "set",
              scope: { subject: "controller" },
              value: 1,
              lifecycle: { duration: "permanent" },
            },
          ],
        },
        {
          id: "burned-workshop-expire",
          kind: "passive",
          printedClause: "如果你在战斗阶段后位于【深山町】，则在本回合结束后将此卡移出游戏。",
          conditions: [{ type: "event_type_is", eventType: "round.ending" }],
          execution: { mode: "handler", handlerId: "core.kohaku-burned-workshop" },
        },
      ],
    },
  },
  "master.kohaku.skill.ascension": {
    ...overrides["master.kohaku.skill.ascension"],
    initiallyOwned: false,
    activation: "phase",
    windows: ["action", "combat"],
    passiveEventTypes: ["combat.resolved"],
    abilities: [
      {
        id: "mech-hisui-onslaught",
        name: "魔力猛攻",
        activation: "phase",
        windows: ["action"],
        limit: "once-per-round",
      },
      {
        id: "mech-hisui-combat",
        name: "机械翡翠",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        limit: "once-per-round",
      },
    ],
    handlerId: "core.kohaku-mech-hisui",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "mech-hisui-onslaught",
          kind: "phase_action",
          activation: { phase: "action" },
          printedClause: "行动阶段：使用至多2张【魔力猛攻】。",
          execution: { mode: "handler", handlerId: "core.kohaku-mech-hisui" },
        },
        {
          id: "mech-hisui-combat",
          kind: "phase_action",
          activation: { phase: "combat" },
          printedClause: "战斗阶段：与你交战的对手地利小于你则合计威力-4。",
          execution: { mode: "handler", handlerId: "core.kohaku-mech-hisui" },
        },
        {
          id: "mech-hisui-win-burn",
          kind: "passive",
          printedClause: "如果你获胜，所有位于魔术工房的玩家获得【燃尽的工房】。",
          conditions: [{ type: "event_type_is", eventType: "combat.resolved" }],
          execution: { mode: "handler", handlerId: "core.kohaku-mech-hisui" },
        },
      ],
    },
  },
  "master.darnic.skill.s1": {
    ...overrides["master.darnic.skill.s1"],
    activation: "passive",
    passiveEventTypes: ["game.started"],
    unoccupiedTerrainLocations: ["mountain", "city"],
    handlerId: "core.unoccupied-terrain-advantage",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "home-turf",
        kind: "passive",
        printedClause: "你战场上未被占领的地利将属于你。",
        execution: { mode: "handler", handlerId: "core.unoccupied-terrain-advantage" },
      }],
    },
  },
  "master.darnic.skill.ascension": {
    ...overrides["master.darnic.skill.ascension"],
    initiallyOwned: false,
    activation: "phase",
    windows: ["action"],
    passiveEventTypes: ["phase.transitioned"],
    handlerId: "core.darnic-old-acquaintances",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "scorched-earth",
          kind: "passive",
          printedClause: "焦土作战-被动：与你位于同一战场的对手的行动阶段开始时必须花费2点战果维持地利，否则其失去地利。",
          execution: { mode: "handler", handlerId: "core.darnic-old-acquaintances" },
        },
        {
          id: "air-support",
          kind: "phase_action",
          activation: { phase: "action" },
          printedClause: "空中支援-行动阶段：将你的地利翻倍。",
          execution: { mode: "handler", handlerId: "core.darnic-old-acquaintances" },
        },
      ],
    },
  },
  "master.araya.skill.s1": {
    ...overrides["master.araya.skill.s1"],
    activation: "passive",
    passiveEventTypes: ["player.deployed"],
    handlerId: "core.araya-triple-boundary",
    supportLevel: "FULL",
  },
  "master.araya.skill.ascension": {
    ...overrides["master.araya.skill.ascension"],
    initiallyOwned: false,
    activation: "passive",
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.araya-paradox-spiral",
    supportLevel: "FULL",
  },
  "servant.ibaraki.skill.sc-ibaraki-3": {
    ...overrides["servant.ibaraki.skill.sc-ibaraki-3"],
    activation: "phase",
    windows: ["combat"],
    revealsTrueNameOnPlay: true,
    requiresActiveCard: true,
    rashomonGrudge: { powerLossScope: "same-battlefield-opponents" },
    handlerId: "core.ibaraki-rashomon-grudge",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "oni-grapple",
          kind: "play_trigger",
          printedClause: "【真名解放】恶鬼缠身-战斗阶段：将一名于本回合曾与你位于同一战场的对手移动至你所在的战场。",
          execution: { mode: "handler", handlerId: "core.ibaraki-rashomon-grudge" },
          activation: { phase: "combat" },
        },
        {
          id: "random-discard-power-loss",
          kind: "play_trigger",
          printedClause: "若如此做，令其随机弃置一张手牌并记录其基本威力为X，与你位于同一战场的对手失去X点合计威力。",
          execution: { mode: "handler", handlerId: "core.ibaraki-rashomon-grudge" },
          activation: { phase: "combat" },
        },
      ],
      evidence: [
        {
          kind: "wiki",
          document: "Fate/Domination Wiki",
          category: "servant/english",
          page: "Grudge of Rashoumon",
          locator: "https://fatedomination.fandom.com/wiki/Grudge_of_Rashoumon",
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.stheno.skill.sc-stheno-3": {
    ...overrides["servant.stheno.skill.sc-stheno-3"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    suppressInferredLimit: true,
    handlerId: "core.stheno-divine-core",
    supportLevel: "FULL",
    abilities: [{
      id: "goddess-conceit",
      name: "女神的绮想",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "goddess-conceit",
        kind: "phase_action",
        printedClause: "女神的绮想-战斗阶段：弃置一张【幸运】，关闭每名交战对手的至多一张非<每局游戏限一次>的攻击，令他们获得等于被关闭牌魔力消耗的魔力并抽一张牌后，按回合轮次顺序，他们可以打出被抽取的那张牌并使用其行动阶段和战斗阶段能力。",
        activation: { phase: "combat" },
        execution: { mode: "handler", handlerId: "core.stheno-divine-core" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.sanson.skill.sc-sanson-1": {
    ...overrides["servant.sanson.skill.sc-sanson-1"],
    activation: "phase",
    windows: ["outpost"],
    passiveEventTypes: ["round.ending"],
    requiresActiveCard: false,
    handlerId: "core.sanson-judgment-day",
    supportLevel: "FULL",
    abilities: [{
      id: "judgment-day",
      name: "审判日",
      activation: "phase",
      windows: ["outpost"],
      requiresActiveCard: false,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "judgment-day",
        kind: "phase_action",
        printedClause: "审判日-被动/前哨阶段：3秒后，所有玩家同时选择投票一名除你以外的其他玩家或弃票（未选择也视为弃票），唯一一名受到最多投票的玩家被【控诉】直至你再度使用审判日。出现平票时，【控诉】所有未弃票的对手直至回合结束。",
        activation: { phase: "outpost" },
        execution: { mode: "handler", handlerId: "core.sanson-judgment-day" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.sanson.skill.sc-sanson-2": {
    ...overrides["servant.sanson.skill.sc-sanson-2"],
    activation: "phase",
    windows: ["combat"],
    passiveEventTypes: ["player.defeated", "combat.ending"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.sanson-death-hope",
    supportLevel: "FULL",
    abilities: [{
      id: "execute-accused",
      name: "死亡将为明日的希望",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "execute-accused",
        kind: "phase_action",
        printedClause: "【真名解放】\n战斗阶段：使与你进行战斗的一名被【控诉】的玩家【败北】，然后令其失去【控诉】。若其战败（即使其最终未与你战斗或未因此效果【败北】），你获得4点战果。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.sanson-death-hope" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.hassanhf.skill.sc-hassanhf-1": {
    ...overrides["servant.hassanhf.skill.sc-hassanhf-1"],
    activation: "phase",
    windows: ["action"],
    passiveEventTypes: ["card.played", "combat.resolved", "combat.ending", "round.ending"],
    requiresActiveCard: true,
    handlerId: "core.hundred-faced-hassan-tracking",
    supportLevel: "FULL",
    abilities: [{
      id: "track-location",
      name: "百貌·跟踪",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "tracked-upkeep",
          kind: "passive",
          printedClause: "被动：被【跟踪】的玩家于每回合结束时失去1点战果，他们每于该回合使用一张技能牌，便额外失去1点。若你获胜且战胜了至少一名被【跟踪】的对手，获得2点战果。战斗结束后，移除所有与你位于同一战场且交战的对手的【跟踪】。",
          execution: { mode: "handler", handlerId: "core.hundred-faced-hassan-tracking" },
        },
        {
          id: "track-location",
          kind: "phase_action",
          printedClause: "行动阶段：【跟踪】与你位于同一地点的所有对手。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.hundred-faced-hassan-tracking" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.hassanhf.skill.sc-hassanhf-2": {
    ...overrides["servant.hassanhf.skill.sc-hassanhf-2"],
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.hundred-faced-hassan-illusion",
    supportLevel: "FULL",
    abilities: [
      {
        id: "illusion-draw-hidden",
        name: "妄想幻象·暗置",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
      {
        id: "illusion-combat",
        name: "妄想幻象·战斗",
        activation: "phase",
        windows: ["combat"],
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "illusion-draw-hidden",
          kind: "phase_action",
          printedClause: "【真名解放】\n行动阶段：抽2张牌并将之暗置加入到攻击中。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.hundred-faced-hassan-illusion" },
        },
        {
          id: "illusion-combat",
          kind: "phase_action",
          printedClause: "战斗阶段：移动至侦察或激活2张暗置牌，花费其魔力消耗并使用其【行动阶段】效果。若你移动至侦察，获得2点魔力。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.hundred-faced-hassan-illusion" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.douman.skill.sc-douman-1": {
    ...overrides["servant.douman.skill.sc-douman-1"],
    activation: "phase",
    windows: ["action"],
    passiveEventTypes: ["combat.resolved"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: false,
    hasReversalEffect: true,
    revealsTrueNameOnReverse: true,
    handlerId: "core.douman-evil-minister",
    supportLevel: "FULL",
    abilities: [{
      id: "evil-minister-curse",
      name: "万物必衰·诅咒",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "evil-minister-curse",
          kind: "phase_action",
          printedClause: "行动阶段：【诅咒】当前地点的对手直至他们赢得一场争夺战。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.douman-evil-minister" },
        },
        {
          id: "evil-minister-reverse-power",
          kind: "passive",
          printedClause: "反转：【真名解放】你的合计威力+12-2X，X为未被诅咒的对手数。",
          conditions: [{ type: "source_active" }, { type: "source_reversed" }],
          ruleModifiers: [{
            id: "evil-minister-reverse-total-power",
            operation: "add",
            rule: "combat_power",
            scope: { subject: "controller" },
            value: {
              type: "formula",
              op: "subtract",
              args: [
                { type: "constant", value: 12 },
                {
                  type: "formula",
                  op: "multiply",
                  args: [
                    { type: "constant", value: 2 },
                    { type: "metric", metric: "opponents_without_status_count", source: "controller", key: "诅咒" },
                  ],
                },
              ],
            },
            lifecycle: { duration: "while_active" },
          }],
          lifecycle: { duration: "while_active" },
          execution: { mode: "automatic" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.douman.skill.sc-douman-2": {
    ...overrides["servant.douman.skill.sc-douman-2"],
    activation: "phase",
    windows: ["action"],
    passiveEventTypes: ["player.defeated", "combat.resolved", "round.ending"],
    requiresActiveCard: true,
    hasReversalEffect: true,
    handlerId: "core.douman-ridicule-cat",
    supportLevel: "FULL",
    abilities: [
      {
        id: "ridicule-cat-normal",
        name: "Ridicule Cat",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
      {
        id: "ridicule-cat-reverse",
        name: "Ridicule Cat·反转",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "ridicule-cat-normal",
          kind: "phase_action",
          printedClause: "行动阶段：本回合中，每有一位对手战败，你便获得1点战果。若被【诅咒】的玩家本回合不进行战斗，则其在回合结束时失去3点战果。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.douman-ridicule-cat" },
        },
        {
          id: "ridicule-cat-reverse",
          kind: "phase_action",
          printedClause: "反转/行动阶段：所有玩家本回合不会失去【诅咒】。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }, { type: "source_reversed" }],
          execution: { mode: "handler", handlerId: "core.douman-ridicule-cat" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.vlad.skill.sc-vlad-1": {
    ...overrides["servant.vlad.skill.sc-vlad-1"],
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.vlad-protector-of-nation",
    supportLevel: "FULL",
    abilities: [
      {
        id: "protector-double-terrain",
        name: "护国鬼将·地利倍化",
        activation: "phase",
        windows: ["action"],
        abilityCost: 1,
        requiresActiveCard: false,
      },
      {
        id: "protector-fortify",
        name: "护国鬼将·固守",
        activation: "phase",
        windows: ["combat"],
        abilityCost: 1,
        requiresActiveCard: false,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "protector-double-terrain",
          kind: "phase_action",
          printedClause: "被动/行动阶段：花费1点魔力，将你的地利变为2倍。",
          activation: { phase: "action" },
          execution: { mode: "handler", handlerId: "core.vlad-protector-of-nation" },
        },
        {
          id: "protector-fortify",
          kind: "phase_action",
          printedClause: "被动/战斗阶段：花费1点魔力，移动进入此战场的玩家合计威力-4。若你赢得本次战斗，下回合开始时，你部署于此战场。",
          activation: { phase: "combat" },
          execution: { mode: "handler", handlerId: "core.vlad-protector-of-nation" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.vlad.skill.sc-vlad-2": {
    ...overrides["servant.vlad.skill.sc-vlad-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.vlad-kazikli-bey",
    supportLevel: "FULL",
    abilities: [{
      id: "kazikli-play-hand",
      name: "极刑王",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "kazikli-play-hand",
        kind: "phase_action",
        printedClause: "行动阶段：从手牌中打出一张牌。若你持有地利，可以额外花费2点魔力再打出一张牌。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.vlad-kazikli-bey" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.kagekiyo.skill.sc-kagekiyo-1": {
    ...overrides["servant.kagekiyo.skill.sc-kagekiyo-1"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    requiresEightMana: true,
    eightManaWaiverMaxPrintedBasePower: 4,
    basePower: 0,
    basePowerFormula: {
      type: "formula",
      op: "multiply",
      args: [
        { type: "constant", value: 2 },
        { type: "metric", metric: "controlled_attack_count", source: "controller" },
      ],
    },
    revealsTrueNameOnPlay: true,
    handlerId: "core.kagekiyo-azamaru",
    supportLevel: "FULL",
    abilities: [{
      id: "azamaru-activate-hidden",
      name: "万物必逝",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      cardFace: {
        basePower: 0,
        basePowerFormula: {
          type: "formula",
          op: "multiply",
          args: [
            { type: "constant", value: 2 },
            { type: "metric", metric: "controlled_attack_count", source: "controller" },
          ],
      },
      },
      abilities: [{
        id: "azamaru-activate-hidden",
        kind: "phase_action",
        printedClause: "万物必逝-战斗阶段：花费魔力消耗激活你的所有暗置攻击。你可以使用它们的行动阶段能力。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.kagekiyo-azamaru" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.kagekiyo.skill.sc-kagekiyo-3": {
    ...overrides["servant.kagekiyo.skill.sc-kagekiyo-3"],
    activation: "phase",
    windows: ["outpost"],
    requiresActiveCard: false,
    handlerId: "core.kagekiyo-never-dies",
    supportLevel: "FULL",
    abilities: [{
      id: "vengeful-grudge-facedown",
      name: "复仇之怨念",
      activation: "phase",
      windows: ["outpost"],
      abilityCost: 3,
      requiresActiveCard: false,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "vengeful-grudge-zero-power",
          kind: "passive",
          printedClause: "复仇之怨念-被动：你的暗置攻击视为印刷威力为0并拥有“残留：你可以于回合结束时关闭此牌。",
          conditions: [{ type: "source_owned" }],
          ruleModifiers: [{
            id: "kagekiyo-facedown-printed-power-zero",
            operation: "set",
            rule: "card_base_power",
            scope: { subject: "controller", cards: { zones: ["attack"], face: "down" } },
            value: 0,
            lifecycle: { duration: "permanent" },
          }],
          execution: { mode: "automatic" },
        },
        {
          id: "vengeful-grudge-permanent",
          kind: "passive",
          printedClause: "复仇之怨念-被动：你的暗置攻击视为印刷威力为0并拥有“残留：你可以于回合结束时关闭此牌。",
          conditions: [{ type: "source_owned" }],
          ruleModifiers: [{
            id: "kagekiyo-facedown-residual",
            operation: "allow",
            rule: "card_residual",
            scope: { subject: "controller", cards: { zones: ["attack"], face: "down" } },
            value: 1,
            lifecycle: { duration: "permanent" },
          }],
          execution: { mode: "automatic" },
        },
        {
          id: "vengeful-grudge-facedown",
          kind: "phase_action",
          printedClause: "”（其威力可以因效果被增加或减少）被动/前哨阶段：若你未控制暗置攻击，花费3点魔力，抽2张牌并将其暗置打出。",
          activation: { phase: "outpost" },
          execution: { mode: "handler", handlerId: "core.kagekiyo-never-dies" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.hassanser.skill.sc-hassanser-3": {
    ...overrides["servant.hassanser.skill.sc-hassanser-3"],
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["card.played"],
    handlerId: "core.serenity-dance",
    supportLevel: "FULL",
    abilities: [
      {
        id: "serenity-dance-move",
        name: "静谧之舞·战场移动",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
      {
        id: "serenity-dance-workshop-block",
        name: "静谧之舞·魔术工房封锁",
        activation: "phase",
        windows: ["combat"],
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "double-delusional-poison-body",
          kind: "play_trigger",
          printedClause: "本回合你可以使用两次【妄想毒身】的能力。",
          execution: { mode: "automatic", handlerId: "core.serenity-dance" },
        },
        {
          id: "serenity-dance-move",
          kind: "phase_action",
          printedClause: "行动阶段：从一处战场移动至另一处战场。",
          activation: { phase: "action" },
          execution: { mode: "automatic", handlerId: "core.serenity-dance" },
        },
        {
          id: "serenity-dance-workshop-block",
          kind: "phase_action",
          printedClause: "战斗阶段：下回合所有玩家位于魔术工房时，不能获得战果或魔力。",
          activation: { phase: "combat" },
          execution: { mode: "automatic", handlerId: "core.serenity-dance" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.lionking.skill.sc-lionking-1": {
    ...overrides["servant.lionking.skill.sc-lionking-1"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["game.started", "phase.transitioned"],
    handlerId: "core.lionking-divine-command",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "divine-command-luck",
          kind: "passive",
          printedClause: "被动：战力结算时，你的【幸运】视为拥有所有属性且它们的威力不能被减少。",
          execution: { mode: "automatic", handlerId: "core.lionking-divine-command" },
        },
        {
          id: "no-price-too-great",
          kind: "passive",
          printedClause: "止境的加护-被动/前哨阶段：获得1点魔力和+3合计威力，本回合你无法获得战果。",
          execution: { mode: "automatic", handlerId: "core.lionking-divine-command" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.lionking.skill.sc-lionking-2": {
    ...overrides["servant.lionking.skill.sc-lionking-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    alternativePlayCost: { resource: "victory-points", amount: 2 },
    handlerId: "core.lionking-dun-stallion",
    supportLevel: "FULL",
    abilities: [
      {
        id: "battle-continuation",
        name: "战斗续行",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
      {
        id: "riding",
        name: "骑乘",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "alternate-vp-cost",
          kind: "passive",
          printedClause: "你可以改为花费2点战果来打出此牌。",
          execution: { mode: "automatic" },
        },
        {
          id: "battle-continuation",
          kind: "phase_action",
          printedClause: "战斗续行-行动阶段：移动至一处战场。",
          activation: { phase: "action" },
          execution: { mode: "handler", handlerId: "core.lionking-dun-stallion" },
        },
        {
          id: "riding",
          kind: "phase_action",
          printedClause: "骑乘-行动阶段：从手牌中追加打出至多3张基本威力3及以下的牌。",
          activation: { phase: "action" },
          execution: { mode: "handler", handlerId: "core.lionking-dun-stallion" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.romulus.skill.sc-romulus-1": {
    ...overrides["servant.romulus.skill.sc-romulus-1"],
    activation: "passive",
    windows: ["combat"],
    requiresActiveCard: false,
    passiveEventTypes: ["game.started", "player.moved"],
    handlerId: "core.romulus-moles-necessrie",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "terminus-sanguinis",
          kind: "passive",
          printedClause: "被动：非【罗马】玩家移动至你所在的战场后变为【裁军】，他们除令咒外不可打出攻击或使用能力。",
          execution: { mode: "automatic", handlerId: "core.romulus-moles-necessrie" },
        },
        {
          id: "pax-romana",
          kind: "passive",
          printedClause: "战斗阶段：若此战斗中其他玩家全部都是【罗马】，罗慕路斯的技能获得威力+4。",
          execution: { mode: "automatic", handlerId: "core.romulus-moles-necessrie" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.romulus.skill.sc-romulus-2": {
    ...overrides["servant.romulus.skill.sc-romulus-2"],
    activation: "passive",
    windows: ["combat"],
    requiresActiveCard: false,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.romulus-magna-voluisse-magnum",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "rome-is-great",
        kind: "passive",
        printedClause: "被动/战斗阶段：若你赢得胜利，此战斗的败者变为【罗马】直至游戏结束。当一名【罗马】赢得胜利时，你和该【罗马】各获得1点战果。",
        conditions: [{ type: "source_active" }],
        execution: { mode: "automatic", handlerId: "core.romulus-magna-voluisse-magnum" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.chloe.skill.sc-chloe-2": {
    ...overrides["servant.chloe.skill.sc-chloe-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.chloe-projection-magic",
    supportLevel: "FULL",
    abilities: [{
      id: "ferromantic-coalescence",
      name: "磁想聚合",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "ferromantic-coalescence",
          kind: "phase_action",
          printedClause: "磁想聚合-行动阶段：你的基础攻击获得：“行动阶段：你每控制一张与你控制的其他攻击不具有相同属性的攻击，此牌+1威力。”直至回合结束。此效果不能被任何方式阻止。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.chloe-projection-magic" },
        },
        {
          id: "projection-win-reward",
          kind: "passive",
          printedClause: "战斗阶段：若你赢得战斗，获得2点战果。",
          conditions: [{ type: "source_active" }],
          execution: { mode: "automatic", handlerId: "core.chloe-projection-magic" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.chloe.skill.sc-chloe-3": {
    ...overrides["servant.chloe.skill.sc-chloe-3"],
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: false,
    handlerId: "core.chloe-kanshou-bakuya",
    supportLevel: "FULL",
    abilities: [
      {
        id: "kanshou-play",
        name: "干将·莫邪",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: false,
      },
      {
        id: "triple-linked-crane-wings",
        name: "鹤翼三连",
        activation: "phase",
        windows: ["combat"],
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "kanshou-play",
          kind: "phase_action",
          printedClause: "被动/行动阶段：若你激活的攻击印刷基本威力之和恰好为5，打出一张牌。",
          activation: { phase: "action" },
          execution: { mode: "handler", handlerId: "core.chloe-kanshou-bakuya" },
        },
        {
          id: "triple-linked-crane-wings",
          kind: "phase_action",
          printedClause: "鹤翼三连-战斗阶段：如果你本回合于一处战场打出此牌，关闭之。若如此，在下回合开始时将此牌加入攻击。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.chloe-kanshou-bakuya" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.ereshkigal.skill.sc-ereshkigal-2": {
    ...overrides["servant.ereshkigal.skill.sc-ereshkigal-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    passiveEventTypes: ["player.deployed", "combat.ending"],
    handlerId: "core.ereshkigal-blessing-of-kur",
    supportLevel: "FULL",
    abilities: [{
      id: "blessing-unaffected",
      name: "冥界佑护·不受影响",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: false,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "blessing-power-reversal",
          kind: "passive",
          printedClause: "位于此战场的玩家计算威力时，来自局势牌和事件牌的所有力量修正值乘以-1。",
          execution: { mode: "automatic", handlerId: "core.ereshkigal-blessing-of-kur" },
        },
        {
          id: "blessing-deploy-mana",
          kind: "passive",
          printedClause: "每当有玩家部署于此战场时，埃列什基伽勒获得1点魔力。",
          execution: { mode: "automatic", handlerId: "core.ereshkigal-blessing-of-kur" },
        },
        {
          id: "blessing-unaffected",
          kind: "phase_action",
          printedClause: "被动/行动阶段：埃列什基伽勒不受【冥界佑护】的影响。",
          activation: { phase: "action" },
          execution: { mode: "handler", handlerId: "core.ereshkigal-blessing-of-kur" },
        },
        {
          id: "blessing-return",
          kind: "passive",
          printedClause: "战斗阶段结束后将此牌放还于技能区。",
          execution: { mode: "automatic", handlerId: "core.ereshkigal-blessing-of-kur" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.ereshkigal.skill.sc-ereshkigal-3": {
    ...overrides["servant.ereshkigal.skill.sc-ereshkigal-3"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.ereshkigal-kur-kigal-irkalla",
    supportLevel: "FULL",
    abilities: [{
      id: "terraform",
      name: "花开冥界",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "terraform",
        kind: "phase_action",
        printedClause: "花开冥界-行动阶段：若【冥界佑护】未位于版图内，将其放置于你所在的战场。若其已位于你所在的战场，你+6合计威力。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.ereshkigal-kur-kigal-irkalla" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.altera.skill.sc-altera-1": {
    ...overrides["servant.altera.skill.sc-altera-1"],
    activation: "passive",
    windows: ["combat"],
    requiresActiveCard: false,
    passiveEventTypes: ["phase.transitioned", "combat.ending"],
    tags: [...new Set([...(overrides["servant.altera.skill.sc-altera-1"]?.tags ?? []), "cannot-play"])],
    handlerId: "core.altera-teardrop-photon-ray",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "orbital-strike",
        kind: "passive",
        printedClause: "于此牌被放置的回合后，当你于此地点战斗时，于战斗阶段将此牌加入攻击并真名解放，然后于战斗阶段结束后，将此牌移除游戏并为其所在的地点抽取【文明废墟】事件牌代替原本的事件牌直至游戏结束。",
        execution: { mode: "automatic", handlerId: "core.altera-teardrop-photon-ray" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.altera.skill.sc-altera-2": {
    ...overrides["servant.altera.skill.sc-altera-2"],
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: true,
    tags: [...new Set([...(overrides["servant.altera.skill.sc-altera-2"]?.tags ?? []), "owner-skill-cost-minus-highest-visible-event-vp"])],
    handlerId: "core.altera-photon-ray",
    supportLevel: "FULL",
    abilities: [
      {
        id: "sword-of-mars",
        name: "军神之剑",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
      {
        id: "attach-teardrop",
        name: "轨道打击·布置",
        activation: "phase",
        windows: ["combat"],
        requiresActiveCard: true,
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "skill-cost-reduction",
          kind: "passive",
          printedClause: "被动/行动阶段：阿蒂拉的技能牌减少等于你所在战场正面战果最高的事件牌的战果数的魔力消耗。",
          conditions: [{ type: "source_active" }],
          execution: { mode: "automatic" },
        },
        {
          id: "sword-of-mars",
          kind: "phase_action",
          printedClause: "行动阶段：你的攻击无法因其他能力被关闭或减少威力。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.altera-photon-ray" },
        },
        {
          id: "attach-teardrop",
          kind: "phase_action",
          printedClause: "战斗阶段：将【军神之剑·泪之星】放置于你所在的地点。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.altera-photon-ray" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.charlemagne.skill.sc-charlemagne-1": {
    ...overrides["servant.charlemagne.skill.sc-charlemagne-1"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.charlemagne-joyeuse-ordre",
    supportLevel: "FULL",
    abilities: [{
      id: "joyeuse-draw-objective",
      name: "展示王勇",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "return-objective-on-win",
          kind: "passive",
          printedClause: "被动：获得胜利时，你可将此战场中的一张事件牌洗回事件牌库。",
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.charlemagne-joyeuse-ordre" },
        },
        {
          id: "joyeuse-draw-objective",
          kind: "phase_action",
          printedClause: "战斗阶段：抽一张事件牌并将之加入你的战场，你的所有攻击获得该事件牌上印刷的属性。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.charlemagne-joyeuse-ordre" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.charlemagne.skill.sc-charlemagne-2": {
    ...overrides["servant.charlemagne.skill.sc-charlemagne-2"],
    activation: "residual",
    windows: [],
    cardResidual: true,
    cost: 0,
    costRule: { kind: "round-linear", base: 14, perRound: -2, min: 0 },
    revealsTrueNameOnPlay: true,
    tags: [...new Set([...(overrides["servant.charlemagne.skill.sc-charlemagne-2"]?.tags ?? []), "positive-situation-event-power-x2-climax-x3"])],
    handlerId: "core.charlemagne-charles-patricius",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "charles-patricius-permanent",
        kind: "passive",
        printedClause: "【真名解放】\nX为14-（当前回合数 × 2）\n残留：你的攻击因局势牌和事件牌提升的威力翻倍。高潮阶段时，变为三倍。",
        conditions: [{ type: "source_active" }],
        execution: { mode: "automatic", handlerId: "core.charlemagne-charles-patricius" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.bradamante.skill.sc-bradamante-2": {
    ...overrides["servant.bradamante.skill.sc-bradamante-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: false,
    tags: [...new Set([...(overrides["servant.bradamante.skill.sc-bradamante-2"]?.tags ?? []), "opponent-skill-ward-pay2-or-ignore-once-per-round"])],
    handlerId: "core.bradamante-angelica-cathay",
    supportLevel: "FULL",
    abilities: [{
      id: "magic-canceler",
      name: "魔禁之戒",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "curse-ward",
          kind: "passive",
          printedClause: "诅咒守卫-被动：每回合限一次，当一名对手使用技能时，你可以询问其是否花费2点魔力。若不花费，你不受该技能及其效果影响。",
          execution: { mode: "automatic" },
        },
        {
          id: "magic-canceler",
          kind: "phase_action",
          printedClause: "诅咒守卫-被动：每回合限一次，当一名对手使用技能时，你可以询问其是否花费2点魔力。若不花费，你不受该技能及其效果影响。\n魔禁之戒-战斗阶段：支付X点魔力，关闭一张你战斗中魔力消耗为X的魔术攻击（X不可为0）。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.bradamante-angelica-cathay" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.bradamante.skill.sc-bradamante-3": {
    ...overrides["servant.bradamante.skill.sc-bradamante-3"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: false,
    tags: [...new Set([...(overrides["servant.bradamante.skill.sc-bradamante-3"]?.tags ?? []), "opponent-shared-basic-type-no-situation-event-increase"])],
    handlerId: "core.bradamante-bouclier-atlante",
    supportLevel: "FULL",
    abilities: [{
      id: "atlante-basic-play",
      name: "炫目的闪光魔盾",
      activation: "phase",
      windows: ["combat"],
      abilityCost: 4,
      requiresActiveCard: true,
      revealsTrueNameOnSkillUse: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "atlante-board-power-shield",
          kind: "passive",
          printedClause: "被动/战斗阶段：你的交战对手控制的攻击若与你控制的基础攻击属性相同，该攻击威力无法被局势牌和事件牌增加。",
          execution: { mode: "automatic" },
        },
        {
          id: "atlante-basic-play",
          kind: "phase_action",
          printedClause: "战斗阶段：支付4点魔力并【真名解放】，从手牌打出一张基础攻击。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.bradamante-bouclier-atlante" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.anastasia.skill.sc-anastasia-2": {
    ...overrides["servant.anastasia.skill.sc-anastasia-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: false,
    passiveEventTypes: ["game.started", "round.started", "card.entered-attack", "card.activated", "card.closed", "player.entered-location", "combat.ending"],
    handlerId: "core.anastasia-sumerki-kremlin",
    supportLevel: "FULL",
    abilities: [{
      id: "kremlin-combat",
      name: "斯摩棱斯克的黄昏",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "absolute-freeze",
          kind: "passive",
          printedClause: "被动：当你的【阵地建造】激活时，你所在地点的对手，其非技能的✖特殊攻击失去所有卡牌文字效果。",
          execution: { mode: "handler", handlerId: "core.anastasia-sumerki-kremlin" },
        },
        {
          id: "kremlin-combat",
          kind: "phase_action",
          printedClause: "战斗阶段：将进行交战的对手，其攻击失去特殊和宝具外的所有属性。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.anastasia-sumerki-kremlin" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.anastasia.skill.sc-anastasia-3": {
    ...overrides["servant.anastasia.skill.sc-anastasia-3"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.anastasia-viy",
    supportLevel: "FULL",
    abilities: [{
      id: "viy-eyes",
      name: "疾驰·精灵眼球",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "viy-eyes",
        kind: "phase_action",
        printedClause: "战斗阶段：将与你交战的对手，其特殊属性攻击的威力设为0。你的魔术属性攻击的威力和你的合计威力不能被其他玩家的能力减少。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.anastasia-viy" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.parvati.skill.sc-parvati-1": {
    ...overrides["servant.parvati.skill.sc-parvati-1"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    passiveEventTypes: ["servant.true-name-revealed", "combat.resolved"],
    tags: [...new Set([...(overrides["servant.parvati.skill.sc-parvati-1"]?.tags ?? []), "revealed-hand-size-plus-one"])],
    handlerId: "core.parvati-ashes-of-kama",
    supportLevel: "FULL",
    abilities: [{ id: "ashes-survival", name: "双生", activation: "phase", windows: ["action"], requiresActiveCard: false }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "ashes-reveal", kind: "passive", printedClause: "双生-被动：当你【真名解放】时，抽3张牌。若帕尔瓦蒂已【真名解放】，你+1手牌上限。", execution: { mode: "handler", handlerId: "core.parvati-ashes-of-kama" } },
        { id: "ashes-survival", kind: "phase_action", printedClause: "被动/行动阶段：你仅可在你下次淘汰结算会被淘汰时使用此效果（如7人游戏时你的战果数不为前四位，以此类推）。帕尔瓦蒂的攻击获得+1威力，若你获胜，获得1点战果。", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.parvati-ashes-of-kama" } },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.parvati.skill.sc-parvati-2": {
    ...overrides["servant.parvati.skill.sc-parvati-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    requiresEightMana: false,
    drawOnPlay: undefined,
    passiveEventTypes: ["card.played"],
    handlerId: "core.parvati-imaginary-around",
    supportLevel: "FULL",
    abilities: [{ id: "imaginary-cycle", name: "虚数循环", activation: "phase", windows: ["action"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "imaginary-on-play", kind: "passive", printedClause: "打出时：抽一张牌，你可以弃置该牌。", execution: { mode: "handler", handlerId: "core.parvati-imaginary-around" } },
        { id: "imaginary-cycle", kind: "phase_action", printedClause: "行动阶段：将3张你弃牌堆的基础攻击洗回牌库，若它们的属性均不同，你+4合计威力。若它们的属性均相同，你移动至一处地点。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.parvati-imaginary-around" } },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.gareth.skill.sc-gareth-2": {
    ...overrides["servant.gareth.skill.sc-gareth-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    handlerId: "core.gareth-ira-lupus",
    supportLevel: "FULL",
    abilities: [{ id: "cornered-wolf", name: "困兽之狼", activation: "phase", windows: ["combat"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "cornered-wolf",
        kind: "phase_action",
        printedClause: "狼不眠-战斗阶段：你所在的战斗中每有一名除第一个的对手，抽一张牌并将其打出。（例：存在两名对手，抽一张牌打出；三名对手，抽一张牌打出，重复一次。）每一张以狼不眠打出的暗置牌减少该战场的1点竞争战果且令你下次使用狼不眠时额外抽一张牌并打出",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.gareth-ira-lupus" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.gareth.skill.sc-gareth-3": {
    ...overrides["servant.gareth.skill.sc-gareth-3"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    passiveEventTypes: ["combat.ending"],
    playPrerequisite: { discardFromHand: { count: 1, basic: true, attributesAll: ["魔术"] } },
    handlerId: "core.gareth-gun-lance",
    supportLevel: "FULL",
    abilities: [{ id: "battery-overload", name: "电池过载", activation: "phase", windows: ["combat"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "ether-charge",
          kind: "passive",
          printedClause: "以太充能-此牌需从手牌弃置一张魔术基础牌来打出。",
          execution: { mode: "automatic" },
        },
        {
          id: "battery-overload",
          kind: "phase_action",
          printedClause: "魔能过载-被动/战斗阶段：花费2点战果，你控制的一张魔术基础攻击获得力量属性和+2威力并于回合结束后将其移除游戏。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.gareth-gun-lance" },
        },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.gilles.skill.sc-gilles-1": {
    ...overrides["servant.gilles.skill.sc-gilles-1"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["attack.committed"],
    handlerId: "core.gilles-mass-summoning",
    supportLevel: "FULL",
    abilities: [{ id: "mass-summoning", name: "螺湮城教本(水魔)", activation: "phase", windows: ["action"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "paired-magic-draw", kind: "passive", printedClause: "打出时：若此牌与魔术攻击一同打出，抽一张牌。", execution: { mode: "handler", handlerId: "core.gilles-mass-summoning" } },
        { id: "mass-summoning", kind: "phase_action", printedClause: "行动阶段：从手牌打出至多3张魔术攻击并将它们的属性切换为力量或敏捷(必须切换)。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.gilles-mass-summoning" } },
      ],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.gilles.skill.sc-gilles-np": {
    ...overrides["servant.gilles.skill.sc-gilles-np"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["card.played", "combat.resolved", "round.started"],
    handlerId: "core.gilles-call-ancients",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "call-the-ancients",
        kind: "passive",
        printedClause: "【真名解放】\n打出时：将此牌放置于你所在的战场或关闭此牌。\n古神的呼唤-此牌失去宝具属性。当你位于被放置的此牌所在的战场时，将此牌加入攻击。当你于此战场战败，该战场关闭或其不(再)为战场时，关闭此牌。",
        execution: { mode: "handler", handlerId: "core.gilles-call-ancients" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.astolfo.skill.sc-astolfo-2": {
    ...overrides["servant.astolfo.skill.sc-astolfo-2"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    handlerId: "core.astolfo-trap-of-argalia", supportLevel: "FULL",
    abilities: [{ id: "forced-spiritform", name: "一碰就倒！", activation: "phase", windows: ["combat"], requiresActiveCard: true }],
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "forced-spiritform", kind: "phase_action", printedClause: "战斗阶段：将所有与你交战对手的力量和迅捷属性的攻击关闭。每张受此影响的牌，其持有者可以获得其魔力消耗+1的魔力或花费3点魔力防止关闭。", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.astolfo-trap-of-argalia" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.astolfo.skill.sc-astolfo-3": {
    ...overrides["servant.astolfo.skill.sc-astolfo-3"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    handlerId: "core.astolfo-casseur-de-logistille", supportLevel: "FULL",
    abilities: [{ id: "spellbreaker", name: "破咒一击", activation: "phase", windows: ["combat"], requiresActiveCard: true }],
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "spellbreaker", kind: "phase_action", printedClause: "【真名解放】\n破咒一击-战斗阶段：花费其魔力消耗，选择并关闭一张与你位于同一地点的技能牌。你可以令其他自愿的玩家帮助你花费魔力并令其获得1点战果（每名其他玩家最多花费1点）。", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.astolfo-casseur-de-logistille" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.caligula.skill.sc-caligula-2": {
    ...overrides["servant.caligula.skill.sc-caligula-2"],
    activation: "phase", windows: ["action", "combat"], requiresActiveCard: true, passiveEventTypes: ["combat.resolved"],
    handlerId: "core.caligula-mad-tyrant", supportLevel: "FULL",
    abilities: [
      { id: "make-insult", name: "暴君特权", activation: "phase", windows: ["action"], requiresActiveCard: true },
      { id: "injury", name: "中伤", activation: "phase", windows: ["combat"], requiresActiveCard: true },
      { id: "pity", name: "怜悯", activation: "phase", windows: ["combat"], requiresActiveCard: true }
    ],
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "make-insult", kind: "phase_action", printedClause: "行动阶段：打出一张暗置攻击作为【蔑】。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.caligula-mad-tyrant" } },
      { id: "injury", kind: "phase_action", printedClause: "中伤-战斗阶段：花费【蔑】的魔力消耗将其激活，令一名你战斗中的其他败者失去2点战果。", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.caligula-mad-tyrant" } },
      { id: "pity", kind: "phase_action", printedClause: "怜悯-战斗阶段：弃置暗置的【蔑】，若你获胜，获得1点魔力和1点战果。", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.caligula-mad-tyrant" } }
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.caligula.skill.sc-caligula-3": {
    ...overrides["servant.caligula.skill.sc-caligula-3"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    handlerId: "core.caligula-flucticulus-diana", supportLevel: "FULL",
    abilities: [{ id: "contagious-lunacy", name: "狂化蔓延", activation: "phase", windows: ["combat"], requiresActiveCard: true }],
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "contagious-lunacy", kind: "phase_action", printedClause: "【真名解放】狂化蔓延-战斗阶段：你与交战对手于下回合陷入【癫狂】。【癫狂】的玩家印刷于卡上的所有需激活的能力更改为“：+3合计威力。”", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.caligula-flucticulus-diana" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.medb.skill.sc-medb-2": {
    ...overrides["servant.medb.skill.sc-medb-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["round.ending"],
    handlerId: "core.medb-red-mead",
    supportLevel: "FULL",
    abilities: [{ id: "intoxicate", name: "我心爱的蜂蜜酒", activation: "phase", windows: ["action"], requiresActiveCard: true }],
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "intoxicate", kind: "phase_action", printedClause: "行动阶段：令一名与你位于同一地点的对手于下回合【迷醉】。下个回合结束时，你获得所有【迷醉】的对手本回合获得的等量战果。若其获得的战果少于3点，其失去3点战果。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.medb-red-mead" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.medb.skill.sc-medb-3": {
    ...overrides["servant.medb.skill.sc-medb-3"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.medb-chariot",
    supportLevel: "FULL",
    abilities: [{ id: "ensnare-winner", name: "战车·拜服", activation: "phase", windows: ["combat"], requiresActiveCard: true }],
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "ensnare-winner", kind: "phase_action", printedClause: "战斗阶段：令一名你战斗中的胜者于下回合【拜服】。下个回合前哨阶段，【拜服】者不进行部署，改为在你部署后，部署于你所在的地点，你必须部署在一处至少可供2名玩家部署的地点。", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.medb-chariot" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.ushiwakamaru.skill.sc-ushiwakamaru-1": {
    ...overrides["servant.ushiwakamaru.skill.sc-ushiwakamaru-1"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    tags: [...(overrides["servant.ushiwakamaru.skill.sc-ushiwakamaru-1"].tags ?? []), "controller-action-abilities-in-combat"],
    handlerId: "core.ushiwakamaru-icicle-cutter",
    supportLevel: "FULL",
    abilities: [{ id: "whirling-slashes", name: "旋回斩击", activation: "phase", windows: ["combat"], requiresActiveCard: true, uniqueGroup: "ushiwakamaru-whirling-slashes" }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "action-in-combat", kind: "passive", printedClause: "战斗阶段：你可以于战斗阶段使用牛若丸的行动阶段能力。（仍遵循每种能力每回合仅可使用一次的限制。）", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.ushiwakamaru-icicle-cutter" } },
        { id: "whirling-slashes", kind: "phase_action", printedClause: "）\n唯一/战斗阶段：再次使用一项攻击上的行动阶段或战斗阶段能力（由该能力使用，不计入原能力次数限制）。", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.ushiwakamaru-icicle-cutter" } },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.ushiwakamaru.skill.sc-ushiwakamaru-2": {
    ...overrides["servant.ushiwakamaru.skill.sc-ushiwakamaru-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.ushiwakamaru-eight-boat-leap",
    supportLevel: "FULL",
    abilities: [{ id: "eight-boat-leap", name: "坛之浦·八艘跳", activation: "phase", windows: ["action"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{ id: "eight-boat-leap", kind: "phase_action", printedClause: "行动阶段：和一名其他玩家比较合计威力大小（不计算未触发的战斗阶段的能力加成）。若你高于对手，将两人重新部署在对方的位置。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.ushiwakamaru-eight-boat-leap" } }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.clytie.skill.sc-clytie-1": {
    ...overrides["servant.clytie.skill.sc-clytie-1"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    standardAppend: true,
    handlerId: "core.clytie-starry-night",
    supportLevel: "FULL",
    abilities: [{ id: "starry-night", name: "星月夜", activation: "phase", windows: ["combat"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "starry-night", kind: "phase_action",
        printedClause: "战斗阶段：若你真名隐藏，位于战场和侦查的所有玩家将游戏外的一张【领域外生命】加入其手牌。若你已真名解放，所有【领域外生命】获得+3威力。",
        activation: { phase: "combat" }, conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.clytie-starry-night" },
      }], ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.clytie.skill.sc-clytie-2": {
    ...overrides["servant.clytie.skill.sc-clytie-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    requiresTrueName: true,
    standardAppend: true,
    handlerId: "core.clytie-water-nymph",
    supportLevel: "FULL",
    abilities: [{ id: "water-nymph", name: "水之宁芙", activation: "phase", windows: ["action"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "water-nymph", kind: "phase_action",
        printedClause: "行动阶段：为每张你控制的【领域外生命】分别抽并展示一张牌，该【领域外生命】获得对应被展示牌的所有属性。",
        activation: { phase: "action" }, conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.clytie-water-nymph" },
      }], ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.kotarou.skill.sc-kotarou-2": {
    ...overrides["servant.kotarou.skill.sc-kotarou-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    cardResidual: true,
    revealsTrueNameOnPlay: false,
    passiveEventTypes: ["combat.ending"],
    handlerId: "core.kotarou-chaos-brigade",
    supportLevel: "FULL",
    abilities: [{ id: "chaos-brigade-activate", name: "草木皆兵", activation: "phase", windows: ["combat"], abilityCost: 2, requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "loyal-shadows", kind: "passive", printedClause: "风声鹤唳-残留：若你于本回合使用了【气息遮断】的卡牌文字效果，战斗阶段结束后，【真名解放】并关闭此牌。", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.kotarou-chaos-brigade" } },
        { id: "chaos-brigade-activate", kind: "phase_action", printedClause: "草木皆兵-战斗阶段：花费2点魔力，激活你的一张暗置攻击，使用至多两次其【行动阶段】效果。", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.kotarou-chaos-brigade" } },
      ], ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.kotarou.skill.sc-kotarou-3": {
    ...overrides["servant.kotarou.skill.sc-kotarou-3"],
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: false,
    handlerId: "core.kotarou-shinobi-sabotage",
    supportLevel: "FULL",
    abilities: [
      { id: "shinobi-plant-ploys", name: "布置忍策", activation: "phase", windows: ["action"], requiresActiveCard: true },
      { id: "shinobi-resolve-ploys", name: "破坏工作〔忍术〕", activation: "phase", windows: ["combat"], requiresActiveCard: true },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "shinobi-plant-ploys", kind: "phase_action", printedClause: "被动/行动阶段：按回合顺位，每名玩家可以暗置打出一张手牌作为【策】。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.kotarou-shinobi-sabotage" } },
        { id: "shinobi-resolve-ploys", kind: "phase_action", printedClause: "战斗阶段：激活你战斗中所有的【策】，偷取所有【策】的威力（若没有【策】，视为0）低于你的【策】其他玩家的2点战果，然后弃置所有【策】。", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.kotarou-shinobi-sabotage" } },
      ], ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.taisui.skill.sc-taisui-2": {
    ...overrides["servant.taisui.skill.sc-taisui-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    hasReversalEffect: true,
    revealsTrueNameOnPlay: false,
    passiveEventTypes: ["player.entered-location"],
    handlerId: "core.taisui-calamity",
    supportLevel: "FULL",
    abilities: [{ id: "taisui-calamity-combat", name: "木星的镜像", activation: "phase", windows: ["combat"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "earth-dragon", kind: "passive", printedClause: "地龙-被动：当一名对手从【视肉】所在的地点出发进行移动时，【视肉】跟随其移动。", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.taisui-calamity" } },
        { id: "taisui-calamity-combat", kind: "phase_action", printedClause: "木星的镜像-战斗阶段：你在【视肉】所在的地点获得3点地利。反转：若你不位于该地点，改为偷取该地点所有玩家的1点战果。", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.taisui-calamity" } },
      ], ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.taisui.skill.sc-taisui-3": {
    ...overrides["servant.taisui.skill.sc-taisui-3"],
    activation: "phase",
    windows: ["outpost", "action"],
    requiresActiveCard: true,
    hasReversalEffect: true,
    revealsTrueNameOnPlay: false,
    handlerId: "core.taisui-awaken",
    supportLevel: "FULL",
    abilities: [
      { id: "taisui-flesh-place", name: "太岁头上动土", activation: "phase", windows: ["outpost"], requiresActiveCard: true },
      { id: "taisui-awaken-alter", name: "太岁觉醒", activation: "phase", windows: ["action"], requiresActiveCard: true, revealsTrueNameOnSkillUse: true },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "taisui-flesh-place", kind: "phase_action", printedClause: "被动/前哨阶段：将【视肉】放置于或移动至你所在的地点。", activation: { phase: "outpost" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.taisui-awaken" } },
        { id: "taisui-awaken-alter", kind: "phase_action", printedClause: "反转/行动阶段：【真名解放】，若你与【视肉】之间有一处地点，将你与【视肉】移动至此地点。若如此做，令位于此地点的所有对手【败北】。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.taisui-awaken" } },
      ], ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.enkidu.skill.sc-enkidu-1": {
    ...overrides["servant.enkidu.skill.sc-enkidu-1"],
    activation: "phase",
    windows: ["action"],
    requiresEightMana: true,
    requiresActiveCard: true,
    handlerId: "core.enkidu-transfiguration",
    supportLevel: "FULL",
    abilities: [
      { id: "enkidu-transfiguration-stack", name: "神造兵装", activation: "phase", windows: ["action"], requiresActiveCard: true },
      { id: "enkidu-transfiguration-discard", name: "变容", activation: "phase", windows: ["action"], requiresActiveCard: true },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "enkidu-transfiguration-passive", kind: "passive", printedClause: "神造兵装-被动：【变容】获得此牌上的牌堆顶部牌的威力、费用、属性与能力。", conditions: [{ type: "source_active" }], execution: { mode: "automatic" } },
        { id: "enkidu-transfiguration-discard", kind: "phase_action", printedClause: "被动/行动阶段：从此牌上的牌堆顶部弃置任意张牌，你激活的攻击获得所有被弃置牌的属性。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.enkidu-transfiguration" } },
        { id: "enkidu-transfiguration-stack", kind: "phase_action", printedClause: "行动阶段：将一张你手牌中的基础攻击叠放在此牌上。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.enkidu-transfiguration" } },
      ], ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.enkidu.skill.sc-enkidu-2": {
    ...overrides["servant.enkidu.skill.sc-enkidu-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.enkidu-enuma-elish",
    supportLevel: "FULL",
    abilities: [{ id: "enkidu-chains-of-heaven", name: "天之锁", activation: "phase", windows: ["combat"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{ id: "enkidu-chains-of-heaven", kind: "phase_action", printedClause: "天之锁-战斗阶段：【束缚】你的所有交战对手直至下个回合结束。被【束缚】的玩家无法使用宝具。", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.enkidu-enuma-elish" } }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.ishtar.skill.sc-ishtar-1": {
    ...overrides["servant.ishtar.skill.sc-ishtar-1"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: false,
    revealsTrueNameOnSkillUse: true,
    handlerId: "core.ishtar-divine-authority",
    supportLevel: "FULL",
    abilities: [{
      id: "divine-authority-swap", name: "闪耀的大王冠", activation: "phase", windows: ["combat"],
      requiresActiveCard: false, revealsTrueNameOnSkillUse: true, limit: "once-per-round",
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "divine-authority-luck",
          kind: "passive",
          printedClause: "被动：你的✖特殊属性牌名为【幸运】并获得“战斗阶段：你无视【败北】效果。",
          execution: { mode: "automatic" },
          transforms: [{
            id: "ishtar-special-becomes-luck",
            type: "card",
            target: { subject: "controller", cards: { attributesAny: ["特殊"] } },
            set: { name: "幸运" },
            grantAbilities: [{
              id: "ishtar-luck-ignore-defeat",
              name: "幸运·无视败北",
              activation: { phase: "combat" },
              limit: "once-per-round",
              ruleModifiers: [{
                id: "ishtar-luck-ignore-defeat-round",
                operation: "ignore",
                rule: "defeat",
                scope: { subject: "controller" },
                lifecycle: { duration: "this_round" },
              }],
            }],
            lifecycle: { duration: "permanent" },
          }],
        },
        {
          id: "divine-authority-swap",
          kind: "phase_action",
          printedClause: "被动/战斗阶段：【真名解放】。关闭你的一张【幸运】并打出另一张【幸运】，支付其费用并使用其行动阶段能力。",
          activation: { phase: "combat" },
          execution: { mode: "handler", handlerId: "core.ishtar-divine-authority" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.ishtar.skill.sc-ishtar-2": {
    ...overrides["servant.ishtar.skill.sc-ishtar-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["card.played"],
    handlerId: "core.ishtar-an-gal-ta-kigal-she",
    supportLevel: "FULL",
    abilities: [{ id: "an-gal-challenge", name: "山脉震撼明星之薪", activation: "phase", windows: ["combat"], requiresActiveCard: true, limit: "once-per-round" }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "an-gal-exile",
          kind: "play_trigger",
          printedClause: "【真名解放】\n打出时：将你从桌面上移除游戏。",
          execution: { mode: "handler", handlerId: "core.ishtar-an-gal-ta-kigal-she" },
        },
        {
          id: "an-gal-challenge",
          kind: "phase_action",
          printedClause: "战斗阶段：选择一处战场，若你的合计威力比该处获胜者的合计威力更高，则你取代变为胜利者。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.ishtar-an-gal-ta-kigal-she" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.taiga.skill.s1a": {
    ...overrides["master.taiga.skill.s1a"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.taiga-fates-guide",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "fates-guide",
        kind: "passive",
        printedClause: "当你赢得一场战斗时，每位因此战败的玩家获得一枚【老虎】标记。你每分发一枚【老虎】标记便获得1点战果。每有1枚【老虎】标记合计威力+1，至多+3。",
        conditions: [{ type: "event_type_is", eventType: "combat.resolved" }, { type: "event_player_won_combat" }],
        execution: { mode: "handler", handlerId: "core.taiga-fates-guide" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.taiga.skill.ascension": {
    ...overrides["master.taiga.skill.ascension"],
    initiallyOwned: false,
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.taiga-domestic-carnage",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "domestic-carnage",
        kind: "passive",
        printedClause: "家里的屠杀-魔术工房变为战场。（交战规则适用，不添加任何事件牌）。魔术工房的竞争战果等于当前局势牌的魔力值。",
        conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }],
        execution: { mode: "handler", handlerId: "core.taiga-domestic-carnage" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.fou.skill.s1": {
    ...overrides["master.fou.skill.s1"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["round.ending"],
    handlerId: "core.fou-mark-of-beast",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "mark-of-beast",
        kind: "passive",
        printedClause: "在你花费了1枚或以上的令咒的回合结束时：选择一个本回合回到你技能区的技能，其获得+1威力和-1魔力消耗直至游戏结束。降低过的消耗不能低于其印刷魔力消耗的一半。",
        conditions: [{ type: "event_type_is", eventType: "round.ending" }],
        execution: { mode: "handler", handlerId: "core.fou-mark-of-beast" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.fou.skill.ascension": {
    ...overrides["master.fou.skill.ascension"],
    initiallyOwned: false,
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["round.ending", "elimination.resolved"],
    handlerId: "core.fou-force-of-providence",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "resurrection",
        kind: "passive",
        printedClause: "复活吧，我的爱人-每局游戏限一次，当一名玩家即将被淘汰时，防止其淘汰。本次淘汰结算后，若该玩家为你的对手，交换你们的战果。你们其中一人获得游戏胜利时，另一人也获胜（即使另一人被淘汰）。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.fou-force-of-providence" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.tiamat.skill.s1": {
    ...overrides["master.tiamat.skill.s1"],
    activation: "passive",
    handlerId: "core.tiamat-mother-of-all",
    passiveEventTypes: ["game.started", "player.command-seal-gain-replaced"],
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "mother-of-all",
        kind: "passive",
        printedClause: "你没有令咒。将【生命之海】加入你的技能区。当你获得令咒时，改为将一张【魔兽】加入攻击。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.tiamat-mother-of-all" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.tiamat.skill.ascension": {
    ...overrides["master.tiamat.skill.ascension"],
    initiallyOwned: false,
    activation: "passive",
    handlerId: "core.structured-skill",
    faceDownAttackFollowup: { exactCount: 2, definitionId: "servant.shakespeare.skill.sc-shakespeare-3" },
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "titan-form",
        kind: "passive",
        printedClause: "你不能进入魔术工房。无视阻碍你打出牌的卡牌效果。你的基础攻击费用+3且威力+5。你可以选择暗置打出2张牌作为攻击，若如此，将【生命之海】加入你的攻击。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "automatic" },
        ruleModifiers: [
          { id: "titan-no-workshop-deploy", rule: "deployment_destinations", operation: "forbid", scope: { subject: "controller", locationIds: ["workshop"] }, lifecycle: { duration: "permanent" } },
          { id: "titan-no-workshop-move", rule: "movement_destinations", operation: "forbid", scope: { subject: "controller", toLocationIds: ["workshop"] }, lifecycle: { duration: "permanent" } },
          { id: "titan-ignore-card-play-prevention", rule: "card_play", operation: "ignore", scope: { subject: "controller" }, lifecycle: { duration: "permanent" } },
          { id: "titan-basic-cost", rule: "card_cost", operation: "add", scope: { subject: "controller", cards: { basic: true } }, value: 3, lifecycle: { duration: "permanent" } },
          { id: "titan-basic-power", rule: "card_power", operation: "add", scope: { subject: "controller", cards: { basic: true } }, value: 5, lifecycle: { duration: "permanent" } },
        ],
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Bazett's day-cycle package must apply after structured/authoring compatibility
// layers.  Earlier definitions are intentionally shadowed by those generated
// layers, so keep the verified executable rewrite at the final override tier.
Object.assign(overrides, {
  "master.bazett.skill.s1a": {
    ...overrides["master.bazett.skill.s1a"],
    activation: "passive",
    passiveEventTypes: ["game.started", "combat.resolved", "round.ending", "round.started"],
    handlerId: "core.bazett-time-loop",
    supportLevel: "FULL",
    uniqueGroup: "bazett-time-loop",
  },
  "master.bazett.skill.s1c": {
    ...overrides["master.bazett.skill.s1c"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    handlerId: "core.bazett-time-loop",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "second-day",
        kind: "passive",
        printedClause: "你拥有的魔力少于8点也可以打出【佛拉格拉克】且其于本回合失去<每局游戏限一次>。战斗阶段：若你获胜，获得2点战果。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.bazett-time-loop" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.bazett.skill.s1d": {
    ...overrides["master.bazett.skill.s1d"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    handlerId: "core.bazett-time-loop",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "fourth-day",
        kind: "passive",
        printedClause: "若你于本回合获胜，【觉醒】。若你于回合结束时未【觉醒】，【再启动】。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.bazett-time-loop" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.bazett.skill.s4": {
    ...overrides["master.bazett.skill.s4"],
    activation: "passive",
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.bazett-time-loop",
    supportLevel: "FULL",
    uniqueGroup: "bazett-time-loop",
  },
  "master.bazett.skill.ascension": {
    ...overrides["master.bazett.skill.ascension"],
    initiallyOwned: false,
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.bazett-flawless-defense",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "flawless-defense",
        kind: "passive",
        printedClause: "【佛拉格拉克】失去<每局游戏限一次>并获得：\"残留：此牌持续激活至你触发先发后至或再启动。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.bazett-flawless-defense" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Melusine's transformation package is applied at the final tier because the
// older structured batch intentionally left replacement/zone handling partial.
// Physical provenance, not display text, identifies the original Servant cards.
Object.assign(overrides, {
  "servant.melusine.skill.sc-melusine-1": {
    ...overrides["servant.melusine.skill.sc-melusine-1"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    revealsTrueNameOnPlay: false,
    passiveEventTypes: ["player.defeated"],
    handlerId: "core.melusine-ray-horizon",
    supportLevel: "FULL",
    tags: [...new Set([...(overrides["servant.melusine.skill.sc-melusine-1"]?.tags ?? []), "cannot-copy", "cannot-steal"])],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "ray-horizon-defeat",
        kind: "passive",
        printedClause: "被动：此效果无法被复制或盗用，当梅柳齐娜战败时，展示此牌。若她战败时此牌已被展示，将你的从者梅柳齐娜替换为阿尔比恩之骸并【真名解放】（阿尔比恩之骸是一名拥有不同牌库和上述技能的从者）。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.melusine-ray-horizon" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.melusine.skill.sc-melusine-2": {
    ...overrides["servant.melusine.skill.sc-melusine-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    handlerId: "core.melusine-perl-dancer",
    supportLevel: "FULL",
    abilities: [{
      id: "perl-dancer-play",
      name: "佩里舞者",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "perl-dancer-play",
        kind: "phase_action",
        printedClause: "行动阶段：从手牌中打出至多2张基础攻击。若你于本回合进行了移动，你可将此效果更改为“抽一张牌，然后从手牌中打出至多3张基础攻击。”",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.melusine-perl-dancer" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Kotomine Shirou / Master Amakusa: the final tier replaces the earlier
// host-adjudicated Vassal/payment clauses with executable linked-player rules.
Object.assign(overrides, {
  "master.amakusa.skill.s3": {
    ...overrides["master.amakusa.skill.s3"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    suppressInferredLimit: true,
    passiveEventTypes: ["game.started", "combat.resolved"],
    handlerId: "core.amakusa-vassal",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "vassal-linked-entry",
          kind: "passive",
          printedClause: "非高潮回合，你需花费一枚令咒才可进入天草四郎所在的战场。",
          conditions: [{ type: "source_owned" }],
          execution: { mode: "handler", handlerId: "core.amakusa-vassal" },
        },
        {
          id: "vassal-linked-mana",
          kind: "passive",
          printedClause: "每回合限一次，若你与天草四郎同时位于不同的战场，你花费魔力时，可以将天草四郎的1点魔力加入支付。",
          conditions: [{ type: "source_owned" }],
          execution: { mode: "handler", handlerId: "core.amakusa-vassal" },
        },
        {
          id: "vassal-different-fight-reward",
          kind: "passive",
          printedClause: "若你与天草四郎于同一回合赢得了不同的战斗，你与其各获得1点战果。",
          conditions: [{ type: "source_owned" }, { type: "event_type_is", eventType: "combat.resolved" }],
          execution: { mode: "handler", handlerId: "core.amakusa-vassal" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.amakusa.skill.ascension": {
    ...overrides["master.amakusa.skill.ascension"],
    initiallyOwned: false,
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked", "card.played", "card.entered-attack"],
    handlerId: "core.amakusa-past-ruler",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "past-ruler-seal-loss",
          kind: "passive",
          printedClause: "解锁此牌后所有对手立即失去2枚令咒。",
          conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }],
          execution: { mode: "handler", handlerId: "core.amakusa-past-ruler" },
        },
        {
          id: "past-ruler-first-folio",
          kind: "passive",
          printedClause: "【开演之时已至，此处应有雷鸣般的喝彩】激活时，你的基础牌获得威力+4。",
          conditions: [{ type: "source_owned" }],
          execution: { mode: "handler", handlerId: "core.amakusa-past-ruler" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);
delete overrides["master.amakusa.skill.s3"].limit;

// Odysseus: Troia Hippos uses physical control without changing ownership;
// Aigis serializes each affected player's pay-or-move choice and installs the
// round-scoped +2 movement cost per traversed space.
Object.assign(overrides, {
  "servant.odysseus.skill.sc-odysseus-1": {
    ...overrides["servant.odysseus.skill.sc-odysseus-1"],
    activation: "residual",
    windows: [],
    cardResidual: true,
    requiresActiveCard: false,
    passiveEventTypes: ["card.played", "combat.resolved", "round.ending"],
    handlerId: "core.odysseus-troia-hippos",
    supportLevel: "FULL",
    tags: [...new Set([...(overrides["servant.odysseus.skill.sc-odysseus-1"]?.tags ?? []), "requires-other-player-same-location-to-play"])],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "troia-lend-on-play",
          kind: "passive",
          printedClause: "你需将此牌借给一名与你位于同一地点的其他玩家才可打出。",
          conditions: [{ type: "event_type_is", eventType: "card.played" }],
          execution: { mode: "handler", handlerId: "core.odysseus-troia-hippos" },
        },
        {
          id: "troia-steal",
          kind: "residual",
          printedClause: "残留：回合结束时，奥德修斯偷取此牌的控制者1点战果。",
          conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "round.ending" }],
          execution: { mode: "handler", handlerId: "core.odysseus-troia-hippos" },
        },
        {
          id: "troia-recall",
          kind: "residual",
          printedClause: "除此牌打出的回合，进行战力结算时若奥德修斯与控制者交战，令此牌返回奥德修斯的攻击区并于回合结束时关闭此牌。",
          conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "combat.resolved" }],
          execution: { mode: "handler", handlerId: "core.odysseus-troia-hippos" },
        },
        {
          id: "troia-tactical-support",
          kind: "residual",
          printedClause: "战术支援-你的✖特殊属性攻击+3威力。",
          conditions: [{ type: "source_active" }],
          ruleModifiers: [{
            id: "troia-special-power",
            rule: "card_power",
            operation: "add",
            scope: { subject: "controller", cards: { attributesAny: ["特殊"] } },
            value: 3,
            lifecycle: { duration: "while_active" },
          }],
          execution: { mode: "automatic" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.odysseus.skill.sc-odysseus-2": {
    ...overrides["servant.odysseus.skill.sc-odysseus-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.odysseus-aigis",
    supportLevel: "FULL",
    abilities: [{
      id: "aigis-retreat",
      name: "神体结界",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: true,
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "aigis-retreat",
        kind: "phase_action",
        printedClause: "行动阶段：所有玩家依次逆着箭头移动至下一地点除非其支付4点魔力。没有移动的玩家合计威力-5。每个空间的移动成本+2。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.odysseus-aigis" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);
// The authoritative Stheno card image has no per-game limit on 女?的绮?
// the older structured batch inferred one from the "non-once-per-game attack" target restriction.
// Baobhan Sith: Part Collector stores one Fetch per distinct player, preserving
// the captured power at settlement; Fetch Failnaught chooses exactly one stored
// Fetch, can reach its original player across locations, and consumes it at the
// end of the round.
Object.assign(overrides, {
  "servant.baobhan.skill.sc-baobhan-1": {
    ...overrides["servant.baobhan.skill.sc-baobhan-1"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    passiveEventTypes: ["combat.resolved", "combat.ending"],
    handlerId: "core.baobhan-part-collector",
    supportLevel: "FULL",
    abilities: [{ id: "part-collector", name: "受祝福的后继者", activation: "phase", windows: ["combat"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "part-collector",
          kind: "phase_action",
          printedClause: "受祝福的后继者-战斗阶段：选择任意名与你位于同一地点的，不具有【分身】的对手，战力结算时，除非你处于【败北】状态或被选择的对手离开该地点，以他们各自的当前合计威力创造相应的【分身】。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.baobhan-part-collector" },
        },
        {
          id: "part-collector-battlefield-settlement",
          kind: "passive",
          printedClause: "受祝福的后继者-战斗阶段：选择任意名与你位于同一地点的，不具有【分身】的对手，战力结算时，除非你处于【败北】状态或被选择的对手离开该地点，以他们各自的当前合计威力创造相应的【分身】。",
          conditions: [{ type: "event_type_is", eventType: "combat.resolved" }],
          execution: { mode: "handler", handlerId: "core.baobhan-part-collector" },
        },
        {
          id: "part-collector-nonbattlefield-settlement",
          kind: "passive",
          printedClause: "受祝福的后继者-战斗阶段：选择任意名与你位于同一地点的，不具有【分身】的对手，战力结算时，除非你处于【败北】状态或被选择的对手离开该地点，以他们各自的当前合计威力创造相应的【分身】。",
          conditions: [{ type: "event_type_is", eventType: "combat.ending" }],
          execution: { mode: "handler", handlerId: "core.baobhan-part-collector" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.baobhan.skill.sc-baobhan-2": {
    ...overrides["servant.baobhan.skill.sc-baobhan-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.resolved", "round.ending"],
    handlerId: "core.baobhan-fetch-failnaught",
    supportLevel: "FULL",
    abilities: [{ id: "fetch-failnaught", name: "妖精吸血", activation: "phase", windows: ["action"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "fetch-failnaught",
          kind: "phase_action",
          printedClause: "妖精吸血-行动阶段：选择一名【分身】，在你的战斗阶段，若你的合计威力超过该【分身】，令【分身】的本体【败北】。回合结束时，移除该【分身】。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.baobhan-fetch-failnaught" },
        },
        {
          id: "fetch-failnaught-combat-settlement",
          kind: "passive",
          printedClause: "【真名解放】\n妖精吸血-行动阶段：选择一名【分身】，在你的战斗阶段，若你的合计威力超过该【分身】，令【分身】的本体【败北】。回合结束时，移除该【分身】。",
          conditions: [{ type: "event_type_is", eventType: "combat.resolved" }],
          execution: { mode: "handler", handlerId: "core.baobhan-fetch-failnaught" },
        },
        {
          id: "fetch-failnaught-cleanup",
          kind: "passive",
          printedClause: "回合结束时，移除该【分身】。",
          conditions: [{ type: "event_type_is", eventType: "round.ending" }],
          execution: { mode: "handler", handlerId: "core.baobhan-fetch-failnaught" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Musashibou Benkei (English original card text): Intimidation has three
// independently once-per-game choices; Evenly Matched itself is not once per
// game. Each physical copy persists until the end of a round in which it is
// actually used, replaces every activated effect with +3 total power, and loses
// all other source-card text.
Object.assign(overrides, {
  "servant.benkei.skill.sc-benkei-2": {
    ...overrides["servant.benkei.skill.sc-benkei-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.benkei-bulwark",
    supportLevel: "FULL",
    abilities: [{ id: "intimidation", name: "怨灵调伏", activation: "phase", windows: ["action"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "intimidation",
        kind: "phase_action",
        printedClause: "【真名解放】\n怨灵调伏-行动阶段：选择下列选项中的一个，对手不可使用你选择的选项直到回合结束：\n-令咒\n-宝具\n-由【颉颃胜负】复制的技能\n每项选项每局游戏仅可选择一次。",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.benkei-bulwark" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.benkei.skill.sc-benkei-3": {
    ...overrides["servant.benkei.skill.sc-benkei-3"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    suppressInferredLimit: true,
    passiveEventTypes: ["skill.used"],
    handlerId: "core.benkei-evenly-matched",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "evenly-matched-copy",
        kind: "passive",
        printedClause: "被动：当与你交战的对手使用了一张你未复制的技能时，你可以弃置一张手牌，将其复制并加入你的技能区并令其获得<每局游戏限一次>。复制的激活效果均更改为：“+3合计威力”并失去所有其他卡牌文字效果。",
        conditions: [{ type: "event_type_is", eventType: "skill.used" }],
        execution: { mode: "handler", handlerId: "core.benkei-evenly-matched" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);
delete overrides["servant.benkei.skill.sc-benkei-3"].limit;

// Caules Yggdmillennia (development-card text + local QA): Hanging Tree Thunder
// is a Skill, can only be played after Primeval Battery activates its physical
// skill card, and tracks declaration history as structured play state. Last
// Narrator rewrites the declaration to be secret/repeatable and schedules the
// replacement deck after cleanup but before the next round draw.
Object.assign(overrides, {
  "master.caules-yggdmillennia.skill.s3": {
    ...overrides["master.caules-yggdmillennia.skill.s3"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    requiresActiveInSkillZoneToPlay: true,
    standardAppend: true,
    playAttributeDeclaration: {
      allowedAttributes: ["力量", "迅捷", "魔术", "特殊", "宝具"],
      uniquePerGame: true,
      repeatAllowedWithOwnedSkillId: "master.caules-yggdmillennia.skill.ascension",
    },
    handlerId: "core.caules-yggdmillennia-thunder",
    supportLevel: "FULL",
    abilities: [{ id: "electromancy", name: "电气魔术", activation: "phase", windows: ["combat"], requiresActiveCard: true }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "thunder-declaration",
          kind: "play_trigger",
          printedClause: "此牌需追加打出，你需宣言一种本局游戏未宣言过的属性才可打出此牌。",
          execution: { mode: "automatic" },
        },
        {
          id: "electromancy",
          kind: "phase_action",
          printedClause: "电气魔术-战斗阶段：将所有与你位于同一战场的对手控制的，具有你宣言属性的基础攻击的威力设为0。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.caules-yggdmillennia-thunder" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.caules-yggdmillennia.skill.ascension": {
    ...overrides["master.caules-yggdmillennia.skill.ascension"],
    initiallyOwned: false,
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked", "card.played", "phase.transitioned"],
    handlerId: "core.caules-yggdmillennia-last-narrator",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "secret-thunder-declaration",
          kind: "passive",
          printedClause: "你的【绞首刑之雷】更改为：\"打出时：秘密宣言一种属性并于你的战斗阶段开始时展示\"。",
          execution: { mode: "handler", handlerId: "core.caules-yggdmillennia-last-narrator" },
        },
        {
          id: "rebuild-deck-after-unlock-round",
          kind: "passive",
          printedClause: "解锁此技能的回合结束后，从牌库、弃牌堆以及手牌移除你的所有牌；",
          conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }],
          execution: { mode: "handler", handlerId: "core.caules-yggdmillennia-last-narrator" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Meltryllis (English card/Wiki rulings + development-card text): Melt Virus
// applies a next-round physical-card infection and its reversed form creates
// fresh temporary full-text copies. Saraswati Meltout shares one per-round use
// between its Combat and Alter/Action abilities.
Object.assign(overrides, {
  "servant.meltryllis.skill.sc-meltryllis-1": {
    ...overrides["servant.meltryllis.skill.sc-meltryllis-1"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    hasReversalEffect: true,
    handlerId: "core.meltryllis-melt-virus",
    supportLevel: "FULL",
    abilities: [
      {
        id: "absorb",
        name: "吸收",
        activation: "phase",
        windows: ["combat"],
        requiresActiveCard: true,
        handlerId: "core.meltryllis-melt-virus",
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "melt-virus-infection",
          kind: "phase_action",
          printedClause: "吸收-战斗阶段：与你交战的所有对手在其下个回合开始时随机【感染】一张技能区的牌直至回合结束。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.meltryllis-melt-virus" },
        },
        {
          id: "melt-virus-reversed-copy",
          kind: "phase_action",
          printedClause: "反转：下个回合，将所有被【感染】的牌的临时复制加入你的技能区。当它们提到一个名字时，视为被提到的是你。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.meltryllis-melt-virus" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.meltryllis.skill.sc-meltryllis-2": {
    ...overrides["servant.meltryllis.skill.sc-meltryllis-2"],
    activation: "phase",
    windows: ["combat", "action"],
    requiresActiveCard: true,
    hasReversalEffect: true,
    revealsTrueNameOnPlay: true,
    handlerId: "core.meltryllis-saraswati-meltout",
    supportLevel: "FULL",
    abilities: [
      {
        id: "liquid-body",
        name: "流体",
        activation: "phase",
        windows: ["combat"],
        requiresActiveCard: true,
        uniqueGroup: "meltryllis-saraswati-one-ability",
        handlerId: "core.meltryllis-saraswati-meltout",
      },
      {
        id: "alter-play",
        name: "反转/行动阶段",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
        uniqueGroup: "meltryllis-saraswati-one-ability",
        handlerId: "core.meltryllis-saraswati-meltout",
      },
    ],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "saraswati-liquid-body",
          kind: "phase_action",
          printedClause: "【真名解放】\n每回合仅限使用【弁财天五弦琵琶】上的一项能力。\n战斗阶段：将与你交战的所有对手的力量属性牌威力减至3点。\n反转/行动阶段：从手牌中打出最多三张牌。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.meltryllis-saraswati-meltout" },
        },
        {
          id: "saraswati-alter-play",
          kind: "phase_action",
          printedClause: "反转/行动阶段：从手牌中打出最多三张牌。",
          activation: { phase: "action" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.meltryllis-saraswati-meltout" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Lancelot (English original card text + Fandom rulings): both copy effects
// copy printed definitions only, never target-instance tokens/stacks. Eternal
// Arms Mastery uses the English defeated/Luck condition; For Someone's Glory
// transforms its own physical card until round end and discounts copied mana cost.
Object.assign(overrides, {
  "servant.lance.skill.sc-lance-1": {
    ...overrides["servant.lance.skill.sc-lance-1"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    handlerId: "core.lancelot-eternal-arms-mastery",
    supportLevel: "FULL",
    abilities: [{
      id: "copy-attack",
      name: "无穷的武练",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
      handlerId: "core.lancelot-eternal-arms-mastery",
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "eternal-arms-mastery-copy",
        kind: "phase_action",
        printedClause: "战斗阶段：如果你并未【败北】或你打出【幸运】来防止此效果，本牌变为任意一张与你同战场的激活的非残留力量或迅捷属性的攻击。若你选择的攻击为自己控制的卡牌，此复制威力+3。",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.lancelot-eternal-arms-mastery" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.lance.skill.sc-lance-3": {
    ...overrides["servant.lance.skill.sc-lance-3"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    handlerId: "core.lancelot-for-someones-glory",
    supportLevel: "FULL",
    abilities: [{
      id: "shapeshift",
      name: "变貌",
      activation: "phase",
      windows: ["action"],
      requiresActiveCard: false,
      handlerId: "core.lancelot-for-someones-glory",
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "for-someones-glory-copy",
        kind: "phase_action",
        printedClause: "行动阶段: 花费一枚令咒。直到回合结束前，此牌变为一张已被展示的非<一局游戏限一次>的技能或攻击的复制。",
        activation: { phase: "action" },
        execution: { mode: "handler", handlerId: "core.lancelot-for-someones-glory" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Elizabeth Bathory: the dedicated Volume/Iron Maiden runtime already existed,
// but these cards remained PARTIAL.  Keep Volume itself unbounded (Wiki ruling)
// and cap only Prison Castle's 3x total-power conversion at 15.
Object.assign(overrides, {
  "servant.elizabeth.skill.sc-elizabeth-1": {
    ...overrides["servant.elizabeth.skill.sc-elizabeth-1"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.elizabeth-volume-power",
    supportLevel: "FULL",
    elizabethVolumePower: { perMarker: 3, max: 15 },
    elizabethVolumeLossOnCombatLoss: 3,
    abilities: [{
      id: "volume-power",
      name: "音量放大",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
      handlerId: "core.elizabeth-volume-power",
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "volume-loss-on-defeat",
          kind: "passive",
          printedClause: "若你战败，失去3枚【音量】。",
          conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "combat.resolved" }],
          execution: { mode: "handler", handlerId: "core.elizabeth-volume-loss" },
        },
        {
          id: "volume-power",
          kind: "phase_action",
          printedClause: "战斗阶段：获得你【音量】标记3倍的合计威力（至多15）。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.elizabeth-volume-power" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.elizabeth.skill.sc-elizabeth-2": {
    ...overrides["servant.elizabeth.skill.sc-elizabeth-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.ending"],
    handlerId: "core.elizabeth-vocal-performance",
    supportLevel: "FULL",
    elizabethVocalPerformance: { markersPerOpponent: 1, loseIfNoCombatThisRound: 1 },
    abilities: [{
      id: "vocal-performance",
      name: "天籁之音",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
      handlerId: "core.elizabeth-vocal-performance",
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "volume-loss-if-no-combat",
          kind: "passive",
          printedClause: "被动：战斗阶段结束后，若你未参与争夺战，失去1枚【音量】标记。",
          conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "combat.ending" }],
          execution: { mode: "handler", handlerId: "core.elizabeth-vocal-performance" },
        },
        {
          id: "vocal-performance",
          kind: "phase_action",
          printedClause: "“天籁之音”-战斗阶段：你的战斗中每有一名对手，你便获得1枚【音量】标记。此牌获得你【音量】标记数的威力。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.elizabeth-vocal-performance" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.elizabeth.skill.sc-elizabeth-3": {
    ...overrides["servant.elizabeth.skill.sc-elizabeth-3"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.elizabeth-iron-maiden",
    supportLevel: "FULL",
    elizabethIronMaiden: { loserVictoryPointLoss: 2, controllerVictoryPointGainIfIncludesOverallLowest: 2 },
    abilities: [{
      id: "iron-maiden",
      name: "铁处女",
      activation: "phase",
      windows: ["combat"],
      requiresActiveCard: true,
      handlerId: "core.elizabeth-iron-maiden",
    }],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "sadistic-charisma",
          kind: "passive",
          printedClause: "嗜虐的魅力-若你与战果低于你的对手位于同一战场，此牌-2魔力消耗。",
          conditions: [{ type: "source_owned" }, { type: "same_battlefield_lower_victory_opponent" }],
          ruleModifiers: [{
            id: "torture-techniques-cost-minus-two",
            operation: "subtract",
            rule: "card_cost",
            scope: {
              subject: "controller",
              cards: { definitionIds: ["servant.elizabeth.skill.sc-elizabeth-3", "card.skill.servant.elizabeth.skill.sc-elizabeth-3"] },
            },
            value: 2,
          }],
          execution: { mode: "automatic" },
        },
        {
          id: "iron-maiden",
          kind: "phase_action",
          printedClause: "铁处女-战斗阶段：若你获胜，你战斗中战果最低的所有败者失去2点战果。若其中包含战果排名倒数第一的，你再获得2点战果。",
          activation: { phase: "combat" },
          conditions: [{ type: "source_active" }],
          execution: { mode: "handler", handlerId: "core.elizabeth-iron-maiden" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Roche Frain: Innocence moves the normal preparation refill to the whole Action-phase start;
// Betrayal is a generated deck card (not a skill-zone card), keeps its draw trigger after ascension,
// and gains Magic/+3 power per lost seal/standard append only after Noble Sacrifice.
Object.assign(overrides, {
  "master.roche.skill.s1": {
    ...overrides["master.roche.skill.s1"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["game.started"],
    handlerId: "core.roche-innocence",
    supportLevel: "FULL",
    tags: [...new Set([...(overrides["master.roche.skill.s1"]?.tags ?? []), "defer-preparation-draw-to-action-start"])],
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "innocence",
        kind: "passive",
        printedClause: "你的手牌保持展示，你改为于整个行动阶段开始时而不是准备阶段开始时抽牌。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.roche-innocence" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.roche.skill.s2": {
    ...overrides["master.roche.skill.s2"],
    initiallyOwned: false,
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    requiresEightMana: false,
    materializedCardType: "attack",
    playRequiresPlayerFlag: { key: "rocheNobleSacrificeActive", value: true },
    passiveEventTypes: ["card.drawn"],
    handlerId: "core.roche-betrayal",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "betrayal-draw",
          kind: "passive",
          printedClause: "被动：当你抽到此牌时，再抽一张牌。",
          conditions: [{ type: "event_type_is", eventType: "card.drawn" }],
          execution: { mode: "handler", handlerId: "core.roche-betrayal" },
        },
        {
          id: "master-servant-conflict",
          kind: "passive",
          printedClause: "主从争斗-唯一/被动：当罗榭的手牌中拥有3张或更多【变节】时，他立即失去6点战果，然后他可以花费一枚令咒并将所有【变节】洗回牌堆。若他不花费，其立即【败北】并将所有【变节】弃置。",
          conditions: [{ type: "source_owned" }],
          execution: { mode: "handler", handlerId: "core.roche-betrayal" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.roche.skill.ascension": {
    ...overrides["master.roche.skill.ascension"],
    initiallyOwned: false,
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.roche-noble-sacrifice",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "noble-sacrifice",
        kind: "passive",
        printedClause: "若你本局游戏未因【变节】败北：失去巨测指导、天真和你的所有令咒。每失去一枚令咒，【变节】获得+3威力。【变节】同时获得魔术属性和\"此牌需追加打出\"并失去主从争斗。",
        conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }],
        execution: { mode: "handler", handlerId: "core.roche-noble-sacrifice" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Julius Belisk Harwey (English original): Skulk replaces ordinary Outpost deployment
// with deployment at the start of Julius's own Action turn. Black Scorpion may allow
// Workshop, or delay that deployment to his Combat turn by paying 2 mana.
Object.assign(overrides, {
  "master.julius.skill.s1": {
    ...overrides["master.julius.skill.s1"],
    activation: "phase",
    windows: ["outpost"],
    requiresActiveCard: false,
    passiveEventTypes: ["phase.transitioned"],
    handlerId: "core.julius-skulk",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "cc-skulk",
          kind: "phase_action",
          printedClause: "前哨阶段：本阶段不进行部署，于你的行动阶段开始时部署于一处战场。",
          activation: { phase: "outpost" },
          conditions: [{ type: "source_owned" }],
          execution: { mode: "handler", handlerId: "core.julius-skulk" },
        },
        {
          id: "cc-skulk-delayed-deployment",
          kind: "passive",
          printedClause: "前哨阶段：本阶段不进行部署，于你的行动阶段开始时部署于一处战场。",
          conditions: [{ type: "event_type_is", eventType: "phase.transitioned" }],
          execution: { mode: "handler", handlerId: "core.julius-skulk" },
        },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.julius.skill.s1a": {
    ...overrides["master.julius.skill.s1a"],
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["round.ending"],
    handlerId: "core.julius-rapid-aging",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "rapid-aging",
        kind: "passive",
        printedClause: "每回合结束时移除你弃牌堆中两张牌或随机弃置一张牌。若无法执行，需要先抽一张牌。",
        conditions: [{ type: "source_owned" }, { type: "event_type_is", eventType: "round.ending" }],
        execution: { mode: "handler", handlerId: "core.julius-rapid-aging" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "master.julius.skill.ascension": {
    ...overrides["master.julius.skill.ascension"],
    initiallyOwned: false,
    activation: "passive",
    windows: [],
    requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.julius-black-scorpion",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "black-scorpion",
        kind: "passive",
        printedClause: "安全增强方案-当你使用【潜行】时，可以部署于魔术工房。\n隐身增强方案-当你使用【潜行】时，可以花费2点魔力，改为于自己的战斗阶段中进行部署。",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "handler", handlerId: "core.julius-black-scorpion" },
      }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Matou Zouken (English original): Founder replaces Command Seal gain/payment
// with 4 mana per seal; Pseudo Vampire supplies two independent Combat abilities;
// Illusive Mastermind removes Blood Worms' win gate and permits movement while engaged.
Object.assign(overrides, {
  "master.zouken.skill.s3": {
    ...overrides["master.zouken.skill.s3"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    passiveEventTypes: ["game.started", "combat.resolved"],
    handlerId: "core.zouken-founder",
    supportLevel: "FULL",
  },
  "master.zouken.skill.s4": {
    ...overrides["master.zouken.skill.s4"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: false,
    passiveEventTypes: ["round.ending"],
    abilities: [
      { id: "blood-worms", name: "刻印虫", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.zouken-pseudo-vampire", requiresActiveCard: false },
      { id: "bug-form", name: "虫之身", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.zouken-pseudo-vampire", requiresActiveCard: false },
    ],
    handlerId: "core.zouken-pseudo-vampire",
    supportLevel: "FULL",
  },
  "master.zouken.skill.ascension": {
    ...overrides["master.zouken.skill.ascension"],
    initiallyOwned: false,
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.zouken-illusive-mastermind",
    supportLevel: "FULL",
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Chevalier d'Eon (English original / Wiki rulings): Parry compares printed base
// power, must close a matching attack when one exists, but a nonmatching discard is legal.
Object.assign(overrides, {
  "servant.deon.skill.sc-deon-1": {
    ...overrides["servant.deon.skill.sc-deon-1"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    requiresEightMana: false,
    lowManaSkillPlaySurcharge: { thresholdExclusive: 8, amount: 1 },
    passiveEventTypes: ["phase.player-window.closed"],
    handlerId: "core.deon-sword-dance",
    supportLevel: "FULL",
  },
  "servant.deon.skill.sc-deon-2": {
    ...overrides["servant.deon.skill.sc-deon-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: false,
    revealsTrueNameOnPlay: true,
    abilities: [
      { id: "parry", name: "格挡", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.deon-fleur-de-lys", requiresActiveCard: false },
      { id: "parry-extra-1", name: "额外格挡 I", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.deon-fleur-de-lys", requiresActiveCard: false },
      { id: "parry-extra-2", name: "额外格挡 II", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.deon-fleur-de-lys", requiresActiveCard: false },
    ],
    handlerId: "core.deon-fleur-de-lys",
    supportLevel: "FULL",
  },
  "servant.deon.skill.sc-deon-3": {
    ...overrides["servant.deon.skill.sc-deon-3"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    passiveEventTypes: ["game.started"],
    tags: [...new Set([...(overrides["servant.deon.skill.sc-deon-3"]?.tags ?? []), "cannot-copy", "cannot-steal"])],
    handlerId: "core.deon-self-suggestion",
    supportLevel: "FULL",
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Kijyo Koyo (English original): Momijigari banks Magic/Special cards and can
// spend two to put Demon Form into play. Demon Form has a Prep upkeep, forbids
// basic Magic attacks, and can spend one banked card for +4 basic Strength power.
Object.assign(overrides, {
  "servant.koyo.skill.sc-koyo-1": {
    ...overrides["servant.koyo.skill.sc-koyo-1"],
    activation: "phase",
    windows: ["action", "outpost"],
    requiresActiveCard: false,
    revealsTrueNameOnSkillUse: false,
    abilities: [
      { id: "store", name: "红叶狩", activation: "phase", windows: ["action"], limit: "once-per-round", handlerId: "core.koyo-momijigari", requiresActiveCard: false, ignoresSituationRestrictions: true },
      { id: "demon-form", name: "红叶狩", activation: "phase", windows: ["outpost"], limit: "once-per-round", handlerId: "core.koyo-momijigari", requiresActiveCard: false, revealsTrueNameOnSkillUse: true },
    ],
    handlerId: "core.koyo-momijigari",
    supportLevel: "FULL",
  },
  "servant.koyo.skill.sc-koyo-2": {
    ...overrides["servant.koyo.skill.sc-koyo-2"],
    activation: "phase",
    windows: ["action"],
    cardResidual: true,
    requiresActiveCard: true,
    passiveEventTypes: ["card.played", "round.started", "phase.transitioned"],
    abilities: [
      { id: "strength-boost", name: "变化（恐龙）·力量强化", activation: "phase", windows: ["action"], limit: "once-per-round", handlerId: "core.koyo-demon-form", requiresActiveCard: true },
    ],
    handlerId: "core.koyo-demon-form",
    supportLevel: "FULL",
  },
  "servant.koyo.skill.sc-koyo-3": {
    ...overrides["servant.koyo.skill.sc-koyo-3"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    abilities: [
      { id: "thermoregulation", name: "体温调节", activation: "phase", windows: ["action"], limit: "once-per-round", handlerId: "core.koyo-fire-breathing", requiresActiveCard: false },
    ],
    handlerId: "core.koyo-fire-breathing",
    supportLevel: "FULL",
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Saint Martha (English original): Saint's Vow creates Martha-controlled Ruler
// Seals, including the explicit self-bound option. Tarasque pays either kind of
// seal as a cost, gains +4, then schedules engaged opponents toward Workshop on
// their next Outpost deployment if that destination is available.
Object.assign(overrides, {
  "servant.martha.skill.sc-martha-1": {
    ...overrides["servant.martha.skill.sc-martha-1"],
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved", "round.ending"],
    abilities: [
      { id: "saints-vow", name: "圣女之誓", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.martha-divine-obedience", requiresActiveCard: true },
      { id: "ruler-seal-command", name: "信仰的加护", activation: "phase", windows: ["action"], limit: "once-per-round", handlerId: "core.martha-divine-obedience", requiresActiveCard: false },
    ],
    handlerId: "core.martha-divine-obedience",
    supportLevel: "FULL",
  },
  "servant.martha.skill.sc-martha-2": {
    ...overrides["servant.martha.skill.sc-martha-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    abilities: [
      { id: "leviathan-child", name: "利维坦之子，化为流星", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.martha-tarasque", requiresActiveCard: true },
    ],
    handlerId: "core.martha-tarasque",
    supportLevel: "FULL",
  },
  "servant.martha.skill.sc-martha-4": {
    ...overrides["servant.martha.skill.sc-martha-4"],
    initiallyOwned: false,
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    abilities: [
      { id: "ruler-seal-command", name: "裁决者令咒", activation: "phase", windows: ["action"], limit: "once-per-round", handlerId: "core.martha-divine-obedience", requiresActiveCard: false },
    ],
    tags: [...new Set([...(overrides["servant.martha.skill.sc-martha-4"]?.tags ?? []), "cannot-copy", "cannot-steal"])],
    handlerId: "core.martha-divine-obedience",
    supportLevel: "FULL",
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Caenis (English original): Poseidon's Favor protects movement from card
// restrictions while in the skill zone and becomes a Permanent Caeneus/male
// state while active. Great Golden Wings and Poseidon's Maelstrom branch on
// that authored form state rather than on a character-name rule in the engine.
Object.assign(overrides, {
  "servant.caenis.skill.sc-caenis-1": {
    ...overrides["servant.caenis.skill.sc-caenis-1"],
    activation: "phase",
    windows: ["outpost"],
    cardResidual: true,
    requiresActiveCard: true,
    passiveEventTypes: ["card.played", "card.activated", "card.closed"],
    abilities: [
      { id: "deactivate-favor", name: "海神的偏爱", activation: "phase", windows: ["outpost"], limit: "once-per-round", handlerId: "core.caenis-poseidon-favor", requiresActiveCard: true },
    ],
    tags: [...new Set([...(overrides["servant.caenis.skill.sc-caenis-1"]?.tags ?? []), "skill-zone-movement-restriction-immunity"])],
    handlerId: "core.caenis-poseidon-favor",
    supportLevel: "FULL",
  },
  "servant.caenis.skill.sc-caenis-2": {
    ...overrides["servant.caenis.skill.sc-caenis-2"],
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["card.played"],
    abilities: [
      { id: "take-flight", name: "飞翔", activation: "phase", windows: ["action", "combat"], limit: "once-per-round", handlerId: "core.caenis-golden-wings", requiresActiveCard: true },
    ],
    handlerId: "core.caenis-golden-wings",
    supportLevel: "FULL",
  },
  "servant.caenis.skill.sc-caenis-3": {
    ...overrides["servant.caenis.skill.sc-caenis-3"],
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: true,
    abilities: [
      { id: "undertow", name: "暗流", activation: "phase", windows: ["action"], limit: "once-per-round", handlerId: "core.caenis-maelstrom", requiresActiveCard: true },
      { id: "tidal-wave", name: "巨浪", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.caenis-maelstrom", requiresActiveCard: true },
    ],
    handlerId: "core.caenis-maelstrom",
    supportLevel: "FULL",
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Sasaki Kojirou (English original/Fandom): First Strike's Combat ability
// deactivates itself before playing a basic Strength card; Second Strike blocks
// Action/Combat activation on Kojirou's battlefield; Third Strike is an append
// only when the same standard batch contains at least two Agility attacks.
Object.assign(overrides, {
  "servant.sasaki.skill.sc-sasaki-1": {
    ...overrides["servant.sasaki.skill.sc-sasaki-1"],
    activation: "phase",
    windows: ["combat"],
    requiresEightMana: false,
    requiresActiveCard: true,
    abilities: [
      { id: "pommel-strike-feint", name: "柄击佯攻", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.sasaki-first-strike", requiresActiveCard: true },
    ],
    handlerId: "core.sasaki-first-strike",
    supportLevel: "FULL",
  },
  "servant.sasaki.skill.sc-sasaki-2": {
    ...overrides["servant.sasaki.skill.sc-sasaki-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    abilities: [
      { id: "beyond-skill", name: "二之太刀", activation: "phase", windows: ["action"], limit: "once-per-round", handlerId: "core.sasaki-second-strike", requiresActiveCard: true },
    ],
    handlerId: "core.sasaki-second-strike",
    supportLevel: "FULL",
  },
  "servant.sasaki.skill.sc-sasaki-3": {
    ...overrides["servant.sasaki.skill.sc-sasaki-3"],
    activation: "passive",
    requiresActiveCard: false,
    revealsTrueNameOnPlay: false,
    standardAppend: true,
    standardAppendRequiresBatchCards: { minCount: 2, attributesAny: ["迅捷"] },
    passiveEventTypes: ["card.played", "card.activated", "card.closed"],
    handlerId: "core.sasaki-third-strike",
    supportLevel: "FULL",
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Lu Bu Fengxian (English original/Fandom): Restless Soul keeps every active
// basic attack only when Lu Bu fought no opponent this round and loses 1 VP per
// retained card. Defiance is source-specific (objective 0; command-seal and
// competition VP x2). God Force grants OPG to its target; God Force itself is
// not OPG, despite the legacy parser having inferred that keyword from its text.
Object.assign(overrides, {
  "servant.lubu.skill.sc-lubu-1": {
    ...overrides["servant.lubu.skill.sc-lubu-1"],
    activation: "passive",
    passiveEventTypes: ["combat.resolved", "round.ending"],
    handlerId: "core.lubu-restless-soul",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "restless-soul",
        kind: "passive",
        printedClause: "If you did not fight at least one opponent this round, your basic attacks remain active until next round and you lose 1 VP for each attack kept active.",
        execution: { mode: "handler", handlerId: "core.lubu-restless-soul" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.lubu.skill.sc-lubu-2": {
    ...overrides["servant.lubu.skill.sc-lubu-2"],
    activation: "passive",
    handlerId: "core.rule-marker",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "lapse-of-loyalty",
        kind: "passive",
        printedClause: "You gain 0 VP from objectives and double all VP you gain from command seals and contested area bonuses.",
        conditions: [{ type: "source_owned" }],
        execution: { mode: "automatic" },
        ruleModifiers: [
          {
            id: "defiance-objective-zero",
            operation: "set",
            rule: "victory_point_gain",
            scope: { subject: "controller", sources: ["objective"] },
            value: 0,
            lifecycle: { duration: "permanent" },
          },
          {
            id: "defiance-command-competition-double",
            operation: "multiply",
            rule: "victory_point_gain",
            scope: { subject: "controller", sources: ["command_seal", "competition"] },
            value: 2,
            lifecycle: { duration: "permanent" },
          },
        ],
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.lubu.skill.sc-lubu-3": {
    ...overrides["servant.lubu.skill.sc-lubu-3"],
    activation: "phase",
    windows: ["action"],
    limit: undefined,
    suppressInferredLimit: true,
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    revealsTrueNameOnSkillUse: true,
    abilities: [{
      id: "god-force",
      name: "军神五兵",
      activation: "phase",
      windows: ["action"],
      handlerId: "core.lubu-god-force",
      requiresActiveCard: true,
      revealsTrueNameOnSkillUse: true,
    }],
    handlerId: "core.lubu-god-force",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "god-force",
        kind: "phase_action",
        printedClause: "Pay the cost of a non-basic attack you control to double its base power and give it <Once Per Game>.",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.lubu-god-force" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Shuten Douji (English original/Fandom): Debaucherous Banquet is a Prep board
// placement with a +2 attack-cost aura for opponents at that location and a
// universal +1 VP combat-end reward there. Noxious Sake itself is not OPG; it
// grants OPG to basic attacks in Shuten's fight at Combat start. Bone Collector
// uses the target's true starting deck size, rounded up by quarters.
Object.assign(overrides, {
  "servant.shuten.skill.sc-shuten-1": {
    ...overrides["servant.shuten.skill.sc-shuten-1"],
    activation: "phase",
    windows: ["preparation"],
    requiresActiveCard: false,
    passiveEventTypes: ["combat.ending", "round.ending"],
    abilities: [{
      id: "place-banquet",
      name: "酒池肉林",
      activation: "phase",
      windows: ["preparation"],
      abilityCost: 2,
      limit: "once-per-round",
      handlerId: "core.shuten-debaucherous-banquet",
      requiresActiveCard: false,
    }],
    handlerId: "core.shuten-debaucherous-banquet",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "place-banquet",
        kind: "phase_action",
        printedClause: "Passive/Prep: Pay 2 mana. Place this card on a battlefield until the end of the round. Increase the mana cost of all attacks in the hands and skill zones of all opponents at this location by 2. All players at this location gain 1 VP at the end of combat.",
        activation: { phase: "preparation" },
        execution: { mode: "handler", handlerId: "core.shuten-debaucherous-banquet" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.shuten.skill.sc-shuten-2": {
    ...overrides["servant.shuten.skill.sc-shuten-2"],
    activation: "passive",
    windows: [],
    limit: undefined,
    suppressInferredLimit: true,
    requiresEightMana: false,
    requiresActiveCard: false,
    standardAppend: true,
    passiveEventTypes: ["phase.transitioned"],
    handlerId: "core.shuten-noxious-sake",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "delirium",
        kind: "passive",
        printedClause: "This card is played in addition to your attack and does not require 8 mana to be played. Delirium - At the start of combat all basic attacks in your fight gain <Once Per Game>.",
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.shuten-noxious-sake" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.shuten.skill.sc-shuten-3": {
    ...overrides["servant.shuten.skill.sc-shuten-3"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    revealsTrueNameOnSkillUse: true,
    abilities: [{
      id: "bone-collector",
      name: "百花缭乱·我爱你",
      activation: "phase",
      windows: ["combat"],
      limit: "once-per-round",
      handlerId: "core.shuten-bone-collector",
      requiresActiveCard: true,
      revealsTrueNameOnSkillUse: true,
    }],
    handlerId: "core.shuten-bone-collector",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "bone-collector",
        kind: "phase_action",
        printedClause: "Combat: Remove the top X cards of the deck of an opponent in your fight from the game, where X is one fourth of the number of cards they started the game with (round up). Then, if their deck is empty, defeat them.",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.shuten-bone-collector" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Tezcatlipoca (English original/Fandom): Tepeyollotl modifies the *current*
// cost of every other attack played alongside it (the rulings explicitly make
// Stagnation and Bridal Chest read that increased cost). Guise performs real
// optional card plays in turn order. First Sun pays a Command Seal as a play
// cost, then Black Sun applies [Defeat] to every opponent in the fight.
Object.assign(overrides, {
  "servant.tezcat.skill.sc-tezcat-1": {
    ...overrides["servant.tezcat.skill.sc-tezcat-1"],
    activation: "play",
    standardAppend: true,
    pairedPlayOtherCostIncrease: 2,
    pairedPlayOtherPowerBonus: 1,
    handlerId: "core.card-play",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "heart-of-the-mountain",
        kind: "play_trigger",
        printedClause: "Heart of the Mountain - Tepeyollotl is played in addition to your attack. All attacks played alongside Tepeyollotl gain +1 power and cost 2 mana more.",
        execution: { mode: "automatic" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.tezcat.skill.sc-tezcat-2": {
    ...overrides["servant.tezcat.skill.sc-tezcat-2"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    passiveEventTypes: ["combat.ending"],
    abilities: [{
      id: "inciting-struggle",
      name: "斗争的魅力",
      activation: "phase",
      windows: ["action"],
      limit: "once-per-round",
      handlerId: "core.tezcat-guise-warrior",
      requiresActiveCard: true,
    }],
    handlerId: "core.tezcat-guise-warrior",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "inciting-struggle",
        kind: "phase_action",
        printedClause: "Inciting Struggle - Action: Each player on this battlefield may play an attack in turn order. Players that did lose 2 VP, if they lose the fight. If any opponents lost VP this way, gain 2 VP.",
        activation: { phase: "action" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.tezcat-guise-warrior" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
  "servant.tezcat.skill.sc-tezcat-3": {
    ...overrides["servant.tezcat.skill.sc-tezcat-3"],
    activation: "phase",
    windows: ["combat"],
    limit: "once-per-game",
    commandSealPlayCost: 1,
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    abilities: [{
      id: "black-sun",
      name: "黑色太阳",
      activation: "phase",
      windows: ["combat"],
      handlerId: "core.tezcat-first-sun",
      requiresActiveCard: true,
    }],
    handlerId: "core.tezcat-first-sun",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "black-sun",
        kind: "phase_action",
        printedClause: "[Reveal Servant Name] <Once Per Game>. Pay 1 Command Seal to play this card. Black Sun - Combat: [Defeat] all opponents in the fight.",
        activation: { phase: "combat" },
        conditions: [{ type: "source_active" }],
        execution: { mode: "handler", handlerId: "core.tezcat-first-sun" },
      }],
      ambiguities: [],
      unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Kiyohime (English original/Fandom): Fiery Embrace arms a source-bound Workshop-only deployment/movement restriction for next round;
// No More Lies resolves against whether the target actually won a fight that round; Twin Flames is an optional 3-mana On Play rider.
Object.assign(overrides, {
  "servant.kiyohime.skill.sc-kiyohime-1": {
    ...overrides["servant.kiyohime.skill.sc-kiyohime-1"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    abilities: [{ id: "fiery-embrace", name: "炽热抱拥", activation: "phase", windows: ["action"], limit: "once-per-round", handlerId: "core.kiyohime-flame-colored-kiss", requiresActiveCard: false }],
    handlerId: "core.kiyohime-flame-colored-kiss", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "fiery-embrace", kind: "phase_action", printedClause: "Fiery Embrace - Passive/Action: Kiyohime's Magic attacks gain +3 power and Strength. You can only deploy in the Workshop next round and you cannot leave. If you can't deploy there, you don't deploy at all. You don't have to play any cards that round.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.kiyohime-flame-colored-kiss" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.kiyohime.skill.sc-kiyohime-2": {
    ...overrides["servant.kiyohime.skill.sc-kiyohime-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: false, passiveEventTypes: ["phase.transitioned", "round.ending"],
    abilities: [{ id: "ask-lie", name: "不再有谎言", activation: "phase", windows: ["action"], abilityCost: 1, limit: "once-per-round", handlerId: "core.kiyohime-no-more-lies", requiresActiveCard: false }],
    handlerId: "core.kiyohime-no-more-lies", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "ask-lie", kind: "phase_action", printedClause: "Passive/Action: Pay 1 mana. Ask an opponent if they will win a fight this round. If they answer incorrectly, they lose a Command Seal and you gain 2 VP. They may choose to defeat themselves at the beginning of combat.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.kiyohime-no-more-lies" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.kiyohime.skill.sc-kiyohime-3": {
    ...overrides["servant.kiyohime.skill.sc-kiyohime-3"],
    activation: "play", windows: ["action"], revealsTrueNameOnPlay: true, passiveEventTypes: ["card.played"],
    handlerId: "core.kiyohime-samadhi", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "twin-flames", kind: "play_trigger", printedClause: "Twin Flames - On Play: You may pay 3 mana. If you do, the power of your Magic attacks cannot be reduced this round and this attack remains active until the end of the next round.", execution: { mode: "handler", handlerId: "core.kiyohime-samadhi" } }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Xiang Yu (English original/Fandom): Ultimate Defense Matrix arms Reflex
// generation from each opponent's own Action turn and halves Reflex after
// combat. Martial Force spends Reflex repeatedly during Xiang Yu's Combat turn.
// Conquering Might converts 1 mana to 2 Reflex and doubles only its own base
// power after Xiang Yu moved at least three spaces this round.
Object.assign(overrides, {
  "servant.xiangyu.skill.sc-xiangyu-1": {
    ...overrides["servant.xiangyu.skill.sc-xiangyu-1"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    passiveEventTypes: ["card.played", "skill.used", "player.command-seals.changed", "player.entered-location", "combat.ending"],
    abilities: [{ id: "arm-matrix", name: "战术躯体", activation: "phase", windows: ["action"], limit: "once-per-round", handlerId: "core.xiangyu-ultimate-defense-matrix", requiresActiveCard: false }],
    handlerId: "core.xiangyu-ultimate-defense-matrix",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "arm-matrix", kind: "phase_action", printedClause: "Passive/Action: At the end of opponents' turns, for each skill they played, each Command Seal they used and if they moved to your battlefield gain 1 Reflex. Spend Reflex on your combat turn for Martial Force effects.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.xiangyu-ultimate-defense-matrix" } },
        { id: "matrix-decay", kind: "passive", printedClause: "Passive: Lose half your Reflex after combat (round up).", execution: { mode: "handler", handlerId: "core.xiangyu-ultimate-defense-matrix" } },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.xiangyu.skill.sc-xiangyu-2": {
    ...overrides["servant.xiangyu.skill.sc-xiangyu-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: false,
    abilities: [
      { id: "backward-one", name: "霸王之武", activation: "phase", windows: ["combat"], handlerId: "core.xiangyu-martial-force", requiresActiveCard: false },
      { id: "forward-one", name: "霸王之武", activation: "phase", windows: ["combat"], handlerId: "core.xiangyu-martial-force", requiresActiveCard: false },
      { id: "play-top", name: "霸王之武", activation: "phase", windows: ["combat"], handlerId: "core.xiangyu-martial-force", requiresActiveCard: false },
      { id: "play-hand-free", name: "免费手牌攻击", activation: "phase", windows: ["combat"], handlerId: "core.xiangyu-martial-force", requiresActiveCard: false },
    ],
    handlerId: "core.xiangyu-martial-force",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "backward-one", kind: "phase_action", printedClause: "Passive/Combat: Spend 1 Reflex: Move 1 space against the arrows.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.xiangyu-martial-force" } },
        { id: "forward-one", kind: "phase_action", printedClause: "Passive/Combat: Spend 2 Reflex: Move 1 space along the arrows.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.xiangyu-martial-force" } },
        { id: "play-top", kind: "phase_action", printedClause: "Passive/Combat: Spend 4 Reflex: Play the top card of your deck and pay its cost.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.xiangyu-martial-force" } },
        { id: "play-hand-free", kind: "phase_action", printedClause: "Passive/Combat: Spend 7 Reflex: Play a card from your hand for free. Any or all Martial Force effects may be bought any number of times.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.xiangyu-martial-force" } },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.xiangyu.skill.sc-xiangyu-3": {
    ...overrides["servant.xiangyu.skill.sc-xiangyu-3"],
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: false,
    revealsTrueNameOnPlay: true,
    abilities: [
      { id: "gain-reflex", name: "获得反应", activation: "phase", windows: ["action"], abilityCost: 1, limit: "once-per-round", handlerId: "core.xiangyu-conquering-might", requiresActiveCard: false },
      { id: "unstoppable-force", name: "力拔山兮气盖世", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.xiangyu-conquering-might", requiresActiveCard: true },
    ],
    handlerId: "core.xiangyu-conquering-might",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "gain-reflex", kind: "phase_action", printedClause: "Reveal Servant Name. Passive/Action: Pay 1 mana. Gain 2 Reflex.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.xiangyu-conquering-might" } },
        { id: "unstoppable-force", kind: "phase_action", printedClause: "Unstoppable Force - Combat: If you moved a total of 3 or more spaces this round, double this attack's base power.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.xiangyu-conquering-might" } },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Abigail Williams (English original/Fandom): Witching Hour counts only cards
// actually dealt by Creeping Dread; Witch Trial excludes Abigail herself and
// takes every revealed Foreigner Class; Gate to Nowhere pays ordinary card costs
// and replaces their ordinary after-fight return with an end-of-Combat deck shuffle.
Object.assign(overrides, {
  "servant.abigail.skill.sc-abigail-1": {
    ...overrides["servant.abigail.skill.sc-abigail-1"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: true,
    passiveEventTypes: ["card.played"],
    abilities: [{ id: "creeping-dread", name: "理智丧失", activation: "phase", windows: ["action"], limit: "once-per-round", handlerId: "core.abigail-witching-hour", requiresActiveCard: true }],
    handlerId: "core.abigail-witching-hour",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "witching-hour-win", kind: "play_trigger", printedClause: "On Play: If X is exactly 12, you win the game.", execution: { mode: "handler", handlerId: "core.abigail-witching-hour" } },
        { id: "creeping-dread", kind: "phase_action", printedClause: "Creeping Dread - Action: Deal a [Foreigner Class] card from outside of the game to all your opponents at your location. X is equal to the number of cards you dealt with this effect this game.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.abigail-witching-hour" } },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.abigail.skill.sc-abigail-2": {
    ...overrides["servant.abigail.skill.sc-abigail-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    abilities: [{ id: "silver-key", name: "银之钥", activation: "phase", windows: ["combat"], limit: "once-per-round", handlerId: "core.abigail-witch-trial", requiresActiveCard: true }],
    handlerId: "core.abigail-witch-trial",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{ id: "silver-key", kind: "phase_action", printedClause: "Combat: Hide your servant's name. Opponents in your fight discard a card at random, then reveal their discard piles. [Defeat] the player(s) with the most [Foreigner Class] cards in their discard (min. 1), then put the revealed [Foreigner Class] cards into your discard.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.abigail-witch-trial" } }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.abigail.skill.sc-abigail-3": {
    ...overrides["servant.abigail.skill.sc-abigail-3"],
    activation: "phase",
    windows: ["action"],
    requiresActiveCard: false,
    passiveEventTypes: ["combat.ending"],
    abilities: [
      { id: "banish-life", name: "光壳流溢的虚树", activation: "phase", windows: ["action"], limit: "once-per-round", handlerId: "core.abigail-gate-to-nowhere", requiresActiveCard: false },
      { id: "open-gate", name: "打开虚数之门", activation: "phase", windows: ["action"], limit: "once-per-round", handlerId: "core.abigail-gate-to-nowhere", requiresActiveCard: true },
    ],
    handlerId: "core.abigail-gate-to-nowhere",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "banish-life", kind: "phase_action", printedClause: "Passive/Action: Remove a [Foreigner Class] card in your hand from the game. If you did, gain 2 mana.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.abigail-gate-to-nowhere" } },
        { id: "open-gate", kind: "phase_action", printedClause: "Action: Play any amount of [Foreigner Class] cards from your discard. After combat shuffle all your active [Foreigner Class] cards into your deck.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.abigail-gate-to-nowhere" } },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Carmilla (English original/Fandom + base passive rules/FQA): pure Passives stay
// live in hand/skill zone, while the printed Combat abilities require the card active.
Object.assign(overrides, {
  "servant.carmilla.skill.sc-carmilla-1": {
    ...overrides["servant.carmilla.skill.sc-carmilla-1"],
    activation: "passive",
    windows: ["combat"],
    requiresEightMana: false,
    requiresActiveCard: false,
    passiveEventTypes: ["player.defeated", "combat.resolved"],
    handlerId: "core.carmilla-fresh-blood",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "rejuvenation", kind: "passive", printedClause: "Rejuvenation - Passive: When you are [defeated] you may pay 3 VP and remove this card from the game to ignore the [defeat] status this round.", execution: { mode: "handler", handlerId: "core.carmilla-fresh-blood" } },
        { id: "fresh-blood-steal", kind: "passive", printedClause: "Combat: Steal 2 mana from a winner of the fight.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.carmilla-fresh-blood" } },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.carmilla.skill.sc-carmilla-2": {
    ...overrides["servant.carmilla.skill.sc-carmilla-2"],
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    passiveEventTypes: ["phase.player-window.closed"],
    abilities: [{ id: "activate-hidden", name: "拷问技术", activation: "phase", windows: ["combat"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.carmilla-immoral-suggestion" }],
    handlerId: "core.carmilla-immoral-suggestion",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        { id: "deployment-suggestion", kind: "passive", printedClause: "Passive: On the Outpost turn of a player you stole mana from with [Fresh Blood] last round, you may pay 2 mana to choose where they deploy (if possible).", execution: { mode: "handler", handlerId: "core.carmilla-immoral-suggestion" } },
        { id: "activate-hidden", kind: "phase_action", printedClause: "Combat: Activate an opponent's face-down attack in the fight. Take control of it this round, if it's a basic.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.carmilla-immoral-suggestion" } },
      ],
      ambiguities: [], unmodeledClauses: [],
    },
  },
  "servant.carmilla.skill.sc-carmilla-3": {
    ...overrides["servant.carmilla.skill.sc-carmilla-3"],
    activation: "passive",
    windows: ["combat"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.carmilla-phantom-maiden",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{ id: "phantom-maiden-steal", kind: "passive", printedClause: "Combat: After combat steal 3 VP from an opponent who lost your fight and who had less power than you. You cannot choose a player you used the combat effect of [Immoral Suggestion] on.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.carmilla-phantom-maiden" } }],
      ambiguities: [], unmodeledClauses: [],
    },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Jacques de Molay (English original/Fandom): the Foreigner transformation and every temporary Foreigner Class use physical provenance.
Object.assign(overrides, {
  "servant.molay.skill.sc-molay-1": {
    ...overrides["servant.molay.skill.sc-molay-1"], activation: "phase", windows: ["combat"], requiresActiveCard: true,
    cardResidual: true, passiveEventTypes: ["phase.transitioned"],
    abilities: [{ id: "solomons-torch", name: "所罗门火炬", activation: "phase", windows: ["combat"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.molay-pilgrims-reward" }],
    handlerId: "core.molay-pilgrims-reward", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "foreigner-upkeep", kind: "passive", printedClause: "Permanent: Before combat if you are a Foreigner deactivate this or a Foreigner Class card you control.", execution: { mode: "handler", handlerId: "core.molay-pilgrims-reward" } },
      { id: "solomons-torch", kind: "phase_action", printedClause: "Solomon's Torch - Combat: Players in your fight controlling non-Luck Specials have -5 total power.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.molay-pilgrims-reward" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.molay.skill.sc-molay-2": {
    ...overrides["servant.molay.skill.sc-molay-2"], activation: "phase", windows: ["preparation"], requiresActiveCard: true,
    cardResidual: true, passiveEventTypes: ["combat.resolved", "card.played", "card.activated", "card.closed"],
    abilities: [{ id: "mother-prep", name: "13号星期五", activation: "phase", windows: ["preparation"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.molay-mother-of-goats" }],
    handlerId: "core.molay-mother-of-goats", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "mother-transform", kind: "passive", printedClause: "Friday the 13th - Passive: When you lose a fight as a Foreigner reveal Servant Name and activate this card. Permanent: Jacques is a female Foreigner and her attacks cost 3 mana more.", execution: { mode: "handler", handlerId: "core.molay-mother-of-goats" } },
      { id: "mother-prep", kind: "phase_action", printedClause: "Prep: The first 2 players in turn order create an active, temporary Foreigner Class card.", activation: { phase: "preparation" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.molay-mother-of-goats" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.molay.skill.sc-molay-3": {
    ...overrides["servant.molay.skill.sc-molay-3"], activation: "phase", windows: ["combat"], requiresActiveCard: true,
    passiveEventTypes: ["card.played", "round.started"],
    abilities: [{ id: "tempt-all", name: "堕落的授职", activation: "phase", windows: ["combat"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.molay-goats-invitation" }],
    handlerId: "core.molay-goats-invitation", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "foreigner-defeat", kind: "play_trigger", printedClause: "If you are a Foreigner, you are defeated.", execution: { mode: "handler", handlerId: "core.molay-goats-invitation" } },
      { id: "tempt-all", kind: "phase_action", printedClause: "Investiture of Depravity - Combat: Tempt all players at your location. Next round tempted players create an active temporary Foreigner Class card and Jacques is a Foreigner for that round.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.molay-goats-invitation" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Osakabehime (English original/Fandom): Hakuro Castle is a physical two-round board attachment.
Object.assign(overrides, {
  "servant.osakabe.skill.sc-osakabe-1": {
    ...overrides["servant.osakabe.skill.sc-osakabe-1"], activation: "phase", windows: ["action", "combat"], requiresActiveCard: false,
    standardAppendIfBoardDefinitionAtControllerLocation: ["servant.osakabe.skill.sc-osakabe-3"],
    abilities: [
      { id: "double-terrain", name: "城中妖怪", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.osakabe-castle-apparition" },
      { id: "reclusive-hermit", name: "公主大人【宅】", activation: "phase", windows: ["combat"], limit: "once-per-round", requiresActiveCard: false, handlerId: "core.osakabe-castle-apparition" },
    ], handlerId: "core.osakabe-castle-apparition", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "castle-append", kind: "passive", printedClause: "If [Hakuro Castle] is attached to your battlefield, this card is played in addition to your attack.", execution: { mode: "automatic" } },
      { id: "reclusive-hermit", kind: "phase_action", printedClause: "Reclusive Hermit - Passive/Combat: Gain 1 VP if you are alone at your location.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.osakabe-castle-apparition" } },
      { id: "double-terrain", kind: "phase_action", printedClause: "Action: Double your terrain advantage.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.osakabe-castle-apparition" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.osakabe.skill.sc-osakabe-2": {
    ...overrides["servant.osakabe.skill.sc-osakabe-2"], activation: "phase", windows: ["combat"], requiresActiveCard: true,
    basePower: 0, basePowerPerSameLocationOpponent: 3,
    basePowerZeroIfBoardDefinitionAtControllerLocation: ["servant.osakabe.skill.sc-osakabe-3"],
    abilities: [{ id: "paper-manipulation", name: "千代纸操法", activation: "phase", windows: ["combat"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.osakabe-chiyogami-bats" }],
    handlerId: "core.osakabe-chiyogami-bats", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "paper-manipulation", kind: "phase_action", printedClause: "Combat: Steal 1 VP from each opponent at an adjacent location. Only use this ability if movement between your locations is possible (ignore capacity only).", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.osakabe-chiyogami-bats" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.osakabe.skill.sc-osakabe-3": {
    ...overrides["servant.osakabe.skill.sc-osakabe-3"], activation: "passive", windows: [], requiresActiveCard: false,
    revealsTrueNameOnPlay: true, passiveEventTypes: ["card.played", "combat.ending", "round.ending"],
    handlerId: "core.osakabe-hakuro-castle", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "castle-drop", kind: "play_trigger", printedClause: "Castle Drop - On Play: [Defeat] an opponent at your location with 3 or more terrain advantage.", execution: { mode: "handler", handlerId: "core.osakabe-hakuro-castle" } },
      { id: "castle-attach", kind: "passive", printedClause: "After combat attach this card for the next 2 rounds to your location. While attached it isn't an attack.", execution: { mode: "handler", handlerId: "core.osakabe-hakuro-castle" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Voyager (English original/Fandom + English CHM): all three skills use physical Foreigner Class cards and shared player/card events.
Object.assign(overrides, {
  "servant.voyager.skill.sc-voyager-1": {
    ...overrides["servant.voyager.skill.sc-voyager-1"], activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["player.entered-location"],
    abilities: [{ id: "hope-reveal", name: "群星低吟", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.voyager-message-hope" }],
    handlerId: "core.voyager-message-hope", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "voices-of-stars", kind: "passive", printedClause: "Voices of the Stars - Passive: When a player enters Recon, add two Foreigner Class cards from outside the game to their hand.", execution: { mode: "handler", handlerId: "core.voyager-message-hope" } },
      { id: "hope-reveal", kind: "phase_action", printedClause: "Action: All players may reveal a Foreigner Class card from hand. Players who do gain 2 VP.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.voyager-message-hope" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.voyager.skill.sc-voyager-2": {
    ...overrides["servant.voyager.skill.sc-voyager-2"], activation: "phase", windows: ["action", "combat"], requiresActiveCard: true,
    abilities: [
      { id: "peace-action", name: "深空奏鸣", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.voyager-message-peace" },
      { id: "peace-combat", name: "深空奏鸣", activation: "phase", windows: ["combat"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.voyager-message-peace" },
    ], handlerId: "core.voyager-message-peace", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "peace-action", kind: "phase_action", printedClause: "Action: From your hand play up to 2 Foreigner Class cards and up to 2 cards face-down.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.voyager-message-peace" } },
      { id: "peace-combat", kind: "phase_action", printedClause: "Combat: Reveal all players' hands. Set the power of attacks controlled by players who revealed a Foreigner Class this way to 0.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.voyager-message-peace" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.voyager.skill.sc-voyager-3": {
    ...overrides["servant.voyager.skill.sc-voyager-3"], activation: "phase", windows: ["action"], requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    abilities: [{ id: "pale-blue-dot", name: "未知的世界，温暖的风", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.voyager-pale-blue-dot" }],
    handlerId: "core.voyager-pale-blue-dot", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "pale-blue-dot", kind: "phase_action", printedClause: "Action: Choose an opponent and reveal their discard. You may play all Foreigner Class cards revealed this way for free. If you played at least one, steal 2 VP from that opponent.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.voyager-pale-blue-dot" } }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Saint Georgios: continuous Luck permanence / Situation replacement plus Dragon-trait interactions.
Object.assign(overrides, {
  "servant.georgios.skill.sc-georgios-1": {
    ...overrides["servant.georgios.skill.sc-georgios-1"], activation: "phase", windows: ["action"], requiresActiveCard: false,
    abilities: [{ id: "sacredness", name: "圣洁", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: false, handlerId: "core.georgios-martyr-soul" }],
    handlerId: "core.georgios-martyr-soul", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "fortitude", kind: "passive", printedClause: "Fortitude - Passive: Your Luck cards gain Permanent while this card is in your Skill Zone.", conditions: [{ type: "source_in_skill_zone" }], ruleModifiers: [{ id: "georgios-luck-permanent", operation: "allow", rule: "card_residual", scope: { subject: "controller", cards: { definitionIds: ["card.cardluck"] } }, value: 1 }], execution: { mode: "automatic" } },
      { id: "sacredness", kind: "phase_action", printedClause: "Sacredness - Passive/Action: Replace a Situation effect that forbids Noble Phantasms for you with +3 power to your Noble Phantasms and Luck.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.georgios-martyr-soul" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.georgios.skill.sc-georgios-2": {
    ...overrides["servant.georgios.skill.sc-georgios-2"], activation: "passive", windows: [], requiresActiveCard: false,
    drawOnPlay: undefined, passiveEventTypes: ["player.moved", "card.played"],
    handlerId: "core.georgios-bayard", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "guardian-knight", kind: "passive", printedClause: "Guardian Knight - Passive: When a Dragon moves to a battlefield, you may play this card; if so move to that battlefield.", execution: { mode: "handler", handlerId: "core.georgios-bayard" } },
      { id: "bayard-on-play", kind: "play_trigger", printedClause: "On Play: Draw a card. Play up to 3 cards from your hand with base power 3 or less in addition.", execution: { mode: "handler", handlerId: "core.georgios-bayard" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.georgios.skill.sc-georgios-3": {
    ...overrides["servant.georgios.skill.sc-georgios-3"], activation: "passive", windows: [], requiresActiveCard: false,
    revealsTrueNameOnPlay: true, passiveEventTypes: ["combat.resolved"],
    handlerId: "core.georgios-ascalon", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "dragon-slayer", kind: "passive", printedClause: "If you fight a Dragon, this card gets +5 power.", conditions: [{ type: "source_active" }, { type: "same_battlefield_opponent_status_prefix", prefix: "status.dragon:" }], ruleModifiers: [{ id: "georgios-ascalon-vs-dragon", operation: "add", rule: "card_power", scope: { subject: "controller", cards: { sourceOnly: true } }, value: 5, lifecycle: { duration: "while_active" } }], execution: { mode: "automatic" } },
      { id: "you-are-also-a-dragon", kind: "passive", printedClause: "You Are Also a Dragon - Passive: When an opponent wins a contested fight another opponent participated in, you may make that winner a Dragon until you use this ability again.", execution: { mode: "handler", handlerId: "core.georgios-ascalon" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Kriemhild: Corrupted Balmung is a single physical Skill that can change owners.
// Black Wedding adds its controller to the combat winners only when another
// current winner controls or has that physical Balmung in their Skill Zone.
Object.assign(overrides, {
  "servant.kriemhild.skill.sc-kriemhild-1": {
    ...overrides["servant.kriemhild.skill.sc-kriemhild-1"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["round.ending"],
    abilities: [{ id: "abandoned-love", name: "遗弃之爱", activation: "phase", windows: ["combat"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.kriemhild-das-rheingold" }],
    handlerId: "core.kriemhild-das-rheingold", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "abandoned-love", kind: "phase_action",
      printedClause: "Abandoned Love - Combat: At the end of the round, return Corrupted Balmung from anywhere, including outside the game, to your Skill Zone. If it returned from a player, that player loses 3 VP and cannot use Noble Phantasms next round.",
      activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.kriemhild-das-rheingold" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.kriemhild.skill.sc-kriemhild-2": {
    ...overrides["servant.kriemhild.skill.sc-kriemhild-2"],
    activation: "passive", windows: [], requiresActiveCard: false, passiveEventTypes: ["card.played"],
    handlerId: "core.kriemhild-black-wedding", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      {
        id: "widow-shared-victory", kind: "passive",
        printedClause: "If another player who controls Corrupted Balmung or has it in their Skill Zone wins your fight, you also win that fight, split the VP, and ignore Defeat for this win.",
        conditions: [{ type: "source_active" }],
        ruleModifiers: [{ id: "kriemhild-black-wedding-winner", operation: "allow", rule: "combat_winner_inclusion", scope: { subject: "controller", whenOtherWinnerControlsOrHasSkillDefinitionId: "servant.kriemhild.skill.sc-kriemhild-3" }, lifecycle: { duration: "while_active" } }],
        execution: { mode: "automatic" },
      },
      {
        id: "widows-invitation", kind: "play_trigger",
        printedClause: "Widow's Invitation - On Play: In turn order, each other player chooses whether to move to your battlefield.",
        execution: { mode: "handler", handlerId: "core.kriemhild-black-wedding" },
      },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.kriemhild.skill.sc-kriemhild-3": {
    ...overrides["servant.kriemhild.skill.sc-kriemhild-3"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved", "round.ending"],
    handlerId: "core.kriemhild-corrupted-balmung", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      {
        id: "curse-that-killed-me", kind: "passive",
        printedClause: "Curse That Killed Me - Passive: At the end of the round, unless you won a fight, lose all VP you gained this round.",
        execution: { mode: "handler", handlerId: "core.kriemhild-corrupted-balmung" },
      },
      {
        id: "reward-that-killed-me", kind: "passive",
        printedClause: "Reward That Killed Me - After combat, choose a winner of this fight and put this card in that player's Skill Zone. If you choose yourself, Kriemhild gains 2 VP.",
        conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.kriemhild-corrupted-balmung" },
      },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Katsushika Hokusai (English original/Fandom): Paint Over lasts only until the
// end of Combat; Color tokens replace printed types and may mark objectives,
// events and Craft Essences; The Great Wave's play round is the first of two.
Object.assign(overrides, {
  "servant.hokusai.skill.sc-hokusai-1": {
    ...overrides["servant.hokusai.skill.sc-hokusai-1"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["combat.ending"],
    globalActiveCardAttributeGrant: {
      targetDefinitionIds: [
        "card.x-foreign-life", "card.x-foreigner",
        "servant.molay.skill.sc-molay-4", "servant.abigail.skill.sc-abigail-4", "servant.hokusai.skill.sc-hokusai-4", "servant.voyager.skill.sc-voyager-4", "servant.clytie.skill.sc-clytie-4",
        "card.skill.servant.molay.skill.sc-molay-4", "card.skill.servant.abigail.skill.sc-abigail-4", "card.skill.servant.hokusai.skill.sc-hokusai-4", "card.skill.servant.voyager.skill.sc-voyager-4", "card.skill.servant.clytie.skill.sc-clytie-4",
      ],
      attributes: ["力量", "迅捷", "魔术", "特殊", "宝具"],
    },
    abilities: [{ id: "paint-over", name: "覆写", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.hokusai-colors-beyond" }],
    handlerId: "core.hokusai-colors-beyond", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "all-foreigner-types", kind: "passive", printedClause: "Passive: Active Foreigner Class cards have all types.", execution: { mode: "automatic" } },
      { id: "paint-over", kind: "phase_action", printedClause: "Paint Over - Passive/Action: Pay the mana cost of an active non-once per game attack to remove it from play until the end of combat. Put a Foreigner Class from your hand in its place.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.hokusai-colors-beyond" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.hokusai.skill.sc-hokusai-2": {
    ...overrides["servant.hokusai.skill.sc-hokusai-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    abilities: [{ id: "color-world", name: "森罗万象", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.hokusai-colors-world" }],
    handlerId: "core.hokusai-colors-world", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "color-world", kind: "phase_action", printedClause: "Action: Place up to 3 unique Color tokens on different face-up cards until end of round; all printed type instances become the token's type.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.hokusai-colors-world" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.hokusai.skill.sc-hokusai-3": {
    ...overrides["servant.hokusai.skill.sc-hokusai-3"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    cardResidual: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["card.played", "round.started"],
    abilities: [{ id: "great-wave-combat", name: "神奈川冲浪里", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.hokusai-great-wave" }],
    handlerId: "core.hokusai-great-wave", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "two-round-wave", kind: "passive", printedClause: "Reveal Servant Name. Permanent: This attack remains in play for two rounds. On the second round it has -3 power.", execution: { mode: "handler", handlerId: "core.hokusai-great-wave" } },
      { id: "great-wave-combat", kind: "phase_action", printedClause: "Combat: Your opponents' non-Magic attacks on your battlefield have -2 power.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.hokusai-great-wave" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Kingprotea (English original/Fandom). Infinite Growth is intentionally hidden
// until round cleanup would close the preserved basics; Infantile Regression is
// a generic post-power close rule so Limit Break can suppress it without an ID branch.
Object.assign(overrides, {
  "servant.kingprotea.skill.sc-kingprotea-1": {
    ...overrides["servant.kingprotea.skill.sc-kingprotea-1"],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    revealsTrueNameOnSkillUse: true,
    abilities: [{ id: "limit-break", name: "巨影，现于生命之海", activation: "phase", windows: ["outpost"], limit: "once-per-round", requiresActiveCard: false, handlerId: "core.kingprotea-limit-break" }],
    handlerId: "core.kingprotea-limit-break", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "limit-break", kind: "phase_action", printedClause: "Reveal Servant Name. Passive/Outpost: Pay 2X mana to ignore Infantile Regression this round. X is 1 plus your active attacks. You cannot use Hibernation this round.",
      activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.kingprotea-limit-break" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.kingprotea.skill.sc-kingprotea-2": {
    ...overrides["servant.kingprotea.skill.sc-kingprotea-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    requiresEightMana: false, singleCardPlay: true,
    passiveEventTypes: ["card.closed"],
    abilities: [{ id: "hibernate", name: "渴爱之眠", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.kingprotea-hibernation" }],
    handlerId: "core.kingprotea-hibernation", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "hibernate", kind: "phase_action", printedClause: "Action: This round up to 2 of your non-Special basic attacks become permanent and you gain 1 mana for each of your basic attacks that is deactivated.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.kingprotea-hibernation" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.kingprotea.skill.sc-kingprotea-3": {
    ...overrides["servant.kingprotea.skill.sc-kingprotea-3"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["card.played", "round.ending"],
    handlerId: "core.kingprotea-infinite-growth", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "unstable-expansion", kind: "passive", printedClause: "Passive: When you play a basic attack all your basic attacks become permanent this round.", execution: { mode: "handler", handlerId: "core.kingprotea-infinite-growth" } },
      { id: "infantile-regression", kind: "passive", printedClause: "Passive: On your combat turn, if your current total power exceeds 21, deactivate Kingprotea's attacks.", ruleModifiers: [{ id: "kingprotea-infantile-regression", operation: "set", rule: "combat_post_power_close_all_attacks_above", scope: { subject: "controller" }, value: 21, lifecycle: { duration: "game" } }], execution: { mode: "automatic" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Sigurd (English original/Fandom). Both Gram skills key their curse and Ridill
// type grants off the physical card being revealed, not merely being active.
// Bölverk grants its Action ability to the basic attack itself, so NP-use bans do
// not suppress that granted ability. Gram II refunds exactly one attack played
// this round by an opponent in Sigurd's fight; multiple candidates are chosen.
Object.assign(overrides, {
  "servant.sigurd.skill.sc-sigurd-1": {
    ...overrides["servant.sigurd.skill.sc-sigurd-1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    cardResidual: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["round.started", "card.played", "servant.true-name-revealed", "combat.ending"],
    handlerId: "core.sigurd-gram-ii", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "gram-ii-cursed", kind: "passive", printedClause: "Cursed - Passive: While this card is revealed, lose 1 VP at the start of each round.", execution: { mode: "handler", handlerId: "core.sigurd-gram-ii" } },
      { id: "gram-ii-refund", kind: "residual", printedClause: "Permanent: After combat gain mana equal to the cost of an attack an opponent in your fight played this round.", execution: { mode: "handler", handlerId: "core.sigurd-gram-ii" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.sigurd.skill.sc-sigurd-2": {
    ...overrides["servant.sigurd.skill.sc-sigurd-2"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["round.started", "card.played", "servant.true-name-revealed"],
    handlerId: "core.sigurd-bolverk-gram", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "bolverk-cursed", kind: "passive", printedClause: "Cursed - Passive: While this card is revealed, lose 1 VP at the start of each round.", execution: { mode: "handler", handlerId: "core.sigurd-bolverk-gram" } },
      {
        id: "blade-storm", kind: "passive",
        printedClause: "Blade Storm - Passive: All your basic attacks have: Action: Pay 2 mana. Double the base power of this card. Remove it from the game after combat.",
        conditions: [{ type: "source_revealed" }], execution: { mode: "automatic" },
        transforms: [{
          id: "sigurd-grant-blade-storm", type: "card", target: { subject: "controller", cards: { basic: true } },
          grantAbilities: [{ id: "sigurd-blade-storm", name: "剑刃风暴", activation: { phase: "action" }, limit: "once-per-round", handlerId: "core.sigurd-blade-storm" }],
          lifecycle: { duration: "permanent" },
        }],
      },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.sigurd.skill.sc-sigurd-3": {
    ...overrides["servant.sigurd.skill.sc-sigurd-3"],
    activation: "play", standardAppend: true, requiresActiveCard: true,
    handlerId: "core.structured-skill", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "ridill-hrotti-types", kind: "passive",
      printedClause: "While Bölverk Gram is revealed this card gains Agility; while Gram II is revealed this card gains Magic.",
      execution: { mode: "automatic" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Sakamoto Ryouma (English original/Fandom). The character page clarifies that
// Like a Soaring Dragon's On Play +10 lasts for this turn only. Tag Team is tied
// to one ordinary attack commit of exactly two matching face-up attacks; the
// extra card is a real paid play and therefore does not recursively retrigger it.
Object.assign(overrides, {
  "servant.ryouma.skill.sc-ryouma-1": {
    ...overrides["servant.ryouma.skill.sc-ryouma-1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    cardResidual: true, revealsTrueNameOnPlay: true, limit: "once-per-game",
    passiveEventTypes: ["card.played", "round.ending"],
    handlerId: "core.ryouma-soaring-dragon", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "soaring-on-play", kind: "play_trigger", printedClause: "On Play: This attack gains +10 power for this turn only.", execution: { mode: "handler", handlerId: "core.ryouma-soaring-dragon" } },
      { id: "soaring-permanent", kind: "residual", printedClause: "Permanent: Increase your Servant's other Strength attacks' cost and power by 3. At end of round, if you have less than 4 mana, deactivate this card.", execution: { mode: "handler", handlerId: "core.ryouma-soaring-dragon" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.ryouma.skill.sc-ryouma-2": {
    ...overrides["servant.ryouma.skill.sc-ryouma-2"],
    activation: "passive", windows: [], requiresActiveCard: false,
    cardResidual: true,
    passiveEventTypes: ["attack.committed", "card.played", "round.ending"],
    handlerId: "core.ryouma-blade-restoration", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "blade-tag-team", kind: "passive", printedClause: "Tag Team - Passive: After playing exactly 2 Strength attacks you may play a Magic or Agility card.", execution: { mode: "handler", handlerId: "core.ryouma-blade-restoration" } },
      { id: "blade-focus", kind: "residual", printedClause: "Focus - Permanent: When you play one or more basic Agility attacks they gain +2 power and you deactivate this card at the end of that round.", execution: { mode: "handler", handlerId: "core.ryouma-blade-restoration" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.ryouma.skill.sc-ryouma-3": {
    ...overrides["servant.ryouma.skill.sc-ryouma-3"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    passiveEventTypes: ["attack.committed"],
    abilities: [{ id: "rampage", name: "龙神之怒", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.ryouma-dragon-restoration" }],
    handlerId: "core.ryouma-dragon-restoration", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "dragon-tag-team", kind: "passive", printedClause: "Tag Team - Passive: After playing exactly 2 Agility attacks you may play a Strength or Special card.", execution: { mode: "handler", handlerId: "core.ryouma-dragon-restoration" } },
      { id: "rampage", kind: "phase_action", printedClause: "Rampage - Action: Pay 3 mana. Draw 2 cards, then discard any number of cards. For each Strength card discarded this way this attack gains +2 power.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.ryouma-dragon-restoration" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Morgan le Fay (English original/Fandom): End of the World survives loss/removal
// of its physical card; Infinity Mirror pays one ordinary or Ruler Seal and grants
// the Berserker/Magic+Preparation Noble-Phantasm package only for this round.
Object.assign(overrides, {
  "servant.morgan.skill.sc-morgan-1": {
    ...overrides["servant.morgan.skill.sc-morgan-1"],
    activation: "play", windows: [], requiresActiveCard: false,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.morgan-end-of-world", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "end-of-world", kind: "passive", printedClause: "End of the World - Passive: When you win a fight remove Morgan's active Noble Phantasms from the game. When the 7th card is removed this way, you win the game. Morgan cannot lose this effect.", execution: { mode: "handler", handlerId: "core.morgan-end-of-world" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.morgan.skill.sc-morgan-2": {
    ...overrides["servant.morgan.skill.sc-morgan-2"],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    passiveEventTypes: ["round.ending"],
    abilities: [{ id: "infinity-mirror", name: "来自止境", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.morgan-infinity-mirror" }],
    handlerId: "core.morgan-infinity-mirror", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "infinity-mirror", kind: "phase_action", printedClause: "Passive/Outpost: Pay a Command or Ruler Seal. This round your Servant is a Berserker; their Magic and [Preparation] attacks gain Noble Phantasm and +3 power.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.morgan-infinity-mirror" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Jinako Carigiri (English original/Fandom). English text is authoritative over
// the older local migration: leaving Workshop loses 2 mana; conversion is
// 4=Luck, 3=Surveil, 2=Preparation and pays the converted card's cost.
Object.assign(overrides, {
  "master.jinako.skill.s1": {
    ...overrides["master.jinako.skill.s1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started", "player.moved"],
    handlerId: "core.jinako-gamer", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "gamer", kind: "passive", printedClause: "Gamer - Start the game with Cheat Code Cast. Your basic Specials have +X power, where X is 8 minus 2 for each basic Special your Servant starts the game with, minimum 1.", execution: { mode: "handler", handlerId: "core.jinako-gamer" } },
      { id: "shut-in", kind: "passive", printedClause: "Shut-in - Lose 2 mana when you leave the Workshop.", execution: { mode: "handler", handlerId: "core.jinako-gamer" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.jinako.skill.s2": {
    ...overrides["master.jinako.skill.s2"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    limit: "once-per-game",
    abilities: [{ id: "cheat-code-cast", name: "作弊代码转换", activation: "phase", windows: ["action"], limit: "once-per-game", requiresActiveCard: false, handlerId: "core.jinako-cheat-code-cast" }],
    handlerId: "core.jinako-cheat-code-cast", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "cheat-code-cast", kind: "phase_action", printedClause: "Once Per Game - Action: This round you may play basic non-Special attacks as basic Special attacks with the same base power: 4=Luck, 3=Surveil, 2=Preparation. Pay their new cost.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.jinako-cheat-code-cast" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.jinako.skill.ascension": {
    ...overrides["master.jinako.skill.ascension"],
    initiallyOwned: false,
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    abilities: [{ id: "time-out", name: "中场休息", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.jinako-time-out" }],
    handlerId: "core.jinako-time-out", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "time-out", kind: "phase_action", printedClause: "You may choose not to deploy during Outpost. When you do, recover a removed Cheat Code Cast.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.jinako-time-out" } },
      { id: "keep-printed-types", kind: "passive", printedClause: "Attacks you control always keep their original printed types.", execution: { mode: "handler", handlerId: "core.jinako-time-out" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Barghest (English original/Fandom). Demon Chains continuously forbids crossing
// the Workshop/Miyama <-> Shinto/Recon boundary. Wild Rule only zeros attacks
// that actually used an Action/Combat ability this round. Sun Devourer records
// the two physical cards it draws and delegates the play restriction/substitution
// to the shared roundPlayRestriction transaction.
Object.assign(overrides, {
  "servant.barghest.skill.sc-barghest-1": {
    ...overrides["servant.barghest.skill.sc-barghest-1"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    abilities: [{ id: "wild-rule", name: "野性法则", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.barghest-demon-chains" }],
    handlerId: "core.barghest-demon-chains", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      {
        id: "landbound", kind: "passive",
        printedClause: "Landbound - Passive: You cannot move from Workshop or Miyama to Shinto or Recon, or vice versa.",
        conditions: [{ type: "source_owned" }], execution: { mode: "automatic" },
        ruleModifiers: [
          { id: "landbound-east", rule: "movement_destinations", operation: "forbid", scope: { subject: "controller", fromLocationIds: ["workshop", "mountain"], toLocationIds: ["city", "scouting"] }, lifecycle: { duration: "permanent" } },
          { id: "landbound-west", rule: "movement_destinations", operation: "forbid", scope: { subject: "controller", fromLocationIds: ["city", "scouting"], toLocationIds: ["workshop", "mountain"] }, lifecycle: { duration: "permanent" } },
        ],
      },
      { id: "wild-rule", kind: "phase_action", printedClause: "Wild Rule - Combat: Set the power of opponents' attacks in your fight that used an Action or Combat ability this round to 0.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.barghest-demon-chains" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.barghest.skill.sc-barghest-2": {
    ...overrides["servant.barghest.skill.sc-barghest-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    abilities: [{ id: "devour", name: "吞噬", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.barghest-black-dog-galatine" }],
    handlerId: "core.barghest-black-dog-galatine", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "devour", kind: "phase_action", printedClause: "Action: Reveal up to 3 cards in your hand. This attack gains power equal to their total printed power; if exactly 3 revealed cards all have printed power 3, it gains +15 instead.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.barghest-black-dog-galatine" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.barghest.skill.sc-barghest-3": {
    ...overrides["servant.barghest.skill.sc-barghest-3"],
    activation: "residual", windows: [], requiresActiveCard: true, cardResidual: true,
    passiveEventTypes: ["player.entered-location", "phase.transitioned"],
    handlerId: "core.barghest-sun-devourer", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "sun-devourer-workshop", kind: "residual", printedClause: "Permanent: When you enter the Workshop deactivate this card.", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.barghest-sun-devourer" }, lifecycle: { duration: "while_active" } },
      { id: "sun-devourer-draw", kind: "residual", printedClause: "At the start of your Action turn draw 2 cards. This round you may only play those cards; you may discard a Special drawn this way to play one of your Skill cards instead, reducing that Skill's mana cost by 2 for each substitution.", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.barghest-sun-devourer" }, lifecycle: { duration: "while_active" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Mash Kyrielight (English original/Fandom). Guard is a physical deck card x2,
// not a fourth printed Skill. Its lending/combat lifecycle is therefore modeled
// on card.x-guard; sc-mash-4 remains only as a legacy catalogue marker.
Object.assign(overrides, {
  "servant.mash.skill.sc-mash-1": {
    ...overrides["servant.mash.skill.sc-mash-1"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    abilities: [{ id: "castle-distant-utopia", name: "已然遥远的理想之城", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.mash-lord-camelot" }],
    handlerId: "core.mash-lord-camelot", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "castle-distant-utopia", kind: "phase_action",
      printedClause: "Reveal Servant Name. Castle of the Distant Utopia - Action: Pick a player. They gain +2 base terrain advantage on your battlefield. Then, they double their terrain advantage.",
      activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.mash-lord-camelot" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.mash.skill.sc-mash-2": {
    ...overrides["servant.mash.skill.sc-mash-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    abilities: [{ id: "mana-defense", name: "Mana Defense", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.opponent-attack-power-modifier" }],
    opponentAttackPowerModifier: { hiddenTrueNameAmount: -3, revealedTrueNameAmount: -4, excludeGuardedByOwner: true },
    handlerId: "core.opponent-attack-power-modifier", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "mana-defense", kind: "phase_action",
      printedClause: "Mana Defense - Action: Reduce the power of attacks of opponents without Guard in your fight by 3, or by 4 if your name is revealed.",
      activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.opponent-attack-power-modifier" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.mash.skill.sc-mash-3": {
    ...overrides["servant.mash.skill.sc-mash-3"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started", "player.command-seals.changed"],
    handlerId: "core.mash-ortenaus", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "anti-servant-combat-gear", kind: "passive",
      printedClause: "Anti-Servant Combat Gear - Passive: While you have no Command Seals, your Servant's name is hidden, you cannot use Lord Camelot or lend Guards, and Guard's base power is doubled.",
      execution: { mode: "handler", handlerId: "core.mash-ortenaus" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.mash.skill.sc-mash-4": {
    ...overrides["servant.mash.skill.sc-mash-4"],
    initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.rule-marker", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "guard-legacy-catalogue-marker", kind: "passive",
      printedClause: "Legacy catalogue marker only: executable Guard rules belong to the two physical card.x-guard cards in Mash's deck.",
      execution: { mode: "automatic" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Emiya Shirou (Today's Menu for the Emiya Family). Food is represented as
// three explicit named resources. Procurement reads structured Event/Situation
// attributes; Glutton keys off the generic automatic deck-recycle fact.
Object.assign(overrides, {
  "master.shirou-meal.skill.s1": {
    ...overrides["master.shirou-meal.skill.s1"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["game.started"],
    abilities: [{ id: "food-procurement", name: "食材采购", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.shirou-meal-procurement" }],
    handlerId: "core.shirou-meal-procurement", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "food-procurement", kind: "phase_action",
      printedClause: "行动阶段：若你位于地利位置，你所在地点的事件牌和激活的局势牌上每具有一种非特殊或宝具的属性，你便获得一份相应的【食物】。（每种属性每回合仅提供一份食物——力量-肉，迅捷-蔬菜，魔术-鱼）",
      activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.shirou-meal-procurement" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shirou-meal.skill.s2": {
    ...overrides["master.shirou-meal.skill.s2"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["player.deck-shuffled"],
    abilities: [{ id: "prepare-meal", name: "卫宫家今天的饭", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.shirou-meal-menu" }],
    handlerId: "core.shirou-meal-menu", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "glutton", kind: "passive", printedClause: "饕餮-当你因效果以外将弃牌堆洗回牌库时失去3点战果。", execution: { mode: "handler", handlerId: "core.shirou-meal-menu" } },
      { id: "prepare-meal", kind: "phase_action", printedClause: "行动阶段：弃置3份【食物】，下次洗牌你不会因饕餮失去战果。若你弃置了3种相同的【食物】，+6合计威力。若你弃置了3种不同的【食物】，获得4点魔力。", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.shirou-meal-menu" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shirou-meal.skill.ascension": {
    ...overrides["master.shirou-meal.skill.ascension"],
    initiallyOwned: false,
    playPrerequisite: { customResource: { amount: 1, resourceIds: ["food:meat", "food:vegetable", "food:fish"] } },
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["round.ending"],
    handlerId: "core.shirou-meal-ascension", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "food-play-cost", kind: "passive", printedClause: "此牌需弃置一份【食物】来打出。", execution: { mode: "automatic" } },
      { id: "food-basic-power", kind: "passive", printedClause: "被动：你每有一份【食物】，你对应属性的基础攻击便+1威力。", execution: { mode: "handler", handlerId: "core.shirou-meal-ascension" } },
      { id: "end-round-discard", kind: "passive", printedClause: "回合结束时，弃置你牌堆顶的一张牌。", execution: { mode: "handler", handlerId: "core.shirou-meal-ascension" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Captain Nemo: visited-event power is a generic passive tag; Split Thinking uses
// physical attachments with a placed-round lifecycle; Nautilus grows until close.
Object.assign(overrides, {
  "servant.nemo.skill.sc-nemo-1": {
    ...overrides["servant.nemo.skill.sc-nemo-1"],
    activation: "passive", windows: ["action"], requiresActiveCard: false,
    tags: [...new Set([...(overrides["servant.nemo.skill.sc-nemo-1"]?.tags ?? []), "event-power-from-visited-locations"])],
    abilities: [{ id: "open-channel", name: "疏通航道", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.nemo-sea-god-blessing" }],
    handlerId: "core.nemo-sea-god-blessing", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "tide-calling-protection", kind: "passive", printedClause: "唤潮之佑-被动：计算你的威力时，你可以视为受到所有你本回合停留过的地点的事件牌影响。", execution: { mode: "automatic" } },
      { id: "open-channel", kind: "phase_action", printedClause: "疏通航道-被动/行动阶段：从深山町移动至新都，或从新都移动至深山町。", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.nemo-sea-god-blessing" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.nemo.skill.sc-nemo-2": {
    ...overrides["servant.nemo.skill.sc-nemo-2"],
    activation: "passive", windows: ["action"], requiresActiveCard: false,
    abilities: [
      { id: "split-store", name: "分割思考", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.nemo-split-thinking" },
      { id: "split-teamwork", name: "齐心协力", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.nemo-split-thinking" },
    ],
    handlerId: "core.nemo-split-thinking", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "split-store", kind: "phase_action", printedClause: "被动/行动阶段：花费2X-1点魔力，将X张手牌明置于此牌上。你无法于【分割思考】上放置卡名相同的牌。（非✖特殊属性的同属性基础牌视为同一卡名）", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.nemo-split-thinking" } },
      { id: "split-teamwork", kind: "phase_action", printedClause: "齐心协力-行动阶段：打出所有此牌上非本回合被放置的牌。", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.nemo-split-thinking" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.nemo.skill.sc-nemo-3": {
    ...overrides["servant.nemo.skill.sc-nemo-3"],
    activation: "play", windows: [], requiresActiveCard: false, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["player.deployed", "combat.ending"],
    abilities: [{ id: "great-ram", name: "大冲角", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.nemo-nautilus" }],
    handlerId: "core.nemo-nautilus", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "workshop-growth", kind: "passive", printedClause: "残留：每当你部署于魔术工房，此牌威力+1直至被关闭。", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.nemo-nautilus" } },
      { id: "great-ram", kind: "phase_action", printedClause: "大冲角-行动阶段：【真名解放】。获得等同于此牌威力的地利，战斗结束后关闭此牌", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.nemo-nautilus" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Tamamo no Mae (English original/Fandom): Transcendence physically locks a
// qualifying basic attack under the card; Cascade replays every locked attack
// and gives each one an after-combat re-lock-or-discard lifecycle; Witchcraft
// transforms Luck/Preparation everywhere and protects effective Magic attacks
// only from other players' power reductions/deactivation.
Object.assign(overrides, {
  "servant.tamamo.skill.sc-tamamo-1": {
    ...overrides["servant.tamamo.skill.sc-tamamo-1"],
    activation: "play", windows: [], requiresActiveCard: false, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.ending"],
    abilities: [{ id: "cascade", name: "倾注", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.tamamo-cascade" }],
    handlerId: "core.tamamo-cascade", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "cascade", kind: "phase_action", printedClause: "[Reveal Servant Name]. Cascade - Action: Play all of your locked attack cards (pay their costs). For each unlocked attack, after combat you may pay 1 mana to lock it again; otherwise put it into your discard pile.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.tamamo-cascade" } },
      { id: "cascade-after-combat", kind: "passive", printedClause: "For each unlocked attack: After combat, pay 1 mana to lock it again or put it into your discard pile.", execution: { mode: "handler", handlerId: "core.tamamo-cascade" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.tamamo.skill.sc-tamamo-2": {
    ...overrides["servant.tamamo.skill.sc-tamamo-2"],
    activation: "play", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started"],
    abilities: [{ id: "weirding-hex", name: "变化", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.tamamo-witchcraft" }],
    handlerId: "core.tamamo-witchcraft", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "weirding-hex", kind: "phase_action", printedClause: "Weirding Hex - Passive/Action: Your Preparation and Luck cards everywhere lose Special and gain Magic.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.tamamo-witchcraft" } },
      { id: "magic-penetration", kind: "passive", printedClause: "Magic Penetration - Passive: Your Magic attacks cannot be deactivated and their power cannot be reduced by effects of other players.", execution: { mode: "handler", handlerId: "core.tamamo-witchcraft" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.tamamo.skill.sc-tamamo-3": {
    ...overrides["servant.tamamo.skill.sc-tamamo-3"],
    activation: "play", windows: [], requiresActiveCard: false, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.ending"],
    abilities: [{ id: "transcendence", name: "超然", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.tamamo-transcendence" }],
    handlerId: "core.tamamo-transcendence", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "transcendence", kind: "phase_action", printedClause: "[Reveal Servant Name]. Transcendence - Combat: After combat lock an active Magic, Luck or Preparation basic attack card from a player at your location under this card until you play it using Cascade.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.tamamo-transcendence" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Florence Nightingale: Angel of Crimea is a physical borrowed Skill. Pledge may
// delegate only its own mana cost to a same-battlefield Angel controller; if
// Nightingale pays herself, an active Angel from any battlefield joins her attack.
Object.assign(overrides, {
  "servant.nightingale.skill.sc-nightingale-1": {
    ...overrides["servant.nightingale.skill.sc-nightingale-1"],
    activation: "play", windows: [], requiresActiveCard: false, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["card.played"],
    alternateManaPayer: { requireSameBattlefield: true, requiredControlledDefinitionId: "servant.nightingale.skill.sc-nightingale-3" },
    handlerId: "core.nightingale-pledge", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "nightingale-pledge", kind: "play_trigger", printedClause: "[Reveal Servant Name]. You may spend mana of a player on your battlefield controlling Angel of Crimea to play this card. If you do not, add an active Angel of Crimea from a player at any battlefield to your attack.", execution: { mode: "handler", handlerId: "core.nightingale-pledge" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.nightingale.skill.sc-nightingale-2": {
    ...overrides["servant.nightingale.skill.sc-nightingale-2"],
    activation: "passive", windows: ["combat"], requiresActiveCard: false,
    passiveEventTypes: ["game.started", "combat.resolved"],
    handlerId: "core.nightingale-iron-nurse", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "selfless-devotion", kind: "passive", printedClause: "While an opponent in the Workshop controls Angel of Crimea you can play Berserker Class cards without paying their cost.", execution: { mode: "handler", handlerId: "core.nightingale-iron-nurse" } },
      { id: "iron-nurse-combat", kind: "passive", printedClause: "Combat: If you lose the fight and there is a player with less power than you in it, gain 3 VP.", execution: { mode: "handler", handlerId: "core.nightingale-iron-nurse" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.nightingale.skill.sc-nightingale-3": {
    ...overrides["servant.nightingale.skill.sc-nightingale-3"],
    activation: "passive", windows: ["preparation"], requiresActiveCard: false,
    requiresActiveInSkillZoneToPlay: true,
    passiveEventTypes: ["player.deployed"],
    abilities: [{ id: "angel-prep", name: "克里米亚天使", activation: "phase", windows: ["preparation"], requiresActiveCard: false, handlerId: "core.nightingale-angel" }],
    handlerId: "core.nightingale-angel", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "angel-workshop", kind: "passive", printedClause: "When you deploy in the Workshop you cannot leave, gain 1 mana, and Nightingale gains 2 VP.", execution: { mode: "handler", handlerId: "core.nightingale-angel" } },
      { id: "angel-prep", kind: "phase_action", printedClause: "Passive/Prep: Add this card from your skill zone to the attack of an opponent you did not choose last round.", activation: { phase: "preparation" }, execution: { mode: "handler", handlerId: "core.nightingale-angel" } },
      { id: "angel-entry-lock", kind: "passive", printedClause: "This card cannot enter play through any other means.", execution: { mode: "automatic" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Edmond Dantès: physical King of the Cavern preserves its original owner while
// moving through another player's Skill Zone; all runtime effects use stable ids.
Object.assign(overrides, {
  "servant.dantes.skill.sc-dantes-1": {
    ...overrides["servant.dantes.skill.sc-dantes-1"],
    activation: "passive", windows: ["action", "combat"], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved", "phase.transitioned"],
    revealsTrueNameOnSkillUse: true,
    abilities: [{ id: "conspiracy", name: "Conspiracy", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.dantes-king" }],
    handlerId: "core.dantes-king", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "the-grudge", kind: "passive", printedClause: "Combat: If you lose this fight, add this card to one of the winners' skill zones.", execution: { mode: "handler", handlerId: "core.dantes-king" } },
      { id: "conspiracy", kind: "phase_action", printedClause: "Passive/Action: Only Edmond can use this ability. Pay 4 mana, Reveal Servant Name. Defeat the player who has this card at the start of combat.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.dantes-king" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.dantes.skill.sc-dantes-2": {
    ...overrides["servant.dantes.skill.sc-dantes-2"],
    activation: "phase", windows: ["action", "combat"], requiresActiveCard: true,
    passiveEventTypes: ["combat.ending", "round.ending"],
    abilities: [
      { id: "attendre-recall", name: "Attendre, Espérer", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.dantes-attendre" },
      { id: "determination-of-steel", name: "Determination of Steel", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.dantes-attendre" },
    ],
    handlerId: "core.dantes-attendre", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "attendre-recall", kind: "phase_action", printedClause: "Action: If King of the Cavern is not in play nor in your skill zone, pay 6 mana to add it to your attack.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.dantes-attendre" } },
      { id: "determination-of-steel", kind: "phase_action", printedClause: "Combat: The losers of all fights gain 1 VP. Then, at the end of the round, the non-NPC players in last place in total VP gain 2 VP.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.dantes-attendre" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.dantes.skill.sc-dantes-3": {
    ...overrides["servant.dantes.skill.sc-dantes-3"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    revealsTrueNameOnPlay: true, revealsTrueNameOnSkillUse: true,
    abilities: [{ id: "enfer-hope", name: "Where only hope escapes", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.dantes-enfer" }],
    handlerId: "core.dantes-enfer", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "enfer-hope", kind: "phase_action", printedClause: "Reveal Servant Name. Action: All players reveal the top card of their deck until they reveal a Special. If they reveal a Luck or Avenger Class card, they can play it. Discard all other cards revealed by this effect.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.dantes-enfer" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Hijikata Toshizou: the three Bushido tenets are mandatory identity passives.
// Breaking a tenet removes its physical Skill; Shinsengumi Law's replacement
// persists even after its own card is removed, matching "this effect can't be lost".
Object.assign(overrides, {
  "servant.hijikata.skill.sc-hijikata-1": {
    ...overrides["servant.hijikata.skill.sc-hijikata-1"],
    activation: "passive", windows: ["outpost"], requiresActiveCard: false,
    passiveEventTypes: ["player.entered-location"],
    abilities: [{ id: "responsibility-power", name: "Bushido Tenet: Responsibility", activation: "phase", windows: ["outpost"], requiresActiveCard: true, handlerId: "core.hijikata-coat" }],
    handlerId: "core.hijikata-coat", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "responsibility", kind: "passive", printedClause: "Reveal Servant Name. Passive: Break this tenet when you enter a battlefield on your turn with the opponent who alone has the least VP in the game.", execution: { mode: "handler", handlerId: "core.hijikata-coat" } },
      { id: "responsibility-power", kind: "phase_action", printedClause: "Passive/Outpost: Pay 1 mana. Gain +4 total power.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.hijikata-coat" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.hijikata.skill.sc-hijikata-2": {
    ...overrides["servant.hijikata.skill.sc-hijikata-2"],
    activation: "passive", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["card.played"],
    abilities: [{ id: "rally", name: "Rally", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.hijikata-flag" }],
    handlerId: "core.hijikata-flag", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "honesty", kind: "passive", printedClause: "Reveal Servant Name. Passive: Break this tenet when you play a face-down attack on a battlefield.", execution: { mode: "handler", handlerId: "core.hijikata-flag" } },
      { id: "rally", kind: "phase_action", printedClause: "Action: Draw a card. Play 2 cards from your hand. Pay 1 mana less for Berserker Class cards.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.hijikata-flag" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.hijikata.skill.sc-hijikata-3": {
    ...overrides["servant.hijikata.skill.sc-hijikata-3"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["attack.committed", "card.played"],
    handlerId: "core.hijikata-law", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "law-replacement", kind: "passive", printedClause: "Passive: When you break a tenet, remove its skill from the game and replace your hand with two power 7 Strength Berserker cards from outside the game. This effect can't be lost.", execution: { mode: "handler", handlerId: "core.hijikata-law" } },
      { id: "harmony", kind: "passive", printedClause: "Passive: Break this tenet when you control 2 basics that don't share a type.", execution: { mode: "handler", handlerId: "core.hijikata-law" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Scáthach-Skadi: Allfather's Wisdom selects a rune from two basic attacks actually played this round; Castle of Skye uses source-stacked mana blocking.
Object.assign(overrides, {
  "servant.skadi.skill.sc-skadi-1": {
    ...overrides["servant.skadi.skill.sc-skadi-1"],
    activation: "phase", windows: ["outpost", "action"], requiresActiveCard: false,
    abilities: [
      { id: "wisdom-outpost", name: "Allfather's Wisdom", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.skadi-wisdom" },
      { id: "wisdom-action", name: "Allfather's Wisdom", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.skadi-wisdom" },
    ],
    handlerId: "core.skadi-wisdom", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "wisdom-outpost", kind: "phase_action", printedClause: "Passive/Outpost: Pay 1 mana. Draw a card, then shuffle 2 cards from your hand into your deck.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.skadi-wisdom" } },
      { id: "wisdom-action", kind: "phase_action", printedClause: "Passive/Action: Pay 3 mana. For 2 basic attacks you played this round choose a type on each. Gain the matching Primordial Rune effect.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.skadi-wisdom" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.skadi.skill.sc-skadi-2": {
    ...overrides["servant.skadi.skill.sc-skadi-2"],
    activation: "phase", windows: ["combat"], requiresActiveCard: false,
    abilities: [{ id: "teiwaz-combat", name: "Teiwaz", activation: "phase", windows: ["combat"], requiresActiveCard: false, handlerId: "core.skadi-runes" }],
    handlerId: "core.skadi-runes", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "primordial-runes", kind: "passive", printedClause: "Raido Agility/Agility: move anywhere. Haglaz Agility/Magic: play an attack. Isan Magic/Magic: other players at your location lose 2 mana. Peorth Magic/Special: triple terrain advantage. Ansuz Special/Special: gain 4 VP. These are selected by Allfather's Wisdom.", execution: { mode: "handler", handlerId: "core.skadi-wisdom" } },
      { id: "teiwaz-combat", kind: "phase_action", printedClause: "Teiwaz Agility/Special - Combat: If exactly one opponent is in your fight, defeat them.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.skadi-runes" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.skadi.skill.sc-skadi-3": {
    ...overrides["servant.skadi.skill.sc-skadi-3"],
    activation: "phase", windows: ["outpost"], requiresActiveCard: true, cardResidual: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["game.started", "round.started", "card.played", "card.closed", "player.entered-location", "player.deployed"],
    abilities: [{ id: "castle-type", name: "Castle of Skye", activation: "phase", windows: ["outpost"], requiresActiveCard: true, handlerId: "core.skadi-castle" }],
    handlerId: "core.skadi-castle", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "fortress-of-shadows", kind: "residual", printedClause: "Reveal Servant Name. Permanent: Opponents at your location cannot gain mana.", execution: { mode: "handler", handlerId: "core.skadi-castle" } },
      { id: "castle-type", kind: "phase_action", printedClause: "Outpost: Choose a type. Double the base power of basic attacks of the chosen type in your fight.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.skadi-castle" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Amor: English original. Golden Arrow enhances the shared Ruler-Seal command while active; Calling Agape handles rebind/elimination and combat-power suppression.
Object.assign(overrides, {
  "servant.amor.skill.sc-amor-2": {
    ...overrides["servant.amor.skill.sc-amor-2"],
    activation: "passive", windows: ["combat"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.resolved"],
    tags: [...new Set([...(overrides["servant.amor.skill.sc-amor-2"]?.tags ?? []), "ruler-seal-double-action", "ruler-seal-move-controller-battlefield"])],
    handlerId: "core.amor-golden-arrow", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "golden-arrow-enhancement", kind: "passive", printedClause: "Reveal Servant Name. Passive: You may choose 2 actions on Ruler Seals. You can't move players except to your battlefield.", execution: { mode: "automatic" } },
      { id: "golden-arrow-rebind", kind: "passive", printedClause: "Combat: If you used Ruler Seals on winners of this fight this round, rebind one of them with a Seal.", conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "combat.resolved" }], execution: { mode: "handler", handlerId: "core.amor-golden-arrow" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.amor.skill.sc-amor-3": {
    ...overrides["servant.amor.skill.sc-amor-3"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    passiveEventTypes: ["elimination.resolved"],
    abilities: [{ id: "absolute-surrender", name: "Absolute Surrender", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.amor-calling-agape" }],
    handlerId: "core.amor-calling-agape", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "gods-eternal-love", kind: "passive", printedClause: "God's Eternal Love - Passive: When players bound by Ruler Seals are eliminated, bind an opponent with their seals.", conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "elimination.resolved" }], execution: { mode: "handler", handlerId: "core.amor-calling-agape" } },
      { id: "absolute-surrender", kind: "phase_action", printedClause: "Absolute Surrender - Combat: Players bound by 3 or more Ruler Seals have 0 total power in your fight.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.amor-calling-agape" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Aśvatthāman: situation lifecycle is resolved by stable board-zone ids; no display-text parsing.
Object.assign(overrides, {
  "servant.ashva.skill.sc-ashva-1": {
    ...overrides["servant.ashva.skill.sc-ashva-1"],
    activation: "phase", windows: ["action"], requiresActiveCard: true, cardResidual: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.resolved", "round.ending"],
    abilities: [{ id: "avatar-ruin", name: "12 Years of Ruin", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.ashva-avatar-rage" }],
    handlerId: "core.ashva-avatar-rage", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "krishna-curse", kind: "residual", printedClause: "Permanent: After winning a fight pay 1 VP or deactivate this card.", execution: { mode: "handler", handlerId: "core.ashva-avatar-rage" } },
      { id: "avatar-ruin", kind: "phase_action", printedClause: "Action: Double all power increases you gain from situations. At the end of the round remove all active situations from the game.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.ashva-avatar-rage" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.ashva.skill.sc-ashva-2": {
    ...overrides["servant.ashva.skill.sc-ashva-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["round.started", "round.ending"],
    abilities: [{ id: "mahakala-past", name: "A Past without a Future", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.ashva-mahakala" }],
    handlerId: "core.ashva-mahakala", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "mahakala-past", kind: "phase_action", printedClause: "Reveal Servant Name. Action: Next round after drawing a situation choose one from the discard and activate it alongside the normal situation, then remove it from the game at round end.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.ashva-mahakala" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.ashva.skill.sc-ashva-3": {
    ...overrides["servant.ashva.skill.sc-ashva-3"],
    activation: "phase", windows: ["action"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    terrainAdvantageCostReduction: true,
    abilities: [{ id: "ashes-to-ashes", name: "Ashes to Ashes", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.ashva-sudarshan-chakra" }],
    handlerId: "core.ashva-sudarshan-chakra", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "chakra-terrain-cost", kind: "passive", printedClause: "Reveal Servant Name. Reduce this card's cost by your terrain advantage.", execution: { mode: "automatic" } },
      { id: "ashes-to-ashes", kind: "phase_action", printedClause: "Action: Remove up to 3 situations in the discard from the game. For each removed this attack gains +2 power this round.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.ashva-sudarshan-chakra" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Ryougi Shiki: continuous bottom-deck death sense plus Sever Life and Boundary of Emptiness.
Object.assign(overrides, {
  "master.shiki-ryougi.skill.s1b": {
    ...overrides["master.shiki-ryougi.skill.s1b"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started"],
    handlerId: "core.ryougi-void", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "void-bottom-vision", kind: "passive", printedClause: "You may look at the bottom card of all attack decks.", execution: { mode: "handler", handlerId: "core.ryougi-void" } },
      { id: "void-empty-deck-defeat", kind: "passive", printedClause: "During power calculation, players in your fight with no cards in their deck are defeated.", ruleModifiers: [{ id: "ryougi-void-empty-deck", operation: "set", rule: "combat_post_power_defeat_if_deck_empty", scope: { subject: "players_at_source_location" }, value: true, lifecycle: { duration: "permanent" } }], execution: { mode: "automatic" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shiki-ryougi.skill.s2": {
    ...overrides["master.shiki-ryougi.skill.s2"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    standardAppend: true,
    standardAppendStackGroup: "ryougi-dual-append",
    pairedWithDefinitionCostIncrease: { definitionId: "master.shiki-ryougi.skill.s3", amount: 2 },
    abilities: [{ id: "sever-life", name: "生・切断", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.ryougi-sever-life" }],
    handlerId: "core.ryougi-sever-life", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "sever-append", kind: "passive", printedClause: "This card is played in addition to your attack. It costs 2 mana more when played with Phantom Grasp.", execution: { mode: "automatic" } },
      { id: "sever-life", kind: "phase_action", printedClause: "Combat: Choose a non-skill attack in your fight. If its printed power matches the bottom card of its owner's deck, discard both.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.ryougi-sever-life" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shiki-ryougi.skill.s3": {
    ...overrides["master.shiki-ryougi.skill.s3"],
    standardAppend: true,
    standardAppendStackGroup: "ryougi-dual-append",
  },
  "master.shiki-ryougi.skill.ascension": {
    ...overrides["master.shiki-ryougi.skill.ascension"],
    activation: "passive", windows: ["combat"], requiresActiveCard: false,
    handlerId: "core.rule-marker", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "boundary-of-emptiness", kind: "passive", printedClause: "Your Agility attacks have +2 power and Combat: discard the bottom card from the deck of a player in your fight.",
      ruleModifiers: [{ id: "ryougi-boundary-agility-power", operation: "add", rule: "card_power", scope: { subject: "controller", cards: { attributesAny: ["迅捷"] } }, value: 2, lifecycle: { duration: "permanent" } }],
      transforms: [{ id: "ryougi-boundary-agility-ability", type: "card", target: { subject: "controller", cards: { attributesAny: ["迅捷"] } }, grantAbilities: [{ id: "ryougi-boundary-bottom-discard", name: "空之境界", activation: { phase: "combat" }, limit: "once-per-round", handlerId: "core.ryougi-boundary-bottom-discard" }], lifecycle: { duration: "permanent" } }],
      execution: { mode: "automatic" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Jack the Ripper: English original. Mother tracking is event-driven; The Mist uses board visibility plus private event knowledge; Maria records hidden-name state at play time before the engine reveals Jack.
Object.assign(overrides, {
  "servant.jack.skill.sc-jack-1": {
    ...overrides["servant.jack.skill.sc-jack-1"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["servant.true-name-revealed", "combat.resolved"],
    abilities: [{ id: "mother-action", name: "Dissociation", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.jack-dissociation" }],
    handlerId: "core.jack-dissociation", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "mother-mark", kind: "passive", printedClause: "Passive: When an enemy Servant is revealed, they become Jack's Mother until they lose a fight to you or another player becomes Jack's Mother; reveal this card.", execution: { mode: "handler", handlerId: "core.jack-dissociation" } },
      { id: "mother-action", kind: "phase_action", printedClause: "Passive/Action: Gain 2 mana if you are at Jack's Mother's location; otherwise move to her.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.jack-dissociation" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.jack.skill.sc-jack-2": {
    ...overrides["servant.jack.skill.sc-jack-2"],
    activation: "residual", windows: [], cardResidual: true, requiresActiveCard: true,
    passiveEventTypes: ["round.started", "card.played", "event.revealed", "player.deployed", "phase.transitioned"],
    handlerId: "core.jack-mist", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "mist-upkeep", kind: "residual", printedClause: "Permanent: Lose 1 mana during Preparation. When you deploy in the Workshop, deactivate this card, lose 3 mana and hide Jack's name.", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.jack-mist" } },
      { id: "mist-objectives", kind: "residual", printedClause: "Face-up objectives in Miyama are forced face-down until the beginning of combat. You may look at the affected objectives.", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.jack-mist" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.jack.skill.sc-jack-3": {
    ...overrides["servant.jack.skill.sc-jack-3"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["card.played"],
    abilities: [{ id: "maria-combat", name: "Maria the Ripper", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.jack-maria" }],
    handlerId: "core.jack-maria", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "maria-play-state", kind: "play_trigger", printedClause: "Reveal Servant Name. Record whether Jack's name was hidden when this card was played.", execution: { mode: "handler", handlerId: "core.jack-maria" } },
      { id: "maria-combat", kind: "phase_action", printedClause: "Combat: If The Mist is active or your name was hidden when this was played, this attack gains +3 power. If both are true, defeat one opponent in your fight.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.jack-maria" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Prisma Illya: Card Holster, Quintett Feuer, and Caster Install use the generic attachment,
// physical usage override, and play-adjustment boundaries. English original/rulings verified on
// fatedomination.fandom.com; no runtime text parsing is used.
Object.assign(overrides, {
  "servant.illya.skill.sc-illya-1": {
    ...overrides["servant.illya.skill.sc-illya-1"],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    abilities: [{ id: "card-holster", name: "Card Holster", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.illya-card-holster" }],
    handlerId: "core.illya-card-holster", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "card-holster", kind: "phase_action", printedClause: "Passive/Outpost: If Card Holster has no card, place one card from your hand face-up on it; otherwise discard the attached card and gain mana equal to its mana cost. A card on Card Holster may be played as if it were in your hand.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.illya-card-holster" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.illya.skill.sc-illya-3": {
    ...overrides["servant.illya.skill.sc-illya-3"],
    activation: "phase", windows: ["action"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["card.played", "round.started", "round.ending"],
    abilities: [{ id: "quintett-barrage", name: "Quintett Feuer", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.illya-quintett-feuer" }],
    handlerId: "core.illya-quintett-feuer", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "quintett-mana-ban", kind: "passive", printedClause: "You cannot gain mana next round while Quintett Feuer remains available.", execution: { mode: "handler", handlerId: "core.illya-quintett-feuer" } },
      { id: "quintett-barrage", kind: "phase_action", printedClause: "Action: Illya's Installs gain Once Per Game until end of round; play any number of Install cards for free, ignoring their once-per-round limit.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.illya-quintett-feuer" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.illya.skill.sc-illya-10": {
    ...overrides["servant.illya.skill.sc-illya-10"],
    activation: "residual", windows: [], cardResidual: true, requiresActiveCard: true,
    passiveEventTypes: ["card.played"],
    handlerId: "core.illya-caster-install", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "caster-install", kind: "residual", printedClause: "Permanent: When you play another Install, deactivate Caster Install and give that Install +4 power or -3 mana cost.", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.illya-caster-install" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Oberon Vortigern: the English original/ruling changes the top action of every Ruler Seal
// while Oberon's true name is revealed, even seals created by other Rulers. The replacement
// is implemented in the shared Ruler-Seal command profile rather than a character branch.
Object.assign(overrides, {
  "servant.oberon.skill.sc-oberon-1": {
    ...overrides["servant.oberon.skill.sc-oberon-1"],
    activation: "passive", windows: [], revealsTrueNameOnPlay: true, requiresActiveCard: false,
    passiveEventTypes: ["game.started"],
    playerFlags: { rulerSealGlobalAvengerAction: true, rulerSealVictoryPointGainBlocked: true },
    handlerId: "core.game-start-player-config", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "disdain-ruler-vp", kind: "passive", printedClause: "Passive: You cannot gain VP from Ruler Seals.", execution: { mode: "automatic" } },
      { id: "disdain-ruler-action", kind: "passive", printedClause: "While your true name is revealed, every Ruler Seal's top Action becomes: add an Avenger Class card from outside the game to your attack.", execution: { mode: "automatic" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.oberon.skill.sc-oberon-3": {
    ...overrides["servant.oberon.skill.sc-oberon-3"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved", "round.ending"],
    tags: [...new Set([...(overrides["servant.oberon.skill.sc-oberon-3"]?.tags ?? []), "cannot-copy", "cannot-steal"])],
    abilities: [
      { id: "divine-judgment", name: "神明裁决", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.ruler-class" },
      { id: "ruler-seal-command", name: "裁决者令咒", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.ruler-class" },
    ],
    handlerId: "core.ruler-class", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "ruler-copy-protection", kind: "passive", printedClause: "This card and its effects cannot be copied or stolen.", execution: { mode: "automatic" } },
      { id: "divine-judgment", kind: "phase_action", printedClause: "Action, three times per game: bind two least-bound opponents with your Ruler Seals.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.ruler-class" } },
      { id: "ruler-seal-command", kind: "phase_action", printedClause: "Action: use one Ruler Seal you control on its bound player.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.ruler-class" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.oberon.skill.sc-oberon-4": {
    ...overrides["servant.oberon.skill.sc-oberon-4"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    limit: undefined,
    abilities: [{ id: "ruler-seal-command", name: "裁决者令咒", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.ruler-class" }],
    handlerId: "core.ruler-class", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "ruler-seal-command", kind: "phase_action", printedClause: "Action: make the bound player choose one Ruler Seal command; each physical seal is consumed when used.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.ruler-class" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Hessian Lobo: English Wiki rulings confirm Ghastly Howl permits either adjacent direction,
// and Oblivion Correction follows the opponent's movement direction, does not trigger when
// the opponent moves onto Lobo, and requires Lobo to actually move before the attack play.
Object.assign(overrides, {
  "servant.lobo.skill.sc-lobo-1": {
    ...overrides["servant.lobo.skill.sc-lobo-1"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    revealsTrueNameOnPlay: true, revealsTrueNameOnSkillUse: true,
    abilities: [{ id: "distant-condemnation", name: "身披死亡之物", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.lobo-frostes-henker" }],
    handlerId: "core.lobo-frostes-henker", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "distant-condemnation", kind: "phase_action", printedClause: "战斗阶段：若你控制【恶嚎】，从手牌或攻击区弃置至多2张你的【复仇者】；每弃置一张，关闭一张你战斗中的【幸运】或令你战斗中的一名玩家【败北】。", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.lobo-frostes-henker" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.lobo.skill.sc-lobo-2": {
    ...overrides["servant.lobo.skill.sc-lobo-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["player.defeated", "round.ending"],
    abilities: [{ id: "ghastly-howl", name: "恶嚎", activation: "phase", windows: ["action"], abilityCost: 1, requiresActiveCard: false, handlerId: "core.lobo-ghastly-howl" }],
    handlerId: "core.lobo-ghastly-howl", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "haunted-defeat", kind: "passive", printedClause: "被【死缠】的玩家战败时，他失去3点战果。", execution: { mode: "handler", handlerId: "core.lobo-ghastly-howl" } },
      { id: "ghastly-howl", kind: "phase_action", printedClause: "行动阶段：花费1点魔力，选择一处战场；其中所有对手依回合顺位选择移动至相邻地点或被【死缠】至回合结束。若有对手因此移动，将此牌加入攻击。", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.lobo-ghastly-howl" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.lobo.skill.sc-lobo-3": {
    ...overrides["servant.lobo.skill.sc-lobo-3"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["player.moved"],
    handlerId: "core.lobo-oblivion-correction", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "oblivion-follow", kind: "passive", printedClause: "对手移动后，你可以沿其移动方向移动一步，忽略目的地人数上限；若实际移动，可打出一张威力不超过3的攻击；若为【疾行】，可立即使用其行动阶段能力。", execution: { mode: "handler", handlerId: "core.lobo-oblivion-correction" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Nagao Kagetora: the Ruler Seal is represented by the shared abstract seal
// state. Holders dynamically own only the command ability attached to seals
// created by God of War; Eight Phase uses structured fractional mana sharing.
Object.assign(overrides, {
  "servant.kagetora.skill.sc-kagetora-1": {
    ...overrides["servant.kagetora.skill.sc-kagetora-1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"], revealsTrueNameOnPlay: true,
    handlerId: "core.kagetora-god-of-war", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "pray-for-carnage", kind: "passive", printedClause: "After combat, choose another losing player who does not already hold your Ruler Seal; they receive one of your Ruler Seals and you gain 1 victory point.", execution: { mode: "handler", handlerId: "core.kagetora-god-of-war" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.kagetora.skill.sc-kagetora-2": {
    ...overrides["servant.kagetora.skill.sc-kagetora-2"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["player.moved", "card.played"], revealsTrueNameOnPlay: true,
    attackManaShare: { numerator: 1, denominator: 3, rounding: "ceil", minimumPayerMana: 8, requiredRulerSealSourceId: "servant.kagetora.skill.sc-kagetora-1" },
    handlerId: "core.kagetora-eight-phase", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "movement-extra-attack", kind: "passive", printedClause: "After you move, you may play one attack.", execution: { mode: "handler", handlerId: "core.kagetora-eight-phase" } },
      { id: "shared-mana", kind: "passive", printedClause: "A player with at least 8 mana who holds your Ruler Seal may pay one third of your attack mana cost, rounded up.", execution: { mode: "handler", handlerId: "core.kagetora-eight-phase" } },
      { id: "low-power-followup", kind: "play_trigger", printedClause: "When this card is played, play one attack with printed base power 3 or less.", execution: { mode: "handler", handlerId: "core.kagetora-eight-phase" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.kagetora.skill.sc-kagetora-4": {
    ...overrides["servant.kagetora.skill.sc-kagetora-4"],
    initiallyOwned: false,
    rulerSealControllerSourceId: "servant.kagetora.skill.sc-kagetora-1",
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved", "round.ending"],
    abilities: [{ id: "ruler-seal-command", name: "裁决者令咒", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.kagetora-ruler-seal" }],
    handlerId: "core.kagetora-ruler-seal", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "ruler-seal-command", kind: "phase_action", printedClause: "Action: consume this Ruler Seal to make the bound Kagetora move to Mountain/City, become unable to move this turn, or play one hand card for free; if the free-play target wins that combat, gain 2 victory points.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.kagetora-ruler-seal" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Penthesilea: English original + Fandom rulings. Roar zeroes basic base power
// while preserving later modifiers; Divine Beauty reveals only gender; Evicerate
// evaluates the discarded attack through the shared hypothetical combat pipeline.
Object.assign(overrides, {
  "servant.penthesilea.skill.sc-penthesilea-1": {
    ...overrides["servant.penthesilea.skill.sc-penthesilea-1"],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    revealsTrueNameOnSkillUse: true,
    abilities: [{ id: "roar-outpost", name: "军神咆哮", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.penthesilea-war-god-roar" }],
    handlerId: "core.penthesilea-war-god-roar", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "roar-outpost", kind: "phase_action", printedClause: "Reveal Servant Name. Passive/Outpost: Add this card to your attack. Reduce the power of your basic attacks to 0. Combat: after power calculation defeat opponents in your fight with less total power than you.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.penthesilea-war-god-roar" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.penthesilea.skill.sc-penthesilea-2": {
    ...overrides["servant.penthesilea.skill.sc-penthesilea-2"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    revealsTrueNameOnPlay: true, limit: "once-per-game",
    abilities: [{ id: "eternal-humiliation", name: "永烙之辱", activation: "phase", windows: ["combat"], limit: "once-per-game", requiresActiveCard: true, handlerId: "core.penthesilea-divine-beauty" }],
    handlerId: "core.penthesilea-divine-beauty", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "eternal-humiliation", kind: "phase_action", printedClause: "Combat: opponents in your fight reveal only their Servant gender; male Servants get -15 total power. Remove Penthesilea's basic attacks in play, hand, deck and discard from the game.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.penthesilea-divine-beauty" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.penthesilea.skill.sc-penthesilea-3": {
    ...overrides["servant.penthesilea.skill.sc-penthesilea-3"],
    activation: "phase", windows: ["combat"], requiresActiveCard: false,
    abilities: [{ id: "evicerate", name: "瞋恚", activation: "phase", windows: ["combat"], requiresActiveCard: false, handlerId: "core.penthesilea-evicerate" }],
    handlerId: "core.penthesilea-evicerate", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "evicerate", kind: "phase_action", printedClause: "Passive/Combat: discard an attack from your hand and pay its cost. All opponents in your fight lose VP equal to one third of the power that card would have in your fight, rounded up; apply power modifiers according to the original ruling.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.penthesilea-evicerate" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Dioscuri: English original + Fandom rulings. Twin Divinity partitions the
// Servant's original attack pool into Pollux/Castor, constrains only ordinary
// pairs in which both cards belong to Dioscuri, and repeats power alterations.
Object.assign(overrides, {
  "servant.dioscuri.skill.sc-dioscuri-1": {
    ...overrides["servant.dioscuri.skill.sc-dioscuri-1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started", "combat.power-calculated"],
    handlerId: "core.dioscuri-twin-divinity", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "attack-partition", kind: "passive", printedClause: "Basic Strength attacks and Luck belong to Pollux; Dioscuri's other attacks belong to Castor. If both ordinary face-up cards in the attack pair belong to Dioscuri, one must belong to each twin. Apply power-altering effects to their attacks twice.", execution: { mode: "handler", handlerId: "core.dioscuri-twin-divinity" } },
      { id: "reveal-on-power-effect", kind: "passive", printedClause: "Reveal Twin Divinity the first time it actually affects an attack's power during power calculation.", execution: { mode: "handler", handlerId: "core.dioscuri-twin-divinity" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.dioscuri.skill.sc-dioscuri-2": {
    ...overrides["servant.dioscuri.skill.sc-dioscuri-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["game.started"],
    limit: "unlimited",
    revealsTrueNameOnPlay: false,
    abilities: [
      { id: "burn-bright", name: "炽烈燃烧", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: false, handlerId: "core.dioscuri-gift-of-mortality" },
      { id: "mortality-search", name: "死亡之赠", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: false, revealsTrueNameOnSkillUse: true, handlerId: "core.dioscuri-gift-of-mortality" },
    ],
    handlerId: "core.dioscuri-gift-of-mortality", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "castor-once-per-game", kind: "passive", printedClause: "Castor's basic attacks have Once Per Game.", execution: { mode: "handler", handlerId: "core.dioscuri-gift-of-mortality" } },
      { id: "burn-bright", kind: "phase_action", printedClause: "Passive/Action: play a Castor attack.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.dioscuri-gift-of-mortality" } },
      { id: "mortality-search", kind: "phase_action", printedClause: "Passive/Action: Reveal Servant Name. Discard 2 cards, then search your deck for a card and put it into your hand. You may pay 4 mana to search your discard instead.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.dioscuri-gift-of-mortality" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.dioscuri.skill.sc-dioscuri-3": {
    ...overrides["servant.dioscuri.skill.sc-dioscuri-3"],
    activation: "phase", windows: ["action", "combat"], requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    abilities: [
      { id: "adamant-fists", name: "坚定铁拳", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.dioscuri-tyndaridae" },
      { id: "anthem-of-the-gemini", name: "双子座之颂", activation: "phase", windows: ["combat"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.dioscuri-tyndaridae" },
    ],
    handlerId: "core.dioscuri-tyndaridae", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "adamant-fists", kind: "phase_action", printedClause: "Passive/Action: discard a Pollux attack; Pollux's attacks gain +1 power.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.dioscuri-tyndaridae" } },
      { id: "anthem-of-the-gemini", kind: "phase_action", printedClause: "Combat: Dioscuri's other attacks gain +2 power.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.dioscuri-tyndaridae" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// James Moriarty: English original + Fandom rulings. Enhancement is physical:
// a basic card is attached to a Servant skill and its printed traits are inherited.
// Dynamics copies the inactive skill plus the printed enhancement but never the
// target physical instance's tokens/stacks, and blocks the original for the round.
Object.assign(overrides, {
  "servant.moriarty.skill.sc-moriarty-1": {
    ...overrides["servant.moriarty.skill.sc-moriarty-1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["servant.true-name-revealed"],
    handlerId: "core.moriarty-wicked-charisma", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "enhance", kind: "passive", printedClause: "Enhance — Passive: the first time a Servant reveals their name, draw a card, then attach a basic card from your hand to one of that Servant's skills. The Enhanced skill gains that card's types, power, mana cost and text; its mana cost cannot exceed 12.", execution: { mode: "handler", handlerId: "core.moriarty-wicked-charisma" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.moriarty.skill.sc-moriarty-2": {
    ...overrides["servant.moriarty.skill.sc-moriarty-2"],
    activation: "phase", windows: ["action", "combat"], requiresActiveCard: true,
    cardResidual: true,
    passiveEventTypes: ["combat.resolved"],
    abilities: [
      { id: "debt-collection", name: "债务催收", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.moriarty-spider-web" },
      { id: "double-cross", name: "背叛", activation: "phase", windows: ["combat"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.moriarty-spider-web" },
    ],
    handlerId: "core.moriarty-spider-web", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "spider-permanent", kind: "passive", printedClause: "Permanent: deactivate this card after you win a fight.", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.moriarty-spider-web" } },
      { id: "debt-collection", kind: "phase_action", printedClause: "Action: steal 1 VP from each opponent at your location who controls an active Enhanced skill.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.moriarty-spider-web" } },
      { id: "double-cross", kind: "phase_action", printedClause: "Combat: remove the attached card from an Enhanced skill and add that physical card to your attack.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.moriarty-spider-web" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.moriarty.skill.sc-moriarty-3": {
    ...overrides["servant.moriarty.skill.sc-moriarty-3"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.ending", "round.ending"],
    abilities: [{ id: "villainous-masterstroke", name: "邪恶绝技", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.moriarty-dynamics" }],
    handlerId: "core.moriarty-dynamics", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "villainous-masterstroke", kind: "phase_action", printedClause: "Action: this card becomes a copy of an inactive Enhanced skill including its Enhancement. The original skill cannot be used this round. Discard the attached enhancement card after combat. Tokens/stacks on the original are not copied.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.moriarty-dynamics" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Sherlock Holmes: final authoritative patch after generated authoring compatibility data.
Object.assign(overrides, {
  "servant.sherlock.skill.sc-sherlock-1": {
    ...overrides["servant.sherlock.skill.sc-sherlock-1"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    revealsTrueNameOnSkillUse: true,
    abilities: [{ id: "elementary", name: "这是常识，我亲爱的朋友啊", activation: "phase", windows: ["combat"], requiresActiveCard: true, revealsTrueNameOnSkillUse: true, handlerId: "core.sherlock-elementary" }],
    handlerId: "core.sherlock-elementary", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "elementary", kind: "phase_action",
      printedClause: "【真名解放】战斗阶段：你所在地点的一名对手展示其手牌与其打出的暗置牌，若其展示了一张你以【逆推法】记录的卡牌，触发【逆推法】并令其【败北】。",
      activation: { phase: "combat" }, conditions: [{ type: "source_active" }],
      execution: { mode: "handler", handlerId: "core.sherlock-elementary" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.sherlock.skill.sc-sherlock-2": {
    ...overrides["servant.sherlock.skill.sc-sherlock-2"],
    activation: "phase", windows: ["outpost"], cardResidual: true, requiresActiveCard: true,
    costRule: { kind: "player-count-minus-round", min: 0 },
    passiveEventTypes: ["player.deployed"],
    abilities: [{ id: "mind-palace", name: "记忆宫殿", activation: "phase", windows: ["outpost"], requiresActiveCard: true, handlerId: "core.sherlock-empty-house" }],
    handlerId: "core.sherlock-empty-house", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "dynamic-cost", kind: "passive", printedClause: "X等于玩家数减去回合数。", execution: { mode: "automatic" } },
      { id: "workshop-residual", kind: "residual", printedClause: "残留：当你部署于魔术工房时，获得1点魔力。", conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "player.deployed" }], execution: { mode: "handler", handlerId: "core.sherlock-empty-house" } },
      { id: "mind-palace", kind: "phase_action", printedClause: "记忆宫殿-前哨阶段：进行一次【逆推法】。", activation: { phase: "outpost" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.sherlock-empty-house" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.sherlock.skill.sc-sherlock-3": {
    ...overrides["servant.sherlock.skill.sc-sherlock-3"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["card.played", "round.ending"],
    handlerId: "core.sherlock-retroduction", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "record-type", kind: "passive", printedClause: "秘密记录一种攻击类型。", execution: { mode: "handler", handlerId: "core.sherlock-retroduction" } },
      { id: "matched-basic", kind: "passive", printedClause: "当一名其他玩家打出相对应的基础牌时，翻开并弃置秘密记录的牌获得一点战果，然后你可以再进行一次【逆推法】。", conditions: [{ type: "event_type_is", eventType: "card.played" }], execution: { mode: "handler", handlerId: "core.sherlock-retroduction" } },
      { id: "untriggered-penalty", kind: "passive", printedClause: "如果回合结束时尚有未触发的【逆推法】，失去3点战果然后将其弃置。", conditions: [{ type: "event_type_is", eventType: "round.ending" }], execution: { mode: "handler", handlerId: "core.sherlock-retroduction" } },
      { id: "noble-phantasm-reveal-exception", kind: "passive", printedClause: "*以宝具展示攻击的情况下，不局限于基础攻击。", execution: { mode: "handler", handlerId: "core.sherlock-retroduction" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.sherlock.skill.sc-sherlock-4": { ...overrides["servant.sherlock.skill.sc-sherlock-4"], initiallyOwned: false, activation: "passive", tags: ["deduction-record", "deduction-attribute:力量"], handlerId: "core.rule-marker", supportLevel: "FULL" },
  "servant.sherlock.skill.sc-sherlock-5": { ...overrides["servant.sherlock.skill.sc-sherlock-5"], initiallyOwned: false, activation: "passive", tags: ["deduction-record", "deduction-attribute:迅捷"], handlerId: "core.rule-marker", supportLevel: "FULL" },
  "servant.sherlock.skill.sc-sherlock-6": { ...overrides["servant.sherlock.skill.sc-sherlock-6"], initiallyOwned: false, activation: "passive", tags: ["deduction-record", "deduction-attribute:魔术"], handlerId: "core.rule-marker", supportLevel: "FULL" },
  "servant.sherlock.skill.sc-sherlock-7": { ...overrides["servant.sherlock.skill.sc-sherlock-7"], initiallyOwned: false, activation: "passive", tags: ["deduction-record", "deduction-attribute:特殊"], handlerId: "core.rule-marker", supportLevel: "FULL" },
} satisfies Record<string, ConfirmedSkillOverride>);

// Li Shuwen: final authoritative patch after generated authoring compatibility data.
Object.assign(overrides, {
  "servant.lishuwen.skill.sc-lishuwen-1": {
    ...overrides["servant.lishuwen.skill.sc-lishuwen-1"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["phase.transitioned", "player.defeated"],
    abilities: [{ id: "activate-sphere-boundary", name: "暗劲", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.lishuwen-sphere-boundary" }],
    handlerId: "core.lishuwen-sphere-boundary", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "activate-sphere-boundary", kind: "phase_action", printedClause: "暗劲-被动/行动阶段：花费3点魔力，激活该效果并隐藏你的技能区。", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.lishuwen-sphere-boundary" } },
      { id: "set-aside-jin", kind: "replacement", printedClause: "当你于行动阶段打出牌时，你可以改为将其暗置作为劲置于一旁（不需花费）。", execution: { mode: "handler", handlerId: "core.lishuwen-sphere-boundary" } },
      { id: "release-jin", kind: "triggered", printedClause: "你的战斗阶段，将所有劲分别明置或暗置打出，你可以使用它们的行动阶段能力。", conditions: [{ type: "event_type_is", eventType: "phase.transitioned" }], execution: { mode: "handler", handlerId: "core.lishuwen-sphere-boundary" } },
      { id: "until-defeat", kind: "passive", printedClause: "暗劲持续至你战败。", conditions: [{ type: "event_type_is", eventType: "player.defeated" }], execution: { mode: "handler", handlerId: "core.lishuwen-sphere-boundary" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.lishuwen.skill.sc-lishuwen-2": {
    ...overrides["servant.lishuwen.skill.sc-lishuwen-2"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    abilities: [{ id: "one-strike-defeat", name: "一击制敌", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.lishuwen-no-second-strike" }],
    handlerId: "core.lishuwen-no-second-strike", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "one-strike-defeat", kind: "phase_action",
      printedClause: "一击制敌-战斗阶段：移除一张你的，与一名交战对手控制的攻击具有相同属性的暗置攻击并令其【败北】。若如此做，此牌威力翻倍。",
      activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.lishuwen-no-second-strike" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Fiore Forvedge: English original confirms that Surpass temporarily replaces
// one drawback with the matching enhanced card until round end; Action may
// Surpass once more and then loses 4 mana after combat. Full Recovery performs
// one additional Surpass and arms the printed -2 VP loss condition.
Object.assign(overrides, {
  "master.fiore.skill.s1a": {
    ...overrides["master.fiore.skill.s1a"],
    activation: "phase", windows: ["outpost", "action"], requiresActiveCard: false,
    passiveEventTypes: ["combat.ending", "round.ending"],
    abilities: [
      { id: "transcend-outpost", name: "超越", activation: "phase", windows: ["outpost"], limit: "once-per-round", requiresActiveCard: false, handlerId: "core.fiore-transcend" },
      { id: "transcend-action", name: "再次超越", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: false, handlerId: "core.fiore-transcend" },
    ],
    handlerId: "core.fiore-transcend", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "transcend-outpost", kind: "phase_action", printedClause: "前哨阶段：将【温顺】替换为【决意】、【瘫痪】替换为【神经机械学】或【回路不良】替换为【聪慧头脑】，持续至回合结束。", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.fiore-transcend" } },
      { id: "transcend-action", kind: "phase_action", printedClause: "行动阶段：再次进行一次【超越】。战斗结束后失去4点魔力。", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.fiore-transcend" } },
      { id: "transcend-cleanup", kind: "passive", printedClause: "替换效果持续至回合结束。", conditions: [{ type: "event_type_is", eventType: "round.ending" }], execution: { mode: "handler", handlerId: "core.fiore-transcend" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.fiore.skill.s5": {
    ...overrides["master.fiore.skill.s5"],
    initiallyOwned: false,
    activation: "phase", windows: ["action"], standardAppend: true, requiresActiveCard: true,
    abilities: [
      { id: "neuromechanics-move", name: "神经机械学·移动", activation: "phase", windows: ["action"], abilityCost: 1, limit: "once-per-round", requiresActiveCard: true, handlerId: "core.fiore-neuromechanics" },
      { id: "neuromechanics-terrain", name: "神经机械学·地利", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.fiore-neuromechanics" },
    ],
    handlerId: "core.fiore-neuromechanics", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "append", kind: "passive", printedClause: "此牌需追加打出。", execution: { mode: "automatic" } },
      { id: "neuromechanics-move", kind: "phase_action", printedClause: "行动阶段：花费1点魔力，沿箭头移动一步。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.fiore-neuromechanics" } },
      { id: "neuromechanics-terrain", kind: "phase_action", printedClause: "行动阶段：若你位于你未部署的战场，获得2点地利。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.fiore-neuromechanics" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.fiore.skill.s6": {
    ...overrides["master.fiore.skill.s6"],
    initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.fiore-determination", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "determination", kind: "passive",
      printedClause: "此牌超越时，选择一名战果高于你的对手。若你于本回合战胜了他，获得2点战果。",
      conditions: [{ type: "event_type_is", eventType: "combat.resolved" }], execution: { mode: "handler", handlerId: "core.fiore-determination" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.fiore.skill.s7": {
    ...overrides["master.fiore.skill.s7"],
    initiallyOwned: false,
    activation: "phase", windows: ["action"], standardAppend: true, requiresActiveCard: true,
    abilities: [{ id: "clever-mind-reinforcement", name: "连接强化型魔术礼装", activation: "phase", windows: ["action"], abilityCost: 1, limit: "once-per-round", requiresActiveCard: true, handlerId: "core.fiore-clever-mind" }],
    handlerId: "core.fiore-clever-mind", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "append", kind: "passive", printedClause: "此牌需追加打出。", execution: { mode: "automatic" } },
      { id: "clever-mind-reinforcement", kind: "phase_action", printedClause: "连接强化型魔术礼装-行动阶段：花费1点魔力，你的技能牌威力+1，包括从者技能、【聪慧头脑】与【神经机械学】。", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.fiore-clever-mind" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.fiore.skill.ascension": {
    ...overrides["master.fiore.skill.ascension"],
    initiallyOwned: false, tags: ["ascension"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"],
    abilities: [{ id: "full-recovery", name: "完全恢复", activation: "phase", windows: ["action"], limit: "once-per-round", requiresActiveCard: false, handlerId: "core.fiore-full-recovery" }],
    handlerId: "core.fiore-full-recovery", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "full-recovery", kind: "phase_action", printedClause: "行动阶段：进行一次【超越】。", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.fiore-full-recovery" } },
      { id: "full-recovery-loss", kind: "passive", printedClause: "如果你本回合战败，失去2点战果。", conditions: [{ type: "event_type_is", eventType: "combat.resolved" }], execution: { mode: "handler", handlerId: "core.fiore-full-recovery" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Antonio Salieri: original card image + Fate/Domination Wiki confirm Misericordia's
// shared Action, Wildfire's selectable 8..12 mana gain and dynamic X power, and
// Oblivion Correction's optional double-cost play after another player's ability VP gain.
Object.assign(overrides, {
  "servant.salieri.skill.sc-salieri-1": {
    ...overrides["servant.salieri.skill.sc-salieri-1"],
    activation: "residual", windows: ["action"], cardResidual: true,
    passiveEventTypes: ["card.played", "player.victory-points.changed", "elimination.resolved", "round.started"],
    cardAbilityIds: ["salieri.misericordia-action"], cardAbilityPhases: ["action"],
    tags: [...new Set([...(overrides["servant.salieri.skill.sc-salieri-1"]?.tags ?? []), "shared-public-ability"])],
    handlerId: "core.salieri-avenger", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "misericordia-close", kind: "residual", printedClause: "Residual: When your VP rank is first (including a tie for first), close this card.", execution: { mode: "handler", handlerId: "core.salieri-avenger" } },
      { id: "misericordia-action", kind: "phase_action", printedClause: "All players gain: Action: If at least one other player has more VP than you, gain 1 VP and +2 total power this round.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.salieri-avenger" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.salieri.skill.sc-salieri-2": {
    ...overrides["servant.salieri.skill.sc-salieri-2"],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    basePower: 0,
    basePowerFormula: { type: "formula", op: "min", args: [
      { type: "constant", value: 10 },
      { type: "formula", op: "add", args: [
        { type: "formula", op: "ceil_divide", args: [{ type: "metric", metric: "mana" }, { type: "constant", value: 2 }] },
        { type: "constant", value: 2 },
      ] },
    ] },
    abilities: [{ id: "wildfire-gain", name: "Wildfire", activation: "phase", windows: ["outpost"], limit: "once-per-round", requiresActiveCard: false, handlerId: "core.salieri-avenger" }],
    passiveEventTypes: ["combat.ending"],
    handlerId: "core.salieri-avenger", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", cardFace: { basePower: 0, basePowerFormula: { type: "formula", op: "min", args: [
      { type: "constant", value: 10 },
      { type: "formula", op: "add", args: [
        { type: "formula", op: "ceil_divide", args: [{ type: "metric", metric: "mana" }, { type: "constant", value: 2 }] },
        { type: "constant", value: 2 },
      ] },
    ] } }, abilities: [
      { id: "wildfire-gain", kind: "phase_action", printedClause: "Passive/Outpost: If you are on a battlefield, gain an amount of mana from 8 through 12.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.salieri-avenger" } },
      { id: "wildfire-burnout", kind: "passive", printedClause: "At the end of the Combat Phase, lose all mana and then lose VP equal to half the mana lost this way, rounded up. This cannot be prevented.", conditions: [{ type: "event_type_is", eventType: "combat.ending" }], execution: { mode: "handler", handlerId: "core.salieri-avenger" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.salieri.skill.sc-salieri-3": {
    ...overrides["servant.salieri.skill.sc-salieri-3"],
    activation: "passive", windows: [], passiveEventTypes: ["player.victory-points.changed", "combat.resolved"], requiresActiveCard: false,
    handlerId: "core.salieri-avenger", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "oblivion-correction", kind: "passive",
      printedClause: "Passive: When another player gains VP because of an ability, you may play a card from your hand and spend twice its mana cost. If you do, draw a card.",
      conditions: [{ type: "event_type_is", eventType: "player.victory-points.changed" }], execution: { mode: "handler", handlerId: "core.salieri-avenger" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Nanaya Shiki: English original Fate/Domination card text confirms the six-card
// Flash stock (3 Flash Draw / 3 Flash Step), once-per-player Gaze, round 9/11
// Strain loss, and Dark Compulsion's unlock shuffle plus combat draw/play.
Object.assign(overrides, {
  "master.shiki-nanaya.skill.s1b": {
    ...overrides["master.shiki-nanaya.skill.s1b"],
    activation: "passive", windows: [], passiveEventTypes: ["game.started"],
    handlerId: "core.nanaya-demon-hunter", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "demon-hunter", kind: "passive",
      printedClause: "Demon Hunter - Secretly replace up to 4 cards in your deck with [Flash Steps] and/or [Flash Draws].",
      conditions: [{ type: "event_type_is", eventType: "game.started" }],
      execution: { mode: "handler", handlerId: "core.nanaya-demon-hunter" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shiki-nanaya.skill.s2": {
    ...overrides["master.shiki-nanaya.skill.s2"],
    activation: "phase", windows: ["outpost"], passiveEventTypes: ["round.started"], requiresActiveCard: false,
    abilities: [{ id: "gaze-of-death", name: "捕捉", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.nanaya-death-perception" }],
    handlerId: "core.nanaya-death-perception", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "limited-life-span", kind: "passive", printedClause: "Limited Life Span - At the start of round 9 and 11 lose VP equal to your [Strain].", conditions: [{ type: "event_type_is", eventType: "round.started" }], execution: { mode: "handler", handlerId: "core.nanaya-death-perception" } },
      { id: "gaze-of-death", kind: "phase_action", printedClause: "Gaze of Death - Outpost: Gain 1 [Strain]. Look at the top 3 cards of a player's deck. Discard any, return the rest in any order. Use this only once per player.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.nanaya-death-perception" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shiki-nanaya.skill.ascension": {
    ...overrides["master.shiki-nanaya.skill.ascension"],
    initiallyOwned: false, tags: ["ascension"],
    activation: "phase", windows: ["combat"], passiveEventTypes: ["skill.unlocked"], requiresActiveCard: false,
    abilities: [{ id: "dark-compulsion", name: "歌月十夜", activation: "phase", windows: ["combat"], requiresActiveCard: false, handlerId: "core.nanaya-dark-compulsion" }],
    handlerId: "core.nanaya-dark-compulsion", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "dark-compulsion-stock", kind: "passive", printedClause: "Shuffle your remaining [Flash Steps] and/or [Flash Draws] into your deck.", conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }], execution: { mode: "handler", handlerId: "core.nanaya-dark-compulsion" } },
      { id: "dark-compulsion", kind: "phase_action", printedClause: "On your combat turn if an opponent you [gazed] at this game is in the fight, draw and play an attack. If that card is not a basic, gain 1 [Strain].", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.nanaya-dark-compulsion" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Caules Forvedge: English original/Fandom confirms Primeval Battery's shared
// one-ability-per-round gate, five distinct Crafted Tree attribute locks, and
// Enhanced Circuits' overload shutdown plus round-long Magic attack bonus.
Object.assign(overrides, {
  "master.caules.skill.s1": {
    ...overrides["master.caules.skill.s1"],
    activation: "passive", windows: [],
    handlerId: "core.caules-forvedge-bioelectromancer", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "bio-electromancer", kind: "passive",
      printedClause: "Bio-Electromancer - While you are in the workshop you may use the [Primeval Battery]. Use only one ability on [Primeval Battery] per round.",
      execution: { mode: "handler", handlerId: "core.caules-forvedge-bioelectromancer" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.caules.skill.s2": {
    ...overrides["master.caules.skill.s2"],
    activation: "phase", windows: ["outpost", "combat"], requiresActiveCard: false,
    abilities: [
      { id: "recharge", name: "充电", activation: "phase", windows: ["outpost"], uniqueGroup: "caules-primeval-battery", requiresActiveCard: false, handlerId: "core.caules-forvedge-primeval-battery" },
      { id: "overheal", name: "检修", activation: "phase", windows: ["outpost"], uniqueGroup: "caules-primeval-battery", requiresActiveCard: false, handlerId: "core.caules-forvedge-primeval-battery" },
      { id: "overload", name: "过载", activation: "phase", windows: ["combat"], uniqueGroup: "caules-primeval-battery", requiresActiveCard: false, handlerId: "core.caules-forvedge-primeval-battery" },
    ],
    handlerId: "core.caules-forvedge-primeval-battery", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "recharge", kind: "phase_action", printedClause: "Recharge - Outpost: Spend X VP. Gain 2X+1 mana.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.caules-forvedge-primeval-battery" } },
      { id: "overheal", kind: "phase_action", printedClause: "Overheal - Outpost: Pay 2 mana. You can ignore the [defeat] status this round.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.caules-forvedge-primeval-battery" } },
      { id: "overload", kind: "phase_action", printedClause: "Overload - Combat: Add a face-down [Crafted Tree] from outside the game to your skill zone (hide which).", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.caules-forvedge-primeval-battery" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.caules.skill.s3": {
    ...overrides["master.caules.skill.s3"],
    initiallyOwned: false,
    activation: "passive", windows: [], passiveEventTypes: ["card.played", "card.entered-attack"],
    cost: 3, requirement: 3, basePower: 6, typeLabel: "魔术", attributes: ["魔术"], requiresEightMana: false,
    limit: "once-per-game",
    handlerId: "core.caules-forvedge-crafted-tree", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "crafted-tree-lock", kind: "passive",
      printedClause: "Crafted Tree - Each variant is Once Per Game. Abilities on cards of its named attribute at your location cannot be activated; Special excludes Luck and Typeless excludes Command Seals.",
      execution: { mode: "handler", handlerId: "core.caules-forvedge-crafted-tree" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.caules.skill.ascension": {
    ...overrides["master.caules.skill.ascension"],
    initiallyOwned: false, tags: ["ascension"], activation: "passive", windows: [],
    passiveEventTypes: ["skill.unlocked"], requiresActiveCard: false,
    handlerId: "core.caules-forvedge-enhanced-circuits", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "enhanced-circuits-stock", kind: "passive", printedClause: "Add all [Crafted Trees] to your skill zone. You can no longer [overload].", conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }], execution: { mode: "handler", handlerId: "core.caules-forvedge-enhanced-circuits" } },
      { id: "enhanced-circuits-bonus", kind: "passive", printedClause: "When you use the [Primeval Battery], your Magic attacks gain +2 power until the end of the round.", execution: { mode: "handler", handlerId: "core.caules-forvedge-enhanced-circuits" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Caren Hortensia: English original/Fandom confirms the Spirit Medium startup
// grant/loss threshold, Spiritual Masochism VP replacement, Magdalene's chosen
// movement/power bind and removal condition, and Valentinus' Mark of Eros.
Object.assign(overrides, {
  "master.caren.skill.s1": {
    ...overrides["master.caren.skill.s1"],
    activation: "passive", windows: [], passiveEventTypes: ["game.started", "player.mana.changed"],
    handlerId: "core.caren-spirit-medium", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "spirit-medium", kind: "passive",
      printedClause: "Spirit Medium - You start the game with [Spiritual Masochism]. Lose it when you fall to 1 or less mana for the first time.",
      execution: { mode: "handler", handlerId: "core.caren-spirit-medium" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.caren.skill.s1a": {
    ...overrides["master.caren.skill.s1a"],
    activation: "passive", windows: [], passiveEventTypes: ["servant.true-name-revealed"],
    addSkillDefinitionId: "master.caren.skill.s3",
    handlerId: "core.caren-gain-shroud", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "executor", kind: "passive",
      printedClause: "Executor - When you reveal your Servant's name for the first time, gain [Shroud of Magdalene].",
      execution: { mode: "handler", handlerId: "core.caren-gain-shroud" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.caren.skill.s2": {
    ...overrides["master.caren.skill.s2"],
    initiallyOwned: false, requiresEightMana: false,
    activation: "passive", windows: [], passiveEventTypes: ["player.victory-points.changed"],
    handlerId: "core.caren-spiritual-masochism", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "spiritual-masochism", kind: "passive",
      printedClause: "When an opponent at your location gains VP due to a Servant card effect, Ascension card effect, or Command Seal, they gain half that amount instead (round down). You lose mana equal to the prevented VP; for each mana actually lost this way, gain 1 VP.",
      execution: { mode: "handler", handlerId: "core.caren-spiritual-masochism" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.caren.skill.s3": {
    ...overrides["master.caren.skill.s3"],
    initiallyOwned: false, requiresEightMana: false,
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"],
    abilities: [{ id: "bind-opponent", name: "圣骸布", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.caren-shroud-magdalene" }],
    handlerId: "core.caren-shroud-magdalene", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "bind-opponent", kind: "phase_action",
      printedClause: "Action: Choose an opponent on your battlefield. They cannot move on their turn and have between -1 and -5 total power (choose). If they lose the fight, remove this card from the game.",
      activation: { phase: "action" },
      execution: { mode: "handler", handlerId: "core.caren-shroud-magdalene" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.caren.skill.ascension": {
    ...overrides["master.caren.skill.ascension"],
    initiallyOwned: false, tags: ["ascension"], requiresEightMana: false,
    activation: "passive", windows: [], passiveEventTypes: ["skill.unlocked", "combat.resolved"],
    handlerId: "core.caren-valentinus", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "valentinus-grant", kind: "passive", printedClause: "When [Shroud of Valentinus] is added to your skill zone, gain [Shroud of Magdalene].", conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }], execution: { mode: "handler", handlerId: "core.caren-valentinus" } },
      { id: "mark-of-eros", kind: "passive", printedClause: "Mark of Eros - When any opponent wins a fight, they gain 3 VP.", execution: { mode: "handler", handlerId: "core.caren-valentinus" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Kadoc Zemlupus / Russian Lostbelt: English original/Fandom confirms startup
// double expansion, victory expansion, Russian-objective immunity, the shared
// expansion procedure, all three Russian objective families, and Fast Expansion.
Object.assign(overrides, {
  "master.kadoc.skill.s1": {
    ...overrides["master.kadoc.skill.s1"],
    activation: "passive", windows: [], passiveEventTypes: ["game.started", "combat.resolved"],
    handlerId: "core.kadoc-crypter", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "crypter-russia", kind: "passive", printedClause: "Crypter - Tend to the Russian Lostbelt. When you win a fight, [Expand]. Before the first round, [Expand] twice. You are unaffected by Russian Lostbelt objectives.", execution: { mode: "handler", handlerId: "core.kadoc-crypter" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.kadoc.skill.s2": {
    ...overrides["master.kadoc.skill.s2"],
    activation: "passive", windows: [],
    tags: [...new Set([...(overrides["master.kadoc.skill.s2"]?.tags ?? []), "lostbelt-expansion", "lostbelt-pool:lostbelt:russia"])],
    handlerId: "core.lostbelt-expansion", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "expand", kind: "passive", printedClause: "Expand - Draw and reveal 2 objectives. You may replace one with a Russian Lostbelt objective from outside the game, then shuffle the revealed objectives back into the objective deck. Simultaneous expansions all resolve.", execution: { mode: "handler", handlerId: "core.lostbelt-expansion" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.kadoc.skill.s3": {
    ...overrides["master.kadoc.skill.s3"],
    activation: "passive", windows: [], handlerId: "core.lostbelt-objective", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "frozen-wastes", kind: "passive", printedClause: "Frozen Wastes - Russian Lostbelt objective, 1 VP, 5 copies. Players here immediately lose 2 mana; players entering here lose 2 mana.", execution: { mode: "handler", handlerId: "core.lostbelt-objective" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.kadoc.skill.s4": {
    ...overrides["master.kadoc.skill.s4"],
    activation: "passive", windows: [], handlerId: "core.lostbelt-objective", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "survival-of-fittest", kind: "passive", printedClause: "Survival of the Fittest - Russian Lostbelt objective, 3 VP, 2 copies. Players cannot leave this battlefield. Losers here lose 3 VP.", execution: { mode: "handler", handlerId: "core.lostbelt-objective" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.kadoc.skill.s5": {
    ...overrides["master.kadoc.skill.s5"],
    activation: "passive", windows: [], handlerId: "core.lostbelt-objective", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "royal-decree", kind: "passive", printedClause: "Royal Decree - Russian Lostbelt objective, 5 VP, 2 copies. After a fight here, players not here lose 2 VP; players on no battlefield lose all VP gained this round.", execution: { mode: "handler", handlerId: "core.lostbelt-objective" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.kadoc.skill.ascension": {
    ...overrides["master.kadoc.skill.ascension"],
    initiallyOwned: false,
    tags: [...new Set([...(overrides["master.kadoc.skill.ascension"]?.tags ?? []), "ascension", "lostbelt-group:russia"])],
    activation: "phase", windows: ["action"], passiveEventTypes: ["skill.unlocked"], requiresActiveCard: false,
    abilities: [{ id: "fast-expansion", name: "Fast Expansion", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.kadoc-fast-expansion" }],
    handlerId: "core.kadoc-fast-expansion", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "russian-presence", kind: "passive", printedClause: "While you are at a Russian Lostbelt battlefield, your total power is +5.", execution: { mode: "handler", handlerId: "core.kadoc-fast-expansion" } },
      { id: "fast-expansion", kind: "phase_action", printedClause: "Action: Put a Russian Lostbelt objective from outside the game onto your battlefield; this counts as an [Expand]. If you cannot, gain 5 VP.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.kadoc-fast-expansion" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Ophelia Phamrsolone / Scandinavian Lostbelt: English original/Fandom confirms
// Prolongation's printed-base ceiling (without retroactively reducing existing
// power), the shared expansion procedure, all four objective families, and
// World Eater's permanent +3 per objective removed by that effect this game.
Object.assign(overrides, {
  "master.ophelia.skill.s1": {
    ...overrides["master.ophelia.skill.s1"],
    activation: "passive", windows: [], passiveEventTypes: ["combat.resolved"],
    handlerId: "core.ophelia-crypter", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "crypter-scandinavia", kind: "passive", printedClause: "Crypter - Tend to the Scandinavian Lostbelt. When you win a fight, [Expand].", execution: { mode: "handler", handlerId: "core.ophelia-crypter" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.ophelia.skill.s2": {
    ...overrides["master.ophelia.skill.s2"],
    activation: "phase", windows: ["action"], requiresActiveCard: false, limit: "twice-per-game",
    abilities: [{ id: "prolongation", name: "迁延之魔眼", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.ophelia-prolongation" }],
    handlerId: "core.ophelia-prolongation", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "prolongation", kind: "phase_action", printedClause: "Prolongation - Action: Pay 2 mana. The power of opponents' attacks in your fight cannot exceed their printed base values. This prevents later increases and does not reduce power already above that value when used.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.ophelia-prolongation" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.ophelia.skill.s3": {
    ...overrides["master.ophelia.skill.s3"],
    activation: "passive", windows: [],
    tags: [...new Set([...(overrides["master.ophelia.skill.s3"]?.tags ?? []), "lostbelt-expansion", "lostbelt-pool:lostbelt:scandinavia"])],
    handlerId: "core.lostbelt-expansion", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "expand", kind: "passive", printedClause: "Expand - Draw and reveal 2 objectives. You may replace one with a face-up Scandinavian Lostbelt objective from outside the game, then shuffle the revealed objectives back into the objective deck. Resolve all triggered expansions concurrently.", execution: { mode: "handler", handlerId: "core.lostbelt-expansion" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.ophelia.skill.s4": {
    ...overrides["master.ophelia.skill.s4"],
    activation: "passive", windows: [], handlerId: "core.lostbelt-objective", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "day-of-peace", kind: "passive", printedClause: "A Day of Peace - Scandinavian Lostbelt objective, 0 VP, 3 copies. Remove it from the game after combat; it cannot be returned by Lostbelt Expansion.", execution: { mode: "handler", handlerId: "core.lostbelt-objective" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.ophelia.skill.s5": {
    ...overrides["master.ophelia.skill.s5"],
    activation: "passive", windows: [], handlerId: "core.lostbelt-objective", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "surtrs-domain", kind: "passive", printedClause: "Surtr's Domain - Scandinavian Lostbelt objective, 4 VP, 2 copies. Strength attacks here gain +4 power and Agility attacks here get -2 power.", execution: { mode: "handler", handlerId: "core.lostbelt-objective" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.ophelia.skill.s6": {
    ...overrides["master.ophelia.skill.s6"],
    activation: "passive", windows: [], handlerId: "core.lostbelt-objective", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "envoys-domain", kind: "passive", printedClause: "Envoy's Domain - Scandinavian Lostbelt objective, 4 VP, 2 copies. Agility attacks here gain +4 power and Magic attacks here get -2 power.", execution: { mode: "handler", handlerId: "core.lostbelt-objective" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.ophelia.skill.s7": {
    ...overrides["master.ophelia.skill.s7"],
    activation: "passive", windows: [], handlerId: "core.lostbelt-objective", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "skadis-domain", kind: "passive", printedClause: "Skadi's Domain - Scandinavian Lostbelt objective, 4 VP, 2 copies. Magic attacks here gain +4 power and Strength attacks here get -2 power.", execution: { mode: "handler", handlerId: "core.lostbelt-objective" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.ophelia.skill.ascension": {
    ...overrides["master.ophelia.skill.ascension"],
    initiallyOwned: false,
    tags: [...new Set([...(overrides["master.ophelia.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], passiveEventTypes: ["combat.resolved"], requiresActiveCard: false,
    handlerId: "core.ophelia-world-eater", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "world-eater", kind: "passive", printedClause: "World Eater - When you win a fight, remove that fight's objectives from the game; they cannot return via Lostbelt Expansion. This card gains +3 power for each objective removed by this effect this game.", execution: { mode: "handler", handlerId: "core.ophelia-world-eater" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Scandinavia Peperoncino / Indian Lostbelt: the English Fate/Domination Wiki
// confirms Yuga Cycle composition/X values, first-entry Expansion, size growth,
// all seven India objective families, Shunyata and Forced Expansion.
Object.assign(overrides, {
  "master.peperoncino.skill.s2": {
    ...overrides["master.peperoncino.skill.s2"],
    activation: "passive", windows: [], passiveEventTypes: ["combat.ending"],
    tags: [...new Set([...(overrides["master.peperoncino.skill.s2"]?.tags ?? []), "lostbelt-expansion", "lostbelt-pool:lostbelt:india"])],
    handlerId: "core.india-expansion", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "india-expansion", kind: "passive", printedClause: "Expand - Randomly place one objective from the current Yuga Cycle at your battlefield. After combat, if you won that objective it enters the objective discard and India Lostbelt Size permanently increases by 1; otherwise remove it from the game.", execution: { mode: "handler", handlerId: "core.india-expansion" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.peperoncino.skill.s3": {
    ...overrides["master.peperoncino.skill.s3"],
    activation: "passive", windows: [], passiveEventTypes: ["round.started", "player.entered-location", "round.ending"],
    handlerId: "core.india-yuga-cycle", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "yuga-cycle", kind: "passive", printedClause: "Yuga Cycle - At Preparation set the Cycle for this round: Sutra 1-4 (Lotus/Hunting/Research/Boulder, X=4), Tetra 5-7 (Lotus/Hunting/Research, X=3), Dvapara 8-9 (Fading Town/Withering Plains, X=2), Kali 10 (Ocean of Milk, X=1), Judgement 11 (X=India Lostbelt Size). The first battlefield Peperoncino enters each round triggers [Expand]; if he did not Expand, remove one Cycle objective at round end. In Judgement, Size 0-1 gives him -10 total power, Size 3+ lets him add an objective from the remaining deck to Miyama, and Size 5+ gives him +5 total power.", execution: { mode: "handler", handlerId: "core.india-yuga-cycle" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.peperoncino.skill.s4": {
    ...overrides["master.peperoncino.skill.s4"],
    activation: "passive", windows: [], handlerId: "core.india-objectives", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "india-objectives", kind: "passive", printedClause: "Indian Lostbelt objectives - Lotus Fields/Hunting Grounds/Field Research grant +X to matching Strength/Agility/Magic attacks played from hand this round (not through effects) and draw another objective when they did not enter by Expansion. Great Sky Boulder removes itself and one local objective when Expanded and may restore that objective into a later Cycle with doubled VP. Fading Town gives Peperoncino +X terrain and prevents him leaving. Withering Plains can enter discard instead of exile when he wins elsewhere or ends in Recon. Ocean of Milk defeats players here at the end of Action who did not use a Noble Phantasm this round.", execution: { mode: "handler", handlerId: "core.india-objectives" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.peperoncino.skill.ascension": {
    ...overrides["master.peperoncino.skill.ascension"],
    initiallyOwned: false,
    tags: [...new Set([...(overrides["master.peperoncino.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "phase", windows: ["outpost", "action"], passiveEventTypes: ["skill.unlocked"], requiresActiveCard: false,
    abilities: [
      { id: "shunyata", name: "虚空论", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.india-nirvana" },
      { id: "forced-expansion", name: "强制扩张", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.india-nirvana" },
    ],
    handlerId: "core.india-nirvana", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "nirvana-immunity", kind: "passive", printedClause: "Your opponents are unaffected by Indian Lostbelt objectives.", execution: { mode: "handler", handlerId: "core.india-nirvana" } },
      { id: "shunyata", kind: "phase_action", printedClause: "Shunyata - Outpost: Remove one objective from the Yuga Cycle; gain 2 mana and +3 total power this round.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.india-nirvana" } },
      { id: "forced-expansion", kind: "phase_action", printedClause: "Forced Expansion - Action: Pay 7 mana; permanently increase India Lostbelt Size by 1.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.india-nirvana" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Jason / Argonaut Quests (English original/Fandom): Quest shuffles the physical
// skill into only the top ten remaining objectives without reshuffling discard;
// when revealed on a battlefield it joins Jason's attack for free and that spot
// immediately draws a replacement objective. Heracles' God Hand is specifically
// On Play, so a Heracles returning from Quest does not arm it.
Object.assign(overrides, {
  "servant.jason.skill.sc-jason-1": {
    ...overrides["servant.jason.skill.sc-jason-1"],
    activation: "passive", windows: [], passiveEventTypes: ["card.played", "combat.resolved", "event.revealed"],
    handlerId: "core.jason-argonaut-quest", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "god-hand", kind: "passive", printedClause: "God Hand - On Play: If you lose a fight this round, send Heracles on a Quest and gain 2 VP.", execution: { mode: "handler", handlerId: "core.jason-argonaut-quest" } },
      { id: "quest", kind: "passive", printedClause: "Quest - Shuffle this card into the top 10 cards of the objective deck (change state). When this card is on a battlefield, add it to Jason's attack. Draw a new objective in its place.", execution: { mode: "handler", handlerId: "core.jason-argonaut-quest" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.jason.skill.sc-jason-2": {
    ...overrides["servant.jason.skill.sc-jason-2"],
    activation: "phase", windows: ["action", "combat"], requiresActiveCard: true,
    passiveEventTypes: ["combat.ending", "event.revealed"],
    abilities: [
      { id: "atalante-action-play", name: "Godspeed · Action", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.jason-argonaut-quest" },
      { id: "atalante-combat-play", name: "Godspeed · Combat", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.jason-argonaut-quest" },
    ],
    handlerId: "core.jason-argonaut-quest", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "atalante-action-play", kind: "phase_action", printedClause: "Godspeed - Action: Play an attack.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.jason-argonaut-quest" } },
      { id: "atalante-combat-play", kind: "phase_action", printedClause: "Godspeed - Combat: Play an attack. Send Atalante on a Quest after combat.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.jason-argonaut-quest" } },
      { id: "quest", kind: "passive", printedClause: "Quest - Shuffle this card into the top 10 cards of the objective deck (change state). When this card is on a battlefield, add it to Jason's attack. Draw a new objective in its place.", execution: { mode: "handler", handlerId: "core.jason-argonaut-quest" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.jason.skill.sc-jason-3": {
    ...overrides["servant.jason.skill.sc-jason-3"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    passiveEventTypes: ["event.revealed"],
    abilities: [
      { id: "medea-gods-grace", name: "God's Grace", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.jason-argonaut-quest" },
    ],
    handlerId: "core.jason-argonaut-quest", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "medea-gods-grace", kind: "phase_action", printedClause: "God's Grace - Combat: Gain 2 mana. You have +4 total power next round. Send Medea on a Quest.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.jason-argonaut-quest" } },
      { id: "quest", kind: "passive", printedClause: "Quest - Shuffle this card into the top 10 cards of the objective deck (change state). When this card is on a battlefield, add it to Jason's attack. Draw a new objective in its place.", execution: { mode: "handler", handlerId: "core.jason-argonaut-quest" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Shishigou Kairi: the English original defines Corpse Crafter as a two-stage
// physical-card resource. A face-down attack is removed in Workshop combat and
// later revealed once to select a matching Necromantic Rite. Macabre Mastery
// gives the same rite action to each active basic attack independently.
Object.assign(overrides, {
  "master.shishigou.skill.s1": {
    ...overrides["master.shishigou.skill.s1"],
    activation: "phase", windows: ["action", "combat"], requiresActiveCard: false,
    abilities: [
      { id: "corpse-crafter-use", name: "尸体冷藏 · 使用", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.shishigou-necromancy" },
      { id: "corpse-crafter-store", name: "尸体冷藏 · 冷藏", activation: "phase", windows: ["combat"], requiresActiveCard: false, handlerId: "core.shishigou-necromancy" },
    ],
    handlerId: "core.shishigou-necromancy", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "corpse-crafter-store", kind: "phase_action", printedClause: "Corpse Crafter - Combat: If you are in the Workshop, remove one of your face-down attacks from the game.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.shishigou-necromancy" } },
      { id: "corpse-crafter-use", kind: "phase_action", printedClause: "Corpse Crafter - Action: Reveal a card removed by Corpse Crafter. Activate a Necromantic Rites ability whose type matches that card. A revealed corpse cannot be used again.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.shishigou-necromancy" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shishigou.skill.s2": {
    ...overrides["master.shishigou.skill.s2"],
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.shishigou-necromancy", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "necromantic-rites-i", kind: "passive",
      printedClause: "Necromantic Rites I - Strength: Heart Gas Grenade - You may move to a battlefield. Gain +2 terrain advantage. Agility: Cursed Finger Bullets - Play the top card of your deck and pay its cost.",
      execution: { mode: "handler", handlerId: "core.shishigou-necromancy" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shishigou.skill.s3": {
    ...overrides["master.shishigou.skill.s3"],
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.shishigou-necromancy", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "necromantic-rites-ii", kind: "passive",
      printedClause: "Necromantic Rites II - Magic: Monkey Eye Cameras - Double your terrain advantage. Special: Hydra Poison - Double the base power of one of your Strength or Agility attacks.",
      execution: { mode: "handler", handlerId: "core.shishigou-necromancy" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shishigou.skill.ascension": {
    ...overrides["master.shishigou.skill.ascension"],
    initiallyOwned: false, tags: [...new Set([...(overrides["master.shishigou.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    abilities: [
      { id: "macabre-mastery", name: "驾驭恐惧", activation: "phase", windows: ["action"], requiresActiveCard: false, limit: "unlimited", handlerId: "core.shishigou-necromancy" },
    ],
    handlerId: "core.shishigou-necromancy", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "macabre-mastery", kind: "phase_action",
      printedClause: "Macabre Mastery - All your basic attacks gain: Action: Pay 3 mana. Activate the Necromantic Rites ability corresponding to this attack's type.",
      activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.shishigou-necromancy" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Kishinami Hakuno ♂ / Dead Face. English original: Yomi is one Combat
// ability choosing either Analysis (-2 total power) or a three-game RPS
// Challenge; Challenge Results are cumulative. Analysis is a physical token
// that follows turn order on holder elimination, and Dead Face may move one
// such token between players for 1 mana, repeatedly in the same round.
Object.assign(overrides, {
  "master.hakuno-m.skill.s1": {
    ...overrides["master.hakuno-m.skill.s1"],
    activation: "phase", windows: ["combat"], requiresActiveCard: false,
    abilities: [
      { id: "yomi", name: "Yomi", activation: "phase", windows: ["combat"], requiresActiveCard: false, handlerId: "core.hakuno-m-yomi" },
    ],
    handlerId: "core.hakuno-m-yomi", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "yomi", kind: "phase_action",
      printedClause: "Yomi - Combat: Give an opponent in your fight an Analysis and lose 2 total power, or Challenge them to 3 games of Rock, Paper, Scissors (ties are not replayed). Activate all appropriate Challenge Results based on your wins.",
      activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.hakuno-m-yomi" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hakuno-m.skill.s2": {
    ...overrides["master.hakuno-m.skill.s2"],
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.hakuno-m-yomi", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "challenge-results", kind: "passive",
      printedClause: "Challenge Results - 0 wins: you are defeated. 1+ wins: +2 total power. 2+ wins: +3 total power and give the challenged opponent an Analysis. 3+ wins: the challenged opponent is defeated. Results are cumulative.",
      execution: { mode: "handler", handlerId: "core.hakuno-m-yomi" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hakuno-m.skill.s3": {
    ...overrides["master.hakuno-m.skill.s3"],
    activation: "passive", windows: [], requiresActiveCard: false, passiveEventTypes: ["round.ended"],
    handlerId: "core.hakuno-m-yomi", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "analysis", kind: "passive",
      printedClause: "Analysis - When Hakuno Challenges you, every 3 Analysis cards you hold make Hakuno win one game. When you are eliminated, pass your Analysis in turn order to the next non-eliminated opponent of Hakuno.",
      execution: { mode: "handler", handlerId: "core.hakuno-m-yomi" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hakuno-m.skill.ascension": {
    ...overrides["master.hakuno-m.skill.ascension"],
    initiallyOwned: false,
    tags: [...new Set([...(overrides["master.hakuno-m.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    abilities: [
      { id: "dead-face-transfer", name: "Dead Face", activation: "phase", windows: ["action"], requiresActiveCard: false, abilityCost: 1, limit: "unlimited", handlerId: "core.hakuno-m-yomi" },
    ],
    handlerId: "core.hakuno-m-yomi", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "dead-face-transfer", kind: "phase_action",
      printedClause: "Dead Face - Action: Pay 1 mana. Move an Analysis card from one player to another. You may use this ability multiple times per round.",
      activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.hakuno-m-yomi" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Sei Shonagon: English original card text confirmed on the allowed Fate/Domination Fandom pages.
// Nostalgia Drive copies prior-round basic power/types plus at most one printed card ability;
// Emotional Engine creates once-per-game physical copies and caps other players' copies at 0;
// Vivid Sensation may borrow any number of those copies and waives only the 8-mana skill gate.
Object.assign(overrides, {
  "servant.sei.skill.sc-sei-1": {
    ...overrides["servant.sei.skill.sc-sei-1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["card.played", "combat.resolved"],
    handlerId: "core.sei-nostalgia", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "elate", kind: "passive", printedClause: "Elate - If you win the fight, you and Sei gain 2 VP. Sei cannot gain more than 3 VP from Elate per round.", execution: { mode: "handler", handlerId: "core.sei-nostalgia" } },
      { id: "nostalgia-drive", kind: "play_trigger", printedClause: "On Play: Gain the sum of the base power (max +10), types and up to one chosen ability of all basic attacks you played last round.", execution: { mode: "handler", handlerId: "core.sei-nostalgia" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.sei.skill.sc-sei-2": {
    ...overrides["servant.sei.skill.sc-sei-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    passiveEventTypes: ["card.played"],
    abilities: [{ id: "hyper-vibes", name: "Hyper Vibes", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.sei-nostalgia" }],
    handlerId: "core.sei-nostalgia", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "hyper-vibes", kind: "phase_action", printedClause: "Action: Play any number of Nostalgia Drives from opponents' skill zones; you do not need 8 mana. Their On Play effect uses that opponent's previous-round basics.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.sei-nostalgia" } },
      { id: "vivid-power", kind: "passive", printedClause: "Nostalgia Drives in play with one or fewer types gain +3 power.", execution: { mode: "handler", handlerId: "core.sei-nostalgia" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.sei.skill.sc-sei-3": {
    ...overrides["servant.sei.skill.sc-sei-3"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    abilities: [{ id: "emotional-engine-combat", name: "Emotional Engine", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.sei-nostalgia" }],
    handlerId: "core.sei-nostalgia", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "emotional-engine-combat", kind: "phase_action", printedClause: "Combat: Each opponent at your location without Nostalgia Drive adds a once-per-game copy to their skill zone. Other players' Nostalgia Drives in the fight cannot be increased above 0.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.sei-nostalgia" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Matou Shinji: the English original presents two Book of the False Attendant
// variants chosen at game start. Replacement is unavailable while Sakura is in
// the game; Second Contract changes to a random unused Servant at round end.
Object.assign(overrides, {
  "master.shinji.skill.s2": {
    ...overrides["master.shinji.skill.s2"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started"],
    addSkillDefinitionId: undefined,
    handlerId: "core.shinji-book", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "book-choice", kind: "passive",
      printedClause: "Unworthy - At the beginning of the game gain a Book of the False Attendant and choose one of its two versions; Replacement cannot be chosen if Matou Sakura is in the game.",
      conditions: [{ type: "event_type_is", eventType: "game.started" }],
      execution: { mode: "handler", handlerId: "core.shinji-book" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shinji.skill.s4": {
    ...overrides["master.shinji.skill.s4"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["player.command-seals.changed", "round.ending"],
    handlerId: "core.shinji-book", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "replacement", kind: "passive", printedClause: "Replacement - The first time you run out of Command Seals, at the end of that round change your Master to Matou Sakura. Set your mana to 4, gain 2 Command Seals and keep your VP.", execution: { mode: "handler", handlerId: "core.shinji-book" } },
      { id: "second-contract", kind: "passive", printedClause: "Second Contract - The first time you run out of Command Seals, at the end of that round change your Servant to a random unused Servant and regain 3 Command Seals.", execution: { mode: "handler", handlerId: "core.shinji-book" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shinji.skill.ascension": {
    ...overrides["master.shinji.skill.ascension"],
    initiallyOwned: false,
    tags: [...new Set([...(overrides["master.shinji.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["round.started", "player.victory-points.changed"],
    handlerId: "core.shinji-book", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "cancerous-vessel", kind: "passive",
      printedClause: "At the start of Climax lose Book of the False Attendant. If Shakespeare was your first and only Servant, gain +12 total power in Miyama and whenever you gain VP all opponents in Miyama lose that much VP; otherwise gain 8 VP.",
      execution: { mode: "handler", handlerId: "core.shinji-book" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.albion.skill.sc-albion-1": {
    ...overrides["servant.albion.skill.sc-albion-1"],
    tags: [...new Set([...(overrides["servant.albion.skill.sc-albion-1"]?.tags ?? []), "replacement-only-servant"])],
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// King Hassan: the allowed Fandom rulings confirm that Cut From Fate removes
// only the killed Servant's components; Master Ascension/Chaldea components remain.
Object.assign(overrides, {
  "servant.kinghassan.skill.sc-kinghassan-1": {
    ...overrides["servant.kinghassan.skill.sc-kinghassan-1"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true, standardAppend: true,
    abilities: [{ id: "final-bell-toll", name: "Final Bell Toll", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.king-hassan-azrael" }],
    handlerId: "core.king-hassan-azrael", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "final-bell-toll", kind: "phase_action", printedClause: "Combat: Every engaged opponent rolls a die and is defeated on a 6. You may discard one Luck to make one opponent reroll once.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.king-hassan-azrael" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.kinghassan.skill.sc-kinghassan-2": {
    ...overrides["servant.kinghassan.skill.sc-kinghassan-2"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["round.ending"], limit: "once-per-game",
    abilities: [{ id: "cut-from-fate", name: "Cut From Fate", activation: "phase", windows: ["combat"], requiresActiveCard: true, limit: "once-per-game", handlerId: "core.king-hassan-azrael" }],
    handlerId: "core.king-hassan-azrael", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "cut-from-fate", kind: "phase_action", printedClause: "Combat / Once per game: Choose an engaged opponent. Kill their Servant and defeat that opponent. At the end of the round they draw a new random unused Servant.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.king-hassan-azrael" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.kinghassan.skill.sc-kinghassan-3": {
    ...overrides["servant.kinghassan.skill.sc-kinghassan-3"],
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    passiveEventTypes: ["card.played"],
    abilities: [{ id: "final-bell-toll", name: "Final Bell Toll", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.king-hassan-azrael" }],
    handlerId: "core.king-hassan-azrael", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "death-power", kind: "passive", printedClause: "This attack gains +1 power for every opponent that is defeated or eliminated.", execution: { mode: "handler", handlerId: "core.king-hassan-azrael" } },
      { id: "final-bell-toll", kind: "phase_action", printedClause: "Combat: Every engaged opponent rolls a die and is defeated on a 5 or 6. You may discard one Luck to make one opponent reroll once.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.king-hassan-azrael" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Reines Archisorte: English original confirmed on the allowed Fate/Domination Fandom page.
// The three Trimmau attacks begin outside the game, can be fetched by Alchemist,
// and keep their hand-zone Combat abilities distinct from their active Action abilities.
Object.assign(overrides, {
  "master.reines.skill.s1": {
    ...overrides["master.reines.skill.s1"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["card.played"], addCardToHandDefinitionId: undefined,
    abilities: [{ id: "alchemist-fetch", name: "Alchemist", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.reines-trimmau" }],
    handlerId: "core.reines-trimmau", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "alchemist-fetch", kind: "phase_action", printedClause: "Alchemist - Action: Add a Trimmau from outside of the game to your hand without revealing it.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.reines-trimmau" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.reines.skill.s1a": {
    ...overrides["master.reines.skill.s1a"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.reines-trimmau", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "sadistic", kind: "passive", printedClause: "Sadistic - After you win a fight steal 1 VP from a loser of the fight who would be eliminated at the next elimination.", conditions: [{ type: "event_type_is", eventType: "combat.resolved" }], execution: { mode: "handler", handlerId: "core.reines-trimmau" } },
      { id: "petty", kind: "passive", printedClause: "Petty - When you lose a fight, discard your hand.", conditions: [{ type: "event_type_is", eventType: "combat.resolved" }], execution: { mode: "handler", handlerId: "core.reines-trimmau" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.reines.skill.s2": {
    ...overrides["master.reines.skill.s2"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    abilities: [
      { id: "scalp-play", name: "Scalp", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.reines-trimmau" },
      { id: "trimmau-power-hand", name: "Trimmau", activation: "phase", windows: ["combat"], requiresActiveCard: false, handlerId: "core.reines-trimmau" },
    ],
    handlerId: "core.reines-trimmau", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "scalp-play", kind: "phase_action", printedClause: "Scalp - Action: Play an attack.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.reines-trimmau" } },
      { id: "trimmau-power-hand", kind: "phase_action", printedClause: "Passive/Combat: If this card is in your hand, gain +2 total power.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.reines-trimmau" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.reines.skill.s3": {
    ...overrides["master.reines.skill.s3"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    abilities: [
      { id: "ex-medullis-alis", name: "Ex Medullis, Alis", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.reines-trimmau" },
      { id: "trimmau-wing-hand", name: "Trimmau", activation: "phase", windows: ["combat"], requiresActiveCard: false, handlerId: "core.reines-trimmau" },
    ],
    handlerId: "core.reines-trimmau", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "ex-medullis-alis", kind: "phase_action", printedClause: "Ex Medullis, Alis - Action: Move 1 space against the arrows.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.reines-trimmau" } },
      { id: "trimmau-wing-hand", kind: "phase_action", printedClause: "Passive/Combat: If this card is in your hand, move 1 space along the arrows.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.reines-trimmau" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.reines.skill.s4": {
    ...overrides["master.reines.skill.s4"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    abilities: [
      { id: "ire-confessio", name: "Ire: Confessio", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.reines-trimmau" },
      { id: "trimmau-mana-hand", name: "Trimmau", activation: "phase", windows: ["combat"], requiresActiveCard: false, handlerId: "core.reines-trimmau" },
    ],
    handlerId: "core.reines-trimmau", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "ire-confessio", kind: "phase_action", printedClause: "Ire: Confessio - Action: Look at the skill zone of an opponent at your location. If their name was revealed when you used this effect, gain +4 total power instead.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.reines-trimmau" } },
      { id: "trimmau-mana-hand", kind: "phase_action", printedClause: "Passive/Combat: If this card is in your hand, gain 1 mana.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.reines-trimmau" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.reines.skill.ascension": {
    ...overrides["master.reines.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.reines.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.reines-trimmau", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "fervor-mei-sanguis", kind: "passive", printedClause: "Fervor, Mei Sanguis - Passive: Trimmau attacks gain Strength and +1 power for each time you played a Trimmau attack this game.", execution: { mode: "handler", handlerId: "core.reines-trimmau" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Solomon ibn Gabirol / Avicebron: Golem Keter Malkuth and Rigorous Research are
// confirmed from the allowed Fate/Domination Fandom pages. Lesser/Common Golem
// are physical deck cards (confirmed by the English Servant deck list), not extra
// starting Skill cards; their printed residual/unique text is retained by stable ids.
Object.assign(overrides, {
  "servant.avicebron.skill.sc-avicebron-1": {
    ...overrides["servant.avicebron.skill.sc-avicebron-1"],
    activation: "phase", windows: ["outpost", "combat"], requiresActiveCard: false,
    passiveEventTypes: ["card.played", "combat.ending"],
    abilities: [
      { id: "kabbalistic-study", name: "Kabbalistic Study", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.avicebron-golems" },
      { id: "reinforced-golem-plating", name: "Reinforced Golem Plating", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.avicebron-golems" },
    ],
    handlerId: "core.avicebron-golems", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "kabbalistic-study", kind: "phase_action", printedClause: "Kabbalistic Study - Passive/Outpost: Discard 2 basic Magic and/or Preparation cards to gain 2 mana.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.avicebron-golems" } },
      { id: "reinforced-golem-plating", kind: "phase_action", printedClause: "Reinforced Golem Plating - Combat: Your Golems that would be deactivated this round are deactivated after combat instead.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.avicebron-golems" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.avicebron.skill.sc-avicebron-2": {
    ...overrides["servant.avicebron.skill.sc-avicebron-2"],
    activation: "residual", windows: [], requiresActiveCard: true, cardResidual: true,
    revealsTrueNameOnPlay: true, limit: "once-per-game",
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.avicebron-golems", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "keter-malkuth", kind: "residual", printedClause: "Permanent: This card is a Golem. If you fight and do not have the highest total power, deactivate all your Golems including this card. When you win a fight, put a Golem from your hand, deck or discard into play.", conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "combat.resolved" }], execution: { mode: "handler", handlerId: "core.avicebron-golems" }, lifecycle: { duration: "while_active" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.avicebron.skill.sc-avicebron-4": {
    ...overrides["servant.avicebron.skill.sc-avicebron-4"],
    initiallyOwned: false,
    activation: "residual", windows: [], requiresActiveCard: true, cardResidual: true,
    passiveEventTypes: ["phase.transitioned"], uniqueGroup: "avicebron-golem-upkeep",
    handlerId: "core.avicebron-golems", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "golem-hand-cost", kind: "residual", printedClause: "Permanent: Golems in your hand cost +1 mana.", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.avicebron-golems" }, lifecycle: { duration: "while_active" } },
      { id: "golem-upkeep", kind: "passive", printedClause: "Unique: On your Combat turn, deactivate one non-Skill Golem for every opponent in your fight.", execution: { mode: "handler", handlerId: "core.avicebron-golems" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.avicebron.skill.sc-avicebron-5": {
    ...overrides["servant.avicebron.skill.sc-avicebron-5"],
    initiallyOwned: false,
    activation: "residual", windows: [], requiresActiveCard: true, cardResidual: true,
    passiveEventTypes: ["phase.transitioned"], uniqueGroup: "avicebron-golem-upkeep",
    handlerId: "core.avicebron-golems", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "golem-hand-cost", kind: "residual", printedClause: "Permanent: Golems in your hand cost +1 mana.", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.avicebron-golems" }, lifecycle: { duration: "while_active" } },
      { id: "golem-upkeep", kind: "passive", printedClause: "Unique: On your Combat turn, deactivate one non-Skill Golem for every opponent in your fight.", execution: { mode: "handler", handlerId: "core.avicebron-golems" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Kishinami Hakuno ♀ (allowed Fate/Domination Fandom English original): Mystic Codes are
// game-outside physical Skill/Attacks. Their passive drawbacks remain live in the skill zone;
// activated cc_ abilities require the code to be active.
Object.assign(overrides, {
  "master.hakuno-f.skill.s1": {
    ...overrides["master.hakuno-f.skill.s1"],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    abilities: [{ id: "dress-change", name: "Dress Change", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.hakuno-f-mystic-code" }],
    handlerId: "core.hakuno-f-mystic-code", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "dress-change", kind: "phase_action", printedClause: "Outpost: Discard a card at random. Add a [Mystic Code] of your choice from outside of the game to your skill zone until you activate this ability again. [Mystic Codes] are played in addition to your regular attack.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.hakuno-f-mystic-code" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hakuno-f.skill.s2": {
    ...overrides["master.hakuno-f.skill.s2"],
    initiallyOwned: false, activation: "phase", windows: ["action"], standardAppend: true,
    abilities: [{ id: "cc-moon-drive", name: "cc_Moon_Drive()", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.hakuno-f-mystic-code" }],
    handlerId: "core.hakuno-f-mystic-code", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "spirit-synchronization", kind: "passive", printedClause: "Spirit Synchronization - Passive: You cannot use your master's Command Seals for anything but movement or payment.", execution: { mode: "handler", handlerId: "core.hakuno-f-mystic-code" } },
      { id: "cc-moon-drive", kind: "phase_action", printedClause: "cc_Moon_Drive() - Action: Attacks you played this round gain power equal to their mana cost, to a maximum of +3.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.hakuno-f-mystic-code" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hakuno-f.skill.s3": {
    ...overrides["master.hakuno-f.skill.s3"],
    initiallyOwned: false, activation: "phase", windows: ["action"], standardAppend: true,
    passiveEventTypes: ["combat.resolved"],
    abilities: [{ id: "cc-hack", name: "cc_Hack()", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.hakuno-f-mystic-code" }],
    handlerId: "core.hakuno-f-mystic-code", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "data-leak", kind: "passive", printedClause: "Data Leak - Passive: Whenever you lose a fight, lose 1 VP.", conditions: [{ type: "event_type_is", eventType: "combat.resolved" }], execution: { mode: "handler", handlerId: "core.hakuno-f-mystic-code" } },
      { id: "cc-hack", kind: "phase_action", printedClause: "cc_Hack() - Action: Pick a player on a battlefield. Look at the top 3 cards of their deck. Discard as many cards as you like and return the rest on top of their deck in any order.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.hakuno-f-mystic-code" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hakuno-f.skill.s4": {
    ...overrides["master.hakuno-f.skill.s4"],
    initiallyOwned: false, activation: "phase", windows: ["combat"], standardAppend: true,
    passiveEventTypes: ["player.moved", "combat.resolved", "card.played"],
    abilities: [{ id: "cc-recovery", name: "cc_Recovery()", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.hakuno-f-mystic-code" }],
    handlerId: "core.hakuno-f-mystic-code", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "channeled-cast", kind: "passive", printedClause: "Channeled Cast - Passive: When you move, remove this card (it can be returned later).", conditions: [{ type: "event_type_is", eventType: "player.moved" }], execution: { mode: "handler", handlerId: "core.hakuno-f-mystic-code" } },
      { id: "cc-recovery", kind: "phase_action", printedClause: "cc_Recovery() - Combat: If you lose the fight, gain half (round up) the mana cost of an active non-permanent attack you played this round.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.hakuno-f-mystic-code" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hakuno-f.skill.s5": {
    ...overrides["master.hakuno-f.skill.s5"],
    initiallyOwned: false, activation: "passive", windows: [], standardAppend: true,
    passiveEventTypes: ["combat.resolved", "player.entered-location"],
    handlerId: "core.hakuno-f-mystic-code", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "emergency-protocol", kind: "passive", printedClause: "Emergency Protocol - Passive: When you win a fight, remove this card (it can be returned later).", conditions: [{ type: "event_type_is", eventType: "combat.resolved" }], execution: { mode: "handler", handlerId: "core.hakuno-f-mystic-code" } },
      { id: "cc-backdoor", kind: "passive", printedClause: "cc_Backdoor(); - Whenever an opponent enters your battlefield you may move to Recon. You do not count against the player limit at Recon.", conditions: [{ type: "event_type_is", eventType: "player.entered-location" }], execution: { mode: "handler", handlerId: "core.hakuno-f-mystic-code" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hakuno-f.skill.ascension": {
    ...overrides["master.hakuno-f.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.hakuno-f.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false, passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.hakuno-f-mystic-code", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "moon-cell-regalia", kind: "passive", printedClause: "Moon Cell Regalia - [Extra] has no 8 mana requirement; [CCC] may play a temporary paid copy of a card discarded with cc_Hack(); [Extella] gains +5 power and you have 0 terrain advantage; [Link] makes your basic attacks +1 power.", conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }], execution: { mode: "handler", handlerId: "core.hakuno-f-mystic-code" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Leonardo Da Vinci: the allowed Fandom English pages confirm the three true Servant
// skills and the Workshop Store Item lifecycle. s4-s17 are Store Items outside the
// normal starting skill package; acquired items become master-owned physical skills.
Object.assign(overrides, {
  "servant.davinci.skill.sc-davinci-1": {
    ...overrides["servant.davinci.skill.sc-davinci-1"],
    activation: "passive", revealsTrueNameOnPlay: true, passiveEventTypes: ["card.played"],
    handlerId: "core.davinci-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "uomo-universale-copy", kind: "play_trigger", printedClause: "On play: This card becomes a copy of any revealed Noble Phantasm attack until the end of the round. It gains +1 power and the Magic type. You don't lose this card if you copy a once per game attack.", conditions: [{ type: "event_type_is", eventType: "card.played" }], execution: { mode: "handler", handlerId: "core.davinci-package" }, lifecycle: { duration: "round" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.davinci.skill.sc-davinci-2": {
    ...overrides["servant.davinci.skill.sc-davinci-2"],
    activation: "residual", cardResidual: true, requiresActiveCard: true,
    costRule: { kind: "round-linear", base: 16, perRound: -2, min: 0 },
    passiveEventTypes: ["game.started", "player.deployed"],
    handlerId: "core.davinci-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "store-auction", kind: "residual", printedClause: "Permanent: When you deploy in the Workshop draw 3 Store Items. Pick one and discard the rest. In turn order your opponents may pay you 2 VP to acquire the card. If nobody does, you gain it instead.", conditions: [{ type: "source_active" }, { type: "event_type_is", eventType: "player.deployed" }], execution: { mode: "handler", handlerId: "core.davinci-package" }, lifecycle: { duration: "while_active" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.davinci.skill.sc-davinci-3": {
    ...overrides["servant.davinci.skill.sc-davinci-3"],
    activation: "phase", windows: ["action"], requiresEightMana: false, requiresActiveCard: true, cardResidual: true,
    passiveEventTypes: ["card.played", "card.closed"],
    abilities: [
      { id: "natural-genius-mana", name: "Natural Born Genius · Mana", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.davinci-package" },
      { id: "natural-genius-power", name: "Natural Born Genius · Power", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.davinci-package" },
    ],
    handlerId: "core.davinci-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "overtime", kind: "passive", printedClause: "Overtime - When this card is deactivated lose 6 mana.", conditions: [{ type: "event_type_is", eventType: "card.closed" }], execution: { mode: "handler", handlerId: "core.davinci-package" } },
      { id: "two-round-genius", kind: "residual", printedClause: "Permanent: This card remains in play for 2 rounds. Double the effect of Level Up items on this card.", conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.davinci-package" }, lifecycle: { duration: "custom" } },
      { id: "natural-genius-mana", kind: "phase_action", printedClause: "Action: Gain 2 mana.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.davinci-package" } },
      { id: "natural-genius-power", kind: "phase_action", printedClause: "Action: Gain +2 total power.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.davinci-package" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.davinci.skill.sc-davinci-9": {
    ...overrides["servant.davinci.skill.sc-davinci-9"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.davinci-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "mona-lisa-auction-stop", kind: "triggered", printedClause: "When Da Vinci starts an auction, you may remove this card to immediately end the auction and acquire the item.", execution: { mode: "handler", handlerId: "core.davinci-package" }, lifecycle: { cleanup: "remove" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

for (let storeIndex = 4; storeIndex <= 17; storeIndex += 1) {
  const skillId = `servant.davinci.skill.sc-davinci-${storeIndex}`;
  overrides[skillId] = { ...overrides[skillId], initiallyOwned: false };
}

// Fujimaru Ritsuka ♀: allowed Fandom English Master/Ascension pages confirm
// Gacha Queen's combined two-Servant deck, Tag's identity/skill swap, and the
// three mutually-exclusive Command Chain rewards.
Object.assign(overrides, {
  "master.ritsuka-f.skill.s1": {
    ...overrides["master.ritsuka-f.skill.s1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started"],
    handlerId: "core.ritsuka-f-dual-servant", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "gacha-queen", kind: "passive",
      printedClause: "Gacha Queen - You have 2 Servants. Combine their decks. Assign one as Fighter and one as Support. The Support and their skills are not in the game.",
      conditions: [{ type: "event_type_is", eventType: "game.started" }],
      execution: { mode: "handler", handlerId: "core.ritsuka-f-dual-servant" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.ritsuka-f.skill.s1a": {
    ...overrides["master.ritsuka-f.skill.s1a"],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    abilities: [{ id: "tag", name: "Tag", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.ritsuka-f-dual-servant" }],
    handlerId: "core.ritsuka-f-dual-servant", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "tag", kind: "phase_action", printedClause: "Tag - Outpost: Discard your hand, then draw 3 cards. Your Fighter becomes Support and vice versa.",
      activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.ritsuka-f-dual-servant" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.ritsuka-f.skill.ascension": {
    ...overrides["master.ritsuka-f.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.ritsuka-f.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    abilities: [
      { id: "command-chain-strength", name: "Command Chain · Strength", activation: "phase", windows: ["action"], requiresActiveCard: false, uniqueGroup: "ritsuka-f-command-chain", handlerId: "core.ritsuka-f-dual-servant" },
      { id: "command-chain-agility", name: "Command Chain · Agility", activation: "phase", windows: ["action"], requiresActiveCard: false, uniqueGroup: "ritsuka-f-command-chain", handlerId: "core.ritsuka-f-dual-servant" },
      { id: "command-chain-magic", name: "Command Chain · Magic", activation: "phase", windows: ["action"], requiresActiveCard: false, uniqueGroup: "ritsuka-f-command-chain", handlerId: "core.ritsuka-f-dual-servant" },
    ],
    handlerId: "core.ritsuka-f-dual-servant", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "command-chain-strength", kind: "phase_action", printedClause: "Action: If you played two cards with a shared Strength attribute, gain +3 Total Power.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.ritsuka-f-dual-servant" } },
      { id: "command-chain-agility", kind: "phase_action", printedClause: "Action: If you played two cards with a shared Agility attribute, next round gain +5 Total Power.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.ritsuka-f-dual-servant" } },
      { id: "command-chain-magic", kind: "phase_action", printedClause: "Action: If you played two cards with a shared Magic attribute, gain 2 Mana.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.ritsuka-f-dual-servant" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Lakshmibai: English Fandom confirms Queen of Resistance and Nahi Doongi.
// Misfortune is an ordinary physical deck card (card.x-misfortune), not a
// starting Servant-skill-zone card; its response/play lifecycle is implemented
// by the generic card runtime and this catalogue shadow therefore starts outside.
Object.assign(overrides, {
  "servant.lakshmibai.skill.sc-lakshmibai-1": {
    ...overrides["servant.lakshmibai.skill.sc-lakshmibai-1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.lakshmibai-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "queen-of-resistance", kind: "passive",
      printedClause: "Passive: If you won a fight against a player who had more VP than you, you cannot be eliminated at the end of this round. If you win a fight in the last round of the game and you don't have the highest VP, play another round using Heaven's Feel as its situation.",
      conditions: [{ type: "event_type_is", eventType: "combat.resolved" }],
      execution: { mode: "handler", handlerId: "core.lakshmibai-package" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.lakshmibai.skill.sc-lakshmibai-2": {
    ...overrides["servant.lakshmibai.skill.sc-lakshmibai-2"],
    activation: "passive", windows: [], requiresActiveCard: false,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["player.entered-location"],
    handlerId: "core.lakshmibai-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "guerrilla-resistance", kind: "passive",
      printedClause: "Passive: When an opponent enters your battlefield you may play a card, halve its base power (round up) and use its Actions. If you play this one, move an opponent on your battlefield to an adjacent location.",
      conditions: [{ type: "event_type_is", eventType: "player.entered-location" }],
      execution: { mode: "handler", handlerId: "core.lakshmibai-package" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.lakshmibai.skill.sc-lakshmibai-4": {
    ...overrides["servant.lakshmibai.skill.sc-lakshmibai-4"],
    initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.lakshmibai-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "misfortune-response", kind: "passive", printedClause: "Passive: When defeated, you may discard Misfortune from your hand; gain 3 VP and defeat all opponents on your battlefield.", execution: { mode: "handler", handlerId: "core.lakshmibai-package" } },
      { id: "misfortune-play", kind: "play_trigger", printedClause: "On Play: Draw 1 card. If you lose the fight, shuffle Misfortune into your deck.", execution: { mode: "handler", handlerId: "core.lakshmibai-package" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Fujimaru Ritsuka ♂: allowed Fandom English Master/CE/Ascension pages confirm the
// 15-card Craft Essence pool, Gacha Slave draw/pick flow and Priest's Blessing.
Object.assign(overrides, {
  "master.ritsuka-m.skill.s1": {
    ...overrides["master.ritsuka-m.skill.s1"],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    passiveEventTypes: ["game.started"],
    abilities: [{ id: "gacha-slave", name: "Gacha Slave", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.ritsuka-m-craft-essence" }],
    handlerId: "core.ritsuka-m-craft-essence", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "craft-essence-setup", kind: "passive", printedClause: "After receiving your Servant remove 3 of your 15 Craft Essences from the game.", conditions: [{ type: "event_type_is", eventType: "game.started" }], execution: { mode: "handler", handlerId: "core.ritsuka-m-craft-essence" } },
      { id: "gacha-slave", kind: "phase_action", printedClause: "Outpost: Pay X mana. Shuffle all available Craft Essences and draw X+1. Pick one drawn Essence and gain its effects this round.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.ritsuka-m-craft-essence" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.ritsuka-m.skill.s2": {
    ...overrides["master.ritsuka-m.skill.s2"],
    activation: "phase", windows: ["combat"], requiresActiveCard: false,
    passiveEventTypes: ["combat.ending"],
    abilities: [{ id: "craft-essence-deception", name: "Deception", activation: "phase", windows: ["combat"], limit: "twice-per-round", requiresActiveCard: false, handlerId: "core.ritsuka-m-craft-essence" }],
    handlerId: "core.ritsuka-m-craft-essence", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "craft-essence-effects", kind: "passive",
      printedClause: "The 15 Craft Essences are Destruction, Concentration, Technique, Mapo Tofu, Deception, Tenacity, Barrier, Ley Line, Opportunity, Flash, Preemption, Linkage, Meditation, Gloom and Combat, with the effects printed on the English Craft Essences page.",
      execution: { mode: "handler", handlerId: "core.ritsuka-m-craft-essence" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.ritsuka-m.skill.ascension": {
    ...overrides["master.ritsuka-m.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.ritsuka-m.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.ritsuka-m-craft-essence", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "priests-blessing", kind: "passive",
      printedClause: "Immediately add this card to your attack. Permanent: Never deactivate it. Whenever you gain Mapo Tofu, double this card's base power for each time you gained it this game.",
      conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }],
      execution: { mode: "handler", handlerId: "core.ritsuka-m-craft-essence" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Asagami Fujino: the allowed English Fandom Master page defines Hyposthesia,
// Warp Space, all six Injury/Pain faces, Distortion and Remaining Sense of Pain.
Object.assign(overrides, {
  "master.fujino.skill.s1a": {
    ...overrides["master.fujino.skill.s1a"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["phase.transitioned"],
    handlerId: "core.fujino-injury-warp", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "hyposthesia", kind: "passive",
      printedClause: "On your Combat turn if you are on a battlefield draw 2 random Injuries, gain one and shuffle the other back into the Injury deck.",
      conditions: [{ type: "event_type_is", eventType: "phase.transitioned" }],
      execution: { mode: "handler", handlerId: "core.fujino-injury-warp" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.fujino.skill.s2": {
    ...overrides["master.fujino.skill.s2"],
    activation: "phase", windows: ["preparation", "outpost", "action", "combat"], requiresActiveCard: false,
    tags: [...new Set([...(overrides["master.fujino.skill.s2"]?.tags ?? []), "any-phase-out-of-turn"])],
    abilities: [{ id: "repair-space", name: "Repair", activation: "phase", windows: ["preparation", "outpost", "action", "combat"], requiresActiveCard: false, handlerId: "core.fujino-injury-warp" }],
    handlerId: "core.fujino-injury-warp", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "warp-space", kind: "passive", printedClause: "Workshop arrows point to Shinto, Shinto arrows point to Miyama, and Miyama arrows point to Recon. This changes which locations are adjacent.", execution: { mode: "handler", handlerId: "core.fujino-injury-warp" } },
      { id: "repair-space", kind: "phase_action", printedClause: "Any Phase: Deactivate Warp Space.", execution: { mode: "handler", handlerId: "core.fujino-injury-warp" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.fujino.skill.s3": {
    ...overrides["master.fujino.skill.s3"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    standardAppend: true,
    abilities: [{ id: "bend-space", name: "Bend!", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.fujino-injury-warp" }],
    handlerId: "core.fujino-injury-warp", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "distortion-append", kind: "passive", printedClause: "This card is played in addition to your attack.", execution: { mode: "handler", handlerId: "core.fujino-injury-warp" } },
      { id: "bend-space", kind: "phase_action", printedClause: "Bend! - Action: Activate Warp Space.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.fujino-injury-warp" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.fujino.skill.s4": {
    ...overrides["master.fujino.skill.s4"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["phase.transitioned", "player.moved", "player.command-seal-used", "combat.ending"],
    handlerId: "core.fujino-injury-warp", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "injury-pain", kind: "passive",
      printedClause: "Head: randomly discard on gain and at the start of your Action turn. Shoulder: basics have -1 power. Stomach: treat +2 mana and +3 Terrain Advantage spaces as occupied. Wrist: lose 1 VP when using a Command Seal. Leg: lose 1 mana after moving on your turn. Spinal: add Distortion to your attack, remove remaining Injuries and flip active Injuries to Pain. Pain - Unique: after combat discard one Pain. Run Amok: your skills cost 1 less mana.",
      execution: { mode: "handler", handlerId: "core.fujino-injury-warp" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.fujino.skill.ascension": {
    ...overrides["master.fujino.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.fujino.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.fujino-injury-warp", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "remaining-sense-of-pain", kind: "passive",
      printedClause: "Add a second Distortion to your skill zone. After gaining Spinal Injury, gain 4 VP when all of your Pain is lost.",
      conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }],
      execution: { mode: "handler", handlerId: "core.fujino-injury-warp" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Brainwash Detective Hisui: allowed English Fandom Master page fully defines Locked-Room Mystery,
// physical Clues/Culprits, Confrontation and Deduction Mode.
Object.assign(overrides, {
  "master.hisui-detective.skill.s1": {
    ...overrides["master.hisui-detective.skill.s1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started"],
    handlerId: "core.hisui-detective", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "locked-room-setup", kind: "passive",
      printedClause: "Locked-Room Mystery - Remove a Break Bounded Field from the deck.",
      conditions: [{ type: "event_type_is", eventType: "game.started" }],
      execution: { mode: "handler", handlerId: "core.hisui-detective" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hisui-detective.skill.s1a": {
    ...overrides["master.hisui-detective.skill.s1a"],
    activation: "passive", windows: [], requiresActiveCard: false, limit: undefined,
    passiveEventTypes: ["phase.transitioned", "combat.resolved", "player.deployed", "player.entered-location"],
    handlerId: "core.hisui-detective", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "locked-room-mystery", kind: "passive",
      printedClause: "Once per game, at the end of Outpost you may add a Break Bounded Field from outside the game to a battlefield with 2+ opponents. Opponents who win that fight leave a Clue there.",
      execution: { mode: "handler", handlerId: "core.hisui-detective" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hisui-detective.skill.s2": {
    ...overrides["master.hisui-detective.skill.s2"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.hisui-detective", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "clue-culprit", kind: "passive", printedClause: "Note down the Culprit who left this Clue.", execution: { mode: "handler", handlerId: "core.hisui-detective" } },
      { id: "clue-acquire", kind: "passive", printedClause: "Unique: When Hisui deploys on a terrain space at this location, she adds a Clue there to her skill zone.", execution: { mode: "handler", handlerId: "core.hisui-detective" } },
      { id: "investigate", kind: "passive", printedClause: "Investigate - Passive: When you enter Recon, transform this card.", execution: { mode: "handler", handlerId: "core.hisui-detective" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hisui-detective.skill.s3": {
    ...overrides["master.hisui-detective.skill.s3"], initiallyOwned: false,
    activation: "phase", windows: ["action"], requiresActiveCard: false, limit: "unlimited",
    abilities: [{ id: "perfect-deduction", name: "Perfect Deduction", activation: "phase", windows: ["action"], limit: "unlimited", requiresActiveCard: false, handlerId: "core.hisui-detective" }],
    handlerId: "core.hisui-detective", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "perfect-deduction", kind: "phase_action",
      printedClause: "Once Per Game - Passive/Action: If it's round 11, eliminate the Culprit. Otherwise if they are on your battlefield, steal 4 VP from them and gain +5 total power.",
      activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.hisui-detective" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hisui-detective.skill.ascension": {
    ...overrides["master.hisui-detective.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.hisui-detective.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.hisui-detective", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "deduction-mode", kind: "passive",
      printedClause: "Immediately transform a Clue. Then remove a Break Bounded Field in the discard from the game. If you did, regain one use of Locked-Room Mystery.",
      conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }],
      execution: { mode: "handler", handlerId: "core.hisui-detective" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Demon God Goetia: allowed English Fandom text fully defines Collective Consciousness,
// all seven physical Demon Gods, and the Temple of Time ascension attack.
Object.assign(overrides, {
  "master.goetia.skill.s1": {
    ...overrides["master.goetia.skill.s1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started", "round.ending"],
    handlerId: "core.goetia-demon-gods", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "collective-consciousness", kind: "passive",
      printedClause: "Collective Consciousness - You have no Command Seals. Put 7 Demon Gods into play. At the end of a round where you did not win a fight remove a Demon God you control; if you cannot, you are eliminated.",
      execution: { mode: "handler", handlerId: "core.goetia-demon-gods" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.goetia.skill.s2": {
    ...overrides["master.goetia.skill.s2"],
    activation: "phase", windows: ["outpost", "action", "combat"], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved", "combat.ending", "card.played"],
    abilities: [
      { id: "phenex-regeneration", name: "Phenex", activation: "phase", windows: ["action"], limit: "unlimited", requiresActiveCard: false, handlerId: "core.goetia-demon-gods" },
      { id: "forneus-invocation", name: "Forneus", activation: "phase", windows: ["combat"], limit: "unlimited", requiresActiveCard: false, handlerId: "core.goetia-demon-gods" },
      { id: "flauros-conversion", name: "Flauros", activation: "phase", windows: ["outpost"], limit: "unlimited", requiresActiveCard: false, handlerId: "core.goetia-demon-gods" },
      { id: "raum-dream-flight", name: "Raum", activation: "phase", windows: ["action"], limit: "unlimited", requiresActiveCard: false, handlerId: "core.goetia-demon-gods" },
      { id: "barbatos-future-sight", name: "Barbatos", activation: "phase", windows: ["action"], limit: "unlimited", requiresActiveCard: false, handlerId: "core.goetia-demon-gods" },
    ],
    handlerId: "core.goetia-demon-gods", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "demon-god-passives", kind: "passive", printedClause: "Baal and Phenex have immutable power. Baal makes Demon Gods additional attacks and reduces their costs by non-Demon-God attacks played with them. Zepar, Raum and Barbatos have their printed permanent replacement/return effects.", execution: { mode: "handler", handlerId: "core.goetia-demon-gods" } },
      { id: "phenex-regeneration", kind: "phase_action", printedClause: "Action: Remove an active Demon God except Phenex from the game. Gain 6 mana.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.goetia-demon-gods" } },
      { id: "forneus-invocation", kind: "phase_action", printedClause: "Combat: Shuffle Forneus into your deck and deactivate an attack you control. Play a card, pay its cost and use its Actions.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.goetia-demon-gods" } },
      { id: "flauros-conversion", kind: "phase_action", printedClause: "Outpost: Shuffle Flauros into your deck. You have +5 total power until the end of the round.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.goetia-demon-gods" } },
      { id: "raum-dream-flight", kind: "phase_action", printedClause: "Action: Discard Raum from your hand or from play. Move to any location.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.goetia-demon-gods" } },
      { id: "barbatos-future-sight", kind: "phase_action", printedClause: "Action: Shuffle Barbatos into your deck. This round you do not need 8 mana to play skills and events cannot prevent you from using Noble Phantasms.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.goetia-demon-gods" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.goetia.skill.ascension": {
    ...overrides["master.goetia.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.goetia.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked", "card.played"],
    abilities: [{ id: "temple-demon-god-summoning", name: "Temple of Time", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.goetia-demon-gods" }],
    handlerId: "core.goetia-demon-gods", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "temple-of-time", kind: "passive", printedClause: "Immediately add this card to your attack. Permanent: Never deactivate it. Demon Gods have On Play: this card gains +4 power.", execution: { mode: "handler", handlerId: "core.goetia-demon-gods" } },
      { id: "temple-demon-god-summoning", kind: "phase_action", printedClause: "Outpost: Pay 1 mana. If you have no Demon Gods in hand, discard your hand then draw 3 cards.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.goetia-demon-gods" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Nrvnqsr Chaos: Beasts are a separate physical side deck, not identity-owned
// always-on skills.  The 666 engine owns the shared draw/play lifecycle.
for (let index = 2; index <= 16; index += 1) {
  const skillId = `master.chaos.skill.s${index}`;
  overrides[skillId] = {
    ...overrides[skillId],
    initiallyOwned: false,
    tags: [...new Set([...(overrides[skillId]?.tags ?? []), "chaos-beast"])],
  };
}
Object.assign(overrides, {
  "master.chaos.skill.s1": {
    ...overrides["master.chaos.skill.s1"],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    passiveEventTypes: ["game.started", "player.mana.changed", "round.started", "phase.transitioned", "card.closed"],
    abilities: [{ id: "chaos-beast-play", name: "The 666", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.chaos-beast-engine" }],
    handlerId: "core.chaos-beast-engine", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "the-666-passive", kind: "passive", printedClause: "When you gain mana, draw half that many Beasts, rounded down. Keep Beasts in a separate hand/discard. Scrambled Seals are not Command Seals.", execution: { mode: "handler", handlerId: "core.chaos-beast-engine" } },
      { id: "chaos-beast-play", kind: "phase_action", printedClause: "Outpost: Play a Beast. Its printed cost is paid by discarding that many Beasts. Beasts may only be played this way.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.chaos-beast-engine" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.chaos.skill.s3": {
    ...overrides["master.chaos.skill.s3"], initiallyOwned: false,
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    abilities: [{ id: "chaos-devourer-offer", name: "Offer Your Lives", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.chaos-beast-engine" }],
    handlerId: "core.chaos-beast-engine", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "chaos-devourer-offer", kind: "phase_action", printedClause: "Action: Discard up to 3 Beasts to gain twice that much mana. Do not draw Beasts from this mana gain.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.chaos-beast-engine" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.chaos.skill.s4": {
    ...overrides["master.chaos.skill.s4"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["card.played"],
    handlerId: "core.chaos-beast-engine", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "watcher-hide-your-fears", kind: "passive", printedClause: "On Play: Next round on your Preparation turn draw 3 Beasts, then discard 2.", execution: { mode: "handler", handlerId: "core.chaos-beast-engine" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.chaos.skill.s6": {
    ...overrides["master.chaos.skill.s6"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.chaos-beast-engine", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "colossus-cover-your-ears", kind: "passive", printedClause: "Combat: If you lose the fight, draw 2 Beasts.", execution: { mode: "handler", handlerId: "core.chaos-beast-engine" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.chaos.skill.s11": {
    ...overrides["master.chaos.skill.s11"], initiallyOwned: false,
    activation: "residual", windows: [], requiresActiveCard: false, cardResidual: true,
    passiveEventTypes: ["card.played", "player.command-seal-used"],
    handlerId: "core.chaos-beast-engine", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "emperor-bend-the-knee", kind: "residual",
      printedClause: "Bend The Knee - Permanent: Scrambled Seals are Command Seals. When you spend one deactivate this card.",
      execution: { mode: "handler", handlerId: "core.chaos-beast-engine" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.chaos.skill.s12": {
    ...overrides["master.chaos.skill.s12"], initiallyOwned: false,
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    abilities: [{ id: "rush", name: "Make Way", activation: "phase", windows: ["action"], requiresActiveCard: true }],
    supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "rush", kind: "phase_action", activation: { phase: "action" }, printedClause: "Choose X freely between 1 and 3. Action: Move up to X spaces along the arrows. This card gains 1+X power.", execution: { mode: "automatic" },
      conditions: [{ type: "source_active" }],
      effects: [
        { type: "move_forward", target: "controller", steps: { type: "payload_number", key: "x", min: 1, max: 3 } },
        { type: "source_card_power_bonus", id: "rush", amount: { type: "payload_number_plus", key: "x", add: 1, min: 2, max: 4 }, duration: "game" },
      ],
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.chaos.skill.s16": {
    ...overrides["master.chaos.skill.s16"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["card.played"],
    handlerId: "core.chaos-beast-engine", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "the-999th-despair", kind: "passive", printedClause: "On Play: Discard your Beast hand. X becomes twice the number discarded this way, maximum 10.", execution: { mode: "handler", handlerId: "core.chaos-beast-engine" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.chaos.skill.s17": {
    ...overrides["master.chaos.skill.s17"],
    activation: "phase", windows: ["action"], requiresActiveCard: false, limit: "once-per-game",
    passiveEventTypes: ["combat.resolved"],
    abilities: [{ id: "chaos-scrambled-seal", name: "Scrambled Seals", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.chaos-beast-engine" }],
    handlerId: "core.chaos-beast-engine", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "chaos-scrambled-seal", kind: "phase_action", activation: { phase: "action" },
      printedClause: "Choose one <Once Per Game>: use The 666 Outpost ability again; gain 2 mana (and draw a Beast); if you win this round gain 2 VP; or move to an adjacent location. Beasts have no mana cost and pay their printed cost by discarding Beasts.",
      execution: { mode: "handler", handlerId: "core.chaos-beast-engine" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.chaos.skill.ascension": {
    ...overrides["master.chaos.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.chaos.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    abilities: [{ id: "chaos-army-draw", name: "Army of One", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.chaos-beast-engine" }],
    handlerId: "core.chaos-beast-engine", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "army-of-one-unlimited-666", kind: "passive", printedClause: "You may use The 666 Outpost ability any number of times per round.", execution: { mode: "handler", handlerId: "core.chaos-beast-engine" } },
      { id: "chaos-army-draw", kind: "phase_action", printedClause: "Action: Pay 4 mana. Draw a Beast.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.chaos-beast-engine" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Sesshouin Kiara (English original/Fandom): Secret Gardens are hidden state owned
// by opponents; Heaven's Hole materializes Realm skills and moves Kiara's personal
// Outpost/Action turns into Preparation. Realm cards do not exist in her skill zone
// before that transformation.
Object.assign(overrides, {
  "master.kiara.skill.s1": {
    ...overrides["master.kiara.skill.s1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started", "round.ending", "combat.resolved"],
    handlerId: "core.kiara-secret-gardens", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "secret-garden-deal", kind: "passive", printedClause: "At game start, deal the six Secret Gardens randomly face-down among the other players; each holder may inspect their own Gardens.", execution: { mode: "handler", handlerId: "core.kiara-secret-gardens" } },
      { id: "thesis-of-the-still-heart", kind: "passive", printedClause: "When you lose a fight, reveal a Secret Garden controlled by a winner of that fight.", execution: { mode: "handler", handlerId: "core.kiara-secret-gardens" } },
      { id: "heavens-hole-round-eight", kind: "passive", printedClause: "At the end of round 8 activate Heaven's Hole.", execution: { mode: "handler", handlerId: "core.kiara-secret-gardens" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.kiara.skill.s1a": {
    ...overrides["master.kiara.skill.s1a"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.kiara-secret-gardens", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "thesis-catalogue", kind: "passive", printedClause: "Thesis of the Still Heart is resolved by Sesshouin Kiara's identity passive.", execution: { mode: "handler", handlerId: "core.kiara-secret-gardens" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.kiara.skill.s2": {
    ...overrides["master.kiara.skill.s2"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.kiara-secret-gardens", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "secret-garden-catalogue", kind: "passive", printedClause: "The six Secret Gardens are hidden Kiara state; their reveal, suppression, and Thesis rewards are resolved by the dedicated handler.", execution: { mode: "handler", handlerId: "core.kiara-secret-gardens" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.kiara.skill.s3": {
    ...overrides["master.kiara.skill.s3"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.kiara-secret-gardens", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "heavens-hole", kind: "passive", printedClause: "Remove any number of your skills, then add All the World's Desire, Womb Realm and/or Diamond Realm until you have 3 counted skills. You take your Outpost and Action turns during Preparation.", execution: { mode: "handler", handlerId: "core.kiara-secret-gardens" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.kiara.skill.s4": {
    ...overrides["master.kiara.skill.s4"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["card.played", "phase.transitioned", "phase.embedded-transitioned"],
    handlerId: "core.kiara-secret-gardens", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "womb-realm-objective-replacement", kind: "passive", printedClause: "On Play, at the beginning of Action, and at the beginning of Combat, you may discard an objective and draw a replacement. This card gains total power equal to the total VP of objectives discarded by this effect this round; revealed Womb Secret Gardens suppress their matching windows.", execution: { mode: "handler", handlerId: "core.kiara-secret-gardens" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.kiara.skill.s5": {
    ...overrides["master.kiara.skill.s5"], initiallyOwned: false,
    activation: "residual", windows: [], requiresActiveCard: false, cardResidual: true,
    passiveEventTypes: ["card.played", "player.defeated", "round.started"],
    handlerId: "core.kiara-secret-gardens", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "diamond-realm-lock", kind: "residual", printedClause: "Permanent: Players cannot draw cards except through Fear of the Infinite, and may play fewer than two attack cards each turn.", conditions: [{ type: "source_active" }], ruleModifiers: [
        { id: "diamond-forbid-draw", operation: "forbid", rule: "card_draw", scope: { subject: "all_players" }, lifecycle: { duration: "while_active" } },
        { id: "diamond-zero-to-two-attacks", operation: "replace", rule: "standard_attack_card_count", scope: { subject: "all_players", minCount: 0, maxCount: 2, closeSourceWhenHandEmpty: false }, lifecycle: { duration: "while_active" } },
      ], execution: { mode: "automatic" } },
      { id: "diamond-ignore-defeated-status", kind: "residual", printedClause: "While Kiara is defeated she ignores all other effects of defeated status.", conditions: [{ type: "source_active" }], ruleModifiers: [{ id: "diamond-ignore-defeated-status", operation: "ignore", rule: "defeat", scope: { subject: "controller" }, lifecycle: { duration: "while_active" } }], execution: { mode: "automatic" } },
      { id: "diamond-defeat-power", kind: "passive", printedClause: "While Kiara is defeated this card gets -5 power.", execution: { mode: "handler", handlerId: "core.kiara-secret-gardens" } },
      { id: "fear-infinite", kind: "play_trigger", printedClause: "When Diamond Realm enters play reveal Fear of the Infinite; when Diamond Realm is played, every player except Kiara draws 3 cards even through Diamond Realm's draw prohibition.", execution: { mode: "handler", handlerId: "core.kiara-secret-gardens" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.kiara.skill.s6": {
    ...overrides["master.kiara.skill.s6"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["card.played", "player.deployed", "player.moved"],
    handlerId: "core.kiara-secret-gardens", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "all-worlds-desire", kind: "passive", printedClause: "When a player deploys to your location they remove a Secret Garden they control or are defeated. When a player moves to your location discard their hand; if fewer than 3 cards were discarded they are defeated. Revealed Desire Gardens apply their suppression and -6 power clauses.", execution: { mode: "handler", handlerId: "core.kiara-secret-gardens" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.kiara.skill.ascension": {
    ...overrides["master.kiara.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.kiara.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    handlerId: "core.kiara-secret-gardens", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "devils-bodhisattva", kind: "passive", printedClause: "On unlock, remove a Secret Garden and gain 4 VP. When resolving Heaven's Hole, William Shakespeare's skills do not count toward the number of skills you possess.", execution: { mode: "handler", handlerId: "core.kiara-secret-gardens" } }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// The Night of Wallachia (English original/Fandom): Fear is computed once from
// starting servant decks. TATARI is a temporary public objective whose five
// Escalations persist in authoritative package state rather than fake skill cards.
Object.assign(overrides, {
  "master.wallachia.skill.s1": {
    ...overrides["master.wallachia.skill.s1"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["game.started", "player.entered-location", "player.moved", "card.played", "attack.committed", "phase.transitioned", "phase.embedded-transitioned", "combat.resolved", "round.ending"],
    abilities: [{ id: "terror-incarnate-fear", name: "Terror Incarnate", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.wallachia-tatari" }],
    handlerId: "core.wallachia-tatari", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "terror-incarnate-tatari", kind: "passive", printedClause: "The first time each round you enter a battlefield, add a temporary TATARI objective there.", execution: { mode: "handler", handlerId: "core.wallachia-tatari" } },
      { id: "terror-incarnate-fear", kind: "phase_action", printedClause: "Action: Pay 3 mana and choose an opponent. While that opponent is in TATARI, attacks you played this round gain the type their Servant fears.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.wallachia-tatari" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.wallachia.skill.s2": {
    ...overrides["master.wallachia.skill.s2"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: [], handlerId: "core.wallachia-tatari", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "fear", kind: "passive", printedClause: "Each opposing Servant fears Strength, Agility or Magic: first minimize the number of that type in its starting deck, then the sum of their base power, then break ties Magic > Strength > Agility. You know every Servant's fear.", execution: { mode: "handler", handlerId: "core.wallachia-tatari" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.wallachia.skill.s3": {
    ...overrides["master.wallachia.skill.s3"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.wallachia.skill.s3"]?.tags ?? []), "cannot-entomb-objective"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.wallachia-tatari", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "tatari", kind: "passive", printedClause: "TATARI objective: VP X where X is half the number of Escalations rounded up. When Wallachia wins here, permanently add an Escalation. Players cannot leave unless they pay X mana.", execution: { mode: "handler", handlerId: "core.wallachia-tatari" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.wallachia.skill.s4": {
    ...overrides["master.wallachia.skill.s4"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.wallachia-tatari", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "madness", kind: "passive", printedClause: "Escalation — Madness: Every player's attacks gain +1 power for each opponent in this fight who fears one of that attack's types.", execution: { mode: "handler", handlerId: "core.wallachia-tatari" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.wallachia.skill.s5": {
    ...overrides["master.wallachia.skill.s5"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.wallachia-tatari", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "darkness", kind: "passive", printedClause: "Escalation — Darkness: A player cannot enter TATARI on their turn unless they pay X mana or discard a card of a type their Servant fears.", execution: { mode: "handler", handlerId: "core.wallachia-tatari" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.wallachia.skill.s6": {
    ...overrides["master.wallachia.skill.s6"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.wallachia-tatari", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "malice", kind: "passive", printedClause: "Escalation — Malice: A loser in this fight loses X VP if a winner controls an attack of a type that loser fears.", execution: { mode: "handler", handlerId: "core.wallachia-tatari" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.wallachia.skill.s7": {
    ...overrides["master.wallachia.skill.s7"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.wallachia-tatari", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "phobia", kind: "passive", printedClause: "Escalation — Phobia: For players in TATARI, attacks in hand or skill zone of a type their Servant fears cost +X mana.", execution: { mode: "handler", handlerId: "core.wallachia-tatari" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.wallachia.skill.s8": {
    ...overrides["master.wallachia.skill.s8"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.wallachia-tatari", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "drama", kind: "passive", printedClause: "Escalation — Drama: Increase X by 1. When Wallachia leaves this location, discard the temporary TATARI.", execution: { mode: "handler", handlerId: "core.wallachia-tatari" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.wallachia.skill.ascension": {
    ...overrides["master.wallachia.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.wallachia.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false, standardAppend: true,
    passiveEventTypes: ["card.played"],
    handlerId: "core.wallachia-tatari", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "malignant-replicator", kind: "play_trigger", printedClause: "Played in addition. Unique/On Play: remove every other Malignant Replicator in your Skill Zone from the game. On Play: add a copy of this card to your Skill Zone.", execution: { mode: "handler", handlerId: "core.wallachia-tatari" } }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// The Serpent of Akasha (English original/Fandom): reincarnation uses only VP
// earned during the current incarnation, applies the current Vessel's counting
// rule, and removes every temporary Overload when reincarnation resolves.
Object.assign(overrides, {
  "master.akasha.skill.s1a": {
    ...overrides["master.akasha.skill.s1a"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started", "player.victory-points.changed", "player.defeated", "combat.resolved"],
    handlerId: "core.akasha-reincarnation", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "infinite-reincarnator", kind: "passive", printedClause: "Your initial Vessel is Michael Roa. When you lose a fight by 5 or more power, or are defeated, reincarnate at the start of the next round.", execution: { mode: "handler", handlerId: "core.akasha-reincarnation" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.akasha.skill.s2": {
    ...overrides["master.akasha.skill.s2"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["round.started"],
    handlerId: "core.akasha-reincarnation", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "reincarnation", kind: "passive", printedClause: "At the start of the next round, reincarnate based on VP earned during the current incarnation; then remove all temporary Overloads. If you reincarnate into the same Vessel, lose 3 VP.", execution: { mode: "handler", handlerId: "core.akasha-reincarnation" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.akasha.skill.s3": {
    ...overrides["master.akasha.skill.s3"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.akasha-reincarnation", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "michael-roa", kind: "passive", printedClause: "Vessel 0-5. Trick: VP earned as Michael Roa counts twice only for Reincarnation. Clerical Authority: gain an additional 1 VP from Recon.", execution: { mode: "handler", handlerId: "core.akasha-reincarnation" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.akasha.skill.s4": {
    ...overrides["master.akasha.skill.s4"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: [],
    handlerId: "core.akasha-reincarnation", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "elesia", kind: "passive", printedClause: "Vessel 6-10. Unstable Possession: VP earned as Elesia counts half, rounded up, only for Reincarnation. High Power Circuits: while you control Overload, your Skills get +1 power and cost 1 less mana.", execution: { mode: "handler", handlerId: "core.akasha-reincarnation" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.akasha.skill.s5": {
    ...overrides["master.akasha.skill.s5"],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: [],
    abilities: [{ id: "square", name: "SQUARE", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.akasha-reincarnation" }],
    handlerId: "core.akasha-reincarnation", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "snap", kind: "passive", printedClause: "Vessel 11+. SNAP: You may play Overload while below 8 mana. If you do, it gains +3 power and does not deactivate.", execution: { mode: "handler", handlerId: "core.akasha-reincarnation" } },
      { id: "square", kind: "phase_action", printedClause: "Action: Pay mana equal to the total mana cost of your active Overloads; double their power.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.akasha-reincarnation" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.akasha.skill.s6": {
    ...overrides["master.akasha.skill.s6"], initiallyOwned: false,
    activation: "play", windows: [], requiresActiveCard: false, requiresEightMana: true, standardAppend: true,
    passiveEventTypes: ["player.deployed", "card.played"],
    handlerId: "core.akasha-reincarnation", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "overload-additional", kind: "play_trigger", printedClause: "Additional.", execution: { mode: "handler", handlerId: "core.akasha-reincarnation" } },
      { id: "boiling", kind: "passive", printedClause: "When you deploy to a Field, you may add all Overloads at that location to your attack; if you do, they gain +2 power.", execution: { mode: "handler", handlerId: "core.akasha-reincarnation" } },
      { id: "set", kind: "play_trigger", printedClause: "On Play: deactivate this card. If you do, place a temporary copy of it at your location.", execution: { mode: "handler", handlerId: "core.akasha-reincarnation" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.akasha.skill.ascension": {
    ...overrides["master.akasha.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.akasha.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked", "round.started"],
    handlerId: "core.akasha-reincarnation", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "ultimate-form", kind: "passive", printedClause: "After you have incarnated into every Vessel, stop reincarnating and inhabit all Vessels simultaneously. At the start of each Climax round, place a temporary Overload in a Field of your choice.", execution: { mode: "handler", handlerId: "core.akasha-reincarnation" } }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Sion Sokaris (English original/Fandom): Chaldea skills physically cover the
// Servant's three skills, collect EXP, and are removed when trained. EX Class
// cards are outside-game catalogue cards until granted by training/Ascension.
for (let index = 5; index <= 17; index += 1) {
  const skillId = `master.sion.skill.s${index}`;
  overrides[skillId] = { ...overrides[skillId], initiallyOwned: false };
}
Object.assign(overrides, {
  "master.sion.skill.s1": {
    ...overrides["master.sion.skill.s1"],
    activation: "phase", windows: ["preparation"], requiresActiveCard: false,
    passiveEventTypes: ["game.started"],
    abilities: [{ id: "advanced-training", name: "Advanced Training", activation: "phase", windows: ["preparation"], requiresActiveCard: false, handlerId: "core.sion-chaldea-training" }],
    handlerId: "core.sion-chaldea-training", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "advanced-training-cover", kind: "passive", printedClause: "At game start, cover your Servant's three skills with Chaldea Library, Cafeteria and Gym. Covered skills cannot be used and lose all text.", execution: { mode: "handler", handlerId: "core.sion-chaldea-training" } },
      { id: "advanced-training", kind: "phase_action", printedClause: "Preparation: Remove any number of your Chaldea skills from the game and activate their Train effects.", activation: { phase: "preparation" }, execution: { mode: "handler", handlerId: "core.sion-chaldea-training" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.sion.skill.s2": {
    ...overrides["master.sion.skill.s2"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["servant.true-name-revealed"],
    handlerId: "core.sion-chaldea-training", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "chaldea-library", kind: "passive", printedClause: "The first time an opponent at your location reveals their Servant name, gain 1 VP and put 1 EXP on this card. Train: for every 2 EXP permanently reduce the trained skill's mana cost by 1.", execution: { mode: "handler", handlerId: "core.sion-chaldea-training" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.sion.skill.s3": {
    ...overrides["master.sion.skill.s3"],
    activation: "phase", windows: ["combat"], requiresActiveCard: false,
    abilities: [{ id: "cafeteria-combat", name: "Chaldea Cafeteria", activation: "phase", windows: ["combat"], requiresActiveCard: false, handlerId: "core.sion-chaldea-training" }],
    handlerId: "core.sion-chaldea-training", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "cafeteria-combat", kind: "phase_action", printedClause: "Combat: All players at your location gain 1 mana. If at least one opponent gained mana, put 1 EXP on this card.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.sion-chaldea-training" } },
      { id: "cafeteria-train", kind: "passive", printedClause: "Train: If this has 2 or more EXP, you may replace the trained skill with a face-down EX Class Card matching your Servant's class.", execution: { mode: "handler", handlerId: "core.sion-chaldea-training" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.sion.skill.s4": {
    ...overrides["master.sion.skill.s4"],
    activation: "passive", windows: [], requiresActiveCard: false,
    basicCardPowerBonus: 1,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.sion-chaldea-training", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "chaldea-gym", kind: "passive", printedClause: "Your basic attacks get +1 power. When you participate in a contested fight, put 1 EXP on this card. Train: for every 2 EXP choose either permanently +1 trained skill power or add a base-power-5 Basic Strength/Agility card to your hand.", execution: { mode: "handler", handlerId: "core.sion-chaldea-training" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.sion.skill.s14": {
    ...overrides["master.sion.skill.s14"], initiallyOwned: false,
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    abilities: [{ id: "ruler-bind", name: "EX Ruler", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.sion-chaldea-training" }],
    handlerId: "core.sion-chaldea-training", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "ruler-bind", kind: "phase_action", printedClause: "Outpost: Choose another player. They gain your Ruler Seal until the end of the round. You cannot choose the same player again for 3 rounds.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.sion-chaldea-training" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.sion.skill.s15": {
    ...overrides["master.sion.skill.s15"], initiallyOwned: false,
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    abilities: [{ id: "reboot", name: "Reboot", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.sion-chaldea-training" }],
    handlerId: "core.sion-chaldea-training", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "reboot", kind: "phase_action", printedClause: "Combat: In turn order, all players in the Moon Cell redeploy. Then remove the Moon Cell and discard its objectives.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.sion-chaldea-training" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.sion.skill.s17": {
    ...overrides["master.sion.skill.s17"], initiallyOwned: false,
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    commandSealPlayCost: 1,
    abilities: [{ id: "black-barrel", name: "Black Barrel", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.sion-chaldea-training" }],
    handlerId: "core.sion-chaldea-training", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "black-barrel", kind: "phase_action", printedClause: "Pay 1 Command Seal to play. Combat: deactivate all Luck in this fight. Opponents draw 2, then everyone reveals their hand and face-down attacks; anyone revealing Luck is defeated.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.sion-chaldea-training" } }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Tohno SHIKI (English original/Fandom): Control tracks only non-effect VP,
// the first 13-VP threshold chooses Serpent/Demon, and Fusion swaps real cards.
Object.assign(overrides, {
  "master.shiki-tohno.skill.s1a": {
    ...overrides["master.shiki-tohno.skill.s1a"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["player.victory-points.changed"],
    handlerId: "core.tohno-shiki-possession", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "possessed", kind: "passive", printedClause: "When you gain VP except from effects, gain that much Control. The first time you reach 13 VP, gain The Demon if you have 13+ Control; otherwise gain The Serpent.", execution: { mode: "handler", handlerId: "core.tohno-shiki-possession" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shiki-tohno.skill.s2": {
    ...overrides["master.shiki-tohno.skill.s2"], initiallyOwned: false,
    activation: "phase", windows: ["combat"], requiresActiveCard: true,
    standardAppend: true, requiresEightMana: true, victoryPointPlayCost: 1,
    abilities: [{ id: "fusion", name: "Fusion", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.tohno-shiki-possession" }],
    handlerId: "core.tohno-shiki-possession", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "sanguine-daggers", kind: "play_trigger", printedClause: "Additional. Pay 1 VP to play this card.", execution: { mode: "automatic" } },
      { id: "fusion", kind: "phase_action", printedClause: "Combat: Reveal up to 3 random cards from an opponent's discard in this fight. You may swap a revealed basic card with a basic card in your hand or in play.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.tohno-shiki-possession" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shiki-tohno.skill.s3": {
    ...overrides["master.shiki-tohno.skill.s3"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.tohno-shiki-possession", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "serpent", kind: "passive", printedClause: "You cannot gain Control or use Fusion. Eroding Detachment gains Magic and may be played below 8 mana.", execution: { mode: "handler", handlerId: "core.tohno-shiki-possession" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shiki-tohno.skill.s4": {
    ...overrides["master.shiki-tohno.skill.s4"], initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.tohno-shiki-possession", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "demon", kind: "passive", printedClause: "You no longer pay VP to play Eroding Detachment. After you Fusion with an opponent who has more VP than you, steal 2 VP from them.", execution: { mode: "handler", handlerId: "core.tohno-shiki-possession" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.shiki-tohno.skill.ascension": {
    ...overrides["master.shiki-tohno.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.shiki-tohno.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked", "round.started"],
    handlerId: "core.tohno-shiki-possession", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "sobering-lucidity", kind: "passive", printedClause: "At the start of the next round, gain VP equal to your Control. Then for the rest of the game your total power is 0 and cannot be increased.", execution: { mode: "handler", handlerId: "core.tohno-shiki-possession" } }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Artoria Avalon: English original + Fandom ruling. Around Caliburn's play
// round is the first of its two active rounds; Pilgrim cards are physical deck
// cards linked through base-card-rules rather than duplicated skill-zone cards.
Object.assign(overrides, {
  "servant.artoriac.skill.sc-artoriac-1": {
    ...overrides["servant.artoriac.skill.sc-artoriac-1"], activation: "phase", windows: ["combat"], requiresActiveCard: true,
    passiveEventTypes: ["card.played"], cardResidual: true,
    abilities: [{ id: "around-return", name: "Around Caliburn", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.artoria-avalon" }],
    handlerId: "core.artoria-avalon", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "around-residual", kind: "play_trigger", printedClause: "This attack remains in play for two rounds. Your other Special attacks gain +2 power.", execution: { mode: "handler", handlerId: "core.artoria-avalon" } },
      { id: "around-return", kind: "phase_action", printedClause: "Combat: Return one non-Skill card you played this round, or one face-down attack, to your hand.", activation: { phase: "combat" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.artoria-avalon" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.artoriac.skill.sc-artoriac-3": {
    ...overrides["servant.artoriac.skill.sc-artoriac-3"], activation: "passive", windows: [], requiresActiveCard: false, cardResidual: true,
    passiveEventTypes: ["card.played", "card.zone.changed", "card.discarded", "round.started", "combat.resolved"],
    handlerId: "core.artoria-avalon", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "round-of-avalon", kind: "passive", printedClause: "Permanent: reveal your discard. X is 5 per Luck in it, max 15. Reveal true name while X>0. After winning a fight, shuffle your discard into your deck; this cannot be prevented.", execution: { mode: "handler", handlerId: "core.artoria-avalon" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.artoriac.skill.sc-artoriac-4": {
    ...overrides["servant.artoriac.skill.sc-artoriac-4"], activation: "phase", windows: ["action"], requiresActiveCard: true,
    passiveEventTypes: ["combat.resolved"],
    abilities: [{ id: "pilgrim-call-move", name: "Pilgrim's Call", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.artoria-avalon" }],
    handlerId: "core.artoria-avalon", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "pilgrim-transform", kind: "passive", printedClause: "Unique/Passive: After you win a fight, you may remove this card from your hand to shuffle a Luck into your deck.", execution: { mode: "handler", handlerId: "core.artoria-avalon" } },
      { id: "pilgrim-call-move", kind: "phase_action", printedClause: "Action: If at Recon gain 2 VP, then move up to two locations along arrows.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.artoria-avalon" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.artoriac.skill.sc-artoriac-5": {
    ...overrides["servant.artoriac.skill.sc-artoriac-5"], activation: "phase", windows: ["action"], requiresActiveCard: true,
    passiveEventTypes: ["combat.resolved"],
    abilities: [{ id: "pilgrim-respite-gain", name: "Pilgrim's Respite", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.artoria-avalon" }],
    handlerId: "core.artoria-avalon", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "pilgrim-transform", kind: "passive", printedClause: "Unique/Passive: After you win a fight, you may remove this card from your hand to shuffle a Luck into your deck.", execution: { mode: "handler", handlerId: "core.artoria-avalon" } },
      { id: "pilgrim-respite-gain", kind: "phase_action", printedClause: "Action: Gain 2 mana. If you cannot gain mana, gain 2 VP instead.", activation: { phase: "action" }, conditions: [{ type: "source_active" }], execution: { mode: "handler", handlerId: "core.artoria-avalon" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.artoriac.skill.sc-artoriac-6": {
    ...overrides["servant.artoriac.skill.sc-artoriac-6"], activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"], handlerId: "core.artoria-avalon", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "pilgrim-transform", kind: "passive", printedClause: "Unique/Passive: After you win a fight, you may remove this card from your hand to shuffle a Luck into your deck.", execution: { mode: "handler", handlerId: "core.artoria-avalon" } },
      { id: "pilgrim-destiny-win", kind: "passive", printedClause: "Combat: If you win and are not the only winner, gain 2 VP.", execution: { mode: "handler", handlerId: "core.artoria-avalon" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Tohno Akiha: English original on the Fate/Domination Wiki is authoritative.
// In particular Crimson Red Vermilion fixes Bloodlust at 1 (the older local
// Chinese migration said 15). Caging Hair uses the shared explicit mana-
// contribution transaction boundary; no display text is parsed at runtime.
Object.assign(overrides, {
  "master.akiha.skill.s1": {
    ...overrides["master.akiha.skill.s1"], activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started"], handlerId: "core.akiha-bloodlust", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "caging-hair", kind: "passive", printedClause: "You may spend 1 mana from each opponent with 6+ mana on your battlefield per round.", execution: { mode: "handler", handlerId: "core.akiha-bloodlust" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.akiha.skill.s1a": {
    ...overrides["master.akiha.skill.s1a"], activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started", "player.mana.spent", "combat.ending"], handlerId: "core.akiha-bloodlust", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "demonic-heritage", kind: "passive", printedClause: "When you spend mana gain that amount of Bloodlust. After combat, randomly lose 1-3 Bloodlust, doubled if you are in the Workshop.", execution: { mode: "handler", handlerId: "core.akiha-bloodlust" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.akiha.skill.s2": {
    ...overrides["master.akiha.skill.s2"], activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started"], handlerId: "core.akiha-bloodlust", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{ id: "humanity-inversion", kind: "passive", printedClause: "Crimson Red Vermilion: Your Bloodlust is always 1. Lose all Command Seals. Halve VP you gain, rounding down, and double mana you gain.", execution: { mode: "handler", handlerId: "core.akiha-bloodlust" } }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.akiha.skill.s3": {
    ...overrides["master.akiha.skill.s3"], activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["game.started", "card.played", "round.ending"],
    abilities: [{ id: "bloodlust-action", name: "Bloodlust", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.akiha-bloodlust" }],
    handlerId: "core.akiha-bloodlust", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "bloodlust-action", kind: "phase_action", printedClause: "Below 5 Bloodlust - Action: gain 1 mana, +2 total power and 3 Bloodlust; you cannot lose Bloodlust this round.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.akiha-bloodlust" } },
      { id: "bloodlust-five", kind: "passive", printedClause: "At 5+ Bloodlust, your skills gain +1 power when they enter play.", execution: { mode: "handler", handlerId: "core.akiha-bloodlust" } },
      { id: "bloodlust-ten", kind: "passive", printedClause: "At 10+ Bloodlust, you may play skills while below the normal 8-mana threshold.", execution: { mode: "handler", handlerId: "core.akiha-bloodlust" } },
      { id: "bloodlust-fifteen", kind: "passive", printedClause: "At 15+ Bloodlust, transform Akiha at the end of the round.", execution: { mode: "handler", handlerId: "core.akiha-bloodlust" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.akiha.skill.ascension": {
    ...overrides["master.akiha.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.akiha.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["card.played"], handlerId: "core.akiha-bloodlust", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "plundered-life", kind: "play_trigger", printedClause: "While you are Akiha, players whose mana you stole to play this have -3 total power.", execution: { mode: "handler", handlerId: "core.akiha-bloodlust" } },
      { id: "crimson-hammer", kind: "passive", printedClause: "If you are Vermilion, this card costs 3 more mana and has +4 power.", execution: { mode: "handler", handlerId: "core.akiha-bloodlust" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.nitocris.skill.sc-nitocris-1": {
    ...overrides["servant.nitocris.skill.sc-nitocris-1"],
    activation: "phase", windows: ["action", "combat"], requiresActiveCard: true, requiresEightMana: false,
    abilities: [
      { id: "underworld-tribute", name: "Underworld Tribute", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.nitocris-entomb" },
      { id: "underworld-tribute-entomb", name: "Underworld Tribute - Entomb", activation: "phase", windows: ["combat"], steps: ["post-power-response"], requiresActiveCard: true, handlerId: "core.nitocris-entomb" },
    ],
    handlerId: "core.nitocris-entomb", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "underworld-tribute", kind: "phase_action", printedClause: "Action: Triple your terrain advantage.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.nitocris-entomb" } },
      { id: "underworld-tribute-entomb", kind: "phase_action", printedClause: "If you win, choose an objective in that fight. Instead of gaining its VP, gain that much mana, then entomb it under this card.", activation: { phase: "combat", step: "post-power-response" }, execution: { mode: "handler", handlerId: "core.nitocris-entomb" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.nitocris.skill.sc-nitocris-2": {
    ...overrides["servant.nitocris.skill.sc-nitocris-2"],
    activation: "phase", windows: ["action", "combat"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["card.played"],
    abilities: [
      { id: "nether-mirror-release", name: "Nether Mirror", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.nitocris-entomb" },
      { id: "nether-mirror-defeat", name: "Nether Mirror", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.nitocris-entomb" },
    ],
    handlerId: "core.nitocris-entomb", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "nether-mirror-block", kind: "play_trigger", printedClause: "You cannot entomb objectives this round.", execution: { mode: "handler", handlerId: "core.nitocris-entomb" } },
      { id: "nether-mirror-release", kind: "phase_action", printedClause: "Action: Add any number of entombed objectives to your battlefield. Gain total power equal to their VP.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.nitocris-entomb" } },
      { id: "nether-mirror-defeat", kind: "phase_action", printedClause: "Combat: Defeat all opponents in the fight.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.nitocris-entomb" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.nitocris.skill.sc-nitocris-3": {
    ...overrides["servant.nitocris.skill.sc-nitocris-3"],
    activation: "phase", windows: ["action", "combat"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    abilities: [
      { id: "holy-service", name: "Holy Service", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.nitocris-entomb" },
      { id: "child-of-horus-ignore-defeat", name: "Child of Horus", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.nitocris-entomb" },
    ],
    handlerId: "core.nitocris-entomb", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "holy-service", kind: "phase_action", printedClause: "Action: Gain 1 VP per entombed objective.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.nitocris-entomb" } },
      { id: "child-of-horus-ignore-defeat", kind: "phase_action", printedClause: "Combat: Ignore defeat status.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.nitocris-entomb" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  // Achilles (English original/Fandom): Andreias Amarantos resolves at combat
  // start while hidden and reveals after a lost fight. Akhilleus Kosmos chooses
  // one of three Action effects. Diatrekhon Aster Lonkhe isolates a two-player
  // battlefield, removing terrain and third-party card/ability influence.
  "servant.achilles.skill.sc-achilles-1": {
    ...overrides["servant.achilles.skill.sc-achilles-1"],
    activation: "passive", windows: ["combat"], requiresActiveCard: false,
    passiveEventTypes: ["phase.transitioned", "combat.resolved"],
    handlerId: "core.achilles-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "achilles-heel", kind: "passive", printedClause: "Passive: When you lose a fight, Reveal Servant Name.", execution: { mode: "handler", handlerId: "core.achilles-package" } },
      { id: "invincible", kind: "passive", printedClause: "Passive/Combat: If your name is hidden, opponents in your fight discard a card at random. Set the power of those who do not discard a Luck or Agility card to 0.", execution: { mode: "handler", handlerId: "core.achilles-package" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.achilles.skill.sc-achilles-2": {
    ...overrides["servant.achilles.skill.sc-achilles-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["round.ended"],
    abilities: [
      { id: "kosmos-random-discard", name: "World of Azure Skies - Discard", activation: "phase", windows: ["action"], requiresActiveCard: true, uniqueGroup: "achilles-kosmos-choice", handlerId: "core.achilles-package" },
      { id: "kosmos-block-skills", name: "World of Azure Skies - Skill Lock", activation: "phase", windows: ["action"], requiresActiveCard: true, uniqueGroup: "achilles-kosmos-choice", handlerId: "core.achilles-package" },
      { id: "kosmos-hide-name", name: "World of Azure Skies - Hide Name", activation: "phase", windows: ["action"], requiresActiveCard: true, abilityCost: 3, uniqueGroup: "achilles-kosmos-choice", handlerId: "core.achilles-package" },
    ],
    handlerId: "core.achilles-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "kosmos-random-discard", kind: "phase_action", printedClause: "Action - choose one: Opponents on your battlefield discard a card at random.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.achilles-package" } },
      { id: "kosmos-block-skills", kind: "phase_action", printedClause: "Action - choose one: Opponents on your battlefield cannot use skills.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.achilles-package" } },
      { id: "kosmos-hide-name", kind: "phase_action", printedClause: "Action - choose one: Pay 3 mana; hide your Servant's name until the end of the round.", activation: { phase: "action" }, cost: { resource: "mana", amount: 3 }, execution: { mode: "handler", handlerId: "core.achilles-package" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.achilles.skill.sc-achilles-3": {
    ...overrides["servant.achilles.skill.sc-achilles-3"],
    activation: "phase", windows: ["action"], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    abilities: [{ id: "hero-killer", name: "Hero Killer", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.achilles-package" }],
    handlerId: "core.achilles-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "hero-killer", kind: "phase_action",
      printedClause: "Action: While exactly 1 opponent is on this battlefield, no one can enter or leave it. You and that opponent ignore terrain advantage and the power/effects of cards not belonging to your respective Servants (or that NPC).",
      activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.achilles-package" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  // BB: Moon Cell movement/location merge is shared through rules-core/moon-cell; Moon Cancer is shared with Bikuni.
  "servant.bb.skill.sc-bb-1": {
    ...overrides["servant.bb.skill.sc-bb-1"],
    activation: "phase", windows: ["action"], requiresActiveCard: false, requiresEightMana: false,
    abilities: [{ id: "privilege-access", name: "Privilege Access", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.bb-moon-cell" }],
    handlerId: "core.bb-moon-cell", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "privilege-access", kind: "phase_action", printedClause: "Action: pay 3 mana. Move to Moon Cell, or if you are unengaged in Moon Cell move to a battlefield while retaining your terrain advantage.",
      activation: { phase: "action" }, cost: { resource: "mana", amount: 3 }, execution: { mode: "handler", handlerId: "core.bb-moon-cell" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.bb.skill.sc-bb-2": {
    ...overrides["servant.bb.skill.sc-bb-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    abilities: [{ id: "bb-slot-machine", name: "B.B. Slot Machine", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.bb-moon-cell" }],
    handlerId: "core.bb-moon-cell", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "bb-slot-machine", kind: "phase_action", printedClause: "Action: up to three players discard a random card. Strength grants +2 power; Agility allows up to one forward move; Magic grants 1 mana; Special chooses one of those rewards. If the same reward is gained three times, gain 3 VP.",
      activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.bb-moon-cell" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.bb.skill.sc-bb-3": {
    ...overrides["servant.bb.skill.sc-bb-3"],
    activation: "play", windows: [], requiresActiveCard: true, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["card.played", "round.ending"],
    handlerId: "core.bb-moon-cell", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "ccc-location-merge", kind: "play_trigger", printedClause: "True Name Release: merge your current location with Moon Cell until end of round.", execution: { mode: "handler", handlerId: "core.bb-moon-cell" } },
      { id: "ccc-moon-cell-power", kind: "passive", printedClause: "If you are only in Moon Cell, this card has +5 power.", execution: { mode: "handler", handlerId: "core.bb-moon-cell" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.bb.skill.sc-bb-4": {
    ...overrides["servant.bb.skill.sc-bb-4"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    passiveEventTypes: ["combat.ending"],
    abilities: [
      { id: "moon-cancer-restrict", name: "Moon Cancer", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.moon-cancer" },
      { id: "moon-cancer-swap", name: "Moon Cancer - Swap", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.moon-cancer" },
    ],
    handlerId: "core.moon-cancer", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "moon-cancer-restrict", kind: "phase_action", printedClause: "Action: discard this card; Moon Cell event effects affect only your location. After Combat, discard Moon Cell events.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.moon-cancer" } },
      { id: "moon-cancer-swap", kind: "phase_action", printedClause: "Action: exchange one event at your location with one event in Moon Cell.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.moon-cancer" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  // Bikuni (English original card package): Moon Cell event movement/reward handling is shared through rules-core/moon-cell.
  "servant.bikuni.skill.sc-bikuni-1": {
    ...overrides["servant.bikuni.skill.sc-bikuni-1"],
    activation: "phase", windows: ["action", "combat"], requiresActiveCard: true, revealsTrueNameOnSkillUse: true,
    abilities: [
      { id: "otherworld-creation", name: "Otherworld Creation", activation: "phase", windows: ["action"], requiresActiveCard: true, revealsTrueNameOnSkillUse: true, handlerId: "core.bikuni-moon-cell" },
      { id: "foam-of-heaven", name: "Foam of Heaven", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.bikuni-moon-cell" },
    ],
    handlerId: "core.bikuni-moon-cell", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "otherworld-creation", kind: "phase_action", printedClause: "True Name Release / Action: each opponent in Moon Cell gains 1 VP; gain 1 mana for each opponent that gains VP.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.bikuni-moon-cell" } },
      { id: "foam-of-heaven", kind: "phase_action", printedClause: "Combat: this card gets +2 power for each event card in Moon Cell.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.bikuni-moon-cell" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.bikuni.skill.sc-bikuni-2": {
    ...overrides["servant.bikuni.skill.sc-bikuni-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    passiveEventTypes: ["phase.transitioned"],
    abilities: [{ id: "worldly-phantom-city", name: "Worldly Phantom City", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.bikuni-moon-cell" }],
    handlerId: "core.bikuni-moon-cell", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "clam-palace-combat-start", kind: "passive", printedClause: "At each Combat start, if your fight has no event, move one Moon Cell event to your battlefield; Moon Cell events are worth 1 VP while there.", execution: { mode: "handler", handlerId: "core.bikuni-moon-cell" } },
      { id: "worldly-phantom-city", kind: "phase_action", printedClause: "Action: move one event from your battlefield to Moon Cell.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.bikuni-moon-cell" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.bikuni.skill.sc-bikuni-3": {
    ...overrides["servant.bikuni.skill.sc-bikuni-3"],
    activation: "residual", windows: ["action"], requiresActiveCard: true,
    passiveEventTypes: ["round.ending"],
    abilities: [{ id: "dreamlike-bubble", name: "Dreamlike Bubble", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.bikuni-moon-cell" }],
    handlerId: "core.bikuni-moon-cell", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "longevity-upkeep", kind: "residual", printedClause: "End of round: discard a Moon Cell event or close this card.", execution: { mode: "handler", handlerId: "core.bikuni-moon-cell" } },
      { id: "dreamlike-bubble", kind: "phase_action", printedClause: "Action: discard a Luck and an event at a location; draw two replacement events there. They are worth 1 VP this round and cannot be increased.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.bikuni-moon-cell" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.bikuni.skill.sc-bikuni-4": {
    ...overrides["servant.bikuni.skill.sc-bikuni-4"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    passiveEventTypes: ["combat.ending"],
    abilities: [
      { id: "moon-cancer-restrict", name: "Moon Cancer", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.moon-cancer" },
      { id: "moon-cancer-swap", name: "Moon Cancer - Swap", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.moon-cancer" },
    ],
    handlerId: "core.moon-cancer", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "moon-cancer-restrict", kind: "phase_action", printedClause: "Action: discard this card; Moon Cell event effects affect only your location. After Combat, discard Moon Cell events.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.moon-cancer" } },
      { id: "moon-cancer-swap", kind: "phase_action", printedClause: "Action: exchange one event at your location with one event in Moon Cell.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.moon-cancer" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.maiya.skill.s1": {
    ...overrides["master.maiya.skill.s1"],
    activation: "phase", windows: ["outpost"], abilityCost: 2, requiresActiveCard: false,
    passiveEventTypes: ["round.ending"],
    abilities: [{ id: "military-support", name: "军旅", activation: "phase", windows: ["outpost"], abilityCost: 2, requiresActiveCard: false, handlerId: "core.maiya-support-fire" }],
    handlerId: "core.maiya-support-fire", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "military-support", kind: "phase_action", printedClause: "Outpost: If you are not on a battlefield, pay 2 mana and add Support Fire to another player's attack. Return it to your Skill Zone at the end of the round. If you do, you cannot be a combat winner this round.", activation: { phase: "outpost" }, cost: { resource: "mana", amount: 2 }, execution: { mode: "handler", handlerId: "core.maiya-support-fire" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.maiya.skill.s2": {
    ...overrides["master.maiya.skill.s2"],
    activation: "phase", windows: ["action"], requiresActiveCard: true,
    materializedCardType: "attack", cost: 2, requirement: 2, basePower: 0, typeLabel: "迅捷", attributes: ["迅捷"], standardAppend: true,
    abilities: [{ id: "suppressing-fire", name: "压制", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.maiya-support-fire" }],
    handlerId: "core.maiya-support-fire", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "support-fire-face", kind: "passive", printedClause: "Agility; cost 2, requirement 2, power 0. This card must be played in addition.", execution: { mode: "automatic" } },
      { id: "suppressing-fire", kind: "phase_action", printedClause: "Action: If you are not Maiya, pay her 2 VP. Gain +1 base terrain advantage, then double your terrain advantage.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.maiya-support-fire" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.maiya.skill.ascension": {
    ...overrides["master.maiya.skill.ascension"], initiallyOwned: false,
    tags: [...new Set([...(overrides["master.maiya.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"], handlerId: "core.maiya-support-fire", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "dessert-fanatic", kind: "passive", printedClause: "When unlocked, remove every Magic card in your hand, deck and discard from the game. Gain 2 mana for each card removed this way, then add a Shooting card from outside the game to your Skill Zone.", execution: { mode: "handler", handlerId: "core.maiya-support-fire" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

delete overrides["servant.hokusai.skill.sc-hokusai-1"].limit;
delete overrides["servant.stheno.skill.sc-stheno-3"].limit;

// Dedicated runtime implementations added after the generated/structured
// compatibility batches above. These authoritative overrides intentionally
// apply last so migration metadata cannot downgrade them back to PARTIAL.
overrides["servant.koyanskaya.skill.sc-koyanskaya-2"] = {
  ...overrides["servant.koyanskaya.skill.sc-koyanskaya-2"],
  activation: "phase",
  windows: ["outpost"],
  passiveEventTypes: ["player.entered-location", "combat.ending"],
  requiresActiveCard: false,
  handlerId: "core.koyanskaya-nff",
  supportLevel: "FULL",
};
overrides["servant.koyanskaya.skill.sc-koyanskaya-3"] = {
  ...overrides["servant.koyanskaya.skill.sc-koyanskaya-3"],
  activation: "phase",
  windows: ["combat"],
  passiveEventTypes: ["combat.resolved", "combat.ending"],
  requiresActiveCard: true,
  revealsTrueNameOnPlay: true,
  hasReversalEffect: true,
  abilities: [
    { id: "gospel-close-or-reward", name: "Gospel of Slaughter", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.koyanskaya-package" },
    { id: "gospel-seize-cargo", name: "Gospel of Slaughter - Reverse", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.koyanskaya-package" },
  ],
  handlerId: "core.koyanskaya-package",
  supportLevel: "FULL",
  rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
    { id: "gospel-close-or-reward", kind: "phase_action", printedClause: "Combat: opponents may close cards they acquired from Cargo. Gain 2 VP for each winner who did not do so.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.koyanskaya-package" } },
    { id: "gospel-seize-cargo", kind: "phase_action", printedClause: "Reverse / Combat: take control of any number of opponents' attacks acquired from Cargo and give them their reverse effects.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.koyanskaya-package" } },
  ], ambiguities: [], unmodeledClauses: [] },
};
overrides["servant.koyanskaya.skill.sc-koyanskaya-4"] = {
  ...overrides["servant.koyanskaya.skill.sc-koyanskaya-4"],
  initiallyOwned: false,
  activation: "passive",
  hasReversalEffect: true,
  handlerId: "core.rule-marker",
  supportLevel: "FULL",
};
overrides["servant.koyanskaya.skill.sc-koyanskaya-5"] = {
  ...overrides["servant.koyanskaya.skill.sc-koyanskaya-5"],
  initiallyOwned: false,
  activation: "phase",
  windows: ["combat"],
  requiresActiveCard: true,
  hasReversalEffect: true,
  abilities: [
    { id: "nf56-reverse-move", name: "NF-56 Mini Miko - Reverse", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.koyanskaya-package" },
  ],
  handlerId: "core.koyanskaya-package",
  supportLevel: "FULL",
  rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
    { id: "nf56-cargo-penalty", kind: "passive", printedClause: "When you acquire this card without playing it, lose 3 mana.", execution: { mode: "handler", handlerId: "core.koyanskaya-nff" } },
    { id: "nf56-reverse-move", kind: "phase_action", printedClause: "Reverse / Combat: ignoring Reality Marble restrictions, move to any location.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.koyanskaya-package" } },
  ], ambiguities: [], unmodeledClauses: [] },
};
overrides["servant.koyanskaya.skill.sc-koyanskaya-6"] = {
  ...overrides["servant.koyanskaya.skill.sc-koyanskaya-6"],
  initiallyOwned: false,
  activation: "phase",
  windows: ["combat"],
  steps: ["post-power-response"],
  requiresActiveCard: true,
  hasReversalEffect: true,
  abilities: [
    { id: "nf00-strict-second-defeat", name: "NF-00 Cyanide Cake - Reverse", activation: "phase", windows: ["combat"], steps: ["post-power-response"], requiresActiveCard: true, handlerId: "core.koyanskaya-package" },
  ],
  handlerId: "core.koyanskaya-package",
  supportLevel: "FULL",
  rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
    { id: "nf00-cargo-defeat", kind: "passive", printedClause: "When you gain this from a [Crate], you are [defeated].", execution: { mode: "handler", handlerId: "core.koyanskaya-nff" } },
    { id: "nf00-strict-second-defeat", kind: "phase_action", printedClause: "Alter/Combat: After power calculation [defeat] all opponents with the highest power in the fight, if you have less power than them, no one else in the fight has more power than you and there are 3 or more participants in the fight.", activation: { phase: "combat", step: "post-power-response" }, execution: { mode: "handler", handlerId: "core.koyanskaya-package" } },
  ], ambiguities: [], unmodeledClauses: [] },
};

// Himiko: the card images in the English-source CHM package confirm the complete
// Oracle/Kidou/Mirror text. Runtime details are implemented by one dedicated
// package handler plus generic movement, embedded-Action, terrain and reuse rules.
overrides["servant.himiko.skill.sc-himiko-1"] = {
  ...overrides["servant.himiko.skill.sc-himiko-1"],
  activation: "phase",
  windows: ["outpost"],
  requiresActiveCard: false,
  limit: "once-per-round",
  abilities: [{
    id: "oracle-of-light", name: "Oracle of Light", activation: "phase", windows: ["outpost"],
    limit: "once-per-round", requiresActiveCard: false, handlerId: "core.himiko-oracle-kidou",
  }],
  handlerId: "core.himiko-oracle-kidou",
  supportLevel: "FULL",
  rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
    id: "oracle-of-light", kind: "phase_action",
    printedClause: "Passive/Outpost: choose one Oracle mode and an opponent; that opponent chooses one of the two printed consequences.",
    activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.himiko-oracle-kidou" },
  }], ambiguities: [], unmodeledClauses: [] },
};
overrides["servant.himiko.skill.sc-himiko-2"] = {
  ...overrides["servant.himiko.skill.sc-himiko-2"],
  activation: "phase",
  windows: ["action", "combat"],
  requiresActiveCard: true,
  abilities: [
    { id: "mirror-shield", name: "Mirror Shield", activation: "phase", windows: ["action"], requiresActiveCard: true, handlerId: "core.himiko-oracle-kidou" },
    { id: "sacred-land", name: "Sacred Land", activation: "phase", windows: ["combat"], requiresActiveCard: true, handlerId: "core.himiko-oracle-kidou" },
  ],
  handlerId: "core.himiko-oracle-kidou",
  supportLevel: "FULL",
  rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
    { id: "mirror-shield", kind: "phase_action", printedClause: "Action: choose an active attack in your fight; halve its power, rounded down.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.himiko-oracle-kidou" } },
    { id: "sacred-land", kind: "phase_action", printedClause: "Combat: next round Situations cannot prohibit your Noble Phantasms and your terrain advantage is doubled.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.himiko-oracle-kidou" } },
  ], ambiguities: [], unmodeledClauses: [] },
};
overrides["servant.himiko.skill.sc-himiko-3"] = {
  ...overrides["servant.himiko.skill.sc-himiko-3"],
  activation: "play",
  windows: [],
  requiresActiveCard: false,
  revealsTrueNameOnPlay: true,
  passiveEventTypes: ["card.played"],
  handlerId: "core.himiko-oracle-kidou",
  supportLevel: "FULL",
  rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
    id: "eternal-mirror", kind: "play_trigger",
    printedClause: "On Play: next round you may use Oracle of Light two additional times; you cannot make the same player choose the same Oracle mode twice.",
    execution: { mode: "handler", handlerId: "core.himiko-oracle-kidou" },
  }], ambiguities: [], unmodeledClauses: [] },
};

// Rani VIII: English Fandom card pages are authoritative for the Prophecy package.
// The unique choices are handled by core.rani-prophecies; round-start replacement
// and objective-slot replacement use generic engine/rules-core lifecycle boundaries.
overrides["master.rani.skill.s1"] = {
  ...overrides["master.rani.skill.s1"],
  activation: "passive",
  windows: [],
  requiresActiveCard: false,
  passiveEventTypes: ["game.started", "situation.will-activate", "round.ending"],
  handlerId: "core.rani-prophecies",
  supportLevel: "FULL",
  rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
    { id: "stargazer-inspect", kind: "passive", printedClause: "You may look at burned Event cards.", execution: { mode: "handler", handlerId: "core.rani-prophecies" } },
    { id: "stargazer-replace", kind: "passive", printedClause: "When a non-climax Event would be drawn, burn it instead. Then play a burned Event.", execution: { mode: "handler", handlerId: "core.rani-prophecies" } },
    { id: "stargazer-prophecies", kind: "passive", printedClause: "At the end of round 4, make two Prophecies and immediately choose their players.", execution: { mode: "handler", handlerId: "core.rani-prophecies" } },
  ], ambiguities: [], unmodeledClauses: [] },
};
overrides["master.rani.skill.s2"] = {
  ...overrides["master.rani.skill.s2"],
  initiallyOwned: false,
  activation: "passive",
  windows: [],
  requiresActiveCard: false,
  passiveEventTypes: ["elimination.resolved"],
  handlerId: "core.rani-prophecies",
  supportLevel: "FULL",
  rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
    id: "prophecy-triumph", kind: "passive",
    printedClause: "Choose an opponent. Each time that player survives an elimination, gain 2 VP.",
    execution: { mode: "handler", handlerId: "core.rani-prophecies" },
  }], ambiguities: [], unmodeledClauses: [] },
};
overrides["master.rani.skill.s3"] = {
  ...overrides["master.rani.skill.s3"],
  initiallyOwned: false,
  activation: "passive",
  windows: [],
  requiresActiveCard: false,
  passiveEventTypes: ["elimination.resolved"],
  handlerId: "core.rani-prophecies",
  supportLevel: "FULL",
  rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
    id: "prophecy-doom", kind: "passive",
    printedClause: "Choose an opponent. If that opponent is among the first eliminated from the game and had the least VP, gain 6 VP.",
    execution: { mode: "handler", handlerId: "core.rani-prophecies" },
  }], ambiguities: [], unmodeledClauses: [] },
};
overrides["master.rani.skill.ascension"] = {
  ...overrides["master.rani.skill.ascension"],
  initiallyOwned: false,
  activation: "passive",
  windows: [],
  requiresActiveCard: false,
  passiveEventTypes: ["skill.unlocked", "situation.will-activate"],
  handlerId: "core.rani-prophecies",
  supportLevel: "FULL",
  rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
    { id: "atlas-unlock", kind: "passive", printedClause: "When unlocked, gain VP equal to twice the round number minus the current player count, then you may reassign your Prophecies.", execution: { mode: "handler", handlerId: "core.rani-prophecies" } },
    { id: "atlas-climax-objectives", kind: "passive", printedClause: "During Climax, place new Objectives by selecting them from the remaining deck.", execution: { mode: "handler", handlerId: "core.rani-prophecies" } },
  ], ambiguities: [], unmodeledClauses: [] },
};

// Nursery Rhyme (English original/Fandom): Queen's Glass Game replays the same round from Preparation without rewinding used abilities or ongoing effects; Jabberwock transfers one revealed basic attack into a co-located opponent's deck as its play prerequisite.
Object.assign(overrides, {
  "servant.nursery.skill.sc-nursery-1": {
    ...overrides["servant.nursery.skill.sc-nursery-1"],
    activation: "passive", windows: ["outpost"], cardResidual: true,
    limit: "once-per-game", revealsTrueNameOnPlay: true, requiresActiveCard: true,
    passiveEventTypes: ["card.played"],
    abilities: [{ id: "perpetual-engine", name: "Perpetual Engine", activation: "phase", windows: ["outpost"], requiresActiveCard: true, handlerId: "core.nursery-package" }],
    handlerId: "core.nursery-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "combat-loss-restart", kind: "passive", printedClause: "Permanent: If you would lose a fight deactivate this and all non-permanent attacks in play, remove all players from the board and replay the round from Prep players turns.", execution: { mode: "handler", handlerId: "core.nursery-package" } },
      { id: "perpetual-engine", kind: "phase_action", printedClause: "Perpetual Engine - Outpost: Gain 1 mana and 1 VP.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.nursery-package" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.nursery.skill.sc-nursery-3": {
    ...overrides["servant.nursery.skill.sc-nursery-3"],
    activation: "passive", windows: ["combat"], cardResidual: true,
    playPrerequisite: { shuffleIntoOpponentDeck: { count: 1, basic: true, requireSameLocation: true } },
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.nursery-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "jabberwock-prerequisite", kind: "passive", printedClause: "Permanent: To play this card reveal then shuffle a basic attack from your hand into the deck of an opponent at your location.", execution: { mode: "handler", handlerId: "core.nursery-package" } },
      { id: "jabberwock-close", kind: "passive", printedClause: "Deactivate this card at the end of your combat turn, if an opponent in your fight controls a copy of the revealed card.", execution: { mode: "handler", handlerId: "core.nursery-package" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Suzuka Gozen (English original/Fandom): reshuffle means the automatic discard recycle caused by drawing from an empty deck.
Object.assign(overrides, {
  "servant.suzuka.skill.sc-suzuka-1": {
    ...overrides["servant.suzuka.skill.sc-suzuka-1"],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    automaticDeckRecycleKeepMax: 3,
    passiveEventTypes: ["player.deck-shuffled"],
    abilities: [{ id: "wise-fox-ignore-defeat", name: "Wise Fox", activation: "phase", windows: ["outpost"], requiresActiveCard: false, handlerId: "core.suzuka-package" }],
    handlerId: "core.suzuka-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "wise-fox-reshuffle", kind: "passive", printedClause: "Passive: When reshuffling your deck keep up to 3 cards in your discard and gain 1 Wisdom.", execution: { mode: "handler", handlerId: "core.suzuka-package" } },
      { id: "wise-fox-ignore-defeat", kind: "phase_action", printedClause: "Passive/Outpost: Pay 1 Wisdom. You ignore the defeat status this round.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.suzuka-package" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.suzuka.skill.sc-suzuka-2": {
    ...overrides["servant.suzuka.skill.sc-suzuka-2"],
    activation: "phase", windows: ["action"], requiresActiveCard: false, revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.ending"],
    abilities: [{ id: "demonic-sun-shower", name: "Demonic Sun-Shower", activation: "phase", windows: ["action"], requiresActiveCard: false, handlerId: "core.suzuka-package" }],
    handlerId: "core.suzuka-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "demonic-sun-shower", kind: "phase_action", printedClause: "Action: Pay up to 2 Wisdom. Play up to 3 basics from your discard, plus 1 for each Wisdom spent. Shuffle them into your deck after combat.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.suzuka-package" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "servant.suzuka.skill.sc-suzuka-3": {
    ...overrides["servant.suzuka.skill.sc-suzuka-3"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["card.played"],
    handlerId: "core.suzuka-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "trichiliocosm-on-play", kind: "play_trigger", printedClause: "On Play: Permanently increase this card's cost by 1, then discard the top 3 cards of your deck. If you discard any 4's increase this card's power by its cost.", execution: { mode: "handler", handlerId: "core.suzuka-package" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Magical Ruby / Prisma Illya (English original/Fandom + local FQA): normal Prep refill resolves first; discard never auto-recycles,
// Kaleidostick is the sole discard-to-deck path, and Doppelganger doubles event/objective effects except mana and VP.
Object.assign(overrides, {
  "master.illya-mahou.skill.s1": {
    ...overrides["master.illya-mahou.skill.s1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started"],
    handlerId: "core.magical-ruby", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "unlimited-imagination", kind: "passive",
      printedClause: "Cards cannot enter your deck by any other means; if they would, discard them. An empty deck therefore does not automatically recycle its discard pile.",
      execution: { mode: "handler", handlerId: "core.magical-ruby" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.illya-mahou.skill.s1a": {
    ...overrides["master.illya-mahou.skill.s1a"],
    activation: "phase", windows: ["preparation"], requiresActiveCard: false,
    abilities: [
      { id: "magical-ruby-draw", name: "Kaleidostick · Draw", activation: "phase", windows: ["preparation"], limit: "once-per-round", requiresActiveCard: false, handlerId: "core.magical-ruby" },
      { id: "magical-ruby-shuffle", name: "Kaleidostick · Shuffle", activation: "phase", windows: ["preparation"], limit: "once-per-round", requiresActiveCard: false, handlerId: "core.magical-ruby" },
    ],
    handlerId: "core.magical-ruby", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "magical-ruby-draw", kind: "phase_action", printedClause: "Prep: Draw any number of cards.", activation: { phase: "preparation" }, execution: { mode: "handler", handlerId: "core.magical-ruby" } },
      { id: "magical-ruby-shuffle", kind: "phase_action", printedClause: "Prep: Pay X mana, where X is twice the number of cards in your hand. Shuffle your discard into your deck.", activation: { phase: "preparation" }, execution: { mode: "handler", handlerId: "core.magical-ruby" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.illya-mahou.skill.ascension": {
    ...overrides["master.illya-mahou.skill.ascension"],
    initiallyOwned: false,
    tags: [...new Set([...(overrides["master.illya-mahou.skill.ascension"]?.tags ?? []), "ascension", "event-objective-effects-x2-no-resource"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["round.ending"],
    handlerId: "core.magical-ruby", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "doppelganger-double", kind: "passive", printedClause: "Double the effects of all events and objectives on you. Do not double mana or VP.", execution: { mode: "handler", handlerId: "core.magical-ruby" } },
      { id: "doppelganger-upkeep", kind: "passive", printedClause: "At the end of each round pay 3 mana or remove this card from the game.", execution: { mode: "handler", handlerId: "core.magical-ruby" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Magical Sapphire / Miyu Edelfelt (English original + FQA): the setup Servant is replaced before deck/skill seeding;
// three unused Servants supply identity/class aliases, an outside card pool, and exactly three chosen full-text Skill copies.
Object.assign(overrides, {
  "master.miyu.skill.s1": {
    ...overrides["master.miyu.skill.s1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    startingServantOverride: { servantId: MIYU_SAPPHIRE_SERVANT_ID, deckDefinitionIds: [...MIYU_SAPPHIRE_DECK] },
    passiveEventTypes: ["game.started"],
    handlerId: "core.miyu-sapphire", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "magical-sapphire-setup", kind: "passive",
      printedClause: "Miyu's Servant is Magical Sapphire. Draw 3 Servants from outside the Servant pool and build her skill zone by selecting 3 skills from them. Magical Sapphire gains their classes and names in addition to her own.",
      conditions: [{ type: "event_type_is", eventType: "game.started" }],
      execution: { mode: "handler", handlerId: "core.miyu-sapphire" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.miyu.skill.s2": {
    ...overrides["master.miyu.skill.s2"],
    initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.miyu-sapphire", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "card-selection-draw", kind: "passive", printedClause: "Card Selection — Passive/Outpost: Discard this card. Draw 2 cards.", execution: { mode: "handler", handlerId: "core.miyu-sapphire" } },
      { id: "card-selection-exchange", kind: "passive", printedClause: "Card Selection — Passive/Outpost: Exchange this card with a card from the deck of a Servant drawn at setup or one of Miyu's Install cards from outside the game.", execution: { mode: "handler", handlerId: "core.miyu-sapphire" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.miyu.skill.s3": {
    ...overrides["master.miyu.skill.s3"],
    initiallyOwned: false,
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.miyu-sapphire", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "miyu-install-package", kind: "passive",
      printedClause: "Miyu's six Install cards are outside the game, only one Install may be played each turn, each is Once Per Game, and each executes its printed card ability.",
      execution: { mode: "handler", handlerId: "core.miyu-sapphire" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.miyu.skill.ascension": {
    ...overrides["master.miyu.skill.ascension"],
    initiallyOwned: false,
    tags: [...new Set([...(overrides["master.miyu.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    abilities: [{ id: "spoilt-for-choice-draw", name: "Spoilt for Choice", activation: "phase", windows: ["outpost"], limit: "once-per-round", requiresActiveCard: false, handlerId: "core.miyu-sapphire" }],
    handlerId: "core.miyu-sapphire", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "spoilt-for-choice-installs", kind: "passive", printedClause: "When gained, put all of Miyu's Install cards from outside the game into your hand.", conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }], execution: { mode: "handler", handlerId: "core.miyu-sapphire" } },
      { id: "spoilt-for-choice-draw", kind: "phase_action", printedClause: "Outpost: Discard a card. Draw two cards.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.miyu-sapphire" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Akuta Hinako / Qin Shi Huang / Chinese Lostbelt. English original card text on the allowed Fate/Domination Fandom
// is authoritative for the objective values/conditions; all runtime behavior below is structured metadata or a dedicated handler.
Object.assign(overrides, {
  "master.hinako.skill.s1": {
    ...overrides["master.hinako.skill.s1"],
    activation: "passive", windows: [], requiresActiveCard: false,
    startingNpcCombatant: {
      id: "npc.qin-shi-huang", name: "Qin Shi Huang", basePower: 14,
      presenceEventTag: "npc-presence:npc.qin-shi-huang",
    },
    handlerId: "core.hinako-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "rogue-crypter", kind: "passive",
      printedClause: "Add the NPC [Qin Shi Huang] to the game. He tends the [Chinese Lostbelt].",
      execution: { mode: "handler", handlerId: "core.hinako-package" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hinako.skill.s1a": {
    ...overrides["master.hinako.skill.s1a"],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["game.started", "combat.resolved"],
    addSkillDefinitionId: "master.hinako.skill.s2",
    handlerId: "core.hinako-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "death-wish", kind: "passive",
      printedClause: "Add [Eternal Lament] to your skill zone. When you lose a fight, return a removed [Eternal Lament] to your skill zone.",
      execution: { mode: "handler", handlerId: "core.hinako-package" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hinako.skill.s2": {
    ...overrides["master.hinako.skill.s2"],
    initiallyOwned: false,
    activation: "phase", windows: ["action", "combat"], requiresActiveCard: true,
    abilities: [
      { id: "eternal-lament-combat", name: "Eternal Lament", activation: "phase", windows: ["combat"], limit: "once-per-round", requiresActiveCard: true, handlerId: "core.hinako-package" },
      { id: "true-ancestor-copy", name: "True Ancestor · Blood Copy", activation: "phase", windows: ["action"], limit: "unlimited", requiresActiveCard: true, handlerId: "core.hinako-package" },
    ],
    handlerId: "core.hinako-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "eternal-lament-combat", kind: "phase_action", printedClause: "Combat: Each opponent attack in your fight gets -2 power.", activation: { phase: "combat" }, execution: { mode: "handler", handlerId: "core.hinako-package" } },
      { id: "true-ancestor-copy", kind: "phase_action", printedClause: "After [True Ancestor]: Action: Pay 4X mana. X of your basic attacks become copies of [Eternal Lament] until the end of combat.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.hinako-package" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hinako.skill.s3": {
    ...overrides["master.hinako.skill.s3"],
    activation: "passive", windows: [], requiresActiveCard: false,
    startingNamedEventPoolInjection: { poolId: CHINESE_LOSTBELT_POOL_ID, count: 4 },
    passiveEventTypes: ["combat.resolved", "combat.ending"],
    handlerId: "core.hinako-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "qin-starting-expansion", kind: "passive", printedClause: "Before the first round, expand four times.", execution: { mode: "handler", handlerId: "core.hinako-package" } },
      { id: "qin-win", kind: "passive", printedClause: "When Qin Shi Huang wins a fight, Akuta gains 3 VP and you expand.", conditions: [{ type: "event_type_is", eventType: "combat.resolved" }], execution: { mode: "handler", handlerId: "core.hinako-package" } },
      { id: "qin-presence", kind: "passive", printedClause: "Qin Shi Huang has total power 14 (modifiable) and is exclusively at every location containing a Chinese objective.", execution: { mode: "handler", handlerId: "core.hinako-package" } },
      { id: "qin-nowhere", kind: "passive", printedClause: "If Qin Shi Huang is nowhere during combat resolution, he gains 2 VP.", conditions: [{ type: "event_type_is", eventType: "combat.ending" }], execution: { mode: "handler", handlerId: "core.hinako-package" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hinako.skill.s4": {
    ...overrides["master.hinako.skill.s4"],
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.hinako-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "china-expand", kind: "passive", printedClause: "Expand: Randomly reveal a Chinese objective from outside the game and shuffle it into the objective deck. Concurrent expansion triggers resolve together.", execution: { mode: "handler", handlerId: "core.hinako-package" } },
      { id: "china-objectives", kind: "passive", printedClause: "The nine Chinese objectives apply their printed Qin power, player power, defeat, play-restriction, and removal rules through structured objective metadata.", execution: { mode: "handler", handlerId: "core.hinako-package" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.hinako.skill.ascension": {
    ...overrides["master.hinako.skill.ascension"],
    initiallyOwned: false,
    tags: [...new Set([...(overrides["master.hinako.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "passive", windows: [], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked", "combat.ending"],
    handlerId: "core.hinako-package", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "true-ancestor-unlock", kind: "passive", printedClause: "Remove all Shakespeare skills from the game; you no longer have a Servant; recover Eternal Lament, which loses Once Per Game and gains its 4X-mana basic-attack copy ability.", conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }], execution: { mode: "handler", handlerId: "core.hinako-package" } },
      { id: "true-ancestor-cleanup", kind: "passive", printedClause: "At the end of combat, restore basic attacks temporarily copied as Eternal Lament.", conditions: [{ type: "event_type_is", eventType: "combat.ending" }], execution: { mode: "handler", handlerId: "core.hinako-package" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

// Alice (English original/Fandom): Phantom Alice is a second board presence of the same player,
// not a second PlayerState. Shared cards/resources stay on the controller while combat power is
// frozen independently at each presence location.
Object.assign(overrides, {
  "master.alice.skill.s1": {
    ...overrides["master.alice.skill.s1"],
    activation: "phase", windows: ["outpost"], requiresActiveCard: false,
    passiveEventTypes: ["player.moved", "attack.committed"],
    abilities: [{ id: "cyber-ghost-deploy", name: "Cyber Ghost", activation: "phase", windows: ["outpost"], limit: "once-per-round", requiresActiveCard: false, handlerId: "core.alice-phantom-player" }],
    handlerId: "core.alice-phantom-player", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "cyber-ghost-deploy", kind: "phase_action", printedClause: "Outpost: Unless you lost a fight last round, deploy Phantom Alice on a battlefield.", activation: { phase: "outpost" }, execution: { mode: "handler", handlerId: "core.alice-phantom-player" } },
      { id: "cyber-ghost-follow", kind: "passive", printedClause: "After an Alice moves or is moved, the other moves the same distance in the same direction if able and unengaged.", conditions: [{ type: "event_type_is", eventType: "player.moved" }], execution: { mode: "handler", handlerId: "core.alice-phantom-player" } },
      { id: "cyber-ghost-tax", kind: "passive", printedClause: "After playing cards, lose mana equal to half their total cost, rounded up.", conditions: [{ type: "event_type_is", eventType: "attack.committed" }], execution: { mode: "handler", handlerId: "core.alice-phantom-player" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
  "master.alice.skill.s2": {
    ...overrides["master.alice.skill.s2"],
    activation: "passive", windows: [], requiresActiveCard: false,
    handlerId: "core.alice-phantom-player", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [{
      id: "phantom-alice", kind: "passive",
      printedClause: "Both Alices are the same player with the same active cards. When separated they calculate power independently; a location/fight effect chooses one of Alice's locations and never triggers twice merely because both Alices exist.",
      execution: { mode: "handler", handlerId: "core.alice-phantom-player" },
    }], ambiguities: [], unmodeledClauses: [] },
  },
  "master.alice.skill.ascension": {
    ...overrides["master.alice.skill.ascension"],
    initiallyOwned: false,
    tags: [...new Set([...(overrides["master.alice.skill.ascension"]?.tags ?? []), "ascension"])],
    activation: "phase", windows: ["action"], requiresActiveCard: false,
    passiveEventTypes: ["skill.unlocked"],
    abilities: [{ id: "queenside-sacrifice", name: "Queenside Castle", activation: "phase", windows: ["action"], limit: "once-per-game", requiresActiveCard: false, handlerId: "core.alice-phantom-player" }],
    handlerId: "core.alice-phantom-player", supportLevel: "FULL",
    rules: { schemaVersion: "fd-card-authoring-v1", abilities: [
      { id: "queenside-terrain", kind: "passive", printedClause: "Passive: Terrain Advantage spaces you stand on provide terrain advantage for you at all locations.", conditions: [{ type: "event_type_is", eventType: "skill.unlocked" }], execution: { mode: "handler", handlerId: "core.alice-phantom-player" } },
      { id: "queenside-sacrifice", kind: "phase_action", printedClause: "Action: Remove Phantom Alice from the board, then defeat all players at her previous battlefield.", activation: { phase: "action" }, execution: { mode: "handler", handlerId: "core.alice-phantom-player" } },
    ], ambiguities: [], unmodeledClauses: [] },
  },
} satisfies Record<string, ConfirmedSkillOverride>);

export const confirmedSkillOverrides: Readonly<Record<string, ConfirmedSkillOverride>> = Object.freeze(overrides);
export const confirmedBattleContinuationSkillIds: readonly string[] = battleContinuationSkillIds;
export const confirmedPretenderClassSkillIds: readonly string[] = pretenderClassSkillIds;
export const confirmedIndependentActionSkillIds: readonly string[] = independentActionSkillIds;
export const confirmedTerritoryCreationSkillIds: readonly string[] = territoryCreationSkillIds;
export const confirmedPresenceConcealmentSkillIds: readonly string[] = presenceConcealmentSkillIds;
export const confirmedRidingSkillIds: readonly string[] = ridingSkillIds;
export const confirmedExplicitEightManaExceptionSkillIds: readonly string[] = explicitEightManaExceptionSkillIds;
export const confirmedSaberMagicResistanceSkillIds: readonly string[] = saberMagicResistanceIds;
