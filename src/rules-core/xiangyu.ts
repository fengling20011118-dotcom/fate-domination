import type { GameState, PlayerState } from "../domain/state/types.ts";
import { movePlayerOneSpaceByEffect } from "./board.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const XIANGYU_MATRIX_ID = "servant.xiangyu.skill.sc-xiangyu-1";
export const XIANGYU_MARTIAL_ID = "servant.xiangyu.skill.sc-xiangyu-2";
export const XIANGYU_MIGHT_ID = "servant.xiangyu.skill.sc-xiangyu-3";

export const XIANGYU_MATRIX_HANDLER = "core.xiangyu-ultimate-defense-matrix";
export const XIANGYU_MARTIAL_HANDLER = "core.xiangyu-martial-force";
export const XIANGYU_MARTIAL_RESOLVE = "core.xiangyu-martial-force-resolve";
export const XIANGYU_MIGHT_HANDLER = "core.xiangyu-conquering-might";

interface MatrixRuntime {
  round: number;
  sealUsesSeen: Record<string, number>;
  movedAwardedPlayerIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return Boolean(definition && (definitionId === skillId || definition.linkedSkillId === skillId));
}

function ownedPhysicalSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return Boolean(card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone !== "removed" && card.zone !== "discard" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, skillId));
  });
}

export function getXiangyuReflex(player: PlayerState): number {
  const value = Number(player.flags.reflexCount ?? 0);
  if (!Number.isInteger(value) || value < 0) throw new Error("XIANGYU_REFLEX_INVALID");
  return value;
}

function gainReflex(player: PlayerState, amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("XIANGYU_REFLEX_GAIN_INVALID");
  const value = getXiangyuReflex(player) + amount;
  player.flags.reflexCount = value;
  return value;
}

function spendReflex(player: PlayerState, amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("XIANGYU_REFLEX_COST_INVALID");
  const current = getXiangyuReflex(player);
  if (current < amount) throw new Error("XIANGYU_REFLEX_INSUFFICIENT");
  player.flags.reflexCount = current - amount;
  return current - amount;
}

function matrixState(state: GameState): Record<string, MatrixRuntime> {
  const current = state.modeState.xiangyuDefenseMatrix;
  if (current && typeof current === "object" && !Array.isArray(current)) return current as Record<string, MatrixRuntime>;
  const created: Record<string, MatrixRuntime> = {};
  state.modeState.xiangyuDefenseMatrix = created;
  return created;
}

function currentSealUses(state: GameState, player: PlayerState): number {
  const normal = Number(player.flags.commandSealUsesRound === state.round ? player.flags.commandSealUsesThisRound ?? 0 : 0);
  const ruler = Number(player.flags.rulerCommandSealUsesRound === state.round ? player.flags.rulerCommandSealUsesThisRound ?? 0 : 0);
  if (![normal, ruler].every((value) => Number.isInteger(value) && value >= 0)) throw new Error("XIANGYU_COMMAND_SEAL_USAGE_INVALID");
  return normal + ruler;
}

function armMatrix(state: GameState, player: PlayerState): { round: number } {
  const sealUsesSeen: Record<string, number> = {};
  for (const target of Object.values(state.players)) {
    if (target.id !== player.id && !target.eliminated) sealUsesSeen[target.id] = currentSealUses(state, target);
  }
  matrixState(state)[player.id] = { round: state.round, sealUsesSeen, movedAwardedPlayerIds: [] };
  return { round: state.round };
}

function matrixRuntimeFor(state: GameState, playerId: string): MatrixRuntime | undefined {
  const value = matrixState(state)[playerId];
  return value?.round === state.round ? value : undefined;
}

/**
 * Ultimate Defense Matrix. The Action ability arms observation for the rest of
 * this round. Irreversible opponent facts are credited as they happen; this is
 * equivalent to awarding them at the end of that opponent's Action turn because
 * Reflex can only be spent on Xiang Yu's later Combat turn.
 */
