import type { GameState } from "../domain/state/types.ts";
import { spendNormalCommandSeal } from "./command-seals.ts";
import { gainVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const BRYNHILDR_BRIDESMAID_ID = "servant.brynhildr.skill.sc-brynhildr-2";
export const BRYNHILDR_ROMANTIA_ID = "servant.brynhildr.skill.sc-brynhildr-3";
export const BRYNHILDR_BRIDESMAID_HANDLER = "core.brynhildr-hero-bridesmaid";
export const BRYNHILDR_BRIDESMAID_RESOLVE = "core.brynhildr-hero-bridesmaid-resolve";
export const BRYNHILDR_BELOVED_FLAG = "brynhildrBelovedPlayerId";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function livingBelovedCandidates(state: GameState, playerId: string): string[] {
  return state.turnOrder.filter((candidateId) => candidateId !== playerId && Boolean(state.players[candidateId]) && !state.players[candidateId].eliminated);
}

function resolveCombatEndingReward(state: GameState, playerId: string, payload: unknown): void {
  const player = state.players[playerId];
  if (!player) return;
  const belovedPlayerId = typeof player.flags[BRYNHILDR_BELOVED_FLAG] === "string"
    ? String(player.flags[BRYNHILDR_BELOVED_FLAG])
    : undefined;
  if (!belovedPlayerId || !state.players[belovedPlayerId]) return;
  const wrapped = isRecord(payload) ? payload : {};
  const event = isRecord(wrapped.event) ? wrapped.event : {};
  const previousLocations = isRecord(event.previousLocations) ? event.previousLocations : {};
  const winnersByLocation = isRecord(event.combatWinnerIdsByLocation) ? event.combatWinnerIdsByLocation : {};
  const belovedLocation = previousLocations[belovedPlayerId];
  if ((belovedLocation !== "mountain" && belovedLocation !== "city")
    || !Array.isArray(winnersByLocation[belovedLocation])
    || !winnersByLocation[belovedLocation].includes(belovedPlayerId)) return;

  const ownLocation = previousLocations[playerId];
  const ownWon = (ownLocation === "mountain" || ownLocation === "city")
    && Array.isArray(winnersByLocation[ownLocation])
    && winnersByLocation[ownLocation].includes(playerId);
  gainVictoryPoints(player, ownWon ? 3 : 1);
}

/** Hero's Bridesmaid: choose a beloved; replacing an existing beloved costs one Command Seal. */
export const useBrynhildrHeroBridesmaid: SkillHandler = ({ state, player, skill, payload, openDecision }) => {
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "combat.ending") {
    resolveCombatEndingReward(state, player.id, payload);
    return;
  }
  if (state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("BRYNHILDR_BRIDESMAID_WINDOW_INVALID");
  const candidates = livingBelovedCandidates(state, player.id);
  if (candidates.length === 0) throw new Error("BRYNHILDR_BRIDESMAID_NO_TARGET");
  const requiresSeal = typeof player.flags[BRYNHILDR_BELOVED_FLAG] === "string";
  if (requiresSeal && player.commandSeals <= 0) throw new Error("BRYNHILDR_BRIDESMAID_COMMAND_SEAL_REQUIRED");

  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:beloved`;
  state.effectQueue.unshift({
    effectId,
    handlerId: BRYNHILDR_BRIDESMAID_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { candidates, requiresSeal },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "brynhildr-beloved",
    options: candidates.map((candidateId) => ({ id: candidateId, label: state.players[candidateId].name })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
};

export const resolveBrynhildrHeroBridesmaid: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("BRYNHILDR_BRIDESMAID_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("BRYNHILDR_BRIDESMAID_DECISION_INVALID");
  const targetPlayerId = selections[0];
  const target = state.players[targetPlayerId];
  if (!target || target.eliminated || targetPlayerId === player.id) throw new Error("BRYNHILDR_BRIDESMAID_TARGET_INVALID");
  if (previous.requiresSeal === true) spendNormalCommandSeal(state, player.id);
  player.flags[BRYNHILDR_BELOVED_FLAG] = targetPlayerId;
  return { belovedPlayerId: targetPlayerId, commandSealSpent: previous.requiresSeal === true };
};

export const isBrynhildrHeroBridesmaidLegal: SkillLegalityPredicate = (state, playerId) => {
  const player = state.players[playerId];
  if (!player || state.phase !== "outpost" || state.activePlayerId !== playerId || livingBelovedCandidates(state, playerId).length === 0) return false;
  return typeof player.flags[BRYNHILDR_BELOVED_FLAG] !== "string" || player.commandSeals > 0;
};
