import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { closePlayerCard } from "./decks.ts";
import { forbidOpponentAbilityActivationOnBattlefield } from "./ability-activation-restrictions.ts";
import { gainMana } from "./resources.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const SASAKI_FIRST_ID = "servant.sasaki.skill.sc-sasaki-1";
export const SASAKI_SECOND_ID = "servant.sasaki.skill.sc-sasaki-2";
export const SASAKI_THIRD_ID = "servant.sasaki.skill.sc-sasaki-3";

export const SASAKI_FIRST_HANDLER = "core.sasaki-first-strike";
export const SASAKI_SECOND_HANDLER = "core.sasaki-second-strike";
export const SASAKI_THIRD_HANDLER = "core.sasaki-third-strike";
export const SASAKI_FIRST_RESOLVE = "core.sasaki-first-strike-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return Boolean(definition && (definitionId === skillId || definition.linkedSkillId === skillId));
}

function activeOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function basicStrengthHandIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition?.basic === true && getCardInstanceAttributes(card, definition, state, definitions).includes("力量"));
  });
}

function sameBattlefieldOtherBasicAttackIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => id !== player.id).flatMap((playerId) => {
    const target = state.players[playerId];
    if (!target || target.eliminated) return [];
    return target.attack.filter((instanceId) => {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      return Boolean(card?.zone === "attack" && card.active && card.face === "up" && definition?.basic === true);
    });
  });
}

function openSasakiDecision(
  state: GameState,
  player: PlayerState,
  stage: "sasaki-first-card" | "sasaki-first-close",
  options: Array<{ id: string; label: string; instanceId?: string }>,
  payload: Record<string, unknown>,
  open: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${SASAKI_FIRST_ID}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: SASAKI_FIRST_RESOLVE,
    sourceId: SASAKI_FIRST_ID,
    controllerPlayerId: player.id,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  open({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: stage,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function resolvedDecision(payload: unknown): { previous: Record<string, unknown>; selection: string } {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("SASAKI_FIRST_DECISION_INVALID");
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections)
    ? decision.selections.filter((value): value is string => typeof value === "string")
    : [];
  if (decision.status !== "resolved" || selections.length !== 1 || selections.length !== decision.selections.length) {
    throw new Error("SASAKI_FIRST_DECISION_INVALID");
  }
  return { previous: payload.previous, selection: selections[0] };
}

function tsubameRuleId(playerId: string, round: number): string {
  return `${SASAKI_THIRD_ID}:tsubame-gaeshi:${playerId}:${round}`;
}

/** Keep Tsubame Gaeshi's +3 truly conditional on all three physical cards remaining in play. */
export function syncSasakiTsubameGaeshi(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): boolean {
  const id = tsubameRuleId(player.id, state.round);
  state.activeRuleModifiers = state.activeRuleModifiers.filter((modifier) => modifier.id !== id);
  const third = activeOwnedSkill(state, player, SASAKI_THIRD_ID, definitions);
  const enabled = Boolean(third
    && activeOwnedSkill(state, player, SASAKI_FIRST_ID, definitions)
    && activeOwnedSkill(state, player, SASAKI_SECOND_ID, definitions));
  if (!enabled || !third) return false;
  state.activeRuleModifiers.push({
    id,
    sourceId: SASAKI_THIRD_ID,
    sourceInstanceId: third.instanceId,
    controllerPlayerId: player.id,
    operation: "add",
    rule: "combat_power",
    scope: { subject: "controller" },
    value: 3,
    duration: "while-source-active",
    createdRound: state.round,
  });
  revealPlayerTrueName(state, player.id);
  return true;
}

/** First Strike / Pommel Strike Feint. */
export const useSasakiFirstStrike: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || state.phase !== "combat" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("SASAKI_FIRST_FORBIDDEN");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== "pommel-strike-feint") throw new Error("SASAKI_FIRST_ABILITY_INVALID");
  const candidates = basicStrengthHandIds(state, player, definitions);
  if (candidates.length === 0) throw new Error("SASAKI_FIRST_NO_STRENGTH_CARD");
  openSasakiDecision(
    state,
    player,
    "sasaki-first-card",
    candidates.map((instanceId) => ({ id: instanceId, instanceId, label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId })),
    { candidates },
    openDecision,
  );
};

