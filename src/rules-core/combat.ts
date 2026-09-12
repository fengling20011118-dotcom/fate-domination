import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition, EventDefinition } from "./content-types.ts";
import { closePlayerCard, movePlayerCard, returnCardsToDeckOnDefeat } from "./decks.ts";
import { StateRandom } from "../match-engine/random.ts";
import { calculateCombatCardPower, calculateCombatPower, collectCombatAttributes, getActiveCombatCardIds, getCombatCardAttributes } from "./combat-power.ts";
import { defeatPlayer } from "./defeat.ts";
import { getStructuredCombatWinnerInclusions, getStructuredPostPowerCloseAllAttackTargetIds, getStructuredPostPowerDefeatTargetIds, getStructuredVictoryPointGainForSource, isStructuredCombatWinnerForbidden, isStructuredDefeatIgnored, isStructuredNonEffectVictoryPointGainForbidden, shouldEachCombatWinnerReceiveFullReward } from "./rule-modifiers.ts";
import { adjustVictoryPoints, gainMana, gainVictoryPoints } from "./resources.ts";
import { getBattlefieldCompetitionReward } from "./scoring.ts";
import { getEffectiveEventVictoryPoints, reserveEventUnderSource } from "./event-lifecycle.ts";
import { consumeCombatWinnerChallenges, getCombatWinnerChallenges } from "./combat-winner-challenge.ts";
import { isBattlefieldLocation, type BattlefieldLocationId } from "./battlefield-rules.ts";
import { calculateNpcCombatPower, gainNpcVictoryPoints, getNpcCombatantsAtLocation } from "./npc-combatants.ts";
import { isChineseObjectiveDefeatIgnored } from "./china-lostbelt.ts";
import { getPlayerIdsPresentAtLocation } from "./player-presences.ts";

export interface CombatResult {
  round: number;
  locationId: BattlefieldLocationId;
  /** Physical players that actually participated in this battlefield combat. */
  participantIds: string[];
  /** Non-player combatants that participated without entering physical player zones/turn order. */
  npcParticipantIds?: string[];
  powers: Record<string, number>;
  winnerIds: string[];
  npcWinnerIds?: string[];
  /** Players that entered defeated state during this combat settlement. */
  defeatedPlayerIds: string[];
  victoryPoints: Record<string, number>;
  /** Positive VP gained during settlement from player/card abilities rather than the base combat reward. */
  abilityVictoryPoints?: Record<string, number>;
  npcVictoryPoints?: Record<string, number>;
  /** Event cards present when this combat resolved, in authoritative board order. */
  eventIds: string[];
  /** Sum of printed event-card victory points before location/replacement bonuses. */
  printedEventVictoryPoints: number;
  scoutingPlayerId: string | null;
  attributes: Record<string, string[]>;
  /** Final contribution and attributes for each active attack card. */
  cardPowers?: Record<string, Record<string, number>>;
  cardAttributes?: Record<string, Record<string, string[]>>;
  /** Victory-point totals frozen before combat rewards are applied. */
  participantVictoryPointsBeforeCombat?: Record<string, number>;
}

export interface CombatPowerSnapshot {
  locationId: BattlefieldLocationId;
  participantIds: string[];
  npcParticipantIds?: string[];
  powers: Record<string, number>;
  npcPowers?: Record<string, number>;
  attributes: Record<string, string[]>;
  /** Victory-point totals frozen with the combat snapshot. */
  participantVictoryPointsBeforeCombat?: Record<string, number>;
  cardPowers?: Record<string, Record<string, number>>;
  cardAttributes?: Record<string, Record<string, string[]>>;
  round: number;
}

export interface CombatObjectiveRewardReplacement {
  round: number;
  locationId: BattlefieldLocationId;
  playerId: string;
  eventId: string;
  sourceId: string;
  reservationId: string;
}

const COMBAT_OBJECTIVE_REPLACEMENTS_KEY = "combatObjectiveRewardReplacements";

