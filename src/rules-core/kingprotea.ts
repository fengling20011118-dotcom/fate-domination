import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";
import { gainMana } from "./resources.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { addSkillUseBlock } from "./skill-use-blocks.ts";
import { revealUsedSkillCard } from "./skill-visibility.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const KINGPROTEA_LIMIT_BREAK_ID = "servant.kingprotea.skill.sc-kingprotea-1";
export const KINGPROTEA_HIBERNATION_ID = "servant.kingprotea.skill.sc-kingprotea-2";
export const KINGPROTEA_GROWTH_ID = "servant.kingprotea.skill.sc-kingprotea-3";
export const KINGPROTEA_LIMIT_BREAK_HANDLER = "core.kingprotea-limit-break";
export const KINGPROTEA_HIBERNATION_HANDLER = "core.kingprotea-hibernation";
export const KINGPROTEA_HIBERNATION_RESOLVE = "core.kingprotea-hibernation-resolve";
export const KINGPROTEA_GROWTH_HANDLER = "core.kingprotea-infinite-growth";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function activeAttackCount(state: GameState, player: PlayerState): number {
  return player.attack.filter((id) => state.cards[id]?.active && state.cards[id]?.face === "up").length;
}

export const useKingproteaLimitBreak: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== "limit-break" || state.phase !== "outpost" || state.activePlayerId !== player.id) {
    throw new Error("KINGPROTEA_LIMIT_BREAK_WINDOW_INVALID");
  }
  const x = 1 + activeAttackCount(state, player);
  const paidMana = 2 * x;
  payManaCost(state, player, paidMana, definitions);
  const ignoreId = `${KINGPROTEA_LIMIT_BREAK_ID}:ignore-regression:${state.round}`;
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => modifier.id !== ignoreId);
  state.activeRuleModifiers.push({
    id: ignoreId,
    sourceId: KINGPROTEA_LIMIT_BREAK_ID,
    controllerPlayerId: player.id,
    operation: "ignore",
    rule: "combat_post_power_close_all_attacks_above",
    scope: { subject: "controller" },
    duration: "round",
    createdRound: state.round,
  });
  addSkillUseBlock(player, {
    id: `${KINGPROTEA_LIMIT_BREAK_ID}:block-hibernation:${state.round}`,
    sourceId: KINGPROTEA_LIMIT_BREAK_ID,
    definitionIds: [KINGPROTEA_HIBERNATION_ID],
    throughRound: state.round,
  });
  return { x, paidMana };
};

export const isKingproteaLimitBreakLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== "limit-break" || state.phase !== "outpost" || state.activePlayerId !== playerId) return false;
  const cost = 2 * (1 + activeAttackCount(state, player));
  return player.flags.infiniteMana === true || player.mana >= cost;
};

function hibernationCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || !card.active || card.face !== "up" || definition.basic !== true) return false;
    return !getCardInstanceAttributes(card, definition, state, definitions).includes("特殊");
  });
}

function grantHibernationResidual(state: GameState, player: PlayerState, selected: string[]): { selectedInstanceIds: string[] } {
  const unique = [...new Set(selected)];
  if (unique.length > 2) throw new Error("KINGPROTEA_HIBERNATION_TOO_MANY");
  for (const instanceId of unique) {
    const card = state.cards[instanceId];
    if (!card || card.controllerPlayerId !== player.id || card.zone !== "attack" || !card.active) throw new Error("KINGPROTEA_HIBERNATION_TARGET_INVALID");
    card.residual = true;
    card.residualUntilRound = Math.max(Number(card.residualUntilRound ?? 0), state.round + 1);
  }
  player.flags.kingproteaHibernationManaRound = state.round;
  return { selectedInstanceIds: unique };
}

export const useKingproteaHibernation: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("KINGPROTEA_HIBERNATION_CONTEXT_REQUIRED");
  if (payload.eventType === "card.closed") {
    if (Number(player.flags.kingproteaHibernationManaRound ?? -1) !== state.round || !activeOwnedSkill(state, player, skill.id, definitions)) return;
    const event = isRecord(payload.event) ? payload.event : {};
    const instanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
    const card = instanceId ? state.cards[instanceId] : undefined;
    const definition = card ? definitions[card.definitionId] : undefined;
    if (event.ownerPlayerId !== player.id || !definition?.basic) return;
    return { gainedMana: gainMana(player, 1) };
  }
  if (payload.abilityId !== "hibernate" || state.phase !== "action" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, skill.id, definitions)) {
    throw new Error("KINGPROTEA_HIBERNATION_WINDOW_INVALID");
  }
  const candidates = hibernationCandidates(state, player, definitions);
  if (Array.isArray(payload.instanceIds)) {
    const selected = payload.instanceIds.filter((id): id is string => typeof id === "string");
    if (selected.some((id) => !candidates.includes(id))) throw new Error("KINGPROTEA_HIBERNATION_TARGET_INVALID");
    return grantHibernationResidual(state, player, selected);
  }
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:choose`;
  state.effectQueue.unshift({ effectId, handlerId: KINGPROTEA_HIBERNATION_RESOLVE, sourceId: skill.id, controllerPlayerId: player.id, payload: { candidates }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "kingprotea-hibernation",
    options: candidates.map((id) => ({ id, label: definitions[state.cards[id]?.definitionId ?? ""]?.name ?? id })), min: 0, max: Math.min(2, candidates.length), allowCancel: false,
    continuationEffectId: effectId, submissions: {},
  });
  return { pending: true, candidates };
};

export const resolveKingproteaHibernation: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision) || payload.decision.status !== "resolved") throw new Error("KINGPROTEA_HIBERNATION_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidates) ? payload.previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selected = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (selected.length > 2 || selected.some((id) => !candidates.includes(id) || !hibernationCandidates(state, player, definitions).includes(id))) throw new Error("KINGPROTEA_HIBERNATION_TARGET_INVALID");
  return grantHibernationResidual(state, player, selected);
};

export const isKingproteaHibernationLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "hibernate" && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions));
};

function activeBasicCards(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).filter((card) => Boolean(card && card.active && card.face === "up" && definitions[card.definitionId]?.basic));
}

/** Infinite Growth arms on a basic play and reveals only when cleanup would otherwise close those basics. */
export const useKingproteaInfiniteGrowth: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("KINGPROTEA_GROWTH_CONTEXT_REQUIRED");
  if (payload.eventType === "card.played") {
    const event = isRecord(payload.event) ? payload.event : {};
    if (event.playerId !== player.id || typeof event.definitionId !== "string" || definitions[event.definitionId]?.basic !== true) return;
    player.flags.kingproteaExpansionRound = state.round;
    return { armedRound: state.round };
  }
  if (payload.eventType === "round.ending") {
    if (Number(player.flags.kingproteaExpansionRound ?? -1) !== state.round) return;
    const basics = activeBasicCards(state, player, definitions);
    if (basics.length === 0) return;
    revealUsedSkillCard(state, player.id, skill.id, definitions);
    for (const card of basics) {
      card.residual = true;
      card.residualUntilRound = Math.max(Number(card.residualUntilRound ?? 0), state.round + 1);
    }
    return { preservedInstanceIds: basics.map((card) => card.instanceId) };
  }
};
