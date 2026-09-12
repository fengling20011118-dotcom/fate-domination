import type { GameState, PendingDecision } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { createUsageRecord, getEffectiveCardUsageLimit, isUsageAvailable } from "./usage-limits.ts";
import type { CardZone } from "../domain/state/types.ts";
import { cardAllowsActionAbilityInCombat, getActionAbilityCombatLimit, getCardRuleGrantedAbility, playerAllowsActionAbilitiesInCombat } from "./card-rule-modifiers.ts";
import { playerIsDisarmed } from "./player-statuses.ts";
import { isCardTextSuppressed } from "./card-text.ts";
import { applyActivatedAbilityReplacement, getActivatedAbilityReplacement } from "./ability-replacement.ts";
import { consumeCardAbilityReuse, hasCardAbilityReuse } from "./ability-reuse.ts";
import { getTopAttachmentInheritedAbilityDefinition } from "./card-inherited-traits.ts";
import { isAbilityActivationBlocked, isCardSourceAbilityActivationBlocked } from "./ability-activation-restrictions.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";

export interface CardAbilityContext {
  state: GameState;
  playerId: string;
  instanceId: string;
  target?: unknown;
  definitions: Record<string, CardDefinition>;
  /** Authoritative state-backed RNG for abilities that draw/shuffle or otherwise randomize. */
  randomInt?: (maxExclusive: number) => number;
  /** Emits an authoritative domain event produced by this ability. */
  emitEvent?: (type: string, payload: unknown) => void;
  /** Opens a serializable choice when a card ability needs input from one or more players. */
  openDecision?: (decision: PendingDecision) => void;
  /** Explicit rule-effect permission to use this ability outside its ordinary phase/turn timing. */
  effectTimingOverride?: boolean;
}

export type CardAbilityHandler = (context: CardAbilityContext) => void;

export interface CardAbilityOptions {
  /** Zones from which this ability may be activated. Defaults to active cards. */
  allowedZones?: CardZone[];
  /** Allows an ability on a non-active card, such as a hand response. */
  allowInactive?: boolean;
  /** Allows a definition explicitly tagged shared-public-ability to be used by a non-controller. */
  allowPublicUse?: boolean;
  /** Optional ability-only usage limit, independent from the card's play/use limit. */
  abilityLimit?: CardDefinition["limit"];
}

export class CardAbilityRegistry {
  readonly #handlers = new Map<string, CardAbilityHandler>();
  readonly #options = new Map<string, CardAbilityOptions>();

