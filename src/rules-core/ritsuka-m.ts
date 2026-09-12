import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardPlayCost, payManaCost } from "./costs.ts";
import { movePlayerCard } from "./decks.ts";
import { blockManaGainThroughRound, gainMana, gainVictoryPoints, adjustVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const RITSUKA_M_GACHA_ID = "master.ritsuka-m.skill.s1";
export const RITSUKA_M_ESSENCE_ID = "master.ritsuka-m.skill.s2";
export const RITSUKA_M_ASCENSION_ID = "master.ritsuka-m.skill.ascension";
export const RITSUKA_M_HANDLER = "core.ritsuka-m-craft-essence";
export const RITSUKA_M_RESOLVE = "core.ritsuka-m-craft-essence-resolve";
export const RITSUKA_M_GACHA_ABILITY = "gacha-slave";
export const RITSUKA_M_DECEPTION_ABILITY = "craft-essence-deception";

export const RITSUKA_M_CRAFT_ESSENCES = [
  "destruction",
  "concentration",
  "technique",
  "mapo-tofu",
  "deception",
  "tenacity",
  "barrier",
  "ley-line",
  "opportunity",
  "flash",
  "preemption",
  "linkage",
  "meditation",
  "gloom",
  "combat",
] as const;
export type RitsukaMCraftEssenceId = typeof RITSUKA_M_CRAFT_ESSENCES[number];

const CE_LABELS: Readonly<Record<RitsukaMCraftEssenceId, string>> = Object.freeze({
  destruction: "Destruction",
  concentration: "Concentration",
  technique: "Technique",
  "mapo-tofu": "Mapo Tofu",
  deception: "Deception",
  tenacity: "Tenacity",
  barrier: "Barrier",
  "ley-line": "Ley Line",
  opportunity: "Opportunity",
  flash: "Flash",
  preemption: "Preemption",
  linkage: "Linkage",
  meditation: "Meditation",
  gloom: "Gloom",
  combat: "Combat",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCraftEssenceId(value: unknown): value is RitsukaMCraftEssenceId {
  return typeof value === "string" && (RITSUKA_M_CRAFT_ESSENCES as readonly string[]).includes(value);
}

function availablePool(player: PlayerState): RitsukaMCraftEssenceId[] {
  const raw = player.flags.ritsukaMCraftEssencePool;
  return Array.isArray(raw) ? raw.filter(isCraftEssenceId) : [];
}

function setAvailablePool(player: PlayerState, ids: readonly RitsukaMCraftEssenceId[]): void {
  player.flags.ritsukaMCraftEssencePool = [...ids];
}

function shuffled<T>(items: readonly T[], randomInt: (maxExclusive: number) => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const selected = randomInt(index + 1);
    if (!Number.isInteger(selected) || selected < 0 || selected > index) throw new Error("RITSUKA_M_RANDOM_INVALID");
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}

function openDecisionFrame(
  context: Parameters<SkillHandler>[0],
  stage: string,
  options: PendingDecision["options"],
  payload: Record<string, unknown> = {},
  min = 1,
  max = 1,
): { pending: true; stage: string } {
  const { state, player, skill, openDecision } = context;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:${stage}:${state.effectQueue.length}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: RITSUKA_M_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `ritsuka-m-${stage}`,
    options,
    min,
    max,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, stage };
}

function installRoundModifier(
  state: GameState,
  player: PlayerState,
  essenceId: RitsukaMCraftEssenceId,
  rule: string,
  operation: "add" | "subtract" | "multiply" | "set" | "forbid" | "allow",
  value: unknown,
  scope: Record<string, unknown> = { subject: "controller" },
): void {
  state.activeRuleModifiers ??= [];
  const sequence = state.activeRuleModifiers.length;
  state.activeRuleModifiers.push({
    id: `${RITSUKA_M_ESSENCE_ID}:${essenceId}:${rule}:${state.round}:${state.revision}:${sequence}`,
    sourceId: RITSUKA_M_ESSENCE_ID,
    controllerPlayerId: player.id,
    operation,
    rule,
    scope,
    value,
    duration: "round",
    createdRound: state.round,
  });
}

function installAttributePowerPair(state: GameState, player: PlayerState, essenceId: RitsukaMCraftEssenceId, attribute: string): void {
  installRoundModifier(state, player, essenceId, "card_power", "add", 2, { subject: "controller", cards: { attack: true, attributesAny: [attribute] } });
  installRoundModifier(state, player, essenceId, "card_power", "subtract", 1, { subject: "controller", cards: { attack: true, attributesNone: [attribute] } });
}

function ascensionInstance(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => {
    if (card.ownerPlayerId !== player.id || card.zone === "removed") return false;
    const definition = definitions[card.definitionId];
    return card.definitionId === RITSUKA_M_ASCENSION_ID || card.definitionId === `card.skill.${RITSUKA_M_ASCENSION_ID}` || definition?.linkedSkillId === RITSUKA_M_ASCENSION_ID;
  });
}

function multiplyAscensionForMapo(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  const count = Number(player.flags.ritsukaMMapoTofuCount ?? 0) + 1;
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("RITSUKA_M_MAPO_COUNT_INVALID");
  player.flags.ritsukaMMapoTofuCount = count;
  const ascension = ascensionInstance(state, player, definitions);
  if (!ascension) return;
  const current = Number(ascension.basePowerMultiplier ?? 1);
  if (!Number.isInteger(current) || current < 1) throw new Error("CARD_BASE_POWER_MULTIPLIER_INVALID");
  ascension.basePowerMultiplier = current * 2;
}

function recordActiveEssence(player: PlayerState, state: GameState, essenceId: RitsukaMCraftEssenceId): void {
  if (Number(player.flags.ritsukaMActiveCraftEssenceRound ?? -1) !== state.round) {
    player.flags.ritsukaMActiveCraftEssenceRound = state.round;
    player.flags.ritsukaMActiveCraftEssences = [];
  }
  const current = Array.isArray(player.flags.ritsukaMActiveCraftEssences)
    ? player.flags.ritsukaMActiveCraftEssences.filter(isCraftEssenceId)
    : [];
  player.flags.ritsukaMActiveCraftEssences = [...current, essenceId];
}

function applyCraftEssence(
  context: Parameters<SkillHandler>[0],
  essenceId: RitsukaMCraftEssenceId,
): { essenceId: RitsukaMCraftEssenceId; meditationRemovalRequired?: boolean } {
  const { state, player, definitions } = context;
  if (!definitions) throw new Error("RITSUKA_M_DEFINITIONS_REQUIRED");
  recordActiveEssence(player, state, essenceId);
  switch (essenceId) {
    case "destruction": installAttributePowerPair(state, player, essenceId, "力量"); break;
    case "concentration": installAttributePowerPair(state, player, essenceId, "迅捷"); break;
    case "technique": installAttributePowerPair(state, player, essenceId, "魔术"); break;
    case "flash":
      installRoundModifier(state, player, essenceId, "card_power", "add", 3, { subject: "controller", cards: { skill: true } });
      installRoundModifier(state, player, essenceId, "card_power", "subtract", 1, { subject: "controller", cards: { basic: true } });
      break;
    case "combat":
      blockManaGainThroughRound(player, state.round);
      installRoundModifier(state, player, essenceId, "combat_power", "add", { type: "metric", metric: "same_battlefield_opponent_count", source: "controller" });
      break;
    case "gloom":
      installRoundModifier(state, player, essenceId, "card_attribute_ability_activation", "forbid", 1, { attribute: "特殊", basic: true });
      break;
    case "barrier": {
      const current = Number(player.flags.terrainAdvantageContributionMultiplierRound) === state.round
        ? Number(player.flags.terrainAdvantageContributionMultiplier ?? 1)
        : 1;
      if (!Number.isFinite(current) || current < 0) throw new Error("RITSUKA_M_TERRAIN_MULTIPLIER_INVALID");
      player.flags.terrainAdvantageContributionMultiplierRound = state.round;
      player.flags.terrainAdvantageContributionMultiplier = current * 2;
      player.flags.movementBlockedOwnTurnRound = state.round;
      break;
    }
    case "preemption":
      player.flags.ritsukaMPreemptionRound = state.round;
      player.flags.ritsukaMPreemptionStacks = Number(player.flags.ritsukaMPreemptionStacks ?? 0) + 1;
      break;
    case "mapo-tofu":
      installRoundModifier(state, player, essenceId, "combat_power", "subtract", 2);
      installRoundModifier(state, player, essenceId, "victory_point_gain", "add", 2, { subject: "controller", sources: ["scouting"] });
      multiplyAscensionForMapo(state, player, definitions);
      break;
    case "tenacity":
      installRoundModifier(state, player, essenceId, "combat_power", "subtract", 3);
      player.flags.ignoreDefeatRound = state.round;
      break;
    case "ley-line":
      gainMana(player, 3);
      for (const target of Object.values(state.players)) if (target.id !== player.id && !target.eliminated) gainMana(target, 1);
      break;
    case "meditation":
      gainMana(player, 1);
      return { essenceId, meditationRemovalRequired: true };
    case "deception":
      player.flags.ritsukaMDeceptionRound = state.round;
      player.flags.ritsukaMDeceptionRemaining = Number(player.flags.ritsukaMDeceptionRemaining ?? 0) + 1;
      break;
    case "linkage":
      player.flags.ritsukaMLinkageReady = true;
      break;
    case "opportunity":
      break;
  }
  return { essenceId };
}

function openMeditationRemoval(context: Parameters<SkillHandler>[0], remaining: number, resolvedEssences: readonly string[]) {
  const pool = availablePool(context.player);
  if (remaining <= 0 || pool.length === 0) return { resolvedEssences: [...resolvedEssences], meditationRemovalsRemaining: 0 };
  return openDecisionFrame(
    context,
    "meditation-remove",
    pool.map((id) => ({ id, label: CE_LABELS[id] })),
    { remaining, resolvedEssences: [...resolvedEssences] },
  );
}

function resolveSelectedEssences(
  context: Parameters<SkillHandler>[0],
  selections: readonly RitsukaMCraftEssenceId[],
  opportunityExtraId?: RitsukaMCraftEssenceId,
) {
  const applied: RitsukaMCraftEssenceId[] = [];
  let meditationRemovals = 0;
  for (const selected of selections) {
    if (selected === "opportunity") {
      recordActiveEssence(context.player, context.state, selected);
      if (opportunityExtraId) {
        for (let repeat = 0; repeat < 2; repeat += 1) {
          const result = applyCraftEssence(context, opportunityExtraId);
          applied.push(opportunityExtraId);
          if (result.meditationRemovalRequired) meditationRemovals += 1;
        }
      }
      applied.push(selected);
      continue;
    }
    const result = applyCraftEssence(context, selected);
    applied.push(selected);
    if (result.meditationRemovalRequired) meditationRemovals += 1;
  }
  if (meditationRemovals > 0) return openMeditationRemoval(context, meditationRemovals, applied);
  return { resolvedEssences: applied };
}

function initializeCraftEssences(context: Parameters<SkillHandler>[0]) {
  const { player } = context;
  if (player.flags.ritsukaMCraftEssenceSetupComplete === true) return { initialized: false };
  if (availablePool(player).length === 0) setAvailablePool(player, RITSUKA_M_CRAFT_ESSENCES);
  return openDecisionFrame(
    context,
    "setup-remove",
    availablePool(player).map((id) => ({ id, label: CE_LABELS[id] })),
    {},
    3,
    3,
  );
}

function useGachaSlave(context: Parameters<SkillHandler>[0], data: Record<string, unknown>) {
  const { state, player, definitions, randomInt } = context;
  if (!definitions || !randomInt) throw new Error("RITSUKA_M_GACHA_CONTEXT_REQUIRED");
  if (state.phase !== "outpost" || state.activePlayerId !== player.id || player.flags.ritsukaMCraftEssenceSetupComplete !== true) throw new Error("RITSUKA_M_GACHA_WINDOW_INVALID");
  const x = Number(data.x);
  if (!Number.isInteger(x) || x < 0) throw new Error("RITSUKA_M_GACHA_X_INVALID");
  payManaCost(state, player, x, definitions, "RITSUKA_M_GACHA_MANA_REQUIRED");
  if (x > 0) player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + x;
  const pool = availablePool(player);
  if (pool.length === 0) throw new Error("RITSUKA_M_CRAFT_ESSENCE_POOL_EMPTY");
  const order = shuffled(pool, randomInt);
  const drawn = order.slice(0, Math.min(order.length, x + 1));
  const remainingOrder = order.slice(drawn.length);
  if (drawn.length === 0) throw new Error("RITSUKA_M_CRAFT_ESSENCE_DRAW_EMPTY");
  const linkageReady = player.flags.ritsukaMLinkageReady === true;
  delete player.flags.ritsukaMLinkageReady;
  const max = linkageReady ? Math.min(2, drawn.length) : 1;
  return openDecisionFrame(
    context,
    "gacha-pick",
    drawn.map((id) => ({ id, label: CE_LABELS[id] })),
    { drawn, remainingOrder, linkageReady },
    1,
    max,
  );
}

function hiddenBasicCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.basic === true && card.zone === "attack" && card.face === "down" && card.active !== true);
  });
}

