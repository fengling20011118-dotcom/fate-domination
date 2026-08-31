import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { isCardUsageAvailable, markCardUsage } from "./usage-limits.ts";
import type { CardZone } from "../domain/state/types.ts";

export interface CardAbilityContext {
  state: GameState;
  playerId: string;
  instanceId: string;
  target?: unknown;
  definitions: Record<string, CardDefinition>;
}

export type CardAbilityHandler = (context: CardAbilityContext) => void;

export interface CardAbilityOptions {
  /** Zones from which this ability may be activated. Defaults to active cards. */
  allowedZones?: CardZone[];
  /** Allows an ability on a non-active card, such as a hand response. */
  allowInactive?: boolean;
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
    if (context.state.status !== "playing") throw new Error("GAME_NOT_PLAYING");
    if (context.state.pendingDecision) throw new Error("CARD_ABILITY_BLOCKED_BY_DECISION");
    if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
    if (!instance || (instance.ownerPlayerId !== context.playerId && instance.controllerPlayerId !== context.playerId)) {
      throw new Error("CARD_ABILITY_NOT_OWNED");
    }
    const options = this.#options.get(abilityId) ?? {};
    const allowedZones = options.allowedZones ?? ["master-skills", "servant-skills", "attack"];
    if (!allowedZones.includes(instance.zone)) throw new Error("CARD_ABILITY_ZONE_FORBIDDEN");
    if ((!instance.active && !options.allowInactive) || instance.zone === "removed" || instance.zone === "discard") throw new Error("CARD_ABILITY_INACTIVE");
    const definition = context.definitions[instance.definitionId];
    // Content definitions are optional for generic externally registered abilities.
    // When present, they provide the authoritative phase/usage constraints.
    if (definition?.phases?.length && !definition.phases.includes(context.state.phase)) throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
    if (definition?.steps?.length && !definition.steps.includes(context.state.step)) throw new Error("CARD_ABILITY_STEP_FORBIDDEN");
    if (definition && !isCardUsageAvailable(instance, definition.limit, context.state.round, context.state.phase)) throw new Error("CARD_ABILITY_LIMIT_REACHED");
    handler(context);
    if (definition) markCardUsage(instance, definition.limit, context.state.round, context.state.phase);
  }
}
