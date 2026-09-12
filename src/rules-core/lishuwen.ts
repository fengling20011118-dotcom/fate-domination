import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { addCardToAttack, playCardFaceDownByEffect } from "./card-play.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import type { CardAttribute, CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";
import { movePlayerCard } from "./decks.ts";
import { defeatPlayerByEffect } from "./defeat.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const LISHUWEN_QIJING_ID = "servant.lishuwen.skill.sc-lishuwen-1";
export const LISHUWEN_NO_SECOND_STRIKE_ID = "servant.lishuwen.skill.sc-lishuwen-2";
export const LISHUWEN_QIJING_HANDLER = "core.lishuwen-sphere-boundary";
export const LISHUWEN_QIJING_RESOLVE = "core.lishuwen-sphere-boundary-resolve";
export const LISHUWEN_NO_SECOND_STRIKE_HANDLER = "core.lishuwen-no-second-strike";

const QIJING_ACTIVATE_ABILITY = "activate-sphere-boundary";
const NO_SECOND_STRIKE_ABILITY = "one-strike-defeat";
const QIJING_ACTIVE_FLAG = "lishuwenSphereBoundaryActive";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function ownedPhysicalSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  return [...player.servantSkills, ...player.attack].map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.ownerPlayerId === player.id && card.zone !== "removed" && card.zone !== "discard"
      && matchesSkill(definition, card.definitionId, skillId));
  });
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

function qijingActive(player: PlayerState): boolean {
  return player.flags[QIJING_ACTIVE_FLAG] === true && player.flags.actionCardSetAsideSourceId === LISHUWEN_QIJING_ID;
}

export function getLishuwenJinCards(state: GameState, playerId: string): CardInstance[] {
  return Object.values(state.cards).filter((card) => card.ownerPlayerId === playerId
    && card.zone === "removed" && card.setAsideForCombat?.sourceId === LISHUWEN_QIJING_ID);
}

function hideServantSkillZone(state: GameState, player: PlayerState): string[] {
  const hidden: string[] = [];
  for (const instanceId of player.servantSkills) {
    const card = state.cards[instanceId];
    if (!card || card.ownerPlayerId !== player.id || card.zone !== "servant-skills") continue;
    card.face = "down";
    card.active = false;
    hidden.push(instanceId);
  }
  player.trueNameRevealed = false;
  return hidden;
}

