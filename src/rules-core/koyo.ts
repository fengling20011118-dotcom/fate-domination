import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { StateRandom } from "../match-engine/random.ts";
import { attachCard, detachCard, getAttachedCards } from "./card-attachments.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { joinOwnedCardToAttack } from "./card-play.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { closePlayerCard, drawCards, movePlayerCard } from "./decks.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const KOYO_MOMIJIGARI_ID = "servant.koyo.skill.sc-koyo-1";
export const KOYO_DEMON_FORM_ID = "servant.koyo.skill.sc-koyo-2";
export const KOYO_FIRE_BREATHING_ID = "servant.koyo.skill.sc-koyo-3";

export const KOYO_MOMIJIGARI_HANDLER = "core.koyo-momijigari";
export const KOYO_MOMIJIGARI_STORE_RESOLVE = "core.koyo-momijigari-store-resolve";
export const KOYO_MOMIJIGARI_TRANSFORM_RESOLVE = "core.koyo-momijigari-transform-resolve";
export const KOYO_DEMON_FORM_HANDLER = "core.koyo-demon-form";
export const KOYO_DEMON_UPKEEP_RESOLVE = "core.koyo-demon-upkeep-resolve";
export const KOYO_DEMON_STRENGTH_RESOLVE = "core.koyo-demon-strength-resolve";
export const KOYO_FIRE_BREATHING_HANDLER = "core.koyo-fire-breathing";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function ownedSkillCard(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  return [...player.servantSkills, ...player.attack]
    .map((instanceId) => state.cards[instanceId])
    .find((instance) => {
      const definition = instance ? definitions[instance.definitionId] : undefined;
      return Boolean(instance && instance.ownerPlayerId === player.id
        && (instance.definitionId === skillId || definition?.linkedSkillId === skillId));
    });
}

function activeDemonForm(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  const instance = ownedSkillCard(state, player, KOYO_DEMON_FORM_ID, definitions);
  return instance?.zone === "attack" && instance.active === true && instance.face === "up" ? instance : undefined;
}

function momijigariHost(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): CardInstance {
  const host = ownedSkillCard(state, player, KOYO_MOMIJIGARI_ID, definitions);
  if (!host || host.zone === "removed" || host.zone === "discard") throw new Error("KOYO_MOMIJIGARI_SOURCE_UNAVAILABLE");
  return host;
}

function attachableHandCards(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): string[] {
  return player.hand.filter((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!instance || !definition) return false;
    const attributes = getCardInstanceAttributes(instance, definition, state, definitions);
    return attributes.includes("魔术") || attributes.includes("特殊");
  });
}

function addModifierOnce(player: PlayerState, modifier: NonNullable<PlayerState["cardRuleModifiers"]>[number]): void {
  if ((player.cardRuleModifiers ?? []).some((existing) => existing.id === modifier.id)) return;
  addCardRuleModifier(player, modifier);
}

function installDemonContinuousRules(
  state: GameState,
  player: PlayerState,
  demon: CardInstance,
  definitions: Record<string, CardDefinition>,
): void {
  const basicMagicIds = Object.values(definitions)
    .filter((definition) => definition.basic === true && getCardAttributes(definition).includes("魔术"))
    .map((definition) => definition.id);
  addModifierOnce(player, {
    id: `${demon.instanceId}:koyo-basic-magic-ban`,
    sourceId: KOYO_DEMON_FORM_ID,
    sourceInstanceId: demon.instanceId,
    targetDefinitionIds: basicMagicIds,
    forbidPlay: true,
    duration: "while-source-active",
  });
  addModifierOnce(player, {
    id: `${demon.instanceId}:koyo-fire-breath-cost`,
    sourceId: KOYO_DEMON_FORM_ID,
    sourceInstanceId: demon.instanceId,
    targetDefinitionIds: [KOYO_FIRE_BREATHING_ID],
    costAdd: 5,
    duration: "while-source-active",
  });
  addModifierOnce(player, {
    id: `${demon.instanceId}:koyo-fire-breath-power`,
    sourceId: KOYO_DEMON_FORM_ID,
    sourceInstanceId: demon.instanceId,
    targetDefinitionIds: [KOYO_FIRE_BREATHING_ID],
    powerAdd: 6,
    duration: "while-source-active",
  });
}

