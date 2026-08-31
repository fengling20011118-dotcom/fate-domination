import type { AppendFromHandRule, CardAttribute } from "../rules-core/content-types.ts";
import type { SkillAbilityDefinition, SkillSupportLevel } from "../rules-core/skill-types.ts";
import type { PhaseStepId } from "../domain/state/types.ts";

/** Confirmed rule metadata keyed by stable skill IDs. */
export interface ConfirmedSkillOverride {
  attributes?: CardAttribute[];
  tags?: string[];
  abilities?: SkillAbilityDefinition[];
  requiresActiveCard?: boolean;
  requiresTrueName?: boolean;
  requiresEightMana?: boolean;
  ignoresSituationRestrictions?: boolean;
  abilityCost?: number;
  drawCount?: number;
  locationId?: string;
  manaGain?: number;
  revealsTrueNameOnPlay?: boolean;
  handlerId?: string;
  supportLevel?: SkillSupportLevel;
  activation?: "passive" | "optional-trigger" | "phase" | "play" | "residual";
  costRule?: { kind: "round-linear"; base: number; perRound: number; min: number };
  steps?: PhaseStepId[];
  limit?: "once-per-game" | "once-per-round" | "once-per-turn";
  uniqueGroup?: string;
  playDrawIfWithBasicAttack?: number;
  appendFromHand?: AppendFromHandRule;
  singleCardPlay?: boolean;
  passiveEventTypes?: string[];
  combatPowerZeroAttribute?: CardAttribute;
}

const BATTLE_CONTINUATION_HANDLER = "core.move-to-non-workshop";

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
  // Jekyll stays PARTIAL until the Jekyll/Hyde form restriction exists.
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

const overrides: Record<string, ConfirmedSkillOverride> = {
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

export const confirmedSkillOverrides: Readonly<Record<string, ConfirmedSkillOverride>> = Object.freeze(overrides);
export const confirmedBattleContinuationSkillIds: readonly string[] = battleContinuationSkillIds;
export const confirmedIndependentActionSkillIds: readonly string[] = independentActionSkillIds;
export const confirmedTerritoryCreationSkillIds: readonly string[] = territoryCreationSkillIds;
export const confirmedPresenceConcealmentSkillIds: readonly string[] = presenceConcealmentSkillIds;
export const confirmedRidingSkillIds: readonly string[] = ridingSkillIds;
export const confirmedSaberMagicResistanceSkillIds: readonly string[] = saberMagicResistanceIds;
