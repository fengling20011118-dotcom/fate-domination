import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { assertCommandSealCostPayable, payCommandSealCost, payRulerSealCost } from "./command-seals.ts";
import type { CardDefinition } from "./content-types.ts";
import { movePlayerCard } from "./decks.ts";
import {
  canUseRulerSealCommand,
  openRulerSealCommand,
  resolveRulerSealCommandEvent,
} from "./ruler-seal-command.ts";
import { grantRulerSeal, listRulerSealsControlledBy, listRulerSealsOnPlayer } from "./ruler-seals.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const MARTHA_DIVINE_OBEDIENCE_ID = "servant.martha.skill.sc-martha-1";
export const MARTHA_TARASQUE_ID = "servant.martha.skill.sc-martha-2";
export const MARTHA_RULER_SEAL_ID = "servant.martha.skill.sc-martha-4";

export const MARTHA_DIVINE_OBEDIENCE_HANDLER = "core.martha-divine-obedience";
export const MARTHA_TARASQUE_HANDLER = "core.martha-tarasque";
export const MARTHA_VOW_RESOLVE = "core.martha-saints-vow-resolve";
export const MARTHA_TARASQUE_RESOLVE = "core.martha-tarasque-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function activeOwnedSkillCard(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return player.attack
    .map((instanceId) => state.cards[instanceId])
    .find((card) => {
      const definition = card ? definitions[card.definitionId] : undefined;
      return Boolean(card && definition && card.ownerPlayerId === player.id && card.active && card.face === "up"
        && (card.definitionId === skillId || definition.linkedSkillId === skillId));
    });
}

function sameLocationOpponentIds(state: GameState, player: PlayerState): string[] {
  if (!player.locationId) return [];
  return (state.board.locations[player.locationId] ?? [])
    .filter((playerId) => playerId !== player.id && Boolean(state.players[playerId]) && !state.players[playerId].eliminated);
}

function luckHandIds(state: GameState, player: PlayerState): string[] {
  return player.hand.filter((instanceId) => state.cards[instanceId]?.definitionId === "card.cardluck");
}

function openDecisionFrame(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  handlerId: string,
  stage: string,
  payload: Record<string, unknown>,
  options: Array<{ id: string; label: string; instanceId?: string }>,
  openDecision: SkillContext["openDecision"],
  chooserPlayerId = player.id,
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId,
    sourceId,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: chooserPlayerId,
    chooserPlayerIds: [chooserPlayerId],
    kind: stage,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function resolvedDecision(payload: unknown, error: string): { previous: Record<string, unknown>; selections: string[] } {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error(error);
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections)
    ? decision.selections.filter((value): value is string => typeof value === "string")
    : [];
  if (decision.status !== "resolved" || selections.length !== 1 || selections.length !== decision.selections.length) throw new Error(error);
  return { previous: payload.previous, selections };
}

function grantMarthaSelfSeal(state: GameState, player: PlayerState): { sealId: string; boundPlayerId: string } {
  const seal = grantRulerSeal(state, player.id, player.id, MARTHA_DIVINE_OBEDIENCE_ID, { allowSelf: true });
  return { sealId: seal.sealId, boundPlayerId: player.id };
}

function openSaintsVowMode(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const canGiveOther = luckHandIds(state, player).length > 0 && sameLocationOpponentIds(state, player).length > 0;
  const options = [{ id: "self", label: "自己获得一枚裁决者令咒" }];
  if (canGiveOther) options.push({ id: "other", label: "移除幸运，让同地点另一名玩家获得裁决者令咒" });
  openDecisionFrame(state, player, MARTHA_DIVINE_OBEDIENCE_ID, MARTHA_VOW_RESOLVE, "martha-saints-vow-mode", {}, options, openDecision);
}

/** Divine Obedience: Saint's Vow plus use of Martha-controlled Ruler Seals. */
export const useMarthaDivineObedience: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("MARTHA_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType) return resolveRulerSealCommandEvent(state, player, payload, definitions);
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
  if (abilityId === "ruler-seal-command") return openRulerSealCommand(state, player, skill.id, openDecision, abilityId, definitions);
  if (abilityId !== "saints-vow" || state.phase !== "combat" || state.activePlayerId !== player.id
    || listRulerSealsOnPlayer(state, player.id).length > 0
    || !activeOwnedSkillCard(state, player, MARTHA_DIVINE_OBEDIENCE_ID, definitions)) {
    throw new Error("MARTHA_SAINTS_VOW_FORBIDDEN");
  }
  openSaintsVowMode(state, player, definitions, openDecision);
};

