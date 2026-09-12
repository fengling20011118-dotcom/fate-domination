import type { GameState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { assertCardCanEnterAttack } from "./card-rules.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardPlayCost, payManaCost } from "./costs.ts";
import { closePlayerCard } from "./decks.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const BRADAMANTE_ANGELICA_ID = "servant.bradamante.skill.sc-bradamante-2";
export const BRADAMANTE_ATLANTE_ID = "servant.bradamante.skill.sc-bradamante-3";
export const BRADAMANTE_ANGELICA_HANDLER = "core.bradamante-angelica-cathay";
export const BRADAMANTE_ANGELICA_RESOLVE = "core.bradamante-angelica-cathay-resolve";
export const BRADAMANTE_ATLANTE_HANDLER = "core.bradamante-bouclier-atlante";
export const BRADAMANTE_ATLANTE_RESOLVE = "core.bradamante-bouclier-atlante-resolve";
export const BRADAMANTE_CURSE_WARD_TAG = "opponent-skill-ward-pay2-or-ignore-once-per-round";
export const BRADAMANTE_ATLANTE_PASSIVE_TAG = "opponent-shared-basic-type-no-situation-event-increase";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameFightPlayerIds(state: GameState, playerId: string): string[] {
  const locationId = state.players[playerId]?.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? []).filter((id) => !state.players[id]?.eliminated);
}

function activeOwnedSource(state: GameState, playerId: string, skillId: string, definitions: Record<string, CardDefinition>) {
  return state.players[playerId]?.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card?.controllerPlayerId === playerId && card.zone === "attack" && card.active && card.face === "up"
      && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
  });
}

function magicCancelerCandidates(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): string[] {
  const player = state.players[playerId];
  if (!player || player.locationId !== "mountain" && player.locationId !== "city") return [];
  const result: string[] = [];
  for (const targetPlayerId of sameFightPlayerIds(state, playerId)) {
    const target = state.players[targetPlayerId];
    for (const instanceId of target.attack) {
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      if (!instance?.active || instance.face !== "up" || !definition) continue;
      if (!getCardInstanceAttributes(instance, definition, state, definitions).includes("魔术")) continue;
      const cost = getCardPlayCost(state, definition, target, instance, definitions);
      if (!Number.isInteger(cost) || cost <= 0) continue;
      if (player.flags.infiniteMana !== true && player.mana < cost) continue;
      result.push(instanceId);
    }
  }
  return result;
}

function playableBasicHandCandidates(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): string[] {
  const player = state.players[playerId];
  if (!player) return [];
  const result: string[] = [];
  for (const instanceId of player.hand) {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!instance || !definition || definition.basic !== true) continue;
    try {
      assertCardCanEnterAttack({ state, playerId, instanceId, definitions, faceDown: false, allowedSourceZones: ["hand"], bypassTiming: true });
      const cost = getCardPlayCost(state, definition, player, instance, definitions);
      if (player.flags.infiniteMana !== true && player.mana < cost) continue;
      result.push(instanceId);
    } catch {
      // Candidate generation is a pure legality filter; illegal cards are omitted.
    }
  }
  return result;
}

function openSingleCardDecision(
  state: GameState,
  playerId: string,
  sourceId: string,
  handlerId: string,
  kind: string,
  candidateIds: string[],
  definitions: Record<string, CardDefinition>,
  openDecision: Parameters<SkillHandler>[0]["openDecision"],
): void {
  if (candidateIds.length === 0) throw new Error("BRADAMANTE_NO_LEGAL_TARGET");
  const effectId = `${state.gameInstanceId}:${state.revision}:${playerId}:${sourceId}:${kind}`;
  state.effectQueue.unshift({
    effectId,
    handlerId,
    sourceId,
    controllerPlayerId: playerId,
    payload: { candidateIds },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: playerId,
    chooserPlayerIds: [playerId],
    kind,
    options: candidateIds.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

/** Angelica Cathay's active Combat clause. Curse Ward itself is handled by the generic pre-skill reaction boundary. */
export const useBradamanteAngelicaCathay: SkillHandler = ({ state, player, skill, definitions, openDecision }) => {
  if (!definitions || !activeOwnedSource(state, player.id, skill.id, definitions)) throw new Error("BRADAMANTE_ANGELICA_SOURCE_INACTIVE");
  const candidates = magicCancelerCandidates(state, player.id, definitions);
  openSingleCardDecision(state, player.id, skill.id, BRADAMANTE_ANGELICA_RESOLVE, "bradamante-magic-canceler", candidates, definitions, openDecision);
};

export const resolveBradamanteAngelicaCathay: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("BRADAMANTE_ANGELICA_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  const instanceId = selections[0];
  if (!instanceId || !candidates.includes(instanceId) || !magicCancelerCandidates(state, player.id, definitions).includes(instanceId)) throw new Error("BRADAMANTE_ANGELICA_TARGET_INVALID");
  const instance = state.cards[instanceId];
  const owner = instance?.ownerPlayerId ? state.players[instance.ownerPlayerId] : undefined;
  const definition = instance ? definitions[instance.definitionId] : undefined;
  if (!instance || !owner || !definition) throw new Error("BRADAMANTE_ANGELICA_TARGET_INVALID");
  const cost = getCardPlayCost(state, definition, owner, instance, definitions);
  if (!Number.isInteger(cost) || cost <= 0) throw new Error("BRADAMANTE_ANGELICA_COST_INVALID");
  payManaCost(state, player, cost, definitions);
  closePlayerCard(state, owner.id, instanceId, definitions, { closedByPlayerId: player.id });
  return { instanceId, paidMana: cost };
};

export const isBradamanteAngelicaLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  return ability?.id === "magic-canceler" && state.phase === "combat" && Boolean(definitions && magicCancelerCandidates(state, playerId, definitions).length > 0);
};

/** Bouclier d'Atlante's active Combat clause: pay the ability cost, reveal, then play and pay for one basic attack from hand. */
export const useBradamanteBouclierAtlante: SkillHandler = ({ state, player, skill, definitions, openDecision }) => {
  if (!definitions || !activeOwnedSource(state, player.id, skill.id, definitions)) throw new Error("BRADAMANTE_ATLANTE_SOURCE_INACTIVE");
  const candidates = playableBasicHandCandidates(state, player.id, definitions);
  openSingleCardDecision(state, player.id, skill.id, BRADAMANTE_ATLANTE_RESOLVE, "bradamante-atlante-basic-play", candidates, definitions, openDecision);
};

export const resolveBradamanteBouclierAtlante: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("BRADAMANTE_ATLANTE_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidateIds) ? payload.previous.candidateIds.filter((id): id is string => typeof id === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  const instanceId = selections[0];
  if (!instanceId || !candidates.includes(instanceId) || !playableBasicHandCandidates(state, player.id, definitions).includes(instanceId)) throw new Error("BRADAMANTE_ATLANTE_TARGET_INVALID");
  const definition = definitions[state.cards[instanceId].definitionId];
  const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, {
    payCost: true,
    allowedSourceZones: ["hand"],
    bypassFaceUpPlayLimit: true,
    bypassTiming: true,
  });
  emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana, attributes: getCardInstanceAttributes(state.cards[instanceId], definition, state, definitions), method: "bradamante-atlante" });
  emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, method: "bradamante-atlante" });
  return { instanceId, paidMana };
};

export const isBradamanteAtlanteLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  return ability?.id === "atlante-basic-play" && state.phase === "combat" && Boolean(definitions && playableBasicHandCandidates(state, playerId, definitions).length > 0);
};
