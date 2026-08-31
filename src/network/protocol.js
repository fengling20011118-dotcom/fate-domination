import { invariant } from "../core/errors.js";

export const NETWORK_MESSAGE_TYPES = Object.freeze({
  COMMAND: "network.command",
  SNAPSHOT_REQUEST: "network.snapshot.request",
  SNAPSHOT: "network.snapshot",
  REJECTION: "network.rejection",
});

export function createSnapshotMessage(state) {
  return {
    type: NETWORK_MESSAGE_TYPES.SNAPSHOT,
    gameInstanceId: state.gameInstanceId,
    revision: state.revision,
    state: structuredClone(state),
  };
}

export function acceptSnapshot(localState, message) {
  invariant(message?.type === NETWORK_MESSAGE_TYPES.SNAPSHOT, "SNAPSHOT_TYPE_INVALID", "消息不是状态快照。");
  invariant(
    message.gameInstanceId === localState.gameInstanceId,
    "GAME_INSTANCE_MISMATCH",
    "快照属于另一局游戏。",
  );
  invariant(message.revision >= localState.revision, "SNAPSHOT_STALE", "收到的状态快照已经过期。", {
    localRevision: localState.revision,
    receivedRevision: message.revision,
  });
  return structuredClone(message.state);
}
