import type { CardDefinition } from "../rules-core/content-types.ts";

export type BaseCardRuleOverride = Pick<CardDefinition,
  "linkedSkillId" | "phases" | "steps" | "cardAbilityIds" | "combatWinVictoryPoints"
  | "activeOtherAttackPowerBonus" | "closeAfterControllerDefeatsOtherPlayer"
  | "linkedOwnerDefeatIgnore" | "linkedOwnerCombatPowerMaximum" | "closeIfLinkedOwnerAbsentFromCombat"
  | "returnToOwnerHandOnOwnerCombatLoss" | "ownerConditionalBasePowerMultiplier"
  | "drawOnPlay" | "returnToDeckOnDefeat"
  | "residual" | "limit" | "uniqueGroup" | "standardAppend" | "playAdjustmentFromActiveSource"
  | "hasReversalEffect" | "tags"
>;

/**
 * Confirmed executable metadata for common/basic cards. This table is content,
 * not a runtime text parser: display names/text remain presentation-only.
 */
export const baseCardRuleOverrides: Readonly<Record<string, BaseCardRuleOverride>> = Object.freeze({
  "card.card-avenger": {
    residual: true,
    activeOtherAttackPowerBonus: 1,
    closeAfterControllerDefeatsOtherPlayer: true,
  },
  "card.x-avenger": {
    residual: true,
    activeOtherAttackPowerBonus: 1,
    closeAfterControllerDefeatsOtherPlayer: true,
  },
  "card.x-guard": {
    phases: ["action"],
    cardAbilityIds: ["mash.guard-lend"],
    linkedOwnerDefeatIgnore: true,
    linkedOwnerCombatPowerMaximum: true,
    closeIfLinkedOwnerAbsentFromCombat: true,
    returnToOwnerHandOnOwnerCombatLoss: true,
    ownerConditionalBasePowerMultiplier: {
      playerFlagEquals: { key: "mashOrtenausActive", value: true },
      commandSealsAtMost: 0,
      multiplier: 2,
    },
  },
  "card.cardluck": {
    phases: ["combat"],
    cardAbilityIds: ["basic.ignore-defeat"],
  },
  "card.cardpreparation": {
    phases: ["action"],
    cardAbilityIds: ["basic.remote-control"],
    combatWinVictoryPoints: 2,
  },
  "card.x-misfortune": {
    phases: ["combat"],
    steps: ["post-power-response"],
    cardAbilityIds: ["misfortune-battle-loss"],
    drawOnPlay: 1,
    returnToDeckOnDefeat: true,
  },
  "card.x-pilgrimcall": {
    linkedSkillId: "servant.artoriac.skill.sc-artoriac-4",
  },
  "card.x-pilgrimrespite": {
    linkedSkillId: "servant.artoriac.skill.sc-artoriac-5",
  },
  "card.x-pilgrimdestiny": {
    linkedSkillId: "servant.artoriac.skill.sc-artoriac-6",
  },
  "card.x-installsaber": {
    linkedSkillId: "servant.illya.skill.sc-illya-4",
    limit: "once-per-round",
    uniqueGroup: "illya-dream-summon",
    playAdjustmentFromActiveSource: {
      sourceDefinitionId: "card.x-installcaster",
      choices: [{ id: "power", powerAdd: 4 }, { id: "cost", costAdd: -3 }],
      closeSourceAfterPlay: true,
    },
  },
  "card.x-installberserker": {
    linkedSkillId: "servant.illya.skill.sc-illya-5",
    limit: "once-per-round",
    uniqueGroup: "illya-dream-summon",
    playAdjustmentFromActiveSource: {
      sourceDefinitionId: "card.x-installcaster",
      choices: [{ id: "power", powerAdd: 4 }, { id: "cost", costAdd: -3 }],
      closeSourceAfterPlay: true,
    },
  },
  "card.x-installarcher": {
    linkedSkillId: "servant.illya.skill.sc-illya-6",
    limit: "once-per-round",
    uniqueGroup: "illya-dream-summon",
    playAdjustmentFromActiveSource: {
      sourceDefinitionId: "card.x-installcaster",
      choices: [{ id: "power", powerAdd: 4 }, { id: "cost", costAdd: -3 }],
      closeSourceAfterPlay: true,
    },
  },
  "card.x-installlancer": {
    linkedSkillId: "servant.illya.skill.sc-illya-7",
    limit: "once-per-round",
    uniqueGroup: "illya-dream-summon",
    playAdjustmentFromActiveSource: {
      sourceDefinitionId: "card.x-installcaster",
      choices: [{ id: "power", powerAdd: 4 }, { id: "cost", costAdd: -3 }],
      closeSourceAfterPlay: true,
    },
  },
  "card.x-installassassin": {
    linkedSkillId: "servant.illya.skill.sc-illya-8",
    limit: "once-per-round",
    uniqueGroup: "illya-dream-summon",
    playAdjustmentFromActiveSource: {
      sourceDefinitionId: "card.x-installcaster",
      choices: [{ id: "power", powerAdd: 4 }, { id: "cost", costAdd: -3 }],
      closeSourceAfterPlay: true,
    },
  },
  "card.x-installrider": {
    linkedSkillId: "servant.illya.skill.sc-illya-9",
    limit: "once-per-round",
    uniqueGroup: "illya-dream-summon",
    standardAppend: true,
    playAdjustmentFromActiveSource: {
      sourceDefinitionId: "card.x-installcaster",
      choices: [{ id: "power", powerAdd: 4 }, { id: "cost", costAdd: -3 }],
      closeSourceAfterPlay: true,
    },
  },
  "card.x-installcaster": {
    linkedSkillId: "servant.illya.skill.sc-illya-10",
    limit: "once-per-round",
    uniqueGroup: "illya-dream-summon",
    residual: true,
  },
  "card.x-lessergolem": {
    linkedSkillId: "servant.avicebron.skill.sc-avicebron-4",
    residual: true,
    uniqueGroup: "avicebron-golem-upkeep",
  },
  "card.x-commongolem": {
    linkedSkillId: "servant.avicebron.skill.sc-avicebron-5",
    residual: true,
    uniqueGroup: "avicebron-golem-upkeep",
  },
  "card.x-nf14": {
    linkedSkillId: "servant.koyanskaya.skill.sc-koyanskaya-4",
    cardAbilityIds: ["koyanskaya.nf14-suppressive-fire"],
    hasReversalEffect: true,
    tags: ["reduces-standard-attack-by-one"],
  },
  "card.x-nf56": {
    linkedSkillId: "servant.koyanskaya.skill.sc-koyanskaya-5",
    hasReversalEffect: true,
  },
  "card.x-nf00": {
    linkedSkillId: "servant.koyanskaya.skill.sc-koyanskaya-6",
    hasReversalEffect: true,
  },
  "card.cardsurveil": {
    phases: ["action"],
    cardAbilityIds: ["basic.quick-march"],
  },
  "card.card-gof-fist": {
    phases: ["combat"],
    steps: ["player-window"],
    cardAbilityIds: ["basic.combat-play-from-hand"],
  },
  "card.card-kohaku-blast": {
    phases: ["combat"],
    steps: ["player-window"],
    cardAbilityIds: ["basic.combat-play-from-hand", "kohaku.magical-onslaught-arson"],
  },
  "card.card-volumen-slash": {
    phases: ["action", "combat"],
    cardAbilityIds: ["volumen.perfect-flow", "volumen.scalp"],
  },
  "card.card-volumen-track": {
    phases: ["combat"],
    cardAbilityIds: ["volumen.perfect-flow", "volumen.ire-sanctio"],
  },
  "card.card-volumen-boil": {
    phases: ["combat"],
    cardAbilityIds: ["volumen.perfect-flow", "volumen.fervor"],
  },
});
