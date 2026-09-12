import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { closePlayerCard } from "./decks.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardPlayCost, payManaCost } from "./costs.ts";
import { gainMana, gainVictoryPoints } from "./resources.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ASTOLFO_TRAP_ID = "servant.astolfo.skill.sc-astolfo-2";
export const ASTOLFO_CASSEUR_ID = "servant.astolfo.skill.sc-astolfo-3";
export const ASTOLFO_TRAP_HANDLER = "core.astolfo-trap-of-argalia";
export const ASTOLFO_TRAP_RESOLVE = "core.astolfo-trap-of-argalia-resolve";
export const ASTOLFO_CASSEUR_HANDLER = "core.astolfo-casseur-de-logistille";
export const ASTOLFO_CASSEUR_RESOLVE = "core.astolfo-casseur-de-logistille-resolve";

const TRAP_ABILITY = "forced-spiritform";
const CASSEUR_ABILITY = "spellbreaker";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id && card.zone === "attack"
      && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function sameFightOpponentIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && !state.players[id]?.eliminated);
}

function trapCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  const result: string[] = [];
  for (const opponentId of sameFightOpponentIds(state, player)) {
    const opponent = state.players[opponentId];
    for (const instanceId of opponent.attack) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || !definition || card.controllerPlayerId !== opponentId || card.zone !== "attack" || !card.active || card.face !== "up") continue;
      const attributes = getCardInstanceAttributes(card, definition, state, definitions);
      if (attributes.includes("力量") || attributes.includes("迅捷")) result.push(instanceId);
    }
  }
  return result;
}

function openTrapDecision(
  state: GameState,
  controller: PlayerState,
  instanceId: string,
  remaining: string[],
  openDecision: SkillHandler extends (context: infer C) => unknown ? C extends { openDecision: infer O } ? O : never : never,
): void {
  const card = state.cards[instanceId];
  const chooserId = card?.controllerPlayerId;
  if (!chooserId || !state.players[chooserId]) throw new Error("ASTOLFO_TRAP_TARGET_INVALID");
  const effectId = `${state.gameInstanceId}:${state.revision}:${controller.id}:${ASTOLFO_TRAP_ID}:trap:${instanceId}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: ASTOLFO_TRAP_RESOLVE,
    sourceId: ASTOLFO_TRAP_ID,
    controllerPlayerId: controller.id,
    payload: { stage: "trap-card", instanceId, remaining },
    createdAtRevision: state.revision,
  });
  const options: PendingDecision["options"] = [{ id: "deactivate-gain", label: "关闭并获得魔力" }];
  if (state.players[chooserId].flags.infiniteMana === true || state.players[chooserId].mana >= 3) {
    options.push({ id: "pay-protect", label: "支付3点魔力防止关闭" });
  }
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: controller.id, chooserPlayerIds: [chooserId], kind: "astolfo-trap-card",
    options, min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
}

function processTrap(
  state: GameState,
  controller: PlayerState,
  instanceIds: string[],
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const [instanceId, ...remaining] = instanceIds;
  if (!instanceId) return;
  const card = state.cards[instanceId];
  const chooserId = card?.controllerPlayerId;
  const chooser = chooserId ? state.players[chooserId] : undefined;
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !chooser || !definition || card.zone !== "attack" || !card.active || card.face !== "up") {
    processTrap(state, controller, remaining, definitions, openDecision);
    return;
  }
  const attrs = getCardInstanceAttributes(card, definition, state, definitions);
  if (!sameFightOpponentIds(state, controller).includes(chooser.id) || (!attrs.includes("力量") && !attrs.includes("迅捷"))) {
    processTrap(state, controller, remaining, definitions, openDecision);
    return;
  }
  if (chooser.flags.infiniteMana !== true && chooser.mana < 3) {
    const refund = getCardPlayCost(state, definition, chooser, card, definitions) + 1;
    closePlayerCard(state, chooser.id, instanceId, definitions, { closedByPlayerId: controller.id });
    gainMana(chooser, refund);
    processTrap(state, controller, remaining, definitions, openDecision);
    return;
  }
  openTrapDecision(state, controller, instanceId, remaining, openDecision);
}

export const useAstolfoTrapOfArgalia: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== TRAP_ABILITY || state.phase !== "combat") throw new Error("ASTOLFO_TRAP_ABILITY_INVALID");
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("ASTOLFO_TRAP_SOURCE_INACTIVE");
  processTrap(state, player, trapCandidates(state, player, definitions), definitions, openDecision);
};

export const resolveAstolfoTrapOfArgalia: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("ASTOLFO_TRAP_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const instanceId = typeof previous.instanceId === "string" ? previous.instanceId : undefined;
  const remaining = Array.isArray(previous.remaining) ? previous.remaining.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (previous.stage !== "trap-card" || !instanceId || decision.status !== "resolved" || selections.length !== 1) throw new Error("ASTOLFO_TRAP_DECISION_INVALID");
  const card = state.cards[instanceId];
  const chooserId = card?.controllerPlayerId;
  const chooser = chooserId ? state.players[chooserId] : undefined;
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !chooser || !definition) throw new Error("ASTOLFO_TRAP_TARGET_INVALID");
  if (selections[0] === "pay-protect") {
    payManaCost(state, chooser, 3, definitions);
  } else if (selections[0] === "deactivate-gain") {
    const refund = getCardPlayCost(state, definition, chooser, card, definitions) + 1;
    if (card.zone === "attack" && card.active) closePlayerCard(state, chooser.id, instanceId, definitions, { closedByPlayerId: player.id });
    gainMana(chooser, refund);
  } else throw new Error("ASTOLFO_TRAP_DECISION_INVALID");
  processTrap(state, player, remaining, definitions, openDecision);
};

export const isAstolfoTrapLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === TRAP_ABILITY && state.phase === "combat"
    && activeOwnedSkill(state, player, skill.id, definitions) && trapCandidates(state, player, definitions).length > 0);
};

function skillTargetsAtLocation(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  if (!player.locationId) return [];
  const occupantIds = state.board.locations[player.locationId] ?? [];
  const helperCapacity = Object.values(state.players).filter((candidate) => candidate.id !== player.id && !candidate.eliminated
    && (candidate.flags.infiniteMana === true || candidate.mana >= 1)).length;
  const result: string[] = [];
  for (const occupantId of occupantIds) {
    const occupant = state.players[occupantId];
    for (const instanceId of occupant.attack) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || !definition || !definition.isSkill || !card.active || card.face !== "up" || card.controllerPlayerId !== occupantId) continue;
      const cost = getCardPlayCost(state, definition, occupant, card, definitions);
      const ownMana = player.flags.infiniteMana === true ? cost : player.mana;
      if (ownMana + helperCapacity >= cost) result.push(instanceId);
    }
  }
  return result;
}

function openCasseurTarget(state: GameState, player: PlayerState, targets: string[], openDecision: Parameters<SkillHandler>[0]["openDecision"]): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${ASTOLFO_CASSEUR_ID}:target`;
  state.effectQueue.unshift({ effectId, handlerId: ASTOLFO_CASSEUR_RESOLVE, sourceId: ASTOLFO_CASSEUR_ID, controllerPlayerId: player.id,
    payload: { stage: "choose-target", targets }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "astolfo-casseur-target",
    options: targets.map((id) => ({ id, label: id })), min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {} });
}

