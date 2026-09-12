import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { closePlayerCard, movePlayerCard, settleDeferredCardClosesAfterCombat } from "./decks.ts";
import { gainMana } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const AVICEBRON_RESEARCH_ID = "servant.avicebron.skill.sc-avicebron-1";
export const AVICEBRON_KETER_ID = "servant.avicebron.skill.sc-avicebron-2";
export const AVICEBRON_LESSER_ID = "servant.avicebron.skill.sc-avicebron-4";
export const AVICEBRON_COMMON_ID = "servant.avicebron.skill.sc-avicebron-5";
export const AVICEBRON_HANDLER = "core.avicebron-golems";
export const AVICEBRON_RESOLVE = "core.avicebron-golems-resolve";
export const AVICEBRON_STUDY_ABILITY = "kabbalistic-study";
export const AVICEBRON_PLATING_ABILITY = "reinforced-golem-plating";

export const AVICEBRON_LESSER_CARD_ID = "card.x-lessergolem";
export const AVICEBRON_COMMON_CARD_ID = "card.x-commongolem";
const NON_SKILL_GOLEM_IDS = [AVICEBRON_LESSER_CARD_ID, AVICEBRON_COMMON_CARD_ID] as const;
const GOLEM_DEFINITION_IDS = [
  ...NON_SKILL_GOLEM_IDS,
  AVICEBRON_KETER_ID,
  `card.skill.${AVICEBRON_KETER_ID}`,
] as const;
const GOLEM_UPKEEP_UNIQUE_GROUP = "avicebron-golem-upkeep";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesSkill(card: GameState["cards"][string] | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || card.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId));
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(card, definition, skillId));
  });
}

function isNonSkillGolemDefinitionId(definitionId: string): boolean {
  return (NON_SKILL_GOLEM_IDS as readonly string[]).includes(definitionId);
}

function isGolemCard(card: GameState["cards"][string] | undefined, definitions: Record<string, CardDefinition>): boolean {
  if (!card) return false;
  if ((GOLEM_DEFINITION_IDS as readonly string[]).includes(card.definitionId)) return true;
  const definition = definitions[card.definitionId];
  return definition?.linkedSkillId === AVICEBRON_LESSER_ID || definition?.linkedSkillId === AVICEBRON_COMMON_ID;
}

function activeNonSkillGolems(state: GameState, player: PlayerState): GameState["cards"][string][] {
  return player.attack.map((id) => state.cards[id]).filter((card): card is GameState["cards"][string] => Boolean(
    card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && isNonSkillGolemDefinitionId(card.definitionId),
  ));
}

export function hasActiveAvicebronGolemUpkeep(state: GameState, playerId: string): boolean {
  const player = state.players[playerId];
  return Boolean(player && activeNonSkillGolems(state, player).length > 0);
}

function sameFightOpponentIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated);
}

function installGolemHandCostSource(state: GameState, player: PlayerState, sourceInstanceId: string): void {
  const source = state.cards[sourceInstanceId];
  if (!source || !isNonSkillGolemDefinitionId(source.definitionId) || source.ownerPlayerId !== player.id || source.zone !== "attack" || !source.active) return;
  const id = `${GOLEM_UPKEEP_UNIQUE_GROUP}:hand-cost:${sourceInstanceId}`;
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
  player.cardRuleModifiers.push({
    id,
    sourceId: source.definitionId,
    sourceInstanceId,
    targetDefinitionIds: [...NON_SKILL_GOLEM_IDS],
    costAdd: 1,
    condition: { targetZoneHand: true },
    duration: "while-source-active",
  });
}

function validStudyDiscardIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition) return false;
    if (definition.id === "card.cardpreparation") return true;
    return definition.basic === true && getCardInstanceAttributes(card, definition, state, definitions).includes("魔术");
  });
}

function resolveStudyDiscard(state: GameState, player: PlayerState, selected: string[], definitions: Record<string, CardDefinition>) {
  const legal = new Set(validStudyDiscardIds(state, player, definitions));
  if (selected.length !== 2 || new Set(selected).size !== 2 || selected.some((id) => !legal.has(id))) throw new Error("AVICEBRON_STUDY_SELECTION_INVALID");
  for (const instanceId of selected) {
    movePlayerCard(state, player.id, instanceId, "discard");
    const card = state.cards[instanceId];
    card.face = "up";
    card.active = false;
    card.residual = false;
  }
  return { discardedInstanceIds: [...selected], manaGained: gainMana(player, 2) };
}

