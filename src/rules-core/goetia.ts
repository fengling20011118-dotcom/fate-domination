import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import {
  GOETIA_BAAL_ID,
  GOETIA_BARBATOS_ID,
  GOETIA_DEMON_GOD_IDS,
  GOETIA_DEMON_GOD_TAG,
  GOETIA_FLAUROS_ID,
  GOETIA_FORNEUS_ID,
  GOETIA_PHENEX_ID,
  GOETIA_RAUM_ID,
  GOETIA_ZEPAR_ID,
} from "../content/goetia-cards.ts";
import { movePlayerByEffect } from "./board.ts";
import { addCardToAttack } from "./card-play.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import type { CardDefinition } from "./content-types.ts";
import { closePlayerCard, createDerivedCardInstance, drawCards, movePlayerCard, removePhysicalCardFromGame, shufflePlayerDeck } from "./decks.ts";
import { eliminatePlayerByEffect } from "./elimination.ts";
import { payMana } from "./costs.ts";
import { gainMana, gainVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const GOETIA_COLLECTIVE_ID = "master.goetia.skill.s1";
export const GOETIA_DEMON_GODS_ID = "master.goetia.skill.s2";
export const GOETIA_TEMPLE_ID = "master.goetia.skill.ascension";
export const GOETIA_HANDLER = "core.goetia-demon-gods";
export const GOETIA_RESOLVE = "core.goetia-demon-gods-resolve";

export const GOETIA_PHENEX_ABILITY = "phenex-regeneration";
export const GOETIA_FORNEUS_ABILITY = "forneus-invocation";
export const GOETIA_FLAUROS_ABILITY = "flauros-conversion";
export const GOETIA_RAUM_ABILITY = "raum-dream-flight";
export const GOETIA_BARBATOS_ABILITY = "barbatos-future-sight";
export const GOETIA_TEMPLE_DRAW_ABILITY = "temple-demon-god-summoning";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function demonCards(state: GameState, player: PlayerState) {
  return Object.values(state.cards).filter((card) => card.ownerPlayerId === player.id
    && GOETIA_DEMON_GOD_IDS.includes(card.definitionId as typeof GOETIA_DEMON_GOD_IDS[number]));
}

function activeDemon(state: GameState, player: PlayerState, definitionId: string) {
  return demonCards(state, player).find((card) => card.definitionId === definitionId
    && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up");
}

function activeDemons(state: GameState, player: PlayerState) {
  return demonCards(state, player).filter((card) => card.controllerPlayerId === player.id
    && card.zone === "attack" && card.active && card.face === "up");
}

function shuffleOwnedCardIntoDeck(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  randomInt: (maxExclusive: number) => number,
) {
  movePlayerCard(state, player.id, instanceId, "deck");
  shufflePlayerDeck(state, player.id, randomInt);
}

function templeSource(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return [...player.masterSkills, ...player.attack].map((id) => state.cards[id]).find((card) => {
    if (!card || card.ownerPlayerId !== player.id || card.zone === "removed") return false;
    const definition = definitions[card.definitionId];
    return card.definitionId === GOETIA_TEMPLE_ID || definition?.linkedSkillId === GOETIA_TEMPLE_ID;
  });
}

function activeTemple(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  const source = templeSource(state, player, definitions);
  return source?.zone === "attack" && source.active && source.face === "up" ? source : undefined;
}

function installBaalRule(state: GameState, player: PlayerState): void {
  const baal = activeDemon(state, player, GOETIA_BAAL_ID);
  if (!baal) return;
  const id = `${GOETIA_DEMON_GODS_ID}:baal:${baal.instanceId}`;
  if ((player.cardRuleModifiers ?? []).some((modifier) => modifier.id === id)) return;
  addCardRuleModifier(player, {
    id,
    sourceId: GOETIA_DEMON_GODS_ID,
    sourceInstanceId: baal.instanceId,
    targetDefinitionIds: [...GOETIA_DEMON_GOD_IDS],
    grantStandardAppend: true,
    sameBatchOtherAttackCostReduction: { excludeTag: GOETIA_DEMON_GOD_TAG },
    duration: "while-source-active",
  });
}

function installBarbatosRule(state: GameState, player: PlayerState): void {
  const barbatos = activeDemon(state, player, GOETIA_BARBATOS_ID);
  if (!barbatos) return;
  player.flags.commandSealGainManaSubstitution = 4;
  player.flags.commandSealGainManaSubstitutionSourceInstanceId = barbatos.instanceId;
  player.flags.commandSealLossManaSubstitution = 4;
  player.flags.commandSealLossManaSubstitutionSourceInstanceId = barbatos.instanceId;
  player.flags.commandSealCostManaSubstitution = 4;
  player.flags.commandSealCostManaSubstitutionSourceInstanceId = barbatos.instanceId;
}

function setupCollectiveConsciousness(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  player.commandSeals = 0;
  player.flags.commandSealMaximum = 0;
  const created: string[] = [];
  for (const definitionId of GOETIA_DEMON_GOD_IDS) {
    if (!definitions[definitionId]) throw new Error(`GOETIA_DEMON_GOD_DEFINITION_MISSING:${definitionId}`);
    const existing = demonCards(state, player).find((card) => card.definitionId === definitionId && card.zone !== "removed");
    if (existing) continue;
    const instanceId = `${player.id}:${definitionId.split(".").at(-1)}`;
    createDerivedCardInstance(state, player.id, {
      instanceId,
      definitionId,
      originMasterId: "master.goetia",
      zone: "attack",
      face: "up",
      active: true,
      residual: true,
      sourceEffectId: GOETIA_COLLECTIVE_ID,
    });
    created.push(instanceId);
  }
  installBaalRule(state, player);
  installBarbatosRule(state, player);
  return { createdInstanceIds: created };
}

function openDecision(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  stage: string,
  payload: Record<string, unknown>,
  options: PendingDecision["options"],
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: GOETIA_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  decisionOpen({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `goetia-${stage}`,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function roundEndDemonRemoval(
  state: GameState,
  player: PlayerState,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  if (Number(player.flags.combatWinRound ?? -1) === state.round) return { skipped: true, reason: "won-fight" };
  if (Number(player.flags.goetiaSkipDemonRemovalRound ?? -1) === state.round) return { skipped: true, reason: "demon-effect" };
  const candidates = activeDemons(state, player);
  if (candidates.length === 0) return eliminatePlayerByEffect(state, player.id);
  if (candidates.length === 1) {
    removePhysicalCardFromGame(state, candidates[0].instanceId);
    return { removedInstanceId: candidates[0].instanceId };
  }
  openDecision(state, player, GOETIA_COLLECTIVE_ID, "round-end-remove", { candidates: candidates.map((card) => card.instanceId) },
    candidates.map((card) => ({ id: card.instanceId, label: card.definitionId.split(".").at(-1) ?? "Demon God" })), decisionOpen);
  return { pending: true };
}

function playableHandIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  return player.hand.filter((instanceId) => {
    try {
      const draft = structuredClone(state) as GameState;
      addCardToAttack(draft, player.id, instanceId, definitions, {
        payCost: true,
        allowedSourceZones: ["hand"],
        bypassFaceUpPlayLimit: true,
        bypassTiming: true,
      });
      return true;
    } catch {
      return false;
    }
  });
}

function beginPhenex(
  state: GameState,
  player: PlayerState,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  if (!activeDemon(state, player, GOETIA_PHENEX_ID)) throw new Error("GOETIA_PHENEX_INACTIVE");
  const candidates = activeDemons(state, player).filter((card) => card.definitionId !== GOETIA_PHENEX_ID);
  if (candidates.length === 0) throw new Error("GOETIA_PHENEX_NO_TARGET");
  if (candidates.length === 1) {
    removePhysicalCardFromGame(state, candidates[0].instanceId);
    return { removedInstanceId: candidates[0].instanceId, manaGained: gainMana(player, 6) };
  }
  openDecision(state, player, GOETIA_DEMON_GODS_ID, "phenex-target", { candidates: candidates.map((card) => card.instanceId) },
    candidates.map((card) => ({ id: card.instanceId, label: card.definitionId.split(".").at(-1) ?? "Demon God" })), decisionOpen);
  return { pending: true };
}

function beginForneus(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const forneus = activeDemon(state, player, GOETIA_FORNEUS_ID);
  if (!forneus) throw new Error("GOETIA_FORNEUS_INACTIVE");
  const closeCandidates = player.attack.filter((instanceId) => {
    if (instanceId === forneus.instanceId) return false;
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card?.active && card.face === "up" && definition && definition.cannotDeactivate !== true && !definition.tags?.includes("never-deactivate"));
  });
  const playCandidates = playableHandIds(state, player, definitions);
  if (closeCandidates.length === 0 || playCandidates.length === 0) throw new Error("GOETIA_FORNEUS_REQUIREMENTS_UNMET");
  openDecision(state, player, GOETIA_DEMON_GODS_ID, "forneus-close", {
    forneusInstanceId: forneus.instanceId,
    closeCandidates,
    playCandidates,
  }, closeCandidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId })), decisionOpen);
  return { pending: true };
}

