import type { GameState, PlayerState } from "../domain/state/types.ts";
import { playBorrowedCardToAttack } from "./card-play.ts";
import type { CardDefinition } from "./content-types.ts";
import { ensurePlayerDeckTopCards, movePlayerCard } from "./decks.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import { gainVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const TEACH_GENTLEMAN_LOVE_ID = "servant.teach.skill.sc-teach-1";
export const TEACH_QUEEN_ANNE_ID = "servant.teach.skill.sc-teach-2";
export const TEACH_GENTLEMAN_HANDLER = "core.teach-gentleman-love";
export const TEACH_GENTLEMAN_RESOLVE = "core.teach-gentleman-love-resolve";
export const TEACH_QUEEN_ANNE_HANDLER = "core.teach-queen-anne";
export const TEACH_QUEEN_ANNE_RESOLVE = "core.teach-queen-anne-resolve";
export const TEACH_COMPETITION_REWARD_BLOCK_FLAG = "competitionVictoryPointGainBlocked";
const TEACH_REMOVED_IDS_FLAG = "teachGentlemanLoveRemovedInstanceIds";
const TEACH_QUEEN_ANNE_REMOVE_ROUND_FLAG = "teachQueenAnneRemoveRound";
const TEACH_QUEEN_ANNE_SOURCE_FLAG = "teachQueenAnneSourceInstanceId";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readEvent(payload: unknown): Record<string, unknown> {
  return isRecord(payload) && isRecord(payload.event) ? payload.event : {};
}

function activeOwnedSkill(state: GameState, player: PlayerState, definitionId: string) {
  return player.attack
    .map((instanceId) => state.cards[instanceId])
    .find((card) => card?.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.definitionId === definitionId && card.zone === "attack" && card.face === "up" && card.active);
}

