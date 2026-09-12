import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import {
  grantRulerSeal,
  listRulerSealsOnPlayer,
  listRulerSealUses,
  transferRulerSealsToPlayer,
} from "./ruler-seals.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const AMOR_RULER_ID = "servant.amor.skill.sc-amor-1";
export const AMOR_GOLDEN_ARROW_ID = "servant.amor.skill.sc-amor-2";
export const AMOR_CALLING_AGAPE_ID = "servant.amor.skill.sc-amor-3";
export const AMOR_GOLDEN_ARROW_HANDLER = "core.amor-golden-arrow";
export const AMOR_GOLDEN_ARROW_RESOLVE = "core.amor-golden-arrow-resolve";
export const AMOR_CALLING_AGAPE_HANDLER = "core.amor-calling-agape";
export const AMOR_CALLING_AGAPE_RESOLVE = "core.amor-calling-agape-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function physicalOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return card.ownerPlayerId === player.id && (card.definitionId === skillId || definition?.linkedSkillId === skillId);
  });
}

function activeOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  const card = physicalOwnedSkill(state, player, skillId, definitions);
  return card?.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up" ? card : undefined;
}

function openSingleDecision(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  handlerId: string,
  kind: string,
  options: Array<{ id: string; label: string }>,
  payload: Record<string, unknown>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${kind}`;
  state.effectQueue.unshift({
    effectId,
    handlerId,
    sourceId,
    controllerPlayerId: player.id,
    payload,
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function combatParticipantIds(event: Record<string, unknown>): string[] {
  if (Array.isArray(event.participantIds)) return event.participantIds.filter((id): id is string => typeof id === "string");
  if (isRecord(event.powers)) return Object.keys(event.powers);
  return [];
}

function eligibleGoldenArrowWinnerIds(state: GameState, player: PlayerState, event: Record<string, unknown>): string[] {
  const participantIds = combatParticipantIds(event);
  if (!participantIds.includes(player.id)) return [];
  const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  const usedTargets = new Set(listRulerSealUses(state, player.id, state.round).map((use) => use.boundPlayerId));
  return winners.filter((id) => id !== player.id && participantIds.includes(id) && usedTargets.has(id) && !state.players[id]?.eliminated);
}

export const useAmorGoldenArrow: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("AMOR_GOLDEN_ARROW_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType !== "combat.resolved") return;
  if (!activeOwnedSkill(state, player, skill.id, definitions)) return;
  const event = isRecord(data.event) ? data.event : {};
  const eligible = eligibleGoldenArrowWinnerIds(state, player, event);
  if (eligible.length === 0) return;
  if (eligible.length === 1) {
    const seal = grantRulerSeal(state, player.id, eligible[0], skill.id);
    return { boundPlayerId: eligible[0], sealId: seal.sealId };
  }
  openSingleDecision(
    state,
    player,
    skill.id,
    AMOR_GOLDEN_ARROW_RESOLVE,
    "amor-golden-arrow-rebind",
    eligible.map((id) => ({ id, label: state.players[id]?.name ?? id })),
    { eligiblePlayerIds: eligible },
    openDecision,
  );
  return { pending: true, eligiblePlayerIds: eligible };
};

export const resolveAmorGoldenArrow: SkillHandler = ({ state, player, skill, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("AMOR_GOLDEN_ARROW_DECISION_INVALID");
  const eligible = Array.isArray(payload.previous.eligiblePlayerIds)
    ? payload.previous.eligiblePlayerIds.filter((id): id is string => typeof id === "string")
    : [];
  const selections = Array.isArray(payload.decision.selections)
    ? payload.decision.selections.filter((id): id is string => typeof id === "string")
    : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !eligible.includes(selections[0])
    || state.players[selections[0]]?.eliminated) throw new Error("AMOR_GOLDEN_ARROW_DECISION_INVALID");
  const seal = grantRulerSeal(state, player.id, selections[0], skill.id);
  return { boundPlayerId: selections[0], sealId: seal.sealId };
};

function livingAmorOpponentIds(state: GameState, player: PlayerState): string[] {
  return state.turnOrder.filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated);
}

function processAgapeTransfers(
  state: GameState,
  player: PlayerState,
  skillId: string,
  eliminatedPlayerIds: string[],
  openDecision: SkillContext["openDecision"],
): { transferred: Array<{ fromPlayerId: string; toPlayerId: string; sealIds: string[] }>; pending: boolean } {
  const transferred: Array<{ fromPlayerId: string; toPlayerId: string; sealIds: string[] }> = [];
  const remaining = [...eliminatedPlayerIds];
  while (remaining.length > 0) {
    const eliminatedPlayerId = remaining.shift()!;
    const sealIds = listRulerSealsOnPlayer(state, eliminatedPlayerId).map((seal) => seal.sealId);
    if (sealIds.length === 0) continue;
    const candidateIds = livingAmorOpponentIds(state, player);
    if (candidateIds.length === 0) continue;
    if (candidateIds.length === 1) {
      transferRulerSealsToPlayer(state, sealIds, candidateIds[0]);
      transferred.push({ fromPlayerId: eliminatedPlayerId, toPlayerId: candidateIds[0], sealIds });
      continue;
    }
    openSingleDecision(
      state,
      player,
      skillId,
      AMOR_CALLING_AGAPE_RESOLVE,
      "amor-agape-transfer",
      candidateIds.map((id) => ({ id, label: state.players[id]?.name ?? id })),
      { eliminatedPlayerId, remainingEliminatedPlayerIds: remaining, sealIds, candidateIds },
      openDecision,
    );
    return { transferred, pending: true };
  }
  return { transferred, pending: false };
}

export const useAmorCallingAgape: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("AMOR_AGAPE_DEFINITIONS_REQUIRED");
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) return;
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "elimination.resolved") {
    const event = isRecord(data.event) ? data.event : {};
    const eliminated = Array.isArray(event.eliminatedPlayerIds)
      ? event.eliminatedPlayerIds.filter((id): id is string => typeof id === "string" && id !== player.id)
      : [];
    if (eliminated.length === 0) return;
    return processAgapeTransfers(state, player, skill.id, eliminated, openDecision);
  }
  if (data.abilityId !== "absolute-surrender" || state.phase !== "combat") throw new Error("AMOR_AGAPE_ABILITY_INVALID");
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("AMOR_AGAPE_BATTLEFIELD_REQUIRED");
  const targetPlayerIds = (state.board.locations[locationId] ?? []).filter((id) => {
    const target = state.players[id];
    return Boolean(target && !target.eliminated && listRulerSealsOnPlayer(state, id).length >= 3);
  });
  const modifierId = `${skill.id}:absolute-surrender:${source.instanceId}:${state.round}`;
  state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => modifier.id !== modifierId);
  if (targetPlayerIds.length > 0) {
    state.activeRuleModifiers.push({
      id: modifierId,
      sourceId: skill.id,
      sourceInstanceId: source.instanceId,
      controllerPlayerId: player.id,
      operation: "set",
      rule: "combat_power",
      scope: { subject: "players_at_source_battlefield", playerIds: targetPlayerIds },
      value: 0,
      duration: "round",
      createdRound: state.round,
    });
  }
  return { targetPlayerIds };
};

export const resolveAmorCallingAgape: SkillHandler = ({ state, player, skill, payload, openDecision }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("AMOR_AGAPE_DECISION_INVALID");
  const previous = payload.previous;
  const candidateIds = Array.isArray(previous.candidateIds)
    ? previous.candidateIds.filter((id): id is string => typeof id === "string")
    : [];
  const selections = Array.isArray(payload.decision.selections)
    ? payload.decision.selections.filter((id): id is string => typeof id === "string")
    : [];
  const eliminatedPlayerId = typeof previous.eliminatedPlayerId === "string" ? previous.eliminatedPlayerId : undefined;
  const sealIds = Array.isArray(previous.sealIds) ? previous.sealIds.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || !eliminatedPlayerId || selections.length !== 1
    || !candidateIds.includes(selections[0]) || state.players[selections[0]]?.eliminated) throw new Error("AMOR_AGAPE_DECISION_INVALID");
  const currentSealIds = new Set(listRulerSealsOnPlayer(state, eliminatedPlayerId).map((seal) => seal.sealId));
  if (sealIds.some((id) => !currentSealIds.has(id))) throw new Error("AMOR_AGAPE_SEALS_STALE");
  transferRulerSealsToPlayer(state, sealIds, selections[0]);
  const remaining = Array.isArray(previous.remainingEliminatedPlayerIds)
    ? previous.remainingEliminatedPlayerIds.filter((id): id is string => typeof id === "string")
    : [];
  const continued = processAgapeTransfers(state, player, skill.id, remaining, openDecision);
  return { fromPlayerId: eliminatedPlayerId, toPlayerId: selections[0], sealIds, ...continued };
};

export const isAmorCallingAgapeLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== "absolute-surrender" || state.phase !== "combat") return false;
  if (!activeOwnedSkill(state, player, skill.id, definitions)) return false;
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return false;
  return (state.board.locations[locationId] ?? []).some((id) => !state.players[id]?.eliminated && listRulerSealsOnPlayer(state, id).length >= 3);
};
