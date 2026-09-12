import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import type { CombatPowerSnapshot } from "./combat.ts";
import type { CardAbilityRegistry } from "./card-abilities.ts";
import { movePlayerByEffect } from "./board.ts";
import type { CardDefinition } from "./content-types.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { closePlayerCard, createDerivedCardInstance, lendOwnedBoardCardToPlayerAttack, movePlayerCard, placeOwnedCardOnBoard } from "./decks.ts";
import { gainVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { defeatStrictSecondHighestOpponents, strictSecondPowerCondition } from "./strict-second-power.ts";

export const KOYANSKAYA_NFF_ID = "servant.koyanskaya.skill.sc-koyanskaya-2";
export const KOYANSKAYA_NFF_HANDLER = "core.koyanskaya-nff";
export const KOYANSKAYA_NF14_ID = "servant.koyanskaya.skill.sc-koyanskaya-4";
export const KOYANSKAYA_NF14_ABILITY = "koyanskaya.nf14-suppressive-fire";
export const KOYANSKAYA_NF14_TOKEN_ID = "card.token.koyanskaya-nf14-agility";
export const KOYANSKAYA_PACKAGE_HANDLER = "core.koyanskaya-package";
export const KOYANSKAYA_PACKAGE_RESOLVE = "core.koyanskaya-package-resolve";
export const KOYANSKAYA_GOSPEL_ID = "servant.koyanskaya.skill.sc-koyanskaya-3";
export const KOYANSKAYA_NF56_ID = "servant.koyanskaya.skill.sc-koyanskaya-5";
export const KOYANSKAYA_NF00_ID = "servant.koyanskaya.skill.sc-koyanskaya-6";
export const KOYANSKAYA_GOSPEL_NORMAL_ABILITY = "gospel-close-or-reward";
export const KOYANSKAYA_GOSPEL_REVERSE_ABILITY = "gospel-seize-cargo";
export const KOYANSKAYA_NF56_MOVE_ABILITY = "nf56-reverse-move";
export const KOYANSKAYA_NF00_REVERSE_ABILITY = "nf00-strict-second-defeat";

const NF56_CARD_ID = "card.x-nf56";
const NF00_CARD_ID = "card.x-nf00";
const CARGO_MARKER = `effect:${KOYANSKAYA_NFF_ID}:cargo`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCargo(card: CardInstance | undefined, ownerPlayerId: string): card is CardInstance {
  return Boolean(card && card.ownerPlayerId === ownerPlayerId && card.modifiers?.includes(CARGO_MARKER));
}

function cargoAtLocation(state: GameState, ownerPlayerId: string, locationId: string): CardInstance[] {
  return Object.values(state.cards).filter((card) => isCargo(card, ownerPlayerId)
    && card.zone === "board" && card.boardLocationId === locationId);
}

function settleAcquiredCargo(state: GameState, ownerPlayerId: string, definitions: Record<string, CardDefinition>): string[] {
  const returned: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (!isCargo(card, ownerPlayerId) || card.zone !== "attack" || !card.controllerPlayerId) continue;
    const controllerId = card.controllerPlayerId;
    if (controllerId === ownerPlayerId) {
      movePlayerCard(state, ownerPlayerId, card.instanceId, "discard");
      card.face = "down";
      card.active = false;
      card.residual = false;
      card.controllerPlayerId = ownerPlayerId;
      delete card.returnToOwnerDiscardOnClose;
    } else {
      closePlayerCard(state, controllerId, card.instanceId, definitions, { ignoreCloseDeferral: true });
    }
    returned.push(card.instanceId);
  }
  return returned;
}