function combatObjectiveRewardReplacements(state: GameState): CombatObjectiveRewardReplacement[] {
  const raw = state.modeState[COMBAT_OBJECTIVE_REPLACEMENTS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is CombatObjectiveRewardReplacement => Boolean(item && typeof item === "object"
    && Number.isInteger((item as CombatObjectiveRewardReplacement).round)
    && typeof (item as CombatObjectiveRewardReplacement).locationId === "string"
    && typeof (item as CombatObjectiveRewardReplacement).playerId === "string"
    && typeof (item as CombatObjectiveRewardReplacement).eventId === "string"
    && typeof (item as CombatObjectiveRewardReplacement).sourceId === "string"
    && typeof (item as CombatObjectiveRewardReplacement).reservationId === "string"));
}

/** Arm a one-combat, per-winner replacement for one objective's normal VP reward. */
export function armCombatObjectiveRewardReplacement(state: GameState, replacement: CombatObjectiveRewardReplacement): void {
  if (replacement.round !== state.round || !isBattlefieldLocation(state, replacement.locationId)
    || !state.players[replacement.playerId] || !replacement.eventId || !replacement.sourceId || !replacement.reservationId) {
    throw new Error("COMBAT_OBJECTIVE_REPLACEMENT_INVALID");
  }
  if (!(state.board.currentEvents[replacement.locationId] ?? []).includes(replacement.eventId)) throw new Error("COMBAT_OBJECTIVE_REPLACEMENT_EVENT_NOT_PRESENT");
  const current = combatObjectiveRewardReplacements(state).filter((item) => !(item.round === replacement.round
    && item.locationId === replacement.locationId && item.playerId === replacement.playerId));
  state.modeState[COMBAT_OBJECTIVE_REPLACEMENTS_KEY] = [...current, { ...replacement }];
}

function clearCombatObjectiveRewardReplacements(state: GameState, round: number, locationId: BattlefieldLocationId): void {
  const remaining = combatObjectiveRewardReplacements(state).filter((item) => item.round !== round || item.locationId !== locationId);
  if (remaining.length > 0) state.modeState[COMBAT_OBJECTIVE_REPLACEMENTS_KEY] = remaining;
  else delete state.modeState[COMBAT_OBJECTIVE_REPLACEMENTS_KEY];
}

