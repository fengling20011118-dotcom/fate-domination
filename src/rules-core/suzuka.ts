import type { GameState, PlayerState } from "../domain/state/types.ts";
import { StateRandom } from "../match-engine/random.ts";
import { addCardToAttack } from "./card-play.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardPlayCost } from "./costs.ts";
import { movePlayerCard, shufflePlayerDeck } from "./decks.ts";
import { getCustomResource, gainCustomResource, spendCustomResource } from "./resources.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const SUZUKA_WISE_FOX_ID = "servant.suzuka.skill.sc-suzuka-1";
export const SUZUKA_SUN_SHOWER_ID = "servant.suzuka.skill.sc-suzuka-2";
export const SUZUKA_TRICHILIOCOSM_ID = "servant.suzuka.skill.sc-suzuka-3";
export const SUZUKA_HANDLER = "core.suzuka-package";
export const SUZUKA_RESOLVE = "core.suzuka-package-resolve";
export const SUZUKA_WISE_FOX_DEFEAT_ABILITY = "wise-fox-ignore-defeat";
export const SUZUKA_SUN_SHOWER_ABILITY = "demonic-sun-shower";
export const SUZUKA_WISDOM_RESOURCE = "suzuka:wisdom";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function randomFor(state: GameState, randomInt?: (maxExclusive: number) => number) {
  if (randomInt) return randomInt;
  const random = new StateRandom();
  return (maxExclusive: number) => random.integer(state, maxExclusive);
}

function basicDiscardIds(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.discard.filter((instanceId) => definitions[state.cards[instanceId]?.definitionId ?? ""]?.basic === true);
}

