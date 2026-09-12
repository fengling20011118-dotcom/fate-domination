import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { playerIgnoresDefeat } from "./defeat.ts";
import { gainMana } from "./resources.ts";
import { payManaCost } from "./costs.ts";
import { getStructuredDeploymentDestinations, getStructuredMovementCost, isStructuredDeploymentResourceGainForbidden, isStructuredMovementDestinationForbidden } from "./rule-modifiers.ts";
import { isPlayerExitBlockedBySameLocationRule, syncPersistentLocationAdvantage } from "./location-rules.ts";
import { isPlayerUnaffectedBySituation } from "./situation-immunity.ts";
import { isBattlefieldLocation } from "./battlefield-rules.ts";
import { getLinkedEntryCommandSealCost } from "./linked-player-rules.ts";
import { assertCommandSealCostPayable, payCommandSealCost } from "./command-seals.ts";
import { isPlayerExitBlockedByLostbeltObjective } from "./lostbelt.ts";
import { isIndiaFadingTownExitBlocked } from "./india-lostbelt.ts";
import { applyLocationEntryDiscards, getLocationRouteLeaveManaCost, resolveLocationEntryPayments, type LocationAccessPayment } from "./location-access-rules.ts";

const locationOrder = ["workshop", "mountain", "city", "scouting"] as const;
const moveCosts: Record<string, number> = { workshop: 2, mountain: 2, city: 1 };
const capacities: Record<string, number | null> = { workshop: 4, mountain: null, city: null, scouting: 1 };

export interface MovementResult {
  previousLocationId: string;
  locationId: string;
  distance: number;
  cost: number;
}

export interface DeploymentAdvantageBidRule {
  sourceId: string;
  controllerPlayerId: string;
  locationId: "mountain" | "city";
  round: number;
  maxPayment: number;
}

export interface MovementArrowOverride {
  sourceId: string;
  sourceInstanceId: string;
  arrows: Record<string, string>;
}

function liveMovementArrowOverrides(state: GameState): MovementArrowOverride[] {
  const raw = state.modeState.movementArrowOverrides;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is MovementArrowOverride => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as MovementArrowOverride;
    const source = state.cards[candidate.sourceInstanceId];
    return Boolean(candidate.sourceId && candidate.sourceInstanceId && candidate.arrows && typeof candidate.arrows === "object"
      && source && source.zone !== "removed" && source.zone !== "discard" && source.active === true && source.face === "up");
  });
}

/** Install a source-bound global movement-arrow graph without teaching board rules a character id. */
export function setMovementArrowOverride(state: GameState, override: MovementArrowOverride): void {
  const source = state.cards[override.sourceInstanceId];
  if (!source) throw new Error("MOVEMENT_ARROW_OVERRIDE_SOURCE_MISSING");
  for (const [from, to] of Object.entries(override.arrows)) {
    if (!(from in state.board.locations) || !(to in state.board.locations) || from === to) throw new Error("MOVEMENT_ARROW_OVERRIDE_INVALID");
  }
  const current = Array.isArray(state.modeState.movementArrowOverrides)
    ? state.modeState.movementArrowOverrides.filter((item): item is MovementArrowOverride => Boolean(item && typeof item === "object"))
    : [];
  state.modeState.movementArrowOverrides = [...current.filter((item) => item.sourceId !== override.sourceId), structuredClone(override)];
}

export function clearMovementArrowOverride(state: GameState, sourceId: string): void {
  const current = Array.isArray(state.modeState.movementArrowOverrides) ? state.modeState.movementArrowOverrides : [];
  const next = current.filter((item) => !(item && typeof item === "object" && (item as { sourceId?: unknown }).sourceId === sourceId));
  if (next.length > 0) state.modeState.movementArrowOverrides = next;
  else delete state.modeState.movementArrowOverrides;
}

function movementArrowMap(state: GameState): Record<string, string> | undefined {
  const live = liveMovementArrowOverrides(state);
  if (live.length === 0) return undefined;
  const signatures = [...new Set(live.map((item) => JSON.stringify(Object.entries(item.arrows).sort(([a], [b]) => a.localeCompare(b)))))];
  if (signatures.length > 1) throw new Error("MOVEMENT_ARROW_OVERRIDE_CONFLICT");
  return live[0].arrows;
}

function arrowRoute(state: GameState, from: string, to: string): string[] | undefined {
  const override = movementArrowMap(state);
  if (!override) {
    const fromIndex = locationOrder.indexOf(from as typeof locationOrder[number]);
    const toIndex = locationOrder.indexOf(to as typeof locationOrder[number]);
    if (fromIndex < 0 || toIndex <= fromIndex) return undefined;
    return locationOrder.slice(fromIndex + 1, toIndex + 1);
  }
  const route: string[] = [];
  const seen = new Set([from]);
  let cursor = from;
  while (cursor !== to) {
    const next = override[cursor];
    if (!next || seen.has(next)) return undefined;
    route.push(next);
    seen.add(next);
    cursor = next;
  }
  return route;
}

export function areLocationsAdjacentByMovementArrows(state: GameState, left: string, right: string): boolean {
  if (!(left in state.board.locations) || !(right in state.board.locations) || left === right) return false;
  const override = movementArrowMap(state);
  if (!override) {
    const leftIndex = locationOrder.indexOf(left as typeof locationOrder[number]);
    const rightIndex = locationOrder.indexOf(right as typeof locationOrder[number]);
    return leftIndex >= 0 && rightIndex >= 0 && Math.abs(leftIndex - rightIndex) === 1;
  }
  return override[left] === right || override[right] === left;
}

export interface DeployPlayerOptions {
  victoryPointsPayment?: number;
  /** A scheduled deployment effect may let the player deliberately take +3, +1, or no printed terrain. */
  terrainAdvantageChoice?: 0 | 1 | 3;
  /** Internal forced-deployment path used after another player's deployment. */
  bypassActivePlayer?: boolean;
  /** Effect-driven delayed deployment may occur outside the ordinary Outpost phase. */
  bypassPhase?: boolean;
  /** Forced followers do not recursively reserve space for their own followers. */
  reserveScheduledFollowers?: boolean;
  /** Explicit payments for generic location-entry rules. */
  locationAccessPayments?: readonly LocationAccessPayment[];
}

