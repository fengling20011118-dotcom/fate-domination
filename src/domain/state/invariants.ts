import type { CardZone, GameState } from "./types.ts";
import { assertThreeXStateInvariants } from "../../rules-core/three-x-state.ts";

const playerZones: Array<{ key: "hand" | "deck" | "discard" | "attack" | "masterSkills" | "servantSkills"; zone: CardZone }> = [
  { key: "hand", zone: "hand" },
  { key: "deck", zone: "deck" },
  { key: "discard", zone: "discard" },
  { key: "attack", zone: "attack" },
  { key: "masterSkills", zone: "master-skills" },
  { key: "servantSkills", zone: "servant-skills" },
];

export function findStateInvariantViolations(state: GameState): string[] {
  const violations: string[] = [];
  const pendingCombat = state.modeState.pendingCombatResolution as {
    snapshot?: { locationId?: string; participantIds?: unknown; powers?: unknown; attributes?: unknown; round?: unknown };
    responderIds?: unknown;
    nextResponderIndex?: unknown;
  } | undefined;
  if (pendingCombat !== undefined) {
    const snapshot = pendingCombat?.snapshot;
    const responders = pendingCombat?.responderIds;
    const index = pendingCombat?.nextResponderIndex;
    if (state.phase !== "combat" || state.step !== "post-power-response") violations.push("COMBAT_RESPONSE_STEP_INVALID");
    if (!snapshot || !["mountain", "city"].includes(String(snapshot.locationId)) || snapshot.round !== state.round) {
      violations.push("COMBAT_SNAPSHOT_INVALID");
    }
    const participantIds = Array.isArray(snapshot?.participantIds) ? snapshot.participantIds : [];
    if (participantIds.length === 0 || participantIds.some((id) => typeof id !== "string" || !state.players[id])) {
      violations.push("COMBAT_SNAPSHOT_PARTICIPANTS_INVALID");
    }
    if (!snapshot?.powers || typeof snapshot.powers !== "object" || participantIds.some((id) => !Number.isFinite(Number((snapshot.powers as Record<string, unknown>)[id])))) {
      violations.push("COMBAT_SNAPSHOT_POWERS_INVALID");
    }
    if (!Array.isArray(responders) || responders.length === 0 || responders.some((id) => typeof id !== "string" || !participantIds.includes(id))) {
      violations.push("COMBAT_RESPONDERS_INVALID");
    }
    if (!Number.isInteger(index) || Number(index) < 0 || Number(index) >= (Array.isArray(responders) ? responders.length : 0)) {
      violations.push("COMBAT_RESPONDER_INDEX_INVALID");
    } else if (state.activePlayerId !== (responders as string[])[Number(index)]) {
      violations.push("COMBAT_ACTIVE_RESPONDER_INVALID");
    }
  } else if (state.step === "post-power-response") {
    violations.push("COMBAT_RESPONSE_STATE_MISSING");
  }
  if (state.pendingDecision) {
    const decision = state.pendingDecision;
    if (!decision.decisionId || !decision.kind) violations.push("DECISION_ID_OR_KIND_MISSING");
    if (!state.players[decision.ownerPlayerId]) violations.push(`DECISION_OWNER_MISSING:${decision.ownerPlayerId}`);
    if (!Array.isArray(decision.chooserPlayerIds) || decision.chooserPlayerIds.length === 0 || decision.chooserPlayerIds.some((id) => !state.players[id])) {
      violations.push("DECISION_CHOOSER_INVALID");
    }
    if (!Array.isArray(decision.options) || new Set(decision.options.map((option) => option?.id)).size !== decision.options.length) {
      violations.push("DECISION_OPTIONS_INVALID");
    }
    if (!Number.isInteger(decision.min) || !Number.isInteger(decision.max) || decision.min < 0 || decision.max < decision.min || decision.max > (decision.options?.length ?? 0)) {
      violations.push("DECISION_RANGE_INVALID");
    }
    if (!decision.submissions || typeof decision.submissions !== "object" || Object.keys(decision.submissions).some((id) => !decision.chooserPlayerIds.includes(id))) {
      violations.push("DECISION_SUBMISSIONS_INVALID");
    }
  }
  const effectIds = new Set<string>();
  for (const effect of state.effectQueue) {
    if (!effect || typeof effect.effectId !== "string" || !effect.effectId) violations.push("EFFECT_FRAME_INVALID");
    else if (effectIds.has(effect.effectId)) violations.push(`EFFECT_ID_DUPLICATE:${effect.effectId}`);
    else effectIds.add(effect.effectId);
    if (!effect || typeof effect.handlerId !== "string" || !effect.handlerId) violations.push("EFFECT_HANDLER_MISSING");
  }
  if (state.mode === "three-x") {
    try { assertThreeXStateInvariants(state.modeState.threeX as import("../../rules-core/three-x-state.ts").ThreeXModeState); }
    catch (error) { violations.push(`THREE_X_STATE:${error instanceof Error ? error.message : "INVALID"}`); }
  }
  const seen = new Set<string>();
  for (const player of Object.values(state.players)) {
    const modifierIds = new Set<string>();
    for (const modifier of player.cardRuleModifiers ?? []) {
      if (!modifier || typeof modifier.id !== "string" || !modifier.id || modifierIds.has(modifier.id)) violations.push(`CARD_RULE_MODIFIER_ID_INVALID:${player.id}`);
      else modifierIds.add(modifier.id);
      if (typeof modifier.sourceId !== "string" || !modifier.sourceId || !Array.isArray(modifier.targetDefinitionIds) || modifier.targetDefinitionIds.length === 0 || modifier.targetDefinitionIds.some((id) => typeof id !== "string" || !id)) violations.push(`CARD_RULE_MODIFIER_TARGET_INVALID:${player.id}:${modifier.id}`);
      if (modifier.targetInstanceIds !== undefined && (!Array.isArray(modifier.targetInstanceIds) || modifier.targetInstanceIds.length === 0 || modifier.targetInstanceIds.some((id) => typeof id !== "string" || !state.cards[id]))) violations.push(`CARD_RULE_MODIFIER_INSTANCE_TARGET_INVALID:${player.id}:${modifier.id}`);
      if (!["round", "game", "while-source-active"].includes(modifier.duration)) violations.push(`CARD_RULE_MODIFIER_DURATION_INVALID:${player.id}:${modifier.id}`);
      if (modifier.costOverride !== undefined && (!Number.isFinite(modifier.costOverride) || modifier.costOverride < 0)) violations.push(`CARD_RULE_MODIFIER_COST_INVALID:${player.id}:${modifier.id}`);
      if (modifier.costAdd !== undefined && (!Number.isFinite(modifier.costAdd) || !Number.isInteger(modifier.costAdd))) violations.push(`CARD_RULE_MODIFIER_COST_INVALID:${player.id}:${modifier.id}`);
      if (modifier.duration === "while-source-active" && (!modifier.sourceInstanceId || !state.cards[modifier.sourceInstanceId])) violations.push(`CARD_RULE_MODIFIER_SOURCE_INVALID:${player.id}:${modifier.id}`);
    }
    if (player.form !== null && (typeof player.form !== "string" || player.form.length === 0)) {
      violations.push(`PLAYER_FORM_INVALID:${player.id}`);
    }
    for (const { key, zone } of playerZones) {
      for (const instanceId of player[key]) {
        if (seen.has(instanceId)) violations.push(`CARD_DUPLICATE:${instanceId}`);
        seen.add(instanceId);
        const card = state.cards[instanceId];
        if (!card) {
          violations.push(`CARD_MISSING:${instanceId}`);
          continue;
        }
        if (card.ownerPlayerId !== player.id) violations.push(`CARD_OWNER:${instanceId}`);
        if (card.zone !== zone) violations.push(`CARD_ZONE:${instanceId}:${zone}`);
      }
    }
  }

  for (const card of Object.values(state.cards)) {
    if (card.zone === "attached") {
      const host = card.attachedToInstanceId ? state.cards[card.attachedToInstanceId] : undefined;
      if (!host || host.instanceId === card.instanceId || host.zone === "removed") {
        violations.push(`CARD_ATTACHMENT_HOST_INVALID:${card.instanceId}`);
      }
      const visited = new Set<string>([card.instanceId]);
      let current = host;
      while (current?.zone === "attached") {
        if (visited.has(current.instanceId)) {
          violations.push(`CARD_ATTACHMENT_CYCLE:${card.instanceId}`);
          break;
        }
        visited.add(current.instanceId);
        current = current.attachedToInstanceId ? state.cards[current.attachedToInstanceId] : undefined;
      }
    } else if (card.attachedToInstanceId !== undefined) {
      violations.push(`CARD_ATTACHMENT_ZONE_INVALID:${card.instanceId}`);
    }
    if (card.createdByEffectId !== undefined && (typeof card.createdByEffectId !== "string" || !card.createdByEffectId)) {
      violations.push(`CARD_SOURCE_EFFECT_INVALID:${card.instanceId}`);
    }
    if (card.zone === "board") {
      if (typeof card.boardLocationId !== "string" || !state.board.locations[card.boardLocationId]) violations.push(`CARD_BOARD_LOCATION_INVALID:${card.instanceId}`);
    } else if (card.boardLocationId !== undefined) {
      violations.push(`CARD_BOARD_LOCATION_ZONE_INVALID:${card.instanceId}`);
    }
    if (card.temporaryCleanup !== undefined && !["round-end", "explicit"].includes(card.temporaryCleanup)) violations.push(`CARD_TEMPORARY_CLEANUP_INVALID:${card.instanceId}`);
    if (card.temporaryCleanup !== undefined && card.temporary !== true) violations.push(`CARD_TEMPORARY_CLEANUP_WITHOUT_TEMPORARY:${card.instanceId}`);
    if (card.usedRound !== undefined && (!Number.isInteger(card.usedRound) || card.usedRound < 0)) {
      violations.push(`CARD_USAGE_ROUND_INVALID:${card.instanceId}`);
    }
    if (card.playedRound !== undefined && (!Number.isInteger(card.playedRound) || card.playedRound < 0)) {
      violations.push(`CARD_PLAYED_ROUND_INVALID:${card.instanceId}`);
    }
    if (card.boardPlacedRound !== undefined && (!Number.isInteger(card.boardPlacedRound) || card.boardPlacedRound < 0)) {
      violations.push(`CARD_BOARD_PLACED_ROUND_INVALID:${card.instanceId}`);
    }
    if (card.playedLocationId !== undefined && card.playedLocationId !== null
      && !["workshop", "mountain", "city", "scouting"].includes(card.playedLocationId)) {
      violations.push(`CARD_PLAYED_LOCATION_INVALID:${card.instanceId}`);
    }
    if (card.attributeOverrides !== undefined && (!Array.isArray(card.attributeOverrides)
      || new Set(card.attributeOverrides).size !== card.attributeOverrides.length
      || card.attributeOverrides.some((attribute) => !["力量", "迅捷", "魔术", "特殊", "宝具"].includes(attribute)))) {
      violations.push(`CARD_ATTRIBUTE_OVERRIDE_INVALID:${card.instanceId}`);
    }
    if (card.reversed !== undefined && typeof card.reversed !== "boolean") violations.push(`CARD_REVERSED_INVALID:${card.instanceId}`);
    if (card.usedPhase !== undefined && !["preparation", "outpost", "action", "combat"].includes(card.usedPhase)) {
      violations.push(`CARD_USAGE_PHASE_INVALID:${card.instanceId}`);
    }
    if (card.usedPhase !== undefined && card.usedRound === undefined) {
      violations.push(`CARD_USAGE_PHASE_WITHOUT_ROUND:${card.instanceId}`);
    }
    if (card.usedCount !== undefined && (!Number.isInteger(card.usedCount) || card.usedCount < 1)) {
      violations.push(`CARD_USAGE_COUNT_INVALID:${card.instanceId}`);
    }
    if (card.usedCount !== undefined && card.usedRound === undefined) {
      violations.push(`CARD_USAGE_COUNT_WITHOUT_ROUND:${card.instanceId}`);
    }
    if (card.usedGameCount !== undefined && (!Number.isInteger(card.usedGameCount) || card.usedGameCount < 1)) {
      violations.push(`CARD_GAME_USAGE_COUNT_INVALID:${card.instanceId}`);
    }
    if (card.ownerPlayerId && !state.players[card.ownerPlayerId]) violations.push(`CARD_OWNER_MISSING:${card.instanceId}`);
    if (card.controllerPlayerId && !state.players[card.controllerPlayerId]) violations.push(`CARD_CONTROLLER_MISSING:${card.instanceId}`);
    if (card.zone !== "attached" && card.zone !== "board" && card.zone !== "removed" && card.zone !== "event-deck" && card.zone !== "event-discard" && card.zone !== "situation-deck" && card.zone !== "situation-discard" && !seen.has(card.instanceId)) {
      violations.push(`CARD_UNREFERENCED:${card.instanceId}:${card.zone}`);
    }
  }

  for (const [locationId, playerIds] of Object.entries(state.board.locations)) {
    for (const playerId of playerIds) {
      const player = state.players[playerId];
      if (!player) violations.push(`LOCATION_PLAYER_MISSING:${locationId}:${playerId}`);
      else if (player.locationId !== locationId) violations.push(`LOCATION_MISMATCH:${playerId}:${locationId}`);
    }
  }
  for (const player of Object.values(state.players)) {
    if (player.locationId && !state.board.locations[player.locationId]?.includes(player.id)) {
      violations.push(`PLAYER_LOCATION_MISSING:${player.id}:${player.locationId}`);
    }
  }
  const eventZones = new Set<string>();
  for (const eventId of state.board.eventDeck) {
    if (typeof eventId !== "string" || !eventId) violations.push("EVENT_DECK_ENTRY_INVALID");
    else if (eventZones.has(eventId)) violations.push(`EVENT_ZONE_DUPLICATE:${eventId}`);
    else eventZones.add(eventId);
  }
  for (const [poolId, pool] of Object.entries(state.board.namedEventPools ?? {})) {
    if (!poolId || !pool || !Array.isArray(pool.allIds) || !Array.isArray(pool.deck) || !Array.isArray(pool.discard)) {
      violations.push(`NAMED_EVENT_POOL_INVALID:${poolId}`);
      continue;
    }
    const allIds = new Set<string>();
    for (const eventId of pool.allIds) {
      if (typeof eventId !== "string" || !eventId || allIds.has(eventId)) violations.push(`NAMED_EVENT_POOL_ID_INVALID:${poolId}:${String(eventId)}`);
      else allIds.add(eventId);
    }
    for (const [zone, eventIds] of [["deck", pool.deck], ["discard", pool.discard]] as const) {
      for (const eventId of eventIds) {
        if (!allIds.has(eventId)) violations.push(`NAMED_EVENT_POOL_MEMBER_INVALID:${poolId}:${eventId}`);
        if (eventZones.has(eventId)) violations.push(`EVENT_ZONE_DUPLICATE:${eventId}`);
        else eventZones.add(eventId);
      }
    }
  }
  for (const [locationId, override] of Object.entries(state.board.eventPoolOverrides ?? {})) {
    if ((locationId !== "mountain" && locationId !== "city") || !override?.poolId || !state.board.namedEventPools?.[override.poolId]
      || typeof override.sourceId !== "string" || !override.sourceId
      || (override.controllerPlayerId !== undefined && !state.players[override.controllerPlayerId])) {
      violations.push(`EVENT_POOL_OVERRIDE_INVALID:${locationId}`);
    }
  }
  const activeRuleModifierIds = new Set<string>();
  for (const modifier of state.activeRuleModifiers ?? []) {
    if (!modifier || typeof modifier.id !== "string" || !modifier.id || activeRuleModifierIds.has(modifier.id)) {
      violations.push("ACTIVE_RULE_MODIFIER_ID_INVALID");
      continue;
    }
    activeRuleModifierIds.add(modifier.id);
    if (typeof modifier.sourceId !== "string" || !modifier.sourceId
      || !state.players[modifier.controllerPlayerId]
      || !["allow", "forbid", "replace", "add", "subtract", "set", "ignore"].includes(modifier.operation)
      || typeof modifier.rule !== "string" || !modifier.rule
      || !["round", "game", "while-source-active"].includes(modifier.duration)
      || !Number.isInteger(modifier.createdRound) || modifier.createdRound < 0) {
      violations.push(`ACTIVE_RULE_MODIFIER_INVALID:${modifier.id}`);
    }
    if (modifier.sourceInstanceId !== undefined && !state.cards[modifier.sourceInstanceId]) {
      violations.push(`ACTIVE_RULE_MODIFIER_SOURCE_INVALID:${modifier.id}`);
    }
  }

  const scheduleIds = new Set<string>();
  for (const schedule of state.scheduledEffects ?? []) {
    if (!schedule || typeof schedule.scheduleId !== "string" || !schedule.scheduleId || scheduleIds.has(schedule.scheduleId)) {
      violations.push("SCHEDULE_ID_INVALID");
      continue;
    }
    scheduleIds.add(schedule.scheduleId);
    if (typeof schedule.sourceId !== "string" || !schedule.sourceId
      || typeof schedule.handlerId !== "string" || !schedule.handlerId
      || typeof schedule.triggerEventType !== "string" || !schedule.triggerEventType
      || !state.players[schedule.controllerPlayerId]
      || typeof schedule.once !== "boolean") {
      violations.push(`SCHEDULE_INVALID:${schedule.scheduleId}`);
    }
    if (schedule.triggerRound !== undefined && (!Number.isInteger(schedule.triggerRound) || schedule.triggerRound < 0)) {
      violations.push(`SCHEDULE_TRIGGER_ROUND_INVALID:${schedule.scheduleId}`);
    }
    if (schedule.expiresAfterRound !== undefined && (!Number.isInteger(schedule.expiresAfterRound) || schedule.expiresAfterRound < 0)) {
      violations.push(`SCHEDULE_EXPIRY_INVALID:${schedule.scheduleId}`);
    }
    if (schedule.triggerRound !== undefined && schedule.expiresAfterRound !== undefined && schedule.expiresAfterRound < schedule.triggerRound) {
      violations.push(`SCHEDULE_RANGE_INVALID:${schedule.scheduleId}`);
    }
  }
  for (const eventId of state.board.eventDiscard) {
    if (typeof eventId !== "string" || !eventId) violations.push("EVENT_DISCARD_ENTRY_INVALID");
    else if (eventZones.has(eventId)) violations.push(`EVENT_ZONE_DUPLICATE:${eventId}`);
    else eventZones.add(eventId);
  }
  for (const eventId of state.board.eventRemoved ?? []) {
    if (typeof eventId !== "string" || !eventId) violations.push("EVENT_REMOVED_ENTRY_INVALID");
    else if (eventZones.has(eventId)) violations.push(`EVENT_ZONE_DUPLICATE:${eventId}`);
    else eventZones.add(eventId);
  }
  const activeEventIds = new Set<string>();
  for (const [locationId, eventIds] of Object.entries(state.board.currentEvents)) {
    if (locationId !== "mountain" && locationId !== "city") {
      violations.push(`EVENT_LOCATION_INVALID:${locationId}`);
      continue;
    }
    for (const eventId of eventIds) {
      if (activeEventIds.has(eventId)) violations.push(`EVENT_DUPLICATE:${eventId}`);
      activeEventIds.add(eventId);
      if (eventZones.has(eventId)) violations.push(`EVENT_ZONE_DUPLICATE:${eventId}`);
      else eventZones.add(eventId);
      const visibility = state.board.eventVisibility[eventId];
      if (visibility !== "up" && visibility !== "down") violations.push(`EVENT_VISIBILITY_MISSING:${eventId}`);
    }
  }
  for (const eventId of Object.keys(state.board.eventVisibility)) {
    if (!activeEventIds.has(eventId)) violations.push(`EVENT_VISIBILITY_ORPHAN:${eventId}`);
  }
  for (const [eventId, bonus] of Object.entries(state.board.eventVictoryPointBonuses ?? {})) {
    if (!activeEventIds.has(eventId)) violations.push(`EVENT_VP_BONUS_ORPHAN:${eventId}`);
    if (!Number.isInteger(bonus)) violations.push(`EVENT_VP_BONUS_INVALID:${eventId}`);
  }
  for (const [eventId, override] of Object.entries(state.board.eventVictoryPointOverrides ?? {})) {
    if (!activeEventIds.has(eventId)) violations.push(`EVENT_VP_OVERRIDE_ORPHAN:${eventId}`);
    if (!override || !Number.isInteger(override.value) || override.value < 0 || !override.sourceId) violations.push(`EVENT_VP_OVERRIDE_INVALID:${eventId}`);
    if (override?.maxValue !== undefined && (!Number.isInteger(override.maxValue) || override.maxValue < 0)) violations.push(`EVENT_VP_OVERRIDE_INVALID:${eventId}`);
    if (override?.round !== undefined && (!Number.isInteger(override.round) || override.round < 0)) violations.push(`EVENT_VP_OVERRIDE_INVALID:${eventId}`);
  }
  return violations;
}

export function assertStateInvariants(state: GameState): void {
  const violations = findStateInvariantViolations(state);
  if (violations.length > 0) throw new Error(`STATE_INVARIANT_VIOLATION:${violations.join(",")}`);
}
