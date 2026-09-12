import type { GameState, PlayerState } from "../domain/state/types.ts";
import { StateRandom } from "../match-engine/random.ts";
import { addCardToAttack } from "./card-play.ts";
import { assertCardCanEnterAttack } from "./card-rules.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardPlayCost, payManaCost } from "./costs.ts";
import { createDerivedCardInstance, drawCards, movePlayerCard } from "./decks.ts";
import { isBattlefieldLocation } from "./battlefield-rules.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const HIJIKATA_COAT_ID = "servant.hijikata.skill.sc-hijikata-1";
export const HIJIKATA_FLAG_ID = "servant.hijikata.skill.sc-hijikata-2";
export const HIJIKATA_LAW_ID = "servant.hijikata.skill.sc-hijikata-3";
export const HIJIKATA_COAT_HANDLER = "core.hijikata-coat";
export const HIJIKATA_FLAG_HANDLER = "core.hijikata-flag";
export const HIJIKATA_LAW_HANDLER = "core.hijikata-law";
export const HIJIKATA_FLAG_RESOLVE = "core.hijikata-flag-resolve";
const OUTSIDE_BERSERKER_ID = "card.cardb5";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card?.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
  });
}

function physicalTenet(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === player.id && card.zone !== "removed"
    && (card.definitionId === skillId || definitions[card.definitionId]?.linkedSkillId === skillId));
}

function replaceHandWithBerserkers(state: GameState, player: PlayerState, sourceId: string, definitions: Record<string, CardDefinition>): string[] {
  if (!definitions[OUTSIDE_BERSERKER_ID]) throw new Error("HIJIKATA_BERSERKER_DEFINITION_MISSING");
  for (const instanceId of [...player.hand]) movePlayerCard(state, player.id, instanceId, "discard");
  const created: string[] = [];
  for (let index = 0; index < 2; index += 1) {
    const instanceId = `${player.id}:hijikata-berserker:${state.round}:${state.revision}:${index + 1}`;
    createDerivedCardInstance(state, player.id, {
      instanceId,
      definitionId: OUTSIDE_BERSERKER_ID,
      zone: "hand",
      face: "down",
      active: false,
      sourceEffectId: `${sourceId}:broken-tenet`,
    });
    created.push(instanceId);
  }
  return created;
}

function breakTenet(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  const tenet = physicalTenet(state, player, skillId, definitions);
  if (!tenet) return { broken: false, removedInstanceId: null, replacementInstanceIds: [] as string[] };
  movePlayerCard(state, player.id, tenet.instanceId, "removed");
  const replacementInstanceIds = replaceHandWithBerserkers(state, player, skillId, definitions);
  return { broken: true, removedInstanceId: tenet.instanceId, replacementInstanceIds };
}

function uniqueLowestOpponentAt(state: GameState, player: PlayerState, locationId: string): string | undefined {
  const opponents = Object.values(state.players).filter((candidate) => candidate.id !== player.id && !candidate.eliminated);
  if (opponents.length === 0) return undefined;
  const minimum = Math.min(...opponents.map((candidate) => candidate.victoryPoints));
  const lowest = opponents.filter((candidate) => candidate.victoryPoints === minimum);
  return lowest.length === 1 && lowest[0].locationId === locationId ? lowest[0].id : undefined;
}

function harmonyBroken(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  const basics = player.attack.map((id) => state.cards[id]).filter((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.basic === true && card.zone === "attack" && card.controllerPlayerId === player.id);
  });
  for (let i = 0; i < basics.length; i += 1) for (let j = i + 1; j < basics.length; j += 1) {
    const a = getCardInstanceAttributes(basics[i], definitions[basics[i].definitionId], state, definitions);
    const b = getCardInstanceAttributes(basics[j], definitions[basics[j].definitionId], state, definitions);
    if (!a.some((attribute) => b.includes(attribute))) return true;
  }
  return false;
}

export const useHijikataCoat: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("HIJIKATA_COAT_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "player.entered-location") {
    const event = isRecord(data.event) ? data.event : {};
    const locationId = typeof event.locationId === "string" ? event.locationId : player.locationId;
    if (event.playerId !== player.id || state.activePlayerId !== player.id || !locationId || !isBattlefieldLocation(state, locationId)
      || !uniqueLowestOpponentAt(state, player, locationId)) return;
    return breakTenet(state, player, skill.id, definitions);
  }
  if (data.abilityId !== "responsibility-power" || state.phase !== "outpost" || !activeOwnedSkill(state, player, skill.id, definitions)) {
    throw new Error("HIJIKATA_COAT_ABILITY_INVALID");
  }
  payManaCost(state, player, 1, definitions, "HIJIKATA_COAT_MANA_REQUIRED");
  player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + 1;
  player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 4;
  return { paidMana: 1, powerGained: 4 };
};

function rallyCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    try {
      assertCardCanEnterAttack({ state, playerId: player.id, instanceId, definitions, faceDown: false, allowedSourceZones: ["hand"], bypassTiming: true });
      return true;
    } catch { return false; }
  });
}

function rallyCost(state: GameState, player: PlayerState, instanceId: string, definitions: Record<string, CardDefinition>): number {
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !definition) throw new Error("HIJIKATA_RALLY_CARD_INVALID");
  const normal = getCardPlayCost(state, definition, player, card, definitions);
  return Math.max(0, normal - (definition.tags?.includes("berserker-attack") ? 1 : 0));
}

function openRallyDecision(state: GameState, player: PlayerState, candidates: string[], definitions: Record<string, CardDefinition>, openDecision: SkillContext["openDecision"]): void {
  if (candidates.length < 2) throw new Error("HIJIKATA_RALLY_TWO_CARDS_REQUIRED");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${HIJIKATA_FLAG_ID}:rally`;
  state.effectQueue.unshift({ effectId, handlerId: HIJIKATA_FLAG_RESOLVE, sourceId: HIJIKATA_FLAG_ID, controllerPlayerId: player.id, payload: { candidates }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "hijikata-rally-cards",
    options: candidates.map((id) => ({ id, label: definitions[state.cards[id]?.definitionId ?? ""]?.name ?? id })),
    min: 2, max: 2, allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
}

export const useHijikataFlag: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, randomInt }) => {
  if (!definitions) throw new Error("HIJIKATA_FLAG_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "card.played") {
    const event = isRecord(data.event) ? data.event : {};
    const locationId = typeof event.locationId === "string" ? event.locationId : player.locationId;
    if (event.playerId !== player.id || event.face !== "down" || !locationId || !isBattlefieldLocation(state, locationId)) return;
    return breakTenet(state, player, skill.id, definitions);
  }
  if (data.abilityId !== "rally" || state.phase !== "action" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, skill.id, definitions)) {
    throw new Error("HIJIKATA_RALLY_INVALID");
  }
  const random = new StateRandom();
  drawCards(state, player.id, 1, randomInt ?? ((max) => random.integer(state, max)), definitions);
  const candidates = rallyCandidates(state, player, definitions);
  openRallyDecision(state, player, candidates, definitions, openDecision);
  return { pending: true, candidates };
};

export const resolveHijikataRally: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("HIJIKATA_RALLY_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidates) ? payload.previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 2 || new Set(selections).size !== 2 || selections.some((id) => !candidates.includes(id) || !player.hand.includes(id))) {
    throw new Error("HIJIKATA_RALLY_DECISION_INVALID");
  }
  const trial = structuredClone(state) as GameState;
  let total = 0;
  for (const instanceId of selections) {
    const trialPlayer = trial.players[player.id];
    const cost = rallyCost(trial, trialPlayer, instanceId, definitions);
    payManaCost(trial, trialPlayer, cost, definitions, "HIJIKATA_RALLY_MANA_REQUIRED");
    addCardToAttack(trial, player.id, instanceId, definitions, { payCost: false, allowedSourceZones: ["hand"], bypassFaceUpPlayLimit: true, bypassTiming: true });
    total += cost;
  }
  const played: Array<{ instanceId: string; paidMana: number }> = [];
  for (const instanceId of selections) {
    const cost = rallyCost(state, player, instanceId, definitions);
    payManaCost(state, player, cost, definitions, "HIJIKATA_RALLY_MANA_REQUIRED");
    const definition = definitions[state.cards[instanceId].definitionId];
    addCardToAttack(state, player.id, instanceId, definitions, { payCost: false, allowedSourceZones: ["hand"], bypassFaceUpPlayLimit: true, bypassTiming: true });
    state.cards[instanceId].paidCost = cost;
    if (cost > 0) player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + cost;
    played.push({ instanceId, paidMana: cost });
    emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana: cost, method: "hijikata-rally" });
    emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, method: "hijikata-rally" });
  }
  return { played, paidMana: total };
};

export const useHijikataLaw: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("HIJIKATA_LAW_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType !== "attack.committed" && data.eventType !== "card.played") return;
  if (!physicalTenet(state, player, skill.id, definitions) || !harmonyBroken(state, player, definitions)) return;
  return breakTenet(state, player, skill.id, definitions);
};

export const isHijikataCoatLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "responsibility-power" && state.phase === "outpost"
    && activeOwnedSkill(state, player, skill.id, definitions) && (player.flags.infiniteMana === true || player.mana >= 1));
};

export const isHijikataFlagLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "rally" && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions));
};
