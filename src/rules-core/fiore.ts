import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { movePlayerOneSpaceByEffect } from "./board.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import type { CardDefinition } from "./content-types.ts";
import { createOwnedCardInstance, removePhysicalCardFromGame } from "./decks.ts";
import { adjustVictoryPoints, gainVictoryPoints, loseMana } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const FIORE_TRANSCEND_ID = "master.fiore.skill.s1a";
export const FIORE_NEUROMECHANICS_ID = "master.fiore.skill.s5";
export const FIORE_DETERMINATION_ID = "master.fiore.skill.s6";
export const FIORE_CLEVER_MIND_ID = "master.fiore.skill.s7";
export const FIORE_FULL_RECOVERY_ID = "master.fiore.skill.ascension";

export const FIORE_TRANSCEND_HANDLER = "core.fiore-transcend";
export const FIORE_TRANSCEND_RESOLVE = "core.fiore-transcend-resolve";
export const FIORE_NEUROMECHANICS_HANDLER = "core.fiore-neuromechanics";
export const FIORE_DETERMINATION_HANDLER = "core.fiore-determination";
export const FIORE_CLEVER_MIND_HANDLER = "core.fiore-clever-mind";
export const FIORE_FULL_RECOVERY_HANDLER = "core.fiore-full-recovery";

const TRANS_OUTPOST = "transcend-outpost";
const TRANS_ACTION = "transcend-action";
const NEURO_MOVE = "neuromechanics-move";
const NEURO_TERRAIN = "neuromechanics-terrain";
const CLEVER_REINFORCEMENT = "clever-mind-reinforcement";
const FULL_RECOVERY = "full-recovery";

type TranscendPair = "paralysis" | "gentle" | "circuit";
type TranscendMode = "outpost" | "action" | "ascension";

const pairSkillIds: Record<TranscendPair, string> = {
  paralysis: FIORE_NEUROMECHANICS_ID,
  gentle: FIORE_DETERMINATION_ID,
  circuit: FIORE_CLEVER_MIND_ID,
};

const pairRoundFlags: Record<TranscendPair, string> = {
  paralysis: "fioreParalysisTranscendedRound",
  gentle: "fioreGentleTranscendedRound",
  circuit: "fioreCircuitTranscendedRound",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPair(value: unknown): value is TranscendPair {
  return value === "paralysis" || value === "gentle" || value === "circuit";
}

function activeOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((instance) => {
    const definition = instance ? definitions[instance.definitionId] : undefined;
    return Boolean(instance && instance.ownerPlayerId === player.id && instance.controllerPlayerId === player.id
      && instance.zone === "attack" && instance.active && instance.face === "up"
      && (instance.definitionId === skillId || definition?.linkedSkillId === skillId));
  });
}

function pairIsActive(player: PlayerState, pair: TranscendPair, round: number): boolean {
  return Number(player.flags[pairRoundFlags[pair]] ?? Number.NEGATIVE_INFINITY) === round;
}

function determinationTargets(state: GameState, player: PlayerState): PlayerState[] {
  return Object.values(state.players).filter((candidate) => candidate.id !== player.id && !candidate.eliminated
    && candidate.victoryPoints > player.victoryPoints);
}

function availablePairs(state: GameState, player: PlayerState): TranscendPair[] {
  const result: TranscendPair[] = [];
  if (!pairIsActive(player, "paralysis", state.round)) result.push("paralysis");
  if (!pairIsActive(player, "gentle", state.round) && determinationTargets(state, player).length > 0) result.push("gentle");
  if (!pairIsActive(player, "circuit", state.round)) result.push("circuit");
  return result;
}

function grantEnhancedSkill(state: GameState, player: PlayerState, definitionId: string): CardInstance {
  const existing = [...player.masterSkills, ...player.attack, ...player.hand]
    .map((instanceId) => state.cards[instanceId])
    .find((instance) => instance?.ownerPlayerId === player.id && instance.definitionId === definitionId && instance.zone !== "removed");
  if (existing) return existing;
  const copyIndex = Object.values(state.cards).filter((card) => card.ownerPlayerId === player.id && card.definitionId === definitionId).length + 1;
  return createOwnedCardInstance(state, player.id, {
    instanceId: `${player.id}:fiore-transcend:${state.round}:${definitionId}:${copyIndex}`,
    definitionId,
    zone: "master-skills",
    face: "up",
    active: false,
    residual: false,
    temporary: true,
    temporaryCleanup: "explicit",
    createdByEffectId: `${FIORE_TRANSCEND_ID}:${state.round}`,
    createdByPlayerId: player.id,
  });
}

