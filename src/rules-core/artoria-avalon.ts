import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardAttributes } from "./content-types.ts";
import { addCardRuleModifier, getCardRulePowerAdd } from "./card-rule-modifiers.ts";
import { movePlayerOneSpaceByEffect } from "./board.ts";
import { createOwnedCardInstance, movePlayerCard, removePhysicalCardFromGame, shufflePlayerDeck } from "./decks.ts";
import { gainMana, gainVictoryPoints } from "./resources.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillAbilityDefinition, SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ARTORIA_AVALON_HANDLER = "core.artoria-avalon";
export const ARTORIA_AVALON_RESOLVE = "core.artoria-avalon-resolve";
export const ARTORIA_AROUND_ID = "servant.artoriac.skill.sc-artoriac-1";
export const ARTORIA_ROUND_ID = "servant.artoriac.skill.sc-artoriac-3";
export const ARTORIA_CALL_ID = "servant.artoriac.skill.sc-artoriac-4";
export const ARTORIA_RESPITE_ID = "servant.artoriac.skill.sc-artoriac-5";
export const ARTORIA_DESTINY_ID = "servant.artoriac.skill.sc-artoriac-6";
export const ARTORIA_AROUND_RETURN = "around-return";
export const ARTORIA_CALL_MOVE = "pilgrim-call-move";
export const ARTORIA_RESPITE_GAIN = "pilgrim-respite-gain";
const LUCK_ID = "card.cardluck";
const PILGRIM_IDS = [ARTORIA_CALL_ID, ARTORIA_RESPITE_ID, ARTORIA_DESTINY_ID] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function physicalSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>, zones?: string[]) {
  return [...player.servantSkills, ...player.hand, ...player.attack].map((id) => state.cards[id]).find((card) => {
    if (!card || card.ownerPlayerId !== player.id || card.zone === "removed") return false;
    if (zones && !zones.includes(card.zone)) return false;
    const definition = definitions[card.definitionId];
    return card.definitionId === skillId || definition?.linkedSkillId === skillId;
  });
}

function activeSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  const card = physicalSkill(state, player, skillId, definitions, ["attack"]);
  return card?.active && card.face === "up" ? card : undefined;
}

function openDecision(state: GameState, player: PlayerState, sourceId: string, stage: string, payload: Record<string, unknown>, options: PendingDecision["options"], min: number, max: number, open: Parameters<SkillHandler>[0]["openDecision"]): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({ effectId, handlerId: ARTORIA_AVALON_RESOLVE, sourceId, controllerPlayerId: player.id, payload: { stage, ...payload }, createdAtRevision: state.revision });
  open({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: `artoria-avalon-${stage}`, options, min, max, allowCancel: false, continuationEffectId: effectId, submissions: {} });
}

function installAroundAura(state: GameState, player: PlayerState, sourceInstanceId: string, definitions: Record<string, CardDefinition>): void {
  const targetDefinitionIds = Object.values(definitions)
    .filter((definition) => definition.id !== ARTORIA_AROUND_ID && getCardAttributes(definition).includes("特殊"))
    .map((definition) => definition.id);
  const modifierId = `${ARTORIA_AROUND_ID}:special-aura:${sourceInstanceId}`;
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== modifierId);
  if (targetDefinitionIds.length === 0) return;
  addCardRuleModifier(player, {
    id: modifierId,
    sourceId: ARTORIA_AROUND_ID,
    sourceInstanceId,
    targetDefinitionIds,
    powerAdd: 2,
    duration: "while-source-active",
    condition: { targetZoneAttack: true, targetActiveFaceUp: true },
  });
}

function handleAroundPlayed(state: GameState, player: PlayerState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>) {
  if (event.playerId !== player.id || typeof event.instanceId !== "string") return;
  const source = state.cards[event.instanceId];
  const sourceDefinition = source ? definitions[source.definitionId] : undefined;
  if (!source || sourceDefinition?.linkedSkillId !== ARTORIA_AROUND_ID && source.definitionId !== ARTORIA_AROUND_ID) return;
  source.residual = true;
  // Fandom ruling: the play round is the first of the two rounds, so it closes at the end of next round.
  source.residualUntilRound = state.round + 1;
  installAroundAura(state, player, source.instanceId, definitions);
  return { residualUntilRound: source.residualUntilRound };
}

function aroundReturnCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.playedRound === state.round && (card.face === "down" || definition.isSkill !== true));
  });
}

function beginAroundReturn(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, open: Parameters<SkillHandler>[0]["openDecision"]) {
  const candidates = aroundReturnCandidates(state, player, definitions);
  if (candidates.length === 0) throw new Error("ARTORIA_AROUND_RETURN_NO_TARGET");
  if (candidates.length === 1) {
    movePlayerCard(state, player.id, candidates[0], "hand");
    return { returnedInstanceId: candidates[0] };
  }
  openDecision(state, player, ARTORIA_AROUND_ID, "around-return", { candidates }, candidates.map((id) => ({ id, label: definitions[state.cards[id].definitionId]?.name ?? state.cards[id].definitionId })), 1, 1, open);
  return { pending: true };
}

function countDiscardLuck(state: GameState, player: PlayerState): number {
  return player.discard.reduce((count, id) => count + (state.cards[id]?.definitionId === LUCK_ID ? 1 : 0), 0);
}

function syncRoundOfAvalon(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, emitEvent: Parameters<SkillHandler>[0]["emitEvent"]): unknown {
  const source = activeSkill(state, player, ARTORIA_ROUND_ID, definitions);
  if (!source) return;
  const x = Math.min(15, countDiscardLuck(state, player) * 5);
  const modifierId = `${ARTORIA_ROUND_ID}:discard-luck-power`;
  source.powerModifiers = [...(source.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId), { id: modifierId, sourceId: ARTORIA_ROUND_ID, kind: "set", value: x, duration: "game" }];
  player.flags.artoriaAvalonDiscardPublic = true;
  if (x > 0 && !player.trueNameRevealed) {
    revealPlayerTrueName(state, player.id);
    emitEvent?.("servant.true-name-revealed", { playerId: player.id, servantId: player.servantId, sourceDefinitionId: ARTORIA_ROUND_ID, method: "round-of-avalon" });
  }
  return { x, luckCount: x / 5 };
}

function recycleDiscardAfterWin(state: GameState, player: PlayerState, randomInt: (maxExclusive: number) => number): string[] {
  const ids = [...player.discard];
  for (const id of ids) movePlayerCard(state, player.id, id, "deck");
  if (ids.length > 0) shufflePlayerDeck(state, player.id, randomInt);
  return ids;
}

function movementOptions(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): Array<{ id: string; label: string; directions: Array<"forward" | "backward"> }> {
  const results = new Map<string, { id: string; label: string; directions: Array<"forward" | "backward"> }>();
  if (player.locationId) results.set(player.locationId, { id: player.locationId, label: player.locationId, directions: [] });
  for (const first of ["forward", "backward"] as const) {
    const draft = structuredClone(state);
    try {
      const one = movePlayerOneSpaceByEffect(draft, player.id, first, definitions);
      results.set(one.locationId, { id: one.locationId, label: one.locationId, directions: [first] });
      for (const second of ["forward", "backward"] as const) {
        const draft2 = structuredClone(draft);
        try {
          const two = movePlayerOneSpaceByEffect(draft2, player.id, second, definitions);
          if (!results.has(two.locationId)) results.set(two.locationId, { id: two.locationId, label: two.locationId, directions: [first, second] });
        } catch { /* no second arrow */ }
      }
    } catch { /* no first arrow */ }
  }
  return [...results.values()];
}

function beginPilgrimCall(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, open: Parameters<SkillHandler>[0]["openDecision"]) {
  const options = movementOptions(state, player, definitions);
  if (options.length === 0) throw new Error("ARTORIA_CALL_MOVE_UNAVAILABLE");
  openDecision(state, player, ARTORIA_CALL_ID, "call-move", { options }, options.map(({ id, label }) => ({ id, label })), 1, 1, open);
  return { pending: true };
}

