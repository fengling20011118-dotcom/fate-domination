import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { addCardToAttack, joinOwnedCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { payManaCost } from "./costs.ts";
import { RYOUGI_BOUNDARY_BOTTOM_HANDLER, useRyougiBoundaryBottomDiscard } from "./ryougi.ts";

export interface GrantedCardAbilityHandlerContext {
  state: GameState;
  playerId: string;
  instanceId: string;
  target?: unknown;
  definitions: Record<string, CardDefinition>;
  emitEvent?: (type: string, payload: unknown) => void;
}

type GrantedCardAbilityHandler = (context: GrantedCardAbilityHandlerContext) => void;

/**
 * Ciel's expanded Soul Crush is genuinely unique card-granted behavior. Keep the
 * dynamic grant generic in card-transforms, and keep the actual effect isolated
 * here rather than branching in the match engine.
 */
const useCielExpandedSoulCrush: GrantedCardAbilityHandler = ({ state, playerId, definitions }) => {
  const player = state.players[playerId];
  const locationId = player?.locationId;
  if (!player || (locationId !== "mountain" && locationId !== "city")) throw new Error("CIEL_SOUL_CRUSH_NOT_IN_BATTLEFIELD");
  const opponentIds = (state.board.locations[locationId] ?? []).filter((id) => id !== playerId && !state.players[id]?.eliminated);
  if (opponentIds.length === 0) throw new Error("CIEL_SOUL_CRUSH_NO_OPPONENT");
  let affected = 0;
  for (const opponentId of opponentIds) {
    const opponent = state.players[opponentId];
    const controlsLucky = opponent.attack.some((instanceId) => {
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      return Boolean(instance?.active && instance.face === "up" && definition?.id === "card.cardluck");
    });
    if (controlsLucky) continue;
    opponent.flags.situationBenefitsSuppressedRound = state.round + 1;
    affected += 1;
  }
  if (affected === 0) throw new Error("CIEL_SOUL_CRUSH_NO_ELIGIBLE_OPPONENT");
};

/** 葛木宗一郎【完美呼吸】：手牌/技能区的【蛇】以被动/战斗阶段能力支付6魔力直接加入攻击。 */
const useKuzukiSnakeJoin: GrantedCardAbilityHandler = ({ state, playerId, instanceId, definitions }) => {
  joinOwnedCardToAttack(state, playerId, instanceId, definitions, {
    manaCost: 6,
    allowedSourceZones: ["hand", "master-skills", "servant-skills"],
  });
};

/** Generic continuous grant: play this physical hand card during the combat window. */
const usePlayCardFromHandInCombat: GrantedCardAbilityHandler = ({ state, playerId, instanceId, definitions, emitEvent }) => {
  const player = state.players[playerId];
  const instance = state.cards[instanceId];
  const definition = instance ? definitions[instance.definitionId] : undefined;
  if (!player || player.eliminated || state.phase !== "combat" || state.activePlayerId !== playerId || state.step !== "player-window") {
    throw new Error("GRANTED_COMBAT_PLAY_WINDOW_FORBIDDEN");
  }
  if (!instance || instance.zone !== "hand" || !definition) throw new Error("GRANTED_COMBAT_PLAY_HAND_CARD_REQUIRED");
  const { paidMana } = addCardToAttack(state, playerId, instanceId, definitions, {
    payCost: true,
    allowedSourceZones: ["hand"],
    bypassFaceUpPlayLimit: true,
    bypassTiming: true,
  });
  emitEvent?.("card.played", {
    playerId,
    instanceId,
    definitionId: definition.id,
    face: "up",
    paidMana,
    attributes: getCardInstanceAttributes(instance, definition, state, definitions),
    method: "granted-card-ability",
  });
};

/** Sigurd's Bölverk Gram grants this Action ability to each basic attack while the skill is revealed. */
const useSigurdBladeStorm: GrantedCardAbilityHandler = ({ state, playerId, instanceId, definitions }) => {
  const player = state.players[playerId];
  const instance = state.cards[instanceId];
  const definition = instance ? definitions[instance.definitionId] : undefined;
  if (!player || player.eliminated || !instance || !definition || definition.basic !== true || instance.zone !== "attack" || !instance.active || instance.face !== "up") {
    throw new Error("SIGURD_BLADE_STORM_BASIC_ATTACK_REQUIRED");
  }
  payManaCost(state, player, 2, definitions);
  instance.basePowerMultiplier = Number(instance.basePowerMultiplier ?? 1) * 2;
  instance.removeAfterCombatRound = state.round;
};

const handlers: Readonly<Record<string, GrantedCardAbilityHandler>> = Object.freeze({
  "core.ciel-expanded-soul-crush": useCielExpandedSoulCrush,
  "core.kuzuki-snake-join": useKuzukiSnakeJoin,
  "core.play-card-from-hand-in-combat": usePlayCardFromHandInCombat,
  "core.sigurd-blade-storm": useSigurdBladeStorm,
  [RYOUGI_BOUNDARY_BOTTOM_HANDLER]: useRyougiBoundaryBottomDiscard,
});

export function executeConfirmedGrantedCardAbilityHandler(
  handlerId: string,
  context: GrantedCardAbilityHandlerContext,
): void {
  const handler = handlers[handlerId];
  if (!handler) throw new Error("GRANTED_CARD_ABILITY_HANDLER_NOT_FOUND");
  handler(context);
}
