import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { addCardToAttack, playBorrowedCardToAttack } from "./card-play.ts";
import { attachCard, getAttachedCards } from "./card-attachments.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";
import { transferPhysicalCardToPlayerZone } from "./decks.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const TAMAMO_CASCADE_ID = "servant.tamamo.skill.sc-tamamo-1";
export const TAMAMO_WITCHCRAFT_ID = "servant.tamamo.skill.sc-tamamo-2";
export const TAMAMO_TRANSCENDENCE_ID = "servant.tamamo.skill.sc-tamamo-3";
export const TAMAMO_CASCADE_HANDLER = "core.tamamo-cascade";
export const TAMAMO_CASCADE_RESOLVE = "core.tamamo-cascade-resolve";
export const TAMAMO_WITCHCRAFT_HANDLER = "core.tamamo-witchcraft";
export const TAMAMO_TRANSCENDENCE_HANDLER = "core.tamamo-transcendence";
export const TAMAMO_TRANSCENDENCE_RESOLVE = "core.tamamo-transcendence-resolve";

const LUCK_ID = "card.cardluck";
const PREPARATION_ID = "card.cardpreparation";
const CASCADE_ABILITY = "cascade";
const WEIRDING_HEX_ABILITY = "weirding-hex";
const TRANSCENDENCE_ABILITY = "transcendence";
const CASCADE_MARKER_PREFIX = "tamamo-cascade-unlocked";
const TRANSCENDENCE_ARMED_FLAG = "tamamoTranscendenceArmedRound";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function ownedSkillSource(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
  activeOnly = false,
): CardInstance | undefined {
  return [...new Set([...player.servantSkills, ...player.attack, ...player.hand])]
    .map((instanceId) => state.cards[instanceId])
    .find((card) => {
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || card.ownerPlayerId !== player.id || card.zone === "removed" || card.zone === "discard"
        || !matchesSkill(definition, card.definitionId, skillId)) return false;
      return !activeOnly || (card.zone === "attack" && card.active && card.face === "up");
    });
}

function installMagicPenetration(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): void {
  const source = ownedSkillSource(state, player, TAMAMO_WITCHCRAFT_ID, definitions);
  if (!source) return;
  const id = `${TAMAMO_WITCHCRAFT_ID}:magic-penetration:${source.instanceId}`;
  if ((player.cardRuleModifiers ?? []).some((modifier) => modifier.id === id)) return;
  addCardRuleModifier(player, {
    id,
    sourceId: TAMAMO_WITCHCRAFT_ID,
    sourceInstanceId: source.instanceId,
    targetDefinitionIds: Object.keys(definitions),
    preventOpponentPowerReduction: true,
    preventOpponentClose: true,
    protectionAttributes: ["魔术"],
    duration: "while-source-present",
  });
}

function markCascadeUnlocked(card: CardInstance, round: number): void {
  const marker = `${CASCADE_MARKER_PREFIX}:${round}`;
  card.modifiers = [...(card.modifiers ?? []).filter((value) => !value.startsWith(`${CASCADE_MARKER_PREFIX}:`)), marker];
}

function isCascadeUnlocked(card: CardInstance, round: number): boolean {
  return (card.modifiers ?? []).includes(`${CASCADE_MARKER_PREFIX}:${round}`);
}

function clearCascadeMarker(card: CardInstance): void {
  card.modifiers = (card.modifiers ?? []).filter((value) => !value.startsWith(`${CASCADE_MARKER_PREFIX}:`));
}

function transcendenceCandidateIds(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  const playerIds = state.board.locations[locationId] ?? [];
  const result: string[] = [];
  for (const playerId of playerIds) {
    const controller = state.players[playerId];
    if (!controller || controller.eliminated) continue;
    for (const instanceId of controller.attack) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || !definition || definition.basic !== true || !card.active || card.face !== "up") continue;
      const attributes = getCardInstanceAttributes(card, definition, state, definitions);
      if (attributes.includes("魔术") || card.definitionId === LUCK_ID || card.definitionId === PREPARATION_ID) result.push(instanceId);
    }
  }
  return [...new Set(result)];
}

function lockCard(state: GameState, source: CardInstance, instanceId: string): { lockedInstanceId: string } {
  attachCard(state, instanceId, source.instanceId, "up");
  return { lockedInstanceId: instanceId };
}

