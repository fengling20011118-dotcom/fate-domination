import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import { type CardDefinition } from "./content-types.ts";
import { closePlayerCard, drawCards } from "./decks.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const BARGHEST_CHAINS_ID = "servant.barghest.skill.sc-barghest-1";
export const BARGHEST_GALATINE_ID = "servant.barghest.skill.sc-barghest-2";
export const BARGHEST_SUN_ID = "servant.barghest.skill.sc-barghest-3";
export const BARGHEST_CHAINS_HANDLER = "core.barghest-demon-chains";
export const BARGHEST_GALATINE_HANDLER = "core.barghest-black-dog-galatine";
export const BARGHEST_GALATINE_RESOLVE = "core.barghest-black-dog-galatine.resolve";
export const BARGHEST_SUN_HANDLER = "core.barghest-sun-devourer";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(card: GameState["cards"][string] | undefined, skillId: string, definitions: Record<string, CardDefinition>): boolean {
  if (!card) return false;
  const definition = definitions[card.definitionId];
  return card.definitionId === skillId || card.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => Boolean(
    card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
    && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(card, skillId, definitions),
  ));
}

function attackUsedActionOrCombatAbilityThisRound(
  state: GameState,
  player: PlayerState,
  instance: GameState["cards"][string],
  definition: CardDefinition,
): boolean {
  const cardPhases = definition.phases ?? [];
  const hasActionOrCombatWindow = cardPhases.includes("action") || cardPhases.includes("combat");
  if (hasActionOrCombatWindow && Object.values(instance.abilityUsage ?? {}).some((usage) => usage.round === state.round && usage.used !== false)) return true;
  const linkedSkillId = definition.linkedSkillId ?? (definition.isSkill ? definition.id : undefined);
  if (!linkedSkillId || !hasActionOrCombatWindow) return false;
  return Object.entries(player.usage).some(([key, usage]) => key.startsWith(`${linkedSkillId}:`)
    && usage.round === state.round && usage.used !== false);
}

/** Demon Chains / Wild Rule: zero attacks in Barghest's fight that actually used an Action/Combat ability this round. */
export const useBarghestDemonChains: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== "wild-rule") throw new Error("BARGHEST_WILD_RULE_CONTEXT_REQUIRED");
  if (state.phase !== "combat" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, skill.id, definitions)) {
    throw new Error("BARGHEST_WILD_RULE_WINDOW_INVALID");
  }
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") throw new Error("BARGHEST_WILD_RULE_BATTLEFIELD_REQUIRED");
  const affectedInstanceIds: string[] = [];
  for (const opponentId of state.board.locations[locationId] ?? []) {
    if (opponentId === player.id) continue;
    const opponent = state.players[opponentId];
    if (!opponent || opponent.eliminated) continue;
    for (const instanceId of opponent.attack) {
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      if (!instance || !definition || !instance.active || instance.face !== "up" || instance.zone !== "attack") continue;
      if (!attackUsedActionOrCombatAbilityThisRound(state, opponent, instance, definition)) continue;
      const modifierId = `${skill.id}:wild-rule:${state.round}:${instanceId}`;
      instance.powerModifiers = [
        ...(instance.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
        { id: modifierId, sourceId: skill.id, kind: "set", value: 0, duration: "round" },
      ];
      affectedInstanceIds.push(instanceId);
    }
  }
  return { affectedInstanceIds };
};

export const isBarghestDemonChainsLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "wild-rule" && state.phase === "combat" && state.activePlayerId === playerId
    && (player.locationId === "mountain" || player.locationId === "city") && activeOwnedSkill(state, player, skill.id, definitions));
};

function applyGalatineSelection(
  state: GameState,
  player: PlayerState,
  skillId: string,
  selectedInstanceIds: string[],
  definitions: Record<string, CardDefinition>,
  emitEvent?: SkillContext["emitEvent"],
) {
  if (selectedInstanceIds.length > 3 || new Set(selectedInstanceIds).size !== selectedInstanceIds.length
    || selectedInstanceIds.some((instanceId) => !player.hand.includes(instanceId))) throw new Error("BARGHEST_GALATINE_SELECTION_INVALID");
  const printedPowers = selectedInstanceIds.map((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition) throw new Error("BARGHEST_GALATINE_CARD_INVALID");
    emitEvent?.("card.revealed", { playerId: player.id, instanceId, definitionId: definition.id, sourceSkillId: skillId, method: "black-dog-galatine" });
    return getPrintedCardBasePower(state, player, definition);
  });
  const powerBonus = selectedInstanceIds.length === 3 && printedPowers.every((power) => power === 3)
    ? 15
    : printedPowers.reduce((sum, power) => sum + power, 0);
  const source = activeOwnedSkill(state, player, skillId, definitions);
  if (!source) throw new Error("BARGHEST_GALATINE_SOURCE_INACTIVE");
  const modifierId = `${skillId}:black-dog-galatine:${state.round}`;
  source.powerModifiers = [
    ...(source.powerModifiers ?? []).filter((modifier) => modifier.id !== modifierId),
    { id: modifierId, sourceId: skillId, kind: "add", value: powerBonus, duration: "round" },
  ];
  return { revealedInstanceIds: selectedInstanceIds, printedPowers, powerBonus };
}

