import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { createDerivedCardInstance } from "./decks.ts";
import { movePlayerByEffect } from "./board.ts";
import { spendRulerCommandSeal } from "./command-seals.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { gainVictoryPoints } from "./resources.ts";
import { getStructuredVictoryPointGainForSource } from "./rule-modifiers.ts";
import {
  armRulerSealWinReward,
  expireRulerSealWinRewardsAfterRound,
  listRulerSealsControlledBy,
  resolveRulerSealWinRewardsForController,
} from "./ruler-seals.ts";
import type { SkillContext, SkillHandler } from "./skill-types.ts";

export const RULER_SEAL_COMMAND_RESOLVE = "core.ruler-seal-command-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export interface RulerSealCommandProfile {
  maxActions: 1 | 2;
  moveToControllerBattlefieldOnly: boolean;
  topAction: "move" | "game-outside-avenger";
}

const DEFAULT_RULER_SEAL_PROFILE: RulerSealCommandProfile = {
  maxActions: 1,
  moveToControllerBattlefieldOnly: false,
  topAction: "move",
};

export function getRulerSealCommandProfile(
  state: GameState,
  player: PlayerState,
  definitions?: Record<string, CardDefinition>,
): RulerSealCommandProfile {
  if (!definitions) return { ...DEFAULT_RULER_SEAL_PROFILE };
  const activeDefinitions = player.attack.map((instanceId) => state.cards[instanceId]).filter((card) => card?.active && card.face === "up")
    .map((card) => definitions[card.definitionId]).filter((definition): definition is CardDefinition => Boolean(definition));
  const globalAvengerReplacement = Object.values(state.players).some((candidate) =>
    candidate.trueNameRevealed === true && candidate.flags.rulerSealGlobalAvengerAction === true);
  return {
    maxActions: activeDefinitions.some((definition) => definition.tags?.includes("ruler-seal-double-action")) ? 2 : 1,
    moveToControllerBattlefieldOnly: activeDefinitions.some((definition) => definition.tags?.includes("ruler-seal-move-controller-battlefield")),
    topAction: globalAvengerReplacement ? "game-outside-avenger" : "move",
  };
}

function openModeDecision(
  state: GameState,
  player: PlayerState,
  sourceSkillId: string,
  sealId: string,
  boundPlayerId: string,
  openDecision: SkillContext["openDecision"],
  profile: RulerSealCommandProfile,
): void {
  const moveAllowed = !profile.moveToControllerBattlefieldOnly
    || ((player.locationId === "mountain" || player.locationId === "city") && state.players[boundPlayerId]?.locationId !== player.locationId);
  const topActionOptions = profile.topAction === "game-outside-avenger"
    ? [{ id: "avenger", label: "从游戏外将【复仇者职阶卡】加入攻击" }]
    : (moveAllowed ? [{ id: "move", label: "移动至战场" }] : []);
  const options = [
    ...topActionOptions,
    { id: "lock", label: "本回合无法移动" },
    { id: "free-play", label: "免费打出一张手牌" },
  ];
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceSkillId}:ruler-seal-mode:${sealId}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: RULER_SEAL_COMMAND_RESOLVE,
    sourceId: sourceSkillId,
    controllerPlayerId: player.id,
    payload: { stage: "mode", sealId, boundPlayerId, sourceSkillId, ...profile },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "ruler-seal-command-mode",
    options,
    min: 1,
    max: Math.min(profile.maxActions, options.length),
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

/**
 * Open the shared Ruler Seal command flow. Each physical seal is consumed by
 * the command itself, so the synthetic skill usage record must not prevent a
 * controller from using another seal in the same round.
 */
