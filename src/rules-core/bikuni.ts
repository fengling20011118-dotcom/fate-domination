import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { closePlayerCard, movePlayerCard } from "./decks.ts";
import { drawEventToLocation, removeEventFromLocation, setEventVictoryPointOverride } from "./event-lifecycle.ts";
import {
  discardMoonCellObjective,
  getMoonCellObjectiveIds,
  getMoonCellState,
  moveBattlefieldEventToMoonCell,
  moveMoonCellObjectiveToLocation,
} from "./moon-cell.ts";
import { MOON_CANCER_RESTRICT, MOON_CANCER_SWAP } from "./moon-cancer.ts";
import { gainMana, gainVictoryPoints } from "./resources.ts";

export const BIKUNI_HANDLER = "core.bikuni-moon-cell";
export const BIKUNI_RESOLVE = "core.bikuni-moon-cell-resolve";
export const BIKUNI_OTHERWORLD_ID = "servant.bikuni.skill.sc-bikuni-1";
export const BIKUNI_CLAM_ID = "servant.bikuni.skill.sc-bikuni-2";
export const BIKUNI_MERMAID_ID = "servant.bikuni.skill.sc-bikuni-3";
export const BIKUNI_MOON_CANCER_ID = "servant.bikuni.skill.sc-bikuni-4";

export const BIKUNI_OTHERWORLD_ACTION = "otherworld-creation";
export const BIKUNI_HEAVEN_FOAM = "foam-of-heaven";
export const BIKUNI_PHANTOM_CITY = "worldly-phantom-city";
export const BIKUNI_DREAM_BUBBLE = "dreamlike-bubble";
export const BIKUNI_MOON_CANCER_RESTRICT = MOON_CANCER_RESTRICT;
export const BIKUNI_MOON_CANCER_SWAP = MOON_CANCER_SWAP;

const LUCK_ID = "card.cardluck";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesSkill(card: GameState["cards"][string] | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
}

function activeSource(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && matchesSkill(card, definition, skillId));
  });
}

