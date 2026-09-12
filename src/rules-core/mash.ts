import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { CardAbilityRegistry } from "./card-abilities.ts";
import { calculateTerrainAdvantage } from "./combat-power.ts";
import type { CardDefinition } from "./content-types.ts";
import { lendActiveOwnedCardToPlayer } from "./decks.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const MASH_LORD_CAMELOT_ID = "servant.mash.skill.sc-mash-1";
export const MASH_ORTENAUS_ID = "servant.mash.skill.sc-mash-3";
export const MASH_GUARD_LEGACY_SKILL_ID = "servant.mash.skill.sc-mash-4";
export const MASH_LORD_CAMELOT_HANDLER = "core.mash-lord-camelot";
export const MASH_LORD_CAMELOT_RESOLVE = "core.mash-lord-camelot.resolve";
export const MASH_ORTENAUS_HANDLER = "core.mash-ortenaus";
export const MASH_GUARD_ABILITY = "mash.guard-lend";
export const MASH_GUARD_DEFINITION_ID = "card.x-guard";

const CAMELOT_ABILITY = "castle-distant-utopia";
const ORTENAUS_ACTIVE_FLAG = "mashOrtenausActive";
const ORTENAUS_RESTORE_TRUE_NAME_FLAG = "mashOrtenausRestoreTrueName";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(card: GameState["cards"][string] | undefined, skillId: string, definitions: Record<string, CardDefinition>): boolean {
  if (!card) return false;
  const definition = definitions[card.definitionId];
  return card.definitionId === skillId || card.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => Boolean(
    card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
    && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(card, skillId, definitions),
  ));
}

function camelotTargets(state: GameState): string[] {
  return state.turnOrder.filter((id) => Boolean(state.players[id] && !state.players[id].eliminated));
}

function applyCamelotTerrain(
  state: GameState,
  player: PlayerState,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
) {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("MASH_CAMELOT_BATTLEFIELD_REQUIRED");
  const target = state.players[targetPlayerId];
  if (!target || target.eliminated || !camelotTargets(state).includes(targetPlayerId)) throw new Error("MASH_CAMELOT_TARGET_INVALID");
  const before = calculateTerrainAdvantage(state, target, definitions, locationId);
  const after = (before + 2) * 2;
  target.flags.terrainAdvantageOverrideRound = state.round;
  target.flags.terrainAdvantageOverrideLocationId = locationId;
  target.flags.terrainAdvantageOverrideValue = after;
  return { targetPlayerId, locationId, terrainAdvantageBefore: before, terrainAdvantageAfter: after };
}

function openCamelotDecision(
  state: GameState,
  player: PlayerState,
  candidates: string[],
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${MASH_LORD_CAMELOT_ID}:target`;
  state.effectQueue.unshift({
    effectId,
    handlerId: MASH_LORD_CAMELOT_RESOLVE,
    sourceId: MASH_LORD_CAMELOT_ID,
    controllerPlayerId: player.id,
    payload: { candidatePlayerIds: candidates },
    createdAtRevision: state.revision,
  });
  const decision: PendingDecision = {
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "mash-lord-camelot-target",
    options: candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  };
  openDecision(decision);
}

/** Lord Camelot: choose any living player, give +2 terrain on Mash's battlefield, then double the resulting terrain. */
export const useMashLordCamelot: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("MASH_CAMELOT_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== CAMELOT_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("MASH_CAMELOT_WINDOW_INVALID");
  }
  if (player.commandSeals <= 0) throw new Error("MASH_CAMELOT_BLOCKED_BY_ORTENAUS");
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("MASH_CAMELOT_SOURCE_INACTIVE");
  if (player.locationId !== "mountain" && player.locationId !== "city") throw new Error("MASH_CAMELOT_BATTLEFIELD_REQUIRED");
  const directTarget = typeof data.targetPlayerId === "string" ? data.targetPlayerId : undefined;
  if (directTarget) return applyCamelotTerrain(state, player, directTarget, definitions);
  const candidates = camelotTargets(state);
  if (candidates.length === 0) throw new Error("MASH_CAMELOT_NO_TARGET");
  if (candidates.length === 1) return applyCamelotTerrain(state, player, candidates[0], definitions);
  openCamelotDecision(state, player, candidates, openDecision);
  return { pending: true, candidatePlayerIds: candidates };
};

export const resolveMashLordCamelot: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("MASH_CAMELOT_DECISION_INVALID");
  }
  const candidates = Array.isArray(payload.previous.candidatePlayerIds)
    ? payload.previous.candidatePlayerIds.filter((id): id is string => typeof id === "string")
    : [];
  const selections = Array.isArray(payload.decision.selections)
    ? payload.decision.selections.filter((id): id is string => typeof id === "string")
    : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) {
    throw new Error("MASH_CAMELOT_DECISION_INVALID");
  }
  return applyCamelotTerrain(state, player, selections[0], definitions);
};

export const isMashLordCamelotLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === CAMELOT_ABILITY && state.phase === "action" && state.activePlayerId === playerId
    && player.commandSeals > 0 && (player.locationId === "mountain" || player.locationId === "city")
    && activeOwnedSkill(state, player, skill.id, definitions));
};

/** Keep Ortenaus' continuous zero-seal state synchronized without parsing its display text. */
export const useMashOrtenaus: SkillHandler = ({ state, player }) => {
  const active = player.commandSeals === 0;
  const wasActive = player.flags[ORTENAUS_ACTIVE_FLAG] === true;
  if (active) {
    if (!wasActive) player.flags[ORTENAUS_RESTORE_TRUE_NAME_FLAG] = player.trueNameRevealed;
    player.flags[ORTENAUS_ACTIVE_FLAG] = true;
    player.flags.preventTrueNameRevealWhenNoSeals = true;
    player.trueNameRevealed = false;
    return { active: true, trueNameRevealed: false };
  }
  if (wasActive && player.flags[ORTENAUS_RESTORE_TRUE_NAME_FLAG] === true) player.trueNameRevealed = true;
  delete player.flags[ORTENAUS_ACTIVE_FLAG];
  delete player.flags[ORTENAUS_RESTORE_TRUE_NAME_FLAG];
  delete player.flags.preventTrueNameRevealWhenNoSeals;
  return { active: false, trueNameRevealed: player.trueNameRevealed };
};

/** Register the physical Guard's Action ability. Guard is a deck card, not a fourth Mash Skill. */
export function registerMashCardAbilities(registry: CardAbilityRegistry): void {
  if (registry.has(MASH_GUARD_ABILITY)) return;
  registry.register(MASH_GUARD_ABILITY, ({ state, playerId, instanceId, target, definitions }) => {
    const player = state.players[playerId];
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (state.phase !== "action" || state.activePlayerId !== playerId) throw new Error("MASH_GUARD_WINDOW_INVALID");
    if (!player || player.eliminated || !card || definition?.id !== MASH_GUARD_DEFINITION_ID
      || card.ownerPlayerId !== playerId || card.controllerPlayerId !== playerId || card.zone !== "attack" || !card.active || card.face !== "up") {
      throw new Error("MASH_GUARD_SOURCE_INVALID");
    }
    if (player.commandSeals <= 0) throw new Error("MASH_GUARD_BLOCKED_BY_ORTENAUS");
    if (typeof target !== "string" || target === playerId || !state.players[target] || state.players[target].eliminated) {
      throw new Error("MASH_GUARD_TARGET_INVALID");
    }
    lendActiveOwnedCardToPlayer(state, playerId, target, instanceId);
  });
}
