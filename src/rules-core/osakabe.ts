import type { GameState, PlayerState } from "../domain/state/types.ts";
import { movePlayer } from "./board.ts";
import { calculateTerrainAdvantage } from "./combat-power.ts";
import type { CardDefinition } from "./content-types.ts";
import { placeOwnedCardOnBoard, returnOwnedBoardCardToSkillZone } from "./decks.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { transferVictoryPoints, gainVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const OSAKABE_APPARITION_ID = "servant.osakabe.skill.sc-osakabe-1";
export const OSAKABE_BATS_ID = "servant.osakabe.skill.sc-osakabe-2";
export const OSAKABE_CASTLE_ID = "servant.osakabe.skill.sc-osakabe-3";

export const OSAKABE_APPARITION_HANDLER = "core.osakabe-castle-apparition";
export const OSAKABE_BATS_HANDLER = "core.osakabe-chiyogami-bats";
export const OSAKABE_CASTLE_HANDLER = "core.osakabe-hakuro-castle";
export const OSAKABE_CASTLE_RESOLVE = "core.osakabe-hakuro-castle-resolve";

const LOCATION_FORWARD: Record<string, string | undefined> = { workshop: "mountain", mountain: "city", city: "scouting", scouting: undefined };
const CASTLE_EXPIRES_PREFIX = "osakabeHakuroExpiresAfterRound:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function ownedLiveSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return [...new Set([...player.hand, ...player.masterSkills, ...player.servantSkills, ...player.attack])].map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone !== "removed" && card.zone !== "discard"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

export function isHakuroCastleAttachedAt(state: GameState, locationId: string | null | undefined, definitions: Record<string, CardDefinition>): boolean {
  if (!locationId) return false;
  return Object.values(state.cards).some((card) => {
    const definition = definitions[card.definitionId];
    return Boolean(card.zone === "board" && card.active && card.face === "up" && card.boardLocationId === locationId
      && matchesSkill(definition, card.definitionId, OSAKABE_CASTLE_ID));
  });
}

/** Castle Apparition: active Action doubles terrain; Passive/Combat works from the resting skill zone. */
export const useOsakabeCastleApparition: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("OSAKABE_APPARITION_CONTEXT_REQUIRED");
  if (payload.abilityId === "double-terrain") {
    if (state.phase !== "action" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("OSAKABE_APPARITION_ACTION_INVALID");
    player.flags.terrainAdvantageContributionMultiplierRound = state.round;
    player.flags.terrainAdvantageContributionMultiplier = 2;
    return { multiplier: 2 };
  }
  if (payload.abilityId === "reclusive-hermit") {
    if (state.phase !== "combat" || state.activePlayerId !== player.id || !ownedLiveSkill(state, player, skill.id, definitions)) throw new Error("OSAKABE_APPARITION_COMBAT_INVALID");
    const locationId = player.locationId;
    if (!locationId || (state.board.locations[locationId] ?? []).filter((id) => !state.players[id]?.eliminated).length !== 1) throw new Error("OSAKABE_APPARITION_NOT_ALONE");
    return { victoryPointsGained: gainVictoryPoints(player, 1) };
  }
  throw new Error("OSAKABE_APPARITION_ABILITY_INVALID");
};

export const isOsakabeCastleApparitionLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !ability || state.activePlayerId !== playerId) return false;
  if (ability.id === "double-terrain") return state.phase === "action" && Boolean(activeOwnedSkill(state, player, skill.id, definitions));
  if (ability.id === "reclusive-hermit") return state.phase === "combat" && Boolean(ownedLiveSkill(state, player, skill.id, definitions))
    && Boolean(player.locationId && (state.board.locations[player.locationId] ?? []).filter((id) => !state.players[id]?.eliminated).length === 1);
  return false;
};

function adjacentStealLocation(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string | undefined {
  if (!player.locationId) return undefined;
  const targetLocationId = LOCATION_FORWARD[player.locationId];
  if (!targetLocationId || !state.board.locations[targetLocationId]) return undefined;
  const draft = structuredClone(state) as GameState;
  draft.phase = "action";
  draft.step = "move-decision";
  draft.activePlayerId = player.id;
  draft.players[player.id].mana = Math.max(100, draft.players[player.id].mana);
  // The card explicitly ignores only destination capacity for this legality check.
  const actualOccupants = [...draft.board.locations[targetLocationId]];
  draft.board.locations[targetLocationId] = actualOccupants.filter((id) => id === player.id);
  try {
    movePlayer(draft, player.id, targetLocationId, false, definitions);
    return targetLocationId;
  } catch {
    return undefined;
  }
}

/** Chiyogami Bats: dynamic X is handled by generic card-face metadata; Combat steals across the legal adjacent edge. */
export const useOsakabeChiyogamiBats: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== "paper-manipulation" || state.phase !== "combat" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("OSAKABE_BATS_WINDOW_INVALID");
  const locationId = adjacentStealLocation(state, player, definitions);
  if (!locationId) throw new Error("OSAKABE_BATS_MOVEMENT_NOT_POSSIBLE");
  const targets = (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated);
  let stolen = 0;
  for (const targetId of targets) stolen += transferVictoryPoints(state.players[targetId], player, 1);
  return { locationId, targetPlayerIds: targets, victoryPointsStolen: stolen };
};

export const isOsakabeChiyogamiBatsLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "paper-manipulation" && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions) && adjacentStealLocation(state, player, definitions));
};

function castleDropTargets(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  if (!player.locationId || !state.board.locations[player.locationId]) return [];
  return state.board.locations[player.locationId].filter((id) => {
    const target = state.players[id];
    return Boolean(id !== player.id && target && !target.eliminated && calculateTerrainAdvantage(state, target, definitions, player.locationId) >= 3);
  });
}

function defeatCastleDropTarget(state: GameState, player: PlayerState, targetPlayerId: string, definitions: Record<string, CardDefinition>, emitEvent?: SkillContext["emitEvent"]) {
  if (!castleDropTargets(state, player, definitions).includes(targetPlayerId)) throw new Error("OSAKABE_CASTLE_DROP_TARGET_INVALID");
  const result = applyDefeatEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: OSAKABE_CASTLE_ID, method: "castle-drop" });
  return { targetPlayerId, ...result };
}

function openCastleDropDecision(state: GameState, player: PlayerState, candidates: string[], openDecision: SkillContext["openDecision"]): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${OSAKABE_CASTLE_ID}:castle-drop`;
  state.effectQueue.unshift({ effectId, handlerId: OSAKABE_CASTLE_RESOLVE, sourceId: OSAKABE_CASTLE_ID, controllerPlayerId: player.id, payload: { candidates }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "osakabe-castle-drop",
    options: candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })), min: 1, max: 1,
    allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
}

/** Hakuro Castle: On Play drop, then attach for the next two rounds and return after the second. */
export const useOsakabeHakuroCastle: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload)) throw new Error("OSAKABE_CASTLE_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType === "card.played") {
    const definitionId = typeof event.definitionId === "string" ? event.definitionId : undefined;
    if (event.playerId !== player.id || !definitionId || !matchesSkill(definitions[definitionId], definitionId, skill.id)) return;
    const candidates = castleDropTargets(state, player, definitions);
    if (candidates.length === 0) return;
    if (candidates.length === 1) return defeatCastleDropTarget(state, player, candidates[0], definitions, emitEvent);
    openCastleDropDecision(state, player, candidates, openDecision);
    return { pending: true, candidates };
  }
  if (eventType === "combat.ending") {
    const source = activeOwnedSkill(state, player, skill.id, definitions);
    if (!source || (player.locationId !== "mountain" && player.locationId !== "city")) return;
    placeOwnedCardOnBoard(state, player.id, source.instanceId, player.locationId);
    player.flags[`${CASTLE_EXPIRES_PREFIX}${source.instanceId}`] = state.round + 2;
    return { attachedInstanceId: source.instanceId, locationId: player.locationId, expiresAfterRound: state.round + 2 };
  }
  if (eventType === "round.ending") {
    const returned: string[] = [];
    for (const card of Object.values(state.cards)) {
      if (card.ownerPlayerId !== player.id || card.zone !== "board") continue;
      const definition = definitions[card.definitionId];
      if (!matchesSkill(definition, card.definitionId, skill.id)) continue;
      const expires = Number(player.flags[`${CASTLE_EXPIRES_PREFIX}${card.instanceId}`] ?? Number.POSITIVE_INFINITY);
      if (state.round < expires) continue;
      returnOwnedBoardCardToSkillZone(state, player.id, card.instanceId, "servant-skills");
      delete player.flags[`${CASTLE_EXPIRES_PREFIX}${card.instanceId}`];
      returned.push(card.instanceId);
    }
    return { returnedInstanceIds: returned };
  }
};

export const resolveOsakabeHakuroCastle: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("OSAKABE_CASTLE_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidates) ? payload.previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("OSAKABE_CASTLE_DECISION_INVALID");
  return defeatCastleDropTarget(state, player, selections[0], definitions, emitEvent);
};
