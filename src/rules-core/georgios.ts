import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import type { CardDefinition } from "./content-types.ts";
import { getPrintedCardBasePower } from "./card-values.ts";
import { drawCards } from "./decks.ts";
import { movePlayerByEffect } from "./board.ts";
import { addDragonStatus, playerIsDragon, removeDragonStatusFromSource } from "./player-statuses.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { StateRandom } from "../match-engine/random.ts";

export const GEORGIOS_MARTYR_ID = "servant.georgios.skill.sc-georgios-1";
export const GEORGIOS_BAYARD_ID = "servant.georgios.skill.sc-georgios-2";
export const GEORGIOS_ASCALON_ID = "servant.georgios.skill.sc-georgios-3";

export const GEORGIOS_MARTYR_HANDLER = "core.georgios-martyr-soul";
export const GEORGIOS_BAYARD_HANDLER = "core.georgios-bayard";
export const GEORGIOS_BAYARD_RESOLVE = "core.georgios-bayard-resolve";
export const GEORGIOS_ASCALON_HANDLER = "core.georgios-ascalon";
export const GEORGIOS_ASCALON_RESOLVE = "core.georgios-ascalon-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function ownedLiveSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return Object.values(state.cards).find((card) => {
    const definition = definitions[card.definitionId];
    return Boolean(card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone !== "removed" && card.zone !== "discard" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function skillZoneSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return [...player.masterSkills, ...player.servantSkills].map((instanceId) => state.cards[instanceId]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && (card.zone === "master-skills" || card.zone === "servant-skills") && matchesSkill(definition, card.definitionId, skillId));
  });
}

function randomIntFor(state: GameState, randomInt?: (maxExclusive: number) => number): (maxExclusive: number) => number {
  return randomInt ?? ((maxExclusive) => new StateRandom().integer(state, maxExclusive));
}

/** Martyr's Soul: Sacredness replaces the active Situation's Noble-Phantasm ban for this player. */
export const useGeorgiosMartyrSoul: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== "sacredness" || state.phase !== "action" || state.activePlayerId !== player.id) {
    throw new Error("GEORGIOS_MARTYR_WINDOW_INVALID");
  }
  if (!skillZoneSkill(state, player, skill.id, definitions)) throw new Error("GEORGIOS_MARTYR_SOURCE_INVALID");
  const forbidden = (state.modeState.situationRestrictions as { forbiddenAttributes?: string[] } | undefined)?.forbiddenAttributes ?? [];
  if (!forbidden.includes("宝具")) throw new Error("GEORGIOS_MARTYR_NO_NOBLE_PHANTASM_BAN");
  player.flags.situationNoblePhantasmBanReplacementRound = state.round;
  player.flags.situationNoblePhantasmBanReplacementPower = 3;
  return { replacementRound: state.round, powerBonus: 3 };
};

export const isGeorgiosMartyrSoulLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  const forbidden = (state.modeState.situationRestrictions as { forbiddenAttributes?: string[] } | undefined)?.forbiddenAttributes ?? [];
  return Boolean(player && definitions && ability?.id === "sacredness" && state.phase === "action" && state.activePlayerId === playerId
    && forbidden.includes("宝具") && skillZoneSkill(state, player, skill.id, definitions));
};

function bayardCanFollowDragon(
  state: GameState,
  player: PlayerState,
  bayardInstanceId: string,
  dragonPlayerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  const dragon = state.players[dragonPlayerId];
  if (!dragon || dragon.eliminated || !playerIsDragon(dragon) || (dragon.locationId !== "mountain" && dragon.locationId !== "city")) return false;
  try {
    const draft = structuredClone(state) as GameState;
    addCardToAttack(draft, player.id, bayardInstanceId, definitions, { payCost: true, bypassFaceUpPlayLimit: true, bypassTiming: true });
    movePlayerByEffect(draft, player.id, dragon.locationId, definitions);
    return true;
  } catch {
    return false;
  }
}

