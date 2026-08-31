import type { GameState } from "../domain/state/types.ts";
import { drawCards } from "./decks.ts";
import { initializeSituationDeck } from "./situation-setup.ts";
import type { EventDefinition, EventGroupDefinition, SituationDefinition } from "./content-types.ts";
import { resetReusableCardUsage } from "./usage-limits.ts";
import { applyJekyllHydeRoundStart } from "./jekyll-hyde.ts";

function shuffle(values: string[], randomInt: (maxExclusive: number) => number): string[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function initializeEventDeck(
  state: GameState,
  events: EventDefinition[],
  randomInt: (maxExclusive: number) => number,
): void {
  state.board.eventDeck = shuffle(events.map((event) => event.id), randomInt);
  state.board.eventDiscard = [];
  state.board.currentEvents = { mountain: [], city: [] };
  state.board.eventVisibility = {};
  state.board.outpostRecords = { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] };
}

function drawEvents(state: GameState, count: number, randomInt: (maxExclusive: number) => number): string[] {
  const drawn: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (state.board.eventDeck.length === 0 && state.board.eventDiscard.length > 0) {
      state.board.eventDeck = shuffle(state.board.eventDiscard, randomInt);
      state.board.eventDiscard = [];
    }
    const eventId = state.board.eventDeck.shift();
    if (eventId) drawn.push(eventId);
  }
  return drawn;
}

export function chooseEventGroup(
  state: GameState,
  groups: EventGroupDefinition[] | undefined,
  events: EventDefinition[],
  randomInt: (maxExclusive: number) => number,
): EventDefinition[] {
  if (!groups || groups.length === 0) return events;
  const selectable = groups.filter((group) => group.eventIds.length > 0);
  if (selectable.length === 0) throw new Error("EVENT_GROUP_EMPTY");
  const group = selectable[randomInt(selectable.length)];
  const selected = group.eventIds.map((id) => events.find((event) => event.id === id)).filter((event): event is EventDefinition => Boolean(event));
  if (selected.length !== group.eventIds.length) throw new Error("EVENT_GROUP_CARD_NOT_FOUND");
  state.modeState = {
    ...state.modeState,
    eventGroupId: group.id,
    eventGroupName: group.name,
    eventPoolEventIds: [...group.eventIds],
  };
  return selected;
}

export function startStandardRound(
  state: GameState,
  situations: SituationDefinition[],
  events: EventDefinition[],
  randomInt: (maxExclusive: number) => number,
): void {
  if (state.status !== "playing") throw new Error("GAME_NOT_PLAYING");
  state.round += 1;
  state.phase = "preparation";
  state.step = "player-window";
  applyJekyllHydeRoundStart(state);
  state.board.scoutingAwardedRound = null;

  if (state.round === 1 && state.board.situationDeck.length === 0) initializeSituationDeck(state, situations, randomInt);
  const situationId = state.board.situationDeck.shift();
  if (!situationId) throw new Error("SITUATION_DECK_EMPTY");
  state.board.activeSituations = [situationId];

  const situation = situations.find((item) => item.id === situationId);
  if (!situation) throw new Error("SITUATION_NOT_FOUND");
  state.modeState = {
    ...state.modeState,
    currentSituationId: situationId,
    situationRestrictions: {
      ...(situation.eventPlacement ? {} : {}),
      ...(situationId.endsWith("sit12") || situationId.endsWith("sit13") ? { forbiddenLocations: ["city", "scouting"], workshopCapacity: 1 } : {}),
      ...(situation.forbiddenAttributes?.length ? { forbiddenAttributes: [...situation.forbiddenAttributes] } : {}),
    },
  };
  for (const player of Object.values(state.players)) {
    if (player.eliminated) continue;
    player.defeated = false;
    player.mana += situation.mana;
    const missing = Math.max(0, 3 - player.hand.length);
    if (missing > 0) drawCards(state, player.id, missing, randomInt);
    // Clear round/turn limits while preserving skills already spent for the game.
    player.usage = Object.fromEntries(Object.entries(player.usage).filter(([, usage]) => usage.usedGame));
  }

  const placement = situation.eventPlacement ?? { mountain: 1, city: 1 };
  const mountainEvents = drawEvents(state, placement.mountain, randomInt);
  const cityEvents = drawEvents(state, placement.city, randomInt);
  if (mountainEvents.length !== placement.mountain || cityEvents.length !== placement.city) throw new Error("EVENT_DECK_EMPTY");
  state.board.currentEvents = { mountain: mountainEvents, city: cityEvents };
  state.board.eventVisibility = Object.fromEntries([
    ...mountainEvents.map((id) => [id, "up"]),
    ...cityEvents.map((id) => [id, "down"]),
  ]);
  for (const eventId of [...mountainEvents, ...cityEvents]) {
    if (!events.some((event) => event.id === eventId)) throw new Error("EVENT_NOT_FOUND");
  }
  state.activePlayerId = state.turnOrder.find((id) => !state.players[id].eliminated) ?? null;
}

