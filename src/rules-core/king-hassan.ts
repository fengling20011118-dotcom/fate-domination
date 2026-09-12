import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { movePlayerCard } from "./decks.ts";
import { killPlayerServantPackage, listUnusedRandomServantIds, replacePlayerServantPackage } from "./identity-replacement.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const KING_HASSAN_BELL_LIGHT_ID = "servant.kinghassan.skill.sc-kinghassan-1";
export const KING_HASSAN_CUT_FATE_ID = "servant.kinghassan.skill.sc-kinghassan-2";
export const KING_HASSAN_BELL_HEAVY_ID = "servant.kinghassan.skill.sc-kinghassan-3";
export const KING_HASSAN_HANDLER = "core.king-hassan-azrael";
export const KING_HASSAN_BELL_RESOLVE = "core.king-hassan-bell-resolve";
export const KING_HASSAN_BELL_ABILITY = "final-bell-toll";
export const KING_HASSAN_CUT_FATE_ABILITY = "cut-from-fate";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesSkill(card: GameState["cards"][string] | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
}

function activeSource(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(card, definition, skillId));
  });
}

function sameFightOpponentIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated);
}

function handLuckIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.id === "card.cardluck");
  });
}

function rollD6(randomInt: ((maxExclusive: number) => number) | undefined): number {
  const roll = (randomInt ?? (() => 0))(6);
  if (!Number.isInteger(roll) || roll < 0 || roll >= 6) throw new Error("KING_HASSAN_DIE_INVALID");
  return roll + 1;
}

function applyBellDefeats(
  state: GameState,
  controllerPlayerId: string,
  sourceId: string,
  rolls: Record<string, number>,
  threshold: number,
  definitions: Record<string, CardDefinition>,
  emitEvent?: (type: string, payload: unknown) => void,
): { rolls: Record<string, number>; defeatedPlayerIds: string[] } {
  const defeatedPlayerIds: string[] = [];
  for (const [targetPlayerId, roll] of Object.entries(rolls)) {
    if (roll < threshold) continue;
    const result = applyDefeatEffect(state, targetPlayerId, controllerPlayerId, definitions, emitEvent, { sourceId, method: "final-bell-toll", dieRoll: roll });
    if (result.defeated) defeatedPlayerIds.push(targetPlayerId);
  }
  return { rolls: { ...rolls }, defeatedPlayerIds };
}