function openGalatineDecision(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>, openDecision: SkillContext["openDecision"]): void {
  const candidates = [...player.hand];
  if (candidates.length === 0) return;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skillId}:reveal`;
  state.effectQueue.unshift({
    effectId,
    handlerId: BARGHEST_GALATINE_RESOLVE,
    sourceId: skillId,
    controllerPlayerId: player.id,
    payload: { candidateInstanceIds: candidates },
    createdAtRevision: state.revision,
  });
  const decision: PendingDecision = {
    decisionId: `${effectId}:decision`,
    chooserPlayerIds: [player.id],
    kind: "barghest-galatine-reveal",
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 0,
    max: Math.min(3, candidates.length),
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  };
  openDecision(decision);
}

/** Black Dog Galatine: reveal up to three hand cards and add their printed power, except three printed 3s give +15. */
export const useBarghestBlackDogGalatine: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== "devour") throw new Error("BARGHEST_GALATINE_CONTEXT_REQUIRED");
  if (state.phase !== "action" || state.activePlayerId !== player.id || !activeOwnedSkill(state, player, skill.id, definitions)) {
    throw new Error("BARGHEST_GALATINE_WINDOW_INVALID");
  }
  const selected = Array.isArray(payload.selectedInstanceIds)
    ? payload.selectedInstanceIds.filter((value): value is string => typeof value === "string")
    : undefined;
  if (selected) return applyGalatineSelection(state, player, skill.id, selected, definitions, emitEvent);
  if (player.hand.length === 0) return applyGalatineSelection(state, player, skill.id, [], definitions, emitEvent);
  openGalatineDecision(state, player, skill.id, definitions, openDecision);
  return { pending: true };
};

export const resolveBarghestBlackDogGalatine: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("BARGHEST_GALATINE_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateInstanceIds)
    ? payload.previous.candidateInstanceIds.filter((value): value is string => typeof value === "string")
    : [];
  const selections = Array.isArray(payload.decision.selections)
    ? payload.decision.selections.filter((value): value is string => typeof value === "string")
    : [];
  if (payload.decision.status !== "resolved" || selections.some((id) => !candidates.includes(id))) throw new Error("BARGHEST_GALATINE_DECISION_INVALID");
  return applyGalatineSelection(state, player, BARGHEST_GALATINE_ID, selections, definitions, emitEvent);
};

export const isBarghestBlackDogGalatineLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "devour" && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions));
};

function isOwnActionTurnStart(state: GameState, player: PlayerState, event: Record<string, unknown>): boolean {
  if (state.phase !== "action" || state.activePlayerId !== player.id) return false;
  if (event.transition === "next-phase" && event.previousPhase === "outpost") return true;
  return event.transition === "next-player" && event.previousPhase === "action";
}

/** Sun Devourer: active residual closes on entering Workshop; at own Action-turn start draw 2 and restrict this round's plays. */
export const useBarghestSunDevourer: SkillHandler = ({ state, player, skill, payload, definitions, randomInt }) => {
  if (!definitions || !isRecord(payload)) throw new Error("BARGHEST_SUN_CONTEXT_REQUIRED");
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) return;
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType === "player.entered-location") {
    if (event.playerId !== player.id || event.locationId !== "workshop") return;
    closePlayerCard(state, player.id, source.instanceId, definitions);
    if (player.roundPlayRestriction?.sourceId === skill.id) delete player.roundPlayRestriction;
    return { closedInstanceId: source.instanceId };
  }
  if (eventType !== "phase.transitioned" || !isOwnActionTurnStart(state, player, event)
    || Number(player.flags.barghestSunDevourerDrawRound ?? -1) === state.round) return;
  const drawn = drawCards(state, player.id, 2, randomInt ?? (() => 0), definitions)
    .filter((instanceId) => state.cards[instanceId]?.zone === "hand");
  const specialDrawn = drawn.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && getCardInstanceAttributes(card, definition, state, definitions).includes("特殊"));
  });
  player.flags.barghestSunDevourerDrawRound = state.round;
  player.roundPlayRestriction = {
    round: state.round,
    sourceId: skill.id,
    allowedInstanceIds: drawn,
    substitution: { eligibleDiscardInstanceIds: specialDrawn, targetKind: "skill", costReduction: 2 },
  };
  return { drawnInstanceIds: drawn, specialDrawnInstanceIds: specialDrawn };
};
