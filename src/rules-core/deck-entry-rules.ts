import type { PlayerState } from "../domain/state/types.ts";

const BLOCK_RECYCLE_FLAG = "deckAutomaticRecycleBlocked";
const REDIRECT_ENTRY_FLAG = "deckExternalEntryRedirectToDiscard";
const SOURCE_FLAG = "deckEntryRestrictionSourceId";

/** Install a generic replacement rule: outside effects cannot put cards into this deck, and empty-deck draws do not recycle discard. */
export function installDeckEntryRestriction(player: PlayerState, sourceId: string): void {
  if (!sourceId) throw new Error("DECK_ENTRY_RESTRICTION_SOURCE_REQUIRED");
  player.flags[BLOCK_RECYCLE_FLAG] = true;
  player.flags[REDIRECT_ENTRY_FLAG] = true;
  player.flags[SOURCE_FLAG] = sourceId;
}

export function automaticDeckRecycleIsBlocked(player: PlayerState | undefined): boolean {
  return player?.flags[BLOCK_RECYCLE_FLAG] === true;
}

export function externalDeckEntryRedirectsToDiscard(player: PlayerState | undefined): boolean {
  return player?.flags[REDIRECT_ENTRY_FLAG] === true;
}

export type PlayerCardDestination = "hand" | "deck" | "attack" | "discard" | "removed" | "master-skills" | "servant-skills";

export function resolvePlayerCardDestination(
  player: PlayerState,
  previousZone: string,
  requestedDestination: PlayerCardDestination,
  options: { ignoreDeckEntryRestriction?: boolean } = {},
): PlayerCardDestination {
  if (requestedDestination === "deck"
    && previousZone !== "deck"
    && options.ignoreDeckEntryRestriction !== true
    && externalDeckEntryRedirectsToDiscard(player)) return "discard";
  return requestedDestination;
}
