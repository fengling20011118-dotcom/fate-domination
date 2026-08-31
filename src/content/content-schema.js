import { isStableId } from "./schema.js";

const KNOWN_ATTRIBUTES = new Set(["力量", "敏捷", "迅捷", "魔法", "魔术", "特殊", "宝具"]);

export function validateAuthoredPackage(packageData, { resourceExists } = {}) {
  const errors = [];
  const add = (message) => errors.push(message);
  if (!packageData || typeof packageData !== "object") return ["CONTENT_PACKAGE_INVALID"];

  for (const collection of ["masters", "servants", "cards", "situations", "eventGroups", "civilizationRuins"]) {
    if (packageData[collection] !== undefined && !Array.isArray(packageData[collection])) {
      add("CONTENT_COLLECTION_INVALID:" + collection);
    }
  }

  for (const master of packageData.masters ?? []) {
    validateRole(master, "master", add, resourceExists);
  }
  for (const servant of packageData.servants ?? []) {
    validateRole(servant, "servant", add, resourceExists);
    if (servant.deck && servant.deck.length !== 12) add(`SERVANT_DECK_SIZE:${servant.id}`);
  }
  for (const card of packageData.cards ?? []) {
    if (!isStableId(card?.id)) add(`CARD_ID_INVALID:${card?.id ?? ""}`);
    if (typeof card?.name !== "string" && !isLocalizedText(card?.name)) add(`CARD_NAME_INVALID:${card?.id ?? ""}`);
    if (typeof card?.image !== "string") add(`CARD_IMAGE_MISSING:${card?.id ?? ""}`);
    validateAttributes(card?.attributes, `CARD_ATTRIBUTES_INVALID:${card?.id ?? ""}`, add);
    if (resourceExists && typeof card.image === "string" && !resourceExists(card.image)) {
      add(`CARD_IMAGE_NOT_FOUND:${card.id}:${card.image}`);
    }
  }
  for (const situation of packageData.situations ?? []) {
    if (!isStableId(situation?.id)) add("SITUATION_ID_INVALID:" + (situation?.id ?? ""));
    if (!Number.isFinite(Number(situation?.mana))) add("SITUATION_MANA_INVALID:" + (situation?.id ?? ""));
    validateAttributes(situation?.forbiddenAttributes, `SITUATION_ATTRIBUTES_INVALID:${situation?.id ?? ""}`, add);
  }
  for (const group of packageData.eventGroups ?? []) {
    if (!isStableId(group?.id)) add("EVENT_GROUP_ID_INVALID:" + (group?.id ?? ""));
    if (!Array.isArray(group?.cards)) {
      add("EVENT_GROUP_CARDS_INVALID:" + (group?.id ?? ""));
      continue;
    }
    if (group.cards.length !== 20) add("EVENT_GROUP_CARD_COUNT_INVALID:" + (group?.id ?? ""));
    const ids = new Set();
    for (const card of group.cards) {
      if (!isStableId(card?.id)) add("EVENT_ID_INVALID:" + (card?.id ?? ""));
      if (ids.has(card?.id)) add("EVENT_GROUP_CARD_DUPLICATE:" + group.id + ":" + card.id);
      ids.add(card?.id);
    }
  }
  for (const ruin of packageData.civilizationRuins ?? []) {
    validateCivilizationRuin(ruin, add);
  }
  return errors;
}

function validateCivilizationRuin(ruin, add) {
  const id = ruin?.id ?? "";
  if (!isStableId(id)) add(`CIVILIZATION_RUIN_ID_INVALID:${id}`);
  if (typeof ruin?.name !== "string" && !isLocalizedText(ruin?.name)) {
    add(`CIVILIZATION_RUIN_NAME_INVALID:${id}`);
  }
  if (!Number.isFinite(Number(ruin?.victoryPoints))) {
    add(`CIVILIZATION_RUIN_VICTORY_POINTS_INVALID:${id}`);
  }
  if (ruin?.typeLabel !== undefined && typeof ruin.typeLabel !== "string") {
    add(`CIVILIZATION_RUIN_TYPE_INVALID:${id}`);
  }
  if (ruin?.text !== undefined && typeof ruin.text !== "string" && !isLocalizedText(ruin.text)) {
    add(`CIVILIZATION_RUIN_TEXT_INVALID:${id}`);
  }
}