function openBayardFollowDecision(
  state: GameState,
  player: PlayerState,
  bayardInstanceId: string,
  dragonPlayerId: string,
  locationId: string,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${GEORGIOS_BAYARD_ID}:follow`;
  state.effectQueue.unshift({
    effectId,
    handlerId: GEORGIOS_BAYARD_RESOLVE,
    sourceId: GEORGIOS_BAYARD_ID,
    controllerPlayerId: player.id,
    payload: { stage: "follow", bayardInstanceId, dragonPlayerId, locationId },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "georgios-bayard-follow",
    options: [{ id: "play", label: "打出贝亚德并跟随" }, { id: "skip", label: "不打出" }],
    min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
}

function bayardAppendCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>): string[] {
  return player.hand.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || getPrintedCardBasePower(state, player, definition) > 3) return false;
    try {
      const draft = structuredClone(state) as GameState;
      addCardToAttack(draft, player.id, instanceId, definitions, { payCost: true, bypassFaceUpPlayLimit: true, bypassTiming: true });
      return true;
    } catch {
      return false;
    }
  });
}

function openBayardAppendDecision(
  state: GameState,
  player: PlayerState,
  candidates: string[],
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${GEORGIOS_BAYARD_ID}:append`;
  state.effectQueue.unshift({ effectId, handlerId: GEORGIOS_BAYARD_RESOLVE, sourceId: GEORGIOS_BAYARD_ID, controllerPlayerId: player.id,
    payload: { stage: "append", candidates }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "georgios-bayard-append",
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 0, max: Math.min(3, candidates.length), allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
}

/** Bayard: optional Dragon-follow play plus its universal On Play draw/append trigger. */
export const useGeorgiosBayard: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, emitEvent, randomInt }) => {
  if (!definitions || !isRecord(payload)) throw new Error("GEORGIOS_BAYARD_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  const event = isRecord(payload.event) ? payload.event : {};
  if (eventType === "player.moved") {
    const dragonPlayerId = typeof event.playerId === "string" ? event.playerId : undefined;
    const locationId = typeof event.locationId === "string" ? event.locationId : undefined;
    const bayard = skillZoneSkill(state, player, skill.id, definitions);
    if (!dragonPlayerId || dragonPlayerId === player.id || (locationId !== "mountain" && locationId !== "city") || !bayard) return;
    if (!bayardCanFollowDragon(state, player, bayard.instanceId, dragonPlayerId, definitions)) return;
    openBayardFollowDecision(state, player, bayard.instanceId, dragonPlayerId, locationId, openDecision);
    return { pending: true, dragonPlayerId, locationId };
  }
  if (eventType === "card.played") {
    const definitionId = typeof event.definitionId === "string" ? event.definitionId : undefined;
    if (!definitionId || !matchesSkill(definitions[definitionId], definitionId, skill.id) || event.playerId !== player.id || event.face !== "up") return;
    const drawn = drawCards(state, player.id, 1, randomIntFor(state, randomInt), definitions);
    const candidates = bayardAppendCandidates(state, player, definitions);
    if (candidates.length > 0) {
      openBayardAppendDecision(state, player, candidates, definitions, openDecision);
      return { pending: true, drawnInstanceIds: drawn, candidateInstanceIds: candidates };
    }
    return { drawnInstanceIds: drawn, appendedInstanceIds: [] };
  }
  throw new Error("GEORGIOS_BAYARD_EVENT_INVALID");
};

export const resolveGeorgiosBayard: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("GEORGIOS_BAYARD_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((value): value is string => typeof value === "string") : [];
  if (decision.status !== "resolved") throw new Error("GEORGIOS_BAYARD_DECISION_INVALID");
  if (previous.stage === "follow") {
    if (selections.length !== 1 || (selections[0] !== "play" && selections[0] !== "skip")) throw new Error("GEORGIOS_BAYARD_DECISION_INVALID");
    if (selections[0] === "skip") return { played: false };
    const bayardInstanceId = typeof previous.bayardInstanceId === "string" ? previous.bayardInstanceId : undefined;
    const dragonPlayerId = typeof previous.dragonPlayerId === "string" ? previous.dragonPlayerId : undefined;
    const locationId = typeof previous.locationId === "string" ? previous.locationId : undefined;
    if (!bayardInstanceId || !dragonPlayerId || !locationId || !bayardCanFollowDragon(state, player, bayardInstanceId, dragonPlayerId, definitions)) {
      throw new Error("GEORGIOS_BAYARD_FOLLOW_INVALID");
    }
    const { paidMana } = addCardToAttack(state, player.id, bayardInstanceId, definitions, { payCost: true, bypassFaceUpPlayLimit: true, bypassTiming: true });
    const definition = definitions[state.cards[bayardInstanceId].definitionId];
    if (definition.revealsTrueNameOnPlay === true && !player.trueNameRevealed) revealPlayerTrueName(state, player.id);
    emitEvent?.("card.played", { playerId: player.id, instanceId: bayardInstanceId, definitionId: definition.id, face: "up", paidMana, method: "georgios-bayard-follow" });
    emitEvent?.("card.used", { playerId: player.id, instanceId: bayardInstanceId, definitionId: definition.id, locationId: player.locationId, method: "georgios-bayard-follow" });
    const movement = movePlayerByEffect(state, player.id, locationId, definitions);
    emitEvent?.("player.moved", { playerId: player.id, ...movement, method: "effect", sourceId: GEORGIOS_BAYARD_ID });
    emitEvent?.("player.entered-location", { playerId: player.id, ...movement, method: "effect", sourceId: GEORGIOS_BAYARD_ID });
    return { played: true, bayardInstanceId, paidMana, movement };
  }
  if (previous.stage === "append") {
    const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((value): value is string => typeof value === "string") : [];
    if (selections.length > 3 || new Set(selections).size !== selections.length || selections.some((instanceId) => !candidates.includes(instanceId))) {
      throw new Error("GEORGIOS_BAYARD_APPEND_SELECTION_INVALID");
    }
    const draft = structuredClone(state) as GameState;
    for (const instanceId of selections) addCardToAttack(draft, player.id, instanceId, definitions, { payCost: true, bypassFaceUpPlayLimit: true, bypassTiming: true });
    const appended: Array<{ instanceId: string; paidMana: number }> = [];
    for (const instanceId of selections) {
      const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, { payCost: true, bypassFaceUpPlayLimit: true, bypassTiming: true });
      const definition = definitions[state.cards[instanceId].definitionId];
      if (definition.revealsTrueNameOnPlay === true && !player.trueNameRevealed) revealPlayerTrueName(state, player.id);
      emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana, method: "georgios-bayard-append" });
      emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, method: "georgios-bayard-append" });
      appended.push({ instanceId, paidMana });
    }
    return { appended };
  }
  throw new Error("GEORGIOS_BAYARD_DECISION_INVALID");
};

