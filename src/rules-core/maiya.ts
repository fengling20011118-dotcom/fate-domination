import type { GameState, PlayerState } from "../domain/state/types.ts";
import { calculateTerrainAdvantage } from "./combat-power.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { createDerivedCardInstance, lendSkillFromOwnerSkillZoneToPlayer, removePhysicalCardFromGame, returnBorrowedSkillToOwnerSkillZone } from "./decks.ts";
import { gainMana, transferVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const MAIYA_HANDLER = "core.maiya-support-fire";
export const MAIYA_RESOLVE = "core.maiya-support-fire-resolve";
export const MAIYA_MILITARY_ID = "master.maiya.skill.s1";
export const MAIYA_SUPPORT_FIRE_ID = "master.maiya.skill.s2";
export const MAIYA_ASCENSION_ID = "master.maiya.skill.ascension";
export const MAIYA_SHOOTING_ID = "card.derived.master.maiya.shooting";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function controlledActiveSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function supportFireInOwnerSkillZone(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return player.masterSkills.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === "master-skills" && !card.active
      && matchesSkill(definition, card.definitionId, MAIYA_SUPPORT_FIRE_ID));
  });
}

function supportTargets(state: GameState, player: PlayerState): string[] {
  return state.turnOrder.filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated);
}

function installCannotWinThisRound(state: GameState, player: PlayerState): void {
  const id = `${MAIYA_MILITARY_ID}:cannot-win:${state.round}:${player.id}`;
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
  state.activeRuleModifiers.push({
    id,
    sourceId: MAIYA_MILITARY_ID,
    controllerPlayerId: player.id,
    operation: "forbid",
    rule: "combat_winner_eligibility",
    scope: { subject: "controller" },
    duration: "round",
    createdRound: state.round,
  });
}

function lendSupportFire(state: GameState, player: PlayerState, targetPlayerId: string, definitions: Record<string, CardDefinition>) {
  if (!supportTargets(state, player).includes(targetPlayerId)) throw new Error("MAIYA_SUPPORT_TARGET_INVALID");
  const source = supportFireInOwnerSkillZone(state, player, definitions);
  if (!source) throw new Error("MAIYA_SUPPORT_FIRE_NOT_AVAILABLE");
  lendSkillFromOwnerSkillZoneToPlayer(state, player.id, targetPlayerId, source.instanceId, definitions);
  installCannotWinThisRound(state, player);
  return { targetPlayerId, instanceId: source.instanceId };
}

