import type { SkillDefinition } from "../rules-core/skill-types.ts";
import type { PhaseStepId } from "../domain/state/types.ts";
import { getCardAttributes, normalizeCardAttributes } from "../rules-core/content-types.ts";
import { confirmedSkillOverrides } from "./confirmed-skill-overrides.ts";
import { getEnglishServantSource } from "./servant-source-index.ts";
import type { SkillSourceRef } from "../rules-core/skill-types.ts";
import { parseSkillEffects } from "../rules-core/skill-effects.ts";
import { buildSkillRuleProgram } from "../rules-core/skill-rule-program.ts";
import type { FDCardAuthoringRules, FDAuthoringFormula } from "./authoring/types.ts";

interface RawSkill { id: string; legacyId?: string | null; name: string; initiallyOwned?: boolean; cardResidual?: boolean; typeLabel?: string; attributes?: string[]; cost?: number | null; playAttributeDeclaration?: { allowedAttributes: string[]; uniquePerGame?: boolean; repeatAllowedWithOwnedSkillId?: string }; requiresActiveInSkillZoneToPlay?: boolean; optionalFreePlay?: { waiveEightMana?: boolean; revealTrueName?: boolean; nextRoundCombatPowerOverride?: number; requireSourcePresent?: boolean }; alternativePlayCost?: { resource: "victory-points"; amount: number }; pairedPlayOtherCostReduction?: number; materializedCardType?: "attack" | "skill"; playRequiresPlayerFlag?: { key: string; value: boolean | number | string }; abilityCost?: number | null; drawCount?: number; drawOnPlay?: number; returnToDeckOnDefeat?: boolean; preparationHandSize?: number; locationId?: string; manaGain?: number; initialMana?: number; requirement?: number | null; basePower?: number | null; basePowerFormula?: FDAuthoringFormula; text?: string; image?: string; sourceRefs?: SkillSourceRef[]; activation?: { kind?: string; windows?: string[]; steps?: string[] }; tags?: string[]; implementation?: string; handlerId?: string; passiveEventTypes?: string[]; limit?: "once-per-game" | "twice-per-game" | "once-per-round" | "twice-per-round" | "once-per-turn"; suppressInferredLimit?: boolean; uniqueGroup?: string; requiresTrueName?: boolean; requiresEightMana?: boolean; eightManaWaiverMaxPrintedBasePower?: number; ignoresSituationRestrictions?: boolean; revealsTrueNameOnPlay?: boolean; revealsTrueNameOnSkillUse?: boolean; requiresHiddenTrueName?: boolean; hasReversalEffect?: boolean; revealsTrueNameOnReverse?: boolean; requiresActiveCard?: boolean; playDrawIfWithBasicAttack?: number; appendFromHand?: { maxCount: number; maxBasePower: number }; singleCardPlay?: boolean; attachedSupplyAppend?: { definitionIds: string[]; drawAfterAppend?: number; sourceEvent?: "card.played" }; activeAttackLifecycleBoost?: { residualAbilityId: string; boostAbilityId: string; residualRoundOffset: number; boostAttribute: string; boostPower: number }; basicCardPowerBonusAttributes?: string[]; basicCardPowerBonusCondition?: { playerFlagEquals?: { key: string; value: boolean | number | string } }; playerDefeatIgnoreCondition?: { playerFlagEquals?: { key: string; value: boolean | number | string } }; protectsControllerCardsFromOpponents?: boolean; activeOwnedCardAttributeGrant?: { targetDefinitionIds: string[]; attributes: string[] }; globalActiveCardAttributeGrant?: { targetDefinitionIds: string[]; attributes: string[] }; rules?: FDCardAuthoringRules; }
interface RawOwner { id: string; skills?: RawSkill[] }

function phase(value: string): "preparation" | "outpost" | "action" | "combat" | null {
  if (value === "preparation" || value === "outpost" || value === "action" || value === "combat") return value;
  return null;
}

