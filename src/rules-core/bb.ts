import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { movePlayerOneSpaceByEffect, isPlayerBoardExitBlockedByEffect } from "./board.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";
import { movePlayerCard } from "./decks.ts";
import {
  clearMoonCellLocationMerge,
  getMoonCellState,
  isPlayerInMoonCell,
  mergeMoonCellWithBattlefield,
  movePlayerIntoMoonCell,
  movePlayerOutOfMoonCell,
} from "./moon-cell.ts";
import { gainMana, gainVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const BB_HANDLER = "core.bb-moon-cell";
export const BB_RESOLVE = "core.bb-moon-cell-resolve";
export const BB_PRIVILEGE_ID = "servant.bb.skill.sc-bb-1";
export const BB_SLOT_ID = "servant.bb.skill.sc-bb-2";
export const BB_CCC_ID = "servant.bb.skill.sc-bb-3";
export const BB_MOON_CANCER_ID = "servant.bb.skill.sc-bb-4";

export const BB_PRIVILEGE_ABILITY = "privilege-access";
export const BB_SLOT_ABILITY = "bb-slot-machine";

type RewardKind = "strength" | "agility" | "magic";
type SlotReward = { playerId: string; instanceId: string; choices: RewardKind[] };
type RewardCounts = Record<RewardKind, number>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesSkill(card: GameState["cards"][string] | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(card, definition, skillId));
  });
}

function openFrame(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  stage: string,
  payload: Record<string, unknown>,
  options: PendingDecision["options"],
  min: number,
  max: number,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: BB_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `bb-${stage}`,
    options,
    min,
    max,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function syncCccMoonCellPower(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  const onlyMoonCell = isPlayerInMoonCell(state, player.id) && player.locationId === null;
  for (const instanceId of player.attack) {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !card.active || card.face !== "up" || !matchesSkill(card, definition, BB_CCC_ID)) continue;
    const modifierId = `${BB_CCC_ID}:moon-cell-only:${state.round}:${card.instanceId}`;
    card.powerModifiers = [
      ...(card.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
      ...(onlyMoonCell ? [{ id: modifierId, sourceId: BB_CCC_ID, kind: "add" as const, value: 5, duration: "round" as const }] : []),
    ];
  }
}

function moonCellUnengaged(state: GameState, playerId: string): boolean {
  const occupants = getMoonCellState(state).playerIds.filter((id) => id !== playerId && !state.players[id]?.eliminated);
  return occupants.length === 0;
}

function payPrivilegeCost(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  payManaCost(state, player, 3, definitions, "BB_PRIVILEGE_MANA_REQUIRED");
  player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + 3;
}

function usePrivilege(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
  payload: Record<string, unknown>,
) {
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("BB_PRIVILEGE_WINDOW_INVALID");
  if (isPlayerInMoonCell(state, player.id)) {
    if (!moonCellUnengaged(state, player.id)) throw new Error("BB_PRIVILEGE_MOON_CELL_ENGAGED");
    const direct = payload.targetLocationId;
    if (direct === "mountain" || direct === "city") {
      payPrivilegeCost(state, player, definitions);
      const result = movePlayerOutOfMoonCell(state, player.id, direct);
      syncCccMoonCellPower(state, player, definitions);
      return { direction: "exit", locationId: direct, ...result };
    }
    payPrivilegeCost(state, player, definitions);
    openFrame(state, player, BB_PRIVILEGE_ID, "privilege-exit", {}, [
      { id: "mountain", label: "Mountain" },
      { id: "city", label: "City" },
    ], 1, 1, openDecision);
    return { pending: true, direction: "exit" };
  }
  if (!player.locationId || isPlayerBoardExitBlockedByEffect(state, player.id, definitions)) throw new Error("BB_PRIVILEGE_ENTER_BLOCKED");
  payPrivilegeCost(state, player, definitions);
  const result = movePlayerIntoMoonCell(state, player.id, BB_PRIVILEGE_ID);
  syncCccMoonCellPower(state, player, definitions);
  return { direction: "enter", ...result };
}

function slotTargetIds(state: GameState): string[] {
  const living = new Set(Object.values(state.players).filter((candidate) => !candidate.eliminated && candidate.hand.length > 0).map((candidate) => candidate.id));
  return [...state.turnOrder.filter((id) => living.has(id)), ...[...living].filter((id) => !state.turnOrder.includes(id))];
}

function rewardChoicesForCard(state: GameState, instanceId: string, definitions: Record<string, CardDefinition>): RewardKind[] {
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !definition) return [];
  const attributes = new Set(getCardInstanceAttributes(card, definition, state, definitions));
  if (attributes.has("特殊")) return ["strength", "agility", "magic"];
  const result: RewardKind[] = [];
  if (attributes.has("力量")) result.push("strength");
  if (attributes.has("迅捷")) result.push("agility");
  if (attributes.has("魔术")) result.push("magic");
  return result;
}

