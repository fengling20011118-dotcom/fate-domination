import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import type { CardDefinition } from "./content-types.ts";
import { lendSkillFromOwnerSkillZoneToPlayer, transferLentSkillController } from "./decks.ts";
import { gainMana, gainVictoryPoints } from "./resources.ts";
import { isBattlefieldLocation } from "./battlefield-rules.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const NIGHTINGALE_PLEDGE_ID = "servant.nightingale.skill.sc-nightingale-1";
export const NIGHTINGALE_IRON_NURSE_ID = "servant.nightingale.skill.sc-nightingale-2";
export const NIGHTINGALE_ANGEL_ID = "servant.nightingale.skill.sc-nightingale-3";
export const NIGHTINGALE_PLEDGE_HANDLER = "core.nightingale-pledge";
export const NIGHTINGALE_IRON_NURSE_HANDLER = "core.nightingale-iron-nurse";
export const NIGHTINGALE_ANGEL_HANDLER = "core.nightingale-angel";
export const NIGHTINGALE_ANGEL_RESOLVE = "core.nightingale-angel-resolve";
export const NIGHTINGALE_PLEDGE_RESOLVE = "core.nightingale-pledge-resolve";

const LAST_ANGEL_TARGET_FLAG = "nightingaleAngelLastTargetPlayerId";
const LAST_ANGEL_TARGET_ROUND_FLAG = "nightingaleAngelLastTargetRound";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(card: CardInstance | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || card.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId));
}

function ownedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>): CardInstance | undefined {
  return [...new Set([...player.servantSkills, ...player.attack, ...player.hand])]
    .map((id) => state.cards[id])
    .find((card) => card?.ownerPlayerId === player.id && matchesSkill(card, card ? definitions[card.definitionId] : undefined, skillId));
}

function angelCards(state: GameState, definitions: Record<string, CardDefinition>): CardInstance[] {
  return Object.values(state.cards).filter((card) => matchesSkill(card, definitions[card.definitionId], NIGHTINGALE_ANGEL_ID));
}

function activeAngelControlledBy(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): CardInstance | undefined {
  return angelCards(state, definitions).find((card) => card.controllerPlayerId === playerId && card.zone === "attack" && card.active && card.face === "up");
}

function angelPrepCandidates(state: GameState, player: PlayerState): string[] {
  const lastRound = Number(player.flags[LAST_ANGEL_TARGET_ROUND_FLAG] ?? Number.NEGATIVE_INFINITY);
  const lastId = lastRound === state.round - 1 && typeof player.flags[LAST_ANGEL_TARGET_FLAG] === "string"
    ? String(player.flags[LAST_ANGEL_TARGET_FLAG])
    : undefined;
  return state.turnOrder.filter((id) => id !== player.id && id !== lastId && state.players[id] && !state.players[id].eliminated);
}

function findAngelInOwnerSkillZone(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): CardInstance | undefined {
  return player.servantSkills.map((id) => state.cards[id]).find((card) => card && card.ownerPlayerId === player.id
    && card.controllerPlayerId === player.id && card.zone === "servant-skills" && !card.active
    && matchesSkill(card, definitions[card.definitionId], NIGHTINGALE_ANGEL_ID));
}

function assignAngel(state: GameState, player: PlayerState, targetPlayerId: string, definitions: Record<string, CardDefinition>) {
  if (!angelPrepCandidates(state, player).includes(targetPlayerId)) throw new Error("NIGHTINGALE_ANGEL_TARGET_INVALID");
  const angel = findAngelInOwnerSkillZone(state, player, definitions);
  if (!angel) throw new Error("NIGHTINGALE_ANGEL_NOT_IN_SKILL_ZONE");
  lendSkillFromOwnerSkillZoneToPlayer(state, player.id, targetPlayerId, angel.instanceId, definitions);
  player.flags[LAST_ANGEL_TARGET_FLAG] = targetPlayerId;
  player.flags[LAST_ANGEL_TARGET_ROUND_FLAG] = state.round;
  return { targetPlayerId, instanceId: angel.instanceId };
}

