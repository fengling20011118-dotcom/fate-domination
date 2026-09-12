import type { GameState, PlayerState } from "../domain/state/types.ts";
import { StateRandom } from "../match-engine/random.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { createDerivedCardInstance, drawCards, ensurePlayerDeckTopCards, movePlayerCard, shufflePlayerDeck } from "./decks.ts";
import { adjustVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const NANAYA_DEMON_HUNTER_ID = "master.shiki-nanaya.skill.s1b";
export const NANAYA_DEATH_PERCEPTION_ID = "master.shiki-nanaya.skill.s2";
export const NANAYA_DARK_COMPULSION_ID = "master.shiki-nanaya.skill.ascension";
export const NANAYA_FLASH_DRAW_ID = "card.card-flash-blade";
export const NANAYA_FLASH_STEP_ID = "card.card-flash-step";

export const NANAYA_DEMON_HUNTER_HANDLER = "core.nanaya-demon-hunter";
export const NANAYA_DEATH_PERCEPTION_HANDLER = "core.nanaya-death-perception";
export const NANAYA_DARK_COMPULSION_HANDLER = "core.nanaya-dark-compulsion";
export const NANAYA_DECISION_RESOLVE = "core.nanaya-decision-resolve";

const GAZE_ABILITY = "gaze-of-death";
const DARK_COMPULSION_ABILITY = "dark-compulsion";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function selectedIds(payload: Record<string, unknown>): string[] {
  const decision = isRecord(payload.decision) ? payload.decision : {};
  return Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
}

function randomIntFor(state: GameState): (maxExclusive: number) => number {
  const random = new StateRandom();
  return (maxExclusive) => random.integer(state, maxExclusive);
}

function openContinuation(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  stage: string,
  payload: Record<string, unknown>,
  options: Array<{ id: string; label: string }>,
  min: number,
  max: number,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: NANAYA_DECISION_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `nanaya-${stage}`,
    options,
    min,
    max,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function flashCreatedCount(player: PlayerState, definitionId: string): number {
  return definitionId === NANAYA_FLASH_DRAW_ID
    ? Number(player.flags.nanayaFlashDrawCreatedCount ?? 0)
    : Number(player.flags.nanayaFlashStepCreatedCount ?? 0);
}

function setFlashCreatedCount(player: PlayerState, definitionId: string, count: number): void {
  if (definitionId === NANAYA_FLASH_DRAW_ID) player.flags.nanayaFlashDrawCreatedCount = count;
  else player.flags.nanayaFlashStepCreatedCount = count;
}

function createFlashCard(state: GameState, player: PlayerState, definitionId: string, sourceId: string): string {
  const next = flashCreatedCount(player, definitionId) + 1;
  if (next > 3) throw new Error("NANAYA_FLASH_STOCK_EXHAUSTED");
  setFlashCreatedCount(player, definitionId, next);
  const short = definitionId === NANAYA_FLASH_DRAW_ID ? "draw" : "step";
  const instanceId = `${player.id}:nanaya-flash-${short}:${next}`;
  createDerivedCardInstance(state, player.id, {
    instanceId,
    definitionId,
    originMasterId: "master.shiki-nanaya",
    zone: "deck",
    sourceEffectId: sourceId,
    createdByPlayerId: player.id,
  });
  return instanceId;
}

function capturedIds(player: PlayerState): string[] {
  return Array.isArray(player.flags.nanayaCapturedPlayerIds)
    ? (player.flags.nanayaCapturedPlayerIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
}

function markCaptured(player: PlayerState, targetPlayerId: string): void {
  player.flags.nanayaCapturedPlayerIds = [...new Set([...capturedIds(player), targetPlayerId])];
}

function gazeTargets(state: GameState, player: PlayerState): PlayerState[] {
  const captured = new Set(capturedIds(player));
  return Object.values(state.players).filter((candidate) => !candidate.eliminated && !captured.has(candidate.id));
}

function sameFightCapturedOpponentIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  const captured = new Set(capturedIds(player));
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && captured.has(id) && !state.players[id]?.eliminated);
}

function permutations(values: string[]): string[][] {
  if (values.length <= 1) return [values];
  const out: string[][] = [];
  for (let index = 0; index < values.length; index += 1) {
    const head = values[index];
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const tail of permutations(rest)) out.push([head, ...tail]);
  }
  return out;
}

function reorderDeckTop(player: PlayerState, orderedTopIds: string[]): void {
  const chosen = new Set(orderedTopIds);
  player.deck = [...orderedTopIds, ...player.deck.filter((id) => !chosen.has(id))];
}

