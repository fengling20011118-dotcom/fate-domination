import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";

function matchesSkill(instance: CardInstance, skillId: string, definitions?: Record<string, CardDefinition>): boolean {
  const definition = definitions?.[instance.definitionId];
  return instance.definitionId === skillId || instance.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

/** Return the one physical replacement-copy used to supply this skill to a non-owner. */
export function getOwnedSkillCopyReplacement(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions?: Record<string, CardDefinition>,
): CardInstance | undefined {
  const ids = [...player.masterSkills, ...player.servantSkills, ...player.attack, ...player.hand];
  const copies = ids.map((instanceId) => state.cards[instanceId]).filter((instance): instance is CardInstance => Boolean(
    instance && instance.ownerPlayerId === player.id && instance.zone !== "removed"
      && instance.skillCopyReplacement && instance.skillCopyReplacement.sourceSkillId === skillId
      && matchesSkill(instance, skillId, definitions),
  ));
  if (copies.length > 1) throw new Error("SKILL_COPY_REPLACEMENT_CONFLICT");
  return copies[0];
}

/** Return a physical full-text Skill copy that grants the source definition to this controller. */
export function getOwnedFullTextSkillCopy(
  state: GameState,
  player: PlayerState,
  skillId: string,
): CardInstance | undefined {
  return [...player.masterSkills, ...player.servantSkills, ...player.attack, ...player.hand]
    .map((instanceId) => state.cards[instanceId])
    .find((instance): instance is CardInstance => Boolean(instance
      && instance.ownerPlayerId === player.id
      && instance.zone !== "removed"
      && instance.fullSkillCopy?.sourceSkillId === skillId));
}

export function getOwnedSkillCopyIds(state: GameState, player: PlayerState): string[] {
  return [...new Set([...player.masterSkills, ...player.servantSkills, ...player.attack, ...player.hand]
    .map((instanceId) => state.cards[instanceId]?.skillCopyReplacement?.sourceSkillId)
    .filter((skillId): skillId is string => typeof skillId === "string" && skillId.length > 0))];
}

export function isSkillCopyPassiveTextSuppressed(instance: CardInstance | undefined): boolean {
  return Boolean(instance?.skillCopyReplacement);
}
