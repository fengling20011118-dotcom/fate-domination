import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardAttribute, CardDefinition } from "./content-types.ts";
import { createDerivedCardInstance } from "./decks.ts";
import { defeatPlayerByEffect } from "./defeat.ts";
import { adjustVictoryPoints, gainMana, gainVictoryPoints } from "./resources.ts";
import { revealUsedSkillCard } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const SHERLOCK_ELEMENTARY_ID = "servant.sherlock.skill.sc-sherlock-1";
export const SHERLOCK_EMPTY_HOUSE_ID = "servant.sherlock.skill.sc-sherlock-2";
export const SHERLOCK_RETRODUCTION_ID = "servant.sherlock.skill.sc-sherlock-3";
export const SHERLOCK_RECORD_STRENGTH_ID = "servant.sherlock.skill.sc-sherlock-4";
export const SHERLOCK_RECORD_AGILITY_ID = "servant.sherlock.skill.sc-sherlock-5";
export const SHERLOCK_RECORD_MAGIC_ID = "servant.sherlock.skill.sc-sherlock-6";
export const SHERLOCK_RECORD_SPECIAL_ID = "servant.sherlock.skill.sc-sherlock-7";

export const SHERLOCK_ELEMENTARY_HANDLER = "core.sherlock-elementary";
export const SHERLOCK_ELEMENTARY_RESOLVE = "core.sherlock-elementary-resolve";
export const SHERLOCK_EMPTY_HOUSE_HANDLER = "core.sherlock-empty-house";
export const SHERLOCK_RETRODUCTION_HANDLER = "core.sherlock-retroduction";
export const SHERLOCK_RETRODUCTION_RESOLVE = "core.sherlock-retroduction-resolve";

const RETRODUCTION_SIDE_DECK = "sherlock-retroduction";
const ELEMENTARY_ABILITY = "elementary";
const MIND_PALACE_ABILITY = "mind-palace";

const RECORD_DEFINITION_BY_ATTRIBUTE: Readonly<Record<Exclude<CardAttribute, "宝具">, string>> = {
  力量: SHERLOCK_RECORD_STRENGTH_ID,
  迅捷: SHERLOCK_RECORD_AGILITY_ID,
  魔术: SHERLOCK_RECORD_MAGIC_ID,
  特殊: SHERLOCK_RECORD_SPECIAL_ID,
};
const RECORD_ATTRIBUTES = Object.keys(RECORD_DEFINITION_BY_ATTRIBUTE) as Array<Exclude<CardAttribute, "宝具">>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.face === "up" && card.active && matchesSkill(definition, card.definitionId, skillId));
  });
}

function recordAttribute(definitionId: string): Exclude<CardAttribute, "宝具"> | undefined {
  return RECORD_ATTRIBUTES.find((attribute) => RECORD_DEFINITION_BY_ATTRIBUTE[attribute] === definitionId);
}

export function getSherlockRetroductionRecord(state: GameState, playerId: string): CardInstance | undefined {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === playerId
    && card.namedSideDeckId === RETRODUCTION_SIDE_DECK && card.zone === "side-hand");
}

function nextRecordInstanceId(state: GameState, playerId: string): string {
  let index = 1;
  while (state.cards[`${playerId}:sherlock-retroduction:${index}`]) index += 1;
  return `${playerId}:sherlock-retroduction:${index}`;
}

function createRetroductionRecord(
  state: GameState,
  player: PlayerState,
  attribute: Exclude<CardAttribute, "宝具">,
  definitions: Record<string, CardDefinition>,
): CardInstance {
  if (getSherlockRetroductionRecord(state, player.id)) throw new Error("SHERLOCK_RETRODUCTION_ALREADY_RECORDED");
  const definitionId = RECORD_DEFINITION_BY_ATTRIBUTE[attribute];
  if (!definitions[definitionId]) throw new Error("SHERLOCK_RETRODUCTION_RECORD_DEFINITION_MISSING");
  revealUsedSkillCard(state, player.id, SHERLOCK_RETRODUCTION_ID, definitions);
  return createDerivedCardInstance(state, player.id, {
    instanceId: nextRecordInstanceId(state, player.id),
    definitionId,
    zone: "side-hand",
    face: "down",
    active: false,
    residual: false,
    temporary: true,
    namedSideDeckId: RETRODUCTION_SIDE_DECK,
    sourceEffectId: SHERLOCK_RETRODUCTION_ID,
    createdByPlayerId: player.id,
    originServantId: "servant.sherlock",
  });
}

function discardRetroductionRecord(card: CardInstance): void {
  if (card.zone !== "side-hand" || card.namedSideDeckId !== RETRODUCTION_SIDE_DECK) throw new Error("SHERLOCK_RETRODUCTION_RECORD_INVALID");
  card.zone = "side-discard";
  card.face = "up";
  card.publiclyRevealed = true;
  card.active = false;
}

