import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import { getAttachedCards } from "./card-attachments.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { applyTemporaryCardDefinitionCopy, removePhysicalCardFromGame } from "./decks.ts";
import { gainCommandSeals } from "./command-seals.ts";
import {
  acquireNamedSideDeckCard,
  discardNamedSideDeckHandCards,
  drawNamedSideDeck,
  getNamedSideDeck,
  initializeNamedSideDeck,
  namedSideDeckHand,
} from "./named-side-decks.ts";
import { gainMana, loseMana, transferVictoryPoints } from "./resources.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const DAVINCI_UOMO_ID = "servant.davinci.skill.sc-davinci-1";
export const DAVINCI_WORKSHOP_ID = "servant.davinci.skill.sc-davinci-2";
export const DAVINCI_GENIUS_ID = "servant.davinci.skill.sc-davinci-3";
export const DAVINCI_MONA_LISA_ID = "servant.davinci.skill.sc-davinci-9";
export const DAVINCI_HANDLER = "core.davinci-package";
export const DAVINCI_RESOLVE = "core.davinci-package-resolve";
export const DAVINCI_STORE_DECK_ID = "davinci-store-items";
export const DAVINCI_GENIUS_MANA_ABILITY = "natural-genius-mana";
export const DAVINCI_GENIUS_POWER_ABILITY = "natural-genius-power";

export const DAVINCI_STORE_ITEM_SKILL_IDS = Object.freeze(Array.from({ length: 14 }, (_, index) => `servant.davinci.skill.sc-davinci-${index + 4}`));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function matchesSkill(card: GameState["cards"][string] | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || card.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId));
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.face === "up" && card.active && matchesSkill(card, definition, skillId));
  });
}

function definitionIdForStoreSkill(skillId: string, definitions: Record<string, CardDefinition>): string {
  const cardId = `card.skill.${skillId}`;
  if (definitions[cardId]) return cardId;
  if (definitions[skillId]) return skillId;
  throw new Error("DAVINCI_STORE_ITEM_DEFINITION_MISSING");
}

function storeDefinitionIds(definitions: Record<string, CardDefinition>): string[] {
  return DAVINCI_STORE_ITEM_SKILL_IDS.map((skillId) => definitionIdForStoreSkill(skillId, definitions));
}

function ensureStoreDeck(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
) {
  return getNamedSideDeck(state, player.id, DAVINCI_STORE_DECK_ID) ?? initializeNamedSideDeck(
    state,
    player.id,
    DAVINCI_STORE_DECK_ID,
    storeDefinitionIds(definitions),
    randomInt,
    { originServantId: "servant.davinci", recycleDiscard: false },
  );
}

