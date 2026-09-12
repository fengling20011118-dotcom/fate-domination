import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { movePlayerOneSpaceByEffect } from "./board.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import type { CardDefinition } from "./content-types.ts";
import { drawCards } from "./decks.ts";
import { hasClimaxEliminationPrevention, installClimaxEliminationPrevention } from "./elimination-prevention.ts";
import { isForcedExtraRoundActive, peekForcedExtraRound, queueForcedExtraRound } from "./extra-round.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler } from "./skill-types.ts";

export const LAKSHMI_RESISTANCE_ID = "servant.lakshmibai.skill.sc-lakshmibai-1";
export const LAKSHMI_NAHI_ID = "servant.lakshmibai.skill.sc-lakshmibai-2";
export const LAKSHMI_MISFORTUNE_SHADOW_ID = "servant.lakshmibai.skill.sc-lakshmibai-4";
export const LAKSHMI_HANDLER = "core.lakshmibai-package";
export const LAKSHMI_RESOLVE = "core.lakshmibai-package-resolve";
export const HEAVENS_FEEL_SITUATION_ID = "situation.sit13";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesSkill(card: GameState["cards"][string] | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || card.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId));
}

function ownedPhysicalSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return [...player.servantSkills, ...player.attack].map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.zone !== "removed" && matchesSkill(card, definition, skillId));
  });
}

function openDecisionFrame(
  context: Parameters<SkillHandler>[0],
  stage: string,
  options: PendingDecision["options"],
  payload: Record<string, unknown> = {},
  chooserPlayerId = context.player.id,
): { pending: true } {
  const { state, player, skill, openDecision } = context;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: LAKSHMI_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: chooserPlayerId,
    chooserPlayerIds: [chooserPlayerId],
    kind: `lakshmi-${stage}`,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true };
}

function resolveQueenOfResistance(state: GameState, player: PlayerState, event: Record<string, unknown>) {
  const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  const participants = Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : [];
  if (!winners.includes(player.id) || !participants.includes(player.id)) return;
  const before = isRecord(event.participantVictoryPointsBeforeCombat) ? event.participantVictoryPointsBeforeCombat : {};
  const playerVpBefore = Number(before[player.id]);
  const beatHigherVpOpponent = Number.isFinite(playerVpBefore) && participants.some((id) => id !== player.id && Number(before[id]) > playerVpBefore);
  if (beatHigherVpOpponent && !hasClimaxEliminationPrevention(state, player.id)) {
    installClimaxEliminationPrevention(state, {
      sourceId: LAKSHMI_RESISTANCE_ID,
      controllerPlayerId: player.id,
      targetPlayerId: player.id,
      round: state.round,
    });
  }

  // Empty situation deck means the normal scheduled final round is resolving.
  // A forced Heaven's Feel round never recursively schedules itself.
  if (state.board.situationDeck.length !== 0 || isForcedExtraRoundActive(state, LAKSHMI_RESISTANCE_ID)) {
    return { eliminationProtected: beatHigherVpOpponent };
  }
  const alive = Object.values(state.players).filter((candidate) => !candidate.eliminated);
  const highestVp = Math.max(...alive.map((candidate) => candidate.victoryPoints));
  if (player.victoryPoints < highestVp) {
    const queued = peekForcedExtraRound(state);
    if (!queued) queueForcedExtraRound(state, LAKSHMI_RESISTANCE_ID, HEAVENS_FEEL_SITUATION_ID);
    else if (queued.situationId !== HEAVENS_FEEL_SITUATION_ID) throw new Error("LAKSHMI_EXTRA_ROUND_CONFLICT");
    return { eliminationProtected: beatHigherVpOpponent, extraRoundQueued: true };
  }
  return { eliminationProtected: beatHigherVpOpponent, extraRoundQueued: false };
}

function nahiPlayCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  const ids = [...player.hand];
  const source = ownedPhysicalSkill(state, player, LAKSHMI_NAHI_ID, definitions);
  if (source?.zone === "servant-skills") ids.push(source.instanceId);
  return ids.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.ownerPlayerId === player.id && (card.zone === "hand" || card.zone === "servant-skills"));
  });
}

function triggerNahi(context: Parameters<SkillHandler>[0], event: Record<string, unknown>) {
  const { state, player, definitions } = context;
  if (!definitions) throw new Error("LAKSHMI_NAHI_DEFINITIONS_REQUIRED");
  const enteredPlayerId = typeof event.playerId === "string" ? event.playerId : undefined;
  if (!enteredPlayerId || enteredPlayerId === player.id || state.players[enteredPlayerId]?.eliminated) return;
  const locationId = player.locationId;
  if ((locationId !== "mountain" && locationId !== "city") || event.locationId !== locationId) return;
  const candidates = nahiPlayCandidates(state, player, definitions);
  if (candidates.length === 0) return;
  return openDecisionFrame(context, "nahi-play", [
    { id: "skip", label: "不发动" },
    ...candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId })),
  ], { enteredPlayerId, candidates });
}

function halvePlayedBasePower(state: GameState, player: PlayerState, instanceId: string, definition: CardDefinition): number {
  const basePower = getPrintedCardBasePower(state, player, definition);
  const halved = Math.ceil(basePower / 2);
  const modifierId = `${LAKSHMI_NAHI_ID}:half-base:${state.round}:${instanceId}`;
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => modifier.id !== modifierId);
  state.activeRuleModifiers.push({
    id: modifierId,
    sourceId: LAKSHMI_NAHI_ID,
    controllerPlayerId: player.id,
    sourceInstanceId: instanceId,
    operation: "set",
    rule: "card_base_power",
    scope: { subject: "controller", cards: { instanceIds: [instanceId] } },
    value: halved,
    duration: "round",
    createdRound: state.round,
  });
  return halved;
}

function legalNahiMoveOptions(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  const options: Array<{ id: string; label: string }> = [];
  for (const targetId of state.board.locations[locationId] ?? []) {
    if (targetId === player.id || state.players[targetId]?.eliminated) continue;
    for (const direction of ["forward", "backward"] as const) {
      try {
        const draft = structuredClone(state);
        const result = movePlayerOneSpaceByEffect(draft, targetId, direction, definitions);
        options.push({ id: `${targetId}::${direction}`, label: `${state.players[targetId].name} → ${result.locationId}` });
      } catch { /* unavailable destination */ }
    }
  }
  return options;
}

function afterNahiPlay(
  context: Parameters<SkillHandler>[0],
  instanceId: string,
  definition: CardDefinition,
) {
  const { state, player, definitions, executeCardAbility } = context;
  if (!definitions) throw new Error("LAKSHMI_NAHI_DEFINITIONS_REQUIRED");
  const source = state.cards[instanceId];
  if (source && matchesSkill(source, definition, LAKSHMI_NAHI_ID)) {
    const moveOptions = legalNahiMoveOptions(state, player, definitions);
    if (moveOptions.length > 0) return openDecisionFrame(context, "nahi-move", moveOptions, { sourceInstanceId: instanceId });
    return { playedInstanceId: instanceId, movedOpponent: false };
  }
  const actionAbilityIds = definition.phases?.includes("action") ? [...(definition.cardAbilityIds ?? [])] : [];
  if (actionAbilityIds.length === 0 || !executeCardAbility) return { playedInstanceId: instanceId };
  if (actionAbilityIds.length === 1) {
    executeCardAbility(instanceId, actionAbilityIds[0], undefined, { timingOverride: true });
    return { playedInstanceId: instanceId, actionAbilityId: actionAbilityIds[0] };
  }
  return openDecisionFrame(context, "nahi-action", actionAbilityIds.map((abilityId) => ({ id: abilityId, label: abilityId })), {
    sourceInstanceId: instanceId,
    actionAbilityIds,
  });
}