export function endStandardRound(state: GameState, cards: Record<string, { isSkill?: boolean; limit?: "once-per-game" | "once-per-round" | "once-per-turn" }> = {}): void {
  for (const player of Object.values(state.players)) {
    const remainingAttack: string[] = [];
    for (const instanceId of [...player.attack]) {
      const instance = state.cards[instanceId];
      resetReusableCardUsage(instance);
      if (instance?.powerModifiers) {
        instance.powerModifiers = instance.powerModifiers.filter((modifier) => modifier.duration === "game");
        if (instance.powerModifiers.length === 0) delete instance.powerModifiers;
      }
      if (instance.temporary) {
        player.discard = player.discard.filter((id) => id !== instanceId);
        player.masterSkills = player.masterSkills.filter((id) => id !== instanceId);
        player.servantSkills = player.servantSkills.filter((id) => id !== instanceId);
        instance.zone = "removed";
        instance.active = false;
        instance.residual = false;
        continue;
      }
      if (instance.residual) { remainingAttack.push(instanceId); continue; }
      player.attack = player.attack.filter((id) => id !== instanceId);
      const definition = cards[instance.definitionId];
      if (definition?.limit === "once-per-game") {
        player.discard = player.discard.filter((id) => id !== instanceId);
        player.masterSkills = player.masterSkills.filter((id) => id !== instanceId);
        player.servantSkills = player.servantSkills.filter((id) => id !== instanceId);
        instance.zone = "removed";
        instance.active = false;
        continue;
      }
      if (definition?.isSkill) {
        const isMasterSkill = definition?.skillOwnerType === "master" || (!definition?.skillOwnerType && instance.definitionId.startsWith("master."));
        if (isMasterSkill) player.masterSkills.push(instanceId);
        else player.servantSkills.push(instanceId);
        instance.zone = isMasterSkill ? "master-skills" : "servant-skills";
        instance.face = "up";
        instance.active = false;
      } else {
        player.discard.push(instanceId);
        instance.zone = "discard";
        instance.active = false;
      }
    }
    player.attack = remainingAttack;
    player.locationId = null;
    player.flags.deploymentBonusActive = false;
    delete player.flags.independentActionPenaltyRound;
  }
  state.board.locations = { workshop: [], mountain: [], city: [], scouting: [] };
  state.board.outpostRecords = { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] };
  state.board.situationDiscard.push(...state.board.activeSituations);
  state.board.activeSituations = [];
  state.board.eventDiscard.push(...Object.values(state.board.currentEvents).flat());
  state.board.currentEvents = { mountain: [], city: [] };
  state.board.eventVisibility = {};
  state.board.scoutingAwardedRound = null;
  if (state.turnOrder.length > 1) state.turnOrder = [...state.turnOrder.slice(1), state.turnOrder[0]];
}

export function applyClimaxElimination(state: GameState): string[] {
  const keepCount = state.round === 8 ? 4 : state.round === 9 ? 3 : state.round === 10 ? 2 : null;
  if (!keepCount) return [];
  const bonuses = state.mode === "three-x"
    ? ((state.modeState.threeX as { budgets?: Record<string, { climaxTiebreakBonus?: number }> } | undefined)?.budgets ?? {})
    : {};
  const score = (player: { id: string; victoryPoints: number }): number => player.victoryPoints + (bonuses[player.id]?.climaxTiebreakBonus ?? 0);
  const alive = Object.values(state.players).filter((player) => !player.eliminated).sort((a, b) => score(b) - score(a));
  if (alive.length <= keepCount) return [];
  const cutoff = score(alive[keepCount - 1]);
  const eliminated: string[] = [];
  for (const player of alive) {
    if (score(player) < cutoff) { player.eliminated = true; eliminated.push(player.id); }
  }
  return eliminated;
}
