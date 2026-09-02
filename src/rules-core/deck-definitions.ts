import type { CardDefinition } from "./content-types.ts";

export interface DeckCardEntry {
  definitionId: string;
  count: number;
}

/** Immutable content definition for one character's attack deck. */
export interface DeckDefinition {
  id: string;
  ownerDefinitionId: string;
  cards: DeckCardEntry[];
}

/** Converts the legacy ordered multiset into the formal counted definition. */
export function createDeckDefinition(ownerDefinitionId: string, definitionIds: string[]): DeckDefinition {
  if (typeof ownerDefinitionId !== "string" || ownerDefinitionId.length === 0) throw new Error("DECK_OWNER_ID_INVALID");
  if (!Array.isArray(definitionIds)) throw new Error("DECK_CARD_LIST_INVALID");
  const counts = new Map<string, number>();
  for (const definitionId of definitionIds) {
    if (typeof definitionId !== "string" || definitionId.length === 0) throw new Error("DECK_CARD_ID_INVALID");
    counts.set(definitionId, (counts.get(definitionId) ?? 0) + 1);
  }
  return {
    id: `${ownerDefinitionId}.deck`,
    ownerDefinitionId,
    cards: [...counts].map(([definitionId, count]) => ({ definitionId, count })),
  };
}

export function assertDeckDefinition(
  deck: DeckDefinition,
  definitions: Record<string, CardDefinition>,
  expectedOwnerDefinitionId?: string,
): void {
  if (!deck || typeof deck !== "object" || typeof deck.id !== "string" || deck.id.length === 0) throw new Error("DECK_ID_INVALID");
  if (typeof deck.ownerDefinitionId !== "string" || deck.ownerDefinitionId.length === 0) throw new Error("DECK_OWNER_ID_INVALID");
  if (expectedOwnerDefinitionId !== undefined && deck.ownerDefinitionId !== expectedOwnerDefinitionId) throw new Error("DECK_OWNER_MISMATCH");
  if (!Array.isArray(deck.cards)) throw new Error("DECK_CARDS_INVALID");
  const seen = new Set<string>();
  for (const entry of deck.cards) {
    if (!entry || typeof entry.definitionId !== "string" || entry.definitionId.length === 0) throw new Error("DECK_CARD_ID_INVALID");
    if (seen.has(entry.definitionId)) throw new Error(`DECK_CARD_DUPLICATE:${entry.definitionId}`);
    if (!Number.isInteger(entry.count) || entry.count <= 0) throw new Error(`DECK_CARD_COUNT_INVALID:${entry.definitionId}`);
    if (!definitions[entry.definitionId]) throw new Error(`DECK_CARD_DEFINITION_NOT_FOUND:${entry.definitionId}`);
    seen.add(entry.definitionId);
  }
}

/** Expands counts only when a match creates physical card instances. */
export function expandDeckDefinition(deck: DeckDefinition): string[] {
  const result: string[] = [];
  for (const entry of deck.cards) {
    if (!Number.isInteger(entry.count) || entry.count <= 0) throw new Error(`DECK_CARD_COUNT_INVALID:${entry.definitionId}`);
    for (let index = 0; index < entry.count; index += 1) result.push(entry.definitionId);
  }
  return result;
}
