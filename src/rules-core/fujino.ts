import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { clearMovementArrowOverride, setMovementArrowOverride } from "./board.ts";
import type { CardDefinition } from "./content-types.ts";
import { createDerivedCardInstance, movePlayerCard } from "./decks.ts";
import { adjustVictoryPoints, gainVictoryPoints, loseMana } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const FUJINO_HYPOSTHESIA_ID = "master.fujino.skill.s1a";
export const FUJINO_WARP_ID = "master.fujino.skill.s2";
export const FUJINO_DISTORTION_ID = "master.fujino.skill.s3";
export const FUJINO_INJURY_ID = "master.fujino.skill.s4";
export const FUJINO_ASCENSION_ID = "master.fujino.skill.ascension";
export const FUJINO_HANDLER = "core.fujino-injury-warp";
export const FUJINO_RESOLVE = "core.fujino-injury-warp-resolve";
export const FUJINO_BEND_ABILITY = "bend-space";
export const FUJINO_REPAIR_ABILITY = "repair-space";

export const FUJINO_INJURIES = ["head", "shoulder", "stomach", "wrist", "leg", "spinal"] as const;
export type FujinoInjuryId = typeof FUJINO_INJURIES[number];

const INJURY_LABELS: Readonly<Record<FujinoInjuryId, string>> = Object.freeze({
  head: "Head Injury",
  shoulder: "Shoulder Injury",
  stomach: "Stomach Injury",
  wrist: "Wrist Injury",
  leg: "Leg Injury",
  spinal: "Spinal Injury",
});

const SHOULDER_MODIFIER_ID = `${FUJINO_INJURY_ID}:shoulder-basic-minus-one`;
const PAIN_MODIFIER_ID = `${FUJINO_INJURY_ID}:pain-skill-cost-minus-one`;
const WARP_ARROWS = Object.freeze({ workshop: "city", city: "mountain", mountain: "scouting" });

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isInjuryId(value: unknown): value is FujinoInjuryId {
  return typeof value === "string" && (FUJINO_INJURIES as readonly string[]).includes(value);
}

function injuryDeck(player: PlayerState): FujinoInjuryId[] {
  const raw = player.flags.fujinoInjuryDeck;
  if (!Array.isArray(raw)) {
    const initial = [...FUJINO_INJURIES];
    player.flags.fujinoInjuryDeck = initial;
    return initial;
  }
  return raw.filter(isInjuryId);
}

function activeInjuries(player: PlayerState): FujinoInjuryId[] {
  const raw = player.flags.fujinoActiveInjuries;
  return Array.isArray(raw) ? raw.filter(isInjuryId) : [];
}

function setActiveInjuries(player: PlayerState, ids: readonly FujinoInjuryId[]): void {
  player.flags.fujinoActiveInjuries = [...new Set(ids)];
}

function painCount(player: PlayerState): number {
  const count = Number(player.flags.fujinoPainCount ?? 0);
  if (!Number.isInteger(count) || count < 0) throw new Error("FUJINO_PAIN_STATE_INVALID");
  return count;
}

function ownedSkillCards(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).filter((card) => {
    if (card.ownerPlayerId !== player.id || card.zone === "removed") return false;
    const definition = definitions[card.definitionId];
    return card.definitionId === skillId || card.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
  });
}

function physicalSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return ownedSkillCards(state, player, skillId, definitions)[0];
}

function syncContinuousInjuryState(state: GameState, player: PlayerState): void {
  state.activeRuleModifiers ??= [];
  state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => modifier.id !== SHOULDER_MODIFIER_ID && modifier.id !== PAIN_MODIFIER_ID);
  const injuries = activeInjuries(player);
  if (injuries.includes("shoulder")) {
    state.activeRuleModifiers.push({
      id: SHOULDER_MODIFIER_ID,
      sourceId: FUJINO_INJURY_ID,
      controllerPlayerId: player.id,
      operation: "subtract",
      rule: "card_power",
      scope: { subject: "controller", cards: { basic: true } },
      value: 1,
      duration: "game",
      createdRound: state.round,
    });
  }
  if (injuries.includes("stomach")) player.flags.deploymentForbiddenBonusValues = [2, 3];
  else delete player.flags.deploymentForbiddenBonusValues;
  if (painCount(player) > 0) {
    state.activeRuleModifiers.push({
      id: PAIN_MODIFIER_ID,
      sourceId: FUJINO_INJURY_ID,
      controllerPlayerId: player.id,
      operation: "subtract",
      rule: "card_cost",
      scope: { subject: "controller", cards: { skill: true } },
      value: 1,
      duration: "game",
      createdRound: state.round,
    });
  }
}