function openSunShowerDecision(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  open: SkillContext["openDecision"],
): { pending: true; candidateCount: number } {
  const candidates = basicDiscardIds(state, player, definitions);
  const wisdom = getCustomResource(player, SUZUKA_WISDOM_RESOURCE);
  const wisdomOptions = [0, 1, 2].filter((amount) => amount <= wisdom).map((amount) => ({ id: `wisdom:${amount}`, label: `Wisdom ${amount}` }));
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${SUZUKA_SUN_SHOWER_ID}:resolve`;
  state.effectQueue.unshift({
    effectId,
    handlerId: SUZUKA_RESOLVE,
    sourceId: SUZUKA_SUN_SHOWER_ID,
    controllerPlayerId: player.id,
    payload: { stage: "sun-shower", candidateInstanceIds: [...candidates] },
    createdAtRevision: state.revision,
  });
  open({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "suzuka-sun-shower",
    options: [
      ...wisdomOptions,
      ...candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    ],
    min: 1,
    max: Math.min(6, 1 + candidates.length),
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true, candidateCount: candidates.length };
}

function settleSunShowerAfterCombat(
  state: GameState,
  player: PlayerState,
  randomInt: ((maxExclusive: number) => number) | undefined,
): { returnedInstanceIds: string[] } | undefined {
  const marker = `suzuka-sun-shower:${state.round}`;
  const returned = Object.values(state.cards).filter((card) => card.ownerPlayerId === player.id && card.zone !== "removed" && card.modifiers?.includes(marker));
  if (returned.length === 0) return;
  for (const card of returned) {
    movePlayerCard(state, player.id, card.instanceId, "deck");
    card.face = "down";
    card.active = false;
    card.residual = false;
    card.modifiers = card.modifiers.filter((value) => value !== marker);
  }
  shufflePlayerDeck(state, player.id, randomFor(state, randomInt));
  return { returnedInstanceIds: returned.map((card) => card.instanceId) };
}

function applyTrichiliocosmOnPlay(
  state: GameState,
  player: PlayerState,
  event: Record<string, unknown>,
  definitions: Record<string, CardDefinition>,
  emitEvent?: SkillContext["emitEvent"],
) {
  if (event.playerId !== player.id || typeof event.instanceId !== "string" || typeof event.definitionId !== "string") return;
  const definition = definitions[event.definitionId];
  if (!definition || (definition.id !== SUZUKA_TRICHILIOCOSM_ID && definition.linkedSkillId !== SUZUKA_TRICHILIOCOSM_ID)) return;
  const card = state.cards[event.instanceId];
  if (!card || card.controllerPlayerId !== player.id || card.zone !== "attack" || !card.active || card.face !== "up") return;
  const playNumber = Math.max(1, Number(card.playCount ?? 1));
  card.costModifiers = [
    ...(card.costModifiers ?? []),
    { id: `${SUZUKA_TRICHILIOCOSM_ID}:cost:${playNumber}`, sourceId: SUZUKA_TRICHILIOCOSM_ID, kind: "add", value: 1, duration: "game" },
  ];
  const currentCost = getCardPlayCost(state, definition, player, card, definitions);
  const discarded = [...player.deck.slice(0, 3)];
  let discardedPrintedFour = false;
  for (const instanceId of discarded) {
    const discardedCard = state.cards[instanceId];
    const discardedDefinition = discardedCard ? definitions[discardedCard.definitionId] : undefined;
    if (discardedDefinition && getPrintedCardBasePower(state, player, discardedDefinition) === 4) discardedPrintedFour = true;
    movePlayerCard(state, player.id, instanceId, "discard");
    discardedCard.face = "up";
    discardedCard.active = false;
    emitEvent?.("card.discarded", { playerId: player.id, instanceId, definitionId: discardedDefinition?.id ?? null, sourceId: SUZUKA_TRICHILIOCOSM_ID, method: "trichiliocosm" });
  }
  if (discardedPrintedFour) {
    card.powerModifiers = [
      ...(card.powerModifiers ?? []),
      { id: `${SUZUKA_TRICHILIOCOSM_ID}:power:${state.round}:${playNumber}`, sourceId: SUZUKA_TRICHILIOCOSM_ID, kind: "add", value: currentCost, duration: "round" },
    ];
  }
  return { currentCost, discardedInstanceIds: discarded, powerBonus: discardedPrintedFour ? currentCost : 0 };
}

export const useSuzukaPackage: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, randomInt, emitEvent }) => {
  if (!definitions) throw new Error("SUZUKA_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === SUZUKA_WISE_FOX_ID) {
    if (eventType === "player.deck-shuffled") {
      if (event.playerId !== player.id || event.reason !== "automatic-recycle") return;
      return { wisdomGained: gainCustomResource(player, SUZUKA_WISDOM_RESOURCE, 1) };
    }
    if (data.abilityId === SUZUKA_WISE_FOX_DEFEAT_ABILITY) {
      if (state.phase !== "outpost" || state.activePlayerId !== player.id) throw new Error("SUZUKA_WISE_FOX_WINDOW_INVALID");
      if (getCustomResource(player, SUZUKA_WISDOM_RESOURCE) < 1) throw new Error("SUZUKA_WISDOM_REQUIRED");
      spendCustomResource(player, SUZUKA_WISDOM_RESOURCE, 1);
      player.flags.ignoreDefeatRound = state.round;
      return { ignoreDefeatRound: state.round };
    }
  }

  if (skill.id === SUZUKA_SUN_SHOWER_ID) {
    if (eventType === "combat.ending") return settleSunShowerAfterCombat(state, player, randomInt);
    if (data.abilityId === SUZUKA_SUN_SHOWER_ABILITY) {
      if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("SUZUKA_SUN_SHOWER_WINDOW_INVALID");
      return openSunShowerDecision(state, player, definitions, openDecision);
    }
  }

  if (skill.id === SUZUKA_TRICHILIOCOSM_ID && eventType === "card.played") {
    return applyTrichiliocosmOnPlay(state, player, event, definitions, emitEvent);
  }
  throw new Error("SUZUKA_ABILITY_INVALID");
};

export const resolveSuzukaPackage: SkillHandler = ({ state, player, payload, definitions, randomInt, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("SUZUKA_DECISION_INVALID");
  const previous = payload.previous;
  if (previous.stage !== "sun-shower" || payload.decision.status !== "resolved") throw new Error("SUZUKA_DECISION_INVALID");
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
  const wisdomSelections = selections.filter((id) => /^wisdom:[012]$/.test(id));
  if (wisdomSelections.length !== 1 || new Set(selections).size !== selections.length) throw new Error("SUZUKA_SUN_SHOWER_SELECTION_INVALID");
  const wisdomSpent = Number(wisdomSelections[0].slice("wisdom:".length));
  const selectedCards = selections.filter((id) => !id.startsWith("wisdom:"));
  const candidates = Array.isArray(previous.candidateInstanceIds) ? previous.candidateInstanceIds.filter((id): id is string => typeof id === "string") : [];
  if (selectedCards.length > 3 + wisdomSpent || selectedCards.some((id) => !candidates.includes(id) || !player.discard.includes(id))) {
    throw new Error("SUZUKA_SUN_SHOWER_SELECTION_INVALID");
  }
  if (getCustomResource(player, SUZUKA_WISDOM_RESOURCE) < wisdomSpent) throw new Error("SUZUKA_WISDOM_REQUIRED");
  for (const instanceId of selectedCards) {
    const definition = definitions[state.cards[instanceId]?.definitionId ?? ""];
    if (!definition?.basic) throw new Error("SUZUKA_SUN_SHOWER_BASIC_REQUIRED");
  }
  spendCustomResource(player, SUZUKA_WISDOM_RESOURCE, wisdomSpent);
  const marker = `suzuka-sun-shower:${state.round}`;
  const played: Array<{ instanceId: string; paidMana: number }> = [];
  for (const instanceId of selectedCards) {
    const result = addCardToAttack(state, player.id, instanceId, definitions, {
      payCost: true,
      allowedSourceZones: ["discard"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
    });
    const card = state.cards[instanceId];
    card.modifiers = [...(card.modifiers ?? []), marker];
    played.push({ instanceId, paidMana: result.paidMana });
    emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: card.definitionId, face: "up", paidMana: result.paidMana, method: "suzuka-sun-shower" });
  }
  return { wisdomSpent, playedInstanceIds: played.map((item) => item.instanceId), paidMana: played.reduce((sum, item) => sum + item.paidMana, 0) };
};

export const isSuzukaPackageLegal: SkillLegalityPredicate = (state, playerId, skill, ability) => {
  const player = state.players[playerId];
  if (!player || player.eliminated) return false;
  if (skill.id === SUZUKA_WISE_FOX_ID && ability?.id === SUZUKA_WISE_FOX_DEFEAT_ABILITY) {
    return state.phase === "outpost" && state.activePlayerId === playerId && getCustomResource(player, SUZUKA_WISDOM_RESOURCE) >= 1;
  }
  if (skill.id === SUZUKA_SUN_SHOWER_ID && ability?.id === SUZUKA_SUN_SHOWER_ABILITY) {
    return state.phase === "action" && state.activePlayerId === playerId;
  }
  return false;
};
