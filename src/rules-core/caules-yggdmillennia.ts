import type { CardInstance, GameEvent, GameState, PlayerState } from "../domain/state/types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { scheduleDeckRebuild } from "./deck-rebuilds.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const CAULES_THUNDER_ID = "master.caules-yggdmillennia.skill.s3";
export const CAULES_NARRATOR_ID = "master.caules-yggdmillennia.skill.ascension";
export const CAULES_THUNDER_HANDLER = "core.caules-yggdmillennia-thunder";
export const CAULES_NARRATOR_HANDLER = "core.caules-yggdmillennia-last-narrator";
export const CAULES_THUNDER_ABILITY = "electromancy";

export const CAULES_NARRATOR_DECK: readonly string[] = Object.freeze([
  "card.cardb3", "card.cardb3",
  "card.cardb4", "card.cardb4", "card.cardb4",
  "card.carda3", "card.carda3",
  "card.carda4", "card.carda4", "card.carda4",
  "card.cardluck",
  "card.cardsurveil",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cardMatchesSkill(instance: CardInstance | undefined, skillId: string, definitions: Record<string, CardDefinition>): boolean {
  if (!instance) return false;
  const definition = definitions[instance.definitionId];
  return instance.definitionId === skillId || definition?.linkedSkillId === skillId;
}

function activeThunder(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((instance) => Boolean(
    cardMatchesSkill(instance, CAULES_THUNDER_ID, definitions)
      && instance?.ownerPlayerId === player.id
      && instance.controllerPlayerId === player.id
      && instance.zone === "attack"
      && instance.active
      && instance.face === "up",
  ));
}

function eventPayload(payload: unknown): { eventType?: string; event?: Record<string, unknown> } {
  if (!isRecord(payload)) return {};
  return {
    eventType: typeof payload.eventType === "string" ? payload.eventType : undefined,
    event: isRecord(payload.event) ? payload.event : undefined,
  };
}

export const useCaulesThunder: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("CAULES_THUNDER_DEFINITIONS_REQUIRED");
  if (!isRecord(payload) || payload.abilityId !== CAULES_THUNDER_ABILITY || state.phase !== "combat") {
    throw new Error("CAULES_THUNDER_WINDOW_INVALID");
  }
  const source = activeThunder(state, player, definitions);
  if (!source) throw new Error("CAULES_THUNDER_SOURCE_NOT_ACTIVE");
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("CAULES_THUNDER_BATTLEFIELD_REQUIRED");
  const attribute = source.declaredAttribute;
  if (typeof attribute !== "string") throw new Error("CAULES_THUNDER_DECLARATION_MISSING");
  // Combat use necessarily makes a secret ascension declaration public.
  source.declaredAttributeRevealed = true;

  const affectedInstanceIds: string[] = [];
  for (const opponentId of state.board.locations[locationId] ?? []) {
    if (opponentId === player.id) continue;
    const opponent = state.players[opponentId];
    if (!opponent || opponent.eliminated || opponent.locationId !== locationId) continue;
    for (const instanceId of opponent.attack) {
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      if (!instance || !definition || definition.basic !== true || instance.controllerPlayerId !== opponent.id) continue;
      const attributes = getCardInstanceAttributes(instance, definition, state, definitions);
      if (!attributes.includes(attribute)) continue;
      const modifierId = `${skill.id}:zero:${state.round}:${instanceId}`;
      instance.powerModifiers = [
        ...(instance.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
        { id: modifierId, sourceId: skill.id, kind: "set", value: 0, duration: "round" },
      ];
      affectedInstanceIds.push(instanceId);
    }
  }
  return { declaredAttribute: attribute, affectedInstanceIds };
};

export const isCaulesThunderLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== CAULES_THUNDER_ABILITY || state.phase !== "combat") return false;
  if (player.locationId !== "mountain" && player.locationId !== "city") return false;
  return typeof activeThunder(state, player, definitions)?.declaredAttribute === "string";
};

export const useCaulesLastNarrator: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("CAULES_NARRATOR_DEFINITIONS_REQUIRED");
  const { eventType, event } = eventPayload(payload);
  if (!eventType || !event) return;

  if (eventType === "skill.unlocked") {
    if (event.playerId !== player.id || event.skillId !== skill.id) return;
    scheduleDeckRebuild(state, {
      playerId: player.id,
      sourceId: skill.id,
      targetRound: state.round + 1,
      definitionIds: [...CAULES_NARRATOR_DECK],
    });
    return { scheduledRound: state.round + 1, definitionIds: [...CAULES_NARRATOR_DECK] };
  }

  if (eventType === "card.played") {
    if (event.playerId !== player.id || typeof event.instanceId !== "string") return;
    const instance = state.cards[event.instanceId];
    if (!cardMatchesSkill(instance, CAULES_THUNDER_ID, definitions) || instance?.ownerPlayerId !== player.id) return;
    if (typeof instance.declaredAttribute !== "string") throw new Error("CAULES_NARRATOR_SECRET_DECLARATION_MISSING");
    instance.declaredAttributeRevealed = false;
    return { hiddenInstanceId: instance.instanceId };
  }

  if (eventType === "phase.transitioned") {
    if (event.previousPhase !== "action" || event.transition !== "next-phase" || state.phase !== "combat") return;
    const revealedInstanceIds: string[] = [];
    for (const instanceId of player.attack) {
      const instance = state.cards[instanceId];
      if (!cardMatchesSkill(instance, CAULES_THUNDER_ID, definitions) || typeof instance?.declaredAttribute !== "string") continue;
      instance.declaredAttributeRevealed = true;
      revealedInstanceIds.push(instanceId);
    }
    return { revealedInstanceIds };
  }
};

export function canCaulesNarratorPassiveTrigger(
  state: GameState,
  playerId: string,
  event: GameEvent,
  definitions: Record<string, CardDefinition>,
): boolean {
  const player = state.players[playerId];
  if (!player || player.eliminated) return false;
  const payload = isRecord(event.payload) ? event.payload : {};
  if (event.type === "skill.unlocked") return payload.playerId === playerId && payload.skillId === CAULES_NARRATOR_ID;
  if (event.type === "card.played") {
    if (payload.playerId !== playerId || typeof payload.instanceId !== "string") return false;
    return cardMatchesSkill(state.cards[payload.instanceId], CAULES_THUNDER_ID, definitions);
  }
  if (event.type === "phase.transitioned") {
    return payload.previousPhase === "action" && payload.transition === "next-phase" && state.phase === "combat"
      && player.attack.some((instanceId) => cardMatchesSkill(state.cards[instanceId], CAULES_THUNDER_ID, definitions)
        && typeof state.cards[instanceId]?.declaredAttribute === "string"
        && state.cards[instanceId]?.declaredAttributeRevealed === false);
  }
  return false;
}
