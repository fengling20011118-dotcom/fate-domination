import type { EventGroupDefinition, EventDefinition, CardDefinition, SituationDefinition } from "../rules-core/content-types.ts";
import type { StandardContent } from "../match-engine/standard-match-engine.ts";
import { normalizeCardAttributes } from "../rules-core/content-types.ts";
import { buildSkillDefinitions } from "./skill-package.ts";
import { SkillRegistry } from "../rules-core/skill-registry.ts";
import { THREE_X_MASTER_RATINGS } from "./three-x-ratings.ts";

export interface LegacyContentPackage {
  masters?: Array<{ id: string; initialMana?: number; skills?: Array<Record<string, unknown>> }>;
  cards?: Array<Record<string, unknown>>;
  situations?: Array<Record<string, unknown>>;
  eventGroups?: Array<{ id: string; name: string; cards: Array<Record<string, unknown>>; persistent?: boolean }>;
  servants?: Array<{ id: string; deck?: string[]; skills?: Array<Record<string, unknown>> }>;
}

/** Converts the imported content package into the runtime's typed, immutable input shape. */
export function buildStandardContent(raw: LegacyContentPackage): StandardContent {
  const cards: Record<string, CardDefinition> = {};
  for (const rawCard of raw.cards ?? []) {
    const id = String(rawCard.id);
    cards[id] = {
      id,
      name: String(rawCard.name ?? id),
      cost: Number(rawCard.cost ?? 0),
      basePower: Number(rawCard.basePower ?? 0),
      typeLabel: String(rawCard.typeLabel ?? "特殊"),
      attributes: Array.isArray(rawCard.attributes)
        ? normalizeCardAttributes(rawCard.attributes.map(String))
        : undefined,
      basic: typeof rawCard.basic === "boolean" ? rawCard.basic : inferBasicCard(rawCard),
      isSkill: Boolean(rawCard.isSkill),
      skillOwnerType: rawCard.skillOwnerType === "master" || rawCard.skillOwnerType === "servant" ? rawCard.skillOwnerType : undefined,
      requiresEightMana: Boolean(rawCard.requirement && Number(rawCard.requirement) >= 8),
      ignoresSituationRestrictions: rawCard.ignoresSituationRestrictions === true,
      residual: Boolean(rawCard.residual),
      limit: inferUsageLimit(typeof rawCard.text === "string" ? rawCard.text : ""),
      requiresTrueName: rawCard.requiresTrueName === true,
      revealsTrueNameOnPlay: rawCard.revealsTrueNameOnPlay === true,
      requiresHiddenTrueName: rawCard.requiresHiddenTrueName === true,
      playDrawIfWithBasicAttack: Number.isInteger(rawCard.playDrawIfWithBasicAttack) ? Number(rawCard.playDrawIfWithBasicAttack) : undefined,
      drawOnPlay: Number.isInteger(rawCard.drawOnPlay) ? Number(rawCard.drawOnPlay) : undefined,
      returnToDeckOnDefeat: rawCard.returnToDeckOnDefeat === true,
      appendFromHand: rawCard.appendFromHand && typeof rawCard.appendFromHand === "object"
        ? { maxCount: Number((rawCard.appendFromHand as Record<string, unknown>).maxCount), maxBasePower: Number((rawCard.appendFromHand as Record<string, unknown>).maxBasePower) }
        : undefined,
      singleCardPlay: rawCard.singleCardPlay === true,
      text: typeof rawCard.text === "string" ? rawCard.text : undefined,
    };
  }

  const situations: SituationDefinition[] = (raw.situations ?? []).map((item) => ({
    id: String(item.id),
    mana: Number(item.mana ?? 0),
    climax: Boolean(item.climax),
    text: typeof item.text === "string" ? item.text : undefined,
    eventPlacement: inferEventPlacement(String(item.id), typeof item.text === "string" ? item.text : ""),
    forbiddenAttributes: Array.isArray(item.forbiddenAttributes)
      ? normalizeCardAttributes(item.forbiddenAttributes.map(String))
      : inferForbiddenAttributes(typeof item.text === "string" ? item.text : ""),
  }));

  const events: EventDefinition[] = [];
  const eventGroups: EventGroupDefinition[] = [];
  for (const group of raw.eventGroups ?? []) {
    const eventIds: string[] = [];
    for (const item of group.cards ?? []) {
      const id = String(item.id);
      eventIds.push(id);
      events.push({
        id,
        locationId: item.locationId === "mountain" || item.locationId === "city" ? item.locationId : undefined,
        victoryPoints: Number(item.victoryPoints ?? 0),
        text: typeof item.text === "string" ? item.text : undefined,
      });
    }
    eventGroups.push({ id: String(group.id), name: String(group.name), eventIds, persistent: group.persistent });
  }

  const playerDecks: Record<string, string[]> = {};
  for (const servant of raw.servants ?? []) {
    const deck = [...(servant.deck ?? [])];
    for (const cardId of deck) {
      if (!cards[cardId]) throw new Error(`SERVANT_CARD_NOT_FOUND:${servant.id}:${cardId}`);
    }
    playerDecks[String(servant.id)] = deck;
  }
  const masterInitialMana: Record<string, number> = {};
  for (const master of raw.masters ?? []) {
    if (Number.isInteger(master.initialMana) && Number(master.initialMana) >= 0) masterInitialMana[String(master.id)] = Number(master.initialMana);
  }
  const skills = new SkillRegistry();
  for (const definition of buildSkillDefinitions(raw as Parameters<typeof buildSkillDefinitions>[0])) {
    skills.register(definition);
  }
  return Object.freeze({
    cards,
    situations,
    events,
    eventGroups,
    playerDecks,
    masterInitialMana,
    threeXMasterRatings: { ...THREE_X_MASTER_RATINGS },
    skills,
    ...((raw.masters ?? []).length ? { threeXMasterPool: (raw.masters ?? []).map((master) => String(master.id)) } : {}),
    ...((raw.servants ?? []).length ? { threeXServantPool: (raw.servants ?? []).map((servant) => String(servant.id)) } : {}),
  });
}

