import type { GameState, PlayerState } from "../domain/state/types.ts";
import { grantSkillAbilityReuses } from "./ability-reuse.ts";
import { beginEmbeddedActionPhase } from "./embedded-action.ts";
import type { CardDefinition } from "./content-types.ts";
import { transferVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const HIMIKO_ORACLE_ID = "servant.himiko.skill.sc-himiko-1";
export const HIMIKO_KIDOU_ID = "servant.himiko.skill.sc-himiko-2";
export const HIMIKO_MIRROR_ID = "servant.himiko.skill.sc-himiko-3";
export const HIMIKO_HANDLER = "core.himiko-oracle-kidou";
export const HIMIKO_RESOLVE = "core.himiko-oracle-kidou-resolve";
export const HIMIKO_ORACLE_ABILITY = "oracle-of-light";
export const HIMIKO_MIRROR_SHIELD_ABILITY = "mirror-shield";
export const HIMIKO_SACRED_LAND_ABILITY = "sacred-land";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(card: GameState["cards"][string] | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
}

function activeSkillSource(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.zone === "attack" && card.controllerPlayerId === player.id && card.active && card.face === "up"
      && matchesSkill(card, definition, skillId));
  });
}

type OracleMode = "location" | "power";
type OracleRestriction = { round: number; playerId: string; pairs: string[] };

function oracleRestriction(state: GameState, playerId: string): OracleRestriction {
  const raw = state.modeState.himikoOracleRestriction;
  if (isRecord(raw) && Number(raw.round) === state.round && raw.playerId === playerId && Array.isArray(raw.pairs)) {
    return { round: state.round, playerId, pairs: raw.pairs.filter((value): value is string => typeof value === "string") };
  }
  return { round: state.round, playerId, pairs: [] };
}

function oraclePairKey(targetPlayerId: string, mode: OracleMode): string {
  return `${targetPlayerId}:${mode}`;
}

function oraclePairAllowed(state: GameState, player: PlayerState, targetPlayerId: string, mode: OracleMode): boolean {
  if (Number(player.flags.himikoMirrorOracleRound ?? -1) !== state.round) return true;
  return !oracleRestriction(state, player.id).pairs.includes(oraclePairKey(targetPlayerId, mode));
}

function recordOraclePair(state: GameState, player: PlayerState, targetPlayerId: string, mode: OracleMode): void {
  if (Number(player.flags.himikoMirrorOracleRound ?? -1) !== state.round) return;
  const record = oracleRestriction(state, player.id);
  const key = oraclePairKey(targetPlayerId, mode);
  state.modeState.himikoOracleRestriction = { ...record, pairs: [...new Set([...record.pairs, key])] };
}

function oracleOuterOptions(state: GameState, player: PlayerState) {
  const options: Array<{ id: string; label: string }> = [];
  for (const targetId of state.turnOrder) {
    const target = state.players[targetId];
    if (!target || targetId === player.id || target.eliminated) continue;
    if (player.locationId && oraclePairAllowed(state, player, targetId, "location")) {
      options.push({ id: `location:${targetId}`, label: `${target.name}: location or 2 VP` });
    }
    if (oraclePairAllowed(state, player, targetId, "power")) {
      options.push({ id: `power:${targetId}`, label: `${target.name}: immediate Action or ±3 power` });
    }
  }
  return options;
}

