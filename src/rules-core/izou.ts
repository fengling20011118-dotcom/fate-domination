import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const IZOU_SHIMATSUKEN_ID = "servant.izou.skill.sc-izou-1";
export const IZOU_MAN_SLAYER_ID = "servant.izou.skill.sc-izou-2";
export const IZOU_SHIMATSUKEN_HANDLER = "core.izou-shimatsuken";
export const IZOU_SHIMATSUKEN_RESOLVE = "core.izou-shimatsuken-resolve";
export const IZOU_MAN_SLAYER_HANDLER = "core.izou-man-slayer";
export const IZOU_MAN_SLAYER_RESOLVE = "core.izou-man-slayer-resolve";

const SHIMATSUKEN_LAST_NAME_FLAG = "izouShimatsukenLastNameKey";
const SHIMATSUKEN_TARGET_FLAG = "izouShimatsukenTargetInstanceId";
const SHIMATSUKEN_TARGET_ROUND_FLAG = "izouShimatsukenTargetRound";
const SHIMATSUKEN_TARGET_LOCATION_FLAG = "izouShimatsukenTargetLocationId";
const SHIMATSUKEN_STORED_POWER_FLAG = "izouShimatsukenStoredPower";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function activeOwnedSkill(state: GameState, player: PlayerState, definitionId: string) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => card?.definitionId === definitionId
    && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === "attack" && card.face === "up" && card.active);
}

function cardNameKey(definition: CardDefinition): string {
  // The confirmed translation explicitly treats all Basic Attacks as the same
  // name for Shimatsuken's consecutive-choice restriction.
  return definition.basic === true ? "__basic_attack__" : definition.name;
}

function shimatsukenCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  const lastNameKey = typeof player.flags[SHIMATSUKEN_LAST_NAME_FLAG] === "string"
    ? String(player.flags[SHIMATSUKEN_LAST_NAME_FLAG])
    : undefined;
  const result: string[] = [];
  for (const participantId of state.board.locations[locationId] ?? []) {
    const participant = state.players[participantId];
    if (!participant || participant.eliminated) continue;
    for (const instanceId of participant.attack) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || !definition || card.zone !== "attack" || card.face !== "up" || !card.active) continue;
      if (!getCardInstanceAttributes(card, definition, state, definitions).includes("迅捷")) continue;
      if (cardNameKey(definition) === lastNameKey) continue;
      result.push(instanceId);
    }
  }
  return result;
}

