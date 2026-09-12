import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { movePlayerByEffect } from "./board.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { addCardToAttack } from "./card-play.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardPlayCost } from "./costs.ts";
import { createDerivedCardInstance, movePlayerCard, removePhysicalCardFromGame } from "./decks.ts";
import { adjustVictoryPoints, gainMana } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const HAKUNO_F_DRESS_ID = "master.hakuno-f.skill.s1";
export const HAKUNO_F_LINK_ID = "master.hakuno-f.skill.s2";
export const HAKUNO_F_CCC_ID = "master.hakuno-f.skill.s3";
export const HAKUNO_F_EXTELLA_ID = "master.hakuno-f.skill.s4";
export const HAKUNO_F_EXTRA_ID = "master.hakuno-f.skill.s5";
export const HAKUNO_F_ASCENSION_ID = "master.hakuno-f.skill.ascension";
export const HAKUNO_F_HANDLER = "core.hakuno-f-mystic-code";
export const HAKUNO_F_RESOLVE = "core.hakuno-f-mystic-code-resolve";

export const HAKUNO_F_DRESS_ABILITY = "dress-change";
export const HAKUNO_F_MOON_DRIVE_ABILITY = "cc-moon-drive";
export const HAKUNO_F_HACK_ABILITY = "cc-hack";
export const HAKUNO_F_RECOVERY_ABILITY = "cc-recovery";

const MYSTIC_CODE_IDS = [HAKUNO_F_LINK_ID, HAKUNO_F_CCC_ID, HAKUNO_F_EXTELLA_ID, HAKUNO_F_EXTRA_ID] as const;
type MysticCodeId = typeof MYSTIC_CODE_IDS[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesSkill(card: GameState["cards"][string] | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || card.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId));
}

function allOwnedPhysicalIds(player: PlayerState): string[] {
  return [...player.masterSkills, ...player.servantSkills, ...player.hand, ...player.attack, ...player.deck, ...player.discard];
}

function physicalSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === player.id && matchesSkill(card, definitions[card.definitionId], skillId));
}

function livePhysicalSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return allOwnedPhysicalIds(player).map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.zone !== "removed" && card.zone !== "discard" && matchesSkill(card, definition, skillId));
  });
}

function activePhysicalSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.face === "up" && card.active && matchesSkill(card, definition, skillId));
  });
}

function ascensionOwned(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  return Boolean(livePhysicalSkill(state, player, HAKUNO_F_ASCENSION_ID, definitions));
}

function codeDefinitionId(skillId: MysticCodeId, definitions: Record<string, CardDefinition>): string {
  if (definitions[`card.skill.${skillId}`]) return `card.skill.${skillId}`;
  if (definitions[skillId]) return skillId;
  throw new Error("HAKUNO_F_MYSTIC_CODE_DEFINITION_MISSING");
}

function uniqueInstanceId(state: GameState, prefix: string): string {
  let index = 1;
  while (state.cards[`${prefix}:${index}`]) index += 1;
  return `${prefix}:${index}`;
}

function removeCurrentCodes(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, exceptSkillId?: MysticCodeId): string[] {
  const removed: string[] = [];
  for (const skillId of MYSTIC_CODE_IDS) {
    if (skillId === exceptSkillId) continue;
    const card = physicalSkill(state, player, skillId, definitions);
    if (!card || card.zone === "removed") continue;
    removePhysicalCardFromGame(state, card.instanceId);
    removed.push(card.instanceId);
  }
  return removed;
}

