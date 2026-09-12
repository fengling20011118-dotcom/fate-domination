import type { GameState, PlayerState } from "../domain/state/types.ts";
import { removePlayerFromBoardByEffect } from "./board.ts";
import { addCardToAttack } from "./card-play.ts";
import { assertCardCanEnterAttack } from "./card-rules.ts";
import { getStructuredCardName } from "./card-transforms.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { installCombatWinnerChallenge } from "./combat-winner-challenge.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardPlayCost } from "./costs.ts";
import { closePlayerCard } from "./decks.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ISHTAR_DIVINE_AUTHORITY_ID = "servant.ishtar.skill.sc-ishtar-1";
export const ISHTAR_AN_GAL_ID = "servant.ishtar.skill.sc-ishtar-2";
export const ISHTAR_DIVINE_AUTHORITY_HANDLER = "core.ishtar-divine-authority";
export const ISHTAR_DIVINE_AUTHORITY_RESOLVE = "core.ishtar-divine-authority-resolve";
export const ISHTAR_AN_GAL_HANDLER = "core.ishtar-an-gal-ta-kigal-she";
export const ISHTAR_AN_GAL_RESOLVE = "core.ishtar-an-gal-ta-kigal-she-resolve";

const DIVINE_SWAP = "divine-authority-swap";
const AN_GAL_CHALLENGE = "an-gal-challenge";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeSkillInstance(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && matchesSkill(definition, card.definitionId, skillId));
  });
}

function isLuck(state: GameState, player: PlayerState, instanceId: string, definitions: Record<string, CardDefinition>): boolean {
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  return Boolean(card && definition && getStructuredCardName(state, player.id, definition, definitions) === "幸运");
}

function activeLuckIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && isLuck(state, player, instanceId, definitions));
  });
}

function actionAbilityIds(definition: CardDefinition): string[] {
  return definition.phases?.includes("action") ? [...(definition.cardAbilityIds ?? [])] : [];
}

function playableLuckIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || card.ownerPlayerId !== player.id || !isLuck(state, player, instanceId, definitions) || actionAbilityIds(definition).length === 0) return false;
    try {
      assertCardCanEnterAttack({ state, playerId: player.id, instanceId, definitions, faceDown: false, allowedSourceZones: ["hand"], bypassTiming: true });
      const cost = getCardPlayCost(state, definition, player, card, definitions);
      return player.flags.infiniteMana === true || player.mana >= cost;
    } catch {
      return false;
    }
  });
}

function openDivineDecision(
  state: GameState,
  player: PlayerState,
  stage: "close" | "play",
  candidates: string[],
  previous: Record<string, unknown>,
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  if (candidates.length === 0) throw new Error(stage === "close" ? "ISHTAR_DIVINE_NO_ACTIVE_LUCK" : "ISHTAR_DIVINE_NO_PLAYABLE_LUCK");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${ISHTAR_DIVINE_AUTHORITY_ID}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: ISHTAR_DIVINE_AUTHORITY_RESOLVE,
    sourceId: ISHTAR_DIVINE_AUTHORITY_ID,
    controllerPlayerId: player.id,
    payload: { stage, candidates: [...candidates], ...previous },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `ishtar-divine-authority-${stage}`,
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function applyDivineSwap(
  state: GameState,
  player: PlayerState,
  closeInstanceId: string,
  playInstanceId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent?: Parameters<SkillHandler>[0]["emitEvent"],
): { closeInstanceId: string; playInstanceId: string; paidMana: number; mandatoryAbilityIds: string[] } {
  if (!activeLuckIds(state, player, definitions).includes(closeInstanceId)) throw new Error("ISHTAR_DIVINE_CLOSE_TARGET_INVALID");
  if (!playableLuckIds(state, player, definitions).includes(playInstanceId)) throw new Error("ISHTAR_DIVINE_PLAY_TARGET_INVALID");
  const definition = definitions[state.cards[playInstanceId].definitionId];
  const mandatoryAbilityIds = actionAbilityIds(definition);
  closePlayerCard(state, player.id, closeInstanceId, definitions);
  const { paidMana } = addCardToAttack(state, player.id, playInstanceId, definitions, {
    payCost: true,
    allowedSourceZones: ["hand"],
    bypassFaceUpPlayLimit: true,
    bypassTiming: true,
  });
  addCardRuleModifier(player, {
    id: `${ISHTAR_DIVINE_AUTHORITY_ID}:action-in-combat:${playInstanceId}:${state.round}`,
    sourceId: ISHTAR_DIVINE_AUTHORITY_ID,
    targetDefinitionIds: [definition.id],
    targetInstanceIds: [playInstanceId],
    allowActionAbilityInCombat: true,
    mandatoryActionAbilityInCombatIds: mandatoryAbilityIds,
    duration: "round",
  });
  const card = state.cards[playInstanceId];
  emitEvent?.("card.played", {
    playerId: player.id,
    instanceId: playInstanceId,
    definitionId: definition.id,
    face: "up",
    paidMana,
    attributes: getCardInstanceAttributes(card, definition, state, definitions),
    method: "ishtar-divine-authority",
  });
  emitEvent?.("card.used", {
    playerId: player.id,
    instanceId: playInstanceId,
    definitionId: definition.id,
    locationId: player.locationId,
    attributes: getCardInstanceAttributes(card, definition, state, definitions),
    method: "ishtar-divine-authority",
  });
  return { closeInstanceId, playInstanceId, paidMana, mandatoryAbilityIds };
}

export const useIshtarDivineAuthority: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions) throw new Error("ISHTAR_DIVINE_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== DIVINE_SWAP || state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("ISHTAR_DIVINE_WINDOW_INVALID");
  const closeInstanceId = typeof data.closeInstanceId === "string" ? data.closeInstanceId : undefined;
  const playInstanceId = typeof data.playInstanceId === "string" ? data.playInstanceId : undefined;
  if (closeInstanceId && playInstanceId) return applyDivineSwap(state, player, closeInstanceId, playInstanceId, definitions, emitEvent);
  if (closeInstanceId || playInstanceId) throw new Error("ISHTAR_DIVINE_SELECTION_INCOMPLETE");
  openDivineDecision(state, player, "close", activeLuckIds(state, player, definitions), {}, definitions, openDecision);
  return { pendingDecision: true };
};

