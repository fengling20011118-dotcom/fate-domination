import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { EffectRuntime } from "../match-engine/effect-runtime.ts";
import {
  MIYU_CARD_SELECTION_ID,
  MIYU_INSTALL_ARCHER_ID,
  MIYU_INSTALL_ASSASSIN_ID,
  MIYU_INSTALL_CASTER_ID,
  MIYU_INSTALL_IDS,
  MIYU_INSTALL_LANCER_ID,
  MIYU_INSTALL_RIDER_ID,
  MIYU_INSTALL_SABER_ID,
} from "../content/miyu-cards.ts";
import type { CardAbilityRegistry } from "./card-abilities.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { addCardToAttack } from "./card-play.ts";
import type { CardDefinition } from "./content-types.ts";
import { createOwnedCardInstance, drawCards, movePlayerCard } from "./decks.ts";
import { listUnusedRandomServantIds } from "./identity-replacement.ts";
import { isOtherPlayerAbilityEffectIgnored } from "./ability-immunity.ts";
import { movePlayerByEffect } from "./board.ts";
import { adjustVictoryPoints, gainVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate, SkillRuntimeCatalog } from "./skill-types.ts";

export const MIYU_HANDLER = "core.miyu-sapphire";
export const MIYU_RESOLVE = "core.miyu-sapphire-resolve";
export const MIYU_SAPPHIRE_SKILL_ID = "master.miyu.skill.s1";
export const MIYU_CARD_SELECTION_SKILL_ID = "master.miyu.skill.s2";
export const MIYU_INSTALL_SKILL_ID = "master.miyu.skill.s3";
export const MIYU_ASCENSION_ID = "master.miyu.skill.ascension";

