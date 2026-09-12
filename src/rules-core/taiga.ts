import type { GameState } from "../domain/state/types.ts";
import { getBattlefieldLocationIds, installDynamicBattlefieldRule, isBattlefieldLocation } from "./battlefield-rules.ts";
import { gainVictoryPoints } from "./resources.ts";
import type { SkillHandler } from "./skill-types.ts";
import { addStackedStatus } from "./stacked-statuses.ts";

export const TAIGA_FATES_GUIDE_ID = "master.taiga.skill.s1a";
export const TAIGA_ASCENSION_ID = "master.taiga.skill.ascension";
export const TAIGA_FATES_GUIDE_HANDLER = "core.taiga-fates-guide";
export const TAIGA_ASCENSION_HANDLER = "core.taiga-domestic-carnage";
export const TIGER_STAMP_STATUS_ID = "status.tiger-stamp";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Fate's Guide: every loser in a fight Taiga won receives one persistent Tiger Stamp; Taiga gains 1 VP per stamp distributed. */
export const useTaigaFatesGuide: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || payload.eventType !== "combat.resolved" || !isRecord(payload.event)) return;
  const event = payload.event;
  const locationId = typeof event.locationId === "string" ? event.locationId : undefined;
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  if (!locationId || !isBattlefieldLocation(state, locationId) || !winnerIds.includes(player.id)) return;
  const losers = (state.board.locations[locationId] ?? []).filter((playerId) => {
    const target = state.players[playerId];
    return Boolean(target && !target.eliminated && !winnerIds.includes(playerId));
  });
  for (const loserId of losers) {
    addStackedStatus(state.players[loserId], {
      id: TIGER_STAMP_STATUS_ID,
      sourceId: TIGER_STAMP_STATUS_ID,
      totalPowerPerStack: 1,
      maxPowerStacks: 3,
    });
  }
  const gainedVictoryPoints = gainVictoryPoints(player, losers.length);
  return { stampedPlayerIds: losers, gainedVictoryPoints };
};

/** Domestic Carnage installs a source-bound dynamic battlefield rule; generic board/combat/scoring code consumes it. */
export const useTaigaDomesticCarnage: SkillHandler = ({ state, player, skill, payload }) => {
  if (!isRecord(payload) || payload.eventType !== "skill.unlocked" || !isRecord(payload.event)) return;
  const event = payload.event;
  if (event.playerId !== player.id || event.skillId !== skill.id) return;
  installDynamicBattlefieldRule(state, {
    sourceId: skill.id,
    controllerPlayerId: player.id,
    locationId: "workshop",
    objectives: "none",
    competitionReward: "current-situation-mana",
  });
  return { battlefieldLocationIds: getBattlefieldLocationIds(state) };
};
