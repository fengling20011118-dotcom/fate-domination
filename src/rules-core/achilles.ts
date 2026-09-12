import type { GameState, PlayerState } from "../domain/state/types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { movePlayerCard } from "./decks.ts";
import { installDuelIsolation } from "./duel-isolation.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import { addSkillUseBlock } from "./skill-use-blocks.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ACHILLES_HANDLER = "core.achilles-package";
export const ACHILLES_AMARANTOS_ID = "servant.achilles.skill.sc-achilles-1";
export const ACHILLES_KOSMOS_ID = "servant.achilles.skill.sc-achilles-2";
export const ACHILLES_LONKHE_ID = "servant.achilles.skill.sc-achilles-3";

const KOSMOS_HIDE_ROUND = "achillesKosmosHideRound";
const KOSMOS_RESTORE_TRUE_NAME = "achillesKosmosRestoreTrueName";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function battlefieldOpponentIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated);
}

function randomDiscardOne(
  state: GameState,
  target: PlayerState,
  randomInt: ((maxExclusive: number) => number) | undefined,
): string | undefined {
  if (target.hand.length === 0) return undefined;
  const index = (randomInt ?? (() => 0))(target.hand.length);
  if (!Number.isInteger(index) || index < 0 || index >= target.hand.length) throw new Error("ACHILLES_RANDOM_INVALID");
  const instanceId = target.hand[index];
  movePlayerCard(state, target.id, instanceId, "discard");
  state.cards[instanceId].face = "up";
  return instanceId;
}

function isLuckOrAgility(
  state: GameState,
  target: PlayerState,
  instanceId: string | undefined,
  definitions: Record<string, CardDefinition>,
): boolean {
  if (!instanceId) return false;
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !definition) return false;
  return definition.id === "card.cardluck"
    || getCardInstanceAttributes(card, definition, state, definitions).includes("迅捷");
}

function applyInvincibleCombatStart(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  randomInt: ((maxExclusive: number) => number) | undefined,
) {
  if (player.trueNameRevealed) return { discardedInstanceIds: [], zeroedPlayerIds: [] };
  const discardedInstanceIds: string[] = [];
  const zeroedPlayerIds: string[] = [];
  for (const opponentId of battlefieldOpponentIds(state, player)) {
    const target = state.players[opponentId];
    const discarded = randomDiscardOne(state, target, randomInt);
    if (discarded) discardedInstanceIds.push(discarded);
    if (!isLuckOrAgility(state, target, discarded, definitions)) {
      target.flags.combatPowerOverrideRound = state.round;
      target.flags.combatPowerOverrideValue = 0;
      zeroedPlayerIds.push(target.id);
    }
  }
  return { discardedInstanceIds, zeroedPlayerIds };
}

function lostResolvedFight(state: GameState, player: PlayerState, event: Record<string, unknown>): boolean {
  const locationId = typeof event.locationId === "string" ? event.locationId : undefined;
  if (!locationId || player.locationId !== locationId) return false;
  const powers = isRecord(event.powers) ? event.powers : {};
  if (!Object.prototype.hasOwnProperty.call(powers, player.id)) return false;
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  return !winnerIds.includes(player.id);
}

function useAmarantos(context: Parameters<SkillHandler>[0]) {
  const { state, player, payload, definitions, randomInt } = context;
  if (!definitions || !isRecord(payload)) throw new Error("ACHILLES_AMARANTOS_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType === "phase.transitioned") {
    if (event.previousPhase !== "action" || state.phase !== "combat") return;
    return applyInvincibleCombatStart(state, player, definitions, randomInt);
  }
  if (eventType === "combat.resolved") {
    if (lostResolvedFight(state, player, event)) {
      revealPlayerTrueName(state, player.id);
      return { revealed: true };
    }
    return;
  }
  throw new Error("ACHILLES_AMARANTOS_EVENT_INVALID");
}

