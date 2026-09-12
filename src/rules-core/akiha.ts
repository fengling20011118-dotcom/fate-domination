import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { loseCommandSeals } from "./command-seals.ts";
import { installLinkedManaContributionRule, removeLinkedPlayerRulesBySource } from "./linked-player-rules.ts";
import { gainCustomResource, gainMana, getCustomResource, setCustomResource, spendCustomResource } from "./resources.ts";
import type { SkillAbilityDefinition, SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const AKIHA_HANDLER = "core.akiha-bloodlust";
export const AKIHA_CAGING_HAIR_ID = "master.akiha.skill.s1";
export const AKIHA_DEMONIC_HERITAGE_ID = "master.akiha.skill.s1a";
export const AKIHA_VERMILION_ID = "master.akiha.skill.s2";
export const AKIHA_BLOODLUST_ID = "master.akiha.skill.s3";
export const AKIHA_ASCENSION_ID = "master.akiha.skill.ascension";
export const AKIHA_BLOODLUST_ACTION = "bloodlust-action";
const BLOODLUST_RESOURCE = "bloodlust";
const VERMILION_FLAG = "akihaVermilion";
const WAIVER_SOURCE = AKIHA_BLOODLUST_ID;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isVermilion(player: PlayerState): boolean {
  return player.flags[VERMILION_FLAG] === true;
}

function bloodlust(player: PlayerState): number {
  return isVermilion(player) ? 1 : getCustomResource(player, BLOODLUST_RESOURCE);
}

function setBloodlust(player: PlayerState, amount: number): void {
  setCustomResource(player, BLOODLUST_RESOURCE, isVermilion(player) ? 1 : Math.max(0, amount));
}

function syncEightManaWaiver(player: PlayerState): void {
  const current = Array.isArray(player.flags.skillEightManaWaiverSourceIds)
    ? player.flags.skillEightManaWaiverSourceIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const next = bloodlust(player) >= 10 && !isVermilion(player)
    ? [...new Set([...current, WAIVER_SOURCE])]
    : current.filter((id) => id !== WAIVER_SOURCE);
  if (next.length > 0) player.flags.skillEightManaWaiverSourceIds = next;
  else delete player.flags.skillEightManaWaiverSourceIds;
}

function cagingRuleId(playerId: string, opponentId: string): string {
  return `${AKIHA_CAGING_HAIR_ID}:mana:${playerId}:${opponentId}`;
}

function installCagingHair(state: GameState, player: PlayerState): void {
  removeLinkedPlayerRulesBySource(state, AKIHA_CAGING_HAIR_ID);
  if (isVermilion(player)) return;
  for (const opponent of Object.values(state.players)) {
    if (opponent.id === player.id || opponent.eliminated) continue;
    installLinkedManaContributionRule(state, {
      id: cagingRuleId(player.id, opponent.id),
      sourceId: AKIHA_CAGING_HAIR_ID,
      beneficiaryPlayerId: player.id,
      contributorPlayerId: opponent.id,
      maxPerRound: 1,
      requireSameBattlefield: true,
      minimumContributorMana: 6,
    });
  }
}

function ascensionDefinitionIds(definitions: Record<string, CardDefinition>): string[] {
  return Object.values(definitions)
    .filter((definition) => definition.id === AKIHA_ASCENSION_ID || definition.linkedSkillId === AKIHA_ASCENSION_ID)
    .map((definition) => definition.id);
}

function installVermilionAscensionRule(player: PlayerState, definitions: Record<string, CardDefinition>): void {
  const id = `${AKIHA_VERMILION_ID}:brilliant-phantasm`;
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
  const targetDefinitionIds = ascensionDefinitionIds(definitions);
  if (targetDefinitionIds.length === 0) return;
  addCardRuleModifier(player, {
    id,
    sourceId: AKIHA_VERMILION_ID,
    targetDefinitionIds,
    costAdd: 3,
    powerAdd: 4,
    duration: "game",
  });
}

function transformToVermilion(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): { lostCommandSeals: number } {
  if (isVermilion(player)) return { lostCommandSeals: 0 };
  player.flags[VERMILION_FLAG] = true;
  setCustomResource(player, BLOODLUST_RESOURCE, 1);
  const sealsBefore = player.commandSeals;
  loseCommandSeals(state, player.id, sealsBefore);
  player.flags.manaGainMultiplier = 2;
  player.flags.victoryPointGainFractionNumerator = 1;
  player.flags.victoryPointGainFractionDenominator = 2;
  removeLinkedPlayerRulesBySource(state, AKIHA_CAGING_HAIR_ID);
  syncEightManaWaiver(player);
  installVermilionAscensionRule(player, definitions);
  return { lostCommandSeals: sealsBefore - player.commandSeals };
}

function handleDemonicHeritage(state: GameState, player: PlayerState, eventType: string | undefined, event: Record<string, unknown>, randomInt?: (maxExclusive: number) => number) {
  if (isVermilion(player)) {
    setCustomResource(player, BLOODLUST_RESOURCE, 1);
    syncEightManaWaiver(player);
    return;
  }
  if (eventType === "player.mana.spent") {
    if (event.playerId !== player.id) return;
    const amount = Number(event.amount);
    if (!Number.isInteger(amount) || amount <= 0) return;
    gainCustomResource(player, BLOODLUST_RESOURCE, amount);
    syncEightManaWaiver(player);
    return { bloodlust: bloodlust(player) };
  }
  if (eventType === "combat.ending") {
    if (Number(player.flags.akihaBloodlustLossBlockedRound ?? -1) === state.round) return { bloodlust: bloodlust(player), loss: 0 };
    const roll = 1 + (randomInt ? randomInt(3) : 0);
    const loss = roll * (player.locationId === "workshop" ? 2 : 1);
    spendCustomResource(player, BLOODLUST_RESOURCE, loss);
    syncEightManaWaiver(player);
    return { bloodlust: bloodlust(player), loss };
  }
}

function grantSkillEntryPower(state: GameState, player: PlayerState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>): void {
  if (bloodlust(player) < 5 || event.playerId !== player.id || typeof event.instanceId !== "string") return;
  const instance = state.cards[event.instanceId];
  const definition = instance ? definitions[instance.definitionId] : undefined;
  if (!instance || !definition?.isSkill || instance.zone !== "attack" || !instance.active || instance.face !== "up") return;
  const modifierId = `${AKIHA_BLOODLUST_ID}:entry-power:${instance.instanceId}`;
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== modifierId);
  addCardRuleModifier(player, {
    id: modifierId,
    sourceId: AKIHA_BLOODLUST_ID,
    sourceInstanceId: instance.instanceId,
    targetDefinitionIds: [instance.definitionId],
    targetInstanceIds: [instance.instanceId],
    powerAdd: 1,
    duration: "while-source-active",
  });
}

