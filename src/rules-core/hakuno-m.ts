import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { createDerivedCardInstance, transferSkillToPlayerSkillZone } from "./decks.ts";
import { applyDefeatEffect } from "./defeat.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const HAKUNO_YOMI_ID = "master.hakuno-m.skill.s1";
export const HAKUNO_CHALLENGE_RESULT_ID = "master.hakuno-m.skill.s2";
export const HAKUNO_ANALYSIS_ID = "master.hakuno-m.skill.s3";
export const HAKUNO_DEAD_FACE_ID = "master.hakuno-m.skill.ascension";
export const HAKUNO_HANDLER = "core.hakuno-m-yomi";
export const HAKUNO_RESOLVE = "core.hakuno-m-yomi-resolve";

export const HAKUNO_YOMI_ABILITY = "yomi";
export const HAKUNO_DEAD_FACE_ABILITY = "dead-face-transfer";

const ANALYSIS_EFFECT_PREFIX = `${HAKUNO_ANALYSIS_ID}:token:`;
const RPS = ["rock", "paper", "scissors"] as const;
type RpsChoice = typeof RPS[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function battlefieldOpponentIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated);
}

function analysisTokenIds(state: GameState, playerId: string, hakunoPlayerId?: string): string[] {
  const player = state.players[playerId];
  if (!player) return [];
  return player.masterSkills.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card
      && card.definitionId === HAKUNO_ANALYSIS_ID
      && typeof card.createdByEffectId === "string"
      && card.createdByEffectId.startsWith(ANALYSIS_EFFECT_PREFIX)
      && (hakunoPlayerId === undefined || card.createdByPlayerId === hakunoPlayerId));
  });
}

function nextAnalysisId(state: GameState, targetPlayerId: string): string {
  const prefix = `${targetPlayerId}:hakuno-analysis:`;
  const count = Object.keys(state.cards).filter((id) => id.startsWith(prefix)).length + 1;
  return `${prefix}${count}`;
}

export function grantHakunoAnalysis(
  state: GameState,
  hakunoPlayerId: string,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
): string {
  const hakuno = state.players[hakunoPlayerId];
  const target = state.players[targetPlayerId];
  if (!hakuno || hakuno.eliminated || !target || target.eliminated || targetPlayerId === hakunoPlayerId) throw new Error("HAKUNO_ANALYSIS_TARGET_INVALID");
  if (!definitions[HAKUNO_ANALYSIS_ID]) throw new Error("HAKUNO_ANALYSIS_DEFINITION_MISSING");
  const instanceId = nextAnalysisId(state, targetPlayerId);
  createDerivedCardInstance(state, targetPlayerId, {
    instanceId,
    definitionId: HAKUNO_ANALYSIS_ID,
    zone: "master-skills",
    face: "up",
    active: false,
    residual: false,
    sourceEffectId: `${ANALYSIS_EFFECT_PREFIX}${hakunoPlayerId}`,
    createdByPlayerId: hakunoPlayerId,
  });
  return instanceId;
}

function transferAnalysis(
  state: GameState,
  hakunoPlayerId: string,
  sourcePlayerId: string,
  targetPlayerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): void {
  if (sourcePlayerId === targetPlayerId || sourcePlayerId === hakunoPlayerId && targetPlayerId === hakunoPlayerId) throw new Error("HAKUNO_ANALYSIS_TRANSFER_INVALID");
  const source = state.players[sourcePlayerId];
  const target = state.players[targetPlayerId];
  if (!source || !target || target.eliminated || !analysisTokenIds(state, sourcePlayerId, hakunoPlayerId).includes(instanceId)) {
    throw new Error("HAKUNO_ANALYSIS_TRANSFER_INVALID");
  }
  transferSkillToPlayerSkillZone(state, targetPlayerId, instanceId, definitions);
  const card = state.cards[instanceId];
  card.createdByPlayerId = hakunoPlayerId;
}

function nextLivingOpponentInTurnOrder(state: GameState, hakunoPlayerId: string, afterPlayerId: string): string | undefined {
  if (state.turnOrder.length === 0) return undefined;
  const start = state.turnOrder.indexOf(afterPlayerId);
  for (let offset = 1; offset <= state.turnOrder.length; offset += 1) {
    const index = ((start >= 0 ? start : -1) + offset) % state.turnOrder.length;
    const id = state.turnOrder[index];
    const candidate = state.players[id];
    if (id !== hakunoPlayerId && candidate && !candidate.eliminated) return id;
  }
  return undefined;
}

export function passEliminatedHakunoAnalysis(
  state: GameState,
  hakunoPlayerId: string,
  eliminatedPlayerId: string,
  definitions: Record<string, CardDefinition>,
): string[] {
  const ids = analysisTokenIds(state, eliminatedPlayerId, hakunoPlayerId);
  if (ids.length === 0) return [];
  const targetPlayerId = nextLivingOpponentInTurnOrder(state, hakunoPlayerId, eliminatedPlayerId);
  if (!targetPlayerId) return [];
  for (const instanceId of ids) transferAnalysis(state, hakunoPlayerId, eliminatedPlayerId, targetPlayerId, instanceId, definitions);
  return ids;
}

