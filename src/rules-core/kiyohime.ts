import type { GameState, PlayerState } from "../domain/state/types.ts";
import { payMana } from "./costs.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { gainVictoryPoints } from "./resources.ts";
import { loseCommandSeals } from "./command-seals.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const KIYOHIME_KISS_ID = "servant.kiyohime.skill.sc-kiyohime-1";
export const KIYOHIME_LIES_ID = "servant.kiyohime.skill.sc-kiyohime-2";
export const KIYOHIME_SAMADHI_ID = "servant.kiyohime.skill.sc-kiyohime-3";

export const KIYOHIME_KISS_HANDLER = "core.kiyohime-flame-colored-kiss";
export const KIYOHIME_LIES_HANDLER = "core.kiyohime-no-more-lies";
export const KIYOHIME_LIES_RESOLVE = "core.kiyohime-no-more-lies-resolve";
export const KIYOHIME_SAMADHI_HANDLER = "core.kiyohime-samadhi";
export const KIYOHIME_SAMADHI_RESOLVE = "core.kiyohime-samadhi-resolve";

type LieRecord = { round: number; targetPlayerId: string; answerWillWin: boolean; combatChoiceOffered?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return Boolean(definition && (definitionId === skillId || definition.linkedSkillId === skillId));
}

function ownedPhysicalSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return Boolean(card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone !== "removed" && card.zone !== "discard" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function lieRecords(state: GameState): Record<string, LieRecord> {
  const current = state.modeState.kiyohimeNoMoreLies;
  if (current && typeof current === "object" && !Array.isArray(current)) return current as Record<string, LieRecord>;
  const created: Record<string, LieRecord> = {};
  state.modeState.kiyohimeNoMoreLies = created;
  return created;
}

function openKiyohimeDecision(
  state: GameState,
  controllerPlayerId: string,
  chooserPlayerId: string,
  handlerId: string,
  stage: string,
  options: Array<{ id: string; label: string; playerId?: string }>,
  payload: Record<string, unknown>,
  open: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${controllerPlayerId}:${KIYOHIME_LIES_ID}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId,
    sourceId: KIYOHIME_LIES_ID,
    controllerPlayerId,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  open({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: controllerPlayerId,
    chooserPlayerIds: [chooserPlayerId],
    kind: `kiyohime-${stage}`,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function resolved(payload: unknown): { previous: Record<string, unknown>; selection: string } {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("KIYOHIME_DECISION_INVALID");
  const selections = Array.isArray(payload.decision.selections)
    ? payload.decision.selections.filter((item): item is string => typeof item === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1) throw new Error("KIYOHIME_DECISION_INVALID");
  return { previous: payload.previous, selection: selections[0] };
}

/** Fiery Embrace: current-round Magic attacks gain +3/Strength; next round Workshop-only deployment and movement lock are source-bound. */
export const useKiyohimeFlameColoredKiss: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || state.phase !== "action" || state.activePlayerId !== player.id || !isRecord(payload) || payload.abilityId !== "fiery-embrace") {
    throw new Error("KIYOHIME_KISS_WINDOW_INVALID");
  }
  const source = ownedPhysicalSkill(state, player, KIYOHIME_KISS_ID, definitions);
  if (!source) throw new Error("KIYOHIME_KISS_SOURCE_UNAVAILABLE");
  const magicAttackDefinitionIds = Object.values(definitions)
    .filter((definition) => (definition.cardType === "attack" || definition.basic === true || definition.isSkill === true)
      && getCardAttributes(definition).includes("魔术"))
    .map((definition) => definition.id);
  player.cardRuleModifiers.push({
    id: `${skill.id}:fiery-embrace:${state.round}`,
    sourceId: skill.id,
    sourceInstanceId: source.instanceId,
    targetDefinitionIds: magicAttackDefinitionIds,
    grantAttributes: ["力量"],
    powerAdd: 3,
    duration: "round",
  });
  player.flags.forcedDeploymentRound = state.round + 1;
  player.flags.forcedDeploymentLocationId = "workshop";
  player.flags.strictForcedDeploymentRound = state.round + 1;
  player.flags.strictForcedDeploymentSourceInstanceId = source.instanceId;
  player.flags.movementBlockedBySourceRound = state.round + 1;
  player.flags.movementBlockedBySourceInstanceId = source.instanceId;
  // The standard action window already permits passing the play step entirely,
  // so the printed "you don't have to play any cards" needs no extra runtime flag.
  return { sourceInstanceId: source.instanceId, magicAttackDefinitionIds };
};

export const isKiyohimeFlameColoredKissLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "fiery-embrace" && state.phase === "action" && state.activePlayerId === playerId
    && ownedPhysicalSkill(state, player, KIYOHIME_KISS_ID, definitions));
};