function openBellRerollDecision(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  sourceInstanceId: string,
  rolls: Record<string, number>,
  threshold: number,
  luckInstanceIds: string[],
  openDecision: (decision: PendingDecision) => void,
): void {
  const targetPlayerIds = Object.keys(rolls);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:bell-reroll`;
  state.effectQueue.unshift({
    effectId,
    handlerId: KING_HASSAN_BELL_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { sourceId, sourceInstanceId, rolls, threshold, targetPlayerIds, luckInstanceIds },
    createdAtRevision: state.revision,
  });
  const options: PendingDecision["options"] = [{ id: "skip", label: "不重骰" }];
  for (let targetIndex = 0; targetIndex < targetPlayerIds.length; targetIndex += 1) {
    for (let luckIndex = 0; luckIndex < luckInstanceIds.length; luckIndex += 1) {
      const targetId = targetPlayerIds[targetIndex];
      options.push({ id: `reroll:${targetIndex}:${luckIndex}`, label: `令 ${targetId} 重骰` });
    }
  }
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "king-hassan-bell-reroll",
    options, min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
}

export const resolveKingHassanBell: SkillHandler = ({ state, player, payload, definitions, randomInt, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("KING_HASSAN_BELL_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1 || !isRecord(previous.rolls)) throw new Error("KING_HASSAN_BELL_DECISION_INVALID");
  const sourceId = typeof previous.sourceId === "string" ? previous.sourceId : typeof payload.sourceId === "string" ? payload.sourceId : undefined;
  const threshold = Number(previous.threshold);
  const targetPlayerIds = Array.isArray(previous.targetPlayerIds) ? previous.targetPlayerIds.filter((id): id is string => typeof id === "string") : [];
  const luckInstanceIds = Array.isArray(previous.luckInstanceIds) ? previous.luckInstanceIds.filter((id): id is string => typeof id === "string") : [];
  if (!sourceId || !Number.isInteger(threshold) || threshold < 1 || threshold > 6) throw new Error("KING_HASSAN_BELL_DECISION_INVALID");
  const rolls = Object.fromEntries(Object.entries(previous.rolls).filter((entry): entry is [string, number] => typeof entry[0] === "string" && Number.isInteger(entry[1])));
  const selection = selections[0];
  if (selection !== "skip") {
    const match = /^reroll:(\d+):(\d+)$/.exec(selection);
    if (!match) throw new Error("KING_HASSAN_BELL_REROLL_INVALID");
    const targetPlayerId = targetPlayerIds[Number(match[1])];
    const luckInstanceId = luckInstanceIds[Number(match[2])];
    const luck = luckInstanceId ? state.cards[luckInstanceId] : undefined;
    const luckDefinition = luck ? definitions[luck.definitionId] : undefined;
    if (!targetPlayerId || !luck || !player.hand.includes(luckInstanceId) || luckDefinition?.id !== "card.cardluck") {
      throw new Error("KING_HASSAN_BELL_REROLL_INVALID");
    }
    movePlayerCard(state, player.id, luckInstanceId, "discard");
    luck.face = "up";
    luck.active = false;
    luck.residual = false;
    rolls[targetPlayerId] = rollD6(randomInt);
  }
  return applyBellDefeats(state, player.id, sourceId, rolls, threshold, definitions, emitEvent);
};

function useBell(context: Parameters<SkillHandler>[0], threshold: number): unknown {
  const { state, player, skill, definitions, randomInt, openDecision, emitEvent } = context;
  if (!definitions || state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("KING_HASSAN_BELL_WINDOW_INVALID");
  const source = activeSource(state, player, skill.id, definitions);
  if (!source) throw new Error("KING_HASSAN_BELL_SOURCE_INACTIVE");
  const targetPlayerIds = sameFightOpponentIds(state, player);
  if (targetPlayerIds.length === 0) throw new Error("KING_HASSAN_BELL_NO_OPPONENT");
  const rolls = Object.fromEntries(targetPlayerIds.map((targetId) => [targetId, rollD6(randomInt)]));
  const luckInstanceIds = handLuckIds(state, player, definitions);
  if (luckInstanceIds.length === 0) return applyBellDefeats(state, player.id, skill.id, rolls, threshold, definitions, emitEvent);
  openBellRerollDecision(state, player, skill.id, source.instanceId, rolls, threshold, luckInstanceIds, openDecision);
  return { pending: true, rolls };
}

function addHeavyBellPowerRule(state: GameState, player: PlayerState, sourceInstanceId: string): void {
  const id = `${KING_HASSAN_BELL_HEAVY_ID}:defeated-opponents:${sourceInstanceId}`;
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
  player.cardRuleModifiers.push({
    id, sourceId: KING_HASSAN_BELL_HEAVY_ID,
    targetDefinitionIds: [KING_HASSAN_BELL_HEAVY_ID, `card.skill.${KING_HASSAN_BELL_HEAVY_ID}`],
    targetInstanceIds: [sourceInstanceId],
    powerAddPerDefeatedOrEliminatedOpponent: 1,
    duration: "while-source-active", sourceInstanceId,
  });
}

function pendingKilledTargets(state: GameState): Array<{ controllerPlayerId: string; targetPlayerId: string; round: number }> {
  const raw = state.modeState.kingHassanKilledServantPending;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is { controllerPlayerId: string; targetPlayerId: string; round: number } => isRecord(value)
    && typeof value.controllerPlayerId === "string" && typeof value.targetPlayerId === "string" && Number.isInteger(value.round));
}

function writePendingKilledTargets(state: GameState, values: Array<{ controllerPlayerId: string; targetPlayerId: string; round: number }>): void {
  state.modeState.kingHassanKilledServantPending = values.map((value) => ({ ...value }));
}

function cutFromFate(context: Parameters<SkillHandler>[0], targetPlayerId: string): unknown {
  const { state, player, skill, definitions, runtimeCatalog, emitEvent } = context;
  if (!definitions || !runtimeCatalog || state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("KING_HASSAN_CUT_FATE_CONTEXT_REQUIRED");
  if (!activeSource(state, player, skill.id, definitions)) throw new Error("KING_HASSAN_CUT_FATE_SOURCE_INACTIVE");
  if (!sameFightOpponentIds(state, player).includes(targetPlayerId)) throw new Error("KING_HASSAN_CUT_FATE_TARGET_INVALID");
  const killed = killPlayerServantPackage(state, targetPlayerId, runtimeCatalog, emitEvent);
  const defeated = applyDefeatEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: skill.id, method: "cut-from-fate", killedServantId: killed.servantId });
  const existing = pendingKilledTargets(state).filter((entry) => !(entry.controllerPlayerId === player.id && entry.targetPlayerId === targetPlayerId));
  writePendingKilledTargets(state, [...existing, { controllerPlayerId: player.id, targetPlayerId, round: state.round }]);
  return { targetPlayerId, ...killed, defeat: defeated };
}

function replaceKilledServants(context: Parameters<SkillHandler>[0], round: number): unknown {
  const { state, player, runtimeCatalog, randomInt, emitEvent } = context;
  if (!runtimeCatalog) throw new Error("KING_HASSAN_REPLACEMENT_CATALOG_REQUIRED");
  const pending = pendingKilledTargets(state);
  const mine = pending.filter((entry) => entry.controllerPlayerId === player.id && entry.round === round);
  const kept = pending.filter((entry) => !(entry.controllerPlayerId === player.id && entry.round === round));
  const replaced: Array<{ targetPlayerId: string; servantId: string }> = [];
  for (const entry of mine) {
    const target = state.players[entry.targetPlayerId];
    if (!target || target.eliminated || target.flags.servantKilled !== true) continue;
    const candidates = listUnusedRandomServantIds(state, runtimeCatalog);
    if (candidates.length === 0) throw new Error("KING_HASSAN_REPLACEMENT_NO_SERVANT");
    const index = (randomInt ?? (() => 0))(candidates.length);
    if (!Number.isInteger(index) || index < 0 || index >= candidates.length) throw new Error("KING_HASSAN_REPLACEMENT_RANDOM_INVALID");
    const servantId = candidates[index];
    replacePlayerServantPackage(state, target.id, servantId, runtimeCatalog, randomInt ?? (() => 0), emitEvent);
    replaced.push({ targetPlayerId: target.id, servantId });
  }
  writePendingKilledTargets(state, kept);
  return { replaced };
}

export const useKingHassan: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions } = context;
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "card.played" && skill.id === KING_HASSAN_BELL_HEAVY_ID && definitions) {
    const instanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
    const card = instanceId ? state.cards[instanceId] : undefined;
    const definition = card ? definitions[card.definitionId] : undefined;
    if (card && event.playerId === player.id && matchesSkill(card, definition, skill.id)) addHeavyBellPowerRule(state, player, instanceId!);
    return;
  }
  if (eventType === "round.ending" && skill.id === KING_HASSAN_CUT_FATE_ID) return replaceKilledServants(context, Number(event.round));
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
  if (abilityId === KING_HASSAN_BELL_ABILITY && skill.id === KING_HASSAN_BELL_LIGHT_ID) return useBell(context, 6);
  if (abilityId === KING_HASSAN_BELL_ABILITY && skill.id === KING_HASSAN_BELL_HEAVY_ID) return useBell(context, 5);
  if (abilityId === KING_HASSAN_CUT_FATE_ABILITY && skill.id === KING_HASSAN_CUT_FATE_ID) {
    const targetPlayerId = typeof data.targetPlayerId === "string" ? data.targetPlayerId : undefined;
    if (!targetPlayerId) throw new Error("KING_HASSAN_CUT_FATE_TARGET_REQUIRED");
    return cutFromFate(context, targetPlayerId);
  }
};

export const isKingHassanLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.phase !== "combat" || state.activePlayerId !== playerId || sameFightOpponentIds(state, player).length === 0) return false;
  if (!activeSource(state, player, skill.id, definitions)) return false;
  if (skill.id === KING_HASSAN_CUT_FATE_ID) return ability?.id === KING_HASSAN_CUT_FATE_ABILITY;
  return ability?.id === KING_HASSAN_BELL_ABILITY;
};
