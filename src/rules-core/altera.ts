import type { GameState } from "../domain/state/types.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { movePlayerCard, placeOwnedCardOnBoard } from "./decks.ts";
import { setLocationEventPoolOverride } from "./event-lifecycle.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ALTERA_TEARDROP_ID = "servant.altera.skill.sc-altera-1";
export const ALTERA_PHOTON_RAY_ID = "servant.altera.skill.sc-altera-2";
export const ALTERA_TEARDROP_HANDLER = "core.altera-teardrop-photon-ray";
export const ALTERA_PHOTON_RAY_HANDLER = "core.altera-photon-ray";
export const ALTERA_DESTROYED_CIVILIZATION_POOL = "destroyed-civilization";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ownedTeardrop(state: GameState, playerId: string) {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === playerId
    && (card.definitionId === ALTERA_TEARDROP_ID || card.definitionId === `card.skill.${ALTERA_TEARDROP_ID}`));
}

/** Teardrop is attached by Photon Ray, joins only on a later-round fight here, then permanently changes that location's objective source. */
export const useAlteraTeardropPhotonRay: SkillHandler = ({ state, player, skill, payload, emitEvent }) => {
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : {};
  const teardrop = ownedTeardrop(state, player.id);
  if (!teardrop) throw new Error("ALTERA_TEARDROP_CARD_MISSING");

  if (eventType === "phase.transitioned") {
    if (event.previousPhase !== "action" || state.phase !== "combat") return;
    if (teardrop.zone !== "board" || teardrop.active !== true || typeof teardrop.boardPlacedRound !== "number"
      || teardrop.boardPlacedRound >= state.round || teardrop.boardLocationId !== player.locationId) return;
    const locationId = teardrop.boardLocationId;
    delete teardrop.boardLocationId;
    delete teardrop.boardPlacedRound;
    movePlayerCard(state, player.id, teardrop.instanceId, "attack");
    teardrop.face = "up";
    teardrop.active = true;
    teardrop.residual = false;
    teardrop.paidCost = 0;
    teardrop.joinedAttackRound = state.round;
    player.flags.alteraTeardropStrikeRound = state.round;
    player.flags.alteraTeardropStrikeLocationId = locationId;
    if (!player.trueNameRevealed) {
      revealPlayerTrueName(state, player.id);
      emitEvent?.("servant.true-name-revealed", { playerId: player.id, servantId: player.servantId, sourceDefinitionId: skill.id, method: "orbital-strike" });
    }
    emitEvent?.("card.entered-attack", { playerId: player.id, instanceId: teardrop.instanceId, definitionId: teardrop.definitionId, method: "orbital-strike" });
    return { joined: true, instanceId: teardrop.instanceId, locationId };
  }

  if (eventType === "combat.ending") {
    if (Number(player.flags.alteraTeardropStrikeRound ?? -1) !== state.round || teardrop.zone !== "attack" || !teardrop.active) return;
    const locationId = player.flags.alteraTeardropStrikeLocationId;
    if (locationId !== "mountain" && locationId !== "city") throw new Error("ALTERA_TEARDROP_LOCATION_INVALID");
    movePlayerCard(state, player.id, teardrop.instanceId, "removed");
    teardrop.face = "down";
    teardrop.active = false;
    teardrop.residual = false;
    setLocationEventPoolOverride(state, locationId, ALTERA_DESTROYED_CIVILIZATION_POOL, skill.id, player.id);
    delete player.flags.alteraTeardropStrikeRound;
    delete player.flags.alteraTeardropStrikeLocationId;
    return { removed: true, locationId, poolId: ALTERA_DESTROYED_CIVILIZATION_POOL };
  }
};

/** Photon Ray owns the dynamic cost aura plus its two phase abilities. */
export const useAlteraPhotonRay: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("ALTERA_PHOTON_RAY_CONTEXT_REQUIRED");
  const abilityId = typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  if (abilityId === "sword-of-mars") {
    const modifierId = `${skill.id}:sword-of-mars:${state.round}`;
    if (!(player.cardRuleModifiers ?? []).some((modifier) => modifier.id === modifierId)) {
      addCardRuleModifier(player, {
        id: modifierId,
        sourceId: skill.id,
        targetDefinitionIds: Object.keys(definitions),
        preventPowerReduction: true,
        preventOpponentClose: true,
        duration: "round",
      });
    }
    return { protected: true };
  }
  if (abilityId === "attach-teardrop") {
    if (player.locationId !== "mountain" && player.locationId !== "city") throw new Error("ALTERA_PHOTON_RAY_BATTLEFIELD_REQUIRED");
    const teardrop = ownedTeardrop(state, player.id);
    if (!teardrop || (teardrop.zone !== "servant-skills" && teardrop.zone !== "master-skills")) throw new Error("ALTERA_TEARDROP_NOT_ATTACHABLE");
    placeOwnedCardOnBoard(state, player.id, teardrop.instanceId, player.locationId);
    return { attached: true, instanceId: teardrop.instanceId, locationId: player.locationId };
  }
  throw new Error("ALTERA_PHOTON_RAY_ABILITY_INVALID");
};

export const isAlteraPhotonRayLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  if (state.activePlayerId !== playerId) return false;
  if (ability?.id === "sword-of-mars") return state.phase === "action";
  if (ability?.id === "attach-teardrop") {
    const player = state.players[playerId];
    const teardrop = ownedTeardrop(state, playerId);
    return state.phase === "combat" && Boolean(player && (player.locationId === "mountain" || player.locationId === "city")
      && teardrop && (teardrop.zone === "servant-skills" || teardrop.zone === "master-skills"));
  }
  return false;
};
