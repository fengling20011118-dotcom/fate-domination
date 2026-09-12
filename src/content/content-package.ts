import type { EventGroupDefinition, EventDefinition, CardDefinition, SituationDefinition } from "../rules-core/content-types.ts";
import type { StandardContent } from "../match-engine/standard-match-engine.ts";
import { normalizeCardAttributes } from "../rules-core/content-types.ts";
import { buildSkillDefinitions } from "./skill-package.ts";
import { SkillRegistry } from "../rules-core/skill-registry.ts";
import { THREE_X_MASTER_RATINGS } from "./three-x-ratings.ts";
import { assertDeckDefinition, createDeckDefinition, type DeckDefinition } from "../rules-core/deck-definitions.ts";
import { baseCardRuleOverrides } from "./base-card-rules.ts";
import { LOSTBELT_SPECIAL_EVENT_POOLS } from "./lostbelt-objectives.ts";
import { GOETIA_DEMON_GOD_CARDS } from "./goetia-cards.ts";
import { MIYU_CARD_DEFINITIONS } from "./miyu-cards.ts";

export interface LegacyContentPackage {
  masters?: Array<{ id: string; initialMana?: number; skills?: Array<Record<string, unknown>> }>;
  cards?: Array<Record<string, unknown>>;
  situations?: Array<Record<string, unknown>>;
  eventGroups?: Array<{ id: string; name: string; cards: Array<Record<string, unknown>>; persistent?: boolean }>;
  civilizationRuins?: Array<Record<string, unknown>>;
  servants?: Array<{ id: string; class?: string; deck?: string[]; skills?: Array<Record<string, unknown>> }>;
}

const CONFIRMED_PLAY_POWER_BONUSES: Readonly<Record<string, number>> = Object.freeze({
  "card.x-commanderortlinde": 2,
  "card.x-commanderhildr": 3,
  "card.x-commanderthrud": 6,
});

/** Explicit event-card attribute references used by rules such as Gawain's Challenge. */
const CONFIRMED_EVENT_MENTIONED_ATTRIBUTES: Readonly<Record<string, NonNullable<EventDefinition["mentionedAttributes"]>>> = Object.freeze({
  "event.fuyuki.4": ["魔术"],
  "event.fuyuki.5": ["迅捷"],
  "event.fuyuki.6": ["力量"],
  "event.fuyuki.10": ["力量"],
  "event.fuyuki.11": ["魔术"],
  "event.fuyuki.12": ["迅捷"],
  "event.fuyuki.17": ["特殊"],
  "event.fuyuki.18": ["特殊"],
  "event.civilization-ruins.1": ["迅捷"],
  "event.civilization-ruins.2": ["力量"],
});

/** Explicit Situation-card attribute references used by rules that inspect the active Situation. */
const CONFIRMED_SITUATION_MENTIONED_ATTRIBUTES: Readonly<Record<string, NonNullable<SituationDefinition["mentionedAttributes"]>>> = Object.freeze({
  "situation.sit4": ["力量"],
  "situation.sit5": ["迅捷"],
  "situation.sit6": ["魔术"],
  "situation.sit7": ["魔术", "宝具"],
  "situation.sit8": ["迅捷", "宝具"],
  "situation.sit9": ["力量", "宝具"],
});

/** Event-card combat modifiers with stable IDs; display text is never parsed at runtime. */
const CONFIRMED_EVENT_COMBAT_POWER: Readonly<Record<string, NonNullable<EventDefinition["combatPower"]>>> = Object.freeze({
  "event.fuyuki.4": { cardAddByAttribute: { 魔术: 3 } },
  "event.fuyuki.5": { cardAddByAttribute: { 迅捷: 3 } },
  "event.fuyuki.6": { cardAddByAttribute: { 力量: 3 } },
  "event.fuyuki.10": { cardAddByAttribute: { 力量: 2 } },
  "event.fuyuki.11": { cardAddByAttribute: { 魔术: 2 } },
  "event.fuyuki.12": { cardAddByAttribute: { 迅捷: 2 } },
  "event.civilization-ruins.1": { cardAddByAttributeWhenPrintedBasePowerAtLeast: { min: 5, addByAttribute: { 迅捷: 4 } } },
  "event.civilization-ruins.2": { cardAddByAttributeWhenPrintedBasePowerAtLeast: { min: 5, addByAttribute: { 力量: 4 } } },
});