function validateRole(role, kind, add, resourceExists) {
  if (!isStableId(role?.id)) add(`${kind.toUpperCase()}_ID_INVALID:${role?.id ?? ""}`);
  if (typeof role?.name !== "string" && !isLocalizedText(role?.name)) {
    add(`${kind.toUpperCase()}_NAME_INVALID:${role?.id ?? ""}`);
  }
  if (typeof role?.image !== "string") add(`${kind.toUpperCase()}_IMAGE_MISSING:${role?.id ?? ""}`);
  if (resourceExists && typeof role?.image === "string" && !resourceExists(role.image)) {
    add(`${kind.toUpperCase()}_IMAGE_NOT_FOUND:${role.id}:${role.image}`);
  }
  for (const skill of role?.skills ?? []) {
    if (!isStableId(skill?.id)) add(`SKILL_ID_INVALID:${skill?.id ?? ""}`);
    if (typeof skill?.name !== "string" && !isLocalizedText(skill?.name)) {
      add(`SKILL_NAME_INVALID:${skill?.id ?? ""}`);
    }
    if (typeof skill?.text !== "string" && !isLocalizedText(skill?.text)) {
      add(`SKILL_TEXT_INVALID:${skill?.id ?? ""}`);
    }
    if (typeof skill?.image !== "string") add(`SKILL_IMAGE_MISSING:${skill?.id ?? ""}`);
    validateAttributes(skill?.attributes, `SKILL_ATTRIBUTES_INVALID:${skill?.id ?? ""}`, add);
    if (resourceExists && typeof skill?.image === "string" && !resourceExists(skill.image)) {
      add(`SKILL_IMAGE_NOT_FOUND:${skill.id}:${skill.image}`);
    }
    if (skill?.handlerId !== undefined && typeof skill.handlerId !== "string") {
      add(`SKILL_HANDLER_INVALID:${skill.id}`);
    }
    validateSkillSourceRefs(skill?.sourceRefs, skill.id, add);
    if (skill?.passiveEventTypes !== undefined && (!Array.isArray(skill.passiveEventTypes) || skill.passiveEventTypes.some((eventType) => typeof eventType !== "string" || !eventType))) {
      add(`SKILL_PASSIVE_EVENTS_INVALID:${skill.id}`);
    }
    if (skill?.combatPowerZeroAttribute !== undefined && (typeof skill.combatPowerZeroAttribute !== "string" || !KNOWN_ATTRIBUTES.has(skill.combatPowerZeroAttribute))) {
      add(`SKILL_ZERO_ATTRIBUTE_INVALID:${skill.id}`);
    }
    for (const field of ["requiresTrueName", "requiresEightMana", "ignoresSituationRestrictions", "revealsTrueNameOnPlay", "revealsTrueNameOnSkillUse", "requiresHiddenTrueName", "singleCardPlay"]) {
      if (skill?.[field] !== undefined && typeof skill[field] !== "boolean") {
        add(`SKILL_BOOLEAN_FIELD_INVALID:${skill.id}:${field}`);
      }
    }
    if (skill?.uniqueGroup !== undefined && (typeof skill.uniqueGroup !== "string" || !skill.uniqueGroup.trim())) {
      add(`SKILL_UNIQUE_GROUP_INVALID:${skill.id}`);
    }
    if (skill?.implementation !== undefined && !["pending", "implemented", "manual", "disabled"].includes(skill.implementation)) {
      add(`SKILL_IMPLEMENTATION_INVALID:${skill.id}`);
    }
    const activationKind = skill?.activation?.kind;
    if (activationKind !== undefined && !["passive", "optional-trigger", "active", "play", "reaction", "residual"].includes(activationKind)) {
      add(`SKILL_ACTIVATION_INVALID:${skill.id}`);
    }
    if (skill?.activation?.windows !== undefined && (!Array.isArray(skill.activation.windows) || skill.activation.windows.some((window) => typeof window !== "string"))) {
      add(`SKILL_WINDOWS_INVALID:${skill.id}`);
    }
  }
}

function validateSkillSourceRefs(sources, skillId, add) {
  if (sources === undefined) return;
  if (!Array.isArray(sources) || sources.length === 0) {
    add(`SKILL_SOURCE_REF_INVALID:${skillId}`);
    return;
  }
  for (const source of sources) validateSkillSourceRef(source, skillId, add);
}

function validateSkillSourceRef(source, skillId, add) {
  if (!source || typeof source !== "object") {
    add(`SKILL_SOURCE_REF_INVALID:${skillId}`);
    return;
  }
  const allowedKinds = new Set(["development-image", "chm", "rulebook", "fqa", "keywords", "three-x", "user-confirmed", "legacy"]);
  if (!allowedKinds.has(source.kind) || typeof source.document !== "string" || !source.document.trim()) {
    add(`SKILL_SOURCE_REF_INVALID:${skillId}`);
    return;
  }
  for (const field of ["locator", "page", "category"]) {
    if (source[field] !== undefined && (typeof source[field] !== "string" || !source[field].trim())) {
      add(`SKILL_SOURCE_REF_INVALID:${skillId}`);
      return;
    }
  }
  if (source.kind === "chm" && (source.document !== "FD全卡图鉴V2.0.chm" || typeof source.page !== "string" || source.category !== "servant/english")) {
    add(`SKILL_SOURCE_REF_INVALID:${skillId}`);
  }
  if (source.kind === "development-image" && (source.document !== "Fate_Domination-开发版" || typeof source.page !== "string" || !["master", "servant"].includes(source.category))) {
    add(`SKILL_SOURCE_REF_INVALID:${skillId}`);
  }
}

function validateAttributes(attributes, errorCode, add) {
  if (attributes === undefined) return;
  if (!Array.isArray(attributes) || attributes.some((attribute) => typeof attribute !== "string" || !KNOWN_ATTRIBUTES.has(attribute))) {
    add(errorCode);
  }
}

function isLocalizedText(value) {
  return Boolean(value && typeof value === "object" && (typeof value.zh === "string" || typeof value.en === "string"));
}