function resolveForneusPlay(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
) {
  if (!playableHandIds(state, player, definitions).includes(instanceId)) throw new Error("GOETIA_FORNEUS_PLAY_INVALID");
  const result = addCardToAttack(state, player.id, instanceId, definitions, {
    payCost: true,
    allowedSourceZones: ["hand"],
    bypassFaceUpPlayLimit: true,
    bypassTiming: true,
  });
  addCardRuleModifier(player, {
    id: `${GOETIA_DEMON_GODS_ID}:forneus-action:${state.round}:${instanceId}`,
    sourceId: GOETIA_DEMON_GODS_ID,
    targetDefinitionIds: [state.cards[instanceId].definitionId],
    targetInstanceIds: [instanceId],
    allowActionAbilityInCombat: true,
    duration: "round",
  });
  emitEvent?.("card.played", {
    playerId: player.id,
    instanceId,
    definitionId: state.cards[instanceId].definitionId,
    face: "up",
    paidMana: result.paidMana,
    method: "goetia-forneus",
  });
  return { playedInstanceId: instanceId, paidMana: result.paidMana };
}

function useFlauros(state: GameState, player: PlayerState, randomInt: (maxExclusive: number) => number) {
  const flauros = activeDemon(state, player, GOETIA_FLAUROS_ID);
  if (!flauros) throw new Error("GOETIA_FLAUROS_INACTIVE");
  shuffleOwnedCardIntoDeck(state, player, flauros.instanceId, randomInt);
  player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 5;
  return { shuffledInstanceId: flauros.instanceId, totalPowerBonus: 5 };
}