export const resolveMarthaSaintsVow: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("MARTHA_DEFINITIONS_REQUIRED");
  const { previous, selections } = resolvedDecision(payload, "MARTHA_SAINTS_VOW_DECISION_INVALID");
  const stage = previous.stage;
  if (stage === "martha-saints-vow-mode") {
    if (selections[0] === "self") return grantMarthaSelfSeal(state, player);
    if (selections[0] !== "other") throw new Error("MARTHA_SAINTS_VOW_DECISION_INVALID");
    const luckIds = luckHandIds(state, player);
    const targets = sameLocationOpponentIds(state, player);
    if (luckIds.length === 0 || targets.length === 0) throw new Error("MARTHA_SAINTS_VOW_OTHER_UNAVAILABLE");
    openDecisionFrame(
      state,
      player,
      MARTHA_DIVINE_OBEDIENCE_ID,
      MARTHA_VOW_RESOLVE,
      "martha-saints-vow-luck",
      { targetPlayerIds: targets },
      luckIds.map((instanceId) => ({ id: instanceId, instanceId, label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId })),
      openDecision,
    );
    return;
  }
  if (stage === "martha-saints-vow-luck") {
    const luckId = selections[0];
    if (!luckHandIds(state, player).includes(luckId)) throw new Error("MARTHA_SAINTS_VOW_LUCK_INVALID");
    const targetPlayerIds = Array.isArray(previous.targetPlayerIds)
      ? previous.targetPlayerIds.filter((value): value is string => typeof value === "string" && sameLocationOpponentIds(state, player).includes(value))
      : [];
    if (targetPlayerIds.length === 0) throw new Error("MARTHA_SAINTS_VOW_TARGET_UNAVAILABLE");
    openDecisionFrame(
      state,
      player,
      MARTHA_DIVINE_OBEDIENCE_ID,
      MARTHA_VOW_RESOLVE,
      "martha-saints-vow-target",
      { luckId, targetPlayerIds },
      targetPlayerIds.map((playerId) => ({ id: playerId, label: state.players[playerId].name })),
      openDecision,
    );
    return;
  }
  if (stage === "martha-saints-vow-target") {
    const luckId = typeof previous.luckId === "string" ? previous.luckId : undefined;
    const targetPlayerIds = Array.isArray(previous.targetPlayerIds)
      ? previous.targetPlayerIds.filter((value): value is string => typeof value === "string")
      : [];
    const targetPlayerId = selections[0];
    if (!luckId || !luckHandIds(state, player).includes(luckId)
      || !targetPlayerIds.includes(targetPlayerId) || !sameLocationOpponentIds(state, player).includes(targetPlayerId)) {
      throw new Error("MARTHA_SAINTS_VOW_TARGET_INVALID");
    }
    movePlayerCard(state, player.id, luckId, "removed");
    const seal = grantRulerSeal(state, player.id, targetPlayerId, MARTHA_DIVINE_OBEDIENCE_ID);
    return { removedLuckInstanceId: luckId, sealId: seal.sealId, boundPlayerId: targetPlayerId };
  }
  throw new Error("MARTHA_SAINTS_VOW_STAGE_INVALID");
};

function normalSealCostAvailable(state: GameState, player: PlayerState): boolean {
  try {
    assertCommandSealCostPayable(state, player.id, 1);
    return true;
  } catch {
    return false;
  }
}

