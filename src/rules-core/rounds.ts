import type { GameState } from "../domain/state/types.ts";
import { clearCardStateBoundToClose, drawCards, movePlayerCard, restoreTemporaryCardDefinitionCopy, returnBorrowedCardToOwnerDiscard, returnBorrowedCardToOwnerHand } from "./decks.ts";
import { initializeSituationDeck } from "./situation-setup.ts";
import type { CardDefinition, EventDefinition, EventGroupDefinition, SituationDefinition } from "./content-types.ts";
import { getEffectiveCardUsageLimit, resetReusableCardUsage } from "./usage-limits.ts";
import { expireTimedManaGainBlock, gainMana } from "./resources.ts";
import { consumeStructuredEliminationReplacement, getStructuredCardResidualGrantSources, getStructuredSituationManaGain } from "./rule-modifiers.ts";
import { recordBattlefieldCoLocation } from "./board.ts";
import { restoreRoundTurnOrderBeforeRotation } from "./turn-order.ts";
import { cardIgnoresUsageLimit, getCardRuleUsageLimitOverride } from "./card-rule-modifiers.ts";
import { moveEvent, tryDrawEventToLocation, type EventLocation } from "./event-lifecycle.ts";
import { STATUS_CHAINED } from "./player-statuses.ts";
import { consumeClimaxEliminationPrevention } from "./elimination-prevention.ts";
import { applyDueDeckRebuilds } from "./deck-rebuilds.ts";
import { eliminateNpcCombatant, listNpcCombatants } from "./npc-combatants.ts";
import { finalizePlayerElimination } from "./elimination.ts";

const DEFER_PREPARATION_DRAW_TAG = "defer-preparation-draw-to-action-start";

function playerDefersPreparationDraw(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  return [...player.masterSkills, ...player.servantSkills, ...player.attack, ...player.hand].some((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === playerId && card.zone !== "removed" && card.zone !== "discard"
      && definition?.tags?.includes(DEFER_PREPARATION_DRAW_TAG));
  });
}

/** Resolve preparation draws explicitly deferred to the start of the whole Action phase. */
export function resolveDeferredActionStartDraws(
  state: GameState,
  randomInt: (maxExclusive: number) => number,
  definitions: Record<string, CardDefinition>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const player of Object.values(state.players)) {
    const round = Number(player.flags.deferredPreparationDrawRound ?? Number.NEGATIVE_INFINITY);
    const target = Number(player.flags.deferredPreparationDrawTarget ?? 0);
    if (round !== state.round || !Number.isInteger(target) || target < 0 || player.eliminated) continue;
    const missing = Math.max(0, target - player.hand.length);
    result[player.id] = missing > 0 ? drawCards(state, player.id, missing, randomInt, definitions) : [];
    delete player.flags.deferredPreparationDrawRound;
    delete player.flags.deferredPreparationDrawTarget;
    delete player.flags.deferredPreparationDrawCount;
  }
  return result;
}

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
  if (!Array.isArray(events)) throw new Error("EVENT_DEFINITIONS_INVALID");
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (!event || typeof event.id !== "string" || event.id.length === 0) throw new Error("EVENT_ID_INVALID");
    if (seen.has(event.id)) throw new Error(`EVENT_ID_DUPLICATE:${event.id}`);
    if (!Number.isInteger(event.victoryPoints) || event.victoryPoints < 0) {
      throw new Error(`EVENT_VICTORY_POINTS_INVALID:${event.id}`);
    }
    if (event.locationId !== undefined && event.locationId !== "mountain" && event.locationId !== "city") {
      throw new Error(`EVENT_LOCATION_INVALID:${event.id}`);
    }
    seen.add(event.id);
    ids.push(event.id);
  }
  state.board.eventDeck = shuffle(ids, randomInt);
  state.board.eventDiscard = [];
  state.board.eventRemoved = [];
  state.board.currentEvents = { mountain: [], city: [] };
  state.board.eventVisibility = {};
  state.board.eventVictoryPointBonuses = {};
  state.board.eventVictoryPointOverrides = {};
  state.board.outpostRecords = { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] };
}