function openChoice(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  stage: string,
  payload: Record<string, unknown>,
  options: PendingDecision["options"],
  min: number,
  max: number,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: BIKUNI_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `bikuni-${stage}`,
    options,
    min,
    max,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function requireOwnAction(state: GameState, player: PlayerState): void {
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("BIKUNI_ACTION_WINDOW_INVALID");
}

function useOtherworldCreation(state: GameState, player: PlayerState) {
  requireOwnAction(state, player);
  const moonCellPlayers = new Set(getMoonCellState(state).playerIds);
  let rewarded = 0;
  const playerResults: Array<{ playerId: string; gained: number }> = [];
  for (const targetId of state.turnOrder) {
    if (targetId === player.id || !moonCellPlayers.has(targetId)) continue;
    const target = state.players[targetId];
    if (!target || target.eliminated) continue;
    const gained = gainVictoryPoints(target, 1);
    playerResults.push({ playerId: targetId, gained });
    if (gained > 0) rewarded += 1;
  }
  const manaGained = gainMana(player, rewarded);
  return { rewardedOpponentCount: rewarded, manaGained, playerResults };
}

function useHeavenFoam(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  if (state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("BIKUNI_HEAVEN_FOAM_WINDOW_INVALID");
  const source = activeSource(state, player, BIKUNI_OTHERWORLD_ID, definitions);
  if (!source) throw new Error("BIKUNI_OTHERWORLD_SOURCE_INACTIVE");
  const eventCount = getMoonCellObjectiveIds(state).length;
  const amount = eventCount * 2;
  const modifierId = `${BIKUNI_OTHERWORLD_ID}:heaven-foam:${state.round}:${source.instanceId}`;
  source.powerModifiers = [
    ...(source.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
    { id: modifierId, sourceId: BIKUNI_OTHERWORLD_ID, kind: "add", value: amount, duration: "round" },
  ];
  return { eventCount, powerBonus: amount };
}

function beginClamCombatStart(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  const locationId = player.locationId;
  if (state.phase !== "combat" || (locationId !== "mountain" && locationId !== "city")) return;
  if ((state.board.currentEvents[locationId] ?? []).length > 0) return;
  const candidates = getMoonCellObjectiveIds(state);
  if (candidates.length === 0) return;
  if (candidates.length === 1) {
    moveMoonCellObjectiveToLocation(state, candidates[0], locationId, "up");
    return { movedEventId: candidates[0], locationId };
  }
  openChoice(state, player, BIKUNI_CLAM_ID, "clam-combat-event", { locationId, candidates },
    candidates.map((id) => ({ id, label: definitions[id]?.name ?? id })), 1, 1, openDecision);
  return { pending: true, candidates };
}

function beginPhantomCity(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  requireOwnAction(state, player);
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("BIKUNI_PHANTOM_CITY_LOCATION_INVALID");
  const candidates = [...(state.board.currentEvents[locationId] ?? [])];
  if (candidates.length === 0) throw new Error("BIKUNI_PHANTOM_CITY_EVENT_REQUIRED");
  if (candidates.length === 1) {
    moveBattlefieldEventToMoonCell(state, locationId, candidates[0], BIKUNI_CLAM_ID);
    return { movedEventId: candidates[0], locationId };
  }
  openChoice(state, player, BIKUNI_CLAM_ID, "phantom-city", { locationId, candidates },
    candidates.map((id) => ({ id, label: definitions[id]?.name ?? id })), 1, 1, openDecision);
  return { pending: true, candidates };
}

function beginMermaidUpkeep(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  const source = activeSource(state, player, BIKUNI_MERMAID_ID, definitions);
  if (!source) return;
  const events = getMoonCellObjectiveIds(state);
  if (events.length === 0) {
    closePlayerCard(state, player.id, source.instanceId, definitions);
    return { closedInstanceId: source.instanceId };
  }
  const options: PendingDecision["options"] = [
    ...events.map((id) => ({ id: `discard:${id}`, label: `Discard ${definitions[id]?.name ?? id}` })),
    { id: `close:${source.instanceId}`, label: "Close source card" },
  ];
  openChoice(state, player, BIKUNI_MERMAID_ID, "mermaid-upkeep", { sourceInstanceId: source.instanceId, events }, options, 1, 1, openDecision);
  return { pending: true, eventIds: events };
}

function beginDreamBubble(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  requireOwnAction(state, player);
  const luckIds = player.hand.filter((instanceId) => state.cards[instanceId]?.definitionId === LUCK_ID);
  if (luckIds.length === 0) throw new Error("BIKUNI_DREAM_BUBBLE_LUCK_REQUIRED");
  const targets = (["mountain", "city"] as const).flatMap((locationId) =>
    (state.board.currentEvents[locationId] ?? []).map((eventId) => ({ locationId, eventId })));
  if (targets.length === 0) throw new Error("BIKUNI_DREAM_BUBBLE_EVENT_REQUIRED");
  const options = luckIds.flatMap((luckId) => targets.map(({ locationId, eventId }) => ({
    id: `${luckId}|${locationId}|${eventId}`,
    label: `${definitions[eventId]?.name ?? eventId} @ ${locationId}`,
  })));
  openChoice(state, player, BIKUNI_MERMAID_ID, "dream-bubble", {
    luckIds,
    targetKeys: targets.map(({ locationId, eventId }) => `${locationId}|${eventId}`),
  }, options, 1, 1, openDecision);
  return { pending: true };
}

export const useBikuni: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("BIKUNI_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;

  if (eventType === "phase.transitioned" && skill.id === BIKUNI_CLAM_ID) {
    const event = isRecord(data.event) ? data.event : {};
    if (state.phase !== "combat" || (event.transition !== "next-phase" && event.transition !== "next-player")) return;
    return beginClamCombatStart(state, player, definitions, openDecision);
  }
  if (eventType === "round.ending" && skill.id === BIKUNI_MERMAID_ID) return beginMermaidUpkeep(state, player, definitions, openDecision);

  if (skill.id === BIKUNI_OTHERWORLD_ID) {
    if (abilityId === BIKUNI_OTHERWORLD_ACTION) return useOtherworldCreation(state, player);
    if (abilityId === BIKUNI_HEAVEN_FOAM) return useHeavenFoam(state, player, definitions);
  }
  if (skill.id === BIKUNI_CLAM_ID && abilityId === BIKUNI_PHANTOM_CITY) return beginPhantomCity(state, player, definitions, openDecision);
  if (skill.id === BIKUNI_MERMAID_ID && abilityId === BIKUNI_DREAM_BUBBLE) return beginDreamBubble(state, player, definitions, openDecision);
  throw new Error("BIKUNI_ABILITY_INVALID");
};

export const resolveBikuniDecision: SkillHandler = ({ state, player, payload, definitions, randomInt }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("BIKUNI_RESOLVE_CONTEXT_REQUIRED");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error("BIKUNI_SELECTION_INVALID");
  const stage = typeof previous.stage === "string" ? previous.stage : undefined;
  const choice = selections[0];

  if (stage === "clam-combat-event") {
    const locationId = previous.locationId;
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if ((locationId !== "mountain" && locationId !== "city") || !candidates.includes(choice)) throw new Error("BIKUNI_CLAM_SELECTION_INVALID");
    moveMoonCellObjectiveToLocation(state, choice, locationId, "up");
    return { movedEventId: choice, locationId };
  }
  if (stage === "phantom-city") {
    const locationId = previous.locationId;
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if ((locationId !== "mountain" && locationId !== "city") || !candidates.includes(choice)) throw new Error("BIKUNI_PHANTOM_SELECTION_INVALID");
    moveBattlefieldEventToMoonCell(state, locationId, choice, BIKUNI_CLAM_ID);
    return { movedEventId: choice, locationId };
  }
  if (stage === "mermaid-upkeep") {
    const sourceInstanceId = typeof previous.sourceInstanceId === "string" ? previous.sourceInstanceId : undefined;
    const events = Array.isArray(previous.events) ? previous.events.filter((id): id is string => typeof id === "string") : [];
    if (choice.startsWith("discard:")) {
      const eventId = choice.slice("discard:".length);
      if (!events.includes(eventId)) throw new Error("BIKUNI_MERMAID_EVENT_INVALID");
      discardMoonCellObjective(state, eventId);
      return { discardedEventId: eventId };
    }
    if (!sourceInstanceId || choice !== `close:${sourceInstanceId}`) throw new Error("BIKUNI_MERMAID_CLOSE_INVALID");
    closePlayerCard(state, player.id, sourceInstanceId, definitions);
    return { closedInstanceId: sourceInstanceId };
  }
  if (stage === "dream-bubble") {
    const parts = choice.split("|");
    if (parts.length !== 3) throw new Error("BIKUNI_DREAM_BUBBLE_SELECTION_INVALID");
    const [luckId, locationId, eventId] = parts;
    const luckIds = Array.isArray(previous.luckIds) ? previous.luckIds.filter((id): id is string => typeof id === "string") : [];
    const targetKeys = Array.isArray(previous.targetKeys) ? previous.targetKeys.filter((id): id is string => typeof id === "string") : [];
    if (!luckIds.includes(luckId) || !player.hand.includes(luckId) || state.cards[luckId]?.definitionId !== LUCK_ID
      || (locationId !== "mountain" && locationId !== "city") || !targetKeys.includes(`${locationId}|${eventId}`)
      || !state.board.currentEvents[locationId].includes(eventId)) throw new Error("BIKUNI_DREAM_BUBBLE_SELECTION_INVALID");
    const availableEvents = state.board.eventDeck.length + state.board.eventDiscard.length - (state.board.eventDiscard.includes(eventId) ? 1 : 0);
    if (availableEvents < 2) throw new Error("BIKUNI_DREAM_BUBBLE_EVENT_DECK_SHORT");
    const draft = structuredClone(state) as GameState;
    const draftPlayer = draft.players[player.id];
    movePlayerCard(draft, draftPlayer.id, luckId, "discard");
    removeEventFromLocation(draft, locationId, eventId);
    const rng = randomInt ?? (() => 0);
    const drawn = [drawEventToLocation(draft, locationId, rng, "up"), drawEventToLocation(draft, locationId, rng, "up")];
    for (const drawnId of drawn) setEventVictoryPointOverride(draft, drawnId, 1, BIKUNI_MERMAID_ID, { maxValue: 1, round: state.round });
    state.board = draft.board;
    state.cards = draft.cards;
    state.players[player.id] = draftPlayer;
    return { discardedLuckId: luckId, discardedEventId: eventId, drawnEventIds: drawn, locationId };
  }
  throw new Error("BIKUNI_RESOLVE_STAGE_INVALID");
};

export const isBikuniLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || player.eliminated || !definitions) return false;
  const abilityId = ability?.id;
  if (skill.id === BIKUNI_OTHERWORLD_ID) {
    if (abilityId === BIKUNI_OTHERWORLD_ACTION) return state.phase === "action" && state.activePlayerId === playerId;
    if (abilityId === BIKUNI_HEAVEN_FOAM) return state.phase === "combat" && state.activePlayerId === playerId
      && Boolean(activeSource(state, player, skill.id, definitions));
  }
  if (skill.id === BIKUNI_CLAM_ID && abilityId === BIKUNI_PHANTOM_CITY) {
    return state.phase === "action" && state.activePlayerId === playerId
      && (player.locationId === "mountain" || player.locationId === "city")
      && state.board.currentEvents[player.locationId].length > 0;
  }
  if (skill.id === BIKUNI_MERMAID_ID && abilityId === BIKUNI_DREAM_BUBBLE) {
    return state.phase === "action" && state.activePlayerId === playerId
      && player.hand.some((id) => state.cards[id]?.definitionId === LUCK_ID)
      && (["mountain", "city"] as const).some((locationId) => state.board.currentEvents[locationId].length > 0);
  }
  return false;
};