function beginSupportFire(context: Parameters<SkillHandler>[0]) {
  const { state, player, definitions, openDecision } = context;
  if (!definitions || state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("MAIYA_MILITARY_WINDOW_INVALID");
  if (player.locationId === "mountain" || player.locationId === "city") throw new Error("MAIYA_MILITARY_BATTLEFIELD_FORBIDDEN");
  if (!supportFireInOwnerSkillZone(state, player, definitions)) throw new Error("MAIYA_SUPPORT_FIRE_NOT_AVAILABLE");
  const candidates = supportTargets(state, player);
  if (candidates.length === 0) throw new Error("MAIYA_SUPPORT_TARGET_REQUIRED");
  if (candidates.length === 1) return lendSupportFire(state, player, candidates[0], definitions);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${MAIYA_MILITARY_ID}:target`;
  state.effectQueue.unshift({
    effectId,
    handlerId: MAIYA_RESOLVE,
    sourceId: MAIYA_MILITARY_ID,
    controllerPlayerId: player.id,
    payload: { candidateIds: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "maiya-support-fire-target",
    options: candidates.map((id) => ({ id, label: state.players[id]?.name ?? id })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, candidatePlayerIds: candidates };
}

function returnSupportFireAtRoundEnd(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  const lent = Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return card.ownerPlayerId === player.id && card.controllerPlayerId !== player.id && card.zone === "attack"
      && matchesSkill(definition, card.definitionId, MAIYA_SUPPORT_FIRE_ID)
      && card.returnToOwnerSkillZoneOnClose === "master-skills";
  });
  if (!lent?.controllerPlayerId) return { returnedInstanceId: null };
  returnBorrowedSkillToOwnerSkillZone(state, lent.controllerPlayerId, lent.instanceId);
  return { returnedInstanceId: lent.instanceId };
}

function useSuppressingFire(context: Parameters<SkillHandler>[0]) {
  const { state, player, skill, definitions } = context;
  if (!definitions || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("MAIYA_SUPPRESSING_FIRE_WINDOW_INVALID");
  const source = controlledActiveSkill(state, player, skill.id, definitions);
  if (!source?.ownerPlayerId) throw new Error("MAIYA_SUPPRESSING_FIRE_SOURCE_INACTIVE");
  const owner = state.players[source.ownerPlayerId];
  if (!owner || owner.eliminated) throw new Error("MAIYA_SUPPORT_OWNER_INVALID");
  let paidVictoryPoints = 0;
  if (owner.id !== player.id) {
    if (player.victoryPoints < 2) throw new Error("MAIYA_SUPPRESSING_FIRE_VP_REQUIRED");
    paidVictoryPoints = transferVictoryPoints(player, owner, 2);
    if (paidVictoryPoints !== 2) throw new Error("MAIYA_SUPPRESSING_FIRE_VP_REQUIRED");
  }
  const locationId = player.locationId;
  const before = calculateTerrainAdvantage(state, player, definitions, locationId);
  const after = (before + 1) * 2;
  player.flags.terrainAdvantageOverrideRound = state.round;
  if (locationId) player.flags.terrainAdvantageOverrideLocationId = locationId;
  else delete player.flags.terrainAdvantageOverrideLocationId;
  player.flags.terrainAdvantageOverrideValue = after;
  return { ownerPlayerId: owner.id, paidVictoryPoints, terrainAdvantageBefore: before, terrainAdvantageAfter: after };
}

function unlockDessertFanatic(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  const candidates = [...player.hand, ...player.deck, ...player.discard].filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && getCardInstanceAttributes(card, definition, state, definitions).includes("魔术"));
  });
  for (const instanceId of candidates) removePhysicalCardFromGame(state, instanceId);
  const manaGained = gainMana(player, candidates.length * 2);
  const existing = Object.values(state.cards).find((card) => card.ownerPlayerId === player.id && card.definitionId === MAIYA_SHOOTING_ID && card.zone !== "removed");
  if (existing) return { removedInstanceIds: candidates, manaGained, shootingInstanceId: existing.instanceId };
  const instanceId = `${state.gameInstanceId}:${player.id}:${MAIYA_ASCENSION_ID}:shooting`;
  const created = createDerivedCardInstance(state, player.id, {
    instanceId,
    definitionId: MAIYA_SHOOTING_ID,
    zone: "master-skills",
    face: "up",
    active: false,
    sourceEffectId: MAIYA_ASCENSION_ID,
  });
  return { removedInstanceIds: candidates, manaGained, shootingInstanceId: created.instanceId };
}

export const useMaiya: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions } = context;
  if (!definitions) throw new Error("MAIYA_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (skill.id === MAIYA_MILITARY_ID) {
    if (eventType === "round.ending") return returnSupportFireAtRoundEnd(state, player, definitions);
    if (data.abilityId === "military-support") return beginSupportFire(context);
    return;
  }
  if (skill.id === MAIYA_SUPPORT_FIRE_ID) {
    if (data.abilityId !== "suppressing-fire") throw new Error("MAIYA_SUPPORT_FIRE_ABILITY_INVALID");
    return useSuppressingFire(context);
  }
  if (skill.id === MAIYA_ASCENSION_ID) {
    if (eventType !== "skill.unlocked" || event.playerId !== player.id || event.skillId !== skill.id) return;
    return unlockDessertFanatic(state, player, definitions);
  }
  throw new Error("MAIYA_SKILL_INVALID");
};

export const resolveMaiyaDecision: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("MAIYA_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("MAIYA_DECISION_INVALID");
  return lendSupportFire(state, player, selections[0], definitions);
};

export const isMaiyaLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions) return false;
  if (skill.id === MAIYA_MILITARY_ID) {
    return state.phase === "outpost" && state.activePlayerId === playerId
      && player.locationId !== "mountain" && player.locationId !== "city"
      && supportTargets(state, player).length > 0
      && Boolean(supportFireInOwnerSkillZone(state, player, definitions));
  }
  if (skill.id === MAIYA_SUPPORT_FIRE_ID && ability?.id === "suppressing-fire") {
    const source = controlledActiveSkill(state, player, skill.id, definitions);
    if (!source?.ownerPlayerId || state.phase !== "action" || state.activePlayerId !== playerId) return false;
    return source.ownerPlayerId === playerId || player.victoryPoints >= 2;
  }
  return false;
};
