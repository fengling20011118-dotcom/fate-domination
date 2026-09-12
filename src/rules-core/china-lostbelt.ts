import type { GameState, PlayerState } from "../domain/state/types.ts";
import { CHINESE_LOSTBELT_POOL_ID } from "../content/lostbelt-objectives.ts";
import type { CardDefinition } from "./content-types.ts";
import { getNamedEventPoolAvailableIds, releaseNamedEventToMainDeck, shuffleMainEventDeck } from "./event-lifecycle.ts";
import { getPrintedCardBasePower } from "./card-values.ts";

export { CHINESE_LOSTBELT_POOL_ID };

function tags(definition: CardDefinition | undefined): string[] {
  return definition?.tags?.filter((tag): tag is string => typeof tag === "string") ?? [];
}

function currentChinaDefinitions(state: GameState, locationId: string | null | undefined, definitions: Record<string, CardDefinition>): CardDefinition[] {
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.currentEvents[locationId] ?? [])
    .map((eventId) => definitions[eventId])
    .filter((definition): definition is CardDefinition => Boolean(definition?.tags?.includes("lostbelt-group:china")));
}

/** Chinese Lostbelt expansion: randomly reveal one outside objective, then shuffle it into the main objective deck. */
export function expandChineseLostbelt(
  state: GameState,
  randomInt: (maxExclusive: number) => number,
  count = 1,
): string[] {
  if (!Number.isInteger(count) || count < 0) throw new Error("CHINA_EXPANSION_COUNT_INVALID");
  const expanded: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const available = getNamedEventPoolAvailableIds(state, CHINESE_LOSTBELT_POOL_ID);
    if (available.length === 0) break;
    const selectedIndex = randomInt(available.length);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= available.length) throw new Error("CHINA_EXPANSION_RANDOM_INVALID");
    const eventId = available[selectedIndex];
    releaseNamedEventToMainDeck(state, CHINESE_LOSTBELT_POOL_ID, eventId);
    expanded.push(eventId);
  }
  if (expanded.length > 0) shuffleMainEventDeck(state, randomInt);
  const prior = Array.isArray(state.modeState.chinaRevealedExpansionEventIds)
    ? state.modeState.chinaRevealedExpansionEventIds.filter((id): id is string => typeof id === "string")
    : [];
  state.modeState.chinaRevealedExpansionEventIds = [...prior, ...expanded];
  return expanded;
}

/** Quest for Perfection doubles only positive Event/Objective attack-power effects on this battlefield. */
export function getChinesePositiveBoardPowerMultiplier(state: GameState, locationId: string | null | undefined, definitions: Record<string, CardDefinition>): number {
  return currentChinaDefinitions(state, locationId, definitions).some((definition) => tags(definition).includes("china-positive-board-power-x2")) ? 2 : 1;
}

/** Quest for Immortality makes everyone on its battlefield ignore defeat. */
export function isChineseObjectiveDefeatIgnored(state: GameState, locationId: string | null | undefined, definitions: Record<string, CardDefinition>): boolean {
  return currentChinaDefinitions(state, locationId, definitions).some((definition) => tags(definition).includes("china-defeat-immunity"));
}

/** Deep Tranquility/Dive/Lore prohibit the named attack attribute on that battlefield. */
export function getChineseForbiddenAttributes(state: GameState, locationId: string | null | undefined, definitions: Record<string, CardDefinition>): string[] {
  const prefix = "china-forbid-attribute:";
  return [...new Set(currentChinaDefinitions(state, locationId, definitions).flatMap((definition) =>
    tags(definition).filter((tag) => tag.startsWith(prefix)).map((tag) => tag.slice(prefix.length)).filter(Boolean)))];
}

function activeFaceUpAttackIds(state: GameState, player: PlayerState): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card?.active && card.face === "up" && card.zone === "attack");
  });
}

/** Conditional +5 total-power clauses printed on Chinese objectives. */
export function getChineseObjectiveTotalPowerBonus(
  state: GameState,
  player: PlayerState,
  locationId: string | null | undefined,
  definitions: Record<string, CardDefinition>,
): number {
  const current = currentChinaDefinitions(state, locationId, definitions);
  if (current.length === 0) return 0;
  const activeIds = activeFaceUpAttackIds(state, player);
  let total = 0;
  for (const definition of current) {
    for (const tag of tags(definition)) {
      if (tag.startsWith("china-total-power:single-face-up:")) {
        const amount = Number(tag.slice("china-total-power:single-face-up:".length));
        if (!Number.isInteger(amount)) throw new Error("CHINA_TOTAL_POWER_BONUS_INVALID");
        if (Number(player.flags.faceUpCardsPlayedThisRound ?? 0) === 1) total += amount;
      }
      if (tag.startsWith("china-total-power:all-active-printed-even:")) {
        const amount = Number(tag.slice("china-total-power:all-active-printed-even:".length));
        if (!Number.isInteger(amount)) throw new Error("CHINA_TOTAL_POWER_BONUS_INVALID");
        const allEven = activeIds.length > 0 && activeIds.every((instanceId) => {
          const card = state.cards[instanceId];
          const printedDefinitionId = card.temporaryDefinitionCopy?.originalDefinitionId ?? card.definitionId;
          const printed = definitions[printedDefinitionId];
          return Boolean(printed && getPrintedCardBasePower(state, player, printed) % 2 === 0);
        });
        if (allEven) total += amount;
      }
    }
  }
  return total;
}
