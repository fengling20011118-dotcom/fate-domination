import type { GameState, PlayerState } from "../domain/state/types.ts";
import { joinOwnedCardToAttack } from "./card-play.ts";
import { calculateHypotheticalCombatCardPower } from "./combat-power.ts";
import type { CardDefinition } from "./content-types.ts";
import { removePhysicalCardFromGame, movePlayerCard } from "./decks.ts";
import { getCardPlayCost, payManaCost } from "./costs.ts";
import { adjustVictoryPoints } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const PENTHESILEA_ROAR_ID = "servant.penthesilea.skill.sc-penthesilea-1";
export const PENTHESILEA_BEAUTY_ID = "servant.penthesilea.skill.sc-penthesilea-2";
export const PENTHESILEA_EVICERATE_ID = "servant.penthesilea.skill.sc-penthesilea-3";
export const PENTHESILEA_ROAR_HANDLER = "core.penthesilea-war-god-roar";
export const PENTHESILEA_BEAUTY_HANDLER = "core.penthesilea-divine-beauty";
export const PENTHESILEA_BEAUTY_RESOLVE = "core.penthesilea-divine-beauty-resolve";
export const PENTHESILEA_EVICERATE_HANDLER = "core.penthesilea-evicerate";
export const PENTHESILEA_EVICERATE_RESOLVE = "core.penthesilea-evicerate-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string | undefined, skillId: string): boolean {
  return Boolean(definitionId && (definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId));
}

function ownedSkillInstance(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return [...new Set([...player.servantSkills, ...player.attack, ...player.hand])]
    .map((instanceId) => state.cards[instanceId])
    .find((card) => card?.ownerPlayerId === player.id && card.zone !== "removed"
      && matchesSkill(card ? definitions[card.definitionId] : undefined, card?.definitionId, skillId));
}

function activeSkillInstance(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function battlefieldOpponentIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated);
}

function installRoarRules(state: GameState, player: PlayerState, sourceInstanceId: string): void {
  const basePowerId = `${PENTHESILEA_ROAR_ID}:basic-base-zero:${sourceInstanceId}`;
  const defeatId = `${PENTHESILEA_ROAR_ID}:lower-power-defeat:${sourceInstanceId}`;
  state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => modifier.id !== basePowerId && modifier.id !== defeatId);
  state.activeRuleModifiers.push({
    id: basePowerId,
    sourceId: PENTHESILEA_ROAR_ID,
    sourceInstanceId,
    controllerPlayerId: player.id,
    operation: "set",
    rule: "card_base_power",
    scope: { subject: "controller", cards: { basic: true } },
    value: 0,
    duration: "while-source-active",
    createdRound: state.round,
  });
  state.activeRuleModifiers.push({
    id: defeatId,
    sourceId: PENTHESILEA_ROAR_ID,
    sourceInstanceId,
    controllerPlayerId: player.id,
    operation: "allow",
    rule: "combat_post_power_defeat_lower_than_controller",
    scope: { subject: "opponents_at_source_battlefield" },
    value: true,
    duration: "while-source-active",
    createdRound: state.round,
  });
}

export const usePenthesileaRoar: SkillHandler = ({ state, player, skill, definitions }) => {
  if (!definitions || state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("PENTHESILEA_ROAR_WINDOW_INVALID");
  const source = ownedSkillInstance(state, player, skill.id, definitions);
  if (!source) throw new Error("PENTHESILEA_ROAR_SOURCE_MISSING");
  if (source.zone !== "attack") {
    joinOwnedCardToAttack(state, player.id, source.instanceId, definitions, { allowedSourceZones: ["servant-skills"] });
  }
  source.face = "up";
  source.active = true;
  installRoarRules(state, player, source.instanceId);
  return { sourceInstanceId: source.instanceId };
};

export const isPenthesileaRoarLegal: SkillLegalityPredicate = (state, playerId, skill, _ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.phase !== "outpost" || state.activePlayerId !== playerId) return false;
  const source = ownedSkillInstance(state, player, skill.id, definitions);
  return Boolean(source && (source.zone === "servant-skills" || (source.zone === "attack" && source.active && source.face === "up")));
};

function genderOptions(player: PlayerState): Array<{ id: string; label: string }> {
  if (player.flags.servantGenderRule === "male") return [{ id: "male", label: "男性" }];
  if (player.flags.servantGenderRule === "female") return [{ id: "not-male", label: "非男性" }];
  return [{ id: "male", label: "男性" }, { id: "not-male", label: "非男性" }];
}

function removePenthesileaBasics(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  const ids = [...new Set([...player.hand, ...player.deck, ...player.discard, ...player.attack])].filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && definitions[card.definitionId]?.basic === true);
  });
  for (const instanceId of ids) removePhysicalCardFromGame(state, instanceId);
  return ids;
}

function resolveBeautyEffect(
  state: GameState,
  player: PlayerState,
  sourceInstanceId: string,
  malePlayerIds: string[],
  definitions: Record<string, CardDefinition>,
) {
  const modifierId = `${PENTHESILEA_BEAUTY_ID}:eternal-humiliation:${sourceInstanceId}:${state.round}`;
  state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => modifier.id !== modifierId);
  if (malePlayerIds.length > 0) {
    state.activeRuleModifiers.push({
      id: modifierId,
      sourceId: PENTHESILEA_BEAUTY_ID,
      sourceInstanceId,
      controllerPlayerId: player.id,
      operation: "add",
      rule: "combat_power",
      scope: { subject: "players_at_source_battlefield", playerIds: [...malePlayerIds] },
      value: -15,
      duration: "round",
      createdRound: state.round,
    });
  }
  return { malePlayerIds, removedBasicInstanceIds: removePenthesileaBasics(state, player, definitions) };
}

