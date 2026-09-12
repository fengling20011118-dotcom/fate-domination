import type { GameState, PlayerState } from "../domain/state/types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { addCardToAttack, playBorrowedCardToAttack, playCardFaceDownByEffect } from "./card-play.ts";
import { assertCardCanEnterAttack } from "./card-rules.ts";
import { getActiveCombatCardIds } from "./combat-power.ts";
import type { CardDefinition } from "./content-types.ts";
import { isOuterGodLifeDefinitionId } from "./clytie.ts";
import { createDerivedCardInstance } from "./decks.ts";
import { gainVictoryPoints, transferVictoryPoints } from "./resources.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const VOYAGER_HOPE_ID = "servant.voyager.skill.sc-voyager-1";
export const VOYAGER_PEACE_ID = "servant.voyager.skill.sc-voyager-2";
export const VOYAGER_PALE_BLUE_DOT_ID = "servant.voyager.skill.sc-voyager-3";
export const VOYAGER_FOREIGNER_CLASS_ID = "servant.voyager.skill.sc-voyager-4";

export const VOYAGER_HOPE_HANDLER = "core.voyager-message-hope";
export const VOYAGER_HOPE_RESOLVE = "core.voyager-message-hope-resolve";
export const VOYAGER_PEACE_HANDLER = "core.voyager-message-peace";
export const VOYAGER_PEACE_RESOLVE = "core.voyager-message-peace-resolve";
export const VOYAGER_PALE_BLUE_DOT_HANDLER = "core.voyager-pale-blue-dot";
export const VOYAGER_PALE_BLUE_DOT_RESOLVE = "core.voyager-pale-blue-dot-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function ownedLiveSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return Boolean(card.ownerPlayerId === player.id && card.zone !== "removed" && card.zone !== "discard"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.face === "up" && card.active
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function alivePlayerIds(state: GameState): string[] {
  return state.turnOrder.filter((playerId) => Boolean(state.players[playerId] && !state.players[playerId].eliminated));
}

function handOuterLifeIds(state: GameState, player: PlayerState): string[] {
  return player.hand.filter((instanceId) => isOuterGodLifeDefinitionId(state.cards[instanceId]?.definitionId));
}

function nextOutsideClassId(state: GameState, targetPlayerId: string, sourcePlayerId: string): string {
  const prefix = `${targetPlayerId}:voyager-foreigner:${sourcePlayerId}:`;
  return `${prefix}${Object.keys(state.cards).filter((instanceId) => instanceId.startsWith(prefix)).length + 1}`;
}

function createOutsideVoyagerClass(
  state: GameState,
  sourcePlayerId: string,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent?: SkillContext["emitEvent"],
): string {
  if (!definitions[VOYAGER_FOREIGNER_CLASS_ID]) throw new Error("VOYAGER_FOREIGNER_CLASS_DEFINITION_MISSING");
  const target = state.players[targetPlayerId];
  if (!target || target.eliminated) throw new Error("VOYAGER_FOREIGNER_CLASS_TARGET_INVALID");
  const instanceId = nextOutsideClassId(state, targetPlayerId, sourcePlayerId);
  createDerivedCardInstance(state, targetPlayerId, {
    instanceId,
    definitionId: VOYAGER_FOREIGNER_CLASS_ID,
    zone: "hand",
    face: "down",
    active: false,
    residual: false,
    sourceEffectId: `${VOYAGER_HOPE_ID}:voices-of-stars`,
    createdByPlayerId: sourcePlayerId,
  });
  emitEvent?.("card.created", {
    playerId: targetPlayerId,
    ownerPlayerId: targetPlayerId,
    instanceId,
    definitionId: VOYAGER_FOREIGNER_CLASS_ID,
    zone: "hand",
    sourceSkillId: VOYAGER_HOPE_ID,
    source: "outside-game",
  });
  return instanceId;
}

