import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { attachCard, detachCard, getTopAttachedCard } from "./card-attachments.ts";
import { joinOwnedCardToAttack } from "./card-play.ts";
import type { CardDefinition } from "./content-types.ts";
import { applyTemporaryCardDefinitionCopy, closePlayerCard, drawCards } from "./decks.ts";
import { transferVictoryPoints } from "./resources.ts";
import { addSkillUseBlock } from "./skill-use-blocks.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const MORIARTY_WICKED_ID = "servant.moriarty.skill.sc-moriarty-1";
export const MORIARTY_SPIDER_ID = "servant.moriarty.skill.sc-moriarty-2";
export const MORIARTY_DYNAMICS_ID = "servant.moriarty.skill.sc-moriarty-3";

export const MORIARTY_WICKED_HANDLER = "core.moriarty-wicked-charisma";
export const MORIARTY_WICKED_RESOLVE = "core.moriarty-wicked-charisma-resolve";
export const MORIARTY_SPIDER_HANDLER = "core.moriarty-spider-web";
export const MORIARTY_SPIDER_RESOLVE = "core.moriarty-spider-web-resolve";
export const MORIARTY_DYNAMICS_HANDLER = "core.moriarty-dynamics";
export const MORIARTY_DYNAMICS_RESOLVE = "core.moriarty-dynamics-resolve";

const DEBT_COLLECTION = "debt-collection";
const DOUBLE_CROSS = "double-cross";
const VILLAINOUS_MASTERSTROKE = "villainous-masterstroke";
const DYNAMICS_CLEANUP_FLAG = "moriartyDynamicsDiscardAttachmentIds";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return Boolean(definition && (definitionId === skillId || definitionId === `card.skill.${skillId}` || definition.linkedSkillId === skillId));
}

function activeOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function servantSkillHosts(
  state: GameState,
  target: PlayerState,
  definitions: Record<string, CardDefinition>,
): CardInstance[] {
  return Object.values(state.cards).filter((card) => {
    if (card.ownerPlayerId !== target.id || card.zone === "removed" || card.zone === "discard" || card.zone === "deck") return false;
    const definition = definitions[card.definitionId];
    if (!definition || definition.isSkill !== true || definition.skillOwnerType !== "servant") return false;
    return !target.servantId || definition.ownerDefinitionId === target.servantId || card.originServantId === target.servantId;
  });
}

function basicHandCards(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.basic === true && card.ownerPlayerId === player.id);
  });
}

function isEnhanced(state: GameState, card: CardInstance): boolean {
  if (!card.copyTopAttachmentTraits) return false;
  const hostId = card.copyTopAttachmentTraits.proxyHostInstanceId ?? card.instanceId;
  return Boolean(state.cards[hostId] && getTopAttachedCard(state, hostId));
}