function openDecisionFrame(
  state: GameState,
  ownerPlayerId: string,
  chooserPlayerId: string,
  sourceId: string,
  stage: string,
  options: PendingDecision["options"],
  min: number,
  max: number,
  payload: Record<string, unknown>,
  openDecision: (decision: PendingDecision) => void,
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${ownerPlayerId}:${sourceId}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: DAVINCI_RESOLVE,
    sourceId,
    controllerPlayerId: ownerPlayerId,
    payload: { stage, ...payload },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: chooserPlayerId,
    chooserPlayerIds: [chooserPlayerId],
    kind: `davinci-${stage}`,
    options,
    min,
    max,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

function eligibleRevealedNobleIds(state: GameState, sourceInstanceId: string, definitions: Record<string, CardDefinition>): string[] {
  return Object.values(state.cards).filter((card) => {
    if (card.instanceId === sourceInstanceId || card.zone === "removed" || card.zone === "discard" || card.zone === "deck" || card.zone === "hand" || card.face !== "up") return false;
    const definition = definitions[card.definitionId];
    if (!definition) return false;
    return getCardAttributes(definition).includes("宝具") || definition.tags?.includes("noble-phantasm");
  }).map((card) => card.instanceId);
}

function installUomoMagicGrant(state: GameState, player: PlayerState, sourceInstanceId: string): void {
  const source = state.cards[sourceInstanceId];
  if (!source) return;
  const id = `${DAVINCI_UOMO_ID}:magic:${state.round}:${sourceInstanceId}`;
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
  addCardRuleModifier(player, {
    id,
    sourceId: DAVINCI_UOMO_ID,
    sourceInstanceId,
    targetDefinitionIds: [source.definitionId],
    targetInstanceIds: [sourceInstanceId],
    grantAttributes: ["魔术"],
    duration: "round",
  });
}

function resolveUomoCopy(
  state: GameState,
  player: PlayerState,
  sourceInstanceId: string,
  targetInstanceId: string,
  definitions: Record<string, CardDefinition>,
) {
  if (!eligibleRevealedNobleIds(state, sourceInstanceId, definitions).includes(targetInstanceId)) throw new Error("DAVINCI_UOMO_TARGET_INVALID");
  const copied = applyTemporaryCardDefinitionCopy(state, sourceInstanceId, targetInstanceId, definitions, {
    sourceId: DAVINCI_UOMO_ID,
    expiresRound: state.round,
    extraPower: 1,
    rebindNamedOwnerToController: false,
  });
  installUomoMagicGrant(state, player, sourceInstanceId);
  return { sourceInstanceId, targetInstanceId, copiedDefinitionId: copied.definitionId };
}

function useUomo(
  state: GameState,
  player: PlayerState,
  event: Record<string, unknown>,
  definitions: Record<string, CardDefinition>,
  openDecision: (decision: PendingDecision) => void,
) {
  if (event.playerId !== player.id || typeof event.instanceId !== "string") return;
  const source = state.cards[event.instanceId];
  const originalDefinitionId = source?.temporaryDefinitionCopy?.originalDefinitionId ?? source?.definitionId;
  const originalDefinition = originalDefinitionId ? definitions[originalDefinitionId] : undefined;
  if (!source || !matchesSkill(source, originalDefinition, DAVINCI_UOMO_ID)) return;
  const candidates = eligibleRevealedNobleIds(state, source.instanceId, definitions);
  if (candidates.length === 0) return { copied: false };
  if (candidates.length === 1) return resolveUomoCopy(state, player, source.instanceId, candidates[0], definitions);
  openDecisionFrame(
    state,
    player.id,
    player.id,
    DAVINCI_UOMO_ID,
    "uomo-copy",
    candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId })),
    1,
    1,
    { sourceInstanceId: source.instanceId, candidates },
    openDecision,
  );
  return { pending: true, candidates };
}

function acquiredMonaLisa(state: GameState, definitions: Record<string, CardDefinition>): { owner: PlayerState; instanceId: string } | undefined {
  for (const owner of Object.values(state.players)) {
    if (owner.eliminated) continue;
    const ids = [...owner.masterSkills, ...owner.servantSkills, ...owner.hand, ...owner.attack];
    for (const instanceId of ids) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (card && card.ownerPlayerId === owner.id && card.zone !== "removed" && card.zone !== "discard" && matchesSkill(card, definition, DAVINCI_MONA_LISA_ID)) {
        return { owner, instanceId };
      }
    }
  }
  return undefined;
}

function bidderOrder(state: GameState, davinciPlayerId: string): string[] {
  const order = [...state.turnOrder];
  const index = order.indexOf(davinciPlayerId);
  const rotated = index >= 0 ? [...order.slice(index + 1), ...order.slice(0, index)] : order;
  return rotated.filter((playerId) => playerId !== davinciPlayerId && !state.players[playerId]?.eliminated);
}

