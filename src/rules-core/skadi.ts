import type { GameState, PlayerState } from "../domain/state/types.ts";
import { StateRandom } from "../match-engine/random.ts";
import { movePlayerByEffect } from "./board.ts";
import { addCardToAttack } from "./card-play.ts";
import { assertCardCanEnterAttack } from "./card-rules.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";
import { drawCards, movePlayerCard, shufflePlayerDeck } from "./decks.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { gainVictoryPoints, loseMana, setManaGainBlockSource } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const SKADI_WISDOM_ID = "servant.skadi.skill.sc-skadi-1";
export const SKADI_RUNES_ID = "servant.skadi.skill.sc-skadi-2";
export const SKADI_CASTLE_ID = "servant.skadi.skill.sc-skadi-3";
export const SKADI_WISDOM_HANDLER = "core.skadi-wisdom";
export const SKADI_WISDOM_RESOLVE = "core.skadi-wisdom-resolve";
export const SKADI_RUNES_HANDLER = "core.skadi-runes";
export const SKADI_CASTLE_HANDLER = "core.skadi-castle";
export const SKADI_CASTLE_RESOLVE = "core.skadi-castle-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function physicalOwnedSkill(state: GameState, playerId: string, skillId: string, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return card.ownerPlayerId === playerId && (card.definitionId === skillId || definition?.linkedSkillId === skillId);
  });
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  const card = physicalOwnedSkill(state, player.id, skillId, definitions);
  return card?.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up" ? card : undefined;
}

