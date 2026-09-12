import type { GameState, PlayerState } from "../domain/state/types.ts";
import { getBoardToken, moveBoardToken, placeBoardToken, type BoardTokenLocationId } from "./board-tokens.ts";
import { movePlayerByEffect } from "./board.ts";
import type { CardDefinition } from "./content-types.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { transferVictoryPoints } from "./resources.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const TAISUI_CALAMITY_ID = "servant.taisui.skill.sc-taisui-2";
export const TAISUI_AWAKEN_ID = "servant.taisui.skill.sc-taisui-3";
export const TAISUI_CALAMITY_HANDLER = "core.taisui-calamity";
export const TAISUI_AWAKEN_HANDLER = "core.taisui-awaken";

const CALAMITY_COMBAT_ABILITY = "taisui-calamity-combat";
const AWAKEN_FLESH_ABILITY = "taisui-flesh-place";
const AWAKEN_ALTER_ABILITY = "taisui-awaken-alter";
const LOCATION_ORDER: BoardTokenLocationId[] = ["workshop", "mountain", "city", "scouting"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.zone === "attack" && card.face === "up" && card.active
      && (card.ownerPlayerId === player.id || card.controllerPlayerId === player.id)
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

export function taisuiFleshTokenId(playerId: string): string {
  return `board-token:flesh:${playerId}`;
}

function fleshLocation(state: GameState, playerId: string): BoardTokenLocationId | undefined {
  return getBoardToken(state, taisuiFleshTokenId(playerId))?.locationId;
}

function placeFleshAtController(state: GameState, player: PlayerState, skillId: string): BoardTokenLocationId {
  const locationId = player.locationId;
  if (!locationId || !LOCATION_ORDER.includes(locationId as BoardTokenLocationId)) throw new Error("TAISUI_FLESH_CONTROLLER_NOT_ON_BOARD");
  placeBoardToken(state, {
    id: taisuiFleshTokenId(player.id),
    sourceId: skillId,
    controllerPlayerId: player.id,
    locationId: locationId as BoardTokenLocationId,
  });
  return locationId as BoardTokenLocationId;
}

function middleLocationBetween(first: string | null, second: string | undefined): BoardTokenLocationId | undefined {
  if (!first || !second) return undefined;
  const firstIndex = LOCATION_ORDER.indexOf(first as BoardTokenLocationId);
  const secondIndex = LOCATION_ORDER.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || Math.abs(firstIndex - secondIndex) !== 2) return undefined;
  return LOCATION_ORDER[(firstIndex + secondIndex) / 2];
}

function canAwakenMove(state: GameState, player: PlayerState, targetLocationId: BoardTokenLocationId, definitions: Record<string, CardDefinition>): boolean {
  try {
    const draft = structuredClone(state) as GameState;
    movePlayerByEffect(draft, player.id, targetLocationId, definitions);
    return true;
  } catch {
    return false;
  }
}

/** God of Calamity: Flesh follows opponents; combat effect is front terrain or altered VP theft. */
export const useTaisuiCalamity: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("TAISUI_CALAMITY_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("TAISUI_CALAMITY_SOURCE_INACTIVE");
  if (data.eventType === "player.entered-location") {
    const event = isRecord(data.event) ? data.event : {};
    const movedPlayerId = typeof event.playerId === "string" ? event.playerId : undefined;
    const previousLocationId = typeof event.previousLocationId === "string" ? event.previousLocationId : undefined;
    const locationId = typeof event.locationId === "string" ? event.locationId : undefined;
    const method = typeof event.method === "string" ? event.method : undefined;
    const currentFlesh = fleshLocation(state, player.id);
    if (!movedPlayerId || movedPlayerId === player.id || !state.players[movedPlayerId] || method === "deploy"
      || previousLocationId !== currentFlesh || !LOCATION_ORDER.includes(locationId as BoardTokenLocationId)) return;
    return moveBoardToken(state, taisuiFleshTokenId(player.id), locationId as BoardTokenLocationId);
  }
  if (data.abilityId !== CALAMITY_COMBAT_ABILITY || state.phase !== "combat" || state.activePlayerId !== player.id) {
    throw new Error("TAISUI_CALAMITY_ABILITY_INVALID");
  }
  const locationId = fleshLocation(state, player.id);
  if (!locationId) throw new Error("TAISUI_FLESH_NOT_PLACED");
  if (source.reversed === true) {
    if (player.locationId === locationId) throw new Error("TAISUI_CALAMITY_ALTER_REQUIRES_AWAY");
    const stolen: Record<string, number> = {};
    for (const targetPlayerId of state.board.locations[locationId] ?? []) {
      const target = state.players[targetPlayerId];
      if (!target || target.eliminated || targetPlayerId === player.id) continue;
      stolen[targetPlayerId] = transferVictoryPoints(target, player, 1);
    }
    return { mode: "steal", locationId, stolen };
  }
  if (player.locationId !== locationId) throw new Error("TAISUI_CALAMITY_TERRAIN_LOCATION_REQUIRED");
  player.flags.roundTerrainAdvantageBonusRound = state.round;
  player.flags.roundTerrainAdvantageBonusLocationId = locationId;
  player.flags.roundTerrainAdvantageBonus = Number(player.flags.roundTerrainAdvantageBonus ?? 0) + 3;
  return { mode: "terrain", locationId, amount: 3 };
};

