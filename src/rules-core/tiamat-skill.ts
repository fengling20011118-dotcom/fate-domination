import type { CardDefinition } from "./content-types.ts";
import type { PendingDecision, GameState } from "../domain/state/types.ts";
import type { SkillHandler } from "./skill-types.ts";
import { SkillRegistry } from "./skill-registry.ts";
import { EffectRuntime } from "../match-engine/effect-runtime.ts";
import { closePlayerCard, createOwnedCardInstance, createDerivedCardInstance } from "./decks.ts";
import { movePlayerByEffect } from "./board.ts";
import type { CardAbilityRegistry } from "./card-abilities.ts";
import { payManaCost } from "./costs.ts";

export const TIAMAT_LIFE_SEA_ID = "master.tiamat.card.life-sea";
export const TIAMAT_MOTHER_ID = "master.tiamat.skill.s1";
export const TIAMAT_MOTHER_HANDLER = "core.tiamat-mother-of-all";
export const TIAMAT_MOTHER_RESOLVE = "core.tiamat-mother-of-all-resolve";
export const TIAMAT_TITAN_ID = "master.tiamat.skill.ascension";
const LIFE_SEA_CHOICE_HANDLER = `${TIAMAT_LIFE_SEA_ID}.choice`;
const BEAST_AS_SEAL_ABILITY_ID = "tiamat-beast-as-command-seal";

const beastDefinitions: Record<string, CardDefinition> = {
  "master.tiamat.beast.primitive-dragon": {
    id: "master.tiamat.beast.primitive-dragon", name: "原始之龙", cost: 2, basePower: 6,
    typeLabel: "力量", attributes: ["力量"], cardType: "attack",
    residual: true, limit: "once-per-game", tags: ["tiamat-beast", "primitive-dragon"],
    text: "每局游戏限一次。残留：当你输掉一场战斗时，关闭此牌；你无法于常规出牌打出基础牌。当你打出魔力消耗为3或更多的攻击时，该攻击本回合+2威力。",
  },
  "master.tiamat.beast.magic-pig": {
    id: "master.tiamat.beast.magic-pig", name: "魔性之猪", cost: 1, basePower: 4,
    typeLabel: "迅捷", attributes: ["迅捷"], cardType: "attack",
    residual: true, limit: "once-per-game", tags: ["tiamat-beast", "magic-pig"],
    text: "每局游戏限一次。残留：当你输掉一场战斗时，关闭此牌。当你赢得战斗时，此战斗的败者失去1点战果。",
  },
  "master.tiamat.beast.wave-beast": {
    id: "master.tiamat.beast.wave-beast", name: "波涛之兽", cost: 0, basePower: 6,
    typeLabel: "魔术", attributes: ["魔术"], cardType: "attack", cardAbilityIds: ["wave-beast-move"],
    residual: true, limit: "once-per-game", tags: ["tiamat-beast", "wave-beast", "reduces-standard-attack-by-one"],
    text: "每局游戏限一次。残留：你于攻击中少打1张牌。行动阶段：关闭此牌，从深山町或新都移动至任意地点。",
  },
};

const lifeSeaDefinition = {
  id: TIAMAT_LIFE_SEA_ID,
  name: "生命之海",
  ownerType: "master" as const,
  ownerId: "master.tiamat",
  activation: "phase" as const,
  windows: ["outpost"] as const,
  cost: 1,
  requirement: 0,
  basePower: 2,
  typeLabel: "特殊",
  cardResidual: true,
  requiresActiveCard: true,
  text: "你拥有的魔力少于8点也可以打出此牌。残留：在你的回合，你可以关闭一张【魔兽】以替代支付一枚令咒。前哨阶段：关闭此牌，从游戏外打出一张【魔兽】。",
  supportLevel: "FULL" as const,
};

export function getTiamatCardDefinitions(): Record<string, CardDefinition> {
  return {
    [TIAMAT_LIFE_SEA_ID]: {
      ...lifeSeaDefinition,
      isSkill: true,
      skillOwnerType: "master",
      requiresEightMana: false,
      residual: true,
      cardAbilityIds: [BEAST_AS_SEAL_ABILITY_ID],
    },
    ...beastDefinitions,
  };
}

export function registerTiamatSkill(registry: SkillRegistry, effects: EffectRuntime): void {
  if (!registry.has(TIAMAT_LIFE_SEA_ID)) registry.register(lifeSeaDefinition, useLifeSea);
  if (!effects.has(LIFE_SEA_CHOICE_HANDLER)) effects.register(LIFE_SEA_CHOICE_HANDLER, resolveLifeSeaChoice);
}

