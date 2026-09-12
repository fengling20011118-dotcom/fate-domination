import type { CardInstance, GameState } from "../domain/state/types.ts";
import { getCardAttributes, normalizeCardAttributes, type CardDefinition } from "./content-types.ts";

function activeTextSuppressionMatches(
  state: GameState,
  instance: CardInstance,
  definitions: Record<string, CardDefinition>,
): boolean {
  const definition = definitions[instance.definitionId];
  if (!definition) return false;
  const targetPlayerId = instance.controllerPlayerId ?? instance.ownerPlayerId;
  const targetPlayer = targetPlayerId ? state.players[targetPlayerId] : undefined;
  if (!targetPlayer) return false;
  const attributes = instance.attributeOverrides !== undefined
    ? normalizeCardAttributes(instance.attributeOverrides)
    : getCardAttributes(definition);
  return (state.activeRuleModifiers ?? []).some((modifier) => {
    if (modifier.rule !== "card_text" || modifier.operation !== "forbid") return false;
    const sourcePlayer = state.players[modifier.controllerPlayerId];
    if (!sourcePlayer || sourcePlayer.eliminated) return false;
    if (modifier.duration === "round" && modifier.createdRound !== state.round) return false;
    if (modifier.duration === "while-source-active") {
      const source = modifier.sourceInstanceId ? state.cards[modifier.sourceInstanceId] : undefined;
      if (!source || source.zone !== "attack" || !source.active || source.face !== "up") return false;
    }
    const scope = modifier.scope ?? {};
    const subject = scope.subject ?? "controller";
    if (subject === "controller" && targetPlayer.id !== sourcePlayer.id) return false;
    if (subject === "opponents" && targetPlayer.id === sourcePlayer.id) return false;
    if (subject === "opponents_at_source_location"
      && (targetPlayer.id === sourcePlayer.id || !sourcePlayer.locationId || targetPlayer.locationId !== sourcePlayer.locationId)) return false;
    if (subject === "opponents_at_source_battlefield"
      && (targetPlayer.id === sourcePlayer.id
        || (sourcePlayer.locationId !== "mountain" && sourcePlayer.locationId !== "city")
        || targetPlayer.locationId !== sourcePlayer.locationId)) return false;
    if (!["controller", "all_players", "opponents", "opponents_at_source_location", "opponents_at_source_battlefield"].includes(String(subject))) return false;
    const cards = scope.cards && typeof scope.cards === "object" && !Array.isArray(scope.cards)
      ? scope.cards as Record<string, unknown>
      : {};
    if (cards.skill === true && definition.isSkill !== true) return false;
    if (cards.skill === false && definition.isSkill === true) return false;
    if (Array.isArray(cards.zones) && !cards.zones.includes(instance.zone)) return false;
    if (Array.isArray(cards.attributesAny) && !cards.attributesAny.some((attribute) => attributes.includes(String(attribute) as never))) return false;
    if (Array.isArray(cards.attributesAll) && !cards.attributesAll.every((attribute) => attributes.includes(String(attribute) as never))) return false;
    if (Array.isArray(cards.attributesNone) && cards.attributesNone.some((attribute) => attributes.includes(String(attribute) as never))) return false;
    return true;
  });
}

/** Whether the physical card currently has no executable rules text. Printed cost/power/types remain intact. */
export function isCardTextSuppressed(
  state: GameState,
  instance: CardInstance | undefined,
  definitions?: Record<string, CardDefinition>,
): boolean {
  if (!instance) return false;
  const marked = (instance.textSuppressedBySourceIds ?? []).some((sourceId) => {
    const source = state.cards[sourceId];
    // A physical-source marker is live only while that source remains active.
    // Non-physical ids are allowed for fixed-duration suppressions and remain live
    // until their owning rule explicitly clears the marker.
    return source ? source.zone === "attack" && source.active && source.face === "up" : true;
  });
  return marked || Boolean(definitions && activeTextSuppressionMatches(state, instance, definitions));
}

/** Add one independent text-loss source without duplicating markers. */
export function suppressCardText(instance: CardInstance, sourceId: string): void {
  if (!sourceId) throw new Error("CARD_TEXT_SUPPRESSION_SOURCE_REQUIRED");
  instance.textSuppressedBySourceIds = [...new Set([...(instance.textSuppressedBySourceIds ?? []), sourceId])];
}

/** Remove only one source's suppression; other simultaneous effects remain live. */
export function clearCardTextSuppression(instance: CardInstance, sourceId: string): void {
  const remaining = (instance.textSuppressedBySourceIds ?? []).filter((id) => id !== sourceId);
  if (remaining.length > 0) instance.textSuppressedBySourceIds = remaining;
  else delete instance.textSuppressedBySourceIds;
}

/** Clear a source marker from every physical card, used when a combat-scoped suppression expires. */
export function clearCardTextSuppressionBySource(state: GameState, sourceId: string): void {
  for (const instance of Object.values(state.cards)) clearCardTextSuppression(instance, sourceId);
}