/** Secret setup replacement: up to four original deck cards become the six-card Flash stock (3/3). */
export const useNanayaDemonHunter: SkillHandler = ({ state, player, skill, payload, openDecision, definitions, emitEvent }) => {
  if (!definitions) throw new Error("NANAYA_DEMON_HUNTER_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType !== "game.started") return;
  const candidates = [...player.deck];
  openContinuation(
    state,
    player,
    skill.id,
    "replace-originals",
    { candidates },
    candidates.map((instanceId) => ({ instanceId, definitionId: state.cards[instanceId]?.definitionId }))
      .map(({ instanceId, definitionId }) => ({ id: instanceId, label: definitions[definitionId ?? ""]?.name ?? instanceId })),
    0,
    Math.min(4, candidates.length),
    openDecision,
  );
  emitEvent?.("nanaya.demon-hunter-opened", { playerId: player.id });
};

/** Death Perception handles rounds 9/11 and its once-per-player Gaze action. */
export const useNanayaDeathPerception: SkillHandler = ({ state, player, skill, payload, openDecision }) => {
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "round.started") {
    if (state.round !== 9 && state.round !== 11) return;
    const strain = Math.max(0, Number(player.flags.nanayaStrain ?? 0));
    if (!Number.isInteger(strain)) throw new Error("NANAYA_STRAIN_INVALID");
    return { victoryPointsDelta: adjustVictoryPoints(player, -strain), strain };
  }
  if (data.abilityId !== GAZE_ABILITY || state.phase !== "outpost" || state.activePlayerId !== player.id) {
    throw new Error("NANAYA_GAZE_WINDOW_INVALID");
  }
  const targets = gazeTargets(state, player);
  if (targets.length === 0) throw new Error("NANAYA_GAZE_NO_TARGET");
  player.flags.nanayaStrain = Number(player.flags.nanayaStrain ?? 0) + 1;
  openContinuation(
    state,
    player,
    skill.id,
    "gaze-target",
    {},
    targets.map((target) => ({ id: target.id, label: target.name })),
    1,
    1,
    openDecision,
  );
  return { strain: player.flags.nanayaStrain };
};

export const isNanayaDeathPerceptionLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  return Boolean(player && ability?.id === GAZE_ABILITY && state.phase === "outpost" && state.activePlayerId === playerId
    && gazeTargets(state, player).length > 0);
};

/** Dark Compulsion returns all unused Flash stock on unlock and performs its forced combat draw/play. */
export const useNanayaDarkCompulsion: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("NANAYA_DARK_COMPULSION_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "skill.unlocked") {
    const event = isRecord(data.event) ? data.event : {};
    if (event.playerId !== player.id || event.skillId !== skill.id) return;
    const created: string[] = [];
    for (const definitionId of [NANAYA_FLASH_DRAW_ID, NANAYA_FLASH_STEP_ID]) {
      while (flashCreatedCount(player, definitionId) < 3) created.push(createFlashCard(state, player, definitionId, skill.id));
    }
    if (created.length > 0) shufflePlayerDeck(state, player.id, randomIntFor(state));
    return { shuffledInstanceIds: created };
  }
  if (data.abilityId !== DARK_COMPULSION_ABILITY || state.phase !== "combat" || state.activePlayerId !== player.id
    || sameFightCapturedOpponentIds(state, player).length === 0) throw new Error("NANAYA_DARK_COMPULSION_WINDOW_INVALID");
  const drawn = drawCards(state, player.id, 1, randomIntFor(state), definitions);
  const instanceId = drawn[0];
  if (!instanceId) throw new Error("NANAYA_DARK_COMPULSION_DECK_EMPTY");
  const card = state.cards[instanceId];
  const definition = definitions[card.definitionId];
  const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, {
    payCost: true,
    allowedSourceZones: ["hand"],
    bypassTiming: true,
    bypassFaceUpPlayLimit: true,
  });
  if (definition.basic !== true) player.flags.nanayaStrain = Number(player.flags.nanayaStrain ?? 0) + 1;
  emitEvent?.("card.played", {
    playerId: player.id,
    instanceId,
    definitionId: definition.id,
    face: "up",
    paidMana,
    attributes: getCardInstanceAttributes(card, definition, state, definitions),
    method: "nanaya-dark-compulsion",
  });
  emitEvent?.("card.used", {
    playerId: player.id,
    instanceId,
    definitionId: definition.id,
    locationId: player.locationId,
    attributes: getCardInstanceAttributes(card, definition, state, definitions),
    method: "nanaya-dark-compulsion",
  });
  return { instanceId, paidMana, strain: Number(player.flags.nanayaStrain ?? 0) };
};

export const isNanayaDarkCompulsionLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  return Boolean(player && ability?.id === DARK_COMPULSION_ABILITY && state.phase === "combat" && state.activePlayerId === playerId
    && player.deck.length > 0 && sameFightCapturedOpponentIds(state, player).length > 0);
};