/** True when this player's ordinary Outpost deployment turn is replaced by another rule. */
export function playerSkipsOutpostDeployment(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  if (Number(player.flags.skipDeploymentRound ?? -1) === state.round) return true;
  if (Number(player.flags.strictForcedDeploymentRound ?? -1) !== state.round) return false;
  const sourceInstanceId = typeof player.flags.strictForcedDeploymentSourceInstanceId === "string"
    ? player.flags.strictForcedDeploymentSourceInstanceId
    : undefined;
  const source = sourceInstanceId ? state.cards[sourceInstanceId] : undefined;
  if (!source || source.zone === "removed" || source.zone === "discard") return false;
  const locationId = player.flags.forcedDeploymentLocationId;
  if (locationId !== "workshop" && locationId !== "mountain" && locationId !== "city") return true;
  if (player.flags.mustDeployBattlefieldRound === state.round && !isBattlefieldLocation(state, locationId)) return true;
  const restrictions = state.modeState.situationRestrictions as { forbiddenLocations?: string[]; workshopCapacity?: number } | undefined;
  if (restrictions?.forbiddenLocations?.includes(locationId)) return true;
  const capacity = locationId === "workshop" ? (restrictions?.workshopCapacity ?? capacities.workshop) : capacities[locationId];
  const followerCount = getScheduledDeploymentFollowerIds(state, playerId).length;
  return state.board.locations[locationId].length + 1 + followerCount > (capacity ?? Number.MAX_SAFE_INTEGER);
}

/** Source-bound movement lock used by delayed effects that cease when their physical source no longer exists. */
export function isSourceBoundMovementBlocked(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player || Number(player.flags.movementBlockedBySourceRound ?? -1) !== state.round) return false;
  const sourceInstanceId = typeof player.flags.movementBlockedBySourceInstanceId === "string"
    ? player.flags.movementBlockedBySourceInstanceId
    : undefined;
  const source = sourceInstanceId ? state.cards[sourceInstanceId] : undefined;
  return Boolean(source && source.zone !== "removed" && source.zone !== "discard");
}

/** Players scheduled to deploy immediately after this leader in the current round. */
export function getScheduledDeploymentFollowerIds(state: GameState, leaderPlayerId: string): string[] {
  return state.turnOrder.filter((playerId) => {
    const player = state.players[playerId];
    return Boolean(player && !player.eliminated
      && Number(player.flags.followDeploymentRound ?? -1) === state.round
      && player.flags.followDeploymentPlayerId === leaderPlayerId);
  });
}

function deploymentAdvantageBidRules(state: GameState): DeploymentAdvantageBidRule[] {
  const value = state.modeState.deploymentAdvantageBidRules;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DeploymentAdvantageBidRule => Boolean(item)
    && typeof item === "object"
    && typeof (item as DeploymentAdvantageBidRule).sourceId === "string"
    && typeof (item as DeploymentAdvantageBidRule).controllerPlayerId === "string"
    && ((item as DeploymentAdvantageBidRule).locationId === "mountain" || (item as DeploymentAdvantageBidRule).locationId === "city")
    && Number.isInteger((item as DeploymentAdvantageBidRule).round)
    && Number.isInteger((item as DeploymentAdvantageBidRule).maxPayment));
}

/** Adds a reusable next-round deployment rule without coupling board logic to a character id. */
export function addDeploymentAdvantageBidRule(state: GameState, rule: DeploymentAdvantageBidRule): void {
  if (!Number.isInteger(rule.round) || rule.round < 0 || !Number.isInteger(rule.maxPayment) || rule.maxPayment < 0) {
    throw new Error("DEPLOYMENT_ADVANTAGE_BID_RULE_INVALID");
  }
  const rules = deploymentAdvantageBidRules(state).filter((item) => !(item.sourceId === rule.sourceId
    && item.controllerPlayerId === rule.controllerPlayerId
    && item.locationId === rule.locationId
    && item.round === rule.round));
  state.modeState = { ...state.modeState, deploymentAdvantageBidRules: [...rules, { ...rule }] };
}

function recordMovementMetrics(player: GameState["players"][string], distance: number): void {
  player.flags.movementDistanceThisRound = Number(player.flags.movementDistanceThisRound ?? 0) + distance;
  player.flags.movementCountThisRound = Number(player.flags.movementCountThisRound ?? 0) + 1;
}

function routeLocations(previousLocationId: string, targetLocationId: string): string[] {
  const fromIndex = locationOrder.indexOf(previousLocationId as typeof locationOrder[number]);
  const toIndex = locationOrder.indexOf(targetLocationId as typeof locationOrder[number]);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return [];
  const step = toIndex > fromIndex ? 1 : -1;
  const result: string[] = [];
  for (let index = fromIndex + step; step > 0 ? index <= toIndex : index >= toIndex; index += step) {
    result.push(locationOrder[index]);
  }
  return result;
}

function recordPassedLocations(player: GameState["players"][string], locations: string[]): void {
  if (!Array.isArray(player.locationsPassedThisRound)) player.locationsPassedThisRound = [];
  player.locationsPassedThisRound.push(...locations);
}

export function recordBattlefieldCoLocation(state: GameState, locationId: string): void {
  if (!isBattlefieldLocation(state, locationId)) return;
  const playerIds = (state.board.locations[locationId] ?? []).filter((id) => state.players[id] && !state.players[id].eliminated);
  for (const playerId of playerIds) {
    const player = state.players[playerId];
    const others = playerIds.filter((id) => id !== playerId);
    player.sharedBattlefieldPlayerIdsThisRound = [...new Set([...(player.sharedBattlefieldPlayerIdsThisRound ?? []), ...others])];
  }
}

function removePlayer(state: GameState, playerId: string): void {
  for (const players of Object.values(state.board.locations)) {
    const index = players.indexOf(playerId);
    if (index >= 0) players.splice(index, 1);
  }
}

/** Remove a living player from every board location without eliminating them. */
export function isPlayerBoardExitBlockedByEffect(state: GameState, playerId: string, definitions?: Record<string, CardDefinition>): boolean {
  const player = state.players[playerId];
  if (!player || player.eliminated || !player.locationId) return true;
  if (player.flags.movementBlockedPermanent === true || player.flags.movementBlockedRound === state.round || isSourceBoundMovementBlocked(state, playerId)) return true;
  if (isBoardCardMovementLocked(state, playerId, player.locationId, "__off-board__")) return true;
  if (isPlayerExitBlockedBySameLocationRule(state, playerId, "__off-board__")) return true;
  if (definitions && isPlayerExitBlockedByLostbeltObjective(state, playerId, "__off-board__", definitions)) return true;
  if (definitions && isIndiaFadingTownExitBlocked(state, player, "__off-board__", definitions)) return true;
  const nemesisMasterId = typeof player.flags.nemesisMasterId === "string" ? player.flags.nemesisMasterId : undefined;
  if ((player.locationId === "mountain" || player.locationId === "city") && nemesisMasterId) {
    const nemesis = Object.values(state.players).find((candidate) => candidate.masterId === nemesisMasterId);
    if (nemesis?.locationId === player.locationId) return true;
  }
  return false;
}

