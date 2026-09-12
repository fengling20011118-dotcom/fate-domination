import type { CardDefinition } from "./content-types.ts";
import type { GameState, PlayerState } from "../domain/state/types.ts";
import { getCardPlayCost, payManaCost } from "./costs.ts";
import { getEffectiveCardUsageLimit } from "./usage-limits.ts";
import { isOuterGodLifeDefinitionId } from "./clytie.ts";
import { removeCardUntilCombatEnd, restoreCardsAfterCombat } from "./decks.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const HOKUSAI_BEYOND_ID = "servant.hokusai.skill.sc-hokusai-1";
export const HOKUSAI_WORLD_ID = "servant.hokusai.skill.sc-hokusai-2";
export const HOKUSAI_WAVE_ID = "servant.hokusai.skill.sc-hokusai-3";
export const HOKUSAI_BEYOND_HANDLER = "core.hokusai-colors-beyond";
export const HOKUSAI_BEYOND_RESOLVE = "core.hokusai-colors-beyond-resolve";
export const HOKUSAI_WORLD_HANDLER = "core.hokusai-colors-world";
export const HOKUSAI_WORLD_RESOLVE = "core.hokusai-colors-world-resolve";
export const HOKUSAI_WAVE_HANDLER = "core.hokusai-great-wave";

const COLORS = ["力量", "迅捷", "魔术", "特殊", "宝具"] as const;

type Color = typeof COLORS[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.active && card.face === "up" && card.zone === "attack" && card.ownerPlayerId === player.id
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function beyondTargetIds(state: GameState, definitions: Record<string, CardDefinition>): string[] {
  const result: string[] = [];
  for (const target of Object.values(state.players)) {
    if (target.eliminated) continue;
    for (const instanceId of target.attack) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || !definition || card.zone !== "attack" || !card.active || card.face !== "up") continue;
      if (getEffectiveCardUsageLimit(card, definition.limit) === "once-per-game") continue;
      result.push(instanceId);
    }
  }
  return [...new Set(result)];
}

function handForeignerIds(state: GameState, player: PlayerState): string[] {
  return player.hand.filter((instanceId) => isOuterGodLifeDefinitionId(state.cards[instanceId]?.definitionId));
}

