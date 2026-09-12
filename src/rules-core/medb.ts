import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { adjustVictoryPoints, gainVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const MEDB_RED_MEAD_ID = "servant.medb.skill.sc-medb-2";
export const MEDB_CHARIOT_ID = "servant.medb.skill.sc-medb-3";
export const MEDB_RED_MEAD_HANDLER = "core.medb-red-mead";
export const MEDB_CHARIOT_HANDLER = "core.medb-chariot";
export const MEDB_CHARIOT_RESOLVE = "core.medb-chariot-resolve";

const RED_MEAD_ABILITY = "intoxicate";
const CHARIOT_ABILITY = "ensnare-winner";
const INTOXICATIONS_FLAG = "medbIntoxicationEffects";
const CHARIOT_ARMED_ROUND_FLAG = "medbChariotArmedRound";

type IntoxicationEntry = {
  sourcePlayerId: string;
  sourceSkillId: string;
  round: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.face === "up" && card.active && matchesSkill(definition, card.definitionId, skillId));
  });
}

function sameLocationOpponentIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (!locationId || !state.board.locations[locationId]) return [];
  return state.board.locations[locationId].filter((id) => id !== player.id && !state.players[id]?.eliminated);
}

function readIntoxications(player: PlayerState): IntoxicationEntry[] {
  const value = player.flags[INTOXICATIONS_FLAG];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is IntoxicationEntry => Boolean(entry) && typeof entry === "object"
    && typeof (entry as IntoxicationEntry).sourcePlayerId === "string"
    && typeof (entry as IntoxicationEntry).sourceSkillId === "string"
    && Number.isInteger((entry as IntoxicationEntry).round));
}

function addIntoxication(target: PlayerState, entry: IntoxicationEntry): void {
  const existing = readIntoxications(target).filter((candidate) => !(candidate.sourcePlayerId === entry.sourcePlayerId
    && candidate.sourceSkillId === entry.sourceSkillId && candidate.round === entry.round));
  target.flags[INTOXICATIONS_FLAG] = [...existing, entry];
}

function removeResolvedIntoxications(target: PlayerState, sourcePlayerId: string, sourceSkillId: string, round: number): void {
  const remaining = readIntoxications(target).filter((entry) => !(entry.sourcePlayerId === sourcePlayerId
    && entry.sourceSkillId === sourceSkillId && entry.round === round));
  if (remaining.length > 0) target.flags[INTOXICATIONS_FLAG] = remaining;
  else delete target.flags[INTOXICATIONS_FLAG];
}

/** My Red Mead: arm next-round observation and resolve it at that round's end. */
export const useMedbRedMead: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("MEDB_RED_MEAD_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "round.ending") {
    for (const target of Object.values(state.players)) {
      const matching = readIntoxications(target).filter((entry) => entry.sourcePlayerId === player.id
        && entry.sourceSkillId === skill.id && entry.round === state.round);
      if (matching.length === 0) continue;
      const gained = Number(target.flags.roundVictoryPointsGained ?? 0);
      if (!Number.isInteger(gained) || gained < 0) throw new Error("MEDB_RED_MEAD_GAIN_STATE_INVALID");
      gainVictoryPoints(player, gained);
      if (gained < 3) adjustVictoryPoints(target, -3);
      removeResolvedIntoxications(target, player.id, skill.id, state.round);
    }
    return;
  }
  if (data.abilityId !== RED_MEAD_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("MEDB_RED_MEAD_ABILITY_INVALID");
  }
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("MEDB_RED_MEAD_SOURCE_INACTIVE");
  const targetPlayerId = typeof data.targetPlayerId === "string" ? data.targetPlayerId : undefined;
  if (!targetPlayerId || !sameLocationOpponentIds(state, player).includes(targetPlayerId)) throw new Error("MEDB_RED_MEAD_TARGET_INVALID");
  addIntoxication(state.players[targetPlayerId], { sourcePlayerId: player.id, sourceSkillId: skill.id, round: state.round + 1 });
  return { targetPlayerId, intoxicatedRound: state.round + 1 };
};

export const isMedbRedMeadLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === RED_MEAD_ABILITY && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions) && sameLocationOpponentIds(state, player).length > 0);
};

function combatWinnerTargets(player: PlayerState, event: Record<string, unknown>): string[] {
  const powers = isRecord(event.powers) ? event.powers : {};
  if (!Object.prototype.hasOwnProperty.call(powers, player.id)) return [];
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  // Following yourself is undefined; only another winner can become the follower.
  return winnerIds.filter((id) => id !== player.id);
}

function applyEnsnared(state: GameState, controller: PlayerState, targetPlayerId: string): void {
  const target = state.players[targetPlayerId];
  if (!target || target.eliminated || target.id === controller.id) throw new Error("MEDB_CHARIOT_TARGET_INVALID");
  target.flags.skipDeploymentRound = state.round + 1;
  target.flags.followDeploymentRound = state.round + 1;
  target.flags.followDeploymentPlayerId = controller.id;
}

function openWinnerDecision(state: GameState, player: PlayerState, candidates: string[], openDecision: Parameters<SkillHandler>[0]["openDecision"]): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${MEDB_CHARIOT_ID}:winner`;
  state.effectQueue.unshift({ effectId, handlerId: MEDB_CHARIOT_RESOLVE, sourceId: MEDB_CHARIOT_ID, controllerPlayerId: player.id,
    payload: { stage: "winner", candidates }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "medb-chariot-winner",
    options: candidates.map((id) => ({ id, label: id })), min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
}

/** Chariot My Love: arm during Combat, then bind one other winner for next round. */
export const useMedbChariot: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("MEDB_CHARIOT_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "combat.resolved") {
    if (Number(player.flags[CHARIOT_ARMED_ROUND_FLAG] ?? -1) !== state.round) return;
    delete player.flags[CHARIOT_ARMED_ROUND_FLAG];
    const event = isRecord(data.event) ? data.event : {};
    const candidates = combatWinnerTargets(player, event);
    if (candidates.length === 1) applyEnsnared(state, player, candidates[0]);
    else if (candidates.length > 1) openWinnerDecision(state, player, candidates, openDecision);
    return;
  }
  if (data.abilityId !== CHARIOT_ABILITY || state.phase !== "combat") throw new Error("MEDB_CHARIOT_ABILITY_INVALID");
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("MEDB_CHARIOT_SOURCE_INACTIVE");
  if (player.locationId !== "mountain" && player.locationId !== "city") throw new Error("MEDB_CHARIOT_BATTLEFIELD_REQUIRED");
  player.flags[CHARIOT_ARMED_ROUND_FLAG] = state.round;
  return { armedRound: state.round };
};

export const resolveMedbChariot: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("MEDB_CHARIOT_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidates) ? payload.previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.previous.stage !== "winner" || payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) {
    throw new Error("MEDB_CHARIOT_DECISION_INVALID");
  }
  applyEnsnared(state, player, selections[0]);
  return { targetPlayerId: selections[0], ensnaredRound: state.round + 1 };
};

export const isMedbChariotLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === CHARIOT_ABILITY && state.phase === "combat"
    && (player.locationId === "mountain" || player.locationId === "city") && activeOwnedSkill(state, player, skill.id, definitions));
};
