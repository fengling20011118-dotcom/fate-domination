export type GameStatus = "lobby" | "setup" | "playing" | "finished";
export type GameMode = "standard" | "three-x";
export type PhaseId = "preparation" | "outpost" | "action" | "combat";
export type PhaseStepId =
  | "player-window"
  | "move-decision"
  | "play-batch-draft"
  | "play-batch-commit"
  | "post-power-response"
  | "settlement";

export type CardZone =
  | "master-skills"
  | "servant-skills"
  | "deck"
  | "hand"
  | "attack"
  | "discard"
  | "removed"
  | "board"
  | "event-deck"
  | "event-discard"
  | "situation-deck"
  | "situation-discard";

export interface PlayerState {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  ready: boolean;
  eliminated: boolean;
  defeated: boolean;
  masterId: string | null;
  servantId: string | null;
  identityRevealed: boolean;
  trueNameRevealed: boolean;
  /** Structured form state for abilities such as the English Jekyll card. */
  form: "jekyll" | "hyde" | null;
  locationId: string | null;
  mana: number;
  victoryPoints: number;
  commandSeals: number;
  hand: string[];
  deck: string[];
  discard: string[];
  attack: string[];
  masterSkills: string[];
  servantSkills: string[];
  statuses: string[];
  usage: Record<string, { round?: number; phase?: PhaseId; used?: boolean; usedGame?: boolean }>;
  flags: Record<string, boolean | number | string>;
}

export interface CardPowerModifier {
  id: string;
  sourceId: string;
  kind: "add" | "set";
  value: number;
  duration: "round" | "game";
}

export interface CardInstance {
  instanceId: string;
  definitionId: string;
  ownerPlayerId: string | null;
  controllerPlayerId: string | null;
  zone: CardZone;
  face: "up" | "down";
  active: boolean;
  residual: boolean;
  temporary: boolean;
  paidCost?: number;
  /** Round in which this card instance was most recently played into an attack. */
  playedRound?: number;
  modifiers: string[];
  /** Structured power changes applied by combat effects. */
  powerModifiers?: CardPowerModifier[];
  /** Card-level usage marker, independent from per-round skill usage. */
  used?: boolean;
  /** Round/phase markers for reusable card-level limits. */
  usedRound?: number;
  usedPhase?: PhaseId;
  /** Effect that created a generated/derived card instance, when applicable. */
  createdByEffectId?: string;
}

export interface BoardState {
  locations: Record<string, string[]>;
  situationDeck: string[];
  situationDiscard: string[];
  activeSituations: string[];
  eventDeck: string[];
  eventDiscard: string[];
  currentEvents: Record<string, string[]>;
  eventVisibility: Record<string, "up" | "down">;
  outpostRecords: Record<string, Array<string | null>>;
  scoutingAwardedRound: number | null;
}

export interface PendingDecision {
  decisionId: string;
  ownerPlayerId: string;
  chooserPlayerIds: string[];
  kind: string;
  options: Array<{ id: string; label: string; disabled?: boolean }>;
  min: number;
  max: number;
  allowCancel: boolean;
  continuationEffectId?: string;
  fallbackEffectId?: string;
  submissions: Record<string, string[]>;
}

export interface EffectFrame {
  effectId: string;
  handlerId: string;
  sourceId: string;
  controllerPlayerId: string | null;
  payload: unknown;
  createdAtRevision: number;
}

export interface GameEvent {
  eventId: string;
  type: string;
  revision: number;
  sourceCommandId: string;
  payload: unknown;
}

export interface GameState {
  schemaVersion: number;
  rulesPackageId: string;
  gameInstanceId: string;
  revision: number;
  status: GameStatus;
  mode: GameMode;
  modeState: Record<string, unknown>;
  round: number;
  phase: PhaseId;
  step: PhaseStepId;
  activePlayerId: string | null;
  turnOrder: string[];
  players: Record<string, PlayerState>;
  cards: Record<string, CardInstance>;
  board: BoardState;
  effectQueue: EffectFrame[];
  pendingDecision: PendingDecision | null;
  processedCommandIds: string[];
  eventLog: GameEvent[];
  rng: { seed: number; state: number; draws: number };
}

export interface GameAction {
  type: string;
  label?: string;
  payload?: unknown;
}

export interface PhasePlan {
  phases: PhaseId[];
  steps: Record<string, PhaseStepId[]>;
}

export interface VictoryStatus {
  finished: boolean;
  winnerIds: string[];
  reason: string | null;
}

export interface PublicModeState {
  modeId: GameMode;
  values: Record<string, unknown>;
}
