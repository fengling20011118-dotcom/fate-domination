import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { calculateCombatCardPower } from "./combat-power.ts";
import type { CardDefinition } from "./content-types.ts";
import { createDerivedCardInstance } from "./decks.ts";
import { scheduleEffect } from "./scheduled-effects.ts";
import { addSkillUseBlock } from "./skill-use-blocks.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const MELTRYLLIS_MELT_VIRUS_ID = "servant.meltryllis.skill.sc-meltryllis-1";
export const MELTRYLLIS_SARASWATI_ID = "servant.meltryllis.skill.sc-meltryllis-2";
export const MELTRYLLIS_MELT_VIRUS_HANDLER = "core.meltryllis-melt-virus";
export const MELTRYLLIS_SARASWATI_HANDLER = "core.meltryllis-saraswati-meltout";

const MELT_ABSORB = "absorb";
const SARASWATI_LIQUID_BODY = "liquid-body";
const SARASWATI_ALTER_PLAY = "alter-play";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(card: CardInstance | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.fullSkillCopy?.sourceSkillId === skillId
    || card.definitionId === skillId
    || card.definitionId === `card.skill.${skillId}`
    || definition?.linkedSkillId === skillId));
}

function activeSkillSource(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(card, definition, skillId));
  });
}

function skillZoneCandidates(
  state: GameState,
  target: PlayerState,
  definitions: Record<string, CardDefinition>,
): CardInstance[] {
  return [...target.masterSkills, ...target.servantSkills]
    .map((instanceId) => state.cards[instanceId])
    .filter((card): card is CardInstance => {
      if (!card || card.ownerPlayerId !== target.id || card.controllerPlayerId !== target.id) return false;
      if (card.zone !== "master-skills" && card.zone !== "servant-skills") return false;
      const definition = definitions[card.definitionId];
      return Boolean(definition?.isSkill || definition?.linkedSkillId || card.fullSkillCopy?.sourceSkillId);
    });
}

function sourceSkillId(card: CardInstance, definitions: Record<string, CardDefinition>): string | undefined {
  if (card.fullSkillCopy?.sourceSkillId) return card.fullSkillCopy.sourceSkillId;
  const definition = definitions[card.definitionId];
  if (!definition) return undefined;
  if (definition.linkedSkillId) return definition.linkedSkillId;
  return definition.isSkill ? definition.id : undefined;
}

function delayedSourceStillAvailable(state: GameState, player: PlayerState, instanceId: string): boolean {
  const source = state.cards[instanceId];
  return Boolean(source && source.ownerPlayerId === player.id && source.controllerPlayerId === player.id
    && ["master-skills", "servant-skills", "attack", "hand"].includes(source.zone));
}

function createTemporaryFullSkillCopy(
  state: GameState,
  player: PlayerState,
  sourceCard: CardInstance,
  sourceDefinitionId: string,
  sourceSkillDefinitionId: string,
  definitions: Record<string, CardDefinition>,
  index: number,
): string | undefined {
  const skillDefinition = definitions[sourceSkillDefinitionId] ?? definitions[sourceCard.definitionId];
  if (skillDefinition?.tags?.includes("cannot-copy")) return undefined;
  const ownerType = skillDefinition?.skillOwnerType ?? definitions[sourceCard.definitionId]?.skillOwnerType;
  const zone = ownerType === "master" ? "master-skills" : "servant-skills";
  const instanceId = `${player.id}:full-skill-copy:${sourceSkillDefinitionId}:${state.round}:${state.revision}:${index}`;
  const copy = createDerivedCardInstance(state, player.id, {
    instanceId,
    definitionId: sourceDefinitionId,
    zone,
    temporary: true,
    temporaryCleanup: "round-end",
    derivedFromInstanceId: sourceCard.instanceId,
    createdByPlayerId: player.id,
    sourceEffectId: MELTRYLLIS_MELT_VIRUS_ID,
  });
  copy.fullSkillCopy = {
    sourceId: MELTRYLLIS_MELT_VIRUS_ID,
    sourceSkillId: sourceSkillDefinitionId,
    rebindNamedOwnerToController: true,
  };
  return copy.instanceId;
}

function sameFightOpponentIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((playerId) => playerId !== player.id
    && Boolean(state.players[playerId]) && !state.players[playerId].eliminated);
}

/** Melt Virus: arm next-round infection, then resolve exact physical-card bans and optional fresh full-text copies. */
export const useMeltryllisMeltVirus: SkillHandler = ({ state, player, skill, payload, definitions, randomInt }) => {
  if (!definitions) throw new Error("MELTRYLLIS_MELT_VIRUS_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const scheduled = isRecord(data.scheduled) ? data.scheduled : undefined;
  if (scheduled) {
    const sourceInstanceId = typeof scheduled.sourceInstanceId === "string" ? scheduled.sourceInstanceId : undefined;
    const targetPlayerIds = Array.isArray(scheduled.targetPlayerIds)
      ? scheduled.targetPlayerIds.filter((id): id is string => typeof id === "string")
      : [];
    const copyOnResolve = scheduled.copyOnResolve === true;
    if (!sourceInstanceId || !delayedSourceStillAvailable(state, player, sourceInstanceId)) return { infectedInstanceIds: [], copiedInstanceIds: [], sourceUnavailable: true };
    if (!randomInt) throw new Error("MELTRYLLIS_MELT_VIRUS_RANDOM_REQUIRED");
    const infectedInstanceIds: string[] = [];
    const copiedInstanceIds: string[] = [];
    for (const targetPlayerId of targetPlayerIds) {
      const target = state.players[targetPlayerId];
      if (!target || target.eliminated) continue;
      const candidates = skillZoneCandidates(state, target, definitions);
      if (candidates.length === 0) continue;
      const chosenIndex = randomInt(candidates.length);
      if (!Number.isInteger(chosenIndex) || chosenIndex < 0 || chosenIndex >= candidates.length) throw new Error("MELTRYLLIS_MELT_VIRUS_RANDOM_INVALID");
      const chosen = candidates[chosenIndex];
      addSkillUseBlock(target, {
        id: `${skill.id}:infected:${state.round}:${target.id}:${chosen.instanceId}`,
        sourceId: skill.id,
        sourcePlayerId: player.id,
        throughRound: state.round,
        definitionIds: [],
        instanceIds: [chosen.instanceId],
      });
      infectedInstanceIds.push(chosen.instanceId);
      if (!copyOnResolve) continue;
      const copiedSkillId = sourceSkillId(chosen, definitions);
      if (!copiedSkillId) continue;
      const copied = createTemporaryFullSkillCopy(state, player, chosen, chosen.definitionId, copiedSkillId, definitions, copiedInstanceIds.length);
      if (copied) copiedInstanceIds.push(copied);
    }
    return { infectedInstanceIds, copiedInstanceIds, sourceUnavailable: false };
  }

  if (data.abilityId !== MELT_ABSORB) throw new Error("MELTRYLLIS_MELT_VIRUS_ABILITY_INVALID");
  if (state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("MELTRYLLIS_MELT_VIRUS_WINDOW_INVALID");
  const source = activeSkillSource(state, player, skill.id, definitions);
  if (!source) throw new Error("MELTRYLLIS_MELT_VIRUS_SOURCE_INACTIVE");
  const targetPlayerIds = sameFightOpponentIds(state, player);
  if (targetPlayerIds.length === 0) throw new Error("MELTRYLLIS_MELT_VIRUS_NO_OPPONENT");
  const scheduleId = `${skill.id}:infect:${player.id}:${state.round}:${state.revision}`;
  scheduleEffect(state, {
    scheduleId,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    handlerId: MELTRYLLIS_MELT_VIRUS_HANDLER,
    payload: { sourceInstanceId: source.instanceId, targetPlayerIds, copyOnResolve: source.reversed === true },
    triggerEventType: "round.started",
    triggerRound: state.round + 1,
    expiresAfterRound: state.round + 1,
    once: true,
  });
  return { scheduleId, targetPlayerIds, copyOnResolve: source.reversed === true };
};

export const isMeltryllisMeltVirusLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== MELT_ABSORB) return false;
  return state.phase === "combat" && state.activePlayerId === playerId
    && Boolean(activeSkillSource(state, player, skill.id, definitions))
    && sameFightOpponentIds(state, player).length > 0;
};