function beginRaum(
  state: GameState,
  player: PlayerState,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const raum = demonCards(state, player).find((card) => card.definitionId === GOETIA_RAUM_ID && (card.zone === "hand" || (card.zone === "attack" && card.active)));
  if (!raum) throw new Error("GOETIA_RAUM_NOT_AVAILABLE");
  const locations = Object.keys(state.board.locations).filter((id) => ["workshop", "mountain", "city", "scouting"].includes(id));
  openDecision(state, player, GOETIA_DEMON_GODS_ID, "raum-location", { raumInstanceId: raum.instanceId, locations },
    locations.map((id) => ({ id, label: id })), decisionOpen);
  return { pending: true };
}

function useBarbatos(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, randomInt: (maxExclusive: number) => number) {
  const barbatos = activeDemon(state, player, GOETIA_BARBATOS_ID);
  if (!barbatos) throw new Error("GOETIA_BARBATOS_INACTIVE");
  shuffleOwnedCardIntoDeck(state, player, barbatos.instanceId, randomInt);
  const skillDefinitionIds = Object.values(definitions).filter((definition) => definition.isSkill === true).map((definition) => definition.id);
  if (skillDefinitionIds.length > 0) addCardRuleModifier(player, {
    id: `${GOETIA_DEMON_GODS_ID}:barbatos-eight-mana:${state.round}`,
    sourceId: GOETIA_DEMON_GODS_ID,
    targetDefinitionIds: skillDefinitionIds,
    waiveEightMana: true,
    duration: "round",
  });
  const noblePhantasmDefinitionIds = Object.values(definitions).filter((definition) => definition.attributes?.includes("宝具")).map((definition) => definition.id);
  if (noblePhantasmDefinitionIds.length > 0) addCardRuleModifier(player, {
    id: `${GOETIA_DEMON_GODS_ID}:barbatos-situation:${state.round}`,
    sourceId: GOETIA_DEMON_GODS_ID,
    targetDefinitionIds: noblePhantasmDefinitionIds,
    ignoreSituationRestrictions: true,
    duration: "round",
  });
  return { shuffledInstanceId: barbatos.instanceId };
}

