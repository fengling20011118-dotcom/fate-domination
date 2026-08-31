import type { EffectFrame, GameState } from "../domain/state/types.ts";
import { EffectRuntime } from "../match-engine/effect-runtime.ts";
import { StateRandom } from "../match-engine/random.ts";
import { drawCards } from "./decks.ts";
import type { SkillHandler } from "./skill-types.ts";

export const GAIN_RESOURCES_EFFECT = "core.effect.gain-resources";
export const DRAW_CARDS_EFFECT = "core.effect.draw-cards";

export interface GainResourcesPayload {
  mana?: number;
  victoryPoints?: number;
}

export interface DrawCardsPayload {
  count: number;
}

/** Registers reusable, serializable rule effects shared by content handlers. */
export function registerStandardEffectHandlers(runtime: EffectRuntime): void {
  registerOnce(runtime, GAIN_RESOURCES_EFFECT, gainResources);
  registerOnce(runtime, DRAW_CARDS_EFFECT, drawCardsEffect);
}

export function createEffectFrame(input: {
  effectId: string;
  handlerId: string;
  sourceId: string;
  controllerPlayerId: string;
  payload: unknown;
  state: GameState;
}): EffectFrame {
  if (!input.effectId || !input.handlerId || !input.sourceId || !input.controllerPlayerId) throw new Error("STANDARD_EFFECT_FRAME_INVALID");
  if (!input.state.players[input.controllerPlayerId]) throw new Error("EFFECT_CONTROLLER_NOT_FOUND");
  return {
    effectId: input.effectId,
    handlerId: input.handlerId,
    sourceId: input.sourceId,
    controllerPlayerId: input.controllerPlayerId,
    payload: structuredClone(input.payload),
    createdAtRevision: input.state.revision,
  };
}

export const gainResources: SkillHandler = ({ player, payload }) => {
  const values = payload as GainResourcesPayload | undefined;
  const mana = values?.mana ?? 0;
  const victoryPoints = values?.victoryPoints ?? 0;
  assertNonNegativeInteger(mana, "RESOURCE_MANA_INVALID");
  assertNonNegativeInteger(victoryPoints, "RESOURCE_VICTORY_POINTS_INVALID");
  player.mana += mana;
  player.victoryPoints += victoryPoints;
};

export const drawCardsEffect: SkillHandler = ({ state, player, payload }) => {
  const count = (payload as DrawCardsPayload | undefined)?.count;
  assertNonNegativeInteger(count, "DRAW_COUNT_INVALID");
  const random = new StateRandom();
  drawCards(state, player.id, count, (maxExclusive) => random.integer(state, maxExclusive));
};

function assertNonNegativeInteger(value: unknown, error: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(error);
}

function registerOnce(runtime: EffectRuntime, id: string, handler: SkillHandler): void {
  if (!runtime.has(id)) runtime.register(id, handler);
}