function openBeyondDecision(
  state: GameState,
  player: PlayerState,
  stage: "target" | "replacement",
  previous: Record<string, unknown>,
  candidates: string[],
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${HOKUSAI_BEYOND_ID}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: HOKUSAI_BEYOND_RESOLVE,
    sourceId: HOKUSAI_BEYOND_ID,
    controllerPlayerId: player.id,
    payload: { stage, ...previous, candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `hokusai-colors-beyond-${stage}`,
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function applyPaintOver(
  state: GameState,
  player: PlayerState,
  targetInstanceId: string,
  replacementInstanceId: string,
  definitions: Record<string, CardDefinition>,
) {
  if (!beyondTargetIds(state, definitions).includes(targetInstanceId)) throw new Error("HOKUSAI_BEYOND_TARGET_INVALID");
  if (!handForeignerIds(state, player).includes(replacementInstanceId)) throw new Error("HOKUSAI_BEYOND_REPLACEMENT_INVALID");
  const targetCard = state.cards[targetInstanceId];
  const targetController = targetCard.controllerPlayerId ? state.players[targetCard.controllerPlayerId] : undefined;
  const targetDefinition = definitions[targetCard.definitionId];
  if (!targetController || !targetDefinition) throw new Error("HOKUSAI_BEYOND_TARGET_INVALID");
  const manaCost = getCardPlayCost(state, targetDefinition, targetController, targetCard, definitions);
  payManaCost(state, player, manaCost, definitions);
  const controllerPlayerId = targetController.id;
  removeCardUntilCombatEnd(state, targetInstanceId, HOKUSAI_BEYOND_ID);

  const replacement = state.cards[replacementInstanceId];
  player.hand = player.hand.filter((id) => id !== replacementInstanceId);
  targetController.attack.push(replacementInstanceId);
  replacement.controllerPlayerId = controllerPlayerId;
  replacement.zone = "attack";
  replacement.face = "up";
  replacement.active = true;
  replacement.residual = false;
  replacement.paidCost = 0;
  replacement.playedRound = state.round;
  replacement.playedLocationId = targetController.locationId;
  replacement.returnToOwnerDiscardOnClose = true;
  return { targetInstanceId, replacementInstanceId, controllerPlayerId, paidMana: manaCost };
}

/** Colors of Beyond / Paint Over. */
export const useHokusaiColorsBeyond: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("HOKUSAI_BEYOND_CONTEXT_REQUIRED");
  if (payload.eventType === "combat.ending") return { restoredInstanceIds: restoreCardsAfterCombat(state, HOKUSAI_BEYOND_ID) };
  if (payload.abilityId !== "paint-over" || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("HOKUSAI_BEYOND_WINDOW_INVALID");
  const targets = beyondTargetIds(state, definitions);
  const replacements = handForeignerIds(state, player);
  if (targets.length === 0 || replacements.length === 0) throw new Error("HOKUSAI_BEYOND_NO_VALID_PAIR");
  const targetInstanceId = typeof payload.targetInstanceId === "string" ? payload.targetInstanceId : undefined;
  const replacementInstanceId = typeof payload.replacementInstanceId === "string" ? payload.replacementInstanceId : undefined;
  if (targetInstanceId && replacementInstanceId) return applyPaintOver(state, player, targetInstanceId, replacementInstanceId, definitions);
  if (targetInstanceId) {
    if (!targets.includes(targetInstanceId)) throw new Error("HOKUSAI_BEYOND_TARGET_INVALID");
    openBeyondDecision(state, player, "replacement", { targetInstanceId }, replacements, definitions, openDecision);
    return { pending: true, stage: "replacement" };
  }
  openBeyondDecision(state, player, "target", {}, targets, definitions, openDecision);
  return { pending: true, stage: "target" };
};

export const resolveHokusaiColorsBeyond: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("HOKUSAI_BEYOND_DECISION_INVALID");
  const previous = payload.previous;
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1) throw new Error("HOKUSAI_BEYOND_DECISION_INVALID");
  if (previous.stage === "target") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selections[0])) throw new Error("HOKUSAI_BEYOND_TARGET_INVALID");
    const replacements = handForeignerIds(state, player);
    if (replacements.length === 0) throw new Error("HOKUSAI_BEYOND_REPLACEMENT_INVALID");
    openBeyondDecision(state, player, "replacement", { targetInstanceId: selections[0] }, replacements, definitions, openDecision);
    return { pending: true, stage: "replacement" };
  }
  if (previous.stage === "replacement") {
    const targetInstanceId = typeof previous.targetInstanceId === "string" ? previous.targetInstanceId : undefined;
    if (!targetInstanceId) throw new Error("HOKUSAI_BEYOND_TARGET_INVALID");
    return applyPaintOver(state, player, targetInstanceId, selections[0], definitions);
  }
  throw new Error("HOKUSAI_BEYOND_DECISION_INVALID");
};

export const isHokusaiColorsBeyondLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "paint-over" && state.phase === "action" && state.activePlayerId === playerId
    && beyondTargetIds(state, definitions).length > 0 && handForeignerIds(state, player).length > 0);
};

function faceUpColorTargetIds(state: GameState): string[] {
  const physical = Object.values(state.cards).filter((card) => card.face === "up" && card.zone !== "hand" && card.zone !== "deck" && card.zone !== "discard" && card.zone !== "removed").map((card) => card.instanceId);
  const events = [...state.board.currentEvents.mountain, ...state.board.currentEvents.city]
    .filter((eventId) => state.board.eventVisibility[eventId] === "up");
  return [...new Set([...physical, ...events, ...state.board.activeSituations])];
}

