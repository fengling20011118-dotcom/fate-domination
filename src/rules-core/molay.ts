import type { GameState, PlayerState } from "../domain/state/types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getStructuredCardName } from "./card-transforms.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { joinOwnedCardToAttack } from "./card-play.ts";
import type { CardDefinition } from "./content-types.ts";
import { closePlayerCard, createDerivedCardInstance } from "./decks.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const MOLAY_PILGRIM_ID = "servant.molay.skill.sc-molay-1";
export const MOLAY_MOTHER_ID = "servant.molay.skill.sc-molay-2";
export const MOLAY_INVITATION_ID = "servant.molay.skill.sc-molay-3";
export const MOLAY_FOREIGNER_CLASS_ID = "servant.molay.skill.sc-molay-4";

export const MOLAY_PILGRIM_HANDLER = "core.molay-pilgrims-reward";
export const MOLAY_PILGRIM_RESOLVE = "core.molay-pilgrims-reward-resolve";
export const MOLAY_MOTHER_HANDLER = "core.molay-mother-of-goats";
export const MOLAY_INVITATION_HANDLER = "core.molay-goats-invitation";

const TEMPTED_PREFIX = "molayTemptedRound:";
const MOTHER_COST_MODIFIER_ID = `${MOLAY_MOTHER_ID}:attack-cost-plus-three`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function ownedLiveSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return [...new Set([...player.hand, ...player.masterSkills, ...player.servantSkills, ...player.attack])]
    .map((instanceId) => state.cards[instanceId])
    .find((card) => {
      const definition = card ? definitions[card.definitionId] : undefined;
      return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
        && card.zone !== "removed" && card.zone !== "discard" && matchesSkill(definition, card.definitionId, skillId));
    });
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function molayIsForeigner(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  return Number(player.flags.molayForeignerRound ?? -1) === state.round
    || Boolean(activeOwnedSkill(state, player, MOLAY_MOTHER_ID, definitions));
}

function syncMotherPermanent(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): void {
  const mother = activeOwnedSkill(state, player, MOLAY_MOTHER_ID, definitions);
  if (!mother) {
    if (player.flags.servantClassRule === "foreigner" && player.flags.molayMotherClassRule === true) delete player.flags.servantClassRule;
    if (player.flags.servantGenderRule === "female" && player.flags.molayMotherGenderRule === true) delete player.flags.servantGenderRule;
    delete player.flags.molayMotherClassRule;
    delete player.flags.molayMotherGenderRule;
    return;
  }
  player.flags.servantClassRule = "foreigner";
  player.flags.servantGenderRule = "female";
  player.flags.molayMotherClassRule = true;
  player.flags.molayMotherGenderRule = true;
  if (!(player.cardRuleModifiers ?? []).some((modifier) => modifier.id === MOTHER_COST_MODIFIER_ID)) {
    addCardRuleModifier(player, {
      id: MOTHER_COST_MODIFIER_ID,
      sourceId: MOLAY_MOTHER_ID,
      sourceInstanceId: mother.instanceId,
      targetDefinitionIds: Object.keys(definitions),
      costAdd: 3,
      duration: "while-source-active",
    });
  }
}

function controlledActiveForeignerClassIds(state: GameState, player: PlayerState): string[] {
  return player.attack.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.controllerPlayerId === player.id && card.zone === "attack" && card.active && card.face === "up"
      && (card.definitionId === MOLAY_FOREIGNER_CLASS_ID || card.definitionId === `card.skill.${MOLAY_FOREIGNER_CLASS_ID}`));
  });
}

function closePilgrimChoice(state: GameState, player: PlayerState, instanceId: string, definitions: Record<string, CardDefinition>) {
  const pilgrim = activeOwnedSkill(state, player, MOLAY_PILGRIM_ID, definitions);
  const allowed = new Set([...(pilgrim ? [pilgrim.instanceId] : []), ...controlledActiveForeignerClassIds(state, player)]);
  if (!allowed.has(instanceId)) throw new Error("MOLAY_PILGRIM_CLOSE_TARGET_INVALID");
  closePlayerCard(state, player.id, instanceId, definitions);
  return { closedInstanceId: instanceId };
}

