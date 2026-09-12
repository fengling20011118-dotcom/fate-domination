import type { GameState } from "../domain/state/types.ts";
import type { CombatPowerSnapshot } from "./combat.ts";
import type { CardDefinition } from "./content-types.ts";
import { clearCardStateBoundToClose, closePlayerCard } from "./decks.ts";
import { isOtherPlayerAbilityEffectIgnored } from "./ability-immunity.ts";

export const COMBAT_LOSS_ROUND_RESTART_RULE = "combat_loss_round_restart";

export function installCombatLossRoundRestart(
  state: GameState,
  input: { sourceId: string; sourceInstanceId: string; controllerPlayerId: string },
): void {
  const id = `${input.sourceId}:round-restart:${input.sourceInstanceId}`;
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
  state.activeRuleModifiers.push({
    id,
    sourceId: input.sourceId,
    sourceInstanceId: input.sourceInstanceId,
    controllerPlayerId: input.controllerPlayerId,
    operation: "replace",
    rule: COMBAT_LOSS_ROUND_RESTART_RULE,
    duration: "while-source-active",
    createdRound: state.round,
  });
}

function sourceIsActive(state: GameState, modifier: GameState["activeRuleModifiers"][number]): boolean {
  const source = modifier.sourceInstanceId ? state.cards[modifier.sourceInstanceId] : undefined;
  return Boolean(source && source.zone === "attack" && source.active && source.face === "up"
    && source.controllerPlayerId === modifier.controllerPlayerId);
}

export function getCombatLossRoundRestartSources(
  state: GameState,
  snapshot: CombatPowerSnapshot,
): Array<{ sourceId: string; sourceInstanceId: string; controllerPlayerId: string }> {
  const highest = Math.max(...snapshot.participantIds.map((id) => Number(snapshot.powers[id] ?? 0)));
  return (state.activeRuleModifiers ?? []).flatMap((modifier) => {
    if (modifier.rule !== COMBAT_LOSS_ROUND_RESTART_RULE || modifier.operation !== "replace" || !sourceIsActive(state, modifier)) return [];
    const playerId = modifier.controllerPlayerId;
    if (!snapshot.participantIds.includes(playerId) || Number(snapshot.powers[playerId] ?? 0) >= highest || !modifier.sourceInstanceId) return [];
    return [{ sourceId: modifier.sourceId, sourceInstanceId: modifier.sourceInstanceId, controllerPlayerId: playerId }];
  });
}

/**
 * Replay the current round from Preparation without rewinding round-scoped usage,
 * resources, statuses, or activated effects. Skills close to their skill zones;
 * ordinary non-residual attacks remain in attack face-down, matching the formal
 * deactivation ruling for replay effects.
 */
export function restartCurrentRoundFromPreparation(
  state: GameState,
  definitions: Record<string, CardDefinition>,
  sourceInstanceIds: string[],
): { deactivatedInstanceIds: string[]; activePlayerId: string | null } {
  const forcedSources = new Set(sourceInstanceIds);
  const restartSources = sourceInstanceIds.flatMap((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!instance?.controllerPlayerId) return [];
    return [{
      controllerPlayerId: instance.controllerPlayerId,
      sourceId: definition?.linkedSkillId ?? instance.definitionId,
    }];
  });
  const deactivated: string[] = [];
  for (const player of Object.values(state.players)) {
    const ignoresRestartDeactivation = restartSources.some((source) =>
      isOtherPlayerAbilityEffectIgnored(state, source.controllerPlayerId, player.id, source.sourceId));
    for (const instanceId of [...player.attack]) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || !definition || !card.active || card.face !== "up") continue;
      const forced = forcedSources.has(instanceId);
      if (!forced && card.residual) continue;
      if (!forced && ignoresRestartDeactivation) continue;
      if (definition.isSkill === true || definition.cardType === "skill" || definition.linkedSkillId) {
        closePlayerCard(state, player.id, instanceId, definitions, { ignoreCloseDeferral: true });
      } else {
        clearCardStateBoundToClose(card);
        card.face = "down";
        card.active = false;
        card.residual = false;
      }
      deactivated.push(instanceId);
    }
  }
  for (const locationId of Object.keys(state.board.locations)) state.board.locations[locationId] = [];
  for (const player of Object.values(state.players)) player.locationId = null;
  const activePlayerId = state.turnOrder.find((id) => state.players[id] && !state.players[id].eliminated) ?? null;
  const { pendingCombatResolution: _pending, resolvedCombats: _resolved, combatWinnerIdsByLocation: _winners, endRoundCheckpoint: _end, embeddedPhaseSequence: _embedded, ...modeState } = state.modeState;
  state.modeState = { ...modeState, phaseStartPlayerId: activePlayerId };
  state.phase = "preparation";
  state.step = "player-window";
  state.activePlayerId = activePlayerId;
  return { deactivatedInstanceIds: deactivated, activePlayerId };
}

export function applyCombatLossRoundRestart(
  state: GameState,
  snapshot: CombatPowerSnapshot,
  definitions: Record<string, CardDefinition>,
): { sourceIds: string[]; sourceInstanceIds: string[]; deactivatedInstanceIds: string[]; activePlayerId: string | null } | undefined {
  const sources = getCombatLossRoundRestartSources(state, snapshot);
  if (sources.length === 0) return undefined;
  const sourceInstanceIds = [...new Set(sources.map((source) => source.sourceInstanceId))];
  const restarted = restartCurrentRoundFromPreparation(state, definitions, sourceInstanceIds);
  return { sourceIds: [...new Set(sources.map((source) => source.sourceId))], sourceInstanceIds, ...restarted };
}
