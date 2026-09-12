import type { CardInstance, GameState } from "../domain/state/types.ts";
import { movePlayerCard } from "./decks.ts";

function removeFrom(list: string[], instanceId: string): void {
  const index = list.indexOf(instanceId);
  if (index >= 0) list.splice(index, 1);
}

function removeFromPlayerZones(state: GameState, card: CardInstance): void {
  if (!card.ownerPlayerId) throw new Error("ATTACHMENT_OWNER_REQUIRED");
  if (!state.players[card.ownerPlayerId]) throw new Error("ATTACHMENT_OWNER_NOT_FOUND");
  // An attach effect may target a borrowed card currently controlled in a
  // different player's attack. An attached card must belong to no ordinary
  // player zone regardless of physical ownership or temporary control.
  for (const player of Object.values(state.players)) {
    removeFrom(player.hand, card.instanceId);
    removeFrom(player.deck, card.instanceId);
    removeFrom(player.discard, card.instanceId);
    removeFrom(player.attack, card.instanceId);
    removeFrom(player.masterSkills, card.instanceId);
    removeFrom(player.servantSkills, card.instanceId);
  }
}

function assertNoAttachmentCycle(state: GameState, cardId: string, hostId: string): void {
  const visited = new Set<string>([cardId]);
  let current: CardInstance | undefined = state.cards[hostId];
  while (current) {
    if (visited.has(current.instanceId)) throw new Error("CARD_ATTACHMENT_CYCLE");
    visited.add(current.instanceId);
    current = current.zone === "attached" && current.attachedToInstanceId
      ? state.cards[current.attachedToInstanceId]
      : undefined;
  }
}

/** Place one owned physical card on/under another card without losing provenance. */
export function attachCard(state: GameState, instanceId: string, hostInstanceId: string, face: "up" | "down" = "up"): CardInstance {
  const card = state.cards[instanceId];
  const host = state.cards[hostInstanceId];
  if (!card || !host) throw new Error("CARD_ATTACHMENT_NOT_FOUND");
  if (card.instanceId === host.instanceId || host.zone === "removed") throw new Error("CARD_ATTACHMENT_HOST_INVALID");
  if (!card.ownerPlayerId || !state.players[card.ownerPlayerId]) throw new Error("ATTACHMENT_OWNER_REQUIRED");
  assertNoAttachmentCycle(state, instanceId, hostInstanceId);
  const nextOrder = getAttachedCards(state, hostInstanceId).reduce((max, attached) => Math.max(max, Number(attached.attachmentOrder ?? 0)), 0) + 1;
  removeFromPlayerZones(state, card);
  card.zone = "attached";
  card.attachedToInstanceId = hostInstanceId;
  card.attachmentOrder = nextOrder;
  card.attachmentPlacedRound = state.round;
  card.face = face;
  card.active = false;
  card.residual = false;
  // Attachment becomes the card's authoritative holding lifecycle. Any prior
  // temporary-control cleanup must not pull it out from under its host later.
  delete card.returnToOwnerDiscardOnClose;
  delete card.returnToOwnerSkillZoneOnClose;
  delete card.removeWithControllerOnElimination;
  delete card.removeAfterCombatRound;
  return card;
}

/** Return an attached card to one of its owner's ordinary zones. */
export function detachCard(
  state: GameState,
  instanceId: string,
  zone: "hand" | "deck" | "attack" | "discard" | "removed" | "master-skills" | "servant-skills",
): CardInstance {
  const card = state.cards[instanceId];
  if (!card || card.zone !== "attached" || !card.attachedToInstanceId || !card.ownerPlayerId) throw new Error("CARD_NOT_ATTACHED");
  movePlayerCard(state, card.ownerPlayerId, instanceId, zone);
  return card;
}

export function getAttachedCards(state: GameState, hostInstanceId: string): CardInstance[] {
  if (!state.cards[hostInstanceId]) throw new Error("CARD_ATTACHMENT_HOST_NOT_FOUND");
  return Object.values(state.cards)
    .filter((card) => card.zone === "attached" && card.attachedToInstanceId === hostInstanceId)
    .sort((a, b) => Number(a.attachmentOrder ?? 0) - Number(b.attachmentOrder ?? 0));
}

export function getTopAttachedCard(state: GameState, hostInstanceId: string): CardInstance | undefined {
  return getAttachedCards(state, hostInstanceId).at(-1);
}