function onStoreItemAcquired(state: GameState, targetPlayerId: string, itemInstanceId: string, definitions: Record<string, CardDefinition>): void {
  const card = state.cards[itemInstanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  const target = state.players[targetPlayerId];
  if (!card || !definition || !target) return;
  if (matchesSkill(card, definition, "servant.davinci.skill.sc-davinci-8")) gainCommandSeals(target, 1);
}

function acquireAuctionItem(
  state: GameState,
  davinci: PlayerState,
  itemInstanceId: string,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
) {
  acquireNamedSideDeckCard(state, davinci.id, DAVINCI_STORE_DECK_ID, itemInstanceId, targetPlayerId, "master-skills");
  onStoreItemAcquired(state, targetPlayerId, itemInstanceId, definitions);
  return { itemInstanceId, acquiredByPlayerId: targetPlayerId };
}

function beginBidder(
  state: GameState,
  davinci: PlayerState,
  itemInstanceId: string,
  bidders: string[],
  index: number,
  definitions: Record<string, CardDefinition>,
  openDecision: (decision: PendingDecision) => void,
) {
  if (index >= bidders.length) return acquireAuctionItem(state, davinci, itemInstanceId, davinci.id, definitions);
  const bidderId = bidders[index];
  const bidder = state.players[bidderId];
  if (!bidder || bidder.eliminated) return beginBidder(state, davinci, itemInstanceId, bidders, index + 1, definitions, openDecision);
  openDecisionFrame(
    state,
    davinci.id,
    bidder.id,
    DAVINCI_WORKSHOP_ID,
    "auction-bid",
    [
      { id: "buy", label: "支付2战果并获得物品", disabled: bidder.victoryPoints < 2 },
      { id: "pass", label: "放弃" },
    ],
    1,
    1,
    { itemInstanceId, bidders, bidderIndex: index },
    openDecision,
  );
  return { pending: true, bidderId };
}

function beginAuction(
  state: GameState,
  davinci: PlayerState,
  itemInstanceId: string,
  definitions: Record<string, CardDefinition>,
  openDecision: (decision: PendingDecision) => void,
) {
  const mona = acquiredMonaLisa(state, definitions);
  if (mona) {
    openDecisionFrame(
      state,
      davinci.id,
      mona.owner.id,
      DAVINCI_WORKSHOP_ID,
      "mona-lisa",
      [{ id: "use", label: "移除蒙娜丽莎并获得物品" }, { id: "pass", label: "继续拍卖" }],
      1,
      1,
      { itemInstanceId, monaLisaInstanceId: mona.instanceId, monaLisaOwnerPlayerId: mona.owner.id },
      openDecision,
    );
    return { pending: true, stage: "mona-lisa" };
  }
  return beginBidder(state, davinci, itemInstanceId, bidderOrder(state, davinci.id), 0, definitions, openDecision);
}

function beginWorkshopDraw(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
  openDecision: (decision: PendingDecision) => void,
) {
  ensureStoreDeck(state, player, definitions, randomInt);
  const drawn = drawNamedSideDeck(state, player.id, DAVINCI_STORE_DECK_ID, 3, randomInt);
  if (drawn.length === 0) return { drawnInstanceIds: [], exhausted: true };
  if (drawn.length === 1) return beginAuction(state, player, drawn[0], definitions, openDecision);
  openDecisionFrame(
    state,
    player.id,
    player.id,
    DAVINCI_WORKSHOP_ID,
    "workshop-pick",
    drawn.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId })),
    1,
    1,
    { drawnInstanceIds: drawn },
    openDecision,
  );
  return { pending: true, drawnInstanceIds: drawn };
}

