import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { closePlayerCard, placeOwnedCardOnBoard, returnOwnedBoardCardToSkillZone } from "./decks.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const OZY_RAMESSEUM_ID = "servant.ozymandias.skill.sc-ozymandias-1";
export const OZY_DENDERA_ID = "servant.ozymandias.skill.sc-ozymandias-3";
export const OZY_RAMESSEUM_HANDLER = "core.ozymandias-ramesseum";
export const OZY_DENDERA_HANDLER = "core.ozymandias-dendera";

const DENDERA_TEMPLE_FLAG = "ozymandiasDenderaTempleInstanceId";
const DENDERA_ROUND_FLAG = "ozymandiasDenderaRound";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definition?.linkedSkillId === skillId;
}

function findOwnedPhysicalSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone !== "removed" && card.zone !== "discard"
      && matchesSkill(definition, card.definitionId, skillId);
  });
}

function findRamesseumAtAnotherLocation(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
) {
  return Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "board" && card.active === true && typeof card.boardLocationId === "string"
      && card.boardLocationId !== player.locationId
      && matchesSkill(definition, card.definitionId, OZY_RAMESSEUM_ID);
  });
}

/**
 * Ramesseum Tentyris is a physical location attachment. Its two battlefield
 * effects are stored as generic board-card auras so cost/movement code never
 * needs to know Ozymandias' identity.
 */
export const useOzymandiasRamesseum: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("OZY_RAMESSEUM_DEFINITIONS_REQUIRED");
  const abilityId = isRecord(payload) && typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  if (abilityId !== "ramesseum-attach") throw new Error("OZY_RAMESSEUM_ABILITY_INVALID");
  if (state.phase !== "action" || state.activePlayerId !== player.id || !player.locationId) throw new Error("OZY_RAMESSEUM_WINDOW_INVALID");
  const source = findOwnedPhysicalSkill(state, player, skill.id, definitions);
  if (!source || (source.zone !== "servant-skills" && source.zone !== "board")) throw new Error("OZY_RAMESSEUM_SOURCE_UNAVAILABLE");

  placeOwnedCardOnBoard(state, player.id, source.instanceId, player.locationId);
  if (player.locationId === "mountain" || player.locationId === "city") {
    source.boardOpponentCardCostAura = { attributesAny: ["特殊", "宝具"], amount: 3, max: 12 };
    source.boardOpponentMovementLockWhileOwnerPresent = true;
  } else {
    delete source.boardOpponentCardCostAura;
    delete source.boardOpponentMovementLockWhileOwnerPresent;
  }
  return { instanceId: source.instanceId, locationId: player.locationId };
};

export const isOzymandiasRamesseumLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== "ramesseum-attach") return false;
  if (state.phase !== "action" || state.activePlayerId !== playerId || !player.locationId) return false;
  const source = findOwnedPhysicalSkill(state, player, skill.id, definitions);
  return Boolean(source && (source.zone === "servant-skills" || source.zone === "board"));
};

/**
 * Dendera's play check and after-combat temple return are one source-bound
 * lifecycle. The physical temple instance is recorded, not rediscovered by
 * translated name or display text.
 */
export const useOzymandiasDendera: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("OZY_DENDERA_DEFINITIONS_REQUIRED");
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : {};

  if (eventType === "card.played") {
    if (event.playerId !== player.id || event.face !== "up") return;
    const definitionId = typeof event.definitionId === "string" ? event.definitionId : undefined;
    const eventDefinition = definitionId ? definitions[definitionId] : undefined;
    if (!definitionId || !matchesSkill(eventDefinition, definitionId, skill.id)) return;
    const sourceInstanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
    const source = sourceInstanceId ? state.cards[sourceInstanceId] : undefined;
    if (!source || source.ownerPlayerId !== player.id || source.zone !== "attack" || !source.active) return;

    const temple = findRamesseumAtAnotherLocation(state, player, definitions);
    if (!temple) {
      closePlayerCard(state, player.id, source.instanceId, definitions);
      delete player.flags[DENDERA_TEMPLE_FLAG];
      delete player.flags[DENDERA_ROUND_FLAG];
      return { closed: true };
    }
    player.flags[DENDERA_TEMPLE_FLAG] = temple.instanceId;
    player.flags[DENDERA_ROUND_FLAG] = state.round;
    return { closed: false, templeInstanceId: temple.instanceId };
  }

  if (eventType === "combat.ending") {
    if (Number(player.flags[DENDERA_ROUND_FLAG] ?? -1) !== state.round) return;
    const templeInstanceId = typeof player.flags[DENDERA_TEMPLE_FLAG] === "string" ? player.flags[DENDERA_TEMPLE_FLAG] : undefined;
    delete player.flags[DENDERA_TEMPLE_FLAG];
    delete player.flags[DENDERA_ROUND_FLAG];
    if (!templeInstanceId) return;
    const temple = state.cards[templeInstanceId];
    if (!temple || temple.ownerPlayerId !== player.id || temple.zone !== "board") return;
    returnOwnedBoardCardToSkillZone(state, player.id, templeInstanceId, "servant-skills");
    return { returnedTempleInstanceId: templeInstanceId };
  }
};
