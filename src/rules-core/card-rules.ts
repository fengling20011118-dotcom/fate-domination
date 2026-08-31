import type { GameState, PlayerState, CardInstance } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardAttributes } from "./content-types.ts";
import { isCardUsageAvailable } from "./usage-limits.ts";
import { ignoresDefeat, isJekyllBeastCard } from "./jekyll-hyde.ts";

export interface AttackCardValidationContext {
  state: GameState;
  playerId: string;
  instanceId: string;
  definitions: Record<string, CardDefinition>;
  faceDown: boolean;
  primitiveDragonActive?: boolean;
  /** Explicit effect exception for cards added to an attack without being played. */
  bypassSkillEightMana?: boolean;
}

/**
 * Shared card-entry rules. Callers still own batch-size and phase checks;
 * this component owns card identity, visibility, cost gates and restrictions.
 */
export function assertCardCanEnterAttack(context: AttackCardValidationContext): CardDefinition {
  const { state, playerId, instanceId, definitions, faceDown, primitiveDragonActive = false, bypassSkillEightMana = false } = context;
  const player = state.players[playerId];
  const instance = state.cards[instanceId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  if (player.defeated && !ignoresDefeat(player)) throw new Error("PLAYER_DEFEATED");
  if (!instance || instance.ownerPlayerId !== playerId || !["hand", "master-skills", "servant-skills"].includes(instance.zone)) {
    throw new Error("CARD_NOT_AVAILABLE");
  }
  if (player.attack.includes(instanceId)) throw new Error("CARD_ALREADY_IN_ATTACK");
  const definition = definitions[instance.definitionId];
  if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");

  if (definition.requiresTrueName && !player.trueNameRevealed) throw new Error("CARD_REQUIRES_TRUE_NAME");
  if (definition.requiresHiddenTrueName && player.trueNameRevealed) throw new Error("CARD_REQUIRES_HIDDEN_TRUE_NAME");
  if (definition.phases?.length && !definition.phases.includes(state.phase)) throw new Error("CARD_PLAY_PHASE_FORBIDDEN");
  if (definition.steps?.length && !definition.steps.includes(state.step)) throw new Error("CARD_PLAY_STEP_FORBIDDEN");
  const forbiddenAttributes = (state.modeState.situationRestrictions as { forbiddenAttributes?: string[] } | undefined)?.forbiddenAttributes ?? [];
  if (!definition.ignoresSituationRestrictions && forbiddenAttributes.some((attribute) => getCardAttributes(definition).includes(attribute))) {
    throw new Error("CARD_ATTRIBUTE_FORBIDDEN_BY_SITUATION");
  }
  const jekyllBeastException = isJekyllBeastCard(player, definition);
  if (definition.isSkill && !bypassSkillEightMana && !jekyllBeastException && definition.requiresEightMana !== false && player.mana < 8 && player.flags.skillEightManaWaiver !== true) {
    throw new Error("SKILL_REQUIRES_EIGHT_MANA");
  }
  if (definition.isSkill && faceDown) throw new Error("SKILL_CANNOT_BE_FACE_DOWN");
  if (!isCardUsageAvailable(instance, definition.limit, state.round, state.phase)) throw new Error("CARD_LIMIT_REACHED");
  if (primitiveDragonActive && definition.basic) throw new Error("BASIC_ATTACK_FORBIDDEN_BY_PRIMITIVE_DRAGON");
  return definition;
}

export function getStandardAttackRequirements(player: PlayerState, state: GameState, definitions: Record<string, CardDefinition>): {
  requiredCards: number;
  primitiveDragonActive: boolean;
} {
  const residualDefinitions = player.attack
    .map((instanceId) => definitions[state.cards[instanceId]?.definitionId ?? ""])
    .filter(Boolean);
  return {
    requiredCards: residualDefinitions.some((definition) => definition.tags?.includes("reduces-standard-attack-by-one")) ? 1 : 2,
    primitiveDragonActive: residualDefinitions.some((definition) => definition.tags?.includes("primitive-dragon")),
  };
}

export function getCardCost(instance: CardInstance, definitions: Record<string, CardDefinition>): number {
  const definition = definitions[instance.definitionId];
  if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");
  return definition.cost;
}
