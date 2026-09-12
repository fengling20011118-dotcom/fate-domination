import type { CardZone, GameEvent, GameState } from "../domain/state/types.ts";

export interface StateFactSnapshot {
  players: Record<string, { mana: number; victoryPoints: number; commandSeals: number; commandSealUses: number; defeated: boolean; locationId: string | null; customResources: Record<string, number> }>;
  cards: Record<string, { zone: CardZone; face: "up" | "down"; active: boolean; residual: boolean; ownerPlayerId: string | null; controllerPlayerId: string | null }>;
  manaSpendSequence: number;
  manaGainOverflowSequences: Record<string, number>;
  deckShuffleSequence: number;
}

export function captureStateFacts(state: GameState): StateFactSnapshot {
  return {
    players: Object.fromEntries(Object.values(state.players).map((player) => [player.id, {
      mana: player.mana,
      victoryPoints: player.victoryPoints,
      commandSeals: player.commandSeals,
      commandSealUses: Number(player.flags.commandSealUsesRound === state.round ? player.flags.commandSealUsesThisRound ?? 0 : 0)
        + Number(player.flags.rulerCommandSealUsesRound === state.round ? player.flags.rulerCommandSealUsesThisRound ?? 0 : 0),
      defeated: player.defeated,
      locationId: player.locationId,
      customResources: { ...(player.customResources ?? {}) },
    }])),
    cards: Object.fromEntries(Object.values(state.cards).map((card) => [card.instanceId, {
      zone: card.zone,
      face: card.face,
      active: card.active,
      residual: card.residual,
      ownerPlayerId: card.ownerPlayerId,
      controllerPlayerId: card.controllerPlayerId,
    }])),
    manaSpendSequence: Number(state.modeState.manaSpendSequence ?? 0),
    manaGainOverflowSequences: Object.fromEntries(Object.values(state.players).map((player) => [player.id, Number(player.flags.manaGainOverflowSequence ?? 0)])),
    deckShuffleSequence: Number(state.modeState.deckShuffleSequence ?? 0),
  };
}

function payloadOf(event: GameEvent): Record<string, unknown> | undefined {
  return event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : undefined;
}

function alreadyEmitted(events: readonly GameEvent[] | undefined, type: string, idKey: "playerId" | "instanceId", id: string): boolean {
  return Boolean(events?.some((event) => event.type === type && payloadOf(event)?.[idKey] === id));
}

/**
 * Emits deterministic facts for observable authoritative state changes. This is
 * intentionally state-based: legacy V2 handlers and structured handlers share
 * the same facts without parsing card text or depending on UI behavior.
 */
