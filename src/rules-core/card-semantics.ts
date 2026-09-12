import type { CardInstance, CardZone } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { getEffectiveCardUsageLimit } from "./usage-limits.ts";

export function isSkillCard(definition: CardDefinition, instance: CardInstance): boolean {
  return Boolean(definition.isSkill || definition.skillOwnerType || instance.definitionId.startsWith("master.") || instance.definitionId.startsWith("servant."));
}

export function getClosedCardZone(
  definition: CardDefinition,
  instance: CardInstance,
  removeFromGame = false,
): Extract<CardZone, "removed" | "master-skills" | "servant-skills" | "discard"> {
  if (removeFromGame) return "removed";
  const effectiveLimit = getEffectiveCardUsageLimit(instance, definition.limit);
  if ((effectiveLimit === "once-per-game" && instance.used === true)
    || (effectiveLimit === "twice-per-game" && Number(instance.usedGameCount ?? 0) >= 2)) return "removed";
  if (!isSkillCard(definition, instance)) return "discard";
  return definition.skillOwnerType === "servant" || instance.definitionId.startsWith("servant.")
    ? "servant-skills"
    : "master-skills";
}

