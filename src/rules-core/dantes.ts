import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { lendSkillToPlayerSkillZone, movePlayerCard, reclaimOwnedSkillToAttack } from "./decks.ts";
import { payManaCost } from "./costs.ts";
import { gainVictoryPoints } from "./resources.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const DANTES_KING_ID = "servant.dantes.skill.sc-dantes-1";
export const DANTES_ATTENDRE_ID = "servant.dantes.skill.sc-dantes-2";
export const DANTES_ENFER_ID = "servant.dantes.skill.sc-dantes-3";
export const DANTES_KING_HANDLER = "core.dantes-king";
export const DANTES_ATTENDRE_HANDLER = "core.dantes-attendre";
export const DANTES_ENFER_HANDLER = "core.dantes-enfer";
export const DANTES_KING_WINNER_RESOLVE = "core.dantes-king-winner-resolve";
export const DANTES_ENFER_RESOLVE = "core.dantes-enfer-resolve";

const CONSPIRACY_ARMED_ROUND = "dantesConspiracyArmedRound";
const DETERMINATION_ROUND = "dantesDeterminationRound";
const DETERMINATION_COMBAT_APPLIED_ROUND = "dantesDeterminationCombatAppliedRound";
const DETERMINATION_END_APPLIED_ROUND = "dantesDeterminationEndAppliedRound";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(card: CardInstance | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || card.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId));
}

function ownedPhysicalSkill(state: GameState, ownerPlayerId: string, skillId: string, definitions: Record<string, CardDefinition>): CardInstance | undefined {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === ownerPlayerId && card.zone !== "removed"
    && matchesSkill(card, definitions[card.definitionId], skillId));
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>): CardInstance | undefined {
  return player.attack.map((id) => state.cards[id]).find((card) => card?.ownerPlayerId === player.id && card.controllerPlayerId === player.id
    && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(card, definitions[card.definitionId], skillId));
}

