import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { movePlayerByEffect, swapPlayerLocationsByEffect } from "./board.ts";
import { calculateTerrainAdvantage, getCombatCardAttributes } from "./combat-power.ts";
import type { CardDefinition } from "./content-types.ts";
import { closePlayerCard } from "./decks.ts";
import { gainMana } from "./resources.ts";
import { isCardTextSuppressed } from "./card-text.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const CAENIS_FAVOR_ID = "servant.caenis.skill.sc-caenis-1";
export const CAENIS_WINGS_ID = "servant.caenis.skill.sc-caenis-2";
export const CAENIS_MAELSTROM_ID = "servant.caenis.skill.sc-caenis-3";

export const CAENIS_FAVOR_HANDLER = "core.caenis-poseidon-favor";
export const CAENIS_WINGS_HANDLER = "core.caenis-golden-wings";
export const CAENIS_MAELSTROM_HANDLER = "core.caenis-maelstrom";
export const CAENIS_TAKE_FLIGHT_RESOLVE = "core.caenis-take-flight-resolve";
export const CAENIS_UNDERTOW_RESOLVE = "core.caenis-undertow-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return Boolean(definition && (definitionId === skillId || definition.linkedSkillId === skillId));
}

function activeOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && !isCardTextSuppressed(state, card)
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

export function isCaenisCaeneus(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): boolean {
  return Boolean(activeOwnedSkill(state, player, CAENIS_FAVOR_ID, definitions));
}

function syncCaenisGender(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  if (isCaenisCaeneus(state, player, definitions)) player.flags.servantGenderRule = "male";
  else if (player.flags.servantGenderRule === "male") delete player.flags.servantGenderRule;
}