function openBeautyGenderDecision(
  state: GameState,
  player: PlayerState,
  sourceInstanceId: string,
  remainingPlayerIds: string[],
  malePlayerIds: string[],
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): unknown {
  const [targetPlayerId, ...remaining] = remainingPlayerIds.filter((id) => state.players[id] && !state.players[id].eliminated);
  if (!targetPlayerId) return resolveBeautyEffect(state, player, sourceInstanceId, malePlayerIds, definitions);
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${PENTHESILEA_BEAUTY_ID}:gender:${targetPlayerId}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: PENTHESILEA_BEAUTY_RESOLVE,
    sourceId: PENTHESILEA_BEAUTY_ID,
    controllerPlayerId: player.id,
    payload: { sourceInstanceId, targetPlayerId, remainingPlayerIds: remaining, malePlayerIds },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: targetPlayerId,
    chooserPlayerIds: [targetPlayerId],
    kind: "penthesilea-reveal-servant-gender",
    options: genderOptions(state.players[targetPlayerId]),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, targetPlayerId };
}

export const usePenthesileaDivineBeauty: SkillHandler = ({ state, player, skill, definitions, openDecision }) => {
  if (!definitions || state.phase !== "combat") throw new Error("PENTHESILEA_BEAUTY_WINDOW_INVALID");
  const source = activeSkillInstance(state, player, skill.id, definitions);
  if (!source) throw new Error("PENTHESILEA_BEAUTY_SOURCE_INACTIVE");
  const opponents = battlefieldOpponentIds(state, player);
  return openBeautyGenderDecision(state, player, source.instanceId, opponents, [], definitions, openDecision);
};

export const resolvePenthesileaDivineBeauty: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("PENTHESILEA_BEAUTY_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  const sourceInstanceId = typeof previous.sourceInstanceId === "string" ? previous.sourceInstanceId : undefined;
  const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
  const remainingPlayerIds = Array.isArray(previous.remainingPlayerIds) ? previous.remainingPlayerIds.filter((id): id is string => typeof id === "string") : [];
  const malePlayerIds = Array.isArray(previous.malePlayerIds) ? previous.malePlayerIds.filter((id): id is string => typeof id === "string") : [];
  if (!sourceInstanceId || !targetPlayerId || decision.status !== "resolved" || selections.length !== 1
    || !genderOptions(state.players[targetPlayerId]).some((option) => option.id === selections[0])) throw new Error("PENTHESILEA_BEAUTY_DECISION_INVALID");
  if (selections[0] === "male") malePlayerIds.push(targetPlayerId);
  return openBeautyGenderDecision(state, player, sourceInstanceId, remainingPlayerIds, malePlayerIds, definitions, openDecision);
};

export const isPenthesileaDivineBeautyLegal: SkillLegalityPredicate = (state, playerId, skill, _ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && state.phase === "combat" && activeSkillInstance(state, player, skill.id, definitions));
};

function evicerateCandidateIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && definitions[card.definitionId]?.cardType === "attack");
  });
}

export const usePenthesileaEvicerate: SkillHandler = ({ state, player, definitions, openDecision }) => {
  if (!definitions || state.phase !== "combat" || state.activePlayerId !== player.id) throw new Error("PENTHESILEA_EVICERATE_WINDOW_INVALID");
  const candidates = evicerateCandidateIds(state, player, definitions);
  if (candidates.length === 0) throw new Error("PENTHESILEA_EVICERATE_NO_ATTACK");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${PENTHESILEA_EVICERATE_ID}:discard`;
  state.effectQueue.unshift({
    effectId,
    handlerId: PENTHESILEA_EVICERATE_RESOLVE,
    sourceId: PENTHESILEA_EVICERATE_ID,
    controllerPlayerId: player.id,
    payload: { candidateIds: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "penthesilea-evicerate-attack",
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, candidateInstanceIds: candidates };
};

export const resolvePenthesileaEvicerate: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("PENTHESILEA_EVICERATE_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0]) || !player.hand.includes(selections[0])) {
    throw new Error("PENTHESILEA_EVICERATE_DECISION_INVALID");
  }
  const instanceId = selections[0];
  const instance = state.cards[instanceId];
  const definition = definitions[instance.definitionId];
  if (!definition || definition.cardType !== "attack") throw new Error("PENTHESILEA_EVICERATE_ATTACK_INVALID");
  const cardPower = calculateHypotheticalCombatCardPower(state, player.id, instanceId, definitions, player.locationId ?? undefined);
  const manaCost = getCardPlayCost(state, definition, player, instance, definitions);
  payManaCost(state, player, manaCost, definitions);
  if (manaCost > 0) player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + manaCost;
  movePlayerCard(state, player.id, instanceId, "discard");
  const victoryPointLoss = Math.ceil(Math.max(0, cardPower) / 3);
  const targetPlayerIds = battlefieldOpponentIds(state, player);
  for (const targetPlayerId of targetPlayerIds) adjustVictoryPoints(state.players[targetPlayerId], -victoryPointLoss);
  return { discardedInstanceId: instanceId, paidMana: manaCost, cardPower, victoryPointLoss, targetPlayerIds };
};

export const isPenthesileaEvicerateLegal: SkillLegalityPredicate = (state, playerId, _skill, _ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && state.phase === "combat" && state.activePlayerId === playerId
    && battlefieldOpponentIds(state, player).length > 0 && evicerateCandidateIds(state, player, definitions).length > 0);
};