function applyTarasqueEffect(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  payment: { type: "normal" } | { type: "ruler"; sealId: string },
): { payment: string; targetInstanceId: string; forcedPlayerIds: string[] } {
  const tarasque = activeOwnedSkillCard(state, player, MARTHA_TARASQUE_ID, definitions);
  if (!tarasque) throw new Error("MARTHA_TARASQUE_NOT_ACTIVE");
  if (payment.type === "normal") payCommandSealCost(state, player.id, 1);
  else payRulerSealCost(state, player.id, payment.sealId);
  const modifierId = `${MARTHA_TARASQUE_ID}:meteor:${tarasque.instanceId}:${state.round}`;
  if (!(player.cardRuleModifiers ?? []).some((modifier) => modifier.id === modifierId)) {
    addCardRuleModifier(player, {
      id: modifierId,
      sourceId: MARTHA_TARASQUE_ID,
      sourceInstanceId: tarasque.instanceId,
      targetDefinitionIds: [tarasque.definitionId, MARTHA_TARASQUE_ID],
      targetInstanceIds: [tarasque.instanceId],
      powerAdd: 4,
      duration: "round",
    });
  }
  const forcedPlayerIds = sameLocationOpponentIds(state, player);
  for (const playerId of forcedPlayerIds) {
    const target = state.players[playerId];
    target.flags.forcedDeploymentRound = state.round + 1;
    target.flags.forcedDeploymentLocationId = "workshop";
  }
  return {
    payment: payment.type === "normal" ? "command-seal" : `ruler-seal:${payment.sealId}`,
    targetInstanceId: tarasque.instanceId,
    forcedPlayerIds,
  };
}

/** Tarasque: pay one ordinary/Ruler Seal, +4 itself, and force engaged opponents toward Workshop next Outpost. */
export const useMarthaTarasque: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || state.phase !== "combat" || state.activePlayerId !== player.id
    || !activeOwnedSkillCard(state, player, MARTHA_TARASQUE_ID, definitions)) {
    throw new Error("MARTHA_TARASQUE_FORBIDDEN");
  }
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== "leviathan-child") throw new Error("MARTHA_TARASQUE_ABILITY_INVALID");
  const options: Array<{ id: string; label: string }> = [];
  if (normalSealCostAvailable(state, player)) options.push({ id: "normal", label: "支付一枚令咒" });
  for (const seal of listRulerSealsControlledBy(state, player.id)) {
    options.push({ id: `ruler:${seal.sealId}`, label: `支付裁决者令咒（${state.players[seal.boundPlayerId]?.name ?? seal.boundPlayerId}）` });
  }
  if (options.length === 0) throw new Error("MARTHA_TARASQUE_SEAL_REQUIRED");
  if (options.length === 1) {
    const selected = options[0].id;
    return selected === "normal"
      ? applyTarasqueEffect(state, player, definitions, { type: "normal" })
      : applyTarasqueEffect(state, player, definitions, { type: "ruler", sealId: selected.slice("ruler:".length) });
  }
  openDecisionFrame(
    state,
    player,
    skill.id,
    MARTHA_TARASQUE_RESOLVE,
    "martha-tarasque-payment",
    { paymentIds: options.map((option) => option.id) },
    options,
    openDecision,
  );
};

export const resolveMarthaTarasque: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("MARTHA_DEFINITIONS_REQUIRED");
  const { previous, selections } = resolvedDecision(payload, "MARTHA_TARASQUE_PAYMENT_INVALID");
  const paymentIds = Array.isArray(previous.paymentIds) ? previous.paymentIds.filter((value): value is string => typeof value === "string") : [];
  const selected = selections[0];
  if (previous.stage !== "martha-tarasque-payment" || !paymentIds.includes(selected)) throw new Error("MARTHA_TARASQUE_PAYMENT_INVALID");
  if (selected === "normal") {
    if (!normalSealCostAvailable(state, player)) throw new Error("MARTHA_TARASQUE_PAYMENT_STALE");
    return applyTarasqueEffect(state, player, definitions, { type: "normal" });
  }
  if (!selected.startsWith("ruler:")) throw new Error("MARTHA_TARASQUE_PAYMENT_INVALID");
  const sealId = selected.slice("ruler:".length);
  if (!listRulerSealsControlledBy(state, player.id).some((seal) => seal.sealId === sealId)) throw new Error("MARTHA_TARASQUE_PAYMENT_STALE");
  return applyTarasqueEffect(state, player, definitions, { type: "ruler", sealId });
};

export const isMarthaDivineObedienceLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !ability || state.activePlayerId !== playerId) return false;
  if (ability.id === "ruler-seal-command") return state.phase === "action" && canUseRulerSealCommand(state, playerId);
  if (ability.id !== "saints-vow") return false;
  return state.phase === "combat"
    && listRulerSealsOnPlayer(state, playerId).length === 0
    && Boolean(activeOwnedSkillCard(state, player, skill.id, definitions));
};

export const isMarthaTarasqueLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "leviathan-child"
    && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkillCard(state, player, skill.id, definitions)
    && (normalSealCostAvailable(state, player) || listRulerSealsControlledBy(state, playerId).length > 0));
};