/** Remove a living player from every board location without eliminating them. Exit-lock rules can prevent this effect. */
export function removePlayerFromBoardByEffect(state: GameState, playerId: string, definitions?: Record<string, CardDefinition>): { previousLocationId: string } {
  const player = state.players[playerId];
  if (!player || player.eliminated || !player.locationId) throw new Error("PLAYER_NOT_ON_BOARD");
  if (isPlayerBoardExitBlockedByEffect(state, playerId, definitions)) throw new Error("PLAYER_BOARD_EXIT_BLOCKED");
  const previousLocationId = player.locationId;
  removePlayer(state, playerId);
  player.locationId = null;
  player.flags.deploymentBonusActive = false;
  player.flags.deploymentBonus = 0;
  return { previousLocationId };
}

export function deployPlayer(
  state: GameState,
  playerId: string,
  locationId: "workshop" | "mountain" | "city",
  definitions?: Record<string, CardDefinition>,
  options: DeployPlayerOptions = {},
): void {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  if ((options.bypassPhase !== true && state.phase !== "outpost") || (options.bypassActivePlayer !== true && state.activePlayerId !== playerId)) throw new Error("DEPLOY_WINDOW_FORBIDDEN");
  if (options.bypassPhase !== true && options.bypassActivePlayer !== true && playerSkipsOutpostDeployment(state, playerId)) throw new Error("DEPLOYMENT_SKIPPED_THIS_ROUND");
  if (player.flags.mustDeployBattlefieldRound === state.round && !isBattlefieldLocation(state, locationId)) {
    throw new Error("DEPLOYMENT_BATTLEFIELD_REQUIRED_THIS_ROUND");
  }
  const situationRestrictions = state.modeState.situationRestrictions as { forbiddenLocations?: string[]; workshopCapacity?: number } | undefined;
  const restrictions = definitions && isPlayerUnaffectedBySituation(state, playerId, definitions) ? undefined : situationRestrictions;
  const followerCount = options.reserveScheduledFollowers === false ? 0 : getScheduledDeploymentFollowerIds(state, playerId).length;
  const baseLocations = (["workshop", "mountain", "city"] as const).filter((candidate) => {
    if (restrictions?.forbiddenLocations?.includes(candidate)) return false;
    const capacity = candidate === "workshop" ? (restrictions?.workshopCapacity ?? capacities.workshop) : capacities[candidate];
    return state.board.locations[candidate].length + 1 + followerCount <= (capacity ?? Number.MAX_SAFE_INTEGER);
  });
  const allowedLocations = definitions ? getStructuredDeploymentDestinations(state, playerId, definitions, baseLocations) : [...baseLocations];
  const scheduledRound = Number(player.flags.forcedDeploymentRound ?? -1);
  const scheduledLocation = typeof player.flags.forcedDeploymentLocationId === "string" ? player.flags.forcedDeploymentLocationId : undefined;
  const scheduledLocationAvailable = scheduledRound === state.round
    && (scheduledLocation === "workshop" || scheduledLocation === "mountain" || scheduledLocation === "city")
    && allowedLocations.includes(scheduledLocation);
  const strictForced = scheduledRound === state.round && Number(player.flags.strictForcedDeploymentRound ?? -1) === state.round
    && typeof player.flags.strictForcedDeploymentSourceInstanceId === "string"
    && Boolean(state.cards[player.flags.strictForcedDeploymentSourceInstanceId])
    && state.cards[player.flags.strictForcedDeploymentSourceInstanceId].zone !== "removed"
    && state.cards[player.flags.strictForcedDeploymentSourceInstanceId].zone !== "discard";
  if (strictForced && !scheduledLocationAvailable) throw new Error("FORCED_DEPLOYMENT_UNAVAILABLE");
  if (scheduledLocationAvailable && locationId !== scheduledLocation) throw new Error("FORCED_DEPLOYMENT_LOCATION_REQUIRED");
  if (restrictions?.forbiddenLocations?.includes(locationId)) throw new Error("LOCATION_FORBIDDEN_BY_SITUATION");
  const workshopCapacity = locationId === "workshop" ? (restrictions?.workshopCapacity ?? capacities.workshop) : capacities[locationId];
  if (state.board.locations[locationId].length + 1 + followerCount > (workshopCapacity ?? Number.MAX_SAFE_INTEGER)) throw new Error("LOCATION_FULL");
  if (!allowedLocations.includes(locationId)) throw new Error("DEPLOYMENT_DESTINATION_FORBIDDEN_BY_RULE");
  const records = state.board.outpostRecords[locationId] ?? [];
  const bidRules = isBattlefieldLocation(state, locationId)
    ? deploymentAdvantageBidRules(state).filter((rule) => rule.round === state.round
      && rule.locationId === locationId
      && rule.controllerPlayerId !== playerId)
    : [];
  const payment = options.victoryPointsPayment ?? 0;
  if (!Number.isInteger(payment) || payment < 0) throw new Error("DEPLOYMENT_VICTORY_POINT_PAYMENT_INVALID");
  const slotBonuses = locationId === "workshop" ? [2, 1, 1, 1] : [3, 1];
  const forbiddenBonuses = new Set(Array.isArray(player.flags.deploymentForbiddenBonusValues)
    ? player.flags.deploymentForbiddenBonusValues.filter((value): value is number => Number.isInteger(value))
    : []);
  let slot = records.findIndex((id, index) => id === null && !forbiddenBonuses.has(slotBonuses[index] ?? 0));
  const forcedSlotIndex = Number(player.flags.forcedDeploymentSlotIndex);
  const hasForcedSlot = Number(player.flags.forcedDeploymentSlotRound ?? -1) === state.round
    && Number.isInteger(forcedSlotIndex) && forcedSlotIndex >= -1;
  if (hasForcedSlot) {
    if (options.terrainAdvantageChoice !== undefined || payment !== 0) throw new Error("FORCED_DEPLOYMENT_SLOT_CONFLICT");
    if (forcedSlotIndex >= records.length || (forcedSlotIndex >= 0 && (records[forcedSlotIndex] !== null || forbiddenBonuses.has(slotBonuses[forcedSlotIndex] ?? 0)))) throw new Error("FORCED_DEPLOYMENT_SLOT_UNAVAILABLE");
    slot = forcedSlotIndex;
  }
  const forcedTerrainChoice = Number(player.flags.forcedDeploymentTerrainAdvantageChoice);
  const hasForcedTerrainChoice = Number(player.flags.forcedDeploymentTerrainAdvantageRound ?? -1) === state.round
    && (forcedTerrainChoice === 0 || forcedTerrainChoice === 1 || forcedTerrainChoice === 3);
  if (hasForcedTerrainChoice && options.terrainAdvantageChoice !== undefined && options.terrainAdvantageChoice !== forcedTerrainChoice) {
    throw new Error("FORCED_DEPLOYMENT_TERRAIN_CHOICE_REQUIRED");
  }
  const terrainChoice = hasForcedTerrainChoice ? forcedTerrainChoice : options.terrainAdvantageChoice;
  if (!hasForcedSlot && terrainChoice !== undefined) {
    const choiceEnabled = (hasForcedTerrainChoice || player.flags.chooseTerrainAdvantageRound === state.round)
      && scheduledLocationAvailable && locationId === scheduledLocation && isBattlefieldLocation(state, locationId);
    if (!choiceEnabled || (terrainChoice !== 0 && terrainChoice !== 1 && terrainChoice !== 3)) {
      throw new Error("DEPLOYMENT_TERRAIN_CHOICE_NOT_APPLICABLE");
    }
    if (payment !== 0) throw new Error("DEPLOYMENT_TERRAIN_CHOICE_PAYMENT_CONFLICT");
    if (terrainChoice === 0) slot = -1;
    else {
      const requestedSlot = terrainChoice === 3 ? 0 : 1;
      if (records[requestedSlot] !== null || forbiddenBonuses.has(slotBonuses[requestedSlot] ?? 0)) throw new Error("DEPLOYMENT_TERRAIN_CHOICE_UNAVAILABLE");
      slot = requestedSlot;
    }
  } else if (!hasForcedSlot && bidRules.length > 0) {
    const maxPayment = Math.min(...bidRules.map((rule) => rule.maxPayment));
    if (payment > maxPayment || payment > player.victoryPoints) throw new Error("DEPLOYMENT_VICTORY_POINT_PAYMENT_INVALID");
    slot = records.findIndex((id, index) => id === null && !forbiddenBonuses.has(slotBonuses[index] ?? 0) && (slotBonuses[index] ?? 0) <= payment);
  } else if (payment !== 0) {
    throw new Error("DEPLOYMENT_VICTORY_POINT_PAYMENT_NOT_APPLICABLE");
  }
  const locationEntry = resolveLocationEntryPayments(state, player, [locationId], definitions, options.locationAccessPayments);
  const linkedEntrySealCost = getLinkedEntryCommandSealCost(state, playerId, locationId);
  assertCommandSealCostPayable(state, playerId, linkedEntrySealCost);
  if (locationEntry.manaCost > 0) {
    payManaCost(state, player, locationEntry.manaCost, definitions, "LOCATION_ACCESS_MANA_REQUIRED");
    player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + locationEntry.manaCost;
  }
  applyLocationEntryDiscards(state, playerId, locationEntry.discardInstanceIds);
  if (linkedEntrySealCost > 0) payCommandSealCost(state, playerId, linkedEntrySealCost);
  if (player.locationId) removePlayer(state, playerId);
  state.board.locations[locationId].push(playerId);
  player.locationId = locationId;
  if (player.flags.mustDeployBattlefieldRound === state.round && isBattlefieldLocation(state, locationId)) {
    player.flags.mustDeployBattlefieldSatisfiedRound = state.round;
  }
  recordBattlefieldCoLocation(state, locationId);
  if (bidRules.length > 0) player.victoryPoints -= payment;
  if (slot >= 0) records[slot] = playerId;
  const bonus = locationId === "workshop" ? (slot === 0 ? 2 : slot >= 0 ? 1 : 0) : (slot === 0 ? 3 : slot === 1 ? 1 : 0);
  player.flags.deploymentLocationId = locationId;
  player.flags.deploymentBonus = bonus;
  player.flags.deploymentBonusActive = true;
  syncPersistentLocationAdvantage(state, playerId);
  if (scheduledRound === state.round) {
    if (strictForced) {
      player.flags.movementBlockedBySourceRound = state.round;
      player.flags.movementBlockedBySourceInstanceId = String(player.flags.strictForcedDeploymentSourceInstanceId);
    }
    delete player.flags.forcedDeploymentRound;
    delete player.flags.forcedDeploymentLocationId;
    delete player.flags.forcedDeploymentTerrainAdvantageRound;
    delete player.flags.forcedDeploymentTerrainAdvantageChoice;
    delete player.flags.chooseTerrainAdvantageRound;
    delete player.flags.strictForcedDeploymentRound;
    delete player.flags.strictForcedDeploymentSourceInstanceId;
  }
  const workshopManaForbidden = locationId === "workshop" && definitions
    ? isStructuredDeploymentResourceGainForbidden(state, playerId, "mana", locationId, definitions)
    : false;
  if (locationId === "workshop" && player.flags.noWorkshopManaGain !== true && !workshopManaForbidden) {
    gainMana(player, bonus);
    const extra = Number(player.flags.kariyaWorkshopManaBonus ?? 0);
    if (Number.isInteger(extra) && extra > 0) gainMana(player, extra);
  }
}