function openDecision(
  state: GameState, player: PlayerState, sourceId: string, handlerId: string, kind: string,
  options: Array<{ id: string; label: string }>, min: number, max: number, payload: Record<string, unknown>, open: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${kind}`;
  state.effectQueue.unshift({ effectId, handlerId, sourceId, controllerPlayerId: player.id, payload, createdAtRevision: state.revision });
  open({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind,
    options, min, max, allowCancel: false, continuationEffectId: effectId, submissions: {} });
}

function currentRoundBasicCards(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).filter((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.basic === true && card.playedRound === state.round);
  });
}

function availableRuneCombos(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  const cards = currentRoundBasicCards(state, player, definitions);
  const combos = new Set<string>();
  for (let i = 0; i < cards.length; i += 1) for (let j = i + 1; j < cards.length; j += 1) {
    const a = getCardInstanceAttributes(cards[i], definitions[cards[i].definitionId], state, definitions).filter((x) => ["迅捷", "魔术", "特殊"].includes(x));
    const b = getCardInstanceAttributes(cards[j], definitions[cards[j].definitionId], state, definitions).filter((x) => ["迅捷", "魔术", "特殊"].includes(x));
    for (const left of a) for (const right of b) combos.add([left, right].sort().join("+"));
  }
  return [...combos];
}

function playableHandAttacks(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || definition.cardType !== "attack") return false;
    try {
      assertCardCanEnterAttack({ state, playerId: player.id, instanceId, definitions, faceDown: false, allowedSourceZones: ["hand"], bypassTiming: true });
      return true;
    } catch { return false; }
  });
}

function openRuneFollowup(state: GameState, player: PlayerState, combo: string, definitions: Record<string, CardDefinition>, open: SkillContext["openDecision"]): unknown {
  if (combo === "特殊+特殊") return { effect: "ansuz", victoryPoints: gainVictoryPoints(player, 4) };
  if (combo === "魔术+魔术") {
    const affected: string[] = [];
    for (const id of state.board.locations[player.locationId ?? ""] ?? []) {
      if (id === player.id || state.players[id]?.eliminated) continue;
      loseMana(state.players[id], 2);
      affected.push(id);
    }
    return { effect: "isan", affectedPlayerIds: affected };
  }
  if (combo === "特殊+魔术") {
    if (player.flags.deploymentBonusActive === true && Number(player.flags.deploymentBonus ?? 0) > 0) {
      player.flags.deploymentBonus = Number(player.flags.deploymentBonus) * 3;
    }
    return { effect: "peorth", terrainAdvantage: Number(player.flags.deploymentBonus ?? 0) };
  }
  if (combo === "特殊+迅捷") {
    player.flags.skadiTeiwazRound = state.round;
    return { effect: "teiwaz", armed: true };
  }
  if (combo === "迅捷+迅捷") {
    const locations = Object.keys(state.board.locations).filter((id) => id !== player.locationId);
    openDecision(state, player, SKADI_WISDOM_ID, SKADI_WISDOM_RESOLVE, "skadi-raido-location",
      locations.map((id) => ({ id, label: id })), 1, 1, { stage: "raido", candidateIds: locations }, open);
    return { effect: "raido", pending: true };
  }
  if (combo === "迅捷+魔术") {
    const candidates = playableHandAttacks(state, player, definitions);
    if (candidates.length === 0) return { effect: "haglaz", playedInstanceId: null };
    openDecision(state, player, SKADI_WISDOM_ID, SKADI_WISDOM_RESOLVE, "skadi-haglaz-attack",
      candidates.map((id) => ({ id, label: definitions[state.cards[id].definitionId]?.name ?? id })), 1, 1,
      { stage: "haglaz", candidateIds: candidates }, open);
    return { effect: "haglaz", pending: true };
  }
  throw new Error("SKADI_RUNE_COMBO_INVALID");
}

export const useSkadiWisdom: SkillHandler = ({ state, player, skill, payload, definitions, openDecision: open, randomInt }) => {
  if (!definitions) throw new Error("SKADI_WISDOM_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId === "wisdom-outpost") {
    if (state.phase !== "outpost") throw new Error("SKADI_WISDOM_OUTPOST_WINDOW_INVALID");
    payManaCost(state, player, 1, definitions, "SKADI_WISDOM_MANA_REQUIRED");
    player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + 1;
    const random = new StateRandom();
    drawCards(state, player.id, 1, randomInt ?? ((max) => random.integer(state, max)), definitions);
    if (player.hand.length < 2) throw new Error("SKADI_WISDOM_TWO_HAND_CARDS_REQUIRED");
    openDecision(state, player, skill.id, SKADI_WISDOM_RESOLVE, "skadi-wisdom-shuffle-two",
      player.hand.map((id) => ({ id, label: definitions[state.cards[id]?.definitionId ?? ""]?.name ?? id })), 2, 2,
      { stage: "shuffle", candidateIds: [...player.hand] }, open);
    return { pending: true };
  }
  if (data.abilityId === "wisdom-action") {
    if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("SKADI_WISDOM_ACTION_WINDOW_INVALID");
    const combos = availableRuneCombos(state, player, definitions);
    if (combos.length === 0) throw new Error("SKADI_WISDOM_TWO_BASICS_REQUIRED");
    payManaCost(state, player, 3, definitions, "SKADI_WISDOM_MANA_REQUIRED");
    player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + 3;
    openDecision(state, player, skill.id, SKADI_WISDOM_RESOLVE, "skadi-rune-combo",
      combos.map((id) => ({ id, label: id })), 1, 1, { stage: "combo", candidateIds: combos }, open);
    return { pending: true, combos };
  }
  throw new Error("SKADI_WISDOM_ABILITY_INVALID");
};

export const resolveSkadiWisdom: SkillHandler = ({ state, player, payload, definitions, openDecision: open, randomInt, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("SKADI_WISDOM_DECISION_INVALID");
  const previous = payload.previous;
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  const candidates = Array.isArray(previous.candidateIds) ? previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.some((id) => !candidates.includes(id))) throw new Error("SKADI_WISDOM_DECISION_INVALID");
  if (previous.stage === "shuffle") {
    if (selections.length !== 2 || new Set(selections).size !== 2 || selections.some((id) => !player.hand.includes(id))) throw new Error("SKADI_WISDOM_SHUFFLE_INVALID");
    for (const id of selections) movePlayerCard(state, player.id, id, "deck");
    const random = new StateRandom();
    shufflePlayerDeck(state, player.id, randomInt ?? ((max) => random.integer(state, max)));
    return { shuffledInstanceIds: selections };
  }
  if (previous.stage === "combo") {
    if (selections.length !== 1 || !availableRuneCombos(state, player, definitions).includes(selections[0])) throw new Error("SKADI_RUNE_COMBO_INVALID");
    return openRuneFollowup(state, player, selections[0], definitions, open);
  }
  if (previous.stage === "raido") {
    if (selections.length !== 1) throw new Error("SKADI_RAIDO_LOCATION_INVALID");
    return { effect: "raido", ...movePlayerByEffect(state, player.id, selections[0], definitions) };
  }
  if (previous.stage === "haglaz") {
    if (selections.length !== 1 || !player.hand.includes(selections[0]) || !playableHandAttacks(state, player, definitions).includes(selections[0])) throw new Error("SKADI_HAGLAZ_ATTACK_INVALID");
    const instanceId = selections[0];
    const result = addCardToAttack(state, player.id, instanceId, definitions, { payCost: true, allowedSourceZones: ["hand"], bypassFaceUpPlayLimit: true, bypassTiming: true });
    const definition = definitions[state.cards[instanceId].definitionId];
    emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana: result.paidMana, method: "skadi-haglaz" });
    return { effect: "haglaz", playedInstanceId: instanceId, paidMana: result.paidMana };
  }
  throw new Error("SKADI_WISDOM_STAGE_INVALID");
};

export const useSkadiRunes: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== "teiwaz-combat") throw new Error("SKADI_RUNES_ABILITY_INVALID");
  if (state.phase !== "combat" || Number(player.flags.skadiTeiwazRound ?? -1) !== state.round) throw new Error("SKADI_TEIWAZ_NOT_ARMED");
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("SKADI_TEIWAZ_LOCATION_INVALID");
  const opponents = (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated);
  if (opponents.length !== 1) throw new Error("SKADI_TEIWAZ_OPPONENT_COUNT_INVALID");
  delete player.flags.skadiTeiwazRound;
  return applyDefeatEffect(state, opponents[0], player.id, definitions, emitEvent, { sourceId: SKADI_RUNES_ID, method: "skadi-teiwaz" });
};

function syncCastleManaBlock(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  const physical = physicalOwnedSkill(state, player.id, SKADI_CASTLE_ID, definitions);
  const key = `skadi-castle:${physical?.instanceId ?? player.id}`;
  const active = physical?.controllerPlayerId === player.id && physical.zone === "attack" && physical.active && physical.face === "up";
  for (const target of Object.values(state.players)) {
    const blocked = Boolean(active && target.id !== player.id && !target.eliminated && target.locationId === player.locationId
      && (player.locationId === "mountain" || player.locationId === "city" || player.locationId === "workshop" || player.locationId === "scouting"));
    setManaGainBlockSource(target, key, blocked);
  }
  if (!active) state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => !modifier.id.startsWith(`${SKADI_CASTLE_ID}:base-power:`));
}

export const useSkadiCastle: SkillHandler = ({ state, player, skill, payload, definitions, openDecision: open }) => {
  if (!definitions) throw new Error("SKADI_CASTLE_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType) {
    syncCastleManaBlock(state, player, definitions);
    return;
  }
  if (data.abilityId !== "castle-type" || state.phase !== "outpost" || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("SKADI_CASTLE_ABILITY_INVALID");
  const attrs = ["力量", "迅捷", "魔术", "特殊"];
  openDecision(state, player, skill.id, SKADI_CASTLE_RESOLVE, "skadi-castle-type",
    attrs.map((id) => ({ id, label: id })), 1, 1, { candidateIds: attrs }, open);
  return { pending: true };
};

export const resolveSkadiCastle: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("SKADI_CASTLE_DECISION_INVALID");
  const allowed = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !allowed.includes(selections[0]) || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("SKADI_CASTLE_DECISION_INVALID");
  state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => !modifier.id.startsWith(`${skill.id}:base-power:`));
  state.activeRuleModifiers.push({
    id: `${skill.id}:base-power:${state.round}`, sourceId: skill.id, controllerPlayerId: player.id,
    sourceInstanceId: activeOwnedSkill(state, player, skill.id, definitions)?.instanceId,
    operation: "multiply", rule: "card_base_power", scope: { subject: "players_at_source_location", cards: { basic: true, attributesAny: [selections[0]] } },
    value: 2, duration: "round", createdRound: state.round,
  });
  return { attribute: selections[0] };
};

export const isSkadiWisdomLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !ability) return false;
  if (ability.id === "wisdom-outpost") return state.phase === "outpost" && (player.flags.infiniteMana === true || player.mana >= 1) && player.deck.length > 0;
  if (ability.id === "wisdom-action") return state.phase === "action" && state.activePlayerId === playerId && (player.flags.infiniteMana === true || player.mana >= 3)
    && availableRuneCombos(state, player, definitions).length > 0;
  return false;
};
export const isSkadiRunesLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  if (!player || ability?.id !== "teiwaz-combat" || state.phase !== "combat" || Number(player.flags.skadiTeiwazRound ?? -1) !== state.round) return false;
  const locationId = player.locationId;
  return Boolean(locationId && (state.board.locations[locationId] ?? []).filter((id) => id !== playerId && !state.players[id]?.eliminated).length === 1);
};
export const isSkadiCastleLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "castle-type" && state.phase === "outpost" && activeOwnedSkill(state, player, skill.id, definitions));
};
