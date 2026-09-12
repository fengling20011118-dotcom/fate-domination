import type { GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { createOwnedCardInstance, movePlayerCard } from "./decks.ts";
import { adjustVictoryPoints, gainVictoryPoints, loseMana } from "./resources.ts";
import type { SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const CAREN_SPIRIT_MEDIUM_ID = "master.caren.skill.s1";
export const CAREN_EXECUTOR_ID = "master.caren.skill.s1a";
export const CAREN_MASOCHISM_ID = "master.caren.skill.s2";
export const CAREN_SHROUD_ID = "master.caren.skill.s3";
export const CAREN_ASCENSION_ID = "master.caren.skill.ascension";

export const CAREN_SPIRIT_MEDIUM_HANDLER = "core.caren-spirit-medium";
export const CAREN_GAIN_SHROUD_HANDLER = "core.caren-gain-shroud";
export const CAREN_MASOCHISM_HANDLER = "core.caren-spiritual-masochism";
export const CAREN_SHROUD_HANDLER = "core.caren-shroud-magdalene";
export const CAREN_SHROUD_RESOLVE = "core.caren-shroud-magdalene-resolve";
export const CAREN_ASCENSION_HANDLER = "core.caren-valentinus";

const SHROUD_TARGETS_KEY = "carenShroudTargets";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function ownedSkillInstance(state: GameState, player: PlayerState, definitionId: string) {
  return Object.values(state.cards).find((card) => card.ownerPlayerId === player.id && card.definitionId === definitionId);
}

function ensureSkillInZone(state: GameState, player: PlayerState, definitionId: string, grantSourceId: string): string {
  const existing = ownedSkillInstance(state, player, definitionId);
  if (existing) {
    if (existing.zone !== "master-skills" || !player.masterSkills.includes(existing.instanceId)) {
      movePlayerCard(state, player.id, existing.instanceId, "master-skills");
    }
    existing.face = "up";
    existing.active = false;
    existing.controllerPlayerId = player.id;
    return existing.instanceId;
  }
  const instanceId = `${player.id}:granted:${grantSourceId}:${definitionId}`;
  createOwnedCardInstance(state, player.id, {
    instanceId,
    definitionId,
    zone: "master-skills",
    face: "up",
    active: false,
  });
  return instanceId;
}

function removeOwnedSkill(state: GameState, player: PlayerState, definitionId: string): string | undefined {
  const existing = ownedSkillInstance(state, player, definitionId);
  if (!existing || existing.zone === "removed") return undefined;
  movePlayerCard(state, player.id, existing.instanceId, "removed");
  return existing.instanceId;
}

/** Spirit Medium: start with Spiritual Masochism, then lose it on the first fall to 1 or less mana. */
export const useCarenSpiritMedium: SkillHandler = ({ state, player, payload }) => {
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "game.started") {
    return { grantedInstanceId: ensureSkillInZone(state, player, CAREN_MASOCHISM_ID, CAREN_SPIRIT_MEDIUM_ID) };
  }
  if (eventType !== "player.mana.changed" || event.playerId !== player.id) return;
  if (player.flags.carenSpiritMediumLost === true) return;
  const before = Number(event.before);
  const after = Number(event.after);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 1 || after > 1) return;
  player.flags.carenSpiritMediumLost = true;
  return { removedInstanceId: removeOwnedSkill(state, player, CAREN_MASOCHISM_ID) };
};

/** Executor/Valentinus use the same physical-card grant boundary, including returning a previously removed Shroud. */
export const useCarenGainShroud: SkillHandler = ({ state, player, payload, skill }) => {
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (skill.id === CAREN_EXECUTOR_ID) {
    if (eventType !== "servant.true-name-revealed" || event.playerId !== player.id) return;
  } else if (eventType !== "skill.unlocked" || event.playerId !== player.id || event.skillId !== CAREN_ASCENSION_ID) {
    return;
  }
  return { grantedInstanceId: ensureSkillInZone(state, player, CAREN_SHROUD_ID, skill.id) };
};