/** Freezes the authoritative power values before post-calculation abilities. */
export function calculateCombatSnapshot(
  state: GameState,
  locationId: BattlefieldLocationId,
  cards: Record<string, CardDefinition>,
): CombatPowerSnapshot {
  // Generic linked-owner cards can require their physical owner to participate
  // in the controller's combat. Close them before freezing combat state so they
  // contribute neither power nor ongoing text when that requirement is false.
  for (const controllerId of getPlayerIdsPresentAtLocation(state, locationId)) {
    const controller = state.players[controllerId];
    if (!controller || controller.eliminated) continue;
    for (const instanceId of [...controller.attack]) {
      const instance = state.cards[instanceId];
      const definition = instance ? cards[instance.definitionId] : undefined;
      if (!instance || definition?.closeIfLinkedOwnerAbsentFromCombat !== true
        || !instance.ownerPlayerId || !instance.controllerPlayerId || instance.ownerPlayerId === instance.controllerPlayerId) continue;
      const owner = state.players[instance.ownerPlayerId];
      if (owner && !owner.eliminated && owner.locationId === locationId) continue;
      closePlayerCard(state, controller.id, instanceId, cards);
    }
  }
  const participants = getPlayerIdsPresentAtLocation(state, locationId)
    .map((playerId) => state.players[playerId])
    .filter((player) => player && !player.eliminated);
  const npcParticipants = getNpcCombatantsAtLocation(state, locationId, cards);
  const powers: Record<string, number> = {};
  const npcPowers: Record<string, number> = {};
  const attributes: Record<string, string[]> = {};
  const cardPowers: Record<string, Record<string, number>> = {};
  const cardAttributes: Record<string, Record<string, string[]>> = {};
  for (const player of participants) {
    for (const instanceId of player.hand) {
      const instance = state.cards[instanceId];
      if (!instance?.combatHandRule?.revealWhenOwnerFights) continue;
      instance.face = "up";
      instance.active = false;
      instance.combatHandRevealedRound = state.round;
    }
    attributes[player.id] = collectCombatAttributes(state, player, cards);
    powers[player.id] = calculateCombatPower(state, player, cards, locationId);
    cardPowers[player.id] = {};
    cardAttributes[player.id] = {};
    for (const instanceId of getActiveCombatCardIds(state, player)) {
      const definition = cards[state.cards[instanceId]?.definitionId ?? ""];
      cardPowers[player.id][instanceId] = calculateCombatCardPower(state, player, instanceId, cards, locationId);
      cardAttributes[player.id][instanceId] = definition ? getCombatCardAttributes(state, player, instanceId, cards) : [];
    }
  }
  for (const npc of npcParticipants) {
    const power = calculateNpcCombatPower(state, npc, locationId, cards);
    npcPowers[npc.id] = power;
    powers[npc.id] = power;
  }
  const participantVictoryPointsBeforeCombat = Object.fromEntries(participants.map((player) => [player.id, player.victoryPoints]));
  return {
    locationId,
    participantIds: participants.map((player) => player.id),
    npcParticipantIds: npcParticipants.map((npc) => npc.id),
    powers,
    npcPowers,
    attributes,
    participantVictoryPointsBeforeCombat,
    cardPowers,
    cardAttributes,
    round: state.round,
  };
}