function useDeception(context: Parameters<SkillHandler>[0], data: Record<string, unknown>) {
  const { state, player, definitions } = context;
  if (!definitions || state.phase !== "combat" || state.activePlayerId !== player.id
    || Number(player.flags.ritsukaMDeceptionRound ?? -1) !== state.round || Number(player.flags.ritsukaMDeceptionRemaining ?? 0) <= 0) {
    throw new Error("RITSUKA_M_DECEPTION_WINDOW_INVALID");
  }
  const targetInstanceId = typeof data.targetInstanceId === "string" ? data.targetInstanceId : undefined;
  if (!targetInstanceId || !hiddenBasicCandidates(state, player, definitions).includes(targetInstanceId)) throw new Error("RITSUKA_M_DECEPTION_TARGET_INVALID");
  const card = state.cards[targetInstanceId];
  const definition = definitions[card.definitionId];
  const cost = getCardPlayCost(state, definition, player, card, definitions);
  payManaCost(state, player, cost, definitions, "RITSUKA_M_DECEPTION_MANA_REQUIRED");
  if (cost > 0) player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + cost;
  card.face = "up";
  card.active = true;
  card.residual = definition.residual === true;
  card.paidCost = cost;
  player.flags.ritsukaMDeceptionRemaining = Number(player.flags.ritsukaMDeceptionRemaining) - 1;
  return { targetInstanceId, paidMana: cost, attributes: getCardInstanceAttributes(card, definition, state, definitions) };
}