interface MiyuSapphireState {
  drawnServantIds: string[];
  outsidePoolInstanceIds: string[];
  installInstanceIds: string[];
  selectedSkillIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stateMap(state: GameState): Record<string, MiyuSapphireState> {
  const current = state.modeState.miyuSapphireByPlayer;
  if (current && typeof current === "object" && !Array.isArray(current)) return current as Record<string, MiyuSapphireState>;
  const created: Record<string, MiyuSapphireState> = {};
  state.modeState.miyuSapphireByPlayer = created;
  return created;
}

function readState(state: GameState, playerId: string): MiyuSapphireState | undefined {
  const current = state.modeState.miyuSapphireByPlayer;
  if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
  return (current as Record<string, MiyuSapphireState>)[playerId];
}

function uniqueInstanceId(state: GameState, prefix: string): string {
  let serial = 1;
  while (state.cards[`${prefix}:${serial}`]) serial += 1;
  return `${prefix}:${serial}`;
}

function drawDistinctServants(state: GameState, catalog: SkillRuntimeCatalog, randomInt: (maxExclusive: number) => number): string[] {
  const pool = listUnusedRandomServantIds(state, catalog);
  if (pool.length < 3) throw new Error("MIYU_SAPPHIRE_SERVANT_POOL_INSUFFICIENT");
  const result: string[] = [];
  for (let count = 0; count < 3; count += 1) {
    const index = randomInt(pool.length);
    if (!Number.isInteger(index) || index < 0 || index >= pool.length) throw new Error("MIYU_SAPPHIRE_RANDOM_INVALID");
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

function createOutsidePools(state: GameState, player: PlayerState, servantIds: string[], catalog: SkillRuntimeCatalog): MiyuSapphireState {
  const outsidePoolInstanceIds: string[] = [];
  for (const servantId of servantIds) {
    const deck = catalog.servantDecks[servantId];
    if (!deck?.length) throw new Error("MIYU_SAPPHIRE_SERVANT_DECK_MISSING");
    for (const definitionId of deck) {
      const instance = createOwnedCardInstance(state, player.id, {
        instanceId: uniqueInstanceId(state, `${player.id}:miyu:outside:${servantId}`),
        definitionId,
        originServantId: servantId,
        zone: "removed",
        face: "down",
        active: false,
        createdByEffectId: MIYU_SAPPHIRE_SKILL_ID,
      });
      outsidePoolInstanceIds.push(instance.instanceId);
    }
  }
  const installInstanceIds = MIYU_INSTALL_IDS.map((definitionId) => createOwnedCardInstance(state, player.id, {
    instanceId: uniqueInstanceId(state, `${player.id}:miyu:install`),
    definitionId,
    originMasterId: "master.miyu",
    zone: "removed",
    face: "up",
    active: false,
    createdByEffectId: MIYU_SAPPHIRE_SKILL_ID,
  }).instanceId);
  const data: MiyuSapphireState = { drawnServantIds: [...servantIds], outsidePoolInstanceIds, installInstanceIds, selectedSkillIds: [] };
  stateMap(state)[player.id] = data;
  player.servantIdentityAliases = [...servantIds];
  player.servantClassAliases = [...new Set(servantIds.map((id) => catalog.servantClasses[id]).filter((value): value is string => typeof value === "string" && value.length > 0))];
  return data;
}

function skillCandidates(servantIds: string[], catalog: SkillRuntimeCatalog): string[] {
  const ownerIds = new Set(servantIds);
  return catalog.skillDefinitions
    .filter((skill) => skill.ownerType === "servant" && ownerIds.has(skill.ownerId) && skill.initiallyOwned !== false)
    .map((skill) => skill.id);
}

function openSkillSelection(state: GameState, player: PlayerState, candidates: string[], openDecision: SkillContext["openDecision"]): void {
  if (candidates.length < 3) throw new Error("MIYU_SAPPHIRE_SKILL_POOL_INSUFFICIENT");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${MIYU_SAPPHIRE_SKILL_ID}:skills`;
  state.effectQueue.unshift({
    effectId,
    handlerId: MIYU_RESOLVE,
    sourceId: MIYU_SAPPHIRE_SKILL_ID,
    controllerPlayerId: player.id,
    payload: { stage: "skill-selection", candidateSkillIds: [...candidates] },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "miyu-sapphire-skill-selection",
    options: candidates.map((id) => ({ id, label: id })),
    min: 3,
    max: 3,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function materializeSelectedSkills(state: GameState, player: PlayerState, selectedSkillIds: string[]): string[] {
  const created: string[] = [];
  for (const skillId of selectedSkillIds) {
    const card = createOwnedCardInstance(state, player.id, {
      instanceId: uniqueInstanceId(state, `${player.id}:miyu:copied-skill`),
      definitionId: skillId,
      originServantId: player.servantId ?? undefined,
      zone: "servant-skills",
      face: "down",
      active: false,
      createdByEffectId: MIYU_SAPPHIRE_SKILL_ID,
    });
    card.fullSkillCopy = { sourceId: MIYU_SAPPHIRE_SKILL_ID, sourceSkillId: skillId, rebindNamedOwnerToController: true };
    created.push(card.instanceId);
  }
  return created;
}

function openAscensionDiscard(state: GameState, player: PlayerState, openDecision: SkillContext["openDecision"]): void {
  if (player.hand.length === 0) throw new Error("MIYU_ASCENSION_HAND_EMPTY");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${MIYU_ASCENSION_ID}:discard`;
  state.effectQueue.unshift({
    effectId,
    handlerId: MIYU_RESOLVE,
    sourceId: MIYU_ASCENSION_ID,
    controllerPlayerId: player.id,
    payload: { stage: "ascension-discard", candidateIds: [...player.hand] },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "miyu-spoilt-for-choice-discard",
    options: player.hand.map((id) => ({ id, label: id })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

export const useMiyuSapphire: SkillHandler = ({ state, player, skill, payload, openDecision, randomInt, definitions, runtimeCatalog }) => {
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === MIYU_SAPPHIRE_SKILL_ID && eventType === "game.started") {
    if (!runtimeCatalog || !randomInt) throw new Error("MIYU_SAPPHIRE_SETUP_CONTEXT_REQUIRED");
    if (readState(state, player.id)) return { initialized: false };
    const drawnServantIds = drawDistinctServants(state, runtimeCatalog, randomInt);
    createOutsidePools(state, player, drawnServantIds, runtimeCatalog);
    const candidates = skillCandidates(drawnServantIds, runtimeCatalog);
    openSkillSelection(state, player, candidates, openDecision);
    return { initialized: true, drawnServantIds, candidateSkillIds: candidates };
  }

  if (skill.id === MIYU_ASCENSION_ID && eventType === "skill.unlocked") {
    if (event.playerId !== player.id || event.skillId !== MIYU_ASCENSION_ID) return;
    const sapphire = readState(state, player.id);
    if (!sapphire) throw new Error("MIYU_SAPPHIRE_STATE_MISSING");
    const moved: string[] = [];
    for (const instanceId of sapphire.installInstanceIds) {
      const card = state.cards[instanceId];
      if (!card || card.zone !== "removed") continue;
      movePlayerCard(state, player.id, instanceId, "hand");
      card.face = "up";
      moved.push(instanceId);
    }
    return { installInstanceIds: moved };
  }

  if (skill.id === MIYU_ASCENSION_ID && data.abilityId === "spoilt-for-choice-draw") {
    if (!definitions || !randomInt || state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("MIYU_ASCENSION_WINDOW_INVALID");
    openAscensionDiscard(state, player, openDecision);
    return { pending: true };
  }

  return;
};

export const resolveMiyuSapphireDecision: SkillHandler = ({ state, player, payload, definitions, randomInt }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("MIYU_SAPPHIRE_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  if (decision.status !== "resolved") throw new Error("MIYU_SAPPHIRE_DECISION_INVALID");
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];

  if (previous.stage === "skill-selection") {
    const candidates = Array.isArray(previous.candidateSkillIds) ? previous.candidateSkillIds.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 3 || new Set(selections).size !== 3 || selections.some((id) => !candidates.includes(id))) throw new Error("MIYU_SAPPHIRE_SKILL_SELECTION_INVALID");
    const sapphire = readState(state, player.id);
    if (!sapphire || sapphire.selectedSkillIds.length > 0) throw new Error("MIYU_SAPPHIRE_STATE_INVALID");
    sapphire.selectedSkillIds = [...selections];
    const instanceIds = materializeSelectedSkills(state, player, selections);
    return { selectedSkillIds: selections, instanceIds };
  }

  if (previous.stage === "ascension-discard") {
    if (!definitions || !randomInt || selections.length !== 1) throw new Error("MIYU_ASCENSION_DECISION_INVALID");
    const candidates = Array.isArray(previous.candidateIds) ? previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
    const instanceId = selections[0];
    if (!candidates.includes(instanceId) || !player.hand.includes(instanceId)) throw new Error("MIYU_ASCENSION_DECISION_INVALID");
    movePlayerCard(state, player.id, instanceId, "discard");
    const drawnInstanceIds = drawCards(state, player.id, 2, randomInt, definitions);
    return { discardedInstanceId: instanceId, drawnInstanceIds };
  }

  throw new Error("MIYU_SAPPHIRE_DECISION_INVALID");
};

export const isMiyuSapphireLegal: SkillLegalityPredicate = (state, playerId, skill, ability) => {
  const player = state.players[playerId];
  if (!player) return false;
  if (skill.id === MIYU_ASCENSION_ID && ability?.id === "spoilt-for-choice-draw") {
    return state.phase === "outpost" && state.activePlayerId === playerId && player.hand.length > 0;
  }
  return false;
};

function targetRecord(target: unknown): Record<string, unknown> {
  return isRecord(target) ? target : {};
}

function activeSameFightOpponents(state: GameState, player: PlayerState): PlayerState[] {
  if (!player.locationId) return [];
  return Object.values(state.players).filter((candidate) => candidate.id !== player.id && !candidate.eliminated && candidate.locationId === player.locationId);
}

function skillUsesThisRound(player: PlayerState, definitions: Record<string, CardDefinition>, round: number): number {
  const skillIds = new Set(Object.values(definitions)
    .map((definition) => definition.linkedSkillId ?? (definition.isSkill ? definition.id : undefined))
    .filter((id): id is string => typeof id === "string" && id.length > 0));
  const used = new Set<string>();
  for (const [key, usage] of Object.entries(player.usage)) {
    if (usage.round !== round || usage.used === false || key.startsWith("__")) continue;
    for (const skillId of skillIds) {
      if (key === skillId || key.startsWith(`${skillId}:`)) used.add(skillId);
    }
  }
  return used.size;
}

export function registerMiyuCardAbilities(registry: CardAbilityRegistry, effects?: EffectRuntime): void {
  void effects;
  if (!registry.has("miyu.card-selection-draw")) registry.register("miyu.card-selection-draw", ({ state, playerId, instanceId, definitions, randomInt }) => {
    const player = state.players[playerId];
    if (!player || !player.hand.includes(instanceId) || !randomInt) throw new Error("MIYU_CARD_SELECTION_HAND_REQUIRED");
    movePlayerCard(state, playerId, instanceId, "discard");
    drawCards(state, playerId, 2, randomInt, definitions);
  }, { allowedZones: ["hand"], allowInactive: true, abilityLimit: "unlimited" });

  if (!registry.has("miyu.card-selection-exchange")) registry.register("miyu.card-selection-exchange", ({ state, playerId, instanceId, target }) => {
    const player = state.players[playerId];
    const sapphire = readState(state, playerId);
    const data = targetRecord(target);
    const outsideInstanceId = typeof data.outsideInstanceId === "string" ? data.outsideInstanceId : undefined;
    if (!player || !sapphire || !player.hand.includes(instanceId) || !outsideInstanceId) throw new Error("MIYU_CARD_SELECTION_EXCHANGE_INVALID");
    const allowed = new Set([...sapphire.outsidePoolInstanceIds, ...sapphire.installInstanceIds]);
    const outside = state.cards[outsideInstanceId];
    if (!allowed.has(outsideInstanceId) || !outside || outside.ownerPlayerId !== playerId || outside.zone !== "removed") throw new Error("MIYU_CARD_SELECTION_EXCHANGE_INVALID");
    movePlayerCard(state, playerId, instanceId, "removed");
    movePlayerCard(state, playerId, outsideInstanceId, "hand");
    outside.face = "up";
  }, { allowedZones: ["hand"], allowInactive: true, abilityLimit: "unlimited" });

  if (!registry.has("miyu.install-saber")) registry.register("miyu.install-saber", ({ state, playerId, definitions }) => {
    const player = state.players[playerId];
    if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
    const affected: string[] = [];
    for (const opponent of activeSameFightOpponents(state, player)) {
      for (const instanceId of opponent.attack) {
        const card = state.cards[instanceId];
        const definition = card ? definitions[card.definitionId] : undefined;
        if (!card?.active || card.face !== "up" || !definition || !getCardInstanceAttributes(card, definition, state, definitions).includes("魔术")) continue;
        card.powerModifiers = [
          ...(card.powerModifiers ?? []).filter((modifier) => modifier.id !== `${MIYU_INSTALL_SABER_ID}:${playerId}:${instanceId}:${state.round}`),
          { id: `${MIYU_INSTALL_SABER_ID}:${playerId}:${instanceId}:${state.round}`, sourceId: MIYU_INSTALL_SABER_ID, kind: "set", value: 0, duration: "round" },
        ];
        affected.push(instanceId);
      }
    }
    void affected;
  }, { abilityLimit: "once-per-game" });

  if (!registry.has("miyu.install-lancer")) registry.register("miyu.install-lancer", ({ state, playerId, target, definitions }) => {
    const data = targetRecord(target);
    const locationId = typeof data.locationId === "string" ? data.locationId : undefined;
    if (!locationId || locationId === "workshop") throw new Error("MIYU_LANCER_DESTINATION_INVALID");
    movePlayerByEffect(state, playerId, locationId, definitions);
  }, { abilityLimit: "once-per-game" });

  if (!registry.has("miyu.install-archer")) registry.register("miyu.install-archer", ({ state, playerId }) => {
    const player = state.players[playerId];
    const bonus = Number(player?.flags.deploymentBonus ?? 0);
    if (!player || player.flags.deploymentBonusActive !== true || !Number.isInteger(bonus) || bonus <= 0) throw new Error("MIYU_ARCHER_TERRAIN_INVALID");
    player.flags.deploymentBonus = bonus * 2;
  }, { abilityLimit: "once-per-game" });

  if (!registry.has("miyu.install-rider")) registry.register("miyu.install-rider", ({ state, playerId, target, definitions, emitEvent }) => {
    const player = state.players[playerId];
    const data = targetRecord(target);
    const instanceIds = Array.isArray(data.instanceIds) ? data.instanceIds.filter((id): id is string => typeof id === "string") : [];
    if (!player || instanceIds.length > 3 || new Set(instanceIds).size !== instanceIds.length) throw new Error("MIYU_RIDER_SELECTION_INVALID");
    for (const instanceId of instanceIds) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || !definition || !player.hand.includes(instanceId) || Number(definition.basePower ?? 0) > 3
        || (MIYU_INSTALL_IDS as readonly string[]).includes(definition.id)) throw new Error("MIYU_RIDER_SELECTION_INVALID");
    }
    for (const instanceId of instanceIds) {
      const card = state.cards[instanceId];
      const definition = definitions[card.definitionId];
      const { paidMana } = addCardToAttack(state, playerId, instanceId, definitions, { payCost: true, allowedSourceZones: ["hand"], bypassFaceUpPlayLimit: true, bypassTiming: true });
      emitEvent?.("card.played", { playerId, instanceId, definitionId: definition.id, face: "up", paidMana, method: "miyu-rider-install" });
      emitEvent?.("card.used", { playerId, instanceId, definitionId: definition.id, locationId: player.locationId, method: "miyu-rider-install" });
    }
  }, { abilityLimit: "once-per-game" });

  if (!registry.has("miyu.install-assassin")) registry.register("miyu.install-assassin", ({ state, playerId, definitions }) => {
    const player = state.players[playerId];
    if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
    for (const opponent of activeSameFightOpponents(state, player)) {
      if (isOtherPlayerAbilityEffectIgnored(state, playerId, opponent.id, MIYU_INSTALL_ASSASSIN_ID)) continue;
      const amount = Math.min(skillUsesThisRound(opponent, definitions, state.round), opponent.victoryPoints);
      if (amount <= 0) continue;
      adjustVictoryPoints(opponent, -amount);
      gainVictoryPoints(player, amount);
    }
  }, { abilityLimit: "once-per-game" });
}
