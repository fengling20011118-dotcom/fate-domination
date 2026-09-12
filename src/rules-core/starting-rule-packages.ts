import type { GameState } from "../domain/state/types.ts";
import { getNamedEventPoolAvailableIds, releaseNamedEventToMainDeck, shuffleMainEventDeck } from "./event-lifecycle.ts";
import { upsertNpcCombatant } from "./npc-combatants.ts";
import type { SkillDefinition } from "./skill-types.ts";

function identityOwns(state: GameState, playerId: string, skill: SkillDefinition): boolean {
  const player = state.players[playerId];
  if (!player || player.eliminated || skill.initiallyOwned === false || skill.supportLevel !== "FULL") return false;
  return skill.ownerType === "master" ? player.masterId === skill.ownerId : player.servantId === skill.ownerId;
}

/** Apply authored setup rules after named side pools exist but before round 1 is built. */
export function applyStartingRulePackages(
  state: GameState,
  skills: readonly SkillDefinition[],
  randomInt: (maxExclusive: number) => number,
): void {
  for (const player of Object.values(state.players)) {
    const owned = skills.filter((skill) => identityOwns(state, player.id, skill));
    for (const skill of owned) {
      const npc = skill.startingNpcCombatant;
      if (npc) {
        upsertNpcCombatant(state, {
          id: npc.id,
          name: npc.name,
          sourceId: skill.id,
          controllerPlayerId: player.id,
          basePower: npc.basePower,
          ...(npc.presenceEventTag ? { presenceEventTag: npc.presenceEventTag } : {}),
        });
      }
      const injection = skill.startingNamedEventPoolInjection;
      if (!injection) continue;
      if (!injection.poolId || !Number.isInteger(injection.count) || injection.count < 0) throw new Error("STARTING_EVENT_POOL_INJECTION_INVALID");
      const revealed: string[] = [];
      for (let index = 0; index < injection.count; index += 1) {
        const available = getNamedEventPoolAvailableIds(state, injection.poolId);
        if (available.length === 0) break;
        const selectedIndex = randomInt(available.length);
        if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= available.length) throw new Error("STARTING_EVENT_POOL_INJECTION_RANDOM_INVALID");
        const eventId = available[selectedIndex];
        releaseNamedEventToMainDeck(state, injection.poolId, eventId);
        revealed.push(eventId);
      }
      if (revealed.length > 0) shuffleMainEventDeck(state, randomInt);
      const prior = Array.isArray(state.modeState.startingRuleRevealedEventIds)
        ? state.modeState.startingRuleRevealedEventIds.filter((id): id is string => typeof id === "string")
        : [];
      state.modeState.startingRuleRevealedEventIds = [...prior, ...revealed];
    }
  }
}