function applyPlunderedLife(state: GameState, player: PlayerState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>): void {
  if (isVermilion(player) || event.playerId !== player.id || typeof event.instanceId !== "string") return;
  const source = state.cards[event.instanceId];
  const definition = source ? definitions[source.definitionId] : undefined;
  if (!source || (source.definitionId !== AKIHA_ASCENSION_ID && definition?.linkedSkillId !== AKIHA_ASCENSION_ID)) return;
  const payerIds = [...new Set((source.playManaContributions ?? []).map((entry) => entry.playerId)
    .filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated))];
  if (payerIds.length === 0) return;
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => modifier.id !== `${AKIHA_ASCENSION_ID}:plunder:${source.instanceId}`);
  state.activeRuleModifiers.push({
    id: `${AKIHA_ASCENSION_ID}:plunder:${source.instanceId}`,
    sourceId: AKIHA_ASCENSION_ID,
    sourceInstanceId: source.instanceId,
    controllerPlayerId: player.id,
    operation: "add",
    rule: "combat_power",
    scope: { subject: "all_players", playerIds: payerIds },
    value: -3,
    duration: "while-source-active",
    createdRound: state.round,
  });
}

export const useAkiha: SkillHandler = ({ state, player, skill, payload, definitions, randomInt }) => {
  if (!definitions) throw new Error("AKIHA_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === AKIHA_CAGING_HAIR_ID && eventType === "game.started") {
    installCagingHair(state, player);
    return { contributors: Object.values(state.players).filter((candidate) => candidate.id !== player.id && !candidate.eliminated).map((candidate) => candidate.id) };
  }
  if (skill.id === AKIHA_DEMONIC_HERITAGE_ID) {
    if (eventType === "game.started") {
      setBloodlust(player, bloodlust(player));
      syncEightManaWaiver(player);
      return { bloodlust: bloodlust(player) };
    }
    return handleDemonicHeritage(state, player, eventType, event, randomInt);
  }
  if (skill.id === AKIHA_VERMILION_ID && eventType === "game.started" && isVermilion(player)) {
    setCustomResource(player, BLOODLUST_RESOURCE, 1);
    player.flags.manaGainMultiplier = 2;
    player.flags.victoryPointGainFractionNumerator = 1;
    player.flags.victoryPointGainFractionDenominator = 2;
    installVermilionAscensionRule(player, definitions);
    return { vermilion: true };
  }
  if (skill.id === AKIHA_BLOODLUST_ID) {
    if (data.abilityId === AKIHA_BLOODLUST_ACTION) {
      if (bloodlust(player) >= 5) throw new Error("AKIHA_BLOODLUST_ACTION_THRESHOLD");
      const manaGained = gainMana(player, 1);
      player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 2;
      if (!isVermilion(player)) gainCustomResource(player, BLOODLUST_RESOURCE, 3);
      else setCustomResource(player, BLOODLUST_RESOURCE, 1);
      player.flags.akihaBloodlustLossBlockedRound = state.round;
      syncEightManaWaiver(player);
      return { manaGained, powerBonus: 2, bloodlust: bloodlust(player) };
    }
    if (eventType === "card.played") {
      grantSkillEntryPower(state, player, event, definitions);
      return;
    }
    if (eventType === "round.ending" && !isVermilion(player) && bloodlust(player) >= 15) {
      return transformToVermilion(state, player, definitions);
    }
    if (eventType === "game.started") syncEightManaWaiver(player);
  }
  if (skill.id === AKIHA_ASCENSION_ID && eventType === "card.played") {
    applyPlunderedLife(state, player, event, definitions);
  }
};

export const isAkihaLegal: SkillLegalityPredicate = (state: GameState, playerId: string, skill?: SkillDefinition, ability?: SkillAbilityDefinition) => {
  const player = state.players[playerId];
  if (!player || !skill || !ability || state.activePlayerId !== playerId) return false;
  return skill.id === AKIHA_BLOODLUST_ID && ability.id === AKIHA_BLOODLUST_ACTION && state.phase === "action" && bloodlust(player) < 5;
};
