import type { BoardState, CardInstance } from "../domain/state/types.ts";

export function canRevealCardDefinition(card: CardInstance, viewerId: string, ownerTrueNameRevealed = false, ownerHandRevealed = false, ownerSkillZoneHidden = false): boolean {
  return card.ownerPlayerId === viewerId
    || card.publiclyRevealed === true
    || (card.zone === "hand" && ownerHandRevealed)
    || (card.zone === "attack" && card.face === "up")
    || card.zone === "board"
    || (card.zone === "servant-skills" && !ownerSkillZoneHidden && (card.face === "up" || ownerTrueNameRevealed));
}

export function maskEventId(board: BoardState, eventId: string): string {
  return board.eventVisibility[eventId] === "down" ? "event:hidden" : eventId;
}

export function maskDeckIds(ids: string[], placeholder: string): string[] {
  return ids.map(() => placeholder);
}
