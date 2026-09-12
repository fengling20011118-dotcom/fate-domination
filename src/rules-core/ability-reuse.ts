import type { AbilityReuseGrantState, PlayerState } from "../domain/state/types.ts";

export type AbilityReuseGrant = AbilityReuseGrantState;

function read(player: PlayerState): AbilityReuseGrant[] {
  return (player.abilityReuseGrants ?? []).filter((entry) => entry.round >= 0
    && entry.sourceId.length > 0 && entry.abilityId.length > 0
    && (entry.remainingUses === undefined || (Number.isInteger(entry.remainingUses) && entry.remainingUses > 0))
    && (entry.kind === "skill" ? Boolean(entry.targetSkillId) : Boolean(entry.targetInstanceId)));
}

function write(player: PlayerState, grants: AbilityReuseGrant[]): void {
  if (grants.length > 0) player.abilityReuseGrants = grants.map((grant) => ({ ...grant }));
  else delete player.abilityReuseGrants;
}

export function grantSkillAbilityReuse(player: PlayerState, sourceId: string, round: number, targetSkillId: string, abilityId: string): void {
  grantSkillAbilityReuses(player, sourceId, round, targetSkillId, abilityId, 1);
}

/** Grant a bounded number of extra uses while preserving the legacy one-shot helper. */
export function grantSkillAbilityReuses(player: PlayerState, sourceId: string, round: number, targetSkillId: string, abilityId: string, count: number): void {
  if (!sourceId || !targetSkillId || !abilityId || !Number.isInteger(round) || round < 0 || !Number.isInteger(count) || count <= 0) {
    throw new Error("ABILITY_REUSE_GRANT_INVALID");
  }
  const grants = read(player).filter((grant) => !(grant.kind === "skill" && grant.round === round
    && grant.targetSkillId === targetSkillId && grant.abilityId === abilityId));
  write(player, [...grants, { kind: "skill", sourceId, round, targetSkillId, abilityId, ...(count > 1 ? { remainingUses: count } : {}) }]);
}

export function grantCardAbilityReuse(player: PlayerState, sourceId: string, round: number, targetInstanceId: string, abilityId: string): void {
  if (!sourceId || !targetInstanceId || !abilityId || !Number.isInteger(round) || round < 0) throw new Error("ABILITY_REUSE_GRANT_INVALID");
  const grants = read(player).filter((grant) => !(grant.kind === "card" && grant.round === round
    && grant.targetInstanceId === targetInstanceId && grant.abilityId === abilityId));
  write(player, [...grants, { kind: "card", sourceId, round, targetInstanceId, abilityId }]);
}

export function hasSkillAbilityReuse(player: PlayerState, round: number, targetSkillId: string, abilityId: string): boolean {
  return read(player).some((grant) => grant.kind === "skill" && grant.round === round
    && grant.targetSkillId === targetSkillId && grant.abilityId === abilityId);
}

export function consumeSkillAbilityReuse(player: PlayerState, round: number, targetSkillId: string, abilityId: string): boolean {
  const grants = read(player);
  const index = grants.findIndex((grant) => grant.kind === "skill" && grant.round === round
    && grant.targetSkillId === targetSkillId && grant.abilityId === abilityId);
  if (index < 0) return false;
  const remaining = Number(grants[index].remainingUses ?? 1);
  if (remaining > 1) grants[index] = { ...grants[index], remainingUses: remaining - 1 };
  else grants.splice(index, 1);
  write(player, grants);
  return true;
}

export function hasCardAbilityReuse(player: PlayerState, round: number, targetInstanceId: string, abilityId: string): boolean {
  return read(player).some((grant) => grant.kind === "card" && grant.round === round
    && grant.targetInstanceId === targetInstanceId && grant.abilityId === abilityId);
}

export function consumeCardAbilityReuse(player: PlayerState, round: number, targetInstanceId: string, abilityId: string): boolean {
  const grants = read(player);
  const index = grants.findIndex((grant) => grant.kind === "card" && grant.round === round
    && grant.targetInstanceId === targetInstanceId && grant.abilityId === abilityId);
  if (index < 0) return false;
  grants.splice(index, 1);
  write(player, grants);
  return true;
}
