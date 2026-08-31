import type { GameState } from "../domain/state/types.ts";

export class StateRandom {
  integer(state: GameState, maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error("RNG_INVALID_RANGE");
    let value = state.rng.state >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    state.rng.state = value >>> 0;
    state.rng.draws += 1;
    return Math.floor((state.rng.state / 0x100000000) * maxExclusive);
  }
}