function inferBasicCard(rawCard: Record<string, unknown>): boolean | undefined {
  const name = String(rawCard.name ?? "");
  const text = String(rawCard.text ?? rawCard.desc ?? "");
  if (text === "基础攻击卡牌") return true;
  if (["幸运", "远隔操作", "急行"].includes(name)) return true;
  return undefined;
}

function inferForbiddenAttributes(text: string): string[] | undefined {
  const forbidden: string[] = [];
  if (/(?:禁止|无法)[^。\n]*(?:宝具|使用宝具)/.test(text) || /宝具[^。\n]*(?:禁止|无法使用)/.test(text)) forbidden.push("宝具");
  if (/(?:禁止|无法)[^。\n]*(?:特殊|使用特殊)/.test(text) || /特殊[^。\n]*(?:禁止|无法使用)/.test(text)) forbidden.push("特殊");
  return forbidden.length ? forbidden : undefined;
}

function inferUsageLimit(text: string): CardDefinition["limit"] {
  if (/每局游戏限(?:一次|两次|三次|一张|1次)/.test(text)) return "once-per-game";
  if (/每回合限(?:一次|1次)/.test(text)) return "once-per-round";
  return undefined;
}

function inferEventPlacement(id: string, text: string): { mountain: number; city: number } | undefined {
  // Imported legacy text is only used during migration; runtime uses this structured result.
  if (id.endsWith("sit2") || text.includes("于新都增加一张")) return { mountain: 0, city: 1 };
  if (id.endsWith("sit3") || text.includes("于深山町增加一张")) return { mountain: 1, city: 0 };
  if (id.endsWith("sit13") || text.includes("于深山町增加两张")) return { mountain: 2, city: 0 };
  if (id.endsWith("sit1") || id.endsWith("sit11") || text.includes("深山町和新都各增加一张")) return { mountain: 1, city: 1 };
  if (id.endsWith("sit12")) return { mountain: 1, city: 0 };
  return { mountain: 0, city: 0 };
}