export function buildSkillDefinitions(raw: { masters?: RawOwner[]; servants?: RawOwner[] }): SkillDefinition[] {
  const result: SkillDefinition[] = [];
  for (const ownerType of ["master", "servant"] as const) {
    for (const owner of raw[`${ownerType}s`] ?? []) {
      for (const skill of owner.skills ?? []) {
        const confirmed = confirmedSkillOverrides[skill.id];
        const inferred = inferExplicitCardMetadata(skill.text ?? "");
        const parsedEffects = parseSkillEffects(skill.text ?? "");
        const activation = confirmed?.activation ?? (skill.activation?.kind === "passive"
          ? "passive"
          : skill.activation?.kind === "residual"
            ? "residual"
          : skill.activation?.kind === "optional-trigger"
            ? "optional-trigger"
            : skill.activation?.kind === "play"
              ? "play"
              : "phase");
        const parsedHandler = canUseParsedEffectsAsSkill(activation, parsedEffects, skill.text ?? "")
          ? "core.parsed-effects"
          : undefined;
        const parsedSupport = parsedHandler ? "FULL" as const : undefined;
        const text = skill.text ?? "";
        const confirmedRuntime = confirmed?.supportLevel === "FULL" ? confirmed : undefined;
        const confirmedRevealsTrueNameOnPlay = confirmed?.revealsTrueNameOnPlay === true
          && (confirmed.supportLevel === "FULL" || text.trim().length === 0 || /^\s*【真名解放】/.test(text));
        const definition = {
          id: skill.id,
          name: skill.name,
          ownerType,
          ownerId: owner.id,
          // Initial ownership is structured content metadata. Ascension is imported with
          // the stable "ascension" tag, so runtime never needs to inspect Chinese card text.
          initiallyOwned: confirmed?.initiallyOwned ?? skill.initiallyOwned ?? (skill.tags?.includes("ascension") ? false : true),
          startingServantOverride: confirmed?.startingServantOverride
            ? { servantId: confirmed.startingServantOverride.servantId, deckDefinitionIds: [...confirmed.startingServantOverride.deckDefinitionIds] }
            : undefined,
          startingNpcCombatant: confirmed?.startingNpcCombatant ? { ...confirmed.startingNpcCombatant } : undefined,
          startingNamedEventPoolInjection: confirmed?.startingNamedEventPoolInjection ? { ...confirmed.startingNamedEventPoolInjection } : undefined,
          unlockLatestRound: confirmed?.unlockLatestRound,
          requiresSkillUsedThisRound: confirmed?.requiresSkillUsedThisRound,
          playPrerequisite: confirmed?.playPrerequisite ? { ...confirmed.playPrerequisite } : undefined,
          automaticDeckRecycleKeepMax: confirmed?.automaticDeckRecycleKeepMax,
          cardResidual: confirmed?.cardResidual ?? skill.cardResidual,
          activation,
          windows: confirmed?.windows
            ? [...confirmed.windows]
            : (skill.activation?.windows ?? []).map(phase).filter((item): item is NonNullable<typeof item> => item !== null),
          cost: Number(confirmed?.cost ?? skill.cost ?? 0),
          costRule: confirmed?.costRule,
          variablePlayAttributeChoice: confirmed?.variablePlayAttributeChoice ? { allowedAttributes: [...confirmed.variablePlayAttributeChoice.allowedAttributes], manaPerAttribute: confirmed.variablePlayAttributeChoice.manaPerAttribute } : undefined,
          playAttributeDeclaration: confirmed?.playAttributeDeclaration
            ? { allowedAttributes: [...confirmed.playAttributeDeclaration.allowedAttributes], uniquePerGame: confirmed.playAttributeDeclaration.uniquePerGame, repeatAllowedWithOwnedSkillId: confirmed.playAttributeDeclaration.repeatAllowedWithOwnedSkillId }
            : skill.playAttributeDeclaration
              ? { allowedAttributes: normalizeCardAttributes(skill.playAttributeDeclaration.allowedAttributes), uniquePerGame: skill.playAttributeDeclaration.uniquePerGame, repeatAllowedWithOwnedSkillId: skill.playAttributeDeclaration.repeatAllowedWithOwnedSkillId }
              : undefined,
          requiresActiveInSkillZoneToPlay: confirmed?.requiresActiveInSkillZoneToPlay ?? skill.requiresActiveInSkillZoneToPlay,
          optionalFreePlay: confirmed?.optionalFreePlay ? { ...confirmed.optionalFreePlay } : skill.optionalFreePlay ? { ...skill.optionalFreePlay } : undefined,
          alternativePlayCost: confirmed?.alternativePlayCost ?? skill.alternativePlayCost,
          alternateManaPayer: confirmed?.alternateManaPayer ? { ...confirmed.alternateManaPayer } : skill.alternateManaPayer ? { ...skill.alternateManaPayer } : undefined,
          attackManaShare: confirmed?.attackManaShare ? { ...confirmed.attackManaShare } : skill.attackManaShare ? { ...skill.attackManaShare } : undefined,
          rulerSealControllerSourceId: confirmed?.rulerSealControllerSourceId ?? skill.rulerSealControllerSourceId,
          pairedPlayOtherCostReduction: confirmed?.pairedPlayOtherCostReduction ?? skill.pairedPlayOtherCostReduction,
          pairedPlayOtherCostIncrease: confirmed?.pairedPlayOtherCostIncrease,
          pairedWithDefinitionCostIncrease: confirmed?.pairedWithDefinitionCostIncrease ? { ...confirmed.pairedWithDefinitionCostIncrease } : undefined,
          pairedPlayOtherPowerBonus: confirmed?.pairedPlayOtherPowerBonus,
          terrainAdvantageCostReduction: confirmed?.terrainAdvantageCostReduction ?? skill.terrainAdvantageCostReduction,
          commandSealPlayCost: confirmed?.commandSealPlayCost,
          victoryPointPlayCost: confirmed?.victoryPointPlayCost,
          materializedCardType: confirmed?.materializedCardType ?? skill.materializedCardType,
          playRequiresPlayerFlag: confirmed?.playRequiresPlayerFlag ?? skill.playRequiresPlayerFlag,
          abilityCost: Number(confirmed?.abilityCost ?? skill.abilityCost ?? 0),
          drawCount: confirmed?.drawCount ?? skill.drawCount,
          drawOnPlay: confirmed?.drawOnPlay ?? skill.drawOnPlay ?? inferDrawOnPlay(skill.text ?? ""),
          returnToDeckOnDefeat: confirmed?.returnToDeckOnDefeat ?? skill.returnToDeckOnDefeat ?? inferReturnToDeckOnDefeat(skill.text ?? ""),
          preparationHandSize: confirmed?.preparationHandSize ?? skill.preparationHandSize,
          locationId: confirmed?.locationId ?? skill.locationId,
          manaGain: confirmed?.manaGain ?? skill.manaGain,
          initialMana: confirmed?.initialMana ?? skill.initialMana,
          addSkillDefinitionId: confirmed?.addSkillDefinitionId,
          addSkillDefinitionIds: confirmed?.addSkillDefinitionIds ? [...confirmed.addSkillDefinitionIds] : undefined,
          addCardDefinitionId: confirmed?.addCardDefinitionId,
          addCardCount: confirmed?.addCardCount,
          addCardToHandDefinitionId: confirmed?.addCardToHandDefinitionId,
          activateSkillDefinitionId: confirmed?.activateSkillDefinitionId,
          activationTargetDefinitionId: confirmed?.activationTargetDefinitionId,
          playerFlags: confirmed?.playerFlags ? { ...confirmed.playerFlags } : undefined,
          basicCardPowerBonus: confirmed?.basicCardPowerBonus,
          basicCardPowerBonusAttributes: confirmed?.basicCardPowerBonusAttributes !== undefined
            ? [...confirmed.basicCardPowerBonusAttributes]
            : skill.basicCardPowerBonusAttributes !== undefined
              ? normalizeCardAttributes(skill.basicCardPowerBonusAttributes)
              : undefined,
          basicCardPowerBonusCondition: confirmed?.basicCardPowerBonusCondition ?? skill.basicCardPowerBonusCondition,
          playerDefeatIgnoreCondition: confirmed?.playerDefeatIgnoreCondition ?? skill.playerDefeatIgnoreCondition,
          protectsControllerCardsFromOpponents: confirmed?.protectsControllerCardsFromOpponents ?? skill.protectsControllerCardsFromOpponents,
          activeOwnedCardAttributeGrant: confirmed?.activeOwnedCardAttributeGrant
            ? { targetDefinitionIds: [...confirmed.activeOwnedCardAttributeGrant.targetDefinitionIds], attributes: [...confirmed.activeOwnedCardAttributeGrant.attributes] }
            : skill.activeOwnedCardAttributeGrant
              ? { targetDefinitionIds: [...skill.activeOwnedCardAttributeGrant.targetDefinitionIds], attributes: normalizeCardAttributes(skill.activeOwnedCardAttributeGrant.attributes) }
              : undefined,
          globalActiveCardAttributeGrant: confirmed?.globalActiveCardAttributeGrant
            ? { targetDefinitionIds: [...confirmed.globalActiveCardAttributeGrant.targetDefinitionIds], attributes: [...confirmed.globalActiveCardAttributeGrant.attributes] }
            : skill.globalActiveCardAttributeGrant
              ? { targetDefinitionIds: [...skill.globalActiveCardAttributeGrant.targetDefinitionIds], attributes: normalizeCardAttributes(skill.globalActiveCardAttributeGrant.attributes) }
              : undefined,
          linkedPlayerSameBattlefieldAttributeTransform: confirmed?.linkedPlayerSameBattlefieldAttributeTransform
            ? {
                playerFlag: confirmed.linkedPlayerSameBattlefieldAttributeTransform.playerFlag,
                removeAttributes: confirmed.linkedPlayerSameBattlefieldAttributeTransform.removeAttributes ? [...confirmed.linkedPlayerSameBattlefieldAttributeTransform.removeAttributes] : undefined,
                addAttributes: confirmed.linkedPlayerSameBattlefieldAttributeTransform.addAttributes ? [...confirmed.linkedPlayerSameBattlefieldAttributeTransform.addAttributes] : undefined,
              }
            : undefined,
          basePower: confirmed?.basePower ?? skill.basePower ?? undefined,
          basePowerFormula: confirmed?.basePowerFormula ?? skill.basePowerFormula,
          typeLabel: confirmed?.typeLabel ?? skill.typeLabel,
          attributes: confirmed?.attributes !== undefined
            ? [...confirmed.attributes]
            : skill.attributes !== undefined
            ? normalizeCardAttributes(skill.attributes)
            : getCardAttributes({ typeLabel: confirmed?.typeLabel ?? skill.typeLabel ?? "" }),
          steps: (confirmed?.steps ?? skill.activation?.steps ?? []).filter((step): step is PhaseStepId => ["player-window", "move-decision", "play-batch-draft", "play-batch-commit", "post-power-response", "settlement"].includes(step)),
          requirement: confirmed?.requirement ?? skill.requirement ?? undefined,
          // Copy only explicit authored card wording. These flags describe
          // legality and do not imply that the effect handler is complete.
          requiresEightMana: confirmed?.requiresEightMana ?? skill.requiresEightMana ?? inferred.requiresEightMana,
          eightManaWaiverMaxPrintedBasePower: confirmed?.eightManaWaiverMaxPrintedBasePower ?? skill.eightManaWaiverMaxPrintedBasePower,
          lowManaSkillPlaySurcharge: confirmed?.lowManaSkillPlaySurcharge,
          maxManaExclusive: confirmed?.maxManaExclusive,
          hiddenTrueNameCostReduction: confirmed?.hiddenTrueNameCostReduction,
          situationForbiddenAttributeCostReduction: confirmed?.situationForbiddenAttributeCostReduction,
          otherPlayersIgnoreSituationEffects: confirmed?.otherPlayersIgnoreSituationEffects,
          ignoresSituationRestrictions: confirmed?.ignoresSituationRestrictions ?? skill.ignoresSituationRestrictions,
          text,
          sourceRefs: skill.sourceRefs
            ?? (ownerType === "servant" ? toSkillSources(getEnglishServantSource(owner.id)) : undefined)
            ?? (skill.legacyId ? [{ kind: "legacy", document: "legacy-content.json", locator: `${ownerType}/${owner.id}/${skill.legacyId}` }] : undefined),
          supportLevel: confirmed?.supportLevel ?? parsedSupport ?? toSupportLevel(skill.implementation),
          handlerId: confirmed?.handlerId ?? skill.handlerId ?? parsedHandler,
          tags: confirmed?.tags ?? skill.tags,
          limit: confirmed?.limit ?? (confirmed?.suppressInferredLimit || skill.suppressInferredLimit ? undefined : skill.limit ?? inferUsageLimit(skill.text ?? "")),
          requiresTrueName: confirmed?.requiresTrueName ?? skill.requiresTrueName,
          revealsTrueNameOnPlay: confirmed?.revealsTrueNameOnPlay === false
            ? false
            : confirmedRevealsTrueNameOnPlay
              ? true
              : confirmedRuntime?.revealsTrueNameOnPlay
            ?? (skill.revealsTrueNameOnPlay === false ? false : undefined)
            ?? /^\s*【真名解放】/.test(text),
          revealsTrueNameOnSkillUse: confirmedRuntime?.revealsTrueNameOnSkillUse
            ?? skill.revealsTrueNameOnSkillUse
            ?? /被动[／/][^\n]*【真名解放】/.test(skill.text ?? ""),
          requiresHiddenTrueName: skill.requiresHiddenTrueName,
          hasReversalEffect: confirmed?.hasReversalEffect
            ?? skill.hasReversalEffect
            ?? /(?:^|\n)\s*反转(?:[／/：:]|\s*[-—])/.test(skill.text ?? ""),
          revealsTrueNameOnReverse: confirmed?.revealsTrueNameOnReverse ?? skill.revealsTrueNameOnReverse,
          alterEgoCloseSource: confirmed?.alterEgoCloseSource,
          playDrawIfWithBasicAttack: confirmed?.playDrawIfWithBasicAttack ?? skill.playDrawIfWithBasicAttack,
          appendFromHand: confirmed?.appendFromHand ?? skill.appendFromHand ?? inferred.appendFromHand,
          singleCardPlay: confirmed?.singleCardPlay ?? skill.singleCardPlay ?? inferred.singleCardPlay,
          roundExclusivePlay: confirmed?.roundExclusivePlay,
          standardAppend: confirmed?.standardAppend ?? inferred.standardAppend,
          standardAppendIfBoardDefinitionAtControllerLocation: confirmed?.standardAppendIfBoardDefinitionAtControllerLocation ? [...confirmed.standardAppendIfBoardDefinitionAtControllerLocation] : undefined,
          basePowerPerSameLocationOpponent: confirmed?.basePowerPerSameLocationOpponent,
          basePowerZeroIfBoardDefinitionAtControllerLocation: confirmed?.basePowerZeroIfBoardDefinitionAtControllerLocation ? [...confirmed.basePowerZeroIfBoardDefinitionAtControllerLocation] : undefined,
          standardAppendRequiresOwnedSkillId: confirmed?.standardAppendRequiresOwnedSkillId,
          standardAppendStackGroup: confirmed?.standardAppendStackGroup,
          standardAppendRequiresBatchCards: confirmed?.standardAppendRequiresBatchCards ? structuredClone(confirmed.standardAppendRequiresBatchCards) : undefined,
          faceDownAttackFollowup: confirmed?.faceDownAttackFollowup ? { ...confirmed.faceDownAttackFollowup } : undefined,
          uniqueGroup: confirmed?.uniqueGroup ?? skill.uniqueGroup,
          requiresActiveCard: confirmed?.requiresActiveCard ?? skill.requiresActiveCard ?? (ownerType === "servant" && ["phase", "residual"].includes(activation)),
          abilities: confirmed?.abilities,
          cardAbilityIds: confirmed?.cardAbilityIds ? [...confirmed.cardAbilityIds] : undefined,
          cardAbilityPhases: confirmed?.cardAbilityPhases ? [...confirmed.cardAbilityPhases] : undefined,
          passiveEventTypes: confirmed?.passiveEventTypes ?? skill.passiveEventTypes,
          combatPowerZeroAttribute: confirmed?.combatPowerZeroAttribute,
          combatPowerBonus: confirmed?.combatPowerBonus,
          combatPowerBonusIfMoveImpossible: confirmed?.combatPowerBonusIfMoveImpossible,
          combatPowerBonusFromBattlefieldPlayedCosts: confirmed?.combatPowerBonusFromBattlefieldPlayedCosts,
          combatPowerBonusPerCommandSealUser: confirmed?.combatPowerBonusPerCommandSealUser,
          highVictoryCombatPowerRule: confirmed?.highVictoryCombatPowerRule,
          opponentBonusPerCostlyAttack: confirmed?.opponentBonusPerCostlyAttack,
          opponentAttackPowerModifier: confirmed?.opponentAttackPowerModifier,
          eventCardPowerBonus: confirmed?.eventCardPowerBonus,
          markedDefeatVictoryPointReward: confirmed?.markedDefeatVictoryPointReward,
          variableManaPowerBonusMax: confirmed?.variableManaPowerBonusMax,
          revealHandUntilRoundEnd: confirmed?.revealHandUntilRoundEnd,
          combatStartDrawCount: confirmed?.combatStartDrawCount,
          revealHandPowerBonus: confirmed?.revealHandPowerBonus,
          requiresBattlefieldLocation: confirmed?.requiresBattlefieldLocation,
          roundEndLoseAllManaUnlessPlayedSelf: confirmed?.roundEndLoseAllManaUnlessPlayedSelf,
          combatHistory: confirmed?.combatHistory,
          roundEndVictoryPointLoss: confirmed?.roundEndVictoryPointLoss,
          roundEndLocationId: confirmed?.roundEndLocationId,
          roundEndManaGain: confirmed?.roundEndManaGain,
          derivedAttackBatch: confirmed?.derivedAttackBatch
            ? { count: confirmed.derivedAttackBatch.count, definitionIds: [...confirmed.derivedAttackBatch.definitionIds] }
            : undefined,
          attachedSupplyAppend: confirmed?.attachedSupplyAppend
            ? {
              definitionIds: [...confirmed.attachedSupplyAppend.definitionIds],
              drawAfterAppend: confirmed.attachedSupplyAppend.drawAfterAppend,
              sourceEvent: confirmed.attachedSupplyAppend.sourceEvent,
            }
            : skill.attachedSupplyAppend
              ? {
                definitionIds: [...skill.attachedSupplyAppend.definitionIds],
                drawAfterAppend: skill.attachedSupplyAppend.drawAfterAppend,
                sourceEvent: skill.attachedSupplyAppend.sourceEvent,
              }
              : undefined,
          activeAttackLifecycleBoost: confirmed?.activeAttackLifecycleBoost
            ? { ...confirmed.activeAttackLifecycleBoost }
            : skill.activeAttackLifecycleBoost
              ? {
                residualAbilityId: skill.activeAttackLifecycleBoost.residualAbilityId,
                boostAbilityId: skill.activeAttackLifecycleBoost.boostAbilityId,
                residualRoundOffset: skill.activeAttackLifecycleBoost.residualRoundOffset,
                boostAttribute: normalizeCardAttributes([skill.activeAttackLifecycleBoost.boostAttribute])[0],
                boostPower: skill.activeAttackLifecycleBoost.boostPower,
              }
              : undefined,
          opponentCombatPowerBonus: confirmed?.opponentCombatPowerBonus,
          moveForwardSteps: confirmed?.moveForwardSteps,
          opponentRequiresNoDeploymentBonus: confirmed?.opponentRequiresNoDeploymentBonus,
          opponentRequiresNoCommandSealThisRound: confirmed?.opponentRequiresNoCommandSealThisRound,
          defeatScope: confirmed?.defeatScope,
          closeActiveAndActivateHiddenDefinitionId: confirmed?.closeActiveAndActivateHiddenDefinitionId,
          doubleDeploymentBonus: confirmed?.doubleDeploymentBonus,
          unoccupiedTerrainLocations: confirmed?.unoccupiedTerrainLocations,
          defeatEngagedOpponentsIfMoreActiveAttacks: confirmed?.defeatEngagedOpponentsIfMoreActiveAttacks,
          manaThresholdVictoryPointLoss: confirmed?.manaThresholdVictoryPointLoss,
          rashomonGrudge: confirmed?.rashomonGrudge,
          elizabethVolumePower: confirmed?.elizabethVolumePower,
          elizabethVocalPerformance: confirmed?.elizabethVocalPerformance,
          elizabethVolumeLossOnCombatLoss: confirmed?.elizabethVolumeLossOnCombatLoss,
          elizabethIronMaiden: confirmed?.elizabethIronMaiden,
          effects: parsedEffects.effects,
          unparsedEffects: parsedEffects.unparsed,
          clauses: parsedEffects.clauses,
          rules: confirmed?.rules
            ? structuredClone(confirmed.rules)
            : skill.rules
              ? structuredClone(skill.rules)
              : undefined,
        } satisfies SkillDefinition;
        definition.ruleProgram = buildSkillRuleProgram(definition);
        result.push(definition);
      }
    }
  }
  return result;
}