function openOracle(state: GameState, player: PlayerState, openDecision: SkillContext["openDecision"]) {
  const options = oracleOuterOptions(state, player);
  if (!options.length) throw new Error("HIMIKO_ORACLE_NO_TARGET");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${HIMIKO_ORACLE_ID}:outer`;
  state.effectQueue.unshift({ effectId, handlerId: HIMIKO_RESOLVE, sourceId: HIMIKO_ORACLE_ID, controllerPlayerId: player.id,
    payload: { stage: "oracle-outer", optionIds: options.map((option) => option.id) }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "himiko-oracle-mode-target",
    options, min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
  return { pending: true };
}

function openOracleResponse(
  state: GameState,
  player: PlayerState,
  targetPlayerId: string,
  mode: OracleMode,
  openDecision: SkillContext["openDecision"],
) {
  const target = state.players[targetPlayerId];
  if (!target || target.eliminated || targetPlayerId === player.id || !oraclePairAllowed(state, player, targetPlayerId, mode)) {
    throw new Error("HIMIKO_ORACLE_TARGET_INVALID");
  }
  if (mode === "location" && !player.locationId) throw new Error("HIMIKO_ORACLE_LOCATION_REQUIRED");
  recordOraclePair(state, player, targetPlayerId, mode);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${HIMIKO_ORACLE_ID}:${mode}:${targetPlayerId}`;
  const options = mode === "location"
    ? [{ id: "block-location", label: "Cannot enter Himiko's current location" }, { id: "steal-vp", label: "Himiko steals 2 VP" }]
    : [{ id: "immediate-action", label: "Take your Action phase immediately" }, { id: "power-swing", label: "-3 total power; Himiko +3" }];
  state.effectQueue.unshift({ effectId, handlerId: HIMIKO_RESOLVE, sourceId: HIMIKO_ORACLE_ID, controllerPlayerId: player.id,
    payload: { stage: "oracle-response", targetPlayerId, mode, locationId: player.locationId, optionIds: options.map((option) => option.id) }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: targetPlayerId, chooserPlayerIds: [targetPlayerId], kind: "himiko-oracle-response",
    options, min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
  return { pending: true, targetPlayerId, mode };
}

function installOracleLocationBlock(state: GameState, player: PlayerState, targetPlayerId: string, locationId: string): void {
  state.activeRuleModifiers.push({
    id: `${HIMIKO_ORACLE_ID}:location:${state.round}:${state.revision}:${targetPlayerId}`,
    sourceId: HIMIKO_ORACLE_ID,
    controllerPlayerId: player.id,
    operation: "forbid",
    rule: "movement_destinations",
    scope: { subject: "all_players", playerIds: [targetPlayerId], toLocationIds: [locationId] },
    duration: "round",
    createdRound: state.round,
  });
}

function installOraclePowerSwing(state: GameState, player: PlayerState, targetPlayerId: string): void {
  const base = `${HIMIKO_ORACLE_ID}:power:${state.round}:${state.revision}`;
  state.activeRuleModifiers.push({
    id: `${base}:target`, sourceId: HIMIKO_ORACLE_ID, controllerPlayerId: player.id,
    operation: "add", rule: "combat_power", scope: { subject: "all_players", playerIds: [targetPlayerId] }, value: -3,
    duration: "round", createdRound: state.round,
  });
  state.activeRuleModifiers.push({
    id: `${base}:self`, sourceId: HIMIKO_ORACLE_ID, controllerPlayerId: player.id,
    operation: "add", rule: "combat_power", scope: { subject: "all_players", playerIds: [player.id] }, value: 3,
    duration: "round", createdRound: state.round,
  });
}

function mirrorShieldCandidates(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).flatMap((playerId) => state.players[playerId]?.attack ?? []).filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.zone === "attack" && card.active && card.face === "up");
  });
}