function installAscensionCodeModifiers(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  if (!ascensionOwned(state, player, definitions)) return;
  const basicDefinitionIds = Object.values(definitions).filter((definition) => definition.basic === true).map((definition) => definition.id);
  for (const skillId of MYSTIC_CODE_IDS) {
    const source = livePhysicalSkill(state, player, skillId, definitions);
    if (!source) continue;
    const modifierId = `${HAKUNO_F_ASCENSION_ID}:${skillId}:${source.instanceId}`;
    player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== modifierId);
    if (skillId === HAKUNO_F_EXTRA_ID) {
      addCardRuleModifier(player, {
        id: modifierId,
        sourceId: HAKUNO_F_ASCENSION_ID,
        sourceInstanceId: source.instanceId,
        targetDefinitionIds: [HAKUNO_F_EXTRA_ID, `card.skill.${HAKUNO_F_EXTRA_ID}`].filter((id) => Boolean(definitions[id])),
        waiveEightMana: true,
        duration: "while-source-present",
      });
    } else if (skillId === HAKUNO_F_EXTELLA_ID) {
      addCardRuleModifier(player, {
        id: modifierId,
        sourceId: HAKUNO_F_ASCENSION_ID,
        sourceInstanceId: source.instanceId,
        targetDefinitionIds: [HAKUNO_F_EXTELLA_ID, `card.skill.${HAKUNO_F_EXTELLA_ID}`].filter((id) => Boolean(definitions[id])),
        powerAdd: 5,
        duration: "while-source-present",
      });
    } else if (skillId === HAKUNO_F_LINK_ID) {
      addCardRuleModifier(player, {
        id: modifierId,
        sourceId: HAKUNO_F_ASCENSION_ID,
        sourceInstanceId: source.instanceId,
        targetDefinitionIds: basicDefinitionIds,
        powerAdd: 1,
        duration: "while-source-present",
      });
    }
  }
}

function syncLinkSealRestriction(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  const link = livePhysicalSkill(state, player, HAKUNO_F_LINK_ID, definitions);
  if (link) player.flags.commandSealUseMovementOnlySourceInstanceId = link.instanceId;
  else delete player.flags.commandSealUseMovementOnlySourceInstanceId;
}

function bringCodeFromOutside(state: GameState, player: PlayerState, skillId: MysticCodeId, definitions: Record<string, CardDefinition>) {
  if (!MYSTIC_CODE_IDS.includes(skillId)) throw new Error("HAKUNO_F_MYSTIC_CODE_INVALID");
  removeCurrentCodes(state, player, definitions, skillId);
  let card = physicalSkill(state, player, skillId, definitions);
  if (!card) {
    const definitionId = codeDefinitionId(skillId, definitions);
    card = createDerivedCardInstance(state, player.id, {
      instanceId: uniqueInstanceId(state, `${player.id}:mystic-code:${skillId}`),
      definitionId,
      originMasterId: "master.hakuno-f",
      zone: "master-skills",
      face: "up",
      active: false,
      residual: false,
      temporary: false,
      sourceEffectId: HAKUNO_F_DRESS_ID,
    });
  } else {
    movePlayerCard(state, player.id, card.instanceId, "master-skills");
    card.face = "up";
    card.active = false;
    card.residual = false;
  }
  syncLinkSealRestriction(state, player, definitions);
  installAscensionCodeModifiers(state, player, definitions);
  return card;
}

function randomDiscardOne(state: GameState, player: PlayerState, randomInt?: (maxExclusive: number) => number): string {
  if (player.hand.length === 0) throw new Error("HAKUNO_F_DRESS_HAND_REQUIRED");
  const index = (randomInt ?? (() => 0))(player.hand.length);
  if (!Number.isInteger(index) || index < 0 || index >= player.hand.length) throw new Error("HAKUNO_F_DRESS_RANDOM_INVALID");
  const instanceId = player.hand[index];
  movePlayerCard(state, player.id, instanceId, "discard");
  const card = state.cards[instanceId];
  card.face = "up";
  card.active = false;
  card.residual = false;
  return instanceId;
}

function useDressChange(context: Parameters<SkillHandler>[0], data: Record<string, unknown>) {
  const { state, player, definitions, randomInt } = context;
  if (!definitions || state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("HAKUNO_F_DRESS_WINDOW_INVALID");
  const selected = typeof data.mysticCodeSkillId === "string" ? data.mysticCodeSkillId as MysticCodeId : undefined;
  if (!selected || !MYSTIC_CODE_IDS.includes(selected)) throw new Error("HAKUNO_F_MYSTIC_CODE_REQUIRED");
  const discardedInstanceId = randomDiscardOne(state, player, randomInt);
  const code = bringCodeFromOutside(state, player, selected, definitions);
  return { discardedInstanceId, mysticCodeSkillId: selected, mysticCodeInstanceId: code.instanceId };
}

function useMoonDrive(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  if (state.phase !== "action" || state.activePlayerId !== player.id || !activePhysicalSkill(state, player, HAKUNO_F_LINK_ID, definitions)) {
    throw new Error("HAKUNO_F_MOON_DRIVE_WINDOW_INVALID");
  }
  const modified: Array<{ instanceId: string; power: number }> = [];
  for (const instanceId of player.attack) {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || !card.active || card.face !== "up" || card.playedRound !== state.round || definition.cardType !== "attack") continue;
    const power = Math.min(3, getCardPlayCost(state, definition, player, card, definitions));
    const id = `${HAKUNO_F_LINK_ID}:moon-drive:${state.round}:${instanceId}`;
    card.powerModifiers = [...(card.powerModifiers ?? []).filter((modifier) => modifier.id !== id), { id, sourceId: HAKUNO_F_LINK_ID, kind: "add", value: power, duration: "round" }];
    modified.push({ instanceId, power });
  }
  return { modified };
}

