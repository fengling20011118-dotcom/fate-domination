import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { movePlayerCard } from "./decks.ts";
import {
  clearMoonCellEventEffectRestriction,
  discardMoonCellObjective,
  getMoonCellObjectiveIds,
  setMoonCellEventEffectRestriction,
  swapBattlefieldEventWithMoonCellObjective,
} from "./moon-cell.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const MOON_CANCER_HANDLER = "core.moon-cancer";
export const MOON_CANCER_RESOLVE = "core.moon-cancer-resolve";
export const MOON_CANCER_RESTRICT = "moon-cancer-restrict";
export const MOON_CANCER_SWAP = "moon-cancer-swap";

type MoonCancerCleanupRecord = {
  round: number;
  controllerPlayerId: string;
  sourceSkillId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesSkill(card: GameState["cards"][string] | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
}

function activeSource(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && matchesSkill(card, definition, skillId));
  });
}

function cleanupRecords(state: GameState): MoonCancerCleanupRecord[] {
  const raw = state.modeState.moonCancerCleanupRecords;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is MoonCancerCleanupRecord => isRecord(item)
    && Number(item.round) === state.round
    && typeof item.controllerPlayerId === "string"
    && typeof item.sourceSkillId === "string");
}

function armCleanup(state: GameState, record: MoonCancerCleanupRecord): void {
  const current = cleanupRecords(state).filter((item) => !(item.controllerPlayerId === record.controllerPlayerId && item.sourceSkillId === record.sourceSkillId));
  state.modeState.moonCancerCleanupRecords = [...current, record];
}

function clearCleanup(state: GameState, playerId: string, sourceSkillId: string): void {
  const current = cleanupRecords(state).filter((item) => !(item.controllerPlayerId === playerId && item.sourceSkillId === sourceSkillId));
  if (current.length > 0) state.modeState.moonCancerCleanupRecords = current;
  else delete state.modeState.moonCancerCleanupRecords;
}

function openChoice(
  state: GameState,
  player: PlayerState,
  sourceSkillId: string,
  payload: Record<string, unknown>,
  options: PendingDecision["options"],
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceSkillId}:moon-cancer-swap`;
  state.effectQueue.unshift({
    effectId,
    handlerId: MOON_CANCER_RESOLVE,
    sourceId: sourceSkillId,
    controllerPlayerId: player.id,
    payload: { stage: "moon-cancer-swap", sourceSkillId, ...payload },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "moon-cancer-swap",
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function useRestriction(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("MOON_CANCER_ACTION_WINDOW_INVALID");
  const locationId = player.locationId;
  const source = activeSource(state, player, skillId, definitions);
  if (!source || (locationId !== "mountain" && locationId !== "city")) throw new Error("MOON_CANCER_SOURCE_INVALID");
  movePlayerCard(state, player.id, source.instanceId, "discard");
  setMoonCellEventEffectRestriction(state, {
    round: state.round,
    sourceId: skillId,
    controllerPlayerId: player.id,
    locationId,
  });
  armCleanup(state, { round: state.round, controllerPlayerId: player.id, sourceSkillId: skillId });
  return { discardedInstanceId: source.instanceId, locationId };
}

function beginSwap(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("MOON_CANCER_ACTION_WINDOW_INVALID");
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("MOON_CANCER_LOCATION_INVALID");
  const battlefieldIds = [...(state.board.currentEvents[locationId] ?? [])];
  const moonCellIds = getMoonCellObjectiveIds(state);
  if (battlefieldIds.length === 0 || moonCellIds.length === 0) throw new Error("MOON_CANCER_SWAP_UNAVAILABLE");
  const options = battlefieldIds.flatMap((battlefieldId) => moonCellIds.map((moonCellId) => ({
    id: `${battlefieldId}|${moonCellId}`,
    label: `${definitions[battlefieldId]?.name ?? battlefieldId} ↔ ${definitions[moonCellId]?.name ?? moonCellId}`,
  })));
  openChoice(state, player, skillId, { locationId, battlefieldIds, moonCellIds }, options, openDecision);
  return { pending: true };
}

function cleanupAfterCombat(state: GameState, player: PlayerState, skillId: string) {
  if (!cleanupRecords(state).some((item) => item.controllerPlayerId === player.id && item.sourceSkillId === skillId)) return;
  const discarded: string[] = [];
  for (const eventId of [...getMoonCellObjectiveIds(state)]) {
    discardMoonCellObjective(state, eventId);
    discarded.push(eventId);
  }
  clearMoonCellEventEffectRestriction(state, skillId);
  clearCleanup(state, player.id, skillId);
  return { discardedMoonCellEventIds: discarded };
}

export const useMoonCancer: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("MOON_CANCER_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "combat.ending") return cleanupAfterCombat(state, player, skill.id);
  if (data.abilityId === MOON_CANCER_RESTRICT) return useRestriction(state, player, skill.id, definitions);
  if (data.abilityId === MOON_CANCER_SWAP) return beginSwap(state, player, skill.id, definitions, openDecision);
  throw new Error("MOON_CANCER_ABILITY_INVALID");
};

export const resolveMoonCancerDecision: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("MOON_CANCER_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1 || previous.stage !== "moon-cancer-swap") throw new Error("MOON_CANCER_DECISION_INVALID");
  const [battlefieldId, moonCellId] = selections[0].split("|");
  const locationId = previous.locationId;
  const sourceSkillId = previous.sourceSkillId;
  const battlefieldIds = Array.isArray(previous.battlefieldIds) ? previous.battlefieldIds.filter((id): id is string => typeof id === "string") : [];
  const moonCellIds = Array.isArray(previous.moonCellIds) ? previous.moonCellIds.filter((id): id is string => typeof id === "string") : [];
  if ((locationId !== "mountain" && locationId !== "city") || typeof sourceSkillId !== "string"
    || !battlefieldIds.includes(battlefieldId) || !moonCellIds.includes(moonCellId)) throw new Error("MOON_CANCER_SWAP_SELECTION_INVALID");
  swapBattlefieldEventWithMoonCellObjective(state, locationId, battlefieldId, moonCellId, sourceSkillId);
  return { battlefieldEventId: moonCellId, moonCellEventId: battlefieldId, locationId };
};

export const isMoonCancerLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || player.eliminated || !definitions || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return false;
  if (ability?.id === MOON_CANCER_RESTRICT) return Boolean(activeSource(state, player, skill.id, definitions));
  if (ability?.id === MOON_CANCER_SWAP) return state.board.currentEvents[locationId].length > 0 && getMoonCellObjectiveIds(state).length > 0;
  return false;
};
