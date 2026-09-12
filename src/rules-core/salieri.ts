import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import type { CardAbilityRegistry } from "./card-abilities.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardPlayCost } from "./costs.ts";
import { closePlayerCard, drawCards } from "./decks.ts";
import { adjustVictoryPoints, gainMana, gainVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const SALIERI_HANDLER = "core.salieri-avenger";
export const SALIERI_RESOLVE = "core.salieri-avenger-resolve";
export const SALIERI_MISERICORDIA_ID = "servant.salieri.skill.sc-salieri-1";
export const SALIERI_WILDFIRE_ID = "servant.salieri.skill.sc-salieri-2";
export const SALIERI_OBLIVION_ID = "servant.salieri.skill.sc-salieri-3";
export const SALIERI_MISERICORDIA_PUBLIC_ABILITY = "salieri.misericordia-action";
export const SALIERI_WILDFIRE_GAIN_ABILITY = "wildfire-gain";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeMisericordiaSource(state: GameState, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return Boolean(card.zone === "attack" && card.active && card.face === "up"
      && matchesSkill(definition, card.definitionId, SALIERI_MISERICORDIA_ID));
  });
}

function activeOwnedMisericordia(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up"
      && matchesSkill(definition, card.definitionId, SALIERI_MISERICORDIA_ID));
  });
}

function livingPlayers(state: GameState): PlayerState[] {
  return Object.values(state.players).filter((candidate) => !candidate.eliminated);
}

function closeMisericordiaIfFirst(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  const source = activeOwnedMisericordia(state, player, definitions);
  if (!source) return { closed: false };
  const living = livingPlayers(state);
  if (living.length === 0) return { closed: false };
  const highest = Math.max(...living.map((candidate) => candidate.victoryPoints));
  if (player.victoryPoints !== highest) return { closed: false, highestVictoryPoints: highest };
  closePlayerCard(state, player.id, source.instanceId, definitions);
  return { closed: true, instanceId: source.instanceId, highestVictoryPoints: highest };
}

function victoryPointGainCameFromAbility(sourceId: unknown, definitions: Record<string, CardDefinition>): boolean {
  if (typeof sourceId !== "string" || sourceId.length === 0) return false;
  if (sourceId === "skill.use" || sourceId === "card.ability.use" || sourceId === "card.play") return true;
  const direct = definitions[sourceId] ?? definitions[`card.skill.${sourceId}`];
  if (direct?.isSkill === true || Boolean(direct?.linkedSkillId) || (direct?.cardAbilityIds?.length ?? 0) > 0) return true;
  return false;
}

function oblivionDoubleManaCost(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): number {
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !definition || card.ownerPlayerId !== player.id || card.zone !== "hand") throw new Error("SALIERI_OBLIVION_CARD_INVALID");
  const normalCost = getCardPlayCost(state, definition, player, card, definitions);
  if (!Number.isInteger(normalCost) || normalCost < 0) throw new Error("SALIERI_OBLIVION_COST_INVALID");
  return normalCost * 2;
}

function canPlayThroughOblivion(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  try {
    const draft = structuredClone(state) as GameState;
    const draftPlayer = draft.players[player.id];
    const exactManaCost = oblivionDoubleManaCost(draft, draftPlayer, instanceId, definitions);
    addCardToAttack(draft, draftPlayer.id, instanceId, definitions, {
      payCost: true,
      exactManaCost,
      allowedSourceZones: ["hand"],
      bypassTiming: true,
      bypassFaceUpPlayLimit: true,
    });
    return true;
  } catch {
    return false;
  }
}

function oblivionCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => canPlayThroughOblivion(state, player, instanceId, definitions));
}

