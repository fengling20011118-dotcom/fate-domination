import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import type { CardDefinition } from "./content-types.ts";
import { gainVictoryPoints } from "./resources.ts";
import { addPlayerStatus, hasPlayerStatus, STATUS_DISARMED, STATUS_ROMAN } from "./player-statuses.ts";
import type { SkillHandler } from "./skill-types.ts";

export const ROMULUS_MOLES_ID = "servant.romulus.skill.sc-romulus-1";
export const ROMULUS_MAGNA_ID = "servant.romulus.skill.sc-romulus-2";
export const ROMULUS_MOLES_HANDLER = "core.romulus-moles-necessrie";
export const ROMULUS_MAGNA_HANDLER = "core.romulus-magna-voluisse-magnum";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function skillDefinitionIds(skillId: string): string[] {
  return [skillId, `card.skill.${skillId}`];
}

function activeOwnedSkillAttack(state: GameState, playerId: string, skillId: string, definitions: Record<string, CardDefinition>) {
  return state.players[playerId]?.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card?.active && card.face === "up" && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
  });
}

/** Moles Necessrie uses stable Roman/Disarmed statuses and a generic conditional card-power rule. */
export const useRomulusMolesNecessrie: SkillHandler = ({ state, player, skill, payload }) => {
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : {};
  if (eventType === "game.started") {
    const id = `${skill.id}:pax-romana`;
    if (!(player.cardRuleModifiers ?? []).some((modifier) => modifier.id === id)) {
      addCardRuleModifier(player, {
        id,
        sourceId: skill.id,
        targetDefinitionIds: [
          ...skillDefinitionIds("servant.romulus.skill.sc-romulus-1"),
          ...skillDefinitionIds("servant.romulus.skill.sc-romulus-2"),
          ...skillDefinitionIds("servant.romulus.skill.sc-romulus-3"),
        ],
        powerAdd: 4,
        condition: { allOtherBattlefieldPlayersHaveStatus: STATUS_ROMAN },
        duration: "game",
      });
    }
    return;
  }
  if (eventType !== "player.moved") return;
  const movedPlayerId = typeof event.playerId === "string" ? event.playerId : undefined;
  const locationId = typeof event.locationId === "string" ? event.locationId : undefined;
  if (!movedPlayerId || movedPlayerId === player.id || locationId !== player.locationId || (locationId !== "mountain" && locationId !== "city")) return;
  const target = state.players[movedPlayerId];
  if (!target || target.eliminated || hasPlayerStatus(target, STATUS_ROMAN)) return;
  addPlayerStatus(target, STATUS_DISARMED);
};

/** Magna Voluisse Magnum converts losers when Romulus wins, then rewards every Roman winner independently. */
export const useRomulusMagnaVoluisseMagnum: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("ROMULUS_MAGNA_DEFINITIONS_REQUIRED");
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : undefined;
  if (eventType !== "combat.resolved" || !event || !activeOwnedSkillAttack(state, player.id, skill.id, definitions)) return;
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  const powers = isRecord(event.powers) ? event.powers : {};
  if (!Object.prototype.hasOwnProperty.call(powers, player.id)) return;
  if (winnerIds.includes(player.id)) {
    for (const participantId of Object.keys(powers)) {
      if (winnerIds.includes(participantId)) continue;
      const loser = state.players[participantId];
      if (loser && !loser.eliminated) addPlayerStatus(loser, STATUS_ROMAN);
    }
  }
  for (const winnerId of winnerIds) {
    const winner = state.players[winnerId];
    if (!winner || winner.eliminated || !hasPlayerStatus(winner, STATUS_ROMAN)) continue;
    gainVictoryPoints(player, 1);
    gainVictoryPoints(winner, 1);
  }
};
