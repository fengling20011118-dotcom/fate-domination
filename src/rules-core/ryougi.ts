import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { isBattlefieldLocation } from "./battlefield-rules.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import { returnPhysicalCardToOwnerZone } from "./decks.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const RYOUGI_VOID_ID = "master.shiki-ryougi.skill.s1b";
export const RYOUGI_SEVER_ID = "master.shiki-ryougi.skill.s2";
export const RYOUGI_GRASP_ID = "master.shiki-ryougi.skill.s3";
export const RYOUGI_BOUNDARY_ID = "master.shiki-ryougi.skill.ascension";
export const RYOUGI_VOID_HANDLER = "core.ryougi-void";
export const RYOUGI_SEVER_HANDLER = "core.ryougi-sever-life";
export const RYOUGI_SEVER_RESOLVE = "core.ryougi-sever-life-resolve";
export const RYOUGI_BOUNDARY_BOTTOM_HANDLER = "core.ryougi-boundary-bottom-discard";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function activeOwnedSkillAttack(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up"
      && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
  });
}

function sameFightPlayerIds(state: GameState, player: PlayerState): string[] {
  const locationId = player.locationId;
  if (!locationId || !isBattlefieldLocation(state, locationId)) return [];
  return (state.board.locations[locationId] ?? []).filter((playerId) => !state.players[playerId]?.eliminated);
}

function severCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  const result: string[] = [];
  for (const playerId of sameFightPlayerIds(state, player)) {
    const target = state.players[playerId];
    for (const instanceId of target.attack) {
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      if (!instance || !definition || instance.zone !== "attack" || definition.isSkill === true || definition.cardType !== "attack") continue;
      result.push(instanceId);
    }
  }
  return result;
}

export const useRyougiVoid: SkillHandler = ({ state, player, skill, payload }) => {
  const data = isRecord(payload) ? payload : {};
  if (data.eventType !== "game.started") return;
  player.flags.viewAllDeckBottomCardsSourceId = skill.id;
  return { armed: true };
};

export const useRyougiSeverLife: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("RYOUGI_SEVER_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.abilityId !== "sever-life" || state.phase !== "combat" || state.activePlayerId !== player.id
    || !activeOwnedSkillAttack(state, player, skill.id, definitions)) throw new Error("RYOUGI_SEVER_ABILITY_INVALID");
  const candidates = severCandidates(state, player, definitions);
  if (candidates.length === 0) throw new Error("RYOUGI_SEVER_NO_TARGET");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:sever-life`;
  state.effectQueue.unshift({
    effectId,
    handlerId: RYOUGI_SEVER_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "ryougi-sever-life-target",
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, candidateInstanceIds: candidates };
};

export const resolveRyougiSeverLife: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("RYOUGI_SEVER_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidates) ? payload.previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || !candidates.includes(selections[0])) throw new Error("RYOUGI_SEVER_DECISION_INVALID");
  const instanceId = selections[0];
  if (!severCandidates(state, player, definitions).includes(instanceId)) throw new Error("RYOUGI_SEVER_TARGET_INVALID");
  const attack = state.cards[instanceId];
  const owner = attack?.ownerPlayerId ? state.players[attack.ownerPlayerId] : undefined;
  const attackDefinition = attack ? definitions[attack.definitionId] : undefined;
  if (!attack || !owner || !attackDefinition) throw new Error("RYOUGI_SEVER_TARGET_INVALID");
  const bottomInstanceId = owner.deck.at(-1);
  if (!bottomInstanceId) return { instanceId, matched: false, bottomInstanceId: null };
  const bottom = state.cards[bottomInstanceId];
  const bottomDefinition = bottom ? definitions[bottom.definitionId] : undefined;
  if (!bottom || !bottomDefinition) throw new Error("RYOUGI_SEVER_BOTTOM_CARD_INVALID");
  const attackPower = getPrintedCardBasePower(state, owner, attackDefinition);
  const bottomPower = getPrintedCardBasePower(state, owner, bottomDefinition);
  if (attackPower !== bottomPower) return { instanceId, matched: false, bottomInstanceId, attackPower, bottomPower };
  returnPhysicalCardToOwnerZone(state, instanceId, "discard");
  returnPhysicalCardToOwnerZone(state, bottomInstanceId, "discard");
  return { instanceId, matched: true, bottomInstanceId, attackPower, bottomPower };
};

export const useRyougiBoundaryBottomDiscard = ({ state, playerId, target, definitions }: {
  state: GameState;
  playerId: string;
  instanceId: string;
  target?: unknown;
  definitions: Record<string, CardDefinition>;
}) => {
  const player = state.players[playerId];
  if (!player || state.phase !== "combat" || state.activePlayerId !== playerId) throw new Error("RYOUGI_BOUNDARY_WINDOW_FORBIDDEN");
  const targetPlayerId = typeof target === "string"
    ? target
    : isRecord(target) && typeof target.playerId === "string" ? target.playerId : undefined;
  if (!targetPlayerId || !sameFightPlayerIds(state, player).includes(targetPlayerId)) throw new Error("RYOUGI_BOUNDARY_TARGET_INVALID");
  const targetPlayer = state.players[targetPlayerId];
  const bottomInstanceId = targetPlayer.deck.at(-1);
  if (!bottomInstanceId) throw new Error("RYOUGI_BOUNDARY_TARGET_DECK_EMPTY");
  returnPhysicalCardToOwnerZone(state, bottomInstanceId, "discard");
};

export const isRyougiSeverLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "sever-life" && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkillAttack(state, player, skill.id, definitions) && severCandidates(state, player, definitions).length > 0);
};
