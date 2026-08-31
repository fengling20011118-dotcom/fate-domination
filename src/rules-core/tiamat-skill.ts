import type { CardDefinition } from "./content-types.ts";
import type { EffectFrame, PendingDecision, GameState } from "../domain/state/types.ts";
import type { SkillHandler } from "./skill-types.ts";
import { SkillRegistry } from "./skill-registry.ts";
import { EffectRuntime } from "../match-engine/effect-runtime.ts";
import { movePlayerCard, closePlayerCard, createOwnedCardInstance, createDerivedCardInstance } from "./decks.ts";
import { movePlayerByEffect } from "./board.ts";
import type { CardAbilityRegistry } from "./card-abilities.ts";

export const TIAMAT_LIFE_SEA_ID = "master.tiamat.card.life-sea";
const choiceHandlerId = `${TIAMAT_LIFE_SEA_ID}.choice`;

const beastDefinitions: Record<string, CardDefinition> = {
  "master.tiamat.beast.primitive-dragon": { id: "master.tiamat.beast.primitive-dragon", name: "原始之龙", cost: 2, basePower: 6, typeLabel: "力量", attributes: ["力量"], isSkill: true, skillOwnerType: "master", requiresEightMana: false, residual: true, limit: "once-per-game", tags: ["tiamat-beast", "primitive-dragon"], text: "每局游戏限一次。残留：当你输掉一场战斗时，关闭此牌；你无法于常规出牌打出基础牌。当你打出魔力消耗为3或更多的攻击时，该攻击本回合+2威力。" },
  "master.tiamat.beast.magic-pig": { id: "master.tiamat.beast.magic-pig", name: "魔性之猪", cost: 1, basePower: 4, typeLabel: "迅捷", attributes: ["迅捷"], isSkill: true, skillOwnerType: "master", requiresEightMana: false, residual: true, limit: "once-per-game", tags: ["tiamat-beast", "magic-pig"], text: "每局游戏限一次。残留：当你输掉一场战斗时，关闭此牌。当你赢得战斗时，此战斗的败者失去1点战果。" },
  "master.tiamat.beast.wave-beast": { id: "master.tiamat.beast.wave-beast", name: "波涛之兽", cost: 0, basePower: 6, typeLabel: "魔术", attributes: ["魔术"], isSkill: true, skillOwnerType: "master", requiresEightMana: false, residual: true, limit: "once-per-game", tags: ["tiamat-beast", "wave-beast", "reduces-standard-attack-by-one"], text: "每局游戏限一次。残留：你于攻击中少打1张牌。行动阶段：关闭此牌，从深山町或新都移动至任意地点。" },
};

const lifeSeaDefinition = {
  id: TIAMAT_LIFE_SEA_ID,
  name: "生命之海",
  ownerType: "master" as const,
  ownerId: "master.tiamat",
  activation: "phase" as const,
  windows: ["outpost", "action"] as const,
  cost: 1,
  requirement: 0,
  basePower: 2,
  typeLabel: "特殊",
  text: "你拥有的魔力少于8点也可以打出此牌。前哨阶段：关闭此牌，从游戏外打出一张【魔兽】。行动阶段：从游戏外打出一张【魔兽】。",
  supportLevel: "FULL" as const,
};

export function getTiamatCardDefinitions(): Record<string, CardDefinition> {
  return {
    [TIAMAT_LIFE_SEA_ID]: { ...lifeSeaDefinition, isSkill: true, skillOwnerType: "master", requiresEightMana: false, residual: true },
    ...beastDefinitions,
  };
}

export function registerTiamatSkill(registry: SkillRegistry, effects: EffectRuntime): void {
  if (!registry.has(TIAMAT_LIFE_SEA_ID)) registry.register(lifeSeaDefinition, useLifeSea);
  try { effects.register(choiceHandlerId, resolveLifeSeaChoice); } catch (error) {
    if (!(error instanceof Error) || error.message !== "EFFECT_HANDLER_DUPLICATE") throw error;
  }
}