/** No More Lies: ask an opponent for a yes/no prediction about winning any fight this round. */
export const useKiyohimeNoMoreLies: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("KIYOHIME_LIES_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "phase.transitioned") {
    if (!isRecord(data.event) || data.event.previousPhase !== "action" || data.event.transition !== "next-phase" || state.phase !== "combat") return;
    const record = lieRecords(state)[player.id];
    const target = record?.round === state.round ? state.players[record.targetPlayerId] : undefined;
    if (!record || record.combatChoiceOffered || !target || target.eliminated) return;
    record.combatChoiceOffered = true;
    openKiyohimeDecision(state, player.id, target.id, KIYOHIME_LIES_RESOLVE, "lies-self-defeat", [
      { id: "continue", label: "继续战斗" },
      { id: "defeat", label: "使自己败北" },
    ], { targetPlayerId: target.id }, openDecision);
    return;
  }
  if (eventType === "round.ending") {
    const records = lieRecords(state);
    const record = records[player.id];
    if (!record || record.round !== state.round) return;
    const target = state.players[record.targetPlayerId];
    delete records[player.id];
    if (!target || target.eliminated) return;
    const didWin = Number(target.flags.combatWinRound ?? -1) === state.round;
    if (didWin === record.answerWillWin) return { correct: true, targetPlayerId: target.id };
    const lostCommandSeals = loseCommandSeals(state, target.id, 1);
    const gainedVictoryPoints = gainVictoryPoints(player, 2);
    return { correct: false, targetPlayerId: target.id, lostCommandSeals, gainedVictoryPoints };
  }
  if (data.abilityId !== "ask-lie" || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("KIYOHIME_LIES_WINDOW_INVALID");
  const targets = state.turnOrder.filter((id) => id !== player.id && state.players[id] && !state.players[id].eliminated);
  if (targets.length === 0) throw new Error("KIYOHIME_LIES_NO_TARGET");
  openKiyohimeDecision(state, player.id, player.id, KIYOHIME_LIES_RESOLVE, "lies-target", targets.map((id) => ({ id, playerId: id, label: state.players[id].name })), { candidates: targets }, openDecision);
};

export const resolveKiyohimeNoMoreLies: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions) throw new Error("KIYOHIME_LIES_DEFINITIONS_REQUIRED");
  const { previous, selection } = resolved(payload);
  const stage = typeof previous.stage === "string" ? previous.stage : undefined;
  if (stage === "lies-target") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selection)) throw new Error("KIYOHIME_LIES_TARGET_INVALID");
    openKiyohimeDecision(state, player.id, selection, KIYOHIME_LIES_RESOLVE, "lies-answer", [
      { id: "yes", label: "本回合会赢得一场战斗" },
      { id: "no", label: "本回合不会赢得战斗" },
    ], { targetPlayerId: selection }, openDecision);
    return;
  }
  if (stage === "lies-answer") {
    const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
    if (!targetPlayerId || !state.players[targetPlayerId] || (selection !== "yes" && selection !== "no")) throw new Error("KIYOHIME_LIES_ANSWER_INVALID");
    lieRecords(state)[player.id] = { round: state.round, targetPlayerId, answerWillWin: selection === "yes" };
    return { targetPlayerId, answerWillWin: selection === "yes" };
  }
  if (stage === "lies-self-defeat") {
    const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
    if (!targetPlayerId || (selection !== "continue" && selection !== "defeat")) throw new Error("KIYOHIME_LIES_SELF_DEFEAT_INVALID");
    if (selection === "defeat") applyDefeatEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: KIYOHIME_LIES_ID, method: "no-more-lies" });
    return { targetPlayerId, defeatedSelf: selection === "defeat" };
  }
  throw new Error("KIYOHIME_LIES_DECISION_INVALID");
};

export const isKiyohimeNoMoreLiesLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  return Boolean(player && ability?.id === "ask-lie" && state.phase === "action" && state.activePlayerId === playerId
    && state.turnOrder.some((id) => id !== playerId && state.players[id] && !state.players[id].eliminated));
};

/** Samadhi/Twin Flames: optional 3 mana on play for round-long Magic reduction immunity and one extra residual round. */
export const useKiyohimeSamadhi: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) return;
  if (payload.eventType !== "card.played" || !isRecord(payload.event) || payload.event.playerId !== player.id || payload.event.definitionId !== KIYOHIME_SAMADHI_ID) return;
  const instanceId = typeof payload.event.instanceId === "string" ? payload.event.instanceId : undefined;
  const source = instanceId ? state.cards[instanceId] : activeOwnedSkill(state, player, KIYOHIME_SAMADHI_ID, definitions);
  if (!source || source.zone !== "attack" || !source.active) return;
  if (player.flags.infiniteMana !== true && player.mana < 3) return;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${KIYOHIME_SAMADHI_ID}:twin-flames`;
  state.effectQueue.unshift({ effectId, handlerId: KIYOHIME_SAMADHI_RESOLVE, sourceId: KIYOHIME_SAMADHI_ID, controllerPlayerId: player.id, payload: { sourceInstanceId: source.instanceId }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "kiyohime-twin-flames",
    options: [{ id: "skip", label: "不支付3魔力" }, { id: "pay", label: "支付3魔力" }], min: 1, max: 1, allowCancel: false,
    continuationEffectId: effectId, submissions: {},
  });
};

export const resolveKiyohimeSamadhi: SkillHandler = ({ state, player, payload }) => {
  const { previous, selection } = resolved(payload);
  const sourceInstanceId = typeof previous.sourceInstanceId === "string" ? previous.sourceInstanceId : undefined;
  const source = sourceInstanceId ? state.cards[sourceInstanceId] : undefined;
  if (!source || source.zone !== "attack" || (selection !== "skip" && selection !== "pay")) throw new Error("KIYOHIME_SAMADHI_DECISION_INVALID");
  if (selection === "skip") return { paid: false };
  payMana(player, 3);
  player.flags.magicPowerReductionProtectedRound = state.round;
  source.residual = true;
  source.residualUntilRound = Math.max(Number(source.residualUntilRound ?? 0), state.round + 1);
  return { paid: true, sourceInstanceId, residualUntilRound: source.residualUntilRound };
};