export function registerTiamatCardAbilities(registry: CardAbilityRegistry): void {
  if (!registry.has(BEAST_AS_SEAL_ABILITY_ID)) registry.register(BEAST_AS_SEAL_ABILITY_ID, ({ state, playerId, instanceId, target, definitions }) => {
    const player = state.players[playerId];
    const sea = state.cards[instanceId];
    if (!player || player.eliminated || state.activePlayerId !== playerId) throw new Error("TIAMAT_SEAL_SUBSTITUTION_WINDOW_FORBIDDEN");
    if (!sea || sea.definitionId !== TIAMAT_LIFE_SEA_ID || sea.ownerPlayerId !== playerId || sea.zone !== "attack" || !sea.active || sea.face !== "up") {
      throw new Error("TIAMAT_SEAL_SUBSTITUTION_SOURCE_INACTIVE");
    }
    const data = target && typeof target === "object" && !Array.isArray(target) ? target as Record<string, unknown> : {};
    const beastInstanceId = typeof data.beastInstanceId === "string" ? data.beastInstanceId : undefined;
    const beast = beastInstanceId ? state.cards[beastInstanceId] : undefined;
    const beastDefinition = beast ? definitions[beast.definitionId] : undefined;
    if (!beastInstanceId || !beast || beast.ownerPlayerId !== playerId || beast.zone !== "attack" || !beast.active || beast.face !== "up"
      || !beastDefinition?.tags?.includes("tiamat-beast")) throw new Error("TIAMAT_SEAL_SUBSTITUTION_BEAST_INVALID");
    closePlayerCard(state, playerId, beastInstanceId, definitions);
    const priorCredits = Number(player.flags.commandSealPaymentCreditRound ?? Number.NEGATIVE_INFINITY) === state.round
      ? Number(player.flags.commandSealPaymentCredits ?? 0)
      : 0;
    if (!Number.isInteger(priorCredits) || priorCredits < 0) throw new Error("COMMAND_SEAL_PAYMENT_CREDIT_INVALID");
    player.flags.commandSealPaymentCreditRound = state.round;
    player.flags.commandSealPaymentCredits = priorCredits + 1;
  });

  if (!registry.has("wave-beast-move")) registry.register("wave-beast-move", ({ state, playerId, instanceId, target, definitions, emitEvent }) => {
    const player = state.players[playerId];
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!player || player.eliminated || player.defeated) throw new Error("PLAYER_NOT_AVAILABLE");
    if (state.phase !== "action" || state.activePlayerId !== playerId) throw new Error("SKILL_WINDOW_FORBIDDEN");
    if (!instance || instance.ownerPlayerId !== playerId || instance.zone !== "attack" || !instance.active || !definition?.tags?.includes("wave-beast")) throw new Error("CARD_ABILITY_FORBIDDEN");
    if (player.locationId !== "mountain" && player.locationId !== "city") throw new Error("WAVE_BEAST_SOURCE_FORBIDDEN");
    if (typeof target !== "string") throw new Error("LOCATION_REQUIRED");
    closePlayerCard(state, playerId, instanceId, definitions);
    const movement = movePlayerByEffect(state, playerId, target, definitions);
    emitEvent?.("player.moved", { playerId, ...movement });
    emitEvent?.("player.entered-location", { playerId, ...movement, method: "effect" });
  });
}

export function ensureTiamatLifeSea(state: GameState, playerId: string): void {
  const player = state.players[playerId];
  if (!player || player.masterId !== "master.tiamat") return;
  if ([...player.masterSkills, ...player.attack].some((id) => state.cards[id]?.definitionId === TIAMAT_LIFE_SEA_ID)) return;
  const instanceId = `${playerId}:tiamat:life-sea`;
  if (state.cards[instanceId]) return;
  createOwnedCardInstance(state, playerId, { instanceId, definitionId: TIAMAT_LIFE_SEA_ID, zone: "master-skills", face: "up", residual: true });
}

export function initializeTiamatBeasts(state: GameState, playerId: string): void {
  const pools = (state.modeState.tiamatAvailableBeasts as Record<string, string[]> | undefined) ?? {};
  if (!pools[playerId]) pools[playerId] = Object.keys(beastDefinitions);
  state.modeState = { ...state.modeState, tiamatAvailableBeasts: pools };
}

function availableTiamatBeasts(state: GameState, playerId: string): string[] {
  initializeTiamatBeasts(state, playerId);
  return ((state.modeState.tiamatAvailableBeasts as Record<string, string[]> | undefined)?.[playerId] ?? []).filter((id) => Boolean(beastDefinitions[id]));
}

function spawnTiamatBeastIntoPlay(state: GameState, playerId: string, beastId: string, sourceEffectId: string): string {
  const pools = state.modeState.tiamatAvailableBeasts as Record<string, string[]> | undefined;
  const available = pools?.[playerId] ?? [];
  if (!beastDefinitions[beastId] || !available.includes(beastId)) throw new Error("TIAMAT_BEAST_INVALID");
  pools![playerId] = available.filter((id) => id !== beastId);
  const index = Object.keys(beastDefinitions).indexOf(beastId);
  const baseId = `${playerId}:tiamat:beast:${index + 1}`;
  const instanceId = state.cards[baseId] ? `${baseId}:${state.round}:${state.revision}` : baseId;
  createDerivedCardInstance(state, playerId, {
    instanceId,
    definitionId: beastId,
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
    sourceEffectId,
    createdByPlayerId: playerId,
  });
  return instanceId;
}

