import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { payCommandSealCost, payRulerSealCost } from "./command-seals.ts";
import { removeControlledCardFromGame } from "./decks.ts";
import { listRulerSealsControlledBy } from "./ruler-seals.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const MORGAN_END_WORLD_ID = "servant.morgan.skill.sc-morgan-1";
export const MORGAN_INFINITY_ID = "servant.morgan.skill.sc-morgan-2";
export const MORGAN_END_WORLD_HANDLER = "core.morgan-end-of-world";
export const MORGAN_INFINITY_HANDLER = "core.morgan-infinity-mirror";
export const MORGAN_INFINITY_RESOLVE = "core.morgan-infinity-mirror-resolve";

const END_WORLD_COUNT_FLAG = "morganEndWorldRemovedCount";
const INFINITY_ROUND_FLAG = "morganInfinityMirrorRound";
const CLASS_SOURCE_FLAG = "servantClassRuleSource";
const CLASS_ROUND_FLAG = "servantClassRuleRound";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function controlledActiveNoblePhantasmIds(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || card.controllerPlayerId !== player.id || card.zone !== "attack" || !card.active || card.face !== "up") return false;
    return getCardInstanceAttributes(card, definition, state, definitions).includes("宝具");
  });
}

function finishForMorgan(state: GameState, player: PlayerState, emitEvent?: SkillContext["emitEvent"]): void {
  state.modeState.instantVictoryIds = [player.id];
  state.modeState.instantVictoryReason = MORGAN_END_WORLD_ID;
  state.status = "finished";
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  emitEvent?.("game.finished", {
    round: state.round,
    winnerIds: [player.id],
    reason: MORGAN_END_WORLD_ID,
    sourceSkillId: MORGAN_END_WORLD_ID,
  });
}

/** End of the World persists by Morgan identity even if its physical card is removed or suppressed. */
export const useMorganEndOfWorld: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || payload.eventType !== "combat.resolved" || !isRecord(payload.event)) return;
  const winnerIds = Array.isArray(payload.event.winnerIds)
    ? payload.event.winnerIds.filter((id): id is string => typeof id === "string")
    : [];
  if (player.servantId !== skill.ownerId || !winnerIds.includes(player.id)) return;

  const removedInstanceIds = controlledActiveNoblePhantasmIds(state, player, definitions);
  for (const instanceId of removedInstanceIds) removeControlledCardFromGame(state, player.id, instanceId);
  const prior = Number(player.flags[END_WORLD_COUNT_FLAG] ?? 0);
  if (!Number.isInteger(prior) || prior < 0) throw new Error("MORGAN_END_WORLD_COUNT_INVALID");
  const total = prior + removedInstanceIds.length;
  player.flags[END_WORLD_COUNT_FLAG] = total;
  if (prior < 7 && total >= 7) finishForMorgan(state, player, emitEvent);
  return { removedInstanceIds, removedCount: removedInstanceIds.length, totalRemoved: total, wonGame: total >= 7 };
};

type InfinityPayment = { id: string; kind: "command" | "ruler"; sealId?: string };

function infinityPayments(state: GameState, player: PlayerState): InfinityPayment[] {
  const result: InfinityPayment[] = [];
  const draft = structuredClone(state) as GameState;
  try {
    payCommandSealCost(draft, player.id, 1);
    result.push({ id: "command", kind: "command" });
  } catch {
    // Ordinary seal payment is unavailable; Ruler Seals may still be payable.
  }
  for (const seal of listRulerSealsControlledBy(state, player.id)) {
    result.push({ id: `ruler:${seal.sealId}`, kind: "ruler", sealId: seal.sealId });
  }
  return result;
}

function infinityTargetDefinitionIds(definitions: Record<string, CardDefinition>): string[] {
  return Object.values(definitions)
    .filter((definition) => definition.cardType === "attack"
      && (getCardAttributes(definition).includes("魔术") || definition.id === "card.cardpreparation"))
    .map((definition) => definition.id);
}

