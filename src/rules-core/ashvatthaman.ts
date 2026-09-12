import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { closePlayerCard } from "./decks.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ASHVA_AVATAR_ID = "servant.ashva.skill.sc-ashva-1";
export const ASHVA_MAHAKALA_ID = "servant.ashva.skill.sc-ashva-2";
export const ASHVA_CHAKRA_ID = "servant.ashva.skill.sc-ashva-3";
export const ASHVA_AVATAR_HANDLER = "core.ashva-avatar-rage";
export const ASHVA_AVATAR_RESOLVE = "core.ashva-avatar-rage-resolve";
export const ASHVA_MAHAKALA_HANDLER = "core.ashva-mahakala";
export const ASHVA_MAHAKALA_RESOLVE = "core.ashva-mahakala-resolve";
export const ASHVA_CHAKRA_HANDLER = "core.ashva-sudarshan-chakra";
export const ASHVA_CHAKRA_RESOLVE = "core.ashva-sudarshan-chakra-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card?.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === "attack"
      && card.active && card.face === "up" && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
  });
}

function openDecision(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  handlerId: string,
  kind: string,
  options: Array<{ id: string; label: string }>,
  min: number,
  max: number,
  payload: Record<string, unknown>,
  open: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${kind}`;
  state.effectQueue.unshift({ effectId, handlerId, sourceId, controllerPlayerId: player.id, payload, createdAtRevision: state.revision });
  open({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind,
    options, min, max, allowCancel: false, continuationEffectId: effectId, submissions: {} });
}

function removeTrackedActiveSituation(state: GameState, player: PlayerState): string | undefined {
  if (Number(player.flags.ashvaMahakalaExtraSituationRound ?? -1) !== state.round) return undefined;
  const id = typeof player.flags.ashvaMahakalaExtraSituationId === "string" ? player.flags.ashvaMahakalaExtraSituationId : undefined;
  if (!id) return undefined;
  state.board.activeSituations = state.board.activeSituations.filter((candidate) => candidate !== id);
  delete player.flags.ashvaMahakalaExtraSituationRound;
  delete player.flags.ashvaMahakalaExtraSituationId;
  return id;
}

export const useAshvaAvatarRage: SkillHandler = ({ state, player, skill, payload, definitions, openDecision: open }) => {
  if (!definitions) throw new Error("ASHVA_AVATAR_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (eventType === "combat.resolved") {
    const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
    if (!source || !winners.includes(player.id)) return;
    if (player.victoryPoints <= 0) {
      closePlayerCard(state, player.id, source.instanceId, definitions);
      return { paidVictoryPoints: 0, closed: true };
    }
    openDecision(state, player, skill.id, ASHVA_AVATAR_RESOLVE, "ashva-krishna-curse",
      [{ id: "pay-vp", label: "Pay 1 VP" }, { id: "close", label: "Deactivate Avatar of Rage" }], 1, 1,
      { sourceInstanceId: source.instanceId }, open);
    return { pending: true };
  }
  if (eventType === "round.ending") {
    if (Number(player.flags.ashvaAvatarRemoveSituationsRound ?? -1) !== state.round) return;
    const removedSituationIds = [...state.board.activeSituations];
    state.board.activeSituations = [];
    delete player.flags.ashvaAvatarRemoveSituationsRound;
    return { removedSituationIds };
  }
  if (data.abilityId !== "avatar-ruin" || state.phase !== "action" || state.activePlayerId !== player.id || !source) {
    throw new Error("ASHVA_AVATAR_ABILITY_INVALID");
  }
  const modifierId = `${skill.id}:situation-power:${state.round}`;
  state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => modifier.id !== modifierId);
  state.activeRuleModifiers.push({
    id: modifierId, sourceId: skill.id, controllerPlayerId: player.id, sourceInstanceId: source.instanceId,
    operation: "multiply", rule: "situation_power_multiplier", scope: { subject: "controller" }, value: 2,
    duration: "round", createdRound: state.round,
  });
  player.flags.ashvaAvatarRemoveSituationsRound = state.round;
  return { multiplier: 2 };
};

export const resolveAshvaAvatarRage: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("ASHVA_AVATAR_DECISION_INVALID");
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !["pay-vp", "close"].includes(selections[0])) throw new Error("ASHVA_AVATAR_DECISION_INVALID");
  const sourceInstanceId = typeof payload.previous.sourceInstanceId === "string" ? payload.previous.sourceInstanceId : undefined;
  if (!sourceInstanceId || !player.attack.includes(sourceInstanceId) || !state.cards[sourceInstanceId]?.active) throw new Error("ASHVA_AVATAR_SOURCE_INVALID");
  if (selections[0] === "pay-vp") {
    if (player.victoryPoints < 1) throw new Error("ASHVA_AVATAR_VP_REQUIRED");
    player.victoryPoints -= 1;
    return { paidVictoryPoints: 1, closed: false };
  }
  closePlayerCard(state, player.id, sourceInstanceId, definitions);
  return { paidVictoryPoints: 0, closed: true };
};

export const useAshvaMahakala: SkillHandler = ({ state, player, skill, payload, definitions, openDecision: open }) => {
  if (!definitions) throw new Error("ASHVA_MAHAKALA_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "round.started") {
    if (Number(player.flags.ashvaMahakalaPendingRound ?? -1) !== state.round) return;
    delete player.flags.ashvaMahakalaPendingRound;
    const candidates = [...state.board.situationDiscard];
    if (candidates.length === 0) return { activated: false };
    openDecision(state, player, skill.id, ASHVA_MAHAKALA_RESOLVE, "ashva-mahakala-situation",
      candidates.map((id) => ({ id, label: id })), 1, 1, { candidateIds: candidates }, open);
    return { pending: true };
  }
  if (eventType === "round.ending") {
    const removedSituationId = removeTrackedActiveSituation(state, player);
    return removedSituationId ? { removedSituationId } : undefined;
  }
  if (data.abilityId !== "mahakala-past" || state.phase !== "action" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("ASHVA_MAHAKALA_ABILITY_INVALID");
  player.flags.ashvaMahakalaPendingRound = state.round + 1;
  return { targetRound: state.round + 1 };
};

export const resolveAshvaMahakala: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("ASHVA_MAHAKALA_DECISION_INVALID");
  const allowed = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !allowed.includes(selections[0]) || !state.board.situationDiscard.includes(selections[0])) {
    throw new Error("ASHVA_MAHAKALA_DECISION_INVALID");
  }
  const situationId = selections[0];
  state.board.situationDiscard = state.board.situationDiscard.filter((id) => id !== situationId);
  state.board.activeSituations.push(situationId);
  player.flags.ashvaMahakalaExtraSituationRound = state.round;
  player.flags.ashvaMahakalaExtraSituationId = situationId;
  return { situationId };
};

export const useAshvaSudarshanChakra: SkillHandler = ({ state, player, skill, payload, definitions, openDecision: open }) => {
  if (!definitions) throw new Error("ASHVA_CHAKRA_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== "ashes-to-ashes" || state.phase !== "action" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("ASHVA_CHAKRA_ABILITY_INVALID");
  const candidates = [...state.board.situationDiscard];
  openDecision(state, player, skill.id, ASHVA_CHAKRA_RESOLVE, "ashva-chakra-remove-situations",
    candidates.map((id) => ({ id, label: id })), 0, Math.min(3, candidates.length), { candidateIds: candidates }, open);
  return { pending: true, candidateIds: candidates };
};

export const resolveAshvaSudarshanChakra: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("ASHVA_CHAKRA_DECISION_INVALID");
  const allowed = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length > 3 || new Set(selections).size !== selections.length
    || selections.some((id) => !allowed.includes(id) || !state.board.situationDiscard.includes(id))) throw new Error("ASHVA_CHAKRA_DECISION_INVALID");
  state.board.situationDiscard = state.board.situationDiscard.filter((id) => !selections.includes(id));
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("ASHVA_CHAKRA_SOURCE_INVALID");
  const bonus = selections.length * 2;
  if (bonus > 0) source.powerModifiers = [...(source.powerModifiers ?? []), { id: `${skill.id}:ashes:${state.round}`, sourceId: skill.id, kind: "add", value: bonus, duration: "round" }];
  return { removedSituationIds: selections, powerBonus: bonus };
};

export const isAshvaAvatarLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "avatar-ruin" && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions));
};
export const isAshvaMahakalaLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "mahakala-past" && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions));
};
export const isAshvaChakraLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "ashes-to-ashes" && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions));
};