function toSkillSources(source: ReturnType<typeof getEnglishServantSource>): SkillSourceRef[] | undefined {
  if (!source) return undefined;
  return [{
    kind: source.kind,
    document: source.document,
    category: source.category,
    page: source.page,
    locator: `从者/${source.className}/英文版/${source.page}`,
  }];
}

function toSupportLevel(value: string | undefined): "FULL" | "PARTIAL" | "MANUAL" | "DISABLED" {
  if (value === "implemented") return "FULL";
  if (value === "pending") return "PARTIAL";
  if (value === "disabled") return "DISABLED";
  return "MANUAL";
}

function inferUsageLimit(text: string): "once-per-game" | "twice-per-game" | "once-per-round" | "once-per-turn" | undefined {
  if (/每局游戏限(?:两次|2次)/.test(text)) return "twice-per-game";
  if (/每局游戏限(?:一次|1次)/.test(text)) return "once-per-game";
  if (/每回合限(?:一次|1次)/.test(text)) return "once-per-round";
  if (/每回合只能(?:进行|使用|发动)(?:一次|1次)/.test(text)) return "once-per-round";
  return undefined;
}

/**
 * A deliberately narrow promotion gate for the generic effect handler.  It
 * only accepts phase/optional-trigger cards whose complete authored text is
 * represented by deterministic effect specs.  Any choice, target, movement,
 * lifecycle, derived-card or conditional clause keeps the skill PARTIAL.
 */