function openRecordDecision(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  optional: boolean,
  openDecision: SkillContext["openDecision"],
): void {
  if (getSherlockRetroductionRecord(state, player.id)) throw new Error("SHERLOCK_RETRODUCTION_ALREADY_RECORDED");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:retroduction`;
  const candidates = [...RECORD_ATTRIBUTES];
  state.effectQueue.unshift({
    effectId,
    handlerId: SHERLOCK_RETRODUCTION_RESOLVE,
    sourceId,
    controllerPlayerId: player.id,
    payload: { candidates, optional },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "sherlock-retroduction",
    options: [
      ...(optional ? [{ id: "skip", label: "跳过" }] : []),
      ...candidates.map((attribute) => ({ id: attribute, label: attribute })),
    ],
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function resolveSingleSelection(payload: unknown, error: string): { previous: Record<string, unknown>; selection: string } {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error(error);
  const selections = Array.isArray(payload.decision.selections)
    ? payload.decision.selections.filter((id): id is string => typeof id === "string")
    : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1) throw new Error(error);
  return { previous: payload.previous, selection: selections[0] };
}

function resolveRecordedHit(
  state: GameState,
  player: PlayerState,
  record: CardInstance,
  openDecision: SkillContext["openDecision"],
): { attribute: Exclude<CardAttribute, "宝具">; gainedVictoryPoints: number } {
  const attribute = recordAttribute(record.definitionId);
  if (!attribute) throw new Error("SHERLOCK_RETRODUCTION_RECORD_INVALID");
  discardRetroductionRecord(record);
  const gainedVictoryPoints = gainVictoryPoints(player, 1);
  openRecordDecision(state, player, SHERLOCK_RETRODUCTION_ID, true, openDecision);
  return { attribute, gainedVictoryPoints };
}

function playedCardMatchesRecord(
  state: GameState,
  event: Record<string, unknown>,
  record: CardInstance,
  definitions: Record<string, CardDefinition>,
): boolean {
  const instanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
  const card = instanceId ? state.cards[instanceId] : undefined;
  const definitionId = typeof event.definitionId === "string" ? event.definitionId : card?.definitionId;
  const definition = definitionId ? definitions[definitionId] : undefined;
  const attribute = recordAttribute(record.definitionId);
  if (!card || !definition || !attribute || event.face !== "up" || definition.basic !== true) return false;
  return getCardInstanceAttributes(card, definition, state, definitions).includes(attribute);
}

function sameLocationOpponentIds(state: GameState, player: PlayerState): string[] {
  if (!player.locationId) return [];
  return Object.values(state.players)
    .filter((candidate) => candidate.id !== player.id && !candidate.eliminated && candidate.locationId === player.locationId)
    .map((candidate) => candidate.id);
}

function elementaryShownInstanceIds(state: GameState, target: PlayerState): string[] {
  return [...target.hand, ...target.attack.filter((instanceId) => state.cards[instanceId]?.face === "down")];
}

function resolveElementaryAgainst(
  state: GameState,
  player: PlayerState,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
  emitEvent: SkillContext["emitEvent"],
) {
  if (!sameLocationOpponentIds(state, player).includes(targetPlayerId)) throw new Error("SHERLOCK_ELEMENTARY_TARGET_INVALID");
  const target = state.players[targetPlayerId];
  const shownInstanceIds = elementaryShownInstanceIds(state, target);
  const record = getSherlockRetroductionRecord(state, player.id);
  const attribute = record ? recordAttribute(record.definitionId) : undefined;
  const matchingInstanceId = attribute ? shownInstanceIds.find((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && getCardInstanceAttributes(card, definition, state, definitions).includes(attribute));
  }) : undefined;
  if (!record || !attribute || !matchingInstanceId) return { targetPlayerId, shownInstanceIds, matched: false };
  const retroduction = resolveRecordedHit(state, player, record, openDecision);
  const defeated = defeatPlayerByEffect(state, targetPlayerId, player.id, definitions, emitEvent, {
    sourceId: SHERLOCK_ELEMENTARY_ID,
    method: "elementary-retroduction",
  });
  return { targetPlayerId, shownInstanceIds, matchingInstanceId, matched: true, defeated, ...retroduction };
}

/** The Empty House: persistent Workshop mana plus the Outpost Memory Palace Retroduction. */
export const useSherlockEmptyHouse: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("SHERLOCK_EMPTY_HOUSE_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "player.deployed") {
    const event = isRecord(data.event) ? data.event : {};
    if (event.playerId !== player.id || event.locationId !== "workshop") return;
    if (!activeOwnedSkill(state, player, skill.id, definitions)) return;
    return { manaGained: gainMana(player, 1) };
  }
  if (data.abilityId !== MIND_PALACE_ABILITY || state.phase !== "outpost" || state.activePlayerId !== player.id) {
    throw new Error("SHERLOCK_EMPTY_HOUSE_ABILITY_INVALID");
  }
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("SHERLOCK_EMPTY_HOUSE_SOURCE_INACTIVE");
  if (getSherlockRetroductionRecord(state, player.id)) throw new Error("SHERLOCK_RETRODUCTION_ALREADY_RECORDED");
  const direct = typeof data.attribute === "string" && RECORD_ATTRIBUTES.includes(data.attribute as Exclude<CardAttribute, "宝具">)
    ? data.attribute as Exclude<CardAttribute, "宝具">
    : undefined;
  if (direct) return { recordInstanceId: createRetroductionRecord(state, player, direct, definitions).instanceId, attribute: direct };
  openRecordDecision(state, player, skill.id, false, openDecision);
};

export const isSherlockEmptyHouseLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === MIND_PALACE_ABILITY && state.phase === "outpost" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions) && !getSherlockRetroductionRecord(state, player.id));
};

/** Retroduction resolves on matching basic plays and penalizes an unresolved secret record at round end. */
export const useSherlockRetroduction: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("SHERLOCK_RETRODUCTION_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const record = getSherlockRetroductionRecord(state, player.id);
  if (!record) return;
  if (eventType === "round.ending") {
    discardRetroductionRecord(record);
    return { discardedInstanceId: record.instanceId, victoryPointDelta: adjustVictoryPoints(player, -3) };
  }
  if (eventType !== "card.played" || !isRecord(payload.event)) return;
  const event = payload.event;
  if (event.playerId === player.id || !playedCardMatchesRecord(state, event, record, definitions)) return;
  return resolveRecordedHit(state, player, record, openDecision);
};

export const resolveSherlockRetroduction: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("SHERLOCK_RETRODUCTION_DEFINITIONS_REQUIRED");
  const { previous, selection } = resolveSingleSelection(payload, "SHERLOCK_RETRODUCTION_DECISION_INVALID");
  const optional = previous.optional === true;
  const candidates = Array.isArray(previous.candidates)
    ? previous.candidates.filter((attribute): attribute is Exclude<CardAttribute, "宝具"> => typeof attribute === "string" && RECORD_ATTRIBUTES.includes(attribute as Exclude<CardAttribute, "宝具">))
    : [];
  if (selection === "skip") {
    if (!optional) throw new Error("SHERLOCK_RETRODUCTION_DECISION_INVALID");
    return { skipped: true };
  }
  if (!candidates.includes(selection as Exclude<CardAttribute, "宝具">)) throw new Error("SHERLOCK_RETRODUCTION_DECISION_INVALID");
  const attribute = selection as Exclude<CardAttribute, "宝具">;
  const record = createRetroductionRecord(state, player, attribute, definitions);
  return { recordInstanceId: record.instanceId, attribute };
};

/** Elementary, My Dear: in Combat reveal one local opponent's hand/face-down attacks; a recorded type resolves even though those cards were not played. */
export const useSherlockElementary: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== ELEMENTARY_ABILITY) throw new Error("SHERLOCK_ELEMENTARY_ABILITY_INVALID");
  if (state.phase !== "combat" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, skill.id, definitions)) {
    throw new Error("SHERLOCK_ELEMENTARY_WINDOW_INVALID");
  }
  const candidates = sameLocationOpponentIds(state, player);
  const directTargetPlayerId = typeof payload.targetPlayerId === "string" ? payload.targetPlayerId : undefined;
  if (directTargetPlayerId) return resolveElementaryAgainst(state, player, directTargetPlayerId, definitions, openDecision, emitEvent);
  if (candidates.length === 0) return { targetPlayerId: null, shownInstanceIds: [], matched: false };
  if (candidates.length === 1) return resolveElementaryAgainst(state, player, candidates[0], definitions, openDecision, emitEvent);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:target`;
  state.effectQueue.unshift({
    effectId,
    handlerId: SHERLOCK_ELEMENTARY_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "sherlock-elementary-target",
    options: candidates.map((id) => ({ id, label: state.players[id].name })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
};

export const isSherlockElementaryLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === ELEMENTARY_ABILITY && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions) && sameLocationOpponentIds(state, player).length > 0);
};

export const resolveSherlockElementary: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions) throw new Error("SHERLOCK_ELEMENTARY_DEFINITIONS_REQUIRED");
  const { previous, selection } = resolveSingleSelection(payload, "SHERLOCK_ELEMENTARY_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  if (!candidates.includes(selection)) throw new Error("SHERLOCK_ELEMENTARY_DECISION_INVALID");
  return resolveElementaryAgainst(state, player, selection, definitions, openDecision, emitEvent);
};
