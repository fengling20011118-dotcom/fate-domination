import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { movePlayerByEffect } from "./board.ts";
import { addCardToAttack } from "./card-play.ts";
import { attachCard, getAttachedCards } from "./card-attachments.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";
import { closePlayerCard } from "./decks.ts";
import { calculateCombatCardPower } from "./combat-power.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const NEMO_BLESSING_ID = "servant.nemo.skill.sc-nemo-1";
export const NEMO_SPLIT_ID = "servant.nemo.skill.sc-nemo-2";
export const NEMO_NAUTILUS_ID = "servant.nemo.skill.sc-nemo-3";
export const NEMO_BLESSING_HANDLER = "core.nemo-sea-god-blessing";
export const NEMO_SPLIT_HANDLER = "core.nemo-split-thinking";
export const NEMO_SPLIT_RESOLVE = "core.nemo-split-thinking-resolve";
export const NEMO_NAUTILUS_HANDLER = "core.nemo-nautilus";

const SPLIT_STORE_ABILITY = "split-store";
const SPLIT_TEAMWORK_ABILITY = "split-teamwork";
const BLESSING_CHANNEL_ABILITY = "open-channel";
const NAUTILUS_RAM_ABILITY = "great-ram";

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
      if (!card || card.ownerPlayerId !== player.id || card.zone === "discard" || card.zone === "removed"
        || !matchesSkill(definition, card.definitionId, skillId)) return false;
      return !activeOnly || (card.zone === "attack" && card.active && card.face === "up");
    });
}

function splitNameKey(card: CardInstance, definition: CardDefinition, state: GameState, definitions: Record<string, CardDefinition>): string {
  const attributes = getCardAttributes(definition);
  if (definition.basic === true && !attributes.includes("特殊")) {
    const nonSpecial = attributes.filter((attribute) => attribute !== "特殊").sort();
    if (nonSpecial.length > 0) return `basic:${nonSpecial.join("|")}`;
  }
  return `definition:${definition.id}`;
}

function validateSplitSelection(
  state: GameState,
  player: PlayerState,
  source: CardInstance,
  instanceIds: string[],
  definitions: Record<string, CardDefinition>,
): number {
  if (instanceIds.length < 1 || new Set(instanceIds).size !== instanceIds.length) throw new Error("NEMO_SPLIT_SELECTION_INVALID");
  const keys = new Set<string>();
  for (const attached of getAttachedCards(state, source.instanceId)) {
    const definition = definitions[attached.definitionId];
    if (definition) keys.add(splitNameKey(attached, definition, state, definitions));
  }
  for (const instanceId of instanceIds) {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || card.ownerPlayerId !== player.id || card.zone !== "hand" || !player.hand.includes(instanceId)) {
      throw new Error("NEMO_SPLIT_CARD_INVALID");
    }
    const key = splitNameKey(card, definition, state, definitions);
    if (keys.has(key)) throw new Error("NEMO_SPLIT_DUPLICATE_NAME");
    keys.add(key);
  }
  const cost = 2 * instanceIds.length - 1;
  if (player.mana < cost) throw new Error("NEMO_SPLIT_MANA_INSUFFICIENT");
  return cost;
}

function storeSplitCards(
  state: GameState,
  player: PlayerState,
  source: CardInstance,
  instanceIds: string[],
  definitions: Record<string, CardDefinition>,
) {
  const cost = validateSplitSelection(state, player, source, instanceIds, definitions);
  payManaCost(state, player, cost, definitions);
  player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + cost;
  for (const instanceId of instanceIds) attachCard(state, instanceId, source.instanceId, "up");
  return { storedInstanceIds: [...instanceIds], paidMana: cost };
}

function splitCandidates(state: GameState, player: PlayerState, source: CardInstance, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    try {
      validateSplitSelection(state, player, source, [instanceId], definitions);
      return true;
    } catch {
      return false;
    }
  });
}

