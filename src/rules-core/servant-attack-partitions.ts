import type { GameState, PlayerState, ServantAttackPartitionRule } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";

function sourceStillOwned(
  state: GameState,
  player: PlayerState,
  rule: ServantAttackPartitionRule,
  definitions: Record<string, CardDefinition>,
): boolean {
  if (player.servantId !== rule.servantId) return false;
  return [...player.servantSkills, ...player.attack, ...player.hand].some((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    return Boolean(instance && instance.ownerPlayerId === player.id && instance.zone !== "removed" && instance.zone !== "discard"
      && (instance.definitionId === rule.sourceId || definition?.linkedSkillId === rule.sourceId));
  });
}

export function getActiveServantAttackPartitionRules(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): ServantAttackPartitionRule[] {
  return (player.servantAttackPartitionRules ?? []).filter((rule) => sourceStillOwned(state, player, rule, definitions));
}

export function installServantAttackPartitionRule(player: PlayerState, rule: ServantAttackPartitionRule): void {
  if (!rule.id || !rule.sourceId || !rule.servantId) throw new Error("SERVANT_ATTACK_PARTITION_RULE_INVALID");
  if (rule.firstGroupDefinitionIds.length === 0 || rule.secondGroupDefinitionIds.length === 0) throw new Error("SERVANT_ATTACK_PARTITION_GROUP_EMPTY");
  const first = new Set(rule.firstGroupDefinitionIds);
  if (rule.secondGroupDefinitionIds.some((definitionId) => first.has(definitionId))) throw new Error("SERVANT_ATTACK_PARTITION_OVERLAP");
  const applications = rule.powerAlterationApplications ?? 1;
  if (!Number.isInteger(applications) || applications < 1) throw new Error("SERVANT_ATTACK_POWER_APPLICATIONS_INVALID");
  player.servantAttackPartitionRules = [
    ...(player.servantAttackPartitionRules ?? []).filter((candidate) => candidate.id !== rule.id),
    structuredClone(rule),
  ];
}

export type ServantAttackPartition = "first" | "second" | null;

export function classifyServantAttackDefinition(
  state: GameState,
  player: PlayerState,
  definitionId: string,
  definitions: Record<string, CardDefinition>,
): ServantAttackPartition {
  for (const rule of getActiveServantAttackPartitionRules(state, player, definitions)) {
    if (rule.firstGroupDefinitionIds.includes(definitionId)) return "first";
    if (rule.secondGroupDefinitionIds.includes(definitionId)) return "second";
  }
  return null;
}

export function assertServantAttackRegularPairAllowed(
  state: GameState,
  player: PlayerState,
  faceUpRegularInstanceIds: readonly string[],
  definitions: Record<string, CardDefinition>,
): void {
  if (faceUpRegularInstanceIds.length !== 2) return;
  for (const rule of getActiveServantAttackPartitionRules(state, player, definitions)) {
    if (rule.requireMixedRegularPair !== true) continue;
    const groups = faceUpRegularInstanceIds.map((instanceId) => {
      const definitionId = state.cards[instanceId]?.definitionId;
      if (!definitionId) return null;
      if (rule.firstGroupDefinitionIds.includes(definitionId)) return "first" as const;
      if (rule.secondGroupDefinitionIds.includes(definitionId)) return "second" as const;
      return null;
    });
    // Ruling: the restriction applies only if both ordinary cards belong to this Servant.
    if (groups.some((group) => group === null)) continue;
    if (groups[0] === groups[1]) throw new Error("SERVANT_ATTACK_PARTITION_PAIR_INVALID");
  }
}

export function getServantAttackPowerAlterationApplications(
  state: GameState,
  player: PlayerState,
  definitionId: string,
  definitions: Record<string, CardDefinition>,
): number {
  let applications = 1;
  for (const rule of getActiveServantAttackPartitionRules(state, player, definitions)) {
    const belongs = rule.firstGroupDefinitionIds.includes(definitionId) || rule.secondGroupDefinitionIds.includes(definitionId);
    if (!belongs) continue;
    applications = Math.max(applications, rule.powerAlterationApplications ?? 1);
  }
  return applications;
}