function drawEvents(state: GameState, count: number, randomInt: (maxExclusive: number) => number): string[] {
  if (!Number.isInteger(count) || count < 0) throw new Error("EVENT_DRAW_COUNT_INVALID");
  const drawn: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (state.board.eventDeck.length === 0 && state.board.eventDiscard.length > 0) {
      state.board.eventDeck = shuffle(state.board.eventDiscard, randomInt);
      state.board.eventDiscard = [];
    }
    const eventId = state.board.eventDeck.shift();
    if (!eventId) throw new Error("EVENT_DECK_EMPTY");
    drawn.push(eventId);
  }
  return drawn;
}

function assertEventPlacement(placement: { mountain: number; city: number }): void {
  if (!placement || !Number.isInteger(placement.mountain) || placement.mountain < 0
    || !Number.isInteger(placement.city) || placement.city < 0) {
    throw new Error("EVENT_PLACEMENT_INVALID");
  }
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
    ...Object.fromEntries(Object.entries(state.modeState).filter(([key]) => !key.startsWith("gorgon-np:"))),
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
  definitions: Record<string, CardDefinition> = {},
): void {
  // Build the entire round on a draft so a missing event or invalid content
  // cannot leave the live state in a half-started round.
  const draft = structuredClone(state) as GameState;
  startStandardRoundDraft(draft, situations, events, randomInt, definitions);
  Object.assign(state, draft);
}