function openSplitDecision(
  state: GameState,
  player: PlayerState,
  source: CardInstance,
  candidates: string[],
  openDecision: SkillContext["openDecision"],
): void {
  const maxByMana = Math.max(0, Math.floor((player.mana + 1) / 2));
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${NEMO_SPLIT_ID}:store`;
  state.effectQueue.unshift({
    effectId,
    handlerId: NEMO_SPLIT_RESOLVE,
    sourceId: NEMO_SPLIT_ID,
    controllerPlayerId: player.id,
    payload: { stage: "store", sourceInstanceId: source.instanceId, candidateIds: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "nemo-split-store",
    options: candidates.map((instanceId) => ({ id: instanceId, label: instanceId })),
    min: 1,
    max: Math.min(candidates.length, maxByMana),
    allowCancel: true,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function playStoredCards(
  state: GameState,
  player: PlayerState,
  source: CardInstance,
  definitions: Record<string, CardDefinition>,
  emitEvent?: SkillContext["emitEvent"],
) {
  const instanceIds = getAttachedCards(state, source.instanceId)
    .filter((card) => card.attachmentPlacedRound !== state.round)
    .map((card) => card.instanceId);
  if (instanceIds.length === 0) throw new Error("NEMO_SPLIT_NO_MATURE_CARDS");

  const draft = structuredClone(state) as GameState;
  for (const instanceId of instanceIds) {
    addCardToAttack(draft, player.id, instanceId, definitions, {
      payCost: true,
      allowedSourceZones: ["attached"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
    });
  }

  const played: Array<{ instanceId: string; paidMana: number }> = [];
  for (const instanceId of instanceIds) {
    const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, {
      payCost: true,
      allowedSourceZones: ["attached"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
    });
    const definition = definitions[state.cards[instanceId].definitionId];
    if (definition.revealsTrueNameOnPlay === true && definition.skillOwnerType === "servant" && !player.trueNameRevealed) {
      revealPlayerTrueName(state, player.id);
    }
    emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana, attributes: getCardAttributes(definition), method: "nemo-teamwork" });
    emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, attributes: getCardAttributes(definition), method: "nemo-teamwork" });
    played.push({ instanceId, paidMana });
  }
  return { played };
}

export const useNemoSeaGodBlessing: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== BLESSING_CHANNEL_ABILITY) throw new Error("NEMO_BLESSING_ABILITY_INVALID");
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("NEMO_BLESSING_WINDOW_INVALID");
  const destination = player.locationId === "mountain" ? "city" : player.locationId === "city" ? "mountain" : undefined;
  if (!destination) throw new Error("NEMO_BLESSING_BATTLEFIELD_REQUIRED");
  const movement = movePlayerByEffect(state, player.id, destination, definitions);
  emitEvent?.("player.moved", { playerId: player.id, ...movement, method: "effect", sourceId: NEMO_BLESSING_ID });
  emitEvent?.("player.entered-location", { playerId: player.id, previousLocationId: movement.previousLocationId, locationId: movement.locationId, method: "effect", distance: movement.distance, sourceId: NEMO_BLESSING_ID });
  return movement;
};

export const isNemoSeaGodBlessingLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  return Boolean(player && ability?.id === BLESSING_CHANNEL_ABILITY && state.phase === "action" && state.activePlayerId === playerId
    && (player.locationId === "mountain" || player.locationId === "city"));
};

export const useNemoSplitThinking: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload)) throw new Error("NEMO_SPLIT_CONTEXT_REQUIRED");
  const source = ownedSkillSource(state, player, NEMO_SPLIT_ID, definitions);
  if (!source) throw new Error("NEMO_SPLIT_SOURCE_MISSING");
  if (payload.abilityId === SPLIT_STORE_ABILITY) {
    if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("NEMO_SPLIT_WINDOW_INVALID");
    const supplied = Array.isArray(payload.instanceIds) ? payload.instanceIds.filter((id): id is string => typeof id === "string") : [];
    if (supplied.length > 0) return storeSplitCards(state, player, source, supplied, definitions);
    const candidates = splitCandidates(state, player, source, definitions);
    if (candidates.length === 0) throw new Error("NEMO_SPLIT_NO_CANDIDATES");
    openSplitDecision(state, player, source, candidates, openDecision);
    return { pending: true, candidateIds: candidates };
  }
  if (payload.abilityId === SPLIT_TEAMWORK_ABILITY) {
    if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("NEMO_SPLIT_WINDOW_INVALID");
    return playStoredCards(state, player, source, definitions, emitEvent);
  }
  throw new Error("NEMO_SPLIT_ABILITY_INVALID");
};

export const resolveNemoSplitThinking: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("NEMO_SPLIT_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  if (previous.stage !== "store") throw new Error("NEMO_SPLIT_DECISION_INVALID");
  if (decision.status === "cancelled") return { cancelled: true };
  const candidates = Array.isArray(previous.candidateIds) ? previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length < 1 || selections.some((id) => !candidates.includes(id))) throw new Error("NEMO_SPLIT_DECISION_INVALID");
  const source = typeof previous.sourceInstanceId === "string" ? state.cards[previous.sourceInstanceId] : undefined;
  if (!source || source.ownerPlayerId !== player.id) throw new Error("NEMO_SPLIT_SOURCE_MISSING");
  return storeSplitCards(state, player, source, selections, definitions);
};

export const isNemoSplitThinkingLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.phase !== "action" || state.activePlayerId !== playerId || !ability) return false;
  const source = ownedSkillSource(state, player, NEMO_SPLIT_ID, definitions);
  if (!source) return false;
  if (ability.id === SPLIT_STORE_ABILITY) return splitCandidates(state, player, source, definitions).length > 0;
  if (ability.id === SPLIT_TEAMWORK_ABILITY) return getAttachedCards(state, source.instanceId).some((card) => card.attachmentPlacedRound !== state.round);
  return false;
};

export const useNemoNautilus: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("NEMO_NAUTILUS_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const source = ownedSkillSource(state, player, NEMO_NAUTILUS_ID, definitions, true);
  if (eventType === "player.deployed") {
    if (!source || !isRecord(payload.event) || payload.event.playerId !== player.id || payload.event.locationId !== "workshop") return;
    source.untilClosePowerBonus = Number(source.untilClosePowerBonus ?? 0) + 1;
    return { sourceInstanceId: source.instanceId, powerBonus: source.untilClosePowerBonus };
  }
  if (eventType === "combat.ending") {
    const closeId = typeof player.flags.nemoNautilusCloseAfterCombatInstanceId === "string"
      ? player.flags.nemoNautilusCloseAfterCombatInstanceId
      : undefined;
    if (!closeId) return;
    delete player.flags.nemoNautilusCloseAfterCombatInstanceId;
    const card = state.cards[closeId];
    if (!card || card.ownerPlayerId !== player.id || card.zone !== "attack") return;
    closePlayerCard(state, player.id, closeId, definitions);
    return { closedInstanceId: closeId };
  }
  if (payload.abilityId !== NAUTILUS_RAM_ABILITY) throw new Error("NEMO_NAUTILUS_ABILITY_INVALID");
  if (!source || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("NEMO_NAUTILUS_WINDOW_INVALID");
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("NEMO_NAUTILUS_BATTLEFIELD_REQUIRED");
  revealPlayerTrueName(state, player.id);
  const power = calculateCombatCardPower(state, player, source.instanceId, definitions, locationId);
  player.flags.roundTerrainAdvantageBonusRound = state.round;
  player.flags.roundTerrainAdvantageBonusLocationId = locationId;
  player.flags.roundTerrainAdvantageBonus = Number(player.flags.roundTerrainAdvantageBonus ?? 0) + power;
  player.flags.nemoNautilusCloseAfterCombatInstanceId = source.instanceId;
  return { sourceInstanceId: source.instanceId, terrainGain: power, locationId };
};

export const isNemoNautilusLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === NAUTILUS_RAM_ABILITY && state.phase === "action" && state.activePlayerId === playerId
    && (player.locationId === "mountain" || player.locationId === "city")
    && ownedSkillSource(state, player, NEMO_NAUTILUS_ID, definitions, true));
};