function createLuckAndShuffle(state: GameState, player: PlayerState, randomInt: (maxExclusive: number) => number, sourceId: string): string {
  const serialKey = "artoriaAvalonLuckSerial";
  player.flags[serialKey] = Number(player.flags[serialKey] ?? 0) + 1;
  const instanceId = `${player.id}:artoria-avalon-luck:${player.flags[serialKey]}`;
  createOwnedCardInstance(state, player.id, { instanceId, definitionId: LUCK_ID, originServantId: player.servantId, zone: "deck", face: "down", active: false, createdByEffectId: sourceId });
  shufflePlayerDeck(state, player.id, randomInt);
  return instanceId;
}

function pilgrimHandCards(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return player.hand.map((id) => state.cards[id]).filter((card) => {
    const linked = card ? definitions[card.definitionId]?.linkedSkillId : undefined;
    return Boolean(card && linked && PILGRIM_IDS.includes(linked as typeof PILGRIM_IDS[number]));
  });
}

function beginPilgrimWinConversion(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>, event: Record<string, unknown>, open: Parameters<SkillHandler>[0]["openDecision"]): unknown {
  const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  if (!winners.includes(player.id)) return;
  const candidate = physicalSkill(state, player, skillId, definitions, ["hand"]);
  if (!candidate) return;
  openDecision(state, player, skillId, "pilgrim-win-convert", { candidates: [candidate.instanceId] }, [
    { id: "decline", label: "Decline" },
    { id: candidate.instanceId, label: definitions[candidate.definitionId]?.name ?? candidate.definitionId },
  ], 1, 1, open);
  return { pending: true };
}

export const useArtoriaAvalon: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision: open, emitEvent }) => {
  if (!definitions) throw new Error("ARTORIA_AVALON_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (skill.id === ARTORIA_AROUND_ID) {
    if (eventType === "card.played") return handleAroundPlayed(state, player, event, definitions);
    if (data.abilityId === ARTORIA_AROUND_RETURN) return beginAroundReturn(state, player, definitions, open);
  }
  if (skill.id === ARTORIA_ROUND_ID) {
    if (["card.played", "card.zone.changed", "card.discarded", "round.started"].includes(String(eventType))) return syncRoundOfAvalon(state, player, definitions, emitEvent);
    if (eventType === "combat.resolved") {
      const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
      if (!activeSkill(state, player, ARTORIA_ROUND_ID, definitions) || !winners.includes(player.id)) return;
      return { recycledInstanceIds: recycleDiscardAfterWin(state, player, randomInt ?? (() => 0)), ...syncRoundOfAvalon(state, player, definitions, emitEvent) as Record<string, unknown> };
    }
  }
  if (skill.id === ARTORIA_CALL_ID && data.abilityId === ARTORIA_CALL_MOVE) {
    if (player.locationId === "scouting") gainVictoryPoints(player, 2);
    return beginPilgrimCall(state, player, definitions, open);
  }
  if (skill.id === ARTORIA_RESPITE_ID && data.abilityId === ARTORIA_RESPITE_GAIN) {
    const gained = gainMana(player, 2);
    return gained > 0 ? { manaGained: gained, victoryPointsGained: 0 } : { manaGained: 0, victoryPointsGained: gainVictoryPoints(player, 2) };
  }
  if (skill.id === ARTORIA_DESTINY_ID && eventType === "combat.resolved") {
    const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
    const source = activeSkill(state, player, ARTORIA_DESTINY_ID, definitions);
    if (source && winners.includes(player.id) && winners.length > 1) return { victoryPointsGained: gainVictoryPoints(player, 2) };
  }
  if (PILGRIM_IDS.includes(skill.id as typeof PILGRIM_IDS[number]) && eventType === "combat.resolved") {
    return beginPilgrimWinConversion(state, player, skill.id, definitions, event, open);
  }
};