function putDemonFormIntoPlay(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): CardInstance {
  if (activeDemonForm(state, player, definitions)) throw new Error("KOYO_DEMON_FORM_ALREADY_ACTIVE");
  const demon = ownedSkillCard(state, player, KOYO_DEMON_FORM_ID, definitions);
  if (!demon || demon.zone !== "servant-skills") throw new Error("KOYO_DEMON_FORM_UNAVAILABLE");
  joinOwnedCardToAttack(state, player.id, demon.instanceId, definitions, { allowedSourceZones: ["servant-skills"] });
  demon.residual = true;
  installDemonContinuousRules(state, player, demon, definitions);
  return demon;
}

function consumeAttachedCards(state: GameState, instanceIds: string[]): void {
  for (const instanceId of instanceIds) detachCard(state, instanceId, "discard");
}

function openCardChoice(
  state: GameState,
  player: PlayerState,
  sourceId: string,
  handlerId: string,
  kind: string,
  candidates: string[],
  min: number,
  max: number,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
  extra: Record<string, unknown> = {},
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${kind}`;
  state.effectQueue.unshift({
    effectId,
    handlerId,
    sourceId,
    controllerPlayerId: player.id,
    payload: { candidates: [...candidates], ...extra },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind,
    options: candidates.map((instanceId) => ({
      id: instanceId,
      instanceId,
      label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId,
    })),
    min,
    max,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function resolvedSelections(payload: unknown, error: string): { previous: Record<string, unknown>; selections: string[] } {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error(error);
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved") throw new Error(error);
  return { previous: payload.previous, selections };
}

/** Momijigari: bank a Magic/Special card, or spend two banked cards to put Demon Form into play. */
export const useKoyoMomijigari: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("KOYO_MOMIJIGARI_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;
  const host = momijigariHost(state, player, definitions);
  if (abilityId === "store") {
    if (state.phase !== "action" || state.activePlayerId !== player.id || activeDemonForm(state, player, definitions)) {
      throw new Error("KOYO_MOMIJIGARI_STORE_FORBIDDEN");
    }
    const candidates = attachableHandCards(state, player, definitions);
    if (candidates.length === 0) throw new Error("KOYO_MOMIJIGARI_STORE_CARD_REQUIRED");
    if (candidates.length === 1) {
      attachCard(state, candidates[0], host.instanceId, "up");
      return { attachedInstanceId: candidates[0] };
    }
    openCardChoice(state, player, skill.id, KOYO_MOMIJIGARI_STORE_RESOLVE, "koyo-momijigari-store", candidates, 1, 1, definitions, openDecision);
    return;
  }
  if (abilityId !== "demon-form" || state.phase !== "outpost" || state.activePlayerId !== player.id) {
    throw new Error("KOYO_MOMIJIGARI_TRANSFORM_FORBIDDEN");
  }
  const attached = getAttachedCards(state, host.instanceId).map((card) => card.instanceId);
  if (attached.length < 2 || activeDemonForm(state, player, definitions)) throw new Error("KOYO_MOMIJIGARI_TWO_CARDS_REQUIRED");
  if (attached.length === 2) {
    consumeAttachedCards(state, attached);
    const demon = putDemonFormIntoPlay(state, player, definitions);
    return { discardedInstanceIds: attached, demonFormInstanceId: demon.instanceId };
  }
  openCardChoice(state, player, skill.id, KOYO_MOMIJIGARI_TRANSFORM_RESOLVE, "koyo-momijigari-transform", attached, 2, 2, definitions, openDecision);
};

export const resolveKoyoMomijigariStore: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("KOYO_MOMIJIGARI_DEFINITIONS_REQUIRED");
  const { previous, selections } = resolvedSelections(payload, "KOYO_MOMIJIGARI_STORE_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  if (selections.length !== 1 || !candidates.includes(selections[0]) || !player.hand.includes(selections[0])) throw new Error("KOYO_MOMIJIGARI_STORE_DECISION_INVALID");
  const host = momijigariHost(state, player, definitions);
  attachCard(state, selections[0], host.instanceId, "up");
  return { attachedInstanceId: selections[0] };
};

export const resolveKoyoMomijigariTransform: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("KOYO_MOMIJIGARI_DEFINITIONS_REQUIRED");
  const { previous, selections } = resolvedSelections(payload, "KOYO_MOMIJIGARI_TRANSFORM_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const host = momijigariHost(state, player, definitions);
  const live = new Set(getAttachedCards(state, host.instanceId).map((card) => card.instanceId));
  if (selections.length !== 2 || new Set(selections).size !== 2 || selections.some((id) => !candidates.includes(id) || !live.has(id))) {
    throw new Error("KOYO_MOMIJIGARI_TRANSFORM_DECISION_INVALID");
  }
  consumeAttachedCards(state, selections);
  const demon = putDemonFormIntoPlay(state, player, definitions);
  return { discardedInstanceIds: selections, demonFormInstanceId: demon.instanceId };
};

function openDemonUpkeep(
  state: GameState,
  player: PlayerState,
  skillId: string,
  demon: CardInstance,
  attachments: string[],
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skillId}:upkeep`;
  state.effectQueue.unshift({
    effectId,
    handlerId: KOYO_DEMON_UPKEEP_RESOLVE,
    sourceId: skillId,
    controllerPlayerId: player.id,
    payload: { demonInstanceId: demon.instanceId, candidates: attachments },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "koyo-demon-upkeep",
    options: [
      ...attachments.map((instanceId) => ({ id: instanceId, instanceId, label: `弃置：${definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId}` })),
      { id: "deactivate", label: "关闭【变化（恐龙）】" },
    ],
    min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
}

/** Demon Form: mandatory Prep upkeep plus the Action Strength boost. */
export const useKoyoDemonForm: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("KOYO_DEMON_FORM_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const demon = activeDemonForm(state, player, definitions);
  if (eventType) {
    if (eventType === "card.played") {
      if (demon) installDemonContinuousRules(state, player, demon, definitions);
      return;
    }
    if (!demon || state.phase !== "preparation" || state.activePlayerId !== player.id
      || Number(player.flags.koyoDemonUpkeepRound ?? -1) === state.round) return;
    player.flags.koyoDemonUpkeepRound = state.round;
    installDemonContinuousRules(state, player, demon, definitions);
    const host = momijigariHost(state, player, definitions);
    const attachments = getAttachedCards(state, host.instanceId).map((card) => card.instanceId);
    if (attachments.length === 0) {
      closePlayerCard(state, player.id, demon.instanceId, definitions);
      return { deactivated: true };
    }
    openDemonUpkeep(state, player, skill.id, demon, attachments, definitions, openDecision);
    return;
  }
  if (data.abilityId !== "strength-boost" || state.phase !== "action" || state.activePlayerId !== player.id || !demon) {
    throw new Error("KOYO_DEMON_STRENGTH_FORBIDDEN");
  }
  const host = momijigariHost(state, player, definitions);
  const attachments = getAttachedCards(state, host.instanceId).map((card) => card.instanceId);
  if (attachments.length === 0) throw new Error("KOYO_DEMON_STRENGTH_CARD_REQUIRED");
  if (attachments.length === 1) return applyDemonStrengthBoost(state, player, demon, attachments[0], definitions);
  openCardChoice(state, player, skill.id, KOYO_DEMON_STRENGTH_RESOLVE, "koyo-demon-strength", attachments, 1, 1, definitions, openDecision, { demonInstanceId: demon.instanceId });
};

function applyDemonStrengthBoost(
  state: GameState,
  player: PlayerState,
  demon: CardInstance,
  attachmentId: string,
  definitions: Record<string, CardDefinition>,
): { discardedInstanceId: string; powerBonus: number } {
  const host = momijigariHost(state, player, definitions);
  if (!getAttachedCards(state, host.instanceId).some((card) => card.instanceId === attachmentId)) throw new Error("KOYO_DEMON_STRENGTH_CARD_INVALID");
  detachCard(state, attachmentId, "discard");
  const basicStrengthIds = Object.values(definitions)
    .filter((definition) => definition.basic === true && getCardAttributes(definition).includes("力量"))
    .map((definition) => definition.id);
  addModifierOnce(player, {
    id: `${demon.instanceId}:koyo-strength:${state.round}`,
    sourceId: KOYO_DEMON_FORM_ID,
    sourceInstanceId: demon.instanceId,
    targetDefinitionIds: basicStrengthIds,
    powerAdd: 4,
    condition: { sourceActive: true },
    duration: "round",
  });
  return { discardedInstanceId: attachmentId, powerBonus: 4 };
}

export const resolveKoyoDemonUpkeep: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("KOYO_DEMON_FORM_DEFINITIONS_REQUIRED");
  const { previous, selections } = resolvedSelections(payload, "KOYO_DEMON_UPKEEP_DECISION_INVALID");
  if (selections.length !== 1) throw new Error("KOYO_DEMON_UPKEEP_DECISION_INVALID");
  const demonInstanceId = typeof previous.demonInstanceId === "string" ? previous.demonInstanceId : undefined;
  const demon = demonInstanceId ? state.cards[demonInstanceId] : undefined;
  if (!demon || demon.zone !== "attack" || !demon.active) throw new Error("KOYO_DEMON_UPKEEP_SOURCE_STALE");
  if (selections[0] === "deactivate") {
    closePlayerCard(state, player.id, demon.instanceId, definitions);
    return { deactivated: true };
  }
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const host = momijigariHost(state, player, definitions);
  const live = new Set(getAttachedCards(state, host.instanceId).map((card) => card.instanceId));
  if (!candidates.includes(selections[0]) || !live.has(selections[0])) throw new Error("KOYO_DEMON_UPKEEP_CARD_INVALID");
  detachCard(state, selections[0], "discard");
  return { discardedInstanceId: selections[0], deactivated: false };
};

export const resolveKoyoDemonStrength: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("KOYO_DEMON_FORM_DEFINITIONS_REQUIRED");
  const { previous, selections } = resolvedSelections(payload, "KOYO_DEMON_STRENGTH_DECISION_INVALID");
  if (selections.length !== 1) throw new Error("KOYO_DEMON_STRENGTH_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const demonInstanceId = typeof previous.demonInstanceId === "string" ? previous.demonInstanceId : undefined;
  const demon = demonInstanceId ? state.cards[demonInstanceId] : undefined;
  if (!demon || !demon.active || demon.zone !== "attack" || !candidates.includes(selections[0])) throw new Error("KOYO_DEMON_STRENGTH_DECISION_INVALID");
  return applyDemonStrengthBoost(state, player, demon, selections[0], definitions);
};

/** Fire Breathing / Thermoregulation. */
export const useKoyoFireBreathing: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, emitEvent }) => {
  if (!definitions || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("KOYO_THERMOREGULATION_WINDOW_INVALID");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== "thermoregulation") throw new Error("KOYO_THERMOREGULATION_ABILITY_INVALID");
  const revealed = [...player.hand];
  for (const instanceId of revealed) {
    const card = state.cards[instanceId];
    if (card) emitEvent?.("card.revealed", { playerId: player.id, instanceId, definitionId: card.definitionId, sourceSkillId: skill.id, method: "thermoregulation" });
  }
  const strength = revealed.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && definition.cardType === "attack"
      && getCardInstanceAttributes(card, definition, state, definitions).includes("力量"));
  });
  if (strength.length < 3) return { revealedInstanceIds: revealed, discardedInstanceIds: [], powerBonus: 0, drewCards: 0 };
  for (const instanceId of strength) detachOrDiscardHandCard(state, player, instanceId);
  player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 5;
  const random = new StateRandom();
  const choose = randomInt ?? ((maxExclusive: number) => random.integer(state, maxExclusive));
  const drawn = drawCards(state, player.id, 1, choose, definitions);
  return { revealedInstanceIds: revealed, discardedInstanceIds: strength, powerBonus: 5, drewCards: drawn.length };
};