function rememberedRemovedIds(player: PlayerState): string[] {
  const value = player.flags[TEACH_REMOVED_IDS_FLAG];
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

function rememberRemoved(player: PlayerState, instanceId: string): void {
  player.flags[TEACH_REMOVED_IDS_FLAG] = [...new Set([...rememberedRemovedIds(player), instanceId])];
}

function openContinuation(
  state: GameState,
  playerId: string,
  sourceId: string,
  handlerId: string,
  stage: string,
  previous: Record<string, unknown>,
  options: Array<{ id: string; label: string }>,
  min: number,
  max: number,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${playerId}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId,
    sourceId,
    controllerPlayerId: playerId,
    payload: { stage, ...previous },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: playerId,
    chooserPlayerIds: [playerId],
    kind: `teach-${stage}`,
    options,
    min,
    max,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function resolveDecision(payload: unknown): { previous: Record<string, unknown>; selections: string[] } {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("TEACH_DECISION_INVALID");
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved") throw new Error("TEACH_DECISION_INVALID");
  return { previous: payload.previous, selections };
}

/**
 * Gentlemanly Love replaces only the battlefield competition VP. Event-card VP
 * is still handled by the shared combat settlement. After a contested win the
 * remaining effect operates on stable physical cards from one losing player.
 */
export const useTeachGentlemanLove: SkillHandler = ({ state, player, skill, payload, openDecision, definitions, randomInt }) => {
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "game.started") {
    player.flags[TEACH_COMPETITION_REWARD_BLOCK_FLAG] = true;
    return;
  }
  if (eventType !== "combat.resolved") return;
  if (!definitions) throw new Error("TEACH_GENTLEMAN_DEFINITIONS_REQUIRED");
  const event = readEvent(payload);
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  const powers = isRecord(event.powers) ? event.powers : {};
  if (!winnerIds.includes(player.id) || Object.keys(powers).length < 2) return;
  const loserIds = Object.keys(powers).filter((id) => id !== player.id && Boolean(state.players[id]) && !winnerIds.includes(id));
  if (loserIds.length === 0) return;
  openContinuation(
    state,
    player.id,
    skill.id,
    TEACH_GENTLEMAN_RESOLVE,
    "gentleman-target",
    {},
    loserIds.map((id) => ({ id, label: state.players[id].name })),
    1,
    1,
    openDecision,
  );
  return { loserIds, randomReady: Boolean(randomInt) };
};

export const resolveTeachGentlemanLove: SkillHandler = ({ state, player, skill, payload, openDecision, definitions, randomInt }) => {
  if (!definitions) throw new Error("TEACH_GENTLEMAN_DEFINITIONS_REQUIRED");
  const { previous, selections } = resolveDecision(payload);
  const stage = previous.stage;
  if (stage === "gentleman-target") {
    if (selections.length !== 1 || !state.players[selections[0]]) throw new Error("TEACH_GENTLEMAN_TARGET_INVALID");
    const targetPlayerId = selections[0];
    const cards = ensurePlayerDeckTopCards(state, targetPlayerId, 3, randomInt ?? (() => 0));
    if (cards.length === 0) return { targetPlayerId, removedInstanceId: null };
    openContinuation(
      state,
      player.id,
      skill.id,
      TEACH_GENTLEMAN_RESOLVE,
      "gentleman-remove",
      { targetPlayerId, peekedInstanceIds: cards },
      cards.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
      1,
      1,
      openDecision,
    );
    return;
  }
  if (stage === "gentleman-remove") {
    const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
    const peeked = Array.isArray(previous.peekedInstanceIds) ? previous.peekedInstanceIds.filter((id): id is string => typeof id === "string") : [];
    if (!targetPlayerId || selections.length !== 1 || !peeked.includes(selections[0])) throw new Error("TEACH_GENTLEMAN_REMOVE_INVALID");
    const target = state.players[targetPlayerId];
    const removedInstanceId = selections[0];
    if (!target || !target.deck.includes(removedInstanceId) || peeked.some((id) => id !== removedInstanceId && !target.deck.includes(id))) {
      throw new Error("TEACH_GENTLEMAN_PEEK_CHANGED");
    }
    const removedDefinition = definitions[state.cards[removedInstanceId]?.definitionId ?? ""];
    if (!removedDefinition) throw new Error("TEACH_GENTLEMAN_CARD_DEFINITION_MISSING");
    movePlayerCard(state, targetPlayerId, removedInstanceId, "removed");
    rememberRemoved(player, removedInstanceId);
    const reward = Math.min(5, Math.max(0, getPrintedCardBasePower(state, target, removedDefinition)));
    gainVictoryPoints(player, reward);
    const kept = peeked.filter((id) => id !== removedInstanceId);
    if (kept.length <= 1) return { targetPlayerId, removedInstanceId, reward, orderedRest: kept };
    openContinuation(
      state,
      player.id,
      skill.id,
      TEACH_GENTLEMAN_RESOLVE,
      "gentleman-order",
      { targetPlayerId, removedInstanceId, keptInstanceIds: kept, reward },
      kept.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
      kept.length,
      kept.length,
      openDecision,
    );
    return;
  }
  if (stage !== "gentleman-order") throw new Error("TEACH_GENTLEMAN_STAGE_INVALID");
  const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
  const kept = Array.isArray(previous.keptInstanceIds) ? previous.keptInstanceIds.filter((id): id is string => typeof id === "string") : [];
  if (!targetPlayerId || selections.length !== kept.length || new Set(selections).size !== kept.length || selections.some((id) => !kept.includes(id))) {
    throw new Error("TEACH_GENTLEMAN_ORDER_INVALID");
  }
  const target = state.players[targetPlayerId];
  if (!target || kept.some((id) => !target.deck.includes(id))) throw new Error("TEACH_GENTLEMAN_PEEK_CHANGED");
  target.deck = [...selections, ...target.deck.filter((id) => !kept.includes(id))];
  return { targetPlayerId, removedInstanceId: previous.removedInstanceId, reward: previous.reward, orderedRest: selections };
};

function queenAnneCandidates(state: GameState, player: PlayerState): string[] {
  return rememberedRemovedIds(player).filter((instanceId) => state.cards[instanceId]?.zone === "removed"
    && state.cards[instanceId]?.ownerPlayerId !== player.id);
}

export const isTeachQueenAnneLegal: SkillLegalityPredicate = (state, playerId, skill) => {
  const player = state.players[playerId];
  return Boolean(player && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id) && queenAnneCandidates(state, player).length > 0);
};