function topDeckHack(context: Parameters<SkillHandler>[0], data: Record<string, unknown>) {
  const { state, player, definitions, emitEvent } = context;
  if (!definitions || state.phase !== "action" || state.activePlayerId !== player.id || !activePhysicalSkill(state, player, HAKUNO_F_CCC_ID, definitions)) {
    throw new Error("HAKUNO_F_HACK_WINDOW_INVALID");
  }
  const targetPlayerId = typeof data.targetPlayerId === "string" ? data.targetPlayerId : undefined;
  const target = targetPlayerId ? state.players[targetPlayerId] : undefined;
  if (!target || target.eliminated || target.locationId !== player.locationId || (player.locationId !== "mountain" && player.locationId !== "city")) {
    throw new Error("HAKUNO_F_HACK_TARGET_INVALID");
  }
  const top = target.deck.slice(0, 3);
  const discardIds = Array.isArray(data.discardInstanceIds) ? data.discardInstanceIds.filter((id): id is string => typeof id === "string") : [];
  if (discardIds.length > 3 || new Set(discardIds).size !== discardIds.length || discardIds.some((id) => !top.includes(id))) throw new Error("HAKUNO_F_HACK_DISCARD_INVALID");
  const kept = top.filter((id) => !discardIds.includes(id));
  const orderedRest = Array.isArray(data.orderedRestInstanceIds) ? data.orderedRestInstanceIds.filter((id): id is string => typeof id === "string") : kept;
  if (orderedRest.length !== kept.length || new Set(orderedRest).size !== orderedRest.length || orderedRest.some((id) => !kept.includes(id))) {
    throw new Error("HAKUNO_F_HACK_ORDER_INVALID");
  }
  for (const instanceId of discardIds) {
    movePlayerCard(state, target.id, instanceId, "discard");
    const card = state.cards[instanceId];
    card.face = "up";
    card.active = false;
    card.residual = false;
    emitEvent?.("card.discarded", { playerId: target.id, instanceId, definitionId: card.definitionId, sourceId: HAKUNO_F_CCC_ID, method: "cc-hack" });
  }
  target.deck = [...orderedRest, ...target.deck.filter((id) => !orderedRest.includes(id))];

  let copiedInstanceId: string | undefined;
  const copySourceInstanceId = typeof data.copyDiscardInstanceId === "string" ? data.copyDiscardInstanceId : undefined;
  if (copySourceInstanceId !== undefined) {
    if (!ascensionOwned(state, player, definitions) || !discardIds.includes(copySourceInstanceId)) throw new Error("HAKUNO_F_HACK_COPY_INVALID");
    const original = state.cards[copySourceInstanceId];
    const definition = original ? definitions[original.definitionId] : undefined;
    if (!original || !definition) throw new Error("HAKUNO_F_HACK_COPY_INVALID");
    copiedInstanceId = uniqueInstanceId(state, `${player.id}:hakuno-f-hack-copy:${original.definitionId}:${state.round}`);
    const copy = createDerivedCardInstance(state, player.id, {
      instanceId: copiedInstanceId,
      definitionId: original.definitionId,
      originMasterId: "master.hakuno-f",
      zone: "hand",
      face: "down",
      active: false,
      residual: false,
      temporary: true,
      temporaryCleanup: "round-end",
      sourceEffectId: `${HAKUNO_F_ASCENSION_ID}:cc-hack`,
      createdByPlayerId: player.id,
      derivedFromInstanceId: original.instanceId,
    });
    const played = addCardToAttack(state, player.id, copy.instanceId, definitions, {
      payCost: true,
      allowedSourceZones: ["hand"],
      bypassTiming: true,
      bypassFaceUpPlayLimit: true,
    });
    copy.temporary = true;
    copy.temporaryCleanup = "round-end";
    emitEvent?.("card.played", { playerId: player.id, instanceId: copy.instanceId, definitionId: copy.definitionId, face: "up", paidMana: played.paidMana, method: "hakuno-f-cc-hack-copy" });
  }
  return { targetPlayerId: target.id, discardedInstanceIds: discardIds, orderedRestInstanceIds: orderedRest, ...(copiedInstanceId ? { copiedInstanceId } : {}) };
}

function recoveryCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.active && card.face === "up" && card.playedRound === state.round
      && definition.cardType === "attack" && definition.residual !== true && card.residual !== true);
  });
}

function armRecovery(state: GameState, player: PlayerState, targetInstanceId: string, definitions: Record<string, CardDefinition>) {
  if (state.phase !== "combat" || state.activePlayerId !== player.id || !activePhysicalSkill(state, player, HAKUNO_F_EXTELLA_ID, definitions)
    || !recoveryCandidates(state, player, definitions).includes(targetInstanceId)) throw new Error("HAKUNO_F_RECOVERY_TARGET_INVALID");
  player.flags.hakunoFRecoveryRound = state.round;
  player.flags.hakunoFRecoveryTargetInstanceId = targetInstanceId;
  player.flags.hakunoFRecoveryLocationId = player.locationId;
  return { targetInstanceId };
}

function resolveRecovery(state: GameState, player: PlayerState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>) {
  if (Number(player.flags.hakunoFRecoveryRound ?? -1) !== state.round) return;
  const targetInstanceId = typeof player.flags.hakunoFRecoveryTargetInstanceId === "string" ? player.flags.hakunoFRecoveryTargetInstanceId : undefined;
  const locationId = player.flags.hakunoFRecoveryLocationId;
  delete player.flags.hakunoFRecoveryRound;
  delete player.flags.hakunoFRecoveryTargetInstanceId;
  delete player.flags.hakunoFRecoveryLocationId;
  const participants = Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : [];
  const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  if (event.locationId !== locationId || !participants.includes(player.id) || winners.includes(player.id) || !targetInstanceId) return;
  const card = state.cards[targetInstanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !definition) return;
  const manaCost = Number.isInteger(card.paidCost) ? Number(card.paidCost) : getCardPlayCost(state, definition, player, card, definitions);
  const amount = Math.ceil(Math.max(0, manaCost) / 2);
  return { targetInstanceId, requestedMana: amount, gainedMana: gainMana(player, amount) };
}