function openSingleOwnerDecision(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  stage: string,
  options: PendingDecision["options"],
  min: number,
  max: number,
  payload: Record<string, unknown>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: AVICEBRON_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `avicebron-${stage}`,
    options,
    min,
    max,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function armReinforcedPlating(state: GameState, player: PlayerState, sourceInstanceId: string): { sourceInstanceId: string } {
  const id = `${AVICEBRON_RESEARCH_ID}:close-after-combat:${player.id}:${state.round}`;
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
  player.cardRuleModifiers.push({
    id,
    sourceId: AVICEBRON_RESEARCH_ID,
    sourceInstanceId,
    targetDefinitionIds: [...GOLEM_DEFINITION_IDS],
    deferCloseUntilCombatEnd: true,
    duration: "round",
  });
  return { sourceInstanceId };
}

function closeAllActiveGolems(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  const targets = player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && isGolemCard(card, definitions));
  });
  for (const instanceId of targets) closePlayerCard(state, player.id, instanceId, definitions);
  return targets;
}

function golemCandidatesFromZones(state: GameState, player: PlayerState): string[] {
  return [...player.hand, ...player.deck, ...player.discard].filter((instanceId) => isNonSkillGolemDefinitionId(state.cards[instanceId]?.definitionId ?? ""));
}

function putGolemIntoPlay(state: GameState, player: PlayerState, instanceId: string): { instanceId: string } {
  const candidates = new Set(golemCandidatesFromZones(state, player));
  if (!candidates.has(instanceId)) throw new Error("AVICEBRON_KETER_GOLEM_INVALID");
  movePlayerCard(state, player.id, instanceId, "attack");
  const card = state.cards[instanceId];
  card.face = "up";
  card.active = true;
  card.residual = true;
  card.paidCost = 0;
  installGolemHandCostSource(state, player, instanceId);
  return { instanceId };
}

function resolveKeterCombat(context: Parameters<SkillHandler>[0], event: Record<string, unknown>) {
  const { state, player, skill, definitions, openDecision } = context;
  if (!definitions || !activeOwnedSkill(state, player, skill.id, definitions)) return;
  const powers = isRecord(event.powers) ? event.powers : {};
  const ownPower = Number(powers[player.id]);
  if (!Number.isFinite(ownPower)) return;
  const allPowers = Object.values(powers).map(Number).filter(Number.isFinite);
  const highest = allPowers.length > 0 ? Math.max(...allPowers) : ownPower;
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  const result: Record<string, unknown> = {};
  if (ownPower < highest) result.closedOrDeferredGolemIds = closeAllActiveGolems(state, player, definitions);
  if (!winnerIds.includes(player.id)) return result;
  const candidates = golemCandidatesFromZones(state, player);
  if (candidates.length === 0) return result;
  if (candidates.length === 1) return { ...result, putIntoPlay: putGolemIntoPlay(state, player, candidates[0]) };
  openSingleOwnerDecision(
    state,
    player,
    skill.id,
    "keter-golem",
    candidates.map((id) => ({ id, label: definitions[state.cards[id].definitionId]?.name ?? id })),
    1,
    1,
    { candidates },
    openDecision,
  );
  return { ...result, pending: true, candidates };
}

function resolveGolemUpkeep(context: Parameters<SkillHandler>[0]) {
  const { state, player, skill, definitions, openDecision } = context;
  if (!definitions || state.phase !== "combat" || state.activePlayerId !== player.id) return;
  const count = sameFightOpponentIds(state, player).length;
  if (count <= 0) return { closedOrDeferredGolemIds: [] };
  const candidates = activeNonSkillGolems(state, player).map((card) => card.instanceId);
  const required = Math.min(count, candidates.length);
  if (required <= 0) return { closedOrDeferredGolemIds: [] };
  if (required === candidates.length) {
    for (const instanceId of candidates) closePlayerCard(state, player.id, instanceId, definitions);
    return { closedOrDeferredGolemIds: candidates };
  }
  openSingleOwnerDecision(
    state,
    player,
    skill.id,
    "golem-upkeep",
    candidates.map((id) => ({ id, label: definitions[state.cards[id].definitionId]?.name ?? id })),
    required,
    required,
    { candidates, required },
    openDecision,
  );
  return { pending: true, candidates, required };
}

