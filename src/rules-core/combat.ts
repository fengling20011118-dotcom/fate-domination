import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition, EventDefinition } from "./content-types.ts";
import { closePlayerCard, returnCardsToDeckOnDefeat } from "./decks.ts";
import { StateRandom } from "../match-engine/random.ts";
import { calculateCombatPower, collectCombatAttributes } from "./combat-power.ts";
import { isJekyll } from "./jekyll-hyde.ts";

const locationBonus: Record<string, number> = { mountain: 2, city: 3 };

export interface CombatResult {
  locationId: "mountain" | "city";
  powers: Record<string, number>;
  winnerIds: string[];
  victoryPoints: Record<string, number>;
  scoutingPlayerId: string | null;
  attributes: Record<string, string[]>;
}

export interface CombatPowerSnapshot {
  locationId: "mountain" | "city";
  participantIds: string[];
  powers: Record<string, number>;
  attributes: Record<string, string[]>;
  round: number;
}

/** Freezes the authoritative power values before post-calculation abilities. */
export function calculateCombatSnapshot(
  state: GameState,
  locationId: "mountain" | "city",
  cards: Record<string, CardDefinition>,
): CombatPowerSnapshot {
  const participants = state.board.locations[locationId]
    .map((playerId) => state.players[playerId])
    .filter((player) => player && !player.eliminated);
  const powers: Record<string, number> = {};
  const attributes: Record<string, string[]> = {};
  for (const player of participants) {
    attributes[player.id] = collectCombatAttributes(state, player, cards);
    powers[player.id] = calculateCombatPower(state, player, cards, locationId);
  }
  return { locationId, participantIds: participants.map((player) => player.id), powers, attributes, round: state.round };
}

export function resolveCombat(
  state: GameState,
  locationId: "mountain" | "city",
  cards: Record<string, CardDefinition>,
  events: Record<string, EventDefinition>,
): CombatResult {
  return finalizeCombatFromSnapshot(state, calculateCombatSnapshot(state, locationId, cards), cards, events);
}

/** Applies defeat, rewards and post-result card effects to a frozen power snapshot. */
export function finalizeCombatFromSnapshot(
  state: GameState,
  snapshot: CombatPowerSnapshot,
  cards: Record<string, CardDefinition>,
  events: Record<string, EventDefinition>,
): CombatResult {
  if (snapshot.round !== state.round) throw new Error("COMBAT_SNAPSHOT_ROUND_MISMATCH");
  const { locationId, powers, attributes } = snapshot;
  const currentParticipantIds = state.board.locations[locationId].filter((playerId) => !state.players[playerId]?.eliminated);
  if (currentParticipantIds.length !== snapshot.participantIds.length
    || currentParticipantIds.some((playerId, index) => playerId !== snapshot.participantIds[index])) {
    throw new Error("COMBAT_SNAPSHOT_PARTICIPANTS_CHANGED");
  }
  const players = snapshot.participantIds.map((playerId) => state.players[playerId]);

  const eligible = players.filter((player) => !player.defeated);
  const highest = Math.max(0, ...eligible.map((player) => powers[player.id]));
  const winnerIds = eligible.filter((player) => powers[player.id] === highest).map((player) => player.id);
  const eventPoints = state.board.currentEvents[locationId]
    .reduce((sum, eventId) => sum + (events[eventId]?.victoryPoints ?? 0), 0);
  const hasOpponent = players.some((player) => !winnerIds.includes(player.id));
  const rewardPool = eventPoints + (hasOpponent && winnerIds.length > 0 ? locationBonus[locationId] : 0);
  const eachReward = winnerIds.length > 0 ? Math.ceil(rewardPool / winnerIds.length) : 0;
  const victoryPoints: Record<string, number> = {};
  for (const player of players) {
    victoryPoints[player.id] = winnerIds.includes(player.id) ? eachReward : 0;
    state.players[player.id].victoryPoints += victoryPoints[player.id];
    if (!winnerIds.includes(player.id)) {
      state.players[player.id].defeated = true;
      const random = new StateRandom();
      returnCardsToDeckOnDefeat(state, player.id, cards, (maxExclusive) => random.integer(state, maxExclusive));
    }
    if (winnerIds.includes(player.id) && player.flags.sanzangVictoryRewardRound === state.round) {
      state.players[player.id].victoryPoints += 2;
      victoryPoints[player.id] = (victoryPoints[player.id] ?? 0) + 2;
    }
    if (winnerIds.includes(player.id) && isJekyll(player)) {
      state.players[player.id].victoryPoints += 1;
      victoryPoints[player.id] = (victoryPoints[player.id] ?? 0) + 1;
    }
    if (!winnerIds.includes(player.id) && player.flags.independentActionPenaltyRound === state.round) {
      state.players[player.id].victoryPoints -= 5;
      victoryPoints[player.id] = (victoryPoints[player.id] ?? 0) - 5;
    }
    delete state.players[player.id].flags.roundPowerBonus;
    delete state.players[player.id].flags.sanzangVictoryRewardRound;
    delete state.players[player.id].flags.independentActionPenaltyRound;
  }

  // Tiamat's residual beasts resolve from the committed attack, not from UI state.
  for (const player of players) {
    const activeBeasts = player.attack
      .map((instanceId) => ({ instance: state.cards[instanceId], definition: cards[state.cards[instanceId]?.definitionId ?? ""] }))
      .filter(({ instance, definition }) => instance?.active && instance.face === "up" && definition?.tags?.includes("tiamat-beast"));
    if (activeBeasts.some(({ definition }) => definition?.tags?.includes("magic-pig")) && winnerIds.includes(player.id)) {
      for (const loser of players.filter((candidate) => !winnerIds.includes(candidate.id))) {
        const penalty = Math.min(1, state.players[loser.id].victoryPoints);
        state.players[loser.id].victoryPoints -= penalty;
        victoryPoints[loser.id] = (victoryPoints[loser.id] ?? 0) - penalty;
      }
    }
    if (!winnerIds.includes(player.id)) {
      for (const { instance, definition } of activeBeasts) {
        if (!instance || !definition?.tags?.some((tag) => tag === "primitive-dragon" || tag === "magic-pig")) continue;
        closePlayerCard(state, player.id, instance.instanceId, cards);
      }
    }
  }

  const scoutingPlayer = state.board.locations.scouting.find((playerId) => !state.players[playerId].eliminated) ?? null;
  if (scoutingPlayer && state.board.scoutingAwardedRound !== state.round) {
    state.players[scoutingPlayer].victoryPoints += 2;
    victoryPoints[scoutingPlayer] = (victoryPoints[scoutingPlayer] ?? 0) + 2;
    state.board.scoutingAwardedRound = state.round;
  }

  return { locationId, powers, winnerIds, victoryPoints, scoutingPlayerId: scoutingPlayer, attributes };
}