function openTiamatBeastDecision(
  state: GameState,
  playerId: string,
  sourceId: string,
  handlerId: string,
  count: number,
  allowCancel: boolean,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const available = availableTiamatBeasts(state, playerId);
  const required = Math.min(count, available.length);
  if (required <= 0) return;
  const effectId = `${state.gameInstanceId}:${state.revision}:${playerId}:${sourceId}:beast-choice`;
  state.effectQueue.unshift({
    effectId,
    handlerId,
    sourceId,
    controllerPlayerId: playerId,
    payload: { stage: "beast-choice", count: required, candidates: available },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: playerId,
    chooserPlayerIds: [playerId],
    kind: "tiamat-beast",
    min: required,
    max: required,
    allowCancel,
    continuationEffectId: effectId,
    submissions: {},
    options: available.map((id) => ({ id, label: beastDefinitions[id].name })),
  } as PendingDecision);
}

/** Mother of All installs the no-seal replacement and resolves replaced gains as Demonic Beasts. */
export const useTiamatMotherOfAll: SkillHandler = ({ state, player, skill, payload, openDecision }) => {
  const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = data.event && typeof data.event === "object" && !Array.isArray(data.event) ? data.event as Record<string, unknown> : {};
  if (eventType === "game.started") {
    player.commandSeals = 0;
    player.flags.commandSealGainReplacementSourceId = skill.id;
    ensureTiamatLifeSea(state, player.id);
    initializeTiamatBeasts(state, player.id);
    return;
  }
  if (eventType === "player.command-seal-gain-replaced") {
    if (event.playerId !== player.id || event.replacementSourceId !== skill.id) return;
    const amount = Number(event.amount ?? 0);
    if (!Number.isInteger(amount) || amount <= 0) throw new Error("TIAMAT_REPLACED_SEAL_AMOUNT_INVALID");
    openTiamatBeastDecision(state, player.id, skill.id, TIAMAT_MOTHER_RESOLVE, amount, false, openDecision);
    return;
  }
  throw new Error("TIAMAT_MOTHER_TRIGGER_INVALID");
};

export const resolveTiamatMotherOfAll: SkillHandler = ({ state, player, payload }) => {
  const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const previous = data.previous && typeof data.previous === "object" && !Array.isArray(data.previous) ? data.previous as Record<string, unknown> : {};
  const decision = data.decision && typeof data.decision === "object" && !Array.isArray(data.decision) ? data.decision as Record<string, unknown> : {};
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  const count = Number(previous.count ?? 0);
  if (previous.stage !== "beast-choice" || decision.status !== "resolved" || !Number.isInteger(count) || count <= 0
    || selections.length !== count || new Set(selections).size !== selections.length || selections.some((id) => !candidates.includes(id))) {
    throw new Error("TIAMAT_MOTHER_DECISION_INVALID");
  }
  return selections.map((beastId) => spawnTiamatBeastIntoPlay(state, player.id, beastId, `${TIAMAT_MOTHER_ID}:replaced-command-seal`));
};

export const useLifeSea: SkillHandler = ({ state, player, openDecision, definitions }) => {
  if (!definitions || state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("SKILL_WINDOW_FORBIDDEN");
  const source = player.attack.map((id) => state.cards[id]).find((card) => card?.definitionId === TIAMAT_LIFE_SEA_ID && card.active && card.face === "up");
  if (!source) throw new Error("TIAMAT_LIFE_SEA_SOURCE_INACTIVE");
  if (availableTiamatBeasts(state, player.id).length === 0) throw new Error("TIAMAT_BEASTS_EMPTY");
  closePlayerCard(state, player.id, source.instanceId, definitions);
  openTiamatBeastDecision(state, player.id, TIAMAT_LIFE_SEA_ID, LIFE_SEA_CHOICE_HANDLER, 1, false, openDecision);
};

export const resolveLifeSeaChoice: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("TIAMAT_LIFE_SEA_DEFINITIONS_REQUIRED");
  const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const previous = data.previous && typeof data.previous === "object" && !Array.isArray(data.previous) ? data.previous as Record<string, unknown> : {};
  const decision = data.decision && typeof data.decision === "object" && !Array.isArray(data.decision) ? data.decision as Record<string, unknown> : {};
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (previous.stage !== "beast-choice" || decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) {
    throw new Error("TIAMAT_LIFE_SEA_DECISION_INVALID");
  }
  const beastId = selections[0];
  const definition = beastDefinitions[beastId];
  payManaCost(state, player, definition.cost, definitions);
  const instanceId = spawnTiamatBeastIntoPlay(state, player.id, beastId, `${TIAMAT_LIFE_SEA_ID}:outpost`);
  const instance = state.cards[instanceId];
  instance.paidCost = definition.cost;
  instance.playedRound = state.round;
  instance.playedLocationId = player.locationId;
  instance.playCount = Number(instance.playCount ?? 0) + 1;
  emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: beastId, face: "up", paidMana: definition.cost, attributes: definition.attributes ?? [], method: "sea-of-life" });
  emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: beastId, locationId: player.locationId, attributes: definition.attributes ?? [], method: "sea-of-life" });
  return instanceId;
};