export const useKoyanskayaNff: SkillHandler = ({ state, player, payload, definitions, randomInt, emitEvent }) => {
  if (!definitions) throw new Error("KOYANSKAYA_NFF_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (eventType === "player.entered-location") {
    const enteringPlayerId = typeof event.playerId === "string" ? event.playerId : undefined;
    const locationId = typeof event.locationId === "string" ? event.locationId : undefined;
    const enteringPlayer = enteringPlayerId ? state.players[enteringPlayerId] : undefined;
    if (!enteringPlayer || enteringPlayer.eliminated || !locationId) return;
    const candidates = cargoAtLocation(state, player.id, locationId);
    if (candidates.length === 0) return;
    const index = candidates.length === 1 ? 0 : (randomInt?.(candidates.length) ?? 0);
    if (!Number.isInteger(index) || index < 0 || index >= candidates.length) throw new Error("KOYANSKAYA_NFF_RANDOM_INVALID");
    const cargo = candidates[index];
    lendOwnedBoardCardToPlayerAttack(state, player.id, enteringPlayer.id, cargo.instanceId, definitions);
    emitEvent?.("card.entered-attack", { playerId: enteringPlayer.id, instanceId: cargo.instanceId, definitionId: cargo.definitionId, sourceId: KOYANSKAYA_NFF_ID, method: "cargo" });
    if (cargo.definitionId === NF56_CARD_ID) enteringPlayer.mana = Math.max(0, enteringPlayer.mana - 3);
    const defeat = cargo.definitionId === NF00_CARD_ID
      ? applyDefeatEffect(state, enteringPlayer.id, player.id, definitions, emitEvent, { sourceId: KOYANSKAYA_NFF_ID, instanceId: cargo.instanceId, method: "cargo" })
      : undefined;
    return { instanceId: cargo.instanceId, controllerPlayerId: enteringPlayer.id, ...(defeat ? { defeat } : {}) };
  }

  if (eventType === "combat.ending") {
    return { returnedInstanceIds: settleAcquiredCargo(state, player.id, definitions) };
  }

  if (state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("KOYANSKAYA_NFF_WINDOW_INVALID");
  const placements = Array.isArray(data.placements) ? data.placements : [];
  if (placements.length !== 2) throw new Error("KOYANSKAYA_NFF_PLACEMENTS_REQUIRED");
  const normalized = placements.map((placement) => {
    if (!isRecord(placement) || typeof placement.instanceId !== "string" || typeof placement.locationId !== "string") {
      throw new Error("KOYANSKAYA_NFF_PLACEMENT_INVALID");
    }
    return { instanceId: placement.instanceId, locationId: placement.locationId };
  });
  if (new Set(normalized.map((placement) => placement.instanceId)).size !== 2) throw new Error("KOYANSKAYA_NFF_PLACEMENT_INVALID");
  for (const placement of normalized) {
    if (placement.locationId !== "mountain" && placement.locationId !== "city") throw new Error("KOYANSKAYA_NFF_LOCATION_INVALID");
    const card = state.cards[placement.instanceId];
    if (!card || card.ownerPlayerId !== player.id || card.controllerPlayerId !== player.id || card.zone !== "hand" || !player.hand.includes(card.instanceId)) {
      throw new Error("KOYANSKAYA_NFF_CARD_INVALID");
    }
  }
  for (const placement of normalized) {
    placeOwnedCardOnBoard(state, player.id, placement.instanceId, placement.locationId, {
      allowedSourceZones: ["hand"], face: "down", active: false,
    });
    const card = state.cards[placement.instanceId];
    card.modifiers = [...new Set([...(card.modifiers ?? []), CARGO_MARKER])];
  }
  return { placements: normalized };
};

export const isKoyanskayaNffLegal: SkillLegalityPredicate = (state, playerId) => {
  const player = state.players[playerId];
  return Boolean(player && state.phase === "outpost" && state.activePlayerId === playerId && player.hand.length >= 2);
};

type GospelRewardRecord = { round: number; controllerPlayerId: string; locationId: string; keptPlayerIds: string[] };

function activeLinkedSource(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
  });
}

function gospelCargoControlledBy(state: GameState, ownerPlayerId: string, controllerPlayerId: string): CardInstance[] {
  return state.players[controllerPlayerId]?.attack.map((id) => state.cards[id]).filter((card): card is CardInstance =>
    Boolean(isCargo(card, ownerPlayerId) && card.controllerPlayerId === controllerPlayerId && card.zone === "attack" && card.active && card.face === "up")) ?? [];
}

function readGospelRewards(state: GameState): GospelRewardRecord[] {
  const raw = state.modeState.koyanskayaGospelRewards;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is GospelRewardRecord => isRecord(item)
    && Number(item.round) === state.round && typeof item.controllerPlayerId === "string" && typeof item.locationId === "string"
    && Array.isArray(item.keptPlayerIds)).map((item) => ({
      round: Number(item.round), controllerPlayerId: item.controllerPlayerId, locationId: item.locationId,
      keptPlayerIds: item.keptPlayerIds.filter((id): id is string => typeof id === "string"),
    }));
}