function handleZeparLoss(
  state: GameState,
  player: PlayerState,
  event: Record<string, unknown>,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const zepar = activeDemon(state, player, GOETIA_ZEPAR_ID);
  if (!zepar) return;
  const participants = Array.isArray(event.participantIds) ? event.participantIds : [];
  const winners = Array.isArray(event.winnerIds) ? event.winnerIds : [];
  if (!participants.includes(player.id) || winners.includes(player.id)) return;
  openDecision(state, player, GOETIA_DEMON_GODS_ID, "zepar-loss", { zeparInstanceId: zepar.instanceId }, [
    { id: "shuffle", label: "Shuffle Zepar into deck and gain 2 VP" },
    { id: "decline", label: "Decline" },
  ], decisionOpen);
  return { pending: true };
}

function handleRaumCombatEnd(
  state: GameState,
  player: PlayerState,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const raum = activeDemon(state, player, GOETIA_RAUM_ID);
  if (!raum || player.locationId !== "scouting") return;
  openDecision(state, player, GOETIA_DEMON_GODS_ID, "raum-recon", { raumInstanceId: raum.instanceId }, [
    { id: "hand", label: "Return Raum to hand" },
    { id: "decline", label: "Decline" },
  ], decisionOpen);
  return { pending: true };
}

function boostDemonOnPlay(state: GameState, player: PlayerState, event: Record<string, unknown>, definitions: Record<string, CardDefinition>) {
  if (!activeTemple(state, player, definitions)) return;
  if (event.playerId !== player.id || typeof event.instanceId !== "string") return;
  const card = state.cards[event.instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !definition?.tags?.includes(GOETIA_DEMON_GOD_TAG)) return;
  if (definition.powerImmutable === true) return { instanceId: card.instanceId, powerGained: 0 };
  card.powerModifiers ??= [];
  card.powerModifiers.push({
    id: `${GOETIA_TEMPLE_ID}:on-play:${state.round}:${card.playCount ?? 0}:${card.instanceId}`,
    sourceId: GOETIA_TEMPLE_ID,
    kind: "add",
    value: 4,
    duration: "game",
  });
  return { instanceId: card.instanceId, powerGained: 4 };
}

function activateTemple(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  const temple = templeSource(state, player, definitions);
  if (!temple) throw new Error("GOETIA_TEMPLE_CARD_MISSING");
  if (temple.zone !== "attack") movePlayerCard(state, player.id, temple.instanceId, "attack");
  temple.face = "up";
  temple.active = true;
  temple.residual = true;
  temple.playedRound = state.round;
  return { templeInstanceId: temple.instanceId };
}

function templeOutpost(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, randomInt: (maxExclusive: number) => number) {
  if (!activeTemple(state, player, definitions)) throw new Error("GOETIA_TEMPLE_INACTIVE");
  if (demonCards(state, player).some((card) => card.zone === "hand")) throw new Error("GOETIA_TEMPLE_DEMON_IN_HAND");
  payMana(player, 1, "GOETIA_TEMPLE_MANA_REQUIRED");
  const discardedInstanceIds = [...player.hand];
  for (const instanceId of discardedInstanceIds) movePlayerCard(state, player.id, instanceId, "discard");
  const drawnInstanceIds = drawCards(state, player.id, 3, randomInt, definitions);
  return { discardedInstanceIds, drawnInstanceIds, manaPaid: 1 };
}