function openHopeRevealDecision(
  state: GameState,
  player: PlayerState,
  chooserPlayerIds: string[],
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${VOYAGER_HOPE_ID}:reveal`;
  state.effectQueue.unshift({
    effectId,
    handlerId: VOYAGER_HOPE_RESOLVE,
    sourceId: VOYAGER_HOPE_ID,
    controllerPlayerId: player.id,
    payload: { chooserPlayerIds },
    createdAtRevision: state.revision,
  });
  const options = chooserPlayerIds.flatMap((chooserId) => [
    { id: `skip:${chooserId}`, label: "不展示", chooserPlayerIds: [chooserId] },
    ...handOuterLifeIds(state, state.players[chooserId]).map((instanceId) => ({
      id: instanceId,
      label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId,
      chooserPlayerIds: [chooserId],
    })),
  ]);
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds,
    kind: "voyager-message-hope-reveal",
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

/** Message of Hope: global scouting trigger plus simultaneous optional Foreigner-Class reveal. */
export const useVoyagerMessageHope: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload)) throw new Error("VOYAGER_HOPE_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "player.entered-location") {
    const event = isRecord(payload.event) ? payload.event : {};
    const targetPlayerId = typeof event.playerId === "string" ? event.playerId : undefined;
    if (event.locationId !== "scouting" || !targetPlayerId || !ownedLiveSkill(state, player, skill.id, definitions)) return;
    return {
      targetPlayerId,
      createdInstanceIds: [
        createOutsideVoyagerClass(state, player.id, targetPlayerId, definitions, emitEvent),
        createOutsideVoyagerClass(state, player.id, targetPlayerId, definitions, emitEvent),
      ],
    };
  }
  if (payload.abilityId !== "hope-reveal" || state.phase !== "action" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("VOYAGER_HOPE_WINDOW_INVALID");
  const chooserPlayerIds = alivePlayerIds(state);
  if (chooserPlayerIds.length === 0) return { pending: false, chooserPlayerIds: [] };
  openHopeRevealDecision(state, player, chooserPlayerIds, definitions, openDecision);
  return { pending: true, chooserPlayerIds };
};

export const resolveVoyagerMessageHope: SkillHandler = ({ state, player, payload, emitEvent }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("VOYAGER_HOPE_DECISION_INVALID");
  const chooserPlayerIds = Array.isArray(payload.previous.chooserPlayerIds)
    ? payload.previous.chooserPlayerIds.filter((value): value is string => typeof value === "string")
    : [];
  const submissions = payload.decision.submissions;
  if (payload.decision.status !== "resolved" || !isRecord(submissions)) throw new Error("VOYAGER_HOPE_DECISION_INVALID");
  const revealed: Array<{ playerId: string; instanceId: string; victoryPointsGained: number }> = [];
  for (const chooserId of chooserPlayerIds) {
    const chooser = state.players[chooserId];
    if (!chooser || chooser.eliminated) continue;
    const submitted = submissions[chooserId];
    if (!Array.isArray(submitted) || submitted.length !== 1 || typeof submitted[0] !== "string") throw new Error("VOYAGER_HOPE_DECISION_INVALID");
    const selection = submitted[0];
    if (selection === `skip:${chooserId}`) continue;
    if (!handOuterLifeIds(state, chooser).includes(selection)) throw new Error("VOYAGER_HOPE_REVEAL_CARD_INVALID");
    const card = state.cards[selection];
    emitEvent?.("card.revealed", { playerId: chooserId, instanceId: selection, definitionId: card.definitionId, sourceSkillId: VOYAGER_HOPE_ID });
    revealed.push({ playerId: chooserId, instanceId: selection, victoryPointsGained: gainVictoryPoints(chooser, 2) });
  }
  return { revealed };
};

export const isVoyagerMessageHopeLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "hope-reveal" && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions));
};

function faceDownHandIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, excluded = new Set<string>()): string[] {
  return player.hand.filter((instanceId) => {
    if (excluded.has(instanceId)) return false;
    try {
      assertCardCanEnterAttack({
        state,
        playerId: player.id,
        instanceId,
        definitions,
        faceDown: true,
        allowedSourceZones: ["hand"],
        bypassTiming: true,
      });
      return true;
    } catch {
      return false;
    }
  });
}

function openPeaceDecision(
  state: GameState,
  player: PlayerState,
  stage: "foreigner" | "face-down",
  previous: Record<string, unknown>,
  candidates: string[],
  max: number,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${VOYAGER_PEACE_ID}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: VOYAGER_PEACE_RESOLVE,
    sourceId: VOYAGER_PEACE_ID,
    controllerPlayerId: player.id,
    payload: { stage, ...previous, candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `voyager-message-peace-${stage}`,
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 0,
    max: Math.min(max, candidates.length),
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function applyPeaceAction(
  state: GameState,
  player: PlayerState,
  foreignerInstanceIds: string[],
  faceDownInstanceIds: string[],
  definitions: Record<string, CardDefinition>,
  emitEvent?: SkillContext["emitEvent"],
) {
  if (foreignerInstanceIds.length > 2 || faceDownInstanceIds.length > 2 || new Set([...foreignerInstanceIds, ...faceDownInstanceIds]).size !== foreignerInstanceIds.length + faceDownInstanceIds.length) {
    throw new Error("VOYAGER_PEACE_SELECTION_INVALID");
  }
  if (foreignerInstanceIds.some((instanceId) => !handOuterLifeIds(state, player).includes(instanceId))) throw new Error("VOYAGER_PEACE_FOREIGNER_INVALID");
  const excluded = new Set(foreignerInstanceIds);
  if (faceDownInstanceIds.some((instanceId) => !faceDownHandIds(state, player, definitions, excluded).includes(instanceId))) throw new Error("VOYAGER_PEACE_FACE_DOWN_INVALID");

  const draft = structuredClone(state) as GameState;
  for (const instanceId of foreignerInstanceIds) {
    addCardToAttack(draft, player.id, instanceId, definitions, { payCost: true, bypassFaceUpPlayLimit: true, bypassTiming: true });
  }
  for (const instanceId of faceDownInstanceIds) playCardFaceDownByEffect(draft, player.id, instanceId, definitions, { allowedSourceZones: ["hand"] });

  const playedFaceUp: Array<{ instanceId: string; paidMana: number }> = [];
  for (const instanceId of foreignerInstanceIds) {
    const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, { payCost: true, bypassFaceUpPlayLimit: true, bypassTiming: true });
    const definition = definitions[state.cards[instanceId].definitionId];
    if (definition.revealsTrueNameOnPlay === true && !player.trueNameRevealed) revealPlayerTrueName(state, player.id);
    const attributes = getCardInstanceAttributes(state.cards[instanceId], definition, state, definitions);
    emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana, attributes, method: "voyager-message-peace" });
    emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, attributes, method: "voyager-message-peace" });
    playedFaceUp.push({ instanceId, paidMana });
  }
  for (const instanceId of faceDownInstanceIds) {
    playCardFaceDownByEffect(state, player.id, instanceId, definitions, { allowedSourceZones: ["hand"] });
    emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: null, face: "down", paidMana: 0, attributes: [], method: "voyager-message-peace" });
  }
  return { playedFaceUp, playedFaceDownInstanceIds: faceDownInstanceIds };
}

/** Message of Peace: effect-added Action cards and Combat hand reveal/zeroing. */
export const useVoyagerMessagePeace: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload)) throw new Error("VOYAGER_PEACE_CONTEXT_REQUIRED");
  if (!activeOwnedSkill(state, player, skill.id, definitions) || state.activePlayerId !== player.id) throw new Error("VOYAGER_PEACE_SOURCE_INACTIVE");
  if (payload.abilityId === "peace-action") {
    if (state.phase !== "action") throw new Error("VOYAGER_PEACE_ACTION_WINDOW_INVALID");
    const foreignerInstanceIds = handOuterLifeIds(state, player);
    if (foreignerInstanceIds.length === 0) {
      const hidden = faceDownHandIds(state, player, definitions);
      if (hidden.length === 0) return applyPeaceAction(state, player, [], [], definitions, emitEvent);
      openPeaceDecision(state, player, "face-down", { foreignerInstanceIds: [] }, hidden, 2, definitions, openDecision);
      return { pending: true, stage: "face-down" };
    }
    openPeaceDecision(state, player, "foreigner", {}, foreignerInstanceIds, 2, definitions, openDecision);
    return { pending: true, stage: "foreigner" };
  }
  if (payload.abilityId === "peace-combat") {
    if (state.phase !== "combat") throw new Error("VOYAGER_PEACE_COMBAT_WINDOW_INVALID");
    const revealedHands: Record<string, string[]> = {};
    const affectedPlayerIds: string[] = [];
    for (const playerId of alivePlayerIds(state)) {
      const target = state.players[playerId];
      revealedHands[playerId] = [...target.hand];
      for (const instanceId of target.hand) {
        const card = state.cards[instanceId];
        emitEvent?.("card.revealed", { playerId, instanceId, definitionId: card?.definitionId, sourceSkillId: skill.id });
      }
      if (!handOuterLifeIds(state, target).length) continue;
      affectedPlayerIds.push(playerId);
      for (const instanceId of getActiveCombatCardIds(state, target)) {
        const card = state.cards[instanceId];
        const modifierId = `${skill.id}:peace-zero:${state.round}:${instanceId}`;
        card.powerModifiers = [
          ...(card.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
          { id: modifierId, sourceId: skill.id, kind: "set", value: 0, duration: "round" },
        ];
      }
    }
    return { revealedHands, affectedPlayerIds };
  }
  throw new Error("VOYAGER_PEACE_ABILITY_INVALID");
};

export const resolveVoyagerMessagePeace: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("VOYAGER_PEACE_DECISION_INVALID");
  const previous = payload.previous;
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((value): value is string => typeof value === "string") : [];
  if (payload.decision.status !== "resolved") throw new Error("VOYAGER_PEACE_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((value): value is string => typeof value === "string") : [];
  if (selections.some((instanceId) => !candidates.includes(instanceId))) throw new Error("VOYAGER_PEACE_DECISION_INVALID");
  if (previous.stage === "foreigner") {
    if (selections.length > 2 || selections.some((instanceId) => !handOuterLifeIds(state, player).includes(instanceId))) throw new Error("VOYAGER_PEACE_FOREIGNER_INVALID");
    const hidden = faceDownHandIds(state, player, definitions, new Set(selections));
    if (hidden.length === 0) return applyPeaceAction(state, player, selections, [], definitions, emitEvent);
    openPeaceDecision(state, player, "face-down", { foreignerInstanceIds: selections }, hidden, 2, definitions, openDecision);
    return { pending: true, stage: "face-down", foreignerInstanceIds: selections };
  }
  if (previous.stage === "face-down") {
    const foreignerInstanceIds = Array.isArray(previous.foreignerInstanceIds)
      ? previous.foreignerInstanceIds.filter((value): value is string => typeof value === "string")
      : [];
    return applyPeaceAction(state, player, foreignerInstanceIds, selections, definitions, emitEvent);
  }
  throw new Error("VOYAGER_PEACE_DECISION_INVALID");
};

export const isVoyagerMessagePeaceLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId || !activeOwnedSkill(state, player, skill.id, definitions)) return false;
  if (ability?.id === "peace-action") return state.phase === "action";
  if (ability?.id === "peace-combat") return state.phase === "combat";
  return false;
};

function paleBlueDotOpponentIds(state: GameState, player: PlayerState): string[] {
  return alivePlayerIds(state).filter((playerId) => playerId !== player.id);
}

function revealDiscard(state: GameState, targetPlayerId: string, emitEvent?: SkillContext["emitEvent"]): string[] {
  const target = state.players[targetPlayerId];
  if (!target || target.eliminated) throw new Error("VOYAGER_PALE_TARGET_INVALID");
  const ids = [...target.discard];
  for (const instanceId of ids) {
    const card = state.cards[instanceId];
    emitEvent?.("card.revealed", { playerId: targetPlayerId, instanceId, definitionId: card?.definitionId, zone: "discard", sourceSkillId: VOYAGER_PALE_BLUE_DOT_ID });
  }
  return ids;
}

function openPaleDecision(
  state: GameState,
  player: PlayerState,
  stage: "target" | "play-all",
  previous: Record<string, unknown>,
  options: Array<{ id: string; label: string }>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${VOYAGER_PALE_BLUE_DOT_ID}:${stage}`;
  state.effectQueue.unshift({ effectId, handlerId: VOYAGER_PALE_BLUE_DOT_RESOLVE, sourceId: VOYAGER_PALE_BLUE_DOT_ID, controllerPlayerId: player.id, payload: { stage, ...previous }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: `voyager-pale-blue-dot-${stage}`,
    options, min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
}

function continuePaleTarget(
  state: GameState,
  player: PlayerState,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
  emitEvent?: SkillContext["emitEvent"],
) {
  if (!paleBlueDotOpponentIds(state, player).includes(targetPlayerId)) throw new Error("VOYAGER_PALE_TARGET_INVALID");
  const revealedInstanceIds = revealDiscard(state, targetPlayerId, emitEvent);
  const foreignerInstanceIds = revealedInstanceIds.filter((instanceId) => isOuterGodLifeDefinitionId(state.cards[instanceId]?.definitionId));
  if (foreignerInstanceIds.length === 0) return { targetPlayerId, revealedInstanceIds, foreignerInstanceIds, playedInstanceIds: [], victoryPointsStolen: 0 };
  openPaleDecision(state, player, "play-all", { targetPlayerId, revealedInstanceIds, foreignerInstanceIds }, [
    { id: "play-all", label: "免费打出全部领域外生命" },
    { id: "skip", label: "不打出" },
  ], openDecision);
  return { pending: true, targetPlayerId, revealedInstanceIds, foreignerInstanceIds };
}

function playAllPaleClasses(
  state: GameState,
  player: PlayerState,
  targetPlayerId: string,
  expectedInstanceIds: string[],
  definitions: Record<string, CardDefinition>,
  emitEvent?: SkillContext["emitEvent"],
) {
  const target = state.players[targetPlayerId];
  if (!target || target.eliminated) throw new Error("VOYAGER_PALE_TARGET_INVALID");
  const current = target.discard.filter((instanceId) => isOuterGodLifeDefinitionId(state.cards[instanceId]?.definitionId));
  if (expectedInstanceIds.some((instanceId) => !current.includes(instanceId))) throw new Error("VOYAGER_PALE_DISCARD_CHANGED");
  const draft = structuredClone(state) as GameState;
  for (const instanceId of expectedInstanceIds) {
    playBorrowedCardToAttack(draft, player.id, instanceId, definitions, { allowedSourceZones: ["discard"], exactManaCost: 0, bypassFaceUpPlayLimit: true });
  }
  const playedInstanceIds: string[] = [];
  for (const instanceId of expectedInstanceIds) {
    const result = playBorrowedCardToAttack(state, player.id, instanceId, definitions, { allowedSourceZones: ["discard"], exactManaCost: 0, bypassFaceUpPlayLimit: true });
    const definition = definitions[state.cards[instanceId].definitionId];
    if (definition.revealsTrueNameOnPlay === true && !player.trueNameRevealed) revealPlayerTrueName(state, player.id);
    const attributes = getCardInstanceAttributes(state.cards[instanceId], definition, state, definitions);
    emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana: 0, attributes, borrowedFromPlayerId: result.ownerPlayerId, sourceSkillId: VOYAGER_PALE_BLUE_DOT_ID });
    emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, attributes, method: "voyager-pale-blue-dot", sourceSkillId: VOYAGER_PALE_BLUE_DOT_ID });
    playedInstanceIds.push(instanceId);
  }
  const victoryPointsStolen = playedInstanceIds.length > 0 ? transferVictoryPoints(target, player, 2) : 0;
  return { targetPlayerId, playedInstanceIds, victoryPointsStolen };
}