function openShimatsukenDecision(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const candidates = shimatsukenCandidates(state, player, definitions);
  if (candidates.length === 0) throw new Error("IZOU_SHIMATSUKEN_TARGET_UNAVAILABLE");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skillId}:target`;
  state.effectQueue.unshift({
    effectId,
    handlerId: IZOU_SHIMATSUKEN_RESOLVE,
    sourceId: skillId,
    controllerPlayerId: player.id,
    payload: { stage: "target", candidates, round: state.round, locationId: player.locationId },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "izou-shimatsuken-target",
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function recordShimatsukenPower(state: GameState, player: PlayerState, event: Record<string, unknown>): void {
  if (Number(player.flags[SHIMATSUKEN_TARGET_ROUND_FLAG] ?? -1) !== state.round) return;
  const targetInstanceId = typeof player.flags[SHIMATSUKEN_TARGET_FLAG] === "string" ? String(player.flags[SHIMATSUKEN_TARGET_FLAG]) : undefined;
  const targetLocationId = typeof player.flags[SHIMATSUKEN_TARGET_LOCATION_FLAG] === "string" ? String(player.flags[SHIMATSUKEN_TARGET_LOCATION_FLAG]) : undefined;
  if (!targetInstanceId || event.locationId !== targetLocationId || !isRecord(event.cardPowers)) return;
  let measured: number | undefined;
  for (const powers of Object.values(event.cardPowers)) {
    if (!isRecord(powers) || !Object.prototype.hasOwnProperty.call(powers, targetInstanceId)) continue;
    const value = Number(powers[targetInstanceId]);
    if (Number.isFinite(value)) measured = value;
    break;
  }
  delete player.flags[SHIMATSUKEN_TARGET_FLAG];
  delete player.flags[SHIMATSUKEN_TARGET_ROUND_FLAG];
  delete player.flags[SHIMATSUKEN_TARGET_LOCATION_FLAG];
  if (measured !== undefined) player.flags[SHIMATSUKEN_STORED_POWER_FLAG] = measured;
}

function applyStoredShimatsukenPower(state: GameState, player: PlayerState, event: Record<string, unknown>): void {
  if (event.playerId !== player.id || event.definitionId !== IZOU_SHIMATSUKEN_ID || event.face !== "up") return;
  const instanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
  const storedPower = Number(player.flags[SHIMATSUKEN_STORED_POWER_FLAG]);
  if (!instanceId || !Number.isFinite(storedPower)) return;
  const card = state.cards[instanceId];
  if (!card || card.definitionId !== IZOU_SHIMATSUKEN_ID || card.zone !== "attack" || !card.active) return;
  const modifierId = `${IZOU_SHIMATSUKEN_ID}:stored:${state.round}:${instanceId}`;
  card.powerModifiers = [
    ...(card.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
    { id: modifierId, sourceId: IZOU_SHIMATSUKEN_ID, kind: "add", value: storedPower, duration: "round" },
  ];
  delete player.flags[SHIMATSUKEN_STORED_POWER_FLAG];
}

export const useIzouShimatsuken: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("IZOU_SHIMATSUKEN_DEFINITIONS_REQUIRED");
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : undefined;
  if (eventType === "combat.resolved") {
    if (event) recordShimatsukenPower(state, player, event);
    return;
  }
  if (eventType === "card.played") {
    if (event) applyStoredShimatsukenPower(state, player, event);
    return;
  }
  if (state.phase !== "combat" || state.step !== "player-window" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, skill.id)) {
    throw new Error("IZOU_SHIMATSUKEN_WINDOW_INVALID");
  }
  openShimatsukenDecision(state, player, skill.id, definitions, openDecision);
};

export const resolveIzouShimatsuken: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("IZOU_SHIMATSUKEN_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || previous.stage !== "target" || selections.length !== 1 || !candidates.includes(selections[0])
    || Number(previous.round) !== state.round || previous.locationId !== player.locationId) throw new Error("IZOU_SHIMATSUKEN_DECISION_INVALID");
  const instanceId = selections[0];
  if (!shimatsukenCandidates(state, player, definitions).includes(instanceId)) throw new Error("IZOU_SHIMATSUKEN_TARGET_INVALID");
  const definition = definitions[state.cards[instanceId].definitionId];
  player.flags[SHIMATSUKEN_LAST_NAME_FLAG] = cardNameKey(definition);
  player.flags[SHIMATSUKEN_TARGET_FLAG] = instanceId;
  player.flags[SHIMATSUKEN_TARGET_ROUND_FLAG] = state.round;
  player.flags[SHIMATSUKEN_TARGET_LOCATION_FLAG] = player.locationId!;
  return { targetInstanceId: instanceId };
};

export const isIzouShimatsukenLegal: SkillLegalityPredicate = (state, playerId, skill, _ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && state.phase === "combat" && state.step === "player-window" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id) && shimatsukenCandidates(state, player, definitions).length > 0);
};

const MAN_SLAYER_SOURCE_ZONES = ["hand", "master-skills", "servant-skills"] as const;

function isAttackDefinition(definition: CardDefinition): boolean {
  return definition.cardType === "attack" || getCardAttributes(definition).length > 0;
}

function canManSlayerPlay(state: GameState, player: PlayerState, instanceId: string, definitions: Record<string, CardDefinition>): boolean {
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !definition || !isAttackDefinition(definition) || !MAN_SLAYER_SOURCE_ZONES.includes(card.zone as never)) return false;
  const draft = structuredClone(state) as GameState;
  try {
    addCardToAttack(draft, player.id, instanceId, definitions, {
      payCost: true,
      allowedSourceZones: [...MAN_SLAYER_SOURCE_ZONES],
      bypassTiming: true,
    });
    return true;
  } catch {
    return false;
  }
}

function manSlayerPlayableIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return [...player.hand, ...player.masterSkills, ...player.servantSkills]
    .filter((instanceId) => canManSlayerPlay(state, player, instanceId, definitions));
}

function canManSlayerDefeat(state: GameState, player: PlayerState, targetPlayerId: string, definitions: Record<string, CardDefinition>): boolean {
  const draft = structuredClone(state) as GameState;
  return applyDefeatEffect(draft, targetPlayerId, player.id, definitions, undefined, { sourceId: IZOU_MAN_SLAYER_ID, reason: "man-slayer" }).applied;
}

function openManSlayerDecision(
  state: GameState,
  player: PlayerState,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const candidates = manSlayerPlayableIds(state, player, definitions);
  const canDefeat = canManSlayerDefeat(state, player, targetPlayerId, definitions);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${IZOU_MAN_SLAYER_ID}:leave:${targetPlayerId}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: IZOU_MAN_SLAYER_RESOLVE,
    sourceId: IZOU_MAN_SLAYER_ID,
    controllerPlayerId: player.id,
    payload: { stage: "leave", targetPlayerId, candidates, canDefeat },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "izou-man-slayer-response",
    options: [
      ...candidates.map((instanceId) => ({ id: instanceId, label: `Play ${definitions[state.cards[instanceId].definitionId]?.name ?? instanceId}` })),
      ...(canDefeat ? [{ id: "defeat", label: "Apply [defeat]" }] : []),
      { id: "pass", label: "Pass" },
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function manSlayerLeaveTarget(state: GameState, player: PlayerState, event: Record<string, unknown>): string | undefined {
  const movedPlayerId = typeof event.playerId === "string" ? event.playerId : undefined;
  const previousLocationId = typeof event.previousLocationId === "string" ? event.previousLocationId : undefined;
  const locationId = typeof event.locationId === "string" ? event.locationId : undefined;
  if (!movedPlayerId || movedPlayerId === player.id || !state.players[movedPlayerId] || state.players[movedPlayerId].eliminated) return undefined;
  if ((previousLocationId !== "mountain" && previousLocationId !== "city") || previousLocationId === locationId) return undefined;
  return player.locationId === previousLocationId ? movedPlayerId : undefined;
}

export const useIzouManSlayer: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("IZOU_MAN_SLAYER_DEFINITIONS_REQUIRED");
  const eventType = isRecord(payload) && typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload) && isRecord(payload.event) ? payload.event : undefined;
  if (!event) return;
  if (eventType === "player.moved") {
    const targetPlayerId = manSlayerLeaveTarget(state, player, event);
    if (targetPlayerId) openManSlayerDecision(state, player, targetPlayerId, definitions, openDecision);
    return;
  }
  if (eventType === "player.defeat-applied") {
    if (event.controllerPlayerId !== player.id || typeof event.playerId !== "string" || event.playerId === player.id) return;
    const target = state.players[event.playerId];
    if (!target || target.eliminated) return;
    target.victoryPoints = Math.max(0, target.victoryPoints - 3);
  }
};

export const resolveIzouManSlayer: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("IZOU_MAN_SLAYER_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
  if (decision.status !== "resolved" || previous.stage !== "leave" || selections.length !== 1 || !targetPlayerId || !state.players[targetPlayerId]) {
    throw new Error("IZOU_MAN_SLAYER_DECISION_INVALID");
  }
  const selected = selections[0];
  if (selected === "pass") return { action: "pass" };
  if (selected === "defeat") {
    if (previous.canDefeat !== true || !canManSlayerDefeat(state, player, targetPlayerId, definitions)) throw new Error("IZOU_MAN_SLAYER_DEFEAT_INVALID");
    const result = applyDefeatEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: IZOU_MAN_SLAYER_ID, reason: "man-slayer" });
    if (!result.applied) throw new Error("IZOU_MAN_SLAYER_DEFEAT_INVALID");
    return { action: "defeat", targetPlayerId, result };
  }
  if (!candidates.includes(selected) || !canManSlayerPlay(state, player, selected, definitions)) throw new Error("IZOU_MAN_SLAYER_CARD_INVALID");
  const card = state.cards[selected];
  const definition = definitions[card.definitionId];
  const { paidMana } = addCardToAttack(state, player.id, selected, definitions, {
    payCost: true,
    allowedSourceZones: [...MAN_SLAYER_SOURCE_ZONES],
    bypassTiming: true,
  });
  if (definition.revealsTrueNameOnPlay === true && !player.trueNameRevealed) {
    revealPlayerTrueName(state, player.id);
    emitEvent?.("servant.true-name-revealed", { playerId: player.id, servantId: player.servantId, sourceDefinitionId: definition.id, method: "man-slayer" });
  }
  emitEvent?.("card.played", { playerId: player.id, instanceId: selected, definitionId: definition.id, face: "up", paidMana, attributes: getCardInstanceAttributes(card, definition, state, definitions), method: "man-slayer" });
  emitEvent?.("card.used", { playerId: player.id, instanceId: selected, definitionId: definition.id, locationId: player.locationId, attributes: getCardInstanceAttributes(card, definition, state, definitions), method: "man-slayer" });
  return { action: "play", instanceId: selected, paidMana };
};
