import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { expandChineseLostbelt } from "./china-lostbelt.ts";
import { applyTemporaryCardDefinitionById, createOwnedCardInstance, movePlayerCard, removePhysicalCardFromGame, restoreTemporaryCardDefinitionCopy } from "./decks.ts";
import { getNpcCombatant, gainNpcVictoryPoints, npcPresenceLocations } from "./npc-combatants.ts";
import { payManaCost } from "./costs.ts";
import { gainVictoryPoints } from "./resources.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const HINAKO_HANDLER = "core.hinako-package";
export const HINAKO_RESOLVE = "core.hinako-package-resolve";
export const HINAKO_DEATH_WISH_COMPAT_HANDLER = "core.hinako-death-wish";
export const HINAKO_BLOOD_SONG_COMPAT_HANDLER = "core.hinako-blood-song";

export const HINAKO_ROGUE_ID = "master.hinako.skill.s1";
export const HINAKO_DEATH_WISH_ID = "master.hinako.skill.s1a";
export const HINAKO_ETERNAL_ID = "master.hinako.skill.s2";
export const HINAKO_QIN_ID = "master.hinako.skill.s3";
export const HINAKO_CHINA_ID = "master.hinako.skill.s4";
export const HINAKO_ASCENSION_ID = "master.hinako.skill.ascension";
export const HINAKO_TRUE_ANCESTOR_COPY_ABILITY = "true-ancestor-copy";
export const HINAKO_BLOOD_SONG_ABILITY = "eternal-lament-combat";
export const QIN_SHI_HUANG_NPC_ID = "npc.qin-shi-huang";
export const SHAKESPEARE_SERVANT_ID = "servant.shakespeare";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ownedEternalCards(state: GameState, player: PlayerState): CardInstance[] {
  return Object.values(state.cards).filter((card) => card.ownerPlayerId === player.id && card.definitionId === HINAKO_ETERNAL_ID);
}

function ensureEternalLament(state: GameState, player: PlayerState, sourceId: string): CardInstance {
  const existing = ownedEternalCards(state, player)
    .sort((a, b) => Number(a.zone === "master-skills" ? 0 : a.zone === "removed" ? 2 : 1) - Number(b.zone === "master-skills" ? 0 : b.zone === "removed" ? 2 : 1))[0];
  if (existing) {
    if (existing.zone !== "master-skills") movePlayerCard(state, player.id, existing.instanceId, "master-skills");
    existing.face = "up";
    existing.active = false;
    existing.residual = false;
    return existing;
  }
  const serial = Object.values(state.cards).filter((card) => card.ownerPlayerId === player.id && card.createdByEffectId === sourceId).length + 1;
  return createOwnedCardInstance(state, player.id, {
    instanceId: `${player.id}:hinako:eternal-lament:${serial}`,
    definitionId: HINAKO_ETERNAL_ID,
    originMasterId: "master.hinako",
    zone: "master-skills",
    face: "up",
    active: false,
    createdByEffectId: sourceId,
  });
}

function useDeathWish(state: GameState, player: PlayerState, sourceId: string, payload: unknown): CardInstance | undefined {
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  // Compatibility path used by older focused tests/definitions.
  const targetDefinitionId = typeof data.targetDefinitionId === "string" ? data.targetDefinitionId : HINAKO_ETERNAL_ID;
  if (targetDefinitionId !== HINAKO_ETERNAL_ID) throw new Error("HINAKO_DEATH_WISH_TARGET_INVALID");
  if (!eventType || eventType === "game.started") return ensureEternalLament(state, player, sourceId);
  if (eventType !== "combat.resolved") return;
  const participants = Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : [];
  const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  if (!participants.includes(player.id) || winners.includes(player.id)) return;
  return ensureEternalLament(state, player, sourceId);
}

function eternalSourceActive(state: GameState, player: PlayerState): CardInstance | undefined {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => card?.definitionId === HINAKO_ETERNAL_ID && card.active && card.face === "up");
}

function useBloodSong(state: GameState, player: PlayerState, sourceId: string): number {
  if (state.phase !== "combat") throw new Error("HINAKO_BLOOD_SONG_PHASE_INVALID");
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("HINAKO_BLOOD_SONG_NOT_IN_BATTLE");
  let targetCount = 0;
  for (const opponentId of state.board.locations[locationId] ?? []) {
    if (opponentId === player.id || state.players[opponentId]?.eliminated) continue;
    for (const instanceId of state.players[opponentId].attack) {
      const instance = state.cards[instanceId];
      if (!instance?.active || instance.face !== "up") continue;
      const modifierId = `${sourceId}:eternal-lament:${instance.instanceId}:${state.round}`;
      instance.powerModifiers = [
        ...(instance.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
        { id: modifierId, sourceId, kind: "add", value: -2, duration: "round" },
      ];
      targetCount += 1;
    }
  }
  if (targetCount === 0) throw new Error("HINAKO_BLOOD_SONG_NO_TARGET");
  return targetCount;
}

function basicCopyCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.basic === true && card.active && card.face === "up" && card.controllerPlayerId === player.id);
  });
}