export const resolveArtoriaAvalon: SkillHandler = ({ state, player, payload, definitions, randomInt, emitEvent }) => {
  if (!definitions || !isRecord(payload)) throw new Error("ARTORIA_AVALON_DECISION_INVALID");
  const previous = isRecord(payload.previous) ? payload.previous : payload;
  const decision = isRecord(payload.decision) ? payload.decision : undefined;
  const selections = Array.isArray(decision?.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision?.status !== "resolved" || selections.length !== 1) throw new Error("ARTORIA_AVALON_DECISION_INVALID");
  const stage = String(previous.stage ?? "");
  if (stage === "around-return") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selections[0]) || !aroundReturnCandidates(state, player, definitions).includes(selections[0])) throw new Error("ARTORIA_AROUND_RETURN_INVALID");
    movePlayerCard(state, player.id, selections[0], "hand");
    return { returnedInstanceId: selections[0] };
  }
  if (stage === "call-move") {
    const options = Array.isArray(previous.options) ? previous.options.filter(isRecord) : [];
    const selected = options.find((option) => option.id === selections[0]);
    const directions = Array.isArray(selected?.directions) ? selected.directions.filter((value): value is "forward" | "backward" => value === "forward" || value === "backward") : undefined;
    if (!directions || directions.length > 2) throw new Error("ARTORIA_CALL_MOVE_INVALID");
    const movements = directions.map((direction) => movePlayerOneSpaceByEffect(state, player.id, direction, definitions));
    for (const movement of movements) {
      emitEvent?.("player.moved", { playerId: player.id, ...movement, method: "effect", sourceId: ARTORIA_CALL_ID });
      emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect", sourceId: ARTORIA_CALL_ID });
    }
    return { targetLocationId: player.locationId, movements };
  }
  if (stage === "pilgrim-win-convert") {
    if (selections[0] === "decline") return { converted: false };
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    const instanceId = selections[0];
    if (!candidates.includes(instanceId) || !player.hand.includes(instanceId)) throw new Error("ARTORIA_PILGRIM_CONVERSION_INVALID");
    const definition = definitions[state.cards[instanceId]?.definitionId ?? ""];
    if (!definition?.linkedSkillId || !PILGRIM_IDS.includes(definition.linkedSkillId as typeof PILGRIM_IDS[number])) throw new Error("ARTORIA_PILGRIM_CONVERSION_INVALID");
    removePhysicalCardFromGame(state, instanceId);
    const luckInstanceId = createLuckAndShuffle(state, player, randomInt ?? (() => 0), definition.linkedSkillId);
    return { converted: true, removedInstanceId: instanceId, luckInstanceId };
  }
  throw new Error("ARTORIA_AVALON_DECISION_STAGE_INVALID");
};

export const isArtoriaAvalonLegal: SkillLegalityPredicate = (state: GameState, playerId: string, skill?: SkillDefinition, ability?: SkillAbilityDefinition, definitions?: Record<string, CardDefinition>) => {
  const player = state.players[playerId];
  if (!player || !skill || !ability || !definitions || state.activePlayerId !== playerId) return false;
  if (skill.id === ARTORIA_AROUND_ID && ability.id === ARTORIA_AROUND_RETURN) return state.phase === "combat" && Boolean(activeSkill(state, player, skill.id, definitions)) && aroundReturnCandidates(state, player, definitions).length > 0;
  if (skill.id === ARTORIA_CALL_ID && ability.id === ARTORIA_CALL_MOVE) return state.phase === "action" && Boolean(activeSkill(state, player, skill.id, definitions)) && movementOptions(state, player, definitions).length > 0;
  if (skill.id === ARTORIA_RESPITE_ID && ability.id === ARTORIA_RESPITE_GAIN) return state.phase === "action" && Boolean(activeSkill(state, player, skill.id, definitions));
  return false;
};

export function getArtoriaAvalonRoundPower(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): number {
  const source = activeSkill(state, player, ARTORIA_ROUND_ID, definitions);
  return source ? getCardRulePowerAdd(state, player, source) + Math.min(15, countDiscardLuck(state, player) * 5) : 0;
}
