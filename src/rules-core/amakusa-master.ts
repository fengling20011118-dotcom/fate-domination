import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { installLinkedEntrySealRule, installLinkedManaContributionRule } from "./linked-player-rules.ts";
import { gainVictoryPoints } from "./resources.ts";
import type { SkillHandler } from "./skill-types.ts";

export const AMAKUSA_MASTER_ID = "master.amakusa";
export const AMAKUSA_VASSAL_ID = "master.amakusa.skill.s3";
export const AMAKUSA_ASCENSION_ID = "master.amakusa.skill.ascension";
export const AMAKUSA_VASSAL_HANDLER = "core.amakusa-vassal";
export const AMAKUSA_ASCENSION_HANDLER = "core.amakusa-past-ruler";
export const FIRST_FOLIO_ID = "servant.shakespeare.skill.sc-shakespeare-3";

const RED_TEAM_LEADER_STATUS = "role:red-team-leader";
const GOD_SERVANT_STATUS = "role:god-servant";
const WIN_STATE_KEY = "amakusaVassalCombatWins";
const FOLIO_MODIFIER_PREFIX = `${AMAKUSA_ASCENSION_ID}:first-folio-basic-plus-four:`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function linkedRuleId(kind: "entry" | "mana", anchorPlayerId: string, vassalPlayerId: string): string {
  return `${AMAKUSA_VASSAL_ID}:${kind}:${anchorPlayerId}:${vassalPlayerId}`;
}

function installVassalRelationshipRules(state: GameState, anchor: PlayerState): void {
  for (const candidate of Object.values(state.players)) {
    if (candidate.id === anchor.id) continue;
    installLinkedEntrySealRule(state, {
      id: linkedRuleId("entry", anchor.id, candidate.id),
      sourceId: AMAKUSA_VASSAL_ID,
      entrantPlayerId: candidate.id,
      anchorPlayerId: anchor.id,
      entrantRequiredStatus: GOD_SERVANT_STATUS,
      anchorRequiredStatus: RED_TEAM_LEADER_STATUS,
      commandSealCost: 1,
      onlyBeforeClimax: true,
    });
    installLinkedManaContributionRule(state, {
      id: linkedRuleId("mana", anchor.id, candidate.id),
      sourceId: AMAKUSA_VASSAL_ID,
      beneficiaryPlayerId: candidate.id,
      contributorPlayerId: anchor.id,
      beneficiaryRequiredStatus: GOD_SERVANT_STATUS,
      contributorRequiredStatus: RED_TEAM_LEADER_STATUS,
      maxPerRound: 1,
      requireDifferentBattlefields: true,
    });
  }
}

interface VassalWinRecord {
  round: number;
  anchorLocationId?: string;
  vassalLocationIds: Record<string, string>;
  rewardedVassalPlayerIds: string[];
}

