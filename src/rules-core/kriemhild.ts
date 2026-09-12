import type { GameState, PlayerState } from "../domain/state/types.ts";
import { movePlayerByEffect } from "./board.ts";
import type { CardDefinition } from "./content-types.ts";
import { transferSkillToPlayerSkillZone } from "./decks.ts";
import { adjustVictoryPoints, gainVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const KRIEMHILD_RHEINGOLD_ID = "servant.kriemhild.skill.sc-kriemhild-1";
export const KRIEMHILD_BLACK_WEDDING_ID = "servant.kriemhild.skill.sc-kriemhild-2";
export const KRIEMHILD_BALMUNG_ID = "servant.kriemhild.skill.sc-kriemhild-3";

export const KRIEMHILD_RHEINGOLD_HANDLER = "core.kriemhild-das-rheingold";
export const KRIEMHILD_WEDDING_HANDLER = "core.kriemhild-black-wedding";
export const KRIEMHILD_WEDDING_RESOLVE = "core.kriemhild-black-wedding-resolve";
export const KRIEMHILD_BALMUNG_HANDLER = "core.kriemhild-corrupted-balmung";
export const KRIEMHILD_BALMUNG_RESOLVE = "core.kriemhild-corrupted-balmung-resolve";

const ABANDONED_LOVE_ABILITY = "abandoned-love";
const RHEINGOLD_ARMED_ROUND_FLAG = "kriemhildAbandonedLoveRound";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function physicalSkillInstances(state: GameState, skillId: string, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).filter((card) => {
    const definition = definitions[card.definitionId];
    return !card.fullSkillCopy && !card.skillCopyReplacement && matchesSkill(definition, card.definitionId, skillId);
  });
}

function ownedLiveSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return physicalSkillInstances(state, skillId, definitions).find((card) => card.ownerPlayerId === player.id
    && card.controllerPlayerId === player.id && card.zone !== "removed" && card.zone !== "discard");
}

function activeOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return physicalSkillInstances(state, skillId, definitions).find((card) => card.ownerPlayerId === player.id
    && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up");
}

function canonicalBalmung(state: GameState, definitions: Record<string, CardDefinition>) {
  const cards = physicalSkillInstances(state, KRIEMHILD_BALMUNG_ID, definitions);
  return cards.find((card) => card.originServantId === "servant.kriemhild") ?? cards[0];
}

function physicalHolderPlayerId(state: GameState, instanceId: string): string | undefined {
  for (const player of Object.values(state.players)) {
    if ([...player.hand, ...player.deck, ...player.discard, ...player.attack, ...player.masterSkills, ...player.servantSkills].includes(instanceId)) {
      return player.id;
    }
  }
  return undefined;
}

function kriemhildPlayer(state: GameState): PlayerState | undefined {
  return Object.values(state.players).find((candidate) => candidate.servantId === "servant.kriemhild");
}

function canEffectMoveTo(
  state: GameState,
  playerId: string,
  locationId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  const target = state.players[playerId];
  if (!target || target.eliminated || target.locationId === locationId) return false;
  try {
    const draft = structuredClone(state) as GameState;
    movePlayerByEffect(draft, playerId, locationId, definitions);
    return true;
  } catch {
    return false;
  }
}

