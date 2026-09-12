import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { gainVictoryPoints } from "./resources.ts";
import { canUseRulerSealCommand, openRulerSealCommand, resolveRulerSealCommandEvent } from "./ruler-seal-command.ts";
import { grantRulerSeal, listRulerSealsControlledBy } from "./ruler-seals.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const KAGETORA_GOD_ID = "servant.kagetora.skill.sc-kagetora-1";
export const KAGETORA_CHARGE_ID = "servant.kagetora.skill.sc-kagetora-2";
export const KAGETORA_RULER_SEAL_ID = "servant.kagetora.skill.sc-kagetora-4";
export const KAGETORA_GOD_HANDLER = "core.kagetora-god-of-war";
export const KAGETORA_CHARGE_HANDLER = "core.kagetora-eight-phase";
export const KAGETORA_RULER_SEAL_HANDLER = "core.kagetora-ruler-seal";
export const KAGETORA_GOD_RESOLVE = "core.kagetora-god-of-war-resolve";
export const KAGETORA_CHARGE_RESOLVE = "core.kagetora-eight-phase-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function definitionMatchesSkill(definition: CardDefinition | undefined, definitionId: string | undefined, skillId: string): boolean {
  return Boolean(definitionId && (definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId));
}

function hasActiveSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>): boolean {
  return player.attack.some((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    return Boolean(instance && instance.active && instance.face === "up"
      && definitionMatchesSkill(definition, instance.definitionId, skillId));
  });
}

function hasKagetoraSeal(state: GameState, holderPlayerId: string, boundPlayerId: string): boolean {
  return listRulerSealsControlledBy(state, holderPlayerId)
    .some((seal) => seal.sourceId === KAGETORA_GOD_ID && seal.boundPlayerId === boundPlayerId);
}

function attackCandidates(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  maxBasePower?: number,
): string[] {
  return player.hand.filter((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!definition || definition.cardType !== "attack") return false;
    return maxBasePower === undefined || definition.basePower <= maxBasePower;
  });
}

function sharedManaPayerIds(state: GameState, boundPlayerId: string): string[] {
  return Object.values(state.players)
    .filter((candidate) => candidate.id !== boundPlayerId && !candidate.eliminated && candidate.mana >= 8
      && hasKagetoraSeal(state, candidate.id, boundPlayerId))
    .map((candidate) => candidate.id);
}

