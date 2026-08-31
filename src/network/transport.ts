import type { GameCommand } from "../match-engine/commands.ts";
import type { GameState } from "../domain/state/types.ts";
import { assertStateInvariants } from "../domain/state/invariants.ts";

export type TransportMessage =
  | { type: "command"; command: GameCommand }
  | { type: "snapshot"; gameInstanceId: string; revision: number; state: GameState }
  | { type: "rejection"; gameInstanceId: string; commandId: string; code: string }
  | { type: "reconnect.hello"; gameInstanceId: string; peerId: string; lastRevision: number }
  | { type: "snapshot.request"; gameInstanceId: string; peerId: string; lastRevision: number };

export interface AuthoritativeTransport {
  readonly role: "host" | "peer";
  send(message: TransportMessage): void;
  onMessage(listener: (message: TransportMessage) => void): () => void;
  close(): void;
}

export function createCommandMessage(command: GameCommand): TransportMessage {
  return { type: "command", command: structuredClone(command) };
}

export function createSnapshotMessage(state: GameState): TransportMessage {
  return { type: "snapshot", gameInstanceId: state.gameInstanceId, revision: state.revision, state: structuredClone(state) };
}

export function createReconnectHello(gameInstanceId: string, peerId: string, lastRevision = 0): TransportMessage {
  assertTransportIdentity(gameInstanceId, peerId, lastRevision);
  return { type: "reconnect.hello", gameInstanceId, peerId, lastRevision };
}

export function createSnapshotRequest(gameInstanceId: string, peerId: string, lastRevision = 0): TransportMessage {
  assertTransportIdentity(gameInstanceId, peerId, lastRevision);
  return { type: "snapshot.request", gameInstanceId, peerId, lastRevision };
}

function assertTransportIdentity(gameInstanceId: string, peerId: string, lastRevision: number): void {
  if (!gameInstanceId || !peerId) throw new Error("TRANSPORT_IDENTITY_INVALID");
  if (!Number.isInteger(lastRevision) || lastRevision < 0) throw new Error("TRANSPORT_REVISION_INVALID");
}

export function assertMessageForGame(message: TransportMessage, gameInstanceId: string): void {
  const receivedId = message.type === "command" ? message.command.gameInstanceId : message.gameInstanceId;
  if (receivedId !== gameInstanceId) throw new Error("GAME_INSTANCE_MISMATCH");
}

export function assertReconnectMessage(message: TransportMessage, expectedGameInstanceId: string): void {
  if (message.type !== "reconnect.hello" && message.type !== "snapshot.request") throw new Error("RECONNECT_MESSAGE_INVALID");
  assertMessageForGame(message, expectedGameInstanceId);
  if (!message.peerId || !Number.isInteger(message.lastRevision) || message.lastRevision < 0) throw new Error("RECONNECT_MESSAGE_INVALID");
}

export function assertSnapshotMessage(message: TransportMessage, expectedGameInstanceId: string, minimumRevision = 0): void {
  if (message.type !== "snapshot") throw new Error("SNAPSHOT_TYPE_INVALID");
  assertMessageForGame(message, expectedGameInstanceId);
  if (!Number.isInteger(message.revision) || message.revision < minimumRevision) throw new Error("SNAPSHOT_REVISION_INVALID");
  if (message.state.gameInstanceId !== message.gameInstanceId || message.state.revision !== message.revision) {
    throw new Error("SNAPSHOT_STATE_MISMATCH");
  }
  try { assertStateInvariants(message.state); } catch { throw new Error("SNAPSHOT_STATE_INVALID"); }
}

/** Rejects snapshots that cannot advance a reconnecting peer. */
export function assertFreshSnapshotMessage(message: TransportMessage, expectedGameInstanceId: string, lastRevision: number): void {
  if (!Number.isInteger(lastRevision) || lastRevision < 0) throw new Error("SNAPSHOT_REVISION_INVALID");
  assertSnapshotMessage(message, expectedGameInstanceId, lastRevision + 1);
}

export function assertCommandAuthority(command: GameCommand, role: "host" | "peer", hostOnlyTypes: readonly string[] = []): void {
  if (role === "peer" && hostOnlyTypes.includes(command.type)) throw new Error("HOST_ONLY_COMMAND");
}
