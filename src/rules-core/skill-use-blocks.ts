import type { PlayerState, SkillUseBlockState } from "../domain/state/types.ts";

export function addSkillUseBlock(player: PlayerState, block: SkillUseBlockState): void {
  if (!block.id || !block.sourceId || !Number.isInteger(block.throughRound) || block.throughRound < 0
    || !Array.isArray(block.definitionIds) || block.definitionIds.some((id) => typeof id !== "string" || !id)
    || (block.instanceIds !== undefined && (!Array.isArray(block.instanceIds) || block.instanceIds.some((id) => typeof id !== "string" || !id)))
    || (block.sourcePlayerId !== undefined && (typeof block.sourcePlayerId !== "string" || !block.sourcePlayerId))
    || (block.definitionIds.length === 0 && (block.instanceIds?.length ?? 0) === 0)) {
    throw new Error("SKILL_USE_BLOCK_INVALID");
  }
  const definitionIds = [...new Set(block.definitionIds)];
  const instanceIds = block.instanceIds ? [...new Set(block.instanceIds)] : undefined;
  player.skillUseBlocks = [
    ...(player.skillUseBlocks ?? []).filter((existing) => existing.id !== block.id),
    { ...block, definitionIds, ...(instanceIds ? { instanceIds } : {}) },
  ];
}

export function getSkillUseBlocks(player: PlayerState | undefined, round: number, skillId: string): SkillUseBlockState[] {
  if (!player || !Number.isInteger(round) || !skillId) return [];
  return (player.skillUseBlocks ?? []).filter((block) => block.throughRound >= round && block.definitionIds.includes(skillId));
}

export function isSkillUseBlocked(player: PlayerState | undefined, round: number, skillId: string): boolean {
  return getSkillUseBlocks(player, round, skillId).length > 0;
}

/** Active blocks scoped to one physical Skill card. Callers decide whether an opposing ability-immunity rule suppresses each block. */
export function getPhysicalSkillUseBlocks(player: PlayerState | undefined, round: number, instanceId: string): SkillUseBlockState[] {
  if (!player || !Number.isInteger(round) || !instanceId) return [];
  return (player.skillUseBlocks ?? []).filter((block) => block.throughRound >= round && block.instanceIds?.includes(instanceId));
}

export function pruneExpiredSkillUseBlocks(player: PlayerState, round: number): void {
  if (!player.skillUseBlocks?.length) return;
  const active = player.skillUseBlocks.filter((block) => block.throughRound >= round);
  if (active.length) player.skillUseBlocks = active;
  else delete player.skillUseBlocks;
}