export const useXiangyuUltimateDefenseMatrix: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !ownedPhysicalSkill(state, player, XIANGYU_MATRIX_ID, definitions)) return;
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (!eventType) {
    if (data.abilityId !== "arm-matrix" || state.phase !== "action" || state.activePlayerId !== player.id) {
      throw new Error("XIANGYU_MATRIX_WINDOW_INVALID");
    }
    return armMatrix(state, player);
  }

  if (eventType === "combat.ending") {
    if (Number(player.flags.reflexHalvedRound ?? -1) === state.round) return;
    player.flags.reflexHalvedRound = state.round;
    const current = getXiangyuReflex(player);
    const lost = Math.ceil(current / 2);
    player.flags.reflexCount = current - lost;
    return { lostReflex: lost, remainingReflex: current - lost };
  }

  const runtime = matrixRuntimeFor(state, player.id);
  if (!runtime) return;
  const targetPlayerId = typeof event.playerId === "string" ? event.playerId : undefined;
  if (!targetPlayerId || targetPlayerId === player.id || !state.players[targetPlayerId] || state.players[targetPlayerId].eliminated) return;
  // The printed check is at the end of that opponent's turn. Only facts created
  // during that opponent's own Action turn belong to the tally; forced plays or
  // movement during another player's turn must not award Reflex.
  if (state.phase !== "action" || state.activePlayerId !== targetPlayerId) return;

  if (eventType === "card.played") {
    const definitionId = typeof event.definitionId === "string" ? event.definitionId : undefined;
    const definition = definitionId ? definitions[definitionId] : undefined;
    if (definition?.isSkill === true) return { gainedReflex: 1, reflex: gainReflex(player, 1), reason: "skill-played", targetPlayerId };
    return;
  }

  if (eventType === "skill.used" || eventType === "player.command-seals.changed") {
    const target = state.players[targetPlayerId];
    const current = currentSealUses(state, target);
    const previous = Number(runtime.sealUsesSeen[targetPlayerId] ?? 0);
    runtime.sealUsesSeen[targetPlayerId] = current;
    if (current > previous) {
      const gained = current - previous;
      return { gainedReflex: gained, reflex: gainReflex(player, gained), reason: "command-seal-used", targetPlayerId };
    }
    return;
  }

  if (eventType === "player.entered-location") {
    if (event.method === "deploy" || (player.locationId !== "mountain" && player.locationId !== "city")) return;
    if (event.locationId !== player.locationId || runtime.movedAwardedPlayerIds.includes(targetPlayerId)) return;
    runtime.movedAwardedPlayerIds.push(targetPlayerId);
    return { gainedReflex: 1, reflex: gainReflex(player, 1), reason: "moved-to-battlefield", targetPlayerId };
  }
};

export const isXiangyuUltimateDefenseMatrixLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "arm-matrix" && state.phase === "action" && state.activePlayerId === playerId
    && ownedPhysicalSkill(state, player, XIANGYU_MATRIX_ID, definitions));
};

function playableCardIdsFromHand(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    try {
      const draft = structuredClone(state);
      addCardToAttack(draft, player.id, instanceId, definitions, {
        payCost: false,
        bypassSkillEightMana: true,
        allowedSourceZones: ["hand"],
        bypassFaceUpPlayLimit: true,
        bypassTiming: true,
      });
      return true;
    } catch {
      return false;
    }
  });
}

