import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardPlayCost, payManaCost } from "./costs.ts";
import { adjustVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const LUBU_RESTLESS_ID = "servant.lubu.skill.sc-lubu-1";
export const LUBU_DEFIANCE_ID = "servant.lubu.skill.sc-lubu-2";
export const LUBU_GOD_FORCE_ID = "servant.lubu.skill.sc-lubu-3";

export const LUBU_RESTLESS_HANDLER = "core.lubu-restless-soul";
export const LUBU_GOD_FORCE_HANDLER = "core.lubu-god-force";
export const LUBU_GOD_FORCE_RESOLVE = "core.lubu-god-force-resolve";

const FOUGHT_OPPONENT_ROUND_FLAG = "lubuFoughtOpponentRound";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function activeBasicAttackIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.basic === true && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up");
  });
}

function godForceTargetIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && definition.basic !== true && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up");
  });
}

function applyGodForce(
  state: GameState,
  player: PlayerState,
  targetInstanceId: string,
  definitions: Record<string, CardDefinition>,
): { targetInstanceId: string; paidMana: number; basePowerMultiplier: number } {
  if (!godForceTargetIds(state, player, definitions).includes(targetInstanceId)) throw new Error("LUBU_GOD_FORCE_TARGET_INVALID");
  const target = state.cards[targetInstanceId];
  const definition = definitions[target.definitionId];
  const paidMana = getCardPlayCost(state, definition, player, target, definitions);
  payManaCost(state, player, paidMana, definitions);
  if (paidMana > 0) player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + paidMana;
  const currentMultiplier = Number(target.basePowerMultiplier ?? 1);
  if (!Number.isInteger(currentMultiplier) || currentMultiplier < 1) throw new Error("CARD_BASE_POWER_MULTIPLIER_INVALID");
  target.basePowerMultiplier = currentMultiplier * 2;
  // English ruling: granting Once Per Game does not retroactively count the
  // target's already-resolved play/use. The next real play/use records it.
  target.usageLimitOverride = "once-per-game";
  return { targetInstanceId, paidMana, basePowerMultiplier: target.basePowerMultiplier };
}

function openGodForceDecision(
  state: GameState,
  player: PlayerState,
  candidates: string[],
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${LUBU_GOD_FORCE_ID}:target`;
  state.effectQueue.unshift({
    effectId,
    handlerId: LUBU_GOD_FORCE_RESOLVE,
    sourceId: LUBU_GOD_FORCE_ID,
    controllerPlayerId: player.id,
    payload: { candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "lubu-god-force-target",
    options: candidates.map((instanceId) => ({
      id: instanceId,
      instanceId,
      label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId,
    })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

/** Restless Soul: remember real multi-player combats, then retain all active basics only if none occurred this round. */
export const useLubuRestlessSoul: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) return;
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType === "combat.resolved") {
    const participants = Array.isArray(event.participantIds)
      ? event.participantIds.filter((id): id is string => typeof id === "string")
      : [];
    if (participants.includes(player.id) && participants.some((id) => id !== player.id)) {
      player.flags[FOUGHT_OPPONENT_ROUND_FLAG] = state.round;
    }
    return;
  }
  if (eventType !== "round.ending" || Number(player.flags[FOUGHT_OPPONENT_ROUND_FLAG] ?? -1) === state.round) return;
  const retained = activeBasicAttackIds(state, player, definitions);
  for (const instanceId of retained) {
    const card = state.cards[instanceId];
    if (!card.residual) {
      card.residual = true;
      card.residualUntilRound = state.round + 1;
    } else if (Number.isInteger(card.residualUntilRound)) {
      card.residualUntilRound = Math.max(Number(card.residualUntilRound), state.round + 1);
    }
  }
  if (retained.length > 0) adjustVictoryPoints(player, -retained.length);
  return { retainedInstanceIds: retained, victoryPointsLost: retained.length };
};

/** God Force: pay one controlled non-basic attack's current cost, then permanently double its base power and grant OPG. */
export const useLubuGodForce: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("LUBU_GOD_FORCE_WINDOW_INVALID");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== "god-force") throw new Error("LUBU_GOD_FORCE_ABILITY_INVALID");
  const candidates = godForceTargetIds(state, player, definitions);
  if (candidates.length === 0) throw new Error("LUBU_GOD_FORCE_NO_TARGET");
  const selected = typeof data.targetInstanceId === "string" ? data.targetInstanceId : undefined;
  if (selected) return applyGodForce(state, player, selected, definitions);
  openGodForceDecision(state, player, candidates, definitions, openDecision);
};

export const resolveLubuGodForce: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("LUBU_GOD_FORCE_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const candidates = Array.isArray(previous.candidates)
    ? previous.candidates.filter((id): id is string => typeof id === "string")
    : [];
  const selections = Array.isArray(decision.selections)
    ? decision.selections.filter((id): id is string => typeof id === "string")
    : [];
  if (decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) {
    throw new Error("LUBU_GOD_FORCE_DECISION_INVALID");
  }
  return applyGodForce(state, player, selections[0], definitions);
};

export const isLubuGodForceLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== "god-force" || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  return godForceTargetIds(state, player, definitions).some((instanceId) => {
    const card = state.cards[instanceId];
    const definition = definitions[card.definitionId];
    try {
      const cost = getCardPlayCost(state, definition, player, card, definitions);
      return player.flags.infiniteMana === true || player.mana >= cost;
    } catch {
      return false;
    }
  });
};