/** Converts the imported content package into the runtime's typed, immutable input shape. */
export function buildStandardContent(raw: LegacyContentPackage): StandardContent {
  const cards: Record<string, CardDefinition> = {};
  for (const rawCard of raw.cards ?? []) {
    const id = String(rawCard.id);
    const baseRule = baseCardRuleOverrides[id];
    cards[id] = {
      id,
      version: Number(rawCard.version ?? 1),
      name: String(rawCard.name ?? id),
      cardType: rawCard.cardType === "skill" || rawCard.cardType === "event" || rawCard.cardType === "situation" || rawCard.cardType === "attack"
        ? rawCard.cardType
        : rawCard.isSkill ? "skill" : "attack",
      ownerType: rawCard.ownerType === "master" || rawCard.ownerType === "servant" || rawCard.ownerType === "common"
        ? rawCard.ownerType
        : rawCard.skillOwnerType === "master" || rawCard.skillOwnerType === "servant" ? rawCard.skillOwnerType : "common",
      ownerDefinitionId: typeof rawCard.ownerDefinitionId === "string" ? rawCard.ownerDefinitionId : undefined,
      linkedSkillId: typeof rawCard.linkedSkillId === "string" ? rawCard.linkedSkillId : baseRule?.linkedSkillId,
      cost: Number(rawCard.cost ?? 0),
      basePower: Number(rawCard.basePower ?? 0),
      typeLabel: String(rawCard.typeLabel ?? "特殊"),
      attributes: Array.isArray(rawCard.attributes)
        ? normalizeCardAttributes(rawCard.attributes.map(String))
        : undefined,
      basic: typeof rawCard.basic === "boolean" ? rawCard.basic : inferBasicCard(rawCard),
      playPowerBonus: Number.isInteger(rawCard.playPowerBonus)
        ? Number(rawCard.playPowerBonus)
        : CONFIRMED_PLAY_POWER_BONUSES[id],
      basicCardPowerBonus: Number.isFinite(rawCard.basicCardPowerBonus) ? Number(rawCard.basicCardPowerBonus) : undefined,
      basicCardPowerBonusAttributes: Array.isArray(rawCard.basicCardPowerBonusAttributes)
        ? normalizeCardAttributes(rawCard.basicCardPowerBonusAttributes.map(String))
        : undefined,
      isSkill: Boolean(rawCard.isSkill),
      skillOwnerType: rawCard.skillOwnerType === "master" || rawCard.skillOwnerType === "servant" ? rawCard.skillOwnerType : undefined,
      requiresEightMana: Boolean(rawCard.requirement && Number(rawCard.requirement) >= 8),
      maxManaExclusive: Number.isInteger(rawCard.maxManaExclusive) ? Number(rawCard.maxManaExclusive) : undefined,
      ignoresSituationRestrictions: rawCard.ignoresSituationRestrictions === true,
      residual: typeof rawCard.residual === "boolean" ? rawCard.residual : (baseRule?.residual ?? false),
      hasReversalEffect: rawCard.hasReversalEffect === true || baseRule?.hasReversalEffect === true,
      limit: baseRule?.limit ?? inferUsageLimit(typeof rawCard.text === "string" ? rawCard.text : ""),
      requiresTrueName: rawCard.requiresTrueName === true,
      revealsTrueNameOnPlay: rawCard.revealsTrueNameOnPlay === true,
      requiresHiddenTrueName: rawCard.requiresHiddenTrueName === true,
      playDrawIfWithBasicAttack: Number.isInteger(rawCard.playDrawIfWithBasicAttack) ? Number(rawCard.playDrawIfWithBasicAttack) : undefined,
      drawOnPlay: Number.isInteger(rawCard.drawOnPlay) ? Number(rawCard.drawOnPlay) : baseRule?.drawOnPlay,
      returnToDeckOnDefeat: rawCard.returnToDeckOnDefeat === true || baseRule?.returnToDeckOnDefeat === true,
      tags: [...new Set([...(inferCardTags(rawCard) ?? []), ...(baseRule?.tags ?? [])])],
      alternativePlayCost: rawCard.alternativePlayCost && typeof rawCard.alternativePlayCost === "object"
        ? { resource: "victory-points", amount: Number((rawCard.alternativePlayCost as Record<string, unknown>).amount) }
        : undefined,
      appendFromHand: rawCard.appendFromHand && typeof rawCard.appendFromHand === "object"
        ? { maxCount: Number((rawCard.appendFromHand as Record<string, unknown>).maxCount), maxBasePower: Number((rawCard.appendFromHand as Record<string, unknown>).maxBasePower) }
        : undefined,
      singleCardPlay: rawCard.singleCardPlay === true,
      standardAppend: baseRule?.standardAppend,
      uniqueGroup: baseRule?.uniqueGroup,
      playAdjustmentFromActiveSource: baseRule?.playAdjustmentFromActiveSource
        ? structuredClone(baseRule.playAdjustmentFromActiveSource)
        : undefined,
      text: typeof rawCard.text === "string" ? rawCard.text : undefined,
      phases: baseRule?.phases ? [...baseRule.phases] : undefined,
      steps: baseRule?.steps ? [...baseRule.steps] : undefined,
      cardAbilityIds: baseRule?.cardAbilityIds ? [...baseRule.cardAbilityIds] : undefined,
      combatWinVictoryPoints: baseRule?.combatWinVictoryPoints,
      activeOtherAttackPowerBonus: baseRule?.activeOtherAttackPowerBonus,
      closeAfterControllerDefeatsOtherPlayer: baseRule?.closeAfterControllerDefeatsOtherPlayer,
      linkedOwnerDefeatIgnore: baseRule?.linkedOwnerDefeatIgnore,
      linkedOwnerCombatPowerMaximum: baseRule?.linkedOwnerCombatPowerMaximum,
      closeIfLinkedOwnerAbsentFromCombat: baseRule?.closeIfLinkedOwnerAbsentFromCombat,
      returnToOwnerHandOnOwnerCombatLoss: baseRule?.returnToOwnerHandOnOwnerCombatLoss,
      ownerConditionalBasePowerMultiplier: baseRule?.ownerConditionalBasePowerMultiplier
        ? structuredClone(baseRule.ownerConditionalBasePowerMultiplier)
        : undefined,
      implementation: rawCard.implementation && typeof rawCard.implementation === "object"
        ? {
            level: String((rawCard.implementation as Record<string, unknown>).level ?? "PARTIAL") as NonNullable<CardDefinition["implementation"]>["level"],
            handlerId: typeof (rawCard.implementation as Record<string, unknown>).handlerId === "string"
              ? String((rawCard.implementation as Record<string, unknown>).handlerId)
              : undefined,
          }
        : { level: "PARTIAL" },
      presentation: {
        imageKey: typeof rawCard.image === "string" ? rawCard.image : undefined,
        cardBackKey: typeof rawCard.cardBackKey === "string" ? rawCard.cardBackKey : undefined,
      },
      sourceRefs: Array.isArray(rawCard.sourceRefs) ? rawCard.sourceRefs as CardDefinition["sourceRefs"] : undefined,
      rules: rawCard.rules && typeof rawCard.rules === "object" ? structuredClone(rawCard.rules) as CardDefinition["rules"] : undefined,
    };
  }
  for (const definition of [...GOETIA_DEMON_GOD_CARDS, ...MIYU_CARD_DEFINITIONS]) {
    if (cards[definition.id]) throw new Error(`DUPLICATE_CARD_DEFINITION:${definition.id}`);
    cards[definition.id] = structuredClone(definition);
  }

  const situations: SituationDefinition[] = (raw.situations ?? []).map((item) => ({
    id: String(item.id),
    mana: Number(item.mana ?? 0),
    climax: Boolean(item.climax),
    mentionedAttributes: CONFIRMED_SITUATION_MENTIONED_ATTRIBUTES[String(item.id)]
      ? [...CONFIRMED_SITUATION_MENTIONED_ATTRIBUTES[String(item.id)]]
      : undefined,
    text: typeof item.text === "string" ? item.text : undefined,
    eventPlacement: inferEventPlacement(String(item.id), typeof item.text === "string" ? item.text : ""),
    forbiddenAttributes: Array.isArray(item.forbiddenAttributes)
      ? normalizeCardAttributes(item.forbiddenAttributes.map(String))
      : inferForbiddenAttributes(typeof item.text === "string" ? item.text : ""),
    combatPower: inferSituationCombatPower(String(item.id)),
  }));

  const events: EventDefinition[] = [];
  const eventGroups: EventGroupDefinition[] = [];
  const specialEventPools: Record<string, EventDefinition[]> = Object.fromEntries(
    Object.entries(LOSTBELT_SPECIAL_EVENT_POOLS).map(([poolId, definitions]) => [poolId, definitions.map((definition) => structuredClone(definition))]),
  );
  for (const group of raw.eventGroups ?? []) {
    const eventIds: string[] = [];
    for (const item of group.cards ?? []) {
      const id = String(item.id);
      eventIds.push(id);
      events.push({
        id,
        locationId: item.locationId === "mountain" || item.locationId === "city" ? item.locationId : undefined,
        victoryPoints: Number(item.victoryPoints ?? 0),
        mentionedAttributes: CONFIRMED_EVENT_MENTIONED_ATTRIBUTES[id]
          ? [...CONFIRMED_EVENT_MENTIONED_ATTRIBUTES[id]]
          : undefined,
        combatPower: CONFIRMED_EVENT_COMBAT_POWER[id]
          ? structuredClone(CONFIRMED_EVENT_COMBAT_POWER[id])
          : undefined,
        text: typeof item.text === "string" ? item.text : undefined,
      });
    }
    eventGroups.push({ id: String(group.id), name: String(group.name), eventIds, persistent: group.persistent });
  }
  if ((raw.civilizationRuins ?? []).length > 0) {
    specialEventPools["destroyed-civilization"] = (raw.civilizationRuins ?? []).map((item) => {
      const id = String(item.id);
      return {
        id,
        victoryPoints: Number(item.victoryPoints ?? 0),
        mentionedAttributes: CONFIRMED_EVENT_MENTIONED_ATTRIBUTES[id]
          ? [...CONFIRMED_EVENT_MENTIONED_ATTRIBUTES[id]]
          : undefined,
        combatPower: CONFIRMED_EVENT_COMBAT_POWER[id]
          ? structuredClone(CONFIRMED_EVENT_COMBAT_POWER[id])
          : undefined,
        text: typeof item.text === "string" ? item.text : undefined,
      } satisfies EventDefinition;
    });
  }

  const playerDecks: Record<string, string[]> = {};
  const servantClasses: Record<string, string> = {};
  const deckDefinitions: Record<string, DeckDefinition> = {};
  for (const servant of raw.servants ?? []) {
    if (servant.deck !== undefined && !Array.isArray(servant.deck)) throw new Error(`SERVANT_DECK_INVALID:${servant.id}`);
    const deck = [...(servant.deck ?? [])];
    for (const cardId of deck) {
      if (typeof cardId !== "string" || cardId.length === 0) throw new Error(`SERVANT_DECK_CARD_ID_INVALID:${servant.id}`);
      if (!cards[cardId]) throw new Error(`SERVANT_CARD_NOT_FOUND:${servant.id}:${cardId}`);
    }
    // A deck is an ordered multiset: repeated definition IDs are legal and
    // become separate CardInstances when the match starts.
    const ownerDefinitionId = String(servant.id);
    playerDecks[ownerDefinitionId] = deck;
    if (typeof servant.class === "string" && servant.class.length > 0) servantClasses[ownerDefinitionId] = servant.class;
    const deckDefinition = createDeckDefinition(ownerDefinitionId, deck);
    assertDeckDefinition(deckDefinition, cards, ownerDefinitionId);
    deckDefinitions[ownerDefinitionId] = deckDefinition;
  }
  const masterInitialMana: Record<string, number> = {};
  for (const master of raw.masters ?? []) {
    if (Number.isInteger(master.initialMana) && Number(master.initialMana) >= 0) masterInitialMana[String(master.id)] = Number(master.initialMana);
  }
  const skills = new SkillRegistry();
  for (const definition of buildSkillDefinitions(raw as Parameters<typeof buildSkillDefinitions>[0])) {
    skills.register(definition);
  }
  // Keep the authored catalog card and the executable skill definition in
  // sync. The catalog entry remains a normal CardDefinition, while the
  // linked skill owns support/handler metadata and structured windows.
  for (const skill of skills.list()) {
    const catalogId = `card.skill.${skill.id}`;
    const catalog = cards[catalogId];
    if (!catalog) continue;
    cards[catalogId] = {
      ...catalog,
      cardType: "skill",
      ownerType: skill.ownerType,
      ownerDefinitionId: skill.ownerId,
      linkedSkillId: skill.id,
      variablePlayAttributeChoice: skill.variablePlayAttributeChoice ? { allowedAttributes: [...skill.variablePlayAttributeChoice.allowedAttributes], manaPerAttribute: skill.variablePlayAttributeChoice.manaPerAttribute } : catalog.variablePlayAttributeChoice,
      optionalFreePlay: skill.optionalFreePlay ? { ...skill.optionalFreePlay } : catalog.optionalFreePlay,
      attributes: skill.attributes !== undefined ? [...skill.attributes] : catalog.attributes,
      basicCardPowerBonus: skill.basicCardPowerBonus ?? catalog.basicCardPowerBonus,
      basicCardPowerBonusAttributes: skill.basicCardPowerBonusAttributes ? [...skill.basicCardPowerBonusAttributes] : catalog.basicCardPowerBonusAttributes,
      basicCardPowerBonusCondition: skill.basicCardPowerBonusCondition ?? catalog.basicCardPowerBonusCondition,
      playerDefeatIgnoreCondition: skill.playerDefeatIgnoreCondition ?? catalog.playerDefeatIgnoreCondition,
      protectsControllerCardsFromOpponents: skill.protectsControllerCardsFromOpponents ?? catalog.protectsControllerCardsFromOpponents,
      linkedPlayerSameBattlefieldAttributeTransform: skill.linkedPlayerSameBattlefieldAttributeTransform
        ? {
            playerFlag: skill.linkedPlayerSameBattlefieldAttributeTransform.playerFlag,
            removeAttributes: skill.linkedPlayerSameBattlefieldAttributeTransform.removeAttributes ? [...skill.linkedPlayerSameBattlefieldAttributeTransform.removeAttributes] : undefined,
            addAttributes: skill.linkedPlayerSameBattlefieldAttributeTransform.addAttributes ? [...skill.linkedPlayerSameBattlefieldAttributeTransform.addAttributes] : undefined,
          }
        : catalog.linkedPlayerSameBattlefieldAttributeTransform,
      cardAbilityIds: skill.cardAbilityIds ? [...skill.cardAbilityIds] : catalog.cardAbilityIds,
      phases: skill.cardAbilityPhases?.length ? [...skill.cardAbilityPhases] : (skill.windows.length ? [...skill.windows] : catalog.phases),
      steps: skill.steps?.length ? [...skill.steps] : catalog.steps,
      requiresEightMana: skill.requiresEightMana ?? catalog.requiresEightMana,
      eightManaWaiverMaxPrintedBasePower: skill.eightManaWaiverMaxPrintedBasePower ?? catalog.eightManaWaiverMaxPrintedBasePower,
      lowManaSkillPlaySurcharge: skill.lowManaSkillPlaySurcharge ?? catalog.lowManaSkillPlaySurcharge,
      maxManaExclusive: skill.maxManaExclusive ?? catalog.maxManaExclusive,
      situationForbiddenAttributeCostReduction: skill.situationForbiddenAttributeCostReduction ?? catalog.situationForbiddenAttributeCostReduction,
      otherPlayersIgnoreSituationEffects: skill.otherPlayersIgnoreSituationEffects ?? catalog.otherPlayersIgnoreSituationEffects,
      ignoresSituationRestrictions: skill.ignoresSituationRestrictions ?? catalog.ignoresSituationRestrictions,
      residual: skill.activation === "residual" || catalog.residual === true,
      limit: skill.limit ?? catalog.limit,
      requiresTrueName: skill.requiresTrueName ?? catalog.requiresTrueName,
      revealsTrueNameOnPlay: skill.revealsTrueNameOnPlay ?? catalog.revealsTrueNameOnPlay,
      requiresHiddenTrueName: skill.requiresHiddenTrueName ?? catalog.requiresHiddenTrueName,
      playDrawIfWithBasicAttack: skill.playDrawIfWithBasicAttack ?? catalog.playDrawIfWithBasicAttack,
      drawOnPlay: skill.drawOnPlay ?? catalog.drawOnPlay,
      returnToDeckOnDefeat: skill.returnToDeckOnDefeat ?? catalog.returnToDeckOnDefeat,
      preparationHandSize: skill.preparationHandSize ?? catalog.preparationHandSize,
      alternativePlayCost: skill.alternativePlayCost ?? catalog.alternativePlayCost,
      attackManaShare: skill.attackManaShare ? { ...skill.attackManaShare } : catalog.attackManaShare,
      appendFromHand: skill.appendFromHand ?? catalog.appendFromHand,
      singleCardPlay: skill.singleCardPlay ?? catalog.singleCardPlay,
      tags: skill.tags ?? catalog.tags,
      implementation: {
        level: skill.supportLevel,
        ...(skill.handlerId ? { handlerId: skill.handlerId } : {}),
      },
      sourceRefs: skill.sourceRefs?.map((source) => ({ ...source })) ?? catalog.sourceRefs,
      ruleProgram: skill.ruleProgram ? structuredClone(skill.ruleProgram) : catalog.ruleProgram,
      rules: skill.rules ? structuredClone(skill.rules) : catalog.rules,
    };
  }
  installCoreDerivedCardDefinitions(cards);
  return Object.freeze({
    cards,
    situations,
    events,
    eventGroups,
    specialEventPools,
    playerDecks,
    servantClasses,
    deckDefinitions,
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

/** Runtime-owned definitions for temporary attacks explicitly created by skills. */
function installCoreDerivedCardDefinitions(cards: Record<string, CardDefinition>): void {
  const definitions: CardDefinition[] = [
    {
      id: "card.derived.temporary-basic.power-2.strength",
      version: 1,
      name: "王之军势·力量",
      cardType: "attack",
      ownerType: "servant",
      ownerDefinitionId: "servant.iskandar",
      cost: 0,
      basePower: 2,
      typeLabel: "力量",
      attributes: ["力量"],
      basic: true,
      text: "由【王之军势】创造的临时基础攻击。",
      implementation: { level: "FULL" },
      sourceRefs: [{ kind: "legacy", document: "legacy-content.json", locator: "servant.iskandar.skill.sc-iskandar-np" }],
    },
    {
      id: "card.derived.temporary-basic.power-2.agility",
      version: 1,
      name: "王之军势·迅捷",
      cardType: "attack",
      ownerType: "servant",
      ownerDefinitionId: "servant.iskandar",
      cost: 0,
      basePower: 2,
      typeLabel: "迅捷",
      attributes: ["迅捷"],
      basic: true,
      text: "由【王之军势】创造的临时基础攻击。",
      implementation: { level: "FULL" },
      sourceRefs: [{ kind: "legacy", document: "legacy-content.json", locator: "servant.iskandar.skill.sc-iskandar-np" }],
    },
    {
      id: "card.derived.temporary-attack.power-4.agility",
      version: 1,
      name: "无明三段突·临时攻击",
      cardType: "attack",
      ownerType: "servant",
      ownerDefinitionId: "servant.okita",
      cost: 0,
      basePower: 4,
      typeLabel: "迅捷",
      attributes: ["迅捷"],
      basic: false,
      text: "由【无明三段突】创造的临时迅捷攻击。",
      implementation: { level: "FULL" },
      sourceRefs: [{ kind: "legacy", document: "legacy-content.json", locator: "servant.okita.skill.sc-okita-2" }],
    },
    {
      id: "card.derived.master.maiya.shooting",
      version: 1,
      name: "射击",
      cardType: "attack",
      ownerType: "master",
      ownerDefinitionId: "master.maiya",
      skillOwnerType: "master",
      cost: 1,
      requirement: 0,
      basePower: 3,
      typeLabel: "迅捷",
      attributes: ["迅捷"],
      basic: false,
      isSkill: false,
      standardAppend: true,
      text: "（升华技·甜品狂热者）此牌需追加打出。",
      implementation: { level: "FULL" },
      sourceRefs: [{ kind: "development-image", document: "Fate_Domination-开发版", locator: "master.maiya/久宇舞弥" }],
    },
    {
      id: "card.derived.master.tokiomi.item.azoth-blade",
      version: 1,
      name: "阿佐特剑",
      cardType: "skill",
      ownerType: "master",
      ownerDefinitionId: "master.tokiomi",
      cost: 0,
      basePower: 0,
      typeLabel: "道具",
      attributes: [],
      isSkill: false,
      phases: ["action"],
      steps: ["player-window", "move-decision", "play-batch-draft", "settlement"],
      cardAbilityIds: ["tokiomi.item.azoth-blade"],
      limit: "once-per-round",
      tags: ["shared-public-ability", "tokiomi-item"],
      text: "每回合仅一名玩家可使用。行动阶段：时臣获得1战果；令你的一张基础攻击本回合+2威力。若你与时臣交战，时臣本回合合计威力-2。时臣自己使用时不因道具获得战果。",
      implementation: { level: "FULL", handlerId: "tokiomi.item.azoth-blade" },
      sourceRefs: [{ kind: "english-wiki", document: "Fate/Domination Wiki", locator: "Tohsaka_Tokiomi/Azoth_Blade" }],
    },
    {
      id: "card.derived.master.tokiomi.item.grimoir",
      version: 1,
      name: "魔导书",
      cardType: "skill",
      ownerType: "master",
      ownerDefinitionId: "master.tokiomi",
      cost: 0,
      basePower: 0,
      typeLabel: "道具",
      attributes: [],
      isSkill: false,
      phases: ["action"],
      steps: ["player-window", "move-decision", "play-batch-draft", "settlement"],
      cardAbilityIds: ["tokiomi.item.grimoir"],
      limit: "once-per-round",
      tags: ["shared-public-ability", "tokiomi-item"],
      text: "每回合仅一名玩家可使用。行动阶段：时臣获得1战果；弃置2张牌，从牌库检索1张牌加入手牌，然后时臣弃置1张牌。时臣自己使用时不因道具获得战果。",
      implementation: { level: "FULL", handlerId: "tokiomi.item.grimoir" },
      sourceRefs: [{ kind: "english-wiki", document: "Fate/Domination Wiki", locator: "Tohsaka_Tokiomi/Grimoir" }],
    },
    {
      id: "card.derived.master.tokiomi.item.magic-meter",
      version: 1,
      name: "魔力计",
      cardType: "skill",
      ownerType: "master",
      ownerDefinitionId: "master.tokiomi",
      cost: 0,
      basePower: 0,
      typeLabel: "道具",
      attributes: [],
      isSkill: false,
      phases: ["action"],
      steps: ["player-window", "move-decision", "play-batch-draft", "settlement"],
      cardAbilityIds: ["tokiomi.item.magic-meter"],
      limit: "once-per-round",
      tags: ["shared-public-ability", "tokiomi-item"],
      text: "每回合仅一名玩家可使用。行动阶段：时臣获得1战果；在你所在战场的一个空闲地利位置重新部署。时臣自己使用时不因道具获得战果。",
      implementation: { level: "FULL", handlerId: "tokiomi.item.magic-meter" },
      sourceRefs: [{ kind: "english-wiki", document: "Fate/Domination Wiki", locator: "Tohsaka_Tokiomi/Magic_Meter" }],
    },
    {
      id: "card.derived.master.tokiomi.item.mana-reserve",
      version: 1,
      name: "魔力储备",
      cardType: "skill",
      ownerType: "master",
      ownerDefinitionId: "master.tokiomi",
      cost: 0,
      basePower: 0,
      typeLabel: "道具",
      attributes: [],
      isSkill: false,
      phases: ["action"],
      steps: ["player-window", "move-decision", "play-batch-draft", "settlement"],
      cardAbilityIds: ["tokiomi.item.mana-reserve"],
      limit: "once-per-round",
      tags: ["shared-public-ability", "tokiomi-item"],
      text: "每回合仅一名玩家可使用。行动阶段：时臣获得1战果；本回合你的所有攻击魔力消耗-1，时臣失去1魔力。时臣自己使用时不因道具获得战果。",
      implementation: { level: "FULL", handlerId: "tokiomi.item.mana-reserve" },
      sourceRefs: [{ kind: "english-wiki", document: "Fate/Domination Wiki", locator: "Tohsaka_Tokiomi/Mana_Reserve" }],
    },
  ];
  for (const definition of definitions) {
    if (cards[definition.id]) throw new Error(`CARD_ID_DUPLICATE:${definition.id}`);
    cards[definition.id] = definition;
  }
  const tokiomiFireball = cards["card.derived.master.tokiomi.fireball"];
  if (tokiomiFireball) {
    Object.assign(tokiomiFireball, {
      cardType: "skill",
      cost: 2,
      basePower: 0,
      typeLabel: "魔术",
      attributes: ["魔术"],
      isSkill: true,
      skillOwnerType: "master",
      ownerDefinitionId: "master.tokiomi",
      requiresEightMana: true,
      phases: ["combat"],
      cardAbilityIds: ["tokiomi.fireball.burn"],
      standardAppend: true,
      implementation: { level: "FULL", handlerId: "tokiomi.fireball.burn" },
    } satisfies Partial<CardDefinition>);
  }
}

const BERSERKER_ATTACK_CARD_IDS = new Set([
  "card.carda5",
  "card.carda6",
  "card.cardb5",
  "card.cardb6",
  "card.cardq5",
  "card.cardq6",
]);

/** Stable-ID content mapping for the Berserker attack class printed on Jekyll. */
function inferCardTags(rawCard: Record<string, unknown>): string[] | undefined {
  const authored = Array.isArray(rawCard.tags)
    ? rawCard.tags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0)
    : [];
  const id = typeof rawCard.id === "string" ? rawCard.id : "";
  if (BERSERKER_ATTACK_CARD_IDS.has(id) && !authored.includes("berserker-attack")) authored.push("berserker-attack");
  return authored.length ? [...new Set(authored)] : undefined;
}

/**
 * Stable-ID mapping for the explicitly confirmed situation cards. This is an
 * import-time content mapping only; the rules runtime consumes the structured
 * result and never interprets the printed description.
 */
function inferSituationCombatPower(id: string): SituationDefinition["combatPower"] {
  const locations = ["mountain", "city"] as const;
  if (id.endsWith("sit4")) return { cardAddByAttribute: { 力量: 2 }, locations: [...locations] };
  if (id.endsWith("sit5")) return { cardAddByAttribute: { 迅捷: 2 }, locations: [...locations] };
  if (id.endsWith("sit6")) return { cardAddByAttribute: { 魔术: 2 }, locations: [...locations] };
  if (id.endsWith("sit7")) return { cardAddByAttribute: { 魔术: 1 }, locations: [...locations] };
  if (id.endsWith("sit8")) return { cardAddByAttribute: { 迅捷: 1 }, locations: [...locations] };
  if (id.endsWith("sit9")) return { cardAddByAttribute: { 力量: 1 }, locations: [...locations] };
  if (id.endsWith("sit10")) return { aggregateAddBySharedAttribute: 3, locations: [...locations] };
  return undefined;
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