export function resolveCombat(
  state: GameState,
  locationId: BattlefieldLocationId,
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
  const currentParticipantIds = getPlayerIdsPresentAtLocation(state, locationId).filter((playerId) => !state.players[playerId]?.eliminated);
  if (currentParticipantIds.length !== snapshot.participantIds.length
    || currentParticipantIds.some((playerId, index) => playerId !== snapshot.participantIds[index])) {
    throw new Error("COMBAT_SNAPSHOT_PARTICIPANTS_CHANGED");
  }
  const players = snapshot.participantIds.map((playerId) => state.players[playerId]);
  const currentNpcParticipants = getNpcCombatantsAtLocation(state, locationId, cards);
  const currentNpcIds = currentNpcParticipants.map((npc) => npc.id);
  const snapshotNpcIds = snapshot.npcParticipantIds ?? [];
  if (currentNpcIds.length !== snapshotNpcIds.length || currentNpcIds.some((npcId, index) => npcId !== snapshotNpcIds[index])) {
    throw new Error("COMBAT_SNAPSHOT_NPC_PARTICIPANTS_CHANGED");
  }

  // Some continuous rules trigger immediately after the frozen total-power
  // calculation and close the affected player's attacks before winner choice.
  // Recalculate that player's power after closure so the same generic combat
  // pipeline can continue without any character-specific branch.
  for (const playerId of getStructuredPostPowerCloseAllAttackTargetIds(state, snapshot.participantIds, powers, cards)) {
    const player = state.players[playerId];
    if (!player) continue;
    for (const instanceId of [...player.attack]) {
      const card = state.cards[instanceId];
      if (!card?.active || card.face !== "up") continue;
      closePlayerCard(state, playerId, instanceId, cards);
    }
    powers[playerId] = calculateCombatPower(state, player, cards, locationId);
  }

  // Activated combat text may schedule deterministic defeat immediately after
  // the frozen power calculation.  Resolve it before winner selection so a
  // defeated player is excluded exactly like any other pre-resolution defeat.
  const postPowerDefeatedPlayerIds: string[] = [];
  for (const playerId of getStructuredPostPowerDefeatTargetIds(state, snapshot.participantIds, snapshot.cardPowers ?? {}, powers, cards)) {
    if (defeatPlayer(state, playerId)) postPowerDefeatedPlayerIds.push(playerId);
  }

  const chineseDefeatIgnored = isChineseObjectiveDefeatIgnored(state, locationId, cards);
  const eligible = players.filter((player) => (!player.defeated || chineseDefeatIgnored || isStructuredDefeatIgnored(state, player.id, cards))
    && !isStructuredCombatWinnerForbidden(state, player.id, cards));
  const highest = Math.max(0, ...eligible.map((player) => powers[player.id]), ...currentNpcParticipants.map((npc) => powers[npc.id] ?? 0));
  const baseWinnerIds = eligible.filter((player) => powers[player.id] === highest).map((player) => player.id);
  const baseNpcWinnerIds = currentNpcParticipants.filter((npc) => powers[npc.id] === highest).map((npc) => npc.id);
  const challenges = getCombatWinnerChallenges(state, locationId);
  const resolvedChallenges = challenges.map((challenge) => {
    const challenger = state.players[challenge.playerId];
    const power = challenge.powerMode === "controller-current-combat-power"
      ? calculateCombatPower(state, challenger, cards, challenger.locationId && isBattlefieldLocation(state, challenger.locationId) ? challenger.locationId : undefined)
      : challenge.power;
    if (!Number.isInteger(power) || Number(power) < 0) throw new Error("COMBAT_WINNER_CHALLENGE_POWER_INVALID");
    return { ...challenge, power: Number(power) };
  });
  const eligibleChallenges = resolvedChallenges.filter((challenge) => {
    const challenger = state.players[challenge.playerId];
    if (!challenger || challenger.eliminated || (challenger.defeated && !isStructuredDefeatIgnored(state, challenger.id, cards))) return false;
    return challenge.strictHigher ? challenge.power > highest : challenge.power >= highest;
  });
  const highestChallengePower = Math.max(-1, ...eligibleChallenges.map((challenge) => challenge.power));
  const challengeWinnerIds = eligibleChallenges.filter((challenge) => challenge.power === highestChallengePower).map((challenge) => challenge.playerId);
  const primaryWinnerIds = challengeWinnerIds.length > 0 ? challengeWinnerIds : baseWinnerIds;
  const npcWinnerIds = challengeWinnerIds.length > 0 ? [] : baseNpcWinnerIds;
  const includedWinnerIds = getStructuredCombatWinnerInclusions(state, snapshot.participantIds, cards, primaryWinnerIds);
  const winnerIds = [...new Set([...primaryWinnerIds, ...includedWinnerIds])];
  const resolvedPowers = { ...powers };
  for (const challenge of resolvedChallenges) resolvedPowers[challenge.playerId] = challenge.power;
  const eventIds = state.board.currentEvents[locationId] ?? [];
  const printedEventPoints = eventIds
    .reduce((sum, eventId) => sum + (events[eventId]?.victoryPoints ?? 0), 0);
  const effectiveEventPoints = eventIds.reduce((sum, eventId) =>
    sum + getEffectiveEventVictoryPoints(state, eventId, events[eventId]?.victoryPoints ?? 0), 0);
  // Leonardo's passive changes the shared event reward after per-event structured overrides.
  const eventRewardBonus = players.some((player) => Number(player.flags.leonardoEventRewardBonus ?? 0) > 0)
    ? Math.max(...players.map((player) => Number(player.flags.leonardoEventRewardBonus ?? 0)), 0)
    : 0;
  const eventPoints = effectiveEventPoints + eventRewardBonus;
  const objectiveReplacements = combatObjectiveRewardReplacements(state)
    .filter((item) => item.round === state.round && item.locationId === locationId && eventIds.includes(item.eventId));
  const replacementEventPoints = new Map(objectiveReplacements.map((item) => [item.playerId,
    getEffectiveEventVictoryPoints(state, item.eventId, events[item.eventId]?.victoryPoints ?? 0)]));
  const combatantIds = new Set([...players.map((player) => player.id), ...currentNpcIds, ...challenges.map((challenge) => challenge.playerId)]);
  const hasOpponent = combatantIds.size >= 2;
  const competitionReward = getBattlefieldCompetitionReward(state, locationId);
  const totalWinnerCount = winnerIds.length + npcWinnerIds.length;
  const rewardPool = eventPoints + (hasOpponent && totalWinnerCount > 0 ? competitionReward : 0);
  const fullRewardEach = winnerIds.length > 0 && shouldEachCombatWinnerReceiveFullReward(state, winnerIds, cards);
  const eachReward = totalWinnerCount > 0 ? (fullRewardEach ? rewardPool : Math.ceil(rewardPool / totalWinnerCount)) : 0;
  const eventOnlyEachReward = totalWinnerCount > 0 ? (fullRewardEach ? eventPoints : Math.ceil(eventPoints / totalWinnerCount)) : 0;
  const locationOnlyRewardPool = hasOpponent && totalWinnerCount > 0 ? competitionReward : 0;
  const locationOnlyEachReward = totalWinnerCount > 0
    ? (fullRewardEach ? locationOnlyRewardPool : Math.ceil(locationOnlyRewardPool / totalWinnerCount))
    : 0;
  const victoryPoints: Record<string, number> = {};
  const abilityVictoryPoints: Record<string, number> = {};
  const npcVictoryPoints: Record<string, number> = {};
  const defeatedPlayerIds: string[] = [...postPowerDefeatedPlayerIds];
  for (const player of players) {
    if (winnerIds.includes(player.id)) {
      player.flags.combatWinRound = state.round;
      for (const card of Object.values(state.cards)) {
        if (card.ownerPlayerId === player.id && card.playBlockedUntilOwnerCombatWin) delete card.playBlockedUntilOwnerCombatWin;
      }
    } else player.flags.combatLossRound = state.round;
    const eventRewardBlocked = state.modeState.currentSituationClimax === true
      && player.flags.climaxEventVictoryPointGainBlocked === true;
    const competitionRewardBlocked = player.flags.competitionVictoryPointGainBlocked === true;
    const replacedEventPoints = replacementEventPoints.get(player.id);
    const personalEventReward = replacedEventPoints !== undefined && winnerIds.includes(player.id)
      ? (fullRewardEach ? Math.max(0, eventPoints - replacedEventPoints) : Math.ceil(Math.max(0, eventPoints - replacedEventPoints) / totalWinnerCount))
      : eventOnlyEachReward;
    const rawObjectiveReward = winnerIds.includes(player.id) && !eventRewardBlocked ? personalEventReward : 0;
    const rawCompetitionReward = winnerIds.includes(player.id) && !competitionRewardBlocked ? locationOnlyEachReward : 0;
    const objectiveReward = getStructuredVictoryPointGainForSource(state, player.id, cards, "objective", rawObjectiveReward);
    const adjustedCompetitionReward = getStructuredVictoryPointGainForSource(state, player.id, cards, "competition", rawCompetitionReward);
    const sourceRuleChangedReward = replacedEventPoints !== undefined || objectiveReward !== rawObjectiveReward || adjustedCompetitionReward !== rawCompetitionReward;
    const baseRuleReward = winnerIds.includes(player.id)
      ? sourceRuleChangedReward
        ? objectiveReward + adjustedCompetitionReward
        : eventRewardBlocked
          ? (competitionRewardBlocked ? 0 : locationOnlyEachReward)
          : (competitionRewardBlocked ? eventOnlyEachReward : eachReward)
      : 0;
    victoryPoints[player.id] = baseRuleReward > 0 && isStructuredNonEffectVictoryPointGainForbidden(state, player.id, cards) ? 0 : baseRuleReward;
    victoryPoints[player.id] = gainVictoryPoints(state.players[player.id], victoryPoints[player.id]);
    if (winnerIds.includes(player.id) && Number(player.flags.donquixoteEventLowBonus ?? 0) > 0) {
      const lowBonus = Number(player.flags.donquixoteEventLowBonus);
      const highPenalty = Number(player.flags.donquixoteEventHighPenalty ?? 0);
      const delta = eventIds.reduce((sum, eventId) => {
        const printed = events[eventId]?.victoryPoints ?? 0;
        return sum + (printed <= 2 ? lowBonus : printed >= 4 ? -highPenalty : 0);
      }, 0);
      const appliedDelta = adjustVictoryPoints(state.players[player.id], delta);
      victoryPoints[player.id] += appliedDelta;
      if (appliedDelta > 0) abilityVictoryPoints[player.id] = (abilityVictoryPoints[player.id] ?? 0) + appliedDelta;
    }
    if (!winnerIds.includes(player.id)) {
      if (!chineseDefeatIgnored) {
        if (defeatPlayer(state, player.id)) defeatedPlayerIds.push(player.id);
        const random = new StateRandom();
        returnCardsToDeckOnDefeat(state, player.id, cards, (maxExclusive) => random.integer(state, maxExclusive));
      }
    }
    if (winnerIds.includes(player.id)) {
      const cardWinBonus = player.attack.reduce((sum, instanceId) => {
        const instance = state.cards[instanceId];
        const definition = instance ? cards[instance.definitionId] : undefined;
        if (!instance?.active || instance.face !== "up" || !definition) return sum;
        const value = Number(definition.combatWinVictoryPoints ?? 0);
        if (!Number.isInteger(value) || value < 0) throw new Error("COMBAT_WIN_CARD_VICTORY_POINTS_INVALID");
        return sum + value;
      }, 0);
      if (cardWinBonus > 0) {
        const applied = gainVictoryPoints(state.players[player.id], cardWinBonus);
        victoryPoints[player.id] = (victoryPoints[player.id] ?? 0) + applied;
        if (applied > 0) abilityVictoryPoints[player.id] = (abilityVictoryPoints[player.id] ?? 0) + applied;
      }
    }
    if (winnerIds.includes(player.id) && player.flags.sanzangVictoryRewardRound === state.round) {
      const applied = gainVictoryPoints(state.players[player.id], 2);
      victoryPoints[player.id] = (victoryPoints[player.id] ?? 0) + applied;
      if (applied > 0) abilityVictoryPoints[player.id] = (abilityVictoryPoints[player.id] ?? 0) + applied;
    }
    if (winnerIds.includes(player.id) && player.flags.commandSealVictoryPointBonusRound === state.round) {
      const bonus = Number(player.flags.commandSealVictoryPointBonus ?? 0);
      if (!Number.isInteger(bonus) || bonus < 0) throw new Error("COMMAND_SEAL_VICTORY_POINT_BONUS_INVALID");
      if (bonus > 0) {
        const applied = gainVictoryPoints(state.players[player.id], bonus);
        victoryPoints[player.id] = (victoryPoints[player.id] ?? 0) + applied;
        if (applied > 0) abilityVictoryPoints[player.id] = (abilityVictoryPoints[player.id] ?? 0) + applied;
      }
    }
    if (!winnerIds.includes(player.id) && player.flags.independentActionPenaltyRound === state.round) {
      state.players[player.id].victoryPoints -= 5;
      victoryPoints[player.id] = (victoryPoints[player.id] ?? 0) - 5;
    }
    delete state.players[player.id].flags.roundPowerBonus;
    delete state.players[player.id].flags.commandSealRoundPowerBonus;
    delete state.players[player.id].flags.commandSealVictoryPointBonusRound;
    delete state.players[player.id].flags.commandSealVictoryPointBonus;
    delete state.players[player.id].flags.chaosHunterRound;
    delete state.players[player.id].flags.sanzangVictoryRewardRound;
    delete state.players[player.id].flags.independentActionPenaltyRound;
  }

  for (const npc of currentNpcParticipants) {
    const reward = npcWinnerIds.includes(npc.id) ? eachReward : 0;
    npcVictoryPoints[npc.id] = gainNpcVictoryPoints(state, npc.id, reward);
  }

  // Settlement-time objective replacement: the objective remains present for winner/reward
  // calculation, then is reserved before post-combat events observe the board.
  for (const replacement of objectiveReplacements) {
    if (!winnerIds.includes(replacement.playerId)) continue;
    const replacementPoints = replacementEventPoints.get(replacement.playerId) ?? 0;
    gainMana(state.players[replacement.playerId], replacementPoints);
    if ((state.board.currentEvents[locationId] ?? []).includes(replacement.eventId)) {
      reserveEventUnderSource(state, replacement.reservationId, replacement.eventId, replacement.sourceId, replacement.playerId);
    }
  }
  clearCombatObjectiveRewardReplacements(state, state.round, locationId);

  const externalChallengePlayerIds = [...new Set(challenges.map((challenge) => challenge.playerId))]
    .filter((playerId) => !snapshot.participantIds.includes(playerId));
  const challengeCompetitionEachReward = totalWinnerCount > 0
    ? (fullRewardEach ? competitionReward : Math.ceil(competitionReward / totalWinnerCount))
    : 0;
  for (const playerId of externalChallengePlayerIds) {
    const player = state.players[playerId];
    if (!player || player.eliminated) continue;
    if (winnerIds.includes(playerId)) {
      player.flags.combatWinRound = state.round;
      for (const card of Object.values(state.cards)) {
        if (card.ownerPlayerId === player.id && card.playBlockedUntilOwnerCombatWin) delete card.playBlockedUntilOwnerCombatWin;
      }
      const competitionRewardBlocked = player.flags.competitionVictoryPointGainBlocked === true;
      const baseChallengeReward = competitionRewardBlocked ? 0
        : getStructuredVictoryPointGainForSource(state, player.id, cards, "competition", challengeCompetitionEachReward);
      const allowedChallengeReward = baseChallengeReward > 0 && isStructuredNonEffectVictoryPointGainForbidden(state, player.id, cards)
        ? 0
        : baseChallengeReward;
      victoryPoints[player.id] = gainVictoryPoints(player, allowedChallengeReward);
      const cardWinBonus = player.attack.reduce((sum, instanceId) => {
        const instance = state.cards[instanceId];
        const definition = instance ? cards[instance.definitionId] : undefined;
        if (!instance?.active || instance.face !== "up" || !definition) return sum;
        const value = Number(definition.combatWinVictoryPoints ?? 0);
        if (!Number.isInteger(value) || value < 0) throw new Error("COMBAT_WIN_CARD_VICTORY_POINTS_INVALID");
        return sum + value;
      }, 0);
      if (cardWinBonus > 0) {
        const applied = gainVictoryPoints(player, cardWinBonus);
        victoryPoints[player.id] += applied;
        if (applied > 0) abilityVictoryPoints[player.id] = (abilityVictoryPoints[player.id] ?? 0) + applied;
      }
      if (player.flags.commandSealVictoryPointBonusRound === state.round) {
        const bonus = Number(player.flags.commandSealVictoryPointBonus ?? 0);
        if (!Number.isInteger(bonus) || bonus < 0) throw new Error("COMMAND_SEAL_VICTORY_POINT_BONUS_INVALID");
        if (bonus > 0) {
          const applied = gainVictoryPoints(player, bonus);
          victoryPoints[player.id] += applied;
          if (applied > 0) abilityVictoryPoints[player.id] = (abilityVictoryPoints[player.id] ?? 0) + applied;
        }
      }
    } else {
      player.flags.combatLossRound = state.round;
      if (defeatPlayer(state, player.id)) defeatedPlayerIds.push(player.id);
      const random = new StateRandom();
      returnCardsToDeckOnDefeat(state, player.id, cards, (maxExclusive) => random.integer(state, maxExclusive));
    }
    delete player.flags.roundPowerBonus;
    delete player.flags.commandSealRoundPowerBonus;
    delete player.flags.commandSealVictoryPointBonusRound;
    delete player.flags.commandSealVictoryPointBonus;
    delete player.flags.chaosHunterRound;
    delete player.flags.sanzangVictoryRewardRound;
    delete player.flags.independentActionPenaltyRound;
  }
  consumeCombatWinnerChallenges(state, locationId);

  const roundElevenWinners = state.round === 11
    ? players.filter((player) => winnerIds.includes(player.id) && player.attack.some((instanceId) => {
      const definition = cards[state.cards[instanceId]?.definitionId ?? ""];
      const instance = state.cards[instanceId];
      return Boolean(instance?.active && instance.face === "up" && definition?.tags?.includes("round-eleven-victory"));
    })).map((player) => player.id)
    : [];
  if (roundElevenWinners.length > 0) {
    state.modeState = { ...state.modeState, instantVictoryIds: roundElevenWinners };
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

  // Generic residual lifecycle: some attacks remain active only until their
  // controller actually defeats at least one other player in combat. NPCs are
  // intentionally excluded because defeatedPlayerIds contains player ids only.
  for (const winnerId of winnerIds) {
    const winner = state.players[winnerId];
    if (!winner || !defeatedPlayerIds.some((playerId) => playerId !== winnerId)) continue;
    for (const instanceId of [...winner.attack]) {
      const instance = state.cards[instanceId];
      const definition = instance ? cards[instance.definitionId] : undefined;
      if (!instance?.active || instance.face !== "up" || definition?.closeAfterControllerDefeatsOtherPlayer !== true) continue;
      closePlayerCard(state, winner.id, instanceId, cards);
    }
  }

  for (const player of players) {
    const discardAfterCombat = [...player.hand].filter((instanceId) => {
      const instance = state.cards[instanceId];
      return Boolean(instance?.combatHandRule?.discardAfterCombat && instance.combatHandRevealedRound === state.round);
    });
    for (const instanceId of discardAfterCombat) {
      movePlayerCard(state, player.id, instanceId, "discard");
      const instance = state.cards[instanceId];
      instance.face = "down";
      instance.active = false;
      delete instance.combatHandRevealedRound;
    }
  }

  const scoutingPlayer = state.board.locations.scouting.find((playerId) => !state.players[playerId].eliminated) ?? null;
  if (scoutingPlayer && state.board.scoutingAwardedRound !== state.round) {
    const rawScoutingReward = state.players[scoutingPlayer].flags.scoutingVictoryPointGainBlockedRound === state.round ? 0 : 2;
    const modifiedScoutingReward = getStructuredVictoryPointGainForSource(state, scoutingPlayer, cards, "scouting", rawScoutingReward);
    const scoutingReward = isStructuredNonEffectVictoryPointGainForbidden(state, scoutingPlayer, cards) ? 0 : modifiedScoutingReward;
    const appliedScoutingReward = gainVictoryPoints(state.players[scoutingPlayer], scoutingReward);
    victoryPoints[scoutingPlayer] = (victoryPoints[scoutingPlayer] ?? 0) + appliedScoutingReward;
    state.board.scoutingAwardedRound = state.round;
  }

  return {
    round: snapshot.round,
    locationId,
    participantIds: [...snapshot.participantIds],
    npcParticipantIds: [...snapshotNpcIds],
    powers: resolvedPowers,
    winnerIds,
    npcWinnerIds,
    defeatedPlayerIds,
    victoryPoints,
    abilityVictoryPoints,
    npcVictoryPoints,
    eventIds: [...eventIds],
    printedEventVictoryPoints: printedEventPoints,
    scoutingPlayerId: scoutingPlayer,
    attributes,
    participantVictoryPointsBeforeCombat: snapshot.participantVictoryPointsBeforeCombat,
    cardPowers: snapshot.cardPowers,
    cardAttributes: snapshot.cardAttributes,
  };
}