function discardRandomHandCard(
  state: GameState,
  target: PlayerState,
  randomInt: SkillContext["randomInt"],
): string | undefined {
  if (target.hand.length === 0) return undefined;
  const index = randomInt ? randomInt(target.hand.length) : 0;
  if (!Number.isInteger(index) || index < 0 || index >= target.hand.length) throw new Error("BB_SLOT_RANDOM_INDEX_INVALID");
  const instanceId = target.hand[index];
  movePlayerCard(state, target.id, instanceId, "discard");
  return instanceId;
}

function canMoveForward(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  if (!player.locationId) return false;
  const draft = structuredClone(state) as GameState;
  try {
    movePlayerOneSpaceByEffect(draft, player.id, "forward", definitions);
    return true;
  } catch {
    return false;
  }
}

function normalizeRewards(value: unknown): SlotReward[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SlotReward => isRecord(item)
    && typeof item.playerId === "string" && typeof item.instanceId === "string" && Array.isArray(item.choices))
    .map((item) => ({
      playerId: item.playerId,
      instanceId: item.instanceId,
      choices: item.choices.filter((choice): choice is RewardKind => choice === "strength" || choice === "agility" || choice === "magic"),
    }));
}

function normalizeCounts(value: unknown): RewardCounts {
  const raw = isRecord(value) ? value : {};
  return {
    strength: Math.max(0, Number(raw.strength ?? 0)),
    agility: Math.max(0, Number(raw.agility ?? 0)),
    magic: Math.max(0, Number(raw.magic ?? 0)),
  };
}

function finishSlot(player: PlayerState, counts: RewardCounts) {
  const triple = (Object.entries(counts) as Array<[RewardKind, number]>).find(([, count]) => count >= 3)?.[0];
  const victoryPointsGained = triple ? gainVictoryPoints(player, 3) : 0;
  return { rewardCounts: counts, tripleReward: triple ?? null, victoryPointsGained };
}

function continueSlotRewards(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  rewards: SlotReward[],
  counts: RewardCounts,
  openDecision: SkillContext["openDecision"],
): unknown {
  if (rewards.length === 0) return finishSlot(player, counts);
  const [current, ...rest] = rewards;
  if (current.choices.length === 0) return continueSlotRewards(state, player, definitions, rest, counts, openDecision);
  if (current.choices.length > 1) {
    openFrame(state, player, BB_SLOT_ID, "slot-reward-choice", { current, rest, counts }, current.choices.map((choice) => ({
      id: choice,
      label: choice === "strength" ? "Power +2" : choice === "agility" ? "Move up to 1" : "Mana +1",
    })), 1, 1, openDecision);
    return { pending: true, stage: "reward-choice" };
  }
  return applySlotReward(state, player, definitions, current.choices[0], rest, counts, openDecision);
}

function applySlotReward(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  reward: RewardKind,
  rest: SlotReward[],
  counts: RewardCounts,
  openDecision: SkillContext["openDecision"],
): unknown {
  const nextCounts = { ...counts, [reward]: counts[reward] + 1 };
  if (reward === "strength") {
    player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 2;
    return continueSlotRewards(state, player, definitions, rest, nextCounts, openDecision);
  }
  if (reward === "magic") {
    gainMana(player, 1);
    return continueSlotRewards(state, player, definitions, rest, nextCounts, openDecision);
  }
  if (!canMoveForward(state, player, definitions)) return continueSlotRewards(state, player, definitions, rest, nextCounts, openDecision);
  openFrame(state, player, BB_SLOT_ID, "slot-agility-move", { rest, counts: nextCounts }, [
    { id: "move", label: "Move one location along the arrow" },
    { id: "stay", label: "Stay" },
  ], 1, 1, openDecision);
  return { pending: true, stage: "agility-move" };
}

function useSlotMachine(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
) {
  if (state.phase !== "action" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, BB_SLOT_ID, definitions)) {
    throw new Error("BB_SLOT_WINDOW_INVALID");
  }
  const candidates = slotTargetIds(state);
  if (candidates.length === 0) throw new Error("BB_SLOT_TARGET_REQUIRED");
  openFrame(state, player, BB_SLOT_ID, "slot-targets", { candidates }, candidates.map((id) => ({ id, label: state.players[id].name })),
    1, Math.min(3, candidates.length), openDecision);
  return { pending: true, candidates };
}

