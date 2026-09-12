import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { attachCard, getAttachedCards } from "./card-attachments.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardPlayCost } from "./costs.ts";
import { closePlayerCard, movePlayerCard } from "./decks.ts";
import { blockManaGainThroughRound, gainMana } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ILLYA_HOLSTER_ID = "servant.illya.skill.sc-illya-1";
export const ILLYA_QUINTETT_ID = "servant.illya.skill.sc-illya-3";
export const ILLYA_CASTER_SKILL_ID = "servant.illya.skill.sc-illya-10";
export const ILLYA_HOLSTER_HANDLER = "core.illya-card-holster";
export const ILLYA_HOLSTER_RESOLVE = "core.illya-card-holster-resolve";
export const ILLYA_QUINTETT_HANDLER = "core.illya-quintett-feuer";
export const ILLYA_QUINTETT_RESOLVE = "core.illya-quintett-feuer-resolve";
export const ILLYA_CASTER_HANDLER = "core.illya-caster-install";

export const ILLYA_INSTALL_DEFINITION_IDS = [
  "card.x-installsaber",
  "card.x-installberserker",
  "card.x-installarcher",
  "card.x-installlancer",
  "card.x-installassassin",
  "card.x-installrider",
  "card.x-installcaster",
] as const;
export const ILLYA_CASTER_CARD_ID = "card.x-installcaster";

const QUINTETT_PENDING_MANA_BLOCK_ROUND = "illyaQuintettPendingManaBlockRound";
const QUINTETT_USAGE_MARKER_PREFIX = "illya-quintett-once-per-game:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cardMatchesSkill(card: CardInstance | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || card.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId));
}

function physicalOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>): CardInstance | undefined {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === player.id && card.zone !== "removed"
    && cardMatchesSkill(card, definitions[card.definitionId], skillId));
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>): CardInstance | undefined {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => card?.ownerPlayerId === player.id
    && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
    && cardMatchesSkill(card, definitions[card.definitionId], skillId));
}

function holsterHost(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): CardInstance | undefined {
  return physicalOwnedSkill(state, player, ILLYA_HOLSTER_ID, definitions);
}

function holsterAttachedCard(state: GameState, host: CardInstance): CardInstance | undefined {
  return getAttachedCards(state, host.instanceId)[0];
}