function openKingWinnerDecision(state: GameState, player: PlayerState, candidates: string[], openDecision: SkillContext["openDecision"]): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${DANTES_KING_ID}:winner`;
  state.effectQueue.unshift({
    effectId,
    handlerId: DANTES_KING_WINNER_RESOLVE,
    sourceId: DANTES_KING_ID,
    controllerPlayerId: player.id,
    payload: { candidateIds: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "dantes-king-winner",
    options: candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function lendKingToWinner(state: GameState, player: PlayerState, targetPlayerId: string, definitions: Record<string, CardDefinition>) {
  const target = state.players[targetPlayerId];
  const king = ownedPhysicalSkill(state, player.id, DANTES_KING_ID, definitions);
  if (!target || target.eliminated || target.id === player.id || !king) throw new Error("DANTES_KING_WINNER_INVALID");
  lendSkillToPlayerSkillZone(state, player.id, target.id, king.instanceId, definitions);
  return { targetPlayerId: target.id, instanceId: king.instanceId };
}

export const useDantesKing: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions) throw new Error("DANTES_KING_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (eventType === "combat.resolved") {
    const participantIds = Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : [];
    const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
    const king = ownedPhysicalSkill(state, player.id, DANTES_KING_ID, definitions);
    const controllerPlayerId = king?.controllerPlayerId;
    if (!king || !controllerPlayerId || king.zone !== "attack" || !king.active || king.face !== "up"
      || !participantIds.includes(controllerPlayerId) || winnerIds.includes(controllerPlayerId) || winnerIds.length === 0) return;
    const eligible = winnerIds.filter((id) => id !== controllerPlayerId && state.players[id] && !state.players[id].eliminated);
    if (eligible.length === 0) return;
    if (eligible.length === 1) return lendKingToWinner(state, player, eligible[0], definitions);
    openKingWinnerDecision(state, player, eligible, openDecision);
    return { pending: true, candidatePlayerIds: eligible };
  }

  if (eventType === "phase.transitioned") {
    if (event.previousPhase !== "action" || event.transition !== "next-phase" || state.phase !== "combat"
      || Number(player.flags[CONSPIRACY_ARMED_ROUND] ?? -1) !== state.round) return;
    delete player.flags[CONSPIRACY_ARMED_ROUND];
    const king = ownedPhysicalSkill(state, player.id, DANTES_KING_ID, definitions);
    const targetPlayerId = king?.controllerPlayerId ?? undefined;
    if (!king || !targetPlayerId || !state.players[targetPlayerId] || state.players[targetPlayerId].eliminated) return;
    const result = applyDefeatEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: DANTES_KING_ID, method: "conspiracy" });
    return { targetPlayerId, result };
  }

  if (data.abilityId !== "conspiracy" || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("DANTES_KING_WINDOW_INVALID");
  const king = ownedPhysicalSkill(state, player.id, DANTES_KING_ID, definitions);
  if (!king || !king.controllerPlayerId || !state.players[king.controllerPlayerId] || state.players[king.controllerPlayerId].eliminated) throw new Error("DANTES_KING_CARD_MISSING");
  payManaCost(state, player, 4, definitions, "DANTES_KING_MANA_REQUIRED");
  player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + 4;
  revealPlayerTrueName(state, player.id);
  player.flags[CONSPIRACY_ARMED_ROUND] = state.round;
  return { armedRound: state.round, holderPlayerId: king.controllerPlayerId };
};

export const resolveDantesKingWinner: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("DANTES_KING_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("DANTES_KING_DECISION_INVALID");
  return lendKingToWinner(state, player, selections[0], definitions);
};

export const isDantesKingLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== "conspiracy" || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  const king = ownedPhysicalSkill(state, playerId, DANTES_KING_ID, definitions);
  return Boolean(king && king.controllerPlayerId && state.players[king.controllerPlayerId] && !state.players[king.controllerPlayerId].eliminated
    && (player.flags.infiniteMana === true || player.mana >= 4));
};

export const useDantesAttendre: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("DANTES_ATTENDRE_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;

  if (eventType === "combat.ending") {
    if (Number(player.flags[DETERMINATION_ROUND] ?? -1) !== state.round
      || Number(player.flags[DETERMINATION_COMBAT_APPLIED_ROUND] ?? -1) === state.round) return;
    player.flags[DETERMINATION_COMBAT_APPLIED_ROUND] = state.round;
    const rewarded: string[] = [];
    for (const target of Object.values(state.players)) {
      if (target.eliminated || Number(target.flags.combatLossRound ?? -1) !== state.round) continue;
      gainVictoryPoints(target, 1);
      rewarded.push(target.id);
    }
    return { loserRewardPlayerIds: rewarded };
  }

  if (eventType === "round.ending") {
    if (Number(player.flags[DETERMINATION_ROUND] ?? -1) !== state.round
      || Number(player.flags[DETERMINATION_END_APPLIED_ROUND] ?? -1) === state.round) return;
    player.flags[DETERMINATION_END_APPLIED_ROUND] = state.round;
    const candidates = Object.values(state.players).filter((target) => !target.eliminated);
    if (candidates.length === 0) return { lastPlacePlayerIds: [] };
    const minimum = Math.min(...candidates.map((target) => target.victoryPoints));
    const lastPlace = candidates.filter((target) => target.victoryPoints === minimum);
    for (const target of lastPlace) gainVictoryPoints(target, 2);
    return { lastPlacePlayerIds: lastPlace.map((target) => target.id), minimumVictoryPoints: minimum };
  }

  if (payload.abilityId === "attendre-recall") {
    if (state.phase !== "action" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, DANTES_ATTENDRE_ID, definitions)) {
      throw new Error("DANTES_ATTENDRE_ACTION_INVALID");
    }
    const king = ownedPhysicalSkill(state, player.id, DANTES_KING_ID, definitions);
    if (!king || king.zone === "attack" || ((king.zone === "master-skills" || king.zone === "servant-skills") && king.controllerPlayerId === player.id)) {
      throw new Error("DANTES_ATTENDRE_KING_IN_PLAY");
    }
    payManaCost(state, player, 6, definitions, "DANTES_ATTENDRE_MANA_REQUIRED");
    player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + 6;
    reclaimOwnedSkillToAttack(state, player.id, king.instanceId, definitions);
    return { instanceId: king.instanceId, paidMana: 6 };
  }

  if (payload.abilityId === "determination-of-steel") {
    if (state.phase !== "combat" || !activeOwnedSkill(state, player, DANTES_ATTENDRE_ID, definitions)) throw new Error("DANTES_DETERMINATION_COMBAT_INVALID");
    player.flags[DETERMINATION_ROUND] = state.round;
    return { armedRound: state.round };
  }

  throw new Error("DANTES_ATTENDRE_ABILITY_REQUIRED");
};

export const isDantesAttendreLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !ability || !activeOwnedSkill(state, player, DANTES_ATTENDRE_ID, definitions)) return false;
  if (ability.id === "determination-of-steel") return state.phase === "combat" && Number(player.flags[DETERMINATION_ROUND] ?? -1) !== state.round;
  if (ability.id !== "attendre-recall" || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  const king = ownedPhysicalSkill(state, playerId, DANTES_KING_ID, definitions);
  return Boolean(king && king.zone !== "attack" && !((king.zone === "master-skills" || king.zone === "servant-skills") && king.controllerPlayerId === playerId)
    && (player.flags.infiniteMana === true || player.mana >= 6));
};

interface EnferRevealResult {
  playerId: string;
  revealedInstanceIds: string[];
  playableInstanceId?: string;
}

function revealUntilSpecial(state: GameState, target: PlayerState, definitions: Record<string, CardDefinition>): EnferRevealResult {
  const revealed: string[] = [];
  let playableInstanceId: string | undefined;
  while (target.deck.length > 0) {
    const instanceId = target.deck[0];
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition) throw new Error("DANTES_ENFER_CARD_DEFINITION_MISSING");
    revealed.push(instanceId);
    const attributes = getCardInstanceAttributes(card, definition, state, definitions);
    const special = attributes.includes("特殊");
    if (special && (definition.id === "card.cardluck" || definition.id === "card.card-avenger")) {
      movePlayerCard(state, target.id, instanceId, "hand");
      card.face = "up";
      card.active = false;
      card.publiclyRevealed = true;
      playableInstanceId = instanceId;
      break;
    }
    movePlayerCard(state, target.id, instanceId, "discard");
    card.face = "up";
    card.active = false;
    card.residual = false;
    card.publiclyRevealed = true;
    if (special) break;
  }
  return { playerId: target.id, revealedInstanceIds: revealed, ...(playableInstanceId ? { playableInstanceId } : {}) };
}

export const useDantesEnfer: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== "enfer-hope") throw new Error("DANTES_ENFER_CONTEXT_REQUIRED");
  if (state.phase !== "action" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, DANTES_ENFER_ID, definitions)) {
    throw new Error("DANTES_ENFER_ACTION_INVALID");
  }
  revealPlayerTrueName(state, player.id);
  const results: EnferRevealResult[] = [];
  const eligible: Record<string, string> = {};
  for (const playerId of state.turnOrder) {
    const target = state.players[playerId];
    if (!target || target.eliminated) continue;
    const result = revealUntilSpecial(state, target, definitions);
    results.push(result);
    if (result.playableInstanceId) eligible[playerId] = result.playableInstanceId;
    for (const instanceId of result.revealedInstanceIds) {
      const card = state.cards[instanceId];
      const definition = definitions[card.definitionId];
      emitEvent?.("card.revealed", { playerId, instanceId, definitionId: definition.id, sourceId: DANTES_ENFER_ID });
    }
  }
  const chooserPlayerIds = Object.keys(eligible);
  if (chooserPlayerIds.length === 0) return { results, pending: false };
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${DANTES_ENFER_ID}:play`;
  state.effectQueue.unshift({
    effectId,
    handlerId: DANTES_ENFER_RESOLVE,
    sourceId: DANTES_ENFER_ID,
    controllerPlayerId: player.id,
    payload: { eligible, results },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds,
    kind: "dantes-enfer-play",
    options: [
      { id: "play", label: "Play" },
      { id: "discard", label: "Discard" },
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { results, pending: true, chooserPlayerIds };
};

export const resolveDantesEnfer: SkillHandler = ({ state, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)
    || !isRecord(payload.previous.eligible) || !isRecord(payload.decision.submissions) || payload.decision.status !== "resolved") {
    throw new Error("DANTES_ENFER_DECISION_INVALID");
  }
  const eligible = payload.previous.eligible;
  const submissions = payload.decision.submissions;
  const played: string[] = [];
  const discarded: string[] = [];
  for (const [playerId, rawInstanceId] of Object.entries(eligible)) {
    if (typeof rawInstanceId !== "string") throw new Error("DANTES_ENFER_DECISION_INVALID");
    const selections = submissions[playerId];
    if (!Array.isArray(selections) || selections.length !== 1 || (selections[0] !== "play" && selections[0] !== "discard")) {
      throw new Error("DANTES_ENFER_DECISION_INVALID");
    }
    const target = state.players[playerId];
    const card = state.cards[rawInstanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!target || target.eliminated || !card || !definition || card.ownerPlayerId !== playerId || card.zone !== "hand" || !target.hand.includes(rawInstanceId)) {
      throw new Error("DANTES_ENFER_CARD_UNAVAILABLE");
    }
    delete card.publiclyRevealed;
    if (selections[0] === "discard") {
      movePlayerCard(state, playerId, rawInstanceId, "discard");
      card.face = "up";
      card.active = false;
      card.residual = false;
      discarded.push(rawInstanceId);
      continue;
    }
    const { paidMana } = addCardToAttack(state, playerId, rawInstanceId, definitions, {
      payCost: true,
      allowedSourceZones: ["hand"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
    });
    played.push(rawInstanceId);
    emitEvent?.("card.played", { playerId, instanceId: rawInstanceId, definitionId: definition.id, face: "up", paidMana, method: "dantes-enfer" });
    emitEvent?.("card.used", { playerId, instanceId: rawInstanceId, definitionId: definition.id, locationId: target.locationId, method: "dantes-enfer" });
  }
  return { playedInstanceIds: played, discardedInstanceIds: discarded };
};

export const isDantesEnferLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "enfer-hope" && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, DANTES_ENFER_ID, definitions));
};