function openJinReleaseDecision(
  state: GameState,
  player: PlayerState,
  jin: CardInstance[],
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  if (jin.length === 0) return;
  const ids = jin.map((card) => card.instanceId);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${LISHUWEN_QIJING_ID}:release-jin`;
  state.effectQueue.unshift({
    effectId,
    handlerId: LISHUWEN_QIJING_RESOLVE,
    sourceId: LISHUWEN_QIJING_ID,
    controllerPlayerId: player.id,
    payload: { instanceIds: ids },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "lishuwen-release-jin",
    options: jin.flatMap((card) => {
      const name = definitions[card.definitionId]?.name ?? card.instanceId;
      return [
        { id: `up:${card.instanceId}`, label: `${name}：明置` },
        { id: `down:${card.instanceId}`, label: `${name}：暗置` },
      ];
    }),
    min: jin.length,
    max: jin.length,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function releaseOneJin(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  face: "up" | "down",
  definitions: Record<string, CardDefinition>,
  emitEvent: SkillContext["emitEvent"],
): void {
  const card = state.cards[instanceId];
  if (!card || card.ownerPlayerId !== player.id || card.zone !== "removed" || card.setAsideForCombat?.sourceId !== LISHUWEN_QIJING_ID) {
    throw new Error("LISHUWEN_JIN_CARD_STALE");
  }
  const definition = definitions[card.definitionId];
  if (!definition) throw new Error("LISHUWEN_JIN_DEFINITION_MISSING");
  if (face === "up") {
    addCardToAttack(state, player.id, instanceId, definitions, {
      payCost: false,
      allowedSourceZones: ["removed"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
      bypassSkillEightMana: true,
    });
    addCardRuleModifier(player, {
      id: `${LISHUWEN_QIJING_ID}:action-in-combat:${state.round}:${instanceId}`,
      sourceId: LISHUWEN_QIJING_ID,
      targetDefinitionIds: [definition.id],
      targetInstanceIds: [instanceId],
      allowActionAbilityInCombat: true,
      duration: "round",
    });
    emitEvent?.("card.played", {
      playerId: player.id,
      instanceId,
      definitionId: definition.id,
      face: "up",
      paidMana: 0,
      attributes: getCardInstanceAttributes(card, definition, state, definitions),
      method: "lishuwen-jin",
      sourceId: LISHUWEN_QIJING_ID,
    });
  } else {
    playCardFaceDownByEffect(state, player.id, instanceId, definitions, { allowedSourceZones: ["removed"], allowSkillCard: true });
    emitEvent?.("card.played", {
      playerId: player.id,
      instanceId,
      definitionId: null,
      face: "down",
      paidMana: 0,
      attributes: [],
      method: "lishuwen-jin",
      sourceId: LISHUWEN_QIJING_ID,
    });
  }
  delete card.setAsideForCombat;
}

/** Sphere Boundary: pay 3 in Action to hide the Servant skill zone and enable the free Jin replacement until defeat. */
export const useLishuwenQijing: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("LISHUWEN_QIJING_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "player.defeated") {
    if (event.playerId !== player.id || !qijingActive(player)) return;
    delete player.flags[QIJING_ACTIVE_FLAG];
    if (player.flags.actionCardSetAsideSourceId === skill.id) delete player.flags.actionCardSetAsideSourceId;
    return { ended: true };
  }
  if (eventType === "phase.transitioned") {
    if (!qijingActive(player) || event.previousPhase !== "action" || event.transition !== "next-phase" || state.phase !== "combat") return;
    const jin = getLishuwenJinCards(state, player.id);
    if (jin.length === 0) return;
    openJinReleaseDecision(state, player, jin, definitions, openDecision);
    return { pending: true, instanceIds: jin.map((card) => card.instanceId) };
  }
  if (data.abilityId !== QIJING_ACTIVATE_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("LISHUWEN_QIJING_WINDOW_INVALID");
  }
  if (qijingActive(player) || !ownedPhysicalSkill(state, player, skill.id, definitions)) throw new Error("LISHUWEN_QIJING_ACTIVATION_INVALID");
  payManaCost(state, player, 3, definitions, "LISHUWEN_QIJING_MANA_REQUIRED");
  player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + 3;
  player.flags[QIJING_ACTIVE_FLAG] = true;
  player.flags.actionCardSetAsideSourceId = skill.id;
  const hiddenSkillInstanceIds = hideServantSkillZone(state, player);
  return { active: true, paidMana: 3, hiddenSkillInstanceIds };
};

export const isLishuwenQijingLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === QIJING_ACTIVATE_ABILITY && state.phase === "action" && state.activePlayerId === playerId
    && !qijingActive(player) && ownedPhysicalSkill(state, player, skill.id, definitions)
    && (player.flags.infiniteMana === true || player.mana >= 3));
};

export const resolveLishuwenQijing: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("LISHUWEN_JIN_DECISION_INVALID");
  const previousIds = Array.isArray(payload.previous.instanceIds) ? payload.previous.instanceIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || previousIds.length === 0 || selections.length !== previousIds.length) throw new Error("LISHUWEN_JIN_DECISION_INVALID");
  const choices = new Map<string, "up" | "down">();
  for (const selection of selections) {
    const split = selection.indexOf(":");
    const face = selection.slice(0, split);
    const instanceId = selection.slice(split + 1);
    if ((face !== "up" && face !== "down") || !previousIds.includes(instanceId) || choices.has(instanceId)) throw new Error("LISHUWEN_JIN_DECISION_INVALID");
    choices.set(instanceId, face);
  }
  if (choices.size !== previousIds.length) throw new Error("LISHUWEN_JIN_DECISION_INVALID");
  for (const instanceId of previousIds) releaseOneJin(state, player, instanceId, choices.get(instanceId)!, definitions, emitEvent);
  return {
    playedInstanceIds: [...previousIds],
    faceUpInstanceIds: previousIds.filter((id) => choices.get(id) === "up"),
    faceDownInstanceIds: previousIds.filter((id) => choices.get(id) === "down"),
  };
};

function sameLocationOpponents(state: GameState, player: PlayerState): PlayerState[] {
  if (player.locationId !== "mountain" && player.locationId !== "city") return [];
  return (state.board.locations[player.locationId] ?? [])
    .filter((id) => id !== player.id)
    .map((id) => state.players[id])
    .filter((candidate): candidate is PlayerState => Boolean(candidate && !candidate.eliminated));
}

function hiddenAttackAttributes(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): Map<string, CardAttribute[]> {
  const result = new Map<string, CardAttribute[]>();
  for (const instanceId of player.attack) {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || card.face !== "down" || card.zone !== "attack") continue;
    result.set(instanceId, getCardInstanceAttributes(card, definition, state, definitions));
  }
  return result;
}

function opponentAttackAttributes(state: GameState, opponent: PlayerState, definitions: Record<string, CardDefinition>): Set<CardAttribute> {
  const result = new Set<CardAttribute>();
  for (const instanceId of opponent.attack) {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || card.zone !== "attack") continue;
    for (const attribute of getCardInstanceAttributes(card, definition, state, definitions)) result.add(attribute);
  }
  return result;
}

export function getLishuwenNoSecondStrikeChoices(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): Array<{ targetPlayerId: string; ownHiddenInstanceId: string }> {
  const hidden = hiddenAttackAttributes(state, player, definitions);
  const result: Array<{ targetPlayerId: string; ownHiddenInstanceId: string }> = [];
  for (const opponent of sameLocationOpponents(state, player)) {
    const opponentAttributes = opponentAttackAttributes(state, opponent, definitions);
    for (const [ownHiddenInstanceId, attributes] of hidden.entries()) {
      if (attributes.some((attribute) => opponentAttributes.has(attribute))) result.push({ targetPlayerId: opponent.id, ownHiddenInstanceId });
    }
  }
  return result;
}

/** No Second Strike: remove one own hidden attack sharing an attribute with the target opponent's attack, defeat that opponent, then double this card. */
export const useLishuwenNoSecondStrike: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== NO_SECOND_STRIKE_ABILITY || state.phase !== "combat" || state.activePlayerId !== player.id) {
    throw new Error("LISHUWEN_NO_SECOND_STRIKE_WINDOW_INVALID");
  }
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("LISHUWEN_NO_SECOND_STRIKE_SOURCE_INACTIVE");
  const targetPlayerId = typeof payload.targetPlayerId === "string" ? payload.targetPlayerId : undefined;
  const ownHiddenInstanceId = typeof payload.ownHiddenInstanceId === "string" ? payload.ownHiddenInstanceId : undefined;
  if (!targetPlayerId || !ownHiddenInstanceId || !getLishuwenNoSecondStrikeChoices(state, player, definitions)
    .some((choice) => choice.targetPlayerId === targetPlayerId && choice.ownHiddenInstanceId === ownHiddenInstanceId)) {
    throw new Error("LISHUWEN_NO_SECOND_STRIKE_TARGET_INVALID");
  }
  const hidden = state.cards[ownHiddenInstanceId];
  movePlayerCard(state, player.id, ownHiddenInstanceId, "removed");
  hidden.face = "down";
  hidden.active = false;
  hidden.residual = false;
  const defeated = defeatPlayerByEffect(state, targetPlayerId, player.id, definitions, emitEvent, {
    sourceId: skill.id,
    method: "no-second-strike",
  });
  source.powerModifiers = [
    ...(source.powerModifiers ?? []).filter((modifier) => modifier.id !== `${skill.id}:double:${state.round}`),
    { id: `${skill.id}:double:${state.round}`, sourceId: skill.id, kind: "multiply", value: 2, duration: "round" },
  ];
  return { targetPlayerId, removedInstanceId: ownHiddenInstanceId, defeated, doubledInstanceId: source.instanceId };
};

export const isLishuwenNoSecondStrikeLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === NO_SECOND_STRIKE_ABILITY && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions) && getLishuwenNoSecondStrikeChoices(state, player, definitions).length > 0);
};
