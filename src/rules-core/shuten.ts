import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { defeatPlayerByEffect } from "./defeat.ts";
import { movePlayerCard, placeOwnedCardOnBoard, returnOwnedBoardCardToSkillZone } from "./decks.ts";
import { gainVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const SHUTEN_BANQUET_ID = "servant.shuten.skill.sc-shuten-1";
export const SHUTEN_SAKE_ID = "servant.shuten.skill.sc-shuten-2";
export const SHUTEN_BONE_ID = "servant.shuten.skill.sc-shuten-3";

export const SHUTEN_BANQUET_HANDLER = "core.shuten-debaucherous-banquet";
export const SHUTEN_BANQUET_RESOLVE = "core.shuten-debaucherous-banquet-resolve";
export const SHUTEN_SAKE_HANDLER = "core.shuten-noxious-sake";
export const SHUTEN_BONE_HANDLER = "core.shuten-bone-collector";
export const SHUTEN_BONE_RESOLVE = "core.shuten-bone-collector-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return Boolean(definition && (definitionId === skillId || definition.linkedSkillId === skillId));
}

function ownedPhysicalSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return Object.values(state.cards).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone !== "removed" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function activeOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function openSingleDecision(
  state: GameState,
  player: PlayerState,
  handlerId: string,
  kind: string,
  options: Array<{ id: string; label: string; playerId?: string }>,
  payload: Record<string, unknown>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${handlerId}:${kind}`;
  state.effectQueue.unshift({
    effectId,
    handlerId,
    sourceId: payload.sourceId as string,
    controllerPlayerId: player.id,
    payload,
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function resolvedSingle(payload: unknown, error: string): { previous: Record<string, unknown>; selection: string } {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error(error);
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections)
    ? decision.selections.filter((item): item is string => typeof item === "string")
    : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error(error);
  return { previous: payload.previous, selection: selections[0] };
}

function placeBanquet(
  state: GameState,
  player: PlayerState,
  locationId: string,
  definitions: Record<string, CardDefinition>,
): { instanceId: string; locationId: string } {
  if (locationId !== "mountain" && locationId !== "city") throw new Error("SHUTEN_BANQUET_LOCATION_INVALID");
  const source = ownedPhysicalSkill(state, player, SHUTEN_BANQUET_ID, definitions);
  if (!source || source.zone !== "servant-skills") throw new Error("SHUTEN_BANQUET_SOURCE_UNAVAILABLE");
  placeOwnedCardOnBoard(state, player.id, source.instanceId, locationId);
  source.boardOpponentCardCostAura = {
    attackOnly: true,
    sourceZones: ["hand", "master-skills", "servant-skills"],
    amount: 2,
  };
  return { instanceId: source.instanceId, locationId };
}

/** Debaucherous Banquet: pay the ability cost, place the physical skill on a battlefield, reward everyone there after combat, return it at round end. */
export const useShutenDebaucherousBanquet: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("SHUTEN_BANQUET_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  const source = ownedPhysicalSkill(state, player, SHUTEN_BANQUET_ID, definitions);
  if (eventType === "combat.ending") {
    if (!source || source.zone !== "board" || !source.active || (source.boardLocationId !== "mountain" && source.boardLocationId !== "city")) return;
    const previousLocations = isRecord(event.previousLocations) ? event.previousLocations : {};
    const rewarded: string[] = [];
    for (const target of Object.values(state.players)) {
      if (target.eliminated || previousLocations[target.id] !== source.boardLocationId) continue;
      gainVictoryPoints(target, 1);
      rewarded.push(target.id);
    }
    return { rewardedPlayerIds: rewarded, locationId: source.boardLocationId };
  }
  if (eventType === "round.ending") {
    if (source?.zone === "board") returnOwnedBoardCardToSkillZone(state, player.id, source.instanceId, "servant-skills");
    return;
  }
  if (data.abilityId !== "place-banquet" || state.phase !== "preparation" || state.activePlayerId !== player.id) {
    throw new Error("SHUTEN_BANQUET_WINDOW_INVALID");
  }
  const direct = typeof data.locationId === "string" ? data.locationId : undefined;
  if (direct) return placeBanquet(state, player, direct, definitions);
  openSingleDecision(
    state,
    player,
    SHUTEN_BANQUET_RESOLVE,
    "shuten-banquet-location",
    [
      { id: "mountain", label: "深山町" },
      { id: "city", label: "新都" },
    ],
    { sourceId: SHUTEN_BANQUET_ID, candidates: ["mountain", "city"] },
    openDecision,
  );
};

export const resolveShutenDebaucherousBanquet: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("SHUTEN_BANQUET_DEFINITIONS_REQUIRED");
  const { previous, selection } = resolvedSingle(payload, "SHUTEN_BANQUET_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  if (!candidates.includes(selection)) throw new Error("SHUTEN_BANQUET_DECISION_INVALID");
  return placeBanquet(state, player, selection, definitions);
};

export const isShutenDebaucherousBanquetLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== "place-banquet" || state.phase !== "preparation" || state.activePlayerId !== playerId) return false;
  const source = ownedPhysicalSkill(state, player, SHUTEN_BANQUET_ID, definitions);
  return Boolean(source?.zone === "servant-skills" && (player.flags.infiniteMana === true || player.mana >= 2));
};

/** Noxious Sake / Delirium: at Combat start, all basic physical attacks in Shuten's fight gain OPG without retroactive use. */
export const useShutenNoxiousSake: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || payload.eventType !== "phase.transitioned" || !isRecord(payload.event)) return;
  if (payload.event.previousPhase !== "action" || payload.event.transition !== "next-phase" || state.phase !== "combat") return;
  const source = activeOwnedSkill(state, player, SHUTEN_SAKE_ID, definitions);
  const locationId = player.locationId;
  if (!source || (locationId !== "mountain" && locationId !== "city")) return;
  const granted: string[] = [];
  for (const participantId of state.board.locations[locationId] ?? []) {
    const participant = state.players[participantId];
    if (!participant || participant.eliminated) continue;
    for (const instanceId of participant.attack) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || !definition || card.zone !== "attack" || definition.basic !== true) continue;
      card.usageLimitOverride = "once-per-game";
      granted.push(instanceId);
    }
  }
  return { grantedInstanceIds: granted, locationId };
};

function boneTargets(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated);
}

function applyBoneCollector(
  state: GameState,
  player: PlayerState,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
) {
  if (!boneTargets(state, player).includes(targetPlayerId)) throw new Error("SHUTEN_BONE_TARGET_INVALID");
  const target = state.players[targetPlayerId];
  const startingDeckSize = Number(target.flags.startingDeckSize);
  if (!Number.isInteger(startingDeckSize) || startingDeckSize <= 0) throw new Error("STARTING_DECK_SIZE_MISSING");
  const count = Math.ceil(startingDeckSize / 4);
  const removed = [...target.deck.slice(0, count)];
  for (const instanceId of removed) movePlayerCard(state, target.id, instanceId, "removed");
  const defeated = target.deck.length === 0
    ? defeatPlayerByEffect(state, target.id, player.id, definitions, emitEvent, { sourceId: SHUTEN_BONE_ID, method: "bone-collector" })
    : false;
  return { targetPlayerId, count, removedInstanceIds: removed, defeated };
}

/** Bone Collector: exile a quarter of an engaged opponent's true starting deck size, rounded up, then defeat if empty. */
export const useShutenBoneCollector: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || state.phase !== "combat" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, SHUTEN_BONE_ID, definitions)) {
    throw new Error("SHUTEN_BONE_WINDOW_INVALID");
  }
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== "bone-collector") throw new Error("SHUTEN_BONE_ABILITY_INVALID");
  const targets = boneTargets(state, player);
  if (targets.length === 0) throw new Error("SHUTEN_BONE_NO_TARGET");
  const direct = typeof data.targetPlayerId === "string" ? data.targetPlayerId : undefined;
  if (direct) return applyBoneCollector(state, player, direct, definitions, emitEvent);
  openSingleDecision(
    state,
    player,
    SHUTEN_BONE_RESOLVE,
    "shuten-bone-target",
    targets.map((id) => ({ id, playerId: id, label: state.players[id].name })),
    { sourceId: SHUTEN_BONE_ID, candidates: targets },
    openDecision,
  );
};

export const resolveShutenBoneCollector: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("SHUTEN_BONE_DEFINITIONS_REQUIRED");
  const { previous, selection } = resolvedSingle(payload, "SHUTEN_BONE_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  if (!candidates.includes(selection)) throw new Error("SHUTEN_BONE_DECISION_INVALID");
  return applyBoneCollector(state, player, selection, definitions, emitEvent);
};

export const isShutenBoneCollectorLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "bone-collector" && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, SHUTEN_BONE_ID, definitions) && boneTargets(state, player).length > 0);
};