function colorOverrides(state: GameState): Record<string, { round: number; attribute: Color; sourceId: string }> {
  const existing = state.modeState.namedCardAttributeOverrides;
  if (isRecord(existing)) return existing as Record<string, { round: number; attribute: Color; sourceId: string }>;
  const created: Record<string, { round: number; attribute: Color; sourceId: string }> = {};
  state.modeState.namedCardAttributeOverrides = created;
  return created;
}

export function getNamedCardAttributeOverride(state: GameState, targetId: string): Color | undefined {
  const entry = colorOverrides(state)[targetId];
  return entry?.round === state.round ? entry.attribute : undefined;
}

function applyColorPlacements(state: GameState, placements: Array<{ targetId: string; attribute: Color }>): { placements: Array<{ targetId: string; attribute: Color }> } {
  if (placements.length > 3) throw new Error("HOKUSAI_WORLD_TOO_MANY_COLORS");
  const validTargets = new Set(faceUpColorTargetIds(state));
  const targetIds = placements.map((item) => item.targetId);
  const attributes = placements.map((item) => item.attribute);
  if (new Set(targetIds).size !== targetIds.length || new Set(attributes).size !== attributes.length) throw new Error("HOKUSAI_WORLD_UNIQUENESS_INVALID");
  if (placements.some((item) => !validTargets.has(item.targetId) || !COLORS.includes(item.attribute))) throw new Error("HOKUSAI_WORLD_TARGET_INVALID");
  const runtime = colorOverrides(state);
  for (const item of placements) {
    const physical = state.cards[item.targetId];
    if (physical) {
      physical.attributeOverrides = [item.attribute];
      const marker = `attribute-overrides-until-round-end:${state.round}:${HOKUSAI_WORLD_ID}:color`;
      physical.modifiers = [...(physical.modifiers ?? []).filter((value) => value !== marker), marker];
    } else {
      runtime[item.targetId] = { round: state.round, attribute: item.attribute, sourceId: HOKUSAI_WORLD_ID };
    }
  }
  return { placements };
}

