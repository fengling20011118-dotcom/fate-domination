import type { CardAbilityRegistry } from "./card-abilities.ts";
import { movePlayerByEffect } from "./board.ts";
import { addCardToAttack } from "./card-play.ts";
import { assertCardCanEnterAttack } from "./card-rules.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { payManaCost } from "./costs.ts";
import { isStructuredCardAbilityMoveDirectionAllowed } from "./rule-modifiers.ts";
import { grantBurnedWorkshop, KOHAKU_MAGICAL_ONSLAUGHT_ID } from "./kohaku.ts";
import { registerSiegLindenLeafCardAbility } from "./sieg.ts";
import { cardInstanceGrantsAbility } from "./card-inherited-traits.ts";
import { registerMashCardAbilities } from "./mash.ts";
import { registerSalieriCardAbilities } from "./salieri.ts";

const locationOrder = ["workshop", "mountain", "city", "scouting"] as const;

/** Register confirmed executable abilities printed on common/basic cards. */
export function registerBasicCardAbilities(registry: CardAbilityRegistry): void {
  registerSiegLindenLeafCardAbility(registry);
  registerMashCardAbilities(registry);
  registerSalieriCardAbilities(registry);
  if (!registry.has("basic.ignore-defeat")) {
    registry.register("basic.ignore-defeat", ({ state, playerId, instanceId }) => {
      const player = state.players[playerId];
      const instance = state.cards[instanceId];
      if (state.phase !== "combat" || state.activePlayerId !== playerId) throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
      if (!player || !instance?.active || instance.zone !== "attack" || instance.face !== "up") throw new Error("LUCK_SOURCE_INVALID");
      player.flags.ignoreDefeatRound = state.round;
    });
  }
  if (!registry.has("basic.remote-control")) {
    registry.register("basic.remote-control", ({ state, playerId, instanceId, effectTimingOverride }) => {
      const player = state.players[playerId];
      const instance = state.cards[instanceId];
      if (effectTimingOverride !== true && state.activePlayerId !== playerId) throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
      if (!player || !instance?.active || instance.zone !== "attack" || instance.face !== "up") throw new Error("REMOTE_CONTROL_SOURCE_INVALID");
      const bonus = Number(player.flags.deploymentBonus ?? 0);
      if (player.flags.deploymentBonusActive !== true || !Number.isInteger(bonus) || bonus <= 0) throw new Error("DEPLOYMENT_BONUS_NOT_AVAILABLE");
      player.flags.deploymentBonus = bonus * 2;
    });
  }
  if (!registry.has("basic.quick-march")) {
    registry.register("basic.quick-march", ({ state, playerId, instanceId, target, definitions, emitEvent, effectTimingOverride }) => {
      const player = state.players[playerId];
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      if (!player || player.eliminated || !player.locationId) throw new Error("PLAYER_NOT_AVAILABLE");
      // CardAbilityRegistry is the authoritative phase boundary. It also permits
      // an action-phase ability during combat when a structured card modifier
      // explicitly grants that exception; do not re-impose `phase === action`
      // here or the generic allowActionAbilityInCombat rule becomes inert.
      if (effectTimingOverride !== true && state.activePlayerId !== playerId) throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
      if (!instance || !definition || !cardInstanceGrantsAbility(state, instance, definition, definitions, "basic.quick-march")) throw new Error("CARD_ABILITY_NOT_GRANTED");
      if (typeof target !== "string") throw new Error("LOCATION_REQUIRED");
      const fromIndex = locationOrder.indexOf(player.locationId as typeof locationOrder[number]);
      const toIndex = locationOrder.indexOf(target as typeof locationOrder[number]);
      if (fromIndex < 0 || toIndex < 0 || Math.abs(toIndex - fromIndex) !== 1) throw new Error("QUICK_MARCH_DESTINATION_INVALID");
      const direction = toIndex > fromIndex ? "forward" : "backward";
      if (direction === "backward" && !isStructuredCardAbilityMoveDirectionAllowed(state, playerId, instance, definition, "backward", definitions)) {
        throw new Error("QUICK_MARCH_DIRECTION_FORBIDDEN");
      }
      const movement = movePlayerByEffect(state, playerId, target, definitions);
      emitEvent?.("player.moved", { playerId, ...movement });
      emitEvent?.("player.entered-location", { playerId, ...movement, method: "effect" });
    });
  }
  if (!registry.has("basic.combat-play-from-hand")) {
    registry.register("basic.combat-play-from-hand", ({ state, playerId, instanceId, definitions, emitEvent }) => {
      const player = state.players[playerId];
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
      if (state.phase !== "combat" || state.activePlayerId !== playerId || state.step !== "player-window") {
        throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
      }
      if (!instance || instance.zone !== "hand") throw new Error("COMBAT_PLAY_FROM_HAND_REQUIRED");
      if (!definition || !definition.cardAbilityIds?.includes("basic.combat-play-from-hand")) throw new Error("CARD_ABILITY_NOT_GRANTED");
      const { paidMana } = addCardToAttack(state, playerId, instanceId, definitions, { payCost: true, allowedSourceZones: ["hand"] });
      emitEvent?.("card.played", {
        playerId,
        instanceId,
        definitionId: definition.id,
        face: "up",
        paidMana,
        attributes: getCardInstanceAttributes(instance, definition, state, definitions),
        method: "ability",
      });
    }, { allowedZones: ["hand"], allowInactive: true });
  }
  if (!registry.has("volumen.perfect-flow")) {
    registry.register("volumen.perfect-flow", ({ state, playerId, instanceId, definitions, emitEvent }) => {
      const player = state.players[playerId];
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
      if (state.phase !== "combat" || state.activePlayerId !== playerId || state.step !== "player-window") throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
      if (!instance || instance.zone !== "hand" || !definition?.cardAbilityIds?.includes("volumen.perfect-flow")) throw new Error("VOLUMEN_HAND_CARD_REQUIRED");
      assertCardCanEnterAttack({ state, playerId, instanceId, definitions, faceDown: false, allowedSourceZones: ["hand"] });
      payManaCost(state, player, 2, definitions);
      player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + 2;
      addCardToAttack(state, playerId, instanceId, definitions, { payCost: false, allowedSourceZones: ["hand"] });
      emitEvent?.("card.played", {
        playerId,
        instanceId,
        definitionId: definition.id,
        face: "up",
        paidMana: 2,
        attributes: getCardInstanceAttributes(instance, definition, state, definitions),
        method: "perfect-flow",
      });
    }, { allowedZones: ["hand"], allowInactive: true });
  }
  if (!registry.has("volumen.scalp")) {
    registry.register("volumen.scalp", ({ state, playerId, instanceId, definitions }) => {
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      if (state.phase !== "action" || state.activePlayerId !== playerId || state.step !== "player-window") throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
      if (!instance?.active || instance.zone !== "attack" || !definition?.cardAbilityIds?.includes("volumen.scalp")) throw new Error("VOLUMEN_SCALP_SOURCE_INVALID");
      const marker = `volumen-scalp-used:${state.round}`;
      if (instance.modifiers.includes(marker)) throw new Error("CARD_ABILITY_LIMIT_REACHED");
      instance.modifiers.push(marker);
      instance.powerModifiers = [
        ...(instance.powerModifiers ?? []),
        { id: `${marker}:${instanceId}`, sourceId: definition.id, kind: "add", value: 2, duration: "round" },
      ];
    });
  }
  if (!registry.has("volumen.ire-sanctio")) {
    registry.register("volumen.ire-sanctio", ({ state, playerId, instanceId, definitions }) => {
      const player = state.players[playerId];
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      if (state.phase !== "combat" || state.activePlayerId !== playerId || state.step !== "player-window") throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
      if (!player || !instance?.active || instance.zone !== "attack" || !definition?.cardAbilityIds?.includes("volumen.ire-sanctio")) throw new Error("VOLUMEN_IRE_SOURCE_INVALID");
      const marker = `volumen-ire-used:${state.round}`;
      if (instance.modifiers.includes(marker)) throw new Error("CARD_ABILITY_LIMIT_REACHED");
      instance.modifiers.push(marker);
      const locationId = player.locationId;
      if (locationId !== "mountain" && locationId !== "city") throw new Error("VOLUMEN_IRE_NOT_IN_BATTLE");
      for (const opponentId of state.board.locations[locationId] ?? []) {
        if (opponentId === playerId) continue;
        const opponent = state.players[opponentId];
        if (!opponent || opponent.eliminated) continue;
        opponent.flags.deploymentBonusActive = false;
        opponent.flags.deploymentBonus = 0;
      }
    });
  }
  if (!registry.has("volumen.fervor")) {
    registry.register("volumen.fervor", ({ state, playerId, instanceId, definitions }) => {
      const player = state.players[playerId];
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      if (state.phase !== "combat" || state.activePlayerId !== playerId || state.step !== "player-window") throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
      if (!player || !instance?.active || instance.zone !== "attack" || !definition?.cardAbilityIds?.includes("volumen.fervor")) throw new Error("VOLUMEN_FERVOR_SOURCE_INVALID");
      const marker = `volumen-fervor-used:${state.round}`;
      if (instance.modifiers.includes(marker)) throw new Error("CARD_ABILITY_LIMIT_REACHED");
      instance.modifiers.push(marker);
      player.flags.ignoreDefeatRound = state.round;
    });
  }
  if (!registry.has("kohaku.magical-onslaught-arson")) {
    registry.register("kohaku.magical-onslaught-arson", ({ state, playerId, instanceId, target, definitions }) => {
      const player = state.players[playerId];
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      if (state.phase !== "combat" || state.activePlayerId !== playerId || state.step !== "player-window") throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
      if (!player || !instance?.active || instance.zone !== "attack" || definition?.id !== KOHAKU_MAGICAL_ONSLAUGHT_ID
        || !definition.cardAbilityIds?.includes("kohaku.magical-onslaught-arson")) throw new Error("KOHAKU_ONSLAUGHT_SOURCE_INVALID");
      const locationId = player.locationId;
      if (locationId === "mountain" || locationId === "city") {
        for (const opponentId of state.board.locations[locationId] ?? []) {
          if (opponentId === playerId) continue;
          const opponent = state.players[opponentId];
          if (!opponent || opponent.eliminated) continue;
          opponent.flags.terrainAdvantageContributionMultiplierRound = state.round;
          opponent.flags.terrainAdvantageContributionMultiplier = -1;
        }
        return;
      }
      if (typeof target !== "string") throw new Error("KOHAKU_ONSLAUGHT_BURN_TARGET_REQUIRED");
      const opponent = state.players[target];
      if (!opponent || opponent.eliminated || target === playerId || opponent.locationId === "workshop") throw new Error("KOHAKU_ONSLAUGHT_BURN_TARGET_INVALID");
      grantBurnedWorkshop(state, target, definitions);
    });
  }
}