function installGeniusAttachmentMultiplier(state: GameState, player: PlayerState, sourceInstanceId: string): void {
  const source = state.cards[sourceInstanceId];
  if (!source) return;
  const id = `${DAVINCI_GENIUS_ID}:level-up-x2:${sourceInstanceId}`;
  player.cardRuleModifiers = (player.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
  addCardRuleModifier(player, {
    id,
    sourceId: DAVINCI_GENIUS_ID,
    sourceInstanceId,
    targetDefinitionIds: [source.definitionId],
    targetInstanceIds: [sourceInstanceId],
    attachmentPowerBonusMultiplier: 2,
    duration: "while-source-active",
  });
}

function useNaturalBornGenius(
  state: GameState,
  player: PlayerState,
  data: Record<string, unknown>,
  event: Record<string, unknown>,
  definitions: Record<string, CardDefinition>,
) {
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType === "card.played") {
    if (event.playerId !== player.id || typeof event.instanceId !== "string") return;
    const source = state.cards[event.instanceId];
    if (!source || !matchesSkill(source, definitions[source.definitionId], DAVINCI_GENIUS_ID)) return;
    source.residual = true;
    source.residualUntilRound = state.round + 1;
    installGeniusAttachmentMultiplier(state, player, source.instanceId);
    return { residualUntilRound: source.residualUntilRound };
  }
  if (eventType === "card.closed") {
    if (event.playerId !== player.id || typeof event.instanceId !== "string") return;
    const source = state.cards[event.instanceId];
    const originalDefinitionId = source?.temporaryDefinitionCopy?.originalDefinitionId ?? source?.definitionId;
    const originalDefinition = originalDefinitionId ? definitions[originalDefinitionId] : undefined;
    if (!source || !matchesSkill(source, originalDefinition, DAVINCI_GENIUS_ID)) return;
    return { manaLost: loseMana(player, 6) };
  }
  const source = activeOwnedSkill(state, player, DAVINCI_GENIUS_ID, definitions);
  if (!source || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("DAVINCI_GENIUS_WINDOW_INVALID");
  if (data.abilityId === DAVINCI_GENIUS_MANA_ABILITY) return { manaGained: gainMana(player, 2) };
  if (data.abilityId === DAVINCI_GENIUS_POWER_ABILITY) {
    player.flags.roundPowerBonus = Number(player.flags.roundPowerBonus ?? 0) + 2;
    return { powerGained: 2 };
  }
  throw new Error("DAVINCI_GENIUS_ABILITY_INVALID");
}

export const resolveDavinciDecision: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("DAVINCI_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1 || typeof previous.stage !== "string") throw new Error("DAVINCI_DECISION_INVALID");

  if (previous.stage === "uomo-copy") {
    const sourceInstanceId = typeof previous.sourceInstanceId === "string" ? previous.sourceInstanceId : undefined;
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!sourceInstanceId || !candidates.includes(selections[0])) throw new Error("DAVINCI_UOMO_TARGET_INVALID");
    return resolveUomoCopy(state, player, sourceInstanceId, selections[0], definitions);
  }

  if (previous.stage === "workshop-pick") {
    const drawn = Array.isArray(previous.drawnInstanceIds) ? previous.drawnInstanceIds.filter((id): id is string => typeof id === "string") : [];
    const chosen = selections[0];
    if (!drawn.includes(chosen) || !namedSideDeckHand(state, player.id, DAVINCI_STORE_DECK_ID).includes(chosen)) throw new Error("DAVINCI_WORKSHOP_PICK_INVALID");
    const discarded = drawn.filter((id) => id !== chosen);
    if (discarded.length > 0) discardNamedSideDeckHandCards(state, player.id, DAVINCI_STORE_DECK_ID, discarded);
    state.cards[chosen].face = "up";
    return beginAuction(state, player, chosen, definitions, openDecision);
  }

  if (previous.stage === "mona-lisa") {
    const itemInstanceId = typeof previous.itemInstanceId === "string" ? previous.itemInstanceId : undefined;
    const monaLisaInstanceId = typeof previous.monaLisaInstanceId === "string" ? previous.monaLisaInstanceId : undefined;
    const monaLisaOwnerPlayerId = typeof previous.monaLisaOwnerPlayerId === "string" ? previous.monaLisaOwnerPlayerId : undefined;
    if (!itemInstanceId || !monaLisaInstanceId || !monaLisaOwnerPlayerId || !["use", "pass"].includes(selections[0])) throw new Error("DAVINCI_MONA_LISA_DECISION_INVALID");
    if (selections[0] === "use") {
      const mona = state.cards[monaLisaInstanceId];
      if (!mona || mona.ownerPlayerId !== monaLisaOwnerPlayerId || mona.zone === "removed") throw new Error("DAVINCI_MONA_LISA_MISSING");
      removePhysicalCardFromGame(state, monaLisaInstanceId);
      return acquireAuctionItem(state, player, itemInstanceId, monaLisaOwnerPlayerId, definitions);
    }
    return beginBidder(state, player, itemInstanceId, bidderOrder(state, player.id), 0, definitions, openDecision);
  }

  if (previous.stage === "auction-bid") {
    const itemInstanceId = typeof previous.itemInstanceId === "string" ? previous.itemInstanceId : undefined;
    const bidders = Array.isArray(previous.bidders) ? previous.bidders.filter((id): id is string => typeof id === "string") : [];
    const bidderIndex = Number(previous.bidderIndex);
    if (!itemInstanceId || !Number.isInteger(bidderIndex) || bidderIndex < 0 || bidderIndex >= bidders.length || !["buy", "pass"].includes(selections[0])) {
      throw new Error("DAVINCI_AUCTION_DECISION_INVALID");
    }
    const bidder = state.players[bidders[bidderIndex]];
    if (!bidder || bidder.eliminated) return beginBidder(state, player, itemInstanceId, bidders, bidderIndex + 1, definitions, openDecision);
    if (selections[0] === "buy") {
      if (bidder.victoryPoints < 2) throw new Error("DAVINCI_AUCTION_VP_REQUIRED");
      transferVictoryPoints(bidder, player, 2);
      return acquireAuctionItem(state, player, itemInstanceId, bidder.id, definitions);
    }
    return beginBidder(state, player, itemInstanceId, bidders, bidderIndex + 1, definitions, openDecision);
  }
  throw new Error("DAVINCI_DECISION_STAGE_INVALID");
};