function openTranscendenceDecision(
  state: GameState,
  player: PlayerState,
  source: CardInstance,
  candidates: string[],
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${TAMAMO_TRANSCENDENCE_ID}:lock`;
  state.effectQueue.unshift({
    effectId,
    handlerId: TAMAMO_TRANSCENDENCE_RESOLVE,
    sourceId: TAMAMO_TRANSCENDENCE_ID,
    controllerPlayerId: player.id,
    payload: { stage: "lock", sourceInstanceId: source.instanceId, candidateIds: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "tamamo-transcendence-lock",
    options: candidates.map((instanceId) => ({ id: instanceId, label: instanceId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function playLockedCards(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  emitEvent?: SkillContext["emitEvent"],
) {
  const host = ownedSkillSource(state, player, TAMAMO_TRANSCENDENCE_ID, definitions);
  if (!host) throw new Error("TAMAMO_TRANSCENDENCE_SOURCE_MISSING");
  const instanceIds = getAttachedCards(state, host.instanceId).map((card) => card.instanceId);
  if (instanceIds.length === 0) throw new Error("TAMAMO_CASCADE_NO_LOCKED_CARDS");

  const playOne = (draft: GameState, instanceId: string) => {
    const card = draft.cards[instanceId];
    if (!card?.ownerPlayerId) throw new Error("TAMAMO_CASCADE_CARD_INVALID");
    return card.ownerPlayerId === player.id
      ? addCardToAttack(draft, player.id, instanceId, definitions, {
        payCost: true,
        allowedSourceZones: ["attached"],
        bypassFaceUpPlayLimit: true,
        bypassTiming: true,
      })
      : playBorrowedCardToAttack(draft, player.id, instanceId, definitions, {
        allowedSourceZones: ["attached"],
        bypassFaceUpPlayLimit: true,
      });
  };

  const draft = structuredClone(state) as GameState;
  for (const instanceId of instanceIds) playOne(draft, instanceId);

  const played: Array<{ instanceId: string; paidMana: number }> = [];
  for (const instanceId of instanceIds) {
    const result = playOne(state, instanceId);
    const card = state.cards[instanceId];
    const definition = definitions[card.definitionId];
    markCascadeUnlocked(card, state.round);
    const attributes = getCardInstanceAttributes(card, definition, state, definitions);
    emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana: result.paidMana, attributes, method: "tamamo-cascade" });
    emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, attributes, method: "tamamo-cascade" });
    played.push({ instanceId, paidMana: result.paidMana });
  }
  return { played };
}

function cascadeCards(state: GameState, round: number): CardInstance[] {
  return Object.values(state.cards).filter((card) => isCascadeUnlocked(card, round));
}

function resolveCascadeDisposition(
  state: GameState,
  player: PlayerState,
  resealIds: string[],
  definitions: Record<string, CardDefinition>,
) {
  const cards = cascadeCards(state, state.round);
  const liveIds = new Set(cards.map((card) => card.instanceId));
  if (new Set(resealIds).size !== resealIds.length || resealIds.some((id) => !liveIds.has(id))) throw new Error("TAMAMO_CASCADE_RESEAL_INVALID");
  const host = ownedSkillSource(state, player, TAMAMO_TRANSCENDENCE_ID, definitions);
  if (resealIds.length > 0 && !host) throw new Error("TAMAMO_TRANSCENDENCE_SOURCE_MISSING");
  if (player.mana < resealIds.length) throw new Error("TAMAMO_CASCADE_MANA_INSUFFICIENT");
  if (resealIds.length > 0) {
    payManaCost(state, player, resealIds.length, definitions);
    player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + resealIds.length;
  }
  const reseal = new Set(resealIds);
  const discarded: string[] = [];
  for (const card of cards) {
    clearCascadeMarker(card);
    if (reseal.has(card.instanceId)) attachCard(state, card.instanceId, host!.instanceId, "up");
    else {
      transferPhysicalCardToPlayerZone(state, player.id, card.instanceId, "discard");
      discarded.push(card.instanceId);
    }
  }
  return { resealedInstanceIds: [...reseal], discardedInstanceIds: discarded, paidMana: reseal.size };
}

function openCascadeDispositionDecision(
  state: GameState,
  player: PlayerState,
  cards: CardInstance[],
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${TAMAMO_CASCADE_ID}:after-combat`;
  state.effectQueue.unshift({
    effectId,
    handlerId: TAMAMO_CASCADE_RESOLVE,
    sourceId: TAMAMO_CASCADE_ID,
    controllerPlayerId: player.id,
    payload: { stage: "after-combat", candidateIds: cards.map((card) => card.instanceId) },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "tamamo-cascade-reseal",
    options: cards.map((card) => ({ id: card.instanceId, label: card.instanceId })),
    min: 0,
    max: Math.min(cards.length, player.mana),
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

export const useTamamoWitchcraft: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("TAMAMO_WITCHCRAFT_DEFINITIONS_REQUIRED");
  installMagicPenetration(state, player, definitions);
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "game.started") return { installed: true };
  if (data.abilityId !== WEIRDING_HEX_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("TAMAMO_WITCHCRAFT_ABILITY_INVALID");
  }
  const id = `${TAMAMO_WITCHCRAFT_ID}:weirding-hex:${state.round}`;
  if (!(player.cardRuleModifiers ?? []).some((modifier) => modifier.id === id)) {
    addCardRuleModifier(player, {
      id,
      sourceId: TAMAMO_WITCHCRAFT_ID,
      targetDefinitionIds: [LUCK_ID, PREPARATION_ID],
      replaceAttributes: ["魔术"],
      duration: "round",
    });
  }
  return { transformedDefinitionIds: [LUCK_ID, PREPARATION_ID] };
};

export const isTamamoWitchcraftLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  return Boolean(player && ability?.id === WEIRDING_HEX_ABILITY && state.phase === "action" && state.activePlayerId === playerId);
};