function handleCccEvent(state: GameState, player: PlayerState, payload: Record<string, unknown>, definitions: Record<string, CardDefinition>) {
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType === "round.ending") {
    const restoredPlayerIds = clearMoonCellLocationMerge(state, BB_CCC_ID);
    syncCccMoonCellPower(state, player, definitions);
    return { restoredPlayerIds };
  }
  if (eventType !== "card.played" || event.playerId !== player.id || typeof event.instanceId !== "string") return;
  const source = state.cards[event.instanceId];
  const definition = source ? definitions[source.definitionId] : undefined;
  if (!source || !matchesSkill(source, definition, BB_CCC_ID)) return;
  if (player.locationId === "mountain" || player.locationId === "city") {
    mergeMoonCellWithBattlefield(state, player.locationId, BB_CCC_ID);
  }
  syncCccMoonCellPower(state, player, definitions);
  return { mergedLocationId: player.locationId, moonCellOnly: isPlayerInMoonCell(state, player.id) && player.locationId === null };
}

export const useBb: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("BB_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (skill.id === BB_PRIVILEGE_ID && data.abilityId === BB_PRIVILEGE_ABILITY) return usePrivilege(state, player, definitions, openDecision, data);
  if (skill.id === BB_SLOT_ID && data.abilityId === BB_SLOT_ABILITY) return useSlotMachine(state, player, definitions, openDecision);
  if (skill.id === BB_CCC_ID) return handleCccEvent(state, player, data, definitions);
  throw new Error("BB_SKILL_INVALID");
};

export const resolveBbDecision: SkillHandler = ({ state, player, payload, definitions, openDecision, randomInt }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("BB_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved") throw new Error("BB_DECISION_INVALID");
  const stage = previous.stage;

  if (stage === "privilege-exit") {
    if (selections.length !== 1 || (selections[0] !== "mountain" && selections[0] !== "city") || !isPlayerInMoonCell(state, player.id)) {
      throw new Error("BB_PRIVILEGE_EXIT_SELECTION_INVALID");
    }
    const locationId = selections[0] as "mountain" | "city";
    const result = movePlayerOutOfMoonCell(state, player.id, locationId);
    syncCccMoonCellPower(state, player, definitions);
    return { direction: "exit", locationId, ...result };
  }

  if (stage === "slot-targets") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length < 1 || selections.length > 3 || new Set(selections).size !== selections.length
      || selections.some((id) => !candidates.includes(id) || !state.players[id] || state.players[id].eliminated || state.players[id].hand.length === 0)) {
      throw new Error("BB_SLOT_TARGET_SELECTION_INVALID");
    }
    const rewards: SlotReward[] = [];
    const discarded: Array<{ playerId: string; instanceId: string }> = [];
    for (const targetId of selections) {
      const instanceId = discardRandomHandCard(state, state.players[targetId], randomInt);
      if (!instanceId) continue;
      discarded.push({ playerId: targetId, instanceId });
      rewards.push({ playerId: targetId, instanceId, choices: rewardChoicesForCard(state, instanceId, definitions) });
    }
    const result = continueSlotRewards(state, player, definitions, rewards, { strength: 0, agility: 0, magic: 0 }, openDecision);
    return { discarded, result };
  }

  if (stage === "slot-reward-choice") {
    if (selections.length !== 1) throw new Error("BB_SLOT_REWARD_SELECTION_INVALID");
    const current = isRecord(previous.current) ? previous.current : {};
    const choices = Array.isArray(current.choices) ? current.choices.filter((choice): choice is RewardKind => choice === "strength" || choice === "agility" || choice === "magic") : [];
    const selected = selections[0] as RewardKind;
    if (!choices.includes(selected)) throw new Error("BB_SLOT_REWARD_SELECTION_INVALID");
    const rest = normalizeRewards(previous.rest);
    const counts = normalizeCounts(previous.counts);
    return applySlotReward(state, player, definitions, selected, rest, counts, openDecision);
  }

  if (stage === "slot-agility-move") {
    if (selections.length !== 1 || (selections[0] !== "move" && selections[0] !== "stay")) throw new Error("BB_SLOT_AGILITY_SELECTION_INVALID");
    if (selections[0] === "move") movePlayerOneSpaceByEffect(state, player.id, "forward", definitions);
    return continueSlotRewards(state, player, definitions, normalizeRewards(previous.rest), normalizeCounts(previous.counts), openDecision);
  }

  throw new Error("BB_DECISION_STAGE_INVALID");
};

export const isBbLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || player.eliminated || !definitions || state.phase !== "action" || state.activePlayerId !== playerId || !ability) return false;
  if (skill.id === BB_PRIVILEGE_ID && ability.id === BB_PRIVILEGE_ABILITY) {
    if (isPlayerInMoonCell(state, playerId)) return moonCellUnengaged(state, playerId);
    return Boolean(player.locationId && !isPlayerBoardExitBlockedByEffect(state, playerId, definitions));
  }
  if (skill.id === BB_SLOT_ID && ability.id === BB_SLOT_ABILITY) {
    return Boolean(activeOwnedSkill(state, player, BB_SLOT_ID, definitions) && slotTargetIds(state).length > 0);
  }
  return false;
};