function startStandardRoundDraft(
  state: GameState,
  situations: SituationDefinition[],
  events: EventDefinition[],
  randomInt: (maxExclusive: number) => number,
  definitions: Record<string, CardDefinition>,
): void {
  if (state.status !== "playing") throw new Error("GAME_NOT_PLAYING");
  state.round += 1;
  applyDueDeckRebuilds(state, state.round, definitions, randomInt);
  type PendingRoundEventPlacement = { targetRound: number; eventId: string; locationId: EventLocation; sourceId?: string; controllerPlayerId?: string; replaceOrdinarySlot?: boolean };
  type PendingRoundCardReturn = { targetRound: number; playerId: string; definitionId: string; destination: "master-skills" | "servant-skills"; sourceId?: string };
  type PendingRoundAttackJoin = { targetRound: number; playerId: string; instanceId: string; sourceId?: string };
  const pendingPlacements = (Array.isArray(state.modeState.pendingRoundEventPlacements) ? state.modeState.pendingRoundEventPlacements : [])
    .filter((entry): entry is PendingRoundEventPlacement => Boolean(entry) && typeof entry === "object"
      && Number.isInteger((entry as PendingRoundEventPlacement).targetRound)
      && typeof (entry as PendingRoundEventPlacement).eventId === "string"
      && ((entry as PendingRoundEventPlacement).locationId === "mountain" || (entry as PendingRoundEventPlacement).locationId === "city"));
  const duePlacements = pendingPlacements.filter((entry) => entry.targetRound === state.round);
  const futurePlacements = pendingPlacements.filter((entry) => entry.targetRound > state.round);
  if (futurePlacements.length > 0) state.modeState.pendingRoundEventPlacements = futurePlacements;
  else delete state.modeState.pendingRoundEventPlacements;
  // Reserve carry-over events before the ordinary event draw so a discard reshuffle
  // cannot consume the same physical card as one of the new round's normal events.
  for (const placement of duePlacements) moveEvent(state, placement.eventId, { zone: "removed" });

  const pendingReturns = (Array.isArray(state.modeState.pendingRoundCardReturns) ? state.modeState.pendingRoundCardReturns : [])
    .filter((entry): entry is PendingRoundCardReturn => Boolean(entry) && typeof entry === "object"
      && Number.isInteger((entry as PendingRoundCardReturn).targetRound)
      && typeof (entry as PendingRoundCardReturn).playerId === "string"
      && typeof (entry as PendingRoundCardReturn).definitionId === "string"
      && ((entry as PendingRoundCardReturn).destination === "master-skills" || (entry as PendingRoundCardReturn).destination === "servant-skills"));
  const dueReturns = pendingReturns.filter((entry) => entry.targetRound === state.round);
  const futureReturns = pendingReturns.filter((entry) => entry.targetRound > state.round);
  if (futureReturns.length > 0) state.modeState.pendingRoundCardReturns = futureReturns;
  else delete state.modeState.pendingRoundCardReturns;
  for (const pending of dueReturns) {
    const owner = state.players[pending.playerId];
    if (!owner || owner.eliminated) continue;
    const instance = Object.values(state.cards).find((card) => card.ownerPlayerId === pending.playerId && card.definitionId === pending.definitionId);
    if (!instance) continue;
    movePlayerCard(state, pending.playerId, instance.instanceId, pending.destination);
    instance.face = "up";
    instance.active = false;
    instance.residual = false;
  }

  const pendingAttackJoins = (Array.isArray(state.modeState.pendingRoundAttackJoins) ? state.modeState.pendingRoundAttackJoins : [])
    .filter((entry): entry is PendingRoundAttackJoin => Boolean(entry) && typeof entry === "object"
      && Number.isInteger((entry as PendingRoundAttackJoin).targetRound)
      && typeof (entry as PendingRoundAttackJoin).playerId === "string"
      && typeof (entry as PendingRoundAttackJoin).instanceId === "string");
  const dueAttackJoins = pendingAttackJoins.filter((entry) => entry.targetRound === state.round);
  const futureAttackJoins = pendingAttackJoins.filter((entry) => entry.targetRound > state.round);
  if (futureAttackJoins.length > 0) state.modeState.pendingRoundAttackJoins = futureAttackJoins;
  else delete state.modeState.pendingRoundAttackJoins;
  for (const pending of dueAttackJoins) {
    const owner = state.players[pending.playerId];
    const instance = state.cards[pending.instanceId];
    if (!owner || owner.eliminated || !instance || instance.ownerPlayerId !== owner.id || instance.zone === "removed") continue;
    movePlayerCard(state, owner.id, instance.instanceId, "attack");
    instance.face = "up";
    instance.active = true;
    instance.residual = definitions[instance.definitionId]?.residual === true;
    instance.paidCost = 0;
    instance.joinedAttackRound = state.round;
  }
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => modifier.duration === "game");
  state.phase = "preparation";
  state.step = "player-window";
  for (const player of Object.values(state.players)) {
    player.flags.movementDistanceThisRound = 0;
    player.flags.movementCountThisRound = 0;
    player.flags.faceUpCardsPlayedThisRound = 0;
    player.flags.cardsPlayedThisRound = 0;
    delete player.flags.roundExclusiveCardPlayedRound;
    delete player.flags.optionalExtraStandardAttackCards;
    delete player.flags.optionalFreeExtraStandardAttackCards;
    delete player.flags.optionalFreeExtraStandardAttackUsedRound;
    delete player.roundPlayRestriction;
    player.flags.roundVictoryPointsGained = 0;
    delete player.flags.victoryPointGainBlocked;
    delete player.flags.victoryPointGainMultiplier;
    const pendingVictoryPointMultiplier = Number(player.flags.nextRoundVictoryPointGainMultiplier ?? 1);
    if (!Number.isInteger(pendingVictoryPointMultiplier) || pendingVictoryPointMultiplier < 1) throw new Error("NEXT_ROUND_VP_MULTIPLIER_INVALID");
    if (pendingVictoryPointMultiplier > 1) player.flags.victoryPointGainMultiplier = pendingVictoryPointMultiplier;
    delete player.flags.nextRoundVictoryPointGainMultiplier;
    const pendingPowerBonus = Number(player.flags.nextRoundTotalPowerBonus ?? 0);
    if (!Number.isInteger(pendingPowerBonus)) throw new Error("NEXT_ROUND_POWER_BONUS_INVALID");
    if (pendingPowerBonus !== 0) player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + pendingPowerBonus;
    delete player.flags.nextRoundTotalPowerBonus;
    delete player.flags.workshopResourceGainBlocked;
    expireTimedManaGainBlock(player, state.round);
    const drawBlockThroughRound = Number(player.flags.normalCardDrawBlockedThroughRound ?? Number.NEGATIVE_INFINITY);
    if (drawBlockThroughRound < state.round) delete player.flags.normalCardDrawBlockedThroughRound;
    player.sharedBattlefieldPlayerIdsThisRound = [];
    player.locationsPassedThisRound = [];
    if (player.skillUsageLimitOverrides) {
      player.skillUsageLimitOverrides = player.skillUsageLimitOverrides.filter((override) => override.round >= state.round);
      if (player.skillUsageLimitOverrides.length === 0) delete player.skillUsageLimitOverrides;
    }
    const chainedThroughRound = Number(player.flags.chainedThroughRound ?? Number.NEGATIVE_INFINITY);
    if (chainedThroughRound < state.round) {
      player.statuses = player.statuses.filter((status) => status !== STATUS_CHAINED);
      delete player.flags.chainedThroughRound;
    }
    const noblePhantasmBlockThroughRound = Number(player.flags.noblePhantasmUseBlockedThroughRound ?? Number.NEGATIVE_INFINITY);
    if (noblePhantasmBlockThroughRound < state.round) delete player.flags.noblePhantasmUseBlockedThroughRound;
    player.statuses = player.statuses.filter((status) => {
      const match = /^poison-until:(\d+)$/.exec(status);
      return !match || Number(match[1]) >= state.round;
    });
  }
  recordBattlefieldCoLocation(state, "mountain");
  recordBattlefieldCoLocation(state, "city");
  state.board.scoutingAwardedRound = null;
  state.modeState = Object.fromEntries(
    Object.entries(state.modeState).filter(([key]) => !key.startsWith("gorgon-np:")),
  );

  if (state.round === 1 && state.board.situationDeck.length === 0) initializeSituationDeck(state, situations, randomInt);
  const situationId = state.board.situationDeck.shift();
  if (!situationId) throw new Error("SITUATION_DECK_EMPTY");
  state.board.activeSituations = [situationId];

  const situation = situations.find((item) => item.id === situationId);
  if (!situation) throw new Error("SITUATION_NOT_FOUND");
  state.modeState = {
    ...state.modeState,
    currentSituationId: situationId,
    currentSituationMana: situation.mana,
    currentSituationClimax: situation.climax === true,
    situationRestrictions: {
      ...(situation.eventPlacement ? {} : {}),
      ...(situationId.endsWith("sit12") || situationId.endsWith("sit13") ? { forbiddenLocations: ["city", "scouting"], workshopCapacity: 1 } : {}),
      ...(situation.forbiddenAttributes?.length ? { forbiddenAttributes: [...situation.forbiddenAttributes] } : {}),
      ...(situation.combatPower ? { combatPower: structuredClone(situation.combatPower) } : {}),
    },
  };
  for (const player of Object.values(state.players)) {
    if (player.eliminated) continue;
    player.defeated = false;
    delete player.flags.roundManaGained;
    const roundManaCap = situation.climax
      ? Number(player.flags.roundManaGainCapClimax)
      : Number(player.flags.roundManaGainCapRegular);
    if (Number.isInteger(roundManaCap) && roundManaCap >= 0) player.flags.roundManaGainCap = roundManaCap;
    else delete player.flags.roundManaGainCap;
    // 考列斯【资质平庸】只限制从非高潮局势牌获得的本次魔力，
    // 不影响部署、事件或其他效果提供的魔力。
    const situationManaCap = Number(player.flags.nonClimaxSituationManaCap);
    const cappedSituationMana = !situation.climax && Number.isInteger(situationManaCap) && situationManaCap >= 0
      ? Math.min(situation.mana, situationManaCap)
      : situation.mana;
    const situationMana = getStructuredSituationManaGain(state, player.id, definitions, cappedSituationMana);
    gainMana(player, situationMana);
    const revealedHandSizeBonus = player.trueNameRevealed
      ? [...player.masterSkills, ...player.servantSkills, ...player.hand, ...player.attack]
        .map((instanceId) => definitions[state.cards[instanceId]?.definitionId ?? ""])
        .filter((definition) => definition?.tags?.includes("revealed-hand-size-plus-one"))
        .length
      : 0;
    const handTarget = 3 + revealedHandSizeBonus;
    if (playerDefersPreparationDraw(state, player.id, definitions)) {
      player.flags.deferredPreparationDrawRound = state.round;
      player.flags.deferredPreparationDrawTarget = handTarget;
      delete player.flags.deferredPreparationDrawCount;
    } else {
      const missing = Math.max(0, handTarget - player.hand.length);
      if (missing > 0) drawCards(state, player.id, missing, randomInt, definitions);
    }
    // Clear round/turn limits while preserving skills already spent for the game.
    player.usage = Object.fromEntries(Object.entries(player.usage).filter(([, usage]) => usage.usedGame));
  }

  const placement = situation.eventPlacement ?? { mountain: 1, city: 1 };
  assertEventPlacement(placement);
  state.board.currentEvents = { mountain: [], city: [] };
  state.board.eventVisibility = {};
  const drawForLocation = (locationId: EventLocation, count: number, visibility: "up" | "down") => {
    const drawn: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const eventId = tryDrawEventToLocation(state, locationId, randomInt, visibility);
      if (!eventId) {
        // A named replacement pool may legitimately be exhausted because all of
        // its cards were removed. The ordinary match event deck may not.
        if (!state.board.eventPoolOverrides?.[locationId]) throw new Error("EVENT_DECK_EMPTY");
        break;
      }
      drawn.push(eventId);
    }
    return drawn;
  };
  const replacementCount = (locationId: EventLocation): number => duePlacements
    .filter((entry) => entry.locationId === locationId && entry.replaceOrdinarySlot === true).length;
  const mountainReplacementCount = replacementCount("mountain");
  const cityReplacementCount = replacementCount("city");
  if (mountainReplacementCount > placement.mountain || cityReplacementCount > placement.city) {
    throw new Error("PENDING_EVENT_REPLACEMENT_EXCEEDS_PLACEMENT");
  }
  const mountainEvents = drawForLocation("mountain", placement.mountain - mountainReplacementCount, "up");
  const cityEvents = drawForLocation("city", placement.city - cityReplacementCount, "down");
  for (const eventId of [...mountainEvents, ...cityEvents]) {
    if (!events.some((event) => event.id === eventId) && !definitions[eventId]) throw new Error("EVENT_NOT_FOUND");
  }
  for (const placement of duePlacements) {
    if (!events.some((event) => event.id === placement.eventId)) throw new Error("PENDING_EVENT_PLACEMENT_DEFINITION_NOT_FOUND");
    moveEvent(state, placement.eventId, {
      zone: "current",
      locationId: placement.locationId,
      visibility: placement.locationId === "mountain" ? "up" : "down",
    });
  }
  state.activePlayerId = state.turnOrder.find((id) => !state.players[id].eliminated) ?? null;
}