function playNahiSelected(context: Parameters<SkillHandler>[0], instanceId: string) {
  const { state, player, definitions, randomInt, emitEvent } = context;
  if (!definitions) throw new Error("LAKSHMI_NAHI_DEFINITIONS_REQUIRED");
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !definition || !nahiPlayCandidates(state, player, definitions).includes(instanceId)) throw new Error("LAKSHMI_NAHI_CARD_INVALID");
  const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, {
    payCost: true,
    allowedSourceZones: ["hand", "servant-skills"],
    bypassTiming: true,
    bypassFaceUpPlayLimit: true,
  });
  const halvedBasePower = halvePlayedBasePower(state, player, instanceId, definition);
  if (definition.revealsTrueNameOnPlay === true) revealPlayerTrueName(state, player.id);
  const drawCount = Number(definition.drawOnPlay ?? 0);
  const drawnInstanceIds = drawCount > 0 && randomInt ? drawCards(state, player.id, drawCount, randomInt, definitions) : [];
  emitEvent?.("card.played", {
    playerId: player.id,
    instanceId,
    definitionId: definition.id,
    face: "up",
    paidMana,
    attributes: getCardInstanceAttributes(card, definition, state, definitions),
    method: "nahi-doongi",
  });
  const continuation = afterNahiPlay(context, instanceId, definition);
  return { playedInstanceId: instanceId, paidMana, halvedBasePower, drawnInstanceIds, continuation };
}

export const resolveLakshmiDecision: SkillHandler = (context) => {
  const { state, player, payload, definitions, executeCardAbility, emitEvent } = context;
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("LAKSHMI_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1 || typeof previous.stage !== "string") throw new Error("LAKSHMI_DECISION_INVALID");

  if (previous.stage === "nahi-play") {
    if (selections[0] === "skip") return { playedInstanceId: null };
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selections[0])) throw new Error("LAKSHMI_NAHI_CARD_INVALID");
    return playNahiSelected(context, selections[0]);
  }
  if (previous.stage === "nahi-action") {
    const sourceInstanceId = typeof previous.sourceInstanceId === "string" ? previous.sourceInstanceId : undefined;
    const actionAbilityIds = Array.isArray(previous.actionAbilityIds) ? previous.actionAbilityIds.filter((id): id is string => typeof id === "string") : [];
    if (!sourceInstanceId || !actionAbilityIds.includes(selections[0]) || !executeCardAbility) throw new Error("LAKSHMI_NAHI_ACTION_INVALID");
    executeCardAbility(sourceInstanceId, selections[0], undefined, { timingOverride: true });
    return { playedInstanceId: sourceInstanceId, actionAbilityId: selections[0] };
  }
  if (previous.stage === "nahi-move") {
    const [targetId, direction] = selections[0].split("::");
    if (!targetId || (direction !== "forward" && direction !== "backward")) throw new Error("LAKSHMI_NAHI_MOVE_INVALID");
    const allowed = legalNahiMoveOptions(state, player, definitions).map((option) => option.id);
    if (!allowed.includes(selections[0])) throw new Error("LAKSHMI_NAHI_MOVE_INVALID");
    const movement = movePlayerOneSpaceByEffect(state, targetId, direction, definitions);
    emitEvent?.("player.moved", { playerId: targetId, ...movement, method: "effect", sourceId: LAKSHMI_NAHI_ID });
    emitEvent?.("player.entered-location", { playerId: targetId, ...movement, method: "effect", sourceId: LAKSHMI_NAHI_ID });
    return { movedOpponentId: targetId, ...movement };
  }
  throw new Error("LAKSHMI_DECISION_STAGE_INVALID");
};

export const useLakshmiPackage: SkillHandler = (context) => {
  const { state, player, skill, payload } = context;
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (skill.id === LAKSHMI_RESISTANCE_ID && eventType === "combat.resolved") return resolveQueenOfResistance(state, player, event);
  if (skill.id === LAKSHMI_NAHI_ID && eventType === "player.entered-location") return triggerNahi(context, event);
};