export function openRulerSealCommand(
  state: GameState,
  player: PlayerState,
  sourceSkillId: string,
  openDecision: SkillContext["openDecision"],
  abilityId = "ruler-seal-command",
  definitions?: Record<string, CardDefinition>,
  sealSourceId?: string,
): void {
  const seals = listRulerSealsControlledBy(state, player.id)
    .filter((seal) => sealSourceId === undefined || seal.sourceId === sealSourceId);
  if (seals.length === 0) throw new Error("RULER_SEAL_NOT_AVAILABLE");
  const profile = getRulerSealCommandProfile(state, player, definitions);
  delete player.usage[`${sourceSkillId}:${abilityId}`];
  if (seals.length === 1) {
    openModeDecision(state, player, sourceSkillId, seals[0].sealId, seals[0].boundPlayerId, openDecision, profile);
    return;
  }
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceSkillId}:select-ruler-seal`;
  state.effectQueue.unshift({
    effectId,
    handlerId: RULER_SEAL_COMMAND_RESOLVE,
    sourceId: sourceSkillId,
    controllerPlayerId: player.id,
    payload: { stage: "select", sealIds: seals.map((seal) => seal.sealId), sourceSkillId, ...profile },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "ruler-seal-select",
    options: seals.map((seal) => ({ id: seal.sealId, label: state.players[seal.boundPlayerId]?.name ?? seal.boundPlayerId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

export function canUseRulerSealCommand(state: GameState, playerId: string, sealSourceId?: string): boolean {
  const player = state.players[playerId];
  return Boolean(player && !player.eliminated && listRulerSealsControlledBy(state, playerId)
    .some((seal) => sealSourceId === undefined || seal.sourceId === sealSourceId));
}

export const resolveRulerSealCommand: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("RULER_SEAL_COMMAND_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections)
    ? decision.selections.filter((id): id is string => typeof id === "string")
    : [];
  if (decision.status !== "resolved" || selections.length !== decision.selections.length) {
    throw new Error("RULER_SEAL_COMMAND_DECISION_INVALID");
  }
  const sourceSkillId = typeof previous.sourceSkillId === "string" ? previous.sourceSkillId : undefined;
  if (!sourceSkillId) throw new Error("RULER_SEAL_COMMAND_SOURCE_REQUIRED");
  const profile: RulerSealCommandProfile = {
    maxActions: previous.maxActions === 2 ? 2 : 1,
    moveToControllerBattlefieldOnly: previous.moveToControllerBattlefieldOnly === true,
    topAction: previous.topAction === "game-outside-avenger" ? "game-outside-avenger" : "move",
  };

  if (previous.stage === "select") {
    const sealIds = Array.isArray(previous.sealIds) ? previous.sealIds.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !sealIds.includes(selections[0])) throw new Error("RULER_SEAL_SELECTION_INVALID");
    const seal = listRulerSealsControlledBy(state, player.id).find((candidate) => candidate.sealId === selections[0]);
    if (!seal) throw new Error("RULER_SEAL_NOT_AVAILABLE");
    openModeDecision(state, player, sourceSkillId, seal.sealId, seal.boundPlayerId, openDecision, profile);
    return;
  }

  if (previous.stage === "mode") {
    const sealId = typeof previous.sealId === "string" ? previous.sealId : undefined;
    const boundPlayerId = typeof previous.boundPlayerId === "string" ? previous.boundPlayerId : undefined;
    const allowedModes = new Set(["move", "avenger", "lock", "free-play"]);
    if (!sealId || !boundPlayerId || selections.length < 1 || selections.length > profile.maxActions
      || new Set(selections).size !== selections.length || selections.some((mode) => !allowedModes.has(mode))) {
      throw new Error("RULER_SEAL_MODE_INVALID");
    }
    const seal = listRulerSealsControlledBy(state, player.id)
      .find((candidate) => candidate.sealId === sealId && candidate.boundPlayerId === boundPlayerId);
    if (!seal) throw new Error("RULER_SEAL_NOT_AVAILABLE");
    if (selections.includes("avenger") && profile.topAction !== "game-outside-avenger") throw new Error("RULER_SEAL_MODE_INVALID");
    if (selections.includes("move") && profile.topAction !== "move") throw new Error("RULER_SEAL_MODE_INVALID");
    if (selections.includes("move") && profile.moveToControllerBattlefieldOnly
      && (player.locationId !== "mountain" && player.locationId !== "city")) throw new Error("RULER_SEAL_MOVE_DESTINATION_INVALID");
    spendRulerCommandSeal(state, player.id, sealId);

    if (selections.includes("avenger")) {
      const instanceId = `ruler-avenger:${player.id}:${state.round}:${sealId}`;
      if (state.cards[instanceId]) throw new Error("RULER_SEAL_AVENGER_DUPLICATE");
      createDerivedCardInstance(state, player.id, {
        instanceId,
        definitionId: "card.x-avenger",
        zone: "attack",
        face: "up",
        active: true,
        sourceEffectId: sourceSkillId,
        createdByPlayerId: player.id,
      });
    }

    if (selections.includes("lock")) state.players[boundPlayerId].flags.movementBlockedRound = state.round;

    if (selections.includes("move")) {
      if (profile.moveToControllerBattlefieldOnly) {
        if (state.players[boundPlayerId].locationId === player.locationId) throw new Error("RULER_SEAL_MOVE_DESTINATION_INVALID");
        const movement = movePlayerByEffect(state, boundPlayerId, player.locationId!, definitions);
        emitEvent?.("player.moved", { playerId: boundPlayerId, ...movement, sourceId: sourceSkillId });
        emitEvent?.("player.entered-location", { playerId: boundPlayerId, ...movement, method: "effect", sourceId: sourceSkillId });
      } else {
        if (selections.length !== 1) throw new Error("RULER_SEAL_MULTI_ACTION_MOVE_PROFILE_INVALID");
        const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceSkillId}:ruler-seal-move:${boundPlayerId}`;
        state.effectQueue.unshift({
          effectId,
          handlerId: RULER_SEAL_COMMAND_RESOLVE,
          sourceId: sourceSkillId,
          controllerPlayerId: player.id,
          payload: { stage: "move", boundPlayerId, sourceSkillId },
          createdAtRevision: state.revision,
        });
        openDecision({
          decisionId: `${effectId}:decision`,
          ownerPlayerId: player.id,
          chooserPlayerIds: [player.id],
          kind: "ruler-seal-move-location",
          options: [{ id: "mountain", label: "深山町" }, { id: "city", label: "新都" }],
          min: 1,
          max: 1,
          allowCancel: false,
          continuationEffectId: effectId,
          submissions: {},
        });
        return;
      }
    }

    if (!selections.includes("free-play")) return { modes: selections, boundPlayerId };
    armRulerSealWinReward(state, player.id, boundPlayerId, seal.sourceId, 2);
    const target = state.players[boundPlayerId];
    const candidates = [...target.hand];
    if (candidates.length === 0) return { modes: selections, boundPlayerId, playedInstanceId: null };
    const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceSkillId}:ruler-seal-free-play:${boundPlayerId}`;
    state.effectQueue.unshift({
      effectId,
      handlerId: RULER_SEAL_COMMAND_RESOLVE,
      sourceId: sourceSkillId,
      controllerPlayerId: player.id,
      payload: { stage: "free-play", boundPlayerId, candidates, sourceSkillId, selectedModes: selections },
      createdAtRevision: state.revision,
    });
    openDecision({
      decisionId: `${effectId}:decision`,
      ownerPlayerId: boundPlayerId,
      chooserPlayerIds: [boundPlayerId],
      kind: "ruler-seal-free-play-card",
      options: candidates.map((instanceId) => ({
        id: instanceId,
        label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId,
      })),
      min: 0,
      max: 1,
      allowCancel: false,
      continuationEffectId: effectId,
      submissions: {},
    });
    return;
  }

  if (previous.stage === "move") {
    const boundPlayerId = typeof previous.boundPlayerId === "string" ? previous.boundPlayerId : undefined;
    if (!boundPlayerId || selections.length !== 1 || (selections[0] !== "mountain" && selections[0] !== "city")) {
      throw new Error("RULER_SEAL_MOVE_INVALID");
    }
    const movement = movePlayerByEffect(state, boundPlayerId, selections[0], definitions);
    emitEvent?.("player.moved", { playerId: boundPlayerId, ...movement, sourceId: sourceSkillId });
    emitEvent?.("player.entered-location", { playerId: boundPlayerId, ...movement, method: "effect", sourceId: sourceSkillId });
    return { boundPlayerId, ...movement };
  }

  if (previous.stage === "free-play") {
    const boundPlayerId = typeof previous.boundPlayerId === "string" ? previous.boundPlayerId : undefined;
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!boundPlayerId || selections.length > 1
      || selections.some((id) => !candidates.includes(id) || !state.players[boundPlayerId]?.hand.includes(id))) {
      throw new Error("RULER_SEAL_FREE_PLAY_INVALID");
    }
    if (selections.length === 0) return { boundPlayerId, playedInstanceId: null };
    const instanceId = selections[0];
    const result = addCardToAttack(state, boundPlayerId, instanceId, definitions, {
      payCost: false,
      allowedSourceZones: ["hand"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
    });
    const definition = definitions[state.cards[instanceId].definitionId];
    emitEvent?.("card.played", {
      playerId: boundPlayerId,
      instanceId,
      definitionId: definition.id,
      face: "up",
      paidMana: 0,
      attributes: getCardAttributes(definition),
      method: "ruler-seal",
    });
    emitEvent?.("card.used", {
      playerId: boundPlayerId,
      instanceId,
      definitionId: definition.id,
      locationId: state.players[boundPlayerId].locationId,
      attributes: getCardAttributes(definition),
      method: "ruler-seal",
    });
    return { boundPlayerId, playedInstanceId: instanceId, paidMana: result.paidMana };
  }

  throw new Error("RULER_SEAL_COMMAND_STAGE_INVALID");
};

/** Resolve delayed +2 VP rewards and round-end cleanup shared by every Ruler Seal source. */
export function resolveRulerSealCommandEvent(
  state: GameState,
  player: PlayerState,
  payload: unknown,
  definitions: Record<string, CardDefinition>,
  sourceId?: string,
): { rewardAmount: number; rewardIds: string[] } | undefined {
  if (!isRecord(payload) || typeof payload.eventType !== "string") return undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (payload.eventType === "combat.resolved") {
    const powers = isRecord(event.powers) ? event.powers : {};
    const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
    const rewards = resolveRulerSealWinRewardsForController(state, player.id, Object.keys(powers), winnerIds, sourceId);
    const rawAmount = player.flags.rulerSealVictoryPointGainBlocked === true
      ? 0
      : rewards.reduce((sum, reward) => sum + reward.amount, 0);
    const amount = getStructuredVictoryPointGainForSource(state, player.id, definitions, "command_seal", rawAmount);
    if (amount > 0) gainVictoryPoints(player, amount);
    return { rewardAmount: amount, rewardIds: rewards.map((reward) => reward.rewardId) };
  }
  if (payload.eventType === "round.ending") {
    expireRulerSealWinRewardsAfterRound(state, state.round);
    return { rewardAmount: 0, rewardIds: [] };
  }
  return undefined;
}