export interface RoundEndHooks {
  /** Step 1: resolve effects that explicitly occur after combat. */
  resolveAfterCombat?: (state: GameState) => void;
  /** Step 6: resolve effects that explicitly occur at round end. */
  resolveAtRoundEnd?: (state: GameState) => void;
}

function clearExpiredInstanceRoundMarkers(
  instance: GameState["cards"][string],
  round: number,
): void {
  let residualExpired = false;
  let attributeOverrideExpired = false;
  const kept: string[] = [];
  for (const marker of instance.modifiers ?? []) {
    const residualMatch = /^residual-until-round-end:(\d+)(?::|$)/.exec(marker);
    if (residualMatch && Number(residualMatch[1]) <= round) {
      residualExpired = true;
      continue;
    }
    const attributeMatch = /^attribute-overrides-until-round-end:(\d+)(?::|$)/.exec(marker);
    if (attributeMatch && Number(attributeMatch[1]) <= round) {
      attributeOverrideExpired = true;
      continue;
    }
    kept.push(marker);
  }
  instance.modifiers = kept;
  if (residualExpired) instance.residual = false;
  if (attributeOverrideExpired) delete instance.attributeOverrides;
}

/**
 * Apply the universal six-step round-end procedure from the base rules.
 * Hooks are deliberately optional so the existing engine remains compatible;
 * they make the ordering explicit for mode/effect orchestration and tests.
 */