export const useGoetiaDemonGods: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions, openDecision: decisionOpen, randomInt = () => 0, emitEvent } = context;
  if (!definitions) throw new Error("GOETIA_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === GOETIA_COLLECTIVE_ID) {
    if (eventType === "game.started") return setupCollectiveConsciousness(state, player, definitions);
    if (eventType === "round.ending") return roundEndDemonRemoval(state, player, decisionOpen);
    return;
  }
  if (skill.id === GOETIA_DEMON_GODS_ID) {
    if (eventType === "combat.resolved") return handleZeparLoss(state, player, event, decisionOpen);
    if (eventType === "combat.ending") return handleRaumCombatEnd(state, player, decisionOpen);
    if (eventType === "card.played") {
      if (event.playerId === player.id && typeof event.instanceId === "string") {
        const played = state.cards[event.instanceId];
        if (played && definitions[played.definitionId]?.tags?.includes(GOETIA_DEMON_GOD_TAG)) {
          installBaalRule(state, player);
          installBarbatosRule(state, player);
        }
      }
      return;
    }
    if (data.abilityId === GOETIA_PHENEX_ABILITY) return beginPhenex(state, player, decisionOpen);
    if (data.abilityId === GOETIA_FORNEUS_ABILITY) return beginForneus(state, player, definitions, randomInt, decisionOpen);
    if (data.abilityId === GOETIA_FLAUROS_ABILITY) return useFlauros(state, player, randomInt);
    if (data.abilityId === GOETIA_RAUM_ABILITY) return beginRaum(state, player, decisionOpen);
    if (data.abilityId === GOETIA_BARBATOS_ABILITY) return useBarbatos(state, player, definitions, randomInt);
    return;
  }
  if (skill.id === GOETIA_TEMPLE_ID) {
    if (eventType === "skill.unlocked" && event.playerId === player.id && event.skillId === skill.id) return activateTemple(state, player, definitions);
    if (eventType === "card.played") return boostDemonOnPlay(state, player, event, definitions);
    if (data.abilityId === GOETIA_TEMPLE_DRAW_ABILITY) return templeOutpost(state, player, definitions, randomInt);
  }
};

export const isGoetiaDemonGodsLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || !ability) return false;
  if (skill.id === GOETIA_DEMON_GODS_ID) {
    if (ability.id === GOETIA_PHENEX_ABILITY) return Boolean(activeDemon(state, player, GOETIA_PHENEX_ID)
      && activeDemons(state, player).some((card) => card.definitionId !== GOETIA_PHENEX_ID));
    if (ability.id === GOETIA_FORNEUS_ABILITY) return Boolean(activeDemon(state, player, GOETIA_FORNEUS_ID)
      && player.attack.some((id) => id !== activeDemon(state, player, GOETIA_FORNEUS_ID)?.instanceId && state.cards[id]?.active)
      && playableHandIds(state, player, definitions).length > 0);
    if (ability.id === GOETIA_FLAUROS_ABILITY) return Boolean(activeDemon(state, player, GOETIA_FLAUROS_ID));
    if (ability.id === GOETIA_RAUM_ABILITY) return demonCards(state, player).some((card) => card.definitionId === GOETIA_RAUM_ID
      && (card.zone === "hand" || (card.zone === "attack" && card.active)));
    if (ability.id === GOETIA_BARBATOS_ABILITY) return Boolean(activeDemon(state, player, GOETIA_BARBATOS_ID));
  }
  if (skill.id === GOETIA_TEMPLE_ID && ability.id === GOETIA_TEMPLE_DRAW_ABILITY) {
    return Boolean(activeTemple(state, player, definitions)
      && !demonCards(state, player).some((card) => card.zone === "hand")
      && (player.flags.infiniteMana === true || player.mana >= 1));
  }
  return false;
};