function openSingleDecision(
  state: GameState,
  player: PlayerState,
  handlerId: string,
  sourceId: string,
  kind: string,
  options: Array<{ id: string; label: string }>,
  payload: Record<string, unknown>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${handlerId}:${kind}`;
  state.effectQueue.unshift({ effectId, handlerId, sourceId, controllerPlayerId: player.id, payload, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function resolvedSingle(payload: unknown, error: string): { previous: Record<string, unknown>; selection: string } {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error(error);
  const selections = Array.isArray(payload.decision.selections)
    ? payload.decision.selections.filter((id): id is string => typeof id === "string")
    : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1) throw new Error(error);
  return { previous: payload.previous, selection: selections[0] };
}

interface EnhanceChoice {
  optionId: string;
  basicInstanceId: string;
  hostInstanceId: string;
  targetPlayerId: string;
}

function enhanceChoices(state: GameState, player: PlayerState, target: PlayerState, definitions: Record<string, CardDefinition>): EnhanceChoice[] {
  const basics = basicHandCards(state, player, definitions);
  const hosts = servantSkillHosts(state, target, definitions);
  const result: EnhanceChoice[] = [];
  let index = 0;
  for (const basicInstanceId of basics) {
    for (const host of hosts) {
      result.push({ optionId: `enhance-${index++}`, basicInstanceId, hostInstanceId: host.instanceId, targetPlayerId: target.id });
    }
  }
  return result;
}

function applyEnhancement(
  state: GameState,
  player: PlayerState,
  choice: EnhanceChoice,
  definitions: Record<string, CardDefinition>,
): { basicInstanceId: string; hostInstanceId: string } {
  const target = state.players[choice.targetPlayerId];
  if (!target || target.eliminated) throw new Error("MORIARTY_ENHANCE_TARGET_PLAYER_INVALID");
  const valid = enhanceChoices(state, player, target, definitions).some((candidate) => candidate.basicInstanceId === choice.basicInstanceId
    && candidate.hostInstanceId === choice.hostInstanceId);
  if (!valid) throw new Error("MORIARTY_ENHANCE_CHOICE_INVALID");
  attachCard(state, choice.basicInstanceId, choice.hostInstanceId, "up");
  const host = state.cards[choice.hostInstanceId];
  host.copyTopAttachmentTraits = { sourceId: MORIARTY_WICKED_ID, maxTotalCost: 12 };
  return { basicInstanceId: choice.basicInstanceId, hostInstanceId: choice.hostInstanceId };
}

/** Wicked Charisma: first true-name reveal draws one, then Moriarty enhances one of that Servant's physical skills. */
export const useMoriartyWickedCharisma: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision }) => {
  if (!definitions || !isRecord(payload) || payload.eventType !== "servant.true-name-revealed" || !isRecord(payload.event)) return;
  const targetPlayerId = typeof payload.event.playerId === "string" ? payload.event.playerId : undefined;
  const target = targetPlayerId ? state.players[targetPlayerId] : undefined;
  if (!target || target.eliminated) return;
  drawCards(state, player.id, 1, randomInt ?? (() => 0), definitions);
  const choices = enhanceChoices(state, player, target, definitions);
  if (choices.length === 0) return { drawn: true, enhanced: false };
  openSingleDecision(
    state,
    player,
    MORIARTY_WICKED_RESOLVE,
    skill.id,
    "moriarty-enhance",
    choices.map((choice) => ({ id: choice.optionId, label: choice.optionId })),
    { choices },
    openDecision,
  );
  return { drawn: true, enhanced: "pending", targetPlayerId };
};

export const resolveMoriartyWickedCharisma: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("MORIARTY_ENHANCE_DEFINITIONS_REQUIRED");
  const { previous, selection } = resolvedSingle(payload, "MORIARTY_ENHANCE_DECISION_INVALID");
  const rawChoices = Array.isArray(previous.choices) ? previous.choices : [];
  const choice = rawChoices.find((item): item is EnhanceChoice => isRecord(item)
    && item.optionId === selection
    && typeof item.basicInstanceId === "string"
    && typeof item.hostInstanceId === "string"
    && typeof item.targetPlayerId === "string");
  if (!choice) throw new Error("MORIARTY_ENHANCE_DECISION_INVALID");
  return applyEnhancement(state, player, choice, definitions);
};

function activeEnhancedSkill(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  return player.attack.some((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.isSkill === true && card.controllerPlayerId === player.id && card.zone === "attack"
      && card.active && card.face === "up" && isEnhanced(state, card));
  });
}

function doubleCrossCandidates(state: GameState, player: PlayerState): string[] {
  return Object.values(state.cards).filter((card) => card.zone === "attached" && card.ownerPlayerId === player.id
    && card.attachedToInstanceId && state.cards[card.attachedToInstanceId]?.copyTopAttachmentTraits !== undefined)
    .map((card) => card.instanceId);
}

function resolveDoubleCross(state: GameState, player: PlayerState, attachmentInstanceId: string, definitions: Record<string, CardDefinition>) {
  if (!doubleCrossCandidates(state, player).includes(attachmentInstanceId)) throw new Error("MORIARTY_DOUBLE_CROSS_TARGET_INVALID");
  detachCard(state, attachmentInstanceId, "hand");
  joinOwnedCardToAttack(state, player.id, attachmentInstanceId, definitions, { manaCost: 0, allowedSourceZones: ["hand"] });
  return { instanceId: attachmentInstanceId };
}

/** In the Spider's Web: debt collection, double cross, and deactivate after Moriarty wins a fight. */
export const useMoriartySpiderWeb: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("MORIARTY_SPIDER_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType === "combat.resolved") {
    const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
    const source = activeOwnedSkill(state, player, skill.id, definitions);
    if (source && winnerIds.includes(player.id)) closePlayerCard(state, player.id, source.instanceId, definitions);
    return;
  }
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("MORIARTY_SPIDER_SOURCE_INACTIVE");
  if (payload.abilityId === DEBT_COLLECTION) {
    if (state.phase !== "action" || state.activePlayerId !== player.id || !player.locationId) throw new Error("MORIARTY_DEBT_WINDOW_INVALID");
    const stolen: Record<string, number> = {};
    for (const opponent of Object.values(state.players)) {
      if (opponent.id === player.id || opponent.eliminated || opponent.locationId !== player.locationId || !activeEnhancedSkill(state, opponent, definitions)) continue;
      const amount = transferVictoryPoints(opponent, player, 1);
      if (amount > 0) stolen[opponent.id] = amount;
    }
    return { stolen };
  }
  if (payload.abilityId !== DOUBLE_CROSS || state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("MORIARTY_DOUBLE_CROSS_WINDOW_INVALID");
  const candidates = doubleCrossCandidates(state, player);
  if (candidates.length === 0) throw new Error("MORIARTY_DOUBLE_CROSS_NO_TARGET");
  const direct = typeof payload.attachmentInstanceId === "string" ? payload.attachmentInstanceId : undefined;
  if (direct) return resolveDoubleCross(state, player, direct, definitions);
  openSingleDecision(
    state,
    player,
    MORIARTY_SPIDER_RESOLVE,
    skill.id,
    "moriarty-double-cross",
    candidates.map((id) => ({ id, label: id })),
    { candidates },
    openDecision,
  );
};

export const resolveMoriartySpiderWeb: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("MORIARTY_SPIDER_DEFINITIONS_REQUIRED");
  const { previous, selection } = resolvedSingle(payload, "MORIARTY_DOUBLE_CROSS_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  if (!candidates.includes(selection)) throw new Error("MORIARTY_DOUBLE_CROSS_DECISION_INVALID");
  return resolveDoubleCross(state, player, selection, definitions);
};

export const isMoriartySpiderWebLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !activeOwnedSkill(state, player, skill.id, definitions) || state.activePlayerId !== playerId) return false;
  if (ability?.id === DEBT_COLLECTION) return state.phase === "action";
  if (ability?.id === DOUBLE_CROSS) return state.phase === "combat" && doubleCrossCandidates(state, player).length > 0;
  return false;
};

function inactiveEnhancedSkillCandidates(state: GameState, definitions: Record<string, CardDefinition>): string[] {
  return Object.values(state.cards).filter((card) => {
    const definition = definitions[card.definitionId];
    if (!definition || definition.isSkill !== true || !isEnhanced(state, card)) return false;
    return !(card.zone === "attack" && card.face === "up" && card.active);
  }).map((card) => card.instanceId);
}

function recordDynamicsCleanup(player: PlayerState, attachmentInstanceId: string): void {
  const current = Array.isArray(player.flags[DYNAMICS_CLEANUP_FLAG])
    ? (player.flags[DYNAMICS_CLEANUP_FLAG] as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  player.flags[DYNAMICS_CLEANUP_FLAG] = [...new Set([...current, attachmentInstanceId])];
}

function cleanupDynamicsAttachments(state: GameState, player: PlayerState): string[] {
  const ids = Array.isArray(player.flags[DYNAMICS_CLEANUP_FLAG])
    ? (player.flags[DYNAMICS_CLEANUP_FLAG] as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  const discarded: string[] = [];
  for (const instanceId of ids) {
    const card = state.cards[instanceId];
    if (card?.zone === "attached" && card.ownerPlayerId) {
      detachCard(state, instanceId, "discard");
      discarded.push(instanceId);
    }
  }
  delete player.flags[DYNAMICS_CLEANUP_FLAG];
  return discarded;
}

function resolveDynamicsCopy(
  state: GameState,
  player: PlayerState,
  source: CardInstance,
  targetInstanceId: string,
  definitions: Record<string, CardDefinition>,
) {
  if (!inactiveEnhancedSkillCandidates(state, definitions).includes(targetInstanceId)) throw new Error("MORIARTY_DYNAMICS_TARGET_INVALID");
  const target = state.cards[targetInstanceId];
  const attachment = getTopAttachedCard(state, targetInstanceId);
  if (!target || !attachment) throw new Error("MORIARTY_DYNAMICS_TARGET_INVALID");
  const targetControllerId = target.controllerPlayerId ?? target.ownerPlayerId;
  const targetController = targetControllerId ? state.players[targetControllerId] : undefined;
  if (!targetController) throw new Error("MORIARTY_DYNAMICS_TARGET_PLAYER_INVALID");
  applyTemporaryCardDefinitionCopy(state, source.instanceId, target.instanceId, definitions, {
    sourceId: MORIARTY_DYNAMICS_ID,
    expiresRound: state.round,
    rebindNamedOwnerToController: false,
  });
  source.copyTopAttachmentTraits = { sourceId: MORIARTY_DYNAMICS_ID, proxyHostInstanceId: target.instanceId, maxTotalCost: 12 };
  addSkillUseBlock(targetController, {
    id: `${MORIARTY_DYNAMICS_ID}:${player.id}:${target.instanceId}:${state.round}`,
    sourceId: MORIARTY_DYNAMICS_ID,
    sourcePlayerId: player.id,
    throughRound: state.round,
    definitionIds: [],
    instanceIds: [target.instanceId],
  });
  recordDynamicsCleanup(player, attachment.instanceId);
  return { sourceInstanceId: source.instanceId, targetInstanceId, attachmentInstanceId: attachment.instanceId };
}

/** Dynamics of an Asteroid: copy an inactive Enhanced skill without copying its physical tokens/stacks. */
export const useMoriartyDynamics: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("MORIARTY_DYNAMICS_CONTEXT_REQUIRED");
  if (payload.eventType === "combat.ending" || payload.eventType === "round.ending") return { discarded: cleanupDynamicsAttachments(state, player) };
  if (payload.abilityId !== VILLAINOUS_MASTERSTROKE || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("MORIARTY_DYNAMICS_WINDOW_INVALID");
  }
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("MORIARTY_DYNAMICS_SOURCE_INACTIVE");
  const candidates = inactiveEnhancedSkillCandidates(state, definitions).filter((id) => id !== source.instanceId);
  if (candidates.length === 0) throw new Error("MORIARTY_DYNAMICS_NO_TARGET");
  const direct = typeof payload.targetInstanceId === "string" ? payload.targetInstanceId : undefined;
  if (direct) return resolveDynamicsCopy(state, player, source, direct, definitions);
  openSingleDecision(
    state,
    player,
    MORIARTY_DYNAMICS_RESOLVE,
    skill.id,
    "moriarty-dynamics-target",
    candidates.map((id) => ({ id, label: id })),
    { candidates, sourceInstanceId: source.instanceId },
    openDecision,
  );
};

export const resolveMoriartyDynamics: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("MORIARTY_DYNAMICS_DEFINITIONS_REQUIRED");
  const { previous, selection } = resolvedSingle(payload, "MORIARTY_DYNAMICS_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const sourceInstanceId = typeof previous.sourceInstanceId === "string" ? previous.sourceInstanceId : undefined;
  const source = sourceInstanceId ? state.cards[sourceInstanceId] : undefined;
  if (!source || !candidates.includes(selection)) throw new Error("MORIARTY_DYNAMICS_DECISION_INVALID");
  return resolveDynamicsCopy(state, player, source, selection, definitions);
};

export const isMoriartyDynamicsLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === VILLAINOUS_MASTERSTROKE && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions)
    && inactiveEnhancedSkillCandidates(state, definitions).length > 0);
};