export const resolveSasakiFirstStrike: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions) throw new Error("SASAKI_FIRST_DEFINITIONS_REQUIRED");
  const { previous, selection } = resolvedDecision(payload);
  const stage = previous.stage;
  if (stage === "sasaki-first-card") {
    const candidates = Array.isArray(previous.candidates)
      ? previous.candidates.filter((value): value is string => typeof value === "string")
      : [];
    if (!candidates.includes(selection) || !basicStrengthHandIds(state, player, definitions).includes(selection)) {
      throw new Error("SASAKI_FIRST_CARD_INVALID");
    }
    const source = activeOwnedSkill(state, player, SASAKI_FIRST_ID, definitions);
    if (!source) throw new Error("SASAKI_FIRST_SOURCE_INACTIVE");
    closePlayerCard(state, player.id, source.instanceId, definitions);
    syncSasakiTsubameGaeshi(state, player, definitions);
    const definition = definitions[state.cards[selection].definitionId];
    const { paidMana } = addCardToAttack(state, player.id, selection, definitions, {
      payCost: true,
      allowedSourceZones: ["hand"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
      recordFaceUpPlay: false,
    });
    emitEvent?.("card.played", {
      playerId: player.id,
      instanceId: selection,
      definitionId: definition.id,
      face: "up",
      paidMana,
      attributes: getCardAttributes(definition),
      method: "sasaki-first-strike",
      sourceId: SASAKI_FIRST_ID,
    });
    gainMana(player, 2);
    const targets = sameBattlefieldOtherBasicAttackIds(state, player, definitions);
    if (targets.length === 0) return { playedInstanceId: selection, paidMana, closedInstanceId: null };
    openSasakiDecision(
      state,
      player,
      "sasaki-first-close",
      [
        { id: "none", label: "不关闭攻击" },
        ...targets.map((instanceId) => ({ id: instanceId, instanceId, label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId })),
      ],
      { playedInstanceId: selection, targets },
      openDecision,
    );
    return;
  }
  if (stage === "sasaki-first-close") {
    if (selection === "none") return { playedInstanceId: previous.playedInstanceId, closedInstanceId: null };
    const targets = Array.isArray(previous.targets)
      ? previous.targets.filter((value): value is string => typeof value === "string")
      : [];
    if (!targets.includes(selection) || !sameBattlefieldOtherBasicAttackIds(state, player, definitions).includes(selection)) {
      throw new Error("SASAKI_FIRST_CLOSE_TARGET_INVALID");
    }
    const target = state.cards[selection];
    if (!target?.controllerPlayerId) throw new Error("SASAKI_FIRST_CLOSE_TARGET_INVALID");
    closePlayerCard(state, target.controllerPlayerId, selection, definitions, { closedByPlayerId: player.id });
    return { playedInstanceId: previous.playedInstanceId, closedInstanceId: selection };
  }
  throw new Error("SASAKI_FIRST_STAGE_INVALID");
};

export const isSasakiFirstStrikeLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "pommel-strike-feint" && state.phase === "combat"
    && state.activePlayerId === playerId && activeOwnedSkill(state, player, skill.id, definitions)
    && basicStrengthHandIds(state, player, definitions).length > 0);
};

/** Second Strike / Beyond Skill. */
export const useSasakiSecondStrike: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || state.phase !== "action" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("SASAKI_SECOND_FORBIDDEN");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== "beyond-skill") throw new Error("SASAKI_SECOND_ABILITY_INVALID");
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("SASAKI_SECOND_SOURCE_INACTIVE");
  return {
    ruleId: forbidOpponentAbilityActivationOnBattlefield(state, player.id, skill.id, source.instanceId, ["action", "combat"]),
    locationId: player.locationId,
  };
};

export const isSasakiSecondStrikeLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "beyond-skill" && state.phase === "action"
    && state.activePlayerId === playerId && (player.locationId === "mountain" || player.locationId === "city")
    && activeOwnedSkill(state, player, skill.id, definitions));
};

/** Third Strike's passive Tsubame Gaeshi synchronizer. */
export const useSasakiThirdStrike: SkillHandler = ({ state, player, definitions }) => {
  if (!definitions) throw new Error("SASAKI_THIRD_DEFINITIONS_REQUIRED");
  return { tsubameGaeshi: syncSasakiTsubameGaeshi(state, player, definitions) };
};
