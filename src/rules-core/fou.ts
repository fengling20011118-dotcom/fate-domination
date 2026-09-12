import type { GameState, CardInstance } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { hasClimaxEliminationPrevention, installClimaxEliminationPrevention, installSharedVictoryLink } from "./elimination-prevention.ts";
import { wouldPlayerBeEliminatedAtNextClimax } from "./rounds.ts";
import type { SkillDefinition, SkillHandler } from "./skill-types.ts";

export const FOU_MARK_ID = "master.fou.skill.s1";
export const FOU_FORCE_ID = "master.fou.skill.ascension";
export const FOU_MARK_HANDLER = "core.fou-mark-of-beast";
export const FOU_MARK_RESOLVE = "core.fou-mark-of-beast-resolve";
export const FOU_FORCE_HANDLER = "core.fou-force-of-providence";
export const FOU_FORCE_RESOLVE = "core.fou-force-of-providence-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ownedPhysicalSkill(state: GameState, playerId: string, skillId: string, definitions: Record<string, CardDefinition>): CardInstance | undefined {
  const player = state.players[playerId];
  if (!player) return undefined;
  return [...player.masterSkills, ...player.servantSkills, ...player.attack].map((id) => state.cards[id]).find((card) => {
    if (!card || card.ownerPlayerId !== playerId || card.zone === "removed") return false;
    const definition = definitions[card.definitionId];
    return card.definitionId === skillId || definition?.linkedSkillId === skillId;
  });
}

export function getFouMarkCandidates(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): string[] {
  const player = state.players[playerId];
  if (!player || Number(player.flags.commandSealSpentRound ?? -1) !== state.round) return [];
  return [...player.masterSkills, ...player.servantSkills].filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.isSkill === true && card.ownerPlayerId === playerId && card.returnedToSkillZoneRound === state.round);
  });
}

function nextMarkIndex(card: CardInstance): number {
  return (card.powerModifiers ?? []).filter((modifier) => modifier.sourceId === FOU_MARK_ID && modifier.id.startsWith(`${FOU_MARK_ID}:mark:`)).length + 1;
}

/** End-round mandatory Mark choice after actual Command Seal expenditure. */
export const useFouMarkOfBeast: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("FOU_MARK_DEFINITIONS_REQUIRED");
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType !== "round.ending") return;
  const candidates = getFouMarkCandidates(state, player.id, definitions);
  if (candidates.length === 0) return;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:mark`;
  state.effectQueue.unshift({
    effectId,
    handlerId: FOU_MARK_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { candidates, round: state.round },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "fou-mark-of-beast",
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
};

export const resolveFouMarkOfBeast: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("FOU_MARK_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || Number(previous.round) !== state.round || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("FOU_MARK_DECISION_INVALID");
  if (!getFouMarkCandidates(state, player.id, definitions).includes(selections[0])) throw new Error("FOU_MARK_TARGET_STALE");
  const card = state.cards[selections[0]];
  const index = nextMarkIndex(card);
  const modifierId = `${FOU_MARK_ID}:mark:${index}`;
  card.powerModifiers = [...(card.powerModifiers ?? []), { id: modifierId, sourceId: FOU_MARK_ID, kind: "add", value: 1, duration: "game" }];
  card.costModifiers = [...(card.costModifiers ?? []), { id: modifierId, sourceId: FOU_MARK_ID, kind: "add", value: -1, duration: "game", minPrintedFraction: 0.5 }];
  return { targetInstanceId: card.instanceId, markCount: index };
};

export function getFouForceCandidates(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): string[] {
  if (![8, 9, 10].includes(state.round)) return [];
  const source = ownedPhysicalSkill(state, playerId, FOU_FORCE_ID, definitions);
  if (!source || source.used === true) return [];
  return state.turnOrder.filter((targetPlayerId) => Boolean(state.players[targetPlayerId])
    && !state.players[targetPlayerId].eliminated
    && !hasClimaxEliminationPrevention(state, targetPlayerId)
    && wouldPlayerBeEliminatedAtNextClimax(state, targetPlayerId));
}

/** Force of Providence: optional end-round prevention, plus automatic post-elimination VP swap. */
export const useFouForceOfProvidence: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("FOU_FORCE_DEFINITIONS_REQUIRED");
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : {};
  if (eventType === "elimination.resolved") {
    const armedRound = Number(player.flags.fouForceResolvedRound ?? -1);
    if (armedRound !== Number(event.round)) return;
    const targetPlayerId = typeof player.flags.fouForceTargetPlayerId === "string" ? player.flags.fouForceTargetPlayerId : undefined;
    const target = targetPlayerId ? state.players[targetPlayerId] : undefined;
    if (target && target.id !== player.id) {
      const ownVp = player.victoryPoints;
      player.victoryPoints = target.victoryPoints;
      target.victoryPoints = ownVp;
    }
    delete player.flags.fouForceResolvedRound;
    delete player.flags.fouForceTargetPlayerId;
    return { swappedWithPlayerId: target && target.id !== player.id ? target.id : null };
  }
  if (eventType !== "round.ending") return;
  const candidates = getFouForceCandidates(state, player.id, definitions);
  if (candidates.length === 0) return;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:resurrection`;
  state.effectQueue.unshift({
    effectId,
    handlerId: FOU_FORCE_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { candidates, round: state.round },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "fou-force-of-providence",
    options: [{ id: "skip", label: "不使用" }, ...candidates.map((id) => ({ id, label: state.players[id].name }))],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
};

export const resolveFouForceOfProvidence: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("FOU_FORCE_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || Number(previous.round) !== state.round || selections.length !== 1) throw new Error("FOU_FORCE_DECISION_INVALID");
  if (selections[0] === "skip") return { preventedPlayerId: null };
  const targetPlayerId = selections[0];
  if (!candidates.includes(targetPlayerId) || !getFouForceCandidates(state, player.id, definitions).includes(targetPlayerId)) throw new Error("FOU_FORCE_TARGET_STALE");
  const source = ownedPhysicalSkill(state, player.id, FOU_FORCE_ID, definitions);
  if (!source || source.used === true) throw new Error("FOU_FORCE_ALREADY_USED");
  installClimaxEliminationPrevention(state, { sourceId: FOU_FORCE_ID, controllerPlayerId: player.id, targetPlayerId, round: state.round });
  source.used = true;
  player.flags.fouForceResolvedRound = state.round;
  player.flags.fouForceTargetPlayerId = targetPlayerId;
  if (targetPlayerId !== player.id) installSharedVictoryLink(state, FOU_FORCE_ID, player.id, targetPlayerId);
  return { preventedPlayerId: targetPlayerId };
};