function detachOrDiscardHandCard(state: GameState, player: PlayerState, instanceId: string): void {
  if (!player.hand.includes(instanceId)) throw new Error("KOYO_THERMOREGULATION_CARD_STALE");
  const card = state.cards[instanceId];
  if (!card) throw new Error("KOYO_THERMOREGULATION_CARD_STALE");
  movePlayerCard(state, player.id, instanceId, "discard");
  card.zone = "discard";
  card.face = "down";
  card.active = false;
}

export const isKoyoMomijigariLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId) return false;
  if (ability?.id === "store") return state.phase === "action" && !activeDemonForm(state, player, definitions) && attachableHandCards(state, player, definitions).length > 0;
  if (ability?.id === "demon-form") {
    try {
      const host = momijigariHost(state, player, definitions);
      return state.phase === "outpost" && !activeDemonForm(state, player, definitions) && getAttachedCards(state, host.instanceId).length >= 2;
    } catch { return false; }
  }
  return false;
};

export const isKoyoDemonFormLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || ability?.id !== "strength-boost" || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  const demon = activeDemonForm(state, player, definitions);
  if (!demon) return false;
  try { return getAttachedCards(state, momijigariHost(state, player, definitions).instanceId).length > 0; } catch { return false; }
};

export const isKoyoFireBreathingLegal: SkillLegalityPredicate = (state, playerId, _skill, ability) => {
  const player = state.players[playerId];
  return Boolean(player && ability?.id === "thermoregulation" && state.phase === "action" && state.activePlayerId === playerId);
};