function openCasseurHelpers(
  state: GameState,
  player: PlayerState,
  targetInstanceId: string,
  cost: number,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  const helperIds = Object.values(state.players).filter((candidate) => candidate.id !== player.id && !candidate.eliminated
    && (candidate.flags.infiniteMana === true || candidate.mana >= 1)).map((candidate) => candidate.id);
  if (helperIds.length === 0 || cost <= 0) return;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${ASTOLFO_CASSEUR_ID}:helpers:${targetInstanceId}`;
  state.effectQueue.unshift({ effectId, handlerId: ASTOLFO_CASSEUR_RESOLVE, sourceId: ASTOLFO_CASSEUR_ID, controllerPlayerId: player.id,
    payload: { stage: "choose-helpers", targetInstanceId, cost, helperIds }, createdAtRevision: state.revision });
  openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: helperIds, kind: "astolfo-casseur-help",
    options: [{ id: "help", label: "帮助支付1点魔力" }, { id: "decline", label: "不帮助" }], min: 1, max: 1, allowCancel: false,
    continuationEffectId: effectId, submissions: {} });
}

function resolveCasseurPayment(state: GameState, player: PlayerState, targetInstanceId: string, cost: number, helperIds: string[], definitions: Record<string, CardDefinition>): { helpers: string[] } {
  const card = state.cards[targetInstanceId];
  const controller = card?.controllerPlayerId ? state.players[card.controllerPlayerId] : undefined;
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !controller || !definition || !definition.isSkill || card.zone !== "attack" || !card.active) throw new Error("ASTOLFO_CASSEUR_TARGET_INVALID");
  const accepted = helperIds.filter((id, index) => index < cost);
  const remainder = Math.max(0, cost - accepted.length);
  if (player.flags.infiniteMana !== true && player.mana < remainder) return { helpers: [] };
  payManaCost(state, player, remainder, definitions);
  for (const helperId of accepted) {
    const helper = state.players[helperId];
    if (!helper || helper.eliminated || (helper.flags.infiniteMana !== true && helper.mana < 1)) throw new Error("ASTOLFO_CASSEUR_HELPER_INVALID");
    payManaCost(state, helper, 1, definitions);
    gainVictoryPoints(helper, 1);
  }
  closePlayerCard(state, controller.id, targetInstanceId, definitions, { closedByPlayerId: player.id });
  return { helpers: accepted };
}

export const useAstolfoCasseurDeLogistille: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== CASSEUR_ABILITY || state.phase !== "combat") throw new Error("ASTOLFO_CASSEUR_ABILITY_INVALID");
  if (!activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("ASTOLFO_CASSEUR_SOURCE_INACTIVE");
  const targets = skillTargetsAtLocation(state, player, definitions);
  if (targets.length === 0) throw new Error("ASTOLFO_CASSEUR_NO_TARGET");
  if (!player.trueNameRevealed) {
    revealPlayerTrueName(state, player.id);
    emitEvent?.("servant.true-name-revealed", { playerId: player.id, servantId: player.servantId, sourceDefinitionId: skill.id, method: "spellbreaker" });
  }
  const direct = typeof payload.targetInstanceId === "string" ? payload.targetInstanceId : undefined;
  if (!direct) { openCasseurTarget(state, player, targets, openDecision); return; }
  if (!targets.includes(direct)) throw new Error("ASTOLFO_CASSEUR_TARGET_INVALID");
  const card = state.cards[direct];
  const controller = state.players[card.controllerPlayerId!];
  const cost = getCardPlayCost(state, definitions[card.definitionId], controller, card, definitions);
  const helperIds = Object.values(state.players).filter((candidate) => candidate.id !== player.id && !candidate.eliminated
    && (candidate.flags.infiniteMana === true || candidate.mana >= 1)).map((candidate) => candidate.id);
  if (helperIds.length === 0 || cost === 0) return resolveCasseurPayment(state, player, direct, cost, [], definitions);
  openCasseurHelpers(state, player, direct, cost, openDecision);
};

export const resolveAstolfoCasseurDeLogistille: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("ASTOLFO_CASSEUR_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  if (decision.status !== "resolved") throw new Error("ASTOLFO_CASSEUR_DECISION_INVALID");
  if (previous.stage === "choose-target") {
    const targets = Array.isArray(previous.targets) ? previous.targets.filter((id): id is string => typeof id === "string") : [];
    const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
    if (selections.length !== 1 || !targets.includes(selections[0])) throw new Error("ASTOLFO_CASSEUR_TARGET_INVALID");
    const targetInstanceId = selections[0];
    const card = state.cards[targetInstanceId];
    const controller = card?.controllerPlayerId ? state.players[card.controllerPlayerId] : undefined;
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !controller || !definition) throw new Error("ASTOLFO_CASSEUR_TARGET_INVALID");
    const cost = getCardPlayCost(state, definition, controller, card, definitions);
    const helperIds = Object.values(state.players).filter((candidate) => candidate.id !== player.id && !candidate.eliminated
      && (candidate.flags.infiniteMana === true || candidate.mana >= 1)).map((candidate) => candidate.id);
    if (helperIds.length === 0 || cost === 0) return resolveCasseurPayment(state, player, targetInstanceId, cost, [], definitions);
    openCasseurHelpers(state, player, targetInstanceId, cost, openDecision);
    return;
  }
  if (previous.stage === "choose-helpers") {
    const targetInstanceId = typeof previous.targetInstanceId === "string" ? previous.targetInstanceId : undefined;
    const cost = Number(previous.cost);
    const helperIds = Array.isArray(previous.helperIds) ? previous.helperIds.filter((id): id is string => typeof id === "string") : [];
    if (!targetInstanceId || !Number.isInteger(cost) || cost < 0 || !isRecord(decision.submissions)) throw new Error("ASTOLFO_CASSEUR_DECISION_INVALID");
    const accepted = helperIds.filter((helperId) => {
      const selection = decision.submissions[helperId];
      return Array.isArray(selection) && selection.length === 1 && selection[0] === "help";
    });
    return resolveCasseurPayment(state, player, targetInstanceId, cost, accepted, definitions);
  }
  throw new Error("ASTOLFO_CASSEUR_DECISION_INVALID");
};

export const isAstolfoCasseurLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === CASSEUR_ABILITY && state.phase === "combat"
    && activeOwnedSkill(state, player, skill.id, definitions) && skillTargetsAtLocation(state, player, definitions).length > 0);
};