export const useTeachQueenAnne: SkillHandler = (context) => {
  const { state, player, skill, payload, openDecision, definitions } = context;
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "combat.ending") return useTeachQueenAnneCleanup(context);
  if (!definitions || !isTeachQueenAnneLegal(state, player.id, skill)) throw new Error("TEACH_QUEEN_ANNE_WINDOW_INVALID");
  const candidates = queenAnneCandidates(state, player);
  openContinuation(
    state,
    player.id,
    skill.id,
    TEACH_QUEEN_ANNE_RESOLVE,
    "queen-anne-card",
    { candidateInstanceIds: candidates },
    candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    1,
    1,
    openDecision,
  );
};

export const resolveTeachQueenAnne: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("TEACH_QUEEN_ANNE_DEFINITIONS_REQUIRED");
  const { previous, selections } = resolveDecision(payload);
  const candidates = Array.isArray(previous.candidateInstanceIds) ? previous.candidateInstanceIds.filter((id): id is string => typeof id === "string") : [];
  if (previous.stage !== "queen-anne-card" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("TEACH_QUEEN_ANNE_CARD_INVALID");
  const instanceId = selections[0];
  if (state.cards[instanceId]?.zone !== "removed") throw new Error("TEACH_QUEEN_ANNE_CARD_INVALID");
  const source = activeOwnedSkill(state, player, skill.id);
  if (!source) throw new Error("TEACH_QUEEN_ANNE_SOURCE_MISSING");
  const { paidMana, ownerPlayerId } = playBorrowedCardToAttack(state, player.id, instanceId, definitions, { allowedSourceZones: ["removed"], minimumManaCost: 2 });
  emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: state.cards[instanceId].definitionId, face: "up", paidMana, borrowedFromPlayerId: ownerPlayerId, sourceSkillId: skill.id });
  player.flags[TEACH_QUEEN_ANNE_REMOVE_ROUND_FLAG] = state.round;
  player.flags[TEACH_QUEEN_ANNE_SOURCE_FLAG] = source.instanceId;
  return { instanceId, ownerPlayerId, paidMana };
};

/** The NP removes itself after the Combat phase in which its Action was used. */
export const useTeachQueenAnneCleanup: SkillHandler = ({ state, player, payload }) => {
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType !== "combat.ending" || Number(player.flags[TEACH_QUEEN_ANNE_REMOVE_ROUND_FLAG] ?? -1) !== state.round) return;
  const sourceInstanceId = typeof player.flags[TEACH_QUEEN_ANNE_SOURCE_FLAG] === "string" ? player.flags[TEACH_QUEEN_ANNE_SOURCE_FLAG] : undefined;
  if (sourceInstanceId && state.cards[sourceInstanceId]?.ownerPlayerId === player.id && state.cards[sourceInstanceId].zone !== "removed") {
    movePlayerCard(state, player.id, sourceInstanceId, "removed");
    state.cards[sourceInstanceId].face = "down";
    state.cards[sourceInstanceId].active = false;
    state.cards[sourceInstanceId].residual = false;
  }
  delete player.flags[TEACH_QUEEN_ANNE_REMOVE_ROUND_FLAG];
  delete player.flags[TEACH_QUEEN_ANNE_SOURCE_FLAG];
  return { sourceInstanceId };
};
