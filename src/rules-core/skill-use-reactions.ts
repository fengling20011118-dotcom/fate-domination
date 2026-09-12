import type { GameState, PendingDecision } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";

export const OPPONENT_SKILL_WARD_TAG = "opponent-skill-ward-pay2-or-ignore-once-per-round";

interface SkillWardCandidate {
  playerId: string;
  sourceInstanceId: string;
  sourceDefinitionId: string;
}

export interface PendingSkillUseReaction {
  actorPlayerId: string;
  skillId: string;
  data?: unknown;
  candidates: SkillWardCandidate[];
  index: number;
  temporaryImmunityModifierIds: string[];
}

interface SkillUseReactionCleanup {
  actorPlayerId: string;
  skillId: string;
  modifierIds: string[];
}

function pending(state: GameState): PendingSkillUseReaction | undefined {
  const value = state.modeState.pendingSkillUseReaction;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as unknown as PendingSkillUseReaction;
}

function usageFlag(instanceId: string): string {
  return `skillWardUsedRound:${instanceId}`;
}

function passiveSourceZoneIsLive(card: GameState["cards"][string]): boolean {
  if (card.zone === "hand" || card.zone === "master-skills" || card.zone === "servant-skills") return true;
  return card.zone === "attack" && card.active && card.face === "up";
}

function sourceStillActive(state: GameState, candidate: SkillWardCandidate, definitions: Record<string, CardDefinition>, requireUnused = true): boolean {
  const player = state.players[candidate.playerId];
  const card = state.cards[candidate.sourceInstanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  return Boolean(player && !player.eliminated && card?.controllerPlayerId === candidate.playerId && passiveSourceZoneIsLive(card)
    && definition?.tags?.includes(OPPONENT_SKILL_WARD_TAG)
    && (!requireUnused || Number(player.flags[usageFlag(candidate.sourceInstanceId)] ?? -1) !== state.round));
}

function findCandidates(state: GameState, actorPlayerId: string, definitions: Record<string, CardDefinition>): SkillWardCandidate[] {
  const order = state.turnOrder.length ? state.turnOrder : Object.keys(state.players);
  const candidates: SkillWardCandidate[] = [];
  for (const playerId of order) {
    if (playerId === actorPlayerId) continue;
    const player = state.players[playerId];
    if (!player || player.eliminated) continue;
    const sourceIds = [...new Set([...player.masterSkills, ...player.servantSkills, ...player.hand, ...player.attack])];
    for (const instanceId of sourceIds) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || card.controllerPlayerId !== playerId || !passiveSourceZoneIsLive(card) || !definition?.tags?.includes(OPPONENT_SKILL_WARD_TAG)) continue;
      if (Number(player.flags[usageFlag(instanceId)] ?? -1) === state.round) continue;
      candidates.push({ playerId, sourceInstanceId: instanceId, sourceDefinitionId: definition.linkedSkillId ?? definition.id });
    }
  }
  return candidates;
}