function canUseParsedEffectsAsSkill(
  activation: SkillDefinition["activation"],
  parsed: ReturnType<typeof parseSkillEffects>,
  text: string,
): boolean {
  if (activation !== "phase" && activation !== "optional-trigger") return false;
  if (parsed.effects.length === 0 || parsed.unparsed.length > 0) return false;
  if (/(?:若|如果|当|每当|可以|可令|选择|查看|弃置|关闭|加入|移动|无法|不能|改为|翻倍|随机|任意|至多|展示)/.test(text)) return false;
  return parsed.clauses.every((clause) => !clause.hasChoice && !clause.hasDerivedCard && !clause.hasLifecycle);
}

function inferDrawOnPlay(text: string): number | undefined {
  const match = /打出时[:：]\s*抽(一|二|两|三|四|五|六|七|八|九|十|\d+)张牌/.exec(text);
  if (!match) return undefined;
  const values: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  return values[match[1]] ?? Number(match[1]);
}

function inferReturnToDeckOnDefeat(text: string): boolean | undefined {
  return /(?:若|当)你(?:战败|败北)[^。\n]*此牌[^。\n]*(?:洗回|返回).*牌库/.test(text) ? true : undefined;
}

interface InferredCardMetadata {
  requiresEightMana?: boolean;
  appendFromHand?: AppendFromHandRule;
  singleCardPlay?: boolean;
  standardAppend?: boolean;
}

/**
 * Extracts only unambiguous card-play constraints written on the card. The
 * effect body remains untouched, so a partial effect cannot be promoted by
 * this metadata pass.
 */
function inferExplicitCardMetadata(text: string): InferredCardMetadata {
  const metadata: InferredCardMetadata = {};
  if (/魔力少于8点也可(?:使用|打出)/.test(text)) metadata.requiresEightMana = false;
  if (/不能同其他牌一起打出|本回合打出唯一的一张牌/.test(text)) metadata.singleCardPlay = true;
  if (/此牌需追加打出|此牌为追加打出/.test(text)) metadata.standardAppend = true;
  const append = /从手牌中?追加打出至多(\d+)张(?:基本威力(\d+)及以下的)?牌/.exec(text);
  if (append) {
    metadata.appendFromHand = {
      maxCount: Number(append[1]),
      maxBasePower: append[2] ? Number(append[2]) : Number.MAX_SAFE_INTEGER,
    };
  }
  return metadata;
}
