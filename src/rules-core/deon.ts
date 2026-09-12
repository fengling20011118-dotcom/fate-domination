import type { GameState, PlayerState } from "../domain/state/types.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import { closePlayerCard, movePlayerCard } from "./decks.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const DEON_SWORD_DANCE_ID = "servant.deon.skill.sc-deon-1";
export const DEON_FLEUR_ID = "servant.deon.skill.sc-deon-2";
export const DEON_SELF_SUGGESTION_ID = "servant.deon.skill.sc-deon-3";
export const DEON_SWORD_DANCE_HANDLER = "core.deon-sword-dance";
export const DEON_FLEUR_HANDLER = "core.deon-fleur-de-lys";
export const DEON_PARRY_DISCARD_RESOLVE = "core.deon-parry-discard-resolve";
export const DEON_PARRY_TARGET_RESOLVE = "core.deon-parry-target-resolve";
export const DEON_SELF_SUGGESTION_HANDLER = "core.deon-self-suggestion";
export const DEON_SELF_TARGET_RESOLVE = "core.deon-self-target-resolve";
export const DEON_SELF_CARD_RESOLVE = "core.deon-self-card-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.ownerPlayerId === player.id && card.active && card.face === "up"
      && (card.definitionId === skillId || definition.linkedSkillId === skillId));
  });
}

function engagedOpponents(state: GameState, player: PlayerState): PlayerState[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id)
    .map((id) => state.players[id]).filter((candidate): candidate is PlayerState => Boolean(candidate && !candidate.eliminated));
}

function matchingParryTargets(state: GameState, player: PlayerState, discardedBasePower: number, definitions: Record<string, CardDefinition>): string[] {
  return engagedOpponents(state, player).flatMap((opponent) => opponent.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.active && card.face === "up" && card.playedRound === state.round
      && getPrintedCardBasePower(state, opponent, definition) === discardedBasePower);
  }));
}

function markSuccessfulParry(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  player.flags.deonParryRound = state.round;
  const fleur = activeOwnedSkill(state, player, DEON_FLEUR_ID, definitions);
  if (!fleur) return;
  const id = `${DEON_FLEUR_ID}:parry:${state.round}:${Number(player.flags.deonParryCount ?? 0) + 1}`;
  player.flags.deonParryCount = Number(player.flags.deonParryRound === state.round ? player.flags.deonParryCount ?? 0 : 0) + 1;
  fleur.powerModifiers = [...(fleur.powerModifiers ?? []), { id, sourceId: DEON_FLEUR_ID, kind: "add", value: 3, duration: "round" }];
}

/** Sword Dance/Riposte: +4 while used; if no Parry resolves this round it closes after d'Eon's Combat turn. */
export const useDeonSwordDance: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("DEON_SWORD_DANCE_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "phase.player-window.closed") {
    const event = isRecord(data.event) ? data.event : {};
    if (event.playerId !== player.id || event.phase !== "combat" || Number(player.flags.deonRiposteRound ?? -1) !== state.round) return;
    if (Number(player.flags.deonParryRound ?? -1) !== state.round) {
      const source = activeOwnedSkill(state, player, skill.id, definitions);
      if (source) closePlayerCard(state, player.id, source.instanceId, definitions);
    }
    delete player.flags.deonRiposteRound;
    return;
  }
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("DEON_SWORD_DANCE_WINDOW_INVALID");
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("DEON_SWORD_DANCE_SOURCE_INACTIVE");
  const modifierId = `${skill.id}:riposte:${state.round}`;
  source.powerModifiers = [...(source.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
    { id: modifierId, sourceId: skill.id, kind: "add", value: 4, duration: "round" }];
  player.flags.deonRiposteRound = state.round;
  return { powerBonus: 4 };
};

/** Fleur de Lys Parry. Base Parry is always available; the two extra ability ids require Fleur to be active. */
export const useDeonFleur: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("DEON_PARRY_WINDOW_INVALID");
  const data = isRecord(payload) ? payload : {};
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : "parry";
  if ((abilityId === "parry-extra-1" || abilityId === "parry-extra-2") && !activeOwnedSkill(state, player, skill.id, definitions)) {
    throw new Error("DEON_EXTRA_PARRY_REQUIRES_FLEUR");
  }
  if (player.hand.length === 0) throw new Error("DEON_PARRY_HAND_REQUIRED");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:${abilityId}:discard`;
  state.effectQueue.unshift({ effectId, handlerId: DEON_PARRY_DISCARD_RESOLVE, sourceId: skill.id, controllerPlayerId: player.id,
    payload: { abilityId, candidates: [...player.hand] }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "deon-parry-discard",
    options: player.hand.map((instanceId) => ({ instanceId, id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
};

export const resolveDeonParryDiscard: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("DEON_PARRY_DECISION_INVALID");
  const previous = payload.previous; const decision = payload.decision;
  const choices = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || choices.length !== 1 || !candidates.includes(choices[0]) || !player.hand.includes(choices[0])) throw new Error("DEON_PARRY_DISCARD_INVALID");
  const discarded = state.cards[choices[0]]; const discardedDefinition = definitions[discarded.definitionId];
  if (!discardedDefinition) throw new Error("DEON_PARRY_DISCARD_DEFINITION_MISSING");
  const basePower = getPrintedCardBasePower(state, player, discardedDefinition);
  movePlayerCard(state, player.id, discarded.instanceId, "discard");
  const targets = matchingParryTargets(state, player, basePower, definitions);
  if (targets.length === 0) return { discardedInstanceId: discarded.instanceId, closedInstanceId: null, basePower };
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:target`;
  state.effectQueue.unshift({ effectId, handlerId: DEON_PARRY_TARGET_RESOLVE, sourceId: skill.id, controllerPlayerId: player.id,
    payload: { targets, discardedInstanceId: discarded.instanceId, basePower }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "deon-parry-target",
    options: targets.map((id) => ({ id, label: definitions[state.cards[id]?.definitionId ?? ""]?.name ?? id })), min: 1, max: 1, allowCancel: false,
    continuationEffectId: effectId, submissions: {} });
};

