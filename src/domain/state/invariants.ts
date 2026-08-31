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
    if (player.form !== null && player.form !== "jekyll" && player.form !== "hyde") {
      violations.push(`PLAYER_FORM_INVALID:${player.id}`);
    }
    if (player.form !== null && player.servantId !== "servant.jekyll") {
      violations.push(`PLAYER_FORM_OWNER_INVALID:${player.id}`);
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
    if (card.createdByEffectId !== undefined && (typeof card.createdByEffectId !== "string" || !card.createdByEffectId)) {
      violations.push(`CARD_SOURCE_EFFECT_INVALID:${card.instanceId}`);
    }
    if (card.usedRound !== undefined && (!Number.isInteger(card.usedRound) || card.usedRound < 0)) {
      violations.push(`CARD_USAGE_ROUND_INVALID:${card.instanceId}`);
    }
    if (card.playedRound !== undefined && (!Number.isInteger(card.playedRound) || card.playedRound < 0)) {
      violations.push(`CARD_PLAYED_ROUND_INVALID:${card.instanceId}`);
    }
    if (card.usedPhase !== undefined && !["preparation", "outpost", "action", "combat"].includes(card.usedPhase)) {
      violations.push(`CARD_USAGE_PHASE_INVALID:${card.instanceId}`);
    }
    if (card.usedPhase !== undefined && card.usedRound === undefined) {
      violations.push(`CARD_USAGE_PHASE_WITHOUT_ROUND:${card.instanceId}`);
    }
    if (card.ownerPlayerId && !state.players[card.ownerPlayerId]) violations.push(`CARD_OWNER_MISSING:${card.instanceId}`);
    if (card.controllerPlayerId && !state.players[card.controllerPlayerId]) violations.push(`CARD_CONTROLLER_MISSING:${card.instanceId}`);
    if (card.zone !== "board" && card.zone !== "removed" && card.zone !== "event-deck" && card.zone !== "event-discard" && card.zone !== "situation-deck" && card.zone !== "situation-discard" && !seen.has(card.instanceId)) {
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
  const activeEventIds = new Set<string>();
  for (const [locationId, eventIds] of Object.entries(state.board.currentEvents)) {
    if (locationId !== "mountain" && locationId !== "city") {
      violations.push(`EVENT_LOCATION_INVALID:${locationId}`);
      continue;
    }
    for (const eventId of eventIds) {
      if (activeEventIds.has(eventId)) violations.push(`EVENT_DUPLICATE:${eventId}`);
      activeEventIds.add(eventId);
      const visibility = state.board.eventVisibility[eventId];
      if (visibility !== "up" && visibility !== "down") violations.push(`EVENT_VISIBILITY_MISSING:${eventId}`);
    }
  }
  for (const eventId of Object.keys(state.board.eventVisibility)) {
    if (!activeEventIds.has(eventId)) violations.push(`EVENT_VISIBILITY_ORPHAN:${eventId}`);
  }
  return violations;
}

export function assertStateInvariants(state: GameState): void {
  const violations = findStateInvariantViolations(state);
  if (violations.length > 0) throw new Error(`STATE_INVARIANT_VIOLATION:${violations.join(",")}`);
}