export interface FollowDeploymentResult {
  playerId: string;
  previousLocationId: string | null;
  locationId: "workshop" | "mountain" | "city";
}

/** Resolve all current-round forced followers immediately after the leader deploys. */
export function deployScheduledFollowers(
  state: GameState,
  leaderPlayerId: string,
  locationId: "workshop" | "mountain" | "city",
  definitions?: Record<string, CardDefinition>,
  options: { bypassPhase?: boolean } = {},
): FollowDeploymentResult[] {
  const results: FollowDeploymentResult[] = [];
  for (const followerId of getScheduledDeploymentFollowerIds(state, leaderPlayerId)) {
    const follower = state.players[followerId];
    if (!follower || follower.eliminated) continue;
    const previousLocationId = follower.locationId;
    deployPlayer(state, followerId, locationId, definitions, {
      bypassActivePlayer: true,
      bypassPhase: options.bypassPhase,
      reserveScheduledFollowers: false,
    });
    delete follower.flags.skipDeploymentRound;
    delete follower.flags.followDeploymentRound;
    delete follower.flags.followDeploymentPlayerId;
    results.push({ playerId: followerId, previousLocationId, locationId });
  }
  return results;
}

export interface RedeploySwapResult {
  playerId: string;
  previousLocationId: string;
  locationId: string;
  deploymentBonus: number;
  workshopManaGained: number;
}

function activeDeploymentSlot(state: GameState, playerId: string, locationId: string): number {
  const player = state.players[playerId];
  const records = state.board.outpostRecords[locationId as keyof typeof state.board.outpostRecords];
  if (!player || !Array.isArray(records) || player.flags.deploymentBonusActive !== true
    || player.flags.deploymentLocationId !== locationId) return -1;
  return records.findIndex((id) => id === playerId);
}

function deploymentSlotBonus(locationId: string, slot: number): number {
  if (slot < 0) return 0;
  if (locationId === "workshop") return slot === 0 ? 2 : 1;
  if (locationId === "mountain" || locationId === "city") return slot === 0 ? 3 : slot === 1 ? 1 : 0;
  return 0;
}