function setGospelReward(state: GameState, record: GospelRewardRecord): void {
  const current = readGospelRewards(state).filter((item) => item.controllerPlayerId !== record.controllerPlayerId);
  state.modeState.koyanskayaGospelRewards = [...current, record];
}

function clearGospelReward(state: GameState, playerId: string): void {
  const current = readGospelRewards(state).filter((item) => item.controllerPlayerId !== playerId);
  if (current.length) state.modeState.koyanskayaGospelRewards = current;
  else delete state.modeState.koyanskayaGospelRewards;
}

function continueGospelChoices(
  state: GameState,
  player: PlayerState,
  targetIds: string[],
  index: number,
  locationId: string,
  keptPlayerIds: string[],
  openDecision: SkillContext["openDecision"],
): { pending: boolean; keptPlayerIds?: string[] } {
  let cursor = index;
  while (cursor < targetIds.length) {
    const targetId = targetIds[cursor];
    const target = state.players[targetId];
    if (!target || target.eliminated || target.locationId !== locationId || gospelCargoControlledBy(state, player.id, targetId).length === 0) {
      cursor += 1;
      continue;
    }
    const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${KOYANSKAYA_GOSPEL_ID}:target:${cursor}`;
    state.effectQueue.unshift({
      effectId, handlerId: KOYANSKAYA_PACKAGE_RESOLVE, sourceId: KOYANSKAYA_GOSPEL_ID, controllerPlayerId: player.id,
      payload: { stage: "gospel-target", targetIds, index: cursor, locationId, keptPlayerIds, targetPlayerId: targetId }, createdAtRevision: state.revision,
    });
    openDecision({
      decisionId: `${effectId}:decision`, ownerPlayerId: targetId, chooserPlayerIds: [targetId], kind: "koyanskaya-gospel-cargo-choice",
      options: [{ id: "close", label: "Close Cargo cards" }, { id: "keep", label: "Keep Cargo cards" }],
      min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {},
    });
    return { pending: true };
  }
  setGospelReward(state, { round: state.round, controllerPlayerId: player.id, locationId, keptPlayerIds: [...new Set(keptPlayerIds)] });
  return { pending: false, keptPlayerIds: [...new Set(keptPlayerIds)] };
}

function gospelNormal(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, openDecision: SkillContext["openDecision"]) {
  const source = activeLinkedSource(state, player, KOYANSKAYA_GOSPEL_ID, definitions);
  const locationId = player.locationId;
  if (state.phase !== "combat" || state.activePlayerId !== player.id || source?.reversed === true || (locationId !== "mountain" && locationId !== "city")) {
    throw new Error("KOYANSKAYA_GOSPEL_NORMAL_WINDOW_INVALID");
  }
  const targetIds = state.turnOrder.filter((id) => id !== player.id && state.players[id]?.locationId === locationId
    && !state.players[id]?.eliminated && gospelCargoControlledBy(state, player.id, id).length > 0);
  if (!targetIds.length) throw new Error("KOYANSKAYA_GOSPEL_CARGO_REQUIRED");
  return continueGospelChoices(state, player, targetIds, 0, locationId, [], openDecision);
}

function gospelReverse(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, openDecision: SkillContext["openDecision"]) {
  const source = activeLinkedSource(state, player, KOYANSKAYA_GOSPEL_ID, definitions);
  const locationId = player.locationId;
  if (state.phase !== "combat" || state.activePlayerId !== player.id || source?.reversed !== true || (locationId !== "mountain" && locationId !== "city")) {
    throw new Error("KOYANSKAYA_GOSPEL_REVERSE_WINDOW_INVALID");
  }
  const candidates = (state.board.locations[locationId] ?? []).filter((id) => id !== player.id).flatMap((id) => gospelCargoControlledBy(state, player.id, id));
  if (!candidates.length) throw new Error("KOYANSKAYA_GOSPEL_CARGO_REQUIRED");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${KOYANSKAYA_GOSPEL_ID}:seize`;
  state.effectQueue.unshift({
    effectId, handlerId: KOYANSKAYA_PACKAGE_RESOLVE, sourceId: KOYANSKAYA_GOSPEL_ID, controllerPlayerId: player.id,
    payload: { stage: "gospel-seize", candidateInstanceIds: candidates.map((card) => card.instanceId), locationId }, createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "koyanskaya-gospel-seize-cargo",
    options: candidates.map((card) => ({ id: card.instanceId, label: definitions[card.definitionId]?.name ?? card.definitionId })),
    min: 1, max: candidates.length, allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
  return { pending: true, candidateInstanceIds: candidates.map((card) => card.instanceId) };
}

function legalNf56Destinations(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  if (!player.locationId) return [];
  return ["workshop", "mountain", "city", "scouting"].filter((locationId) => locationId !== player.locationId).filter((locationId) => {
    try {
      const draft = structuredClone(state) as GameState;
      movePlayerByEffect(draft, player.id, locationId, definitions);
      return true;
    } catch { return false; }
  });
}

function nf56ReverseMove(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, openDecision: SkillContext["openDecision"]) {
  const source = activeLinkedSource(state, player, KOYANSKAYA_NF56_ID, definitions);
  if (state.phase !== "combat" || state.activePlayerId !== player.id || source?.reversed !== true) throw new Error("KOYANSKAYA_NF56_REVERSE_REQUIRED");
  const destinations = legalNf56Destinations(state, player, definitions);
  if (!destinations.length) throw new Error("KOYANSKAYA_NF56_DESTINATION_REQUIRED");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${KOYANSKAYA_NF56_ID}:move`;
  state.effectQueue.unshift({
    effectId, handlerId: KOYANSKAYA_PACKAGE_RESOLVE, sourceId: KOYANSKAYA_NF56_ID, controllerPlayerId: player.id,
    payload: { stage: "nf56-move", destinations }, createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "koyanskaya-nf56-move",
    options: destinations.map((id) => ({ id, label: id })), min: 1, max: 1, allowCancel: false,
    continuationEffectId: effectId, submissions: {},
  });
  return { pending: true, destinations };
}

function resolveGospelCombat(state: GameState, player: PlayerState, event: Record<string, unknown>) {
  const record = readGospelRewards(state).find((item) => item.controllerPlayerId === player.id);
  if (!record || event.locationId !== record.locationId) return;
  const winners = new Set(Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : []);
  const rewardedWinnerIds = record.keptPlayerIds.filter((id) => winners.has(id));
  const victoryPointsGained = gainVictoryPoints(player, rewardedWinnerIds.length * 2);
  clearGospelReward(state, player.id);
  return { rewardedWinnerIds, victoryPointsGained };
}

function pendingCombatSnapshot(state: GameState): CombatPowerSnapshot | undefined {
  const pending = state.modeState.pendingCombatResolution as { snapshot?: CombatPowerSnapshot; responderIds?: string[]; nextResponderIndex?: number } | undefined;
  return pending?.snapshot;
}

export function isKoyanskayaNf00ResponseAvailable(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  snapshot: CombatPowerSnapshot,
): boolean {
  const player = state.players[playerId];
  if (!player || player.eliminated || !strictSecondPowerCondition(snapshot, playerId)) return false;
  const source = activeLinkedSource(state, player, KOYANSKAYA_NF00_ID, definitions);
  return Boolean(source?.reversed === true);
}

function resolveNf00Reverse(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  emitEvent: SkillContext["emitEvent"],
) {
  const pending = state.modeState.pendingCombatResolution as { snapshot?: CombatPowerSnapshot; responderIds?: string[]; nextResponderIndex?: number } | undefined;
  const snapshot = pending?.snapshot;
  const index = Number(pending?.nextResponderIndex ?? -1);
  if (!snapshot || state.phase !== "combat" || state.step !== "post-power-response" || state.activePlayerId !== player.id
    || pending?.responderIds?.[index] !== player.id || !isKoyanskayaNf00ResponseAvailable(state, player.id, definitions, snapshot)) {
    throw new Error("KOYANSKAYA_NF00_RESPONSE_INVALID");
  }
  return { defeatedPlayerIds: defeatStrictSecondHighestOpponents(state, snapshot, player.id, definitions, emitEvent, KOYANSKAYA_NF00_ID) };
}

export const useKoyanskayaPackage: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions) throw new Error("KOYANSKAYA_PACKAGE_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (skill.id === KOYANSKAYA_GOSPEL_ID) {
    if (eventType === "combat.resolved") return resolveGospelCombat(state, player, event);
    if (eventType === "combat.ending") { clearGospelReward(state, player.id); return; }
    if (data.abilityId === KOYANSKAYA_GOSPEL_NORMAL_ABILITY) return gospelNormal(state, player, definitions, openDecision);
    if (data.abilityId === KOYANSKAYA_GOSPEL_REVERSE_ABILITY) return gospelReverse(state, player, definitions, openDecision);
  }
  if (skill.id === KOYANSKAYA_NF56_ID && data.abilityId === KOYANSKAYA_NF56_MOVE_ABILITY) return nf56ReverseMove(state, player, definitions, openDecision);
  if (skill.id === KOYANSKAYA_NF00_ID && data.abilityId === KOYANSKAYA_NF00_REVERSE_ABILITY) return resolveNf00Reverse(state, player, definitions, emitEvent);
  throw new Error("KOYANSKAYA_PACKAGE_ABILITY_INVALID");
};

export const resolveKoyanskayaPackage: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("KOYANSKAYA_PACKAGE_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved") throw new Error("KOYANSKAYA_PACKAGE_DECISION_INVALID");
  if (previous.stage === "gospel-target") {
    const targetIds = Array.isArray(previous.targetIds) ? previous.targetIds.filter((id): id is string => typeof id === "string") : [];
    const index = Number(previous.index);
    const locationId = typeof previous.locationId === "string" ? previous.locationId : undefined;
    const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
    const keptPlayerIds = Array.isArray(previous.keptPlayerIds) ? previous.keptPlayerIds.filter((id): id is string => typeof id === "string") : [];
    if (!locationId || !targetPlayerId || !Number.isInteger(index) || selections.length !== 1 || !["close", "keep"].includes(selections[0])) {
      throw new Error("KOYANSKAYA_GOSPEL_DECISION_INVALID");
    }
    if (selections[0] === "close") {
      for (const card of gospelCargoControlledBy(state, player.id, targetPlayerId)) closePlayerCard(state, targetPlayerId, card.instanceId, definitions, { closedByPlayerId: targetPlayerId });
    } else keptPlayerIds.push(targetPlayerId);
    return continueGospelChoices(state, player, targetIds, index + 1, locationId, keptPlayerIds, openDecision);
  }
  if (previous.stage === "gospel-seize") {
    const candidates = Array.isArray(previous.candidateInstanceIds) ? previous.candidateInstanceIds.filter((id): id is string => typeof id === "string") : [];
    const locationId = typeof previous.locationId === "string" ? previous.locationId : undefined;
    if (!locationId || selections.length < 1 || new Set(selections).size !== selections.length || selections.some((id) => !candidates.includes(id))) {
      throw new Error("KOYANSKAYA_GOSPEL_SEIZE_INVALID");
    }
    for (const instanceId of selections) {
      const card = state.cards[instanceId];
      const oldControllerId = card?.controllerPlayerId;
      if (!card || !oldControllerId || oldControllerId === player.id || !gospelCargoControlledBy(state, player.id, oldControllerId).some((item) => item.instanceId === instanceId)) {
        throw new Error("KOYANSKAYA_GOSPEL_CARGO_INVALID");
      }
      state.players[oldControllerId].attack = state.players[oldControllerId].attack.filter((id) => id !== instanceId);
      player.attack = player.attack.filter((id) => id !== instanceId);
      player.attack.push(instanceId);
      card.controllerPlayerId = player.id;
      card.reversed = true;
      const marker = `reversed-until-close:${KOYANSKAYA_GOSPEL_ID}`;
      card.modifiers = [...(card.modifiers ?? []).filter((value) => value !== marker), marker];
    }
    return { seizedInstanceIds: selections };
  }
  if (previous.stage === "nf56-move") {
    const destinations = Array.isArray(previous.destinations) ? previous.destinations.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !destinations.includes(selections[0]) || !legalNf56Destinations(state, player, definitions).includes(selections[0])) {
      throw new Error("KOYANSKAYA_NF56_DESTINATION_INVALID");
    }
    const movement = movePlayerByEffect(state, player.id, selections[0], definitions);
    emitEvent?.("player.moved", { playerId: player.id, ...movement, sourceId: KOYANSKAYA_NF56_ID });
    emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect", sourceId: KOYANSKAYA_NF56_ID });
    return movement;
  }
  throw new Error("KOYANSKAYA_PACKAGE_DECISION_STAGE_INVALID");
};

export const isKoyanskayaPackageLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !ability || !definitions || state.phase !== "combat" || state.activePlayerId !== playerId) return false;
  if (skill.id === KOYANSKAYA_GOSPEL_ID) {
    const source = activeLinkedSource(state, player, skill.id, definitions);
    const locationId = player.locationId;
    if (!source || (locationId !== "mountain" && locationId !== "city")) return false;
    const cargo = (state.board.locations[locationId] ?? []).filter((id) => id !== player.id)
      .flatMap((id) => gospelCargoControlledBy(state, player.id, id));
    if (ability.id === KOYANSKAYA_GOSPEL_NORMAL_ABILITY) return source.reversed !== true && cargo.length > 0;
    if (ability.id === KOYANSKAYA_GOSPEL_REVERSE_ABILITY) return source.reversed === true && cargo.length > 0;
  }
  if (skill.id === KOYANSKAYA_NF56_ID && ability.id === KOYANSKAYA_NF56_MOVE_ABILITY) {
    const source = activeLinkedSource(state, player, skill.id, definitions);
    return Boolean(source?.reversed === true && legalNf56Destinations(state, player, definitions).length > 0);
  }
  if (skill.id === KOYANSKAYA_NF00_ID && ability.id === KOYANSKAYA_NF00_REVERSE_ABILITY) {
    const pending = state.modeState.pendingCombatResolution as { responderIds?: string[]; nextResponderIndex?: number } | undefined;
    const snapshot = pendingCombatSnapshot(state);
    const index = Number(pending?.nextResponderIndex ?? -1);
    return Boolean(snapshot && state.step === "post-power-response" && pending?.responderIds?.[index] === playerId
      && isKoyanskayaNf00ResponseAvailable(state, playerId, definitions, snapshot));
  }
  return false;
};

export function getKoyanskayaCardDefinitions(): Record<string, CardDefinition> {
  return {
    [KOYANSKAYA_NF14_TOKEN_ID]: {
      id: KOYANSKAYA_NF14_TOKEN_ID,
      version: 1,
      name: "NF-14 Suppressive Fire",
      cardType: "attack",
      ownerType: "common",
      cost: 0,
      basePower: 2,
      typeLabel: "迅捷",
      attributes: ["迅捷"],
      basic: false,
      isSkill: false,
      residual: false,
      tags: ["effect-created", "temporary"],
      implementation: { level: "FULL" },
    },
  };
}

export function registerKoyanskayaCardAbilities(registry: CardAbilityRegistry): void {
  if (registry.has(KOYANSKAYA_NF14_ABILITY)) return;
  registry.register(KOYANSKAYA_NF14_ABILITY, ({ state, playerId, instanceId }) => {
    const source = state.cards[instanceId];
    if (state.phase !== "combat") throw new Error("KOYANSKAYA_NF14_WINDOW_INVALID");
    if (!source || source.controllerPlayerId !== playerId || source.zone !== "attack" || !source.active || source.face !== "up" || source.reversed !== true) {
      throw new Error("KOYANSKAYA_NF14_REVERSE_REQUIRED");
    }
    for (let index = 0; index < 3; index += 1) {
      let instanceIdCandidate = `${state.gameInstanceId}:${state.revision}:${playerId}:nf14-token:${index}`;
      let suffix = 0;
      while (state.cards[instanceIdCandidate]) instanceIdCandidate = `${state.gameInstanceId}:${state.revision}:${playerId}:nf14-token:${index}:${++suffix}`;
      const created = createDerivedCardInstance(state, playerId, {
        instanceId: instanceIdCandidate,
        definitionId: KOYANSKAYA_NF14_TOKEN_ID,
        zone: "attack",
        face: "up",
        active: true,
        residual: false,
        temporary: true,
        temporaryCleanup: "round-end",
        sourceEffectId: KOYANSKAYA_NF14_ABILITY,
        createdByPlayerId: playerId,
      });
      created.joinedAttackRound = state.round;
    }
  }, { abilityLimit: "once-per-round" });
}