function resolvePreemption(state: GameState, player: PlayerState) {
  if (Number(player.flags.ritsukaMPreemptionRound ?? -1) !== state.round) return;
  const stacks = Number(player.flags.ritsukaMPreemptionStacks ?? 0);
  if (!Number.isInteger(stacks) || stacks <= 0) return;
  delete player.flags.ritsukaMPreemptionRound;
  delete player.flags.ritsukaMPreemptionStacks;
  if (Number(player.flags.combatWinRound ?? -1) === state.round) return { victoryPoints: gainVictoryPoints(player, stacks * 2), won: true };
  return { victoryPoints: adjustVictoryPoints(player, -stacks), won: false };
}

function activateAscension(context: Parameters<SkillHandler>[0], event: Record<string, unknown>) {
  const { state, player, definitions } = context;
  if (!definitions || event.playerId !== player.id || event.skillId !== RITSUKA_M_ASCENSION_ID) return;
  const card = ascensionInstance(state, player, definitions);
  if (!card) throw new Error("RITSUKA_M_ASCENSION_CARD_MISSING");
  if (card.zone !== "attack") movePlayerCard(state, player.id, card.instanceId, "attack");
  card.face = "up";
  card.active = true;
  card.residual = true;
  const priorMapo = Number(player.flags.ritsukaMMapoTofuCount ?? 0);
  if (!Number.isInteger(priorMapo) || priorMapo < 0) throw new Error("RITSUKA_M_MAPO_COUNT_INVALID");
  card.basePowerMultiplier = Math.pow(2, priorMapo);
  state.activeRuleModifiers ??= [];
  const modifierId = `${RITSUKA_M_ASCENSION_ID}:never-close:${card.instanceId}`;
  state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => modifier.id !== modifierId);
  state.activeRuleModifiers.push({
    id: modifierId,
    sourceId: RITSUKA_M_ASCENSION_ID,
    controllerPlayerId: player.id,
    sourceInstanceId: card.instanceId,
    operation: "forbid",
    rule: "card_close",
    scope: { subject: "controller", cards: { instanceIds: [card.instanceId] } },
    duration: "game",
    createdRound: state.round,
  });
  return { instanceId: card.instanceId, basePowerMultiplier: card.basePowerMultiplier };
}