function applyTranscendPair(
  state: GameState,
  player: PlayerState,
  pair: TranscendPair,
  targetPlayerId?: string,
): { pair: TranscendPair; grantedInstanceId: string; targetPlayerId?: string } {
  if (!availablePairs(state, player).includes(pair)) throw new Error("FIORE_TRANSCEND_PAIR_UNAVAILABLE");
  if (pair === "gentle") {
    const target = determinationTargets(state, player).find((candidate) => candidate.id === targetPlayerId);
    if (!target) throw new Error("FIORE_DETERMINATION_TARGET_INVALID");
    player.flags.fioreDeterminationTargetId = target.id;
    player.flags.fioreDeterminationRound = state.round;
    delete player.flags.fioreDeterminationRewardedRound;
  }
  player.flags[pairRoundFlags[pair]] = state.round;
  if (pair === "paralysis") player.flags.movementLockedOwnActionCombat = false;
  else if (pair === "gentle") player.flags.fioreGentle = false;
  else delete player.flags.roundManaGainCap;
  const granted = grantEnhancedSkill(state, player, pairSkillIds[pair]);
  return { pair, grantedInstanceId: granted.instanceId, ...(targetPlayerId ? { targetPlayerId } : {}) };
}

function decisionOptions(state: GameState, player: PlayerState): Array<{ id: string; label: string }> {
  const options: Array<{ id: string; label: string }> = [];
  for (const pair of availablePairs(state, player)) {
    if (pair === "gentle") {
      for (const target of determinationTargets(state, player)) options.push({ id: `gentle:${target.id}`, label: `决意：${target.name}` });
    } else options.push({ id: pair, label: pair === "paralysis" ? "神经机械学" : "聪慧头脑" });
  }
  return options;
}

function openTranscendDecision(
  state: GameState,
  player: PlayerState,
  mode: TranscendMode,
  sourceSkillId: string,
  openDecision: SkillContext["openDecision"],
): { pending: true; optionCount: number } {
  const options = decisionOptions(state, player);
  if (options.length === 0) throw new Error("FIORE_TRANSCEND_NO_OPTION");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceSkillId}:${mode}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: FIORE_TRANSCEND_RESOLVE,
    sourceId: sourceSkillId,
    controllerPlayerId: player.id,
    payload: { mode, sourceSkillId },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "fiore-transcend",
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, optionCount: options.length };
}

function parseDecisionSelection(selection: string): { pair: TranscendPair; targetPlayerId?: string } {
  if (selection === "paralysis" || selection === "circuit") return { pair: selection };
  if (selection.startsWith("gentle:") && selection.length > "gentle:".length) return { pair: "gentle", targetPlayerId: selection.slice("gentle:".length) };
  throw new Error("FIORE_TRANSCEND_DECISION_INVALID");
}

function applyTranscendMode(
  state: GameState,
  player: PlayerState,
  mode: TranscendMode,
  pair: TranscendPair,
  targetPlayerId?: string,
): unknown {
  const result = applyTranscendPair(state, player, pair, targetPlayerId);
  if (mode === "action") player.flags.fioreActionTranscendPenaltyRound = state.round;
  if (mode === "ascension") player.flags.fioreFullRecoveryPenaltyRound = state.round;
  return result;
}