function canRedeploySwapTo(
  state: GameState,
  playerId: string,
  targetLocationId: string,
  swappingPlayerIds: ReadonlySet<string>,
  definitions?: Record<string, CardDefinition>,
): boolean {
  const player = state.players[playerId];
  if (!player || player.eliminated || !player.locationId || !(targetLocationId in state.board.locations)) return false;
  if (isPlayerExitBlockedBySameLocationRule(state, playerId, targetLocationId)) return false;
  const situationRestrictions = state.modeState.situationRestrictions as { forbiddenLocations?: string[]; workshopCapacity?: number } | undefined;
  const restrictions = definitions && isPlayerUnaffectedBySituation(state, playerId, definitions) ? undefined : situationRestrictions;
  if (restrictions?.forbiddenLocations?.includes(targetLocationId)) return false;
  const capacity = targetLocationId === "workshop" ? (restrictions?.workshopCapacity ?? capacities.workshop) : capacities[targetLocationId];
  const occupantsAfterRemoval = (state.board.locations[targetLocationId] ?? []).filter((id) => !swappingPlayerIds.has(id)).length;
  if (occupantsAfterRemoval + 1 > (capacity ?? Number.MAX_SAFE_INTEGER)) return false;
  if (definitions) {
    const allowed = getStructuredDeploymentDestinations(state, playerId, definitions, Object.keys(state.board.locations));
    if (!allowed.includes(targetLocationId)) return false;
  }
  return true;
}

/**
 * Atomically remove two living players from the board and redeploy each at the
 * other's exact previous board position. If either redeployment is illegal,
 * neither player is mutated. Active terrain/workshop slots transfer with the
 * position and Workshop deployment resources resolve for the arriving player.
 */
export function swapPlayerRedeployPositionsByEffect(
  state: GameState,
  firstPlayerId: string,
  secondPlayerId: string,
  definitions?: Record<string, CardDefinition>,
): RedeploySwapResult[] {
  if (firstPlayerId === secondPlayerId) throw new Error("REDEPLOY_SWAP_PLAYERS_INVALID");
  const first = state.players[firstPlayerId];
  const second = state.players[secondPlayerId];
  if (!first || !second || first.eliminated || second.eliminated || !first.locationId || !second.locationId) {
    throw new Error("REDEPLOY_SWAP_PLAYER_NOT_AVAILABLE");
  }
  const firstLocationId = first.locationId;
  const secondLocationId = second.locationId;
  if (firstLocationId === secondLocationId) return [];
  const swapping = new Set([firstPlayerId, secondPlayerId]);
  if (!canRedeploySwapTo(state, firstPlayerId, secondLocationId, swapping, definitions)
    || !canRedeploySwapTo(state, secondPlayerId, firstLocationId, swapping, definitions)) {
    return [];
  }

  const firstSlot = activeDeploymentSlot(state, firstPlayerId, firstLocationId);
  const secondSlot = activeDeploymentSlot(state, secondPlayerId, secondLocationId);
  if (firstSlot >= 0) state.board.outpostRecords[firstLocationId as keyof typeof state.board.outpostRecords][firstSlot] = null;
  if (secondSlot >= 0) state.board.outpostRecords[secondLocationId as keyof typeof state.board.outpostRecords][secondSlot] = null;
  removePlayer(state, firstPlayerId);
  removePlayer(state, secondPlayerId);
  state.board.locations[secondLocationId].push(firstPlayerId);
  state.board.locations[firstLocationId].push(secondPlayerId);
  first.locationId = secondLocationId;
  second.locationId = firstLocationId;

  const firstDestinationRecords = state.board.outpostRecords[secondLocationId as keyof typeof state.board.outpostRecords];
  const secondDestinationRecords = state.board.outpostRecords[firstLocationId as keyof typeof state.board.outpostRecords];
  if (secondSlot >= 0 && Array.isArray(firstDestinationRecords)) firstDestinationRecords[secondSlot] = firstPlayerId;
  if (firstSlot >= 0 && Array.isArray(secondDestinationRecords)) secondDestinationRecords[firstSlot] = secondPlayerId;
  const firstBonus = deploymentSlotBonus(secondLocationId, secondSlot);
  const secondBonus = deploymentSlotBonus(firstLocationId, firstSlot);
  for (const [player, locationId, bonus] of [[first, secondLocationId, firstBonus], [second, firstLocationId, secondBonus]] as const) {
    player.flags.deploymentLocationId = locationId;
    player.flags.deploymentBonus = bonus;
    player.flags.deploymentBonusActive = true;
    player.flags.movedOrRedeployedRound = state.round;
    syncPersistentLocationAdvantage(state, player.id);
    recordBattlefieldCoLocation(state, locationId);
  }

  const applyWorkshopMana = (player: typeof first, locationId: string, bonus: number): number => {
    if (locationId !== "workshop" || player.flags.noWorkshopManaGain === true) return 0;
    if (definitions && isStructuredDeploymentResourceGainForbidden(state, player.id, "mana", locationId, definitions)) return 0;
    let gained = gainMana(player, bonus);
    const extra = Number(player.flags.kariyaWorkshopManaBonus ?? 0);
    if (Number.isInteger(extra) && extra > 0) gained += gainMana(player, extra);
    return gained;
  };
  const firstWorkshopMana = applyWorkshopMana(first, secondLocationId, firstBonus);
  const secondWorkshopMana = applyWorkshopMana(second, firstLocationId, secondBonus);
  return [
    { playerId: firstPlayerId, previousLocationId: firstLocationId, locationId: secondLocationId, deploymentBonus: firstBonus, workshopManaGained: firstWorkshopMana },
    { playerId: secondPlayerId, previousLocationId: secondLocationId, locationId: firstLocationId, deploymentBonus: secondBonus, workshopManaGained: secondWorkshopMana },
  ];
}

/** Reassign every printed deployment-advantage slot at one battlefield to a player. */
export function claimAllBattlefieldAdvantages(
  state: GameState,
  playerId: string,
  locationId: "mountain" | "city",
): { previousOwnerIds: string[]; bonus: number } {
  const player = state.players[playerId];
  if (!player || player.eliminated || player.locationId !== locationId) throw new Error("DEPLOYMENT_ADVANTAGE_PLAYER_INVALID");
  const records = state.board.outpostRecords[locationId];
  if (!Array.isArray(records) || records.length < 2) throw new Error("DEPLOYMENT_ADVANTAGE_SLOTS_INVALID");
  const previousOwnerIds = [...new Set(records.filter((id): id is string => typeof id === "string" && id !== playerId))];
  for (const previousOwnerId of previousOwnerIds) {
    const previousOwner = state.players[previousOwnerId];
    if (!previousOwner) continue;
    if (previousOwner.flags.deploymentLocationId === locationId) previousOwner.flags.deploymentBonusActive = false;
  }
  records[0] = playerId;
  records[1] = playerId;
  player.flags.deploymentLocationId = locationId;
  player.flags.deploymentBonus = 4;
  player.flags.deploymentBonusActive = true;
  // Claiming both printed terrain slots is the core's structured redeploy operation.
  // Record it generically so card rules can react to "moved or redeployed this round"
  // without knowing which character caused the redeployment.
  player.flags.movedOrRedeployedRound = state.round;
  return { previousOwnerIds, bonus: 4 };
}