export const resolveRitsukaMDecision: SkillHandler = (context) => {
  const { player, payload } = context;
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("RITSUKA_M_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || typeof previous.stage !== "string") throw new Error("RITSUKA_M_DECISION_INVALID");

  if (previous.stage === "setup-remove") {
    const pool = availablePool(player);
    if (selections.length !== 3 || new Set(selections).size !== 3 || selections.some((id) => !isCraftEssenceId(id) || !pool.includes(id))) throw new Error("RITSUKA_M_SETUP_SELECTION_INVALID");
    const removed = new Set(selections as RitsukaMCraftEssenceId[]);
    setAvailablePool(player, pool.filter((id) => !removed.has(id)));
    player.flags.ritsukaMCraftEssenceSetupComplete = true;
    player.flags.ritsukaMRemovedCraftEssences = [...removed];
    return { removedCraftEssences: [...removed], availableCount: availablePool(player).length };
  }

  if (previous.stage === "gacha-pick") {
    const drawn = Array.isArray(previous.drawn) ? previous.drawn.filter(isCraftEssenceId) : [];
    const remainingOrder = Array.isArray(previous.remainingOrder) ? previous.remainingOrder.filter(isCraftEssenceId) : [];
    const linkageReady = previous.linkageReady === true;
    const max = linkageReady ? Math.min(2, drawn.length) : 1;
    if (selections.length < 1 || selections.length > max || new Set(selections).size !== selections.length || selections.some((id) => !isCraftEssenceId(id) || !drawn.includes(id))) {
      throw new Error("RITSUKA_M_GACHA_SELECTION_INVALID");
    }
    const selected = selections as RitsukaMCraftEssenceId[];
    const opportunityExtraId = selected.includes("opportunity") ? remainingOrder[0] : undefined;
    return resolveSelectedEssences(context, selected, opportunityExtraId);
  }

  if (previous.stage === "meditation-remove") {
    const pool = availablePool(player);
    const chosen = selections[0];
    const remaining = Number(previous.remaining);
    const resolvedEssences = Array.isArray(previous.resolvedEssences) ? previous.resolvedEssences.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !isCraftEssenceId(chosen) || !pool.includes(chosen) || !Number.isInteger(remaining) || remaining <= 0) throw new Error("RITSUKA_M_MEDITATION_SELECTION_INVALID");
    setAvailablePool(player, pool.filter((id) => id !== chosen));
    const removed = Array.isArray(player.flags.ritsukaMRemovedCraftEssences) ? player.flags.ritsukaMRemovedCraftEssences.filter(isCraftEssenceId) : [];
    player.flags.ritsukaMRemovedCraftEssences = [...new Set([...removed, chosen])];
    if (remaining > 1) return openMeditationRemoval(context, remaining - 1, resolvedEssences);
    return { removedCraftEssence: chosen, resolvedEssences };
  }
  throw new Error("RITSUKA_M_DECISION_STAGE_INVALID");
};

