import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { getPlayedDefinitionIdsForRound, playBorrowedCardToAttack } from "./card-play.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { createDerivedCardInstance } from "./decks.ts";
import { gainVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const SEI_NOSTALGIA_ID = "servant.sei.skill.sc-sei-1";
export const SEI_VIVID_ID = "servant.sei.skill.sc-sei-2";
export const SEI_EMOTIONAL_ID = "servant.sei.skill.sc-sei-3";
export const SEI_HANDLER = "core.sei-nostalgia";
export const SEI_COPY_ABILITY_RESOLVE = "core.sei-nostalgia-copy-ability-resolve";
export const SEI_VIVID_ABILITY = "hyper-vibes";
export const SEI_EMOTIONAL_ABILITY = "emotional-engine-combat";

const NOSTALGIA_ATTR_MARKER = "attribute-overrides-until-close:sei-nostalgia";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesDefinition(card: GameState["cards"][string] | undefined, definitionId: string): boolean {
  return Boolean(card && (card.definitionId === definitionId || card.definitionId === `card.skill.${definitionId}`));
}

function activeOwnedSource(state: GameState, playerId: string, definitionId: string) {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === playerId && card.controllerPlayerId === playerId
    && card.zone === "attack" && card.active && card.face === "up" && matchesDefinition(card, definitionId));
}

function previousBasicDefinitions(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): CardDefinition[] {
  return getPlayedDefinitionIdsForRound(state, playerId, state.round - 1)
    .map((id) => definitions[id])
    .filter((definition): definition is CardDefinition => Boolean(definition?.basic === true));
}

function nostalgiaAbilityCandidates(previousBasics: CardDefinition[]): Array<{ abilityId: string; sourceDefinitionId: string; phases?: GameState["phase"][] }> {
  const seen = new Set<string>();
  const result: Array<{ abilityId: string; sourceDefinitionId: string; phases?: GameState["phase"][] }> = [];
  for (const definition of previousBasics) {
    for (const abilityId of definition.cardAbilityIds ?? []) {
      if (seen.has(abilityId)) continue;
      seen.add(abilityId);
      result.push({ abilityId, sourceDefinitionId: definition.id, ...(definition.phases ? { phases: [...definition.phases] } : {}) });
    }
  }
  return result;
}

function addRoundPower(card: GameState["cards"][string], sourceId: string, amount: number, round: number): void {
  if (!Number.isInteger(amount)) throw new Error("SEI_POWER_INVALID");
  const id = `${sourceId}:${round}:${card.instanceId}`;
  card.powerModifiers = [
    ...(card.powerModifiers ?? []).filter((modifier) => modifier.id !== id),
    { id, sourceId, kind: "add", value: amount, duration: "round" },
  ];
}

function anyActiveVivid(state: GameState): boolean {
  return Object.values(state.cards).some((card) => card.zone === "attack" && card.active && card.face === "up" && matchesDefinition(card, SEI_VIVID_ID));
}

function applyVividBonusIfEligible(state: GameState, card: GameState["cards"][string], definitions: Record<string, CardDefinition>): void {
  if (!matchesDefinition(card, SEI_NOSTALGIA_ID) || card.zone !== "attack" || !card.active || card.face !== "up" || !anyActiveVivid(state)) return;
  const controller = state.players[card.controllerPlayerId];
  const definition = definitions[card.definitionId];
  if (!controller || !definition) return;
  if (getCardInstanceAttributes(card, definition, state, definitions).length <= 1) addRoundPower(card, SEI_VIVID_ID, 3, state.round);
}

function applyNostalgiaOnPlay(
  state: GameState,
  historyPlayerId: string,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
): Array<{ abilityId: string; sourceDefinitionId: string; phases?: GameState["phase"][] }> {
  const card = state.cards[instanceId];
  if (!card || !matchesDefinition(card, SEI_NOSTALGIA_ID) || card.zone !== "attack") throw new Error("SEI_NOSTALGIA_CARD_INVALID");
  const basics = previousBasicDefinitions(state, historyPlayerId, definitions);
  const basePower = Math.min(10, basics.reduce((sum, definition) => sum + Number(definition.basePower ?? 0), 0));
  addRoundPower(card, SEI_NOSTALGIA_ID, basePower, state.round);
  const attributes = [...new Set(basics.flatMap((definition) => getCardAttributes(definition)))];
  card.attributeOverrides = attributes;
  if (!card.modifiers.includes(NOSTALGIA_ATTR_MARKER)) card.modifiers.push(NOSTALGIA_ATTR_MARKER);
  applyVividBonusIfEligible(state, card, definitions);
  return nostalgiaAbilityCandidates(basics);
}