/** Serializable continuation shared by setup replacement and Gaze deck editing. */
export const resolveNanayaDecision: SkillHandler = ({ state, player, payload, openDecision, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("NANAYA_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  if (decision.status !== "resolved") throw new Error("NANAYA_DECISION_INVALID");
  const selections = selectedIds(payload);
  const stage = previous.stage;

  if (stage === "replace-originals") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.length > 4 || selections.some((id) => !candidates.includes(id) || !player.deck.includes(id)) || new Set(selections).size !== selections.length) {
      throw new Error("NANAYA_REPLACEMENT_ORIGINAL_INVALID");
    }
    if (selections.length === 0) return { replaced: 0 };
    openContinuation(
      state,
      player,
      NANAYA_DEMON_HUNTER_ID,
      "replace-types",
      { originalInstanceIds: selections },
      [
        { id: "draw-1", label: "闪鞘 1" }, { id: "draw-2", label: "闪鞘 2" }, { id: "draw-3", label: "闪鞘 3" },
        { id: "step-1", label: "闪走 1" }, { id: "step-2", label: "闪走 2" }, { id: "step-3", label: "闪走 3" },
      ],
      selections.length,
      selections.length,
      openDecision,
    );
    return { replacing: selections.length };
  }

  if (stage === "replace-types") {
    const originals = Array.isArray(previous.originalInstanceIds) ? previous.originalInstanceIds.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== originals.length || new Set(selections).size !== selections.length
      || selections.some((id) => !/^(draw|step)-[123]$/.test(id))) throw new Error("NANAYA_REPLACEMENT_TYPE_INVALID");
    for (const instanceId of originals) movePlayerCard(state, player.id, instanceId, "removed");
    const created = selections.map((id) => createFlashCard(state, player, id.startsWith("draw-") ? NANAYA_FLASH_DRAW_ID : NANAYA_FLASH_STEP_ID, NANAYA_DEMON_HUNTER_ID));
    shufflePlayerDeck(state, player.id, randomIntFor(state));
    return { removedInstanceIds: originals, createdInstanceIds: created };
  }

  if (stage === "gaze-target") {
    if (selections.length !== 1) throw new Error("NANAYA_GAZE_TARGET_INVALID");
    const targetPlayerId = selections[0];
    if (!gazeTargets(state, player).some((candidate) => candidate.id === targetPlayerId)) throw new Error("NANAYA_GAZE_TARGET_INVALID");
    const top = ensurePlayerDeckTopCards(state, targetPlayerId, 3, randomIntFor(state));
    if (top.length === 0) {
      markCaptured(player, targetPlayerId);
      return { targetPlayerId, viewedInstanceIds: [] };
    }
    openContinuation(
      state,
      player,
      NANAYA_DEATH_PERCEPTION_ID,
      "gaze-discard",
      { targetPlayerId, topInstanceIds: top },
      top.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
      0,
      top.length,
      openDecision,
    );
    return { targetPlayerId, viewedInstanceIds: top };
  }

  if (stage === "gaze-discard") {
    const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
    const top = Array.isArray(previous.topInstanceIds) ? previous.topInstanceIds.filter((id): id is string => typeof id === "string") : [];
    const target = targetPlayerId ? state.players[targetPlayerId] : undefined;
    if (!target || selections.some((id) => !top.includes(id)) || new Set(selections).size !== selections.length) throw new Error("NANAYA_GAZE_DISCARD_INVALID");
    for (const instanceId of selections) movePlayerCard(state, target.id, instanceId, "discard");
    const remaining = top.filter((id) => !selections.includes(id));
    if (remaining.length <= 1) {
      reorderDeckTop(target, remaining);
      markCaptured(player, target.id);
      return { targetPlayerId: target.id, discardedInstanceIds: selections, topOrder: remaining };
    }
    const orders = permutations(remaining);
    openContinuation(
      state,
      player,
      NANAYA_DEATH_PERCEPTION_ID,
      "gaze-order",
      { targetPlayerId: target.id, remainingInstanceIds: remaining, discardedInstanceIds: selections },
      orders.map((order, index) => ({ id: `order-${index}`, label: order.map((id) => definitions[state.cards[id]?.definitionId ?? ""]?.name ?? id).join(" → ") })),
      1,
      1,
      openDecision,
    );
    return { targetPlayerId: target.id, discardedInstanceIds: selections };
  }

  if (stage === "gaze-order") {
    const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
    const remaining = Array.isArray(previous.remainingInstanceIds) ? previous.remainingInstanceIds.filter((id): id is string => typeof id === "string") : [];
    const target = targetPlayerId ? state.players[targetPlayerId] : undefined;
    if (!target || selections.length !== 1 || !/^order-\d+$/.test(selections[0])) throw new Error("NANAYA_GAZE_ORDER_INVALID");
    const index = Number(selections[0].slice(6));
    const orders = permutations(remaining);
    if (!Number.isInteger(index) || !orders[index]) throw new Error("NANAYA_GAZE_ORDER_INVALID");
    reorderDeckTop(target, orders[index]);
    markCaptured(player, target.id);
    return { targetPlayerId: target.id, topOrder: orders[index] };
  }

  throw new Error("NANAYA_DECISION_STAGE_INVALID");
};
