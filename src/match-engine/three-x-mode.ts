import type { EffectFrame, GameAction, GameEvent, GameState, PhasePlan, PublicModeState, VictoryStatus } from "../domain/state/types.ts";
import type { GameModeDefinition, ModeContext } from "./modes.ts";
import { CommandType } from "./commands.ts";
import { getThreeXPurchaseCost, type ThreeXPurchase } from "../rules-core/three-x-economy.ts";
import { assertThreeXStateInvariants, type ThreeXModeState } from "../rules-core/three-x-state.ts";

export interface ThreeXModeOptions {
  version?: string;
  masterPool?: string[];
  servantPool?: string[];
}

/**
 * The 3X rules package owns setup decisions and public setup projection.
 * Ordinary movement, card play and combat remain shared engine mechanisms.
 */
export function createThreeXModeDefinition(options: ThreeXModeOptions = {}): GameModeDefinition {
  const masterPool = options.masterPool ? [...options.masterPool] : undefined;
  const servantPool = options.servantPool ? [...options.servantPool] : undefined;
  return Object.freeze({
    id: "three-x" as const,
    version: options.version ?? "1",
    playerLimits: { min: 3, max: 7 },
    setup(state: GameState): void {
      const mode = state.modeState.threeX as ThreeXModeState | undefined;
      if (!mode) throw new Error("THREE_X_STATE_MISSING");
      assertThreeXStateInvariants(mode);
      if (mode.playerIds.length < 3 || mode.playerIds.length > 7) throw new Error("THREE_X_PLAYER_LIMIT_INVALID");
    },
    getPhasePlan(): PhasePlan {
      return {
        phases: ["preparation", "outpost", "action", "combat"],
        steps: {
          preparation: ["player-window"],
          outpost: ["player-window"],
          action: ["player-window", "move-decision", "play-batch-draft", "play-batch-commit", "settlement"],
          combat: ["player-window", "post-power-response", "settlement"],
        },
      };
    },
    getLegalActions(state: GameState, playerId: string): GameAction[] {
      const mode = state.modeState.threeX as ThreeXModeState | undefined;
      if (!mode || state.mode !== "three-x" || state.status === "finished") return [];
      if (playerId !== "host" && !mode.playerIds.includes(playerId)) return [];
      return setupActions(mode, playerId, masterPool, servantPool);
    },
    onEvent(_event: GameEvent, _state: GameState, _context: ModeContext): EffectFrame[] {
      return [];
    },
    getVictoryStatus(state: GameState): VictoryStatus {
      if (state.status !== "finished") return { finished: false, winnerIds: [], reason: null };
      const mode = state.modeState.threeX as ThreeXModeState | undefined;
      const budgets = mode?.budgets ?? {};
      const eligible = Object.values(state.players).filter((player) => !player.eliminated);
      const score = (player: { id: string; victoryPoints: number }): number => player.victoryPoints + (budgets[player.id]?.climaxTiebreakBonus ?? 0);
      const highest = Math.max(0, ...eligible.map(score));
      return { finished: true, winnerIds: eligible.filter((player) => score(player) === highest).map((player) => player.id), reason: "final-score" };
    },
    projectPublicState(state: GameState): PublicModeState {
      const mode = state.modeState.threeX as ThreeXModeState | undefined;
      if (!mode) return { modeId: "three-x", values: {} };
      return {
        modeId: "three-x",
        values: {
          playerIds: [...mode.playerIds],
          setupPhase: mode.setupPhase,
          bannedMasterIds: [...mode.bannedMasterIds],
          banCommittedPlayerIds: [...mode.banCommittedPlayerIds],
          purchaseCommittedPlayerIds: [...mode.purchaseCommittedPlayerIds],
          turnOrderLocked: mode.turnOrderLocked,
        },
      };
    },
  });
}

function setupActions(mode: ThreeXModeState, playerId: string, masterPool?: string[], servantPool?: string[]): GameAction[] {
  const actions: GameAction[] = [];
  if (mode.setupPhase === "ban" && playerId !== "host" && !mode.banCommittedPlayerIds.includes(playerId)) {
    const available = (masterPool ?? []).filter((id) => !mode.bannedMasterIds.includes(id));
    for (const masterId of available) actions.push({ type: CommandType.ThreeXBanMaster, payload: { masterId } });
    actions.push({ type: CommandType.ThreeXCommitBan, payload: {} });
  }
  if (mode.setupPhase === "master-draft") {
    if (playerId === "host" && mode.playerIds.every((id) => Boolean(mode.selectedMasterIds[id]))) {
      actions.push({ type: CommandType.ThreeXFinalizeMasters, payload: {} });
    } else if (mode.playerIds.includes(playerId) && !mode.selectedMasterIds[playerId]) {
      for (const masterId of mode.masterOffers[playerId] ?? []) actions.push({ type: CommandType.ThreeXSelectMaster, payload: { masterId } });
    }
  }
  if (mode.setupPhase === "purchase" && mode.playerIds.includes(playerId) && !mode.purchaseCommittedPlayerIds.includes(playerId)) {
    const budget = mode.budgets[playerId];
    if (budget) {
      for (const purchase of ["servant-draw", "climax-tiebreak", "starting-mana", "command-seal"] as ThreeXPurchase[]) {
        try {
          if (budget.stones >= getThreeXPurchaseCost(purchase, budget.purchases[purchase])) actions.push({ type: CommandType.ThreeXPurchase, payload: { purchases: [purchase] } });
        } catch { /* exhausted purchase is not a legal option */ }
      }
    }
    actions.push({ type: CommandType.ThreeXFinalizePurchase, payload: {} });
  }
  if (mode.setupPhase === "servant-select") {
    if (playerId === "host" && mode.playerIds.every((id) => Boolean(mode.selectedServantIds[id]))) actions.push({ type: CommandType.ThreeXFinalizeServants, payload: {} });
    else if (mode.playerIds.includes(playerId) && !mode.selectedServantIds[playerId]) {
      for (const servantId of mode.servantOffers[playerId] ?? []) actions.push({ type: CommandType.ThreeXSelectServant, payload: { servantId } });
    }
  }
  if (mode.setupPhase === "turn-order" && playerId === "host" && !mode.turnOrderLocked && mode.playerIds.every((id) => Boolean(mode.selectedMasterIds[id]) && Boolean(mode.selectedServantIds[id]))) {
    actions.push({ type: CommandType.ThreeXLockTurnOrder, payload: { playerIds: [...mode.playerIds] } });
  }
  return actions;
}