function saraswatiStrengthTargets(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  const result: string[] = [];
  for (const opponentId of sameFightOpponentIds(state, player)) {
    for (const instanceId of state.players[opponentId].attack) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || !definition || !card.active || card.face !== "up" || card.controllerPlayerId !== opponentId) continue;
      if (getCardInstanceAttributes(card, definition, state, definitions).includes("力量")
        && calculateCombatCardPower(state, state.players[opponentId], instanceId, definitions) > 3) result.push(instanceId);
    }
  }
  return result;
}

/** Saraswati Meltout: the two printed abilities share one unique-group use; Alter/Action performs real paid card plays. */
export const useMeltryllisSaraswati: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload)) throw new Error("MELTRYLLIS_SARASWATI_CONTEXT_REQUIRED");
  const abilityId = typeof payload.abilityId === "string" ? payload.abilityId : undefined;
  const source = activeSkillSource(state, player, skill.id, definitions);
  if (!source) throw new Error("MELTRYLLIS_SARASWATI_SOURCE_INACTIVE");
  if (abilityId === SARASWATI_LIQUID_BODY) {
    if (state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("MELTRYLLIS_SARASWATI_WINDOW_INVALID");
    const affectedInstanceIds = saraswatiStrengthTargets(state, player, definitions);
    for (const instanceId of affectedInstanceIds) {
      const card = state.cards[instanceId];
      const modifierId = `${skill.id}:liquid-body:${state.round}:${instanceId}`;
      card.powerModifiers = [
        ...(card.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
        { id: modifierId, sourceId: skill.id, kind: "set", value: 3, duration: "round" },
      ];
    }
    return { affectedInstanceIds };
  }
  if (abilityId === SARASWATI_ALTER_PLAY) {
    if (state.phase !== "action" || state.activePlayerId !== player.id || source.reversed !== true) throw new Error("MELTRYLLIS_SARASWATI_ALTER_REQUIRED");
    const instanceIds = Array.isArray(payload.cardInstanceIds)
      ? payload.cardInstanceIds.filter((id): id is string => typeof id === "string")
      : [];
    if (instanceIds.length < 1 || instanceIds.length > 3 || new Set(instanceIds).size !== instanceIds.length
      || instanceIds.some((instanceId) => !player.hand.includes(instanceId))) throw new Error("MELTRYLLIS_SARASWATI_CARD_SELECTION_INVALID");
    const played: Array<{ instanceId: string; paidMana: number }> = [];
    for (const instanceId of instanceIds) {
      const definition = definitions[state.cards[instanceId]?.definitionId ?? ""];
      if (!definition) throw new Error("MELTRYLLIS_SARASWATI_CARD_DEFINITION_MISSING");
      const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, {
        payCost: true,
        allowedSourceZones: ["hand"],
        bypassTiming: true,
      });
      played.push({ instanceId, paidMana });
      emitEvent?.("card.played", {
        playerId: player.id,
        instanceId,
        definitionId: definition.id,
        face: "up",
        paidMana,
        attributes: getCardInstanceAttributes(state.cards[instanceId], definition, state, definitions),
        method: "meltryllis-saraswati-alter",
      });
    }
    return { played };
  }
  throw new Error("MELTRYLLIS_SARASWATI_ABILITY_INVALID");
};

export const isMeltryllisSaraswatiLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !ability) return false;
  const source = activeSkillSource(state, player, skill.id, definitions);
  if (!source || state.activePlayerId !== playerId) return false;
  if (ability.id === SARASWATI_LIQUID_BODY) return state.phase === "combat" && saraswatiStrengthTargets(state, player, definitions).length > 0;
  if (ability.id === SARASWATI_ALTER_PLAY) return state.phase === "action" && source.reversed === true && player.hand.length > 0;
  return false;
};
