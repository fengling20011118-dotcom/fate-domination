import type { GameState } from "../domain/state/types.ts";

export type AbilityActivationKind = "action" | "combat";

export interface AbilityCardSourceDescriptor {
  definitionId: string;
  attributes: string[];
  tags?: string[];
  /** Stable authored classification; generic restrictions never inspect card text. */
  basic?: boolean;
}

function liveRoundModifier(state: GameState, modifier: GameState["activeRuleModifiers"][number]): boolean {
  if (modifier.duration === "game") return true;
  if (modifier.duration === "round") return modifier.createdRound === state.round;
  if (modifier.duration !== "while-source-active" || !modifier.sourceInstanceId) return false;
  const source = state.cards[modifier.sourceInstanceId];
  return Boolean(source && source.zone === "attack" && source.active && source.face === "up");
}

/**
 * Generic activation prohibition used by Action/Combat abilities and Command
 * Seals.  The rule is intentionally expressed as a serializable active rule so
 * individual cards do not need character-name branches in the execution paths.
 */
export function isAbilityActivationBlocked(
  state: GameState,
  playerId: string,
  kind: AbilityActivationKind,
): boolean {
  const target = state.players[playerId];
  if (!target || target.eliminated) return false;
  return state.activeRuleModifiers.some((modifier) => {
    if (modifier.rule !== "ability_activation" || modifier.operation !== "forbid" || !liveRoundModifier(state, modifier)) return false;
    const scope = modifier.scope ?? {};
    const kinds = Array.isArray(scope.kinds) ? scope.kinds.filter((value): value is string => typeof value === "string") : [];
    if (kinds.length > 0 && !kinds.includes(kind)) return false;
    const subject = typeof scope.subject === "string" ? scope.subject : undefined;
    if (subject === "controller") return modifier.controllerPlayerId === playerId;
    if (subject === "all_opponents") return modifier.controllerPlayerId !== playerId;
    if (subject === "same_battlefield_opponents") {
      if (modifier.controllerPlayerId === playerId) return false;
      const sourcePlayer = state.players[modifier.controllerPlayerId];
      const locationId = sourcePlayer?.locationId;
      return Boolean((locationId === "mountain" || locationId === "city") && target.locationId === locationId);
    }
    return false;
  });
}

/** Install/replace one dynamic battlefield activation prohibition for this round. */
export function forbidOpponentAbilityActivationOnBattlefield(
  state: GameState,
  controllerPlayerId: string,
  sourceId: string,
  sourceInstanceId: string | undefined,
  kinds: AbilityActivationKind[] = ["action", "combat"],
): string {
  const id = `${sourceId}:ability-activation:${controllerPlayerId}:${state.round}`;
  state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => modifier.id !== id);
  state.activeRuleModifiers.push({
    id,
    sourceId,
    controllerPlayerId,
    ...(sourceInstanceId ? { sourceInstanceId } : {}),
    operation: "forbid",
    rule: "ability_activation",
    scope: { subject: "same_battlefield_opponents", kinds: [...new Set(kinds)] },
    duration: "round",
    createdRound: state.round,
  });
  return id;
}

/** Generic source-card activation lock keyed only by card metadata and location. */
export function isCardSourceAbilityActivationBlocked(
  state: GameState,
  playerId: string,
  source: AbilityCardSourceDescriptor,
): boolean {
  const target = state.players[playerId];
  if (!target || target.eliminated || !target.locationId) return false;
  return state.activeRuleModifiers.some((modifier) => {
    if (modifier.rule !== "card_attribute_ability_activation" || modifier.operation !== "forbid" || !liveRoundModifier(state, modifier)) return false;
    const controller = state.players[modifier.controllerPlayerId];
    if (!controller || controller.eliminated || !controller.locationId || controller.locationId !== target.locationId) return false;
    const scope = modifier.scope ?? {};
    if (scope.basic === true && source.basic !== true) return false;
    if (scope.basic === false && source.basic === true) return false;
    const excludedDefinitionIds = Array.isArray(scope.excludeDefinitionIds)
      ? scope.excludeDefinitionIds.filter((value): value is string => typeof value === "string")
      : [];
    if (excludedDefinitionIds.includes(source.definitionId)) return false;
    const excludedTags = Array.isArray(scope.excludeTags)
      ? scope.excludeTags.filter((value): value is string => typeof value === "string")
      : [];
    if (excludedTags.some((tag) => source.tags?.includes(tag))) return false;
    const attribute = typeof scope.attribute === "string" ? scope.attribute : undefined;
    if (!attribute) return false;
    return attribute === "无属性" ? source.attributes.length === 0 : source.attributes.includes(attribute);
  });
}

/** Install a source-bound card-attribute ability lock at the controller's current location. */
export function forbidCardAttributeAbilityActivationAtLocation(
  state: GameState,
  controllerPlayerId: string,
  sourceId: string,
  sourceInstanceId: string,
  attribute: string,
  options: { excludeDefinitionIds?: string[]; excludeTags?: string[] } = {},
): string {
  if (!state.players[controllerPlayerId] || !state.cards[sourceInstanceId] || !attribute) throw new Error("CARD_ATTRIBUTE_ABILITY_BLOCK_INVALID");
  const id = `${sourceId}:card-attribute-ability:${sourceInstanceId}`;
  state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => modifier.id !== id);
  state.activeRuleModifiers.push({
    id,
    sourceId,
    controllerPlayerId,
    sourceInstanceId,
    operation: "forbid",
    rule: "card_attribute_ability_activation",
    scope: {
      attribute,
      excludeDefinitionIds: [...new Set(options.excludeDefinitionIds ?? [])],
      excludeTags: [...new Set(options.excludeTags ?? [])],
    },
    duration: "while-source-active",
    createdRound: state.round,
  });
  return id;
}
