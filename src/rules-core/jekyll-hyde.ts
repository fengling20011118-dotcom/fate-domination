import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillHandler } from "./skill-types.ts";
import { gainVictoryPoints } from "./resources.ts";
import { playerIgnoresDefeat } from "./defeat.ts";

export const ignoresDefeat = playerIgnoresDefeat;
export { playerIgnoresDefeat };

/** Stable IDs are confined to this character package; generic runtime consumes only flags/tags. */
export const JEKYLL_SERVANT_ID = "servant.jekyll";
export const JEKYLL_DANGEROUS_GAME_ID = "servant.jekyll.skill.sc-jekyll-1";
export const JEKYLL_BEAST_SKILL_ID = "servant.jekyll.skill.sc-jekyll-2";
export const JEKYLL_DANGEROUS_GAME_HANDLER = "core.jekyll-dangerous-game";
export const JEKYLL_LYCANTHROPY_HANDLER = "core.jekyll-lycanthropy";
export type JekyllForm = "jekyll" | "hyde";

export function isJekyll(player: Pick<PlayerState, "servantId" | "form">): boolean {
  return player.servantId === JEKYLL_SERVANT_ID && player.form === "jekyll";
}

export function isHyde(player: Pick<PlayerState, "servantId" | "form">): boolean {
  return player.servantId === JEKYLL_SERVANT_ID && player.form === "hyde";
}

/** Dangerous Game cannot be lost, so state derives from servant identity at round start. */
export function applyJekyllHydeRoundStart(state: GameState, playerId?: string): void {
  const players = playerId ? [state.players[playerId]].filter(Boolean) : Object.values(state.players);
  for (const player of players) {
    if (!player || player.servantId !== JEKYLL_SERVANT_ID) continue;
    const form: JekyllForm = state.round % 2 === 1 ? "hyde" : "jekyll";
    player.form = form;
    player.flags.jekyllForm = form;
    if (form === "jekyll") {
      player.flags.movementManaDiscountPerSpace = 1;
      player.flags.cardPlayForbiddenTag = "berserker-attack";
      delete player.flags.skillUseForbiddenTag;
    } else {
      delete player.flags.movementManaDiscountPerSpace;
      delete player.flags.cardPlayForbiddenTag;
      player.flags.skillUseForbiddenTag = "assassin-class";
    }
  }
}

export const useJekyllDangerousGame: SkillHandler = ({ state, player }) => {
  if (player.servantId !== JEKYLL_SERVANT_ID) return;
  applyJekyllHydeRoundStart(state, player.id);
};

function activeLycanthropySource(state: GameState, player: PlayerState, definitions?: Record<string, CardDefinition>): boolean {
  return player.attack.some((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions?.[instance.definitionId] : undefined;
    return Boolean(instance?.active && instance.face === "up"
      && (instance.definitionId === JEKYLL_BEAST_SKILL_ID || definition?.linkedSkillId === JEKYLL_BEAST_SKILL_ID));
  });
}

/** Combat-result part of Lycanthropy. Power and defeat immunity use generic card metadata. */
export const useJekyllLycanthropy: SkillHandler = ({ state, player, payload, definitions }) => {
  const event = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { event?: { winnerIds?: unknown } }).event
    : undefined;
  if (!isJekyll(player) || !activeLycanthropySource(state, player, definitions)) return;
  const winnerIds = Array.isArray(event?.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  if (winnerIds.includes(player.id)) gainVictoryPoints(player, 1);
};
