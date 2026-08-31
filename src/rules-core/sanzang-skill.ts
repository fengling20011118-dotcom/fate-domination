import type { EffectFrame, PendingDecision } from "../domain/state/types.ts";
import { drawCards, movePlayerCard } from "./decks.ts";
import type { SkillHandler } from "./skill-types.ts";
import { SkillRegistry } from "./skill-registry.ts";
import { EffectRuntime } from "../match-engine/effect-runtime.ts";
import { moveToNonWorkshop } from "./skill-handlers.ts";

const skillId = "servant.sanzang.skill.sc-sanzang-1";
const choiceHandlerId = `${skillId}.choice`;
const targetHandlerId = `${skillId}.move-target`;

/** Registers 三藏法师「神性〔金蝉子〕」及其三选一结算效果。 */
export function registerSanzangSkill(registry: SkillRegistry, effects: EffectRuntime): void {
  try {
    registry.registerHandler(skillId, sanzangGoldenCicada);
  } catch (error) {
    if (!(error instanceof Error) || !["SKILL_NOT_FOUND", "SKILL_HANDLER_DUPLICATE"].includes(error.message)) throw error;
  }
  for (const [handlerId, handler] of [[choiceHandlerId, resolveGoldenCicadaChoice], [targetHandlerId, resolveGoldenCicadaMove]] as const) {
    try {
      effects.register(handlerId, handler);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "EFFECT_HANDLER_DUPLICATE") throw error;
    }
  }
}

export const sanzangGoldenCicada: SkillHandler = ({ state, player, openDecision, randomInt }) => {
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("SKILL_WINDOW_FORBIDDEN");
  const lucky = player.hand.find((instanceId) => state.cards[instanceId]?.definitionId === "card.cardluck");
  if (!lucky) throw new Error("LUCK_CARD_REQUIRED");
  movePlayerCard(state, player.id, lucky, "discard");
  drawCards(state, player.id, 1, randomInt ?? (() => 0));

  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skillId}:choice`;
  const decision: PendingDecision = {
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "sanzang-golden-cicada",
    options: [
      { id: "mana", label: "获得3点魔力" },
      { id: "power", label: "本回合合计威力+2，若本回合赢得战斗则获得2点战果" },
      { id: "move", label: "从深山町或新都移动至任意位置，无视交战状态", disabled: !["mountain", "city"].includes(player.locationId ?? "") },
    ],
    min: 1,
    max: 1,
    allowCancel: true,
    continuationEffectId: effectId,
    submissions: {},
  };
  const frame: EffectFrame = {
    effectId,
    handlerId: choiceHandlerId,
    sourceId: skillId,
    controllerPlayerId: player.id,
    payload: {},
    createdAtRevision: state.revision,
  };
  state.effectQueue.push(frame);
  openDecision(decision);
};

const resolveGoldenCicadaChoice: SkillHandler = ({ state, player, payload, openDecision }) => {
  const result = (payload as { decision?: { status: string; selections: string[] } }).decision;
  if (!result || result.status !== "resolved") return;
  const choice = result.selections[0];
  if (choice === "mana") {
    player.mana += 3;
    return;
  }
  if (choice === "power") {
    player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 2;
    player.flags.sanzangVictoryRewardRound = state.round;
    return;
  }
  if (choice !== "move") return;
  const targetEffectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skillId}:move-target`;
  state.effectQueue.push({
    effectId: targetEffectId,
    handlerId: targetHandlerId,
    sourceId: skillId,
    controllerPlayerId: player.id,
    payload: {},
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${targetEffectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "sanzang-golden-cicada-move",
    options: [
      { id: "mountain", label: "深山町" },
      { id: "city", label: "新都" },
      { id: "scouting", label: "侦察", disabled: state.board.locations.scouting.length >= 1 },
    ],
    min: 1,
    max: 1,
    allowCancel: true,
    continuationEffectId: targetEffectId,
    submissions: {},
  });
};

const resolveGoldenCicadaMove: SkillHandler = ({ state, player, payload }) => {
  const result = (payload as { decision?: { status: string; selections: string[] } }).decision;
  if (!result || result.status !== "resolved") return;
  const target = result.selections[0];
  if (!["mountain", "city", "scouting"].includes(target)) throw new Error("SANZANG_MOVE_TARGET_INVALID");
  moveToNonWorkshop({ state, player, skill: { id: skillId, name: "神性〔金蝉子〕", ownerType: "servant", ownerId: "servant.sanzang", activation: "phase", windows: ["action"], cost: 0, text: "", supportLevel: "FULL" }, payload: { locationId: target }, openDecision: () => undefined });
};