function readWinRecord(state: GameState): VassalWinRecord {
  const raw = state.modeState[WIN_STATE_KEY];
  if (!isRecord(raw) || Number(raw.round) !== state.round) {
    return { round: state.round, vassalLocationIds: {}, rewardedVassalPlayerIds: [] };
  }
  const locations = isRecord(raw.vassalLocationIds)
    ? Object.fromEntries(Object.entries(raw.vassalLocationIds).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  return {
    round: state.round,
    ...(typeof raw.anchorLocationId === "string" ? { anchorLocationId: raw.anchorLocationId } : {}),
    vassalLocationIds: locations,
    rewardedVassalPlayerIds: Array.isArray(raw.rewardedVassalPlayerIds)
      ? raw.rewardedVassalPlayerIds.filter((value): value is string => typeof value === "string")
      : [],
  };
}

function recordDifferentFightRewards(state: GameState, anchor: PlayerState, event: Record<string, unknown>): void {
  const locationId = typeof event.locationId === "string" ? event.locationId : undefined;
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((value): value is string => typeof value === "string") : [];
  if (!locationId || winnerIds.length === 0) return;
  const record = readWinRecord(state);
  if (winnerIds.includes(anchor.id)) record.anchorLocationId = locationId;
  for (const vassal of Object.values(state.players)) {
    if (vassal.id === anchor.id || vassal.eliminated || !vassal.statuses.includes(GOD_SERVANT_STATUS)) continue;
    if (winnerIds.includes(vassal.id)) record.vassalLocationIds[vassal.id] = locationId;
  }

  if (record.anchorLocationId) {
    for (const [vassalPlayerId, vassalLocationId] of Object.entries(record.vassalLocationIds)) {
      if (vassalLocationId === record.anchorLocationId || record.rewardedVassalPlayerIds.includes(vassalPlayerId)) continue;
      const vassal = state.players[vassalPlayerId];
      if (!vassal || vassal.eliminated || !vassal.statuses.includes(GOD_SERVANT_STATUS)) continue;
      gainVictoryPoints(anchor, 1);
      gainVictoryPoints(vassal, 1);
      record.rewardedVassalPlayerIds.push(vassalPlayerId);
    }
  }
  state.modeState[WIN_STATE_KEY] = record;
}

/**
 * Vassal: install dormant linked-player rules at game start and resolve the
 * unique different-fight VP clause from authoritative combat results.
 */
export const useAmakusaVassal: SkillHandler = ({ state, player, payload }) => {
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "game.started") {
    if (player.masterId !== AMAKUSA_MASTER_ID) return;
    installVassalRelationshipRules(state, player);
    return;
  }
  if (eventType !== "combat.resolved" || player.masterId !== AMAKUSA_MASTER_ID || !isRecord(data.event)) return;
  recordDifferentFightRewards(state, player, data.event);
};

function matchesFirstFolio(definition: CardDefinition | undefined, definitionId: string): boolean {
  return definitionId === FIRST_FOLIO_ID || definitionId === `card.skill.${FIRST_FOLIO_ID}` || definition?.linkedSkillId === FIRST_FOLIO_ID;
}

function ascensionOwned(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  return [...player.masterSkills, ...player.attack].some((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.zone !== "removed" && card.zone !== "discard"
      && (card.definitionId === AMAKUSA_ASCENSION_ID || definition?.linkedSkillId === AMAKUSA_ASCENSION_ID));
  });
}

function syncFirstFolioBasicBonus(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => !modifier.id.startsWith(FOLIO_MODIFIER_PREFIX));
  if (!ascensionOwned(state, player, definitions)) return;
  const firstFolio = player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.active && card.face === "up" && card.zone === "attack" && matchesFirstFolio(definition, card.definitionId));
  });
  if (!firstFolio) return;
  state.activeRuleModifiers.push({
    id: `${FOLIO_MODIFIER_PREFIX}${firstFolio.instanceId}`,
    sourceId: AMAKUSA_ASCENSION_ID,
    sourceInstanceId: firstFolio.instanceId,
    controllerPlayerId: player.id,
    operation: "add",
    rule: "card_power",
    scope: { subject: "controller", cards: { basic: true } },
    value: 4,
    duration: "while-source-active",
    createdRound: state.round,
  });
}

/** Past Ruler: immediate seal loss on unlock and a source-bound First Folio aura. */
export const useAmakusaPastRuler: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("AMAKUSA_ASCENSION_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "skill.unlocked") {
    if (event.playerId !== player.id || event.skillId !== skill.id) return;
    for (const opponent of Object.values(state.players)) {
      if (opponent.id === player.id || opponent.eliminated) continue;
      opponent.commandSeals = Math.max(0, opponent.commandSeals - 2);
    }
    syncFirstFolioBasicBonus(state, player, definitions);
    return;
  }
  if (eventType === "card.played") {
    if (event.playerId !== player.id || typeof event.definitionId !== "string") return;
    const definition = definitions[event.definitionId];
    if (!matchesFirstFolio(definition, event.definitionId)) return;
    syncFirstFolioBasicBonus(state, player, definitions);
    return;
  }
  if (eventType === "card.entered-attack") {
    const eventOwnerId = typeof event.ownerPlayerId === "string" ? event.ownerPlayerId : typeof event.playerId === "string" ? event.playerId : undefined;
    if (eventOwnerId !== player.id || typeof event.instanceId !== "string") return;
    const card = state.cards[event.instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || !matchesFirstFolio(definition, card.definitionId)) return;
    syncFirstFolioBasicBonus(state, player, definitions);
  }
};
