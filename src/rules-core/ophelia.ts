import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { beginLostbeltExpansion } from "./lostbelt.ts";
import { calculateCombatCardPower, getActiveCombatCardIds } from "./combat-power.ts";
import { addAttackPrintedBaseCeilingRule } from "./attack-power-ceilings.ts";
import { payManaCost } from "./costs.ts";
import { moveEvent } from "./event-lifecycle.ts";

export const OPHELIA_CRYPTER_HANDLER = "core.ophelia-crypter";
export const OPHELIA_PROLONGATION_HANDLER = "core.ophelia-prolongation";
export const OPHELIA_WORLD_EATER_HANDLER = "core.ophelia-world-eater";
export const OPHELIA_SCANDINAVIAN_POOL_ID = "lostbelt:scandinavia";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const useOpheliaCrypter: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision }) => {
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType !== "combat.resolved") return;
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds : [];
  if (!winnerIds.includes(player.id)) return;
  if (!definitions || !randomInt) throw new Error("OPHELIA_CRYPTER_CONTEXT_REQUIRED");
  return beginLostbeltExpansion(state, player, skill.id, OPHELIA_SCANDINAVIAN_POOL_ID, 1, definitions, randomInt, openDecision);
};

function prolongationTargets(state: Parameters<SkillHandler>[0]["state"], playerId: string): string[] {
  const player = state.players[playerId];
  const locationId = player?.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== playerId && !state.players[id]?.eliminated);
}

export const isOpheliaProlongationLegal: SkillLegalityPredicate = (state, playerId) => {
  const player = state.players[playerId];
  return Boolean(player && !player.eliminated && state.phase === "action" && state.activePlayerId === playerId
    && player.mana >= 2 && prolongationTargets(state, playerId).length > 0);
};

export const useOpheliaProlongation: SkillHandler = ({ state, player, skill, definitions }) => {
  if (!definitions || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("OPHELIA_PROLONGATION_WINDOW_INVALID");
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("OPHELIA_PROLONGATION_BATTLEFIELD_REQUIRED");
  const targetPlayerIds = prolongationTargets(state, player.id);
  if (targetPlayerIds.length === 0) throw new Error("OPHELIA_PROLONGATION_NO_OPPONENTS");
  const grandfatheredCeilings: Record<string, number> = {};
  for (const targetPlayerId of targetPlayerIds) {
    const target = state.players[targetPlayerId];
    for (const instanceId of getActiveCombatCardIds(state, target)) {
      grandfatheredCeilings[instanceId] = calculateCombatCardPower(state, target, instanceId, definitions, locationId);
    }
  }
  payManaCost(state, player, 2, definitions, "OPHELIA_PROLONGATION_MANA_REQUIRED");
  addAttackPrintedBaseCeilingRule(state, {
    sourceId: `${skill.id}:${state.round}:${state.revision}`,
    controllerPlayerId: player.id,
    locationId,
    round: state.round,
    targetPlayerIds,
    grandfatheredCeilings,
  });
  return { paidMana: 2, targetPlayerIds, grandfatheredCeilings };
};

function addWorldEaterPower(state: Parameters<SkillHandler>[0]["state"], playerId: string, skillId: string, amount: number, definitions: NonNullable<Parameters<SkillHandler>[0]["definitions"]>): void {
  for (const card of Object.values(state.cards)) {
    if (card.ownerPlayerId !== playerId || card.zone === "removed") continue;
    const definition = definitions[card.definitionId];
    if (card.definitionId !== skillId && definition?.linkedSkillId !== skillId) continue;
    const modifierId = `${skillId}:removed-objectives`;
    card.powerModifiers = [
      ...(card.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
      { id: modifierId, sourceId: skillId, kind: "add", value: amount, duration: "game" },
    ];
  }
}

export const useOpheliaWorldEater: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) return;
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType !== "combat.resolved") return;
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds : [];
  if (!winnerIds.includes(player.id)) return;
  const locationId = event.locationId === "mountain" || event.locationId === "city" ? event.locationId : undefined;
  if (!locationId) return;
  const eventIds = Array.isArray(event.eventIds) ? event.eventIds.filter((id): id is string => typeof id === "string") : [];
  let removed = 0;
  for (const eventId of eventIds) {
    const definition = definitions[eventId];
    if (!definition) continue;
    if ((state.board.currentEvents[locationId] ?? []).includes(eventId)) {
      moveEvent(state, eventId, { zone: "removed" });
      removed += 1;
      continue;
    }
    // A Day of Peace has a mandatory self-removal at this same combat
    // resolution. The combat snapshot still proves it was an objective in the
    // won fight, so World Eater must count that simultaneous removal as well.
    if (state.board.eventRemoved.includes(eventId) && definition.tags?.includes("lostbelt:remove-after-combat")) removed += 1;
  }
  if (removed <= 0) return { removed: 0 };
  const total = Number(player.flags.opheliaWorldEaterRemovedCount ?? 0) + removed;
  if (!Number.isInteger(total) || total < 0) throw new Error("OPHELIA_WORLD_EATER_COUNT_INVALID");
  player.flags.opheliaWorldEaterRemovedCount = total;
  addWorldEaterPower(state, player.id, skill.id, total * 3, definitions);
  return { removed, totalRemoved: total, powerBonus: total * 3 };
};