export function endStandardRound(
  state: GameState,
  cards: Record<string, { isSkill?: boolean; limit?: "once-per-game" | "twice-per-game" | "once-per-round" | "twice-per-round" | "once-per-turn"; returnToOwnerHandOnOwnerCombatLoss?: boolean }> = {},
  hooks: RoundEndHooks = {},
): void {
  // 1. Battle-after effects must resolve before any cleanup or relocation.
  hooks.resolveAfterCombat?.(state);

  // Materialized delayed removals resolve before ordinary attack cleanup, so
  // both the source item and its strengthened target leave play atomically.
  for (const card of Object.values(state.cards)) {
    if (!card.ownerPlayerId || !card.modifiers.includes(`remove-at-round-end:${state.round}`)) continue;
    movePlayerCard(state, card.ownerPlayerId, card.instanceId, "removed");
    card.active = false;
    card.residual = false;
    card.face = "down";
  }

  // 2. Remove every master from the board.
  for (const player of Object.values(state.players)) {
    player.locationId = null;
  }

  // 3. Discard all active situation and event cards.
  state.board.situationDiscard.push(...state.board.activeSituations);
  state.board.activeSituations = [];
  for (const eventId of Object.values(state.board.currentEvents).flat()) moveEvent(state, eventId, { zone: "discard" });
  state.board.currentEvents = { mountain: [], city: [] };
  state.board.eventVisibility = {};
  state.board.eventVictoryPointBonuses = {};
  state.board.eventVictoryPointOverrides = {};

  // Definition-copy effects may leave the physical source in any zone. Restore
  // every due copy before ordinary close/discard logic so its real card type,
  // ownership and resting-zone rules govern cleanup.
  for (const card of Object.values(state.cards)) {
    if (card.temporaryDefinitionCopy && card.temporaryDefinitionCopy.expiresRound <= state.round) {
      restoreTemporaryCardDefinitionCopy(card);
    }
    // Physical round modifiers can leave the attack before round cleanup
    // (for example a shuffled attack). Expire them by physical instance,
    // independent of the card's current zone.
    if (card.powerModifiers) {
      card.powerModifiers = card.powerModifiers.filter((modifier) => modifier.duration === "game");
      if (card.powerModifiers.length === 0) delete card.powerModifiers;
    }
    if (card.costModifiers) {
      card.costModifiers = card.costModifiers.filter((modifier) => modifier.duration === "game");
      if (card.costModifiers.length === 0) delete card.costModifiers;
    }
  }

  // 4-5. Preserve residual attacks, remove one-shot cards, and close all
  // other attacks using their card category and printed usage limit.
  for (const player of Object.values(state.players)) {
    const remainingAttack: string[] = [];
    for (const instanceId of [...player.attack]) {
      const instance = state.cards[instanceId];
      resetReusableCardUsage(instance);
      if (instance?.powerModifiers) {
        instance.powerModifiers = instance.powerModifiers.filter((modifier) => modifier.duration === "game");
        if (instance.powerModifiers.length === 0) delete instance.powerModifiers;
      }
      clearExpiredInstanceRoundMarkers(instance, state.round);
      if (instance?.returnToOwnerDiscardOnClose === true && instance.controllerPlayerId === player.id && instance.ownerPlayerId !== player.id) {
        const owner = state.players[instance.ownerPlayerId ?? ""];
        if (cards[instance.definitionId]?.returnToOwnerHandOnOwnerCombatLoss === true && owner?.flags.combatLossRound === state.round) {
          returnBorrowedCardToOwnerHand(state, player.id, instanceId);
          continue;
        }
        returnBorrowedCardToOwnerDiscard(state, player.id, instanceId);
        continue;
      }
      if (instance?.ownerPlayerId === player.id && cards[instance.definitionId]?.returnToOwnerHandOnOwnerCombatLoss === true
        && player.flags.combatLossRound === state.round) {
        clearCardStateBoundToClose(instance);
        player.attack = player.attack.filter((id) => id !== instanceId);
        player.hand = player.hand.filter((id) => id !== instanceId);
        player.hand.push(instanceId);
        instance.controllerPlayerId = player.id;
        instance.zone = "hand";
        instance.face = "down";
        instance.active = false;
        instance.residual = false;
        continue;
      }
      if (instance.temporary && instance.temporaryCleanup !== "explicit") {
        clearCardStateBoundToClose(instance);
        player.discard = player.discard.filter((id) => id !== instanceId);
        player.masterSkills = player.masterSkills.filter((id) => id !== instanceId);
        player.servantSkills = player.servantSkills.filter((id) => id !== instanceId);
        instance.zone = "removed";
        instance.active = false;
        instance.residual = false;
        continue;
      }
      const definition = cards[instance.definitionId];
      const structuredResidualSources = definition
        ? getStructuredCardResidualGrantSources(state, player.id, instance, definition, cards as Record<string, CardDefinition>)
        : [];
      if (!instance.residual && structuredResidualSources.length > 0) {
        // Passive ongoing text is revealed when the residual property is
        // actually checked by cleanup, not merely when the hidden card entered play.
        for (const source of structuredResidualSources) if (source.face === "down") source.face = "up";
        remainingAttack.push(instanceId);
        continue;
      }
      if (instance.residual) {
        const expiresNow = Number.isInteger(instance.residualUntilRound) && Number(instance.residualUntilRound) <= state.round;
        if (!expiresNow) { remainingAttack.push(instanceId); continue; }
        instance.residual = false;
        delete instance.residualUntilRound;
      }
      clearCardStateBoundToClose(instance);
      player.attack = player.attack.filter((id) => id !== instanceId);
      const effectiveUsageLimit = definition ? (getCardRuleUsageLimitOverride(state, player, instance) ?? getEffectiveCardUsageLimit(instance, definition.limit)) : undefined;
      const exhaustedGameLimit = effectiveUsageLimit === "once-per-game" && instance.used === true
        || (effectiveUsageLimit === "twice-per-game" && Number(instance.usedGameCount ?? 0) >= 2);
      if (exhaustedGameLimit && !cardIgnoresUsageLimit(state, player, instance)) {
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
    delete player.flags.roundPowerBonus;
    delete player.flags.commandSealRoundPowerBonus;
    delete player.flags.commandSealVictoryPointBonusRound;
    delete player.flags.commandSealVictoryPointBonus;
    delete player.flags.victoryPointGainBlocked;
    // Round-scoped play/usage modifiers remain live through attack cleanup,
    // then expire before the next round begins.
    player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.duration !== "round");
    // A source-bound modifier exists only while its source card remains an
    // active residual attack. Remove stale modifiers after attack closure so
    // they cannot affect a later round or an unrelated generated instance.
    player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => {
      if (modifier.duration !== "while-source-active") return true;
      const source = modifier.sourceInstanceId ? state.cards[modifier.sourceInstanceId] : undefined;
      return Boolean(source?.active && source.zone === "attack");
    });
    for (const zoneKey of ["hand", "deck", "discard", "masterSkills", "servantSkills"] as const) {
      for (const instanceId of [...player[zoneKey]]) {
        const instance = state.cards[instanceId];
        if (!instance?.temporary || instance.temporaryCleanup === "explicit") continue;
        player[zoneKey] = player[zoneKey].filter((id) => id !== instanceId);
        instance.zone = "removed";
        instance.face = "down";
        instance.active = false;
        instance.residual = false;
      }
    }
    player.flags.deploymentBonusActive = false;
    delete player.flags.independentActionPenaltyRound;
    delete player.flags.lastAttackCommitManaBefore;
    delete player.flags.roundManaSpent;
    for (const [key, marker] of Object.entries(player.flags)) {
      if (!key.startsWith("structuredRoundFlag:")) continue;
      const flagKey = key.slice("structuredRoundFlag:".length);
      const expiryRound = Number(marker);
      if (Number.isInteger(expiryRound) && expiryRound <= state.round) {
        delete player.flags[flagKey];
        delete player.flags[key];
      }
    }
  }
  for (const instance of Object.values(state.cards)) {
    if (instance.zone !== "board" || !instance.temporary || instance.temporaryCleanup === "explicit") continue;
    instance.zone = "removed";
    instance.face = "down";
    instance.active = false;
    instance.residual = false;
    delete instance.boardLocationId;
  }
  state.board.locations = { workshop: [], mountain: [], city: [], scouting: [] };
  state.board.outpostRecords = { workshop: [null, null, null, null], mountain: [null, null], city: [null, null] };
  state.board.scoutingAwardedRound = null;
  // Per-round passive markers must not leak into later rounds or snapshots.
  state.modeState = Object.fromEntries(
    Object.entries(state.modeState).filter(([key]) => !key.startsWith("gorgon-np:")),
  );

  // 6. Resolve generic “at round end” effects after all cleanup above.
  hooks.resolveAtRoundEnd?.(state);

  restoreRoundTurnOrderBeforeRotation(state);
  if (state.turnOrder.length > 1) state.turnOrder = [...state.turnOrder.slice(1), state.turnOrder[0]];
}

