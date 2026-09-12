import type { GameState } from "../domain/state/types.ts";

const CARD_OWNER_FILTER_RULE = "combat_card_owner_filter";
const NEUTRAL_BOARD_IGNORE_RULE = "neutral_board_combat_effects";

function sourceLive(state: GameState, sourceInstanceId: string | undefined): boolean {
  if (!sourceInstanceId) return false;
  const source = state.cards[sourceInstanceId];
  return Boolean(source && source.zone === "attack" && source.active && source.face === "up");
}

function installModifier(state: GameState, modifier: NonNullable<GameState["activeRuleModifiers"]>[number]): void {
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((existing) => existing.id !== modifier.id);
  state.activeRuleModifiers.push(modifier);
}

/**
 * Shared two-player combat-isolation boundary. The installer supplies the source
 * card and duel participants; generic combat/movement/ability readers consume
 * serializable modifiers without knowing any character identity.
 */
export function installDuelIsolation(state: GameState, input: {
  sourceId: string;
  sourceInstanceId: string;
  controllerPlayerId: string;
  opponentPlayerId: string;
  locationId: string;
}): void {
  const { sourceId, sourceInstanceId, controllerPlayerId, opponentPlayerId, locationId } = input;
  if (!state.players[controllerPlayerId] || !state.players[opponentPlayerId] || !state.board.locations[locationId]) throw new Error("DUEL_ISOLATION_INPUT_INVALID");
  if (!sourceLive(state, sourceInstanceId)) throw new Error("DUEL_ISOLATION_SOURCE_INACTIVE");
  const thirdPartyIds = Object.keys(state.players).filter((id) => id !== controllerPlayerId && id !== opponentPlayerId);
  installModifier(state, {
    id: `${sourceId}:duel-movement:${sourceInstanceId}`,
    sourceId,
    controllerPlayerId,
    sourceInstanceId,
    operation: "forbid",
    rule: "movement_destinations",
    scope: { subject: "all_players", sourceLocationBoundary: true },
    duration: "while-source-active",
    createdRound: state.round,
  });
  for (const playerId of [controllerPlayerId, opponentPlayerId]) {
    installModifier(state, {
      id: `${sourceId}:duel-terrain:${sourceInstanceId}:${playerId}`,
      sourceId,
      controllerPlayerId: playerId,
      sourceInstanceId,
      operation: "set",
      rule: "deployment_advantage",
      scope: { subject: "controller" },
      value: 0,
      duration: "while-source-active",
      createdRound: state.round,
    });
    installModifier(state, {
      id: `${sourceId}:duel-third-party:${sourceInstanceId}:${playerId}`,
      sourceId,
      controllerPlayerId: playerId,
      sourceInstanceId,
      operation: "ignore",
      rule: "other_player_ability_effect",
      scope: { subject: "controller", sourcePlayerIds: thirdPartyIds },
      duration: "while-source-active",
      createdRound: state.round,
    });
    installModifier(state, {
      id: `${sourceId}:duel-card-owner:${sourceInstanceId}:${playerId}`,
      sourceId,
      controllerPlayerId: playerId,
      sourceInstanceId,
      operation: "allow",
      rule: CARD_OWNER_FILTER_RULE,
      scope: { subject: "controller", allowedOwnerPlayerIds: [controllerPlayerId, opponentPlayerId] },
      duration: "while-source-active",
      createdRound: state.round,
    });
    installModifier(state, {
      id: `${sourceId}:duel-neutral-board:${sourceInstanceId}:${playerId}`,
      sourceId,
      controllerPlayerId: playerId,
      sourceInstanceId,
      operation: "ignore",
      rule: NEUTRAL_BOARD_IGNORE_RULE,
      scope: { subject: "controller" },
      duration: "while-source-active",
      createdRound: state.round,
    });
  }
}

function liveCustomModifier(state: GameState, playerId: string, rule: string) {
  return (state.activeRuleModifiers ?? []).find((modifier) => modifier.controllerPlayerId === playerId && modifier.rule === rule
    && modifier.duration === "while-source-active" && sourceLive(state, modifier.sourceInstanceId));
}

/** True when a physical card's owner is allowed to affect this duel participant. */
export function isDuelIsolationCardSourceAllowed(state: GameState, playerId: string, instanceId: string): boolean {
  const modifier = liveCustomModifier(state, playerId, CARD_OWNER_FILTER_RULE);
  if (!modifier) return true;
  const allowed = Array.isArray(modifier.scope?.allowedOwnerPlayerIds)
    ? modifier.scope.allowedOwnerPlayerIds.filter((id): id is string => typeof id === "string")
    : [];
  if (allowed.length === 0) throw new Error("DUEL_ISOLATION_OWNER_FILTER_INVALID");
  const card = state.cards[instanceId];
  return Boolean(card?.ownerPlayerId && allowed.includes(card.ownerPlayerId));
}

/** Filter third-party physical combat cards while a duel-isolation rule is live. */
export function filterDuelIsolationCombatCardIds(state: GameState, playerId: string, instanceIds: readonly string[]): string[] {
  return instanceIds.filter((instanceId) => isDuelIsolationCardSourceAllowed(state, playerId, instanceId));
}

/** True while neutral situation/objective combat modifiers are ignored by a duel participant. */
export function ignoresNeutralBoardCombatEffects(state: GameState, playerId: string): boolean {
  return Boolean(liveCustomModifier(state, playerId, NEUTRAL_BOARD_IGNORE_RULE));
}
