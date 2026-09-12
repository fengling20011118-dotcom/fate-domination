import type { GameState, PlayerState } from "../domain/state/types.ts";
import { movePlayerByEffect } from "./board.ts";
import type { CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";
import { adjustVictoryPoints, gainMana, gainVictoryPoints, transferMana } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ZOUKEN_FOUNDER_ID = "master.zouken.skill.s3";
export const ZOUKEN_OBSESSION_ID = "master.zouken.skill.s4";
export const ZOUKEN_ASCENSION_ID = "master.zouken.skill.ascension";
export const ZOUKEN_FOUNDER_HANDLER = "core.zouken-founder";
export const ZOUKEN_OBSESSION_HANDLER = "core.zouken-pseudo-vampire";
export const ZOUKEN_ASCENSION_HANDLER = "core.zouken-illusive-mastermind";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function coLocatedOpponents(state: GameState, player: PlayerState): PlayerState[] {
  if (!player.locationId) return [];
  return (state.board.locations[player.locationId] ?? [])
    .filter((id) => id !== player.id)
    .map((id) => state.players[id])
    .filter((candidate): candidate is PlayerState => Boolean(candidate && !candidate.eliminated));
}

function wonCurrentLocationCombat(state: GameState, player: PlayerState): boolean {
  if (player.locationId !== "mountain" && player.locationId !== "city" && player.locationId !== "workshop") return false;
  const byLocation = state.modeState.combatWinnerIdsByLocation;
  if (!byLocation || typeof byLocation !== "object" || Array.isArray(byLocation)) return false;
  const winnerIds = (byLocation as Record<string, unknown>)[player.locationId];
  return Array.isArray(winnerIds) && winnerIds.includes(player.id);
}

/** Founder: installs Zouken's seal replacements and resolves the X power/reward action. */
export const useZoukenFounder: SkillHandler = ({ state, player, payload, definitions }) => {
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "game.started") {
    player.commandSeals = 0;
    player.flags.commandSealGainManaSubstitution = 4;
    player.flags.commandSealCostManaSubstitution = 4;
    return;
  }
  if (eventType === "combat.resolved") {
    if (Number(player.flags.zoukenFounderRewardRound ?? Number.NEGATIVE_INFINITY) !== state.round) return;
    const event = isRecord(data.event) ? data.event : {};
    const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds : [];
    if (!winnerIds.includes(player.id)) return;
    const reward = Number(player.flags.zoukenFounderRewardVp ?? 0);
    if (Number.isInteger(reward) && reward > 0) gainVictoryPoints(player, reward);
    delete player.flags.zoukenFounderRewardRound;
    delete player.flags.zoukenFounderRewardVp;
    return;
  }
  if (!definitions || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("ZOUKEN_FOUNDER_WINDOW_INVALID");
  const x = Number(data.x);
  if (!Number.isInteger(x) || x < 0) throw new Error("ZOUKEN_FOUNDER_X_INVALID");
  payManaCost(state, player, x * 2, definitions, "ZOUKEN_FOUNDER_INSUFFICIENT_MANA");
  player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + x;
  player.flags.zoukenFounderRewardRound = state.round;
  player.flags.zoukenFounderRewardVp = x;
  return { x, paidMana: x * 2 };
};

/** Five-Hundred-Year Obsession / Pseudo Vampire. */
export const useZoukenObsession: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "round.ending") {
    if (Number(player.flags.roundManaGained ?? 0) < 3) adjustVictoryPoints(player, -2);
    return;
  }
  if (!definitions || state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("ZOUKEN_OBSESSION_WINDOW_INVALID");
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
  if (abilityId === "bug-form") {
    const targetLocationId = typeof data.targetLocationId === "string" ? data.targetLocationId : undefined;
    if (!targetLocationId) throw new Error("ZOUKEN_BUG_FORM_DESTINATION_REQUIRED");
    payManaCost(state, player, 7, definitions, "ZOUKEN_BUG_FORM_INSUFFICIENT_MANA");
    const movement = movePlayerByEffect(state, player.id, targetLocationId, definitions);
    emitEvent?.("player.moved", { playerId: player.id, ...movement, sourceSkillId: ZOUKEN_OBSESSION_ID });
    emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect", sourceSkillId: ZOUKEN_OBSESSION_ID });
    return movement;
  }
  if (abilityId !== "blood-worms") throw new Error("ZOUKEN_OBSESSION_ABILITY_INVALID");
  if (player.locationId === "scouting") return { gainedMana: gainMana(player, 3) };
  const opponents = coLocatedOpponents(state, player);
  if (opponents.length === 0) return { gainedMana: gainMana(player, 3) };
  if (player.flags.zoukenIllusiveMastermindActive !== true && !wonCurrentLocationCombat(state, player)) {
    throw new Error("ZOUKEN_BLOOD_WORMS_WIN_REQUIRED");
  }
  const winnerIdsByLocation = state.modeState.combatWinnerIdsByLocation as Record<string, unknown> | undefined;
  const winnerIds = player.locationId && winnerIdsByLocation && Array.isArray(winnerIdsByLocation[player.locationId])
    ? winnerIdsByLocation[player.locationId] as string[] : [];
  const candidates = player.flags.zoukenIllusiveMastermindActive === true
    ? opponents
    : opponents.filter((candidate) => !winnerIds.includes(candidate.id));
  const targetPlayerId = typeof data.targetPlayerId === "string" ? data.targetPlayerId : candidates.length === 1 ? candidates[0]?.id : undefined;
  const target = targetPlayerId ? candidates.find((candidate) => candidate.id === targetPlayerId) : undefined;
  if (!target) throw new Error("ZOUKEN_BLOOD_WORMS_TARGET_INVALID");
  const requested = data.amount === undefined ? 3 : Number(data.amount);
  if (!Number.isInteger(requested) || requested < 0 || requested > 3) throw new Error("ZOUKEN_BLOOD_WORMS_AMOUNT_INVALID");
  const transferred = transferMana(target, player, requested);
  return { targetPlayerId: target.id, transferredMana: transferred };
};