function openHolsterCardDecision(state: GameState, player: PlayerState, host: CardInstance, openDecision: SkillContext["openDecision"]): void {
  const candidates = [...player.hand];
  if (candidates.length === 0) return;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${ILLYA_HOLSTER_ID}:store`;
  state.effectQueue.unshift({
    effectId,
    handlerId: ILLYA_HOLSTER_RESOLVE,
    sourceId: ILLYA_HOLSTER_ID,
    controllerPlayerId: player.id,
    payload: { hostInstanceId: host.instanceId, candidateIds: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "illya-card-holster-store",
    options: candidates.map((instanceId) => ({ id: instanceId, label: instanceId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

export const useIllyaCardHolster: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== "card-holster") throw new Error("ILLYA_HOLSTER_CONTEXT_REQUIRED");
  if (state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("ILLYA_HOLSTER_WINDOW_INVALID");
  const host = holsterHost(state, player, definitions);
  if (!host) throw new Error("ILLYA_HOLSTER_CARD_MISSING");
  const attached = holsterAttachedCard(state, host);
  if (attached) {
    const definition = definitions[attached.definitionId];
    if (!definition || attached.ownerPlayerId !== player.id) throw new Error("ILLYA_HOLSTER_ATTACHMENT_INVALID");
    const gainedMana = getCardPlayCost(state, definition, player, attached, definitions);
    movePlayerCard(state, player.id, attached.instanceId, "discard");
    gainMana(player, gainedMana);
    return { discardedInstanceId: attached.instanceId, gainedMana };
  }
  if (player.hand.length === 0) return { skipped: true, reason: "empty-hand" };
  openHolsterCardDecision(state, player, host, openDecision);
  return { pending: true, candidateIds: [...player.hand] };
};

export const resolveIllyaCardHolster: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("ILLYA_HOLSTER_DECISION_INVALID");
  const hostInstanceId = typeof payload.previous.hostInstanceId === "string" ? payload.previous.hostInstanceId : undefined;
  const candidates = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  const instanceId = selections[0];
  const host = hostInstanceId ? state.cards[hostInstanceId] : undefined;
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !instanceId || !candidates.includes(instanceId)
    || !host || !player.hand.includes(instanceId) || holsterAttachedCard(state, host)) throw new Error("ILLYA_HOLSTER_DECISION_INVALID");
  const card = attachCard(state, instanceId, host.instanceId, "up");
  card.playAsHandWhileAttached = { sourceInstanceId: host.instanceId };
  return { hostInstanceId: host.instanceId, storedInstanceId: instanceId };
};

export const isIllyaCardHolsterLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== "card-holster" || state.phase !== "outpost" || state.activePlayerId !== playerId) return false;
  const host = holsterHost(state, player, definitions);
  return Boolean(host && (holsterAttachedCard(state, host) || player.hand.length > 0));
};

function ownedInstallCards(state: GameState, player: PlayerState): CardInstance[] {
  const ids = new Set<string>(ILLYA_INSTALL_DEFINITION_IDS);
  return Object.values(state.cards).filter((card) => card.ownerPlayerId === player.id && ids.has(card.definitionId));
}

function quintettPlayableInstallIds(state: GameState, player: PlayerState): string[] {
  return ownedInstallCards(state, player).filter((card) => card.zone === "hand"
    || (card.zone === "attached" && card.attachedToInstanceId && card.playAsHandWhileAttached?.sourceInstanceId === card.attachedToInstanceId))
    .map((card) => card.instanceId);
}

function activeCasterInstall(state: GameState, player: PlayerState): CardInstance | undefined {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => card?.definitionId === ILLYA_CASTER_CARD_ID
    && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up");
}

function armQuintettUsageOverrides(state: GameState, player: PlayerState): void {
  const marker = `${QUINTETT_USAGE_MARKER_PREFIX}${state.round}`;
  for (const card of ownedInstallCards(state, player)) {
    card.usageLimitOverride = "once-per-game";
    if (!card.modifiers.includes(marker)) card.modifiers.push(marker);
  }
}

function clearQuintettUsageOverrides(state: GameState, player: PlayerState): void {
  for (const card of ownedInstallCards(state, player)) {
    if (!card.modifiers.some((marker) => marker === `${QUINTETT_USAGE_MARKER_PREFIX}${state.round}`)) continue;
    delete card.usageLimitOverride;
    card.modifiers = card.modifiers.filter((marker) => marker !== `${QUINTETT_USAGE_MARKER_PREFIX}${state.round}`);
  }
}

function quintettNeedsCasterChoice(state: GameState, player: PlayerState, selectedInstanceIds: string[]): boolean {
  let casterActive = Boolean(activeCasterInstall(state, player));
  for (const instanceId of selectedInstanceIds) {
    const card = state.cards[instanceId];
    if (!card) continue;
    if (card.definitionId === ILLYA_CASTER_CARD_ID) {
      casterActive = true;
      continue;
    }
    if (casterActive) return true;
  }
  return false;
}

function openQuintettCasterChoice(
  state: GameState,
  player: PlayerState,
  selectedInstanceIds: string[],
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${ILLYA_QUINTETT_ID}:caster-choice`;
  state.effectQueue.unshift({
    effectId,
    handlerId: ILLYA_QUINTETT_RESOLVE,
    sourceId: ILLYA_QUINTETT_ID,
    controllerPlayerId: player.id,
    payload: { stage: "caster-choice", selectedInstanceIds },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "illya-caster-install-choice",
    options: [{ id: "power", label: "+4 power" }, { id: "cost", label: "-3 cost" }],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function playQuintettSelection(
  state: GameState,
  player: PlayerState,
  selectedInstanceIds: string[],
  casterChoice: "power" | "cost" | undefined,
  definitions: Record<string, CardDefinition>,
  emitEvent: SkillContext["emitEvent"],
): Array<{ instanceId: string; definitionId: string }> {
  armQuintettUsageOverrides(state, player);
  const candidates = new Set(quintettPlayableInstallIds(state, player));
  if (selectedInstanceIds.some((instanceId) => !candidates.has(instanceId)) || new Set(selectedInstanceIds).size !== selectedInstanceIds.length) {
    throw new Error("ILLYA_QUINTETT_SELECTION_INVALID");
  }
  let caster = activeCasterInstall(state, player);
  let casterChoiceConsumed = false;
  const played: Array<{ instanceId: string; definitionId: string }> = [];
  for (const instanceId of selectedInstanceIds) {
    const card = state.cards[instanceId];
    const definition = definitions[card.definitionId];
    if (!definition) throw new Error("ILLYA_QUINTETT_CARD_DEFINITION_MISSING");
    const sourceZone = card.zone;
    const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, {
      payCost: false,
      allowedSourceZones: [sourceZone],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
    });
    if (paidMana !== 0) throw new Error("ILLYA_QUINTETT_FREE_PLAY_FAILED");
    emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana: 0, method: "illya-quintett" });
    emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, method: "illya-quintett" });
    played.push({ instanceId, definitionId: definition.id });
    if (definition.id === ILLYA_CASTER_CARD_ID) {
      caster = state.cards[instanceId];
      continue;
    }
    if (caster && !casterChoiceConsumed) {
      if (!casterChoice) throw new Error("ILLYA_CASTER_CHOICE_REQUIRED");
      if (casterChoice === "power") {
        card.powerModifiers = [
          ...(card.powerModifiers ?? []),
          { id: `illya-caster-install:${state.round}:${caster.instanceId}:${instanceId}`, sourceId: ILLYA_CASTER_SKILL_ID, kind: "add", value: 4, duration: "round" },
        ];
      }
      closePlayerCard(state, player.id, caster.instanceId, definitions);
      caster = undefined;
      casterChoiceConsumed = true;
    }
  }
  return played;
}