export const resolveAvicebronDecision: SkillHandler = (context) => {
  const { state, player, payload, definitions } = context;
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("AVICEBRON_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || typeof previous.stage !== "string") throw new Error("AVICEBRON_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  if (previous.stage === "study") return resolveStudyDiscard(state, player, selections, definitions);
  if (previous.stage === "keter-golem") {
    if (selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("AVICEBRON_KETER_GOLEM_INVALID");
    return putGolemIntoPlay(state, player, selections[0]);
  }
  if (previous.stage === "golem-upkeep") {
    const required = Number(previous.required);
    if (!Number.isInteger(required) || required < 1 || selections.length !== required || new Set(selections).size !== selections.length
      || selections.some((id) => !candidates.includes(id))) throw new Error("AVICEBRON_GOLEM_UPKEEP_SELECTION_INVALID");
    const activeNow = new Set(activeNonSkillGolems(state, player).map((card) => card.instanceId));
    if (selections.some((id) => !activeNow.has(id))) throw new Error("AVICEBRON_GOLEM_UPKEEP_SELECTION_INVALID");
    for (const instanceId of selections) closePlayerCard(state, player.id, instanceId, definitions);
    return { closedOrDeferredGolemIds: selections };
  }
  throw new Error("AVICEBRON_DECISION_STAGE_INVALID");
};

export const useAvicebronGolems: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions, openDecision } = context;
  if (!definitions) throw new Error("AVICEBRON_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === AVICEBRON_RESEARCH_ID) {
    if (eventType === "card.played") {
      const instanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
      if (event.playerId === player.id && instanceId) installGolemHandCostSource(state, player, instanceId);
      return;
    }
    if (eventType === "combat.ending") {
      return { closedInstanceIds: settleDeferredCardClosesAfterCombat(state, player.id, definitions, AVICEBRON_RESEARCH_ID) };
    }
    if (data.abilityId === AVICEBRON_STUDY_ABILITY) {
      if (state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("AVICEBRON_STUDY_WINDOW_INVALID");
      const candidates = validStudyDiscardIds(state, player, definitions);
      if (candidates.length < 2) throw new Error("AVICEBRON_STUDY_COST_UNAVAILABLE");
      const direct = Array.isArray(data.discardInstanceIds) ? data.discardInstanceIds.filter((id): id is string => typeof id === "string") : [];
      if (direct.length > 0) return resolveStudyDiscard(state, player, direct, definitions);
      openSingleOwnerDecision(state, player, skill.id, "study", candidates.map((id) => ({ id, label: definitions[state.cards[id].definitionId]?.name ?? id })), 2, 2, { candidates }, openDecision);
      return { pending: true, candidates };
    }
    if (data.abilityId === AVICEBRON_PLATING_ABILITY) {
      if (state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("AVICEBRON_PLATING_WINDOW_INVALID");
      const source = activeOwnedSkill(state, player, skill.id, definitions);
      if (!source) throw new Error("AVICEBRON_PLATING_SOURCE_INACTIVE");
      return armReinforcedPlating(state, player, source.instanceId);
    }
    return;
  }

  if (skill.id === AVICEBRON_KETER_ID) {
    if (eventType !== "combat.resolved") return;
    return resolveKeterCombat(context, event);
  }

  if (skill.id === AVICEBRON_LESSER_ID || skill.id === AVICEBRON_COMMON_ID) {
    if (eventType !== "phase.transitioned") return;
    const transition = typeof event.transition === "string" ? event.transition : undefined;
    if (state.phase !== "combat" || state.activePlayerId !== player.id || (transition !== "next-phase" && transition !== "next-player")) return;
    return resolveGolemUpkeep(context);
  }
};

export const isAvicebronGolemLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId) return false;
  if (skill.id !== AVICEBRON_RESEARCH_ID) return false;
  if (ability?.id === AVICEBRON_STUDY_ABILITY) return state.phase === "outpost" && validStudyDiscardIds(state, player, definitions).length >= 2;
  if (ability?.id === AVICEBRON_PLATING_ABILITY) return state.phase === "combat" && Boolean(activeOwnedSkill(state, player, skill.id, definitions));
  return false;
};

export const AVICEBRON_GOLEM_PHYSICAL_DEFINITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  [AVICEBRON_LESSER_ID]: [AVICEBRON_LESSER_CARD_ID],
  [AVICEBRON_COMMON_ID]: [AVICEBRON_COMMON_CARD_ID],
});