function openMirrorShield(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, openDecision: SkillContext["openDecision"]) {
  if (state.phase !== "action" || state.activePlayerId !== player.id || !activeSkillSource(state, player, HIMIKO_KIDOU_ID, definitions)) {
    throw new Error("HIMIKO_MIRROR_SHIELD_WINDOW_INVALID");
  }
  const candidates = mirrorShieldCandidates(state, player);
  if (!candidates.length) throw new Error("HIMIKO_MIRROR_SHIELD_NO_TARGET");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${HIMIKO_KIDOU_ID}:shield`;
  state.effectQueue.unshift({ effectId, handlerId: HIMIKO_RESOLVE, sourceId: HIMIKO_KIDOU_ID, controllerPlayerId: player.id,
    payload: { stage: "mirror-shield", candidates }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "himiko-mirror-shield-target",
    options: candidates.map((id) => ({ id, label: definitions[state.cards[id]?.definitionId ?? ""]?.name ?? id })),
    min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
  return { pending: true };
}

function armSacredLand(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  if (state.phase !== "combat" || state.activePlayerId !== player.id || !activeSkillSource(state, player, HIMIKO_KIDOU_ID, definitions)) {
    throw new Error("HIMIKO_SACRED_LAND_WINDOW_INVALID");
  }
  const round = state.round + 1;
  const current = Number(player.flags.terrainAdvantageContributionMultiplierRound === round
    ? player.flags.terrainAdvantageContributionMultiplier ?? 1 : 1);
  if (!Number.isFinite(current) || current < 0) throw new Error("HIMIKO_TERRAIN_MULTIPLIER_INVALID");
  player.flags.terrainAdvantageContributionMultiplierRound = round;
  player.flags.terrainAdvantageContributionMultiplier = current * 2;
  player.flags.situationNoblePhantasmBanIgnoreRound = round;
  return { round, terrainMultiplier: current * 2 };
}

function armEternalMirror(state: GameState, player: PlayerState, event: Record<string, unknown>) {
  if (event.playerId !== player.id || event.definitionId !== HIMIKO_MIRROR_ID || event.face === "down") return;
  const round = state.round + 1;
  grantSkillAbilityReuses(player, HIMIKO_MIRROR_ID, round, HIMIKO_ORACLE_ID, HIMIKO_ORACLE_ABILITY, 2);
  player.flags.himikoMirrorOracleRound = round;
  return { round, extraOracleUses: 2 };
}

export const useHimiko: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("HIMIKO_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (skill.id === HIMIKO_MIRROR_ID && eventType === "card.played") return armEternalMirror(state, player, event);
  if (skill.id === HIMIKO_ORACLE_ID && data.abilityId === HIMIKO_ORACLE_ABILITY) {
    if (state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("HIMIKO_ORACLE_WINDOW_INVALID");
    return openOracle(state, player, openDecision);
  }
  if (skill.id === HIMIKO_KIDOU_ID && data.abilityId === HIMIKO_MIRROR_SHIELD_ABILITY) return openMirrorShield(state, player, definitions, openDecision);
  if (skill.id === HIMIKO_KIDOU_ID && data.abilityId === HIMIKO_SACRED_LAND_ABILITY) return armSacredLand(state, player, definitions);
  return;
};

export const resolveHimiko: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("HIMIKO_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error("HIMIKO_DECISION_INVALID");
  if (previous.stage === "oracle-outer") {
    const allowed = Array.isArray(previous.optionIds) ? previous.optionIds.filter((id): id is string => typeof id === "string") : [];
    if (!allowed.includes(selections[0])) throw new Error("HIMIKO_ORACLE_SELECTION_INVALID");
    const [mode, targetPlayerId] = selections[0].split(":", 2);
    if ((mode !== "location" && mode !== "power") || !targetPlayerId) throw new Error("HIMIKO_ORACLE_SELECTION_INVALID");
    return openOracleResponse(state, player, targetPlayerId, mode, openDecision);
  }
  if (previous.stage === "oracle-response") {
    const allowed = Array.isArray(previous.optionIds) ? previous.optionIds.filter((id): id is string => typeof id === "string") : [];
    const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
    if (!targetPlayerId || !allowed.includes(selections[0]) || !state.players[targetPlayerId] || state.players[targetPlayerId].eliminated) {
      throw new Error("HIMIKO_ORACLE_RESPONSE_INVALID");
    }
    if (selections[0] === "block-location") {
      const locationId = typeof previous.locationId === "string" ? previous.locationId : undefined;
      if (!locationId) throw new Error("HIMIKO_ORACLE_LOCATION_REQUIRED");
      installOracleLocationBlock(state, player, targetPlayerId, locationId);
      return { targetPlayerId, blockedLocationId: locationId };
    }
    if (selections[0] === "steal-vp") return { targetPlayerId, stolenVictoryPoints: transferVictoryPoints(state.players[targetPlayerId], player, 2) };
    if (selections[0] === "immediate-action") {
      beginEmbeddedActionPhase(state, targetPlayerId);
      return { targetPlayerId, embeddedAction: true };
    }
    if (selections[0] === "power-swing") {
      installOraclePowerSwing(state, player, targetPlayerId);
      return { targetPlayerId, targetPower: -3, himikoPower: 3 };
    }
    throw new Error("HIMIKO_ORACLE_RESPONSE_INVALID");
  }
  if (previous.stage === "mirror-shield") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    const instanceId = selections[0];
    if (!candidates.includes(instanceId) || !mirrorShieldCandidates(state, player).includes(instanceId)) throw new Error("HIMIKO_MIRROR_SHIELD_TARGET_INVALID");
    const card = state.cards[instanceId];
    const modifierId = `${HIMIKO_KIDOU_ID}:mirror-shield:${state.round}:${state.revision}:${instanceId}`;
    card.powerModifiers = [...(card.powerModifiers ?? []), {
      id: modifierId, sourceId: HIMIKO_KIDOU_ID, kind: "multiply", value: 0.5, duration: "round", rounding: "floor",
    }];
    return { targetInstanceId: instanceId };
  }
  throw new Error("HIMIKO_DECISION_STAGE_INVALID");
};

export const isHimikoLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !ability || !definitions || state.activePlayerId !== playerId) return false;
  if (skill.id === HIMIKO_ORACLE_ID && ability.id === HIMIKO_ORACLE_ABILITY) {
    return state.phase === "outpost" && oracleOuterOptions(state, player).length > 0;
  }
  if (skill.id === HIMIKO_KIDOU_ID && ability.id === HIMIKO_MIRROR_SHIELD_ABILITY) {
    return state.phase === "action" && Boolean(activeSkillSource(state, player, HIMIKO_KIDOU_ID, definitions)) && mirrorShieldCandidates(state, player).length > 0;
  }
  if (skill.id === HIMIKO_KIDOU_ID && ability.id === HIMIKO_SACRED_LAND_ABILITY) {
    return state.phase === "combat" && Boolean(activeSkillSource(state, player, HIMIKO_KIDOU_ID, definitions));
  }
  return false;
};
