import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { isBattlefieldLocation } from "./battlefield-rules.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { cardHasStructuredName } from "./card-transforms.ts";
import type { CardDefinition } from "./content-types.ts";
import { applyTemporaryCardDefinitionCopy } from "./decks.ts";
import { payCommandSealCost } from "./command-seals.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const LANCELOT_MASTERY_ID = "servant.lance.skill.sc-lance-1";
export const LANCELOT_GLORY_PASSIVE_ID = "servant.lance.skill.sc-lance-2";
export const LANCELOT_GLORY_NP_ID = "servant.lance.skill.sc-lance-3";
export const LANCELOT_MASTERY_HANDLER = "core.lancelot-eternal-arms-mastery";
export const LANCELOT_GLORY_HANDLER = "core.lancelot-for-someones-glory";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(card: CardInstance | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || definition?.linkedSkillId === skillId || card.fullSkillCopy?.sourceSkillId === skillId));
}

function activeOwnedSkillSource(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.face === "up" && card.active && matchesSkill(card, definition, skillId));
  });
}

function fightPlayerIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (!locationId || !isBattlefieldLocation(state, locationId)) return [];
  const occupants = (state.board.locations[locationId] ?? []).filter((playerId) => {
    const candidate = state.players[playerId];
    return Boolean(candidate && !candidate.eliminated && candidate.locationId === locationId);
  });
  if (!occupants.includes(player.id) || !occupants.some((playerId) => playerId !== player.id)) return [];
  return occupants;
}

function controlsActiveLuck(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  return player.attack.some((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.controllerPlayerId === player.id && card.face === "up" && card.active
      && cardHasStructuredName(state, player.id, definition, definitions, "幸运"));
  });
}

export function getLancelotMasteryCandidates(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): string[] {
  const participantIds = new Set(fightPlayerIds(state, player));
  if (participantIds.size === 0) return [];
  const source = activeOwnedSkillSource(state, player, LANCELOT_MASTERY_ID, definitions);
  if (!source) return [];
  return [...participantIds].flatMap((playerId) => state.players[playerId].attack).filter((instanceId) => {
    if (instanceId === source.instanceId) return false;
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || !participantIds.has(card.controllerPlayerId ?? "")) return false;
    if (card.zone !== "attack" || card.face !== "up" || !card.active || card.residual) return false;
    const attributes = getCardInstanceAttributes(card, definition, state, definitions);
    return attributes.includes("力量") || attributes.includes("迅捷");
  });
}

/** Eternal Arms Mastery: this physical card becomes the chosen attack; target-instance state is never copied. */
export const useLancelotEternalArmsMastery: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("LANCELOT_MASTERY_CONTEXT_REQUIRED");
  const source = activeOwnedSkillSource(state, player, skill.id, definitions);
  if (!source) throw new Error("LANCELOT_MASTERY_SOURCE_INACTIVE");
  if (player.defeated && !controlsActiveLuck(state, player, definitions)) throw new Error("LANCELOT_MASTERY_DEFEATED_WITHOUT_LUCK");
  const targetInstanceId = typeof payload.targetInstanceId === "string" ? payload.targetInstanceId : undefined;
  if (!targetInstanceId || !getLancelotMasteryCandidates(state, player, definitions).includes(targetInstanceId)) {
    throw new Error("LANCELOT_MASTERY_TARGET_INVALID");
  }
  const target = state.cards[targetInstanceId];
  const ownTarget = target.controllerPlayerId === player.id;
  applyTemporaryCardDefinitionCopy(state, source.instanceId, targetInstanceId, definitions, {
    sourceId: skill.id,
    expiresRound: state.round,
    extraPower: ownTarget ? 3 : 0,
    rebindNamedOwnerToController: false,
  });
  return { sourceInstanceId: source.instanceId, targetInstanceId, ownTarget, powerBonus: ownTarget ? 3 : 0 };
};

export const isLancelotEternalArmsMasteryLegal: SkillLegalityPredicate = (state, playerId, skill, _ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.phase !== "combat" || state.activePlayerId !== playerId) return false;
  if (!activeOwnedSkillSource(state, player, skill.id, definitions)) return false;
  if (player.defeated && !controlsActiveLuck(state, player, definitions)) return false;
  return getLancelotMasteryCandidates(state, player, definitions).length > 0;
};