function clearMorganClassOverride(player: PlayerState): void {
  if (player.flags[CLASS_SOURCE_FLAG] !== MORGAN_INFINITY_ID) return;
  delete player.flags.servantClassRule;
  delete player.flags[CLASS_SOURCE_FLAG];
  delete player.flags[CLASS_ROUND_FLAG];
}

function applyInfinityMirror(
  state: GameState,
  player: PlayerState,
  payment: InfinityPayment,
  definitions: Record<string, CardDefinition>,
) {
  if (payment.kind === "command") payCommandSealCost(state, player.id, 1);
  else if (payment.sealId) payRulerSealCost(state, player.id, payment.sealId);
  else throw new Error("MORGAN_INFINITY_PAYMENT_INVALID");

  player.flags.servantClassRule = "berserker";
  player.flags[CLASS_SOURCE_FLAG] = MORGAN_INFINITY_ID;
  player.flags[CLASS_ROUND_FLAG] = state.round;
  player.flags[INFINITY_ROUND_FLAG] = state.round;
  const modifierId = `${MORGAN_INFINITY_ID}:round:${state.round}`;
  if (!(player.cardRuleModifiers ?? []).some((modifier) => modifier.id === modifierId)) {
    addCardRuleModifier(player, {
      id: modifierId,
      sourceId: MORGAN_INFINITY_ID,
      targetDefinitionIds: infinityTargetDefinitionIds(definitions),
      grantAttributes: ["宝具"],
      powerAdd: 3,
      duration: "round",
    });
  }
  return { payment: payment.kind, sealId: payment.sealId ?? null, class: "berserker", modifierId };
}

function openInfinityPaymentDecision(
  state: GameState,
  player: PlayerState,
  payments: InfinityPayment[],
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${MORGAN_INFINITY_ID}:payment`;
  state.effectQueue.unshift({
    effectId,
    handlerId: MORGAN_INFINITY_RESOLVE,
    sourceId: MORGAN_INFINITY_ID,
    controllerPlayerId: player.id,
    payload: { stage: "payment", candidateIds: payments.map((payment) => payment.id) },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "morgan-infinity-mirror-payment",
    options: payments.map((payment) => ({
      id: payment.id,
      label: payment.kind === "command" ? "支付1枚令咒" : `支付裁决者令咒 ${payment.sealId}`,
    })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

export const useMorganInfinityMirror: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("MORGAN_INFINITY_CONTEXT_REQUIRED");
  if (payload.eventType === "round.ending") {
    if (Number(player.flags[INFINITY_ROUND_FLAG] ?? -1) !== state.round) return;
    clearMorganClassOverride(player);
    return { clearedClass: true };
  }
  if (payload.abilityId !== "infinity-mirror" || state.phase !== "outpost" || state.activePlayerId !== player.id) {
    throw new Error("MORGAN_INFINITY_WINDOW_INVALID");
  }
  const payments = infinityPayments(state, player);
  if (payments.length === 0) throw new Error("MORGAN_INFINITY_PAYMENT_UNAVAILABLE");
  const requested = typeof payload.paymentId === "string" ? payments.find((payment) => payment.id === payload.paymentId) : undefined;
  if (requested) return applyInfinityMirror(state, player, requested, definitions);
  if (payments.length === 1) return applyInfinityMirror(state, player, payments[0], definitions);
  openInfinityPaymentDecision(state, player, payments, openDecision);
  return { pending: true, paymentIds: payments.map((payment) => payment.id) };
};

export const resolveMorganInfinityMirror: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("MORGAN_INFINITY_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  const candidates = Array.isArray(previous.candidateIds) ? previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  if (previous.stage !== "payment" || decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) {
    throw new Error("MORGAN_INFINITY_DECISION_INVALID");
  }
  const payment = infinityPayments(state, player).find((candidate) => candidate.id === selections[0]);
  if (!payment) throw new Error("MORGAN_INFINITY_PAYMENT_UNAVAILABLE");
  return applyInfinityMirror(state, player, payment, definitions);
};

export const isMorganInfinityMirrorLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  return Boolean(player && ability?.id === "infinity-mirror" && state.phase === "outpost" && state.activePlayerId === playerId
    && infinityPayments(state, player).length > 0);
};