export function applyClimaxElimination(state: GameState, definitions: Record<string, CardDefinition>): string[] {
  const keepCount = state.round === 8 ? 4 : state.round === 9 ? 3 : state.round === 10 ? 2 : null;
  if (!keepCount) return [];
  const bonuses = state.mode === "three-x"
    ? ((state.modeState.threeX as { budgets?: Record<string, { climaxTiebreakBonus?: number }> } | undefined)?.budgets ?? {})
    : {};
  const score = (entry: { id: string; victoryPoints: number; npc?: boolean }): number => entry.victoryPoints + (entry.npc ? 0 : (bonuses[entry.id]?.climaxTiebreakBonus ?? 0));
  const alivePlayers = Object.values(state.players).filter((player) => !player.eliminated);
  const aliveNpcs = listNpcCombatants(state).filter((npc) => !npc.eliminated);
  const ranked = [
    ...alivePlayers.map((player) => ({ id: player.id, victoryPoints: player.victoryPoints, npc: false })),
    ...aliveNpcs.map((npc) => ({ id: npc.id, victoryPoints: npc.victoryPoints, npc: true })),
  ].sort((a, b) => score(b) - score(a));
  if (ranked.length <= keepCount) return [];
  const cutoff = score(ranked[keepCount - 1]);
  const eliminated: string[] = [];
  for (const player of alivePlayers) {
    if (score(player) < cutoff) {
      if (consumeClimaxEliminationPrevention(state, player.id)) continue;
      if (consumeStructuredEliminationReplacement(state, player.id, definitions)) continue;
      // 卫宫士郎【远离尘世的理想乡】：第一次本应被淘汰时清空魔力并继续游戏。
      if (player.flags.shirouIdealLandReady === true) {
        player.flags.shirouIdealLandReady = false;
        player.flags.shirouIdealLandUsed = true;
        player.mana = 0;
        continue;
      }
      finalizePlayerElimination(state, player.id);
      eliminated.push(player.id);
    }
  }
  for (const npc of aliveNpcs) {
    if (score({ ...npc, npc: true }) >= cutoff) continue;
    if (eliminateNpcCombatant(state, npc.id)) eliminated.push(npc.id);
  }
  return eliminated;
}

