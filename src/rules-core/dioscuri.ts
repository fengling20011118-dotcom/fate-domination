import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { assertCardCanEnterAttack } from "./card-rules.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { calculateCombatCardPower } from "./combat-power.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { movePlayerCard } from "./decks.ts";
import { payManaCost } from "./costs.ts";
import { markSkillRevealedThisRound } from "./skill-visibility.ts";
import { classifyServantAttackDefinition, installServantAttackPartitionRule } from "./servant-attack-partitions.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const DIOSCURI_SERVANT_ID = "servant.dioscuri";
export const DIOSCURI_TWIN_ID = "servant.dioscuri.skill.sc-dioscuri-1";
export const DIOSCURI_GIFT_ID = "servant.dioscuri.skill.sc-dioscuri-2";
export const DIOSCURI_TYNDARIDAE_ID = "servant.dioscuri.skill.sc-dioscuri-3";
export const DIOSCURI_TWIN_HANDLER = "core.dioscuri-twin-divinity";
export const DIOSCURI_GIFT_HANDLER = "core.dioscuri-gift-of-mortality";
export const DIOSCURI_TYNDARIDAE_HANDLER = "core.dioscuri-tyndaridae";

export const DIOSCURI_BURN_BRIGHT_ABILITY = "burn-bright";
export const DIOSCURI_MORTALITY_SEARCH_ABILITY = "mortality-search";
export const DIOSCURI_ADAMANT_FISTS_ABILITY = "adamant-fists";
export const DIOSCURI_ANTHEM_ABILITY = "anthem-of-the-gemini";

const TWIN_PARTITION_RULE_ID = `${DIOSCURI_TWIN_ID}:attack-partition`;
const GIFT_CASTOR_LIMIT_RULE_ID = `${DIOSCURI_GIFT_ID}:castor-basic-once-per-game`;
const TYNDARIDAE_POLLUX_POWER_RULE_ID = `${DIOSCURI_TYNDARIDAE_ID}:pollux-power`;
const TYNDARIDAE_CASTOR_POWER_RULE_ID = `${DIOSCURI_TYNDARIDAE_ID}:castor-combat-power`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function physicalSkillInstance(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return [...new Set([...player.servantSkills, ...player.attack, ...player.hand])]
    .map((instanceId) => state.cards[instanceId])
    .find((card) => {
      const definition = card ? definitions[card.definitionId] : undefined;
      return Boolean(card && card.ownerPlayerId === player.id && card.zone !== "removed" && card.zone !== "discard"
        && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
    });
}

function originalPackageDefinitionIds(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): string[] {
  const physicalIds = Object.values(state.cards)
    .filter((card) => card.ownerPlayerId === player.id && card.originServantId === DIOSCURI_SERVANT_ID)
    .map((card) => card.definitionId);
  const authoredSkillIds = Object.values(definitions)
    .filter((definition) => definition.ownerDefinitionId === DIOSCURI_SERVANT_ID && definition.isSkill === true)
    .map((definition) => definition.id);
  return [...new Set([...physicalIds, ...authoredSkillIds])];
}

function isAttackDefinition(definition: CardDefinition | undefined): boolean {
  return Boolean(definition && (definition.cardType === "attack" || definition.basic === true || definition.basePower !== 0 || getCardAttributes(definition).length > 0));
}

function partitionDefinitionIds(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): { pollux: string[]; castor: string[] } {
  const packageIds = originalPackageDefinitionIds(state, player, definitions).filter((definitionId) => isAttackDefinition(definitions[definitionId]));
  const pollux = packageIds.filter((definitionId) => {
    const definition = definitions[definitionId];
    const attributes = definition ? getCardAttributes(definition) : [];
    return definition?.basic === true && (attributes.includes("力量") || definitionId === "card.cardluck");
  });
  const polluxSet = new Set(pollux);
  return { pollux, castor: packageIds.filter((definitionId) => !polluxSet.has(definitionId)) };
}

function installTwinPartition(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  const { pollux, castor } = partitionDefinitionIds(state, player, definitions);
  if (pollux.length === 0 || castor.length === 0) throw new Error("DIOSCURI_PARTITION_DEFINITIONS_MISSING");
  installServantAttackPartitionRule(player, {
    id: TWIN_PARTITION_RULE_ID,
    sourceId: DIOSCURI_TWIN_ID,
    servantId: DIOSCURI_SERVANT_ID,
    firstGroupDefinitionIds: pollux,
    secondGroupDefinitionIds: castor,
    requireMixedRegularPair: true,
    powerAlterationApplications: 2,
  });
}

function installGiftCastorLimit(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  const source = physicalSkillInstance(state, player, DIOSCURI_GIFT_ID, definitions);
  if (!source) throw new Error("DIOSCURI_GIFT_SOURCE_MISSING");
  const { castor } = partitionDefinitionIds(state, player, definitions);
  const castorBasics = castor.filter((definitionId) => definitions[definitionId]?.basic === true);
  if (castorBasics.length === 0) throw new Error("DIOSCURI_CASTOR_BASIC_DEFINITIONS_MISSING");
  const modifier = {
    id: GIFT_CASTOR_LIMIT_RULE_ID,
    sourceId: DIOSCURI_GIFT_ID,
    sourceInstanceId: source.instanceId,
    targetDefinitionIds: castorBasics,
    usageLimitOverride: "once-per-game" as const,
    duration: "while-source-present" as const,
  };
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((candidate) => candidate.id !== modifier.id);
  addCardRuleModifier(player, modifier);
}

function revealTwinIfItAffectedPower(
  state: GameState,
  player: PlayerState,
  payload: Record<string, unknown>,
  definitions: Record<string, CardDefinition>,
): void {
  const event = isRecord(payload.event) ? payload.event : payload;
  const snapshot = isRecord(event.snapshot) ? event.snapshot : isRecord(event) && isRecord(event.cardPowers) ? event : undefined;
  if (!snapshot || !isRecord(snapshot.cardPowers)) return;
  const ownPowers = isRecord(snapshot.cardPowers[player.id]) ? snapshot.cardPowers[player.id] : undefined;
  if (!ownPowers) return;
  const source = physicalSkillInstance(state, player, DIOSCURI_TWIN_ID, definitions);
  if (!source || source.face === "up") return;
  const activePackageIds = player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card?.active && card.face === "up" && classifyServantAttackDefinition(state, player, card.definitionId, definitions));
  });
  if (activePackageIds.length === 0) return;
  const saved = player.servantAttackPartitionRules;
  player.servantAttackPartitionRules = (saved ?? []).filter((rule) => rule.id !== TWIN_PARTITION_RULE_ID);
  let affected = false;
  try {
    affected = activePackageIds.some((instanceId) => {
      const withTwin = Number(ownPowers[instanceId]);
      if (!Number.isFinite(withTwin)) return false;
      const withoutTwin = calculateCombatCardPower(state, player, instanceId, definitions, player.locationId ?? undefined);
      return withTwin !== withoutTwin;
    });
  } finally {
    player.servantAttackPartitionRules = saved;
  }
  if (!affected) return;
  source.face = "up";
  markSkillRevealedThisRound(state, player.id);
}

function castorPlayableIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return [...player.hand, ...player.servantSkills].filter((instanceId) => {
    const card = state.cards[instanceId];
    if (!card || classifyServantAttackDefinition(state, player, card.definitionId, definitions) !== "second") return false;
    try {
      assertCardCanEnterAttack({ state, playerId: player.id, instanceId, definitions, faceDown: false });
      return true;
    } catch {
      return false;
    }
  });
}

function polluxHandIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && classifyServantAttackDefinition(state, player, card.definitionId, definitions) === "first");
  });
}

export const useDioscuriTwinDivinity: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("DIOSCURI_TWIN_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "game.started") {
    installTwinPartition(state, player, definitions);
    return;
  }
  if (data.eventType === "combat.power-calculated") revealTwinIfItAffectedPower(state, player, data, definitions);
};

export const useDioscuriGiftOfMortality: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("DIOSCURI_GIFT_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "game.started") {
    installGiftCastorLimit(state, player, definitions);
    return;
  }
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("DIOSCURI_GIFT_WINDOW_INVALID");
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
  if (abilityId === DIOSCURI_BURN_BRIGHT_ABILITY) {
    const targetInstanceId = typeof data.targetInstanceId === "string" ? data.targetInstanceId : undefined;
    if (!targetInstanceId || !castorPlayableIds(state, player, definitions).includes(targetInstanceId)) throw new Error("DIOSCURI_CASTOR_ATTACK_INVALID");
    return addCardToAttack(state, player.id, targetInstanceId, definitions, {
      payCost: true,
      allowedSourceZones: ["hand", "servant-skills"],
    });
  }
  if (abilityId !== DIOSCURI_MORTALITY_SEARCH_ABILITY) throw new Error("DIOSCURI_GIFT_ABILITY_INVALID");
  const discardInstanceIds = Array.isArray(data.discardInstanceIds)
    ? data.discardInstanceIds.filter((instanceId): instanceId is string => typeof instanceId === "string")
    : [];
  if (discardInstanceIds.length !== 2 || new Set(discardInstanceIds).size !== 2
    || discardInstanceIds.some((instanceId) => !player.hand.includes(instanceId))) throw new Error("DIOSCURI_SEARCH_DISCARD_COST_INVALID");
  const searchZone = data.searchZone === "discard" ? "discard" : data.searchZone === "deck" ? "deck" : undefined;
  const targetInstanceId = typeof data.targetInstanceId === "string" ? data.targetInstanceId : undefined;
  if (!searchZone || !targetInstanceId) throw new Error("DIOSCURI_SEARCH_SELECTION_REQUIRED");
  const futureDiscard = new Set([...player.discard, ...discardInstanceIds]);
  if (searchZone === "deck" && !player.deck.includes(targetInstanceId)) throw new Error("DIOSCURI_SEARCH_TARGET_INVALID");
  if (searchZone === "discard" && !futureDiscard.has(targetInstanceId)) throw new Error("DIOSCURI_SEARCH_TARGET_INVALID");
  if (searchZone === "discard" && player.mana < 4) throw new Error("DIOSCURI_SEARCH_MANA_REQUIRED");
  for (const instanceId of discardInstanceIds) movePlayerCard(state, player.id, instanceId, "discard");
  if (searchZone === "discard") payManaCost(state, player, 4, definitions);
  movePlayerCard(state, player.id, targetInstanceId, "hand");
  return { searchedInstanceId: targetInstanceId, searchZone, discardedInstanceIds: discardInstanceIds };
};