function openSingleDecision(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  handlerId: string,
  kind: string,
  candidates: string[],
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${kind}`;
  state.effectQueue.unshift({
    effectId,
    handlerId,
    sourceId,
    controllerPlayerId: player.id,
    payload: { kind, candidates: [...candidates] },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind,
    options: candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function resolvedSingleDecision(payload: unknown, error: string): { previous: Record<string, unknown>; selection: string } {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error(error);
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections)
    ? decision.selections.filter((value): value is string => typeof value === "string")
    : [];
  if (decision.status !== "resolved" || selections.length !== 1 || selections.length !== decision.selections.length) throw new Error(error);
  return { previous: payload.previous, selection: selections[0] };
}

function canEffectMoveTo(
  state: GameState,
  playerId: string,
  locationId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  try {
    movePlayerByEffect(structuredClone(state), playerId, locationId, definitions);
    return true;
  } catch {
    return false;
  }
}

function canSwapWith(
  state: GameState,
  playerId: string,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  try {
    swapPlayerLocationsByEffect(structuredClone(state), playerId, targetPlayerId, definitions);
    return true;
  } catch {
    return false;
  }
}

/** Poseidon's Favor: skill-zone movement immunity, Permanent Caeneus form, and Outpost deactivation. */
export const useCaenisPoseidonFavor: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("CAENIS_FAVOR_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType) {
    syncCaenisGender(state, player, definitions);
    return { caeneus: isCaenisCaeneus(state, player, definitions) };
  }
  if (data.abilityId !== "deactivate-favor" || state.phase !== "outpost" || state.activePlayerId !== player.id) {
    throw new Error("CAENIS_FAVOR_DEACTIVATE_FORBIDDEN");
  }
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("CAENIS_FAVOR_NOT_ACTIVE");
  closePlayerCard(state, player.id, source.instanceId, definitions);
  gainMana(player, 3);
  addCardRuleModifier(player, {
    id: `${skill.id}:replay-ban:${state.round}:${source.instanceId}`,
    sourceId: skill.id,
    targetDefinitionIds: [source.definitionId, skill.id],
    targetInstanceIds: [source.instanceId],
    forbidPlay: true,
    duration: "round",
  });
  syncCaenisGender(state, player, definitions);
  return { deactivatedInstanceId: source.instanceId, manaGained: 3 };
};

export const isCaenisPoseidonFavorLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "deactivate-favor"
    && state.phase === "outpost" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions));
};

function applyCrashDive(
  state: GameState,
  player: PlayerState,
  skillId: string,
): void {
  player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 5;
  player.flags.terrainAdvantageOverrideRound = state.round;
  player.flags.terrainAdvantageOverrideValue = 0;
  player.flags.caenisCrashDiveSource = skillId;
}

/** Great Golden Wings: free movement as Caenis; Crash Dive and +9 Maelstrom rider. */
export const useCaenisGoldenWings: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("CAENIS_WINGS_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "card.played") {
    const event = isRecord(data.event) ? data.event : {};
    const definitionId = typeof event.definitionId === "string" ? event.definitionId : undefined;
    const definition = definitionId ? definitions[definitionId] : undefined;
    if (event.playerId === player.id && event.face === "up" && definitionId
      && matchesSkill(definition, definitionId, skill.id) && isCaenisCaeneus(state, player, definitions)) {
      applyCrashDive(state, player, skill.id);
      return { crashDive: true, powerBonus: 5, terrainAdvantage: 0 };
    }
    return;
  }
  if (data.abilityId !== "take-flight" || (state.phase !== "action" && state.phase !== "combat")
    || state.activePlayerId !== player.id || isCaenisCaeneus(state, player, definitions)
    || !activeOwnedSkill(state, player, skill.id, definitions) || !player.locationId) {
    throw new Error("CAENIS_TAKE_FLIGHT_FORBIDDEN");
  }
  const candidates = Object.keys(state.board.locations)
    .filter((locationId) => locationId !== player.locationId && canEffectMoveTo(state, player.id, locationId, definitions));
  if (candidates.length === 0) throw new Error("CAENIS_TAKE_FLIGHT_NO_DESTINATION");
  openSingleDecision(state, player, skill.id, CAENIS_TAKE_FLIGHT_RESOLVE, "caenis-take-flight", candidates, openDecision);
};

export const resolveCaenisTakeFlight: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("CAENIS_WINGS_DEFINITIONS_REQUIRED");
  const { previous, selection } = resolvedSingleDecision(payload, "CAENIS_TAKE_FLIGHT_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates)
    ? previous.candidates.filter((value): value is string => typeof value === "string")
    : [];
  if (!candidates.includes(selection) || !canEffectMoveTo(state, player.id, selection, definitions)) {
    throw new Error("CAENIS_TAKE_FLIGHT_DESTINATION_INVALID");
  }
  const movement = movePlayerByEffect(state, player.id, selection, definitions);
  emitEvent?.("player.moved", { playerId: player.id, ...movement, method: "effect", sourceId: skill.id });
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  addCardRuleModifier(player, {
    id: `${skill.id}:maelstrom-power:${state.round}:${state.revision}`,
    sourceId: skill.id,
    sourceInstanceId: source?.instanceId,
    targetDefinitionIds: [CAENIS_MAELSTROM_ID],
    powerAdd: 9,
    duration: "round",
  });
  return { movement, maelstromPowerBonus: 9 };
};

export const isCaenisGoldenWingsLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== "take-flight" || (state.phase !== "action" && state.phase !== "combat")
    || state.activePlayerId !== playerId || isCaenisCaeneus(state, player, definitions)
    || !activeOwnedSkill(state, player, skill.id, definitions) || !player.locationId) return false;
  return Object.keys(state.board.locations).some((locationId) => locationId !== player.locationId && canEffectMoveTo(state, player.id, locationId, definitions));
};

function undertowTargetIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return (state.board.locations.scouting ?? [])
    .filter((playerId) => playerId !== player.id && Boolean(state.players[playerId]) && !state.players[playerId].eliminated)
    .filter((playerId) => canSwapWith(state, player.id, playerId, definitions));
}

function applyTidalWave(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): { affectedInstanceIds: string[] } {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("CAENIS_TIDAL_WAVE_BATTLEFIELD_REQUIRED");
  const affectedInstanceIds: string[] = [];
  for (const targetPlayerId of state.board.locations[locationId] ?? []) {
    const target = state.players[targetPlayerId];
    if (!target || target.eliminated) continue;
    const terrainAdvantage = calculateTerrainAdvantage(state, target, definitions, locationId);
    const reduction = 3 - terrainAdvantage;
    for (const instanceId of target.attack) {
      const card = state.cards[instanceId];
      if (!card || card.zone !== "attack" || !card.active || card.face !== "up") continue;
      if (getCombatCardAttributes(state, target, instanceId, definitions).includes("魔术")) continue;
      const modifierId = `${skillId}:tidal-wave:${state.round}:${instanceId}`;
      card.powerModifiers = [
        ...(card.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
        { id: modifierId, sourceId: skillId, kind: "add", value: -reduction, duration: "round" },
      ];
      affectedInstanceIds.push(instanceId);
    }
  }
  return { affectedInstanceIds };
}

/** Poseidon's Maelstrom: Caenis Undertow swap or Caeneus Tidal Wave. */
export const useCaenisMaelstrom: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !activeOwnedSkill(state, player, skill.id, definitions) || state.activePlayerId !== player.id) {
    throw new Error("CAENIS_MAELSTROM_FORBIDDEN");
  }
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId === "undertow") {
    if (state.phase !== "action" || isCaenisCaeneus(state, player, definitions)) throw new Error("CAENIS_UNDERTOW_FORBIDDEN");
    const targets = undertowTargetIds(state, player, definitions);
    if (targets.length === 0) throw new Error("CAENIS_UNDERTOW_NO_TARGET");
    openSingleDecision(state, player, skill.id, CAENIS_UNDERTOW_RESOLVE, "caenis-undertow", targets, openDecision);
    return;
  }
  if (data.abilityId === "tidal-wave") {
    if (state.phase !== "combat" || !isCaenisCaeneus(state, player, definitions)) throw new Error("CAENIS_TIDAL_WAVE_FORBIDDEN");
    return applyTidalWave(state, player, skill.id, definitions);
  }
  throw new Error("CAENIS_MAELSTROM_ABILITY_INVALID");
};

export const resolveCaenisUndertow: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("CAENIS_MAELSTROM_DEFINITIONS_REQUIRED");
  const { previous, selection } = resolvedSingleDecision(payload, "CAENIS_UNDERTOW_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates)
    ? previous.candidates.filter((value): value is string => typeof value === "string")
    : [];
  if (!candidates.includes(selection) || !undertowTargetIds(state, player, definitions).includes(selection)) {
    throw new Error("CAENIS_UNDERTOW_TARGET_INVALID");
  }
  const movements = swapPlayerLocationsByEffect(state, player.id, selection, definitions);
  emitEvent?.("player.moved", { playerId: player.id, ...movements[0], method: "effect", sourceId: skill.id });
  emitEvent?.("player.moved", { playerId: selection, ...movements[1], method: "effect", sourceId: skill.id });
  return { targetPlayerId: selection, movements };
};

export const isCaenisMaelstromLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !ability || state.activePlayerId !== playerId || !activeOwnedSkill(state, player, skill.id, definitions)) return false;
  if (ability.id === "undertow") return state.phase === "action" && !isCaenisCaeneus(state, player, definitions)
    && undertowTargetIds(state, player, definitions).length > 0;
  if (ability.id === "tidal-wave") return state.phase === "combat" && isCaenisCaeneus(state, player, definitions)
    && (player.locationId === "mountain" || player.locationId === "city");
  return false;
};