export const resolveDeonParryTarget: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("DEON_PARRY_TARGET_INVALID");
  const previous = payload.previous; const decision = payload.decision;
  const targets = Array.isArray(previous.targets) ? previous.targets.filter((id): id is string => typeof id === "string") : [];
  const choices = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || choices.length !== 1 || !targets.includes(choices[0])) throw new Error("DEON_PARRY_TARGET_INVALID");
  const target = state.cards[choices[0]]; const targetPlayer = target?.controllerPlayerId ? state.players[target.controllerPlayerId] : undefined;
  if (!target || !targetPlayer || !target.active || target.zone !== "attack") throw new Error("DEON_PARRY_TARGET_STALE");
  closePlayerCard(state, targetPlayer.id, target.instanceId, definitions, { closedByPlayerId: player.id });
  markSuccessfulParry(state, player, definitions);
  return { discardedInstanceId: previous.discardedInstanceId, closedInstanceId: target.instanceId };
};

/** Self-Suggestion also installs the uncopyable/unlosable gender flexibility marker at game start. */
export const useDeonSelfSuggestion: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "game.started") {
    player.flags.servantGenderRule = "male-or-female";
    return;
  }
  if (!definitions || state.phase !== "action" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, skill.id, definitions)) {
    throw new Error("DEON_SELF_SUGGESTION_WINDOW_INVALID");
  }
  const candidates = engagedOpponents(state, player).filter((candidate) => candidate.hand.length > 0);
  if (candidates.length === 0) throw new Error("DEON_SELF_SUGGESTION_TARGET_REQUIRED");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:player`;
  state.effectQueue.unshift({ effectId, handlerId: DEON_SELF_TARGET_RESOLVE, sourceId: skill.id, controllerPlayerId: player.id,
    payload: { candidates: candidates.map((p) => p.id) }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "deon-self-suggestion-player",
    options: candidates.map((candidate) => ({ id: candidate.id, label: candidate.name })), min: 1, max: 1, allowCancel: false,
    continuationEffectId: effectId, submissions: {} });
};

export const resolveDeonSelfTarget: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("DEON_SELF_SUGGESTION_DECISION_INVALID");
  const previous = payload.previous; const decision = payload.decision;
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const choices = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || choices.length !== 1 || !candidates.includes(choices[0])) throw new Error("DEON_SELF_SUGGESTION_TARGET_INVALID");
  const target = state.players[choices[0]];
  if (!target || target.hand.length === 0) throw new Error("DEON_SELF_SUGGESTION_HAND_EMPTY");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:card`;
  state.effectQueue.unshift({ effectId, handlerId: DEON_SELF_CARD_RESOLVE, sourceId: skill.id, controllerPlayerId: player.id,
    payload: { targetPlayerId: target.id, candidates: [...target.hand] }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "deon-self-suggestion-card",
    options: target.hand.map((id) => ({ id, label: definitions[state.cards[id]?.definitionId ?? ""]?.name ?? id })), min: 1, max: 1, allowCancel: false,
    continuationEffectId: effectId, submissions: {} });
};

export const resolveDeonSelfCard: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("DEON_SELF_SUGGESTION_CARD_INVALID");
  const previous = payload.previous; const decision = payload.decision;
  const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
  const target = targetPlayerId ? state.players[targetPlayerId] : undefined;
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const choices = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (!target || decision.status !== "resolved" || choices.length !== 1 || !candidates.includes(choices[0]) || !target.hand.includes(choices[0])) throw new Error("DEON_SELF_SUGGESTION_CARD_INVALID");
  const card = state.cards[choices[0]]; const definition = definitions[card.definitionId];
  if (!definition) throw new Error("DEON_SELF_SUGGESTION_DEFINITION_MISSING");
  const power = getPrintedCardBasePower(state, target, definition);
  movePlayerCard(state, target.id, card.instanceId, "discard");
  player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + power;
  return { targetPlayerId: target.id, discardedInstanceId: card.instanceId, powerBonus: power };
};

export const isDeonSwordDanceLegal: SkillLegalityPredicate = (state, playerId, skill, _ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && state.phase === "action" && state.activePlayerId === playerId && activeOwnedSkill(state, player, skill.id, definitions));
};
export const isDeonFleurLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.phase !== "combat" || state.activePlayerId !== playerId || player.hand.length === 0) return false;
  return ability?.id === "parry" || Boolean(activeOwnedSkill(state, player, skill.id, definitions));
};
export const isDeonSelfSuggestionLegal: SkillLegalityPredicate = (state, playerId, skill, _ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions) && engagedOpponents(state, player).some((candidate) => candidate.hand.length > 0));
};
