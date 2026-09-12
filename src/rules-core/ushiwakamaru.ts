import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { calculateCombatPower } from "./combat-power.ts";
import { swapPlayerRedeployPositionsByEffect } from "./board.ts";
import { grantCardAbilityReuse, grantSkillAbilityReuse } from "./ability-reuse.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { playerAllowsActionAbilitiesInCombat } from "./card-rule-modifiers.ts";

export const USHIWAKAMARU_ICICLE_ID = "servant.ushiwakamaru.skill.sc-ushiwakamaru-1";
export const USHIWAKAMARU_EIGHT_BOAT_ID = "servant.ushiwakamaru.skill.sc-ushiwakamaru-2";
export const USHIWAKAMARU_ICICLE_HANDLER = "core.ushiwakamaru-icicle-cutter";
export const USHIWAKAMARU_EIGHT_BOAT_HANDLER = "core.ushiwakamaru-eight-boat-leap";

const WHIRLING_SLASHES_ABILITY = "whirling-slashes";
const EIGHT_BOAT_ABILITY = "eight-boat-leap";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.zone === "attack" && card.face === "up" && card.active
      && (card.ownerPlayerId === player.id || card.controllerPlayerId === player.id)
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function authoredAbilityUsesActionOrCombat(definition: CardDefinition, abilityId: string): boolean {
  const ability = definition.rules?.abilities.find((candidate) => candidate.id === abilityId);
  if (!ability) return false;
  const phase = ability.activation?.phase;
  const phases = ability.activation?.phases ?? [];
  return phase === "action" || phase === "combat" || phases.includes("action") || phases.includes("combat");
}

function usageWasConsumedThisRound(usage: { used?: boolean; round?: number } | undefined, round: number): boolean {
  return usage?.used === true && usage.round === round;
}

function grantWhirlingReuse(
  state: GameState,
  player: PlayerState,
  sourceSkillId: string,
  targetInstanceId: string,
  targetAbilityId: string,
  definitions: Record<string, CardDefinition>,
): { kind: "skill" | "card"; targetId: string; abilityId: string } {
  const target = state.cards[targetInstanceId];
  const definition = target ? definitions[target.definitionId] : undefined;
  if (!target || !definition || target.zone !== "attack" || target.face !== "up" || !target.active
    || (target.ownerPlayerId !== player.id && target.controllerPlayerId !== player.id)) {
    throw new Error("USHIWAKAMARU_WHIRLING_TARGET_INVALID");
  }

  const targetSkillId = definition.linkedSkillId;
  if (targetSkillId) {
    if (targetSkillId === sourceSkillId) throw new Error("USHIWAKAMARU_WHIRLING_RECURSION_FORBIDDEN");
    if (!authoredAbilityUsesActionOrCombat(definition, targetAbilityId)) throw new Error("USHIWAKAMARU_WHIRLING_ABILITY_INVALID");
    const abilityUsageKey = `${targetSkillId}:${targetAbilityId}`;
    if (usageWasConsumedThisRound(player.usage[abilityUsageKey], state.round)) {
      grantSkillAbilityReuse(player, sourceSkillId, state.round, targetSkillId, targetAbilityId);
      return { kind: "skill", targetId: targetSkillId, abilityId: targetAbilityId };
    }
    if (usageWasConsumedThisRound(player.usage[targetSkillId], state.round)) {
      grantSkillAbilityReuse(player, sourceSkillId, state.round, targetSkillId, "__skill__");
      return { kind: "skill", targetId: targetSkillId, abilityId: "__skill__" };
    }
    throw new Error("USHIWAKAMARU_WHIRLING_ABILITY_NOT_USED");
  }

  if (!definition.cardAbilityIds?.includes(targetAbilityId)
    || !definition.phases?.some((phase) => phase === "action" || phase === "combat")) {
    throw new Error("USHIWAKAMARU_WHIRLING_ABILITY_INVALID");
  }
  if (!usageWasConsumedThisRound(target.abilityUsage?.[targetAbilityId], state.round)) {
    throw new Error("USHIWAKAMARU_WHIRLING_ABILITY_NOT_USED");
  }
  grantCardAbilityReuse(player, sourceSkillId, state.round, target.instanceId, targetAbilityId);
  return { kind: "card", targetId: target.instanceId, abilityId: targetAbilityId };
}

