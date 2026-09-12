import type { GameState } from "../domain/state/types.ts";
import { gainCommandSeals } from "./command-seals.ts";
import { removePhysicalCardFromGame } from "./decks.ts";
import { listUnusedRandomServantIds, replacePlayerMasterPackage, replacePlayerServantPackage } from "./identity-replacement.ts";
import { gainVictoryPoints, setMana } from "./resources.ts";
import type { SkillHandler } from "./skill-types.ts";

export const SHINJI_UNWORTHY_ID = "master.shinji.skill.s2";
export const SHINJI_BOOK_ID = "master.shinji.skill.s4";
export const SHINJI_ASCENSION_ID = "master.shinji.skill.ascension";
export const SHINJI_HANDLER = "core.shinji-book";
export const SHINJI_BOOK_CHOICE_RESOLVE = "core.shinji-book-choice-resolve";

const SAKURA_MASTER_ID = "master.sakura";
const SHAKESPEARE_SERVANT_ID = "servant.shakespeare";
type BookMode = "replacement" | "second-contract";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function currentBookMode(player: GameState["players"][string]): BookMode | undefined {
  const value = player.flags.shinjiBookMode;
  return value === "replacement" || value === "second-contract" ? value : undefined;
}

function bookInstances(state: GameState, playerId: string): string[] {
  return Object.values(state.cards)
    .filter((card) => card.ownerPlayerId === playerId && card.zone !== "removed" && card.definitionId === SHINJI_BOOK_ID)
    .map((card) => card.instanceId);
}

function availableBookModes(state: GameState, playerId: string): BookMode[] {
  const sakuraInGame = Object.values(state.players).some((candidate) => candidate.id !== playerId && !candidate.eliminated && candidate.masterId === SAKURA_MASTER_ID);
  return sakuraInGame ? ["second-contract"] : ["replacement", "second-contract"];
}

function setBookMode(player: GameState["players"][string], mode: BookMode): BookMode {
  player.flags.shinjiBookMode = mode;
  return mode;
}

export const resolveShinjiBookChoice: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.decision)) throw new Error("SHINJI_BOOK_CHOICE_INVALID");
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error("SHINJI_BOOK_CHOICE_INVALID");
  const selected = selections[0] as BookMode;
  if (!availableBookModes(state, player.id).includes(selected)) throw new Error("SHINJI_BOOK_CHOICE_INVALID");
  return { mode: setBookMode(player, selected) };
};