function openPilgrimDecision(
  state: GameState,
  player: PlayerState,
  candidates: string[],
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${MOLAY_PILGRIM_ID}:mandatory-close`;
  state.effectQueue.unshift({
    effectId,
    handlerId: MOLAY_PILGRIM_RESOLVE,
    sourceId: MOLAY_PILGRIM_ID,
    controllerPlayerId: player.id,
    payload: { candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "molay-pilgrim-mandatory-close",
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

/** Pilgrim's Reward: mandatory pre-combat close while Foreigner, plus Solomon's Torch. */
export const useMolayPilgrimsReward: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("MOLAY_PILGRIM_CONTEXT_REQUIRED");
  if (payload.eventType === "phase.transitioned") {
    const event = isRecord(payload.event) ? payload.event : {};
    if (event.previousPhase !== "action" || event.transition !== "next-phase" || state.phase !== "combat") return;
    const pilgrim = activeOwnedSkill(state, player, skill.id, definitions);
    if (!pilgrim || !molayIsForeigner(state, player, definitions)) return;
    const candidates = [pilgrim.instanceId, ...controlledActiveForeignerClassIds(state, player)];
    if (candidates.length === 1) return closePilgrimChoice(state, player, candidates[0], definitions);
    openPilgrimDecision(state, player, candidates, definitions, openDecision);
    return { pending: true, candidates };
  }
  if (payload.abilityId !== "solomons-torch" || state.phase !== "combat" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("MOLAY_PILGRIM_WINDOW_INVALID");
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return { affectedPlayerIds: [] };
  const affectedPlayerIds: string[] = [];
  for (const targetId of state.board.locations[locationId] ?? []) {
    const target = state.players[targetId];
    if (!target || target.eliminated) continue;
    const hasNonLuckSpecial = target.attack.some((instanceId) => {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || !definition || card.zone !== "attack" || !card.active || card.face !== "up") return false;
      const attrs = getCardInstanceAttributes(card, definition, state, definitions);
      const isLuck = definition.id === "card.cardluck" || getStructuredCardName(state, target.id, definition, definitions) === "幸运";
      return attrs.includes("特殊") && !isLuck;
    });
    if (!hasNonLuckSpecial) continue;
    target.flags.roundPowerBonus = Number(target.flags.roundPowerBonus ?? 0) - 5;
    affectedPlayerIds.push(target.id);
  }
  return { affectedPlayerIds, power: -5 };
};

export const resolveMolayPilgrimsReward: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("MOLAY_PILGRIM_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidates) ? payload.previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("MOLAY_PILGRIM_DECISION_INVALID");
  return closePilgrimChoice(state, player, selections[0], definitions);
};

export const isMolayPilgrimsRewardLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "solomons-torch" && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions));
};

function nextTemporaryLifeId(state: GameState, targetId: string, sourceId: string): string {
  const prefix = `${targetId}:molay-foreigner:${sourceId}:round-${state.round}:`;
  const next = Object.keys(state.cards).filter((id) => id.startsWith(prefix)).length + 1;
  return `${prefix}${next}`;
}

function createActiveTemporaryForeignerClass(
  state: GameState,
  sourcePlayerId: string,
  target: PlayerState,
  sourceId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent?: SkillContext["emitEvent"],
): string {
  if (!definitions[MOLAY_FOREIGNER_CLASS_ID]) throw new Error("MOLAY_FOREIGNER_CLASS_DEFINITION_MISSING");
  const instanceId = nextTemporaryLifeId(state, target.id, sourceId);
  createDerivedCardInstance(state, target.id, {
    instanceId,
    definitionId: MOLAY_FOREIGNER_CLASS_ID,
    zone: "attack",
    face: "up",
    active: true,
    residual: false,
    temporary: true,
    temporaryCleanup: "round-end",
    sourceEffectId: `${sourceId}:temporary-foreigner-class`,
    createdByPlayerId: sourcePlayerId,
  });
  emitEvent?.("card.created", { playerId: target.id, instanceId, definitionId: MOLAY_FOREIGNER_CLASS_ID, zone: "attack", sourceSkillId: sourceId, temporary: true, active: true });
  return instanceId;
}

function activateMother(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string {
  let mother = activeOwnedSkill(state, player, MOLAY_MOTHER_ID, definitions);
  if (!mother) {
    const resting = ownedLiveSkill(state, player, MOLAY_MOTHER_ID, definitions);
    if (!resting) throw new Error("MOLAY_MOTHER_CARD_MISSING");
    if (resting.zone !== "attack") joinOwnedCardToAttack(state, player.id, resting.instanceId, definitions, { manaCost: 0, allowedSourceZones: [resting.zone] });
    mother = state.cards[resting.instanceId];
    mother.face = "up";
    mother.active = true;
    mother.residual = true;
  }
  revealPlayerTrueName(state, player.id);
  syncMotherPermanent(state, player, definitions);
  return mother.instanceId;
}

/** Mother of Goats: loss transformation, permanent form/cost rule, and Prep distribution. */
export const useMolayMotherOfGoats: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload)) throw new Error("MOLAY_MOTHER_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "combat.resolved") {
    const event = isRecord(payload.event) ? payload.event : {};
    const powers = isRecord(event.powers) ? event.powers : {};
    const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
    if (!Object.prototype.hasOwnProperty.call(powers, player.id) || winners.includes(player.id) || !molayIsForeigner(state, player, definitions)) return;
    return { activatedInstanceId: activateMother(state, player, definitions) };
  }
  if (eventType === "card.played" || eventType === "card.activated" || eventType === "card.closed") {
    syncMotherPermanent(state, player, definitions);
    return;
  }
  if (payload.abilityId !== "mother-prep" || state.phase !== "preparation" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("MOLAY_MOTHER_PREP_WINDOW_INVALID");
  syncMotherPermanent(state, player, definitions);
  const targetIds = state.turnOrder.filter((id) => state.players[id] && !state.players[id].eliminated).slice(0, 2);
  const createdInstanceIds = targetIds.map((targetId) => createActiveTemporaryForeignerClass(state, player.id, state.players[targetId], skill.id, definitions, emitEvent));
  return { targetPlayerIds: targetIds, createdInstanceIds };
};

export const isMolayMotherOfGoatsLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "mother-prep" && state.phase === "preparation" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions));
};

function temptationTargets(state: GameState, player: PlayerState): PlayerState[] {
  if (!player.locationId || !state.board.locations[player.locationId]) return [];
  return (state.board.locations[player.locationId] ?? []).map((id) => state.players[id]).filter((target): target is PlayerState => Boolean(target && !target.eliminated));
}

function resolveTemptedNextRound(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, emitEvent?: SkillContext["emitEvent"]) {
  const created: Array<{ playerId: string; instanceId: string }> = [];
  for (const target of Object.values(state.players)) {
    if (Number(target.flags[`${TEMPTED_PREFIX}${player.id}`] ?? -1) !== state.round) continue;
    delete target.flags[`${TEMPTED_PREFIX}${player.id}`];
    const instanceId = createActiveTemporaryForeignerClass(state, player.id, target, MOLAY_INVITATION_ID, definitions, emitEvent);
    created.push({ playerId: target.id, instanceId });
  }
  return created;
}

/** The Goat's Invitation: defeat-on-play while Foreigner and next-round Tempt payload. */
export const useMolayGoatsInvitation: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload)) throw new Error("MOLAY_INVITATION_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "card.played") {
    const event = isRecord(payload.event) ? payload.event : {};
    const definitionId = typeof event.definitionId === "string" ? event.definitionId : undefined;
    if (event.playerId !== player.id || !definitionId || !matchesSkill(definitions[definitionId], definitionId, skill.id)) return;
    if (molayIsForeigner(state, player, definitions)) {
      return applyDefeatEffect(state, player.id, player.id, definitions, emitEvent, { sourceId: skill.id, method: "goats-invitation" });
    }
    return;
  }
  if (eventType === "round.started") return { created: resolveTemptedNextRound(state, player, definitions, emitEvent) };
  if (payload.abilityId !== "tempt-all" || state.phase !== "combat" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("MOLAY_INVITATION_WINDOW_INVALID");
  const targets = temptationTargets(state, player);
  for (const target of targets) target.flags[`${TEMPTED_PREFIX}${player.id}`] = state.round + 1;
  player.flags.molayForeignerRound = state.round + 1;
  return { temptedPlayerIds: targets.map((target) => target.id), targetRound: state.round + 1 };
};

export const isMolayGoatsInvitationLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "tempt-all" && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions));
};
