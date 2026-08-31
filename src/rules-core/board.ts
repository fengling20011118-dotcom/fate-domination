import type { GameState } from "../domain/state/types.ts";
import { getJekyllMoveDiscount, ignoresDefeat } from "./jekyll-hyde.ts";

const locationOrder = ["workshop", "mountain", "city", "scouting"] as const;
const moveCosts: Record<string, number> = { workshop: 2, mountain: 2, city: 1 };
const capacities: Record<string, number | null> = { workshop: 4, mountain: null, city: null, scouting: 1 };

function isBattlefield(locationId: string): boolean {
  return locationId === "mountain" || locationId === "city";
}

function removePlayer(state: GameState, playerId: string): void {
  for (const players of Object.values(state.board.locations)) {
    const index = players.indexOf(playerId);
    if (index >= 0) players.splice(index, 1);
  }
}

export function deployPlayer(state: GameState, playerId: string, locationId: "workshop" | "mountain" | "city"): void {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  if (state.phase !== "outpost" || state.activePlayerId !== playerId) throw new Error("DEPLOY_WINDOW_FORBIDDEN");
  const restrictions = state.modeState.situationRestrictions as { forbiddenLocations?: string[]; workshopCapacity?: number } | undefined;
  if (restrictions?.forbiddenLocations?.includes(locationId)) throw new Error("LOCATION_FORBIDDEN_BY_SITUATION");
  const workshopCapacity = locationId === "workshop" ? (restrictions?.workshopCapacity ?? capacities.workshop) : capacities[locationId];
  if (state.board.locations[locationId].length >= (workshopCapacity ?? Number.MAX_SAFE_INTEGER)) throw new Error("LOCATION_FULL");
  if (player.locationId) removePlayer(state, playerId);
  state.board.locations[locationId].push(playerId);
  player.locationId = locationId;
  const records = state.board.outpostRecords[locationId] ?? [];
  const slot = records.findIndex((id) => id === null);
  if (slot >= 0) records[slot] = playerId;
  const bonus = locationId === "workshop" ? (slot === 0 ? 2 : slot >= 0 ? 1 : 0) : (slot === 0 ? 3 : slot === 1 ? 1 : 0);
  player.flags.deploymentLocationId = locationId;
  player.flags.deploymentBonus = bonus;
  player.flags.deploymentBonusActive = true;
  if (locationId === "workshop") player.mana += bonus;
}

export function movePlayer(state: GameState, playerId: string, targetLocationId: string, ignoreEngagement = false): number {
  const player = state.players[playerId];
  if (!player || player.eliminated || !player.locationId) throw new Error("PLAYER_NOT_ON_BOARD");
  if (!(targetLocationId in state.board.locations)) throw new Error("LOCATION_NOT_FOUND");
  if (state.phase !== "action" || state.activePlayerId !== playerId || state.step !== "move-decision") throw new Error("MOVE_WINDOW_FORBIDDEN");
  if (player.defeated && !ignoresDefeat(player)) throw new Error("PLAYER_DEFEATED");
  const restrictions = state.modeState.situationRestrictions as { forbiddenLocations?: string[] } | undefined;
  if (restrictions?.forbiddenLocations?.includes(targetLocationId)) throw new Error("LOCATION_FORBIDDEN_BY_SITUATION");
  const currentIndex = locationOrder.indexOf(player.locationId as typeof locationOrder[number]);
  const targetIndex = locationOrder.indexOf(targetLocationId as typeof locationOrder[number]);
  if (targetIndex <= currentIndex) throw new Error("MOVE_MUST_FOLLOW_ARROW");
  if (!ignoreEngagement && isBattlefield(player.locationId) && state.board.locations[player.locationId].length > 1) {
    throw new Error("ENGAGED_CANNOT_MOVE");
  }
  if (state.board.locations[targetLocationId].length >= (capacities[targetLocationId] ?? Number.MAX_SAFE_INTEGER)) throw new Error("LOCATION_FULL");

  let cost = 0;
  const discount = getJekyllMoveDiscount(player);
  for (let index = currentIndex; index < targetIndex; index += 1) {
    cost += Math.max(0, (moveCosts[locationOrder[index]] ?? 0) - discount);
  }
  if (player.mana < cost) throw new Error("INSUFFICIENT_MANA");
  player.mana -= cost;
  player.flags.deploymentBonusActive = false;
  removePlayer(state, playerId);
  state.board.locations[targetLocationId].push(playerId);
  player.locationId = targetLocationId;
  state.step = "play-batch-draft";
  return cost;
}

/** Free movement granted by a card effect; it does not follow the normal arrow or cost. */
export function movePlayerByEffect(state: GameState, playerId: string, targetLocationId: string): void {
  const player = state.players[playerId];
  if (!player || player.eliminated || !player.locationId) throw new Error("PLAYER_NOT_ON_BOARD");
  if (!(targetLocationId in state.board.locations)) throw new Error("LOCATION_NOT_FOUND");
  const restrictions = state.modeState.situationRestrictions as { forbiddenLocations?: string[] } | undefined;
  if (restrictions?.forbiddenLocations?.includes(targetLocationId)) throw new Error("LOCATION_FORBIDDEN_BY_SITUATION");
  if (targetLocationId === "scouting" && state.board.locations.scouting.length >= 1) throw new Error("LOCATION_FULL");
  if (targetLocationId === "workshop" && state.board.locations.workshop.length >= (restrictions?.workshopCapacity ?? capacities.workshop)) throw new Error("LOCATION_FULL");
  removePlayer(state, playerId);
  state.board.locations[targetLocationId].push(playerId);
  player.locationId = targetLocationId;
  player.flags.deploymentBonusActive = false;
}