export const resolveIshtarDivineAuthority: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("ISHTAR_DIVINE_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const stage = previous.stage;
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("ISHTAR_DIVINE_DECISION_INVALID");
  if (stage === "close") {
    if (!activeLuckIds(state, player, definitions).includes(selections[0])) throw new Error("ISHTAR_DIVINE_CLOSE_TARGET_INVALID");
    openDivineDecision(state, player, "play", playableLuckIds(state, player, definitions), { closeInstanceId: selections[0] }, definitions, openDecision);
    return { pendingDecision: true };
  }
  if (stage === "play") {
    const closeInstanceId = typeof previous.closeInstanceId === "string" ? previous.closeInstanceId : undefined;
    if (!closeInstanceId) throw new Error("ISHTAR_DIVINE_DECISION_INVALID");
    return applyDivineSwap(state, player, closeInstanceId, selections[0], definitions, emitEvent);
  }
  throw new Error("ISHTAR_DIVINE_DECISION_INVALID");
};

export const isIshtarDivineAuthorityLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === DIVINE_SWAP && state.phase === "combat" && state.activePlayerId === playerId
    && activeLuckIds(state, player, definitions).length > 0 && playableLuckIds(state, player, definitions).length > 0);
};

function challengeLocations(state: GameState): Array<"mountain" | "city"> {
  return (["mountain", "city"] as const).filter((locationId) => (state.board.locations[locationId] ?? []).some((playerId) => !state.players[playerId]?.eliminated));
}

function installAnGalChallenge(state: GameState, player: PlayerState, skillId: string, locationId: "mountain" | "city", sourceInstanceId: string) {
  if (!challengeLocations(state).includes(locationId)) throw new Error("ISHTAR_AN_GAL_LOCATION_INVALID");
  return installCombatWinnerChallenge(state, {
    sourceId: skillId,
    sourceInstanceId,
    playerId: player.id,
    locationId,
    powerMode: "controller-current-combat-power",
    strictHigher: true,
    rewardMode: "competition-only",
  });
}

function openAnGalLocationDecision(
  state: GameState,
  player: PlayerState,
  sourceInstanceId: string,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const locations = challengeLocations(state);
  if (locations.length === 0) throw new Error("ISHTAR_AN_GAL_NO_BATTLEFIELD");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${ISHTAR_AN_GAL_ID}:location`;
  state.effectQueue.unshift({
    effectId,
    handlerId: ISHTAR_AN_GAL_RESOLVE,
    sourceId: ISHTAR_AN_GAL_ID,
    controllerPlayerId: player.id,
    payload: { locations, sourceInstanceId },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "ishtar-an-gal-battlefield",
    options: locations.map((id) => ({ id, label: id })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

export const useIshtarAnGalTaKigalShe: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("ISHTAR_AN_GAL_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "card.played") {
    const definitionId = typeof event.definitionId === "string" ? event.definitionId : undefined;
    const playedDefinition = definitionId ? definitions[definitionId] : undefined;
    if (event.playerId !== player.id || event.face !== "up" || !definitionId || !matchesSkill(playedDefinition, definitionId, skill.id)) return;
    if (!player.locationId) return;
    try {
      return { removed: true, ...removePlayerFromBoardByEffect(state, player.id, definitions) };
    } catch (error) {
      if (error instanceof Error && error.message === "PLAYER_BOARD_EXIT_BLOCKED") return { removed: false, prevented: true };
      throw error;
    }
  }
  if (data.abilityId !== AN_GAL_CHALLENGE || state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("ISHTAR_AN_GAL_WINDOW_INVALID");
  const source = activeSkillInstance(state, player, skill.id, definitions);
  if (!source) throw new Error("ISHTAR_AN_GAL_SOURCE_INACTIVE");
  const locationId = data.locationId === "mountain" || data.locationId === "city" ? data.locationId : undefined;
  if (locationId) return installAnGalChallenge(state, player, skill.id, locationId, source.instanceId);
  openAnGalLocationDecision(state, player, source.instanceId, openDecision);
  return { pendingDecision: true };
};

export const resolveIshtarAnGalTaKigalShe: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("ISHTAR_AN_GAL_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const locations = Array.isArray(previous.locations) ? previous.locations.filter((id): id is "mountain" | "city" => id === "mountain" || id === "city") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is "mountain" | "city" => id === "mountain" || id === "city") : [];
  const sourceInstanceId = typeof previous.sourceInstanceId === "string" ? previous.sourceInstanceId : undefined;
  if (decision.status !== "resolved" || selections.length !== 1 || !locations.includes(selections[0]) || !sourceInstanceId) throw new Error("ISHTAR_AN_GAL_DECISION_INVALID");
  return installAnGalChallenge(state, player, ISHTAR_AN_GAL_ID, selections[0], sourceInstanceId);
};

export const isIshtarAnGalTaKigalSheLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === AN_GAL_CHALLENGE && state.phase === "combat" && state.activePlayerId === playerId
    && activeSkillInstance(state, player, skill.id, definitions) && challengeLocations(state).length > 0);
};