/** Move a player's deployment marker to one currently free printed battlefield terrain slot. */
export function redeployToFreeBattlefieldAdvantage(
  state: GameState,
  playerId: string,
  locationId: "mountain" | "city",
  terrainAdvantage: 1 | 3,
): { slot: number; bonus: 1 | 3 } {
  const player = state.players[playerId];
  if (!player || player.eliminated || player.locationId !== locationId) throw new Error("REDEPLOY_PLAYER_INVALID");
  const records = state.board.outpostRecords[locationId];
  if (!Array.isArray(records) || records.length < 2) throw new Error("DEPLOYMENT_ADVANTAGE_SLOTS_INVALID");
  const slot = terrainAdvantage === 3 ? 0 : 1;
  if (records[slot] !== null) throw new Error("REDEPLOY_TERRAIN_NOT_FREE");
  for (let index = 0; index < records.length; index += 1) {
    if (records[index] === playerId) records[index] = null;
  }
  records[slot] = playerId;
  player.flags.deploymentLocationId = locationId;
  player.flags.deploymentBonus = terrainAdvantage;
  player.flags.deploymentBonusActive = true;
  player.flags.movedOrRedeployedRound = state.round;
  return { slot, bonus: terrainAdvantage };
}

function isBoardCardMovementLocked(state: GameState, playerId: string, fromLocationId: string, toLocationId: string): boolean {
  return Object.values(state.cards).some((source) => {
    if (source.zone !== "board" || source.active !== true || source.boardOpponentMovementLockWhileOwnerPresent !== true) return false;
    if (!source.boardLocationId || (source.boardLocationId !== fromLocationId && source.boardLocationId !== toLocationId)) return false;
    if (!source.ownerPlayerId || source.ownerPlayerId === playerId) return false;
    const owner = state.players[source.ownerPlayerId];
    return Boolean(owner && !owner.eliminated && owner.locationId === source.boardLocationId);
  });
}

/**
 * Authored skill-zone passives may explicitly prevent card effects from
 * restricting this player's movement. The tag lives on the card definition so
 * the board core never branches on a character or skill id.
 */
function ignoresCardEffectMovementRestrictions(
  state: GameState,
  playerId: string,
  definitions?: Record<string, CardDefinition>,
): boolean {
  const player = state.players[playerId];
  if (!player || !definitions) return false;
  return [...player.masterSkills, ...player.servantSkills].some((instanceId) => {
    const instance = state.cards[instanceId];
    if (!instance || instance.ownerPlayerId !== playerId
      || (instance.zone !== "master-skills" && instance.zone !== "servant-skills")) return false;
    return Boolean(definitions[instance.definitionId]?.tags?.includes("skill-zone-movement-restriction-immunity"));
  });
}

/** Releases every printed terrain slot currently claimed by one player at a battlefield. */
export function releaseBattlefieldAdvantages(
  state: GameState,
  playerId: string,
  locationId: "mountain" | "city",
): number {
  const records = state.board.outpostRecords[locationId];
  if (!Array.isArray(records) || records.length < 2) throw new Error("DEPLOYMENT_ADVANTAGE_SLOTS_INVALID");
  let released = 0;
  for (let index = 0; index < records.length; index += 1) {
    if (records[index] !== playerId) continue;
    records[index] = null;
    released += 1;
  }
  const player = state.players[playerId];
  if (player?.flags.deploymentLocationId === locationId) {
    player.flags.deploymentBonusActive = false;
    player.flags.deploymentBonus = 0;
  }
  return released;
}

