import type { BoardState, CardInstance } from "../domain/state/types.ts";

export function canRevealCardDefinition(card: CardInstance, viewerId: string, ownerTrueNameRevealed = false): boolean {
  return card.ownerPlayerId === viewerId
    || (card.zone === "attack" && card.face === "up")
    || card.zone === "board"
    || (card.zone === "servant-skills" && ownerTrueNameRevealed);
}

export function maskEventId(board: BoardState, eventId: string): string {
  return board.eventVisibility[eventId] === "down" ? "event:hidden" : eventId;
}

export function maskDeckIds(ids: string[], placeholder: string): string[] {
  return ids.map(() => placeholder);
}
