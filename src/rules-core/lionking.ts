import type { CardDefinition } from "./content-types.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { addCardsToAttack } from "./card-play.ts";
import { movePlayerByEffect } from "./board.ts";
import { gainMana } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const LIONKING_DIVINE_COMMAND_ID = "servant.lionking.skill.sc-lionking-1";
export const LIONKING_DUN_STALLION_ID = "servant.lionking.skill.sc-lionking-2";
export const LIONKING_DIVINE_COMMAND_HANDLER = "core.lionking-divine-command";
export const LIONKING_DUN_STALLION_HANDLER = "core.lionking-dun-stallion";

const LUCK_DEFINITION_ID = "card.cardluck";
const ALL_ATTRIBUTES = ["力量", "迅捷", "魔术", "特殊", "宝具"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Divine Command installs a source-attributed rule on Luck; no display text is parsed at runtime. */
export const useLionKingDivineCommand: SkillHandler = ({ state, player, skill, payload }) => {
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "game.started") {
    const modifierId = `${skill.id}:luck-all-types`;
    if (!(player.cardRuleModifiers ?? []).some((modifier) => modifier.id === modifierId)) {
      addCardRuleModifier(player, {
        id: modifierId,
        sourceId: skill.id,
        targetDefinitionIds: [LUCK_DEFINITION_ID],
        grantCombatAttributes: [...ALL_ATTRIBUTES],
        preventPowerReduction: true,
        duration: "game",
      });
    }
    return;
  }
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : {};
  if (eventType !== "phase.transitioned" || state.phase !== "outpost"
    || event.previousPhase !== "preparation" || event.transition !== "next-phase") return;
  gainMana(player, 1);
  player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 3;
  player.flags.victoryPointGainBlocked = true;
};

export const useLionKingDunStallion: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("LIONKING_DUN_STALLION_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
  if (abilityId === "battle-continuation") {
    const locationId = typeof data.locationId === "string" ? data.locationId : typeof data.targetLocationId === "string" ? data.targetLocationId : undefined;
    if (locationId !== "mountain" && locationId !== "city") throw new Error("LIONKING_DUN_STALLION_BATTLEFIELD_INVALID");
    const movement = movePlayerByEffect(state, player.id, locationId, definitions);
    emitEvent?.("player.moved", { playerId: player.id, ...movement });
    emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect" });
    return movement;
  }
  if (abilityId === "riding") {
    const instanceIds = Array.isArray(data.instanceIds) ? data.instanceIds.filter((id): id is string => typeof id === "string") : [];
    if (!Array.isArray(data.instanceIds) || instanceIds.length !== data.instanceIds.length) throw new Error("LIONKING_DUN_STALLION_CARD_LIST_INVALID");
    return addCardsToAttack(state, player.id, instanceIds, definitions, { maxCount: 3, maxBasePower: 3 });
  }
  throw new Error("LIONKING_DUN_STALLION_ABILITY_INVALID");
};

export const isLionKingDunStallionLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  if (state.phase !== "action" || state.activePlayerId !== playerId) return false;
  return ability?.id === "battle-continuation" || ability?.id === "riding";
};