function ascalonDragonSource(playerId: string): string {
  return `${GEORGIOS_ASCALON_ID}:${playerId}`;
}

function ascalonEligibleWinners(state: GameState, player: PlayerState, event: Record<string, unknown>): string[] {
  const participantIds = Array.isArray(event.participantIds) ? event.participantIds.filter((value): value is string => typeof value === "string") : [];
  const winnerIds = Array.isArray(event.winnerIds) ? event.winnerIds.filter((value): value is string => typeof value === "string") : [];
  const opponentParticipants = participantIds.filter((playerId) => playerId !== player.id && state.players[playerId] && !state.players[playerId].eliminated);
  if (new Set(opponentParticipants).size < 2) return [];
  return winnerIds.filter((playerId) => playerId !== player.id && opponentParticipants.includes(playerId) && state.players[playerId] && !state.players[playerId].eliminated);
}

/** Ascalon: after a contested fight among opponents, optionally move Georgios's source-scoped Dragon marker to a winner. */
export const useGeorgiosAscalon: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload) || payload.eventType !== "combat.resolved" || !isRecord(payload.event)) throw new Error("GEORGIOS_ASCALON_CONTEXT_INVALID");
  if (!ownedLiveSkill(state, player, skill.id, definitions)) return;
  const candidates = ascalonEligibleWinners(state, player, payload.event);
  if (candidates.length === 0) return;
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${GEORGIOS_ASCALON_ID}:dragon`;
  state.effectQueue.unshift({ effectId, handlerId: GEORGIOS_ASCALON_RESOLVE, sourceId: GEORGIOS_ASCALON_ID, controllerPlayerId: player.id,
    payload: { candidates }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "georgios-ascalon-dragon",
    options: [{ id: "skip", label: "不发动" }, ...candidates.map((playerId) => ({ id: playerId, label: state.players[playerId]?.name ?? playerId }))],
    min: 1, max: 1, allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
  return { pending: true, candidatePlayerIds: candidates };
};

export const resolveGeorgiosAscalon: SkillHandler = ({ state, player, payload }) => {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("GEORGIOS_ASCALON_DECISION_INVALID");
  const candidates = Array.isArray(payload.previous.candidates) ? payload.previous.candidates.filter((value): value is string => typeof value === "string") : [];
  const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((value): value is string => typeof value === "string") : [];
  if (payload.decision.status !== "resolved" || selections.length !== 1 || (selections[0] !== "skip" && !candidates.includes(selections[0]))) {
    throw new Error("GEORGIOS_ASCALON_DECISION_INVALID");
  }
  if (selections[0] === "skip") return { markedPlayerId: null };
  const target = state.players[selections[0]];
  if (!target || target.eliminated) throw new Error("GEORGIOS_ASCALON_TARGET_INVALID");
  const sourceId = ascalonDragonSource(player.id);
  for (const candidate of Object.values(state.players)) removeDragonStatusFromSource(candidate, sourceId);
  addDragonStatus(target, sourceId);
  return { markedPlayerId: target.id, sourceId };
};

export const isGeorgiosAscalonLegal: SkillLegalityPredicate = () => false;
