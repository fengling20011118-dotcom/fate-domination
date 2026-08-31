import type { SkillDefinition } from "../rules-core/skill-types.ts";
import type { PhaseStepId } from "../domain/state/types.ts";
import { getCardAttributes, normalizeCardAttributes } from "../rules-core/content-types.ts";
import { confirmedSkillOverrides } from "./confirmed-skill-overrides.ts";
import { getEnglishServantSource } from "./servant-source-index.ts";
import type { SkillSourceRef } from "../rules-core/skill-types.ts";

interface RawSkill { id: string; legacyId?: string | null; name: string; typeLabel?: string; attributes?: string[]; cost?: number | null; abilityCost?: number | null; drawCount?: number; locationId?: string; manaGain?: number; requirement?: number | null; basePower?: number | null; text?: string; image?: string; sourceRefs?: SkillSourceRef[]; activation?: { kind?: string; windows?: string[]; steps?: string[] }; tags?: string[]; implementation?: string; handlerId?: string; passiveEventTypes?: string[]; limit?: "once-per-game" | "once-per-round" | "once-per-turn"; uniqueGroup?: string; requiresTrueName?: boolean; requiresEightMana?: boolean; ignoresSituationRestrictions?: boolean; revealsTrueNameOnPlay?: boolean; revealsTrueNameOnSkillUse?: boolean; requiresHiddenTrueName?: boolean; requiresActiveCard?: boolean; playDrawIfWithBasicAttack?: number; appendFromHand?: { maxCount: number; maxBasePower: number }; singleCardPlay?: boolean; }
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
        const activation = confirmed?.activation ?? (skill.activation?.kind === "passive"
          ? "passive"
          : skill.activation?.kind === "residual"
            ? "residual"
          : skill.activation?.kind === "optional-trigger"
            ? "optional-trigger"
            : skill.activation?.kind === "play"
              ? "play"
              : "phase");
        result.push({
          id: skill.id,
          name: skill.name,
          ownerType,
          ownerId: owner.id,
          activation,
          windows: (skill.activation?.windows ?? []).map(phase).filter((item): item is NonNullable<typeof item> => item !== null),
          cost: Number(skill.cost ?? 0),
          costRule: confirmed?.costRule,
          abilityCost: Number(confirmed?.abilityCost ?? skill.abilityCost ?? 0),
          drawCount: confirmed?.drawCount ?? skill.drawCount,
          locationId: confirmed?.locationId ?? skill.locationId,
          manaGain: confirmed?.manaGain ?? skill.manaGain,
          basePower: skill.basePower ?? undefined,
          typeLabel: skill.typeLabel,
          attributes: confirmed?.attributes !== undefined
            ? [...confirmed.attributes]
            : skill.attributes !== undefined
            ? normalizeCardAttributes(skill.attributes)
            : getCardAttributes({ typeLabel: skill.typeLabel ?? "" }),
          steps: (confirmed?.steps ?? skill.activation?.steps ?? []).filter((step): step is PhaseStepId => ["player-window", "move-decision", "play-batch-draft", "play-batch-commit", "post-power-response", "settlement"].includes(step)),
          requirement: skill.requirement ?? undefined,
          requiresEightMana: confirmed?.requiresEightMana ?? skill.requiresEightMana,
          ignoresSituationRestrictions: confirmed?.ignoresSituationRestrictions ?? skill.ignoresSituationRestrictions,
          text: skill.text ?? "",
          sourceRefs: skill.sourceRefs
            ?? (ownerType === "servant" ? toSkillSources(getEnglishServantSource(owner.id)) : undefined)
            ?? (skill.legacyId ? [{ kind: "legacy", document: "legacy-content.json", locator: `${ownerType}/${owner.id}/${skill.legacyId}` }] : undefined),
          supportLevel: confirmed?.supportLevel ?? toSupportLevel(skill.implementation),
          handlerId: confirmed?.handlerId ?? skill.handlerId,
          tags: confirmed?.tags ?? skill.tags,
          limit: confirmed?.limit ?? skill.limit ?? inferUsageLimit(skill.text ?? ""),
          requiresTrueName: confirmed?.requiresTrueName ?? skill.requiresTrueName,
          revealsTrueNameOnPlay: confirmed?.revealsTrueNameOnPlay
            ?? skill.revealsTrueNameOnPlay
            ?? /^\s*【真名解放】/.test(skill.text ?? ""),
          revealsTrueNameOnSkillUse: skill.revealsTrueNameOnSkillUse
            ?? /被动[／/][^\n]*【真名解放】/.test(skill.text ?? ""),
          requiresHiddenTrueName: skill.requiresHiddenTrueName,
          playDrawIfWithBasicAttack: confirmed?.playDrawIfWithBasicAttack ?? skill.playDrawIfWithBasicAttack,
          appendFromHand: confirmed?.appendFromHand ?? skill.appendFromHand,
          singleCardPlay: confirmed?.singleCardPlay ?? skill.singleCardPlay,
          uniqueGroup: confirmed?.uniqueGroup ?? skill.uniqueGroup,
          requiresActiveCard: confirmed?.requiresActiveCard ?? skill.requiresActiveCard ?? (ownerType === "servant" && ["phase", "residual"].includes(activation)),
          abilities: confirmed?.abilities,
          passiveEventTypes: confirmed?.passiveEventTypes ?? skill.passiveEventTypes,
          combatPowerZeroAttribute: confirmed?.combatPowerZeroAttribute,
        });
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
  if (/每局游戏限(?:一次|两次|三次|一张|1次)/.test(text)) return "once-per-game";
  if (/每回合限(?:一次|1次)/.test(text)) return "once-per-round";
  return undefined;
}