export function movePlayer(
  state: GameState,
  playerId: string,
  targetLocationId: string,
  ignoreEngagement = false,
  definitions?: Record<string, CardDefinition>,
  options: { locationAccessPayments?: readonly LocationAccessPayment[] } = {},
): number {
  const player = state.players[playerId];
  if (!player || player.eliminated || !player.locationId) throw new Error("PLAYER_NOT_ON_BOARD");
  if (!(targetLocationId in state.board.locations)) throw new Error("LOCATION_NOT_FOUND");
  if (state.phase !== "action" || state.activePlayerId !== playerId || state.step !== "move-decision") throw new Error("MOVE_WINDOW_FORBIDDEN");
  if (player.defeated && !playerIgnoresDefeat(state, player, definitions)) throw new Error("PLAYER_DEFEATED");
  const ignoresCardMovementRestrictions = ignoresCardEffectMovementRestrictions(state, playerId, definitions);
  const ownActionCombatMovementLocked = player.flags.movementLockedOwnActionCombat === true
    && state.activePlayerId === playerId
    && (state.phase === "action" || state.phase === "combat");
  const ownTurnMovementLocked = player.flags.movementBlockedOwnTurnRound === state.round && state.activePlayerId === playerId;
  if (!ignoresCardMovementRestrictions
    && (player.flags.movementBlockedPermanent === true || player.flags.movementBlockedRound === state.round || player.flags.regularMovementBlockedRound === state.round
      || ownActionCombatMovementLocked || ownTurnMovementLocked || isSourceBoundMovementBlocked(state, playerId))) throw new Error("PLAYER_MOVEMENT_BLOCKED");
  if (!ignoresCardMovementRestrictions && isBoardCardMovementLocked(state, playerId, player.locationId, targetLocationId)) throw new Error("MOVEMENT_BLOCKED_BY_BOARD_CARD");
  if (!ignoresCardMovementRestrictions && isPlayerExitBlockedBySameLocationRule(state, playerId, targetLocationId)) throw new Error("MOVEMENT_BLOCKED_BY_LOCATION_RULE");
  if (!ignoresCardMovementRestrictions && definitions && isPlayerExitBlockedByLostbeltObjective(state, playerId, targetLocationId, definitions)) throw new Error("MOVEMENT_BLOCKED_BY_EVENT");
  if (!ignoresCardMovementRestrictions && definitions && isIndiaFadingTownExitBlocked(state, player, targetLocationId, definitions)) throw new Error("MOVEMENT_BLOCKED_BY_EVENT");
  const nemesisMasterId = typeof player.flags.nemesisMasterId === "string" ? player.flags.nemesisMasterId : undefined;
  if (!ignoresCardMovementRestrictions && (player.locationId === "mountain" || player.locationId === "city") && nemesisMasterId) {
    const nemesis = Object.values(state.players).find((candidate) => candidate.masterId === nemesisMasterId);
    if (nemesis?.locationId === player.locationId) throw new Error("KARIYA_NEMESIS_CANNOT_LEAVE");
  }
  if (!ignoresCardMovementRestrictions && definitions && isStructuredMovementDestinationForbidden(state, playerId, definitions, { method: "regular", fromLocationId: player.locationId, toLocationId: targetLocationId })) throw new Error("MOVEMENT_DESTINATION_FORBIDDEN_BY_RULE");
  const situationRestrictions = state.modeState.situationRestrictions as { forbiddenLocations?: string[]; workshopCapacity?: number } | undefined;
  const restrictions = ignoresCardMovementRestrictions || (definitions && isPlayerUnaffectedBySituation(state, playerId, definitions)) ? undefined : situationRestrictions;
  if (restrictions?.forbiddenLocations?.includes(targetLocationId)) throw new Error("LOCATION_FORBIDDEN_BY_SITUATION");
  const movementRoute = arrowRoute(state, player.locationId, targetLocationId);
  if (!movementRoute || movementRoute.length === 0) throw new Error("MOVE_MUST_FOLLOW_ARROW");
  const currentPlayers = state.board.locations[player.locationId];
  const engagementIgnored = player.flags.ignoreEngagement === true
    || currentPlayers.some((occupantId) => occupantId !== playerId && state.players[occupantId]?.flags.ignoreOthersEngagement === true);
  if (!ignoreEngagement && !engagementIgnored && isBattlefieldLocation(state, player.locationId) && currentPlayers.length > 1) {
    throw new Error("ENGAGED_CANNOT_MOVE");
  }
  if (state.board.locations[targetLocationId].length >= (capacities[targetLocationId] ?? Number.MAX_SAFE_INTEGER)) throw new Error("LOCATION_FULL");

  let cost = 0;
  const discount = Math.max(0, Number(player.flags.movementManaDiscountPerSpace ?? 0));
  if (!Number.isInteger(discount)) throw new Error("MOVEMENT_DISCOUNT_INVALID");
  let routeSource = player.locationId;
  for (const routeTarget of movementRoute) {
    cost += Math.max(0, (moveCosts[routeSource] ?? 0) - discount) + Math.max(0, Number(player.flags.kariyaMoveSurcharge ?? 0));
    routeSource = routeTarget;
  }
  if (definitions) cost = getStructuredMovementCost(state, playerId, definitions, cost, { method: "regular", fromLocationId: player.locationId, toLocationId: targetLocationId });
  const routeSources = [player.locationId, ...movementRoute.slice(0, -1)];
  cost += getLocationRouteLeaveManaCost(state, routeSources);
  const locationEntry = resolveLocationEntryPayments(state, player, movementRoute, definitions, options.locationAccessPayments);
  cost += locationEntry.manaCost;
  const linkedEntrySealCost = getLinkedEntryCommandSealCost(state, playerId, targetLocationId);
  assertCommandSealCostPayable(state, playerId, linkedEntrySealCost);
  payManaCost(state, player, cost, definitions);
  applyLocationEntryDiscards(state, playerId, locationEntry.discardInstanceIds);
  if (linkedEntrySealCost > 0) payCommandSealCost(state, playerId, linkedEntrySealCost);
  if (cost > 0) player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + cost;
  player.flags.deploymentBonusActive = false;
  recordMovementMetrics(player, movementRoute.length);
  player.flags.movedOrRedeployedRound = state.round;
  recordPassedLocations(player, movementRoute);
  removePlayer(state, playerId);
  state.board.locations[targetLocationId].push(playerId);
  player.locationId = targetLocationId;
  recordBattlefieldCoLocation(state, targetLocationId);
  syncPersistentLocationAdvantage(state, playerId);
  state.step = player.flags.actionPlayBeforeMove === true ? "settlement" : "play-batch-draft";
  return cost;
}

/** Free movement granted by a card effect; it does not follow the normal arrow or cost. */
export function movePlayerOneSpaceByEffect(
  state: GameState,
  playerId: string,
  direction: "forward" | "backward",
  definitions?: Record<string, CardDefinition>,
  options: { ignoreDestinationCapacity?: boolean } = {},
): MovementResult {
  const player = state.players[playerId];
  if (!player?.locationId) throw new Error("PLAYER_NOT_ON_BOARD");
  const override = movementArrowMap(state);
  let targetLocationId: string | undefined;
  if (override) {
    targetLocationId = direction === "forward"
      ? override[player.locationId]
      : Object.entries(override).find(([, target]) => target === player.locationId)?.[0];
  } else {
    const currentIndex = locationOrder.indexOf(player.locationId as typeof locationOrder[number]);
    if (currentIndex < 0) throw new Error("PLAYER_NOT_ON_BOARD");
    const targetIndex = currentIndex + (direction === "forward" ? 1 : -1);
    if (targetIndex >= 0 && targetIndex < locationOrder.length) targetLocationId = locationOrder[targetIndex];
  }
  if (!targetLocationId) throw new Error("MOVEMENT_ONE_SPACE_UNAVAILABLE");
  return movePlayerByEffect(state, playerId, targetLocationId, definitions, options);
}

