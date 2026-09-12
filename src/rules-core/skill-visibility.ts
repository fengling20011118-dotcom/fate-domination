import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";

const SKILL_REVEALED_ROUND_FLAG = "skillRevealedRound";

/** Records the rules fact that this player made at least one skill card face-up this round. */
export function markSkillRevealedThisRound(state: GameState, playerId: string): void {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  player.flags[SKILL_REVEALED_ROUND_FLAG] = state.round;
}

export function didPlayerRevealSkillThisRound(state: GameState, playerId: string): boolean {
  return Number(state.players[playerId]?.flags[SKILL_REVEALED_ROUND_FLAG] ?? -1) === state.round;
}

/** Reveals the physical skill card whose hidden ability was successfully used. */
export function revealUsedSkillCard(
  state: GameState,
  playerId: string,
  skillId: string,
  definitions?: Record<string, CardDefinition>,
): boolean {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  const instanceId = [...player.attack, ...player.masterSkills, ...player.servantSkills, ...player.hand].find((candidateId) => {
    const card = state.cards[candidateId];
    if (!card || card.ownerPlayerId !== playerId || card.zone === "removed") return false;
    const definition = definitions?.[card.definitionId];
    return card.fullSkillCopy?.sourceSkillId === skillId || card.definitionId === skillId || definition?.linkedSkillId === skillId;
  });
  const card = instanceId ? state.cards[instanceId] : undefined;
  if (!card || card.face === "up") return false;
  card.face = "up";
  markSkillRevealedThisRound(state, playerId);
  return true;
}

/**
 * Authoritative true-name transition. Base rules reveal every current servant
 * skill card when the servant's true name is released.
 */
export function revealPlayerTrueName(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  const changed = !player.trueNameRevealed;
  player.trueNameRevealed = true;
  let revealedSkill = false;
  for (const instanceId of player.servantSkills) {
    const card = state.cards[instanceId];
    if (!card || card.ownerPlayerId !== playerId || card.zone !== "servant-skills") continue;
    if (card.face !== "up") revealedSkill = true;
    card.face = "up";
  }
  if (changed || revealedSkill) markSkillRevealedThisRound(state, playerId);
  return changed;
}

/** Literal "all skills in the game are face-up": removed cards are no longer in game. */
export function areAllInGameSkillCardsFaceUp(state: GameState, definitions: Record<string, CardDefinition>): boolean {
  const skillCards = Object.values(state.cards).filter((card) => card.zone !== "removed" && definitions[card.definitionId]?.isSkill === true);
  return skillCards.length > 0 && skillCards.every((card) => card.face === "up");
}