function definitionForSource(state: GameState, sourceId: string, definitions: Record<string, CardDefinition>): CardDefinition | undefined {
  return definitions[sourceId] ?? definitions[state.cards[sourceId]?.definitionId ?? ""];
}

/** Structured source classification for Spiritual Masochism; no display-text parsing or character-name branching. */
export function isCarenMasochismVictoryPointSource(
  state: GameState,
  sourceId: string | undefined,
  definitions: Record<string, CardDefinition>,
): boolean {
  if (!sourceId) return false;
  if (sourceId === "command-seal" || sourceId === "ruler-seal-command" || sourceId.startsWith("command-seal:") || sourceId.startsWith("ruler-seal:")) return true;
  const definition = definitionForSource(state, sourceId, definitions);
  if (!definition?.isSkill) return false;
  return definition.skillOwnerType === "servant" || definition.tags?.includes("ascension") === true;
}

/** Spiritual Masochism corrects the just-observed VP gain to floor(half), then converts actual mana lost into VP. */
export const useCarenSpiritualMasochism: SkillHandler = ({ state, player, payload, definitions }) => {
  if (!definitions) throw new Error("CAREN_MASOCHISM_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType !== "player.victory-points.changed" || !isRecord(data.event)) return;
  const event = data.event;
  const targetId = typeof event.playerId === "string" ? event.playerId : undefined;
  const target = targetId ? state.players[targetId] : undefined;
  const delta = Number(event.delta);
  const sourceId = typeof event.sourceId === "string" ? event.sourceId : undefined;
  if (!target || target.id === player.id || target.eliminated || !player.locationId || target.locationId !== player.locationId) return;
  if (!Number.isInteger(delta) || delta <= 0 || !isCarenMasochismVictoryPointSource(state, sourceId, definitions)) return;
  const correctedGain = Math.floor(delta / 2);
  const prevented = delta - correctedGain;
  adjustVictoryPoints(target, -prevented);
  const manaLost = loseMana(player, prevented);
  const gainedVictoryPoints = gainVictoryPoints(player, manaLost);
  return { targetPlayerId: target.id, originalGain: delta, correctedGain, prevented, manaLost, gainedVictoryPoints };
};

interface ShroudTargetRecord {
  playerId: string;
  round: number;
}

function readShroudTargets(player: PlayerState): ShroudTargetRecord[] {
  const raw = player.flags[SHROUD_TARGETS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is ShroudTargetRecord => isRecord(item) && typeof item.playerId === "string" && Number.isInteger(item.round));
}

function writeShroudTargets(player: PlayerState, targets: ShroudTargetRecord[]): void {
  player.flags[SHROUD_TARGETS_KEY] = targets;
}

function shroudCandidates(state: GameState, player: PlayerState): string[] {
  if (player.locationId !== "mountain" && player.locationId !== "city") return [];
  return (state.board.locations[player.locationId] ?? []).filter((id) => id !== player.id && Boolean(state.players[id]) && !state.players[id].eliminated);
}

function applyShroud(state: GameState, player: PlayerState, skill: SkillDefinition, targetPlayerId: string, penalty: number) {
  const target = state.players[targetPlayerId];
  const source = ownedSkillInstance(state, player, CAREN_SHROUD_ID);
  if (!source || source.zone !== "master-skills") throw new Error("CAREN_SHROUD_SOURCE_MISSING");
  if (!target || !shroudCandidates(state, player).includes(targetPlayerId)) throw new Error("CAREN_SHROUD_TARGET_INVALID");
  if (!Number.isInteger(penalty) || penalty < 1 || penalty > 5) throw new Error("CAREN_SHROUD_PENALTY_INVALID");
  target.flags.regularMovementBlockedRound = state.round;
  state.activeRuleModifiers.push({
    id: `${skill.id}:power:${source.instanceId}:${targetPlayerId}:${state.round}:${state.revision}:${state.activeRuleModifiers.length}`,
    sourceId: skill.id,
    sourceInstanceId: source.instanceId,
    controllerPlayerId: player.id,
    operation: "add",
    rule: "combat_power",
    scope: { subject: "all_players", playerIds: [targetPlayerId] },
    value: -penalty,
    duration: "round",
    createdRound: state.round,
  });
  const current = readShroudTargets(player).filter((entry) => entry.round === state.round);
  writeShroudTargets(player, [...current, { playerId: targetPlayerId, round: state.round }]);
  return { targetPlayerId, penalty };
}

export const useCarenShroud: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("CAREN_SHROUD_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "combat.resolved" && isRecord(data.event)) {
    const event = data.event;
    const winners = new Set(Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : []);
    const participants = new Set(isRecord(event.powers) ? Object.keys(event.powers) : []);
    const lostTarget = readShroudTargets(player).some((entry) => entry.round === state.round && participants.has(entry.playerId) && !winners.has(entry.playerId));
    if (!lostTarget) return;
    delete player.flags[SHROUD_TARGETS_KEY];
    return { removedInstanceId: removeOwnedSkill(state, player, CAREN_SHROUD_ID) };
  }
  if (data.abilityId !== "bind-opponent" || state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("CAREN_SHROUD_WINDOW_INVALID");
  const directTarget = typeof data.targetPlayerId === "string" ? data.targetPlayerId : undefined;
  const directPenalty = Number(data.penalty);
  if (directTarget && Number.isInteger(directPenalty)) return applyShroud(state, player, skill, directTarget, directPenalty);
  const candidates = shroudCandidates(state, player);
  if (candidates.length === 0) throw new Error("CAREN_SHROUD_NO_TARGET");
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:choose`;
  state.effectQueue.unshift({
    effectId,
    handlerId: CAREN_SHROUD_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { candidates },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: "caren-shroud-target-power",
    options: candidates.flatMap((targetId) => [1, 2, 3, 4, 5].map((penalty) => ({ id: `${targetId}|${penalty}`, label: `${state.players[targetId]?.name ?? targetId} -${penalty}` }))),
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true };
};

export const resolveCarenShroud: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("CAREN_SHROUD_DECISION_INVALID");
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error("CAREN_SHROUD_DECISION_INVALID");
  const split = selections[0].lastIndexOf("|");
  const targetPlayerId = split > 0 ? selections[0].slice(0, split) : "";
  const penalty = Number(split > 0 ? selections[0].slice(split + 1) : NaN);
  const candidates = Array.isArray(payload.previous.candidates) ? payload.previous.candidates.filter((id): id is string => typeof id === "string") : [];
  if (!candidates.includes(targetPlayerId)) throw new Error("CAREN_SHROUD_TARGET_INVALID");
  return applyShroud(state, player, skill, targetPlayerId, penalty);
};

export const isCarenShroudLegal: SkillLegalityPredicate = (state, playerId, skill, ability) => {
  const player = state.players[playerId];
  if (!player || ability?.id !== "bind-opponent" || state.phase !== "action" || state.activePlayerId !== playerId) return false;
  const source = ownedSkillInstance(state, player, skill.id);
  return Boolean(source && source.zone === "master-skills" && shroudCandidates(state, player).length > 0);
};

/** Shroud of Valentinus: regain Magdalene when unlocked; Mark of Eros gives each opposing fight winner 3 VP. */
export const useCarenValentinus: SkillHandler = ({ state, player, skill, payload }) => {
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const event = isRecord(data.event) ? data.event : {};
  if (eventType === "skill.unlocked") {
    if (event.playerId !== player.id || event.skillId !== CAREN_ASCENSION_ID) return;
    return { grantedInstanceId: ensureSkillInZone(state, player, CAREN_SHROUD_ID, skill.id) };
  }
  if (eventType !== "combat.resolved") return;
  const winners = Array.isArray(event.winnerIds) ? event.winnerIds.filter((id): id is string => typeof id === "string") : [];
  const rewarded: Record<string, number> = {};
  for (const winnerId of winners) {
    if (winnerId === player.id) continue;
    const opponent = state.players[winnerId];
    if (!opponent || opponent.eliminated) continue;
    rewarded[winnerId] = gainVictoryPoints(opponent, 3);
  }
  return { rewarded };
};
