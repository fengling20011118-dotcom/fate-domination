import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { movePlayerByEffect } from "./board.ts";
import { closePlayerCard, lendActiveSkillToPlayer } from "./decks.ts";
import { payManaCost } from "./costs.ts";
import { transferVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ODYSSEUS_SERVANT_ID = "servant.odysseus";
export const ODYSSEUS_TROIA_ID = "servant.odysseus.skill.sc-odysseus-1";
export const ODYSSEUS_AIGIS_ID = "servant.odysseus.skill.sc-odysseus-2";
export const ODYSSEUS_TROIA_HANDLER = "core.odysseus-troia-hippos";
export const ODYSSEUS_AIGIS_HANDLER = "core.odysseus-aigis";
export const ODYSSEUS_TROIA_RESOLVE = "core.odysseus-troia-hippos-resolve";
export const ODYSSEUS_AIGIS_RESOLVE = "core.odysseus-aigis-resolve";

const AIGIS_ABILITY_ID = "aigis-retreat";
const LOCATION_ORDER = ["workshop", "mountain", "city", "scouting"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function troiaCards(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).filter((card) => {
    const definition = definitions[card.definitionId];
    return card.ownerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && matchesSkill(definition, card.definitionId, ODYSSEUS_TROIA_ID);
  });
}

function activeAigis(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, ODYSSEUS_AIGIS_ID));
  });
}

function sameLocationOtherPlayers(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (!locationId) return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated);
}

function openTroiaTargetDecision(
  state: GameState,
  player: PlayerState,
  sourceInstanceId: string,
  candidates: string[],
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${ODYSSEUS_TROIA_ID}:lend:${sourceInstanceId}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: ODYSSEUS_TROIA_RESOLVE,
    sourceId: ODYSSEUS_TROIA_ID,
    controllerPlayerId: player.id,
    payload: { stage: "lend", sourceInstanceId, candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "odysseus-troia-lend-target",
    options: candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function recallTroiaToOwner(state: GameState, player: PlayerState, instanceId: string): void {
  const card = state.cards[instanceId];
  const controllerId = card?.controllerPlayerId;
  if (!card || card.ownerPlayerId !== player.id || !controllerId || controllerId === player.id) return;
  const controller = state.players[controllerId];
  if (!controller) return;
  controller.attack = controller.attack.filter((id) => id !== instanceId);
  player.attack = player.attack.filter((id) => id !== instanceId);
  player.attack.push(instanceId);
  card.controllerPlayerId = player.id;
  card.zone = "attack";
  card.face = "up";
  card.active = true;
  delete card.returnToOwnerSkillZoneOnClose;
  delete card.returnToOwnerDiscardOnClose;
  delete card.removeWithControllerOnElimination;
  const marker = `${ODYSSEUS_TROIA_ID}:close-at-round-end:${state.round}`;
  if (!card.modifiers.includes(marker)) card.modifiers.push(marker);
}

function troiaCloseMarker(round: number): string {
  return `${ODYSSEUS_TROIA_ID}:close-at-round-end:${round}`;
}

/** Troia Hippos resolves its lending, residual theft and owner/controller combat recall. */
export const useOdysseusTroiaHippos: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("ODYSSEUS_TROIA_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (eventType === "card.played") {
    const instanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
    const definitionId = typeof event.definitionId === "string" ? event.definitionId : undefined;
    const source = instanceId ? state.cards[instanceId] : undefined;
    const definition = source ? definitions[source.definitionId] : undefined;
    if (event.playerId !== player.id || !instanceId || !definitionId || !source
      || !matchesSkill(definition, source.definitionId, ODYSSEUS_TROIA_ID)) return;
    const candidates = sameLocationOtherPlayers(state, player);
    if (candidates.length === 0) throw new Error("ODYSSEUS_TROIA_LEND_TARGET_REQUIRED");
    openTroiaTargetDecision(state, player, instanceId, candidates, openDecision);
    return;
  }

  if (eventType === "combat.resolved") {
    const powers = isRecord(event.powers) ? event.powers : {};
    for (const card of troiaCards(state, player, definitions)) {
      const controllerId = card.controllerPlayerId;
      if (!controllerId || controllerId === player.id || card.playedRound === state.round) continue;
      if (!Object.prototype.hasOwnProperty.call(powers, player.id) || !Object.prototype.hasOwnProperty.call(powers, controllerId)) continue;
      recallTroiaToOwner(state, player, card.instanceId);
    }
    return;
  }

  if (eventType === "round.ending") {
    for (const card of [...troiaCards(state, player, definitions)]) {
      const controllerId = card.controllerPlayerId;
      if (controllerId && controllerId !== player.id) {
        const controller = state.players[controllerId];
        if (controller && !controller.eliminated) transferVictoryPoints(controller, player, 1);
      }
      if (card.controllerPlayerId === player.id && card.modifiers.includes(troiaCloseMarker(state.round))) {
        closePlayerCard(state, player.id, card.instanceId, definitions);
      }
    }
  }
};

export const resolveOdysseusTroiaHippos: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("ODYSSEUS_TROIA_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((value): value is string => typeof value === "string") : [];
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((value): value is string => typeof value === "string") : [];
  const sourceInstanceId = typeof previous.sourceInstanceId === "string" ? previous.sourceInstanceId : undefined;
  if (previous.stage !== "lend" || decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0]) || !sourceInstanceId) {
    throw new Error("ODYSSEUS_TROIA_DECISION_INVALID");
  }
  const targetId = selections[0];
  if (!sameLocationOtherPlayers(state, player).includes(targetId)) throw new Error("ODYSSEUS_TROIA_LEND_TARGET_INVALID");
  lendActiveSkillToPlayer(state, player.id, targetId, sourceInstanceId, definitions, { removeWithControllerOnElimination: true });
  return { sourceInstanceId, controllerPlayerId: targetId };
};