/** Transcend replaces one printed drawback with its matching enhanced skill until round end. */
export const useFioreTranscend: SkillHandler = ({ state, player, payload, openDecision }) => {
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "combat.ending") {
    if (Number(player.flags.fioreActionTranscendPenaltyRound ?? Number.NEGATIVE_INFINITY) === state.round) {
      const manaLost = loseMana(player, 4);
      delete player.flags.fioreActionTranscendPenaltyRound;
      return { manaLost };
    }
    return;
  }
  if (eventType === "round.ending") {
    const activePairs = (["paralysis", "gentle", "circuit"] as const).filter((pair) => pairIsActive(player, pair, state.round));
    for (const definitionId of Object.values(pairSkillIds)) {
      for (const card of Object.values(state.cards).filter((candidate) => candidate.ownerPlayerId === player.id
        && candidate.definitionId === definitionId && candidate.zone !== "removed"
        && candidate.temporary === true && candidate.createdByEffectId === `${FIORE_TRANSCEND_ID}:${state.round}`)) {
        removePhysicalCardFromGame(state, card.instanceId);
      }
    }
    if (activePairs.includes("paralysis")) player.flags.movementLockedOwnActionCombat = true;
    if (activePairs.includes("gentle")) player.flags.fioreGentle = true;
    if (activePairs.includes("circuit")) player.flags.roundManaGainCap = state.modeState.currentSituationClimax === true ? 4 : 2;
    for (const pair of activePairs) delete player.flags[pairRoundFlags[pair]];
    delete player.flags.fioreDeterminationTargetId;
    delete player.flags.fioreDeterminationRound;
    delete player.flags.fioreDeterminationRewardedRound;
    delete player.flags.fioreFullRecoveryPenaltyRound;
    return { cleanedPairs: activePairs };
  }
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
  const mode: TranscendMode = abilityId === TRANS_OUTPOST ? "outpost" : abilityId === TRANS_ACTION ? "action" : (() => { throw new Error("FIORE_TRANSCEND_ABILITY_INVALID"); })();
  if ((mode === "outpost" && state.phase !== "outpost") || (mode === "action" && state.phase !== "action") || state.activePlayerId !== player.id) {
    throw new Error("FIORE_TRANSCEND_WINDOW_INVALID");
  }
  const pair = isPair(data.pairId) ? data.pairId : undefined;
  if (!pair) return openTranscendDecision(state, player, mode, FIORE_TRANSCEND_ID, openDecision);
  const targetPlayerId = typeof data.targetPlayerId === "string" ? data.targetPlayerId : undefined;
  return applyTranscendMode(state, player, mode, pair, targetPlayerId);
};

export const resolveFioreTranscend: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("FIORE_TRANSCEND_DECISION_INVALID");
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((item): item is string => typeof item === "string") : [];
  const mode = payload.previous.mode;
  if (payload.decision.status !== "resolved" || selections.length !== 1 || (mode !== "outpost" && mode !== "action" && mode !== "ascension")) {
    throw new Error("FIORE_TRANSCEND_DECISION_INVALID");
  }
  const selected = parseDecisionSelection(selections[0]);
  return applyTranscendMode(state, player, mode, selected.pair, selected.targetPlayerId);
};

export const isFioreTranscendLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  if (!player || state.activePlayerId !== playerId || availablePairs(state, player).length === 0) return false;
  if (ability?.id === TRANS_OUTPOST) return state.phase === "outpost";
  if (ability?.id === TRANS_ACTION) return state.phase === "action";
  return false;
};

/** Neuromechanics supplies the two confirmed Action abilities on the enhanced card. */
export const useFioreNeuromechanics: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload)) throw new Error("FIORE_NEUROMECHANICS_CONTEXT_REQUIRED");
  const source = activeOwnedSkill(state, player, FIORE_NEUROMECHANICS_ID, definitions);
  if (!source || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("FIORE_NEUROMECHANICS_SOURCE_INACTIVE");
  if (payload.abilityId === NEURO_MOVE) {
    const movement = movePlayerOneSpaceByEffect(state, player.id, "forward", definitions);
    emitEvent?.("player.moved", { playerId: player.id, ...movement, method: "effect", sourceId: FIORE_NEUROMECHANICS_ID });
    emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect", sourceId: FIORE_NEUROMECHANICS_ID });
    return movement;
  }
  if (payload.abilityId === NEURO_TERRAIN) {
    const locationId = player.locationId;
    if ((locationId !== "mountain" && locationId !== "city") || player.flags.deploymentLocationId === locationId) {
      throw new Error("FIORE_NEUROMECHANICS_TERRAIN_INVALID");
    }
    player.flags.roundTerrainAdvantageBonusRound = state.round;
    player.flags.roundTerrainAdvantageBonusLocationId = locationId;
    player.flags.roundTerrainAdvantageBonus = Number(player.flags.roundTerrainAdvantageBonus ?? 0) + 2;
    return { locationId, terrainGain: 2 };
  }
  throw new Error("FIORE_NEUROMECHANICS_ABILITY_INVALID");
};

export const isFioreNeuromechanicsLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.phase !== "action" || state.activePlayerId !== playerId
    || !activeOwnedSkill(state, player, FIORE_NEUROMECHANICS_ID, definitions)) return false;
  if (ability?.id === NEURO_MOVE) {
    if (player.flags.movementLockedOwnActionCombat === true) return false;
    return player.locationId === "workshop" || player.locationId === "mountain" || player.locationId === "city";
  }
  if (ability?.id === NEURO_TERRAIN) return (player.locationId === "mountain" || player.locationId === "city")
    && player.flags.deploymentLocationId !== player.locationId;
  return false;
};

/** Determination rewards Fiore only when the chosen higher-score opponent actually loses the shared combat to her. */
export const useFioreDetermination: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || payload.eventType !== "combat.resolved") return;
  if (Number(player.flags.fioreDeterminationRound ?? Number.NEGATIVE_INFINITY) !== state.round
    || Number(player.flags.fioreDeterminationRewardedRound ?? Number.NEGATIVE_INFINITY) === state.round) return;
  const targetPlayerId = typeof player.flags.fioreDeterminationTargetId === "string" ? player.flags.fioreDeterminationTargetId : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  const powers = isRecord(event.powers) ? event.powers : {};
  if (!targetPlayerId || !(player.id in powers) || !(targetPlayerId in powers) || !winnerIds.includes(player.id) || winnerIds.includes(targetPlayerId)) return;
  gainVictoryPoints(player, 2);
  player.flags.fioreDeterminationRewardedRound = state.round;
  return { targetPlayerId, victoryPoints: 2 };
};

/** Clever Mind gives every physical skill card controlled by Fiore +1 power this round. */
export const useFioreCleverMind: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== CLEVER_REINFORCEMENT
    || state.phase !== "action" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, FIORE_CLEVER_MIND_ID, definitions)) throw new Error("FIORE_CLEVER_MIND_ABILITY_INVALID");
  const targetDefinitionIds = Object.values(definitions).filter((definition) => definition.isSkill === true).map((definition) => definition.id);
  if (targetDefinitionIds.length === 0) throw new Error("FIORE_CLEVER_MIND_NO_SKILLS");
  addCardRuleModifier(player, {
    id: `${FIORE_CLEVER_MIND_ID}:${state.round}:${state.revision}`,
    sourceId: FIORE_CLEVER_MIND_ID,
    targetDefinitionIds,
    powerAdd: 1,
    duration: "round",
  });
  return { targetDefinitionCount: targetDefinitionIds.length, powerAdd: 1 };
};

export const isFioreCleverMindLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === CLEVER_REINFORCEMENT && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, FIORE_CLEVER_MIND_ID, definitions));
};

/** Full Recovery performs one additional Transcend and arms the printed loss penalty for this combat. */
export const useFioreFullRecovery: SkillHandler = ({ state, player, payload, openDecision }) => {
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "combat.resolved") {
    if (Number(player.flags.fioreFullRecoveryPenaltyRound ?? Number.NEGATIVE_INFINITY) !== state.round) return;
    const event = isRecord(data.event) ? data.event : {};
    const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
    const powers = isRecord(event.powers) ? event.powers : {};
    if (!(player.id in powers) || winnerIds.includes(player.id)) return;
    delete player.flags.fioreFullRecoveryPenaltyRound;
    const delta = adjustVictoryPoints(player, -2);
    return { victoryPointsDelta: delta };
  }
  if (data.abilityId !== FULL_RECOVERY || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("FIORE_FULL_RECOVERY_WINDOW_INVALID");
  const pair = isPair(data.pairId) ? data.pairId : undefined;
  if (!pair) return openTranscendDecision(state, player, "ascension", FIORE_FULL_RECOVERY_ID, openDecision);
  const targetPlayerId = typeof data.targetPlayerId === "string" ? data.targetPlayerId : undefined;
  return applyTranscendMode(state, player, "ascension", pair, targetPlayerId);
};

export const isFioreFullRecoveryLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  return Boolean(player && ability?.id === FULL_RECOVERY && state.phase === "action" && state.activePlayerId === playerId
    && availablePairs(state, player).length > 0);
};