function chooseBookMode(context: Parameters<SkillHandler>[0]): unknown {
  const { state, player, skill, openDecision } = context;
  if (currentBookMode(player)) return { mode: currentBookMode(player) };
  const modes = availableBookModes(state, player.id);
  if (modes.length === 1) return { mode: setBookMode(player, modes[0]) };
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:shinji-book-choice`;
  state.effectQueue.unshift({
    effectId,
    handlerId: SHINJI_BOOK_CHOICE_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: {},
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "shinji-book-mode",
    options: modes.map((mode) => ({ id: mode, label: mode === "replacement" ? "Replacement" : "Second Contract" })),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true };
}

function armBookOnFirstSealDepletion(state: GameState, playerId: string, event: Record<string, unknown>): unknown {
  const player = state.players[playerId];
  if (!player || event.playerId !== playerId || Number(event.after) !== 0 || player.flags.shinjiBookTriggered === true) return;
  if (!currentBookMode(player)) throw new Error("SHINJI_BOOK_MODE_REQUIRED");
  player.flags.shinjiBookTriggered = true;
  player.flags.shinjiBookPendingRound = state.round;
  return { armedRound: state.round, mode: currentBookMode(player) };
}

function resolveBookReplacement(context: Parameters<SkillHandler>[0], event: Record<string, unknown>): unknown {
  const { state, player, runtimeCatalog, randomInt, emitEvent } = context;
  const pendingRound = Number(player.flags.shinjiBookPendingRound);
  if (!Number.isInteger(pendingRound) || pendingRound !== Number(event.round)) return;
  const mode = currentBookMode(player);
  if (!mode || !runtimeCatalog) throw new Error("SHINJI_REPLACEMENT_CONTEXT_REQUIRED");
  delete player.flags.shinjiBookPendingRound;
  if (mode === "replacement") {
    const result = replacePlayerMasterPackage(state, player.id, SAKURA_MASTER_ID, runtimeCatalog, emitEvent);
    setMana(player, runtimeCatalog.masterInitialMana[SAKURA_MASTER_ID] ?? 4);
    const seals = gainCommandSeals(state, player.id, 2);
    return { mode, ...result, ...seals };
  }
  const candidates = listUnusedRandomServantIds(state, runtimeCatalog);
  if (candidates.length === 0) throw new Error("SHINJI_UNUSED_SERVANT_REQUIRED");
  const pick = randomInt?.(candidates.length) ?? 0;
  if (!Number.isInteger(pick) || pick < 0 || pick >= candidates.length) throw new Error("SHINJI_RANDOM_SERVANT_INVALID");
  const servantId = candidates[pick];
  const result = replacePlayerServantPackage(state, player.id, servantId, runtimeCatalog, randomInt ?? (() => 0), emitEvent);
  const seals = gainCommandSeals(state, player.id, 3);
  return { mode, servantId, ...result, ...seals };
}

function removeBook(state: GameState, playerId: string): string[] {
  const removed = bookInstances(state, playerId);
  for (const instanceId of removed) removePhysicalCardFromGame(state, instanceId);
  return removed;
}

function activateCancerousVessel(context: Parameters<SkillHandler>[0]): unknown {
  const { state, player, skill } = context;
  if (state.round !== 9 || player.flags.shinjiCancerousVesselActivated === true) return;
  player.flags.shinjiCancerousVesselActivated = true;
  const removedBookInstanceIds = removeBook(state, player.id);
  const firstServantId = typeof player.flags.firstServantId === "string" ? player.flags.firstServantId : player.servantId;
  const servantReplacementCount = Number(player.flags.servantReplacementCount ?? 0);
  const firstAndOnlyShakespeare = firstServantId === SHAKESPEARE_SERVANT_ID && player.servantId === SHAKESPEARE_SERVANT_ID && servantReplacementCount === 0;
  if (!firstAndOnlyShakespeare) {
    const gainedVictoryPoints = gainVictoryPoints(player, 8);
    return { branch: "gain-vp", gainedVictoryPoints, removedBookInstanceIds };
  }
  player.flags.shinjiCancerousVesselDrainActive = true;
  state.activeRuleModifiers.push({
    id: `${skill.id}:miyama-power:${player.id}:${state.round}:${state.revision}`,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    operation: "add",
    rule: "combat_power",
    scope: { subject: "controller", where: [{ type: "player_location_is", locationId: "mountain" }] },
    value: 12,
    duration: "game",
    createdRound: state.round,
  });
  return { branch: "shakespeare", removedBookInstanceIds };
}

function drainMiyamaOpponents(state: GameState, playerId: string, event: Record<string, unknown>): unknown {
  const player = state.players[playerId];
  const delta = Number(event.delta);
  if (!player || player.flags.shinjiCancerousVesselDrainActive !== true || event.playerId !== playerId || !Number.isInteger(delta) || delta <= 0) return;
  const losses: Record<string, number> = {};
  for (const candidate of Object.values(state.players)) {
    if (candidate.id === playerId || candidate.eliminated || candidate.locationId !== "mountain") continue;
    const lost = Math.min(delta, Math.max(0, candidate.victoryPoints));
    candidate.victoryPoints -= lost;
    losses[candidate.id] = lost;
  }
  return { losses };
}

export const useShinjiBook: SkillHandler = (context) => {
  const { state, player, skill, payload } = context;
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (skill.id === SHINJI_UNWORTHY_ID) {
    if (eventType !== "game.started") return;
    return chooseBookMode(context);
  }
  if (skill.id === SHINJI_BOOK_ID) {
    if (eventType === "player.command-seals.changed") return armBookOnFirstSealDepletion(state, player.id, event);
    if (eventType === "round.ending") return resolveBookReplacement(context, event);
    return;
  }
  if (skill.id === SHINJI_ASCENSION_ID) {
    if (eventType === "round.started") return activateCancerousVessel(context);
    if (eventType === "player.victory-points.changed") return drainMiyamaOpponents(state, player.id, event);
  }
};