function beginOblivionCorrection(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  const candidates = oblivionCandidates(state, player, definitions);
  if (candidates.length === 0) return { pending: false, candidateInstanceIds: [] };
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${SALIERI_OBLIVION_ID}:play`;
  state.effectQueue.unshift({
    effectId,
    handlerId: SALIERI_RESOLVE,
    sourceId: SALIERI_OBLIVION_ID,
    controllerPlayerId: player.id,
    payload: { stage: "oblivion-play", candidateInstanceIds: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "salieri-oblivion-correction",
    options: [
      { id: "skip", label: "不打出卡牌" },
      ...candidates.map((instanceId) => ({
        id: instanceId,
        label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId,
      })),
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, candidateInstanceIds: candidates };
}

function playOblivionCard(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
  emitEvent?: Parameters<SkillHandler>[0]["emitEvent"],
) {
  if (!canPlayThroughOblivion(state, player, instanceId, definitions)) throw new Error("SALIERI_OBLIVION_CARD_UNAVAILABLE");
  const exactManaCost = oblivionDoubleManaCost(state, player, instanceId, definitions);
  const definition = definitions[state.cards[instanceId].definitionId];
  const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, {
    payCost: true,
    exactManaCost,
    allowedSourceZones: ["hand"],
    bypassTiming: true,
    bypassFaceUpPlayLimit: true,
  });
  const card = state.cards[instanceId];
  emitEvent?.("card.played", {
    playerId: player.id,
    instanceId,
    definitionId: definition.id,
    face: "up",
    paidMana,
    attributes: getCardInstanceAttributes(card, definition, state, definitions),
    method: "salieri-oblivion-correction",
    sourceId: SALIERI_OBLIVION_ID,
  });
  const drawnInstanceIds = drawCards(state, player.id, 1, randomInt, definitions);
  return { instanceId, paidMana, drawnInstanceIds };
}

function beginWildfireGain(
  state: GameState,
  player: PlayerState,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
) {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${SALIERI_WILDFIRE_ID}:mana`;
  state.effectQueue.unshift({
    effectId,
    handlerId: SALIERI_RESOLVE,
    sourceId: SALIERI_WILDFIRE_ID,
    controllerPlayerId: player.id,
    payload: { stage: "wildfire-gain" },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "salieri-wildfire-mana",
    options: [8, 9, 10, 11, 12].map((amount) => ({ id: `mana-${amount}`, label: `Gain ${amount} mana` })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true };
}

function resolveWildfireCombatEnd(player: PlayerState) {
  if (player.flags.infiniteMana === true) return { manaLost: 0, victoryPointsLost: 0 };
  const manaLost = Math.max(0, Number(player.mana));
  if (!Number.isInteger(manaLost)) throw new Error("SALIERI_WILDFIRE_MANA_INVALID");
  player.mana = 0;
  const victoryPointsLost = Math.ceil(manaLost / 2);
  if (victoryPointsLost > 0) adjustVictoryPoints(player, -victoryPointsLost);
  return { manaLost, victoryPointsLost };
}

export const useSalieri: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("SALIERI_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === SALIERI_MISERICORDIA_ID) {
    if (["card.played", "player.victory-points.changed", "elimination.resolved", "round.started"].includes(eventType ?? "")) {
      return closeMisericordiaIfFirst(state, player, definitions);
    }
    return;
  }
  if (skill.id === SALIERI_WILDFIRE_ID) {
    if (eventType === "combat.ending") return resolveWildfireCombatEnd(player);
    if (data.abilityId === SALIERI_WILDFIRE_GAIN_ABILITY) return beginWildfireGain(state, player, openDecision);
    return;
  }
  if (skill.id === SALIERI_OBLIVION_ID) {
    if (eventType === "combat.resolved") {
      const gains = isRecord(event.abilityVictoryPoints) ? event.abilityVictoryPoints : {};
      const opponentAbilityGain = Object.entries(gains).some(([targetPlayerId, amount]) =>
        targetPlayerId !== player.id && Number(amount) > 0);
      if (!opponentAbilityGain) return;
      return beginOblivionCorrection(state, player, definitions, openDecision);
    }
    if (eventType !== "player.victory-points.changed") return;
    const targetPlayerId = typeof event.playerId === "string" ? event.playerId : undefined;
    const delta = Number(event.delta);
    if (!targetPlayerId || targetPlayerId === player.id || !Number.isInteger(delta) || delta <= 0) return;
    if (!victoryPointGainCameFromAbility(event.sourceId, definitions)) return;
    return beginOblivionCorrection(state, player, definitions, openDecision);
  }
  throw new Error("SALIERI_SKILL_INVALID");
};

export const resolveSalieriDecision: SkillHandler = ({ state, player, payload, definitions, randomInt, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("SALIERI_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((value): value is string => typeof value === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error("SALIERI_DECISION_INVALID");
  if (previous.stage === "wildfire-gain") {
    const match = /^mana-(8|9|10|11|12)$/.exec(selections[0]);
    if (!match) throw new Error("SALIERI_WILDFIRE_DECISION_INVALID");
    const requested = Number(match[1]);
    return { requested, manaGained: gainMana(player, requested) };
  }
  if (previous.stage === "oblivion-play") {
    if (selections[0] === "skip") return { played: false };
    const candidates = Array.isArray(previous.candidateInstanceIds)
      ? previous.candidateInstanceIds.filter((id): id is string => typeof id === "string")
      : [];
    if (!candidates.includes(selections[0])) throw new Error("SALIERI_OBLIVION_DECISION_INVALID");
    return { played: true, ...playOblivionCard(state, player, selections[0], definitions, randomInt ?? (() => 0), emitEvent) };
  }
  throw new Error("SALIERI_DECISION_INVALID");
};

export const isSalieriLegal: SkillLegalityPredicate = (state, playerId, skill, ability) => {
  const player = state.players[playerId];
  if (!player || player.eliminated) return false;
  if (skill.id === SALIERI_WILDFIRE_ID && ability?.id === SALIERI_WILDFIRE_GAIN_ABILITY) {
    return state.phase === "outpost" && state.activePlayerId === playerId
      && (player.locationId === "mountain" || player.locationId === "city");
  }
  return false;
};

export function registerSalieriCardAbilities(registry: CardAbilityRegistry): void {
  if (registry.has(SALIERI_MISERICORDIA_PUBLIC_ABILITY)) return;
  registry.register(SALIERI_MISERICORDIA_PUBLIC_ABILITY, ({ state, playerId, instanceId, definitions }) => {
    const player = state.players[playerId];
    const source = state.cards[instanceId];
    const definition = source ? definitions[source.definitionId] : undefined;
    if (!player || player.eliminated || state.phase !== "action" || state.activePlayerId !== player.id) {
      throw new Error("SALIERI_MISERICORDIA_WINDOW_INVALID");
    }
    if (!source || !definition || source.zone !== "attack" || !source.active || source.face !== "up"
      || !matchesSkill(definition, source.definitionId, SALIERI_MISERICORDIA_ID)) {
      throw new Error("SALIERI_MISERICORDIA_SOURCE_INVALID");
    }
    const higherOpponent = livingPlayers(state).some((candidate) => candidate.id !== player.id && candidate.victoryPoints > player.victoryPoints);
    if (!higherOpponent) throw new Error("SALIERI_MISERICORDIA_SCORE_CONDITION_INVALID");
    const usageKey = `${SALIERI_MISERICORDIA_PUBLIC_ABILITY}:${instanceId}`;
    if (player.usage[usageKey]?.round === state.round) throw new Error("CARD_ABILITY_LIMIT_REACHED");
    const victoryPointsGained = gainVictoryPoints(player, 1);
    player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 2;
    player.usage[usageKey] = { round: state.round, phase: state.phase, used: true };
    return { victoryPointsGained, combatPowerGained: 2 };
  }, { allowedZones: ["attack"], allowPublicUse: true, abilityLimit: "unlimited" });
}

export function getActiveMisericordiaSource(state: GameState, definitions: Record<string, CardDefinition>) {
  return activeMisericordiaSource(state, definitions);
}
