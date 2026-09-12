import type { GameState } from "../domain/state/types.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import type { CardDefinition } from "./content-types.ts";
import { moveEvent, shuffleEventDeckContaining, tryDrawEventToLocation } from "./event-lifecycle.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { replaceNamedAttributesForColor } from "./hokusai.ts";

export const CHARLEMAGNE_JOYEUSE_ID = "servant.charlemagne.skill.sc-charlemagne-1";
export const CHARLEMAGNE_PATRICIUS_ID = "servant.charlemagne.skill.sc-charlemagne-2";
export const CHARLEMAGNE_JOYEUSE_HANDLER = "core.charlemagne-joyeuse-ordre";
export const CHARLEMAGNE_JOYEUSE_RESOLVE = "core.charlemagne-joyeuse-ordre-resolve";
export const CHARLEMAGNE_PATRICIUS_HANDLER = "core.charlemagne-charles-patricius";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function activeSkillCard(state: GameState, playerId: string, skillId: string, definitions: Record<string, CardDefinition>) {
  return state.players[playerId]?.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card?.active && card.face === "up" && card.zone === "attack"
      && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
  });
}

function charlemagneSkillDefinitionIds(definitions: Record<string, CardDefinition>): string[] {
  return Object.values(definitions)
    .filter((definition) => definition.isSkill === true && definition.ownerDefinitionId === "servant.charlemagne")
    .map((definition) => definition.id);
}

/** Joyeuse adds an objective to the current fight and grants its printed types to Charlemagne's skills for the round. */
export const useCharlemagneJoyeuseOrdre: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, randomInt }) => {
  if (!definitions) throw new Error("CHARLEMAGNE_JOYEUSE_DEFINITIONS_REQUIRED");
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : {};

  if (eventType === "combat.resolved") {
    const locationId = event.locationId;
    const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds : [];
    if ((locationId !== "mountain" && locationId !== "city") || !winnerIds.includes(player.id)
      || !activeSkillCard(state, player.id, skill.id, definitions)) return;
    const candidates = [...(state.board.currentEvents[locationId] ?? [])];
    if (candidates.length === 0) return;
    const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:return-objective`;
    state.effectQueue.unshift({
      effectId,
      handlerId: CHARLEMAGNE_JOYEUSE_RESOLVE,
      sourceId: skill.id,
      controllerPlayerId: player.id,
      payload: { locationId, candidateEventIds: candidates },
      createdAtRevision: state.revision,
    });
    openDecision({
      decisionId: `${effectId}:decision`,
      ownerPlayerId: player.id,
      chooserPlayerIds: [player.id],
      kind: "charlemagne-return-objective",
      options: candidates.map((eventId) => ({ id: eventId, label: eventId })),
      min: 0,
      max: 1,
      allowCancel: true,
      continuationEffectId: effectId,
      submissions: {},
    });
    return;
  }

  if (!isRecord(payload) || payload.abilityId !== "joyeuse-draw-objective") throw new Error("CHARLEMAGNE_JOYEUSE_ABILITY_INVALID");
  if (player.locationId !== "mountain" && player.locationId !== "city") throw new Error("CHARLEMAGNE_JOYEUSE_BATTLEFIELD_REQUIRED");
  const eventId = tryDrawEventToLocation(state, player.locationId, randomInt ?? (() => 0), "up");
  if (!eventId) return { eventId: null, grantedAttributes: [] };
  const eventDefinition = definitions[eventId] as (CardDefinition & { mentionedAttributes?: string[] }) | undefined;
  const printedAttributes = Array.isArray(eventDefinition?.mentionedAttributes) ? [...new Set(eventDefinition.mentionedAttributes)] : [];
  const attributes = replaceNamedAttributesForColor(state, eventId, printedAttributes);
  if (attributes.length > 0) {
    addCardRuleModifier(player, {
      id: `${skill.id}:objective-types:${eventId}:${state.round}`,
      sourceId: skill.id,
      targetDefinitionIds: charlemagneSkillDefinitionIds(definitions),
      grantAttributes: attributes,
      duration: "round",
    });
  }
  return { eventId, grantedAttributes: attributes };
};

export const resolveCharlemagneJoyeuseOrdre: SkillHandler = ({ state, payload, randomInt }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("CHARLEMAGNE_JOYEUSE_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (selections.length === 0) return { returnedEventId: null };
  const eventId = selections[0];
  const locationId = previous.locationId;
  const candidates = Array.isArray(previous.candidateEventIds) ? previous.candidateEventIds.filter((id): id is string => typeof id === "string") : [];
  if ((locationId !== "mountain" && locationId !== "city") || !candidates.includes(eventId)
    || !state.board.currentEvents[locationId]?.includes(eventId)) throw new Error("CHARLEMAGNE_JOYEUSE_EVENT_INVALID");
  moveEvent(state, eventId, { zone: "deck" });
  shuffleEventDeckContaining(state, eventId, randomInt ?? (() => 0));
  return { returnedEventId: eventId };
};

export const isCharlemagneJoyeuseLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  return ability?.id === "joyeuse-draw-objective" && state.phase === "combat" && state.activePlayerId === playerId
    && Boolean(player && (player.locationId === "mountain" || player.locationId === "city"));
};

/** Charles Patricius is executed by its structured residual tag in combat-power; this handler is its explicit executable boundary. */
export const useCharlemagneCharlesPatricius: SkillHandler = () => ({ active: true });