function openWeddingInvitation(
  state: GameState,
  player: PlayerState,
  locationId: string,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): { pending: boolean; chooserPlayerIds: string[] } {
  const chooserPlayerIds = state.turnOrder.filter((playerId) => playerId !== player.id
    && canEffectMoveTo(state, playerId, locationId, definitions));
  if (chooserPlayerIds.length === 0) return { pending: false, chooserPlayerIds: [] };
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${KRIEMHILD_BLACK_WEDDING_ID}:invitation`;
  state.effectQueue.unshift({
    effectId,
    handlerId: KRIEMHILD_WEDDING_RESOLVE,
    sourceId: KRIEMHILD_BLACK_WEDDING_ID,
    controllerPlayerId: player.id,
    payload: { locationId, chooserPlayerIds },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds,
    kind: "kriemhild-black-wedding-invitation",
    options: [{ id: "move", label: "移动至该战场" }, { id: "stay", label: "留在原地" }],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, chooserPlayerIds };
}

function readChooserSelection(decision: Record<string, unknown>, chooserPlayerId: string): string | undefined {
  if (isRecord(decision.submissions)) {
    const submitted = decision.submissions[chooserPlayerId];
    if (Array.isArray(submitted) && submitted.length === 1 && typeof submitted[0] === "string") return submitted[0];
  }
  return undefined;
}

/** Das Rheingold: arm the end-round recall, then return the physical Balmung from any zone. */
export const useKriemhildDasRheingold: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("KRIEMHILD_RHEINGOLD_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "round.ending") {
    if (Number(player.flags[RHEINGOLD_ARMED_ROUND_FLAG] ?? Number.NEGATIVE_INFINITY) !== state.round) return;
    delete player.flags[RHEINGOLD_ARMED_ROUND_FLAG];
    const balmung = canonicalBalmung(state, definitions);
    if (!balmung) return { returnedInstanceId: null, penalizedPlayerId: null };
    const alreadyHome = balmung.ownerPlayerId === player.id && balmung.controllerPlayerId === player.id
      && balmung.zone === "servant-skills" && player.servantSkills.includes(balmung.instanceId);
    if (alreadyHome) return { returnedInstanceId: balmung.instanceId, penalizedPlayerId: null };
    const previousHolderPlayerId = balmung.zone === "removed" || balmung.zone === "board"
      ? undefined
      : physicalHolderPlayerId(state, balmung.instanceId);
    transferSkillToPlayerSkillZone(state, player.id, balmung.instanceId, definitions);
    if (previousHolderPlayerId) {
      const previousHolder = state.players[previousHolderPlayerId];
      if (previousHolder) {
        adjustVictoryPoints(previousHolder, -3);
        previousHolder.flags.noblePhantasmUseBlockedThroughRound = Math.max(
          Number(previousHolder.flags.noblePhantasmUseBlockedThroughRound ?? Number.NEGATIVE_INFINITY),
          state.round + 1,
        );
      }
    }
    return { returnedInstanceId: balmung.instanceId, penalizedPlayerId: previousHolderPlayerId ?? null };
  }

  if (payload.abilityId !== ABANDONED_LOVE_ABILITY || state.phase !== "combat" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("KRIEMHILD_RHEINGOLD_WINDOW_INVALID");
  player.flags[RHEINGOLD_ARMED_ROUND_FLAG] = state.round;
  return { armedRound: state.round };
};

export const isKriemhildDasRheingoldLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === ABANDONED_LOVE_ABILITY && state.phase === "combat"
    && state.activePlayerId === playerId && activeOwnedSkill(state, player, skill.id, definitions));
};

/** Black Wedding's On Play invitation. The combat-winner inclusion itself is a generic structured modifier. */
export const useKriemhildBlackWedding: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || payload.eventType !== "card.played" || !isRecord(payload.event)) return;
  const event = payload.event;
  const definitionId = typeof event.definitionId === "string" ? event.definitionId : undefined;
  if (event.playerId !== player.id || event.face !== "up" || !definitionId
    || !matchesSkill(definitions[definitionId], definitionId, skill.id)) return;
  if (player.locationId !== "mountain" && player.locationId !== "city") return { pending: false, chooserPlayerIds: [] };
  return openWeddingInvitation(state, player, player.locationId, definitions, openDecision);
};

export const resolveKriemhildBlackWedding: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("KRIEMHILD_WEDDING_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  if (decision.status !== "resolved") throw new Error("KRIEMHILD_WEDDING_DECISION_INVALID");
  const locationId = typeof previous.locationId === "string" ? previous.locationId : undefined;
  const chooserPlayerIds = Array.isArray(previous.chooserPlayerIds)
    ? previous.chooserPlayerIds.filter((value): value is string => typeof value === "string")
    : [];
  if ((locationId !== "mountain" && locationId !== "city") || chooserPlayerIds.length === 0) {
    throw new Error("KRIEMHILD_WEDDING_DECISION_INVALID");
  }
  const movedPlayerIds: string[] = [];
  for (const chooserPlayerId of state.turnOrder.filter((id) => chooserPlayerIds.includes(id))) {
    const choice = readChooserSelection(decision, chooserPlayerId);
    if (choice !== "move" && choice !== "stay") throw new Error("KRIEMHILD_WEDDING_DECISION_INVALID");
    if (choice === "stay") continue;
    if (!canEffectMoveTo(state, chooserPlayerId, locationId, definitions)) throw new Error("KRIEMHILD_WEDDING_MOVE_INVALID");
    const movement = movePlayerByEffect(state, chooserPlayerId, locationId, definitions);
    emitEvent?.("player.moved", { playerId: chooserPlayerId, ...movement, method: "effect", sourceId: KRIEMHILD_BLACK_WEDDING_ID });
    emitEvent?.("player.entered-location", { playerId: chooserPlayerId, ...movement, method: "effect", sourceId: KRIEMHILD_BLACK_WEDDING_ID });
    movedPlayerIds.push(chooserPlayerId);
  }
  return { movedPlayerIds };
};

export function hasKriemhildBalmungPassiveSource(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): boolean {
  const player = state.players[playerId];
  return Boolean(player && ownedLiveSkill(state, player, KRIEMHILD_BALMUNG_ID, definitions));
}

export function hasActiveKriemhildBalmungSource(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): boolean {
  const player = state.players[playerId];
  return Boolean(player && activeOwnedSkill(state, player, KRIEMHILD_BALMUNG_ID, definitions));
}

/** Corrupted Balmung: punish a no-win round and pass the physical card to a chosen combat winner. */
export const useKriemhildCorruptedBalmung: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("KRIEMHILD_BALMUNG_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "round.ending") {
    if (!ownedLiveSkill(state, player, KRIEMHILD_BALMUNG_ID, definitions)) return;
    if (Number(player.flags.combatWinRound ?? Number.NEGATIVE_INFINITY) === state.round) return { lostVictoryPoints: 0 };
    const gained = Number(player.flags.roundVictoryPointsGained ?? 0);
    if (!Number.isInteger(gained) || gained < 0) throw new Error("KRIEMHILD_BALMUNG_VP_HISTORY_INVALID");
    if (gained > 0) adjustVictoryPoints(player, -gained);
    return { lostVictoryPoints: gained };
  }
  if (eventType !== "combat.resolved" || !isRecord(payload.event)) return;
  const source = activeOwnedSkill(state, player, KRIEMHILD_BALMUNG_ID, definitions);
  const event = payload.event;
  const powers = isRecord(event.powers) ? event.powers : {};
  if (!source || !Object.prototype.hasOwnProperty.call(powers, player.id)) return;
  const winnerIds = Array.isArray(event.winnerIds)
    ? event.winnerIds.filter((value): value is string => typeof value === "string" && Boolean(state.players[value]) && !state.players[value].eliminated)
    : [];
  if (winnerIds.length === 0) return;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${KRIEMHILD_BALMUNG_ID}:reward`;
  state.effectQueue.unshift({
    effectId,
    handlerId: KRIEMHILD_BALMUNG_RESOLVE,
    sourceId: KRIEMHILD_BALMUNG_ID,
    controllerPlayerId: player.id,
    payload: { sourceInstanceId: source.instanceId, winnerIds },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "kriemhild-balmung-winner",
    options: winnerIds.map((winnerId) => ({ id: winnerId, label: state.players[winnerId]?.name ?? winnerId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, winnerIds };
};

export const resolveKriemhildCorruptedBalmung: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("KRIEMHILD_BALMUNG_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const winnerIds = Array.isArray(previous.winnerIds) ? previous.winnerIds.filter((value): value is string => typeof value === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((value): value is string => typeof value === "string") : [];
  const sourceInstanceId = typeof previous.sourceInstanceId === "string" ? previous.sourceInstanceId : undefined;
  if (decision.status !== "resolved" || selections.length !== 1 || !winnerIds.includes(selections[0]) || !sourceInstanceId) {
    throw new Error("KRIEMHILD_BALMUNG_DECISION_INVALID");
  }
  const source = state.cards[sourceInstanceId];
  if (!source || source.ownerPlayerId !== player.id || source.controllerPlayerId !== player.id || source.zone !== "attack"
    || !source.active || source.face !== "up" || !matchesSkill(definitions[source.definitionId], source.definitionId, KRIEMHILD_BALMUNG_ID)) {
    throw new Error("KRIEMHILD_BALMUNG_SOURCE_STALE");
  }
  const selectedWinnerId = selections[0];
  if (!state.players[selectedWinnerId] || state.players[selectedWinnerId].eliminated) throw new Error("KRIEMHILD_BALMUNG_TARGET_INVALID");
  const selectedSelf = selectedWinnerId === player.id;
  transferSkillToPlayerSkillZone(state, selectedWinnerId, sourceInstanceId, definitions);
  let kriemhildVictoryPointsGained = 0;
  if (selectedSelf) {
    const original = kriemhildPlayer(state);
    if (original && !original.eliminated) kriemhildVictoryPointsGained = gainVictoryPoints(original, 2);
  }
  return { transferredInstanceId: sourceInstanceId, targetPlayerId: selectedWinnerId, kriemhildVictoryPointsGained };
};

export const isKriemhildBlackWeddingLegal: SkillLegalityPredicate = () => false;
export const isKriemhildCorruptedBalmungLegal: SkillLegalityPredicate = () => false;