function isRevealedCopyTarget(card: CardInstance, definition: CardDefinition): boolean {
  if (card.zone === "removed" || card.zone === "deck" || card.zone === "discard") return false;
  if (card.face !== "up" && card.publiclyRevealed !== true) return false;
  if (definition.limit === "once-per-game") return false;
  return definition.cardType === "attack" || definition.cardType === "skill" || definition.isSkill === true || Boolean(definition.linkedSkillId);
}

export function getLancelotGloryCandidates(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): string[] {
  const sourceIds = new Set([...player.masterSkills, ...player.servantSkills, ...player.hand, ...player.attack]);
  return Object.values(state.cards).filter((card) => {
    if (sourceIds.has(card.instanceId) && card.ownerPlayerId === player.id
      && (card.definitionId === LANCELOT_GLORY_NP_ID || definitions[card.definitionId]?.linkedSkillId === LANCELOT_GLORY_NP_ID)) return false;
    const definition = definitions[card.definitionId];
    return Boolean(definition && isRevealedCopyTarget(card, definition));
  }).map((card) => card.instanceId);
}

function copiedPrintedManaCost(state: GameState, definition: CardDefinition): number {
  let cost = Number(definition.cost ?? 0);
  if (definition.costRule) {
    if (definition.costRule.kind === "round-linear") {
      cost = Math.max(definition.costRule.min, definition.costRule.base + definition.costRule.perRound * state.round);
    } else if (definition.costRule.kind === "player-count-minus-round") {
      const offset = Number(definition.costRule.offset ?? 0);
      if (!Number.isInteger(offset)) throw new Error("LANCELOT_COPY_COST_RULE_UNSUPPORTED");
      cost = Math.max(definition.costRule.min, Object.keys(state.players).length + offset - state.round);
    } else {
      throw new Error("LANCELOT_COPY_COST_RULE_UNSUPPORTED");
    }
  }
  if (!Number.isInteger(cost) || cost < 0) throw new Error("LANCELOT_COPY_COST_INVALID");
  if (cost === 0) return 0;
  return Math.min(Math.floor(cost / 2), Math.max(0, cost - 4));
}

function restingGlorySource(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): CardInstance | undefined {
  return [...player.servantSkills, ...player.masterSkills, ...player.hand, ...player.attack]
    .map((instanceId) => state.cards[instanceId])
    .find((card) => {
      if (!card || card.ownerPlayerId !== player.id || card.controllerPlayerId !== player.id || card.zone === "removed") return false;
      const definition = definitions[card.definitionId];
      return matchesSkill(card, definition, LANCELOT_GLORY_NP_ID) && !card.temporaryDefinitionCopy;
    });
}

/** For Someone's Glory: pay a Command Seal and transform this same physical card into a revealed card copy until round end. */
export const useLancelotForSomeonesGlory: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("LANCELOT_GLORY_CONTEXT_REQUIRED");
  if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("LANCELOT_GLORY_WINDOW_INVALID");
  const source = restingGlorySource(state, player, definitions);
  if (!source) throw new Error("LANCELOT_GLORY_SOURCE_UNAVAILABLE");
  const targetInstanceId = typeof payload.targetInstanceId === "string" ? payload.targetInstanceId : undefined;
  if (!targetInstanceId || !getLancelotGloryCandidates(state, player, definitions).includes(targetInstanceId)) {
    throw new Error("LANCELOT_GLORY_TARGET_INVALID");
  }
  const target = state.cards[targetInstanceId];
  const targetDefinition = definitions[target.definitionId];
  const copiedManaCost = copiedPrintedManaCost(state, targetDefinition);
  const paid = payCommandSealCost(state, player.id, 1);
  applyTemporaryCardDefinitionCopy(state, source.instanceId, targetInstanceId, definitions, {
    sourceId: skill.id,
    expiresRound: state.round,
    copiedManaCost,
    rebindNamedOwnerToController: false,
  });
  return { sourceInstanceId: source.instanceId, targetInstanceId, copiedManaCost, ...paid };
};

export const isLancelotForSomeonesGloryLegal: SkillLegalityPredicate = (state, playerId, _skill, _ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  if (!restingGlorySource(state, player, definitions)) return false;
  if (player.commandSeals < 1 && Number(player.flags.commandSealPaymentCredits ?? 0) < 1) return false;
  return getLancelotGloryCandidates(state, player, definitions).length > 0;
};