/** Colors of the World uses one compact Cartesian-product decision; target and color must each be unique. */
export const useHokusaiColorsWorld: SkillHandler = ({ state, player, payload, openDecision }) => {
  if (!isRecord(payload) || payload.abilityId !== "color-world" || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("HOKUSAI_WORLD_WINDOW_INVALID");
  if (Array.isArray(payload.placements)) {
    const placements = payload.placements.filter(isRecord).map((item) => ({ targetId: String(item.targetId ?? ""), attribute: String(item.attribute ?? "") as Color }));
    if (placements.length !== payload.placements.length) throw new Error("HOKUSAI_WORLD_PLACEMENTS_INVALID");
    return applyColorPlacements(state, placements);
  }
  const options = faceUpColorTargetIds(state).flatMap((targetId) => COLORS.map((attribute) => ({ id: `${targetId}::${attribute}`, label: `${targetId} → ${attribute}` })));
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${HOKUSAI_WORLD_ID}:colors`;
  state.effectQueue.unshift({ effectId, handlerId: HOKUSAI_WORLD_RESOLVE, sourceId: HOKUSAI_WORLD_ID, controllerPlayerId: player.id, payload: { options: options.map((item) => item.id) }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "hokusai-colors-world", options, min: 0, max: Math.min(3, options.length), allowCancel: false, continuationEffectId: effectId, submissions: {} });
  return { pending: true };
};

export const resolveHokusaiColorsWorld: SkillHandler = ({ state, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision) || payload.decision.status !== "resolved") throw new Error("HOKUSAI_WORLD_DECISION_INVALID");
  const allowed = Array.isArray(payload.previous.options) ? payload.previous.options.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (selections.some((id) => !allowed.includes(id))) throw new Error("HOKUSAI_WORLD_DECISION_INVALID");
  const placements = selections.map((selection) => {
    const split = selection.lastIndexOf("::");
    if (split <= 0) throw new Error("HOKUSAI_WORLD_DECISION_INVALID");
    return { targetId: selection.slice(0, split), attribute: selection.slice(split + 2) as Color };
  });
  return applyColorPlacements(state, placements);
};

export const isHokusaiColorsWorldLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => Boolean(
  state.players[playerId] && ability?.id === "color-world" && state.phase === "action" && state.activePlayerId === playerId,
);

/** The Great Wave: two-round residual, second-round penalty, and a live battlefield card-power rule. */
export const useHokusaiGreatWave: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("HOKUSAI_WAVE_CONTEXT_REQUIRED");
  if (payload.eventType === "card.played") {
    const event = isRecord(payload.event) ? payload.event : {};
    if (event.playerId !== player.id || event.face !== "up" || typeof event.definitionId !== "string" || !matchesSkill(definitions[event.definitionId], event.definitionId, skill.id)) return;
    const instanceId = typeof event.instanceId === "string" ? event.instanceId : player.attack.find((id) => matchesSkill(definitions[state.cards[id]?.definitionId], state.cards[id]?.definitionId ?? "", skill.id));
    const source = instanceId ? state.cards[instanceId] : undefined;
    if (!source) return;
    source.residual = true;
    source.residualUntilRound = state.round + 1;
    source.playedRound = state.round;
    return { residualUntilRound: source.residualUntilRound };
  }
  if (payload.eventType === "round.started") {
    const source = activeOwnedSkill(state, player, skill.id, definitions);
    if (!source || source.playedRound !== state.round - 1) return;
    source.powerModifiers = [...(source.powerModifiers ?? []).filter((modifier) => modifier.id !== `${skill.id}:second-round`), { id: `${skill.id}:second-round`, sourceId: skill.id, kind: "add", value: -3, duration: "round" }];
    return { secondRoundPenalty: -3 };
  }
  if (payload.abilityId !== "great-wave-combat" || state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("HOKUSAI_WAVE_WINDOW_INVALID");
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("HOKUSAI_WAVE_SOURCE_INACTIVE");
  const id = `${skill.id}:non-magic-minus-two:${state.round}:${source.instanceId}`;
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
  state.activeRuleModifiers.push({
    id,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    sourceInstanceId: source.instanceId,
    operation: "subtract",
    rule: "card_power",
    scope: { subject: "opponents_at_source_battlefield", cards: { attributesNone: ["魔术"], zones: ["attack"] } },
    value: 2,
    duration: "while-source-active",
    createdRound: state.round,
  });
  return { powerReduction: 2 };
};

export const isHokusaiGreatWaveLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "great-wave-combat" && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions));
};

/** Helper for event/objective/situation rules that need the effective named attribute after a Color token. */
export function replaceNamedAttributesForColor(state: GameState, targetId: string, printed: readonly string[]): string[] {
  const override = getNamedCardAttributeOverride(state, targetId);
  return override ? [override] : [...printed];
}

/** Replace every printed attribute key in an attribute-indexed rule map with the Color token type. */
export function replaceAttributeMapForColor<T extends number>(state: GameState, targetId: string, printed: Partial<Record<string, T>> | undefined): Partial<Record<string, T>> | undefined {
  const override = getNamedCardAttributeOverride(state, targetId);
  if (!override || !printed) return printed;
  const values = Object.values(printed).filter((value): value is T => typeof value === "number");
  if (values.length === 0) return {};
  return { [override]: values.reduce((sum, value) => (sum + Number(value)) as T, 0 as T) };
}

/** Helper for tests/other rules that need a physical card's effective attributes. */
export function getHokusaiAwareCardAttributes(state: GameState, instanceId: string, definitions: Record<string, CardDefinition>): string[] {
  const instance = state.cards[instanceId];
  const definition = instance ? definitions[instance.definitionId] : undefined;
  return instance && definition ? getCardInstanceAttributes(instance, definition, state, definitions) : [];
}