export const isDioscuriGiftLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  if (ability?.id === DIOSCURI_BURN_BRIGHT_ABILITY) return castorPlayableIds(state, player, definitions).length > 0;
  if (ability?.id === DIOSCURI_MORTALITY_SEARCH_ABILITY) return player.hand.length >= 2
    && (player.deck.length > 0 || (player.mana >= 4 && player.discard.length + player.hand.length >= 3));
  return false;
};

function installOrIncreasePolluxPower(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): number {
  const { pollux } = partitionDefinitionIds(state, player, definitions);
  const existing = (player.cardRuleModifiers ?? []).find((modifier) => modifier.id === TYNDARIDAE_POLLUX_POWER_RULE_ID);
  if (existing) {
    existing.powerAdd = Number(existing.powerAdd ?? 0) + 1;
    return existing.powerAdd;
  }
  addCardRuleModifier(player, {
    id: TYNDARIDAE_POLLUX_POWER_RULE_ID,
    sourceId: DIOSCURI_TYNDARIDAE_ID,
    targetDefinitionIds: pollux,
    powerAdd: 1,
    duration: "game",
  });
  return 1;
}

function installCastorCombatPower(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  const source = physicalSkillInstance(state, player, DIOSCURI_TYNDARIDAE_ID, definitions);
  if (!source || source.zone !== "attack" || !source.active || source.face !== "up") throw new Error("DIOSCURI_TYNDARIDAE_SOURCE_NOT_ACTIVE");
  const { castor } = partitionDefinitionIds(state, player, definitions);
  const targets = castor.filter((definitionId) => definitionId !== DIOSCURI_TYNDARIDAE_ID);
  const modifier = {
    id: `${TYNDARIDAE_CASTOR_POWER_RULE_ID}:${state.round}`,
    sourceId: DIOSCURI_TYNDARIDAE_ID,
    sourceInstanceId: source.instanceId,
    targetDefinitionIds: targets,
    powerAdd: 2,
    duration: "while-source-active" as const,
  };
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((candidate) => candidate.id !== modifier.id);
  addCardRuleModifier(player, modifier);
}

export const useDioscuriTyndaridae: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("DIOSCURI_TYNDARIDAE_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
  if (abilityId === DIOSCURI_ADAMANT_FISTS_ABILITY) {
    if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("DIOSCURI_ADAMANT_WINDOW_INVALID");
    const discardInstanceId = typeof data.discardInstanceId === "string" ? data.discardInstanceId : undefined;
    if (!discardInstanceId || !polluxHandIds(state, player, definitions).includes(discardInstanceId)) throw new Error("DIOSCURI_POLLUX_DISCARD_INVALID");
    movePlayerCard(state, player.id, discardInstanceId, "discard");
    return { discardedInstanceId: discardInstanceId, polluxPowerAdd: installOrIncreasePolluxPower(state, player, definitions) };
  }
  if (abilityId === DIOSCURI_ANTHEM_ABILITY) {
    if (state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("DIOSCURI_ANTHEM_WINDOW_INVALID");
    installCastorCombatPower(state, player, definitions);
    return;
  }
  throw new Error("DIOSCURI_TYNDARIDAE_ABILITY_INVALID");
};

export const isDioscuriTyndaridaeLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions) return false;
  if (ability?.id === DIOSCURI_ADAMANT_FISTS_ABILITY) return state.phase === "action" && state.activePlayerId === playerId
    && polluxHandIds(state, player, definitions).length > 0;
  if (ability?.id === DIOSCURI_ANTHEM_ABILITY) return state.phase === "combat" && state.activePlayerId === playerId
    && Boolean(physicalSkillInstance(state, player, DIOSCURI_TYNDARIDAE_ID, definitions)?.active);
  return false;
};