export const useDavinciPackage: SkillHandler = ({ state, player, skill, payload, definitions, randomInt, openDecision }) => {
  if (!definitions) throw new Error("DAVINCI_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  const random = randomInt ?? (() => 0);

  if (skill.id === DAVINCI_UOMO_ID) {
    if (eventType !== "card.played") return;
    return useUomo(state, player, event, definitions, openDecision);
  }
  if (skill.id === DAVINCI_WORKSHOP_ID) {
    if (eventType === "game.started") {
      ensureStoreDeck(state, player, definitions, random);
      return { initialized: true };
    }
    if (eventType !== "player.deployed" || event.playerId !== player.id || event.locationId !== "workshop"
      || !activeOwnedSkill(state, player, DAVINCI_WORKSHOP_ID, definitions)) return;
    return beginWorkshopDraw(state, player, definitions, random, openDecision);
  }
  if (skill.id === DAVINCI_GENIUS_ID) return useNaturalBornGenius(state, player, data, event, definitions);
};

export const isDavinciPackageLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || !definitions || state.activePlayerId !== playerId) return false;
  if (skill.id === DAVINCI_GENIUS_ID && (ability?.id === DAVINCI_GENIUS_MANA_ABILITY || ability?.id === DAVINCI_GENIUS_POWER_ABILITY)) {
    return state.phase === "action" && Boolean(activeOwnedSkill(state, player, DAVINCI_GENIUS_ID, definitions));
  }
  return false;
};

export function initializeDavinciStoreForTest(state: GameState, playerId: string, definitions: Record<string, CardDefinition>, randomInt: (maxExclusive: number) => number = () => 0) {
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  return ensureStoreDeck(state, player, definitions, randomInt);
}
