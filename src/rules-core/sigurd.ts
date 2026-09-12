import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { gainMana, adjustVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler } from "./skill-types.ts";

export const SIGURD_GRAM_II_ID = "servant.sigurd.skill.sc-sigurd-1";
export const SIGURD_BOLVERK_ID = "servant.sigurd.skill.sc-sigurd-2";
export const SIGURD_RIDILL_ID = "servant.sigurd.skill.sc-sigurd-3";
export const SIGURD_GRAM_II_HANDLER = "core.sigurd-gram-ii";
export const SIGURD_GRAM_II_RESOLVE = "core.sigurd-gram-ii-resolve";
export const SIGURD_BOLVERK_HANDLER = "core.sigurd-bolverk-gram";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function revealedOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  const ids = [...new Set([...player.servantSkills, ...player.attack, ...player.hand])];
  return ids.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.face === "up" && card.zone !== "discard" && card.zone !== "removed"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function syncRidillGrant(
  state: GameState,
  player: PlayerState,
  sourceSkillId: string,
  attribute: "迅捷" | "魔术",
  definitions: Record<string, CardDefinition>,
): void {
  const source = revealedOwnedSkill(state, player, sourceSkillId, definitions);
  if (!source) return;
  const id = `${sourceSkillId}:ridill:${source.instanceId}`;
  if ((player.cardRuleModifiers ?? []).some((modifier) => modifier.id === id)) return;
  addCardRuleModifier(player, {
    id,
    sourceId: sourceSkillId,
    sourceInstanceId: source.instanceId,
    targetDefinitionIds: [SIGURD_RIDILL_ID, `card.skill.${SIGURD_RIDILL_ID}`],
    grantAttributes: [attribute],
    duration: "while-source-present",
  });
}

function applyCurseAtRoundStart(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): { lostVictoryPoints: number } | undefined {
  if (!revealedOwnedSkill(state, player, skillId, definitions)) return;
  const changed = adjustVictoryPoints(player, -1);
  return { lostVictoryPoints: Math.abs(changed) };
}

interface GramCandidate {
  optionId: string;
  playerId: string;
  instanceId: string;
  definitionId: string;
  manaCost: number;
}

function currentFightOpponentIds(state: GameState, player: PlayerState): string[] {
  for (let index = state.eventLog.length - 1; index >= 0; index -= 1) {
    const logged = state.eventLog[index];
    if (logged.type !== "combat.resolved" || !isRecord(logged.payload)) continue;
    const payload = logged.payload;
    if (Number(payload.round ?? -1) !== state.round) continue;
    const participantIds = Array.isArray(payload.participantIds)
      ? payload.participantIds.filter((id): id is string => typeof id === "string")
      : [];
    if (!participantIds.includes(player.id)) continue;
    return participantIds.filter((id) => id !== player.id && !state.players[id]?.eliminated);
  }
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated);
}

function gramCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): GramCandidate[] {
  const opponents = new Set(currentFightOpponentIds(state, player));
  if (opponents.size === 0) return [];
  const candidates: GramCandidate[] = [];
  for (const logged of state.eventLog) {
    if (logged.type !== "card.played" || !isRecord(logged.payload)) continue;
    const payload = logged.payload;
    const playerId = typeof payload.playerId === "string" ? payload.playerId : undefined;
    const instanceId = typeof payload.instanceId === "string" ? payload.instanceId : undefined;
    const definitionId = typeof payload.definitionId === "string" ? payload.definitionId : undefined;
    if (!playerId || !instanceId || !definitionId || !opponents.has(playerId)) continue;
    const card = state.cards[instanceId];
    const definition = definitions[definitionId];
    if (!card || !definition || card.playedRound !== state.round || definition.cardType !== "attack") continue;
    const manaCost = Number(payload.paidMana ?? card.paidCost ?? definition.cost ?? 0);
    if (!Number.isFinite(manaCost) || manaCost < 0) continue;
    candidates.push({ optionId: logged.eventId, playerId, instanceId, definitionId, manaCost });
  }
  return candidates;
}

function openGramChoice(
  state: GameState,
  player: PlayerState,
  candidates: GramCandidate[],
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${SIGURD_GRAM_II_ID}:refund`;
  state.effectQueue.unshift({
    effectId,
    handlerId: SIGURD_GRAM_II_RESOLVE,
    sourceId: SIGURD_GRAM_II_ID,
    controllerPlayerId: player.id,
    payload: { candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "sigurd-gram-ii-refund",
    options: candidates.map((candidate) => ({
      id: candidate.optionId,
      label: `${definitions[candidate.definitionId]?.name ?? candidate.definitionId} (${candidate.manaCost})`,
    })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

export const useSigurdGramII: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("SIGURD_GRAM_II_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "round.started") {
    syncRidillGrant(state, player, skill.id, "魔术", definitions);
    return applyCurseAtRoundStart(state, player, skill.id, definitions);
  }
  if (eventType === "card.played" || eventType === "servant.true-name-revealed") {
    syncRidillGrant(state, player, skill.id, "魔术", definitions);
    return;
  }
  if (eventType !== "combat.ending" || !revealedOwnedSkill(state, player, skill.id, definitions)) return;
  const candidates = gramCandidates(state, player, definitions);
  if (candidates.length === 0) return { gainedMana: 0 };
  if (candidates.length === 1) return { gainedMana: gainMana(player, candidates[0].manaCost), selected: candidates[0] };
  openGramChoice(state, player, candidates, definitions, openDecision);
  return { pending: true, candidateCount: candidates.length };
};

export const resolveSigurdGramII: SkillHandler = ({ player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision) || payload.decision.status !== "resolved") {
    throw new Error("SIGURD_GRAM_II_DECISION_INVALID");
  }
  const candidates = Array.isArray(payload.previous.candidates)
    ? payload.previous.candidates.filter(isRecord).map((candidate) => ({
        optionId: String(candidate.optionId ?? ""),
        playerId: String(candidate.playerId ?? ""),
        instanceId: String(candidate.instanceId ?? ""),
        definitionId: String(candidate.definitionId ?? ""),
        manaCost: Number(candidate.manaCost ?? 0),
      }))
    : [];
  const selections = Array.isArray(payload.decision.selections)
    ? payload.decision.selections.filter((id): id is string => typeof id === "string")
    : [];
  if (selections.length !== 1) throw new Error("SIGURD_GRAM_II_DECISION_INVALID");
  const selected = candidates.find((candidate) => candidate.optionId === selections[0]);
  if (!selected || !Number.isFinite(selected.manaCost) || selected.manaCost < 0) throw new Error("SIGURD_GRAM_II_DECISION_INVALID");
  return { gainedMana: gainMana(player, selected.manaCost), selected };
};

export const useSigurdBolverkGram: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("SIGURD_BOLVERK_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "round.started") {
    syncRidillGrant(state, player, skill.id, "迅捷", definitions);
    return applyCurseAtRoundStart(state, player, skill.id, definitions);
  }
  if (eventType === "card.played" || eventType === "servant.true-name-revealed") {
    syncRidillGrant(state, player, skill.id, "迅捷", definitions);
  }
};