function advanceOrReady(
  state: GameState,
  current: PendingSkillUseReaction,
  definitions: Record<string, CardDefinition>,
): { ready?: PendingSkillUseReaction } {
  current.index += 1;
  while (current.index < current.candidates.length && !sourceStillActive(state, current.candidates[current.index], definitions)) current.index += 1;
  if (current.index >= current.candidates.length) {
    delete state.modeState.pendingSkillUseReaction;
    return { ready: current };
  }
  const candidate = current.candidates[current.index];
  state.pendingDecision = {
    decisionId: `${state.gameInstanceId}:${state.revision}:${current.actorPlayerId}:${current.skillId}:ward:${current.index}:invoke`,
    ownerPlayerId: candidate.playerId,
    chooserPlayerIds: [candidate.playerId],
    kind: "opponent-skill-ward-invoke",
    options: [
      { id: "ask", label: "要求其支付2点魔力，否则此技能不影响你" },
      { id: "skip", label: "不发动" },
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    submissions: {},
  };
  return {};
}

/** Open the generic pre-resolution reaction sequence for skill-use wards. */
export function beginSkillUseReactions(
  state: GameState,
  actorPlayerId: string,
  skillId: string,
  data: unknown,
  definitions: Record<string, CardDefinition>,
): boolean {
  if (pending(state)) throw new Error("SKILL_USE_REACTION_ALREADY_PENDING");
  const candidates = findCandidates(state, actorPlayerId, definitions);
  if (candidates.length === 0) return false;
  const current: PendingSkillUseReaction = { actorPlayerId, skillId, data, candidates, index: 0, temporaryImmunityModifierIds: [] };
  state.modeState.pendingSkillUseReaction = current as unknown as Record<string, unknown>;
  const candidate = candidates[0];
  state.pendingDecision = {
    decisionId: `${state.gameInstanceId}:${state.revision}:${actorPlayerId}:${skillId}:ward:0:invoke`,
    ownerPlayerId: candidate.playerId,
    chooserPlayerIds: [candidate.playerId],
    kind: "opponent-skill-ward-invoke",
    options: [
      { id: "ask", label: "要求其支付2点魔力，否则此技能不影响你" },
      { id: "skip", label: "不发动" },
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    submissions: {},
  };
  return true;
}

export function isSkillUseReactionDecision(decision: PendingDecision): boolean {
  return decision.kind === "opponent-skill-ward-invoke" || decision.kind === "opponent-skill-ward-payment";
}

/** Advance one ward decision. When ready is returned the original skill can finally execute. */
export function resolveSkillUseReactionDecision(
  state: GameState,
  decision: PendingDecision,
  selections: string[],
  definitions: Record<string, CardDefinition>,
): { ready?: PendingSkillUseReaction } {
  const current = pending(state);
  if (!current) throw new Error("SKILL_USE_REACTION_MISSING");
  const candidate = current.candidates[current.index];
  if (!candidate) throw new Error("SKILL_USE_REACTION_CANDIDATE_MISSING");
  // Invocation requires an unused ward.  Once the owner has chosen "ask" the
  // once-per-round marker is deliberately consumed, so the subsequent payment
  // decision only rechecks that the physical passive source still exists.
  if (!sourceStillActive(state, candidate, definitions, decision.kind === "opponent-skill-ward-invoke")) return advanceOrReady(state, current, definitions);

  if (decision.kind === "opponent-skill-ward-invoke") {
    const choice = selections[0];
    if (choice === "skip") return advanceOrReady(state, current, definitions);
    if (choice !== "ask") throw new Error("SKILL_USE_REACTION_CHOICE_INVALID");
    state.players[candidate.playerId].flags[usageFlag(candidate.sourceInstanceId)] = state.round;
    const actor = state.players[current.actorPlayerId];
    if (!actor || actor.eliminated) throw new Error("SKILL_USE_REACTION_ACTOR_INVALID");
    const options = actor.flags.infiniteMana === true || actor.mana >= 2
      ? [{ id: "pay", label: "支付2点魔力" }, { id: "decline", label: "不支付" }]
      : [{ id: "decline", label: "不支付" }];
    state.pendingDecision = {
      decisionId: `${state.gameInstanceId}:${state.revision}:${current.actorPlayerId}:${current.skillId}:ward:${current.index}:payment`,
      ownerPlayerId: current.actorPlayerId,
      chooserPlayerIds: [current.actorPlayerId],
      kind: "opponent-skill-ward-payment",
      options,
      min: 1,
      max: 1,
      allowCancel: false,
      submissions: {},
    };
    return {};
  }

  if (decision.kind !== "opponent-skill-ward-payment") throw new Error("SKILL_USE_REACTION_DECISION_INVALID");
  const choice = selections[0];
  if (choice === "pay") {
    payManaCost(state, state.players[current.actorPlayerId], 2, definitions);
  } else if (choice === "decline") {
    const modifierId = `${candidate.sourceDefinitionId}:ward:${state.round}:${state.revision}:${current.actorPlayerId}`;
    state.activeRuleModifiers.push({
      id: modifierId,
      sourceId: candidate.sourceDefinitionId,
      sourceInstanceId: candidate.sourceInstanceId,
      controllerPlayerId: candidate.playerId,
      operation: "ignore",
      rule: "other_player_ability_effect",
      scope: { subject: "controller", sourcePlayerIds: [current.actorPlayerId], sourceIds: [current.skillId], includeLocationEvents: true },
      duration: "round",
      createdRound: state.round,
    });
    current.temporaryImmunityModifierIds.push(modifierId);
  } else throw new Error("SKILL_USE_REACTION_PAYMENT_INVALID");
  return advanceOrReady(state, current, definitions);
}

export function clearSkillUseReactionImmunity(state: GameState, modifierIds: string[]): void {
  if (modifierIds.length === 0) return;
  const ids = new Set(modifierIds);
  state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => !ids.has(modifier.id));
}

/** Keep temporary ward immunity alive through decisions/continuation frames created by this particular skill use. */
export function armSkillUseReactionImmunityCleanup(state: GameState, reaction: PendingSkillUseReaction): void {
  if (reaction.temporaryImmunityModifierIds.length === 0) return;
  const cleanup: SkillUseReactionCleanup = {
    actorPlayerId: reaction.actorPlayerId,
    skillId: reaction.skillId,
    modifierIds: [...reaction.temporaryImmunityModifierIds],
  };
  state.modeState.skillUseReactionCleanup = cleanup as unknown as Record<string, unknown>;
}

/**
 * Clear the one-use ward once the protected skill has no open decision and no
 * queued continuation frame of its own.  Calling this after every event pump
 * makes the lifecycle robust without teaching EffectRuntime about Bradamante.
 */
export function clearCompletedSkillUseReactionImmunity(state: GameState): void {
  const raw = state.modeState.skillUseReactionCleanup;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const cleanup = raw as unknown as SkillUseReactionCleanup;
  if (!Array.isArray(cleanup.modifierIds) || typeof cleanup.actorPlayerId !== "string" || typeof cleanup.skillId !== "string") {
    delete state.modeState.skillUseReactionCleanup;
    return;
  }
  if (state.pendingDecision) return;
  if (state.effectQueue.some((frame) => frame.controllerPlayerId === cleanup.actorPlayerId && frame.sourceId === cleanup.skillId)) return;
  clearSkillUseReactionImmunity(state, cleanup.modifierIds);
  delete state.modeState.skillUseReactionCleanup;
}

/** Abort cleanup for a skill use that failed after its reaction sequence finished. */
export function abortSkillUseReactionImmunity(state: GameState, reaction: PendingSkillUseReaction): void {
  clearSkillUseReactionImmunity(state, reaction.temporaryImmunityModifierIds);
  delete state.modeState.skillUseReactionCleanup;
}