export const isTaisuiCalamityLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== CALAMITY_COMBAT_ABILITY || state.phase !== "combat" || state.activePlayerId !== playerId) return false;
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  const locationId = fleshLocation(state, playerId);
  if (!source || !locationId) return false;
  return source.reversed === true ? player.locationId !== locationId : player.locationId === locationId;
};

/** Taisu Awaken: place/move Flesh during Outpost; altered action converges both objects and defeats opponents there. */
export const useTaisuiAwaken: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("TAISUI_AWAKEN_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("TAISUI_AWAKEN_SOURCE_INACTIVE");
  if (data.abilityId === AWAKEN_FLESH_ABILITY) {
    if (state.phase !== "outpost" || state.activePlayerId !== player.id || source.reversed === true) throw new Error("TAISUI_FLESH_WINDOW_INVALID");
    return { locationId: placeFleshAtController(state, player, skill.id) };
  }
  if (data.abilityId !== AWAKEN_ALTER_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id || source.reversed !== true) {
    throw new Error("TAISUI_AWAKEN_ALTER_INVALID");
  }
  const currentFlesh = fleshLocation(state, player.id);
  const targetLocationId = middleLocationBetween(player.locationId, currentFlesh);
  if (!targetLocationId || !canAwakenMove(state, player, targetLocationId, definitions)) throw new Error("TAISUI_AWAKEN_DISTANCE_INVALID");
  const wasHidden = !player.trueNameRevealed;
  revealPlayerTrueName(state, player.id);
  if (wasHidden) emitEvent?.("servant.true-name-revealed", { playerId: player.id, servantId: player.servantId, sourceDefinitionId: skill.id, method: "taisui-awaken" });
  const movement = movePlayerByEffect(state, player.id, targetLocationId, definitions);
  moveBoardToken(state, taisuiFleshTokenId(player.id), targetLocationId);
  emitEvent?.("player.moved", { playerId: player.id, ...movement, method: "effect", sourceId: skill.id });
  emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect", sourceId: skill.id });
  const applied: string[] = [];
  for (const targetPlayerId of state.board.locations[targetLocationId] ?? []) {
    if (targetPlayerId === player.id || state.players[targetPlayerId]?.eliminated) continue;
    const result = applyDefeatEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: skill.id, method: "taisui-awaken" });
    if (result.applied) applied.push(targetPlayerId);
  }
  return { targetLocationId, appliedPlayerIds: applied };
};

export const isTaisuiAwakenLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId) return false;
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) return false;
  if (ability?.id === AWAKEN_FLESH_ABILITY) return state.phase === "outpost" && source.reversed !== true && Boolean(player.locationId);
  if (ability?.id === AWAKEN_ALTER_ABILITY) {
    if (state.phase !== "action" || source.reversed !== true) return false;
    const targetLocationId = middleLocationBetween(player.locationId, fleshLocation(state, player.id));
    return Boolean(targetLocationId && canAwakenMove(state, player, targetLocationId, definitions));
  }
  return false;
};