  register(abilityId: string, handler: CardAbilityHandler, options: CardAbilityOptions = {}): void {
    if (!abilityId) throw new Error("CARD_ABILITY_ID_REQUIRED");
    if (typeof handler !== "function") throw new Error("CARD_ABILITY_HANDLER_INVALID");
    if (this.#handlers.has(abilityId)) throw new Error("CARD_ABILITY_DUPLICATE");
    this.#handlers.set(abilityId, handler);
    this.#options.set(abilityId, structuredClone(options));
  }

  has(abilityId: string): boolean {
    return this.#handlers.has(abilityId);
  }

  list(): string[] {
    return [...this.#handlers.keys()];
  }

  execute(abilityId: string, context: CardAbilityContext): void {
    const handler = this.#handlers.get(abilityId);
    if (!handler) throw new Error("CARD_ABILITY_NOT_FOUND");
    const player = context.state.players[context.playerId];
    const instance = context.state.cards[context.instanceId];
    const options = this.#options.get(abilityId) ?? {};
    const definition = instance ? context.definitions[instance.definitionId] : undefined;
    if (context.state.status !== "playing") throw new Error("GAME_NOT_PLAYING");
    if (context.state.pendingDecision) throw new Error("CARD_ABILITY_BLOCKED_BY_DECISION");
    if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
    if (playerIsDisarmed(player)) throw new Error("PLAYER_DISARMED");
    const controlled = Boolean(instance && (instance.ownerPlayerId === context.playerId || instance.controllerPlayerId === context.playerId));
    const publicUse = Boolean(instance && options.allowPublicUse === true && definition?.tags?.includes("shared-public-ability"));
    if (!instance || (!controlled && !publicUse)) throw new Error("CARD_ABILITY_NOT_OWNED");
    if (isCardTextSuppressed(context.state, instance, context.definitions)) throw new Error("CARD_TEXT_SUPPRESSED");
    const allowedZones = options.allowedZones ?? ["master-skills", "servant-skills", "attack"];
    if (!allowedZones.includes(instance.zone)) throw new Error("CARD_ABILITY_ZONE_FORBIDDEN");
    if ((!instance.active && !options.allowInactive) || instance.zone === "removed" || instance.zone === "discard") throw new Error("CARD_ABILITY_INACTIVE");
    // Content definitions are optional for generic externally registered abilities.
    // When present, they provide the authoritative phase/usage constraints. A
    // host that explicitly copies its top attachment may inherit that card's
    // executable ability metadata without changing its own definition/basicness.
    const inheritedDefinition = definition && instance
      ? getTopAttachmentInheritedAbilityDefinition(context.state, instance, context.definitions, abilityId)
      : undefined;
    const directGrant = definition?.cardAbilityIds?.includes(abilityId) === true;
    const instanceGrant = instance.grantedCardAbilities?.find((grant) => grant.abilityId === abilityId);
    const modifierGrant = getCardRuleGrantedAbility(context.state, player, instance, abilityId);
    if (definition && !directGrant && !inheritedDefinition && !modifierGrant && !instanceGrant) throw new Error("CARD_ABILITY_NOT_GRANTED");
    const grantedSourceDefinition = instanceGrant ? context.definitions[instanceGrant.sourceDefinitionId] : undefined;
    const abilityDefinition = directGrant ? definition : (inheritedDefinition ?? grantedSourceDefinition ?? definition);
    if (definition && isCardSourceAbilityActivationBlocked(context.state, context.playerId, {
      definitionId: definition.id,
      attributes: getCardInstanceAttributes(instance, definition, context.state, context.definitions),
      tags: definition.tags ?? [],
      basic: definition.basic === true,
    })) throw new Error("CARD_ABILITY_ACTIVATION_BLOCKED");
    const abilityPhases = modifierGrant?.phases ?? instanceGrant?.phases ?? abilityDefinition?.phases;
    const phaseAllowed = context.effectTimingOverride === true || !abilityPhases?.length
      || abilityPhases.includes(context.state.phase)
      || (context.state.phase === "combat" && abilityPhases.includes("action")
        && (cardAllowsActionAbilityInCombat(context.state, player, instance)
          || playerAllowsActionAbilitiesInCombat(context.state, player, context.definitions)));
    if (!phaseAllowed) throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
    if ((context.state.phase === "action" || context.state.phase === "combat")
      && isAbilityActivationBlocked(context.state, context.playerId, context.state.phase)) throw new Error("CARD_ABILITY_ACTIVATION_BLOCKED");
    if (abilityDefinition?.steps?.length && !abilityDefinition.steps.includes(context.state.step)) throw new Error("CARD_ABILITY_STEP_FORBIDDEN");
    const combatActionLimit = abilityPhases?.includes("action") && context.state.phase === "combat"
      && cardAllowsActionAbilityInCombat(context.state, player, instance)
      ? getActionAbilityCombatLimit(context.state, player, instance)
      : undefined;
    const abilityLimit = combatActionLimit ?? options.abilityLimit ?? abilityDefinition?.limit
      ?? getEffectiveCardUsageLimit(instance, definition?.limit)
      ?? (abilityPhases?.length ? "once-per-round" : undefined);
    const usageBefore = instance.abilityUsage?.[abilityId];
    const normalUsageAvailable = isUsageAvailable(usageBefore, abilityLimit, context.state.round, context.state.phase);
    const usingReuseGrant = Boolean(!normalUsageAvailable
      && hasCardAbilityReuse(player, context.state.round, instance.instanceId, abilityId));
    if (!normalUsageAvailable && !usingReuseGrant) throw new Error("CARD_ABILITY_LIMIT_REACHED");
    const replacement = getActivatedAbilityReplacement(player, context.state.round);
    if (replacement) applyActivatedAbilityReplacement(player, replacement);
    else handler(context);
    if (usingReuseGrant) {
      if (!consumeCardAbilityReuse(player, context.state.round, instance.instanceId, abilityId)) throw new Error("ABILITY_REUSE_GRANT_MISSING");
    } else if (abilityLimit) {
      instance.abilityUsage = { ...(instance.abilityUsage ?? {}), [abilityId]: createUsageRecord(abilityLimit, context.state.round, context.state.phase, usageBefore) };
      // Keep legacy single-ability markers synchronized for old snapshots/content while
      // abilityUsage remains the authoritative per-ability boundary.
      instance.usedRound = context.state.round;
      instance.usedPhase = context.state.phase;
      if (abilityLimit === "once-per-game") instance.used = true;
      if (abilityLimit === "twice-per-game") instance.usedGameCount = Number(instance.usedGameCount ?? 0) + 1;
      if (abilityLimit === "twice-per-round") instance.usedCount = instance.usedRound === context.state.round ? Number(instance.usedCount ?? 0) + 1 : 1;
    }
  }
}
