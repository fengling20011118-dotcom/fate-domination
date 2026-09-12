import type { CardDefinition, GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { SkillHandler } from "./skill-types.ts";
import { createOwnedCardInstance, drawCards, movePlayerCard, removePhysicalCardFromGame } from "./decks.ts";
import { defeatPlayerByEffect } from "./defeat.ts";
import { replaceEventAtLocation, type EventLocation } from "./event-lifecycle.ts";
import { gainVictoryPoints } from "./resources.ts";

export const KIARA_HANDLER = "core.kiara-secret-gardens";
export const KIARA_RESOLVE = "core.kiara-secret-gardens-resolve";
export const KIARA_MASTER_ID = "master.kiara.skill.s1";
export const KIARA_THESIS_ID = "master.kiara.skill.s1a";
export const KIARA_GARDENS_ID = "master.kiara.skill.s2";
export const KIARA_HEAVENS_HOLE_ID = "master.kiara.skill.s3";
export const KIARA_WOMB_ID = "master.kiara.skill.s4";
export const KIARA_DIAMOND_ID = "master.kiara.skill.s5";
export const KIARA_DESIRE_ID = "master.kiara.skill.s6";
export const KIARA_ASCENSION_ID = "master.kiara.skill.ascension";
export const KIARA_REALM_IDS = [KIARA_WOMB_ID, KIARA_DIAMOND_ID, KIARA_DESIRE_ID] as const;

const KIARA_MODE_KEY = "kiaraSecretGardens";

type GardenKind =
  | "escape-reality"
  | "fear-future"
  | "regrets-past"
  | "desire-control"
  | "desire-subjugation"
  | "fear-infinite";

interface GardenRecord {
  id: string;
  kind: GardenKind;
  holderPlayerId: string;
  victoryPoints: number;
  revealed: boolean;
  removed: boolean;
  revealedBy?: "realm" | "thesis";
}

interface KiaraGardenState {
  ownerPlayerId: string;
  gardens: GardenRecord[];
}

const GARDEN_SPECS: Array<{ kind: GardenKind; victoryPoints: number }> = [
  { kind: "escape-reality", victoryPoints: 1 },
  { kind: "fear-future", victoryPoints: 1 },
  { kind: "regrets-past", victoryPoints: 1 },
  { kind: "desire-control", victoryPoints: 2 },
  { kind: "desire-subjugation", victoryPoints: 2 },
  { kind: "fear-infinite", victoryPoints: 3 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function privateRulesState(state: GameState): Record<string, unknown> {
  const mode = state.modeState as Record<string, unknown>;
  if (!isRecord(mode.privateRulesState)) mode.privateRulesState = {};
  return mode.privateRulesState as Record<string, unknown>;
}

function syncGardenVisibility(state: GameState, gardenStateValue: KiaraGardenState): void {
  const mode = state.modeState as Record<string, unknown>;
  if (!isRecord(mode.privatePlayerKnowledge)) mode.privatePlayerKnowledge = {};
  const privateKnowledge = mode.privatePlayerKnowledge as Record<string, unknown>;
  for (const playerId of Object.keys(state.players)) {
    const existing = isRecord(privateKnowledge[playerId]) ? privateKnowledge[playerId] as Record<string, unknown> : {};
    existing[KIARA_MODE_KEY] = gardenStateValue.gardens
      .filter((garden) => garden.holderPlayerId === playerId && !garden.removed)
      .map((garden) => ({ id: garden.id, kind: garden.kind, victoryPoints: garden.victoryPoints, revealed: garden.revealed }));
    privateKnowledge[playerId] = existing;
  }
  if (!isRecord(mode.publicRulesState)) mode.publicRulesState = {};
  (mode.publicRulesState as Record<string, unknown>)[KIARA_MODE_KEY] = gardenStateValue.gardens
    .filter((garden) => garden.revealed && !garden.removed)
    .map((garden) => ({ id: garden.id, kind: garden.kind, holderPlayerId: garden.holderPlayerId, victoryPoints: garden.victoryPoints }));
}

function gardenState(state: GameState, player: PlayerState): KiaraGardenState {
  const rules = privateRulesState(state);
  const existing = rules[KIARA_MODE_KEY];
  if (isRecord(existing) && existing.ownerPlayerId === player.id && Array.isArray(existing.gardens)) {
    return existing as unknown as KiaraGardenState;
  }
  const created: KiaraGardenState = { ownerPlayerId: player.id, gardens: [] };
  rules[KIARA_MODE_KEY] = created as unknown as Record<string, unknown>;
  return created;
}

function shuffle<T>(values: readonly T[], randomInt: (maxExclusive: number) => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    if (!Number.isInteger(swapIndex) || swapIndex < 0 || swapIndex > index) throw new Error("KIARA_RANDOM_INVALID");
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function setupGardens(state: GameState, player: PlayerState, randomInt: (maxExclusive: number) => number) {
  const current = gardenState(state, player);
  if (current.gardens.length > 0) return current;
  const opponents = state.turnOrder.filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated);
  if (opponents.length === 0) throw new Error("KIARA_GARDEN_NO_OPPONENT");
  const shuffled = shuffle(GARDEN_SPECS, randomInt);
  current.gardens = shuffled.map((garden, index) => ({
    id: `kiara-garden:${index + 1}`,
    kind: garden.kind,
    holderPlayerId: opponents[randomInt(opponents.length)],
    victoryPoints: garden.victoryPoints,
    revealed: false,
    removed: false,
  }));
  syncGardenVisibility(state, current);
  return current;
}

function gardenById(state: GameState, player: PlayerState, gardenId: string): GardenRecord | undefined {
  return gardenState(state, player).gardens.find((garden) => garden.id === gardenId);
}

function activeGarden(state: GameState, player: PlayerState, kind: GardenKind): boolean {
  return gardenState(state, player).gardens.some((garden) => garden.kind === kind && garden.revealed && !garden.removed);
}

function revealGardenKind(state: GameState, player: PlayerState, kind: GardenKind): GardenRecord | undefined {
  const garden = gardenState(state, player).gardens.find((item) => item.kind === kind && !item.removed);
  if (!garden) return undefined;
  garden.revealed = true;
  garden.revealedBy ??= "realm";
  syncGardenVisibility(state, gardenState(state, player));
  return garden;
}

function sourceCard(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
  activeOnly = true,
) {
  return [...player.attack, ...player.masterSkills]
    .map((instanceId) => state.cards[instanceId])
    .find((card) => {
      if (!card || card.ownerPlayerId !== player.id) return false;
      const definition = definitions[card.definitionId];
      const matches = card.definitionId === skillId || definition?.linkedSkillId === skillId;
      return matches && (!activeOnly || (card.zone === "attack" && card.active && card.face === "up"));
    });
}

function openDecision(
  state: GameState,
  sourceId: string,
  chooserPlayerId: string,
  stage: string,
  payload: Record<string, unknown>,
  options: PendingDecision["options"],
  min: number,
  max: number,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
  controllerPlayerId = chooserPlayerId,
) {
  const effectId = `${state.gameInstanceId}:${state.revision}:${sourceId}:${stage}:${chooserPlayerId}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: KIARA_RESOLVE,
    sourceId,
    controllerPlayerId,
    payload: { stage, sourceId, ...payload },
    createdAtRevision: state.revision,
  });
  decisionOpen({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: chooserPlayerId,
    chooserPlayerIds: [chooserPlayerId],
    kind: `kiara-${stage}`,
    options,
    min,
    max,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
}

const KIARA_INTRINSIC_IDS = new Set([KIARA_MASTER_ID, KIARA_THESIS_ID, KIARA_GARDENS_ID, KIARA_HEAVENS_HOLE_ID]);

function heavenHoleSkillCards(state: GameState, player: PlayerState) {
  return [...player.masterSkills, ...player.servantSkills]
    .map((instanceId) => state.cards[instanceId])
    .filter((card): card is NonNullable<typeof card> => Boolean(card && card.zone !== "removed" && !KIARA_INTRINSIC_IDS.has(card.definitionId)));
}

function isShakespeareSkill(card: ReturnType<typeof heavenHoleSkillCards>[number], definitions: Record<string, CardDefinition>): boolean {
  return definitions[card.definitionId]?.ownerDefinitionId === "servant.shakespeare" || card.originServantId === "servant.shakespeare";
}

function bodhisattvaUnlocked(state: GameState, player: PlayerState): boolean {
  return Object.values(state.cards).some((card) => card.ownerPlayerId === player.id
    && card.definitionId === KIARA_ASCENSION_ID && card.zone !== "removed");
}

function countedHeavenHoleSkills(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  ignoreShakespeare: boolean,
) {
  return heavenHoleSkillCards(state, player).filter((card) => !(ignoreShakespeare && isShakespeareSkill(card, definitions)));
}

function realmInstance(state: GameState, player: PlayerState, definitionId: string) {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === player.id && card.definitionId === definitionId && card.zone !== "removed");
}

function addRealmSkill(state: GameState, player: PlayerState, definitionId: typeof KIARA_REALM_IDS[number]) {
  const existing = realmInstance(state, player, definitionId);
  if (existing) {
    if (existing.zone !== "master-skills") movePlayerCard(state, player.id, existing.instanceId, "master-skills");
    existing.face = "up";
    existing.active = false;
    return existing.instanceId;
  }
  const instanceId = `${player.id}:kiara-realm:${definitionId.split(".").at(-1)}`;
  createOwnedCardInstance(state, player.id, {
    instanceId,
    definitionId,
    originMasterId: "master.kiara",
    zone: "master-skills",
    face: "up",
  });
  return instanceId;
}

function completeHeavensHole(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  ignoreShakespeare: boolean,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const counted = countedHeavenHoleSkills(state, player, definitions, ignoreShakespeare);
  if (counted.length > 3) throw new Error("KIARA_HEAVENS_HOLE_TOO_MANY_SKILLS");
  const needed = 3 - counted.length;
  const available = KIARA_REALM_IDS.filter((definitionId) => !realmInstance(state, player, definitionId));
  if (needed > available.length) throw new Error("KIARA_HEAVENS_HOLE_REALMS_UNAVAILABLE");
  if (needed === 0) {
    player.flags.outpostActionDuringPreparation = true;
    return { addedRealmInstanceIds: [] };
  }
  if (needed === available.length) {
    const addedRealmInstanceIds = available.map((definitionId) => addRealmSkill(state, player, definitionId));
    player.flags.outpostActionDuringPreparation = true;
    return { addedRealmInstanceIds };
  }
  openDecision(state, KIARA_HEAVENS_HOLE_ID, player.id, "heavens-hole-realms", {
    ignoreShakespeare,
    needed,
    candidates: available,
  }, available.map((definitionId) => ({ id: definitionId, label: definitions[definitionId]?.name ?? definitionId })), needed, needed, decisionOpen);
  return { pending: true };
}

function beginHeavensHole(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const ignoreShakespeare = bodhisattvaUnlocked(state, player);
  const removable = heavenHoleSkillCards(state, player).filter((card) => !KIARA_REALM_IDS.includes(card.definitionId as typeof KIARA_REALM_IDS[number]));
  const counted = countedHeavenHoleSkills(state, player, definitions, ignoreShakespeare);
  const minimumRemoval = Math.max(0, counted.length - 3);
  if (removable.length === 0) return completeHeavensHole(state, player, definitions, ignoreShakespeare, decisionOpen);
  openDecision(state, KIARA_HEAVENS_HOLE_ID, player.id, "heavens-hole-remove", {
    ignoreShakespeare,
    minimumRemoval,
    candidates: removable.map((card) => card.instanceId),
  }, removable.map((card) => ({ id: card.instanceId, label: definitions[card.definitionId]?.name ?? card.definitionId })), minimumRemoval, removable.length, decisionOpen);
  return { pending: true };
}

function revealForRealm(state: GameState, player: PlayerState, realmId: string): GardenRecord[] {
  const kinds: GardenKind[] = realmId === KIARA_WOMB_ID
    ? ["escape-reality", "fear-future", "regrets-past"]
    : realmId === KIARA_DESIRE_ID
      ? ["desire-control", "desire-subjugation"]
      : realmId === KIARA_DIAMOND_ID
        ? ["fear-infinite"]
        : [];
  return kinds.map((kind) => revealGardenKind(state, player, kind)).filter((garden): garden is GardenRecord => Boolean(garden));
}

function revealByThesis(state: GameState, player: PlayerState, garden: GardenRecord) {
  if (garden.removed || garden.revealed) throw new Error("KIARA_GARDEN_NOT_HIDDEN");
  garden.revealed = true;
  garden.revealedBy = "thesis";
  syncGardenVisibility(state, gardenState(state, player));
  const moved = Number(player.flags.movementDistanceThisRound ?? 0) > 0 || Number(player.flags.movementCountThisRound ?? 0) > 0;
  const gainedVictoryPoints = moved ? 0 : gainVictoryPoints(player, garden.victoryPoints);
  return { gardenId: garden.id, kind: garden.kind, gainedVictoryPoints };
}

function handleThesisCombat(
  state: GameState,
  player: PlayerState,
  event: Record<string, unknown>,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const participants = Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : [];
  const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  if (!participants.includes(player.id) || winners.includes(player.id) || winners.length === 0) return;
  const candidates = gardenState(state, player).gardens.filter((garden) => !garden.revealed && !garden.removed && winners.includes(garden.holderPlayerId));
  if (candidates.length === 0) return;
  if (candidates.length === 1) return revealByThesis(state, player, candidates[0]);
  openDecision(state, KIARA_THESIS_ID, player.id, "thesis-reveal", { candidates: candidates.map((garden) => garden.id) }, candidates.map((garden) => ({
    id: garden.id,
    label: `Secret Garden (${garden.holderPlayerId})`,
  })), 1, 1, decisionOpen);
  return { pending: true };
}

function currentObjectives(state: GameState, player: PlayerState): string[] {
  if (!player.locationId || !state.board.currentEvents[player.locationId]) return [];
  return [...state.board.currentEvents[player.locationId]];
}

function beginWombObjective(
  state: GameState,
  player: PlayerState,
  stageReason: "play" | "action" | "combat",
  definitions: Record<string, CardDefinition>,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const source = sourceCard(state, player, KIARA_WOMB_ID, definitions);
  if (!source) return;
  if (stageReason === "play" && activeGarden(state, player, "regrets-past")) return { blockedByGarden: "regrets-past" };
  if (stageReason === "action" && activeGarden(state, player, "escape-reality")) return { blockedByGarden: "escape-reality" };
  if (stageReason === "combat" && activeGarden(state, player, "fear-future")) return { blockedByGarden: "fear-future" };
  const candidates = currentObjectives(state, player);
  if (candidates.length === 0) return { noObjective: true };
  openDecision(state, KIARA_WOMB_ID, player.id, "womb-objective", { stageReason, candidates }, [
    { id: "decline", label: "Do not replace an objective" },
    ...candidates.map((eventId) => ({ id: eventId, label: definitions[eventId]?.name ?? eventId })),
  ], 1, 1, decisionOpen);
  return { pending: true };
}

function applyWombPower(state: GameState, player: PlayerState, amount: number, definitions: Record<string, CardDefinition>) {
  const source = sourceCard(state, player, KIARA_WOMB_ID, definitions);
  if (!source) return;
  const id = `${KIARA_WOMB_ID}:objectives:${state.round}`;
  source.powerModifiers = [...(source.powerModifiers ?? []).filter((modifier) => modifier.id !== id), {
    id,
    sourceId: KIARA_WOMB_ID,
    kind: "add",
    value: amount,
    duration: "round",
  }];
}

function syncDesirePenalty(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  const source = sourceCard(state, player, KIARA_DESIRE_ID, definitions);
  if (!source) return;
  const id = `${KIARA_DESIRE_ID}:subjugation`;
  source.powerModifiers = (source.powerModifiers ?? []).filter((modifier) => modifier.id !== id);
  if (activeGarden(state, player, "desire-subjugation")) {
    source.powerModifiers.push({ id, sourceId: KIARA_DESIRE_ID, kind: "add", value: -6, duration: "game" });
  }
}

function removeGarden(state: GameState, player: PlayerState, garden: GardenRecord, definitions: Record<string, CardDefinition>) {
  if (garden.removed) throw new Error("KIARA_GARDEN_ALREADY_REMOVED");
  garden.removed = true;
  syncGardenVisibility(state, gardenState(state, player));
  syncDesirePenalty(state, player, definitions);
  return garden;
}

function resolveDesireDeployment(
  state: GameState,
  player: PlayerState,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const target = state.players[targetPlayerId];
  if (!target || target.id === player.id || target.eliminated || target.locationId !== player.locationId) return;
  const gardens = gardenState(state, player).gardens.filter((garden) => garden.holderPlayerId === targetPlayerId && !garden.removed);
  if (gardens.length === 0) {
    const defeated = defeatPlayerByEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: KIARA_DESIRE_ID, method: "deploy-without-garden" });
    return { targetPlayerId, defeated };
  }
  if (gardens.length === 1) {
    const removed = removeGarden(state, player, gardens[0], definitions);
    return { targetPlayerId, removedGardenId: removed.id };
  }
  openDecision(state, KIARA_DESIRE_ID, targetPlayerId, "desire-remove-garden", {
    targetPlayerId,
    candidates: gardens.map((garden) => garden.id),
  }, gardens.map((garden) => ({ id: garden.id, label: garden.revealed ? garden.kind : "Secret Garden" })), 1, 1, decisionOpen, player.id);
  return { pending: true, targetPlayerId };
}

function resolveDesireMovement(
  state: GameState,
  player: PlayerState,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent: Parameters<SkillHandler>[0]["emitEvent"],
) {
  if (activeGarden(state, player, "desire-control")) return { suppressedByGarden: true };
  const target = state.players[targetPlayerId];
  if (!target || target.id === player.id || target.eliminated || target.locationId !== player.locationId) return;
  const discardedInstanceIds = [...target.hand];
  for (const instanceId of discardedInstanceIds) movePlayerCard(state, targetPlayerId, instanceId, "discard");
  const defeated = discardedInstanceIds.length < 3
    ? defeatPlayerByEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: KIARA_DESIRE_ID, method: "move-to-desire" })
    : false;
  return { targetPlayerId, discardedInstanceIds, defeated };
}

function handleDiamondPlayed(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  randomInt: (maxExclusive: number) => number,
) {
  revealGardenKind(state, player, "fear-infinite");
  const drawn: Record<string, string[]> = {};
  for (const targetId of state.turnOrder) {
    if (targetId === player.id || !state.players[targetId] || state.players[targetId].eliminated) continue;
    drawn[targetId] = drawCards(state, targetId, 3, randomInt, definitions, { ignoreDrawRestrictions: true });
  }
  return { revealedGarden: "fear-infinite", drawn };
}

function syncDiamondDefeatPenalty(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>) {
  const source = sourceCard(state, player, KIARA_DIAMOND_ID, definitions);
  if (!source) return;
  const id = `${KIARA_DIAMOND_ID}:defeated`;
  source.powerModifiers = (source.powerModifiers ?? []).filter((modifier) => modifier.id !== id);
  if (player.defeated) source.powerModifiers.push({ id, sourceId: KIARA_DIAMOND_ID, kind: "add", value: -5, duration: "round" });
}

function beginAscensionGarden(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  decisionOpen: Parameters<SkillHandler>[0]["openDecision"],
) {
  const gardens = gardenState(state, player).gardens.filter((garden) => !garden.removed);
  if (gardens.length === 0) return { removedGardenId: null, gainedVictoryPoints: 0 };
  if (gardens.length === 1) {
    removeGarden(state, player, gardens[0], definitions);
    return { removedGardenId: gardens[0].id, gainedVictoryPoints: gainVictoryPoints(player, 4) };
  }
  openDecision(state, KIARA_ASCENSION_ID, player.id, "ascension-remove-garden", {
    candidates: gardens.map((garden) => garden.id),
  }, gardens.map((garden) => ({ id: garden.id, label: garden.revealed ? garden.kind : `Secret Garden (${garden.holderPlayerId})` })), 1, 1, decisionOpen);
  return { pending: true };
}

export const useKiaraSecretGardens: SkillHandler = ({ state, player, skill, payload, definitions, openDecision: decisionOpen, randomInt, emitEvent }) => {
  if (!definitions) throw new Error("KIARA_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};

  if (skill.id === KIARA_MASTER_ID) {
    if (eventType === "game.started") return setupGardens(state, player, randomInt);
    if (eventType === "round.ending" && state.round === 8) return beginHeavensHole(state, player, definitions, decisionOpen);
    if (eventType === "combat.resolved") return handleThesisCombat(state, player, event, decisionOpen);
  }

  if (skill.id === KIARA_THESIS_ID && eventType === "combat.resolved") {
    return handleThesisCombat(state, player, event, decisionOpen);
  }

  if (skill.id === KIARA_WOMB_ID) {
    if (eventType === "card.played" && event.playerId === player.id && event.definitionId === KIARA_WOMB_ID) {
      revealForRealm(state, player, KIARA_WOMB_ID);
      return beginWombObjective(state, player, "play", definitions, decisionOpen);
    }
    if ((eventType === "phase.transitioned" || eventType === "phase.embedded-transitioned")
      && (event.transition === "next-phase" || event.transition === "embedded-action") && state.phase === "action") {
      return beginWombObjective(state, player, "action", definitions, decisionOpen);
    }
    if (eventType === "phase.transitioned" && event.transition === "next-phase" && state.phase === "combat") {
      return beginWombObjective(state, player, "combat", definitions, decisionOpen);
    }
  }

  if (skill.id === KIARA_DIAMOND_ID) {
    if (eventType === "card.played" && event.playerId === player.id && event.definitionId === KIARA_DIAMOND_ID) {
      return handleDiamondPlayed(state, player, definitions, randomInt);
    }
    if (eventType === "player.defeated" && event.playerId === player.id) {
      syncDiamondDefeatPenalty(state, player, definitions);
      return { defeated: player.defeated };
    }
    if (eventType === "round.started") {
      syncDiamondDefeatPenalty(state, player, definitions);
      return { defeated: player.defeated };
    }
  }

  if (skill.id === KIARA_DESIRE_ID) {
    if (eventType === "card.played" && event.playerId === player.id && event.definitionId === KIARA_DESIRE_ID) {
      const revealed = revealForRealm(state, player, KIARA_DESIRE_ID);
      syncDesirePenalty(state, player, definitions);
      return { revealedGardenIds: revealed.map((garden) => garden.id) };
    }
    if (eventType === "player.deployed" && typeof event.playerId === "string") {
      if (!sourceCard(state, player, KIARA_DESIRE_ID, definitions)) return;
      return resolveDesireDeployment(state, player, event.playerId, definitions, emitEvent, decisionOpen);
    }
    if (eventType === "player.moved" && typeof event.playerId === "string") {
      if (!sourceCard(state, player, KIARA_DESIRE_ID, definitions)) return;
      return resolveDesireMovement(state, player, event.playerId, definitions, emitEvent);
    }
  }

  if (skill.id === KIARA_ASCENSION_ID && eventType === "skill.unlocked" && event.playerId === player.id && event.skillId === skill.id) {
    return beginAscensionGarden(state, player, definitions, decisionOpen);
  }
};

export const resolveKiaraDecision: SkillHandler = ({ state, player, payload, definitions, randomInt, emitEvent, openDecision: decisionOpen }) => {
  if (!definitions || !isRecord(payload)) throw new Error("KIARA_DECISION_CONTEXT_INVALID");
  const previous = isRecord(payload.previous) ? payload.previous : payload;
  const decision = isRecord(payload.decision) ? payload.decision : undefined;
  if (decision?.status !== "resolved" || !Array.isArray(decision.selections)) throw new Error("KIARA_DECISION_INVALID");
  const selections = decision.selections.filter((value): value is string => typeof value === "string");
  const stage = String(previous.stage ?? "");

  if (stage === "heavens-hole-remove") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    const minimumRemoval = Number(previous.minimumRemoval ?? 0);
    const ignoreShakespeare = previous.ignoreShakespeare === true;
    if (!Number.isInteger(minimumRemoval) || selections.length < minimumRemoval || new Set(selections).size !== selections.length
      || selections.some((instanceId) => !candidates.includes(instanceId))) throw new Error("KIARA_HEAVENS_HOLE_REMOVAL_INVALID");
    for (const instanceId of selections) {
      const card = state.cards[instanceId];
      if (!card || card.ownerPlayerId !== player.id || !["master-skills", "servant-skills"].includes(card.zone)) {
        throw new Error("KIARA_HEAVENS_HOLE_REMOVAL_INVALID");
      }
      removePhysicalCardFromGame(state, instanceId);
    }
    return completeHeavensHole(state, player, definitions, ignoreShakespeare, decisionOpen);
  }

  if (stage === "heavens-hole-realms") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    const needed = Number(previous.needed ?? -1);
    if (!Number.isInteger(needed) || selections.length !== needed || new Set(selections).size !== selections.length
      || selections.some((definitionId) => !candidates.includes(definitionId) || !KIARA_REALM_IDS.includes(definitionId as typeof KIARA_REALM_IDS[number]))) {
      throw new Error("KIARA_HEAVENS_HOLE_REALM_SELECTION_INVALID");
    }
    const addedRealmInstanceIds = selections.map((definitionId) => addRealmSkill(state, player, definitionId as typeof KIARA_REALM_IDS[number]));
    player.flags.outpostActionDuringPreparation = true;
    return { addedRealmInstanceIds };
  }

  if (selections.length !== 1) throw new Error("KIARA_DECISION_SELECTION_INVALID");
  const selected = selections[0];

  if (stage === "thesis-reveal") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selected)) throw new Error("KIARA_THESIS_SELECTION_INVALID");
    const garden = gardenById(state, player, selected);
    if (!garden) throw new Error("KIARA_GARDEN_NOT_FOUND");
    return revealByThesis(state, player, garden);
  }

  if (stage === "womb-objective") {
    if (selected === "decline") return { replaced: false };
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selected) || !player.locationId || !state.board.currentEvents[player.locationId]?.includes(selected)) {
      throw new Error("KIARA_WOMB_EVENT_SELECTION_INVALID");
    }
    const points = Number((definitions[selected] as CardDefinition & { victoryPoints?: number } | undefined)?.victoryPoints ?? 0);
    if (!Number.isInteger(points) || points < 0) throw new Error("KIARA_WOMB_EVENT_VP_INVALID");
    const replacementEventId = replaceEventAtLocation(state, player.locationId as EventLocation, selected, randomInt);
    const currentRound = Number(player.flags.kiaraWombPowerRound ?? -1) === state.round
      ? Number(player.flags.kiaraWombPowerThisRound ?? 0)
      : 0;
    const totalPowerBonus = currentRound + points;
    player.flags.kiaraWombPowerRound = state.round;
    player.flags.kiaraWombPowerThisRound = totalPowerBonus;
    applyWombPower(state, player, totalPowerBonus, definitions);
    return { replaced: true, eventId: selected, replacementEventId, victoryPoints: points, totalPowerBonus };
  }

  if (stage === "desire-remove-garden") {
    const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : "";
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!targetPlayerId || !candidates.includes(selected)) throw new Error("KIARA_DESIRE_GARDEN_SELECTION_INVALID");
    const garden = gardenById(state, player, selected);
    if (!garden || garden.holderPlayerId !== targetPlayerId || garden.removed) throw new Error("KIARA_DESIRE_GARDEN_INVALID");
    removeGarden(state, player, garden, definitions);
    return { targetPlayerId, removedGardenId: garden.id };
  }

  if (stage === "ascension-remove-garden") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(selected)) throw new Error("KIARA_ASCENSION_GARDEN_SELECTION_INVALID");
    const garden = gardenById(state, player, selected);
    if (!garden || garden.removed) throw new Error("KIARA_ASCENSION_GARDEN_INVALID");
    removeGarden(state, player, garden, definitions);
    return { removedGardenId: garden.id, gainedVictoryPoints: gainVictoryPoints(player, 4) };
  }

  throw new Error("KIARA_DECISION_STAGE_INVALID");
};

export function getKiaraSecretGardens(state: GameState, ownerPlayerId: string): GardenRecord[] {
  const rules = privateRulesState(state);
  const existing = rules[KIARA_MODE_KEY];
  if (!isRecord(existing) || existing.ownerPlayerId !== ownerPlayerId || !Array.isArray(existing.gardens)) return [];
  return (existing.gardens as GardenRecord[]).map((garden) => ({ ...garden }));
}
