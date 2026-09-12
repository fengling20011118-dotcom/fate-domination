import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { createOwnedCardInstance } from "./decks.ts";

export const KOHAKU_BURNED_WORKSHOP_ID = "master.kohaku.skill.s3";
export const KOHAKU_MAGICAL_ONSLAUGHT_ID = "card.card-kohaku-blast";

/** Returns a live Burned Workshop source physically controlled by this player. */
export function findBurnedWorkshopInstance(state: GameState, playerId: string): string | undefined {
  const player = state.players[playerId];
  if (!player) return undefined;
  return [...player.masterSkills, ...player.servantSkills, ...player.hand, ...player.attack]
    .find((instanceId) => {
      const card = state.cards[instanceId];
      return card?.definitionId === KOHAKU_BURNED_WORKSHOP_ID && card.zone !== "removed";
    });
}

/** [Burn their Workshop]: grant one live Burned Workshop card to the target. */
export function grantBurnedWorkshop(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): string {
  if (!state.players[playerId] || state.players[playerId].eliminated) throw new Error("KOHAKU_BURN_TARGET_INVALID");
  if (!definitions[KOHAKU_BURNED_WORKSHOP_ID]) throw new Error("KOHAKU_BURNED_WORKSHOP_DEFINITION_MISSING");
  const existing = findBurnedWorkshopInstance(state, playerId);
  if (existing) return existing;
  const count = Object.values(state.cards).filter((card) => card.ownerPlayerId === playerId && card.definitionId === KOHAKU_BURNED_WORKSHOP_ID).length;
  const instanceId = `${playerId}:burned-workshop:${count + 1}`;
  createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId: KOHAKU_BURNED_WORKSHOP_ID,
    zone: "master-skills",
    face: "up",
    active: false,
  });
  return instanceId;
}
