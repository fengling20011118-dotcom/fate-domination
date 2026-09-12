import type { GameState } from "../domain/state/types.ts";
import { joinOwnedCardToAttack } from "./card-play.ts";
import { movePlayerCard } from "./decks.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const BEDIVERE_OATH_ID = "servant.bedivere.skill.sc-bedivere-2";
export const BEDIVERE_SILVER_ARM_ID = "servant.bedivere.skill.sc-bedivere-3";
export const BEDIVERE_OATH_HANDLER = "core.bedivere-oath-of-protection";
export const BEDIVERE_SILVER_ARM_HANDLER = "core.bedivere-silver-arm";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function replaceRuleModifier(state: GameState, id: string, modifier: GameState["activeRuleModifiers"][number]): void {
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((candidate) => candidate.id !== id);
  state.activeRuleModifiers.push(modifier);
}

/** Oath of Protection: discard one card for +2 total power and round-long immunity to opponents' abilities. */
export const useBedivereOathOfProtection: SkillHandler = ({ state, player, skill, payload }) => {
  if (state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("BEDIVERE_OATH_WINDOW_INVALID");
  const data = isRecord(payload) ? payload : {};
  const discardInstanceId = typeof data.discardInstanceId === "string" ? data.discardInstanceId : undefined;
  if (!discardInstanceId || !player.hand.includes(discardInstanceId)) throw new Error("BEDIVERE_OATH_DISCARD_REQUIRED");
  movePlayerCard(state, player.id, discardInstanceId, "discard");

  replaceRuleModifier(state, `${skill.id}:power:${player.id}:${state.round}`, {
    id: `${skill.id}:power:${player.id}:${state.round}`,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    operation: "add",
    rule: "combat_power",
    scope: { subject: "controller" },
    value: 2,
    duration: "round",
    createdRound: state.round,
  });
  replaceRuleModifier(state, `${skill.id}:immunity:${player.id}:${state.round}`, {
    id: `${skill.id}:immunity:${player.id}:${state.round}`,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    operation: "ignore",
    rule: "other_player_ability_effect",
    scope: { subject: "controller", sourcePlayers: "all_opponents", includeLocationEvents: true },
    duration: "round",
    createdRound: state.round,
  });
};

export const isBedivereOathOfProtectionLegal: SkillLegalityPredicate = (state, playerId) => {
  const player = state.players[playerId];
  return Boolean(player && state.phase === "outpost" && state.activePlayerId === playerId && player.hand.length > 0);
};

function applySilverArmShufflePenalty(state: GameState, playerId: string, skillId: string, sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new Error("BEDIVERE_SHUFFLE_SEQUENCE_INVALID");
  const id = `${skillId}:fleeting:${playerId}:${sequence}`;
  if ((state.activeRuleModifiers ?? []).some((modifier) => modifier.id === id)) return;
  state.activeRuleModifiers.push({
    id,
    sourceId: skillId,
    controllerPlayerId: playerId,
    operation: "add",
    rule: "combat_power",
    scope: { subject: "controller" },
    value: -1,
    duration: "game",
    createdRound: state.round,
  });
}

/** Silver Arm handles both the permanent shuffle penalty and its action-phase Grip the Sword ability. */
export const useBedivereSilverArm: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "player.deck-shuffled") {
    const event = isRecord(data.event) ? data.event : {};
    if (event.playerId !== player.id) return;
    applySilverArmShufflePenalty(state, player.id, skill.id, Number(event.sequence));
    return;
  }

  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
  if (abilityId !== "grip-the-sword") throw new Error("BEDIVERE_SILVER_ARM_ABILITY_INVALID");
  if (!definitions) throw new Error("BEDIVERE_SILVER_ARM_DEFINITIONS_REQUIRED");
  if (state.phase !== "action" || state.activePlayerId !== player.id || player.deck.length < 2) throw new Error("BEDIVERE_SILVER_ARM_WINDOW_INVALID");
  const sourceInstanceId = player.servantSkills.find((instanceId) => state.cards[instanceId]?.definitionId === skill.id);
  if (!sourceInstanceId) throw new Error("BEDIVERE_SILVER_ARM_CARD_MISSING");

  for (const instanceId of [...player.deck]) movePlayerCard(state, player.id, instanceId, "removed");
  joinOwnedCardToAttack(state, player.id, sourceInstanceId, definitions, { manaCost: 0, allowedSourceZones: ["servant-skills"] });
};

export const isBedivereSilverArmLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  if (!player || ability?.id !== "grip-the-sword") return false;
  return state.phase === "action" && state.activePlayerId === playerId && player.deck.length >= 2
    && player.servantSkills.some((instanceId) => state.cards[instanceId]?.definitionId === BEDIVERE_SILVER_ARM_ID);
};