/** Pale Blue Dot: reveal one opponent discard, optionally free-play every revealed Foreigner Class, then steal 2 VP. */
export const useVoyagerPaleBlueDot: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== "pale-blue-dot" || state.phase !== "action" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("VOYAGER_PALE_WINDOW_INVALID");
  const candidates = paleBlueDotOpponentIds(state, player);
  if (candidates.length === 0) throw new Error("VOYAGER_PALE_NO_OPPONENT");
  if (candidates.length === 1) return continuePaleTarget(state, player, candidates[0], definitions, openDecision, emitEvent);
  openPaleDecision(state, player, "target", { candidates }, candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })), openDecision);
  return { pending: true, stage: "target", candidates };
};

export const resolveVoyagerPaleBlueDot: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("VOYAGER_PALE_DECISION_INVALID");
  const previous = payload.previous;
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((value): value is string => typeof value === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1) throw new Error("VOYAGER_PALE_DECISION_INVALID");
  if (previous.stage === "target") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((value): value is string => typeof value === "string") : [];
    if (!candidates.includes(selections[0])) throw new Error("VOYAGER_PALE_TARGET_INVALID");
    return continuePaleTarget(state, player, selections[0], definitions, openDecision, emitEvent);
  }
  if (previous.stage === "play-all") {
    const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
    const foreignerInstanceIds = Array.isArray(previous.foreignerInstanceIds)
      ? previous.foreignerInstanceIds.filter((value): value is string => typeof value === "string")
      : [];
    if (!targetPlayerId) throw new Error("VOYAGER_PALE_TARGET_INVALID");
    if (selections[0] === "skip") return { targetPlayerId, playedInstanceIds: [], victoryPointsStolen: 0 };
    if (selections[0] !== "play-all") throw new Error("VOYAGER_PALE_DECISION_INVALID");
    return playAllPaleClasses(state, player, targetPlayerId, foreignerInstanceIds, definitions, emitEvent);
  }
  throw new Error("VOYAGER_PALE_DECISION_INVALID");
};

export const isVoyagerPaleBlueDotLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "pale-blue-dot" && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions) && paleBlueDotOpponentIds(state, player).length > 0);
};