export const useRitsukaMCraftEssence: SkillHandler = (context) => {
  const { state, player, skill, payload } = context;
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (skill.id === RITSUKA_M_GACHA_ID) {
    if (eventType === "game.started") return initializeCraftEssences(context);
    if (data.abilityId === RITSUKA_M_GACHA_ABILITY) return useGachaSlave(context, data);
    return;
  }
  if (skill.id === RITSUKA_M_ESSENCE_ID) {
    if (eventType === "combat.ending") return resolvePreemption(state, player);
    if (data.abilityId === RITSUKA_M_DECEPTION_ABILITY) return useDeception(context, data);
    return;
  }
  if (skill.id === RITSUKA_M_ASCENSION_ID && eventType === "skill.unlocked") return activateAscension(context, event);
};

export const isRitsukaMCraftEssenceLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId) return false;
  if (skill.id === RITSUKA_M_GACHA_ID && ability?.id === RITSUKA_M_GACHA_ABILITY) {
    return state.phase === "outpost" && player.flags.ritsukaMCraftEssenceSetupComplete === true && availablePool(player).length > 0;
  }
  if (skill.id === RITSUKA_M_ESSENCE_ID && ability?.id === RITSUKA_M_DECEPTION_ABILITY) {
    return state.phase === "combat" && Number(player.flags.ritsukaMDeceptionRound ?? -1) === state.round
      && Number(player.flags.ritsukaMDeceptionRemaining ?? 0) > 0 && hiddenBasicCandidates(state, player, definitions).length > 0;
  }
  return false;
};