function randomDiscardOne(context: Parameters<SkillHandler>[0], sourceId: string): string | undefined {
  const { state, player, randomInt, emitEvent } = context;
  if (player.hand.length === 0) return undefined;
  const index = (randomInt ?? (() => 0))(player.hand.length);
  if (!Number.isInteger(index) || index < 0 || index >= player.hand.length) throw new Error("FUJINO_RANDOM_INVALID");
  const instanceId = player.hand[index];
  movePlayerCard(state, player.id, instanceId, "discard");
  const card = state.cards[instanceId];
  card.face = "up";
  card.active = false;
  card.residual = false;
  emitEvent?.("card.discarded", { playerId: player.id, instanceId, definitionId: card.definitionId, sourceId, random: true });
  return instanceId;
}

function addDistortionToAttack(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string {
  const candidate = ownedSkillCards(state, player, FUJINO_DISTORTION_ID, definitions)
    .find((card) => card.zone === "master-skills" || card.zone === "hand" || card.zone === "discard")
    ?? ownedSkillCards(state, player, FUJINO_DISTORTION_ID, definitions).find((card) => card.zone === "attack");
  if (!candidate) throw new Error("FUJINO_DISTORTION_CARD_MISSING");
  if (candidate.zone !== "attack") movePlayerCard(state, player.id, candidate.instanceId, "attack");
  candidate.face = "up";
  candidate.active = true;
  candidate.residual = definitions[candidate.definitionId]?.residual === true;
  candidate.paidCost = 0;
  candidate.playedRound = state.round;
  return candidate.instanceId;
}

function gainInjury(context: Parameters<SkillHandler>[0], injuryId: FujinoInjuryId) {
  const { state, player, definitions } = context;
  if (!definitions) throw new Error("FUJINO_DEFINITIONS_REQUIRED");
  const deck = injuryDeck(player);
  if (!deck.includes(injuryId)) throw new Error("FUJINO_INJURY_NOT_AVAILABLE");
  player.flags.fujinoInjuryDeck = deck.filter((id) => id !== injuryId);
  const current = activeInjuries(player);
  setActiveInjuries(player, [...current, injuryId]);

  if (injuryId === "head") randomDiscardOne(context, FUJINO_INJURY_ID);
  if (injuryId === "spinal") {
    const active = activeInjuries(player);
    const distortionInstanceId = addDistortionToAttack(state, player, definitions);
    player.flags.fujinoInjuryDeck = [];
    player.flags.fujinoPainCount = active.length;
    player.flags.fujinoSpinalOccurred = true;
    setActiveInjuries(player, []);
    syncContinuousInjuryState(state, player);
    return { injuryId, distortionInstanceId, painCount: active.length, convertedToPain: true };
  }
  syncContinuousInjuryState(state, player);
  return { injuryId, convertedToPain: false };
}

function openInjuryChoice(context: Parameters<SkillHandler>[0]) {
  const { state, player, skill, randomInt, openDecision } = context;
  const deck = injuryDeck(player);
  if (deck.length === 0) return { skipped: true, reason: "injury-deck-empty" };
  const random = randomInt ?? (() => 0);
  const firstIndex = random(deck.length);
  if (!Number.isInteger(firstIndex) || firstIndex < 0 || firstIndex >= deck.length) throw new Error("FUJINO_RANDOM_INVALID");
  const first = deck[firstIndex];
  if (deck.length === 1) return gainInjury(context, first);
  const remaining = deck.filter((_, index) => index !== firstIndex);
  const secondIndex = random(remaining.length);
  if (!Number.isInteger(secondIndex) || secondIndex < 0 || secondIndex >= remaining.length) throw new Error("FUJINO_RANDOM_INVALID");
  const second = remaining[secondIndex];
  const candidates = [first, second];
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:injury-choice`;
  state.effectQueue.unshift({
    effectId,
    handlerId: FUJINO_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { stage: "injury-choice", candidates },
    createdAtRevision: state.revision,
  });
  const options: PendingDecision["options"] = candidates.map((id) => ({ id, label: INJURY_LABELS[id] }));
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "fujino-hyposthesia-injury",
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, candidates };
}

function bendSpace(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("FUJINO_BEND_WINDOW_INVALID");
  const distortion = ownedSkillCards(state, player, FUJINO_DISTORTION_ID, definitions)
    .find((card) => card.zone === "attack" && card.active && card.face === "up");
  if (!distortion) throw new Error("FUJINO_DISTORTION_INACTIVE");
  const warp = physicalSkill(state, player, FUJINO_WARP_ID, definitions);
  if (!warp || warp.zone === "removed" || warp.zone === "discard") throw new Error("FUJINO_WARP_CARD_MISSING");
  warp.face = "up";
  warp.active = true;
  setMovementArrowOverride(state, { sourceId: FUJINO_WARP_ID, sourceInstanceId: warp.instanceId, arrows: { ...WARP_ARROWS } });
  return { warpInstanceId: warp.instanceId, active: true };
}

function repairSpace(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  const warp = physicalSkill(state, player, FUJINO_WARP_ID, definitions);
  if (!warp?.active) throw new Error("FUJINO_WARP_INACTIVE");
  warp.active = false;
  clearMovementArrowOverride(state, FUJINO_WARP_ID);
  return { warpInstanceId: warp.instanceId, active: false };
}

function discardOnePain(state: GameState, player: PlayerState) {
  const before = painCount(player);
  if (before <= 0) return;
  const after = before - 1;
  player.flags.fujinoPainCount = after;
  syncContinuousInjuryState(state, player);
  let victoryPoints = 0;
  if (after === 0 && player.flags.fujinoSpinalOccurred === true && player.flags.fujinoAscensionUnlocked === true
    && player.flags.fujinoPainRewardGranted !== true) {
    victoryPoints = gainVictoryPoints(player, 4);
    player.flags.fujinoPainRewardGranted = true;
  }
  return { painBefore: before, painAfter: after, victoryPoints };
}

function unlockAscension(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  player.flags.fujinoAscensionUnlocked = true;
  const existing = ownedSkillCards(state, player, FUJINO_DISTORTION_ID, definitions);
  if (existing.length >= 2) return { createdInstanceId: null };
  const definitionId = definitions[`card.skill.${FUJINO_DISTORTION_ID}`]
    ? `card.skill.${FUJINO_DISTORTION_ID}`
    : definitions[FUJINO_DISTORTION_ID] ? FUJINO_DISTORTION_ID : undefined;
  if (!definitionId) throw new Error("FUJINO_DISTORTION_DEFINITION_MISSING");
  const baseId = `${player.id}:fujino-ascension-distortion`;
  const instanceId = state.cards[baseId] ? `${baseId}:${state.revision}` : baseId;
  createDerivedCardInstance(state, player.id, {
    instanceId,
    definitionId,
    originMasterId: "master.fujino",
    zone: "master-skills",
    face: "up",
    active: false,
    residual: false,
    sourceEffectId: FUJINO_ASCENSION_ID,
  });
  return { createdInstanceId: instanceId };
}

export const resolveFujinoDecision: SkillHandler = (context) => {
  const { payload } = context;
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("FUJINO_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter(isInjuryId) : [];
  if (previous.stage !== "injury-choice" || decision.status !== "resolved" || selections.length !== 1 || !isInjuryId(selections[0]) || !candidates.includes(selections[0])) {
    throw new Error("FUJINO_DECISION_INVALID");
  }
  return gainInjury(context, selections[0]);
};

export const useFujinoPackage: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions } = context;
  if (!definitions) throw new Error("FUJINO_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === FUJINO_HYPOSTHESIA_ID) {
    if (eventType !== "phase.transitioned" || state.phase !== "combat" || state.activePlayerId !== player.id
      || (player.locationId !== "mountain" && player.locationId !== "city")) return;
    return openInjuryChoice(context);
  }
  if (skill.id === FUJINO_WARP_ID) {
    if (data.abilityId !== FUJINO_REPAIR_ABILITY) return;
    return repairSpace(state, player, definitions);
  }
  if (skill.id === FUJINO_DISTORTION_ID) {
    if (data.abilityId !== FUJINO_BEND_ABILITY) return;
    return bendSpace(state, player, definitions);
  }
  if (skill.id === FUJINO_INJURY_ID) {
    if (eventType === "phase.transitioned" && state.phase === "action" && state.activePlayerId === player.id && activeInjuries(player).includes("head")) {
      return { discardedInstanceId: randomDiscardOne(context, FUJINO_INJURY_ID) ?? null };
    }
    if (eventType === "player.moved" && event.playerId === player.id && state.activePlayerId === player.id && activeInjuries(player).includes("leg")) {
      return { lostMana: loseMana(player, 1) };
    }
    if (eventType === "player.command-seal-used" && event.playerId === player.id && activeInjuries(player).includes("wrist")) {
      const amount = Number(event.amount ?? 1);
      if (!Number.isInteger(amount) || amount < 1) throw new Error("FUJINO_COMMAND_SEAL_EVENT_INVALID");
      return { lostVictoryPoints: -adjustVictoryPoints(player, -amount) };
    }
    if (eventType === "combat.ending") return discardOnePain(state, player);
    return;
  }
  if (skill.id === FUJINO_ASCENSION_ID && eventType === "skill.unlocked") {
    if (event.playerId !== player.id || event.skillId !== skill.id) return;
    return unlockAscension(state, player, definitions);
  }
};

export const isFujinoPackageLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !ability) return false;
  if (skill.id === FUJINO_DISTORTION_ID && ability.id === FUJINO_BEND_ABILITY) {
    return state.phase === "action" && state.activePlayerId === playerId
      && ownedSkillCards(state, player, FUJINO_DISTORTION_ID, definitions).some((card) => card.zone === "attack" && card.active && card.face === "up")
      && Boolean(physicalSkill(state, player, FUJINO_WARP_ID, definitions));
  }
  if (skill.id === FUJINO_WARP_ID && ability.id === FUJINO_REPAIR_ABILITY) {
    return Boolean(physicalSkill(state, player, FUJINO_WARP_ID, definitions)?.active);
  }
  return false;
};
