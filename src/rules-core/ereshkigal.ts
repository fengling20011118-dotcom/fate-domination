import { gainMana } from "./resources.ts";
import { placeOwnedCardOnBoard, returnOwnedBoardCardToSkillZone } from "./decks.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ERESH_BLESSING_ID = "servant.ereshkigal.skill.sc-ereshkigal-2";
export const ERESH_KUR_KIGAL_ID = "servant.ereshkigal.skill.sc-ereshkigal-3";
export const ERESH_BLESSING_HANDLER = "core.ereshkigal-blessing-of-kur";
export const ERESH_KUR_KIGAL_HANDLER = "core.ereshkigal-kur-kigal-irkalla";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function blessingInstance(state: GameState, playerId: string) {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === playerId
    && (card.definitionId === ERESH_BLESSING_ID || card.definitionId === `card.skill.${ERESH_BLESSING_ID}`));
}

function configureBlessingBoardAura(card: GameState["cards"][string]): void {
  card.boardSituationPowerModifierMultiplier = -1;
  card.boardEventPowerModifierMultiplier = -1;
  card.boardPowerModifierExemptPlayerIds = card.boardPowerModifierExemptPlayerIds ?? [];
}

/** Blessing of Kur is a physical battlefield aura. */
export const useEreshkigalBlessingOfKur: SkillHandler = ({ state, player, payload }) => {
  const card = blessingInstance(state, player.id);
  if (!card) throw new Error("ERESHKIGAL_BLESSING_CARD_MISSING");
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : {};
  if (eventType === "player.deployed") {
    if (card.zone === "board" && card.active && event.locationId === card.boardLocationId) gainMana(player, 1);
    return;
  }
  if (eventType === "combat.ending") {
    if (card.zone === "board") returnOwnedBoardCardToSkillZone(state, player.id, card.instanceId, "servant-skills");
    return;
  }
  const abilityId = isRecord(payload) && typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  if (abilityId !== "blessing-unaffected") throw new Error("ERESHKIGAL_BLESSING_ABILITY_INVALID");
  if (card.zone !== "board" || !card.active || card.boardLocationId !== player.locationId) throw new Error("ERESHKIGAL_BLESSING_NOT_HERE");
  configureBlessingBoardAura(card);
  if (!card.boardPowerModifierExemptPlayerIds!.includes(player.id)) card.boardPowerModifierExemptPlayerIds!.push(player.id);
};

export const isEreshkigalBlessingOfKurLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  if (ability?.id !== "blessing-unaffected" || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  const player = state.players[playerId];
  const card = blessingInstance(state, playerId);
  return Boolean(player && card?.zone === "board" && card.active && card.boardLocationId === player.locationId);
};

/** Kur Kigal Irkalla places the same Blessing card, or grants +6 when it is already here. */
export const useEreshkigalKurKigalIrkalla: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || payload.abilityId !== "terraform") throw new Error("ERESHKIGAL_TERRAFORM_ABILITY_INVALID");
  if (player.locationId !== "mountain" && player.locationId !== "city") throw new Error("ERESHKIGAL_TERRAFORM_BATTLEFIELD_REQUIRED");
  const blessing = blessingInstance(state, player.id);
  if (!blessing) throw new Error("ERESHKIGAL_BLESSING_CARD_MISSING");
  if (blessing.zone !== "board") {
    placeOwnedCardOnBoard(state, player.id, blessing.instanceId, player.locationId);
    configureBlessingBoardAura(blessing);
    return { placed: true, locationId: player.locationId };
  }
  if (blessing.boardLocationId === player.locationId) {
    player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 6;
    return { placed: false, powerBonus: 6 };
  }
  return { placed: false, powerBonus: 0 };
};

export const isEreshkigalKurKigalIrkallaLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  return ability?.id === "terraform" && state.phase === "action" && state.activePlayerId === playerId
    && Boolean(player && (player.locationId === "mountain" || player.locationId === "city"));
};