function canPlayTopDeck(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  const instanceId = player.deck[0];
  if (!instanceId) return false;
  try {
    const draft = structuredClone(state);
    addCardToAttack(draft, player.id, instanceId, definitions, {
      payCost: true,
      allowedSourceZones: ["deck"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
    });
    return true;
  } catch {
    return false;
  }
}

function playByMartialForce(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  free: boolean,
  sourceZone: "hand" | "deck",
  emitEvent?: SkillContext["emitEvent"],
) {
  const definition = definitions[state.cards[instanceId]?.definitionId ?? ""];
  if (!definition) throw new Error("XIANGYU_MARTIAL_CARD_INVALID");
  const result = addCardToAttack(state, player.id, instanceId, definitions, {
    payCost: !free,
    bypassSkillEightMana: free,
    allowedSourceZones: [sourceZone],
    bypassFaceUpPlayLimit: true,
    bypassTiming: true,
  });
  if (definition.revealsTrueNameOnPlay === true && definition.skillOwnerType === "servant" && !player.trueNameRevealed) {
    revealPlayerTrueName(state, player.id);
  }
  emitEvent?.("card.played", {
    playerId: player.id,
    instanceId,
    definitionId: definition.id,
    face: "up",
    paidMana: result.paidMana,
    attributes: getCardAttributes(definition),
    method: "xiangyu-martial-force",
  });
  emitEvent?.("card.used", {
    playerId: player.id,
    instanceId,
    definitionId: definition.id,
    locationId: player.locationId,
    attributes: getCardAttributes(definition),
    method: "xiangyu-martial-force",
  });
  return { instanceId, definitionId: definition.id, paidMana: result.paidMana };
}

function clearMartialUsage(player: PlayerState, abilityId: string): void {
  // Martial Force explicitly permits buying any/all effects any number of times.
  // The finite Reflex pool is the usage limit; clear only the generic synthetic
  // once-per-round marker created for an ordinary phase ability.
  delete player.usage[`${XIANGYU_MARTIAL_ID}:${abilityId}`];
}

function openHandDecision(state: GameState, player: PlayerState, candidates: string[], definitions: Record<string, CardDefinition>, openDecision: SkillContext["openDecision"]): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${XIANGYU_MARTIAL_ID}:free-hand`;
  state.effectQueue.unshift({
    effectId,
    handlerId: XIANGYU_MARTIAL_RESOLVE,
    sourceId: XIANGYU_MARTIAL_ID,
    controllerPlayerId: player.id,
    payload: { stage: "free-hand", candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "xiangyu-martial-force-free-hand",
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

/** Martial Force: every purchase is repeatable while Reflex remains. */
export const useXiangyuMartialForce: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !ownedPhysicalSkill(state, player, XIANGYU_MARTIAL_ID, definitions)
    || state.phase !== "combat" || state.activePlayerId !== player.id || !isRecord(payload)) {
    throw new Error("XIANGYU_MARTIAL_WINDOW_INVALID");
  }
  const abilityId = typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  if (abilityId === "backward-one") {
    spendReflex(player, 1);
    const movement = movePlayerOneSpaceByEffect(state, player.id, "backward", definitions);
    clearMartialUsage(player, abilityId);
    emitEvent?.("player.moved", { playerId: player.id, ...movement, method: "effect", sourceId: XIANGYU_MARTIAL_ID });
    emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect", sourceId: XIANGYU_MARTIAL_ID });
    return movement;
  }
  if (abilityId === "forward-one") {
    spendReflex(player, 2);
    const movement = movePlayerOneSpaceByEffect(state, player.id, "forward", definitions);
    clearMartialUsage(player, abilityId);
    emitEvent?.("player.moved", { playerId: player.id, ...movement, method: "effect", sourceId: XIANGYU_MARTIAL_ID });
    emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect", sourceId: XIANGYU_MARTIAL_ID });
    return movement;
  }
  if (abilityId === "play-top") {
    const instanceId = player.deck[0];
    if (!instanceId || !canPlayTopDeck(state, player, definitions)) throw new Error("XIANGYU_MARTIAL_TOP_CARD_UNAVAILABLE");
    spendReflex(player, 4);
    const card = playByMartialForce(state, player, instanceId, definitions, false, "deck", emitEvent);
    clearMartialUsage(player, abilityId);
    return { card, reflex: getXiangyuReflex(player) };
  }
  if (abilityId === "play-hand-free") {
    const candidates = playableCardIdsFromHand(state, player, definitions);
    if (candidates.length === 0) throw new Error("XIANGYU_MARTIAL_HAND_CARD_UNAVAILABLE");
    spendReflex(player, 7);
    clearMartialUsage(player, abilityId);
    if (candidates.length === 1) {
      return { card: playByMartialForce(state, player, candidates[0], definitions, true, "hand", emitEvent), reflex: getXiangyuReflex(player) };
    }
    openHandDecision(state, player, candidates, definitions, openDecision);
    return { pending: true, reflex: getXiangyuReflex(player) };
  }
  throw new Error("XIANGYU_MARTIAL_ABILITY_INVALID");
};

export const resolveXiangyuMartialForce: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("XIANGYU_MARTIAL_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (previous.stage !== "free-hand" || decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])
    || !playableCardIdsFromHand(state, player, definitions).includes(selections[0])) {
    throw new Error("XIANGYU_MARTIAL_DECISION_INVALID");
  }
  return { card: playByMartialForce(state, player, selections[0], definitions, true, "hand", emitEvent), reflex: getXiangyuReflex(player) };
};

export const isXiangyuMartialForceLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !ability || state.phase !== "combat" || state.activePlayerId !== playerId
    || !ownedPhysicalSkill(state, player, XIANGYU_MARTIAL_ID, definitions)) return false;
  const reflex = getXiangyuReflex(player);
  if (ability.id === "backward-one") {
    if (reflex < 1) return false;
    try { movePlayerOneSpaceByEffect(structuredClone(state), playerId, "backward", definitions); return true; } catch { return false; }
  }
  if (ability.id === "forward-one") {
    if (reflex < 2) return false;
    try { movePlayerOneSpaceByEffect(structuredClone(state), playerId, "forward", definitions); return true; } catch { return false; }
  }
  if (ability.id === "play-top") return reflex >= 4 && canPlayTopDeck(state, player, definitions);
  if (ability.id === "play-hand-free") return reflex >= 7 && playableCardIdsFromHand(state, player, definitions).length > 0;
  return false;
};

/** Conquering Might: Action converts mana to Reflex; Combat doubles this physical attack's base power after 3+ spaces moved. */
export const useXiangyuConqueringMight: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("XIANGYU_MIGHT_PAYLOAD_INVALID");
  const abilityId = typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  if (abilityId === "gain-reflex") {
    if (state.phase !== "action" || state.activePlayerId !== player.id || !ownedPhysicalSkill(state, player, XIANGYU_MIGHT_ID, definitions)) {
      throw new Error("XIANGYU_MIGHT_ACTION_INVALID");
    }
    return { gainedReflex: 2, reflex: gainReflex(player, 2) };
  }
  if (abilityId === "unstoppable-force") {
    const source = activeOwnedSkill(state, player, XIANGYU_MIGHT_ID, definitions);
    if (state.phase !== "combat" || state.activePlayerId !== player.id || !source
      || Number(player.flags.movementDistanceThisRound ?? 0) < 3) throw new Error("XIANGYU_MIGHT_COMBAT_INVALID");
    const id = `${XIANGYU_MIGHT_ID}:unstoppable-force:${source.instanceId}:${state.round}`;
    if (!(state.activeRuleModifiers ?? []).some((modifier) => modifier.id === id)) {
      state.activeRuleModifiers.push({
        id,
        sourceId: XIANGYU_MIGHT_ID,
        controllerPlayerId: player.id,
        sourceInstanceId: source.instanceId,
        operation: "multiply",
        rule: "card_base_power",
        scope: { subject: "controller", cards: { instanceIds: [source.instanceId] } },
        value: 2,
        duration: "while-source-active",
        createdRound: state.round,
      });
    }
    return { sourceInstanceId: source.instanceId, basePowerMultiplier: 2 };
  }
  throw new Error("XIANGYU_MIGHT_ABILITY_INVALID");
};

export const isXiangyuConqueringMightLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !ability || state.activePlayerId !== playerId) return false;
  if (ability.id === "gain-reflex") return state.phase === "action" && Boolean(ownedPhysicalSkill(state, player, XIANGYU_MIGHT_ID, definitions));
  if (ability.id === "unstoppable-force") return state.phase === "combat" && Number(player.flags.movementDistanceThisRound ?? 0) >= 3
    && Boolean(activeOwnedSkill(state, player, XIANGYU_MIGHT_ID, definitions));
  return false;
};
