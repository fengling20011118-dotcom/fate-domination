import type { AppendFromHandRule, CardAttribute } from "../rules-core/content-types.ts";
import type { SkillAbilityDefinition, SkillSupportLevel } from "../rules-core/skill-types.ts";
import type { PhaseId, PhaseStepId } from "../domain/state/types.ts";

/** Confirmed rule metadata keyed by stable skill IDs. */
export interface ConfirmedSkillOverride {
  attributes?: CardAttribute[];
  tags?: string[];
  abilities?: SkillAbilityDefinition[];
  requiresActiveCard?: boolean;
  requiresTrueName?: boolean;
  requiresEightMana?: boolean;
  maxManaExclusive?: number;
  hiddenTrueNameCostReduction?: number;
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
  revealsTrueNameOnPlay?: boolean;
  handlerId?: string;
  supportLevel?: SkillSupportLevel;
  activation?: "passive" | "optional-trigger" | "phase" | "play" | "residual";
  windows?: PhaseId[];
  costRule?: { kind: "round-linear"; base: number; perRound: number; min: number };
  steps?: PhaseStepId[];
  limit?: "once-per-game" | "once-per-round" | "once-per-turn";
  uniqueGroup?: string;
  playDrawIfWithBasicAttack?: number;
  appendFromHand?: AppendFromHandRule;
  singleCardPlay?: boolean;
  standardAppend?: boolean;
  passiveEventTypes?: string[];
  combatPowerZeroAttribute?: CardAttribute;
  combatPowerBonus?: number;
  combatHistory?: "leonardo-victory-streak" | "nanaya-contested-combat";
  roundEndVictoryPointLoss?: number;
  roundEndLocationId?: "workshop" | "mountain" | "city" | "scouting";
  roundEndManaGain?: number;
  derivedAttackBatch?: { count: number; definitionIds: string[] };
  opponentCombatPowerBonus?: number;
  opponentRequiresNoDeploymentBonus?: boolean;
  defeatScope?: "all-combat-participants";
  closeActiveAndActivateHiddenDefinitionId?: string;
  doubleDeploymentBonus?: boolean;
  defeatEngagedOpponentsIfMoreActiveAttacks?: boolean;
  manaThresholdVictoryPointLoss?: { threshold: number; amount: number; opponentExtra: number };
  /** Explicit numeric normalization for cards whose printed power is dynamic in legacy data. */
  basePower?: number;
}

const BATTLE_CONTINUATION_HANDLER = "core.move-to-non-workshop";

const pretenderClassSkillIds = [
  "servant.hephaistion.skill.sc-hephaistion-2",
  "servant.ladyavalon.skill.sc-ladyavalon-2",
  "servant.oberon.skill.sc-oberon-2",
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
  "servant.sherlock.skill.sc-sherlock-4": {
    activation: "passive",
    tags: ["deduction-record", "deduction-attribute:力量"],
    handlerId: "core.rule-marker",
    supportLevel: "FULL",
  },
  "servant.sherlock.skill.sc-sherlock-5": {
    activation: "passive",
    tags: ["deduction-record", "deduction-attribute:迅捷"],
    handlerId: "core.rule-marker",
    supportLevel: "FULL",
  },
  "servant.sherlock.skill.sc-sherlock-6": {
    activation: "passive",
    tags: ["deduction-record", "deduction-attribute:魔术"],
    handlerId: "core.rule-marker",
    supportLevel: "FULL",
  },
  "servant.sherlock.skill.sc-sherlock-7": {
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
    passiveEventTypes: ["game.started"],
    addSkillDefinitionId: "card.derived.master.tokiomi.fireball",
    handlerId: "core.game-start-add-skill",
    supportLevel: "FULL",
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
    passiveEventTypes: ["game.started", "combat.resolved", "round.started"],
    handlerId: "core.bazett-time-loop",
    supportLevel: "FULL",
    uniqueGroup: "bazett-time-loop",
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
  },
  "master.bazett.skill.s5": {
    activation: "phase",
    windows: ["action", "combat"],
    requiresActiveCard: false,
    passiveEventTypes: ["combat.resolved"],
    abilities: [
      {
        id: "third-day-attack",
        name: "第三天：加入攻击",
        activation: "phase",
        windows: ["action"],
        handlerId: "core.bazett-third-day",
        requiresActiveCard: false,
      },
      {
        id: "third-day-victory",
        name: "第三天：胜利奖励",
        activation: "phase",
        windows: ["combat"],
        handlerId: "core.bazett-third-day",
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.bazett-third-day",
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
    passiveEventTypes: ["card.played"],
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
  // 混沌【恐惧】的“支配”是明确的战斗阶段属性归零效果：
  // 只影响与混沌同一战场的对手所控制的【幸运】攻击。
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
  "servant.jeanne-alter.skill.sc-jeanne-alter-1": {
    activation: "phase",
    defeatEngagedOpponentsIfMoreActiveAttacks: true,
    handlerId: "core.defeat-engaged-if-more-attacks",
    supportLevel: "FULL",
  },
  "servant.ibaraki.skill.sc-ibaraki-2": {
    activation: "phase",
    maxManaExclusive: 8,
    manaThresholdVictoryPointLoss: { threshold: 8, amount: 1, opponentExtra: 1 },
    handlerId: "core.mana-threshold-vp-loss",
    supportLevel: "FULL",
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
  "servant.arcueid.skill.sc-arcueid-3": {
    activation: "phase",
    windows: ["combat"],
    requiresActiveCard: true,
    handlerId: "core.arcueid-marble-phantasm",
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
    name: "魔术抗性",
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
      name: "他人格",
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

export const confirmedSkillOverrides: Readonly<Record<string, ConfirmedSkillOverride>> = Object.freeze(overrides);
export const confirmedBattleContinuationSkillIds: readonly string[] = battleContinuationSkillIds;
export const confirmedPretenderClassSkillIds: readonly string[] = pretenderClassSkillIds;
export const confirmedIndependentActionSkillIds: readonly string[] = independentActionSkillIds;
export const confirmedTerritoryCreationSkillIds: readonly string[] = territoryCreationSkillIds;
export const confirmedPresenceConcealmentSkillIds: readonly string[] = presenceConcealmentSkillIds;
export const confirmedRidingSkillIds: readonly string[] = ridingSkillIds;
export const confirmedExplicitEightManaExceptionSkillIds: readonly string[] = explicitEightManaExceptionSkillIds;
export const confirmedSaberMagicResistanceSkillIds: readonly string[] = saberMagicResistanceIds;
