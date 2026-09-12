import type { GameState, PlayerState } from "../domain/state/types.ts";
import { playCardFaceDownByEffect } from "./card-play.ts";
import type { CardDefinition } from "./content-types.ts";
import { clearCardStateBoundToClose, movePlayerCard } from "./decks.ts";
import { getCardPlayCost, payManaCost } from "./costs.ts";
import { gainMana, gainVictoryPoints, adjustVictoryPoints } from "./resources.ts";
import { setActivatedAbilityReplacement } from "./ability-replacement.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const CALIGULA_MAD_TYRANT_ID = "servant.caligula.skill.sc-caligula-2";
export const CALIGULA_FLUCTICULUS_ID = "servant.caligula.skill.sc-caligula-3";
export const CALIGULA_MAD_TYRANT_HANDLER = "core.caligula-mad-tyrant";
export const CALIGULA_MAD_TYRANT_RESOLVE = "core.caligula-mad-tyrant-resolve";
export const CALIGULA_FLUCTICULUS_HANDLER = "core.caligula-flucticulus-diana";

const INSULT_MARKER = `${CALIGULA_MAD_TYRANT_ID}:insult`;
const ABILITY_INSULT = "make-insult";
const ABILITY_INJURY = "injury";
const ABILITY_PITY = "pity";
const ABILITY_LUNACY = "contagious-lunacy";

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}
function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, skillId));
  });
}
function sameFightOpponentIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated);
}
function insultIds(state: GameState, player: PlayerState): string[] {
  return player.attack.filter((id) => {
    const card = state.cards[id];
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === "attack" && card.face === "down" && card.modifiers.includes(INSULT_MARKER));
  });
}
function handAttackIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((id) => {
    const card = state.cards[id]; const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && definition.cardType === "attack" && !definition.isSkill);
  });
}
function openSingle(state: GameState, player: PlayerState, stage: string, candidates: string[], handlerId: string, openDecision: Parameters<SkillHandler>[0]["openDecision"]): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${CALIGULA_MAD_TYRANT_ID}:${stage}`;
  state.effectQueue.unshift({ effectId, handlerId, sourceId: CALIGULA_MAD_TYRANT_ID, controllerPlayerId: player.id, payload: { stage, candidates }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: `caligula-${stage}`,
    options: candidates.map((id) => ({ id, label: id })), min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
}
function markInsult(state: GameState, player: PlayerState, instanceId: string, definitions: Record<string, CardDefinition>): void {
  if (!handAttackIds(state, player, definitions).includes(instanceId)) throw new Error("CALIGULA_INSULT_CARD_INVALID");
  playCardFaceDownByEffect(state, player.id, instanceId, definitions, { allowedSourceZones: ["hand"] });
  const card = state.cards[instanceId];
  if (!card.modifiers.includes(INSULT_MARKER)) card.modifiers.push(INSULT_MARKER);
}
function activateInjury(state: GameState, player: PlayerState, instanceId: string, definitions: Record<string, CardDefinition>): void {
  if (!insultIds(state, player).includes(instanceId)) throw new Error("CALIGULA_INSULT_CARD_INVALID");
  const card = state.cards[instanceId]; const definition = definitions[card.definitionId];
  const cost = getCardPlayCost(state, definition, player, card, definitions);
  payManaCost(state, player, cost, definitions);
  if (cost > 0) player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + cost;
  card.face = "up"; card.active = true;
  player.flags.caligulaInjuryRound = state.round;
}
function armPity(state: GameState, player: PlayerState, instanceId: string): void {
  if (!insultIds(state, player).includes(instanceId)) throw new Error("CALIGULA_INSULT_CARD_INVALID");
  const card = state.cards[instanceId];
  movePlayerCard(state, player.id, instanceId, "discard");
  clearCardStateBoundToClose(card);
  card.face = "down"; card.active = false; card.residual = false;
  player.flags.caligulaPityRound = state.round;
}
function eventCombat(payload: unknown): Record<string, unknown> | undefined {
  return isRecord(payload) && payload.eventType === "combat.resolved" && isRecord(payload.event) ? payload.event : undefined;
}

export const useCaligulaMadTyrant: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("CALIGULA_MAD_TYRANT_DEFINITIONS_REQUIRED");
  const combat = eventCombat(payload);
  if (combat) {
    const powers = isRecord(combat.powers) ? combat.powers : {};
    if (!Object.prototype.hasOwnProperty.call(powers, player.id)) return;
    const winnerIds = Array.isArray(combat.winnerIds) ? combat.winnerIds.filter((id): id is string => typeof id === "string") : [];
    if (Number(player.flags.caligulaPityRound ?? -1) === state.round) {
      delete player.flags.caligulaPityRound;
      if (winnerIds.includes(player.id)) { gainMana(player, 1); gainVictoryPoints(player, 1); }
    }
    if (Number(player.flags.caligulaInjuryRound ?? -1) === state.round) {
      delete player.flags.caligulaInjuryRound;
      const losers = Object.keys(powers).filter((id) => id !== player.id && !winnerIds.includes(id) && state.players[id] && !state.players[id].eliminated);
      if (losers.length === 1) adjustVictoryPoints(state.players[losers[0]], -2);
      else if (losers.length > 1) openSingle(state, player, "injury-loser", losers, CALIGULA_MAD_TYRANT_RESOLVE, openDecision);
    }
    return;
  }
  if (!isRecord(payload) || typeof payload.abilityId !== "string") throw new Error("CALIGULA_MAD_TYRANT_ABILITY_INVALID");
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("CALIGULA_MAD_TYRANT_SOURCE_INACTIVE");
  const chosen = typeof payload.instanceId === "string" ? payload.instanceId : undefined;
  if (payload.abilityId === ABILITY_INSULT) {
    if (state.phase !== "action") throw new Error("CALIGULA_MAD_TYRANT_WINDOW_INVALID");
    const candidates = handAttackIds(state, player, definitions);
    if (candidates.length === 0) throw new Error("CALIGULA_INSULT_NO_CARD");
    if (!chosen) { openSingle(state, player, "make-insult", candidates, CALIGULA_MAD_TYRANT_RESOLVE, openDecision); return; }
    markInsult(state, player, chosen, definitions); return;
  }
  if (payload.abilityId === ABILITY_INJURY) {
    if (state.phase !== "combat") throw new Error("CALIGULA_MAD_TYRANT_WINDOW_INVALID");
    const candidates = insultIds(state, player);
    if (candidates.length === 0) throw new Error("CALIGULA_INSULT_NO_CARD");
    if (!chosen) { openSingle(state, player, "injury-insult", candidates, CALIGULA_MAD_TYRANT_RESOLVE, openDecision); return; }
    activateInjury(state, player, chosen, definitions); return;
  }
  if (payload.abilityId === ABILITY_PITY) {
    if (state.phase !== "combat") throw new Error("CALIGULA_MAD_TYRANT_WINDOW_INVALID");
    const candidates = insultIds(state, player);
    if (candidates.length === 0) throw new Error("CALIGULA_INSULT_NO_CARD");
    if (!chosen) { openSingle(state, player, "pity-insult", candidates, CALIGULA_MAD_TYRANT_RESOLVE, openDecision); return; }
    armPity(state, player, chosen); return;
  }
  throw new Error("CALIGULA_MAD_TYRANT_ABILITY_INVALID");
};

export const resolveCaligulaMadTyrant: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("CALIGULA_MAD_TYRANT_DECISION_INVALID");
  const previous = payload.previous; const decision = payload.decision;
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("CALIGULA_MAD_TYRANT_DECISION_INVALID");
  const id = selections[0];
  if (previous.stage === "make-insult") return markInsult(state, player, id, definitions);
  if (previous.stage === "injury-insult") return activateInjury(state, player, id, definitions);
  if (previous.stage === "pity-insult") return armPity(state, player, id);
  if (previous.stage === "injury-loser") { adjustVictoryPoints(state.players[id], -2); return; }
  throw new Error("CALIGULA_MAD_TYRANT_DECISION_INVALID");
};

export const isCaligulaMadTyrantLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId]; if (!player || !definitions || !ability || !activeOwnedSkill(state, player, skill.id, definitions)) return false;
  if (ability.id === ABILITY_INSULT) return state.phase === "action" && handAttackIds(state, player, definitions).length > 0;
  if (ability.id === ABILITY_INJURY || ability.id === ABILITY_PITY) return state.phase === "combat" && insultIds(state, player).length > 0;
  return false;
};

export const useCaligulaFlucticulusDiana: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== ABILITY_LUNACY || state.phase !== "combat") throw new Error("CALIGULA_LUNACY_ABILITY_INVALID");
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("CALIGULA_LUNACY_SOURCE_INACTIVE");
  const targets = [player.id, ...sameFightOpponentIds(state, player)];
  for (const id of targets) setActivatedAbilityReplacement(state.players[id], state.round + 1, { totalPowerGain: 3 });
  return { targetPlayerIds: targets, round: state.round + 1 };
};
export const isCaligulaFlucticulusLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === ABILITY_LUNACY && state.phase === "combat" && activeOwnedSkill(state, player, skill.id, definitions));
};
