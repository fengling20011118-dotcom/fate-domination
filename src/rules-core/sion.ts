import type { GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import type { SkillAbilityDefinition, SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { clearCardTextSuppression, suppressCardText } from "./card-text.ts";
import { closePlayerCard, createOwnedCardInstance, drawCards, removePhysicalCardFromGame } from "./decks.ts";
import { gainMana, gainVictoryPoints } from "./resources.ts";
import { grantRulerSeal } from "./ruler-seals.ts";
import { clearMoonCell, getMoonCellPlayerIdsInTurnOrder } from "./moon-cell.ts";
import { deployPlayer } from "./board.ts";
import { applyDefeatEffect } from "./defeat.ts";

export const SION_HANDLER = "core.sion-chaldea-training";
export const SION_RESOLVE = "core.sion-chaldea-training-resolve";
export const SION_TRAINING_ID = "master.sion.skill.s1";
export const SION_LIBRARY_ID = "master.sion.skill.s2";
export const SION_CAFETERIA_ID = "master.sion.skill.s3";
export const SION_GYM_ID = "master.sion.skill.s4";
export const SION_RULER_ID = "master.sion.skill.s14";
export const SION_MOON_CANCER_ID = "master.sion.skill.s15";
export const SION_BLACK_BARREL_ID = "master.sion.skill.s17";
export const SION_TRAIN_ABILITY = "advanced-training";
export const SION_CAFETERIA_ABILITY = "cafeteria-combat";
export const SION_RULER_ABILITY = "ruler-bind";
export const SION_REBOOT_ABILITY = "reboot";
export const SION_BLACK_BARREL_ABILITY = "black-barrel";

const STATE_KEY = "sionChaldeaTraining";
const OVERLAY_SOURCE_PREFIX = "sion-chaldea-overlay";
const LUCK_ID = "card.cardluck";
const CHALDEA_IDS = [SION_LIBRARY_ID, SION_CAFETERIA_ID, SION_GYM_ID] as const;
const EX_BY_CLASS: Readonly<Record<string, string>> = Object.freeze({
  Saber: "master.sion.skill.s5",
  Lancer: "master.sion.skill.s6",
  Archer: "master.sion.skill.s7",
  Rider: "master.sion.skill.s8",
  Caster: "master.sion.skill.s9",
  Assassin: "master.sion.skill.s10",
  Berserker: "master.sion.skill.s11",
  "Alter Ego": "master.sion.skill.s12",
  Avenger: "master.sion.skill.s13",
  Ruler: SION_RULER_ID,
  "Moon Cancer": SION_MOON_CANCER_ID,
  Foreigner: "master.sion.skill.s16",
  Shielder: SION_BLACK_BARREL_ID,
});

interface OverlayRecord {
  chaldeaDefinitionId: string;
  chaldeaInstanceId: string;
  coveredInstanceId: string;
  exp: number;
  trained: boolean;
}
interface SionState {
  ownerPlayerId: string;
  overlays: Record<string, OverlayRecord>;
  revealedOpponentIds: string[];
  rulerTargetRounds: Record<string, number>;
  serial: number;
  moonCancerTrainUsed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function privateRulesState(state: GameState): Record<string, unknown> {
  const mode = state.modeState as Record<string, unknown>;
  if (!isRecord(mode.privateRulesState)) mode.privateRulesState = {};
  return mode.privateRulesState as Record<string, unknown>;
}
function packageState(state: GameState, player: PlayerState): SionState {
  const rules = privateRulesState(state);
  const raw = rules[STATE_KEY];
  if (isRecord(raw) && raw.ownerPlayerId === player.id && isRecord(raw.overlays)) return raw as unknown as SionState;
  const created: SionState = { ownerPlayerId: player.id, overlays: {}, revealedOpponentIds: [], rulerTargetRounds: {}, serial: 0, moonCancerTrainUsed: false };
  rules[STATE_KEY] = created as unknown as Record<string, unknown>;
  return created;
}
function syncPublic(state: GameState, data: SionState): void {
  const mode = state.modeState as Record<string, unknown>;
  if (!isRecord(mode.publicRulesState)) mode.publicRulesState = {};
  (mode.publicRulesState as Record<string, unknown>)[STATE_KEY] = {
    overlays: Object.values(data.overlays).map((overlay) => ({ chaldeaDefinitionId: overlay.chaldeaDefinitionId, exp: overlay.exp, trained: overlay.trained })),
  };
}
function sourceFor(chaldeaDefinitionId: string): string { return `${OVERLAY_SOURCE_PREFIX}:${chaldeaDefinitionId}`; }
function physicalDefinitionInstance(state: GameState, player: PlayerState, definitionId: string): string | undefined {
  return [...player.masterSkills, ...player.servantSkills, ...player.attack, ...player.hand].find((instanceId) => {
    const card = state.cards[instanceId];
    return Boolean(card && card.ownerPlayerId === player.id && card.definitionId === definitionId && card.zone !== "removed");
  });
}
function initializeOverlays(state: GameState, player: PlayerState): SionState {
  const data = packageState(state, player);
  const servantSkillIds = player.servantSkills.filter((instanceId) => state.cards[instanceId]?.zone === "servant-skills");
  for (let index = 0; index < CHALDEA_IDS.length; index += 1) {
    const chaldeaDefinitionId = CHALDEA_IDS[index];
    const chaldeaInstanceId = physicalDefinitionInstance(state, player, chaldeaDefinitionId);
    const coveredInstanceId = servantSkillIds[index];
    if (!chaldeaInstanceId || !coveredInstanceId) continue;
    data.overlays[chaldeaDefinitionId] = { chaldeaDefinitionId, chaldeaInstanceId, coveredInstanceId, exp: 0, trained: false };
    suppressCardText(state.cards[coveredInstanceId], sourceFor(chaldeaDefinitionId));
  }
  syncPublic(state, data);
  return data;
}
function overlay(data: SionState, id: string): OverlayRecord | undefined { return data.overlays[id]; }
function incrementExp(state: GameState, data: SionState, id: string, amount = 1): number {
  const item = overlay(data, id);
  if (!item || item.trained) return 0;
  item.exp += amount;
  syncPublic(state, data);
  return item.exp;
}
function openDecision(state: GameState, player: PlayerState, sourceId: string, stage: string, payload: Record<string, unknown>, options: PendingDecision["options"], min: number, max: number, chooserPlayerId: string, open: Parameters<SkillHandler>[0]["openDecision"]): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${sourceId}:${stage}`;
  state.effectQueue.unshift({ effectId, handlerId: SION_RESOLVE, sourceId, controllerPlayerId: player.id, payload: { stage, ...payload }, createdAtRevision: state.revision });
  open({ decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [chooserPlayerId], kind: `sion-${stage}`, options, min, max, allowCancel: false, continuationEffectId: effectId, submissions: {} });
}
function prepareTrain(state: GameState, player: PlayerState, data: SionState, open: Parameters<SkillHandler>[0]["openDecision"]): unknown {
  const candidates = Object.values(data.overlays).filter((item) => !item.trained && state.cards[item.chaldeaInstanceId]?.zone !== "removed");
  if (candidates.length === 0) return { trained: [] };
  openDecision(state, player, SION_TRAINING_ID, "train-select", {}, candidates.map((item) => ({ id: item.chaldeaDefinitionId, label: item.chaldeaDefinitionId })), 1, candidates.length, player.id, open);
  return { pending: true };
}
function applyLibraryTraining(state: GameState, player: PlayerState, item: OverlayRecord): void {
  const levels = Math.floor(item.exp / 2);
  if (levels <= 0) return;
  const covered = state.cards[item.coveredInstanceId];
  if (!covered) return;
  player.cardRuleModifiers ??= [];
  player.cardRuleModifiers.push({ id: `sion-library:${item.coveredInstanceId}`, sourceId: SION_LIBRARY_ID, targetDefinitionIds: [covered.definitionId], targetInstanceIds: [covered.instanceId], costAdd: -levels, duration: "game" });
}
function basicFiveDefinition(definitions: Record<string, CardDefinition>, attribute: "力量" | "迅捷"): CardDefinition | undefined {
  return Object.values(definitions).find((definition) => definition.basic === true && definition.basePower === 5 && (definition.attributes ?? []).includes(attribute));
}
function addBasicFive(state: GameState, player: PlayerState, data: SionState, definitions: Record<string, CardDefinition>, attribute: "力量" | "迅捷"): string {
  const definition = basicFiveDefinition(definitions, attribute);
  if (!definition) throw new Error("SION_BASIC_FIVE_NOT_FOUND");
  data.serial += 1;
  return createOwnedCardInstance(state, player.id, { instanceId: `${player.id}:sion-training:${data.serial}`, definitionId: definition.id, zone: "hand", face: "down" }).instanceId;
}
function addGymPower(player: PlayerState, state: GameState, coveredInstanceId: string, serial: number): void {
  const covered = state.cards[coveredInstanceId];
  if (!covered) throw new Error("SION_COVERED_SKILL_MISSING");
  player.cardRuleModifiers ??= [];
  player.cardRuleModifiers.push({ id: `sion-gym:${coveredInstanceId}:${serial}`, sourceId: SION_GYM_ID, targetDefinitionIds: [covered.definitionId], targetInstanceIds: [covered.instanceId], powerAdd: 1, duration: "game" });
}
function removeChaldeaOverlay(state: GameState, item: OverlayRecord): void {
  const covered = state.cards[item.coveredInstanceId];
  if (covered) clearCardTextSuppression(covered, sourceFor(item.chaldeaDefinitionId));
  const chaldea = state.cards[item.chaldeaInstanceId];
  if (chaldea && chaldea.zone !== "removed") removePhysicalCardFromGame(state, chaldea.instanceId);
  item.trained = true;
}
function openNextTrainingChoice(state: GameState, player: PlayerState, payload: { gymCovered?: string; gymRemaining: number; cafeteriaCovered?: string; cafeteriaEligible: boolean }, open: Parameters<SkillHandler>[0]["openDecision"]): unknown {
  if (payload.gymRemaining > 0 && payload.gymCovered) {
    openDecision(state, player, SION_TRAINING_ID, "gym-choice", payload, [
      { id: "power", label: "+1 trained skill power" }, { id: "strength", label: "Basic Strength 5" }, { id: "agility", label: "Basic Agility 5" },
    ], 1, 1, player.id, open);
    return { pending: true };
  }
  if (payload.cafeteriaEligible && payload.cafeteriaCovered) {
    openDecision(state, player, SION_TRAINING_ID, "cafeteria-choice", payload, [{ id: "replace", label: "Replace with EX Class" }, { id: "decline", label: "Keep trained skill" }], 1, 1, player.id, open);
    return { pending: true };
  }
  return { pending: false };
}
function resolveTrainSelection(state: GameState, player: PlayerState, data: SionState, selected: string[], definitions: Record<string, CardDefinition>, open: Parameters<SkillHandler>[0]["openDecision"]): unknown {
  let gymCovered: string | undefined;
  let gymRemaining = 0;
  let cafeteriaCovered: string | undefined;
  let cafeteriaEligible = false;
  for (const id of selected) {
    const item = overlay(data, id);
    if (!item || item.trained) throw new Error("SION_TRAIN_SELECTION_INVALID");
    removeChaldeaOverlay(state, item);
    if (id === SION_LIBRARY_ID) applyLibraryTraining(state, player, item);
    if (id === SION_GYM_ID) { gymCovered = item.coveredInstanceId; gymRemaining = Math.floor(item.exp / 2); }
    if (id === SION_CAFETERIA_ID) { cafeteriaCovered = item.coveredInstanceId; cafeteriaEligible = item.exp >= 2; }
  }
  syncPublic(state, data);
  return openNextTrainingChoice(state, player, { gymCovered, gymRemaining, cafeteriaCovered, cafeteriaEligible }, open);
}
function replaceWithExClass(state: GameState, player: PlayerState, data: SionState, coveredInstanceId: string, runtimeCatalog: NonNullable<Parameters<SkillHandler>[0]["runtimeCatalog"]>): unknown {
  const servantClass = player.servantId ? runtimeCatalog.servantClasses[player.servantId] : undefined;
  const exDefinitionId = servantClass ? EX_BY_CLASS[servantClass] : undefined;
  if (!exDefinitionId) throw new Error("SION_EX_CLASS_UNAVAILABLE");
  data.serial += 1;
  if (exDefinitionId === SION_MOON_CANCER_ID) {
    if (data.moonCancerTrainUsed) throw new Error("SION_MOON_CANCER_TRAIN_USED");
    data.moonCancerTrainUsed = true;
    const instanceId = createOwnedCardInstance(state, player.id, { instanceId: `${player.id}:sion-ex:${data.serial}`, definitionId: exDefinitionId, originMasterId: "master.sion", zone: "master-skills", face: "up" }).instanceId;
    return { exDefinitionId, instanceId, retainedCoveredInstanceId: coveredInstanceId };
  }
  const covered = state.cards[coveredInstanceId];
  if (!covered || covered.zone === "removed") throw new Error("SION_COVERED_SKILL_MISSING");
  removePhysicalCardFromGame(state, covered.instanceId);
  const instanceId = createOwnedCardInstance(state, player.id, { instanceId: `${player.id}:sion-ex:${data.serial}`, definitionId: exDefinitionId, originMasterId: "master.sion", zone: "servant-skills", face: "down" }).instanceId;
  return { exDefinitionId, instanceId, removedCoveredInstanceId: coveredInstanceId };
}
function useCafeteria(state: GameState, player: PlayerState, data: SionState): unknown {
  if (!player.locationId) throw new Error("SION_CAFETERIA_LOCATION_REQUIRED");
  const ids = state.board.locations[player.locationId] ?? [];
  let opponentsGained = 0;
  const gains: Record<string, number> = {};
  for (const id of ids) {
    const target = state.players[id];
    if (!target || target.eliminated) continue;
    const gained = gainMana(target, 1);
    gains[id] = gained;
    if (id !== player.id && gained > 0) opponentsGained += 1;
  }
  if (opponentsGained > 0) incrementExp(state, data, SION_CAFETERIA_ID, 1);
  return { gains, expGained: opponentsGained > 0 ? 1 : 0 };
}
function beginRuler(state: GameState, player: PlayerState, data: SionState, open: Parameters<SkillHandler>[0]["openDecision"]): unknown {
  const candidates = state.turnOrder.filter((id) => id !== player.id && !state.players[id]?.eliminated && state.round - Number(data.rulerTargetRounds[id] ?? -999) > 3);
  if (candidates.length === 0) throw new Error("SION_RULER_NO_TARGET");
  openDecision(state, player, SION_RULER_ID, "ruler-target", { candidates }, candidates.map((id) => ({ id, label: state.players[id].name })), 1, 1, player.id, open);
  return { pending: true };
}
function activeSource(state: GameState, player: PlayerState, definitionId: string): boolean {
  return player.attack.some((instanceId) => state.cards[instanceId]?.definitionId === definitionId && state.cards[instanceId]?.active && state.cards[instanceId]?.face === "up");
}
function beginReboot(state: GameState, player: PlayerState, open: Parameters<SkillHandler>[0]["openDecision"]): unknown {
  const remaining = getMoonCellPlayerIdsInTurnOrder(state);
  if (remaining.length === 0) throw new Error("SION_MOON_CELL_EMPTY");
  return openRebootTarget(state, player, remaining, [], open);
}
function openRebootTarget(state: GameState, player: PlayerState, remaining: string[], redeployed: string[], open: Parameters<SkillHandler>[0]["openDecision"]): unknown {
  if (remaining.length === 0) return { done: true, redeployed, moonCell: clearMoonCell(state) };
  const targetPlayerId = remaining[0];
  openDecision(state, player, SION_MOON_CANCER_ID, "reboot-target", { remaining, redeployed, targetPlayerId }, [
    { id: "workshop", label: "Workshop" }, { id: "mountain", label: "Miyama" }, { id: "city", label: "Shinto" },
  ], 1, 1, targetPlayerId, open);
  return { pending: true, targetPlayerId };
}
function useBlackBarrel(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, randomInt: (maxExclusive: number) => number, emitEvent: Parameters<SkillHandler>[0]["emitEvent"]): unknown {
  if (!player.locationId) throw new Error("SION_BLACK_BARREL_LOCATION_REQUIRED");
  const participantIds = (state.board.locations[player.locationId] ?? []).filter((id) => !state.players[id]?.eliminated);
  const closedLuckIds: string[] = [];
  for (const id of participantIds) {
    const target = state.players[id];
    for (const instanceId of [...target.attack]) {
      const card = state.cards[instanceId];
      if (card?.definitionId !== LUCK_ID || !card.active || card.face !== "up") continue;
      closePlayerCard(state, id, card.instanceId, definitions, { closedByPlayerId: player.id });
      closedLuckIds.push(card.instanceId);
    }
  }
  for (const id of participantIds) if (id !== player.id) drawCards(state, id, 2, randomInt, definitions);
  const defeatedPlayerIds: string[] = [];
  for (const id of participantIds) {
    const target = state.players[id];
    const revealIds = [...target.hand, ...target.attack.filter((instanceId) => state.cards[instanceId]?.face === "down")];
    let revealedLuck = false;
    for (const instanceId of revealIds) {
      const card = state.cards[instanceId];
      if (!card) continue;
      card.publiclyRevealed = true;
      if (card.definitionId === LUCK_ID) revealedLuck = true;
    }
    if (revealedLuck && applyDefeatEffect(state, id, player.id, definitions, emitEvent, { sourceId: SION_BLACK_BARREL_ID, method: "black-barrel" }).defeated) defeatedPlayerIds.push(id);
  }
  return { closedLuckIds, defeatedPlayerIds };
}

export const useSionPackage: SkillHandler = ({ state, player, skill, payload, definitions, runtimeCatalog, openDecision: open, randomInt, emitEvent }) => {
  if (!definitions) throw new Error("SION_DEFINITIONS_REQUIRED");
  const body = isRecord(payload) ? payload : {};
  const eventType = typeof body.eventType === "string" ? body.eventType : undefined;
  const event = isRecord(body.event) ? body.event : {};
  const data = packageState(state, player);
  if (skill.id === SION_TRAINING_ID) {
    if (eventType === "game.started") return initializeOverlays(state, player);
    if (body.abilityId === SION_TRAIN_ABILITY) return prepareTrain(state, player, data, open);
  }
  if (skill.id === SION_LIBRARY_ID && eventType === "servant.true-name-revealed") {
    const targetId = typeof event.playerId === "string" ? event.playerId : undefined;
    if (!targetId || targetId === player.id || data.revealedOpponentIds.includes(targetId) || state.players[targetId]?.locationId !== player.locationId) return;
    data.revealedOpponentIds.push(targetId);
    gainVictoryPoints(player, 1);
    return { exp: incrementExp(state, data, SION_LIBRARY_ID, 1), targetPlayerId: targetId };
  }
  if (skill.id === SION_GYM_ID && eventType === "combat.resolved") {
    const participantIds = Array.isArray(event.participantIds) ? event.participantIds.filter((id): id is string => typeof id === "string") : Object.keys(isRecord(event.powers) ? event.powers : {});
    if (!participantIds.includes(player.id) || participantIds.filter((id) => id !== player.id && !state.players[id]?.eliminated).length === 0) return;
    return { exp: incrementExp(state, data, SION_GYM_ID, 1) };
  }
  if (skill.id === SION_CAFETERIA_ID && body.abilityId === SION_CAFETERIA_ABILITY) return useCafeteria(state, player, data);
  if (skill.id === SION_RULER_ID && body.abilityId === SION_RULER_ABILITY) return beginRuler(state, player, data, open);
  if (skill.id === SION_MOON_CANCER_ID && body.abilityId === SION_REBOOT_ABILITY) return beginReboot(state, player, open);
  if (skill.id === SION_BLACK_BARREL_ID && body.abilityId === SION_BLACK_BARREL_ABILITY) return useBlackBarrel(state, player, definitions, randomInt ?? (() => 0), emitEvent);
};

export const resolveSionDecision: SkillHandler = ({ state, player, payload, definitions, runtimeCatalog, openDecision: open }) => {
  if (!definitions || !isRecord(payload)) throw new Error("SION_DECISION_CONTEXT_INVALID");
  const previous = isRecord(payload.previous) ? payload.previous : payload;
  const decision = isRecord(payload.decision) ? payload.decision : undefined;
  const selections = Array.isArray(decision?.selections) ? decision.selections.filter((value): value is string => typeof value === "string") : [];
  if (decision?.status !== "resolved") throw new Error("SION_DECISION_INVALID");
  const data = packageState(state, player);
  const stage = String(previous.stage ?? "");
  if (stage === "train-select") return resolveTrainSelection(state, player, data, selections, definitions, open);
  if (stage === "gym-choice") {
    if (selections.length !== 1 || !["power", "strength", "agility"].includes(selections[0])) throw new Error("SION_GYM_TRAIN_INVALID");
    const covered = typeof previous.gymCovered === "string" ? previous.gymCovered : undefined;
    const remaining = Number(previous.gymRemaining ?? 0);
    if (!covered || !Number.isInteger(remaining) || remaining <= 0) throw new Error("SION_GYM_TRAIN_INVALID");
    data.serial += 1;
    if (selections[0] === "power") addGymPower(player, state, covered, data.serial);
    else addBasicFive(state, player, data, definitions, selections[0] === "strength" ? "力量" : "迅捷");
    return openNextTrainingChoice(state, player, { gymCovered: covered, gymRemaining: remaining - 1, cafeteriaCovered: typeof previous.cafeteriaCovered === "string" ? previous.cafeteriaCovered : undefined, cafeteriaEligible: previous.cafeteriaEligible === true }, open);
  }
  if (stage === "cafeteria-choice") {
    if (selections.length !== 1 || (selections[0] !== "replace" && selections[0] !== "decline")) throw new Error("SION_CAFETERIA_TRAIN_INVALID");
    if (selections[0] === "decline") return { replaced: false };
    if (!runtimeCatalog) throw new Error("SION_RUNTIME_CATALOG_REQUIRED");
    const covered = typeof previous.cafeteriaCovered === "string" ? previous.cafeteriaCovered : undefined;
    if (!covered) throw new Error("SION_CAFETERIA_COVERED_SKILL_REQUIRED");
    return { replaced: true, ...replaceWithExClass(state, player, data, covered, runtimeCatalog) };
  }
  if (stage === "ruler-target") {
    if (selections.length !== 1) throw new Error("SION_RULER_TARGET_INVALID");
    const targetId = selections[0];
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (!candidates.includes(targetId) || state.round - Number(data.rulerTargetRounds[targetId] ?? -999) <= 3) throw new Error("SION_RULER_TARGET_INVALID");
    data.rulerTargetRounds[targetId] = state.round;
    return { targetPlayerId: targetId, seal: grantRulerSeal(state, player.id, targetId, SION_RULER_ID, { expiresAfterRound: state.round }) };
  }
  if (stage === "reboot-target") {
    if (selections.length !== 1 || !["workshop", "mountain", "city"].includes(selections[0])) throw new Error("SION_REBOOT_LOCATION_INVALID");
    const targetPlayerId = typeof previous.targetPlayerId === "string" ? previous.targetPlayerId : undefined;
    if (!targetPlayerId || state.players[targetPlayerId]?.eliminated) throw new Error("SION_REBOOT_PLAYER_INVALID");
    deployPlayer(state, targetPlayerId, selections[0] as "workshop" | "mountain" | "city", definitions, { bypassPhase: true, bypassActivePlayer: true });
    const remaining = Array.isArray(previous.remaining) ? previous.remaining.filter((id): id is string => typeof id === "string" && id !== targetPlayerId) : [];
    const redeployed = [...(Array.isArray(previous.redeployed) ? previous.redeployed.filter((id): id is string => typeof id === "string") : []), targetPlayerId];
    return openRebootTarget(state, player, remaining, redeployed, open);
  }
  throw new Error("SION_DECISION_STAGE_INVALID");
};

export const isSionPackageLegal: SkillLegalityPredicate = (state: GameState, playerId: string, skill?: SkillDefinition, ability?: SkillAbilityDefinition) => {
  if (!skill || !ability) return false;
  const player = state.players[playerId];
  if (!player || state.activePlayerId !== playerId) return false;
  if (skill.id === SION_TRAINING_ID && ability.id === SION_TRAIN_ABILITY) return state.phase === "preparation" && Object.values(packageState(state, player).overlays).some((item) => !item.trained);
  if (skill.id === SION_CAFETERIA_ID && ability.id === SION_CAFETERIA_ABILITY) return state.phase === "combat" && Boolean(player.locationId);
  if (skill.id === SION_RULER_ID && ability.id === SION_RULER_ABILITY) return state.phase === "outpost" && state.turnOrder.some((id) => id !== player.id && !state.players[id]?.eliminated && state.round - Number(packageState(state, player).rulerTargetRounds[id] ?? -999) > 3);
  if (skill.id === SION_MOON_CANCER_ID && ability.id === SION_REBOOT_ABILITY) return state.phase === "combat" && activeSource(state, player, SION_MOON_CANCER_ID) && getMoonCellPlayerIdsInTurnOrder(state).length > 0;
  if (skill.id === SION_BLACK_BARREL_ID && ability.id === SION_BLACK_BARREL_ABILITY) return state.phase === "combat" && activeSource(state, player, SION_BLACK_BARREL_ID) && Boolean(player.locationId);
  return false;
};

export function getSionRuntimeState(state: GameState, ownerPlayerId: string): SionState | undefined {
  const raw = privateRulesState(state)[STATE_KEY];
  if (!isRecord(raw) || raw.ownerPlayerId !== ownerPlayerId) return undefined;
  return structuredClone(raw) as unknown as SionState;
}