function winner(left: RpsChoice, right: RpsChoice): -1 | 0 | 1 {
  if (left === right) return 0;
  if ((left === "rock" && right === "scissors") || (left === "paper" && right === "rock") || (left === "scissors" && right === "paper")) return 1;
  return -1;
}

function applyChallengeResults(
  context: Parameters<SkillHandler>[0],
  targetPlayerId: string,
  wins: number,
): { wins: number; powerBonus: number; analysisInstanceId?: string; selfDefeated: boolean; targetDefeated: boolean } {
  const { state, player, definitions, emitEvent } = context;
  if (!definitions || !Number.isInteger(wins) || wins < 0 || wins > 3) throw new Error("HAKUNO_CHALLENGE_RESULT_INVALID");
  let powerBonus = 0;
  let analysisInstanceId: string | undefined;
  let selfDefeated = false;
  let targetDefeated = false;
  if (wins === 0) {
    selfDefeated = applyDefeatEffect(state, player.id, player.id, definitions, emitEvent, { sourceId: HAKUNO_CHALLENGE_RESULT_ID, method: "challenge" }).defeated;
  }
  if (wins >= 1) {
    player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 2;
    powerBonus += 2;
  }
  if (wins >= 2) {
    player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 3;
    powerBonus += 3;
    analysisInstanceId = grantHakunoAnalysis(state, player.id, targetPlayerId, definitions);
  }
  if (wins >= 3) {
    targetDefeated = applyDefeatEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: HAKUNO_CHALLENGE_RESULT_ID, method: "challenge" }).defeated;
  }
  return { wins, powerBonus, ...(analysisInstanceId ? { analysisInstanceId } : {}), selfDefeated, targetDefeated };
}

