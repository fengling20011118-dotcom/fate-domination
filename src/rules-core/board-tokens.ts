import type { GameState } from "../domain/state/types.ts";

export type BoardTokenLocationId = "workshop" | "mountain" | "city" | "scouting";

export interface BoardTokenState {
  id: string;
  sourceId: string;
  controllerPlayerId: string;
  locationId: BoardTokenLocationId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBoardTokens(state: GameState): BoardTokenState[] {
  const raw = state.modeState.boardTokens;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is BoardTokenState => isRecord(value)
    && typeof value.id === "string" && typeof value.sourceId === "string"
    && typeof value.controllerPlayerId === "string"
    && ["workshop", "mountain", "city", "scouting"].includes(String(value.locationId)))
    .map((value) => ({ ...value }));
}

export function getBoardToken(state: GameState, tokenId: string): BoardTokenState | undefined {
  return readBoardTokens(state).find((token) => token.id === tokenId);
}

/** Place or move one structured non-player board token. */
export function placeBoardToken(state: GameState, token: BoardTokenState): BoardTokenState {
  if (!token.id || !token.sourceId || !state.players[token.controllerPlayerId]
    || !["workshop", "mountain", "city", "scouting"].includes(token.locationId)) {
    throw new Error("BOARD_TOKEN_INVALID");
  }
  const tokens = readBoardTokens(state).filter((candidate) => candidate.id !== token.id);
  const stored = { ...token };
  state.modeState = { ...state.modeState, boardTokens: [...tokens, stored] };
  return stored;
}

export function moveBoardToken(state: GameState, tokenId: string, locationId: BoardTokenLocationId): BoardTokenState {
  const token = getBoardToken(state, tokenId);
  if (!token) throw new Error("BOARD_TOKEN_NOT_FOUND");
  return placeBoardToken(state, { ...token, locationId });
}