function useKosmos(context: Parameters<SkillHandler>[0]) {
  const { state, player, skill, payload, definitions, runtimeCatalog, randomInt } = context;
  if (!definitions || !isRecord(payload)) throw new Error("ACHILLES_KOSMOS_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "round.ended") {
    if (Number(player.flags[KOSMOS_HIDE_ROUND] ?? -1) === state.round) {
      player.trueNameRevealed = player.flags[KOSMOS_RESTORE_TRUE_NAME] === true;
      delete player.flags[KOSMOS_HIDE_ROUND];
      delete player.flags[KOSMOS_RESTORE_TRUE_NAME];
    }
    return;
  }
  if (state.phase !== "action" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, skill.id, definitions)) {
    throw new Error("ACHILLES_KOSMOS_WINDOW_INVALID");
  }
  const abilityId = typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  const opponentIds = battlefieldOpponentIds(state, player);
  if (abilityId === "kosmos-random-discard") {
    const discardedInstanceIds = opponentIds.map((id) => randomDiscardOne(state, state.players[id], randomInt)).filter((id): id is string => Boolean(id));
    return { discardedInstanceIds };
  }
  if (abilityId === "kosmos-block-skills") {
    if (!runtimeCatalog) throw new Error("ACHILLES_KOSMOS_RUNTIME_CATALOG_REQUIRED");
    const definitionIds = runtimeCatalog.skillDefinitions.map((definition) => definition.id);
    for (const opponentId of opponentIds) {
      addSkillUseBlock(state.players[opponentId], {
        id: `${skill.id}:block:${state.round}:${player.id}`,
        sourceId: skill.id,
        sourcePlayerId: player.id,
        throughRound: state.round,
        definitionIds,
      });
    }
    return { blockedPlayerIds: opponentIds };
  }
  if (abilityId === "kosmos-hide-name") {
    if (Number(player.flags[KOSMOS_HIDE_ROUND] ?? -1) !== state.round) {
      player.flags[KOSMOS_HIDE_ROUND] = state.round;
      player.flags[KOSMOS_RESTORE_TRUE_NAME] = player.trueNameRevealed;
    }
    player.trueNameRevealed = false;
    return { hidden: true };
  }
  throw new Error("ACHILLES_KOSMOS_ABILITY_INVALID");
}

function useLonkhe(context: Parameters<SkillHandler>[0]) {
  const { state, player, skill, definitions } = context;
  if (!definitions || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("ACHILLES_LONKHE_WINDOW_INVALID");
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  const opponents = battlefieldOpponentIds(state, player);
  if (!source || opponents.length !== 1 || !player.locationId) throw new Error("ACHILLES_LONKHE_DUEL_REQUIRED");
  installDuelIsolation(state, {
    sourceId: skill.id,
    sourceInstanceId: source.instanceId,
    controllerPlayerId: player.id,
    opponentPlayerId: opponents[0],
    locationId: player.locationId,
  });
  return { opponentPlayerId: opponents[0], locationId: player.locationId };
}

export const useAchilles: SkillHandler = (context) => {
  if (context.skill.id === ACHILLES_AMARANTOS_ID) return useAmarantos(context);
  if (context.skill.id === ACHILLES_KOSMOS_ID) return useKosmos(context);
  if (context.skill.id === ACHILLES_LONKHE_ID) return useLonkhe(context);
  throw new Error("ACHILLES_SKILL_INVALID");
};

export const isAchillesLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  if (skill.id === ACHILLES_KOSMOS_ID) {
    if (!activeOwnedSkill(state, player, skill.id, definitions)) return false;
    if (ability?.id === "kosmos-hide-name") return player.flags.infiniteMana === true || player.mana >= 3;
    return ability?.id === "kosmos-random-discard" || ability?.id === "kosmos-block-skills";
  }
  if (skill.id === ACHILLES_LONKHE_ID) {
    return Boolean(activeOwnedSkill(state, player, skill.id, definitions) && battlefieldOpponentIds(state, player).length === 1);
  }
  return false;
};