function openTargetDecision(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  handlerId: string,
  kind: string,
  candidates: string[],
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${kind}`;
  state.effectQueue.unshift({ effectId, handlerId, sourceId, controllerPlayerId: player.id, payload: { candidateIds: candidates }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind,
    options: candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })), min: 1, max: 1, allowCancel: false,
    continuationEffectId: effectId, submissions: {},
  });
}

function installIronNurseFreeBerserkers(player: PlayerState, definitions: Record<string, CardDefinition>): void {
  const targetDefinitionIds = Object.values(definitions).filter((definition) => definition.tags?.includes("berserker-attack")).map((definition) => definition.id);
  const id = `${NIGHTINGALE_IRON_NURSE_ID}:selfless-devotion`;
  if ((player.cardRuleModifiers ?? []).some((modifier) => modifier.id === id)) return;
  addCardRuleModifier(player, {
    id, sourceId: NIGHTINGALE_IRON_NURSE_ID, targetDefinitionIds, costOverride: 0, duration: "game",
    condition: { anyOpponentAtLocationControlsDefinitionId: { locationId: "workshop", definitionId: NIGHTINGALE_ANGEL_ID } },
  });
}

function activeAngelsAtAnyBattlefield(state: GameState, definitions: Record<string, CardDefinition>): CardInstance[] {
  return angelCards(state, definitions).filter((card) => {
    const controller = card.controllerPlayerId ? state.players[card.controllerPlayerId] : undefined;
    return Boolean(controller && !controller.eliminated && controller.locationId && isBattlefieldLocation(state, controller.locationId)
      && card.zone === "attack" && card.active && card.face === "up");
  });
}

function reclaimAngel(state: GameState, player: PlayerState, instanceId: string, definitions: Record<string, CardDefinition>) {
  const candidates = activeAngelsAtAnyBattlefield(state, definitions);
  const angel = candidates.find((card) => card.instanceId === instanceId);
  if (!angel || !angel.controllerPlayerId) throw new Error("NIGHTINGALE_PLEDGE_ANGEL_INVALID");
  const previousControllerPlayerId = angel.controllerPlayerId;
  transferLentSkillController(state, previousControllerPlayerId, player.id, angel.instanceId, definitions);
  return { instanceId: angel.instanceId, previousControllerPlayerId };
}

export const useNightingaleAngel: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("NIGHTINGALE_ANGEL_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "player.deployed") {
    const event = isRecord(data.event) ? data.event : {};
    const deployedPlayerId = typeof event.playerId === "string" ? event.playerId : undefined;
    if (!deployedPlayerId || event.locationId !== "workshop") return;
    const angel = activeAngelControlledBy(state, deployedPlayerId, definitions);
    if (!angel) return;
    const controller = state.players[deployedPlayerId];
    gainMana(controller, 1);
    gainVictoryPoints(player, 2);
    controller.flags.movementBlockedBySourceRound = state.round;
    controller.flags.movementBlockedBySourceInstanceId = angel.instanceId;
    return { controllerPlayerId: deployedPlayerId, gainedMana: 1, ownerVictoryPoints: 2 };
  }
  if (data.abilityId !== "angel-prep" || state.phase !== "preparation" || state.activePlayerId !== player.id) throw new Error("NIGHTINGALE_ANGEL_WINDOW_INVALID");
  const candidates = angelPrepCandidates(state, player);
  if (candidates.length === 0) throw new Error("NIGHTINGALE_ANGEL_NO_TARGET");
  if (candidates.length === 1) return assignAngel(state, player, candidates[0], definitions);
  openTargetDecision(state, player, NIGHTINGALE_ANGEL_ID, NIGHTINGALE_ANGEL_RESOLVE, "nightingale-angel-target", candidates, openDecision);
  return { pending: true, candidatePlayerIds: candidates };
};

export const resolveNightingaleAngel: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("NIGHTINGALE_ANGEL_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("NIGHTINGALE_ANGEL_DECISION_INVALID");
  return assignAngel(state, player, selections[0], definitions);
};

export const isNightingaleAngelLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "angel-prep" && state.phase === "preparation" && state.activePlayerId === playerId
    && findAngelInOwnerSkillZone(state, player, definitions) && angelPrepCandidates(state, player).length > 0);
};

export const useNightingaleIronNurse: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("NIGHTINGALE_IRON_NURSE_DEFINITIONS_REQUIRED");
  installIronNurseFreeBerserkers(player, definitions);
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "game.started") return { installed: true };
  if (eventType !== "combat.resolved") return;
  const event = isRecord(data.event) ? data.event : {};
  const powers = isRecord(event.powers) ? event.powers : {};
  const ownPower = Number(powers[player.id]);
  if (!Number.isFinite(ownPower)) return;
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  if (winnerIds.includes(player.id)) return;
  const hasLower = Object.entries(powers).some(([id, power]) => id !== player.id && Number.isFinite(Number(power)) && Number(power) < ownPower);
  if (!hasLower) return;
  gainVictoryPoints(player, 3);
  return { gainedVictoryPoints: 3 };
};

export const useNightingalePledge: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("NIGHTINGALE_PLEDGE_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType !== "card.played") return;
  const event = isRecord(payload.event) ? payload.event : {};
  if (event.playerId !== player.id || event.definitionId !== NIGHTINGALE_PLEDGE_ID || event.face !== "up") return;
  const instanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
  const instance = instanceId ? state.cards[instanceId] : undefined;
  if (!instance || instance.playManaPayerPlayerId !== player.id) return { alternatePayerPlayerId: instance?.playManaPayerPlayerId ?? null };
  const candidates = activeAngelsAtAnyBattlefield(state, definitions);
  if (candidates.length === 0) return { addedAngelInstanceId: null };
  if (candidates.length === 1) return reclaimAngel(state, player, candidates[0].instanceId, definitions);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${NIGHTINGALE_PLEDGE_ID}:angel`;
  state.effectQueue.unshift({ effectId, handlerId: NIGHTINGALE_PLEDGE_RESOLVE, sourceId: NIGHTINGALE_PLEDGE_ID, controllerPlayerId: player.id, payload: { candidateIds: candidates.map((card) => card.instanceId) }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "nightingale-pledge-angel",
    options: candidates.map((card) => ({ id: card.instanceId, label: definitions[card.definitionId]?.name ?? card.instanceId })), min: 1, max: 1, allowCancel: false,
    continuationEffectId: effectId, submissions: {} });
  return { pending: true, candidateInstanceIds: candidates.map((card) => card.instanceId) };
};

export const resolveNightingalePledge: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("NIGHTINGALE_PLEDGE_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("NIGHTINGALE_PLEDGE_DECISION_INVALID");
  return reclaimAngel(state, player, selections[0], definitions);
};