function openRpsRound(
  state: GameState,
  player: PlayerState,
  targetPlayerId: string,
  wins: number,
  gamesPlayed: number,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${HAKUNO_YOMI_ID}:rps:${gamesPlayed + 1}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: HAKUNO_RESOLVE,
    sourceId: HAKUNO_YOMI_ID,
    controllerPlayerId: player.id,
    payload: { stage: "rps", targetPlayerId, wins, gamesPlayed },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id, targetPlayerId],
    kind: "hakuno-challenge-rps",
    options: RPS.map((id) => ({ id, label: id })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function beginChallenge(context: Parameters<SkillHandler>[0], targetPlayerId: string): unknown {
  const { state, player, definitions, openDecision } = context;
  if (!definitions || !battlefieldOpponentIds(state, player).includes(targetPlayerId)) throw new Error("HAKUNO_CHALLENGE_TARGET_INVALID");
  const automaticWins = Math.min(3, Math.floor(analysisTokenIds(state, targetPlayerId, player.id).length / 3));
  if (automaticWins >= 3) return applyChallengeResults(context, targetPlayerId, 3);
  openRpsRound(state, player, targetPlayerId, automaticWins, automaticWins, openDecision);
  return { pending: true, targetPlayerId, automaticWins };
}

function openYomiChoice(context: Parameters<SkillHandler>[0]): { pending: true } {
  const { state, player, openDecision } = context;
  const opponents = battlefieldOpponentIds(state, player);
  if (opponents.length === 0) throw new Error("HAKUNO_YOMI_NO_TARGET");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${HAKUNO_YOMI_ID}:choice`;
  const options = opponents.flatMap((targetPlayerId) => [
    { id: `analysis:${targetPlayerId}`, label: `Analysis · ${targetPlayerId}` },
    { id: `challenge:${targetPlayerId}`, label: `Challenge · ${targetPlayerId}` },
  ]);
  state.effectQueue.unshift({ effectId, handlerId: HAKUNO_RESOLVE, sourceId: HAKUNO_YOMI_ID, controllerPlayerId: player.id,
    payload: { stage: "yomi-choice", opponentIds: opponents }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "hakuno-yomi",
    options, min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
  return { pending: true };
}

export const useHakunoMale: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions } = context;
  if (!definitions) throw new Error("HAKUNO_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === HAKUNO_ANALYSIS_ID && eventType === "round.ended") {
    const eliminated = Array.isArray(event.eliminatedThisRound) ? event.eliminatedThisRound.filter((id): id is string => typeof id === "string") : [];
    const transferred: Array<{ fromPlayerId: string; toPlayerId?: string; instanceIds: string[] }> = [];
    for (const eliminatedPlayerId of eliminated) {
      const targetPlayerId = nextLivingOpponentInTurnOrder(state, player.id, eliminatedPlayerId);
      const instanceIds = passEliminatedHakunoAnalysis(state, player.id, eliminatedPlayerId, definitions);
      if (instanceIds.length > 0) transferred.push({ fromPlayerId: eliminatedPlayerId, ...(targetPlayerId ? { toPlayerId: targetPlayerId } : {}), instanceIds });
    }
    return { transferred };
  }

  if (skill.id === HAKUNO_YOMI_ID) {
    if (data.abilityId !== HAKUNO_YOMI_ABILITY || state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("HAKUNO_YOMI_WINDOW_INVALID");
    const targetPlayerId = typeof data.targetPlayerId === "string" ? data.targetPlayerId : undefined;
    const mode = data.mode === "analysis" || data.mode === "challenge" ? data.mode : undefined;
    if (!targetPlayerId || !mode) return openYomiChoice(context);
    if (!battlefieldOpponentIds(state, player).includes(targetPlayerId)) throw new Error("HAKUNO_YOMI_TARGET_INVALID");
    if (mode === "analysis") {
      player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) - 2;
      return { targetPlayerId, mode, analysisInstanceId: grantHakunoAnalysis(state, player.id, targetPlayerId, definitions), powerDelta: -2 };
    }
    return beginChallenge(context, targetPlayerId);
  }

  if (skill.id === HAKUNO_DEAD_FACE_ID) {
    if (data.abilityId !== HAKUNO_DEAD_FACE_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("HAKUNO_DEAD_FACE_WINDOW_INVALID");
    const sourcePlayerId = typeof data.sourcePlayerId === "string" ? data.sourcePlayerId : undefined;
    const targetPlayerId = typeof data.targetPlayerId === "string" ? data.targetPlayerId : undefined;
    const instanceId = typeof data.instanceId === "string" ? data.instanceId : undefined;
    if (!sourcePlayerId || !targetPlayerId || !instanceId || sourcePlayerId === targetPlayerId) throw new Error("HAKUNO_DEAD_FACE_TARGET_INVALID");
    transferAnalysis(state, player.id, sourcePlayerId, targetPlayerId, instanceId, definitions);
    return { sourcePlayerId, targetPlayerId, instanceId };
  }

  return;
};

export const resolveHakunoMale: SkillHandler = (context) => {
  const { state, player, payload, definitions, openDecision } = context;
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("HAKUNO_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  if (decision.status !== "resolved") throw new Error("HAKUNO_DECISION_INVALID");

  if (previous.stage === "yomi-choice") {
    const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1) throw new Error("HAKUNO_YOMI_CHOICE_INVALID");
    const [mode, targetPlayerId] = selections[0].split(":", 2);
    const opponentIds = Array.isArray(previous.opponentIds) ? previous.opponentIds.filter((id): id is string => typeof id === "string") : [];
    if ((mode !== "analysis" && mode !== "challenge") || !targetPlayerId || !opponentIds.includes(targetPlayerId) || !battlefieldOpponentIds(state, player).includes(targetPlayerId)) {
      throw new Error("HAKUNO_YOMI_CHOICE_INVALID");
    }
    if (mode === "analysis") {
      player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) - 2;
      return { targetPlayerId, mode, analysisInstanceId: grantHakunoAnalysis(state, player.id, targetPlayerId, definitions), powerDelta: -2 };
    }
    return beginChallenge(context, targetPlayerId);
  }

  if (previous.stage === "rps") {
    const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
    const wins = Number(previous.wins);
    const gamesPlayed = Number(previous.gamesPlayed);
    if (!targetPlayerId || !Number.isInteger(wins) || !Number.isInteger(gamesPlayed) || !isRecord(decision.submissions)) throw new Error("HAKUNO_RPS_DECISION_INVALID");
    const ownSelection = decision.submissions[player.id];
    const targetSelection = decision.submissions[targetPlayerId];
    const own = Array.isArray(ownSelection) && ownSelection.length === 1 && RPS.includes(ownSelection[0] as RpsChoice) ? ownSelection[0] as RpsChoice : undefined;
    const target = Array.isArray(targetSelection) && targetSelection.length === 1 && RPS.includes(targetSelection[0] as RpsChoice) ? targetSelection[0] as RpsChoice : undefined;
    if (!own || !target) throw new Error("HAKUNO_RPS_DECISION_INVALID");
    const nextWins = wins + (winner(own, target) === 1 ? 1 : 0);
    const nextGamesPlayed = gamesPlayed + 1;
    if (nextGamesPlayed >= 3) return applyChallengeResults(context, targetPlayerId, nextWins);
    openRpsRound(state, player, targetPlayerId, nextWins, nextGamesPlayed, openDecision);
    return { pending: true, targetPlayerId, wins: nextWins, gamesPlayed: nextGamesPlayed };
  }

  throw new Error("HAKUNO_DECISION_INVALID");
};

export const isHakunoMaleLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || player.eliminated || !definitions || state.activePlayerId !== playerId) return false;
  if (skill.id === HAKUNO_YOMI_ID) return ability?.id === HAKUNO_YOMI_ABILITY && state.phase === "combat" && battlefieldOpponentIds(state, player).length > 0;
  if (skill.id === HAKUNO_DEAD_FACE_ID && ability?.id === HAKUNO_DEAD_FACE_ABILITY && state.phase === "action") {
    if (player.flags.infiniteMana !== true && player.mana < 1) return false;
    const sources = Object.values(state.players).filter((candidate) => analysisTokenIds(state, candidate.id, player.id).length > 0);
    return sources.some((source) => Object.values(state.players).some((target) => !target.eliminated && target.id !== source.id));
  }
  return false;
};