function openBackdoorDecision(context: Parameters<SkillHandler>[0], enteredPlayerId: string): { pending: true } {
  const { state, player, skill, openDecision } = context;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:backdoor`;
  state.effectQueue.unshift({
    effectId,
    handlerId: HAKUNO_F_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { stage: "backdoor", enteredPlayerId },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "hakuno-f-backdoor",
    options: [{ id: "move", label: "移动至侦查" }, { id: "stay", label: "留在原地" }],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true };
}

function resolveExtraCombat(state: GameState, player: PlayerState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>) {
  const source = livePhysicalSkill(state, player, HAKUNO_F_EXTRA_ID, definitions);
  if (!source) return;
  const participants = Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : [];
  const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  if (!participants.includes(player.id) || !winners.includes(player.id)) return;
  removePhysicalCardFromGame(state, source.instanceId);
  return { removedInstanceId: source.instanceId };
}

function resolveDataLeak(state: GameState, player: PlayerState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>) {
  if (!livePhysicalSkill(state, player, HAKUNO_F_CCC_ID, definitions)) return;
  const participants = Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : [];
  const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  if (!participants.includes(player.id) || winners.includes(player.id)) return;
  return { victoryPointDelta: adjustVictoryPoints(player, -1) };
}

export const resolveHakunoFDecision: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("HAKUNO_F_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || previous.stage !== "backdoor" || selections.length !== 1 || !["move", "stay"].includes(selections[0])) {
    throw new Error("HAKUNO_F_DECISION_INVALID");
  }
  if (selections[0] === "stay") return { moved: false };
  if (player.locationId !== "mountain" && player.locationId !== "city") return { moved: false };
  const movement = movePlayerByEffect(state, player.id, "scouting", definitions, { ignoreDestinationCapacity: true });
  emitEvent?.("player.moved", { playerId: player.id, ...movement, method: "effect", sourceId: HAKUNO_F_EXTRA_ID });
  emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect", sourceId: HAKUNO_F_EXTRA_ID });
  return { moved: true, ...movement };
};

export const useHakunoFMysticCode: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions } = context;
  if (!definitions) throw new Error("HAKUNO_F_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === HAKUNO_F_DRESS_ID && data.abilityId === HAKUNO_F_DRESS_ABILITY) return useDressChange(context, data);

  if (skill.id === HAKUNO_F_LINK_ID) {
    if (data.abilityId === HAKUNO_F_MOON_DRIVE_ABILITY) return useMoonDrive(state, player, definitions);
    return;
  }

  if (skill.id === HAKUNO_F_CCC_ID) {
    if (data.abilityId === HAKUNO_F_HACK_ABILITY) return topDeckHack(context, data);
    if (eventType === "combat.resolved") return resolveDataLeak(state, player, event, definitions);
    return;
  }

  if (skill.id === HAKUNO_F_EXTELLA_ID) {
    if (data.abilityId === HAKUNO_F_RECOVERY_ABILITY) {
      const targetInstanceId = typeof data.targetInstanceId === "string" ? data.targetInstanceId : undefined;
      if (!targetInstanceId) throw new Error("HAKUNO_F_RECOVERY_TARGET_REQUIRED");
      return armRecovery(state, player, targetInstanceId, definitions);
    }
    if (eventType === "player.moved" && event.playerId === player.id) {
      const source = livePhysicalSkill(state, player, HAKUNO_F_EXTELLA_ID, definitions);
      if (!source) return;
      removePhysicalCardFromGame(state, source.instanceId);
      return { removedInstanceId: source.instanceId };
    }
    if (eventType === "combat.resolved") return resolveRecovery(state, player, event, definitions);
    if (eventType === "card.played" && event.playerId === player.id && typeof event.instanceId === "string") {
      const source = state.cards[event.instanceId];
      if (source && matchesSkill(source, definitions[source.definitionId], HAKUNO_F_EXTELLA_ID) && ascensionOwned(state, player, definitions)) {
        player.flags.terrainAdvantageZeroSourceInstanceId = source.instanceId;
      }
    }
    return;
  }

  if (skill.id === HAKUNO_F_EXTRA_ID) {
    if (eventType === "combat.resolved") return resolveExtraCombat(state, player, event, definitions);
    if (eventType === "player.entered-location") {
      const enteredPlayerId = typeof event.playerId === "string" ? event.playerId : undefined;
      if (!enteredPlayerId || enteredPlayerId === player.id || (player.locationId !== "mountain" && player.locationId !== "city") || event.locationId !== player.locationId) return;
      if (!livePhysicalSkill(state, player, HAKUNO_F_EXTRA_ID, definitions)) return;
      return openBackdoorDecision(context, enteredPlayerId);
    }
    return;
  }

  if (skill.id === HAKUNO_F_ASCENSION_ID && eventType === "skill.unlocked") {
    if (event.playerId !== player.id || event.skillId !== HAKUNO_F_ASCENSION_ID) return;
    installAscensionCodeModifiers(state, player, definitions);
    return { upgraded: true };
  }
};

export const isHakunoFMysticCodeLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId) return false;
  if (skill.id === HAKUNO_F_DRESS_ID && ability?.id === HAKUNO_F_DRESS_ABILITY) return state.phase === "outpost" && player.hand.length > 0;
  if (skill.id === HAKUNO_F_LINK_ID && ability?.id === HAKUNO_F_MOON_DRIVE_ABILITY) return state.phase === "action" && Boolean(activePhysicalSkill(state, player, HAKUNO_F_LINK_ID, definitions));
  if (skill.id === HAKUNO_F_CCC_ID && ability?.id === HAKUNO_F_HACK_ABILITY) return state.phase === "action" && Boolean(activePhysicalSkill(state, player, HAKUNO_F_CCC_ID, definitions))
    && (player.locationId === "mountain" || player.locationId === "city");
  if (skill.id === HAKUNO_F_EXTELLA_ID && ability?.id === HAKUNO_F_RECOVERY_ABILITY) return state.phase === "combat" && Boolean(activePhysicalSkill(state, player, HAKUNO_F_EXTELLA_ID, definitions))
    && recoveryCandidates(state, player, definitions).length > 0;
  return false;
};

export function syncHakunoFCodeState(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): void {
  const player = state.players[playerId];
  if (!player) return;
  syncLinkSealRestriction(state, player, definitions);
  installAscensionCodeModifiers(state, player, definitions);
}
