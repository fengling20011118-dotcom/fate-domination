import type { GameEvent, GameState } from "../domain/state/types.ts";

export function createEvent(
  state: GameState,
  commandId: string,
  sequence: number,
  type: string,
  payload: unknown,
): GameEvent {
  return {
    eventId: `${commandId}:${sequence}`,
    type,
    revision: state.revision + 1,
    sourceCommandId: commandId,
    payload: structuredClone(payload),
  };
}
