import type { GameState, PlayerState } from "../domain/state/types.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { movePlayerCard, removePhysicalCardFromGame } from "./decks.ts";
import { loseMana } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const JINAKO_GAMER_ID = "master.jinako.skill.s1";
export const JINAKO_CHEAT_ID = "master.jinako.skill.s2";
export const JINAKO_TIMEOUT_ID = "master.jinako.skill.ascension";
export const JINAKO_GAMER_HANDLER = "core.jinako-gamer";
export const JINAKO_CHEAT_HANDLER = "core.jinako-cheat-code-cast";
export const JINAKO_TIMEOUT_HANDLER = "core.jinako-time-out";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function ownedSkillCard(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return card.ownerPlayerId === player.id && matchesSkill(definition, card.definitionId, skillId);
  });
}

function initialServantBasicSpecialCount(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): number {
  if (!player.servantId) return 0;
  return Object.values(state.cards).filter((card) => {
    if (card.ownerPlayerId !== player.id || card.originServantId !== player.servantId) return false;
    const definition = definitions[card.definitionId];
    return Boolean(definition?.basic === true && getCardAttributes(definition).includes("特殊"));
  }).length;
}

/** Jinako Carigiri: English-original Gamer/Shut-in rules. */
export const useJinakoGamer: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("JINAKO_GAMER_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType === "game.started") {
    const count = initialServantBasicSpecialCount(state, player, definitions);
    const powerBonus = Math.max(1, 8 - 2 * count);
    player.flags.basicSpecialAttackPowerBonus = powerBonus;
    player.flags.jinakoInitialBasicSpecialCount = count;
    return { initialBasicSpecialCount: count, powerBonus };
  }
  if (eventType === "player.moved") {
    if (event.playerId !== player.id || event.previousLocationId !== "workshop" || event.locationId === "workshop") return;
    const lostMana = loseMana(player, 2);
    return { lostMana };
  }
};

export const useJinakoCheatCodeCast: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== "cheat-code-cast"
    || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("JINAKO_CHEAT_WINDOW_INVALID");
  const source = ownedSkillCard(state, player, skill.id, definitions);
  if (!source || source.zone === "removed") throw new Error("JINAKO_CHEAT_SOURCE_UNAVAILABLE");
  player.flags.basicSpecialConversionRound = state.round;
  player.flags.basicSpecialConversionSourceId = skill.id;
  removePhysicalCardFromGame(state, source.instanceId);
  return { conversionRound: state.round, removedInstanceId: source.instanceId };
};

function recoverCheatCodeCast(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string | null {
  const source = ownedSkillCard(state, player, JINAKO_CHEAT_ID, definitions);
  if (!source || source.zone !== "removed") return null;
  movePlayerCard(state, player.id, source.instanceId, "master-skills");
  source.face = "up";
  source.active = false;
  source.residual = false;
  delete source.used;
  delete source.usedRound;
  delete source.usedPhase;
  delete source.usedCount;
  delete source.usedGameCount;
  delete source.abilityUsage;
  delete player.usage[JINAKO_CHEAT_ID];
  for (const key of Object.keys(player.usage)) if (key.startsWith(`${JINAKO_CHEAT_ID}:`)) delete player.usage[key];
  return source.instanceId;
}

/** Time Out: unlock installs the permanent printed-type retention; Outpost use skips deployment and recovers Cheat Code Cast. */
export const useJinakoTimeOut: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("JINAKO_TIMEOUT_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType === "skill.unlocked") {
    if (event.playerId !== player.id || event.skillId !== skill.id) return;
    player.flags.retainControlledAttackPrintedAttributes = true;
    return { printedTypesRetained: true };
  }
  if (payload.abilityId !== "time-out" || state.phase !== "outpost" || state.activePlayerId !== player.id) {
    throw new Error("JINAKO_TIMEOUT_WINDOW_INVALID");
  }
  if (Number(player.flags.skipDeploymentRound ?? -1) === state.round) throw new Error("JINAKO_TIMEOUT_ALREADY_USED");
  player.flags.skipDeploymentRound = state.round;
  const recoveredInstanceId = recoverCheatCodeCast(state, player, definitions);
  return { skippedDeploymentRound: state.round, recoveredInstanceId };
};

export const isJinakoCheatCodeCastLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "cheat-code-cast" && state.phase === "action" && state.activePlayerId === playerId
    && ownedSkillCard(state, player, skill.id, definitions)?.zone !== "removed");
};

export const isJinakoTimeOutLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  return Boolean(player && ability?.id === "time-out" && state.phase === "outpost" && state.activePlayerId === playerId
    && Number(player.flags.skipDeploymentRound ?? -1) !== state.round);
};
