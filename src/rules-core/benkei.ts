import type { GameEvent, GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { createDerivedCardInstance, movePlayerCard } from "./decks.ts";
import { getOwnedSkillCopyIds } from "./skill-copies.ts";
import { addSkillUseBlock } from "./skill-use-blocks.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const BENKEI_BULWARK_ID = "servant.benkei.skill.sc-benkei-2";
export const BENKEI_EVENLY_MATCHED_ID = "servant.benkei.skill.sc-benkei-3";
export const BENKEI_BULWARK_HANDLER = "core.benkei-bulwark";
export const BENKEI_BULWARK_RESOLVE = "core.benkei-bulwark-resolve";
export const BENKEI_EVENLY_MATCHED_HANDLER = "core.benkei-evenly-matched";
export const BENKEI_EVENLY_MATCHED_RESOLVE = "core.benkei-evenly-matched-resolve";

const BULWARK_ABILITY = "intimidation";
const BULWARK_OPTIONS = ["command-seals", "noble-phantasms", "copied-skills"] as const;
type BulwarkOption = typeof BULWARK_OPTIONS[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((instance) => {
    const definition = instance ? definitions[instance.definitionId] : undefined;
    return Boolean(instance && instance.ownerPlayerId === player.id && instance.controllerPlayerId === player.id
      && instance.zone === "attack" && instance.active && instance.face === "up"
      && (instance.definitionId === skillId || definition?.linkedSkillId === skillId));
  });
}

function bulwarkOptionUsageKey(option: BulwarkOption): string {
  return `${BENKEI_BULWARK_ID}:option:${option}`;
}

export function getBenkeiBulwarkOptions(player: PlayerState): BulwarkOption[] {
  return BULWARK_OPTIONS.filter((option) => player.usage[bulwarkOptionUsageKey(option)]?.usedGame !== true);
}

function applyCopiedSkillBlock(state: GameState, benkei: PlayerState, skillIds: string[]): void {
  const ids = [...new Set(skillIds)];
  if (ids.length === 0) return;
  for (const opponent of Object.values(state.players)) {
    if (opponent.id === benkei.id || opponent.eliminated) continue;
    addSkillUseBlock(opponent, {
      id: `${BENKEI_BULWARK_ID}:${benkei.id}:copied-skills:${state.round}`,
      sourceId: BENKEI_BULWARK_ID,
      throughRound: state.round,
      definitionIds: [
        ...new Set([
          ...(opponent.skillUseBlocks ?? [])
            .filter((block) => block.id === `${BENKEI_BULWARK_ID}:${benkei.id}:copied-skills:${state.round}`)
            .flatMap((block) => block.definitionIds),
          ...ids,
        ]),
      ],
    });
  }
}

function applyBulwarkOption(state: GameState, player: PlayerState, option: BulwarkOption): void {
  player.usage[bulwarkOptionUsageKey(option)] = { usedGame: true };
  if (option === "copied-skills") {
    player.flags.benkeiCopiedSkillBlockRound = state.round;
    applyCopiedSkillBlock(state, player, getOwnedSkillCopyIds(state, player));
    return;
  }
  for (const opponent of Object.values(state.players)) {
    if (opponent.id === player.id || opponent.eliminated) continue;
    if (option === "command-seals") {
      opponent.flags.commandSealUseBlockedThroughRound = Math.max(
        Number(opponent.flags.commandSealUseBlockedThroughRound ?? Number.NEGATIVE_INFINITY),
        state.round,
      );
    } else {
      opponent.flags.noblePhantasmUseBlockedThroughRound = Math.max(
        Number(opponent.flags.noblePhantasmUseBlockedThroughRound ?? Number.NEGATIVE_INFINITY),
        state.round,
      );
    }
  }
}

export const useBenkeiBulwark: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("BENKEI_BULWARK_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== BULWARK_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, skill.id, definitions)) throw new Error("BENKEI_BULWARK_WINDOW_INVALID");
  const options = getBenkeiBulwarkOptions(player);
  if (options.length === 0) throw new Error("BENKEI_BULWARK_OPTIONS_EXHAUSTED");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:option`;
  state.effectQueue.unshift({
    effectId,
    handlerId: BENKEI_BULWARK_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { stage: "option", options },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "benkei-bulwark-option",
    options: options.map((option) => ({ id: option, label: option })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, options };
};

export const resolveBenkeiBulwark: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("BENKEI_BULWARK_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const allowed = Array.isArray(previous.options) ? previous.options.filter((value): value is BulwarkOption => BULWARK_OPTIONS.includes(value as BulwarkOption)) : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((value): value is string => typeof value === "string") : [];
  if (previous.stage !== "option" || decision.status !== "resolved" || selections.length !== 1 || !allowed.includes(selections[0] as BulwarkOption)) {
    throw new Error("BENKEI_BULWARK_DECISION_INVALID");
  }
  const option = selections[0] as BulwarkOption;
  if (!getBenkeiBulwarkOptions(player).includes(option)) throw new Error("BENKEI_BULWARK_OPTION_ALREADY_USED");
  applyBulwarkOption(state, player, option);
  return { option };
};

export const isBenkeiBulwarkLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === BULWARK_ABILITY && state.phase === "action"
    && state.activePlayerId === playerId && activeOwnedSkill(state, player, skill.id, definitions)
    && getBenkeiBulwarkOptions(player).length > 0);
};

function usedSkillEvent(payload: unknown): { playerId: string; skillId: string } | undefined {
  const data = isRecord(payload) ? payload : {};
  const event = isRecord(data.event) ? data.event : undefined;
  if (!event || typeof event.playerId !== "string" || typeof event.skillId !== "string") return undefined;
  return { playerId: event.playerId, skillId: event.skillId };
}

function sourceSkillDefinition(skillId: string, definitions: Record<string, CardDefinition>): CardDefinition | undefined {
  const direct = definitions[skillId];
  if (direct?.isSkill) return direct;
  return Object.values(definitions).find((definition) => definition.isSkill && definition.linkedSkillId === skillId);
}

export function canBenkeiEvenlyMatchedTrigger(
  state: GameState,
  benkeiPlayerId: string,
  event: GameEvent | { payload: unknown },
  definitions: Record<string, CardDefinition>,
): boolean {
  const benkei = state.players[benkeiPlayerId];
  const raw = isRecord(event.payload) ? event.payload : {};
  const sourcePlayerId = typeof raw.playerId === "string" ? raw.playerId : undefined;
  const skillId = typeof raw.skillId === "string" ? raw.skillId : undefined;
  const sourcePlayer = sourcePlayerId ? state.players[sourcePlayerId] : undefined;
  if (!benkei || benkei.eliminated || !sourcePlayer || sourcePlayer.eliminated || sourcePlayer.id === benkei.id || !skillId) return false;
  if ((benkei.locationId !== "mountain" && benkei.locationId !== "city") || sourcePlayer.locationId !== benkei.locationId) return false;
  if (benkei.hand.length === 0 || getOwnedSkillCopyIds(state, benkei).includes(skillId)) return false;
  const definition = sourceSkillDefinition(skillId, definitions);
  return Boolean(definition?.isSkill && !definition.tags?.includes("cannot-copy"));
}

export const useBenkeiEvenlyMatched: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("BENKEI_EVENLY_MATCHED_DEFINITIONS_REQUIRED");
  const event = usedSkillEvent(payload);
  if (!event) throw new Error("BENKEI_EVENLY_MATCHED_TRIGGER_INVALID");
  const sourcePlayer = state.players[event.playerId];
  const syntheticEvent = { payload: event };
  if (!sourcePlayer || !canBenkeiEvenlyMatchedTrigger(state, player.id, syntheticEvent, definitions)) return { skipped: true };
  const candidates = [...player.hand];
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:copy:${event.playerId}:${event.skillId}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: BENKEI_EVENLY_MATCHED_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { stage: "discard-to-copy", sourcePlayerId: event.playerId, sourceSkillId: event.skillId, discardCandidates: candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "benkei-evenly-matched-discard",
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 0,
    max: 1,
    allowCancel: true,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, sourcePlayerId: event.playerId, sourceSkillId: event.skillId };
};

export const resolveBenkeiEvenlyMatched: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("BENKEI_EVENLY_MATCHED_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const sourcePlayerId = typeof previous.sourcePlayerId === "string" ? previous.sourcePlayerId : undefined;
  const sourceSkillId = typeof previous.sourceSkillId === "string" ? previous.sourceSkillId : undefined;
  const candidates = Array.isArray(previous.discardCandidates) ? previous.discardCandidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (previous.stage !== "discard-to-copy" || !sourcePlayerId || !sourceSkillId || !["resolved", "cancelled"].includes(String(decision.status))
    || selections.length > 1 || selections.some((id) => !candidates.includes(id))) throw new Error("BENKEI_EVENLY_MATCHED_DECISION_INVALID");
  if (decision.status === "cancelled" || selections.length === 0) return { copied: false };
  const discardInstanceId = selections[0];
  if (!player.hand.includes(discardInstanceId)) throw new Error("BENKEI_EVENLY_MATCHED_DISCARD_INVALID");
  const sourcePlayer = state.players[sourcePlayerId];
  const definition = sourceSkillDefinition(sourceSkillId, definitions);
  if (!sourcePlayer || sourcePlayer.eliminated || !definition?.isSkill || definition.tags?.includes("cannot-copy")
    || getOwnedSkillCopyIds(state, player).includes(sourceSkillId)) throw new Error("BENKEI_EVENLY_MATCHED_SOURCE_INVALID");
  movePlayerCard(state, player.id, discardInstanceId, "discard");
  const zone = definition.skillOwnerType === "master" ? "master-skills" : "servant-skills";
  const instanceId = `${player.id}:copy:${skill.id}:${sourceSkillId}:${state.round}:${state.revision}`;
  const copy = createDerivedCardInstance(state, player.id, {
    instanceId,
    definitionId: sourceSkillId,
    zone,
    face: "up",
    active: false,
    residual: false,
    temporary: true,
    temporaryCleanup: "explicit",
    sourceEffectId: `${skill.id}:copy:${sourceSkillId}:${state.round}:${state.revision}`,
    createdByPlayerId: player.id,
  });
  copy.skillCopyReplacement = {
    sourceId: skill.id,
    sourceSkillId,
    totalPowerGain: 3,
    oncePerCopy: true,
    removeAtRoundEndAfterUse: true,
  };
  if (Number(player.flags.benkeiCopiedSkillBlockRound ?? -1) === state.round) applyCopiedSkillBlock(state, player, [sourceSkillId]);
  return { copied: true, sourceSkillId, instanceId, discardInstanceId, zone };
};