function openCardDecision(
  state: GameState,
  player: PlayerState,
  candidateIds: string[],
  optional: boolean,
  reason: "movement" | "play",
  openDecision: SkillContext["openDecision"],
  definitions: Record<string, CardDefinition>,
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${KAGETORA_CHARGE_ID}:card:${reason}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: KAGETORA_CHARGE_RESOLVE,
    sourceId: KAGETORA_CHARGE_ID,
    controllerPlayerId: player.id,
    payload: { stage: "card", candidateIds, optional, reason },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: reason === "movement" ? "kagetora-move-extra-attack" : "kagetora-play-low-power-attack",
    options: candidateIds.map((instanceId) => ({
      id: instanceId,
      label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId,
    })),
    min: optional ? 0 : 1,
    max: 1,
    allowCancel: optional,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function openPayerDecision(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  reason: string,
  openDecision: SkillContext["openDecision"],
): void {
  const payerIds = sharedManaPayerIds(state, player.id);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${KAGETORA_CHARGE_ID}:payer:${instanceId}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: KAGETORA_CHARGE_RESOLVE,
    sourceId: KAGETORA_CHARGE_ID,
    controllerPlayerId: player.id,
    payload: { stage: "payer", instanceId, payerIds, reason },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "kagetora-attack-mana-payer",
    options: [
      { id: "self", label: player.name },
      ...payerIds.map((id) => ({ id, label: state.players[id]?.name ?? id })),
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function playChosenAttack(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent: SkillContext["emitEvent"],
  sharedManaPayerPlayerId?: string,
) {
  if (!player.hand.includes(instanceId)) throw new Error("KAGETORA_ATTACK_NOT_IN_HAND");
  const result = addCardToAttack(state, player.id, instanceId, definitions, {
    payCost: true,
    allowedSourceZones: ["hand"],
    bypassFaceUpPlayLimit: true,
    bypassTiming: true,
    sharedManaPayerPlayerId,
  });
  const definition = definitions[state.cards[instanceId].definitionId];
  emitEvent?.("card.played", {
    playerId: player.id,
    instanceId,
    definitionId: definition.id,
    face: "up",
    paidMana: result.paidMana,
    attributes: getCardAttributes(definition),
    method: "kagetora-eight-phase",
  });
  emitEvent?.("card.used", {
    playerId: player.id,
    instanceId,
    definitionId: definition.id,
    locationId: player.locationId,
    attributes: getCardAttributes(definition),
    method: "kagetora-eight-phase",
  });
  return { instanceId, paidMana: result.paidMana, sharedManaPayerPlayerId: sharedManaPayerPlayerId ?? null };
}

export const useKagetoraGodOfWar: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || payload.eventType !== "combat.resolved" || !hasActiveSkill(state, player, KAGETORA_GOD_ID, definitions)) return;
  const event = isRecord(payload.event) ? payload.event : {};
  const powers = isRecord(event.powers) ? event.powers : {};
  if (!Object.prototype.hasOwnProperty.call(powers, player.id)) return;
  const winnerIds = new Set(Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : []);
  const candidates = Object.keys(powers).filter((id) => id !== player.id && state.players[id] && !state.players[id].eliminated
    && !winnerIds.has(id) && !hasKagetoraSeal(state, id, player.id));
  if (candidates.length === 0) return;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${KAGETORA_GOD_ID}:target`;
  state.effectQueue.unshift({
    effectId,
    handlerId: KAGETORA_GOD_RESOLVE,
    sourceId: KAGETORA_GOD_ID,
    controllerPlayerId: player.id,
    payload: { candidateIds: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "kagetora-god-of-war-target",
    options: candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })), min: 1, max: 1, allowCancel: false,
    continuationEffectId: effectId, submissions: {},
  });
  return { pending: true, candidatePlayerIds: candidates };
};

export const resolveKagetoraGodOfWar: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("KAGETORA_GOD_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])
    || hasKagetoraSeal(state, selections[0], player.id)) throw new Error("KAGETORA_GOD_TARGET_INVALID");
  const seal = grantRulerSeal(state, selections[0], player.id, KAGETORA_GOD_ID);
  gainVictoryPoints(player, 1);
  return { sealId: seal.sealId, holderPlayerId: selections[0], gainedVictoryPoints: 1 };
};

export const useKagetoraEightPhase: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || !hasActiveSkill(state, player, KAGETORA_CHARGE_ID, definitions)) return;
  const event = isRecord(payload.event) ? payload.event : {};
  if (payload.eventType === "player.moved") {
    if (event.playerId !== player.id) return;
    const candidates = attackCandidates(state, player, definitions);
    if (candidates.length === 0) return;
    openCardDecision(state, player, candidates, true, "movement", openDecision, definitions);
    return { pending: true, candidateInstanceIds: candidates };
  }
  if (payload.eventType === "card.played") {
    if (event.playerId !== player.id || event.face !== "up" || typeof event.definitionId !== "string") return;
    const definition = definitions[event.definitionId];
    if (!definitionMatchesSkill(definition, event.definitionId, KAGETORA_CHARGE_ID)) return;
    const candidates = attackCandidates(state, player, definitions, 3);
    if (candidates.length === 0) return { pending: false, candidateInstanceIds: [] };
    openCardDecision(state, player, candidates, false, "play", openDecision, definitions);
    return { pending: true, candidateInstanceIds: candidates };
  }
};

export const resolveKagetoraEightPhase: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("KAGETORA_CHARGE_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== decision.selections.length) throw new Error("KAGETORA_CHARGE_DECISION_INVALID");
  if (previous.stage === "card") {
    const candidates = Array.isArray(previous.candidateIds) ? previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
    const optional = previous.optional === true;
    if (selections.length === 0 && optional) return { playedInstanceId: null };
    if (selections.length !== 1 || !candidates.includes(selections[0]) || !player.hand.includes(selections[0])) throw new Error("KAGETORA_CHARGE_CARD_INVALID");
    openPayerDecision(state, player, selections[0], typeof previous.reason === "string" ? previous.reason : "unknown", openDecision);
    return { pending: true, instanceId: selections[0] };
  }
  if (previous.stage === "payer") {
    const instanceId = typeof previous.instanceId === "string" ? previous.instanceId : undefined;
    const payerIds = Array.isArray(previous.payerIds) ? previous.payerIds.filter((id): id is string => typeof id === "string") : [];
    if (!instanceId || selections.length !== 1 || (selections[0] !== "self" && !payerIds.includes(selections[0]))) throw new Error("KAGETORA_CHARGE_PAYER_INVALID");
    return playChosenAttack(state, player, instanceId, definitions, emitEvent, selections[0] === "self" ? undefined : selections[0]);
  }
  throw new Error("KAGETORA_CHARGE_STAGE_INVALID");
};

export const useKagetoraRulerSeal: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("KAGETORA_RULER_SEAL_CONTEXT_REQUIRED");
  if (payload.eventType === "combat.resolved" || payload.eventType === "round.ending") {
    return resolveRulerSealCommandEvent(state, player, payload, definitions, KAGETORA_GOD_ID);
  }
  if (payload.abilityId !== "ruler-seal-command") throw new Error("KAGETORA_RULER_SEAL_ABILITY_INVALID");
  openRulerSealCommand(state, player, skill.id, openDecision, "ruler-seal-command", definitions, KAGETORA_GOD_ID);
  return { pending: true };
};

export const isKagetoraRulerSealLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) =>
  ability?.id === "ruler-seal-command" && canUseRulerSealCommand(state, playerId, KAGETORA_GOD_ID);