/** Icicle Cutter's continuous Action-in-Combat permission is carried by a generic card tag; this handler resolves Whirling Slashes. */
export const useUshiwakamaruIcicleCutter: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("USHIWAKAMARU_ICICLE_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== WHIRLING_SLASHES_ABILITY || state.phase !== "combat") throw new Error("USHIWAKAMARU_WHIRLING_WINDOW_INVALID");
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("USHIWAKAMARU_ICICLE_SOURCE_INACTIVE");
  const targetInstanceId = typeof data.targetInstanceId === "string" ? data.targetInstanceId : undefined;
  const targetAbilityId = typeof data.targetAbilityId === "string" ? data.targetAbilityId : undefined;
  if (!targetInstanceId || !targetAbilityId) throw new Error("USHIWAKAMARU_WHIRLING_TARGET_REQUIRED");
  return grantWhirlingReuse(state, player, skill.id, targetInstanceId, targetAbilityId, definitions);
};

export const isUshiwakamaruIcicleCutterLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === WHIRLING_SLASHES_ABILITY && state.phase === "combat"
    && state.activePlayerId === playerId && activeOwnedSkill(state, player, skill.id, definitions));
};

function otherLivingPlayerIds(state: GameState, playerId: string): string[] {
  return state.turnOrder.filter((id) => id !== playerId && Boolean(state.players[id] && !state.players[id].eliminated));
}

/** Eight Boat Leap compares current structured power and performs a fully atomic redeployment swap. */
export const useUshiwakamaruEightBoatLeap: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("USHIWAKAMARU_EIGHT_BOAT_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const windowAllowed = state.phase === "action"
    || (state.phase === "combat" && playerAllowsActionAbilitiesInCombat(state, player, definitions));
  if (data.abilityId !== EIGHT_BOAT_ABILITY || !windowAllowed || state.activePlayerId !== player.id) {
    throw new Error("USHIWAKAMARU_EIGHT_BOAT_WINDOW_INVALID");
  }
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("USHIWAKAMARU_EIGHT_BOAT_SOURCE_INACTIVE");
  const targetPlayerId = typeof data.targetPlayerId === "string" ? data.targetPlayerId : undefined;
  if (!targetPlayerId || !otherLivingPlayerIds(state, player.id).includes(targetPlayerId)) throw new Error("USHIWAKAMARU_EIGHT_BOAT_TARGET_INVALID");
  const target = state.players[targetPlayerId];
  const controllerPower = calculateCombatPower(state, player, definitions, player.locationId ?? undefined);
  const targetPower = calculateCombatPower(state, target, definitions, target.locationId ?? undefined);
  if (controllerPower <= targetPower) return { controllerPower, targetPower, swapped: false, reason: "power-not-higher" };
  const swaps = swapPlayerRedeployPositionsByEffect(state, player.id, targetPlayerId, definitions);
  for (const result of swaps) {
    emitEvent?.("player.deployed", { playerId: result.playerId, locationId: result.locationId, method: "redeploy-effect", sourceSkillId: skill.id });
    emitEvent?.("player.entered-location", {
      playerId: result.playerId,
      previousLocationId: result.previousLocationId,
      locationId: result.locationId,
      method: "redeploy-effect",
      distance: 0,
      sourceSkillId: skill.id,
    });
  }
  return { controllerPower, targetPower, swapped: swaps.length === 2, swaps };
};

export const isUshiwakamaruEightBoatLeapLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  const windowAllowed = Boolean(player && definitions && (state.phase === "action"
    || (state.phase === "combat" && playerAllowsActionAbilitiesInCombat(state, player, definitions))));
  return Boolean(player && definitions && ability?.id === EIGHT_BOAT_ABILITY && windowAllowed
    && state.activePlayerId === playerId && activeOwnedSkill(state, player, skill.id, definitions)
    && otherLivingPlayerIds(state, playerId).length > 0);
};
