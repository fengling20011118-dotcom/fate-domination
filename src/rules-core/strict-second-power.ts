import type { GameState } from "../domain/state/types.ts";
import type { CombatPowerSnapshot } from "./combat.ts";
import type { CardDefinition } from "./content-types.ts";
import { applyDefeatEffect } from "./defeat.ts";
import type { SkillContext } from "./skill-types.ts";

/**
 * Shared post-power condition used by effects that punish the highest-power
 * opponents when the controller is the strict second tier in a 3+ player fight.
 */
export function strictSecondPowerCondition(snapshot: CombatPowerSnapshot, playerId: string): boolean {
  if (!snapshot.participantIds.includes(playerId) || snapshot.participantIds.length < 3) return false;
  const opponents = snapshot.participantIds.filter((id) => id !== playerId);
  const ownPower = snapshot.powers[playerId];
  if (!Number.isFinite(ownPower)) return false;
  const highest = Math.max(...opponents.map((id) => Number(snapshot.powers[id])));
  if (!Number.isFinite(highest) || ownPower >= highest) return false;
  return !opponents.some((id) => snapshot.powers[id] !== highest && snapshot.powers[id] > ownPower);
}

export function defeatStrictSecondHighestOpponents(
  state: GameState,
  snapshot: CombatPowerSnapshot,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent: SkillContext["emitEvent"],
  sourceId: string,
): string[] {
  if (!strictSecondPowerCondition(snapshot, playerId)) throw new Error("STRICT_SECOND_CONDITION_NOT_MET");
  const opponents = snapshot.participantIds.filter((id) => id !== playerId);
  const highest = Math.max(...opponents.map((id) => snapshot.powers[id]));
  const defeatedPlayerIds: string[] = [];
  for (const opponentId of opponents) {
    if (snapshot.powers[opponentId] !== highest) continue;
    applyDefeatEffect(state, opponentId, playerId, definitions, emitEvent, { sourceId, reason: "strict-second" });
    defeatedPlayerIds.push(opponentId);
  }
  return defeatedPlayerIds;
}
