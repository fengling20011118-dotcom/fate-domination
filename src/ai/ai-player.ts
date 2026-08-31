import type { GameCommand } from "../match-engine/commands.ts";
import { CommandType } from "../match-engine/commands.ts";
import type { GameAction, GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { projectPublicState, type PublicGameState } from "../projection/project-state.ts";

/**
 * The AI sees the same public snapshot as a human plus its own private zones.
 * No opponent hand, deck order, hidden identity, or RNG state is exposed here.
 */
export interface AiPlayerView {
  playerId: string;
  publicState: PublicGameState;
  self: Pick<PlayerState, "id" | "name" | "masterId" | "servantId" | "trueNameRevealed" | "locationId" | "mana" | "victoryPoints" | "commandSeals" | "hand" | "deck" | "discard" | "attack" | "masterSkills" | "servantSkills" | "statuses" | "usage" | "flags">;
}

export type AiIntent =
  | { kind: "complete-window" }
  | { kind: "use-skill"; skillId: string; data?: unknown }
  | { kind: "resolve-decision"; decisionId: string; selections: string[] }
  | { kind: "cancel-decision"; decisionId: string }
  | { kind: "deploy"; locationId: "workshop" | "mountain" | "city" }
  | { kind: "move"; locationId: string; ignoreEngagement?: boolean }
  | { kind: "commit-attack"; faceUpInstanceIds: string[]; faceDownInstanceIds: string[] };

export interface AiPolicyContext {
  view: AiPlayerView;
  legalActions: GameAction[];
  pendingDecision: PendingDecision | null;
}

export interface AiPolicy {
  choose(context: AiPolicyContext): AiIntent | null;
}

export interface AiCommandMeta {
  commandId: string;
  expectedRevision: number;
}

/** Builds an AI view without exposing authority-only state. */
export function projectAiState(state: GameState, playerId: string): AiPlayerView {
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("AI_PLAYER_NOT_AVAILABLE");
  const {
    id, name, masterId, servantId, trueNameRevealed, locationId, mana, victoryPoints,
    commandSeals, hand, deck, discard, attack, masterSkills, servantSkills, statuses, usage, flags,
  } = structuredClone(player);
  return {
    playerId,
    publicState: projectPublicState(state, playerId),
    self: { id, name, masterId, servantId, trueNameRevealed, locationId, mana, victoryPoints, commandSeals, hand, deck, discard, attack, masterSkills, servantSkills, statuses, usage, flags },
  };
}

/** Converts an intent into the normal authoritative command envelope. */
export function buildAiCommand(state: GameState, playerId: string, intent: AiIntent, meta: AiCommandMeta): GameCommand {
  const base = { commandId: meta.commandId, gameInstanceId: state.gameInstanceId, actorId: playerId, expectedRevision: meta.expectedRevision };
  switch (intent.kind) {
    case "complete-window": return { ...base, type: CommandType.CompletePlayerWindow, payload: {} };
    case "use-skill": return { ...base, type: CommandType.UseSkill, payload: { skillId: intent.skillId, ...(intent.data === undefined ? {} : { data: intent.data }) } };
    case "resolve-decision": return { ...base, type: CommandType.ResolveDecision, payload: { decisionId: intent.decisionId, selections: [...intent.selections] } };
    case "cancel-decision": return { ...base, type: CommandType.CancelDecision, payload: { decisionId: intent.decisionId } };
    case "deploy": return { ...base, type: CommandType.DeployPlayer, payload: { locationId: intent.locationId } };
    case "move": return { ...base, type: CommandType.MovePlayer, payload: { locationId: intent.locationId, ignoreEngagement: intent.ignoreEngagement ?? false } };
    case "commit-attack": return { ...base, type: CommandType.CommitAttack, payload: { faceUpInstanceIds: [...intent.faceUpInstanceIds], faceDownInstanceIds: [...intent.faceDownInstanceIds] } };
  }
}

/**
 * A conservative deterministic policy. It only selects explicitly legal skill
 * actions or the first enabled decision option; otherwise it closes the current
 * player window. It never guesses a card, target, or hidden rule.
 */
export const conservativeAiPolicy: AiPolicy = Object.freeze({
  choose({ view, legalActions, pendingDecision }) {
    if (pendingDecision) {
      if (!pendingDecision.chooserPlayerIds.includes(view.playerId)) return null;
      const submitted = pendingDecision.submissions[view.playerId];
      if (submitted) return null;
      const option = pendingDecision.options.find((candidate) => !candidate.disabled);
      if (option && pendingDecision.min <= 1) return { kind: "resolve-decision", decisionId: pendingDecision.decisionId, selections: [option.id] };
      if (pendingDecision.allowCancel) return { kind: "cancel-decision", decisionId: pendingDecision.decisionId };
      return null;
    }
    const skillAction = legalActions.find((action) => action.type === "skill.use");
    if (skillAction && isRecord(skillAction.payload) && typeof skillAction.payload.skillId === "string") {
      return { kind: "use-skill", skillId: skillAction.payload.skillId, data: skillAction.payload.data };
    }
    return { kind: "complete-window" };
  },
});

export function planAiCommand(
  state: GameState,
  playerId: string,
  legalActions: GameAction[],
  meta: AiCommandMeta,
  policy: AiPolicy = conservativeAiPolicy,
): GameCommand | null {
  const view = projectAiState(state, playerId);
  const intent = policy.choose({ view, legalActions: structuredClone(legalActions), pendingDecision: structuredClone(state.pendingDecision) });
  return intent ? buildAiCommand(state, playerId, intent, meta) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