function applyTrueAncestorCopies(
  state: GameState,
  player: PlayerState,
  selectedInstanceIds: readonly string[],
  definitions: Record<string, CardDefinition>,
): { selectedInstanceIds: string[]; paidMana: number } {
  if (selectedInstanceIds.length < 1 || new Set(selectedInstanceIds).size !== selectedInstanceIds.length) throw new Error("HINAKO_TRUE_ANCESTOR_SELECTION_INVALID");
  const candidates = new Set(basicCopyCandidates(state, player, definitions));
  if (selectedInstanceIds.some((instanceId) => !candidates.has(instanceId))) throw new Error("HINAKO_TRUE_ANCESTOR_SELECTION_INVALID");
  const paidMana = selectedInstanceIds.length * 4;
  payManaCost(state, player, paidMana, definitions);
  for (const instanceId of selectedInstanceIds) {
    applyTemporaryCardDefinitionById(state, instanceId, HINAKO_ETERNAL_ID, definitions, {
      sourceId: HINAKO_ASCENSION_ID,
      expiresRound: state.round,
      rebindNamedOwnerToController: true,
    });
  }
  return { selectedInstanceIds: [...selectedInstanceIds], paidMana };
}

function openTrueAncestorChoice(context: SkillContext, candidates: string[]): { pending: true } {
  const { state, player, openDecision } = context;
  const max = Math.min(candidates.length, Math.floor(player.mana / 4));
  if (max < 1) throw new Error("HINAKO_TRUE_ANCESTOR_COST_UNAVAILABLE");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${HINAKO_ASCENSION_ID}:copy`;
  state.effectQueue.unshift({
    effectId,
    handlerId: HINAKO_RESOLVE,
    sourceId: HINAKO_ASCENSION_ID,
    controllerPlayerId: player.id,
    payload: { stage: "true-ancestor-copy", candidateIds: [...candidates], max },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "hinako-true-ancestor-copy",
    options: candidates.map((id) => ({ id, label: id })),
    min: 1,
    max,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true };
}

function activateTrueAncestor(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): { removedShakespeareSkillIds: string[]; eternalLamentInstanceId: string } {
  const removedShakespeareSkillIds: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (card.ownerPlayerId !== player.id || card.zone === "removed") continue;
    const definition = definitions[card.definitionId];
    if (card.originServantId !== SHAKESPEARE_SERVANT_ID && definition?.ownerDefinitionId !== SHAKESPEARE_SERVANT_ID) continue;
    if (definition?.isSkill !== true && card.zone !== "servant-skills") continue;
    removePhysicalCardFromGame(state, card.instanceId);
    removedShakespeareSkillIds.push(card.instanceId);
  }
  player.servantId = null;
  player.flags.hinakoTrueAncestor = true;
  const eternal = ensureEternalLament(state, player, HINAKO_ASCENSION_ID);
  eternal.usageLimitOverride = "unlimited";
  return { removedShakespeareSkillIds, eternalLamentInstanceId: eternal.instanceId };
}

function restoreTrueAncestorCopies(state: GameState, player: PlayerState): string[] {
  const restored: string[] = [];
  for (const card of Object.values(state.cards)) {
    if (card.ownerPlayerId !== player.id || card.temporaryDefinitionCopy?.sourceId !== HINAKO_ASCENSION_ID) continue;
    if (restoreTemporaryCardDefinitionCopy(card)) restored.push(card.instanceId);
  }
  return restored;
}

export const useHinakoPackage: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions, randomInt } = context;
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;

  if (skill.id === HINAKO_ROGUE_ID || skill.id === HINAKO_CHINA_ID) return;
  if (skill.id === HINAKO_DEATH_WISH_ID) return useDeathWish(state, player, skill.id, payload);

  if (skill.id === HINAKO_ETERNAL_ID) {
    if (abilityId === HINAKO_TRUE_ANCESTOR_COPY_ABILITY) {
      if (!definitions || player.flags.hinakoTrueAncestor !== true || state.phase !== "action" || state.activePlayerId !== player.id || !eternalSourceActive(state, player)) {
        throw new Error("HINAKO_TRUE_ANCESTOR_ABILITY_FORBIDDEN");
      }
      const candidates = basicCopyCandidates(state, player, definitions);
      const supplied = Array.isArray(data.instanceIds) ? data.instanceIds.filter((id): id is string => typeof id === "string") : [];
      if (supplied.length > 0) return applyTrueAncestorCopies(state, player, supplied, definitions);
      return openTrueAncestorChoice(context, candidates);
    }
    return useBloodSong(state, player, skill.id);
  }

  if (skill.id === HINAKO_QIN_ID) {
    if (!definitions) throw new Error("HINAKO_QIN_DEFINITIONS_REQUIRED");
    if (eventType === "combat.resolved") {
      const npcParticipants = Array.isArray(event.npcParticipantIds) ? event.npcParticipantIds.filter((id): id is string => typeof id === "string") : [];
      const npcWinners = Array.isArray(event.npcWinnerIds) ? event.npcWinnerIds.filter((id): id is string => typeof id === "string") : [];
      if (npcParticipants.includes(QIN_SHI_HUANG_NPC_ID)) player.flags.hinakoQinParticipatedCombatRound = state.round;
      if (!npcWinners.includes(QIN_SHI_HUANG_NPC_ID)) return;
      const gainedVictoryPoints = gainVictoryPoints(player, 3);
      if (!randomInt) throw new Error("HINAKO_QIN_RANDOM_REQUIRED");
      const expandedEventIds = expandChineseLostbelt(state, randomInt, 1);
      return { gainedVictoryPoints, expandedEventIds };
    }
    if (eventType === "combat.ending") {
      if (Number(player.flags.hinakoQinNoLocationRewardRound ?? -1) === state.round) return;
      const npc = getNpcCombatant(state, QIN_SHI_HUANG_NPC_ID);
      if (!npc || npc.eliminated || Number(player.flags.hinakoQinParticipatedCombatRound ?? -1) === state.round) return;
      if (npcPresenceLocations(state, QIN_SHI_HUANG_NPC_ID, definitions).length > 0) return;
      player.flags.hinakoQinNoLocationRewardRound = state.round;
      return { gainedNpcVictoryPoints: gainNpcVictoryPoints(state, QIN_SHI_HUANG_NPC_ID, 2) };
    }
    return;
  }

  if (skill.id === HINAKO_ASCENSION_ID) {
    if (!definitions) throw new Error("HINAKO_ASCENSION_DEFINITIONS_REQUIRED");
    if (eventType === "skill.unlocked") {
      if (event.playerId !== player.id || event.skillId !== skill.id) return;
      return activateTrueAncestor(state, player, definitions);
    }
    if (eventType === "combat.ending") return { restoredInstanceIds: restoreTrueAncestorCopies(state, player) };
    return;
  }

  throw new Error("HINAKO_SKILL_INVALID");
};

export const resolveHinakoDecision: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("HINAKO_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  if (previous.stage !== "true-ancestor-copy" || decision.status !== "resolved") throw new Error("HINAKO_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidateIds) ? previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const max = Number(previous.max);
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (!Number.isInteger(max) || max < 1 || selections.length < 1 || selections.length > max || selections.some((id) => !candidates.includes(id))) throw new Error("HINAKO_DECISION_INVALID");
  return applyTrueAncestorCopies(state, player, selections, definitions);
};

export const isHinakoPackageLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player) return false;
  if (skill.id === HINAKO_ETERNAL_ID && ability?.id === HINAKO_TRUE_ANCESTOR_COPY_ABILITY) {
    return Boolean(definitions && player.flags.hinakoTrueAncestor === true && state.phase === "action" && state.activePlayerId === playerId
      && eternalSourceActive(state, player) && player.mana >= 4 && basicCopyCandidates(state, player, definitions).length > 0);
  }
  if (skill.id === HINAKO_ETERNAL_ID) {
    if (state.phase !== "combat" || !eternalSourceActive(state, player)) return false;
    const locationId = player.locationId;
    return Boolean((locationId === "mountain" || locationId === "city") && (state.board.locations[locationId] ?? []).some((opponentId) => opponentId !== playerId
      && !state.players[opponentId]?.eliminated && state.players[opponentId].attack.some((instanceId) => {
        const instance = state.cards[instanceId];
        return Boolean(instance?.active && instance.face === "up");
      })));
  }
  return false;
};

/** Compatibility handler for the already-FULL Death Wish definition and focused legacy tests. */
export const useHinakoDeathWishCompat: SkillHandler = ({ state, player, skill, payload }) => useDeathWish(state, player, skill.id, payload);

/** Compatibility handler for the already-FULL Eternal Lament definition and focused legacy tests. */
export const useHinakoBloodSongCompat: SkillHandler = ({ state, player, skill }) => useBloodSong(state, player, skill.id);

export const isHinakoBloodSongCompatLegal: SkillLegalityPredicate = (state, playerId) => {
  const player = state.players[playerId];
  if (!player || (player.locationId !== "mountain" && player.locationId !== "city")) return false;
  return (state.board.locations[player.locationId] ?? []).some((opponentId) => opponentId !== playerId
    && !state.players[opponentId]?.eliminated && state.players[opponentId].attack.some((instanceId) => {
      const instance = state.cards[instanceId];
      return Boolean(instance?.active && instance.face === "up");
    }));
};