/**
 * Evaluate the current score table against the next scheduled climax
 * elimination. Ties at the cutoff survive, matching applyClimaxElimination.
 * This intentionally does not predict future VP changes or consume replacement
 * effects; it answers whether the player would be eliminated if that check used
 * the current standings.
 */
export function wouldPlayerBeEliminatedAtNextClimax(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player || player.eliminated) return false;
  const nextRound = state.round <= 8 ? 8 : state.round <= 9 ? 9 : state.round <= 10 ? 10 : null;
  if (nextRound === null) return false;
  const keepCount = nextRound === 8 ? 4 : nextRound === 9 ? 3 : 2;
  const bonuses = state.mode === "three-x"
    ? ((state.modeState.threeX as { budgets?: Record<string, { climaxTiebreakBonus?: number }> } | undefined)?.budgets ?? {})
    : {};
  const score = (candidate: { id: string; victoryPoints: number; npc?: boolean }): number => candidate.victoryPoints + (candidate.npc ? 0 : (bonuses[candidate.id]?.climaxTiebreakBonus ?? 0));
  const ranked = [
    ...Object.values(state.players).filter((candidate) => !candidate.eliminated).map((candidate) => ({ id: candidate.id, victoryPoints: candidate.victoryPoints, npc: false })),
    ...listNpcCombatants(state).filter((npc) => !npc.eliminated).map((npc) => ({ id: npc.id, victoryPoints: npc.victoryPoints, npc: true })),
  ].sort((a, b) => score(b) - score(a));
  if (ranked.length <= keepCount) return false;
  const cutoff = score(ranked[keepCount - 1]);
  return score({ id: player.id, victoryPoints: player.victoryPoints, npc: false }) < cutoff;
}
