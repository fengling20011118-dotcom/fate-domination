import type { GameState } from "../domain/state/types.ts";

export interface RulerSealRecord {
  sealId: string;
  controllerPlayerId: string;
  boundPlayerId: string;
  sourceId: string;
  createdRound: number;
  /** Inclusive round in which this temporary seal still exists. */
  expiresAfterRound?: number;
}

export interface RulerSealWinReward {
  rewardId: string;
  controllerPlayerId: string;
  boundPlayerId: string;
  sourceId: string;
  createdRound: number;
  amount: number;
}

export interface RulerSealUseRecord {
  useId: string;
  sealId: string;
  controllerPlayerId: string;
  boundPlayerId: string;
  sourceId: string;
  round: number;
}

interface RulerSealState {
  seals: RulerSealRecord[];
  bindCounts: Record<string, Record<string, number>>;
  winRewards: RulerSealWinReward[];
  uses: RulerSealUseRecord[];
  sequence: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readState(state: GameState): RulerSealState {
  const raw = state.modeState.rulerSeals;
  if (!isRecord(raw)) return { seals: [], bindCounts: {}, winRewards: [], uses: [], sequence: 0 };
  const seals = Array.isArray(raw.seals)
    ? raw.seals.filter((item): item is RulerSealRecord => Boolean(item)
      && typeof item === "object"
      && typeof (item as RulerSealRecord).sealId === "string"
      && typeof (item as RulerSealRecord).controllerPlayerId === "string"
      && typeof (item as RulerSealRecord).boundPlayerId === "string"
      && typeof (item as RulerSealRecord).sourceId === "string"
      && Number.isInteger((item as RulerSealRecord).createdRound))
      .map((item) => ({ ...item }))
    : [];
  const bindCounts: Record<string, Record<string, number>> = {};
  if (isRecord(raw.bindCounts)) {
    for (const [controllerPlayerId, value] of Object.entries(raw.bindCounts)) {
      if (!isRecord(value)) continue;
      bindCounts[controllerPlayerId] = Object.fromEntries(Object.entries(value)
        .filter(([, count]) => Number.isInteger(count) && Number(count) >= 0)
        .map(([playerId, count]) => [playerId, Number(count)]));
    }
  }
  const winRewards = Array.isArray(raw.winRewards)
    ? raw.winRewards.filter((item): item is RulerSealWinReward => Boolean(item)
      && typeof item === "object"
      && typeof (item as RulerSealWinReward).rewardId === "string"
      && typeof (item as RulerSealWinReward).controllerPlayerId === "string"
      && typeof (item as RulerSealWinReward).boundPlayerId === "string"
      && typeof (item as RulerSealWinReward).sourceId === "string"
      && Number.isInteger((item as RulerSealWinReward).createdRound)
      && Number.isInteger((item as RulerSealWinReward).amount)
      && (item as RulerSealWinReward).amount >= 0)
      .map((item) => ({ ...item }))
    : [];
  const uses = Array.isArray(raw.uses)
    ? raw.uses.filter((item): item is RulerSealUseRecord => Boolean(item)
      && typeof item === "object"
      && typeof (item as RulerSealUseRecord).useId === "string"
      && typeof (item as RulerSealUseRecord).sealId === "string"
      && typeof (item as RulerSealUseRecord).controllerPlayerId === "string"
      && typeof (item as RulerSealUseRecord).boundPlayerId === "string"
      && typeof (item as RulerSealUseRecord).sourceId === "string"
      && Number.isInteger((item as RulerSealUseRecord).round))
      .map((item) => ({ ...item }))
    : [];
  const sequence = Number.isInteger(raw.sequence) && Number(raw.sequence) >= 0 ? Number(raw.sequence) : 0;
  return { seals, bindCounts, winRewards, uses, sequence };
}

function writeState(state: GameState, value: RulerSealState): void {
  state.modeState = {
    ...state.modeState,
    rulerSeals: {
      seals: value.seals.map((seal) => ({ ...seal })),
      bindCounts: Object.fromEntries(Object.entries(value.bindCounts).map(([id, counts]) => [id, { ...counts }])),
      winRewards: value.winRewards.map((reward) => ({ ...reward })),
      uses: value.uses.map((use) => ({ ...use })),
      sequence: value.sequence,
    },
  };
}

export function listRulerSeals(state: GameState): RulerSealRecord[] {
  return readState(state).seals;
}

export function listRulerSealsControlledBy(state: GameState, controllerPlayerId: string): RulerSealRecord[] {
  return readState(state).seals.filter((seal) => seal.controllerPlayerId === controllerPlayerId);
}

export function listRulerSealsOnPlayer(state: GameState, boundPlayerId: string): RulerSealRecord[] {
  return readState(state).seals.filter((seal) => seal.boundPlayerId === boundPlayerId);
}

export function getRulerBindCount(state: GameState, controllerPlayerId: string, boundPlayerId: string): number {
  return Number(readState(state).bindCounts[controllerPlayerId]?.[boundPlayerId] ?? 0);
}

/** Eligible living opponents tied for the fewest times this controller has bound them this game. */
export function getLeastBoundOpponentIds(state: GameState, controllerPlayerId: string): string[] {
  const opponents = Object.values(state.players)
    .filter((player) => player.id !== controllerPlayerId && !player.eliminated)
    .map((player) => player.id);
  if (opponents.length === 0) return [];
  const minimum = Math.min(...opponents.map((playerId) => getRulerBindCount(state, controllerPlayerId, playerId)));
  return opponents.filter((playerId) => getRulerBindCount(state, controllerPlayerId, playerId) === minimum);
}

export function grantRulerSeal(
  state: GameState,
  controllerPlayerId: string,
  boundPlayerId: string,
  sourceId: string,
  options: { expiresAfterRound?: number; countAsBinding?: boolean; allowSelf?: boolean } = {},
): RulerSealRecord {
  if (!state.players[controllerPlayerId] || state.players[controllerPlayerId].eliminated) throw new Error("RULER_SEAL_CONTROLLER_INVALID");
  if (!state.players[boundPlayerId] || state.players[boundPlayerId].eliminated
    || (boundPlayerId === controllerPlayerId && options.allowSelf !== true)) throw new Error("RULER_SEAL_TARGET_INVALID");
  if (typeof sourceId !== "string" || !sourceId) throw new Error("RULER_SEAL_SOURCE_INVALID");
  if (options.expiresAfterRound !== undefined && (!Number.isInteger(options.expiresAfterRound) || options.expiresAfterRound < state.round)) {
    throw new Error("RULER_SEAL_EXPIRY_INVALID");
  }
  const store = readState(state);
  store.sequence += 1;
  const seal: RulerSealRecord = {
    sealId: `ruler-seal:${controllerPlayerId}:${boundPlayerId}:${store.sequence}`,
    controllerPlayerId,
    boundPlayerId,
    sourceId,
    createdRound: state.round,
    ...(options.expiresAfterRound !== undefined ? { expiresAfterRound: options.expiresAfterRound } : {}),
  };
  store.seals.push(seal);
  if (options.countAsBinding !== false) {
    const counts = store.bindCounts[controllerPlayerId] ??= {};
    counts[boundPlayerId] = Number(counts[boundPlayerId] ?? 0) + 1;
  }
  writeState(state, store);
  return { ...seal };
}

export function consumeRulerSeal(state: GameState, sealId: string, controllerPlayerId?: string): RulerSealRecord {
  const store = readState(state);
  const index = store.seals.findIndex((seal) => seal.sealId === sealId && (controllerPlayerId === undefined || seal.controllerPlayerId === controllerPlayerId));
  if (index < 0) throw new Error("RULER_SEAL_NOT_AVAILABLE");
  const [seal] = store.seals.splice(index, 1);
  writeState(state, store);
  return { ...seal };
}

/** Record actual use of a Ruler Seal ability. Paying a seal as a cost does not call this boundary. */
export function recordRulerSealUse(state: GameState, seal: RulerSealRecord): RulerSealUseRecord {
  const store = readState(state);
  store.sequence += 1;
  const use: RulerSealUseRecord = {
    useId: `ruler-seal-use:${seal.controllerPlayerId}:${seal.boundPlayerId}:${store.sequence}`,
    sealId: seal.sealId,
    controllerPlayerId: seal.controllerPlayerId,
    boundPlayerId: seal.boundPlayerId,
    sourceId: seal.sourceId,
    round: state.round,
  };
  store.uses = [...store.uses.filter((item) => item.round >= state.round - 1), use].slice(-128);
  writeState(state, store);
  return { ...use };
}

export function listRulerSealUses(state: GameState, controllerPlayerId?: string, round?: number): RulerSealUseRecord[] {
  return readState(state).uses.filter((use) => (controllerPlayerId === undefined || use.controllerPlayerId === controllerPlayerId)
    && (round === undefined || use.round === round));
}

/** Arm the delayed reward printed on the free-play Ruler Seal command. */
export function armRulerSealWinReward(
  state: GameState,
  controllerPlayerId: string,
  boundPlayerId: string,
  sourceId: string,
  amount: number,
): RulerSealWinReward {
  if (!state.players[controllerPlayerId] || !state.players[boundPlayerId]) {
    throw new Error("RULER_SEAL_REWARD_PLAYER_INVALID");
  }
  if (!Number.isInteger(amount) || amount < 0) throw new Error("RULER_SEAL_REWARD_AMOUNT_INVALID");
  const store = readState(state);
  store.sequence += 1;
  const reward: RulerSealWinReward = {
    rewardId: `ruler-seal-reward:${controllerPlayerId}:${boundPlayerId}:${store.sequence}`,
    controllerPlayerId,
    boundPlayerId,
    sourceId,
    createdRound: state.round,
    amount,
  };
  store.winRewards.push(reward);
  writeState(state, store);
  return { ...reward };
}

export function hasRulerSealWinRewardForController(
  state: GameState,
  controllerPlayerId: string,
  participantIds?: readonly string[],
): boolean {
  const participants = participantIds ? new Set(participantIds) : undefined;
  return readState(state).winRewards.some((reward) => reward.controllerPlayerId === controllerPlayerId
    && reward.createdRound === state.round
    && (!participants || participants.has(reward.boundPlayerId)));
}

export function hasRulerSealWinRewardFromSource(
  state: GameState,
  controllerPlayerId: string,
  sourceId: string,
): boolean {
  return readState(state).winRewards.some((reward) => reward.controllerPlayerId === controllerPlayerId
    && reward.sourceId === sourceId);
}

/** Resolve and consume this controller's armed rewards when the bound player's fight ends. */
export function resolveRulerSealWinRewardsForController(
  state: GameState,
  controllerPlayerId: string,
  participantIds: readonly string[],
  winnerIds: readonly string[],
  sourceId?: string,
): RulerSealWinReward[] {
  const participantSet = new Set(participantIds);
  const winnerSet = new Set(winnerIds);
  const store = readState(state);
  const applicable = store.winRewards.filter((reward) => reward.controllerPlayerId === controllerPlayerId
    && reward.createdRound === state.round && participantSet.has(reward.boundPlayerId)
    && (sourceId === undefined || reward.sourceId === sourceId));
  if (applicable.length === 0) return [];
  const ids = new Set(applicable.map((reward) => reward.rewardId));
  store.winRewards = store.winRewards.filter((reward) => !ids.has(reward.rewardId));
  writeState(state, store);
  return applicable.filter((reward) => winnerSet.has(reward.boundPlayerId)).map((reward) => ({ ...reward }));
}

export function expireRulerSealWinRewardsAfterRound(state: GameState, endedRound: number): string[] {
  const store = readState(state);
  const expired = store.winRewards.filter((reward) => reward.createdRound <= endedRound);
  if (expired.length === 0) return [];
  const ids = new Set(expired.map((reward) => reward.rewardId));
  store.winRewards = store.winRewards.filter((reward) => !ids.has(reward.rewardId));
  writeState(state, store);
  return [...ids];
}

export function expireRulerSealsAfterRound(state: GameState, endedRound: number): string[] {
  if (!Number.isInteger(endedRound) || endedRound < 0) throw new Error("RULER_SEAL_ROUND_INVALID");
  const store = readState(state);
  const expired = store.seals.filter((seal) => seal.expiresAfterRound !== undefined && seal.expiresAfterRound <= endedRound);
  if (expired.length === 0) return [];
  const expiredIds = new Set(expired.map((seal) => seal.sealId));
  store.seals = store.seals.filter((seal) => !expiredIds.has(seal.sealId));
  writeState(state, store);
  return [...expiredIds];
}

/** Rebind physical seals to another target, retaining their original controller/source. */
export function transferRulerSealsToPlayer(state: GameState, sealIds: string[], boundPlayerId: string): void {
  if (!state.players[boundPlayerId] || state.players[boundPlayerId].eliminated) throw new Error("RULER_SEAL_TARGET_INVALID");
  const store = readState(state);
  const wanted = new Set(sealIds);
  if (wanted.size !== sealIds.length) throw new Error("RULER_SEAL_DUPLICATE");
  let moved = 0;
  for (const seal of store.seals) {
    if (!wanted.has(seal.sealId)) continue;
    seal.boundPlayerId = boundPlayerId;
    const counts = store.bindCounts[seal.controllerPlayerId] ??= {};
    counts[boundPlayerId] = Number(counts[boundPlayerId] ?? 0) + 1;
    moved += 1;
  }
  if (moved !== wanted.size) throw new Error("RULER_SEAL_NOT_AVAILABLE");
  writeState(state, store);
}
