import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";

/** Stable IDs and state helpers for the English-version Jekyll/Hyde card. */
export const JEKYLL_SERVANT_ID = "servant.jekyll";
export const JEKYLL_BEAST_SKILL_ID = "servant.jekyll.skill.sc-jekyll-2";
export type JekyllForm = "jekyll" | "hyde";

export function applyJekyllHydeRoundStart(state: GameState): void {
  for (const player of Object.values(state.players)) {
    if (player.servantId !== JEKYLL_SERVANT_ID) {
      player.form = null;
      continue;
    }
    // The card's passive changes the form on odd rounds and returns to
    // Jekyll on even rounds; the form is not a player choice.
    player.form = state.round % 2 === 1 ? "hyde" : "jekyll";
  }
}

export function isJekyll(player: Pick<PlayerState, "servantId" | "form">): boolean {
  return player.servantId === JEKYLL_SERVANT_ID && player.form === "jekyll";
}

export function isHyde(player: Pick<PlayerState, "servantId" | "form">): boolean {
  return player.servantId === JEKYLL_SERVANT_ID && player.form === "hyde";
}

export function ignoresDefeat(player: Pick<PlayerState, "servantId" | "form">): boolean {
  return isHyde(player);
}

export function getJekyllMoveDiscount(player: Pick<PlayerState, "servantId" | "form">): number {
  return isJekyll(player) ? 1 : 0;
}

export function isJekyllBeastCard(player: Pick<PlayerState, "servantId" | "form">, definition: Pick<CardDefinition, "id">): boolean {
  return player.servantId === JEKYLL_SERVANT_ID && definition.id === JEKYLL_BEAST_SKILL_ID;
}

export function isJekyllBeastActive(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  return player.attack.some((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    return Boolean(instance?.active && instance.face === "up" && definition && isJekyllBeastCard(player, definition));
  });
}

export function getJekyllCombatPowerOverride(player: PlayerState, round: number): number | null {
  const zeroRound = player.flags.jekyllZeroPowerRound;
  return Number.isInteger(zeroRound) && zeroRound === round ? 0 : null;
}