export function registerTiamatCardAbilities(registry: CardAbilityRegistry): void {
  registry.register("wave-beast-move", ({ state, playerId, instanceId, target, definitions }) => {
    const player = state.players[playerId];
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!player || player.eliminated || player.defeated) throw new Error("PLAYER_NOT_AVAILABLE");
    if (state.phase !== "action" || state.activePlayerId !== playerId) throw new Error("SKILL_WINDOW_FORBIDDEN");
    if (!instance || instance.ownerPlayerId !== playerId || instance.zone !== "attack" || !instance.active || !definition?.tags?.includes("wave-beast")) throw new Error("CARD_ABILITY_FORBIDDEN");
    if (player.locationId !== "mountain" && player.locationId !== "city") throw new Error("WAVE_BEAST_SOURCE_FORBIDDEN");
    if (typeof target !== "string") throw new Error("LOCATION_REQUIRED");
    closePlayerCard(state, playerId, instanceId, definitions);
    movePlayerByEffect(state, playerId, target);
  });
}

export function ensureTiamatLifeSea(state: GameState, playerId: string): void {
  const player = state.players[playerId];
  if (!player || player.masterId !== "master.tiamat") return;
  if (player.masterSkills.some((id) => state.cards[id]?.definitionId === TIAMAT_LIFE_SEA_ID)) return;
  const instanceId = `${playerId}:tiamat:life-sea`;
  createOwnedCardInstance(state, playerId, { instanceId, definitionId: TIAMAT_LIFE_SEA_ID, zone: "master-skills", face: "up", residual: true });
}

export function initializeTiamatBeasts(state: GameState, playerId: string): void {
  const pools = (state.modeState.tiamatAvailableBeasts as Record<string, string[]> | undefined) ?? {};
  if (!pools[playerId]) pools[playerId] = Object.keys(beastDefinitions);
  state.modeState = { ...state.modeState, tiamatAvailableBeasts: pools };
}

const useLifeSea: SkillHandler = ({ state, player, openDecision }) => {
  if (!["outpost", "action"].includes(state.phase) || state.activePlayerId !== player.id) throw new Error("SKILL_WINDOW_FORBIDDEN");
  initializeTiamatBeasts(state, player.id);
  const pools = state.modeState.tiamatAvailableBeasts as Record<string, string[]>;
  const available = pools[player.id] ?? [];
  if (available.length === 0) throw new Error("TIAMAT_BEASTS_EMPTY");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${TIAMAT_LIFE_SEA_ID}:choice`;
  const frame: EffectFrame = { effectId, handlerId: choiceHandlerId, sourceId: TIAMAT_LIFE_SEA_ID, controllerPlayerId: player.id, payload: {}, createdAtRevision: state.revision };
  state.effectQueue.push(frame);
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "tiamat-beast", min: 1, max: 1, allowCancel: true, continuationEffectId: effectId, submissions: {},
    options: available.map((id) => ({ id, label: beastDefinitions[id].name })),
  } as PendingDecision);
};

const resolveLifeSeaChoice: SkillHandler = ({ state, player, payload }) => {
  const result = (payload as { decision?: { status: string; selections: string[] } }).decision;
  if (!result || result.status !== "resolved") return;
  const beastId = result.selections[0];
  const pools = state.modeState.tiamatAvailableBeasts as Record<string, string[]> | undefined;
  const available = pools?.[player.id] ?? [];
  if (!beastDefinitions[beastId] || !available.includes(beastId)) throw new Error("TIAMAT_BEAST_INVALID");
  pools![player.id] = available.filter((id) => id !== beastId);
  const index = Object.keys(beastDefinitions).indexOf(beastId);
  const instanceId = `${player.id}:tiamat:beast:${index + 1}`;
  createDerivedCardInstance(state, player.id, { instanceId, definitionId: beastId, zone: "master-skills", face: "up", residual: true, sourceEffectId: `${state.gameInstanceId}:${state.revision}:${player.id}:${TIAMAT_LIFE_SEA_ID}:choice` });
  if (state.phase === "outpost") player.flags.tiamatLifeSeaClosedRound = state.round;
};
