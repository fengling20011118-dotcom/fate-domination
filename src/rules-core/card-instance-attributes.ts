import type { CardInstance, GameState } from "../domain/state/types.ts";
import { getCardAttributes, normalizeCardAttributes, type CardDefinition } from "./content-types.ts";
import { getApplicableCardRuleModifiers } from "./card-rule-modifiers.ts";
import { getTopAttachmentInheritedAttributes } from "./card-inherited-traits.ts";
import { isCardTextSuppressed } from "./card-text.ts";

/** Resolve attributes for one physical card after instance-scoped and active-source transformations. */
export function getCardInstanceAttributes(
  instance: CardInstance,
  definition: CardDefinition,
  state?: GameState,
  definitions?: Record<string, CardDefinition>,
): string[] {
  const resolved = instance.attributeOverrides !== undefined
    ? normalizeCardAttributes(instance.attributeOverrides)
    : getCardAttributes(definition);
  if (!state || !definitions || !instance.ownerPlayerId) return resolved;
  const owner = state.players[instance.ownerPlayerId];
  if (!owner) return resolved;
  const transformed = new Set([
    ...resolved,
    ...getTopAttachmentInheritedAttributes(state, instance, definitions),
  ]);
  const linkedTransform = definition.linkedPlayerSameBattlefieldAttributeTransform;
  const controller = state.players[instance.controllerPlayerId] ?? owner;
  if (linkedTransform) {
    const linkedPlayerId = controller.flags[linkedTransform.playerFlag];
    const linkedPlayer = typeof linkedPlayerId === "string" ? state.players[linkedPlayerId] : undefined;
    const locationId = controller.locationId;
    const sameBattlefield = Boolean(linkedPlayer && !linkedPlayer.eliminated
      && (locationId === "mountain" || locationId === "city") && linkedPlayer.locationId === locationId);
    if (sameBattlefield) {
      for (const attribute of linkedTransform.removeAttributes ?? []) transformed.delete(attribute);
      for (const attribute of linkedTransform.addAttributes ?? []) transformed.add(attribute);
    }
  }
  const applicableModifiers = getApplicableCardRuleModifiers(state, controller, instance);
  const replacements = applicableModifiers
    .map((modifier) => modifier.replaceAttributes)
    .filter((attributes): attributes is string[] => Array.isArray(attributes));
  const granted = new Set(replacements.length > 0
    ? normalizeCardAttributes(replacements[replacements.length - 1])
    : transformed);
  for (const modifier of applicableModifiers) {
    for (const attribute of modifier.grantAttributes ?? []) granted.add(attribute);
  }
  if (instance.zone === "attack" && instance.active && instance.face === "up") {
    for (const sourcePlayer of Object.values(state.players)) {
      if (sourcePlayer.eliminated) continue;
      const sourceIds = [...new Set([...sourcePlayer.masterSkills, ...sourcePlayer.servantSkills, ...sourcePlayer.hand, ...sourcePlayer.attack])];
      for (const sourceInstanceId of sourceIds) {
        const source = state.cards[sourceInstanceId];
        const sourceDefinition = source ? definitions[source.definitionId] : undefined;
        const globalGrant = sourceDefinition?.globalActiveCardAttributeGrant;
        if (!source || !sourceDefinition || !globalGrant || source.zone === "discard" || source.zone === "removed" || isCardTextSuppressed(state, source)) continue;
        if (!globalGrant.targetDefinitionIds.includes(definition.id)) continue;
        for (const attribute of globalGrant.attributes) granted.add(attribute);
      }
    }
  }
  for (const sourceInstanceId of owner.attack) {
    const source = state.cards[sourceInstanceId];
    const sourceDefinition = source ? definitions[source.definitionId] : undefined;
    const grant = sourceDefinition?.activeOwnedCardAttributeGrant;
    if (!source || !sourceDefinition || !grant || !source.active || source.face !== "up" || source.zone !== "attack") continue;
    if (!grant.targetDefinitionIds.includes(definition.id)) continue;
    for (const attribute of grant.attributes) granted.add(attribute);
  }
  for (const modifier of applicableModifiers) {
    if (!modifier.retainAttributes) continue;
    const retained = new Set(normalizeCardAttributes(modifier.retainAttributes));
    for (const attribute of [...granted]) if (!retained.has(attribute as never)) granted.delete(attribute);
  }
  // Some rules say attacks controlled by this player always retain their
  // original printed types. This is resolved after transformations so a card
  // may still gain/change types while never losing the physical card's print.
  if (controller.flags.retainControlledAttackPrintedAttributes === true && instance.zone === "attack"
    && instance.controllerPlayerId === controller.id) {
    const printedDefinitionId = instance.temporaryDefinitionCopy?.originalDefinitionId ?? instance.definitionId;
    const printedDefinition = definitions[printedDefinitionId];
    if (printedDefinition) for (const attribute of getCardAttributes(printedDefinition)) granted.add(attribute);
  }
  return normalizeCardAttributes([...granted]);
}
