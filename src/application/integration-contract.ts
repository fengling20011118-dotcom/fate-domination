import type { GameCommand } from "../match-engine/commands.ts";
import type { GameEvent } from "../domain/state/types.ts";
import type { PublicGameState } from "../projection/project-state.ts";
import type { CardDefinition } from "../rules-core/content-types.ts";

/** The complete recipient-safe match state a front end may render. */
export type MatchView = PublicGameState;

export interface AvailableAction<TPayload = unknown> {
  id: string;
  commandType: string;
  label: string;
  payload?: TPayload;
  /** Backend-provided candidates/constraints; this is not permission to calculate a result in the UI. */
  input?: {
    kind: "none" | "single-choice" | "multi-choice" | "structured";
    options?: Array<{ id: string; label: string; disabled?: boolean }>;
    min?: number;
    max?: number;
  };
}

export interface CalculationLine {
  kind: "cost" | "power" | "reward" | "restriction" | "trigger" | "other";
  sourceId?: string;
  label: string;
  value?: number;
}

export interface CalculationDetail {
  subjectId: string;
  total?: number;
  lines: CalculationLine[];
}

export interface CommandRejection {
  code: string;
  message?: string;
  retryable: boolean;
}

export type CommandResult =
  | {
      ok: true;
      commandId: string;
      duplicate: boolean;
      revision: number;
      view: MatchView;
      availableActions: AvailableAction[];
      events: GameEvent[];
      calculations: CalculationDetail[];
    }
  | {
      ok: false;
      commandId: string;
      revision: number;
      view: MatchView;
      availableActions: AvailableAction[];
      rejection: CommandRejection;
    };

/** Development-room request for a rule fragment that is not executable yet. */
export interface HostAdjudicationRequest {
  requestId: string;
  gameInstanceId: string;
  revision: number;
  requestingPlayerId: string;
  sourceDefinitionId: string;
  sourceInstanceId?: string;
  reason: "PARTIAL" | "MANUAL" | "UNRESOLVED_EFFECT";
  displayText: string;
  allowedOperations: Array<
    | "adjust-mana"
    | "adjust-victory-points"
    | "move-card"
    | "create-status"
    | "skip-ability"
  >;
  context: Record<string, string | number | boolean | null>;
}

/** Static catalog contract; exported here so UI code has one integration entry. */
export type { CardDefinition, GameCommand };