export const resolveGoetiaDecision: SkillHandler = ({ state, player, payload, definitions, openDecision: decisionOpen, randomInt = () => 0, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("GOETIA_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error("GOETIA_DECISION_INVALID");
  const selected = selections[0];

  if (previous.stage === "round-end-remove") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selected) || !activeDemons(state, player).some((card) => card.instanceId === selected)) throw new Error("GOETIA_ROUND_END_TARGET_INVALID");
    removePhysicalCardFromGame(state, selected);
    return { removedInstanceId: selected };
  }
  if (previous.stage === "phenex-target") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selected) || !activeDemons(state, player).some((card) => card.instanceId === selected && card.definitionId !== GOETIA_PHENEX_ID)) throw new Error("GOETIA_PHENEX_TARGET_INVALID");
    removePhysicalCardFromGame(state, selected);
    return { removedInstanceId: selected, manaGained: gainMana(player, 6) };
  }
  if (previous.stage === "forneus-close") {
    const closeCandidates = Array.isArray(previous.closeCandidates) ? previous.closeCandidates.filter((id): id is string => typeof id === "string") : [];
    const playCandidates = Array.isArray(previous.playCandidates) ? previous.playCandidates.filter((id): id is string => typeof id === "string") : [];
    const forneusInstanceId = typeof previous.forneusInstanceId === "string" ? previous.forneusInstanceId : undefined;
    if (!forneusInstanceId || !closeCandidates.includes(selected) || !activeDemon(state, player, GOETIA_FORNEUS_ID)) throw new Error("GOETIA_FORNEUS_CLOSE_INVALID");
    shuffleOwnedCardIntoDeck(state, player, forneusInstanceId, randomInt);
    closePlayerCard(state, player.id, selected, definitions);
    const stillPlayable = playCandidates.filter((id) => playableHandIds(state, player, definitions).includes(id));
    if (stillPlayable.length === 0) throw new Error("GOETIA_FORNEUS_PLAY_UNAVAILABLE");
    openDecision(state, player, GOETIA_DEMON_GODS_ID, "forneus-play", { playCandidates: stillPlayable },
      stillPlayable.map((id) => ({ id, label: definitions[state.cards[id].definitionId]?.name ?? id })), decisionOpen);
    return { pending: true, shuffledInstanceId: forneusInstanceId, closedInstanceId: selected };
  }
  if (previous.stage === "forneus-play") {
    const candidates = Array.isArray(previous.playCandidates) ? previous.playCandidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selected)) throw new Error("GOETIA_FORNEUS_PLAY_INVALID");
    return resolveForneusPlay(state, player, selected, definitions, emitEvent);
  }
  if (previous.stage === "raum-location") {
    const raumInstanceId = typeof previous.raumInstanceId === "string" ? previous.raumInstanceId : undefined;
    const locations = Array.isArray(previous.locations) ? previous.locations.filter((id): id is string => typeof id === "string") : [];
    if (!raumInstanceId || !locations.includes(selected)) throw new Error("GOETIA_RAUM_LOCATION_INVALID");
    const raum = state.cards[raumInstanceId];
    if (!raum || raum.definitionId !== GOETIA_RAUM_ID || (raum.zone !== "hand" && !(raum.zone === "attack" && raum.active))) throw new Error("GOETIA_RAUM_NOT_AVAILABLE");
    movePlayerCard(state, player.id, raum.instanceId, "discard");
    const movement = movePlayerByEffect(state, player.id, selected, definitions, { ignoreDestinationCapacity: false });
    emitEvent?.("player.moved", { playerId: player.id, previousLocationId: movement.previousLocationId, locationId: movement.locationId, method: "effect", sourceSkillId: GOETIA_DEMON_GODS_ID });
    return { discardedInstanceId: raum.instanceId, ...movement };
  }
  if (previous.stage === "zepar-loss") {
    if (selected === "decline") return { declined: true };
    if (selected !== "shuffle" || typeof previous.zeparInstanceId !== "string") throw new Error("GOETIA_ZEPAR_DECISION_INVALID");
    const zepar = activeDemon(state, player, GOETIA_ZEPAR_ID);
    if (!zepar || zepar.instanceId !== previous.zeparInstanceId) throw new Error("GOETIA_ZEPAR_INACTIVE");
    shuffleOwnedCardIntoDeck(state, player, zepar.instanceId, randomInt);
    player.flags.goetiaSkipDemonRemovalRound = state.round;
    return { shuffledInstanceId: zepar.instanceId, victoryPointsGained: gainVictoryPoints(player, 2) };
  }
  if (previous.stage === "raum-recon") {
    if (selected === "decline") return { declined: true };
    if (selected !== "hand" || typeof previous.raumInstanceId !== "string") throw new Error("GOETIA_RAUM_RECON_DECISION_INVALID");
    const raum = activeDemon(state, player, GOETIA_RAUM_ID);
    if (!raum || raum.instanceId !== previous.raumInstanceId || player.locationId !== "scouting") throw new Error("GOETIA_RAUM_RECON_INVALID");
    movePlayerCard(state, player.id, raum.instanceId, "hand");
    player.flags.goetiaSkipDemonRemovalRound = state.round;
    return { handInstanceId: raum.instanceId };
  }
  throw new Error("GOETIA_DECISION_STAGE_INVALID");
};