/** Illusive Mastermind: permanent movement freedom + upgraded Blood Worms + local seal stripping. */
export const useZoukenIllusiveMastermind: SkillHandler = ({ state, player, payload, definitions }) => {
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "skill.unlocked") {
    const event = isRecord(data.event) ? data.event : {};
    if (event.playerId !== player.id || event.skillId !== ZOUKEN_ASCENSION_ID) return;
    player.flags.ignoreEngagement = true;
    player.flags.zoukenIllusiveMastermindActive = true;
    return;
  }
  if (!definitions || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("ZOUKEN_ASCENSION_WINDOW_INVALID");
  payManaCost(state, player, 6, definitions, "ZOUKEN_ASCENSION_INSUFFICIENT_MANA");
  const affected: string[] = [];
  for (const opponent of coLocatedOpponents(state, player)) {
    const before = opponent.commandSeals;
    opponent.commandSeals = Math.max(0, opponent.commandSeals - 1);
    if (opponent.commandSeals < before) affected.push(opponent.id);
  }
  return { affectedPlayerIds: affected };
};

export const isZoukenFounderLegal: SkillLegalityPredicate = (state, playerId) => {
  const player = state.players[playerId];
  return Boolean(player && state.phase === "action" && state.activePlayerId === playerId);
};

export const isZoukenObsessionLegal: SkillLegalityPredicate = (state, playerId) => {
  const player = state.players[playerId];
  return Boolean(player && state.phase === "combat" && state.activePlayerId === playerId);
};

export const isZoukenAscensionLegal: SkillLegalityPredicate = (state, playerId) => {
  const player = state.players[playerId];
  return Boolean(player && state.phase === "action" && state.activePlayerId === playerId && player.mana >= 6);
};
