import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { getTopAttachedCard } from "./card-attachments.ts";
import { getCardAttributes, normalizeCardAttributes, type CardDefinition } from "./content-types.ts";
import { getPrintedCardBasePower } from "./card-values.ts";

export interface TopAttachmentTraitSource {
  instance: CardInstance;
  definition: CardDefinition;
}

/**
 * Resolve the physical top attachment whose printed/runtime card-face traits are
 * inherited by a host. The opt-in flag is serialized on the host instance so
 * this stays a reusable card rule rather than a character-name branch.
 */
export function getTopAttachmentTraitSource(
  state: GameState,
  host: CardInstance,
  definitions: Record<string, CardDefinition>,
): TopAttachmentTraitSource | undefined {
  const rule = host.copyTopAttachmentTraits;
  if (!rule) return undefined;
  const sourceHostId = rule.proxyHostInstanceId ?? host.instanceId;
  if (!state.cards[sourceHostId]) return undefined;
  const top = getTopAttachedCard(state, sourceHostId);
  const definition = top ? definitions[top.definitionId] : undefined;
  return top && definition ? { instance: top, definition } : undefined;
}

/** Additive inherited attributes. Basic-attack identity is intentionally not inherited. */
export function getTopAttachmentInheritedAttributes(
  state: GameState,
  host: CardInstance,
  definitions: Record<string, CardDefinition>,
): string[] {
  const source = getTopAttachmentTraitSource(state, host, definitions);
  if (!source) return [];
  // A proxy copy inherits only the attachment's printed definition. Runtime
  // state/tokens on the original attachment remain with that physical card.
  const attributes = host.copyTopAttachmentTraits?.proxyHostInstanceId
    ? getCardAttributes(source.definition)
    : (source.instance.attributeOverrides !== undefined ? source.instance.attributeOverrides : getCardAttributes(source.definition));
  return normalizeCardAttributes(attributes);
}

/** Additive printed mana cost inherited from the physical top attachment. */
export function getTopAttachmentInheritedCost(
  state: GameState,
  host: CardInstance,
  definitions: Record<string, CardDefinition>,
): number {
  const source = getTopAttachmentTraitSource(state, host, definitions);
  if (!source) return 0;
  const cost = Number(source.definition.cost ?? 0);
  if (!Number.isFinite(cost) || cost < 0) throw new Error("TOP_ATTACHMENT_COST_INVALID");
  return cost;
}

/** Additive printed/base power inherited from the physical top attachment. */
export function getTopAttachmentInheritedPower(
  state: GameState,
  controller: PlayerState,
  host: CardInstance,
  definitions: Record<string, CardDefinition>,
): number {
  const source = getTopAttachmentTraitSource(state, host, definitions);
  if (!source) return 0;
  return getPrintedCardBasePower(state, controller, source.definition);
}

/** Definition whose executable card ability is inherited by this host instance. */
export function getTopAttachmentInheritedAbilityDefinition(
  state: GameState,
  host: CardInstance,
  definitions: Record<string, CardDefinition>,
  abilityId: string,
): CardDefinition | undefined {
  const source = getTopAttachmentTraitSource(state, host, definitions);
  return source?.definition.cardAbilityIds?.includes(abilityId) ? source.definition : undefined;
}

export function cardInstanceGrantsAbility(
  state: GameState,
  host: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
  abilityId: string,
): boolean {
  return Boolean(definition.cardAbilityIds?.includes(abilityId)
    || getTopAttachmentInheritedAbilityDefinition(state, host, definitions, abilityId));
}