function backwardDestination(locationId: string | null): typeof LOCATION_ORDER[number] | undefined {
  if (!locationId) return undefined;
  const index = LOCATION_ORDER.indexOf(locationId as typeof LOCATION_ORDER[number]);
  return index > 0 ? LOCATION_ORDER[index - 1] : undefined;
}

function canMoveByAigis(state: GameState, playerId: string, destination: string, definitions: Record<string, CardDefinition>): boolean {
  try {
    const draft = structuredClone(state);
    movePlayerByEffect(draft, playerId, destination, definitions);
    return true;
  } catch {
    return false;
  }
}

function canPayAigis(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): boolean {
  try {
    const draft = structuredClone(state);
    const target = draft.players[playerId];
    if (!target) return false;
    payManaCost(draft, target, 4, definitions);
    return true;
  } catch {
    return false;
  }
}

function applyAigisNoMovePenalty(player: PlayerState): void {
  player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) - 5;
}

function performAigisMove(
  state: GameState,
  playerId: string,
  destination: string,
  definitions: Record<string, CardDefinition>,
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
): void {
  const movement = movePlayerByEffect(state, playerId, destination, definitions);
  emitEvent?.("player.moved", { playerId, ...movement, method: "effect", sourceId: ODYSSEUS_AIGIS_ID });
  emitEvent?.("player.entered-location", { playerId, previousLocationId: movement.previousLocationId, locationId: movement.locationId, distance: movement.distance, method: "effect", sourceId: ODYSSEUS_AIGIS_ID });
}

function installAigisMovementSurcharge(state: GameState, player: PlayerState, sourceInstanceId: string): void {
  const id = `${ODYSSEUS_AIGIS_ID}:movement-cost:${state.round}`;
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
  state.activeRuleModifiers.push({
    id,
    sourceId: ODYSSEUS_AIGIS_ID,
    sourceInstanceId,
    controllerPlayerId: player.id,
    operation: "add",
    rule: "movement_cost",
    scope: { subject: "all_players", method: "regular", perSpace: true },
    value: 2,
    duration: "round",
    createdRound: state.round,
  });
}

function aigisPlayerOrder(state: GameState): string[] {
  return [...new Set([...(state.turnOrder.length ? state.turnOrder : []), ...Object.keys(state.players)])]
    .filter((id) => Boolean(state.players[id]) && !state.players[id].eliminated);
}

