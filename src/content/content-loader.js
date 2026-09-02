import { isStableId } from "./schema.js";

const COLLECTIONS = [
  "masters",
  "servants",
  "cards",
  "situations",
  "eventGroups",
  "civilizationRuins",
];

/**
 * Merges authored content into the imported baseline without mutating either
 * package. Every authored entity must use a new stable ID; replacing a card
 * by display name would make old saves and replays unsafe.
 */
export function mergeContentPackages(base, extension) {
  const result = structuredClone(base ?? {});
  const incoming = structuredClone(extension ?? {});
  const ids = collectIds(result);
  assertPackageIdsUnique(incoming);

  for (const collection of COLLECTIONS) {
    if (incoming[collection] === undefined) continue;
    if (!Array.isArray(incoming[collection])) {
      throw new Error(`CONTENT_COLLECTION_INVALID:${collection}`);
    }
    if (!Array.isArray(result[collection])) result[collection] = [];
    for (const entity of incoming[collection]) {
      assertEntity(entity, collection);
      if (collection === "eventGroups") validateEventGroup(entity);
      if (ids.has(entity.id)) throw new Error(`CONTENT_ID_DUPLICATE:${entity.id}`);
      ids.add(entity.id);
      result[collection].push(entity);
    }
  }

  validateRoleReferences(result, extension);
  return result;
}

function assertPackageIdsUnique(content) {
  const seen = new Set();
  const add = (id) => {
    if (typeof id !== "string") return;
    if (seen.has(id)) throw new Error(`CONTENT_ID_DUPLICATE:${id}`);
    seen.add(id);
  };
  for (const master of content.masters ?? []) {
    add(master.id);
    for (const skill of master.skills ?? []) add(skill.id);
  }
  for (const servant of content.servants ?? []) {
    add(servant.id);
    for (const skill of servant.skills ?? []) add(skill.id);
  }
  for (const collection of ["cards", "situations", "civilizationRuins"]) {
    for (const entity of content[collection] ?? []) add(entity.id);
  }
  for (const group of content.eventGroups ?? []) {
    add(group.id);
    if (!Array.isArray(group.cards)) continue;
    const eventIds = new Set();
    for (const card of group.cards ?? []) {
      if (eventIds.has(card.id)) throw new Error(`EVENT_GROUP_CARD_DUPLICATE:${group.id}:${card.id}`);
      eventIds.add(card.id);
      add(card.id);
    }
  }
}

export function collectIds(content) {
  const ids = new Set();
  for (const master of content.masters ?? []) {
    addId(ids, master.id);
    for (const skill of master.skills ?? []) addId(ids, skill.id);
  }
  for (const servant of content.servants ?? []) {
    addId(ids, servant.id);
    for (const skill of servant.skills ?? []) addId(ids, skill.id);
  }
  for (const collection of ["cards", "situations", "civilizationRuins"]) {
    for (const entity of content[collection] ?? []) addId(ids, entity.id);
  }
  for (const group of content.eventGroups ?? []) {
    addId(ids, group.id);
    for (const card of group.cards ?? []) addId(ids, card.id);
  }
  return ids;
}

function addId(ids, id) {
  if (typeof id === "string") ids.add(id);
}

function assertEntity(entity, collection) {
  if (!entity || typeof entity !== "object" || !isStableId(entity.id)) {
    throw new Error(`CONTENT_ID_INVALID:${collection}`);
  }
}

function validateEventGroup(group) {
  if (!Array.isArray(group.cards)) throw new Error(`EVENT_GROUP_CARDS_INVALID:${group.id}`);
  if (group.cards.length !== 20) throw new Error(`EVENT_GROUP_CARD_COUNT_INVALID:${group.id}`);
  const ids = new Set();
  for (const card of group.cards) {
    assertEntity(card, "event");
    if (ids.has(card.id)) throw new Error(`EVENT_GROUP_CARD_DUPLICATE:${group.id}:${card.id}`);
    ids.add(card.id);
  }
}

function validateRoleReferences(content, extension) {
  const cardIds = new Set((content.cards ?? []).map((card) => card.id));
  for (const servant of extension.servants ?? []) {
    if (servant.deck !== undefined && !Array.isArray(servant.deck)) throw new Error(`SERVANT_DECK_INVALID:${servant.id}`);
    const deck = servant.deck ?? [];
    if (servant.deck !== undefined && deck.length !== 12) throw new Error(`SERVANT_DECK_SIZE:${servant.id}`);
    for (const cardId of deck) {
      if (!isStableId(cardId)) throw new Error(`SERVANT_DECK_CARD_ID_INVALID:${servant.id}`);
      if (!cardIds.has(cardId)) throw new Error(`SERVANT_CARD_NOT_FOUND:${servant.id}:${cardId}`);
    }
  }
  const masterIds = new Set((content.masters ?? []).map((master) => master.id));
  const servantIds = new Set((content.servants ?? []).map((servant) => servant.id));
  for (const skill of (extension.masters ?? []).flatMap((master) => master.skills ?? [])) {
    if (!masterIds.has(skill.ownerId ?? skill.owner ?? "")) continue;
  }
  for (const skill of (extension.servants ?? []).flatMap((servant) => servant.skills ?? [])) {
    if (!servantIds.has(skill.ownerId ?? skill.owner ?? "")) continue;
  }
}