function openQuintettInstallDecision(state: GameState, player: PlayerState, candidates: string[], openDecision: SkillContext["openDecision"]): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${ILLYA_QUINTETT_ID}:installs`;
  state.effectQueue.unshift({
    effectId,
    handlerId: ILLYA_QUINTETT_RESOLVE,
    sourceId: ILLYA_QUINTETT_ID,
    controllerPlayerId: player.id,
    payload: { stage: "installs", candidateIds: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "illya-quintett-installs",
    options: candidates.map((instanceId) => ({ id: instanceId, label: instanceId })),
    min: 0,
    max: candidates.length,
    allowCancel: true,
    continuationEffectId: effectId,
    submissions: {},
  });
}

export const useIllyaQuintettFeuer: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("ILLYA_QUINTETT_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType === "card.played") {
    if (event.playerId !== player.id || event.definitionId !== ILLYA_QUINTETT_ID || event.face !== "up") return;
    player.flags[QUINTETT_PENDING_MANA_BLOCK_ROUND] = state.round + 1;
    return { manaBlockRound: state.round + 1 };
  }
  if (eventType === "round.started") {
    if (Number(player.flags[QUINTETT_PENDING_MANA_BLOCK_ROUND] ?? -1) !== state.round) return;
    delete player.flags[QUINTETT_PENDING_MANA_BLOCK_ROUND];
    const source = physicalOwnedSkill(state, player, ILLYA_QUINTETT_ID, definitions);
    if (!source || source.zone === "removed" || source.zone === "discard") return { blocked: false, reason: "source-unavailable" };
    blockManaGainThroughRound(player, state.round);
    return { blocked: true, throughRound: state.round };
  }
  if (eventType === "round.ending") {
    clearQuintettUsageOverrides(state, player);
    return;
  }
  if (payload.abilityId !== "quintett-barrage" || state.phase !== "action" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, ILLYA_QUINTETT_ID, definitions)) throw new Error("ILLYA_QUINTETT_WINDOW_INVALID");
  const candidates = quintettPlayableInstallIds(state, player);
  if (candidates.length === 0) return { played: [], reason: "no-installs" };
  openQuintettInstallDecision(state, player, candidates, openDecision);
  return { pending: true, candidateIds: candidates };
};

export const resolveIllyaQuintettFeuer: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("ILLYA_QUINTETT_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved") throw new Error("ILLYA_QUINTETT_DECISION_INVALID");
  if (previous.stage === "installs") {
    const candidates = Array.isArray(previous.candidateIds) ? previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
    if (selections.some((id) => !candidates.includes(id)) || new Set(selections).size !== selections.length) throw new Error("ILLYA_QUINTETT_SELECTION_INVALID");
    if (quintettNeedsCasterChoice(state, player, selections)) {
      openQuintettCasterChoice(state, player, selections, openDecision);
      return { pending: true, selectedInstanceIds: selections, stage: "caster-choice" };
    }
    return { played: playQuintettSelection(state, player, selections, undefined, definitions, emitEvent) };
  }
  if (previous.stage === "caster-choice") {
    if (selections.length !== 1 || (selections[0] !== "power" && selections[0] !== "cost")) throw new Error("ILLYA_CASTER_CHOICE_INVALID");
    const selectedInstanceIds = Array.isArray(previous.selectedInstanceIds) ? previous.selectedInstanceIds.filter((id): id is string => typeof id === "string") : [];
    return { played: playQuintettSelection(state, player, selectedInstanceIds, selections[0], definitions, emitEvent), casterChoice: selections[0] };
  }
  throw new Error("ILLYA_QUINTETT_DECISION_INVALID");
};

export const isIllyaQuintettFeuerLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "quintett-barrage" && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, ILLYA_QUINTETT_ID, definitions));
};

/** Caster Install's real play-time choice is executed by the shared card-play adjustment metadata on every other Install. */
export const useIllyaCasterInstall: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload)) return;
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType !== "card.played" || event.playerId !== player.id || event.definitionId !== ILLYA_CASTER_CARD_ID) return;
  const instanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
  const instance = instanceId ? state.cards[instanceId] : undefined;
  if (instance) instance.residual = true;
  return { instanceId: instanceId ?? null };
};