function openAigisPlayerDecision(
  state: GameState,
  owner: PlayerState,
  playerIds: string[],
  index: number,
  targetPlayerId: string,
  destination: string,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${owner.id}:${ODYSSEUS_AIGIS_ID}:player:${index}:${targetPlayerId}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: ODYSSEUS_AIGIS_RESOLVE,
    sourceId: ODYSSEUS_AIGIS_ID,
    controllerPlayerId: owner.id,
    payload: { stage: "player", playerIds, index, targetPlayerId, destination },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: owner.id,
    chooserPlayerIds: [targetPlayerId],
    kind: "odysseus-aigis-move-or-pay",
    options: [
      { id: "move", label: "逆着箭头移动至下一地点" },
      { id: "pay", label: "支付4点魔力并留在原地" },
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function advanceAigis(
  state: GameState,
  owner: PlayerState,
  playerIds: string[],
  startIndex: number,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
): { completed: boolean; processed: number } {
  let processed = 0;
  for (let index = startIndex; index < playerIds.length; index += 1) {
    const targetPlayerId = playerIds[index];
    const target = state.players[targetPlayerId];
    if (!target || target.eliminated || !target.locationId) continue;
    const destination = backwardDestination(target.locationId);
    if (!destination || !canMoveByAigis(state, targetPlayerId, destination, definitions)) {
      applyAigisNoMovePenalty(target);
      processed += 1;
      continue;
    }
    if (canPayAigis(state, targetPlayerId, definitions)) {
      openAigisPlayerDecision(state, owner, playerIds, index, targetPlayerId, destination, openDecision);
      return { completed: false, processed };
    }
    performAigisMove(state, targetPlayerId, destination, definitions, emitEvent);
    processed += 1;
  }
  return { completed: true, processed };
}

/** Aigis resolves every player's backward move/payment serially and adds +2 normal movement cost per space for the round. */
export const useOdysseusAigis: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions) throw new Error("ODYSSEUS_AIGIS_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== AIGIS_ABILITY_ID || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("ODYSSEUS_AIGIS_WINDOW_INVALID");
  }
  const source = activeAigis(state, player, definitions);
  if (!source) throw new Error("ODYSSEUS_AIGIS_SOURCE_INACTIVE");
  installAigisMovementSurcharge(state, player, source.instanceId);
  return advanceAigis(state, player, aigisPlayerOrder(state), 0, definitions, openDecision, emitEvent);
};

export const resolveOdysseusAigis: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("ODYSSEUS_AIGIS_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((value): value is string => typeof value === "string") : [];
  const playerIds = Array.isArray(previous.playerIds) ? previous.playerIds.filter((value): value is string => typeof value === "string") : [];
  const index = Number(previous.index);
  const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
  const destination = typeof previous.destination === "string" ? previous.destination : undefined;
  if (previous.stage !== "player" || decision.status !== "resolved" || selections.length !== 1
    || !Number.isInteger(index) || index < 0 || !targetPlayerId || playerIds[index] !== targetPlayerId || !destination
    || (selections[0] !== "move" && selections[0] !== "pay")) {
    throw new Error("ODYSSEUS_AIGIS_DECISION_INVALID");
  }
  const target = state.players[targetPlayerId];
  if (!target || target.eliminated) throw new Error("ODYSSEUS_AIGIS_TARGET_INVALID");
  if (selections[0] === "pay") {
    payManaCost(state, target, 4, definitions);
    target.flags.roundManaSpent = Number(target.flags.roundManaSpent ?? 0) + 4;
    applyAigisNoMovePenalty(target);
  } else {
    if (backwardDestination(target.locationId) !== destination) throw new Error("ODYSSEUS_AIGIS_MOVE_DESTINATION_INVALID");
    performAigisMove(state, targetPlayerId, destination, definitions, emitEvent);
  }
  return advanceAigis(state, player, playerIds, index + 1, definitions, openDecision, emitEvent);
};

export const isOdysseusAigisLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && !player.eliminated && definitions && ability?.id === AIGIS_ABILITY_ID
    && state.phase === "action" && state.activePlayerId === playerId && activeAigis(state, player, definitions));
};