export const useTamamoTranscendence: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("TAMAMO_TRANSCENDENCE_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "combat.ending") {
    if (Number(player.flags[TRANSCENDENCE_ARMED_FLAG] ?? -1) !== state.round) return;
    delete player.flags[TRANSCENDENCE_ARMED_FLAG];
    const source = ownedSkillSource(state, player, TAMAMO_TRANSCENDENCE_ID, definitions);
    if (!source) return;
    const candidates = transcendenceCandidateIds(state, player, definitions);
    if (candidates.length === 0) return { lockedInstanceId: null };
    if (candidates.length === 1) return lockCard(state, source, candidates[0]);
    openTranscendenceDecision(state, player, source, candidates, openDecision);
    return { pending: true, candidateIds: candidates };
  }
  if (payload.abilityId !== TRANSCENDENCE_ABILITY || state.phase !== "combat" || state.activePlayerId !== player.id
    || !ownedSkillSource(state, player, TAMAMO_TRANSCENDENCE_ID, definitions, true)) {
    throw new Error("TAMAMO_TRANSCENDENCE_ABILITY_INVALID");
  }
  player.flags[TRANSCENDENCE_ARMED_FLAG] = state.round;
  return { armedRound: state.round };
};

export const resolveTamamoTranscendence: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("TAMAMO_TRANSCENDENCE_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  const candidates = Array.isArray(previous.candidateIds) ? previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  if (previous.stage !== "lock" || decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])
    || !transcendenceCandidateIds(state, player, definitions).includes(selections[0])) throw new Error("TAMAMO_TRANSCENDENCE_DECISION_INVALID");
  const source = typeof previous.sourceInstanceId === "string" ? state.cards[previous.sourceInstanceId] : undefined;
  if (!source || source.ownerPlayerId !== player.id || source.zone === "removed") throw new Error("TAMAMO_TRANSCENDENCE_SOURCE_MISSING");
  return lockCard(state, source, selections[0]);
};

export const isTamamoTranscendenceLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === TRANSCENDENCE_ABILITY && state.phase === "combat" && state.activePlayerId === playerId
    && ownedSkillSource(state, player, TAMAMO_TRANSCENDENCE_ID, definitions, true));
};

export const useTamamoCascade: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload)) throw new Error("TAMAMO_CASCADE_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "combat.ending") {
    const cards = cascadeCards(state, state.round);
    if (cards.length === 0) return;
    const host = ownedSkillSource(state, player, TAMAMO_TRANSCENDENCE_ID, definitions);
    if (!host || player.mana <= 0) return resolveCascadeDisposition(state, player, [], definitions);
    openCascadeDispositionDecision(state, player, cards, openDecision);
    return { pending: true, candidateIds: cards.map((card) => card.instanceId) };
  }
  if (payload.abilityId !== CASCADE_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id
    || !ownedSkillSource(state, player, TAMAMO_CASCADE_ID, definitions, true)) {
    throw new Error("TAMAMO_CASCADE_ABILITY_INVALID");
  }
  return playLockedCards(state, player, definitions, emitEvent);
};

export const resolveTamamoCascade: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("TAMAMO_CASCADE_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const candidates = Array.isArray(previous.candidateIds) ? previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  const live = new Set(cascadeCards(state, state.round).map((card) => card.instanceId));
  if (previous.stage !== "after-combat" || decision.status !== "resolved" || selections.some((id) => !candidates.includes(id) || !live.has(id))) {
    throw new Error("TAMAMO_CASCADE_DECISION_INVALID");
  }
  return resolveCascadeDisposition(state, player, selections, definitions);
};

export const isTamamoCascadeLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== CASCADE_ABILITY || state.phase !== "action" || state.activePlayerId !== playerId
    || !ownedSkillSource(state, player, TAMAMO_CASCADE_ID, definitions, true)) return false;
  const host = ownedSkillSource(state, player, TAMAMO_TRANSCENDENCE_ID, definitions);
  return Boolean(host && getAttachedCards(state, host.instanceId).length > 0);
};
