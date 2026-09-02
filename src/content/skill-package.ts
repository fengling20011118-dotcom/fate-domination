import type { SkillDefinition } from "../rules-core/skill-types.ts";
import type { PhaseStepId } from "../domain/state/types.ts";
import { getCardAttributes, normalizeCardAttributes } from "../rules-core/content-types.ts";
import { confirmedSkillOverrides } from "./confirmed-skill-overrides.ts";
import { getEnglishServantSource } from "./servant-source-index.ts";
import type { SkillSourceRef } from "../rules-core/skill-types.ts";
import { parseSkillEffects } from "../rules-core/skill-effects.ts";
import { buildSkillRuleProgram } from "../rules-core/skill-rule-program.ts";

interface RawSkill { id: string; legacyId?: string | null; name: string; typeLabel?: string; attributes?: string[]; cost?: number | null; abilityCost?: number | null; drawCount?: number; drawOnPlay?: number; returnToDeckOnDefeat?: boolean; preparationHandSize?: number; locationId?: string; manaGain?: number; initialMana?: number; requirement?: number | null; basePower?: number | null; text?: string; image?: string; sourceRefs?: SkillSourceRef[]; activation?: { kind?: string; windows?: string[]; steps?: string[] }; tags?: string[]; implementation?: string; handlerId?: string; passiveEventTypes?: string[]; limit?: "once-per-game" | "once-per-round" | "once-per-turn"; uniqueGroup?: string; requiresTrueName?: boolean; requiresEightMana?: boolean; ignoresSituationRestrictions?: boolean; revealsTrueNameOnPlay?: boolean; revealsTrueNameOnSkillUse?: boolean; requiresHiddenTrueName?: boolean; requiresActiveCard?: boolean; playDrawIfWithBasicAttack?: number; appendFromHand?: { maxCount: number; maxBasePower: number }; singleCardPlay?: boolean; }
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
        const definition = {
          id: skill.id,
          name: skill.name,
          ownerType,
          ownerId: owner.id,
          activation,
          windows: confirmed?.windows
            ? [...confirmed.windows]
            : (skill.activation?.windows ?? []).map(phase).filter((item): item is NonNullable<typeof item> => item !== null),
          cost: Number(skill.cost ?? 0),
          costRule: confirmed?.costRule,
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
          basePower: confirmed?.basePower ?? skill.basePower ?? undefined,
          typeLabel: skill.typeLabel,
          attributes: confirmed?.attributes !== undefined
            ? [...confirmed.attributes]
            : skill.attributes !== undefined
            ? normalizeCardAttributes(skill.attributes)
            : getCardAttributes({ typeLabel: skill.typeLabel ?? "" }),
          steps: (confirmed?.steps ?? skill.activation?.steps ?? []).filter((step): step is PhaseStepId => ["player-window", "move-decision", "play-batch-draft", "play-batch-commit", "post-power-response", "settlement"].includes(step)),
          requirement: skill.requirement ?? undefined,
          // Copy only explicit authored card wording. These flags describe
          // legality and do not imply that the effect handler is complete.
          requiresEightMana: confirmed?.requiresEightMana ?? skill.requiresEightMana ?? inferred.requiresEightMana,
          maxManaExclusive: confirmed?.maxManaExclusive,
          hiddenTrueNameCostReduction: confirmed?.hiddenTrueNameCostReduction,
          ignoresSituationRestrictions: confirmed?.ignoresSituationRestrictions ?? skill.ignoresSituationRestrictions,
          text: skill.text ?? "",
          sourceRefs: skill.sourceRefs
            ?? (ownerType === "servant" ? toSkillSources(getEnglishServantSource(owner.id)) : undefined)
            ?? (skill.legacyId ? [{ kind: "legacy", document: "legacy-content.json", locator: `${ownerType}/${owner.id}/${skill.legacyId}` }] : undefined),
          supportLevel: confirmed?.supportLevel ?? parsedSupport ?? toSupportLevel(skill.implementation),
          handlerId: confirmed?.handlerId ?? skill.handlerId ?? parsedHandler,
          tags: confirmed?.tags ?? skill.tags,
          limit: confirmed?.limit ?? skill.limit ?? inferUsageLimit(skill.text ?? ""),
          requiresTrueName: confirmed?.requiresTrueName ?? skill.requiresTrueName,
          revealsTrueNameOnPlay: confirmed?.revealsTrueNameOnPlay
            ?? skill.revealsTrueNameOnPlay
            ?? /^\s*【真名解放】/.test(skill.text ?? ""),
          revealsTrueNameOnSkillUse: skill.revealsTrueNameOnSkillUse
            ?? /被动[／/][^\n]*【真名解放】/.test(skill.text ?? ""),
          requiresHiddenTrueName: skill.requiresHiddenTrueName,
          hasReversalEffect: /(?:^|\n)\s*反转(?:[／/：:]|\s*[-—])/.test(skill.text ?? ""),
          playDrawIfWithBasicAttack: confirmed?.playDrawIfWithBasicAttack ?? skill.playDrawIfWithBasicAttack,
          appendFromHand: confirmed?.appendFromHand ?? skill.appendFromHand ?? inferred.appendFromHand,
          singleCardPlay: confirmed?.singleCardPlay ?? skill.singleCardPlay ?? inferred.singleCardPlay,
          standardAppend: confirmed?.standardAppend,
          uniqueGroup: confirmed?.uniqueGroup ?? skill.uniqueGroup,
          requiresActiveCard: confirmed?.requiresActiveCard ?? skill.requiresActiveCard ?? (ownerType === "servant" && ["phase", "residual"].includes(activation)),
          abilities: confirmed?.abilities,
          passiveEventTypes: confirmed?.passiveEventTypes ?? skill.passiveEventTypes,
          combatPowerZeroAttribute: confirmed?.combatPowerZeroAttribute,
          combatPowerBonus: confirmed?.combatPowerBonus,
          combatHistory: confirmed?.combatHistory,
          roundEndVictoryPointLoss: confirmed?.roundEndVictoryPointLoss,
          roundEndLocationId: confirmed?.roundEndLocationId,
          roundEndManaGain: confirmed?.roundEndManaGain,
          derivedAttackBatch: confirmed?.derivedAttackBatch
            ? { count: confirmed.derivedAttackBatch.count, definitionIds: [...confirmed.derivedAttackBatch.definitionIds] }
            : undefined,
          opponentCombatPowerBonus: confirmed?.opponentCombatPowerBonus,
          opponentRequiresNoDeploymentBonus: confirmed?.opponentRequiresNoDeploymentBonus,
          defeatScope: confirmed?.defeatScope,
          closeActiveAndActivateHiddenDefinitionId: confirmed?.closeActiveAndActivateHiddenDefinitionId,
          doubleDeploymentBonus: confirmed?.doubleDeploymentBonus,
          defeatEngagedOpponentsIfMoreActiveAttacks: confirmed?.defeatEngagedOpponentsIfMoreActiveAttacks,
          manaThresholdVictoryPointLoss: confirmed?.manaThresholdVictoryPointLoss,
          effects: parsedEffects.effects,
          unparsedEffects: parsedEffects.unparsed,
          clauses: parsedEffects.clauses,
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

function inferUsageLimit(text: string): "once-per-game" | "once-per-round" | "once-per-turn" | undefined {
  // Only infer a boolean one-use limit.  Two/three-use wording needs a
  // counted usage field and must not be silently reduced to once per game.
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
  const append = /从手牌中?追加打出至多(\d+)张(?:基本威力(\d+)及以下的)?牌/.exec(text);
  if (append) {
    metadata.appendFromHand = {
      maxCount: Number(append[1]),
      maxBasePower: append[2] ? Number(append[2]) : Number.MAX_SAFE_INTEGER,
    };
  }
  return metadata;
}