export function movePlayerByEffect(state: GameState, playerId: string, targetLocationId: string, definitions?: Record<string, CardDefinition>, options: { ignoreDestinationCapacity?: boolean } = {}): MovementResult {
  const player = state.players[playerId];
  if (!player || player.eliminated || !player.locationId) throw new Error("PLAYER_NOT_ON_BOARD");
  if (!(targetLocationId in state.board.locations)) throw new Error("LOCATION_NOT_FOUND");
  const ignoresCardMovementRestrictions = ignoresCardEffectMovementRestrictions(state, playerId, definitions);
  const ownActionCombatMovementLocked = player.flags.movementLockedOwnActionCombat === true
    && state.activePlayerId === playerId
    && (state.phase === "action" || state.phase === "combat");
  const ownTurnMovementLocked = player.flags.movementBlockedOwnTurnRound === state.round && state.activePlayerId === playerId;
  if (!ignoresCardMovementRestrictions && (player.flags.movementBlockedPermanent === true || player.flags.movementBlockedRound === state.round
    || ownActionCombatMovementLocked || ownTurnMovementLocked || isSourceBoundMovementBlocked(state, playerId))) throw new Error("PLAYER_MOVEMENT_BLOCKED");
  if (!ignoresCardMovementRestrictions && isBoardCardMovementLocked(state, playerId, player.locationId, targetLocationId)) throw new Error("MOVEMENT_BLOCKED_BY_BOARD_CARD");
  if (!ignoresCardMovementRestrictions && isPlayerExitBlockedBySameLocationRule(state, playerId, targetLocationId)) throw new Error("MOVEMENT_BLOCKED_BY_LOCATION_RULE");
  if (!ignoresCardMovementRestrictions && definitions && isPlayerExitBlockedByLostbeltObjective(state, playerId, targetLocationId, definitions)) throw new Error("MOVEMENT_BLOCKED_BY_EVENT");
  if (!ignoresCardMovementRestrictions && definitions && isIndiaFadingTownExitBlocked(state, player, targetLocationId, definitions)) throw new Error("MOVEMENT_BLOCKED_BY_EVENT");
  if (!ignoresCardMovementRestrictions && definitions && isStructuredMovementDestinationForbidden(state, playerId, definitions, { method: "effect", fromLocationId: player.locationId, toLocationId: targetLocationId })) throw new Error("MOVEMENT_DESTINATION_FORBIDDEN_BY_RULE");
  const situationRestrictions = state.modeState.situationRestrictions as { forbiddenLocations?: string[]; workshopCapacity?: number } | undefined;
  const restrictions = ignoresCardMovementRestrictions || (definitions && isPlayerUnaffectedBySituation(state, playerId, definitions)) ? undefined : situationRestrictions;
  if (restrictions?.forbiddenLocations?.includes(targetLocationId)) throw new Error("LOCATION_FORBIDDEN_BY_SITUATION");
  if (options.ignoreDestinationCapacity !== true) {
    if (targetLocationId === "scouting" && state.board.locations.scouting.length >= 1) throw new Error("LOCATION_FULL");
    if (targetLocationId === "workshop" && state.board.locations.workshop.length >= (restrictions?.workshopCapacity ?? capacities.workshop)) throw new Error("LOCATION_FULL");
  }
  const linkedEntrySealCost = getLinkedEntryCommandSealCost(state, playerId, targetLocationId);
  assertCommandSealCostPayable(state, playerId, linkedEntrySealCost);
  if (linkedEntrySealCost > 0) payCommandSealCost(state, playerId, linkedEntrySealCost);
  const previousLocationId = player.locationId;
  const previousIndex = locationOrder.indexOf(previousLocationId as typeof locationOrder[number]);
  const targetIndex = locationOrder.indexOf(targetLocationId as typeof locationOrder[number]);
  const distance = previousIndex >= 0 && targetIndex >= 0 ? Math.abs(targetIndex - previousIndex) : 0;
  recordPassedLocations(player, routeLocations(previousLocationId, targetLocationId));
  removePlayer(state, playerId);
  state.board.locations[targetLocationId].push(playerId);
  player.locationId = targetLocationId;
  recordBattlefieldCoLocation(state, targetLocationId);
  player.flags.deploymentBonusActive = false;
  syncPersistentLocationAdvantage(state, playerId);
  recordMovementMetrics(player, distance);
  if (distance > 0) player.flags.movedOrRedeployedRound = state.round;
  return { previousLocationId, locationId: targetLocationId, distance, cost: 0 };
}

/**
 * Atomically exchange two living players' board locations as an effect move.
 * Each leg is preflighted with the other player vacating its destination, so a
 * one-seat location such as scouting can participate in a true swap. Normal
 * movement restrictions, destination rules and linked-entry costs still apply
 * to each moving player.
 */
export function swapPlayerLocationsByEffect(
  state: GameState,
  firstPlayerId: string,
  secondPlayerId: string,
  definitions?: Record<string, CardDefinition>,
): [MovementResult, MovementResult] {
  if (firstPlayerId === secondPlayerId) throw new Error("SWAP_PLAYERS_MUST_DIFFER");
  const first = state.players[firstPlayerId];
  const second = state.players[secondPlayerId];
  if (!first || !second || first.eliminated || second.eliminated || !first.locationId || !second.locationId) {
    throw new Error("SWAP_PLAYER_INVALID");
  }
  const firstFrom = first.locationId;
  const secondFrom = second.locationId;
  if (firstFrom === secondFrom) throw new Error("SWAP_LOCATION_MUST_DIFFER");

  const preflightLeg = (movingId: string, vacatingId: string, destinationId: string): void => {
    const draft = structuredClone(state);
    removePlayer(draft, vacatingId);
    movePlayerByEffect(draft, movingId, destinationId, definitions);
  };
  preflightLeg(firstPlayerId, secondPlayerId, secondFrom);
  preflightLeg(secondPlayerId, firstPlayerId, firstFrom);

  const firstEntrySealCost = getLinkedEntryCommandSealCost(state, firstPlayerId, secondFrom);
  const secondEntrySealCost = getLinkedEntryCommandSealCost(state, secondPlayerId, firstFrom);
  assertCommandSealCostPayable(state, firstPlayerId, firstEntrySealCost);
  assertCommandSealCostPayable(state, secondPlayerId, secondEntrySealCost);
  if (firstEntrySealCost > 0) payCommandSealCost(state, firstPlayerId, firstEntrySealCost);
  if (secondEntrySealCost > 0) payCommandSealCost(state, secondPlayerId, secondEntrySealCost);

  const firstIndex = locationOrder.indexOf(firstFrom as typeof locationOrder[number]);
  const firstTargetIndex = locationOrder.indexOf(secondFrom as typeof locationOrder[number]);
  const secondIndex = locationOrder.indexOf(secondFrom as typeof locationOrder[number]);
  const secondTargetIndex = locationOrder.indexOf(firstFrom as typeof locationOrder[number]);
  const firstDistance = firstIndex >= 0 && firstTargetIndex >= 0 ? Math.abs(firstTargetIndex - firstIndex) : 0;
  const secondDistance = secondIndex >= 0 && secondTargetIndex >= 0 ? Math.abs(secondTargetIndex - secondIndex) : 0;

  recordPassedLocations(first, routeLocations(firstFrom, secondFrom));
  recordPassedLocations(second, routeLocations(secondFrom, firstFrom));
  removePlayer(state, firstPlayerId);
  removePlayer(state, secondPlayerId);
  state.board.locations[secondFrom].push(firstPlayerId);
  state.board.locations[firstFrom].push(secondPlayerId);
  first.locationId = secondFrom;
  second.locationId = firstFrom;
  first.flags.deploymentBonusActive = false;
  second.flags.deploymentBonusActive = false;
  syncPersistentLocationAdvantage(state, firstPlayerId);
  syncPersistentLocationAdvantage(state, secondPlayerId);
  recordMovementMetrics(first, firstDistance);
  recordMovementMetrics(second, secondDistance);
  if (firstDistance > 0) first.flags.movedOrRedeployedRound = state.round;
  if (secondDistance > 0) second.flags.movedOrRedeployedRound = state.round;
  recordBattlefieldCoLocation(state, secondFrom);
  recordBattlefieldCoLocation(state, firstFrom);
  return [
    { previousLocationId: firstFrom, locationId: secondFrom, distance: firstDistance, cost: 0 },
    { previousLocationId: secondFrom, locationId: firstFrom, distance: secondDistance, cost: 0 },
  ];
}