function grantNostalgiaAbility(card: GameState["cards"][string], candidate: { abilityId: string; sourceDefinitionId: string; phases?: GameState["phase"][] }): void {
  card.grantedCardAbilities = [{ abilityId: candidate.abilityId, sourceDefinitionId: candidate.sourceDefinitionId, ...(candidate.phases ? { phases: [...candidate.phases] } : {}) }];
}

export const resolveSeiNostalgiaAbilityChoice: SkillHandler = ({ state, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("SEI_NOSTALGIA_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const instanceId = typeof previous.instanceId === "string" ? previous.instanceId : undefined;
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter(isRecord) : [];
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (!instanceId || decision.status !== "resolved" || selections.length > 1) throw new Error("SEI_NOSTALGIA_DECISION_INVALID");
  if (selections.length === 0) return { instanceId, copiedAbilityId: null };
  const candidate = candidates.find((item) => item.abilityId === selections[0]);
  if (!candidate || typeof candidate.abilityId !== "string" || typeof candidate.sourceDefinitionId !== "string") throw new Error("SEI_NOSTALGIA_ABILITY_INVALID");
  const phases = Array.isArray(candidate.phases) ? candidate.phases.filter((phase): phase is GameState["phase"] => ["preparation", "outpost", "action", "combat"].includes(String(phase))) : undefined;
  grantNostalgiaAbility(state.cards[instanceId], { abilityId: candidate.abilityId, sourceDefinitionId: candidate.sourceDefinitionId, ...(phases?.length ? { phases } : {}) });
  return { instanceId, copiedAbilityId: candidate.abilityId };
};

function findSeiPlayer(state: GameState): PlayerState | undefined {
  return Object.values(state.players).find((candidate) => candidate.servantId === "servant.sei" && !candidate.eliminated);
}

function resolveElate(state: GameState, physicalOwner: PlayerState, event: Record<string, unknown>): unknown {
  const locationId = event.locationId;
  if (locationId !== "mountain" && locationId !== "city") return;
  const winners = new Set(Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : []);
  const cards = Object.values(state.cards).filter((card) => card.ownerPlayerId === physicalOwner.id && card.zone === "attack"
    && card.active && card.face === "up" && matchesDefinition(card, SEI_NOSTALGIA_ID));
  const winningCard = cards.find((card) => winners.has(card.controllerPlayerId) && state.players[card.controllerPlayerId]?.locationId === locationId);
  if (!winningCard) return;
  const controller = state.players[winningCard.controllerPlayerId];
  const sei = findSeiPlayer(state);
  if (!controller || !sei) return;
  if (controller.id !== sei.id) gainVictoryPoints(controller, 2);
  if (Number(sei.flags.seiElateRound ?? -1) !== state.round) {
    sei.flags.seiElateRound = state.round;
    sei.flags.seiElateVictoryPoints = 0;
  }
  const gained = Math.min(2, Math.max(0, 3 - Number(sei.flags.seiElateVictoryPoints ?? 0)));
  if (gained > 0) {
    gainVictoryPoints(sei, gained);
    sei.flags.seiElateVictoryPoints = Number(sei.flags.seiElateVictoryPoints ?? 0) + gained;
  }
  return { controllerPlayerId: controller.id, seiPlayerId: sei.id, seiVictoryPoints: gained };
}

export const useSeiNostalgia: SkillHandler = (context) => {
  const { state, player, skill, payload, definitions, openDecision, emitEvent } = context;
  if (!definitions) throw new Error("SEI_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === SEI_NOSTALGIA_ID) {
    if (eventType === "card.played") {
      const instanceId = typeof event.instanceId === "string" ? event.instanceId : undefined;
      if (!instanceId || !matchesDefinition(state.cards[instanceId], SEI_NOSTALGIA_ID)) return;
      const ownerId = state.cards[instanceId].ownerPlayerId;
      if (ownerId !== player.id) return;
      const candidates = applyNostalgiaOnPlay(state, ownerId, instanceId, definitions);
      if (candidates.length === 0) return { instanceId, copiedAbilityId: null };
      const requested = typeof event.copiedAbilityId === "string" ? event.copiedAbilityId : undefined;
      if (requested) {
        const candidate = candidates.find((item) => item.abilityId === requested);
        if (!candidate) throw new Error("SEI_NOSTALGIA_ABILITY_INVALID");
        grantNostalgiaAbility(state.cards[instanceId], candidate);
        return { instanceId, copiedAbilityId: requested };
      }
      const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${instanceId}:nostalgia-copy`;
      state.effectQueue.unshift({ effectId, handlerId: SEI_COPY_ABILITY_RESOLVE, sourceId: skill.id, controllerPlayerId: player.id,
        payload: { instanceId, candidates }, createdAtRevision: state.revision });
      openDecision({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "sei-nostalgia-copy-ability",
        options: candidates.map((item) => ({ id: item.abilityId, label: definitions[item.sourceDefinitionId]?.name ?? item.abilityId })), min: 0, max: 1,
        allowCancel: true, continuationEffectId: effectId, submissions: {} });
      return { pending: true, instanceId };
    }
    if (eventType === "combat.resolved") return resolveElate(state, player, event);
    return;
  }

  if (skill.id === SEI_VIVID_ID) {
    if (eventType === "card.played") {
      if (event.definitionId !== SEI_VIVID_ID && event.definitionId !== `card.skill.${SEI_VIVID_ID}`) return;
      for (const card of Object.values(state.cards)) applyVividBonusIfEligible(state, card, definitions);
      return;
    }
    if (data.abilityId !== SEI_VIVID_ABILITY || state.phase !== "action" || state.activePlayerId !== player.id || !activeOwnedSource(state, player.id, skill.id)) {
      throw new Error("SEI_VIVID_WINDOW_INVALID");
    }
    const instanceIds = Array.isArray(data.instanceIds) ? data.instanceIds.filter((id): id is string => typeof id === "string") : [];
    if (new Set(instanceIds).size !== instanceIds.length) throw new Error("SEI_VIVID_SELECTION_INVALID");
    const playable = Object.values(state.cards).filter((card) => card.ownerPlayerId && card.ownerPlayerId !== player.id
      && (card.zone === "master-skills" || card.zone === "servant-skills") && matchesDefinition(card, SEI_NOSTALGIA_ID)).map((card) => card.instanceId);
    if (instanceIds.some((id) => !playable.includes(id))) throw new Error("SEI_VIVID_SELECTION_INVALID");
    const played = [];
    for (const instanceId of instanceIds) {
      const result = playBorrowedCardToAttack(state, player.id, instanceId, definitions, {
        allowedSourceZones: ["master-skills", "servant-skills"], bypassFaceUpPlayLimit: true, bypassSkillEightMana: true,
      });
      const card = state.cards[instanceId];
      emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: card.definitionId, face: "up", paidMana: result.paidMana, method: "sei-hyper-vibes" });
      played.push({ instanceId, ownerPlayerId: result.ownerPlayerId, paidMana: result.paidMana });
    }
    return { played };
  }

  if (skill.id === SEI_EMOTIONAL_ID) {
    if (data.abilityId !== SEI_EMOTIONAL_ABILITY || state.phase !== "combat" || state.activePlayerId !== player.id || !activeOwnedSource(state, player.id, skill.id)) {
      throw new Error("SEI_EMOTIONAL_WINDOW_INVALID");
    }
    const locationId = player.locationId;
    if (locationId !== "mountain" && locationId !== "city") throw new Error("SEI_EMOTIONAL_BATTLEFIELD_REQUIRED");
    const opponents = (state.board.locations[locationId] ?? []).map((id) => state.players[id])
      .filter((candidate): candidate is PlayerState => Boolean(candidate && candidate.id !== player.id && !candidate.eliminated));
    const created: string[] = [];
    for (const opponent of opponents) {
      const owns = Object.values(state.cards).some((card) => card.ownerPlayerId === opponent.id && card.zone !== "removed" && matchesDefinition(card, SEI_NOSTALGIA_ID));
      if (!owns) {
        const instanceId = `${state.gameInstanceId}:${opponent.id}:sei-nostalgia:${state.round}:${state.revision}:${created.length + 1}`;
        const copy = createDerivedCardInstance(state, opponent.id, { instanceId, definitionId: SEI_NOSTALGIA_ID, zone: "servant-skills", face: "up", active: false,
          residual: false, sourceEffectId: `${skill.id}:emotional-engine`, createdByPlayerId: player.id });
        copy.usageLimitOverride = "once-per-game";
        created.push(instanceId);
      }
      const source = activeOwnedSource(state, player.id, skill.id)!;
      const id = `${skill.id}:nostalgia-ceiling:${state.round}:${opponent.id}`;
      opponent.cardRuleModifiers = (opponent.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
      addCardRuleModifier(opponent, { id, sourceId: skill.id, targetDefinitionIds: [SEI_NOSTALGIA_ID], powerCeiling: 0, duration: "round", sourceInstanceId: source.instanceId });
    }
    return { createdInstanceIds: created, affectedPlayerIds: opponents.map((opponent) => opponent.id) };
  }
};

export const isSeiLegal: SkillLegalityPredicate = (state, playerId, skill, ability) => {
  const player = state.players[playerId];
  if (!player || state.activePlayerId !== playerId || !activeOwnedSource(state, playerId, skill.id)) return false;
  if (skill.id === SEI_VIVID_ID) return ability?.id === SEI_VIVID_ABILITY && state.phase === "action";
  if (skill.id === SEI_EMOTIONAL_ID) return ability?.id === SEI_EMOTIONAL_ABILITY && state.phase === "combat" && (player.locationId === "mountain" || player.locationId === "city");
  return false;
};