export function emitStateFactDiff(
  before: StateFactSnapshot,
  state: GameState,
  emit: ((type: string, payload: unknown) => void) | undefined,
  options: { sourceId?: string; existingEvents?: readonly GameEvent[] } = {},
): void {
  if (!emit) return;
  const sourceId = options.sourceId;
  const spendLedger = Array.isArray(state.modeState.manaSpendLedger)
    ? state.modeState.manaSpendLedger
    : [];
  for (const raw of spendLedger) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const sequence = Number(entry.sequence);
    const playerId = typeof entry.playerId === "string" ? entry.playerId : undefined;
    const amount = Number(entry.amount);
    const round = Number(entry.round);
    if (!Number.isSafeInteger(sequence) || sequence <= before.manaSpendSequence || !playerId || !Number.isInteger(amount) || amount <= 0) continue;
    const already = options.existingEvents?.some((event) => event.type === "player.mana.spent"
      && payloadOf(event)?.sequence === sequence);
    if (already) continue;
    emit("player.mana.spent", { playerId, amount, round, sequence, ...(sourceId ? { sourceId } : {}) });
  }
  for (const player of Object.values(state.players)) {
    const previousOverflowSequence = Number(before.manaGainOverflowSequences[player.id] ?? 0);
    const overflowLedger = Array.isArray(player.flags.manaGainOverflowLedger) ? player.flags.manaGainOverflowLedger : [];
    for (const raw of overflowLedger) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const entry = raw as Record<string, unknown>;
      const sequence = Number(entry.sequence);
      const overflow = Number(entry.overflow);
      if (!Number.isSafeInteger(sequence) || sequence <= previousOverflowSequence || !Number.isInteger(overflow) || overflow <= 0) continue;
      const already = options.existingEvents?.some((event) => event.type === "player.mana-gain-overflow"
        && payloadOf(event)?.playerId === player.id && payloadOf(event)?.sequence === sequence);
      if (already) continue;
      emit("player.mana-gain-overflow", {
        playerId: player.id,
        round: state.round,
        sequence,
        requested: Number(entry.requested),
        applied: Number(entry.applied),
        overflow,
        cap: Number(entry.cap),
        before: Number(entry.before),
        ...(sourceId ? { sourceId } : {}),
      });
    }
  }
  const shuffleLedger = Array.isArray(state.modeState.deckShuffleLedger)
    ? state.modeState.deckShuffleLedger
    : [];
  for (const raw of shuffleLedger) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const sequence = Number(entry.sequence);
    const playerId = typeof entry.playerId === "string" ? entry.playerId : undefined;
    const round = Number(entry.round);
    const reason = entry.reason === "effect" || entry.reason === "automatic-recycle" ? entry.reason : undefined;
    if (!Number.isSafeInteger(sequence) || sequence <= before.deckShuffleSequence || !playerId) continue;
    const already = options.existingEvents?.some((event) => event.type === "player.deck-shuffled"
      && payloadOf(event)?.sequence === sequence);
    if (already) continue;
    emit("player.deck-shuffled", { playerId, round, sequence, ...(reason ? { reason } : {}), ...(sourceId ? { sourceId } : {}) });
  }
  for (const player of Object.values(state.players)) {
    const previous = before.players[player.id];
    if (!previous) continue;
    if (previous.mana !== player.mana && !alreadyEmitted(options.existingEvents, "player.mana.changed", "playerId", player.id)) {
      emit("player.mana.changed", { playerId: player.id, round: state.round, before: previous.mana, after: player.mana, delta: player.mana - previous.mana, ...(sourceId ? { sourceId } : {}) });
    }
    if (previous.victoryPoints !== player.victoryPoints && !alreadyEmitted(options.existingEvents, "player.victory-points.changed", "playerId", player.id)) {
      const delta = player.victoryPoints - previous.victoryPoints;
      if (delta > 0) player.flags.roundVictoryPointsGained = Number(player.flags.roundVictoryPointsGained ?? 0) + delta;
      emit("player.victory-points.changed", { playerId: player.id, round: state.round, before: previous.victoryPoints, after: player.victoryPoints, delta, ...(sourceId ? { sourceId } : {}) });
    }
    const commandSealUses = Number(player.flags.commandSealUsesRound === state.round ? player.flags.commandSealUsesThisRound ?? 0 : 0)
      + Number(player.flags.rulerCommandSealUsesRound === state.round ? player.flags.rulerCommandSealUsesThisRound ?? 0 : 0);
    if (commandSealUses > previous.commandSealUses && !alreadyEmitted(options.existingEvents, "player.command-seal-used", "playerId", player.id)) {
      emit("player.command-seal-used", { playerId: player.id, round: state.round, amount: commandSealUses - previous.commandSealUses, totalUsesThisRound: commandSealUses, ...(sourceId ? { sourceId } : {}) });
    }
    if (previous.commandSeals !== player.commandSeals && !alreadyEmitted(options.existingEvents, "player.command-seals.changed", "playerId", player.id)) {
      const delta = player.commandSeals - previous.commandSeals;
      const replacementSourceId = typeof player.flags.commandSealGainReplacementSourceId === "string"
        ? player.flags.commandSealGainReplacementSourceId
        : undefined;
      // Replacement effects must intercept the gain before downstream rules can
      // observe an ordinary Command Seal change.  The replacement is identified
      // only by a stable source id; its concrete result is resolved by the
      // owning passive handler through the emitted domain event.
      if (delta > 0 && replacementSourceId) {
        const attemptedAfter = player.commandSeals;
        player.commandSeals = previous.commandSeals;
        emit("player.command-seal-gain-replaced", {
          playerId: player.id,
          round: state.round,
          before: previous.commandSeals,
          attemptedAfter,
          amount: delta,
          replacementSourceId,
          ...(sourceId ? { sourceId } : {}),
        });
      } else {
        emit("player.command-seals.changed", { playerId: player.id, round: state.round, before: previous.commandSeals, after: player.commandSeals, delta, ...(sourceId ? { sourceId } : {}) });
      }
    }
    const resourceIds = new Set([...Object.keys(previous.customResources), ...Object.keys(player.customResources ?? {})]);
    for (const resourceId of resourceIds) {
      const beforeValue = Number(previous.customResources[resourceId] ?? 0);
      const afterValue = Number(player.customResources?.[resourceId] ?? 0);
      if (beforeValue === afterValue) continue;
      emit("player.resource.changed", {
        playerId: player.id,
        resourceId,
        round: state.round,
        before: beforeValue,
        after: afterValue,
        delta: afterValue - beforeValue,
        ...(sourceId ? { sourceId } : {}),
      });
    }
  }

  for (const card of Object.values(state.cards)) {
    const previous = before.cards[card.instanceId];
    const common = { instanceId: card.instanceId, definitionId: card.definitionId, ownerPlayerId: card.ownerPlayerId, ...(sourceId ? { sourceId } : {}) };
    if (!previous) {
      if (!alreadyEmitted(options.existingEvents, "card.created", "instanceId", card.instanceId)) emit("card.created", { ...common, zone: card.zone, face: card.face, active: card.active });
      if (card.zone === "hand" && !alreadyEmitted(options.existingEvents, "card.drawn", "instanceId", card.instanceId)) emit("card.drawn", { ...common, fromZone: null, toZone: "hand" });
      if (card.zone === "attack" && !alreadyEmitted(options.existingEvents, "card.entered-attack", "instanceId", card.instanceId)) emit("card.entered-attack", { ...common, fromZone: null, toZone: "attack", face: card.face, active: card.active });
      continue;
    }
    if (previous.zone !== card.zone) {
      if (!alreadyEmitted(options.existingEvents, "card.zone.changed", "instanceId", card.instanceId)) emit("card.zone.changed", { ...common, fromZone: previous.zone, toZone: card.zone });
      if (previous.zone === "deck" && card.zone === "hand" && !alreadyEmitted(options.existingEvents, "card.drawn", "instanceId", card.instanceId)) emit("card.drawn", { ...common, fromZone: previous.zone, toZone: card.zone });
      if (card.zone === "discard" && !alreadyEmitted(options.existingEvents, "card.discarded", "instanceId", card.instanceId)) emit("card.discarded", { ...common, fromZone: previous.zone, toZone: card.zone });
      if (card.zone === "removed" && !alreadyEmitted(options.existingEvents, "card.exiled", "instanceId", card.instanceId)) emit("card.exiled", { ...common, fromZone: previous.zone, toZone: card.zone });
      if (card.zone === "attack" && !alreadyEmitted(options.existingEvents, "card.entered-attack", "instanceId", card.instanceId)) emit("card.entered-attack", { ...common, fromZone: previous.zone, toZone: card.zone, face: card.face, active: card.active });
    }
    if (previous.active && !card.active && !alreadyEmitted(options.existingEvents, "card.closed", "instanceId", card.instanceId)) {
      emit("card.closed", { ...common, fromZone: previous.zone, toZone: card.zone });
    }
    if (!previous.active && card.active && !alreadyEmitted(options.existingEvents, "card.activated", "instanceId", card.instanceId)) {
      emit("card.activated", { ...common, zone: card.zone, face: card.face });
    }
  }
}
