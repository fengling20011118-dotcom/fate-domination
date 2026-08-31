export interface GameCommand<TPayload = unknown> {
  commandId: string;
  gameInstanceId: string;
  actorId: string;
  expectedRevision: number;
  type: string;
  payload: TPayload;
}

export function assertCommandEnvelope(command: GameCommand, state: import("../domain/state/types.ts").GameState): void {
  if (!command || typeof command !== "object") throw new Error("COMMAND_INVALID");
  if (!command.commandId || !command.actorId || !command.gameInstanceId) throw new Error("COMMAND_ENVELOPE_INVALID");
  if (!command.type || typeof command.type !== "string") throw new Error("COMMAND_TYPE_INVALID");
  if (command.payload === undefined) throw new Error("COMMAND_PAYLOAD_INVALID");
  if (command.actorId !== "host" && !state.players[command.actorId]) throw new Error("COMMAND_ACTOR_INVALID");
  if (!Number.isInteger(command.expectedRevision) || command.expectedRevision < 0) throw new Error("COMMAND_REVISION_INVALID");
  if (command.gameInstanceId !== state.gameInstanceId) throw new Error("GAME_INSTANCE_MISMATCH");
}

export const CommandType = {
  StartGame: "game.start",
  CompletePlayerWindow: "phase.player.complete",
  ResolveDecision: "decision.resolve",
  CancelDecision: "decision.cancel",
  SetDefeated: "debug.set-defeated",
  PlayCard: "card.play",
  StartStandardGame: "game.start.standard",
  DeployPlayer: "player.deploy",
  MovePlayer: "player.move",
  UseCardAbility: "card.ability.use",
  CommitAttack: "player.attack.commit",
  ResolveCombat: "combat.resolve",
  CompleteCombatResponse: "combat.response.complete",
  EndRound: "round.end",
  UseSkill: "skill.use",
  AssignIdentity: "setup.assign-identity",
  SetReady: "setup.set-ready",
  ThreeXBanMaster: "three-x.ban-master",
  ThreeXAutoBan: "three-x.auto-ban",
  ThreeXFinalizeBan: "three-x.finalize-ban",
  ThreeXCommitBan: "three-x.commit-ban",
  ThreeXSelectMaster: "three-x.select-master",
  ThreeXFinalizeMasters: "three-x.finalize-masters",
  ThreeXPurchase: "three-x.purchase",
  ThreeXFinalizePurchase: "three-x.finalize-purchase",
  ThreeXSelectServant: "three-x.select-servant",
  ThreeXFinalizeServants: "three-x.finalize-servants",
  ThreeXLockTurnOrder: "three-x.lock-turn-order",
} as const;
